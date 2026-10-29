const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { signUserToken, signTwoFactorPendingToken, verifyToken } = require("../utils/jwt");
const { requireAuth } = require("../middleware/auth");
const limits = require("../middleware/rateLimit");
const totp = require("../utils/totp");
const { TERMS_VERSION } = require("../utils/terms");
const { cancelAllSubscriptionsForUser } = require("../utils/subscriptionCleanup");
const { generateShortCode } = require("../utils/shortCode");
const { sendVerificationEmail, sendPasswordResetEmail, sendLicensePurchasedEmail } = require("../utils/email");
const { getLicenseStatusForUser } = require("../utils/licenseStatus");

const router = express.Router();

const VERIFY_CODE_TTL_MIN = 15;
const RESET_CODE_TTL_MIN = 30;
// Depois de 5 códigos errados, o código atual é invalidado (precisa pedir
// outro por e-mail). Junto com o rate limit, isso torna inviável adivinhar
// um código de 6 dígitos por tentativa e erro.
const MAX_CODE_ATTEMPTS = 5;
// Depois de 10 senhas erradas seguidas, a conta fica travada por 15 min.
const MAX_LOGIN_FAILURES = 10;
const LOGIN_LOCK_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 8;
const DUMMY_HASH = bcrypt.hashSync("senha-que-nao-existe", 10);

// Comparação de códigos em tempo constante (não vaza, pelo tempo de
// resposta, quantos dígitos estavam certos).
function codesMatch(expected, given) {
  const a = Buffer.from(String(expected || ""));
  const b = Buffer.from(String(given || "").trim());
  if (a.length === 0 || a.length !== b.length) return false;
  return require("crypto").timingSafeEqual(a, b);
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Aceita a chave com ou sem traços, maiúscula ou minúscula, com espaços
// sobrando etc., e devolve sempre no formato XXXX-XXXX-XXXX-XXXX (o mesmo
// formato salvo no banco). Se não der pra normalizar, devolve como veio,
// deixando a busca no banco simplesmente não encontrar.
function normalizeLicenseCode(code) {
  const cleaned = (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== 16) return (code || "").trim();
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}`;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    clinicName: user.clinic_name,
    status: user.status,
    emailVerified: user.email_verified,
    // Aceitou a versão ATUAL dos Termos/Política? Se não (conta antiga, ou
    // os termos mudaram), o app mostra a tela de aceite antes de liberar.
    termsAccepted: !!user.terms_accepted_at && user.terms_version === TERMS_VERSION,
    twoFactorEnabled: !!user.totp_enabled,
  };
}

// ---------- CADASTRO (com chave de licença) ----------
router.post("/register", limits.emailSendPerIp, limits.emailSendPerAccount, async (req, res) => {
  const { licenseCode, email, password, confirmPassword, name, clinicName, acceptedTerms } = req.body || {};

  if (!licenseCode || !licenseCode.trim()) {
    return res.status(400).json({ error: "Informe a chave de licença" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "E-mail inválido" });
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres` });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "As senhas não conferem" });
  }
  if (acceptedTerms !== true) {
    return res.status(400).json({ error: "Pra criar a conta, aceite os Termos de Uso e a Política de Privacidade." });
  }

  const client = await pool.connect();
  let user;
  try {
    await client.query("BEGIN");

    const { rows: existingUser } = await client.query("SELECT id FROM users WHERE email = $1", [
      email.trim().toLowerCase(),
    ]);
    if (existingUser[0]) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Já existe uma conta com esse e-mail" });
    }

    const normalizedCode = normalizeLicenseCode(licenseCode);
    const { rows: licenseRows } = await client.query(
      "SELECT * FROM licenses WHERE code = $1 FOR UPDATE",
      [normalizedCode]
    );
    const license = licenseRows[0];
    if (!license) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Chave de licença não encontrada" });
    }
    if (license.status !== "unused") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Essa chave de licença já foi utilizada" });
    }
    if (license.user_id) {
      // A chave já tem um cadastro pendente vinculado (alguém começou o
      // cadastro com ela mas nunca confirmou o e-mail) — o status continua
      // "unused" até a confirmação, então isso não significa que a chave
      // já foi ativada de verdade. O caso mais comum é a pessoa ter digitado
      // o PRÓPRIO e-mail errado da primeira vez: ela nunca vai conseguir
      // confirmar aquele e-mail (não é a caixa de entrada dela), e sem essa
      // liberação ficaria travada pra sempre vendo "chave já utilizada" ao
      // tentar de novo com o e-mail certo.
      // Só quem já tem a chave em mãos consegue chegar aqui, então é seguro
      // tratar uma nova tentativa como a mesma pessoa corrigindo o cadastro
      // anterior: apaga a conta pendente antiga (libera a chave) e segue
      // normalmente com os dados dessa tentativa nova.
      const { rows: pendingRows } = await client.query("SELECT id, email_verified FROM users WHERE id = $1", [
        license.user_id,
      ]);
      const pendingUser = pendingRows[0];
      if (pendingUser && pendingUser.email_verified) {
        // Isso não deveria acontecer (e-mail confirmado deveria ter deixado
        // o status "active"), mas por segurança: se por algum motivo o
        // e-mail já foi confirmado, trata como uso de verdade e bloqueia.
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Essa chave de licença já foi utilizada" });
      }
      if (pendingUser) {
        await client.query("DELETE FROM users WHERE id = $1", [pendingUser.id]);
      }
    }
    if (license.buyer_email && license.buyer_email !== email.trim().toLowerCase()) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        error: `Essa chave só pode ser ativada com o e-mail que a recebeu (${license.buyer_email}).`,
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verifyCode = generateShortCode();
    const verifyExpiresAt = new Date(Date.now() + VERIFY_CODE_TTL_MIN * 60 * 1000);

    const { rows: userRows } = await client.query(
      `INSERT INTO users (email, password_hash, role, name, clinic_name, email_verify_code, email_verify_expires_at, terms_accepted_at, terms_version)
       VALUES ($1, $2, 'user', $3, $4, $5, $6, now(), $7) RETURNING *`,
      [email.trim().toLowerCase(), passwordHash, name || null, clinicName || null, verifyCode, verifyExpiresAt, TERMS_VERSION]
    );
    user = userRows[0];

    // Reserva a licença pra esse usuário (ainda não ativa até confirmar o e-mail)
    await client.query("UPDATE licenses SET user_id = $1 WHERE id = $2", [user.id, license.id]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Erro ao criar a conta" });
  } finally {
    client.release();
  }

  // A partir daqui a conta JÁ FOI CRIADA e salva no banco — se o envio do
  // e-mail falhar (provedor fora do ar, credencial errada, etc.), isso não
  // pode desfazer o cadastro nem travar a resposta. Só logamos o erro; o
  // usuário sempre pode pedir um novo código pela tela de "Reenviar código".
  try {
    await sendVerificationEmail(user.email, user.email_verify_code);
  } catch (err) {
    console.error("Erro ao enviar e-mail de verificação (conta já foi criada normalmente):", err);
  }

  res.status(201).json({ success: true, email: user.email });
});

// ---------- REENVIAR CÓDIGO DE VERIFICAÇÃO ----------
// Reenvia o e-mail com a chave de licença, pra quem comprou (assinatura ou
// teste grátis) e não recebeu/perdeu esse e-mail — antes disso não existia
// nenhum jeito de pedir esse e-mail de novo. Só reenvia se achar uma licença
// AINDA NÃO ATIVADA com esse e-mail de comprador; se já tiver sido usada pra
// criar conta, a pessoa deve usar "Esqueci minha senha" em vez disso. Não
// revela se o e-mail existe ou não (mesmo padrão de privacidade das outras
// rotas de reenvio aqui).
router.post("/resend-license-key", limits.emailSendPerIp, limits.emailSendPerAccount, async (req, res) => {
  const { email } = req.body || {};
  if (!isValidEmail(email)) return res.status(400).json({ error: "E-mail inválido" });

  try {
    const { rows } = await pool.query(
      "SELECT * FROM licenses WHERE buyer_email = $1 AND status = 'unused' ORDER BY created_at DESC LIMIT 1",
      [email.trim().toLowerCase()]
    );
    const license = rows[0];
    if (license) {
      await sendLicensePurchasedEmail(email.trim(), license.code, process.env.APP_URL || "");
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao reenviar a chave de licença" });
  }
});

router.post("/resend-verification", limits.emailSendPerIp, limits.emailSendPerAccount, async (req, res) => {
  const { email } = req.body || {};
  if (!isValidEmail(email)) return res.status(400).json({ error: "E-mail inválido" });

  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]);
    const user = rows[0];
    if (!user || user.email_verified) {
      // Não revela se o e-mail existe ou já foi verificado
      return res.json({ success: true });
    }

    const verifyCode = generateShortCode();
    const verifyExpiresAt = new Date(Date.now() + VERIFY_CODE_TTL_MIN * 60 * 1000);
    await pool.query("UPDATE users SET email_verify_code = $1, email_verify_expires_at = $2, email_verify_attempts = 0 WHERE id = $3", [
      verifyCode,
      verifyExpiresAt,
      user.id,
    ]);
    await sendVerificationEmail(user.email, verifyCode);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao reenviar o código" });
  }
});

// ---------- CONFIRMAR E-MAIL ----------
router.post("/verify-email", limits.codePerIp, limits.codePerAccount, async (req, res) => {
  const { email, code } = req.body || {};
  if (!isValidEmail(email) || !code) {
    return res.status(400).json({ error: "Informe o e-mail e o código" });
  }

  const client = await pool.connect();
  let user;
  try {
    await client.query("BEGIN");

    const { rows } = await client.query("SELECT * FROM users WHERE email = $1 FOR UPDATE", [
      email.trim().toLowerCase(),
    ]);
    user = rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Conta não encontrada" });
    }
    if (user.email_verified) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Esse e-mail já foi confirmado. Faça login normalmente." });
    }
    if (
      !user.email_verify_code ||
      !user.email_verify_expires_at ||
      new Date(user.email_verify_expires_at) < new Date()
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Código inválido ou expirado. Peça um novo código." });
    }
    if (!codesMatch(user.email_verify_code, code)) {
      const attempts = (user.email_verify_attempts || 0) + 1;
      if (attempts >= MAX_CODE_ATTEMPTS) {
        await client.query(
          "UPDATE users SET email_verify_code = NULL, email_verify_expires_at = NULL, email_verify_attempts = 0 WHERE id = $1",
          [user.id]
        );
        await client.query("COMMIT");
        return res.status(400).json({ error: "Muitas tentativas erradas. Peça um novo código." });
      }
      await client.query("UPDATE users SET email_verify_attempts = $1 WHERE id = $2", [attempts, user.id]);
      await client.query("COMMIT");
      return res.status(400).json({ error: "Código inválido ou expirado. Peça um novo código." });
    }

    await client.query(
      "UPDATE users SET email_verified = true, email_verify_code = NULL, email_verify_expires_at = NULL, email_verify_attempts = 0 WHERE id = $1",
      [user.id]
    );

    // Ativa a licença reservada pra esse usuário. Se ela já veio com
    // `expires_at` definido (é o caso do trial do Stripe agora — ver
    // `createLicenseFromCheckoutSession`, que já grava a data real de fim
    // do trial na hora da compra, direto da assinatura do Stripe), NÃO
    // recalcula: o prazo de verdade já começou a contar desde o checkout,
    // não a partir de quando a pessoa decide ativar a conta (podia demorar
    // dias, e aí o Stripe cobraria antes do app achar que o trial acabou).
    // Só calcula do zero aqui pra licença que nunca teve isso definido —
    // caso das licenças geradas manualmente pelo admin.
    const { rows: licenseRows } = await client.query(
      "SELECT * FROM licenses WHERE user_id = $1 AND status = 'unused' ORDER BY created_at DESC LIMIT 1",
      [user.id]
    );
    const license = licenseRows[0];
    if (license) {
      // Vitalícia nunca expira — expires_at fica NULL de propósito (é
      // exatamente o que já faz o resto do sistema tratar como "sem prazo":
      // getLicenseStatusForUser nunca marca como expirada, e a tela de
      // Gerenciar Assinatura não mostra "dias restantes" nem data de
      // vencimento nenhuma pra quem não tem expires_at).
      const expiresAt =
        license.type === "lifetime"
          ? null
          : license.expires_at
          ? new Date(license.expires_at)
          : new Date(
              Date.now() +
                (license.type === "trial"
                  ? Number(process.env.TRIAL_DURATION_DAYS) || 7
                  : license.type === "annual"
                  ? Number(process.env.ANNUAL_DURATION_DAYS) || 365
                  : Number(process.env.LICENSE_DURATION_DAYS) || 30) *
                  24 *
                  60 *
                  60 *
                  1000
            );
      await client.query(
        "UPDATE licenses SET status = 'active', activated_at = now(), expires_at = $1 WHERE id = $2",
        [expiresAt, license.id]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Erro ao confirmar o e-mail" });
  } finally {
    client.release();
  }

  // A partir daqui a confirmação e a ativação da licença JÁ FORAM salvas —
  // qualquer erro aqui embaixo não pode mais tentar desfazer isso.
  try {
    const updatedUser = { ...user, email_verified: true };
    const token = signUserToken(updatedUser);
    const licenseStatus = await getLicenseStatusForUser(pool, user.id);
    return res.json({ token, user: publicUser(updatedUser), license: licenseStatus });
  } catch (err) {
    console.error("Erro ao montar a resposta após confirmar e-mail (conta já foi confirmada normalmente):", err);
    return res.status(500).json({
      error: "Sua conta foi confirmada, mas houve um erro ao entrar automaticamente. Tente fazer login normalmente.",
    });
  }
});

// ---------- LOGIN ----------
// Gera a resposta de "login concluído" (token + dados), usada tanto no
// login normal quanto depois do código de duas etapas.
async function completeLogin(user, res) {
  const token = signUserToken(user);
  const licenseStatus = user.role === "admin" ? null : await getLicenseStatusForUser(pool, user.id);
  // Marca o momento desse login pro painel admin ("Último acesso"). Não
  // trava a resposta se isso falhar por algum motivo — login já aconteceu.
  pool
    .query("UPDATE users SET last_login_at = now(), last_seen_at = now() WHERE id = $1", [user.id])
    .catch((err) => console.error("Erro ao atualizar last_login_at (login seguiu normalmente):", err));
  return res.json({ token, user: publicUser(user), license: licenseStatus });
}

router.post("/login", limits.loginPerIp, limits.loginPerAccount, async (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(email) || !password) {
    return res.status(400).json({ error: "Informe e-mail e senha" });
  }

  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]);
    const user = rows[0];
    if (!user) {
      // Mesmo custo de tempo de uma conta que existe (não revela, pelo
      // tempo de resposta, se o e-mail tem conta).
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ error: "E-mail ou senha inválidos" });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(429).json({
        error: `Muitas tentativas de senha errada. Por segurança, essa conta está travada por alguns minutos — tente de novo depois, ou use "Esqueci minha senha".`,
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const failures = (user.failed_login_attempts || 0) + 1;
      if (failures >= MAX_LOGIN_FAILURES) {
        await pool.query(
          `UPDATE users SET failed_login_attempts = 0, locked_until = now() + interval '${LOGIN_LOCK_MINUTES} minutes' WHERE id = $1`,
          [user.id]
        );
      } else {
        await pool.query("UPDATE users SET failed_login_attempts = $1 WHERE id = $2", [failures, user.id]);
      }
      return res.status(401).json({ error: "E-mail ou senha inválidos" });
    }
    if (user.failed_login_attempts || user.locked_until) {
      await pool.query("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1", [user.id]);
    }

    if (user.status === "blocked") {
      return res.status(403).json({ error: "Essa conta está bloqueada. Entre em contato com o suporte." });
    }
    if (!user.email_verified) {
      return res.status(403).json({
        error: "Confirme seu e-mail antes de entrar.",
        needsVerification: true,
        email: user.email,
      });
    }

    // Verificação em duas etapas ligada: a senha certa sozinha não basta —
    // devolve um token temporário (5 min) que só serve pra mandar o código
    // do app autenticador em /login/2fa.
    if (user.totp_enabled && user.totp_secret) {
      return res.json({ twoFactorRequired: true, pendingToken: signTwoFactorPendingToken(user) });
    }

    return completeLogin(user, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao entrar" });
  }
});

// Segunda etapa do login (código de 6 dígitos do app autenticador).
router.post("/login/2fa", limits.codePerIp, async (req, res) => {
  const { pendingToken, code } = req.body || {};
  let payload;
  try {
    payload = verifyToken(pendingToken);
  } catch (err) {
    return res.status(401).json({ error: "O tempo pra digitar o código acabou. Entre com a senha de novo." });
  }
  if (!payload || !payload.twoFactorPending) {
    return res.status(401).json({ error: "Sessão inválida. Entre com a senha de novo." });
  }
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [payload.twoFactorPending]);
    const user = rows[0];
    if (!user || (user.token_version || 0) !== (payload.tv || 0) || user.status === "blocked") {
      return res.status(401).json({ error: "Sessão inválida. Entre com a senha de novo." });
    }
    if (!user.totp_enabled || !totp.verifyCode(user.totp_secret, code)) {
      const failures = (user.failed_login_attempts || 0) + 1;
      if (failures >= MAX_LOGIN_FAILURES) {
        await pool.query(
          `UPDATE users SET failed_login_attempts = 0, locked_until = now() + interval '${LOGIN_LOCK_MINUTES} minutes' WHERE id = $1`,
          [user.id]
        );
      } else {
        await pool.query("UPDATE users SET failed_login_attempts = $1 WHERE id = $2", [failures, user.id]);
      }
      return res.status(400).json({ error: "Código incorreto. Confira o app autenticador e tente de novo." });
    }
    return completeLogin(user, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao entrar" });
  }
});

// ---------- ESQUECI MINHA SENHA ----------
router.post("/forgot-password", limits.emailSendPerIp, limits.emailSendPerAccount, async (req, res) => {
  const { email } = req.body || {};
  if (!isValidEmail(email)) return res.status(400).json({ error: "E-mail inválido" });

  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]);
    const user = rows[0];

    // Resposta genérica sempre, pra não revelar se o e-mail existe ou não
    if (user) {
      const resetCode = generateShortCode();
      const resetExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MIN * 60 * 1000);
      await pool.query("UPDATE users SET password_reset_code = $1, password_reset_expires_at = $2, password_reset_attempts = 0 WHERE id = $3", [
        resetCode,
        resetExpiresAt,
        user.id,
      ]);
      await sendPasswordResetEmail(user.email, resetCode);
    }

    res.json({ success: true, message: "Se esse e-mail existir na nossa base, enviamos um código pra ele." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao processar o pedido" });
  }
});

// ---------- REDEFINIR SENHA ----------
router.post("/reset-password", limits.codePerIp, limits.codePerAccount, async (req, res) => {
  const { email, code, newPassword, confirmPassword } = req.body || {};
  if (!isValidEmail(email) || !code) {
    return res.status(400).json({ error: "Informe o e-mail e o código" });
  }
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres` });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "As senhas não conferem" });
  }

  const genericError = "Código inválido ou expirado. Peça um novo código.";
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]);
    const user = rows[0];
    if (
      !user ||
      !user.password_reset_code ||
      !user.password_reset_expires_at ||
      new Date(user.password_reset_expires_at) < new Date()
    ) {
      return res.status(400).json({ error: genericError });
    }
    if (!codesMatch(user.password_reset_code, code)) {
      const attempts = (user.password_reset_attempts || 0) + 1;
      if (attempts >= MAX_CODE_ATTEMPTS) {
        await pool.query(
          "UPDATE users SET password_reset_code = NULL, password_reset_expires_at = NULL, password_reset_attempts = 0 WHERE id = $1",
          [user.id]
        );
        return res.status(400).json({ error: "Muitas tentativas erradas. Peça um novo código." });
      }
      await pool.query("UPDATE users SET password_reset_attempts = $1 WHERE id = $2", [attempts, user.id]);
      return res.status(400).json({ error: genericError });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    // Senha nova: também destrava a conta (se estava travada por senha
    // errada) e derruba TODAS as sessões abertas em qualquer aparelho —
    // se alguém tinha roubado a sessão, perde o acesso aqui.
    await pool.query(
      `UPDATE users SET password_hash = $1, password_reset_code = NULL, password_reset_expires_at = NULL,
         password_reset_attempts = 0, failed_login_attempts = 0, locked_until = NULL,
         token_version = token_version + 1
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao redefinir a senha" });
  }
});

// ---------- TROCAR SENHA (logado, sabendo a senha atual) ----------
// Derruba as sessões dos OUTROS aparelhos e devolve um token novo pra esse
// aparelho continuar logado.
router.post("/change-password", requireAuth, limits.codePerIp, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres` });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "As senhas não conferem" });
  }
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.sub]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(String(currentPassword || ""), user.password_hash))) {
      return res.status(400).json({ error: "Senha atual incorreta" });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const { rows: updated } = await pool.query(
      "UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING *",
      [passwordHash, user.id]
    );
    res.json({ success: true, token: signUserToken(updated[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao trocar a senha" });
  }
});

// ---------- ACEITAR TERMOS (contas antigas / termos atualizados) ----------
router.post("/accept-terms", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE users SET terms_accepted_at = now(), terms_version = $1 WHERE id = $2 RETURNING *",
      [TERMS_VERSION, req.user.sub]
    );
    res.json({ success: true, user: publicUser(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao registrar o aceite" });
  }
});

// ---------- LGPD: EXPORTAR TODOS OS MEUS DADOS ----------
// Direito de portabilidade/acesso: devolve tudo que o Precifica guarda da
// conta (perfil, assinatura, procedimentos, materiais, pacientes,
// orçamentos, configurações) num JSON só. Funciona mesmo com a assinatura
// vencida — os dados são da pessoa.
router.get("/export", requireAuth, async (req, res) => {
  try {
    const { rows: userRows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.sub]);
    const user = userRows[0];
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    const { rows: dataRows } = await pool.query("SELECT key, value, updated_at FROM app_data WHERE user_id = $1", [user.id]);
    const { rows: budgetRows } = await pool.query(
      "SELECT data FROM budgets WHERE user_id = $1 ORDER BY created_at DESC",
      [user.id]
    );
    const { rows: licenseRows } = await pool.query(
      "SELECT code, status, type, activated_at, expires_at, created_at, cancel_at_period_end FROM licenses WHERE user_id = $1 ORDER BY created_at DESC",
      [user.id]
    );
    const data = {};
    dataRows.forEach((r) => {
      if (r.key === "budgetHistory_migrated") return;
      try {
        data[r.key] = JSON.parse(r.value);
      } catch (e) {
        data[r.key] = r.value;
      }
    });
    data.budgetHistory = budgetRows.map((r) => {
      try {
        return JSON.parse(r.data);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    res.setHeader("Content-Disposition", `attachment; filename="precifica-meus-dados.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      account: {
        email: user.email,
        name: user.name,
        clinicName: user.clinic_name,
        createdAt: user.created_at,
        termsAcceptedAt: user.terms_accepted_at,
        termsVersion: user.terms_version,
      },
      licenses: licenseRows,
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao exportar os dados" });
  }
});

// ---------- LGPD: EXCLUIR MINHA CONTA ----------
// Exige a senha (confirmação). Cancela a assinatura no Stripe na hora (pra
// não continuar cobrando), revoga a licença e apaga a conta — os dados do
// simulador (app_data, budgets) somem junto (ON DELETE CASCADE). A licença
// fica guardada sem dono, como registro financeiro da compra.
router.post("/delete-account", requireAuth, limits.codePerIp, async (req, res) => {
  const { password } = req.body || {};
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.sub]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    if (user.role === "admin") {
      return res.status(400).json({ error: "A conta de administrador não pode ser excluída por aqui." });
    }
    if (!(await bcrypt.compare(String(password || ""), user.password_hash))) {
      return res.status(400).json({ error: "Senha incorreta" });
    }
    const cleanup = await cancelAllSubscriptionsForUser(user.id);
    if (!cleanup.ok) {
      return res.status(502).json({
        error:
          "Não conseguimos cancelar sua assinatura no sistema de pagamento agora, então a conta não foi excluída (pra você não continuar sendo cobrado). Tente de novo em alguns minutos ou fale com o suporte.",
      });
    }
    await pool.query("UPDATE licenses SET status = 'revoked', cancelled_at = COALESCE(cancelled_at, now()) WHERE user_id = $1", [user.id]);
    await pool.query("DELETE FROM users WHERE id = $1", [user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao excluir a conta" });
  }
});

// ---------- VERIFICAÇÃO EM DUAS ETAPAS (app autenticador) ----------
// Passo 1: gera um segredo novo (ainda NÃO ligado) e devolve o QR code.
router.post("/2fa/setup", requireAuth, async (req, res) => {
  try {
    const secret = totp.generateSecret();
    await pool.query("UPDATE users SET totp_pending_secret = $1 WHERE id = $2", [secret, req.user.sub]);
    const url = totp.otpauthUrl(secret, req.user.email);
    const qrDataUrl = await require("qrcode").toDataURL(url, { margin: 1, width: 220 });
    res.json({ secret, otpauthUrl: url, qrDataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao preparar a verificação em duas etapas" });
  }
});

// Passo 2: confirma com um código do app — só aí liga de verdade.
router.post("/2fa/enable", requireAuth, limits.codePerIp, async (req, res) => {
  const { code } = req.body || {};
  try {
    const { rows } = await pool.query("SELECT totp_pending_secret FROM users WHERE id = $1", [req.user.sub]);
    const pending = rows[0] && rows[0].totp_pending_secret;
    if (!pending) return res.status(400).json({ error: "Comece a configuração de novo." });
    if (!totp.verifyCode(pending, code)) {
      return res.status(400).json({ error: "Código incorreto. Confira o app autenticador e tente de novo." });
    }
    await pool.query(
      "UPDATE users SET totp_secret = totp_pending_secret, totp_pending_secret = NULL, totp_enabled = true WHERE id = $1",
      [req.user.sub]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao ligar a verificação em duas etapas" });
  }
});

// Desligar exige senha + código atual.
router.post("/2fa/disable", requireAuth, limits.codePerIp, async (req, res) => {
  const { password, code } = req.body || {};
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.sub]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(String(password || ""), user.password_hash))) {
      return res.status(400).json({ error: "Senha incorreta" });
    }
    if (user.totp_enabled && !totp.verifyCode(user.totp_secret, code)) {
      return res.status(400).json({ error: "Código incorreto" });
    }
    await pool.query(
      "UPDATE users SET totp_enabled = false, totp_secret = NULL, totp_pending_secret = NULL WHERE id = $1",
      [user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao desligar a verificação em duas etapas" });
  }
});

// ---------- DADOS DO USUÁRIO LOGADO (revalidação de sessão/licença) ----------
router.get("/me", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.sub]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    if (user.status === "blocked") {
      return res.status(403).json({ error: "Conta bloqueada" });
    }

    const licenseStatus = user.role === "admin" ? null : await getLicenseStatusForUser(pool, user.id);
    res.json({ user: publicUser(user), license: licenseStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar os dados" });
  }
});

module.exports = router;

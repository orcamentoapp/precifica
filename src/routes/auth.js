const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const { signUserToken } = require("../utils/jwt");
const { requireAuth } = require("../middleware/auth");
const { generateShortCode } = require("../utils/shortCode");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../utils/email");
const { getLicenseStatusForUser } = require("../utils/licenseStatus");

const router = express.Router();

const VERIFY_CODE_TTL_MIN = 15;
const RESET_CODE_TTL_MIN = 30;

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
  };
}

// ---------- CADASTRO (com chave de licença) ----------
router.post("/register", async (req, res) => {
  const { licenseCode, email, password, confirmPassword, name, clinicName } = req.body || {};

  if (!licenseCode || !licenseCode.trim()) {
    return res.status(400).json({ error: "Informe a chave de licença" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "E-mail inválido" });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres" });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "As senhas não conferem" });
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
    if (license.status !== "unused" || license.user_id) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Essa chave de licença já foi utilizada" });
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
      `INSERT INTO users (email, password_hash, role, name, clinic_name, email_verify_code, email_verify_expires_at)
       VALUES ($1, $2, 'user', $3, $4, $5, $6) RETURNING *`,
      [email.trim().toLowerCase(), passwordHash, name || null, clinicName || null, verifyCode, verifyExpiresAt]
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
router.post("/resend-verification", async (req, res) => {
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
    await pool.query("UPDATE users SET email_verify_code = $1, email_verify_expires_at = $2 WHERE id = $3", [
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
router.post("/verify-email", async (req, res) => {
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
      user.email_verify_code !== String(code).trim() ||
      !user.email_verify_expires_at ||
      new Date(user.email_verify_expires_at) < new Date()
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Código inválido ou expirado. Peça um novo código." });
    }

    await client.query(
      "UPDATE users SET email_verified = true, email_verify_code = NULL, email_verify_expires_at = NULL WHERE id = $1",
      [user.id]
    );

    // Ativa a licença reservada pra esse usuário
    const { rows: licenseRows } = await client.query(
      "SELECT * FROM licenses WHERE user_id = $1 AND status = 'unused' ORDER BY created_at DESC LIMIT 1",
      [user.id]
    );
    const license = licenseRows[0];
    if (license) {
      const licenseDurationDays =
        license.type === "trial"
          ? Number(process.env.TRIAL_DURATION_DAYS) || 7
          : license.type === "annual"
          ? Number(process.env.ANNUAL_DURATION_DAYS) || 365
          : Number(process.env.LICENSE_DURATION_DAYS) || 30;
      const expiresAt = new Date(Date.now() + licenseDurationDays * 24 * 60 * 60 * 1000);
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
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(email) || !password) {
    return res.status(400).json({ error: "Informe e-mail e senha" });
  }

  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "E-mail ou senha inválidos" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "E-mail ou senha inválidos" });

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

    const token = signUserToken(user);
    const licenseStatus = user.role === "admin" ? null : await getLicenseStatusForUser(pool, user.id);

    res.json({ token, user: publicUser(user), license: licenseStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao entrar" });
  }
});

// ---------- ESQUECI MINHA SENHA ----------
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body || {};
  if (!isValidEmail(email)) return res.status(400).json({ error: "E-mail inválido" });

  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]);
    const user = rows[0];

    // Resposta genérica sempre, pra não revelar se o e-mail existe ou não
    if (user) {
      const resetCode = generateShortCode();
      const resetExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MIN * 60 * 1000);
      await pool.query("UPDATE users SET password_reset_code = $1, password_reset_expires_at = $2 WHERE id = $3", [
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
router.post("/reset-password", async (req, res) => {
  const { email, code, newPassword, confirmPassword } = req.body || {};
  if (!isValidEmail(email) || !code) {
    return res.status(400).json({ error: "Informe o e-mail e o código" });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "A nova senha precisa ter pelo menos 6 caracteres" });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "As senhas não conferem" });
  }

  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.trim().toLowerCase()]);
    const user = rows[0];
    if (
      !user ||
      !user.password_reset_code ||
      user.password_reset_code !== String(code).trim() ||
      !user.password_reset_expires_at ||
      new Date(user.password_reset_expires_at) < new Date()
    ) {
      return res.status(400).json({ error: "Código inválido ou expirado. Peça um novo código." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password_hash = $1, password_reset_code = NULL, password_reset_expires_at = NULL WHERE id = $2",
      [passwordHash, user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao redefinir a senha" });
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

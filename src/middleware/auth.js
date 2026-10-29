const pool = require("../db");
const { verifyToken } = require("../utils/jwt");
const { isLicenseValidNow } = require("../utils/licenseStatus");

function getTokenFromHeader(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

// Marca "visto por último agora" em toda requisição autenticada — é o que
// alimenta o "Online agora" do painel admin (alguém só aparece online se
// tiver feito alguma chamada à API nos últimos minutos, não depende de
// nenhuma tela específica estar aberta). Sem throttle isso viraria um
// UPDATE a cada requisição do app inteiro (autosave, troca de aba, etc.),
// então só grava de novo se já fez ~1 minuto desde a última vez — guardado
// em memória do próprio processo, não precisa de tabela nem cache externo
// pra isso. É "fire and forget": nunca atrasa nem derruba a requisição
// original se a atualização falhar.
const lastSeenWrittenAt = new Map(); // userId -> timestamp (ms) da última gravação
const LAST_SEEN_THROTTLE_MS = 60 * 1000;
function touchLastSeen(userId) {
  if (!userId) return;
  const now = Date.now();
  const last = lastSeenWrittenAt.get(userId) || 0;
  if (now - last < LAST_SEEN_THROTTLE_MS) return;
  lastSeenWrittenAt.set(userId, now);
  pool
    .query("UPDATE users SET last_seen_at = now() WHERE id = $1", [userId])
    .catch((err) => console.error("Erro ao atualizar last_seen_at:", err));
}

// Exige qualquer usuário autenticado (admin ou não).
//
// Além de conferir a assinatura do token, consulta o banco a cada
// requisição pra garantir que:
// - a conta ainda existe e NÃO está bloqueada (antes, um usuário bloqueado
//   continuava usando o app por até 30 dias com o token antigo);
// - o token não foi invalidado por troca/redefinição de senha ou bloqueio
//   (`token_version` no banco sobe +1 nesses casos — ver
//   bumpTokenVersion — e o token carrega a versão de quando foi emitido;
//   tokens emitidos antes dessa mudança não têm `tv` e contam como 0);
// - o papel (admin/usuário) vem do BANCO, não do que está escrito no token.
async function requireAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ error: "Não autenticado" });
  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Sessão inválida ou expirada. Faça login novamente." });
  }
  try {
    const { rows } = await pool.query("SELECT id, email, role, status, token_version FROM users WHERE id = $1", [
      payload.sub,
    ]);
    const user = rows[0];
    if (!user || (user.token_version || 0) !== (payload.tv || 0)) {
      return res.status(401).json({ error: "Sessão inválida ou expirada. Faça login novamente." });
    }
    if (user.status === "blocked") {
      return res.status(403).json({ error: "Conta bloqueada", blocked: true });
    }
    req.user = { ...payload, sub: user.id, email: user.email, role: user.role };
    touchLastSeen(user.id);
    next();
  } catch (err) {
    console.error("Erro ao validar sessão:", err);
    return res.status(500).json({ error: "Erro ao validar a sessão. Tente novamente." });
  }
}

// Exige usuário autenticado E com papel de admin
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Acesso restrito ao administrador" });
    }
    next();
  });
}

// Exige licença válida (não vencida/revogada) — usado nas rotas que GRAVAM
// dados do simulador. Antes, a licença só era checada no navegador, então
// dava pra contornar o bloqueio chamando a API direto. Admin passa sempre.
async function requireValidLicense(req, res, next) {
  if (req.user && req.user.role === "admin") return next();
  try {
    const { rows } = await pool.query(
      "SELECT status, expires_at, stripe_subscription_id, cancel_at_period_end FROM licenses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [req.user.sub]
    );
    if (!isLicenseValidNow(rows[0])) {
      return res.status(402).json({ error: "Sua assinatura não está ativa. Renove pra continuar salvando.", licenseInvalid: true });
    }
    next();
  } catch (err) {
    console.error("Erro ao checar licença:", err);
    return res.status(500).json({ error: "Erro ao checar a assinatura. Tente novamente." });
  }
}

// Invalida TODOS os tokens já emitidos dessa conta (todos os aparelhos).
// Aceita um client de transação ou o pool.
async function bumpTokenVersion(db, userId) {
  const { rows } = await db.query(
    "UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version",
    [userId]
  );
  return rows[0] ? rows[0].token_version : null;
}

module.exports = { requireAuth, requireAdmin, requireValidLicense, bumpTokenVersion };

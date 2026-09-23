const pool = require("../db");
const { verifyToken } = require("../utils/jwt");

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

// Exige qualquer usuário autenticado (admin ou não)
function requireAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ error: "Não autenticado" });
  try {
    req.user = verifyToken(token);
    touchLastSeen(req.user.sub);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Sessão inválida ou expirada. Faça login novamente." });
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

module.exports = { requireAuth, requireAdmin };

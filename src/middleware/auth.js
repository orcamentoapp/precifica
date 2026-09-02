const { verifyToken } = require("../utils/jwt");

function getTokenFromHeader(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

// Exige qualquer usuário autenticado (admin ou não)
function requireAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ error: "Não autenticado" });
  try {
    req.user = verifyToken(token);
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

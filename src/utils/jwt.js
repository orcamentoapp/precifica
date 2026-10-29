const jwt = require("jsonwebtoken");

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não configurado no ambiente");
  return secret;
}

// Um único tipo de token pra qualquer usuário (admin ou não) — o "role"
// dentro do token é o que decide o que a pessoa pode ver/fazer.
function signUserToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role, tv: user.token_version || 0 }, getSecret(), {
    expiresIn: "30d",
  });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: ["HS256"] });
}

// Token curto (5 min) usado só entre "senha certa" e "código do app
// autenticador" no login do admin com verificação em duas etapas — não dá
// acesso a nada sozinho (requireAuth recusa, porque não tem `sub` de sessão).
function signTwoFactorPendingToken(user) {
  return jwt.sign({ twoFactorPending: user.id, tv: user.token_version || 0 }, getSecret(), { expiresIn: "5m" });
}

module.exports = { signUserToken, verifyToken, signTwoFactorPendingToken };

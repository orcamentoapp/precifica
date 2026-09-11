const jwt = require("jsonwebtoken");

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não configurado no ambiente");
  return secret;
}

// Um único tipo de token pra qualquer usuário (admin ou não) — o "role"
// dentro do token é o que decide o que a pessoa pode ver/fazer.
function signUserToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, getSecret(), {
    expiresIn: "30d",
  });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

module.exports = { signUserToken, verifyToken };

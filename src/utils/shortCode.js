const crypto = require("crypto");

// Código numérico de 6 dígitos, fácil de digitar (verificação de e-mail, reset de senha)
function generateShortCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

module.exports = { generateShortCode };

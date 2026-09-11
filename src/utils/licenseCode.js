const crypto = require("crypto");

// Alfabeto sem caracteres fáceis de confundir (sem 0/O, 1/I/L)
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// Gera um código sempre no mesmo padrão: 4 grupos de 4 caracteres
// (letras maiúsculas e números), ex: XK7P-4G2M-QW9T-3RN8
function generateLicenseCode() {
  function group() {
    let s = "";
    for (let i = 0; i < 4; i++) {
      s += CHARSET[crypto.randomInt(0, CHARSET.length)];
    }
    return s;
  }
  return `${group()}-${group()}-${group()}-${group()}`;
}

module.exports = { generateLicenseCode };

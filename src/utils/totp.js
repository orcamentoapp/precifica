// Verificação em duas etapas (TOTP — o mesmo padrão do Google
// Authenticator, Microsoft Authenticator, Authy, 1Password etc.).
// Implementado direto com o `crypto` do Node (RFC 6238), sem dependência
// extra: código de 6 dígitos que muda a cada 30 segundos.
const crypto = require("crypto");

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function codeAt(secret, step) {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(bin).padStart(6, "0");
}

// Aceita o código atual e o de 30s antes/depois (relógio do celular um
// pouco adiantado/atrasado). Comparação em tempo constante.
function verifyCode(secret, code, now = Date.now()) {
  const clean = String(code || "").replace(/\D/g, "");
  if (!secret || clean.length !== 6) return false;
  const step = Math.floor(now / 1000 / 30);
  for (const delta of [-1, 0, 1]) {
    const expected = codeAt(secret, step + delta);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
}

function otpauthUrl(secret, email) {
  const issuer = "Precifica";
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = { generateSecret, verifyCode, otpauthUrl, codeAt };

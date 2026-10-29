// Limites de tentativas (rate limit) — proteção contra robôs tentando
// adivinhar senha/código, ou lotando a caixa de e-mail de alguém.
//
// Guardado em memória do próprio processo (o Precifica roda em 1 instância
// só no Railway). Se um dia rodar com várias instâncias, trocar o "store"
// por um compartilhado (Redis/Postgres) — senão cada instância conta
// separado.
//
// IMPORTANTE: depende de `app.set("trust proxy", 1)` no server.js — o
// Railway fica atrás de um proxy, e sem isso todo mundo apareceria com o
// mesmo IP (o do proxy), bloqueando todos os clientes juntos.
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const MESSAGE = "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.";

function make({ windowMinutes, max, keyByEmail = false, message = MESSAGE }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Por e-mail + IP quando faz sentido (login/códigos): um robô atacando
    // UMA conta é barrado rápido, sem travar outras pessoas do mesmo IP
    // (ex: clínica com vários computadores na mesma internet).
    keyGenerator: keyByEmail
      ? (req) => {
          const email = String((req.body && req.body.email) || "").trim().toLowerCase();
          return `${ipKeyGenerator(req.ip)}|${email}`;
        }
      : undefined,
    handler: (req, res) => res.status(429).json({ error: message }),
  });
}

// Geral, pra toda a API — folgado o suficiente pra nunca atrapalhar uso
// normal (autosave, trocar de aba etc.), só barra abuso grosseiro.
const apiLimiter = make({ windowMinutes: 1, max: 300 });

// Login: por conta (e-mail+IP) e um teto por IP.
const loginPerAccount = make({ windowMinutes: 15, max: 10, keyByEmail: true });
const loginPerIp = make({ windowMinutes: 15, max: 50 });

// Digitação de código de 6 dígitos (confirmar e-mail / redefinir senha).
// Além disso, o próprio código é invalidado depois de 5 erros (ver
// auth.js) — os dois juntos tornam inviável adivinhar.
const codePerAccount = make({ windowMinutes: 15, max: 10, keyByEmail: true });
const codePerIp = make({ windowMinutes: 15, max: 30 });

// Qualquer rota que DISPARA e-mail (esqueci senha, reenviar código, reenviar
// chave, cadastro) — evita usar o Precifica pra lotar a caixa de alguém.
const emailSendPerAccount = make({ windowMinutes: 60, max: 5, keyByEmail: true });
const emailSendPerIp = make({ windowMinutes: 60, max: 20 });

// Contato com o suporte (logado).
const supportLimiter = make({ windowMinutes: 60, max: 10 });

// Criar sessão de checkout no Stripe.
const checkoutLimiter = make({ windowMinutes: 15, max: 15 });

module.exports = {
  apiLimiter,
  loginPerAccount,
  loginPerIp,
  codePerAccount,
  codePerIp,
  emailSendPerAccount,
  emailSendPerIp,
  supportLimiter,
  checkoutLimiter,
};

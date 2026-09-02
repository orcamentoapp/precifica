const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { createCheckoutSession, cancelSubscriptionAtPeriodEnd } = require("../utils/stripe");
const { createOneTimePaymentPreference } = require("../utils/mercadopago");
const { mercadopagoWebhookHandler } = require("./mercadopagoWebhook");

const router = express.Router();

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- ASSINATURA por cartão (rota pública, chamada pela página de compra) ----------
// body: { email, plan: "monthly" | "annual", trial: boolean }
router.post("/stripe/checkout", async (req, res) => {
  const { email, plan, trial } = req.body || {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "E-mail inválido" });
  }
  const safePlan = plan === "annual" ? "annual" : "monthly";

  try {
    const { rows: existingUser } = await pool.query("SELECT id FROM users WHERE email = $1", [
      email.trim().toLowerCase(),
    ]);
    if (existingUser[0]) {
      return res
        .status(409)
        .json({ error: "Já existe uma conta com esse e-mail. Faça login em vez de assinar de novo." });
    }

    const session = await createCheckoutSession({ email: email.trim(), plan: safePlan, trial: !!trial });
    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Erro ao criar checkout Stripe:", err.message);
    res.status(500).json({ error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." });
  }
});

// ---------- CANCELAR a renovação automática da assinatura (cartão) ----------
// Não tira o acesso na hora — só impede a próxima cobrança. A pessoa
// continua podendo usar até a data de expiração que já tinha pago.
router.post("/stripe/cancel-subscription", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM licenses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [req.user.sub]
    );
    const license = rows[0];
    if (!license || !license.stripe_subscription_id) {
      return res.status(400).json({ error: "Você não tem uma assinatura por cartão ativa pra cancelar." });
    }
    await cancelSubscriptionAtPeriodEnd(license.stripe_subscription_id);
    res.json({ success: true, expiresAt: license.expires_at });
  } catch (err) {
    console.error("Erro ao cancelar assinatura Stripe:", err.message);
    res.status(500).json({ error: "Não foi possível cancelar agora. Tente novamente em instantes." });
  }
});

// ---------- PAGAMENTO ÚNICO via Mercado Pago (Pix/Boleto/cartão avulso) ----------
// Rota pública (compra nova, sem conta ainda) — body: { email, plan }
router.post("/mercadopago/checkout", async (req, res) => {
  const { email, plan } = req.body || {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "E-mail inválido" });
  }
  const safePlan = plan === "annual" ? "annual" : "monthly";
  try {
    const { rows: existingUser } = await pool.query("SELECT id FROM users WHERE email = $1", [
      email.trim().toLowerCase(),
    ]);
    if (existingUser[0]) {
      return res
        .status(409)
        .json({ error: "Já existe uma conta com esse e-mail. Faça login em vez de comprar de novo." });
    }

    const checkoutUrl = await createOneTimePaymentPreference({ email: email.trim(), plan: safePlan });
    res.json({ checkoutUrl });
  } catch (err) {
    console.error("Erro ao criar pagamento Mercado Pago:", err.message);
    res.status(500).json({ error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." });
  }
});

// Rota autenticada (renovação de quem já está logado) — body: { plan }
router.post("/mercadopago/renew-checkout", requireAuth, async (req, res) => {
  const { plan } = req.body || {};
  const safePlan = plan === "annual" ? "annual" : "monthly";
  try {
    const checkoutUrl = await createOneTimePaymentPreference({
      email: req.user.email,
      plan: safePlan,
      userId: req.user.sub,
    });
    res.json({ checkoutUrl });
  } catch (err) {
    console.error("Erro ao criar pagamento de renovação Mercado Pago:", err.message);
    res.status(500).json({ error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." });
  }
});

// Webhook do Mercado Pago (chamado pelo próprio Mercado Pago, não pelo app)
router.post("/mercadopago/webhook", mercadopagoWebhookHandler);

module.exports = router;

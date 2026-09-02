const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const {
  createCheckoutSession,
  createOneTimePaymentCheckout,
  cancelSubscriptionAtPeriodEnd,
} = require("../utils/stripe");

const router = express.Router();

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- INICIAR ASSINATURA (rota pública, chamada pela página de compra) ----------
// body: { email, plan: "monthly" | "annual", trial: boolean, method: "card" | "pix_boleto" }
router.post("/stripe/checkout", async (req, res) => {
  const { email, plan, trial, method } = req.body || {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "E-mail inválido" });
  }
  const safePlan = plan === "annual" ? "annual" : "monthly";

  try {
    // Pix/Boleto é sempre pagamento único (nenhum dos dois é cobrado de novo
    // sozinho) — não faz sentido com trial, então trial é ignorado aqui.
    if (method === "pix_boleto") {
      const session = await createOneTimePaymentCheckout({ email: email.trim(), plan: safePlan });
      return res.json({ checkoutUrl: session.url });
    }
    const session = await createCheckoutSession({ email: email.trim(), plan: safePlan, trial: !!trial });
    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Erro ao criar checkout Stripe:", err.message);
    res.status(500).json({ error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." });
  }
});

// ---------- RENOVAR (rota autenticada, chamada de dentro do app já logado) ----------
// body: { plan: "monthly" | "annual" } — pagamento único via Pix/Boleto/cartão
// que soma +30 ou +365 dias na licença de quem já está logado.
router.post("/stripe/renew-checkout", requireAuth, async (req, res) => {
  const { plan } = req.body || {};
  const safePlan = plan === "annual" ? "annual" : "monthly";
  try {
    const session = await createOneTimePaymentCheckout({
      email: req.user.email,
      plan: safePlan,
      userId: req.user.sub,
    });
    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Erro ao criar checkout de renovação:", err.message);
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

module.exports = router;

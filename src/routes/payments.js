const express = require("express");
const { createCheckoutSession } = require("../utils/stripe");

const router = express.Router();

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- INICIAR ASSINATURA (rota pública, chamada pela página de compra) ----------
// body: { name, email, plan: "monthly" | "annual", trial: boolean }
router.post("/stripe/checkout", async (req, res) => {
  const { name, email, plan, trial } = req.body || {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "E-mail inválido" });
  }
  const safePlan = plan === "annual" ? "annual" : "monthly";

  try {
    const session = await createCheckoutSession({ email: email.trim(), name, plan: safePlan, trial: !!trial });
    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Erro ao criar checkout Stripe:", err.message);
    res.status(500).json({ error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." });
  }
});

module.exports = router;

const express = require("express");
const { createCheckoutSession } = require("../utils/stripe");

const router = express.Router();

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- INICIAR ASSINATURA (rota pública, chamada pela página de compra) ----------
router.post("/stripe/checkout", async (req, res) => {
  const { name, email } = req.body || {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "E-mail inválido" });
  }

  try {
    const session = await createCheckoutSession({ email: email.trim(), name });
    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Erro ao criar checkout Stripe:", err.message);
    res.status(500).json({ error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." });
  }
});

module.exports = router;

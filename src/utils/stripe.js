// Integração com o Stripe — só o que o Precifica precisa: criar uma sessão
// de checkout (página de pagamento hospedada pelo Stripe) pra assinatura mensal.
const Stripe = require("stripe");

function getClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY não configurado no ambiente");
  return new Stripe(key);
}

// Não especificamos "payment_method_types" de propósito — assim o Stripe
// mostra automaticamente as formas de pagamento habilitadas no painel da
// sua conta (Configurações → Métodos de pagamento). Cartão e boleto já
// funcionam de cara pra contas do Brasil; o Pix depende de liberação da
// Stripe pra contas brasileiras (veja a nota no README).
async function createCheckoutSession({ email, name }) {
  const stripe = getClient();
  const price = Number(process.env.PRECIFICA_MONTHLY_PRICE) || 97;
  const appUrl = process.env.APP_URL || "";

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: "brl",
          unit_amount: Math.round(price * 100), // Stripe trabalha em centavos
          recurring: { interval: "month" },
          product_data: { name: "Precifica — Assinatura mensal" },
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/?checkout=sucesso`,
    cancel_url: `${appUrl}/?checkout=cancelado`,
    metadata: { name: name || "" },
  });
}

module.exports = { getClient, createCheckoutSession };

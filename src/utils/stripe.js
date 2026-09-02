// Integração com o Stripe — usada SÓ pra assinatura recorrente por cartão
// (mensal, anual, ou teste grátis de 7 dias). Pagamento único (Pix/Boleto)
// não é mais feito por aqui — isso agora é tudo Mercado Pago
// (ver src/utils/mercadopago.js), porque nem Boleto nem Pix conseguem ser
// cobrados de novo sozinhos, então não fazia sentido ficar no mesmo
// provedor da assinatura recorrente.
const Stripe = require("stripe");

function getClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY não configurado no ambiente");
  return new Stripe(key);
}

// plan: "monthly" (padrão) ou "annual" — define o preço e a recorrência.
// trial: true ativa 7 dias grátis antes da primeira cobrança — o cartão é
// coletado MESMO ASSIM (payment_method_collection: "always"), de propósito:
// é a proteção contra gente ficar criando conta nova pra sempre usar em
// modo teste. O trial sempre converte pro plano escolhido (monthly/annual)
// depois dos 7 dias.
async function createCheckoutSession({ email, name, plan = "monthly", trial = false }) {
  const stripe = getClient();
  const isAnnual = plan === "annual";
  const monthlyPrice = Number(process.env.PRECIFICA_MONTHLY_PRICE) || 99.9;
  const annualPrice = Number(process.env.PRECIFICA_ANNUAL_PRICE) || 599.9;
  const unitAmount = isAnnual ? annualPrice : monthlyPrice;
  const interval = isAnnual ? "year" : "month";
  const productName = isAnnual ? "Precifica — Assinatura anual" : "Precifica — Assinatura mensal";
  const appUrl = process.env.APP_URL || "";
  const planMetadata = { plan: isAnnual ? "annual" : "monthly", trial: trial ? "true" : "false" };

  const sessionParams = {
    mode: "subscription",
    customer_email: email,
    line_items: [
      {
        price_data: {
          currency: "brl",
          unit_amount: Math.round(unitAmount * 100), // Stripe trabalha em centavos
          recurring: { interval },
          product_data: { name: productName },
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/?checkout=sucesso`,
    cancel_url: `${appUrl}/?checkout=cancelado`,
    metadata: { name: name || "", ...planMetadata },
  };

  if (trial) {
    sessionParams.subscription_data = {
      trial_period_days: Number(process.env.TRIAL_DURATION_DAYS) || 7,
      metadata: planMetadata,
    };
    sessionParams.payment_method_collection = "always";
  }

  return stripe.checkout.sessions.create(sessionParams);
}

// Cancela a RENOVAÇÃO automática de uma assinatura (cartão) sem tirar o
// acesso na hora — a pessoa continua podendo usar até a data que já tinha
// pago, só não é cobrada de novo depois disso.
async function cancelSubscriptionAtPeriodEnd(subscriptionId) {
  const stripe = getClient();
  return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

module.exports = { getClient, createCheckoutSession, cancelSubscriptionAtPeriodEnd };

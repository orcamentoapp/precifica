// Integração com o Stripe — cria a sessão de checkout (página de pagamento
// hospedada pelo Stripe) pra assinatura mensal, anual, ou teste grátis de 7
// dias (que também cobra cartão, só que com trial_period_days — ver
// createCheckoutSession).
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
//
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

module.exports = { getClient, createCheckoutSession, createOneTimePaymentCheckout, cancelSubscriptionAtPeriodEnd };// Pagamento ÚNICO (sem assinatura) — pra quem quer renovar +30 ou +365 dias
// pagando com Pix ou Boleto, já que nenhum dos dois consegue ser cobrado
// automaticamente de novo depois (diferente do cartão). Precisa do Pix e do
// Boleto habilitados no painel do Stripe (Configurações → Payment methods);
// Pix pra contas do Brasil também depende de liberação da própria Stripe
// (veja a nota no README).
//
// userId: se vier preenchido (renovação por alguém já logado), o webhook
// estende a licença existente dessa conta. Se vier vazio (compra nova, sem
// conta ainda), o webhook cria uma licença nova e manda o código por e-mail
// — igual já acontece hoje com a assinatura via cartão.
async function createOneTimePaymentCheckout({ email, plan = "monthly", userId }) {
  const stripe = getClient();
  const isAnnual = plan === "annual";
  const monthlyPrice = Number(process.env.PRECIFICA_MONTHLY_PRICE) || 99.9;
  const annualPrice = Number(process.env.PRECIFICA_ANNUAL_PRICE) || 599.9;
  const unitAmount = isAnnual ? annualPrice : monthlyPrice;
  const productName = isAnnual ? "Precifica — Renovação anual (365 dias)" : "Precifica — Renovação mensal (30 dias)";
  const appUrl = process.env.APP_URL || "";

  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    payment_method_types: ["card", "boleto", "pix"],
    line_items: [
      {
        price_data: {
          currency: "brl",
          unit_amount: Math.round(unitAmount * 100),
          product_data: { name: productName },
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/?checkout=sucesso`,
    cancel_url: `${appUrl}/?checkout=cancelado`,
    metadata: {
      plan: isAnnual ? "annual" : "monthly",
      oneTime: "true",
      userId: userId ? String(userId) : "",
    },
  });
}

// Cancela a RENOVAÇÃO automática de uma assinatura (cartão) sem tirar o
// acesso na hora — a pessoa continua podendo usar até a data que já tinha
// pago, só não é cobrada de novo depois disso.
async function cancelSubscriptionAtPeriodEnd(subscriptionId) {
  const stripe = getClient();
  return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

module.exports = { getClient, createCheckoutSession, createOneTimePaymentCheckout, cancelSubscriptionAtPeriodEnd };

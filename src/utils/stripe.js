// Integração com o Stripe — único meio de pagamento do Precifica:
// assinatura recorrente por cartão (mensal, anual, ou teste grátis de 7
// dias). A integração com Mercado Pago (Pix/Boleto) foi cancelada e o
// código dela removido em 29/10/2026.
const Stripe = require("stripe");
const { getPricing, getFounderStatus } = require("./pricingSettings");

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
// renewalUserId: presente só quando é uma pessoa JÁ LOGADA renovando/trocando
// de plano pela própria conta (em vez de alguém novo assinando pela primeira
// vez) — nesse caso NUNCA tem trial (`trial` é ignorado se vier junto), o
// success_url é outro (uma tela mínima de "pagamento confirmado, pode fechar
// essa aba", pensada pra abrir numa aba/popup separada sem precisar deslogar
// a pessoa da aba principal), e o metadata carrega o ID do usuário pra
// `createLicenseFromCheckoutSession` saber que deve ATUALIZAR a licença que
// já existe, em vez de criar uma solta esperando ativação por e-mail.
async function createCheckoutSession({ email, name, plan = "monthly", trial = false, renewalUserId = null, termsAccepted = false }) {
  const stripe = getClient();
  const isRenewal = !!renewalUserId;
  const isAnnual = plan === "annual";
  const { monthlyPrice, annualPrice } = await getPricing();
  // Oferta de fundador: só no MENSAL, só pra assinatura nova (não em
  // renovação), e só enquanto houver vaga. O preço fica gravado na própria
  // assinatura do Stripe — vale pra sempre enquanto ela existir.
  let founderPrice = null;
  if (!isAnnual && !renewalUserId) {
    const founder = await getFounderStatus();
    if (founder.available) founderPrice = founder.price;
  }
  const unitAmount = isAnnual ? annualPrice : founderPrice || monthlyPrice;
  const interval = isAnnual ? "year" : "month";
  const productName = isAnnual
    ? "Precifica — Assinatura anual"
    : founderPrice
    ? "Precifica — Assinatura mensal (preço de fundador)"
    : "Precifica — Assinatura mensal";
  const appUrl = process.env.APP_URL || "";
  const effectiveTrial = isRenewal ? false : trial;
  const planMetadata = {
    plan: isAnnual ? "annual" : "monthly",
    trial: effectiveTrial ? "true" : "false",
    ...(isRenewal ? { renewalUserId: String(renewalUserId) } : {}),
    ...(founderPrice ? { founder: "true", chargedMonthlyPrice: String(founderPrice) } : { chargedMonthlyPrice: String(isAnnual ? annualPrice : monthlyPrice) }),
    // Aceite dos Termos/Política na tela de compra (LGPD/CDC) — copiado pra
    // licença quando o pagamento é confirmado.
    ...(termsAccepted ? { termsAcceptedAt: new Date().toISOString() } : {}),
  };

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
    success_url: isRenewal
      ? `${appUrl}/renovacao-confirmada?session_id={CHECKOUT_SESSION_ID}`
      : `${appUrl}/?checkout=sucesso&session_id={CHECKOUT_SESSION_ID}${effectiveTrial ? "&plano=trial" : ""}`,
    cancel_url: isRenewal ? `${appUrl}/configuracoes` : `${appUrl}/?checkout=cancelado`,
    metadata: { name: name || "", ...planMetadata },
    // Campo "Adicionar código promocional" no checkout do Stripe — os
    // cupons/códigos são criados no painel do Stripe (Catálogo de produtos →
    // Cupons). Serve pra teste (cupom 100%), parcerias e campanhas.
    allow_promotion_codes: true,
  };

  if (effectiveTrial) {
    sessionParams.subscription_data = {
      trial_period_days: Number(process.env.TRIAL_DURATION_DAYS) || 7,
      metadata: planMetadata,
    };
    sessionParams.payment_method_collection = "always";
    // Texto que o Stripe mostra embaixo do botão de confirmar, na própria
    // página de checkout hospedada por eles — é o único jeito de deixar
    // essa mensagem explícita ali, já que essa tela não é nossa, é do
    // Stripe (não dá pra editar o HTML dela diretamente).
    sessionParams.custom_text = {
      submit: {
        message:
          "Você pode cancelar quando quiser antes dos 7 dias acabarem, direto pelo Precifica — nesse caso, não é cobrado nada.",
      },
    };
  } else {
    // Renovação/assinatura direta também carrega o metadata na própria
    // assinatura (não só na sessão) — mesmo padrão do trial, pra
    // `invoice.paid` (renovações futuras) também saber ligar a fatura à
    // licença certa se precisar.
    sessionParams.subscription_data = { metadata: planMetadata };
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

// Desfaz um cancelamento pedido (a assinatura volta a renovar sozinha, SEM
// cobrança nova agora — o período já pago continua valendo). Usado por
// "Renovar assinatura" quando a assinatura antiga ainda está ativa.
async function reactivateSubscription(subscriptionId) {
  const stripe = getClient();
  return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
}

// Portal de cobrança do próprio Stripe: trocar cartão, ver/baixar faturas.
// Precisa estar ativado UMA VEZ no painel do Stripe (modo live):
// Configurações → Billing → Customer portal → "Ativar link"/Salvar.
async function createBillingPortalSession(customerId, returnUrl) {
  const stripe = getClient();
  return stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
}

// A partir de certa versão da API do Stripe, o vínculo fatura→assinatura
// saiu de invoice.subscription e foi pra invoice.parent.subscription_details
// — os webhooks podem chegar em qualquer um dos dois formatos.
function subscriptionIdFromInvoice(invoice) {
  if (!invoice || typeof invoice !== "object") return null;
  const direct = invoice.subscription;
  if (direct) return typeof direct === "string" ? direct : direct.id;
  const nested = invoice.parent && invoice.parent.subscription_details && invoice.parent.subscription_details.subscription;
  if (nested) return typeof nested === "string" ? nested : nested.id;
  return null;
}

module.exports = {
  getClient,
  createCheckoutSession,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
  createBillingPortalSession,
  subscriptionIdFromInvoice,
};

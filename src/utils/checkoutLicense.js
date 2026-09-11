// Lógica de criar a licença a partir de uma sessão de checkout do Stripe —
// compartilhada entre duas formas de chegar até aqui:
// 1. O webhook "checkout.session.completed" (src/routes/stripeWebhook.js),
//    que só funciona se esse evento estiver marcado no painel do Stripe.
// 2. A confirmação síncrona (POST /api/payments/stripe/confirm-checkout),
//    que busca a sessão direto na API do Stripe assim que a pessoa volta
//    pro app depois de pagar — não depende de NENHUMA configuração de
//    webhook, então é a rede de segurança de verdade contra webhook mal
//    configurado (foi criada depois de descobrir que
//    "checkout.session.completed" não estava chegando de jeito nenhum,
//    mesmo depois de várias tentativas de diagnóstico).
//
// Sempre que possível, PREFIRA que os dois caminhos cheguem aqui — se o
// webhook também estiver configurado corretamente algum dia, os dois vão
// tentar criar a mesma licença, e a checagem de "já existe" (por
// stripe_subscription_id) evita duplicar.
const Stripe = require("stripe");
const pool = require("../db");
const { generateLicenseCode } = require("./licenseCode");
const { sendLicensePurchasedEmail, sendTrialStartedEmail, sendLicenseRenewedEmail } = require("./email");

const LICENSE_DURATION_DAYS = Number(process.env.LICENSE_DURATION_DAYS) || 30;
const ANNUAL_DURATION_DAYS = Number(process.env.ANNUAL_DURATION_DAYS) || 365;
const MONTHLY_PRICE_LABEL = (Number(process.env.PRECIFICA_MONTHLY_PRICE) || 99.9).toFixed(2).replace(".", ",");

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function durationDaysForPlan(plan) {
  return plan === "annual" ? ANNUAL_DURATION_DAYS : LICENSE_DURATION_DAYS;
}

async function createLicenseFromCheckoutSession(session) {
  if (session.mode !== "subscription") {
    return { created: false, reason: "not_subscription_mode" };
  }

  const subscriptionId = session.subscription || null;
  const customerId = session.customer || null;
  const buyerEmail = session.customer_details?.email || session.customer_email;
  const plan = session.metadata?.plan === "annual" ? "annual" : "monthly";
  const isTrial = session.metadata?.trial === "true";
  const renewalUserId = session.metadata?.renewalUserId ? Number(session.metadata.renewalUserId) : null;

  if (!subscriptionId) {
    return { created: false, reason: "session_without_subscription" };
  }

  const { rows: existingRows } = await pool.query(
    "SELECT id, code FROM licenses WHERE stripe_subscription_id = $1 LIMIT 1",
    [subscriptionId]
  );
  if (existingRows[0]) {
    return { created: false, reason: "already_exists", licenseCode: existingRows[0].code };
  }

  // Renovação/troca de plano de uma conta JÁ LOGADA — não é gente nova
  // assinando, então não cria uma licença solta esperando ativação por
  // e-mail: acha a licença que essa conta já tem e ATUALIZA ela no lugar,
  // pra a pessoa ver a mudança refletida na hora, sem precisar de nenhuma
  // chave nova. Nunca é trial (a própria criação da sessão já garante
  // isso, mas confere de novo aqui por segurança).
  if (renewalUserId) {
    const { rows: userLicenseRows } = await pool.query(
      "SELECT id FROM licenses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [renewalUserId]
    );
    const currentLicense = userLicenseRows[0];
    const durationDays = durationDaysForPlan(plan);
    const expiresAt = addDays(new Date(), durationDays);
    if (currentLicense) {
      await pool.query(
        `UPDATE licenses
         SET type = $1, status = 'active', expires_at = $2, stripe_customer_id = $3,
             stripe_subscription_id = $4, source = 'stripe', cancel_at_period_end = false
         WHERE id = $5`,
        [plan, expiresAt, customerId, subscriptionId, currentLicense.id]
      );
    } else {
      // Não deveria acontecer (só chega em "renovar" quem já tem conta e
      // licença), mas por segurança cria uma nova já vinculada ao usuário
      // em vez de falhar silenciosamente.
      const code = generateLicenseCode();
      await pool.query(
        `INSERT INTO licenses (user_id, code, status, type, expires_at, stripe_customer_id, stripe_subscription_id, source)
         VALUES ($1, $2, 'active', $3, $4, $5, $6, 'stripe')`,
        [renewalUserId, code, plan, expiresAt, customerId, subscriptionId]
      );
    }
    if (buyerEmail) {
      await sendLicenseRenewedEmail(buyerEmail, expiresAt.toLocaleDateString("pt-BR"));
    }
    return { created: true, renewed: true, licenseType: plan, expiresAt };
  }

  if (!buyerEmail) {
    return { created: false, reason: "session_without_email" };
  }

  const licenseType = isTrial ? "trial" : plan;
  const code = generateLicenseCode();

  // Pro trial, busca a data REAL de fim do período (trial_end) direto na
  // assinatura do Stripe, e já grava como expires_at desde a criação —
  // antes disso, o prazo só era calculado na hora da ATIVAÇÃO da conta
  // (auth.js), o que descasava do prazo real do Stripe se a pessoa
  // demorasse pra ativar (o Stripe cobraria antes do app achar que tinha
  // acabado). Com isso já resolvido aqui, a ativação (auth.js) só respeita
  // essa data, não recalcula.
  let trialExpiresAt = null;
  if (isTrial) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.trial_end) {
        trialExpiresAt = new Date(subscription.trial_end * 1000);
      }
    } catch (err) {
      console.error("Não deu pra buscar trial_end da assinatura Stripe:", err.message);
    }
  }

  await pool.query(
    `INSERT INTO licenses (code, status, type, expires_at, stripe_customer_id, stripe_subscription_id, buyer_email, source, trial_started_at)
     VALUES ($1, 'unused', $2, $3, $4, $5, $6, 'stripe', $7)`,
    [code, licenseType, trialExpiresAt, customerId, subscriptionId, buyerEmail.trim().toLowerCase(), isTrial ? new Date() : null]
  );

  if (isTrial && trialExpiresAt) {
    await sendTrialStartedEmail(
      buyerEmail,
      code,
      process.env.APP_URL || "",
      trialExpiresAt.toLocaleDateString("pt-BR"),
      MONTHLY_PRICE_LABEL
    );
  } else {
    await sendLicensePurchasedEmail(buyerEmail, code, process.env.APP_URL || "");
  }

  return { created: true, licenseType, licenseCode: code, buyerEmail };
}

module.exports = { createLicenseFromCheckoutSession };

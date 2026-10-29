// Lógica de criar a licença a partir de uma sessão de checkout do Stripe —
// compartilhada entre duas formas de chegar até aqui:
// 1. O webhook "checkout.session.completed" (src/routes/stripeWebhook.js).
// 2. A confirmação síncrona (POST /api/payments/stripe/confirm-checkout),
//    que busca a sessão direto na API do Stripe assim que a pessoa volta
//    pro app depois de pagar — rede de segurança contra webhook mal
//    configurado.
//
// Os dois caminhos costumam chegar QUASE AO MESMO TEMPO. Antes, os dois
// viam "ainda não existe licença" e os dois criavam — 2 licenças e 2
// e-mails com chaves diferentes. Agora tudo roda dentro de uma transação
// com trava por assinatura (`withSubscriptionLock`): o segundo espera o
// primeiro terminar e aí vê que já existe. O banco também tem índice único
// em licenses.stripe_subscription_id (ver migrate.js).
const pool = require("../db");
const { generateLicenseCode } = require("./licenseCode");
const { sendLicensePurchasedEmail, sendTrialStartedEmail, sendLicenseRenewedEmail } = require("./email");
const { getPricing } = require("./pricingSettings");
const { getClient } = require("./stripe");

// Roda fn(client) numa transação com uma trava exclusiva pra essa
// assinatura (pg_advisory_xact_lock — liberada sozinha no COMMIT/ROLLBACK).
async function withSubscriptionLock(subscriptionId, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`stripe-sub:${subscriptionId}`]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Data de fim do período pago atual da assinatura (o que o Stripe vai
// cobrar de novo). Nas versões novas da API ela fica no item da
// assinatura; nas antigas, na própria assinatura.
function periodEndFromSubscription(subscription) {
  const ts =
    subscription.current_period_end ||
    (subscription.items && subscription.items.data && subscription.items.data[0] && subscription.items.data[0].current_period_end);
  return ts ? new Date(ts * 1000) : null;
}

// "Impressão digital" do cartão (identifica o MESMO cartão mesmo em
// e-mails/contas diferentes — não é o número do cartão).
async function cardFingerprintForSubscription(stripe, subscriptionId) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["default_payment_method", "customer.invoice_settings.default_payment_method"],
  });
  let pm = sub.default_payment_method;
  if ((!pm || typeof pm === "string") && sub.customer && typeof sub.customer === "object") {
    pm = sub.customer.invoice_settings && sub.customer.invoice_settings.default_payment_method;
  }
  return { subscription: sub, fingerprint: pm && typeof pm === "object" && pm.card ? pm.card.fingerprint : null };
}

async function createLicenseFromCheckoutSession(session) {
  if (session.mode !== "subscription") {
    return { created: false, reason: "not_subscription_mode" };
  }

  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id || null;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id || null;
  const buyerEmail = session.customer_details?.email || session.customer_email;
  const plan = session.metadata?.plan === "annual" ? "annual" : "monthly";
  const isTrial = session.metadata?.trial === "true";
  const renewalUserId = session.metadata?.renewalUserId ? Number(session.metadata.renewalUserId) : null;
  const termsAcceptedAt = session.metadata?.termsAcceptedAt ? new Date(session.metadata.termsAcceptedAt) : null;
  const isFounder = session.metadata?.founder === "true";
  const chargedPrice = Number(session.metadata?.chargedMonthlyPrice) || null;

  if (!subscriptionId) {
    return { created: false, reason: "session_without_subscription" };
  }

  const stripe = getClient();
  const emails = []; // e-mails só saem DEPOIS do COMMIT (nunca por algo que foi desfeito)

  const result = await withSubscriptionLock(subscriptionId, async (client) => {
    const { rows: existingRows } = await client.query(
      "SELECT id, code FROM licenses WHERE stripe_subscription_id = $1 LIMIT 1",
      [subscriptionId]
    );
    if (existingRows[0]) {
      return { created: false, reason: "already_exists", licenseCode: existingRows[0].code };
    }

    // Data real de fim do período, direto do Stripe (antes: "hoje + 30
    // dias", que descasava do dia real da cobrança).
    let subscription = null;
    let fingerprint = null;
    try {
      ({ subscription, fingerprint } = await cardFingerprintForSubscription(stripe, subscriptionId));
    } catch (err) {
      console.error("Não deu pra buscar a assinatura no Stripe:", err.message);
    }

    // ---------- Renovação/troca de plano de conta JÁ LOGADA ----------
    if (renewalUserId) {
      const { rows: userLicenseRows } = await client.query(
        "SELECT id, stripe_subscription_id FROM licenses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
        [renewalUserId]
      );
      const currentLicense = userLicenseRows[0];
      const periodEnd = subscription ? periodEndFromSubscription(subscription) : null;
      const expiresAt = periodEnd || new Date(Date.now() + (plan === "annual" ? 365 : 30) * 24 * 60 * 60 * 1000);
      const oldSubscriptionId =
        currentLicense && currentLicense.stripe_subscription_id !== subscriptionId ? currentLicense.stripe_subscription_id : null;
      if (currentLicense) {
        await client.query(
          `UPDATE licenses
           SET type = $1, status = 'active', expires_at = $2, stripe_customer_id = $3,
               stripe_subscription_id = $4, source = 'stripe', cancel_at_period_end = false, cancelled_at = NULL,
               recurring_amount = $6, founder = false
           WHERE id = $5`,
          [plan, expiresAt, customerId, subscriptionId, currentLicense.id, chargedPrice]
        );
      } else {
        const code = generateLicenseCode();
        await client.query(
          `INSERT INTO licenses (user_id, code, status, type, expires_at, stripe_customer_id, stripe_subscription_id, source, recurring_amount)
           VALUES ($1, $2, 'active', $3, $4, $5, $6, 'stripe', $7)`,
          [renewalUserId, code, plan, expiresAt, customerId, subscriptionId, chargedPrice]
        );
      }
      if (buyerEmail) emails.push(() => sendLicenseRenewedEmail(buyerEmail, expiresAt.toLocaleDateString("pt-BR")));
      return { created: true, renewed: true, licenseType: plan, expiresAt, oldSubscriptionId };
    }

    if (!buyerEmail) {
      return { created: false, reason: "session_without_email" };
    }

    // ---------- Teste grátis: 1 por cartão ----------
    // A mesma pessoa podia fazer infinitos testes grátis trocando só o
    // e-mail. Se esse cartão já fez um teste, a assinatura nova é
    // CANCELADA na hora (sem cobrar nada) e a pessoa é avisada pra assinar
    // sem teste.
    if (isTrial && fingerprint) {
      const { rows: usedRows } = await client.query(
        "SELECT subscription_id FROM trial_card_fingerprints WHERE fingerprint = $1",
        [fingerprint]
      );
      if (usedRows[0] && usedRows[0].subscription_id !== subscriptionId) {
        try {
          await stripe.subscriptions.cancel(subscriptionId);
        } catch (err) {
          console.error("Erro ao cancelar trial repetido:", err.message);
        }
        console.log("[stripe] trial recusado — cartão já usou teste grátis:", subscriptionId);
        return { created: false, reason: "trial_card_reused" };
      }
      await client.query(
        "INSERT INTO trial_card_fingerprints (fingerprint, subscription_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [fingerprint, subscriptionId]
      );
    }

    const licenseType = isTrial ? "trial" : plan;
    const code = generateLicenseCode();

    // Trial: fim real do teste (trial_end). Assinatura paga direto: fim do
    // primeiro período pago. A ativação da conta (auth.js) respeita essa
    // data e não recalcula.
    let expiresAt = null;
    if (subscription) {
      expiresAt = isTrial && subscription.trial_end ? new Date(subscription.trial_end * 1000) : periodEndFromSubscription(subscription);
    }

    const insert = await client.query(
      `INSERT INTO licenses (code, status, type, expires_at, stripe_customer_id, stripe_subscription_id, buyer_email, source, trial_started_at, terms_accepted_at, founder, recurring_amount)
       VALUES ($1, 'unused', $2, $3, $4, $5, $6, 'stripe', $7, $8, $9, $10)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [code, licenseType, expiresAt, customerId, subscriptionId, buyerEmail.trim().toLowerCase(), isTrial ? new Date() : null, termsAcceptedAt, isFounder, chargedPrice]
    );
    if (!insert.rows[0]) {
      return { created: false, reason: "already_exists" };
    }

    if (isTrial && expiresAt) {
      // Valor que o Stripe vai cobrar DE VERDADE depois do teste (pode ser
      // o preço de fundador) — gravado no metadata na criação do checkout.
      const { monthlyPrice: currentMonthly } = await getPricing();
      const monthlyPrice = chargedPrice || currentMonthly;
      emails.push(() =>
        sendTrialStartedEmail(
          buyerEmail,
          code,
          process.env.APP_URL || "",
          expiresAt.toLocaleDateString("pt-BR"),
          monthlyPrice.toFixed(2).replace(".", ","),
          { founder: isFounder }
        )
      );
    } else {
      emails.push(() => sendLicensePurchasedEmail(buyerEmail, code, process.env.APP_URL || "", { founder: isFounder }));
    }

    return { created: true, licenseType, licenseCode: code, buyerEmail };
  });

  // Renovação feita com uma assinatura NOVA (a antiga já tinha acabado ou
  // estava com pagamento pendente): garante que a antiga não cobre de novo.
  if (result.oldSubscriptionId) {
    const { cancelSubscriptionNow } = require("./subscriptionCleanup");
    await cancelSubscriptionNow(result.oldSubscriptionId);
    delete result.oldSubscriptionId;
  }

  for (const send of emails) {
    try {
      await send();
    } catch (err) {
      console.error("Licença salva, mas o e-mail falhou:", err.message);
    }
  }
  return result;
}

module.exports = { createLicenseFromCheckoutSession, withSubscriptionLock, periodEndFromSubscription };

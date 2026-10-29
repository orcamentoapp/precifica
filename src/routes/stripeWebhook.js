// O webhook do Stripe fica separado do resto das rotas de pagamento porque
// precisa receber o corpo da requisição "cru" (sem passar pelo
// express.json()) pra conseguir verificar a assinatura criptográfica que o
// Stripe manda no header "stripe-signature". Veja como isso é registrado
// no server.js (tem que vir ANTES do express.json() global).
//
// EVENTOS QUE PRECISAM ESTAR MARCADOS no painel do Stripe (Developers →
// Webhooks → endpoint → eventos):
//   checkout.session.completed, invoice.paid, invoice.payment_failed,
//   customer.subscription.updated, customer.subscription.deleted,
//   charge.dispute.created
//
// CONFIABILIDADE (revisão de 29/10/2026): antes, o evento era marcado como
// "processado" ANTES de processar, e qualquer erro respondia 200 — se o
// banco piscasse no meio, o evento se perdia pra sempre (licença não
// criada, renovação não aplicada). Agora, se der erro, a marca é desfeita e
// a resposta é 500: o Stripe tenta entregar de novo sozinho (por até 3
// dias), e a segunda tentativa processa normalmente.
const Stripe = require("stripe");
const pool = require("../db");
const { generateLicenseCode } = require("../utils/licenseCode");
const { sendLicensePurchasedEmail, sendLicenseRenewedEmail, sendPaymentFailedEmail } = require("../utils/email");
const { createLicenseFromCheckoutSession, withSubscriptionLock } = require("../utils/checkoutLicense");
const { subscriptionIdFromInvoice } = require("../utils/stripe");

const LICENSE_DURATION_DAYS = Number(process.env.LICENSE_DURATION_DAYS) || 30;
const ANNUAL_DURATION_DAYS = Number(process.env.ANNUAL_DURATION_DAYS) || 365;

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function durationDaysForPlan(plan) {
  return plan === "annual" ? ANNUAL_DURATION_DAYS : LICENSE_DURATION_DAYS;
}

// Fim do período que ESSA fatura pagou (data real da próxima cobrança).
function periodEndFromInvoice(invoice) {
  const lines = (invoice.lines && invoice.lines.data) || [];
  const ends = lines.map((l) => l.period && l.period.end).filter(Boolean);
  if (!ends.length) return null;
  return new Date(Math.max(...ends) * 1000);
}

// ---------- invoice.paid ----------
// Cobre a primeira cobrança (assinatura sem trial) e todas as renovações —
// inclusive a conversão de trial pro plano pago.
async function handleInvoicePaid(invoice) {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  console.log("[stripe webhook] invoice.paid recebido:", {
    invoiceId: invoice.id,
    subscriptionId,
    amount_paid: invoice.amount_paid,
    billing_reason: invoice.billing_reason,
  });

  // Fatura inicial de R$ 0 do teste grátis — não é cobrança de verdade (a
  // licença de trial é criada pelo checkout.session.completed).
  if ((invoice.amount_paid || 0) === 0 && invoice.billing_reason === "subscription_create") {
    return { ignored: true, reason: "zero_amount_trial_invoice" };
  }
  if (!subscriptionId) return { ignored: true, reason: "invoice_without_subscription" };

  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id || null;
  const buyerEmail = invoice.customer_email;
  const line = invoice.lines?.data?.[0];
  const interval = line?.price?.recurring?.interval || line?.plan?.interval;
  const plan = interval === "year" ? "annual" : "monthly";
  const expiresAt = periodEndFromInvoice(invoice) || addDays(new Date(), durationDaysForPlan(plan));

  const emails = [];
  await withSubscriptionLock(subscriptionId, async (client) => {
    const { rows } = await client.query("SELECT * FROM licenses WHERE stripe_subscription_id = $1 LIMIT 1", [subscriptionId]);
    const existingLicense = rows[0] || null;

    if (existingLicense) {
      const wasTrial = existingLicense.type === "trial";
      // Licença revogada (chargeback/admin) não volta sozinha por causa de
      // uma fatura — só atualiza a validade.
      const newStatus =
        existingLicense.status === "revoked" ? "revoked" : existingLicense.status === "unused" ? "unused" : "active";
      // Valor realmente pago nessa fatura (já com desconto/cupom, se houver)
      // — mantém o MRR do painel fiel ao que entra de verdade.
      const paid = (invoice.amount_paid || 0) / 100;
      await client.query(
        "UPDATE licenses SET expires_at = $1, status = $2, type = $3, recurring_amount = COALESCE($5, recurring_amount) WHERE id = $4",
        [expiresAt, newStatus, plan, existingLicense.id, paid > 0 ? paid : null]
      );
      if (buyerEmail) {
        if (wasTrial) {
          emails.push(() =>
            sendLicensePurchasedEmail(buyerEmail, existingLicense.code, process.env.APP_URL || "", { founder: !!existingLicense.founder })
          );
        } else if (invoice.billing_reason !== "subscription_create") {
          emails.push(() => sendLicenseRenewedEmail(buyerEmail, expiresAt.toLocaleDateString("pt-BR")));
        }
      }
      return;
    }

    // Sem licença ainda pra essa assinatura (checkout.session.completed não
    // chegou) — cria aqui como rede de segurança.
    if (!buyerEmail) {
      console.error("Webhook Stripe: fatura sem e-mail do cliente, invoice:", invoice.id);
      return;
    }
    const code = generateLicenseCode();
    const ins = await client.query(
      `INSERT INTO licenses (code, status, type, expires_at, stripe_customer_id, stripe_subscription_id, buyer_email, source, recurring_amount)
       VALUES ($1, 'unused', $2, $3, $4, $5, $6, 'stripe', $7) ON CONFLICT DO NOTHING RETURNING id`,
      [code, plan, expiresAt, customerId, subscriptionId, buyerEmail.trim().toLowerCase(), (invoice.amount_paid || 0) / 100 || null]
    );
    if (ins.rows[0]) emails.push(() => sendLicensePurchasedEmail(buyerEmail, code, process.env.APP_URL || ""));
  });

  for (const send of emails) {
    try {
      await send();
    } catch (err) {
      console.error("Webhook: dados salvos, mas o e-mail falhou:", err.message);
    }
  }
  return { ok: true };
}

// ---------- invoice.payment_failed ----------
// Cartão recusou a renovação. O Stripe tenta de novo sozinho nos próximos
// dias; aqui só avisa a pessoa (na 1ª falha de cada fatura) pra trocar o
// cartão antes de perder o acesso.
async function handlePaymentFailed(invoice) {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  console.log("[stripe webhook] invoice.payment_failed:", {
    invoiceId: invoice.id,
    subscriptionId,
    attempt_count: invoice.attempt_count,
  });
  if (!invoice.customer_email || (invoice.attempt_count || 1) > 1) return { ok: true };
  try {
    await sendPaymentFailedEmail(invoice.customer_email, process.env.APP_URL || "");
  } catch (err) {
    console.error("Erro ao enviar e-mail de pagamento recusado:", err.message);
  }
  return { ok: true };
}

// ---------- customer.subscription.updated / deleted ----------
// Mantém o "cancelar no fim do período" sincronizado com o Stripe (ex:
// quando a pessoa cancela ou desfaz pelo portal de cobrança, ou quando o
// Stripe encerra a assinatura depois de várias cobranças recusadas).
async function handleSubscriptionChange(subscription, deleted) {
  const cancelFlag = deleted ? true : !!subscription.cancel_at_period_end;
  const { rowCount } = await pool.query(
    `UPDATE licenses
     SET cancel_at_period_end = $1,
         cancelled_at = CASE WHEN $1 THEN COALESCE(cancelled_at, now()) ELSE NULL END
     WHERE stripe_subscription_id = $2`,
    [cancelFlag, subscription.id]
  );
  console.log(`[stripe webhook] assinatura ${deleted ? "encerrada" : "atualizada"}:`, subscription.id, { cancelFlag, rowCount });
  return { ok: true };
}

// ---------- charge.dispute.created (chargeback) ----------
// Revoga a licença na hora e cancela a assinatura (por padrão o Stripe NÃO
// cancela sozinho, e continuaria cobrando + dando acesso).
async function handleDispute(stripe, dispute) {
  console.log("[stripe webhook] disputa de cobrança recebida:", {
    disputeId: dispute.id,
    chargeId: dispute.charge,
    reason: dispute.reason,
    amount: dispute.amount,
  });
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  const charge = await stripe.charges.retrieve(chargeId, { expand: ["invoice"] });
  let subscriptionId = null;
  if (charge.invoice) {
    const invoice =
      typeof charge.invoice === "string" ? await stripe.invoices.retrieve(charge.invoice) : charge.invoice;
    subscriptionId = subscriptionIdFromInvoice(invoice);
  }
  let license = null;
  if (subscriptionId) {
    const { rows } = await pool.query("SELECT * FROM licenses WHERE stripe_subscription_id = $1 LIMIT 1", [subscriptionId]);
    license = rows[0] || null;
  }
  // Rede de segurança: acha pela conta do cliente no Stripe.
  if (!license && charge.customer) {
    const customerId = typeof charge.customer === "string" ? charge.customer : charge.customer.id;
    const { rows } = await pool.query(
      "SELECT * FROM licenses WHERE stripe_customer_id = $1 ORDER BY created_at DESC LIMIT 1",
      [customerId]
    );
    license = rows[0] || null;
    if (license && !subscriptionId) subscriptionId = license.stripe_subscription_id;
  }
  if (license) {
    await pool.query("UPDATE licenses SET status = 'revoked', cancelled_at = now(), cancel_at_period_end = true WHERE id = $1", [
      license.id,
    ]);
    console.log(`[stripe webhook] licença ${license.code} REVOGADA por disputa de cobrança`);
  }
  if (subscriptionId) {
    try {
      await stripe.subscriptions.cancel(subscriptionId);
      console.log("[stripe webhook] assinatura cancelada por disputa:", subscriptionId);
    } catch (cancelErr) {
      console.error("Erro ao cancelar assinatura após disputa (pode já estar cancelada):", cancelErr.message);
    }
  }
  return { ok: true, revoked: !!license };
}

async function stripeWebhookHandler(req, res) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Assinatura do webhook Stripe inválida:", err.message);
    return res.status(400).send("Webhook Error: assinatura inválida");
  }

  console.log(`[stripe webhook] evento recebido: ${event.type} (id: ${event.id})`);

  // Idempotência: o Stripe pode reenviar o mesmo evento mais de uma vez.
  let claimed = false;
  try {
    const insertResult = await pool.query(
      "INSERT INTO stripe_processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id",
      [event.id]
    );
    if (insertResult.rowCount === 0) {
      return res.status(200).json({ received: true, alreadyProcessed: true });
    }
    claimed = true;

    let result;
    switch (event.type) {
      case "checkout.session.completed":
        result = await createLicenseFromCheckoutSession(event.data.object);
        console.log("[stripe webhook] resultado da criação de licença:", result);
        break;
      case "invoice.paid":
        result = await handleInvoicePaid(event.data.object);
        break;
      case "invoice.payment_failed":
        result = await handlePaymentFailed(event.data.object);
        break;
      case "customer.subscription.updated":
        result = await handleSubscriptionChange(event.data.object, false);
        break;
      case "customer.subscription.deleted":
        result = await handleSubscriptionChange(event.data.object, true);
        break;
      case "charge.dispute.created":
        result = await handleDispute(stripe, event.data.object);
        break;
      default:
        result = { ignored: true };
    }
    return res.status(200).json({ received: true, ...(result || {}) });
  } catch (err) {
    console.error("Erro ao processar webhook Stripe (o Stripe vai tentar de novo):", event.type, event.id, err);
    if (claimed) {
      await pool.query("DELETE FROM stripe_processed_events WHERE event_id = $1", [event.id]).catch(() => {});
    }
    return res.status(500).json({ received: false, error: "internal_error" });
  }
}

module.exports = { stripeWebhookHandler };

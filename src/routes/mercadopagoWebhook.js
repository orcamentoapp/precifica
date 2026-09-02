// Webhook do Mercado Pago — chamado quando o status de um pagamento muda.
// A gente só se importa com pagamentos aprovados vindos da preferência de
// pagamento único (ver src/utils/mercadopago.js): soma +30 ou +365 dias na
// licença de quem já tem conta, ou cria uma licença nova (compra sem conta
// ainda) — mesmo padrão que já existia no webhook do Stripe.
const pool = require("../db");
const { generateLicenseCode } = require("../utils/licenseCode");
const { sendLicensePurchasedEmail, sendLicenseRenewedEmail } = require("../utils/email");
const { getPayment, verifyWebhookSignature } = require("../utils/mercadopago");

const LICENSE_DURATION_DAYS = Number(process.env.LICENSE_DURATION_DAYS) || 30;
const ANNUAL_DURATION_DAYS = Number(process.env.ANNUAL_DURATION_DAYS) || 365;

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function durationDaysForPlan(plan) {
  return plan === "annual" ? ANNUAL_DURATION_DAYS : LICENSE_DURATION_DAYS;
}

async function mercadopagoWebhookHandler(req, res) {
  try {
    // O Mercado Pago manda o ID tanto na query string quanto no corpo,
    // dependendo do formato da notificação — aceita os dois.
    const dataId = req.query["data.id"] || req.body?.data?.id;
    const type = req.query.type || req.body?.type;

    if (!dataId || type !== "payment") {
      return res.status(200).json({ received: true, ignored: true });
    }

    const xSignature = req.headers["x-signature"];
    const xRequestId = req.headers["x-request-id"];
    const valid = verifyWebhookSignature({ xSignature, xRequestId, dataId: String(dataId) });
    if (!valid) {
      console.error("Webhook Mercado Pago: assinatura inválida, data.id:", dataId);
      return res.status(401).json({ error: "invalid_signature" });
    }

    // Idempotência: o Mercado Pago pode reenviar a mesma notificação mais
    // de uma vez (usa a mesma tabela do Stripe, prefixando pra não colidir
    // caso os dois algum dia gerem o mesmo texto de ID).
    const eventKey = `mp_payment_${dataId}`;
    const insertResult = await pool.query(
      "INSERT INTO stripe_processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id",
      [eventKey]
    );
    if (insertResult.rowCount === 0) {
      return res.status(200).json({ received: true, alreadyProcessed: true });
    }

    const payment = await getPayment(dataId); // já valida que dataId é só dígitos
    if (payment.status !== "approved") {
      return res.status(200).json({ received: true, ignored: true, status: payment.status });
    }

    let meta;
    try {
      meta = JSON.parse(payment.external_reference || "{}");
    } catch (e) {
      meta = {};
    }
    const plan = meta.plan === "annual" ? "annual" : "monthly";
    const userId = meta.userId || null;
    const durationDays = durationDaysForPlan(plan);
    const buyerEmail = payment.payer?.email;

    if (!buyerEmail) {
      console.error("Webhook Mercado Pago: pagamento aprovado sem e-mail, payment id:", dataId);
      return res.status(200).json({ received: true, error: "payment_without_email" });
    }

    if (userId) {
      const { rows } = await pool.query(
        "SELECT * FROM licenses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
        [userId]
      );
      const license = rows[0];
      if (!license) {
        console.error("Webhook Mercado Pago: renovação sem licença encontrada, userId:", userId);
        return res.status(200).json({ received: true, error: "license_not_found_for_renewal" });
      }
      const currentExpiry = license.expires_at ? new Date(license.expires_at) : null;
      const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
      const expiresAt = addDays(base, durationDays);
      await pool.query("UPDATE licenses SET expires_at = $1, status = 'active', type = $2 WHERE id = $3", [
        expiresAt,
        plan,
        license.id,
      ]);
      await sendLicenseRenewedEmail(buyerEmail, expiresAt.toLocaleDateString("pt-BR"));
    } else {
      const code = generateLicenseCode();
      await pool.query(
        `INSERT INTO licenses (code, status, type, buyer_email, source) VALUES ($1, 'unused', $2, $3, 'mercadopago')`,
        [code, plan, buyerEmail.trim().toLowerCase()]
      );
      await sendLicensePurchasedEmail(buyerEmail, code, process.env.APP_URL || "");
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Erro ao processar webhook Mercado Pago:", err);
    // Como no webhook do Stripe: responde 200 mesmo em erro interno, pra
    // não entrar num loop de reentregas de um problema que provavelmente
    // não vai se resolver sozinho — o ideal é monitorar esse log.
    res.status(200).json({ received: true, error: "internal_error" });
  }
}

module.exports = { mercadopagoWebhookHandler };

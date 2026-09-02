// O webhook do Stripe fica separado do resto das rotas de pagamento porque
// precisa receber o corpo da requisição "cru" (sem passar pelo
// express.json()) pra conseguir verificar a assinatura criptográfica que o
// Stripe manda no header "stripe-signature". Veja como isso é registrado
// no server.js (tem que vir ANTES do express.json() global).
const Stripe = require("stripe");
const pool = require("../db");
const { generateLicenseCode } = require("../utils/licenseCode");
const { sendLicensePurchasedEmail, sendLicenseRenewedEmail } = require("../utils/email");

const LICENSE_DURATION_DAYS = Number(process.env.LICENSE_DURATION_DAYS) || 30;

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function stripeWebhookHandler(req, res) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Assinatura do webhook Stripe inválida:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // "invoice.paid" cobre tanto a primeira cobrança da assinatura quanto
    // as renovações seguintes — é o único evento que precisamos tratar.
    if (event.type !== "invoice.paid") {
      return res.status(200).json({ received: true, ignored: true });
    }

    const invoice = event.data.object;

    // Idempotência: o Stripe pode reenviar o mesmo evento mais de uma vez.
    const insertResult = await pool.query(
      "INSERT INTO stripe_processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id",
      [event.id]
    );
    if (insertResult.rowCount === 0) {
      return res.status(200).json({ received: true, alreadyProcessed: true });
    }

    const subscriptionId = invoice.subscription || null;
    const customerId = invoice.customer || null;
    const buyerEmail = invoice.customer_email;

    if (!buyerEmail) {
      console.error("Webhook Stripe: fatura sem e-mail do cliente, invoice:", invoice.id);
      return res.status(200).json({ received: true, error: "invoice_without_email" });
    }

    // Já existe uma licença ligada a essa assinatura? Se sim, é uma cobrança
    // de renovação — só estende a validade. Se não, é a primeira cobrança —
    // gera uma licença nova.
    let existingLicense = null;
    if (subscriptionId) {
      const { rows } = await pool.query("SELECT * FROM licenses WHERE stripe_subscription_id = $1 LIMIT 1", [
        subscriptionId,
      ]);
      existingLicense = rows[0] || null;
    }

    if (existingLicense) {
      const expiresAt = addDays(new Date(), LICENSE_DURATION_DAYS);
      await pool.query("UPDATE licenses SET expires_at = $1, status = 'active' WHERE id = $2", [
        expiresAt,
        existingLicense.id,
      ]);
      await sendLicenseRenewedEmail(buyerEmail, expiresAt.toLocaleDateString("pt-BR"));
    } else {
      const code = generateLicenseCode();
      await pool.query(
        `INSERT INTO licenses (code, status, type, stripe_customer_id, stripe_subscription_id, buyer_email)
         VALUES ($1, 'unused', 'monthly', $2, $3, $4)`,
        [code, customerId, subscriptionId, buyerEmail.trim().toLowerCase()]
      );
      await sendLicensePurchasedEmail(buyerEmail, code, process.env.APP_URL || "");
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Erro ao processar webhook Stripe:", err);
    // Responde 200 mesmo assim pra evitar reentregas repetidas de um erro
    // que provavelmente não vai se resolver sozinho — o ideal é monitorar
    // esse log manualmente.
    res.status(200).json({ received: true, error: "internal_error" });
  }
}

module.exports = { stripeWebhookHandler };

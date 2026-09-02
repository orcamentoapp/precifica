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
const ANNUAL_DURATION_DAYS = Number(process.env.ANNUAL_DURATION_DAYS) || 365;
const TRIAL_DURATION_DAYS = Number(process.env.TRIAL_DURATION_DAYS) || 7;

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// "monthly" ou "annual" — duração em dias que cada um dá direito.
function durationDaysForPlan(plan) {
  return plan === "annual" ? ANNUAL_DURATION_DAYS : LICENSE_DURATION_DAYS;
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
    // Idempotência: o Stripe pode reenviar o mesmo evento mais de uma vez.
    const insertResult = await pool.query(
      "INSERT INTO stripe_processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id",
      [event.id]
    );
    if (insertResult.rowCount === 0) {
      return res.status(200).json({ received: true, alreadyProcessed: true });
    }

    // "checkout.session.completed" é o ponto em que a conta é criada de
    // verdade — inclusive pra teste grátis (que NÃO gera fatura paga até o
    // trial acabar, então "invoice.paid" sozinho demoraria 7 dias pra
    // liberar acesso). Aqui a gente já sabe o plano e se é trial pelos
    // metadados que a GENTE mesma colocou ao criar a sessão (createCheckoutSession).
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode !== "subscription") {
        return res.status(200).json({ received: true, ignored: true });
      }

      const subscriptionId = session.subscription || null;
      const customerId = session.customer || null;
      const buyerEmail = session.customer_details?.email || session.customer_email;
      const plan = session.metadata?.plan === "annual" ? "annual" : "monthly";
      const isTrial = session.metadata?.trial === "true";

      if (!buyerEmail || !subscriptionId) {
        console.error("Webhook Stripe: checkout sem e-mail ou subscription, session:", session.id);
        return res.status(200).json({ received: true, error: "session_without_email_or_subscription" });
      }

      const { rows: existingRows } = await pool.query(
        "SELECT id FROM licenses WHERE stripe_subscription_id = $1 LIMIT 1",
        [subscriptionId]
      );
      if (existingRows[0]) {
        return res.status(200).json({ received: true, alreadyExists: true });
      }

      const licenseType = isTrial ? "trial" : plan;
      const code = generateLicenseCode();
      await pool.query(
        `INSERT INTO licenses (code, status, type, stripe_customer_id, stripe_subscription_id, buyer_email)
         VALUES ($1, 'unused', $2, $3, $4, $5)`,
        [code, licenseType, customerId, subscriptionId, buyerEmail.trim().toLowerCase()]
      );
      await sendLicensePurchasedEmail(buyerEmail, code, process.env.APP_URL || "");
      return res.status(200).json({ received: true });
    }

    // "invoice.paid" cobre a primeira cobrança (assinatura sem trial) e
    // todas as renovações seguintes — inclusive a conversão de um trial pro
    // plano de verdade, no dia em que o trial acaba e a primeira cobrança
    // de fato acontece. A duração/tipo aplicados vêm do "interval" do preço
    // dentro da própria fatura (mês = mensal, ano = anual) — não depende de
    // metadado nenhum, então funciona mesmo se o checkout.session.completed
    // não tiver disparado por algum motivo.
    if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription || null;
      const customerId = invoice.customer || null;
      const buyerEmail = invoice.customer_email;
      const interval = invoice.lines?.data?.[0]?.price?.recurring?.interval;
      const plan = interval === "year" ? "annual" : "monthly";
      const durationDays = durationDaysForPlan(plan);

      if (!buyerEmail) {
        console.error("Webhook Stripe: fatura sem e-mail do cliente, invoice:", invoice.id);
        return res.status(200).json({ received: true, error: "invoice_without_email" });
      }

      let existingLicense = null;
      if (subscriptionId) {
        const { rows } = await pool.query("SELECT * FROM licenses WHERE stripe_subscription_id = $1 LIMIT 1", [
          subscriptionId,
        ]);
        existingLicense = rows[0] || null;
      }

      if (existingLicense) {
        const expiresAt = addDays(new Date(), durationDays);
        const wasTrial = existingLicense.type === "trial";
        await pool.query("UPDATE licenses SET expires_at = $1, status = 'active', type = $2 WHERE id = $3", [
          expiresAt,
          plan,
          existingLicense.id,
        ]);
        // Se estava em trial, essa é a primeira cobrança de verdade — trata
        // como "compra" (e-mail de boas-vindas), não como renovação.
        if (wasTrial) {
          await sendLicensePurchasedEmail(buyerEmail, existingLicense.code, process.env.APP_URL || "");
        } else {
          await sendLicenseRenewedEmail(buyerEmail, expiresAt.toLocaleDateString("pt-BR"));
        }
      } else {
        // Sem licença ainda pra essa assinatura — normalmente só acontece se
        // o "checkout.session.completed" não tiver chegado por algum
        // motivo. Cria aqui como rede de segurança, do jeito que sempre foi.
        const code = generateLicenseCode();
        await pool.query(
          `INSERT INTO licenses (code, status, type, stripe_customer_id, stripe_subscription_id, buyer_email)
           VALUES ($1, 'unused', $2, $3, $4, $5)`,
          [code, plan, customerId, subscriptionId, buyerEmail.trim().toLowerCase()]
        );
        await sendLicensePurchasedEmail(buyerEmail, code, process.env.APP_URL || "");
      }
      return res.status(200).json({ received: true });
    }

    return res.status(200).json({ received: true, ignored: true });
  } catch (err) {
    console.error("Erro ao processar webhook Stripe:", err);
    // Responde 200 mesmo assim pra evitar reentregas repetidas de um erro
    // que provavelmente não vai se resolver sozinho — o ideal é monitorar
    // esse log manualmente.
    res.status(200).json({ received: true, error: "internal_error" });
  }
}

module.exports = { stripeWebhookHandler };

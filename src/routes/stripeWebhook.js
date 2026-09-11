// O webhook do Stripe fica separado do resto das rotas de pagamento porque
// precisa receber o corpo da requisição "cru" (sem passar pelo
// express.json()) pra conseguir verificar a assinatura criptográfica que o
// Stripe manda no header "stripe-signature". Veja como isso é registrado
// no server.js (tem que vir ANTES do express.json() global).
const Stripe = require("stripe");
const pool = require("../db");
const { generateLicenseCode } = require("../utils/licenseCode");
const { sendLicensePurchasedEmail, sendLicenseRenewedEmail } = require("../utils/email");
const { createLicenseFromCheckoutSession } = require("../utils/checkoutLicense");

const LICENSE_DURATION_DAYS = Number(process.env.LICENSE_DURATION_DAYS) || 30;
const ANNUAL_DURATION_DAYS = Number(process.env.ANNUAL_DURATION_DAYS) || 365;

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

  // Log de TODO evento que chega aqui, seja qual for o tipo — isso é o que
  // vai mostrar no log do Railway se o Stripe está mandando (ou não) um
  // tipo de evento específico pra esse endpoint. Sem isso, um evento de um
  // tipo que a gente não trata (ou que nem devia existir) simplesmente não
  // aparece em lugar nenhum do log, ficando impossível de diagnosticar à
  // distância.
  console.log(`[stripe webhook] evento recebido: ${event.type} (id: ${event.id})`);

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
    // metadados que a GENTE mesma colocou ao criar a sessão
    // (createCheckoutSession). Pagamento único (Pix/Boleto/cartão avulso)
    // NÃO passa mais por aqui — isso agora é webhook separado do Mercado
    // Pago, ver src/routes/mercadopagoWebhook.js.
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("[stripe webhook] checkout.session.completed recebido:", {
        sessionId: session.id,
        metadata: session.metadata,
        mode: session.mode,
      });
      const result = await createLicenseFromCheckoutSession(session);
      console.log("[stripe webhook] resultado da criação de licença:", result);
      return res.status(200).json({ received: true, ...result });
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
      // A partir de uma certa versão da API do Stripe, o vínculo entre
      // fatura e assinatura pode vir em invoice.parent.subscription_details
      // em vez de invoice.subscription direto (o campo antigo às vezes some
      // — foi isso que apareceu como "subscriptionId: undefined" no log real
      // que o Marcelo mandou). Tenta os dois caminhos, o antigo primeiro.
      const invoiceSubscriptionId =
        invoice.subscription || invoice.parent?.subscription_details?.subscription || null;
      console.log("[stripe webhook] invoice.paid recebido:", {
        invoiceId: invoice.id,
        subscriptionId: invoiceSubscriptionId,
        amount_paid: invoice.amount_paid,
        billing_reason: invoice.billing_reason,
        customer_email: invoice.customer_email,
      });

      // Assinatura com teste grátis gera uma fatura de R$ 0 já no início
      // (o Stripe cria e "paga" ela sozinho, mesmo sem cobrar nada de
      // verdade) — isso disparava esse mesmo webhook "invoice.paid" quase
      // junto com o "checkout.session.completed", e como esse trecho não
      // sabia diferenciar uma fatura de R$ 0 de uma cobrança de verdade,
      // ele sobrescrevia a licença (criada como "trial", 7 dias) direto
      // pra "monthly"/30 dias — ANTES da pessoa nem terminar de ativar a
      // conta.
      //
      // BUG CORRIGIDO NESTA SESSÃO: a versão anterior ignorava o evento se
      // (valor pago é zero) OU (motivo é "subscription_create") — só que
      // TODA fatura inicial de QUALQUER assinatura nova (com trial ou sem)
      // tem billing_reason "subscription_create", mesmo quando é uma
      // cobrança de verdade (assinatura direta, sem trial, cobrada na
      // hora). Com o "OU", isso ignorava cobranças reais também, não só a
      // fatura de R$0 do trial — e como "checkout.session.completed" não
      // estava configurado no Stripe (achado nesta mesma sessão), NADA
      // criava a licença nem mandava e-mail pra assinatura nenhuma,
      // trial ou paga. Agora exige as DUAS condições ao mesmo tempo (E):
      // só ignora quando o valor é zero E o motivo é criação — é
      // exatamente o perfil da fatura de trial, e nunca o de uma cobrança
      // de verdade (que sempre tem amount_paid > 0, então essa condição
      // nunca é satisfeita pra ela, mesmo com billing_reason igual).
      if ((invoice.amount_paid || 0) === 0 && invoice.billing_reason === "subscription_create") {
        console.log("[stripe webhook] invoice.paid IGNORADO (fatura inicial de trial, R$0):", invoice.id);
        return res.status(200).json({ received: true, ignored: true, reason: "zero_amount_trial_invoice" });
      }

      const subscriptionId = invoiceSubscriptionId;
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
        console.log("[stripe webhook] invoice.paid vai ATUALIZAR licença existente:", {
          licenseId: existingLicense.id,
          typeAntes: existingLicense.type,
          typeDepois: plan,
          wasTrial,
          billing_reason: invoice.billing_reason,
        });
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
          `INSERT INTO licenses (code, status, type, stripe_customer_id, stripe_subscription_id, buyer_email, source)
           VALUES ($1, 'unused', $2, $3, $4, $5, 'stripe')`,
          [code, plan, customerId, subscriptionId, buyerEmail.trim().toLowerCase()]
        );
        await sendLicensePurchasedEmail(buyerEmail, code, process.env.APP_URL || "");
      }
      return res.status(200).json({ received: true });
    }

    // "charge.dispute.created" — a pessoa contestou a cobrança direto no
    // banco/operadora do cartão (chargeback). Por padrão, o Stripe NÃO
    // cancela a assinatura sozinho nesse caso — ela continuaria tentando
    // cobrar de novo no ciclo seguinte, e a pessoa continuaria com acesso
    // ao Precifica mesmo tendo contestado o pagamento. Corrigido aqui:
    // assim que uma disputa é aberta, revoga a licença na hora (a pessoa
    // perde o acesso imediatamente) e cancela a assinatura de verdade no
    // Stripe (pra parar de tentar cobrar nos ciclos seguintes). Precisa
    // estar marcado como evento inscrito no painel do Stripe, igual
    // qualquer outro evento novo (Developers → Webhooks → conferir a
    // lista de eventos do endpoint).
    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object;
      console.log("[stripe webhook] disputa de cobrança recebida:", {
        disputeId: dispute.id,
        chargeId: dispute.charge,
        reason: dispute.reason,
        amount: dispute.amount,
      });
      try {
        const charge = await stripe.charges.retrieve(dispute.charge, { expand: ["invoice"] });
        const subscriptionId = charge.invoice?.subscription || null;
        if (!subscriptionId) {
          console.log("[stripe webhook] disputa sem assinatura associada, nada a revogar:", dispute.id);
          return res.status(200).json({ received: true, ignored: true, reason: "no_subscription" });
        }
        const { rows } = await pool.query("SELECT * FROM licenses WHERE stripe_subscription_id = $1 LIMIT 1", [
          subscriptionId,
        ]);
        const license = rows[0];
        if (license) {
          await pool.query(
            "UPDATE licenses SET status = 'revoked', cancelled_at = now() WHERE id = $1",
            [license.id]
          );
          console.log(`[stripe webhook] licença ${license.code} REVOGADA por disputa de cobrança`);
        }
        try {
          await stripe.subscriptions.cancel(subscriptionId);
          console.log("[stripe webhook] assinatura cancelada por disputa:", subscriptionId);
        } catch (cancelErr) {
          // Pode já estar cancelada, ou já ter acabado sozinha — não é
          // motivo pra falhar o processamento do webhook por causa disso.
          console.error("Erro ao cancelar assinatura após disputa (pode já estar cancelada):", cancelErr.message);
        }
      } catch (err) {
        console.error("Erro ao processar disputa de cobrança:", err.message);
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

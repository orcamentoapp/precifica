const express = require("express");
const Stripe = require("stripe");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { createCheckoutSession, cancelSubscriptionAtPeriodEnd } = require("../utils/stripe");
const { createOneTimePaymentPreference } = require("../utils/mercadopago");
const { mercadopagoWebhookHandler } = require("./mercadopagoWebhook");
const { createLicenseFromCheckoutSession } = require("../utils/checkoutLicense");

const router = express.Router();

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- ASSINATURA por cartão (rota pública, chamada pela página de compra) ----------
// body: { email, plan: "monthly" | "annual", trial: boolean }
router.post("/stripe/checkout", async (req, res) => {
  const { email, plan, trial } = req.body || {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "E-mail inválido" });
  }
  const safePlan = plan === "annual" ? "annual" : "monthly";

  try {
    const { rows: existingUser } = await pool.query("SELECT id FROM users WHERE email = $1", [
      email.trim().toLowerCase(),
    ]);
    if (existingUser[0]) {
      return res
        .status(409)
        .json({ error: "Já existe uma conta com esse e-mail. Faça login em vez de assinar de novo." });
    }

    const session = await createCheckoutSession({ email: email.trim(), plan: safePlan, trial: !!trial });
    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Erro ao criar checkout Stripe:", err.message);
    res.status(500).json({ error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." });
  }
});

// ---------- CONFIRMAÇÃO SÍNCRONA do checkout (não depende de webhook) ----------
// Criada depois de descobrir que "checkout.session.completed" não estava
// chegando no webhook de jeito nenhum (não é possível saber à distância se
// isso já foi corrigido no painel do Stripe ou não, e enquanto não for,
// ninguém que faz teste grátis recebe e-mail/licença até 7 dias depois).
// Em vez de depender só do Stripe entregar o evento, o `success_url` da
// sessão de checkout (`src/utils/stripe.js`) agora inclui o próprio ID da
// sessão (`{CHECKOUT_SESSION_ID}`) — quando a pessoa volta pro app depois de
// pagar, o front chama essa rota com esse ID, e ela busca a sessão DIRETO
// na API do Stripe (sem esperar nenhum evento chegar) e cria a licença na
// hora. Reaproveita o mesmo helper que o webhook usa
// (`createLicenseFromCheckoutSession`), então se o webhook também estiver
// funcionando, os dois caminhos não duplicam nada (checagem por
// stripe_subscription_id já existente).
router.post("/stripe/confirm-checkout", async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "ID de sessão inválido" });
  }
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status !== "complete") {
      return res.status(200).json({ created: false, reason: "session_not_complete" });
    }
    const result = await createLicenseFromCheckoutSession(session);
    res.json(result);
  } catch (err) {
    console.error("Erro ao confirmar checkout Stripe:", err.message);
    // Nunca quebra a experiência do usuário por causa disso — o webhook
    // (se estiver configurado) ainda pode criar a licença por trás. Só
    // avisa que não deu pra confirmar na hora.
    res.status(200).json({ created: false, reason: "confirm_error" });
  }
});

// ---------- RENOVAR/TROCAR DE PLANO (pessoa já logada, rota autenticada) ----------
// Diferente de "/stripe/checkout" (pública, pra quem ainda não tem conta):
// aqui a pessoa já está logada, então não faz sentido pedir e-mail de novo
// nem oferecer teste grátis (isso só pode ser usado uma vez, na primeira
// assinatura). body: { plan: "monthly" | "annual" }
router.post("/stripe/renew-checkout", requireAuth, async (req, res) => {
  const { plan } = req.body || {};
  const safePlan = plan === "annual" ? "annual" : "monthly";
  try {
    const session = await createCheckoutSession({
      email: req.user.email,
      plan: safePlan,
      trial: false,
      renewalUserId: req.user.sub,
    });
    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Erro ao criar checkout de renovação Stripe:", err.message);
    res.status(500).json({ error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." });
  }
});

// ---------- DADOS DO CARTÃO usado na assinatura (só pra exibir, nunca guardamos isso aqui) ----------
// Busca direto na API do Stripe, na hora — o Precifica nunca armazena
// número de cartão nem nada parecido (nem precisa: quem processa e guarda
// isso com segurança é o Stripe, a gente só mostra os 4 últimos dígitos e
// a bandeira pra pessoa saber em qual cartão ela assinou). Retorna null
// quando não tem assinatura Stripe (licença gerada pelo admin, por
// exemplo) — o front trata isso simplesmente não mostrando nada.
router.get("/stripe/payment-method", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM licenses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [req.user.sub]
    );
    const license = rows[0];
    if (!license || !license.stripe_subscription_id) {
      return res.json({ card: null });
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const subscription = await stripe.subscriptions.retrieve(license.stripe_subscription_id, {
      expand: ["default_payment_method", "customer.invoice_settings.default_payment_method"],
    });
    let paymentMethod = subscription.default_payment_method;
    if (!paymentMethod && subscription.customer && typeof subscription.customer === "object") {
      paymentMethod = subscription.customer.invoice_settings?.default_payment_method || null;
    }
    if (!paymentMethod || typeof paymentMethod === "string") {
      // Não veio expandido por algum motivo — busca direto no cliente como último recurso.
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
      if (customerId) {
        const customer = await stripe.customers.retrieve(customerId, {
          expand: ["invoice_settings.default_payment_method"],
        });
        paymentMethod = customer.invoice_settings?.default_payment_method || null;
      }
    }
    if (!paymentMethod || !paymentMethod.card) {
      return res.json({ card: null });
    }
    res.json({ card: { brand: paymentMethod.card.brand, last4: paymentMethod.card.last4 } });
  } catch (err) {
    console.error("Erro ao buscar dados do cartão no Stripe:", err.message);
    // Melhor esforço: não quebra a tela de Configurações por causa disso.
    res.json({ card: null });
  }
});

// ---------- CANCELAR a renovação automática da assinatura (cartão) ----------
// Não tira o acesso na hora — só impede a próxima cobrança. A pessoa
// continua podendo usar até a data de expiração que já tinha pago.
router.post("/stripe/cancel-subscription", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM licenses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [req.user.sub]
    );
    const license = rows[0];
    if (!license || !license.stripe_subscription_id) {
      return res.status(400).json({ error: "Você não tem uma assinatura por cartão ativa pra cancelar." });
    }
    await cancelSubscriptionAtPeriodEnd(license.stripe_subscription_id);
    await pool.query(
      "UPDATE licenses SET cancel_at_period_end = true, cancelled_at = now() WHERE id = $1",
      [license.id]
    );
    res.json({ success: true, expiresAt: license.expires_at });
  } catch (err) {
    console.error("Erro ao cancelar assinatura Stripe:", err.message);
    res.status(500).json({ error: "Não foi possível cancelar agora. Tente novamente em instantes." });
  }
});

// ---------- PAGAMENTO ÚNICO via Mercado Pago (Pix/Boleto/cartão avulso) ----------
// Rota pública (compra nova, sem conta ainda) — body: { email, plan }
router.post("/mercadopago/checkout", async (req, res) => {
  const { email, plan } = req.body || {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "E-mail inválido" });
  }
  const safePlan = plan === "annual" ? "annual" : "monthly";
  try {
    const { rows: existingUser } = await pool.query("SELECT id FROM users WHERE email = $1", [
      email.trim().toLowerCase(),
    ]);
    if (existingUser[0]) {
      return res
        .status(409)
        .json({ error: "Já existe uma conta com esse e-mail. Faça login em vez de comprar de novo." });
    }

    const checkoutUrl = await createOneTimePaymentPreference({ email: email.trim(), plan: safePlan });
    res.json({ checkoutUrl });
  } catch (err) {
    console.error("Erro ao criar pagamento Mercado Pago:", err.message);
    res.status(500).json({ error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." });
  }
});

// Rota autenticada (renovação de quem já está logado) — body: { plan }
router.post("/mercadopago/renew-checkout", requireAuth, async (req, res) => {
  const { plan } = req.body || {};
  const safePlan = plan === "annual" ? "annual" : "monthly";
  try {
    const checkoutUrl = await createOneTimePaymentPreference({
      email: req.user.email,
      plan: safePlan,
      userId: req.user.sub,
    });
    res.json({ checkoutUrl });
  } catch (err) {
    console.error("Erro ao criar pagamento de renovação Mercado Pago:", err.message);
    res.status(500).json({ error: "Não foi possível iniciar o pagamento agora. Tente novamente em instantes." });
  }
});

// Webhook do Mercado Pago (chamado pelo próprio Mercado Pago, não pelo app)
router.post("/mercadopago/webhook", mercadopagoWebhookHandler);

module.exports = router;

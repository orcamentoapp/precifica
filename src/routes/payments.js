const express = require("express");
const Stripe = require("stripe");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const {
  createCheckoutSession,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
  createBillingPortalSession,
  getClient,
} = require("../utils/stripe");
const { createLicenseFromCheckoutSession } = require("../utils/checkoutLicense");
const { checkoutLimiter } = require("../middleware/rateLimit");
const { getPricing, getFounderStatus } = require("../utils/pricingSettings");

const router = express.Router();

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- PREÇO ATUAL (rota pública, sem login) ----------
// Usada pelas telas de compra (Buy.jsx, pra quem ainda nem tem conta) e de
// renovação (já logado, mas é a mesma fonte pra nunca mostrar um valor
// diferente do que vai ser cobrado de verdade). Só devolve o número — nunca
// expõe nada sensível, então não precisa de autenticação.
router.get("/pricing", async (req, res) => {
  try {
    const { monthlyPrice, annualPrice } = await getPricing();
    const founder = await getFounderStatus();
    res.json({
      monthlyPrice,
      annualPrice,
      // Só o necessário pra tela de compra/landing (sem expor contagem
      // interna quando a oferta está desligada).
      founder: founder.available ? { price: founder.price, remaining: founder.remaining, limit: founder.limit } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar o preço" });
  }
});

// ---------- ASSINATURA por cartão (rota pública, chamada pela página de compra) ----------
// body: { email, plan: "monthly" | "annual", trial: boolean }
router.post("/stripe/checkout", checkoutLimiter, async (req, res) => {
  const { email, plan, trial, acceptedTerms } = req.body || {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "E-mail inválido" });
  }
  if (acceptedTerms !== true) {
    return res.status(400).json({ error: "Pra continuar, aceite os Termos de Uso e a Política de Privacidade." });
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

    const session = await createCheckoutSession({ email: email.trim(), plan: safePlan, trial: !!trial, termsAccepted: true });
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
router.post("/stripe/confirm-checkout", checkoutLimiter, async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId || typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
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

// ---------- RENOVAR (pessoa já logada, rota autenticada) ----------
// Antes, "Renovar" SEMPRE criava uma assinatura nova e cobrava na hora —
// quem tinha cancelado mas ainda estava dentro do período pago pagava de
// novo e perdia os dias que faltavam. Agora:
// - assinatura antiga ainda ativa (só marcada pra cancelar no fim do
//   período): desfaz o cancelamento, SEM cobrança nova — volta a renovar
//   sozinha na data de sempre. Responde { reactivated: true }.
// - assinatura ativa e sem cancelamento: não há o que renovar (409).
// - assinatura com pagamento pendente (cartão recusado) ou já encerrada:
//   cria um checkout novo; a antiga é cancelada quando o pagamento novo
//   for confirmado (ver checkoutLicense.js), pra nunca cobrar nas duas.
// body: { plan: "monthly" | "annual" }
router.post("/stripe/renew-checkout", requireAuth, checkoutLimiter, async (req, res) => {
  const { plan } = req.body || {};
  const safePlan = plan === "annual" ? "annual" : "monthly";
  try {
    const { rows } = await pool.query("SELECT * FROM licenses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [
      req.user.sub,
    ]);
    const license = rows[0];
    if (license && license.stripe_subscription_id && license.status !== "revoked") {
      let sub = null;
      try {
        sub = await getClient().subscriptions.retrieve(license.stripe_subscription_id);
      } catch (err) {
        if (err.code !== "resource_missing") throw err;
      }
      const sameInterval =
        !sub ||
        ((sub.items?.data?.[0]?.price?.recurring?.interval || "month") === (safePlan === "annual" ? "year" : "month"));
      // Assinatura ainda ativa (dentro do período pago) e marcada pra
      // cancelar: reativa a MESMA assinatura, qualquer que seja o plano
      // escolhido (a tela nem oferece troca nesse caso).
      if (sub && (sub.status === "active" || sub.status === "trialing") && (sameInterval || sub.cancel_at_period_end)) {
        if (sub.cancel_at_period_end) {
          await reactivateSubscription(sub.id);
          await pool.query("UPDATE licenses SET cancel_at_period_end = false, cancelled_at = NULL WHERE id = $1", [license.id]);
          return res.json({ reactivated: true, expiresAt: license.expires_at });
        }
        return res.status(409).json({ error: "Sua assinatura já está ativa e renova automaticamente — não precisa renovar." });
      }
      if (sub && (sub.status === "active" || sub.status === "trialing") && !sameInterval) {
        // Troca de plano com assinatura ativa: cobraria nas duas — por
        // enquanto é pelo suporte (Stripe faz a troca proporcional).
        return res.status(409).json({
          error: "Sua assinatura está ativa. Pra trocar entre mensal e anual, fale com o suporte: suporte@verterelabs.com",
        });
      }
      if (sub && (sub.status === "past_due" || sub.status === "unpaid" || sub.status === "incomplete")) {
        // Cartão recusado: o caminho certo é trocar o cartão no portal (a
        // própria cobrança pendente é refeita). Se a pessoa preferir pagar
        // por um checkout novo, a antiga é cancelada após a confirmação.
        console.log("[renovação] assinatura com pagamento pendente, criando checkout novo:", sub.id, sub.status);
      }
    }

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

// ---------- PORTAL DE COBRANÇA (trocar cartão, ver faturas) ----------
// Abre o portal hospedado pelo próprio Stripe. Funciona mesmo com a
// licença vencida (é justamente quando a pessoa mais precisa trocar o
// cartão). Precisa estar ativado no painel do Stripe — ver README.
router.post("/stripe/portal", requireAuth, checkoutLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT stripe_customer_id FROM licenses WHERE user_id = $1 AND stripe_customer_id IS NOT NULL ORDER BY created_at DESC LIMIT 1",
      [req.user.sub]
    );
    if (!rows[0]) {
      return res.status(400).json({ error: "Sua conta não tem assinatura por cartão pra gerenciar." });
    }
    const returnUrl = `${(process.env.APP_URL || "").replace(/\/$/, "")}/configuracoes`;
    const session = await createBillingPortalSession(rows[0].stripe_customer_id, returnUrl);
    res.json({ url: session.url });
  } catch (err) {
    console.error("Erro ao abrir portal de cobrança Stripe:", err.message);
    const notConfigured = /configuration|portal/i.test(err.message || "");
    res.status(500).json({
      error: notConfigured
        ? "O gerenciamento de pagamento ainda não está disponível. Fale com o suporte."
        : "Não foi possível abrir o gerenciamento de pagamento agora. Tente novamente em instantes.",
    });
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

module.exports = router;

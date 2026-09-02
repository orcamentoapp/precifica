// Integração com o Mercado Pago — usada SÓ pro pagamento único (+30 ou +365
// dias, via Pix, Boleto ou cartão avulso). A assinatura recorrente continua
// 100% no Stripe (ver src/utils/stripe.js) — o Mercado Pago não entra nisso.
//
// SEGURANÇA — CVE-2026-76842: o SDK oficial do Mercado Pago pra Node.js tem
// uma vulnerabilidade conhecida (corrigida a partir da versão 3.5.0; aqui
// fixamos ^3.6.0) em que IDs não sanitizados passados pra métodos como
// payment.get/capture/cancel podem ser usados pra manipular a URL da
// requisição (path injection), vazando o access token pra outro endpoint.
// Por isso, ALÉM de fixar a versão corrigida, validamos manualmente que
// qualquer ID vindo de fora (ex: do corpo de um webhook) é só dígitos antes
// de usar em qualquer chamada da SDK — ver validatePaymentId() e seu uso em
// mercadopagoWebhook.js. Nunca remova essa validação, mesmo que a SDK já
// esteja corrigida — é defesa em profundidade.
const crypto = require("crypto");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");

function getClient() {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado no ambiente");
  return new MercadoPagoConfig({ accessToken, options: { timeout: 8000 } });
}

// Só dígitos — todo ID de pagamento do Mercado Pago é numérico. Rejeita
// qualquer coisa que não bata com isso (proteção contra path injection,
// ver nota de segurança no topo do arquivo).
function validatePaymentId(id) {
  const str = String(id || "");
  if (!/^\d+$/.test(str)) {
    throw new Error("ID de pagamento inválido (esperado só dígitos): " + JSON.stringify(id));
  }
  return str;
}

// plan: "monthly" (30 dias) ou "annual" (365 dias)
// userId: vazio = compra nova (sem conta ainda); preenchido = renovação de
// quem já está logado. Vai dentro de "external_reference", que volta
// intacto no webhook — é assim que sabemos o que fazer quando o pagamento
// é aprovado.
async function createOneTimePaymentPreference({ email, plan = "monthly", userId }) {
  const client = getClient();
  const preference = new Preference(client);
  const isAnnual = plan === "annual";
  const monthlyPrice = Number(process.env.PRECIFICA_MONTHLY_PRICE) || 99.9;
  const annualPrice = Number(process.env.PRECIFICA_ANNUAL_PRICE) || 599.9;
  const unitPrice = isAnnual ? annualPrice : monthlyPrice;
  const title = isAnnual ? "Precifica — Renovação anual (365 dias)" : "Precifica — Renovação mensal (30 dias)";
  const appUrl = process.env.APP_URL || "";
  const externalReference = JSON.stringify({ plan: isAnnual ? "annual" : "monthly", userId: userId ? String(userId) : "" });

  const result = await preference.create({
    body: {
      items: [
        {
          id: isAnnual ? "precifica-annual" : "precifica-monthly",
          title,
          quantity: 1,
          currency_id: "BRL",
          unit_price: unitPrice,
        },
      ],
      payer: { email },
      back_urls: {
        success: `${appUrl}/?checkout=sucesso`,
        pending: `${appUrl}/?checkout=pendente`,
        failure: `${appUrl}/?checkout=cancelado`,
      },
      auto_return: "approved",
      external_reference: externalReference,
      notification_url: `${appUrl}/api/payments/mercadopago/webhook`,
      statement_descriptor: "PRECIFICA",
    },
  });

  // Em produção use init_point; em conta/credencial de teste o Mercado Pago
  // só libera sandbox_init_point — usamos o que vier preenchido.
  return result.init_point || result.sandbox_init_point;
}

// Busca um pagamento pelo ID (SEMPRE validado com validatePaymentId antes de
// chegar aqui — ver nota de segurança no topo do arquivo).
async function getPayment(paymentId) {
  const safeId = validatePaymentId(paymentId);
  const client = getClient();
  const payment = new Payment(client);
  return payment.get({ id: safeId });
}

// Confere a assinatura HMAC que o Mercado Pago manda no header
// "x-signature" — sem isso, qualquer um poderia mandar uma notificação
// falsa pro nosso webhook fingindo que um pagamento foi aprovado.
function verifyWebhookSignature({ xSignature, xRequestId, dataId }) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) throw new Error("MERCADOPAGO_WEBHOOK_SECRET não configurado no ambiente");
  if (!xSignature || !xRequestId || !dataId) return false;

  const parts = Object.fromEntries(
    xSignature.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    })
  );
  const ts = parts.ts;
  const receivedHash = parts.v1;
  if (!ts || !receivedHash) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expectedHash = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  // Comparação em tempo constante — evita vazar a resposta certa por
  // tempo de resposta (timing attack).
  const a = Buffer.from(expectedHash, "utf8");
  const b = Buffer.from(receivedHash, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { createOneTimePaymentPreference, getPayment, verifyWebhookSignature, validatePaymentId };

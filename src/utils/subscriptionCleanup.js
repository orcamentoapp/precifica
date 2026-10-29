// Cancela IMEDIATAMENTE a assinatura do Stripe ligada a um usuário — usado
// quando o acesso dele acaba por decisão nossa ou dele mesmo (admin exclui,
// bloqueia ou revoga; a própria pessoa exclui a conta). Antes disso, essas
// ações tiravam o acesso mas o Stripe continuava cobrando todo mês.
//
// "Melhor esforço": se o Stripe falhar (fora do ar, assinatura já
// cancelada), loga e devolve o erro em vez de quebrar a ação principal —
// quem chamou decide se avisa na tela.
const Stripe = require("stripe");
const pool = require("../db");

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function cancelSubscriptionNow(subscriptionId) {
  if (!subscriptionId) return { cancelled: false, reason: "no_subscription" };
  const stripe = getStripe();
  if (!stripe) return { cancelled: false, reason: "stripe_not_configured" };
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (sub.status === "canceled" || sub.status === "incomplete_expired") {
      return { cancelled: false, reason: "already_cancelled" };
    }
    await stripe.subscriptions.cancel(subscriptionId);
    return { cancelled: true };
  } catch (err) {
    if (err && err.code === "resource_missing") return { cancelled: false, reason: "not_found" };
    console.error("Erro ao cancelar assinatura no Stripe:", subscriptionId, err.message);
    return { cancelled: false, reason: "stripe_error", error: err.message };
  }
}

// Cancela TODAS as assinaturas Stripe de licenças desse usuário (normalmente
// é uma só, mas uma troca de plano antiga pode ter deixado outra).
async function cancelAllSubscriptionsForUser(userId, db = pool) {
  const { rows } = await db.query(
    "SELECT id, stripe_subscription_id FROM licenses WHERE user_id = $1 AND stripe_subscription_id IS NOT NULL",
    [userId]
  );
  const results = [];
  for (const row of rows) {
    const r = await cancelSubscriptionNow(row.stripe_subscription_id);
    results.push({ licenseId: row.id, subscriptionId: row.stripe_subscription_id, ...r });
    if (r.cancelled || r.reason === "already_cancelled" || r.reason === "not_found") {
      await db.query("UPDATE licenses SET cancel_at_period_end = true, cancelled_at = COALESCE(cancelled_at, now()) WHERE id = $1", [row.id]);
    }
  }
  const failed = results.filter((r) => r.reason === "stripe_error");
  return { results, ok: failed.length === 0 };
}

module.exports = { cancelSubscriptionNow, cancelAllSubscriptionsForUser };

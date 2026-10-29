// Regras de validade de licença — num lugar só (usado pelo login/`/me` e
// pelo middleware que protege as gravações, `requireValidLicense`).

// Tolerância pra assinaturas de cartão que RENOVAM sozinhas: a cobrança do
// Stripe às vezes chega algumas horas depois do vencimento (fuso, fila,
// retentativa do banco). Sem essa folga, a pessoa ficava bloqueada nesse
// meio-tempo mesmo estando tudo certo. Só vale pra quem tem assinatura
// ativa no Stripe e NÃO pediu cancelamento — licença manual, cancelada ou
// revogada vence na data exata.
const GRACE_HOURS = Number(process.env.LICENSE_GRACE_HOURS) || 48;

function hasRenewalGrace(license) {
  return !!license.stripe_subscription_id && !license.cancel_at_period_end;
}

// Data em que a licença deixa de valer de fato (com a tolerância, se houver).
function effectiveExpiry(license) {
  if (!license.expires_at) return null;
  const base = new Date(license.expires_at);
  return hasRenewalGrace(license) ? new Date(base.getTime() + GRACE_HOURS * 60 * 60 * 1000) : base;
}

function isLicenseValidNow(license, now = new Date()) {
  if (!license || license.status !== "active") return false;
  const eff = effectiveExpiry(license);
  return !eff || eff >= now;
}

// Busca a licença mais recente de um usuário e calcula se ela está válida
// agora (não expirada, não revogada). Atualiza o status no banco quando
// detecta que acabou de expirar.
async function getLicenseStatusForUser(pool, userId) {
  const { rows } = await pool.query("SELECT * FROM licenses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [
    userId,
  ]);
  const license = rows[0];
  if (!license) {
    return { hasLicense: false, valid: false, reason: "no_license" };
  }

  const now = new Date();
  const expiresAt = license.expires_at ? new Date(license.expires_at) : null;
  const eff = effectiveExpiry(license);
  const isExpired = eff ? eff < now : false;
  const isRevoked = license.status === "revoked";

  if (isExpired && license.status === "active") {
    await pool.query("UPDATE licenses SET status = 'expired' WHERE id = $1", [license.id]);
    license.status = "expired";
  }
  await pool.query("UPDATE licenses SET last_validated_at = now() WHERE id = $1", [license.id]);

  const valid = license.status === "active" && !isExpired;
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000))) : null;

  let reason = null;
  if (!valid) {
    if (isRevoked) reason = "revoked";
    else if (isExpired || license.status === "expired") reason = "expired";
    else reason = "inactive";
  }

  return {
    hasLicense: true,
    valid,
    reason,
    code: license.code,
    type: license.type,
    expiresAt: license.expires_at,
    activatedAt: license.activated_at,
    daysLeft,
    // Dentro da tolerância: venceu, mas a renovação automática ainda pode
    // chegar — o app pode mostrar "aguardando confirmação do pagamento".
    inGracePeriod: valid && !!expiresAt && expiresAt < now,
    hasStripeSubscription: !!license.stripe_subscription_id,
    cancelAtPeriodEnd: !!license.cancel_at_period_end,
  };
}

module.exports = { getLicenseStatusForUser, isLicenseValidNow, GRACE_HOURS };

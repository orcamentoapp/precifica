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
  const isExpired = expiresAt ? expiresAt < now : false;
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
    daysLeft,
    hasStripeSubscription: !!license.stripe_subscription_id,
  };
}

module.exports = { getLicenseStatusForUser };

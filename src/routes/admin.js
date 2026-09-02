const express = require("express");
const pool = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { generateLicenseCode } = require("../utils/licenseCode");

const router = express.Router();
const LICENSE_DURATION_DAYS = Number(process.env.LICENSE_DURATION_DAYS) || 30;
const TRIAL_DURATION_DAYS = Number(process.env.TRIAL_DURATION_DAYS) || 7;
const ANNUAL_DURATION_DAYS = Number(process.env.ANNUAL_DURATION_DAYS) || 365;

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// Duração (em dias) de acordo com o tipo da licença — usado tanto pra gerar
// quanto pra renovar (renovar uma chave anual precisa somar 365 dias, não os
// 30 dias fixos que era usado antes de existir mais de um tipo de licença).
function durationDaysForType(type) {
  if (type === "trial") return TRIAL_DURATION_DAYS;
  if (type === "annual") return ANNUAL_DURATION_DAYS;
  return LICENSE_DURATION_DAYS;
}

// Tudo aqui embaixo exige um usuário logado com role = 'admin'
router.use(requireAdmin);

// Lista os usuários (clientes), já trazendo a licença mais recente de cada um
router.get("/users", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.email, u.name, u.clinic_name, u.status, u.email_verified, u.created_at,
        l.id AS license_id,
        l.code AS license_code,
        l.status AS license_status,
        l.type AS license_type,
        l.expires_at AS license_expires_at
      FROM users u
      LEFT JOIN LATERAL (
        SELECT * FROM licenses WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
      ) l ON true
      WHERE u.role = 'user'
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar usuários" });
  }
});

// Bloqueia ou reativa um usuário
router.post("/users/:id/status", async (req, res) => {
  const { status } = req.body || {};
  if (!["active", "blocked"].includes(status)) {
    return res.status(400).json({ error: "Status inválido (use 'active' ou 'blocked')" });
  }
  try {
    const { rows } = await pool.query(
      "UPDATE users SET status = $1 WHERE id = $2 AND role = 'user' RETURNING id, email, status",
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Usuário não encontrado" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao alterar status do usuário" });
  }
});

// Remove um usuário (a licença dele fica órfã — não é apagada; já os dados
// do simulador em `app_data` SÃO apagados automaticamente, via ON DELETE
// CASCADE na foreign key — não precisa de nenhum DELETE extra aqui)
router.delete("/users/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1 AND role = 'user'", [req.params.id]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao remover usuário" });
  }
});

// Gera uma chave de licença NOVA e SOLTA (sem usuário ainda) — é essa chave
// que você entrega pro cliente depois que ele pagar, pra ele usar no cadastro.
// type: "monthly" (30 dias, padrão), "trial" (7 dias) ou "annual" (365 dias)
router.post("/licenses", async (req, res) => {
  const { type } = req.body || {};
  const licenseType = ["trial", "annual"].includes(type) ? type : "monthly";
  try {
    const code = generateLicenseCode();
    const { rows } = await pool.query(
      "INSERT INTO licenses (code, status, type) VALUES ($1, 'unused', $2) RETURNING *",
      [code, licenseType]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar a licença" });
  }
});

// Lista todas as licenças (usadas ou não), com o e-mail do dono quando existir
router.get("/licenses", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT l.*, u.email AS user_email, u.name AS user_name, u.clinic_name
      FROM licenses l
      LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar licenças" });
  }
});

// Renova uma licença: soma os dias correspondentes ao TIPO dela (mensal,
// trial ou anual) a partir de agora — cada tipo renova pela sua própria
// duração, não um valor fixo pra todas.
router.post("/licenses/:id/renew", async (req, res) => {
  try {
    const { rows: currentRows } = await pool.query("SELECT type FROM licenses WHERE id = $1", [req.params.id]);
    if (!currentRows[0]) return res.status(404).json({ error: "Licença não encontrada" });
    const expiresAt = addDays(new Date(), durationDaysForType(currentRows[0].type));
    const { rows } = await pool.query(
      "UPDATE licenses SET expires_at = $1, status = 'active' WHERE id = $2 RETURNING *",
      [expiresAt, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao renovar licença" });
  }
});

// Revoga uma licença (fica inválida mesmo sem ter expirado)
router.post("/licenses/:id/revoke", async (req, res) => {
  try {
    const { rows } = await pool.query("UPDATE licenses SET status = 'revoked' WHERE id = $1 RETURNING *", [
      req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Licença não encontrada" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao revogar licença" });
  }
});

// Remove uma licença que ainda não tem dono (sem usuário vinculado) —
// independente do status (unused, active ou expired: cobre tanto chave nunca
// tocada quanto chave que foi renovada/ativada por engano sem ninguém usar).
// Licença já vinculada a um usuário (user_id preenchido) NUNCA é removida por
// aqui — pra isso existe excluir a conta do usuário (DELETE /users/:id).
router.delete("/licenses/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM licenses WHERE id = $1 AND user_id IS NULL", [
      req.params.id,
    ]);
    if (rowCount === 0) {
      return res
        .status(400)
        .json({ error: "Essa chave já está vinculada a uma conta — exclua a conta em vez da chave." });
    }
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao remover licença" });
  }
});

module.exports = router;

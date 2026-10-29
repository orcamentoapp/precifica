// Histórico de orçamentos — UMA LINHA POR ORÇAMENTO na tabela `budgets`.
//
// Antes, o histórico inteiro era um único JSON em app_data (chave
// "budgetHistory"), cortado em 200 orçamentos (os mais antigos eram
// apagados sem aviso) e reenviado inteiro a cada orçamento salvo. Agora não
// tem limite de quantidade, salvar/excluir mexe só naquele orçamento, e
// dois aparelhos salvando orçamentos diferentes não se atropelam.
//
// MIGRAÇÃO AUTOMÁTICA: na primeira vez que uma conta antiga abre o app
// depois dessa mudança, o GET importa o JSON antigo pra cá (numa transação)
// e renomeia a chave antiga pra "budgetHistory_migrated" — fica guardada
// como cópia de segurança, nunca é importada duas vezes.
const express = require("express");
const pool = require("../db");
const { requireAuth, requireValidLicense } = require("../middleware/auth");

const router = express.Router();
const MAX_BUDGET_LENGTH = 512 * 1024; // 512KB por orçamento — muito acima do real
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

router.use(requireAuth);

async function migrateLegacyHistory(client, userId) {
  const { rows } = await client.query(
    "SELECT value FROM app_data WHERE user_id = $1 AND key = 'budgetHistory' FOR UPDATE",
    [userId]
  );
  if (!rows[0]) return 0;
  let list = [];
  try {
    const parsed = JSON.parse(rows[0].value || "[]");
    if (Array.isArray(parsed)) list = parsed;
  } catch (e) {
    console.error("budgetHistory antigo ilegível pro usuário", userId, "— mantido como budgetHistory_migrated");
  }
  // A lista antiga é do mais novo pro mais antigo — grava created_at
  // decrescente pra manter exatamente a mesma ordem.
  const now = Date.now();
  let imported = 0;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry || typeof entry !== "object") continue;
    const id = entry.id && ID_RE.test(String(entry.id)) ? String(entry.id) : `legacy-${i}-${now}`;
    const savedAt = entry.savedAt && !isNaN(new Date(entry.savedAt)) ? new Date(entry.savedAt) : new Date(now - i * 1000);
    const res = await client.query(
      `INSERT INTO budgets (user_id, id, data, created_at, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id, id) DO NOTHING`,
      [userId, id, JSON.stringify({ ...entry, id }), savedAt]
    );
    imported += res.rowCount;
  }
  await client.query("DELETE FROM app_data WHERE user_id = $1 AND key = 'budgetHistory_migrated'", [userId]);
  await client.query(
    "UPDATE app_data SET key = 'budgetHistory_migrated', updated_at = now() WHERE user_id = $1 AND key = 'budgetHistory'",
    [userId]
  );
  return imported;
}

// Lista todos os orçamentos (mais novo primeiro).
router.get("/", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const imported = await migrateLegacyHistory(client, req.user.sub);
    if (imported) console.log(`Histórico antigo migrado pra tabela budgets: usuário ${req.user.sub}, ${imported} orçamentos`);
    const { rows } = await client.query(
      "SELECT data FROM budgets WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.sub]
    );
    await client.query("COMMIT");
    const list = [];
    rows.forEach((r) => {
      try {
        list.push(JSON.parse(r.data));
      } catch (e) {
        // linha corrompida — ignora em vez de quebrar o histórico inteiro
      }
    });
    res.json({ budgets: list });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar o histórico de orçamentos" });
  } finally {
    client.release();
  }
});

// Cria ou atualiza UM orçamento. body: { data: objeto do orçamento }
router.put("/:id", requireValidLicense, async (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: "ID inválido" });
  const { data } = req.body || {};
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return res.status(400).json({ error: "Orçamento inválido" });
  }
  const json = JSON.stringify({ ...data, id });
  if (json.length > MAX_BUDGET_LENGTH) return res.status(413).json({ error: "Orçamento grande demais" });
  try {
    await pool.query(
      `INSERT INTO budgets (user_id, id, data, created_at, updated_at) VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (user_id, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [req.user.sub, id, json]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao salvar o orçamento" });
  }
});

// Exclui UM orçamento.
router.delete("/:id", requireValidLicense, async (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: "ID inválido" });
  try {
    await pool.query("DELETE FROM budgets WHERE user_id = $1 AND id = $2", [req.user.sub, id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao excluir o orçamento" });
  }
});

// Apaga o histórico inteiro (botão "Limpar histórico").
router.delete("/", requireValidLicense, async (req, res) => {
  try {
    await pool.query("DELETE FROM budgets WHERE user_id = $1", [req.user.sub]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao limpar o histórico" });
  }
});

module.exports = router;

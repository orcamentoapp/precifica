const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Só essas chaves existem — são exatamente as três coisas que o simulador
// (App.jsx) salva. Qualquer outra chave é rejeitada, pra essa tabela não
// virar um key-value genérico sem controle nenhum.
const ALLOWED_KEYS = new Set(["settings", "procedures", "budgetHistory"]);

// Limite de tamanho por chave — bem generoso pro pior caso real (foto de
// perfil em base64 + histórico cheio de 200 orçamentos), só pra evitar abuso.
const MAX_VALUE_LENGTH = 2 * 1024 * 1024; // 2MB

router.use(requireAuth);

// Lê um dado salvo do usuário logado. Retorna value: null se ainda não
// existir nada salvo (conta nova, ou primeira vez usando essa chave).
router.get("/:key", async (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.has(key)) return res.status(400).json({ error: "Chave inválida" });
  try {
    const { rows } = await pool.query("SELECT value FROM app_data WHERE user_id = $1 AND key = $2", [
      req.user.sub,
      key,
    ]);
    res.json({ key, value: rows[0] ? rows[0].value : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar dados" });
  }
});

// Salva (cria ou atualiza) um dado do usuário logado.
router.put("/:key", async (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.has(key)) return res.status(400).json({ error: "Chave inválida" });
  const { value } = req.body || {};
  if (typeof value !== "string") return res.status(400).json({ error: "Valor inválido" });
  if (value.length > MAX_VALUE_LENGTH) {
    return res.status(413).json({ error: "Dado grande demais pra salvar" });
  }
  try {
    await pool.query(
      `INSERT INTO app_data (user_id, key, value, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [req.user.sub, key, value]
    );
    res.json({ key, value });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao salvar dados" });
  }
});

module.exports = router;

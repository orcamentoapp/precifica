const express = require("express");
const pool = require("../db");
const { requireAuth, requireValidLicense } = require("../middleware/auth");

const router = express.Router();

// Só essas chaves existem — são exatamente as coisas que o simulador
// (App.jsx) salva. Qualquer outra chave é rejeitada, pra essa tabela não
// virar um key-value genérico sem controle nenhum.
// Obs: o histórico de orçamentos NÃO mora mais aqui (agora é a tabela
// `budgets`, uma linha por orçamento — ver routes/budgets.js). A chave
// antiga "budgetHistory" continua aceita só pra leitura de contas que
// ainda não foram migradas.
const ALLOWED_KEYS = new Set(["settings", "procedures", "budgetHistory", "materialsCatalog", "patients", "onboarding"]);
const READ_ONLY_KEYS = new Set(["budgetHistory"]);

// Limite de tamanho por chave — "settings" carrega a logo em base64, por
// isso é o maior. Nas outras, um catálogo enorme de procedimentos/pacientes
// ainda fica muito abaixo disso.
const MAX_VALUE_LENGTH = 3.5 * 1024 * 1024;

router.use(requireAuth);

// Lê um dado salvo do usuário logado. Retorna value: null se ainda não
// existir nada salvo (conta nova, ou primeira vez usando essa chave).
// `version` é o número da gravação atual — o app manda de volta ao salvar,
// pra o servidor perceber se outro aparelho salvou no meio do caminho.
router.get("/:key", async (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.has(key)) return res.status(400).json({ error: "Chave inválida" });
  try {
    const { rows } = await pool.query("SELECT value, version FROM app_data WHERE user_id = $1 AND key = $2", [
      req.user.sub,
      key,
    ]);
    res.json({ key, value: rows[0] ? rows[0].value : null, version: rows[0] ? rows[0].version : 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao carregar dados" });
  }
});

// Salva (cria ou atualiza) um dado do usuário logado.
// body: { value: string, baseVersion?: number }
// - Com baseVersion: só grava se a versão no banco ainda for essa (senão
//   responde 409 — outro aparelho/aba salvou antes; o app avisa a pessoa
//   em vez de apagar o que o outro salvou).
// - Sem baseVersion (versões antigas do app ainda abertas em algum
//   navegador): grava direto, como antes.
// Exige licença válida — sem isso dava pra continuar usando o sistema
// vencido chamando a API direto.
router.put("/:key", requireValidLicense, async (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.has(key) || READ_ONLY_KEYS.has(key)) return res.status(400).json({ error: "Chave inválida" });
  const { value, baseVersion } = req.body || {};
  if (typeof value !== "string") return res.status(400).json({ error: "Valor inválido" });
  if (value.length > MAX_VALUE_LENGTH) {
    return res.status(413).json({ error: "Dado grande demais pra salvar" });
  }
  const hasBase = baseVersion !== undefined && baseVersion !== null;
  const base = Number(baseVersion);
  if (hasBase && (!Number.isInteger(base) || base < 0)) {
    return res.status(400).json({ error: "Versão inválida" });
  }
  try {
    let rows;
    if (!hasBase) {
      ({ rows } = await pool.query(
        `INSERT INTO app_data (user_id, key, value, updated_at, version)
         VALUES ($1, $2, $3, now(), 1)
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), version = app_data.version + 1
         RETURNING version`,
        [req.user.sub, key, value]
      ));
    } else if (base === 0) {
      // Primeira gravação dessa chave nesse aparelho: só cria se ainda não
      // existir — se já existir (outro aparelho criou), é conflito.
      ({ rows } = await pool.query(
        `INSERT INTO app_data (user_id, key, value, updated_at, version)
         VALUES ($1, $2, $3, now(), 1)
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), version = app_data.version + 1
           WHERE app_data.version = 0
         RETURNING version`,
        [req.user.sub, key, value]
      ));
    } else {
      ({ rows } = await pool.query(
        `UPDATE app_data SET value = $3, updated_at = now(), version = version + 1
         WHERE user_id = $1 AND key = $2 AND version = $4
         RETURNING version`,
        [req.user.sub, key, value, base]
      ));
    }
    if (!rows[0]) {
      const { rows: cur } = await pool.query("SELECT version FROM app_data WHERE user_id = $1 AND key = $2", [
        req.user.sub,
        key,
      ]);
      return res.status(409).json({
        error: "Esses dados foram alterados em outro aparelho ou aba.",
        conflict: true,
        currentVersion: cur[0] ? cur[0].version : 0,
      });
    }
    res.json({ key, version: rows[0].version });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao salvar dados" });
  }
});

module.exports = router;

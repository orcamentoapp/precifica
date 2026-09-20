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

const MONTHLY_PRICE = Number(process.env.PRECIFICA_MONTHLY_PRICE) || 99.9;
const ANNUAL_PRICE = Number(process.env.PRECIFICA_ANNUAL_PRICE) || 599.9;

// ---------- VISÃO GERAL — métricas agregadas do negócio ----------
// query: ?days=7|30|90 (padrão 30) — define o período usado nas métricas
// "no período" (novos cadastros, cancelamentos); as métricas de "estado
// atual" (assinantes ativos, MRR, em risco) não dependem de período, são
// sempre o retrato de agora.
router.get("/dashboard-stats", async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const [
      totalUsersRes,
      activePaidRes,
      activeTrialRes,
      planCountsRes,
      conversionRes,
      cancelledInPeriodRes,
      atRiskRes,
      newUsersInPeriodRes,
      recentSignupsRes,
      avgDaysToCancelRes,
      unconfirmedSignupsRes,
    ] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'user'"),
      // Só conta como "assinante pago" quem realmente paga por cartão via
      // Stripe (stripe_subscription_id preenchido) — licença mensal/anual
      // gerada manualmente pelo admin (sem assinatura Stripe por trás) não é
      // receita de verdade, não deve inflar essa métrica nem o MRR abaixo.
      pool.query(
        `SELECT COUNT(*)::int AS n FROM licenses l
         WHERE l.status = 'active' AND l.type IN ('monthly','annual') AND l.user_id IS NOT NULL
           AND l.stripe_subscription_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM users u WHERE u.id = l.user_id)`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n FROM licenses l
         WHERE l.status = 'active' AND l.type = 'trial' AND l.user_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM users u WHERE u.id = l.user_id)`
      ),
      pool.query(
        `SELECT type, COUNT(*)::int AS n FROM licenses l
         WHERE l.status = 'active' AND l.type IN ('monthly','annual') AND l.user_id IS NOT NULL
           AND l.stripe_subscription_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM users u WHERE u.id = l.user_id)
         GROUP BY type`
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE l.trial_started_at IS NOT NULL)::int AS total_trials,
           COUNT(*) FILTER (WHERE l.trial_started_at IS NOT NULL AND l.type IN ('monthly','annual'))::int AS converted
         FROM licenses l
         WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = l.user_id)`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n FROM licenses l
         WHERE l.cancelled_at >= $1
           AND EXISTS (SELECT 1 FROM users u WHERE u.id = l.user_id)`,
        [periodStart]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n FROM licenses l
         WHERE l.cancel_at_period_end = true AND l.status = 'active'
           AND EXISTS (SELECT 1 FROM users u WHERE u.id = l.user_id)`
      ),
      pool.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'user' AND created_at >= $1", [periodStart]),
      pool.query(
        `SELECT u.id, u.email, u.created_at,
                (SELECT type FROM licenses WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) AS license_type
         FROM users u
         WHERE u.role = 'user'
         ORDER BY u.created_at DESC
         LIMIT 8`
      ),
      // Tempo médio (em dias) entre a ativação da licença e o cancelamento —
      // "estado atual" (todo o histórico, não só o período selecionado), pra
      // não ficar um número instável indo e voltando conforme o filtro de
      // dias. Usa created_at como fallback quando não tem activated_at (ex:
      // licença nunca chegou a ser confirmada antes de cancelar).
      pool.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (l.cancelled_at - COALESCE(l.activated_at, l.created_at))) / 86400)::float AS avg_days
         FROM licenses l
         WHERE l.cancelled_at IS NOT NULL
           AND EXISTS (SELECT 1 FROM users u WHERE u.id = l.user_id)`
      ),
      // Contas cadastradas que nunca confirmaram o e-mail — ficam travadas
      // sem conseguir usar o app (não é período, é "estado atual").
      pool.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'user' AND email_verified = false"),
    ]);

    const planCounts = { monthly: 0, annual: 0 };
    planCountsRes.rows.forEach((r) => {
      planCounts[r.type] = r.n;
    });
    const mrr = planCounts.monthly * MONTHLY_PRICE + planCounts.annual * (ANNUAL_PRICE / 12);

    const { total_trials, converted } = conversionRes.rows[0];
    const conversionRate = total_trials > 0 ? (converted / total_trials) * 100 : null;

    // Churn (%): dos assinantes pagos que existiam nesse "universo" (ativos
    // agora + quem cancelou no período), quantos cancelaram — aproximação
    // padrão quando não se guarda um retrato histórico de assinantes no
    // início do período. null quando não há base nenhuma pra calcular (zero
    // ativos e zero cancelamentos no período).
    const activePaidSubscribers = activePaidRes.rows[0].n;
    const cancelledInPeriod = cancelledInPeriodRes.rows[0].n;
    const churnBase = activePaidSubscribers + cancelledInPeriod;
    const churnRate = churnBase > 0 ? (cancelledInPeriod / churnBase) * 100 : null;

    // Ticket médio (ARPU, misturando mensal e anual): MRR dividido pelo
    // número de assinantes pagos ativos — quanto cada assinante representa
    // de receita mensal recorrente, em média.
    const avgTicket = activePaidSubscribers > 0 ? mrr / activePaidSubscribers : null;

    // LTV estimado = ticket médio / churn mensal (decimal) — fórmula clássica
    // de assinatura. Só dá pra estimar com churn > 0 (com churn zero, LTV
    // tenderia a infinito — não é um número útil de mostrar).
    const estimatedLTV = avgTicket != null && churnRate ? avgTicket / (churnRate / 100) : null;

    const avgDaysToCancel = avgDaysToCancelRes.rows[0].avg_days;
    const unconfirmedSignups = unconfirmedSignupsRes.rows[0].n;

    // Receita de verdade recebida no período (não estimada) — busca direto
    // na API do Stripe (soma de amount_paid das faturas pagas no período).
    // Melhor esforço: se o Stripe não estiver configurado ou der erro, essa
    // métrica só some do retorno em vez de quebrar o resto do painel.
    let revenueInPeriod = null;
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const Stripe = require("stripe");
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const periodStartUnix = Math.floor(periodStart.getTime() / 1000);
        let total = 0;
        let startingAfter;
        for (let page = 0; page < 10; page++) {
          const invoices = await stripe.invoices.list({
            status: "paid",
            created: { gte: periodStartUnix },
            limit: 100,
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          });
          invoices.data.forEach((inv) => {
            total += inv.amount_paid || 0;
          });
          if (!invoices.has_more) break;
          startingAfter = invoices.data[invoices.data.length - 1]?.id;
        }
        revenueInPeriod = total / 100;
      } catch (err) {
        console.error("Erro ao buscar receita do Stripe pro painel admin:", err.message);
      }
    }

    res.json({
      days,
      totalUsers: totalUsersRes.rows[0].n,
      activePaidSubscribers,
      activeTrials: activeTrialRes.rows[0].n,
      mrr,
      revenueInPeriod,
      conversionRate,
      cancelledInPeriod,
      atRiskSubscriptions: atRiskRes.rows[0].n,
      newUsersInPeriod: newUsersInPeriodRes.rows[0].n,
      recentSignups: recentSignupsRes.rows,
      churnRate,
      avgTicket,
      estimatedLTV,
      avgDaysToCancel,
      unconfirmedSignups,
    });
  } catch (err) {
    console.error("Erro ao calcular métricas do painel admin:", err);
    res.status(500).json({ error: "Erro ao calcular métricas" });
  }
});

// Detalha, em usuários de verdade, quem compõe um dos números da Visão
// Geral — usado quando o admin clica num card lá (ex: "Assinaturas em
// risco") pra ver a lista de quem está por trás daquele número, em vez de só
// o total. `group` identifica qual card; os grupos com recorte por período
// (newUsers/cancelled/trialConversion) respeitam o mesmo `days` do filtro da
// Visão Geral.
router.get("/dashboard-stats/group", async (req, res) => {
  const group = req.query.group;
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Grupos "estado atual" — não dependem do período selecionado.
  const STATIC_GROUPS = {
    totalUsers: {
      label: "Usuários totais",
      sql: `SELECT u.id, u.email, u.name, u.clinic_name, u.created_at,
                   (SELECT type FROM licenses WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) AS license_type
            FROM users u WHERE u.role = 'user' ORDER BY u.created_at DESC`,
      params: [],
    },
    activePaid: {
      label: "Assinantes pagos ativos",
      sql: `SELECT u.id, u.email, u.name, u.clinic_name, l.type AS license_type, l.expires_at
            FROM licenses l JOIN users u ON u.id = l.user_id
            WHERE l.status = 'active' AND l.type IN ('monthly','annual') AND l.stripe_subscription_id IS NOT NULL
            ORDER BY l.expires_at ASC NULLS LAST`,
      params: [],
    },
    activeTrial: {
      label: "Em teste grátis agora",
      sql: `SELECT u.id, u.email, u.name, u.clinic_name, l.type AS license_type, l.expires_at
            FROM licenses l JOIN users u ON u.id = l.user_id
            WHERE l.status = 'active' AND l.type = 'trial'
            ORDER BY l.expires_at ASC NULLS LAST`,
      params: [],
    },
    atRisk: {
      label: "Assinaturas em risco",
      sql: `SELECT u.id, u.email, u.name, u.clinic_name, l.type AS license_type, l.expires_at
            FROM licenses l JOIN users u ON u.id = l.user_id
            WHERE l.cancel_at_period_end = true AND l.status = 'active'
            ORDER BY l.expires_at ASC NULLS LAST`,
      params: [],
    },
    unconfirmed: {
      label: "Cadastros sem e-mail confirmado",
      sql: `SELECT u.id, u.email, u.name, u.clinic_name, u.created_at
            FROM users u
            WHERE u.role = 'user' AND u.email_verified = false
            ORDER BY u.created_at DESC`,
      params: [],
    },
  };

  try {
    let label, rows;
    if (STATIC_GROUPS[group]) {
      label = STATIC_GROUPS[group].label;
      ({ rows } = await pool.query(STATIC_GROUPS[group].sql));
    } else if (group === "newUsers") {
      label = `Novos cadastros (${days}d)`;
      ({ rows } = await pool.query(
        `SELECT u.id, u.email, u.name, u.clinic_name, u.created_at,
                (SELECT type FROM licenses WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) AS license_type
         FROM users u WHERE u.role = 'user' AND u.created_at >= $1
         ORDER BY u.created_at DESC`,
        [periodStart]
      ));
    } else if (group === "cancelled") {
      label = `Cancelamentos (${days}d)`;
      ({ rows } = await pool.query(
        `SELECT u.id, u.email, u.name, u.clinic_name, l.type AS license_type, l.cancelled_at, l.expires_at
         FROM licenses l JOIN users u ON u.id = l.user_id
         WHERE l.cancelled_at >= $1
         ORDER BY l.cancelled_at DESC`,
        [periodStart]
      ));
    } else if (group === "trialConversion") {
      label = "Conversão trial → pago";
      ({ rows } = await pool.query(
        `SELECT u.id, u.email, u.name, u.clinic_name, l.type AS license_type, l.trial_started_at,
                (l.type IN ('monthly','annual')) AS converted
         FROM licenses l JOIN users u ON u.id = l.user_id
         WHERE l.trial_started_at IS NOT NULL
         ORDER BY l.trial_started_at DESC`
      ));
    } else {
      return res.status(400).json({ error: "Grupo inválido" });
    }
    res.json({ label, users: rows });
  } catch (err) {
    console.error("Erro ao listar usuários do grupo da Visão Geral:", err);
    res.status(500).json({ error: "Erro ao listar usuários desse grupo" });
  }
});

// Série diária de novos cadastros vs cancelamentos no período selecionado —
// alimenta o gráfico de tendência da Visão Geral. Preenche todo dia do
// período com generate_series (mesmo os sem nenhum evento viram 0, em vez de
// sumir do gráfico), sempre calculado na hora a partir dos dados reais atuais
// (sem nenhuma tabela de histórico/snapshot).
router.get("/dashboard-stats/trend", async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const periodStart = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);

  try {
    const { rows } = await pool.query(
      `SELECT gs.day::date AS day,
              COALESCE(su.n, 0)::int AS new_users,
              COALESCE(sc.n, 0)::int AS cancelled
       FROM generate_series($1::date, CURRENT_DATE, '1 day') AS gs(day)
       LEFT JOIN (
         SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS n
         FROM users WHERE role = 'user' AND created_at >= $1
         GROUP BY 1
       ) su ON su.day = gs.day
       LEFT JOIN (
         SELECT date_trunc('day', l.cancelled_at)::date AS day, COUNT(*)::int AS n
         FROM licenses l
         WHERE l.cancelled_at >= $1 AND EXISTS (SELECT 1 FROM users u WHERE u.id = l.user_id)
         GROUP BY 1
       ) sc ON sc.day = gs.day
       ORDER BY gs.day`,
      [periodStart]
    );
    res.json({ days, series: rows });
  } catch (err) {
    console.error("Erro ao calcular tendência da Visão Geral:", err);
    res.status(500).json({ error: "Erro ao calcular tendência" });
  }
});

// Lista os usuários ATIVOS (clientes com a conta não bloqueada), já trazendo
// a licença mais recente de cada um (com origem/forma de aquisição) e o
// nome/clínica de verdade, tirado das configurações que o próprio usuário
// preenche dentro do app (não do cadastro — o formulário de cadastro nunca
// coletou nome/clínica, então users.name/users.clinic_name sempre ficavam
// vazios; quem tem esse dado de verdade é o app_data, chave 'settings').
router.get("/users", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.email, u.name, u.clinic_name, u.status, u.email_verified, u.created_at,
        l.id AS license_id,
        l.code AS license_code,
        l.status AS license_status,
        l.type AS license_type,
        l.expires_at AS license_expires_at,
        l.source AS license_source,
        l.buyer_email AS license_buyer_email,
        l.stripe_subscription_id AS license_stripe_subscription_id,
        l.cancel_at_period_end AS license_cancel_at_period_end,
        l.description AS license_description,
        a.value AS settings_json
      FROM users u
      LEFT JOIN LATERAL (
        SELECT * FROM licenses WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
      ) l ON true
      LEFT JOIN app_data a ON a.user_id = u.id AND a.key = 'settings'
      WHERE u.role = 'user' AND u.status = 'active'
      ORDER BY u.created_at DESC
    `);
    const result = rows.map((row) => {
      const { settings_json, ...rest } = row;
      let settingsClinicName = null;
      if (settings_json) {
        try {
          settingsClinicName = JSON.parse(settings_json).clinicName || null;
        } catch (e) {
          // configurações salvas num formato inesperado — ignora e segue sem esse dado
        }
      }
      return { ...rest, settings_clinic_name: settingsClinicName };
    });
    res.json(result);
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
// description: anotação livre e opcional (pra quem é, por qual motivo) —
// só aparece no painel admin, nunca é mostrada pro cliente.
router.post("/licenses", async (req, res) => {
  const { type, description } = req.body || {};
  const licenseType = ["trial", "annual", "lifetime"].includes(type) ? type : "monthly";
  const trimmedDescription = typeof description === "string" && description.trim() ? description.trim() : null;
  try {
    const code = generateLicenseCode();
    const { rows } = await pool.query(
      "INSERT INTO licenses (code, status, type, source, description) VALUES ($1, 'unused', $2, 'admin', $3) RETURNING *",
      [code, licenseType, trimmedDescription]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar a licença" });
  }
});

// Lista as licenças AINDA NÃO UTILIZADAS (status = 'unused') — chaves geradas
// (manualmente ou por compra) que ainda não foram reivindicadas por ninguém
// no cadastro. Licenças já em uso ficam de fora dessa lista de propósito;
// pra ver o que cada cliente tem, é a aba "Usuários" que traz essa info.
router.get("/licenses", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT l.*, u.email AS user_email, u.name AS user_name, u.clinic_name
      FROM licenses l
      LEFT JOIN users u ON u.id = l.user_id
      WHERE l.status = 'unused'
      ORDER BY l.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar licenças" });
  }
});

// Renova uma licença: por padrão soma os dias correspondentes ao TIPO dela
// (mensal, trial ou anual) a partir de agora — mas o admin pode escolher
// explicitamente 30 ou 365 dias pelo body (`days`), independente do tipo
// original da licença (ex: dar 365 dias de bônus numa licença mensal).
// Os dias são SOMADOS à validade atual (se ela ainda não venceu) — uma
// licença com 7 dias restantes que ganha +365 fica com 372 dias, não 365.
// Só reinicia a contagem a partir de hoje se a licença já tiver expirado.
router.post("/licenses/:id/renew", async (req, res) => {
  const { days } = req.body || {};
  const customDays = [30, 365].includes(Number(days)) ? Number(days) : null;
  try {
    const { rows: currentRows } = await pool.query("SELECT type, expires_at FROM licenses WHERE id = $1", [
      req.params.id,
    ]);
    if (!currentRows[0]) return res.status(404).json({ error: "Licença não encontrada" });
    const current = currentRows[0];
    const currentExpiry = current.expires_at ? new Date(current.expires_at) : null;
    const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
    const expiresAt = addDays(base, customDays || durationDaysForType(current.type));
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

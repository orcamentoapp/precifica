// Preço mensal/anual do Precifica — antes só dava pra mudar via variável de
// ambiente do Railway (PRECIFICA_MONTHLY_PRICE/PRECIFICA_ANNUAL_PRICE), o
// que exigia mexer no Railway E esperar o próximo deploy. Agora o painel
// admin pode sobrescrever esses valores na hora, guardados na tabela
// `app_settings` (ver src/migrate.js).
//
// Ordem de prioridade, do maior pro menor:
//   1. Valor salvo no banco (`app_settings`) — o que o admin define na tela.
//   2. Variável de ambiente (PRECIFICA_MONTHLY_PRICE/PRECIFICA_ANNUAL_PRICE)
//      — continua funcionando pra quem nunca abriu a tela nova, ou como
//      valor de partida antes do primeiro ajuste pelo painel.
//   3. Valor padrão fixo no código (99.9 / 599.9) — última rede de segurança,
//      só entra em cena se nem banco nem variável de ambiente tiverem nada.
//
// Cache em memória de 30s: todo checkout (Stripe) chama
// getPricing(), e sem cache isso viraria uma consulta ao banco a cada
// tentativa de pagamento — preço muda raramente, então 30s de atraso pra um
// ajuste feito pelo admin valer em TODO lugar é um troca perfeitamente
// aceitável pelo ganho de não bater no banco toda hora. setPricing() (usado
// pela rota do admin) zera esse cache na hora, então quem SALVOU a mudança
// já vê o valor novo imediatamente ao reabrir a tela; só outros processos
// (ou outras chamadas nos próximos segundos) que podem levar até 30s pra
// perceber.
const pool = require("../db");

const DEFAULTS = { monthlyPrice: 39.9, annualPrice: 358.8 };
// Oferta de fundador (lançamento): os primeiros N assinantes do plano
// MENSAL pagam um preço menor PRA SEMPRE (enquanto mantiverem a mesma
// assinatura). Funciona sozinho porque cada assinatura do Stripe guarda o
// preço com que foi criada — mudar o preço depois não afeta quem já assinou.
// Desligada por padrão; o admin liga em Configurações.
const FOUNDER_DEFAULTS = { active: false, price: 29.9, limit: 100 };
const CACHE_TTL_MS = 30 * 1000;

let cache = null; // { monthlyPrice, annualPrice, loadedAt } | null

function envDefaults() {
  return {
    monthlyPrice: Number(process.env.PRECIFICA_MONTHLY_PRICE) || DEFAULTS.monthlyPrice,
    annualPrice: Number(process.env.PRECIFICA_ANNUAL_PRICE) || DEFAULTS.annualPrice,
  };
}

async function loadFromDb() {
  const fallback = envDefaults();
  const { rows } = await pool.query(
    "SELECT key, value FROM app_settings WHERE key IN ('monthly_price', 'annual_price', 'founder_active', 'founder_price', 'founder_limit')"
  );
  const saved = {};
  rows.forEach((r) => {
    saved[r.key] = r.value;
  });
  const monthlyPrice = saved.monthly_price != null ? Number(saved.monthly_price) : fallback.monthlyPrice;
  const annualPrice = saved.annual_price != null ? Number(saved.annual_price) : fallback.annualPrice;
  const founderPrice = saved.founder_price != null ? Number(saved.founder_price) : FOUNDER_DEFAULTS.price;
  const founderLimit = saved.founder_limit != null ? parseInt(saved.founder_limit, 10) : FOUNDER_DEFAULTS.limit;
  return {
    monthlyPrice: Number.isFinite(monthlyPrice) && monthlyPrice > 0 ? monthlyPrice : fallback.monthlyPrice,
    annualPrice: Number.isFinite(annualPrice) && annualPrice > 0 ? annualPrice : fallback.annualPrice,
    founder: {
      active: saved.founder_active === "true",
      price: Number.isFinite(founderPrice) && founderPrice > 0 ? founderPrice : FOUNDER_DEFAULTS.price,
      limit: Number.isInteger(founderLimit) && founderLimit > 0 ? founderLimit : FOUNDER_DEFAULTS.limit,
    },
  };
}

// Devolve { monthlyPrice, annualPrice } — sempre números válidos (nunca
// NaN/zero), sempre com pelo menos o valor padrão do código como rede de
// segurança final, mesmo se o banco estiver fora do ar.
async function getPricing() {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return { monthlyPrice: cache.monthlyPrice, annualPrice: cache.annualPrice, founder: cache.founder };
  }
  try {
    const fresh = await loadFromDb();
    cache = { ...fresh, loadedAt: now };
    return fresh;
  } catch (err) {
    console.error("Erro ao carregar preços do banco (caindo pra variável de ambiente/padrão):", err);
    // Se já tinha um valor em cache (mesmo vencido), prefere reusar isso a
    // ignorar de vez um ajuste que o admin já tinha feito antes — só cai
    // pra env/padrão quando NUNCA conseguiu ler o banco desde que o
    // processo subiu.
    if (cache) return { monthlyPrice: cache.monthlyPrice, annualPrice: cache.annualPrice, founder: cache.founder };
    return { ...envDefaults(), founder: { ...FOUNDER_DEFAULTS } };
  }
}

// Atualiza um ou os dois preços (passe só o que quiser mudar). Valida que
// cada valor é um número finito maior que zero — nunca deixa salvar um
// preço zerado/negativo/inválido no banco.
async function setPricing({ monthlyPrice, annualPrice, founderActive, founderPrice, founderLimit }) {
  const updates = [];
  if (founderActive != null) updates.push(["founder_active", founderActive ? "true" : "false"]);
  if (founderPrice != null) {
    const n = Number(founderPrice);
    if (!Number.isFinite(n) || n <= 0) throw new Error("Preço de fundador inválido");
    updates.push(["founder_price", String(n)]);
  }
  if (founderLimit != null) {
    const n = Number(founderLimit);
    if (!Number.isInteger(n) || n <= 0) throw new Error("Quantidade de vagas de fundador inválida");
    updates.push(["founder_limit", String(n)]);
  }
  if (monthlyPrice != null) {
    const n = Number(monthlyPrice);
    if (!Number.isFinite(n) || n <= 0) throw new Error("Preço mensal inválido");
    updates.push(["monthly_price", String(n)]);
  }
  if (annualPrice != null) {
    const n = Number(annualPrice);
    if (!Number.isFinite(n) || n <= 0) throw new Error("Preço anual inválido");
    updates.push(["annual_price", String(n)]);
  }
  // O anual precisa ser um desconto de verdade em relação ao mensal (mais
  // caro que 1 mês, mais barato que 12) — evita salvar valor de teste que
  // apareceria no site como "R$ 0,08/mês".
  {
    const current = await getPricing();
    const m = monthlyPrice != null ? Number(monthlyPrice) : current.monthlyPrice;
    const a = annualPrice != null ? Number(annualPrice) : current.annualPrice;
    if ((monthlyPrice != null || annualPrice != null) && !(a > m && a < m * 12)) {
      throw new Error(
        `Preço anual inválido: precisa ficar entre 1 e 12 mensalidades (entre R$ ${m.toFixed(2).replace(".", ",")} e R$ ${(m * 12).toFixed(2).replace(".", ",")}).`
      );
    }
  }
  if (updates.length === 0) return getPricing();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [key, value] of updates) {
      await client.query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
        [key, value]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  cache = null; // força reler do banco na próxima chamada, refletindo a mudança na hora
  return getPricing();
}

// Situação da oferta de fundador agora: quantas vagas já foram usadas
// (assinaturas de fundador que não foram canceladas — quem cancela libera a
// vaga) e se ainda dá pra entrar. `available` é o que a tela de compra e o
// checkout usam.
async function getFounderStatus() {
  const { founder, monthlyPrice } = await getPricing();
  let used = 0;
  try {
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM licenses WHERE founder = true AND status IN ('unused', 'active') AND cancel_at_period_end = false"
    );
    used = rows[0].n;
  } catch (err) {
    console.error("Erro ao contar vagas de fundador:", err.message);
  }
  const remaining = Math.max(0, founder.limit - used);
  return {
    ...founder,
    used,
    remaining,
    available: founder.active && remaining > 0 && founder.price < monthlyPrice,
  };
}

module.exports = { getPricing, setPricing, getFounderStatus };

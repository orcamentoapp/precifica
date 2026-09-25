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
// Cache em memória de 30s: todo checkout (Stripe/Mercado Pago) chama
// getPricing(), e sem cache isso viraria uma consulta ao banco a cada
// tentativa de pagamento — preço muda raramente, então 30s de atraso pra um
// ajuste feito pelo admin valer em TODO lugar é um troca perfeitamente
// aceitável pelo ganho de não bater no banco toda hora. setPricing() (usado
// pela rota do admin) zera esse cache na hora, então quem SALVOU a mudança
// já vê o valor novo imediatamente ao reabrir a tela; só outros processos
// (ou outras chamadas nos próximos segundos) que podem levar até 30s pra
// perceber.
const pool = require("../db");

const DEFAULTS = { monthlyPrice: 99.9, annualPrice: 599.9 };
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
    "SELECT key, value FROM app_settings WHERE key IN ('monthly_price', 'annual_price')"
  );
  const saved = {};
  rows.forEach((r) => {
    saved[r.key] = r.value;
  });
  const monthlyPrice = saved.monthly_price != null ? Number(saved.monthly_price) : fallback.monthlyPrice;
  const annualPrice = saved.annual_price != null ? Number(saved.annual_price) : fallback.annualPrice;
  return {
    monthlyPrice: Number.isFinite(monthlyPrice) && monthlyPrice > 0 ? monthlyPrice : fallback.monthlyPrice,
    annualPrice: Number.isFinite(annualPrice) && annualPrice > 0 ? annualPrice : fallback.annualPrice,
  };
}

// Devolve { monthlyPrice, annualPrice } — sempre números válidos (nunca
// NaN/zero), sempre com pelo menos o valor padrão do código como rede de
// segurança final, mesmo se o banco estiver fora do ar.
async function getPricing() {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return { monthlyPrice: cache.monthlyPrice, annualPrice: cache.annualPrice };
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
    if (cache) return { monthlyPrice: cache.monthlyPrice, annualPrice: cache.annualPrice };
    return envDefaults();
  }
}

// Atualiza um ou os dois preços (passe só o que quiser mudar). Valida que
// cada valor é um número finito maior que zero — nunca deixa salvar um
// preço zerado/negativo/inválido no banco.
async function setPricing({ monthlyPrice, annualPrice }) {
  const updates = [];
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

module.exports = { getPricing, setPricing };

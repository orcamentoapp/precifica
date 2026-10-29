require("dotenv").config();
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const authRoutes = require("./src/routes/auth");
const adminRoutes = require("./src/routes/admin");
const paymentsRoutes = require("./src/routes/payments");
const supportRoutes = require("./src/routes/support");
const appDataRoutes = require("./src/routes/appData");
const budgetsRoutes = require("./src/routes/budgets");
const { stripeWebhookHandler } = require("./src/routes/stripeWebhook");
const { getPricing } = require("./src/utils/pricingSettings");
const { migrate } = require("./src/migrate");
const { apiLimiter } = require("./src/middleware/rateLimit");

const app = express();

// O Railway fica atrás de um proxy — sem isso, todo mundo apareceria com o
// IP do proxy, e o limite de tentativas (rate limit) travaria todos os
// clientes juntos. "1" = confia só no primeiro proxy (o do Railway).
app.set("trust proxy", 1);
app.disable("x-powered-by");

// ---------- Cabeçalhos de segurança (helmet) ----------
// A Content-Security-Policy diz ao navegador de onde o app pode carregar
// scripts/estilos/imagens. Se alguém um dia conseguir injetar um <script>
// numa página, o navegador se recusa a rodar. Os poucos scripts "inline"
// legítimos (registro do service worker no index.html, script da landing
// page em /home) são liberados pelo hash exato do conteúdo, calculado
// sozinho aqui no boot — se o script mudar, o hash muda junto.
const frontendDist = path.join(__dirname, "app-frontend", "dist");
const frontendIndex = path.join(frontendDist, "index.html");
const hasFrontendBuild = fs.existsSync(frontendIndex);

function inlineScriptHashes() {
  const files = [frontendIndex, path.join(frontendDist, "home", "index.html")];
  const hashes = new Set();
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, "utf8");
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) {
      if (!m[1].trim()) continue;
      hashes.add(`'sha256-${crypto.createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
    }
  }
  return [...hashes];
}

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...inlineScriptHashes()],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'", "blob:", "data:", "https:"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", "blob:"],
        frameSrc: ["'self'", "blob:", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://player.vimeo.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // O app abre PDFs/imagens geradas em blob: — não precisa de isolamento
    // entre origens (COEP), que quebraria isso.
    crossOriginEmbedderPolicy: false,
  })
);

// ---------- CORS ----------
// O app e a API ficam no MESMO domínio, então o navegador nem precisa de
// CORS pra uso normal. Antes estava liberado pra qualquer site; agora só
// aceita o próprio APP_URL (e extras em CORS_ORIGINS, separados por vírgula).
const allowedOrigins = [process.env.APP_URL, ...(process.env.CORS_ORIGINS || "").split(",")]
  .map((o) => (o || "").trim().replace(/\/$/, ""))
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
  })
);

// O webhook do Stripe precisa do corpo "cru" (não parseado como JSON) pra
// verificar a assinatura — por isso essa rota específica vem ANTES do
// express.json() global, que só entra em vigor pras rotas seguintes.
app.post("/api/payments/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

// Limite maior que o padrão (100kb) porque /api/app-data salva a logo em
// base64 junto das configurações.
app.use(express.json({ limit: "4mb" }));

// Teto geral de requisições por IP pra toda a API (bem folgado).
app.use("/api", apiLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/app-data", appDataRoutes);
app.use("/api/budgets", budgetsRoutes);

// Saúde do sistema — pra um monitor externo (ex: UptimeRobot, gratuito)
// checar a cada poucos minutos e avisar por e-mail/WhatsApp se o Precifica
// ou o banco cair. Não expõe nenhum dado.
app.get("/api/health", async (req, res) => {
  try {
    await require("./src/db").query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false });
  }
});

// Rota de API inexistente → 404 em JSON (antes caía no index.html do app).
app.use("/api", (req, res) => res.status(404).json({ error: "Rota não encontrada" }));

// Tudo (login, cadastro, app, painel admin) é o mesmo app React —
// a diferença é só o que a tela mostra, dependendo de quem está logado.
if (hasFrontendBuild) {
  app.use(
    express.static(frontendDist, {
      setHeaders(res, filePath) {
        // index.html e sw.js nunca em cache (senão um deploy novo demora a
        // aparecer); os arquivos de /assets têm hash no nome e podem ficar
        // em cache pra sempre.
        if (/index\.html$|sw\.js$/.test(filePath)) res.setHeader("Cache-Control", "no-cache");
        else if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    })
  );
  app.get(/^(?!\/api).*/, (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(frontendIndex);
  });
} else {
  app.get("/", (req, res) => {
    res.send(
      "Servidor do Precifica está no ar. O build do app ainda não foi gerado (rode `npm run build`)."
    );
  });
}

// Erro inesperado em qualquer rota → resposta genérica (nunca mostra detalhe
// interno/stack trace pro navegador).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Dado grande demais pra salvar" });
  }
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Requisição inválida" });
  }
  console.error("Erro não tratado:", err);
  res.status(500).json({ error: "Erro interno" });
});

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.warn(
      "⚠️ AVISO DE SEGURANÇA: JWT_SECRET ausente ou curto demais (menos de 32 caracteres). Troque por um valor longo e aleatório no Railway (ex: gerado em https://generate-secret.vercel.app/64). Trocar desloga todo mundo uma vez."
    );
  }
  if (!process.env.APP_URL) {
    console.warn("⚠️ APP_URL não definido — links dos e-mails e retorno do Stripe vão quebrar.");
  }

  // Migração automática do banco a cada deploy (idempotente — só cria o
  // que ainda não existe). Antes era preciso rodar `npm run migrate` à mão
  // trocando o Start Command do Railway; esquecer disso quebrava o app
  // quando o código novo dependia de uma coluna nova.
  try {
    await migrate();
  } catch (err) {
    console.error("❌ ERRO NA MIGRAÇÃO DO BANCO — o app pode não funcionar direito até isso ser resolvido:", err);
  }

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, async () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(hasFrontendBuild ? "Servindo o app em / (build encontrado)" : "Build do app não encontrado ainda.");
    // Log de diagnóstico: mostra, toda vez que o servidor sobe, qual preço
    // ele está usando de verdade (banco > variável de ambiente > padrão).
    try {
      const { monthlyPrice, annualPrice } = await getPricing();
      console.log(`Preço mensal: R$ ${monthlyPrice.toFixed(2)} · Preço anual: R$ ${annualPrice.toFixed(2)}`);
    } catch (err) {
      console.error("Não deu pra ler o preço do banco no boot (o servidor continua funcionando normalmente):", err.message);
    }
  });
}

start();

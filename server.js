require("dotenv").config();
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./src/routes/auth");
const adminRoutes = require("./src/routes/admin");
const paymentsRoutes = require("./src/routes/payments");
const supportRoutes = require("./src/routes/support");
const appDataRoutes = require("./src/routes/appData");
const { stripeWebhookHandler } = require("./src/routes/stripeWebhook");
const { getPricing } = require("./src/utils/pricingSettings");

const app = express();

app.use(cors());

// O webhook do Stripe precisa do corpo "cru" (não parseado como JSON) pra
// verificar a assinatura — por isso essa rota específica vem ANTES do
// express.json() global, que só entra em vigor pras rotas seguintes.
app.post("/api/payments/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

// Limite maior que o padrão (100kb) porque /api/app-data salva a foto de
// perfil em base64 junto das configurações — 3mb dá folga confortável pro
// limite de 2MB por chave que a própria rota já aplica.
app.use(express.json({ limit: "3mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/app-data", appDataRoutes);

// Tudo (login, cadastro, app, painel admin) é o mesmo app React —
// a diferença é só o que a tela mostra, dependendo de quem está logado.
const frontendDist = path.join(__dirname, "app-frontend", "dist");
const frontendIndex = path.join(frontendDist, "index.html");
const hasFrontendBuild = fs.existsSync(frontendIndex);

if (hasFrontendBuild) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(frontendIndex);
  });
} else {
  app.get("/", (req, res) => {
    res.send(
      "Servidor do Precifica está no ar. O build do app ainda não foi gerado (rode `npm run build`)."
    );
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(hasFrontendBuild ? "Servindo o app em / (build encontrado)" : "Build do app não encontrado ainda.");
  // Log de diagnóstico: mostra, toda vez que o servidor sobe, qual preço ele
  // está usando de verdade (agora o preço pode vir do painel admin, que é
  // guardado no banco — ver src/utils/pricingSettings.js — então isso já
  // reflete banco > variável de ambiente > padrão do código, nessa ordem).
  // Útil pra conferir nos logs do Railway se um ajuste feito pelo admin (ou
  // uma variável de ambiente nova) realmente pegou.
  try {
    const { monthlyPrice, annualPrice } = await getPricing();
    console.log(`Preço mensal: R$ ${monthlyPrice.toFixed(2)} · Preço anual: R$ ${annualPrice.toFixed(2)}`);
  } catch (err) {
    console.error("Não deu pra ler o preço do banco no boot (o servidor continua funcionando normalmente):", err.message);
  }
});

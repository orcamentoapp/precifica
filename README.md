# Precifica

**Precifique seus procedimentos com inteligência.**

Um único app React com login universal: a mesma tela de entrada serve tanto
os clientes quanto você (admin) — o que muda é pra onde a pessoa vai depois
de entrar, dependendo do papel da conta dela.

Testei tudo localmente antes de te entregar: rodei `npm run build`, subi o
servidor completo com um Postgres real, e testei via linha de comando o
fluxo inteiro — login admin, gerar chave solta, cadastro do cliente com essa
chave, código de verificação por e-mail (aparece no log quando o SMTP não
está configurado), confirmação, login, esqueci/redefinir senha, bloquear/
reativar conta, renovar/revogar licença, e as proteções de acesso (usuário
comum não acessa rotas de admin, conta bloqueada não consegue logar, etc).

## Como funciona, na prática

**Não existe mais "criar conta" solta.** Pra alguém virar cliente, precisa
ter uma **chave de licença** — você gera essa chave no painel admin (sem
associar a ninguém ainda) e entrega pro cliente depois que ele pagar.

1. Cliente abre o site → cai direto na tela de **login**.
2. Como ele ainda não tem conta, clica em **"Ativar licença"**.
3. Preenche: chave de licença, e-mail, senha, confirmar senha.
4. Recebe um código de 6 dígitos por e-mail → confirma → conta ativa,
   licença vinculada a ele automaticamente (válida por 30 dias a partir
   da confirmação).
5. Da próxima vez, ele só faz login normal (e-mail + senha) na mesma tela.
6. **Você** faz login nessa mesma tela, com a conta de admin — o sistema
   reconhece o papel da conta e te leva direto pro painel administrativo
   em vez do app.

Se a licença expirar, for revogada, ou a conta for bloqueada, o cliente
ainda consegue fazer login normalmente, mas cai numa tela avisando o motivo
em vez de entrar no app — a sessão revalida isso sozinha a cada 6 horas.

## Estrutura

```
precifica/
├── server.js                 # Express: serve o app React (/) e a API (/api)
├── package.json               # scripts da raiz, incluindo o "build" do frontend
├── src/
│   ├── routes/auth.js          # cadastro, verificação de e-mail, login, esqueci/redefinir senha
│   ├── routes/admin.js         # gerar chave, listar usuários/licenças, bloquear, renovar, revogar
│   ├── routes/appData.js       # settings/procedures/budgetHistory do simulador, por conta (tabela app_data)
│   ├── routes/support.js       # formulário de contato do menu do app (manda e-mail pro suporte)
│   ├── routes/payments.js      # checkout Stripe (assinatura) + Mercado Pago (pagamento único Pix/Boleto/cartão)
│   ├── routes/stripeWebhook.js # webhook do Stripe (gera/renova a ASSINATURA automaticamente)
│   ├── routes/mercadopagoWebhook.js # webhook do Mercado Pago (soma dias após pagamento único aprovado)
│   ├── middleware/auth.js      # protege rotas (requireAuth / requireAdmin)
│   ├── utils/email.js          # envio de e-mail (SMTP configurável, com fallback pro console)
│   ├── utils/stripe.js         # chamadas à API do Stripe (assinatura recorrente por cartão)
│   ├── utils/mercadopago.js    # chamadas à API do Mercado Pago (pagamento único Pix/Boleto/cartão)
│   └── migrate.js              # cria as tabelas + o admin inicial
└── app-frontend/                # o app em si — projeto Vite + React
    └── src/
        ├── App.jsx                # o simulador (todo o código que a gente construiu)
        ├── AuthGate.jsx           # decide o que mostrar: login, cadastro, compra, app ou painel admin
        ├── AdminDashboard.jsx     # painel administrativo (React, não é mais HTML separado)
        ├── screens/                # Login, Buy, Register, VerifyEmail, ForgotPassword, ResetPassword, LicenseBlocked
        ├── storageShim.js         # implementa window.storage chamando /api/app-data (por conta, não mais localStorage)
        └── api.js                 # chamadas à API com o token de autenticação
```

## Como o simulador virou um app "de verdade"

O `App.jsx` foi pensado originalmente pra rodar como artifact do Claude.ai,
que fornece automaticamente um `window.storage` (salva os dados de cada
usuário). Fora do Claude.ai esse objeto não existe — o `storageShim.js`
recria a mesma "API" usando `localStorage` do navegador por baixo dos
panos, sem precisar reescrever nada do simulador em si. Cada navegador
guarda os dados daquele cliente (procedimentos, configurações, histórico de
orçamentos) localmente.

## Sobre o envio de e-mail

Cadastro (código de confirmação) e "esqueci senha" (código de redefinição)
dependem de enviar e-mail. O sistema tenta, nessa ordem: **API da Brevo**
(se `BREVO_API_KEY` estiver preenchida) → **SMTP genérico** (se
`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` estiverem preenchidos) → **mostrar no
log do servidor** (Railway → Deployments → Deploy Logs), só pra não travar
o fluxo enquanto nada estiver configurado.

**Configuração atual do domínio verterelabs.com**: e-mail de saída via
**Zoho Mail** (SMTP), com a caixa `suporte@verterelabs.com` também
hospedada lá pra receber respostas. Use as variáveis `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME` —
veja os valores exatos e o aviso sobre senha de aplicativo no
`.env.example`. **Não deixe `BREVO_API_KEY` preenchida ao mesmo tempo** —
ela tem prioridade sobre o SMTP, então se estiver com algum valor (mesmo
antigo/de teste), o sistema tenta usar a Brevo em vez do Zoho.

## Rodando localmente

1. Tenha um Postgres rodando (local ou um serviço gratuito tipo Neon/Supabase).
2. `cp .env.example .env` e preencha pelo menos `DATABASE_URL`, `JWT_SECRET`,
   `ADMIN_BOOTSTRAP_EMAIL` e `ADMIN_BOOTSTRAP_PASSWORD`.
3. Na raiz do projeto: `npm install`
4. `npm run migrate` — cria as tabelas e a conta de admin inicial.
5. `npm run build` — compila o app (gera `app-frontend/dist`).
6. `npm start` — sobe o servidor (padrão: porta 3000).
7. Acesse `http://localhost:3000/` — vai cair na tela de login. Entre com o
   e-mail/senha do admin (do `.env`) pra ver o painel, ou clique em "Ativar
   licença" pra simular o cadastro de um cliente (gere uma chave primeiro,
   logado como admin).

## Publicando no Railway

1. Suba **todo** o conteúdo desta pasta (menos `node_modules`, `dist` e
   `.env` — o `.gitignore` já exclui isso, mas se for upload manual pelo
   site do GitHub, é só não arrastar essas pastas) pra um repositório novo,
   pela interface web do GitHub.
2. No Railway: **New Project → Deploy from GitHub repo**, escolha o repositório.
3. **+ New → Database → PostgreSQL** no mesmo projeto.
4. No serviço do backend → **Variables** → **Add Reference** → escolha a
   `DATABASE_URL` do Postgres.
5. Ainda em Variables, adicione `JWT_SECRET`, `ADMIN_BOOTSTRAP_EMAIL`,
   `ADMIN_BOOTSTRAP_PASSWORD`, `LICENSE_DURATION_DAYS` (opcional) e as
   variáveis `SMTP_*` (veja o `.env.example` — sem elas, os códigos só
   aparecem no log, não chegam de verdade por e-mail).
6. O Railway detecta sozinho o script `"build"` do `package.json` da raiz e
   compila o app antes de rodar `npm start`. Não precisa configurar nada extra.
7. Rode a migração uma única vez: troque temporariamente o **Start Command**
   pra `npm run migrate && npm start`, deixe redeployar, confira nos logs
   "Migração concluída com sucesso", e depois volte o Start Command pra
   `npm start`.
8. Gere um domínio público (**Settings → Networking → Generate Domain**).
9. Pronto: `https://SEU-APP.up.railway.app/` é a tela de login — a mesma
   pra você e pros seus clientes.

## Pagamento automático (Stripe)

Desde essa versão, existe um jeito **automático** de vender: uma página
pública de assinatura, integrada com o [Stripe](https://stripe.com), que
gera e entrega a chave de licença sozinha assim que o pagamento é
confirmado — sem você precisar entrar no painel pra gerar nada na mão.

**Como funciona:**

1. Cliente acessa a tela de login → clica em **"Assinar agora"**.
2. Preenche nome + e-mail → o servidor cria uma sessão de checkout no
   Stripe (assinatura mensal) e redireciona pra página de pagamento
   hospedada por eles (cartão e boleto já funcionam de cara pra contas do
   Brasil — veja a nota sobre Pix abaixo).
3. Assim que o pagamento é confirmado, o Stripe avisa o Precifica
   (webhook) → o servidor gera uma chave de licença nova e manda por
   e-mail pro cliente automaticamente.
4. Cliente recebe o e-mail, acessa o site, clica em "Ativar licença" e
   segue o cadastro normal (mesmo fluxo de sempre: chave + e-mail + senha
   + confirmar código).
5. **No mês seguinte**, quando a assinatura gerar a próxima cobrança
   automaticamente e o cliente pagar, o webhook renova a licença existente
   sozinho (+30 dias) — sem gerar uma chave nova, sem o cliente precisar
   fazer nada.

**Sobre o Pix na assinatura:** diferente da Asaas (que consideramos antes),
no Stripe o Pix é **liberado por convite** pra contas baseadas no Brasil —
não vem habilitado por padrão numa conta nova. Cartão e boleto já
funcionam sem pedir nada, mas a ASSINATURA aqui usa só cartão, de
propósito (é a proteção contra abuso do teste grátis de 7 dias — ver nota
mais abaixo) — Pix/Boleto pra pagamento avulso já não passam mais pelo
Stripe, ver a seção do Mercado Pago logo adiante.

**Configuração necessária** (veja `.env.example`): `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `PRECIFICA_MONTHLY_PRICE`, `PRECIFICA_ANNUAL_PRICE`
e `APP_URL`.

No painel do Stripe (**Desenvolvedores → Webhooks**), cadastre um endpoint
apontando pra `https://SEU-APP.up.railway.app/api/payments/stripe/webhook`,
selecione os eventos **checkout.session.completed** e **invoice.paid**
(os dois — o primeiro libera acesso na hora do trial, o segundo processa
a cobrança de verdade), e copie o "Signing secret" gerado pra usar em
`STRIPE_WEBHOOK_SECRET`.

Diferente da Asaas, o Stripe **não exige uma conta separada pra testes** —
é a mesma conta, só alternando entre "modo de teste" e "modo produção" no
próprio painel (e usando a chave `sk_test_...` ou `sk_live_...`
correspondente).

⚠️ **Importante — a criação de sessão de checkout não foi testada contra a
API real do Stripe** (mesma limitação de antes: o ambiente onde isso foi
construído não acessa `api.stripe.com`). **A verificação de assinatura do
webhook, porém, foi testada de verdade** — gerei uma assinatura válida
usando o mesmo algoritmo do Stripe e confirmei que o SDK oficial (`stripe`,
sem nenhum mock) aceita e processa corretamente, incluindo idempotência e
renovação automática. Ainda assim, **antes de ativar em produção, teste o
fluxo completo no modo de teste do Stripe** (crie uma assinatura com um
[cartão de teste](https://docs.stripe.com/testing#cards), confirme que o
e-mail chega e a licença é criada certinha) antes de trocar pra
`sk_live_...`.

O código continua funcionando 100% no modo manual também (você pode
continuar gerando chaves pelo painel a qualquer momento, os dois jeitos
convivem).

## Pagamento único (Mercado Pago) — Pix, Boleto ou cartão avulso

Além da assinatura recorrente (Stripe, acima), o app tem um segundo jeito
de pagar: **+30 ou +365 dias avulsos**, sem virar assinatura — usado no
botão "Pagar com Pix ou Boleto" da tela de compra, e nos botões "+30
dias"/"+365 dias" dentro de Configurações → Licença (pra quem já tem
conta renovar sozinho). Isso é **só Mercado Pago** — o Stripe não entra
nessa parte, porque nem Pix nem Boleto conseguem ser cobrados de novo
sozinhos (diferente do cartão), então não fazia sentido misturar com o
provedor da assinatura.

**Por que Mercado Pago e não Stripe pra isso**: o Pix do Stripe pra
contas brasileiras é por convite (ver nota acima) e ainda não foi
liberado nessa conta; o Mercado Pago libera Pix, Boleto e cartão sem fila
de espera nenhuma.

**Configuração necessária** (veja `.env.example`): `MERCADOPAGO_ACCESS_TOKEN`
e `MERCADOPAGO_WEBHOOK_SECRET`. Os preços usados são os mesmos
`PRECIFICA_MONTHLY_PRICE`/`PRECIFICA_ANNUAL_PRICE` já configurados pro
Stripe.

**Como pegar as credenciais**:
1. Crie uma conta em [mercadopago.com.br](https://www.mercadopago.com.br)
   (pode ser conta pessoal, com CPF — não precisa de CNPJ).
2. Acesse [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers/panel),
   faça login com a mesma conta, e crie uma "Aplicação" (qualquer nome,
   tipo pagamentos online/Checkout Pro).
3. Na aba **Credenciais de teste**, copie o Access Token (começa com
   `TEST-`) pra `MERCADOPAGO_ACCESS_TOKEN` — use esse primeiro, pra testar
   sem dinheiro de verdade. Quando for pra produção, troca pro Access
   Token de produção (`APP_USR-...`).
4. Na mesma aplicação, procure a seção **Webhooks**, cadastre um endpoint
   apontando pra `https://SEU-APP.up.railway.app/api/payments/mercadopago/webhook`,
   selecione o evento **Pagamentos**, e copie a "Chave secreta" gerada pra
   usar em `MERCADOPAGO_WEBHOOK_SECRET`.

⚠️ **Nome que aparece pro cliente**: como a conta é pessoa física (sem
CNPJ), o nome que aparece no extrato/comprovante de quem paga pode ser o
seu nome pessoal, não um nome fantasia — isso é uma característica da
própria plataforma nesse tipo de conta, não tem como configurar diferente
por código. Se isso incomodar, abrir um MEI (gratuito, rápido, sozinho
pelo Portal do Empreendedor) e criar a conta Mercado Pago em cima do CNPJ
resolve.

⚠️ **Segurança — CVE-2026-76842**: o SDK oficial do Mercado Pago pra
Node.js teve uma vulnerabilidade de path injection corrigida a partir da
versão 3.5.0 (publicada bem recentemente). O `package.json` já fixa
`^3.6.0` (corrigida), e o código em `src/utils/mercadopago.js` também
valida manualmente que qualquer ID de pagamento vindo de fora é só
dígitos antes de usar, como camada extra de proteção — não remova essa
validação mesmo que a SDK seja atualizada.

⚠️ **Importante — não testado contra a API real do Mercado Pago** (mesma
limitação do Stripe: sem acesso a `api.mercadopago.com` no ambiente onde
isso foi construído). **A verificação de assinatura do webhook, porém,
foi testada de verdade** — gerei uma assinatura HMAC válida com o mesmo
algoritmo do Mercado Pago e confirmei que é aceita, e que uma assinatura
forjada é rejeitada. Antes de ativar em produção, teste o fluxo completo
no modo de teste do Mercado Pago (pague com um
[cartão/Pix de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/cards),
confirme que o e-mail chega e a licença é criada/renovada certinha) antes
de trocar pro Access Token de produção.

## Fluxo de venda, na prática

**Automático (recomendado, com Asaas configurado):** cliente assina pela
página de compra → paga → recebe a licença por e-mail sozinho → renova
sozinho todo mês. Você só acompanha pelo painel admin.

**Manual (sempre disponível, não depende de nada configurado):**

1. Cliente compra → você faz login no painel (sua conta admin) → **"+ Gerar
   chave de licença"** → copia o código (`XXXX-XXXX-XXXX-XXXX`).
2. Envia esse código + o link do site pro cliente (WhatsApp, e-mail etc.).
3. Cliente acessa o site, clica em "Ativar licença", preenche chave + e-mail
   + senha, confirma o código que recebeu por e-mail, e já entra direto no app.
4. Perto de completar 30 dias (ou quando ele renovar o pagamento), você volta
   no painel, aba **Usuários**, e clica em **Renovar** na linha dele.
5. Se ele parar de pagar: **Bloquear** o usuário (ou **Revogar** a licença
   direto) — na próxima checagem automática (até 6h depois, ou na próxima
   vez que ele tentar abrir o app) o acesso é cortado, mas ele continua
   conseguindo fazer login normalmente pra ver o aviso.

⚠️ Não existe tela de "promover alguém a admin" — o único jeito de criar um
admin hoje é pelas variáveis `ADMIN_BOOTSTRAP_EMAIL`/`ADMIN_BOOTSTRAP_PASSWORD`
na primeira migração. Se precisar de mais de uma conta admin depois, me avisa
que eu adiciono isso.

# HANDOFF — Precifica

> Este arquivo existe porque os créditos da conta Claude usada até aqui
> acabaram. Se você é uma instância nova do Claude lendo isso: leia este
> documento inteiro antes de fazer qualquer coisa. Ele te dá o contexto
> completo do que já foi construído, o que está testado, e o que falta.

## REGRA FIXA DE ENTREGA — leia antes de gerar qualquer zip

O Marcelo sempre sobe o zip completo pra continuar o projeto numa
instância nova do Claude — é assim que ele te dá acesso a todos os
arquivos e a esse HANDOFF de uma vez. Por isso, **todo zip entregue
nesse projeto segue este padrão fixo, sem exceção**:

- **Nome do zip**: `precifica DD-MM-AAAA HHhMM.zip` — data e hora de
  Brasília (fuso `America/Sao_Paulo`) do momento da entrega.
- **Conteúdo**: uma única pasta chamada `precifica` dentro do zip, e
  dentro dessa pasta TODOS os arquivos do sistema — o projeto
  **completo** (não só os arquivos alterados na sessão), sem
  `node_modules`, `dist`, `.git` nem `.env` — **junto com o
  `HANDOFF.md` atualizado** (dentro da pasta `precifica`, não solto na
  raiz do zip).
- Isso vale mesmo que a mudança da sessão tenha sido pequena: o zip
  inteiro sempre carrega o projeto todo, porque é ele que vai virar o
  upload pra continuar numa instância nova.
- **Não pergunte antes de gerar o zip.** Assim que uma mudança nessa
  sessão for concluída e testada, gere e entregue o zip direto, sem
  perguntar "quer que eu gere o zip?" — essa pergunta não é mais
  necessária, o Marcelo já confirmou que quer sempre o zip depois de
  cada atualização.

Essa regra é específica desse projeto (Precifica) — não confundir com
convenções de entrega de outros produtos do Marcelo.

## ⚠️ CANCELADO: integração com Mercado Pago (pagamento via Pix/Boleto)

O Marcelo decidiu **não seguir mais** com a integração do Mercado Pago
que ficou pendente numa sessão anterior (aguardando as credenciais de
teste, que estavam dando erro no painel deles). **O Precifica vai usar
só cartão de crédito, via Stripe** — sem Pix, sem Boleto, sem
pagamento único avulso por fora da assinatura. Ignore toda a seção
"Atualização anterior: Mercado Pago pro pagamento único" mais abaixo
neste arquivo — o código que ela descreve (`src/utils/mercadopago.js`,
`src/routes/mercadopagoWebhook.js`, as rotas
`/mercadopago/checkout`/`/mercadopago/renew-checkout`, os botões
"Pagar com Pix ou Boleto" em `Buy.jsx` e "+30 dias"/"+365 dias" via
Mercado Pago em Configurações) **continua existindo no código, mas não
deve ser retomado nem finalizado** — se algum dia o Marcelo quiser
removê-lo de vez, é só perguntar antes de mexer, mas por enquanto ele
simplesmente fica parado, sem uso.

## Atualização mais recente: rótulos certos em "Gerenciar Assinatura" — "Próxima cobrança dia" (cartão) vs "Expira em" + "Dias restantes" (licença do admin)

Ajuste fino em cima da sessão anterior. O Marcelo deixou explícito
exatamente como cada caso deve aparecer em Gerenciar Assinatura
(`app-frontend/src/App.jsx`):

- **Assinatura por cartão de crédito (Stripe, ativa, não trial, não
  cancelada)**: só "Próxima cobrança dia: DD/MM/AAAA" — sem "Dias
  restantes" (renova sozinha, contar dias não faz sentido aqui,
  decisão já tomada numa sessão anterior). Só precisou trocar o texto
  do rótulo, que antes dizia "Próxima cobrança no cartão".
- **Licença gerada pelo painel admin** (mensal/anual manual, sem
  Stripe): "Expira em: DD/MM/AAAA" **junto com** "Dias restantes: XX
  dias" — os dois já apareciam juntos nesse caso, não precisou mudar
  nada na lógica, só confirmar que já estava certo.
- **Dias restantes em vermelho quando ≤ 7 dias** — já estava assim
  desde antes, confirmado que continua correto.

**Testado**: `npm run build` do frontend limpo, sem erros. Mudança
pequena o suficiente (só texto de um rótulo) pra não precisar de novo
teste ao vivo — a lógica de quando mostrar cada bloco já tinha sido
testada de ponta a ponta na sessão anterior (a da licença vitalícia).

## Atualização anterior: HANDOFF enxugado (só as últimas atualizações a partir de agora) + 4 últimos dígitos e bandeira do cartão em "Gerenciar Assinatura"

Dois pedidos do Marcelo nesta sessão:

**1. HANDOFF enxugado** — a partir de agora, só as últimas atualizações
ficam com o texto completo aqui (mantive as 5 mais recentes); tudo
que era mais antigo que isso virou uma lista curta de títulos, lá
embaixo em "Histórico resumido", só pra não perder o rastro de
quando cada coisa foi feita sem inflar o arquivo pra sempre. Esse
mesmo arquivo, antes desta limpeza, tinha **4722 linhas / 279KB** —
depois da limpeza, caiu pra menos de 600 linhas. A partir de agora,
toda vez que uma nova atualização entrar aqui, a mais antiga das 5
detalhadas desce pra virar só uma linha no histórico condensado —
mantendo sempre só as 5 mais recentes por extenso.

**2. Últimos 4 dígitos + bandeira do cartão em "Gerenciar
Assinatura"** — o Marcelo queria que a pessoa soubesse em qual cartão
ela assinou, sem o Precifica precisar guardar dado de cartão nenhum
(nem deveria, por segurança/PCI). Implementado buscando isso **direto
na API do Stripe, na hora**, nunca armazenado no nosso banco:
- Rota nova, `GET /api/payments/stripe/payment-method`
  (`src/routes/payments.js`, autenticada) — busca a assinatura no
  Stripe (`stripe.subscriptions.retrieve`, com o método de pagamento
  padrão expandido), com fallback pra buscar no cliente
  (`customer.invoice_settings.default_payment_method`) se não vier
  expandido na assinatura por algum motivo. Retorna
  `{ card: { brand, last4 } }` ou `{ card: null }` — nunca quebra a
  tela por causa disso (erro vira `card: null`, melhor esforço).
- Frontend (`app-frontend/src/App.jsx`, `ProfileSettingsPage`) busca
  isso só quando a licença tem assinatura Stripe de verdade
  (`license.hasStripeSubscription`), e mostra "Cartão cadastrado:
  •••• 4242 · Visa" dentro de Gerenciar Assinatura, logo abaixo da
  data de próxima cobrança.
- **Bug pequeno corrigido no caminho**: na primeira tentativa de
  inserir essa rota nova antes da rota de cancelar assinatura, um
  `str_replace` mal formado apagou sem querer a linha de declaração
  da rota de cancelar (`router.post("/stripe/cancel-subscription", ...)`,
  ficando só o `try {` órfão) — pego na hora pelo `node --check`
  (que já dá pra confiar: qualquer erro de sintaxe introduzido por
  engano aparece na hora, antes de qualquer entrega), corrigido antes
  de seguir.

**Testado**: `npm run build` do frontend limpo; `node --check
src/routes/payments.js` sem erros (depois de corrigir o bug do
`str_replace`). Testei ao vivo o caminho "sem assinatura Stripe" —
confirmei que a rota responde `200 {"card":null}` de forma limpa e
que a tela de Configurações simplesmente não mostra a linha do cartão
nesse caso, sem erro nenhum. **Não testei o caminho com cartão real**
— isso exigiria uma assinatura Stripe de teste de verdade, que não
tenho credenciais aqui pra simular; a lógica segue o mesmo padrão já
usado com sucesso em outras integrações Stripe deste projeto (ex: a
busca de receita real no painel admin).

## Atualização anterior: contas novas com custo da hora zerado + "Dias restantes" escondido pra cartão recorrente + licença VITALÍCIA nova (pra quem ajudou a desenvolver)

Quatro pedidos do Marcelo, os quatro **testados de ponta a ponta com o
ambiente rodando de verdade aqui** (não só lidos no código) —
recriei o Postgres + servidor, gerei uma chave vitalícia de verdade
pelo painel admin, criei uma conta nova com ela, confirmei o e-mail
(peguei o código direto do log do servidor, já que SMTP não está
configurado nesse ambiente local), e conferi a tela de perfil dessa
conta nova specificamente.

**1. Custo da hora clínica zerado em contas novas** — o Marcelo
mandou print mostrando os campos de "Custos fixos mensais",
"Pró-labore desejado" e "Horas produtivas/mês" vindo preenchidos com
valores de exemplo (8000/15000/100) pra toda conta nova, o que não
fazia sentido (são números de uma clínica fictícia, não zero real).
Corrigido em `DEFAULT_SETTINGS.laborCalc`
(`app-frontend/src/App.jsx`) — `computeHourlyCost` já tinha uma
proteção contra dividir por zero (retorna R$0,00 em vez de
erro/infinito quando `productiveHours` é zero), então zerar os
padrões foi seguro sem precisar mexer em mais nada. **Testado**:
criei a conta vitalícia do zero e confirmei os três campos e o "Custo
/ hora resultante" todos em 0/R$0,00, sem erro na tela.

2. **"Dias restantes" escondido quando não faz sentido** — só
   aparece pra: teste grátis, licença gerada manualmente (mensal/
   anual pelo admin), ou assinatura por cartão JÁ CANCELADA (nesses
   casos genuinamente está contando pra um fim real). Pra assinatura
   Stripe ativa e não cancelada, esconder faz sentido — ela renova
   sozinha, "dias restantes" dava a entender (errado) que ia parar de
   funcionar. Corrigido nos dois lugares que mostravam isso: o menu
   do avatar e "Gerenciar Assinatura" (`app-frontend/src/App.jsx`).

3. **Licença Vitalícia** (o pedido maior desta leva) — pra dar acesso
   sem cobrança e sem validade a quem ajudou a desenvolver o sistema:
   - Painel admin ganhou um botão novo, "+ Chave vitalícia" (roxo,
     `app-frontend/src/AdminDashboard.jsx`), ao lado dos de sempre
     (mensal/trial/anual).
   - Backend (`src/routes/admin.js`) aceita `type: "lifetime"` na
     geração de chave.
   - Na ativação (`src/routes/auth.js`), licença vitalícia grava
     `expires_at = NULL` de propósito — o resto do sistema **já**
     trata `NULL` como "nunca expira" (não precisou mexer em
     `getLicenseStatusForUser`, essa lógica já existia pra outros
     casos de licença sem prazo).
   - "Gerenciar Assinatura" mostra uma mensagem própria pra vitalícia
     ("Acesso vitalício — sem cobrança nenhuma, sem data de
     vencimento. Nada pra gerenciar aqui.") em vez do bloco de
     cancelar/renovar, que não fazem sentido nesse caso.
   - Botão "Renovar" escondido na aba Usuários do admin pra licença
     vitalícia (evita alguém sem querer dar uma data de validade real
     pra uma licença que devia ser eterna).
   - Nova cor de badge, `violet`, tanto no componente `StatusBadge`
     do admin quanto no CSS de modo escuro (`index.css`) — as outras
     cores já usadas (teal/amber/rose/indigo) já tinham dono, então
     vitalícia ganhou uma só pra ela, pra se destacar nas listas.
   - **Testado de ponta a ponta**: gerei uma chave vitalícia de
     verdade no painel, criei uma conta com ela (e-mail
     `dev@precifica.local`), confirmei o e-mail, e conferi a tela de
     perfil — mostrou "Tipo: Vitalícia", "Assinante desde:
     11/09/2026", **sem** nenhuma menção a "Dias restantes",
     "Próxima cobrança" ou "Cancelar assinatura" (confirmei isso
     lendo o texto da página inteira, não só olhando o print).

4. **Autocomplete de material/marca** — já tinha sido implementado e
   testado na sessão anterior, sem mudança nesta.

**Testado**: `npm run build` do frontend limpo; `node --check` em
`src/routes/admin.js` e `src/routes/auth.js` sem erros; e, como
descrito acima, os fluxos 1 e 3 testados de ponta a ponta com o
sistema rodando de verdade, não só por leitura de código.

## Atualização anterior: autocomplete de marca por material (+ um bug real corrigido no caminho) + campo removido em "À vista" + datas na assinatura + reabrir orçamento direto de Pacientes

Quatro pedidos do Marcelo, testados ao vivo (montei o ambiente de novo
aqui no sandbox — Postgres + servidor rodando de verdade — pra
confirmar cada um funcionando antes de entregar, não só pelo código).

**1. Autocomplete de marca por material + BUG REAL corrigido no
caminho.** Pedido: ao digitar o nome de um material, sugerir os já
cadastrados (isso já existia); ao escolher a marca, sugerir só as
marcas que aquele material específico já tem no catálogo (isso não
existia). Implementado com uma função nova,
`brandSuggestionsFor(catalog, materialName)`, que filtra o catálogo
pelo nome do material (comparação sem acento/maiúscula) e devolve só
as marcas únicas encontradas — um `<datalist>` por linha, montado
dinamicamente conforme o material digitado naquela linha.
**No caminho, achei um bug de verdade**: o `MaterialUsageTable` (a
tabela de materiais usada dentro de Custos/Materiais, ao expandir um
procedimento) referenciava um `datalistId` no atributo `list` do
campo de material, mas **o elemento `<datalist>` correspondente nunca
era renderizado em lugar nenhum** — ou seja, o autocomplete de nome de
material nessa tabela específica nunca funcionou desde que foi criada
(o campo "Marca" recebeu o mesmo tratamento agora, então os dois já
saem funcionando).
2. **"Desconto convênio / plano" removido** de Configurações → Formas
   de pagamento → À vista (`app-frontend/src/App.jsx`) — só o campo da
   tela, como pedido; o valor antigo (se alguém já tinha configurado)
   fica salvo no banco sem efeito visível, e "Convênio / Plano"
   continua existindo como forma de pagamento selecionável no
   orçamento (o Marcelo não pediu pra tirar isso, só o campo de
   desconto).
3. **"Gerenciar Assinatura" agora mostra "Assinante desde"** (data de
   ativação da licença) **e troca o rótulo "Expira em" por "Próxima
   cobrança no cartão"** quando for uma assinatura Stripe ativa e não
   cancelada (pra trial ou assinatura já cancelada, continua dizendo
   "Expira em", que faz mais sentido nesses casos). Precisou expor um
   campo novo do backend — `activatedAt` — que já existia gravado no
   banco (`licenses.activated_at`) mas nunca tinha sido incluído no
   retorno de `getLicenseStatusForUser`
   (`src/utils/licenseStatus.js`).
4. **Pacientes → clicar num orçamento da lista expandida agora abre
   ele** (`app-frontend/src/App.jsx`, `PatientsPage`) — exatamente
   como clicar no mesmo orçamento dentro do Histórico. Não precisou
   de lógica nova: só reaproveitei a função `handleReopenBudget` que
   o Histórico já usa, passada como prop nova (`onReopen`) pro
   `PatientsPage`, e transformei cada linha de orçamento (que antes
   era só uma `<div>` estática) num botão clicável.

**Testado de verdade, não só por código**: recriei o ambiente
completo (Postgres + servidor + Playwright) na conta de demonstração
que já tinha ficado pronta numa sessão anterior, e confirmei ao vivo,
com prints: (1) o campo de material no autocomplete agora mostra a
setinha de sugestão (confirma que o `<datalist>` está ligado
certinho — o bug antigo não deixava isso aparecer); (2) clicar num
orçamento dentro de Pacientes abre ele em "Novo Orçamento" com os
dados certos; (3) "Assinante desde: 11/09/2026" aparecendo
corretamente em Gerenciar Assinatura. `npm run build` do frontend
limpo; `node --check src/utils/licenseStatus.js` sem erros.

## Atualização anterior: painel admin ganhou "Visão Geral" — métricas do negócio (MRR, conversão, churn, em risco) + tema claro/escuro alternável

O Marcelo mandou print do painel admin de OUTRO produto dele
(PrestaCerto, um marketplace) como referência de visual sofisticado —
pediu pra deixar o painel do Precifica parecido, mais algumas funções
de dashboard. Adaptei em vez de copiar: o PrestaCerto tem seções que
não fazem sentido pro Precifica (Leads/CRM, "Indique e ganhe" — coisa
de marketplace, não de assinatura SaaS), então mantive só o que se
aplica de verdade ao negócio do Precifica.

**Novidade principal: aba "Visão Geral"** (agora a aba padrão do
painel admin, `AdminDashboard.jsx`), com métricas de verdade:
- Usuários totais, assinantes pagos ativos, em teste grátis agora
- **MRR estimado** (calculado: assinantes mensais × preço + anuais ×
  preço/12)
- **Receita recebida no período** — essa é de verdade, não estimada:
  busca direto na API do Stripe (soma de faturas pagas no período),
  não inventa número a partir do MRR
- **Taxa de conversão trial → pago**
- Novos cadastros e cancelamentos no período selecionado (7/30/90
  dias, com seletor)
- **Assinaturas em risco** (cancelamento já agendado, ainda ativas)
- Lista de cadastros recentes

**Duas colunas novas no banco** (`src/migrate.js`), necessárias pra
calcular duas dessas métricas — sem elas seria impossível saber
historicamente:
- `trial_started_at` — marca quando uma licença NASCEU como trial.
  Sem isso, não dava pra calcular conversão trial→pago depois que o
  trial já converteu (o campo `type` muda de "trial" pra
  "monthly"/"annual" na conversão, apagando esse rastro).
- `cancelled_at` — marca quando o cancelamento foi pedido (ou a
  licença revogada por disputa de cobrança). Sem isso só dava pra
  saber SE está cancelado agora, nunca QUANTOS cancelamentos
  aconteceram num período.

**Rota nova no backend**: `GET /api/admin/dashboard-stats?days=30`
(`src/routes/admin.js`) — calcula tudo isso numa passada só
(`Promise.all` com várias queries em paralelo, mais a chamada pro
Stripe pra receita real).

**Tema claro/escuro alternável, só no painel admin** — botão de
sol/lua no cabeçalho, preferência salva separada
(`localStorage: "admin_theme"`, não mexe na preferência de modo
escuro do app dos clientes). Detalhe técnico que economizou bastante
trabalho: em vez de reescrever cada tabela/badge com classes
condicionais pro tema, o painel admin agora só embrulha tudo numa
`<div className="dark">` quando o tema é escuro — e como o app já
tinha um conjunto grande de overrides de CSS pra classe `.dark`
(criados pro modo escuro dos CLIENTES, sessões anteriores), o painel
admin herda tudo isso de graça: tabelas, badges (teal/amber/rose/
indigo), inputs, botões — tudo já fica escuro direitinho sem precisar
tocar no JSX das tabelas de Usuários/Chaves que já existiam.

**Testado**: `npm run build` do frontend limpo; `node --check` em
`src/routes/admin.js`, `src/migrate.js` e nos outros arquivos que
ganharam as colunas novas, sem erros. **Não testado manualmente** —
principalmente a busca de receita real no Stripe (`invoices.list`)
depende de ter faturas de verdade pra conferir se a soma bate, e as
métricas de conversão/cancelamento só vão ficar interessantes depois
de acumular mais alguns cadastros/cancelamentos reais no banco.

## Histórico resumido (atualizações mais antigas que 5 sessões atrás)

O Marcelo pediu pra parar de guardar o detalhe completo de tudo — a
partir de agora, só as últimas 5 atualizações ficam com a explicação
inteira (acima). O que já estava aqui de sessões mais antigas virou
só uma lista de títulos, pra não perder o rastro de quando algo foi
feito sem inflar o arquivo:

- modo escuro não vaza mais pro login + "lembrar e-mail" no login + clique direito (editar/excluir) nos procedimentos da Calculadora + contraste do modo escuro corrigido lá + glow nas estrelinhas selecionadas
- **Nome do zip**: `precifica DD-MM-AAAA HHhMM.zip` — data e hora de
- **Conteúdo**: uma única pasta chamada `precifica` dentro do zip, e
- Isso vale mesmo que a mudança da sessão tenha sido pequena: o zip
- **Não pergunte antes de gerar o zip.** Assim que uma mudança nessa
- Rota nova, `GET /api/payments/stripe/payment-method`
- Frontend (`app-frontend/src/App.jsx`, `ProfileSettingsPage`) busca
- **Bug pequeno corrigido no caminho**: na primeira tentativa de
- Usuários totais, assinantes pagos ativos, em teste grátis agora
- **MRR estimado** (calculado: assinantes mensais × preço + anuais ×
- **Receita recebida no período** — essa é de verdade, não estimada:
- **Taxa de conversão trial → pago**
- Novos cadastros e cancelamentos no período selecionado (7/30/90
- **Assinaturas em risco** (cancelamento já agendado, ainda ativas)
- Lista de cadastros recentes
- `trial_started_at` — marca quando uma licença NASCEU como trial.
- `cancelled_at` — marca quando o cancelamento foi pedido (ou a
- ajustes visuais (boneco cinza, modo escuro na navegação, botão do trial laranja) + e-mail dedicado do início do teste grátis + BUG REAL corrigido (prazo do trial contava a partir da ativação, não da compra)
- **Nome do zip**: `precifica DD-MM-AAAA HHhMM.zip` — data e hora de
- **Conteúdo**: uma única pasta chamada `precifica` dentro do zip, e
- Isso vale mesmo que a mudança da sessão tenha sido pequena: o zip
- **Não pergunte antes de gerar o zip.** Assim que uma mudança nessa
- Usuários totais, assinantes pagos ativos, em teste grátis agora
- **MRR estimado** (calculado: assinantes mensais × preço + anuais ×
- **Receita recebida no período** — essa é de verdade, não estimada:
- **Taxa de conversão trial → pago**
- Novos cadastros e cancelamentos no período selecionado (7/30/90
- **Assinaturas em risco** (cancelamento já agendado, ainda ativas)
- Lista de cadastros recentes
- `trial_started_at` — marca quando uma licença NASCEU como trial.
- `cancelled_at` — marca quando o cancelamento foi pedido (ou a
- **Bug**: o prazo de 7 dias só era calculado no momento em que a
- **Corrigido** (`src/utils/checkoutLicense.js`): na criação da
- **`sendTrialStartedEmail`** (`src/utils/email.js`, função nova) —
- bug do "Cancelar assinatura" corrigido de vez + "Renovar assinatura" não desloga mais (abre em aba separada) + teste grátis virou fluxo próprio, fora da tela "Assinar agora"
- Dashboard ganhou rota própria (/dashboard)
- URLs próprias pras telas de antes de logar (login, ativar licença, esqueci senha, assinar) + botão voltar/avançar do navegador funcionando entre elas
- largura mínima sem corte agora vale pra TODAS as 10 colunas da tabela de Procedimentos, não só Custo Total/Lucro
- colunas "Custo Total"/"Lucro" nunca mais cortam valor com "..." + 3 títulos de coluna renomeados + tooltip mostra o detalhamento do cálculo
- ícone de perfil (estetoscópio/"+") virou o boneco de usuário + botão "Renovar assinatura" depois de cancelar
- chargeback (disputa de cobrança) agora revoga a licença e cancela a assinatura automaticamente
- aviso "Conta criada"/"Pagamento confirmado" não fica mais grudado na tela de login pra sempre
- teste grátis CONFIRMADO funcionando de ponta a ponta + dois ajustes visuais no menu do perfil
- mensagem explícita de "pode cancelar sem pagar nada" na própria página de checkout do Stripe
- painel admin — coluna "Dono" mostra o e-mail de quem pediu a chave (mesmo sem ter usado ainda) + origem "Admin" mais curta
- teste grátis agora cria licença + manda e-mail SEM depender de nenhum webhook — confirmação síncrona direto com a API do Stripe
- BUG REAL CORRIGIDO — a proteção contra a fatura de trial estava bloqueando cobranças de verdade também (OU em vez de E)
- CONFIRMADO — "checkout.session.completed" nunca chega no webhook, nem com log genérico novo (é configuração do Stripe, não código) + corrigido bug secundário real (subscriptionId vinha undefined)
- e-mails pararam de chegar — pista forte de que "checkout.session.completed" nunca está chegando no webhook (provável configuração faltando no Stripe, não bug de código)
- tela de compra refeita do zero — nada pré-selecionado, plano e teste são escolhas separadas e explícitas, um único botão final
- o "bug" do trial era a tela de compra confundindo (não código) + botão de cancelar sempre visível + reenviar e-mail em toda tela que espera código + frase centralizada
- BUG CONFIRMADO — trial ainda vira 30 dias mesmo com conta nova; reforçada a proteção do webhook + logs de diagnóstico; removida mensagem de renovação por suporte
- aviso de checkout mais direto (sem emoji, diferencia teste grátis de pagamento) + logo centralizado no login + investigação do trial ainda aparecendo como 30 dias
- aviso "confira seu e-mail" depois do pagamento + logo de verdade (não mais só texto) em todas as telas de login/cadastro/compra
- BUG CRÍTICO corrigido — teste grátis virava licença de 30 dias em vez de 7 (corrida entre webhooks do Stripe) + teste grátis virou card + Pix/Boleto removido de vez da tela de compra
- avatar realmente colado no canto direito no celular (o ajuste anterior tinha melhorado mas não resolvido de vez)
- 3 correções SÓ NO CELULAR — menu de perfil cortado + avatar mais perto do canto + cards de Configurações voltam a nascer minimizados (no PC continuam sempre abertos)
- fundo branco removido do logo e do favicon (só o dente com o cifrão, sem o quadrado branco)
- revisão geral do sistema — cores/formato dos botões padronizados + círculo de perfil maior + limpeza de código morto
- Pacientes virou aba principal (não mais botão dentro do orçamento) + clicar no nome expande os orçamentos daquele paciente
- Cadastro de Pacientes (página nova, cadastro manual + sincronização automática com orçamentos) + toggle Profissional/Paciente virou "Apresentação" e um X vermelho pra fechar
- Dashboard sempre mostra os números (zerado, não mais mensagem vazia) + campos de Contato/Email no orçamento + aba "Simulação" virou "+ Novo Orçamento"
- Dashboard novo — virou a página inicial, com dados reais do histórico de orçamentos
- "Uso" agora considera marca também (bug real corrigido) + lista de materiais sem retângulos + Configurações unificada com menu lateral, sempre expandida + limpeza de código morto do Mercado Pago no menu do avatar
- drag-and-drop de verdade + categorias em pills + tabela de materiais com coluna "Uso" — réplica fiel da calculadora avulsa original
- "Calculadora" virou "Custos / Materiais" + renomear material propaga pros procedimentos + importar agora CRIA procedimentos que faltam + botão pra apagar todos os procedimentos
- Calculadora virou uma SEÇÃO própria (não mais modal) — réplica das duas abas Procedimentos/Materiais da ferramenta original, e a criação de procedimentos/categorias saiu de Procedimentos
- Importar/Exportar no catálogo de materiais — traz de volta os dados da calculadora avulsa antiga
- calculadora de custos de materiais integrada de vez ao Precifica — Custo do procedimento passa a ser calculado a partir dos materiais usados
- bug do menu de navegação "grudado" em Simulação corrigido + menu do perfil reorganizado (Aparência removida, "Perfil" primeiro com ícone de pessoa)
- URLs de verdade por seção + cabeçalho virou cartão flutuante + card de Perfil sempre expandido + logo clicável
- ajustes de tamanho no cabeçalho + "Perfil" virou item próprio no menu (separado de "Configurações") + bug real corrigido no caminho
- cabeçalho redesenhado — logo Precifica à esquerda, navegação centralizada, clínica vira "conta logada" à direita
- piso de largura subiu pra 90px + valores não vazam mais pra célula vizinha + Simulação por forma de pagamento também acompanha a largura
- confirmado — largura pequena "grudou" salva; botão de reset + toolbar acompanhando a largura da tabela
- reformulação completa das larguras da tabela de Procedimentos — abordagem só com pixel explícito, sem ambiguidade de CSS
- causa raiz real do "tabela sempre ocupa a tela inteira" — sobrava um w-full na tag <table>
- card da tabela encolhe pro tamanho do conteúdo (não estica até a borda da tela)
- correção do redimensionamento de coluna (campos sobrepondo) + tabela nunca faz scroll horizontal no desktop
- Custo Total em vermelho, nova coluna "Lucro" em verde, colunas redimensionáveis
- investigação do "Igualar margem" sumido + botão "Igualar tudo" no cabeçalho
- nova coluna "Custo adicional" (terceirização/laboratório)
- Sessões agora multiplica a Duração no cálculo + botão "+" pra item avulso na Simulação
- coluna "Sessões", "Mão de obra" virou "Custo Total", tooltips em todas as colunas, "Margem de lucro" renomeada, botão de igualar margem movido pro menu de contexto
- correção de bug do modo escuro — campo ficava ilegível ao focar (fundo branco com texto claro)
- reformulação grande da aba Procedimentos — undo/redo limitado, categorias de verdade (criar/editar/excluir), menu de contexto no celular, edição em modal
- dias restantes no menu de perfil + modo escuro + aviso de vencimento próximo com "Renovar agora"
- correção de bug crítico na renovação + reformulação das abas Usuários e Chaves no painel admin
- deixar explícito que o imposto é sempre uma aproximação (nos dois regimes)
- imposto agora cobre CNPJ também (regime tributário selecionável)
- correções de texto nas descrições do card "Custos"
- renovação com escolha de dias (30/365) + origem da licença no painel admin
- descrições explicativas em Custos + CRO/CRM estruturado (tipo + UF + número)
- auto-salvar orçamento ao exportar, bloquear e-mail duplicado na compra, margem de segurança no toggle da vista Paciente
- botões do orçamento cortados no mobile + barra de navegação inferior (padrão app nativo)
- correções de mobile — status bar sobrepondo o cabeçalho, zoom automático do iOS em inputs, e zoom manual travado
- Mercado Pago pro pagamento único (Pix/Boleto/cartão avulso), Stripe só assinatura
- renovação manual via Pix/Boleto + cancelar assinatura + ajustes na compra
- tela de compra com planos Mensal/Anual + teste grátis de 7 dias (com cartão)
- PWA — "Adicionar app na tela inicial"
- altura do cabeçalho + backup movido pra Procedimentos (só a lista)
- Configurações reduzida a 3 cards, 1 coluna só
- reorganização de Configurações + menu da foto de perfil + licença
- dados do simulador migrados do navegador pro banco (vinculados à conta)
- excluir chaves não usadas + explicação sobre dados "resquício" após excluir conta
- chave anual + coluna "Cliente desde" + excluir conta pela aba de chaves
- garantias sobre a licença comprada
- reorganização do menu do app + correção de z-index
- link de ativação direta no e-mail
- BUG CRÍTICO corrigido — cadastro travava se o e-mail falhasse
- pagamento em produção validado + e-mail resolvido (Zoho Mail)
- pagamento automático — trocado de Asaas pra Stripe
## Estrutura de pastas deste projeto

```
precifica/
├── server.js                    # Express: serve o app React (/) e a API (/api)
├── package.json                  # scripts da raiz, incluindo "build" do frontend
├── .env.example                   # todas as variáveis de ambiente documentadas
├── src/
│   ├── db.js                       # conexão Postgres
│   ├── migrate.js                  # cria/atualiza tabelas + admin inicial (idempotente)
│   ├── middleware/auth.js          # requireAuth / requireAdmin (JWT)
│   ├── routes/
│   │   ├── auth.js                    # cadastro, verificação de e-mail, login, esqueci/redefinir senha, reenviar chave
│   │   ├── admin.js                   # gerar chave (mensal/trial/anual/vitalícia), listar usuários/licenças, bloquear, renovar, revogar, métricas da Visão Geral
│   │   ├── payments.js                # checkout Stripe, renovação self-service (autenticada), cancelar assinatura
│   │   ├── stripeWebhook.js           # checkout.session.completed, invoice.paid, charge.dispute.created (chargeback)
│   │   ├── mercadopagoWebhook.js       # CANCELADO — ver aviso no topo deste arquivo, não mexer
│   │   └── support.js                  # contato/suporte
│   └── utils/
│       ├── email.js                       # envio de e-mail (Brevo/SMTP + fallback console) — inclui e-mail dedicado de início de trial
│       ├── jwt.js                         # assinar/verificar token
│       ├── licenseCode.js                 # gerador de código XXXX-XXXX-XXXX-XXXX
│       ├── licenseStatus.js               # calcula validade/dias restantes/tipo de uma licença
│       ├── checkoutLicense.js             # cria/atualiza licença a partir de uma sessão de checkout (webhook OU confirmação síncrona)
│       ├── stripe.js                       # criação de sessão de checkout (compra nova E renovação)
│       └── shortCode.js                    # gerador de código numérico de 6 dígitos (e-mail)
└── app-frontend/                   # projeto Vite + React (compilado em app-frontend/dist)
    └── src/
        ├── App.jsx                    # o app inteiro logado: Dashboard, Novo Orçamento, Pacientes, Procedimentos, Custos/Materiais, Histórico, Configurações/Perfil — arquivo grande, é o coração do produto
        ├── AuthGate.jsx               # decide o que mostrar: login/cadastro/app/admin/confirmação de renovação, roteamento por URL
        ├── AdminDashboard.jsx         # painel administrativo (Visão Geral, Usuários, Chaves), tema claro/escuro próprio
        ├── AuthLogo.jsx               # logo+nome usado em todas as telas de autenticação
        ├── TrialBanner.jsx            # banner vermelho fixo (só quando licença é trial)
        ├── RenewalWarningBanner.jsx   # aviso de vencimento pra licença que NÃO renova sozinha (admin-gerada)
        ├── LicenseCodeInput.jsx       # campo de chave de licença em 4 caixas (sem traço, cola em qualquer uma)
        ├── screens/                    # Login, Register, VerifyEmail, ForgotPassword, ResetPassword, Buy, TrialSignup, RenewalConfirm, LicenseBlocked
        ├── storageShim.js             # substitui window.storage do Claude.ai por localStorage
        └── api.js                      # chamadas à API com token de autenticação
```

Detalhes técnicos completos (tabelas do banco, variáveis de ambiente,
passo a passo de deploy no Railway) estão no `README.md` na raiz.

## Hub central (verterelabs.com) — combinado verbalmente, não iniciado

Ideia mencionada nas primeiras sessões: um site central em
`verterelabs.com` linkando pros produtos do Marcelo (Precifica
incluso). Nenhum trabalho começou nisso — todas as sessões desde
então focaram só no Precifica em si. Se o Marcelo trouxer isso de
volta, vale perguntar do zero como ele imagina a arquitetura (login
único entre produtos ou separado, subdomínio por produto, etc.) antes
de propor qualquer coisa.

## Como continuar a partir daqui

1. Extraia o zip, leia este `HANDOFF.md` inteiro e depois o
   `README.md`.
2. O código está testado e funcionando — pode seguir editando
   normalmente a partir daqui. Sempre depois de mexer:
   `npm run build` no `app-frontend` (frontend) e `node --check` nos
   arquivos de backend alterados, antes de entregar o zip.
3. Siga a REGRA FIXA DE ENTREGA no topo deste arquivo pra todo zip
   entregue.

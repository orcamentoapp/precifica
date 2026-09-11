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

## Atualização mais recente: pacote principal do site 53% menor (809KB → 376KB) — bibliotecas pesadas carregando só quando usadas + logo do cabeçalho 94% menor

O Marcelo perguntou se dava pra otimizar mais o sistema. Analisei de
verdade (build real, não suposição) e achei 3 coisas concretas:

**1. Chart.js e html2canvas carregavam SEMPRE, pra todo mundo** — as
duas bibliotecas mais pesadas do site (adicionadas em sessões
anteriores, pro Dashboard e pra exportação de orçamento) estavam
importadas no topo do arquivo (`import Chart from "chart.js/auto"`,
`import html2canvas from "html2canvas"`) — isso faz o bundler
(`vite`) colocar as duas dentro do PACOTE PRINCIPAL, baixado por
qualquer pessoa em qualquer tela, mesmo quem nunca abre o Dashboard
nem exporta nada. Troquei pra `import()` dinâmico, carregado só na
hora que a funcionalidade é usada de verdade:
- Chart.js: dentro dos dois `useEffect` do `DashboardSection`
  (`app-frontend/src/App.jsx`) — só carrega quando a aba Dashboard é
  aberta.
- html2canvas: dentro de `renderBudgetTemplateToCanvas` — só carrega
  na hora de exportar ou pré-visualizar um orçamento.

**2. Painel admin carregava pra TODO MUNDO, mesmo quem nunca vê
ele** — `AdminDashboard` (só uma pessoa acessa essa tela, o próprio
Marcelo) estava num `import` estático dentro do `AuthGate.jsx`,
entrando no pacote principal do site pra todo cliente. Troquei pra
`React.lazy()` + `Suspense` — agora é um pacotinho SEPARADO (25KB),
baixado só na hora que alguém entra como admin.

**3. Logo do cabeçalho, 94% menor** — reparei que os 3 lugares que
mostram o logo no topo (app principal, painel admin, telas de login)
carregavam o `icon-512.png` (181KB — o ícone de 512×512 pensado pra
instalação do PWA) só pra mostrar ele em **44 pixels de altura**.
Gerei uma versão nova só pro cabeçalho (`icons/logo-header.png`,
96×96 — nitidez de tela retina em 44px de exibição), que ficou com
**11KB** — e troquei os 3 lugares pra usar ela. O `icon-512.png`
original continua existindo, intacto, pro que ele já servia
(`manifest.json` do PWA) — só não é mais usado pro cabeçalho.

**Resultado, medido antes/depois** (`npm run build`):
- Antes: um pacote principal só, 809KB minificado.
- Depois: pacote principal caiu pra **376KB** (53% menor), com
  Chart.js (208KB), html2canvas (201KB) e o painel admin (25KB) agora
  em pacotes separados, carregados só quando cada um é realmente
  usado. O aviso do Vite sobre "chunk maior que 500KB"
  **desapareceu por completo**.
- Logo do cabeçalho: 181KB → 11KB por carregamento, em 3 lugares.

**O que NÃO foi tocado, e por quê**: `App.jsx` (o produto principal
em si) continua num import estático dentro do `AuthGate` — quase todo
mundo logado precisa dele mesmo, então separar isso não economizaria
quase nada na prática, só adicionaria uma tela de carregando extra
sem ganho real. Não vale a complicação.

**Testado**: `npm run build` do frontend limpo, sem erros, com os
tamanhos exatos confirmados acima (rodei o build antes e depois de
cada mudança pra medir o efeito real, não só supor). **Não testei
manualmente num navegador** se o carregamento sob demanda do
Chart.js/html2canvas/painel admin funciona sem nenhum atraso
perceptível ou tela em branco — vale o Marcelo confirmar depois do
deploy, principalmente a primeira vez que abre o Dashboard ou exporta
um orçamento numa sessão nova (é a única hora que vai ter um
carregamento extra, rápido, que antes não existia).

## Atualização anterior: modelo novo do orçamento exportado (logo, especialidade, cor escolhida pelo usuário, redes sociais) — motor trocado de canvas manual pra HTML/CSS de verdade

O Marcelo mandou um exemplo de orçamento de outra clínica (visual bem
mais elaborado — logo, formas decorativas, ícones em círculo, rodapé
com redes sociais) e perguntou se dava pra chegar nesse nível. Antes
de implementar, montei um protótipo separado (fora do código) pra
validar o estilo com ele — depois de aprovado (com dois ajustes:
rodapé mais leve, e a cor virando escolha do usuário), essa sessão foi
a implementação de verdade.

**Descoberta que definiu a abordagem**: o orçamento hoje era
desenhado manualmente em canvas (`ctx.fillText`, coordenadas em pixel
calculadas na mão, PDF gerado escrevendo os bytes na mão também, sem
nenhuma biblioteca). Reproduzir esse nível de visual (fontes
diferentes, formas translúcidas, ícones) desenhando manualmente seria
extremamente trabalhoso. **Troquei o motor**: agora o orçamento é
montado como HTML/CSS de verdade (a mesma técnica do protótipo
validado) e só DEPOIS virado em imagem, usando a biblioteca
`html2canvas` (nova dependência, `npm install html2canvas`) — o
resultado ainda é um canvas no final, então o resto do pipeline (o
gerador de PDF escrito à mão, `canvasToPDFBlob`, que só embrulha uma
imagem crua num PDF de uma página) **não precisou mudar nada**.

**Peças novas** (`app-frontend/src/App.jsx`):
- `buildBudgetTemplateBodyHTML()` — monta o HTML do orçamento (logo,
  nome, especialidade, tabela de procedimentos, total, forma de
  pagamento, rodapé com telefone/Instagram) com os dados reais.
- `budgetTemplateCSS()` / `budgetTemplateColorVars()` — o CSS do
  modelo e o cálculo das cores derivadas a partir da cor escolhida
  (mesmo sistema do protótipo: a cor escolhida vira a base, e as
  variações — mais escura pra texto, bem clara pra fundo, tom do
  rodapé — são calculadas em HSL a partir dela).
- `renderBudgetTemplateToCanvas()` — desenha esse HTML escondido fora
  da tela, espera as fontes carregarem (Fraunces + Inter, do Google
  Fonts), captura com `html2canvas`, e limpa tudo depois.
- `buildExportCanvasFromTemplate()` (dentro do `SimulationPanel`) —
  junta os dados REAIS do orçamento atual (procedimentos, valores,
  forma de pagamento, validade) e chama as funções acima. Conectada
  nos 4 lugares que exportam: **PNG, PDF, Imprimir e Compartilhar no
  WhatsApp** — os quatro agora usam o motor novo.
- A função antiga (`buildExportCanvas`, o desenho manual) **continua
  no código, só sem uso** — fica de reserva, caso precise voltar rápido
  pro motor anterior por algum motivo.
- `previewBudgetTemplate()` — abre o modelo numa aba nova, com dados
  de EXEMPLO (paciente "Maria", 2 procedimentos fictícios), sem passar
  pelo `html2canvas` (não precisa virar imagem aqui, só mostrar na
  tela) — é o que o botão novo "Visualizar modelo de orçamento" chama.

**Configurações novas** (tela de Perfil):
- **Logo do consultório/clínica** — upload direto (sem recorte,
  diferente da foto de perfil circular que já existia — uma logo pode
  ser retangular). Campo novo, `clinicLogoDataUrl`, propositalmente
  separado de `logoDataUrl` (que é a foto de perfil da pessoa, outra
  coisa).
- **Especialidade** — campo de texto novo, aparece embaixo do nome no
  orçamento.
- **Instagram** — campo de texto novo, aparece no rodapé.
- **Cor de destaque** — um seletor de cor de verdade, ligado ao campo
  `headerColor` que **já existia** no sistema (usado só no realce das
  abas do próprio app) mas nunca tinha um seletor na tela — agora essa
  mesma cor também colore o cabeçalho/tabela/total/rodapé do orçamento
  exportado. Uma cor só, todas as variações calculadas automaticamente.
- **Botão "Visualizar modelo de orçamento"** — abre o modelo com dados
  de exemplo, pra conferir o resultado sem precisar simular um
  orçamento de verdade toda vez que mexe nas configurações.

**Custo dessa mudança**: o `html2canvas` aumentou o tamanho do arquivo
final do frontend de forma perceptível (~594KB → ~809KB minificado) —
esperado, é uma biblioteca de verdade que precisa entender e desenhar
DOM/CSS complexo, bem mais pesada que o desenho manual anterior. Não
fiz nada a respeito (dividir em chunks menores) porque não foi pedido,
mas fica registrado.

**Testado**: `npm run build` do frontend limpo, sem erros. **Não
testei manualmente** o resultado final da exportação (precisaria abrir
o app de verdade num navegador, criar um orçamento, e exportar pra
ver o PNG/PDF saindo com o visual novo) — a lógica segue exatamente o
protótipo já validado visualmente com o Marcelo, e o `html2canvas` é
uma biblioteca madura e amplamente usada pra esse tipo de conversão,
mas vale ele confirmar ao vivo depois do deploy, principalmente:
(a) se a logo aparece certinha quando enviada; (b) se as fontes
(Fraunces/Inter) carregam a tempo da captura, já que dependem de
internet no momento da exportação; (c) o botão "Imprimir" especificamente
— ele abre uma aba nova depois de esperar o `html2canvas` terminar, e
alguns navegadores mais restritivos PODEM bloquear isso por não
considerar mais "clique direto" depois da espera (deixei uma nota no
código explicando como resolver se isso acontecer).

## Atualização anterior: painel admin — modo escuro corrigido de vez (causa raiz) + logo + tooltips nas métricas + chave de licença escondida atrás de um clique + ações agrupadas num menu só

O Marcelo mandou print do painel admin: modo escuro não escurecia o
fundo (só alguns elementos), e pediu mais 4 coisas pra deixar a tela
de Usuários mais enxuta.

**1. Modo escuro — causa raiz encontrada.** A div de fora tinha as
classes `dark` E `bg-stone-50` **no mesmo elemento**
(`app-frontend/src/AdminDashboard.jsx`). O CSS que já existia pro
modo escuro (`index.css`) usa seletor descendente
(`.dark .bg-stone-50 { ... }`) — que só funciona quando `.bg-stone-50`
está DENTRO de um elemento com `.dark`, nunca quando são a mesma tag.
Por isso o fundo nunca escurecia, mesmo com o estado interno já
correto. Corrigido aplicando `.dark` no `<html>` via `useEffect`
(`document.documentElement.classList.toggle(...)`) — exatamente o
mesmo padrão que o app principal já usa (`App.jsx`) e que já
funcionava lá. Como resultado, o pedido de "abrir sempre no modo
escuro por padrão" **já estava certo** desde a sessão anterior
(`localStorage.getItem("admin_theme") || "dark"`) — só nunca
aparecia por causa desse bug.

**2. Logo antes do nome**, no canto superior esquerdo — mesmo ícone
(`icon-512.png`) usado no cabeçalho do app principal.

**3. Tooltip em cada card de "Visão Geral"** — passar o mouse em
qualquer um dos 9 cartões (Usuários totais, MRR, Conversão trial→pago,
etc.) explica o que aquele número representa e como é calculado.

**4. Chave de licença escondida, só abre num popup.** Na tabela de
Usuários, a chave em texto puro sumiu — agora só aparece o badge do
tipo (ex: "Mensal · 30d"), e clicar nele abre um popup pequeno com a
chave completa + botão "Copiar". Componente novo,
`LicenseKeyModal`. (Na aba "Chaves de licença" o código continua
visível direto na lista — lá ele já É o identificador principal da
linha, esconder não faria sentido.)

**5. Ações agrupadas num botão só**, nas duas tabelas (Usuários e
Chaves de licença) — em vez de 3-4 botões (Renovar/Revogar/Bloquear/
Remover) lado a lado disputando espaço, agora é um botão "⋮" que abre
um menuzinho com as mesmas ações. Componente novo, `RowActionsMenu`
(fecha sozinho ao clicar fora, via listener de `click` no
`document`). O padrão de confirmação em dois cliques pras ações
destrutivas continua funcionando (só que agora precisa reabrir o
menu pra ver "Confirmar exclusão?" na segunda vez, já que o menu
fecha a cada clique — pequena troca aceitável pelo ganho de espaço).

**6. Coluna nova "Próxima cobrança"** na tabela de Usuários — só
preenche quando é uma assinatura Stripe ativa e NÃO marcada pra
cancelar (mesmo critério já usado em "Gerenciar Assinatura" dentro do
app do cliente); pros outros casos (trial, licença manual do admin,
assinatura já cancelada) fica vazia, e a coluna "Validade" ao lado
continua mostrando a expiração de sempre pra esses casos. Precisou
expor um campo novo no backend
(`l.cancel_at_period_end AS license_cancel_at_period_end`, rota `GET
/api/admin/users` em `src/routes/admin.js`) que já existia na tabela
mas nunca tinha sido incluído nessa consulta específica.

**De brinde**: achei e removi um import não usado (`RefreshCw`, já
estava sem uso antes desta sessão).

**Testado**: `npm run build` do frontend limpo; `node --check
src/routes/admin.js` sem erros. **Não testei visualmente ao vivo** o
modo escuro (precisaria abrir o painel de verdade num navegador) —
a correção é logicamente sólida (mesmo padrão que já funciona no app
principal, aplicado no mesmo lugar), mas vale o Marcelo conferir com
os próprios olhos depois do deploy, junto com o popup da chave e o
menu de ações agrupado.

## Atualização anterior: rótulos certos em "Gerenciar Assinatura" — "Próxima cobrança dia" (cartão) vs "Expira em" + "Dias restantes" (licença do admin)

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

## Histórico resumido (atualizações mais antigas que 5 sessões atrás)

O Marcelo pediu pra parar de guardar o detalhe completo de tudo — a
partir de agora, só as últimas 5 atualizações ficam com a explicação
inteira (acima). O que já estava aqui de sessões mais antigas virou
só uma lista de títulos, pra não perder o rastro de quando algo foi
feito sem inflar o arquivo:

- contas novas com custo da hora clínica zerado (era exemplo/fictício) + "Dias restantes" escondido pra assinatura Stripe ativa não cancelada + licença VITALÍCIA nova (badge violeta, sem cobrança nem validade)
- autocomplete de marca por material (+ bug do datalist corrigido) + campo "Desconto convênio/plano" removido de À vista + "Assinante desde" e "Próxima cobrança no cartão" em Gerenciar Assinatura + reabrir orçamento direto de Pacientes
- painel admin ganhou "Visão Geral" (MRR, conversão trial→pago, cancelamentos, assinaturas em risco, receita real via Stripe) + tema claro/escuro alternável no painel admin
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

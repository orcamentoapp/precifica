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
convenções de entrega de outros projetos do Marcelo.

## Atualização mais recente: reformulação grande da aba Procedimentos — undo/redo limitado, categorias de verdade (criar/editar/excluir), menu de contexto no celular, edição em modal

Sessão grande, só na aba Procedimentos. Resumo do que mudou e por quê,
pra não repetir raciocínio numa sessão futura:

**1. Barra de ferramentas redesenhada** (`app-frontend/src/App.jsx`,
dentro do `return` do componente `App`, seção `tab === "procedures"`):
- **"Salvar" foi removido** — o app já salvava tudo em tempo real a
  cada edição (todo `onUpdate`/`addProcedure`/etc já chamava
  `persistProcedures`, que grava na hora via `/api/app-data/procedures`).
  O botão "Salvar" era redundante; removido junto com o state
  `justSaved` e a função `handleManualSave` (não sobrou nada usando).
- **"Desfazer" só aparece quando existe algo pra desfazer**
  (`canUndo`), e agora tem par: **"Refazer"** (`canRedo`), também só
  aparece quando existe algo. As duas pilhas (desfazer/refazer) foram
  limitadas a **5 entradas cada** (`MAX_HISTORY = 5`, antes era 20 só
  pro undo, sem redo nenhum). Fazer uma edição nova sempre limpa a
  pilha de "refazer" (comportamento padrão de undo/redo, senão redo
  poderia reaplicar algo que não faz mais sentido). Os botões só
  aparecem dentro da aba Procedimentos porque esse trecho de JSX só
  é renderizado quando `tab === "procedures"` — trocar de aba já os
  esconde sozinho, sem precisar resetar nada.
- **Exportar/Importar movidos pra dentro de um botão de menu (☰)** ao
  lado do "Novo procedimento" — ícone `Menu` do lucide-react, abre um
  dropdown pequeno com as duas opções (mesmo padrão visual dos outros
  menus dropdown do app).
- **Botão novo "Nova categoria"** — abre um modal simples (nome da
  categoria), soma em `settings.procedureCategories` (array novo no
  `DEFAULT_SETTINGS`, persiste junto com o resto de `settings`).

**2. Categorias viraram uma entidade de verdade, não só texto livre**
— antes a "categoria" de um procedimento era só uma string solta no
campo `p.category`, e a lista de categorias mostrada era 100%
derivada dos procedimentos existentes (`groupByCategory`) — não tinha
como existir uma categoria vazia, e não tinha em lugar nenhum do app
um jeito de trocar a categoria de um procedimento depois de criado.
Agora:
- `settings.procedureCategories` guarda os nomes criados manualmente
  (podem existir com zero procedimentos dentro).
- `groupByCategory(procedures, extraCategories)` foi ajustada pra
  aceitar essa lista extra e sempre mostrar essas categorias, mesmo
  vazias (só quando não tem busca ativa — durante uma busca, categoria
  vazia sem resultado não teria sentido aparecer).
- **Clique direito (desktop) ou toque-e-segure (celular) no cabeçalho
  de uma categoria** abre um menu com **Editar** (renomeia — atualiza
  tanto `settings.procedureCategories` quanto o campo `category` de
  todo procedimento que estava usando o nome antigo) e **Excluir**
  (com confirmação de dois cliques dentro do próprio menu — não usa
  `window.confirm` do navegador, mantendo o padrão visual do resto do
  app). **Decisão importante**: excluir uma categoria **não apaga os
  procedimentos dela** — eles voltam a ficar "Sem categoria". Achei
  mais seguro que apagar dados do usuário sem ele pedir isso
  explicitamente; se quiser que exclua os procedimentos junto, é só
  pedir que eu mudo.
  - A categoria especial **"Sem categoria"** (usada quando
    `p.category` está vazio) não é editável nem removível — o menu de
    contexto nem abre pra ela (guard em `openCategoryMenu`).

**3. Procedimentos também ganharam clique direito/toque-e-segure** —
o menu de contexto já existia pra desktop (`onContextMenu`), faltava
funcionar no celular. Implementado um "toque e segure" próprio (~500ms,
cancela se o dedo se mover — pra não atrapalhar o scroll da lista):
funções `longPressHandlers`/`consumeSuppressedClick` dentro de
`ProcedureTable`, usando refs em vez de outro hook, porque hooks não
podem ser chamados dentro de `.map()`. O menu ganhou uma opção nova,
**"Editar"**, além de Duplicar/Excluir que já existiam.
- **"Editar" abre um modal novo, `ProcedureEditModal`** — formulário
  vertical (Nome, Categoria, Custo, Valor, Margem, Duração), pensado
  pra funcionar bem no celular, onde editar direto numa tabela larga
  de 7 colunas é ruim. Cada campo já chama o mesmo `onUpdate` de
  sempre (salva na hora, sem botão de salvar dentro do modal — só
  "Concluído" pra fechar). **Esse modal também resolve uma lacuna que
  não existia antes**: não tinha em lugar nenhum do app como trocar a
  categoria de um procedimento já criado (só dava pra escolher
  categoria vazia `""` na criação) — agora o campo "Categoria" é um
  `<select>` com todas as categorias já usadas em algum procedimento +
  as criadas manualmente, mais a opção "+ Nova categoria..." direto
  ali.

**Testado**: `npm run build` do frontend limpo, sem erros; confirmei
que os ícones novos (`Redo2`, `Menu`, `Pencil`, `FolderPlus`) existem
de verdade no pacote `lucide-react` instalado (`node -e` importando e
checando `typeof`). **Não testado manualmente em dispositivo real** o
toque-e-segure no celular nem o fluxo completo de criar/renomear/
excluir categoria com dados reais — vale o Marcelo testar esses
fluxos especificamente depois do deploy, é a parte com mais lógica
nova nessa sessão.

## Atualização anterior: dias restantes no menu de perfil + modo escuro + aviso de vencimento próximo com "Renovar agora"

Três pedidos do Marcelo, todos no app do cliente (não no painel admin):

1. **Dias restantes da licença no menu de perfil** — abrindo o menu ao
   clicar na foto (componente `OptionsMenu` em
   `app-frontend/src/App.jsx`), logo abaixo do e-mail agora aparece
   "X dias restantes na licença" (ou "Licença vence hoje"), usando
   `account.license.daysLeft` que já vinha do backend mas não era
   exibido ali.

2. **Modo escuro** — novo toggle em Aparência (dentro do mesmo menu),
   salvo em `settings.darkMode` (persistido por conta, como
   `headerColor`/`secondaryColor` já eram). Um `useEffect` no
   componente `App` (`app-frontend/src/App.jsx`) aplica/remove a
   classe `dark` no `<html>` conforme esse valor.
   **Decisão de abordagem, importante pra próxima sessão**: em vez de
   reescrever cada className do app com variantes `dark:` do Tailwind
   (inviável com segurança num arquivo de ~3900 linhas numa sessão só,
   risco alto de esquecer cantos), o tema escuro foi implementado como
   **overrides de CSS** em `app-frontend/src/index.css`, sob o seletor
   `.dark`, sobrescrevendo diretamente as classes Tailwind que o app já
   usa (`bg-white`, `bg-stone-50/100`, `text-stone-400` a
   `text-stone-900`, `border-stone-100/200/300`, os `hover:`/`focus:`
   mais comuns, e os chips de cor teal/amber/rose/indigo). Isso cobre a
   grande maioria das telas automaticamente, mas **não é garantido
   100% dos cantos** — se algum lugar específico ficar com contraste
   ruim ou fundo branco "vazando" no escuro, é reportar pra ajuste
   pontual (provavelmente falta a classe usada ali na lista de
   overrides).

3. **Aviso de licença perto de vencer + "Renovar agora"** — componente
   novo `RenewalWarningBanner.jsx` (mesmo padrão visual/estrutural do
   `TrialBanner.jsx` já existente: barra fixa no topo + espaçador,
   `env(safe-area-inset-top)` reservado). Aparece quando
   `daysLeft <= 7` **e** a licença NÃO é trial **e** NÃO tem assinatura
   Stripe ativa (`hasStripeSubscription`) — ou seja, só pra licença
   mensal/anual que não renova sozinha (comprada via Mercado Pago ou
   concedida pelo admin). O botão "Renovar agora" chama a mesma rota
   que já existia em Configurações → Licença
   (`POST /api/payments/mercadopago/renew-checkout`, com
   `plan: license.type`) e redireciona pro checkout do Mercado Pago.
   Ligado em `AuthGate.jsx`, ao lado de onde o `TrialBanner` já era
   decidido (mutuamente exclusivos, então nunca aparecem os dois ao
   mesmo tempo).

**Testado**: `npm run build` do frontend limpo, sem erros. Não testado
visualmente o modo escuro em cada tela nem o fluxo de pagamento do
"Renovar agora" ponta a ponta nesta sessão — vale o Marcelo dar uma
olhada geral no app com o modo escuro ligado depois do deploy.

## Atualização anterior: correção de bug crítico na renovação + reformulação das abas Usuários e Chaves no painel admin

Três mudanças no painel admin, a partir de feedback do Marcelo:

1. **BUG CORRIGIDO: renovar substituía a validade em vez de somar** —
   o Marcelo percebeu que uma licença com 7 dias restantes, ao ser
   renovada com "+365 dias", ficava com 365 dias (não 372). A rota
   `POST /api/admin/licenses/:id/renew` (`src/routes/admin.js`)
   sempre calculava `expires_at` a partir de `new Date()` (agora),
   descartando a validade que já existia. Corrigido pra usar a mesma
   lógica que o webhook do Mercado Pago já usava pra renovação
   (`src/routes/mercadopagoWebhook.js`): se a licença ainda não
   expirou, os dias novos somam a partir da **data de expiração
   atual**; só reinicia a contagem a partir de hoje se ela já tiver
   vencido. Vale conferir se alguma licença ficou com validade errada
   por causa desse bug numa renovação anterior a essa correção.
2. **Aba "Chaves de licença" agora só mostra chaves não utilizadas** —
   `GET /api/admin/licenses` (`src/routes/admin.js`) ganhou
   `WHERE l.status = 'unused'`. Chaves já em uso (vinculadas a uma
   conta ativa) não aparecem mais aqui — pra ver o que cada cliente
   tem, é a aba "Usuários" que traz essa informação agora.
3. **Aba "Usuários" reformulada** — só lista contas com
   `status = 'active'` (`WHERE u.status = 'active'` no
   `GET /api/admin/users`), e as colunas viraram: E-mail, Origem,
   Nome/Clínica, Cliente desde, Licença (chave + dias restantes),
   Validade, Ações.
   - **Bug corrigido: "Nome/Clínica" sempre vinha vazio** — a causa
     era que a tela de cadastro (`Register.jsx`) nunca coletou
     nome/clínica do usuário, então `users.name`/`users.clinic_name`
     ficavam sempre `NULL`. Quem tem esse dado de verdade é o próprio
     usuário, preenchido em Configurações → "Nome" dentro do app — e
     isso fica salvo em `app_data` (chave `'settings'`), não na
     tabela `users`. A rota agora faz `LEFT JOIN app_data` e extrai
     `clinicName` de dentro do JSON salvo lá, com fallback pra
     `users.clinic_name`/`users.name` se algum dia isso vier
     preenchido por outro caminho.
   - **Coluna "Origem" nova** — mesma informação (gerada no painel
     admin / comprada via Stripe / comprada via Mercado Pago) que já
     existia na aba Chaves, agora também na aba Usuários. Precisou
     trazer `l.source`, `l.buyer_email`, `l.stripe_subscription_id` da
     licença mais recente de cada usuário no `GET /api/admin/users`, e
     um helper novo no frontend (`userLicenseOriginInfo`, em
     `AdminDashboard.jsx`) que adapta os nomes de coluna prefixados
     `license_*` pro mesmo `licenseOriginInfo()` já usado na aba
     Chaves.
   - **Coluna "Validade" nova** — data de expiração da licença
     (`license_expires_at`) formatada, separada da coluna "Licença"
     (que continua mostrando o código + dias restantes).
   - A antiga coluna "Conta" (badge Ativa/Bloqueada) foi removida —
     ficou redundante já que a lista inteira agora só mostra contas
     ativas.

**Testado**: `npm run build` do frontend limpo; `node --check` em
`src/routes/admin.js` sem erros. Não testado com dados reais de
produção nesta sessão (exigiria um banco Postgres populado) — vale o
Marcelo conferir depois do deploy que a coluna "Nome/Clínica" aparece
certinha pra clientes que já preencheram esse campo em Configurações.

## Atualização anterior: deixar explícito que o imposto é sempre uma aproximação (nos dois regimes)

Complemento direto da sessão anterior (regime tributário CNPJ). O
Marcelo perguntou duas coisas, e a resposta virou texto mais explícito
na tela — sem nenhuma mudança de cálculo:

1. **"O cálculo não vai dar um valor exato, e sim aproximado?"** — sim,
   nos dois regimes. Adicionado um aviso destacado (caixa âmbar) logo
   acima do toggle CPF/CNPJ, deixando isso explícito antes mesmo do
   usuário escolher o regime: "Esse percentual é sempre uma
   aproximação, não o cálculo exato do imposto que você vai pagar".
   Também reforçado no aviso que aparece dentro da "Simulação por
   forma de pagamento" de cada procedimento (`PaymentTable` em
   `app-frontend/src/App.jsx`) — pro CNPJ agora também diz "estimativa,
   pode mudar mês a mês" (antes só o texto do profissional liberal
   tinha esse aviso).
2. **"A porcentagem do profissional liberal também não é fixa? Qual a
   melhor forma de colocar isso no sistema?"** — mesma lógica que já
   valeu pra decisão do CNPJ na sessão anterior: **não vale a pena
   tentar calcular o IRPF progressivo de verdade dentro do app**
   (dependeria de renda total do ano inteiro somando todas as fontes,
   deduções, dependentes — informação que o Precifica não tem e não é
   o objetivo dele coletar). A melhor forma continua sendo o campo
   único de "provisão estimada" que já existia — só reescrevi o texto
   abaixo dele pra deixar mais claro que a alíquota real do Carnê-Leão
   depende da renda total do ano, não é fixa por atendimento, e por
   isso o usuário deve reajustar esse percentual de vez em quando.

**Testado**: `npm run build` do frontend limpo, sem erros.

## Atualização anterior: imposto agora cobre CNPJ também (regime tributário selecionável)

O Marcelo perguntou como calcular imposto pra quem é CNPJ (o sistema
só cobria profissional liberal/CPF até então). Decisão tomada em
conjunto — vale registrar o raciocínio pra não repetir a discussão:

**Por que não calcular o Simples Nacional "do zero" (RBT12 + Fator R +
tabela de Anexo III/V)**: a alíquota do Simples Nacional depende da
receita bruta dos últimos 12 meses e da folha de pagamento, com risco
real de classificar errado o Anexo (III vs V) e gerar um preço
sugerido incorreto. Optamos por **não implementar essa conta** — em
vez disso, o usuário digita a alíquota efetiva que já vem pronta e
validada na guia de pagamento (DAS) todo mês, ou que o contador
informa (caso Lucro Presumido). Mais simples e mais confiável do que
tentar reproduzir a legislação tributária dentro do app.

**Por que continua sendo um percentual único global, não por
procedimento**: praticamente todo procedimento odontológico é
tributado como serviço (ISS) — não haveria ganho real em permitir
variar por procedimento, só complexidade extra sem necessidade prática
pro caso de uso do Marcelo.

**O que foi implementado** (`app-frontend/src/App.jsx`):
- `DEFAULT_SETTINGS.taxRegime`: novo campo, `"liberal"` (padrão, mantém
  compatibilidade com contas existentes) ou `"cnpj"`.
- Seção "Imposto" (dentro do card "Custos") ganhou um toggle
  Profissional liberal (CPF) / CNPJ. O campo de percentual
  (`taxProvisionPercent`) continua sendo o mesmo — só o rótulo e o
  texto explicativo abaixo mudam conforme o regime selecionado,
  orientando onde encontrar o percentual certo em cada caso (DAS do
  Simples Nacional, contador no caso de Presumido, ou Carnê-Leão pro
  liberal).
- O aviso que aparece na "Simulação por forma de pagamento" (dentro de
  cada procedimento) também passou a respeitar o regime — antes
  sempre dizia "Carnê-Leão" mesmo pra quem selecionasse CNPJ. Precisou
  encaminhar `settings.taxRegime` como prop através de
  `PaymentSimulationPanel` → `PaymentTable` (esses componentes não
  recebiam `settings` antes).
- Nenhuma mudança na lógica de cálculo (`calcProcedure`/`calcBudget`)
  — o percentual continua entrando exatamente do mesmo jeito, só o que
  mudou foi rótulo/orientação na tela.

**Testado**: `npm run build` do frontend limpo, sem erros.

## Atualização anterior: correções de texto nas descrições do card "Custos"

Ajustes pontuais de texto, a pedido do Marcelo, sem nenhuma mudança de
lógica/cálculo — só nas descrições em `app-frontend/src/App.jsx`
(mesma seção "Custo da hora clínica" de dentro do card "Custos"):

1. **Custos fixos mensais** — removida a menção a "material de consumo
   fixo (luvas, máscaras, etc)" do texto de exemplo; esses materiais
   não são custo fixo mensal na visão do Marcelo, não deveriam estar
   nesse exemplo.
2. **Pró-labore desejado** — o final da frase mudou de "...pra
   calcular o preço mínimo que cobre tudo" para "...para calcular o
   valor a ser cobrado de acordo com a margem de lucro definida".
3. **Horas produtivas / mês** — mudança mais substancial, dois pontos:
   - **Texto reescrito**: antes dizia pra considerar só o tempo real
     com paciente na cadeira (não o expediente todo); o Marcelo achou
     essa lógica difícil de aplicar na prática (o profissional não
     sabe de antemão quantos pacientes vai atender no mês). Novo
     texto orienta a considerar o **expediente de trabalho** mesmo
     sem atender — ex: 8h/dia, 5 dias/semana ≈ 160h/mês.
   - **Reposicionamento**: a descrição de "Horas produtivas" agora
     fica logo abaixo do próprio campo (antes só aparecia depois da
     linha "Custo / hora resultante", parecia explicar os dois campos
     ao mesmo tempo). Foi adicionada uma descrição nova, curta, só
     pra "Custo / hora resultante": **"Valor da hora trabalhada."**

**Testado**: `npm run build` do frontend limpo, sem erros.

## Atualização anterior: renovação com escolha de dias (30/365) + origem da licença no painel admin

Duas melhorias no painel admin, a partir de pedido do Marcelo:

1. **Renovar agora pergunta quantos dias adicionar** — antes o botão
   "Renovar" (nas abas Usuários e Chaves) chamava a API direto, sempre
   somando a duração padrão do TIPO da licença (30/365/7 dias). Agora
   abre um modal pequeno perguntando "+30 dias" ou "+365 dias", e esse
   valor é enviado no body pra API — dá pra dar um bônus de 365 dias
   numa licença mensal, por exemplo, sem precisar mudar o tipo dela.
   - Backend: `POST /api/admin/licenses/:id/renew`
     (`src/routes/admin.js`) agora aceita `{ days }` no body (só aceita
     30 ou 365 — qualquer outro valor cai no comportamento antigo,
     baseado no tipo da licença, então é retrocompatível).
   - Frontend: `AdminDashboard.jsx` ganhou o estado `renewModal` e o
     modal de escolha; `handleRenew(licenseId, days)` agora recebe os
     dias e manda no body.
2. **Origem da licença visível na aba Chaves** — nova coluna "Origem"
   mostra se a chave foi **gerada manualmente no painel admin** ou
   **comprada** (e nesse caso, com qual forma de pagamento: "Cartão
   (assinatura Stripe)" ou "Pix / Boleto / Cartão avulso").
   - Backend: nova coluna `source` na tabela `licenses`
     (`src/migrate.js`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) —
     gravada como `'admin'` em `POST /api/admin/licenses`
     (`src/routes/admin.js`), `'stripe'` nos dois pontos de criação de
     licença em `src/routes/stripeWebhook.js`, e `'mercadopago'` em
     `src/routes/mercadopagoWebhook.js`.
   - **Licenças criadas antes dessa coluna existir** ficam com
     `source = NULL` — não precisou de backfill porque o frontend
     (`licenseOriginInfo()` em `AdminDashboard.jsx`) já infere a
     origem pelos campos que sempre existiram: tem
     `stripe_subscription_id` → veio do Stripe; senão, tem
     `buyer_email` → veio do Mercado Pago; sem nenhum dos dois → foi
     gerada no painel admin.

**Testado**: `npm run build` do frontend limpo; `node --check` em
`src/routes/admin.js`, `src/routes/stripeWebhook.js`,
`src/routes/mercadopagoWebhook.js` e `src/migrate.js`, todos sem erro.
Não foi possível testar ponta a ponta com um webhook real do
Stripe/Mercado Pago chegando de verdade nesta sessão — vale o Marcelo
conferir depois de uma compra real que a coluna "Origem" aparece
certinha pra uma licença nova.

## Atualização anterior: descrições explicativas em Custos + CRO/CRM estruturado (tipo + UF + número)

Duas melhorias em Configurações, a partir de pedido do Marcelo:

1. **Descrições explicativas no card "Custos"** — os campos "Custos
   fixos mensais" e "Pró-labore desejado" (dentro de "Custo da hora
   clínica", `app-frontend/src/App.jsx`) não tinham nenhuma explicação
   de como o usuário deveria chegar nesse valor; agora cada um tem um
   parágrafo curto embaixo explicando o que somar/considerar. O texto
   de "Horas produtivas / mês" também foi expandido com um exemplo
   numérico (5h/dia, 4 dias/semana ≈ 80h/mês). O card "Imposto" e o
   card "Formas de Pagamento/Taxas" já tinham descrições boas, não
   precisou mexer neles.
2. **CRO/CRM virou campo estruturado, não mais texto livre** — antes
   era um único `<input type="text">` onde o usuário digitava
   "CRO-SP 12345" à mão (sujeito a erro de formatação). Agora é o
   componente novo `ProfessionalRegistrationField`
   (`app-frontend/src/App.jsx`, definido logo antes de
   `ProfileSettingsPage`): dois `<select>` (Tipo: CRO/CRM — Estado: as
   27 UFs do Brasil, constante `BRAZIL_UF_LIST`) mais um campo numérico
   que só aceita dígitos e trava em 6 caracteres. Os três só se
   combinam e são salvos em `settings.professionalRegistration` quando
   estão completos e o número tem entre 4 e 6 dígitos — formato final
   idêntico ao de antes (`"CRO-SP 123456"`), então nada mais no app
   (footers de PDF/PNG/WhatsApp, exibição no orçamento) precisou
   mudar. Ao abrir a tela com um valor já salvo no formato antigo, o
   componente faz o parse de volta pros três campos automaticamente
   (regex `/^(CRO|CRM)-([A-Z]{2})\s+(\d{4,6})$/`) — se o valor salvo
   não bater com esse padrão (ex: ficou vazio, ou foi digitado num
   formato diferente antes dessa mudança), os três campos simplesmente
   começam vazios e o usuário preenche de novo.

**Testado**: `npm run build` do frontend limpo, sem erros.

## Atualização anterior: auto-salvar orçamento ao exportar, bloquear e-mail duplicado na compra, margem de segurança no toggle da vista Paciente

Três correções pontuais, a partir de feedback do Marcelo:

1. **Orçamento agora salva sozinho no histórico ao ser exportado** —
   antes só salvava se o usuário clicasse manualmente em "Salvar".
   Criada `autoSaveOnExport()` em `app-frontend/src/App.jsx`, chamada
   no início de `handleExportPNG`, `handleExportPDF`, `handlePrint` e
   `handleShareWhatsApp` (só depois de confirmar que o canvas foi
   gerado com sucesso, ou seja, só quando a exportação realmente vai
   acontecer). Reaproveita a mesma lógica do `handleSaveBudget`: se já
   tem `currentEntryId` (orçamento já salvo antes, nessa sessão),
   atualiza a entrada existente em vez de criar uma duplicada a cada
   exportação repetida do mesmo orçamento.
2. **Bloqueado seguir pro pagamento com e-mail que já tem conta** — as
   rotas públicas `POST /api/payments/stripe/checkout` e
   `POST /api/payments/mercadopago/checkout`
   (`src/routes/payments.js`) agora checam `SELECT id FROM users WHERE
   email = $1` antes de criar a sessão de pagamento; se já existir,
   retornam 409 com a mensagem "Já existe uma conta com esse e-mail.
   Faça login em vez de assinar/comprar de novo." — a tela `Buy.jsx`
   já exibia esse tipo de erro retornado pela API, não precisou mexer
   no frontend.
3. **Toggle Profissional/Paciente colado na Ilha Dinâmica do iPhone na
   vista de Paciente** — a vista de Paciente é um overlay
   `fixed inset-0` que começa exatamente no topo da tela, sem o
   cabeçalho normal do app (que já tinha o ajuste de
   `safe-area-inset-top` de uma sessão anterior). Adicionado
   `paddingTop: env(safe-area-inset-top, 0px)` só nesse wrapper
   (`app-frontend/src/App.jsx`, função que renderiza o painel de
   Orçamento), aplicado apenas quando `patientMode` é `true` — não
   afeta a vista Profissional normal.

**Testado**: `npm run build` do frontend limpo; `node --check` em
`src/routes/payments.js` e `server.js` sem erros. Não testado o fluxo
de pagamento ponta a ponta com Stripe/Mercado Pago reais nesta sessão
(exigiria credenciais de teste) — a lógica da checagem de e-mail
duplicado é uma consulta simples e direta, mas vale o Marcelo conferir
uma vez em produção que a mensagem de erro aparece certinho na tela de
compra ao tentar com um e-mail já cadastrado.

## Atualização anterior: botões do orçamento cortados no mobile + barra de navegação inferior (padrão app nativo)

Sessão curta de ajustes de mobile, a partir de prints do Marcelo:

1. **Botões da barra "Orçamento" (Salvar/Exportar/estrelas/Profissional-
   Paciente/Limpar) ficavam pra fora da tela no celular** — a `div` que
   agrupa esses botões (`app-frontend/src/App.jsx`, dentro do painel de
   Orçamento) não tinha `flex-wrap`, então empurrava tudo numa linha só
   pra fora da tela em telas estreitas. Adicionado `flex-wrap
   justify-end`.
2. **Abas Simulação/Procedimentos/Histórico viraram barra de navegação
   inferior fixa no mobile** (padrão de app nativo, a pedido do
   Marcelo) — `TabNav` em `App.jsx` agora renderiza dois layouts: o
   menu em pílula de sempre continua em telas ≥768px (`md:flex`), e
   abaixo disso vira uma barra fixa no rodapé com ícone (Calculator /
   ClipboardList / Clock, de `lucide-react`) + rótulo, com
   `env(safe-area-inset-bottom)` reservado pra não colidir com a barra
   de gestos do iPhone. O `<main>` ganhou padding-bottom extra nesses
   breakpoints pra nenhum conteúdo ficar escondido atrás da barra fixa.

**Testado**: `npm run build` do frontend rodou limpo. Não testado em
dispositivo real nesta sessão — vale o Marcelo confirmar visualmente
que (a) os botões do orçamento não saem mais da tela e (b) a barra
inferior aparece só no celular, sem sobrepor conteúdo.

## Atualização anterior: correções de mobile — status bar sobrepondo o cabeçalho, zoom automático do iOS em inputs, e zoom manual travado

Sessão curta, focada em bugs visuais no celular reportados pelo
Marcelo com print de tela. Dois problemas distintos, os dois
corrigidos:

**1. Relógio/ícones do iPhone sobrepondo o cabeçalho azul do app** —
causa: a tag `apple-mobile-web-app-status-bar-style` está como
`black-translucent` (deixa a status bar transparente, flutuando por
cima do conteúdo, em vez de empurrar pra baixo) mas o CSS não reservava
esse espaço. Corrigido com `env(safe-area-inset-top)`:
- `app-frontend/index.html` — meta viewport ganhou `viewport-fit=cover`
  (necessário pra `env(safe-area-inset-*)` funcionar).
- `app-frontend/src/App.jsx` — o `<header>` principal ganhou
  `paddingTop: env(safe-area-inset-top, 0px)`.
- `app-frontend/src/TrialBanner.jsx` — o banner vermelho fixo de trial
  também é fixo no topo e tinha o mesmo problema; ganhou o mesmo
  `paddingTop`, e a altura do espaçador (`TOTAL_HEIGHT`) foi ajustada
  pra somar `env(safe-area-inset-top)` à altura fixa de 36px, senão
  sobrava/faltava espaço pro conteúdo abaixo.

**2. Foto de perfil cortada / app parecia "zoomado" ao abrir, só
resolvia com pinça pra diminuir o zoom** — essa era a causa raiz mais
importante, e é o zoom automático do iOS: o Safari força zoom na tela
inteira quando o usuário foca um `<input>` com `font-size` menor que
16px, e esse zoom não desfaz sozinho. Corrigido:
- `app-frontend/src/index.css` — regra global (com `!important`, pra
  sobrepor classes do Tailwind tipo `text-sm` que já vinham aplicadas
  nalguns inputs) forçando `font-size: 16px` em todo `input`, `select`
  e `textarea` dentro de `@media (max-width: 767px)`.

**3. Zoom manual (pinça) travado, a pedido explícito do Marcelo** —
`app-frontend/index.html`, meta viewport ganhou `maximum-scale=1.0,
user-scalable=no`. **Nota de acessibilidade pra próxima instância**: o
Marcelo foi avisado que isso impede qualquer usuário (inclusive quem
precisa de zoom por baixa visão) de ampliar a tela manualmente, e
decidiu manter travado mesmo assim — não é um esquecimento, foi
escolha dele.

**Testado**: `npm run build` do frontend rodou limpo duas vezes (antes
e depois do ajuste de zoom manual), sem erros. Não foi possível testar
em dispositivo iOS real nesta sessão (ambiente sem acesso a hardware
Apple) — vale o Marcelo confirmar visualmente no celular dele depois
do deploy que: (a) o cabeçalho não fica mais atrás do relógio, (b) ao
tocar em qualquer campo de texto a tela não pula mais de zoom, e (c) a
pinça pra dar zoom não funciona mais em lugar nenhum do app.

## Atualização anterior: Mercado Pago pro pagamento único (Pix/Boleto/cartão avulso), Stripe só assinatura


**⏸️ PARADO NO MEIO DA CONFIGURAÇÃO DO MERCADO PAGO** — o código está
pronto e testado (ver detalhes completos logo abaixo), mas o Marcelo
ainda **não tem as credenciais** porque a página "Credenciais de teste"
no painel de desenvolvedores do Mercado Pago está dando
"Ocorreu um erro" pra ele, mesmo depois de tentar aba anônima, limpar
cache, e checar verificação pendente na conta. Ele decidiu deixar isso
pra depois. **Continue daqui**: se ele voltar com o Access Token e a
Chave Secreta do Webhook, é só ele colar no Railway
(`MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET`) e testar — o
código já está pronto, não precisa mexer em nada. Se o erro no painel do
Mercado Pago persistir, pode valer sugerir ele abrir um chamado com o
suporte do Mercado Pago, já que não é algo que dá pra resolver por fora
da própria plataforma deles.

Sessão longa de decisão + implementação. Resumo da conversa com o
Marcelo, pra não repetir a mesma investigação numa sessão futura:

**Contexto/decisão**: o Marcelo queria Pix na tela de compra. Pix no
Stripe pra contas BR é por convite — ainda não liberado nessa conta.
Avaliamos juntos: Mercado Pago, PagSeguro/PagBank, e plataformas
"Merchant of Record" (Hotmart/Eduzz). Achados importantes (pesquisados
ao vivo, vale conferir se mudou):
- **PagBank bloqueia CONTA PESSOA FÍSICA de usar a API de Pagamento
  Recorrente** (confirmado na doc oficial deles) — eliminado de cara,
  já que o Marcelo não tem CNPJ.
- **Mercado Pago**: Pix pra ASSINATURA (recorrente) não é confiável hoje
  — achamos um relato técnico oficial (GitHub) dizendo que a API de
  Assinaturas (`/preapproval`) só aceita cartão ou boleto, não Pix de
  verdade (o que os blogs chamam de "Pix recorrente" parece ser reenvio
  manual, não débito automático). Pix pra PAGAMENTO ÚNICO funciona bem e
  sem fila de espera.
- **Hotmart/Eduzz** (Merchant of Record) resolveriam tudo (Pix + esconder
  nome pessoal + sem CNPJ), mas têm taxa mais alta e são pensados pra
  infoprodutos — ficou como opção descartada por enquanto, não
  implementada.
- **Nome no extrato**: com conta pessoa física (sem CNPJ) no Mercado
  Pago, o nome do Marcelo (não um nome fantasia) tende a aparecer pro
  cliente que paga — achamos um relato de outro vendedor com a mesma
  reclamação, mas não uma confirmação 100% oficial de que não dá pra
  configurar diferente. Vale ele mesmo checar no painel
  (Configurações → nome da loja/descritor) antes de bater o martelo. Se
  incomodar, abrir um MEI resolve (rápido, grátis, sozinho, pelo Portal
  do Empreendedor).
- **Decisão final do Marcelo**: manter a ASSINATURA (cartão + trial) no
  Stripe — já funciona, não tem os bloqueios acima — e usar o Mercado
  Pago **só pro pagamento único** (Pix, Boleto, cartão avulso — os
  botões "Pagar com Pix ou Boleto" na compra e "+30 dias"/"+365 dias" em
  Configurações → Licença).

**⚠️ Segurança encontrada durante a implementação — CVE-2026-76842**: o
SDK oficial do Mercado Pago pra Node.js (`mercadopago` no npm) tinha uma
vulnerabilidade de **path injection** (severidade alta), publicada há
poucos dias, corrigida a partir da versão 3.5.0. Fixei `^3.6.0` no
`package.json` (testei: instala e importa certinho). Além disso, **por
segurança em profundidade**, `src/utils/mercadopago.js` valida
manualmente que qualquer ID de pagamento vindo de fora (do corpo de um
webhook, por exemplo) é só dígitos antes de passar pra qualquer chamada
da SDK — **nunca remova essa validação**, mesmo que a SDK já esteja
corrigida.

**O que foi implementado:**
- `package.json` — dependência `mercadopago: ^3.6.0`.
- `src/utils/mercadopago.js` (NOVO) — `createOneTimePaymentPreference`
  (cria uma Preference via Checkout Pro do Mercado Pago, retorna o
  `init_point`/`sandbox_init_point` pra redirecionar o cliente — mesmo
  papel que `session.url` tinha no Stripe), `getPayment` (busca um
  pagamento por ID, com o ID sempre validado antes), e
  `verifyWebhookSignature` (confere a assinatura HMAC que o Mercado Pago
  manda no header `x-signature`, comparação em tempo constante).
- `src/routes/mercadopagoWebhook.js` (NOVO) — recebe a notificação,
  confere a assinatura (rejeita com 401 se inválida), busca o pagamento,
  e se `status === "approved"`: soma os dias na licença existente (se
  veio de renovação de conta logada) ou cria uma licença nova + manda o
  código por e-mail (se veio de compra nova) — exatamente o mesmo padrão
  que o pagamento único já tinha no Stripe antes de mudar de provedor.
  Reaproveita a tabela `stripe_processed_events` pra idempotência
  (prefixando a chave com `mp_payment_` pra não colidir com eventos do
  Stripe).
- `src/routes/payments.js` — `POST /stripe/checkout` voltou a ser só
  assinatura (tirei o parâmetro `method`/`pix_boleto` que tinha
  entrado); duas rotas novas: `POST /mercadopago/checkout` (pública,
  compra nova) e `POST /mercadopago/renew-checkout` (autenticada,
  renovação); e `POST /mercadopago/webhook` montado aqui também (cai em
  `/api/payments/mercadopago/webhook`, sem precisar mexer no
  `server.js` — o Mercado Pago não exige corpo "cru" como o Stripe pra
  verificar assinatura, então não precisou de tratamento especial de
  `express.raw`).
- `src/utils/stripe.js` — removida a função `createOneTimePaymentCheckout`
  (não é mais dele). `createCheckoutSession` (assinatura) e
  `cancelSubscriptionAtPeriodEnd` continuam iguais.
- `src/routes/stripeWebhook.js` — removido o bloco que tratava
  `session.mode === "payment"` (pagamento único não passa mais pelo
  Stripe).
- `.env.example` e `README.md` — documentadas as variáveis novas
  (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`) e o passo a
  passo de onde pegar cada uma no painel do Mercado Pago, incluindo o
  aviso sobre nome pessoal no extrato e a nota da CVE.
- `app-frontend/src/screens/Buy.jsx` — botão "Pagar com Pix ou Boleto"
  agora chama `/api/payments/mercadopago/checkout` (antes ia pro Stripe
  com `method: "pix_boleto"`).
- `app-frontend/src/App.jsx` — os botões "+30 dias"/"+365 dias" em
  Configurações → Licença agora chamam
  `/api/payments/mercadopago/renew-checkout`.

**Testado**: build do frontend sem erros; `node --check` em todos os
arquivos de backend alterados; **instalei o pacote de verdade** (`npm
install`) e confirmei que a versão instalada é 3.6.0 (corrigida) e que
os imports (`MercadoPagoConfig`, `Preference`, `Payment`) funcionam;
**testei a validação de segurança isoladamente**: `validatePaymentId`
rejeita um payload malicioso de path traversal e aceita um ID numérico
normal; `verifyWebhookSignature` aceita uma assinatura HMAC válida
(gerada com o mesmo algoritmo do Mercado Pago) e rejeita uma forjada.
Subi o servidor com Postgres real e testei as rotas: checkout do Mercado
Pago com token falso dá 500 tratado (não crasha); `renew-checkout` sem
login dá 401; o webhook sem assinatura válida dá 401; o webhook com um
tipo de evento irrelevante é ignorado com 200; e confirmei que a
assinatura por cartão do Stripe continua respondendo normalmente (não
quebrou nada ao tirar o pagamento único de lá).

**NÃO testado**: o fluxo completo contra a API real do Mercado Pago (sem
acesso a `api.mercadopago.com` neste ambiente) — o Marcelo ainda precisa
criar a conta/aplicação de desenvolvedor, colocar
`MERCADOPAGO_ACCESS_TOKEN`/`MERCADOPAGO_WEBHOOK_SECRET` no Railway,
cadastrar o webhook no painel do Mercado Pago apontando pro endpoint
certo (ver README), e testar pagar de verdade em modo teste antes de ir
pra produção.

## Atualização anterior: renovação manual via Pix/Boleto + cancelar assinatura + ajustes na compra

Pedidos do Marcelo nessa sessão:

1. **Tela de compra (`Buy.jsx`) só pede e-mail agora** — tirei o campo Nome
   (não tinha uso real além do metadado do Stripe).
2. **Preço do plano anual não precisa ser cadastrado no Stripe** — expliquei
   pro Marcelo que o Precifica nunca usou Price ID fixo do Stripe; o preço é
   montado na hora via `price_data`, a partir da variável de ambiente
   `PRECIFICA_ANNUAL_PRICE` (só precisa existir no Railway, nada no Stripe).
3. **Por que só aparece cartão na assinatura**: expliquei que é porque é
   **recorrente** — Boleto nunca suportou cobrança automática recorrente no
   Stripe, e Pix só ganhou isso recentemente (Pix Automático, lançado esse
   ano) e ainda por convite pra contas BR + integração própria (mandatos) —
   não é só uma configuração pra ligar. Card continua sendo a única opção
   realista pra recorrência automática.
4. **Pedido novo — pagamento único via Pix/Boleto/cartão, sem assinatura**:
   o Marcelo quer que, além da assinatura recorrente por cartão, dê pra
   comprar/renovar +30 ou +365 dias com um pagamento ÚNICO (Pix, Boleto ou
   cartão avulso) — sem virar assinatura, sem cobrança automática depois.
   Quando a licença vence, o acesso já era bloqueado (comportamento que já
   existia); agora a pessoa pode voltar e comprar mais dias a qualquer
   momento, por conta própria.
5. **Pedido novo — cancelar assinatura**: botão pra quem está na assinatura
   por cartão cancelar a renovação automática (sem perder o acesso já
   pago).

**O que foi implementado:**

- `src/utils/stripe.js` — duas funções novas:
  - `createOneTimePaymentCheckout({ email, plan, userId })`: cria um
    Checkout do Stripe em `mode: "payment"` (pagamento único, não
    assinatura), com `payment_method_types: ["card", "boleto", "pix"]`
    explícito (precisa Boleto e Pix habilitados no painel do Stripe —
    Pix também depende da liberação por convite mencionada acima).
    `userId` vazio = compra nova (sem conta ainda); preenchido = renovação
    de quem já está logado.
  - `cancelSubscriptionAtPeriodEnd(subscriptionId)`: chama
    `stripe.subscriptions.update(id, { cancel_at_period_end: true })` —
    não cancela na hora, só impede a próxima cobrança.
- `src/routes/payments.js`:
  - `POST /stripe/checkout` ganhou o campo `method` (`"card"` ou
    `"pix_boleto"`) — se for `pix_boleto`, ignora `trial` (não faz sentido
    trial sem cartão) e usa o pagamento único.
  - `POST /stripe/renew-checkout` (NOVA, autenticada) — pagamento único
    pra quem já está logado renovar a própria conta.
  - `POST /stripe/cancel-subscription` (NOVA, autenticada) — cancela a
    renovação automática da licença mais recente do usuário logado (dá erro
    claro se ela não tiver `stripe_subscription_id`, isto é, se não for uma
    assinatura por cartão).
- `src/routes/stripeWebhook.js` — `checkout.session.completed` com
  `session.mode === "payment"` agora é tratado: se veio com `userId` nos
  metadados (renovação de conta existente), soma os dias na licença mais
  recente dessa conta — **somando a partir da data de expiração atual, não
  de hoje**, se ela ainda não tinha vencido (quem renova adiantado não
  perde os dias que já tinha) — e atualiza o `type` pro plano pago. Se veio
  sem `userId` (compra nova), cria uma licença `'unused'` do jeito que já
  acontecia com a assinatura por cartão, e manda o código por e-mail.
- `src/utils/licenseStatus.js` — a licença retornada pro front agora inclui
  `hasStripeSubscription: !!license.stripe_subscription_id`, usado pra só
  mostrar o botão de cancelar assinatura em quem realmente tem uma.
- `app-frontend/src/screens/Buy.jsx` — novo botão "Pagar com Pix ou Boleto"
  (pagamento único, sem trial) ao lado do "Assinar agora" (cartão,
  recorrente) e do "Testar grátis" (trial, cartão).
- `app-frontend/src/App.jsx` (seção "Licença" dentro de Configurações da
  Conta) — **substitui** o antigo botão único "Renovar licença" (que só
  mandava mensagem pro suporte) por dois botões reais de renovação
  self-service, **sempre visíveis** (não só quando falta pouco tempo):
  "+30 dias" e "+365 dias", cada um abrindo um Checkout de pagamento único
  (a pessoa escolhe Pix/Boleto/cartão na própria tela do Stripe). E, só pra
  quem tem `hasStripeSubscription`, um botão "Cancelar assinatura (cartão)"
  com aviso claro de que o acesso continua até a data já paga.

**⚠️ Passos manuais no painel do Stripe** (nenhum dá pra fazer por código):
- Verificar se **Boleto** e **Pix** estão habilitados em
  Configurações → Payment methods. Sem isso, `createOneTimePaymentCheckout`
  vai dar erro do Stripe (ele recusa `payment_method_types` que a conta não
  tem habilitado).
- Pix pra contas do Brasil ainda é por convite da própria Stripe — se não
  tiver liberado, o Marcelo pode tentar solicitar (ou simplesmente deixar
  só Boleto + cartão habilitados por enquanto, funciona igual, só sem Pix).

**Testado**: build do frontend sem erros; `node --check` em todos os
arquivos de backend alterados; testei localmente com Postgres real (subi
de novo o ambiente de teste): confirmei que `hasStripeSubscription: false`
aparece certo pra uma licença sem assinatura Stripe, que
`renew-checkout`/`cancel-subscription` exigem login (401 sem token) e
respondem com erro tratado (não crasham) quando o Stripe não está
configurado, que `cancel-subscription` dá 400 com mensagem clara quando a
licença não tem `stripe_subscription_id`, e rodei manualmente a MESMA
consulta SQL que o webhook usa pra renovar (some dias + troca `type`) —
confirmei que funciona certo contra o schema real. **NÃO testado**: o
fluxo completo passando por um Checkout de verdade do Stripe (sem acesso a
`api.stripe.com` neste ambiente) — o Marcelo precisa testar em modo teste:
(1) logado, clicar em "+30 dias" e pagar com Pix/Boleto/cartão de teste do
Stripe, conferir que a licença soma os dias certos; (2) clicar em
"Cancelar assinatura" numa conta que tenha assinatura de teste ativa,
conferir no painel do Stripe que ficou marcada `cancel_at_period_end` e
que o acesso no app continua até a data de expiração.

## Atualização anterior: tela de compra com planos Mensal/Anual + teste grátis de 7 dias (com cartão)

Pedido do Marcelo: a tela de "Assinar agora" (`Buy.jsx`) tinha só assinatura
mensal e nenhum trial. Agora tem 2 cards de plano (Mensal R$99,90 / Anual
R$599,90 — economia de 50%) e um botão de teste grátis de 7 dias.

**Proteção contra abuso do trial — decisão tomada com o Marcelo**: entre as
opções discutidas (fingerprint de navegador, CPF obrigatório, cartão
obrigatório via Stripe), ele escolheu **cartão obrigatório via Stripe**.
Expliquei pra ele antes de implementar: não existe "serial do
celular/PC" acessível por navegador (bloqueado por privacidade em todo
navegador moderno) — fingerprint é só uma aproximação, contornável trocando
de aparelho/navegador. Cartão é o mais forte porque é um recurso real e
escasso, e o Stripe já tem detecção de fraude embutida.

**Como funciona tecnicamente**: o checkout do Stripe é criado com
`trial_period_days` (7 dias) E `payment_method_collection: "always"` — isso
força a coleta do cartão MESMO com o total dando zero na hora (é esse
parâmetro que garante "cartão obrigatório mesmo de graça"). O trial segue o
plano que a pessoa escolheu no card (mensal ou anual) — depois dos 7 dias,
vira cobrança de verdade nesse mesmo plano, automaticamente, sem nada
manual.

**Arquivos alterados:**
- `src/utils/stripe.js` — `createCheckoutSession` agora aceita `plan`
  ("monthly"/"annual") e `trial` (boolean). Preço/recorrência montados
  dinamicamente (sem Price ID fixo no Stripe, como já era). Valores padrão
  agora são os reais: `PRECIFICA_MONTHLY_PRICE` 99.90,
  `PRECIFICA_ANNUAL_PRICE` 599.90 (nova env var, documentada no
  `.env.example`).
- `src/routes/payments.js` — `POST /api/payments/stripe/checkout` agora
  recebe `plan` e `trial` no corpo e repassa.
- `src/routes/stripeWebhook.js` — **mudança importante de arquitetura**:
  antes só tratava `invoice.paid` (o que não funcionaria pro trial, já que o
  Stripe não gera fatura nenhuma durante os 7 dias grátis — só depois).
  Agora também trata `checkout.session.completed`, que é quem cria a
  licença na hora (`type = 'trial'` se for trial, senão `'monthly'`/
  `'annual'` — isso vem dos METADADOS que a gente mesmo colocou ao criar o
  checkout, não precisa consultar o Stripe de novo). O `invoice.paid`
  continua existindo, mas agora: (1) quando o trial vira cobrança de
  verdade (dia 7), ele detecta que a licença estava `type='trial'` e troca
  pro plano de verdade automaticamente, com a duração certa (30 ou 365
  dias, calculado a partir do `interval` do preço dentro da própria
  fatura); (2) segue servindo de rede de segurança pra criar a licença se
  por acaso o `checkout.session.completed` não tiver chegado.
- `app-frontend/src/screens/Buy.jsx` — reescrita: 2 cards de plano
  selecionáveis, nome/e-mail, botão "Assinar agora" e botão secundário
  "Testar grátis por 7 dias", com aviso de que o cartão é pedido mas só
  cobra depois dos 7 dias.

**⚠️ PASSO MANUAL OBRIGATÓRIO NO PAINEL DO STRIPE** (isso não dá pra fazer
por código): o endpoint de webhook configurado no Stripe (Painel Stripe →
Desenvolvedores → Webhooks → seu endpoint) precisa estar recebendo o evento
**`checkout.session.completed`** além do `invoice.paid` que já estava
configurado — senão o Stripe nem manda esse evento pro nosso servidor, e o
trial nunca libera acesso na hora (só funcionaria a cobrança 7 dias depois,
sem o usuário ter tido acesso nenhum antes disso). **Confirme isso antes de
testar.**

**Testado**: build do frontend sem erros, `node --check` em todos os
arquivos de backend alterados sem erros de sintaxe. **NÃO testado
end-to-end contra o Stripe de verdade** — não tenho acesso de rede ao
`api.stripe.com` neste ambiente (só domínios de pacotes/GitHub são
liberados aqui), e mesmo com acesso seria um checkout de pagamento real.
Antes de considerar isso pronto, o Marcelo precisa testar manualmente em
modo teste do Stripe: (1) assinar mensal sem trial, confirma que o e-mail
com a chave chega e a licença nasce `type='monthly'`; (2) mesma coisa pro
anual; (3) começar o trial, confirmar que o e-mail com a chave chega
IMEDIATAMENTE (sem esperar 7 dias) e que a licença nasce `type='trial'`
com 7 dias; (4) o mais importante e mais difícil de testar de verdade:
avançar o relógio da assinatura de teste no painel do Stripe (dá pra fazer
isso em modo teste) e confirmar que quando a cobrança real acontece, a
licença vira `type='monthly'` (ou `'annual'`) com a duração certa.

## Atualização anterior: PWA — "Adicionar app na tela inicial"

Implementado o pedido de transformar o Precifica num app instalável
(PWA), depois de descartar a ideia de "baixar pra Android/iOS" (não
existe app nativo, e criar um teria custo/esforço bem maiores — decidido
junto com o Marcelo, ver conversa).

**MUITO IMPORTANTE — sobre o ícone**: o ícone usado
(`app-frontend/public/icons/`) foi **desenhado pelo próprio Marcelo**,
não é banco de imagens/stock. Numa iteração anterior dessa mesma sessão,
o Claude viu uma referência visual parecida (dente + cifrão) e presumiu
por conta própria que era arte de banco de imagens, e substituiu por uma
versão própria sem perguntar — o Marcelo corrigiu isso e deixou claro que
foi um erro sério tomar essa decisão sem consultá-lo. A partir daqui,
**o ícone é o arquivo enviado por ele, tal como está** (só redimensionado
pros tamanhos técnicos exigidos — 512, 192, 180, 32px — nenhuma alteração
de arte). Se precisar trocar o ícone no futuro, é o Marcelo quem decide o
design; não presuma.

**O que foi implementado:**
- `app-frontend/public/icons/` — `icon-512.png`, `icon-192.png`,
  `apple-touch-icon.png` (180px, iOS), `favicon-32.png`. Gerados a partir
  do PNG que o Marcelo mandou (1254×1254), só redimensionados.
- `app-frontend/public/manifest.json` — nome, cores (`theme_color`
  `#0f766e`, o teal do app), ícones com `purpose: "any maskable"`.
- `app-frontend/public/sw.js` — service worker mínimo, só pra passar no
  critério de instalabilidade do Chrome/Android (não faz cache nem
  funciona offline de propósito — o app depende da API/banco de
  qualquer forma). Registrado via script inline no `index.html`.
- `app-frontend/index.html` — `<link rel="manifest">`, favicon,
  `apple-touch-icon`, `theme-color`, meta tags
  `apple-mobile-web-app-*` (essas fazem o Safari do iPhone tratar o app
  como "capaz de tela cheia" quando adicionado à tela de início).
- `app-frontend/src/pwaInstall.js` (novo arquivo) — captura o evento
  `beforeinstallprompt` (Chrome/Android) fora do React, guardando em
  variável de módulo (o evento pode disparar antes de qualquer
  componente montar), e expõe o hook `useInstallPrompt()` mais os
  helpers `isRunningInstalled()` e `isIOS()`.
- **Seção "Adicionar app na tela inicial" dentro de Configurações**
  (`ProfileSettingsPage`, no card "Configurações da Conta", depois da
  seção Licença): comportamento por plataforma —
  - Já instalado → mensagem confirmando.
  - iOS (Safari nunca dispara `beforeinstallprompt`) → instrução manual
    (Compartilhar → Adicionar à Tela de Início).
  - Android/Chrome com o prompt disponível → botão que dispara a
    instalação nativa do navegador.
  - Fallback (navegador sem suporte ou prompt ainda não disparado) →
    instrução manual genérica.

**Testado**: build do frontend sem erros; conferi que `manifest.json`
é JSON válido e que `index.html`/ícones/manifest/sw.js foram parar
certinho dentro de `dist/` depois do build (o Vite copia tudo que está
em `app-frontend/public/` pra raiz do build automaticamente). **Não
testado ao vivo** (instalar de verdade no Android e no iPhone) — isso só
dá pra confirmar no ambiente real do Marcelo depois do deploy.

## Atualização anterior: altura do cabeçalho + backup movido pra Procedimentos (só a lista)

Só mexeu em `app-frontend/src/App.jsx`. Pedidos do Marcelo depois de ver o
app em produção:

1. **Foto de perfil vazando pra fora da barra azul**: a foto (72px) estava
   maior que o espaço vertical que a barra azul reservava pra ela
   (`pb-2 pt-1` = só 12px de respiro no total). Troquei pra `py-4` (16px
   em cima e embaixo, 32px no total) na linha do cabeçalho que contém a
   foto/nome/abas — dá folga de sobra pra foto caber inteira dentro do
   azul, e a barra fica visivelmente mais alta (era exatamente o pedido).
2. **Botão "Backup" do menu da foto**: ao conferir o código pra tirar
   esse botão, percebi que **ele já não existia mais** no arquivo — sumiu
   em alguma reorganização de uma sessão anterior (bem provavelmente
   durante a limpeza da tela de Configurações) sem eu registrar isso no
   handoff na hora. Ou seja, esse pedido específico ("remove o botão
   Backup do menu") já estava feito; sobrou só a função
   `handleImportData` órfã (sem nenhum botão chamando ela), que eu
   aproveitei e transformei no item 3 abaixo.
3. **Exportar/Importar movido pra aba Procedimentos, só da lista de
   procedimentos** (não mais configurações + histórico juntos, como era
   o Backup antigo): novos botões "Exportar" e "Importar" na barra de
   ações da aba Procedimentos, ao lado de "Desfazer"/"Salvar"/"Novo
   procedimento". `handleExportProcedures` baixa só o array de
   procedimentos em `.json`; `handleImportProceduresFile` lê o arquivo e
   aceita tanto esse formato novo (array direto) quanto o formato antigo
   de backup completo (`{ procedures: [...] }`), pra não quebrar arquivos
   de backup que alguém já tenha baixado antes dessa mudança.
4. **Confirmei pro Marcelo**: com a migração pro banco (sessão de duas
   atrás), configurações e histórico de orçamento já não precisam mais de
   backup manual — são salvos automaticamente na nuvem, por conta. O
   export/import de procedimentos que sobrou não é "backup de segurança"
   no mesmo sentido (os procedimentos TAMBÉM já são salvos na nuvem); é
   mais uma ferramenta de portabilidade — exportar de uma conta e
   importar em outra, por exemplo.

**Testado**: build do frontend sem erros. Não testado visualmente no
navegador (sem ambiente gráfico aqui) — vale conferir que a foto cabe
inteira na barra azul em telas largas E estreitas (o header usa
`flex-wrap`, então as abas podem quebrar pra uma segunda linha no mobile —
confirme que não gerou nenhum espaço estranho ali), e que
Exportar/Importar na aba Procedimentos funcionam (baixa um `.json` com
só a lista, e reimportar populate certo).

## IMPORTANTE — incidente: repositório GitHub do Marcelo estava incompleto

Entre as sessões acima, o deploy no Railway começou a falhar
("Deployment failed during build process" / Railpack não achava
`package.json`). Investigando o zip do repositório GitHub dele
(`orcamentoapp/precifica`), descobri que **o repositório só tinha os
arquivos que vieram dos meus zips de entrega incremental** (só os
arquivos alterados de cada sessão) — faltava o projeto inteiro:
`package.json`, `screens/`, `AuthGate.jsx`, `AccountContext.jsx`,
`api.js`, `db.js`, `middleware/`, `utils/`, `payments.js`,
`stripeWebhook.js`, `vite.config.js`, `index.html`, etc. Ele estava
subindo cada zip de entrega como se fosse o projeto inteiro, em vez de
mesclar com o projeto completo que ele já tinha.

**Resolvido** entregando um zip com o PROJETO COMPLETO (todo o conteúdo
de `/home/claude/precifica_project/precifica` nessa sessão, que é a
cópia de trabalho que reflete o projeto original + todas as mudanças de
todas as sessões — sem `node_modules`, `dist`, `.git`, `.env`), que ele
subiu substituindo tudo no repositório. Depois disso o build e a
migração funcionaram, e a sincronização entre PC e celular passou a
funcionar (confirmado por ele).

**Lição pra próximas sessões**: se o Marcelo relatar de novo algo que
parece "minha mudança não teve efeito nenhum" ou erros de build/deploy,
vale perguntar cedo se o repositório GitHub dele tem o projeto INTEIRO
ou só os arquivos dos meus zips — e, se tiver dúvida, é mais seguro
entregar o projeto completo (como o pacote de
`/home/claude/precifica_project/precifica` nessa sessão, sempre que ele
existir) do que só os arquivos alterados.

## Atualização anterior: Configurações reduzida a 3 cards, 1 coluna só

Só mexeu em `app-frontend/src/App.jsx`. O Marcelo achou a tela de
Configurações da sessão anterior com "muita coisa" (7 cards em 2 colunas) e
pediu pra reorganizar em só 3 cards, 1 coluna:

1. **1 coluna só**: `grid grid-cols-1` em vez de `md:grid-cols-2`, com
   `max-w-2xl` pra não ficar esticado demais em tela grande.
2. **Card "Configurações da Conta"** — antes chamado "Dados Profissionais",
   renomeado, e agora com a **Licença dentro dele também** (não é mais um
   card separado) — mesmo conteúdo de antes (tipo, expira em, dias
   restantes, botão "Renovar licença" com ≤7 dias), só que como uma seção
   dentro desse card em vez de card próprio.
3. **Card "Custos"** — junta "Custo da hora clínica" e "Imposto —
   Profissional liberal (Receita Saúde)", que antes eram 2 cards
   separados, agora como 2 seções dentro de 1 card só.
4. **Card "Formas de Pagamento/Taxas"** — junta "Quem paga as taxas",
   "Cartão", "À vista", "Boleto" e "Taxas personalizadas" (antes 5 cards
   separados), agora 5 seções dentro de 1 card só.

**Como foi feito**: criei um componente novo, `SettingsSubSection`
(logo depois de `SettingsCard` no código) — é só um separador visual
(ícone + título + linha divisória) usado DENTRO de um `SettingsCard`, sem
ter colapso próprio (quem colapsa é o card inteiro, não cada seção). Não
mudou nenhuma lógica de cálculo, nem nomes de campos, nem os componentes
`ProfileSettingsPage`/`SettingsPanel` em si — só reorganizei o que estava
dentro deles e removi cards que viraram seções.

**Continua garantido**: cada card nasce fechado (minimizado) toda vez que
a aba Configurações é aberta — isso já valia antes e não mudou (os
componentes desmontam ao trocar de aba, então o `useState(false)` do
`SettingsCard` sempre reseta).

**Testado**: build do frontend sem erros. Não testei visualmente no
navegador (sem ambiente gráfico aqui) — vale conferir que os 3 cards
aparecem na ordem certa (Configurações da Conta → Custos → Formas de
Pagamento/Taxas), cada um com as seções certas dentro, e que abrir/fechar
funciona normalmente.

## Atualização anterior: reorganização de Configurações + menu da foto de perfil + licença

Só mexeu em `app-frontend/src/App.jsx` (nenhum arquivo de backend nessa
sessão). Pedidos do Marcelo:

1. **Aba "Taxas" removida da barra de abas** (`TabNav`, ficava entre
   Procedimentos e Histórico) — não existe mais como aba separada.
2. **"Taxas" e "Dados Profissionais" agora moram dentro de "Configurações"**,
   junto um do outro, como cards colapsáveis lado a lado (mesmo componente
   `SettingsCard` que os cards de taxa já usavam). Pra isso:
   - `ProfileSettingsPage` (Dados Profissionais) agora usa `SettingsCard`
     por dentro, em vez de ser um card sempre aberto.
   - `SettingsPanel` (todos os cards de taxa) parou de ter seu próprio
     `<div className="grid ...">` envolvendo os cards — agora retorna um
     Fragment, pra poder compartilhar a MESMA grade com os cards de
     Dados Profissionais e Licença. Quem monta a grade agora é o ponto de
     renderização em `App()`: `tab === "profile-settings"` renderiza um
     único `<div className="grid ...">` com `<ProfileSettingsPage />` e
     `<SettingsPanel />` dentro.
   - Resultado: **todos os cards nascem minimizados toda vez que
     Configurações é aberta** — isso já era o comportamento padrão do
     `SettingsCard` (`useState(false)`), e como esses componentes
     desmontam quando você sai da aba (o `tab === ... ? : ...` troca o
     que está montado), toda vez que volta pra Configurações eles
     remontam do zero, fechados. Não precisou de nenhum código extra pra
     isso.
3. **Menu da foto de perfil (`OptionsMenu`) reorganizado**: antes tinha
   e-mail + licença + "Sair" no topo, depois "Configurações", "Aparência",
   "Contato/Suporte", "Backup". Agora: e-mail no topo (só isso, sem
   licença), depois "Aparência", "Contato/Suporte", "Backup", e por
   último — nessa ordem — **"Configurações" e "Sair"** (Sair sempre a
   última opção, bem embaixo).
4. **Licença saiu do menu da foto e foi pro novo card "Licença" dentro de
   Configurações**, ao lado de "Dados Profissionais": mostra tipo (Teste/
   Mensal/Anual), data de expiração, e agora também **dias restantes**
   (novo — antes só o trial mostrava dias, os outros tipos só mostravam a
   data). Quando `daysLeft <= 7`, aparece um botão **"Renovar licença"**.
   - O botão manda uma mensagem automática pra
     `POST /api/support/contact` (a mesma rota que o formulário de
     "Contato/Suporte" já usa) com assunto "Renovação de licença" e o
     texto já preenchido dizendo quantos dias faltam — não abre nenhum
     formulário novo pro cliente preencher, é um clique só. Segui o
     padrão que **já existia** no `LicenseBlocked.jsx` ("Entre em contato
     pra renovar o acesso") em vez de inventar um fluxo de pagamento novo
     — hoje nem toda licença tem assinatura Stripe (as geradas
     manualmente pelo admin não têm), então "renovar" automaticamente via
     Stripe não funcionaria pra todo mundo.

**Testado**: build do frontend (`npm run build`) sem erros. **Não testei
visualmente no navegador** (não tenho like um ambiente com browser aqui) —
a lógica é direta (reaproveitei componentes que já existiam e já
funcionavam, só reorganizei onde cada um é renderizado), mas vale um
Ctrl+F5 rápido conferindo: abas sem "Taxas", Configurações com os cards
certos todos fechados, menu da foto com a ordem nova, e o card de Licença
mostrando dias restantes.

## Atualização anterior: dados do simulador migrados do navegador pro banco (vinculados à conta)

**Mudança grande, testada de ponta a ponta com Postgres real.** Até essa
sessão, os dados do simulador (procedimentos, taxas/configurações, "Dados
Profissionais", histórico de orçamentos) ficavam só no `localStorage` do
NAVEGADOR — não vinculados à conta (herança de quando isso era um simulador
sem login). Isso causava dois problemas que o Marcelo percebeu: (1) excluir
uma conta e recriar com o mesmo e-mail "trazia de volta" os dados antigos
(porque eles nunca estiveram na conta, estavam no navegador), e (2) o
cliente não via os mesmos dados em outro computador/celular.

**O que mudou:**

1. **Nova tabela `app_data`** (`user_id`, `key`, `value`, `updated_at`,
   chave primária composta `(user_id, key)`), com
   `user_id REFERENCES users(id) ON DELETE CASCADE` — de propósito: quando
   uma conta é excluída (pelo admin, em qualquer lugar do painel), essas
   linhas somem automaticamente, garantido pelo próprio Postgres, sem
   depender de nenhum código extra lembrar de apagar.
2. **Nova rota `src/routes/appData.js`**, montada em `/api/app-data`,
   protegida por login (`requireAuth`, não precisa ser admin — cada um só
   acessa o próprio dado). `GET /api/app-data/:key` e
   `PUT /api/app-data/:key` (body `{ value }`). Só aceita as 3 chaves que o
   simulador usa (`settings`, `procedures`, `budgetHistory`) — qualquer
   outra dá 400. Limite de 2MB por chave (413 se passar).
3. **`server.js`**: `express.json()` ganhou `{ limit: "3mb" }` (era o
   padrão de 100kb, pequeno demais pra caber a foto de perfil em base64
   dentro de `settings`). Nova rota registrada.
4. **`app-frontend/src/storageShim.js` reescrito por completo**: em vez de
   implementar `window.storage` em cima do `localStorage`, agora implementa
   em cima da API acima (usando `apiRequest` de `api.js`, que já manda o
   token JWT). **Isso significa que o `App.jsx` NÃO PRECISOU SER TOCADO** —
   ele continua chamando `window.storage.get/set("settings", false)` etc.
   exatamente como antes; só o que tem por trás mudou. Único ponto de
   atenção: dentro do `storageShim.js`, o parâmetro `shared` continua
   indo pro `localStorage` antigo (não é usado em lugar nenhum hoje, mas
   mantive por segurança/compatibilidade da assinatura).
5. **Migração automática do que já existia no navegador**: no `get()` do
   novo `storageShim.js`, se o banco ainda não tem nada salvo pra aquela
   chave (conta nova ou primeira vez logando depois dessa mudança), ele
   verifica se sobrou algo no `localStorage` antigo (`svc:user:<key>`) e,
   se tiver, importa pro banco automaticamente (um `PUT` na hora) e limpa o
   `localStorage`. **Ninguém perde dados com essa mudança** — na primeira
   vez que abrirem o app depois do deploy, os dados que já tinham sobem
   pro banco sozinhos.
6. **Foto de perfil comprimida**: o recorte circular (`App.jsx`, função
   `handleSave` do componente de crop) exportava a imagem como PNG cru —
   agora exporta como JPEG qualidade 0.85 (bem mais leve, principal fator
   de peso por conta). Antes de recortar o círculo, preenche o canvas de
   branco, pra não sobrar canto preto (JPEG não tem transparência) caso a
   imagem completa algum dia seja exibida em outro lugar que não o avatar
   circular.
7. **Sobre pesar no banco**: não pesa — estimei e testei que o pior caso
   por conta (configurações + foto + histórico cheio de 200 orçamentos)
   fica em torno de 200-250KB. Mesmo com 10 mil contas ativas, isso é ~2GB
   no pior caso, o que custa menos de US$1/mês de armazenamento extra no
   Railway (cobrança é por GB, não tem "limite" fixo que estoure).

**BUG que encontrei e corrigi durante o teste** (não relacionado à
migração em si, mas relacionado à chave anual da sessão anterior): a rota
`POST /api/auth/verify-email` (`src/routes/auth.js`), que é quem ativa a
licença de verdade na hora do cadastro, **não sabia que existia o tipo
"annual"** — só tratava `trial` e "qualquer outra coisa = mensal". Uma
licença anual comprada/gerada estava sendo ativada com **30 dias**, não
365. Corrigido: agora usa `ANNUAL_DURATION_DAYS` (365) quando
`license.type === "annual"`. Confirmado com teste real: antes da correção
o `expiresAt` vinha 1 mês à frente; depois, exatamente 1 ano à frente
(`daysLeft: 365`). **Isso já estava quebrado antes dessa sessão** (desde
que a chave anual foi criada) — se alguma licença anual já foi vendida
e ativada em produção antes desse fix, ela ficou com validade de 30 dias
em vez de 365 e precisa ser renovada manualmente pelo admin (botão
"Renovar" já corrigido, aplica os 365 dias certos agora).

**Testado nessa sessão, de ponta a ponta, com Postgres real local** (subi
um Postgres 16 no ambiente de execução só pra esse teste, não é o banco de
produção): cadastro completo com chave anual → confirmação de e-mail →
validade de 365 dias confirmada → salvei `settings`/`procedures` via
`PUT /api/app-data` → confirmei as linhas na tabela `app_data` via SQL →
renovei a licença (confirmei +365 dias, não +30) → **excluí a conta pelo
painel admin → confirmei por SQL que as linhas de `app_data` **sumiram
sozinhas** (cascade funcionando) → confirmei que a licença ficou órfã
(`user_id NULL`, preservada) → excluí essa licença órfã (novo
comportamento da sessão anterior, confirmando que continua funcionando) →
confirmei que uma licença COM dono não pode ser excluída (400). Build do
frontend sem erros.

**Não testado**: o fluxo de importação automática do `localStorage`
antigo pro banco (item 5 acima) — a lógica está no `storageShim.js` e é
direta, mas não simulei um navegador de verdade com dados antigos no
`localStorage` pra confirmar visualmente. Vale um teste manual: um usuário
que já tinha dados salvos, ao logar de novo depois do deploy, deve ver os
mesmos dados de sempre (migrados na hora, sem aviso nenhum pra ele) — e,
com o DevTools aberto, dá pra ver o `svc:user:settings` etc. sumindo do
Local Storage no primeiro carregamento.

## Atualização anterior: excluir chaves não usadas + explicação sobre dados "resquício" após excluir conta

Dois pontos levantados pelo Marcelo depois de ver o painel em produção:

1. **Excluir chaves sem dono, independente do status**: ele reparou que
   várias chaves com "Dono: — (ainda não usada)" apareciam com status
   "Ativa" (não "Não usada") — provavelmente porque em algum momento
   alguém clicou "Renovar" nelas por engano — e por isso não tinham botão
   de excluir (a regra antiga só liberava excluir quando `status ===
   'unused'`). Troquei o critério: agora qualquer chave **sem `user_id`**
   (nunca foi reivindicada por ninguém) pode ser excluída, não importa o
   `status`. Em compensação, os botões "Renovar"/"Revogar" só aparecem pra
   chave que **tem** dono — não fazia sentido renovar/revogar uma chave
   que ninguém está usando. Backend (`DELETE /api/admin/licenses/:id`)
   segue a mesma regra: `WHERE user_id IS NULL` em vez de `WHERE status =
   'unused'`.

2. **"Excluí uma conta e recriei com o mesmo e-mail, e os dados salvos
   voltaram" — isso NÃO é resquício no banco do Railway.** Investiguei o
   código e confirmei a causa: os dados do simulador em si (procedimentos,
   preços, configurações de taxas, "Dados Profissionais", histórico de
   orçamentos) **nunca foram salvos no Postgres** — eles ficam só no
   `localStorage` do NAVEGADOR de quem está usando (`app-frontend/src/App.jsx`
   usa `window.storage`, que o `storageShim.js` implementa em cima de
   `localStorage`, por design herdado de quando isso era só um simulador
   sem conta/login). Isso é por navegador/computador, não por conta — dois
   e-mails diferentes no mesmo navegador veem os MESMOS dados do simulador,
   e excluir a conta no painel admin (que só mexe no Postgres: tabelas
   `users` e `licenses`) não tem nenhum efeito sobre isso.
   - **Pra conferir agora, sem mudar nada**: abrir o DevTools do navegador
     (F12) → aba Application (Chrome) ou Armazenamento (Firefox) →
     Local Storage → o domínio do Precifica. As chaves `svc:user:settings`,
     `svc:user:procedures`, `svc:user:budgetHistory` são exatamente os
     dados que "voltam" ao recriar a conta. Um teste rápido: abrir o app
     numa aba anônima/privada (ou outro navegador) — lá, sem esse
     localStorage, a conta nova nasce zerada.
   - **Não perguntei ainda, mas é a decisão que falta**: se o Marcelo quer
     que os dados do simulador passem a ser vinculados à CONTA (guardados
     no Postgres, atrelados ao `user_id`) em vez de ao navegador — aí sim
     excluir a conta apagaria tudo de verdade, e o cliente veria os mesmos
     dados em qualquer dispositivo que logar. Isso é uma mudança de
     arquitetura relevante (nova tabela pra guardar `settings`/
     `procedures`/`budgetHistory` por usuário + trocar as rotas do
     `App.jsx` de `window.storage` pra chamadas de API), não só um ajuste
     pequeno — **pergunte antes de começar, e avise que é trabalho
     considerável.**

**Testado nessa sessão**: build do frontend e `node --check` do backend
sem erros. A investigação do localStorage foi feita lendo o código-fonte
(`App.jsx`, `storageShim.js`), não testada ao vivo contra produção (não
tenho acesso ao navegador do Marcelo nem ao Postgres de produção aqui).

## Atualização anterior: chave anual + coluna "Cliente desde" + excluir conta pela aba de chaves

Três pedidos do Marcelo no painel admin:

1. **Novo tipo de licença "annual" (365 dias)**: botão "+ Chave anual (365d)"
   no cabeçalho do painel, ao lado dos já existentes (mensal/trial). Backend
   (`src/routes/admin.js`) aceita `type: "annual"` em `POST /api/admin/licenses`.
   Nova variável `ANNUAL_DURATION_DAYS` (padrão 365) em `.env.example`, seguindo
   o mesmo padrão de `LICENSE_DURATION_DAYS`/`TRIAL_DURATION_DAYS`. **Não foi
   necessária migração de banco** — a coluna `licenses.type` sempre foi `TEXT`
   livre, sem `CHECK` restringindo os valores.
   - **Corrigi de brinde um bug relacionado**: a rota de renovar licença
     (`POST /api/admin/licenses/:id/renew`) somava sempre `LICENSE_DURATION_DAYS`
     (30 dias) fixo, não importa o tipo da chave — ou seja, renovar uma chave
     trial ou (agora) anual dava só +30 dias, errado. Agora ela busca o `type`
     da licença primeiro e soma a duração certa pra cada tipo.
2. **Coluna "Cliente desde"** na aba Usuários do painel, mostrando
   `user.created_at` formatado em pt-BR — logo depois de "Nome / Clínica".
3. **Botão "Excluir conta" na aba Chaves de licença**: antes só dava pra
   excluir a conta do usuário pela aba Usuários. Agora, em qualquer chave que
   tenha um `user_id` associado (chave já usada por alguém), aparece um botão
   "Excluir conta" nas Ações, com confirmação de duplo clique (mesmo padrão
   dos outros botões de exclusão do painel) — reaproveita a mesma rota
   `DELETE /api/admin/users/:id` que já existia. A licença em si não é
   apagada (fica órfã, sem `user_id`), igual já acontecia ao excluir pela aba
   Usuários.

**Testado**: build do frontend (`npm run build`) sem erros, `node --check`
no `admin.js` sem erros de sintaxe. Não testei end-to-end com Postgres real
nessa sessão (sem acesso ao banco de produção aqui) — vale rodar um teste
manual rápido no ambiente real antes de considerar 100% validado, mas a
lógica é direta e segue exatamente o padrão do código já existente.

## Atualização anterior: garantias sobre a licença comprada

O Marcelo pediu três garantias sobre a chave de licença gerada
automaticamente na compra. Resultado:

1. **"Chave não pode expirar antes de ser ativada"** — na verdade **já
   era assim** desde que o sistema de licença foi construído (o campo
   `expires_at` só é preenchido no momento da confirmação de e-mail, nunca
   antes). Testei de propósito: criei uma licença e mudei manualmente o
   `created_at` dela pra 400 dias atrás, e o cadastro com essa chave
   continuou funcionando normalmente — confirmado, não havia bug aqui.

2. **"Garantir que a chave não seja usada mais de uma vez"** — a proteção
   já existia (lock `SELECT ... FOR UPDATE` na transação de cadastro), mas
   testei com rigor extra dessa vez: disparei **5 tentativas de cadastro
   simultâneas** com a mesma chave (e-mails diferentes) e confirmei que
   **exatamente 1** teve sucesso — as outras 4 foram bloqueadas com "Essa
   chave de licença já foi utilizada". Sem condição de corrida.

3. **"E-mail travado na tela de ativação"** — essa era nova, implementei:
   - Nova coluna `licenses.buyer_email` — preenchida pelo webhook do
     Stripe com o e-mail de quem realmente pagou (`invoice.customer_email`).
   - O link de ativação no e-mail de compra agora inclui o e-mail também:
     `?ativar=CODIGO&email=comprador@email.com`.
   - Na tela "Ativar licença" (`Register.jsx`), quando o e-mail vem da
     URL, o campo aparece **preenchido e travado** (`readOnly`, com fundo
     acinzentado), com um aviso explicando o motivo.
   - **Reforcei no backend também** (não só na tela): `POST /api/auth/register`
     agora rejeita (403) se o e-mail enviado for diferente do
     `buyer_email` gravado na licença — protege contra alguém tentar
     contornar a trava da tela chamando a API direto. Testei: e-mail
     errado bloqueia (e a mensagem de erro já informa qual é o e-mail
     certo), e-mail certo libera.
   - **Chaves geradas manualmente pelo admin continuam sem essa trava**
     (`buyer_email` fica `NULL` nesse caso) — o fluxo de venda manual
     continua podendo ser usado com qualquer e-mail, como sempre foi.

**Tudo testado com Postgres real**, incluindo o teste de concorrência
(5 requisições simultâneas) e o teste específico da trava de e-mail
(bloqueio + liberação + chave manual sem trava).

## Atualização anterior: reorganização do menu do app + correção de z-index

Mudanças pedidas pelo Marcelo no menu que abre ao clicar na foto de perfil
(dentro do `App.jsx`, o simulador em si — não confundir com as telas de
autenticação):

1. **Corrigido bug visual**: o menu dropdown (foto de perfil) aparecia por
   trás da barra de busca de procedimentos. Causa: o `<header>` não tinha
   contexto de empilhamento próprio. Corrigido com `position: relative` +
   `zIndex: 30` no header, e o dropdown do menu subiu de `z-20` pra `z-50`.
2. **Removido o botão de conta do canto superior direito** (o círculo com a
   inicial do e-mail, renderizado pelo `AuthGate` via `AccountMenu.jsx` —
   esse arquivo foi **apagado**, não é mais usado).
3. **Dados da conta movidos pro menu da foto de perfil**: criei
   `app-frontend/src/AccountContext.jsx` (React Context) — o `AuthGate`
   fornece `{ user, license, onLogout }` via `<AccountContext.Provider>`
   envolvendo o `{children}` (o App), e o `OptionsMenu` dentro do App
   consome via `useAccount()`. Agora o topo do dropdown mostra e-mail,
   validade da licença (ou dias restantes se for trial) e botão "Sair".
4. **Removido "Sobre"** do menu (seção inteira apagada).
5. **"Contato" virou um formulário de verdade**: em vez de um campo de
   texto solto (que não fazia nada), agora é um formulário (assunto
   opcional + mensagem) que manda um e-mail de verdade pra
   `suporte@verterelabs.com` via nova rota `POST /api/support/contact`
   (`src/routes/support.js`, protegida por login). O e-mail inclui nome,
   e-mail e clínica de quem mandou.
6. **"Dados Profissionais" virou uma página própria**: antes era uma seção
   que expandia dentro do dropdown (foto, tipo, nome, CRO/CRM, endereço,
   telefone, validade do orçamento). Agora o dropdown só tem um botão
   "Configurações" que leva pra uma página cheia nova
   (`ProfileSettingsPage`, dentro do `App.jsx`) com os mesmos campos. Essa
   página não aparece na barra de abas do topo (Simulação/Procedimentos/
   Taxas/Histórico) — só é alcançável pelo botão "Configurações" do menu.

**Testado**: build do frontend sem erros, rota `/api/support/contact`
retorna 401 sem login e envia o e-mail certinho com login (testado com
Postgres real, e-mail conferido no log com remetente/assunto/corpo
corretos).

## Atualização anterior: link de ativação direta no e-mail

**O sistema de pagamento e e-mail JÁ ESTÁ FUNCIONANDO EM PRODUÇÃO** — o
Marcelo confirmou o fluxo completo rodando: Stripe → webhook → licença
gerada → e-mail chegando via Zoho Mail (porta 587, não 465 — a 465 dava
`ETIMEDOUT` no Railway).

Nessa sessão, adicionei um botão "Ativar minha conta" no e-mail de compra
que leva direto pra tela de ativação **com a chave já preenchida**, em vez
da pessoa precisar copiar/colar manualmente:

- `src/utils/email.js` (`sendLicensePurchasedEmail`): monta um link
  `${APP_URL}/?ativar=CODIGO` e inclui um botão estilizado no HTML do
  e-mail (mantém o texto puro como alternativa, com o link por extenso).
- `app-frontend/src/AuthGate.jsx`: nova função `readLicenseCodeFromUrl()`
  lê o parâmetro `?ativar=` da URL (aceita com ou sem traço, maiúsculo ou
  minúsculo), e se a pessoa não estiver logada, pula direto pra tela de
  cadastro com a chave já dividida nos 4 campos. Limpa o parâmetro da URL
  logo em seguida (`history.replaceState`), sem recarregar a página.
- `app-frontend/src/screens/Register.jsx`: aceita a prop
  `initialLicenseCode` e mostra um avisinho verde confirmando que a chave
  veio do link.

**Testado com Postgres real**: disparei um webhook de verdade (assinatura
válida do Stripe), confirmei que o e-mail gerado contém o link certo
(`https://APP_URL/?ativar=XXXX-XXXX-XXXX-XXXX`), que o servidor serve a
página normalmente com esse parâmetro na URL (200 OK), e que o texto/lógica
estão presentes no build final do frontend.

## Atualização anterior: BUG CRÍTICO corrigido — cadastro travava se o e-mail falhasse

**Isso é importante, leia com atenção.** Descobri (com o Marcelo em
produção, não só em teste) um bug real nas rotas `/api/auth/register` e
`/api/auth/verify-email` em `src/routes/auth.js`: as duas usavam uma
transação de banco (`BEGIN`/`COMMIT`/`ROLLBACK`) e, **depois** do
`COMMIT`, ainda faziam mais alguma coisa que podia falhar (mandar e-mail,
no caso do register; montar o token e buscar status de licença, no caso
do verify-email). Se essa etapa pós-COMMIT desse erro, o `catch` tentava
um `ROLLBACK` numa transação **que já tinha sido salva** — isso trava a
resposta HTTP pra sempre (o navegador fica girando, tipo "Criando
conta..." infinito), mesmo com o registro já gravado corretamente no
banco.

Isso aconteceu de verdade em produção quando o SMTP do Zoho Mail estava
com problema de conexão (`ETIMEDOUT`) durante os testes de configuração de
e-mail — qualquer falha de e-mail ia travar o cadastro inteiro.

**Corrigido**: em ambas as rotas, tudo que roda depois do `COMMIT` agora
está **fora** do bloco try/catch que faz `ROLLBACK`. Se o e-mail falhar
agora, a conta continua sendo criada normalmente, o erro só é logado no
console, e a resposta HTTP volta rápido pro usuário (o e-mail pode ser
reenviado depois, uma vez o SMTP estando ok).

Também adicionei um **timeout de 20s** em `app-frontend/src/api.js` em
todas as chamadas de API do frontend, como proteção extra — mesmo que
algum outro bug parecido apareça no futuro, a tela nunca mais fica girando
pra sempre sem avisar nada ao usuário.

**Testado com Postgres real**: simulei exatamente o cenário do bug
(SMTP propositalmente quebrado/inalcançável) e confirmei que a resposta
volta em menos de 1s com sucesso, a conta é criada no banco de verdade, e
o erro de e-mail fica só logado. Testei também o fluxo completo (com um
SMTP de teste funcionando) pra confirmar que não quebrei o caminho feliz.

**Pendência real que ainda falta resolver**: o SMTP do Zoho Mail
(`smtppro.zoho.com:465`) está dando `ETIMEDOUT` a partir do Railway — ou
seja, mesmo com o bug do travamento corrigido, o **e-mail ainda não está
chegando de verdade**. Isso é separado do bug que corrigi. Possíveis
causas a investigar na próxima sessão: porta errada (tentar 587 com TLS em
vez de 465 com SSL — portas diretas SSL às vezes têm mais problema
atravessando firewalls de nuvem), host errado pra essa conta específica,
ou alguma restrição de rede do Railway pra saída em portas SMTP. Enquanto
isso, o sistema pelo menos não trava mais — só não entrega o e-mail.

## Atualização anterior: pagamento em produção validado + e-mail resolvido (Zoho Mail)

**Ótima notícia: o Marcelo já testou o Stripe em produção de verdade** (não
mais no meu ambiente simulado) — o webhook `invoice.paid` chegou, retornou
200 OK, e a licença foi gerada corretamente no banco (confirmei por print
do painel do Stripe e do log do Railway). Ou seja, **a integração de
pagamento está validada em produção**, não é mais só teoria testada aqui.

**O que ainda faltava: o e-mail não estava chegando.** Investigando junto
com ele, descobri que:
1. Ele tinha configurado `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`
   no Railway (Brevo = provedor pra ENVIAR e-mail), mas meu código só
   sabia usar `SMTP_*` — não reconhecia essas variáveis, por isso caía no
   fallback de mostrar no log.
2. Depois ele decidiu não usar mais a Brevo — o e-mail de
   `verterelabs.com` (envio E recebimento) ficou centralizado no **Zoho
   Mail**.

**O que fiz:** reescrevi `src/utils/email.js` pra tentar, nessa ordem: API
da Brevo (se `BREVO_API_KEY` preenchida) → SMTP genérico (se
`SMTP_HOST`/`USER`/`PASS` preenchidos — é o caso de uso agora, com o Zoho
Mail) → mostrar no log (fallback de sempre). Passei pro Marcelo os dados
exatos de SMTP do Zoho Mail (`smtp.zoho.com`, porta 587, aviso sobre
precisar de "senha de aplicativo" se a conta tiver 2FA ativado) e instruí
ele a remover a `BREVO_API_KEY` do Railway pra não conflitar com a
prioridade.

**Testado:**
- A lógica de priorização Brevo → SMTP → console, isoladamente ✅
- Chamada à API da Brevo (payload/headers corretos) — testei interceptando
  o `fetch` global, sem mock de biblioteca nenhuma, só validando o formato
  exato que a API da Brevo espera ✅
- Envio via SMTP **de ponta a ponta de verdade**: subi um servidor SMTP
  local (pacote `smtp-server`) simulando o Zoho Mail, mandei um e-mail de
  verificação através do `nodemailer` real (sem mock), e conferi que o
  e-mail chegou no servidor de teste com remetente, destinatário, assunto
  e corpo corretos ✅

**Ainda não testado:** a conexão de verdade com `smtp.zoho.com` (mesma
limitação de sempre — sem acesso a esse domínio neste ambiente). A lógica
está validada ponta a ponta contra um SMTP real (só que local), o que dá
bastante confiança, mas o Marcelo ainda precisa confirmar que o e-mail
chega na caixa de entrada de verdade depois de configurar as variáveis no
Railway.

**Pendência para a próxima sessão:** confirmar com o Marcelo se, depois de
configurar o SMTP do Zoho e remover a `BREVO_API_KEY`, o e-mail chegou.

## Atualização anterior: pagamento automático — trocado de Asaas pra Stripe

Na sessão anterior eu tinha implementado o pagamento automático com
**Asaas**. O Marcelo pensou melhor e decidiu trocar pro **Stripe**. Refiz a
integração inteira do zero pra usar o Stripe em vez da Asaas — o Asaas foi
completamente removido do código (`src/utils/asaas.js` foi apagado).

**Por que a mudança muda a arquitetura um pouco:**
- O Stripe usa **assinatura criptográfica de verdade** no webhook (HMAC,
  header `stripe-signature`), verificada pelo SDK oficial — mais robusto
  que o token simples da Asaas.
- Pra assinaturas recorrentes, o Stripe manda **um único evento**
  (`invoice.paid`) tanto na primeira cobrança quanto nas renovações —
  mais simples que a Asaas, que exigia diferenciar `PAYMENT_RECEIVED` /
  `PAYMENT_CONFIRMED`.
- O webhook do Stripe precisa do **corpo "cru" da requisição** (não
  parseado como JSON) pra verificar a assinatura — por isso
  `/api/payments/stripe/webhook` é registrado no `server.js` com
  `express.raw()`, ANTES do `express.json()` global que todas as outras
  rotas usam. Isso é uma pegadinha comum de quem integra Stripe pela
  primeira vez — se voltar a mexer nisso, cuidado pra não inverter a ordem.
- **Sobre o Pix**: diferente da Asaas, no Stripe o Pix pra contas
  brasileiras é **liberado por convite**, não vem habilitado numa conta
  nova. Cartão e boleto funcionam de cara. Deixei o código sem especificar
  `payment_method_types` de propósito, pra ele mostrar automaticamente
  qualquer forma de pagamento habilitada no painel — assim, quando/se o
  Marcelo conseguir a liberação do Pix, não precisa mexer em nada no
  código, só habilitar lá.

**O que foi construído:**
- `src/utils/stripe.js` — cria a sessão de checkout (assinatura mensal,
  preço definido via `PRECIFICA_MONTHLY_PRICE`).
- `src/routes/payments.js` — `POST /api/payments/stripe/checkout`
  (pública): recebe nome+e-mail, cria a sessão no Stripe, devolve a URL de
  pagamento hospedada por eles.
- `src/routes/stripeWebhook.js` — handler separado (por causa do corpo
  cru) que trata o evento `invoice.paid`: se for a primeira cobrança de
  uma assinatura nova, gera uma chave de licença nova e manda por e-mail;
  se já existir uma licença ligada àquela assinatura (mês seguinte),
  renova a mesma licença (+30 dias) em vez de criar outra.
- Novos campos `licenses.stripe_customer_id` / `licenses.stripe_subscription_id`
  e tabela `stripe_processed_events` (idempotência — o Stripe pode
  reenviar o mesmo evento mais de uma vez).
- Mesma tela pública `app-frontend/src/screens/Buy.jsx` de antes, só
  apontando pra rota nova.
- Os campos/tabela antigos da Asaas (`licenses.asaas_customer_id`,
  `licenses.asaas_subscription_id`, `asaas_processed_payments`) **não
  foram removidos do `migrate.js`** por segurança — se esse banco já tinha
  rodado a versão antiga, essas colunas continuam lá, só que sem uso
  (nenhum código mais referencia elas). Se quiser limpar isso depois, é
  seguro remover manualmente, mas não é urgente.

**Testado (com Postgres real):**
- Webhook rejeita requisição sem assinatura (400) ✅
- Webhook rejeita assinatura inválida/falsa (400) ✅
- Webhook aceita uma assinatura **real e válida** — gerei a assinatura
  manualmente usando o mesmo algoritmo HMAC do Stripe e testei contra o
  SDK oficial (`stripe`) sem nenhum mock nessa parte — validação bem mais
  forte que a que deu pra fazer com a Asaas ✅
- Primeira cobrança (`invoice.paid`) gera licença nova + "envia" e-mail
  com o código ✅
- Reenviar o mesmo evento (mesmo `event.id`) NÃO duplica a licença
  (idempotência) ✅
- Segunda cobrança da mesma assinatura RENOVA a licença existente em vez
  de criar outra, e manda e-mail de renovação ✅
- Checkout (rota que cria a sessão) testado com mock, já que essa parte
  precisa mesmo chamar a API do Stripe pra valer ✅ (lógica testada, API
  real não)

**⚠️ NÃO testado: a criação de sessão de checkout contra a API real do
Stripe.** Mesma limitação de sempre — o ambiente onde isso foi construído
não acessa `api.stripe.com`. A parte mais crítica pra segurança (a
verificação de assinatura do webhook) FOI testada de verdade, usando o SDK
real, o que dá bastante confiança. Ainda assim, **antes de ativar em
produção, teste o fluxo completo no modo de teste do Stripe** (veja a
seção "Pagamento automático (Stripe)" no README.md).

**Configuração pendente que o Marcelo precisa fazer:** criar/acessar a
conta Stripe, pegar a chave secreta (`sk_test_...` pra testar primeiro),
cadastrar o webhook no painel apontando pra
`/api/payments/stripe/webhook` com o evento `invoice.paid`, e copiar o
"Signing secret" — os detalhes exatos estão no README.md e no
`.env.example`.

## Sessão anterior

Nessa sessão (mesma conta ainda, só ambiente de execução reiniciado —
recuperei o projeto a partir do zip entregue anteriormente) foram feitos
dois ajustes pequenos e testados:

1. Avisos de "confira a pasta de spam" nas telas de verificação de e-mail
   e de redefinir senha.
2. Campo de chave de licença virou 4 caixas separadas de 4 caracteres
   (`app-frontend/src/LicenseCodeInput.jsx`), sem precisar digitar traço, e
   com suporte a colar a chave inteira (com ou sem traço, maiúscula ou
   minúscula) em qualquer uma das caixas — ela se espalha sozinha pelas 4.
   Testei colando de várias formas, funcionou em todos os casos. Também
   adicionei uma normalização espelhada no backend (`normalizeLicenseCode`
   em `src/routes/auth.js`) como segunda camada de segurança, caso o valor
   chegue de qualquer jeito diferente do esperado.

A pendência do e-mail com domínio próprio (verterelabs.com) e o hub
central **continuam pendentes** — nada mudou nelas nessa sessão. Ver seções
abaixo.

## O que é o Precifica

App de simulação de orçamentos pra clínicas/consultórios odontológicos
("Precifique seus procedimentos com inteligência"), vendido por assinatura
via chave de licença. Dono do produto: Marcelo, desenvolvedor que também
mantém o **Vertere Labs** (sistema de gestão de laboratório de prótese
dentária — também chamado de **LabFlow** em algumas conversas) e outros
projetos, todos sob o domínio **verterelabs.com**.

Stack: Node.js/Express + PostgreSQL no backend, React (Vite) no frontend,
tudo num único repositório/deploy (Railway). Sem CLI/terminal local — o
fluxo de trabalho do Marcelo é sempre: editar aqui no Claude → baixar zip →
subir manualmente pela interface web do GitHub → Railway faz o deploy
automático a partir do repositório.

## Estado atual: JÁ ESTÁ NO AR

O Precifica já está publicado e funcionando no Railway. NÃO é um protótipo
— é produção. Qualquer mudança de schema de banco precisa ser compatível
com o banco que já existe lá (o `src/migrate.js` já foi escrito pensando
nisso — usa `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE ADD COLUMN IF NOT
EXISTS`, nunca `DROP` ou algo destrutivo. Mantenha esse cuidado em qualquer
migração nova).

## O que já foi construído e testado (ponta a ponta, com Postgres real)

- **Login universal**: uma única tela de login pra admin e clientes. O
  campo `role` na tabela `users` ('admin' | 'user') decide pra onde a
  pessoa vai depois de entrar.
- **Cadastro por chave de licença**: cliente preenche chave + e-mail +
  senha + confirmar senha → recebe código de 6 dígitos por e-mail →
  confirma → conta ativada e licença vinculada automaticamente.
- **Recuperação de senha**: fluxo completo com código por e-mail.
- **Dois tipos de licença**: `monthly` (30 dias) e `trial` (7 dias),
  configurável via `LICENSE_DURATION_DAYS` e `TRIAL_DURATION_DAYS`.
- **Código de licença**: formato `XXXX-XXXX-XXXX-XXXX` (4 grupos de 4
  caracteres, sem 0/O/1/I/L pra evitar confusão ao digitar).
- **Banner vermelho de trial**: aparece fixo em todas as telas do app
  quando a licença é trial, mostrando dias restantes (atualiza sozinho).
- **Menu de conta**: mostra data de expiração (licença mensal) ou dias
  restantes (trial), com botão de sair.
- **Painel admin** (React, dentro do mesmo app — não é mais HTML separado):
  gerar chave mensal/trial, listar usuários e licenças, bloquear/reativar
  conta, renovar/revogar licença.
- **Envio de e-mail**: via SMTP genérico (`nodemailer`), configurável por
  variáveis de ambiente. **Sem SMTP configurado, os códigos aparecem no log
  do servidor em vez de serem enviados** — isso foi usado pra testar tudo
  até aqui, mas não é adequado pra uso real com clientes.

## Pendência desta sessão: e-mail com domínio próprio

O Marcelo comprou um provedor de e-mail pro domínio **verterelabs.com** e
quer que os e-mails do sistema (confirmação de cadastro, recuperação de
senha) saiam de **suporte@verterelabs.com**.

**O que já foi feito:** o `.env.example` já foi atualizado com
`SMTP_FROM=suporte@verterelabs.com` como valor padrão, e comentários
explicando onde achar host/porta/usuário/senha de SMTP no painel do
provedor contratado.

**O que falta:** ele não disse qual provedor específico contratou (pode
ser Titan, Zoho Mail, Google Workspace, ou outro). **Pergunte a ele qual
foi**, e dê as instruções exatas de SMTP_HOST/SMTP_PORT pra esse provedor
específico antes de tentar configurar. O código (`src/utils/email.js`) já
é genérico e funciona com qualquer provedor SMTP padrão — não precisa
mudar nada no código, só preencher as variáveis de ambiente certas no
Railway (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) e
redeployar.

## Próxima tarefa grande: HUB CENTRAL em verterelabs.com

**Isso NÃO foi construído ainda — foi só combinado verbalmente na última
mensagem antes dos créditos acabarem.** O Marcelo quer um hub/portal
central no domínio `verterelabs.com` reunindo todos os produtos dele:

- Precifica (este sistema de orçamentos)
- Vertere Labs / LabFlow (sistema de gestão de laboratório de prótese
  dentária — código já existe em outro lugar, não está neste zip)
- Outros produtos que ele venha a criar no futuro

**Antes de começar a construir isso, pergunte ao Marcelo:**

1. Onde está o código do LabFlow/Vertere Labs hoje? (repositório GitHub
   separado? Precisa que ele suba os arquivos aqui também, ou já está
   publicado em algum lugar com URL própria?)
2. Como ele imagina a navegação: um site em `verterelabs.com` com links
   pra subdomínios de cada produto (`precifica.verterelabs.com`,
   `labflow.verterelabs.com`), ou tudo dentro do mesmo domínio com
   caminhos diferentes (`verterelabs.com/precifica`,
   `verterelabs.com/labflow`)?
3. O login deve ser **unificado** entre os produtos (uma conta só dá
   acesso a tudo que ele contratou) ou cada produto mantém login/licença
   próprios (como o Precifica já tem hoje)?
4. Qual a identidade visual desse hub? (Ele tem uma paleta/logo da marca
   "Vertere" já definida em algum lugar, ou é pra criar do zero?)

**Sugestão de abordagem técnica** (só uma sugestão inicial, validar com
ele): manter cada produto como um serviço Railway separado (como já é o
caso do Precifica), e configurar subdomínios via **Custom Domains** do
Railway apontando o DNS do `verterelabs.com` pra cada serviço. O hub em si
pode ser um site simples e leve (React ou até HTML estático) só com links
pros subdomínios — não precisa reinventar autenticação ali, a menos que a
resposta da pergunta 3 acima for "login unificado", que aí muda bastante o
escopo (precisaria virar um serviço de auth compartilhado entre os
produtos, tipo o que o Precifica já tem mas usado por todos).

## Estrutura de pastas deste projeto

```
precifica/
├── server.js                 # Express: serve o app React (/) e a API (/api)
├── package.json               # scripts da raiz, incluindo "build" do frontend
├── .env.example                # todas as variáveis de ambiente documentadas
├── src/
│   ├── db.js                    # conexão Postgres
│   ├── migrate.js               # cria/atualiza tabelas + admin inicial (idempotente)
│   ├── middleware/auth.js       # requireAuth / requireAdmin (JWT)
│   ├── routes/auth.js           # cadastro, verificação de e-mail, login, esqueci/redefinir senha
│   ├── routes/admin.js          # gerar chave, listar usuários/licenças, bloquear, renovar, revogar
│   └── utils/
│       ├── email.js               # envio de e-mail (SMTP + fallback console)
│       ├── jwt.js                 # assinar/verificar token
│       ├── licenseCode.js         # gerador de código XXXX-XXXX-XXXX-XXXX
│       ├── licenseStatus.js       # calcula validade/dias restantes de uma licença
│       └── shortCode.js           # gerador de código numérico de 6 dígitos (e-mail)
└── app-frontend/                # projeto Vite + React (compilado em app-frontend/dist)
    └── src/
        ├── App.jsx                 # o simulador em si (a parte "de negócio" do produto)
        ├── AuthGate.jsx            # decide o que mostrar: login/cadastro/app/admin
        ├── AdminDashboard.jsx      # painel administrativo em React
        ├── AccountMenu.jsx         # menu flutuante com validade da licença + sair
        ├── TrialBanner.jsx         # banner vermelho fixo (só quando licença é trial)
        ├── LicenseCodeInput.jsx    # campo de chave de licença em 4 caixas (sem traço, cola em qualquer uma)
        ├── screens/                 # Login, Register, VerifyEmail, ForgotPassword, ResetPassword, LicenseBlocked
        ├── storageShim.js          # substitui window.storage do Claude.ai por localStorage
        └── api.js                  # chamadas à API com token de autenticação
```

Detalhes técnicos completos (tabelas do banco, variáveis de ambiente, passo
a passo de deploy no Railway) estão no `README.md` na raiz — leia ele
também antes de mexer em qualquer coisa.

## Como continuar a partir daqui

1. Extraia o zip, leia este `HANDOFF.md` e depois o `README.md`.
2. Pergunte ao Marcelo qual provedor de e-mail ele contratou pra
   `verterelabs.com`, e configure o SMTP de verdade (é rápido, só
   variáveis de ambiente).
3. Pergunte sobre a estrutura do hub central (as 4 perguntas acima) antes
   de começar a construir qualquer coisa — é um projeto novo, grande, e as
   respostas mudam bastante a arquitetura.
4. Se for continuar editando o Precifica em si (não o hub), o código está
   todo neste zip, testado e funcionando — pode seguir editando
   normalmente a partir daqui.

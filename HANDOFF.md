# HANDOFF — Precifica

> Este arquivo existe porque os créditos da conta Claude usada até aqui
> acabaram. Se você é uma instância nova do Claude lendo isso: leia este
> documento inteiro antes de fazer qualquer coisa. Ele te dá o contexto
> completo do que já foi construído, o que está testado, e o que falta.

## ✅ Feito nesta sessão — Log de diagnóstico do preço no boot do servidor

O Marcelo reportou que, mesmo depois de mudar `PRECIFICA_MONTHLY_PRICE`
no Railway, o Stripe continuou cobrando o valor antigo numa assinatura
mensal nova (direto, sem ser renovação/teste). Isso é importante porque
**descarta a hipótese mais comum** (assinatura antiga presa no preço de
quando foi criada) — sendo uma assinatura NOVA, o valor tem que vir da
variável de ambiente lida na hora, então só sobra uma explicação
plausível: **o processo do servidor no Railway ainda não tinha
reiniciado com a variável nova quando esse teste foi feito** (`src/
utils/stripe.js` lê `process.env.PRECIFICA_MONTHLY_PRICE` a cada
checkout, não guarda nada em cache — então se o valor errado saiu, é
porque o processo rodando ainda tinha o valor antigo carregado, não um
bug na lógica do preço em si).

Pra confirmar isso sem ficar adivinhando, adicionei um log no boot do
servidor (`server.js`) que imprime, toda vez que ele sobe, qual preço
mensal/anual ele está enxergando de verdade nas variáveis de ambiente
(e avisa explicitamente se não achou a variável e caiu no padrão do
código). **Depois do próximo deploy, é só olhar os logs do Railway** —
se aparecer "Preço mensal: R$ 29.90", a variável pegou certo e qualquer
cobrança errada depois disso seria outra coisa (aí sim eu investigo
mais fundo); se aparecer "R$ 99.90 (variável ... não definida...)", o
Railway não está passando a variável pro processo (nome errado, no
ambiente errado, ou salva mas sem ter feito um redeploy de verdade).

Nenhuma lógica de preço foi alterada — só esse log novo. `node --check`
no `server.js` passou limpo.

## ✅ Feito em sessão anterior — Preço mensal atualizado pra R$ 29,90 (texto da tela)

Continuação direta do item logo abaixo (que já explicava que o texto da
tela não lê a variável do Railway). O Marcelo mudou
`PRECIFICA_MONTHLY_PRICE` pra `29.90` no Railway (isso já vale pro
valor cobrado de verdade) e pediu pra sincronizar o texto:

- `app-frontend/src/screens/Buy.jsx`: `MONTHLY_PRICE` de `99.9` pra
  `29.9` — comentei do lado que esse valor precisa sempre bater com a
  variável do Railway, pra próxima vez não passar batido.
- `app-frontend/src/App.jsx` (modal "Renovar assinatura"): texto fixo
  `R$ 99,90` → `R$ 29,90`.
- Conferi que não sobrou nenhum outro `99,90` hardcoded em lugar
  nenhum do frontend (só o card do Anual, comentado, que continua com
  `R$ 599,90` — não mexi porque ele está pausado e o valor anual não
  mudou). No backend, os outros lugares que mencionam `99.9`
  (`src/utils/checkoutLicense.js`, `src/routes/admin.js`) já são só
  fallback (`|| 99.9`) — como a variável está definida no Railway, eles
  já usam o `29.9` sozinhos, sem precisar mexer em nada.

Build do frontend rodou limpo.

## ✅ Feito em sessão anterior — Só plano mensal por enquanto (anual escondido)

Pedido do Marcelo: oferecer só o plano mensal por ora. Ao perguntar
sobre mudar o "valor" pelas variáveis do Railway, descobri e expliquei
uma coisa importante: **o preço que aparece pro cliente na tela de
compra NÃO vem da variável de ambiente** — só o valor que o Stripe
efetivamente cobra é que lê `PRECIFICA_MONTHLY_PRICE`/
`PRECIFICA_ANNUAL_PRICE` (`src/utils/stripe.js` e
`src/utils/mercadopago.js`). O número mostrado nas telas
(`Buy.jsx` e o modal de renovação em `App.jsx`) é um texto fixo no
código (`R$ 99,90`/`R$ 599,90`), então mudar só a variável do Railway
muda quanto é cobrado, mas NÃO muda o que a pessoa vê escrito na tela —
isso sempre vai precisar de uma mudança de código à parte (é só avisar
quando quiser mudar o preço "de verdade" que eu já ajusto os dois
lugares).

Sobre o pedido de hoje (só mensal): **não** dava pra resolver só
deixando a variável do anual em branco (isso só afeta o preço cobrado
SE alguém escolher o plano anual — o cartão "Anual" continuaria
aparecendo normalmente pra escolher). O que fiz:

- `app-frontend/src/screens/Buy.jsx` (tela pública de compra, pra quem
  ainda não é cliente): o grid de 2 planos virou só o card do Mensal,
  já vem selecionado sozinho (não precisa mais escolher, só preencher o
  e-mail). O card do Anual ficou comentado bem ao lado, pronto pra
  voltar — é só descomentar o `<button>` e trocar a div de volta pra
  `grid grid-cols-2 gap-3 mb-5`.
- `app-frontend/src/App.jsx` (modal "Renovar assinatura", em
  Configurações → Gerenciar assinatura — pra quem já é cliente e
  cancelou a renovação automática): mesma coisa, só o card do Mensal
  aparece, Anual comentado do lado pra reativar depois.
- **Não mexi** no painel admin (`AdminDashboard.jsx`) — lá o admin
  ainda consegue gerar uma chave anual manualmente na mão, se precisar
  cobrir algum caso especial (cortesia, negociação direta etc.). Se
  quiser que isso também fique bloqueado enquanto o anual estiver
  pausado, é só pedir.
- O teste grátis (`TrialSignup.jsx`) já não tinha escolha de plano
  (sempre vira mensal depois dos 7 dias) — nada mudou ali.

**Como reativar o anual depois**: em cada um dos dois arquivos, tem um
comentário `{/* ... */}` logo ao lado do card do Mensal com o botão do
Anual inteiro guardado — é só descomentar e trocar a div do
`className="mb-5"` (ou `"mb-4"` no modal) de volta pra
`className="grid grid-cols-2 gap-3 mb-5"` (ou `gap-2 mb-4` no modal).

Build do frontend rodou limpo. Não testei clicando de verdade (não
precisa de banco pra essas duas telas, mas vale conferir visualmente).

## ✅ Feito em sessão anterior — Histórico: título, filtros, busca e card, todos alinhados juntos

Depois de duas rodadas indo e voltando nessa mesma tela, o padrão final
do Histórico de orçamentos (`HistoryPanel` em `App.jsx`) ficou assim —
**LEIA ISSO antes de mexer nessa tela de novo**, pra não desfazer sem
querer:

- Título "Histórico de orçamentos", filtros por status
  (Todos/Em aberto/Aprovado/Pago/Reprovado), barra de busca e o card da
  tabela ficam **todos dentro do mesmo `<div>` invólucro**
  (`mx-auto w-fit max-w-full space-y-3`). A largura desse invólucro é
  definida pelo filho mais largo (a tabela, dentro do card) — os outros
  não têm largura própria, então automaticamente acompanham essa mesma
  largura e mesma borda esquerda/direita. É assim que título, filtros,
  busca e card ficam alinhados entre si e centralizados juntos na tela,
  sem precisar calcular nada manualmente.
- Ordem de cima pra baixo: título → filtros → busca → card. (A busca
  fica colada logo acima do card, mesmo espírito visual da tela de
  Procedimentos.)
- Dentro do card, a `<table>` em si NÃO tem `w-full` — cada coluna fica
  do tamanho do próprio conteúdo (isso é o que evita os vãos vazios
  entre colunas que existiam antes); se sobrar espaço, ele fica em
  branco à direita da última coluna, dentro do card.

Build do frontend rodou limpo. Não testei clicando de verdade — vale
conferir visualmente que título, filtros, busca e card ficam com a
mesma largura, na mesma borda esquerda, e que a tabela continua sem
cortar nenhum texto.

**Nota pra manter consistência entre telas** (pedido explícito do
Marcelo): esse é o padrão de layout dessa tela agora. Se for aplicar
algo parecido em outra tela de lista/tabela do sistema (Pacientes, por
exemplo, se um dia tiver filtro+busca+card), replicar esse MESMO padrão
(invólucro único `w-fit mx-auto` com tudo dentro, na mesma ordem
título→filtros→busca→card) em vez de inventar uma solução diferente
pra cada tela — é exatamente esse tipo de inconsistência entre sessões
que estava incomodando.

## ✅ Feito em sessão anterior — "Último acesso" e "Online agora" no painel admin

Pedido: na lista de Usuários do painel admin, mostrar quando cada pessoa
fez o último login e, se der, se ela está online agora.

**Banco de dados** (`src/migrate.js`): duas colunas novas em `users` —
`last_login_at` (marcada só quando a pessoa entra de verdade com
e-mail/senha) e `last_seen_at` (marcada a cada requisição autenticada
que ela faz enquanto usa o app, não só no login). Migração idempotente
de sempre, roda sozinha no próximo deploy.

**Backend**:
- `POST /api/auth/login` (`src/routes/auth.js`): grava `last_login_at` e
  `last_seen_at` no momento do login (não trava a resposta se isso
  falhar por algum motivo — o login em si já aconteceu).
- `src/middleware/auth.js` (`requireAuth`, usado em basicamente toda
  rota autenticada do app): atualiza `last_seen_at` a cada requisição —
  é isso que dá o "Online agora" de verdade (a pessoa não precisa estar
  numa tela específica, só ter feito qualquer coisa no app há pouco
  tempo: salvar um orçamento, abrir Procedimentos, etc.). Pra não virar
  um UPDATE no banco a cada requisição (o app faz várias o tempo todo),
  isso é "throttled": só grava de novo se já tiver passado pelo menos 1
  minuto desde a última gravação daquele usuário — guardado em memória
  do próprio servidor, sem precisar de nenhuma tabela ou serviço extra.
- `GET /api/admin/users` (`src/routes/admin.js`): agora também traz
  `last_login_at`, `last_seen_at` e `online` (booleano calculado no
  próprio SQL — `true` quando `last_seen_at` está dentro dos últimos 3
  minutos).

**Frontend** (`app-frontend/src/AdminDashboard.jsx`):
- Nova coluna "Último acesso" na tabela de Usuários: mostra "Online
  agora" (em destaque) pra quem está online, ou "há X min/h/dias" +
  data/hora completa embaixo pra quem não está, ou "Nunca entrou" pra
  quem ainda não fez login nenhuma vez (conta criada pelo admin mas
  ainda não confirmada/usada, por exemplo).
- Uma bolinha verde ao lado do e-mail, na primeira coluna, também marca
  quem está online agora — pra dar pra notar de relance sem precisar
  ler a coluna inteira.

**Importante pra entender o número**: "Online agora" reflete atividade
recente na API (qualquer chamada autenticada), não uma conexão em tempo
real tipo WebSocket — então pode levar até ~1 minuto pra "desligar" a
bolinha depois que a pessoa fecha a aba, e a precisão depende do app
estar de fato fazendo alguma chamada de tempos em tempos enquanto a
pessoa usa (o que já acontece normalmente: autosave, trocar de aba,
etc.). Não é um relógio "está com o app aberto neste segundo exato".

**Testado**: rodei o build do frontend e `node --check` nos arquivos do
backend que mudaram, ambos limpos. Não testei a ponta a ponta com um
login de verdade contra o banco (preciso do banco rodando pra isso) —
vale conferir depois do deploy que a coluna "Último acesso" aparece
certinha e que o indicador "Online agora" liga e desliga como esperado
usando a conta de teste.

## ✅ Feito em sessão anterior — Card do Histórico com largura ajustada ao conteúdo

Você tinha mandado um print com retângulos vermelhos mostrando vãos vazios
dentro da tabela do Histórico (entre Data/Nome, perto de Profissional,
entre Status/Valor) — sobrando desde que a tela passou a ocupar a largura
toda (mudança da rodada anterior). O motivo: a tabela tinha `w-full`
(sempre 100% da largura do card) e o card em si sempre esticava pra
largura total da tela, então toda coluna "sobrava" espaço proporcional
mesmo com pouco conteúdo.

Corrigido: o card do Histórico agora só é tão largo quanto o conteúdo das
colunas realmente precisa (`w-fit` no lugar de esticar full-width), igual
o pedido pra tela de Procedimentos. Se o conteúdo não couber (tela bem
estreita, celular), continua tendo uma barra de rolagem horizontal só
dentro do card — isso é esperado e não é o mesmo problema de antes (que
era vão vazio, não falta de espaço). Nenhum texto foi cortado por causa
dessa mudança: a coluna "Procedimento" continua com o mesmo limite e
"..." + dica ao passar o mouse de antes, pra listas de procedimentos
muito longas — isso já existia e não é afetado por essa correção.

**Testado**: rodei o build de produção (`npm run build`), passou limpo.
Não abri o app clicando de verdade pra comparar visualmente antes/depois
(sem esse cliente); vale conferir se ficou como esperado, especialmente
com poucos orçamentos salvos vs. muitos (nomes/valores variados) e numa
tela mais estreita (celular/tablet) pra confirmar que a rolagem horizontal
aparece só quando realmente falta espaço.

**Ajuste rápido no mesmo dia**: depois de ver o resultado, você reportou
dois detalhes — o card tinha ficado grudado na esquerda em vez de
centralizado, e a barra de busca ("Buscar por paciente ou procedimento...")
continuava esticada na largura total, destoando da largura do card
abaixo dela. Corrigido: a barra de busca e o card do histórico agora
ficam dentro do mesmo invólucro, que é centralizado na tela (`mx-auto`) e
tem a largura definida pelo conteúdo da tabela — a barra de busca
acompanha exatamente essa largura, nunca mais que ela. Os botões de
filtro por status (Todos/Em aberto/Aprovado/Pago/Reprovado), que ficam
acima, continuam alinhados à esquerda como antes (não foi pedido mexer
neles). Build rodou limpo de novo; mesma ressalva de não ter conferido
clicando de verdade.

## ✅ Feito em sessão anterior — Correção do Esc na Apresentação, histórico com ordenação/menu de contexto, scrollbar clara no modo claro

Mais uma rodada de ajustes finos, em cima do que foi entregue antes:

**1. Esc dentro da Apresentação** — o pedido anterior ("Esc fecha a
Apresentação") tinha um conflito: já existia um atalho global de Esc que
sempre voltava pro Dashboard (pedido de uma sessão bem anterior), e os
dois disparavam juntos. Agora: Esc dentro da Apresentação SÓ fecha ela
(volta pro orçamento normal); Esc fora da Apresentação continua indo pro
Dashboard, como sempre foi. A Apresentação marca uma classe no `<body>`
enquanto está aberta, e o atalho global de Esc checa essa classe antes de
trocar de aba.

**2. Histórico de orçamentos**:
- Removido o botão "Limpar histórico" do topo.
- Botão direito num orçamento agora abre um menu de contexto com "Excluir
  orçamento" — clicar nele pede confirmação (Cancelar/Excluir) antes de
  excluir de verdade. O X que já existia na linha (excluir com duplo
  clique) continua funcionando do mesmo jeito, esse é um caminho a mais.
- A tela do Histórico deixou de ter uma largura máxima menor que o resto
  do app — antes isso forçava uma barra de rolagem horizontal na tabela
  mesmo com espaço sobrando na tela; agora usa a largura toda disponível,
  igual a aba Procedimentos já fazia.
- Coluna "Procedimento" ficou mais estreita (o nome completo continua
  disponível passando o mouse em cima, como já era).
- Todas as colunas do histórico agora são clicáveis pra ordenar (Data,
  Nome, Profissional, Procedimento, Forma de pagamento, Status, Valor) —
  clicar de novo na mesma coluna inverte a ordem (crescente/decrescente),
  com uma setinha mostrando qual coluna e direção estão ativas.

**3. Scrollbar clara no modo claro** — quem usa o sistema operacional no
modo escuro estava vendo a scrollbar (e outros controles nativos do
navegador) escura mesmo com o app no modo claro, porque a página nunca
declarava explicitamente que o modo claro também é suportado — só o modo
escuro (".dark") declarava a sua cor. Agora o modo claro declara a
própria cor também, então a scrollbar segue o modo escuro/claro do APP
(o que está em Configurações), não mais o do sistema operacional. Mesmo
visual nativo da scrollbar, só muda a paleta.

**Arquivos**: `app-frontend/src/App.jsx` (atalho global de Esc,
`SimulationPanel` marca `patient-mode-active` no body, `HistoryPanel`
reescrito com ordenação e menu de contexto, `SortableTh` novo, largura
máxima da aba Histórico), `app-frontend/src/index.css` (`color-scheme:
light` no `html`, ao lado do `.dark { color-scheme: dark }` que já
existia).

**Testado**: `npm run build` limpo. Testei a lógica de ordenação
isoladamente com um script Node (ordenar por data, nome e valor, crescente
e decrescente) — todos bateram a ordem esperada. **Não testei clicando de
verdade** — vale conferir: Esc dentro e fora da Apresentação, o menu de
contexto (botão direito) no histórico com a confirmação, clicar nos
títulos das colunas do histórico, e a cor da scrollbar com o sistema
operacional no modo escuro e o app no modo claro (o oposto também: sistema
claro + app escuro).

## ✅ Feito em sessão anterior — Botão "+ Novo Orçamento", Esc na Apresentação, ajustes finos na tela de orçamento

Pedidos rápidos do Marcelo em cima da tela de "Orçamento":

1. **Esc fecha a Apresentação** — na tela de apresentação pro paciente
   (botão "Apresentação"), apertar Esc agora fecha e volta pro orçamento
   normal, igual clicar no X.
2. **Botão verde "+ Novo Orçamento"** — apareceu acima do card "Orçamento".
   Ao clicar: se o orçamento atual tem algo preenchido E já está pronto
   pra salvar (forma de pagamento escolhida — mesma regra do botão
   "Salvar" já existente), ele salva sozinho no histórico, mostra uma
   animação rápida de um cartãozinho "voando" pro canto superior direito
   (representando ele indo pro Histórico) e depois limpa a tela pra um
   orçamento novo. Se não tinha forma de pagamento escolhida ainda (não dá
   pra salvar), só limpa, sem animação.
3. **Botão "X Limpar"** — do lado do botão verde, só aparece quando tem
   algo preenchido. Mesmo comportamento de sempre (limpa sem salvar), só
   mudou de lugar — antes era um texto simples no canto da tela, agora é
   um botão ao lado do "+ Novo Orçamento".
4. **Removida a explicação abaixo do campo "Profissional"** (o texto
   "Quem fez esse atendimento...") — o campo continua igual, só sem a
   legenda.
5. **Menu superior**: a aba que era "+ Novo Orçamento" agora é só
   "Orçamento".

**Arquivos**: `app-frontend/src/App.jsx` — componente novo
`FlyingSavedCard` (a animação), `SimulationPanel` ganhou
`hasBudgetContent`, `handleNewBudget`, o listener de Esc, e o novo bloco
de botões acima do card "Orçamento" (removido o antigo texto "Limpar" que
ficava dentro do card); `TabNav` com o rótulo da aba atualizado.

**Testado**: `npm run build` limpo. **Não testei clicando de verdade** —
vale conferir: apertar Esc dentro da Apresentação, clicar em "+ Novo
Orçamento" com um orçamento pronto (pagamento definido) e ver a animação +
o orçamento aparecendo no Histórico, e clicar em "+ Novo Orçamento" com
campos preenchidos mas sem forma de pagamento escolhida (deve só limpar,
sem animação nem duplicar nada no histórico).

## ✅ Feito em sessão anterior — Múltiplos profissionais, CNPJ da clínica, CRO fixo, reorganização do Perfil

Pedido grande do Marcelo, em 5 partes:

**1. Reorganização da tela Perfil** — nova ordem: Tipo (Consultório/Clínica)
→ Foto → CNPJ (só aparece se Tipo = Clínica) → Profissionais (novo, ver
abaixo) → Endereço → Telefone → Instagram → Logo do consultório/clínica +
Cor do orçamento + botão "Visualizar modelo de orçamento" (esse bloco foi
pro final, antes de "Validade do orçamento" — antes ficava logo no topo).

**2. Campo CNPJ** — só aparece quando o Tipo é "Clínica" (some se for
"Consultório"). Tem máscara automática (00.000.000/0000-00) e aparece no
cabeçalho e no rodapé do orçamento exportado (PDF/imagem/texto do
WhatsApp), junto com o CRO.

**3. CRO fixo, sem mais CRM** — o seletor "Tipo" (CRO/CRM) no registro
profissional sumiu; agora é sempre CRO, sem opção de escolher (o sistema é
focado só em odontologia). Só sobrou UF + número.

**4. Múltiplos profissionais** — o antigo trio "Nome / Especialidade / CRO"
(um só, fixo pra conta inteira) virou uma **lista de profissionais**, cada
um com seu próprio nome, especialidade e CRO. Tem botão "Adicionar
profissional" e cada card tem um X pra remover (não deixa remover o
último — sempre sobra pelo menos 1). Contas que já usavam o Precifica
antes disso foram migradas automaticamente: o que já tinha em
Nome/Especialidade/CRO virou o primeiro profissional da lista, sem perder
nada.

**5. Seletor de profissional no orçamento + histórico** — quando existe
mais de 1 profissional cadastrado, aparece um campo **"Profissional"** na
tela de novo orçamento (some se só tem 1 — não teria o que escolher), logo
acima do nome do paciente. É o nome/especialidade/CRO **desse**
profissional selecionado que vai pro orçamento exportado (PDF, imagem,
texto do WhatsApp) — não mais um valor fixo da conta inteira. O último
profissional usado fica salvo como padrão pro próximo orçamento (pedido
específico do Marcelo: "deixando sempre o último usado como padrão").
Também: o nome do profissional é salvo junto de cada orçamento no
histórico — o campo "Profissional" só aparece na tabela do histórico
também quando há mais de 1 cadastrado, igual à tela de orçamento. Reabrir
um orçamento salvo (histórico → clicar na linha) restaura o profissional
que fez aquele orçamento, se ele ainda existir na lista.

**O nome que aparece no topo do app** (canto superior direito, ao lado de
"Consultório"/"Clínica") passou a mostrar o nome do primeiro profissional
cadastrado (ou do último usado), em vez de um campo "Nome" solto que não
existe mais.

**Arquivos**: `app-frontend/src/App.jsx` — `DEFAULT_SETTINGS` ganhou
`cnpj`, `professionals` (array) e `lastUsedProfessionalId`; funções novas
`resolveActiveProfessional`, `withActiveProfessional`, `formatCNPJ`;
componente novo `ProfessionalsEditor`; `ProfessionalRegistrationField`
ganhou a prop `fixedType` (usada com `"CRO"`, tira o seletor Tipo);
`ProfileSettingsPage` reescrita na nova ordem; `SimulationPanel` ganhou o
seletor de profissional e passou a montar o orçamento (export e texto do
WhatsApp) com `withActiveProfessional`; `HistoryPanel` ganhou a coluna
condicional "Profissional"; migração automática de contas antigas no
carregamento das configurações (`useEffect` que busca `settings` salvo).

**Testado**: `npm run build` limpo. Testei a lógica de migração e de
resolução do profissional ativo isoladamente com um script Node (4
cenários: conta antiga sem lista de profissionais, conta já migrada com 2
profissionais, `lastUsedProfessionalId` apontando pra um profissional que
não existe mais — cai pro primeiro da lista —, e conta nova do zero) —
todos bateram o esperado. **Não testei clicando de verdade** — vale
conferir: abrir Configurações → Perfil e ver a nova ordem, cadastrar 2
profissionais e ver o seletor aparecer na tela de orçamento, gerar um
orçamento com cada um e conferir que o nome/CRO certos aparecem no
PDF/imagem exportados, e reabrir um orçamento do histórico pra ver se o
profissional certo volta selecionado.

## ✅ Feito em sessão anterior — Sugestão automática de alíquota de imposto (Simples Nacional / Carnê-Leão)

Pedido do Marcelo: o campo de "provisão de imposto" em Configurações
sempre foi uma % fixa que a pessoa digita na mão (chutando ou copiando da
guia). Como o Precifica é vendido pra várias clínicas/profissionais, cada
um com um regime tributário diferente, ele queria uma forma de deixar
esse número mais próximo da realidade, de um jeito automático mas ainda
editável.

**Como funciona agora**: os dois regimes que já existiam (Profissional
liberal/CPF e CNPJ) ganharam uma sugestão calculada a partir do
faturamento que o próprio Precifica já registra (orçamentos marcados como
"pago" nos últimos 12 meses) — usando as tabelas oficiais de cada regime:

- **CNPJ (Simples Nacional)**: a alíquota efetiva real segue a fórmula
  oficial `(RBT12 × alíquota da faixa − parcela a deduzir) / RBT12`, onde
  RBT12 é a receita bruta acumulada dos últimos 12 meses. O Precifica
  calcula o RBT12 sozinho (soma do que foi pago no período) e aplica a
  tabela do **Anexo III ou Anexo V** (a pessoa escolhe qual — adicionei
  uma explicação rápida sobre o Fator R, que é o que decide isso). Se o
  faturamento já passou do teto do Simples (R$ 4,8 milhões/ano), a
  sugestão avisa que não se aplica mais e recomenda o contador.
- **CPF (Carnê-Leão)**: aplica a tabela progressiva mensal do IR sobre a
  receita média mensal (faturamento pago / 12). Deixei bem claro que essa
  conta usa a receita **bruta** (não desconta despesas do Livro-Caixa,
  que o sistema não tem como saber), então tende a ficar um pouco acima
  do imposto real — é um ponto de partida, não o valor exato.
- Em ambos os casos: a sugestão aparece num quadro explicando a conta,
  com um botão **"Usar esse valor"** — só preenche o campo se a pessoa
  clicar, nunca sobrescreve sozinho. Sem histórico de pagamentos ainda
  (clínica nova, por exemplo), aparece um aviso e o campo continua
  editável manualmente como sempre foi.
- Lucro Presumido e outros regimes continuam sem sugestão automática —
  a orientação de perguntar ao contador continua lá.

**Importante pra quem for mexer nisso depois**: as tabelas (`SIMPLES_ANEXO_III`,
`SIMPLES_ANEXO_V`, `IRPF_MONTHLY_TABLE`, todas no topo de `App.jsx`, perto
de `SettingsPanel`) são valores de lei — Simples Nacional vigente desde
2018 (LC 155/2016), tabela do IR vigente desde mai/2024. Isso pode mudar
por lei; vale revisar esses números de tempos em tempos.

**Arquivos**: `app-frontend/src/App.jsx` — tabelas e funções
`calcPaidRevenueLast12Months`, `calcSimplesEffectiveRate`,
`calcCarneLeaoEffectiveRate` (novas), `SettingsPanel` passou a receber
`budgetHistory` (pro cálculo do faturamento) e a seção "Imposto" foi
reescrita com o quadro de sugestão + botão "Usar esse valor" pros dois
regimes, `anexoSimples` novo em `DEFAULT_SETTINGS`.

**Testado**: `npm run build` limpo. Testei as fórmulas isoladas com um
script Node comparando contra contas feitas na mão (ex: RBT12 R$200.000 no
Anexo III → 6,52% efetivo; receita média R$10.000/mês no Carnê-Leão →
18,54% efetivo; RBT12 acima do teto → retorna null e mostra o aviso) —
todos bateram exatamente. **Não testei clicando de verdade** — vale
conferir: abrir Configurações → Imposto com uma conta que já tem
orçamentos pagos no histórico, ver se a sugestão aparece e se o botão
"Usar esse valor" preenche o campo certo, e testar também uma conta sem
histórico (deve mostrar o aviso de "ainda não há dados").

## ✅ Feito em sessão anterior — Removida a categoria "Cartão" do painel de custo + "Trocar de conta" no admin

Dois ajustes pedidos pelo Marcelo em cima da entrega anterior (painéis de
análise de custo no Dashboard):

**1. Tirada a categoria "Cartão" da composição de custo empilhada** — como
ela sempre aparecia zerada (cenário à vista, sem taxa), o Marcelo pediu
pra tirar por não ter utilidade. A barra empilhada agora só mostra 4
categorias: Mão de obra, Materiais, Terceiros e Impostos.

**2. Botão "Trocar de conta" também no painel de admin** — já existia só
no app do cliente (ver "Log anterior" mais abaixo). Repliquei a mesma
lógica no menu do admin (o ícone de perfil no canto superior direito):
mesma regra de só listar contas que logaram com "Lembrar e-mail e permitir
troca rápida" marcado, mesmo comportamento de trocar com um clique
(recarrega a página) ou "esquecer" uma conta da lista. Como é a mesma
lista salva no navegador (`precifica_accounts`) usada pelo app do
cliente, uma conta salva em qualquer uma das duas telas de login aparece
nas duas — então dá pra alternar entre uma conta de cliente e a conta de
admin, por exemplo. Pra isso funcionar precisei saber o e-mail de quem tá
logado no admin (pra não listar a própria conta como opção de troca): o
`AuthGate.jsx` agora passa `currentEmail={session?.user?.email}` pro
`AdminDashboard`.

**Arquivos**: `app-frontend/src/App.jsx` (removida a categoria "cartao" de
`COST_BREAKDOWN_COLORS`, `buildProcedureCostBreakdown` e
`StackedCompositionList`), `app-frontend/src/AdminDashboard.jsx`
(`AdminAccountMenu` ganhou a seção "Trocar de conta", igual ao
`OptionsMenu` do cliente), `app-frontend/src/AuthGate.jsx` (passa
`currentEmail` pro admin).

**Testado**: `npm run build` do frontend limpo. **Não testei clicando de
verdade** — vale conferir: abrir o Dashboard e ver que a barra empilhada
não tem mais o segmento roxo de "Cartão", e testar a troca de conta
logando como admin com "Lembrar" marcado em 2 contas diferentes (uma
delas podendo ser uma conta de cliente comum).

## ✅ Feito em sessão anterior — Novos painéis de análise de custo no Dashboard

Pedido do Marcelo: mandou print de um dashboard de outra ferramenta (de
uma mentoria) e perguntou se dava pra implementar algo parecido no
Precifica. O painel de referência tinha 5 blocos: Top 10 maior preço
final, Top 10 maior custo total + impostos, composição de custo por
procedimento (barra empilhada: H.C. Próprio / Materiais / Terceiros /
Cartão / Impostos), Top 10 maior custo com terceiros, e preço final ×
custo total.

**O problema pra replicar direto**: no Precifica, "Cartão" (taxa da
maquininha) e "Impostos" não são um custo fixo do procedimento — dependem
da forma de pagamento escolhida em cada orçamento (podem ter várias formas
configuradas, cada uma com taxa diferente). Perguntei ao Marcelo como
tratar isso e ele escolheu o **cenário "à vista"**: taxa de cartão = R$0
(pagamento à vista não tem taxa) e Impostos = a % de provisão de imposto
configurada em Configurações, aplicada sobre o preço final. Por isso, nos
novos painéis, "Cartão" sempre aparece como R$0 — é assim de propósito
(reflete o cenário à vista), não é bug. Se um dia quiser ver isso
considerando uma forma de pagamento específica (com taxa de cartão de
verdade), dá pra evoluir isso depois escolhendo a forma de pagamento como
filtro.

**Onde entrou**: dentro da aba **Dashboard** (app do cliente, não é o
admin), embaixo do que já existia (evolução mensal, status, procedimentos
mais orçados). Uma nova seção "Análise de custo dos procedimentos", usando
o catálogo de **Procedimentos** cadastrados (não os orçamentos salvos) —
por isso não depende do filtro de período (30/90/365 dias) que fica no
topo da aba, que é só sobre orçamentos.

Os 5 blocos novos:
1. **Top 10 — maior preço final**: procedimentos ordenados pelo preço
   (Valor) cadastrado, maior primeiro.
2. **Top 10 — maior custo total + impostos**: custo total (materiais +
   terceiros + mão de obra) somado ao imposto estimado, maior primeiro.
3. **Composição de custo por procedimento**: barra empilhada horizontal
   pros 10 procedimentos de maior preço, dividindo o preço final entre
   mão de obra, materiais, terceiros, cartão (sempre R$0, ver acima) e
   impostos — cores validadas pro contraste/daltonismo (mesma paleta já
   usada no resto do app).
4. **Top 10 — maior custo com terceiros**: só procedimentos que têm custo
   de terceiros/laboratório cadastrado (o "Custo adicional"); se nenhum
   procedimento tiver isso, mostra uma mensagem em vez de lista vazia.
5. **Preço final × custo total**: duas barrinhas lado a lado por
   procedimento (preço final em verde-água, custo total em vermelho) com
   a margem em % rotulada — mesmos 10 procedimentos do bloco 1.

A seção inteira só aparece se existir pelo menos 1 procedimento
cadastrado (senão não tem o que mostrar).

**Arquivos**: `app-frontend/src/App.jsx` — funções novas
`buildProcedureCostBreakdown`, `StackedCompositionList`, `PriceVsCostList`
(a `TopBarList` já existia, reaproveitei), paleta `COST_BREAKDOWN_COLORS`
/`PRICE_VS_COST_COLORS`, e o corpo de `DashboardSection` recebeu os
cálculos + os 5 blocos de JSX novos. `DashboardSection` passou a receber
`procedures`, `settings` e `materialsCatalog` (o call site já tinha sido
atualizado).

**Testado**: `npm run build` do frontend limpo. Conferi manualmente os
nomes dos campos que `calcProcedure` retorna (`totalCost`, `directCost`,
`additionalCost`, `laborCost`, `listPrice`, `taxPct`) batem com o que as
novas funções usam. **Não testei clicando de verdade** (abrir a aba
Dashboard com procedimentos cadastrados de verdade e olhar os 5 blocos) —
vale conferir, principalmente a barra empilhada (bloco 3) e se os valores
batem com o que aparece na tela de Procedimentos pra alguns itens.

## ✅ Feito em sessão anterior — "Mostrar senha" em todos os campos de senha + "Trocar de conta" agora exige "Lembrar" nas duas contas

Dois pedidos do Marcelo:

**1. Botão "Mostrar senha" em todo campo de senha do app** — já existia só
na tela de Login. Revisei o app inteiro (busquei todo `type="password"` em
`app-frontend/src/`) e achei mais 2 telas sem isso: adicionei o mesmo
padrão (botão "Mostrar"/"Ocultar" dentro do campo, `showHideBtnStyle` já
existente em `authStyles.js`) em:
- `screens/Register.jsx` (Ativar licença) — campos "Senha" e "Confirmar
  senha".
- `screens/ResetPassword.jsx` (Redefinir senha) — campos "Nova senha" e
  "Confirmar nova senha".

Não sobrou nenhum campo de senha sem isso — conferi que só existem esses 4
(2 no Login, que já tinha, + os 4 novos acima). Não existe tela de "trocar
senha" dentro do app logado nem no admin, então não tinha mais nenhum
lugar pra revisar.

**2. "Trocar de conta" (da sessão anterior) agora só oferece contas que
marcaram "Lembrar" no login** — ideia do próprio Marcelo, fazia sentido:
antes, QUALQUER login (mesmo sem marcar a caixinha) deixava o token
daquela sessão salvo no navegador pra troca rápida, o que não é ideal num
computador compartilhado, por exemplo. Agora:
- A caixinha que já existia no login (antes "Lembrar e-mail") virou
  **"Lembrar e-mail e permitir troca rápida"** — passou a controlar as
  duas coisas juntas (antes só controlava o preenchimento automático do
  campo de e-mail).
- Só entra na lista de "Trocar de conta" quem loga com essa caixinha
  marcada. Desmarcar num login futuro da MESMA conta também tira ela da
  lista (respeita a intenção de "não deixar essa sessão pronta pra troca
  nesse aparelho").
- Tirei o "auto-salvamento" que eu tinha colocado na sessão anterior (que
  adicionava uma conta já logada à lista sozinho, sem precisar relogar) —
  não tinha como saber se "Lembrar" tinha sido marcado numa sessão que já
  estava aberta antes dessa mudança, então agora só entra na lista quem
  passar pelo login de novo com a caixinha marcada.
- O menu "Trocar de conta" ganhou uma linha explicando isso ("Só aparecem
  aqui contas com 'Lembrar' marcado no login"), pra não parecer que uma
  conta sumiu sem explicação.

**Arquivos**: `app-frontend/src/api.js` (a chave `REMEMBERED_EMAIL_KEY`
saiu do `Login.jsx` e virou export daqui, único lugar de verdade agora),
`app-frontend/src/screens/Login.jsx`, `app-frontend/src/AuthGate.jsx`
(reverti o auto-salvamento), `app-frontend/src/App.jsx` (linha explicativa
no menu), `app-frontend/src/screens/Register.jsx` e
`app-frontend/src/screens/ResetPassword.jsx` (mostrar senha).

**Testado**: `npm run build` do frontend limpo, sem import sobrando.
**Não testei clicando de verdade** — vale conferir: os botões
"Mostrar"/"Ocultar" nas 2 telas novas (Ativar licença e Redefinir senha),
e o fluxo de troca de conta — logar SEM marcar a caixinha e confirmar que
a conta não aparece no menu "Trocar de conta", depois logar COM a
caixinha marcada e confirmar que aparece.

## Log anterior — botão "Trocar de conta" (alternar entre contas já logadas, sem digitar senha de novo)

Pedido do Marcelo: poder alternar rapidamente entre 2 contas logadas (ex:
a conta de teste dele e a conta de verdade da Dra. Stephanie) sem precisar
sair e fazer login de novo toda vez.

**Como funciona** (tudo no app do cliente, não mexe no admin):
- Toda vez que um login é feito com sucesso, o token dessa sessão fica
  salvo numa lista local no navegador (`localStorage`, chave separada da
  sessão ativa) — junto com o e-mail, pra identificar a conta depois. Uma
  conta que já estava logada ANTES dessa mudança existir também entra
  pra lista sozinha, na próxima vez que o app confirma a sessão dela (não
  precisa relogar pra aparecer no menu).
- No **menu de conta** (ícone no canto superior direito, o mesmo de
  "Modo escuro"/"Sair"), aparece uma seção **"Trocar de conta"** — só
  quando existe pelo menos MAIS UMA conta salva além da que está ativa
  agora (se só tem uma conta salva, a seção nem aparece). Cada conta
  listada tem um "x" que aparece no hover pra esquecer aquela conta
  (tira da lista, sem deslogar ninguém).
- Clicar numa conta da lista troca o token ativo pra ela e recarrega a
  página — a sessão nova é validada normalmente do zero (mesmo fluxo de
  quem acabou de logar), então funciona certinho tanto pra 2 contas
  comuns quanto se uma delas for a conta do admin.
- **"Sair"** continua só limpando a sessão ATIVA — não mexe na lista de
  contas salvas, então dá pra sair e voltar depois sem perder a
  possibilidade de trocar rápido.
- Os tokens salvos são os mesmos JWT de sessão de sempre (validade de 30
  dias, sem mudança nenhuma no backend) — se um token salvo já tiver
  expirado na hora de trocar, o app simplesmente cai na tela de login
  normal (como qualquer sessão expirada), sem quebrar nada; a pessoa só
  precisa logar de novo nessa conta uma vez pra ela voltar a ficar
  disponível na lista.

**Arquivos**: `app-frontend/src/api.js` (novas funções
`getSavedAccounts`/`saveAccount`/`removeSavedAccount`/`switchToAccount`,
tudo em cima do `localStorage`, sem nenhuma chamada nova à API),
`app-frontend/src/screens/Login.jsx` (salva a conta ao logar),
`app-frontend/src/AuthGate.jsx` (salva a conta ao confirmar uma sessão já
existente) e `app-frontend/src/App.jsx` (a seção "Trocar de conta" dentro
do `OptionsMenu`).

**Testado**: rodei a lógica de salvar/trocar/remover/re-logar (upsert)
direto em Node com um `localStorage` fake, conferindo os retornos um por
um (inclusive tentar trocar pra uma conta que não existe mais) — bateu
tudo certo. `npm run build` do frontend limpo. **Não testei clicando de
verdade no navegador com 2 contas reais** — vale o Marcelo logar com a
conta de teste, depois sair e logar com a da Dra. Stephanie (ou
vice-versa), conferir se a outra aparece no menu pra trocar com um clique,
e se voltar funciona nos dois sentidos.

## Log anterior — cabeçalho do painel admin no mesmo padrão do app do cliente

Pedido do Marcelo: o topo do painel admin (`app-frontend/src/AdminDashboard.jsx`)
passar a seguir o mesmo padrão visual do cabeçalho do app do cliente — só
que com as 3 seções do admin como abas (Visão Geral, Usuários, Chaves de
licença) em vez das telas do consultório; os botões de criar chave
("+ Chave mensal/trial/anual/vitalícia") migram pra uma linha abaixo desse
cabeçalho; e "Modo escuro"/"Sair" (que antes eram botões soltos no
cabeçalho) migram pra dentro de um menu de conta, igual o menu de perfil
do app do cliente.

**O que mudou**:
- **Cabeçalho**: agora é um card branco arredondado com sombra
  (`bg-white border rounded-2xl shadow-sm`, mesmas classes/margens do
  header do `App.jsx`), com logo+"Precifica" à esquerda, o menu de abas
  no centro e o botão de conta à direita — mesmo layout em grid
  (`md:grid-cols-[1fr_auto_1fr]`) do app do cliente.
- **`AdminTabNav`** (novo componente, só existe dentro do
  `AdminDashboard.jsx`) — clonei a estrutura do `TabNav` do app do
  cliente: no desktop, pílula com fundo deslizante animado atrás da aba
  ativa; no celular, vira barra fixa embaixo da tela com ícone + rótulo
  (padrão de app nativo), em vez do menu em pílula pequena que existia
  antes. As 3 abas: **Visão Geral** (`LayoutDashboard`), **Usuários**
  (`Users`), **Chaves de licença** (`KeyRound`).
- **`AdminAccountMenu`** (novo componente) — mesmo botão-avatar redondo
  do `OptionsMenu` do cliente (só que sem foto/logo, sempre o ícone
  genérico de usuário, já que admin não tem essa configuração), abrindo
  um menu simples com **Modo escuro** (mesmo switch com animação) e
  **Sair** — bem mais enxuto que o do cliente de propósito (não faz
  sentido ter upload de logo, Central de Ajuda, Configurações de clínica
  etc no admin).
- **Botões de criar chave** — saíram do cabeçalho e viraram uma linha
  própria logo abaixo dele (`+ Chave mensal/trial/anual/vitalícia`),
  sempre visíveis independente da aba selecionada, exatamente como
  pedido.
- A antiga linha de abas em formato de pílula pequena (que ficava abaixo
  do cabeçalho, redundante agora que as abas moraram no cabeçalho) foi
  removida.

**Testado**: `npm run build` do frontend limpo, sem warnings de import
não usado (tirei `Sun`/`Moon` do topo, que só eram usados no botão de
tema antigo que não existe mais). **Não testei clicando de verdade no
navegador** (esse painel precisa de login de admin contra o banco de
produção, não dá pra simular aqui) — vale o Marcelo conferir: se o menu
de abas desliza certinho ao trocar de seção, se no celular vira a barra
fixa embaixo, se o menu de conta abre/fecha bem e o switch de modo
escuro continua funcionando igual antes, e se os 4 botões de criar chave
aparecem certinho na nova posição.

## Log anterior — 5 métricas novas + gráfico de tendência na Visão Geral

Pedido do Marcelo depois da correção do bug "em risco" (ver log logo
abaixo): implementar as métricas que eu tinha sugerido, no mesmo
padrão dos cards existentes (sempre dados reais/atuais, `hint` no
hover via `title`, clicável quando faz sentido abrir a lista por
trás do número) — e perguntou se valia colocar gráfico também.

**Testei as queries novas rodando uma migração de verdade num
Postgres local** (não só `node --check`) — criei um banco de teste,
rodei `src/migrate.js` nele, inseri dados fabricados cobrindo os
casos de borda (assinante pago ativo, assinatura marcada "em risco",
trial ativo, conta nunca confirmada, e uma licença ÓRFÃ de um usuário
removido) e rodei cada query nova direto no `psql`, conferindo os
números um por um contra o que eu esperava calculando na mão — todos
bateram exatamente, incluindo a série dia-a-dia do gráfico. Banco de
teste apagado no final, não sobrou nada.

**Backend** (`src/routes/admin.js`):
- `dashboard-stats` agora também retorna `churnRate`, `avgTicket`,
  `estimatedLTV`, `avgDaysToCancel` e `unconfirmedSignups` (fórmulas
  explicadas nos comentários do código, em cima de cada query/cálculo).
  Todas as novas contagens que vêm de `licenses` já nascem com o
  `EXISTS (... FROM users ...)` do bug corrigido acima — não reintroduzi
  a mesma inconsistência.
- Novo grupo `unconfirmed` em `dashboard-stats/group` — lista as contas
  que nunca confirmaram e-mail (por trás do novo card).
- Novo endpoint `GET /api/admin/dashboard-stats/trend?days=<n>` —
  série diária de novos cadastros vs cancelamentos no período,
  preenchendo os dias sem nenhum evento com zero (`generate_series`),
  sempre calculada na hora a partir dos dados reais (sem nenhuma
  tabela de histórico/snapshot nova).

**Frontend** (`app-frontend/src/AdminDashboard.jsx`):
- 5 `StatCard` novos na Visão Geral, mesmo componente/padrão dos
  existentes: **Churn**, **Ticket médio**, **LTV estimado**, **Tempo
  médio até cancelar** e **Nunca confirmaram e-mail** (esse último
  clicável, abre a lista via o grupo `unconfirmed` novo).
- Novo componente `TrendChart` — gráfico de linha em SVG puro (sem
  biblioteca), duas séries (cadastros em teal, cancelamentos em rose —
  mesmas cores dos cards, então a leitura já é familiar), com grid,
  legenda, eixo com datas, linha de crosshair e tooltip ao passar o
  mouse. Cores validadas pra contraste/daltonismo com o script da
  skill de dataviz (`validate_palette.js`), passando tanto no tema
  claro quanto no escuro (o app já suporta os dois). Fica entre os
  cards e a tabela de "Cadastros recentes".

**Sobre os números novos, pra revisar com calma** (são estimativas,
não fatos):
- **Churn** é uma aproximação: cancelamentos no período ÷ (assinantes
  pagos ativos + esses cancelamentos) — não tenho um retrato
  histórico de "quantos assinantes existiam no início do período"
  guardado em lugar nenhum, essa é a forma padrão de estimar sem isso.
- **LTV estimado** só aparece quando há churn > 0 no período (com
  churn zero a fórmula clássica tende a infinito, não mostra nada
  nesse caso — "precisa de churn > 0").
- **Tempo médio até cancelar** é sempre o histórico INTEIRO (não
  respeita o filtro de dias da Visão Geral) — de propósito, pra não
  ficar um número instável pulando toda vez que o filtro de período
  muda.

Build do frontend (`npm run build`) e `node --check` do backend
limpos. **Testei as queries direto no banco** (ver acima) mas **não
testei clicando de verdade no navegador** — vale o Marcelo abrir a
Visão Geral e conferir se os 5 cards novos aparecem com valores
plausíveis, se "Nunca confirmaram e-mail" abre a lista certa ao
clicar, e se o gráfico aparece corretamente (passando o mouse pra ver
o tooltip, trocando entre 7/30/90 dias).

## Log anterior — bug "Assinaturas em risco" (card mostrava 1, modal vinha vazio) + card do Railway removido

O Marcelo reportou (com prints) que o card "Assinaturas em risco" da
Visão Geral mostrava "1", mas ao clicar o modal vinha vazio ("Nenhuma
conta nesse grupo agora").

**Causa raiz** (`src/routes/admin.js`): o número do card
(`dashboard-stats`) contava direto na tabela `licenses`
(`cancel_at_period_end = true AND status = 'active'`), sem exigir que
o usuário dono daquela licença ainda existisse. Já a lista do modal
(`dashboard-stats/group`, grupo `atRisk`) faz `JOIN` com `users` —
então uma licença "em risco" cujo usuário foi removido (lembrando: ao
remover um usuário a licença dele fica órfã de propósito, não é
apagada — ver rota `DELETE /users/:id`) contava no número mas
desaparecia da lista, porque o `JOIN` a excluía. O Marcelo perguntou
se o bug era só nesse card ou também nos outros — conferi TODOS os
cards clicáveis da Visão Geral: os que dependem só da tabela `users`
(**Usuários totais**, **Novos cadastros**) nunca tiveram o problema
(a listagem também consulta `users` direto, sem `JOIN`); mas todos os
que dependem de `licenses` tinham a mesma inconsistência silenciosa —
**Assinantes pagos ativos**, **Em teste grátis agora**, os
contadores por plano que alimentam o **MRR**, **Cancelamentos** e
**Conversão trial → pago**, além do "em risco" que ele reportou.

**Corrigido**: as 6 queries de contagem em `dashboard-stats`
(`activePaidRes`, `activeTrialRes`, `planCountsRes`, `conversionRes`,
`cancelledInPeriodRes`, `atRiskRes`) agora exigem
`EXISTS (SELECT 1 FROM users u WHERE u.id = l.user_id)` — só contam
licenças cujo usuário ainda existe, batendo exatamente com o que as
listas dos modais (`dashboard-stats/group`) mostram. Não mudei o
comportamento de "usuário removido deixa a licença órfã" em si (só
sincronizei a contagem com a listagem) — se no futuro o Marcelo
quiser que remover um usuário também revogue/expire
a licença dele automaticamente, é uma mudança separada, é só pedir.

**Removido**: o card "Próxima cobrança do Railway" (contador de dias
até o dia do mês configurado manualmente) que ficava no topo da Visão
Geral — pedido do Marcelo pra tirar. Removi o componente inteiro
(`RailwayBillingCard`, a função auxiliar `daysUntilNextOccurrence`, o
estado `railwayBillingDay`/`saveRailwayBillingDay` e a chave de
`localStorage` `admin_railway_billing_day`) — não sobrou nenhum
resquício no código.

**Testado**: `node --check` no backend e `npm run build` do frontend,
os dois limpos. **Não testei clicando de verdade** — vale o Marcelo
conferir se o card "Assinaturas em risco" (e os outros que dependem
dessas contagens: Assinantes pagos ativos, Em teste grátis, MRR) bate
com a lista ao clicar, e se o topo da Visão Geral não mostra mais o
card do Railway.

### Pendente — métricas novas pro painel (perguntado, ainda sem resposta)
O Marcelo perguntou se tem mais alguma métrica interessante pro
painel. Sugestões dadas na conversa (nenhuma implementada ainda,
aguardando ele escolher): churn rate (%, não só a contagem de
cancelamentos), LTV médio, ticket médio anual vs mensal, tempo médio
até cancelar, cadastros que nunca ativaram/confirmaram e-mail, e um
gráfico de MRR ao longo do tempo (hoje o painel só mostra o instante
atual, sem histórico/tendência).

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

## ✅ Feito nesta sessão — cards da Visão Geral clicáveis, abrindo a lista de usuários por trás do número

Pedido do Marcelo: clicar em cards como "Assinaturas em risco",
"Cancelamentos" ou "Conversão trial → pago" e ver a lista de quem
está por trás daquele número, não só o total.

**Backend** (`src/routes/admin.js`) — novo endpoint `GET
/api/admin/dashboard-stats/group?group=<grupo>&days=<n>`, que
devolve `{ label, users: [...] }`. Grupos disponíveis:
`totalUsers`, `activePaid`, `activeTrial`, `atRisk` (não dependem do
período), e `newUsers`, `cancelled`, `trialConversion` (respeitam o
mesmo `days` do filtro da Visão Geral). Cada usuário retornado traz
email, nome/clínica, tipo de licença e as datas relevantes pra
aquele grupo específico (cadastro, validade, cancelamento, início do
trial, se converteu ou não).

**Frontend** (`app-frontend/src/AdminDashboard.jsx`):
- `StatCard` ganhou uma prop `onClick` opcional — quando presente, o
  card fica com cursor de mão e destaque no hover.
- Novo `GroupUsersModal` — lista os usuários daquele grupo (nome/
  e-mail, badge do tipo de licença, e as datas que fizerem sentido
  pra cada um), com estado de carregamento e "nenhuma conta nesse
  grupo agora" quando vazio.
- Cards ligados a um grupo: **Usuários totais**, **Assinantes pagos
  ativos**, **Em teste grátis agora**, **MRR estimado** (abre a
  mesma lista de "Assinantes pagos ativos", já que é o que compõe
  esse valor), **Conversão trial → pago** (só clicável quando já
  existe algum trial, senão fica sem ação), **Novos cadastros**,
  **Cancelamentos** e **Assinaturas em risco**.
- **Não ficou clicável**: "Receita recebida" — esse número vem direto
  da API do Stripe (faturas pagas), não tem uma lista de usuários do
  nosso banco que bata exatamente com ele.

Build do frontend testado, `node --check` no backend, sem erros.

## ✅ Feito nesta sessão — campo "Descrição" opcional ao gerar uma chave de licença

Pedido do Marcelo: ao gerar uma chave manualmente no admin, poder
escrever uma descrição opcional (pra quem é, por qual motivo) — e
essa descrição aparecer depois na lista de Usuários/Chaves.

**Banco de dados** (`src/migrate.js`): nova coluna
`licenses.description` (TEXT, opcional) — migração idempotente
(`ADD COLUMN IF NOT EXISTS`), roda sozinha no próximo deploy, sem
precisar de nada manual no Railway.

**Backend** (`src/routes/admin.js`):
- `POST /api/admin/licenses` agora aceita `description` no corpo da
  requisição (opcional, aparado com `.trim()`, vira `null` se vazio)
  e salva junto com a chave.
- `GET /api/admin/users` agora também traz `license_description`
  (a rota já usava `SELECT l.*` em `/licenses`, então essa não
  precisou de mudança).

**Frontend** (`app-frontend/src/AdminDashboard.jsx`):
- Os 4 botões "+ Chave mensal/trial/anual/vitalícia" não geram mais
  a chave na hora — agora abrem um modal pedindo a descrição (com
  aviso de que é opcional e só aparece no painel, o cliente nunca
  vê), com botão "Gerar chave" pra confirmar (ou "Cancelar").
- A descrição aparece embaixo da origem ("Admin · Gerada
  manualmente") em itálico, tanto na aba **Usuários** quanto na aba
  **Chaves de licença** — só quando preenchida.

Build do frontend testado, `node --check` no backend e na migração,
sem erros.

## ✅ Feito nesta sessão — 4 ajustes no painel admin (badges de licença, bug do menu de ações, e MRR/assinantes pagos só contando cartão de verdade)

Tudo dentro de `app-frontend/src/AdminDashboard.jsx` (e `src/routes/admin.js` pro item 4):

1. **Vitalícia sem "d restantes"** — `licenseBadge()` mostrava "Ativa ·
   d restantes" pras licenças vitalícias (o número ficava em branco
   porque vitalícia não tem `expires_at`). Agora, se
   `user.license_type === "lifetime"`, mostra só "Ativa", sem nenhum
   cálculo de dias.
2. **Texto "d restantes" sem quebrar linha** — `StatusBadge` (usado
   em todos os badges do painel admin) ganhou `whitespace-nowrap` —
   antes "364d restantes" quebrava em duas linhas dentro do badge
   pequeno, ficando estranho.
3. **Bug do menu de ações fechando antes de confirmar** —
   `RowActionsMenu` fechava o menu (`setOpen(false)`) em TODO clique,
   incluindo o primeiro clique em "Remover"/"Remover chave"/"Excluir
   conta", que só arma a confirmação (o texto vira "Confirmar
   exclusão?" por 3 segundos) — como o menu fechava, o Marcelo tinha
   que abrir de novo pra ver esse texto e clicar uma segunda vez.
   Corrigido: cada ação agora pode declarar `keepOpen: true/false`;
   as ações de exclusão usam `keepOpen: confirmDelete... !== id`
   (mantém o menu aberto no clique que só arma a confirmação, fecha
   no clique que de fato confirma/executa). As outras ações
   (Renovar, Revogar, Bloquear) continuam fechando o menu normalmente
   como antes.
4. **MRR e "Assinantes pagos ativos" só contam quem paga de
   verdade por cartão (Stripe)** — antes essas duas métricas da Visão
   Geral contavam QUALQUER licença mensal/anual ativa, incluindo as
   geradas manualmente no admin (sem cobrança nenhuma por trás) — o
   que inflava os números artificialmente. Os dois `SELECT` em
   `dashboard-stats` (`activePaidRes` e `planCountsRes`, que
   alimentam `mrr`) agora exigem `stripe_subscription_id IS NOT
   NULL` — só entra na conta quem tem assinatura Stripe de verdade
   por trás. `revenueInPeriod` já vinha direto da API do Stripe (não
   precisou mudar, já era só cobrança real). Atualizei também o texto
   de ajuda (`hint`) desses dois cards pra deixar isso explícito.

**Bônus, não pedido explicitamente mas junto do item 1** — adicionei
indicação de **assinatura cancelada**: se
`user.license_cancel_at_period_end` for `true` (cliente já cancelou
o auto-renovo, mas ainda está dentro do período pago), o badge agora
mostra "Cancelada · Xd restantes" (âmbar) em vez de "Ativa · Xd
restantes" (teal) — antes não tinha nenhuma indicação disso na tabela
de Usuários, só dava pra saber abrindo a conta do cliente lá no app
dele.

Build do frontend testado, sem erros. Backend só teve mudança de
SQL (sem migração — não criou/alterou coluna nenhuma, só o filtro do
`SELECT`), `node --check` passou limpo.

## ✅ Feito nesta sessão — Central de Ajuda simplificada: só o modal, acionado de 2 lugares

O Marcelo aprovou o conteúdo dos artigos (modal com lista + artigo,
ver captura "Image 1" que ele mandou), mas pediu pra remover a forma
como se chegava até ele:

- **Removido**: o card "Central de Ajuda" no meio de Configurações,
  com um botão "Ler artigo" por artigo (era `HelpCenterSettingsCard`
  — função apagada).
- **Removido**: o grupo "Tutoriais" no menu lateral de Configurações
  (`SettingsSideNav`), que linkava com anchors pra dentro daquele
  card (`#sub-tutorial-*`) — ids que nem batiam mais direito com
  `HELP_ARTICLES` desde a sessão anterior.
- **Removido**: o botão "Rever tutorial" do menu do perfil
  (`OptionsMenu`).

**O que existe agora**: só o `HelpCenterModal` (lista de artigos +
conteúdo, exatamente como já estava) — sem nenhum card fixo na tela,
só abre quando acionado. Acesso em 2 lugares, como pedido:

1. **Menu do perfil** (ícone de conta, canto superior direito) — o
   botão que era "Rever tutorial" agora é **"Central de Ajuda"** e
   abre o modal direto (a partir do primeiro artigo, Dashboard — dá
   pra navegar pra qualquer outro por dentro do próprio modal).
2. **Menu lateral de Configurações** (`SettingsSideNav`, coluna da
   esquerda, só aparece no desktop) — troquei o grupo "Tutoriais"
   por um novo grupo **"Ajuda"**, com dois botões:
   - **Central de Ajuda** — abre o mesmo `HelpCenterModal`.
   - **Rever Tutorial inicial** — dispara o tour guiado de
     boas-vindas (`OnboardingTour`/`TOUR_STEPS`), o mesmo que corria
     no primeiro acesso — só mudou de lugar (do menu do perfil pra
     aqui), o motor em si não foi tocado.

**Como foi feito por baixo**: o estado que controla se o modal está
aberto (`helpCenterOpen`/`setHelpCenterOpen`) subiu pro componente
principal do App (mesmo nível de `tourStep`), e o `HelpCenterModal`
é renderizado uma vez só, junto do `OnboardingTour` — os dois
gatilhos (menu do perfil e menu de Configurações) só chamam
`setHelpCenterOpen(true)`. `SettingsSideNav` agora recebe
`onOpenHelpCenter` e `onStartTour` como props; o grupo "Ajuda" no
menu tem itens do tipo `action` (não são mais links `<a href>` de
scroll, são botões que disparam essas funções).

## ✅ Feito nesta sessão — editar o valor de um procedimento só naquele orçamento (não altera o catálogo)

Pedido do Marcelo: em Novo Orçamento, depois de adicionar um
procedimento à lista, poder clicar com o botão direito (ou toque e
segure, no celular) e "Editar valor" — mudando o valor cobrado **só
nesse orçamento específico**, sem tocar no valor cadastrado desse
procedimento em Procedimentos.

**Como foi implementado** (`app-frontend/src/App.jsx`, dentro de
`SimulationPanel`):
- Cada item do orçamento (`items`, dentro do estado do App) pode
  carregar um campo opcional `valorBaseOverride`. Ele só existe
  quando o valor daquele item específico foi ajustado; por padrão
  não existe, e o item usa o `valorBase` do catálogo normalmente.
- Ao montar `budgetProcs` (a lista que alimenta o cálculo e o
  resumo do orçamento), se o item tiver `valorBaseOverride`, ele
  sobrescreve o `valorBase` vindo do catálogo só naquele objeto
  montado — o procedimento cadastrado em Procedimentos não é
  alterado.
- **Menu de contexto** em cada item da lista do orçamento — botão
  direito no PC, toque e segure no celular (mesmo padrão de "toque e
  segure" já usado na tabela de Procedimentos):
  - Procedimento normal → "Editar valor" (abre modal com o valor
    atual pra editar) e, se já tiver sido ajustado, "Restaurar valor
    do cadastro" (remove o `valorBaseOverride`, volta a seguir o
    catálogo).
  - Item avulso (Custo/Desconto) → "Editar" (abre o mesmo modal que
    já existia antes, agora também acessível pelo menu de contexto,
    além do clique direto no item).
  - "Remover" em qualquer um dos dois casos.
- Quando um item está com valor ajustado, aparece um selo discreto
  "· valor ajustado" ao lado do nome, na cor âmbar (só um indicador
  visual, não é clicável).
- **Importante — persistência no Histórico**: o valor ajustado
  também é salvo dentro do próprio orçamento (`entry.procedures[].valorBaseOverride`,
  em `handleSaveBudget`) e restaurado ao reabrir
  (`handleReopenBudget`) — sem isso, reabrir um orçamento salvo
  antes voltaria a usar o valor do catálogo, divergindo do que foi
  realmente cobrado quando o orçamento foi salvo.
- Build do frontend testado, sem erros.

### Não foi tocado
Itens avulsos (Custo/Desconto) já eram editáveis clicando direto —
esse comportamento continua igual, só ganhou a opção adicional pelo
menu de contexto.

## ✅ Feito nesta sessão — "Tutoriais" de Configurações virou "Central de Ajuda" (artigos de texto, um por seção do sistema)

Isso substitui o rascunho da sessão anterior (que reaproveitava o
motor do tour de boas-vindas) — ver as respostas do Marcelo às
perguntas que tinham ficado pendentes:
- **Formato**: central de ajuda com artigos de texto por tópico —
  **não** vídeo por enquanto, mas ele pretende gravar vídeos no
  futuro, então cada artigo já tem um campo `videoUrl` (hoje `null`
  em todos) pra encaixar um vídeo depois sem precisar mudar a
  estrutura.
- **Granularidade**: um artigo por seção do sistema (mais granular
  que as 3 áreas do tour de boas-vindas).
- Ele foi explícito: **não mexer no tour de boas-vindas** (`OnboardingTour`
  / `TOUR_SECTIONS` / `TOUR_STEPS`) — "já está perfeito". Esse tour
  continua exatamente como estava, disparado no primeiro acesso e via
  "Rever tutorial" no menu do perfil. A Central de Ajuda é um sistema
  **separado e novo**, só acessível pelo card em Configurações.

**O que foi implementado** (`app-frontend/src/App.jsx`):
- `HELP_ARTICLES` — array com 9 artigos, cada um `{ id, group, title,
  summary, videoUrl, body }`. `group` é "Telas principais" ou
  "Configurações" (usado só pra agrupar visualmente na lista).
  `body` é uma lista de blocos `{ type: "p" | "h" | "list" | "tip",
  ... }`, renderizados por `HelpArticleContent`. Os 9 artigos: Dashboard,
  Novo Orçamento, Pacientes, Procedimentos, Custos/Materiais, Histórico,
  Perfil/Dados da clínica, Custos (hora clínica e imposto), Formas de
  Pagamento/Taxas.
- Conteúdo de cada artigo foi escrito com base nos textos/tooltips que
  já existiam no próprio app (campos de Configurações, tooltips das
  colunas da tabela de Procedimentos, etc) — pra garantir que bate com
  o comportamento real do sistema. Vale revisar com calma e ajustar o
  tom/nível de detalhe se quiser.
- `HelpArticleContent` — renderiza um artigo (título, resumo,
  player de vídeo SE `videoUrl` estiver preenchido, parágrafos, listas
  com bullet, e caixas de "dica" destacadas em teal).
- `HelpCenterModal` — modal com lista de artigos agrupada à esquerda
  (desktop) e o artigo selecionado à direita; no celular vira
  navegação de duas telas (lista → artigo, com botão de voltar) em vez
  de coluna dupla.
- `HelpCenterSettingsCard` (substituiu `TutorialsSettingsCard`) — card
  "Central de Ajuda" em Configurações, listando os 9 artigos com botão
  "Ler artigo" cada, que abre o `HelpCenterModal` já naquele artigo.
- Ícones novos importados de `lucide-react`: `HelpCircle`, `BookOpen`,
  `PlayCircle` (ainda não usado no JSX, deixado importado pra quando o
  vídeo for adicionado — se o linter reclamar de import não usado,
  pode remover ele até lá), `ArrowLeft`.
- Build do frontend (`npm run build`) testado, sem erros.

**O que NÃO foi tocado**: `TOUR_SECTIONS`, `TOUR_STEPS`,
`OnboardingTour`, `WelcomeModal`, e o fluxo de "Rever tutorial" no
menu do perfil — tudo isso continua idêntico a antes.

### Pendências / próximos passos possíveis
- **Revisar o texto dos 9 artigos** com o Marcelo — foi escrito pela
  Claude a partir do comportamento real do app, mas vale ele ler e
  ajustar tom, corrigir algo que não reflita a prática do consultório
  dele, ou pedir mais detalhe em algum ponto.
- Quando ele gravar os vídeos: subir cada vídeo em algum storage
  (ou como asset do próprio deploy) e preencher o `videoUrl` do
  artigo correspondente em `HELP_ARTICLES` — o player já aparece
  sozinho, sem precisar mudar `HelpArticleContent`/`HelpCenterModal`.
- Não perguntado ainda: se ele quer alguma forma de busca/filtro
  dentro da Central de Ajuda (hoje é só uma lista simples, sem busca)
  — só adicionar se ele sentir falta, o catálogo ainda é pequeno (9
  itens).

## ✅ Feito numa sessão anterior — botões Custo/Desconto no orçamento + tela de Tutoriais em Configurações (rascunho — SUBSTITUÍDO pela Central de Ajuda acima)

Dois pedidos do Marcelo nesta sessão:

**1. Botão "+" (item avulso) virou dois botões: "+ Custo" (vermelho) e
"+ Desconto" (verde)** — `app-frontend/src/App.jsx`, dentro de
`SimulationPanel`, dois botões lado a lado logo abaixo de "Buscar
procedimento", no lugar do antigo botão "+" redondo único.
- **"+ Custo"** (vermelho) — funciona exatamente como o antigo "item
  avulso": nome + campo "Custo (R$)" + campo "Valor cobrado (R$)",
  pra um custo extra terceirizado, taxa de laboratório etc.
- **"+ Desconto"** (verde) — modal simplificado, um campo só ("Valor
  do desconto"): salva como `valorBase` NEGATIVO (`cost: 0`), então
  desconta direto do total do orçamento sem mexer no custo.
- Achei e corrigi um bug real no caminho: `calcProcedure`/`calcBudget`
  tratavam qualquer `valorBase` que não fosse **estritamente maior que
  zero** como "ainda não definido" (caindo pro valor sugerido, que
  ignoraria o desconto) — troquei a checagem pra `!== 0`, então um
  valor negativo agora é respeitado como um preço de verdade (o
  desconto), e zero continua significando "não definido".
- Cada item guarda de que tipo é (`kind: "custo"`/`"desconto"`), pra
  reabrir o modal certo ao clicar nele de novo pra editar; itens
  antigos sem esse campo (de um orçamento reaberto do Histórico, salvo
  antes dessa mudança) continuam funcionando — o app deduz o tipo pelo
  sinal do valor.

**2. Item "Tutoriais" no menu de Configurações, com um tutorial
específico por etapa** — reestruturei o tutorial guiado da sessão
anterior: em vez de uma lista única (`TOUR_STEPS`), agora existem 3
SEÇÕES independentes (`TOUR_SECTIONS`), cada uma um tutorial completo
por si só:
1. **Dados da clínica** (nome, logo, mais configurações)
2. **Procedimentos e materiais** (clique em Procedimentos → Custos/
   Materiais → aviso de valores base)
3. **Novo orçamento** (clique em Novo Orçamento → buscar procedimento
   → estrelas → agradecimento final)

`TOUR_STEPS` (usado pelo popup de boas-vindas e por "Rever tutorial",
que continuam disparando o tour INTEIRO, sem mudança nenhuma pro
Marcelo notar aí) agora é só a junção das 3 seções em sequência —
generalizei o motor (`OnboardingTour`) pra aceitar qualquer lista de
passos via prop (`steps`), então rodar só uma seção usa exatamente o
mesmo destaque/spotlight/avanço-por-clique de sempre, só que
terminando em "Concluir" no fim daquela seção específica, não do tour
inteiro.

A tela de Configurações ganhou um card novo, "Tutoriais" (adicionei
também como último grupo no menu lateral, `SETTINGS_NAV_GROUPS`),
listando as 3 etapas com descrição curta e um botão "Iniciar" em cada
uma — clicar chama `setActiveTourSteps(section.steps)` +
`setTourStep(0)`, e o tour roda normalmente a partir dali (inclusive
saindo da tela de Configurações sozinho quando o passo pede pra
clicar em algum outro lugar, como já funcionava antes).

**Cuidado que tomei**: a lista `SETTINGS_NAV_GROUPS` é avaliada assim
que o arquivo carrega (não é uma função) — colocar `TOUR_SECTIONS.map(...)`
direto dentro dela teria quebrado o app inteiro (TOUR_SECTIONS só é
definida bem mais adiante no arquivo, então nesse ponto ainda não
existiria — erro de "usar antes de inicializar"). Deixei os 3 links
desse grupo como uma lista fixa (só texto, sem depender de
TOUR_SECTIONS) — o card em si (que É uma função, roda só na hora de
desenhar a tela) usa TOUR_SECTIONS sem problema nenhum.

**Testado**: `npm run build` do frontend limpo (depois de corrigir o
erro de sintaxe que eu mesmo introduzi no meio da sessão — deixei
registrado no histórico de mensagens como um lembrete de que vale a
pena conferir array/objeto fechados direito depois de editar um bloco
grande). Conferi que todos os `data-tour` das 3 seções continuam
batendo com os elementos certos, e que nenhuma variável nova ficou
fora do escopo de onde devia estar. **Não testei clicando de
verdade** — vale conferir: os botões "+ Custo"/"+ Desconto" no Novo
Orçamento (incluindo editar um item já adicionado, dos dois tipos), e
a tela de Tutoriais em Configurações (cada um dos 3 botões "Iniciar",
conferindo se destaca os elementos certos e termina em "Concluir").

## Log anterior — orçamento sem forma de pagamento escolhida agora mostra aviso de valor à vista

Pedido do Marcelo: quando nenhuma forma de pagamento é selecionada no
orçamento, ele quer um texto explicando que aquele valor é baseado em
pagamento à vista (Pix ou dinheiro) e que outras formas de pagamento
podem ter taxas/encargos — em vez de simplesmente não deixar
salvar/exportar sem escolher uma forma.

**Antes**, não escolher forma de pagamento bloqueava totalmente salvar
e exportar (o botão "Salvar" ficava desabilitado, PDF/PNG/WhatsApp/
Impressão não geravam nada) — a tela só mostrava "Escolha a forma de
pagamento pra ver o valor a cobrar." e não tinha como seguir sem
escolher uma.

**Agora** (`app-frontend/src/App.jsx`, dentro de `SimulationPanel`):
- `paymentReady` passou a considerar "nenhuma forma escolhida"
  (`category === ""`) como um estado válido também — só continua
  bloqueando quando uma forma FOI escolhida mas está incompleta (ex:
  boleto sem a entrada mínima).
- A tela de Novo Orçamento, quando nada está selecionado, mostra um
  card com o valor total (à vista, sem taxa/imposto embutido) e o
  aviso: *"Nenhuma forma de pagamento escolhida — esse é o valor à
  vista (Pix/dinheiro). Selecione uma forma de pagamento acima se
  quiser calcular parcelamento, taxas ou repasse de encargos."* — no
  lugar do antigo placeholder tracejado "Escolha a forma de
  pagamento...".
- No modelo exportado (PDF/PNG/Impressão) e na mensagem de WhatsApp,
  a seção "Forma de pagamento" mostra esse texto (frase mais curta,
  version voltada pro paciente): *"Valor referente ao pagamento à
  vista (Pix ou dinheiro). Outras formas de pagamento podem ter
  acréscimo de taxas e encargos."* — no lugar de ficar vazio/"A
  combinar".
- No Histórico, o orçamento salvo sem forma escolhida aparece com
  `"À vista (Pix ou dinheiro)"` em vez de "—".

O texto do aviso ficou numa constante só (`DEFAULT_PAYMENT_NOTE`),
reaproveitada tanto no card da tela quanto na exportação — não são
frases idênticas (uma é mais longa/explicativa pra tela, a outra mais
enxuta pro documento do paciente), mas a ideia é a mesma. Se o
Marcelo quiser mudar o texto, é só me pedir — falei que não
precisava ser com essas palavras exatas, então usei minha própria
redação.

**Testado**: `npm run build` do frontend limpo. Conferi que a nova
constante e a lógica de `paymentReady` ficam dentro do escopo de
`SimulationPanel` (mesma checagem de sempre pra evitar a classe de
bug do `fileMenuOpen`). **Não testei clicando de verdade** — vale
conferir: criar um orçamento, não escolher forma de pagamento, e ver
se aparece o card com o aviso e se dá pra salvar/exportar/mandar por
WhatsApp normalmente nesse estado.

## Log anterior — "Forma - Valor" ainda quebrava linha (valor caía pra baixo)

O Marcelo mandou print mostrando que, mesmo já no formato "Forma -
Valor", a coluna de forma de pagamento no modelo exportado era
estreita demais — o texto quebrava linha no meio ("PIX / Dinheiro à
vista -" numa linha, "R$ 2.200,00" na de baixo), o que visualmente
parecia estar "embaixo" em vez de "ao lado".

**Corrigido** (`budgetTemplateCSS`, dentro de `app-frontend/src/App.jsx`):
- A coluna de "Forma de pagamento" dividia espaço 1:1.4 com a coluna
  de "Informações importantes" — troquei pra 1.6:1, dando bem mais
  largura pra forma de pagamento (que geralmente é só 1-3 linhas
  curtas) e um pouco menos pra informações importantes (que já é
  texto corrido/lista, se ajusta bem quebrando linha).
- Adicionei `white-space: nowrap` em cada linha de forma de pagamento
  — força cada linha "Forma - Valor" a ficar sempre numa linha só,
  nunca quebrando o valor pra linha de baixo.

Com as duas mudanças juntas, o texto some do teste que ele mandou
("PIX / Dinheiro à vista - R$ 2.200,00") cabe numa linha só com
folga.

**Testado**: `npm run build` do frontend limpo. **Não testei clicando
de verdade.** Se algum orçamento tiver uma forma de pagamento com
nome bem comprido (principalmente em pagamento dividido, com vários
parcelamentos), o `nowrap` garante que não quebra linha, mas em
teoria pode fazer o texto ultrapassar visualmente a coluna nesse
cenário extremo — vale ficar de olho nisso especificamente com
orçamentos de pagamento dividido com muitas partes.

## Log anterior — BUG CRÍTICO corrigido: preço final ignorava o "Valor" definido manualmente

O Marcelo reportou: configurar custos fixos, pró-labore, imposto etc
em Configurações fazia os preços finais mudarem sozinhos em
Procedimentos, e ele não queria isso — queria o preço sempre seguir o
"Valor" que ele define, com a MARGEM (%) se ajustando sozinha pra
refletir a realidade, e isso acontecendo por padrão (sem precisar
clicar no "Igualar" toda vez) — só mudando o preço de verdade se ele
mexer na margem manualmente.

**Achei a causa raiz, e é mais séria do que parecia**: dentro de
`calcProcedure`/`calcBudget` (`app-frontend/src/App.jsx`), existe uma
variável interna (`adjustmentBasis`/`basis`) usada pra calcular o
valor REALMENTE cobrado do paciente (o número grande na tela de Novo
Orçamento, o que vai pro PDF/WhatsApp, tudo) — e ela **sempre
preferia o "valor sugerido" recalculado a partir do custo + margem**
(`suggestedBase`), IGNORANDO o "Valor" (`valorBase`) que o
profissional define manualmente em Procedimentos, sempre que havia
algum custo cadastrado (ou seja, quase sempre). Isso significa que o
campo "Valor" só servia de referência visual na tabela — o preço
DE VERDADE cobrado no orçamento já vinha sendo recalculado sozinho a
cada mudança de custo há muito tempo, com ou sem o "Igualar", pra
QUALQUER procedimento com custo cadastrado. Corrigi pra sempre usar o
"Valor" como base (caindo pro sugerido só quando o profissional ainda
não definiu nenhum valor) — agora o preço cobrado segue exatamente o
que está em "Valor", nunca mais recalcula sozinho por causa de custo.

**Isso é uma mudança de comportamento em dinheiro real** — se algum
procedimento tinha um "Valor" definido que já estava desalinhado do
que o custo+margem sugeririam (bem provável, já que isso vinha sendo
mascarado há um tempo), o preço que vai aparecer/ser cobrado a partir
de agora pode ser DIFERENTE do que aparecia antes nas telas de Novo
Orçamento/exportação (o "Valor" da tabela de Procedimentos, esse
sempre foi o número certo — o que muda é o orçamento passar a
respeitar ele de verdade).

**Segunda parte — margem se ajustando sozinha** (a função "Igualar",
que já existia como botão manual, agora roda sozinha): criei um efeito
que dispara automaticamente sempre que o custo da hora clínica/
pró-labore (em Configurações) OU o preço de algum material do
catálogo mudar — ele recalcula a margem % de todo procedimento com
"Valor" definido, pra continuar batendo com a realidade, sem precisar
clicar em "Igualar tudo" manualmente. Só mexe na margem, nunca no
Valor. (Aproveitei pra fazer o "Igualar"/"Igualar tudo" manuais só
gravarem alguma coisa quando tem mudança de verdade — antes disso,
clicar neles sempre criava um checkpoint de desfazer e salvava de
novo, mesmo sem nada ter mudado.)

**Terceira parte — editar a margem manualmente muda o preço**: agora,
tanto na tabela de Procedimentos quanto no modal de edição, mudar a
margem (%) na mão recalcula o "Valor" na hora pra bater com essa nova
margem, dado o custo atual — é o único jeito do preço mudar
automaticamente, exatamente como pedido.

**Sobre o "imposto"**: conferi e ele nunca entrou nessa conta —
imposto só é descontado do valor recebido DEPOIS da venda (pra
calcular o lucro líquido/realizado), nunca mexeu no preço cobrado nem
no custo do procedimento. Então mexer no imposto não deveria (e
continua não devendo) alterar nenhum preço.

**Testado**: `npm run build` do frontend limpo, e conferi que não
sobrou nenhum outro lugar do código usando a lógica antiga
(`adjustmentBasis`/`basis` preferindo o sugerido). **Não testei
clicando de verdade — e essa é a mais importante de todas as sessões
pra testar com calma antes de confiar**, dado que mexe direto em
quanto dinheiro é cobrado:
1. Pega um procedimento com "Valor" já definido, confere o número.
2. Muda o custo da hora clínica ou o pró-labore em Configurações.
3. Confere se o "Valor" desse procedimento continua o mesmo (antes
   dessa correção, o preço cobrado num orçamento novo teria mudado
   mesmo com o Valor intacto — agora não deve mudar).
4. Adiciona esse procedimento a um Novo Orçamento e confere se o
   preço mostrado bate com o "Valor" da tabela.
5. Muda a margem (%) manualmente na tabela de Procedimentos e confere
   se o "Valor" recalcula sozinho.

## Log anterior — tutorial guiado (onboarding) pra usuários novos

O Marcelo pediu um tutorial dentro do próprio sistema pra ensinar
gente nova a usar o Precifica: popup de boas-vindas, depois um passo a
passo destacando os botões de verdade que a pessoa precisa clicar,
cobrindo Configurações (nome/logo), Procedimentos/Materiais
(explicando que são valores base, editáveis com o tempo), Simulação
de orçamento e as estrelas (nível do paciente), terminando com um
agradecimento e indicação do canal de Contato/Suporte.

**Como funciona** (tudo em `app-frontend/src/App.jsx`):

1. **Popup de boas-vindas** (`WelcomeModal`) — aparece automaticamente
   só UMA vez, na primeira vez que a conta carrega (controlado por uma
   chave nova salva na conta, `"onboarding"`, no mesmo esquema de
   `procedures`/`settings`). Tem dois botões: "Começar tour guiado"
   (inicia o tutorial) ou "Pular, quero explorar sozinho" (fecha sem
   iniciar — mas não trava a pessoa: dá pra rever o tutorial depois a
   qualquer momento, ver item 4).

2. **O tour em si** (`OnboardingTour` + lista `TOUR_STEPS`, 10 passos)
   — cada passo aponta pra um elemento REAL da tela (marcado no código
   com um atributo `data-tour="..."`: o campo Nome e o botão de Logo
   em Configurações, o menu lateral de Configurações, os botões
   "Procedimentos" e "+ Novo Orçamento" da navegação, o botão "Custos
   / Materiais", o alternador Procedimentos/Materiais dentro da
   Calculadora, o campo de busca de procedimento e as estrelas na tela
   de Novo Orçamento, e o ícone de conta no canto superior). O elemento
   apontado fica com uma borda destacada pulsando (spotlight, escurece
   o resto da tela ao redor) e um balão de texto explica o que é.
   - Passos que pedem uma ação (ex: "clique em Procedimentos", "clique
     em Custos/Materiais") esperam o clique de verdade no botão
     destacado pra avançar sozinho — SEM botão genérico de "Próximo"
     nesses (o próprio clique no botão real é o que avança), exatamente
     como pedido: "quero que o tutorial sempre destaque os botoes que é
     pra ser clicado pra iniciar a ação".
   - Passos só explicativos (nível do paciente/estrelas, aviso sobre
     valores base) têm um botão "Próximo" no próprio balão.
   - Em qualquer passo dá pra clicar em "Pular tutorial" (ou no X) pra
     sair a qualquer momento.
   - Funciona atravessando abas: passos que já têm uma aba definida
     (ex: o passo das estrelas precisa estar em "Novo Orçamento")
     trocam de aba sozinhos ao entrar nesse passo; os passos que
     ENSINAM a trocar de aba clicando num botão da navegação ficam sem
     essa troca automática de propósito — é o clique real da pessoa que
     deve mudar de aba.

3. **Conteúdo dos 10 passos** (nessa ordem): Nome da clínica → Logo →
   aviso de que dá pra configurar custo da hora/imposto/formas de
   pagamento no menu lateral → clique em Procedimentos → clique em
   Custos/Materiais → aviso de que os valores já vêm preenchidos como
   BASE, editáveis com o tempo → clique em Novo Orçamento → como
   buscar/adicionar procedimento → o que as estrelas fazem (+10% a
   +50% de margem por nível) → agradecimento final + "qualquer dúvida,
   sugestão ou bug, manda mensagem pelo Contato/Suporte".

4. **Rever tutorial** — novo item no menu de conta (ícone no canto
   superior direito), logo acima de "Contato / Suporte", que reinicia
   o tour a qualquer momento — útil tanto pra quem pulou a primeira
   vez quanto pra testar.

**Detalhe técnico**: o "spotlight" mede a posição do botão real na
tela (`getBoundingClientRect`) com um pequeno polling (pra dar tempo
da troca de aba renderizar o elemento novo) e reajusta sozinho se a
tela rolar ou a janela for redimensionada. Nos dois passos que apontam
pra um botão da navegação (que existe em dobro no código — uma versão
pra desktop, outra pra mobile), o tour escolhe automaticamente qual
das duas está realmente visível.

**Testado**: `npm run build` do frontend limpo. Fiz a mesma varredura
de escopo de sempre (todos os `data-tour` batem com os `target` da
lista `TOUR_STEPS`, e os novos componentes/estado ficam no lugar
certo — nada declarado dentro do escopo errado). **Não testei
clicando de verdade** — vale o Marcelo criar uma conta nova (ou usar
"Rever tutorial") e passar pelo tour inteiro conferindo se o destaque
encontra cada botão certinho, inclusive no celular.

## Log anterior — chave de licença travava pra sempre se a pessoa digitasse o próprio e-mail errado

O Marcelo reportou um caso real: uma pessoa ativou uma chave de
licença com o e-mail errado (digitou errado o próprio e-mail) e, ao
tentar de novo com o e-mail certo, a chave dizia "já foi utilizada" —
ela nunca ia conseguir confirmar aquele cadastro (o e-mail digitado
não existe/não é dela), então ficava travada pra sempre sem
intervenção manual.

**Causa raiz** (`src/routes/auth.js`, rota `/register`): quando
alguém começa um cadastro com uma chave, a chave já fica vinculada
àquela conta (`licenses.user_id`) na hora — mas o `status` da chave
só vira `"active"` depois que o e-mail é CONFIRMADO. Ou seja, uma
conta nunca confirmada deixa a chave com `user_id` preenchido mas
`status` ainda `"unused"` — só que o código de registro tratava
"chave com `user_id` preenchido" como "já usada" e bloqueava
qualquer nova tentativa, mesmo que aquela conta anterior nunca tivesse
sido confirmada (ou seja, mesmo que fosse só uma tentativa abandonada
por causa do erro de digitação).

**Corrigido** — arrumei o self-heal: agora, ao tentar registrar uma
chave que já tem `user_id` mas a conta vinculada **nunca confirmou o
e-mail**, o sistema entende que é a MESMA pessoa corrigindo uma
tentativa anterior (só quem tem a chave em mãos consegue chegar
nesse ponto, então é seguro assumir isso) — apaga a conta antiga
abandonada e deixa o cadastro novo seguir normalmente, sem precisar
de nenhuma ação manual do Marcelo. Só bloqueia de verdade quando a
conta vinculada já confirmou o e-mail (aí sim é uso genuíno da
chave).

**Camada extra de prevenção** (`app-frontend/src/screens/Register.jsx`):
adicionei um campo "Confirmar e-mail" na tela de ativação de chave
(só aparece quando o e-mail não vem travado — ou seja, só no fluxo
de chave avulsa, tipo a que gerou esse caso; no fluxo de assinatura
via Stripe o e-mail já vem fixo do checkout). Colar no campo é
bloqueado de propósito (`onPaste` desabilitado), pra obrigar a pessoa
a digitar de novo de verdade — colar o mesmo e-mail errado duas
vezes não pegaria o erro de digitação. Se os dois e-mails não
baterem, mostra erro ANTES de mandar pro servidor, evitando o
problema na origem na maioria dos casos.

**Resolvendo o caso específico que ele mandou agora**: depois desse
deploy, a MESMA pessoa pode simplesmente tentar ativar a chave de
novo com o e-mail certo — vai funcionar sozinho agora (o self-heal
apaga a tentativa antiga automaticamente). Se ele quiser resolver
manualmente antes/sem esperar o deploy, dá pra ir em Admin → aba
Usuários, achar a conta com o e-mail errado (ela aparece lá mesmo
sem confirmar o e-mail) e clicar em "Remover" — ou achar a chave na
aba Licenças e usar o botão "Excluir conta" ali mesmo; nos dois
casos a chave volta a ficar livre na hora.

**Testado**: `node --check` no `auth.js` (backend) e `npm run build`
do frontend, os dois limpos. **Não testei o fluxo completo de
verdade** (criar conta, não confirmar, tentar de novo com outro
e-mail) — vale o Marcelo confirmar com a própria pessoa que ficou
travada, já que é um caso real esperando resolução.

## Log anterior — logo de fundo sem distorção + maquininha fora do orçamento do cliente

O Marcelo mandou um novo PNG exportado mostrando dois problemas que eu
não tinha resolvido direito:

**1. Logo de fundo distorcida verticalmente, sem sangrar nas
laterais.** Causa real: eu tinha implementado a marca d'água como uma
tag `<img>` com `object-fit: cover` — só que o `html2canvas` (a
biblioteca que captura o HTML/CSS do modelo e transforma em
imagem/PDF) tem suporte incompleto/com bugs conhecidos pra
`object-fit` em `<img>`, e na prática ignorava a proporção,
espichando a imagem pra preencher a caixa inteira (exatamente a
distorção vertical que ele viu) — e por isso também não sangrava
direito nas bordas.
**Corrigido**: troquei a `<img>` por uma `<div>` com
`background-image` + `background-size: cover` (muito mais confiável
com `html2canvas`, que lida bem com `background-size` mas mal com
`object-fit`). `background-size: cover` nunca distorce — sempre
preserva a proporção original da imagem, só corta o excesso (topo/
base OU laterais, o que sobrar) pra cobrir a caixa inteira. A caixa
agora também acompanha a altura de verdade da página
(`top:0; bottom:0`, em vez de uma altura fixa em pixels) e sempre
estica 160px além de cada lateral (`left:-160px; right:-160px`),
garantindo que sempre sangra nas bordas esquerda/direita
independente da altura final da página ou da proporção da logo
enviada.

**2. Nome da maquininha aparecendo no orçamento do cliente.** Pedido
dele: quando a forma for crédito ou débito, o orçamento que vai pro
paciente (PDF/PNG/WhatsApp/Impressão) não deve mostrar o nome da
maquininha (ex: "Cartão de Débito · Maquininha padrão"), só o nome da
forma de pagamento (ex: "Cartão de Débito"). Tirei isso de
`buildPaymentLines()` (a função que monta as linhas "Forma - Valor"
usada nesses 4 lugares) — o nome da maquininha continua aparecendo
normalmente dentro do app (tela de Novo Orçamento, Histórico), que é
uso interno do profissional, só não vai mais pro material que o
paciente recebe.

**Testado**: `npm run build` do frontend limpo. **Não testei clicando
de verdade** (não tenho como abrir um navegador aqui pra gerar um
PDF/PNG de verdade e comparar visualmente) — vale o Marcelo exportar
de novo e conferir se a logo aparece proporcional (sem esticar) e
sangrando nas duas laterais, e se a forma de pagamento aparece limpa,
sem o nome da maquininha.

## Log anterior — trocado o arquivo de valores padrão (o anterior estava errado)

O Marcelo mandou o arquivo certo de procedimentos/custos (o anterior
tinha ido com os valores trocados). Comparei os dois: mesmos 37
procedimentos e mesmo catálogo de 61 materiais (nomes/ids batem), mas
36 dos 37 procedimentos têm `valorBase`/`valorMinimo`/`cost`/
`marginPercent` diferentes — ex: "Prótese Flexível" tinha margem
59,57% no arquivo errado, agora está 68,31%. Troquei o conteúdo de
`DEFAULT_PROCEDURES` por esse novo arquivo (mesmo processo de antes:
`app-frontend/src/App.jsx`); `DEFAULT_MATERIALS_CATALOG` não mudou
(preços dos materiais são idênticos nos dois arquivos).

"Prótese Total (arcada)" continua com `valorBase`/`valorMinimo` = 0
também no arquivo novo — não é diferença entre os dois arquivos, é
assim mesmo nos dois, então mantive como está (ver nota da sessão
anterior).

**Testado**: `npm run build` do frontend limpo. Conferi diretamente o
array embutido no código (rodando um trecho em Node) pra confirmar
que os 37 procedimentos e os valores batem exatamente com o arquivo
novo que ele mandou, e que a correção da corrida
`procedures`/`materialsCatalog` da sessão anterior continua intacta
(não mexi nela). **Não testei clicando de verdade.**

## Log anterior — corrigido: custos zerados ao abrir uma conta nova

O Marcelo testou (criando uma conta nova) e reportou que os valores
apareciam zerados. Investigando, achei uma causa concreta:

**Bug real encontrado e corrigido**: no carregamento inicial da conta
(`app-frontend/src/App.jsx`, efeito que roda uma vez no login), a
busca de `procedures` e a busca de `materialsCatalog` no banco
(`window.storage.get`) rodavam uma DEPOIS da outra, com
`setProcedures(list)` aplicado no meio das duas — entre a primeira e
a segunda busca terminarem, o React desenhava um quadro com os 37
procedimentos padrão já carregados mas o catálogo de materiais ainda
vazio (estado inicial `[]`). Como o custo desses procedimentos vem
dos materiais usados (não de um campo de custo direto), nesse
instante o "Custo" aparecia R$ 0,00 pra todo mundo — corrigia sozinho
assim que a segunda busca terminasse, mas dependendo da velocidade da
conexão dava pra notar (ou até persistir na tela se a pessoa não
recarregasse). Corrigi buscando os dois em paralelo
(`Promise.all`) e só aplicando os dois estados juntos, então esse
quadro intermediário não existe mais.

**Um valor que É zero de verdade, sem ser bug**: reparei que, dentro
do próprio JSON que o Marcelo mandou (o backup real da Dra.
Stephanie, usado como `DEFAULT_PROCEDURES`), o procedimento "Prótese
Total (arcada)" já vem com `valorMinimo: 0` e `valorBase: 0` — ou
seja, na conta de origem esse procedimento nunca teve um preço
preenchido (o mesmo procedimento aparece como R$ 0,00 no orçamento de
exemplo que ele mesmo exportou e mandou numa sessão anterior). Isso
não é um bug da minha parte — é o dado real, copiado fiel. Não mexi
nesse valor porque não é uma decisão minha pra tomar (não sei qual é
o preço certo desse procedimento) — se o Marcelo quiser, é só me
passar o valor e eu ajusto no `DEFAULT_PROCEDURES`.

**Testado**: `npm run build` do frontend limpo. **Não testei clicando
de verdade** — como não sei se o que ele viu foi esse quadro
intermediário (que já estava sendo corrigido sozinho) ou algo que
ficou preso na tela, vale ele testar de novo com uma conta nova e
conferir se os custos aparecem certos desde o primeiro instante. Se
ainda aparecer algo zerado, importante saber: foi TODO procedimento
zerado, ou só "Prótese Total (arcada)"? E teve algum aviso de "não
foi possível salvar/carregar" na tela?

## Log anterior — lista padrão de procedimentos/custos/materiais pra contas novas

O Marcelo mandou o JSON completo da conta da Dra. Stephanie Begliomini
(exportado pelo próprio botão "Exportar" de Procedimentos, formato
backup completo — 37 procedimentos + 61 materiais no catálogo) e
pediu pra virar a lista padrão de toda conta nova.

**O que mudou** (`app-frontend/src/App.jsx`):
- `DEFAULT_PROCEDURES` — antes era uma lista genérica embutida no
  código (~40 procedimentos com nomes/categorias comuns, SEM custo,
  SEM materiais, margem fixa de 40%). Substituí pelo conteúdo real do
  JSON que ele mandou — os 37 procedimentos da Dra. Stephanie, já com
  custo, categoria, duração, sessões, margem, valor mínimo/base e a
  lista de materiais usados em cada um.
- `DEFAULT_MATERIALS_CATALOG` — constante nova (não existia antes;
  conta nova nascia com catálogo de materiais vazio). Guarda os 61
  materiais do JSON (nome, marca, quantidade/unidade da embalagem,
  preço) — é o catálogo que os procedimentos de cima referenciam pra
  calcular custo automaticamente.
- Carregamento inicial (perto do fim do arquivo, onde a conta busca
  seus dados salvos): antes só `procedures` tinha fallback pro padrão
  quando a conta não tinha nada salvo ainda; `materialsCatalog`
  carregava vazio nesse caso. Agora os dois seguem a mesma regra —
  conta sem dado salvo (ou com array vazio salvo) recebe
  `DEFAULT_PROCEDURES`/`DEFAULT_MATERIALS_CATALOG` como ponto de
  partida.

**Importante**: isso só afeta conta **nova** (ou uma conta que nunca
salvou nada ainda) — não mexe em NADA de contas que já têm
procedimentos/materiais próprios salvos, incluindo a própria conta da
Dra. Stephanie (ela carrega do banco normalmente, não passa pelo
fallback).

Os dados foram copiados como vieram no JSON, sem alterar nenhum
valor — inclusive um caso de material com duas marcas cadastradas
("Babador Branco", AllPrime e Hospflex), que é exatamente o cenário
que a função de casar material+marca (`findCatalogItem`) já foi
desenhada pra tratar.

**Testado**: `npm run build` do frontend limpo (bundle cresceu ~40kB
por causa dos dados embutidos, esperado). Conferi que os IDs de
procedimentos, materiais do catálogo e materiais usados dentro de
cada procedimento não têm nenhuma duplicata. **Não testei clicando
de verdade** — vale o Marcelo criar uma conta de teste nova (ou
usar uma licença de teste) e conferir se ela já nasce com esses 37
procedimentos e o catálogo de materiais preenchidos e os custos
batendo certinho.

## Log anterior — ajustes visuais no modelo de orçamento exportado (PDF/PNG/WhatsApp/Impressão)

O Marcelo mandou 2 exportações (PNGs) de orçamentos reais — um com 7
procedimentos e pagamento dividido em 2 partes, outro com só 1
procedimento também dividido — e pediu 5 ajustes no modelo visual
(`buildBudgetTemplateBodyHTML`/`budgetTemplateCSS`, dentro de
`app-frontend/src/App.jsx`). Todos implementados:

1. **Tamanho de página consistente com A4** — `.bt-page` tinha só
   `width: 780px` sem altura definida, então a altura variava 100%
   com a quantidade de procedimentos (um orçamento de 1 item ficava
   bem mais "baixo" que um de 7, proporção nada parecida com A4). Virou
   `min-height: 1104px` (proporção 210×297mm pro width de 780px) +
   `display:flex; flex-direction:column` na página, com
   `.bt-footer { margin-top: auto }` — assim o rodapé é empurrado pro
   final da página quando o conteúdo é curto (looks like A4 completo),
   e a página só cresce além disso se o conteúdo realmente não couber
   (muitos procedimentos) — não tem como um canvas único virar
   paginação de verdade sem reescrever todo o pipeline de exportação,
   então pra orçamentos muito longos a página ainda vai ficar mais alta
   que uma A4 — mas pra o volume normal de procedimentos (como nos 2
   exemplos que ele mandou) já fica com a proporção certa.
2. **Rodapé desalinhado sem rede social** — o ícone de cada linha do
   rodapé (`.bt-footer-item`) tinha `align-items: flex-start` com um
   `margin-top: 2px` manual no SVG, ajustado sob medida pra quando
   existiam 2 linhas (telefone + Instagram). Sem Instagram, sobrava só
   1 linha e esse ajuste manual ficava errado. Troquei pra
   `align-items: center` (sem o margin-top manual) — cada ícone fica
   centralizado com o texto do lado, funciona igual com 1 ou 2 linhas.
3. **Linhas removidas perto de "Data do plano"/"Validade do plano"** —
   tirei a linha horizontal que ficava depois de "PLANO DE TRATAMENTO"
   (`.bt-hero-label::after`) e a linha vertical que separava essa
   coluna da coluna de datas (`border-left` em `.bt-meta-col`).
4. **Logo de fundo sempre sangrando nas laterais** — a marca d'água
   (`.bt-watermark`) usava `object-fit: contain` numa caixa 950×950,
   o que podia deixar a imagem mais estreita que a página dependendo
   da proporção da logo enviada (não garantia sangria). Troquei pra
   `object-fit: cover` numa caixa 1100×1100 (mais larga que os 780px
   da página) — sempre preenche e sempre ultrapassa as bordas
   esquerda/direita, cortada pelo `overflow: hidden` da página,
   independente da proporção da logo.
5. **Valor sempre ao lado da forma de pagamento** — antes a seção
   "Forma de pagamento" era um texto corrido só (`paymentLine`,
   string única). Virou uma lista (`paymentLines`, array — nova
   função `buildPaymentLines()` dentro de `SimulationPanel`), uma
   linha por forma, sempre no formato `Forma - Valor` (com o
   parcelamento junto quando aplicável: `Crédito 5x - R$ 540,54 em 5x
   de R$ 108,11`) — funciona igual tanto pra pagamento único quanto
   pra pagamento dividido em partes. Apliquei o mesmo formato na
   mensagem de WhatsApp (`buildShareText`), que antes usava outra
   formatação por parte. `buildBudgetTemplateBodyHTML` recebe agora
   `paymentLines` (array) em vez de `paymentLine` (string) — atualizei
   os dois lugares que chamam a função (exportação de verdade e o
   preview de exemplo em Configurações).

**Não mexi**: o `methodLabel` combinado que fica salvo no Histórico de
orçamentos (`"Dividido: PIX ... + Crédito ..."`) continua sendo
gerado por `buildSplitMethodLabel()`, separado de `buildPaymentLines()`
— são propósitos diferentes (uma linha de texto pro histórico vs.
uma lista formatada pro modelo exportado/WhatsApp).

**Testado**: `npm run build` do frontend limpo depois de cada bloco de
mudança CSS/HTML. **Não gerei um PDF/PNG de verdade nesta sessão pra
comparar visualmente** (não tenho como abrir um navegador de verdade
aqui) — vale o Marcelo exportar de novo um orçamento com poucos itens
e um com vários (inclusive com pagamento dividido) e conferir se: a
proporção da página ficou parecida com A4, o rodapé ficou alinhado
com e sem Instagram preenchido, as duas linhas sumiram, a logo de
fundo sangra nas laterais, e a forma de pagamento aparece com o valor
do lado em todas as linhas.

## Log anterior — "dividir pagamento" implementado

Implementei o próximo passo que estava combinado (ver seção antiga
logo abaixo, que descrevia o desenho — mantive ela como registro
histórico da investigação, mas o trabalho nela descrito **já foi
feito**). Resumo do que mudou, tudo em `app-frontend/src/App.jsx`:

**1. Motor de cálculo (baixo risco, refatoração pura)** — extraí a
fórmula de taxa/imposto/lucro que existia duplicada dentro de
`calcProcedure` e `calcBudget` pra uma função só,
`calcPaymentAmount(m, settings, taxPct, fixedAmount, basisAmount,
costShare)`. `calcProcedure`/`calcBudget` continuam se comportando
exatamente igual — só passaram a chamar essa função em vez de repetir
a conta inline. `calcBudget` também passou a devolver `basis`
(a soma da base de ajuste de margem, `sumBasis`) no objeto de retorno,
que antes ficava só interna — precisei dela pra ratear
proporcionalmente entre as partes do pagamento dividido.
Testado com `npm run build` limpo logo depois dessa refatoração,
**antes** de mexer em mais nada, justamente pra isolar o risco.

**2. `calcSplitPartAmount(amount, method, settings, calc)`** — nova
função que aplica a MESMA fórmula de cima a uma fração do valor total
do orçamento (uma "parte" do pagamento dividido). Rateia
proporcionalmente a base de margem (`calc.basis`) e o custo total
(`calc.totalCost`) pela fração que aquela parte representa do valor
total (`calc.listPrice`) — assim, cada parte protege a margem na
mesma proporção que o pagamento único protegeria.

**3. Estado e fluxo em `SimulationPanel`/`App`** — dois campos novos
levantados pro componente pai, no mesmo padrão de `category`/
`installments`: `budgetSplitMode` (bool) e `budgetSplitParts` (array
de `{ id, methodKey, amount }`, sem `amount` na última parte — ela é
sempre calculada como o restante). Restaurados ao reabrir um orçamento
salvo (`handleReopenBudget`, a partir de `entry.paymentSplit`) e
zerados ao limpar o orçamento (`handleClear`). Escolher uma forma de
pagamento normal desliga o modo dividido automaticamente, e
vice-versa — são mutuamente exclusivos.

**4. UI** — botão "Dividir pagamento" no topo do card de forma de
pagamento (tela de Novo Orçamento). Ligado, troca o seletor
categoria/parcelas/entrada por uma lista de partes: cada uma com
dropdown de forma (reaproveita as mesmas opções calculadas em
`calc.rows`, incluindo cada parcelamento de crédito/boleto como opção
separada, do jeito que o motor já organizava), campo de valor (só a
última parte fica travada, mostrando o restante), e uma linha com o
valor efetivamente cobrado daquela parte (já ajustado se a taxa for
repassada ao cliente), a taxa e o lucro. Botão "+ Adicionar forma de
pagamento" (divide o restante ao meio) e X pra remover uma parte
(removendo até sobrar 1, desliga o modo dividido sozinho). Card de
preço principal ganhou uma versão para o modo dividido — mostra o
total cobrado somado e um chip por parte.

**5. Salvamento** (`handleSaveBudget`) — grava `paymentSplit` (array
com forma, rótulo e valor cobrado de cada parte, já calculado — é um
retrato congelado, igual o `methodLabel`/`price` de sempre, não
recalcula se as configurações de taxa mudarem depois) e um
`methodLabel` combinado tipo `"Dividido: PIX / Dinheiro à vista (R$
500,00) + Crédito 3x (R$ 500,00 em 3x de R$ 166,67)"` — aparece
igual no histórico, já que a tela de histórico só exibe
`h.methodLabel` como texto (não precisou mexer lá). `price` vira a
soma do que é cobrado do paciente em todas as partes (importante:
pode ser MAIOR que o subtotal se alguma parte tiver "quem paga a taxa
= cliente", exatamente como já acontecia no pagamento único).

**6. Exportação (WhatsApp/PDF/PNG/Impressão)** — `buildShareText`
(mensagem de WhatsApp) e `buildExportCanvasFromTemplate` (modelo
HTML/CSS que vira PDF/PNG, usado também pelo botão Imprimir) agora
detectam o modo dividido e montam a linha de forma de pagamento
como texto combinado das partes, em vez de ficarem vazios/quebrados
(antes, com `category` vazio nesse modo, essas funções simplesmente
não geravam nada). Não precisei mexer no HTML/CSS do modelo em si —
o campo "Forma de pagamento" (`bt-payment-line`) já era um texto
livre, só ficou mais longo.

**O que ficou de fora, de propósito, pra não empilhar risco**:
- **Entrada (down payment)** por parte — o desenho original do
  Marcelo não pedia isso, só forma + valor por parte. Se ele quiser
  entrada num pagamento dividido, é um pedido novo.
- Nome da maquininha por parte (`activePreset.name`) — no pagamento
  único aparece ao lado da forma quando é crédito/débito; no dividido,
  cada chip mostra só o rótulo da forma (ex: "Crédito 3x"), sem o nome
  da maquininha. Fácil de adicionar depois se ele sentir falta.
- Validação de "pelo menos 1 real por parte" ou limites de valor — só
  valida que a soma não ultrapassa o total (parte final não pode ficar
  negativa).

**Testado**: `npm run build` do frontend limpo (rodei duas vezes — uma
logo após a refatoração do motor de cálculo, isolada, e outra depois
de toda a UI). Fiz uma varredura de escopo em todas as variáveis/
funções novas (`splitMethods`, `splitPartsResolved`, `splitValid`,
`paymentReady`, `toggleSplitMode`, etc.) confirmando que todas as
ocorrências ficam dentro do corpo de `SimulationPanel` — a mesma
classe de bug que quebrou a tela de Procedimentos numa sessão anterior
(variável usada fora do escopo onde foi declarada). **Não testei
clicando de verdade num navegador** — vale o Marcelo conferir:
1. Criar um orçamento, ativar "Dividir pagamento", testar
   adicionar/remover partes e trocar a forma de cada uma.
2. Salvar e conferir se aparece certo no Histórico.
3. Reabrir esse orçamento salvo e confirmar que volta com o modo
   dividido ativo e os valores certos.
4. Exportar por WhatsApp/PDF/PNG/Impressão com pagamento dividido e
   conferir se a linha de forma de pagamento sai legível.

## 🎯 Log de investigação anterior (mantido como registro — já implementado, ver seção de cima)

O Marcelo ficou sem créditos nesta conta e está upando esse projeto
numa conta nova bem por isso: **o próximo passo combinado é
implementar "dividir pagamento"** — dar pra dividir o valor de UM
orçamento em partes, cada parte com uma forma de pagamento diferente
(ex: metade no cartão de crédito, metade no Pix). **Importante**: não
é mostrar opções alternativas pro paciente escolher (isso já
existe, é a seleção normal de forma de pagamento) — é dividir o MESMO
valor em pedaços com formas diferentes, tipo um caixa de loja que
aceita parte no cartão e parte em dinheiro.

Não implementei ainda porque, ao investigar, o motor de cálculo de
forma de pagamento (`calcProcedure`/`calcBudget`/
`buildPaymentMethods`, dentro de `app-frontend/src/App.jsx`) é bem
mais entrelaçado do que parece de fora — vale ler essas três funções
com atenção antes de desenhar a solução. Resumo do que já sei:

- Hoje, a pessoa escolhe uma **categoria** (família: pix / débito /
  crédito / boleto / convênio / taxa personalizada) via `category` +
  `setCategory`, e dentro de crédito/boleto ainda tem **parcelas**
  (`installments`), **nome de máquina** (`activePreset`/
  `showMachineName`), **entrada mínima** (`downPayment`/
  `minDownPayment`, só aplicável pra crédito/boleto) e **quem paga a
  taxa** (`resolveFeePayerForMethod`, configurável em Formas de
  Pagamento, com uma regra especial de limite de parcelas pra virar
  "cliente paga" mesmo que o padrão seja "clínica paga"). Tudo isso
  junto define UMA linha (`row`) escolhida de dentro de
  `calc.rows` (calculado pra TODAS as formas de uma vez, em
  `calcProcedure`/`calcBudget`).
- Pra "dividir pagamento" funcionar de verdade, cada PARTE do valor
  precisa passar por essa mesma lógica de taxa/imposto, mas aplicada
  só à FRAÇÃO daquela parte — não ao valor total. Isso significa
  extrair a fórmula de cálculo de taxa/imposto de dentro de
  `calcProcedure`/`calcBudget` pra uma função reutilizável,
  parametrizada por um valor (em vez de sempre usar `sumBasis`/
  `sumListPrice` inteiros), pra poder chamar ela uma vez por parte.
- **Desenho sugerido** (validado em conversa com o Marcelo, mas NÃO
  implementado): uma lista de "partes do pagamento", cada uma com
  `{ methodKey, amount }` — a ÚLTIMA parte sempre calculada
  automaticamente como o restante (pra nunca dar um valor que não
  soma certinho com o total, sem precisar de validação chata). Um
  botão "+ Adicionar forma de pagamento" adiciona uma parte nova
  (dividindo o que sobra). Cada parte mostra sua forma de pagamento
  (dropdown, reaproveitando `buildPaymentMethods`) + o valor + o
  cálculo de taxa daquela parte, só que a soma sempre bate com o
  valor total do orçamento sem margem pra erro de conta.
- **Onde isso precisa aparecer depois de calculado**: a tela de criar
  orçamento (`SimulationPanel`), o histórico salvo (`budgetHistory`,
  hoje guarda `methodLabel` como uma string só — precisaria virar uma
  lista de partes, ou uma string combinada tipo "Dividido: Pix R$500 +
  Cartão de Crédito R$500"), o modelo de orçamento exportado (a seção
  "Forma de pagamento" do `buildBudgetTemplateBodyHTML`, que hoje
  mostra uma linha só), e a mensagem de WhatsApp
  (`handleShareWhatsApp`).
- **Risco a ter em mente**: essa é uma parte do sistema que lida com
  dinheiro de verdade — vale implementar com calma, testando cada
  parte antes de avançar pra próxima, em vez de tentar tudo de uma vez.



## Confirmado pelo Marcelo — bug do `fileMenuOpen`/tela branca em Procedimentos corrigido

O Marcelo testou depois da correção (ver detalhes técnicos logo
abaixo) e confirmou que a tela de Procedimentos voltou a abrir
normal. Fica só como registro técnico do que foi a causa raiz, caso
um bug parecido apareça de novo.

**Causa raiz**: na sessão anterior (a do botão "Arquivo" novo na tela
de Procedimentos), o botão ficou fisicamente no lugar certo, mas
referenciando nomes de variável que **não existiam naquele escopo**.
O plano original era: `ProcedureTable` recebendo `onExport`/
`onImportFile` como props e tendo seu próprio estado local
(`fileMenuOpen`/`fileInputRef`) — isso realmente foi declarado
corretamente dentro de `ProcedureTable`, só que **nunca chegou a ser
usado lá**. O botão "Arquivo" de verdade acabou sendo escrito
diretamente dentro do `App()` (o componente pai, que monta o
cabeçalho da aba Procedimentos ANTES de chamar `<ProcedureTable
.../>`), só que usando os MESMOS nomes de variável
(`fileMenuOpen`/`fileInputRef`/`onExport`/`onImportFile`) — que ali
dentro do `App()` **não existem** (essas só existem dentro de
`ProcedureTable`, outro escopo, ou dentro de `CalculadoraSection`,
outro escopo ainda). JavaScript não tem como saber disso em tempo de
build (o Vite não reclamou, o `npm run build` sempre passou limpo) —
só estoura em tempo de execução, exatamente quando o navegador tenta
renderizar aquele botão. Como React lança esse erro pra cima da árvore
inteira, a tela toda de Procedimentos quebrava (ficava em branco),
não só aquele botão.

**Por que minha cópia local não reproduzia o erro**: pedi pro Marcelo
o zip de verdade (GitHub) porque minha cópia local, por algum motivo,
não tinha esse mesmo bug — confirma que **sempre vale conferir o
arquivo real** quando o comportamento não bate com o esperado, em vez
de confiar na memória de sessões anteriores.

**Corrigido** (`app-frontend/src/App.jsx`):
- Adicionado o estado que faltava dentro de `App()`:
  `proceduresFileMenuOpen`/`setProceduresFileMenuOpen` (já existia uma
  ref órfã, `proceduresFileInputRef`, criada na sessão anterior mas
  nunca usada — sinal de que a intenção original era essa mesma,
  só não foi completada).
- O botão "Arquivo" da tela de Procedimentos agora usa os nomes
  certos: `proceduresFileMenuOpen`, `proceduresFileInputRef`,
  `handleExportProcedures`, `handleImportProceduresFile` (as funções
  de verdade que já existem em `App()`).
- Removida a declaração duplicada e nunca usada dentro de
  `ProcedureTable` (`onExport`/`onImportFile` nas props,
  `fileMenuOpen`/`fileInputRef` no estado local) — não fazia mais
  sentido mantida ali, já que o botão de verdade vive no `App()`.

**Testado**: `npm run build` do frontend limpo. Fiz uma checagem
manual, linha por linha, de TODAS as ocorrências de `fileMenuOpen`,
`fileInputRef`, `onExport` e `onImportFile` no arquivo inteiro, uma
por uma, confirmando que cada uma está no escopo certo (dentro de
`CalculadoraSection`, que tem sua própria cópia independente desses
nomes, sem conflito nenhum com os do `App()`) — não é só "o build
passou", é confirmação de que a árvore de escopos está consistente
de ponta a ponta. **Não testei clicando de verdade num navegador** —
mas dado que essa é EXATAMENTE a classe de erro que causou o problema
relatado, e a checagem de escopo foi feita com cuidado, tenho bastante
confiança que a página volta a abrir normalmente.

## Atualização anterior: exportação/importação virou um backup completo (procedimentos com TODOS os campos + catálogo de materiais) + botão "Arquivo" também na tela de Procedimentos

O Marcelo mandou um arquivo JSON de exemplo (catálogo de materiais +
uso por procedimento, do formato da calculadora avulsa externa) e
perguntou se tinha os valores/margem/etc. Não tinha — esse formato só
carrega material e custo, não o resto (Valor, Custo adicional,
Duração, Sessões). A partir disso, ele pediu pra unificar tudo num
exportar/importar só, com TUDO.

**Descoberta no caminho**: já existiam duas funções prontas,
`handleExportProcedures`/`handleImportProceduresFile`
(`app-frontend/src/App.jsx`) — que já exportavam o array de
`procedures` completo (todos os campos: nome, categoria, custo, custo
adicional, valor, margem, duração, sessões, materiais)! Só que **nunca
tinham sido conectadas em nenhum botão** — código morto, sobrando de
alguma sessão anterior.

**Implementado**:
- **`handleExportProcedures` reescrita** — agora exporta um backup
  completo de verdade: `{ procedures, materialsCatalog }` (não só os
  procedimentos, o catálogo de materiais/preços também).
- **`handleImportProceduresFile` reescrita** — detecta sozinho qual
  dos 3 formatos está importando:
  1. Backup completo (o que a exportação de cima gera) — substitui
     procedimentos E catálogo de uma vez.
  2. Array puro de procedimentos (backups bem antigos) — só substitui
     os procedimentos.
  3. Formato da calculadora avulsa externa (`{ DATA, state, catalog }`,
     sem os campos de valor/margem) — mesma lógica que já existia
     (casa por nome, cria o que não existe, atualiza materiais do que
     já existe).
- **Botão "Arquivo" novo na própria tela de Procedimentos** (não só
  dentro de Custos/Materiais) — mesmo dropdown Exportar/Importar. Pra
  abrir espaço, **removi o botão de "redefinir largura das colunas"**
  dali (pedido explícito do Marcelo) — a função continua existindo no
  código, só sem botão nenhum chamando ela, caso precise voltar.
- O botão "Arquivo" que já existia dentro de Custos/Materiais agora
  usa essas MESMAS funções (antes usava um formato só de materiais,
  mais limitado) — os dois lugares fazem exatamente a mesma coisa
  agora.

**Sobre o pedido de "deixar como padrão pra conta nova"**: o Marcelo
disse que vai me mandar o JSON completo da própria conta dele (agora
que o botão "Exportar" gera exatamente esse formato rico) pra eu usar
como base do que uma conta nova já vem com preenchido — ainda não
chegou esse arquivo nesta sessão, fica pendente pra próxima vez que
ele mandar.

**Testado**: `npm run build` do frontend limpo, sem erros. **Não
testei manualmente** — vale o Marcelo conferir se exportar de
Procedimentos e de Custos/Materiais realmente geram o mesmo arquivo
completo, e se importar esse arquivo de volta restaura tudo certinho.

**PENDENTE — dividir pagamento em partes com formas diferentes**: o
Marcelo também pediu, na mesma sessão, pra dar pra dividir o
pagamento de UM orçamento em partes com formas diferentes (ex:
metade no cartão, metade no pix) — não é mostrar opções alternativas
pro paciente escolher, é dividir o valor mesmo. Investiguei o motor
de cálculo de forma de pagamento (`calcProcedure`/`calcBudget`,
`buildPaymentMethods`) e é bem mais entrelaçado do que parece por
fora: a "categoria" escolhida hoje é uma família (pix/débito/crédito/
boleto/convênio), e dentro de crédito/boleto tem parcelas, nome de
máquina, entrada mínima, e quem paga a taxa — tudo interligado.
Decidi NÃO tentar encaixar isso apressado no fim desta sessão (risco
alto de entregar algo com bug bem numa parte sensível, que lida com
dinheiro de verdade). Fica como próximo passo claro: dá pra desenhar
o formato (uma lista de "partes do pagamento", cada uma com forma +
valor, a última calculada automática como o restante pra sempre
somar certinho) e implementar com calma numa sessão focada nisso.

## Atualização anterior: cor do orçamento desacoplada da cor do sistema + atalhos de teclado (Esc, setas)

Dois pedidos do Marcelo:

**1. A cor do orçamento estava mudando a cor das abas do sistema
também — sem ter sido pedido.** Causa: numa sessão anterior, o
seletor de cor do orçamento foi implementado reaproveitando um campo
que já existia (`headerColor`), só que esse campo já estava ligado ao
realce do menu de abas do próprio app (`TabNav`) — então escolher uma
cor pro orçamento mudava as duas coisas juntas, sem querer.

**Corrigido**: as duas coisas agora são totalmente independentes.
- `TabNav` voltou a usar sempre a cor padrão fixa do sistema
  (`#292524`, ou `#71717a` no modo escuro) — não lê mais nenhuma
  configuração, é fixo mesmo.
- O campo da cor do orçamento foi renomeado de `headerColor` pra
  **`budgetAccentColor`** — nome de propósito bem separado, pra não
  repetir essa confusão no futuro. Só afeta o cabeçalho/tabela/total/
  rodapé/marca d'água do orçamento exportado, nada mais.
- Rótulo na tela de Configurações também mudou de "Cor de destaque"
  pra **"Cor do orçamento"**, e o texto embaixo agora deixa explícito:
  "Não muda nenhuma cor do resto do sistema."

**2. Atalhos de teclado** (`app-frontend/src/App.jsx`, novo
`useEffect` de `keydown`):
- **Esc** → volta pro Dashboard.
- **Seta esquerda/direita** → troca de aba, na mesma ordem visual do
  menu de cima (Dashboard → Novo Orçamento → Pacientes →
  Procedimentos → Histórico → volta pro Dashboard, circular nos dois
  sentidos).
- Só dispara quando o foco NÃO está num campo de digitação
  (input/textarea/select/conteúdo editável) — senão apertar seta pra
  mover o cursor dentro de um campo de texto, ou Esc pra limpar ele,
  ia trocar de tela por acidente.
- **Limitação conhecida, documentada no código**: não verifica se
  algum modal/popup está aberto no momento — se um modal também
  escuta Esc pra se fechar, as duas coisas podem acontecer juntas
  (fecha o modal E troca pro Dashboard). Checar isso de forma
  genérica exigiria mexer em cada modal do sistema individualmente,
  o que ficou fora do escopo dessa entrega — se isso incomodar na
  prática, é um ajuste pontual pra fazer depois.

**Testado**: `npm run build` do frontend limpo, sem erros. **Não
testei manualmente** os atalhos de teclado num navegador de verdade
(nem a limitação dos modais, nem se Esc/setas se comportam bem
enquanto a "Apresentação ao paciente" está ativa) — vale o Marcelo
confirmar, principalmente se algum modal aberto reage mal ao Esc.

## Atualização anterior: BUG CORRIGIDO — logo do consultório não estava sendo salva de verdade (faltava comprimir antes de enviar) + círculo decorativo removido do orçamento

O Marcelo reparou que, ao trocar a logo, ela "sumia" quando a página
atualizava — sinal claro de que nunca tinha sido salva no banco de
verdade, só ficava na tela até recarregar.

**Causa raiz encontrada**: a foto de PERFIL (a circular, no cabeçalho
do app) sempre passou por um recorte que também comprime a imagem
antes de salvar (`ImageCropModal`, já existia). A logo do
CONSULTÓRIO, que eu implementei numa sessão anterior, fazia upload
DIRETO do arquivo, sem nenhuma compressão — se a pessoa enviasse uma
foto em resolução alta (bem comum, a maioria nem sabe o tamanho do
arquivo que está mandando), o texto em base64 resultante ficava
grande o suficiente pra estourar o limite de tamanho da requisição
(`express.json({ limit: "3mb" })`, em `server.js`) — e o salvamento
falhava **calado**, sem avisar nada, porque o código só tinha um
`try/catch` vazio ali.

**Corrigido** (`app-frontend/src/App.jsx`):
- Função nova, `compressLogoImage()` — redimensiona a logo pra no
  máximo 600px no lado maior (de sobra pro tamanho que ela aparece:
  pequena no cabeçalho, ampliada mas quase transparente na marca
  d'água) e recomprime como **WebP** em vez de manter o formato
  original — mantém a transparência (como o PNG), só que costuma
  pesar uma fração do tamanho no mesmo nível de qualidade visual.
- `handleClinicLogoUpload` agora chama essa função antes de salvar, e
  **avisa a pessoa de verdade** se algo der errado (mensagem em
  vermelho embaixo do botão de upload), em vez de falhar calado.
- Sobre "apagar a logo antiga ao trocar": não existe um arquivo
  separado guardado em disco pra "sobrar" — a logo vive como um único
  campo de texto (base64) dentro das configurações da conta, então
  trocar o valor já substitui o anterior sozinho, sem deixar rastro
  nenhum ocupando espaço à parte. O que estava faltando de verdade era
  só a compressão, não uma limpeza de arquivo órfão.

**Círculo decorativo removido** — o Marcelo pediu pra tirar o círculo
translúcido do canto superior direito do orçamento exportado (o
`.bt-blob`, um enfeite visual que eu tinha adicionado desde o
protótipo original). Removido tanto do código de produção quanto do
protótipo publicado (mesmo link de antes).

**Testado**: `npm run build` do frontend limpo, sem erros. **Não
testei manualmente** o upload de uma logo grande de verdade pra
confirmar que ela realmente encolhe e salva — mas a lógica (mesma
técnica de canvas que a foto de perfil já usa com sucesso, só sem o
recorte circular) é sólida; vale o Marcelo testar com uma foto
grande de propósito (tipo uma foto tirada direto do celular, sem
redimensionar) pra confirmar que agora salva e não desaparece mais.

## Atualização anterior: painel admin mostra quantos dias faltam pra próxima cobrança do Railway

O Marcelo perguntou se dava pra mostrar no painel admin quantos dias
faltam pra vencer o Railway. Conversamos antes de implementar: o
Railway tem dois modos bem diferentes —
- **Teste grátis**: $5 de crédito que expira em 30 dias OU quando o
  crédito acaba, o que vier primeiro (uma corrida entre tempo e
  gasto).
- **Plano pago (Hobby/Pro)**: cobrança mensal recorrente normal, num
  dia fixo do ciclo — sem corrida nenhuma.

O Marcelo confirmou que está no teste, quase acabando, e vai assinar
o Hobby — ou seja, a partir de agora passa a ser só uma cobrança
mensal recorrente. Isso simplifica bastante: não precisa de nenhuma
integração com a API do Railway (que não temos acesso mesmo) — é só
saber EM QUE DIA DO MÊS a cobrança cai e calcular quantos dias faltam
pra próxima ocorrência daquele dia.

**Implementado** (`AdminDashboard.jsx`), tudo no navegador
(`localStorage`), sem precisar de backend — só o Marcelo usa o painel
admin:
- `RailwayBillingCard` — card novo no topo da aba "Visão Geral". Na
  primeira vez, pede pra escolher o dia do mês (1 a 31) que o Railway
  cobra; depois disso, mostra "Faltam X dias — DD/MM/AAAA" sozinho,
  recalculado a cada visita (`daysUntilNextOccurrence()` acha a
  próxima ocorrência daquele dia a partir de hoje — se já passou nesse
  mês, pula pro mês seguinte). Fica vermelho quando faltam 3 dias ou
  menos. Botão "Alterar dia" pra corrigir, se precisar.
- Guardado em `localStorage` (`admin_railway_billing_day`) — não
  precisa redigitar todo mês, já que é uma data recorrente calculada
  a partir só do DIA, não de uma data fixa que ficaria velha.

**Testado**: `npm run build` do frontend limpo, sem erros.

## Histórico resumido (atualizações mais antigas que 5 sessões atrás)

O Marcelo pediu pra parar de guardar o detalhe completo de tudo — a
partir de agora, só as últimas 5 atualizações ficam com a explicação
inteira (acima). O que já estava aqui de sessões mais antigas virou
só uma lista de títulos, pra não perder o rastro de quando algo foi
feito sem inflar o arquivo:

- marca d'água com o logo no orçamento (aparece só quando existe logo enviada, bem maior que a página, cortando nas bordas, 12% de opacidade) + seletor de cor extrai a cor do logo automaticamente + código hexadecimal só aparece num popover ao clicar no quadradinho
- logo enviada pelo consultório não fica mais presa num círculo, no orçamento exportado — mostra a imagem direto, sem cortar, mantendo a proporção original
- pacote principal do site 53% menor (809KB → 376KB) — Chart.js, html2canvas e o painel admin passaram a carregar sob demanda (import dinâmico), não mais sempre junto do pacote principal + logo do cabeçalho 94% menor (nova versão de 96px em vez de reaproveitar a de 512px)
- modelo novo do orçamento exportado (logo, especialidade, cor escolhida pelo usuário, redes sociais) — motor trocado de canvas manual pra HTML/CSS de verdade + PNG/PDF/Imprimir/WhatsApp todos usando o motor novo
- rótulos "Próxima cobrança dia X" (cartão Stripe) vs "Expira em" (licença dada pelo admin) corrigidos em Gerenciar Assinatura, usando confirmação síncrona direto na API do Stripe
- painel admin — modo escuro corrigido de vez (causa raiz era classe "dark" e "bg-stone-50" no mesmo elemento) + logo antes do nome + tooltips nas métricas + chave de licença escondida atrás de um clique + ações agrupadas num menu só
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

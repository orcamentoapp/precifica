# HANDOFF — Precifica

> Este arquivo existe porque os créditos da conta Claude usada até aqui
> acabaram. Se você é uma instância nova do Claude lendo isso: leia este
> documento inteiro antes de fazer qualquer coisa. Ele te dá o contexto
> completo do que já foi construído, o que está testado, e o que falta.

## Atualização mais recente: altura do cabeçalho + backup movido pra Procedimentos (só a lista)

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

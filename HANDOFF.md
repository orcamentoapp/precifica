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

## Atualização mais recente: cor do orçamento desacoplada da cor do sistema + atalhos de teclado (Esc, setas)

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

## Atualização anterior: marca d'água com o logo no orçamento + seletor de cor extrai a cor do logo + código hexadecimal só aparece ao clicar + textos de ajuda no upload + reordenação dos campos

Cinco pedidos do Marcelo em cima da entrega anterior:

**1. Texto de ajuda no upload do logo** — embaixo do botão de
enviar/trocar logo, agora explica: preferir fundo transparente (PNG)
pra não aparecer dentro de um quadrado colorido, e tamanho recomendado
de pelo menos 300×300px.

**2. Reordenação dos campos em Configurações** — "Cor de destaque" e
o botão "Visualizar modelo de orçamento" agora ficam logo depois do
upload do logo (antes ficavam no fim da lista, depois de
Nome/Especialidade/Endereço/Telefone/Instagram/Validade).

**3. Seletor de cor: extrair a cor do logo enviado** — botão novo
"Usar cor do logo" dentro do seletor (só aparece se já tiver uma logo
enviada). Função nova, `extractDominantColorFromImage()` — desenha a
logo escondida num canvas pequeno (80×80, só pra pegar a distribuição
de cor, não precisa da resolução real), ignora pixels quase brancos/
pretos/cinza (normalmente fundo ou contorno, não a cor de marca),
agrupa o resto por faixa de matiz, e devolve a média da faixa mais
comum. Se a logo for preto-e-branco (nenhum pixel colorido sobra),
cai de volta pra média geral de tudo, sem travar.

**4. Código hexadecimal escondido, só aparece ao clicar** — antes o
código (`#005580`) ficava sempre visível do lado do quadradinho de
cor; agora o quadradinho é só um botão, e clicar nele abre um popover
pequeno com o código + o seletor de cor nativo do navegador + o botão
"Usar cor do logo" (fecha ao clicar fora). Componente novo,
`ColorAccentPicker`, substituindo o bloco de cor que estava direto
dentro do `ProfileSettingsPage`.

**5. Marca d'água com o logo, no orçamento exportado** — só aparece
quando existe uma logo enviada (sem logo, sem marca d'água — não
faria sentido com o ícone padrão do dente). Centralizada, bem maior
que a própria página (950×950px numa página de 780px de largura — a
intenção é cortar mesmo nas bordas), com 12% de opacidade (as
"85-90% de transparência" que o Marcelo pediu). Tecnicamente, isso
exigiu acertar a ordem de empilhamento (`z-index`) de quase todo o
template: a marca d'água entra com `z-index: 0`, e cada bloco de
conteúdo real (cabeçalho, tabela, total, informações, rodapé,
fechamento) ganhou `position: relative; z-index: 1` explícito — sem
isso, alguns desses blocos (que não tinham posicionamento nenhum
antes) ficariam ATRÁS da marca d'água em vez de na frente, por causa
de como o CSS empilha elemento posicionado vs. não-posicionado por
padrão.

**Testado**: `npm run build` do frontend limpo, sem erros. Também
atualizei o protótipo publicado (mesmo link de antes) com um `<img>`
de marca d'água ligado ao mesmo botão "Simular logo enviada" que já
existia, pra dar pra comparar visualmente. **Não consegui ver o
resultado renderizado de verdade** (nem no protótipo nem no app) —
só escrevi e revisei o código; a extração de cor em particular
(`extractDominantColorFromImage`) é a peça que eu confio menos sem
ver rodando de verdade, já que depende de como cada logo específica
está distribuída em cor — vale o Marcelo testar com a própria logo
real e confirmar que a cor extraída faz sentido, e que a marca d'água
ficou com a proporção/opacidade boas.

## Atualização anterior: logo enviada pelo consultório não fica mais presa num círculo, no orçamento exportado

O Marcelo reparou que a logo do consultório (a que ele acabou de poder
enviar em Configurações) aparecia cortada dentro de um círculo no
orçamento exportado — fazia sentido pro ícone padrão (dente), mas não
pra uma logo de verdade que a pessoa envia, que pode ter qualquer
formato.

**Corrigido** (`buildBudgetTemplateBodyHTML`/CSS em
`app-frontend/src/App.jsx`): agora são dois casos diferentes —
- **Sem logo enviada** (usando o ícone padrão do dente): continua
  dentro do círculo de sempre, com o fundo suave — faz sentido pra um
  ícone pensado pra caber ali.
- **Com logo enviada**: mostra a imagem direto, sem círculo, sem
  cortar — só limitada a uma altura máxima (56px) e largura máxima
  (180px), mantendo a proporção original da imagem (`object-fit:
  contain`), no mesmo canto superior esquerdo de sempre.

Também atualizei o protótipo publicado com essa mudança (mesmo link
de antes), com um novo botão "Simular logo enviada" pra comparar os
dois estados lado a lado antes de fechar como certo.

**Testado**: `npm run build` do frontend limpo, sem erros.

## Histórico resumido (atualizações mais antigas que 5 sessões atrás)

O Marcelo pediu pra parar de guardar o detalhe completo de tudo — a
partir de agora, só as últimas 5 atualizações ficam com a explicação
inteira (acima). O que já estava aqui de sessões mais antigas virou
só uma lista de títulos, pra não perder o rastro de quando algo foi
feito sem inflar o arquivo:

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

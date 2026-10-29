require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("./db");

async function migrate() {
  console.log("Criando/atualizando tabelas (se ainda não existirem)...");

  // Tabela única de usuários — cobre tanto o admin quanto os clientes.
  // O campo "role" decide se a pessoa cai no painel admin ou no app normal.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', -- 'user' | 'admin'
      name TEXT,
      clinic_name TEXT,
      status TEXT NOT NULL DEFAULT 'active', -- active | blocked
      email_verified BOOLEAN NOT NULL DEFAULT false,
      email_verify_code TEXT,
      email_verify_expires_at TIMESTAMPTZ,
      password_reset_code TEXT,
      password_reset_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Licenças: podem existir "soltas" (geradas pelo admin, ainda não usadas
  // por ninguém) até serem reivindicadas no cadastro por um usuário.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS licenses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      code TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'unused', -- unused | active | revoked | expired
      activated_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      last_validated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_licenses_code ON licenses(code);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);

  // Adiciona a coluna "type" se ainda não existir — funciona tanto pra quem
  // está instalando do zero quanto pra quem já tinha o banco criado antes
  // dessa mudança (é seguro rodar de novo, não duplica nem apaga nada).
  await pool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'monthly';`);

  // Campos pra integração com o Stripe (pagamento automático da licença).
  // stripe_subscription_id liga a licença a uma assinatura, pra saber qual
  // licença renovar quando chegar o webhook da cobrança do mês seguinte.
  await pool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;`);
  await pool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_licenses_stripe_subscription ON licenses(stripe_subscription_id);`);

  // Guarda o e-mail de quem comprou (só pra licenças geradas automaticamente
  // pelo pagamento — chaves geradas manualmente pelo admin continuam sem essa
  // trava, podendo ser usadas com qualquer e-mail). Quando preenchido, o
  // cadastro só aceita esse mesmo e-mail pra ativar a chave.
  await pool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS buyer_email TEXT;`);

  // De onde a licença veio: 'admin' (gerada manualmente no painel), 'stripe'
  // (assinatura por cartão) ou 'mercadopago' (Pix/Boleto/cartão avulso).
  // Licenças criadas antes dessa coluna existir ficam com valor NULL — o
  // painel admin infere a origem delas por outros campos (buyer_email,
  // stripe_subscription_id) como fallback, então não precisa de backfill.
  await pool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS source TEXT;`);

  // Guarda se a pessoa já pediu pra cancelar a renovação automática — sem
  // isso, o botão "Cancelar assinatura" reaparecia toda vez que a página
  // recarregava, mesmo depois de já ter cancelado de verdade no Stripe,
  // porque o resultado do cancelamento só vivia no estado do React (se
  // perdia ao dar F5). Reseta pra false sempre que uma assinatura nova é
  // criada/renovada, pra não ficar preso num cancelamento antigo.
  await pool.query(
    `ALTER TABLE licenses ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;`
  );

  // Duas colunas novas pro painel de métricas do admin (Visão Geral):
  // trial_started_at marca quando uma licença NASCEU como teste grátis —
  // guardado separado do "type" porque o type muda pra "monthly"/"annual"
  // assim que o trial converte (invoice.paid), então sem isso não daria
  // pra calcular taxa de conversão trial→pago depois da conversão já ter
  // acontecido. cancelled_at marca quando a pessoa pediu cancelamento (ou
  // teve a assinatura revogada por disputa de cobrança) — sem isso não dá
  // pra saber QUANTOS cancelamentos aconteceram num período, só se está
  // cancelado ou não agora.
  await pool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP;`);
  await pool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;`);

  // Anotação livre e opcional que o admin pode escrever ao gerar uma chave
  // manualmente — pra quem é (nome/clínica) e por qual motivo (ex: "cortesia
  // pro Dr. Fulano", "reposição por bug no pagamento"). Só é preenchida na
  // criação da chave; licenças de compra (Stripe) nunca têm isso.
  await pool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS description TEXT;`);

  // Registra os eventos do Stripe já processados, pra nunca gerar/renovar a
  // licença duas vezes se o mesmo webhook chegar mais de uma vez (o Stripe
  // garante "pelo menos uma entrega", ou seja, pode repetir).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stripe_processed_events (
      event_id TEXT PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Dados do simulador (procedimentos, taxas/configurações, histórico de
  // orçamentos) — antes ficavam só no localStorage do navegador (não
  // vinculados à conta); agora ficam aqui, por usuário. ON DELETE CASCADE é
  // de propósito: se a conta for excluída, essas linhas somem junto
  // automaticamente, sem precisar de nenhuma lógica extra no código.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, key)
    );
  `);

  // Último login (só quando a pessoa de fato entra com e-mail/senha) e
  // último "visto" (atualizado a cada requisição autenticada que ela faz
  // enquanto usa o app — ver middleware/auth.js) — usados no painel admin
  // pra mostrar "Último acesso" e o indicador "Online agora".
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;`);

  // Configurações globais do sistema, editáveis pelo painel admin (por
  // enquanto só o preço mensal/anual — ver src/utils/pricingSettings.js).
  // Chave/valor simples, um par por linha; quando uma chave não existe
  // aqui, o código cai pra variável de ambiente e, se essa também não
  // existir, pro valor padrão fixo — dá pra nunca ter mexido nisso e o
  // sistema continua funcionando do jeito que já funcionava antes dessa
  // tabela existir.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // ===== Revisão de segurança (29/10/2026) — tudo idempotente =====

  // Bloco A — segurança de conta.
  // token_version: entra dentro do token de login; ao bloquear a conta ou
  // trocar/redefinir a senha, sobe +1 — e todo token antigo (de qualquer
  // aparelho) deixa de valer na hora (ver middleware/auth.js).
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;`);
  // Contadores de erro dos códigos de 6 dígitos — depois de 5 erros o
  // código é invalidado (precisa pedir outro), o que torna inviável
  // adivinhar por tentativa e erro.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_attempts INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_attempts INTEGER NOT NULL DEFAULT 0;`);
  // Trava temporária da conta depois de muitas senhas erradas seguidas.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;`);
  // Verificação em duas etapas (só usada pelo admin hoje).
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret TEXT;`);
  // Bloco D — LGPD: quando e qual versão dos Termos/Política a pessoa aceitou.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT;`);
  // Aceite feito na tela de compra (antes de existir conta) — guardado na
  // licença e copiado pro usuário quando ele ativa a conta.
  await pool.query(`ALTER TABLE licenses ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;`);

  // Bloco B — dados do cliente.
  // version: controle de "outro aparelho salvou antes de você" — cada
  // gravação sobe +1; quem tenta salvar em cima de uma versão velha recebe
  // 409 em vez de apagar sem querer o que o outro aparelho salvou.
  await pool.query(`ALTER TABLE app_data ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;`);
  // Orçamentos agora são 1 linha por orçamento (antes: um único JSON com
  // todos, cortado em 200). Sem limite de quantidade, e salvar 1 orçamento
  // não reenvia o histórico inteiro.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS budgets (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_budgets_user_created ON budgets(user_id, created_at DESC);`);

  // Bloco C — cobrança.
  // Uma assinatura do Stripe = no máximo UMA licença (evita licença/e-mail
  // em dobro quando webhook e confirmação chegam juntos). Se já existirem
  // duplicadas no banco de produção, o índice não pode ser criado — nesse
  // caso só avisa no log (o código também usa uma trava por assinatura,
  // então continua protegido daqui pra frente mesmo sem o índice).
  try {
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uniq_licenses_stripe_subscription
       ON licenses(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;`
    );
  } catch (err) {
    console.error(
      "AVISO: não deu pra criar o índice único de stripe_subscription_id (provavelmente já existem licenças duplicadas pra mesma assinatura). Rode no banco: SELECT stripe_subscription_id, count(*) FROM licenses WHERE stripe_subscription_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;",
      err.message
    );
  }
  // Cartões que já usaram o teste grátis (impressão digital do cartão no
  // Stripe — não é o número do cartão, é só um identificador). Impede a
  // mesma pessoa de fazer vários testes grátis trocando só o e-mail.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trial_card_fingerprints (
      fingerprint TEXT PRIMARY KEY,
      subscription_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  console.log("Tabelas prontas.");

  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (bootstrapEmail && bootstrapPassword) {
    const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [bootstrapEmail]);
    if (!rows[0]) {
      const hash = await bcrypt.hash(bootstrapPassword, 10);
      await pool.query(
        `INSERT INTO users (email, password_hash, role, email_verified, name)
         VALUES ($1, $2, 'admin', true, 'Administrador')`,
        [bootstrapEmail, hash]
      );
      console.log(`Admin inicial criado: ${bootstrapEmail}`);
    } else {
      console.log(`Usuário "${bootstrapEmail}" já existia, nada foi alterado.`);
    }
  } else {
    console.log(
      "ADMIN_BOOTSTRAP_EMAIL/ADMIN_BOOTSTRAP_PASSWORD não definidos — nenhum admin foi criado automaticamente."
    );
  }

  // Recuperação de emergência da verificação em duas etapas do admin (perdeu
  // o celular): defina ADMIN_RESET_2FA_EMAIL no Railway com o e-mail do
  // admin, deixe redeployar (a verificação dessa conta é desligada no boot)
  // e depois APAGUE a variável. Só funciona pra conta de admin.
  const reset2fa = (process.env.ADMIN_RESET_2FA_EMAIL || "").trim().toLowerCase();
  if (reset2fa) {
    const { rowCount } = await pool.query(
      "UPDATE users SET totp_enabled = false, totp_secret = NULL, totp_pending_secret = NULL WHERE lower(email) = $1 AND role = 'admin'",
      [reset2fa]
    );
    console.log(
      rowCount
        ? `⚠️ Verificação em duas etapas DESLIGADA pra ${reset2fa} (ADMIN_RESET_2FA_EMAIL). Remova essa variável do Railway agora.`
        : `ADMIN_RESET_2FA_EMAIL definido, mas nenhum admin com esse e-mail foi encontrado.`
    );
  }

  console.log("Migração concluída com sucesso.");
}

// Roda sozinha toda vez que o servidor sobe (server.js chama migrate()) —
// não precisa mais trocar o Start Command do Railway pra rodar à mão.
// Continua dando pra rodar direto também: `npm run migrate`.
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Erro ao migrar o banco:", err);
      process.exit(1);
    });
}

module.exports = { migrate };

require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("./db");

async function migrate() {
  console.log("Criando tabelas (se ainda não existirem)...");

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

  console.log("Migração concluída com sucesso.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Erro ao migrar o banco:", err);
  process.exit(1);
});

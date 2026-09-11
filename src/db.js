const { Pool } = require("pg");

// Railway (e a maioria dos provedores de Postgres em nuvem) exige SSL.
// Em desenvolvimento local com um banco sem SSL, isso é ignorado.
const useSSL = /railway|render|supabase|neon|amazonaws/i.test(process.env.DATABASE_URL || "");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("Erro inesperado no pool do Postgres:", err);
});

module.exports = pool;

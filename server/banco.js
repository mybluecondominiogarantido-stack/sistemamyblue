'use strict';
/*
 * Acesso ao banco Postgres.
 *  - Com DATABASE_URL (Supabase, Railway Postgres, qualquer Postgres): usa o driver "pg".
 *  - Sem DATABASE_URL: usa um Postgres embutido (PGlite), gravado na pasta DATA_DIR.
 *    Serve para rodar no computador e nos testes, sem instalar nada.
 * Os dois falam o mesmo SQL (Postgres), então o restante do sistema não muda.
 *
 * API: q(sql, params) → { rows, n }, um(sql, params) → linha | null,
 *      exec(sql) para vários comandos, tx(async (t) => …) para transações.
 */
const fs = require('fs');
const path = require('path');

function normalizarLinha(r) {
  // PGlite devolve bytea como Uint8Array; o driver pg devolve Buffer
  for (const k in r) if (r[k] instanceof Uint8Array && !Buffer.isBuffer(r[k])) r[k] = Buffer.from(r[k]);
  return r;
}

function api(executor) {
  const q = async (sql, params = []) => {
    const r = await executor(sql, params);
    return { rows: r.rows.map(normalizarLinha), n: r.affectedRows ?? r.rowCount ?? 0 };
  };
  return { q, um: async (sql, params) => (await q(sql, params)).rows[0] || null };
}

async function abrirPg(url) {
  const { Pool, types } = require('pg');
  types.setTypeParser(20, (v) => Number(v)); // bigint (COUNT, SUM) como número
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /sslmode=disable/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DB_CONEXOES) || 10,
    // Supabase e Railway exigem SSL; o certificado do pooler não é de uma CA pública
    ssl: local ? false : { rejectUnauthorized: false },
  });
  pool.on('error', (e) => console.error('[banco] conexão perdida:', e.message));
  await pool.query('SELECT 1');
  const base = api((sql, p) => pool.query(sql, p));
  return {
    tipo: 'postgres',
    ...base,
    exec: (sql) => pool.query(sql),
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn(api((sql, p) => c.query(sql, p)));
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    fechar: () => pool.end(),
  };
}

async function abrirEmbutido(pasta) {
  const { PGlite } = await import('@electric-sql/pglite');
  let pg;
  if (pasta === ':memoria:') pg = new PGlite();
  else {
    fs.mkdirSync(pasta, { recursive: true });
    pg = new PGlite(pasta);
  }
  await pg.waitReady;
  // PGlite atende um comando por vez: enfileira para transações não se misturarem
  let fila = Promise.resolve();
  const emFila = (fn) => {
    const p = fila.then(fn, fn);
    fila = p.catch(() => {});
    return p;
  };
  const base = api((sql, p) => emFila(() => pg.query(sql, p)));
  return {
    tipo: 'embutido',
    ...base,
    exec: (sql) => emFila(() => pg.exec(sql)),
    tx: (fn) => emFila(() => pg.transaction((t) => fn(api((sql, p) => t.query(sql, p))))),
    fechar: () => pg.close(),
  };
}

async function conectar(cfg) {
  if (cfg.databaseUrl) return abrirPg(cfg.databaseUrl);
  return abrirEmbutido(cfg.dataDir === ':memoria:' ? ':memoria:' : path.join(cfg.dataDir, 'postgres'));
}

module.exports = { conectar };

'use strict';
const { conectar } = require('./banco');
const { SETORES, MODULOS } = require('./catalogo');

/* Esquema em Postgres. Os HTMLs das ferramentas também ficam no banco (coluna conteudo),
   então o servidor não precisa de disco persistente. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'usuario' CHECK (papel IN ('admin','usuario')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  trocar_senha BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);

CREATE TABLE IF NOT EXISTS setores (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS modulos (
  slug TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  setor_id INTEGER REFERENCES setores(id) ON DELETE SET NULL,
  icone TEXT NOT NULL DEFAULT 'app',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  versao_id INTEGER,
  armazenamento TEXT NOT NULL DEFAULT 'navegador' CHECK (armazenamento IN ('navegador','usuario','compartilhado')),
  adaptador TEXT CHECK (adaptador IS NULL OR adaptador IN ('gas-linhas','gas-objetos')),
  fonte_dados TEXT NOT NULL DEFAULT 'google' CHECK (fonte_dados IN ('google','interno')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS modulo_versoes (
  id SERIAL PRIMARY KEY,
  modulo_slug TEXT NOT NULL REFERENCES modulos(slug) ON DELETE CASCADE,
  conteudo BYTEA NOT NULL,
  nome_original TEXT,
  tamanho INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  enviado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_versoes_modulo ON modulo_versoes(modulo_slug);

CREATE TABLE IF NOT EXISTS permissoes (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  modulo_slug TEXT NOT NULL REFERENCES modulos(slug) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, modulo_slug)
);

-- localStorage das ferramentas guardado no servidor (escopo '*' = equipe, 'u:<id>' = usuário)
CREATE TABLE IF NOT EXISTS armazenamento (
  modulo_slug TEXT NOT NULL REFERENCES modulos(slug) ON DELETE CASCADE,
  escopo TEXT NOT NULL,
  chave TEXT NOT NULL,
  valor TEXT NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  PRIMARY KEY (modulo_slug, escopo, chave)
);

-- "planilhas" internas (substituem as abas do Google Sheets)
CREATE TABLE IF NOT EXISTS colecoes (
  modulo_slug TEXT NOT NULL REFERENCES modulos(slug) ON DELETE CASCADE,
  colecao TEXT NOT NULL,
  cabecalho JSONB,
  PRIMARY KEY (modulo_slug, colecao)
);

CREATE TABLE IF NOT EXISTS registros (
  rid SERIAL PRIMARY KEY,
  modulo_slug TEXT NOT NULL REFERENCES modulos(slug) ON DELETE CASCADE,
  colecao TEXT NOT NULL,
  item_id TEXT NOT NULL,
  dados JSONB NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  UNIQUE (modulo_slug, colecao, item_id)
);

CREATE TABLE IF NOT EXISTS auditoria (
  id SERIAL PRIMARY KEY,
  quando TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_email TEXT,
  acao TEXT NOT NULL,
  modulo_slug TEXT,
  detalhe JSONB,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_auditoria_quando ON auditoria(quando);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id, acao);
`;

/* Supabase publica o schema "public" pela API dele (PostgREST). Com RLS ligado e sem
   políticas, ninguém lê nem grava por lá; o portal conecta como dono das tabelas e não é afetado. */
const TABELAS = ['usuarios', 'sessoes', 'setores', 'modulos', 'modulo_versoes', 'permissoes', 'armazenamento', 'colecoes', 'registros', 'auditoria'];
const RLS = TABELAS.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`).join(';\n');

async function abrir(cfg) {
  const db = await conectar(cfg);
  await db.tx(async (t) => {
    // evita que duas instâncias subindo juntas criem o esquema ao mesmo tempo
    await t.q('SELECT pg_advisory_xact_lock(7240513)');
    for (const cmd of (SCHEMA + ';' + RLS).split(';').map((s) => s.trim()).filter(Boolean)) await t.q(cmd);
    await semear(t);
  });
  return db;
}

/* Cria setores e módulos do catálogo uma única vez (nunca sobrescreve edições do admin). */
async function semear(t) {
  if (await t.um("SELECT 1 FROM auditoria WHERE acao = 'catalogo_semeado' LIMIT 1")) return;
  for (const s of SETORES) await t.q('INSERT INTO setores (nome, ordem) VALUES ($1, $2) ON CONFLICT (nome) DO NOTHING', [s.nome, s.ordem]);
  for (const m of MODULOS) {
    const setor = await t.um('SELECT id FROM setores WHERE nome = $1', [m.setor]);
    await t.q(`INSERT INTO modulos (slug, nome, descricao, setor_id, icone, ordem, armazenamento, adaptador, fonte_dados, config)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb) ON CONFLICT (slug) DO NOTHING`, [
      m.slug, m.nome, m.descricao || '', setor ? setor.id : null, m.icone || 'app', m.ordem || 0,
      m.armazenamento || 'navegador', m.adaptador || null, m.fonte_dados || 'google', JSON.stringify(m.config || {}),
    ]);
  }
  await t.q("INSERT INTO auditoria (acao, detalhe) VALUES ('catalogo_semeado', $1::jsonb)", [JSON.stringify({ modulos: MODULOS.map((m) => m.slug) })]);
}

module.exports = { abrir, SCHEMA, RLS };

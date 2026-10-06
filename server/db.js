'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { SETORES, MODULOS } = require('./catalogo');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'usuario' CHECK (papel IN ('admin','usuario')),
  ativo INTEGER NOT NULL DEFAULT 1,
  trocar_senha INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_login TEXT
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);

CREATE TABLE IF NOT EXISTS setores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  ativo INTEGER NOT NULL DEFAULT 1,
  versao_id INTEGER,
  armazenamento TEXT NOT NULL DEFAULT 'navegador' CHECK (armazenamento IN ('navegador','usuario','compartilhado')),
  adaptador TEXT CHECK (adaptador IS NULL OR adaptador IN ('gas-linhas','gas-objetos')),
  fonte_dados TEXT NOT NULL DEFAULT 'google' CHECK (fonte_dados IN ('google','interno')),
  config TEXT NOT NULL DEFAULT '{}',
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modulo_versoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo_slug TEXT NOT NULL REFERENCES modulos(slug) ON DELETE CASCADE,
  arquivo TEXT NOT NULL,
  nome_original TEXT,
  tamanho INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  enviado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

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
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  PRIMARY KEY (modulo_slug, escopo, chave)
);

-- registros das "planilhas" internas (substituem as abas do Google Sheets)
CREATE TABLE IF NOT EXISTS colecoes (
  modulo_slug TEXT NOT NULL REFERENCES modulos(slug) ON DELETE CASCADE,
  colecao TEXT NOT NULL,
  cabecalho TEXT,
  PRIMARY KEY (modulo_slug, colecao)
);

CREATE TABLE IF NOT EXISTS registros (
  rid INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo_slug TEXT NOT NULL REFERENCES modulos(slug) ON DELETE CASCADE,
  colecao TEXT NOT NULL,
  item_id TEXT NOT NULL,
  dados TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  UNIQUE (modulo_slug, colecao, item_id)
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando TEXT NOT NULL DEFAULT (datetime('now')),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_email TEXT,
  acao TEXT NOT NULL,
  modulo_slug TEXT,
  detalhe TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_auditoria_quando ON auditoria(quando);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id, acao);
`;

function abrir(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'myblue.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  semear(db);
  return db;
}

/* Cria setores e módulos do catálogo que ainda não existem (nunca sobrescreve edições do admin). */
function semear(db) {
  const insSetor = db.prepare('INSERT OR IGNORE INTO setores (nome, ordem) VALUES (?, ?)');
  const idSetor = db.prepare('SELECT id FROM setores WHERE nome = ?');
  const existeModulo = db.prepare('SELECT 1 FROM modulos WHERE slug = ?');
  const insModulo = db.prepare(`INSERT INTO modulos
    (slug, nome, descricao, setor_id, icone, ordem, armazenamento, adaptador, fonte_dados, config)
    VALUES (@slug, @nome, @descricao, @setor_id, @icone, @ordem, @armazenamento, @adaptador, @fonte_dados, @config)`);
  const marcados = db.prepare("SELECT 1 FROM auditoria WHERE acao = 'catalogo_semeado' LIMIT 1").get();
  db.transaction(() => {
    if (!marcados) for (const s of SETORES) insSetor.run(s.nome, s.ordem);
    for (const m of MODULOS) {
      if (marcados || existeModulo.get(m.slug)) continue;
      const setor = idSetor.get(m.setor);
      insModulo.run({
        slug: m.slug, nome: m.nome, descricao: m.descricao || '', setor_id: setor ? setor.id : null,
        icone: m.icone || 'app', ordem: m.ordem || 0, armazenamento: m.armazenamento || 'navegador',
        adaptador: m.adaptador || null, fonte_dados: m.fonte_dados || 'google', config: JSON.stringify(m.config || {}),
      });
    }
    if (!marcados) db.prepare("INSERT INTO auditoria (acao, detalhe) VALUES ('catalogo_semeado', ?)").run(JSON.stringify({ modulos: MODULOS.map((m) => m.slug) }));
  })();
}

module.exports = { abrir };

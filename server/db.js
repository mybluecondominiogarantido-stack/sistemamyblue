'use strict';
const { conectar } = require('./banco');
const { SETORES, SETORES_RENOMEADOS, MODULOS, CHAVES_DE_SISTEMA } = require('./catalogo');

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
  adaptador TEXT,
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

-- ===== Central de Tickets =====
-- quem faz parte de cada setor (o líder distribui os tickets do setor)
CREATE TABLE IF NOT EXISTS setor_membros (
  setor_id INTEGER NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  lider BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (setor_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_setor_membros_usuario ON setor_membros(usuario_id);

-- tipos de demanda de cada setor, com prazo (SLA) e prioridade sugerida
CREATE TABLE IF NOT EXISTS ticket_categorias (
  id SERIAL PRIMARY KEY,
  setor_id INTEGER NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  prazo_horas INTEGER,
  prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta','urgente')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (setor_id, nome)
);

CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  setor_id INTEGER NOT NULL REFERENCES setores(id),
  categoria_id INTEGER REFERENCES ticket_categorias(id) ON DELETE SET NULL,
  prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta','urgente')),
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','em_andamento','aguardando','resolvido','cancelado')),
  solicitante_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  prazo TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  primeira_resposta_em TIMESTAMPTZ,
  resolvido_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tickets_setor ON tickets(setor_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_responsavel ON tickets(responsavel_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_solicitante ON tickets(solicitante_id);

-- linha do tempo: comentários, notas internas e cada mudança (status, responsável, setor…)
CREATE TABLE IF NOT EXISTS ticket_eventos (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  texto TEXT,
  interno BOOLEAN NOT NULL DEFAULT FALSE,
  detalhe JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_eventos_ticket ON ticket_eventos(ticket_id, id);

CREATE TABLE IF NOT EXISTS ticket_anexos (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  conteudo BYTEA NOT NULL,
  interno BOOLEAN NOT NULL DEFAULT FALSE,
  enviado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_anexos_ticket ON ticket_anexos(ticket_id);

-- carteira de condomínios (aba Carteira, a 1ª carga vem do CSV da planilha)
CREATE TABLE IF NOT EXISTS condominios (
  id SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'ATIVO',
  comarca TEXT NOT NULL DEFAULT '',
  vencimento TEXT NOT NULL DEFAULT '',
  analista_cobranca TEXT NOT NULL DEFAULT '',
  analista_extrajudicial TEXT NOT NULL DEFAULT '',
  assistente_credito TEXT NOT NULL DEFAULT '',
  administradora TEXT NOT NULL DEFAULT '',
  forma_envio TEXT NOT NULL DEFAULT '',
  inicio_contrato DATE,
  razao_social TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL DEFAULT '',
  observacoes TEXT NOT NULL DEFAULT '',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

-- avisos para cada pessoa (sino do portal)
CREATE TABLE IF NOT EXISTS notificacoes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  texto TEXT,
  lida BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario ON notificacoes(usuario_id, id);
`;

/* Supabase publica o schema "public" pela API dele (PostgREST). Com RLS ligado e sem
   políticas, ninguém lê nem grava por lá; o portal conecta como dono das tabelas e não é afetado. */
const TABELAS = ['usuarios', 'sessoes', 'setores', 'modulos', 'modulo_versoes', 'permissoes', 'armazenamento', 'colecoes', 'registros', 'auditoria',
  'setor_membros', 'ticket_categorias', 'tickets', 'ticket_eventos', 'ticket_anexos', 'notificacoes', 'condominios'];
const RLS = TABELAS.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`).join(';\n');

/* Ajustes em bancos já existentes (rodam a cada início e não fazem nada se já estiverem aplicados). */
const AJUSTES = `
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS supervisor_tickets BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE modulos DROP CONSTRAINT IF EXISTS modulos_adaptador_check;
ALTER TABLE modulos ADD CONSTRAINT modulos_adaptador_check CHECK (adaptador IS NULL OR adaptador IN ('gas-linhas','gas-objetos','gas-posicional'))
`;

async function abrir(cfg) {
  const db = await conectar(cfg);
  await db.tx(async (t) => {
    // evita que duas instâncias subindo juntas criem o esquema ao mesmo tempo
    await t.q('SELECT pg_advisory_xact_lock(7240513)');
    for (const cmd of (SCHEMA + ';' + RLS + ';' + AJUSTES).split(';').map((s) => s.trim()).filter(Boolean)) await t.q(cmd);
    await semear(t);
    await semearSetores(t);
    await sincronizarCatalogo(t);
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

/* Lista oficial de setores (Central de Tickets), aplicada uma única vez em bancos já instalados:
   renomeia os antigos, cria os que faltam e acerta a ordem. Depois disso o admin manda. */
async function semearSetores(t) {
  if (await t.um("SELECT 1 FROM auditoria WHERE acao = 'setores_oficiais' LIMIT 1")) return;
  for (const [antigo, novo] of Object.entries(SETORES_RENOMEADOS)) {
    if (!(await t.um('SELECT 1 FROM setores WHERE nome = $1', [novo]))) await t.q('UPDATE setores SET nome = $1 WHERE nome = $2', [novo, antigo]);
  }
  for (const s of SETORES) {
    await t.q('INSERT INTO setores (nome, ordem) VALUES ($1, $2) ON CONFLICT (nome) DO UPDATE SET ordem = EXCLUDED.ordem', [s.nome, s.ordem]);
  }
  await t.q("INSERT INTO auditoria (acao, detalhe) VALUES ('setores_oficiais', $1::jsonb)", [JSON.stringify({ setores: SETORES.map((s) => s.nome) })]);
}

/* Leva para os módulos já cadastrados a configuração técnica do catálogo (pontos de ligação com
   a planilha interna, colunas, tipo de planilha). Não toca em nome, setor, ícone, permissões nem
   nas escolhas do administrador (onde ficam os dados, fonte, chaves locais). */
async function sincronizarCatalogo(t) {
  for (const m of MODULOS) {
    const sistema = {};
    for (const k of CHAVES_DE_SISTEMA) if (m.config && m.config[k] !== undefined) sistema[k] = m.config[k];
    await t.q(`UPDATE modulos SET adaptador = COALESCE(adaptador, $2), config = config || $3::jsonb WHERE slug = $1`,
      [m.slug, m.adaptador || null, JSON.stringify(sistema)]);
  }
}

module.exports = { abrir, SCHEMA, RLS };

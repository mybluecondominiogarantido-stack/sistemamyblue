'use strict';
const { conectar } = require('./banco');
const { SETORES, SETORES_RENOMEADOS, MODULOS, CHAVES_DE_SISTEMA } = require('./catalogo');
const { semearPolitica } = require('./credito/banco');

/* Esquema em Postgres. Os HTMLs das ferramentas também ficam no banco (coluna conteudo),
   então o servidor não precisa de disco persistente. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'usuario' CHECK (papel IN ('admin','coordenador','supervisor','usuario')),
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

-- documentos das ferramentas feitas como artefato do Claude (dados NULL = apagado)
CREATE SEQUENCE IF NOT EXISTS documentos_seq;
CREATE TABLE IF NOT EXISTS documentos (
  modulo_slug TEXT NOT NULL REFERENCES modulos(slug) ON DELETE CASCADE,
  colecao TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  dados JSONB,
  seq BIGINT NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  PRIMARY KEY (modulo_slug, colecao, doc_id)
);
CREATE INDEX IF NOT EXISTS idx_documentos_seq ON documentos(modulo_slug, seq);

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

-- ===== Central de Links =====
-- título e subtítulo da página (uma linha só)
CREATE TABLE IF NOT EXISTS links_pagina (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  titulo TEXT NOT NULL DEFAULT 'Central de Links',
  subtitulo TEXT NOT NULL DEFAULT '',
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS links (
  id SERIAL PRIMARY KEY,
  grupo TEXT NOT NULL DEFAULT '',
  titulo TEXT NOT NULL,
  url TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  icone TEXT NOT NULL DEFAULT 'link',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

-- campanhas do marketing: cada uma vale a partir da data de início até começar a próxima
CREATE TABLE IF NOT EXISTS links_campanhas (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  inicio DATE NOT NULL,
  escurecer INTEGER NOT NULL DEFAULT 35 CHECK (escurecer BETWEEN 0 AND 85),
  fundo BYTEA,
  fundo_tipo TEXT,
  fundo_celular BYTEA,
  fundo_celular_tipo TEXT,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_links_campanhas_inicio ON links_campanhas(inicio);

-- cópia das bibliotecas que as ferramentas carregam de CDNs (server/rotas/cdn.js)
CREATE TABLE IF NOT EXISTS cdn_cache (
  url TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  conteudo BYTEA NOT NULL,
  tamanho INTEGER NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- vídeos tutoriais (o catálogo, com título e para quem é, fica em server/tutoriais.js)
-- quem edita o quê na Carteira (regras definidas em Ferramentas do setor e Módulos e dados, sem linha = padrão do portal)
CREATE TABLE IF NOT EXISTS regras_acesso (
  chave TEXT PRIMARY KEY,
  regra JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tutoriais (
  slug TEXT PRIMARY KEY,
  video BYTEA,
  tamanho INTEGER,
  duracao_s INTEGER,
  legendas TEXT,
  enviado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- demonstrativos de comissão enviados pela ferramenta de Comissionamento (uma linha por versão)
CREATE TABLE IF NOT EXISTS comissao_relatorios (
  id SERIAL PRIMARY KEY,
  modulo_slug TEXT NOT NULL,
  competencia TEXT NOT NULL,
  chave TEXT NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cargo TEXT NOT NULL DEFAULT '',
  setor TEXT NOT NULL DEFAULT '',
  valor NUMERIC(14,2) NOT NULL DEFAULT 0,
  html TEXT NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  enviado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  substituido_em TIMESTAMPTZ,
  aberto_em TIMESTAMPTZ,
  ciente_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_comissao_rel_usuario ON comissao_relatorios(usuario_id, competencia);
CREATE INDEX IF NOT EXISTS idx_comissao_rel_chave ON comissao_relatorios(modulo_slug, competencia, chave);

-- quem mais pode ler cada demonstrativo: líderes da pessoa (supervisão, coordenação, gerência) e a diretoria
CREATE TABLE IF NOT EXISTS comissao_leitores (
  relatorio_id INTEGER NOT NULL REFERENCES comissao_relatorios(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL DEFAULT 'lider',
  PRIMARY KEY (relatorio_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_comissao_leitores_usuario ON comissao_leitores(usuario_id);

-- planilhas que a gestão da comissão pede a cada pessoa no mês (Crédito, Cobrança, metas…) e o arquivo que ela envia
CREATE TABLE IF NOT EXISTS comissao_planilhas (
  id SERIAL PRIMARY KEY,
  modulo_slug TEXT NOT NULL,
  competencia TEXT NOT NULL,
  chave TEXT NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT '',
  titulo TEXT NOT NULL DEFAULT '',
  nome TEXT NOT NULL DEFAULT '',
  pedido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  pedido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelado_em TIMESTAMPTZ,
  arquivo_nome TEXT,
  arquivo_tipo TEXT,
  arquivo BYTEA,
  tamanho INTEGER,
  enviado_em TIMESTAMPTZ,
  importado_em TIMESTAMPTZ,
  importado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  avisado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_comissao_plan_usuario ON comissao_planilhas(usuario_id, competencia);
CREATE INDEX IF NOT EXISTS idx_comissao_plan_chave ON comissao_planilhas(modulo_slug, competencia, chave);

-- Análise de Crédito: política versionada (parâmetros + faixas), executivos, análises e o que sai delas.
-- O motor de regras (server/credito/motor.js) grava o resultado em analises.resultado_motor, e as tabelas
-- de unidades, lançamentos, exclusões e alertas guardam o detalhe para auditoria e para o painel.
CREATE TABLE IF NOT EXISTS parametros_politica (
  versao TEXT PRIMARY KEY,
  descricao TEXT NOT NULL DEFAULT '',
  parametros JSONB NOT NULL,
  ativa BOOLEAN NOT NULL DEFAULT FALSE,
  vigente_desde TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_politica_ativa ON parametros_politica (ativa) WHERE ativa;

CREATE TABLE IF NOT EXISTS faixas_precificacao (
  versao TEXT NOT NULL REFERENCES parametros_politica(versao) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  ate NUMERIC(6,2) NOT NULL,
  taxa_adm NUMERIC(6,2) NOT NULL,
  PRIMARY KEY (versao, ordem)
);

-- executivos de negócios: cadastrados no portal (nomes reais não ficam no código). boleto vazio = regra da política
CREATE TABLE IF NOT EXISTS executivos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  email TEXT,
  uf TEXT NOT NULL DEFAULT '',
  regiao TEXT NOT NULL DEFAULT '',
  boleto NUMERIC(8,2),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- contador do protocolo AC-AAAA-MM-DD-NN (um por dia, nunca repete)
CREATE TABLE IF NOT EXISTS analise_protocolos (
  dia DATE PRIMARY KEY,
  ultimo INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analises (
  id SERIAL PRIMARY KEY,
  protocolo TEXT UNIQUE,
  origem_id INTEGER REFERENCES analises(id) ON DELETE SET NULL,
  motivo_reanalise TEXT,
  etapa TEXT NOT NULL DEFAULT 'rascunho' CHECK (etapa IN ('rascunho','pendencia','fila','em_analise','diretoria','validada','enviada','cancelada')),
  resultado TEXT CHECK (resultado IN ('aprovada','ressalvas','reprovada','pendente')),
  condominio TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  tipo_contratacao TEXT CHECK (tipo_contratacao IN ('nova','portabilidade')),
  executivo_id INTEGER REFERENCES executivos(id) ON DELETE SET NULL,
  solicitante_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  analista_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  formulario JSONB NOT NULL DEFAULT '{}'::jsonb,
  dados_analista JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultado_motor JSONB,
  politica_versao TEXT REFERENCES parametros_politica(versao),
  inad_media NUMERIC(9,4),
  taxa_adm NUMERIC(6,2),
  boleto NUMERIC(8,2),
  uh_escopo NUMERIC(10,4),
  receita_liquida NUMERIC(14,2),
  exposicao NUMERIC(14,2),
  documentacao_completa_em TIMESTAMPTZ,
  assumida_em TIMESTAMPTZ,
  prazo_analista TIMESTAMPTZ,
  prazo_executivo TIMESTAMPTZ,
  chancela_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  chancela_em TIMESTAMPTZ,
  chancela_obs TEXT,
  liberada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  liberada_em TIMESTAMPTZ,
  enviada_em TIMESTAMPTZ,
  validade_ate DATE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analises_etapa ON analises(etapa, prazo_analista);
CREATE INDEX IF NOT EXISTS idx_analises_solicitante ON analises(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_analises_origem ON analises(origem_id);

-- anexos (convenção, relatório, atas…) e os retornos gerados (PDF), com o que a IA extraiu de cada um
CREATE TABLE IF NOT EXISTS analise_documentos (
  id SERIAL PRIMARY KEY,
  analise_id INTEGER NOT NULL REFERENCES analises(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('convencao','relatorio','ata_extra','retomadas','historico','dre','retorno_pdf','outro')),
  nome TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/pdf',
  tamanho INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  conteudo BYTEA,
  paginas INTEGER,
  tem_texto BOOLEAN,
  ocr_confianca NUMERIC(4,3),
  extracao JSONB,
  extraido_em TIMESTAMPTZ,
  enviado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  substituido_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_analise_docs ON analise_documentos(analise_id, tipo);

-- unidades e lançamentos lidos do relatório (fonte = página e trecho, para conferir no painel)
CREATE TABLE IF NOT EXISTS analise_unidades (
  id SERIAL PRIMARY KEY,
  analise_id INTEGER NOT NULL REFERENCES analises(id) ON DELETE CASCADE,
  unidade TEXT NOT NULL,
  titular TEXT NOT NULL DEFAULT '',
  documento TEXT NOT NULL DEFAULT '',
  tipo_pessoa TEXT NOT NULL DEFAULT '' CHECK (tipo_pessoa IN ('PF','PJ','')),
  flag TEXT,
  espolio BOOLEAN NOT NULL DEFAULT FALSE,
  fonte JSONB
);
CREATE INDEX IF NOT EXISTS idx_analise_unidades ON analise_unidades(analise_id);

CREATE TABLE IF NOT EXISTS analise_lancamentos (
  id SERIAL PRIMARY KEY,
  unidade_id INTEGER NOT NULL REFERENCES analise_unidades(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL,
  vencimento DATE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ordinaria','extra','agua_gas','acordo','multa','juros','correcao','honorarios','fundo_reserva','outro')),
  valor NUMERIC(14,2) NOT NULL,
  fonte JSONB
);
CREATE INDEX IF NOT EXISTS idx_analise_lanc ON analise_lancamentos(unidade_id, competencia);

CREATE TABLE IF NOT EXISTS analise_exclusoes (
  id SERIAL PRIMARY KEY,
  analise_id INTEGER NOT NULL REFERENCES analises(id) ON DELETE CASCADE,
  unidade TEXT NOT NULL,
  motivo TEXT NOT NULL CHECK (motivo IN ('espolio','retomada','abandono')),
  detalhe TEXT NOT NULL DEFAULT '',
  debito NUMERIC(14,2) NOT NULL DEFAULT 0,
  origem TEXT NOT NULL DEFAULT 'analista' CHECK (origem IN ('relatorio','analista'))
);
CREATE INDEX IF NOT EXISTS idx_analise_exclusoes ON analise_exclusoes(analise_id);

CREATE TABLE IF NOT EXISTS analise_alertas (
  id SERIAL PRIMARY KEY,
  analise_id INTEGER NOT NULL REFERENCES analises(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nivel TEXT NOT NULL DEFAULT 'atencao' CHECK (nivel IN ('info','atencao','critico')),
  mensagem TEXT NOT NULL,
  dados JSONB,
  visto_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  visto_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analise_alertas ON analise_alertas(analise_id);

-- trilha de auditoria: envio, pendência, extração, ajustes (quem, quando, justificativa), motor, diretoria, liberação, reemissão
CREATE TABLE IF NOT EXISTS analise_eventos (
  id SERIAL PRIMARY KEY,
  analise_id INTEGER NOT NULL REFERENCES analises(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  detalhe JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analise_eventos ON analise_eventos(analise_id, criado_em);

-- ===== Implantação (server/rotas/implantacoes.js) =====
-- do contrato assinado à Carteira: o comercial pede, o setor Implantação conduz, a coordenação confirma na Carteira.
-- origem: análise do portal, PDF de análise feita antes do portal, ou condomínio de entrega (diretoria aprova taxa e boleto)
CREATE TABLE IF NOT EXISTS implantacao_protocolos (
  dia DATE PRIMARY KEY,
  ultimo INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS implantacoes (
  id SERIAL PRIMARY KEY,
  protocolo TEXT UNIQUE,
  etapa TEXT NOT NULL DEFAULT 'rascunho' CHECK (etapa IN ('rascunho','diretoria','fila','em_implantacao','pendencia','concluida','na_carteira','cancelada')),
  origem TEXT NOT NULL CHECK (origem IN ('analise','pdf','entrega')),
  analise_id INTEGER REFERENCES analises(id) ON DELETE SET NULL,
  analise_protocolo TEXT,
  condominio TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  executivo_id INTEGER REFERENCES executivos(id) ON DELETE SET NULL,
  solicitante_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  designado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  designado_em TIMESTAMPTZ,
  prazo_inicio TIMESTAMPTZ,
  iniciado_em TIMESTAMPTZ,
  formulario JSONB NOT NULL DEFAULT '{}'::jsonb,
  referencia JSONB NOT NULL DEFAULT '{}'::jsonb,
  etapas JSONB NOT NULL DEFAULT '{}'::jsonb,
  enviado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  condominio_id INTEGER REFERENCES condominios(id) ON DELETE SET NULL,
  aviso_docs_em DATE,
  lembrete_fila_em TIMESTAMPTZ,
  aviso_prazo_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_implantacoes_etapa ON implantacoes(etapa);
CREATE INDEX IF NOT EXISTS idx_implantacoes_analise ON implantacoes(analise_id);
CREATE INDEX IF NOT EXISTS idx_implantacoes_executivo ON implantacoes(executivo_id);

CREATE TABLE IF NOT EXISTS implantacao_documentos (
  id SERIAL PRIMARY KEY,
  implantacao_id INTEGER NOT NULL REFERENCES implantacoes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  nome TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  tamanho INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  conteudo BYTEA,
  enviado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  substituido_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_implantacao_docs ON implantacao_documentos(implantacao_id, tipo);

CREATE TABLE IF NOT EXISTS implantacao_eventos (
  id SERIAL PRIMARY KEY,
  implantacao_id INTEGER NOT NULL REFERENCES implantacoes(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  detalhe JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_implantacao_eventos ON implantacao_eventos(implantacao_id, criado_em);

-- análise liberada há mais dias que a política permite: o gestor da Análise de Crédito libera (ou não) para implantar
-- (análise do portal: analise_id. PDF de análise anterior ao portal: protocolo, condomínio e data lidos do PDF)
CREATE TABLE IF NOT EXISTS implantacao_liberacoes (
  id SERIAL PRIMARY KEY,
  analise_id INTEGER REFERENCES analises(id) ON DELETE CASCADE,
  protocolo TEXT,
  condominio TEXT,
  data_analise DATE,
  pedido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  pedido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo TEXT NOT NULL DEFAULT '',
  decidido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  decidido_em TIMESTAMPTZ,
  aprovado BOOLEAN,
  observacao TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_implantacao_liberacoes ON implantacao_liberacoes(analise_id);

-- metas do acompanhamento (prazo do onboarding e da documentação, meta da carteira, virada do mês vigente, data-marco,
-- documentos da meta). Cada mudança vale a partir de uma data: os meses anteriores seguem com a regra da época
CREATE TABLE IF NOT EXISTS implantacao_parametros (
  id SERIAL PRIMARY KEY,
  valores JSONB NOT NULL,
  vale_desde DATE NOT NULL,
  alterado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  alterado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quem edita: a designada. Outra pessoa da equipe só com autorização da coordenação (pedida ou dada direto), com escopo e prazo
CREATE TABLE IF NOT EXISTS implantacao_autorizacoes (
  id SERIAL PRIMARY KEY,
  implantacao_id INTEGER NOT NULL REFERENCES implantacoes(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  situacao TEXT NOT NULL DEFAULT 'pedida' CHECK (situacao IN ('pedida','ativa','recusada','revogada')),
  escopo TEXT NOT NULL DEFAULT 'tudo' CHECK (escopo IN ('tudo','etapas','documentos')),
  ate DATE,
  motivo TEXT NOT NULL DEFAULT '',
  resposta TEXT NOT NULL DEFAULT '',
  pedida_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  decidida_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  decidida_em TIMESTAMPTZ,
  revogada_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_implantacao_autorizacoes ON implantacao_autorizacoes(implantacao_id, usuario_id);

-- pausas do prazo para concluir: pendência com o comercial (abre e fecha sozinha) ou impedimento marcado pela assistente
CREATE TABLE IF NOT EXISTS implantacao_pausas (
  id SERIAL PRIMARY KEY,
  implantacao_id INTEGER NOT NULL REFERENCES implantacoes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('pendencia','impedimento')),
  motivo TEXT NOT NULL DEFAULT '',
  detalhe TEXT NOT NULL DEFAULT '',
  inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  fim TIMESTAMPTZ,
  resolucao TEXT NOT NULL DEFAULT '',
  por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  encerrada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  lembrete_em DATE
);
CREATE INDEX IF NOT EXISTS idx_implantacao_pausas ON implantacao_pausas(implantacao_id);

-- ficha de repasse: abre na conclusão, a Implantação completa os campos azuis e envia à assistente de crédito
-- (ou à supervisora de crédito, que escolhe). Cada envio é uma versão (até 3, mais só com a liberação da coordenação)
CREATE TABLE IF NOT EXISTS implantacao_fichas (
  implantacao_id INTEGER PRIMARY KEY REFERENCES implantacoes(id) ON DELETE CASCADE,
  aberta_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  prazo DATE,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  situacao TEXT NOT NULL DEFAULT 'a_enviar' CHECK (situacao IN ('a_enviar','enviada','devolvida','recebida')),
  destino_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  com_supervisao BOOLEAN NOT NULL DEFAULT FALSE,
  versao INTEGER NOT NULL DEFAULT 0,
  versoes_extra INTEGER NOT NULL DEFAULT 0,
  primeiro_envio_em TIMESTAMPTZ,
  aviso_prazo_em DATE,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS implantacao_ficha_versoes (
  id SERIAL PRIMARY KEY,
  implantacao_id INTEGER NOT NULL REFERENCES implantacoes(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL,
  conteudo JSONB NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  enviada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  para_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  confirmada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  confirmada_em TIMESTAMPTZ,
  UNIQUE (implantacao_id, versao)
);

-- antecipação enviada ao Controle de Repasses: o Gestor de lá cadastra a regra (com ajuste ou não) ou devolve
CREATE TABLE IF NOT EXISTS implantacao_antecipacoes (
  implantacao_id INTEGER PRIMARY KEY REFERENCES implantacoes(id) ON DELETE CASCADE,
  situacao TEXT NOT NULL CHECK (situacao IN ('enviada','cadastrada','devolvida')),
  atualizacao BOOLEAN NOT NULL DEFAULT FALSE,
  enviado JSONB NOT NULL,
  antes JSONB,
  enviada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  regra_id TEXT,
  cadastrado JSONB,
  ajuste JSONB,
  decidida_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  decidida_em TIMESTAMPTZ,
  motivo TEXT NOT NULL DEFAULT ''
);

-- ===== Solicitação de Contrato (server/rotas/contratos.js) =====
-- o comercial pede a minuta a partir da análise liberada, quem elabora (Jurídico) redige em até 72h úteis, o comercial
-- leva ao síndico, pede ajustes e anexa o contrato assinado, a advogada registra as condições fechadas e elas seguem para a Implantação.
-- origem: análise do portal, PDF de análise feita antes do portal, ou condomínio de entrega (a diretoria aprova taxa e boleto)
CREATE TABLE IF NOT EXISTS contrato_protocolos (
  dia DATE PRIMARY KEY,
  ultimo INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contratos (
  id SERIAL PRIMARY KEY,
  protocolo TEXT UNIQUE,
  etapa TEXT NOT NULL DEFAULT 'rascunho' CHECK (etapa IN ('rascunho','fila','em_elaboracao','pendencia','minuta_enviada','para_assinar','em_assinatura','conferencia','assinado','cancelada')),
  origem TEXT NOT NULL CHECK (origem IN ('analise','pdf','entrega')),
  analise_id INTEGER REFERENCES analises(id) ON DELETE SET NULL,
  analise_protocolo TEXT,
  condominio TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  executivo_id INTEGER REFERENCES executivos(id) ON DELETE SET NULL,
  solicitante_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  assumido_em TIMESTAMPTZ,
  formulario JSONB NOT NULL DEFAULT '{}'::jsonb,
  referencia JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- itens que dependem da diretoria e a decisão: { itens, aprovado, observacao, por, decidido_em }
  diretoria JSONB NOT NULL DEFAULT '{}'::jsonb,
  enviado_em TIMESTAMPTZ,
  prazo TIMESTAMPTZ,
  aviso_prazo_em TIMESTAMPTZ,
  minuta_enviada_em TIMESTAMPTZ,
  ajustes INTEGER NOT NULL DEFAULT 0,
  ultimo_ajuste_em TIMESTAMPTZ,
  assinado_em TIMESTAMPTZ,
  -- condições fechadas no contrato assinado, registradas pela advogada (vão para a Implantação)
  fechado JSONB NOT NULL DEFAULT '{}'::jsonb,
  fechado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  fechado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  aviso_docs_em DATE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contratos_etapa ON contratos(etapa);
CREATE INDEX IF NOT EXISTS idx_contratos_analise ON contratos(analise_id);
CREATE INDEX IF NOT EXISTS idx_contratos_executivo ON contratos(executivo_id);

CREATE TABLE IF NOT EXISTS contrato_documentos (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  nome TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  tamanho INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  conteudo BYTEA,
  enviado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  substituido_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_contrato_docs ON contrato_documentos(contrato_id, tipo);

CREATE TABLE IF NOT EXISTS contrato_eventos (
  id SERIAL PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  detalhe JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contrato_eventos ON contrato_eventos(contrato_id, criado_em);
`;

/* Supabase publica o schema "public" pela API dele (PostgREST). Com RLS ligado e sem
   políticas, ninguém lê nem grava por lá; o portal conecta como dono das tabelas e não é afetado. */
const TABELAS = ['usuarios', 'sessoes', 'setores', 'modulos', 'modulo_versoes', 'permissoes', 'armazenamento', 'colecoes', 'registros', 'documentos', 'auditoria',
  'setor_membros', 'ticket_categorias', 'tickets', 'ticket_eventos', 'ticket_anexos', 'notificacoes', 'condominios',
  'links_pagina', 'links', 'links_campanhas', 'tutoriais', 'comissao_relatorios', 'comissao_leitores', 'comissao_planilhas', 'cdn_cache', 'regras_acesso',
  'parametros_politica', 'faixas_precificacao', 'executivos', 'analise_protocolos', 'analises', 'analise_documentos', 'analise_unidades',
  'analise_lancamentos', 'analise_exclusoes', 'analise_alertas', 'analise_eventos',
  'implantacao_protocolos', 'implantacoes', 'implantacao_documentos', 'implantacao_eventos', 'implantacao_liberacoes', 'implantacao_parametros',
  'implantacao_autorizacoes', 'implantacao_pausas', 'implantacao_fichas', 'implantacao_ficha_versoes', 'implantacao_antecipacoes',
  'contrato_protocolos', 'contratos', 'contrato_documentos', 'contrato_eventos'];
const RLS = TABELAS.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`).join(';\n');

/* Ajustes em bancos já existentes (rodam a cada início e não fazem nada se já estiverem aplicados). */
const AJUSTES = `
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS supervisor_tickets BOOLEAN NOT NULL DEFAULT FALSE;
-- versão de cada chave do armazenamento: a gravação feita sobre uma versão velha é recusada (conflito entre pessoas)
ALTER TABLE armazenamento ADD COLUMN IF NOT EXISTS versao BIGINT NOT NULL DEFAULT 1;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS editor_links BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS condominio_id INTEGER REFERENCES condominios(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS demanda_interna BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS prazo_conclusao TIMESTAMPTZ;
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS vencimento TEXT NOT NULL DEFAULT '';
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS analista_cobranca TEXT NOT NULL DEFAULT '';
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS analista_extrajudicial TEXT NOT NULL DEFAULT '';
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS assistente_credito TEXT NOT NULL DEFAULT '';
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS forma_envio TEXT NOT NULL DEFAULT '';
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS inicio_contrato DATE;
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS observacoes TEXT NOT NULL DEFAULT '';
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS executivo TEXT NOT NULL DEFAULT '';
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE condominios ADD COLUMN IF NOT EXISTS atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE modulos DROP CONSTRAINT IF EXISTS modulos_adaptador_check;
ALTER TABLE modulos ADD CONSTRAINT modulos_adaptador_check CHECK (adaptador IS NULL OR adaptador IN ('gas-linhas','gas-objetos','gas-posicional','claude-db'));
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto BYTEA;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_tipo TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_em TIMESTAMPTZ;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_papel_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_papel_check CHECK (papel IN ('admin','coordenador','supervisor','usuario'));
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
-- avisos que não são de ticket (ex.: demonstrativo de comissão) levam o endereço da tela no portal
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS link TEXT;
-- o vídeo já vem comprimido: guardado sem compressão, o banco lê só o pedaço pedido pelo player
ALTER TABLE tutoriais ALTER COLUMN video SET STORAGE EXTERNAL;
-- planilhas do mês: a gestão é avisada uma vez, quando quem envia termina todas as planilhas pedidas a ele
ALTER TABLE comissao_planilhas ADD COLUMN IF NOT EXISTS avisado_em TIMESTAMPTZ;
-- HTML novo da ferramenta que não mudou a tela nem o fluxo: a administração confirma que o vídeo continua valendo
ALTER TABLE tutoriais ADD COLUMN IF NOT EXISTS conferido_em TIMESTAMPTZ;
-- acessos centralizados: cada pessoa liberada numa ferramenta edita ou só consulta, com os papéis que tem nela
ALTER TABLE permissoes ADD COLUMN IF NOT EXISTS somente_leitura BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE permissoes ADD COLUMN IF NOT EXISTS papeis TEXT[] NOT NULL DEFAULT '{}';
-- ferramenta nova cadastrada pela coordenação: fica aguardando a aprovação da administração
ALTER TABLE modulos ADD COLUMN IF NOT EXISTS pendente BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE modulos ADD COLUMN IF NOT EXISTS criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
-- HTML novo enviado pela coordenação numa ferramenta não isolada: fica guardado, aguardando a aprovação da administração
ALTER TABLE modulo_versoes ADD COLUMN IF NOT EXISTS aprovada BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE modulos ADD COLUMN IF NOT EXISTS versao_pendente_id INTEGER;
-- implantação aberta de uma análise que já tem contrato: os dados e o contrato assinado vêm de lá
ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS contrato_id INTEGER REFERENCES contratos(id) ON DELETE SET NULL;
-- meta de documentação marcada à mão pela coordenação ({resultado: bateu|faltou, motivo, por, em}) e cobranças ao executivo
ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS meta_doc_manual JSONB;
ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS cobranca_doc_em TIMESTAMPTZ;
ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS lembrete_doc_em TIMESTAMPTZ;
-- cadastro da pessoa: nascimento e admissão (obrigatórios ao criar ou editar, e quem já existia completa na próxima edição)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS data_admissao DATE;
-- documento da implantação que veio da análise ou do contrato: não se troca nem se remove ali
ALTER TABLE implantacao_documentos ADD COLUMN IF NOT EXISTS vinculado BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE implantacao_documentos SET vinculado = TRUE WHERE tipo = 'analise_credito' AND NOT vinculado;
-- e-mail de cada aviso: quando saiu ou por que falhou (para conferir quando alguém diz que não recebeu)
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS email_enviado_em TIMESTAMPTZ;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS email_erro TEXT;
-- documento recebido sem arquivo (em papel, já no CPD): a assistente marca, com observação, e desfazer tira da contagem
ALTER TABLE implantacao_documentos ADD COLUMN IF NOT EXISTS sem_arquivo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE implantacao_documentos ADD COLUMN IF NOT EXISTS observacao TEXT NOT NULL DEFAULT '';
ALTER TABLE implantacao_documentos ADD COLUMN IF NOT EXISTS desfeito_em TIMESTAMPTZ;
ALTER TABLE implantacao_documentos ADD COLUMN IF NOT EXISTS desfeito_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
-- Obs. da aba Controle (escrita pela equipe), justificativa do onboarding fora do prazo e os avisos diários dos prazos
ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS obs_controle JSONB;
ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS onboarding_justificativa JSONB;
ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS aviso_concluir_em DATE;
ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS aviso_onboarding_em DATE;
-- Solicitação de Contrato: o executivo pede a assinatura e a advogada envia para assinar (etapas para_assinar e em_assinatura)
ALTER TABLE contratos DROP CONSTRAINT IF EXISTS contratos_etapa_check;
ALTER TABLE contratos ADD CONSTRAINT contratos_etapa_check CHECK (etapa IN ('rascunho','fila','em_elaboracao','pendencia','minuta_enviada','para_assinar','em_assinatura','conferencia','assinado','cancelada'));
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS assinatura_pedida_em TIMESTAMPTZ;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS em_assinatura_em TIMESTAMPTZ;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS assinatura_plataforma TEXT NOT NULL DEFAULT ''
`;

/* Funções e gatilhos do banco (cada item é um comando inteiro: o corpo das funções tem ";").
   Análise de Espólio (ferramenta feita como artefato do Claude, documentos em "documentos"):
   - a coleção "carteira" acompanha a Carteira de condomínios (a cada mudança em condominios);
   - avisos no sino: solicitação nova para quem tem o papel Gestão; concluída ou devolvida para quem pediu;
   - o contador de protocolos nunca volta nem repete número (duas pessoas gravando ao mesmo tempo).
   Se o módulo não existir, nada acontece, e um erro aqui nunca impede a gravação. */
const ESPOLIO = 'analise-de-espolio';
const FUNCOES = [
  `CREATE OR REPLACE FUNCTION espolio_carteira_json() RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $f$
  SELECT jsonb_build_object(
    'origem', 'banco',
    'atualizadoEm', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'assinatura', 'banco:' || count(*) || ':' || coalesce(max(atualizado_em)::text, ''),
    'itens', coalesce(jsonb_agg(jsonb_build_object(
      'codigo', codigo, 'nome', nome, 'razao_social', razao_social, 'cnpj', cnpj, 'comarca', comarca, 'situacao', situacao,
      'inicio_contrato', inicio_contrato, 'assistente_credito', assistente_credito, 'analista_cobranca', analista_cobranca,
      'analista_extrajudicial', analista_extrajudicial, 'executivo', executivo, 'administradora', administradora
    ) ORDER BY nome), '[]'::jsonb))
  FROM public.condominios
$f$`,
  `CREATE OR REPLACE FUNCTION espolio_atualizar_carteira() RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public AS $f$
DECLARE
  alvo text := '${ESPOLIO}';
  novo_seq bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = alvo) THEN RETURN; END IF;
  SELECT coalesce(max(seq), 0) + 1 INTO novo_seq FROM public.documentos WHERE modulo_slug = alvo;
  INSERT INTO public.documentos (modulo_slug, colecao, doc_id, dados, seq, atualizado_em)
  VALUES (alvo, 'carteira', 'atual', public.espolio_carteira_json(), novo_seq, now())
  ON CONFLICT (modulo_slug, colecao, doc_id) DO UPDATE SET dados = excluded.dados, seq = excluded.seq, atualizado_em = now();
EXCEPTION WHEN others THEN
  RAISE WARNING 'espolio_atualizar_carteira: %', sqlerrm;
END $f$`,
  `CREATE OR REPLACE FUNCTION espolio_carteira_trigger() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $f$
BEGIN PERFORM public.espolio_atualizar_carteira(); RETURN NULL; END $f$`,
  `CREATE OR REPLACE FUNCTION espolio_notificar() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $f$
DECLARE
  st_antigo text := CASE WHEN tg_op = 'UPDATE' THEN coalesce(old.dados->>'status', '') ELSE '' END;
  st_novo   text := coalesce(new.dados->>'status', '');
  cond      text := coalesce(new.dados->'condominio'->>'nome', '');
  solic     text := coalesce(new.dados->>'solicitanteNome', '');
  solic_id  int  := CASE WHEN coalesce(new.dados->>'solicitanteId', '') ~ '^(mb-)?[0-9]+$' THEN regexp_replace(new.dados->>'solicitanteId', '^mb-', '')::int END;
BEGIN
  IF new.modulo_slug <> '${ESPOLIO}' OR new.colecao <> 'solicitacoes' THEN RETURN new; END IF;
  IF tg_op = 'INSERT' OR (st_antigo <> 'nova' AND st_novo = 'nova') THEN
    INSERT INTO public.notificacoes (usuario_id, tipo, titulo, texto, link)
    SELECT u.id, 'espolio', solic || ' solicitou análise de espólio · ' || cond, 'Abra a aba Solicitações do módulo Análise de Espólio.', '#/m/${ESPOLIO}'
    FROM public.usuarios u
    WHERE u.ativo AND u.id::text IN (SELECT regexp_replace(doc_id, '^mb-', '') FROM public.documentos
      WHERE modulo_slug = '${ESPOLIO}' AND colecao = 'perfis' AND dados->'papeis' ? 'gestao');
  END IF;
  IF tg_op = 'UPDATE' AND st_antigo <> st_novo AND st_novo IN ('concluida', 'devolvida') AND solic_id IS NOT NULL THEN
    INSERT INTO public.notificacoes (usuario_id, tipo, titulo, texto, link) VALUES (solic_id, 'espolio',
      CASE WHEN st_novo = 'concluida' THEN 'Análise de espólio concluída · ' || cond || ' · ' || coalesce(new.dados->>'protocolo', '') ELSE 'Solicitação de análise devolvida · ' || cond END,
      CASE WHEN st_novo = 'concluida' THEN 'A ficha está disponível em Minhas solicitações.' ELSE coalesce(new.dados->>'motivoDevolucao', '') END, '#/m/${ESPOLIO}');
  END IF;
  RETURN new;
EXCEPTION WHEN others THEN
  RAISE WARNING 'espolio_notificar: %', sqlerrm;
  RETURN new;
END $f$`,
  `CREATE OR REPLACE FUNCTION espolio_protocolo_guarda() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $f$
DECLARE
  ano text; v_old bigint; v_new bigint; subiu boolean := false;
BEGIN
  IF new.modulo_slug <> '${ESPOLIO}' OR new.colecao <> 'meta' OR new.doc_id <> 'estado' THEN RETURN new; END IF;
  IF old.dados IS NULL OR old.dados->'seq' IS NULL THEN RETURN new; END IF;
  IF new.dados IS NULL OR new.dados->'seq' IS NULL THEN
    RAISE EXCEPTION 'protocolo_conflito: o contador de protocolos não pode ser apagado';
  END IF;
  FOR ano IN SELECT jsonb_object_keys(old.dados->'seq') LOOP
    v_old := coalesce((old.dados->'seq'->>ano)::bigint, 0);
    v_new := coalesce((new.dados->'seq'->>ano)::bigint, 0);
    IF v_new < v_old THEN RAISE EXCEPTION 'protocolo_conflito: contador de % voltaria de % para %', ano, v_old, v_new; END IF;
  END LOOP;
  FOR ano IN SELECT jsonb_object_keys(new.dados->'seq') LOOP
    IF coalesce((new.dados->'seq'->>ano)::bigint, 0) > coalesce((old.dados->'seq'->>ano)::bigint, 0) THEN subiu := true; END IF;
  END LOOP;
  IF NOT subiu THEN RAISE EXCEPTION 'protocolo_conflito: número já usado, buscar o próximo'; END IF;
  RETURN new;
END $f$`,
  'CREATE OR REPLACE TRIGGER espolio_carteira AFTER INSERT OR DELETE OR UPDATE ON condominios FOR EACH STATEMENT EXECUTE FUNCTION espolio_carteira_trigger()',
  'CREATE OR REPLACE TRIGGER espolio_notificar AFTER INSERT OR UPDATE OF dados ON documentos FOR EACH ROW EXECUTE FUNCTION espolio_notificar()',
  `CREATE OR REPLACE TRIGGER espolio_protocolo_guarda BEFORE UPDATE ON documentos FOR EACH ROW
  WHEN (new.modulo_slug = '${ESPOLIO}' AND new.colecao = 'meta' AND new.doc_id = 'estado') EXECUTE FUNCTION espolio_protocolo_guarda()`,
];

async function abrir(cfg) {
  const db = await conectar(cfg);
  await db.tx(async (t) => {
    // evita que duas instâncias subindo juntas criem o esquema ao mesmo tempo
    await t.q('SELECT pg_advisory_xact_lock(7240513)');
    for (const cmd of (SCHEMA + ';' + RLS + ';' + AJUSTES).split(';').map((s) => s.trim()).filter(Boolean)) await t.q(cmd);
    // uma função que não puder ser recriada (ex.: dono diferente no banco) não impede o portal de subir
    for (const cmd of FUNCOES) {
      await t.q('SAVEPOINT funcao');
      try { await t.q(cmd); await t.q('RELEASE SAVEPOINT funcao'); } catch (e) {
        await t.q('ROLLBACK TO SAVEPOINT funcao');
        console.warn('[banco] não foi possível criar/atualizar:', cmd.slice(0, 80).replace(/\s+/g, ' '), '→', e.message);
      }
    }
    await semear(t);
    await renomearPremiacoes(t); // antes de semear os módulos novos do catálogo
    await semearSetores(t);
    await semearNovosModulos(t);
    await sincronizarCatalogo(t);
    await migrarCarteira(t);
    await semearPolitica(t);
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

/* Módulos que entraram no catálogo depois da instalação: cria cada um uma única vez
   (se o admin apagar depois, não volta). */
async function semearNovosModulos(t) {
  const sem = await t.um("SELECT detalhe FROM auditoria WHERE acao = 'catalogo_semeado' ORDER BY id LIMIT 1");
  const iniciais = new Set((sem && sem.detalhe && sem.detalhe.modulos) || []);
  for (const m of MODULOS) {
    if (iniciais.has(m.slug)) continue;
    if (await t.um("SELECT 1 FROM auditoria WHERE acao = 'modulo_semeado' AND modulo_slug = $1 LIMIT 1", [m.slug])) continue;
    const setor = await t.um('SELECT id FROM setores WHERE nome = $1', [m.setor]);
    await t.q(`INSERT INTO modulos (slug, nome, descricao, setor_id, icone, ordem, armazenamento, adaptador, fonte_dados, config)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb) ON CONFLICT (slug) DO NOTHING`, [
      m.slug, m.nome, m.descricao || '', setor ? setor.id : null, m.icone || 'app', m.ordem || 0,
      m.armazenamento || 'navegador', m.adaptador || null, m.fonte_dados || 'google', JSON.stringify(m.config || {}),
    ]);
    await t.q("INSERT INTO auditoria (acao, modulo_slug) VALUES ('modulo_semeado', $1)", [m.slug]);
  }
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

/* Bancos que receberam a 1ª versão da carteira guardavam as pessoas num JSON (coluna da planilha → nome):
   leva para os campos de cada função. Só preenche o que estiver vazio, então rodar de novo não muda nada. */
async function migrarCarteira(t) {
  const antiga = await t.um("SELECT 1 FROM information_schema.columns WHERE table_name = 'condominios' AND column_name = 'pessoas'");
  if (!antiga) return;
  for (const [campo, coluna] of [['analista_cobranca', 'ANALISTA ADMINISTRATIVA'], ['analista_extrajudicial', 'ANALISTA EXTRAJUDICIAL'], ['assistente_credito', 'ASSISTENTE CREDITO']]) {
    await t.q(`UPDATE condominios SET ${campo} = UPPER(TRIM(pessoas->>$1)) WHERE ${campo} = '' AND COALESCE(pessoas->>$1, '') <> ''`, [coluna]);
  }
}

/* "Comissionamento MyBlue" (módulo "comissionamento") passou a ser "Gestão de Premiações" (módulo "premiacoes").
   Como as tabelas apontam para modulos(slug) sem ON UPDATE CASCADE, cria o módulo novo com os mesmos dados, leva tudo
   o que era do antigo (versões do HTML, acessos, dados salvos, demonstrativos, pedidos de planilha, histórico) e apaga o
   antigo. Os tutoriais e os links dos avisos também mudam. Roda uma vez: depois o módulo antigo já não existe. */
async function renomearPremiacoes(t) {
  const velho = await t.um("SELECT nome FROM modulos WHERE slug = 'comissionamento'");
  if (!velho || await t.um("SELECT 1 FROM modulos WHERE slug = 'premiacoes'")) return;
  const cols = (await t.q("SELECT column_name FROM information_schema.columns WHERE table_name = 'modulos' AND table_schema = current_schema() ORDER BY ordinal_position"))
    .rows.map((c) => c.column_name).filter((c) => c !== 'slug');
  const lista = cols.map((c) => `"${c}"`).join(', ');
  await t.q(`INSERT INTO modulos (slug, ${lista}) SELECT 'premiacoes', ${lista} FROM modulos WHERE slug = 'comissionamento'`);
  // o nome muda só se ainda for o antigo (não desfaz um nome escolhido pela administração)
  await t.q(`UPDATE modulos SET nome = CASE WHEN nome = 'Comissionamento MyBlue' THEN 'Gestão de Premiações' ELSE nome END,
    config = config || '{"titulo":"Gestão de Premiações"}'::jsonb WHERE slug = 'premiacoes'`);
  for (const tab of ['modulo_versoes', 'permissoes', 'armazenamento', 'colecoes', 'registros', 'documentos', 'auditoria', 'comissao_relatorios', 'comissao_planilhas']) {
    await t.q(`UPDATE ${tab} SET modulo_slug = 'premiacoes' WHERE modulo_slug = 'comissionamento'`);
  }
  await t.q("DELETE FROM modulos WHERE slug = 'comissionamento'");
  await t.q("INSERT INTO auditoria (acao, modulo_slug, detalhe) VALUES ('modulo_semeado', 'premiacoes', '{\"de\":\"comissionamento\"}'::jsonb)");
  for (const [de, para] of [['minhas-comissoes', 'minhas-premiacoes'], ['ferramenta-comissionamento', 'ferramenta-premiacoes']]) {
    if (!(await t.um('SELECT 1 FROM tutoriais WHERE slug = $1', [para]))) await t.q('UPDATE tutoriais SET slug = $2 WHERE slug = $1', [de, para]);
  }
  await t.q("UPDATE notificacoes SET link = replace(replace(link, '#/m/comissionamento', '#/m/premiacoes'), '#/comissoes', '#/premiacoes') WHERE link LIKE '#/m/comissionamento%' OR link LIKE '#/comissoes%'");
}

module.exports = { abrir, SCHEMA, RLS, FUNCOES };

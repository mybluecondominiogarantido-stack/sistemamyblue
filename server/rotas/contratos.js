'use strict';
/*
 * Solicitação de Contrato: o comercial (executivo de negócios) pede a minuta a partir de uma análise de crédito liberada,
 * com os dados da negociação fechada com o síndico (o antigo formulário do Microsoft Forms); quem elabora contratos
 * (Jurídico) assume e envia a minuta em até 72h úteis; o comercial leva ao síndico, pede ajustes e anexa o contrato
 * assinado; a advogada registra as condições fechadas, que seguem para a Implantação com os documentos.
 *
 * Etapas: rascunho → fila (enviada, ninguém assumiu) → em_elaboracao → minuta_enviada → conferencia (assinado anexado,
 *         aguardando as condições fechadas) → assinado.
 *         pendencia: devolvida ao comercial (falta informação). Ajuste pedido: volta para em_elaboracao. cancelada.
 *
 * Quem faz o quê (definido no portal, nunca no código):
 *  - comercial: quem está ligado a um cadastro de executivo (Análise de Crédito → Pessoas e papéis); vê e pede as suas;
 *  - quem elabora: a permissão "Elaborar as minutas de contrato": as pessoas que a administração marca na aba Quem elabora
 *    (enquanto ninguém for marcado, a administração recebe); qualquer uma delas assume da fila, passa para outra e
 *    registra as condições fechadas;
 *  - diretoria: quem chancela análises de crédito; decide o que o Manual do Contrato diz ser "decisão da diretoria"
 *    (taxa extra acima de 40%, despesas reembolsáveis, condomínio de entrega) antes da minuta;
 *  - administração: tudo.
 */
const express = require('express');
const crypto = require('crypto');
const { politicaAtiva } = require('../credito/banco');
const leitorPdf = require('../implantacoes/pdf');
const { gerarPdf } = require('../implantacoes/formulario-pdf');
const F = require('../contratos/formulario');
const C = require('../contratos/clausulas');

const ETAPAS = ['rascunho', 'fila', 'em_elaboracao', 'pendencia', 'minuta_enviada', 'conferencia', 'assinado', 'cancelada'];
const ORIGEM = { analise: 'Análise de Crédito', pdf: 'Análise anterior ao portal', entrega: 'Condomínio de entrega' };
const PERMISSAO = 'contratos.elaborar';
const SETOR_JURIDICO = 'Jurídico';
const DIAS_PRAZO = 3; // 72h úteis para a minuta (3 dias de expediente)
const DIA_MS = 24 * 3600 * 1000;

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const diaBrasilia = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const quando = (d) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

async function proximoProtocolo(db, agora = new Date()) {
  const dia = diaBrasilia(agora);
  const r = await db.um(`INSERT INTO contrato_protocolos (dia, ultimo) VALUES ($1, 1)
    ON CONFLICT (dia) DO UPDATE SET ultimo = contrato_protocolos.ultimo + 1 RETURNING ultimo`, [dia]);
  return `CT-${dia}-${String(r.ultimo).padStart(2, '0')}`;
}

const administradores = async (db) => (await db.q("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo")).rows.map((x) => x.id);
async function elaboradores(db, regras) {
  const ids = await regras.pessoasCom(PERMISSAO);
  return ids.length ? ids : administradores(db);
}
async function diretores(db, regras) {
  const ids = (await regras.regras()).get('credito.diretoria').pessoas;
  return ids.length ? ids : administradores(db);
}
/* quem é dono da solicitação: quem pediu e o executivo */
async function donos(db, c) {
  const ex = c.executivo_id ? await db.um('SELECT usuario_id FROM executivos WHERE id = $1', [c.executivo_id]) : null;
  return [c.solicitante_id, ex && ex.usuario_id];
}
const tiposVigentes = async (db, id) => new Set((await db.q('SELECT DISTINCT tipo FROM contrato_documentos WHERE contrato_id = $1 AND substituido_em IS NULL', [id])).rows.map((x) => x.tipo));
const precisaDiretoria = (c) => !!(c.diretoria && (c.diretoria.itens || []).length);
const diretoriaDecidiu = (c) => !!(c.diretoria && c.diretoria.decidido_em);
const ABERTAS = "('fila','em_elaboracao','pendencia','minuta_enviada','conferencia')";

/* Rotinas (rodam a cada poucos minutos):
 *  - prazo da minuta (72h úteis) vencido: aviso, uma vez, a quem assumiu (ou a quem elabora, se ninguém assumiu);
 *  - documentos do síndico pendentes: lembrete por e-mail ao executivo, uma vez por dia útil, no expediente. */
function criarRotinasContratos({ db, avisos, expediente, regras }) {
  async function executar(agora = new Date()) {
    const feito = { prazos: 0, documentos: 0 };
    for (const c of (await db.q(`SELECT id, protocolo, condominio, responsavel_id, prazo FROM contratos
        WHERE etapa IN ('fila','em_elaboracao') AND prazo < $1 AND aviso_prazo_em IS NULL`, [agora])).rows) {
      await avisos.notificar(c.responsavel_id ? [c.responsavel_id] : await elaboradores(db, regras), { link: `#/contratos/${c.id}`, tipo: 'contrato', email: true,
        titulo: `Passou do prazo da minuta · ${c.protocolo} · ${c.condominio}`,
        texto: `A minuta de ${c.condominio} devia ter saído até ${quando(c.prazo)} (72h úteis).${c.responsavel_id ? '' : ' Ninguém assumiu a solicitação ainda.'}` });
      await db.q('UPDATE contratos SET aviso_prazo_em = $2 WHERE id = $1', [c.id, agora]);
      feito.prazos++;
    }
    const m = expediente.momento(agora);
    if (!m.noExpediente) return feito;
    const { rows } = await db.q(`SELECT id, protocolo, condominio, solicitante_id, executivo_id FROM contratos
      WHERE etapa IN ${ABERTAS} AND (aviso_docs_em IS NULL OR aviso_docs_em < $1::date)`, [m.dia]);
    for (const c of rows) {
      const pend = F.pendencias(await tiposVigentes(db, c.id));
      if (pend.length) {
        await avisos.notificar(await donos(db, c), { link: `#/contratos/${c.id}`, tipo: 'contrato', email: true,
          titulo: `Documentos do síndico pendentes · ${c.protocolo} · ${c.condominio}`,
          texto: `Sem eles o contrato pode ser assinado, mas a cobrança, os boletos e o repasse travam depois. Ainda falta: ${pend.join('; ')}. Anexe no portal, na solicitação ${c.protocolo}.` });
        feito.documentos++;
      }
      await db.q('UPDATE contratos SET aviso_docs_em = $2::date WHERE id = $1', [c.id, m.dia]);
    }
    return feito;
  }
  return { executar };
}

function rotasContratos({ db, seg, cfg, avisos, regras, expediente }) {
  const r = express.Router();
  const json = express.json({ limit: '1mb' });
  const corpoDoc = express.raw({ type: () => true, limit: (cfg.limiteCreditoMb || 30) * 1024 * 1024 });
  r.use('/api/contratos', seg.exigirLogin);
  const erro = (res, status, msg, extra) => res.status(status).json({ erro: msg, ...(extra || {}) });
  const link = (id) => `#/contratos/${id}`;
  const evento = (t, id, usuarioId, tipo, detalhe) => t.q('INSERT INTO contrato_eventos (contrato_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)',
    [id, usuarioId, tipo, JSON.stringify(detalhe || {})]);

  /* ---------- quem é a pessoa na Solicitação de Contrato ---------- */
  async function perfil(u) {
    const admin = u.papel === 'admin';
    const executivo = await db.um('SELECT id, nome, uf FROM executivos WHERE usuario_id = $1 AND ativo', [u.id]);
    return { admin, executivo, politica: await politicaAtiva(db),
      elaborador: admin || (await regras.pode(u, PERMISSAO)), diretoria: admin || (await regras.pode(u, 'credito.diretoria')) };
  }

  function pode(p, c, u) {
    const dono = c.solicitante_id === u.id || !!(p.executivo && c.executivo_id === p.executivo.id);
    const interno = p.admin || p.elaborador || p.diretoria;
    const editavel = ['rascunho', 'pendencia'].includes(c.etapa);
    const aberta = !['assinado', 'cancelada'].includes(c.etapa);
    const conduz = c.etapa === 'em_elaboracao' && p.elaborador && (c.responsavel_id === u.id || p.admin);
    const aguardaDiretoria = precisaDiretoria(c) && !diretoriaDecidiu(c);
    return {
      ver: dono || interno,
      interno,
      editar: editavel && (dono || p.admin),
      enviar: editavel && (dono || p.admin),
      documentos: aberta && (dono || p.elaborador || p.admin),
      tirar_documentos: editavel && (dono || p.admin),
      assumir: p.elaborador && c.etapa === 'fila',
      passar: p.elaborador && ['fila', 'em_elaboracao', 'pendencia', 'minuta_enviada'].includes(c.etapa),
      pendencia: conduz,
      minuta: conduz,
      enviar_minuta: conduz && !aguardaDiretoria,
      decidir_diretoria: p.diretoria && aguardaDiretoria && ['fila', 'em_elaboracao', 'pendencia'].includes(c.etapa),
      ajuste: c.etapa === 'minuta_enviada' && (dono || p.admin),
      assinar: c.etapa === 'minuta_enviada' && (dono || c.responsavel_id === u.id || p.admin),
      registrar: c.etapa === 'conferencia' && p.elaborador,
      corrigir: c.etapa === 'assinado' && p.elaborador,
      cancelar: aberta && ((dono && c.etapa !== 'em_elaboracao') || (p.elaborador && c.etapa !== 'rascunho') || p.admin),
    };
  }

  async function carregar(req, res) {
    const c = await db.um('SELECT * FROM contratos WHERE id = $1', [Number(req.params.id) || 0]);
    const p = await perfil(req.usuario);
    if (!c || !pode(p, c, req.usuario).ver) { erro(res, 404, 'Solicitação de contrato não encontrada.'); return null; }
    return { c, p, pd: pode(p, c, req.usuario) };
  }

  /* ---------- análises que podem virar contrato ---------- */
  async function analisesDisponiveis(p, u, analiseId = null) {
    const args = [];
    const v = (x) => { args.push(x); return '$' + args.length; };
    const where = ["a.etapa = 'enviada'", "a.resultado IN ('aprovada','ressalvas')",
      // a reanálise enviada substitui a análise de origem
      "NOT EXISTS (SELECT 1 FROM analises x WHERE x.origem_id = a.id AND x.etapa = 'enviada')",
      "NOT EXISTS (SELECT 1 FROM contratos c WHERE c.analise_id = a.id AND c.etapa <> 'cancelada')"];
    if (!p.admin) where.push(`(a.solicitante_id = ${v(u.id)} OR a.executivo_id = ${v(p.executivo ? p.executivo.id : 0)})`);
    if (analiseId) where.push(`a.id = ${v(analiseId)}`);
    const { rows } = await db.q(`SELECT a.id, a.protocolo, a.condominio, a.cnpj, a.uf, a.resultado, a.taxa_adm, a.boleto, a.executivo_id,
        COALESCE(a.liberada_em, a.enviada_em) AS liberada_em, e.nome AS executivo_nome
      FROM analises a LEFT JOIN executivos e ON e.id = a.executivo_id
      WHERE ${where.join(' AND ')} ORDER BY COALESCE(a.liberada_em, a.enviada_em) DESC LIMIT 200`, args);
    return rows.map((a) => ({ ...a, taxa_adm: a.taxa_adm == null ? null : Number(a.taxa_adm), boleto: a.boleto == null ? null : Number(a.boleto),
      dias: Math.floor((Date.now() - new Date(a.liberada_em).getTime()) / DIA_MS) }));
  }
  async function diasDaAnalise(c) {
    if (c.origem === 'analise' && c.analise_id) {
      const a = await db.um('SELECT COALESCE(liberada_em, enviada_em) AS em FROM analises WHERE id = $1', [c.analise_id]);
      return a && a.em ? Math.floor((Date.now() - new Date(a.em).getTime()) / DIA_MS) : null;
    }
    if (c.origem === 'pdf' && c.referencia && c.referencia.data) return Math.floor((Date.now() - new Date(`${c.referencia.data}T12:00:00-03:00`).getTime()) / DIA_MS);
    return null;
  }

  /* ===================== perfil, contadores e quem elabora ===================== */
  r.get('/api/contratos/meta', async (req, res) => {
    const p = await perfil(req.usuario);
    const ids = p.elaborador ? await regras.pessoasCom(PERMISSAO) : [];
    res.json({
      perfil: { admin: p.admin, elaborador: p.elaborador, diretoria: p.diretoria, executivo: p.executivo, gerencia_equipe: (await regras.gerenciaveis(req.usuario)).has(PERMISSAO) },
      resultados: F.RESULTADO, foro_padrao: F.FORO_PADRAO,
      executivos: p.admin ? (await db.q('SELECT id, nome, uf FROM executivos WHERE ativo ORDER BY nome')).rows : p.executivo ? [p.executivo] : [],
      documentos: Object.entries(F.DOCUMENTOS).map(([tipo, d]) => ({ tipo, ...d })),
      garantias: F.GARANTIAS, receitas_cashback: F.RECEITAS_CASHBACK, clausulas: { negociaveis: C.NEGOCIAVEIS, fixas: C.FIXAS },
      origens: ORIGEM, prazo_dias: DIAS_PRAZO, validade_proposta: p.politica.validade_dias,
      elaboradores: ids.length ? (await db.q('SELECT id, nome FROM usuarios WHERE id = ANY($1::int[]) AND ativo ORDER BY nome', [ids])).rows : [],
    });
  });

  r.get('/api/contratos/resumo', async (req, res) => {
    const p = await perfil(req.usuario);
    const out = { acesso: !!(p.executivo || p.elaborador || p.diretoria) };
    if (!out.acesso) return res.json(out);
    if (p.elaborador) {
      Object.assign(out, await db.um(`SELECT COUNT(*) FILTER (WHERE etapa = 'fila')::int AS fila,
        COUNT(*) FILTER (WHERE etapa = 'em_elaboracao' AND responsavel_id = $1)::int AS minhas,
        COUNT(*) FILTER (WHERE etapa = 'conferencia')::int AS conferencia FROM contratos`, [req.usuario.id]));
    }
    if (p.diretoria) {
      out.diretoria = (await db.um(`SELECT COUNT(*)::int AS n FROM contratos WHERE etapa IN ('fila','em_elaboracao','pendencia')
        AND jsonb_array_length(COALESCE(diretoria->'itens', '[]'::jsonb)) > 0 AND diretoria->>'decidido_em' IS NULL`)).n;
    }
    if (p.executivo || !p.elaborador) {
      out.retorno = (await db.um("SELECT COUNT(*)::int AS n FROM contratos WHERE etapa IN ('pendencia','minuta_enviada') AND (solicitante_id = $1 OR executivo_id = $2)",
        [req.usuario.id, p.executivo ? p.executivo.id : 0])).n;
    }
    res.json(out);
  });

  /* quem elabora: as pessoas marcadas pela administração (a regra pode, além disso, liberar o setor Jurídico inteiro) */
  async function equipe() {
    const regra = (await regras.regras()).get(PERMISSAO);
    const setor = await db.um('SELECT id FROM setores WHERE nome = $1', [SETOR_JURIDICO]);
    const juridico = setor ? new Set((await db.q('SELECT usuario_id FROM setor_membros WHERE setor_id = $1', [setor.id])).rows.map((x) => x.usuario_id)) : new Set();
    return { todo_setor: !!(regra.niveis.length && setor && regra.setores.includes(setor.id)), setor: SETOR_JURIDICO, pessoas: regra.pessoas,
      com_acesso: await regras.pessoasCom(PERMISSAO),
      usuarios: (await db.q("SELECT id, nome, email FROM usuarios WHERE ativo AND papel <> 'admin' ORDER BY nome")).rows.map((x) => ({ ...x, juridico: juridico.has(x.id) })) };
  }
  r.get('/api/contratos/equipe', async (req, res) => {
    if (!(await regras.gerenciaveis(req.usuario)).has(PERMISSAO)) return erro(res, 403, 'Quem escolhe quem elabora é a administração (e a coordenação do Jurídico).');
    res.json(await equipe());
  });
  r.put('/api/contratos/equipe', json, async (req, res) => {
    if (!(await regras.gerenciaveis(req.usuario)).has(PERMISSAO)) return erro(res, 403, 'Quem escolhe quem elabora é a administração (e a coordenação do Jurídico).');
    const b = req.body || {};
    const atual = (await regras.regras()).get(PERMISSAO);
    let niveis = atual.niveis, setores = atual.setores;
    if (req.usuario.papel === 'admin' && b.todo_setor !== undefined) {
      const setor = await db.um('SELECT id FROM setores WHERE nome = $1', [SETOR_JURIDICO]);
      niveis = b.todo_setor && setor ? ['coordenador', 'supervisor', 'usuario'] : [];
      setores = b.todo_setor && setor ? [setor.id] : [];
    }
    const salva = await regras.salvar(PERMISSAO, { niveis, setores, pessoas: Array.isArray(b.pessoas) ? b.pessoas : atual.pessoas }, req.usuario);
    await seg.auditar(req, 'regra_acesso', null, { chave: PERMISSAO, ...salva });
    res.json(await equipe());
  });

  /* ===================== análises disponíveis ===================== */
  r.get('/api/contratos/analises', async (req, res) => {
    const p = await perfil(req.usuario);
    if (!p.executivo && !p.admin) return erro(res, 403, 'Só executivos de negócios cadastrados pedem contrato.');
    res.json({ validade_proposta: p.politica.validade_dias, analises: await analisesDisponiveis(p, req.usuario) });
  });

  /* ===================== listagem ===================== */
  r.get('/api/contratos', async (req, res) => {
    const u = req.usuario;
    const p = await perfil(u);
    const args = [];
    const v = (x) => { args.push(x); return '$' + args.length; };
    const where = [];
    const vis = String(req.query.vis || 'minhas');
    if (vis === 'minhas') where.push(`(c.solicitante_id = ${v(u.id)} OR c.executivo_id = ${v(p.executivo ? p.executivo.id : 0)})`);
    else if (vis === 'fila') { if (!p.elaborador) return erro(res, 403, 'A fila é de quem elabora os contratos.'); where.push("c.etapa IN ('fila','em_elaboracao','pendencia','conferencia')"); }
    else if (vis === 'controle') {
      // controle: tudo o que já foi enviado (quem não elabora nem é diretoria vê só as suas)
      where.push("c.etapa <> 'rascunho'");
      if (!p.elaborador && !p.diretoria) where.push(`(c.solicitante_id = ${v(u.id)} OR c.executivo_id = ${v(p.executivo ? p.executivo.id : 0)})`);
      if (ETAPAS.includes(String(req.query.etapa))) where.push(`c.etapa = ${v(String(req.query.etapa))}`);
      if (req.query.executivo) where.push(`c.executivo_id = ${v(Number(req.query.executivo) || 0)}`);
    }
    else if (vis === 'diretoria') {
      if (!p.diretoria) return erro(res, 403, 'Só a diretoria.');
      where.push("c.etapa IN ('fila','em_elaboracao','pendencia') AND jsonb_array_length(COALESCE(c.diretoria->'itens', '[]'::jsonb)) > 0 AND c.diretoria->>'decidido_em' IS NULL");
    } else if (vis === 'todas') { if (!p.elaborador && !p.diretoria) return erro(res, 403, 'O histórico é de quem elabora e da diretoria.'); where.push("c.etapa <> 'rascunho'"); }
    else return erro(res, 400, 'Visão inválida.');
    const busca = texto(req.query.q, 100);
    if (busca) where.push(`(c.condominio ILIKE ${v('%' + busca + '%')} OR c.protocolo ILIKE $${args.length} OR c.cnpj ILIKE $${args.length})`);
    const { rows } = await db.q(`SELECT c.id, c.protocolo, c.etapa, c.origem, c.analise_id, c.analise_protocolo, c.condominio, c.cnpj, c.uf, c.enviado_em, c.prazo,
        c.minuta_enviada_em, c.ajustes, c.assinado_em, c.fechado_em, c.criado_em, c.atualizado_em, c.diretoria, c.executivo_id, e.nome AS executivo_nome, ur.nome AS responsavel_nome,
        (SELECT MIN(ev.criado_em) FROM contrato_eventos ev WHERE ev.contrato_id = c.id AND ev.tipo = 'minuta_enviada') AS primeira_minuta_em,
        (SELECT array_agg(DISTINCT d.tipo) FROM contrato_documentos d WHERE d.contrato_id = c.id AND d.substituido_em IS NULL) AS tipos
      FROM contratos c LEFT JOIN executivos e ON e.id = c.executivo_id LEFT JOIN usuarios ur ON ur.id = c.responsavel_id
      WHERE ${where.join(' AND ')}
      ORDER BY (c.etapa IN ${ABERTAS}) DESC, c.prazo NULLS LAST, c.atualizado_em DESC LIMIT 500`, args);
    const agora = new Date();
    const contratos = rows.map(({ tipos, diretoria, ...x }) => ({ ...x,
      atrasado: ['fila', 'em_elaboracao'].includes(x.etapa) && !!x.prazo && new Date(x.prazo) < agora,
      diretoria: (diretoria.itens || []).length ? (diretoria.decidido_em ? (diretoria.aprovado ? 'aprovado' : 'nao_aprovado') : 'aguardando') : null,
      pendentes: ['rascunho', 'cancelada', 'assinado'].includes(x.etapa) ? [] : F.pendencias(new Set(tipos || [])) }));
    const out = { contratos };
    if (vis === 'controle') {
      const mes = diaBrasilia(agora).slice(0, 7);
      const conta = (f) => contratos.filter(f).length;
      out.contadores = { fila: conta((x) => x.etapa === 'fila'), em_elaboracao: conta((x) => x.etapa === 'em_elaboracao'), pendencia: conta((x) => x.etapa === 'pendencia'),
        minuta_enviada: conta((x) => x.etapa === 'minuta_enviada'), conferencia: conta((x) => x.etapa === 'conferencia'),
        assinados_mes: conta((x) => x.etapa === 'assinado' && x.fechado_em && diaBrasilia(new Date(x.fechado_em)).slice(0, 7) === mes), atrasados: conta((x) => x.atrasado) };
    }
    res.json(out);
  });

  /* ===================== criar (rascunho) ===================== */
  r.post('/api/contratos', json, async (req, res) => {
    const u = req.usuario;
    const p = await perfil(u);
    if (!p.executivo && !p.admin) return erro(res, 403, 'Só executivos de negócios cadastrados pedem contrato.');
    const b = req.body || {};
    if (b.origem === 'entrega') {
      // condomínio de entrega (construtora entregando): sem análise de crédito; a diretoria aprova taxa e boleto antes da minuta
      let executivoId = p.executivo ? p.executivo.id : null;
      if (p.admin && b.executivo_id) executivoId = ((await db.um('SELECT id FROM executivos WHERE id = $1 AND ativo', [Number(b.executivo_id) || 0])) || {}).id || null;
      const id = await db.tx(async (t) => {
        const { id: novo } = await t.um("INSERT INTO contratos (etapa, origem, executivo_id, solicitante_id, formulario) VALUES ('rascunho', 'entrega', $1, $2, $3::jsonb) RETURNING id",
          [executivoId, u.id, JSON.stringify({ desconto_tipo: 'nenhum' })]);
        await evento(t, novo, u.id, 'criada', { origem: 'entrega' });
        return novo;
      });
      return res.status(201).json({ id });
    }
    if (b.origem !== 'analise') return erro(res, 400, 'Origem inválida.');
    const [disp] = await analisesDisponiveis(p, u, Number(b.analise_id) || -1);
    if (!disp) return erro(res, 404, 'Análise não encontrada, ou já tem solicitação de contrato aberta.');
    const a = await db.um('SELECT * FROM analises WHERE id = $1', [disp.id]);
    const { formulario, referencia } = F.daAnalise(a);
    const id = await db.tx(async (t) => {
      const { id: novo } = await t.um(`INSERT INTO contratos (etapa, origem, analise_id, analise_protocolo, condominio, cnpj, uf, executivo_id, solicitante_id, formulario, referencia)
        VALUES ('rascunho', 'analise', $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb) RETURNING id`,
      [a.id, a.protocolo, formulario.nome, formulario.cnpj, formulario.uf, a.executivo_id, u.id, JSON.stringify(formulario), JSON.stringify(referencia)]);
      // a convenção e o retorno da análise vêm junto
      for (const [de, para] of [['convencao', 'convencao'], ['retorno_pdf', 'analise_credito']]) {
        await t.q(`INSERT INTO contrato_documentos (contrato_id, tipo, nome, mime, tamanho, sha256, conteudo, enviado_por, enviado_em)
          SELECT $1, $2, nome, mime, tamanho, sha256, conteudo, enviado_por, enviado_em FROM analise_documentos
          WHERE id = (SELECT MAX(id) FROM analise_documentos WHERE analise_id = $3 AND tipo = $4 AND substituido_em IS NULL)`, [novo, para, a.id, de]);
      }
      await evento(t, novo, u.id, 'criada', { origem: 'analise', analise: a.protocolo });
      return novo;
    });
    res.status(201).json({ id });
  });

  /* análise feita antes do portal: o comercial anexa o PDF do retorno (o mesmo leitor da Implantação) */
  r.post('/api/contratos/pdf', corpoDoc, async (req, res) => {
    const u = req.usuario;
    const p = await perfil(u);
    if (!p.executivo && !p.admin) return erro(res, 403, 'Só executivos de negócios cadastrados pedem contrato.');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return erro(res, 400, 'Anexe o PDF do Retorno de Análise de Crédito.');
    let lido;
    try { lido = leitorPdf.lerRetorno(await leitorPdf.extrair(buf)); } catch (e) { return erro(res, 400, e.message); }
    if (!lido.reconhecido) return erro(res, 400, 'Não reconheci este PDF como um Retorno de Análise de Crédito (o modelo de 4 páginas). Confira o arquivo.');
    if (!lido.protocolo || !lido.data) return erro(res, 400, 'Não achei o protocolo e a data da análise no PDF.');
    const existente = await db.um("SELECT protocolo FROM contratos WHERE analise_protocolo = $1 AND etapa <> 'cancelada' LIMIT 1", [lido.protocolo]);
    const noPortal = await db.um("SELECT id FROM analises WHERE protocolo = $1 AND etapa = 'enviada'", [lido.protocolo]);
    const resumo = { lido, existente: existente ? existente.protocolo || 'rascunho' : null, no_portal: !!noPortal,
      dias: Math.floor((Date.now() - new Date(`${lido.data}T12:00:00-03:00`).getTime()) / DIA_MS), validade_proposta: p.politica.validade_dias };
    const acao = String(req.query.acao || 'ler');
    if (acao === 'ler') return res.json(resumo);
    if (acao !== 'criar') return erro(res, 400, 'Ação inválida.');
    if (existente) return erro(res, 409, `A análise ${lido.protocolo} já tem solicitação de contrato (${resumo.existente}).`);
    if (noPortal) return erro(res, 409, `A análise ${lido.protocolo} está no portal: use a origem "A partir de uma Análise de Crédito".`);
    if (!['aprovada', 'ressalvas'].includes(lido.resultado)) return erro(res, 409, 'Só análise aprovada ou aprovada com ressalvas abre solicitação de contrato.');
    let executivoId = p.executivo ? p.executivo.id : null;
    if (!executivoId && lido.executivo) executivoId = ((await db.um('SELECT id FROM executivos WHERE ativo AND lower(nome) = lower($1)', [lido.executivo])) || {}).id || null;
    const { formulario, referencia } = F.doPdf(lido);
    const id = await db.tx(async (t) => {
      const { id: novo } = await t.um(`INSERT INTO contratos (etapa, origem, analise_protocolo, condominio, cnpj, uf, executivo_id, solicitante_id, formulario, referencia)
        VALUES ('rascunho', 'pdf', $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb) RETURNING id`,
      [lido.protocolo, formulario.nome, formulario.cnpj, formulario.uf, executivoId, u.id, JSON.stringify(formulario), JSON.stringify(referencia)]);
      let nome = 'analise.pdf';
      try { nome = decodeURIComponent(String(req.headers['x-nome-arquivo'] || nome)).replace(/[\\/\r\n"]/g, '_').slice(0, 200) || nome; } catch { /* mantém */ }
      await t.q(`INSERT INTO contrato_documentos (contrato_id, tipo, nome, mime, tamanho, sha256, conteudo, enviado_por) VALUES ($1, 'analise_credito', $2, 'application/pdf', $3, $4, $5, $6)`,
        [novo, nome, buf.length, crypto.createHash('sha256').update(buf).digest('hex'), buf, u.id]);
      await evento(t, novo, u.id, 'criada', { origem: 'pdf', analise: lido.protocolo });
      return novo;
    });
    res.status(201).json({ id, ...resumo });
  });

  /* ===================== detalhe ===================== */
  r.get('/api/contratos/:id', async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, p, pd } = x;
    const info = await db.um(`SELECT e.nome AS executivo_nome, e.uf AS executivo_uf, us.nome AS solicitante_nome, ur.nome AS responsavel_nome
      FROM contratos c LEFT JOIN executivos e ON e.id = c.executivo_id LEFT JOIN usuarios us ON us.id = c.solicitante_id
      LEFT JOIN usuarios ur ON ur.id = c.responsavel_id WHERE c.id = $1`, [c.id]);
    const documentos = (await db.q(`SELECT d.id, d.tipo, d.nome, d.mime, d.tamanho, d.enviado_em, d.substituido_em, u.nome AS enviado_por_nome
      FROM contrato_documentos d LEFT JOIN usuarios u ON u.id = d.enviado_por WHERE d.contrato_id = $1 ORDER BY d.id`, [c.id])).rows;
    const eventos = (await db.q(`SELECT ev.id, ev.tipo, ev.detalhe, ev.criado_em, u.nome AS usuario_nome FROM contrato_eventos ev
      LEFT JOIN usuarios u ON u.id = ev.usuario_id WHERE ev.contrato_id = $1 ORDER BY ev.id`, [c.id])).rows;
    const docs = new Set(documentos.filter((d) => !d.substituido_em).map((d) => d.tipo));
    const implantacao = await db.um("SELECT id, protocolo, etapa FROM implantacoes WHERE contrato_id = $1 AND etapa <> 'cancelada' ORDER BY id DESC LIMIT 1", [c.id]);
    const fechado = c.fechado && c.fechado.taxa_adm !== undefined ? c.fechado : F.fechadoInicial(c);
    const fechadoPor = c.fechado_por ? await db.um('SELECT nome FROM usuarios WHERE id = $1', [c.fechado_por]) : null;
    await db.q('UPDATE notificacoes SET lida = TRUE WHERE usuario_id = $1 AND link = $2 AND NOT lida', [req.usuario.id, link(c.id)]);
    const f = c.formulario || {};
    res.json({
      contrato: { ...c, ...info, fechado, fechado_por_nome: fechadoPor ? fechadoPor.nome : null }, documentos, eventos, pode: pd, implantacao,
      faltas_fechado: pd.registrar ? F.faltasFechado(fechado) : [],
      diferencas_fechado: ['conferencia', 'assinado'].includes(c.etapa) ? F.diferencasFechado(c.formulario || {}, fechado) : [],
      faltas: pd.enviar ? F.faltas(f, { docs, executivoId: c.executivo_id }) : [],
      avisos: F.avisos(f, { origem: c.origem, diasAnalise: await diasDaAnalise(c), validadeProposta: p.politica.validade_dias }),
      itens_diretoria: c.etapa === 'rascunho' || pd.editar ? F.itensDiretoria(f, c.origem) : (c.diretoria.itens || []),
      pendencias: F.pendencias(docs),
      diferencas: c.origem === 'entrega' ? [] : F.diferencas(f, c.referencia),
    });
  });

  /* solicitação em PDF (quem vê pode exportar) */
  r.get('/api/contratos/:id/formulario.pdf', async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c } = x;
    const info = await db.um(`SELECT e.nome AS executivo_nome, ur.nome AS responsavel_nome FROM contratos c LEFT JOIN executivos e ON e.id = c.executivo_id
      LEFT JOIN usuarios ur ON ur.id = c.responsavel_id WHERE c.id = $1`, [c.id]);
    const documentos = (await db.q('SELECT tipo, nome, enviado_em, substituido_em FROM contrato_documentos WHERE contrato_id = $1 ORDER BY id', [c.id])).rows;
    const origemTexto = c.origem === 'analise' ? `Análise de Crédito ${c.analise_protocolo || ''}` : c.origem === 'pdf' ? `análise anterior ao portal ${c.analise_protocolo || ''}` : 'condomínio de entrega';
    let pdf;
    try {
      pdf = await gerarPdf(F.montarPdf(c, { executivo: info.executivo_nome, responsavel: info.responsavel_nome, documentos, usuario: req.usuario.nome, origemTexto }));
    } catch (e) { return erro(res, 500, e.message); }
    const nome = `Solicitacao_Contrato_${String(c.condominio || 'condominio').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${c.protocolo || 'rascunho'}.pdf`;
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nome)}`);
    res.set('Cache-Control', 'private, no-store');
    res.send(pdf);
  });

  /* ===================== formulário ===================== */
  r.patch('/api/contratos/:id', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, p, pd } = x;
    const b = req.body || {};
    if (!pd.editar) return erro(res, 403, 'A solicitação só muda enquanto está em rascunho ou com pendência.');
    const f = b.formulario && typeof b.formulario === 'object' && !Array.isArray(b.formulario) ? b.formulario : null;
    if (!f) return erro(res, 400, 'Nada para salvar.');
    let executivoId = c.executivo_id;
    if (b.executivo_id !== undefined && p.admin) {
      const ex = await db.um('SELECT id FROM executivos WHERE id = $1 AND ativo', [Number(b.executivo_id) || 0]);
      if (!ex) return erro(res, 400, 'Executivo não encontrado.');
      executivoId = ex.id;
    }
    await db.tx(async (t) => {
      await t.q('UPDATE contratos SET formulario = $2::jsonb, condominio = $3, cnpj = $4, uf = $5, executivo_id = $6, atualizado_em = now() WHERE id = $1',
        [c.id, JSON.stringify(f), texto(f.nome, 200), f.sem_cnpj ? '' : texto(f.cnpj, 20), texto(f.uf, 2).toUpperCase(), executivoId]);
      await evento(t, c.id, req.usuario.id, 'formulario', {});
    });
    res.json({ ok: true, diferencas: c.origem === 'entrega' ? [] : F.diferencas(f, c.referencia), itens_diretoria: F.itensDiretoria(f, c.origem) });
  });

  /* ===================== documentos ===================== */
  r.post('/api/contratos/:id/documentos', corpoDoc, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, p, pd } = x;
    if (!pd.documentos) return erro(res, 403, 'Os documentos desta solicitação não podem mais mudar.');
    const tipo = String(req.headers['x-tipo'] || '');
    if (!F.DOCUMENTOS[tipo] || tipo === 'analise_credito') return erro(res, 400, 'Tipo de documento inválido.');
    if (tipo === 'minuta' && !pd.minuta) return erro(res, 403, 'A minuta é anexada por quem assumiu a solicitação.');
    // o assinado entra com a minuta no comercial; enquanto a advogada não conclui, ainda dá para trocar o arquivo
    if (['contrato_assinado', 'procuracao'].includes(tipo) && !['minuta_enviada', 'conferencia'].includes(c.etapa)) return erro(res, 409, 'O contrato assinado entra depois que a minuta chega ao comercial.');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return erro(res, 400, 'Arquivo vazio.');
    let nome = 'arquivo';
    try { nome = decodeURIComponent(String(req.headers['x-nome-arquivo'] || 'arquivo')); } catch { /* mantém */ }
    nome = nome.replace(/[\\/\r\n"]/g, '_').slice(0, 200) || 'arquivo';
    const pdf = buf.subarray(0, 5).toString('latin1') === '%PDF-';
    const mime = pdf ? 'application/pdf' : /^[\w.+-]+\/[\w.+-]+$/.test(String(req.headers['content-type'] || '')) ? String(req.headers['content-type']) : 'application/octet-stream';
    const antes = await tiposVigentes(db, c.id);
    const id = await db.tx(async (t) => {
      // um vigente por tipo (o anterior fica no histórico: as versões da minuta continuam lá); "outro" acumula
      if (tipo !== 'outro') await t.q('UPDATE contrato_documentos SET substituido_em = now() WHERE contrato_id = $1 AND tipo = $2 AND substituido_em IS NULL', [c.id, tipo]);
      const d = await t.um(`INSERT INTO contrato_documentos (contrato_id, tipo, nome, mime, tamanho, sha256, conteudo, enviado_por) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [c.id, tipo, nome, mime, buf.length, crypto.createHash('sha256').update(buf).digest('hex'), buf, req.usuario.id]);
      await evento(t, c.id, req.usuario.id, 'documento', { tipo, nome, tamanho: buf.length });
      await t.q('UPDATE contratos SET atualizado_em = now() WHERE id = $1', [c.id]);
      return d.id;
    });
    // documento do síndico que chegou depois do envio: avisa quem assumiu
    if (!['rascunho', 'pendencia'].includes(c.etapa) && F.DOCUMENTOS[tipo].operacional && !antes.has(tipo) && c.responsavel_id) {
      await avisos.notificar([c.responsavel_id], { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: false,
        titulo: `Documento chegou · ${c.protocolo} · ${c.condominio}`, texto: `${req.usuario.nome} anexou: ${F.DOCUMENTOS[tipo].nome}.` });
    }
    res.status(201).json({ id, interno: p.elaborador });
  });

  r.get('/api/contratos/:id/documentos/:did', async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const d = await db.um('SELECT * FROM contrato_documentos WHERE id = $1 AND contrato_id = $2', [Number(req.params.did) || 0, x.c.id]);
    if (!d) return erro(res, 404, 'Documento não encontrado.');
    const pdf = d.mime === 'application/pdf' && d.conteudo.subarray(0, 5).toString('latin1') === '%PDF-';
    res.set('Content-Type', pdf ? 'application/pdf' : 'application/octet-stream');
    res.set('Content-Disposition', `${pdf && req.query.ver === '1' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.nome)}`);
    res.set('Cache-Control', 'private, no-store');
    res.send(d.conteudo);
  });

  r.delete('/api/contratos/:id/documentos/:did', async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    const d = await db.um('SELECT id, tipo, nome FROM contrato_documentos WHERE id = $1 AND contrato_id = $2 AND substituido_em IS NULL', [Number(req.params.did) || 0, c.id]);
    if (!d) return erro(res, 404, 'Documento não encontrado.');
    const pode = d.tipo === 'minuta' ? pd.minuta : pd.tirar_documentos && d.tipo !== 'analise_credito';
    if (!pode) return erro(res, 403, 'Este documento não pode ser removido.');
    await db.tx(async (t) => {
      await t.q('DELETE FROM contrato_documentos WHERE id = $1', [d.id]);
      await evento(t, c.id, req.usuario.id, 'documento_removido', { tipo: d.tipo, nome: d.nome });
    });
    res.json({ ok: true });
  });

  /* ===================== enviar ao Jurídico ===================== */
  r.post('/api/contratos/:id/enviar', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.enviar) return erro(res, 409, 'Esta solicitação já foi enviada.');
    const docs = await tiposVigentes(db, c.id);
    const f = c.formulario || {};
    const lista = F.faltas(f, { docs, executivoId: c.executivo_id });
    if (lista.length) return erro(res, 400, 'Faltam informações para enviar.', { faltas: lista });
    const pend = F.pendencias(docs);
    const itens = F.itensDiretoria(f, c.origem);
    const reenvio = c.etapa === 'pendencia';
    // a decisão da diretoria continua valendo se os itens não mudaram
    const anterior = c.diretoria || {};
    const diretoria = !itens.length ? {} : JSON.stringify(anterior.itens || []) === JSON.stringify(itens) ? anterior : { itens, pedido_em: new Date().toISOString() };
    const novaDiretoria = itens.length && !diretoriaDecidiu({ diretoria }) && diretoria !== anterior;
    const protocolo = c.protocolo || await proximoProtocolo(db);
    const etapa = c.responsavel_id ? 'em_elaboracao' : 'fila';
    const agora = new Date();
    // 72h úteis para a minuta, contadas do envio (no reenvio depois de pendência, recomeçam)
    const prazo = expediente.somarDiasUteis(agora, DIAS_PRAZO);
    await db.tx(async (t) => {
      await t.q(`UPDATE contratos SET protocolo = $2, etapa = $3, enviado_em = COALESCE(enviado_em, $4), prazo = $5, aviso_prazo_em = NULL, diretoria = $6::jsonb,
        aviso_docs_em = $7::date, atualizado_em = now() WHERE id = $1`, [c.id, protocolo, etapa, agora, prazo, JSON.stringify(diretoria), diaBrasilia(agora)]);
      await evento(t, c.id, req.usuario.id, reenvio ? 'reenviada' : 'enviada', { protocolo, prazo, pendentes: pend, diretoria: itens });
    });
    await seg.auditar(req, 'contrato_enviado', null, { contrato: c.id, protocolo, condominio: c.condominio });
    const fimPrazo = quando(prazo);
    const resumoDir = itens.length ? ` Depende da diretoria: ${itens.join(' ')}` : '';
    if (reenvio && c.responsavel_id) {
      await avisos.notificar([c.responsavel_id], { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: true,
        titulo: `Pendência respondida · ${protocolo} · ${c.condominio}`, texto: `${req.usuario.nome} respondeu a pendência da solicitação de contrato de ${c.condominio}. Novo prazo da minuta: ${fimPrazo}.` });
    } else {
      const origem = c.origem === 'entrega' ? 'condomínio de entrega' : `análise ${c.analise_protocolo}`;
      await avisos.notificar(await elaboradores(db, regras), { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: true,
        titulo: `Nova solicitação de contrato · ${protocolo} · ${c.condominio}`,
        texto: `${req.usuario.nome} pediu a minuta de ${c.condominio} (${origem}). Prazo: ${fimPrazo} (72h úteis).${resumoDir}` });
    }
    if (novaDiretoria) {
      await avisos.notificar(await diretores(db, regras), { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: true,
        titulo: `Decisão da diretoria no contrato · ${protocolo} · ${c.condominio}`,
        texto: `${req.usuario.nome} pediu o contrato de ${c.condominio}. Antes da minuta, precisa da diretoria: ${itens.join(' ')}` });
    }
    if (pend.length) {
      await avisos.notificar(await donos(db, c), { link: link(c.id), autor_id: null, tipo: 'contrato', email: false,
        titulo: `Documentos do síndico pendentes · ${protocolo} · ${c.condominio}`,
        texto: `Enviada ao Jurídico. Os documentos não travam o contrato, mas travam a operação depois. Ainda falta: ${pend.join('; ')}. Você recebe um lembrete por e-mail a cada dia útil até chegarem.` });
    }
    res.json({ protocolo, etapa, prazo, pendencias: pend, diretoria: itens });
  });

  /* ===================== Jurídico: assumir, passar, pendência, minuta ===================== */
  r.post('/api/contratos/:id/assumir', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.assumir) return erro(res, c.etapa === 'fila' ? 403 : 409, c.etapa === 'fila' ? 'Só quem elabora contratos assume.' : 'Esta solicitação já foi assumida.');
    await db.tx(async (t) => {
      await t.q("UPDATE contratos SET etapa = 'em_elaboracao', responsavel_id = $2, assumido_em = now(), atualizado_em = now() WHERE id = $1", [c.id, req.usuario.id]);
      await evento(t, c.id, req.usuario.id, 'assumida', {});
    });
    await avisos.notificar(await donos(db, c), { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: false,
      titulo: `Contrato em elaboração · ${c.protocolo} · ${c.condominio}`, texto: `${req.usuario.nome} assumiu a minuta de ${c.condominio}. Prazo: ${quando(c.prazo)}.` });
    res.json({ ok: true });
  });

  r.post('/api/contratos/:id/passar', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.passar) return erro(res, 403, 'Só quem elabora contratos passa a solicitação.');
    const alvo = await db.um('SELECT id, nome, papel FROM usuarios WHERE id = $1 AND ativo', [Number(req.body && req.body.usuario_id) || 0]);
    if (!alvo || !(await regras.pode(alvo, PERMISSAO))) return erro(res, 400, 'Escolha alguém que elabora contratos.');
    if (alvo.id === c.responsavel_id) return erro(res, 409, `${alvo.nome} já está com esta solicitação.`);
    await db.tx(async (t) => {
      await t.q(`UPDATE contratos SET responsavel_id = $2, assumido_em = now(), etapa = CASE WHEN etapa = 'fila' THEN 'em_elaboracao' ELSE etapa END, atualizado_em = now()
        WHERE id = $1`, [c.id, alvo.id]);
      await evento(t, c.id, req.usuario.id, 'passada', { para: alvo.nome });
    });
    await avisos.notificar([alvo.id], { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: true,
      titulo: `Solicitação de contrato com você · ${c.protocolo} · ${c.condominio}`,
      texto: `${req.usuario.nome} passou a minuta de ${c.condominio} para você.${c.prazo && ['fila', 'em_elaboracao'].includes(c.etapa) ? ` Prazo: ${quando(c.prazo)}.` : ''}` });
    res.json({ ok: true });
  });

  r.post('/api/contratos/:id/pendencia', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.pendencia) return erro(res, 403, 'Só quem assumiu a solicitação devolve com pendência.');
    const itens = (Array.isArray(req.body && req.body.itens) ? req.body.itens : []).map((v) => texto(v, 500)).filter(Boolean);
    if (!itens.length) return erro(res, 400, 'Liste o que falta.');
    const ex = c.executivo_id ? await db.um('SELECT nome FROM executivos WHERE id = $1', [c.executivo_id]) : null;
    const mensagem = `Olá${ex ? `, ${ex.nome.split(' ')[0]}` : ''}. Para seguir com a minuta do ${c.condominio} (${c.protocolo}), precisamos de:\n\n${itens.map((v, k) => `${k + 1}. ${v}`).join('\n')}\n\nAjuste a solicitação e reenvie pelo portal.`;
    await db.tx(async (t) => {
      await t.q("UPDATE contratos SET etapa = 'pendencia', atualizado_em = now() WHERE id = $1", [c.id]);
      await evento(t, c.id, req.usuario.id, 'pendencia', { itens, mensagem });
    });
    await avisos.notificar(await donos(db, c), { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: true,
      titulo: `Pendência na solicitação de contrato · ${c.protocolo} · ${c.condominio}`, texto: mensagem });
    res.json({ ok: true, mensagem });
  });

  r.post('/api/contratos/:id/minuta', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.minuta) return erro(res, 403, 'Só quem assumiu a solicitação envia a minuta.');
    if (!pd.enviar_minuta) return erro(res, 409, 'A diretoria ainda não decidiu os itens que dependem dela.');
    const m = await db.um("SELECT nome, enviado_em FROM contrato_documentos WHERE contrato_id = $1 AND tipo = 'minuta' AND substituido_em IS NULL ORDER BY id DESC LIMIT 1", [c.id]);
    if (!m) return erro(res, 400, 'Anexe a minuta antes de enviar.');
    if (c.ultimo_ajuste_em && new Date(m.enviado_em) < new Date(c.ultimo_ajuste_em)) return erro(res, 400, 'Anexe a minuta ajustada (a que está anexada é de antes do pedido de ajuste).');
    const msg = texto(req.body && req.body.mensagem, 2000);
    const agora = new Date();
    const noPrazo = !c.prazo || agora <= new Date(c.prazo);
    await db.tx(async (t) => {
      await t.q("UPDATE contratos SET etapa = 'minuta_enviada', minuta_enviada_em = $2, atualizado_em = now() WHERE id = $1", [c.id, agora]);
      await evento(t, c.id, req.usuario.id, 'minuta_enviada', { nome: m.nome, no_prazo: noPrazo, ajuste: c.ajustes, mensagem: msg });
    });
    await avisos.notificar(await donos(db, c), { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: true,
      titulo: `${c.ajustes ? 'Minuta ajustada' : 'Minuta do contrato'} pronta · ${c.protocolo} · ${c.condominio}`,
      texto: `${req.usuario.nome} enviou a minuta de ${c.condominio} (${m.nome}). Leve ao síndico; se ele pedir mudanças, use "Pedir ajuste"; assinado, anexe o contrato no portal.${msg ? `\n\n${msg}` : ''}` });
    res.json({ ok: true, no_prazo: noPrazo });
  });

  /* ===================== diretoria ===================== */
  r.post('/api/contratos/:id/diretoria', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.decidir_diretoria) return erro(res, 403, 'Só a diretoria decide, e só enquanto a solicitação espera por ela.');
    const aprovar = req.body && req.body.aprovar === true;
    const obs = texto(req.body && req.body.observacao, 1000);
    if (!aprovar && !obs) return erro(res, 400, 'Diga o motivo de não aprovar (o Jurídico segue o contrato padrão).');
    const d = { ...c.diretoria, aprovado: aprovar, observacao: obs, por: req.usuario.nome, decidido_em: new Date().toISOString() };
    await db.tx(async (t) => {
      await t.q('UPDATE contratos SET diretoria = $2::jsonb, atualizado_em = now() WHERE id = $1', [c.id, JSON.stringify(d)]);
      await evento(t, c.id, req.usuario.id, aprovar ? 'diretoria_aprovou' : 'diretoria_recusou', { observacao: obs });
    });
    const para = [...(await donos(db, c)), ...(c.responsavel_id ? [c.responsavel_id] : await elaboradores(db, regras))];
    await avisos.notificar(para, { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: true,
      titulo: `Diretoria ${aprovar ? 'aprovou' : 'não aprovou'} · ${c.protocolo} · ${c.condominio}`,
      texto: `${req.usuario.nome} ${aprovar ? 'aprovou' : 'não aprovou'}: ${(c.diretoria.itens || []).join(' ')}${obs ? ` Observação: ${obs}` : ''}${aprovar ? '' : ' A minuta segue o contrato padrão nesses pontos.'}` });
    res.json({ ok: true });
  });

  /* ===================== comercial: ajuste e contrato assinado ===================== */
  r.post('/api/contratos/:id/ajuste', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.ajuste) return erro(res, 403, 'O ajuste é pedido pelo comercial depois que a minuta chega.');
    const pedido = texto(req.body && req.body.texto, 4000);
    if (!pedido) return erro(res, 400, 'Diga o que o síndico pediu para mudar.');
    const agora = new Date();
    const prazo = expediente.somarDiasUteis(agora, DIAS_PRAZO);
    await db.tx(async (t) => {
      await t.q(`UPDATE contratos SET etapa = 'em_elaboracao', ajustes = ajustes + 1, ultimo_ajuste_em = $2, prazo = $3, aviso_prazo_em = NULL, atualizado_em = now() WHERE id = $1`,
        [c.id, agora, prazo]);
      await evento(t, c.id, req.usuario.id, 'ajuste', { texto: pedido, prazo });
    });
    await avisos.notificar(c.responsavel_id ? [c.responsavel_id] : await elaboradores(db, regras), { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: true,
      titulo: `Ajuste na minuta · ${c.protocolo} · ${c.condominio}`, texto: `${req.usuario.nome} pediu ajuste na minuta de ${c.condominio}: ${pedido}\n\nPrazo: ${quando(prazo)} (72h úteis).` });
    res.json({ ok: true, prazo });
  });

  r.post('/api/contratos/:id/assinado', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.assinar) return erro(res, 403, 'O contrato assinado entra depois que a minuta chega ao comercial.');
    const docs = await tiposVigentes(db, c.id);
    if (!docs.has('contrato_assinado')) return erro(res, 400, 'Anexe o contrato assinado.');
    if (!docs.has('procuracao') && !(req.body && req.body.procuracao_no_contrato === true)) {
      return erro(res, 400, 'Anexe a procuração assinada, ou confirme que ela está no mesmo arquivo do contrato.');
    }
    // a advogada parte do que foi pedido (e do que a diretoria decidiu) e registra o que ficou no contrato assinado
    await db.tx(async (t) => {
      await t.q("UPDATE contratos SET etapa = 'conferencia', assinado_em = now(), fechado = $2::jsonb, atualizado_em = now() WHERE id = $1", [c.id, JSON.stringify(F.fechadoInicial(c))]);
      await evento(t, c.id, req.usuario.id, 'assinado', { procuracao: docs.has('procuracao') ? 'anexada' : 'no contrato' });
    });
    await seg.auditar(req, 'contrato_assinado', null, { contrato: c.id, protocolo: c.protocolo, condominio: c.condominio });
    await avisos.notificar(c.responsavel_id ? [c.responsavel_id] : await elaboradores(db, regras), { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: true,
      titulo: `Registrar as condições fechadas · ${c.protocolo} · ${c.condominio}`,
      texto: `${req.usuario.nome} anexou o contrato assinado de ${c.condominio}. Confira e registre as condições fechadas: elas seguem para a Implantação.` });
    res.json({ ok: true });
  });

  /* ===================== advogada: condições fechadas (salvar e concluir) ===================== */
  r.put('/api/contratos/:id/fechado', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.registrar) return erro(res, 403, 'As condições fechadas são registradas por quem elabora, depois que o contrato assinado é anexado.');
    const fechado = F.normalizarFechado(req.body && req.body.condicoes);
    const concluir = !!(req.body && req.body.concluir);
    if (concluir) {
      const lista = F.faltasFechado(fechado);
      if (lista.length) return erro(res, 400, 'Faltam condições para concluir.', { faltas: lista });
    }
    // implantação já aberta para a mesma análise, ainda sem contrato: passa a mostrar estas condições
    const imp = concluir ? await db.um(`SELECT id, protocolo, responsavel_id FROM implantacoes WHERE etapa <> 'cancelada' AND (contrato_id = $3 OR (contrato_id IS NULL
      AND ((analise_id IS NOT NULL AND analise_id = $1) OR (analise_protocolo IS NOT NULL AND analise_protocolo = $2)))) ORDER BY id DESC LIMIT 1`, [c.analise_id, c.analise_protocolo, c.id]) : null;
    await db.tx(async (t) => {
      if (concluir) {
        await t.q("UPDATE contratos SET fechado = $2::jsonb, fechado_por = $3, fechado_em = now(), concluido_em = now(), etapa = 'assinado', atualizado_em = now() WHERE id = $1",
          [c.id, JSON.stringify(fechado), req.usuario.id]);
        await evento(t, c.id, req.usuario.id, 'fechado', { diferencas: F.diferencasFechado(c.formulario || {}, fechado).map((d) => d.rotulo), implantacao: imp ? imp.protocolo || imp.id : null });
        if (imp) {
          await t.q('UPDATE implantacoes SET contrato_id = $2, atualizado_em = now() WHERE id = $1', [imp.id, c.id]);
          await t.q('INSERT INTO implantacao_eventos (implantacao_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)', [imp.id, req.usuario.id, 'contrato', JSON.stringify({ protocolo: c.protocolo })]);
        }
      } else await t.q('UPDATE contratos SET fechado = $2::jsonb, atualizado_em = now() WHERE id = $1', [c.id, JSON.stringify(fechado)]);
    });
    if (!concluir) return res.json({ ok: true, faltas: F.faltasFechado(fechado) });
    await seg.auditar(req, 'contrato_fechado', null, { contrato: c.id, protocolo: c.protocolo, condominio: c.condominio });
    await avisos.notificar(await donos(db, c), { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: true,
      titulo: `Contrato concluído · ${c.protocolo} · ${c.condominio}`,
      texto: imp ? `${req.usuario.nome} registrou as condições fechadas de ${c.condominio}. Elas já aparecem na implantação ${imp.protocolo || 'em rascunho'}.`
        : `${req.usuario.nome} registrou as condições fechadas de ${c.condominio}. Próximo passo: abrir a implantação; as condições, o contrato e os documentos seguem junto.` });
    if (imp && imp.responsavel_id) {
      await avisos.notificar([imp.responsavel_id], { link: `#/implantacao/${imp.id}`, autor_id: req.usuario.id, tipo: 'implantacao', email: false,
        titulo: `Condições fechadas do contrato · ${imp.protocolo} · ${c.condominio}`, texto: `O contrato ${c.protocolo} foi concluído: as condições fechadas estão na implantação.` });
    }
    res.json({ ok: true, implantacao: imp ? imp.id : null });
  });

  /* contrato já concluído: quem elabora corrige as condições fechadas, com o motivo; o histórico guarda o que mudou */
  r.post('/api/contratos/:id/corrigir', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.corrigir) return erro(res, 403, 'As condições fechadas são corrigidas por quem elabora, depois que o contrato foi concluído.');
    const motivo = texto(req.body && req.body.motivo, 1000);
    if (!motivo) return erro(res, 400, 'Diga o motivo da correção.');
    const fechado = F.normalizarFechado(req.body && req.body.condicoes);
    const lista = F.faltasFechado(fechado);
    if (lista.length) return erro(res, 400, 'Faltam condições.', { faltas: lista });
    const mudancas = F.mudancasFechado(c.fechado, fechado);
    if (!mudancas.length) return erro(res, 400, 'Nada mudou nas condições fechadas.');
    await db.tx(async (t) => {
      await t.q('UPDATE contratos SET fechado = $2::jsonb, atualizado_em = now() WHERE id = $1', [c.id, JSON.stringify(fechado)]);
      await evento(t, c.id, req.usuario.id, 'fechado_corrigido', { motivo, mudancas });
    });
    await seg.auditar(req, 'contrato_corrigido', null, { contrato: c.id, protocolo: c.protocolo, mudancas: mudancas.map((m) => m.rotulo) });
    const resumo = mudancas.map((m) => `${m.rotulo}: ${m.antes} → ${m.depois}`).join('; ');
    const imp = await db.um("SELECT id, protocolo, etapa, responsavel_id FROM implantacoes WHERE contrato_id = $1 AND etapa <> 'cancelada' ORDER BY id DESC LIMIT 1", [c.id]);
    await avisos.notificar(await donos(db, c), { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: true,
      titulo: `Condições do contrato corrigidas · ${c.protocolo} · ${c.condominio}`,
      texto: `${req.usuario.nome} corrigiu as condições fechadas de ${c.condominio}. Motivo: ${motivo}\n\n${resumo}${imp && ['rascunho', 'pendencia'].includes(imp.etapa) ? `\n\nA implantação ${imp.protocolo || 'em rascunho'} está com você: confira o formulário.` : ''}` });
    if (imp) {
      await db.q('INSERT INTO implantacao_eventos (implantacao_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)', [imp.id, req.usuario.id, 'contrato_corrigido', JSON.stringify({ protocolo: c.protocolo, motivo })]);
      // quem conduz (ou a coordenação da Implantação, se ninguém conduz) confere a implantação
      const para = imp.responsavel_id ? [imp.responsavel_id] : (await db.q(`SELECT u.id FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id JOIN usuarios u ON u.id = sm.usuario_id
        WHERE s.nome = 'Implantação' AND u.ativo AND (sm.lider OR u.papel IN ('coordenador','supervisor'))`)).rows.map((r) => r.id);
      if (!['rascunho', 'cancelada'].includes(imp.etapa)) {
        await avisos.notificar(para, { link: `#/implantacao/${imp.id}`, autor_id: req.usuario.id, tipo: 'implantacao', email: true,
          titulo: `Contrato corrigido · ${imp.protocolo} · ${c.condominio}`, texto: `${req.usuario.nome} corrigiu as condições fechadas do contrato ${c.protocolo}. Motivo: ${motivo}\n\n${resumo}` });
      }
    }
    res.json({ ok: true, mudancas });
  });

  r.post('/api/contratos/:id/cancelar', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.cancelar) return erro(res, 403, 'Esta solicitação não pode ser cancelada.');
    const motivo = texto(req.body && req.body.motivo, 1000);
    await db.tx(async (t) => {
      await t.q("UPDATE contratos SET etapa = 'cancelada', atualizado_em = now() WHERE id = $1", [c.id]);
      await evento(t, c.id, req.usuario.id, 'cancelada', { motivo });
    });
    if (c.etapa !== 'rascunho') {
      await avisos.notificar([...(await donos(db, c)), c.responsavel_id], { link: link(c.id), autor_id: req.usuario.id, tipo: 'contrato', email: false,
        titulo: `Solicitação de contrato cancelada · ${c.protocolo} · ${c.condominio}`, texto: `${req.usuario.nome} cancelou a solicitação de contrato de ${c.condominio}.${motivo ? ` Motivo: ${motivo}` : ''}` });
    }
    res.json({ ok: true });
  });

  return r;
}

module.exports = { rotasContratos, criarRotinasContratos, proximoProtocolo, ETAPAS, ORIGEM, PERMISSAO, DOC_IMPLANTACAO: F.DOC_IMPLANTACAO };

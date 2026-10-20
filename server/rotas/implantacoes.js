'use strict';
/*
 * Implantação: do contrato assinado à Carteira. O comercial (executivo de negócios) pede a implantação a partir de uma
 * análise de crédito liberada, preenche o formulário e anexa os documentos; o setor Implantação conduz; a coordenação
 * confirma a entrada na Carteira.
 *
 * Etapas: rascunho → fila (enviada, aguardando designação) → em_implantacao → concluida → na_carteira.
 *         pendencia: devolvida ao comercial. diretoria: condomínio de entrega aguardando a aprovação de taxa e boleto. cancelada.
 *
 * Quem faz o quê (definido no portal, nunca no código):
 *  - comercial: quem está ligado a um cadastro de executivo (Análise de Crédito → Pessoas e papéis); vê e pede as suas;
 *  - equipe: quem é do setor Implantação; coordenação: o gestor do setor (líder, coordenação ou supervisão);
 *  - gestor da Análise de Crédito: o gestor do setor dos analistas; libera análises além do prazo da política para implantar;
 *  - diretoria: quem chancela análises de crédito; administração: tudo.
 *
 * A análise abre implantação até implantacao_validade_dias (política de crédito, padrão 90) depois da liberação do
 * retorno; depois disso, só com a liberação do gestor da Análise de Crédito.
 */
const express = require('express');
const crypto = require('crypto');
const { politicaAtiva } = require('../credito/banco');
const F = require('../implantacoes/formulario');

const SETOR = 'Implantação';
const ETAPAS = ['rascunho', 'diretoria', 'fila', 'em_implantacao', 'pendencia', 'concluida', 'na_carteira', 'cancelada'];
const ORIGEM = { analise: 'Análise de Crédito', pdf: 'Análise anterior ao portal', entrega: 'Condomínio de entrega' };
const DIA_MS = 24 * 3600 * 1000;

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const diaBrasilia = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

async function proximoProtocolo(db, quando = new Date()) {
  const dia = diaBrasilia(quando);
  const r = await db.um(`INSERT INTO implantacao_protocolos (dia, ultimo) VALUES ($1, 1)
    ON CONFLICT (dia) DO UPDATE SET ultimo = implantacao_protocolos.ultimo + 1 RETURNING ultimo`, [dia]);
  return `IMP-${dia}-${String(r.ultimo).padStart(2, '0')}`;
}

/* pessoas de um setor: gestores (líder, coordenação ou supervisão) e o resto da equipe */
async function pessoasDoSetor(db, seg, nome) {
  const { rows } = await db.q(`SELECT u.id, u.papel, sm.lider FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id JOIN usuarios u ON u.id = sm.usuario_id
    WHERE s.nome = $1 AND u.ativo ORDER BY u.nome`, [nome]);
  const gestor = (x) => x.lider || seg.GESTORES_DE_SETOR.includes(x.papel);
  return { gestores: rows.filter(gestor).map((x) => x.id), equipe: rows.filter((x) => !gestor(x)).map((x) => x.id), todos: rows.map((x) => x.id) };
}
const administradores = async (db) => (await db.q("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo")).rows.map((x) => x.id);

/* quem é dono da implantação (recebe as pendências): quem pediu e o executivo */
async function donos(db, i) {
  const ex = i.executivo_id ? await db.um('SELECT usuario_id FROM executivos WHERE id = $1', [i.executivo_id]) : null;
  return [i.solicitante_id, ex && ex.usuario_id];
}

async function tiposVigentes(db, id) {
  return new Set((await db.q('SELECT DISTINCT tipo FROM implantacao_documentos WHERE implantacao_id = $1 AND substituido_em IS NULL', [id])).rows.map((x) => x.tipo));
}

/* Rotinas (rodam a cada poucos minutos): lembrete diário, por e-mail, dos documentos pendentes ao executivo. */
function criarRotinasImplantacao({ db, avisos, expediente }) {
  async function executar(agora = new Date()) {
    const m = expediente.momento(agora);
    const feito = { documentos: 0 };
    if (!m.noExpediente) return feito;
    const { rows } = await db.q(`SELECT id, protocolo, condominio, formulario, solicitante_id, executivo_id FROM implantacoes
      WHERE etapa IN ('fila','em_implantacao','pendencia','concluida') AND (aviso_docs_em IS NULL OR aviso_docs_em < $1::date)`, [m.dia]);
    for (const i of rows) {
      const pend = F.pendencias(i.formulario || {}, await tiposVigentes(db, i.id));
      if (pend.length) {
        await avisos.notificar(await donos(db, i), { link: `#/implantacao/${i.id}`, tipo: 'implantacao', email: true,
          titulo: `Pendências da implantação · ${i.protocolo} · ${i.condominio}`,
          texto: `Ainda falta enviar: ${pend.join('; ')}. Anexe no portal, na implantação ${i.protocolo}.` });
        feito.documentos++;
      }
      await db.q('UPDATE implantacoes SET aviso_docs_em = $2::date WHERE id = $1', [i.id, m.dia]);
    }
    return feito;
  }
  return { executar };
}

function rotasImplantacoes({ db, seg, cfg, avisos, regras, registros }) {
  const r = express.Router();
  const json = express.json({ limit: '1mb' });
  const corpoDoc = express.raw({ type: () => true, limit: (cfg.limiteCreditoMb || 30) * 1024 * 1024 });
  r.use('/api/implantacoes', seg.exigirLogin);
  const erro = (res, status, msg, extra) => res.status(status).json({ erro: msg, ...(extra || {}) });
  const link = (id) => `#/implantacao/${id}`;
  const evento = (t, id, usuarioId, tipo, detalhe) => t.q('INSERT INTO implantacao_eventos (implantacao_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)',
    [id, usuarioId, tipo, JSON.stringify(detalhe || {})]);

  /* ---------- quem é a pessoa na Implantação ---------- */
  async function perfil(u) {
    const politica = await politicaAtiva(db);
    const admin = u.papel === 'admin';
    const meus = new Map((await db.q('SELECT s.nome, sm.lider FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id WHERE sm.usuario_id = $1', [u.id])).rows.map((x) => [x.nome, !!x.lider]));
    const gestorPapel = seg.GESTORES_DE_SETOR.includes(u.papel);
    const equipe = meus.has(SETOR);
    const executivo = await db.um('SELECT id, nome, uf FROM executivos WHERE usuario_id = $1 AND ativo', [u.id]);
    return {
      admin, equipe, executivo, politica,
      coordenacao: admin || (equipe && (meus.get(SETOR) || gestorPapel)),
      gestorCredito: admin || (meus.has(politica.setor_analistas) && (meus.get(politica.setor_analistas) || gestorPapel)),
      diretoria: admin || (await regras.pode(u, 'credito.diretoria')),
    };
  }

  function pode(p, i, u) {
    const dono = i.solicitante_id === u.id || !!(p.executivo && i.executivo_id === p.executivo.id);
    const interno = p.admin || p.equipe || p.coordenacao || p.diretoria;
    const editavel = ['rascunho', 'pendencia'].includes(i.etapa);
    const aberta = !['cancelada', 'na_carteira'].includes(i.etapa);
    return {
      ver: dono || interno,
      interno,
      editar: editavel && (dono || p.admin),
      documentos: aberta && (dono || p.admin || p.equipe || p.coordenacao),
      tirar_documentos: editavel && (dono || p.admin),
      enviar: editavel && (dono || p.admin),
      cancelar: (editavel && dono) || (p.coordenacao && aberta),
    };
  }

  async function carregar(req, res) {
    const i = await db.um('SELECT * FROM implantacoes WHERE id = $1', [Number(req.params.id) || 0]);
    const p = await perfil(req.usuario);
    if (!i || !pode(p, i, req.usuario).ver) { erro(res, 404, 'Implantação não encontrada.'); return null; }
    return { i, p, pd: pode(p, i, req.usuario) };
  }

  /* ---------- análises que podem virar implantação ---------- */
  async function analisesDisponiveis(p, u, analiseId = null) {
    const args = [];
    const v = (x) => { args.push(x); return '$' + args.length; };
    const where = ["a.etapa = 'enviada'", "a.resultado IN ('aprovada','ressalvas')",
      // a reanálise enviada substitui a análise de origem
      "NOT EXISTS (SELECT 1 FROM analises x WHERE x.origem_id = a.id AND x.etapa = 'enviada')",
      "NOT EXISTS (SELECT 1 FROM implantacoes i WHERE i.analise_id = a.id AND i.etapa <> 'cancelada')"];
    if (!p.admin) where.push(`(a.solicitante_id = ${v(u.id)} OR a.executivo_id = ${v(p.executivo ? p.executivo.id : 0)})`);
    if (analiseId) where.push(`a.id = ${v(analiseId)}`);
    const { rows } = await db.q(`SELECT a.id, a.protocolo, a.condominio, a.cnpj, a.uf, a.resultado, a.taxa_adm, a.boleto, a.executivo_id,
        COALESCE(a.liberada_em, a.enviada_em) AS liberada_em, e.nome AS executivo_nome,
        l.id AS liberacao_id, l.aprovado AS liberacao_aprovada, l.pedido_em AS liberacao_pedida_em, l.observacao AS liberacao_obs
      FROM analises a LEFT JOIN executivos e ON e.id = a.executivo_id
      LEFT JOIN LATERAL (SELECT * FROM implantacao_liberacoes WHERE analise_id = a.id ORDER BY id DESC LIMIT 1) l ON TRUE
      WHERE ${where.join(' AND ')} ORDER BY COALESCE(a.liberada_em, a.enviada_em) DESC LIMIT 200`, args);
    const dias = p.politica.implantacao_validade_dias;
    return rows.map((a) => {
      const limite = new Date(new Date(a.liberada_em).getTime() + dias * DIA_MS);
      const dentro = new Date() <= limite;
      const situacao = dentro ? 'valida' : a.liberacao_aprovada === true ? 'liberada' : a.liberacao_aprovada === false ? 'recusada' : a.liberacao_id ? 'aguardando_gestor' : 'vencida';
      return { ...a, taxa_adm: a.taxa_adm == null ? null : Number(a.taxa_adm), boleto: a.boleto == null ? null : Number(a.boleto), limite, situacao, disponivel: ['valida', 'liberada'].includes(situacao) };
    });
  }

  /* ===================== perfil, contadores e listas auxiliares ===================== */
  r.get('/api/implantacoes/meta', async (req, res) => {
    const p = await perfil(req.usuario);
    res.json({
      perfil: { admin: p.admin, equipe: p.equipe, coordenacao: p.coordenacao, gestor_credito: p.gestorCredito, diretoria: p.diretoria, executivo: p.executivo },
      executivos: p.admin ? (await db.q('SELECT id, nome, uf FROM executivos WHERE ativo ORDER BY nome')).rows : p.executivo ? [p.executivo] : [],
      validade_dias: p.politica.implantacao_validade_dias,
      documentos: Object.entries(F.DOCUMENTOS).map(([tipo, d]) => ({ tipo, ...d })),
      garantias: F.GARANTIAS, receitas_cashback: F.RECEITAS_CASHBACK, origens: ORIGEM,
    });
  });

  r.get('/api/implantacoes/resumo', async (req, res) => {
    const p = await perfil(req.usuario);
    const out = { acesso: !!(p.executivo || p.equipe || p.coordenacao || p.diretoria || p.gestorCredito) };
    if (!out.acesso) return res.json(out);
    if (p.equipe || p.coordenacao) {
      Object.assign(out, await db.um(`SELECT COUNT(*) FILTER (WHERE etapa = 'fila')::int AS fila,
        COUNT(*) FILTER (WHERE etapa = 'em_implantacao' AND responsavel_id = $1)::int AS minhas,
        COUNT(*) FILTER (WHERE etapa = 'concluida')::int AS carteira FROM implantacoes`, [req.usuario.id]));
      if (!p.coordenacao) out.carteira = 0;
    }
    if (p.gestorCredito) out.liberacoes = (await db.um('SELECT COUNT(*)::int AS n FROM implantacao_liberacoes WHERE aprovado IS NULL')).n;
    if (p.executivo || !p.equipe) {
      out.pendencias = (await db.um("SELECT COUNT(*)::int AS n FROM implantacoes WHERE etapa = 'pendencia' AND (solicitante_id = $1 OR executivo_id = $2)",
        [req.usuario.id, p.executivo ? p.executivo.id : 0])).n;
    }
    res.json(out);
  });

  /* parceiros da base de comissão (ferramenta Prestação de Contas — Comissão de Parceiros, coleção "partners") */
  r.get('/api/implantacoes/parceiros', async (req, res) => {
    const m = await db.um("SELECT fonte_dados FROM modulos WHERE slug = 'parceiros'");
    if (!m) return res.json({ parceiros: [], aviso: 'A ferramenta Prestação de Contas — Comissão de Parceiros não está no portal.' });
    const vistos = new Set();
    const parceiros = (await registros.listar('parceiros', 'partners'))
      .filter((x) => x && texto(x.nome, 200))
      .map((x) => ({ id: texto(x.id || x.nome, 120), nome: texto(x.nome, 200), uf: texto(x.uf, 2).toUpperCase() }))
      .filter((x) => !vistos.has(x.id) && vistos.add(x.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    res.json({ parceiros, aviso: parceiros.length ? null : m.fonte_dados === 'interno' ? 'A base de parceiros está vazia.'
      : 'A base de parceiros ainda está na planilha Google: passe a ferramenta de Prestação de Contas para o banco do portal para a lista aparecer aqui.' });
  });

  /* ===================== análises disponíveis e liberação pelo gestor ===================== */
  r.get('/api/implantacoes/analises', async (req, res) => {
    const p = await perfil(req.usuario);
    if (!p.executivo && !p.admin) return erro(res, 403, 'Só executivos de negócios cadastrados pedem implantação.');
    res.json({ validade_dias: p.politica.implantacao_validade_dias, analises: await analisesDisponiveis(p, req.usuario) });
  });

  r.post('/api/implantacoes/liberacoes', json, async (req, res) => {
    const p = await perfil(req.usuario);
    if (!p.executivo && !p.admin) return erro(res, 403, 'Só executivos de negócios cadastrados pedem implantação.');
    const [a] = await analisesDisponiveis(p, req.usuario, Number(req.body && req.body.analise_id) || -1);
    if (!a) return erro(res, 404, 'Análise não encontrada.');
    if (a.situacao !== 'vencida') return erro(res, 409, a.situacao === 'aguardando_gestor' ? 'O pedido já está com o gestor da Análise de Crédito.' : 'Esta análise não precisa de liberação.');
    const motivo = texto(req.body && req.body.motivo, 1000);
    await db.q('INSERT INTO implantacao_liberacoes (analise_id, pedido_por, motivo) VALUES ($1, $2, $3)', [a.id, req.usuario.id, motivo]);
    const dias = Math.floor((Date.now() - new Date(a.liberada_em).getTime()) / DIA_MS);
    const gestores = (await pessoasDoSetor(db, seg, p.politica.setor_analistas)).gestores;
    await avisos.notificar(gestores.length ? gestores : await administradores(db), { link: '#/implantacao/liberacoes', autor_id: req.usuario.id, tipo: 'implantacao', email: true,
      titulo: `Liberar análise para implantação · ${a.protocolo} · ${a.condominio}`,
      texto: `${req.usuario.nome} quer implantar ${a.condominio}: a análise ${a.protocolo} foi liberada há ${dias} dias (a política permite ${p.politica.implantacao_validade_dias}).${motivo ? ` Motivo: ${motivo}` : ''}` });
    await seg.auditar(req, 'implantacao_liberacao_pedida', null, { analise: a.id, protocolo: a.protocolo });
    res.status(201).json({ ok: true });
  });

  r.get('/api/implantacoes/liberacoes', async (req, res) => {
    const p = await perfil(req.usuario);
    if (!p.gestorCredito) return erro(res, 403, 'Só o gestor da Análise de Crédito libera análises para implantação.');
    const { rows } = await db.q(`SELECT l.*, a.protocolo, a.condominio, a.cnpj, a.uf, a.resultado, a.taxa_adm, a.boleto, COALESCE(a.liberada_em, a.enviada_em) AS liberada_em,
        up.nome AS pedido_por_nome, ud.nome AS decidido_por_nome, e.nome AS executivo_nome
      FROM implantacao_liberacoes l JOIN analises a ON a.id = l.analise_id LEFT JOIN usuarios up ON up.id = l.pedido_por LEFT JOIN usuarios ud ON ud.id = l.decidido_por
      LEFT JOIN executivos e ON e.id = a.executivo_id ORDER BY (l.aprovado IS NULL) DESC, l.id DESC LIMIT 100`);
    res.json({ liberacoes: rows });
  });

  r.post('/api/implantacoes/liberacoes/:lid/decidir', json, async (req, res) => {
    const p = await perfil(req.usuario);
    if (!p.gestorCredito) return erro(res, 403, 'Só o gestor da Análise de Crédito libera análises para implantação.');
    const l = await db.um('SELECT l.*, a.protocolo, a.condominio FROM implantacao_liberacoes l JOIN analises a ON a.id = l.analise_id WHERE l.id = $1', [Number(req.params.lid) || 0]);
    if (!l) return erro(res, 404, 'Pedido não encontrado.');
    if (l.aprovado !== null) return erro(res, 409, 'Este pedido já foi decidido.');
    const aprovar = req.body && req.body.aprovar === true;
    const obs = texto(req.body && req.body.observacao, 1000);
    if (!aprovar && !obs) return erro(res, 400, 'Diga o motivo de não liberar.');
    await db.q('UPDATE implantacao_liberacoes SET aprovado = $2, observacao = $3, decidido_por = $4, decidido_em = now() WHERE id = $1', [l.id, aprovar, obs, req.usuario.id]);
    await avisos.notificar([l.pedido_por], { link: '#/implantacao/minhas', autor_id: req.usuario.id, tipo: 'implantacao', email: true,
      titulo: `${aprovar ? 'Análise liberada' : 'Análise não liberada'} para implantação · ${l.protocolo}`,
      texto: aprovar ? `${req.usuario.nome} liberou a análise de ${l.condominio} para implantação. Já dá para abrir a implantação no portal.${obs ? ` Observação: ${obs}` : ''}`
        : `${req.usuario.nome} não liberou a análise de ${l.condominio} para implantação: ${obs} O caminho é pedir reanálise.` });
    await seg.auditar(req, 'implantacao_liberacao_decidida', null, { liberacao: l.id, analise: l.analise_id, aprovado: aprovar });
    res.json({ ok: true });
  });

  /* ===================== listagem ===================== */
  r.get('/api/implantacoes', async (req, res) => {
    const u = req.usuario;
    const p = await perfil(u);
    const args = [];
    const v = (x) => { args.push(x); return '$' + args.length; };
    const where = [];
    const vis = String(req.query.vis || 'minhas');
    const setor = p.equipe || p.coordenacao;
    if (vis === 'minhas') where.push(`(i.solicitante_id = ${v(u.id)} OR i.executivo_id = ${v(p.executivo ? p.executivo.id : 0)})`);
    else if (vis === 'fila') { if (!setor) return erro(res, 403, 'A fila é do setor Implantação.'); where.push("i.etapa IN ('fila','em_implantacao','pendencia')"); }
    else if (vis === 'carteira') { if (!setor) return erro(res, 403, 'Só o setor Implantação.'); where.push("i.etapa = 'concluida'"); }
    else if (vis === 'todas') { if (!setor && !p.diretoria) return erro(res, 403, 'O histórico é do setor Implantação e da diretoria.'); where.push("i.etapa <> 'rascunho'"); }
    else return erro(res, 400, 'Visão inválida.');
    const busca = texto(req.query.q, 100);
    if (busca) where.push(`(i.condominio ILIKE ${v('%' + busca + '%')} OR i.protocolo ILIKE $${args.length} OR i.cnpj ILIKE $${args.length})`);
    const { rows } = await db.q(`SELECT i.id, i.protocolo, i.etapa, i.origem, i.analise_id, i.analise_protocolo, i.condominio, i.cnpj, i.uf, i.formulario,
        i.enviado_em, i.prazo_inicio, i.criado_em, i.atualizado_em, e.nome AS executivo_nome, ur.nome AS responsavel_nome,
        (SELECT array_agg(DISTINCT d.tipo) FROM implantacao_documentos d WHERE d.implantacao_id = i.id AND d.substituido_em IS NULL) AS tipos
      FROM implantacoes i LEFT JOIN executivos e ON e.id = i.executivo_id LEFT JOIN usuarios ur ON ur.id = i.responsavel_id
      WHERE ${where.join(' AND ')}
      ORDER BY (i.etapa IN ('fila','em_implantacao','pendencia')) DESC, i.enviado_em NULLS LAST, i.atualizado_em DESC LIMIT 300`, args);
    res.json({ implantacoes: rows.map(({ formulario, tipos, ...x }) => ({ ...x, uh_total: formulario.uh_total ?? null,
      pendentes: x.etapa === 'rascunho' || x.etapa === 'cancelada' ? [] : F.pendencias(formulario, new Set(tipos || [])) })) });
  });

  /* ===================== criar (rascunho) ===================== */
  r.post('/api/implantacoes', json, async (req, res) => {
    const u = req.usuario;
    const p = await perfil(u);
    if (!p.executivo && !p.admin) return erro(res, 403, 'Só executivos de negócios cadastrados pedem implantação.');
    const b = req.body || {};
    if (b.origem !== 'analise') return erro(res, 400, 'Origem ainda não disponível: por enquanto a implantação nasce de uma análise de crédito do portal.');
    const [disp] = await analisesDisponiveis(p, u, Number(b.analise_id) || -1);
    if (!disp) return erro(res, 404, 'Análise não encontrada, ou já tem implantação aberta.');
    if (!disp.disponivel) {
      return erro(res, 409, disp.situacao === 'aguardando_gestor' ? 'A análise passou do prazo e o pedido de liberação está com o gestor da Análise de Crédito.'
        : disp.situacao === 'recusada' ? 'O gestor da Análise de Crédito não liberou esta análise: peça reanálise.'
          : `A análise foi liberada há mais de ${p.politica.implantacao_validade_dias} dias: peça a liberação ao gestor da Análise de Crédito.`);
    }
    const a = await db.um('SELECT * FROM analises WHERE id = $1', [disp.id]);
    const { formulario, referencia } = F.daAnalise(a);
    const id = await db.tx(async (t) => {
      const { id: novo } = await t.um(`INSERT INTO implantacoes (etapa, origem, analise_id, analise_protocolo, condominio, cnpj, uf, executivo_id, solicitante_id, formulario, referencia)
        VALUES ('rascunho', 'analise', $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb) RETURNING id`,
      [a.id, a.protocolo, formulario.nome, formulario.cnpj, formulario.uf, a.executivo_id, u.id, JSON.stringify(formulario), JSON.stringify(referencia)]);
      // a convenção e o retorno da análise vêm junto
      for (const [de, para] of [['convencao', 'convencao'], ['retorno_pdf', 'analise_credito']]) {
        await t.q(`INSERT INTO implantacao_documentos (implantacao_id, tipo, nome, mime, tamanho, sha256, conteudo, enviado_por, enviado_em)
          SELECT $1, $2, nome, mime, tamanho, sha256, conteudo, enviado_por, enviado_em FROM analise_documentos
          WHERE id = (SELECT MAX(id) FROM analise_documentos WHERE analise_id = $3 AND tipo = $4 AND substituido_em IS NULL)`, [novo, para, a.id, de]);
      }
      await evento(t, novo, u.id, 'criada', { origem: 'analise', analise: a.protocolo });
      return novo;
    });
    res.status(201).json({ id });
  });

  /* ===================== detalhe ===================== */
  r.get('/api/implantacoes/:id', async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    const info = await db.um(`SELECT e.nome AS executivo_nome, e.uf AS executivo_uf, us.nome AS solicitante_nome, ur.nome AS responsavel_nome
      FROM implantacoes i LEFT JOIN executivos e ON e.id = i.executivo_id LEFT JOIN usuarios us ON us.id = i.solicitante_id
      LEFT JOIN usuarios ur ON ur.id = i.responsavel_id WHERE i.id = $1`, [i.id]);
    const documentos = (await db.q(`SELECT d.id, d.tipo, d.nome, d.mime, d.tamanho, d.enviado_em, d.substituido_em, u.nome AS enviado_por_nome
      FROM implantacao_documentos d LEFT JOIN usuarios u ON u.id = d.enviado_por WHERE d.implantacao_id = $1 ORDER BY d.id`, [i.id])).rows;
    const eventos = (await db.q(`SELECT ev.id, ev.tipo, ev.detalhe, ev.criado_em, u.nome AS usuario_nome FROM implantacao_eventos ev
      LEFT JOIN usuarios u ON u.id = ev.usuario_id WHERE ev.implantacao_id = $1 ORDER BY ev.id`, [i.id])).rows;
    const docs = new Set(documentos.filter((d) => !d.substituido_em).map((d) => d.tipo));
    await db.q('UPDATE notificacoes SET lida = TRUE WHERE usuario_id = $1 AND link = $2 AND NOT lida', [req.usuario.id, link(i.id)]);
    res.json({
      implantacao: { ...i, ...info }, documentos, eventos, pode: pd,
      faltas: pd.enviar ? F.faltas(i.formulario, { docs, origem: i.origem, executivoId: i.executivo_id }) : [],
      pendencias: F.pendencias(i.formulario, docs),
      diferencas: F.diferencas(i.formulario, i.referencia),
    });
  });

  /* ===================== formulário ===================== */
  r.patch('/api/implantacoes/:id', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, p, pd } = c;
    const b = req.body || {};
    if (!pd.editar) return erro(res, 403, 'O formulário só muda enquanto a implantação está em rascunho ou com pendência.');
    const f = b.formulario && typeof b.formulario === 'object' && !Array.isArray(b.formulario) ? b.formulario : null;
    if (!f) return erro(res, 400, 'Nada para salvar.');
    let executivoId = i.executivo_id;
    if (b.executivo_id !== undefined && p.admin) {
      const ex = await db.um('SELECT id FROM executivos WHERE id = $1 AND ativo', [Number(b.executivo_id) || 0]);
      if (!ex) return erro(res, 400, 'Executivo não encontrado.');
      executivoId = ex.id;
    }
    await db.tx(async (t) => {
      await t.q(`UPDATE implantacoes SET formulario = $2::jsonb, condominio = $3, cnpj = $4, uf = $5, executivo_id = $6, atualizado_em = now() WHERE id = $1`,
        [i.id, JSON.stringify(f), texto(f.nome, 200), f.sem_cnpj ? '' : texto(f.cnpj, 20), texto(f.uf, 2).toUpperCase(), executivoId]);
      await evento(t, i.id, req.usuario.id, 'formulario', {});
    });
    res.json({ ok: true, diferencas: F.diferencas(f, i.referencia) });
  });

  /* ===================== documentos ===================== */
  r.post('/api/implantacoes/:id/documentos', corpoDoc, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, p, pd } = c;
    if (!pd.documentos) return erro(res, 403, 'Os documentos desta implantação não podem mais mudar.');
    const tipo = String(req.headers['x-tipo'] || '');
    if (!F.DOCUMENTOS[tipo]) return erro(res, 400, 'Tipo de documento inválido.');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return erro(res, 400, 'Arquivo vazio.');
    let nome = 'arquivo';
    try { nome = decodeURIComponent(String(req.headers['x-nome-arquivo'] || 'arquivo')); } catch { /* mantém */ }
    nome = nome.replace(/[\\/\r\n"]/g, '_').slice(0, 200) || 'arquivo';
    const pdf = buf.subarray(0, 5).toString('latin1') === '%PDF-';
    const mime = pdf ? 'application/pdf' : /^[\w.+-]+\/[\w.+-]+$/.test(String(req.headers['content-type'] || '')) ? String(req.headers['content-type']) : 'application/octet-stream';
    const antes = await tiposVigentes(db, i.id);
    const id = await db.tx(async (t) => {
      // um vigente por tipo (o anterior fica no histórico); "outro" acumula
      if (tipo !== 'outro') await t.q('UPDATE implantacao_documentos SET substituido_em = now() WHERE implantacao_id = $1 AND tipo = $2 AND substituido_em IS NULL', [i.id, tipo]);
      const d = await t.um(`INSERT INTO implantacao_documentos (implantacao_id, tipo, nome, mime, tamanho, sha256, conteudo, enviado_por) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [i.id, tipo, nome, mime, buf.length, crypto.createHash('sha256').update(buf).digest('hex'), buf, req.usuario.id]);
      await evento(t, i.id, req.usuario.id, 'documento', { tipo, nome, tamanho: buf.length });
      await t.q('UPDATE implantacoes SET atualizado_em = now() WHERE id = $1', [i.id]);
      return d.id;
    });
    // documento que estava pendente chegou depois do envio: avisa quem conduz (ou a coordenação, se ainda não tem ninguém)
    if (!['rascunho', 'pendencia'].includes(i.etapa) && F.DOCUMENTOS[tipo].pendente && !antes.has(tipo)) {
      const para = i.responsavel_id ? [i.responsavel_id] : (await pessoasDoSetor(db, seg, SETOR)).gestores;
      await avisos.notificar(para, { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: false,
        titulo: `Documento chegou · ${i.protocolo} · ${i.condominio}`, texto: `${req.usuario.nome} anexou: ${F.DOCUMENTOS[tipo].nome}.` });
    }
    res.status(201).json({ id, interno: p.equipe || p.coordenacao });
  });

  r.get('/api/implantacoes/:id/documentos/:did', async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const d = await db.um('SELECT * FROM implantacao_documentos WHERE id = $1 AND implantacao_id = $2', [Number(req.params.did) || 0, c.i.id]);
    if (!d) return erro(res, 404, 'Documento não encontrado.');
    const pdf = d.mime === 'application/pdf' && d.conteudo.subarray(0, 5).toString('latin1') === '%PDF-';
    res.set('Content-Type', pdf ? 'application/pdf' : 'application/octet-stream');
    res.set('Content-Disposition', `${pdf && req.query.ver === '1' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.nome)}`);
    res.set('Cache-Control', 'private, no-store');
    res.send(d.conteudo);
  });

  r.delete('/api/implantacoes/:id/documentos/:did', async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.tirar_documentos) return erro(res, 403, 'Os documentos não podem mais ser removidos.');
    const d = await db.um('SELECT id, tipo, nome FROM implantacao_documentos WHERE id = $1 AND implantacao_id = $2', [Number(req.params.did) || 0, c.i.id]);
    if (!d) return erro(res, 404, 'Documento não encontrado.');
    await db.tx(async (t) => {
      await t.q('DELETE FROM implantacao_documentos WHERE id = $1', [d.id]);
      await evento(t, c.i.id, req.usuario.id, 'documento_removido', { tipo: d.tipo, nome: d.nome });
    });
    res.json({ ok: true });
  });

  /* ===================== enviar ao setor ===================== */
  r.post('/api/implantacoes/:id/enviar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.enviar) return erro(res, 409, 'Esta implantação já foi enviada.');
    const docs = await tiposVigentes(db, i.id);
    const lista = F.faltas(i.formulario, { docs, origem: i.origem, executivoId: i.executivo_id });
    if (lista.length) return erro(res, 400, 'Faltam informações ou documentos para enviar.', { faltas: lista });
    const pend = F.pendencias(i.formulario, docs);
    const reenvio = i.etapa === 'pendencia';
    const protocolo = i.protocolo || await proximoProtocolo(db);
    const etapa = i.responsavel_id ? 'em_implantacao' : 'fila';
    await db.tx(async (t) => {
      // o lembrete diário de pendências começa no próximo dia útil (no envio vai o aviso no sino)
      await t.q(`UPDATE implantacoes SET protocolo = $2, etapa = $3, enviado_em = COALESCE(enviado_em, now()), aviso_docs_em = $4::date, lembrete_fila_em = now(),
        atualizado_em = now() WHERE id = $1`, [i.id, protocolo, etapa, diaBrasilia()]);
      await evento(t, i.id, req.usuario.id, reenvio ? 'reenviada' : 'enviada', { protocolo, pendentes: pend });
    });
    await seg.auditar(req, 'implantacao_enviada', null, { implantacao: i.id, protocolo, condominio: i.condominio });
    const resumoPend = pend.length ? ` ${pend.length} documento(s)/dado(s) ainda pendente(s): ${pend.join('; ')}.` : '';
    if (reenvio && i.responsavel_id) {
      await avisos.notificar([i.responsavel_id], { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
        titulo: `Pendência respondida · ${protocolo} · ${i.condominio}`, texto: `${req.usuario.nome} respondeu a pendência da implantação de ${i.condominio}.${resumoPend}` });
    } else {
      const setor = await pessoasDoSetor(db, seg, SETOR);
      const origem = i.origem === 'analise' ? `análise ${i.analise_protocolo}` : ORIGEM[i.origem].toLowerCase();
      await avisos.notificar(setor.gestores.length ? setor.gestores : await administradores(db), { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
        titulo: `Nova implantação · ${protocolo} · ${i.condominio}`,
        texto: `${req.usuario.nome} enviou ${i.condominio} (${origem}) para implantação. Aguardando designação.${resumoPend}` });
      await avisos.notificar(setor.equipe, { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
        titulo: `Chegou uma nova implantação · ${protocolo} · ${i.condominio}`,
        texto: `${req.usuario.nome} enviou ${i.condominio} para implantação. A coordenação vai designar quem conduz.` });
    }
    if (pend.length) {
      // aviso no sino para o executivo (inclusive quando foi ele quem enviou); o e-mail diário vem pela rotina
      await avisos.notificar(await donos(db, i), { link: link(i.id), autor_id: null, tipo: 'implantacao', email: false,
        titulo: `Pendências da implantação · ${protocolo} · ${i.condominio}`,
        texto: `Enviada ao setor Implantação. Ainda falta enviar: ${pend.join('; ')}. Você recebe um lembrete por e-mail a cada dia útil até chegarem.` });
    }
    res.json({ protocolo, etapa, pendencias: pend });
  });

  r.post('/api/implantacoes/:id/cancelar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.cancelar) return erro(res, 403, 'Esta implantação não pode ser cancelada.');
    await db.tx(async (t) => {
      await t.q("UPDATE implantacoes SET etapa = 'cancelada', atualizado_em = now() WHERE id = $1", [c.i.id]);
      await evento(t, c.i.id, req.usuario.id, 'cancelada', { motivo: texto(req.body && req.body.motivo, 1000) });
    });
    res.json({ ok: true });
  });

  return r;
}

module.exports = { rotasImplantacoes, criarRotinasImplantacao, proximoProtocolo, ETAPAS, ORIGEM, SETOR };

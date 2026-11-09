'use strict';
/*
 * Solicitação de Contrato Parceria: o comercial pede ao Jurídico o contrato com uma empresa parceira (o antigo formulário
 * "Solicitação de Contrato Parceria – MyBlue" do Microsoft Forms e o e-mail com o PDF). Quem elabora (Jurídico) assume e
 * envia a minuta em até 72h úteis; o comercial leva ao parceiro, pede ajuste ou a assinatura; o Jurídico manda assinar,
 * anexa a via assinada e registra as condições (comissões, vigência e contatos); o setor Parceiros confere e cadastra o
 * parceiro na base de comissão (Prestação de Contas — Comissão de Parceiros), com um clique.
 *
 * Etapas: rascunho → fila → em_elaboracao → minuta_enviada (com o comercial) → para_assinar → em_assinatura → conferencia
 *         (registrar as condições) → assinado. pendencia: devolvida ao comercial. Ajuste: volta para em_elaboracao. cancelada.
 *
 * Quem faz o quê (definido no portal, nunca no código):
 *  - pede: executivos (cadastro de executivo), quem é do setor Comercial ou do CS, a diretoria e a administração;
 *  - quem elabora: a mesma permissão da Solicitação de Contrato ("Elaborar as minutas de contrato");
 *  - diretoria: quem chancela análises de crédito; decide o percentual fora do padrão antes da minuta;
 *  - setor Parceiros: cadastra o parceiro na base de comissão depois do contrato assinado;
 *  - administração: tudo.
 */
const express = require('express');
const crypto = require('crypto');
const F = require('../parcerias/formulario');
const { PERMISSAO } = require('./contratos');

const ETAPAS = ['rascunho', 'fila', 'em_elaboracao', 'pendencia', 'minuta_enviada', 'para_assinar', 'em_assinatura', 'conferencia', 'assinado', 'cancelada'];
const SETORES_PEDEM = ['Comercial', 'CS'];
const SETOR_PARCEIROS = 'Parceiros';
const MODULO_PARCEIROS = 'parceiros';
const DIAS_PRAZO = 3; // 72h úteis para a minuta (3 dias de expediente)
const DIAS_LEMBRETE_PARCEIROS = 2; // sem o cadastro do parceiro, o setor Parceiros é lembrado a cada 2 dias úteis
const DOCUMENTOS = { minuta: 'Minuta do contrato', contrato_assinado: 'Contrato assinado', outro: 'Outro documento' };
const ABERTAS = "('fila','em_elaboracao','pendencia','minuta_enviada','para_assinar','em_assinatura','conferencia')";

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const diaBrasilia = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const quando = (d) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
const link = (id) => `#/parcerias/${id}`;

async function proximoProtocolo(db, agora = new Date()) {
  const dia = diaBrasilia(agora);
  const r = await db.um(`INSERT INTO parceria_protocolos (dia, ultimo) VALUES ($1, 1)
    ON CONFLICT (dia) DO UPDATE SET ultimo = parceria_protocolos.ultimo + 1 RETURNING ultimo`, [dia]);
  return `CP-${dia}-${String(r.ultimo).padStart(2, '0')}`;
}

const administradores = async (db) => (await db.q("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo")).rows.map((x) => x.id);
async function elaboradores(db, regras) {
  const ids = await regras.pessoasCom(PERMISSAO);
  return ids.length ? ids : administradores(db);
}
/* quem decide o percentual fora do padrão: a chancela comercial (sem ninguém, a de crédito; depois, a administração) */
async function diretores(db, regras) {
  const ids = await regras.pessoasDaChancelaComercial();
  return ids.length ? ids : administradores(db);
}
async function membrosDe(db, nome) {
  return (await db.q(`SELECT u.id FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id JOIN usuarios u ON u.id = sm.usuario_id
    WHERE s.nome = $1 AND u.ativo ORDER BY u.nome`, [nome])).rows.map((x) => x.id);
}
async function setorParceiros(db) {
  const ids = await membrosDe(db, SETOR_PARCEIROS);
  return ids.length ? ids : administradores(db);
}
const precisaDiretoria = (c) => !!(c.diretoria && (c.diretoria.itens || []).length);
const diretoriaDecidiu = (c) => !!(c.diretoria && c.diretoria.decidido_em);
const tiposVigentes = async (db, id) => new Set((await db.q('SELECT DISTINCT tipo FROM parceria_documentos WHERE parceria_id = $1 AND substituido_em IS NULL', [id])).rows.map((x) => x.tipo));

/* a base de comissão (ferramenta Prestação de Contas — Comissão de Parceiros, coleção "partners") */
async function baseParceiros(db, registros) {
  const m = await db.um('SELECT fonte_dados FROM modulos WHERE slug = $1', [MODULO_PARCEIROS]);
  if (!m) return { modulo: false, lista: [] };
  return { modulo: true, interno: m.fonte_dados === 'interno', lista: await registros.listarComIds(MODULO_PARCEIROS, 'partners') };
}

/* Rotina (a cada poucos minutos):
 *  - prazo da minuta (72h úteis) vencido: avisa, uma vez, quem assumiu (ou quem elabora, se ninguém assumiu);
 *  - contrato assinado sem o parceiro cadastrado na base de comissão: lembra o setor Parceiros a cada 2 dias úteis. */
function criarRotinasParcerias({ db, avisos, regras, expediente }) {
  async function executar(agora = new Date()) {
    const feito = { prazos: 0, parceiros: 0 };
    for (const c of (await db.q(`SELECT id, protocolo, empresa, responsavel_id, prazo FROM parcerias
        WHERE etapa IN ('fila','em_elaboracao') AND prazo < $1 AND aviso_prazo_em IS NULL`, [agora])).rows) {
      await avisos.notificar(c.responsavel_id ? [c.responsavel_id] : await elaboradores(db, regras), { link: link(c.id), tipo: 'parceria', email: true,
        titulo: `Passou do prazo da minuta · ${c.protocolo} · ${c.empresa}`,
        texto: `A minuta do contrato de parceria com ${c.empresa} devia ter saído até ${quando(c.prazo)} (72h úteis).${c.responsavel_id ? '' : ' Ninguém assumiu a solicitação ainda.'}` });
      await db.q('UPDATE parcerias SET aviso_prazo_em = $2 WHERE id = $1', [c.id, agora]);
      feito.prazos++;
    }
    for (const c of (await db.q(`SELECT id, protocolo, empresa, aviso_parceiros_em FROM parcerias
        WHERE etapa = 'assinado' AND parceiro_cadastrado_em IS NULL AND aviso_parceiros_em IS NOT NULL`)).rows) {
      if (expediente.somarDiasUteis(new Date(c.aviso_parceiros_em), DIAS_LEMBRETE_PARCEIROS) > agora) continue;
      await avisos.notificar(await setorParceiros(db), { link: link(c.id), tipo: 'parceria', email: true,
        titulo: `Lembrete: cadastrar o parceiro · ${c.protocolo} · ${c.empresa}`,
        texto: `O contrato de parceria com ${c.empresa} está assinado e o parceiro ainda não foi cadastrado na Prestação de Contas. Abra a solicitação, confira os dados e clique em Cadastrar parceiro.` });
      await db.q('UPDATE parcerias SET aviso_parceiros_em = $2 WHERE id = $1', [c.id, agora]);
      feito.parceiros++;
    }
    return feito;
  }
  return { executar };
}

function rotasParcerias({ db, seg, cfg, avisos, regras, expediente, registros }) {
  const r = express.Router();
  const json = express.json({ limit: '1mb' });
  const corpoDoc = express.raw({ type: () => true, limit: (cfg.limiteCreditoMb || 30) * 1024 * 1024 });
  r.use('/api/parcerias', seg.exigirLogin);
  const erro = (res, status, msg, extra) => res.status(status).json({ erro: msg, ...(extra || {}) });
  const evento = (t, id, usuarioId, tipo, detalhe) => t.q('INSERT INTO parceria_eventos (parceria_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)',
    [id, usuarioId, tipo, JSON.stringify(detalhe || {})]);

  /* ---------- quem é a pessoa na Solicitação de Contrato Parceria ---------- */
  async function perfil(u) {
    const admin = u.papel === 'admin';
    const setores = (await db.q('SELECT s.nome FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id WHERE sm.usuario_id = $1', [u.id])).rows.map((x) => x.nome);
    const executivo = await db.um('SELECT id, nome, uf FROM executivos WHERE usuario_id = $1 AND ativo', [u.id]);
    const elaborador = admin || (await regras.pode(u, PERMISSAO));
    // diretoria: decide o percentual fora do padrão (chancela comercial); diretoria_ve: qualquer chancela (vê todas)
    const diretoria = admin || (await regras.podeChancelaComercial(u));
    const diretoriaVe = admin || (await regras.ehDiretoria(u));
    const parceiros = admin || setores.includes(SETOR_PARCEIROS);
    const solicita = admin || !!executivo || diretoria || diretoriaVe || setores.some((s) => SETORES_PEDEM.includes(s));
    return { admin, executivo, elaborador, diretoria, diretoria_ve: diretoriaVe, parceiros, solicita };
  }

  function pode(p, c, u) {
    const dono = c.solicitante_id === u.id;
    const interno = p.admin || p.elaborador || p.diretoria || p.diretoria_ve || p.parceiros;
    const editavel = ['rascunho', 'pendencia'].includes(c.etapa);
    const aberta = !['assinado', 'cancelada'].includes(c.etapa);
    const conduz = c.etapa === 'em_elaboracao' && p.elaborador && (c.responsavel_id === u.id || p.admin);
    const aguardaDiretoria = precisaDiretoria(c) && !diretoriaDecidiu(c);
    return {
      ver: dono || interno,
      interno: p.admin || p.elaborador || p.diretoria || p.diretoria_ve,
      editar: editavel && (dono || p.admin),
      enviar: editavel && (dono || p.admin),
      documentos: aberta && (dono || p.elaborador || p.admin),
      assumir: p.elaborador && c.etapa === 'fila',
      passar: p.elaborador && ['fila', 'em_elaboracao', 'pendencia', 'minuta_enviada', 'para_assinar', 'em_assinatura'].includes(c.etapa),
      pendencia: conduz,
      minuta: conduz,
      enviar_minuta: conduz && !aguardaDiretoria,
      decidir_diretoria: p.diretoria && aguardaDiretoria && ['fila', 'em_elaboracao', 'pendencia'].includes(c.etapa),
      ajuste: ['minuta_enviada', 'para_assinar'].includes(c.etapa) && (dono || p.admin),
      pedir_assinatura: c.etapa === 'minuta_enviada' && (dono || p.admin),
      enviar_assinatura: c.etapa === 'para_assinar' && p.elaborador,
      assinar: ['para_assinar', 'em_assinatura'].includes(c.etapa) && p.elaborador,
      registrar: c.etapa === 'conferencia' && p.elaborador,
      corrigir: c.etapa === 'assinado' && p.elaborador,
      cadastrar_parceiro: c.etapa === 'assinado' && !c.parceiro_cadastrado_em && p.parceiros,
      cancelar: aberta && ((dono && c.etapa !== 'em_elaboracao') || (p.elaborador && c.etapa !== 'rascunho') || p.admin),
    };
  }

  async function carregar(req, res) {
    const c = await db.um('SELECT * FROM parcerias WHERE id = $1', [Number(req.params.id) || 0]);
    const p = await perfil(req.usuario);
    if (!c || !pode(p, c, req.usuario).ver) { erro(res, 404, 'Solicitação de contrato de parceria não encontrada.'); return null; }
    return { c, p, pd: pode(p, c, req.usuario) };
  }
  const donos = (c) => [c.solicitante_id];

  /* o CNPJ já é parceiro na base ou tem pedido enviado e não cancelado? (rascunho esquecido não trava ninguém) */
  async function duplicidade(cnpj, ignorar = 0) {
    const d = F.digitos(cnpj);
    if (d.length !== 14) return { na_base: null, aberta: null };
    const base = await baseParceiros(db, registros);
    const achado = F.acharNaBase(base.lista.map((x) => x.dados), { formulario: { cnpj: d, empresa: '' } });
    const aberta = await db.um(`SELECT id, protocolo, etapa FROM parcerias WHERE id <> $2 AND etapa NOT IN ('cancelada','rascunho')
      AND regexp_replace(cnpj, '[^0-9]', '', 'g') = $1 ORDER BY id DESC LIMIT 1`, [d, ignorar]);
    return { na_base: achado ? texto(achado.nome, 200) : null, aberta: aberta ? { id: aberta.id, protocolo: aberta.protocolo || 'rascunho', etapa: aberta.etapa } : null };
  }

  /* ===================== perfil e contadores ===================== */
  r.get('/api/parcerias/meta', async (req, res) => {
    const p = await perfil(req.usuario);
    const ids = p.elaborador ? await regras.pessoasCom(PERMISSAO) : [];
    res.json({
      perfil: { admin: p.admin, elaborador: p.elaborador, diretoria: p.diretoria, parceiros: p.parceiros, solicita: p.solicita },
      documentos: Object.entries(DOCUMENTOS).map(([tipo, nome]) => ({ tipo, nome })), prazo_dias: DIAS_PRAZO,
      recorrencia: F.RECORRENCIA, venda: F.VENDA,
      elaboradores: ids.length ? (await db.q('SELECT id, nome FROM usuarios WHERE id = ANY($1::int[]) AND ativo ORDER BY nome', [ids])).rows : [],
    });
  });

  r.get('/api/parcerias/resumo', async (req, res) => {
    const p = await perfil(req.usuario);
    const out = { acesso: !!(p.solicita || p.elaborador || p.diretoria || p.parceiros) };
    if (!out.acesso) return res.json(out);
    if (p.elaborador) {
      Object.assign(out, await db.um(`SELECT COUNT(*) FILTER (WHERE etapa = 'fila')::int AS fila,
        COUNT(*) FILTER (WHERE etapa = 'em_elaboracao' AND responsavel_id = $1)::int AS minhas,
        COUNT(*) FILTER (WHERE etapa IN ('para_assinar','conferencia'))::int AS assinaturas FROM parcerias`, [req.usuario.id]));
    }
    if (p.diretoria) {
      out.diretoria = (await db.um(`SELECT COUNT(*)::int AS n FROM parcerias WHERE etapa IN ('fila','em_elaboracao','pendencia')
        AND jsonb_array_length(COALESCE(diretoria->'itens', '[]'::jsonb)) > 0 AND diretoria->>'decidido_em' IS NULL`)).n;
    }
    if (p.parceiros) out.parceiros = (await db.um("SELECT COUNT(*)::int AS n FROM parcerias WHERE etapa = 'assinado' AND parceiro_cadastrado_em IS NULL")).n;
    out.retorno = (await db.um("SELECT COUNT(*)::int AS n FROM parcerias WHERE etapa IN ('pendencia','minuta_enviada') AND solicitante_id = $1", [req.usuario.id])).n;
    res.json(out);
  });

  /* o CNPJ já é parceiro ou tem pedido aberto (o comercial vê antes de continuar) */
  r.get('/api/parcerias/cnpj', async (req, res) => {
    const p = await perfil(req.usuario);
    if (!p.solicita) return erro(res, 403, 'Quem pede contrato de parceria: executivos, Comercial, CS e a diretoria.');
    if (!F.cnpjOk(req.query.cnpj)) return erro(res, 400, 'CNPJ inválido.');
    res.json(await duplicidade(req.query.cnpj, Number(req.query.ignorar) || 0));
  });

  /* ===================== listagem ===================== */
  r.get('/api/parcerias', async (req, res) => {
    const u = req.usuario;
    const p = await perfil(u);
    const args = [];
    const v = (x) => { args.push(x); return '$' + args.length; };
    const where = [];
    const vis = String(req.query.vis || 'minhas');
    if (vis === 'minhas') where.push(`c.solicitante_id = ${v(u.id)}`);
    else if (vis === 'fila') { if (!p.elaborador) return erro(res, 403, 'A fila é de quem elabora os contratos.'); where.push("c.etapa IN ('fila','em_elaboracao','pendencia')"); }
    else if (vis === 'assinaturas') { if (!p.elaborador) return erro(res, 403, 'As assinaturas são de quem elabora os contratos.'); where.push("c.etapa IN ('para_assinar','em_assinatura','conferencia')"); }
    else if (vis === 'diretoria') {
      if (!p.diretoria) return erro(res, 403, 'Só a diretoria.');
      where.push("c.etapa IN ('fila','em_elaboracao','pendencia') AND jsonb_array_length(COALESCE(c.diretoria->'itens', '[]'::jsonb)) > 0 AND c.diretoria->>'decidido_em' IS NULL");
    } else if (vis === 'parceiros') { if (!p.parceiros) return erro(res, 403, 'Só o setor Parceiros.'); where.push("c.etapa = 'assinado'"); }
    else if (vis === 'todas') {
      if (!p.elaborador && !p.diretoria) return erro(res, 403, 'O histórico é de quem elabora e da diretoria.');
      where.push("c.etapa <> 'rascunho'");
      if (ETAPAS.includes(String(req.query.etapa))) where.push(`c.etapa = ${v(String(req.query.etapa))}`);
    } else return erro(res, 400, 'Visão inválida.');
    const busca = texto(req.query.q, 100);
    if (busca) where.push(`(c.empresa ILIKE ${v('%' + busca + '%')} OR c.protocolo ILIKE $${args.length} OR c.cnpj ILIKE $${args.length})`);
    const { rows } = await db.q(`SELECT c.id, c.protocolo, c.etapa, c.empresa, c.cnpj, c.enviado_em, c.prazo, c.minuta_enviada_em, c.ajustes, c.assinado_em, c.fechado_em,
        c.criado_em, c.atualizado_em, c.diretoria, c.assinatura_pedida_em, c.em_assinatura_em, c.parceiro_cadastrado_em,
        us.nome AS solicitante_nome, ur.nome AS responsavel_nome
      FROM parcerias c LEFT JOIN usuarios us ON us.id = c.solicitante_id LEFT JOIN usuarios ur ON ur.id = c.responsavel_id
      WHERE ${where.join(' AND ')}
      ORDER BY (c.etapa IN ${ABERTAS}) DESC, c.prazo NULLS LAST, c.atualizado_em DESC LIMIT 500`, args);
    const agora = new Date();
    res.json({ parcerias: rows.map(({ diretoria, ...x }) => ({ ...x,
      atrasado: ['fila', 'em_elaboracao'].includes(x.etapa) && !!x.prazo && new Date(x.prazo) < agora,
      diretoria: (diretoria.itens || []).length ? (diretoria.decidido_em ? (diretoria.aprovado ? 'aprovado' : 'nao_aprovado') : 'aguardando') : null,
      aguarda_cadastro: x.etapa === 'assinado' && !x.parceiro_cadastrado_em })) });
  });

  /* ===================== criar (rascunho) ===================== */
  r.post('/api/parcerias', json, async (req, res) => {
    const u = req.usuario;
    const p = await perfil(u);
    if (!p.solicita) return erro(res, 403, 'Quem pede contrato de parceria: executivos, Comercial, CS e a diretoria.');
    const f = F.normalizar(req.body && req.body.formulario);
    const id = await db.tx(async (t) => {
      const { id: novo } = await t.um("INSERT INTO parcerias (etapa, empresa, cnpj, solicitante_id, formulario) VALUES ('rascunho', $1, $2, $3, $4::jsonb) RETURNING id",
        [f.empresa, f.cnpj, u.id, JSON.stringify(f)]);
      await evento(t, novo, u.id, 'criada', {});
      return novo;
    });
    res.status(201).json({ id });
  });

  /* ===================== detalhe ===================== */
  r.get('/api/parcerias/:id', async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    const info = await db.um(`SELECT us.nome AS solicitante_nome, ur.nome AS responsavel_nome, uf.nome AS fechado_por_nome, upc.nome AS parceiro_cadastrado_por_nome
      FROM parcerias c LEFT JOIN usuarios us ON us.id = c.solicitante_id LEFT JOIN usuarios ur ON ur.id = c.responsavel_id
      LEFT JOIN usuarios uf ON uf.id = c.fechado_por LEFT JOIN usuarios upc ON upc.id = c.parceiro_cadastrado_por WHERE c.id = $1`, [c.id]);
    const documentos = (await db.q(`SELECT d.id, d.tipo, d.nome, d.mime, d.tamanho, d.enviado_em, d.substituido_em, u.nome AS enviado_por_nome
      FROM parceria_documentos d LEFT JOIN usuarios u ON u.id = d.enviado_por WHERE d.parceria_id = $1 ORDER BY d.id`, [c.id])).rows;
    const eventos = (await db.q(`SELECT ev.id, ev.tipo, ev.detalhe, ev.criado_em, u.nome AS usuario_nome FROM parceria_eventos ev
      LEFT JOIN usuarios u ON u.id = ev.usuario_id WHERE ev.parceria_id = $1 ORDER BY ev.id`, [c.id])).rows;
    const f = c.formulario || {};
    const fechado = c.fechado && c.fechado.inicio !== undefined ? c.fechado : F.fechadoInicial(c);
    await db.q('UPDATE notificacoes SET lida = TRUE WHERE usuario_id = $1 AND link = $2 AND NOT lida', [req.usuario.id, link(c.id)]);
    let parceiro = null;
    if (c.etapa === 'assinado') {
      const base = await baseParceiros(db, registros);
      const ja = F.acharNaBase(base.lista.map((y) => y.dados), c);
      parceiro = { modulo: base.modulo, interno: !!base.interno, na_base: ja ? texto(ja.nome, 200) : null, registro: F.registroParceiro({ ...c, fechado }, ja) };
    }
    res.json({
      parceria: { ...c, ...info, fechado }, documentos, eventos, pode: pd, parceiro,
      faltas_campos: pd.enviar ? F.faltasCampos(f) : [],
      avisos: F.avisos(f),
      itens_diretoria: pd.editar ? F.itensDiretoria(f) : (c.diretoria.itens || []),
      duplicidade: pd.editar && F.cnpjOk(f.cnpj) ? await duplicidade(f.cnpj, c.id) : null,
      faltas_fechado: pd.registrar ? F.faltasFechado(fechado) : [],
      diferencas_fechado: ['conferencia', 'assinado'].includes(c.etapa) ? F.diferencasFechado(f, fechado) : [],
    });
  });

  /* ===================== formulário ===================== */
  r.patch('/api/parcerias/:id', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.editar) return erro(res, 403, 'A solicitação só muda enquanto está em rascunho ou com pendência.');
    const f = F.normalizar(req.body && req.body.formulario);
    await db.tx(async (t) => {
      await t.q('UPDATE parcerias SET formulario = $2::jsonb, empresa = $3, cnpj = $4, atualizado_em = now() WHERE id = $1', [c.id, JSON.stringify(f), f.empresa, f.cnpj]);
      await evento(t, c.id, req.usuario.id, 'formulario', {});
    });
    res.json({ ok: true, itens_diretoria: F.itensDiretoria(f), avisos: F.avisos(f), faltas_campos: F.faltasCampos(f) });
  });

  /* conferência ao vivo, enquanto o comercial preenche (não grava nada) */
  r.post('/api/parcerias/:id/conferir', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.editar) return erro(res, 403, 'A solicitação só muda enquanto está em rascunho ou com pendência.');
    const f = F.normalizar(req.body && req.body.formulario);
    res.json({ faltas_campos: F.faltasCampos(f), itens_diretoria: F.itensDiretoria(f), avisos: F.avisos(f),
      duplicidade: F.cnpjOk(f.cnpj) ? await duplicidade(f.cnpj, c.id) : null });
  });

  /* ===================== documentos (minuta, contrato assinado e outros) ===================== */
  r.post('/api/parcerias/:id/documentos', corpoDoc, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.documentos) return erro(res, 403, 'Os documentos desta solicitação não podem mais mudar.');
    const tipo = String(req.headers['x-tipo'] || '');
    if (!DOCUMENTOS[tipo]) return erro(res, 400, 'Tipo de documento inválido.');
    if (tipo === 'minuta' && !pd.minuta) return erro(res, 403, 'A minuta é anexada por quem assumiu a solicitação.');
    if (tipo === 'contrato_assinado' && !(pd.assinar || pd.registrar)) return erro(res, 409, 'O contrato assinado é anexado pelo Jurídico, depois que o comercial pede a assinatura.');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return erro(res, 400, 'Arquivo vazio.');
    let nome = 'arquivo';
    try { nome = decodeURIComponent(String(req.headers['x-nome-arquivo'] || 'arquivo')); } catch { /* mantém */ }
    nome = nome.replace(/[\\/\r\n"]/g, '_').slice(0, 200) || 'arquivo';
    const pdf = buf.subarray(0, 5).toString('latin1') === '%PDF-';
    const mime = pdf ? 'application/pdf' : /^[\w.+-]+\/[\w.+-]+$/.test(String(req.headers['content-type'] || '')) ? String(req.headers['content-type']) : 'application/octet-stream';
    const id = await db.tx(async (t) => {
      // um vigente por tipo (as versões anteriores da minuta ficam no histórico); "outro" acumula
      if (tipo !== 'outro') await t.q('UPDATE parceria_documentos SET substituido_em = now() WHERE parceria_id = $1 AND tipo = $2 AND substituido_em IS NULL', [c.id, tipo]);
      const d = await t.um(`INSERT INTO parceria_documentos (parceria_id, tipo, nome, mime, tamanho, sha256, conteudo, enviado_por) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [c.id, tipo, nome, mime, buf.length, crypto.createHash('sha256').update(buf).digest('hex'), buf, req.usuario.id]);
      await evento(t, c.id, req.usuario.id, 'documento', { tipo, nome, tamanho: buf.length });
      await t.q('UPDATE parcerias SET atualizado_em = now() WHERE id = $1', [c.id]);
      return d.id;
    });
    res.status(201).json({ id });
  });

  r.get('/api/parcerias/:id/documentos/:did', async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const d = await db.um('SELECT * FROM parceria_documentos WHERE id = $1 AND parceria_id = $2', [Number(req.params.did) || 0, x.c.id]);
    if (!d) return erro(res, 404, 'Documento não encontrado.');
    const pdf = d.mime === 'application/pdf' && d.conteudo.subarray(0, 5).toString('latin1') === '%PDF-';
    res.set('Content-Type', pdf ? 'application/pdf' : 'application/octet-stream');
    res.set('Content-Disposition', `${pdf && req.query.ver === '1' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.nome)}`);
    res.set('Cache-Control', 'private, no-store');
    res.send(d.conteudo);
  });

  r.delete('/api/parcerias/:id/documentos/:did', async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    const d = await db.um('SELECT id, tipo, nome FROM parceria_documentos WHERE id = $1 AND parceria_id = $2 AND substituido_em IS NULL', [Number(req.params.did) || 0, c.id]);
    if (!d) return erro(res, 404, 'Documento não encontrado.');
    const ok = d.tipo === 'minuta' ? pd.minuta : d.tipo === 'contrato_assinado' ? pd.assinar || pd.registrar : pd.documentos;
    if (!ok) return erro(res, 403, 'Este documento não pode ser removido.');
    await db.tx(async (t) => {
      await t.q('DELETE FROM parceria_documentos WHERE id = $1', [d.id]);
      await evento(t, c.id, req.usuario.id, 'documento_removido', { tipo: d.tipo, nome: d.nome });
    });
    res.json({ ok: true });
  });

  /* ===================== enviar ao Jurídico ===================== */
  r.post('/api/parcerias/:id/enviar', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.enviar) return erro(res, 409, 'Esta solicitação já foi enviada.');
    const f = F.normalizar(c.formulario);
    const campos = F.faltasCampos(f);
    if (campos.length) return erro(res, 400, 'Faltam informações para enviar.', { faltas: campos.map((y) => y.msg), faltas_campos: campos });
    const dup = await duplicidade(f.cnpj, c.id);
    if (dup.aberta) return erro(res, 409, `Este CNPJ já tem solicitação de contrato de parceria (${dup.aberta.protocolo}).`, { duplicidade: dup });
    const itens = F.itensDiretoria(f);
    const reenvio = c.etapa === 'pendencia';
    // a decisão da diretoria continua valendo se os itens não mudaram
    const anterior = c.diretoria || {};
    const diretoria = !itens.length ? {} : JSON.stringify(anterior.itens || []) === JSON.stringify(itens) ? anterior : { itens, pedido_em: new Date().toISOString() };
    const novaDiretoria = itens.length && !diretoriaDecidiu({ diretoria }) && diretoria !== anterior;
    const protocolo = c.protocolo || await proximoProtocolo(db);
    const etapa = c.responsavel_id ? 'em_elaboracao' : 'fila';
    const agora = new Date();
    const prazo = expediente.somarDiasUteis(agora, DIAS_PRAZO);
    await db.tx(async (t) => {
      await t.q(`UPDATE parcerias SET protocolo = $2, etapa = $3, enviado_em = COALESCE(enviado_em, $4), prazo = $5, aviso_prazo_em = NULL, diretoria = $6::jsonb,
        atualizado_em = now() WHERE id = $1`, [c.id, protocolo, etapa, agora, prazo, JSON.stringify(diretoria)]);
      await evento(t, c.id, req.usuario.id, reenvio ? 'reenviada' : 'enviada', { protocolo, prazo, diretoria: itens });
    });
    await seg.auditar(req, 'parceria_enviada', null, { parceria: c.id, protocolo, empresa: c.empresa });
    const fimPrazo = quando(prazo);
    const na = dup.na_base ? ` Atenção: o CNPJ já está na base de parceiros (${dup.na_base}).` : '';
    if (reenvio && c.responsavel_id) {
      await avisos.notificar([c.responsavel_id], { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: true,
        titulo: `Pendência respondida · ${protocolo} · ${c.empresa}`, texto: `${req.usuario.nome} respondeu a pendência do contrato de parceria com ${c.empresa}. Novo prazo da minuta: ${fimPrazo}.` });
    } else {
      await avisos.notificar(await elaboradores(db, regras), { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: true,
        titulo: `Nova solicitação de contrato de parceria · ${protocolo} · ${c.empresa}`,
        texto: `${req.usuario.nome} pediu o contrato de parceria com ${c.empresa}. Prazo: ${fimPrazo} (72h úteis).${itens.length ? ` Depende da diretoria: ${itens.join(' ')}` : ''}${na}` });
    }
    if (novaDiretoria) {
      await avisos.notificar(await diretores(db, regras), { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: true,
        titulo: `Decisão da diretoria na parceria · ${protocolo} · ${c.empresa}`,
        texto: `${req.usuario.nome} pediu o contrato de parceria com ${c.empresa}. Antes da minuta, precisa da diretoria: ${itens.join(' ')}` });
    }
    res.json({ protocolo, etapa, prazo, diretoria: itens });
  });

  /* ===================== Jurídico: assumir, passar, pendência, minuta ===================== */
  r.post('/api/parcerias/:id/assumir', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.assumir) return erro(res, c.etapa === 'fila' ? 403 : 409, c.etapa === 'fila' ? 'Só quem elabora contratos assume.' : 'Esta solicitação já foi assumida.');
    await db.tx(async (t) => {
      await t.q("UPDATE parcerias SET etapa = 'em_elaboracao', responsavel_id = $2, assumido_em = now(), atualizado_em = now() WHERE id = $1", [c.id, req.usuario.id]);
      await evento(t, c.id, req.usuario.id, 'assumida', {});
    });
    await avisos.notificar(donos(c), { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: false,
      titulo: `Contrato de parceria em elaboração · ${c.protocolo} · ${c.empresa}`, texto: `${req.usuario.nome} assumiu a minuta do contrato com ${c.empresa}. Prazo: ${quando(c.prazo)}.` });
    res.json({ ok: true });
  });

  r.post('/api/parcerias/:id/passar', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.passar) return erro(res, 403, 'Só quem elabora contratos passa a solicitação.');
    const alvo = await db.um('SELECT id, nome, papel FROM usuarios WHERE id = $1 AND ativo', [Number(req.body && req.body.usuario_id) || 0]);
    if (!alvo || !(await regras.pode(alvo, PERMISSAO))) return erro(res, 400, 'Escolha alguém que elabora contratos.');
    if (alvo.id === c.responsavel_id) return erro(res, 409, `${alvo.nome} já está com esta solicitação.`);
    await db.tx(async (t) => {
      await t.q(`UPDATE parcerias SET responsavel_id = $2, assumido_em = now(), etapa = CASE WHEN etapa = 'fila' THEN 'em_elaboracao' ELSE etapa END, atualizado_em = now()
        WHERE id = $1`, [c.id, alvo.id]);
      await evento(t, c.id, req.usuario.id, 'passada', { para: alvo.nome });
    });
    await avisos.notificar([alvo.id], { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: true,
      titulo: `Contrato de parceria com você · ${c.protocolo} · ${c.empresa}`,
      texto: `${req.usuario.nome} passou o contrato de parceria com ${c.empresa} para você.${c.prazo && ['fila', 'em_elaboracao'].includes(c.etapa) ? ` Prazo: ${quando(c.prazo)}.` : ''}` });
    res.json({ ok: true });
  });

  r.post('/api/parcerias/:id/pendencia', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.pendencia) return erro(res, 403, 'Só quem assumiu a solicitação devolve com pendência.');
    const itens = (Array.isArray(req.body && req.body.itens) ? req.body.itens : []).map((v) => texto(v, 500)).filter(Boolean);
    if (!itens.length) return erro(res, 400, 'Liste o que falta.');
    const mensagem = `Para seguir com a minuta do contrato de parceria com ${c.empresa} (${c.protocolo}), precisamos de:\n\n${itens.map((v, k) => `${k + 1}. ${v}`).join('\n')}\n\nAjuste a solicitação e reenvie pelo portal.`;
    await db.tx(async (t) => {
      await t.q("UPDATE parcerias SET etapa = 'pendencia', atualizado_em = now() WHERE id = $1", [c.id]);
      await evento(t, c.id, req.usuario.id, 'pendencia', { itens, mensagem });
    });
    await avisos.notificar(donos(c), { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: true,
      titulo: `Pendência no contrato de parceria · ${c.protocolo} · ${c.empresa}`, texto: mensagem });
    res.json({ ok: true, mensagem });
  });

  r.post('/api/parcerias/:id/minuta', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.minuta) return erro(res, 403, 'Só quem assumiu a solicitação envia a minuta.');
    if (!pd.enviar_minuta) return erro(res, 409, 'A diretoria ainda não decidiu o percentual pedido.');
    const m = await db.um("SELECT nome, enviado_em FROM parceria_documentos WHERE parceria_id = $1 AND tipo = 'minuta' AND substituido_em IS NULL ORDER BY id DESC LIMIT 1", [c.id]);
    if (!m) return erro(res, 400, 'Anexe a minuta antes de enviar.');
    if (c.ultimo_ajuste_em && new Date(m.enviado_em) < new Date(c.ultimo_ajuste_em)) return erro(res, 400, 'Anexe a minuta ajustada (a que está anexada é de antes do pedido de ajuste).');
    const msg = texto(req.body && req.body.mensagem, 2000);
    const agora = new Date();
    const noPrazo = !c.prazo || agora <= new Date(c.prazo);
    await db.tx(async (t) => {
      await t.q("UPDATE parcerias SET etapa = 'minuta_enviada', minuta_enviada_em = $2, atualizado_em = now() WHERE id = $1", [c.id, agora]);
      await evento(t, c.id, req.usuario.id, 'minuta_enviada', { nome: m.nome, no_prazo: noPrazo, ajuste: c.ajustes, mensagem: msg });
    });
    await avisos.notificar(donos(c), { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: true,
      titulo: `${c.ajustes ? 'Minuta ajustada' : 'Minuta do contrato de parceria'} pronta · ${c.protocolo} · ${c.empresa}`,
      texto: `${req.usuario.nome} enviou a minuta do contrato de parceria com ${c.empresa} (${m.nome}). Leve ao parceiro: se ele pedir mudanças, use "Pedir ajuste"; se aprovar, clique em "Parceiro aprovou: pedir assinatura".${msg ? `\n\n${msg}` : ''}` });
    res.json({ ok: true, no_prazo: noPrazo });
  });

  /* ===================== diretoria: percentual fora do padrão ===================== */
  r.post('/api/parcerias/:id/diretoria', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.decidir_diretoria) return erro(res, 403, 'Só a diretoria decide, e só enquanto a solicitação espera por ela.');
    const aprovar = req.body && req.body.aprovar === true;
    const obs = texto(req.body && req.body.observacao, 1000);
    if (!aprovar && !obs) return erro(res, 400, 'Diga o motivo de não aprovar (o contrato segue o padrão).');
    const d = { ...c.diretoria, aprovado: aprovar, observacao: obs, por: req.usuario.nome, decidido_em: new Date().toISOString() };
    await db.tx(async (t) => {
      await t.q('UPDATE parcerias SET diretoria = $2::jsonb, atualizado_em = now() WHERE id = $1', [c.id, JSON.stringify(d)]);
      await evento(t, c.id, req.usuario.id, aprovar ? 'diretoria_aprovou' : 'diretoria_recusou', { observacao: obs });
    });
    const para = [...donos(c), ...(c.responsavel_id ? [c.responsavel_id] : await elaboradores(db, regras))];
    await avisos.notificar(para, { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: true,
      titulo: `Diretoria ${aprovar ? 'aprovou' : 'não aprovou'} · ${c.protocolo} · ${c.empresa}`,
      texto: `${req.usuario.nome} ${aprovar ? 'aprovou' : 'não aprovou'}: ${(c.diretoria.itens || []).join(' ')}${obs ? ` Observação: ${obs}` : ''}${aprovar ? '' : ' O contrato segue o padrão (recorrência de 10% ou 5%, venda de 50% da 1ª taxa administrativa).'}` });
    res.json({ ok: true });
  });

  /* ===================== comercial: ajuste ou assinatura · Jurídico: assinatura ===================== */
  r.post('/api/parcerias/:id/ajuste', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.ajuste) return erro(res, 403, 'O ajuste é pedido pelo comercial depois que a minuta chega.');
    const pedido = texto(req.body && req.body.texto, 4000);
    if (!pedido) return erro(res, 400, 'Diga o que o parceiro pediu para mudar.');
    const agora = new Date();
    const prazo = expediente.somarDiasUteis(agora, DIAS_PRAZO);
    await db.tx(async (t) => {
      await t.q(`UPDATE parcerias SET etapa = 'em_elaboracao', ajustes = ajustes + 1, ultimo_ajuste_em = $2, prazo = $3, aviso_prazo_em = NULL, atualizado_em = now() WHERE id = $1`,
        [c.id, agora, prazo]);
      await evento(t, c.id, req.usuario.id, 'ajuste', { texto: pedido, prazo });
    });
    await avisos.notificar(c.responsavel_id ? [c.responsavel_id] : await elaboradores(db, regras), { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: true,
      titulo: `Ajuste na minuta de parceria · ${c.protocolo} · ${c.empresa}`, texto: `${req.usuario.nome} pediu ajuste na minuta do contrato com ${c.empresa}: ${pedido}\n\nPrazo: ${quando(prazo)} (72h úteis).` });
    res.json({ ok: true, prazo });
  });

  r.post('/api/parcerias/:id/pedir-assinatura', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.pedir_assinatura) return erro(res, 403, 'A assinatura é pedida pelo comercial, com a minuta aprovada pelo parceiro.');
    const obs = texto(req.body && req.body.observacao, 1000);
    await db.tx(async (t) => {
      await t.q("UPDATE parcerias SET etapa = 'para_assinar', assinatura_pedida_em = now(), atualizado_em = now() WHERE id = $1", [c.id]);
      await evento(t, c.id, req.usuario.id, 'assinatura_pedida', { observacao: obs });
    });
    await avisos.notificar(c.responsavel_id ? [c.responsavel_id] : await elaboradores(db, regras), { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: true,
      titulo: `Parceria pronta para assinatura · ${c.protocolo} · ${c.empresa}`,
      texto: `${req.usuario.nome} informou que o parceiro aprovou a minuta. Mande para assinatura e marque no portal.${obs ? `\n\n${obs}` : ''}` });
    res.json({ ok: true });
  });

  r.post('/api/parcerias/:id/em-assinatura', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.enviar_assinatura) return erro(res, 403, 'Quem elabora marca o envio para assinatura, depois que o comercial pede.');
    const obs = texto(req.body && req.body.observacao, 1000);
    await db.tx(async (t) => {
      await t.q("UPDATE parcerias SET etapa = 'em_assinatura', em_assinatura_em = now(), responsavel_id = COALESCE(responsavel_id, $2), atualizado_em = now() WHERE id = $1", [c.id, req.usuario.id]);
      await evento(t, c.id, req.usuario.id, 'em_assinatura', { observacao: obs });
    });
    await avisos.notificar(donos(c), { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: false,
      titulo: `Contrato de parceria em assinatura · ${c.protocolo} · ${c.empresa}`, texto: `${req.usuario.nome} mandou o contrato com ${c.empresa} para assinatura.${obs ? ` ${obs}` : ''}` });
    res.json({ ok: true });
  });

  r.post('/api/parcerias/:id/assinado', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.assinar) return erro(res, 403, 'Quem elabora marca o contrato como assinado, depois que o comercial pede a assinatura.');
    if (!(await tiposVigentes(db, c.id)).has('contrato_assinado')) return erro(res, 400, 'Anexe o contrato assinado.');
    await db.tx(async (t) => {
      await t.q("UPDATE parcerias SET etapa = 'conferencia', assinado_em = now(), fechado = $2::jsonb, atualizado_em = now() WHERE id = $1", [c.id, JSON.stringify(F.fechadoInicial(c))]);
      await evento(t, c.id, req.usuario.id, 'assinado', {});
    });
    await seg.auditar(req, 'parceria_assinada', null, { parceria: c.id, protocolo: c.protocolo, empresa: c.empresa });
    await avisos.notificar(donos(c), { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: false,
      titulo: `Contrato de parceria assinado · ${c.protocolo} · ${c.empresa}`, texto: `O contrato com ${c.empresa} foi assinado. ${req.usuario.nome} registra as condições e o setor Parceiros cadastra o parceiro.` });
    res.json({ ok: true });
  });

  /* ===================== advogada: condições do contrato assinado ===================== */
  r.put('/api/parcerias/:id/fechado', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.registrar) return erro(res, 403, 'As condições são registradas por quem elabora, depois que o contrato assinado é anexado.');
    const fechado = F.normalizarFechado(req.body && req.body.condicoes);
    const concluir = !!(req.body && req.body.concluir);
    if (concluir) {
      const lista = F.faltasFechado(fechado);
      if (lista.length) return erro(res, 400, 'Faltam condições para concluir.', { faltas: lista });
    }
    await db.tx(async (t) => {
      if (concluir) {
        await t.q(`UPDATE parcerias SET fechado = $2::jsonb, fechado_por = $3, fechado_em = now(), etapa = 'assinado', aviso_parceiros_em = now(), atualizado_em = now()
          WHERE id = $1`, [c.id, JSON.stringify(fechado), req.usuario.id]);
        await evento(t, c.id, req.usuario.id, 'fechado', { diferencas: F.diferencasFechado(c.formulario || {}, fechado).map((d) => d.rotulo) });
      } else await t.q('UPDATE parcerias SET fechado = $2::jsonb, atualizado_em = now() WHERE id = $1', [c.id, JSON.stringify(fechado)]);
    });
    if (!concluir) return res.json({ ok: true, faltas: F.faltasFechado(fechado) });
    await seg.auditar(req, 'parceria_fechada', null, { parceria: c.id, protocolo: c.protocolo, empresa: c.empresa });
    const com = [fechado.recorrencia ? `recorrência de ${F.pct(fechado.recorrencia_pct)}` : '', fechado.venda ? `venda de ${F.pct(fechado.venda_pct)} da 1ª taxa administrativa` : ''].filter(Boolean).join(' e ') || 'sem comissão';
    await avisos.notificar(await setorParceiros(db), { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: true,
      titulo: `Cadastrar o parceiro · ${c.protocolo} · ${c.empresa}`,
      texto: `O contrato de parceria com ${c.empresa} está assinado (${com}). Abra a solicitação, confira os dados e clique em Cadastrar parceiro: ele entra na Prestação de Contas sem digitar de novo.` });
    await avisos.notificar(donos(c), { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: true,
      titulo: `Contrato de parceria concluído · ${c.protocolo} · ${c.empresa}`,
      texto: `${req.usuario.nome} registrou as condições do contrato com ${c.empresa} (${com}). O setor Parceiros cadastra o parceiro na base de comissão; você é avisado quando estiver pronto para indicar condomínios.` });
    res.json({ ok: true });
  });

  r.post('/api/parcerias/:id/corrigir', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.corrigir) return erro(res, 403, 'As condições são corrigidas por quem elabora, depois que o contrato foi concluído.');
    const motivo = texto(req.body && req.body.motivo, 1000);
    if (!motivo) return erro(res, 400, 'Diga o motivo da correção.');
    const fechado = F.normalizarFechado(req.body && req.body.condicoes);
    const lista = F.faltasFechado(fechado);
    if (lista.length) return erro(res, 400, 'Faltam condições.', { faltas: lista });
    const mudancas = F.mudancasFechado(c.fechado, fechado);
    if (!mudancas.length) return erro(res, 400, 'Nada mudou nas condições.');
    await db.tx(async (t) => {
      await t.q('UPDATE parcerias SET fechado = $2::jsonb, atualizado_em = now() WHERE id = $1', [c.id, JSON.stringify(fechado)]);
      await evento(t, c.id, req.usuario.id, 'fechado_corrigido', { motivo, mudancas });
    });
    const resumo = mudancas.map((m) => `${m.rotulo}: ${m.antes} → ${m.depois}`).join('; ');
    await avisos.notificar([...donos(c), ...(await setorParceiros(db))], { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: true,
      titulo: `Condições da parceria corrigidas · ${c.protocolo} · ${c.empresa}`,
      texto: `${req.usuario.nome} corrigiu as condições do contrato com ${c.empresa}. Motivo: ${motivo}\n\n${resumo}${c.parceiro_cadastrado_em ? '\n\nO parceiro já está na Prestação de Contas: confira o cadastro.' : ''}` });
    res.json({ ok: true, mudancas });
  });

  /* ===================== setor Parceiros: cadastra o parceiro na base de comissão ===================== */
  r.post('/api/parcerias/:id/cadastrar-parceiro', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.cadastrar_parceiro) {
      return erro(res, c.parceiro_cadastrado_em ? 409 : 403, c.parceiro_cadastrado_em ? 'O parceiro já foi cadastrado.' : 'Quem cadastra o parceiro é o setor Parceiros, depois do contrato concluído.');
    }
    const base = await baseParceiros(db, registros);
    if (!base.modulo) return erro(res, 409, 'A ferramenta Prestação de Contas — Comissão de Parceiros não está no portal.');
    const ja = base.lista.find((y) => F.acharNaBase([y.dados], c));
    const dados = F.registroParceiro(c, ja ? ja.dados : null);
    const itemId = ja ? ja.id : dados.id;
    await db.tx(async (t) => {
      await registros.upsert(MODULO_PARCEIROS, 'partners', itemId, dados, req.usuario.id, t);
      await t.q('UPDATE parcerias SET parceiro_id = $2, parceiro_cadastrado_em = now(), parceiro_cadastrado_por = $3, atualizado_em = now() WHERE id = $1', [c.id, String(dados.id), req.usuario.id]);
      await evento(t, c.id, req.usuario.id, 'parceiro_cadastrado', { nome: dados.nome, ja_existia: !!ja });
    });
    await seg.auditar(req, 'parceria_parceiro_cadastrado', null, { parceria: c.id, protocolo: c.protocolo, parceiro: dados.id, ja_existia: !!ja });
    await avisos.notificar(donos(c), { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: true,
      titulo: `Parceria assinada: já pode indicar condomínios · ${c.empresa}`,
      texto: `${req.usuario.nome} cadastrou ${dados.nome} na base de parceiros. Ele já aparece na seção Parceria do formulário de implantação.` });
    res.json({ ok: true, parceiro: dados.id, ja_existia: !!ja, interno: !!base.interno });
  });

  r.post('/api/parcerias/:id/cancelar', json, async (req, res) => {
    const x = await carregar(req, res);
    if (!x) return;
    const { c, pd } = x;
    if (!pd.cancelar) return erro(res, 403, 'Esta solicitação não pode ser cancelada.');
    const motivo = texto(req.body && req.body.motivo, 1000);
    await db.tx(async (t) => {
      await t.q("UPDATE parcerias SET etapa = 'cancelada', atualizado_em = now() WHERE id = $1", [c.id]);
      await evento(t, c.id, req.usuario.id, 'cancelada', { motivo });
    });
    if (c.etapa !== 'rascunho') {
      await avisos.notificar([...donos(c), c.responsavel_id], { link: link(c.id), autor_id: req.usuario.id, tipo: 'parceria', email: false,
        titulo: `Contrato de parceria cancelado · ${c.protocolo} · ${c.empresa}`, texto: `${req.usuario.nome} cancelou a solicitação do contrato com ${c.empresa}.${motivo ? ` Motivo: ${motivo}` : ''}` });
    }
    res.json({ ok: true });
  });

  return r;
}

module.exports = { rotasParcerias, criarRotinasParcerias, proximoProtocolo, ETAPAS, DOCUMENTOS };

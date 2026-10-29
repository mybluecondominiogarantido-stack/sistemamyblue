'use strict';
/*
 * Implantação: do contrato assinado à Base de Clientes. Toda implantação começa de um contrato: o comercial (executivo de negócios)
 * escolhe um contrato concluído no portal (Solicitação de Contrato, com as condições fechadas) ou anexa o contrato
 * assinado fora do portal com o retorno da análise; preenche o formulário e anexa os documentos; o setor Implantação
 * conduz; a coordenação confirma a entrada na Base de Clientes.
 *
 * Etapas: rascunho → fila (enviada, aguardando designação) → em_implantacao → concluida → na_carteira.
 *         juridico: contrato assinado fora do portal, com a advogada para registrar as condições (depois segue sozinha
 *         para a fila). pendencia: devolvida ao comercial. cancelada. (diretoria: só nas antigas de condomínio de entrega.)
 *
 * Quem faz o quê (definido no portal, nunca no código):
 *  - comercial: quem está ligado a um cadastro de executivo (Análise de Crédito → Pessoas e papéis); vê e pede as suas;
 *  - equipe: quem é do setor Implantação; coordenação: o gestor do setor (líder, coordenação ou supervisão);
 *  - quem elabora contratos (Jurídico): registra as condições do contrato assinado fora do portal;
 *  - diretoria: quem chancela análises de crédito; administração: tudo.
 */
const express = require('express');
const crypto = require('crypto');
const { lerPlanilha } = require('../planilha');
const { normalizar: normalizarCarteira, semAcento } = require('../carteira');
const { apelido } = require('../implantacao');
const F = require('../implantacoes/formulario');
const leitorPdf = require('../implantacoes/pdf');
const formularioPdf = require('../implantacoes/formulario-pdf');
const FC = require('../contratos/formulario');
const M = require('../implantacoes/metas');
const { rotasAcompanhamento, lembretesDocumentacao, carregarLinhas, historicoParametros } = require('./implantacoes-acompanhamento');
const { rotasFicha, criarRotinaFichas } = require('./implantacoes-ficha');
const { rotasAntecipacoes } = require('./implantacoes-antecipacoes');
const { rotasImportacao } = require('./implantacoes-importacao');
const { acertarConvite } = require('../implantacoes/convite');
const { rotasSetor, criarRotinaPrazos, prazoConcluir, autorizacaoAtiva, autorizados, pausasDe, prazoOnboarding, ESCOPOS, MOTIVOS_IMPEDIMENTO } = require('./implantacoes-setor');
const { criarPrazos } = require('../implantacoes/prazos');
const { criarPos, rotasPos, criarRotinaPos } = require('./implantacoes-pos');

const SETOR = 'Implantação';
const ETAPAS = ['rascunho', 'diretoria', 'juridico', 'fila', 'em_implantacao', 'pendencia', 'concluida', 'na_carteira', 'cancelada'];
const ORIGEM = { analise: 'Análise de Crédito', pdf: 'Análise anterior ao portal', entrega: 'Condomínio de entrega' };

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

/* Rotinas (rodam a cada poucos minutos):
 *  - pedido sem ninguém designado: lembrete à coordenação a cada 4h úteis;
 *  - prazo para iniciar (8h úteis da designação) estourado: aviso, uma vez, à coordenação e a quem foi designado;
 *  - documentos pendentes: lembrete diário, por e-mail, ao executivo (uma vez por dia útil, no expediente);
 *  - documentos da meta: lembrete ao executivo, uma vez, quando faltam até 3 dias para o limite (Acompanhamento). */
const HORAS_LEMBRETE_FILA = 4;
function criarRotinasImplantacao({ db, seg, avisos, expediente }) {
  async function coordenacao() {
    const s = await pessoasDoSetor(db, seg, SETOR);
    return s.gestores.length ? s.gestores : administradores(db);
  }
  const rotinaPrazos = criarRotinaPrazos({ db, avisos, expediente, coordenacao, link: (id) => `#/implantacao/${id}`, carregarLinhas, historicoParametros });
  const rotinaFichas = criarRotinaFichas({ db, avisos, expediente, coordenacao, historicoParametros, autorizados, P: criarPrazos((d) => expediente.ehDiaUtil(d)) });
  const rotinaPos = criarRotinaPos({ db, avisos, expediente, coordenacao, link: (id) => `#/implantacao/${id}`, autorizados, posCalc: criarPos({ db, expediente, historicoParametros }) });
  async function executar(agora = new Date()) {
    const m = expediente.momento(agora);
    const feito = { documentos: 0, sem_designacao: 0, prazos: 0, meta_documentos: 0 };
    feito.prazos_dias_uteis = { ...await rotinaPrazos(agora), ...await rotinaFichas(agora), ...await rotinaPos(agora) };
    for (const i of (await db.q("SELECT id, protocolo, condominio, enviado_em, lembrete_fila_em FROM implantacoes WHERE etapa = 'fila'")).rows) {
      if (expediente.somarHorasUteis(i.lembrete_fila_em || i.enviado_em, HORAS_LEMBRETE_FILA) > agora) continue;
      await avisos.notificar(await coordenacao(), { link: `#/implantacao/${i.id}`, tipo: 'implantacao', email: true,
        titulo: `Ainda sem ninguém designado · ${i.protocolo} · ${i.condominio}`,
        texto: `A implantação de ${i.condominio} está na fila desde ${new Date(i.enviado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })} e ainda não foi designada.` });
      await db.q('UPDATE implantacoes SET lembrete_fila_em = $2 WHERE id = $1', [i.id, agora]);
      feito.sem_designacao++;
    }
    for (const i of (await db.q(`SELECT i.id, i.protocolo, i.condominio, i.responsavel_id, i.prazo_inicio, u.nome AS responsavel_nome FROM implantacoes i
        LEFT JOIN usuarios u ON u.id = i.responsavel_id
        WHERE i.etapa = 'em_implantacao' AND i.iniciado_em IS NULL AND i.aviso_prazo_em IS NULL AND i.prazo_inicio < $1`, [agora])).rows) {
      await avisos.notificar([...(await coordenacao()), i.responsavel_id], { link: `#/implantacao/${i.id}`, tipo: 'implantacao', email: true,
        titulo: `Passou do prazo para iniciar · ${i.protocolo} · ${i.condominio}`,
        texto: `${i.responsavel_nome || 'Quem foi designado'} ainda não iniciou a implantação de ${i.condominio}; o prazo de 8h úteis venceu em ${new Date(i.prazo_inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}.` });
      await db.q('UPDATE implantacoes SET aviso_prazo_em = $2 WHERE id = $1', [i.id, agora]);
      feito.prazos++;
    }
    if (!m.noExpediente) return feito;
    const { rows } = await db.q(`SELECT id, protocolo, origem, condominio, formulario, solicitante_id, executivo_id FROM implantacoes
      WHERE etapa IN ('fila','em_implantacao','pendencia','concluida') AND importacao_id IS NULL AND (aviso_docs_em IS NULL OR aviso_docs_em < $1::date)`, [m.dia]);
    for (const i of rows) {
      const pend = F.pendencias(i.formulario || {}, await tiposVigentes(db, i.id), i.origem);
      if (pend.length) {
        await avisos.notificar(await donos(db, i), { link: `#/implantacao/${i.id}`, tipo: 'implantacao', email: true,
          titulo: `Pendências da implantação · ${i.protocolo} · ${i.condominio}`,
          texto: `Ainda falta enviar: ${pend.join('; ')}. Anexe no portal, na implantação ${i.protocolo}.` });
        feito.documentos++;
      }
      await db.q('UPDATE implantacoes SET aviso_docs_em = $2::date WHERE id = $1', [i.id, m.dia]);
    }
    feito.meta_documentos = await lembretesDocumentacao(db, avisos, M.diaSP(agora));
    return feito;
  }
  return { executar };
}

/* solicitação de contrato da mesma análise: o assinado (com as condições fechadas) vale sobre a que ainda está em andamento */
async function contratoDaAnalise(db, { analiseId, protocolo }) {
  return db.um(`SELECT * FROM contratos WHERE etapa <> 'cancelada' AND ((analise_id IS NOT NULL AND analise_id = $1) OR (analise_protocolo IS NOT NULL AND analise_protocolo = $2))
    ORDER BY (etapa = 'assinado') DESC, id DESC LIMIT 1`, [analiseId || null, protocolo || null]);
}
/* o contrato traz os dados (o fechado vale sobre o pedido) e os documentos que a implantação ainda não tem */
async function trazerDoContrato(t, implantacaoId, ct) {
  await t.q('UPDATE implantacoes SET contrato_id = $2 WHERE id = $1', [implantacaoId, ct.id]);
  const ja = new Set((await t.q('SELECT DISTINCT tipo FROM implantacao_documentos WHERE implantacao_id = $1 AND substituido_em IS NULL', [implantacaoId])).rows.map((x) => x.tipo));
  for (const d of (await t.q('SELECT id, tipo FROM contrato_documentos WHERE contrato_id = $1 AND substituido_em IS NULL ORDER BY id', [ct.id])).rows) {
    const para = FC.DOC_IMPLANTACAO[d.tipo];
    if (!para || (para !== 'outro' && ja.has(para))) continue;
    ja.add(para);
    await t.q(`INSERT INTO implantacao_documentos (implantacao_id, tipo, nome, mime, tamanho, sha256, conteudo, enviado_por, enviado_em, vinculado)
      SELECT $1, $2, nome, mime, tamanho, sha256, conteudo, enviado_por, enviado_em, TRUE FROM contrato_documentos WHERE id = $3`, [implantacaoId, para, d.id]);
  }
}

/* contrato concluído (condições fechadas) sem implantação: o portal abre a implantação em rascunho para o executivo,
   com as condições fechadas, o contrato assinado, a convenção e o retorno da análise. Roda dentro da transação de quem chama. */
async function abrirDoContrato(t, ct, usuarioId) {
  const analise = ct.analise_id ? await t.um('SELECT * FROM analises WHERE id = $1', [ct.analise_id]) : null;
  let origem, base, referencia;
  if (analise) {
    origem = 'analise';
    ({ formulario: base, referencia } = F.daAnalise(analise));
  } else if (ct.origem === 'pdf') {
    origem = 'pdf';
    base = {};
    referencia = { ...(ct.referencia || {}) };
  } else {
    // condomínio de entrega: a taxa e o boleto aprovados pela diretoria no contrato valem como a aprovação da implantação
    origem = 'entrega';
    base = { entrega: true };
    const d = ct.diretoria || {};
    referencia = d.aprovado && d.decidido_em ? { taxa_adm: Number((ct.fechado || {}).taxa_adm) || null, boleto: Number((ct.fechado || {}).boleto) || null, aprovado_por: d.por,
      aprovado_em: d.decidido_em, observacao: `Aprovado no contrato ${ct.protocolo}.${d.observacao ? ` ${d.observacao}` : ''}` } : {};
  }
  const formulario = { ...base, ...FC.paraImplantacao(ct) };
  const { id } = await t.um(`INSERT INTO implantacoes (etapa, origem, analise_id, analise_protocolo, condominio, cnpj, uf, executivo_id, solicitante_id, formulario, referencia, contrato_id)
    VALUES ('rascunho', $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11) RETURNING id`,
  [origem, analise ? analise.id : null, ct.analise_protocolo || null, formulario.nome || ct.condominio || '', formulario.sem_cnpj ? '' : formulario.cnpj || ct.cnpj || '',
    String(formulario.uf || ct.uf || '').toUpperCase(), ct.executivo_id, ct.solicitante_id, JSON.stringify(formulario), JSON.stringify(referencia), ct.id]);
  if (analise) {
    for (const [de, para] of [['convencao', 'convencao'], ['retorno_pdf', 'analise_credito']]) {
      await t.q(`INSERT INTO implantacao_documentos (implantacao_id, tipo, nome, mime, tamanho, sha256, conteudo, enviado_por, enviado_em, vinculado)
        SELECT $1, $2, nome, mime, tamanho, sha256, conteudo, enviado_por, enviado_em, TRUE FROM analise_documentos
        WHERE id = (SELECT MAX(id) FROM analise_documentos WHERE analise_id = $3 AND tipo = $4 AND substituido_em IS NULL)`, [id, para, analise.id, de]);
    }
  }
  await trazerDoContrato(t, id, ct);
  await t.q('INSERT INTO implantacao_eventos (implantacao_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)',
    [id, usuarioId, 'criada', JSON.stringify({ origem, analise: ct.analise_protocolo || null, contrato: ct.protocolo, do_contrato: true })]);
  return id;
}

/* envia ao setor Implantação: protocolo, fila (ou volta a quem conduz, no reenvio depois de pendência) e os avisos.
   autor: quem enviou (o executivo; no contrato assinado fora do portal, a advogada que registrou as condições).
   retomada: no reenvio, o texto do prazo que voltou a contar (calculado depois que a pausa da pendência fecha) */
async function enviarAoSetor({ db, seg, avisos }, i, autor, { retomada = async () => '' } = {}) {
  const docs = await tiposVigentes(db, i.id);
  const pend = F.pendencias(i.formulario, docs, i.origem);
  const reenvio = i.etapa === 'pendencia';
  const doJuridico = i.etapa === 'juridico';
  const protocolo = i.protocolo || await proximoProtocolo(db);
  const etapa = i.responsavel_id ? 'em_implantacao' : 'fila';
  await db.tx(async (t) => {
    // o lembrete diário de pendências começa no próximo dia útil (no envio vai o aviso no sino)
    await t.q(`UPDATE implantacoes SET protocolo = $2, etapa = $3, enviado_em = COALESCE(enviado_em, now()), aviso_docs_em = $4::date, lembrete_fila_em = now(),
      atualizado_em = now() WHERE id = $1`, [i.id, protocolo, etapa, diaBrasilia()]);
    await t.q('INSERT INTO implantacao_eventos (implantacao_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)',
      [i.id, autor.id, reenvio ? 'reenviada' : 'enviada', JSON.stringify({ protocolo, pendentes: pend, ...(doJuridico ? { do_juridico: true } : {}) })]);
    // a pendência pausou o prazo para concluir: o reenvio retoma de onde parou
    if (reenvio) await t.q("UPDATE implantacao_pausas SET fim = now(), resolucao = 'Pendência respondida pelo comercial', encerrada_por = $2 WHERE implantacao_id = $1 AND tipo = 'pendencia' AND fim IS NULL", [i.id, autor.id]);
  });
  const resumoPend = pend.length ? ` ${pend.length} documento(s)/dado(s) ainda pendente(s): ${pend.join('; ')}.` : '';
  if (reenvio && i.responsavel_id) {
    await avisos.notificar([i.responsavel_id], { link: `#/implantacao/${i.id}`, autor_id: autor.id, tipo: 'implantacao', email: true,
      titulo: `Pendência respondida · ${protocolo} · ${i.condominio}`, texto: `${autor.nome} respondeu a pendência da implantação de ${i.condominio}.${resumoPend}${await retomada()}` });
  } else {
    const setor = await pessoasDoSetor(db, seg, SETOR);
    const origem = i.assinado_fora ? 'contrato assinado fora do portal' : i.origem === 'analise' ? `análise ${i.analise_protocolo}`
      : i.origem === 'pdf' ? `análise anterior ao portal ${i.analise_protocolo}` : ORIGEM[i.origem].toLowerCase();
    const quem = doJuridico ? `${autor.nome} registrou as condições do contrato de ${i.condominio} (${origem}) e a implantação seguiu para o setor`
      : `${autor.nome} enviou ${i.condominio} (${origem}) para implantação`;
    await avisos.notificar(setor.gestores.length ? setor.gestores : await administradores(db), { link: `#/implantacao/${i.id}`, autor_id: autor.id, tipo: 'implantacao', email: true,
      titulo: `Nova implantação · ${protocolo} · ${i.condominio}`, texto: `${quem}. Aguardando designação.${resumoPend}` });
    await avisos.notificar(setor.equipe, { link: `#/implantacao/${i.id}`, autor_id: autor.id, tipo: 'implantacao', email: true,
      titulo: `Chegou uma nova implantação · ${protocolo} · ${i.condominio}`, texto: `${quem}. A coordenação vai designar quem conduz.` });
  }
  if (pend.length) {
    // aviso no sino para o executivo (inclusive quando foi ele quem enviou); o e-mail diário vem pela rotina
    await avisos.notificar(await donos(db, i), { link: `#/implantacao/${i.id}`, autor_id: null, tipo: 'implantacao', email: false,
      titulo: `Pendências da implantação · ${protocolo} · ${i.condominio}`,
      texto: `Enviada ao setor Implantação. Ainda falta enviar: ${pend.join('; ')}. Você recebe um lembrete por e-mail a cada dia útil até chegarem.` });
  }
  return { protocolo, etapa, pendencias: pend };
}

/* contrato assinado fora do portal: o envio leva o contrato ao Jurídico (direto para registrar as condições, sem minuta)
   e a implantação espera lá (etapa juridico); com as condições registradas, segue sozinha para o setor (seguirDoJuridico) */
async function enviarAoJuridico({ db, avisos, regras }, i, autor) {
  const CT = require('./contratos'); // aqui, e não no topo: contratos.js também usa este arquivo
  const f = i.formulario || {};
  const protocolo = i.protocolo || await proximoProtocolo(db);
  const ctProtocolo = await CT.proximoProtocolo(db);
  // o pedido do contrato é o formulário da implantação: a advogada parte dele (e do retorno da análise) para registrar o assinado
  const pedido = { ...f, pedidos: [], assinado_fora: true, implantacao_protocolo: protocolo };
  const ct = await db.tx(async (t) => {
    const { id } = await t.um(`INSERT INTO contratos (protocolo, etapa, origem, analise_protocolo, condominio, cnpj, uf, executivo_id, solicitante_id, formulario, referencia, enviado_em, assinado_em)
      VALUES ($1, 'conferencia', 'pdf', $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, now(), now()) RETURNING id`,
    [ctProtocolo, i.analise_protocolo || null, i.condominio || f.nome || '', f.sem_cnpj ? '' : i.cnpj || '', i.uf || '', i.executivo_id, i.solicitante_id, JSON.stringify(pedido), JSON.stringify(i.referencia || {})]);
    for (const [de, para] of [['contrato', 'contrato_assinado'], ['analise_credito', 'analise_credito'], ['convencao', 'convencao']]) {
      await t.q(`INSERT INTO contrato_documentos (contrato_id, tipo, nome, mime, tamanho, sha256, conteudo, enviado_por, enviado_em)
        SELECT $1, $2, nome, mime, tamanho, sha256, conteudo, enviado_por, enviado_em FROM implantacao_documentos
        WHERE id = (SELECT MAX(id) FROM implantacao_documentos WHERE implantacao_id = $3 AND tipo = $4 AND substituido_em IS NULL AND conteudo IS NOT NULL)`, [id, para, i.id, de]);
    }
    await t.q('INSERT INTO contrato_eventos (contrato_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)',
      [id, autor.id, 'assinado_fora', JSON.stringify({ protocolo: ctProtocolo, implantacao: protocolo })]);
    // o contrato e o retorno que a advogada confere ficam presos à implantação
    await t.q("UPDATE implantacao_documentos SET vinculado = TRUE WHERE implantacao_id = $1 AND tipo IN ('contrato','analise_credito') AND substituido_em IS NULL", [i.id]);
    await t.q("UPDATE implantacoes SET protocolo = $2, etapa = 'juridico', contrato_id = $3, atualizado_em = now() WHERE id = $1", [i.id, protocolo, id]);
    await t.q('INSERT INTO implantacao_eventos (implantacao_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)',
      [i.id, autor.id, 'juridico', JSON.stringify({ protocolo, contrato: ctProtocolo })]);
    return { id, protocolo: ctProtocolo };
  });
  const elaboram = await regras.pessoasCom(CT.PERMISSAO);
  await avisos.notificar(elaboram.length ? elaboram : await administradores(db), { link: `#/contratos/${ct.id}`, autor_id: autor.id, tipo: 'contrato', email: true,
    titulo: `Contrato assinado fora do portal · ${ct.protocolo} · ${i.condominio}`,
    texto: `${autor.nome} pediu a implantação de ${i.condominio} (${protocolo}) com um contrato assinado fora do portal. Confira a via assinada e registre as condições fechadas: com elas, a implantação segue para o setor Implantação.` });
  return { protocolo, etapa: 'juridico', contrato: ct.protocolo, pendencias: [] };
}

/* a advogada registrou as condições do contrato assinado fora do portal: elas entram na implantação e ela segue para o setor
   (se ainda faltar algo do executivo, volta para ele completar e enviar) */
async function seguirDoJuridico({ db, seg, avisos }, implantacaoId, ct, autor) {
  const i = await db.um('SELECT * FROM implantacoes WHERE id = $1', [implantacaoId]);
  if (!i || i.etapa !== 'juridico') return null;
  const doContrato = FC.paraImplantacao(ct);
  const f = { ...(i.formulario || {}) };
  for (const k of FC.CAMPOS_FECHADOS_IMPLANTACAO) if (doContrato[k] !== undefined) f[k] = doContrato[k];
  await db.q('UPDATE implantacoes SET formulario = $2::jsonb, atualizado_em = now() WHERE id = $1', [i.id, JSON.stringify(f)]);
  i.formulario = f;
  const fmt = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const resumo = `${fmt(f.taxa_adm)}% de taxa administrativa, boleto de R$ ${fmt(f.boleto)}${f.inicio_contrato ? `, vigência a partir de ${f.inicio_contrato.split('-').reverse().join('/')}` : ''}`;
  const falta = F.faltas(f, { docs: await tiposVigentes(db, i.id), origem: i.origem, executivoId: i.executivo_id, referencia: i.referencia, assinadoFora: true });
  if (falta.length) {
    await db.q("UPDATE implantacoes SET etapa = 'rascunho', atualizado_em = now() WHERE id = $1", [i.id]);
    await avisos.notificar(await donos(db, i), { link: `#/implantacao/${i.id}`, autor_id: autor.id, tipo: 'implantacao', email: true,
      titulo: `Condições registradas: complete a implantação · ${i.protocolo} · ${i.condominio}`,
      texto: `${autor.nome} registrou as condições do contrato de ${i.condominio}: ${resumo}. Para seguir ao setor Implantação, ainda falta: ${falta.join(' ')} Complete e envie.` });
    return { etapa: 'rascunho', faltas: falta };
  }
  const r = await enviarAoSetor({ db, seg, avisos }, i, autor);
  await avisos.notificar(await donos(db, i), { link: `#/implantacao/${i.id}`, autor_id: autor.id, tipo: 'implantacao', email: true,
    titulo: `Condições registradas · ${r.protocolo} · ${i.condominio}`,
    texto: `${autor.nome} registrou as condições do contrato de ${i.condominio}: ${resumo}. A implantação seguiu para o setor Implantação.` });
  return r;
}

/* o Jurídico cancelou o contrato assinado fora do portal: a implantação volta para o executivo */
async function voltarDoJuridico({ db, avisos }, ct, autor, motivo) {
  const i = await db.um("SELECT * FROM implantacoes WHERE contrato_id = $1 AND etapa = 'juridico'", [ct.id]);
  if (!i) return;
  await db.tx(async (t) => {
    await t.q("UPDATE implantacoes SET etapa = 'rascunho', contrato_id = NULL, atualizado_em = now() WHERE id = $1", [i.id]);
    // o contrato anexado volta a poder ser trocado (o retorno da análise continua vinculado, como veio do PDF)
    await t.q("UPDATE implantacao_documentos SET vinculado = FALSE WHERE implantacao_id = $1 AND tipo = 'contrato'", [i.id]);
    await t.q('INSERT INTO implantacao_eventos (implantacao_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)',
      [i.id, autor.id, 'juridico_cancelou', JSON.stringify({ contrato: ct.protocolo, motivo })]);
  });
  await avisos.notificar(await donos(db, i), { link: `#/implantacao/${i.id}`, autor_id: autor.id, tipo: 'implantacao', email: true,
    titulo: `O Jurídico não seguiu com o contrato · ${i.protocolo} · ${i.condominio}`,
    texto: `${autor.nome} cancelou a conferência do contrato assinado de ${i.condominio}.${motivo ? ` Motivo: ${motivo}` : ''} A implantação voltou para você: confira o contrato anexado e envie de novo, ou cancele.` });
}

const HORAS_PARA_INICIAR = 8;
const normal = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function rotasImplantacoes({ db, seg, cfg, avisos, regras, registros, expediente, boletosCarteira, acessos }) {
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
    const admin = u.papel === 'admin';
    const meus = new Map((await db.q('SELECT s.nome, sm.lider FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id WHERE sm.usuario_id = $1', [u.id])).rows.map((x) => [x.nome, !!x.lider]));
    const gestorPapel = seg.GESTORES_DE_SETOR.includes(u.papel);
    const equipe = meus.has(SETOR);
    const executivo = await db.um('SELECT id, nome, uf FROM executivos WHERE usuario_id = $1 AND ativo', [u.id]);
    return {
      admin, equipe, executivo,
      coordenacao: admin || (equipe && (meus.get(SETOR) || gestorPapel)),
      diretoria: admin || (await regras.pode(u, 'credito.diretoria')),
    };
  }

  /* quem edita: a designada (responsável), a coordenação e quem tem autorização da coordenação (aut: { escopo }) */
  function pode(p, i, u, aut = null) {
    const dono = i.solicitante_id === u.id || !!(p.executivo && i.executivo_id === p.executivo.id);
    const interno = p.admin || p.equipe || p.coordenacao || p.diretoria;
    const editavel = ['rascunho', 'pendencia'].includes(i.etapa);
    const aberta = !['cancelada', 'na_carteira'].includes(i.etapa);
    const responsavel = i.responsavel_id === u.id;
    const autTudo = !!(aut && aut.escopo === 'tudo');
    const autEtapas = autTudo || !!(aut && aut.escopo === 'etapas');
    const autDocs = autTudo || !!(aut && aut.escopo === 'documentos');
    const doSetor = responsavel || p.coordenacao || p.admin;
    const conduz = i.etapa === 'em_implantacao' && !!i.iniciado_em && (doSetor || autEtapas);
    const depois = ['concluida', 'na_carteira'].includes(i.etapa);
    const onbPendente = !F.onboardingFeito(i.etapas);
    // importada das planilhas (histórico): consulta, Obs., documentos e, se ficou em andamento, as etapas e concluir (sem avisos)
    if (i.importacao_id) {
      const emAndamento = i.etapa === 'em_implantacao' && (doSetor || autEtapas);
      const nada = { designar: false, iniciar: false, pendencia: false, carteira: false, editar: false, tirar_documentos: false, enviar: false,
        cancelar: false, impedimento: false, onboarding: false, justificar_onboarding: false, pedir_autorizacao: false, autorizar: false };
      return { ...nada, ver: interno, interno, etapas: emAndamento, concluir: emAndamento, documentos: doSetor || autDocs, marcar_documentos: doSetor || autDocs,
        // concluída fora da Base de Clientes: a coordenação confirma a entrada (com a conferência de ID e CNPJ repetidos)
        carteira: p.coordenacao && i.etapa === 'concluida',
        obs_controle: doSetor || autTudo, editar_setor: doSetor || autTudo, importada: true };
    }
    return {
      designar: p.coordenacao && ['fila', 'em_implantacao', 'pendencia'].includes(i.etapa),
      iniciar: responsavel && i.etapa === 'em_implantacao' && !i.iniciado_em,
      etapas: conduz,
      pendencia: conduz,
      concluir: conduz,
      carteira: p.coordenacao && i.etapa === 'concluida',
      ver: dono || interno,
      interno,
      editar: editavel && (dono || p.admin),
      // documentos: o comercial (dono), a coordenação e, na equipe, só quem conduz ou tem autorização
      documentos: aberta && (dono || doSetor || autDocs),
      marcar_documentos: !['rascunho', 'diretoria', 'juridico', 'cancelada'].includes(i.etapa) && !!i.responsavel_id && (doSetor || autDocs),
      impedimento: i.etapa === 'em_implantacao' && !!i.iniciado_em && (doSetor || autEtapas),
      onboarding: depois && onbPendente && (doSetor || autEtapas),
      justificar_onboarding: ['em_implantacao', 'pendencia', 'concluida', 'na_carteira'].includes(i.etapa) && !!i.responsavel_id && (doSetor || autEtapas),
      obs_controle: !['rascunho', 'diretoria', 'juridico', 'cancelada'].includes(i.etapa) && !!i.enviado_em && (doSetor || autTudo),
      pedir_autorizacao: p.equipe && !doSetor && !aut && !!i.responsavel_id && ['em_implantacao', 'pendencia', 'concluida', 'na_carteira'].includes(i.etapa),
      autorizar: (p.coordenacao || p.admin) && !!i.responsavel_id && !['rascunho', 'diretoria', 'juridico', 'cancelada'].includes(i.etapa),
      editar_setor: doSetor || autTudo,
      // o comercial tira (e troca) documento só antes do primeiro envio; depois, o errado volta como pendência pela Implantação
      tirar_documentos: editavel && (p.admin || (dono && !i.enviado_em)),
      enviar: editavel && (dono || p.admin),
      // com o Jurídico, o executivo ainda desiste (a conferência do contrato é cancelada junto)
      cancelar: ((editavel || i.etapa === 'juridico') && dono) || (p.coordenacao && aberta),
    };
  }

  async function carregar(req, res) {
    const i = await db.um(`SELECT i.*, ur.nome AS responsavel_nome FROM implantacoes i LEFT JOIN usuarios ur ON ur.id = i.responsavel_id WHERE i.id = $1`, [Number(req.params.id) || 0]);
    const p = await perfil(req.usuario);
    if (!i || !pode(p, i, req.usuario).ver) { erro(res, 404, 'Implantação não encontrada.'); return null; }
    const aut = p.equipe && i.responsavel_id !== req.usuario.id ? await autorizacaoAtiva(db, i.id, req.usuario.id) : null;
    return { i, p, aut, pd: pode(p, i, req.usuario, aut) };
  }
  async function coordenacao() {
    const s = await pessoasDoSetor(db, seg, SETOR);
    return s.gestores.length ? s.gestores : administradores(db);
  }
  const P = criarPrazos((d) => expediente.ehDiaUtil(d));

  /* ---------- contratos concluídos que podem virar implantação (os do executivo; a administração vê todos) ---------- */
  async function contratosDisponiveis(p, u) {
    const args = [];
    const v = (x) => { args.push(x); return '$' + args.length; };
    const where = ["c.etapa = 'assinado'", 'c.fechado_em IS NOT NULL',
      `NOT EXISTS (SELECT 1 FROM implantacoes i WHERE i.etapa <> 'cancelada' AND (i.contrato_id = c.id OR (i.contrato_id IS NULL
        AND ((i.analise_id IS NOT NULL AND i.analise_id = c.analise_id) OR (i.analise_protocolo IS NOT NULL AND i.analise_protocolo = c.analise_protocolo)))))`];
    if (!p.admin) where.push(`(c.solicitante_id = ${v(u.id)} OR c.executivo_id = ${v(p.executivo ? p.executivo.id : 0)})`);
    const { rows } = await db.q(`SELECT c.id, c.protocolo, c.origem, c.condominio, c.uf, c.analise_protocolo, c.fechado, c.fechado_em, c.diretoria, c.formulario->>'cidade' AS cidade,
        e.nome AS executivo_nome FROM contratos c LEFT JOIN executivos e ON e.id = c.executivo_id
      WHERE ${where.join(' AND ')} ORDER BY c.fechado_em DESC LIMIT 200`, args);
    return rows.map(({ fechado, diretoria, ...c }) => ({ ...c, taxa_adm: fechado.taxa_adm ?? null, boleto: fechado.boleto ?? null, inicio_contrato: fechado.inicio_contrato || null,
      primeiro_vencimento: fechado.primeiro_vencimento || null, entrega_aprovada: c.origem === 'entrega' && !!(diretoria && diretoria.aprovado && diretoria.decidido_em) }));
  }

  /* ===================== perfil, contadores e listas auxiliares ===================== */
  r.get('/api/implantacoes/meta', async (req, res) => {
    const p = await perfil(req.usuario);
    res.json({
      perfil: { admin: p.admin, equipe: p.equipe, coordenacao: p.coordenacao, diretoria: p.diretoria, executivo: p.executivo },
      executivos: p.admin ? (await db.q('SELECT id, nome, uf FROM executivos WHERE ativo ORDER BY nome')).rows : p.executivo ? [p.executivo] : [],
      da_advogada: F.DA_ADVOGADA,
      documentos: Object.entries(F.DOCUMENTOS).map(([tipo, d]) => ({ tipo, ...d })),
      garantias: F.GARANTIAS, receitas_cashback: F.RECEITAS_CASHBACK, origens: ORIGEM, onboarding: F.ONBOARDING, envio: F.ENVIO,
      horas_para_iniciar: HORAS_PARA_INICIAR,
      equipe: p.coordenacao || p.equipe ? (await db.q(`SELECT u.id, u.nome FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id JOIN usuarios u ON u.id = sm.usuario_id
        WHERE s.nome = $1 AND u.ativo ORDER BY u.nome`, [SETOR])).rows : [],
    });
  });

  r.get('/api/implantacoes/resumo', async (req, res) => {
    const p = await perfil(req.usuario);
    const out = { acesso: !!(p.executivo || p.equipe || p.coordenacao || p.diretoria), acompanhamento: !!(p.admin || p.equipe || p.coordenacao || p.diretoria) };
    if (!out.acesso) return res.json(out);
    if (p.equipe || p.coordenacao) {
      Object.assign(out, await db.um(`SELECT COUNT(*) FILTER (WHERE etapa = 'fila')::int AS fila,
        COUNT(*) FILTER (WHERE etapa = 'em_implantacao' AND responsavel_id = $1)::int AS minhas,
        COUNT(*) FILTER (WHERE etapa = 'concluida')::int AS carteira FROM implantacoes WHERE importacao_id IS NULL`, [req.usuario.id]));
      if (!p.coordenacao) out.carteira = 0;
    }
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

  /* ===================== contratos concluídos, para a Nova implantação ===================== */
  r.get('/api/implantacoes/contratos', async (req, res) => {
    const p = await perfil(req.usuario);
    if (!p.executivo && !p.admin) return erro(res, 403, 'Só executivos de negócios cadastrados pedem implantação.');
    res.json({ contratos: await contratosDisponiveis(p, req.usuario) });
  });

  const posCalc = criarPos({ db, expediente, historicoParametros });
  /* prazo para concluir de cada implantação do portal (Dashboard: concluídas no prazo, tempo médio, por assistente):
     { id: { status, atraso, vence, em, iniciada, dias } }, dias = dias úteis entre iniciar e concluir, sem as pausas */
  async function prazosConcluir(brutas, historico, hoje) {
    const pausas = new Map();
    for (const x of (await db.q('SELECT implantacao_id, inicio, fim FROM implantacao_pausas ORDER BY id')).rows) {
      if (!pausas.has(x.implantacao_id)) pausas.set(x.implantacao_id, []);
      pausas.get(x.implantacao_id).push(x);
    }
    const out = {};
    for (const i of brutas) {
      const ps = pausas.get(i.id) || [];
      const s = prazoConcluir(i, ps, M.parametrosEm(historico, M.diaSP(i.enviado_em || i.iniciado_em)), P, hoje);
      if (!s) continue;
      const dias = i.concluido_em ? P.consumidos(M.diaSP(i.iniciado_em), M.diaSP(i.concluido_em), ps.map((p) => ({ inicio: M.diaSP(p.inicio), fim: p.fim ? M.diaSP(p.fim) : null }))) : null;
      out[i.id] = { status: s.status, atraso: s.atraso || 0, faltam: s.faltam == null ? null : s.faltam, vence: s.vence || null, em: s.em || null, desde: s.desde || null, iniciada: M.diaSP(i.iniciado_em), dias };
    }
    return out;
  }
  rotasAcompanhamento(r, { db, seg, avisos, perfil, erro, evento, json, fichas: () => fichaRotas.resumo(), pos: () => posCalc.resumo(), prazos: prazosConcluir });
  rotasImportacao(r, { db, erro, perfil, historicoParametros });
  // convite do onboarding no Outlook (só com Microsoft 365): criar, atualizar ou cancelar depois de salvar
  const convite = (i, onboarding) => acertarConvite({ db, agenda: avisos.agenda, gestores: seg.GESTORES_DE_SETOR }, i, onboarding);
  rotasSetor(r, { db, avisos, erro, evento, json, link, coordenacao, carregar, historicoParametros, expediente, convite });
  // a ficha de transição abre na conclusão
  const fichaRotas = rotasFicha(r, { db, seg, avisos, erro, evento, json, link, perfil, pode, coordenacao, pessoasDoSetor, administradores, historicoParametros,
    autorizacaoAtiva, autorizados, P });
  const aoConcluir = fichaRotas.aoConcluir;
  rotasAntecipacoes(r, { db, avisos, erro, evento, json, link, coordenacao, carregar, acessos });
  rotasPos(r, { db, erro, evento, json, carregar, posCalc });

  /* ===================== listagem ===================== */
  r.get('/api/implantacoes', async (req, res) => {
    const u = req.usuario;
    const p = await perfil(u);
    const args = [];
    const v = (x) => { args.push(x); return '$' + args.length; };
    const where = [];
    const vis = String(req.query.vis || 'minhas');
    const setor = p.equipe || p.coordenacao;
    // as importadas das planilhas são histórico: aparecem em Todas e no Acompanhamento, não nas filas
    if (vis === 'minhas') where.push(`(i.solicitante_id = ${v(u.id)} OR i.executivo_id = ${v(p.executivo ? p.executivo.id : 0)}) AND i.importacao_id IS NULL`);
    else if (vis === 'fila') { if (!setor) return erro(res, 403, 'A fila é do setor Implantação.'); where.push("i.etapa IN ('fila','em_implantacao','pendencia') AND i.importacao_id IS NULL"); }
    else if (vis === 'carteira') { if (!setor) return erro(res, 403, 'Só o setor Implantação.'); where.push("i.etapa = 'concluida'"); }
    else if (vis === 'todas') { if (!setor && !p.diretoria) return erro(res, 403, 'O histórico é do setor Implantação e da diretoria.'); where.push("i.etapa <> 'rascunho'"); }
    else return erro(res, 400, 'Visão inválida.');
    const busca = texto(req.query.q, 100);
    if (busca) where.push(`(i.condominio ILIKE ${v('%' + busca + '%')} OR i.protocolo ILIKE $${args.length} OR i.cnpj ILIKE $${args.length})`);
    const { rows } = await db.q(`SELECT i.id, i.protocolo, i.etapa, i.origem, i.assinado_fora, i.analise_id, i.analise_protocolo, ct.protocolo AS contrato_protocolo, i.condominio, i.cnpj, i.uf, i.formulario,
        i.enviado_em, i.prazo_inicio, i.iniciado_em, i.criado_em, i.atualizado_em, i.responsavel_id, i.numero_planilha, i.importacao_id,
        COALESCE(e.nome, NULLIF(i.importacao->>'executivo', '')) AS executivo_nome, COALESCE(ur.nome, NULLIF(i.importacao->>'implantado_por', '')) AS responsavel_nome,
        (SELECT array_agg(DISTINCT d.tipo) FROM implantacao_documentos d WHERE d.implantacao_id = i.id AND d.substituido_em IS NULL) AS tipos
      FROM implantacoes i LEFT JOIN executivos e ON e.id = i.executivo_id LEFT JOIN usuarios ur ON ur.id = i.responsavel_id LEFT JOIN contratos ct ON ct.id = i.contrato_id
      WHERE ${where.join(' AND ')}
      ORDER BY (i.etapa IN ('fila','em_implantacao','pendencia')) DESC, i.enviado_em NULLS LAST, i.atualizado_em DESC LIMIT 300`, args);
    res.json({ implantacoes: rows.map(({ formulario, tipos, ...x }) => ({ ...x, uh_total: formulario.uh_total ?? null,
      pendentes: ['rascunho', 'diretoria', 'juridico', 'cancelada'].includes(x.etapa) ? [] : F.pendencias(formulario, new Set(tipos || []), x.origem) })) });
  });

  /* contrato assinado fora do portal cujas condições a advogada ainda não registrou */
  const semCondicoes = (i, ct) => !!i.assinado_fora && !(ct && ct.fechado_em);

  /* ===================== detalhe ===================== */
  r.get('/api/implantacoes/:id', async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    const info = await db.um(`SELECT e.nome AS executivo_nome, e.uf AS executivo_uf, us.nome AS solicitante_nome, ur.nome AS responsavel_nome
      FROM implantacoes i LEFT JOIN executivos e ON e.id = i.executivo_id LEFT JOIN usuarios us ON us.id = i.solicitante_id
      LEFT JOIN usuarios ur ON ur.id = i.responsavel_id WHERE i.id = $1`, [i.id]);
    const documentos = (await db.q(`SELECT d.id, d.tipo, d.nome, d.mime, d.tamanho, d.enviado_em, d.substituido_em, d.vinculado, d.sem_arquivo, d.observacao, d.recebido_de, d.desfeito_em, u.nome AS enviado_por_nome
      FROM implantacao_documentos d LEFT JOIN usuarios u ON u.id = d.enviado_por WHERE d.implantacao_id = $1 ORDER BY d.id`, [i.id])).rows;
    const eventos = (await db.q(`SELECT ev.id, ev.tipo, ev.detalhe, ev.criado_em, u.nome AS usuario_nome FROM implantacao_eventos ev
      LEFT JOIN usuarios u ON u.id = ev.usuario_id WHERE ev.implantacao_id = $1 ORDER BY ev.id`, [i.id])).rows;
    const docs = new Set(documentos.filter((d) => !d.substituido_em).map((d) => d.tipo));
    await db.q('UPDATE notificacoes SET lida = TRUE WHERE usuario_id = $1 AND link = $2 AND NOT lida', [req.usuario.id, link(i.id)]);
    // contrato: o ligado à implantação, ou o da mesma análise; sem contrato assinado no portal, a tela avisa
    const ct = i.contrato_id ? await db.um('SELECT * FROM contratos WHERE id = $1', [i.contrato_id])
      : i.origem === 'entrega' ? null : await contratoDaAnalise(db, { analiseId: i.analise_id, protocolo: i.analise_protocolo });
    const contrato = ct ? { id: ct.id, protocolo: ct.protocolo, etapa: ct.etapa, fechado_em: ct.fechado_em,
      fechado: ct.fechado_em ? ct.fechado : null, diferencas: ct.fechado_em ? FC.diferencasFechado(ct.formulario || {}, ct.fechado) : [],
      diferente_da_implantacao: ct.fechado_em ? FC.implantacaoDiferente(i.formulario, ct.fechado) : [],
      corrigido: (await db.um(`SELECT ev.criado_em, ev.detalhe->>'motivo' AS motivo, u.nome FROM contrato_eventos ev LEFT JOIN usuarios u ON u.id = ev.usuario_id
        WHERE ev.contrato_id = $1 AND ev.tipo = 'fechado_corrigido' ORDER BY ev.id DESC LIMIT 1`, [ct.id])) || null,
      fechado_por_nome: ct.fechado_por ? ((await db.um('SELECT nome FROM usuarios WHERE id = $1', [ct.fechado_por])) || {}).nome : null } : null;
    // setor: autorizações para editar, pausas e prazos (concluir em dias úteis e onboarding)
    let setor = null;
    if (pd.interno && i.enviado_em) {
      const autorizacoes = (await db.q(`SELECT a.id, a.usuario_id, a.situacao, a.escopo, to_char(a.ate, 'YYYY-MM-DD') AS ate, a.motivo, a.resposta, a.pedida_em, a.decidida_em,
          u.nome AS usuario_nome, ud.nome AS decidida_por_nome FROM implantacao_autorizacoes a JOIN usuarios u ON u.id = a.usuario_id
          LEFT JOIN usuarios ud ON ud.id = a.decidida_por WHERE a.implantacao_id = $1 AND (a.situacao IN ('pedida','ativa') OR a.usuario_id = $2) ORDER BY a.id DESC`, [i.id, req.usuario.id])).rows
        .filter((a) => c.p.coordenacao || c.p.admin || a.usuario_id === req.usuario.id)
        .map((a) => ({ ...a, vencida: a.situacao === 'ativa' && a.ate && a.ate < M.diaSP(Date.now()) }));
      const pausas = await pausasDe(db, i.id);
      const params = M.parametrosEm(await historicoParametros(db), M.diaSP(i.enviado_em));
      const [linha] = await carregarLinhas(db, { id: i.id });
      setor = {
        autorizacao: c.aut, autorizacoes, escopos: ESCOPOS, motivos_impedimento: MOTIVOS_IMPEDIMENTO,
        pausas: pausas.map((x) => ({ id: x.id, tipo: x.tipo, motivo: MOTIVOS_IMPEDIMENTO[x.motivo] || x.motivo, detalhe: x.detalhe, inicio: x.inicio, fim: x.fim,
          resolucao: x.resolucao, por_nome: x.por_nome, encerrada_por_nome: x.encerrada_por_nome })),
        prazo_concluir: prazoConcluir(i, pausas, params, P, M.diaSP(Date.now())),
        onboarding: linha ? { ...prazoOnboarding(linha), justificativa: i.onboarding_justificativa || null, na_meta: linha.na_meta } : null,
        obs_controle: i.obs_controle || null,
        ficha: await (async () => {
          const f = await db.um('SELECT situacao, versao, aberta_em, primeiro_envio_em FROM implantacao_fichas WHERE implantacao_id = $1', [i.id]);
          return f ? { situacao: f.situacao, versao: f.versao, prazo: await fichaRotas.prazoFicha(f) } : null;
        })(),
        pos: await posCalc.daImplantacao(i),
      };
    }
    res.json({
      implantacao: { ...i, ...info, etapas: F.normalizarEtapas(i.etapas) }, documentos, eventos, pode: pd, contrato, setor,
      faltas_etapas: pd.interno && i.etapa === 'em_implantacao' ? faltasParaConcluir(i) : [],
      onboarding_pendente: !F.onboardingFeito(i.etapas),
      conferencias: pd.interno && !['rascunho', 'diretoria', 'juridico'].includes(i.etapa) ? await conferencias(i, docs) : null,
      // contrato assinado fora do portal, sem as condições registradas: a advogada preenche as condições
      condicoes_do_juridico: semCondicoes(i, ct),
      faltas: pd.enviar ? F.faltas(i.formulario, { docs, origem: i.origem, executivoId: i.executivo_id, referencia: i.referencia, assinadoFora: i.assinado_fora, semCondicoes: semCondicoes(i, ct) }) : [],
      documentos_obrigatorios: F.docsObrigatorios(i.origem),
      pendencias: F.pendencias(i.formulario, docs, i.origem),
      diferencas: F.diferencas(i.formulario, i.referencia),
    });
  });

  /* formulário em PDF (quem vê a implantação pode exportar) */
  r.get('/api/implantacoes/:id/formulario.pdf', async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i } = c;
    const info = await db.um(`SELECT e.nome AS executivo_nome, ur.nome AS responsavel_nome FROM implantacoes i LEFT JOIN executivos e ON e.id = i.executivo_id
      LEFT JOIN usuarios ur ON ur.id = i.responsavel_id WHERE i.id = $1`, [i.id]);
    const documentos = (await db.q('SELECT tipo, nome, enviado_em, substituido_em FROM implantacao_documentos WHERE implantacao_id = $1 ORDER BY id', [i.id])).rows;
    const origemTexto = i.assinado_fora ? `contrato assinado fora do portal (análise ${i.analise_protocolo || ''})` : i.origem === 'analise' ? `Análise de Crédito ${i.analise_protocolo || ''}`
      : i.origem === 'pdf' ? `análise anterior ao portal ${i.analise_protocolo || ''}` : 'condomínio de entrega';
    let pdf;
    try {
      pdf = await formularioPdf.gerarPdf(formularioPdf.montarDados(i, { executivo: info.executivo_nome, responsavel: info.responsavel_nome, documentos,
        diferencas: F.diferencas(i.formulario, i.referencia), usuario: req.usuario.nome, origemTexto }), { timbrado: true });
    } catch (e) { return erro(res, 500, e.message); }
    const nome = `Formulario_Implantacao_${String(i.condominio || 'condominio').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${i.protocolo || 'rascunho'}.pdf`;
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nome)}`);
    res.set('Cache-Control', 'private, no-store');
    res.send(pdf);
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
    // o que vem das condições fechadas no contrato não se altera na implantação: vale o do contrato
    const ct = i.contrato_id ? await db.um('SELECT * FROM contratos WHERE id = $1 AND fechado_em IS NOT NULL', [i.contrato_id]) : null;
    if (ct) {
      const doContrato = FC.paraImplantacao(ct);
      for (const k of FC.CAMPOS_FECHADOS_IMPLANTACAO) { if (doContrato[k] !== undefined) f[k] = doContrato[k]; else delete f[k]; }
    }
    // vencimento padrão (dia) e 1º vencimento (data) são independentes: o primeiro boleto pode sair em outro dia por causa da implantação;
    // sem o dia padrão, vale o dia do 1º vencimento
    if (!f.dia_vencimento && /^\d{4}-\d{2}-\d{2}$/.test(texto(f.primeiro_vencimento))) f.dia_vencimento = Number(texto(f.primeiro_vencimento).slice(8, 10));
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
    // o que veio vinculado da análise ou do contrato não é trocado aqui
    if (tipo !== 'outro' && await db.um('SELECT 1 FROM implantacao_documentos WHERE implantacao_id = $1 AND tipo = $2 AND substituido_em IS NULL AND vinculado', [i.id, tipo])) {
      return erro(res, 409, `${F.DOCUMENTOS[tipo].nome} veio vinculado da análise ou do contrato e não pode ser trocado.`);
    }
    // o comercial não troca documento já anexado depois do envio: se estiver errado, a Implantação devolve com pendência e ele volta a faltar
    if (tipo !== 'outro' && i.enviado_em && !(p.equipe || p.coordenacao || p.admin)
      && await db.um('SELECT 1 FROM implantacao_documentos WHERE implantacao_id = $1 AND tipo = $2 AND substituido_em IS NULL', [i.id, tipo])) {
      return erro(res, 409, `${F.DOCUMENTOS[tipo].nome} já foi anexado e não pode ser trocado. Se estiver errado, a Implantação devolve com pendência e você anexa o certo.`);
    }
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
    if (d.sem_arquivo || !d.conteudo) return erro(res, 404, 'Este documento foi marcado como recebido sem arquivo no portal.');
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
    const d = await db.um('SELECT id, tipo, nome, vinculado FROM implantacao_documentos WHERE id = $1 AND implantacao_id = $2', [Number(req.params.did) || 0, c.i.id]);
    if (!d) return erro(res, 404, 'Documento não encontrado.');
    if (d.vinculado) return erro(res, 409, 'Este documento veio vinculado da análise ou do contrato e não pode ser removido.');
    await db.tx(async (t) => {
      await t.q('DELETE FROM implantacao_documentos WHERE id = $1', [d.id]);
      await evento(t, c.i.id, req.usuario.id, 'documento_removido', { tipo: d.tipo, nome: d.nome });
    });
    res.json({ ok: true });
  });

  /* depois de uma pausa: a nova data para concluir, para o aviso */
  async function prazoRetomado(i) {
    if (!i.iniciado_em) return '';
    const params = M.parametrosEm(await historicoParametros(db), M.diaSP(i.enviado_em || Date.now()));
    const s = prazoConcluir({ ...i, concluido_em: null }, await pausasDe(db, i.id), params, P, M.diaSP(Date.now()));
    return s && s.vence ? ` O prazo para concluir voltou a contar: até ${s.vence.split('-').reverse().join('/')}.` : '';
  }

  /* ===================== enviar ao setor (ou, no contrato assinado fora do portal, antes ao Jurídico) ===================== */
  r.post('/api/implantacoes/:id/enviar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.enviar) return erro(res, 409, 'Esta implantação já foi enviada.');
    const ct = i.contrato_id ? await db.um('SELECT id, fechado_em FROM contratos WHERE id = $1', [i.contrato_id]) : null;
    const juridico = semCondicoes(i, ct);
    const docs = await tiposVigentes(db, i.id);
    const lista = F.faltas(i.formulario, { docs, origem: i.origem, executivoId: i.executivo_id, referencia: i.referencia, assinadoFora: i.assinado_fora, semCondicoes: juridico });
    if (lista.length) return erro(res, 400, 'Faltam informações ou documentos para enviar.', { faltas: lista });
    const out = juridico ? await enviarAoJuridico({ db, avisos, regras }, i, req.usuario)
      : await enviarAoSetor({ db, seg, avisos }, i, req.usuario, { retomada: () => prazoRetomado(i) });
    await seg.auditar(req, juridico ? 'implantacao_enviada_juridico' : 'implantacao_enviada', null, { implantacao: i.id, protocolo: out.protocolo, condominio: i.condominio });
    res.json(out);
  });

  /* ===================== contrato assinado fora do portal: o PDF do retorno da análise ===================== */
  /* ler: confere o retorno; criar: abre a implantação em rascunho, com o PDF vinculado (o contrato assinado vem em
     seguida, em Documentos); no envio, o contrato vai ao Jurídico registrar as condições */
  r.post('/api/implantacoes/pdf', corpoDoc, async (req, res) => {
    const u = req.usuario;
    const p = await perfil(u);
    if (!p.executivo && !p.admin) return erro(res, 403, 'Só executivos de negócios cadastrados pedem implantação.');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return erro(res, 400, 'Anexe o PDF do Retorno de Análise de Crédito.');
    let lido;
    try { lido = leitorPdf.lerRetorno(await leitorPdf.extrair(buf)); } catch (e) { return erro(res, 400, e.message); }
    if (!lido.reconhecido) return erro(res, 400, 'Não reconheci este PDF como um Retorno de Análise de Crédito (o modelo de 4 páginas). Confira o arquivo.');
    if (!lido.protocolo || !lido.data) return erro(res, 400, 'Não achei o protocolo e a data da análise no PDF.');
    const existente = await db.um("SELECT id, protocolo FROM implantacoes WHERE analise_protocolo = $1 AND etapa <> 'cancelada' LIMIT 1", [lido.protocolo]);
    const noPortal = await db.um("SELECT id FROM analises WHERE protocolo = $1 AND etapa = 'enviada'", [lido.protocolo]);
    const ct = await contratoDaAnalise(db, { protocolo: lido.protocolo });
    const acao = String(req.query.acao || 'ler');
    const resumo = { lido, existente: existente ? existente.protocolo || 'rascunho' : null, no_portal: !!noPortal, contrato: ct ? ct.protocolo || 'em rascunho' : null };
    if (acao === 'ler') return res.json(resumo);
    if (acao !== 'criar') return erro(res, 400, 'Ação inválida.');
    if (existente) return erro(res, 409, `A análise ${lido.protocolo} já tem implantação (${existente.protocolo || 'em rascunho'}).`);
    // análise do portal: o próximo passo é a Solicitação de Contrato (contrato no portal: escolha em "No portal")
    if (noPortal) return erro(res, 409, `A análise ${lido.protocolo} está no portal: o contrato é pedido em Solicitação de Contrato.`);
    if (ct) return erro(res, 409, `A análise ${lido.protocolo} já tem contrato no portal (${resumo.contrato}): quando ele estiver concluído, escolha-o em "No portal".`);
    if (['reprovada', 'pendente'].includes(lido.resultado) || !lido.resultado) return erro(res, 409, 'Só análise aprovada ou aprovada com ressalvas abre implantação.');
    let executivoId = p.executivo ? p.executivo.id : null;
    if (!executivoId && lido.executivo) executivoId = ((await db.um('SELECT id FROM executivos WHERE ativo AND lower(nome) = lower($1)', [lido.executivo])) || {}).id || null;
    const { formulario, referencia } = F.doPdf(lido);
    const id = await db.tx(async (t) => {
      const { id: novo } = await t.um(`INSERT INTO implantacoes (etapa, origem, assinado_fora, analise_protocolo, condominio, cnpj, uf, executivo_id, solicitante_id, formulario, referencia)
        VALUES ('rascunho', 'pdf', TRUE, $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb) RETURNING id`,
      [lido.protocolo, formulario.nome, formulario.cnpj, formulario.uf, executivoId, u.id, JSON.stringify(formulario), JSON.stringify(referencia)]);
      let nome = 'analise.pdf';
      try { nome = decodeURIComponent(String(req.headers['x-nome-arquivo'] || nome)).replace(/[\\/\r\n"]/g, '_').slice(0, 200) || nome; } catch { /* mantém */ }
      await t.q(`INSERT INTO implantacao_documentos (implantacao_id, tipo, nome, mime, tamanho, sha256, conteudo, enviado_por, vinculado) VALUES ($1, 'analise_credito', $2, 'application/pdf', $3, $4, $5, $6, TRUE)`,
        [novo, nome, buf.length, crypto.createHash('sha256').update(buf).digest('hex'), buf, u.id]);
      await evento(t, novo, u.id, 'criada', { origem: 'pdf', assinado_fora: true, analise: lido.protocolo });
      return novo;
    });
    res.status(201).json({ id, ...resumo });
  });

  /* conferências para o setor: formulário × análise, CPF/CNPJ, cadastro de moradores × unidades */
  async function conferencias(i, docs) {
    const f = i.formulario || {};
    const out = { diferencas: F.diferencas(f, i.referencia), cpf_sindico: F.cpfValido(f.sindico_cpf), cnpj: f.sem_cnpj ? null : F.cnpjOk(f.cnpj), cadastro: null };
    if (docs.has('cadastro_moradores')) {
      const d = await db.um("SELECT nome, conteudo FROM implantacao_documentos WHERE implantacao_id = $1 AND tipo = 'cadastro_moradores' AND substituido_em IS NULL ORDER BY id DESC LIMIT 1", [i.id]);
      try {
        const c = F.conferirCadastro(lerPlanilha(d.conteudo));
        out.cadastro = c.erro ? c : { ...c, unidades_formulario: Number(f.uh_total) || null };
      } catch { out.cadastro = { erro: `Não deu para ler "${d.nome}": envie o cadastro em Excel (.xlsx) ou CSV.` }; }
    }
    return out;
  }

  /* ===================== setor: designar, iniciar, etapas, pendência, concluir ===================== */
  r.post('/api/implantacoes/:id/designar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.designar) return erro(res, 403, 'Só a coordenação do setor Implantação designa.');
    const alvo = await db.um(`SELECT u.id, u.nome FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id JOIN usuarios u ON u.id = sm.usuario_id
      WHERE s.nome = $1 AND u.id = $2 AND u.ativo`, [SETOR, Number(req.body && req.body.usuario_id) || 0]);
    if (!alvo) return erro(res, 400, 'Escolha alguém do setor Implantação.');
    if (alvo.id === i.responsavel_id) return erro(res, 409, `${alvo.nome} já conduz esta implantação.`);
    const agora = new Date();
    const prazo = expediente.somarHorasUteis(agora, HORAS_PARA_INICIAR);
    await db.tx(async (t) => {
      // quem recebe recomeça o prazo para iniciar; numa pendência, a etapa fica como está
      await t.q(`UPDATE implantacoes SET responsavel_id = $2, designado_por = $3, designado_em = $4, prazo_inicio = $5, iniciado_em = NULL, aviso_prazo_em = NULL,
        etapa = CASE WHEN etapa = 'fila' THEN 'em_implantacao' ELSE etapa END, atualizado_em = now() WHERE id = $1`, [i.id, alvo.id, req.usuario.id, agora, prazo]);
      await evento(t, i.id, req.usuario.id, 'designada', { para: alvo.nome, de: i.responsavel_id || null, prazo });
    });
    const quando = prazo.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    await avisos.notificar([alvo.id], { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
      titulo: `Implantação designada para você · ${i.protocolo} · ${i.condominio}`,
      texto: `${req.usuario.nome} designou a implantação de ${i.condominio} para você. Prazo para iniciar: ${quando} (${HORAS_PARA_INICIAR}h úteis).` });
    if (i.responsavel_id && i.responsavel_id !== req.usuario.id) {
      await avisos.notificar([i.responsavel_id], { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: false,
        titulo: `${i.protocolo} passou para ${alvo.nome}`, texto: `${req.usuario.nome} designou a implantação de ${i.condominio} para ${alvo.nome}.` });
    }
    res.json({ ok: true, prazo_inicio: prazo });
  });

  r.post('/api/implantacoes/:id/iniciar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.iniciar) return erro(res, 403, 'Só quem foi designado inicia a implantação.');
    await db.tx(async (t) => {
      await t.q('UPDATE implantacoes SET iniciado_em = now(), atualizado_em = now() WHERE id = $1', [c.i.id]);
      await evento(t, c.i.id, req.usuario.id, 'iniciada', { no_prazo: new Date() <= new Date(c.i.prazo_inicio) });
    });
    res.json({ ok: true });
  });

  r.patch('/api/implantacoes/:id/etapas', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.etapas) return erro(res, 403, 'Só quem conduz a implantação (depois de iniciar) ou a coordenação marca as etapas.');
    const antes = F.normalizarEtapas(i.etapas);
    const etapas = F.normalizarEtapas(req.body && req.body.etapas);
    // marcado ou realizado: data e hora obrigatórias (fora o histórico das planilhas); boletos emitidos: o 1º vencimento
    const erroEtapas = F.validarEtapas(etapas, { importada: !!i.importacao_id });
    if (erroEtapas) return erro(res, 400, erroEtapas);
    // quem fez o onboarding: começa com quem é responsável pela implantação
    if (['marcado', 'realizado'].includes(etapas.onboarding.situacao) && !etapas.onboarding.por) etapas.onboarding.por = i.responsavel_id || req.usuario.id;
    // importada das planilhas: o condomínio em geral já está na Base de Clientes com esse ID
    if (!i.importacao_id && etapas.vouch.id && etapas.vouch.id !== antes.vouch.id && await db.um('SELECT 1 FROM condominios WHERE codigo = $1', [etapas.vouch.id])) {
      return erro(res, 409, `O ID Vouch ${etapas.vouch.id} já está na Base de Clientes.`);
    }
    await db.tx(async (t) => {
      await t.q('UPDATE implantacoes SET etapas = $2::jsonb, atualizado_em = now() WHERE id = $1', [i.id, JSON.stringify(etapas)]);
      // pós-implantação: o levantamento de pendências conta do dia em que os boletos foram emitidos
      if (etapas.boletos.feito !== antes.boletos.feito) {
        await t.q(etapas.boletos.feito ? "UPDATE implantacoes SET pos = jsonb_set(COALESCE(pos, '{}'::jsonb), '{boletos_em}', to_jsonb($2::text)) WHERE id = $1"
          : "UPDATE implantacoes SET pos = COALESCE(pos, '{}'::jsonb) - 'boletos_em' WHERE id = $1", etapas.boletos.feito ? [i.id, M.diaSP(Date.now())] : [i.id]);
      }
      const mudou = Object.keys(etapas).filter((k) => JSON.stringify(etapas[k]) !== JSON.stringify(antes[k]));
      if (mudou.length) await evento(t, i.id, req.usuario.id, 'etapas', { mudou, etapas });
    });
    const cv = i.importacao_id ? { situacao: 'nada', mensagem: '' } : await convite(i, etapas.onboarding);
    res.json({ ok: true, etapas, faltas: F.faltasConcluir(etapas), onboarding_pendente: !F.onboardingFeito(etapas), convite: cv });
  });

  r.post('/api/implantacoes/:id/pendencia', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.pendencia) return erro(res, 403, 'Só quem conduz a implantação (depois de iniciar) ou a coordenação devolve com pendência.');
    const itens = (Array.isArray(req.body && req.body.itens) ? req.body.itens : []).map((x) => texto(x, 500)).filter(Boolean);
    if (!itens.length) return erro(res, 400, 'Liste o que falta.');
    // documentos errados voltam a faltar: o comercial anexa o certo (o anterior fica no histórico)
    const refazer = [...new Set((Array.isArray(req.body && req.body.documentos) ? req.body.documentos : []).map(String))].filter((k) => F.DOCUMENTOS[k] && k !== 'outro');
    const ex = i.executivo_id ? await db.um('SELECT nome FROM executivos WHERE id = $1', [i.executivo_id]) : null;
    const mensagem = `Olá${ex ? `, ${ex.nome.split(' ')[0]}` : ''}. Para seguir com a implantação do ${i.condominio} (${i.protocolo}), precisamos de:\n\n${itens.map((x, k) => `${k + 1}. ${x}`).join('\n')}\n\nAjuste o formulário ou anexe o que falta e reenvie pelo portal.`;
    await db.tx(async (t) => {
      await t.q("UPDATE implantacoes SET etapa = 'pendencia', atualizado_em = now() WHERE id = $1", [i.id]);
      await evento(t, i.id, req.usuario.id, 'pendencia', { itens, mensagem, documentos: refazer });
      if (refazer.length) await t.q('UPDATE implantacao_documentos SET substituido_em = now() WHERE implantacao_id = $1 AND tipo = ANY($2::text[]) AND substituido_em IS NULL AND NOT vinculado', [i.id, refazer]);
      // o prazo para concluir pausa até o comercial reenviar (um impedimento aberto se encerra: a pendência passa a valer)
      await t.q("UPDATE implantacao_pausas SET fim = now(), resolucao = 'Encerrado: devolvida ao comercial', encerrada_por = $2 WHERE implantacao_id = $1 AND fim IS NULL", [i.id, req.usuario.id]);
      await t.q("INSERT INTO implantacao_pausas (implantacao_id, tipo, motivo, detalhe, por) VALUES ($1, 'pendencia', 'pendencia', $2, $3)", [i.id, itens.join('; ').slice(0, 1000), req.usuario.id]);
    });
    await avisos.notificar(await donos(db, i), { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
      titulo: `Pendência na implantação · ${i.protocolo} · ${i.condominio}`, texto: mensagem });
    res.json({ ok: true, mensagem });
  });

  /* condomínio com parceria: entra na base de comissão (Prestação de Contas) ligado ao parceiro, com comissão 0%,
     para o setor Parceiros cadastrar a condição do contrato */
  async function levarParaParceiros(i, u) {
    const f = i.formulario || {};
    if (f.parceria !== 'sim' || !(f.parceiros || []).length) return null;
    const out = { criado: null, ja_existia: null, sem_cadastro: [] };
    const modulo = await db.um("SELECT 1 FROM modulos WHERE slug = 'parceiros'");
    const base = modulo ? await registros.listar('parceiros', 'partners') : [];
    const ids = new Set(base.map((x) => String(x.id)));
    const vinculos = [];
    for (const p of f.parceiros) {
      if (p.id && ids.has(String(p.id))) vinculos.push({ partnerId: String(p.id), rate: 0 });
      else out.sem_cadastro.push(texto(p.nome, 200));
    }
    if (modulo && vinculos.length) {
      const nome = texto(f.nome || i.condominio, 200);
      const existente = (await registros.listar('parceiros', 'condos')).find((x) => normal(x.nome) === normal(nome) || x.id === `c-${normal(nome)}`);
      if (existente) out.ja_existia = existente.nome;
      else {
        const id = `c-${normal(nome)}`;
        await registros.upsert('parceiros', 'condos', id, { id, nome, valorBoleto: Number(f.boleto) || 0, vinculosJSON: JSON.stringify(vinculos), custom: true }, u.id);
        out.criado = nome;
      }
    }
    const membros = (await pessoasDoSetor(db, seg, 'Parceiros')).todos;
    const nomes = f.parceiros.map((p) => texto(p.nome, 200)).join(' e ');
    const situacao = out.criado ? 'Já está na Prestação de Contas, ligado ao parceiro com comissão 0%: cadastre a condição do contrato.'
      : out.ja_existia ? `Já existia "${out.ja_existia}" na Prestação de Contas: confira o vínculo com o parceiro e a condição do contrato.`
        : 'O parceiro não está na base de comissão: cadastre o parceiro e o condomínio na Prestação de Contas.';
    await avisos.notificar(membros.length ? membros : await administradores(db), { link: '#/m/parceiros', autor_id: u.id, tipo: 'implantacao', email: true,
      titulo: `Condomínio novo com parceiro · ${i.condominio}`,
      texto: `A implantação de ${i.condominio} (${i.protocolo}) foi concluída com parceria: ${nomes}. ${situacao}` });
    return out;
  }

  /* o que falta para concluir; na importada das planilhas a data do onboarding não é exigida (o Controle não a registrava) */
  function faltasParaConcluir(i) {
    return F.faltasConcluir(i.etapas).filter((x) => !(i.importacao_id && /^Informar a data em que o onboarding/.test(x)));
  }
  /* importada: o condomínio já está na Base de Clientes? (ligado na importação, pelo ID Vouch, pelo CNPJ ou pelo nome) */
  async function jaNaCarteira(i) {
    if (i.condominio_id) {
      const c = await db.um('SELECT id, codigo FROM condominios WHERE id = $1', [i.condominio_id]);
      if (c) return c;
    }
    const f = i.formulario || {};
    const vouch = F.normalizarEtapas(i.etapas).vouch.id;
    if (vouch && !/^planilha-/.test(vouch)) {
      const c = await db.um('SELECT id, codigo FROM condominios WHERE codigo = $1', [vouch]);
      if (c) return c;
    }
    const cnpj = String(f.sem_cnpj ? '' : f.cnpj || i.cnpj || '').replace(/\D/g, '');
    if (cnpj.length === 14) {
      const c = await db.um("SELECT id, codigo FROM condominios WHERE regexp_replace(cnpj, '\\D', '', 'g') = $1 ORDER BY id LIMIT 1", [cnpj]);
      if (c) return c;
    }
    const norm = (s) => semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim();
    const nome = norm(f.nome || i.condominio);
    if (!nome) return null;
    return (await db.q('SELECT id, codigo, nome, razao_social FROM condominios ORDER BY id')).rows.find((c) => norm(c.nome) === nome || norm(c.razao_social) === nome) || null;
  }

  r.post('/api/implantacoes/:id/concluir', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.concluir) return erro(res, 403, 'Só quem conduz a implantação (depois de iniciar) ou a coordenação conclui.');
    const lista = faltasParaConcluir(i);
    if (lista.length) return erro(res, 400, 'Faltam etapas para concluir.', { faltas: lista });
    const semOnboarding = !F.onboardingFeito(i.etapas);
    if (i.importacao_id) {
      // histórico das planilhas: conclui sem avisos e sem ficha. Já na Base de Clientes: só liga ao cadastro (nada é criado,
      // então não duplica). Fora da Base de Clientes (ex.: contratos que ainda vão começar): fica concluída, e a coordenação
      // confirma a entrada na Base de Clientes, com a conferência de ID e CNPJ repetidos.
      const cart = await jaNaCarteira(i);
      await db.tx(async (t) => {
        if (cart) await t.q("UPDATE implantacoes SET etapa = 'na_carteira', condominio_id = $2, concluido_em = now(), atualizado_em = now() WHERE id = $1", [i.id, cart.id]);
        else await t.q("UPDATE implantacoes SET etapa = 'concluida', concluido_em = now(), atualizado_em = now() WHERE id = $1", [i.id]);
        await evento(t, i.id, req.usuario.id, 'concluida', { importada: true, carteira: cart ? { condominio_id: cart.id, codigo: cart.codigo } : null });
      });
      return res.json({ ok: true, parceiros: null, carteira: cart ? 'ja_estava' : 'confirmar' });
    }
    await db.tx(async (t) => {
      await t.q("UPDATE implantacoes SET etapa = 'concluida', concluido_em = now(), atualizado_em = now() WHERE id = $1", [i.id]);
      await evento(t, i.id, req.usuario.id, 'concluida', semOnboarding ? { onboarding_pendente: true } : {});
      await t.q("UPDATE implantacao_pausas SET fim = now(), resolucao = 'Encerrado na conclusão', encerrada_por = $2 WHERE implantacao_id = $1 AND fim IS NULL", [i.id, req.usuario.id]);
    });
    if (aoConcluir) await aoConcluir(i, req.usuario);
    const parceiros = await levarParaParceiros(i, req.usuario);
    if (parceiros) await db.q('INSERT INTO implantacao_eventos (implantacao_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)', [i.id, req.usuario.id, 'parceiros', JSON.stringify(parceiros)]);
    const coord = (await pessoasDoSetor(db, seg, SETOR)).gestores;
    await avisos.notificar(coord.length ? coord : await administradores(db), { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: true,
      titulo: `Pronta para a Base de Clientes · ${i.protocolo} · ${i.condominio}`, texto: `${req.usuario.nome} concluiu a implantação de ${i.condominio}. Confira os dados e confirme a entrada na Base de Clientes.` });
    await avisos.notificar(await donos(db, i), { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: false,
      titulo: `Implantação concluída · ${i.protocolo} · ${i.condominio}`, texto: `O setor Implantação concluiu a implantação de ${i.condominio}.` });
    res.json({ ok: true, parceiros });
  });

  /* ===================== Carteira: a coordenação confere e confirma ===================== */
  async function previaCarteira(i) {
    const f = i.formulario || {};
    const e = F.normalizarEtapas(i.etapas);
    const ex = i.executivo_id ? await db.um('SELECT nome FROM executivos WHERE id = $1', [i.executivo_id]) : null;
    return {
      codigo: /^planilha-/.test(e.vouch.id) ? '' : e.vouch.id, nome: apelido(f.nome || i.condominio), situacao: 'ATIVO', comarca: texto(f.uf, 2).toUpperCase(), vencimento: f.dia_vencimento ? String(f.dia_vencimento) : '',
      administradora: texto(f.administradora, 120).toUpperCase(), forma_envio: F.ENVIO_CARTEIRA[e.envio.forma] || '', executivo: ex ? ex.nome.toUpperCase() : '',
      inicio_contrato: texto(f.inicio_contrato, 10), razao_social: texto(f.nome || i.condominio, 200), cnpj: f.sem_cnpj ? '' : texto(f.cnpj, 20),
      sindico_nome: texto(f.sindico_nome, 160), sindico_telefone: texto(f.sindico_telefone, 40), sindico_email: texto(f.sindico_email, 160),
      observacoes: [i.protocolo ? `Implantação ${i.protocolo}` : `Implantação Nº ${i.numero_planilha || ''} (histórico das planilhas)`, i.analise_protocolo ? `análise ${i.analise_protocolo}` : '', f.administracao_interna ? 'administração interna' : ''].filter(Boolean).join(' · '),
    };
  }
  async function duplicados(d) {
    const cnpj = String(d.cnpj || '').replace(/\D/g, '');
    return (await db.q(`SELECT id, codigo, nome, cnpj FROM condominios WHERE codigo = $1 OR ($2 <> '' AND regexp_replace(cnpj, '\\D', '', 'g') = $2)`, [String(d.codigo || ''), cnpj])).rows;
  }

  r.get('/api/implantacoes/:id/carteira', async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.carteira) return erro(res, 403, 'Só a coordenação do setor Implantação confirma a entrada na Base de Clientes.');
    const dados = await previaCarteira(c.i);
    res.json({ dados, duplicados: await duplicados(dados) });
  });

  r.post('/api/implantacoes/:id/carteira', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, pd } = c;
    if (!pd.carteira) return erro(res, 403, 'Só a coordenação do setor Implantação confirma a entrada na Base de Clientes.');
    const b = req.body && req.body.dados && typeof req.body.dados === 'object' ? req.body.dados : {};
    const campos = ['codigo', 'nome', 'situacao', 'comarca', 'vencimento', 'administradora', 'forma_envio', 'executivo', 'inicio_contrato', 'razao_social', 'cnpj',
      'sindico_nome', 'sindico_telefone', 'sindico_email', 'observacoes'];
    const v = normalizarCarteira(Object.fromEntries(campos.map((k) => [k, b[k] == null ? '' : b[k]])));
    if (v.erro) return erro(res, 400, v.erro);
    const d = v.dados;
    if (!d.inicio_contrato) return erro(res, 400, 'Informe o início do contrato (vigência).');
    if (d.cnpj && d.cnpj.replace(/\D/g, '').length !== 14) return erro(res, 400, `CNPJ incompleto (${d.cnpj}): são 14 dígitos.`);
    // o síndico vai para a Base de Clientes (no histórico das planilhas, quando houver)
    if (!i.importacao_id && !d.sindico_nome) return erro(res, 400, 'Informe o nome do síndico.');
    if ((!i.importacao_id || d.sindico_telefone) && d.sindico_telefone.replace(/\D/g, '').length < 10) return erro(res, 400, 'Informe o telefone do síndico com DDD.');
    if ((!i.importacao_id || d.sindico_email) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.sindico_email)) return erro(res, 400, 'Informe um e-mail válido do síndico.');
    const dup = await duplicados(d);
    if (dup.some((x) => x.codigo === d.codigo)) return erro(res, 409, `O ID Vouch ${d.codigo} já está na Base de Clientes.`);
    if (dup.length) return erro(res, 409, `Já existe na Base de Clientes um condomínio com este CNPJ: ${dup[0].nome} (ID ${dup[0].codigo}).`);
    const cols = Object.keys(d);
    const id = await db.tx(async (t) => {
      const { id: novo } = await t.um(`INSERT INTO condominios (${cols.join(', ')}, atualizado_por) VALUES (${cols.map((_, k) => '$' + (k + 1)).join(', ')}, $${cols.length + 1}) RETURNING id`,
        [...cols.map((k) => d[k]), req.usuario.id]);
      await t.q("UPDATE implantacoes SET etapa = 'na_carteira', condominio_id = $2, atualizado_em = now() WHERE id = $1", [i.id, novo]);
      // a assistente de crédito que recebeu a ficha de transição fica na Base de Clientes
      await t.q(`UPDATE condominios c SET assistente_credito = u.nome FROM implantacao_fichas f JOIN usuarios u ON u.id = f.destino_id
        WHERE c.id = $2 AND f.implantacao_id = $1 AND c.assistente_credito = ''`, [i.id, novo]);
      await evento(t, i.id, req.usuario.id, 'carteira', { condominio_id: novo, codigo: d.codigo, nome: d.nome });
      return novo;
    });
    await seg.auditar(req, 'condominio_criado', null, { id, nome: d.nome, codigo: d.codigo, origem: i.protocolo ? `implantação ${i.protocolo}` : `implantação Nº ${i.numero_planilha} (planilha)` });
    // o Controle de Emissão de Boletos acompanha a carteira
    if (boletosCarteira) boletosCarteira.agendar(req.usuario);
    if (!i.importacao_id) await avisos.notificar([...(await donos(db, i)), i.responsavel_id], { link: link(i.id), autor_id: req.usuario.id, tipo: 'implantacao', email: false,
      titulo: `Na Base de Clientes · ${d.nome}`, texto: `${i.condominio} entrou na Base de Clientes (ID ${d.codigo}).` });
    res.status(201).json({ ok: true, condominio_id: id });
  });

  r.post('/api/implantacoes/:id/cancelar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.cancelar) return erro(res, 403, 'Esta implantação não pode ser cancelada.');
    const motivo = texto(req.body && req.body.motivo, 1000);
    const ct = c.i.etapa === 'juridico' && c.i.contrato_id ? await db.um("SELECT id, protocolo, condominio FROM contratos WHERE id = $1 AND etapa = 'conferencia'", [c.i.contrato_id]) : null;
    await db.tx(async (t) => {
      await t.q("UPDATE implantacoes SET etapa = 'cancelada', atualizado_em = now() WHERE id = $1", [c.i.id]);
      await evento(t, c.i.id, req.usuario.id, 'cancelada', { motivo });
      if (ct) {
        await t.q("UPDATE contratos SET etapa = 'cancelada', atualizado_em = now() WHERE id = $1", [ct.id]);
        await t.q('INSERT INTO contrato_eventos (contrato_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)', [ct.id, req.usuario.id, 'cancelada', JSON.stringify({ motivo, pela_implantacao: c.i.protocolo })]);
      }
    });
    if (ct) {
      const elaboram = await regras.pessoasCom('contratos.elaborar');
      await avisos.notificar(elaboram.length ? elaboram : await administradores(db), { link: `#/contratos/${ct.id}`, autor_id: req.usuario.id, tipo: 'contrato', email: false,
        titulo: `Implantação cancelada · ${ct.protocolo} · ${ct.condominio}`, texto: `${req.usuario.nome} cancelou a implantação de ${ct.condominio}: o contrato não precisa mais das condições registradas.${motivo ? ` Motivo: ${motivo}` : ''}` });
    }
    res.json({ ok: true });
  });

  return r;
}

module.exports = { rotasImplantacoes, criarRotinasImplantacao, abrirDoContrato, seguirDoJuridico, voltarDoJuridico, proximoProtocolo, ETAPAS, ORIGEM, SETOR };

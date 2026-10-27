'use strict';
/*
 * Pós-implantação (regras em server/implantacoes/pos.js): marcar e desfazer as etapas, o quadro da implantação, a aba do
 * Acompanhamento e a rotina de lembretes (véspera e dia do prazo a quem conduz; atrasada, uma vez por dia útil, também
 * à coordenação). Quem marca: quem conduz, quem tem autorização (tudo ou etapas) e a coordenação.
 */
const M = require('../implantacoes/metas');
const PO = require('../implantacoes/pos');
const { criarPrazos } = require('../implantacoes/prazos');

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const ESPOLIO = 'analise-de-espolio';
const CAMPOS = 'i.id, i.protocolo, i.condominio, i.uf, i.cnpj, i.formulario, i.etapa, i.etapas, i.pos, i.enviado_em, i.iniciado_em, i.concluido_em, i.importacao_id, i.responsavel_id';

/* as solicitações da ferramenta Análise de Espólio (as excluídas ficam com dados vazios) */
async function solicitacoesEspolio(db) {
  return (await db.q("SELECT dados FROM documentos WHERE modulo_slug = $1 AND colecao = 'solicitacoes' AND dados IS NOT NULL", [ESPOLIO])).rows.map((x) => x.dados);
}

function criarPos({ db, expediente, historicoParametros }) {
  const ehUtil = (d) => expediente.ehDiaUtil(d);
  const P = criarPrazos(ehUtil);
  const calcular = (i, historico, sols, hoje) => i.iniciado_em ? PO.calcular(i, { params: M.parametrosEm(historico, M.diaSP(i.iniciado_em)), P, ehUtil, hoje, solicitacoes: sols }) : null;
  async function daImplantacao(i, hoje = M.diaSP(Date.now())) {
    if (i.importacao_id || !i.iniciado_em) return null;
    return calcular(i, await historicoParametros(db), await solicitacoesEspolio(db), hoje);
  }
  /* todas as implantações com pós-implantação, para a aba do Acompanhamento e a rotina */
  async function todas(hoje = M.diaSP(Date.now())) {
    const { rows } = await db.q(`SELECT ${CAMPOS}, u.nome AS responsavel_nome FROM implantacoes i LEFT JOIN usuarios u ON u.id = i.responsavel_id
      WHERE i.importacao_id IS NULL AND i.iniciado_em IS NOT NULL AND i.etapa NOT IN ('rascunho','cancelada') ORDER BY i.iniciado_em DESC`);
    if (!rows.length) return [];
    const historico = await historicoParametros(db);
    const sols = await solicitacoesEspolio(db);
    const out = [];
    for (const i of rows) {
      const pos = calcular(i, historico, sols, hoje);
      if (pos) out.push({ i, pos });
    }
    return out;
  }
  async function resumo() {
    return (await todas()).map(({ i, pos }) => ({ id: i.id, protocolo: i.protocolo, condominio: i.condominio, uf: i.uf, etapa: i.etapa,
      responsavel_id: i.responsavel_id, responsavel_nome: i.responsavel_nome, assumida: M.diaSP(i.iniciado_em), ...pos }));
  }
  return { P, daImplantacao, todas, resumo };
}

function rotasPos(r, { db, erro, evento, json, carregar, posCalc }) {
  /* marcar ou desfazer uma etapa: { acao: 'marcar' | 'desfazer', situacao (pendências), protocolo (espólios, sem solicitação achada) } */
  r.post('/api/implantacoes/:id/pos/:etapa', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, p, aut } = c;
    const etapa = req.params.etapa;
    if (!PO.ETAPAS_POS.includes(etapa)) return erro(res, 404, 'Etapa desconhecida.');
    const pode = p.coordenacao || p.admin || i.responsavel_id === req.usuario.id || !!(aut && ['tudo', 'etapas'].includes(aut.escopo));
    if (!pode) return erro(res, 403, 'Só quem conduz a implantação (ou tem autorização) e a coordenação marcam o pós-implantação.');
    const hoje = M.diaSP(Date.now());
    const pos = await posCalc.daImplantacao(i, hoje);
    if (!pos) return erro(res, 409, 'O pós-implantação vale para as implantações do portal assumidas a partir da data de início nos parâmetros.');
    const b = req.body || {};
    const desfazer = b.acao === 'desfazer';
    const atual = pos.etapas.find((x) => x.etapa === etapa);
    let valor = null;
    let detalhe = { etapa, acao: desfazer ? 'desfazer' : 'marcar' };
    if (!desfazer) {
      const marca = { em: new Date().toISOString(), por: req.usuario.id, por_nome: req.usuario.nome };
      if (etapa === 'espolio') {
        if (atual.solicitacoes) return erro(res, 409, 'A solicitação já está na Análise de Espólio; o portal acompanha sozinho.');
        const protocolo = texto(b.protocolo, 40);
        if (!protocolo) return erro(res, 400, 'Informe o protocolo da solicitação na Análise de Espólio.');
        valor = { manual: { ...marca, protocolo } };
        detalhe.protocolo = protocolo;
      } else if (etapa === 'pendencias') {
        if (!atual.inicio) return erro(res, 409, 'O levantamento de pendências vem depois da emissão dos boletos.');
        if (!PO.SITUACAO_PENDENCIAS[b.situacao]) return erro(res, 400, 'Escolha: enviado no WhatsApp e salvo no CPD, ou cadastro completo.');
        valor = { ...marca, situacao: b.situacao };
        detalhe.situacao = b.situacao;
      } else {
        if (!atual.inicio) return erro(res, 409, 'Informe o 1º vencimento (etapa Emissão de boletos) antes da prestação de contas.');
        if (hoje < atual.inicio) return erro(res, 409, `A 1ª prestação de contas é depois do repasse (${atual.inicio.split('-').reverse().join('/')}).`);
        valor = marca;
      }
    } else if (etapa === 'espolio' && !(atual.manual)) return erro(res, 409, 'Não há protocolo informado à mão para desfazer (a solicitação fica na Análise de Espólio).');
    await db.tx(async (t) => {
      await t.q(valor ? "UPDATE implantacoes SET pos = jsonb_set(COALESCE(pos, '{}'::jsonb), $2::text[], $3::jsonb), atualizado_em = now() WHERE id = $1"
        : "UPDATE implantacoes SET pos = COALESCE(pos, '{}'::jsonb) #- $2::text[], atualizado_em = now() WHERE id = $1", valor ? [i.id, [etapa], JSON.stringify(valor)] : [i.id, [etapa]]);
      await evento(t, i.id, req.usuario.id, 'pos_implantacao', detalhe);
    });
    res.json({ ok: true, pos: await posCalc.daImplantacao({ ...i, pos: (await db.um('SELECT pos FROM implantacoes WHERE id = $1', [i.id])).pos }, hoje) });
  });
}

/* rotina: uma vez por dia útil, no expediente, por etapa */
function criarRotinaPos({ db, avisos, expediente, coordenacao, link, autorizados, posCalc }) {
  return async function rotinaPos(agora = new Date()) {
    const m = expediente.momento(agora);
    const feito = { pos: 0 };
    if (!m.noExpediente) return feito;
    const hoje = m.dia;
    const fmt = (d) => d.split('-').reverse().join('/');
    let coord = null;
    for (const { i, pos } of await posCalc.todas(hoje)) {
      const avisados = (i.pos && i.pos.avisos) || {};
      const marcar = {};
      for (const x of pos.etapas) {
        if (!pos.alerta.includes(x.etapa) || (avisados[x.etapa] && avisados[x.etapa] >= hoje) || !i.responsavel_id) continue;
        const s = x.prazo;
        const para = [i.responsavel_id, ...await autorizados(db, i.id, ['tudo', 'etapas'])];
        if (s.status === 'atrasado') {
          const n = s.atraso === 1 ? '1 dia útil' : `${s.atraso} dias úteis`;
          await avisos.notificar(para, { link: link(i.id), tipo: 'implantacao', email: true, titulo: `Pós-implantação atrasada · ${x.nome} · ${n} · ${i.condominio}`,
            texto: `A etapa ${x.nome} de ${i.condominio} (${i.protocolo}) passou do prazo (${fmt(s.vence)}).` });
          coord = coord || await coordenacao();
          await avisos.notificar(coord, { link: link(i.id), tipo: 'implantacao', email: true, titulo: `Pós-implantação atrasada de ${i.responsavel_nome || 'quem conduz'} · ${x.nome} · ${n}`,
            texto: `${i.condominio} (${i.protocolo}): o prazo da etapa ${x.nome} era ${fmt(s.vence)}. Para cobrar, abra a implantação.` });
        } else {
          await avisos.notificar(para, { link: link(i.id), tipo: 'implantacao', email: true,
            titulo: `Pós-implantação · ${x.nome} vence ${s.status === 'vence_hoje' ? 'hoje' : 'amanhã'} · ${i.condominio}`,
            texto: `A etapa ${x.nome} de ${i.condominio} (${i.protocolo}) vence ${s.status === 'vence_hoje' ? 'hoje' : 'no próximo dia útil'} (${fmt(s.vence)}).` });
        }
        marcar[x.etapa] = hoje;
        feito.pos++;
      }
      if (Object.keys(marcar).length) {
        await db.q("UPDATE implantacoes SET pos = jsonb_set(COALESCE(pos, '{}'::jsonb), '{avisos}', COALESCE(pos->'avisos', '{}'::jsonb) || $2::jsonb) WHERE id = $1", [i.id, JSON.stringify(marcar)]);
      }
    }
    return feito;
  };
}

module.exports = { criarPos, rotasPos, criarRotinaPos, solicitacoesEspolio };

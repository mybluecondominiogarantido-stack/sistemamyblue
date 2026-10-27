'use strict';
/*
 * Pós-implantação: as etapas que a Assistente de Implantação faz depois de assumir e de emitir os boletos, com prazo em
 * dias úteis (o mesmo cálculo de server/implantacoes/prazos.js; os dias estão nos parâmetros, em metas.js):
 *  - espólios: espolio_dias (2) depois de assumir. Verifica no Assertiva e abre a solicitação na ferramenta Análise de
 *    Espólio com o documento; a coordenação de cobrança analisa e devolve. O portal acha a solicitação sozinho (mesmo CNPJ
 *    ou nome, aberta depois do envio ao setor); sem ela, a assistente informa o protocolo à mão;
 *  - levantamento de pendências: pendencias_dias (1) depois de emitir os boletos. O PDF sai da Central de Ferramentas
 *    (Planilha de moradores), vai pelo WhatsApp e fica no CPD, na pasta do condomínio: no portal só se marca o envio
 *    (ou "cadastro completo, nada a enviar");
 *  - 1ª prestação de contas: prestacao_dias (5) depois do repasse, que é o 1º dia útil depois do 1º vencimento. Feita no
 *    Montador (Central de Ferramentas) e salva no CPD: no portal só se marca "enviada ao condomínio".
 * Só para as implantações do portal assumidas a partir de pos_marco (o histórico importado fica de fora).
 * Funções puras: a rota (server/rotas/implantacoes-pos.js) lê o banco e chama estas.
 */
const F = require('./formulario');
const { somarDia } = require('./prazos');

const ETAPAS_POS = ['espolio', 'pendencias', 'prestacao'];
const NOME_POS = { espolio: 'Espólios', pendencias: 'Levantamento de pendências', prestacao: '1ª prestação de contas' };
const SITUACAO_PENDENCIAS = { enviado: 'Enviado no WhatsApp e salvo no CPD', completo: 'Cadastro completo, nada a enviar' };
const ALERTA = ['vence_amanha', 'vence_hoje', 'atrasado'];

const diaSP = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const digitos = (s) => String(s || '').replace(/\D/g, '');
const nomeChave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function seAplica(i, params) {
  return !i.importacao_id && !!i.iniciado_em && !['rascunho', 'cancelada'].includes(i.etapa) && diaSP(i.iniciado_em) >= params.pos_marco;
}

/* o repasse: o 1º dia útil depois do 1º vencimento */
function diaRepasse(vencimento, ehUtil) {
  if (!vencimento) return null;
  let d = vencimento;
  for (let k = 0; k < 60; k++) { d = somarDia(d); if (ehUtil(d)) return d; }
  return null;
}

/* as solicitações da Análise de Espólio deste condomínio, da mais antiga para a mais nova */
function solicitacoesDa(i, todas) {
  const cnpj = digitos(i.cnpj || (i.formulario || {}).cnpj);
  const nome = nomeChave(i.condominio);
  const desde = i.enviado_em ? diaSP(i.enviado_em) : '';
  return (todas || []).filter((s) => {
    const c = s.condominio || {};
    if (!s.criadaEm || diaSP(s.criadaEm) < desde) return false;
    return cnpj.length === 14 ? digitos(c.cnpj) === cnpj || (!digitos(c.cnpj) && nomeChave(c.nome) === nome) : !!nome && nomeChave(c.nome) === nome;
  }).sort((a, b) => String(a.criadaEm).localeCompare(String(b.criadaEm)));
}

/* devolutiva da coordenação de cobrança: aguardando · concluida · devolvida (reabrir a solicitação na ferramenta) */
function devolutiva(s) {
  if (!s) return null;
  const situacao = s.status === 'concluida' ? 'concluida' : s.status === 'devolvida' ? 'devolvida' : 'aguardando';
  const res = Array.isArray(s.resultado) ? s.resultado : [];
  return { situacao, protocolo: s.protocolo || '', aberta_em: s.criadaEm, concluida_em: s.concluidaEm || null, por: s.solicitanteNome || '',
    unidades: Array.isArray(s.unidades) ? s.unidades.length : 0, motivo: situacao === 'devolvida' ? s.motivoDevolucao || '' : '',
    resultado: situacao === 'concluida' ? res.map((x) => ({ unid: x.unid, titular: x.titular, resultado: x.resultado })) : [] };
}

/*
 * As três etapas de uma implantação (null quando não se aplica). Cada etapa:
 *  { etapa, nome, dias, inicio, prazo (situação de prazos.js, ou { status: 'aguardando', motivo }), feito, acao, registro }
 */
function calcular(i, { params, P, ehUtil, hoje, solicitacoes = [] }) {
  if (!seAplica(i, params)) return null;
  const pos = i.pos || {};
  const e = F.normalizarEtapas(i.etapas);
  const sit = (inicio, n, fim) => P.situacao({ inicio, n, pausas: [], fim, hoje });

  // espólios: da assunção até abrir a solicitação na Análise de Espólio
  const sols = solicitacoesDa(i, solicitacoes);
  const manual = pos.espolio && pos.espolio.manual;
  const assumida = diaSP(i.iniciado_em);
  const espFim = sols.length ? diaSP(sols[0].criadaEm) : manual ? diaSP(manual.em) : null;
  const dev = devolutiva(sols[sols.length - 1]);
  const espolio = { etapa: 'espolio', nome: NOME_POS.espolio, dias: params.espolio_dias, inicio: assumida, prazo: sit(assumida, params.espolio_dias, espFim),
    feito: !!espFim, acao: !espFim || (dev && dev.situacao === 'devolvida'), devolutiva: dev, manual: !sols.length && manual ? manual : null, solicitacoes: sols.length };

  // levantamento de pendências: da emissão dos boletos até o envio do PDF
  // (concluir exige os boletos emitidos: sem a data registrada, vale a da conclusão)
  const boletos = pos.boletos_em || (i.concluido_em ? diaSP(i.concluido_em) : null);
  const reg = pos.pendencias || null;
  const penFim = reg ? diaSP(reg.em) : null;
  const pendencias = { etapa: 'pendencias', nome: NOME_POS.pendencias, dias: params.pendencias_dias, inicio: boletos,
    prazo: boletos ? sit(boletos, params.pendencias_dias, penFim) : { status: 'aguardando', motivo: 'boletos' },
    feito: !!penFim, acao: !!boletos && !penFim, registro: reg && { ...reg, texto: SITUACAO_PENDENCIAS[reg.situacao] || '' } };

  // 1ª prestação de contas: do repasse (1º dia útil depois do 1º vencimento) até o envio ao condomínio
  const venc = e.boletos.primeiro_vencimento || null;
  const repasse = diaRepasse(venc, ehUtil);
  const pres = pos.prestacao || null;
  const preFim = pres ? diaSP(pres.em) : null;
  let prazo;
  if (!repasse) prazo = { status: 'aguardando', motivo: 'vencimento' };
  else if (!preFim && hoje < repasse) prazo = { status: 'aguardando', motivo: 'repasse', vence: P.vencimento(repasse, params.prestacao_dias, []) };
  else prazo = sit(repasse, params.prestacao_dias, preFim);
  const prestacao = { etapa: 'prestacao', nome: NOME_POS.prestacao, dias: params.prestacao_dias, inicio: repasse, vencimento: venc, prazo,
    feito: !!preFim, acao: !!repasse && !preFim && hoje >= repasse, registro: pres };

  const etapas = [espolio, pendencias, prestacao];
  return {
    etapas, concluido: etapas.every((x) => x.feito) && !espolio.acao,
    atrasadas: etapas.filter((x) => !x.feito && x.prazo && x.prazo.status === 'atrasado').length,
    alerta: etapas.filter((x) => !x.feito && x.prazo && ALERTA.includes(x.prazo.status)).map((x) => x.etapa),
  };
}

module.exports = { ETAPAS_POS, NOME_POS, SITUACAO_PENDENCIAS, ALERTA, seAplica, diaRepasse, solicitacoesDa, devolutiva, calcular };

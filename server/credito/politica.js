'use strict';
/*
 * Política de Análise de Crédito: parâmetros do motor de regras.
 * O padrão abaixo é a Política v1.2.1 com o Adendo v1.2.2 e as decisões do setor (§8 confirmado em out/2026).
 * No portal a política fica versionada no banco (parametros_politica + faixas_precificacao): este arquivo
 * só semeia a primeira versão e serve aos testes. A administração cria versões novas sem mexer em código.
 */

const POLITICA_PADRAO = Object.freeze({
  versao: '1.2.2',
  descricao: 'Política v1.2.1 + Adendo v1.2.2 + decisões do setor (boleto fixo, reprovação > 40%)',

  // tabela de precificação — teto inclusivo: vale a primeira linha cujo teto ≥ inadimplência apurada (%)
  faixas: [
    { ate: 2.5, taxa_adm: 2.00 }, { ate: 5.0, taxa_adm: 2.00 }, { ate: 7.5, taxa_adm: 2.25 }, { ate: 10.0, taxa_adm: 2.50 },
    { ate: 12.5, taxa_adm: 2.75 }, { ate: 15.0, taxa_adm: 3.00 }, { ate: 17.5, taxa_adm: 3.25 }, { ate: 20.0, taxa_adm: 3.50 },
    { ate: 22.5, taxa_adm: 3.75 }, { ate: 25.0, taxa_adm: 4.00 }, { ate: 27.5, taxa_adm: 4.25 }, { ate: 30.0, taxa_adm: 4.50 },
    { ate: 32.5, taxa_adm: 4.75 }, { ate: 35.0, taxa_adm: 5.00 }, { ate: 40.0, taxa_adm: 6.00 },
  ],

  // boleto fixo em todas as faixas (§8.3); UF com boleto próprio. Executivo com boleto próprio fica no cadastro dele.
  boleto_padrao: 2.00,
  boleto_por_uf: { MA: 5.50 },

  // status
  receita_minima: 5000,           // receita líquida abaixo disso → REPROVADA
  inad_diretoria: 35,             // acima disso → RESSALVAS + chancela da diretoria
  inad_reprovacao: 40,            // acima disso → REPROVADA (§8.1)
  exposicao_maxima: 40000,        // exposição acima disso…
  exposicao_inad_minima: 20,      // …com inadimplência acima disso → REPROVADA

  // meses-base e regra dos dias (§8.2: "mais de 10 dias")
  meses_base: 3,
  meses_coleta: 4,
  dias_apos_vencimento: 10,
  dias_inclusivo: false,          // false = mais de N dias; true = N dias ou mais
  relatorio_validade_meses: 3,    // relatório emitido há mais tempo que isso não é aceito

  // composição
  extra_limite_pct: 40,           // taxa extra entra até este % da ordinária
  extra_acima_limite: 'limitar',  // 'limitar' (entra até o limite) | 'excluir' (sai inteira)
  desconto_base: 'ordinaria',     // desconto de pontualidade em % incide sobre a ordinária

  // Assertiva (§8.4)
  assertiva_min_taxas: 24,
  assertiva_criterio: 'em_aberto', // 'em_aberto' (24+ taxas em aberto) | 'consecutivas'

  // alertas
  concentracao_unidade_pct: 30,
  concentracao_top3_pct: 60,
  multa_maxima_pct: 2,
  desconto_impreterivel_acima: 25,

  // registro da convenção: UFs onde "cartório" genérico é aceito
  registro_generico_ufs: ['RN'],

  // fonte do nº de UH (§8.5): 'convencao' | 'formulario'
  uh_fonte: 'convencao',

  // comparativo Sem × Com MyBlue, validade e SLA
  custo_boleto_mercado: 2.50,
  validade_dias: 30,
  sla_horas: 24,
  sla_horas_diretoria: 48,

  // protocolo (§8.6): AC-AAAA-MM-DD-NN, sequencial por dia, gerado pelo banco
  protocolo_prefixo: 'AC',
  // assinatura do retorno (§8.7): 'analista' (nome de quem liberou) | texto fixo
  assinatura: 'analista',
});

/* Confere uma política antes de usar ou gravar: devolve a lista de problemas (vazia = ok). */
function validarPolitica(p) {
  const erros = [];
  const num = (k) => { if (!(typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] >= 0)) erros.push(`${k}: número inválido`); };
  if (!p || typeof p !== 'object') return ['política ausente'];
  if (!p.versao) erros.push('versao: obrigatória');
  ['boleto_padrao', 'receita_minima', 'inad_diretoria', 'inad_reprovacao', 'exposicao_maxima', 'exposicao_inad_minima',
    'meses_base', 'meses_coleta', 'dias_apos_vencimento', 'relatorio_validade_meses', 'extra_limite_pct', 'assertiva_min_taxas',
    'concentracao_unidade_pct', 'concentracao_top3_pct', 'multa_maxima_pct', 'desconto_impreterivel_acima', 'custo_boleto_mercado',
    'validade_dias', 'sla_horas', 'sla_horas_diretoria'].forEach(num);
  if (!Array.isArray(p.faixas) || !p.faixas.length) erros.push('faixas: ao menos uma');
  else {
    p.faixas.forEach((f, i) => {
      if (!(f.ate > 0) || !(f.taxa_adm > 0)) erros.push(`faixa ${i + 1}: teto e taxa precisam ser positivos`);
      if (i && !(f.ate > p.faixas[i - 1].ate)) erros.push(`faixa ${i + 1}: tetos precisam crescer`);
    });
    const ultimo = p.faixas[p.faixas.length - 1].ate;
    if (ultimo < p.inad_reprovacao) erros.push(`faixas: a última vai até ${ultimo}%, mas só reprova acima de ${p.inad_reprovacao}%`);
  }
  if (p.meses_coleta < p.meses_base) erros.push('meses_coleta: não pode ser menor que meses_base');
  if (!['limitar', 'excluir'].includes(p.extra_acima_limite)) erros.push('extra_acima_limite: limitar ou excluir');
  if (!['em_aberto', 'consecutivas'].includes(p.assertiva_criterio)) erros.push('assertiva_criterio: em_aberto ou consecutivas');
  if (!['convencao', 'formulario'].includes(p.uh_fonte)) erros.push('uh_fonte: convencao ou formulario');
  return erros;
}

module.exports = { POLITICA_PADRAO, validarPolitica };

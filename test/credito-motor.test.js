'use strict';
/* Motor de regras da Análise de Crédito: critérios de aceite do §9 (dados fictícios). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analisar, faixaPara, boletoPara, janelaBase, unidadesIsentas, normalizarCompetencia } = require('../server/credito/motor');
const { POLITICA_PADRAO, validarPolitica } = require('../server/credito/politica');

const perto = (a, b, tol = 0.005) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const codigos = (lista) => lista.map((x) => x.codigo);
const lanc = (competencia, tipo, valor, dia = 10) => ({ competencia, vencimento: `${competencia}-${String(dia).padStart(2, '0')}`, tipo, valor });

/* Caso A (jul/2026): 24 UH, síndico condômino isento, ordinária R$ 1.840 + extra R$ 700/UH, relatório de 16/07 */
function casoA(ajuste = {}) {
  const ab = ['2026-04', '2026-05', '2026-06'];
  const cheia = (c) => [lanc(c, 'ordinaria', 1840), lanc(c, 'extra', 700), lanc(c, 'multa', 36.8), lanc(c, 'juros', 12.4)];
  return {
    formulario: {
      razao_social: 'Condomínio Residencial Exemplo A', uf: 'CE', cidade: 'Fortaleza', tipo_contratacao: 'nova',
      executivo: { nome: 'Executiva Exemplo', uf: 'CE' }, uh_total: 24, taxa_ordinaria: 1840, dia_vencimento: 10,
      desconto_pontualidade: { tipo: 'nenhum' }, agua_gas: { compoe_boleto: false },
      taxas_extras: [{ descricao: 'Reforma da fachada', valor_por_uh: 700, inicio: '2026-01', fim: '2026-12', ata: true }],
      sindico: { tipo: 'condomino', isencao: 'integral' }, uh_isentas_informadas: 1,
    },
    convencao: { presente: true, registro: 'RI', uh: 24, multa_pct: 2, foro: 'Comarca de Fortaleza' },
    relatorio: {
      presente: true, data_emissao: '2026-07-16', tem_competencia: true, tem_nomes: true,
      unidades: [
        { unidade: 'A-101', titular: 'Titular Fictício 1', documento: '111.111.111-11', lancamentos: ab.flatMap(cheia) },
        { unidade: 'B-203', titular: 'Titular Fictício 2', documento: '222.222.222-22', lancamentos: ab.flatMap(cheia) },
        { unidade: 'C-305', titular: 'Titular Fictício 3', lancamentos: [lanc('2026-04', 'ordinaria', 1840), ...cheia('2026-05'), lanc('2026-06', 'ordinaria', 1840)] },
        { unidade: 'D-402', titular: 'Titular Fictício 4', lancamentos: [lanc('2026-04', 'ordinaria', 1200), lanc('2026-05', 'ordinaria', 500), lanc('2026-06', 'ordinaria', 1500), lanc('2026-06', 'honorarios', 150)] },
        { unidade: 'E-501', titular: 'Titular Fictício 5', lancamentos: [lanc('2026-05', 'ordinaria', 420), lanc('2026-07', 'ordinaria', 1840)] },
      ],
    },
    analista: {},
    ...ajuste,
  };
}

/* caso simples: 100 UH × R$ 1.000 (receita R$ 100.000), uma unidade devendo `pct`% da receita em cada mês-base */
function casoSimples({ pct, uh = 100, ordinaria = 1000, uf = 'CE', executivo = {}, hoje = '2026-07-20' }) {
  const receita = uh * ordinaria;
  const valor = Math.round(receita * pct) / 100;
  return {
    entrada: {
      formulario: { uf, executivo, uh_total: uh, taxa_ordinaria: ordinaria, dia_vencimento: 5, sindico: { tipo: 'profissional', isencao: 'nao' } },
      convencao: { presente: true, registro: 'RI', uh },
      relatorio: {
        presente: true, data_emissao: '2026-07-16', tem_competencia: true, tem_nomes: true,
        unidades: [{ unidade: '101', titular: 'Fulano Fictício', lancamentos: ['2026-04', '2026-05', '2026-06'].map((c) => lanc(c, 'ordinaria', valor, 5)) }],
      },
    },
    opcoes: { hoje },
  };
}
const rodar = (args) => { const { entrada, opcoes } = casoSimples(args); return analisar(entrada, POLITICA_PADRAO, opcoes); };

test('a política padrão é válida e configurações quebradas são recusadas', () => {
  assert.deepEqual(validarPolitica(POLITICA_PADRAO), []);
  assert.ok(validarPolitica({ ...POLITICA_PADRAO, inad_reprovacao: 42 }).some((e) => /última vai até 40/.test(e)));
  assert.ok(validarPolitica({ ...POLITICA_PADRAO, faixas: [{ ate: 5, taxa_adm: 2 }, { ate: 4, taxa_adm: 3 }] }).length);
});

test('§9.1 caso A (jul/2026): janela abr/mai/jun, 14,31%, APROVADA 3,00% + R$ 2,00', () => {
  const r = analisar(casoA(), POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(r.janela.texto, 'abr/mai/jun 2026');
  assert.equal(r.escopo.uh_escopo, 23);
  assert.equal(r.valores.receita_bruta, 58420);
  assert.equal(r.valores.receita_liquida, 58420);
  assert.deepEqual(r.meses.map((m) => m.valor), [8120, 8540, 8420]);
  assert.deepEqual(r.meses.map((m) => m.inadimplentes), [4, 5, 4]);
  perto(r.inad_media, 14.31);
  assert.equal(r.inad_media_rs, 8360);
  assert.equal(r.status.rotulo, 'APROVADA');
  assert.equal(r.precificacao.taxa_adm, 3.00);
  assert.equal(r.precificacao.boleto, 2.00);
  assert.deepEqual(r.indicadores, { receita_myblue: 1798.6, valor_antecipado: 56621.4, exposicao: 6561.4 });
  assert.equal(r.comparativo.sem_myblue.custo_boleto, 2.5);
  assert.equal(r.comparativo.ganho_mensal, 6618.9);
  assert.equal(r.comparativo.ganho_anual, 79426.8);
  const conc = r.alertas.find((a) => a.codigo === 'concentracao');
  assert.match(conc.mensagem, /^2 unidades concentram 60,8%/);
  assert.equal(r.diretoria, false);
  assert.equal(r.prazo_horas, 24);
  assert.equal(r.validade_ate, '2026-08-19');
  assert.equal(r.assertiva.indicada, false);
  assert.match(r.assertiva.texto, /não indicada/);
  assert.ok(r.observacoes.some((o) => /Recomenda-se implementar desconto/.test(o)));
  assert.deepEqual(r.divergencias, []);
});

test('§9.3 faixas: teto inclusivo, 5,01% a 7,50% nunca é 2,00%', () => {
  const casos = [[5.00, 2.00], [5.01, 2.25], [5.80, 2.25], [7.50, 2.25], [7.51, 2.50], [8.39, 2.50], [13.33, 3.00], [16.32, 3.25], [35.00, 5.00], [35.01, 6.00], [40.00, 6.00]];
  for (const [inad, taxa] of casos) assert.equal(faixaPara(inad).taxa_adm, taxa, `${inad}%`);
  assert.equal(faixaPara(40.01), null);
  assert.equal(faixaPara(0).taxa_adm, 2.00);
  // média de 3 meses que dá 7,5% com ruído de ponto flutuante continua em 2,25%
  assert.equal(faixaPara((7.4 + 7.5 + 7.6) / 3).taxa_adm, 2.25);
});

test('§9.3 status pela inadimplência: 35% aprova, 35,01% vai à diretoria, acima de 40% reprova', () => {
  const a = rodar({ pct: 35 });
  assert.equal(a.status.codigo, 'aprovada');
  assert.equal(a.precificacao.taxa_adm, 5.00);
  assert.equal(a.diretoria, false);

  const b = rodar({ pct: 35.01 });
  assert.equal(b.status.rotulo, 'APROVADA COM RESSALVAS');
  assert.equal(b.precificacao.taxa_adm, 6.00);
  assert.equal(b.diretoria, true);
  assert.equal(b.prazo_horas, 48);
  assert.ok(codigos(b.ressalvas).includes('diretoria'));
  assert.ok(b.alertas.some((x) => x.codigo === 'diretoria'));
  assert.ok(b.observacoes.some((o) => /impreterível/.test(o)));

  const c = rodar({ pct: 40.5 });
  assert.equal(c.status.codigo, 'reprovada');
  assert.ok(codigos(c.reprovacoes).includes('inadimplencia'));
});

test('§9.4 boleto: Maranhão e executivo com boleto próprio → R$ 5,50 em qualquer faixa', () => {
  assert.equal(rodar({ pct: 3, uf: 'MA' }).precificacao.boleto, 5.50);
  assert.equal(rodar({ pct: 30, uf: 'MA' }).precificacao.boleto, 5.50);
  assert.equal(rodar({ pct: 3, uf: 'CE', executivo: { nome: 'Exec MA', uf: 'MA' } }).precificacao.boleto, 5.50);
  assert.equal(rodar({ pct: 3, uf: 'PI', executivo: { nome: 'Exec', uf: 'CE', boleto: 5.5 } }).precificacao.boleto, 5.50);
  assert.equal(rodar({ pct: 3, uf: 'CE' }).precificacao.boleto, 2.00);
  assert.deepEqual(boletoPara({ uf: 'df' }), { valor: 2, origem: 'padrao' });
});

test('§9.5 receita mínima e exposição', () => {
  const pequeno = rodar({ pct: 3, uh: 1, ordinaria: 4999.99 });
  assert.equal(pequeno.status.codigo, 'reprovada');
  assert.ok(codigos(pequeno.reprovacoes).includes('receita_minima'));
  assert.equal(rodar({ pct: 3, uh: 1, ordinaria: 5000 }).status.codigo, 'aprovada');

  // R$ 250.000 de receita: 20,01% → exposição R$ 40.450 → reprova; 19,99% → exposição R$ 41.025, mas não reprova
  const alta = rodar({ pct: 20.01, ordinaria: 2500 });
  assert.equal(alta.indicadores.exposicao, 40450);
  assert.equal(alta.status.codigo, 'reprovada');
  assert.deepEqual(codigos(alta.reprovacoes), ['exposicao']);
  const abaixo = rodar({ pct: 19.99, ordinaria: 2500 });
  assert.ok(abaixo.indicadores.exposicao > 40000);
  assert.equal(abaixo.status.codigo, 'aprovada');
});

test('§9.6 documentos: sem competência → PENDENTE; sem nomes, só RTD ou sem convenção → RESSALVAS; relatório velho → atualizar', () => {
  const semComp = analisar({ ...casoA(), relatorio: { ...casoA().relatorio, tem_competencia: false } }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(semComp.status.codigo, 'pendente');
  assert.ok(codigos(semComp.pendencias).includes('relatorio_sem_competencia'));
  assert.equal(semComp.precificacao, null);

  const semNomes = analisar({ ...casoA(), relatorio: { ...casoA().relatorio, tem_nomes: false } }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(semNomes.status.codigo, 'ressalvas');
  assert.ok(codigos(semNomes.ressalvas).includes('relatorio_sem_nomes'));
  assert.equal(semNomes.assertiva.inviavel, true);

  const rtd = analisar({ ...casoA(), convencao: { ...casoA().convencao, registro: 'RTD' } }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(rtd.status.codigo, 'ressalvas');
  assert.match(rtd.ressalvas[0].texto, /RTD/);

  const generico = (uf) => analisar({ ...casoA(), formulario: { ...casoA().formulario, uf }, convencao: { ...casoA().convencao, registro: 'cartorio' } }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(generico('RN').status.codigo, 'aprovada');
  assert.equal(generico('PB').status.codigo, 'ressalvas');

  const semConv = analisar({ ...casoA(), convencao: null }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.ok(codigos(semConv.ressalvas).includes('convencao_ausente'));

  const velho = analisar(casoA(), POLITICA_PADRAO, { hoje: '2026-10-19' });
  assert.equal(velho.status.codigo, 'pendente');
  assert.ok(codigos(velho.pendencias).includes('relatorio_desatualizado'));
  assert.ok(codigos(velho.pendencias).includes('relatorio_anterior_janela'));

  const semRel = analisar({ ...casoA(), relatorio: null }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.deepEqual(codigos(semRel.pendencias), ['relatorio_ausente']);
});

test('§3.1 regra dos 10 dias: compara a emissão com o vencimento e recua a janela', () => {
  const venc = (comp) => `${comp}-05`;
  // vence 05/06, relatório de 15/06 (10 dias): junho fora, janela recua para mar/abr/mai
  let j = janelaBase({ hoje: '2026-07-20', emissao: '2026-06-15', vencimentoDe: venc });
  assert.deepEqual(j.meses.map((m) => m.competencia), ['2026-03', '2026-04', '2026-05']);
  assert.deepEqual(j.descartadas.map((d) => d.competencia), ['2026-06']);
  // 16/06 (11 dias): junho entra
  j = janelaBase({ hoje: '2026-07-20', emissao: '2026-06-16', vencimentoDe: venc });
  assert.deepEqual(j.meses.map((m) => m.competencia), ['2026-04', '2026-05', '2026-06']);
  // "10 dias ou mais" é configurável
  j = janelaBase({ hoje: '2026-07-20', emissao: '2026-06-15', vencimentoDe: venc }, { ...POLITICA_PADRAO, dias_inclusivo: true });
  assert.deepEqual(j.meses.map((m) => m.competencia), ['2026-04', '2026-05', '2026-06']);
  // relatório antigo para a data de hoje: não fecha 3 meses
  j = janelaBase({ hoje: '2026-09-20', emissao: '2026-06-16', vencimentoDe: venc });
  assert.equal(j.suficiente, false);
});

test('§3.1 o analista pode ajustar a janela, com justificativa, e a nota não diz quem ajustou', () => {
  const r = analisar(casoA({ analista: { ajustes: { janela: { valor: ['03/2026', '04/2026', '05/2026'], justificativa: 'junho com cobrança extraordinária já quitada' } } } }), POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(r.janela.texto, 'mar/abr/mai 2026');
  assert.ok(r.janela.ajustada);
  assert.ok(r.observacoes.some((o) => /Período de meses-base ajustado na análise \(junho/.test(o)));
  const semJust = analisar(casoA({ analista: { ajustes: { janela: { valor: ['03/2026'] } } } }), POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(semJust.janela.texto, 'abr/mai/jun 2026');
  assert.ok(semJust.alertas.some((a) => a.codigo === 'ajuste_sem_justificativa'));
});

test('§9.7 espólio sai do numerador e do denominador; JURÍDICO fica; acordo sai', () => {
  const base = casoA();
  const comEspolio = analisar(casoA({ analista: { espolios: [{ unidade: 'A-101', nome: 'Espólio de Titular Fictício 1' }] } }), POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(comEspolio.escopo.uh_escopo, 22);
  assert.equal(comEspolio.valores.receita_bruta, 22 * 2540);
  assert.deepEqual(comEspolio.meses.map((m) => m.valor), [8120 - 2540, 8540 - 2540, 8420 - 2540]);
  const ex = comEspolio.escopo.exclusoes[0];
  assert.equal(ex.motivo, 'espolio');
  assert.equal(ex.debito, 7620);
  assert.match(ex.encaminhamento, /inventário/);

  // "Espólio" escrito no próprio relatório
  const rel = { ...base.relatorio, unidades: base.relatorio.unidades.map((u) => (u.unidade === 'B-203' ? { ...u, titular: 'Espólio de Fulano' } : u)) };
  assert.equal(analisar({ ...base, relatorio: rel }, POLITICA_PADRAO, { hoje: '2026-07-20' }).escopo.uh_escopo, 22);

  // JURÍDICO permanece; flag A (acordo) sai da base mas a unidade continua no denominador
  const juridico = { ...base.relatorio, unidades: base.relatorio.unidades.map((u) => (u.unidade === 'B-203' ? { ...u, flag: 'juridico' } : u)) };
  const rj = analisar({ ...base, relatorio: juridico }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.deepEqual(rj.meses.map((m) => m.valor), [8120, 8540, 8420]);
  const acordo = { ...base.relatorio, unidades: base.relatorio.unidades.map((u) => (u.unidade === 'B-203' ? { ...u, flag: 'acordo' } : u)) };
  const ra = analisar({ ...base, relatorio: acordo }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(ra.escopo.uh_escopo, 23);
  assert.deepEqual(ra.meses.map((m) => m.valor), [8120 - 2540, 8540 - 2540, 8420 - 2540]);

  // retomada Caixa sai do escopo
  assert.equal(analisar(casoA({ analista: { retomadas: [{ unidade: 'D-402', banco: 'Caixa' }] } }), POLITICA_PADRAO, { hoje: '2026-07-20' }).escopo.uh_escopo, 22);
});

test('§9.7 Assertiva: só pessoa física com 24+ taxas em aberto, CNPJ nunca entra', () => {
  const comps = (de, n) => Array.from({ length: n }, (_, i) => { const t = 2024 * 12 + (de - 1) + i; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; });
  const base = casoA();
  const unidades = [
    ...base.relatorio.unidades,
    { unidade: 'F-601', titular: 'Construtora Exemplo Ltda', documento: '11.222.333/0001-81', lancamentos: comps(1, 26).map((c) => lanc(c, 'ordinaria', 1840)) },
    { unidade: 'G-702', titular: 'Pessoa Fictícia Sete', documento: '777.777.777-77', lancamentos: comps(1, 24).map((c) => lanc(c, 'ordinaria', 1840)) },
    { unidade: 'H-803', titular: 'Pessoa Fictícia Oito', documento: '888.888.888-88', lancamentos: comps(1, 30).filter((_, i) => i % 5 !== 0).map((c) => lanc(c, 'ordinaria', 1840)) },
    { unidade: 'I-904', titular: 'Pessoa Fictícia Nove', lancamentos: comps(1, 23).map((c) => lanc(c, 'ordinaria', 1840)) },
  ];
  const r = analisar({ ...base, formulario: { ...base.formulario, uh_total: 30 }, convencao: { ...base.convencao, uh: 30 }, relatorio: { ...base.relatorio, unidades } }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(r.assertiva.indicada, true);
  assert.deepEqual(r.assertiva.candidatos.map((c) => c.unidade), ['G-702', 'H-803']);
  assert.equal(r.assertiva.candidatos[0].cessacao_abrupta, true);
  assert.equal(r.assertiva.candidatos[1].cessacao_abrupta, false);
  assert.equal(r.assertiva.candidatos[1].taxas_em_aberto, 24);
  // critério "consecutivas" tira quem tem pagamentos no meio
  const c = analisar({ ...base, relatorio: { ...base.relatorio, unidades } }, { ...POLITICA_PADRAO, assertiva_criterio: 'consecutivas' }, { hoje: '2026-07-20' });
  assert.deepEqual(c.assertiva.candidatos.map((x) => x.unidade), ['G-702']);
});

test('§3.2 composição: taxa extra vigente entra inteira, multa/juros/honorários fora, água e gás só no boleto', () => {
  const base = casoA();
  const obra = { ...base, formulario: { ...base.formulario, taxas_extras: [{ descricao: 'Obra', valor_por_uh: 1000, inicio: '2026-01', fim: '2026-12', ata: true }] } };
  obra.relatorio = { ...base.relatorio, unidades: [{ unidade: 'A-101', titular: 'X', lancamentos: ['2026-04', '2026-05', '2026-06'].flatMap((c) => [lanc(c, 'ordinaria', 1840), lanc(c, 'extra', 1000), lanc(c, 'juros', 50)]) }] };
  const inteira = analisar(obra, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(inteira.valores.extra_por_uh, 1000); // 54% da ordinária, entra inteira (sem limite na política)
  assert.equal(inteira.valores.receita_bruta, 23 * 2840);
  assert.deepEqual(inteira.meses.map((m) => m.valor), [2840, 2840, 2840]);
  assert.ok(!inteira.alertas.some((a) => a.codigo === 'extra_acima_limite'));
  assert.match(inteira.alertas.find((a) => a.codigo === 'extra_acima_aviso').mensagem, /\(54,3% da ordinária\) passa de 40%/);
  assert.ok(!analisar(casoA(), POLITICA_PADRAO, { hoje: '2026-07-20' }).alertas.some((a) => a.codigo === 'extra_acima_aviso')); // R$ 700 = 38%
  // o limite continua configurável numa versão da política
  const limitada = analisar(obra, { ...POLITICA_PADRAO, extra_limite_pct: 40 }, { hoje: '2026-07-20' });
  assert.equal(limitada.valores.extra_por_uh, 736);
  assert.ok(limitada.alertas.some((a) => a.codigo === 'extra_acima_limite'));
  assert.equal(analisar(obra, { ...POLITICA_PADRAO, extra_limite_pct: 40, extra_acima_limite: 'excluir' }, { hoje: '2026-07-20' }).meses[0].valor, 1840);
  assert.ok(validarPolitica({ ...POLITICA_PADRAO, extra_limite_pct: -1 }).length);

  const semAta = analisar({ ...base, formulario: { ...base.formulario, taxas_extras: [{ ...base.formulario.taxas_extras[0], ata: false }] } }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.ok(semAta.alertas.some((a) => a.codigo === 'extra_sem_ata'));

  const agua = {
    ...base,
    formulario: { ...base.formulario, agua_gas: { compoe_boleto: true, por_unidade: 120 } },
    relatorio: { ...base.relatorio, unidades: [{ unidade: 'A-101', titular: 'X', lancamentos: ['2026-04', '2026-05', '2026-06'].flatMap((c) => [lanc(c, 'ordinaria', 1840), lanc(c, 'agua_gas', 120)]) }] },
  };
  const ra = analisar(agua, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(ra.valores.valor_por_uh, 1840 + 700 + 120);
  assert.deepEqual(ra.meses.map((m) => m.valor), [1960, 1960, 1960]);
  const semBoleto = analisar({ ...agua, formulario: { ...agua.formulario, agua_gas: { compoe_boleto: false, por_unidade: 120 } } }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.deepEqual(semBoleto.meses.map((m) => m.valor), [1840, 1840, 1840]);
});

test('§3.3 isenções e desconto de pontualidade', () => {
  assert.equal(unidadesIsentas({ sindico: { tipo: 'condomino', isencao: 'parcial', percentual: 50 }, outros_isentos: [{ cargo: 'subsíndico', percentual: 50 }] }).total, 1);
  const prof = unidadesIsentas({ sindico: { tipo: 'profissional', isencao: 'integral' } });
  assert.equal(prof.total, 0);
  assert.equal(prof.notas.length, 1);

  const base = casoA();
  const desc = analisar({ ...base, formulario: { ...base.formulario, desconto_pontualidade: { tipo: 'percentual', valor: 10 } } }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(desc.valores.desconto, 23 * 184);
  assert.equal(desc.valores.receita_liquida, 58420 - 23 * 184);
  assert.equal(desc.valores.receita_bruta, 58420); // a inadimplência continua sobre a receita bruta
  assert.ok(desc.observacoes.some((o) => /deve ser mantido/.test(o)));
});

test('§3.10–3.11 divergência de fontes, tendência e alertas da convenção', () => {
  const base = casoA();
  const r = analisar({
    ...base,
    formulario: { ...base.formulario, uh_total: 26, taxa_ordinaria: 1900, tipo_contratacao: 'portabilidade', garantidora_atual: 'Garantidora Exemplo' },
    convencao: { ...base.convencao, multa_pct: 10, foro: 'Comarca de Recife', clausula_restritiva: 'veda cessão de crédito' },
  }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  const uh = r.divergencias.find((d) => d.campo === 'uh_total');
  assert.equal(uh.usado, 24); // convenção prevalece para o nº de UH
  assert.equal(r.divergencias.find((d) => d.campo === 'taxa_ordinaria').usado, 1900); // formulário prevalece para a taxa
  for (const c of ['multa_acima_limite', 'foro', 'clausula_restritiva', 'portabilidade']) assert.ok(r.alertas.some((a) => a.codigo === c), c);

  const subindo = casoSimples({ pct: 10 });
  subindo.entrada.relatorio.unidades[0].lancamentos = [lanc('2026-04', 'ordinaria', 8000, 5), lanc('2026-05', 'ordinaria', 9000, 5), lanc('2026-06', 'ordinaria', 11000, 5)];
  assert.ok(analisar(subindo.entrada, POLITICA_PADRAO, subindo.opcoes).alertas.some((a) => a.codigo === 'tendencia_ascendente'));
});

test('ajustes de preço: acima da tabela gera ressalva, abaixo não é aceito', () => {
  const acima = analisar(casoA({ analista: { ajustes: { taxa_adm: { valor: 3.5, justificativa: 'concentração em duas unidades' } } } }), POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(acima.precificacao.taxa_adm, 3.5);
  assert.equal(acima.status.codigo, 'ressalvas');
  assert.ok(codigos(acima.ressalvas).includes('taxa_adm_acima_tabela'));
  const abaixo = analisar(casoA({ analista: { ajustes: { taxa_adm: { valor: 2.5, justificativa: 'desconto comercial' } } } }), POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(abaixo.precificacao.taxa_adm, 3.0);
  assert.ok(abaixo.alertas.some((a) => a.codigo === 'ajuste_abaixo_tabela'));
  const estrutural = analisar(casoA({ analista: { condicao_estrutural: 'Fraude documental no relatório' } }), POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(estrutural.status.codigo, 'reprovada');
});

test('§9.9 regressão: inadimplências de análises já feitas caem na faixa certa', () => {
  assert.equal(faixaPara(6.25).taxa_adm, 2.25);
  assert.equal(faixaPara(5.56).taxa_adm, 2.25);
  assert.equal(faixaPara(14.42).taxa_adm, 3.00);
  assert.equal(faixaPara(22.41).taxa_adm, 3.75); // registrada com 3,50% — pela tabela é 3,75% (confirmar se houve ajuste)
});

test('competências em mm/aaaa ou dd/mm/aaaa viram a mesma chave', () => {
  assert.equal(normalizarCompetencia('06/2026'), '2026-06');
  assert.equal(normalizarCompetencia('10/06/2026'), '2026-06');
  assert.equal(normalizarCompetencia('2026-6'), '2026-06');
  assert.equal(normalizarCompetencia('jun'), null);
});

test('taxa do relatório na divergência: a das competências recentes, não a mais comum do histórico', () => {
  const base = casoA();
  const antigas = Array.from({ length: 24 }, (_, i) => lanc(`20${String(23 + Math.floor(i / 12)).padStart(2, '0')}-${String((i % 12) + 1).padStart(2, '0')}`, 'ordinaria', 1500));
  const unidades = [{ unidade: 'Z-999', titular: 'Titular Fictício', lancamentos: [...antigas, ...['2026-04', '2026-05', '2026-06'].map((c) => lanc(c, 'ordinaria', 1840))] }];
  const r = analisar({ ...base, relatorio: { ...base.relatorio, unidades } }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(r.divergencias.find((d) => d.campo === 'taxa_ordinaria'), undefined); // vigente R$ 1.840 = formulário
  const outro = analisar({ ...base, formulario: { ...base.formulario, taxa_ordinaria: 1500 }, relatorio: { ...base.relatorio, unidades } }, POLITICA_PADRAO, { hoje: '2026-07-20' });
  assert.equal(outro.divergencias.find((d) => d.campo === 'taxa_ordinaria').valores.relatorio, 1840);
});

test('mês-base sem inadimplência sai da média: 2 meses com débito ÷ 2, 1 mês ÷ 1, nenhum = 0%', () => {
  const com = (meses) => {
    const { entrada, opcoes } = casoSimples({ pct: 0 });
    entrada.relatorio.unidades = [{ unidade: '101', titular: 'Fulano Fictício', lancamentos: meses.map(([c, v]) => lanc(c, 'ordinaria', v, 5)) }];
    return { entrada, opcoes };
  };
  // receita 100 UH × R$ 1.000 = R$ 100.000
  let { entrada, opcoes } = com([['2026-04', 10000], ['2026-06', 20000]]);
  let r = analisar(entrada, POLITICA_PADRAO, opcoes);
  perto(r.inad_media, 15); // (10% + 20%) ÷ 2, não ÷ 3
  assert.equal(r.inad_media_rs, 15000);
  assert.deepEqual(r.meses.map((m) => !!m.fora_da_media), [false, true, false]);
  assert.ok(r.observacoes.some((o) => /mai\/2026 sem inadimplência: fora da média, que fica sobre 2 meses/.test(o)));

  ({ entrada, opcoes } = com([['2026-05', 30000]]));
  perto(analisar(entrada, POLITICA_PADRAO, opcoes).inad_media, 30);

  ({ entrada, opcoes } = com([]));
  assert.equal(analisar(entrada, POLITICA_PADRAO, opcoes).inad_media, 0);

  // política desligada: o mês sem débito entra como zero (÷ 3)
  ({ entrada, opcoes } = com([['2026-04', 10000], ['2026-06', 20000]]));
  r = analisar(entrada, { ...POLITICA_PADRAO, media_sem_meses_zerados: false }, opcoes);
  perto(r.inad_media, 10);
  assert.ok(r.meses.every((m) => !m.fora_da_media));
});

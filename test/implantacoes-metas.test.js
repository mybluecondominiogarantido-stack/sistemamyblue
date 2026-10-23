'use strict';
// Acompanhamento da implantação: % concluído, faixas, mês vigente e as metas (dados fictícios)
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../server/implantacoes/metas');

const HOJE = '2026-10-22';
const imp = (extra = {}) => ({
  id: 1, protocolo: 'IMP-2026-10-01-01', etapa: 'em_implantacao', origem: 'analise', executivo_id: 7, executivo_nome: 'Executiva Fictícia', responsavel_id: 3, responsavel_nome: 'Analista Fictícia',
  formulario: { nome: 'Condomínio Fictício', uf: 'CE', inicio_contrato: '2026-11-01', dia_vencimento: 10 }, etapas: {}, enviado_em: '2026-10-01T13:00:00Z', ...extra,
});

test('datas: 1º vencimento previsto, data do onboarding em texto antigo e mês vigente', () => {
  assert.equal(M.primeiroVencimento({ dia_vencimento: 10 }, '2026-11-01'), '2026-11-10');
  assert.equal(M.primeiroVencimento({ dia_vencimento: 5 }, '2026-11-15'), '2026-12-05');
  assert.equal(M.primeiroVencimento({ dia_vencimento: 31 }, '2026-02-01'), '2026-02-28');
  assert.equal(M.primeiroVencimento({ dia_vencimento: 5 }, '2026-12-20'), '2027-01-05');
  assert.equal(M.dataOnboarding('16/09, às 11h', '2026'), '2026-09-16');
  assert.equal(M.dataOnboarding('2026-10-20', '2025'), '2026-10-20');
  assert.equal(M.dataOnboarding('31/02', '2026'), null);
  assert.equal(M.mesVigente('2026-10-24', 25), '2026-10');
  assert.equal(M.mesVigente('2026-10-25', 25), '2026-11');
  assert.equal(M.mesVigente('2026-12-26', 25), '2027-01');
});

test('% concluído pelas 5 etapas, Síndico MyBlue conta como onboarding, e as faixas', () => {
  const l = (etapas, etapa) => M.linha(imp({ etapas, etapa }), {}, [], HOJE);
  assert.equal(l({}).pct, 0);
  assert.equal(l({}).faixa, 'baixa');
  const quase = { documentacao: { feito: true }, vouch: { id: '1' }, boletos: { feito: true }, envio: { forma: 'email' } };
  assert.equal(l(quase).pct, 80);
  assert.equal(l(quase).faixa, 'so_onboarding');
  assert.equal(l({ ...quase, onboarding: { situacao: 'sindico_myblue' } }).pct, 100);
  assert.equal(l({ documentacao: { feito: true }, vouch: { id: '1' }, onboarding: { situacao: 'realizado', data: '2026-10-20' } }).faixa, 'alta');
  assert.equal(l({ documentacao: { feito: true }, boletos: { feito: true } }).faixa, 'media');
  assert.equal(l({}, 'concluida').pct, 100);
});

test('meta de onboarding: 30 dias do 1º vencimento (o informado pelo setor vale sobre o previsto)', () => {
  const onb = (onboarding, boletos = {}, hoje = HOJE) => M.linha(imp({ etapas: { onboarding, boletos } }), {}, [], hoje).onboarding;
  // previsto: dia 10 a partir de 01/11 → 10/11; limite 10/12
  assert.deepEqual([onb({}).primeiro_vencimento, onb({}).limite, onb({}).status, onb({}).faltam], ['2026-11-10', '2026-12-10', 'a_marcar', 49]);
  // o setor informa outro 1º vencimento (prazo curto para implantar)
  assert.equal(onb({}, { primeiro_vencimento: '2026-12-10' }).limite, '2027-01-09');
  assert.equal(M.linha(imp({ etapas: { boletos: { primeiro_vencimento: '2026-12-10' } } }), {}, [], HOJE).vencimento_previsto, false);
  // a data do formulário (executivo) vale sobre a prevista; a informada pelo setor vale sobre as duas
  const comForm = (etapas = {}) => M.linha(imp({ etapas, formulario: { ...imp({}).formulario, primeiro_vencimento: '2026-11-20' } }), {}, [], HOJE);
  assert.deepEqual([comForm().primeiro_vencimento, comForm().vencimento_previsto], ['2026-11-20', false]);
  assert.equal(comForm({ boletos: { primeiro_vencimento: '2026-12-10' } }).primeiro_vencimento, '2026-12-10');
  assert.equal(onb({ situacao: 'realizado', data: '2026-12-10' }).status, 'batida');
  assert.equal(onb({ situacao: 'realizado', data: '2026-12-11' }).status, 'nao_batida');
  assert.equal(onb({ situacao: 'realizado', data: 'combinado com o síndico' }).status, 'sem_data');
  assert.equal(onb({ situacao: 'sindico_myblue' }).status, 'batida');
  assert.equal(onb({ situacao: 'marcado', data: '2026-12-01' }).status, 'agendado');
  assert.equal(onb({ situacao: 'marcado', data: '2026-12-20' }).status, 'apos_prazo');
  assert.equal(onb({ situacao: 'marcado', data: '2026-12-01' }, {}, '2026-12-11').status, 'nao_batida');
  assert.equal(onb({}, {}, '2026-12-11').status, 'nao_batida'); // "A marcar" com o prazo vencido
});

test('meta de documentação: os documentos da meta em até 60 dias do envio; marcação à mão vale sobre o cálculo', () => {
  const doc = (datas, extra = {}, hoje = HOJE) => M.linha(imp(extra), datas, [], hoje).documentacao;
  const tres = { convencao: '2026-09-28', ata_eleicao: '2026-09-28', ata_orcamento: '2026-10-01' };
  assert.deepEqual([doc(tres).limite, doc(tres).status, doc(tres).falta], ['2026-11-30', 'pendente', ['Procuração']]);
  assert.equal(doc({ ...tres, procuracao: '2026-11-30' }).status, 'batida');
  assert.equal(doc({ ...tres, procuracao: '2026-11-30' }).completou, '2026-11-30');
  assert.equal(doc({ ...tres, procuracao: '2026-12-01' }).status, 'nao_batida');
  assert.equal(doc(tres, {}, '2026-12-01').status, 'nao_batida');
  assert.equal(doc(tres, { meta_doc_manual: { resultado: 'bateu', motivo: 'Procuração dispensada' } }, '2026-12-01').status, 'batida');
});

test('parâmetros: validação e a regra que valia em cada data', () => {
  assert.deepEqual(M.normalizarParametros({}).valores, { ...M.PADRAO, docs_meta: M.PADRAO.docs_meta });
  assert.ok(M.normalizarParametros({ meta_pct: 120, docs_meta: [] }).erros.length === 2);
  const hist = [{ id: 1, vale_desde: '2026-11-01', valores: { ...M.PADRAO, documentacao_dias: 45 } }];
  assert.equal(M.parametrosEm(hist, '2026-10-31').documentacao_dias, 60);
  assert.equal(M.parametrosEm(hist, '2026-11-01').documentacao_dias, 45);
  // o envio de outubro continua com a regra da época
  assert.equal(M.linha(imp(), {}, hist, '2026-11-15').documentacao.limite, '2026-11-30');
  assert.equal(M.linha(imp({ enviado_em: '2026-11-02T13:00:00Z' }), {}, hist, '2026-11-15').documentacao.limite, '2026-12-17');
});

test('painel e resumos por analista', () => {
  const ok = { documentacao: { feito: true }, vouch: { id: '1' }, boletos: { feito: true }, envio: { forma: 'email' } };
  const linhas = [
    M.linha(imp({ id: 1, etapa: 'concluida', etapas: { ...ok, onboarding: { situacao: 'realizado', data: '2026-11-20' } } }), { convencao: '2026-10-01', ata_eleicao: '2026-10-01', ata_orcamento: '2026-10-01', procuracao: '2026-10-05' }, [], HOJE),
    M.linha(imp({ id: 2, etapas: ok }), {}, [], HOJE),
    M.linha(imp({ id: 3, responsavel_id: null, responsavel_nome: '', etapa: 'fila', formulario: { nome: 'Outro Fictício', uf: 'PB', inicio_contrato: '2026-09-01', dia_vencimento: 5 } }), {}, [], HOJE),
  ];
  const p = M.painel(linhas, { ano: 2026 });
  assert.deepEqual([p.total, p.pct_medio, p.concluidos, p.andamento, p.nao_iniciados], [3, 60, 1, 1, 1]);
  assert.equal(p.gargalo.etapa, 'onboarding');
  assert.deepEqual(p.mensal.filter((m) => m.contratos).map((m) => [m.mes, m.contratos, m.concluidos]), [[9, 1, 0], [11, 2, 1]]);
  assert.deepEqual(p.abertos.map((x) => x.id), [3, 2]);
  assert.equal(M.painel(linhas, { ano: 2026, mes: 9 }).total, 1);
  const [a] = M.resumoOnboarding(linhas, 90);
  assert.deepEqual([a.carteira, a.batidas, a.no_prazo, a.situacao, a.prazo_medio], [2, 1, 1, 'andamento', 10]);
  const d = M.resumoDocumentacao(linhas, 90);
  assert.deepEqual([d.total, d.batidas, d.pendentes, d.situacao], [3, 1, 2, 'andamento']);
  assert.equal(d.mais_pendentes[0].n, 2);
});

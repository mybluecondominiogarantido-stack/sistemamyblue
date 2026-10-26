'use strict';
/* Solicitação de Contrato: regras do formulário, avisos do Manual do Contrato, diretoria e condições fechadas (dados fictícios). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../server/contratos/formulario');

const FORM = {
  nome: 'Condomínio Residencial Fictício', cnpj: '11.222.333/0001-81', uf: 'CE', cidade: 'Fortaleza', administradora: 'Administradora Exemplo',
  sindico_nome: 'Síndico Fictício', sindico_cpf: '111.444.777-35', sindico_email: 'sindico@exemplo.com', sindico_telefone: '(85) 90000-0000',
  taxa_adm: 3.5, boleto: 2, desconto_tipo: 'percentual', desconto_valor: 10, garantias: ['Taxa ordinária', 'Taxa extraordinária'], taxa_ordinaria: 1000, taxa_extra: 300,
  cashback: 'nao', inicio_contrato: '2026-12-01', primeiro_vencimento: '2026-12-10', dia_vencimento: 10, pedidos: [], minucias: 'Nenhuma',
};

test('da análise: condomínio, taxa, boleto, desconto e a taxa extra somada vêm preenchidos', () => {
  const a = { protocolo: 'AC-2026-01-01-01', resultado: 'aprovada', condominio: 'Fictício', taxa_adm: '3.00', boleto: '2.00',
    formulario: { razao_social: 'Condomínio Fictício', cnpj: '11.222.333/0001-81', uf: 'ce', cidade: 'Fortaleza', dia_vencimento: 10, taxa_ordinaria: 1840,
      desconto_pontualidade: { tipo: 'percentual', valor: 10 }, administradora: 'Adm Exemplo', taxas_extras: [{ valor_por_uh: 300 }, { valor_por_uh: 400 }] } };
  const { formulario, referencia } = F.daAnalise(a);
  assert.deepEqual([formulario.nome, formulario.uf, formulario.taxa_adm, formulario.boleto, formulario.taxa_extra, formulario.desconto_tipo], ['Condomínio Fictício', 'CE', 3, 2, 700, 'percentual']);
  assert.equal(referencia.protocolo, 'AC-2026-01-01-01');
});

test('faltas: o mínimo do antigo formulário, e o condomínio sem CNPJ pede ciência, administradora e a ata da assembleia', () => {
  assert.deepEqual(F.faltas(FORM, { executivoId: 1 }), []);
  assert.deepEqual(F.faltas({ ...FORM, minucias: '' }, { executivoId: 1 }), []); // outras solicitações é opcional
  assert.ok(F.faltas({ ...FORM, sindico_cpf: '123.456.789-00' }, { executivoId: 1 }).some((x) => /CPF/.test(x)));
  assert.ok(F.faltas({ ...FORM, cashback: '5' }, { executivoId: 1 }).some((x) => /receitas/.test(x)));
  const semCnpj = F.faltas({ ...FORM, cnpj: '', sem_cnpj: true, administradora: '' }, { executivoId: 1 });
  assert.equal(semCnpj.length, 3);
  assert.deepEqual(F.faltas({ ...FORM, cnpj: '', sem_cnpj: true, sem_cnpj_ciente: true }, { executivoId: 1, docs: new Set(['ata_ago']) }), []);
});

test('diretoria: taxa extra acima de 40% da ordinária, pedidos marcados e condomínio de entrega', () => {
  assert.deepEqual(F.itensDiretoria(FORM, 'analise'), []);
  assert.match(F.itensDiretoria({ ...FORM, taxa_extra: 450 }, 'analise')[0], /45,00% da ordinária/);
  const l = F.itensDiretoria({ ...FORM, pedidos: ['foro_capital', 'reembolso_limitar'], pedidos_detalhe: { reembolso_limitar: 'teto de R$ 50' } }, 'analise');
  assert.deepEqual(l, ['Cláusula 2ª, §4º: Excluir ou limitar as despesas reembolsáveis (certidão de matrícula, impressão) (teto de R$ 50).']);
  assert.match(F.itensDiretoria(FORM, 'entrega')[0], /Condomínio de entrega/);
});

test('avisos do manual: fundo de obras, sem pontualidade, sem CNPJ, fidelização na Paraíba e proposta vencida', () => {
  const t = (f, o) => F.avisos(f, o).map((x) => x.texto).join(' | ');
  assert.match(t({ ...FORM, garantias: ['Fundo de obras'] }), /Fundo de obras não consta/);
  assert.match(t({ ...FORM, desconto_tipo: 'nenhum' }), /institua 10%/);
  assert.match(t({ ...FORM, sem_cnpj: true }), /90 dias/);
  assert.match(t({ ...FORM, uf: 'PB' }), /com fidelização \(contratos da Paraíba\)/);
  assert.match(t(FORM), /sem fidelização/);
  assert.match(t(FORM, { diasAnalise: 45, validadeProposta: 30 }), /vale 30 dias/);
  assert.match(t(FORM), /30,00% da ordinária: dentro dos 40%/);
  assert.match(t(FORM, { semConvencao: true }), /não pode ser assinado sem ela/);
  assert.doesNotMatch(t(FORM), /Procuração/);
});

test('condições fechadas: partem do pedido (foro na capital, 30 dias), exigem o resultado de cada cláusula e mostram o que mudou', () => {
  const c = { formulario: { ...FORM, uf: 'RN', pedidos: ['foro_capital', 'contestacao_30'] }, diretoria: {} };
  // o prazo que o cliente pediu vira o ponto de partida da advogada
  assert.equal(F.fechadoInicial({ formulario: { ...FORM, pedidos: ['contestacao_30'], pedidos_detalhe: { contestacao_30: '45 dias' } }, diretoria: {} }).prazo_contestacao, 45);
  // retirar a pontualidade é decisão da diretoria; adiar, não
  assert.equal(F.itensDiretoria({ ...FORM, pedidos: ['pontualidade_retirar', 'pontualidade_adiar'] }, 'analise').length, 1);
  const x = F.fechadoInicial(c);
  assert.deepEqual([x.foro, x.prazo_contestacao, x.limite_extra, x.taxa_adm, x.clausulas.length], ['Natal/RN', 30, 40, 3.5, 2]);
  assert.deepEqual(F.faltasFechado(x).filter((m) => !/Dizer como ficou/.test(m)), ['Informar os honorários de cobrança extrajudicial.']);
  const fechado = F.normalizarFechado({ ...x, taxa_adm: 3.25, honorarios: 12, clausulas: x.clausulas.map((k) => ({ ...k, resultado: 'aceito' })), extra: 'ignorado' });
  assert.deepEqual(F.faltasFechado(fechado), []);
  assert.equal(fechado.extra, undefined);
  // garantias, cashback e vencimento: vale o do pedido do executivo, mesmo que venham diferentes
  assert.deepEqual(F.comPedido(c, { ...fechado, garantias: ['Água'], dia_vencimento: 5, cashback: '10' }).garantias, x.garantias);
  assert.equal(F.comPedido(c, { ...fechado, dia_vencimento: 5 }).dia_vencimento, 10);
  assert.deepEqual(F.diferencasFechado(c.formulario, fechado), [{ rotulo: 'Taxa administrativa', pedido: '3,50%', fechado: '3,25%' }]);
  // a diretoria negou o pedido dela: a cláusula já começa como recusada
  const negado = F.fechadoInicial({ formulario: { ...FORM, pedidos: ['reembolso_limitar'] }, diretoria: { itens: ['x'], decidido_em: '2026-10-01', aprovado: false } });
  assert.equal(negado.clausulas[0].resultado, 'recusado');
});

test('para a Implantação: o fechado vale sobre o pedido e as garantias fora da lista viram "outra"', () => {
  const c = { protocolo: 'CT-2026-10-21-01', formulario: { ...FORM, garantias: ['Taxa ordinária', 'Locação de ambientes a condôminos'] }, fechado_em: '2026-10-21',
    fechado: { ...F.fechadoInicial({ formulario: FORM, diretoria: {} }), taxa_adm: 3.25, garantias: ['Taxa ordinária', 'Locação de ambientes a condôminos'], observacoes: 'Repasse adiantado em 5 dias.' } };
  const i = F.paraImplantacao(c);
  assert.equal(i.taxa_adm, 3.25);
  assert.deepEqual(i.garantias, ['Taxa ordinária']);
  assert.equal(i.garantia_outra, 'Locação de ambientes a condôminos');
  assert.match(i.observacoes, /CT-2026-10-21-01.*Outras solicitações: Nenhuma.*Repasse adiantado/);
  assert.equal(F.paraImplantacao({ ...c, fechado_em: null }).taxa_adm, 3.5);
});

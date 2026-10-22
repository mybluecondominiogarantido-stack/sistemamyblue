'use strict';
/* Formulário de Implantação: o que falta para enviar, o que fica pendente e o comparativo com a análise (dados fictícios). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../server/implantacoes/formulario');

const COMPLETO = {
  nome: 'Condomínio Residencial Fictício', cnpj: '11.222.333/0001-81', uf: 'CE', cidade: 'Fortaleza', uh_total: 24, dia_vencimento: 10,
  sindico_tipo: 'condomino', sindico_isencao: 'integral', sindico_nome: 'Síndico Fictício', sindico_cpf: '111.444.777-35',
  sindico_email: 'sindico@exemplo.com', sindico_telefone: '(85) 90000-0000',
  taxa_adm: 3, boleto: 2, taxa_ordinaria: 1840, desconto_tipo: 'nenhum', inicio_contrato: '2026-11-01', honorarios: 12,
  garantias: ['Taxa ordinária'], parceria: 'nao', cashback: 'nao', antecipacao: 'nao',
  administradora: 'Administradora Exemplo', consultor_nome: 'Consultor Fictício', consultor_email: 'consultor@exemplo.com',
};
const TODOS_DOCS = new Set(['convencao', 'cadastro_moradores', 'ata_eleicao', 'ata_orcamento']);

test('CPF: confere os dígitos verificadores', () => {
  assert.equal(F.cpfValido('111.444.777-35'), true);
  assert.equal(F.cpfValido('111.444.777-36'), false);
  assert.equal(F.cpfValido('111.111.111-11'), false);
  assert.equal(F.cpfValido('123'), false);
});

test('formulário completo com os 4 documentos obrigatórios não tem faltas', () => {
  assert.deepEqual(F.faltas(COMPLETO, { docs: TODOS_DOCS, origem: 'analise', executivoId: 1 }), []);
});

test('faltas: documentos obrigatórios, CPF, parceria e cashback com as condicionais', () => {
  const l = F.faltas({ ...COMPLETO, sindico_cpf: '111.444.777-36', parceria: 'sim', parceiros: [], cashback: '5', cashback_receitas: [] },
    { docs: new Set(['convencao']), origem: 'analise', executivoId: 1 });
  assert.ok(l.some((x) => /CPF do síndico/.test(x)));
  assert.ok(l.some((x) => /parceiro/.test(x)));
  assert.ok(l.some((x) => /receitas/.test(x)));
  assert.ok(l.some((x) => /Ata de eleição/.test(x)));
  assert.ok(l.some((x) => /Ata de previsão orçamentária/.test(x)));
  assert.ok(l.some((x) => /Cadastro de moradores/.test(x)));
  assert.ok(!l.some((x) => /Convenção/.test(x)));
});

test('sem CNPJ: só condomínio de entrega, e o CNPJ vira pendência', () => {
  const semCnpj = { ...COMPLETO, cnpj: '', sem_cnpj: true };
  assert.ok(F.faltas(semCnpj, { docs: TODOS_DOCS, origem: 'analise', executivoId: 1 }).some((x) => /entrega/.test(x)));
  assert.deepEqual(F.faltas({ ...semCnpj, entrega: true, construtora: 'Construtora Exemplo' }, { docs: TODOS_DOCS, origem: 'analise', executivoId: 1 }), []);
  assert.equal(F.pendencias(semCnpj, TODOS_DOCS)[0], 'CNPJ do condomínio');
});

test('administração interna ainda pede quem administra', () => {
  const l = F.faltas({ ...COMPLETO, administradora: '', administracao_interna: true }, { docs: TODOS_DOCS, origem: 'analise', executivoId: 1 });
  assert.ok(l.some((x) => /quem administra/.test(x)));
});

test('pendências: documentos que podem chegar depois', () => {
  assert.deepEqual(F.pendencias(COMPLETO, new Set([...TODOS_DOCS, 'conta_bancaria'])),
    ['RG/CPF ou CNH do síndico', 'Comprovante de endereço do síndico', 'Modelo do boleto anterior', 'Procuração']);
});

test('da análise: formulário preenchido e referência para o comparativo', () => {
  const a = { protocolo: 'AC-2026-10-14-01', condominio: 'Condomínio Residencial Fictício', taxa_adm: '3.00', boleto: '2.00', resultado: 'aprovada',
    formulario: { razao_social: 'Condomínio Residencial Fictício', cnpj: '11.222.333/0001-81', uf: 'ce', uh_total: 24, taxa_ordinaria: 1840, dia_vencimento: 10,
      desconto_pontualidade: { tipo: 'percentual', valor: 5 }, sindico: { tipo: 'profissional', isencao: 'nao' }, administradora: 'Administradora Exemplo',
      taxas_extras: [{ descricao: 'Reforma', valor_por_uh: 700, inicio: '2026-01', fim: '2026-12', ata: true }] } };
  const { formulario: f, referencia: ref } = F.daAnalise(a);
  assert.equal(f.uf, 'CE');
  assert.equal(f.taxa_adm, 3);
  assert.equal(f.desconto_tipo, 'percentual');
  assert.equal(f.taxas_extras[0].valor_por_uh, 700);
  assert.deepEqual(F.diferencas(f, ref), []);
  const dif = F.diferencas({ ...f, taxa_adm: 3.5, desconto_tipo: 'nenhum' }, ref);
  assert.deepEqual(dif.map((x) => x.campo), ['taxa_adm', 'desconto']);
  assert.equal(dif[0].analise, 3);
});

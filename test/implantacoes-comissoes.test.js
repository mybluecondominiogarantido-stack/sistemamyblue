'use strict';
/* Parceria da implantação → Comissões de Novos Condomínios: o registro no formato da ferramenta (dados fictícios). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const COM = require('../server/implantacoes/comissoes');

const AGORA = '2026-11-03T12:00:00.000Z';
const CARTEIRA = { id: 7, codigo: '90001', nome: 'Residencial Fictício', comarca: 'CE', vencimento: '10', administradora: 'ADMINISTRADORA EXEMPLO', executivo: 'EXECUTIVA FICTÍCIA', inicio_contrato: '2026-11-01' };
const I = { id: 3, protocolo: 'IMP-2026-10-20-01' };
const AUTOR = { nome: 'Executiva Fictícia', id: 12, em: '2026-10-20T15:00:00.000Z' };
const montar = (f) => COM.montar({ i: I, f, carteira: CARTEIRA, autor: AUTOR, primeiroVencimento: '2026-11-10', agora: AGORA });

test('a chave é a mesma do "Puxar da carteira" da ferramenta: vigência + ID Vouch', () => {
  const m = montar({ parceria: 'nao' });
  assert.equal(m.id, '2026-11-v90001');
  assert.equal(m.ref, '2026-11');
  assert.equal(COM.idDoCondo('2026-11', 'Vouch-90.001'), '2026-11-vvouch90001');
  assert.deepEqual(montar({ parceria: 'nao' }).registro.resposta.temParceiro, 'nao');
  assert.equal(COM.montar({ i: I, f: {}, carteira: { ...CARTEIRA, inicio_contrato: '' }, autor: AUTOR, agora: AGORA }).motivo, 'sem_vigencia');
});

test('parceria completa entra em aprovação, com os dados da Carteira e a origem', () => {
  const r = montar({ parceria: 'sim', parceiros: [{ id: 'p-alfa', nome: 'Alfa Fictícia' }, { id: 'p-beta', nome: 'Beta Fictícia' }], comissao_recorrencia: true, comissao_venda: true }).registro;
  assert.equal(r.status, 'em_aprovacao');
  assert.deepEqual([r.codigo, r.nome, r.uf, r.diaVenc, r.adm, r.executivo, r.primeiroVenc, r.carteiraId], ['90001', 'Residencial Fictício', 'CE', '10', 'ADMINISTRADORA EXEMPLO', 'EXECUTIVA FICTÍCIA', '10/11/2026', 7]);
  assert.deepEqual(r.implantacao, { id: 3, protocolo: 'IMP-2026-10-20-01' });
  assert.deepEqual(r.resposta, { temParceiro: 'sim', parceiroId: 'p-alfa', parceiroNome: 'Alfa Fictícia', recorrencia: true, compartilhado: true, parceiro2Id: 'p-beta',
    parceiro2Nome: 'Beta Fictícia', venda: true, obs: '', por: 'Executiva Fictícia', porId: '12', em: '2026-10-20T15:00:00.000Z' });
  assert.equal(COM.regrasTexto(r.resposta), 'Recorrência 5% (Alfa Fictícia) + 5% (Beta Fictícia) · Venda 50% da 1ª Tx Adm (Alfa Fictícia)');
  assert.equal(r.historico[0].acao, 'informado na implantação');
});

test('só venda não divide; parceiro sem cadastro vai pelo nome; sem o tipo, o executivo termina na ferramenta', () => {
  const venda = montar({ parceria: 'sim', parceiros: [{ id: 'p-alfa', nome: 'Alfa Fictícia' }], comissao_venda: true }).registro.resposta;
  assert.deepEqual([venda.recorrencia, venda.compartilhado, venda.venda], [false, false, true]);
  const novo = montar({ parceria: 'sim', parceiros: [{ id: '', nome: 'Parceiro Novo Fictício' }], comissao_recorrencia: true }).registro.resposta;
  assert.deepEqual([novo.parceiroId, novo.parceiroNome], ['', 'Parceiro Novo Fictício']);
  // formulário enviado antes do tipo de comissão existir
  const antigo = montar({ parceria: 'sim', parceiros: [{ id: 'p-alfa', nome: 'Alfa Fictícia' }] }).registro;
  assert.equal(antigo.status, 'aguardando');
  assert.equal(antigo.resposta.parceiroId, 'p-alfa');
  const semResposta = montar({}).registro;
  assert.deepEqual([semResposta.status, semResposta.resposta], ['aguardando', null]);
});

test('juntar: puxado antes sem resposta recebe a da implantação; respondido ou tratado não muda', () => {
  const novo = montar({ parceria: 'nao' }).registro;
  assert.equal(COM.juntar(null, novo, AGORA).situacao, 'criado');
  const puxado = { id: novo.id, ref: '2026-11', status: 'aguardando', resposta: null, nome: 'Fictício da Carteira', historico: [{ acao: 'puxado da carteira' }] };
  const j = COM.juntar(puxado, novo, AGORA);
  assert.equal(j.situacao, 'respondido');
  assert.deepEqual([j.registro.status, j.registro.resposta.temParceiro, j.registro.nome, j.registro.historico.length], ['em_aprovacao', 'nao', 'Fictício da Carteira', 2]);
  for (const status of ['em_aprovacao', 'aprovado', 'cadastrado']) assert.equal(COM.juntar({ ...puxado, status, resposta: { temParceiro: 'nao' } }, novo, AGORA).situacao, 'ja_estava');
});

test('quem tem o papel Gestão na ferramenta', () => {
  assert.deepEqual(COM.gestoresDaFerramenta([
    { chave: 'cnp:p:4', valor: JSON.stringify({ papeis: ['gestor', 'executivo'] }) },
    { chave: 'cnp:p:5', valor: JSON.stringify({ papeis: ['financeiro'] }) },
    { chave: 'cnp:p:local', valor: JSON.stringify({ papeis: ['gestor'] }) },
    { chave: 'cnp:p:6', valor: 'não é json' },
  ]), [4]);
});

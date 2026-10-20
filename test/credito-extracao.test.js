'use strict';
/* Leitura dos PDFs da Análise de Crédito: formato pedido à API e conversão para os dados do analista (sem chamar a API). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarExtrator, paraDadosAnalista, ESQUEMA_RELATORIO, ESQUEMA_CONVENCAO } = require('../server/credito/extracao');

test('sem ANTHROPIC_API_KEY a leitura fica desligada e avisa o que falta', async () => {
  const x = criarExtrator({});
  assert.equal(x.ativo, false);
  await assert.rejects(x.ler('relatorio', Buffer.from('%PDF-')), (e) => e.status === 503 && /ANTHROPIC_API_KEY/.test(e.message));
  assert.equal(criarExtrator({ ANTHROPIC_API_KEY: 'chave-de-teste' }).ativo, true);
});

test('saída estruturada: todo objeto fechado e com todos os campos obrigatórios', () => {
  const conferir = (no, caminho) => {
    if (no.anyOf) return no.anyOf.forEach((x, i) => conferir(x, `${caminho}|${i}`));
    if (no.type === 'object') {
      assert.equal(no.additionalProperties, false, caminho);
      assert.deepEqual([...no.required].sort(), Object.keys(no.properties).sort(), caminho);
      for (const [k, v] of Object.entries(no.properties)) conferir(v, `${caminho}.${k}`);
    }
    if (no.type === 'array') conferir(no.items, `${caminho}[]`);
    for (const proibido of ['minimum', 'maximum', 'minLength', 'maxLength']) assert.equal(no[proibido], undefined, `${caminho}: ${proibido}`);
  };
  conferir(ESQUEMA_RELATORIO, 'relatorio');
  conferir(ESQUEMA_CONVENCAO, 'convencao');
});

test('o que a IA leu vira os dados do analista, com a origem para conferir', () => {
  const rel = paraDadosAnalista('relatorio', { sistema: 'Gestart', data_emissao: '2026-10-16', fonte_emissao: { pagina: 1, trecho: 'Emissão 16/10/2026' }, tem_competencia: true, tem_nomes: false, periodo_inicio: null, legivel: true, observacoes: ['página 4 cortada'],
    unidades: [{ unidade: 'B-12', titular: '', documento: '', tipo_pessoa: '', flag: 'acordo', espolio: false, pagina: 3, lancamentos: [{ competencia: '2026-07', vencimento: '2026-07-10', tipo: 'ordinaria', valor: 900 }, { competencia: '2026-08', vencimento: null, tipo: 'ordinaria', valor: 0 }] }] }, 7);
  assert.equal(rel.tem_nomes, false);
  assert.equal(rel.unidades[0].flag, 'acordo');
  assert.equal(rel.unidades[0].lancamentos.length, 1); // valor zero não é débito
  assert.deepEqual(rel.origem, { ia: true, documento_id: 7, fonte_emissao: { pagina: 1, trecho: 'Emissão 16/10/2026' }, observacoes: ['página 4 cortada'], legivel: true });
  const conv = paraDadosAnalista('convencao', { registro: 'RTD', cartorio: '2º RTD', matricula: '9', uh: 40, foro: 'Natal', multa_pct: 10, clausula_restritiva: '', regras_taxa_extra: '', observacoes: [], fontes: {} }, 8);
  assert.equal(conv.registro, 'RTD');
  assert.equal(conv.cartorio, '2º RTD · 9');
  assert.equal(conv.multa_pct, 10);
});

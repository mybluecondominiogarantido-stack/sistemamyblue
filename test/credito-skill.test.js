'use strict';
/* Resposta das skills do Claude colada no portal (dados fictícios). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lerRespostaSkill, registroDe } = require('../server/credito/skill');

const CONVENCAO = `### 1. Campos para o portal (seção Convenção)
| Campo no portal | Valor | Página | Trecho |
|---|---|---|---|
| Registro | Sem registro (só autenticação de cópia em tabelionato) | 14 | "confere com o original" |
| Nº de unidades na convenção | 32 | 2 | "32 apartamentos" |
| Multa por atraso (%) | não consta | 9 | "a ser fixada em assembleia" |
| Foro | Comarca de Cidade Exemplo/PB | 15 | "fica eleito o foro" |
| Cartório e matrícula | não consta | | |
| Cláusula que limita garantidora | não consta | | |

### 2. Alertas para o analista
- Registro fora do Registro de Imóveis.

### 3. Textos do retorno
**Observações jurídicas**
- Convenção sem registro no Registro de Imóveis.
- Multa não fixada: cobrança limitada a 2%.

**Próximos passos**
1. Regularizar o registro no Registro de Imóveis em até 90 dias.

**Ressalvas**
- Convenção sem registro no Registro de Imóveis — regularizar em até 90 dias
`;

test('convenção: campos com página e trecho, textos do retorno e ressalvas', () => {
  const r = lerRespostaSkill(CONVENCAO);
  assert.deepEqual({ ...r.convencao, origem: undefined }, { registro: 'nenhum', uh: 32, multa_pct: null, foro: 'Comarca de Cidade Exemplo/PB', cartorio: '', clausula_restritiva: '', origem: undefined });
  assert.deepEqual(r.convencao.origem.fontes.registro, { pagina: 14, trecho: 'confere com o original' });
  assert.equal(r.textos.observacoes_juridicas.length, 2);
  assert.deepEqual(r.textos.proximos_passos, ['Regularizar o registro no Registro de Imóveis em até 90 dias.']);
  assert.deepEqual(r.ressalvas, [{ texto: 'Convenção sem registro no Registro de Imóveis', justificativa: 'regularizar em até 90 dias' }]);
  assert.deepEqual(r.avisos, ['Registro fora do Registro de Imóveis.']);
});

test('copiado da tela (sem Markdown): tabela com tabulação e títulos sem marcação', () => {
  const plano = CONVENCAO.replace(/^#+ /gm, '').replace(/\*\*/g, '').split('\n')
    .map((l) => (l.startsWith('|') ? l.replace(/^\|\s*|\s*\|$/g, '').split(/\s*\|\s*/).join('\t') : l)).join('\n');
  const r = lerRespostaSkill(plano);
  assert.equal(r.convencao.registro, 'nenhum');
  assert.equal(r.convencao.uh, 32);
  assert.equal(r.textos.observacoes_juridicas.length, 2);
  assert.equal(r.ressalvas.length, 1);
});

test('inadimplência: lançamentos (em partes), emissão, competência, nomes e avisos', () => {
  const r = lerRespostaSkill([
    '### 1. Resumo do relatório', '- Data de emissão: 16/10/2026 (página 1)', '- Detalhado por competência: sim · Traz o nome dos devedores: não',
    '- Taxa ordinária vigente: R$ 476,84 (desde 10/2026)', '', '### 2. Lançamentos para colar no portal (parte 1 de 2)', '```',
    'Unidade;Titular;Documento;Competência;Tipo;Valor;Vencimento', 'A-101;;;07/2026;Taxa ordinária;310,00;10/07/2026', 'A-101;;;07/2026;Multa;6,20;', '```',
    '(parte 2 de 2)', '```', 'Unidade;Titular;Documento;Competência;Tipo;Valor;Vencimento', 'B-203;;;08/2026;Taxa ordinária;310,00;10/08/2026', '```',
    '### 4. Candidatos à consulta Assertiva (espólio)', 'Nenhuma pessoa física com 24 ou mais taxas em aberto: Assertiva não indicada.',
    '### 5. Avisos', '- Unidade A-101 em acordo.',
  ].join('\n'));
  assert.equal(r.relatorio.data_emissao, '2026-10-16');
  assert.equal(r.relatorio.tem_competencia, true);
  assert.equal(r.relatorio.tem_nomes, false);
  assert.equal(r.lancamentos.linhas, 3);
  assert.deepEqual(r.lancamentos.unidades.map((u) => u.unidade), ['A-101', 'B-203']);
  assert.equal(r.convencao, null);
  assert.deepEqual(r.avisos, ['Taxa ordinária vigente no relatório: R$ 476,84 (desde 10/2026)', 'Unidade A-101 em acordo.']);
  assert.equal(r.assertiva.length, 1);
});

test('tipo de registro pelo texto da skill', () => {
  assert.equal(require('../server/credito/colar').valorDe('1.900'), 1900);
  assert.equal(registroDe('Registro de Imóveis'), 'RI');
  assert.equal(registroDe('1º Ofício de Registro de Imóveis, Livro 3'), 'RI');
  assert.equal(registroDe('Só Títulos e Documentos (RTD)'), 'RTD');
  assert.equal(registroDe('Cartório (sem especificar)'), 'cartorio');
  assert.equal(registroDe('Sem registro'), 'nenhum');
  assert.equal(registroDe('Só autenticação de cópia'), 'nenhum');
  assert.equal(lerRespostaSkill('nada aqui').achados.length, 0);
});

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

test('formatos que o Claude também usa: resumo em tabela, lançamentos em tabela, coluna a menos, data por extenso', () => {
  const r = lerRespostaSkill([
    '| Campo | Valor |', '|---|---|', '| Data de emissão | 16 de outubro de 2026 (página 1) |', '| Detalhado por competência | Sim |', '| Traz o nome dos devedores | Não |',
    '| Período coberto | 01/2011 a 10/2026 |', '',
    '| Unidade | Titular | Competência | Tipo | Valor |', '|---|---|---|---|---|', '| AP 0704 | Titular Fictício | 01/2011 | Taxa ordinária | 310,00 |', '| AP 0704 | Titular Fictício | 02/2011 | Taxa ordinária | 1.840,00 |', '',
    '```', 'Unidade;Competência;Tipo;Valor', 'B-203;08/2026;Taxa ordinária;310,00', '```',
  ].join('\n'));
  assert.equal(r.relatorio.data_emissao, '2026-10-16');
  assert.equal(r.relatorio.tem_competencia, true);
  assert.equal(r.relatorio.tem_nomes, false);
  assert.equal(r.relatorio.periodo_inicio, '2011-01');
  assert.equal(r.lancamentos.linhas, 3, JSON.stringify(r.lancamentos.erros));
  const ap = r.lancamentos.unidades.find((u) => u.unidade === 'AP 0704');
  assert.equal(ap.titular, 'Titular Fictício');
  assert.deepEqual(ap.lancamentos.map((l) => l.valor), [310, 1840]);
  assert.equal(r.lancamentos.unidades.find((u) => u.unidade === 'B-203').lancamentos[0].competencia, '2026-08');
});

test('bloco PORTAL MYBLUE: cada etiqueta vai para o seu campo, e as partes (das duas skills) se somam', () => {
  const r = lerRespostaSkill([
    'Texto da análise para ler (o portal ignora o que fica fora do bloco).', '- Data de emissão: 01/01/2020', '',
    '```', '#PORTAL-MYBLUE v1', '[relatorio]', 'sistema: Gescon', 'data_emissao: 16/10/2026', 'detalhado_por_competencia: sim', 'traz_nomes: sim', 'periodo_inicio: 01/2011', 'taxa_vigente: R$ 476,84 desde 10/2026',
    '[lancamentos]', 'Unidade;Titular;Documento;Competência;Tipo;Valor;Vencimento', 'AP 0704;Titular Fictício;111.111.111-11;09/2026;Taxa ordinária;476,84;10/09/2026',
    '[observacoes_analise]', 'Inadimplência em alta nos últimos meses; as unidades 108 e 207 são recorrentes.',
    '[avisos]', '- Unidade 305 em acordo: sai da base.', '#FIM', '```', '',
    '```', '#PORTAL-MYBLUE v1', '[convencao]', 'registro: nenhum', 'unidades: 32', 'multa_pct: não consta', 'foro: Comarca de Cidade Exemplo/PB', 'cartorio: não consta', 'clausula_restritiva:',
    'fonte_registro: p. 14 | confere com o original', 'fonte_unidades: p. 2 | 32 apartamentos',
    '[observacoes_juridicas]', '- Convenção sem registro no Registro de Imóveis: regularizar em até 90 dias.', '- Multa não fixada: cobrança limitada a 2% (art. 1.336, §1º, CC).',
    '[proximos_passos]', '1. Regularizar o registro da convenção em até 90 dias.', '[ressalvas]', '- Convenção sem registro — regularizar em até 90 dias', '#FIM', '```',
  ].join('\n'));
  assert.equal(r.bloco, true);
  assert.deepEqual(r.relatorio, { sistema: 'Gescon', data_emissao: '2026-10-16', tem_competencia: true, tem_nomes: true, periodo_inicio: '2011-01' });
  assert.equal(r.lancamentos.linhas, 1);
  assert.equal(r.textos.complemento_status, 'Inadimplência em alta nos últimos meses; as unidades 108 e 207 são recorrentes.');
  assert.deepEqual({ ...r.convencao, origem: undefined }, { registro: 'nenhum', uh: 32, multa_pct: null, foro: 'Comarca de Cidade Exemplo/PB', cartorio: '', clausula_restritiva: '', origem: undefined });
  assert.deepEqual(r.convencao.origem.fontes.registro, { pagina: 14, trecho: 'confere com o original' });
  assert.equal(r.textos.observacoes_juridicas.length, 2);
  assert.deepEqual(r.textos.proximos_passos, ['Regularizar o registro da convenção em até 90 dias.']);
  assert.deepEqual(r.ressalvas, []); // o portal já põe a ressalva do registro pelo campo da convenção
  assert.deepEqual(r.avisos, ['Taxa ordinária vigente no relatório: R$ 476,84 desde 10/2026', 'Unidade 305 em acordo: sai da base.']);
});

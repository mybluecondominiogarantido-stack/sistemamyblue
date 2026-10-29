'use strict';
/* Retorno de Análise de Crédito: DADOS do gerador, PDF com 4 páginas, resumo executivo e e-mail (dados fictícios). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const { analisar } = require('../server/credito/motor');
const R = require('../server/credito/retorno');

const lanc = (c, tipo, valor) => ({ competencia: c, vencimento: `${c}-10`, tipo, valor });
const ab = ['2026-04', '2026-05', '2026-06'];
const formulario = {
  razao_social: 'Condomínio Residencial Exemplo & Cia', cnpj: '11.222.333/0001-81', uf: 'CE', cidade: 'Fortaleza', tipo_contratacao: 'nova',
  executivo: { nome: 'Executiva Exemplo', uf: 'CE' }, uh_total: 24, taxa_ordinaria: 1840, dia_vencimento: 10, desconto_pontualidade: { tipo: 'nenhum' },
  taxas_extras: [{ descricao: 'Reforma da fachada', valor_por_uh: 700, inicio: '2026-01', fim: '2026-12', ata: true }], sindico: { tipo: 'condomino', isencao: 'integral' },
};
function caso(analista = {}) {
  const cheia = (c) => [lanc(c, 'ordinaria', 1840), lanc(c, 'extra', 700)];
  const entrada = {
    formulario, convencao: { presente: true, registro: 'RI', uh: 24 },
    relatorio: { presente: true, data_emissao: '2026-07-16', tem_competencia: true, tem_nomes: true, unidades: [
      { unidade: 'A-101', titular: 'Titular Fictício 1', lancamentos: ab.flatMap(cheia) },
      { unidade: 'B-203', titular: 'Titular Fictício 2', lancamentos: ab.flatMap(cheia) },
      { unidade: 'C-305', titular: 'Titular Fictício 3', lancamentos: [lanc('2026-04', 'ordinaria', 1840), ...cheia('2026-05'), lanc('2026-06', 'ordinaria', 1840)] },
      { unidade: 'D-402', titular: 'Titular Fictício 4', lancamentos: [lanc('2026-04', 'ordinaria', 1200), lanc('2026-05', 'ordinaria', 500), lanc('2026-06', 'ordinaria', 1500)] },
      { unidade: 'E-501', titular: 'Titular Fictício 5', lancamentos: [lanc('2026-05', 'ordinaria', 420)] },
    ] },
    analista,
  };
  const r = analisar(entrada, undefined, { hoje: '2026-07-20' });
  return { r, ctx: { formulario, protocolo: 'AC-2026-07-20-03', analista: 'Analista Fictício', emissao: '2026-07-16' } };
}

let temGerador = true;
try { execFileSync(process.env.PYTHON || 'python3', ['-c', 'import reportlab'], { stdio: 'ignore' }); } catch { temGerador = false; }

test('DADOS do gerador saem do resultado do motor', () => {
  const { r, ctx } = caso();
  const d = R.montarDados(r, ctx);
  assert.equal(d.status, 'APROVADA');
  assert.equal(d.executivo, 'Executiva Exemplo');
  assert.equal(R.montarDados(r, { ...ctx, formulario: { ...formulario, executivo: undefined }, executivo: 'Executivo do Cadastro' }).executivo, 'Executivo do Cadastro');
  assert.equal(d.taxa_adm, '3,00%');
  assert.equal(d.boleto_myb, 'R$ 2,00');
  assert.equal(d.razao_social, 'Condomínio Residencial Exemplo &amp; Cia'); // texto escapado para o Paragraph do ReportLab
  assert.deepEqual(d.meses_base[0], ['Abril/2026', '4', 'R$ 8.120,00', '13,90%']);
  assert.equal(d.inad_media_pct, '14,31%');
  assert.equal(d.comp.inad_com, 'R$ 0,00 (garantido)');
  assert.equal(d.comp.ganho_anual, 'R$ 79.426,80');
  assert.equal(d.comp.bol_sem, 'R$ 57,50 *'); // custo de boleto não informado: R$ 2,50 com asterisco
  assert.match(d.nota_base, /considerado R\$ 2,50/);
  assert.equal(d.exposicao, 'R$ 6.561,40');
  assert.deepEqual(d.unidades_excluidas, []);
  assert.match(d.texto_sem_exclusoes, /Assertiva não indicada/);
  assert.match(d.observacoes_status, /<b>aprovado<\/b>/);
  assert.match(d.observacoes_status, /abr\/mai\/jun 2026/);
  assert.match(d.observacoes_status, /Concentração: 2 unidades concentram 60,8%/);
  assert.ok(d.proximos_passos.some((p) => /permanência da taxa extra/.test(p)));
  assert.ok(d.proximos_passos.at(-1).includes('19/08/2026'));
  assert.equal(d.analista, 'Analista Fictício'); // assina o analista (§8.7)
  assert.equal(R.nomeArquivo(formulario.razao_social, 'AC-2026-07-20-03'), 'Retorno_Analise_Credito_Residencial_Exemplo_Cia_AC-2026-07-20-03.pdf');
});

test('espólio aparece na tabela de exclusões com o débito', () => {
  const { r, ctx } = caso({ espolios: [{ unidade: 'E-501', nome: 'Espólio Fictício' }] });
  const d = R.montarDados(r, ctx);
  assert.deepEqual(d.unidades_excluidas, [['E-501', 'Espólio (Espólio Fictício): fora do escopo, débito acumulado direcionado ao inventário.', 'R$ 420,00']]);
  assert.ok(d.proximos_passos.some((p) => /inventário/.test(p)));
});

test('resumo executivo e e-mail de entrega no padrão', () => {
  const { r, ctx } = caso();
  const resumo = R.resumoExecutivo(r, ctx).split('\n');
  assert.ok(resumo.length >= 3 && resumo.length <= 5);
  assert.equal(resumo[0], 'APROVADA — 3,00% ADM + R$ 2,00/boleto | 23 UH no escopo.');
  const email = R.emailEntrega(r, ctx, { assinatura: 'Assinatura Fictícia' });
  assert.equal(email.assunto, 'Retorno de Análise de Crédito — Condomínio Residencial Exemplo & Cia');
  assert.equal(email.corpo, 'Prezados,\n\nSegue em anexo o retorno da análise do Condomínio Residencial Exemplo & Cia.\n\nStatus: APROVADA — 3,00% ADM + R$ 2,00/boleto | 23 UH no escopo.\n\nDetalhes e próximos passos no PDF.\n\nAssinatura Fictícia');
});

test('§9.8 o PDF sai sempre com 4 páginas, condensando o texto quando passa', { skip: !temGerador && 'python3 com reportlab não instalado' }, async () => {
  const { r, ctx } = caso();
  const normal = await R.gerarPdf(R.montarDados(r, ctx));
  assert.equal(normal.paginas, 4);
  assert.equal(normal.condensado, 0);
  assert.equal(normal.pdf.subarray(0, 5).toString(), '%PDF-');

  const longo = R.montarDados(r, { ...ctx, ajustesTexto: { observacoes_juridicas: Array.from({ length: 14 }, (_, i) => `Observação ${i + 1}: ${'cláusula da convenção sobre foro, multa e cobrança. '.repeat(5)}`) } });
  const cond = await R.gerarPdf(longo);
  assert.equal(cond.paginas, 4);
  assert.ok(cond.condensado > 0);
  assert.ok(cond.dados.observacoes_juridicas.length <= 6);
});

test('complemento das observações entra depois do texto automático da página 1', () => {
  const { r, ctx } = caso();
  const d = R.montarDados(r, { ...ctx, ajustesTexto: { complemento_status: 'Unidades 108 e 207 recorrentes.' } });
  assert.match(d.observacoes_status, /aprovado.*Unidades 108 e 207 recorrentes\.$/s);
});

test('ressalvas viram frases na página 1 e o espólio da Assertiva sai com o nome do titular', () => {
  const { r, ctx } = caso({ ressalvas: [{ texto: 'Convenção incompleta', justificativa: 'falta a página da multa' }, { texto: 'Ata de contratação exigida', justificativa: 'art. 13' }],
    assertiva: { 'A-101': { resultado: 'espolio', em: '2026-07-20' } } });
  const d = R.montarDados(r, ctx);
  assert.match(d.observacoes_status, /Convenção incompleta\. Ata de contratação exigida\./);
  assert.ok(JSON.stringify(d).includes('Espólio confirmado na consulta Assertiva — titular Titular Fictício 1: fora do escopo'));
});

test('sem CNPJ: o retorno diz que ainda não tem e põe o prazo de 90 dias nos próximos passos', () => {
  const { r, ctx } = caso();
  const d = R.montarDados(r, { ...ctx, formulario: { ...formulario, cnpj: '', sem_cnpj: true } });
  assert.equal(d.cnpj, 'Ainda não tem (em constituição)');
  assert.ok(d.proximos_passos.some((p) => /Regularizar o CNPJ do condomínio em até 90 dias/.test(p)));
});

test('memória de cálculo mostra só os meses considerados e diz quantos foram', () => {
  const { r, ctx } = caso();
  const r2 = { ...r, meses: r.meses.map((m, i) => (i === 1 ? { ...m, inadimplentes: 0, valor: 0, pct: 0, fora_da_media: true } : m)) };
  const d = R.montarDados(r2, ctx);
  assert.equal(d.meses_base.length, 2); // o mês sem inadimplência não aparece
  assert.equal(d.rotulo_media, 'MÉDIA (2 MESES CONSIDERADOS)');
  assert.match(d.nota_dias, /^Média de 2 meses considerados \(/);
  assert.match(d.observacoes_status, /\(2 meses considerados\)/);
});

test('próximos passos da skill somam os obrigatórios do portal (CNPJ, validade) sem repetir', () => {
  const { r, ctx } = caso();
  const d = R.montarDados(r, { ...ctx, formulario: { ...formulario, sem_cnpj: true }, ajustesTexto: { proximos_passos: ['Apresentar a ata de assembleia.', 'Assinar o contrato dentro da validade.'] } });
  assert.equal(d.proximos_passos[0], 'Apresentar a ata de assembleia.');
  assert.ok(d.proximos_passos.some((p) => /Regularizar o CNPJ/.test(p)));
  assert.equal(d.proximos_passos.filter((p) => /validade/.test(p)).length, 1); // a skill já trouxe: não repete
});

test('e-mail de entrega: a cor segue o status (reprovada vermelha, ressalvas amarela, aprovada verde)', () => {
  const { r, ctx } = caso();
  const { montarHtml } = require('../server/email-layout');
  const det = (codigo, rotulo, motivos = []) => R.emailDetalhes({ ...r, status: { codigo, rotulo, motivos } }, ctx, { anexo: 'Ficticio.pdf' });
  const rep = det('reprovada', 'REPROVADA', [{ codigo: 'inadimplencia', texto: 'Inadimplência média acima do limite.' }]);
  assert.equal(rep.tom, 'alerta');
  assert.equal(rep.etiqueta, 'Análise reprovada');
  assert.deepEqual(rep.aviso, { tom: 'alerta', titulo: 'Motivo da reprovação', texto: 'Inadimplência média acima do limite.' });
  assert.match(montarHtml({ tipo: 'credito', titulo: 'Retorno', texto: '', detalhes: rep }, {}).html, /#FDECEC/);
  assert.equal(det('ressalvas', 'APROVADA COM RESSALVAS', [{ texto: 'Convenção sem registro.' }]).tom, 'acao');
  const ok = det('aprovada', 'APROVADA');
  assert.equal(ok.tom, 'ok');
  assert.equal(ok.aviso, null);
  assert.match(ok.intro, /Residencial Exemplo & Cia/);
});

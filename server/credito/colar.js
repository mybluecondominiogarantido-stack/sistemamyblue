'use strict';
/*
 * Relatório de inadimplência colado de uma planilha (Excel, Google Sheets, CSV): o analista lança os lançamentos
 * enquanto a leitura automática dos PDFs não está ligada, e confere o que a IA extraiu.
 *
 * Uma linha por lançamento, separada por tabulação ou ponto e vírgula:
 *   unidade ; titular ; CPF/CNPJ ; competência ; tipo ; valor [; vencimento]
 * Cabeçalho opcional. Competência em mm/aaaa ou dd/mm/aaaa; valor em "1.840,00" ou "1840.00".
 * Tipo: ordinária, extra, água/gás, acordo, multa, juros, correção, honorários, fundo de reserva (o resto vira "outro").
 */
const { normalizarCompetencia, normalizarData } = require('./motor');

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function tipoDe(t) {
  const s = semAcento(t);
  if (!s || /ordin|condominial|cota|taxa de condom/.test(s)) return 'ordinaria';
  if (/extra|obra|chamada/.test(s)) return 'extra';
  if (/agua|gas/.test(s)) return 'agua_gas';
  if (/acordo|parcel/.test(s)) return 'acordo';
  if (/multa/.test(s)) return 'multa';
  if (/juro/.test(s)) return 'juros';
  if (/corre|atualiza/.test(s)) return 'correcao';
  if (/honor/.test(s)) return 'honorarios';
  if (/fundo/.test(s)) return 'fundo_reserva';
  return 'outro';
}

function valorDe(v) {
  let s = String(v || '').replace(/[R$\s]/g, '');
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.900 = mil e novecentos
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/* devolve { unidades, erros, linhas } no formato que o motor recebe em relatorio.unidades */
function lerRelatorioColado(texto) {
  const linhas = String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const erros = [];
  const porUnidade = new Map();
  let lidas = 0;
  linhas.forEach((linha, i) => {
    const c = linha.split(linha.includes('\t') ? '\t' : ';').map((x) => x.trim());
    if (i === 0 && /unidade/i.test(c[0]) && !normalizarCompetencia(c[3])) return; // cabeçalho
    const [unidade, titular, documento, comp, tipo, valor, venc] = c;
    const competencia = normalizarCompetencia(comp);
    const v = valorDe(valor);
    if (!unidade || !competencia || v === null) {
      erros.push(`Linha ${i + 1}: ${!unidade ? 'falta a unidade' : !competencia ? `competência "${comp || ''}" não reconhecida` : `valor "${valor || ''}" não reconhecido`}.`);
      return;
    }
    if (!porUnidade.has(unidade)) porUnidade.set(unidade, { unidade, titular: titular || '', documento: documento || '', lancamentos: [] });
    const u = porUnidade.get(unidade);
    if (!u.titular && titular) u.titular = titular;
    if (!u.documento && documento) u.documento = documento;
    u.lancamentos.push({ competencia, vencimento: normalizarData(venc) || (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(comp) ? normalizarData(comp) : null), tipo: tipoDe(tipo), valor: v });
    lidas++;
  });
  return { unidades: [...porUnidade.values()], erros, linhas: lidas };
}

module.exports = { lerRelatorioColado, tipoDe, valorDe };

'use strict';
/*
 * Leitura do PDF do Retorno de Análise de Crédito (modelo de 4 páginas, o mesmo gerador do portal) para abrir a
 * implantação de análises feitas antes do portal. O layout é fixo, então a leitura é por regras, sem IA.
 * O texto sai do pdftotext (poppler-utils): com -layout para os campos da página 1 e 2; corrido para a página 4,
 * onde as observações jurídicas e os próximos passos ficam em colunas.
 */
const { execFile } = require('child_process');

function pdftotext(buf, args) {
  return new Promise((ok, falha) => {
    const p = execFile(process.env.PDFTOTEXT || 'pdftotext', [...args, '-enc', 'UTF-8', '-', '-'], { maxBuffer: 20 * 1024 * 1024, timeout: 30000 }, (e, saida) => {
      if (e) return falha(e.code === 'ENOENT' ? new Error('O leitor de PDF (pdftotext) não está instalado no servidor.') : new Error('Não deu para ler o PDF.'));
      ok(saida);
    });
    p.stdin.on('error', () => {});
    p.stdin.end(buf);
  });
}

async function extrair(buf) {
  const [layout, corrido] = await Promise.all([pdftotext(buf, ['-layout']), pdftotext(buf, [])]);
  return { layout, corrido };
}

const MESES = { janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const pad = (n) => String(n).padStart(2, '0');
const limpo = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const numero = (s) => (s == null ? null : Number(String(s).replace(/\./g, '').replace(',', '.')));

/* "20/07/2026" ou "20 de outubro de 2026" → "2026-07-20" */
function data(s) {
  let m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || '');
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = /(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i.exec(s || '');
  if (m && MESES[m[2].toLowerCase()]) return `${m[3]}-${pad(MESES[m[2].toLowerCase()])}-${pad(m[1])}`;
  return null;
}

/* texto entre um título e o próximo marcador */
function trecho(texto, de, ate) {
  const i = texto.indexOf(de);
  if (i < 0) return '';
  const resto = texto.slice(i + de.length);
  const fim = ate.map((x) => resto.indexOf(x)).filter((x) => x >= 0);
  return fim.length ? resto.slice(0, Math.min(...fim)) : resto;
}

function lerRetorno({ layout, corrido }) {
  const paginas = layout.split('\f');
  const p1 = paginas[0] || '';
  const tudo = layout;
  const reconhecido = /Retorno de Análise de Crédito/.test(p1) && /Protocolo\s+AC-/.test(p1) && /PRECIFICA[ÇC][ÃA]O/.test(p1);
  if (!reconhecido) return { reconhecido: false };
  const avisos = [];
  const pega = (re, t = p1) => { const m = re.exec(t); return m ? m[1].trim() : ''; };
  const cab = /Protocolo\s+(AC-[\w-]+)\s*•\s*([^\n]+)/.exec(p1);
  const r = {
    reconhecido: true,
    protocolo: cab ? cab[1] : '',
    data: cab ? data(cab[2]) : null,
    razao_social: pega(/Raz[ãa]o social\s{2,}([^\n]+)/),
    cnpj: pega(/CNPJ\s{2,}([\d./-]{14,18})/),
    executivo: pega(/Executivo solicitante\s{2,}([^\n]+)/),
  };
  const status = trecho(p1, 'STATUS DA ANÁLISE', ['Faixa aplicada', 'OBSERVAÇÕES']);
  r.resultado = /REPROVADA/.test(status) ? 'reprovada' : /APROVADA\s+COM/.test(status) ? 'ressalvas' : /APROVADA/.test(status) ? 'aprovada' : /PENDENTE/.test(status) ? 'pendente' : null;
  const taxa = /(\d{1,2},\d{1,2})\s*%/.exec(trecho(p1, 'Taxa administrativa', ['Valor do boleto', 'Faixa aplicada']));
  r.taxa_adm = taxa ? numero(taxa[1]) : null;
  const bol = /R\$\s*([\d.]+,\d{2})/.exec(trecho(p1, 'Valor do boleto', ['Faixa aplicada', 'OBSERVAÇÕES']));
  r.boleto = bol ? numero(bol[1]) : null;
  // base de cálculo da página 2: "Receita bruta = 24 UH × R$ 1.840,00" (portal) ou "Receita bruta: 32 UH × R$ 404,70 (Forms)"
  const base = /Receita bruta\s*[:=]\s*(\d+)\s*UH\s*[×xX]\s*R\$\s*([\d.]+,\d{2})/.exec(tudo.replace(/\s+/g, ' '));
  const escopo = /considera\s+(\d+)\s+das\s+(\d+)\s+unidades/.exec(limpo(tudo));
  r.uh_escopo = base ? Number(base[1]) : null;
  r.uh_total = escopo ? Number(escopo[2]) : r.uh_escopo;
  r.taxa_ordinaria = base ? numero(base[2]) : null;
  const obs = limpo(trecho(p1, 'OBSERVAÇÕES DA ANÁLISE', ['MyBlue Condomínio Garantido |']));
  r.observacoes = obs;
  r.tipo_contratacao = /portabilidade/i.test(obs) ? 'portabilidade' : /nova contrata[çc][ãa]o/i.test(obs) ? 'nova' : '';
  const corr = limpo(corrido);
  r.desconto_tipo = /sem desconto/i.test(corr) ? 'nenhum' : null;
  const sind = /S[íi]ndico\s+(profissional|cond[ôo]mino|org[âa]nico)([^.;]*)/i.exec(corr);
  if (sind) {
    r.sindico_tipo = /profissional/i.test(sind[1]) ? 'profissional' : 'condomino';
    const resto = sind[2] + ' ' + sind[0];
    r.sindico_isencao = /sem isen[çc][ãa]o|n[ãa]o [ée] isento/i.test(resto) ? 'nao' : /isen[çc][ãa]o parcial/i.test(resto) ? 'parcial' : /isen[çc][ãa]o integral|isento/i.test(resto) ? 'integral' : null;
  }
  // cidade/UF só aparece no texto das observações (conferir)
  const cid = /([A-ZÀ-Ý][A-Za-zÀ-ÿ'. ]{2,40}?)\/([A-Z]{2})\b/.exec(obs);
  if (cid) { r.cidade = cid[1].trim(); r.uf = cid[2]; avisos.push('Cidade e UF vieram do texto das observações: confira.'); }
  // página 4 (texto corrido): observações jurídicas e próximos passos
  const p4 = corrido.split('\f')[3] || '';
  const jur = trecho(p4, 'OBSERVAÇÕES JURÍDICAS / DOCUMENTAIS', ['| PRÓXIMOS PASSOS']).trim().split(/\n\s*\n/)[0] || '';
  r.observacoes_juridicas = jur.split(/\n?•/).map(limpo).filter(Boolean);
  const passos = trecho(p4, '| PRÓXIMOS PASSOS', ['Protocolo:']);
  r.proximos_passos = passos.split(/\n\s*\d{1,2}\s*\n/).map(limpo).filter(Boolean);
  for (const [campo, rotulo] of [['protocolo', 'protocolo'], ['data', 'data da análise'], ['razao_social', 'razão social'], ['resultado', 'status'], ['taxa_adm', 'taxa administrativa'], ['boleto', 'valor do boleto']]) {
    if (!r[campo]) avisos.push(`Não achei ${rotulo} no PDF.`);
  }
  if (!r.uh_total) avisos.push('Não achei o número de unidades: preencha no formulário.');
  r.avisos = avisos;
  return r;
}

module.exports = { extrair, lerRetorno, data };

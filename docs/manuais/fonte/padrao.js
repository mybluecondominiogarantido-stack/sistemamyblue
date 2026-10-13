'use strict';
/*
 * Padrão visual dos documentos da MyBlue (o mesmo do Manual do Setor de Análise de Crédito):
 * papel timbrado em todas as páginas, capa centralizada, sumário por partes, "Capítulo N" com barra,
 * seções numeradas (N.M), tabelas com cabeçalho azul, caixas de destaque e histórico de versões.
 *
 * O timbrado (fonte/img/timbrado.jpg) é aplicado por baixo de cada página depois de gerar o PDF
 * (fonte/timbrar.py, com pypdf): o Chromium não repete imagens de fundo de página inteira.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const FONTE = __dirname;
const TIMBRADO = path.join(FONTE, 'img', 'timbrado.jpg');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

const CSS = `
@page { size: A4; margin: 36mm 30mm 33mm 30mm; }
@page capa { margin: 0; }
:root { --escuro:#0f5e73; --azul:#1b9bbc; --azul-bg:#eaf5f9; --borda:#b9dbe5; --texto:#1d2b30; --suave:#5d7179;
  --verde:#2e7d32; --verde-bg:#e8f4ea; --ambar:#a8650c; --ambar-bg:#fdf3e2; --vermelho:#c62828; --vermelho-bg:#fbe9e9; --roxo:#6d4fb3; --roxo-bg:#f1edfa; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { background: transparent; }
body { font-family: "Liberation Sans", Arial, Helvetica, sans-serif; color: var(--texto); font-size: 10.4pt; line-height: 1.38; margin: 0; }
p { margin: 0 0 2.6mm; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1mm; }
ul li::marker { color: var(--azul); }
ol li::marker { color: var(--azul); font-weight: 700; }
a { color: var(--escuro); }
b, strong { color: inherit; }

/* capítulos e seções */
body { counter-reset: cap; }
.capitulo { break-before: page; counter-reset: sec; }
.cab-cap { border-left: 1.5mm solid var(--azul); padding: .5mm 0 .5mm 3.2mm; margin: 0 0 4mm; break-after: avoid; }
.cab-cap .rot { color: var(--azul); font-weight: 700; font-size: 14pt; line-height: 1.15; }
.cab-cap h1 { color: var(--escuro); font-weight: 700; font-size: 17pt; line-height: 1.18; margin: 0; }
h2 { counter-increment: sec; color: var(--escuro); font-size: 13pt; font-weight: 700; margin: 6mm 0 2.6mm; padding-left: 2.6mm; border-left: 1.1mm solid var(--azul); line-height: 1.2; break-after: avoid; }
h2::before { content: counter(cap) "." counter(sec) " "; }
h2.sem-num::before { content: none; }
h3 { color: var(--escuro); font-size: 11pt; font-weight: 700; margin: 4mm 0 1.8mm; break-after: avoid; }
h4 { color: var(--azul); font-size: 10.4pt; font-weight: 700; margin: 3.6mm 0 1.2mm; break-after: avoid; }
p.onde { font-size: 9.4pt; color: var(--suave); margin: 0 0 1.5mm; break-after: avoid; }
.intro { font-size: 10.6pt; }

/* partes e sumário */
.parte { break-before: page; break-after: page; text-align: center; padding-top: 0; }
.parte .rot { color: var(--azul); font-weight: 700; font-size: 12pt; letter-spacing: .3mm; }
.parte h1 { color: var(--escuro); font-size: 21pt; margin: 2mm 0 0; }
.sumario h1.tit { color: var(--escuro); font-size: 22pt; margin: 0 0 4mm; }
.sumario .p { color: var(--azul); font-weight: 700; font-size: 10.6pt; margin: 4mm 0 1.4mm; text-transform: uppercase; }
.sumario ol { list-style: none; padding-left: 4mm; margin: 0; }
.sumario li { margin: 0 0 .9mm; font-size: 10.4pt; }
.sumario li span { color: var(--azul); font-weight: 700; margin-right: 1.6mm; }

/* tabelas */
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4.5mm; font-size: 9.2pt; background: #fff; }
tr { break-inside: avoid; }
th { background: var(--azul); color: #fff; font-weight: 700; padding: 1.8mm 2.4mm; text-align: center; border: 1px solid var(--borda); }
td { padding: 1.8mm 2.4mm; border: 1px solid var(--borda); vertical-align: top; background: #fff; }
tbody tr:nth-child(odd) td { background: #f7fbfd; }
table.abas td:first-child { width: 30%; }
thead { display: table-header-group; }

/* caixas */
.caixa { border: 1px solid var(--azul); border-left: 1.4mm solid var(--azul); background: var(--azul-bg); padding: 2.6mm 3.6mm; margin: 3mm 0 4mm; break-inside: avoid; font-size: 10pt; }
.caixa .tit { color: var(--azul); font-weight: 700; margin-right: 1.2mm; }
.caixa.atencao { border-color: #e0a03a; background: var(--ambar-bg); }
.caixa.atencao .tit { color: var(--ambar); }
.caixa.critico { border-color: #d9534f; background: var(--vermelho-bg); }
.caixa.critico .tit { color: var(--vermelho); }
.caixa.ok { border-color: #5aa463; background: var(--verde-bg); }
.caixa.ok .tit { color: var(--verde); }

/* figuras */
figure { margin: 2.5mm auto 4mm; break-inside: avoid; text-align: center; }
figure img { max-width: 100%; max-height: 92mm; border: 1px solid var(--borda); background: #fff; }
figcaption { font-size: 8.4pt; color: var(--suave); margin-top: 1.4mm; font-style: italic; }
.pequena img { max-height: 70mm; }
.lado { display: flex; gap: 5mm; align-items: flex-start; break-inside: avoid; }
.lado > div { flex: 1; min-width: 0; }
.lado > figure { flex: 0 0 40%; margin-top: 0; }
.grade2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 6mm; }
.grade2 > div { break-inside: avoid; min-width: 0; }

/* passos numerados */
ol.passos { counter-reset: p; list-style: none; padding: 0; margin: 1.6mm 0 3.6mm; }
ol.passos li { counter-increment: p; position: relative; padding-left: 8.5mm; margin-bottom: 1.8mm; min-height: 6mm; }
ol.passos li::before { content: counter(p); position: absolute; left: 0; top: -.2mm; width: 5.8mm; height: 5.8mm; border-radius: 50%; background: var(--azul); color: #fff; font-weight: 700; font-size: 8.8pt; display: flex; align-items: center; justify-content: center; }

/* etiquetas */
.etq { display: inline-block; font-size: 8pt; font-weight: 700; border-radius: 1mm; padding: .2mm 1.8mm; white-space: nowrap; color: #fff; }
.etq.azul { background: var(--azul); } .etq.ambar { background: #e39a2d; } .etq.cinza { background: #8fa3aa; }
.etq.verde { background: #3b8f45; } .etq.vermelha { background: var(--vermelho); } .etq.escuro { background: var(--escuro); } .etq.roxo { background: var(--roxo); }
.sim { color: var(--verde); font-weight: 700; } .nao { color: #a9bcc3; }
.cartao-rapido { border: 1px solid var(--borda); border-left: 1.4mm solid var(--azul); padding: 2.6mm 3.6mm; background: #fff; break-inside: avoid; }
.cartao-rapido h3 { margin-top: 0; }

/* capa */
.capa { page: capa; height: 297mm; position: relative; break-after: page; }
.capa .bloco { position: absolute; left: 25mm; right: 25mm; top: 92mm; text-align: center; }
.capa .chapeu { color: var(--azul); font-weight: 700; font-size: 12.5pt; text-transform: uppercase; letter-spacing: .2mm; }
.capa h1 { color: var(--escuro); font-size: 27pt; margin: 4mm 0 3mm; line-height: 1.12; }
.capa .sub { color: var(--escuro); font-size: 13pt; }
.capa .linha { width: 58mm; height: .6mm; background: var(--azul); margin: 13mm auto 4mm; }
.capa .versao { color: #555; font-size: 10.6pt; }
.capa .uso { color: #555; font-size: 9pt; margin-top: 1.5mm; }

.fim { text-align: center; margin-top: 12mm; break-inside: avoid; }
.fim .t { color: var(--azul); font-weight: 700; font-size: 13pt; }
.fim .s { color: var(--suave); font-size: 9.4pt; margin-top: 1.5mm; }
.proxima { font-style: italic; color: var(--suave); font-size: 9.4pt; }
code, pre { font-family: "DejaVu Sans Mono", monospace; font-size: 8.8pt; }
pre { background: #f7fbfd; border: 1px solid var(--borda); padding: 3mm; white-space: pre-wrap; }
`;

/* blocos */
const fig = (img, legenda, largura = 100, cls = '') => `<figure class="${cls}" style="width:${largura}%"><img src="img/${img}.jpg"><figcaption>${legenda}</figcaption></figure>`;
const passos = (lista) => `<ol class="passos">${lista.map((p) => `<li>${p}</li>`).join('')}</ol>`;
const caixa = (cls, titulo) => (t) => `<div class="caixa ${cls}"><span class="tit">${titulo}</span>${t}</div>`;
const dica = caixa('', 'Dica');
const atencao = caixa('atencao', 'Atenção');
const tabela = (cab, linhas, cls = '') => `<table class="${cls}"><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const etq = (t, cor) => `<span class="etq ${cor}">${t}</span>`;

/*
 * Monta um documento no padrão. estrutura: lista de itens
 *   { parte: 'Título da parte' }                 → página de abertura da parte
 *   { cap: 'Título', html: '...' }               → capítulo numerado
 * opções: { chapeu, titulo, sub, versao, data, uso, historico: [[versão, data, alterações]], proxima }
 */
function documento(o, estrutura) {
  let n = 0;
  let p = 0;
  const sumario = [];
  let corpo = '';
  for (const item of estrutura) {
    if (item.parte) {
      const rom = ROMANOS[p++];
      sumario.push({ parte: `Parte ${rom} — ${item.parte}`, caps: [] });
      corpo += `<section class="parte"><div class="rot">PARTE ${rom}</div><h1>${item.parte}</h1></section>`;
    } else {
      n++;
      if (!sumario.length) sumario.push({ parte: null, caps: [] });
      sumario[sumario.length - 1].caps.push([n, item.cap]);
      corpo += `<section class="capitulo" style="counter-set: cap ${n}"><div class="cab-cap"><div class="rot">Capítulo ${n}</div><h1>${item.cap}</h1></div>${item.html}</section>`;
    }
  }
  const capa = `<section class="capa"><div class="bloco"><div class="chapeu">${o.chapeu}</div><h1>${o.titulo}</h1><div class="sub">${o.sub || 'MyBlue Condomínio Garantido'}</div>
    <div class="linha"></div><div class="versao">Versão ${o.versao} &nbsp;•&nbsp; ${o.data}</div><div class="uso">${o.uso || 'Documento de uso interno &nbsp;•&nbsp; Confidencial'}</div></div></section>`;
  const sum = o.semSumario ? '' : `<section class="sumario"><h1 class="tit">Sumário</h1>${sumario.map((s) => `${s.parte ? `<div class="p">${s.parte}</div>` : ''}<ol>${s.caps.map(([i, t]) => `<li><span>${i}.</span>${t}</li>`).join('')}</ol>`).join('')}</section>`;
  const fim = `<div class="fim"><div class="t">— Fim do ${o.fim || 'documento'} —</div><div class="s">MyBlue Condomínio Garantido &nbsp;•&nbsp; Documento de uso interno &nbsp;•&nbsp; Confidencial</div></div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(o.titulo.replace(/<[^>]+>/g, ''))}</title><style>${CSS}${o.css || ''}</style></head><body>${capa}${sum}${corpo}${fim}</body></html>`;
}

/* capítulo padrão de manutenção e versões */
function capVersoes(o) {
  return {
    cap: o.titulo || 'Manutenção e controle de versão deste documento',
    html: `${o.intro ? `<p>${o.intro}</p>` : ''}
    ${o.quando ? `<h2>Quando atualizar</h2><ul>${o.quando.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
    ${o.como ? `<h2>Como atualizar</h2>${passos(o.como)}` : ''}
    <h2>Histórico de versões</h2>
    ${tabela(['Versão', 'Data', 'Alterações'], o.historico.map(([v, d, a]) => [`<div style="text-align:center">${v}</div>`, `<div style="text-align:center;white-space:nowrap">${d}</div>`, a]))}
    ${o.proxima ? `<p class="proxima">${o.proxima}</p>` : ''}`,
  };
}

/* ---------- PDF ---------- */
function playwright() {
  try { return require('playwright'); } catch { return require(execSync('npm root -g').toString().trim() + '/playwright'); }
}

/* gera o PDF do HTML e aplica o timbrado por baixo de cada página */
async function pdfTimbrado(page, html, destino, { timbrado = true } = {}) {
  const tmpHtml = path.join(FONTE, `_tmp_${process.pid}.html`);
  const tmpPdf = destino + '.conteudo.pdf';
  fs.writeFileSync(tmpHtml, html);
  try {
    await page.goto('file://' + tmpHtml, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: timbrado ? tmpPdf : destino, format: 'A4', printBackground: true, preferCSSPageSize: true });
    if (timbrado) {
      execFileSync('python3', [path.join(FONTE, 'timbrar.py'), tmpPdf, await fundo(page), destino], { stdio: 'inherit' });
      fs.unlinkSync(tmpPdf);
    }
  } finally { fs.unlinkSync(tmpHtml); }
}

/* página A4 só com o timbrado (gerada uma vez por execução) */
let fundoPdf = null;
async function fundo(page) {
  if (fundoPdf && fs.existsSync(fundoPdf)) return fundoPdf;
  fundoPdf = path.join(require('os').tmpdir(), `timbrado-${process.pid}.pdf`);
  const p = await page.context().browser().newPage();
  await p.setContent(`<!doctype html><html><head><style>@page{size:A4;margin:0}html,body{margin:0}img{display:block;width:210mm;height:297mm}</style></head><body><img src="data:image/jpeg;base64,${fs.readFileSync(TIMBRADO).toString('base64')}"></body></html>`);
  await p.pdf({ path: fundoPdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await p.close();
  return fundoPdf;
}

module.exports = { CSS, esc, fig, passos, dica, atencao, caixa, tabela, etq, documento, capVersoes, pdfTimbrado, playwright, FONTE };

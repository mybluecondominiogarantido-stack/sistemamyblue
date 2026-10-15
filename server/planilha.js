'use strict';
/*
 * Lê a primeira aba de uma planilha enviada: .xlsx (Excel) ou .csv (ponto e vírgula ou vírgula).
 * Devolve linhas de texto (array de arrays). Sem dependências: o .xlsx é um zip com XML dentro.
 * Números ficam como o Excel guarda (datas viram o número de série; quem lê converte).
 */
const zlib = require('zlib');
const { lerCsv, decodificar } = require('./carteira');

/* arquivos de dentro do zip: Map nome → Buffer (só os que interessam) */
function abrirZip(buf, quer) {
  // fim do diretório central: assinatura 0x06054b50, procurada de trás para frente
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error('Arquivo .xlsx inválido.');
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const saida = new Map();
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Arquivo .xlsx inválido.');
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const lenNome = buf.readUInt16LE(p + 28);
    const lenExtra = buf.readUInt16LE(p + 30);
    const lenCom = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + lenNome);
    p += 46 + lenNome + lenExtra + lenCom;
    if (!quer(nome)) continue;
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.subarray(ini, ini + tamComp);
    saida.set(nome, metodo === 0 ? dados : zlib.inflateRawSync(dados));
  }
  return saida;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desescapar = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m);
const textos = (xml) => desescapar([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
const coluna = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

function lerXlsx(buf) {
  const z = abrirZip(buf, (n) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(n));
  const wb = (z.get('xl/workbook.xml') || '').toString();
  const rels = (z.get('xl/_rels/workbook.xml.rels') || '').toString();
  // primeira aba (na ordem das abas, não do arquivo)
  const rid = (wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/) || [])[1];
  let alvo = rid && (rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`)) || [])[1];
  if (alvo) alvo = 'xl/' + alvo.replace(/^\/?xl\//, '').replace(/^\//, '');
  const folha = (z.get(alvo) || [...z.entries()].find(([n]) => n.startsWith('xl/worksheets/'))?.[1] || '').toString();
  if (!folha) throw new Error('Não achei nenhuma aba na planilha.');
  const comp = [...(z.get('xl/sharedStrings.xml') || '').toString().matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1]));
  const linhas = [];
  for (const [, attrs, corpo] of folha.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = +((attrs.match(/\br="(\d+)"/) || [])[1] || linhas.length + 1) - 1;
    const linha = [];
    for (const [, a, c] of corpo.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = (a.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const tipo = (a.match(/\bt="(\w+)"/) || [])[1];
      const v = ((c || '').match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = '';
      if (tipo === 's') val = comp[+v] ?? '';
      else if (tipo === 'inlineStr') val = textos(c || '');
      else if (v != null) val = desescapar(v);
      linha[ref ? coluna(ref) : linha.length] = val;
    }
    linhas[r] = Array.from(linha, (x) => (x == null ? '' : String(x)));
  }
  return Array.from(linhas, (l) => l || []);
}

/* .xlsx (começa com "PK") ou texto CSV */
function lerPlanilha(buf) {
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b) return lerXlsx(buf);
  return lerCsv(decodificar(buf));
}

module.exports = { lerPlanilha, lerXlsx, abrirZip };

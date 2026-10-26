'use strict';
/* Leitura de planilha (node --test): limites contra arquivo preparado para derrubar o servidor. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lerPlanilha } = require('../server/planilha');
const { criarZip } = require('../server/zip');

const WB = '<workbook><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>';
const RELS = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>';
const xlsx = (linhas) => criarZip([
  { nome: 'xl/workbook.xml', dados: WB },
  { nome: 'xl/_rels/workbook.xml.rels', dados: RELS },
  { nome: 'xl/worksheets/sheet1.xml', dados: `<worksheet><sheetData>${linhas}</sheetData></worksheet>` },
]);
const cel = (ref, v) => `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;

test('lê a planilha normal, com células e linhas só de formatação no fim da aba', () => {
  const linhas = lerPlanilha(xlsx(`<row r="1">${cel('A1', 'Nome')}${cel('B1', 'UF')}<c r="XFD1" s="3"/></row>`
    + `<row r="2">${cel('A2', 'Ana')}<c r="B2" s="1"/></row><row r="1048576"><c r="A1048576" s="2"/></row>`));
  assert.deepEqual(linhas, [['Nome', 'UF'], ['Ana', '']]);
});

test('recusa célula com valor na linha 1.000.000 ou na coluna XFD', () => {
  assert.throws(() => lerPlanilha(xlsx(`<row r="1">${cel('A1', 'x')}</row><row r="1000000">${cel('A1000000', 'x')}</row>`)), /grande demais/);
  assert.throws(() => lerPlanilha(xlsx(`<row r="1">${cel('XFD1', 'x')}</row>`)), /grande demais/);
});

test('recusa zip que descompacta além do limite', () => {
  // ~210 MB de espaços viram poucos KB compactados
  const bomba = criarZip([
    { nome: 'xl/workbook.xml', dados: WB },
    { nome: 'xl/_rels/workbook.xml.rels', dados: RELS },
    { nome: 'xl/worksheets/sheet1.xml', dados: Buffer.alloc(210 * 1024 * 1024, 0x20) },
  ]);
  assert.ok(bomba.length < 2 * 1024 * 1024);
  assert.throws(() => lerPlanilha(bomba), /grande demais/);
});

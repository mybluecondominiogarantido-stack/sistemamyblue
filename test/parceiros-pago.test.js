'use strict';
/* Prestação de Contas — Comissão de Parceiros: o relatório marcado como pago não muda (node --test). Dados fictícios. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const { igual, mesmosValores } = require('../server/parceiros-pago');

let servidor, base, ctx, admin, ana, gil;
const ids = {};

const HTML = `<!DOCTYPE html><html><head><title>MyBlue — Prestação de Contas</title></head><body><script>
var SHEET_URL_BUILTIN = "https://script.google.com/macros/s/AAA/exec";
</script></body></html>`;

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (cookie) headers.cookie = cookie;
    let body;
    if (corpo !== undefined) {
      if (typeof corpo === 'string') { body = corpo; headers['content-type'] ||= 'text/plain'; } else { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
    }
    const r = await fetch(base + url, { method: metodo, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: r.status, json, texto };
  };
}
async function entrar(email, senha) {
  const c = cliente();
  const r = await c('POST', '/api/auth/login', { email, senha });
  assert.equal(r.status, 200, r.texto);
  return c;
}
async function criarPessoa(nome, email) {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel: 'usuario', senha: 'Senha1234', modulos: ['parceiros'] });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}

const gravar = (c, sheet, item) => c('POST', '/api/gas/parceiros', JSON.stringify({ sheet, action: 'upsert', item }), { headers: { 'content-type': 'text/plain;charset=utf-8' } });
const apagar = (c, sheet, id) => c('POST', '/api/gas/parceiros', JSON.stringify({ sheet, action: 'delete', id }), { headers: { 'content-type': 'text/plain;charset=utf-8' } });
const lanc = (id, ref, condoId, extra = {}) => ({ id, ref, condoId, tsr: '1.500,00', tarifa: '210,00', multa: '35,10', juros: '12,40', encargos: '80,00', correcao: '4,30',
  qtdBoletos: '70', valorBoleto: '', pctBoleto: 10, venda: false, comp: 1, origem: 'pdf', ...extra });
const PAGO_SET = { key: '2026-09_p-alfa', ref: '2026-09', partnerId: 'p-alfa', enviado: true, dataEnvio: '2026-10-09', pago: true, dataPagamento: '2026-10-29', valorPago: '', comp: 1 };

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0 });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');
  assert.equal((await admin('PUT', '/api/admin/modulos/parceiros/arquivo', HTML, { headers: { 'content-type': 'text/html' } })).status, 200);
  assert.equal((await admin('PATCH', '/api/admin/modulos/parceiros', { fonte_dados: 'interno' })).status, 200);
  ana = await criarPessoa('Ana Assistente', 'ana@teste.com');
  gil = await criarPessoa('Gil Gestor', 'gil@teste.com');
  assert.equal((await admin('PUT', '/api/admin/modulos/parceiros/papeis', { papeis: [{ id: 'gestor', nome: 'Gestor' }] })).status, 200);
  assert.equal((await admin('PUT', '/api/admin/modulos/parceiros/acesso', { acessos: [{ usuario_id: ids['ana@teste.com'], papeis: [] }, { usuario_id: ids['gil@teste.com'], papeis: ['gestor'] }] })).status, 200);

  for (const [sheet, item] of [
    ['partners', { id: 'p-alfa', nome: 'Alfa Administradora', uf: 'CE', rate: 10, venda: 'nenhuma', tags: '["recorrencia"]' }],
    ['partners', { id: 'p-beta', nome: 'Beta Gestão', uf: 'PB', rate: 10, venda: 'nenhuma', tags: '["recorrencia"]' }],
    ['condos', { id: 'c-serra', nome: 'Cond. Serra Azul', vinculosJSON: JSON.stringify([{ partnerId: 'p-alfa', rate: 10 }]) }],
    ['condos', { id: 'c-lago', nome: 'Cond. Lago Verde', vinculosJSON: JSON.stringify([{ partnerId: 'p-alfa', rate: 10 }]) }],
    ['condos', { id: 'c-mar', nome: 'Cond. Mar Azul', vinculosJSON: JSON.stringify([{ partnerId: 'p-beta', rate: 5 }, { partnerId: 'p-alfa', rate: 5 }]) }],
    ['condos', { id: 'c-sol', nome: 'Cond. Sol Nascente', vinculosJSON: JSON.stringify([{ partnerId: 'p-beta', rate: 10 }]) }],
    ['entries', lanc('e1', '2026-09', 'c-serra')],
    ['entries', lanc('e2', '2026-09', 'c-mar')],
    ['entries', lanc('e3', '2026-09', 'c-sol')],
    ['entries', lanc('e4', '2026-10', 'c-serra')],
    ['status', PAGO_SET],
  ]) assert.equal((await gravar(admin, sheet, item)).status, 200);
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('comparação dos valores: número com vírgula ou ponto, vazio = 0; origem e pdf não contam', () => {
  assert.equal(igual('1.500,00', 1500), true);
  assert.equal(igual('', 0), true);
  assert.equal(igual('12,40', '12,41'), false);
  assert.equal(igual(false, ''), true);
  assert.equal(igual(true, false), false);
  assert.equal(mesmosValores(lanc('e', '2026-09', 'c'), { ...lanc('e', '2026-09', 'c'), origem: 'dig', pdf: { x: 1 }, tsr: 1500 }), true);
  assert.equal(mesmosValores(lanc('e', '2026-09', 'c'), lanc('e', '2026-09', 'c', { venda: true })), false);
});

test('competência paga: a assistente não altera valor, não inclui condomínio e não apaga', async () => {
  let r = await gravar(ana, 'entries', lanc('e1', '2026-09', 'c-serra', { tsr: '1.900,00' }));
  assert.equal(r.status, 403);
  assert.match(r.json.error, /Alfa Administradora de 09\/2026 já foi paga em 29\/10\/2026/);
  assert.equal((await ctx.registros.obter('parceiros', 'entries', 'e1')).tsr, '1.500,00', 'o valor pago ficou');
  assert.equal((await gravar(ana, 'entries', lanc('e1', '2026-09', 'c-serra', { venda: true }))).status, 403, 'marcar venda também muda o relatório');
  assert.equal((await gravar(ana, 'entries', lanc('e9', '2026-09', 'c-lago'))).status, 403, 'condomínio novo no mês pago');
  assert.equal((await apagar(ana, 'entries', 'e1')).status, 403);
  // condomínio compartilhado: a Alfa (uma das duas) está paga
  assert.equal((await gravar(ana, 'entries', lanc('e2', '2026-09', 'c-mar', { multa: '99,00' }))).status, 403);
  // mudar a competência de um lançamento pago também não
  assert.equal((await gravar(ana, 'entries', lanc('e1', '2026-08', 'c-serra'))).status, 403);
});

test('o que não está pago segue livre; regravar sem mudar valor também', async () => {
  assert.equal((await gravar(ana, 'entries', { ...lanc('e1', '2026-09', 'c-serra'), origem: 'dig', tsr: 1500 })).status, 200, 'a ferramenta regrava o mês inteiro');
  assert.equal((await gravar(ana, 'entries', lanc('e3', '2026-09', 'c-sol', { tsr: '2.000,00' }))).status, 200, 'Beta não está paga');
  assert.equal((await gravar(ana, 'entries', lanc('e4', '2026-10', 'c-serra', { tsr: '1.777,00' }))).status, 200, 'outubro da Alfa não está pago');
  assert.equal((await gravar(ana, 'status', { ...PAGO_SET, key: '2026-10_p-alfa', ref: '2026-10', pago: false, enviado: true, dataPagamento: '' })).status, 200, 'marcar enviado');
});

test('o pagamento marcado não se desfaz nem muda de valor ou data (a assistente pode marcar pago)', async () => {
  let r = await gravar(ana, 'status', { ...PAGO_SET, pago: false, dataPagamento: '' });
  assert.equal(r.status, 403);
  assert.match(r.json.error, /não pode ser desmarcado/);
  assert.equal((await gravar(ana, 'status', { ...PAGO_SET, valorPago: '10,00' })).status, 403);
  assert.equal((await gravar(ana, 'status', { ...PAGO_SET, dataPagamento: '2026-10-30' })).status, 403);
  assert.equal((await apagar(ana, 'status', PAGO_SET.key)).status, 403);
  assert.equal((await gravar(ana, 'status', { ...PAGO_SET, pedido: '010900' })).status, 200, 'outro campo (pedido) pode');
  // marcar pago é livre
  assert.equal((await gravar(ana, 'status', { ...PAGO_SET, key: '2026-09_p-beta', partnerId: 'p-beta', pago: true, dataPagamento: '2026-10-30' })).status, 200);
  assert.equal((await gravar(ana, 'entries', lanc('e3', '2026-09', 'c-sol', { tsr: '2.100,00' }))).status, 403, 'agora a Beta está paga');
});

test('administração e papel Gestor corrigem o que foi pago', async () => {
  assert.equal((await gravar(gil, 'entries', lanc('e1', '2026-09', 'c-serra', { tsr: '1.510,00' }))).status, 200);
  assert.equal((await gravar(admin, 'entries', lanc('e1', '2026-09', 'c-serra'))).status, 200);
  assert.equal((await gravar(gil, 'status', { ...PAGO_SET, pago: false, dataPagamento: '' })).status, 200, 'o Gestor desmarca o pago');
  assert.equal((await gravar(ana, 'entries', lanc('e1', '2026-09', 'c-serra', { tsr: '1.600,00' }))).status, 200, 'desmarcado, a assistente volta a corrigir');
  assert.equal((await gravar(admin, 'status', PAGO_SET)).status, 200);
  assert.equal((await gravar(ana, 'entries', lanc('e1', '2026-09', 'c-serra', { tsr: '1.700,00' }))).status, 403);
});

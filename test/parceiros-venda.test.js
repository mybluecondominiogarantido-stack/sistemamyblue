'use strict';
/* Prestação de Contas — Comissão de Parceiros: aviso da comissão de venda lançada de novo (node --test). Dados fictícios. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const { vendasAnteriores, duplicados, vendaMarcada } = require('../server/parceiros-venda');

let servidor, base, ctx, admin, paula, gil;
const ids = {};
const emails = [];

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
async function criarPessoa(nome, email, extra = {}) {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel: 'usuario', senha: 'Senha1234', ...extra });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}

/* grava como a ferramenta faz (upsert de um objeto, corpo em texto) */
const upsert = (c, sheet, item) => c('POST', '/api/gas/parceiros', JSON.stringify({ sheet, action: 'upsert', item }), { headers: { 'content-type': 'text/plain;charset=utf-8' } });
const avisosDe = async (email) => (await ctx.db.q('SELECT titulo, texto, link FROM notificacoes WHERE usuario_id = $1 ORDER BY id', [ids[email]])).rows;
const lanc = (id, ref, condoId, venda) => ({ id, ref, condoId, tsr: '431,49', tarifa: '44,83', multa: '', juros: '', encargos: '', correcao: '', qtdBoletos: '68', valorBoleto: '', pctBoleto: 10, venda, comp: 1 });

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0,
    portalUrl: 'https://portal.teste', enviarEmail: async (msg) => { emails.push(msg); } });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');

  assert.equal((await admin('PUT', '/api/admin/modulos/parceiros/arquivo', HTML, { headers: { 'content-type': 'text/html' } })).status, 200);
  assert.equal((await admin('PATCH', '/api/admin/modulos/parceiros', { fonte_dados: 'interno' })).status, 200);
  gil = await criarPessoa('Gil Martins', 'gil@teste.com', { modulos: ['parceiros'] });
  paula = await criarPessoa('Paula Souza', 'paula@teste.com');
  const setor = (await admin('GET', '/api/admin/equipes')).json.setores.find((s) => s.nome === 'Parceiros').id;
  assert.equal((await admin('PUT', `/api/admin/equipes/${setor}/membros`, { membros: [{ usuario_id: ids['paula@teste.com'] }] })).status, 200);

  // a base: parceiro com venda no 1º mês; condomínio com venda lançada em 09 (enviada e paga)
  for (const [sheet, item] of [
    ['partners', { id: 'p-alfa', nome: 'Alfa Administradora', uf: 'CE', rate: 10, venda: 'primeiro', vendaPct: 50, vendaBase: 'tsr', tags: '[]' }],
    ['condos', { id: 'c-serraazul', nome: 'Serra Azul', valorBoleto: 3.2, vinculosJSON: JSON.stringify([{ partnerId: 'p-alfa', rate: 10 }]) }],
    ['condos', { id: 'c-lagoverde', nome: 'Cond. Lago Verde', valorBoleto: 3.1, vinculosJSON: JSON.stringify([{ partnerId: 'p-alfa', rate: 10 }]) }],
    ['entries', lanc('e1', '2026-09', 'c-serraazul', true)],
    ['status', { key: '2026-09_p-alfa', ref: '2026-09', partnerId: 'p-alfa', enviado: true, dataEnvio: '2026-10-13', pago: true, dataPagamento: '2026-11-03', comp: 1 }],
  ]) assert.equal((await upsert(admin, sheet, item)).status, 200);
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('regras: venda marcada, mesmo condomínio pelo cadastro ou pelo nome, outra competência', () => {
  assert.equal(vendaMarcada({ venda: true }), true);
  assert.equal(vendaMarcada({ venda: 'true' }), true);
  assert.equal(vendaMarcada({ venda: false }), false);
  assert.equal(vendaMarcada({ venda: '' }), false);
  const condos = [{ id: 'c-a', nome: 'Torre Azul' }, { id: 'c-b', nome: 'Condomínio Residencial Torre Azul' }, { id: 'c-c', nome: 'Torre Azul II' }];
  const entries = [
    { id: '1', ref: '2026-09', condoId: 'c-a', venda: true },
    { id: '2', ref: '2026-10', condoId: 'c-a', venda: false },
    { id: '3', ref: '2026-08', condoId: 'c-c', venda: true },
    { id: '4', ref: '2026-10', condoId: 'c-b', venda: true },
  ];
  assert.deepEqual(vendasAnteriores({ entrada: entries[3], condos, entries }).map((e) => e.id), ['1'], 'o cadastro repetido acha a venda do original; "II" é outro');
  assert.deepEqual(vendasAnteriores({ entrada: { id: '5', ref: '2026-09', condoId: 'c-a', venda: true }, condos, entries }).map((e) => e.id), ['4'], 'a mesma competência não conta');
  assert.deepEqual(duplicados({ id: 'c-b', nome: 'Condomínio Residencial Torre Azul' }, condos).map((c) => c.id), ['c-a']);
  assert.deepEqual(duplicados({ id: 'c-c', nome: 'Torre Azul II' }, condos), []);
});

test('venda marcada de novo no mesmo cadastro: avisa quem salvou e o setor Parceiros, com a competência e o pagamento', async () => {
  emails.length = 0;
  assert.equal((await upsert(gil, 'entries', lanc('e2', '2026-10', 'c-serraazul', true))).status, 200);
  for (const email of ['gil@teste.com', 'paula@teste.com']) {
    const [a] = await avisosDe(email);
    assert.ok(a, `aviso para ${email}`);
    assert.equal(a.titulo, 'Comissão de venda já lançada: Serra Azul');
    assert.match(a.texto, /competência 09\/2026: paga em 03\/11\/2026/);
    assert.match(a.texto, /Desmarque a venda em 10\/2026/);
    assert.equal(a.link, '#/m/parceiros');
  }
  // o lançamento foi gravado (o aviso não barra a ferramenta)
  assert.equal((await ctx.registros.obter('parceiros', 'entries', 'e2')).venda, true);
  // salvar de novo, com a venda ainda marcada, não repete o aviso
  assert.equal((await upsert(gil, 'entries', { ...lanc('e2', '2026-10', 'c-serraazul', true), tsr: '500,00' })).status, 200);
  assert.equal((await avisosDe('paula@teste.com')).length, 1);
});

test('condomínio cadastrado de novo com outro nome: avisa o duplicado e, ao marcar a venda nele, aponta a venda do original', async () => {
  await ctx.db.q('DELETE FROM notificacoes');
  const novo = { id: 'c-condominioresidencialserraazul', nome: 'Condomínio Residencial Serra Azul', valorBoleto: 0.99, vinculosJSON: JSON.stringify([{ partnerId: 'p-alfa', rate: 10 }]) };
  assert.equal((await upsert(gil, 'condos', novo)).status, 200);
  let [a] = await avisosDe('paula@teste.com');
  assert.match(a.titulo, /cadastrado duas vezes: Condomínio Residencial Serra Azul/);
  assert.match(a.texto, /"Serra Azul" \(Alfa Administradora\)/);
  // editar o cadastro não repete
  assert.equal((await upsert(gil, 'condos', { ...novo, valorBoleto: 1.2 })).status, 200);
  assert.equal((await avisosDe('paula@teste.com')).length, 1);

  assert.equal((await upsert(gil, 'entries', lanc('e3', '2026-10', novo.id, true))).status, 200);
  const lista = await avisosDe('paula@teste.com');
  a = lista[lista.length - 1];
  assert.equal(a.titulo, 'Comissão de venda já lançada: Condomínio Residencial Serra Azul');
  assert.match(a.texto, /competência 09\/2026 \(cadastrado como "Serra Azul"\): paga em 03\/11\/2026/);
});

test('primeira venda do condomínio, venda desmarcada e outro condomínio: sem aviso', async () => {
  await ctx.db.q('DELETE FROM notificacoes');
  assert.equal((await upsert(gil, 'entries', lanc('e4', '2026-10', 'c-lagoverde', true))).status, 200);
  assert.equal((await upsert(gil, 'entries', lanc('e5', '2026-11', 'c-lagoverde', false))).status, 200);
  assert.equal((await upsert(gil, 'condos', { id: 'c-lagoazul', nome: 'Lago Azul', vinculosJSON: '[]' })).status, 200);
  assert.deepEqual(await avisosDe('paula@teste.com'), []);
  assert.deepEqual(await avisosDe('gil@teste.com'), []);
});

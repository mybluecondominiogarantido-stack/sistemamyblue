'use strict';
/* Datas da equipe (node --test): nascimento e admissão do cadastro de Pessoas, só para a ferramenta que a administração liberou. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx, admin;

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo) {
    const h = {};
    if (cookie) h.cookie = cookie;
    let body;
    if (typeof corpo === 'string') { body = corpo; h['content-type'] = 'text/html'; }
    else if (corpo !== undefined) { body = JSON.stringify(corpo); h['content-type'] = 'application/json'; }
    const r = await fetch(base + url, { method: metodo, headers: h, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: r.status, json, texto };
  };
}
/* pedido feito pela página isolada: sem cookie, origem "null" */
async function daFerramenta(url) {
  const r = await fetch(base + url, { headers: { origin: 'null' } });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* não é JSON */ }
  return { status: r.status, json };
}
const chaveDa = (html) => JSON.parse(/window\.__MYBLUE__=(\{.*?\});\n/.exec(html)[1]).chave;
const HTML = '<!doctype html><html><head><title>Calendário</title></head><body><script>claude.use(\'db\')</script></body></html>';

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0 });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = cliente();
  assert.equal((await admin('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'Admin1234' })).status, 200);
  for (const slug of ['calendario', 'outra']) {
    assert.equal((await admin('POST', '/api/admin/modulos', { slug, nome: slug, armazenamento: 'compartilhado' })).status, 201);
    assert.equal((await admin('PUT', `/api/admin/modulos/${slug}/arquivo`, HTML)).status, 200);
  }
  const u = await admin('POST', '/api/admin/usuarios', { nome: 'Rita', email: 'rita@teste.com', senha: 'Senha1234', data_nascimento: '1990-05-10', data_admissao: '2024-02-01' });
  assert.equal(u.status, 201, u.texto);
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('sem a liberação da administração, a ferramenta não recebe as datas', async () => {
  const chave = chaveDa((await admin('GET', '/m/calendario/')).texto);
  const r = await daFerramenta(`/t/${chave}/api/db/calendario/equipe`);
  assert.equal(r.status, 403);
  assert.equal(r.json.code, 'not_granted');
});

test('liberada, a ferramenta lê nome, setores, nascimento e admissão de quem está ativo', async () => {
  assert.equal((await admin('PATCH', '/api/admin/modulos/calendario', { datas_equipe: true })).status, 200);
  const chave = chaveDa((await admin('GET', '/m/calendario/')).texto);
  let r = await daFerramenta(`/t/${chave}/api/db/calendario/equipe`);
  assert.equal(r.status, 200);
  const rita = r.json.pessoas.find((p) => p.nome === 'Rita');
  assert.deepEqual({ ...rita, id: undefined }, { id: undefined, nome: 'Rita', setores: [], data_nascimento: '1990-05-10', data_admissao: '2024-02-01' });
  assert.match(rita.id, /^mb-\d+$/);
  // sem e-mail, senha nem foto
  assert.deepEqual(Object.keys(rita).sort(), ['data_admissao', 'data_nascimento', 'id', 'nome', 'setores']);
  // quem sai do portal some da lista
  await ctx.db.q("UPDATE usuarios SET ativo = FALSE WHERE email = 'rita@teste.com'");
  r = await daFerramenta(`/t/${chave}/api/db/calendario/equipe`);
  assert.equal(r.json.pessoas.some((p) => p.nome === 'Rita'), false);
  await ctx.db.q("UPDATE usuarios SET ativo = TRUE WHERE email = 'rita@teste.com'");
});

test('outra ferramenta não lê as datas, nem pela chave dela', async () => {
  const chave = chaveDa((await admin('GET', '/m/outra/')).texto);
  assert.equal((await daFerramenta(`/t/${chave}/api/db/calendario/equipe`)).status, 403);
  assert.equal((await daFerramenta(`/t/${chave}/api/db/outra/equipe`)).status, 403);
});

test('só a administração liga a liberação', async () => {
  await ctx.db.q("UPDATE usuarios SET trocar_senha = FALSE WHERE email = 'rita@teste.com'");
  const rita = cliente();
  assert.equal((await rita('POST', '/api/auth/login', { email: 'rita@teste.com', senha: 'Senha1234' })).status, 200);
  assert.equal((await rita('PATCH', '/api/admin/modulos/outra', { datas_equipe: true })).status, 403);
});

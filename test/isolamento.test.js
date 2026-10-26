'use strict';
/* Ferramenta isolada (node --test): sandbox, chave da ferramenta e o que ela pode pedir ao portal. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx, admin;

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, headers = {}) {
    const h = { ...headers };
    if (cookie) h.cookie = cookie;
    let body;
    if (typeof corpo === 'string') { body = corpo; h['content-type'] ||= 'text/html'; }
    else if (corpo !== undefined) { body = JSON.stringify(corpo); h['content-type'] = 'application/json'; }
    const r = await fetch(base + url, { method: metodo, headers: h, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: r.status, json, texto, headers: r.headers };
  };
}
/* pedido feito pela página isolada: sem cookie, origem "null" */
async function daFerramenta(metodo, url, corpo, headers = {}) {
  const h = { origin: 'null', ...headers };
  let body;
  if (typeof corpo === 'string') body = corpo;
  else if (corpo !== undefined) { body = JSON.stringify(corpo); h['content-type'] = 'application/json'; }
  const r = await fetch(base + url, { method: metodo, headers: h, body, redirect: 'manual' });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* não é JSON */ }
  return { status: r.status, json, texto, headers: r.headers };
}
const chaveDa = (html) => JSON.parse(/window\.__MYBLUE__=(\{.*?\});\n/.exec(html)[1]).chave;

const HTML = '<!doctype html><html><head><title>Isolada</title><script src="https://cdnjs.cloudflare.com/ajax/libs/x/1.0.0/x.min.js"></script></head><body>ok</body></html>';

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
  assert.equal((await admin('POST', '/api/admin/modulos', { slug: 'agenda', nome: 'Agenda', armazenamento: 'compartilhado' })).status, 201);
  assert.equal((await admin('PUT', '/api/admin/modulos/agenda/arquivo', HTML)).status, 200);
  assert.equal((await admin('POST', '/api/admin/modulos', { slug: 'outra', nome: 'Outra', armazenamento: 'compartilhado' })).status, 201);
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('ferramenta nova nasce isolada: sai com sandbox e a chave dela', async () => {
  const lista = (await admin('GET', '/api/modulos')).json.modulos;
  assert.equal(lista.find((m) => m.slug === 'agenda').isolada, true);
  const pag = await admin('GET', '/m/agenda/');
  assert.equal(pag.status, 200);
  const csp = pag.headers.get('content-security-policy');
  assert.match(csp, /^sandbox /);
  assert.doesNotMatch(csp, /allow-same-origin/);
  const chave = chaveDa(pag.texto);
  assert.match(chave, /^agenda\.[0-9a-f]{24}\.[\w-]{32}$/);
  // bibliotecas também vêm pela chave
  assert.match(pag.texto, new RegExp(`src="/t/${chave.replace(/\./g, '\\.')}/cdn/cdnjs/ajax/libs/x/1\\.0\\.0/x\\.min\\.js"`));
});

test('com a chave, a ferramenta lê e grava só os dados dela', async () => {
  const chave = chaveDa((await admin('GET', '/m/agenda/')).texto);
  let r = await daFerramenta('POST', `/t/${chave}/api/armazenamento/agenda`, { set: { compromissos: '[1]' } });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.headers.get('access-control-allow-origin'), 'null');
  assert.equal(r.headers.get('access-control-allow-credentials'), 'true');
  r = await daFerramenta('GET', `/t/${chave}/api/armazenamento/agenda`);
  assert.deepEqual(r.json.dados, { compromissos: '[1]' });
  // quem gravou foi a pessoa da sessão
  assert.equal((await ctx.db.um("SELECT atualizado_por FROM armazenamento WHERE modulo_slug = 'agenda'")).atualizado_por, 1);
  // pré-voo do navegador (CORS)
  r = await daFerramenta('OPTIONS', `/t/${chave}/api/armazenamento/agenda`, undefined, { 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' });
  assert.equal(r.status, 204);
  assert.match(r.headers.get('access-control-allow-headers'), /content-type/);
  // consulta à carteira (como Síndicos e Repasses fazem)
  assert.equal((await daFerramenta('GET', `/t/${chave}/api/carteira`)).status, 200);
});

test('a chave não abre o resto do portal, mesmo sendo de um administrador', async () => {
  const chave = chaveDa((await admin('GET', '/m/agenda/')).texto);
  for (const [metodo, url] of [['GET', '/api/admin/usuarios'], ['GET', '/api/admin/backup'], ['POST', '/api/admin/usuarios'], ['GET', '/api/armazenamento/outra'],
    ['POST', '/api/armazenamento/outra'], ['GET', '/api/tickets'], ['GET', '/api/auth/eu'], ['GET', '/m/agenda/'], ['GET', '/api/comissao/relatorios']]) {
    const r = await daFerramenta(metodo, `/t/${chave}${url}`, metodo === 'POST' ? {} : undefined);
    assert.equal(r.status, 403, `${metodo} ${url}`);
  }
  // nem trocando o nome da ferramenta na chave (a assinatura não confere)
  const outra = chave.replace(/^agenda\./, 'outra.');
  assert.equal((await daFerramenta('GET', `/t/${outra}/api/armazenamento/outra`)).status, 401);
  // chave inventada
  assert.equal((await daFerramenta('GET', `/t/agenda.${'0'.repeat(24)}.${'a'.repeat(32)}/api/armazenamento/agenda`)).status, 401);
});

test('o cookie do portal não vale nos endereços da chave', async () => {
  const chave = chaveDa((await admin('GET', '/m/agenda/')).texto);
  // mesmo com o cookie de admin junto, o pedido pela chave fica no escopo da ferramenta
  assert.equal((await admin('GET', `/t/${chave}/api/admin/usuarios`)).status, 403);
});

test('a chave termina junto com a sessão', async () => {
  const c = cliente();
  assert.equal((await c('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'Admin1234' })).status, 200);
  const chave = chaveDa((await c('GET', '/m/agenda/')).texto);
  assert.equal((await daFerramenta('GET', `/t/${chave}/api/armazenamento/agenda`)).status, 200);
  await c('POST', '/api/auth/logout');
  const r = await daFerramenta('GET', `/t/${chave}/api/armazenamento/agenda`);
  assert.equal(r.status, 401);
  assert.equal(r.json.code, 'revoked');
});

test('quem só consulta continua sem gravar pela chave; quem perde o acesso também', async () => {
  const u = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'Rita', email: 'rita@teste.com', senha: 'Senha1234' });
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [u.json.id]);
  assert.equal((await admin('PUT', '/api/admin/modulos/agenda/acesso', { acessos: [{ usuario_id: u.json.id, somente_leitura: true, papeis: [] }] })).status, 200);
  const rita = cliente();
  assert.equal((await rita('POST', '/api/auth/login', { email: 'rita@teste.com', senha: 'Senha1234' })).status, 200);
  const chave = chaveDa((await rita('GET', '/m/agenda/')).texto);
  assert.equal((await daFerramenta('GET', `/t/${chave}/api/armazenamento/agenda`)).status, 200);
  assert.equal((await daFerramenta('POST', `/t/${chave}/api/armazenamento/agenda`, { set: { x: '1' } })).status, 403);
  assert.equal((await admin('PUT', '/api/admin/modulos/agenda/acesso', { acessos: [] })).status, 200);
  assert.equal((await daFerramenta('GET', `/t/${chave}/api/armazenamento/agenda`)).status, 403);
});

test('planilha interna pela chave (JSONP com a chave no fim do endereço)', async () => {
  const HTML_RENEG = `<!DOCTYPE html><html><head><title>MyBlue — Controle de Renegociações</title></head><body><script>
const SHEET_URL_BUILTIN = "https://script.google.com/macros/s/AAA/exec";
const SHEET_HEADERS = ["ID","Condomínio","Status"];
function isAppsScript(url){ return /script\\.google\\.com\\/macros\\/.*\\/exec/.test(url||''); }
</script></body></html>`;
  await admin('PUT', '/api/admin/modulos/renegociacoes/arquivo', HTML_RENEG);
  await admin('PATCH', '/api/admin/modulos/renegociacoes', { fonte_dados: 'interno', isolada: true });
  const pag = (await admin('GET', '/m/renegociacoes/')).texto;
  const chave = chaveDa(pag);
  assert.match(pag, new RegExp(`SHEET_URL_BUILTIN = "/api/gas/renegociacoes/${chave.replace(/\./g, '\\.')}"`));
  // a ferramenta continua reconhecendo o endereço interno
  assert.match(pag, /indexOf\('\/api\/gas\/'\)===0\) return true;/);
  let r = await daFerramenta('POST', `/api/gas/renegociacoes/${chave}`, JSON.stringify({ action: 'add', row: ['a1', 'Alfa', 'Fechado'] }), { 'content-type': 'text/plain' });
  assert.equal(r.json.ok, true, r.texto);
  r = await daFerramenta('GET', `/api/gas/renegociacoes/${chave}?callback=cb_1`, undefined, { 'sec-fetch-site': 'same-origin' });
  assert.match(r.texto, /^\/\*\*\/cb_1\(\[\["ID","Condomínio","Status"\],\["a1","Alfa","Fechado"\]\]\);$/);
  // a chave de outra ferramenta não serve aqui
  const outra = chaveDa((await admin('GET', '/m/agenda/')).texto);
  assert.equal((await daFerramenta('GET', `/api/gas/renegociacoes/${outra}`)).status, 401);
});

test('a administração liga e desliga o isolamento; ferramenta não isolada continua como antes', async () => {
  await admin('PATCH', '/api/admin/modulos/agenda', { isolada: false });
  const pag = await admin('GET', '/m/agenda/');
  assert.equal(pag.headers.get('content-security-policy'), null);
  assert.equal(JSON.parse(/window\.__MYBLUE__=(\{.*?\});\n/.exec(pag.texto)[1]).chave, null);
  assert.match(pag.texto, /src="\/cdn\/cdnjs\//);
  await admin('PATCH', '/api/admin/modulos/agenda', { isolada: true });
});

test('prévia de versão e ferramenta aguardando aprovação saem sempre isoladas', async () => {
  await admin('PATCH', '/api/admin/modulos/agenda', { isolada: false });
  const v = (await admin('GET', '/api/admin/modulos/agenda/versoes')).json.versoes[0].id;
  const previa = await admin('GET', `/m/agenda/?versao=${v}`);
  assert.equal(previa.status, 200);
  assert.match(previa.headers.get('content-security-policy'), /^sandbox /);
  assert.ok(chaveDa(previa.texto));
  assert.equal((await admin('GET', '/m/agenda/?versao=999999')).status, 404);
  await ctx.db.q("UPDATE modulos SET pendente = TRUE WHERE slug = 'agenda'");
  assert.match((await admin('GET', '/m/agenda/')).headers.get('content-security-policy'), /^sandbox /);
  await ctx.db.q("UPDATE modulos SET pendente = FALSE WHERE slug = 'agenda'");
  await admin('PATCH', '/api/admin/modulos/agenda', { isolada: true });
});

'use strict';
/* Arquivos enviados de dentro das ferramentas (ex.: contrato assinado). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx;
function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, opts = {}) {
    const headers = { origin: base, ...(opts.headers || {}) };
    if (cookie) headers.cookie = cookie;
    const r = await fetch(base + url, { method: metodo, headers, body: corpo, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null;
    try { json = JSON.parse(buf.toString()); } catch { /* binário */ }
    return { status: r.status, headers: r.headers, buf, json };
  };
}
async function entrar(email, senha) {
  const c = cliente();
  const r = await c('POST', '/api/auth/login', JSON.stringify({ email, senha }), { headers: { 'content-type': 'application/json' } });
  assert.equal(r.status, 200);
  return c;
}
const json = (o) => [JSON.stringify(o), { headers: { 'content-type': 'application/json' } }];

let admin, comAcesso, semAcesso;
before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0, limiteAnexoMb: 1 });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  admin = await entrar('admin@teste.com', 'Admin1234');
  assert.equal((await admin('POST', '/api/admin/modulos', ...json({ slug: 'comissoes-teste', nome: 'Comissões teste' }))).status, 201);
  for (const [email, mods] of [['com@teste.com', ['comissoes-teste']], ['sem@teste.com', []]]) {
    const u = await admin('POST', '/api/admin/usuarios', ...json({ nome: email, email, papel: 'usuario', senha: 'Senha1234', modulos: mods }));
    assert.equal(u.status, 201);
  }
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  comAcesso = await entrar('com@teste.com', 'Senha1234');
  semAcesso = await entrar('sem@teste.com', 'Senha1234');
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

test('quem tem a ferramenta envia o contrato e abre o PDF no navegador', async () => {
  const pdf = Buffer.from('%PDF-1.4 contrato de teste');
  const r = await comAcesso('POST', '/api/arquivos/comissoes-teste', pdf, { headers: { 'content-type': 'application/pdf', 'x-nome-arquivo': encodeURIComponent('Contrato Cond. 18.pdf') } });
  assert.equal(r.status, 201);
  assert.equal(r.json.nome, 'Contrato Cond. 18.pdf');
  assert.equal(r.json.tamanho, pdf.length);
  assert.equal(r.json.url, `/api/arquivos/comissoes-teste/${r.json.id}`);
  const g = await comAcesso('GET', r.json.url);
  assert.equal(g.status, 200);
  assert.equal(g.headers.get('content-type'), 'application/pdf');
  assert.match(g.headers.get('content-disposition'), /^inline; filename\*=UTF-8''Contrato%20Cond.%2018.pdf/);
  assert.deepEqual(g.buf, pdf);
  // o gestor (admin) também abre; baixar=1 força download
  const b = await admin('GET', r.json.url + '?baixar=1');
  assert.match(b.headers.get('content-disposition'), /^attachment/);
  const reg = await ctx.db.um("SELECT count(*)::int AS n FROM auditoria WHERE acao = 'arquivo_ferramenta_enviado'");
  assert.equal(reg.n, 1);
});

test('sem acesso à ferramenta não envia nem abre', async () => {
  const r = await comAcesso('POST', '/api/arquivos/comissoes-teste', Buffer.from('x'), { headers: { 'content-type': 'image/png' } });
  assert.equal((await semAcesso('POST', '/api/arquivos/comissoes-teste', Buffer.from('x'), { headers: { 'content-type': 'image/png' } })).status, 403);
  assert.equal((await semAcesso('GET', `/api/arquivos/comissoes-teste/${r.json.id}`)).status, 403);
  assert.equal((await cliente()('GET', `/api/arquivos/comissoes-teste/${r.json.id}`)).status, 401);
  // id de outra ferramenta não vaza
  assert.equal((await admin('GET', `/api/arquivos/outra-ferramenta/${r.json.id}`)).status, 404);
});

test('HTML enviado nunca abre como página; vazio e grande demais são recusados', async () => {
  const r = await comAcesso('POST', '/api/arquivos/comissoes-teste', Buffer.from('<script>alert(1)</script>'), { headers: { 'content-type': 'text/html', 'x-nome-arquivo': 'x.html' } });
  const g = await comAcesso('GET', `/api/arquivos/comissoes-teste/${r.json.id}`);
  assert.equal(g.headers.get('content-type'), 'application/octet-stream');
  assert.match(g.headers.get('content-disposition'), /^attachment/);
  assert.match(g.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await comAcesso('POST', '/api/arquivos/comissoes-teste', Buffer.alloc(0), { headers: { 'content-type': 'application/pdf' } })).status, 400);
  assert.equal((await comAcesso('POST', '/api/arquivos/comissoes-teste', Buffer.alloc(1024 * 1024 + 10, 1), { headers: { 'content-type': 'application/pdf' } })).status, 413);
});

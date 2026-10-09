'use strict';
/* Testes do banco de documentos das ferramentas feitas como artefato do Claude (node --test). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const { mesclar, separarCaminho } = require('../server/documentos');

let servidor, base, ctx, admin, ana, beto;

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (cookie) headers.cookie = cookie;
    let body;
    if (corpo !== undefined) {
      if (typeof corpo === 'string') { body = corpo; headers['content-type'] ||= 'text/plain'; }
      else { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
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
  assert.equal((await c('POST', '/api/auth/login', { email, senha })).status, 200);
  return c;
}

async function pessoa(nome, email, modulos) {
  const r = await admin('POST', '/api/admin/usuarios', { nome, email, papel: 'usuario', senha: 'Senha1234', modulos });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  return { c: await entrar(email, 'Senha1234'), id: r.json.id };
}

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0 });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');
  ana = await pessoa('Ana Souza', 'ana@teste.com', ['boletos']);
  beto = await pessoa('Beto Lima', 'beto@teste.com', ['sindicos']);
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('os dois módulos novos vêm no catálogo, ligados ao banco de documentos', async () => {
  const { modulos } = (await admin('GET', '/api/admin/modulos')).json;
  const b = modulos.find((m) => m.slug === 'boletos');
  const s = modulos.find((m) => m.slug === 'sindicos');
  assert.equal(b.adaptador, 'claude-db');
  assert.equal(b.setor_nome, 'Crédito');
  assert.equal(s.adaptador, 'claude-db');
  assert.equal(s.setor_nome, 'CS');
});

test('regras de caminho e de mesclagem iguais às do Claude', () => {
  assert.deepEqual(separarCaminho('meses/2026-10'), { colecao: 'meses', id: '2026-10' });
  assert.deepEqual(separarCaminho('a/b/c/d'), { colecao: 'a/b/c', id: 'd' });
  assert.throws(() => separarCaminho('meses'));
  assert.throws(() => separarCaminho('meses/../x/y'));
  assert.throws(() => separarCaminho('a b/c'));
  assert.deepEqual(mesclar({ itens: { c1: { emi: '1' }, c2: { emi: '2' } }, lista: [1, 2] }, { itens: { c1: { obs: 'x' } }, lista: [3], fechado: null }),
    { itens: { c1: { emi: '1', obs: 'x' }, c2: { emi: '2' } }, lista: [3], fechado: null });
});

test('gravar, mesclar, apagar e receber só o que mudou', async () => {
  const c = ana.c;
  let r = await c('GET', '/api/db/boletos');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.docs, []);
  const seq0 = r.json.seq;

  r = await c('POST', '/api/db/boletos', { ops: [{ op: 'set', path: 'meses/2026-10', data: { comp: '2026-10', itens: { c1: { emi: null } } } }] });
  assert.equal(r.status, 200, r.texto);
  assert.ok(r.json.seq > seq0);
  // update exige que o documento exista e junta objetos aninhados
  assert.equal((await c('POST', '/api/db/boletos', { ops: [{ op: 'update', path: 'meses/2026-11', data: { a: 1 } }] })).json.code, 'invalid_argument');
  assert.equal((await c('POST', '/api/db/boletos', { ops: [{ op: 'update', path: 'meses/2026-10', data: { itens: { c2: { emi: '2026-10-08' } } } }] })).status, 200);
  await c('POST', '/api/db/boletos', { ops: [{ op: 'set', path: 'log/x1', data: { t: 'a' } }] });

  r = await c('GET', '/api/db/boletos');
  const mes = r.json.docs.find((d) => d.id === '2026-10');
  assert.deepEqual(mes.d.itens, { c1: { emi: null }, c2: { emi: '2026-10-08' } });
  const seq1 = r.json.seq;

  await c('POST', '/api/db/boletos', { ops: [{ op: 'delete', path: 'log/x1' }] });
  r = await c('GET', `/api/db/boletos?desde=${seq1}`);
  assert.deepEqual(r.json.docs, [{ c: 'log', id: 'x1', d: null }], 'a exclusão chega para quem está com a tela aberta');
  r = await c('GET', '/api/db/boletos');
  assert.ok(!r.json.docs.some((d) => d.id === 'x1'));
});

test('limites: corpo precisa ser objeto e caber em 256 KB', async () => {
  const c = ana.c;
  assert.equal((await c('POST', '/api/db/boletos', { ops: [{ op: 'set', path: 'a/b', data: [1] }] })).status, 400);
  assert.equal((await c('POST', '/api/db/boletos', { ops: [{ op: 'set', path: 'a/b', data: { x: 'y'.repeat(270 * 1024) } }] })).status, 400);
  assert.equal((await c('POST', '/api/db/boletos', { ops: [{ op: 'set', path: 'a', data: {} }] })).status, 400);
});

test('acesso: só quem tem o módulo; área particular data/users fica escondida dos outros', async () => {
  assert.equal((await beto.c('GET', '/api/db/boletos')).status, 403);
  assert.equal((await ana.c('GET', '/api/db/sindicos')).status, 403);
  assert.equal((await ana.c('GET', '/api/db/renegociacoes')).status, 404, 'módulo que não é do Claude');

  const minha = `data/users/mb-${ana.id}/prefs`;
  assert.equal((await ana.c('POST', '/api/db/boletos', { ops: [{ op: 'set', path: minha, data: { tema: 'escuro' } }] })).status, 200);
  assert.equal((await admin('POST', '/api/db/boletos', { ops: [{ op: 'set', path: minha, data: { tema: 'claro' } }] })).status, 400);
  assert.ok((await ana.c('GET', '/api/db/boletos')).json.docs.some((d) => d.c === `data/users/mb-${ana.id}`));
  assert.ok(!(await admin('GET', '/api/db/boletos')).json.docs.some((d) => d.c.startsWith('data/users/')));
});

test('trava curta (acquire): o segundo espera, o mesmo holder renova', async () => {
  await beto.c('POST', '/api/db/sindicos', { ops: [{ op: 'set', path: 'contatos/c001', data: { cond: 'A' } }] });
  const a = await beto.c('POST', '/api/db/sindicos/trava', { path: 'contatos/c001', holder: 'aba-1', ttlMs: 5000 });
  assert.equal(a.json.acquired, true);
  const b = await admin('POST', '/api/db/sindicos/trava', { path: 'contatos/c001', holder: 'aba-2', ttlMs: 5000 });
  assert.equal(b.json.acquired, false);
  assert.ok(b.json.expiresAt);
  assert.equal((await beto.c('POST', '/api/db/sindicos/trava', { path: 'contatos/c001', holder: 'aba-1' })).json.acquired, true);
});

test('nomes das pessoas: usuários do portal e ids antigos do Claude', async () => {
  await ctx.db.q(`UPDATE modulos SET config = config || '{"pessoas_legadas":{"u_abc":"Pessoa Antiga"}}'::jsonb WHERE slug = 'boletos'`);
  const r = await ana.c('GET', `/api/db/boletos/pessoas?ids=mb-${ana.id},u_abc,u_zzz`);
  assert.equal(r.json.pessoas[`mb-${ana.id}`].name, 'Ana Souza');
  assert.equal(r.json.pessoas[`mb-${ana.id}`].isMe, true);
  assert.equal(r.json.pessoas.u_abc.name, 'Pessoa Antiga');
  assert.equal(r.json.pessoas.u_zzz, undefined);
});

test('admin vê a contagem, baixa CSV e o JSON; a página recebe window.claude', async () => {
  const { modulos } = (await admin('GET', '/api/admin/modulos')).json;
  const b = modulos.find((m) => m.slug === 'boletos');
  assert.deepEqual(b.dados_registros.map((x) => [x.colecao, x.total]).filter((x) => !x[0].startsWith('data/')), [['meses', 1]]);
  const csv = await admin('GET', '/api/admin/modulos/boletos/dados/meses.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.texto, /2026-10/);
  const tudo = await admin('GET', '/api/admin/modulos/boletos/dados');
  assert.equal(tudo.json.colecoes.meses.documentos[0].id, '2026-10');

  const html = '<!doctype html><html><head><title>Controle de Emissão de Boletos</title></head><body>x</body></html>';
  assert.equal((await admin('PUT', '/api/admin/modulos/boletos/arquivo', html, { headers: { 'content-type': 'text/html' } })).status, 200);
  const pagina = await ana.c('GET', '/m/boletos/');
  assert.equal(pagina.status, 200);
  assert.match(pagina.texto, /"claudeDb":true/);
  assert.match(pagina.texto, /window, 'claude'/);
});

test('importar arquivo de dados do Claude substitui tudo e avisa quem está com a tela aberta', async () => {
  const antes = (await beto.c('GET', '/api/db/sindicos')).json.seq;
  const r = await admin('POST', '/api/admin/modulos/sindicos/documentos', { modulo: 'sindicos', documentos: { 'contatos/c900': { cond: 'Novo' }, 'meta/estado': { origem: 'teste' } } });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.total, 2);
  const tudo = (await beto.c('GET', '/api/db/sindicos')).json.docs.map((d) => `${d.c}/${d.id}`).sort();
  assert.deepEqual(tudo, ['contatos/c900', 'meta/estado']);
  const mud = (await beto.c('GET', `/api/db/sindicos?desde=${antes}`)).json.docs;
  assert.ok(mud.some((d) => d.id === 'c001' && d.d === null), 'o que saiu chega como exclusão');
  assert.equal((await admin('POST', '/api/admin/modulos/boletos/documentos', { modulo: 'sindicos', documentos: {} })).status, 400);
  assert.equal((await admin('POST', '/api/admin/modulos/renegociacoes/documentos', { documentos: {} })).status, 404);
  assert.equal((await beto.c('POST', '/api/admin/modulos/sindicos/documentos', { documentos: {} })).status, 403);
});

test('ferramenta nova feita como artefato do Claude passa a usar o banco de documentos ao enviar o HTML', async () => {
  assert.equal((await admin('POST', '/api/admin/modulos', { nome: 'Viagens Teste', slug: 'viagens-teste' })).status, 201);
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>Viagens</title></head><body><script>const db = window.claude.use(\'db\');</script></body></html>';
  const r = await admin('PUT', '/api/admin/modulos/viagens-teste/arquivo', html, { headers: { 'content-type': 'text/html' } });
  assert.equal(r.status, 200, r.texto);
  const m = (await admin('GET', '/api/admin/modulos')).json.modulos.find((x) => x.slug === 'viagens-teste');
  assert.equal(m.adaptador, 'claude-db');
  assert.equal(m.fonte_dados, 'interno');
  // HTML comum não muda nada
  assert.equal((await admin('POST', '/api/admin/modulos', { nome: 'Comum', slug: 'comum-teste' })).status, 201);
  await admin('PUT', '/api/admin/modulos/comum-teste/arquivo', '<!doctype html><html><head><title>Comum</title></head><body>oi</body></html>', { headers: { 'content-type': 'text/html' } });
  assert.equal((await admin('GET', '/api/admin/modulos')).json.modulos.find((x) => x.slug === 'comum-teste').adaptador, null);
});

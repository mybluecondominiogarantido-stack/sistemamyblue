'use strict';
/* Testes da Central de Links (node --test): links, campanhas do marketing e troca automática do fundo. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const { tipoImagem, hojeNoFuso } = require('../server/rotas/links');

let servidor, base, ctx;

// imagens mínimas: só a assinatura importa para o servidor
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (cookie) headers.cookie = cookie;
    let body;
    if (corpo !== undefined) {
      if (typeof corpo === 'string' || Buffer.isBuffer(corpo)) { body = corpo; headers['content-type'] ||= 'application/octet-stream'; }
      else { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
    }
    const r = await fetch(base + url, { method: metodo, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    if (opts.bruto) return { status: r.status, headers: r.headers, buffer: Buffer.from(await r.arrayBuffer()) };
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: r.status, json, headers: r.headers };
  };
}

async function logar(email, senha) {
  const c = cliente();
  const r = await c('POST', '/api/auth/login', { email, senha });
  assert.equal(r.status, 200, `login ${email}`);
  return c;
}

async function criarUsuario(admin, email, extra = {}) {
  const r = await admin('POST', '/api/admin/usuarios', { nome: email.split('@')[0], email, senha: 'Senha1234', ...extra });
  assert.equal(r.status, 201);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  return logar(email, 'Senha1234');
}

let admin, mkt, comum;

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: process.env.TEST_DATABASE_URL || '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0 });
  if (cfg.databaseUrl) {
    const { Client } = require('pg');
    const c = new Client({ connectionString: cfg.databaseUrl });
    await c.connect();
    await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await c.end();
  }
  const r = await criarApp(cfg);
  ctx = r.ctx;
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await logar('admin@teste.com', 'Admin1234');
  mkt = await criarUsuario(admin, 'mkt@teste.com', { editor_links: true });
  comum = await criarUsuario(admin, 'comum@teste.com');
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('reconhece imagens pela assinatura e calcula o dia no fuso de Brasília', () => {
  assert.equal(tipoImagem(PNG), 'image/png');
  assert.equal(tipoImagem(JPG), 'image/jpeg');
  assert.equal(tipoImagem(Buffer.from('<svg onload=alert(1)>')), null);
  // 02h de 1º de novembro em UTC ainda é 31 de outubro em Brasília
  assert.equal(hojeNoFuso('America/Sao_Paulo', new Date('2026-11-01T02:00:00Z')), '2026-10-31');
});

test('só quem é do marketing (ou admin) edita; todos veem a página', async () => {
  assert.equal((await cliente()('GET', '/api/links')).status, 401);
  const r = await comum('GET', '/api/links');
  assert.equal(r.status, 200);
  assert.equal(r.json.pode_editar, false);
  assert.equal(r.json.campanha, null);
  assert.equal((await comum('GET', '/api/links/gestao')).status, 403);
  assert.equal((await comum('POST', '/api/links/gestao/links', { titulo: 'X', url: 'https://x.com' })).status, 403);
  assert.equal((await comum('POST', '/api/links/gestao/campanhas', { nome: 'X', inicio: '2026-01-01' })).status, 403);
  assert.equal((await mkt('GET', '/api/links')).json.pode_editar, true);
  assert.equal((await mkt('GET', '/api/links/gestao')).status, 200);
  const usu = (await admin('GET', '/api/admin/usuarios')).json.usuarios.find((u) => u.email === 'mkt@teste.com');
  assert.equal(usu.editor_links, true);
  // marcar marketing não dá acesso à administração
  assert.equal((await mkt('GET', '/api/admin/usuarios')).status, 403);
});

test('links: incluir, validar, ordenar, ocultar e excluir', async () => {
  assert.equal((await mkt('POST', '/api/links/gestao/links', { titulo: 'Ruim', url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await mkt('POST', '/api/links/gestao/links', { titulo: '', url: 'https://a.com' })).status, 400);
  const a = (await mkt('POST', '/api/links/gestao/links', { titulo: 'Formulário', url: 'https://forms.example.com/a', grupo: 'Cobrança', icone: 'documento' })).json.id;
  const b = (await mkt('POST', '/api/links/gestao/links', { titulo: 'WhatsApp', url: 'https://wa.me/5511999999999', icone: 'nao-existe' })).json.id;
  let pub = (await comum('GET', '/api/links')).json.links;
  assert.deepEqual(pub.map((l) => l.titulo), ['Formulário', 'WhatsApp']);
  assert.equal(pub[1].icone, 'link');
  assert.equal((await mkt('PUT', '/api/links/gestao/ordem', { ids: [b, a] })).status, 200);
  pub = (await comum('GET', '/api/links')).json.links;
  assert.deepEqual(pub.map((l) => l.id), [b, a]);
  assert.equal((await mkt('PATCH', `/api/links/gestao/links/${a}`, { ativo: false })).status, 200);
  assert.deepEqual((await comum('GET', '/api/links')).json.links.map((l) => l.id), [b]);
  assert.equal((await mkt('GET', '/api/links/gestao')).json.links.length, 2);
  assert.equal((await mkt('DELETE', `/api/links/gestao/links/${a}`)).status, 200);
  assert.equal((await mkt('DELETE', `/api/links/gestao/links/${a}`)).status, 404);
});

test('título da página', async () => {
  assert.equal((await mkt('PUT', '/api/links/gestao/pagina', { titulo: '' })).status, 400);
  assert.equal((await mkt('PUT', '/api/links/gestao/pagina', { titulo: 'Central de Links — Grupo Apoio Cobrança', subtitulo: 'Tudo num lugar só' })).status, 200);
  const p = (await comum('GET', '/api/links')).json.pagina;
  assert.equal(p.titulo, 'Central de Links — Grupo Apoio Cobrança');
  assert.equal(p.subtitulo, 'Tudo num lugar só');
});

test('campanhas: o fundo troca sozinho na data de início', async () => {
  const hoje = hojeNoFuso();
  const passado = (await mkt('POST', '/api/links/gestao/campanhas', { nome: 'Setembro Amarelo', inicio: '2000-09-01' })).json.id;
  const atual = (await mkt('POST', '/api/links/gestao/campanhas', { nome: 'Campanha do mês', inicio: hoje, escurecer: 20 })).json.id;
  const futura = (await mkt('POST', '/api/links/gestao/campanhas', { nome: 'Próximo mês', inicio: '2999-01-01' })).json.id;
  assert.equal((await mkt('POST', '/api/links/gestao/campanhas', { nome: 'Sem data' })).status, 400);
  assert.equal((await mkt('POST', '/api/links/gestao/campanhas', { nome: 'X', inicio: '2026-01-01', escurecer: 99 })).status, 400);

  // imagem que não é JPG/PNG/WEBP é recusada
  assert.equal((await mkt('PUT', `/api/links/gestao/campanhas/${atual}/fundo`, Buffer.from('<html>'))).status, 400);
  assert.equal((await mkt('PUT', `/api/links/gestao/campanhas/${atual}/outra-coisa`, PNG)).status, 404);
  assert.equal((await mkt('PUT', `/api/links/gestao/campanhas/${atual}/fundo`, PNG)).status, 200);
  assert.equal((await mkt('PUT', `/api/links/gestao/campanhas/${atual}/fundo-celular`, JPG)).status, 200);
  assert.equal((await mkt('PUT', `/api/links/gestao/campanhas/${futura}/fundo`, JPG)).status, 200);

  const r = (await comum('GET', '/api/links')).json;
  assert.equal(r.campanha.id, atual);
  assert.equal(r.campanha.escurecer, 20);
  assert.ok(r.campanha.fundo_url && r.campanha.fundo_celular_url);
  const img = await comum('GET', r.campanha.fundo_url, undefined, { bruto: true });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.ok(img.buffer.equals(PNG));
  const cel = await comum('GET', r.campanha.fundo_celular_url, undefined, { bruto: true });
  assert.equal(cel.headers.get('content-type'), 'image/jpeg');

  // pessoa comum não pré-visualiza campanha agendada; o marketing sim
  assert.equal((await comum('GET', `/api/links?campanha=${futura}`)).json.campanha.id, atual);
  assert.equal((await mkt('GET', `/api/links?campanha=${futura}`)).json.campanha.id, futura);

  const g = (await mkt('GET', '/api/links/gestao')).json;
  assert.equal(g.vigente_id, atual);
  assert.deepEqual(g.campanhas.map((c) => c.id), [futura, atual, passado]);

  // remover a versão de celular e depois a campanha atual: volta a valer a anterior
  assert.equal((await mkt('DELETE', `/api/links/gestao/campanhas/${atual}/fundo-celular`)).status, 200);
  assert.equal((await comum('GET', '/api/links')).json.campanha.fundo_celular_url, null);
  assert.equal((await mkt('DELETE', `/api/links/gestao/campanhas/${atual}`)).status, 200);
  assert.equal((await comum('GET', '/api/links')).json.campanha.id, passado);

  // adiantar a futura para hoje coloca ela no ar
  assert.equal((await mkt('PATCH', `/api/links/gestao/campanhas/${futura}`, { inicio: hoje })).status, 200);
  assert.equal((await comum('GET', '/api/links')).json.campanha.id, futura);

  const acoes = (await ctx.db.q("SELECT acao FROM auditoria WHERE acao LIKE 'campanha_%'")).rows.map((x) => x.acao);
  assert.ok(acoes.includes('campanha_fundo') && acoes.includes('campanha_removida'));
});

test('backup inclui a Central de Links com as imagens em base64', async () => {
  const r = await admin('GET', '/api/admin/backup');
  assert.equal(r.status, 200);
  const camp = r.json.tabelas.links_campanhas.find((c) => c.fundo);
  assert.equal(typeof camp.fundo, 'string');
  assert.ok(Array.isArray(r.json.tabelas.links));
});

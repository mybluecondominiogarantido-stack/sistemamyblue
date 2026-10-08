'use strict';
/* Perfis Coordenador e Supervisor (node --test). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx, admin, coord, coordId, sup;
const ids = {};

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let body;
    if (typeof corpo === 'string') { body = corpo; headers['content-type'] = 'text/html'; }
    else if (corpo !== undefined) { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
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
async function criar(nome, email, extra = {}) {
  const r = await admin('POST', '/api/admin/usuarios', { nome, email, senha: 'Senha1234', ...extra });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return r.json.id;
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
  coordId = await criar('Cora Coordenadora', 'cora@teste.com', { papel: 'coordenador', modulos: ['boletos', 'credito'] });
  await criar('Sávio Supervisor', 'savio@teste.com', { papel: 'supervisor', modulos: ['credito'] });
  await criar('Ivo da Equipe', 'ivo@teste.com', { modulos: ['credito', 'parceiros'] });
  await criar('Olga de Fora', 'olga@teste.com', { modulos: ['cobranca'] });
  // Cora e Ivo na equipe de Crédito
  const credito = (await ctx.db.um("SELECT id FROM setores WHERE nome = 'Crédito'")).id;
  await ctx.db.q('INSERT INTO setor_membros (setor_id, usuario_id, lider) VALUES ($1, $2, TRUE), ($1, $3, FALSE)', [credito, coordId, ids['ivo@teste.com']]);
  coord = await entrar('cora@teste.com', 'Senha1234');
  sup = await entrar('savio@teste.com', 'Senha1234');
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('coordenador vê só os usuários comuns da equipe dele e as ferramentas que pode liberar', async () => {
  const r = await coord('GET', '/api/admin/usuarios');
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.usuarios.map((u) => u.email), ['ivo@teste.com']);
  assert.deepEqual(r.json.modulos_disponiveis.map((m) => m.slug).sort(), ['boletos', 'credito']);
});

test('coordenador cria usuário comum só com as ferramentas dele', async () => {
  const r = await coord('POST', '/api/admin/usuarios', { nome: 'Nina Nova', email: 'nina@teste.com', modulos: ['boletos', 'parceiros'], supervisor_tickets: true, editor_links: true });
  assert.equal(r.status, 201, r.texto);
  const u = (await admin('GET', '/api/admin/usuarios')).json.usuarios.find((x) => x.email === 'nina@teste.com');
  assert.equal(u.papel, 'usuario');
  assert.deepEqual(u.modulos, ['boletos'], 'parceiros não é da coordenadora');
  assert.equal(u.supervisor_tickets, false);
  assert.equal(u.editor_links, false);
  // quem ela criou aparece na lista dela
  assert.ok((await coord('GET', '/api/admin/usuarios')).json.usuarios.some((x) => x.email === 'nina@teste.com'));
  // não cria administrador, coordenador nem supervisor
  for (const papel of ['admin', 'coordenador', 'supervisor']) {
    assert.equal((await coord('POST', '/api/admin/usuarios', { nome: 'X', email: `x-${papel}@teste.com`, papel })).status, 403);
  }
});

test('coordenador edita a equipe sem tirar o que a administração liberou', async () => {
  const ivo = ids['ivo@teste.com'];
  const r = await coord('PATCH', `/api/admin/usuarios/${ivo}`, { nome: 'Ivo Silva', modulos: ['boletos'], papel: 'admin', ativo: true });
  assert.equal(r.status, 200, r.texto);
  const u = (await admin('GET', '/api/admin/usuarios')).json.usuarios.find((x) => x.id === ivo);
  assert.equal(u.nome, 'Ivo Silva');
  assert.equal(u.papel, 'usuario', 'não muda o perfil');
  assert.deepEqual(u.modulos.sort(), ['boletos', 'parceiros'], 'tira crédito (dela), põe boletos (dela) e mantém parceiros (da administração)');
  assert.equal((await coord('POST', `/api/admin/usuarios/${ivo}/senha`, {})).status, 200);
  assert.equal((await coord('PATCH', `/api/admin/usuarios/${ivo}`, { ativo: false })).status, 200);
});

test('coordenador não mexe em quem é de fora, nem em admin/supervisor, nem no resto da administração', async () => {
  for (const email of ['olga@teste.com', 'savio@teste.com', 'admin@teste.com']) {
    const id = ids[email] || 1;
    assert.equal((await coord('PATCH', `/api/admin/usuarios/${id}`, { nome: 'Hack' })).status, 404, email);
    assert.equal((await coord('POST', `/api/admin/usuarios/${id}/senha`, {})).status, 404, email);
  }
  assert.equal((await coord('PATCH', `/api/admin/usuarios/${coordId}`, { papel: 'admin' })).status, 404, 'nem em si mesma');
  for (const url of ['/api/admin/setores', '/api/admin/equipes', '/api/admin/backup', '/api/admin/auditoria']) {
    assert.equal((await coord('GET', url)).status, 403, url);
  }
});

test('supervisor acompanha os tickets de todos os setores, mas não cria usuários', async () => {
  assert.equal((await sup('GET', '/api/admin/usuarios')).status, 403);
  assert.equal((await sup('POST', '/api/admin/usuarios', { nome: 'Y', email: 'y@teste.com' })).status, 403);
  // "todos os tickets": só administração e supervisão
  assert.equal((await sup('GET', '/api/tickets?vis=todos')).status, 200);
  assert.equal((await coord('GET', '/api/tickets?vis=todos')).status, 403);
  assert.equal((await sup('GET', '/api/tickets/painel/indicadores')).status, 200, 'supervisor vê o painel mesmo sem equipe');
  const eu = (await sup('GET', '/api/auth/eu')).json;
  assert.equal((eu.usuario || eu).papel, 'supervisor');
});

test('admin cria e edita os quatro perfis', async () => {
  const id = ids['olga@teste.com'];
  for (const papel of ['supervisor', 'coordenador', 'usuario']) {
    assert.equal((await admin('PATCH', `/api/admin/usuarios/${id}`, { papel })).status, 200);
    assert.equal((await ctx.db.um('SELECT papel FROM usuarios WHERE id = $1', [id])).papel, papel);
  }
});

test('coordenador envia e restaura o HTML só dos módulos dos setores das equipes dele', async () => {
  const html = (t) => `<!doctype html><html><head><title>${t}</title></head><body>ok</body></html>`;
  // Cora está na equipe de Crédito: vê os módulos de Crédito e nenhum outro
  const lista = await coord('GET', '/api/admin/modulos');
  assert.equal(lista.status, 200, lista.texto);
  const slugs = lista.json.modulos.map((m) => m.slug).sort();
  assert.ok(slugs.includes('credito') && slugs.includes('boletos'), slugs.join(','));
  assert.ok(!slugs.includes('cobranca') && !slugs.includes('parceiros'));
  assert.equal(lista.json.modulos[0].usuarios, undefined, 'não recebe quem tem acesso');

  const envia = async (cli, slug, corpo) => (await cli('PUT', `/api/admin/modulos/${slug}/arquivo`, corpo)).status;
  assert.equal(await envia(coord, 'boletos', html('Boletos v1')), 200);
  assert.equal(await envia(coord, 'boletos', html('Boletos v2')), 200);
  assert.equal(await envia(coord, 'cobranca', html('Cobrança')), 403, 'outro setor');
  const v = await coord('GET', '/api/admin/modulos/boletos/versoes');
  assert.equal(v.status, 200);
  assert.equal(v.json.versoes.length, 2);
  assert.equal((await coord('POST', `/api/admin/modulos/boletos/versoes/${v.json.versoes[1].id}/usar`)).status, 200);
  assert.equal((await coord('GET', '/api/admin/modulos/cobranca/versoes')).status, 403);
  // o resto da administração do módulo continua só com o administrador
  assert.equal((await coord('PATCH', '/api/admin/modulos/boletos', { nome: 'X' })).status, 403);
  assert.equal((await coord('DELETE', '/api/admin/modulos/boletos?confirmar=boletos')).status, 403);
  assert.equal((await coord('GET', '/api/admin/modulos/boletos/dados')).status, 403);
  assert.equal((await coord('POST', '/api/admin/modulos/boletos/documentos', { documentos: {} })).status, 403);
  assert.equal((await sup('PUT', '/api/admin/modulos/boletos/arquivo', html('x'))).status, 403, 'supervisor não envia HTML');
});

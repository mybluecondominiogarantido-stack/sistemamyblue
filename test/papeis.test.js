'use strict';
/* Perfis Coordenador e Supervisor (node --test). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx, admin, coord, coordId, sup, S;
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
  const setores = (await admin('GET', '/api/admin/usuarios')).json.setores;
  S = (n) => setores.find((x) => x.nome === n).id;
  // o setor de cada pessoa vem do cadastro
  coordId = await criar('Cora Coordenadora', 'cora@teste.com', { papel: 'coordenador', setores: [S('Crédito')] });
  await criar('Sávio Supervisor', 'savio@teste.com', { papel: 'supervisor', setores: [S('Cobrança')] });
  await criar('Ivo da Equipe', 'ivo@teste.com', { setores: [S('Crédito')], modulos: ['credito', 'parceiros'] });
  await criar('Olga de Fora', 'olga@teste.com', { setores: [S('Cobrança')], modulos: ['cobranca'] });
  coord = await entrar('cora@teste.com', 'Senha1234');
  sup = await entrar('savio@teste.com', 'Senha1234');
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('coordenador e supervisor precisam de setor; o setor forma a equipe da Central de Tickets', async () => {
  const r = await admin('POST', '/api/admin/usuarios', { nome: 'Sem Setor', email: 'semsetor@teste.com', papel: 'coordenador', setores: [] });
  assert.equal(r.status, 400);
  const eq = (await admin('GET', '/api/admin/equipes')).json.setores.find((x) => x.id === S('Crédito'));
  assert.deepEqual(eq.membros.map((m) => m.usuario_id).sort(), [coordId, ids['ivo@teste.com']].sort());
});

test('coordenador vê só os usuários comuns do setor e as ferramentas do setor', async () => {
  const r = await coord('GET', '/api/admin/usuarios');
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.usuarios.map((u) => u.email), ['ivo@teste.com']);
  assert.deepEqual(r.json.setores.map((x) => x.nome), ['Crédito']);
  assert.deepEqual(r.json.modulos_disponiveis.map((m) => m.slug).sort(), ['boletos', 'credito']);
  // abre todas as ferramentas do setor sem precisar liberar uma a uma
  assert.deepEqual((await coord('GET', '/api/modulos')).json.modulos.map((m) => m.slug).sort(), ['boletos', 'credito']);
});

test('coordenador cria usuário comum no setor dele, só com as ferramentas do setor', async () => {
  const r = await coord('POST', '/api/admin/usuarios', { nome: 'Nina Nova', email: 'nina@teste.com', modulos: ['boletos', 'parceiros'], setores: [S('Crédito'), S('Cobrança')], supervisor_tickets: true, editor_links: true });
  assert.equal(r.status, 201, r.texto);
  const u = (await admin('GET', '/api/admin/usuarios')).json.usuarios.find((x) => x.email === 'nina@teste.com');
  assert.equal(u.papel, 'usuario');
  assert.deepEqual(u.modulos, ['boletos'], 'parceiros não é do setor dela');
  assert.deepEqual(u.setores, [S('Crédito')], 'Cobrança não é setor dela');
  assert.equal(u.supervisor_tickets, false);
  assert.equal(u.editor_links, false);
  assert.equal((await coord('POST', '/api/admin/usuarios', { nome: 'Sem', email: 'sem@teste.com', setores: [S('Cobrança')] })).status, 400, 'precisa de um setor dela');
  for (const papel of ['admin', 'coordenador', 'supervisor']) {
    assert.equal((await coord('POST', '/api/admin/usuarios', { nome: 'X', email: `x-${papel}@teste.com`, papel, setores: [S('Crédito')] })).status, 403);
  }
});

test('coordenador edita a equipe sem tirar o que é de outros setores', async () => {
  const ivo = ids['ivo@teste.com'];
  const r = await coord('PATCH', `/api/admin/usuarios/${ivo}`, { nome: 'Ivo Silva', modulos: ['boletos'], papel: 'admin', ativo: true });
  assert.equal(r.status, 200, r.texto);
  const u = (await admin('GET', '/api/admin/usuarios')).json.usuarios.find((x) => x.id === ivo);
  assert.equal(u.nome, 'Ivo Silva');
  assert.equal(u.papel, 'usuario', 'não muda o perfil');
  assert.deepEqual(u.modulos.sort(), ['boletos', 'parceiros'], 'tira crédito, põe boletos e mantém parceiros (outro setor)');
  assert.equal((await coord('POST', `/api/admin/usuarios/${ivo}/senha`, {})).status, 200);
});

test('coordenador não mexe em quem é de outro setor, nem em coordenadores, supervisores e administradores', async () => {
  for (const email of ['olga@teste.com', 'savio@teste.com', 'admin@teste.com']) {
    const id = ids[email] || 1;
    assert.equal((await coord('PATCH', `/api/admin/usuarios/${id}`, { nome: 'Hack' })).status, 404, email);
    assert.equal((await coord('POST', `/api/admin/usuarios/${id}/senha`, {})).status, 404, email);
  }
  assert.equal((await coord('PATCH', `/api/admin/usuarios/${coordId}`, { papel: 'admin' })).status, 404, 'nem em si mesma');
  for (const url of ['/api/admin/setores', '/api/admin/backup', '/api/admin/auditoria']) {
    assert.equal((await coord('GET', url)).status, 403, url);
  }
  assert.equal((await coord('POST', '/api/admin/equipes/email-teste')).status, 403);
});

test('supervisor tem os mesmos poderes no setor dele, e não fica acima do coordenador', async () => {
  const r = await sup('GET', '/api/admin/usuarios');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.usuarios.map((u) => u.email), ['olga@teste.com']);
  assert.equal((await sup('PATCH', `/api/admin/usuarios/${coordId}`, { nome: 'X' })).status, 404, 'não gerencia coordenador');
  assert.equal((await sup('POST', '/api/admin/usuarios', { nome: 'Y', email: 'y@teste.com', setores: [S('Cobrança')] })).status, 201);
  // tickets: só os setores dele (não vê "todos")
  assert.equal((await sup('GET', '/api/tickets?vis=todos')).status, 403);
  assert.equal((await sup('GET', '/api/tickets/painel/indicadores')).status, 200);
});

test('coordenador age como líder nos tickets do setor dele', async () => {
  const olga = await entrar('olga@teste.com', 'Senha1234');
  const t = await olga('POST', '/api/tickets', { interno: true, titulo: 'Balancete', setor_id: S('Crédito'), prioridade: 'media' });
  assert.equal(t.status, 201, t.texto);
  const d = (await coord('GET', `/api/tickets/${t.json.id}`)).json;
  assert.equal(d.pode.atribuir, true);
  assert.equal((await coord('PATCH', `/api/tickets/${t.json.id}`, { responsavel_id: ids['ivo@teste.com'] })).status, 200);
});

test('equipe e tipos de demanda: só os setores dele; escolhe os líderes, não muda quem é do setor', async () => {
  const j = (await coord('GET', '/api/admin/equipes')).json;
  assert.equal(j.restrito, true);
  assert.deepEqual(j.setores.map((x) => x.nome), ['Crédito']);
  const ivo = ids['ivo@teste.com'];
  assert.equal((await coord('PUT', `/api/admin/equipes/${S('Crédito')}/membros`, { membros: [{ usuario_id: ivo, lider: true }, { usuario_id: ids['olga@teste.com'], lider: true }] })).status, 200);
  const membros = (await admin('GET', '/api/admin/equipes')).json.setores.find((x) => x.id === S('Crédito')).membros;
  assert.ok(membros.find((m) => m.usuario_id === ivo).lider);
  assert.ok(!membros.some((m) => m.usuario_id === ids['olga@teste.com']), 'não incluiu quem é de outro setor');
  assert.equal((await coord('PUT', `/api/admin/equipes/${S('Cobrança')}/membros`, { membros: [] })).status, 404);
  const c = await coord('POST', `/api/admin/equipes/${S('Crédito')}/categorias`, { nome: 'Balancete', prazo_horas: 18 });
  assert.equal(c.status, 201);
  assert.equal((await coord('PATCH', `/api/admin/categorias/${c.json.id}`, { prazo_horas: 27 })).status, 200);
  assert.equal((await coord('POST', `/api/admin/equipes/${S('Cobrança')}/categorias`, { nome: 'X' })).status, 404);
  const outra = await admin('POST', `/api/admin/equipes/${S('Cobrança')}/categorias`, { nome: 'Acordo' });
  assert.equal((await coord('DELETE', `/api/admin/categorias/${outra.json.id}`)).status, 404);
});

test('carteira: coordenador altera e transfere só o responsável do setor dele', async () => {
  const cond = await admin('POST', '/api/carteira', { nome: 'Cond. Teste', assistente_credito: 'IVO SILVA', analista_cobranca: 'OLGA' });
  const id = cond.json.id;
  const j = (await coord('GET', '/api/carteira')).json;
  assert.deepEqual(j.funcoes_editaveis, ['assistente_credito']);
  assert.equal((await coord('PATCH', `/api/carteira/${id}`, { assistente_credito: 'NINA NOVA' })).status, 200);
  assert.equal((await coord('PATCH', `/api/carteira/${id}`, { analista_cobranca: 'X' })).status, 403);
  assert.equal((await coord('PATCH', `/api/carteira/${id}`, { nome: 'Outro nome' })).status, 403);
  assert.equal((await coord('POST', '/api/carteira/transferir', { funcao: 'assistente_credito', de: 'NINA NOVA', para: 'IVO SILVA' })).status, 200);
  assert.equal((await coord('POST', '/api/carteira/transferir', { funcao: 'analista_cobranca', de: 'OLGA', para: 'X' })).status, 403);
  assert.equal((await sup('PATCH', `/api/carteira/${id}`, { analista_cobranca: 'OLGA LIMA' })).status, 200, 'supervisor de Cobrança');
  const olga = await entrar('olga@teste.com', 'Senha1234');
  assert.equal((await olga('PATCH', `/api/carteira/${id}`, { analista_cobranca: 'X' })).status, 403, 'usuário comum não altera');
});

test('ferramentas do setor: HTML, versões e quem pode abrir', async () => {
  const html = (t) => `<!doctype html><html><head><title>${t}</title></head><body>ok</body></html>`;
  const lista = await coord('GET', '/api/admin/modulos');
  assert.equal(lista.status, 200, lista.texto);
  assert.deepEqual(lista.json.modulos.map((m) => m.slug).sort(), ['boletos', 'credito']);
  assert.equal((await coord('PUT', '/api/admin/modulos/boletos/arquivo', html('Boletos v1'))).status, 200);
  assert.equal((await coord('PUT', '/api/admin/modulos/boletos/arquivo', html('Boletos v2'))).status, 200);
  assert.equal((await coord('PUT', '/api/admin/modulos/cobranca/arquivo', html('Cobrança'))).status, 403, 'outro setor');
  const v = await coord('GET', '/api/admin/modulos/boletos/versoes');
  assert.equal(v.json.versoes.length, 2);
  assert.equal((await coord('POST', `/api/admin/modulos/boletos/versoes/${v.json.versoes[1].id}/usar`)).status, 200);
  // quem pode abrir: marca e desmarca só gente do setor dela
  const ivo = ids['ivo@teste.com'];
  await ctx.db.q("INSERT INTO permissoes (usuario_id, modulo_slug) VALUES ($1, 'credito') ON CONFLICT DO NOTHING", [ids['olga@teste.com']]);
  assert.equal((await coord('PUT', '/api/admin/modulos/credito/acesso', { usuarios: [ivo] })).status, 200);
  const perm = (await ctx.db.q("SELECT usuario_id FROM permissoes WHERE modulo_slug = 'credito'")).rows.map((x) => x.usuario_id).sort();
  assert.deepEqual(perm, [ivo, ids['olga@teste.com']].sort(), 'Olga (outro setor) continua como estava');
  assert.equal((await coord('PUT', '/api/admin/modulos/cobranca/acesso', { usuarios: [] })).status, 403);
  // o resto continua só com o administrador
  assert.equal((await coord('PATCH', '/api/admin/modulos/boletos', { nome: 'X' })).status, 403);
  assert.equal((await coord('DELETE', '/api/admin/modulos/boletos?confirmar=boletos')).status, 403);
  assert.equal((await coord('GET', '/api/admin/modulos/boletos/dados')).status, 403);
  assert.equal((await coord('POST', '/api/admin/modulos/boletos/documentos', { documentos: {} })).status, 403);
});

test('admin cria e edita os quatro perfis', async () => {
  const id = ids['olga@teste.com'];
  for (const papel of ['supervisor', 'coordenador', 'usuario']) {
    assert.equal((await admin('PATCH', `/api/admin/usuarios/${id}`, { papel })).status, 200);
    assert.equal((await ctx.db.um('SELECT papel FROM usuarios WHERE id = $1', [id])).papel, papel);
  }
});

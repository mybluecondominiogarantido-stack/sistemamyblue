'use strict';
/* Testes do portal (node --test). Usam HTMLs sintéticos, sem dados reais. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx, dataDir;

const HTML_RENEG = `<!DOCTYPE html><html><head><title>MyBlue — Controle de Renegociações</title></head><body><script>
const SHEET_URL_BUILTIN = "https://script.google.com/macros/s/AAA/exec";
const SHEET_HEADERS = ["ID","Condomínio","Status"];
const TICKET_HEADERS = ["ID","Assunto"];
function isAppsScript(url){ return /script\\.google\\.com\\/macros\\/.*\\/exec/.test(url||''); }
</script></body></html>`;
const HTML_PARC = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Central de Prestação de Contas — Comissão de parceiros</title></head>
<body><script>var SHEET_URL_BUILTIN = "https://script.google.com/macros/s/BBB/exec";</script></body></html>`;
const HTML_SIMPLES = '<!doctype html><html><head><title>MyBlue — Central de Ferramentas — Setor Crédito</title></head><body>ok</body></html>';

/* cliente HTTP com cookie */
function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (cookie) headers.cookie = cookie;
    let body;
    if (corpo !== undefined) {
      if (typeof corpo === 'string' || Buffer.isBuffer(corpo)) { body = corpo; headers['content-type'] ||= 'text/plain'; }
      else { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
    }
    const r = await fetch(base + url, { method: metodo, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    if (opts.bruto) return { status: r.status, headers: r.headers, buffer: Buffer.from(await r.arrayBuffer()) };
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: r.status, json, texto, headers: r.headers };
  };
}

async function logar(email, senha) {
  const c = cliente();
  const r = await c('POST', '/api/auth/login', { email, senha });
  return { c, r };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myblue-teste-'));
  // TEST_DATABASE_URL roda os testes num Postgres de verdade (o banco é apagado!); sem ele, usa o Postgres embutido em memória
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
  servidor = http.createServer({ maxHeaderSize: 512 * 1024 }, r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('anônimo é mandado para o login e a API recusa', async () => {
  const c = cliente();
  const r = await c('GET', '/');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/login');
  assert.equal((await c('GET', '/api/modulos')).status, 401);
  const m = await c('GET', '/m/credito/');
  assert.equal(m.status, 302);
  assert.match(m.headers.get('location'), /^\/login\?volta=/);
});

test('login: senha errada, certa e cookie seguro', async () => {
  const errado = await logar('admin@teste.com', 'nada1234');
  assert.equal(errado.r.status, 401);
  assert.equal((await logar('admin@teste.com', '  Admin1234 \n')).r.status, 200); // espaços da cópia
  const { c, r } = await logar('ADMIN@teste.com', 'Admin1234');
  assert.equal(r.status, 200);
  assert.equal(r.json.usuario.papel, 'admin');
  assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const lista = await c('GET', '/api/modulos');
  assert.equal(lista.status, 200);
  assert.deepEqual(lista.json.modulos.map((m) => m.slug).sort(), ['cobranca', 'credito', 'parceiros', 'renegociacoes', 'suprimentos']);
  const sair = await c('POST', '/api/auth/logout');
  assert.equal(sair.status, 200);
  assert.equal((await c('GET', '/api/modulos')).status, 401);
});

test('bloqueia após muitas tentativas de login', async () => {
  for (let i = 0; i < 8; i++) await logar('ninguem@teste.com', 'errada123');
  const r = await logar('ninguem@teste.com', 'errada123');
  assert.equal(r.r.status, 429);
});

test('requisições de outro site são recusadas (CSRF)', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  const r = await c('POST', '/api/admin/usuarios', { nome: 'X', email: 'x@x.com' }, { headers: { origin: 'https://site-malicioso.com' } });
  assert.equal(r.status, 403);
});

test('usuário comum: primeiro acesso, troca de senha e permissões', async () => {
  const { c: adm } = await logar('admin@teste.com', 'Admin1234');
  assert.equal((await adm('PUT', '/api/admin/modulos/credito/arquivo', HTML_SIMPLES, { headers: { 'content-type': 'text/html' } })).status, 200);
  const novo = await adm('POST', '/api/admin/usuarios', { nome: 'Bia Lima', email: 'bia@teste.com', modulos: ['credito'] });
  assert.equal(novo.status, 201);
  const temp = novo.json.senha_temporaria;
  assert.ok(temp && temp.length >= 12);
  assert.equal((await adm('POST', '/api/admin/usuarios', { nome: 'Outra', email: 'BIA@teste.com' })).status, 409);

  const { c, r } = await logar('bia@teste.com', temp);
  assert.equal(r.json.usuario.trocar_senha, true);
  const bloqueado = await c('GET', '/api/modulos');
  assert.equal(bloqueado.status, 403);
  assert.equal(bloqueado.json.trocar_senha, true);
  assert.equal((await c('POST', '/api/auth/senha', { atual: temp, nova: 'curta' })).status, 400);
  assert.equal((await c('POST', '/api/auth/senha', { atual: temp, nova: 'NovaSenha123' })).status, 200);

  const lista = await c('GET', '/api/modulos');
  assert.deepEqual(lista.json.modulos.map((m) => m.slug), ['credito']);
  assert.equal((await c('GET', '/m/credito/')).status, 200);
  assert.equal((await c('GET', '/m/cobranca/')).status, 403);
  assert.equal((await c('GET', '/api/admin/usuarios')).status, 403);
  assert.equal((await c('GET', '/api/gas/renegociacoes')).status, 403);

  // desativar encerra a sessão
  const id = novo.json.id;
  assert.equal((await adm('PATCH', `/api/admin/usuarios/${id}`, { ativo: false })).status, 200);
  assert.equal((await c('GET', '/api/modulos')).status, 401);
  assert.equal((await logar('bia@teste.com', 'NovaSenha123')).r.status, 401);
});

test('não deixa remover o último administrador', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  const r = await c('PATCH', '/api/admin/usuarios/1', { papel: 'usuario' });
  assert.equal(r.status, 400);
});

test('envio de HTML: validação, injeção da ponte e versões', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  const ruim = await c('PUT', '/api/admin/modulos/cobranca/arquivo', 'isto não é html', { headers: { 'content-type': 'text/html' } });
  assert.equal(ruim.status, 400);
  const v1 = await c('PUT', '/api/admin/modulos/cobranca/arquivo', HTML_SIMPLES.replace('ok', 'versao1'), { headers: { 'content-type': 'text/html' } });
  assert.equal(v1.status, 200);
  assert.match(v1.json.aviso, /parece ser da ferramenta/); // título é do Crédito
  const v2 = await c('PUT', '/api/admin/modulos/cobranca/arquivo', HTML_SIMPLES.replace('ok', 'versao2'), { headers: { 'content-type': 'text/html' } });
  let pagina = await c('GET', '/m/cobranca/');
  assert.match(pagina.texto, /versao2/);
  assert.match(pagina.texto, /<head><script>window\.__MYBLUE__=/);
  assert.equal(pagina.headers.get('cache-control'), 'no-store');
  assert.equal((await c('POST', `/api/admin/modulos/cobranca/versoes/${v1.json.versao}/usar`)).status, 200);
  pagina = await c('GET', '/m/cobranca/');
  assert.match(pagina.texto, /versao1/);
  const versoes = await c('GET', '/api/admin/modulos/cobranca/versoes');
  assert.equal(versoes.json.versoes.length, 2);
  assert.ok(v2.json.versao > v1.json.versao);
});

test('reconhece o módulo pelo título do HTML', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  const r = await c('POST', '/api/admin/modulos/reconhecer', HTML_PARC, { headers: { 'content-type': 'text/html' } });
  assert.equal(r.json.slug, 'parceiros');
});

test('armazenamento no servidor: equipe e por usuário', async () => {
  const { c: adm } = await logar('admin@teste.com', 'Admin1234');
  await adm('POST', '/api/admin/modulos', { slug: 'equipe-x', nome: 'Equipe X', armazenamento: 'compartilhado' });
  await adm('POST', '/api/admin/modulos', { slug: 'pessoal-x', nome: 'Pessoal X', armazenamento: 'usuario' });
  const u = await adm('POST', '/api/admin/usuarios', { nome: 'Caio', email: 'caio@teste.com', senha: 'Caio12345', modulos: ['equipe-x', 'pessoal-x'] });
  const { c } = await logar('caio@teste.com', 'Caio12345');
  await c('POST', '/api/auth/senha', { atual: 'Caio12345', nova: 'Caio123456' });
  assert.ok(u.json.id);

  assert.equal((await adm('POST', '/api/armazenamento/equipe-x', { set: { pedidos: '[1,2]', tema: 'claro' } })).status, 200);
  assert.deepEqual((await c('GET', '/api/armazenamento/equipe-x')).json.dados, { pedidos: '[1,2]', tema: 'claro' });
  await c('POST', '/api/armazenamento/equipe-x', { del: ['tema'] });
  assert.deepEqual((await adm('GET', '/api/armazenamento/equipe-x')).json.dados, { pedidos: '[1,2]' });

  await adm('POST', '/api/armazenamento/pessoal-x', { set: { rascunho: 'do admin' } });
  await c('POST', '/api/armazenamento/pessoal-x', { set: { rascunho: 'do caio' } });
  assert.deepEqual((await adm('GET', '/api/armazenamento/pessoal-x')).json.dados, { rascunho: 'do admin' });
  assert.deepEqual((await c('GET', '/api/armazenamento/pessoal-x')).json.dados, { rascunho: 'do caio' });
  await c('POST', '/api/armazenamento/pessoal-x', { limpar: true });
  assert.deepEqual((await c('GET', '/api/armazenamento/pessoal-x')).json.dados, {});

  // módulo "só no navegador" não aceita gravação no servidor
  assert.equal((await adm('POST', '/api/armazenamento/credito', { set: { a: '1' } })).status, 409);
  // os dados entram na página da ferramenta
  await adm('PUT', '/api/admin/modulos/equipe-x/arquivo', '<!doctype html><html><head></head><body></body></html>', { headers: { 'content-type': 'text/html' } });
  const pag = await c('GET', '/m/equipe-x/');
  assert.match(pag.texto, /"modo":"compartilhado"/);
  assert.match(pag.texto, /"pedidos":"\[1,2\]"/);
});

test('planilha interna em linhas (Renegociações): protocolo do Apps Script', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  await c('PUT', '/api/admin/modulos/renegociacoes/arquivo', HTML_RENEG, { headers: { 'content-type': 'text/html' } });

  // modo Google: HTML sai sem mudanças no link
  let pag = await c('GET', '/m/renegociacoes/');
  assert.match(pag.texto, /script\.google\.com\/macros\/s\/AAA/);

  // cabeçalho vem da constante do HTML
  let r = await c('GET', '/api/gas/renegociacoes?callback=cb_1');
  assert.equal(r.headers.get('content-type').split(';')[0], 'application/javascript');
  assert.equal(r.texto, '/**/cb_1([["ID","Condomínio","Status"]]);');
  assert.equal((await c('GET', '/api/gas/renegociacoes?callback=alert(1)')).status, 400);

  const post = (corpo) => c('POST', '/api/gas/renegociacoes', JSON.stringify(corpo), { headers: { 'content-type': 'text/plain;charset=utf-8' } });
  assert.equal((await post({ action: 'add', row: ['a1', 'Residencial Alfa', 'Fechado'] })).json.ok, true);
  await post({ action: 'addMany', rows: [['a2', 'Residencial Beta', 'Em negociação'], ['a3', 'Residencial Gama', 'Fechado']] });
  await post({ action: 'update', id: 'a2', row: ['a2', 'Residencial Beta Atualizado', 'Fechado'] });
  await post({ action: 'delete', id: 'a3' });
  r = await c('GET', '/api/gas/renegociacoes');
  assert.deepEqual(r.json, [['ID', 'Condomínio', 'Status'], ['a1', 'Residencial Alfa', 'Fechado'], ['a2', 'Residencial Beta Atualizado', 'Fechado']]);

  await post({ action: 'add', sheet: 'tickets', row: ['t1', 'Boleto duplicado'] });
  assert.equal((await post({ action: 'dedupe', sheet: 'tickets' })).json.ok, true);
  r = await c('GET', '/api/gas/renegociacoes?sheet=tickets');
  assert.deepEqual(r.json, [['ID', 'Assunto'], ['t1', 'Boleto duplicado']]);

  await post({ action: 'replaceAll', sheet: 'renegociacoes', rows: [['z9', 'Único', 'Fechado']] });
  r = await c('GET', '/api/gas/renegociacoes');
  assert.equal(r.json.length, 2);
  assert.equal((await post({ action: 'add' })).status, 400);
  assert.equal((await post({ action: 'qualquer' })).status, 400);

  // modo interno: o HTML passa a apontar para o portal
  await c('PATCH', '/api/admin/modulos/renegociacoes', { fonte_dados: 'interno' });
  pag = await c('GET', '/m/renegociacoes/');
  assert.match(pag.texto, /SHEET_URL_BUILTIN = "\/api\/gas\/renegociacoes"/);
  assert.match(pag.texto, /indexOf\('\/api\/gas\/'\)===0\) return true;/);
  assert.doesNotMatch(pag.texto, /macros\/s\/AAA/);

  // CSV
  const csv = await c('GET', '/api/admin/modulos/renegociacoes/dados/renegociacoes.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.texto, /ID;Condomínio;Status\r\nz9;Único;Fechado/);
});

test('planilha interna em objetos (Parceiros): upsert/delete via JSONP', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  await c('PUT', '/api/admin/modulos/parceiros/arquivo', HTML_PARC, { headers: { 'content-type': 'text/html' } });
  const item = encodeURIComponent(JSON.stringify({ id: 'p1', nome: 'Parceiro Um', tags: '["venda"]' }));
  const mesmoSite = { headers: { 'sec-fetch-site': 'same-origin' } };

  let r = await c('GET', `/api/gas/parceiros?sheet=partners&action=upsert&item=${item}&callback=mbCb1`, undefined, mesmoSite);
  assert.equal(r.texto, '/**/mbCb1({"ok":true});');
  // gravação por link vindo de outro site é recusada
  r = await c('GET', `/api/gas/parceiros?sheet=partners&action=delete&id=p1&callback=mbCb2`, undefined, { headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(r.status, 403);
  // status usa "key" como identificador
  const st = encodeURIComponent(JSON.stringify({ key: '2026-09_p1', pago: true }));
  await c('GET', `/api/gas/parceiros?sheet=status&action=upsert&item=${st}`, undefined, mesmoSite);
  await c('GET', `/api/gas/parceiros?sheet=status&action=upsert&item=${encodeURIComponent(JSON.stringify({ key: '2026-09_p1', pago: false }))}`, undefined, mesmoSite);
  r = await c('GET', '/api/gas/parceiros?sheet=status');
  assert.deepEqual(r.json, [{ key: '2026-09_p1', pago: false }]);
  r = await c('GET', '/api/gas/parceiros?sheet=partners');
  assert.deepEqual(r.json, [{ id: 'p1', nome: 'Parceiro Um', tags: '["venda"]' }]);
  r = await c('GET', '/api/gas/parceiros?sheet=partners&action=delete&id=p1', undefined, mesmoSite);
  assert.equal(r.json.ok, true);
  assert.deepEqual((await c('GET', '/api/gas/parceiros?sheet=partners')).json, []);
  assert.equal((await c('GET', `/api/gas/parceiros?sheet=partners&action=upsert&item=%7B%7D`, undefined, mesmoSite)).status, 400);
  // URL longa (como o Apps Script aceitava)
  const grande = encodeURIComponent(JSON.stringify({ id: 'c1', vinculosJSON: 'x'.repeat(40000) }));
  assert.equal((await c('GET', `/api/gas/parceiros?sheet=condos&action=upsert&item=${grande}`, undefined, mesmoSite)).status, 200);
});

test('importação da planilha Google e exportação', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  let r = await c('POST', '/api/admin/modulos/renegociacoes/importar', {
    colecao: 'renegociacoes',
    dados: [['ID', 'Condomínio', 'Status'], ['x1', 'A', 'Fechado'], ['x1', 'A duplicada', 'Fechado'], ['', 'Sem ID', 'Fechado'], ['', '', '']],
  });
  assert.equal(r.json.total, 2);
  r = await c('GET', '/api/gas/renegociacoes');
  assert.deepEqual(r.json.slice(1).map((l) => l[1]), ['A', 'Sem ID']);

  r = await c('POST', '/api/admin/modulos/parceiros/importar', { colecao: 'entries', dados: [{ id: 'e1', valor: 10 }, { id: 'e2', valor: 20 }, { semId: true }] });
  assert.equal(r.json.total, 2);

  const exp = await c('GET', '/api/admin/modulos/parceiros/dados');
  assert.equal(exp.status, 200);
  assert.match(exp.headers.get('content-disposition'), /attachment/);
  assert.equal(exp.json.colecoes.entries.registros.length, 2);
});

test('auditoria registra as ações', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  const r = await c('GET', '/api/admin/auditoria?limite=500');
  const acoes = new Set(r.json.eventos.map((e) => e.acao));
  for (const a of ['login', 'login_falha', 'usuario_criado', 'arquivo_enviado', 'registro_add', 'registro_upsert', 'dados_importados', 'modulo_aberto']) {
    assert.ok(acoes.has(a), 'faltou ' + a);
  }
  const filtrado = await c('GET', '/api/admin/auditoria?ocultar_aberturas=1');
  assert.ok(filtrado.json.eventos.every((e) => e.acao !== 'modulo_aberto'));
});

test('remover módulo exige confirmação e apaga as versões do HTML', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  await c('POST', '/api/admin/modulos', { slug: 'temporario', nome: 'Temporário' });
  await c('PUT', '/api/admin/modulos/temporario/arquivo', HTML_SIMPLES, { headers: { 'content-type': 'text/html' } });
  const contar = async () => (await ctx.db.um("SELECT COUNT(*)::int AS n FROM modulo_versoes WHERE modulo_slug = 'temporario'")).n;
  assert.equal(await contar(), 1);
  assert.equal((await c('DELETE', '/api/admin/modulos/temporario')).status, 400);
  assert.equal((await c('DELETE', '/api/admin/modulos/temporario?confirmar=temporario')).status, 200);
  assert.equal(await contar(), 0);
  assert.equal((await c('POST', '/api/admin/modulos', { slug: 'Inválido!', nome: 'x' })).status, 400);
});

test('backup do banco (JSON, sem hashes de senha)', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  const r = await c('GET', '/api/admin/backup');
  assert.equal(r.status, 200);
  assert.equal(r.json.sistema, 'portal-myblue');
  assert.ok(r.json.tabelas.usuarios.length >= 1);
  assert.ok(r.json.tabelas.usuarios.every((u) => !('senha_hash' in u)));
  assert.ok(r.json.tabelas.modulo_versoes.length >= 1);
  assert.equal(typeof r.json.tabelas.modulo_versoes[0].conteudo, 'string');
});

test('saúde informa o banco', async () => {
  const r = await fetch(base + '/saude');
  assert.equal(r.status, 200);
  assert.ok(['embutido', 'postgres'].includes((await r.json()).banco));
});

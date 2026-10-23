'use strict';
/* Testes do portal (node --test). Usam HTMLs sintéticos, sem dados reais. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const { abrirZip } = require('../server/planilha');

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
  assert.deepEqual(lista.json.modulos.map((m) => m.slug).sort(), ['boletos', 'cobranca', 'credito', 'parceiros', 'premiacoes', 'renegociacoes', 'sindicos', 'suprimentos']);
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
  const r = await c('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'X', email: 'x@x.com' }, { headers: { origin: 'https://site-malicioso.com' } });
  assert.equal(r.status, 403);
});

test('usuário comum: primeiro acesso, troca de senha e permissões', async () => {
  const { c: adm } = await logar('admin@teste.com', 'Admin1234');
  assert.equal((await adm('PUT', '/api/admin/modulos/credito/arquivo', HTML_SIMPLES, { headers: { 'content-type': 'text/html' } })).status, 200);
  const novo = await adm('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'Bia Lima', email: 'bia@teste.com', modulos: ['credito'] });
  assert.equal(novo.status, 201);
  const temp = novo.json.senha_temporaria;
  assert.ok(temp && temp.length >= 12);
  assert.equal((await adm('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'Outra', email: 'BIA@teste.com' })).status, 409);

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
  const u = await adm('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'Caio', email: 'caio@teste.com', senha: 'Caio12345', modulos: ['equipe-x', 'pessoal-x'] });
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

  // conferência de versão: quem grava sobre uma versão velha recebe 409 e nada é gravado
  const v0 = (await adm('GET', '/api/armazenamento/equipe-x')).json.versoes.pedidos;
  assert.equal((await adm('POST', '/api/armazenamento/equipe-x', { set: { pedidos: '[1,2,3]' }, base: { pedidos: v0 } })).json.versoes.pedidos, v0 + 1);
  const velho = await c('POST', '/api/armazenamento/equipe-x', { set: { pedidos: '[9]', nova: 'x' }, base: { pedidos: v0, nova: 0 } });
  assert.equal(velho.status, 409);
  assert.deepEqual(velho.json.conflito, { pedidos: { valor: '[1,2,3]', versao: v0 + 1 } });
  assert.deepEqual((await c('GET', '/api/armazenamento/equipe-x')).json.dados, { pedidos: '[1,2,3]' }); // o lote inteiro ficou de fora
  // gravar o mesmo valor que já está no banco não é conflito, nem muda a versão
  assert.equal((await c('POST', '/api/armazenamento/equipe-x', { set: { pedidos: '[1,2,3]' }, base: { pedidos: v0 } })).json.versoes.pedidos, v0 + 1);
  // apagar com versão velha também é conflito; com a versão certa, apaga
  assert.equal((await c('POST', '/api/armazenamento/equipe-x', { del: ['pedidos'], base: { pedidos: v0 } })).status, 409);
  assert.equal((await c('POST', '/api/armazenamento/equipe-x', { del: ['pedidos'], base: { pedidos: v0 + 1 } })).status, 200);
  assert.deepEqual((await c('GET', '/api/armazenamento/equipe-x')).json.dados, {});
  // sem base (ferramentas que gravam direto na API), continua gravando por cima
  assert.equal((await c('POST', '/api/armazenamento/equipe-x', { set: { pedidos: '[1,2]' } })).status, 200);

  // módulo "só no navegador" não aceita gravação no servidor
  assert.equal((await adm('POST', '/api/armazenamento/credito', { set: { a: '1' } })).status, 409);
  // os dados entram na página da ferramenta
  await adm('PUT', '/api/admin/modulos/equipe-x/arquivo', '<!doctype html><html><head></head><body></body></html>', { headers: { 'content-type': 'text/html' } });
  const pag = await c('GET', '/m/equipe-x/');
  assert.match(pag.texto, /"modo":"compartilhado"/);
  assert.match(pag.texto, /"pedidos":"\[1,2\]"/);
  assert.match(pag.texto, /"versoes":\{"pedidos":\d+\}/);
});

test('ferramenta desativada: ninguém além da administração lê ou grava os dados dela', async () => {
  const { c: adm } = await logar('admin@teste.com', 'Admin1234');
  const { c } = await logar('caio@teste.com', 'Caio123456');
  assert.equal((await c('GET', '/api/armazenamento/equipe-x')).status, 200);
  await adm('PATCH', '/api/admin/modulos/equipe-x', { ativo: false });
  assert.equal((await c('GET', '/api/armazenamento/equipe-x')).status, 403);
  assert.equal((await c('POST', '/api/armazenamento/equipe-x', { set: { x: '1' } })).status, 403);
  assert.equal((await adm('GET', '/api/armazenamento/equipe-x')).status, 200);
  await adm('PATCH', '/api/admin/modulos/equipe-x', { ativo: true });
  assert.equal((await c('GET', '/api/armazenamento/equipe-x')).status, 200);
});

test('baixar todas as ferramentas em uso num .zip', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  await c('POST', '/api/admin/modulos', { slug: 'zip-x', nome: 'Zip X', armazenamento: 'navegador' });
  await c('PUT', '/api/admin/modulos/zip-x/arquivo', '<!doctype html><title>Zip X</title><p>olá</p>', { headers: { 'content-type': 'text/html' } });
  const r = await c('GET', '/api/admin/modulos-em-uso.zip', undefined, { bruto: true });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/zip');
  const z = abrirZip(r.buffer, () => true);
  assert.equal(z.get('zip-x.html').toString('utf8'), '<!doctype html><title>Zip X</title><p>olá</p>');
  assert.match(z.get('LEIAME.txt').toString('utf8'), /zip-x\.html — Zip X · versão \d+/);
});

test('bibliotecas das CDNs vêm do portal', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  await c('POST', '/api/admin/modulos', { slug: 'cdn-x', nome: 'CDN X', armazenamento: 'navegador' });
  await c('PATCH', '/api/admin/modulos/cdn-x', { isolada: false }); // ferramenta nova nasce isolada; aqui, o caso sem isolamento
  await c('PUT', '/api/admin/modulos/cdn-x/arquivo', '<!doctype html><html><head><script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script></head>' +
    '<body><script>const W = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js"; const U = \'//unpkg.com/a@1.0.0/a.js\';</script></body></html>', { headers: { 'content-type': 'text/html' } });
  const pag = (await c('GET', '/m/cdn-x/')).texto;
  assert.match(pag, /src="\/cdn\/cdnjs\/ajax\/libs\/xlsx\/0\.18\.5\/xlsx\.full\.min\.js"/);
  assert.match(pag, /"\/cdn\/jsdelivr\/npm\/pdfjs-dist@3\.11\.174\/build\/pdf\.worker\.min\.js"/);
  assert.match(pag, /'\/cdn\/unpkg\/a@1\.0\.0\/a\.js'/);
  assert.doesNotMatch(pag, /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com/);

  // cópia guardada: entregue pelo portal, com o tipo certo e cache longo (endereço com versão)
  const url = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  await ctx.db.q('INSERT INTO cdn_cache (url, tipo, conteudo, tamanho) VALUES ($1, $2, $3, $4) ON CONFLICT (url) DO NOTHING', [url, 'application/javascript; charset=utf-8', Buffer.from('var XLSX={};'), 12]);
  const r = await c('GET', '/cdn/cdnjs/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  assert.equal(r.status, 200);
  assert.equal(r.texto, 'var XLSX={};');
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(r.headers.get('cache-control'), /immutable/);
  // SVG e HTML executam script se abertos direto: nunca saem da origem do portal, vão para a CDN
  for (const tipo of ['svg', 'html', 'htm', 'xml']) {
    const x = await c('GET', `/cdn/unpkg/pacote-qualquer@1.0.0/x.${tipo}`);
    assert.equal(x.status, 302, tipo);
    assert.equal(x.headers.get('location'), `https://unpkg.com/pacote-qualquer@1.0.0/x.${tipo}`);
  }
  // cópia antiga de um SVG (guardada antes): também não é entregue
  await ctx.db.q("INSERT INTO cdn_cache (url, tipo, conteudo, tamanho) VALUES ('https://unpkg.com/p@1.0.0/i.svg', 'image/svg+xml', $1, 10)", [Buffer.from('<svg></svg>')]);
  assert.equal((await c('GET', '/cdn/unpkg/p@1.0.0/i.svg')).status, 302);
  // endereço sem extensão: só se a cópia for script/estilo/JSON
  await ctx.db.q("INSERT INTO cdn_cache (url, tipo, conteudo, tamanho) VALUES ('https://unpkg.com/lib@2.0.0', 'application/javascript; charset=utf-8', $1, 6), ('https://unpkg.com/pag@1.0.0', 'text/html', $1, 6)", [Buffer.from('var a;')]);
  const semExt = await c('GET', '/cdn/unpkg/lib@2.0.0');
  assert.equal(semExt.status, 200);
  assert.equal(semExt.headers.get('content-security-policy'), null);
  assert.equal((await c('GET', '/cdn/unpkg/pag@1.0.0')).status, 302);
  // o que não é script sai com sandbox
  await ctx.db.q("INSERT INTO cdn_cache (url, tipo, conteudo, tamanho) VALUES ('https://cdn.jsdelivr.net/npm/f@1.0.0/f.png', 'image/png', $1, 3)", [Buffer.from('PNG')]);
  const png = await c('GET', '/cdn/jsdelivr/npm/f@1.0.0/f.png');
  assert.equal(png.status, 200);
  assert.match(png.headers.get('content-security-policy'), /sandbox/);
  // endereço inválido e sem login
  assert.equal((await c('GET', '/cdn/cdnjs/ajax/libs/x/1.0/a;b.js')).status, 400);
  assert.equal((await c('GET', '/cdn/outra/a.js')).status, 404);
  assert.equal((await cliente()('GET', '/cdn/cdnjs/ajax/libs/xlsx/0.18.5/xlsx.full.min.js')).status, 401);
});

test('planilha interna em linhas (Renegociações): protocolo do Apps Script', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  await c('PUT', '/api/admin/modulos/renegociacoes/arquivo', HTML_RENEG, { headers: { 'content-type': 'text/html' } });

  // modo Google: HTML sai sem mudanças no link
  let pag = await c('GET', '/m/renegociacoes/');
  assert.match(pag.texto, /script\.google\.com\/macros\/s\/AAA/);

  // cabeçalho vem da constante do HTML
  let r = await c('GET', '/api/gas/renegociacoes?callback=cb_1', undefined, { headers: { 'sec-fetch-site': 'same-origin' } });
  assert.equal(r.headers.get('content-type').split(';')[0], 'application/javascript');
  assert.equal(r.texto, '/**/cb_1([["ID","Condomínio","Status"]]);');
  assert.equal((await c('GET', '/api/gas/renegociacoes?callback=alert(1)')).status, 400);
  // leitura por JSONP incluída a partir de outro site (mesmo com o cookie): recusada
  r = await c('GET', '/api/gas/renegociacoes?callback=cb_2', undefined, { headers: { 'sec-fetch-site': 'same-site' } });
  assert.equal(r.status, 403);
  assert.doesNotMatch(r.texto, /Condomínio/);

  const post = (corpo) => c('POST', '/api/gas/renegociacoes', JSON.stringify(corpo), { headers: { 'content-type': 'text/plain;charset=utf-8' } });
  assert.equal((await post({ action: 'add', row: ['a1', 'Residencial Alfa', 'Fechado'] })).json.ok, true);
  await post({ action: 'addMany', rows: [['a2', 'Residencial Beta', 'Em negociação'], ['a3', 'Residencial Gama', 'Fechado']] });
  await post({ action: 'update', id: 'a2', row: ['a2', 'Residencial Beta Atualizado', 'Fechado'] });
  // conferência "antes": com a linha velha, recusa; com a atual, grava
  assert.equal((await post({ action: 'update', id: 'a2', row: ['a2', 'Beta', 'Em negociação'], antes: ['a2', 'Residencial Beta', 'Em negociação'] })).status, 409);
  assert.equal((await post({ action: 'delete', id: 'a2', antes: ['a2', 'Residencial Beta', 'Em negociação'] })).status, 409);
  assert.equal((await post({ action: 'update', id: 'a2', row: ['a2', 'Residencial Beta Atualizado', 'Fechado'], antes: ['a2', 'Residencial Beta Atualizado', 'Fechado'] })).json.ok, true);
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
  // texto que viraria fórmula no Excel sai neutralizado; número negativo continua número
  await c('POST', '/api/gas/renegociacoes', JSON.stringify({ action: 'add', row: ['f1', '=HYPERLINK("http://x")', '-12,5'] }), { headers: { 'content-type': 'text/plain' } });
  const csv2 = (await c('GET', '/api/admin/modulos/renegociacoes/dados/renegociacoes.csv')).texto;
  assert.match(csv2, /f1;"'=HYPERLINK\(""http:\/\/x""\)";-12,5/);
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
  // conferência "antes" (JSONB reordena as chaves: a comparação ignora a ordem)
  const gravar = (corpo) => c('POST', '/api/gas/parceiros', JSON.stringify(corpo), { headers: { 'content-type': 'text/plain;charset=utf-8' } });
  r = await gravar({ sheet: 'partners', action: 'upsert', item: { id: 'p1', nome: 'Parceiro 1', tags: '["venda"]' }, antes: { tags: '["venda"]', nome: 'Parceiro Um', id: 'p1' } });
  assert.equal(r.json.ok, true);
  r = await gravar({ sheet: 'partners', action: 'upsert', item: { id: 'p1', nome: 'Outro nome', tags: '[]' }, antes: { id: 'p1', nome: 'Parceiro Um', tags: '["venda"]' } });
  assert.equal(r.status, 409);
  assert.deepEqual(r.json.atual, { id: 'p1', nome: 'Parceiro 1', tags: '["venda"]' });
  // registro novo: antes = null; se outra pessoa já criou, conflito
  assert.equal((await gravar({ sheet: 'partners', action: 'upsert', item: { id: 'p9', nome: 'Novo' }, antes: null })).json.ok, true);
  assert.equal((await gravar({ sheet: 'partners', action: 'upsert', item: { id: 'p9', nome: 'Outro' }, antes: null })).status, 409);
  assert.equal((await gravar({ sheet: 'partners', action: 'delete', id: 'p9', antes: { id: 'p9', nome: 'Velho' } })).status, 409);
  assert.equal((await gravar({ sheet: 'partners', action: 'delete', id: 'p9', antes: { id: 'p9', nome: 'Novo' } })).json.ok, true);
  await gravar({ sheet: 'partners', action: 'upsert', item: { id: 'p1', nome: 'Parceiro Um', tags: '["venda"]' } });
  r = await c('GET', '/api/gas/parceiros?sheet=partners&action=delete&id=p1', undefined, mesmoSite);
  assert.equal(r.json.ok, true);
  assert.deepEqual((await c('GET', '/api/gas/parceiros?sheet=partners')).json, []);
  assert.equal((await c('GET', `/api/gas/parceiros?sheet=partners&action=upsert&item=%7B%7D`, undefined, mesmoSite)).status, 400);
  // URL longa (como o Apps Script aceitava)
  const grande = encodeURIComponent(JSON.stringify({ id: 'c1', vinculosJSON: 'x'.repeat(40000) }));
  assert.equal((await c('GET', `/api/gas/parceiros?sheet=condos&action=upsert&item=${grande}`, undefined, mesmoSite)).status, 200);
});

test('planilha posicional (Controle de Pedidos): incluir, alterar pela linha e marcar pago', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  // ferramenta empacotada: o código fica dentro de uma string, com aspas escapadas
  const HTML_PED = '<!DOCTYPE html><html><head><title>MyBlue — Controle de Pedidos</title></head><body><script type="__bundler/template">"'
    + 'const SHEET_URL_BUILTIN = \\"https://script.google.com/macros/s/CCC/exec\\";\\nfunction isAppsScript(url){ return /x/.test(url); }'
    + '"</script></body></html>';
  assert.equal((await c('PUT', '/api/admin/modulos/suprimentos/arquivo', HTML_PED, { headers: { 'content-type': 'text/html' } })).status, 200);
  const adm = (await c('GET', '/api/admin/modulos')).json.modulos.find((m) => m.slug === 'suprimentos');
  assert.equal(adm.adaptador, 'gas-posicional');
  assert.equal(adm.google_url_detectada, 'https://script.google.com/macros/s/CCC/exec');

  await c('PATCH', '/api/admin/modulos/suprimentos', { fonte_dados: 'interno' });
  const pag = await c('GET', '/m/suprimentos/');
  assert.match(pag.texto, /SHEET_URL_BUILTIN = \\"\/api\/gas\/suprimentos\\"/);
  assert.match(pag.texto, /indexOf\('\/api\/gas\/'\)===0\) return true;/);

  // planilha vazia: devolve só o cabeçalho padrão
  let r = await c('GET', '/api/gas/suprimentos?callback=mbcb_1', undefined, { headers: { 'sec-fetch-site': 'same-origin' } });
  assert.match(r.texto, /^\/\*\*\/mbcb_1\(\[\["Nº do Pedido"/);

  const post = (corpo) => c('POST', '/api/gas/suprimentos', JSON.stringify(corpo), { headers: { 'content-type': 'text/plain;charset=utf-8' } });
  await post({ action: 'addMany', rows: [
    ['101', 'Papelaria', 50, 'À vista', '', '10/11/2026', 'Em aberto'],
    ['102', 'Gráfica', 300, 'Parcelado', '1/2', '15/11/2026', 'Em aberto'],
    ['102', 'Gráfica', 300, 'Parcelado', '2/2', '15/12/2026', 'Em aberto'],
  ] });
  // marca a 2ª parcela (linha 4 da planilha) como paga
  assert.equal((await post({ action: 'setStatus', row: 4, num: '102', venc: '15/12/2026', status: 'Pago' })).json.ok, true);
  // edita o pedido 101 (linha 2)
  await post({ action: 'update', row: 2, num: '101', desc: 'Papelaria Central', valor: 55, venc: '12/11/2026', status: 'Em aberto' });
  r = await c('GET', '/api/gas/suprimentos');
  assert.deepEqual(r.json.slice(1), [
    ['101', 'Papelaria Central', '55', 'À vista', '', '12/11/2026', 'Em aberto'],
    ['102', 'Gráfica', '300', 'Parcelado', '1/2', '15/11/2026', 'Em aberto'],
    ['102', 'Gráfica', '300', 'Parcelado', '2/2', '15/12/2026', 'Pago'],
  ]);
  // posição desatualizada: acha pelo nº do pedido + vencimento (inclusive com data no formato da planilha Google)
  await c('POST', '/api/admin/modulos/suprimentos/importar', { colecao: 'pedidos', dados: [
    ['Nº do Pedido', 'Descrição', 'Valor', 'Forma de Pagamento', 'Parcelas', 'Vencimento', 'Status'],
    ['200', 'Limpeza', 80, 'À vista', '', '2026-11-20T03:00:00.000Z', 'Em aberto'],
    ['200', 'Limpeza', 80, 'À vista', '', '2026-11-20T03:00:00.000Z', 'Em aberto'],
  ] });
  assert.equal((await c('GET', '/api/gas/suprimentos')).json.length, 3); // cabeçalho + 2 linhas (repetidas são mantidas)
  assert.equal((await post({ action: 'setStatus', row: 99, num: '200', venc: '20/11/2026', status: 'Pago' })).json.ok, true);
  assert.equal((await post({ action: 'setStatus', row: 2, num: '999', venc: '20/11/2026', status: 'Pago' })).status, 409);
  // conferência "antes": quem edita com a tela velha não desfaz o "Pago" de outra pessoa
  const conf = await post({ action: 'update', row: 2, num: '200', desc: 'Limpeza geral', valor: 80, venc: '20/11/2026', status: 'Em aberto',
    antes: { num: '200', desc: 'Limpeza', valor: 80, venc: '20/11/2026', status: 'Em aberto' } });
  assert.equal(conf.status, 409);
  assert.equal(conf.json.conflito, true);
  // com o estado atual certo, grava
  assert.equal((await post({ action: 'setStatus', row: 2, num: '200', venc: '20/11/2026', status: 'Em aberto', antes: { status: 'Pago' } })).json.ok, true);
  // excluir: pelo nº do pedido + vencimento; sem nº não apaga
  assert.equal((await post({ action: 'delete', row: 2 })).status, 400);
  assert.equal((await post({ action: 'delete', row: 2, num: '200', venc: '20/11/2026', antes: { status: 'Em aberto' } })).json.ok, true);
  assert.equal((await c('GET', '/api/gas/suprimentos')).json.length, 2);
  const csv = await c('GET', '/api/admin/modulos/suprimentos/dados/pedidos.csv');
  assert.match(csv.texto, /Nº do Pedido;Descrição;Valor/);

  // HTML sem planilha Google (já aponta para o portal): o módulo passa sozinho para o banco interno
  await c('PATCH', '/api/admin/modulos/suprimentos', { fonte_dados: 'google' });
  const semPlanilha = HTML_PED.replace('https://script.google.com/macros/s/CCC/exec', '/api/gas/suprimentos');
  const up = await c('PUT', '/api/admin/modulos/suprimentos/arquivo', semPlanilha, { headers: { 'content-type': 'text/html' } });
  assert.equal(up.json.fonte_dados, 'interno');
  assert.equal(up.json.aviso_banco, null);
  assert.equal((await c('GET', '/api/admin/modulos')).json.modulos.find((m) => m.slug === 'suprimentos').fonte_dados, 'interno');
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

test('backup do banco (todas as tabelas, sem hashes de senha nem sessões)', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  const r = await c('GET', '/api/admin/backup', undefined, { bruto: true });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /\.jsonl\.gz"/);
  const linhas = require('zlib').gunzipSync(r.buffer).toString().trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(linhas[0].sistema, 'portal-myblue');
  assert.equal(linhas[0].versao_backup, 5);
  assert.ok(linhas.at(-1).fim);
  const de = (t) => linhas.filter((l) => l.t === t).map((l) => l.r);
  for (const t of ['regras_acesso', 'comissao_relatorios', 'comissao_leitores', 'comissao_planilhas', 'tutoriais']) assert.ok(linhas[0].tabelas.includes(t), t);
  assert.ok(!linhas[0].tabelas.includes('sessoes') && !linhas[0].tabelas.includes('cdn_cache'));
  assert.ok(de('usuarios').length >= 1);
  assert.ok(de('usuarios').every((u) => !('senha_hash' in u)));
  assert.ok(de('modulo_versoes').length >= 1);
  assert.equal(typeof de('modulo_versoes')[0].conteudo, 'string');
});

test('foto de perfil: enviar, ver, recusar arquivo inválido e remover', async () => {
  const { c } = await logar('admin@teste.com', 'Admin1234');
  // PNG 1x1 válido
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  let r = await c('PUT', '/api/auth/foto', png, { headers: { 'content-type': 'image/png' } });
  assert.equal(r.status, 200);
  assert.ok(r.json.foto_v);
  const eu = (await c('GET', '/api/auth/eu')).json.usuario;
  assert.equal(eu.foto_v, r.json.foto_v);
  // outra pessoa logada consegue ver a foto
  await c('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'Dani', email: 'dani@teste.com', senha: 'Dani12345' });
  const { c: dani } = await logar('dani@teste.com', 'Dani12345');
  const img = await dani('GET', `/api/usuarios/${eu.id}/foto?v=${eu.foto_v}`, undefined, { bruto: true });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.ok(img.buffer.equals(png));
  // sem login, não
  assert.equal((await cliente()('GET', `/api/usuarios/${eu.id}/foto`)).status, 401);
  // arquivo que não é imagem (mesmo dizendo que é) é recusado
  r = await c('PUT', '/api/auth/foto', '<script>alert(1)</script>', { headers: { 'content-type': 'image/png' } });
  assert.equal(r.status, 400);
  // lista de usuários mostra quem tem foto
  const lista = (await c('GET', '/api/admin/usuarios')).json.usuarios;
  assert.ok(lista.find((u) => u.id === eu.id).foto_v);
  assert.ok(!('foto' in lista[0]));
  // remover
  assert.equal((await c('DELETE', '/api/auth/foto')).status, 200);
  assert.equal((await dani('GET', `/api/usuarios/${eu.id}/foto`)).status, 404);
  assert.equal((await c('GET', '/api/auth/eu')).json.usuario.foto_v, null);
});

test('saúde informa o banco', async () => {
  const r = await fetch(base + '/saude');
  assert.equal(r.status, 200);
  assert.ok(['embutido', 'postgres'].includes((await r.json()).banco));
});

test('login: limite por IP vale também para quem testa a mesma senha em muitas contas', async () => {
  // até 30 tentativas erradas do mesmo IP (as dos testes anteriores contam), cada uma num e-mail diferente
  let n = 0;
  while (n < 31 && (await logar(`conta${n}@teste.com`, 'Senha12345')).r.status === 401) n++;
  assert.ok(n > 0 && n <= 30, `bloqueou depois de ${n}`);
  const r = await logar('outra-conta@teste.com', 'Senha12345');
  assert.equal(r.r.status, 429);
  // nem a senha certa entra até passar a janela (o bloqueio é do IP)
  assert.equal((await logar('admin@teste.com', 'Admin1234')).r.status, 429);
});

test('versão da tela: a página aberta compara com a do servidor para avisar que há versão nova', async () => {
  const c = cliente();
  const r = await c('GET', '/api/versao');
  assert.equal(r.status, 200);
  const indice = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.equal(r.json.versao, indice.match(/app\.js\?v=([\w.-]+)/)[1]);
});

'use strict';
/* Base de Clientes → Lista do Marketing (node --test). Dados fictícios. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const { lerXlsx } = require('../server/planilha');

let servidor, base, ctx;
async function req(metodo, url, corpo, cookie) {
  const r = await fetch(base + url, { method: metodo, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buf.toString()); } catch { /* não é JSON */ }
  return { status: r.status, json, buf, headers: r.headers, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0, enviarEmail: async () => {} });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor.close());

test('Lista do Marketing: síndicos dos ativos em .xlsx, só para quem tem a permissão', async () => {
  const admin = (await req('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'Admin1234' })).cookie;
  await ctx.db.q(`INSERT INTO condominios (codigo, nome, comarca, situacao, sindico_nome, sindico_telefone, sindico_email) VALUES
    ('901', 'Jardim Azul', 'CE', 'ATIVO', 'Ana Souza', '(85) 99999-0000', 'ana@exemplo.com'),
    ('902', 'Vila Verde', 'CE', 'DISTRATADO', 'Dora Lima', '', ''),
    ('903', 'Bela Vista', 'RN', 'ATIVO', '', '', ''),
    ('904', 'Aurora', 'PE', 'ATIVO', '', '(81) 98888-1111', '')`);

  let r = await req('GET', '/api/carteira', undefined, admin);
  assert.equal(r.json.pode_marketing, true);

  r = await req('GET', '/api/carteira/marketing', undefined, admin);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /Lista%20do%20Marketing/);
  assert.deepEqual(lerXlsx(r.buf), [
    ['Condomínio', 'UF', 'Síndico', 'Telefone', 'E-mail'],
    ['Aurora', 'PE', '', '(81) 98888-1111'], // o leitor descarta as células vazias do fim da linha
    ['Jardim Azul', 'CE', 'Ana Souza', '(85) 99999-0000', 'ana@exemplo.com'],
  ]);
  assert.ok(await ctx.db.um("SELECT 1 FROM auditoria WHERE acao = 'carteira_marketing' AND (detalhe->>'condominios')::int = 2"));

  // usuário comum sem a permissão não baixa
  const u = await req('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'Paula Pessoa', email: 'paula@teste.com', papel: 'usuario', senha: 'Senha1234' }, admin);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [u.json.id]);
  const paula = (await req('POST', '/api/auth/login', { email: 'paula@teste.com', senha: 'Senha1234' })).cookie;
  assert.equal((await req('GET', '/api/carteira', undefined, paula)).json.pode_marketing, false);
  r = await req('GET', '/api/carteira/marketing', undefined, paula);
  assert.equal(r.status, 403);
  assert.match(r.json.erro, /Lista do Marketing/);
});

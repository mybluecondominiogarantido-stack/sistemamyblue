'use strict';
/* Base de Clientes ← Controle de Síndicos (node --test). Dados fictícios. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const { planejar, separarUf, juntar } = require('../server/sindicos-carteira');

const cond = (id, nome, comarca, extra = {}) => ({ id, codigo: String(id), nome, comarca, situacao: 'ATIVO', sindico_nome: '', sindico_telefone: '', sindico_email: '', ...extra });

test('separarUf e juntar', () => {
  assert.deepEqual(separarUf('Jardim Azul - CE'), { nome: 'Jardim Azul', uf: 'CE' });
  assert.deepEqual(separarUf('Bloco - XY'), { nome: 'Bloco - XY', uf: '' });
  assert.deepEqual(separarUf('Solar das Palmeiras'), { nome: 'Solar das Palmeiras', uf: '' });
  assert.equal(juntar(['Ana', 'ana ', '', 'Bia'], 160), 'Ana / Bia');
  assert.equal(juntar(['(85) 99999-0000', '(85) 98888-1111', '(85) 97777-2222'], 40), '(85) 99999-0000 / (85) 98888-1111');
});

test('planejar: liga pelo nome e pela UF, junta síndicos, não apaga e separa preencher de atualizar', () => {
  const conds = [
    cond(1, 'Jardim Azul', 'CE'),
    cond(2, 'Jardim Azul', 'RN'),
    cond(3, 'Residencial Solar das Palmeiras II', 'RN', { sindico_nome: 'Carlos Antigo', sindico_telefone: '(84) 3333-0000' }),
    cond(4, 'Vila Verde', 'CE', { sindico_nome: 'Dora Lima', sindico_telefone: '(85) 91111-2222', sindico_email: 'dora@exemplo.com' }),
    cond(5, 'Sem Contato', 'CE'),
  ];
  const contatos = [
    { cond: 'Jardim Azul - CE', sind: 'Ana Souza', tel: '(85) 99999-0000', email: 'ana@exemplo.com', ativo: true },
    { cond: 'Jardim Azul - CE', sind: 'Bruno Reis', tel: '', email: 'bruno@exemplo.com', ativo: true },
    { cond: 'Jardim Azul - CE', sind: 'Saiu Antes', tel: '(85) 90000-0000', ativo: false },
    { cond: 'Solar das Palmeiras 2 - RN', sind: 'Elisa Nova', tel: '', email: 'elisa@exemplo.com', ativo: true },
    { cond: 'Vila Verde - CE', sind: 'Dora Lima', tel: '(85) 91111-2222', email: 'dora@exemplo.com', ativo: true },
    { cond: 'Não Existe - CE', sind: 'Fulano', ativo: true },
  ];
  const p = planejar(contatos, conds);
  assert.equal(p.contatos, 5);
  assert.equal(p.ligados, 3);
  assert.equal(p.iguais, 1);
  assert.deepEqual(p.nao_achados, [{ cond: 'Não Existe - CE', sindicos: ['Fulano'] }]);
  assert.equal(p.sem_contato, 2); // Jardim Azul RN e Sem Contato
  const [jardim, solar] = p.mudancas;
  assert.equal(jardim.id, 1);
  assert.equal(jardim.tipo, 'preencher');
  assert.deepEqual(jardim.campos, {
    sindico_nome: ['', 'Ana Souza / Bruno Reis'], sindico_telefone: ['', '(85) 99999-0000'], sindico_email: ['', 'ana@exemplo.com / bruno@exemplo.com'],
  });
  // o telefone vazio no Controle de Síndicos não apaga o da ficha
  assert.equal(solar.id, 3);
  assert.equal(solar.tipo, 'atualizar');
  assert.deepEqual(solar.campos, { sindico_nome: ['Carlos Antigo', 'Elisa Nova'], sindico_email: ['', 'elisa@exemplo.com'] });
});

let servidor, base, ctx;
async function req(metodo, url, corpo, cookie) {
  const r = await fetch(base + url, { method: metodo, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, json: await r.json().catch(() => null), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
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

test('rotas: confere e grava só os condomínios escolhidos, com histórico', async () => {
  const admin = (await req('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'Admin1234' })).cookie;
  await ctx.db.q("INSERT INTO modulos (slug, nome) VALUES ('sindicos', 'Controle de Síndicos') ON CONFLICT DO NOTHING");
  await ctx.db.q("INSERT INTO condominios (codigo, nome, comarca) VALUES ('901', 'Jardim Azul', 'CE'), ('902', 'Vila Verde', 'CE')");
  await ctx.documentos.gravar('sindicos', [
    { op: 'set', path: 'contatos/a', data: { cond: 'Jardim Azul - CE', sind: 'Ana Souza', tel: '(85) 99999-0000', email: 'ana@exemplo.com', ativo: true } },
    { op: 'set', path: 'contatos/b', data: { cond: 'Vila Verde - CE', sind: 'Dora Lima', tel: '(85) 91111-2222', email: 'dora@exemplo.com', ativo: true } },
  ], 'mb-1', 1);

  let r = await req('GET', '/api/carteira/sindicos', undefined, admin);
  assert.equal(r.status, 200);
  assert.equal(r.json.mudancas.length, 2);
  const jardim = r.json.mudancas.find((m) => m.nome === 'Jardim Azul');

  r = await req('POST', '/api/carteira/sindicos', { ids: [jardim.id] }, admin);
  assert.equal(r.status, 200);
  assert.equal(r.json.atualizados, 1);
  const c = await ctx.db.um("SELECT sindico_nome, sindico_telefone, sindico_email FROM condominios WHERE codigo = '901'");
  assert.deepEqual(c, { sindico_nome: 'Ana Souza', sindico_telefone: '(85) 99999-0000', sindico_email: 'ana@exemplo.com' });
  assert.equal((await ctx.db.um("SELECT sindico_nome FROM condominios WHERE codigo = '902'")).sindico_nome, '');

  r = await req('GET', `/api/carteira/${jardim.id}`, undefined, admin);
  assert.ok(r.json.historico.some((h) => h.acao === 'condominio_editado' && h.detalhe.origem === 'Controle de Síndicos'));
  r = await req('GET', '/api/carteira/sindicos', undefined, admin);
  assert.deepEqual(r.json.mudancas.map((m) => m.nome), ['Vila Verde']);

  // sem login não confere
  assert.equal((await req('GET', '/api/carteira/sindicos')).status, 401);
});

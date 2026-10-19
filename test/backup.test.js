'use strict';
/* Backup do banco e restauração (node --test): o que sai no arquivo volta igual num banco novo. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const zlib = require('zlib');
const { Readable } = require('stream');
const { criarApp, lerConfig } = require('../server/index');
const { abrir } = require('../server/db');
const { restaurar, lerBackup } = require('../server/backup');

let servidor, base, ctx, cookie = '';

async function req(metodo, url, corpo) {
  const headers = { cookie };
  let body;
  if (corpo !== undefined) { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
  const r = await fetch(base + url, { method: metodo, headers, body, redirect: 'manual' });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: r.status, headers: r.headers, buffer: Buffer.from(await r.arrayBuffer()) };
}

const VIDEO = Buffer.alloc(7 * 1024 * 1024 + 5); // maior que um pedaço (3 MB) e não múltiplo de 3
for (let i = 0; i < VIDEO.length; i++) VIDEO[i] = (i * 7) % 256;

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0 });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  assert.equal((await req('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'Admin1234' })).status, 200);

  const db = ctx.db;
  // usuário criado por outro (auto-referência), acesso com papéis (TEXT[]), dados JSONB, arquivos BYTEA
  const coord = await db.um("INSERT INTO usuarios (nome, email, senha_hash, papel, criado_por) VALUES ('Coord', 'c@teste.com', 'x', 'coordenador', 1) RETURNING id");
  await db.q("INSERT INTO usuarios (nome, email, senha_hash, criado_por) VALUES ('Pessoa', 'p@teste.com', 'x', $1)", [coord.id]);
  const mod = (await db.um('SELECT slug FROM modulos ORDER BY slug LIMIT 1')).slug;
  await db.q('INSERT INTO permissoes (usuario_id, modulo_slug, somente_leitura, papeis) VALUES ($1, $2, TRUE, $3)', [coord.id, mod, ['gestao', 'financeiro']]);
  await db.q("INSERT INTO regras_acesso (chave, regra) VALUES ('carteira.cadastro', $1::jsonb)", [JSON.stringify({ perfis: ['admin'], lista: [1, 2] })]);
  await db.q("INSERT INTO documentos (modulo_slug, colecao, doc_id, dados, seq) VALUES ($1, 'c', 'd1', $2::jsonb, nextval('documentos_seq'))", [mod, JSON.stringify({ a: [1, { b: 'ç' }] })]);
  const setor = (await db.um('SELECT id FROM setores LIMIT 1')).id;
  const t = await db.um("INSERT INTO tickets (titulo, setor_id, solicitante_id) VALUES ('T', $1, 1) RETURNING id", [setor]);
  await db.q("INSERT INTO ticket_anexos (ticket_id, nome, tipo, tamanho, conteudo) VALUES ($1, 'a.pdf', 'application/pdf', 3, $2)", [t.id, Buffer.from('%PD')]);
  await db.q("INSERT INTO tutoriais (slug, video, tamanho, legendas) VALUES ('primeiros-passos', $1, $2, 'WEBVTT')", [VIDEO, VIDEO.length]);
  await db.q("INSERT INTO comissao_relatorios (modulo_slug, competencia, chave, usuario_id, nome, html, valor) VALUES ($1, '2026-09', 'k', $2, 'P', '<p>x</p>', 1234.56)", [mod, coord.id]);
  await db.q("INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES ('zz', 1, now() + interval '1 day')");
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

async function baixar() {
  const r = await req('GET', '/api/admin/backup');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/gzip');
  return r.buffer;
}

test('o backup volta igual num banco novo (arquivos, JSON, papéis, quem criou quem)', async () => {
  const arquivo = await baixar();
  const db2 = await abrir({ dataDir: ':memoria:' });
  try {
    const r = await restaurar(db2, Readable.from([arquivo]), { senhaBloqueada: () => 'bloqueada$x' });
    assert.deepEqual(r.ignoradas, []);
    const origem = ctx.db, destino = db2;
    for (const tab of r.cabecalho.tabelas) {
      if (tab === 'auditoria') continue; // o próprio download entra no histórico depois do arquivo
      const a = (await origem.um(`SELECT COUNT(*)::int AS n FROM ${tab}`)).n;
      const b = (await destino.um(`SELECT COUNT(*)::int AS n FROM ${tab}`)).n;
      assert.equal(b, a, tab);
    }
    assert.equal((await destino.um('SELECT COUNT(*)::int AS n FROM sessoes')).n, 0);
    const v = await destino.um("SELECT video FROM tutoriais WHERE slug = 'primeiros-passos'");
    assert.ok(Buffer.compare(v.video, VIDEO) === 0, 'vídeo idêntico');
    assert.equal((await destino.um('SELECT conteudo FROM ticket_anexos')).conteudo.toString(), '%PD');
    const p = await destino.um("SELECT p.papeis, p.somente_leitura FROM permissoes p JOIN usuarios u ON u.id = p.usuario_id WHERE u.email = 'c@teste.com'");
    assert.deepEqual(p.papeis, ['gestao', 'financeiro']);
    assert.equal(p.somente_leitura, true);
    assert.deepEqual((await destino.um("SELECT regra FROM regras_acesso WHERE chave = 'carteira.cadastro'")).regra, { perfis: ['admin'], lista: [1, 2] });
    assert.deepEqual((await destino.um("SELECT dados FROM documentos WHERE doc_id = 'd1'")).dados, { a: [1, { b: 'ç' }] });
    assert.equal(String((await destino.um('SELECT valor FROM comissao_relatorios')).valor), '1234.56');
    const pessoa = await destino.um("SELECT u.criado_por, c.email FROM usuarios u JOIN usuarios c ON c.id = u.criado_por WHERE u.email = 'p@teste.com'");
    assert.equal(pessoa.email, 'c@teste.com');
    // senhas bloqueadas, troca obrigatória
    assert.ok((await destino.q('SELECT senha_hash, trocar_senha FROM usuarios')).rows.every((u) => u.senha_hash === 'bloqueada$x' && u.trocar_senha));
    // os contadores continuam depois do maior id
    const maior = (await destino.um('SELECT MAX(id) AS m FROM usuarios')).m;
    const novo = await destino.um("INSERT INTO usuarios (nome, email, senha_hash) VALUES ('N', 'n@teste.com', 'x') RETURNING id");
    assert.equal(novo.id, maior + 1);
    const seq = await destino.um("SELECT nextval('documentos_seq') AS s");
    assert.ok(Number(seq.s) > Number((await destino.um('SELECT MAX(seq) AS m FROM documentos')).m));
  } finally {
    await db2.fechar();
  }
});

test('arquivo cortado no meio é recusado e não apaga nada', async () => {
  const texto = zlib.gunzipSync(await baixar()).toString();
  const cortado = texto.slice(0, texto.lastIndexOf('{"fim"'));
  const db2 = await abrir({ dataDir: ':memoria:' });
  try {
    const antes = (await db2.um('SELECT COUNT(*)::int AS n FROM modulos')).n;
    await assert.rejects(restaurar(db2, Readable.from([Buffer.from(cortado)]), { senhaBloqueada: () => 'x' }), /incompleto/);
    assert.equal((await db2.um('SELECT COUNT(*)::int AS n FROM modulos')).n, antes);
  } finally {
    await db2.fechar();
  }
});

test('backup antigo (JSON da versão 4) também é lido', async () => {
  const antigo = JSON.stringify({ sistema: 'portal-myblue', versao_backup: 4, gerado_em: '2026-10-01T00:00:00Z', tabelas: {
    setores: [{ id: 7, nome: 'Setor X', ordem: 1 }], usuarios: [{ id: 3, nome: 'A', email: 'a@x.com', papel: 'admin', ativo: true }], removida: [{ a: 1 }],
  } });
  const itens = [];
  for await (const x of lerBackup(Readable.from([Buffer.from(antigo)]))) itens.push(x);
  assert.equal(itens[0].cabecalho.versao_backup, 4);
  const db2 = await abrir({ dataDir: ':memoria:' });
  try {
    const r = await restaurar(db2, Readable.from([Buffer.from(antigo)]), { senhaBloqueada: () => 'x' });
    assert.deepEqual(r.ignoradas, ['removida']);
    assert.equal((await db2.um('SELECT nome FROM setores')).nome, 'Setor X');
    assert.equal((await db2.um('SELECT id FROM usuarios')).id, 3);
  } finally {
    await db2.fechar();
  }
});

test('só a administração baixa o backup', async () => {
  const c = cookie;
  cookie = '';
  assert.equal((await req('GET', '/api/admin/backup')).status, 401);
  cookie = c;
});

'use strict';
/* Gestão de Viagens: avisos no sino e por e-mail quando o status de uma viagem muda (node --test). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

const SLUG = 'gestao-de-viagens';
let servidor, base, ctx, admin, sol, ges, apr;
const emails = [];

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let body;
    if (corpo !== undefined) { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
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
async function pessoa(nome, email, papeis, papel = 'usuario') {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel, senha: 'Senha1234', modulos: [SLUG] });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  await ctx.db.q('UPDATE permissoes SET papeis = $3 WHERE usuario_id = $1 AND modulo_slug = $2', [r.json.id, SLUG, papeis]);
  return { c: await entrar(email, 'Senha1234'), id: r.json.id, email };
}
const avisosDe = async (id) => (await ctx.db.q('SELECT titulo, texto, link FROM notificacoes WHERE usuario_id = $1 ORDER BY id', [id])).rows;
const limpar = async () => { await ctx.db.q('DELETE FROM notificacoes'); emails.length = 0; };
const esperar = () => new Promise((r) => setTimeout(r, 150));
const gravar = async (quem, v) => {
  const r = await quem.c('POST', `/api/db/${SLUG}`, { ops: [{ op: 'set', path: `viagens/${v.id}`, data: v }] });
  assert.equal(r.status, 200, r.texto);
  await esperar();
};

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0,
    enviarEmail: async (m) => { emails.push(m); } });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');
  await ctx.db.q(`INSERT INTO modulos (slug, nome, setor_id, adaptador, armazenamento, fonte_dados, config)
    SELECT $1, 'Gestão de Viagens', id, 'claude-db', 'compartilhado', 'interno',
      '{"papeis":[{"id":"gestao","nome":"Gestão"},{"id":"aprovacao","nome":"Aprovação"}]}'::jsonb FROM setores WHERE nome = 'CS'`, [SLUG]);
  sol = await pessoa('Ana Fictícia', 'ana@teste.com', []);
  ges = await pessoa('Rui Fictício', 'rui@teste.com', ['gestao']);
  apr = await pessoa('Dora Fictícia', 'dora@teste.com', ['aprovacao']);
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('do pedido à aprovação: cada mudança de status avisa quem precisa agir, no sino e por e-mail', async () => {
  const v = { id: 'v1', protocolo: 'VG-20261110-TEST', status: 'solicitada', colaborador: 'Ana Fictícia', setor: 'CS', origem: 'Fortaleza/CE',
    destino: 'Recife/PE', dataIda: '2026-11-10', dataVolta: '2026-11-12', motivo: 'Visita de teste', solicitante: 'Ana Fictícia',
    solicitanteId: `mb-${sol.id}`, pedido: { itens: ['aereo', 'hospedagem'] } };

  await limpar();
  await gravar(sol, v);
  let a = await avisosDe(ges.id);
  assert.equal(a.length, 1);
  assert.match(a[0].titulo, /^Nova solicitação de viagem · Ana Fictícia · Recife\/PE/);
  assert.match(a[0].texto, /passagem aérea, hospedagem/);
  assert.equal(a[0].link, `#/m/${SLUG}`);
  assert.deepEqual(await avisosDe(sol.id), [], 'quem pediu não recebe o próprio aviso');
  assert.deepEqual(await avisosDe(apr.id), []);
  assert.deepEqual(emails.map((m) => m.para.email), ['rui@teste.com']);
  assert.match(emails[0].html, /Recife\/PE/);

  // salvar de novo sem mudar o status não repete o aviso
  await limpar();
  await gravar(sol, { ...v, motivo: 'Visita de teste (ajuste)' });
  assert.deepEqual(await avisosDe(ges.id), []);

  await limpar();
  await gravar(ges, { ...v, status: 'devolvida', devolucao: { por: `mb-${ges.id}`, motivo: 'Informe o cargo' } });
  a = await avisosDe(sol.id);
  assert.equal(a.length, 1);
  assert.match(a[0].titulo, /^Solicitação de viagem devolvida/);
  assert.match(a[0].texto, /Informe o cargo/);

  await limpar();
  await gravar(sol, { ...v, status: 'solicitada', cargo: 'Analista' });
  assert.match((await avisosDe(ges.id))[0].titulo, /^Solicitação de viagem corrigida/);

  await limpar();
  await gravar(ges, { ...v, status: 'cotacao' });
  assert.equal((await ctx.db.um('SELECT count(*)::int AS n FROM notificacoes')).n, 0, 'aceitar para cotação não avisa ninguém');
  await gravar(ges, { ...v, status: 'aprovacao' });
  a = await avisosDe(apr.id);
  assert.equal(a.length, 1);
  assert.match(a[0].titulo, /^Viagem aguardando aprovação · Ana Fictícia · Recife\/PE/);
  assert.deepEqual(await avisosDe(sol.id), [], 'o solicitante não é avisado de etapas internas');

  await limpar();
  await gravar(apr, { ...v, status: 'aprovada', decisao: { por: `mb-${apr.id}`, obs: 'Ok' } });
  a = await avisosDe(sol.id);
  assert.equal(a.length, 1);
  assert.match(a[0].titulo, /^Viagem aprovada · Recife\/PE · 10\/11\/2026 a 12\/11\/2026/);
  assert.deepEqual(emails.map((m) => m.para.email), ['ana@teste.com']);
});

test('reprovação e cancelamento avisam quem pediu; cancelar a própria solicitação não avisa a si mesmo', async () => {
  const v = { id: 'v2', protocolo: 'VG-2', status: 'aprovacao', colaborador: 'Ana Fictícia', destino: 'Natal/RN', solicitanteId: `mb-${sol.id}` };
  await gravar(ges, v);
  await limpar();
  await gravar(apr, { ...v, status: 'reprovada', decisao: { obs: 'Sem orçamento' } });
  assert.match((await avisosDe(sol.id))[0].texto, /Sem orçamento/);

  const w = { id: 'v3', status: 'solicitada', colaborador: 'Ana Fictícia', destino: 'Natal/RN', solicitanteId: `mb-${sol.id}` };
  await gravar(sol, w);
  await limpar();
  await gravar(sol, { ...w, status: 'cancelada' });
  assert.deepEqual(await avisosDe(sol.id), []);
  await gravar(ges, { ...w, status: 'solicitada' });
  await limpar();
  await gravar(ges, { ...w, status: 'cancelada' });
  assert.match((await avisosDe(sol.id))[0].titulo, /^Viagem cancelada/);
});

test('viagem cadastrada direto pela gestão (sem solicitante) só avisa a aprovação', async () => {
  await limpar();
  const v = { id: 'v4', status: 'cotacao', colaborador: 'Pessoa Fictícia', destino: 'Teresina/PI' };
  await gravar(ges, v);
  await gravar(ges, { ...v, status: 'aprovacao' });
  await gravar(apr, { ...v, status: 'aprovada' });
  const n = (await ctx.db.q('SELECT usuario_id FROM notificacoes')).rows.map((x) => x.usuario_id);
  assert.deepEqual(n, [apr.id]);
});

test('papel não cadastrado ou sem ninguém: avisa a coordenação do setor da ferramenta', async () => {
  const coord = await pessoa('Cora Fictícia', 'cora@teste.com', [], 'coordenador');
  await ctx.db.q("INSERT INTO setor_membros (setor_id, usuario_id) SELECT id, $1 FROM setores WHERE nome = 'CS'", [coord.id]);
  await ctx.db.q(`UPDATE modulos SET config = config - 'papeis' WHERE slug = $1`, [SLUG]);
  await limpar();
  await gravar(sol, { id: 'v5', status: 'solicitada', colaborador: 'Ana Fictícia', destino: 'Belém/PA', solicitanteId: `mb-${sol.id}` });
  const n = (await ctx.db.q('SELECT usuario_id FROM notificacoes')).rows.map((x) => x.usuario_id);
  assert.deepEqual(n, [coord.id]);
});

'use strict';
/* Calendário de Rotinas (Adm/Financeiro): avisos no sino e por e-mail quando uma rotina passa a aguardar a gestora
   e quando ela responde (node --test). Dados fictícios. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

const SLUG = 'rotinas-adm';
let servidor, base, ctx, admin, assist, gestora;
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
async function pessoa(nome, email, papeis) {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel: 'usuario', senha: 'Senha1234', modulos: [SLUG] });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  await ctx.db.q('UPDATE permissoes SET papeis = $3 WHERE usuario_id = $1 AND modulo_slug = $2', [r.json.id, SLUG, papeis]);
  return { c: await entrar(email, 'Senha1234'), id: r.json.id, email };
}
const avisosDe = async (id) => (await ctx.db.q('SELECT titulo, texto, link FROM notificacoes WHERE usuario_id = $1 ORDER BY id', [id])).rows;
const limpar = async () => { await ctx.db.q('DELETE FROM notificacoes'); emails.length = 0; };
const esperar = () => new Promise((r) => setTimeout(r, 150));
const gravar = async (quem, ops) => {
  const r = await quem.c('POST', `/api/db/${SLUG}`, { ops });
  assert.equal(r.status, 200, r.texto);
  await esperar();
};
const dia = (s, por, extra = {}) => ({ s, por: `mb-${por.id}`, em: '2026-11-10T13:00:00.000Z', obs: '', ...extra });

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
    SELECT $1, 'Calendário de Rotinas', id, 'claude-db', 'compartilhado', 'interno',
      '{"papeis":[{"id":"gestora","nome":"Gestora administrativa"}]}'::jsonb FROM setores WHERE nome = 'CS'`, [SLUG]);
  assist = await pessoa('Ana Fictícia', 'ana@teste.com', []);
  gestora = await pessoa('Rui Fictício', 'rui@teste.com', ['gestora']);
  await gravar({ c: admin }, [{ op: 'set', path: 'atividades/a1', data: { nome: 'Pedidos das gráficas', responsavel: 'Ana Fictícia', tipo: 'dias', valores: [5] } }]);
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('marcar "aguardando gestora" avisa a gestora; a resposta dela avisa quem marcou', async () => {
  const path = 'status/2026-11__a1';
  await limpar();
  await gravar(assist, [{ op: 'set', path, data: { mes: '2026-11', atv: 'a1', dias: { 5: dia('aguardando', assist, { obs: 'Falta aprovar o orçamento' }) } } }]);
  let a = await avisosDe(gestora.id);
  assert.equal(a.length, 1);
  assert.match(a[0].titulo, /^Rotina aguardando você · Pedidos das gráficas · 05\/11\/2026/);
  assert.match(a[0].texto, /Falta aprovar o orçamento/);
  assert.equal(a[0].link, `#/m/${SLUG}`);
  assert.deepEqual(await avisosDe(assist.id), [], 'quem marcou não recebe o próprio aviso');
  assert.deepEqual(emails.map((m) => m.para.email), ['rui@teste.com']);

  // gravar de novo o mesmo dia sem mudar o status não repete o aviso
  await limpar();
  await gravar(assist, [{ op: 'update', path, data: { dias: { 5: dia('aguardando', assist, { obs: 'Orçamento anexado' }) } } }]);
  assert.deepEqual(await avisosDe(gestora.id), []);

  // a gestora responde: quem marcou é avisado
  await limpar();
  await gravar(gestora, [{ op: 'update', path, data: { dias: { 5: dia('feito', gestora) } } }]);
  a = await avisosDe(assist.id);
  assert.equal(a.length, 1);
  assert.match(a[0].titulo, /^Rotina respondida · Pedidos das gráficas · 05\/11\/2026 · Feito/);
  assert.deepEqual(await avisosDe(gestora.id), []);
});

test('mudanças que não envolvem a gestora não avisam ninguém', async () => {
  const path = 'status/2026-11__a2';
  await limpar();
  await gravar(assist, [{ op: 'set', path, data: { mes: '2026-11', atv: 'a2', dias: { 10: dia('execucao', assist) } } }]);
  await gravar(assist, [{ op: 'update', path, data: { dias: { 10: dia('feito', assist) } } }]);
  assert.equal((await ctx.db.um('SELECT count(*)::int AS n FROM notificacoes')).n, 0);
});

test('sem ninguém com o papel "gestora", o aviso vai à coordenação do setor ou à administração', async () => {
  await ctx.db.q('UPDATE permissoes SET papeis = $2 WHERE usuario_id = $1 AND modulo_slug = $3', [gestora.id, [], SLUG]);
  await limpar();
  await gravar(assist, [{ op: 'set', path: 'status/2026-12__a1', data: { mes: '2026-12', atv: 'a1', dias: { 7: dia('aguardando', assist) } } }]);
  const adm = (await ctx.db.um("SELECT id FROM usuarios WHERE email = 'admin@teste.com'")).id;
  assert.equal((await avisosDe(adm)).length, 1);
  assert.deepEqual(await avisosDe(gestora.id), []);
  await ctx.db.q('UPDATE permissoes SET papeis = $2 WHERE usuario_id = $1 AND modulo_slug = $3', [gestora.id, ['gestora'], SLUG]);
});

'use strict';
/* Controle de Rotinas (Adm/Financeiro): avisos no sino e por e-mail (aguardando Supervisão/Coordenação, resposta,
   pedido devolvido) e o painel com Análise de Crédito e tickets de estorno (node --test). Dados fictícios. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

const SLUG = 'controle-de-rotinas-administrativas';
let servidor, base, ctx, admin, assist, sup, coord, setorId;
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
  setorId = (await ctx.db.um("SELECT id FROM setores WHERE nome = 'CS'")).id;
  await ctx.db.q(`INSERT INTO modulos (slug, nome, setor_id, adaptador, armazenamento, fonte_dados, config)
    VALUES ($1, 'Controle de Rotinas', $2, 'claude-db', 'compartilhado', 'interno',
      '{"papeis":[{"id":"supervisao","nome":"Supervisão"},{"id":"coordenacao","nome":"Coordenação"}]}'::jsonb)`, [SLUG, setorId]);
  assist = await pessoa('Ana Fictícia', 'ana@teste.com', []);
  sup = await pessoa('Rui Fictício', 'rui@teste.com', ['supervisao']);
  coord = await pessoa('Lia Fictícia', 'lia@teste.com', ['coordenacao']);
  await gravar({ c: admin }, [{ op: 'set', path: 'atividades/a1', data: { nome: 'Pedidos de Cartórios', funcao: 'assistente', tipo: 'diaria', valores: [] } }]);
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('aguardando supervisão → Supervisão; encaminhada → Coordenação e quem marcou; resposta → os dois', async () => {
  const path = 'status/2026-11__a1';
  await limpar();
  await gravar(assist, [{ op: 'set', path, data: { mes: '2026-11', atv: 'a1', dias: { 5: dia('aguardando_sup', assist, { obs: 'Taxa do cartório acima da tabela' }) } } }]);
  let a = await avisosDe(sup.id);
  assert.equal(a.length, 1);
  assert.match(a[0].titulo, /^Rotina aguardando você · Pedidos de Cartórios · 05\/11\/2026/);
  assert.match(a[0].texto, /Supervisão: Taxa do cartório/);
  assert.equal(a[0].link, `#/m/${SLUG}`);
  assert.deepEqual(await avisosDe(coord.id), []);
  assert.deepEqual(await avisosDe(assist.id), [], 'quem marcou não recebe o próprio aviso');
  assert.deepEqual(emails.map((m) => m.para.email), ['rui@teste.com']);

  // mesma situação gravada de novo: sem aviso repetido
  await limpar();
  await gravar(assist, [{ op: 'update', path, data: { dias: { 5: dia('aguardando_sup', assist, { obs: 'Orçamento anexado' }) } } }]);
  assert.equal((await ctx.db.um('SELECT count(*)::int AS n FROM notificacoes')).n, 0);

  // a Supervisão encaminha à Coordenação (orig = quem marcou primeiro)
  await limpar();
  await gravar(sup, [{ op: 'update', path, data: { dias: { 5: dia('aguardando_coord', sup, { orig: `mb-${assist.id}`, obs: 'Acima da minha alçada' }) } } }]);
  a = await avisosDe(coord.id);
  assert.equal(a.length, 1);
  assert.match(a[0].texto, /Coordenação: Acima da minha alçada/);
  a = await avisosDe(assist.id);
  assert.equal(a.length, 1);
  assert.match(a[0].titulo, /^Rotina encaminhada à Coordenação/);

  // a Coordenação responde: Supervisão (quem encaminhou) e Assistente (quem marcou) ficam sabendo
  await limpar();
  await gravar(coord, [{ op: 'update', path, data: { dias: { 5: dia('feito', coord, { orig: `mb-${assist.id}` }) } } }]);
  assert.match((await avisosDe(sup.id))[0].titulo, /^Rotina respondida · Pedidos de Cartórios · 05\/11\/2026 · Feito/);
  assert.match((await avisosDe(assist.id))[0].texto, /aguardando a Coordenação agora está "Feito"/);
  assert.deepEqual(await avisosDe(coord.id), []);
});

test('"aguardando" antigo vale como aguardando a Supervisão; mudanças sem aguardar não avisam', async () => {
  await limpar();
  await gravar(assist, [{ op: 'set', path: 'status/2026-11__a2', data: { mes: '2026-11', atv: 'a2', dias: { 10: dia('execucao', assist) } } }]);
  await gravar(assist, [{ op: 'update', path: 'status/2026-11__a2', data: { dias: { 10: dia('feito', assist) } } }]);
  assert.equal((await ctx.db.um('SELECT count(*)::int AS n FROM notificacoes')).n, 0);
  await gravar(assist, [{ op: 'set', path: 'status/2026-11__a3', data: { mes: '2026-11', atv: 'a3', dias: { 3: dia('aguardando', assist) } } }]);
  assert.equal((await avisosDe(sup.id)).length, 1);
});

test('pedido devolvido pela Supervisão avisa quem lançou', async () => {
  await limpar();
  const p = { atv: 'a1', mes: '2026-11', numero: '004815', tipo: 'NENHUM', chegou: '2026-11-09', incluido: '2026-11-10', fluig: false, por: `mb-${assist.id}` };
  await gravar(assist, [{ op: 'set', path: 'pedidos/p1', data: p }]);
  assert.equal((await ctx.db.um('SELECT count(*)::int AS n FROM notificacoes')).n, 0);
  await gravar(sup, [{ op: 'update', path: 'pedidos/p1', data: { conf: { s: 'devolvido', motivo: 'Falta a nota fiscal no Fluig', por: `mb-${sup.id}`, em: '2026-11-10T15:00:00Z' } } }]);
  const a = await avisosDe(assist.id);
  assert.equal(a.length, 1);
  assert.match(a[0].titulo, /^Pedido devolvido pela Supervisão · 004815/);
  assert.match(a[0].texto, /Falta a nota fiscal no Fluig/);
});

test('sem ninguém no papel, o aviso vai à coordenação do setor ou à administração', async () => {
  await ctx.db.q('UPDATE permissoes SET papeis = $2 WHERE usuario_id = $1 AND modulo_slug = $3', [sup.id, [], SLUG]);
  await limpar();
  await gravar(assist, [{ op: 'set', path: 'status/2026-12__a1', data: { mes: '2026-12', atv: 'a1', dias: { 7: dia('aguardando_sup', assist) } } }]);
  const adm = (await ctx.db.um("SELECT id FROM usuarios WHERE email = 'admin@teste.com'")).id;
  assert.equal((await avisosDe(adm)).length, 1);
  assert.deepEqual(await avisosDe(sup.id), []);
  await ctx.db.q('UPDATE permissoes SET papeis = $2 WHERE usuario_id = $1 AND modulo_slug = $3', [sup.id, ['supervisao'], SLUG]);
});

test('painel: tickets de estorno sem a descrição; Análise de Crédito só para Supervisão e Coordenação', async () => {
  let r = await admin('POST', `/api/admin/equipes/${setorId}/categorias`, { nome: 'Estorno a cliente', prazo_horas: 9, prioridade: 'alta' });
  assert.equal(r.status, 201, r.texto);
  r = await assist.c('POST', '/api/tickets', { interno: true, setor_id: setorId, categoria_id: r.json.id, titulo: 'Estorno unidade 302', descricao: 'CPF 000.000.000-00 · conta 1234-5' });
  assert.equal(r.status, 201, r.texto);
  const ticket = r.json.id;
  await ctx.db.q(`INSERT INTO analises (etapa, condominio, prazo_analista) VALUES ('fila', 'Condomínio Exemplo', now() - interval '1 day'), ('em_analise', 'Residencial Modelo', now() + interval '1 day')`);

  const pa = (await assist.c('GET', `/api/db/${SLUG}/painel?mes=2026-11`)).json;
  assert.equal(pa.credito, null, 'o Assistente não recebe a Análise de Crédito');
  const e = pa.estornos.find((x) => x.id === ticket);
  assert.ok(e);
  assert.equal(e.titulo, 'Estorno unidade 302');
  assert.equal(e.status, 'novo');
  assert.ok(!JSON.stringify(pa).includes('000.000.000-00'), 'CPF e dados bancários ficam só no ticket');

  const ps = (await sup.c('GET', `/api/db/${SLUG}/painel?mes=2026-11`)).json;
  assert.equal(ps.credito.fila, 1);
  assert.equal(ps.credito.em_analise, 1);
  assert.equal(ps.credito.fora_prazo, 1);
  assert.equal(ps.credito.lista.length, 2);
  assert.ok(ps.credito.lista.find((x) => x.condominio === 'Condomínio Exemplo').atrasada);
  assert.ok((await coord.c('GET', `/api/db/${SLUG}/painel`)).json.credito);
  // o HTML da ferramenta pede pelo endereço antigo (/api/db/rotinas-adm/painel): continua respondendo
  assert.ok((await coord.c('GET', '/api/db/rotinas-adm/painel')).json.credito);

  // quem não abre a ferramenta não vê o painel
  const fora = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'Sem Acesso', email: 'sem@teste.com', papel: 'usuario', senha: 'Senha1234', modulos: [] });
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [fora.json.id]);
  const sem = await entrar('sem@teste.com', 'Senha1234');
  assert.equal((await sem('GET', `/api/db/${SLUG}/painel`)).status, 403);
});

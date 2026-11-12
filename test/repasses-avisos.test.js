'use strict';
/* Controle de Repasses: avisos às assistentes no sino (só o Gestor) e leitura do armazenamento só do que mudou
   (?desde=). Dados fictícios. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx;
const emails = [];

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (cookie) headers.cookie = cookie;
    let body;
    if (corpo !== undefined) {
      if (Buffer.isBuffer(corpo)) { body = corpo; headers['content-type'] ||= 'application/zip'; } else { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
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
async function entrar(email, senha) {
  const c = cliente();
  assert.equal((await c('POST', '/api/auth/login', { email, senha })).status, 200);
  return c;
}
/* pedido feito pela página isolada: sem cookie, origem "null" */
async function daFerramenta(metodo, url, corpo, headers = {}) {
  const h = { origin: 'null', ...headers };
  if (Buffer.isBuffer(corpo)) h['content-type'] ||= 'application/zip';
  const r = await fetch(base + url, { method: metodo, headers: h, body: corpo, redirect: 'manual' });
  const buffer = Buffer.from(await r.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buffer.toString('utf8')); } catch { /* não é JSON */ }
  return { status: r.status, json, buffer, headers: r.headers };
}
const chaveDa = (html) => JSON.parse(/window\.__MYBLUE__=(\{.*?\});\n/.exec(html)[1]).chave;

let admin, gestor, leitor, semPapel, fulana, beltrana, estranho;
const ids = {};
async function pessoa(nome, email) {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel: 'usuario', senha: 'Senha1234' });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}
const noCredito = async (email) => {
  const s = await ctx.db.um("SELECT id FROM setores WHERE nome = 'Crédito'");
  await ctx.db.q('INSERT INTO setor_membros (setor_id, usuario_id, lider) VALUES ($1, $2, FALSE)', [s.id, ids[email]]);
};
const avisosDe = async (email) => (await ctx.db.q('SELECT n.tipo, n.titulo, n.texto, n.link FROM notificacoes n JOIN usuarios u ON u.id = n.usuario_id WHERE u.email = $1 ORDER BY n.id', [email])).rows;
const esperar = () => new Promise((ok) => setTimeout(ok, 50));

// dias relativos a hoje (a lista sem data mostra os últimos 60 dias)
const diaAntes = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const ONTEM = diaAntes(1);
const ANTEONTEM = diaAntes(2);
const ddmm = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

const HTML = '<!doctype html><html><head><title>Controle de Repasses</title></head><body>repasses fictício</body></html>';

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0,
    portalUrl: 'https://portal.teste', enviarEmail: async (msg) => { emails.push(msg); } });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');
  // o Controle de Repasses (isolado), com o papel Gestor cadastrado
  assert.equal((await admin('POST', '/api/admin/modulos', { slug: 'repasses', nome: 'Controle de Repasses', armazenamento: 'compartilhado' })).status, 201);
  assert.equal((await admin('PUT', '/api/admin/modulos/repasses/arquivo', Buffer.from(HTML), { headers: { 'content-type': 'text/html' } })).status, 200);
  await ctx.db.q(`UPDATE modulos SET config = config || $1::jsonb WHERE slug = 'repasses'`, [JSON.stringify({ papeis: [{ id: 'gestor', nome: 'Gestor' }] })]);
  assert.equal((await admin('POST', '/api/admin/modulos', { slug: 'agenda', nome: 'Agenda', armazenamento: 'compartilhado' })).status, 201);
  assert.equal((await admin('PUT', '/api/admin/modulos/agenda/arquivo', Buffer.from(HTML), { headers: { 'content-type': 'text/html' } })).status, 200);

  gestor = await pessoa('Gestora de Repasses Fictícia', 'gestor@teste.com');
  leitor = await pessoa('Gestor Só Consulta', 'leitor@teste.com');
  semPapel = await pessoa('Operador de Repasses', 'operador@teste.com');
  fulana = await pessoa('Fulana Ficticia Souza', 'fulana@teste.com');
  beltrana = await pessoa('Beltrana Lima', 'beltrana@teste.com');
  estranho = await pessoa('Pessoa de Fora', 'fora@teste.com');
  await noCredito('fulana@teste.com');
  await noCredito('beltrana@teste.com');
  const acessos = [
    { usuario_id: ids['gestor@teste.com'], somente_leitura: false, papeis: ['gestor'] },
    { usuario_id: ids['leitor@teste.com'], somente_leitura: true, papeis: ['gestor'] },
    { usuario_id: ids['operador@teste.com'], somente_leitura: false, papeis: [] },
  ];
  const a = await admin('PUT', '/api/admin/modulos/repasses/acesso', { acessos });
  assert.equal(a.status, 200, a.texto);
  await admin('PUT', '/api/admin/modulos/agenda/acesso', { acessos: [{ usuario_id: ids['gestor@teste.com'], somente_leitura: false, papeis: [] }] });
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

const avisar = (c, avisos) => c('POST', '/api/repasses/avisos', { avisos });

test('o Gestor avisa a assistente no sino; não repete em 12 horas; assistente desconhecida volta sem envio', async () => {
  const r = await avisar(gestor, [
    { assistente: 'FULANA SOUZA - 4600', titulo: 'Repasse não efetuado em 11/11', texto: 'Condomínio Fictício (R$ 1.000,00): não efetuado pelo banco.' },
    { assistente: 'NINGUEM DESSE NOME', titulo: 'Teste', texto: 'x' },
  ]);
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.itens[0].enviado, true);
  assert.deepEqual(r.json.itens[0].destinatario, { id: ids['fulana@teste.com'], nome: 'Fulana Ficticia Souza' });
  assert.equal(r.json.itens[1].enviado, false);
  assert.match(r.json.itens[1].motivo, /não encontrada/);
  assert.deepEqual(await avisosDe('fulana@teste.com'), [{ tipo: 'repasses', titulo: 'Repasse não efetuado em 11/11', texto: 'Condomínio Fictício (R$ 1.000,00): não efetuado pelo banco.', link: '#/m/repasses' }]);
  const de_novo = await avisar(gestor, [{ assistente: 'fulana souza', titulo: 'Repasse não efetuado em 11/11', texto: 'de novo' }]);
  assert.equal(de_novo.json.itens[0].enviado, false);
  assert.match(de_novo.json.itens[0].motivo, /12 horas/);
  assert.equal((await avisosDe('fulana@teste.com')).length, 1);
  assert.deepEqual(await avisosDe('beltrana@teste.com'), []);
});

test('só o Gestor sem só consulta avisa; limite de 30 por vez', async () => {
  const um = [{ assistente: 'BELTRANA LIMA', titulo: 'Aviso', texto: 't' }];
  assert.equal((await avisar(leitor, um)).status, 403);
  assert.equal((await avisar(semPapel, um)).status, 403);
  assert.equal((await avisar(estranho, um)).status, 403);
  assert.equal((await avisar(gestor, Array.from({ length: 31 }, () => um[0]))).status, 400);
  assert.equal((await avisar(gestor, [])).status, 400);
  assert.deepEqual(await avisosDe('beltrana@teste.com'), []);
  assert.equal((await avisar(admin, um)).json.itens[0].enviado, true);
});

test('a ferramenta isolada repasses pode avisar com a chave dela; outra ferramenta não', async () => {
  const pg = await gestor('GET', '/m/repasses/');
  const chave = chaveDa(pg.texto);
  const r = await daFerramenta('POST', `/t/${chave}/api/repasses/avisos`, JSON.stringify({ avisos: [{ assistente: 'BELTRANA LIMA', titulo: 'Previsto sem lançamento', texto: 'x' }] }), { 'content-type': 'application/json' });
  assert.equal(r.status, 200, r.buffer.toString());
  assert.equal(r.json.itens[0].enviado, true);
  const ag = await gestor('GET', '/m/agenda/');
  const outra = await daFerramenta('POST', `/t/${chaveDa(ag.texto)}/api/repasses/avisos`, JSON.stringify({ avisos: [{ assistente: 'BELTRANA LIMA', titulo: 'y', texto: 'y' }] }), { 'content-type': 'application/json' });
  assert.equal(outra.status, 403);
});

test('armazenamento: ?desde= devolve só o que mudou, com a hora do banco e o total de chaves', async () => {
  const set = (o) => gestor('POST', '/api/armazenamento/repasses', { set: o });
  assert.equal((await set({ 'repasses:a': '1', 'repasses:b': '2' })).status, 200);
  const tudo = await gestor('GET', '/api/armazenamento/repasses');
  assert.equal(tudo.status, 200);
  assert.equal(tudo.json.delta, false);
  assert.ok(tudo.json.agora && !isNaN(new Date(tudo.json.agora)));
  assert.equal(tudo.json.n, Object.keys(tudo.json.dados).length);
  const ag = tudo.json.agora;
  await esperar();
  const nada = await gestor('GET', '/api/armazenamento/repasses?desde=' + encodeURIComponent(ag));
  assert.equal(nada.json.delta, true);
  assert.deepEqual(nada.json.dados, {});
  assert.equal(nada.json.n, tudo.json.n);
  assert.equal((await set({ 'repasses:b': '3', 'repasses:c': '4' })).status, 200);
  const d = await gestor('GET', '/api/armazenamento/repasses?desde=' + encodeURIComponent(ag));
  assert.deepEqual(d.json.dados, { 'repasses:b': '3', 'repasses:c': '4' });
  assert.equal(d.json.n, tudo.json.n + 1);
  // chave apagada: não aparece no delta, mas o total cai (a página relê tudo)
  assert.equal((await gestor('POST', '/api/armazenamento/repasses', { del: ['repasses:a'] })).status, 200);
  const d2 = await gestor('GET', '/api/armazenamento/repasses?desde=' + encodeURIComponent(d.json.agora));
  assert.equal(d2.json.n, tudo.json.n);
  assert.equal((await gestor('GET', '/api/armazenamento/repasses?desde=xyz')).status, 400);
  // a ferramenta isolada usa o mesmo ?desde= com a chave dela
  const chave = chaveDa((await gestor('GET', '/m/repasses/')).texto);
  const iso = await daFerramenta('GET', `/t/${chave}/api/armazenamento/repasses?desde=` + encodeURIComponent(ag));
  assert.equal(iso.status, 200);
  assert.equal(iso.json.delta, true);
});

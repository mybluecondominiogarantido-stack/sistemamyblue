'use strict';
/* Tutoriais em vídeo (node --test). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const { duracaoMp4 } = require('../server/tutoriais');

let servidor, base, ctx, admin, S;

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, headers = {}) {
    if (cookie) headers.cookie = cookie;
    let body;
    if (Buffer.isBuffer(corpo) || typeof corpo === 'string') { body = corpo; headers['content-type'] ||= 'application/octet-stream'; }
    else if (corpo !== undefined) { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
    const r = await fetch(base + url, { method: metodo, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null;
    try { json = JSON.parse(buf.toString()); } catch { /* não é JSON */ }
    return { status: r.status, json, buf, headers: r.headers };
  };
}
async function entrar(email, senha) {
  const c = cliente();
  assert.equal((await c('POST', '/api/auth/login', { email, senha })).status, 200);
  return c;
}
async function criar(nome, email, extra = {}) {
  const r = await admin('POST', '/api/admin/usuarios', { nome, email, senha: 'Senha1234', ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  return entrar(email, 'Senha1234');
}

/* MP4 mínimo: caixa ftyp + moov/mvhd com 90 s (escala 1000) + dados */
function mp4Falso(bytes = 3 * 1024 * 1024) {
  const ftyp = Buffer.from('00000018667479706973666f6d0000020069736f6d69736f32', 'hex');
  const mvhd = Buffer.alloc(108);
  mvhd.writeUInt32BE(108, 0); mvhd.write('mvhd', 4, 'latin1');
  mvhd.writeUInt32BE(1000, 20); mvhd.writeUInt32BE(90000, 24);
  const moov = Buffer.concat([Buffer.from([0, 0, 0, 116]), Buffer.from('moov', 'latin1'), mvhd]);
  const dados = Buffer.alloc(bytes - ftyp.length - moov.length);
  for (let i = 0; i < dados.length; i++) dados[i] = i % 251;
  return Buffer.concat([ftyp, moov, dados]);
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
});
after(() => servidor && servidor.close());

test('duração lida do cabeçalho do MP4', () => {
  assert.equal(duracaoMp4(mp4Falso(4096)), 90);
  assert.equal(duracaoMp4(Buffer.from('sem cabeçalho')), null);
});

test('só a administração envia; o vídeo precisa ser MP4 e estar no catálogo', async () => {
  const ana = await criar('Ana', 'ana@teste.com', { setores: [S('Cobrança')] });
  assert.equal((await ana('PUT', '/api/admin/tutoriais/ticket-atender/video', mp4Falso(4096))).status, 403);
  assert.equal((await admin('PUT', '/api/admin/tutoriais/ticket-atender/video', Buffer.from('não é vídeo'))).status, 400);
  assert.equal((await admin('PUT', '/api/admin/tutoriais/nao-existe/video', mp4Falso(4096))).status, 404);
  assert.equal((await admin('PUT', '/api/admin/tutoriais/ticket-atender/legendas', 'oi')).status, 400);
});

test('cada pessoa vê os vídeos do perfil, do setor e das ferramentas dela', async () => {
  const video = mp4Falso(4096);
  for (const slug of ['ticket-abrir-e-acompanhar', 'ticket-atender', 'ticket-lider', 'gestao-usuarios', 'admin-usuarios', 'ferramenta-suprimentos', 'ferramenta-boletos']) {
    assert.equal((await admin('PUT', `/api/admin/tutoriais/${slug}/video`, video)).status, 200);
  }
  const lista = async (c) => (await c('GET', '/api/tutoriais')).json.tutoriais.map((t) => t.slug).sort();
  const rui = await criar('Rui', 'rui@teste.com', { setores: [S('Suprimentos')], modulos: ['suprimentos'] });
  const cleo = await criar('Cleo', 'cleo@teste.com', { papel: 'coordenador', setores: [S('Crédito')] });
  const sem = await criar('Sem Setor', 'sem@teste.com', {});
  assert.deepEqual(await lista(sem), ['ticket-abrir-e-acompanhar']);
  assert.deepEqual(await lista(rui), ['ferramenta-suprimentos', 'ticket-abrir-e-acompanhar', 'ticket-atender']);
  // coordenador: gestão do setor, líder e as ferramentas do setor dele (Boletos é do Crédito)
  assert.deepEqual(await lista(cleo), ['ferramenta-boletos', 'gestao-usuarios', 'ticket-abrir-e-acompanhar', 'ticket-atender', 'ticket-lider']);
  assert.equal((await lista(admin)).length, 7);
  // vídeo fora do alcance da pessoa: 404
  assert.equal((await rui('GET', '/api/tutoriais/admin-usuarios/video')).status, 404);
  assert.equal((await rui('GET', '/api/tutoriais/ferramenta-suprimentos/video')).status, 200);
  // lista da administração mostra o catálogo inteiro, com o que falta enviar
  const adm = (await admin('GET', '/api/admin/tutoriais')).json.tutoriais;
  assert.ok(adm.length > 7);
  assert.equal(adm.find((t) => t.slug === 'ticket-supervisao').tem_video, false);
  assert.equal(adm.find((t) => t.slug === 'ticket-atender').duracao, 90);
});

test('vídeo sai aos pedaços (Range) e as legendas em .vtt', async () => {
  const video = mp4Falso();
  assert.equal((await admin('PUT', '/api/admin/tutoriais/portal-primeiro-acesso/video', video)).status, 200);
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n1 · Entrar — Entre com o seu e-mail.\n';
  assert.equal((await admin('PUT', '/api/admin/tutoriais/portal-primeiro-acesso/legendas', vtt, { 'content-type': 'text/vtt' })).status, 200);

  const todo = await admin('GET', '/api/tutoriais/portal-primeiro-acesso/video');
  assert.equal(todo.status, 200);
  assert.ok(todo.buf.equals(video));

  const p1 = await admin('GET', '/api/tutoriais/portal-primeiro-acesso/video', undefined, { range: 'bytes=0-' });
  assert.equal(p1.status, 206);
  assert.equal(p1.headers.get('content-range'), `bytes 0-${1024 * 1024 - 1}/${video.length}`);
  assert.ok(p1.buf.equals(video.subarray(0, 1024 * 1024)));
  const p2 = await admin('GET', '/api/tutoriais/portal-primeiro-acesso/video', undefined, { range: 'bytes=2000000-2000099' });
  assert.ok(p2.buf.equals(video.subarray(2000000, 2000100)));
  const fim = await admin('GET', '/api/tutoriais/portal-primeiro-acesso/video', undefined, { range: 'bytes=-500' });
  assert.ok(fim.buf.equals(video.subarray(video.length - 500)));
  assert.equal((await admin('GET', '/api/tutoriais/portal-primeiro-acesso/video', undefined, { range: `bytes=${video.length}-` })).status, 416);

  const leg = await admin('GET', '/api/tutoriais/portal-primeiro-acesso/legendas');
  assert.equal(leg.buf.toString(), vtt);

  assert.equal((await admin('DELETE', '/api/admin/tutoriais/portal-primeiro-acesso')).status, 200);
  assert.equal((await admin('GET', '/api/tutoriais/portal-primeiro-acesso/video')).status, 404);
});

test('a administração vê o tutorial a regravar quando a ferramenta muda, e as ferramentas sem tutorial', async () => {
  const html = (t) => `<!doctype html><html><head><meta charset="utf-8"><title>${t}</title></head><body>${t}</body></html>`;
  assert.equal((await admin('PUT', '/api/admin/modulos/suprimentos/arquivo', html('v1'), { 'content-type': 'text/html' })).status, 200);
  assert.equal((await admin('PUT', '/api/admin/tutoriais/ferramenta-suprimentos/video', mp4Falso(4096))).status, 200);
  const ver = async () => (await admin('GET', '/api/admin/tutoriais')).json;
  assert.equal((await ver()).tutoriais.find((t) => t.slug === 'ferramenta-suprimentos').desatualizado, false);

  // HTML novo da ferramenta depois do vídeo: o tutorial fica marcado para regravar
  await ctx.db.q("UPDATE tutoriais SET enviado_em = now() - interval '1 day' WHERE slug = 'ferramenta-suprimentos'");
  assert.equal((await admin('PUT', '/api/admin/modulos/suprimentos/arquivo', html('v2'), { 'content-type': 'text/html' })).status, 200);
  assert.equal((await ver()).tutoriais.find((t) => t.slug === 'ferramenta-suprimentos').desatualizado, true);
  // vídeo novo enviado: volta a ficar em dia
  assert.equal((await admin('PUT', '/api/admin/tutoriais/ferramenta-suprimentos/video', mp4Falso(4096))).status, 200);
  assert.equal((await ver()).tutoriais.find((t) => t.slug === 'ferramenta-suprimentos').desatualizado, false);

  // ferramenta nova, sem tutorial no catálogo
  assert.equal((await admin('POST', '/api/admin/modulos', { nome: 'Ferramenta Nova', slug: 'ferramenta-nova', setor_id: S('Cobrança') })).status, 201);
  assert.ok(!(await ver()).sem_tutorial.some((m) => m.slug === 'ferramenta-nova')); // ainda sem HTML
  assert.equal((await admin('PUT', '/api/admin/modulos/ferramenta-nova/arquivo', html('nova'), { 'content-type': 'text/html' })).status, 200);
  assert.ok((await ver()).sem_tutorial.some((m) => m.slug === 'ferramenta-nova'));
  assert.ok(!(await ver()).sem_tutorial.some((m) => m.slug === 'suprimentos'));
});

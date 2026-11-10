'use strict';
/* Pedido ao Jurídico pela Central de Tickets: o tipo é a atividade da Tabela de prazos, o ticket gera a demanda com protocolo
   e prazo, e a situação marcada pelo Jurídico aparece no ticket (dados fictícios). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx;

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

let admin, exec, adv;
const ids = {};
async function pessoa(nome, email) {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel: 'usuario', senha: 'Senha1234' });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}
async function noSetor(email, setor) {
  const s = await ctx.db.um('SELECT id FROM setores WHERE nome = $1', [setor]);
  await ctx.db.q('INSERT INTO setor_membros (setor_id, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [s.id, ids[email]]);
  return s.id;
}

let setorJ;
before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0,
    portalUrl: 'https://portal.teste', enviarEmail: async () => {} });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');
  exec = await pessoa('Executiva Fictícia', 'exec@teste.com');
  adv = await pessoa('Advogada Fictícia', 'adv@teste.com');
  await noSetor('exec@teste.com', 'Comercial');
  setorJ = await noSetor('adv@teste.com', 'Jurídico');
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

let idT, idD, protocolo;
test('ticket para o Jurídico: a atividade vem da Tabela de prazos e o ticket gera a demanda com protocolo e prazo', async () => {
  const meta = (await exec('GET', '/api/tickets/meta')).json;
  assert.equal(meta.juridico.setor_id, setorJ);
  const nomes = meta.juridico.tipos.map((t) => t.nome);
  assert.ok(nomes.includes('Aditivo'));
  assert.ok(!nomes.some((n) => /garantia|parceri/i.test(n))); // contrato de garantia e de parceria têm pedido próprio
  const aditivo = meta.juridico.tipos.find((t) => t.nome === 'Aditivo');
  // sem a atividade, não abre
  assert.equal((await exec('POST', '/api/tickets', { setor_id: setorJ, titulo: 'Aditivo de taxa', interno: true })).status, 400);
  const garantia = (await ctx.db.um('SELECT id FROM juridico_tipos WHERE contratos LIMIT 1')).id;
  assert.equal((await exec('POST', '/api/tickets', { setor_id: setorJ, titulo: 'Contrato', interno: true, juridico_tipo_id: garantia })).status, 400);
  const r = await exec('POST', '/api/tickets', { setor_id: setorJ, titulo: 'Aditivo de taxa extra', descricao: 'Condomínio fictício pediu aditivo.', interno: true, juridico_tipo_id: aditivo.id });
  assert.equal(r.status, 201, r.texto);
  idT = r.json.id;
  protocolo = r.json.demanda.protocolo;
  assert.match(protocolo, /^JUR-\d{4}-\d{2}-\d{2}-\d{2}$/);
  assert.equal(r.json.demanda.prazo, aditivo.prazo);
  const d = await ctx.db.um('SELECT id, ticket_id, canal, status, prazo::text AS prazo, solicitante_id, objeto FROM juridico_demandas WHERE protocolo = $1', [protocolo]);
  idD = d.id;
  assert.deepEqual([d.ticket_id, d.canal, d.status, d.prazo, d.solicitante_id], [idT, 'ticket', 'pendente', aditivo.prazo, ids['exec@teste.com']]);
  assert.match(d.objeto, /Aditivo de taxa extra/);
  // o ticket mostra a demanda e fica com o mesmo prazo de entrega
  const t = (await exec('GET', `/api/tickets/${idT}`)).json;
  assert.equal(t.demanda_juridica.protocolo, protocolo);
  assert.ok(t.ticket.prazo_conclusao);
  assert.ok(t.eventos.some((e) => e.tipo === 'juridico'));
  // quem pediu acompanha pelo ticket: o pedido não aparece em Solicitações ao Jurídico
  assert.ok(!(await exec('GET', '/api/juridico/demandas?vis=minhas')).json.demandas.some((x) => x.ref === protocolo));
  // o Jurídico vê no Painel, com o protocolo
  assert.ok((await adv('GET', '/api/juridico/demandas?vis=todas')).json.demandas.some((x) => x.ref === protocolo && x.ticket_id === idT));
});

test('a situação e o responsável marcados pelo Jurídico aparecem no ticket', async () => {
  let r = await adv('PATCH', `/api/juridico/demandas/${idD}`, { status: 'em_andamento', responsavel_id: ids['adv@teste.com'] });
  assert.equal(r.status, 200, r.texto);
  let t = (await exec('GET', `/api/tickets/${idT}`)).json.ticket;
  assert.deepEqual([t.status, t.responsavel_id], ['em_andamento', ids['adv@teste.com']]);
  r = await adv('PATCH', `/api/juridico/demandas/${idD}`, { status: 'aguardando_retorno' });
  assert.equal((await exec('GET', `/api/tickets/${idT}`)).json.ticket.status, 'aguardando');
  r = await adv('PATCH', `/api/juridico/demandas/${idD}`, { status: 'concluido' });
  assert.equal(r.status, 200, r.texto);
  t = (await exec('GET', `/api/tickets/${idT}`)).json.ticket;
  assert.equal(t.status, 'resolvido');
  assert.ok(t.resolvido_em);
});

test('ticket para outro setor continua igual (sem demanda)', async () => {
  const s = (await ctx.db.um("SELECT id FROM setores WHERE nome = 'Comercial'")).id;
  const r = await adv('POST', '/api/tickets', { setor_id: s, titulo: 'Proposta', interno: true });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.demanda, null);
  assert.equal((await ctx.db.um('SELECT COUNT(*)::int AS n FROM juridico_demandas WHERE ticket_id = $1', [r.json.id])).n, 0);
});

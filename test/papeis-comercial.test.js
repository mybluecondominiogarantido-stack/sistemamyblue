'use strict';
/* Perfil Gerente, chancelas por assunto (crédito x comercial), Gestão do Comercial e as telas do portal em
   Acessos → Ferramentas (dados fictícios). */
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

let admin, gerente, coord, executivo, ceo, diretora;
const ids = {};
const S = async (nome) => (await ctx.db.um('SELECT id FROM setores WHERE nome = $1', [nome])).id;
async function pessoa(nome, email, extra = {}) {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel: 'usuario', senha: 'Senha1234', ...extra });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}
const tela = async (c, slug) => (await c('GET', `/api/admin/nativas/${slug}/acesso`)).json;
const daPessoa = (q, email) => q.pessoas.find((p) => p.id === ids[email]);
const mudar = (c, slug, email, papel, tem = true) => c('PUT', `/api/admin/nativas/${slug}/acesso`, { mudancas: [{ usuario_id: ids[email], papel, tem }] });

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
  if (!(await ctx.db.um("SELECT 1 FROM setores WHERE nome = 'Comercial'"))) await ctx.db.q("INSERT INTO setores (nome, ordem) VALUES ('Comercial', 3)");
  const com = await S('Comercial');
  gerente = await pessoa('Gina Gerente', 'gerente@teste.com', { papel: 'gerente', setores: [com] });
  coord = await pessoa('Caio Coordenador', 'coord@teste.com', { papel: 'coordenador', setores: [com] });
  executivo = await pessoa('Edu Executivo', 'exec@teste.com', { setores: [com] });
  ceo = await pessoa('Rui Presidente', 'ceo@teste.com');
  diretora = await pessoa('Vera Diretora', 'diretora@teste.com', { papel: 'coordenador', setores: [com] });
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

test('perfil Gerente: existe, gerencia o setor como a coordenação e aparece como gerência', async () => {
  const u = (await admin('GET', '/api/admin/usuarios')).json.usuarios.find((x) => x.id === ids['gerente@teste.com']);
  assert.equal(u.papel, 'gerente');
  // gerencia o setor: entra em Configurações (usuários do setor) e vê as telas do portal
  assert.equal((await gerente('GET', '/api/admin/usuarios')).status, 200);
  const telas = (await gerente('GET', '/api/admin/nativas')).json.nativas.map((x) => x.slug);
  assert.deepEqual(telas, ['tela-credito', 'tela-contratos', 'tela-implantacao', 'tela-juridico']);
  // usuário comum não entra nas telas de administração
  assert.equal((await executivo('GET', '/api/admin/nativas')).status, 403);
});

test('Gestão do Comercial: vem com o perfil Gerente no Comercial e só a gerência (ou a administração) distribui', async () => {
  const q = await tela(gerente, 'tela-credito');
  assert.match(daPessoa(q, 'gerente@teste.com').automaticos.gestao_comercial, /Gerência/);
  assert.ok(!daPessoa(q, 'coord@teste.com').automaticos.gestao_comercial);
  assert.ok(q.papeis.find((x) => x.id === 'gestao_comercial').editavel);
  assert.ok(!q.papeis.find((x) => x.id === 'chancela_credito').editavel, 'chancela é da administração');
  // a coordenação do setor não se dá a Gestão do Comercial
  assert.equal((await mudar(coord, 'tela-credito', 'coord@teste.com', 'gestao_comercial')).status, 403);
  // a gerência dá à diretora
  assert.equal((await mudar(gerente, 'tela-credito', 'diretora@teste.com', 'gestao_comercial')).status, 200);
  assert.ok(daPessoa(await tela(admin, 'tela-contratos'), 'diretora@teste.com').papeis.includes('gestao_comercial'), 'o mesmo papel vale nas outras telas');
  // e o que a gestão vê
  const p = (await gerente('GET', '/api/credito/meta')).json.perfil;
  assert.equal(p.gestao, true);
  assert.equal(p.diretoria, false);
  assert.equal((await gerente('GET', '/api/credito/analises?vis=todas')).status, 200);
  assert.equal((await gerente('GET', '/api/credito/analises?vis=diretoria')).status, 403);
  assert.equal((await coord('GET', '/api/credito/analises?vis=todas')).status, 403);
  const ct = (await gerente('GET', '/api/contratos/meta')).json.perfil;
  assert.equal(ct.ve_tudo, true);
  assert.equal(ct.diretoria, false);
  assert.equal((await gerente('GET', '/api/contratos?vis=todas')).status, 200);
  assert.equal((await gerente('GET', '/api/implantacoes/meta')).json.perfil.diretoria, true, 'vê todas as implantações (consulta)');
});

test('executivo marcado pela gestão do Comercial passa a pedir análise', async () => {
  assert.equal((await executivo('GET', '/api/credito/meta')).json.perfil.executivo, null);
  assert.equal((await mudar(gerente, 'tela-credito', 'exec@teste.com', 'executivo')).status, 200);
  const e = (await executivo('GET', '/api/credito/meta')).json.perfil.executivo;
  assert.equal(e.nome, 'Edu Executivo');
  const acessos = (await admin('GET', `/api/admin/usuarios/${ids['exec@teste.com']}/acessos`)).json;
  assert.ok(acessos.telas.some((t) => t.slug === 'tela-credito' && t.papeis.includes('Executivo de negócios')));
  // tirar: o cadastro fica, só deixa de valer
  assert.equal((await mudar(gerente, 'tela-credito', 'exec@teste.com', 'executivo', false)).status, 200);
  assert.equal((await executivo('GET', '/api/credito/meta')).json.perfil.executivo, null);
  assert.equal((await ctx.db.um('SELECT COUNT(*)::int AS n FROM executivos WHERE usuario_id = $1', [ids['exec@teste.com']])).n, 1);
});

test('chancelas por assunto: crédito (CEO) e comercial (diretora); sem chancela comercial, a de crédito decide', async () => {
  assert.equal((await mudar(gerente, 'tela-credito', 'ceo@teste.com', 'chancela_credito')).status, 403);
  assert.equal((await mudar(admin, 'tela-credito', 'ceo@teste.com', 'chancela_credito')).status, 200);
  // ninguém com a chancela comercial: o CEO decide os itens comerciais (nada fica parado)
  assert.equal((await ceo('GET', '/api/contratos/meta')).json.perfil.diretoria, true);
  assert.equal((await diretora('GET', '/api/contratos/meta')).json.perfil.diretoria, false);
  // a diretora recebe a chancela comercial: cada um decide o seu
  assert.equal((await mudar(admin, 'tela-contratos', 'diretora@teste.com', 'chancela_comercial')).status, 200);
  const ceoCt = (await ceo('GET', '/api/contratos/meta')).json.perfil;
  assert.equal(ceoCt.diretoria, false, 'o CEO não decide mais os itens comerciais');
  assert.equal(ceoCt.ve_tudo, true, 'mas continua vendo tudo');
  assert.equal((await diretora('GET', '/api/contratos/meta')).json.perfil.diretoria, true);
  assert.equal((await diretora('GET', '/api/parcerias/meta')).json.perfil.diretoria, true);
  assert.equal((await ceo('GET', '/api/parcerias/meta')).json.perfil.diretoria, false);
  // crédito: só o CEO chancela; a diretora vê (consulta)
  assert.equal((await ceo('GET', '/api/credito/meta')).json.perfil.diretoria, true);
  const dir = (await diretora('GET', '/api/credito/meta')).json.perfil;
  assert.equal(dir.diretoria, false);
  assert.equal(dir.gestao, true);
  assert.equal((await diretora('GET', '/api/credito/analises?vis=diretoria')).status, 403);
  // quem é avisado da chancela comercial
  assert.deepEqual(await ctx.regras.pessoasDaChancelaComercial(), [ids['diretora@teste.com']]);
});

test('papéis de setor: só a gestão do setor dono muda (e a pessoa entra no setor)', async () => {
  assert.equal((await mudar(gerente, 'tela-implantacao', 'exec@teste.com', 'equipe_implantacao')).status, 403);
  assert.equal((await mudar(admin, 'tela-implantacao', 'exec@teste.com', 'equipe_implantacao')).status, 200);
  assert.ok(await ctx.db.um("SELECT 1 FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id WHERE s.nome = 'Implantação' AND sm.usuario_id = $1", [ids['exec@teste.com']]));
  assert.equal((await mudar(admin, 'tela-implantacao', 'exec@teste.com', 'equipe_implantacao', false)).status, 200);
  const hist = await ctx.db.um("SELECT COUNT(*)::int AS n FROM auditoria WHERE acao = 'tela_papeis'");
  assert.ok(hist.n >= 5, 'cada mudança fica no Histórico');
});

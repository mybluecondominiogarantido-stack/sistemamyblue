'use strict';
/* Perfis Coordenador e Supervisor (node --test). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx, admin, coord, coordId, sup, S;
const ids = {};

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let body;
    if (typeof corpo === 'string') { body = corpo; headers['content-type'] = 'text/html'; }
    else if (corpo !== undefined) { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
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
async function criar(nome, email, extra = {}) {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, senha: 'Senha1234', ...extra });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return r.json.id;
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
  // o setor de cada pessoa vem do cadastro
  coordId = await criar('Cora Coordenadora', 'cora@teste.com', { papel: 'coordenador', setores: [S('Crédito')] });
  await criar('Sávio Supervisor', 'savio@teste.com', { papel: 'supervisor', setores: [S('Cobrança')] });
  await criar('Ivo da Equipe', 'ivo@teste.com', { setores: [S('Crédito')], modulos: ['credito', 'parceiros'] });
  await criar('Olga de Fora', 'olga@teste.com', { setores: [S('Cobrança')], modulos: ['cobranca'] });
  coord = await entrar('cora@teste.com', 'Senha1234');
  sup = await entrar('savio@teste.com', 'Senha1234');
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('coordenador e supervisor precisam de setor; o setor forma a equipe da Central de Tickets', async () => {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'Sem Setor', email: 'semsetor@teste.com', papel: 'coordenador', setores: [] });
  assert.equal(r.status, 400);
  const eq = (await admin('GET', '/api/admin/equipes')).json.setores.find((x) => x.id === S('Crédito'));
  assert.deepEqual(eq.membros.map((m) => m.usuario_id).sort(), [coordId, ids['ivo@teste.com']].sort());
});

test('coordenador vê só os usuários comuns do setor e as ferramentas do setor', async () => {
  const r = await coord('GET', '/api/admin/usuarios');
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.usuarios.map((u) => u.email), ['ivo@teste.com']);
  assert.deepEqual(r.json.setores.map((x) => x.nome), ['Crédito']);
  assert.deepEqual(r.json.modulos_disponiveis.map((m) => m.slug).sort(), ['boletos', 'credito']);
  // abre todas as ferramentas do setor sem precisar liberar uma a uma
  assert.deepEqual((await coord('GET', '/api/modulos')).json.modulos.map((m) => m.slug).sort(), ['boletos', 'credito']);
});

test('coordenador cria usuário comum no setor dele, só com as ferramentas do setor', async () => {
  const r = await coord('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'Nina Nova', email: 'nina@teste.com', modulos: ['boletos', 'parceiros'], setores: [S('Crédito'), S('Cobrança')], supervisor_tickets: true, editor_links: true });
  assert.equal(r.status, 201, r.texto);
  const u = (await admin('GET', '/api/admin/usuarios')).json.usuarios.find((x) => x.email === 'nina@teste.com');
  assert.equal(u.papel, 'usuario');
  assert.deepEqual(u.modulos, ['boletos'], 'parceiros não é do setor dela');
  assert.deepEqual(u.setores, [S('Crédito')], 'Cobrança não é setor dela');
  assert.equal(u.supervisor_tickets, false);
  assert.equal(u.editor_links, false);
  assert.deepEqual([u.data_nascimento, u.data_admissao], ['1990-05-10', '2024-02-01']);
  // nascimento e admissão são obrigatórios para quem cria (coordenação ou administração) e para quem edita
  const semData = await coord('POST', '/api/admin/usuarios', { nome: 'Sem Data', email: 'semdata@teste.com', setores: [S('Crédito')] });
  assert.equal(semData.status, 400);
  assert.match(semData.json.erro, /nascimento/);
  assert.match((await admin('POST', '/api/admin/usuarios', { nome: 'Sem Admissão', email: 'semadm@teste.com', data_nascimento: '1990-05-10' })).json.erro, /admissão/);
  assert.equal((await admin('POST', '/api/admin/usuarios', { nome: 'Ano Errado', email: 'ano@teste.com', data_nascimento: '2025-05-10', data_admissao: '2024-02-01' })).status, 400);
  assert.equal((await admin('POST', '/api/admin/usuarios', { nome: 'Data Torta', email: 'torta@teste.com', data_nascimento: '1990-02-31', data_admissao: '2024-02-01' })).status, 400);
  assert.equal((await coord('PATCH', `/api/admin/usuarios/${u.id}`, { nome: 'Nina Nova', data_admissao: '2024-03-01' })).status, 200);
  assert.equal((await admin('GET', '/api/admin/usuarios')).json.usuarios.find((x) => x.id === u.id).data_admissao, '2024-03-01');
  assert.equal((await coord('PATCH', `/api/admin/usuarios/${u.id}`, { nome: 'Nina Nova', data_nascimento: '' })).status, 400);
  assert.equal((await coord('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'Sem', email: 'sem@teste.com', setores: [S('Cobrança')] })).status, 400, 'precisa de um setor dela');
  for (const papel of ['admin', 'coordenador', 'supervisor']) {
    assert.equal((await coord('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'X', email: `x-${papel}@teste.com`, papel, setores: [S('Crédito')] })).status, 403);
  }
});

test('coordenador edita a equipe sem tirar o que é de outros setores', async () => {
  const ivo = ids['ivo@teste.com'];
  const r = await coord('PATCH', `/api/admin/usuarios/${ivo}`, { nome: 'Ivo Silva', modulos: ['boletos'], papel: 'admin', ativo: true });
  assert.equal(r.status, 200, r.texto);
  const u = (await admin('GET', '/api/admin/usuarios')).json.usuarios.find((x) => x.id === ivo);
  assert.equal(u.nome, 'Ivo Silva');
  assert.equal(u.papel, 'usuario', 'não muda o perfil');
  assert.deepEqual(u.modulos.sort(), ['boletos', 'parceiros'], 'tira crédito, põe boletos e mantém parceiros (outro setor)');
  // abre Parceiros (outro setor): a senha dele só a administração redefine
  assert.equal((await coord('POST', `/api/admin/usuarios/${ivo}/senha`, {})).status, 403);
});

test('coordenador não mexe em quem é de outro setor, nem em coordenadores, supervisores e administradores', async () => {
  for (const email of ['olga@teste.com', 'savio@teste.com', 'admin@teste.com']) {
    const id = ids[email] || 1;
    assert.equal((await coord('PATCH', `/api/admin/usuarios/${id}`, { nome: 'Hack' })).status, 404, email);
    assert.equal((await coord('POST', `/api/admin/usuarios/${id}/senha`, {})).status, 404, email);
  }
  assert.equal((await coord('PATCH', `/api/admin/usuarios/${coordId}`, { papel: 'admin' })).status, 404, 'nem em si mesma');
  for (const url of ['/api/admin/setores', '/api/admin/backup', '/api/admin/auditoria']) {
    assert.equal((await coord('GET', url)).status, 403, url);
  }
  assert.equal((await coord('POST', '/api/admin/equipes/email-teste')).status, 403);
});

test('supervisor tem os mesmos poderes no setor dele, e não fica acima do coordenador', async () => {
  const r = await sup('GET', '/api/admin/usuarios');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.usuarios.map((u) => u.email), ['olga@teste.com']);
  assert.equal((await sup('PATCH', `/api/admin/usuarios/${coordId}`, { nome: 'X' })).status, 404, 'não gerencia coordenador');
  assert.equal((await sup('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome: 'Y', email: 'y@teste.com', setores: [S('Cobrança')] })).status, 201);
  // tickets: o perfil já traz a Supervisão da Central de Tickets (vê e direciona todos os setores)
  assert.equal((await sup('GET', '/api/tickets?vis=todos')).status, 200);
  assert.equal((await sup('GET', '/api/auth/eu')).json.usuario.supervisor_tickets, true);
  assert.equal((await sup('GET', '/api/tickets/painel/indicadores')).status, 200);
});

test('coordenador age como líder nos tickets do setor dele', async () => {
  const olga = await entrar('olga@teste.com', 'Senha1234');
  const t = await olga('POST', '/api/tickets', { interno: true, titulo: 'Balancete', setor_id: S('Crédito'), prioridade: 'media' });
  assert.equal(t.status, 201, t.texto);
  const d = (await coord('GET', `/api/tickets/${t.json.id}`)).json;
  assert.equal(d.pode.atribuir, true);
  assert.equal((await coord('PATCH', `/api/tickets/${t.json.id}`, { responsavel_id: ids['ivo@teste.com'] })).status, 200);
});

test('equipe e tipos de demanda: só os setores dele; escolhe os líderes, não muda quem é do setor', async () => {
  const j = (await coord('GET', '/api/admin/equipes')).json;
  assert.equal(j.restrito, true);
  assert.deepEqual(j.setores.map((x) => x.nome), ['Crédito']);
  const ivo = ids['ivo@teste.com'];
  assert.equal((await coord('PUT', `/api/admin/equipes/${S('Crédito')}/membros`, { membros: [{ usuario_id: ivo, lider: true }, { usuario_id: ids['olga@teste.com'], lider: true }] })).status, 200);
  const membros = (await admin('GET', '/api/admin/equipes')).json.setores.find((x) => x.id === S('Crédito')).membros;
  assert.ok(membros.find((m) => m.usuario_id === ivo).lider);
  assert.ok(!membros.some((m) => m.usuario_id === ids['olga@teste.com']), 'não incluiu quem é de outro setor');
  assert.equal((await coord('PUT', `/api/admin/equipes/${S('Cobrança')}/membros`, { membros: [] })).status, 404);
  const c = await coord('POST', `/api/admin/equipes/${S('Crédito')}/categorias`, { nome: 'Balancete', prazo_horas: 18 });
  assert.equal(c.status, 201);
  assert.equal((await coord('PATCH', `/api/admin/categorias/${c.json.id}`, { prazo_horas: 27 })).status, 200);
  assert.equal((await coord('POST', `/api/admin/equipes/${S('Cobrança')}/categorias`, { nome: 'X' })).status, 404);
  const outra = await admin('POST', `/api/admin/equipes/${S('Cobrança')}/categorias`, { nome: 'Acordo' });
  assert.equal((await coord('DELETE', `/api/admin/categorias/${outra.json.id}`)).status, 404);
});

test('carteira: coordenador altera e transfere só o responsável do setor dele', async () => {
  const cond = await admin('POST', '/api/carteira', { codigo: '501', nome: 'Cond. Teste', assistente_credito: 'IVO SILVA', analista_cobranca: 'OLGA', inicio_contrato: '10/2026' });
  const id = cond.json.id;
  const j = (await coord('GET', '/api/carteira')).json;
  assert.deepEqual(j.funcoes_editaveis, ['assistente_credito']);
  assert.equal((await coord('PATCH', `/api/carteira/${id}`, { assistente_credito: 'NINA NOVA' })).status, 200);
  assert.equal((await coord('PATCH', `/api/carteira/${id}`, { analista_cobranca: 'X' })).status, 403);
  assert.equal((await coord('PATCH', `/api/carteira/${id}`, { nome: 'Outro nome' })).status, 403);
  assert.equal((await coord('POST', '/api/carteira/transferir', { funcao: 'assistente_credito', de: 'NINA NOVA', para: 'IVO SILVA' })).status, 200);
  assert.equal((await coord('POST', '/api/carteira/transferir', { funcao: 'analista_cobranca', de: 'OLGA', para: 'X' })).status, 403);
  assert.equal((await sup('PATCH', `/api/carteira/${id}`, { analista_cobranca: 'OLGA LIMA' })).status, 200, 'supervisor de Cobrança');
  const olga = await entrar('olga@teste.com', 'Senha1234');
  assert.equal((await olga('PATCH', `/api/carteira/${id}`, { analista_cobranca: 'X' })).status, 403, 'usuário comum não altera');
});

test('ferramentas do setor: HTML, versões e quem pode abrir', async () => {
  const html = (t) => `<!doctype html><html><head><title>${t}</title></head><body>ok</body></html>`;
  const lista = await coord('GET', '/api/admin/modulos');
  assert.equal(lista.status, 200, lista.texto);
  assert.deepEqual(lista.json.modulos.map((m) => m.slug).sort(), ['boletos', 'credito']);
  // ferramenta não isolada: o HTML da coordenação aguarda a aprovação da administração
  let r = await coord('PUT', '/api/admin/modulos/boletos/arquivo', html('Boletos v1'));
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.aguardando_aprovacao, true);
  const v1 = r.json.versao;
  const emUso = async () => (await ctx.db.um("SELECT versao_id, versao_pendente_id FROM modulos WHERE slug = 'boletos'"));
  assert.equal((await emUso()).versao_id, null, 'nada em uso ainda');
  assert.equal((await emUso()).versao_pendente_id, v1);
  assert.equal((await coord('POST', `/api/admin/modulos/boletos/versoes/${v1}/usar`)).status, 404, 'a coordenação não põe em uso a versão que aguarda');
  assert.equal((await coord('POST', `/api/admin/modulos/boletos/versoes/${v1}/aprovar`)).status, 403, 'só a administração aprova');
  const avisoAdmin = await ctx.db.um("SELECT titulo FROM notificacoes WHERE usuario_id = 1 AND tipo = 'versao_aguardando'");
  assert.ok(avisoAdmin, 'a administração é avisada');
  // prévia: sempre isolada, para a administração e a coordenação do setor
  const previa = await admin('GET', `/m/boletos/?versao=${v1}`);
  assert.equal(previa.status, 200);
  assert.match(previa.texto, /Boletos v1/);
  assert.equal((await coord('GET', `/m/boletos/?versao=${v1}`)).status, 200);
  assert.equal((await admin('POST', `/api/admin/modulos/boletos/versoes/${v1}/aprovar`)).status, 200);
  assert.equal((await emUso()).versao_id, v1);
  assert.equal((await emUso()).versao_pendente_id, null);
  // versão recusada é apagada; a em uso continua
  r = await coord('PUT', '/api/admin/modulos/boletos/arquivo', html('Boletos v2'));
  assert.equal((await admin('POST', `/api/admin/modulos/boletos/versoes/${r.json.versao}/recusar`)).status, 200);
  assert.equal((await emUso()).versao_id, v1);
  assert.equal((await coord('GET', '/api/admin/modulos/boletos/versoes')).json.versoes.length, 1);
  // ferramenta isolada: o HTML da coordenação entra em uso na hora
  await admin('PATCH', '/api/admin/modulos/boletos', { isolada: true });
  r = await coord('PUT', '/api/admin/modulos/boletos/arquivo', html('Boletos v3'));
  assert.equal(r.json.aguardando_aprovacao, undefined);
  assert.equal((await emUso()).versao_id, r.json.versao);
  await admin('PATCH', '/api/admin/modulos/boletos', { isolada: false });
  assert.equal((await coord('PUT', '/api/admin/modulos/cobranca/arquivo', html('Cobrança'))).status, 403, 'outro setor');
  const v = await coord('GET', '/api/admin/modulos/boletos/versoes');
  assert.equal(v.json.versoes.length, 2);
  assert.equal((await coord('POST', `/api/admin/modulos/boletos/versoes/${v.json.versoes[1].id}/usar`)).status, 200, 'versão aprovada: a coordenação volta a ela');
  // baixar o HTML de uma versão: como foi enviado, só para quem gerencia a ferramenta
  const baixado = await coord('GET', `/api/admin/modulos/boletos/versoes/${v.json.versoes[1].id}/arquivo`);
  assert.equal(baixado.status, 200);
  assert.equal(baixado.texto, html('Boletos v1'));
  const vc = (await admin('GET', '/api/admin/modulos/cobranca/versoes')).json.versoes;
  if (vc.length) assert.equal((await coord('GET', `/api/admin/modulos/cobranca/versoes/${vc[0].id}/arquivo`)).status, 403, 'outro setor');
  assert.equal((await coord('GET', `/api/admin/modulos/credito/versoes/${v.json.versoes[0].id}/arquivo`)).status, 404, 'versão de outra ferramenta');
  // quem pode abrir: a coordenação libera gente do setor dela e de outros setores
  const ivo = ids['ivo@teste.com'];
  const olga = ids['olga@teste.com'];
  assert.equal((await coord('PUT', '/api/admin/modulos/credito/acesso', { usuarios: [ivo, olga] })).status, 200);
  const perm = async () => (await ctx.db.q("SELECT usuario_id FROM permissoes WHERE modulo_slug = 'credito'")).rows.map((x) => x.usuario_id).sort();
  assert.deepEqual(await perm(), [ivo, olga].sort(), 'Olga (outro setor) liberada pela coordenação');
  const quadro = (await coord('GET', '/api/admin/modulos/credito/acesso')).json;
  assert.ok(quadro.pessoas.some((p) => p.id === olga && p.liberado && !p.do_setor));
  assert.equal((await coord('PUT', '/api/admin/modulos/credito/acesso', { usuarios: [ivo] })).status, 200);
  assert.deepEqual(await perm(), [ivo]);
  assert.equal((await coord('PUT', '/api/admin/modulos/cobranca/acesso', { usuarios: [] })).status, 403);
  // o resto continua só com o administrador
  assert.equal((await coord('PATCH', '/api/admin/modulos/boletos', { nome: 'X' })).status, 403);
  assert.equal((await coord('DELETE', '/api/admin/modulos/boletos?confirmar=boletos')).status, 403);
  assert.equal((await coord('GET', '/api/admin/modulos/boletos/dados')).status, 403);
  assert.equal((await coord('POST', '/api/admin/modulos/boletos/documentos', { documentos: {} })).status, 403);
});

test('admin cria e edita os quatro perfis', async () => {
  const id = ids['olga@teste.com'];
  for (const papel of ['supervisor', 'coordenador', 'usuario']) {
    assert.equal((await admin('PATCH', `/api/admin/usuarios/${id}`, { papel })).status, 200);
    assert.equal((await ctx.db.um('SELECT papel FROM usuarios WHERE id = $1', [id])).papel, papel);
  }
});

test('coordenador não redefine a senha de quem tem acesso além dos setores dele', async () => {
  const soCredito = await criar('Lia do Crédito', 'lia@teste.com', { setores: [S('Crédito')], modulos: ['credito'] });
  let r = await coord('POST', `/api/admin/usuarios/${soCredito}/senha`, {});
  assert.equal(r.status, 200, r.texto);
  assert.ok(r.json.senha_temporaria);
  // Ivo abre uma ferramenta de outro setor (Parceiros): com a senha temporária, a coordenação entraria nela
  r = await coord('POST', `/api/admin/usuarios/${ids['ivo@teste.com']}/senha`, {});
  assert.equal(r.status, 403);
  assert.match(r.json.erro, /fora dos seus setores/);
  // marcação dada pela administração (tickets de todos os setores)
  await admin('PATCH', `/api/admin/usuarios/${soCredito}`, { supervisor_tickets: true });
  r = await coord('POST', `/api/admin/usuarios/${soCredito}/senha`, {});
  assert.equal(r.status, 403);
  assert.match(r.json.erro, /tickets de todos os setores/);
  // a administração redefine normalmente
  assert.equal((await admin('POST', `/api/admin/usuarios/${soCredito}/senha`, {})).status, 200);
});

test('tudo o que uma pessoa acessa, num lugar só', async () => {
  const ivo = ids['ivo@teste.com'];
  let r = await admin('GET', `/api/admin/usuarios/${ivo}/acessos`);
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.usuario.papel, 'usuario');
  assert.deepEqual(r.json.setores.map((x) => x.nome), ['Crédito']);
  const slugs = r.json.ferramentas.map((f) => f.slug).sort();
  const liberadas = (await ctx.db.q('SELECT modulo_slug FROM permissoes WHERE usuario_id = $1', [ivo])).rows.map((x) => x.modulo_slug).sort();
  assert.deepEqual(slugs, liberadas, 'as ferramentas liberadas para ele');
  assert.ok(r.json.ferramentas.every((f) => f.motivo === 'liberada'));
  assert.ok(r.json.carteira.length >= 5);
  assert.equal(r.json.tickets.todos_setores, false);
  // coordenação: abre as do setor dela por ser coordenação
  r = await admin('GET', `/api/admin/usuarios/${coordId}/acessos`);
  assert.ok(r.json.ferramentas.some((f) => f.slug === 'credito' && f.motivo === 'coordenação do setor'));
  assert.deepEqual(r.json.gerencia, ['Crédito']);
  // a coordenação vê o resumo de quem ela gerencia, não o dos outros
  assert.equal((await coord('GET', `/api/admin/usuarios/${ivo}/acessos`)).status, 200);
  assert.equal((await coord('GET', `/api/admin/usuarios/${ids['olga@teste.com']}/acessos`)).status, 404);
});

test('Supervisão da Central de Tickets vem com o perfil Coordenador e Supervisor e sai junto com ele', async () => {
  const id = await criar('Teo Temporário', 'teo@teste.com', { papel: 'coordenador', setores: [S('Crédito')], supervisor_tickets: true });
  // no perfil, a marcação não é gravada: ela vem do perfil
  assert.equal((await ctx.db.um('SELECT supervisor_tickets FROM usuarios WHERE id = $1', [id])).supervisor_tickets, false);
  const teo = await entrar('teo@teste.com', 'Senha1234');
  assert.equal((await teo('GET', '/api/tickets?vis=todos')).status, 200);
  const r = (await admin('GET', `/api/admin/usuarios/${id}/acessos`)).json;
  assert.equal(r.marcacoes.supervisor_tickets, true);
  assert.equal(r.marcacoes.supervisor_tickets_pelo_perfil, true);
  // voltou a usuário comum: deixa de ver todos os setores
  assert.equal((await admin('PATCH', `/api/admin/usuarios/${id}`, { papel: 'usuario' })).status, 200);
  assert.equal((await teo('GET', '/api/tickets?vis=todos')).status, 403);
  // usuário comum só vê todos com a marcação
  assert.equal((await admin('PATCH', `/api/admin/usuarios/${id}`, { supervisor_tickets: true })).status, 200);
  assert.equal((await teo('GET', '/api/tickets?vis=todos')).status, 200);
});

'use strict';
/* Acessos centralizados: ferramenta nova da coordenação, outros setores, só consulta e papéis (node --test). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx, admin, coord, S;
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
  const r = await admin('POST', '/api/admin/usuarios', { nome, email, senha: 'Senha1234', ...extra });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return r.json.id;
}
const html = (t, extra = '') => `<!doctype html><html><head><title>${t}</title></head><body>ok<script>${extra}</script></body></html>`;
// o que o portal injeta na ferramenta
const conf = (texto) => JSON.parse(/window\.__MYBLUE__=(\{.*?\});\n/s.exec(texto)[1]);

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
  await criar('Cora Coordenadora', 'cora@teste.com', { papel: 'coordenador', setores: [S('Crédito')] });
  await criar('Ivo da Equipe', 'ivo@teste.com', { setores: [S('Crédito')] });
  await criar('Olga de Fora', 'olga@teste.com', { setores: [S('Cobrança')] });
  coord = await entrar('cora@teste.com', 'Senha1234');
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('coordenação cadastra ferramenta nova no setor dela, que aguarda a aprovação da administração', async () => {
  assert.equal((await coord('POST', '/api/admin/modulos', { nome: 'De Fora', slug: 'de-fora', setor_id: S('Cobrança') })).status, 403);
  const r = await coord('POST', '/api/admin/modulos', { nome: 'Agenda do Crédito', slug: 'agenda-credito', setor_id: S('Crédito') });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.pendente, true);
  // a administração recebe o aviso
  const aviso = await ctx.db.um("SELECT titulo FROM notificacoes WHERE tipo = 'ferramenta_nova' ORDER BY id DESC LIMIT 1");
  assert.ok(aviso);
  assert.equal((await coord('PUT', '/api/admin/modulos/agenda-credito/arquivo', html('Agenda'))).status, 200);
  // a coordenação libera gente de outro setor antes mesmo da aprovação
  const olga = await entrar('olga@teste.com', 'Senha1234');
  assert.equal((await coord('PUT', '/api/admin/modulos/agenda-credito/acesso', { acessos: [{ usuario_id: ids['olga@teste.com'] }] })).status, 200);
  // aguardando aprovação: só administração e coordenação do setor abrem
  assert.equal((await coord('GET', '/m/agenda-credito/')).status, 200);
  assert.equal((await olga('GET', '/m/agenda-credito/')).status, 403);
  assert.ok(!(await olga('GET', '/api/modulos')).json.modulos.some((m) => m.slug === 'agenda-credito'));
  assert.equal((await coord('POST', '/api/admin/modulos/agenda-credito/aprovar')).status, 403, 'só a administração aprova');
  assert.equal((await admin('POST', '/api/admin/modulos/agenda-credito/aprovar')).status, 200);
  assert.equal((await olga('GET', '/m/agenda-credito/')).status, 200);
  assert.ok((await olga('GET', '/api/modulos')).json.modulos.some((m) => m.slug === 'agenda-credito'));
});

test('só consulta: abre, mas o servidor não grava', async () => {
  const ivo = await entrar('ivo@teste.com', 'Senha1234');
  const olga = await entrar('olga@teste.com', 'Senha1234');
  assert.equal((await admin('PATCH', '/api/admin/modulos/agenda-credito', { armazenamento: 'compartilhado' })).status, 200);
  assert.equal((await coord('PUT', '/api/admin/modulos/agenda-credito/acesso', { acessos: [
    { usuario_id: ids['ivo@teste.com'] }, { usuario_id: ids['olga@teste.com'], somente_leitura: true }] })).status, 200);
  assert.equal(conf((await olga('GET', '/m/agenda-credito/')).texto).usuario.somente_leitura, true);
  assert.equal(conf((await ivo('GET', '/m/agenda-credito/')).texto).usuario.somente_leitura, false);
  assert.equal((await olga('POST', '/api/armazenamento/agenda-credito', { set: { a: '1' } })).status, 403);
  assert.equal((await ivo('POST', '/api/armazenamento/agenda-credito', { set: { a: '1' } })).status, 200);
  assert.equal((await olga('GET', '/api/armazenamento/agenda-credito')).json.dados.a, '1');
  // a coordenação do setor nunca fica só consultando a ferramenta do próprio setor
  assert.equal((await coord('POST', '/api/armazenamento/agenda-credito', { set: { b: '2' } })).status, 200);
  // mexer nas ferramentas pela tela do usuário não apaga o "só consulta" de quem continua liberado
  assert.equal((await admin('PATCH', `/api/admin/usuarios/${ids['olga@teste.com']}`, { modulos: ['agenda-credito', 'cobranca'] })).status, 200);
  assert.equal((await ctx.db.um("SELECT somente_leitura FROM permissoes WHERE modulo_slug = 'agenda-credito' AND usuario_id = $1", [ids['olga@teste.com']])).somente_leitura, true);
});

test('papéis definidos no portal chegam ao HTML', async () => {
  assert.equal((await coord('PUT', '/api/admin/modulos/agenda-credito/papeis', { papeis: [{ id: 'gestao', nome: 'Gestão' }] })).status, 403, 'a lista de papéis é da administração');
  const r = await admin('PUT', '/api/admin/modulos/agenda-credito/papeis', { papeis: [{ id: 'gestao', nome: 'Gestão' }, { id: 'equipe', nome: 'Equipe' }] });
  assert.equal(r.status, 200, r.texto);
  assert.equal((await admin('PUT', '/api/admin/modulos/agenda-credito/papeis', { papeis: [{ id: 'Gestão!', nome: 'x' }] })).status, 400);
  assert.equal((await coord('PUT', '/api/admin/modulos/agenda-credito/acesso', { acessos: [
    { usuario_id: ids['ivo@teste.com'], papeis: ['gestao', 'inexistente'] }, { usuario_id: ids['olga@teste.com'], somente_leitura: true, papeis: ['equipe'] }] })).status, 200);
  const ivo = await entrar('ivo@teste.com', 'Senha1234');
  const c = conf((await ivo('GET', '/m/agenda-credito/')).texto);
  assert.deepEqual(c.usuario.papeis, ['gestao']);
  assert.deepEqual(c.papeis.map((p) => p.id), ['gestao', 'equipe']);
  assert.deepEqual(conf((await admin('GET', '/m/agenda-credito/')).texto).usuario.papeis, ['gestao', 'equipe'], 'administração: todos os papéis');
  const q = (await coord('GET', '/api/admin/modulos/agenda-credito/acesso')).json;
  assert.deepEqual(q.pessoas.find((p) => p.id === ids['olga@teste.com']).papeis, ['equipe']);
  // papel que deixa de existir sai de quem o tinha
  assert.equal((await admin('PUT', '/api/admin/modulos/agenda-credito/papeis', { papeis: [{ id: 'gestao', nome: 'Gestão' }] })).status, 200);
  assert.deepEqual((await coord('GET', '/api/admin/modulos/agenda-credito/acesso')).json.pessoas.find((p) => p.id === ids['olga@teste.com']).papeis, []);
});

test('Comissões de Novos Condomínios: o portal lê e grava os papéis no formato da ferramenta', async () => {
  const cnp = html('Comissões', "const PFX = 'cnp:';\nconst K_PERFIL = PFX + 'p:';");
  assert.equal((await admin('POST', '/api/admin/modulos', { nome: 'Comissões', slug: 'comissoes-teste', setor_id: S('Comercial'), armazenamento: 'compartilhado' })).status, 201);
  assert.equal((await admin('PUT', '/api/admin/modulos/comissoes-teste/arquivo', cnp)).status, 200);
  const ivo = ids['ivo@teste.com'];
  const olga = ids['olga@teste.com'];
  // papéis que já estavam na aba "Acessos" da ferramenta
  await ctx.db.q("INSERT INTO armazenamento (modulo_slug, escopo, chave, valor) VALUES ('comissoes-teste', '*', $1, $2)",
    [`cnp:p:${ivo}`, JSON.stringify({ id: String(ivo), papeis: ['executivo'], executivo: 'IVO DA CARTEIRA', nome: 'Ivo da Equipe' })]);
  assert.equal((await admin('PUT', '/api/admin/modulos/comissoes-teste/acesso', { usuarios: [ivo] })).status, 200);
  let q = (await admin('GET', '/api/admin/modulos/comissoes-teste/acesso')).json;
  assert.equal(q.modelo, 'Comissões de Novos Condomínios');
  assert.deepEqual(q.papeis.map((p) => p.id), ['executivo', 'gestor', 'financeiro']);
  assert.deepEqual(q.pessoas.find((p) => p.id === ivo).papeis, ['executivo']);
  assert.equal((await admin('PUT', '/api/admin/modulos/comissoes-teste/papeis', { papeis: [] })).status, 400, 'papéis vêm do HTML');
  // pelo portal: Ivo vira gestor e Olga (outro setor) entra como financeiro
  assert.equal((await admin('PUT', '/api/admin/modulos/comissoes-teste/acesso', { acessos: [
    { usuario_id: ivo, papeis: ['executivo', 'gestor'] }, { usuario_id: olga, papeis: ['financeiro'] }] })).status, 200);
  const ler = async (uid) => JSON.parse((await ctx.db.um("SELECT valor FROM armazenamento WHERE modulo_slug = 'comissoes-teste' AND escopo = '*' AND chave = $1", [`cnp:p:${uid}`])).valor);
  const pIvo = await ler(ivo);
  assert.deepEqual(pIvo.papeis, ['executivo', 'gestor']);
  assert.equal(pIvo.executivo, 'IVO DA CARTEIRA', 'o vínculo com a carteira continua');
  assert.equal(pIvo.id, String(ivo));
  assert.deepEqual((await ler(olga)).papeis, ['financeiro']);
  // quem perde o acesso perde os papéis na ferramenta
  assert.equal((await admin('PUT', '/api/admin/modulos/comissoes-teste/acesso', { acessos: [{ usuario_id: ivo, papeis: ['executivo', 'gestor'] }] })).status, 200);
  assert.deepEqual((await ler(olga)).papeis, []);
  // a administração tem todos os papéis, só na sessão dela (o que está gravado não muda)
  const admId = q.pessoas.find((p) => p.papel === 'admin').id;
  const naFerramenta = JSON.parse((await admin('GET', '/api/armazenamento/comissoes-teste')).json.dados[`cnp:p:${admId}`]);
  assert.deepEqual(naFerramenta.papeis, ['executivo', 'gestor', 'financeiro']);
  assert.deepEqual(JSON.parse(conf((await admin('GET', '/m/comissoes-teste/')).texto).dados[`cnp:p:${admId}`]).papeis, ['executivo', 'gestor', 'financeiro']);
  assert.equal(await ctx.db.um("SELECT 1 FROM armazenamento WHERE modulo_slug = 'comissoes-teste' AND chave = $1", [`cnp:p:${admId}`]), null);
  // mudança feita na aba da própria ferramenta aparece no portal
  await ctx.db.q("UPDATE armazenamento SET valor = $1 WHERE modulo_slug = 'comissoes-teste' AND chave = $2", [JSON.stringify({ ...pIvo, papeis: ['financeiro'] }), `cnp:p:${ivo}`]);
  q = (await admin('GET', '/api/admin/modulos/comissoes-teste/acesso')).json;
  assert.deepEqual(q.pessoas.find((p) => p.id === ivo).papeis, ['financeiro']);
});

test('Análise de Espólio: papéis no banco de documentos da ferramenta', async () => {
  const esp = html('Espólio', "window.claude.use('db');\nconst COLECOES = { perfis:'perfis' };\nconst PAPEIS = { gestao: 'Gestão', solicitante: 'Solicitante' };");
  assert.equal((await admin('POST', '/api/admin/modulos', { nome: 'Espólio', slug: 'espolio-teste', setor_id: S('Cobrança') })).status, 201);
  assert.equal((await admin('PUT', '/api/admin/modulos/espolio-teste/arquivo', esp)).status, 200);
  const olga = ids['olga@teste.com'];
  await ctx.documentos.gravar('espolio-teste', [{ op: 'set', path: `perfis/mb-${olga}`, data: { id: `mb-${olga}`, nome: 'Olga de Fora', papeis: ['solicitante'], nomeCarteira: 'OLGA' } }], 'mb-1', 1);
  assert.equal((await admin('PUT', '/api/admin/modulos/espolio-teste/acesso', { acessos: [{ usuario_id: olga, papeis: ['gestao'] }] })).status, 200);
  const doc = await ctx.documentos.ler('espolio-teste', `perfis/mb-${olga}`);
  assert.deepEqual(doc.papeis, ['gestao']);
  assert.equal(doc.nomeCarteira, 'OLGA');
  const o = await entrar('olga@teste.com', 'Senha1234');
  assert.deepEqual(conf((await o('GET', '/m/espolio-teste/')).texto).usuario.papeis, ['gestao']);
});

test('Análise de Espólio: os papéis acompanham a versão do HTML', async () => {
  const v2 = html('Espólio v2', "window.claude.use('db');\nconst COLECOES = { perfis:'perfis' };\nconst PAPEIS = { gestao: 'Gestão', implantacao: 'Implantação', avulso: 'Solicitante avulso' };");
  assert.equal((await admin('PUT', '/api/admin/modulos/espolio-teste/arquivo', v2)).status, 200);
  const q = (await admin('GET', '/api/admin/modulos/espolio-teste/acesso')).json;
  assert.equal(q.modelo, 'Análise de Espólio');
  assert.deepEqual(q.papeis.map((p) => p.id), ['gestao', 'implantacao', 'avulso']);
  // a administração abre sempre e tem todos os papéis, sem marcar nada
  const adm = q.pessoas.find((p) => p.papel === 'admin');
  assert.equal(adm.automatico, 'administração');
  assert.deepEqual(adm.papeis, ['gestao', 'implantacao', 'avulso']);
  assert.equal((await admin('PUT', '/api/admin/modulos/espolio-teste/acesso', { acessos: [{ usuario_id: adm.id, papeis: [] }, { usuario_id: ids['olga@teste.com'], papeis: ['implantacao'] }] })).status, 200);
  assert.equal(await ctx.documentos.ler('espolio-teste', `perfis/mb-${adm.id}`), null, 'nada é gravado para a administração');
  assert.deepEqual((await ctx.documentos.ler('espolio-teste', `perfis/mb-${ids['olga@teste.com']}`)).papeis, ['implantacao']);
  // na ferramenta: a administração recebe o próprio registro com todos os papéis; as outras pessoas não o veem
  const doAdmin = (await admin('GET', '/api/db/espolio-teste')).json.docs.find((d) => d.c === 'perfis' && d.id === `mb-${adm.id}`);
  assert.deepEqual(doAdmin.d.papeis, ['gestao', 'implantacao', 'avulso']);
  assert.deepEqual(conf((await admin('GET', '/m/espolio-teste/')).texto).usuario.papeis, ['gestao', 'implantacao', 'avulso']);
  const o = await entrar('olga@teste.com', 'Senha1234');
  assert.ok(!(await o('GET', '/api/db/espolio-teste')).json.docs.some((d) => d.id === `mb-${adm.id}`));
});

test('papéis conferidos no servidor: quem edita a ferramenta não se dá o papel Gestão', async () => {
  const ivo = ids['ivo@teste.com'];
  const olga = ids['olga@teste.com'];
  assert.equal((await admin('PUT', '/api/admin/modulos/comissoes-teste/acesso', { acessos: [
    { usuario_id: ivo, papeis: ['executivo'] }, { usuario_id: olga, papeis: ['financeiro'] }] })).status, 200);
  const i = await entrar('ivo@teste.com', 'Senha1234');
  const valor = async (uid) => JSON.parse((await i('GET', '/api/armazenamento/comissoes-teste')).json.dados[`cnp:p:${uid}`]);
  const meu = await valor(ivo);
  // pela aba Acessos da ferramenta (gravação direta nos dados): recusado
  let r = await i('POST', '/api/armazenamento/comissoes-teste', { set: { [`cnp:p:${ivo}`]: JSON.stringify({ ...meu, papeis: ['executivo', 'gestor'] }) } });
  assert.equal(r.status, 403);
  assert.equal(r.json.recusado, true);
  assert.match(r.json.erro, /Gestão/);
  assert.deepEqual((await valor(ivo)).papeis, ['executivo']);
  // apagar o registro de outra pessoa ou limpar tudo também mexe nos papéis
  assert.equal((await i('POST', '/api/armazenamento/comissoes-teste', { del: [`cnp:p:${olga}`] })).status, 403);
  assert.equal((await i('POST', '/api/armazenamento/comissoes-teste', { limpar: true })).status, 403);
  // o resto do registro (e os outros dados da ferramenta) grava normalmente
  assert.equal((await i('POST', '/api/armazenamento/comissoes-teste', { set: { [`cnp:p:${ivo}`]: JSON.stringify({ ...meu, executivo: 'IVO NOVO' }), 'cnp:respostas': '[]' } })).status, 200);
  assert.equal((await valor(ivo)).executivo, 'IVO NOVO');
  // com o papel Gestão dado pelo portal, distribui os papéis pela própria ferramenta
  assert.equal((await admin('PUT', '/api/admin/modulos/comissoes-teste/acesso', { acessos: [
    { usuario_id: ivo, papeis: ['executivo', 'gestor'] }, { usuario_id: olga, papeis: ['financeiro'] }] })).status, 200);
  const deOlga = await valor(olga);
  r = await i('POST', '/api/armazenamento/comissoes-teste', { set: { [`cnp:p:${olga}`]: JSON.stringify({ ...deOlga, papeis: ['financeiro', 'executivo'] }) } });
  assert.equal(r.status, 200, r.texto);
  assert.ok((await ctx.db.um("SELECT 1 FROM auditoria WHERE acao = 'papeis_recusados' AND modulo_slug = 'comissoes-teste'")));
});

test('papéis conferidos no servidor: Análise de Espólio (banco de documentos)', async () => {
  const olga = ids['olga@teste.com'];
  const o = await entrar('olga@teste.com', 'Senha1234');
  const caminho = `perfis/mb-${olga}`;
  let r = await o('POST', '/api/db/espolio-teste', { ops: [{ op: 'update', path: caminho, data: { papeis: ['gestao'] } }] });
  assert.equal(r.status, 403);
  assert.equal(r.json.code, 'permission_denied');
  r = await o('POST', '/api/db/espolio-teste', { ops: [{ op: 'set', path: `perfis/mb-${olga + 1000}`, data: { papeis: ['gestao'] } }] });
  assert.equal(r.status, 403, 'nem criando um perfil novo');
  r = await o('POST', '/api/db/espolio-teste/trava', { path: caminho, holder: 'x', data: { papeis: ['gestao'] } });
  assert.equal(r.status, 403, 'nem pela trava');
  // o resto do perfil grava
  r = await o('POST', '/api/db/espolio-teste', { ops: [{ op: 'update', path: caminho, data: { nomeCarteira: 'OLGA NOVA' } }] });
  assert.equal(r.status, 200, r.texto);
  const doc = await ctx.documentos.ler('espolio-teste', caminho);
  assert.deepEqual(doc.papeis, ['implantacao']);
  assert.equal(doc.nomeCarteira, 'OLGA NOVA');
});

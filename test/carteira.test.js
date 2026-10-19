'use strict';
/* Testes da aba Carteira de condomínios (node --test). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx, admin, pessoa;

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (cookie) headers.cookie = cookie;
    let body;
    if (corpo !== undefined) {
      if (typeof corpo === 'string' || Buffer.isBuffer(corpo)) { body = corpo; headers['content-type'] ||= 'text/csv'; }
      else { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
    }
    const r = await fetch(base + url, { method: metodo, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
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

// como o Excel salva: ponto e vírgula, Windows-1252, CRLF
const CSV = Buffer.from([
  'ID;SITUAÇÃO;COMARCA;CONDOMÍNIO;VENCIMENTO;ANALISTA ADMINISTRATIVA;ANALISTA EXTRAJUDICIAL;ASSISTENTE CRÉDITO;ADMINISTRADORA;FORMA DE ENVIO;INÍCIO DO CONTRATO;RAZÃO SOCIAL;CNPJ;__PowerAppsId__;',
  '122;ATIVO;CE;Jardim Azul ;5º DIA ÚTIL;ANA LIMA - 4001;BRUNO COSTA - 4002;CARLA DIAS - 4003;ADM ALFA;IMPRESSO/E-MAIL;;CONDOMINIO RESIDENCIAL JARDIM AZUL;00.000.000/0001-91;a1;',
  '310;ATIVO;RN;Solar das Palmeiras ;6º DIA ÚTIL;DANIEL ROCHA - 4004;ELISA MOTA - 4005;FABIO NUNES - 4006;ADM BETA;E-MAIL;01/02/2023;RESIDENCIAL SOLAR DAS PALMEIRAS;11222333000181;b2;',
  '20;DISTRATADO;CE;Vila Verde;10;ana lima - 4001;;;;;;"COND; VILA VERDE";;x;',
  '20;ATIVO;CE;Repetido;10;;;;;;;;;x;',
].join('\r\n'), 'latin1');

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0, enviarEmail: async () => {} });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');
  const u = await admin('POST', '/api/admin/usuarios', { nome: 'Paula Pessoa', email: 'paula@teste.com', papel: 'usuario', senha: 'Senha1234' });
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [u.json.id]);
  pessoa = await entrar('paula@teste.com', 'Senha1234');
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

const lista = async (c = admin) => (await c('GET', '/api/carteira')).json.condominios;
const porCodigo = async (cod) => (await lista()).find((c) => c.codigo === cod);

test('carteira vazia; quem não é da administração consulta mas não importa', async () => {
  assert.equal((await cliente()('GET', '/api/carteira')).status, 401);
  const r = await pessoa('GET', '/api/carteira');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.condominios, []);
  assert.equal(r.json.pode_editar, false);
  assert.deepEqual(r.json.funcoes.map((f) => f.rotulo), ['Analista de cobrança', 'Analista extrajudicial (ApoioCob)', 'Assistente de crédito']);
  assert.equal((await pessoa('POST', '/api/carteira/importar', CSV)).status, 403);
});

test('importa o CSV do Excel (Windows-1252, ; e aspas)', async () => {
  assert.equal((await admin('POST', '/api/carteira/importar', Buffer.from('a;b\r\n1;2'))).status, 400);
  const r = await admin('POST', '/api/carteira/importar', CSV);
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.novos, 3);
  assert.equal(r.json.avisos.length, 1, 'ID repetido é avisado');
  const c = await porCodigo('122');
  assert.equal(c.nome, 'Jardim Azul');
  assert.equal(c.vencimento, '5º DIA ÚTIL');
  assert.equal(c.analista_cobranca, 'ANA LIMA - 4001', 'ANALISTA ADMINISTRATIVA é a analista de cobrança');
  assert.equal(c.analista_extrajudicial, 'BRUNO COSTA - 4002');
  assert.equal(c.assistente_credito, 'CARLA DIAS - 4003');
  const o = await porCodigo('310');
  assert.equal(o.cnpj, '11.222.333/0001-81', 'CNPJ formatado');
  assert.equal(o.inicio_contrato, '2023-02-01');
  const b = await porCodigo('20');
  assert.equal(b.situacao, 'DISTRATADO');
  assert.equal(b.razao_social, 'COND; VILA VERDE');
  assert.equal(b.analista_cobranca, 'ANA LIMA - 4001', 'nome em maiúsculas como na planilha');
});

test('importar de novo atualiza pelo ID e registra no histórico', async () => {
  const novo = Buffer.from(CSV.toString('latin1').replace('ANA LIMA - 4001;BRUNO', 'GABRIELA PINTO - 4007;BRUNO'), 'latin1');
  const r = await admin('POST', '/api/carteira/importar', novo);
  assert.deepEqual([r.json.novos, r.json.atualizados, r.json.iguais], [0, 1, 2]);
  const c = await porCodigo('122');
  assert.equal(c.analista_cobranca, 'GABRIELA PINTO - 4007');
  const h = (await pessoa('GET', `/api/carteira/${c.id}`)).json.historico;
  assert.deepEqual(h[0].detalhe.mudancas.analista_cobranca, ['ANA LIMA - 4001', 'GABRIELA PINTO - 4007']);
});

test('administração cadastra, edita e remove; ID é único', async () => {
  assert.equal((await pessoa('POST', '/api/carteira', { nome: 'X' })).status, 403);
  assert.equal((await admin('POST', '/api/carteira', { nome: '' })).status, 400);
  const semVig = await admin('POST', '/api/carteira', { codigo: '900', nome: 'Sem Vigência' });
  assert.equal(semVig.status, 400, 'condomínio novo exige a vigência');
  assert.match(semVig.json.erro, /vigência/);
  assert.equal((await admin('POST', '/api/carteira', { nome: 'Sem ID', inicio_contrato: '03/2025' })).status, 400, 'ID Vouch é informado, não gerado');
  let r = await admin('POST', '/api/carteira', { codigo: '311', nome: 'Novo Horizonte', comarca: 'pb', inicio_contrato: '03/2025', assistente_credito: ' iris  melo - 4009 ' });
  assert.equal(r.status, 201, r.texto);
  const id = r.json.id;
  let c = (await admin('GET', `/api/carteira/${id}`)).json.condominio;
  assert.equal(c.codigo, '311');
  assert.equal(c.comarca, 'PB');
  assert.equal(c.situacao, 'ATIVO');
  assert.equal(c.inicio_contrato, '2025-03-01', 'vigência é mês/ano');
  assert.equal(c.assistente_credito, 'IRIS MELO - 4009');
  assert.equal((await admin('POST', '/api/carteira', { nome: 'Outro', codigo: '311', inicio_contrato: '2025-04' })).status, 409);
  assert.equal((await admin('PATCH', `/api/carteira/${id}`, { inicio_contrato: '13/2025' })).status, 400);
  assert.equal((await pessoa('PATCH', `/api/carteira/${id}`, { situacao: 'DISTRATADO' })).status, 403);
  r = await admin('PATCH', `/api/carteira/${id}`, { situacao: 'DISTRATADO', observacoes: 'Encerrou em set/2026' });
  assert.equal(r.status, 200);
  c = (await admin('GET', `/api/carteira/${id}`)).json;
  assert.equal(c.condominio.situacao, 'DISTRATADO');
  assert.deepEqual(c.historico[0].detalhe.mudancas.situacao, ['ATIVO', 'DISTRATADO']);
  assert.equal(c.historico.at(-1).acao, 'condominio_criado');
  assert.equal((await admin('PATCH', `/api/carteira/${id}`, { situacao: 'DISTRATADO' })).json.sem_mudanca, true);
  assert.equal((await admin('DELETE', `/api/carteira/${id}`)).status, 200);
  assert.equal((await admin('GET', `/api/carteira/${id}`)).status, 404);
});

test('transferir a carteira de uma pessoa (toda ou parte)', async () => {
  const b = await porCodigo('20');
  assert.equal((await pessoa('POST', '/api/carteira/transferir', { funcao: 'analista_cobranca', de: 'ANA LIMA - 4001', para: 'X' })).status, 403);
  assert.equal((await admin('POST', '/api/carteira/transferir', { funcao: 'analista_cobranca', de: 'NINGUEM', para: 'X' })).status, 400);
  const r = await admin('POST', '/api/carteira/transferir', { funcao: 'analista_cobranca', de: 'ANA LIMA - 4001', para: 'heitor alves - 4008', ids: [b.id] });
  assert.equal(r.json.condominios, 1);
  assert.equal((await porCodigo('20')).analista_cobranca, 'HEITOR ALVES - 4008');
  const h = (await admin('GET', `/api/carteira/${b.id}`)).json.historico;
  assert.equal(h[0].acao, 'carteira_transferida');
});

test('a carteira não é exportada: nem a administração tem o endereço', async () => {
  assert.equal((await admin('GET', '/api/carteira/exportar')).status, 404);
  assert.equal((await pessoa('GET', '/api/carteira/exportar')).status, 404);
  assert.equal((await admin('GET', '/api/carteira')).json.pode_exportar, undefined);
});

test('quem edita o quê na carteira: o portal diz o que identificou e a configuração muda na hora', async () => {
  const setores = (await admin('GET', '/api/admin/setores')).json.setores;
  const S = (n) => setores.find((x) => x.nome === n).id;
  const nova = async (nome, email, extra) => {
    const u = await admin('POST', '/api/admin/usuarios', { nome, email, senha: 'Senha1234', ...extra });
    await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [u.json.id]);
    return { id: u.json.id, c: await entrar(email, 'Senha1234') };
  };
  const cida = await nova('Cida Coordenadora', 'cida@teste.com', { papel: 'coordenador', setores: [S('Crédito')] });
  const ivo = await nova('Ivo Usuário', 'ivo@teste.com', { setores: [S('Crédito')] });
  const cond = (await admin('POST', '/api/carteira', { codigo: '901', nome: 'Teste Acesso', comarca: 'CE', inicio_contrato: '01/2026' })).json.id;

  // regra de hoje: coordenação do Crédito edita o Assistente de crédito; vigência e extrajudicial só a administração
  let a = (await cida.c('GET', '/api/carteira')).json.acesso;
  assert.equal(a.voce.nivel, 'Coordenação');
  assert.deepEqual(a.voce.pode.map((x) => x.rotulo), ['Editar e transferir o Assistente de crédito', 'Adicionar condomínios novos pela planilha de implantação']);
  assert.equal(a.voce.pode[0].motivo, 'Coordenação · Crédito');
  assert.deepEqual(a.permissoes.find((x) => x.chave === 'carteira.assistente_credito').quem, [{ nome: 'Cida Coordenadora', motivo: 'Coordenação · Crédito' }]);
  assert.equal((await cida.c('PATCH', `/api/carteira/${cond}`, { assistente_credito: 'cida - 1' })).status, 200);
  assert.equal((await cida.c('PATCH', `/api/carteira/${cond}`, { inicio_contrato: '02/2026' })).status, 403);
  assert.equal((await pessoa('GET', '/api/carteira')).json.acesso.voce.pode.length, 0, 'usuário só consulta');
  assert.equal((await pessoa('GET', '/api/carteira')).status, 200, 'todos veem');

  // a coordenação do Crédito vê as regras e libera uma pessoa na coluna do setor dela, e só nela
  const cfg = (await cida.c('GET', '/api/admin/carteira/acessos')).json;
  assert.ok(cfg.permissoes.find((x) => x.chave === 'carteira.assistente_credito').pode_configurar);
  assert.ok(!cfg.permissoes.find((x) => x.chave === 'carteira.dados').pode_configurar);
  assert.equal((await cida.c('PUT', '/api/admin/carteira/acessos/carteira.assistente_credito', { pessoas: [ivo.id], niveis: ['usuario'] })).status, 200);
  const regra = (await admin('GET', '/api/admin/carteira/acessos')).json.permissoes.find((x) => x.chave === 'carteira.assistente_credito').regra;
  assert.deepEqual(regra.niveis, ['coordenador', 'supervisor'], 'níveis ficam com a administração');
  assert.deepEqual(regra.pessoas, [ivo.id]);
  assert.equal((await ivo.c('PATCH', `/api/carteira/${cond}`, { assistente_credito: 'ivo - 2' })).status, 200);
  assert.equal((await cida.c('PUT', '/api/admin/carteira/acessos/carteira.dados', { pessoas: [cida.id] })).status, 403);
  assert.equal((await pessoa('GET', '/api/admin/carteira/acessos')).status, 403);

  // a administração libera os dados do condomínio (vigência) para toda coordenação
  assert.equal((await admin('PUT', '/api/admin/carteira/acessos/carteira.dados', { niveis: ['coordenador'], setores: [], pessoas: [] })).status, 200);
  assert.equal((await cida.c('PATCH', `/api/carteira/${cond}`, { inicio_contrato: '02/2026' })).status, 200);
  assert.equal((await cida.c('PATCH', `/api/carteira/${cond}`, { codigo: '902' })).status, 403, 'ID é do cadastro');
  a = (await cida.c('GET', '/api/carteira')).json;
  assert.ok(a.campos_editaveis.includes('inicio_contrato'));
  // volta ao padrão
  assert.equal((await admin('DELETE', '/api/admin/carteira/acessos/carteira.dados')).status, 200);
  assert.equal((await cida.c('PATCH', `/api/carteira/${cond}`, { inicio_contrato: '03/2026' })).status, 403);
});

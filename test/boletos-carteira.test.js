'use strict';
/* Controle de Emissão de Boletos ← Carteira de condomínios (node --test). Dados fictícios. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const B = require('../server/boletos-carteira');

/* ---------- regras ---------- */
const cart = (codigo, nome, extra = {}) => ({ codigo, nome, situacao: 'ATIVO', comarca: 'CE', vencimento: '10', assistente_credito: 'BRUNA REIS - 1001', inicio_contrato: '2024-01-01', ...extra });
const cond = (nome, extra = {}) => ({ nome, uf: 'CE', regra: 'Dia fixo', dia: 10, sit: 'Ativo', resp: 'BRUNA', ...extra });

test('vencimento, responsável e competência inicial', () => {
  assert.deepEqual(B.vencimento('5º DIA ÚTIL'), { regra: 'Dia útil', dia: 5 });
  assert.deepEqual(B.vencimento('15'), { regra: 'Dia fixo', dia: 15 });
  assert.equal(B.vencimento('a combinar'), null);
  assert.equal(B.responsavel('DAVI ROCHA - 2002'), 'DAVI');
  assert.equal(B.responsavel(''), '');
  // 12/10 é feriado: o 5º dia útil de outubro/2026 é 07/10; dia 15/11 (domingo, feriado) vai para 16/11
  assert.equal(B.vencimentoNoMes('2026-10', { regra: 'Dia útil', dia: 5 }, { '2026-10-12': {} }), '2026-10-07');
  assert.equal(B.vencimentoNoMes('2026-11', { regra: 'Dia fixo', dia: 15 }, { '2026-11-15': {} }), '2026-11-16');
  const emitido = { itens: { c1: { emi: '2026-09-28' } } };
  assert.equal(B.competenciaInicial({ '2026-10': emitido }, '2026-10-19'), '2026-11');
  assert.equal(B.competenciaInicial({ '2026-10': emitido, '2026-11': { itens: {} }, '2026-12': { itens: {} } }, '2026-10-19'), '2026-11');
  assert.equal(B.competenciaInicial({ '2026-10': emitido, '2026-11': { itens: { c1: { emi: '2026-10-30' } } }, '2026-12': { itens: {} } }, '2026-11-03'), '2026-12');
  assert.equal(B.competenciaInicial({}, '2026-10-19'), '2026-10');
});

test('plano: vínculo pelo nome, parecidos, novos, distrato e vencimento novo só daqui para frente', () => {
  const carteira = [
    cart('1', 'Jardim Azul'),
    cart('2', 'Solar das Palmeiras', { situacao: 'DISTRATADO' }),
    cart('3', 'Vila Rica', { vencimento: '15', assistente_credito: 'DAVI ROCHA - 2002' }),
    cart('4', 'Torres do Atlântico'), // no controle: "Torre do Atlantico"
    cart('5', 'Bosque Real - CE', { inicio_contrato: '2026-10-01' }), // novo, vigência outubro
    cart('6', 'Aurora', { situacao: 'DISTRATADO' }), // distratado que nunca esteve no controle
    cart('7', 'Itapoã 18'), // não pode casar com "Itapoã 15"
    cart('8', 'Primavera Residence'), // acento/grafia: "Primavéra" (sem troca de nome)
  ];
  const conds = {
    c1: cond('Jardim Azul'), c2: cond('Solar das Palmeiras'), c3: cond('Vila Rica'), c4: cond('Torre do Atlantico'),
    c5: cond('Itapoã 15'), c6: cond('Monte Verde'), c7: cond('Primavera Residençe', { cart: '8' }),
  };
  const meses = { '2026-10': { itens: { c1: { emi: '2026-09-28' }, c3: { emi: '2026-09-30' } } }, '2026-11': { itens: {} } };
  const p = B.planejar({ carteira, conds, meses, hoje: '2026-10-19', distratoEm: { 2: '2026-10-14' } });
  assert.equal(p.comp, '2026-11');
  assert.deepEqual(p.vinculos.map((v) => [v.id, v.codigo]).sort(), [['c1', '1'], ['c2', '2'], ['c3', '3']]);
  assert.equal(p.vinculados, 4); // + c7, que já tinha o ID Vouch
  assert.deepEqual(p.parecidos.map((x) => [x.id, x.codigo]), [['c4', '4']]);
  const alt = Object.fromEntries(p.alteracoes.map((a) => [a.id, a]));
  assert.deepEqual(alt.c2.patch, { sit: 'Distrato', distrato: '2026-10-14' });
  assert.deepEqual(alt.c3.patch, { resp: 'DAVI', dia: 15 });
  assert.deepEqual(alt.c3.congelar, { '2026-10': '2026-10-12' }, 'outubro guarda o vencimento antigo (10/10 é sábado → segunda 12)');
  assert.equal(alt.c7, undefined, 'mesmo nome com outra grafia não troca o nome');
  assert.deepEqual(alt.c4.patch, { nome: 'Torres do Atlântico' });
  const novos = Object.fromEntries(p.novos.map((n) => [n.codigo, n.dados]));
  assert.deepEqual(Object.keys(novos).sort(), ['5', '6', '7']);
  assert.equal(novos[5].nome, 'Bosque Real - CE');
  assert.equal(novos[5].desde, '2026-11');
  assert.equal(novos[5].resp, 'BRUNA');
  assert.equal(novos[6].sit, 'Distrato');
  assert.deepEqual(p.fora.map((f) => f.id).sort(), ['c5', 'c6']);
  assert.deepEqual(p.fora[0].patch, { sit: 'Distrato', distrato: '2026-10-31' });
  // automático: vínculos diretos, mudanças dos vinculados e novos; nunca parecidos nem "fora da carteira"
  const auto = B.automaticas(p);
  assert.ok(auto.has('a:c3') && auto.has('n:5') && auto.has('v:c1'));
  assert.ok(!auto.has('v:c4') && !auto.has('s:c5'));
  // novo com vigência futura entra no mês seguinte a ela
  const p2 = B.planejar({ carteira: [cart('9', 'Lago Sul', { inicio_contrato: '2026-12-01' })], conds: { c1: cond('Outro') }, meses, hoje: '2026-10-19' });
  assert.equal(p2.novos[0].dados.desde, '2027-01');
});

/* ---------- pelo servidor ---------- */
let servidor, base, ctx, admin;

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
const setor = async (nome) => (await ctx.db.um('SELECT id FROM setores WHERE nome = $1', [nome])).id;
async function pessoa(nome, email, papel, setores, modulos = []) {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel, senha: 'Senha1234', setores, modulos });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  return entrar(email, 'Senha1234');
}
const esperar = async () => { await new Promise((ok) => setTimeout(ok, 40)); await ctx.boletosCarteira.aguardar(); };
const cadastro = async () => (await ctx.documentos.ler('boletos', 'config/cadastro')).conds;

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0, esperaCarteiraMs: 5 });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

test('conferência na janela da ferramenta, depois a carteira e a competência nova puxam sozinhas', async () => {
  for (const c of [cart('101', 'Jardim Azul'), cart('102', 'Vila Rica', { vencimento: '5º DIA ÚTIL' }), cart('103', 'Torres do Atlântico'), cart('104', 'Bosque Real', { inicio_contrato: '2020-01-01' })]) {
    assert.equal((await admin('POST', '/api/carteira', c)).status, 201);
  }
  const hojeComp = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
  const ana = await pessoa('Ana Souza', 'ana@teste.com', 'usuario', [await setor('Crédito')], ['boletos']);
  const ops = [
    { op: 'set', path: 'config/cadastro', data: { conds: { c1: cond('Jardim Azul'), c2: cond('Vila Rica'), c3: cond('Torre do Atlantico'), c4: cond('Monte Verde') } } },
    { op: 'set', path: `meses/${hojeComp}`, data: { comp: hojeComp, antecedencia: 10, itens: { c1: { emi: `${hojeComp}-01` } } } },
  ];
  assert.equal((await ana('POST', '/api/db/boletos', { ops })).status, 200);
  await esperar();
  assert.equal((await cadastro()).c1.cart, undefined, 'antes da 1ª conferência nada muda sozinho');

  // quem confere: administração e coordenação do Crédito; não a de outro setor nem quem só usa
  const coordCredito = await pessoa('Caio Crédito', 'caio@teste.com', 'coordenador', [await setor('Crédito')]);
  const coordCs = await pessoa('Lia CS', 'lia@teste.com', 'coordenador', [await setor('CS')]);
  assert.equal((await coordCs('GET', '/api/admin/modulos/boletos/carteira')).status, 403);
  assert.equal((await ana('GET', '/api/admin/modulos/boletos/carteira')).status, 403);
  assert.equal((await admin('GET', '/api/admin/modulos/sindicos/carteira')).status, 404);
  const p = (await coordCredito('GET', '/api/admin/modulos/boletos/carteira')).json;
  assert.equal(p.ativa, false);
  assert.deepEqual(p.parecidos.map((x) => x.id), ['c3']);
  assert.deepEqual(p.fora.map((x) => x.id), ['c4']);
  assert.deepEqual(p.novos.map((x) => x.codigo), ['104']);

  // aplica tudo menos o "fora da carteira"
  const chaves = [...p.vinculos, ...p.parecidos, ...p.alteracoes, ...p.novos].map((x) => x.k);
  const r = await coordCredito('POST', '/api/admin/modulos/boletos/carteira', { chaves });
  assert.equal(r.status, 200, r.texto);
  let cad = await cadastro();
  assert.equal(cad.c1.cart, '101');
  assert.deepEqual([cad.c2.regra, cad.c2.dia], ['Dia útil', 5]);
  assert.equal(cad.c3.nome, 'Torres do Atlântico');
  assert.equal(cad.c4.sit, 'Ativo', 'fora da carteira só sai se for marcado');
  const novo = Object.values(cad).find((c) => c.cart === '104');
  assert.equal(novo.desde, p.comp);
  // o mês em andamento guarda o vencimento de antes da mudança; o Histórico registra
  const mes = await ctx.documentos.ler('boletos', `meses/${hojeComp}`);
  if (hojeComp < p.comp) assert.ok(mes.itens.c2.venc, 'vencimento antigo guardado no mês em andamento');
  const logs = await ctx.documentos.listar('boletos', 'log');
  const acoes = logs.flatMap((l) => Object.values(l.e).map((e) => e.a));
  assert.ok(acoes.some((a) => /^Carteira: condomínio novo/.test(a)) && acoes.includes('Carteira: dados atualizados'));
  assert.equal((await admin('GET', '/api/admin/modulos/boletos/carteira')).json.ativa, true);

  // a carteira muda → o controle recebe sozinho
  const id102 = (await ctx.db.um("SELECT id FROM condominios WHERE codigo = '102'")).id;
  assert.equal((await admin('PATCH', `/api/carteira/${id102}`, { situacao: 'DISTRATADO' })).status, 200);
  assert.equal((await admin('POST', '/api/carteira', cart('105', 'Lago Sul', { inicio_contrato: '2020-01-01' }))).status, 201);
  await esperar();
  cad = await cadastro();
  assert.equal(cad.c2.sit, 'Distrato');
  assert.ok(cad.c2.distrato < `${p.comp}-01`, 'sai a partir da competência inicial');
  assert.ok(Object.values(cad).some((c) => c.cart === '105'));

  // competência nova criada pela ferramenta → puxa da carteira (mudança feita direto no banco, sem passar pela tela)
  await ctx.db.q("UPDATE condominios SET assistente_credito = 'DAVI ROCHA - 2002' WHERE codigo = '101'");
  const prox = B.competenciaInicial({ [hojeComp]: { itens: { c1: { emi: 'x' } } } }, `${hojeComp}-15`);
  assert.equal((await ana('POST', '/api/db/boletos', { ops: [{ op: 'set', path: `meses/${prox}`, data: { comp: prox, antecedencia: 10, itens: {} } }] })).status, 200);
  await esperar();
  assert.equal((await cadastro()).c1.resp, 'DAVI');
});

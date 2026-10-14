'use strict';
/* Testes de "Minhas comissões": envio dos demonstrativos pela ferramenta de Comissionamento (node --test). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx;
const emails = [];

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
    const textoR = await r.text();
    let json = null;
    try { json = JSON.parse(textoR); } catch { /* não é JSON */ }
    return { status: r.status, json, texto: textoR, headers: r.headers };
  };
}
async function entrar(email, senha) {
  const c = cliente();
  assert.equal((await c('POST', '/api/auth/login', { email, senha })).status, 200);
  return c;
}

let admin, gestor, ana, lia, dora, caio;
const ids = {};
async function criarPessoa(nome, email, modulos = []) {
  const r = await admin('POST', '/api/admin/usuarios', { nome, email, papel: 'usuario', senha: 'Senha1234', modulos });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}
const doc = (corpo) => `<!doctype html><html><head><title>Demonstrativo</title></head><body>${corpo}</body></html>`;

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
  gestor = await criarPessoa('Gil Gestor', 'gil@teste.com', ['comissionamento']);
  ana = await criarPessoa('Ana Analista', 'ana@teste.com', ['credito']);
  lia = await criarPessoa('Lia Líder', 'lia@teste.com');
  dora = await criarPessoa('Dora Diretora', 'dora@teste.com');
  caio = await criarPessoa('Caio Colega', 'caio@teste.com');
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('o módulo Comissionamento vem no catálogo, compartilhado e marcado para enviar demonstrativos', async () => {
  const m = await ctx.db.um('SELECT armazenamento, config FROM modulos WHERE slug = $1', ['comissionamento']);
  assert.equal(m.armazenamento, 'compartilhado');
  assert.equal(m.config.relatorios_comissao, true);
});

test('só quem abre a ferramenta de Comissionamento envia e vê a lista de usuários', async () => {
  assert.equal((await ana('GET', '/api/comissao/usuarios?modulo=comissionamento')).status, 403);
  // abrir outra ferramenta não basta: o módulo precisa ser o de comissão
  assert.equal((await ana('GET', '/api/comissao/usuarios?modulo=credito')).status, 403);
  assert.equal((await ana('POST', '/api/comissao/relatorios', { modulo: 'credito', competencia: '2026-09', relatorios: [{ chave: 'x', usuario_id: ids['ana@teste.com'], html: doc('x') }] })).status, 403);
  const r = await gestor('GET', '/api/comissao/usuarios?modulo=comissionamento');
  assert.equal(r.status, 200);
  assert.ok(r.json.usuarios.some((u) => u.email === 'ana@teste.com'));
});

test('envio valida competência, usuário e o demonstrativo', async () => {
  const ok = { chave: 'p1', usuario_id: ids['ana@teste.com'], nome: 'Ana', html: doc('ok') };
  assert.equal((await gestor('POST', '/api/comissao/relatorios', { modulo: 'comissionamento', competencia: '09/2026', relatorios: [ok] })).status, 400);
  assert.equal((await gestor('POST', '/api/comissao/relatorios', { modulo: 'comissionamento', competencia: '2026-09', relatorios: [{ ...ok, usuario_id: 99999 }] })).status, 400);
  assert.equal((await gestor('POST', '/api/comissao/relatorios', { modulo: 'comissionamento', competencia: '2026-09', relatorios: [{ ...ok, html: 'sem html' }] })).status, 400);
  assert.equal((await gestor('POST', '/api/comissao/relatorios', { modulo: 'comissionamento', competencia: '2026-09', relatorios: [] })).status, 400);
});

let relAna, relLia;
test('gestor envia: cada pessoa recebe o seu, com aviso no sino e e-mail curto; líder e diretoria só no sino', async () => {
  emails.length = 0;
  const r = await gestor('POST', '/api/comissao/relatorios', {
    modulo: 'comissionamento', competencia: '2026-09', relatorios: [
      { chave: 'p-ana', usuario_id: ids['ana@teste.com'], nome: 'Ana Analista', cargo: 'Analista de Cobrança', setor: 'Cobrança', valor: 1234.56,
        html: doc('<h1>Ana R$ 1.234,56</h1><script>alert(1)</script>'),
        leitores: [{ usuario_id: ids['lia@teste.com'], motivo: 'lider' }, { usuario_id: ids['dora@teste.com'], motivo: 'diretoria' }] },
      { chave: 'p-lia', usuario_id: ids['lia@teste.com'], nome: 'Lia Líder', cargo: 'Supervisora', setor: 'Supervisão', valor: 2345.67,
        html: doc('<h1>Lia</h1>'), leitores: [{ usuario_id: ids['dora@teste.com'], motivo: 'diretoria' }] },
    ],
  });
  assert.equal(r.status, 201, r.texto);
  [relAna, relLia] = r.json.enviados.map((e) => e.id);

  const avAna = (await ana('GET', '/api/notificacoes')).json.notificacoes;
  assert.equal(avAna[0].link, `#/comissoes/${relAna}`);
  assert.match(avAna[0].titulo, /Setembro\/2026 está disponível/);
  const avLia = (await lia('GET', '/api/notificacoes')).json.notificacoes;
  assert.ok(avLia.some((n) => n.link === '#/comissoes/equipe'));
  // e-mails: só para as donas dos demonstrativos, sem valores e com o link do portal
  await new Promise((ok) => setTimeout(ok, 50));
  const para = emails.map((m) => m.para.email).sort();
  assert.deepEqual(para, ['ana@teste.com', 'lia@teste.com']);
  assert.ok(emails.every((m) => !/1\.234|2\.345/.test(m.text + m.html)), 'e-mail sem valores');
  assert.ok(emails.some((m) => m.text.includes(`https://portal.teste/#/comissoes/${relAna}`)));
});

test('a pessoa vê só o seu; o líder e a diretoria veem a equipe; colegas não veem nada', async () => {
  const m = (await ana('GET', '/api/comissao/meus')).json;
  assert.deepEqual(m.meus.map((x) => x.id), [relAna]);
  assert.equal(m.equipe.length, 0);
  assert.deepEqual((await ana('GET', '/api/comissao/resumo')).json, { meus: 1, pendentes: 1, equipe: 0 });

  const l = (await lia('GET', '/api/comissao/meus')).json;
  assert.deepEqual(l.meus.map((x) => x.id), [relLia]);
  assert.deepEqual(l.equipe.map((x) => x.id), [relAna]);
  const d = (await dora('GET', '/api/comissao/meus')).json;
  assert.deepEqual(d.equipe.map((x) => x.id).sort(), [relAna, relLia].sort());
  assert.equal(d.equipe.find((x) => x.id === relAna).motivo, 'diretoria');

  assert.equal((await caio('GET', `/api/comissao/relatorios/${relAna}/ver`)).status, 404);
  assert.equal((await caio('GET', `/api/comissao/relatorios/${relAna}`)).status, 404);
  assert.deepEqual((await caio('GET', '/api/comissao/meus')).json, { meus: [], equipe: [] });
  // a líder vê o da analista, mas não o contrário
  assert.equal((await lia('GET', `/api/comissao/relatorios/${relAna}/ver`)).status, 200);
  assert.equal((await ana('GET', `/api/comissao/relatorios/${relLia}/ver`)).status, 404);
});

test('o demonstrativo abre sem scripts e marca a abertura só quando a própria pessoa abre', async () => {
  await lia('GET', `/api/comissao/relatorios/${relAna}/ver`);
  let st = (await gestor('GET', '/api/comissao/relatorios?modulo=comissionamento&competencia=2026-09')).json.relatorios.find((x) => x.id === relAna);
  assert.equal(st.aberto_em, null, 'líder abrindo não conta como a pessoa ter visto');
  const v = await ana('GET', `/api/comissao/relatorios/${relAna}/ver`);
  assert.equal(v.status, 200);
  assert.match(v.texto, /Ana R\$ 1\.234,56/);
  assert.doesNotMatch(v.texto, /<script/i);
  assert.match(v.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(v.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  st = (await gestor('GET', '/api/comissao/relatorios?modulo=comissionamento&competencia=2026-09')).json.relatorios.find((x) => x.id === relAna);
  assert.ok(st.aberto_em);
  assert.equal(st.ciente_em, null);
  assert.equal(st.leitores, 2);
});

test('reenvio cria versão nova, avisa a atualização e a versão antiga sai das listas', async () => {
  const r = await gestor('POST', '/api/comissao/relatorios', { modulo: 'comissionamento', competencia: '2026-09', relatorios: [
    { chave: 'p-ana', usuario_id: ids['ana@teste.com'], nome: 'Ana Analista', valor: 1111.11, html: doc('<h1>Ana v2</h1>'), leitores: [ids['lia@teste.com']] },
  ] });
  assert.equal(r.status, 201);
  assert.equal(r.json.enviados[0].versao, 2);
  const novo = r.json.enviados[0].id;
  const m = (await ana('GET', '/api/comissao/meus')).json.meus;
  assert.deepEqual(m.map((x) => [x.id, x.versao, x.valor]), [[novo, 2, 1111.11]]);
  assert.match((await ana('GET', '/api/notificacoes')).json.notificacoes[0].titulo, /foi atualizado/);
  // a diretoria não estava nos leitores do reenvio
  assert.ok(!(await dora('GET', '/api/comissao/meus')).json.equipe.some((x) => x.id === novo));
  assert.equal((await ana('POST', `/api/comissao/relatorios/${relAna}/ciente`)).status, 409);
  relAna = novo;
});

test('“Estou ciente”: só a própria pessoa confirma e o gestor acompanha', async () => {
  assert.equal((await lia('POST', `/api/comissao/relatorios/${relAna}/ciente`)).status, 403);
  assert.equal((await ana('POST', `/api/comissao/relatorios/${relAna}/ciente`)).status, 200);
  assert.deepEqual((await ana('GET', '/api/comissao/resumo')).json, { meus: 1, pendentes: 0, equipe: 0 });
  const st = (await gestor('GET', '/api/comissao/relatorios?modulo=comissionamento&competencia=2026-09')).json.relatorios;
  assert.ok(st.find((x) => x.id === relAna).ciente_em);
  assert.equal(st.find((x) => x.id === relLia).ciente_em, null);
  assert.equal((await ana('GET', '/api/comissao/relatorios?modulo=comissionamento&competencia=2026-09')).status, 403);
});

test('Comissionamento: o HTML fica fora do repositório e só abre depois que a administração envia o arquivo', async () => {
  const m = (await admin('GET', '/api/admin/modulos')).json.modulos.find((x) => x.slug === 'comissionamento');
  assert.equal(m.tem_arquivo, false);
  assert.equal(m.nome, 'Comissionamento MyBlue');
  assert.equal((await gestor('GET', '/m/comissionamento/')).status, 404);
  const html = '<!doctype html><html><head><title>Comissionamento MyBlue</title></head><body>ok</body></html>';
  assert.equal((await admin('POST', '/api/admin/modulos/reconhecer', html)).json.slug, 'comissionamento', 'o arquivo é reconhecido pelo título');
  const r = await admin('PUT', '/api/admin/modulos/comissionamento/arquivo', html);
  assert.equal(r.status, 200, r.texto);
  const p = await gestor('GET', '/m/comissionamento/');
  assert.equal(p.status, 200);
  assert.match(p.texto, /"modulo":"comissionamento"/);
  assert.match(p.texto, /"modo":"compartilhado"/);
  assert.equal((await ana('GET', '/m/comissionamento/')).status, 403);
});

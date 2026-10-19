'use strict';
/* Testes de "Minhas Premiações": envio dos demonstrativos pela ferramenta de Comissionamento (node --test). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx;
const emails = [];

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, extra = {}) {
    const headers = { ...extra };
    if (cookie) headers.cookie = cookie;
    let body;
    if (typeof corpo === 'string' || Buffer.isBuffer(corpo)) { body = corpo; headers['content-type'] = headers['content-type'] || 'text/html'; }
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
  gestor = await criarPessoa('Gil Gestor', 'gil@teste.com', ['premiacoes']);
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
  const m = await ctx.db.um('SELECT armazenamento, config FROM modulos WHERE slug = $1', ['premiacoes']);
  assert.equal(m.armazenamento, 'compartilhado');
  assert.equal(m.config.relatorios_comissao, true);
});

test('só quem abre a ferramenta de Comissionamento envia e vê a lista de usuários', async () => {
  assert.equal((await ana('GET', '/api/comissao/usuarios?modulo=premiacoes')).status, 403);
  // abrir outra ferramenta não basta: o módulo precisa ser o de comissão
  assert.equal((await ana('GET', '/api/comissao/usuarios?modulo=credito')).status, 403);
  assert.equal((await ana('POST', '/api/comissao/relatorios', { modulo: 'credito', competencia: '2026-09', relatorios: [{ chave: 'x', usuario_id: ids['ana@teste.com'], html: doc('x') }] })).status, 403);
  const r = await gestor('GET', '/api/comissao/usuarios?modulo=premiacoes');
  assert.equal(r.status, 200);
  assert.ok(r.json.usuarios.some((u) => u.email === 'ana@teste.com'));
});

test('envio valida competência, usuário e o demonstrativo', async () => {
  const ok = { chave: 'p1', usuario_id: ids['ana@teste.com'], nome: 'Ana', html: doc('ok') };
  assert.equal((await gestor('POST', '/api/comissao/relatorios', { modulo: 'premiacoes', competencia: '09/2026', relatorios: [ok] })).status, 400);
  assert.equal((await gestor('POST', '/api/comissao/relatorios', { modulo: 'premiacoes', competencia: '2026-09', relatorios: [{ ...ok, usuario_id: 99999 }] })).status, 400);
  assert.equal((await gestor('POST', '/api/comissao/relatorios', { modulo: 'premiacoes', competencia: '2026-09', relatorios: [{ ...ok, html: 'sem html' }] })).status, 400);
  assert.equal((await gestor('POST', '/api/comissao/relatorios', { modulo: 'premiacoes', competencia: '2026-09', relatorios: [] })).status, 400);
});

let relAna, relLia;
test('gestor envia: cada pessoa recebe o seu, com aviso no sino e e-mail curto; líder e diretoria só no sino', async () => {
  emails.length = 0;
  const r = await gestor('POST', '/api/comissao/relatorios', {
    modulo: 'premiacoes', competencia: '2026-09', relatorios: [
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
  assert.equal(avAna[0].link, `#/premiacoes/${relAna}`);
  assert.match(avAna[0].titulo, /Setembro\/2026 está disponível/);
  const avLia = (await lia('GET', '/api/notificacoes')).json.notificacoes;
  assert.ok(avLia.some((n) => n.link === '#/premiacoes/equipe'));
  // e-mails: só para as donas dos demonstrativos, sem valores e com o link do portal
  await new Promise((ok) => setTimeout(ok, 50));
  const para = emails.map((m) => m.para.email).sort();
  assert.deepEqual(para, ['ana@teste.com', 'lia@teste.com']);
  assert.ok(emails.every((m) => !/1\.234|2\.345/.test(m.text + m.html)), 'e-mail sem valores');
  assert.ok(emails.some((m) => m.text.includes(`https://portal.teste/#/premiacoes/${relAna}`)));
});

test('a pessoa vê só o seu; o líder e a diretoria veem a equipe; colegas não veem nada', async () => {
  const m = (await ana('GET', '/api/comissao/meus')).json;
  assert.deepEqual(m.meus.map((x) => x.id), [relAna]);
  assert.equal(m.equipe.length, 0);
  assert.deepEqual((await ana('GET', '/api/comissao/resumo')).json, { meus: 1, pendentes: 1, equipe: 0, planilhas: 0 });

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
  let st = (await gestor('GET', '/api/comissao/relatorios?modulo=premiacoes&competencia=2026-09')).json.relatorios.find((x) => x.id === relAna);
  assert.equal(st.aberto_em, null, 'líder abrindo não conta como a pessoa ter visto');
  const v = await ana('GET', `/api/comissao/relatorios/${relAna}/ver`);
  assert.equal(v.status, 200);
  assert.match(v.texto, /Ana R\$ 1\.234,56/);
  assert.doesNotMatch(v.texto, /<script/i);
  assert.match(v.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(v.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  st = (await gestor('GET', '/api/comissao/relatorios?modulo=premiacoes&competencia=2026-09')).json.relatorios.find((x) => x.id === relAna);
  assert.ok(st.aberto_em);
  assert.equal(st.ciente_em, null);
  assert.equal(st.leitores, 2);
});

test('reenvio cria versão nova, avisa a atualização e a versão antiga sai das listas', async () => {
  const r = await gestor('POST', '/api/comissao/relatorios', { modulo: 'premiacoes', competencia: '2026-09', relatorios: [
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
  assert.deepEqual((await ana('GET', '/api/comissao/resumo')).json, { meus: 1, pendentes: 0, equipe: 0, planilhas: 0 });
  const st = (await gestor('GET', '/api/comissao/relatorios?modulo=premiacoes&competencia=2026-09')).json.relatorios;
  assert.ok(st.find((x) => x.id === relAna).ciente_em);
  assert.equal(st.find((x) => x.id === relLia).ciente_em, null);
  assert.equal((await ana('GET', '/api/comissao/relatorios?modulo=premiacoes&competencia=2026-09')).status, 403);
});

test('Comissionamento: o HTML fica fora do repositório e só abre depois que a administração envia o arquivo', async () => {
  const m = (await admin('GET', '/api/admin/modulos')).json.modulos.find((x) => x.slug === 'premiacoes');
  assert.equal(m.tem_arquivo, false);
  assert.equal(m.nome, 'Gestão de Premiações');
  assert.equal((await gestor('GET', '/m/premiacoes/')).status, 404);
  const html = '<!doctype html><html><head><title>Gestão de Premiações</title></head><body>ok</body></html>';
  assert.equal((await admin('POST', '/api/admin/modulos/reconhecer', html)).json.slug, 'premiacoes', 'o arquivo é reconhecido pelo título');
  const r = await admin('PUT', '/api/admin/modulos/premiacoes/arquivo', html);
  assert.equal(r.status, 200, r.texto);
  const p = await gestor('GET', '/m/premiacoes/');
  assert.equal(p.status, 200);
  assert.match(p.texto, /"modulo":"premiacoes"/);
  assert.match(p.texto, /"modo":"compartilhado"/);
  assert.equal((await ana('GET', '/m/premiacoes/')).status, 403);
});

test('Planilhas do mês: a gestão pede ao coordenador, ele envia uma por pessoa e quem pediu recebe um aviso só no fim', async () => {
  const pedido = { modulo: 'premiacoes', competencia: '2026-10', pedidos: [
    { chave: 'p-ana', usuario_id: ids['lia@teste.com'], nome: 'Ana Analista', tipo: 'credito', titulo: 'Planilha de envio de boletos' },
    { chave: 'p-caio', usuario_id: ids['lia@teste.com'], nome: 'Caio Colega', tipo: 'credito', titulo: 'Planilha de envio de boletos' }] };
  assert.equal((await ana('POST', '/api/comissao/planilhas', pedido)).status, 403, 'quem não usa a ferramenta não pede');
  const r = await gestor('POST', '/api/comissao/planilhas', pedido);
  assert.equal(r.status, 201, r.texto);
  const [idAna, idCaio] = r.json.pedidos.map((x) => x.id);
  // o coordenador: UM aviso com a lista da equipe (sino + e-mail curto) e os pedidos em Minhas Premiações
  const avisosLia = (await lia('GET', '/api/notificacoes')).json.notificacoes.filter((n) => /planilha/i.test(n.titulo));
  assert.equal(avisosLia.length, 1);
  assert.match(avisosLia[0].titulo, /Envie 2 planilhas de premiação/);
  assert.match(avisosLia[0].texto, /Ana Analista, Caio Colega/);
  assert.equal(avisosLia[0].link, '#/premiacoes/enviar');
  assert.ok(emails.some((e) => /Envie 2 planilhas/.test(JSON.stringify(e))));
  assert.equal((await lia('GET', '/api/comissao/resumo')).json.planilhas, 2);
  const minhas = (await lia('GET', '/api/comissao/minhas-planilhas')).json.planilhas;
  assert.deepEqual(minhas.map((x) => x.nome).sort(), ['Ana Analista', 'Caio Colega']);
  // as pessoas da equipe não recebem pedido; ninguém além do coordenador envia; a gestão não envia por ele
  assert.equal((await ana('GET', '/api/comissao/minhas-planilhas')).json.planilhas.length, 0);
  const arq = Buffer.from('Nome do Cliente;Vencimento;Data Envio\nCond. Teste;10/10/2026;30/09/2026\n');
  assert.equal((await ana('POST', `/api/comissao/minhas-planilhas/${idAna}`, arq, { 'x-nome-arquivo': 'p.csv', 'content-type': 'text/csv' })).status, 404);
  assert.equal((await lia('POST', `/api/comissao/minhas-planilhas/${idAna}`, arq, { 'x-nome-arquivo': 'virus.exe', 'content-type': 'application/octet-stream' })).status, 400, 'só Excel, CSV ou PDF');
  assert.equal((await gestor('GET', `/api/comissao/planilhas/${idAna}/arquivo`)).status, 404, 'ainda não enviada');
  // envio da planilha da Ana pelo coordenador
  const env = await lia('POST', `/api/comissao/minhas-planilhas/${idAna}`, arq, { 'x-nome-arquivo': encodeURIComponent('Crédito Ana.csv'), 'content-type': 'text/csv' });
  assert.equal(env.status, 201, env.texto);
  assert.equal(env.json.faltam, 1);
  assert.equal((await lia('GET', '/api/comissao/resumo')).json.planilhas, 1);
  const avisosGil = async () => (await gestor('GET', '/api/notificacoes')).json.notificacoes.filter((n) => /Lia Líder enviou/.test(n.titulo));
  assert.equal((await avisosGil()).length, 0, 'enquanto falta planilha da equipe, a gestão não é avisada');
  // a gestão acompanha, baixa e marca como importada
  const lista = (await gestor('GET', '/api/comissao/planilhas?modulo=premiacoes&competencia=2026-10')).json.planilhas;
  const la = lista.find((x) => x.id === idAna);
  assert.equal(la.arquivo_nome, 'Crédito Ana.csv');
  assert.equal(la.usuario_nome, 'Lia Líder');
  assert.equal(lista.find((x) => x.id === idCaio).enviado_em, null);
  assert.equal((await lia('GET', '/api/comissao/planilhas?modulo=premiacoes&competencia=2026-10')).status, 403);
  assert.equal((await lia('GET', `/api/comissao/planilhas/${idAna}/arquivo`)).status, 404);
  const down = await gestor('GET', `/api/comissao/planilhas/${idAna}/arquivo`);
  assert.equal(down.status, 200);
  assert.match(down.headers.get('content-disposition'), /attachment/);
  assert.match(down.texto, /Cond\. Teste/);
  // a última da equipe: um aviso só, com todas
  const env2 = await lia('POST', `/api/comissao/minhas-planilhas/${idCaio}`, arq, { 'x-nome-arquivo': 'caio.xlsx', 'content-type': 'application/octet-stream' });
  assert.equal(env2.json.faltam, 0);
  let nGil = await avisosGil();
  assert.equal(nGil.length, 1);
  assert.match(nGil[0].titulo, /Lia Líder enviou as 2 planilhas da equipe \(Outubro\/2026\)/);
  assert.match(nGil[0].texto, /Ana Analista, Caio Colega/);
  assert.equal(nGil[0].link, '#/m/premiacoes');
  assert.equal((await gestor('POST', `/api/comissao/planilhas/${idAna}/importado`)).status, 200);
  assert.ok((await lia('GET', '/api/comissao/minhas-planilhas')).json.planilhas.find((x) => x.id === idAna).importado_em, 'o coordenador vê que a gestão recebeu');
  // corrigir uma depois de tudo enviado: aviso só daquela
  await lia('POST', `/api/comissao/minhas-planilhas/${idCaio}`, arq, { 'x-nome-arquivo': 'caio-v2.xlsx', 'content-type': 'application/octet-stream' });
  nGil = await avisosGil();
  assert.equal(nGil.length, 2);
  assert.match(nGil[0].titulo, /Lia Líder enviou de novo a planilha de Caio Colega/);
  // pedir de novo não duplica; cancelar tira o pedido
  const r2 = await gestor('POST', '/api/comissao/planilhas', pedido);
  assert.equal(r2.json.pedidos[0].id, idAna);
  assert.equal(r2.json.pedidos[0].novo, false);
  assert.equal((await gestor('DELETE', `/api/comissao/planilhas/${idCaio}`)).status, 200);
  assert.deepEqual((await lia('GET', '/api/comissao/minhas-planilhas')).json.planilhas.map((x) => x.nome), ['Ana Analista']);
  // o balanço em PDF (ex.: Balanço de Marketing, montado pela supervisão) também é aceito
  const rPdf = await gestor('POST', '/api/comissao/planilhas', { modulo: 'premiacoes', competencia: '2027-01', pedidos: [
    { chave: 'p-mkt', usuario_id: ids['lia@teste.com'], nome: 'Ana Analista', tipo: 'metas', titulo: 'Balanço de Marketing' }] });
  assert.equal((await lia('POST', `/api/comissao/minhas-planilhas/${rPdf.json.pedidos[0].id}`, Buffer.from('%PDF-1.4'), { 'x-nome-arquivo': 'balanco.pdf', 'content-type': 'application/pdf' })).status, 201);
  // cancelar a única que faltava: as já enviadas não ficam sem aviso
  const r3 = await gestor('POST', '/api/comissao/planilhas', { modulo: 'premiacoes', competencia: '2026-11', pedidos: [
    { chave: 'p-ana', usuario_id: ids['lia@teste.com'], nome: 'Ana Analista', titulo: 'Planilha' },
    { chave: 'p-caio', usuario_id: ids['lia@teste.com'], nome: 'Caio Colega', titulo: 'Planilha' }] });
  const [a11, c11] = r3.json.pedidos.map((x) => x.id);
  assert.equal((await lia('POST', `/api/comissao/minhas-planilhas/${a11}`, arq, { 'x-nome-arquivo': 'a.csv', 'content-type': 'text/csv' })).json.faltam, 1);
  assert.equal((await gestor('DELETE', `/api/comissao/planilhas/${c11}`)).status, 200);
  assert.match((await avisosGil())[0].titulo, /Lia Líder enviou a planilha de Ana Analista \(Novembro\/2026\)/);
});

test('Minhas Premiações: o demonstrativo é só para ler (sem impressão)', async () => {
  const v = await ana('GET', `/api/comissao/relatorios/${relAna}/ver`);
  assert.equal(v.status, 200);
  assert.match(v.texto, /@media print\{html,body\{display:none!important\}\}/);
});

test('quem só consulta a Gestão de Premiações vê, mas não envia demonstrativos nem pede planilhas', async () => {
  const leitor = await criarPessoa('Leo Leitor', 'leo@teste.com', ['premiacoes']);
  await ctx.db.q("UPDATE permissoes SET somente_leitura = TRUE WHERE usuario_id = $1 AND modulo_slug = 'premiacoes'", [ids['leo@teste.com']]);
  assert.equal((await leitor('GET', '/api/comissao/usuarios?modulo=premiacoes')).status, 200);
  const rel = { chave: 'z1', usuario_id: ids['ana@teste.com'], nome: 'Ana', html: doc('z') };
  const r = await leitor('POST', '/api/comissao/relatorios', { modulo: 'premiacoes', competencia: '2026-11', relatorios: [rel] });
  assert.equal(r.status, 403);
  assert.match(r.json.erro, /só de consulta/);
  assert.equal((await leitor('POST', '/api/comissao/planilhas', { modulo: 'premiacoes', competencia: '2026-11', pedidos: [] })).status, 403);
});

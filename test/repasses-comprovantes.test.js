'use strict';
/* Comprovantes de repasse: o Gestor do Controle de Repasses envia o .zip do dia de cada assistente de crédito,
   a assistente é avisada e baixa no portal (dados fictícios). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');
const { criarZip } = require('../server/zip');

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
const zip = (n) => criarZip(Array.from({ length: n }, (_, i) => ({ nome: `comprovante-${i + 1}.pdf`, dados: `%PDF-1.4 comprovante fictício ${i + 1}` })));
const enviar = (c, { dia = ONTEM, assistente = 'FULANA SOUZA - 4600', qtd = 3, nome = 'comprovantes.zip', corpo = zip(3), headers } = {}) =>
  c('POST', `/api/repasses/comprovantes?dia=${dia}&assistente=${encodeURIComponent(assistente)}&qtd=${qtd}&nome=${encodeURIComponent(nome)}`, corpo, { headers });

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

test('o Gestor envia o .zip: guarda, acha a assistente na equipe do Crédito e avisa no portal e por e-mail', async () => {
  emails.length = 0;
  const corpo = zip(3);
  const r = await enviar(gestor, { corpo });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.dia, ONTEM);
  assert.equal(r.json.assistente, 'FULANA SOUZA - 4600');
  assert.deepEqual(r.json.destinatario, { id: ids['fulana@teste.com'], nome: 'Fulana Ficticia Souza' });
  assert.equal(r.json.substituiu, false);
  const l = await ctx.db.um('SELECT * FROM repasses_comprovantes WHERE id = $1', [r.json.id]);
  assert.equal(l.usuario_id, ids['fulana@teste.com']);
  assert.equal(l.enviado_por, ids['gestor@teste.com']);
  assert.equal(l.qtd, 3);
  assert.equal(l.tamanho, corpo.length);
  assert.equal(l.nome_arquivo, 'comprovantes.zip');
  assert.ok(Buffer.from(l.conteudo).equals(corpo));
  assert.equal(l.baixado_em, null);
  assert.deepEqual(await avisosDe('fulana@teste.com'), [{ tipo: 'repasses', titulo: `Comprovantes de repasse de ${ddmm(ONTEM)}`, texto: '3 comprovantes dos seus condomínios para baixar.', link: '#/comprovantes' }]);
  assert.deepEqual(await avisosDe('beltrana@teste.com'), []);
  await esperar();
  assert.ok(emails.some((e) => e.para.email === 'fulana@teste.com'), 'e-mail para a assistente');
  // o nome da carteira é aceito como vier (espaços e minúsculas) e fica no padrão da carteira
  const b = await enviar(gestor, { assistente: '  beltrana   lima - 4601 ', qtd: 1, corpo: zip(1) });
  assert.equal(b.status, 201, b.texto);
  assert.equal(b.json.assistente, 'BELTRANA LIMA - 4601');
  assert.equal(b.json.destinatario.id, ids['beltrana@teste.com']);
  assert.equal((await avisosDe('beltrana@teste.com'))[0].texto, '1 comprovante dos seus condomínios para baixar.');
  // a administração também envia
  assert.equal((await enviar(admin, { dia: ANTEONTEM, corpo: zip(2), qtd: 2 })).status, 201);
});

test('quem não é Gestor (ou só consulta) não envia; dados inválidos são recusados', async () => {
  const antes = (await ctx.db.um('SELECT COUNT(*)::int AS n FROM repasses_comprovantes')).n;
  let r = await enviar(estranho);
  assert.equal(r.status, 403);
  assert.equal(r.json.erro, 'Sem acesso ao Controle de Repasses.');
  for (const c of [semPapel, leitor, fulana]) {
    r = await enviar(c);
    assert.equal(r.status, 403, r.texto);
  }
  r = await enviar(semPapel);
  assert.equal(r.json.erro, 'Só quem tem o papel Gestor no Controle de Repasses envia os comprovantes.');
  assert.equal((await cliente()('POST', `/api/repasses/comprovantes?dia=${ONTEM}&assistente=X`, zip(1))).status, 401);
  assert.equal((await enviar(gestor, { dia: '2026-02-30' })).json.erro, 'Data inválida: use AAAA-MM-DD.');
  assert.equal((await enviar(gestor, { dia: '03/11/2026' })).status, 400);
  assert.equal((await enviar(gestor, { assistente: ' ' })).json.erro, 'Informe a assistente (o nome como está na Base de Clientes).');
  assert.equal((await enviar(gestor, { assistente: 'X'.repeat(121) })).status, 400);
  assert.equal((await enviar(gestor, { qtd: -1 })).json.erro, 'Quantidade de comprovantes inválida.');
  assert.equal((await enviar(gestor, { corpo: Buffer.alloc(0) })).json.erro, 'Arquivo vazio.');
  assert.equal((await enviar(gestor, { corpo: Buffer.from('%PDF-1.4 não é zip') })).json.erro, 'O arquivo não é um .zip.');
  r = await enviar(gestor, { headers: { 'content-type': 'application/pdf' } });
  assert.equal(r.status, 415);
  assert.equal(r.json.erro, 'Envie o arquivo .zip (application/zip).');
  // application/octet-stream também vale
  r = await enviar(gestor, { dia: diaAntes(3), headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(r.status, 201, r.texto);
  assert.equal((await ctx.db.um('SELECT COUNT(*)::int AS n FROM repasses_comprovantes')).n, antes + 1);
});

test('novo envio do mesmo dia e assistente troca o anterior, volta a "não baixado" e avisa de novo', async () => {
  const atual = await ctx.db.um("SELECT id FROM repasses_comprovantes WHERE dia = $1 AND assistente = 'FULANA SOUZA - 4600'", [ONTEM]);
  assert.equal((await fulana('GET', `/api/repasses/comprovantes/${atual.id}/arquivo`, undefined, { bruto: true })).status, 200);
  assert.ok((await ctx.db.um('SELECT baixado_em FROM repasses_comprovantes WHERE id = $1', [atual.id])).baixado_em);
  const avisos = (await avisosDe('fulana@teste.com')).length;
  const corpo = zip(5);
  const r = await enviar(gestor, { qtd: 5, corpo, nome: 'comprovantes-corrigidos.zip' });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.id, atual.id);
  assert.equal(r.json.substituiu, true);
  const l = await ctx.db.um('SELECT * FROM repasses_comprovantes WHERE id = $1', [atual.id]);
  assert.equal(l.qtd, 5);
  assert.equal(l.nome_arquivo, 'comprovantes-corrigidos.zip');
  assert.ok(Buffer.from(l.conteudo).equals(corpo));
  assert.equal(l.baixado_em, null);
  assert.equal((await ctx.db.um("SELECT COUNT(*)::int AS n FROM repasses_comprovantes WHERE dia = $1 AND assistente = 'FULANA SOUZA - 4600'", [ONTEM])).n, 1);
  const depois = await avisosDe('fulana@teste.com');
  assert.equal(depois.length, avisos + 1);
  assert.equal(depois[depois.length - 1].texto, '5 comprovantes dos seus condomínios para baixar.');
});

test('assistente que não está (ou não é uma só) na equipe do Crédito: guarda sem destinatário e não avisa ninguém', async () => {
  const n = (await ctx.db.um('SELECT COUNT(*)::int AS n FROM notificacoes')).n;
  let r = await enviar(gestor, { assistente: 'CICLANA INEXISTENTE - 4700' });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.destinatario, null);
  // quem não está no Crédito não recebe, mesmo com o nome igual
  r = await enviar(gestor, { assistente: 'PESSOA DE FORA' });
  assert.equal(r.json.destinatario, null);
  // nome que serve para duas pessoas da equipe: ambíguo
  const outra = await pessoa('Fulana Ficticia Lima', 'fulana2@teste.com');
  await noCredito('fulana2@teste.com');
  r = await enviar(gestor, { assistente: 'FULANA FICTICIA' });
  assert.equal(r.json.destinatario, null);
  assert.equal((await ctx.db.um('SELECT COUNT(*)::int AS n FROM notificacoes')).n, n);
  assert.equal((await outra('GET', '/api/repasses/comprovantes')).json.itens.length, 0);
});

test('lista: o Gestor e a administração veem todos; a assistente, só os dela; nunca o arquivo', async () => {
  const total = (await ctx.db.um('SELECT COUNT(*)::int AS n FROM repasses_comprovantes')).n;
  for (const c of [gestor, leitor, admin]) {
    const r = await c('GET', '/api/repasses/comprovantes');
    assert.equal(r.status, 200, r.texto);
    assert.equal(r.json.gestor, true);
    assert.equal(r.json.itens.length, total);
  }
  const g = (await gestor('GET', '/api/repasses/comprovantes')).json.itens.find((x) => x.assistente === 'FULANA SOUZA - 4600' && x.dia === ONTEM);
  assert.deepEqual(Object.keys(g).sort(), ['assistente', 'baixado_em', 'destinatario', 'dia', 'enviado_em', 'enviado_por', 'id', 'nome_arquivo', 'qtd', 'tamanho']);
  assert.equal(g.destinatario, 'Fulana Ficticia Souza');
  assert.equal(g.enviado_por, 'Gestora de Repasses Fictícia');
  assert.equal(g.qtd, 5);
  const f = await fulana('GET', '/api/repasses/comprovantes');
  assert.equal(f.json.gestor, false);
  assert.deepEqual(f.json.itens.map((x) => x.dia).sort(), [ANTEONTEM, diaAntes(3), ONTEM].sort());
  assert.ok(f.json.itens.every((x) => x.destinatario === 'Fulana Ficticia Souza' && !('conteudo' in x)));
  assert.deepEqual((await beltrana('GET', '/api/repasses/comprovantes')).json.itens.map((x) => x.assistente), ['BELTRANA LIMA - 4601']);
  assert.deepEqual((await semPapel('GET', '/api/repasses/comprovantes')).json.itens, []);
  assert.deepEqual((await estranho('GET', '/api/repasses/comprovantes')).json.itens, []);
  // por dia
  assert.deepEqual((await fulana('GET', `/api/repasses/comprovantes?dia=${ANTEONTEM}`)).json.itens.map((x) => x.dia), [ANTEONTEM]);
  assert.ok((await gestor('GET', `/api/repasses/comprovantes?dia=${ONTEM}`)).json.itens.every((x) => x.dia === ONTEM));
  assert.equal((await fulana('GET', '/api/repasses/comprovantes?dia=ontem')).status, 400);
  assert.equal((await cliente()('GET', '/api/repasses/comprovantes')).status, 401);
});

test('baixar: quem recebeu (marca a primeira vez), a administração e o Gestor; os demais não', async () => {
  const { id } = await ctx.db.um("SELECT id FROM repasses_comprovantes WHERE dia = $1 AND assistente = 'BELTRANA LIMA - 4601'", [ONTEM]);
  const conteudo = Buffer.from((await ctx.db.um('SELECT conteudo FROM repasses_comprovantes WHERE id = $1', [id])).conteudo);
  // o Gestor baixa: não conta como baixado pela assistente
  let r = await gestor('GET', `/api/repasses/comprovantes/${id}/arquivo`, undefined, { bruto: true });
  assert.equal(r.status, 200);
  assert.equal((await ctx.db.um('SELECT baixado_em FROM repasses_comprovantes WHERE id = $1', [id])).baixado_em, null);
  assert.equal((await admin('GET', `/api/repasses/comprovantes/${id}/arquivo`, undefined, { bruto: true })).status, 200);
  // outra pessoa (mesmo da equipe do Crédito ou com acesso sem o papel Gestor): não
  for (const c of [fulana, semPapel, estranho]) {
    r = await c('GET', `/api/repasses/comprovantes/${id}/arquivo`);
    assert.equal(r.status, 403);
    assert.equal(r.json.erro, 'Estes comprovantes foram enviados para outra pessoa.');
  }
  r = await beltrana('GET', `/api/repasses/comprovantes/${id}/arquivo`, undefined, { bruto: true });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/zip');
  assert.equal(r.headers.get('content-disposition'), "attachment; filename*=UTF-8''comprovantes.zip");
  assert.ok(r.buffer.equals(conteudo));
  const primeira = (await ctx.db.um('SELECT baixado_em FROM repasses_comprovantes WHERE id = $1', [id])).baixado_em;
  assert.ok(primeira);
  await beltrana('GET', `/api/repasses/comprovantes/${id}/arquivo`, undefined, { bruto: true });
  assert.equal((await ctx.db.um('SELECT baixado_em FROM repasses_comprovantes WHERE id = $1', [id])).baixado_em.getTime(), new Date(primeira).getTime());
  assert.ok((await beltrana('GET', '/api/repasses/comprovantes')).json.itens[0].baixado_em);
  assert.equal((await beltrana('GET', '/api/repasses/comprovantes/999999/arquivo')).status, 404);
  const aud = await ctx.db.q("SELECT acao, usuario_id FROM auditoria WHERE acao LIKE 'repasses_comprovantes_%' AND detalhe->>'id' = $1", [String(id)]);
  assert.ok(aud.rows.some((x) => x.acao === 'repasses_comprovantes_enviados'));
  assert.ok(aud.rows.some((x) => x.acao === 'repasses_comprovantes_baixados' && x.usuario_id === ids['beltrana@teste.com']));
});

test('ferramenta isolada: o Controle de Repasses envia, lista e baixa pela chave; outra ferramenta não', async () => {
  const pag = await gestor('GET', '/m/repasses/');
  assert.equal(pag.status, 200, pag.texto);
  const chave = chaveDa(pag.texto);
  // pré-voo do navegador (o .zip vai com Content-Type application/zip)
  let r = await daFerramenta('OPTIONS', `/t/${chave}/api/repasses/comprovantes?dia=${ONTEM}`, undefined, { 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' });
  assert.equal(r.status, 204);
  const corpo = zip(2);
  r = await daFerramenta('POST', `/t/${chave}/api/repasses/comprovantes?dia=${diaAntes(4)}&assistente=${encodeURIComponent('FULANA SOUZA - 4600')}&qtd=2&nome=lote.zip`, corpo);
  assert.equal(r.status, 201, r.buffer.toString());
  assert.equal(r.json.destinatario.id, ids['fulana@teste.com']);
  assert.equal(r.headers.get('access-control-allow-origin'), 'null');
  const id = r.json.id;
  r = await daFerramenta('GET', `/t/${chave}/api/repasses/comprovantes?dia=${diaAntes(4)}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.itens.map((x) => x.id), [id]);
  r = await daFerramenta('GET', `/t/${chave}/api/repasses/comprovantes/${id}/arquivo`);
  assert.equal(r.status, 200);
  assert.ok(r.buffer.equals(corpo));
  assert.match(r.headers.get('access-control-expose-headers'), /Content-Disposition/);
  // outros métodos e outra ferramenta: fechado
  assert.equal((await daFerramenta('DELETE', `/t/${chave}/api/repasses/comprovantes`)).status, 403);
  assert.equal((await daFerramenta('POST', `/t/${chave}/api/repasses/comprovantes/${id}/arquivo`, corpo)).status, 403);
  const outra = chaveDa((await gestor('GET', '/m/agenda/')).texto);
  assert.equal((await daFerramenta('GET', `/t/${outra}/api/repasses/comprovantes`)).status, 403);
  assert.equal((await daFerramenta('POST', `/t/${outra}/api/repasses/comprovantes?dia=${ONTEM}&assistente=X`, corpo)).status, 403);
  assert.equal((await daFerramenta('GET', `/t/${outra}/api/repasses/comprovantes/${id}/arquivo`)).status, 403);
});

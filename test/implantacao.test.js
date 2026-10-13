'use strict';
/* Testes de "Adicionar novos" da Carteira: planilha de implantação (dados fictícios). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const zlib = require('zlib');
const { criarApp, lerConfig } = require('../server/index');
const { interpretarImplantacao, dataContrato, apelido, lerCnpj } = require('../server/implantacao');
const { lerPlanilha } = require('../server/planilha');

let servidor, base, ctx, admin, coord, comum;

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, headers = {}) {
    const h = { ...headers };
    if (cookie) h.cookie = cookie;
    let body;
    if (corpo !== undefined) {
      if (Buffer.isBuffer(corpo)) { body = corpo; h['content-type'] ||= 'application/octet-stream'; } else { body = JSON.stringify(corpo); h['content-type'] = 'application/json'; }
    }
    const r = await fetch(base + url, { method: metodo, headers: h, body, redirect: 'manual' });
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

// como o Excel salva o "Controle de Implantações": título, blocos por ano, Windows-1252
const CSV = Buffer.from([
  'CONTROLE IMPLANTAÇÕES ;;;;;;;;;;',
  ';2026;;;;;;;;;',
  'Nº FORMULÁRIO;CONDOMÍNIO;ESTADO;DIA VENC.;ADM.;EXECUTIVO;CNPJ;CONTRATO;DATA CONTRATO;ENVIO E-MAIL/FÍSICO;IMPLANTADO POR;OBS.;MÊS',
  '10;Condomínio Edifício Jardim Azul;CE;05;Sim. Adm Alfa;Edu Exec;11.222.333/0001-81;SIM;15/10/2026;AMBOS;Ana Teste;;out/26',
  '11;RESIDENCIAL SOLAR DAS PALMEIRAS II;PB;10;Não;Edu Exec;6,60363E+13;SIM;01/10/2026;DIGITAL;Bia Teste;expedição em andamento;out/26',
  '12;Edificio Lagoa Verde;RN;10;RB;Edu Exec;;SIM;01/10/2026;AMBOS;Ana Teste;DESCONSIDERAR - duplicidade;out/26',
  '13;Condomínio Já Existente;CE;10;RB;Edu Exec;Ainda não tem;SIM;02/10/2026;AMBOS;Ana Teste;;out/26',
  '14;Condomínio Edifício Jardim Azul;CE;05;Sim. Adm Alfa;Edu Exec;;SIM;20/10/2026;AMBOS;Ana Teste;;out/26',
  '15;Residencial Sem Data;CE;10;RB;Edu Exec;;SIM;;AMBOS;Ana Teste;;',
  '16;Residencial Setembro;CE;10;RB;Edu Exec;;SIM;10/09/2026;DIGITAL;Ana Teste;;set/26',
  ';;;;;;;;;;',
  ';2027;;;;;;;;;',
  'Nº FORMULÁRIO;CONDOMÍNIO;ESTADO;DIA VENC.;ADM.;EXECUTIVO;CNPJ;CONTRATO;DATA CONTRATO;ENVIO E-MAIL/FÍSICO;IMPLANTADO POR;OBS.;MÊS',
  '17;Torre do Ano Novo;MA;15;Gama;Edu Exec;;SIM;05/01/2027;AMBOS;Bia Teste;;jan/27',
].join('\r\n'), 'latin1');

/* .xlsx mínimo (zip sem compressão + um arquivo comprimido) para testar o leitor */
function zip(arquivos) {
  const partes = [], central = [];
  let pos = 0;
  arquivos.forEach(([nome, conteudo], i) => {
    const dados = Buffer.from(conteudo, 'utf8');
    const comp = i % 2 ? zlib.deflateRawSync(dados) : dados;
    const metodo = i % 2 ? 8 : 0;
    const n = Buffer.from(nome);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(metodo, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(dados.length, 22); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(metodo, 10); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(dados.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42);
    partes.push(local, n, comp); central.push(c, n);
    pos += 30 + n.length + comp.length;
  });
  const cd = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10); fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(pos, 16);
  return Buffer.concat([...partes, cd, fim]);
}
const XLSX = zip([
  ['xl/workbook.xml', '<workbook><sheets><sheet name="Página2" sheetId="1" r:id="rId9"/></sheets></workbook>'],
  ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId9" Target="worksheets/sheet7.xml"/></Relationships>'],
  ['xl/sharedStrings.xml', '<sst><si><t>CONDOMÍNIO</t></si><si><t>DATA CONTRATO</t></si><si><t>ESTADO</t></si><si><r><t>Edifício </t></r><r><t>Mar &amp; Sol</t></r></si><si><t>PB</t></si></sst>'],
  ['xl/worksheets/sheet7.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Título</t></is></c></row>' +
    '<row r="3"><c r="B3" t="s"><v>0</v></c><c r="C3" t="s"><v>2</v></c><c r="D3" t="s"><v>1</v></c></row>' +
    '<row r="4"><c r="B4" t="s"><v>3</v></c><c r="C4" t="s"><v>4</v></c><c r="D4" s="5"><v>46296</v></c></row></sheetData></worksheet>'],
]);

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0, enviarEmail: async () => {} });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');
  const setores = (await admin('GET', '/api/admin/usuarios')).json.setores;
  const S = (n) => setores.find((x) => x.nome === n).id;
  for (const [nome, email, extra] of [['Cora Coordenadora', 'cora@teste.com', { papel: 'coordenador', setores: [S('Implantação')] }], ['Ivo Comum', 'ivo@teste.com', { setores: [S('Crédito')] }]]) {
    const u = await admin('POST', '/api/admin/usuarios', { nome, email, senha: 'Senha1234', ...extra });
    assert.equal(u.status, 201, u.texto);
  }
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  coord = await entrar('cora@teste.com', 'Senha1234');
  comum = await entrar('ivo@teste.com', 'Senha1234');
  await ctx.db.q("INSERT INTO condominios (codigo, nome, comarca, inicio_contrato) VALUES ('900', 'Já Existente', 'CE', '2025-01-01')");
});

after(async () => {
  servidor.close();
  await ctx.db.fechar();
});

test('lê a planilha de implantação: vigência da DATA CONTRATO, apelido e o que fica de fora', () => {
  assert.deepEqual(dataContrato('15/10/2026'), { dia: '15/10/2026', vigencia: '10/2026' });
  assert.equal(dataContrato('46296').vigencia, '10/2026', 'data em número de série do Excel');
  assert.equal(dataContrato(''), null);
  assert.equal(apelido('Condomínio Edifício Jardim Azul'), 'Jardim Azul');
  assert.equal(apelido('RESIDENCIAL SOLAR DAS PALMEIRAS II'), 'Solar das Palmeiras II');
  const it = interpretarImplantacao(CSV);
  assert.equal(it.length, 8, 'lê os dois blocos (2026 e 2027)');
  const azul = it.find((x) => x.formulario === '10');
  assert.equal(azul.vigencia, '10/2026');
  assert.equal(azul.administradora, 'ADM ALFA');
  assert.equal(azul.forma_envio, 'IMPRESSO/E-MAIL');
  assert.equal(azul.vencimento, '5');
  assert.equal(azul.executivo, 'Edu Exec');
  assert.equal(azul.cnpj, '11.222.333/0001-81');
  const solar = it.find((x) => x.formulario === '11');
  assert.equal(solar.cnpj, '');
  assert.match(solar.cnpj_aviso, /cortado pelo Excel/);
  assert.match(it.find((x) => x.formulario === '13').cnpj_aviso, /sem CNPJ/);
  assert.equal(lerCnpj('1234567000195').cnpj, '01.234.567/0001-95', 'Excel tirou o zero da frente');
  assert.match(lerCnpj('11222333000182').aviso, /inválido/, 'dígito verificador');
  assert.equal(it.find((x) => x.formulario === '11').administradora, '');
  assert.match(it.find((x) => x.formulario === '12').ignorar, /desconsiderar/);
  assert.match(it.find((x) => x.formulario === '14').ignorar, /repetido/);
  assert.match(it.find((x) => x.formulario === '15').ignorar, /sem DATA CONTRATO/);
  assert.equal(it.find((x) => x.formulario === '17').vigencia, '01/2027');
  assert.throws(() => interpretarImplantacao(Buffer.from('a;b\n1;2')), /DATA CONTRATO/);
});

test('lê .xlsx do Excel (aba pelo workbook, textos compartilhados, data em número)', () => {
  const l = lerPlanilha(XLSX);
  assert.equal(l[3][1], 'Edifício Mar & Sol');
  const it = interpretarImplantacao(XLSX);
  assert.equal(it.length, 1);
  assert.equal(it[0].nome, 'Mar & Sol');
  assert.equal(it[0].comarca, 'PB');
  assert.equal(it[0].vigencia, '10/2026');
});

test('só administrador, coordenador e supervisor usam "Adicionar novos"', async () => {
  assert.equal((await comum('GET', '/api/carteira')).json.pode_adicionar, false);
  assert.equal((await coord('GET', '/api/carteira')).json.pode_adicionar, true);
  assert.equal((await comum('POST', '/api/carteira/implantacao/ler', CSV)).status, 403);
  assert.equal((await comum('POST', '/api/carteira/implantacao/adicionar', { itens: [{ codigo: '1', nome: 'X', inicio_contrato: '10/2026' }] })).status, 403);
});

test('compara com a carteira e adiciona só os escolhidos, com ID Vouch e responsáveis', async () => {
  const r = await coord('POST', '/api/carteira/implantacao/ler', CSV);
  assert.equal(r.status, 200, r.texto);
  const out = r.json.itens.filter((x) => x.vigencia === '10/2026' && !x.ignorar);
  assert.equal(out.find((x) => x.formulario === '13').carteira.situacao, 'existe', '"Condomínio Já Existente" = "Já Existente"');
  assert.equal(out.find((x) => x.formulario === '10').carteira.situacao, 'novo');

  const base1 = { nome: 'Jardim Azul', comarca: 'CE', vencimento: '5', administradora: 'ADM ALFA', forma_envio: 'IMPRESSO/E-MAIL', inicio_contrato: '10/2026' };
  // confere tudo antes de gravar: sem ID, ID repetido na carteira ou no envio → nada entra
  let a = await coord('POST', '/api/carteira/implantacao/adicionar', { itens: [{ ...base1, codigo: '' }, { ...base1, nome: 'Solar', codigo: '900' }, { ...base1, nome: 'A', codigo: '501' }, { ...base1, nome: 'B', codigo: '501' }] });
  assert.equal(a.status, 400);
  assert.deepEqual(a.json.erros.map((e) => e.indice), [0, 1, 3]);
  const cnpjCurto = await coord('POST', '/api/carteira/implantacao/adicionar', { itens: [{ ...base1, codigo: '777', cnpj: '6603630000' }] });
  assert.match(cnpjCurto.json.erro, /CNPJ incompleto/);
  assert.equal((await ctx.db.um('SELECT COUNT(*)::int AS n FROM condominios')).n, 1, 'nada gravado');

  a = await admin('POST', '/api/carteira/implantacao/adicionar', { itens: [
    { ...base1, codigo: '501', executivo: 'Edu Exec', cnpj: '11222333000181', analista_cobranca: 'ana lima - 4001', assistente_credito: 'CARLA DIAS - 4003', observacoes: 'Implantação: formulário nº 10' },
    { ...base1, nome: 'Solar das Palmeiras II', comarca: 'PB', codigo: '502' },
  ] });
  assert.equal(a.status, 201, a.texto);
  assert.equal(a.json.criados, 2);
  const c = (await admin('GET', `/api/carteira/${a.json.ids[0]}`)).json;
  assert.equal(c.condominio.codigo, '501');
  assert.equal(c.condominio.situacao, 'ATIVO');
  assert.equal(c.condominio.inicio_contrato, '2026-10-01');
  assert.equal(c.condominio.analista_cobranca, 'ANA LIMA - 4001');
  assert.equal(c.condominio.executivo, 'Edu Exec');
  assert.equal(c.condominio.cnpj, '11.222.333/0001-81');
  assert.equal(c.condominio.analista_extrajudicial, '');
  assert.equal(c.historico[0].acao, 'condominio_criado');
  // lida de novo, a planilha já mostra os dois como existentes
  const r2 = await admin('POST', '/api/carteira/implantacao/ler', CSV);
  assert.equal(r2.json.itens.find((x) => x.formulario === '10').carteira.situacao, 'existe');
  assert.equal(r2.json.itens.find((x) => x.formulario === '11').carteira.situacao, 'existe');
});

test('responsáveis: cada coordenador escolhe só o do setor dele', async () => {
  const setores = (await admin('GET', '/api/admin/usuarios')).json.setores;
  const cob = setores.find((x) => x.nome === 'Cobrança').id;
  const u = await admin('POST', '/api/admin/usuarios', { nome: 'Caio Cobrança', email: 'caio@teste.com', senha: 'Senha1234', papel: 'coordenador', setores: [cob] });
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [u.json.id]);
  const caio = await entrar('caio@teste.com', 'Senha1234');
  assert.deepEqual((await caio('GET', '/api/carteira')).json.funcoes_editaveis, ['analista_cobranca']);
  const item = { nome: 'Vila Nova', comarca: 'RN', inicio_contrato: '10/2026' };
  let r = await caio('POST', '/api/carteira/implantacao/adicionar', { itens: [{ ...item, codigo: '601', assistente_credito: 'CARLA DIAS - 4003' }] });
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /coordenador\/supervisor do setor/);
  r = await caio('POST', '/api/carteira/implantacao/adicionar', { itens: [{ ...item, codigo: '601', analista_cobranca: 'ANA LIMA - 4001' }] });
  assert.equal(r.status, 201, r.texto);
  // coordenadora da Implantação adiciona, mas não escolhe responsável de Cobrança/Crédito
  r = await coord('POST', '/api/carteira/implantacao/adicionar', { itens: [{ ...item, nome: 'Vila Velha', codigo: '602', analista_cobranca: 'ANA LIMA - 4001' }] });
  assert.equal(r.status, 400);
});

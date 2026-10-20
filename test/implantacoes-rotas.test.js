'use strict';
/* Implantação pelo portal: da análise liberada ao envio ao setor, com liberação do gestor, avisos e lembretes (dados fictícios). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx;
const emails = [];

function cliente() {
  let cookie = '';
  return async function req(metodo, url, corpo, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (cookie) headers.cookie = cookie;
    let body;
    if (corpo !== undefined) {
      if (Buffer.isBuffer(corpo)) { body = corpo; headers['content-type'] ||= 'application/octet-stream'; } else { body = JSON.stringify(corpo); headers['content-type'] = 'application/json'; }
    }
    const r = await fetch(base + url, { method: metodo, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    if (opts.bruto) return { status: r.status, headers: r.headers, buffer: Buffer.from(await r.arrayBuffer()) };
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

let admin, exec, gestorCr, coord, equipe, outro;
const ids = {};
async function pessoa(nome, email) {
  const r = await admin('POST', '/api/admin/usuarios', { nome, email, papel: 'usuario', senha: 'Senha1234' });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}
const noSetor = async (setor, email, lider) => {
  const s = await ctx.db.um('SELECT id FROM setores WHERE nome = $1', [setor]);
  await ctx.db.q('INSERT INTO setor_membros (setor_id, usuario_id, lider) VALUES ($1, $2, $3)', [s.id, ids[email], lider]);
};
const avisosDe = async (email) => (await ctx.db.q('SELECT titulo, texto, link FROM notificacoes WHERE usuario_id = $1 ORDER BY id', [ids[email]])).rows;
const emailsPara = (email) => emails.filter((m) => m.para.email === email);
const PDF = Buffer.from('%PDF-1.4\n% documento fictício\n');
const anexar = (c, id, tipo, nome = `${tipo}.pdf`) => c('POST', `/api/implantacoes/${id}/documentos`, PDF, { headers: { 'x-tipo': tipo, 'x-nome-arquivo': encodeURIComponent(nome) } });

const FORM_ANALISE = {
  razao_social: 'Condomínio Residencial Fictício', cnpj: '11.222.333/0001-81', uf: 'CE', cidade: 'Fortaleza', tipo_contratacao: 'nova',
  uh_total: 24, taxa_ordinaria: 1840, dia_vencimento: 10, desconto_pontualidade: { tipo: 'nenhum' }, sindico: { tipo: 'condomino', isencao: 'integral' },
  administradora: 'Administradora Exemplo',
};
/* análise já liberada ao executivo, há `dias` dias, com a convenção e o retorno em PDF */
let seq = 0;
async function analiseLiberada(dias, nome = 'Condomínio Residencial Fictício') {
  seq++;
  const { id } = await ctx.db.um(`INSERT INTO analises (protocolo, etapa, resultado, condominio, cnpj, uf, tipo_contratacao, executivo_id, solicitante_id, formulario,
      taxa_adm, boleto, enviada_em, liberada_em) VALUES ($1, 'enviada', 'aprovada', $2, '11.222.333/0001-81', 'CE', 'nova', $3, $4, $5::jsonb, 3, 2,
      now() - make_interval(days => $6), now() - make_interval(days => $6)) RETURNING id`,
  [`AC-2026-01-01-${String(seq).padStart(2, '0')}`, nome, ids.executivo, ids['exec@teste.com'], JSON.stringify({ ...FORM_ANALISE, razao_social: nome }), dias]);
  for (const tipo of ['convencao', 'retorno_pdf']) {
    await ctx.db.q("INSERT INTO analise_documentos (analise_id, tipo, nome, mime, tamanho, conteudo) VALUES ($1, $2, $3, 'application/pdf', $4, $5)", [id, tipo, `${tipo}.pdf`, PDF.length, PDF]);
  }
  return id;
}

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
  exec = await pessoa('Executiva Fictícia', 'exec@teste.com');
  gestorCr = await pessoa('Gestor do Crédito Fictício', 'gestorcr@teste.com');
  coord = await pessoa('Coordenadora Fictícia', 'coord@teste.com');
  equipe = await pessoa('Analista de Implantação Fictícia', 'equipe@teste.com');
  outro = await pessoa('Outra Pessoa', 'outro@teste.com');
  await noSetor('Análise de Crédito', 'gestorcr@teste.com', true);
  await noSetor('Implantação', 'coord@teste.com', true);
  await noSetor('Implantação', 'equipe@teste.com', false);
  const ex = await admin('POST', '/api/credito/executivos', { nome: 'Executiva Fictícia', uf: 'CE', regiao: 'Ceará', usuario_id: ids['exec@teste.com'] });
  assert.equal(ex.status, 201, ex.texto);
  ids.executivo = ex.json.id;
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

test('perfis: comercial, equipe, coordenação, gestor da Análise de Crédito e quem não tem acesso', async () => {
  const p = async (c) => (await c('GET', '/api/implantacoes/meta')).json.perfil;
  assert.equal((await p(exec)).executivo.id, ids.executivo);
  assert.deepEqual([(await p(coord)).coordenacao, (await p(coord)).equipe], [true, true]);
  assert.deepEqual([(await p(equipe)).coordenacao, (await p(equipe)).equipe], [false, true]);
  assert.equal((await p(gestorCr)).gestor_credito, true);
  assert.equal((await p(exec)).gestor_credito, false);
  assert.equal((await outro('GET', '/api/implantacoes/resumo')).json.acesso, false);
  assert.equal((await outro('GET', '/api/implantacoes/analises')).status, 403);
  assert.equal((await exec('GET', '/api/implantacoes?vis=fila')).status, 403);
  assert.equal((await gestorCr('GET', '/api/implantacoes/resumo')).json.acesso, true);
});

let idI;
test('a partir da análise: formulário preenchido, convenção e retorno vêm junto, e a análise sai da lista', async () => {
  const aid = await analiseLiberada(5);
  const lista = (await exec('GET', '/api/implantacoes/analises')).json;
  assert.equal(lista.validade_dias, 90);
  const a = lista.analises.find((x) => x.id === aid);
  assert.equal(a.situacao, 'valida');
  const r = await exec('POST', '/api/implantacoes', { origem: 'analise', analise_id: aid });
  assert.equal(r.status, 201, r.texto);
  idI = r.json.id;
  const d = (await exec('GET', `/api/implantacoes/${idI}`)).json;
  assert.equal(d.implantacao.etapa, 'rascunho');
  assert.equal(d.implantacao.formulario.nome, 'Condomínio Residencial Fictício');
  assert.equal(d.implantacao.formulario.taxa_adm, 3);
  assert.equal(d.implantacao.referencia.boleto, 2);
  assert.deepEqual(d.documentos.map((x) => x.tipo).sort(), ['analise_credito', 'convencao']);
  assert.ok(!(await exec('GET', '/api/implantacoes/analises')).json.analises.some((x) => x.id === aid));
  assert.equal((await exec('POST', '/api/implantacoes', { origem: 'analise', analise_id: aid })).status, 404);
  // a análise mostra a implantação aberta a partir dela
  assert.equal((await exec('GET', `/api/credito/analises/${aid}`)).json.implantacao.id, idI);
  assert.equal((await outro('GET', `/api/implantacoes/${idI}`)).status, 404);
});

test('análise com mais de 90 dias: o gestor da Análise de Crédito libera antes', async () => {
  const aid = await analiseLiberada(100, 'Edifício Teste Horizonte');
  const sit = async () => (await exec('GET', '/api/implantacoes/analises')).json.analises.find((x) => x.id === aid).situacao;
  assert.equal(await sit(), 'vencida');
  assert.equal((await exec('POST', '/api/implantacoes', { origem: 'analise', analise_id: aid })).status, 409);
  assert.equal((await exec('POST', '/api/implantacoes/liberacoes', { analise_id: aid, motivo: 'Contrato assinado com atraso' })).status, 201);
  assert.equal((await exec('POST', '/api/implantacoes/liberacoes', { analise_id: aid })).status, 409);
  assert.equal(await sit(), 'aguardando_gestor');
  const aviso = (await avisosDe('gestorcr@teste.com')).pop();
  assert.match(aviso.titulo, /Liberar análise para implantação/);
  assert.match(aviso.texto, /há 100 dias/);
  assert.equal((await gestorCr('GET', '/api/implantacoes/resumo')).json.liberacoes, 1);
  const lib = (await gestorCr('GET', '/api/implantacoes/liberacoes')).json.liberacoes[0];
  assert.equal((await exec('POST', `/api/implantacoes/liberacoes/${lib.id}/decidir`, { aprovar: true })).status, 403);
  assert.equal((await gestorCr('POST', `/api/implantacoes/liberacoes/${lib.id}/decidir`, { aprovar: false })).status, 400); // recusa pede motivo
  assert.equal((await gestorCr('POST', `/api/implantacoes/liberacoes/${lib.id}/decidir`, { aprovar: true })).status, 200);
  assert.match((await avisosDe('exec@teste.com')).pop().titulo, /Análise liberada para implantação/);
  assert.equal(await sit(), 'liberada');
  assert.equal((await exec('POST', '/api/implantacoes', { origem: 'analise', analise_id: aid })).status, 201);
});

const FORM = {
  nome: 'Condomínio Residencial Fictício', cnpj: '11.222.333/0001-81', uf: 'CE', cidade: 'Fortaleza', uh_total: 24, dia_vencimento: 10,
  sindico_tipo: 'condomino', sindico_isencao: 'integral', sindico_nome: 'Síndico Fictício', sindico_cpf: '111.444.777-35',
  sindico_email: 'sindico@exemplo.com', sindico_telefone: '(85) 90000-0000',
  taxa_adm: 3.5, boleto: 2, taxa_ordinaria: 1840, desconto_tipo: 'nenhum', inicio_contrato: '2026-11-01', honorarios: 12,
  garantias: ['Taxa ordinária', 'Taxa extraordinária'], parceria: 'sim', parceiros: [{ id: 'p-alfa', nome: 'Alfa Administradora' }],
  cashback: '5', cashback_receitas: ['Taxa administrativa'], antecipacao: 'nao',
  administradora: 'Administradora Exemplo', consultor_nome: 'Consultor Fictício', consultor_telefone: '(85) 90000-0001',
  contatos: [{ nome: 'Contato Fictício', funcao: 'Gerente predial', telefone: '(85) 90000-0002' }],
};

test('enviar: confere o que falta, gera o protocolo e avisa a coordenação, a equipe e o executivo', async () => {
  let env = await exec('POST', `/api/implantacoes/${idI}/enviar`, {});
  assert.equal(env.status, 400);
  assert.ok(env.json.faltas.some((f) => /Ata de eleição/.test(f)));
  assert.ok(env.json.faltas.some((f) => /nome do síndico/.test(f)));
  const p = await exec('PATCH', `/api/implantacoes/${idI}`, { formulario: FORM });
  assert.equal(p.status, 200, p.texto);
  assert.deepEqual(p.json.diferencas.map((x) => x.campo), ['taxa_adm']);
  for (const tipo of ['cadastro_moradores', 'ata_eleicao', 'ata_orcamento', 'documento_sindico']) assert.equal((await anexar(exec, idI, tipo)).status, 201);
  assert.equal((await anexar(exec, idI, 'qualquer')).status, 400);
  env = await exec('POST', `/api/implantacoes/${idI}/enviar`, {});
  assert.equal(env.status, 200, env.texto);
  assert.match(env.json.protocolo, /^IMP-\d{4}-\d{2}-\d{2}-01$/);
  assert.equal(env.json.etapa, 'fila');
  assert.deepEqual(env.json.pendencias, ['Conta bancária', 'Comprovante de endereço do síndico', 'Modelo do boleto anterior']);
  assert.match((await avisosDe('coord@teste.com')).pop().titulo, /^Nova implantação · IMP-/);
  assert.match((await avisosDe('equipe@teste.com')).pop().titulo, /^Chegou uma nova implantação/);
  assert.equal(emailsPara('coord@teste.com').length, 1);
  assert.equal(emailsPara('equipe@teste.com').length, 1);
  // o executivo recebe as pendências no sino (o e-mail é o lembrete diário)
  const pend = (await avisosDe('exec@teste.com')).pop();
  assert.match(pend.titulo, /^Pendências da implantação/);
  assert.match(pend.texto, /Conta bancária/);
  assert.equal(emailsPara('exec@teste.com').filter((m) => /Pendências/.test(m.subject)).length, 0);
  // depois de enviada, o formulário não muda mais pelo executivo
  assert.equal((await exec('PATCH', `/api/implantacoes/${idI}`, { formulario: FORM })).status, 403);
  const d = (await coord('GET', `/api/implantacoes/${idI}`)).json;
  assert.deepEqual(d.diferencas.map((x) => [x.campo, x.valor, x.analise]), [['taxa_adm', 3.5, 3]]);
});

test('listas: o executivo vê as suas; a fila é do setor; a coordenação conta o que chegou', async () => {
  const minhas = (await exec('GET', '/api/implantacoes?vis=minhas')).json.implantacoes;
  assert.ok(minhas.some((x) => x.id === idI && x.pendentes.length === 3));
  const fila = (await equipe('GET', '/api/implantacoes?vis=fila')).json.implantacoes;
  assert.deepEqual(fila.map((x) => x.id), [idI]);
  assert.equal((await coord('GET', '/api/implantacoes/resumo')).json.fila, 1);
  assert.equal((await outro('GET', '/api/implantacoes?vis=minhas')).json.implantacoes.length, 0);
});

test('documento pendente que chega avisa o setor; lembrete diário por e-mail ao executivo, uma vez por dia útil', async () => {
  assert.equal((await anexar(exec, idI, 'conta_bancaria')).status, 201);
  assert.match((await avisosDe('coord@teste.com')).pop().titulo, /^Documento chegou/);
  // próximo dia útil, 10h em Brasília
  const d = new Date();
  do d.setUTCDate(d.getUTCDate() + 1); while ([0, 6].includes(d.getUTCDay()));
  const amanha = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 0));
  const antes = emailsPara('exec@teste.com').length;
  assert.equal((await ctx.rotinasImplantacao.executar(amanha)).documentos, 1);
  await new Promise((ok) => setTimeout(ok, 20));
  const m = emailsPara('exec@teste.com').slice(antes);
  assert.equal(m.length, 1);
  assert.match(m[0].text, /Comprovante de endereço do síndico; Modelo do boleto anterior/);
  assert.ok(!/Conta bancária/.test(m[0].text));
  assert.equal((await ctx.rotinasImplantacao.executar(new Date(amanha.getTime() + 3600 * 1000))).documentos, 0);
  // fora do expediente não roda
  assert.equal((await ctx.rotinasImplantacao.executar(new Date(amanha.getTime() - 6 * 3600 * 1000))).documentos, 0);
});

test('parceiros da base de comissão para a lista suspensa', async () => {
  await ctx.registros.upsert('parceiros', 'partners', 'p-boa', { id: 'p-boa', nome: 'Boa Vista Gestão Fictícia', uf: 'PB' });
  await ctx.registros.upsert('parceiros', 'partners', 'p-alfa', { id: 'p-alfa', nome: 'Alfa Administradora Fictícia', uf: 'CE' });
  const r = (await exec('GET', '/api/implantacoes/parceiros')).json;
  assert.deepEqual(r.parceiros.map((x) => x.nome), ['Alfa Administradora Fictícia', 'Boa Vista Gestão Fictícia']);
  assert.equal(r.aviso, null);
});

test('cancelar: o executivo cancela o rascunho; a coordenação cancela depois do envio', async () => {
  const aid = await analiseLiberada(1, 'Residencial Fictício Aurora');
  const { id } = (await exec('POST', '/api/implantacoes', { origem: 'analise', analise_id: aid })).json;
  assert.equal((await equipe('POST', `/api/implantacoes/${id}/cancelar`, {})).status, 403); // rascunho é só do executivo
  assert.equal((await exec('POST', `/api/implantacoes/${id}/cancelar`, {})).status, 200);
  assert.ok((await exec('GET', '/api/implantacoes/analises')).json.analises.some((x) => x.id === aid)); // a análise volta a ficar disponível
  assert.equal((await exec('POST', `/api/implantacoes/${idI}/cancelar`, {})).status, 403);
});

/* ===================== parte 2: setor Implantação ===================== */
let idI2;
test('designar: só a coordenação, para alguém do setor; prazo de 8h úteis para iniciar', async () => {
  assert.equal((await equipe('POST', `/api/implantacoes/${idI}/designar`, { usuario_id: ids['equipe@teste.com'] })).status, 403);
  assert.equal((await coord('POST', `/api/implantacoes/${idI}/designar`, { usuario_id: ids['outro@teste.com'] })).status, 400);
  const r = await coord('POST', `/api/implantacoes/${idI}/designar`, { usuario_id: ids['equipe@teste.com'] });
  assert.equal(r.status, 200, r.texto);
  const i = (await equipe('GET', `/api/implantacoes/${idI}`)).json.implantacao;
  assert.equal(i.etapa, 'em_implantacao');
  assert.equal(i.responsavel_id, ids['equipe@teste.com']);
  assert.equal(new Date(i.prazo_inicio).getTime(), ctx.expediente.somarHorasUteis(new Date(i.designado_em), 8).getTime());
  const aviso = (await avisosDe('equipe@teste.com')).pop();
  assert.match(aviso.titulo, /^Implantação designada para você/);
  assert.match(aviso.texto, /8h úteis/);
  assert.equal((await equipe('GET', '/api/implantacoes/resumo')).json.minhas, 1);
});

test('rotinas: lembrete à coordenação a cada 4h úteis sem designação e aviso de prazo estourado (uma vez)', async () => {
  const aid = await analiseLiberada(2, 'Edifício Fictício Horizonte');
  idI2 = (await exec('POST', '/api/implantacoes', { origem: 'analise', analise_id: aid })).json.id;
  assert.equal((await exec('PATCH', `/api/implantacoes/${idI2}`, { formulario: { ...FORM, nome: 'Edifício Fictício Horizonte' } })).status, 200);
  for (const tipo of ['cadastro_moradores', 'ata_eleicao', 'ata_orcamento']) await anexar(exec, idI2, tipo);
  assert.equal((await exec('POST', `/api/implantacoes/${idI2}/enviar`, {})).status, 200);
  const daquiUmaSemana = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const r = await ctx.rotinasImplantacao.executar(daquiUmaSemana);
  assert.equal(r.sem_designacao, 1);
  assert.equal(r.prazos, 1);
  const coordAvisos = (await avisosDe('coord@teste.com')).map((x) => x.titulo);
  assert.ok(coordAvisos.some((t) => /^Ainda sem ninguém designado · .* · Edifício Fictício Horizonte/.test(t)));
  assert.ok(coordAvisos.some((t) => /^Passou do prazo para iniciar/.test(t)));
  assert.match((await avisosDe('equipe@teste.com')).pop().titulo, /^Passou do prazo para iniciar/);
  const novo = await ctx.rotinasImplantacao.executar(daquiUmaSemana);
  assert.deepEqual([novo.sem_designacao, novo.prazos], [0, 0]);
});

test('iniciar, conferências do setor e as 5 etapas', async () => {
  assert.equal((await coord('POST', `/api/implantacoes/${idI}/iniciar`, {})).status, 403); // só quem foi designado
  assert.equal((await equipe('PATCH', `/api/implantacoes/${idI}/etapas`, { etapas: {} })).status, 403); // antes de iniciar
  assert.equal((await equipe('POST', `/api/implantacoes/${idI}/iniciar`, {})).status, 200);
  // cadastro de moradores em CSV: 2 unidades, um CPF inválido na linha 3
  const csv = Buffer.from('Unidade;Nome;CPF\n101;Morador Fictício 1;111.444.777-35\n102;Morador Fictício 2;123.456.789-00\n');
  assert.equal((await exec('POST', `/api/implantacoes/${idI}/documentos`, csv, { headers: { 'x-tipo': 'cadastro_moradores', 'x-nome-arquivo': 'cadastro.csv', 'content-type': 'text/csv' } })).status, 201);
  let d = (await equipe('GET', `/api/implantacoes/${idI}`)).json;
  assert.deepEqual(d.conferencias.cadastro, { unidades: 2, tem_documento: true, documentos_invalidos: [3], sem_documento: 0, unidades_formulario: 24 });
  assert.equal(d.conferencias.cpf_sindico, true);
  assert.deepEqual(d.conferencias.diferencas.map((x) => x.campo), ['taxa_adm']);
  assert.equal(d.faltas_etapas.length, 5);
  assert.equal((await exec('PATCH', `/api/implantacoes/${idI}/etapas`, { etapas: {} })).status, 403);
  let r = await equipe('PATCH', `/api/implantacoes/${idI}/etapas`, { etapas: { documentacao: { feito: true }, vouch: { id: '90001' }, onboarding: { situacao: 'marcado', data: '2026-10-23 15:00' } } });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.faltas.length, 3);
  assert.equal((await equipe('POST', `/api/implantacoes/${idI}/concluir`, {})).status, 400);
});

test('pendência: volta ao executivo e o reenvio volta para quem conduz', async () => {
  const r = await equipe('POST', `/api/implantacoes/${idI}/pendencia`, { itens: ['Enviar a ata de eleição assinada'] });
  assert.equal(r.status, 200, r.texto);
  const aviso = (await avisosDe('exec@teste.com')).pop();
  assert.match(aviso.titulo, /^Pendência na implantação/);
  assert.match(aviso.texto, /ata de eleição assinada/);
  assert.equal((await exec('PATCH', `/api/implantacoes/${idI}`, { formulario: { ...FORM, observacoes: 'Ata enviada' } })).status, 200);
  const env = await exec('POST', `/api/implantacoes/${idI}/enviar`, {});
  assert.equal(env.json.etapa, 'em_implantacao');
  assert.match((await avisosDe('equipe@teste.com')).pop().titulo, /^Pendência respondida/);
  assert.ok((await equipe('GET', `/api/implantacoes/${idI}`)).json.pode.etapas); // segue iniciada
});

test('concluir: aviso à coordenação e ao setor Parceiros, e o condomínio entra na base de comissão com o parceiro', async () => {
  await pessoa('Parceiros Fictício', 'parceiros@teste.com');
  await noSetor('Parceiros', 'parceiros@teste.com', false);
  const r0 = await equipe('PATCH', `/api/implantacoes/${idI}/etapas`, { etapas: { documentacao: { feito: true }, vouch: { id: '90001' }, onboarding: { situacao: 'realizado' }, boletos: { feito: true }, envio: { forma: 'email' } } });
  assert.deepEqual(r0.json.faltas, []);
  const r = await equipe('POST', `/api/implantacoes/${idI}/concluir`, {});
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.parceiros.criado, 'Condomínio Residencial Fictício');
  const condo = await ctx.registros.obter('parceiros', 'condos', 'c-condominioresidencialficticio');
  assert.deepEqual(JSON.parse(condo.vinculosJSON), [{ partnerId: 'p-alfa', rate: 0 }]);
  assert.equal(condo.valorBoleto, 2);
  const ap = (await avisosDe('parceiros@teste.com')).pop();
  assert.match(ap.titulo, /^Condomínio novo com parceiro/);
  assert.match(ap.texto, /Alfa Administradora/);
  assert.match((await avisosDe('coord@teste.com')).pop().titulo, /^Pronta para a Carteira/);
  assert.equal((await coord('GET', '/api/implantacoes/resumo')).json.carteira, 1);
});

test('Carteira: a coordenação confere os dados (ID Vouch e envio vêm das etapas) e confirma', async () => {
  assert.equal((await equipe('GET', `/api/implantacoes/${idI}/carteira`)).status, 403);
  const p = (await coord('GET', `/api/implantacoes/${idI}/carteira`)).json;
  assert.deepEqual([p.dados.codigo, p.dados.nome, p.dados.comarca, p.dados.forma_envio, p.dados.vencimento, p.dados.inicio_contrato],
    ['90001', 'Fictício', 'CE', 'E-MAIL', '10', '2026-11-01']);
  assert.deepEqual(p.duplicados, []);
  const r = await coord('POST', `/api/implantacoes/${idI}/carteira`, { dados: { ...p.dados, nome: 'Residencial Fictício' } });
  assert.equal(r.status, 201, r.texto);
  const c = await ctx.db.um('SELECT * FROM condominios WHERE id = $1', [r.json.condominio_id]);
  assert.deepEqual([c.codigo, c.nome, c.comarca, c.forma_envio, c.cnpj, String(c.inicio_contrato instanceof Date ? c.inicio_contrato.toISOString().slice(0, 10) : c.inicio_contrato).slice(0, 10)],
    ['90001', 'Residencial Fictício', 'CE', 'E-MAIL', '11.222.333/0001-81', '2026-11-01']);
  assert.equal((await coord('GET', `/api/implantacoes/${idI}`)).json.implantacao.etapa, 'na_carteira');
  assert.equal((await coord('POST', `/api/implantacoes/${idI}/carteira`, { dados: p.dados })).status, 403);
  // o mesmo ID Vouch não entra em outra implantação
  await coord('POST', `/api/implantacoes/${idI2}/designar`, { usuario_id: ids['equipe@teste.com'] });
  await equipe('POST', `/api/implantacoes/${idI2}/iniciar`, {});
  assert.equal((await equipe('PATCH', `/api/implantacoes/${idI2}/etapas`, { etapas: { vouch: { id: '90001' } } })).status, 409);
});

/* ===================== parte 3: condomínio de entrega e análise anterior ao portal ===================== */
let diretor;
test('condomínio de entrega: a diretoria aprova taxa e boleto; sem CNPJ e documentos chegam depois', async () => {
  diretor = await pessoa('Diretor Fictício', 'diretor@teste.com');
  assert.equal((await admin('PUT', '/api/credito/diretoria', { pessoas: [ids['diretor@teste.com']] })).status, 200);
  const { id } = (await exec('POST', '/api/implantacoes', { origem: 'entrega' })).json;
  let d = (await exec('GET', `/api/implantacoes/${id}`)).json;
  assert.equal(d.implantacao.origem, 'entrega');
  assert.ok(d.pode.pedir_diretoria);
  assert.deepEqual(d.documentos_obrigatorios, []);
  assert.ok(d.faltas[0].startsWith('Pedir a aprovação da diretoria'));
  let r = await exec('POST', `/api/implantacoes/${id}/diretoria`, {});
  assert.equal(r.status, 400);
  assert.ok(r.json.faltas.some((f) => /construtora/.test(f)));
  const ENTREGA = { ...FORM, nome: 'Condomínio Modelo Fictício', cnpj: '', sem_cnpj: true, entrega: true, construtora: 'Construtora Exemplo', construtora_contato: 'contato@exemplo.com',
    uh_total: 120, taxa_ordinaria: 650, taxa_adm: 3.5, boleto: 2 };
  assert.equal((await exec('PATCH', `/api/implantacoes/${id}`, { formulario: ENTREGA })).status, 200);
  assert.equal((await exec('POST', `/api/implantacoes/${id}/diretoria`, {})).status, 200);
  assert.match((await avisosDe('diretor@teste.com')).pop().titulo, /^Aprovar taxa e boleto · condomínio de entrega/);
  assert.equal((await exec('PATCH', `/api/implantacoes/${id}`, { formulario: ENTREGA })).status, 403); // com a diretoria não muda
  assert.equal((await diretor('GET', '/api/implantacoes?vis=diretoria')).json.implantacoes[0].id, id);
  assert.equal((await diretor('GET', '/api/implantacoes/resumo')).json.diretoria, 1);
  assert.equal((await exec('POST', `/api/implantacoes/${id}/aprovacao`, { aprovar: true, taxa_adm: 3, boleto: 2 })).status, 403);
  assert.equal((await diretor('POST', `/api/implantacoes/${id}/aprovacao`, { aprovar: false })).status, 400);
  r = await diretor('POST', `/api/implantacoes/${id}/aprovacao`, { aprovar: true, taxa_adm: 3.25, boleto: 2 });
  assert.equal(r.status, 200, r.texto);
  assert.match((await avisosDe('exec@teste.com')).pop().titulo, /^Taxa e boleto aprovados/);
  d = (await exec('GET', `/api/implantacoes/${id}`)).json;
  assert.equal(d.implantacao.etapa, 'rascunho');
  assert.equal(d.implantacao.formulario.taxa_adm, 3.25);
  assert.deepEqual(d.diferencas, []);
  // sem CNPJ e sem os documentos de enxoval: envia, e tudo vira pendência
  const env = await exec('POST', `/api/implantacoes/${id}/enviar`, {});
  assert.equal(env.status, 200, env.texto);
  assert.equal(env.json.pendencias[0], 'CNPJ do condomínio');
  assert.ok(env.json.pendencias.includes('Convenção do condomínio'));
  assert.match((await avisosDe('coord@teste.com')).find((x) => /Condomínio Modelo Fictício/.test(x.titulo)).texto, /condomínio de entrega/);
});

const temLeitor = (() => { try { require('child_process').execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); require('child_process').execFileSync('python3', ['-c', 'import reportlab'], { stdio: 'ignore' }); return true; } catch { return false; } })();
async function retornoFicticio(protocolo) {
  const R = require('../server/credito/retorno');
  const { analisar } = require('../server/credito/motor');
  const lanc = (c, valor) => ({ competencia: c, vencimento: `${c}-10`, tipo: 'ordinaria', valor });
  const formulario = { razao_social: 'Residencial Fictício Antigo', cnpj: '11.444.777/0001-61', uf: 'PB', cidade: 'Cidade Exemplo', tipo_contratacao: 'nova',
    executivo: { nome: 'Executiva Fictícia', uf: 'PB' }, uh_total: 30, taxa_ordinaria: 500, dia_vencimento: 5, desconto_pontualidade: { tipo: 'nenhum' }, sindico: { tipo: 'profissional', isencao: 'nao' } };
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const meses = [3, 2, 1].map((k) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - k); return d.toISOString().slice(0, 7); });
  const r = analisar({ formulario, convencao: { presente: true, registro: 'RI', uh: 30 }, relatorio: { presente: true, data_emissao: hoje, tem_competencia: true, tem_nomes: true,
    unidades: [{ unidade: '101', titular: 'Titular Fictício', lancamentos: meses.map((c) => lanc(c, 500)) }] } }, undefined, { hoje });
  return (await R.gerarPdf(R.montarDados(r, { formulario, protocolo, analista: 'Analista Fictício', emissao: hoje }))).pdf;
}

test('análise anterior ao portal: o portal lê o PDF do retorno, confere e abre a implantação', { skip: !temLeitor && 'pdftotext ou reportlab não instalados' }, async () => {
  const pdf = await retornoFicticio('AC-2026-0915');
  const enviar = (c, acao, extra = {}) => c('POST', `/api/implantacoes/pdf?acao=${acao}`, pdf, { headers: { 'content-type': 'application/pdf', 'x-nome-arquivo': 'retorno.pdf', ...extra } });
  assert.equal((await outro('POST', '/api/implantacoes/pdf?acao=ler', pdf)).status, 403);
  assert.equal((await exec('POST', '/api/implantacoes/pdf?acao=ler', Buffer.from('não é pdf'))).status, 400);
  const lido = (await enviar(exec, 'ler')).json;
  assert.equal(lido.situacao, 'valida');
  assert.deepEqual([lido.lido.protocolo, lido.lido.razao_social, lido.lido.cnpj, lido.lido.resultado, lido.lido.uh_total, lido.lido.taxa_ordinaria],
    ['AC-2026-0915', 'Residencial Fictício Antigo', '11.444.777/0001-61', 'aprovada', 30, 500]);
  assert.ok(lido.lido.taxa_adm > 0 && lido.lido.boleto === 2);
  const r = await enviar(exec, 'criar');
  assert.equal(r.status, 201, r.texto);
  const d = (await exec('GET', `/api/implantacoes/${r.json.id}`)).json;
  assert.equal(d.implantacao.origem, 'pdf');
  assert.equal(d.implantacao.analise_protocolo, 'AC-2026-0915');
  assert.equal(d.implantacao.formulario.taxa_ordinaria, 500);
  assert.equal(d.implantacao.referencia.taxa_adm, lido.lido.taxa_adm);
  assert.deepEqual(d.documentos.map((x) => x.tipo), ['analise_credito']);
  assert.match(d.implantacao.formulario.observacoes, /Próximos passos da análise/);
  assert.equal((await enviar(exec, 'criar')).status, 409); // o mesmo PDF não abre duas
});

test('análise anterior ao portal com mais de 90 dias: liberação do gestor pelo próprio PDF', { skip: !temLeitor && 'pdftotext ou reportlab não instalados' }, async () => {
  const pdf = await retornoFicticio('AC-2025-0101');
  // a data do retorno é a de hoje; para simular uma análise antiga, o pedido vai com a data de 100 dias atrás
  const leitor = require('../server/implantacoes/pdf');
  const original = leitor.lerRetorno;
  const antiga = new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  leitor.lerRetorno = (t) => ({ ...original(t), data: antiga });
  try {
    const enviar = (acao, extra = {}) => exec('POST', `/api/implantacoes/pdf?acao=${acao}`, pdf, { headers: { 'content-type': 'application/pdf', ...extra } });
    assert.equal((await enviar('ler')).json.situacao, 'vencida');
    assert.equal((await enviar('criar')).status, 409);
    assert.equal((await enviar('liberar', { 'x-motivo': encodeURIComponent('Contrato assinado depois') })).status, 201);
    assert.equal((await enviar('ler')).json.situacao, 'aguardando_gestor');
    const lib = (await gestorCr('GET', '/api/implantacoes/liberacoes')).json.liberacoes.find((x) => x.protocolo === 'AC-2025-0101');
    assert.equal(lib.do_pdf, true);
    assert.equal((await gestorCr('POST', `/api/implantacoes/liberacoes/${lib.id}/decidir`, { aprovar: true })).status, 200);
    assert.equal((await enviar('criar')).status, 201);
  } finally { leitor.lerRetorno = original; }
});

test('formulário em PDF: quem vê a implantação exporta, com as seções, a parceria e o andamento do setor', { skip: !temLeitor && 'pdftotext ou reportlab não instalados' }, async () => {
  assert.equal((await outro('GET', `/api/implantacoes/${idI}/formulario.pdf`, undefined, { bruto: true })).status, 404);
  const r = await exec('GET', `/api/implantacoes/${idI}/formulario.pdf`, undefined, { bruto: true });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.equal(r.buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  const texto = require('child_process').execFileSync('pdftotext', ['-', '-'], { input: r.buffer }).toString();
  for (const trecho of [/IMP-\d{4}-\d{2}-\d{2}-01/, /Condomínio Residencial Fictício/, /Diferente da análise/, /3,50% \(análise: 3,00%\)/, /Alfa Administradora/, /definido pelo setor Parceiros/,
    /ANDAMENTO NO SETOR/, /ID 90001/, /Contato Fictício/]) assert.match(texto, trecho);
});

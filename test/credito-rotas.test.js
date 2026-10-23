'use strict';
/* Análise de Crédito pelo portal: do pedido do executivo ao retorno, com diretoria, pendência e reanálise (dados fictícios). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { execFileSync } = require('child_process');
const { criarApp, lerConfig } = require('../server/index');

let servidor, base, ctx;
const emails = [];
// leitor de PDF de mentira (no lugar da API Claude), ligado só no teste da leitura
let iaLigada = false;
const lidos = [];
const extratorCredito = {
  get ativo() { return iaLigada; },
  async ler(tipo, pdf) {
    lidos.push(tipo);
    if (tipo === 'convencao') return { dados: { registro: 'RI', cartorio: '1º Registro de Imóveis', matricula: '12.345', uh: 24, foro: 'Fortaleza', multa_pct: 2, clausula_restritiva: '', regras_taxa_extra: '', observacoes: [],
      fontes: { registro: { pagina: 38, trecho: 'registrada no Livro 3' }, uh: { pagina: 3, trecho: '24 unidades' }, foro: { pagina: 40, trecho: 'Comarca de Fortaleza' }, multa: { pagina: 17, trecho: 'multa de 2%' } } }, uso: { entrada: 1, saida: 1 } };
    const meses = mesesBase().map((c) => c.split('/').reverse().join('-'));
    return { dados: { sistema: 'Superlógica', data_emissao: hojeIso(), fonte_emissao: { pagina: 1, trecho: 'Emitido em' }, tem_competencia: true, tem_nomes: true, periodo_inicio: null, legivel: true, observacoes: [],
      unidades: [{ unidade: 'A-101', titular: 'Titular Fictício 1', documento: '111.111.111-11', tipo_pessoa: 'PF', flag: '', espolio: false, pagina: 2,
        lancamentos: meses.flatMap((c) => [{ competencia: c, vencimento: c + '-10', tipo: 'ordinaria', valor: 2800 }, { competencia: c, vencimento: null, tipo: 'multa', valor: 56 }]) }] }, uso: { entrada: 1, saida: 1 } };
  },
};
let temGerador = true;
try { execFileSync(process.env.PYTHON || 'python3', ['-c', 'import reportlab'], { stdio: 'ignore' }); } catch { temGerador = false; }

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

let admin, exec, analista, diretor, outro;
const ids = {};
async function pessoa(nome, email) {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel: 'usuario', senha: 'Senha1234' });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}
const avisosDe = async (email) => (await ctx.db.q('SELECT titulo, texto, link FROM notificacoes WHERE usuario_id = $1 ORDER BY id', [ids[email]])).rows;
const PDF = Buffer.from('%PDF-1.4\n% documento fictício\n');
const anexar = (c, id, tipo, nome = `${tipo}.pdf`) => c('POST', `/api/credito/analises/${id}/documentos`, PDF, { headers: { 'x-tipo': tipo, 'x-nome-arquivo': encodeURIComponent(nome) } });

const FORM = {
  razao_social: 'Condomínio Residencial Fictício', cnpj: '11.222.333/0001-81', uf: 'CE', cidade: 'Fortaleza', tipo_contratacao: 'nova',
  uh_total: 24, taxa_ordinaria: 1840, dia_vencimento: 10, desconto_pontualidade: { tipo: 'nenhum' },
  taxas_extras: [{ descricao: 'Reforma da fachada', valor_por_uh: 700, inicio: '2026-01', fim: '2026-12', ata: true }], sindico: { tipo: 'condomino', isencao: 'integral' },
};
/* relatório colado: competências dos 3 meses fechados antes do mês de hoje, emitido hoje */
function mesesBase() {
  const hoje = new Date();
  return [3, 2, 1].map((k) => { const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - k, 1)); return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; });
}
const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
function planilha(valor) {
  const linhas = ['Unidade;Titular;Documento;Competência;Tipo;Valor'];
  for (const c of mesesBase()) {
    linhas.push(`A-101;Titular Fictício 1;111.111.111-11;${c};Taxa ordinária;${valor}`);
    linhas.push(`A-101;Titular Fictício 1;111.111.111-11;${c};Multa;36,80`);
  }
  return linhas.join('\n');
}

before(async () => {
  const cfg = lerConfig({ dataDir: ':memoria:', databaseUrl: '', adminEmail: 'admin@teste.com', adminSenha: 'Admin1234', silencioso: true, porta: 0,
    portalUrl: 'https://portal.teste', enviarEmail: async (msg) => { emails.push(msg); }, extratorCredito });
  const r = await criarApp(cfg);
  ctx = r.ctx;
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE');
  servidor = http.createServer(r.app);
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  admin = await entrar('admin@teste.com', 'Admin1234');
  exec = await pessoa('Executiva Fictícia', 'exec@teste.com');
  analista = await pessoa('Analista Fictício', 'analista@teste.com');
  diretor = await pessoa('Diretor Fictício', 'diretor@teste.com');
  outro = await pessoa('Outra Pessoa', 'outro@teste.com');
  const setor = await ctx.db.um("SELECT id FROM setores WHERE nome = 'Análise de Crédito'");
  await ctx.db.q('INSERT INTO setor_membros (setor_id, usuario_id) VALUES ($1, $2)', [setor.id, ids['analista@teste.com']]);
  const ex = await admin('POST', '/api/credito/executivos', { nome: 'Executiva Fictícia', uf: 'CE', regiao: 'Ceará', usuario_id: ids['exec@teste.com'] });
  assert.equal(ex.status, 201, ex.texto);
  ids.executivo = ex.json.id;
  assert.equal((await admin('PUT', '/api/credito/diretoria', { pessoas: [ids['diretor@teste.com']] })).status, 200);
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

test('perfis: executivo, analista (setor Análise de Crédito), diretoria e quem não tem acesso', async () => {
  assert.deepEqual((await exec('GET', '/api/credito/meta')).json.perfil, { admin: false, analista: false, diretoria: false, executivo: { id: ids.executivo, nome: 'Executiva Fictícia', uf: 'CE', regiao: 'Ceará', boleto: null } });
  const a = (await analista('GET', '/api/credito/meta')).json.perfil;
  assert.equal(a.analista, true);
  assert.equal(a.diretoria, false);
  assert.equal((await diretor('GET', '/api/credito/meta')).json.perfil.diretoria, true);
  assert.equal((await outro('GET', '/api/credito/resumo')).json.acesso, false);
  assert.equal((await outro('POST', '/api/credito/analises', { formulario: FORM })).status, 403);
  assert.equal((await exec('GET', '/api/credito/analises?vis=fila')).status, 403);
  assert.equal((await analista('POST', '/api/credito/executivos', { nome: 'X' })).status, 403); // cadastro é da administração
});

let idA;
test('executivo pede, o envio confere o que falta, e o analista é avisado com o prazo', async () => {
  const r = await exec('POST', '/api/credito/analises', { formulario: { ...FORM, cnpj: '11.111.111/1111-11' } });
  assert.equal(r.status, 201, r.texto);
  idA = r.json.id;
  let env = await exec('POST', `/api/credito/analises/${idA}/enviar`, {});
  assert.equal(env.status, 400);
  assert.ok(env.json.faltas.some((f) => /CNPJ/.test(f)));
  assert.ok(env.json.faltas.some((f) => /relatório/.test(f)));
  assert.ok(env.json.faltas.some((f) => /convenção/.test(f)));
  assert.equal((await exec('PATCH', `/api/credito/analises/${idA}`, { formulario: FORM })).status, 200);
  assert.equal((await anexar(exec, idA, 'relatorio')).status, 201);
  assert.equal((await anexar(exec, idA, 'convencao')).status, 201);
  assert.equal((await outro('GET', `/api/credito/analises/${idA}`)).status, 404);
  env = await exec('POST', `/api/credito/analises/${idA}/enviar`, {});
  assert.equal(env.status, 200, env.texto);
  assert.match(env.json.protocolo, /^AC-\d{4}-\d{2}-\d{2}-01$/);
  assert.equal(env.json.etapa, 'fila');
  const av = await avisosDe('analista@teste.com');
  assert.match(av.at(-1).titulo, /^Nova análise de crédito · AC-/);
  assert.equal(av.at(-1).link, `#/credito/${idA}`);
  assert.equal((await exec('PATCH', `/api/credito/analises/${idA}`, { formulario: FORM })).status, 403); // enviada: não muda mais
  const fila = (await analista('GET', '/api/credito/analises?vis=fila')).json.analises;
  assert.equal(fila[0].id, idA);
});

test('analista assume, cola o relatório, calcula; o executivo não vê o cálculo antes do envio', async () => {
  assert.equal((await analista('POST', `/api/credito/analises/${idA}/calcular`, {})).status, 403); // ainda não assumiu
  assert.equal((await analista('POST', `/api/credito/analises/${idA}/assumir`, {})).status, 200);
  const colado = await analista('POST', `/api/credito/analises/${idA}/relatorio-colado`, { texto: planilha('2.800,00') });
  assert.equal(colado.status, 200, colado.texto);
  assert.equal(colado.json.unidades.length, 1);
  assert.equal((await analista('POST', `/api/credito/analises/${idA}/calcular`, {})).status, 400); // relatório ainda não lançado
  const dados = { convencao: { registro: 'RI', uh: 24 }, relatorio: { data_emissao: hojeIso(), unidades: colado.json.unidades } };
  assert.equal((await analista('PATCH', `/api/credito/analises/${idA}`, { dados_analista: { ...dados, ajustes: { taxa_adm: { valor: 2.5 } } } })).status, 400); // ajuste sem justificativa
  assert.equal((await analista('PATCH', `/api/credito/analises/${idA}`, { dados_analista: dados })).status, 200);
  const calc = await analista('POST', `/api/credito/analises/${idA}/calcular`, {});
  assert.equal(calc.status, 200, calc.texto);
  // 2.800 / (23 × 2.540) = 4,79% → 2,00% + R$ 2,00
  assert.equal(calc.json.resultado.status.rotulo, 'APROVADA');
  assert.equal(calc.json.resultado.precificacao.taxa_adm, 2);
  const visto = (await exec('GET', `/api/credito/analises/${idA}`)).json;
  assert.equal(visto.analise.dados_analista, undefined);
  assert.equal(visto.analise.resultado_motor, undefined);
  assert.equal(visto.analise.taxa_adm, null);
  const unidades = await ctx.db.q('SELECT count(*)::int AS n FROM analise_lancamentos l JOIN analise_unidades u ON u.id = l.unidade_id WHERE u.analise_id = $1', [idA]);
  assert.equal(unidades.rows[0].n, 6);
});

test('liberar gera o retorno em PDF, avisa o executivo e permite pedir reanálise', { skip: !temGerador && 'python3 com reportlab não instalado' }, async () => {
  const lib = await analista('POST', `/api/credito/analises/${idA}/liberar`, {});
  assert.equal(lib.status, 200, lib.texto);
  assert.equal(lib.json.email.assunto, 'Retorno de Análise de Crédito — Condomínio Residencial Fictício');
  assert.match(lib.json.email.corpo, /Status: APROVADA — 2,00% ADM \+ R\$ 2,00\/boleto \| 23 UH no escopo\./);
  const av = await avisosDe('exec@teste.com');
  assert.equal(av.at(-1).titulo, 'Retorno de Análise de Crédito — Condomínio Residencial Fictício');
  assert.ok(emails.some((e) => e.subject === 'Retorno de Análise de Crédito — Condomínio Residencial Fictício'));
  const det = (await exec('GET', `/api/credito/analises/${idA}`)).json;
  assert.equal(det.analise.etapa, 'enviada');
  assert.equal(det.analise.resultado, 'aprovada');
  const pdf = det.documentos.find((d) => d.tipo === 'retorno_pdf');
  assert.match(pdf.nome, /^Retorno_Analise_Credito_Residencial_Ficticio_AC-/);
  const arq = await exec('GET', `/api/credito/analises/${idA}/documentos/${pdf.id}?ver=1`, undefined, { bruto: true });
  assert.equal(arq.headers.get('content-type'), 'application/pdf');
  assert.equal(arq.buffer.subarray(0, 5).toString(), '%PDF-');
  assert.equal(det.pode.reanalise, true);

  const re = await exec('POST', `/api/credito/analises/${idA}/reanalise`, { motivo: 'Relatório novo' });
  assert.equal(re.status, 201, re.texto);
  const nova = (await exec('GET', `/api/credito/analises/${re.json.id}`)).json;
  assert.equal(nova.analise.origem_id, idA);
  assert.equal(nova.analise.etapa, 'rascunho');
  assert.equal(nova.analise.protocolo, null); // o protocolo novo sai no envio
  assert.deepEqual(nova.documentos.map((d) => d.tipo), ['convencao']); // a convenção vai junto; o relatório é novo
  assert.ok(nova.faltas.some((f) => /relatório/.test(f)));
});

test('pendência devolve ao executivo, para o prazo, e o reenvio volta para o mesmo analista', async () => {
  const r = await exec('POST', '/api/credito/analises', { formulario: FORM });
  const id = r.json.id;
  await anexar(exec, id, 'relatorio');
  await anexar(exec, id, 'convencao');
  await exec('POST', `/api/credito/analises/${id}/enviar`, {});
  await analista('POST', `/api/credito/analises/${id}/assumir`, {});
  const p = await analista('POST', `/api/credito/analises/${id}/pendencia`, { itens: ['Relatório detalhado por competência'] });
  assert.equal(p.status, 200, p.texto);
  assert.match(p.json.mensagem, /1\. Relatório detalhado por competência/);
  let det = (await exec('GET', `/api/credito/analises/${id}`)).json;
  assert.equal(det.analise.etapa, 'pendencia');
  assert.equal(det.analise.prazo_analista, null);
  assert.equal(det.pode.documentos, true);
  assert.match((await avisosDe('exec@teste.com')).at(-1).titulo, /^Pendência na análise de crédito/);
  await anexar(exec, id, 'relatorio', 'relatorio-detalhado.pdf');
  const env = await exec('POST', `/api/credito/analises/${id}/enviar`, {});
  assert.equal(env.json.etapa, 'em_analise');
  det = (await analista('GET', `/api/credito/analises/${id}`)).json;
  assert.equal(det.analise.analista_id, ids['analista@teste.com']);
  assert.equal(det.documentos.filter((d) => d.tipo === 'relatorio' && !d.substituido_em).length, 1);
  assert.match((await avisosDe('analista@teste.com')).at(-1).titulo, /^Pendência respondida/);
});

test('inadimplência acima de 35%: só libera depois da chancela da diretoria', { skip: !temGerador && 'python3 com reportlab não instalado' }, async () => {
  const r = await exec('POST', '/api/credito/analises', { formulario: FORM });
  const id = r.json.id;
  await anexar(exec, id, 'relatorio');
  await anexar(exec, id, 'convencao');
  await exec('POST', `/api/credito/analises/${id}/enviar`, {});
  await analista('POST', `/api/credito/analises/${id}/assumir`, {});
  const colado = (await analista('POST', `/api/credito/analises/${id}/relatorio-colado`, { texto: planilha('21.500,00') })).json; // 36,8%
  await analista('PATCH', `/api/credito/analises/${id}`, { dados_analista: { convencao: { registro: 'RI', uh: 24 }, relatorio: { data_emissao: hojeIso(), unidades: colado.unidades } } });
  assert.equal((await analista('POST', `/api/credito/analises/${id}/liberar`, {})).status, 400);
  const d = await analista('POST', `/api/credito/analises/${id}/diretoria`, {});
  assert.equal(d.status, 200, d.texto);
  assert.match((await avisosDe('diretor@teste.com')).at(-1).titulo, /^Chancela da diretoria/);
  assert.equal((await diretor('GET', '/api/credito/analises?vis=diretoria')).json.analises[0].id, id);
  assert.equal((await analista('POST', `/api/credito/analises/${id}/chancela`, { aprovar: true })).status, 403);
  assert.equal((await diretor('POST', `/api/credito/analises/${id}/chancela`, { aprovar: true, observacao: 'De acordo' })).status, 200);
  const lib = await analista('POST', `/api/credito/analises/${id}/liberar`, {});
  assert.equal(lib.status, 200, lib.texto);
  assert.match(lib.json.email.corpo, /APROVADA COM RESSALVAS — 6,00% ADM/);
});

test('administração: executivos com boleto próprio e nova versão da política', async () => {
  assert.equal((await admin('PATCH', `/api/credito/executivos/${ids.executivo}`, { nome: 'Executiva Fictícia', uf: 'MA', boleto: '5,50', usuario_id: ids['exec@teste.com'] })).status, 200);
  assert.equal((await exec('GET', '/api/credito/meta')).json.perfil.executivo.boleto, '5.50');
  assert.equal((await admin('POST', '/api/credito/politica', { versao: '1.2.2' })).status, 409);
  assert.equal((await admin('POST', '/api/credito/politica', { versao: '1.3-teste', faixas: [{ ate: 10, taxa_adm: 2 }] })).status, 400); // não cobre até 40%
  const nova = await admin('POST', '/api/credito/politica', { versao: '1.3-teste', descricao: 'teste', parametros: { boleto_padrao: 2.5 } });
  assert.equal(nova.status, 201, nova.texto);
  const pol = (await analista('GET', '/api/credito/politica')).json;
  assert.equal(pol.ativa.versao, '1.3-teste');
  assert.equal(pol.ativa.boleto_padrao, 2.5);
  assert.equal(pol.versoes.length, 2);
});

test('tutoriais da Análise de Crédito: executivo vê o de pedir, analista e diretoria veem os dois', async () => {
  const { visibilidade, porSlug } = require('../server/tutoriais');
  const ve = async (email) => {
    const u = await ctx.db.um('SELECT * FROM usuarios WHERE email = $1', [email]);
    const v = await visibilidade(ctx.db, ctx.seg, u);
    return ['credito-solicitar', 'credito-analisar'].filter((s) => v(porSlug.get(s)));
  };
  assert.deepEqual(await ve('exec@teste.com'), ['credito-solicitar']);
  assert.deepEqual(await ve('analista@teste.com'), ['credito-solicitar', 'credito-analisar']);
  assert.deepEqual(await ve('diretor@teste.com'), ['credito-solicitar', 'credito-analisar']);
  assert.deepEqual(await ve('outro@teste.com'), []);
});

test('pessoas e papéis: a administração marca executivo, analista e diretoria entre os usuários do portal', async () => {
  const uid = ids['outro@teste.com'];
  assert.equal((await analista('GET', '/api/credito/pessoas')).status, 403);
  // cadastro antigo sem usuário, com o mesmo nome: passa a ser da pessoa
  const antigo = await admin('POST', '/api/credito/executivos', { nome: 'Outra Pessoa', uf: 'PB' });
  assert.equal((await admin('PUT', `/api/credito/pessoas/${uid}`, { executivo: { ativo: true, uf: 'pb', regiao: 'Paraíba', boleto: '' } })).status, 200);
  assert.equal((await admin('PUT', `/api/credito/pessoas/${uid}`, { analista: true })).status, 200);
  assert.equal((await admin('PUT', `/api/credito/pessoas/${uid}`, { diretoria: true })).status, 200);
  let p = (await outro('GET', '/api/credito/meta')).json.perfil;
  assert.equal(p.executivo.id, antigo.json.id);
  assert.equal(p.executivo.uf, 'PB');
  assert.equal(p.analista, true);
  assert.equal(p.diretoria, true);
  const lista = (await admin('GET', '/api/credito/pessoas')).json;
  const eu = lista.pessoas.find((x) => x.id === uid);
  assert.deepEqual([eu.executivo.ativo, eu.analista, eu.diretoria], [true, true, true]);
  assert.ok(!lista.executivos_sem_usuario.some((e) => e.id === antigo.json.id));
  assert.ok(lista.pessoas.find((x) => x.id === ids['diretor@teste.com']).diretoria); // os outros não mudam
  await admin('PUT', `/api/credito/pessoas/${uid}`, { executivo: { ativo: false }, analista: false, diretoria: false });
  p = (await outro('GET', '/api/credito/meta')).json.perfil;
  assert.deepEqual([p.executivo, p.analista, p.diretoria], [null, false, false]);
  assert.ok((await admin('GET', '/api/credito/pessoas')).json.pessoas.find((x) => x.id === ids['diretor@teste.com']).diretoria);
});

test('leitura dos PDFs pela IA: o envio lê relatório e convenção e o analista encontra os dados para conferir', async () => {
  iaLigada = true;
  try {
    assert.equal((await analista('GET', '/api/credito/meta')).json.ia, true);
    const r = await exec('POST', '/api/credito/analises', { formulario: FORM });
    const id = r.json.id;
    await anexar(exec, id, 'relatorio');
    await anexar(exec, id, 'convencao');
    assert.equal((await exec('POST', `/api/credito/analises/${id}/enviar`, {})).status, 200);
    let det;
    for (let i = 0; i < 40; i++) {
      det = (await analista('GET', `/api/credito/analises/${id}`)).json;
      if (det.documentos.filter((d) => !d.substituido_em).every((d) => d.leitura === 'ok')) break;
      await new Promise((ok) => setTimeout(ok, 50));
    }
    assert.deepEqual(det.documentos.map((d) => d.leitura), ['ok', 'ok']);
    const da = det.analise.dados_analista;
    assert.equal(da.relatorio.unidades.length, 1);
    assert.equal(da.relatorio.unidades[0].lancamentos.length, 6);
    assert.equal(da.relatorio.origem.ia, true);
    assert.equal(da.convencao.registro, 'RI');
    assert.equal(da.convencao.origem.fontes.registro.pagina, 38);
    assert.ok(det.eventos.some((e) => e.tipo === 'leitura' && e.detalhe.tipo === 'relatorio' && e.detalhe.lancamentos === 6));
    // o executivo não vê o que a IA leu
    const doExec = (await exec('GET', `/api/credito/analises/${id}`)).json;
    assert.equal(doExec.documentos[0].leitura, undefined);
    // o analista calcula direto com o que foi lido (2.800 / 58.420 = 4,79%)
    await analista('POST', `/api/credito/analises/${id}/assumir`, {});
    const calc = await analista('POST', `/api/credito/analises/${id}/calcular`, {});
    assert.equal(calc.status, 200, calc.texto);
    assert.equal(calc.json.resultado.precificacao.taxa_adm, 2);
    // ler de novo, só o relatório
    const antes = lidos.length;
    assert.equal((await analista('POST', `/api/credito/analises/${id}/ler`, { tipo: 'relatorio' })).status, 202);
    for (let i = 0; i < 40 && lidos.length === antes; i++) await new Promise((ok) => setTimeout(ok, 50));
    assert.deepEqual(lidos.slice(antes), ['relatorio']);
  } finally { iaLigada = false; }
  assert.equal((await analista('GET', '/api/credito/meta')).json.ia, false);
});

test('sem a chave da API, ler o PDF avisa o que falta configurar', async () => {
  const r = await exec('POST', '/api/credito/analises', { formulario: FORM });
  await anexar(exec, r.json.id, 'relatorio');
  await anexar(exec, r.json.id, 'convencao');
  await exec('POST', `/api/credito/analises/${r.json.id}/enviar`, {});
  await analista('POST', `/api/credito/analises/${r.json.id}/assumir`, {});
  const ler = await analista('POST', `/api/credito/analises/${r.json.id}/ler`, {});
  assert.equal(ler.status, 503);
  assert.match(ler.json.erro, /ANTHROPIC_API_KEY/);
});

test('o analista corrige o formulário do executivo e o histórico guarda o que mudou', async () => {
  const r = await exec('POST', '/api/credito/analises', { formulario: FORM });
  const id = r.json.id;
  await anexar(exec, id, 'relatorio');
  await anexar(exec, id, 'convencao');
  await exec('POST', `/api/credito/analises/${id}/enviar`, {});
  const corrigido = { ...FORM, taxa_ordinaria: 1900, sindico: { tipo: 'profissional', isencao: 'nao' } };
  assert.equal((await analista('PATCH', `/api/credito/analises/${id}`, { formulario: corrigido })).status, 403); // antes de assumir
  await analista('POST', `/api/credito/analises/${id}/assumir`, {});
  assert.equal((await exec('PATCH', `/api/credito/analises/${id}`, { formulario: corrigido })).status, 403); // o executivo não muda depois de enviar
  assert.equal((await analista('PATCH', `/api/credito/analises/${id}`, { formulario: corrigido })).status, 200);
  const det = (await analista('GET', `/api/credito/analises/${id}`)).json;
  assert.equal(det.analise.formulario.taxa_ordinaria, 1900);
  const ev = det.eventos.find((e) => e.tipo === 'formulario_corrigido');
  assert.deepEqual(ev.detalhe.mudancas, [
    { campo: 'Taxa ordinária', de: '1840', para: '1900' },
    { campo: 'Tipo de síndico', de: 'condomino', para: 'profissional' },
    { campo: 'Isenção do síndico', de: 'integral', para: 'nao' },
  ]);
  // o cálculo usa o formulário corrigido: 24 UH sem isenção × (1.900 + 700)
  const dados = { convencao: { registro: 'RI', uh: 24 }, relatorio: { data_emissao: hojeIso(), unidades: (await analista('POST', `/api/credito/analises/${id}/relatorio-colado`, { texto: planilha('2.800,00') })).json.unidades } };
  await analista('PATCH', `/api/credito/analises/${id}`, { dados_analista: dados });
  const calc = await analista('POST', `/api/credito/analises/${id}/calcular`, {});
  assert.equal(calc.json.resultado.valores.receita_bruta, 62400);
});

test('caixa "Colar resultado da skill": separa lançamentos, emissão, convenção, textos e ressalvas', async () => {
  const r = await exec('POST', '/api/credito/analises', { formulario: FORM });
  const id = r.json.id;
  await anexar(exec, id, 'relatorio');
  await anexar(exec, id, 'convencao');
  await exec('POST', `/api/credito/analises/${id}/enviar`, {});
  const resposta = ['### 1. Resumo do relatório', '- Data de emissão: 16/10/2026 (página 1)', '- Detalhado por competência: sim · Traz o nome dos devedores: sim', '',
    '### 2. Lançamentos para colar no portal', '```', planilha('2.800,00'), '```', '', '| Campo no portal | Valor | Página | Trecho |', '|---|---|---|---|',
    '| Registro | Registro de Imóveis | 38 | "registrada no Livro 3" |', '| Nº de unidades na convenção | 24 | 3 | "24 unidades" |', '| Multa por atraso (%) | 2 | 17 | |',
    '', '**Observações jurídicas**', '- Convenção registrada no Registro de Imóveis.', '', '**Próximos passos**', '1. Assinar o contrato.', '', '**Ressalvas**', 'Nenhuma'].join('\n');
  assert.equal((await analista('POST', `/api/credito/analises/${id}/resultado-skill`, { texto: resposta })).status, 403); // antes de assumir
  await analista('POST', `/api/credito/analises/${id}/assumir`, {});
  const lido = await analista('POST', `/api/credito/analises/${id}/resultado-skill`, { texto: resposta });
  assert.equal(lido.status, 200, lido.texto);
  assert.equal(lido.json.lancamentos.linhas, 6);
  assert.equal(lido.json.relatorio.data_emissao, '2026-10-16');
  assert.equal(lido.json.convencao.registro, 'RI');
  assert.equal(lido.json.convencao.uh, 24);
  assert.deepEqual(lido.json.convencao.origem.fontes.registro, { pagina: 38, trecho: 'registrada no Livro 3' });
  assert.deepEqual(lido.json.textos, { observacoes_juridicas: ['Convenção registrada no Registro de Imóveis.'], proximos_passos: ['Assinar o contrato.'] });
  assert.deepEqual(lido.json.ressalvas, []);
  assert.equal((await analista('POST', `/api/credito/analises/${id}/resultado-skill`, { texto: 'oi' })).status, 400);
});

test('consulta Assertiva: o analista registra cada unidade; espólio sai da garantia e sem registro não libera', { skip: !temGerador && 'python3 com reportlab não instalado' }, async () => {
  const r = await exec('POST', '/api/credito/analises', { formulario: FORM });
  const id = r.json.id;
  await anexar(exec, id, 'relatorio');
  await anexar(exec, id, 'convencao');
  await exec('POST', `/api/credito/analises/${id}/enviar`, {});
  await analista('POST', `/api/credito/analises/${id}/assumir`, {});
  // A-101 com 30 taxas em aberto (candidata à Assertiva) e B-203 com 1.500 lançamentos (relatório grande grava num comando só)
  const hoje = new Date();
  const comp = (k) => { const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - k, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const unidades = [
    { unidade: 'A-101', titular: 'Titular Fictício 1', documento: '111.111.111-11', lancamentos: Array.from({ length: 30 }, (_, i) => ({ competencia: comp(i + 1), vencimento: `${comp(i + 1)}-10`, tipo: 'ordinaria', valor: 1840 })) },
    { unidade: 'B-203', titular: 'Empresa Fictícia', documento: '11.222.333/0001-81', lancamentos: Array.from({ length: 1500 }, (_, i) => ({ competencia: comp(1 + (i % 3)), vencimento: null, tipo: 'juros', valor: 1 })) },
  ];
  const dados = { convencao: { registro: 'RI', uh: 24 }, relatorio: { data_emissao: hojeIso(), unidades } };
  assert.equal((await analista('PATCH', `/api/credito/analises/${id}`, { dados_analista: dados })).status, 200);
  let calc = await analista('POST', `/api/credito/analises/${id}/calcular`, {});
  assert.equal(calc.status, 200, calc.texto);
  assert.deepEqual(calc.json.resultado.assertiva.pendentes, ['A-101']);
  const n = await ctx.db.um('SELECT count(*)::int AS n FROM analise_lancamentos l JOIN analise_unidades u ON u.id = l.unidade_id WHERE u.analise_id = $1 AND u.unidade = $2', [id, 'B-203']);
  assert.equal(n.n, 1500);
  const lib = await analista('POST', `/api/credito/analises/${id}/liberar`, {});
  assert.equal(lib.status, 400);
  assert.match(lib.json.erro, /consulta Assertiva.*A-101/);

  assert.equal((await analista('PATCH', `/api/credito/analises/${id}`, { dados_analista: { ...dados, assertiva: { 'A-101': { resultado: 'espolio', em: hojeIso() } } } })).status, 200);
  calc = await analista('POST', `/api/credito/analises/${id}/calcular`, {});
  const res = calc.json.resultado;
  assert.deepEqual(res.assertiva.pendentes, []);
  assert.deepEqual(res.assertiva.espolios, ['A-101']);
  assert.equal(res.assertiva.candidatos[0].consulta.resultado, 'espolio'); // continua na lista, marcada
  assert.match(res.assertiva.texto, /1 espólio confirmado, fora da garantia \(A-101\)/);
  assert.deepEqual(res.escopo.exclusoes.map((x) => [x.unidade, x.motivo]), [['A-101', 'espolio']]);
  assert.equal(res.escopo.uh_escopo, 22); // 24 − 1 isenta − 1 espólio
  const det = (await analista('GET', `/api/credito/analises/${id}`)).json;
  assert.deepEqual(det.eventos.find((e) => e.tipo === 'assertiva').detalhe.consultas, [{ unidade: 'A-101', resultado: 'espolio' }]);
  assert.equal((await analista('POST', `/api/credito/analises/${id}/liberar`, {})).status, 200);
});

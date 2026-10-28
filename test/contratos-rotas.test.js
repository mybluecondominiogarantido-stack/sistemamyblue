'use strict';
/* Solicitação de Contrato pelo portal: do pedido do executivo ao contrato assinado com as condições fechadas, e daí à
   Implantação (dados fictícios). */
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

let admin, exec, adv, adv2, diretor, outro;
const ids = {};
async function pessoa(nome, email) {
  const r = await admin('POST', '/api/admin/usuarios', { data_nascimento: '1990-05-10', data_admissao: '2024-02-01', nome, email, papel: 'usuario', senha: 'Senha1234' });
  assert.equal(r.status, 201, r.texto);
  await ctx.db.q('UPDATE usuarios SET trocar_senha = FALSE WHERE id = $1', [r.json.id]);
  ids[email] = r.json.id;
  return entrar(email, 'Senha1234');
}
const avisosDe = async (email) => (await ctx.db.q('SELECT titulo, texto, link FROM notificacoes WHERE usuario_id = $1 ORDER BY id', [ids[email]])).rows;
const emailsPara = (email) => emails.filter((m) => m.para.email === email);
const PDF = Buffer.from('%PDF-1.4\n% documento fictício\n');
const anexar = (c, id, tipo, nome = `${tipo}.pdf`) => c('POST', `/api/contratos/${id}/documentos`, PDF, { headers: { 'x-tipo': tipo, 'x-nome-arquivo': encodeURIComponent(nome) } });

const FORM_ANALISE = {
  razao_social: 'Condomínio Residencial Fictício', cnpj: '11.222.333/0001-81', uf: 'RN', cidade: 'Natal', tipo_contratacao: 'nova',
  uh_total: 24, taxa_ordinaria: 1840, dia_vencimento: 10, desconto_pontualidade: { tipo: 'percentual', valor: 10 }, sindico: { tipo: 'condomino', isencao: 'nao' },
  administradora: 'Administradora Exemplo', taxas_extras: [{ descricao: 'Fachada', valor_por_uh: 700 }],
};
let seq = 0;
async function analiseLiberada(dias, nome = 'Condomínio Residencial Fictício') {
  seq++;
  const { id } = await ctx.db.um(`INSERT INTO analises (protocolo, etapa, resultado, condominio, cnpj, uf, tipo_contratacao, executivo_id, solicitante_id, formulario,
      taxa_adm, boleto, enviada_em, liberada_em) VALUES ($1, 'enviada', 'aprovada', $2, '11.222.333/0001-81', 'RN', 'nova', $3, $4, $5::jsonb, 3.5, 2,
      now() - make_interval(days => $6), now() - make_interval(days => $6)) RETURNING id`,
  [`AC-2026-02-01-${String(seq).padStart(2, '0')}`, nome, ids.executivo, ids['exec@teste.com'], JSON.stringify({ ...FORM_ANALISE, razao_social: nome }), dias]);
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
  adv = await pessoa('Advogada Fictícia', 'adv@teste.com');
  adv2 = await pessoa('Advogado Fictício', 'adv2@teste.com');
  diretor = await pessoa('Diretor Fictício', 'diretor@teste.com');
  outro = await pessoa('Outra Pessoa', 'outro@teste.com');
  const ex = await admin('POST', '/api/credito/executivos', { nome: 'Executiva Fictícia', uf: 'RN', regiao: 'Rio Grande do Norte', usuario_id: ids['exec@teste.com'] });
  assert.equal(ex.status, 201, ex.texto);
  ids.executivo = ex.json.id;
  assert.equal((await admin('PUT', '/api/credito/diretoria', { pessoas: [ids['diretor@teste.com']] })).status, 200);
});
after(async () => { servidor.close(); await ctx.db.fechar(); });

test('quem elabora: a administração marca as pessoas; sem ninguém marcado, só a administração', async () => {
  assert.equal((await adv('GET', '/api/contratos/meta')).json.perfil.elaborador, false);
  assert.equal((await adv('PUT', '/api/contratos/equipe', { pessoas: [ids['adv@teste.com']] })).status, 403);
  const r = await admin('PUT', '/api/contratos/equipe', { pessoas: [ids['adv@teste.com'], ids['adv2@teste.com']] });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.com_acesso.sort(), [ids['adv@teste.com'], ids['adv2@teste.com']].sort());
  const m = (await adv('GET', '/api/contratos/meta')).json;
  assert.equal(m.perfil.elaborador, true);
  assert.deepEqual(m.elaboradores.map((x) => x.nome), ['Advogada Fictícia', 'Advogado Fictício']);
  assert.ok(m.clausulas.negociaveis.length >= 9);
  assert.equal((await outro('GET', '/api/contratos/resumo')).json.acesso, false);
  assert.equal((await outro('GET', '/api/contratos/analises')).status, 403);
  assert.equal((await exec('GET', '/api/contratos?vis=fila')).status, 403);
});

let idC, aid, idImpC;
test('a partir da análise: formulário preenchido, convenção e retorno vêm junto, e a análise mostra o contrato', async () => {
  aid = await analiseLiberada(5);
  const a = (await exec('GET', '/api/contratos/analises')).json.analises.find((x) => x.id === aid);
  assert.equal(a.dias, 5);
  const r = await exec('POST', '/api/contratos', { origem: 'analise', analise_id: aid });
  assert.equal(r.status, 201, r.texto);
  idC = r.json.id;
  const d = (await exec('GET', `/api/contratos/${idC}`)).json;
  assert.equal(d.contrato.etapa, 'rascunho');
  assert.deepEqual([d.contrato.formulario.nome, d.contrato.formulario.taxa_adm, d.contrato.formulario.taxa_extra, d.contrato.formulario.desconto_tipo], ['Condomínio Residencial Fictício', 3.5, 700, 'percentual']);
  assert.deepEqual(d.documentos.map((x) => x.tipo).sort(), ['analise_credito', 'convencao']);
  assert.equal(d.sem_convencao, false); // a convenção veio da análise
  assert.ok(!(await exec('GET', '/api/contratos/analises')).json.analises.some((x) => x.id === aid));
  assert.equal((await exec('POST', '/api/contratos', { origem: 'analise', analise_id: aid })).status, 404);
  assert.equal((await exec('GET', `/api/credito/analises/${aid}`)).json.contrato.id, idC);
  assert.equal((await outro('GET', `/api/contratos/${idC}`)).status, 404);
});

const FORM = {
  nome: 'Condomínio Residencial Fictício', cnpj: '11.222.333/0001-81', uf: 'RN', cidade: 'Natal', administradora: 'Administradora Exemplo',
  sindico_nome: 'Síndico Fictício', sindico_cpf: '111.444.777-35', sindico_email: 'sindico@exemplo.com', sindico_telefone: '(84) 90000-0000',
  taxa_adm: 3.5, boleto: 2, desconto_tipo: 'percentual', desconto_valor: 10, garantias: ['Taxa ordinária', 'Taxa extraordinária', 'Água'], taxa_ordinaria: 1840, taxa_extra: 700,
  cashback: 'nao', inicio_contrato: '2026-12-01', primeiro_vencimento: '2026-12-10', periodo_minimo: 12,
  pedidos: ['foro_capital', 'reembolso_limitar'], pedidos_detalhe: { reembolso_limitar: 'teto de R$ 50 por certidão', foro_capital: 'Natal/RN' }, minucias: 'Primeiro repasse adiantado em 5 dias.',
};

test('enviar: confere o que falta, gera o protocolo, prazo de 72h úteis e avisa quem elabora, a diretoria e o executivo', async () => {
  let env = await exec('POST', `/api/contratos/${idC}/enviar`, {});
  assert.equal(env.status, 400);
  assert.ok(env.json.faltas.some((f) => /nome do síndico/.test(f)));
  const p = await exec('PATCH', `/api/contratos/${idC}`, { formulario: FORM });
  assert.equal(p.status, 200, p.texto);
  assert.equal(p.json.itens_diretoria.length, 1);
  assert.equal((await anexar(exec, idC, 'ata_eleicao')).status, 400); // os documentos do síndico são pedidos na Implantação
  assert.equal((await anexar(exec, idC, 'minuta')).status, 403); // a minuta é do Jurídico
  assert.equal((await anexar(exec, idC, 'qualquer')).status, 400);
  env = await exec('POST', `/api/contratos/${idC}/enviar`, {});
  assert.equal(env.status, 200, env.texto);
  assert.match(env.json.protocolo, /^CT-\d{4}-\d{2}-\d{2}-01$/);
  assert.equal(env.json.etapa, 'fila');
  const c = (await adv('GET', `/api/contratos/${idC}`)).json.contrato;
  assert.equal(new Date(c.prazo).getTime(), ctx.expediente.somarDiasUteis(new Date(c.enviado_em), 3).getTime());
  for (const e of ['adv@teste.com', 'adv2@teste.com']) assert.match((await avisosDe(e)).pop().titulo, /^Nova solicitação de contrato · CT-/);
  assert.equal(emailsPara('adv@teste.com').length, 1);
  assert.match((await avisosDe('diretor@teste.com')).pop().texto, /despesas reembolsáveis/);
  assert.equal(env.json.sem_convencao, false);
  assert.equal((await exec('PATCH', `/api/contratos/${idC}`, { formulario: FORM })).status, 403);
  assert.equal((await diretor('GET', '/api/contratos/resumo')).json.diretoria, 1);
});

test('Jurídico: assume, anexa a minuta e só envia depois da decisão da diretoria', async () => {
  assert.equal((await exec('POST', `/api/contratos/${idC}/assumir`, {})).status, 403);
  assert.equal((await adv('POST', `/api/contratos/${idC}/assumir`, {})).status, 200);
  assert.equal((await adv2('POST', `/api/contratos/${idC}/assumir`, {})).status, 409);
  assert.match((await avisosDe('exec@teste.com')).pop().titulo, /^Contrato em elaboração/);
  assert.equal((await adv2('POST', `/api/contratos/${idC}/minuta`, {})).status, 403); // não é quem assumiu
  assert.equal((await adv('POST', `/api/contratos/${idC}/minuta`, {})).status, 409); // diretoria ainda não decidiu
  assert.equal((await anexar(adv, idC, 'minuta', 'minuta_v1.docx')).status, 201);
  assert.equal((await exec('POST', `/api/contratos/${idC}/diretoria`, { aprovar: true })).status, 403);
  assert.equal((await diretor('POST', `/api/contratos/${idC}/diretoria`, { aprovar: false })).status, 400);
  assert.equal((await diretor('POST', `/api/contratos/${idC}/diretoria`, { aprovar: true, observacao: 'Teto aprovado' })).status, 200);
  assert.match((await avisosDe('adv@teste.com')).pop().titulo, /^Diretoria aprovou/);
  const r = await adv('POST', `/api/contratos/${idC}/minuta`, { mensagem: 'Segue a minuta.' });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.no_prazo, true);
  const aviso = (await avisosDe('exec@teste.com')).pop();
  assert.match(aviso.titulo, /^Minuta do contrato pronta/);
  assert.match(aviso.texto, /minuta_v1\.docx/);
});

test('ajuste: volta para quem assumiu com novo prazo; a minuta nova é exigida e a anterior fica no histórico', async () => {
  assert.equal((await adv('POST', `/api/contratos/${idC}/ajuste`, { texto: 'x' })).status, 403);
  assert.equal((await exec('POST', `/api/contratos/${idC}/ajuste`, {})).status, 400);
  const r = await exec('POST', `/api/contratos/${idC}/ajuste`, { texto: 'Síndico quer o foro em Natal escrito por extenso.' });
  assert.equal(r.status, 200, r.texto);
  assert.match((await avisosDe('adv@teste.com')).pop().titulo, /^Ajuste na minuta/);
  let d = (await adv('GET', `/api/contratos/${idC}`)).json;
  assert.deepEqual([d.contrato.etapa, d.contrato.ajustes], ['em_elaboracao', 1]);
  assert.equal((await adv('POST', `/api/contratos/${idC}/minuta`, {})).status, 400); // a anexada é de antes do ajuste
  await new Promise((ok) => setTimeout(ok, 10));
  assert.equal((await anexar(adv, idC, 'minuta', 'minuta_v2.docx')).status, 201);
  assert.equal((await adv('POST', `/api/contratos/${idC}/minuta`, {})).status, 200);
  assert.match((await avisosDe('exec@teste.com')).pop().titulo, /^Minuta ajustada pronta/);
  d = (await exec('GET', `/api/contratos/${idC}`)).json;
  const minutas = d.documentos.filter((x) => x.tipo === 'minuta');
  assert.deepEqual(minutas.map((x) => [x.nome, !!x.substituido_em]), [['minuta_v1.docx', true], ['minuta_v2.docx', false]]);
});

test('assinatura: o executivo pede, a advogada manda assinar, anexa a via assinada e registra as condições fechadas', async () => {
  assert.equal((await adv('POST', `/api/contratos/${idC}/pedir-assinatura`, {})).status, 403); // é o comercial que pede
  assert.equal((await anexar(exec, idC, 'contrato_assinado')).status, 409); // ainda não foi pedida a assinatura
  assert.equal((await adv('POST', `/api/contratos/${idC}/em-assinatura`, {})).status, 403);
  assert.equal((await exec('POST', `/api/contratos/${idC}/pedir-assinatura`, { observacao: 'Síndico assina pela Clicksign.' })).status, 200);
  assert.match((await avisosDe('adv@teste.com')).pop().titulo, /^Pronto para assinatura/);
  assert.equal((await adv('GET', '/api/contratos/resumo')).json.para_assinar, 1);
  assert.deepEqual((await adv('GET', '/api/contratos?vis=assinaturas')).json.contratos.map((c) => [c.id, c.etapa]), [[idC, 'para_assinar']]);
  assert.equal((await exec('POST', `/api/contratos/${idC}/em-assinatura`, {})).status, 403); // é o Jurídico que manda assinar
  assert.equal((await adv('POST', `/api/contratos/${idC}/em-assinatura`, { plataforma: 'Clicksign' })).status, 200);
  assert.match((await avisosDe('exec@teste.com')).pop().titulo, /^Contrato em assinatura/);
  assert.equal((await exec('POST', `/api/contratos/${idC}/assinado`, {})).status, 403); // o assinado é marcado pelo Jurídico
  assert.equal((await adv('POST', `/api/contratos/${idC}/assinado`, {})).status, 400); // falta a via assinada
  assert.equal((await anexar(adv, idC, 'contrato_assinado', 'contrato_assinado.pdf')).status, 201);
  assert.equal((await adv('POST', `/api/contratos/${idC}/assinado`, {})).status, 200); // a procuração não é pedida
  assert.match((await avisosDe('exec@teste.com')).pop().titulo, /^Contrato assinado/);
  let d = (await adv('GET', `/api/contratos/${idC}`)).json;
  assert.equal(d.contrato.etapa, 'conferencia');
  assert.ok(d.pode.registrar);
  const x = d.contrato.fechado;
  assert.deepEqual([x.taxa_adm, x.foro, x.prazo_contestacao, x.clausulas.length], [3.5, 'Natal/RN', 15, 2]);
  assert.equal((await exec('PUT', `/api/contratos/${idC}/fechado`, { condicoes: x })).status, 403);
  let r = await adv('PUT', `/api/contratos/${idC}/fechado`, { condicoes: { ...x, taxa_adm: 3.25 } });
  assert.equal(r.status, 200, r.texto);
  // a vigência vem do pedido (a advogada confirma), os honorários são dela; o primeiro vencimento (e o dia dos boletos) vem do executivo
  assert.deepEqual(r.json.faltas.filter((f) => !/Dizer como ficou/.test(f)), ['Informar os honorários de cobrança extrajudicial.']);
  assert.deepEqual([x.primeiro_vencimento, x.dia_vencimento, x.inicio_contrato], ['2026-12-10', 10, '2026-12-01']);
  r = await adv('PUT', `/api/contratos/${idC}/fechado`, { condicoes: { ...x, taxa_adm: 3.25 }, concluir: true });
  assert.equal(r.status, 400);
  const fechado = { ...x, taxa_adm: 3.25, honorarios: 15, inicio_contrato: '2026-12-01', dia_vencimento: 5, clausulas: x.clausulas.map((k) => ({ ...k, resultado: 'aceito', redacao: 'Redação padrão do Jurídico.' })), observacoes: 'Procuração no mesmo arquivo.' };
  r = await adv('PUT', `/api/contratos/${idC}/fechado`, { condicoes: fechado, concluir: true });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.json.implantacao, null); // a advogada só registra: quem solicita a implantação é o executivo
  d = (await exec('GET', `/api/contratos/${idC}`)).json;
  assert.equal(d.contrato.etapa, 'assinado');
  assert.equal(d.contrato.fechado_por_nome, 'Advogada Fictícia');
  assert.deepEqual(d.diferencas_fechado.map((v) => [v.rotulo, v.fechado]), [['Taxa administrativa', '3,25%']]);
  const aviso = (await avisosDe('exec@teste.com')).pop();
  assert.match(aviso.titulo, /^Contrato assinado: solicite a implantação/);
  assert.equal(aviso.link, `#/contratos/${idC}`);
  assert.equal(d.implantacao, null);
  assert.equal(d.pode.abrir_implantacao, true);
  assert.equal((await adv('GET', `/api/contratos/${idC}`)).json.pode.abrir_implantacao, false);
});

test('Implantação: o executivo solicita pelo contrato, e ela vem com as condições fechadas, o contrato assinado e os documentos', async () => {
  assert.equal((await adv('POST', `/api/contratos/${idC}/implantacao`, {})).status, 403); // a advogada não solicita
  const r = await exec('POST', `/api/contratos/${idC}/implantacao`, {});
  assert.equal(r.status, 201, r.texto);
  idImpC = r.json.implantacao;
  assert.equal((await exec('GET', `/api/contratos/${idC}`)).json.implantacao.id, idImpC);
  assert.equal((await exec('POST', '/api/implantacoes', { origem: 'analise', analise_id: aid })).status, 404); // já tem implantação
  assert.equal((await exec('POST', `/api/contratos/${idC}/implantacao`, {})).status, 409);
  const d = (await exec('GET', `/api/implantacoes/${idImpC}`)).json;
  assert.deepEqual([d.implantacao.etapa, d.implantacao.origem, d.implantacao.analise_id, d.implantacao.contrato_id], ['rascunho', 'analise', aid, idC]);
  assert.ok((await exec('GET', '/api/implantacoes?vis=minhas')).json.implantacoes.some((i) => i.id === idImpC));
  assert.deepEqual([d.implantacao.formulario.taxa_adm, d.implantacao.formulario.sindico_nome, d.implantacao.formulario.inicio_contrato], [3.25, 'Síndico Fictício', '2026-12-01']);
  assert.match(d.implantacao.formulario.observacoes, /Primeiro repasse adiantado/);
  assert.deepEqual(d.documentos.map((x) => x.tipo).sort(), ['analise_credito', 'contrato', 'convencao']);
  // o que veio vinculado (convenção, análise, contrato) não se troca nem se remove na implantação
  assert.ok(d.documentos.every((x) => x.vinculado));
  const doc = (tipo) => exec('POST', `/api/implantacoes/${idImpC}/documentos`, PDF, { headers: { 'x-tipo': tipo, 'x-nome-arquivo': 'x.pdf' } });
  assert.equal((await doc('convencao')).status, 409);
  assert.equal((await doc('ata_eleicao')).status, 201);
  assert.equal((await exec('DELETE', `/api/implantacoes/${idImpC}/documentos/${d.documentos.find((x) => x.tipo === 'contrato').id}`)).status, 409);
  // o que vem das condições fechadas (taxa, boleto, honorários…) o executivo não muda na implantação; as garantias ele preenche
  assert.equal((await exec('PATCH', `/api/implantacoes/${idImpC}`, { formulario: { ...d.implantacao.formulario, garantias: ['Gás'], taxa_adm: 9, boleto: 1, honorarios: 10, consultor_nome: 'Consultor Fictício' } })).status, 200);
  let fi = (await exec('GET', `/api/implantacoes/${idImpC}`)).json.implantacao.formulario;
  assert.deepEqual([fi.garantias, fi.taxa_adm, fi.boleto, fi.honorarios, fi.consultor_nome], [['Gás'], 3.25, 2, 15, 'Consultor Fictício']); // o que será garantido o comercial preenche
  // o primeiro vencimento vem do contrato, mas o comercial ajusta (o síndico mudou); o vencimento padrão (dia) não muda com ele,
  // porque o 1º boleto pode sair em outro dia por causa da implantação; a vigência não muda
  const padrao = fi.dia_vencimento;
  assert.equal((await exec('PATCH', `/api/implantacoes/${idImpC}`, { formulario: { ...fi, primeiro_vencimento: '2026-12-15', inicio_contrato: '2027-01-01' } })).status, 200);
  fi = (await exec('GET', `/api/implantacoes/${idImpC}`)).json.implantacao.formulario;
  assert.deepEqual([fi.primeiro_vencimento, fi.dia_vencimento, fi.inicio_contrato], ['2026-12-15', padrao, '2026-12-01']);
  // sem o vencimento padrão, vale o dia do 1º vencimento
  assert.equal((await exec('PATCH', `/api/implantacoes/${idImpC}`, { formulario: { ...fi, dia_vencimento: null } })).status, 200);
  assert.equal((await exec('GET', `/api/implantacoes/${idImpC}`)).json.implantacao.formulario.dia_vencimento, 15);
  assert.equal(d.implantacao.formulario.honorarios, 15); // os honorários das condições fechadas
  assert.equal(d.contrato.fechado.foro, 'Natal/RN');
  assert.deepEqual(d.diferencas.map((x) => x.campo), ['taxa_adm']); // diferente da análise (3,50%)
});

test('contrato concluído: quem elabora corrige as condições com o motivo; o histórico guarda o que mudou e a implantação mostra a diferença', async () => {
  const d = (await adv('GET', `/api/contratos/${idC}`)).json;
  assert.ok(d.pode.corrigir);
  assert.equal((await exec('GET', `/api/contratos/${idC}`)).json.pode.corrigir, false);
  const x = d.contrato.fechado;
  assert.equal((await exec('POST', `/api/contratos/${idC}/corrigir`, { condicoes: { ...x, taxa_adm: 3 }, motivo: 'x' })).status, 403);
  assert.equal((await adv('POST', `/api/contratos/${idC}/corrigir`, { condicoes: { ...x, taxa_adm: 3 } })).status, 400); // sem motivo
  assert.equal((await adv('POST', `/api/contratos/${idC}/corrigir`, { condicoes: x, motivo: 'Conferência' })).status, 400); // nada mudou
  const r = await adv('POST', `/api/contratos/${idC}/corrigir`, { condicoes: { ...x, taxa_adm: 3, foro: 'Fortaleza/CE' }, motivo: 'A taxa do assinado é 3%.' });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.mudancas.map((m) => [m.rotulo, m.antes, m.depois]), [['Taxa administrativa', '3,25%', '3,00%'], ['Foro', 'Natal/RN', 'Fortaleza/CE']]);
  const ev = (await adv('GET', `/api/contratos/${idC}`)).json.eventos.pop();
  assert.deepEqual([ev.tipo, ev.detalhe.motivo], ['fechado_corrigido', 'A taxa do assinado é 3%.']);
  const aviso = (await avisosDe('exec@teste.com')).pop();
  assert.match(aviso.titulo, /^Condições do contrato corrigidas/);
  assert.match(aviso.texto, /Taxa administrativa: 3,25% → 3,00%/);
  // a implantação aberta com 3,25% passa a mostrar a diferença para o contrato
  const imp = (await exec('GET', '/api/implantacoes?vis=minhas')).json.implantacoes.find((i) => i.analise_id === aid);
  const di = (await exec('GET', `/api/implantacoes/${imp.id}`)).json;
  assert.deepEqual(di.contrato.diferente_da_implantacao.map((v) => [v.rotulo, v.implantacao, v.contrato]), [['Taxa administrativa', '3,25%', '3,00%']]);
  assert.equal(di.contrato.corrigido.motivo, 'A taxa do assinado é 3%.');
  assert.equal(di.contrato.fechado.foro, 'Fortaleza/CE');
});

test('Nova implantação: só aparece o contrato concluído, do executivo, ainda sem implantação', async () => {
  const a2 = await analiseLiberada(2, 'Edifício Fictício Horizonte');
  const disponiveis = async (c) => (await c('GET', '/api/implantacoes/contratos')).json.contratos.map((x) => x.id);
  const { id } = (await exec('POST', '/api/contratos', { origem: 'analise', analise_id: a2 })).json;
  assert.equal((await exec('PATCH', `/api/contratos/${id}`, { formulario: { ...FORM, nome: 'Edifício Fictício Horizonte', pedidos: [] } })).status, 200);
  assert.equal((await exec('POST', `/api/contratos/${id}/enviar`, {})).status, 200);
  assert.ok(!(await disponiveis(exec)).includes(id)); // em andamento: ainda não implanta
  assert.equal((await outro('GET', '/api/implantacoes/contratos')).status, 403);
  await adv('POST', `/api/contratos/${id}/assumir`, {});
  await anexar(adv, id, 'minuta');
  await adv('POST', `/api/contratos/${id}/minuta`, {});
  assert.equal((await exec('POST', `/api/contratos/${id}/pedir-assinatura`, {})).status, 200);
  await anexar(adv, id, 'contrato_assinado');
  assert.equal((await adv('POST', `/api/contratos/${id}/assinado`, {})).status, 200); // a via voltou sem marcar "em assinatura": também vale
  const x = (await adv('GET', `/api/contratos/${id}`)).json.contrato.fechado;
  const r = await adv('PUT', `/api/contratos/${id}/fechado`, { condicoes: { ...x, honorarios: 12, inicio_contrato: '2026-12-01' }, concluir: true });
  assert.equal(r.status, 200, r.texto);
  const item = (await exec('GET', '/api/implantacoes/contratos')).json.contratos.find((c) => c.id === id);
  assert.deepEqual([item.condominio, item.inicio_contrato, item.entrega_aprovada], ['Edifício Fictício Horizonte', '2026-12-01', false]);
  assert.ok((await disponiveis(admin)).includes(id)); // a administração vê os de todos
  const sol = await exec('POST', `/api/contratos/${id}/implantacao`, {});
  assert.equal(sol.status, 201, sol.texto);
  assert.ok(!(await disponiveis(exec)).includes(id)); // com implantação, sai da lista
  const d = (await exec('GET', `/api/implantacoes/${sol.json.implantacao}`)).json;
  assert.deepEqual([d.implantacao.contrato_id, d.contrato.etapa, d.contrato.fechado.foro], [id, 'assinado', 'Fortaleza/CE']); // sem pedido de foro: o padrão
});

test('controle: contadores e lista para quem elabora; o executivo vê as suas; quem não tem acesso não vê nada', async () => {
  const c = (await adv('GET', '/api/contratos?vis=controle')).json;
  assert.equal(c.contadores.assinados_mes, 2);
  assert.ok(c.contratos.every((x) => x.etapa !== 'rascunho'));
  assert.ok(c.contratos.find((x) => x.id === idC).primeira_minuta_em);
  assert.equal((await exec('GET', '/api/contratos?vis=controle')).json.contratos.length, 2);
  assert.equal((await outro('GET', '/api/contratos?vis=controle')).json.contratos.length, 0);
  assert.equal((await adv('GET', '/api/contratos?vis=controle&etapa=assinado')).json.contratos.length, 2);
});

test('Dashboard Jurídico: o período (mês e ano), a situação de agora e quem não tem acesso', async () => {
  assert.equal((await exec('GET', '/api/contratos/painel')).status, 403);
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const [ano, mes] = hoje.split('-').map(Number);
  const r = (await adv('GET', `/api/contratos/painel?ano=${ano}&mes=${mes}`)).json;
  assert.deepEqual([r.ano, r.mes], [ano, mes]);
  assert.ok(r.periodo.solicitados >= 2);
  assert.equal(r.periodo.fechados, 2);
  assert.equal(r.periodo.enviados_assinatura, 1);
  assert.equal(r.periodo.assinaturas_pedidas, 2);
  assert.ok(r.periodo.ajustes >= 1);
  assert.equal(r.meses.length, 12);
  assert.equal(r.meses[mes - 1].fechados, 2);
  // o comparativo do mês: solicitados, aguardando assinatura (pedidos), em assinatura (enviados) e assinados
  const m = r.meses[mes - 1];
  assert.deepEqual([m.solicitados, m.aguardando_assinatura, m.em_assinatura, m.assinados], [r.periodo.solicitados, 2, 1, 2]);
  assert.equal(r.tempos.ajustes_por_contrato, 0.5);
  assert.ok(r.por_executivo.some((x) => x.nome === 'Executiva Fictícia' && x.fechados === 2));
  const ano2 = (await diretor('GET', `/api/contratos/painel?ano=${ano}`)).json;
  assert.equal(ano2.mes, 0);
  assert.equal((await adv('GET', `/api/contratos/painel?ano=${ano - 1}`)).json.periodo.solicitados, 0);
});

test('sem convenção: a solicitação avisa, a advogada é avisada no pedido de assinatura e quando a convenção chega', async () => {
  const a5 = await analiseLiberada(1, 'Residencial Fictício Sem Convenção');
  const { id } = (await exec('POST', '/api/contratos', { origem: 'analise', analise_id: a5 })).json;
  let d = (await exec('GET', `/api/contratos/${id}`)).json;
  const conv = d.documentos.find((x) => x.tipo === 'convencao');
  assert.equal((await exec('DELETE', `/api/contratos/${id}/documentos/${conv.id}`)).status, 200);
  d = (await exec('GET', `/api/contratos/${id}`)).json;
  assert.equal(d.sem_convencao, true);
  assert.ok(d.avisos.some((a) => a.nivel === 'atencao' && /não pode ser assinado sem ela/.test(a.texto)));
  await exec('PATCH', `/api/contratos/${id}`, { formulario: { ...FORM, nome: 'Residencial Fictício Sem Convenção', pedidos: [] } });
  const env = await exec('POST', `/api/contratos/${id}/enviar`, {});
  assert.equal(env.json.sem_convencao, true); // não impede o envio
  assert.match((await avisosDe('adv@teste.com')).pop().texto, /convenção do condomínio não foi enviada/);
  assert.ok((await adv('GET', '/api/contratos?vis=fila')).json.contratos.find((x) => x.id === id).sem_convencao);
  await adv('POST', `/api/contratos/${id}/assumir`, {});
  await anexar(adv, id, 'minuta');
  await adv('POST', `/api/contratos/${id}/minuta`, {});
  assert.equal((await exec('POST', `/api/contratos/${id}/pedir-assinatura`, {})).json.sem_convencao, true);
  const aviso = (await avisosDe('adv@teste.com')).pop();
  assert.match(aviso.titulo, /^Pronto para assinatura \(sem convenção\)/);
  assert.match(aviso.texto, /peça ao executivo antes de mandar assinar/);
  assert.equal((await anexar(exec, id, 'convencao')).status, 201);
  assert.match((await avisosDe('adv@teste.com')).pop().titulo, /^Convenção chegou/);
  assert.equal((await adv('GET', `/api/contratos/${id}`)).json.sem_convencao, false);
  await adv('POST', `/api/contratos/${id}/cancelar`, {});
});

test('rotina: prazo da minuta vencido avisa uma vez', async () => {
  const a3 = await analiseLiberada(1, 'Residencial Fictício Aurora');
  const { id } = (await exec('POST', '/api/contratos', { origem: 'analise', analise_id: a3 })).json;
  await exec('PATCH', `/api/contratos/${id}`, { formulario: { ...FORM, nome: 'Residencial Fictício Aurora', pedidos: [] } });
  assert.equal((await exec('POST', `/api/contratos/${id}/enviar`, {})).status, 200);
  const semana = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const r = await ctx.rotinasContratos.executar(semana);
  assert.equal(r.prazos, 1);
  assert.match((await avisosDe('adv2@teste.com')).pop().titulo, /^Passou do prazo da minuta · .* · Residencial Fictício Aurora/);
  assert.equal((await ctx.rotinasContratos.executar(semana)).prazos, 0);
});

test('pendência, passar para um colega e cancelar', async () => {
  const a4 = await analiseLiberada(1, 'Condomínio Fictício Bela Vista');
  const { id } = (await exec('POST', '/api/contratos', { origem: 'analise', analise_id: a4 })).json;
  await exec('PATCH', `/api/contratos/${id}`, { formulario: { ...FORM, nome: 'Condomínio Fictício Bela Vista', pedidos: [] } });
  await exec('POST', `/api/contratos/${id}/enviar`, {});
  assert.equal((await adv('POST', `/api/contratos/${id}/passar`, { usuario_id: ids['outro@teste.com'] })).status, 400);
  assert.equal((await adv('POST', `/api/contratos/${id}/passar`, { usuario_id: ids['adv2@teste.com'] })).status, 200);
  assert.match((await avisosDe('adv2@teste.com')).pop().titulo, /^Solicitação de contrato com você/);
  assert.equal((await adv2('POST', `/api/contratos/${id}/pendencia`, { itens: ['Confirmar o e-mail do síndico'] })).status, 200);
  assert.match((await avisosDe('exec@teste.com')).pop().texto, /Confirmar o e-mail do síndico/);
  const env = await exec('POST', `/api/contratos/${id}/enviar`, {});
  assert.equal(env.json.etapa, 'em_elaboracao');
  assert.match((await avisosDe('adv2@teste.com')).pop().titulo, /^Pendência respondida/);
  assert.equal((await outro('POST', `/api/contratos/${id}/cancelar`, {})).status, 404);
  assert.equal((await adv2('POST', `/api/contratos/${id}/cancelar`, { motivo: 'Síndico desistiu' })).status, 200);
  assert.ok((await exec('GET', '/api/contratos/analises')).json.analises.some((x) => x.id === a4)); // a análise volta a ficar disponível
});

test('condomínio de entrega: sem análise, a diretoria aprova taxa e boleto antes da minuta', async () => {
  const { id } = (await exec('POST', '/api/contratos', { origem: 'entrega' })).json;
  await exec('PATCH', `/api/contratos/${id}`, { formulario: { ...FORM, nome: 'Condomínio Modelo Fictício', cnpj: '', sem_cnpj: true, sem_cnpj_ciente: true, pedidos: [] } });
  let env = await exec('POST', `/api/contratos/${id}/enviar`, {});
  assert.ok(env.json.faltas.some((f) => /Ata da assembleia/.test(f)));
  await anexar(exec, id, 'ata_ago');
  env = await exec('POST', `/api/contratos/${id}/enviar`, {});
  assert.equal(env.status, 200, env.texto);
  assert.match(env.json.diretoria[0], /Condomínio de entrega/);
  assert.equal((await diretor('GET', '/api/contratos?vis=diretoria')).json.contratos[0].id, id);
  // do aprovado ao concluído: o executivo solicita a implantação de entrega, com a taxa e o boleto já aprovados pela diretoria
  assert.equal((await diretor('POST', `/api/contratos/${id}/diretoria`, { aprovar: true })).status, 200);
  await adv('POST', `/api/contratos/${id}/assumir`, {});
  await anexar(adv, id, 'minuta');
  assert.equal((await adv('POST', `/api/contratos/${id}/minuta`, {})).status, 200);
  await exec('POST', `/api/contratos/${id}/pedir-assinatura`, {});
  await anexar(adv, id, 'contrato_assinado');
  assert.equal((await adv('POST', `/api/contratos/${id}/assinado`, {})).status, 200);
  const x = (await adv('GET', `/api/contratos/${id}`)).json.contrato.fechado;
  const r = await adv('PUT', `/api/contratos/${id}/fechado`, { condicoes: { ...x, honorarios: 12, inicio_contrato: '2026-12-01' }, concluir: true });
  assert.equal(r.status, 200, r.texto);
  // na Nova implantação, o contrato de entrega aparece com a taxa aprovada pela diretoria
  assert.equal((await exec('GET', '/api/implantacoes/contratos')).json.contratos.find((c) => c.id === id).entrega_aprovada, true);
  const sol = await exec('POST', `/api/contratos/${id}/implantacao`, {});
  assert.equal(sol.status, 201, sol.texto);
  let di = (await exec('GET', `/api/implantacoes/${sol.json.implantacao}`)).json;
  assert.deepEqual([di.implantacao.origem, di.implantacao.contrato_id, di.implantacao.formulario.taxa_adm, di.implantacao.formulario.sem_cnpj], ['entrega', id, 3.5, true]);
  assert.ok(di.implantacao.referencia.aprovado_em);
  assert.deepEqual(di.documentos.map((d) => d.tipo).sort(), ['contrato', 'outro']); // o contrato assinado e a ata da assembleia
  // implantação cancelada: o executivo solicita outra pelo contrato
  assert.equal((await exec('POST', `/api/implantacoes/${sol.json.implantacao}/cancelar`, {})).status, 200);
  const nova = await exec('POST', `/api/contratos/${id}/implantacao`, {});
  assert.equal(nova.status, 201, nova.texto);
  di = (await exec('GET', `/api/implantacoes/${nova.json.implantacao}`)).json;
  assert.equal(di.contrato.fechado.taxa_adm, 3.5);
});

test('conferência ao vivo: o campo de cada falta, CPF e e-mail errados e o executivo escolhido pela administração', async () => {
  const { id } = (await admin('POST', '/api/contratos', { origem: 'entrega' })).json;
  const forma = { ...FORM, nome: 'Condomínio Fictício Teste', sindico_cpf: '6166521397', sindico_email: 'Teste', pedidos: [] };
  let r = await admin('POST', `/api/contratos/${id}/conferir`, { formulario: forma });
  assert.equal(r.status, 200, r.texto);
  const por = Object.fromEntries(r.json.faltas_campos.map((x) => [x.campo, x.msg]));
  assert.equal(por.sindico_cpf, 'CPF do síndico com 10 dígito(s): são 11.');
  assert.match(por.sindico_email, /E-mail do síndico inválido/);
  assert.equal(por.executivo_id, 'Escolher o executivo de negócios.');
  r = await admin('POST', `/api/contratos/${id}/conferir`, { formulario: { ...forma, sindico_cpf: '111.444.777-35', sindico_email: 's@exemplo.com' }, executivo_id: ids.executivo });
  assert.deepEqual(r.json.faltas_campos, []);
  assert.equal((await exec('POST', `/api/contratos/${id}/conferir`, { formulario: forma })).status, 404); // não é dela
  assert.equal((await admin('PATCH', `/api/contratos/${id}`, { formulario: { ...forma, sindico_cpf: '111.444.777-35', sindico_email: 's@exemplo.com' }, executivo_id: ids.executivo })).status, 200);
  const d = (await admin('GET', `/api/contratos/${id}`)).json;
  assert.equal(d.contrato.executivo_id, ids.executivo);
  assert.deepEqual(d.faltas_campos, []);
  await admin('POST', `/api/contratos/${id}/cancelar`, {});
});

const temGerador = (() => { try { require('child_process').execFileSync('python3', ['-c', 'import reportlab'], { stdio: 'ignore' }); require('child_process').execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
test('solicitação em PDF, com as condições fechadas', { skip: !temGerador && 'reportlab ou pdftotext não instalados' }, async () => {
  assert.equal((await outro('GET', `/api/contratos/${idC}/formulario.pdf`, undefined, { bruto: true })).status, 404);
  const r = await exec('GET', `/api/contratos/${idC}/formulario.pdf`, undefined, { bruto: true });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  const texto = require('child_process').execFileSync('pdftotext', ['-', '-'], { input: r.buffer }).toString();
  for (const t of [/SOLICITAÇÃO DE CONTRATO/, /CT-\d{4}-\d{2}-\d{2}-01/, /Condomínio Residencial Fictício/, /CONDIÇÕES FECHADAS/, /Fortaleza\/CE/, /3,00%/, /Primeiro repasse adiantado/, /Convenção do condomínio/]) {
    assert.match(texto, t);
  }
});

'use strict';
/*
 * Importação do histórico das planilhas da Implantação (só leitura e conferência; quem grava é
 * server/rotas/implantacoes-importacao.js):
 *  - Formulário de implantação (respostas do Microsoft Forms, todas desde o início) e
 *  - Controle Implantações (aba de controle por ano: etapas, implantado por, Obs., % concluído).
 *
 * As regras são as das fórmulas da planilha:
 *  - a linha do Controle aponta para a resposta pela "Nº FORM (Ref.)", que é o número da linha no Forms (coluna W);
 *  - Obs. com "teste" ou "desconsiderar" sai de todas as telas e contagens;
 *  - o mesmo condomínio (nome) repetido no mesmo ano: vale o envio mais recente, o anterior fica substituído;
 *  - mesmo CNPJ com nome diferente: são condomínios que realmente têm mais de um formulário; ficam, com aviso.
 * Respostas que não estão no Controle (anos anteriores) entram como concluídas, só como histórico.
 *
 * Os arquivos e os dados ficam no portal: nada daqui vai para o repositório (os testes usam dados fictícios).
 */
const F = require('./formulario');
const carteira = require('../carteira');

const sem = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const texto = (s, max = 500) => String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const digitos = (s) => String(s || '').replace(/\D/g, '');
const pad = (n) => String(n).padStart(2, '0');

/* ---------- datas: dd/mm/aaaa [hh:mm], número de série do Excel, "set-26" / "set/26" ---------- */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function data(v) {
  const s = texto(v, 40);
  if (!s) return { dia: '', tipo: 'vazia' };
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = `${ano}-${pad(m[2])}-${pad(m[1])}`;
    return valida(d) ? { dia: d, hora: m[4] ? `${pad(m[4])}:${m[5]}` : '', tipo: 'data' } : { dia: '', tipo: 'invalida' };
  }
  m = /^(\d{1,2})\/(\d{1,2})$/.exec(s); // dia/mês sem ano: quem chama completa o ano
  if (m) return { dia: '', dm: [Number(m[1]), Number(m[2])], tipo: 'dia_mes' };
  m = /^(\d{4,5})(?:[.,](\d+))?$/.exec(s); // série do Excel (dias desde 30/12/1899)
  if (m && Number(m[1]) > 20000 && Number(m[1]) < 80000) {
    const t = new Date(Date.UTC(1899, 11, 30) + Number(`${m[1]}.${m[2] || 0}`) * 86400000);
    return { dia: t.toISOString().slice(0, 10), hora: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`, tipo: 'serie' };
  }
  m = /^([a-zç]{3})[a-zç]*[-/ ](\d{2}|\d{4})$/.exec(sem(s));
  if (m && MESES.includes(m[1])) {
    const ano = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return { dia: `${ano}-${pad(MESES.indexOf(m[1]) + 1)}-01`, tipo: 'mes' };
  }
  return { dia: '', tipo: 'invalida' };
}
function valida(d) {
  const [a, m, dd] = d.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, dd));
  return a > 2000 && a < 2100 && t.getUTCMonth() === m - 1 && t.getUTCDate() === dd;
}

/* ---------- números: "2,5%", "R$1,30", "17,5 %" ---------- */
function numero(v) {
  const m = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?/.exec(texto(v).replace(/\s/g, ''));
  if (!m) return null;
  return Number(`${m[1].replace(/\./g, '')}.${m[2] || 0}`);
}

/* ---------- UF a partir do texto livre do estado (a planilha usava um dicionário de cidades e estados) ---------- */
const UF_NOMES = {
  ceara: 'CE', 'rio grande do norte': 'RN', paraiba: 'PB', pernambuco: 'PE', 'distrito federal': 'DF', 'minas gerais': 'MG', bahia: 'BA', alagoas: 'AL',
  piaui: 'PI', maranhao: 'MA', sergipe: 'SE', goias: 'GO', 'sao paulo': 'SP', 'rio de janeiro': 'RJ', 'espirito santo': 'ES', parana: 'PR',
  'santa catarina': 'SC', 'rio grande do sul': 'RS', 'mato grosso do sul': 'MS', 'mato grosso': 'MT', tocantins: 'TO', para: 'PA', amazonas: 'AM',
};
const CIDADES = {
  fortaleza: 'CE', caucaia: 'CE', eusebio: 'CE', aquiraz: 'CE', maracanau: 'CE', itaitinga: 'CE', maranguape: 'CE', pacatuba: 'CE', sobral: 'CE', juazeiro: 'CE',
  natal: 'RN', parnamirim: 'RN', extremoz: 'RN', 'sao goncalo do amarante': 'RN', macaiba: 'RN', mossoro: 'RN',
  'joao pessoa': 'PB', cabedelo: 'PB', bayeux: 'PB', 'campina grande': 'PB', conde: 'PB',
  recife: 'PE', olinda: 'PE', jaboatao: 'PE', paulista: 'PE', ipojuca: 'PE',
  brasilia: 'DF', itapoa: 'DF', 'aguas claras': 'DF', taguatinga: 'DF', ceilandia: 'DF', samambaia: 'DF', guara: 'DF', sobradinho: 'DF',
  'belo horizonte': 'MG', contagem: 'MG', 'nova lima': 'MG', uberlandia: 'MG', salvador: 'BA', 'lauro de freitas': 'BA', maceio: 'AL', teresina: 'PI',
  'sao luis': 'MA', aracaju: 'SE', goiania: 'GO',
};
const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);
function uf(v) {
  const s = sem(v);
  if (!s) return '';
  const so = texto(v).toUpperCase();
  if (UFS.has(so)) return so;
  const fim = /(?:^|[^a-z])([a-z]{2})\.?$/.exec(s);
  if (fim && UFS.has(fim[1].toUpperCase())) return fim[1].toUpperCase();
  for (const [nome, sigla] of Object.entries(UF_NOMES).sort((a, b) => b[0].length - a[0].length)) if (new RegExp(`(^|[^a-z])${nome}([^a-z]|$)`).test(s)) return sigla;
  for (const [nome, sigla] of Object.entries(CIDADES)) if (new RegExp(`(^|[^a-z])${nome}([^a-z]|$)`).test(s)) return sigla;
  return '';
}

/* ---------- colunas pelo título (a ordem pode mudar de uma planilha para outra) ---------- */
const COL_FORM = {
  id: ['id'], conclusao: ['hora de conclusao'], nome: ['nome do condominio'], cnpj: ['cnpj do condominio'], estado: ['informar estado do contrato'],
  uh: ['numero total de unidades'], exec_nome: ['nome do executivo de vendas'], sindico_tipo: ['tipo de sindico'], exec_email: ['e-mail do executivo'],
  dia: ['dia do vencimento'], sindico_nome: ['nome do sindico'], sindico_cpf: ['cpf do sindico'], isencao: ['sindico isento'], sindico_email: ['qual e-mail do sindico'],
  sindico_tel: ['qual telefone de contato'], honor_a: ['qual o percentual de honorarios'], taxa: ['qual o percentual da taxa administrativa'], boleto: ['qual o valor do boleto'],
  honor_b: ['qual percentual de cobranca extrajudicial'], garantias: ['o que iremos garantir'], desconto: ['tem desconto de pontualidade'], desconto_dia: ['ate qual dia incide'],
  extra: ['possui taxa extra vigente'], parceiro_texto: ['contrato possui parceiro'], adm: ['possui administradora'], consultor: ['nome do responsavel (consultor'],
  cashback: ['contrato com cashback'], consultor_contato: ['qual o contato do consultor'], parceria: ['contrato com parceria'], entrega: ['o condominio e de entrega'],
  construtora: ['se sim, para pergunta anterior'], cashback_rec: ['se sim no item anterior'], cashback_pct: ['caso tenha cashback'], inicio: ['qual a data de inicio do contrato'],
  ant_valor: ['se sim para o item anterior, qual o valor'], ant_data: ['qual a data da antecipacao'], ant_prazo: ['a antecipacao acordada e permanente'],
  obs: ['existe alguma outra observacao'], ant_flag: ['antecipacao? (aux'], ant_det: ['valor/detalhe (aux'],
};
const COL_CTRL = {
  numero: ['no formulario', 'nº formulario', 'n formulario'], condominio: ['condominio'], cnpj: ['cnpj'], estado: ['estado'], dia: ['dia venc.', 'dia venc'], venc: ['1º venc.', '1o venc.', '1º venc'],
  adm: ['adm.', 'adm'], executivo: ['executivo'], sindico: ['sindico'], contrato: ['contrato'], data_contrato: ['data contrato'], doc: ['doc.', 'doc'], data_doc: ['data doc.', 'data doc'],
  vouch: ['vouch'], onboarding: ['onboarding'], data_onb: ['data onboarding'], boletos: ['emissao de boletos'], envio: ['envio e-mail/fisico', 'envio'], por: ['implantado por'],
  obs: ['obs.', 'obs'], mes: ['mes'], pct: ['% concluido'], ref: ['no form (ref.)', 'nº form (ref.)', 'n form (ref.)'],
};
function mapear(cab, cols) {
  const h = cab.map((x) => sem(x).replace(/^nº/, 'no').replace(/^n°/, 'no'));
  const out = {};
  for (const [k, nomes] of Object.entries(cols)) {
    const alvos = nomes.map((n) => sem(n).replace(/^nº/, 'no'));
    let i = h.findIndex((x) => alvos.includes(x)); // título exato primeiro
    if (i < 0) i = h.findIndex((x) => alvos.some((a) => a.length > 3 && x.startsWith(a)));
    out[k] = i;
  }
  return out;
}
const pega = (l, col, k) => (col[k] >= 0 ? texto(l[col[k]], 4000) : '');

/* ---------- leitura dos dois arquivos (linhas já como listas de células) ---------- */
function lerFormulario(linhas) {
  const ini = linhas.findIndex((l) => l.some((x) => sem(x).startsWith('nome do condominio')));
  if (ini < 0) throw new Error('No arquivo do Formulário não achei a coluna "Nome do Condomínio".');
  const col = mapear(linhas[ini], COL_FORM);
  const faltam = ['nome', 'cnpj', 'inicio', 'conclusao'].filter((k) => col[k] < 0);
  if (faltam.length) throw new Error(`No arquivo do Formulário faltam as colunas: ${faltam.join(', ')}.`);
  // a "linha do Forms" é a posição na planilha: o título é a linha 1
  return linhas.slice(ini + 1).map((l, k) => ({ linha: k + 2, l, col })).filter((x) => x.l.some((c) => texto(c)));
}
function lerControle(linhas) {
  const blocos = [];
  let ano = null, col = null;
  for (const l of linhas) {
    const c0 = sem(l[0]);
    if (!c0 && /^\d{4}$/.test(texto(l[1]))) { ano = Number(texto(l[1])); continue; }
    if (/^n.? ?formulario/.test(c0.replace('º', 'o'))) { col = mapear(l, COL_CTRL); continue; }
    if (col && /^\d+$/.test(texto(l[0]))) blocos.push({ ano, l, col });
  }
  if (!blocos.length) throw new Error('No arquivo do Controle não achei linhas com o "Nº FORMULÁRIO".');
  const c = blocos[0].col;
  const faltam = ['ref', 'condominio', 'pct', 'onboarding'].filter((k) => c[k] < 0);
  if (faltam.length) throw new Error(`No arquivo do Controle faltam as colunas: ${faltam.join(', ')}.`);
  return blocos;
}

/* ---------- formulário do portal a partir de uma resposta do Forms ---------- */
const GARANTIA = [['ordinaria', 'Taxa ordinária'], ['extra', 'Taxa extraordinária'], ['agua', 'Água'], ['gas', 'Gás'], ['fundo de reserva', 'Fundo de reserva'], ['fundo de obra', 'Fundo de obras']];
const RECEITAS = [['administrativa', 'Taxa administrativa'], ['juros', 'Juros'], ['multa', 'Multa'], ['honorario', 'Honorários'], ['tarifa', 'Tarifa bancária']];
const nao = (s) => !s || /^(nao|n\/a|-|0+|nenhum|nenhuma|sem)\b/.test(sem(s));
function formularioDe(r, avisos) {
  const g = (k) => pega(r.l, r.col, k);
  const cn = digitos(g('cnpj'));
  const ini = data(g('inicio'));
  if (ini.tipo === 'mes') avisos.push('início do contrato só com mês e ano: ficou o dia 1º');
  if (ini.tipo === 'invalida' || ini.tipo === 'vazia') avisos.push('sem data de início do contrato');
  const est = g('estado');
  const sigla = uf(est);
  if (!sigla && est) avisos.push(`estado "${texto(est, 40)}" sem UF reconhecida`);
  const garantias = GARANTIA.filter(([k]) => sem(g('garantias')).includes(k)).map(([, v]) => v);
  const cbTexto = sem(g('cashback'));
  const cbPct = numero(g('cashback_pct')) || numero(g('cashback'));
  const cashback = !cbTexto || /^nao/.test(cbTexto) ? 'nao' : cbPct === 5 || cbPct === 10 ? String(cbPct) : cbPct ? 'outro' : 'nao';
  const antFlag = sem(g('ant_flag'));
  if (antFlag.startsWith('verificar')) avisos.push('antecipação "a verificar" na planilha: entrou como não');
  const antecipacao = antFlag.startsWith('sim') ? 'sim' : 'nao';
  const parc = texto(g('parceria') || g('parceiro_texto'), 120).replace(/;$/, '');
  const temParceria = parc && !/nao tem parceria|^nao\b/.test(sem(parc));
  const adm = texto(g('adm'), 160);
  const desc = sem(g('desconto'));
  const isen = sem(g('isencao'));
  if (cn && cn.length === 14 && !F.cnpjOk(cn)) avisos.push('CNPJ com dígito verificador errado');
  return {
    nome: texto(g('nome'), 200), cnpj: cn.length === 14 ? cn.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : texto(g('cnpj'), 30), sem_cnpj: !cn,
    uf: sigla, cidade: texto(est, 80), uh_total: numero(g('uh')), dia_vencimento: numero(g('dia')),
    sindico_nome: texto(g('sindico_nome'), 160), sindico_cpf: texto(g('sindico_cpf'), 20), sindico_email: texto(g('sindico_email'), 160), sindico_telefone: texto(g('sindico_tel'), 60),
    sindico_tipo: /profission/.test(sem(g('sindico_tipo'))) ? 'profissional' : g('sindico_tipo') ? 'condomino' : '',
    sindico_isencao: /parcial/.test(isen) ? 'parcial' : /^(sim|integral|isento)/.test(isen) ? 'integral' : 'nao',
    taxa_adm: numero(g('taxa')), boleto: numero(g('boleto')), honorarios: numero(g('honor_b')) || numero(g('honor_a')),
    garantias, desconto_tipo: nao(desc) ? 'nenhum' : /%/.test(desc) ? 'percentual' : 'valor', desconto_valor: nao(desc) ? null : numero(desc),
    administradora: nao(adm) ? '' : adm.replace(/^sim[,.\s-]*/i, ''), consultor_nome: texto(g('consultor'), 120), consultor_telefone: texto(g('consultor_contato'), 120),
    parceria: temParceria ? 'sim' : 'nao', parceiros: temParceria ? [{ id: '', nome: parc }] : [],
    entrega: /^sim/.test(sem(g('entrega'))), construtora: texto(g('construtora'), 160),
    cashback, cashback_pct: cashback === 'outro' ? cbPct : null, cashback_receitas: RECEITAS.filter(([k]) => sem(g('cashback_rec')).includes(k)).map(([, v]) => v),
    antecipacao, antecipacao_valor: antecipacao === 'sim' ? numero(g('ant_valor')) || numero(g('ant_det')) : null,
    antecipacao_data: antecipacao === 'sim' ? data(g('ant_data')).dia : '', antecipacao_prazo: antecipacao === 'sim' ? texto(g('ant_prazo'), 120) : '',
    inicio_contrato: ini.dia, observacoes: texto(g('obs'), 4000),
    // respostas em texto livre que não têm campo próprio no formulário novo
    planilha: { taxa_extra: texto(g('extra'), 300), desconto: texto(g('desconto'), 200), desconto_ate: texto(g('desconto_dia'), 100), estado: texto(est, 120) },
  };
}

/* ---------- etapas do portal a partir de uma linha do Controle ---------- */
const ONB = { realizado: 'realizado', 'sindico myblue': 'sindico_myblue', marcado: 'marcado', 'a marcar': 'a_marcar' };
const ENVIO = { digital: 'email', ambos: 'ambos', fisico: 'fisico', 'e-mail': 'email', email: 'email' };
function etapasDe(c, ano, inicio, avisos) {
  const g = (k) => pega(c.l, c.col, k);
  const sim = (k) => sem(g(k)) === 'sim';
  const onb = ONB[sem(g('onboarding'))] || 'a_marcar';
  const dOnb = data(g('data_onb'));
  const dataOnb = dOnb.dia || (dOnb.dm ? `${ano || inicio.slice(0, 4)}-${pad(dOnb.dm[1])}-${pad(dOnb.dm[0])}` : '');
  // 1º vencimento "10/01": dia/mês, no ano do contrato (ou no seguinte, se cair antes do início)
  const v = data(g('venc'));
  let venc = v.dia;
  if (!venc && v.dm && inicio) {
    const a = Number(inicio.slice(0, 4));
    venc = `${a}-${pad(v.dm[1])}-${pad(v.dm[0])}`;
    if (venc < inicio.slice(0, 8) + '01') venc = `${a + 1}-${pad(v.dm[1])}-${pad(v.dm[0])}`;
    if (!valida(venc)) venc = '';
  }
  if (sem(g('boletos')) === 'em andamento') avisos.push('emissão de boletos "em andamento" na planilha');
  return {
    documentacao: { feito: sim('doc') }, vouch: { id: '' }, vouchFeito: sim('vouch'),
    onboarding: { situacao: onb, data: ['realizado', 'marcado'].includes(onb) ? dataOnb : '', hora: dOnb.hora || '', por: null },
    boletos: { feito: sim('boletos'), primeiro_vencimento: venc }, envio: { forma: ENVIO[sem(g('envio'))] || '' },
  };
}

/*
 * Confere e monta o plano. portal: { implantacoes: [{ id, cnpj, condominio }], condominios: [{ id, codigo, nome, razao_social, cnpj }],
 *   executivos: [{ id, nome, email }], equipe: [{ id, nome }] }
 * Devolve { itens, resumo }. Cada item: situacao 'pronta' | 'aviso' | 'decisao' | 'fora' (com motivo).
 */
function conferir({ formulario, controle }, portal) {
  const respostas = lerFormulario(formulario);
  const linhasCtrl = controle ? lerControle(controle) : [];
  const porLinha = new Map(respostas.map((r) => [r.linha, r]));
  const itens = [];
  const usadas = new Set();
  const cnpjPortal = new Map(portal.implantacoes.filter((x) => digitos(x.cnpj).length === 14).map((x) => [digitos(x.cnpj), x]));
  const carteiraCnpj = new Map(portal.condominios.filter((x) => digitos(x.cnpj).length === 14).map((x) => [digitos(x.cnpj), x]));
  const carteiraNome = new Map();
  for (const c of portal.condominios) for (const n of [c.nome, c.razao_social]) if (sem(n)) carteiraNome.set(sem(n), c);
  const exEmail = new Map(portal.executivos.filter((x) => x.email).map((x) => [sem(x.email), x]));

  function completar(it, r) {
    const f = it.formulario;
    const g = (k) => pega(r.l, r.col, k);
    // executivo: pelo e-mail do formulário, senão pelo nome
    const ex = exEmail.get(sem(g('exec_email'))) || (g('exec_nome') ? carteira.acharPessoa(g('exec_nome'), portal.executivos) : null);
    it.executivo = ex ? { id: ex.id, nome: ex.nome } : { id: null, nome: texto(g('exec_nome'), 120) };
    if (!ex && g('exec_nome')) it.avisos.push(`executivo "${texto(g('exec_nome'), 60)}" não cadastrado no portal`);
    const cart = (f.cnpj && carteiraCnpj.get(digitos(f.cnpj))) || carteiraNome.get(sem(f.nome));
    it.carteira = cart ? { id: cart.id, codigo: cart.codigo, nome: cart.nome } : null;
    const ja = f.cnpj && cnpjPortal.get(digitos(f.cnpj));
    if (ja) { it.situacao = 'fora'; it.motivo = `já está no portal (${ja.protocolo || 'implantação ' + ja.id}): vale a do portal`; }
    const conc = data(g('conclusao'));
    if (conc.tipo === 'serie') it.avisos.push('data da resposta em número do Excel: convertida');
    it.enviado = conc.dia;
  }

  // 1) linhas do Controle (2026 em diante): resposta pela linha do Forms
  for (const c of linhasCtrl) {
    const g = (k) => pega(c.l, c.col, k);
    const ref = Number(digitos(g('ref')));
    const r = porLinha.get(ref);
    const num = Number(digitos(c.l[0]));
    const avisos = [];
    const base = { chave: `C${ref || 'x' + num}`, fonte: 'controle', numero: num, linha_forms: ref || null, ano: c.ano, avisos };
    if (r) usadas.add(ref);
    const obs = g('obs');
    if (/teste|desconsider/.test(sem(obs))) {
      itens.push({ ...base, condominio: g('condominio') || (r ? pega(r.l, r.col, 'nome') : ''), situacao: 'fora', motivo: `desconsiderada na planilha ("${texto(obs, 80)}")` });
      continue;
    }
    const f = r ? formularioDe(r, avisos) : { nome: g('condominio'), cnpj: g('cnpj'), uf: uf(g('estado')), planilha: {} };
    // o Controle é a referência de 2026: nome, CNPJ, UF, dia de vencimento e data do contrato vêm dele quando preenchidos
    if (g('condominio')) f.nome = texto(g('condominio'), 200);
    if (digitos(g('cnpj')).length === 14) f.cnpj = g('cnpj');
    if (UFS.has(g('estado').toUpperCase())) f.uf = g('estado').toUpperCase();
    if (numero(g('dia'))) f.dia_vencimento = numero(g('dia'));
    const dc = data(g('data_contrato'));
    if (dc.dia) {
      f.inicio_contrato = dc.dia;
      // a data do contrato do Controle vale sobre a do Forms: some o aviso sobre a data do Forms
      for (let k = avisos.length - 1; k >= 0; k--) if (/^início do contrato só com mês|^sem data de início/.test(avisos[k])) avisos.splice(k, 1);
    }
    const inicio = f.inicio_contrato || (c.ano ? `${c.ano}-01-01` : '');
    const etapas = etapasDe(c, c.ano, inicio, avisos);
    const pct = numero(g('pct'));
    const dd = data(g('data_doc'));
    const it = { ...base, condominio: f.nome, cnpj: f.cnpj, uf: f.uf, inicio, mes: inicio.slice(0, 7), formulario: f, etapas,
      pct_planilha: pct == null ? null : pct, implantado_por: g('por'), obs: texto(obs, 300), data_doc: dd.dia, situacao: r ? 'pronta' : 'decisao',
      motivo: r ? '' : 'a linha do Forms indicada não existe no arquivo do Formulário: entra só com os dados do Controle' };
    if (r) completar(it, r);
    else { it.executivo = { id: null, nome: g('executivo') }; it.carteira = null; it.enviado = dd.dia; }
    const resp = it.implantado_por ? carteira.acharPessoa(it.implantado_por, portal.equipe) : null;
    it.responsavel = resp ? { id: resp.id, nome: resp.nome } : { id: null, nome: it.implantado_por };
    if (it.implantado_por && !resp) avisos.push(`"${texto(it.implantado_por, 60)}" não está na equipe de Implantação do portal: fica só o nome`);
    if (!it.enviado) it.enviado = dd.dia || inicio;
    it.concluida = pct === 100;
    if (!it.concluida && pct == null) avisos.push('sem % concluído na planilha');
    itens.push(it);
  }

  // 2) respostas que não estão no Controle: histórico (anos anteriores), concluídas
  for (const r of respostas) {
    if (usadas.has(r.linha)) continue;
    const avisos = [];
    const f = formularioDe(r, avisos);
    const it = { chave: `F${r.linha}`, fonte: 'formulario', numero: Number(digitos(pega(r.l, r.col, 'id'))) || null, linha_forms: r.linha, avisos,
      condominio: f.nome, cnpj: f.cnpj, uf: f.uf, inicio: f.inicio_contrato, mes: (f.inicio_contrato || '').slice(0, 7), ano: f.inicio_contrato ? Number(f.inicio_contrato.slice(0, 4)) : null,
      formulario: f, etapas: null, concluida: true, situacao: 'pronta', motivo: '' };
    completar(it, r);
    if (!it.carteira) avisos.push('não achado na Carteira (pelo CNPJ ou pelo nome)');
    itens.push(it);
  }

  // 3) repetidos: mesmo condomínio (nome) no mesmo ano → vale o envio mais recente
  const grupos = new Map();
  for (const it of itens) {
    if (it.situacao === 'fora' || !it.condominio) continue;
    const k = `${it.ano}|${sem(it.condominio)}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(it);
  }
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => String(b.enviado || '').localeCompare(String(a.enviado || '')) || (b.linha_forms || 0) - (a.linha_forms || 0));
    for (const x of g.slice(1)) { x.situacao = 'fora'; x.motivo = `substituída pelo envio mais recente do mesmo condomínio no ano (Nº ${g[0].numero})`; }
  }
  // mesmo CNPJ com nome diferente, no mesmo ano: ficam os dois, com aviso
  const porCnpj = new Map();
  for (const it of itens) {
    if (it.situacao === 'fora' || digitos(it.cnpj).length !== 14) continue;
    const k = `${it.ano}|${digitos(it.cnpj)}`;
    if (!porCnpj.has(k)) porCnpj.set(k, []);
    porCnpj.get(k).push(it);
  }
  for (const g of porCnpj.values()) if (g.length > 1) for (const x of g) x.avisos.push(`mesmo CNPJ de outra implantação do ano (Nº ${g.filter((y) => y !== x).map((y) => y.numero).join(', ')}): confira`);
  for (const it of itens) if (it.situacao === 'pronta' && it.avisos.length) it.situacao = 'aviso';

  // resumo, com os totais por mês do Controle para conferir com a planilha
  const conta = (s) => itens.filter((x) => x.situacao === s).length;
  const doCtrl = itens.filter((x) => x.fonte === 'controle' && x.situacao !== 'fora');
  const porMes = {};
  for (const x of doCtrl) {
    const m = x.mes || 'sem mês';
    porMes[m] = porMes[m] || { contratos: 0, soma: 0, concluidos: 0 };
    porMes[m].contratos++; porMes[m].soma += x.pct_planilha || 0; if (x.concluida) porMes[m].concluidos++;
  }
  const anosHist = {};
  for (const x of itens.filter((y) => y.fonte === 'formulario' && y.situacao !== 'fora')) anosHist[x.ano || 'sem data'] = (anosHist[x.ano || 'sem data'] || 0) + 1;
  return {
    itens,
    resumo: {
      respostas: respostas.length, linhas_controle: linhasCtrl.length,
      pronta: conta('pronta'), aviso: conta('aviso'), decisao: conta('decisao'), fora: conta('fora'),
      desconsideradas: itens.filter((x) => x.situacao === 'fora' && /^desconsiderada/.test(x.motivo)).length,
      substituidas: itens.filter((x) => x.situacao === 'fora' && /^substitu/.test(x.motivo)).length,
      ja_no_portal: itens.filter((x) => x.situacao === 'fora' && /^já está no portal/.test(x.motivo)).length,
      controle: doCtrl.length, historico: itens.filter((x) => x.fonte === 'formulario' && x.situacao !== 'fora').length, anos_historico: anosHist,
      por_mes: Object.keys(porMes).sort().map((m) => ({ mes: m, contratos: porMes[m].contratos, concluidos: porMes[m].concluidos, pct_medio: Math.round(porMes[m].soma / porMes[m].contratos) })),
    },
  };
}

module.exports = { conferir, data, uf, numero, lerFormulario, lerControle };

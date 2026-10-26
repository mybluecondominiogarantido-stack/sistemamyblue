'use strict';
/*
 * Controle de Emissão de Boletos ← Carteira de condomínios.
 *
 * A carteira do portal é a fonte dos condomínios do controle. Cada condomínio do cadastro da
 * ferramenta (documento config/cadastro, { conds: { id: {...} } }) fica vinculado pelo ID Vouch (cart).
 * O que a carteira muda chega ao controle a partir da primeira competência ainda sem emissão:
 *   - condomínio novo entra nessa competência (ou no mês seguinte à vigência, quando ela é mais
 *     recente: o 1º boleto sai pela Implantação);
 *   - condomínio distratado sai a partir dela (os meses já em andamento continuam com ele);
 *   - nome, assistente de crédito, UF e vencimento são atualizados.
 * Nomes só parecidos e condomínios que estão no controle e não na carteira nunca mudam sozinhos:
 * a coordenação confere na janela da ferramenta no portal. A sincronização automática (carteira
 * alterada, competência criada) só começa depois da primeira conferência.
 */
const { chaveNome } = require('./implantacao');
const { semAcento } = require('./carteira');

const MODULO = 'boletos';
const CADASTRO = 'config/cadastro';
const CAMPOS = ['nome', 'resp', 'uf', 'regra', 'dia'];

const pad = (n) => String(n).padStart(2, '0');
const proximaComp = (c) => { let y = +c.slice(0, 4); let m = +c.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return `${y}-${pad(m)}`; };
const compAnterior = (c) => { let y = +c.slice(0, 4); let m = +c.slice(5, 7) - 1; if (m < 1) { m = 12; y--; } return `${y}-${pad(m)}`; };
const ultimoDia = (c) => `${c}-${pad(new Date(Date.UTC(+c.slice(0, 4), +c.slice(5, 7), 0)).getUTCDate())}`;
const dataIso = (v) => { if (!v) return null; const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? null : d.toISOString().slice(0, 10); };
const hojeSp = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/* "10" → dia fixo 10; "5º DIA ÚTIL" → 5º dia útil; o resto não dá para usar */
function vencimento(txt) {
  const s = String(txt == null ? '' : txt).trim();
  const n = parseInt((s.match(/\d+/) || [])[0], 10);
  if (!(n >= 1 && n <= 31)) return null;
  return { regra: /[º°]|UTIL|ÚTIL/i.test(s) ? 'Dia útil' : 'Dia fixo', dia: n };
}
/* "JAIANI NOGUEIRA - 4618" → "JAIANI" (o controle usa o primeiro nome) */
const responsavel = (v) => String(v == null ? '' : v).replace(/\s*-\s*\d+\s*$/, '').trim().split(/\s+/)[0].toUpperCase();
/* "Torre Paris - PB" na comarca PB → "Torre Paris" (o sufixo da UF não entra na comparação) */
const semUf = (nome, uf) => String(nome || '').replace(new RegExp(`\\s+-\\s+${uf || '[A-Z]{2}'}\\s*$`, 'i'), '');

/* chaves para comparar nomes: sem acento, sem "Condomínio/Residencial…" (curta) e com tudo (longa) */
const PREFIXOS = new Set(['ED', 'COND', 'RES', 'CONJ']);
function chaves(nome, uf) {
  const base = semUf(nome, uf);
  const curta = chaveNome(base).split(' ').filter((w) => w && !PREFIXOS.has(w));
  const longa = chaveNome(base.replace(/[-(),.&]/g, ' ')).split(' ').filter(Boolean);
  const tudo = semAcento(base).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return { curta: curta.join(''), palavras: new Set(curta), tudo: tudo.join(''), numeros: [...curta, ...longa].filter((w) => /^\d+$/.test(w)) };
}
const solta = (s) => s.replace(/Y/g, 'I').replace(/(.)\1+/g, '$1');
function lev(a, b) {
  if (a === b) return 0;
  let p = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const c = [i];
    for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[b.length];
}
/* 0 a 1: quanto dois nomes parecem ser o mesmo condomínio */
function semelhanca(a, b) {
  const na = new Set(a.numeros); const nb = new Set(b.numeros);
  if (na.size && nb.size && ![...na].some((n) => nb.has(n))) return 0; // Itapoã 15 x Itapoã 18, Vila Jardim IV x V
  let s = 0;
  for (const [x, y] of [[a.curta, b.curta], [a.tudo, b.tudo]]) {
    if (!x || !y) continue;
    const sx = solta(x); const sy = solta(y);
    if (sx === sy) s = Math.max(s, 0.97);
    if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) s = Math.max(s, 0.86);
    s = Math.max(s, 1 - lev(sx, sy) / Math.max(sx.length, sy.length));
  }
  const comuns = [...a.palavras].filter((w) => b.palavras.has(w)).length;
  if (comuns >= 2) s = Math.max(s, comuns / Math.max(a.palavras.size, b.palavras.size));
  return s;
}

/* vencimento de um condomínio numa competência, com a mesma regra da ferramenta (vencOf) */
function vencimentoNoMes(comp, c, feriados = {}) {
  const util = (i) => { const w = new Date(i + 'T00:00:00Z').getUTCDay(); return w !== 0 && w !== 6 && !feriados[i]; };
  const soma = (i, n) => new Date(Date.UTC(+i.slice(0, 4), +i.slice(5, 7) - 1, +i.slice(8, 10)) + n * 864e5).toISOString().slice(0, 10);
  if (c.regra === 'Dia útil') { let x = soma(`${comp}-01`, -1); let n = 0; while (n < c.dia) { x = soma(x, 1); if (util(x)) n++; } return x; }
  let x = `${comp}-${pad(Math.min(Number(c.dia), +ultimoDia(comp).slice(8)))}`;
  while (!util(x)) x = soma(x, 1);
  return x;
}
/* o condomínio aparece na competência? (mesma regra da ferramenta) */
const noMes = (c, comp) => (c.sit !== 'Distrato' || (c.distrato && c.distrato >= `${comp}-01`)) && (!c.desde || c.desde <= comp);

/* Primeira competência que recebe as mudanças: a mais antiga, a partir do mês atual, ainda sem emissão. */
function competenciaInicial(meses, hoje) {
  const atual = hoje.slice(0, 7);
  const comps = Object.keys(meses || {}).filter((c) => /^\d{4}-\d{2}$/.test(c)).sort();
  const semEmissao = (c) => { const m = meses[c] || {}; return !m.fechado && !Object.values(m.itens || {}).some((i) => i && i.emi); };
  const livre = comps.find((c) => c >= atual && semEmissao(c));
  if (livre) return livre;
  // todas em andamento: a próxima depois da última (ou o mês atual, se ainda não foi criado)
  const ref = [...comps, atual].sort().pop();
  return comps.includes(ref) ? proximaComp(ref) : ref;
}

/*
 * O que muda no cadastro do controle para ficar igual à carteira.
 * carteira: linhas da tabela condominios; conds: config/cadastro.conds; meses: { comp: doc do mês };
 * distratoEm: { codigo: 'aaaa-mm-dd' } (quando a carteira marcou o distrato); feriados: config/feriados.dias.
 * Vencimento novo vale da competência inicial em diante: os meses anteriores guardam o que já tinham (item.venc).
 * Cada item tem uma chave (k) para a conferência escolher o que aplicar.
 */
function planejar({ carteira, conds, meses, hoje, distratoEm = {}, feriados = {} }) {
  const comp = competenciaInicial(meses, hoje);
  const porCodigo = new Map(carteira.map((c) => [String(c.codigo), c]));
  const ligado = new Map(); // id do controle → condomínio da carteira
  const usados = new Set();
  for (const [id, c] of Object.entries(conds)) {
    const x = c.cart && porCodigo.get(String(c.cart));
    if (x && !usados.has(x.codigo)) { ligado.set(id, x); usados.add(x.codigo); }
  }
  const cartK = new Map(carteira.map((x) => [x.codigo, chaves(x.nome, x.comarca)]));
  const condK = new Map(Object.entries(conds).map(([id, c]) => [id, chaves(c.nome, c.uf)]));
  const soltos = () => Object.keys(conds).filter((id) => !ligado.has(id) && !(conds[id].cart && porCodigo.has(String(conds[id].cart))));
  const vinculos = [];
  // mesmo nome e mesma UF: vínculo direto, sem conferência
  for (const id of soltos()) {
    const k = condK.get(id);
    const iguais = carteira.filter((x) => !usados.has(x.codigo) && x.comarca === conds[id].uf && solta(cartK.get(x.codigo).curta) === solta(k.curta));
    if (iguais.length === 1) { ligado.set(id, iguais[0]); usados.add(iguais[0].codigo); vinculos.push({ k: 'v:' + id, id, codigo: iguais[0].codigo, auto: true }); }
  }
  // nomes parecidos: sugestão para conferir (o par mais parecido primeiro, um para um)
  const pares = [];
  for (const id of soltos()) {
    for (const x of carteira) {
      if (usados.has(x.codigo)) continue;
      let s = semelhanca(condK.get(id), cartK.get(x.codigo));
      if (x.comarca !== conds[id].uf) s -= 0.15;
      const v = vencimento(x.vencimento);
      if (v && v.regra === conds[id].regra && v.dia === Number(conds[id].dia)) s += 0.03;
      if (s >= 0.72) pares.push({ id, x, s });
    }
  }
  pares.sort((a, b) => b.s - a.s);
  const sugeridos = new Set();
  const parecidos = [];
  for (const p of pares) {
    if (sugeridos.has(p.id) || usados.has(p.x.codigo)) continue;
    sugeridos.add(p.id); usados.add(p.x.codigo);
    const c = conds[p.id];
    parecidos.push({ k: 'v:' + p.id, id: p.id, codigo: p.x.codigo, nome: c.nome, uf: c.uf, nome_carteira: p.x.nome, uf_carteira: p.x.comarca,
      situacao_carteira: p.x.situacao, nota: Math.round(Math.min(p.s, 1) * 100), mesma_uf: p.x.comarca === c.uf });
  }

  const anterior = compAnterior(comp);
  const fimAnterior = ultimoDia(anterior);
  const quandoSai = (codigo) => { const d = distratoEm[codigo]; return d && d >= `${anterior}-01` && d <= fimAnterior ? d : fimAnterior; };
  const dadosDe = (x) => {
    const v = vencimento(x.vencimento);
    const d = { nome: String(x.nome).trim(), uf: String(x.comarca || '').toUpperCase() };
    const r = responsavel(x.assistente_credito);
    if (r) d.resp = r;
    if (v) Object.assign(d, v);
    return d;
  };

  // vinculados: o que a carteira mudou
  const alteracoes = [];
  const vinculadosAgora = [...ligado.entries()];
  const comSugestao = (id) => parecidos.find((p) => p.id === id);
  const avaliar = (id, x, k) => {
    const c = conds[id];
    const d = dadosDe(x);
    const patch = {};
    for (const f of CAMPOS) if (d[f] !== undefined && d[f] !== '' && String(d[f]) !== String(c[f] ?? '')) patch[f] = d[f];
    // acento, letra dobrada ou "Ed." não é troca de nome
    if (patch.nome && solta(chaves(d.nome, d.uf).curta) === solta(chaves(c.nome, c.uf).curta)) delete patch.nome;
    const congelar = {};
    if ('regra' in patch || 'dia' in patch) {
      for (const [mc, m] of Object.entries(meses || {})) {
        if (mc >= comp || !noMes(c, mc) || (m.itens && m.itens[id] && m.itens[id].venc)) continue;
        congelar[mc] = vencimentoNoMes(mc, c, feriados);
      }
    }
    const distratado = x.situacao === 'DISTRATADO';
    if (distratado && c.sit !== 'Distrato') { patch.sit = 'Distrato'; patch.distrato = quandoSai(x.codigo); }
    if (!distratado && c.sit === 'Distrato') { patch.sit = 'Ativo'; patch.distrato = null; patch.desde = comp; }
    if (Object.keys(patch).length) alteracoes.push({ k, id, codigo: x.codigo, nome: c.nome, patch, congelar, ant: Object.fromEntries(Object.keys(patch).map((f) => [f, c[f] ?? null])) });
  };
  for (const [id, x] of vinculadosAgora) avaliar(id, x, 'a:' + id);
  for (const p of parecidos) avaliar(p.id, porCodigo.get(p.codigo), 'v:' + p.id);

  // na carteira e não no controle
  const novos = [];
  const avisos = [];
  for (const x of carteira) {
    if (usados.has(x.codigo)) continue;
    const d = dadosDe(x);
    if (!d.regra) { avisos.push({ codigo: x.codigo, nome: x.nome, motivo: `vencimento "${x.vencimento || ''}" não reconhecido` }); continue; }
    const vig = dataIso(x.inicio_contrato);
    const depoisDaVigencia = vig ? proximaComp(vig.slice(0, 7)) : comp;
    const novo = { ...d, resp: d.resp || '—', cart: x.codigo };
    if (x.situacao === 'DISTRATADO') Object.assign(novo, { sit: 'Distrato', distrato: distratoEm[x.codigo] || null });
    else Object.assign(novo, { sit: 'Ativo', desde: depoisDaVigencia > comp ? depoisDaVigencia : comp });
    novos.push({ k: 'n:' + x.codigo, codigo: x.codigo, dados: novo });
  }
  // no controle e não na carteira
  const fora = soltos().filter((id) => !comSugestao(id) && conds[id].sit !== 'Distrato')
    .map((id) => ({ k: 's:' + id, id, nome: conds[id].nome, uf: conds[id].uf, resp: conds[id].resp, patch: { sit: 'Distrato', distrato: fimAnterior } }));

  return { comp, vinculados: ligado.size, vinculos, parecidos, alteracoes, novos, fora, avisos };
}

/* chaves que a sincronização automática aplica (o resto espera a conferência) */
const automaticas = (plano) => new Set([...plano.vinculos.map((x) => x.k), ...plano.alteracoes.filter((x) => x.k.startsWith('a:')).map((x) => x.k), ...plano.novos.map((x) => x.k)]);

/* id novo no cadastro do controle para um condomínio da carteira */
function idNovo(codigo, conds) {
  const base = 'cv' + String(codigo).replace(/[^A-Za-z0-9]/g, '').slice(0, 30);
  let id = base; let n = 2;
  while (conds[id]) id = `${base}-${n++}`;
  return id;
}

/* patch do config/cadastro e linhas do Histórico da ferramenta para as chaves escolhidas */
function montar(plano, conds, escolhidas) {
  const sim = (k) => escolhidas.has(k);
  const patch = {};
  const meses = {}; // competência → { id: { venc } } (vencimento que o mês já tinha)
  const log = [];
  const pega = (id) => (patch[id] = patch[id] || {});
  for (const v of plano.vinculos) if (sim(v.k)) pega(v.id).cart = v.codigo;
  for (const p of plano.parecidos) if (sim(p.k)) pega(p.id).cart = p.codigo;
  for (const a of plano.alteracoes) {
    if (!sim(a.k)) continue;
    Object.assign(pega(a.id), a.patch);
    for (const [mc, venc] of Object.entries(a.congelar || {})) (meses[mc] = meses[mc] || {})[a.id] = { venc };
    const acao = a.patch.sit === 'Distrato' ? 'Carteira: distrato' : a.patch.sit === 'Ativo' ? 'Carteira: reativado' : 'Carteira: dados atualizados';
    const vis = Object.keys(a.patch).filter((f) => f !== 'desde');
    if (vis.length) log.push({ x: 'cad', c: 'cadastro', k: a.id, n: a.patch.nome || a.nome, a: acao, ant: Object.fromEntries(vis.map((f) => [f, a.ant[f] ?? ''])), dep: Object.fromEntries(vis.map((f) => [f, a.patch[f] ?? ''])) });
  }
  const todos = { ...conds };
  for (const n of plano.novos) {
    if (!sim(n.k)) continue;
    const id = idNovo(n.codigo, todos);
    todos[id] = n.dados; patch[id] = n.dados;
    log.push({ x: 'cad', c: 'cadastro', k: null, n: n.dados.nome, a: n.dados.sit === 'Distrato' ? 'Carteira: distratado registrado' : `Carteira: condomínio novo (a partir de ${n.dados.desde})`, ant: {}, dep: {} });
  }
  for (const f of plano.fora) {
    if (!sim(f.k)) continue;
    Object.assign(pega(f.id), f.patch);
    log.push({ x: 'cad', c: 'cadastro', k: f.id, n: f.nome, a: 'Fora da carteira: distrato', ant: { sit: 'Ativo', distrato: '' }, dep: { ...f.patch } });
  }
  return { patch, meses, log };
}

function criarBoletosCarteira({ db, documentos, espera = 3000 }) {
  async function ler() {
    const m = await db.um('SELECT slug, config FROM modulos WHERE slug = $1', [MODULO]);
    if (!m) return null;
    const cad = await documentos.ler(MODULO, CADASTRO);
    const meses = Object.fromEntries((await documentos.listar(MODULO, 'meses')).map((x) => [x.id, x]));
    const fer = await documentos.ler(MODULO, 'config/feriados');
    const carteira = (await db.q(`SELECT codigo, nome, situacao, comarca, vencimento, assistente_credito, to_char(inicio_contrato, 'YYYY-MM-DD') AS inicio_contrato
      FROM condominios ORDER BY nome`)).rows;
    // quando a carteira marcou o distrato (edição na tela da carteira)
    const distratoEm = {};
    for (const r of (await db.q(`SELECT c.codigo, to_char(MAX(a.quando) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS quando FROM auditoria a JOIN condominios c ON c.id::text = a.detalhe->>'id'
      WHERE a.acao = 'condominio_editado' AND a.detalhe->'mudancas'->'situacao'->>1 = 'DISTRATADO' GROUP BY c.codigo`)).rows) distratoEm[r.codigo] = r.quando;
    return { modulo: m, conds: (cad && cad.conds) || {}, meses, carteira, distratoEm, feriados: (fer && fer.dias) || {} };
  }

  async function previa(hoje = hojeSp()) {
    const x = await ler();
    if (!x) return null;
    return { ...planejar({ ...x, hoje }), ativa: !!(x.modulo.config.carteira && x.modulo.config.carteira.ativa), sem_cadastro: !Object.keys(x.conds).length };
  }

  // uma aplicação por vez (a conferência e o automático não podem duplicar um condomínio novo)
  let rodando = Promise.resolve();
  const emFila = (fn) => { const p = rodando.then(fn); rodando = p.catch(() => {}); return p; };

  /* aplica as chaves escolhidas (null = só as automáticas) e devolve o resumo */
  async function aplicarAgora({ escolhidas = null, usuario = null, hoje = hojeSp() } = {}) {
    const x = await ler();
    if (!x || !Object.keys(x.conds).length) return { aplicadas: 0 };
    const plano = planejar({ ...x, hoje });
    const chavesOk = escolhidas ? new Set(escolhidas) : automaticas(plano);
    const { patch, meses, log } = montar(plano, x.conds, chavesOk);
    const ops = [];
    // primeiro os meses em andamento guardam o vencimento que tinham, depois o cadastro muda
    for (const [mc, itens] of Object.entries(meses)) ops.push({ op: 'update', path: `meses/${mc}`, data: { itens } });
    if (Object.keys(patch).length) ops.push({ op: 'update', path: CADASTRO, data: { conds: patch } });
    if (log.length) {
      const agora = new Date().toISOString();
      const u = usuario ? `mb-${usuario.id}` : null;
      const e = {};
      log.forEach((l, i) => { e[`${agora.slice(11, 19).replace(/:/g, '')}-cart${String(i).padStart(4, '0')}`] = { t: agora, u, ...l }; });
      const id = `log/${agora.slice(0, 13).replace('T', '-')}`;
      const existe = await documentos.ler(MODULO, id);
      ops.push(existe ? { op: 'update', path: id, data: { t: agora, e } } : { op: 'set', path: id, data: { t: agora, e } });
    }
    if (ops.length) await documentos.gravar(MODULO, ops, usuario ? `mb-${usuario.id}` : 'portal', usuario ? usuario.id : null);
    if (escolhidas) await db.q(`UPDATE modulos SET config = config || $1::jsonb WHERE slug = $2`, [JSON.stringify({ carteira: { ativa: true, conferido_em: new Date().toISOString() } }), MODULO]);
    return { comp: plano.comp, aplicadas: Object.keys(patch).length, registros: log.length };
  }

  /* depois da 1ª conferência: carteira alterada ou competência criada → aplica o automático (agrupa vários pedidos) */
  let timer = null;
  function agendar(usuario = null) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      emFila(async () => {
        const m = await db.um('SELECT config FROM modulos WHERE slug = $1', [MODULO]);
        if (!m || !m.config || !m.config.carteira || !m.config.carteira.ativa) return;
        await aplicarAgora({ usuario });
      }).catch((e) => console.error('[boletos-carteira]', e.message));
    }, espera);
    if (timer.unref) timer.unref();
  }
  const aguardar = () => new Promise((ok) => setTimeout(ok, 0)).then(() => rodando);

  const aplicar = (opcoes) => emFila(() => aplicarAgora(opcoes));
  return { previa, aplicar, agendar, aguardar };
}

module.exports = { MODULO, criarBoletosCarteira, planejar, automaticas, montar, vencimento, vencimentoNoMes, responsavel, competenciaInicial, semelhanca, chaves };

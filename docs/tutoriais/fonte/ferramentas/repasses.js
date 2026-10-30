'use strict';
/*
 * Roteiro do tutorial do Controle de Repasses (setor Crédito).
 * A ferramenta guarda os dados no banco do portal (localStorage "repasses:<coleção>/<id>",
 * espelhado em /api/armazenamento/repasses) e lê a carteira em /api/carteira.
 * O HTML traz embutida a planilha real (EMBED.seed: lançamentos, cadastro, contas e regras, com
 * nomes reais) e uma tabela de apelidos reais (ALIAS): na cópia da gravação, os dois viram vazios.
 * Tudo o que aparece no vídeo é fictício e gerado aqui, com datas relativas ao dia da gravação.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const FUSO = 'America/Sao_Paulo';
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const quadro = (t, slug) => t.p.frameLocator(`iframe[data-slug="${slug}"]`);
const noQuadro = (t, slug, fn, arg) => t.p.locator(`iframe[data-slug="${slug}"]`).evaluate((el, [fn, arg]) => new el.contentWindow.Function('arg', fn)(arg), [fn, arg]);

/* ---------- datas (dias úteis com os feriados da própria ferramenta) ---------- */
let FER = null;
function feriados() {
  if (FER) return FER;
  FER = {};
  try {
    const arq = JSON.parse(process.env.FERRAMENTAS || '{}').repasses;
    const m = fs.readFileSync(arq, 'utf8').match(/"fer":(\{[^}]*\})/);
    if (m) FER = JSON.parse(m[1]);
  } catch {}
  return FER;
}
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: FUSO });
const somar = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const util = (iso) => { const w = new Date(iso + 'T12:00:00Z').getUTCDay(); return w !== 0 && w !== 6 && !feriados()[iso]; };
const utilApos = (iso) => { let d = somar(iso, 1); while (!util(d)) d = somar(d, 1); return d; };
const utilEmOuApos = (iso) => (util(iso) ? iso : utilApos(iso));
const utilAntes = (iso) => { let d = somar(iso, -1); while (!util(d)) d = somar(d, -1); return d; };
const isoDe = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const br = (iso) => iso.split('-').reverse().join('/');
const brl = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- carteira fictícia do cenário (cenario.js) ---------- */
const CONDS = [
  { k: 'Cond. Jardim Azul - SP', a: 'Jardim Azul', u: 'SP', base: 41800, conta: ['Banco Exemplo (001)', '1520', '40211-3'] },
  { k: 'Ed. Solar das Palmeiras - SP', a: 'Solar das Palmeiras', u: 'SP', base: 27450, conta: ['Banco Modelo (237)', '0871', '15530-8'] },
  { k: 'Res. Primavera - CE', a: 'Primavera', u: 'CE', base: 18920, conta: ['Banco Exemplo (001)', '3304', '77102-5'] },
  { k: 'Cond. Vila Rica - PE', a: 'Vila Rica', u: 'PE', base: 35260, conta: ['Banco Fictício (341)', '2290', '08814-1'] },
  { k: 'Ed. Aurora - SP', a: 'Aurora', u: 'SP', base: 12380, conta: ['Banco Modelo (237)', '1102', '30090-2'] },
  { k: 'Res. Bela Vista - BA', a: 'Bela Vista', u: 'BA', base: 9840, conta: ['Banco Exemplo (001)', '0455', '61207-9'] },
];
const contaStr = (c) => `${c[0]} - Ag ${c[1]} - Ct ${c[2]} (Corrente)`;
const C = Object.fromEntries(CONDS.map((c) => [c.a, c]));

/* datas usadas no vídeo */
function datas() {
  const H = hoje();
  const N1 = utilApos(H), N2 = utilApos(N1);
  return { H, N1, N2, y: +H.slice(0, 4), m: +H.slice(5, 7) };
}

/* lançamentos fictícios gravados antes do vídeo */
function lancamentos() {
  const { H, N1, N2, y, m } = datas();
  const lim = somar(H, 16);
  const L = [];
  const add = (cond, d, v, t, desc, extra = {}) => {
    if (d > lim) return;
    const r = { a: cond.a, d, v: Math.round(v * 100) / 100, c: cond.k, u: cond.u, k: contaStr(cond.conta), p: desc, ...extra };
    if (t && t !== 'Repasse Normal') r.t = t;
    if (r.k === '') delete r.k;
    L.push(r);
  };
  const osc = (i, j) => 0.9 + ((i * 37 + j * 53) % 21) / 100; // variação fixa, sem sorteio
  for (let mm = 1; mm <= m + 1; mm++) {
    const yy = mm > 12 ? y + 1 : y, mes = mm > 12 ? 1 : mm;
    const ref = `${yy} - ${MESES[mes - 1]}`;
    CONDS.forEach((c, i) => {
      if (c.a === 'Bela Vista' && mes > 4) return; // distratado
      const venc = utilEmOuApos(isoDe(yy, mes, 10));
      add(c, utilApos(venc), c.base * osc(i, mes), 'Repasse Normal', `Repasse - ${c.a.toUpperCase()} (${ref})`);
      if (['Jardim Azul', 'Vila Rica'].includes(c.a)) {
        const d2 = utilEmOuApos(isoDe(yy, mes, 20));
        add(c, d2, c.base * 0.21 * osc(i + 3, mes), 'Repasse Normal', `Repasse - ${c.a.toUpperCase()} (${ref}, 2º Rateio)`);
      }
    });
    // antecipações no 1º dia útil e não garantidos
    const d1 = utilEmOuApos(isoDe(yy, mes, 1));
    if (d1 < N1) {
      add(C['Jardim Azul'], d1, 15000, 'Antecipação', `Antecipação - JARDIM AZUL (${ref})`);
      add(C['Vila Rica'], d1, 12000, 'Antecipação', `Antecipação - VILA RICA (${ref})`);
    }
    if (mes % 2) add(C.Primavera, utilEmOuApos(isoDe(yy, mes, 22)), 2310 * osc(7, mes), 'Não Garantido', `Não Garantidos - PRIMAVERA (${ref})`);
  }
  // rateios menores nos outros dias úteis do mês passado e deste (o calendário fica como o de verdade)
  const usados = new Set(L.map((r) => r.d));
  for (const [yy, mes] of [[m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1], [y, m]]) {
    for (let dia = 1; dia <= 31; dia++) {
      const d = isoDe(yy, mes, dia);
      if (+d.slice(5, 7) !== mes || d >= H || !util(d) || usados.has(d)) continue;
      const c = CONDS[dia % 5];
      add(c, d, c.base * 0.11 * osc(dia, mes), 'Repasse Normal', `Repasse - ${c.a.toUpperCase()} (${yy} - ${MESES[mes - 1]}, ${2 + (dia % 3)}º Rateio)`);
    }
  }
  const ref = `${y} - ${MESES[m - 1]}`;
  // próximas antecipações (já programadas): a do arquivo do vídeo volta como "Já lançado"
  add(C['Jardim Azul'], N1, 15000, 'Antecipação', `Antecipação - JARDIM AZUL (${ref})`);
  add(C['Vila Rica'], N2, 12000, 'Antecipação', `Antecipação - VILA RICA (${ref})`);
  // os repasses de hoje (um sem conta bancária, para a conferência do dia)
  add(C['Jardim Azul'], H, 8640, 'Repasse Normal', `Repasse - JARDIM AZUL (${ref}, 3º Rateio)`);
  add(C['Solar das Palmeiras'], H, 5210, 'Repasse Normal', `Repasse - SOLAR DAS PALMEIRAS (${ref}, 2º Rateio)`);
  add(C.Primavera, H, 2450, 'Não Garantido', `Não Garantidos - PRIMAVERA (${ref})`);
  add(C.Aurora, H, 3980, 'Repasse Normal', `Repasse - AURORA (${ref}, 2º Rateio)`, { k: '' });
  // pendências antigas (vão para "Para cobrar")
  add(C['Vila Rica'], utilEmOuApos(somar(H, -19)), 6300, 'Repasse Normal', `Repasse - VILA RICA (${ref}, 2º Rateio)`, { s: 'Pendente' });
  add(C.Aurora, utilEmOuApos(somar(H, -41)), 4120, 'Repasse Normal', `Repasse - AURORA (${MESES[(m + 10) % 12]})`, { s: 'Suspenso' });
  return L.map((r) => { if (!r.k) delete r.k; return r; });
}

/* arquivo exportado do sistema (tabela HTML salva como .xls, igual ao do sistema) */
function arquivoSistema() {
  const { N1, y, m } = datas();
  const ref = `${y} - ${MESES[m - 1]}`;
  const linhas = [
    ['Jardim Azul', N1, `Antecipação - JARDIM AZUL (${ref})`, 15000, contaStr(C['Jardim Azul'].conta)],
    ['Solar das Palmeiras', N1, `Repasse - SOLAR DAS PALMEIRAS (${ref}, 3º Rateio)`, 4870, 'Banco Novo (260) - Ag 0001 - Ct 99812-4 (Corrente)'],
    ['Primavera', N1, `Repasse - PRIMAVERA (${ref}, 2º Rateio)`, 3215.4, contaStr(C.Primavera.conta)],
    ['Vila Rica', N1, `Repasse - VILA RICA (${ref}, 3º Rateio)`, 7980, contaStr(C['Vila Rica'].conta)],
    ['Aurora', N1, `Repasse - AURORA (${ref}, 3º Rateio)`, 2760, contaStr(C.Aurora.conta)],
  ];
  const td = (x) => `<td>${x}</td>`;
  const html = '<html><head><meta charset="utf-8"></head><body><table>'
    + '<tr><th>Apelido</th><th>Vencimento</th><th>Descrição</th><th>Valor</th><th>Conta Condomínio</th></tr>'
    + linhas.map((l) => `<tr>${td(l[0])}${td(br(l[1]))}${td(l[2])}${td(brl(l[3]))}${td(l[4])}</tr>`).join('')
    + '</table></body></html>';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tut-')), `repasses_${N1.replace(/-/g, '')}.xls`);
  fs.writeFileSync(f, html);
  return f;
}

module.exports = {
  nome: 'ferramenta-repasses',
  ferramenta: 'repasses',
  entrar: 'caio@myblue.com.br',
  inicio: '#/m/repasses',

  /* a planilha real embutida (EMBED.seed) e os apelidos reais (ALIAS) saem da cópia da gravação */
  adaptarHtml(html) {
    const ini = html.indexOf('const EMBED=');
    const fim = html.indexOf('\n', ini);
    const fer = html.slice(ini, fim).match(/"fer":(\{[^}]*\})/)[1];
    html = html.slice(0, ini) + `const EMBED={"fer":${fer},"seed":{"rows":[],"base":{},"ctas":[],"regs":[]}};` + html.slice(fim);
    html = html.replace(/const ALIAS=\{[^}]*\};/, 'const ALIAS={};');
    if (!html.includes('"seed":{"rows":[]') || !html.includes('const ALIAS={};')) throw new Error('a planilha embutida não saiu do HTML adaptado');
    return html;
  },

  /* menu do portal recolhido: a ferramenta usa a largura toda */
  async ajustar(t) {
    await t.p.click('#btRecolher');
    await t.pausa(800);
  },

  async preparar(cen) {
    const set = {};
    const agora = new Date().toISOString();
    lancamentos().forEach((r, i) => { set[`repasses:lanc/L${i + 1}`] = JSON.stringify({ ...r, _em: agora, _por: 'Caio Mendes' }); });
    CONDS.forEach((c, i) => {
      set[`repasses:cta/C${i + 1}`] = JSON.stringify({ k: c.k, b: c.conta[0], ag: c.conta[1], ct: c.conta[2], tp: 'Corrente', ti: '', doc: '', x: false, s: 'Ativa', d: '', o: 'Cadastro inicial', em: '', ord: i + 1 });
    });
    set['repasses:meta/ctas'] = JSON.stringify({ criada: agora, origem: 'Cadastro inicial' });
    set['repasses:meta/migrado'] = JSON.stringify({ em: agora, por: 'Caio Mendes', origem: 'Base inicial', arquivo: '', contagem: {} });
    const r = await cen.admin('POST', '/api/armazenamento/repasses', { set });
    if (!r || !r.ok) throw new Error('não gravou os repasses de exemplo: ' + JSON.stringify(r).slice(0, 200));
  },

  abertura: ['Os repasses aos condomínios: lançar, conferir o dia, enviar ao Financeiro e acompanhar.',
    ['Próxima janela de repasse', 'Lançar o arquivo do sistema', 'Conferir o dia e enviar ao Financeiro', 'Visões, condomínios e alertas']],

  async gravar(t) {
    const f = quadro(t, 'repasses');
    const arquivo = arquivoSistema();
    await f.locator('#jan .jan').waitFor({ timeout: 20000 });

    const J = '1 · Próxima janela';
    await t.legenda('No topo, a <b>próxima janela de repasse</b>: quantos lançamentos, quanto repassar e quantos estão atrasados.', { etapa: J, ms: 600 });
    await t.mostrar(f.locator('#jan .jan'), 3000, { dx: 0.3 });
    await t.legenda('Logo abaixo, os <b>próximos 14 dias</b>. Clique num dia para conferir os lançamentos dele.', { etapa: J, ms: 300 });
    await t.mostrar(f.locator('#jan .jc.has').first(), 2600);

    const L = '2 · Lançar repasses';
    await t.legenda('No passo <b>1 · Lançar repasses</b>, arraste o arquivo exportado do sistema (ou use <b>Adicionar lançamento</b>).', { etapa: L, ms: 300 });
    await t.enviarArquivo(f.locator('#lcDrop'), f.locator('#lcFile'), arquivo, { depois: 2000 });
    await t.legenda('Cada linha já vem conferida. O que <b>já está lançado</b> vem desmarcado e não entra de novo.', { etapa: L, ms: 300 });
    await t.mostrar(f.locator('#lcBox tr:has-text("Já lançado") td').first(), 1500, { dx: 0.3 });
    await t.mostrar(f.locator('#lcBox .pill:has-text("Já lançado")').first(), 2200);
    await t.legenda('Conta diferente da cadastrada fica em vermelho: <b>Usar a cadastrada</b> ou <b>Cadastrar esta conta</b>.', { etapa: L, ms: 300 });
    await t.mostrar(f.locator('[data-ctausar]').first(), 3000);
    await t.clicar(f.locator('[data-ctausar]').first(), { depois: 1600 });
    await t.legenda('Tudo certo? <b>Gravar no portal</b>: os lançamentos ficam para toda a equipe. Dá para desfazer logo depois.', { etapa: L, ms: 300 });
    await t.clicar(f.locator('#lcGrv'), { depois: 2200 });

    const D = '3 · Conferir o dia';
    await t.legenda('No passo <b>2 · Conferir e corrigir o dia</b>: os lançamentos do dia, com o que pede atenção primeiro.', { etapa: D, ms: 300 });
    await t.mostrar(f.locator('#ocBox .cards'), 2600);
    await t.legenda('Sem conta bancária? <b>Sugerir contas vazias</b> usa a conta do último repasse. Clique numa linha para corrigir valor, data ou conta.', { etapa: D, ms: 300 });
    await t.mostrar(f.locator('#ocBox tr[data-oxr]:has-text("sem conta")').first(), 2200, { dx: 0.2 });
    await t.clicar(f.locator('#ocFill'), { depois: 1400 });
    await t.mostrar(f.locator('#ocBox input[data-ock]').first(), 2600, { dx: 0.3 });
    await t.legenda('Para marcar estorno, conta errada ou pendência, escolha a <b>ocorrência</b> na linha. Depois, <b>Gravar no portal</b>.', { etapa: D, ms: 300 });
    await t.mostrar(f.locator('#ocBox select[data-ocs]').first(), 2200);
    await t.clicar(f.locator('#ocGrv'), { depois: 2200 });

    const E = '4 · Enviar ao Financeiro';
    await t.legenda('No passo <b>3 · Enviar ao Financeiro</b>, confira os ✔ e baixe a planilha do dia. O botão de e-mail abre a mensagem pronta.', { etapa: E, ms: 300 });
    await t.mostrar(f.locator('#envBox .chk').first(), 2200);
    await t.clicar(f.locator('#btnDia'), { depois: 2200 });

    const V = '5 · Acompanhar';
    await t.legenda('Na <b>Visão geral</b>: o total do ano por tipo, a evolução mês a mês e o valor por responsável.', { etapa: V, ms: 300 });
    await t.clicar(f.locator('.tab[data-p="geral"]'), { depois: 1200 });
    await t.mostrar(f.locator('#p-geral .cards'), 2400, { dx: 0.3 });
    await t.mostrar(f.locator('#p-geral .grid2'), 2600, { dx: 0.3 });
    await t.legenda('Na <b>Visão mensal</b> (escolha o ano e o mês no topo): o calendário, com o que já saiu e o que está programado.', { etapa: V, ms: 300 });
    await t.clicar(f.locator('.tab[data-p="mensal"]'), { depois: 1200 });
    await t.mostrar(f.locator('#p-mensal .cal'), 4200, { dx: 0.6, dy: 0.4 });
    await t.legenda('Em <b>Alertas</b>: condomínios sem repasse no prazo e os pendentes <b>para cobrar</b>, do mais antigo ao mais novo.', { etapa: V, ms: 300 });
    await t.clicar(f.locator('.tab[data-p="alert"]'), { depois: 1200 });
    await t.mostrar(f.locator('#p-alert h2:has-text("Para cobrar") + .box'), 4200, { dx: 0.4 });
    await t.legenda('Em <b>Condomínios</b>: quanto cada um recebeu por mês, as contas bancárias, as regras e o histórico.', { etapa: V, ms: 300 });
    await t.clicar(f.locator('.tab[data-p="cond"]'), { depois: 1200 });
    await t.mostrar(f.locator('#p-cond table'), 4000, { dx: 0.3, dy: 0.3 });
  },

  resumo: ['<b>1 · Lançar</b>: arraste o arquivo do sistema, confira e <b>Gravar no portal</b>',
    '<b>2 · Conferir o dia</b> (contas e ocorrências) e <b>3 · baixar a planilha</b> do Financeiro',
    'Acompanhe nas visões, em <b>Alertas</b> e em <b>Condomínios</b>'],

  // para testes
  _datas: datas, _lancamentos: lancamentos, _arquivo: arquivoSistema, _noQuadro: noQuadro,
};

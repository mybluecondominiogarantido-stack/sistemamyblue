'use strict';
/*
 * Tutorial da Curadoria da Base (Painel de Campanhas da Cobrança). Dados fictícios.
 * A coordenadora (Lia Souza) encerra a campanha que terminou com o Analítico do Power BI, avalia a carteira
 * pela escada da Política de Curadoria, registra a campanha nova e consulta a ficha de um condomínio.
 *
 * preparar: grava no banco do portal três campanhas fictícias (duas encerradas e uma aguardando a leitura de fim)
 * e o histórico dos condomínios que passaram por elas. No vídeo entram o Analítico e o rating de hoje (CSV).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const SLUG = 'curadoria-da-base';
const FUSO = 'America/Sao_Paulo';
const quadro = (t) => t.p.frameLocator(`iframe[data-slug="${SLUG}"]`);
const arquivoTemp = (nome, conteudo) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tut-')), nome); fs.writeFileSync(f, conteudo); return f; };

/* ---------- datas ---------- */
const hojeIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: FUSO });
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const somaMes = (comp, n) => { const [y, m] = comp.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesNome = (iso) => MESES[+iso.slice(5, 7) - 1];

/* mesmas chaves da ferramenta: nome do Power BI sem acento, maiúsculo; documento com identificador seguro */
const kb = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
function idDoc(s) { s = String(s); if (/^[A-Za-z0-9_-]{1,120}$/.test(s)) return s; let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return s.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 80) + '_' + (h >>> 0).toString(36); }

/* ---------- carteira fictícia no Analítico de hoje ----------
   [nome, idade (meses), VOP acumulado, inadimplência, resultado, rating: [valor 11 meses antes, valor no último mês fechado] ou série] */
const COND = [
  // positivos
  ['Cond. Jardim Azul', 30, 900000, 12000, 48500, [21000, 46000]],
  ['Ed. Solar das Palmeiras', 26, 610000, 8000, 22300, [9000, 21000]],
  ['Res. Primavera', 20, 420000, 6500, 15800, [-4000, 14200]],
  ['Ed. Aurora', 15, 380000, 5000, 9400, [-6000, 8100]],
  ['Cond. Bosque Real', 12, 250000, 4000, 3100, [-5000, 2600]],
  ['Ed. Mirante do Sol', 34, 1100000, 15000, 61200, [38000, 59000]],
  ['Res. Vale Encantado', 22, 460000, 7000, 4300, [-9500, 3800]],
  ['Cond. Girassol', 9, 170000, 9000, 1200, [-9000, -1500]],
  // negativos em maturação (até 13 meses) e 13 a 18 meses sem piora: monitoramento
  ['Cond. Monte Verde', 6, 120000, 18000, -14200, [-4000, -13100]],
  ['Res. Lagoa Serena', 9, 180000, 22000, -21500, [-6000, -20800]],
  ['Ed. Porto Seguro', 11, 330000, 25000, -9800, [-2000, -10200]],
  ['Cond. Recanto das Flores', 15, 300000, 21000, -18700, [-31000, -19400]],
  ['Res. Águas Claras', 14, 280000, 19000, -15200, [-29000, -17800]],
  ['Ed. Bela Vista', 12, 240000, 21000, -18900, [-4000, -17200]],
  // 13 a 18 meses em piora: campanha
  ['Cond. Vila Rica', 16, 320000, 26000, -32400, [-8000, -30100]],
  ['Ed. Horizonte Azul', 17, 340000, 24000, -27900, [-6000, -26000]],
  ['Res. Pôr do Sol', 14, 280000, 22000, -19600, [-3000, -18200]],
  // inadimplência ≥ 1,5 × o VOP mensal: campanha
  ['Cond. Morada Nova', 10, 150000, 31000, -38200, [-5000, -36500]],
  ['Ed. Atlântico Sul', 20, 600000, 52000, -44100, [-20000, -42800]],
  ['Res. Santa Clara', 8, 160000, 33000, -26300, [-4000, -25100]],
  // positivou e negativou: campanha
  ['Cond. Ipê Amarelo', 19, 380000, 20000, -12600, [2000, 4500, 6800, 8200, 7400, 3100, -2600, -6100, -9800, -13900, -15200]],
  ['Res. Brisa do Mar', 21, 420000, 21000, -16400, [-12000, -9000, -6000, -2500, 800, 1500, -1200, -5800, -9900, -13400, -15700]],
  // acima de 18 meses e ainda negativo: curadoria plena
  ['Ed. Torre Norte', 28, 560000, 25000, -67800, [-40000, -64900]],
  ['Cond. Recreio Verde', 24, 480000, 20000, -41500, [-28000, -40200]],
];
const POR_NOME = Object.fromEntries(COND.map((c) => [c[0], c]));
const real = (v) => (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* Analítico do Power BI (Condominio, Idade, VOP, Inadimplencia, Resultado) */
function analitico() {
  const cab = ['Condominio', 'Idade (meses)', 'VOP', 'Inadimplencia', 'Resultado'];
  return [cab, ...COND.map(([n, i, v, d, r]) => [n, i, real(v), real(d), real(r)])].map((l) => l.join(';')).join('\r\n') + '\r\n';
}
/* rating do Power BI: resultado acumulado mês a mês, 12 meses até o mês atual (o último fechado é o anterior) */
function rating() {
  const atual = hojeIso().slice(0, 7), meses = Array.from({ length: 12 }, (_, i) => somaMes(atual, i - 11));
  const anos = meses.map((m, i) => (i === 0 || m.endsWith('-01') ? m.slice(0, 4) : ''));
  const linhas = [['Ano', ...anos], ['Mês', ...meses.map((m) => MESES[+m.slice(5, 7) - 1])], ['Condominio', ...meses.map(() => '')]];
  for (const [n, idade, , , res, s] of COND) {
    let v;
    if (s.length > 2) v = s.slice();
    else { const ini = Math.max(0, 11 - idade); v = Array.from({ length: 11 }, (_, i) => (i < ini ? 0 : Math.round(s[0] + (s[1] - s[0]) * (i - ini) / Math.max(1, 10 - ini)))); }
    linhas.push([n, ...v, res].map((x) => (typeof x === 'number' ? real(x) : x)));
  }
  return linhas.map((l) => l.join(';')).join('\r\n') + '\r\n';
}

/* campanhas anteriores e o histórico dos condomínios que passaram por elas */
function base(lia) {
  const hoje = hojeIso();
  const leit = {}; // condomínio → leituras
  const nomes = {};
  const ap = (nome, desconto, sug, ativ, resIni, resFim, dIni, dFim) => {
    const key = kb(nome), c = POR_NOME[nome]; nomes[key] = nome;
    const inadIni = Math.round(c[3] * 1.1), inadFim = resFim == null ? null : Math.round(c[3] * 1.05);
    (leit[key] = leit[key] || []).push({ data: dIni, idade: c[1] - Math.round((Date.parse(hoje) - Date.parse(dIni)) / 2.63e9), vop: null, inad: inadIni, res: resIni });
    if (resFim != null) leit[key].push({ data: dFim, idade: null, vop: null, inad: inadFim, res: resFim });
    return { id: key, key, desconto, sug, ativ, resIni, inadIni, resFim, inadFim, ...(resFim != null ? { leituraFim: dFim } : {}) };
  };
  const camp = (num, nome, ini, fim, aps, extra = {}) => ({ num, nome, inicio: ini, fim, criadoEm: ini + 'T12:00:00.000Z', criadoPor: lia, leituraIni: ini, aps, ...extra });
  const i1 = somaDias(hoje, -178), f1 = somaDias(i1, 14), i2 = somaDias(hoje, -88), f2 = somaDias(i2, 14), i3 = somaDias(hoje, -16), f3 = somaDias(hoje, -2);
  const c1 = camp(1, 'Leva de ' + mesNome(i1), i1, f1, [
    ap('Res. Vale Encantado', 50, 50, 1, -9000, 2500, i1, f1), ap('Ed. Torre Norte', 50, 50, 1, -52000, -58000, i1, f1),
    ap('Cond. Recreio Verde', 50, 50, 1, -30000, -26000, i1, f1), ap('Res. Brisa do Mar', 50, 50, 1, -11000, 800, i1, f1),
  ], { fechamento: { data: f1, arquivo: 'Analitico_' + f1 + '.xlsx', em: f1, por: lia }, controle: { dataIni: i1, dataFim: f1, n: 14, media: -850, melhoraram: 5, positivaram: 1 } });
  const c2 = camp(2, 'Leva de ' + mesNome(i2), i2, f2, [
    ap('Ed. Torre Norte', 70, 70, 2, -60000, -61500, i2, f2), ap('Cond. Morada Nova', 50, 50, 1, -20000, -15000, i2, f2),
    ap('Res. Pôr do Sol', 50, 50, 1, -14000, -9000, i2, f2), ap('Ed. Atlântico Sul', 50, 50, 1, -35000, -30000, i2, f2),
  ], { fechamento: { data: f2, arquivo: 'Analitico_' + f2 + '.xlsx', em: f2, por: lia }, controle: { dataIni: i2, dataFim: f2, n: 12, media: 1200, melhoraram: 6, positivaram: 1 } });
  const c3 = camp(3, 'Leva de ' + mesNome(i3), i3, f3, [
    ap('Res. Águas Claras', 50, 50, 1, -24000, null, i3), ap('Cond. Girassol', 50, 50, 1, -8000, null, i3),
    ap('Ed. Bela Vista', 50, 50, 1, -16000, null, i3), ap('Cond. Ipê Amarelo', 50, 50, 1, -15000, null, i3),
  ], { controle: { dataIni: i3, ini: { [kb('Cond. Monte Verde')]: -15000, [kb('Res. Lagoa Serena')]: -23000, [kb('Ed. Porto Seguro')]: -10500, [kb('Cond. Vila Rica')]: -29000, [kb('Ed. Horizonte Azul')]: -25500 } } });
  const docs = { 'config/geral': { v: 2, nomes, marc: {}, revLeg: {}, cfg: { melhora: 0, plana: 2 }, legado: true } };
  for (const c of [c1, c2, c3]) docs['campanhas/' + String(c.num).padStart(3, '0')] = c;
  for (const [key, l] of Object.entries(leit)) {
    l.sort((a, b) => (a.data < b.data ? -1 : 1));
    docs['condominios/' + idDoc(key)] = { id: key, leituras: l.filter((x, i) => !l.slice(0, i).some((y) => y.data === x.data)), serie: null };
  }
  return docs;
}

module.exports = {
  nome: 'ferramenta-curadoria',
  ferramenta: SLUG,
  entrar: 'lia@myblue.com.br',
  inicio: '#/m/' + SLUG,
  async preparar(cen) {
    // em produção a Curadoria da Base não é isolada
    await cen.admin('PATCH', `/api/admin/modulos/${SLUG}`, { isolada: false });
    const r = await cen.admin('POST', `/api/admin/modulos/${SLUG}/documentos`, { modulo: SLUG, documentos: base('Lia Souza') });
    if (!r || !r.total) throw new Error('não gravou as campanhas de exemplo: ' + JSON.stringify(r));
  },
  // as tabelas são largas: o menu do portal fica recolhido durante o vídeo
  async ajustar(t) { await t.p.click('#btRecolher'); await t.pausa(800); },
  abertura: ['As campanhas de recuperação dos condomínios negativos, pela escada da Política de Curadoria da Base.', ['Visão geral das campanhas', 'Encerrar a campanha com o Analítico de fim', 'Avaliar a carteira e registrar a campanha', 'A ficha do condomínio']],
  async gravar(t) {
    const f = quadro(t);
    const hoje = hojeIso();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tut-'));
    const anal = path.join(dir, `Analitico_${hoje}.csv`); fs.writeFileSync(anal, analitico());
    const rat = path.join(dir, `Rating_${hoje}.csv`); fs.writeFileSync(rat, rating());
    await f.locator('#sync.on').waitFor({ timeout: 30000 });

    const V = '1 · Visão geral';
    await t.legenda('A <b>Visão geral</b> mostra quantos condomínios já passaram por campanha, quantos melhoraram o Resultado e quanto foi recuperado.', { etapa: V, ms: 600 });
    await t.mostrar(f.locator('#p-visao .tiles'), 3400);
    await t.legenda('Abaixo, a evolução depois de cada campanha e a efetividade de cada uma, comparada com os negativos que ficaram de fora.', { etapa: V, ms: 300 });
    await t.rolar(520, f.locator('#p-visao .tiles'));
    await t.pausa(2800);
    await t.rolar(-520);

    const E = '2 · Encerrar a campanha';
    await t.legenda('Em <b>Campanhas</b>, a campanha que terminou fica <b>aguardando leitura de fim</b>. Abra o detalhe.', { etapa: E, ms: 300 });
    await t.clicar(f.locator('[data-tab="camp"]'), { depois: 1400 });
    await t.clicar(f.locator('#p-camp [data-camp="3"]').first(), { depois: 1600 });
    await t.legenda('Informe a data e envie o <b>Analítico de fim</b> do Power BI: o painel lê o Resultado de cada condomínio e encerra a campanha.', { etapa: E, ms: 300 });
    await t.preencherCampo(f.locator('#dFimData'), hoje);
    await t.enviarArquivo(f.locator('#dFimArq'), f.locator('#dFimArq'), anal, { depois: 2200 });
    await t.legenda('Cada condomínio sai como <b>positivado</b>, <b>em recuperação</b> ou <b>em agravamento</b>.', { etapa: E, ms: 300 });
    await t.mostrar(f.locator('#mCorpo table'), 3400);
    await t.clicar(f.locator('#mFechar'), { depois: 900 });

    const A = '3 · Avaliação';
    await t.legenda('Para a próxima campanha, em <b>Avaliação</b> envie o <b>Analítico</b> do mês e, se quiser, o <b>rating</b> (tendência de 6 meses).', { etapa: A, ms: 300 });
    await t.clicar(f.locator('[data-tab="aval"]'), { depois: 1400 });
    await t.enviarArquivo(f.locator('.imp').first(), f.locator('#iAnal'), anal, { depois: 2000 });
    await t.enviarArquivo(f.locator('.imp').nth(1), f.locator('#iRat'), rat, { depois: 2000 });
    await t.legenda('Cada condomínio é classificado pela escada da política: <b>campanha</b>, <b>monitoramento</b>, <b>curadoria plena</b> ou positivo.', { etapa: A, ms: 300 });
    await t.mostrar(f.locator('#aTiles'), 2600);
    await t.rolar(420, f.locator('#aTiles'));
    await t.pausa(2600);
    await t.legenda('O <b>desconto</b> sugerido segue a escala: 50% na 1ª campanha, 70% na 2ª e 100% a partir da 3ª.', { etapa: A, ms: 300 });
    await t.mostrar(f.locator('#aCorpo [data-desc]').first(), 2800);

    const R = '4 · Registrar a campanha';
    await t.legenda('Filtre a <b>Ação</b> “Campanha” e marque os condomínios. Os quadros passam a mostrar só a seleção.', { etapa: R, ms: 300 });
    await t.clicar(f.locator('#aFiltrosTog'), { depois: 900 });
    await t.escolher(f.locator('#a_classe'), 'Campanha', { depois: 1200 });
    await t.clicar(f.locator('#aTodos'), { depois: 1400 });
    await t.mostrar(f.locator('#aTiles'), 2400);
    await t.legenda('Confira o início, o fim e o nome e clique em <b>Registrar campanha</b>. O <b>Relatório para a Cobrança</b> sai com a lista e os descontos.', { etapa: R, ms: 300 });
    const rNome = f.locator('#rNome');
    await rNome.scrollIntoViewIfNeeded();
    await t.digitar(rNome, '2ª leva de ' + mesNome(hoje), { atraso: 34 });
    await t.mostrar(f.locator('#rLista'), 1400);
    await t.clicar(f.locator('#rRegistrar'), { depois: 2200 });
    await t.legenda('A campanha nova entra em <b>Campanhas ativas</b>; no fim, encerre com o Analítico de fim, como antes.', { etapa: R, ms: 2600 });

    const C = '5 · Condomínios';
    await t.legenda('Em <b>Condomínios</b>, a ficha de cada um que passou por campanha: o Resultado mês a mês, as campanhas e as marcações para a Reunião de Resultado.', { etapa: C, ms: 300 });
    await t.clicar(f.locator('[data-tab="cond"]'), { depois: 1400 });
    await t.clicar(f.locator('#p-cond [data-ficha]:has-text("Pôr do Sol")'), { depois: 1600 });
    await t.mostrar(f.locator('#p-cond .chart'), 2800);
    await t.rolar(460, f.locator('#p-cond .chart'));
    await t.pausa(3200);
  },
  resumo: ['<b>Campanhas</b>: encerre com o Analítico de fim do Power BI', '<b>Avaliação</b>: Analítico + rating → escada → marque e <b>Registrar campanha</b>', '<b>Visão geral</b> e <b>Condomínios</b>: efetividade, histórico e destino'],
};

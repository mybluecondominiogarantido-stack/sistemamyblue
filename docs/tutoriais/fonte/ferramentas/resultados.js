'use strict';
/*
 * Tutorial do Acompanhamento de Resultados (Cobrança). Dados fictícios.
 * A coordenadora (Lia Souza) importa a exportação do dia do Vouch, acompanha a meta por analista e por
 * condomínio, vê a tela da analista e fecha o mês (o resultado vai para a Gestão de Premiações).
 *
 * preparar: completa a carteira fictícia (13 condomínios ativos, 2 analistas) e faz, sem gravar,
 * a importação de ontem (competência anterior e atual). No vídeo entra a exportação de hoje.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SENHA } = require('../cenario');

const SLUG = 'acompanhamento-de-resultados';
const FUSO = 'America/Sao_Paulo';
const quadro = (t) => t.p.frameLocator(`iframe[data-slug="${SLUG}"]`);
const arquivoTemp = (nome, conteudo) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tut-')), nome); fs.writeFileSync(f, conteudo); return f; };

/* ---------- datas ---------- */
const hojeIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: FUSO });
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const somaMes = (comp, n) => { const [y, m] = comp.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const br = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ref = (comp) => `Arrecadação: ${comp.slice(0, 4)} - ${MESES[+comp.slice(5, 7) - 1]}`;

/* ---------- carteira fictícia ----------
   [código, nome, UF, dia do vencimento, analista, mês atual { ini, rec, hoje, acordo }, mês anterior { ini, rec }]
   ini = unidades garantidas devendo no vencimento · rec = pagaram na janela até ontem · hoje = pagam hoje (exportação do vídeo) */
const MARCOS = 'MARCOS LIMA - 4701', ANA = 'ANA COSTA - 4702';
const CONDS = [
  ['307', 'Cond. Monte Verde', 'SP', 5, ANA, { ini: 10, rec: 4 }, { ini: 9, rec: 4 }],
  ['308', 'Res. Águas Claras', 'CE', 5, MARCOS, { ini: 8, rec: 1, hoje: 1 }, { ini: 8, rec: 1 }],
  ['301', 'Cond. Jardim Azul', 'SP', 10, MARCOS, { ini: 12, rec: 2, hoje: 2 }, { ini: 10, rec: 5 }],
  ['302', 'Ed. Solar das Palmeiras', 'SP', 10, MARCOS, { ini: 6, rec: 2 }, { ini: 7, rec: 3 }],
  ['303', 'Res. Primavera', 'CE', 10, MARCOS, { ini: 9, rec: 1, acordo: 1 }, { ini: 9, rec: 3 }],
  ['304', 'Cond. Vila Rica', 'PE', 10, MARCOS, { ini: 0, rec: 0 }, { ini: 2, rec: 1 }],
  ['305', 'Ed. Aurora', 'SP', 10, ANA, { ini: 15, rec: 6 }, { ini: 14, rec: 5 }],
  ['309', 'Ed. Porto Seguro', 'BA', 15, ANA, { ini: 11, rec: 3, hoje: 1 }, { ini: 12, rec: 4 }],
  ['310', 'Cond. Bosque Real', 'PE', 15, MARCOS, { ini: 7, rec: 3 }, { ini: 6, rec: 2 }],
  ['311', 'Res. Lagoa Serena', 'CE', 20, ANA, { ini: 13, rec: 2 }, { ini: 12, rec: 2 }],
  ['312', 'Ed. Mirante do Sol', 'SP', 20, MARCOS, { ini: 5, rec: 2 }, { ini: 5, rec: 2 }],
  ['313', 'Cond. Recanto das Flores', 'SP', 25, ANA, { ini: 9, rec: 1 }, { ini: 8, rec: 3 }],
  ['314', 'Res. Vale Encantado', 'PE', 25, MARCOS, { ini: 6, rec: 0, hoje: 1 }, { ini: 6, rec: 2 }],
];
const unidades = (n) => Array.from({ length: n }, (_, i) => String((Math.floor(i / 4) + 1) * 100 + (i % 4) + 1));

/* linhas da exportação BOLETOS do Vouch (Condomínio, Unidade, Referência, Emissão, Vencimento, Data Crédito, Antecipado) */
function exportacao({ comAnterior, comHoje }) {
  const hoje = hojeIso(), ontem = somaDias(hoje, -1);
  const compA = hoje.slice(0, 7), compP = somaMes(compA, -1), compN = somaMes(compA, 1);
  const lim = (iso, max) => (iso > max ? max : iso);
  const linhas = [];
  const boletos = (nome, comp, dia, d, emissao, ateCredito, extraHoje) => {
    const ve = `${comp}-${String(dia).padStart(2, '0')}`;
    const tab = d.ini * 2 + 6, us = unidades(tab);
    us.forEach((u, i) => {
      let cr = '';
      if (i >= d.ini) cr = somaDias(ve, -3); // pagaram antes do vencimento
      else if (i < d.rec) cr = lim(somaDias(ve, 4 + 2 * i), ateCredito); // pagaram na janela
      else if (extraHoje && i < d.rec + (d.hoje || 0)) cr = hoje; // pagam hoje
      linhas.push([nome.toUpperCase(), u, ref(comp), br(emissao), br(ve), br(cr), '412,50']);
    });
    return us;
  };
  for (const [, nome, , dia, , atual, ant] of CONDS) {
    if (comAnterior) boletos(nome, compP, dia, ant, `${somaMes(compP, -1)}-01`, somaDias(`${compP}-${String(dia).padStart(2, '0')}`, 28), false);
    const us = boletos(nome, compA, dia, atual, `${compP}-01`, ontem, comHoje);
    // acordo formalizado hoje para uma unidade em aberto: conta como recebido
    if (comHoje && atual.acordo) linhas.push([nome.toUpperCase(), us[atual.rec], 'Acordo Administrativo #4521 (1/3)', br(hoje), br(somaDias(hoje, 5)), '', '0,00']);
    // boletos do mês seguinte, emitidos ontem
    unidades(4).forEach((u) => linhas.push([nome.toUpperCase(), u, ref(compN), br(ontem), br(`${compN}-${String(dia).padStart(2, '0')}`), '', '412,50']));
  }
  const cab = ['Condomínio', 'Unidade', 'Referência', 'Emissão', 'Vencimento', 'Data Crédito', 'Antecipado'];
  return '﻿' + [cab, ...linhas].map((l) => l.join(';')).join('\r\n') + '\r\n';
}

/* entra como a Lia num navegador à parte e importa um arquivo (sem gravar) */
async function importarSemGravar(base, navegador, arquivo, registros) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 640 }, locale: 'pt-BR', timezoneId: FUSO });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept().catch(() => {}));
  try {
    await p.goto(base + '/login');
    await p.fill('#email', 'lia@myblue.com.br'); await p.fill('#senha', SENHA);
    await Promise.all([p.waitForURL((u) => !String(u).includes('/login')), p.click('#btEntrar')]);
    await p.goto(base + '/#/m/' + SLUG);
    const f = p.frameLocator(`iframe[data-slug="${SLUG}"]`);
    await f.locator('#sync:has-text("ao vivo")').waitFor({ state: 'attached', timeout: 30000 });
    await f.locator('#tab-importar').click();
    await f.locator('#arquivo').setInputFiles(arquivo);
    await f.locator('#btn-confirmar').click({ timeout: 15000 });
    await f.locator('text=Importação confirmada').first().waitFor({ timeout: 30000 });
    await p.waitForTimeout(3000);
    if (registros) {
      // o que as analistas já registraram (envios no grupo, cobranças e observações), pela própria ferramenta
      const fr = await (await p.$(`iframe[data-slug="${SLUG}"]`)).contentFrame();
      await fr.evaluate(registros, { hoje: hojeIso(), compP: somaMes(hojeIso().slice(0, 7), -1) });
      await p.waitForTimeout(3000);
    }
  } finally { await ctx.close(); }
}

/* roda dentro da ferramenta (usa o estado dela): envios em dia, menos o 2º envio de Águas Claras e de Lagoa Serena;
   uma cobrança em cada condomínio com unidade em aberto; observação nos não batidos do mês anterior */
function registros({ hoje, compP }) {
  /* global estado, envios, chave, M, sincronizar */
  const atrasa2 = ['Res. Águas Claras', 'Res. Lagoa Serena'];
  const obs = { 'Res. Águas Claras': 'Síndico em viagem; duas unidades prometeram pagar na próxima semana.', 'Res. Lagoa Serena': 'Três unidades em negociação de acordo; síndico pediu prazo.' };
  Object.values(estado.porComp).forEach((res) => res.resultados.forEach((r) => {
    if (r.status !== 'apurado') return;
    const k = chave(r), reg = estado.registros[k] = estado.registros[k] || {};
    if (r.comp === compP) { if (r.situacao === 'nao_batido' && obs[r.nome]) reg.obs = obs[r.nome]; return; }
    const e = envios(r); if (!e) return;
    if (e.p1 <= hoje) reg.e1 = e.p1;
    if (e.p2 < hoje && !atrasa2.includes(r.nome)) reg.e2 = e.p2;
    const c = M.addDays(r.ve, 3);
    if (r.ini > 0 && c < hoje) { reg.cob = [c]; reg.cobPor = ['']; }
  }));
  sincronizar();
}

module.exports = {
  nome: 'ferramenta-resultados',
  ferramenta: SLUG,
  entrar: 'lia@myblue.com.br',
  inicio: '#/m/' + SLUG,
  // listas com nomes reais no HTML (ordem das analistas e exemplo da busca): trocadas só na cópia da gravação
  adaptarHtml: (html) => html
    .replace(/const ORDEM_AN = \[[^\]]*\];/, "const ORDEM_AN = ['MARCOS LIMA', 'ANA COSTA'];")
    .replace(/placeholder="Ex\.: [^"]*"/g, 'placeholder="Ex.: Jardim Azul"'),
  async preparar(cen, base, navegador) {
    // a carteira do cenário + condomínios fictícios com outros vencimentos (o dia de vencimento só com o número)
    const lista = await cen.admin('GET', '/api/carteira');
    for (const c of (lista.condominios || [])) await cen.admin('PATCH', `/api/carteira/${c.id}`, { vencimento: '10' });
    for (const [codigo, nome, uf, dia, analista] of CONDS) {
      if (Number(codigo) <= 306) continue;
      const r = await cen.admin('POST', '/api/carteira', { codigo, inicio_contrato: '2026-03-01', executivo: 'Davi Rocha', nome, comarca: uf, situacao: 'ATIVO', vencimento: String(dia),
        administradora: 'Adm. Exemplo', analista_cobranca: analista, assistente_credito: 'BRUNA REIS - 4710', razao_social: nome.toUpperCase(), cnpj: `12.345.678/00${codigo.slice(1)}-1${codigo.slice(2)}` });
      if (!r || !r.id) throw new Error('não cadastrou ' + nome + ': ' + JSON.stringify(r));
    }
    // exportação de ontem: mês anterior (já encerrado) e mês atual
    await importarSemGravar(base, navegador, arquivoTemp(`boletos-${somaDias(hojeIso(), -1)}.csv`, exportacao({ comAnterior: true, comHoje: false })), registros);
  },
  // a tabela da carteira é larga: o menu do portal fica recolhido durante o vídeo
  async ajustar(t) { await t.p.click('#btRecolher'); await t.pausa(800); },
  abertura: ['A meta de cada condomínio e de cada analista da Cobrança, atualizada pela exportação do dia.', ['Visão geral e quadro por vencimento', 'Importar a exportação do Vouch', 'Carteiras e o detalhe do condomínio', 'A tela da analista e o fechamento do mês']],
  async gravar(t) {
    const f = quadro(t);
    const arquivo = arquivoTemp(`boletos-${hojeIso()}.csv`, exportacao({ comAnterior: false, comHoje: true }));
    await f.locator('#sync:has-text("ao vivo")').waitFor({ state: 'attached', timeout: 30000 });

    const V = '1 · Visão geral';
    await t.legenda('A meta de cada condomínio: receber <b>30%</b> das unidades garantidas que estavam devendo no vencimento, em até 30 dias.', { etapa: V, ms: 600 });
    await t.mostrar(f.locator('.grade-kpi'), 3200);
    await t.legenda('O objetivo do setor é ter <b>90%</b> dos condomínios na meta. Abaixo, o resultado de cada analista.', { etapa: V, ms: 300 });
    await t.mostrar(f.locator('.kpi.hero'), 2200);
    await t.mostrar(f.locator('.cards-an'), 2600);

    const I = '2 · Exportação do dia';
    await t.legenda('Toda manhã, a gestão exporta os <b>Boletos</b> do Vouch (o período e as colunas estão indicados aqui) e envia em <b>Importar</b>.', { etapa: I, ms: 300 });
    await t.clicar(f.locator('#tab-importar'), { depois: 1400 });
    await t.mostrar(f.locator('#v-importar .cartao table').first(), 2000);
    await t.enviarArquivo(f.locator('#zona'), f.locator('#arquivo'), arquivo, { depois: 1800 });
    await t.legenda('A prévia mostra a data de corte, a competência atualizada e o que muda em cada condomínio.', { etapa: I, ms: 300 });
    await t.mostrar(f.locator('#previa .lista-checagem'), 3000);
    await t.clicar(f.locator('#btn-confirmar'), { depois: 2800 });

    const C = '3 · Carteiras';
    await t.legenda('Em <b>Visão geral</b>, as <b>últimas atualizações</b>: quem pagou, os acordos novos e quem entrou na meta desde ontem.', { etapa: C, ms: 300 });
    await t.clicar(f.locator('[data-sec="geral"]'), { depois: 1400 });
    const atual = f.locator('.cartao:has(h2:has-text("Últimas atualizações"))');
    await atual.scrollIntoViewIfNeeded();
    await t.mostrar(atual, 3200);
    await t.legenda('Em <b>Carteiras</b>, os condomínios por vencimento: inicial, meta, em aberto, envios no grupo e o que precisa de atenção.', { etapa: C, ms: 300 });
    await t.clicar(f.locator('#tab-carteira'), { depois: 1600 });
    await t.mostrar(f.locator('#v-carteira table'), 2600, { dy: 0.3 });
    await t.legenda('Clique no condomínio: inicial, meta, recebidos e as unidades em aberto e as que pagaram na janela.', { etapa: C, ms: 300 });
    await t.clicar(f.locator('#v-carteira tr[data-k]:has-text("Águas Claras")'), { depois: 1600 });
    await t.mostrar(f.locator('#det-conteudo .mini-grade'), 2600);
    await t.rolar(380, f.locator('#det-conteudo .mini-grade'));
    await t.pausa(1800);
    await t.legenda('Embaixo, o <b>registro da analista</b>: envios da inadimplência no grupo, cobranças e a observação (obrigatória fora da meta).', { etapa: C, ms: 300 });
    await t.rolar(1000);
    await t.pausa(3200);
    await t.clicar(f.locator('#det-fechar'), { depois: 900 });

    const A = '4 · A tela da analista';
    await t.legenda('Em <b>Ver como</b>, a gestão vê o que cada analista vê: o progresso e <b>o que fazer hoje</b> (envios no grupo e observações).', { etapa: A, ms: 300 });
    await t.escolher(f.locator('#sel-ver'), 'Marcos Lima', { depois: 1000 });
    await t.clicar(f.locator('#tab-painel'), { depois: 1400 });
    await t.mostrar(f.locator('#v-painel .kpi.hero'), 2400);
    await t.mostrar(f.locator('#v-painel .cartao:has(h2:has-text("O que fazer hoje"))'), 3000);
    await t.escolher(f.locator('#sel-ver'), { value: 'SUP' }, { depois: 1400 });

    const F = '5 · Fechar o mês';
    await t.legenda('Prazo de 30 dias encerrado? Em <b>Importar</b>, <b>Fechar</b> o mês: ele não é mais recalculado.', { etapa: F, ms: 300 });
    await t.clicar(f.locator('#tab-importar'), { depois: 1400 });
    const fecha = f.locator('[data-fecha]').last();
    await fecha.scrollIntoViewIfNeeded();
    await t.clicar(fecha, { depois: 1800 });
    await t.legenda('O resultado de cada analista vai para a <b>Gestão de Premiações</b>, igual ao que ela vê em Minha carteira.', { etapa: F, ms: 3600 });
  },
  resumo: ['<b>Importar</b> a exportação do dia do Vouch → prévia → confirmar', '<b>Visão geral</b> e <b>Carteiras</b>: meta de 30% por condomínio e 90% do setor', '<b>Ver como</b> a analista · <b>Fechar</b> o mês para a Gestão de Premiações'],
};

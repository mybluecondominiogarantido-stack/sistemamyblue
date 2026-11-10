'use strict';
/*
 * Tutorial do Calendário de Rotinas (Administrativo/Financeiro). A ferramenta guarda no banco do portal
 * (claude.use('db'), coleções atividades, status e config). O HTML não traz lista real embutida, então não há
 * adaptarHtml. Tudo o que aparece é inventado: as rotinas, os responsáveis e as observações.
 * Quem grava é a coordenadora fictícia do Administrativo/Financeiro (Paula Dias), que também tem o papel "gestora".
 */
const SLUG = 'rotinas-adm';
const quadro = (t) => t.p.frameLocator(`iframe[data-slug="${SLUG}"]`);

/* datas no fuso de Brasília (como a ferramenta conta) */
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const mesAtual = () => hoje().slice(0, 7);
const diaHoje = () => Number(hoje().slice(8, 10));
const quando = (n) => { const d = new Date(hoje() + 'T14:20:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString(); };

function documentos(por) {
  const docs = {};
  const A = [
    ['r1', 'Conciliação diária de repasses', 'Davi Rocha', 'diaria', []],
    ['r2', 'Conferência de extratos bancários', 'Davi Rocha', 'diaria', []],
    ['r3', 'Pagamento de fornecedores', 'Lia Souza', 'dias', [5, 20], 'Pagar sempre o valor líquido da nota fiscal.'],
    ['r4', 'Pedidos das gráficas', 'Lia Souza', 'dias', [5]],
    ['r5', 'Retirada das notas fiscais', 'Lia Souza', 'semanal', [5]],
    ['r6', 'Pedidos de material (escritório, limpeza e copa)', 'Sara Alves', 'util', [1]],
    ['r7', 'Relatório de fechamento para a gestora', 'Davi Rocha', 'util', [-1]],
  ];
  A.forEach(([id, nome, responsavel, tipo, valores, descricao], i) => {
    docs['atividades/' + id] = { nome, responsavel, tipo, valores, descricao: descricao || '', ordem: i + 1, rascunho: false };
  });
  // alguns status do mês: feitos nos dias que já passaram e uma rotina aguardando a gestora
  const m = mesAtual(), d = diaHoje();
  const feito = (k) => ({ s: 'feito', por, em: quando(-k), obs: '' });
  const dias = {};
  for (let k = 1; k <= Math.min(d - 1, 6); k++) dias[String(d - k)] = feito(k);
  docs[`status/${m}__r1`] = { mes: m, atv: 'r1', dias };
  docs[`status/${m}__r3`] = { mes: m, atv: 'r3', dias: { 5: { s: 'aguardando', por, em: quando(-2), desde: quando(-2), obs: 'Falta aprovar o valor da gráfica' } } };
  docs['config/folgas'] = { datas: {} };
  return docs;
}

module.exports = {
  nome: 'ferramenta-rotinas',
  ferramenta: SLUG,
  entrar: 'paula@myblue.com.br',
  inicio: '#/m/' + SLUG,
  async preparar(cen) {
    const r = await cen.admin('POST', `/api/admin/modulos/${SLUG}/documentos`, { modulo: SLUG, documentos: documentos('mb-' + cen.id['davi@myblue.com.br']) });
    if (!r || !r.total) throw new Error('não gravou os dados de exemplo: ' + JSON.stringify(r));
  },
  async ajustar(t) {
    const f = quadro(t);
    await f.locator('.dia[data-dia]').first().waitFor({ timeout: 30000 });
    await t.pausa(800);
  },
  abertura: ['As rotinas do Administrativo/Financeiro num calendário só: quem faz, em que dia e em que pé está.',
    ['O calendário do mês', 'Marcar o status do dia', 'Aguardando a gestora', 'Cadastrar rotinas e folgas']],
  async gravar(t) {
    const f = quadro(t);

    const C = '1 · Calendário do mês';
    await t.legenda('No topo, o mês: quanto já foi <b>concluído</b>, o que está <b>em execução</b>, o que <b>aguarda a gestora</b> e o que está <b>atrasado</b>.', { etapa: C, ms: 1200 });
    await t.mostrar(f.locator('#resumo'), 3200);
    await t.legenda('Cada dia mostra as rotinas previstas e quantas foram feitas. Os dias úteis já descontam fins de semana e feriados.', { etapa: C, ms: 300 });
    await t.mostrar(f.locator('.grade'), 3000, { dy: 0.3 });

    const S = '2 · Marcar o status';
    await t.legenda('Clique no dia: o painel ao lado lista as rotinas. Marque <b>Feito</b>, <b>Em execução</b>, <b>Aguardando gestora</b>, <b>Pausado</b> ou <b>Pendente</b> e, se quiser, escreva uma observação.', { etapa: S, ms: 300 });
    await t.clicar(f.locator('.dia[data-dia]').filter({ hasText: 'Conciliação' }).last(), { depois: 1400 });
    await t.clicar(f.locator('#painel [data-st="execucao"]').first(), { depois: 1600 });
    await t.legenda('Ao marcar <b>Aguardando gestora</b>, a gestora recebe o aviso no sino e por e-mail.', { etapa: S, ms: 300 });
    await t.mostrar(f.locator('#painel [data-st="aguardando"]').first(), 2200);

    const G = '3 · Aguardando a gestora';
    await t.legenda('A aba <b>Aguardando gestora</b> junta tudo o que espera retorno, de todos os meses, com há quantos dias está parado.', { etapa: G, ms: 300 });
    await t.clicar(f.locator('#vPend'), { depois: 2400 });
    await t.legenda('A gestora responde ali mesmo: <b>Feito</b>, <b>Em execução</b> ou <b>Pendente</b>. Quem marcou é avisado.', { etapa: G, ms: 300 });
    await t.clicar(f.locator('[data-pst="feito"]').first(), { depois: 2000 });

    const R = '4 · Rotinas e folgas';
    await t.legenda('Em <b>Por atividade</b>, cada rotina com o responsável, quando é feita e os dias do mês. A gestora cadastra e edita as rotinas.', { etapa: R, ms: 300 });
    await t.clicar(f.locator('#vAtv'), { depois: 2600 });
    await t.legenda('Em <b>Feriados e folgas</b>, a gestora cadastra os dias sem expediente: as rotinas desses dias passam para o próximo dia útil.', { etapa: R, ms: 300 });
    await t.clicar(f.locator('#btnFolgas'), { depois: 2200 });
    await t.clicar(f.locator('#btnFecharFolgas'), { depois: 1000 });
    await t.clicar(f.locator('#vCal'), { depois: 1600 });
  },
  resumo: ['Clique no dia e marque o <b>status</b> de cada rotina', '<b>Aguardando gestora</b> avisa a gestora no sino e por e-mail', 'Rotinas em <b>Por atividade</b> · folgas em <b>Feriados e folgas</b>'],
};

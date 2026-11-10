'use strict';
/*
 * Tutorial do Controle de Rotinas (Administrativo/Financeiro). A ferramenta guarda no banco do portal
 * (claude.use('db'): atividades, status, pedidos, estornos, folgas, fechamentos). O HTML não traz lista real
 * embutida, então não há adaptarHtml. Tudo o que aparece é inventado: rotinas, pedidos e observações.
 * Quem grava é a coordenadora fictícia (Paula Dias, papel "coordenacao"); com "Ver como" ela mostra a tela do
 * Assistente (Davi Rocha) e a da Supervisão (Sara Alves).
 */
const SLUG = 'rotinas-adm';
const quadro = (t) => t.p.frameLocator(`iframe[data-slug="${SLUG}"]`);

/* datas no fuso de Brasília (como a ferramenta conta) */
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const mesAtual = () => hoje().slice(0, 7);
const diaHoje = () => Number(hoje().slice(8, 10));
const quando = (n) => { const d = new Date(hoje() + 'T14:20:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString(); };
const dataIso = (n) => quando(n).slice(0, 10);
const ehUtil = (iso) => { const w = new Date(iso + 'T12:00:00Z').getUTCDay(); return w > 0 && w < 6; };

function documentos(ids) {
  const docs = {};
  const m = mesAtual(), d = diaHoje(), inicio = `${m}-01`;
  const A = [
    ['r1', 'assistente', 'Pedidos de Cartórios', 'diaria', [], 'pedidos', true],
    ['r2', 'assistente', 'Comprovantes de Repasse', 'diaria', [], '', true],
    ['r3', 'assistente', 'Controle de Pedidos de Suprimentos', 'semanal', [2, 4], 'pedidos', true],
    ['r4', 'assistente', 'Estornos a clientes', 'diaria', [], 'estornos', true],
    ['r5', 'assistente', 'Lançar patrocínios', 'dias', [10], '', false],
    ['s1', 'supervisao', 'Conferir os pedidos no Protheus e os anexos no Fluig', 'diaria', [], '', false],
    ['s2', 'supervisao', 'Controlar as contas a pagar e os vencimentos', 'semanal', [1], '', false],
    ['s3', 'supervisao', 'Análise de crédito dos clientes', 'diaria', [], 'credito', false],
    ['c1', 'coordenacao', 'Acompanhar orçamento e fluxo de caixa', 'semanal', [5], '', false],
  ];
  A.forEach(([id, funcao, nome, tipo, valores, registro, meta], i) => {
    docs['atividades/' + id] = { nome, funcao, tipo, valores, mover: 'proximo', registro, meta, descricao: '', rascunho: false, ordem: i + 1, criado: inicio };
  });
  const por = (q) => `mb-${ids[q]}`;
  const feito = (k, q) => ({ s: 'feito', por: por(q), em: quando(-k), fe: quando(-k), obs: '', h: [['feito', quando(-k), por(q)]] });
  // dias úteis que já passaram: feitos (um atrasado, para aparecer no controle)
  const passados = [];
  for (let k = 1; k <= Math.min(d - 1, 9); k++) if (ehUtil(dataIso(-k))) passados.push(k);
  const dias = (q, pular) => Object.fromEntries(passados.filter((k) => k !== pular).map((k) => [String(d - k), feito(k, q)]));
  docs[`status/${m}__r1`] = { mes: m, atv: 'r1', dias: dias('davi') };
  docs[`status/${m}__r2`] = { mes: m, atv: 'r2', dias: dias('davi', passados[2]) };
  docs[`status/${m}__s1`] = { mes: m, atv: 's1', dias: dias('sara') };
  // uma rotina aguardando a Supervisão desde ontem
  const ontem = passados[0];
  if (ontem) {
    docs[`status/${m}__r5`] = { mes: m, atv: 'r5', dias: { [String(d - ontem)]: { s: 'aguardando_sup', por: por('davi'), orig: por('davi'), em: quando(-ontem), desde: quando(-ontem), ag: quando(-ontem), obs: 'Falta o recibo assinado do evento', h: [['aguardando_sup', quando(-ontem), por('davi')]] } } };
  }
  // pedidos do mês
  const P = [
    ['p1', 'r1', '004760', 'PAG', -6, -6, '', -3, true, 'ok'],
    ['p2', 'r1', '004771', 'NENHUM', -5, -4, -2, '', false, ''],
    ['p3', 'r1', '004779', 'PA', -3, -1, '', '', true, ''],
    ['p4', 'r3', '004801', 'PAG', -2, -2, '', '', true, ''],
  ];
  P.forEach(([id, atv, numero, tipo, chegou, incluido, fiscal, pago, fluig, conf]) => {
    docs['pedidos/' + id] = { atv, mes: dataIso(chegou).slice(0, 7), numero, tipo, chegou: dataIso(chegou), incluido: incluido === '' ? '' : dataIso(incluido),
      fiscal: fiscal === '' ? '' : dataIso(fiscal), pago: pago === '' ? '' : dataIso(pago), fluig, obs: '', por: por('davi'),
      conf: conf ? { s: conf, motivo: '', por: por('sara'), em: quando(-2) } : null };
  });
  return docs;
}

module.exports = {
  nome: 'ferramenta-rotinas',
  ferramenta: SLUG,
  entrar: 'paula@myblue.com.br',
  inicio: '#/m/' + SLUG,
  async preparar(cen) {
    const ids = { paula: cen.id['paula@myblue.com.br'], davi: cen.id['davi@myblue.com.br'], sara: cen.id['sara@myblue.com.br'] };
    await cen.admin('PUT', `/api/admin/modulos/${SLUG}/papeis`, { papeis: [
      { id: 'supervisao', nome: 'Supervisão', descricao: 'Responde o que o Assistente deixa aguardando e confere os pedidos' },
      { id: 'coordenacao', nome: 'Coordenação', descricao: 'Controla a Supervisão e o Assistente, cadastra rotinas e fecha o mês' },
    ] });
    await cen.admin('PUT', `/api/admin/modulos/${SLUG}/acesso`, { acessos: [
      { usuario_id: ids.paula, papeis: ['coordenacao'] }, { usuario_id: ids.sara, papeis: ['supervisao'] }, { usuario_id: ids.davi, papeis: [] },
    ] });
    const r = await cen.admin('POST', `/api/admin/modulos/${SLUG}/documentos`, { modulo: SLUG, documentos: documentos(ids) });
    if (!r || !r.total) throw new Error('não gravou os dados de exemplo: ' + JSON.stringify(r));
  },
  async ajustar(t) {
    const f = quadro(t);
    await f.locator('#abas [data-vista]').first().waitFor({ timeout: 30000 });
    await t.pausa(800);
  },
  abertura: ['As rotinas do Administrativo/Financeiro num lugar só: o que cada um faz, em que pé está e as metas do Assistente.',
    ['A tela do Assistente', 'A tela da Supervisão', 'O controle da Coordenação', 'Fechamento do mês']],
  async gravar(t) {
    const f = quadro(t);
    const ver = async (quem) => { await f.locator('#verComo').selectOption(quem); await t.pausa(900); };

    const A = '1 · Assistente';
    await t.legenda('Cada um abre na sua tela. Com <b>Ver como</b>, a Coordenação vê a do Assistente: as <b>rotinas de hoje</b> para marcar o status.', { etapa: A, ms: 300 });
    await ver('assist');
    await t.mostrar(f.locator('#conteudo .grade-kpi'), 2600);
    await t.legenda('Nas rotinas de pedidos, ele lança cada pedido: nº do Protheus, tipo (PA, PAG ou NENHUM) e o anexo no Fluig. Os <b>prazos</b> saem sozinhos.', { etapa: A, ms: 300 });
    await t.clicar(f.locator('[data-novoped]').first(), { depois: 1400 });
    await f.locator('#pNum').fill('004822');
    await f.locator('#pTipo').selectOption('NENHUM');
    await t.pausa(2200);
    await t.clicar(f.locator('#modalPed [data-fechar]').first(), { depois: 800 });
    await t.legenda('Precisa de retorno? Marca <b>Aguardando supervisão</b>: a Supervisão recebe o aviso no sino e por e-mail. Ao lado, a prévia das <b>metas do mês</b>.', { etapa: A, ms: 300 });
    await t.mostrar(f.locator('#conteudo .coluna').first(), 2800);

    const S = '2 · Supervisão';
    await ver('sup');
    await t.legenda('A Supervisão abre em <b>Aguardando mim</b>: responde ou <b>encaminha à Coordenação</b> o que passa da alçada dela.', { etapa: S, ms: 300 });
    await t.pausa(2600);
    await t.legenda('Em <b>Conferir pedidos</b>, confere no Protheus e no Fluig. Só conta na meta do Assistente o pedido conferido; <b>Devolver</b> volta para ele com o motivo.', { etapa: S, ms: 300 });
    await t.clicar(f.locator('[data-vista="conferir"]'), { depois: 2600 });

    const C = '3 · Coordenação';
    await ver('coord');
    await t.legenda('A Coordenação tem as duas visões: <b>Controle da Supervisão</b> (prazo, tempo de resposta, Análise de Crédito) e <b>Controle do Assistente</b> (metas).', { etapa: C, ms: 300 });
    await t.clicar(f.locator('[data-vista="ctrlS"]'), { depois: 2600 });
    await t.clicar(f.locator('[data-vista="ctrlA"]'), { depois: 2800 });

    const F = '4 · Fechamento';
    await t.legenda('No fim do mês, <b>Fechamento</b>: confere as metas, fecha (o mês trava) e copia o resultado para a <b>Gestão de Premiações</b>.', { etapa: F, ms: 300 });
    await t.clicar(f.locator('[data-vista="fecha"]'), { depois: 3000 });
    await t.legenda('Em <b>Rotinas</b>, a Coordenação cadastra as rotinas de todos (a Supervisão, as do Assistente) e as <b>folgas</b>.', { etapa: F, ms: 300 });
    await t.clicar(f.locator('[data-vista="atv"]'), { depois: 2400 });
  },
  resumo: ['Cada um na sua tela: <b>Assistente</b>, <b>Supervisão</b> e <b>Coordenação</b>', '<b>Aguardando</b> avisa quem responde no sino e por e-mail', 'Pedidos com prazo por tipo · metas e <b>fechamento do mês</b>'],
};

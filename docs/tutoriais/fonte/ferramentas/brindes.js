'use strict';
/*
 * Tutorial do Controle de Brindes (Marketing). Dados fictícios: itens, fornecedores, pedidos e eventos inventados.
 *
 * O Marketing não tem ninguém no cenário: a coordenadora fictícia Bia Torres é criada aqui e, na ferramenta,
 * é aprovadora, almoxarifado e administradora. Os pedidos de exemplo vêm de outras pessoas do cenário.
 */
const SLUG = 'controle-de-brindes';
const { cliente } = require('../gravador');
const { SENHA } = require('../cenario');
const quadro = (t) => t.p.frameLocator(`iframe[data-slug="${SLUG}"]`);

/* datas no fuso de Brasília, relativas a hoje (como a ferramenta conta) */
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const dia = (n) => { const d = new Date(hoje() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const quando = (n, h = 14) => dia(n) + `T${String(h).padStart(2, '0')}:20:00.000Z`;

/* coordenadora do Marketing (fictícia), com o primeiro acesso já feito */
async function pessoaMarketing(cen, base) {
  const r = await cen.admin('POST', '/api/admin/usuarios', { data_nascimento: '1991-03-14', data_admissao: '2024-05-06', nome: 'Bia Torres', email: 'bia@myblue.com.br',
    senha: 'Senha1234', papel: 'coordenador', setores: [cen.S('Marketing')], modulos: [SLUG] });
  const c = cliente(base);
  await c('POST', '/api/auth/login', { email: 'bia@myblue.com.br', senha: 'Senha1234' });
  await c('POST', '/api/auth/senha', { atual: 'Senha1234', nova: SENHA });
  return r.id;
}

const ITENS = [
  // id, sku, nome, mínimo, custo, fornecedor, prazo (dias), saldo inicial, consumo (saídas por mês)
  ['i-br-sac', 'BR-SAC', 'Sacolas de papel', 750, 1.8, 'Gráfica Express', 15, 3200, 260],
  ['i-br-can', 'BR-CAN', 'Canetas', 500, 1.2, 'Brindes & Cia', 20, 1700, 230],
  ['i-br-cad', 'BR-CAD', 'Caderneta', 750, 4.5, 'Gráfica Express', 15, 2600, 180],
  ['i-br-mol', 'BR-MOL', 'Moleskine', 750, 18.9, 'Brindes & Cia', 30, 1350, 160],
  ['i-br-bon', 'BR-BON', 'Bonés', 500, 12.5, 'Têxtil Nordeste', 25, 1030, 150],
  ['i-br-sch', 'BR-SCH', 'Sacochilas', 500, 9.9, 'Têxtil Nordeste', 25, 1500, 110],
  ['i-br-pan', 'BR-PAN', 'Panfletos', 2000, 0.15, 'Gráfica Express', 7, 9000, 900],
];

function documentos(ids, bia) {
  const id = (email) => 'mb-' + ids[email];
  const vera = id('vera@myblue.com.br'), davi = id('davi@myblue.com.br'), marcos = id('marcos@myblue.com.br'), sara = id('sara@myblue.com.br');
  const docs = {
    'config/geral': { aprovadores: [bia], almoxarifado: [bia], admins: [bia], alertas: [], setores: ['Comercial', 'Marketing', 'Sucesso do Cliente', 'Cobrança', 'Crédito', 'Implantação', 'Administrativo', 'Financeiro', 'Jurídico', 'Diretoria'],
      lembreteDias: 1, coberturaDias: 60 },
    'kits/k-sindico': { nome: 'Kit síndico', itens: [{ itemId: 'i-br-sac', qtd: 1 }, { itemId: 'i-br-can', qtd: 1 }, { itemId: 'i-br-cad', qtd: 1 }], ativo: true, atualizadoEm: quando(-150), por: bia },
    'kits/k-evento': { nome: 'Kit evento', itens: [{ itemId: 'i-br-sch', qtd: 1 }, { itemId: 'i-br-bon', qtd: 1 }, { itemId: 'i-br-pan', qtd: 2 }], ativo: true, atualizadoEm: quando(-150), por: bia },
    'compras/c-mol': { itemId: 'i-br-mol', qtd: 1000, previsao: dia(9), fornecedor: 'Brindes & Cia', obs: 'Cotação aprovada pelo Suprimentos', status: 'aberta', criadoEm: quando(-12), por: bia },
    'demandas/d-feira': { itemId: 'i-br-can', qtd: 300, data: dia(24), evento: 'Feira de condomínios — Recife', ativa: true, criadoEm: quando(-5), por: bia },
  };
  for (const [iid, sku, nome, minimo, custo, fornecedor, leadTime] of ITENS) {
    docs['itens/' + iid] = { sku, nome, minimo, categoria: 'Brinde', unidade: 'un.', custo, fornecedor, leadTime, seguranca: 0, lote: 0, localizacao: 'Almoxarifado · prateleira ' + sku.slice(3),
      ativo: true, criadoEm: quando(-170), criadoPor: bia };
    docs['movs/I-' + iid] = { tipo: 'inicial', itemId: iid, qtd: ITENS.find((x) => x[0] === iid)[7], motivo: 'Saldo inicial', em: quando(-170, 12), por: bia };
  }
  // pedidos entregues nos últimos meses (as saídas formam a curva de consumo)
  const quem = [[vera, 'Vera Campos', 'vera@myblue.com.br', 'Comercial'], [davi, 'Davi Rocha', 'davi@myblue.com.br', 'Crédito'], [marcos, 'Marcos Lima', 'marcos@myblue.com.br', 'Cobrança'],
    [sara, 'Sara Alves', 'sara@myblue.com.br', 'Sucesso do Cliente'], [bia, 'Bia Torres', 'bia@myblue.com.br', 'Marketing']];
  const eventos = ['Encontro de síndicos — Natal', 'Visita a condomínios da carteira', 'Assembleia do Res. Primavera', 'Café com síndicos — Fortaleza', 'Feira imobiliária — João Pessoa'];
  let n = 0;
  for (let m = 5; m >= 0; m--) {
    for (let k = 0; k < 2; k++) {
      const d = -(m * 30 + 6 + k * 11); if (d > -2) continue;
      const [sid, nome, email, setor] = quem[(m + k) % quem.length];
      const pid = `BR-${dia(d).slice(2).replace(/-/g, '')}-E${++n}`;
      const linhas = ITENS.map(([iid, , , , , , , , cons]) => ({ itemId: iid, qtd: Math.round((cons / 2) * (0.6 + ((m * 7 + k * 3 + iid.length) % 9) / 10) / 10) * 10 })).filter((l, i) => (i + m + k) % 3 !== 0);
      docs['pedidos/' + pid] = { protocolo: pid, status: 'entregue', solicitanteId: sid, nome, email, setor, finalidade: 'Brindes para o evento', evento: eventos[(m + k) % eventos.length],
        dataDesejada: dia(d + 2), obs: '', linhas, kits: [], criadoEm: quando(d, 13), aprovacao: { por: bia, em: quando(d, 15), linhas, parcial: false, justificativa: '' },
        entrega: { por: bia, em: quando(d + 2, 16) }, historico: [{ em: quando(d, 13), por: sid, acao: 'criado', txt: 'Pedido criado' }, { em: quando(d, 15), por: bia, acao: 'aprovado', txt: 'Aprovado e reservado' },
          { em: quando(d + 2, 16), por: bia, acao: 'entregue', txt: 'Entrega confirmada — saída registrada no estoque' }] };
      for (const l of linhas) docs[`movs/S-${pid}-${l.itemId}`] = { tipo: 'saida', itemId: l.itemId, qtd: l.qtd, motivo: 'Entrega do pedido ' + pid, pedidoId: pid, setor, evento: eventos[(m + k) % eventos.length], em: quando(d + 2, 16), por: bia };
    }
  }
  // um aprovado aguardando retirada e dois pedidos novos aguardando aprovação
  const apr = [{ itemId: 'i-br-bon', qtd: 40 }, { itemId: 'i-br-can', qtd: 60 }];
  docs[`pedidos/BR-${dia(-2).slice(2).replace(/-/g, '')}-K7QD`] = { protocolo: `BR-${dia(-2).slice(2).replace(/-/g, '')}-K7QD`, status: 'aprovado', solicitanteId: davi, nome: 'Davi Rocha', email: 'davi@myblue.com.br',
    setor: 'Crédito', finalidade: 'Brindes para as visitas de implantação', evento: 'Visita a condomínios da carteira', dataDesejada: dia(2), obs: '', linhas: apr, kits: [], criadoEm: quando(-2, 13),
    aprovacao: { por: bia, em: quando(-1, 10), linhas: apr, parcial: false, justificativa: '' },
    historico: [{ em: quando(-2, 13), por: davi, acao: 'criado', txt: 'Pedido criado: 40 Bonés, 60 Canetas' }, { em: quando(-1, 10), por: bia, acao: 'aprovado', txt: 'Aprovado e reservado: 40 Bonés, 60 Canetas' }] };
  const kit = ['i-br-sac', 'i-br-can', 'i-br-cad'].map((itemId) => ({ itemId, qtd: 120, kitId: 'k-sindico' }));
  docs[`pedidos/BR-${dia(-1).slice(2).replace(/-/g, '')}-T4MV`] = { protocolo: `BR-${dia(-1).slice(2).replace(/-/g, '')}-T4MV`, status: 'pendente', solicitanteId: vera, nome: 'Vera Campos', email: 'vera@myblue.com.br',
    setor: 'Comercial', finalidade: 'Kit para os síndicos convidados', evento: 'Encontro de síndicos — Fortaleza', dataDesejada: dia(6), obs: 'Retiro na véspera, pela manhã.',
    linhas: [...kit, { itemId: 'i-br-bon', qtd: 30 }], kits: [{ kitId: 'k-sindico', nome: 'Kit síndico', qtd: 120 }], criadoEm: quando(-1, 15),
    historico: [{ em: quando(-1, 15), por: vera, acao: 'criado', txt: 'Pedido criado: 120 Sacolas de papel, 120 Canetas, 120 Caderneta, 30 Bonés' }] };
  docs[`pedidos/BR-${dia(0).slice(2).replace(/-/g, '')}-P2LX`] = { protocolo: `BR-${dia(0).slice(2).replace(/-/g, '')}-P2LX`, status: 'pendente', solicitanteId: marcos, nome: 'Marcos Lima', email: 'marcos@myblue.com.br',
    setor: 'Cobrança', finalidade: 'Mutirão de negociação com condôminos', evento: 'Mutirão do Cond. Vila Rica', dataDesejada: dia(9), obs: '',
    linhas: [{ itemId: 'i-br-can', qtd: 80 }, { itemId: 'i-br-pan', qtd: 300 }], kits: [], criadoEm: quando(0, 11),
    historico: [{ em: quando(0, 11), por: marcos, acao: 'criado', txt: 'Pedido criado: 80 Canetas, 300 Panfletos' }] };
  return docs;
}

const roteiro = {
  nome: 'ferramenta-brindes',
  ferramenta: SLUG,
  entrar: 'bia@myblue.com.br',
  inicio: '#/m/' + SLUG,
  largura: 1600, // as tabelas do estoque não cabem empilhadas na tela padrão
  async preparar(cen, base) {
    const bia = 'mb-' + await pessoaMarketing(cen, base);
    const r = await cen.admin('POST', `/api/admin/modulos/${SLUG}/documentos`, { modulo: SLUG, documentos: documentos(cen.id, bia) });
    if (!r || !r.total) throw new Error('não gravou os dados de exemplo: ' + JSON.stringify(r));
  },
  async ajustar(t) {
    const f = quadro(t);
    await f.locator('#syncTxt', { hasText: 'ao vivo' }).waitFor({ state: 'attached', timeout: 20000 });
    await f.locator('#v-painel .kpi').first().waitFor({ timeout: 15000 });
    // o portal ainda não oferece claude.use('avisos'): a faixa vermelha "Avisos indisponíveis" fica fora do vídeo (ver relatório)
    const el = await t.p.locator(`iframe[data-slug="${SLUG}"]`).elementHandle();
    const fr = await el.contentFrame();
    await fr.addStyleTag({ content: '#banner .banner.red{display:none!important}' });
    await t.pausa(1500); // alertas de reposição verificados ao abrir
  },
  abertura: ['Estoque de brindes, retiradas com aprovação e reposição — tudo calculado pelo livro de movimentações.',
    ['Painel: saldo, consumo e pendências', 'Pedido: aprovar e reservar', 'Confirmar a entrega (baixa no estoque)', 'Reposição: compra e recebimento']],
  async gravar(t) {
    const f = quadro(t);
    const aba = (id) => f.locator(`.tabs .tab[data-tab="${id}"]`);

    const P = '1 · Painel';
    await t.legenda('No <b>Painel</b>: itens para repor, pedidos aguardando aprovação e entrega, e as saídas do mês.', { etapa: P, ms: 500 });
    await t.mostrar(f.locator('#v-painel .kpis'), 2600);
    await t.legenda('O saldo de cada item: <b>disponível</b> = físico − reservado; o <b>projetado</b> desconta as demandas futuras.', { etapa: P, ms: 300 });
    await t.mostrar(f.locator('#v-painel table'), 3000, { dy: 0.4 });
    await t.rolar(420);
    await t.legenda('Abaixo, a <b>curva de consumo</b> de cada item e as pendências que esperam você.', { etapa: P, ms: 2600 });
    await t.rolar(-420);

    const S = '2 · Pedir';
    await t.legenda('Para pedir, <b>Solicitar</b>: setor, data, evento, finalidade e os itens ou kits. O disponível já desconta o que está reservado.', { etapa: S, ms: 300 });
    await t.clicar(aba('solicitar'), { depois: 1400 });
    await t.mostrar(f.locator('#cart'), 2400);
    await t.legenda('O pedido vai para a aprovadora. Nada sai do estoque até a entrega ser confirmada.', { etapa: S, ms: 2600 });

    const A = '3 · Aprovar';
    await t.legenda('Em <b>Pedidos</b>, o filtro <b>Aguardando você</b> mostra o que você precisa decidir.', { etapa: A, ms: 300 });
    await t.clicar(aba('pedidos'), { depois: 1500 });
    await t.clicar(f.locator('#v-pedidos tr.click', { hasText: 'Vera Campos' }), { depois: 1600 });
    await t.legenda('Confira o disponível e o projetado depois do pedido. Dá para aprovar menos (com justificativa) ou <b>Rejeitar</b>.', { etapa: A, ms: 300 });
    await t.mostrar(f.locator('#ov table'), 3000);
    await t.legenda('<b>Aprovar e reservar</b>: as unidades ficam reservadas para o pedido.', { etapa: A, ms: 300 });
    await t.clicar(f.locator('#pd-ok'), { depois: 2200 });

    const E = '4 · Entregar';
    await t.legenda('Na retirada, o almoxarifado clica em <b>Confirmar entrega</b>: só então a saída baixa o estoque físico.', { etapa: E, ms: 300 });
    await t.clicar(f.locator('#pd-ent'), { depois: 1200 });
    await t.clicar(f.locator('#cf [data-r="1"]'), { depois: 2200 });
    await t.mostrar(f.locator('#ov .hist'), 2400);
    await t.clicar(f.locator('#ov .modal-foot button', { hasText: 'Fechar' }), { depois: 900 });

    const R = '5 · Reposição';
    await t.legenda('Em <b>Estoque</b>: consumo por dia, ruptura prevista e a situação. Filtre <b>Para repor</b>.', { etapa: R, ms: 300 });
    await t.clicar(aba('estoque'), { depois: 1500 });
    await t.clicar(f.locator('#v-estoque .fchip[data-f="alerta"]'), { depois: 1500 });
    await t.clicar(f.locator('#v-estoque tr.click').first(), { depois: 1500 });
    await t.legenda('O item mostra o ponto de pedido e a <b>sugestão de compra</b>. <b>Registrar compra</b> já vem com a quantidade sugerida.', { etapa: R, ms: 300 });
    await t.mostrar(f.locator('#ov .modal-head'), 1000);
    await t.mostrar(f.locator('#ov .kv'), 2000);
    await t.clicar(f.locator('#ov .modal-foot button', { hasText: 'Registrar compra' }), { depois: 1400 });
    await t.clicar(f.locator('#cp-ok'), { depois: 2000 });
    await t.legenda('Chegou a compra? Em <b>Compras em aberto</b>, <b>Receber</b>: a entrada vai para o estoque.', { etapa: R, ms: 300 });
    const receber = f.locator('#v-estoque .li', { hasText: 'Moleskine' }).locator('button', { hasText: 'Receber' });
    await t.clicar(receber, { depois: 1400 });
    await t.clicar(f.locator('#rc-ok'), { depois: 2000 });

    const L = '6 · Relatórios';
    await t.legenda('Em <b>Relatórios</b>: consumo por item, setor e evento, aprovações, inventário e o livro de movimentações, em CSV ou Excel.', { etapa: L, ms: 300 });
    await t.clicar(aba('relatorios'), { depois: 1600 });
    await t.mostrar(f.locator('#v-relatorios .list'), 2800);
  },
  resumo: ['<b>Solicitar</b> → a aprovadora <b>aprova e reserva</b> → o almoxarifado <b>confirma a entrega</b>', 'Saldo pelo livro: disponível = físico − reservado',
    'Para repor → <b>Registrar compra</b> → <b>Receber</b> · Relatórios em CSV/Excel'],
};
module.exports = roteiro;

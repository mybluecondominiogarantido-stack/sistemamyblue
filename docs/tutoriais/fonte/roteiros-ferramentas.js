'use strict';
/*
 * Roteiros das ferramentas que guardam os dados no banco do portal. A ferramenta abre dentro
 * do portal (num quadro), e cada passo usa os elementos de dentro dela. Dados fictícios.
 */
const D = require('./dados-ficticios');

const FUSO = 'America/Sao_Paulo';
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: FUSO });
const dataBr = (n) => { const d = new Date(Date.now() + n * 864e5); return d.toLocaleDateString('pt-BR', { timeZone: FUSO }); };
const quadro = (t, slug) => t.p.frameLocator(`iframe[data-slug="${slug}"]`);
const noQuadro = (t, slug, fn, arg) => t.p.locator(`iframe[data-slug="${slug}"]`).evaluate((el, [fn, arg]) => new el.contentWindow.Function('arg', fn)(arg), [fn, arg]);

module.exports = [
  {
    nome: 'ferramenta-suprimentos',
    ferramenta: 'suprimentos',
    entrar: 'rafa@myblue.com.br',
    inicio: '#/m/suprimentos',
    async preparar(cen) {
      const linhas = [
        ['1021', 'Papelaria Central — material de escritório', 'R$ 486,90', 'Boleto', '1/1', dataBr(-6), 'Pago'],
        ['1022', 'TechNet — manutenção de impressoras', 'R$ 1.250,00', 'Boleto', '1/1', dataBr(-2), 'Em aberto'],
        ['1023', 'Limpa Bem — produtos de limpeza', 'R$ 732,40', 'PIX', '1/1', dataBr(3), 'Em aberto'],
        ['1024', 'Gráfica Express — cartões de visita', 'R$ 320,00', 'Boleto', '1/1', dataBr(1), 'Em aberto'],
        ['1025', 'Café Bom — café e copos', 'R$ 215,00', 'Cartão', '1/1', dataBr(10), 'Em aberto'],
      ];
      await cen.admin('POST', '/api/gas/suprimentos', JSON.stringify({ action: 'addMany', rows: linhas }), 'text/plain');
    },
    abertura: ['Pedidos de compra, vencimentos e pagamentos (às terças e quintas).', ['Lançar à vista e parcelado', 'Janelas de pagamento', 'Marcar como pago e corrigir', 'Conferir um mês']],
    async gravar(t) {
      const f = quadro(t, 'suprimentos');
      await t.legenda('No topo: o que está <b>em aberto</b>, <b>vence em 7 dias</b>, <b>vencidos</b> e <b>pagos</b>. Abaixo, quanto está à vista e parcelado.', { etapa: '1 · Visão geral', ms: 600 });
      await t.mostrar(f.locator('text=/vence em 7 dias/i').first(), 3000);

      const V = '2 · Pedido à vista';
      await t.legenda('Clique em <b>Novo pedido</b> e preencha o número, o valor e a descrição (fornecedor).', { etapa: V, ms: 300 });
      await t.clicar(f.locator('#newBtn'), { depois: 800 });
      await t.digitar(f.locator('#f_num'), '1031');
      await t.digitar(f.locator('#f_valor'), '1250,00');
      await t.digitar(f.locator('#f_desc'), 'Clima Frio — manutenção do ar-condicionado', { atraso: 24 });
      await t.legenda('À vista: informe o vencimento. <b>Próx. terça</b> e <b>Próx. quinta</b> preenchem a próxima janela de pagamento.', { etapa: V, ms: 300 });
      await t.clicar(f.locator('button:has-text("Próx. quinta")'), { depois: 1400 });
      await t.legenda('Deixe a situação <b>Em aberto</b> e clique em <b>Salvar pedido</b>.', { etapa: V, ms: 900 });
      await t.clicar(f.locator('#saveBtn'), { depois: 1800 });

      const P = '3 · Pedido parcelado';
      await t.legenda('Para parcelar, escolha <b>Parcelado</b> e informe o número de parcelas.', { etapa: P, ms: 300 });
      await t.clicar(f.locator('#newBtn'), { depois: 800 });
      await t.digitar(f.locator('#f_num'), '1032');
      await t.digitar(f.locator('#f_valor'), '2700,00');
      await t.digitar(f.locator('#f_desc'), 'Móveis Sul — cadeiras', { atraso: 28 });
      await t.clicar(f.locator('text=Em várias vezes'), { depois: 700 });
      await t.digitar(f.locator('#f_parc'), '3', { depois: 900 });
      await t.legenda('O portal sugere um vencimento por mês. Ajuste a data de cada parcela se precisar e confira o resumo.', { etapa: P, ms: 300 });
      await t.mostrar(f.locator('text=/3× de/'), 3200);
      await t.clicar(f.locator('#saveBtn'), { depois: 1800 });
      await t.legenda('Cada parcela vira uma linha, com o próprio vencimento.', { etapa: P, ms: 3000 });

      const J = '4 · Janelas de pagamento';
      await t.legenda('Os pagamentos saem às <b>terças e quintas</b>. Esta aba mostra a próxima janela: quantos pedidos e quanto pagar.', { etapa: J, ms: 300 });
      await t.clicar(f.locator('button.tab:has-text("Janelas de pagamento")'), { depois: 3400 });
      await t.legenda('Os atrasados aparecem em <b>Pedidos atrasados</b>. Pagou? Clique no <b>✓</b> para marcar como pago.', { etapa: J, ms: 400 });
      await t.clicar(f.locator('button[title="Marcar como pago"]').first(), { depois: 2200 });

      const C = '5 · Corrigir';
      await t.clicar(f.locator('button.tab:has-text("Pedidos")').first(), { depois: 1400 });
      await t.legenda('Marcou por engano? Num pedido pago, o mesmo botão volta para <b>em aberto</b>. O <b>lápis</b> corrige valor, descrição ou vencimento.', { etapa: C, ms: 300 });
      await t.mostrar(f.locator('button[title="Marcar em aberto"]').first(), 2000);
      await t.mostrar(f.locator('button[title="Editar"]').first(), 2200);
      await t.legenda('Use os filtros (à vista, parcelado, vencidos, pagos) e a busca para achar um pedido.', { etapa: C, ms: 300 });
      await t.clicar(f.locator('button:has-text("Vencidos")').first(), { depois: 2000 });
      await t.clicar(f.locator('button:has-text("Status")').first(), { depois: 800 });

      const M = '6 · Conferir um mês';
      await t.legenda('Em <b>Pedidos do mês</b>, escolha o mês: em aberto, vencidos, pagos e o total.', { etapa: M, ms: 300 });
      await t.clicar(f.locator('button.tab:has-text("Pedidos do mês")'), { depois: 2800 });
      await t.legenda('Para levar para uma planilha, clique em <b>Exportar</b>.', { etapa: M, ms: 300 });
      await t.mostrar(f.locator('#exportBtn'), 2600);
    },
    resumo: ['<b>Novo pedido</b>: à vista (vencimento) ou parcelado (uma linha por parcela)', '<b>Janelas de pagamento</b>: o que pagar na terça e na quinta', '<b>✓</b> marca como pago · <b>lápis</b> corrige · <b>Exportar</b> para planilha'],
  },

  {
    nome: 'ferramenta-renegociacoes',
    ferramenta: 'renegociacoes',
    entrar: 'sara@myblue.com.br',
    inicio: '#/m/renegociacoes',
    async preparar(cen, base, br) {
      // algumas renegociações já registradas, lançadas pela própria ferramenta
      const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' });
      const p = await ctx.newPage();
      p.on('dialog', (d) => d.accept().catch(() => {}));
      await p.goto(base + '/login'); await p.fill('#email', 'admin@myblue.com.br'); await p.fill('#senha', 'Admin1234'); await p.click('#btEntrar'); await p.waitForTimeout(1000);
      await p.goto(base + '/m/renegociacoes/'); await p.waitForSelector('#nova_condominio');
      const ano = hoje().slice(0, 4);
      for (const [cond, uf, st, vop, tA, tN, tipo, mes] of [
        ['Cond. Jardim Azul', 'CE', 'fechado', '20.906,08', '2,5', '1,99', 'taxa', '08'], ['Res. Primavera', 'PB', 'fechado', '14.320,00', '2,8', '2,4', 'taxa', '09'],
        ['Ed. Horizonte', 'RN', 'negociando', '9.870,50', '2,5', '2,2', 'boleto', '10'], ['Cond. Monte Verde', 'CE', 'pendente', '31.200,00', '2,2', '1,9', 'taxa', '10'],
      ]) {
        await p.fill('#nova_condominio', cond); await p.selectOption('#nova_estado', uf);
        await p.fill('#nova_data', `${ano}-${mes}-05`); await p.fill('#nova_vigencia', `${ano}-${mes}-10`); await p.selectOption('#nova_status', st);
        await p.fill('#nova_vop', vop); await p.fill('#nova_qtdBoletos', '60'); await p.fill('#nova_fidelizacao', '12');
        await p.fill('#nova_taxaAnterior', tA); await p.fill('#nova_taxaNova', tN); await p.fill('#nova_tarifaAnterior', '2,00'); await p.fill('#nova_tarifaNova', '1,90');
        await p.selectOption('#nova_tipoNeg', tipo);
        await p.click('#novaSave'); await p.waitForTimeout(900);
      }
      await ctx.close();
    },
    async ajustar(t) {
      // a lista de responsáveis dos tickets vem com o nome de um colaborador: troca por um fictício
      await t.p.locator('iframe[data-slug="renegociacoes"]').waitFor();
      await quadro(t, 'renegociacoes').locator('#nova_condominio').waitFor({ timeout: 15000 });
      await noQuadro(t, 'renegociacoes', "document.querySelectorAll('#ticket_respSel option').forEach(function(o){ if (o.value && !/^Outro/.test(o.text)) { o.text = 'Sara Alves'; o.value = 'Sara Alves'; } });");
    },
    abertura: ['Para o Sucesso do Cliente.', ['Registrar uma renegociação', 'Dashboard e perda de receita', 'Central de dados e relatório', 'Tickets do CS']],
    async gravar(t) {
      const f = quadro(t, 'renegociacoes');
      const N = '1 · Nova renegociação';
      await t.legenda('Anexe o <b>relatório de garantia (PDF)</b> para preencher condomínio, VOP e taxa sozinhos, ou preencha à mão.', { etapa: N, ms: 400 });
      await t.mostrar(f.locator('text=Anexar relatório de garantia').first(), 2600);
      await t.digitar(f.locator('#nova_condominio'), 'Cond. Lago Sul');
      await t.escolher(f.locator('#nova_estado'), 'CE');
      await t.preencherCampo(f.locator('#nova_data'), hoje());
      await t.preencherCampo(f.locator('#nova_vigencia'), hoje().slice(0, 8) + '28');
      await t.escolher(f.locator('#nova_status'), 'Fechado');
      await t.legenda('Informe o VOP, os boletos, a fidelização e as condições <b>antes</b> e <b>depois</b>.', { etapa: N, ms: 300 });
      await t.digitar(f.locator('#nova_vop'), '18.450,00');
      await t.digitar(f.locator('#nova_qtdBoletos'), '64');
      await t.digitar(f.locator('#nova_fidelizacao'), '12');
      await t.digitar(f.locator('#nova_taxaAnterior'), '2,5');
      await t.digitar(f.locator('#nova_taxaNova'), '2,1');
      await t.digitar(f.locator('#nova_tarifaAnterior'), '2,00');
      await t.digitar(f.locator('#nova_tarifaNova'), '1,90');
      await t.escolher(f.locator('#nova_tipoNeg'), 'Renegociação de taxa');
      await t.legenda('A <b>perda de receita</b> é calculada sozinha. Clique em <b>Salvar renegociação</b>.', { etapa: N, ms: 1600 });
      await t.clicar(f.locator('#novaSave'), { depois: 1800 });

      const P = '2 · Dashboard';
      await t.legenda('O <b>Dashboard</b> mostra fechados, em negociação e a <b>perda de receita</b>: média, mensal e no ano.', { etapa: P, ms: 300 });
      await t.clicar(f.locator('button.tab:has-text("Dashboard")'), { depois: 2600 });
      await t.rolar(380, f.locator('body'));
      await t.pausa(1800);

      const C = '3 · Central de dados';
      await t.legenda('Na <b>Central de dados</b>: todas as renegociações, com busca, filtro por status e exportação em Excel ou PDF.', { etapa: C, ms: 300 });
      await t.clicar(f.locator('button.tab:has-text("Central de dados")'), { depois: 2400 });
      await t.legenda('<b>Editar</b> corrige um registro. O <b>Relatório mensal</b> gera o PDF do mês.', { etapa: C, ms: 300 });
      await t.mostrar(f.locator('button:has-text("Editar")').first(), 2000);
      await t.clicar(f.locator('button.tab:has-text("Relatório mensal")'), { depois: 1200 });
      await t.mostrar(f.locator('#relGen'), 2200);

      const K = '4 · Tickets do CS';
      await t.legenda('Em <b>Tickets</b>, registre as solicitações do CS: assunto, quem pediu, prioridade e prazo.', { etapa: K, ms: 300 });
      await t.clicar(f.locator('button.tab:has-text("Tickets")'), { depois: 1200 });
      await t.digitar(f.locator('#ticket_assunto'), 'Ajuste de boleto — Cond. Lago Sul', { atraso: 26 });
      await t.digitar(f.locator('#ticket_solicitante'), 'Síndico');
      await t.escolher(f.locator('#ticket_prioridade'), 'Média', { depois: 900 });
      await t.legenda('O prazo de conclusão sai da prioridade (dias úteis). Clique em <b>Salvar ticket</b>.', { etapa: K, ms: 1400 });
      await t.clicar(f.locator('#ticketSave'), { depois: 2400 });
    },
    resumo: ['<b>Nova renegociação</b>: anexe o PDF ou preencha à mão', '<b>Dashboard</b>: perda de receita no mês e no ano', '<b>Central de dados</b>, <b>Relatório mensal</b> e <b>Tickets</b>'],
  },

  {
    nome: 'ferramenta-boletos',
    ferramenta: 'boletos',
    entrar: 'bruna@myblue.com.br',
    inicio: '#/m/boletos',
    async preparar(cen) {
      await cen.admin('POST', '/api/admin/modulos/boletos/documentos', { modulo: 'boletos', origem: 'exemplo', documentos: D.boletos() });
    },
    abertura: ['Supervisão de Crédito: meta de emitir 10 dias antes do vencimento.', ['O painel da competência', 'Marcar a emissão', 'Registrar um erro', 'Cadastro, feriados e fechamento']],
    async gravar(t) {
      const f = quadro(t, 'boletos');
      const P = '1 · Painel';
      await t.legenda('O <b>Painel</b> mostra a competência: emitidos, no prazo, com atraso, atrasados e a meta dos próximos dias.', { etapa: P, ms: 400 });
      await t.mostrar(f.locator('text=/no prazo/i').first(), 3400);
      await t.legenda('Os atrasados aparecem com <b>Emitir</b>: clique quando confirmar a emissão na Vouch. A data de hoje é gravada.', { etapa: P, ms: 300 });
      await t.clicar(f.locator('button:has-text("Emitir")').first(), { depois: 2200 });

      const C = '2 · Controle';
      await t.legenda('Em <b>Controle</b>, a lista da competência por vencimento. Filtre pelo seu nome.', { etapa: C, ms: 300 });
      await t.clicar(f.locator('button:has-text("Controle")').first(), { depois: 1400 });
      await t.escolher(f.locator('#fr'), 'Bruna Reis', { depois: 1600 });
      await t.legenda('Para corrigir uma emissão, altere a data ou desmarque no <b>✕</b>. <b>Emitir pendentes</b> marca o grupo todo.', { etapa: C, ms: 300 });
      await t.mostrar(f.locator('button:has-text("pendentes")').first(), 2600);
      const linha = f.locator('tr:has-text("Cond. Jardim Azul")');
      await t.legenda('Teve <b>erro na emissão</b>? Marque a caixa, classifique a gravidade e o tipo e escreva a justificativa.', { etapa: C, ms: 300 });
      await t.clicar(linha.locator('input[type=checkbox]').last(), { depois: 900 });
      await t.escolher(f.locator('select:has(option:has-text("Não grave"))').first(), 'Não grave');
      await t.escolher(f.locator('select:has(option:has-text("Tipo do erro"))').first(), { index: 1 });
      await t.digitar(f.locator('input.err-in').first(), 'Valor do condomínio desatualizado, reemitido no mesmo dia.', { atraso: 22, depois: 1200 });

      const O = '3 · Cadastro e feriados';
      await t.legenda('Em <b>Cadastro</b>, os condomínios acompanhados: responsável, UF, regra e dia do vencimento.', { etapa: O, ms: 300 });
      await t.clicar(f.locator('button:has-text("Cadastro")').first(), { depois: 2600 });
      await t.legenda('Em <b>Feriados</b>, os feriados que não contam como dia útil na meta. Inclua os estaduais e municipais.', { etapa: O, ms: 300 });
      await t.clicar(f.locator('button:has-text("Feriados")').first(), { depois: 2600 });
      await t.legenda('O <b>Histórico</b> mostra quem fez cada alteração, com <b>Desfazer</b>.', { etapa: O, ms: 300 });
      await t.clicar(f.locator('button:has-text("Histórico")').first(), { depois: 2600 });

      const F = '4 · Fechar o mês';
      await t.legenda('No fim do mês, <b>Fechar competência</b> bloqueia os registros e gera o Excel. Faça também <b>Salvar backup</b>.', { etapa: F, ms: 300 });
      await t.clicar(f.locator('button:has-text("Painel")').first(), { depois: 1200 });
      await t.mostrar(f.locator('button:has-text("Fechar competência")'), 2200);
      await t.mostrar(f.locator('#backup'), 2000);
      await t.legenda('<b>Criar</b> abre a próxima competência. O <b>Comparativo</b> compara os meses fechados.', { etapa: F, ms: 300 });
      await t.mostrar(f.locator('#novoMes'), 2600);
    },
    resumo: ['<b>Painel</b>: a meta da competência', '<b>Emitir</b> grava a data de hoje · <b>Erro na emissão</b> com gravidade e justificativa', '<b>Fechar competência</b> + <b>Salvar backup</b> todo mês'],
  },

  {
    nome: 'ferramenta-sindicos',
    ferramenta: 'sindicos',
    entrar: 'caio@myblue.com.br',
    inicio: '#/m/sindicos',
    async preparar(cen) {
      await cen.admin('POST', '/api/admin/modulos/sindicos/documentos', { modulo: 'sindicos', origem: 'exemplo', documentos: D.sindicos() });
    },
    async ajustar(t) {
      // o exemplo do campo de colar traz nomes de pessoas: troca por um fictício
      await quadro(t, 'sindicos').locator('#paste').waitFor({ timeout: 15000 });
      await noQuadro(t, 'sindicos', "document.getElementById('paste').placeholder = 'Apelido\\tSíndico\\nJardim Azul\\tCarlos Menezes (Morador)';");
    },
    abertura: ['Vouch × base de contatos × lista do Marketing.', ['Atualizar pelo Vouch', 'Corrigir a base de contatos', 'Baixar a lista do Marketing']],
    async gravar(t) {
      const f = quadro(t, 'sindicos');
      const V = '1 · Atualizar pelo Vouch';
      await t.legenda('Copie do Excel as colunas <b>Apelido</b> e <b>Síndico</b> da extração do Vouch e cole aqui (ou carregue o arquivo).', { etapa: V, ms: 300 });
      await t.clicar(f.locator('#paste'), { depois: 300 });
      await f.locator('#paste').fill(D.extracaoVouch());
      await t.pausa(1400);
      await t.clicar(f.locator('#btnCompare'), { depois: 1800 });
      await t.legenda('O resumo mostra o que mudou: síndicos novos, trocados, que saíram e condomínios fora do Vouch.', { etapa: V, ms: 300 });
      await t.mostrar(f.locator('.tile.t-trocado'), 2400);
      await t.clicar(f.locator('.tile.t-trocado'), { depois: 1400 });
      await t.legenda('Para cada síndico novo, complete <b>telefone</b> e <b>e-mail</b> e diga o que fazer com o anterior.', { etapa: V, ms: 300 });
      await t.digitar(f.locator('input[placeholder="Telefone"]').first(), '(85) 90000-4321');
      await t.digitar(f.locator('input[placeholder="E-mail"]').first(), 'mariana.torres@exemplo.com.br', { atraso: 22 });
      await t.legenda('Nada é gravado até você clicar em <b>Confirmar atualização</b>.', { etapa: V, ms: 900 });
      await t.clicar(f.locator('#btnConfirm'), { depois: 2600 });

      const B = '2 · Base de contatos';
      await t.legenda('A <b>Base de contatos</b> é editável direto na tabela. Os atalhos mostram quem está sem telefone ou e-mail.', { etapa: B, ms: 300 });
      await t.clicar(f.locator('button:has-text("2. Base de contatos")'), { depois: 1400 });
      await t.clicar(f.locator('button:has-text("Sem telefone:")'), { depois: 1400 });
      await t.digitar(f.locator('input[placeholder="falta telefone"]').first(), '(85) 90000-7788', { depois: 600 });
      await t.p.keyboard.press('Tab'); await t.pausa(1200);
      await t.legenda('Síndico que saiu: <b>Marcar como saiu</b>. Ele deixa de ir para a lista do Marketing.', { etapa: B, ms: 300 });
      await t.mostrar(f.locator('button:has-text("Marcar como saiu")').first(), 2400);

      const M = '3 · Lista do Marketing';
      await t.legenda('A <b>Lista do Marketing</b> sai pronta: copie ou baixe em Excel ou CSV.', { etapa: M, ms: 300 });
      await t.clicar(f.locator('button:has-text("3. Lista do Marketing")'), { depois: 1600 });
      await t.mostrar(f.locator('#btnXlsx'), 2400);
      await t.legenda('<b>Ignorar</b> tira condomínios de teste da comparação. O <b>Histórico</b> guarda importações, edições e downloads.', { etapa: M, ms: 300 });
      await t.clicar(f.locator('button:has-text("Histórico")').first(), { depois: 2400 });
      await t.legenda('Em <b>Cópia de segurança</b>, exporte toda a base de vez em quando.', { etapa: M, ms: 300 });
      await t.clicar(f.locator('button:has-text("Cópia de segurança")'), { depois: 1000 });
      await t.mostrar(f.locator('#btnExport'), 2400);
    },
    resumo: ['Cole a extração do Vouch → <b>Comparar com a base</b> → <b>Confirmar</b>', '<b>Base de contatos</b> editável, com atalhos do que falta', '<b>Lista do Marketing</b> em Excel ou CSV'],
  },
];

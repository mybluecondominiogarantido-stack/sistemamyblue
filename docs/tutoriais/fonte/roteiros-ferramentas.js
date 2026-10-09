'use strict';
/*
 * Roteiros das ferramentas que guardam os dados no banco do portal. A ferramenta abre dentro
 * do portal (num quadro), e cada passo usa os elementos de dentro dela. Dados fictícios.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const D = require('./dados-ficticios');
const { cliente } = require('./gravador');
const { SENHA } = require('./cenario');

const FUSO = 'America/Sao_Paulo';
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: FUSO });
const dataBr = (n) => { const d = new Date(Date.now() + n * 864e5); return d.toLocaleDateString('pt-BR', { timeZone: FUSO }); };
const quadro = (t, slug) => t.p.frameLocator(`iframe[data-slug="${slug}"]`);
const noQuadro = (t, slug, fn, arg) => t.p.locator(`iframe[data-slug="${slug}"]`).evaluate((el, [fn, arg]) => new el.contentWindow.Function('arg', fn)(arg), [fn, arg]);

/* a base fictícia da Prestação de Contas (parceiros e carteira), que as ferramentas do Comercial leem */
async function basePrestacao(cen, opcoes) {
  for (const x of D.prestacao(new Date(), opcoes)) {
    await cen.admin('POST', '/api/gas/parceiros', JSON.stringify({ sheet: x.sheet, action: 'upsert', item: x.item }), 'text/plain');
  }
}

/* coordenador do Comercial (fictício), com o primeiro acesso já feito */
async function pessoaComercial(cen, base) {
  await cen.admin('POST', '/api/admin/usuarios', { nome: 'Gil Martins', email: 'gil@myblue.com.br', senha: 'Senha1234', papel: 'coordenador', setores: [cen.S('Comercial')], modulos: ['parceiros'] });
  const c = cliente(base);
  await c('POST', '/api/auth/login', { email: 'gil@myblue.com.br', senha: 'Senha1234' });
  await c('POST', '/api/auth/senha', { atual: 'Senha1234', nova: SENHA });
}

/* arquivo de exemplo gravado numa pasta temporária */
const arquivoTemp = (nome, conteudo) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tut-')), nome); fs.writeFileSync(f, conteudo); return f; };

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
      await t.clicar(f.locator('button[title="Marcar como pago"]:visible').first(), { depois: 2200 });

      const C = '5 · Corrigir';
      await t.clicar(f.locator('button.tab:has-text("Pedidos")').first(), { depois: 1400 });
      await t.legenda('Marcou por engano? Num pedido pago, o mesmo botão volta para <b>em aberto</b>. O <b>lápis</b> corrige valor, descrição ou vencimento.', { etapa: C, ms: 300 });
      await t.mostrar(f.locator('button[title="Marcar em aberto"]:visible').first(), 2000);
      await t.mostrar(f.locator('button[title="Editar"]:visible').first(), 2200);
      await t.legenda('Use os filtros (à vista, parcelado, vencidos, pagos) e a busca para achar um pedido.', { etapa: C, ms: 300 });
      await t.clicar(f.locator('button:visible:has-text("Vencidos")').first(), { depois: 2000 });
      await t.clicar(f.locator('button:visible:has-text("Status")').first(), { depois: 800 });

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
        // depois de salvar, a ferramenta muda de aba: volta para o formulário
        await p.click('button.tab:has-text("Nova Renegociação")'); await p.waitForSelector('#nova_condominio', { state: 'visible' });
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
      await t.mostrar(f.locator('button[title="Editar"]:visible').first(), 2000);
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
      await t.clicar(f.locator('button:visible:has-text("Emitir")').first(), { depois: 2200 });

      const C = '2 · Controle';
      await t.legenda('Em <b>Controle</b>, a lista da competência por vencimento. Filtre pelo seu nome.', { etapa: C, ms: 300 });
      await t.clicar(f.locator('button:has-text("Controle")').first(), { depois: 1400 });
      await t.escolher(f.locator('#fr'), 'Bruna Reis', { depois: 1600 });
      await t.legenda('Para corrigir uma emissão, altere a data ou desmarque no <b>✕</b>. <b>Emitir pendentes</b> marca o grupo todo.', { etapa: C, ms: 300 });
      await t.mostrar(f.locator('button:visible:has-text("pendentes")').first(), 2600);
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
      await t.legenda('Nada é gravado até você clicar em <b>Confirmar atualização</b> e confirmar o resumo.', { etapa: V, ms: 900 });
      await t.clicar(f.locator('#btnConfirm'), { depois: 1800 });
      await t.clicar(f.locator('button:visible:text-is("Confirmar")'), { depois: 2400 });

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
  {
    nome: 'ferramenta-parceiros',
    ferramenta: 'parceiros',
    entrar: 'paula@myblue.com.br',
    inicio: '#/m/parceiros',
    // parceiros, carteira e lançamentos fictícios de janeiro até o mês anterior; dois condomínios
    // da Central Síndicos ficam sem lançamento no último mês, para o vídeo lançar
    preparar: (cen) => basePrestacao(cen, { pular: [6, 7] }),
    abertura: ['A comissão dos parceiros: a competência do mês, paga no mês seguinte.', ['Lançar o mês de um parceiro', 'O relatório da prestação de contas', 'Boletos com excedente', 'Marcar envio e pagamento', 'Cadastrar condomínios e parceiros']],
    async gravar(t) {
      const f = quadro(t, 'parceiros');
      const central = 'p-centralsindicosassociados';

      const V = '1 · Prestações do mês';
      await t.clicar(f.locator('[data-aba=mes]'), { depois: 1500 });
      await t.legenda('Em <b>Prestações do mês</b>, escolha a competência: cada parceiro aparece com o valor da comissão e a situação (lançado, enviado, pago).', { etapa: V, ms: 600 });
      await t.mostrar(f.locator('[data-mes].ativa, [data-mes].on').first(), 2600);
      await t.legenda('A competência é o mês do movimento; a comissão dela é paga no mês seguinte.', { etapa: V, ms: 3200 });

      const L = '2 · Lançar o mês';
      await t.legenda('Para lançar, abra <b>Lançamento</b> e escolha o parceiro. A competência já vem marcada.', { etapa: L, ms: 300 });
      await t.clicar(f.locator('[data-aba=lancar]'), { depois: 1400 });
      await t.escolher(f.locator('#selParceiro'), { value: central }, { depois: 1600 });
      await t.legenda('Aparecem os condomínios do parceiro. Informe, de cada um, TSR, tarifa bancária, multa, juros, encargos e correção.', { etapa: L, ms: 600 });
      const valores = [['4.215,30', '268,80', '96,40', '41,25', '18,90', '9,60'], ['3.684,75', '232,50', '71,10', '35,80', '22,40', '6,15']];
      let n = 0;
      for (let i = 0; i < 3 && n < valores.length; i++) {
        const tsr = f.locator(`[data-i="${i}"][data-k="tsr"]`);
        if ((await tsr.inputValue()).replace(/[0,.]/g, '')) continue; // já lançado
        const ks = ['tsr', 'tarifa', 'multa', 'juros', 'encargos', 'correcao'];
        for (const [j, k] of ks.entries()) await t.digitar(f.locator(`[data-i="${i}"][data-k="${k}"]`), valores[n][j], { atraso: 30, depois: 200 });
        n++;
      }
      await t.legenda('O balanço da garantidora (PDF) pode ser anexado aqui, para ir junto no relatório. Depois, <b>Salvar e ver relatório</b>.', { etapa: L, ms: 300 });
      await t.mostrar(f.locator('#dropzone'), 2600);
      await t.clicar(f.locator('#btnSalvarVer'), { depois: 2200 });

      const R = '3 · Relatório';
      await t.legenda('O relatório da prestação de contas: cada condomínio, a base de cálculo, o percentual e a comissão total do mês.', { etapa: R, ms: 600 });
      await t.rolar(420);
      await t.pausa(1800);
      await t.rolar(-420);
      await t.legenda('Daqui você <b>baixa o PDF</b> para enviar ao parceiro, imprime ou volta para corrigir algum valor.', { etapa: R, ms: 300 });
      await t.mostrar(f.locator('#btnBaixarPdf'), 2000);
      await t.mostrar(f.locator('#btnEditarRel'), 1600);
      await t.clicar(f.locator('#btnVoltar'), { depois: 1500 });

      // parceiro fictício com regra de excedente (piso de R$ 2,50 por boleto)
      const B = '4 · Boletos com excedente';
      await t.legenda('Parceiro com regra de <b>excedente de boleto</b>: em <b>Extras do contrato</b>, informe o <b>valor por boleto</b> e a <b>quantidade de boletos emitidos</b> de cada condomínio.', { etapa: B, ms: 300 });
      await t.escolher(f.locator('#selParceiro'), { value: 'p-nordestecondominios' }, { depois: 1600 });
      await t.mostrar(f.locator('h3:has-text("Extras do contrato")'), 1600);
      await t.mostrar(f.locator('[data-k="valorBoleto"]').first(), 1800);
      await t.mostrar(f.locator('[data-k="qtdBoletos"]').first(), 1800);
      await t.legenda('O parceiro recebe <b>(valor por boleto − piso) × quantidade</b>. A tarifa bancária do balanço não entra nessa conta.', { etapa: B, ms: 300 });
      await t.mostrar(f.locator('#previa'), 3600);
      await t.clicar(f.locator('#btnSalvarVer'), { depois: 2200 });
      await t.legenda('No relatório, a seção <b>Boletos</b> mostra a conta de cada condomínio: quantidade, valor por boleto, excedente e repasse.', { etapa: B, ms: 300 });
      await t.rolar(380, f.locator('text=/Boletos — regra contratual/'));
      await t.mostrar(f.locator('th:has-text("Excedente por boleto")'), 3800);
      await t.clicar(f.locator('#btnVoltar'), { depois: 1500 });

      const E = '5 · Envio e pagamento';
      await t.clicar(f.locator('[data-aba=mes]'), { depois: 1500 });
      await t.legenda('De volta ao mês: enviou a prestação ao parceiro? Marque <b>Enviado</b> — a data do envio fica registrada.', { etapa: E, ms: 300 });
      await t.clicar(f.locator(`[data-env="${central}"]`), { depois: 1600 });
      await t.legenda('Quando o pagamento sair, marque <b>Pago</b>. Os filtros mostram o que falta enviar ou pagar.', { etapa: E, ms: 300 });
      await t.clicar(f.locator('[data-pag="p-alfaadministradora"]'), { depois: 1800 });
      await t.mostrar(f.locator('#btnZipMes'), 2000);
      await t.legenda('<b>Baixar todos</b> gera um ZIP com os relatórios do mês.', { etapa: E, ms: 2200 });

      const C = '6 · Condomínios';
      await t.legenda('Condomínio novo na carteira de um parceiro? Em <b>Condomínios</b>, informe o nome, o parceiro e o percentual.', { etapa: C, ms: 300 });
      await t.clicar(f.locator('[data-aba=condos]'), { depois: 1500 });
      await t.digitar(f.locator('#nCNome'), 'Cond. Serra Azul', { atraso: 34 });
      await t.escolher(f.locator('#nCP1'), { value: 'p-alfaadministradora' });
      await t.digitar(f.locator('#nCR1'), '10');
      await t.legenda('Se a comissão é dividida, informe o segundo parceiro. O valor do boleto entra na conta do excedente de boletos.', { etapa: C, ms: 300 });
      await t.digitar(f.locator('#nCBol'), '3,20');
      await t.clicar(f.locator('#btnAddCondo'), { depois: 2000 });

      const P = '7 · Parceiros';
      await t.legenda('Em <b>Parceiros</b> ficam as regras de cada contrato: percentual, o que entra na base (tarifa, encargos), a regra de boletos com o piso, cláusula de venda e as categorias.', { etapa: P, ms: 300 });
      await t.clicar(f.locator('[data-aba=parceiros]'), { depois: 1800 });
      await t.mostrar(f.locator('text=/Alfa Administradora/').first(), 1800);
      await t.legenda('Para cadastrar, clique em <b>Novo parceiro</b>.', { etapa: P, ms: 300 });
      await t.clicar(f.locator('#novoParc > summary'), { depois: 300 });
      // a lista se redesenha quando termina de salvar o que foi feito antes; mantém o cadastro aberto
      await noQuadro(t, 'parceiros', "setInterval(() => { const d = document.getElementById('novoParc'); if (d && !d.open) d.open = true; }, 100);");
      await t.pausa(900);
      await t.mostrar(f.locator('#novoParc'), 3600, { dy: 0.3 });
      await t.legenda('Tudo fica salvo no portal, compartilhado com a equipe — e o <b>PartnerChip</b> mostra esses números em painéis.', { etapa: P, ms: 3600 });
    },
    resumo: ['<b>Lançamento</b>: parceiro → valores de cada condomínio → <b>Salvar e ver relatório</b>', 'Boletos com excedente: <b>(valor por boleto − piso) × quantidade</b>', '<b>Prestações do mês</b>: marcar enviado e pago, baixar os relatórios', '<b>Condomínios</b> e <b>Parceiros</b>: a carteira e as regras do contrato'],
  },
  {
    nome: 'ferramenta-comissoes',
    ferramenta: 'comissoes-de-novos-condominios',
    entrar: 'gil@myblue.com.br',
    inicio: '#/m/comissoes-de-novos-condominios',
    // a lista de parceiros embutida no HTML vira a lista fictícia
    adaptarHtml: (html) => D.trocarLista(html, 'PARCEIROS_BASE', D.prestacao().filter((x) => x.sheet === 'partners').map(({ item }) => [item.id, item.nome, item.uf])),
    async preparar(cen, base) { await basePrestacao(cen); await pessoaComercial(cen, base); },
    abertura: ['Os condomínios que entraram no mês: quem veio por parceiro e qual comissão pagar.', ['Importar a planilha de implantações', 'Comercial: responder a comissão', 'Gestão: aprovar ou devolver', 'Financeiro: cadastrar na Prestação de Contas']],
    async gravar(t) {
      const f = quadro(t, 'comissoes-de-novos-condominios');
      const csv = arquivoTemp('implantacoes.csv', D.implantacoes());

      const I = '1 · Importar o mês';
      await t.legenda('Comece importando a <b>planilha de implantações</b> do mês (Excel ou CSV): nº do formulário, condomínio, estado, 1º vencimento, ADM e executivo.', { etapa: I, ms: 600 });
      await t.enviarArquivo(f.locator('text=/Importar planilha do mês/').first(), f.locator('#fileInput'), csv, { depois: 1600 });
      await t.legenda('O mês de entrada é sugerido pelo 1º vencimento. Confira e confirme.', { etapa: I, ms: 300 });
      await t.mostrar(f.locator('#iRef'), 1800);
      await t.clicar(f.locator('#iOk'), { depois: 2200 });
      await t.legenda('Cada condomínio aparece com o executivo e a ADM informada, aguardando a resposta do comercial. Importar de novo atualiza sem apagar as respostas.', { etapa: I, ms: 600 });

      const C = '2 · Resposta do comercial';
      await t.legenda('Clique em <b>Responder</b>: o condomínio veio por parceiro?', { etapa: C, ms: 300 });
      await t.clicar(f.locator('[data-abrir$="-f4101"]'), { depois: 1400 });
      await t.clicar(f.locator('label:has(input[name=tp][value=sim])'), { depois: 800 });
      await t.legenda('Confirme o parceiro (a ferramenta sugere pela ADM informada) e marque o tipo de comissão: <b>recorrência</b> e/ou <b>venda</b>.', { etapa: C, ms: 300 });
      await t.escolher(f.locator('#rP1'), { value: 'p-alfaadministradora' });
      await t.clicar(f.locator('#rRec'), { depois: 300 });
      if (!(await f.locator('#rRec').isChecked())) await f.locator('#rRec').check(); // a janela rola enquanto o cursor chega
      await t.pausa(600);
      await t.digitar(f.locator('#rObs'), 'Indicação do síndico, contrato assinado em setembro.', { atraso: 22 });
      await t.clicar(f.locator('#rEnviar'), { depois: 1800 });
      await t.legenda('Sem parceiro? Marque <b>Não tem parceiro</b> — não gera comissão, mas fica registrado.', { etapa: C, ms: 300 });
      await t.clicar(f.locator('[data-abrir$="-f4103"]'), { depois: 1300 });
      await t.clicar(f.locator('label:has(input[name=tp][value=nao])'), { depois: 300 });
      if (!(await f.locator('input[name=tp][value=nao]').isChecked())) await f.locator('input[name=tp][value=nao]').check();
      await t.pausa(600);
      await t.clicar(f.locator('#rEnviar'), { depois: 1800 });

      const A = '3 · Aprovação da gestão';
      await t.legenda('As respostas vão para <b>Aprovação da gestão</b>: aprove, devolva ao comercial com um motivo ou corrija a resposta.', { etapa: A, ms: 300 });
      await t.clicar(f.locator('[data-view=aprovacao]'), { depois: 1600 });
      await t.mostrar(f.locator('[data-dev]').first(), 1800);
      await t.clicar(f.locator('[data-apr]').first(), { depois: 1600 });
      await t.clicar(f.locator('[data-apr]').first(), { depois: 1600 });

      const F = '4 · Financeiro';
      await t.legenda('No <b>Financeiro</b> ficam as comissões aprovadas, pagas no mês seguinte.', { etapa: F, ms: 300 });
      await t.clicar(f.locator('[data-view=financeiro]'), { depois: 1800 });
      await t.legenda('<b>Cadastrar</b> cria o condomínio e o vínculo com o parceiro na <b>Prestação de Contas</b> — sem digitar de novo.', { etapa: F, ms: 300 });
      await t.clicar(f.locator('[data-cad]').first(), { depois: 1400 });
      await t.digitar(f.locator('#cNome'), 'Cond. Lago Azul', { atraso: 30 });
      await t.escolher(f.locator('select[data-i="0"]'), { value: 'p-alfaadministradora' });
      await t.clicar(f.locator('#cOk'), { depois: 2200 });

      const X = '5 · Acessos e Excel';
      await t.legenda('Em <b>Acessos</b> você define quem é comercial, gestão e financeiro. Enquanto não houver gestor definido, todos veem todas as abas.', { etapa: X, ms: 300 });
      await t.clicar(f.locator('[data-view=acessos]'), { depois: 3000 });
      await t.legenda('E o <b>Excel do mês</b> leva a lista completa para uma planilha.', { etapa: X, ms: 300 });
      await t.mostrar(f.locator('#exportBtn'), 2400);
    },
    resumo: ['<b>Importar</b> a planilha de implantações do mês', '<b>Comercial</b> responde: parceiro e tipo de comissão', '<b>Gestão</b> aprova · <b>Financeiro</b> cadastra na Prestação de Contas'],
  },
  {
    nome: 'ferramenta-partnerchip',
    ferramenta: 'partnerchip-resultados',
    entrar: 'gil@myblue.com.br',
    inicio: '#/m/partnerchip-resultados',
    async preparar(cen, base, br) {
      await basePrestacao(cen); await pessoaComercial(cen, base);
      // o painel recebe os números quando alguém com acesso à Prestação de Contas abre a página
      const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' });
      const p = await ctx.newPage();
      await p.goto(base + '/login'); await p.fill('#email', 'admin@myblue.com.br'); await p.fill('#senha', 'Admin1234'); await p.click('#btEntrar'); await p.waitForTimeout(1000);
      await p.goto(base + '/m/partnerchip-resultados/'); await p.waitForSelector('text=/A PAGAR/i'); await p.waitForTimeout(2500);
      await ctx.close();
    },
    abertura: ['O painel dos parceiros: carteira, comissões apuradas e pagas, ao vivo da Prestação de Contas.', ['Visão geral do ano', 'A ficha de cada parceiro', 'Condomínios e filtros', 'Exportar para Excel']],
    async gravar(t) {
      const f = quadro(t, 'partnerchip-resultados');

      const G = '1 · Visão geral';
      await t.legenda('Os números vêm direto da <b>Prestação de Contas</b>: comissão apurada no ano, quanto já foi pago e quanto falta pagar.', { etapa: G, ms: 600 });
      await t.mostrar(f.locator('text=/A PAGAR/i').first(), 2600);
      await t.legenda('O gráfico compara, mês a mês, o apurado e o pago aos parceiros.', { etapa: G, ms: 300 });
      await t.rolar(380);
      await t.pausa(2600);
      await t.rolar(-380);

      const P = '2 · Parceiros';
      await t.legenda('Em <b>Parceiros</b>: carteira, regra, apurado, pago, a pagar e a situação da última competência.', { etapa: P, ms: 300 });
      await t.clicar(f.locator('[data-view=parceiros]'), { depois: 2600 });
      await t.legenda('Clique num parceiro para abrir a <b>ficha</b>: regras do contrato, carteira de condomínios e o histórico de prestações.', { etapa: P, ms: 300 });
      await t.clicar(f.locator('tr[data-p]:visible').first(), { depois: 2400 });
      await t.rolar(420);
      await t.pausa(2400);
      await t.clicar(f.locator('[data-fechar]:visible').first(), { depois: 1200 });

      const C = '3 · Condomínios e filtros';
      await t.legenda('Em <b>Condomínios</b>: o parceiro de cada um, a comissão do último mês e do ano.', { etapa: C, ms: 300 });
      await t.clicar(f.locator('[data-view=condos]'), { depois: 2400 });
      await t.legenda('Filtre por estado, por categoria (recorrência, venda, condição especial) ou busque pelo nome.', { etapa: C, ms: 300 });
      await t.escolher(f.locator('#fUf'), 'CE', { depois: 1800 });
      await t.digitar(f.locator('#fBusca'), 'Nordeste', { atraso: 60, depois: 1800 });
      await t.digitar(f.locator('#fBusca'), '', { depois: 400 });
      await t.escolher(f.locator('#fUf'), { index: 0 }, { depois: 800 });

      const X = '4 · Exportar';
      await t.legenda('<b>Excel</b> exporta o painel. Os dados atualizam sozinhos; <b>Atualizar agora</b> busca na hora.', { etapa: X, ms: 300 });
      await t.mostrar(f.locator('#exportBtn'), 2200);
      await t.mostrar(f.locator('#refreshBtn'), 2000);
    },
    resumo: ['<b>Visão geral</b>: apurado, pago e a pagar no ano', '<b>Parceiros</b>: clique para abrir a ficha', '<b>Condomínios</b>, filtros e <b>Excel</b>'],
  },
  {
    nome: 'ferramenta-patrocinio',
    ferramenta: 'central-patrocinio',
    entrar: 'paula@myblue.com.br',
    inicio: '#/m/central-patrocinio',
    async preparar(cen, base, br) {
      // recibos já emitidos ao longo do ano, lançados pela própria ferramenta
      const ctx = await br.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR', acceptDownloads: true });
      const p = await ctx.newPage();
      p.on('dialog', (d) => d.accept().catch(() => {}));
      await p.goto(base + '/login'); await p.fill('#email', 'admin@myblue.com.br'); await p.fill('#senha', 'Admin1234'); await p.click('#btEntrar'); await p.waitForTimeout(1000);
      await p.goto(base + '/m/central-patrocinio/'); await p.waitForSelector('#condo');
      const ano = hoje().slice(0, 4);
      for (const [condo, cnpj, rateio, evento, cidade, data] of [
        ['Cond. Bela Vista', '11.222.333/0001-01', '12.800,00', 'Festa Junina', 'Fortaleza', '06-14'],
        ['Res. Primavera', '22.333.444/0001-02', '52.300,00', 'Festa Junina', 'Natal', '06-21'],
        ['Cond. Vila Rica', '33.444.555/0001-03', '27.400,00', 'Dia das Crianças', 'João Pessoa', '07-12'],
        ['Ed. Aurora', '44.555.666/0001-04', '86.900,00', 'Festa da Primavera', 'Fortaleza', '08-23'],
        ['Cond. Monte Verde', '55.666.777/0001-05', '33.150,00', 'Torneio de Futebol', 'Natal', '09-06'],
        ['Res. Atlântico', '66.777.888/0001-06', '118.000,00', 'Festa de Aniversário do Condomínio', 'Fortaleza', '09-20'],
      ]) {
        await p.fill('#condo', condo); await p.fill('#cnpj', cnpj); await p.fill('#rateio', rateio); await p.locator('#rateio').blur();
        await p.fill('#eventoNome', evento); await p.fill('#cidade', cidade); await p.fill('#data', `${ano}-${data}`);
        await p.click('#btnSalvar'); await p.waitForTimeout(1500);
        await p.click('[data-aba=novo]'); await p.waitForTimeout(400);
      }
      await p.click('[data-aba=recibos]'); await p.click('[data-ref=todos]'); await p.waitForTimeout(600);
      for (const [campo, n] of [['env', 5], ['ass', 4], ['pag', 3]]) {
        for (let i = 0; i < n; i++) { await p.locator(`input[data-${campo}]`).nth(i).click(); await p.waitForTimeout(500); }
      }
      await p.waitForTimeout(1500);
      await ctx.close();
    },
    abertura: ['Recibos de patrocínio de eventos dos condomínios: emitir, enviar, assinar e pagar.', ['Emitir um recibo', 'Acompanhar envio, assinatura e pagamento', 'Resultados do ano']],
    async gravar(t) {
      const f = quadro(t, 'central-patrocinio');

      const N = '1 · Novo recibo';
      await t.legenda('Anexe o <b>relatório de garantia</b> (PDF) e o nome, o CNPJ e o rateio são lidos sozinhos — ou preencha à mão.', { etapa: N, ms: 300 });
      await t.mostrar(f.locator('#drop'), 2600);
      await t.digitar(f.locator('#condo'), 'Cond. Jardim Azul', { atraso: 32 });
      await t.digitar(f.locator('#cnpj'), '12.345.678/0001-90', { atraso: 28 });
      await t.legenda('Informe o <b>Total Rateio (VOP)</b>: a faixa e o valor a pagar são preenchidos sozinhos.', { etapa: N, ms: 300 });
      await t.digitar(f.locator('#rateio'), '38.500,00', { atraso: 40 });
      await t.clicar(f.locator('#eventoNome'), { depois: 1400 });
      await t.mostrar(f.locator('#valor'), 2200);
      await t.digitar(f.locator('#eventoNome'), 'Festa da Primavera', { atraso: 30 });
      await t.digitar(f.locator('#cidade'), 'Fortaleza', { atraso: 34 });
      await t.preencherCampo(f.locator('#data'), hoje());
      await t.legenda('<b>Salvar e baixar PDF</b> guarda o recibo e baixa o PDF para enviar ao síndico. <b>Copiar e-mail</b> monta o texto do e-mail.', { etapa: N, ms: 300 });
      await t.clicar(f.locator('#btnSalvar'), { depois: 2200 });

      const R = '2 · Recibos';
      await t.legenda('Em <b>Recibos</b>, por mês: o que falta enviar, aguardando assinatura, a pagar e os pagos.', { etapa: R, ms: 300 });
      await t.clicar(f.locator('[data-aba=recibos]'), { depois: 2200 });
      await t.legenda('Enviou por e-mail? Marque <b>enviado</b>. Recebeu assinado? Marque <b>assinado</b> — o pagamento sai em até 7 dias.', { etapa: R, ms: 300 });
      await t.clicar(f.locator('input[data-env]:visible').first(), { depois: 1500 });
      await t.clicar(f.locator('input[data-ass]:visible').first(), { depois: 1500 });
      await t.legenda('Em cada linha: baixar o PDF de novo, o e-mail para o síndico, editar e o histórico.', { etapa: R, ms: 300 });
      await t.mostrar(f.locator('[data-hist]:visible').first(), 2200);
      await t.legenda('Veja todos os meses e use os filtros para achar o que está pendente.', { etapa: R, ms: 300 });
      await t.clicar(f.locator('[data-ref=todos]'), { depois: 1800 });
      await t.clicar(f.locator('[data-f=assinado]'), { depois: 2000 });
      await t.clicar(f.locator('[data-f=todos]'), { depois: 800 });

      const S = '3 · Resultados';
      await t.legenda('<b>Resultados</b>: lançado e pago no ano, o que está a pagar, recibos sem assinatura e o andamento de cada etapa.', { etapa: S, ms: 300 });
      await t.clicar(f.locator('[data-aba=resultados]'), { depois: 2800 });
      await t.rolar(400);
      await t.pausa(2400);
      await t.rolar(-400);
      await t.mostrar(f.locator('#btnXls'), 2200);
    },
    resumo: ['<b>Novo recibo</b>: VOP → faixa e valor automáticos → <b>Salvar e baixar PDF</b>', '<b>Recibos</b>: marcar enviado, assinado e pago', '<b>Resultados</b> do ano e Excel'],
  },
  {
    nome: 'ferramenta-credito',
    ferramenta: 'credito',
    entrar: 'bruna@myblue.com.br',
    inicio: '#/m/credito',
    abertura: ['As automações do setor de Crédito, num lugar só — tudo roda no navegador.', ['As ferramentas da central', 'Exemplo: Planilha de Moradores', 'Voltar e abrir em nova aba']],
    async gravar(t) {
      const f = quadro(t, 'credito');
      const xlsx = require(path.join(process.env.BIBLIOTECAS || '', 'node_modules', 'xlsx'));
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(D.moradores()), 'Moradores');
      const planilha = arquivoTemp('Cadastro_Cond_Jardim_Azul.xlsx', xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));

      const H = '1 · As ferramentas';
      await t.legenda('Cada cartão é uma ferramenta: prestação de contas, recibos de entrega, balancetes, moradores, consumos e o divisor de recibos.', { etapa: H, ms: 600 });
      for (const v of ['montador', 'nobre', 'balancetes', 'consumos']) await t.mostrar(f.locator(`[data-view=${v}]`), 1500);
      await t.legenda('Os arquivos são processados no seu navegador: nada é enviado para fora.', { etapa: H, ms: 2600 });

      const M = '2 · Planilha de Moradores';
      await t.legenda('Exemplo: a <b>Planilha de Moradores</b> transforma o cadastro recebido no modelo de importação da Vouch.', { etapa: M, ms: 300 });
      await t.clicar(f.locator('[data-view=moradores]'), { depois: 2000 });
      const m = f.frameLocator('#frame-moradores');
      await t.legenda('Solte a planilha (ou o PDF de contatos) na área indicada.', { etapa: M, ms: 300 });
      await t.enviarArquivo(m.locator('#drop'), m.locator('#file'), planilha, { depois: 2200 });
      await t.legenda('Confira os contatos lidos — qualquer campo pode ser corrigido — e informe o nome do condomínio.', { etapa: M, ms: 300 });
      await t.digitar(m.locator('#condoNomeInput'), 'Cond. Jardim Azul', { atraso: 32 });
      await t.rolar(300);
      await t.clicar(m.locator('#btnGerarFinal'), { depois: 2200 });
      await t.legenda('Pronto: unidades, contatos e as <b>pendências</b> (quem está sem CPF, telefone ou e-mail).', { etapa: M, ms: 300 });
      await t.mostrar(m.locator('text=/Pendências/').first(), 2400);
      await t.legenda('<b>Baixar planilha Vouch</b> gera o Excel com as abas Listagem e Pendências; o relatório de pendências também sai em PDF.', { etapa: M, ms: 300 });
      await t.clicar(m.locator('#btnBaixar'), { depois: 1800 });
      await t.mostrar(m.locator('#btnPdf'), 1800);

      const V = '3 · Navegar';
      await t.legenda('<b>Abrir em nova aba</b> usa a ferramenta em tela cheia. <b>Ferramentas</b> volta para a lista.', { etapa: V, ms: 300 });
      await t.mostrar(f.locator('#openNewTab'), 1800);
      await t.clicar(f.locator('#btnHome'), { depois: 1600 });
      await t.legenda('As outras funcionam do mesmo jeito: abra o cartão, envie o arquivo recebido e baixe o resultado.', { etapa: V, ms: 300 });
      await t.clicar(f.locator('[data-view=balancetes]'), { depois: 2600 });
      await t.clicar(f.locator('#btnHome'), { depois: 1400 });
    },
    resumo: ['Escolha a ferramenta pelo <b>cartão</b>', 'Envie o arquivo recebido, confira e <b>baixe o resultado</b>', '<b>Ferramentas</b> volta para a lista · tudo roda no navegador'],
  },
];

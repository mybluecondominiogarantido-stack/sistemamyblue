'use strict';
/*
 * Roteiros dos vídeos tutoriais. O "nome" é o slug do catálogo do portal (server/tutoriais.js),
 * de onde vêm o título e o público mostrados no cartão de abertura. Cada roteiro tem:
 *   entrar      e-mail de quem aparece usando (sem ele o vídeo começa na tela de login)
 *   inicio      rota aberta antes de começar a gravar
 *   ferramenta  slug da ferramenta real que o vídeo usa (precisa do HTML em FERRAMENTAS)
 *   preparar    ajustes no cenário antes de gravar
 *   abertura    [texto, itens] do cartão de abertura
 *   gravar      o passo a passo, com legendas
 *   resumo      itens do cartão final
 */
const fs = require('fs');
const { cliente } = require('./gravador');

const menu = (href) => `#lateral a[href="${href}"]`;
const fecharModal = '.fundo-modal .modal-pe [data-fechar]';
const FUSO = 'America/Sao_Paulo';
/* dia útil daqui a n dias, no formato dos campos de data (AAAA-MM-DD) */
function diaUtil(n) {
  const d = new Date(Date.now() + n * 864e5);
  while ([0, 6].includes(new Date(d.toLocaleString('en-US', { timeZone: FUSO })).getDay())) d.setTime(d.getTime() + 864e5);
  return d.toLocaleDateString('sv-SE', { timeZone: FUSO });
}
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: FUSO });

module.exports = [
  /* ======================= Primeiros passos ======================= */
  {
    nome: 'portal-primeiro-acesso',
    inicio: 'login',
    async preparar(cen) {
      // pessoa nova, ainda com a senha temporária
      await cen.admin('POST', '/api/admin/usuarios', { nome: 'Nina Torres', email: 'nina@myblue.com.br', senha: 'Bemvinda1', setores: [cen.S('CS')], modulos: ['renegociacoes'] });
    },
    abertura: ['Do primeiro login até achar as suas ferramentas.', ['Criar a sua senha', 'A tela inicial e o menu', 'Abrir uma ferramenta', 'Avisos e a sua conta']],
    async gravar(t, cen) {
      const E = '1 · Primeiro acesso';
      await t.legenda('No primeiro acesso, entre com o e-mail e a <b>senha temporária</b> que você recebeu.', { etapa: E, ms: 1000 });
      await t.digitar('#email', 'nina@myblue.com.br');
      await t.digitar('#senha', 'Bemvinda1', { atraso: 60 });
      await t.clicar('#btEntrar', { depois: 1500 });
      await t.legenda('Agora crie a <b>sua senha</b>: pelo menos 8 caracteres, com letras e números.', { etapa: E, ms: 900 });
      await t.digitar('#nova', 'MinhaSenha2026', { atraso: 55 });
      await t.digitar('#nova2', 'MinhaSenha2026', { atraso: 45 });
      await t.clicar('#fTroca button[type=submit]', { depois: 2200 });

      const I = '2 · A tela inicial';
      await t.legenda('Esta é a tela inicial. Aqui fica o atalho da <b>Central de Tickets</b>, para pedir algo a outro setor.', { etapa: I, ms: 600 });
      await t.mostrar('.atalho-tickets', 2800, { dx: 0.3 });
      await t.legenda('Logo abaixo, as <b>ferramentas</b> liberadas para você. Clique em <b>Abrir</b> para usar.', { etapa: I, ms: 600 });
      await t.mostrar('.cartoes .cartao', 2800);

      const M = '3 · O menu';
      await t.legenda('No menu ao lado ficam a <b>Central de Links</b>, os <b>Tutoriais</b>, os <b>Tickets</b> e a <b>Carteira de condomínios</b>.', { etapa: M, ms: 400 });
      for (const h of ['#/links', '#/tutoriais', '#/tickets', '#/carteira']) await t.mostrar(menu(h), 900, { dx: 0.3 });
      await t.legenda('E, separadas por setor, as ferramentas que você usa.', { etapa: M, ms: 400 });
      await t.mostrar('#lateral a[data-slug]', 2200, { dx: 0.3 });

      const F = '4 · Abrir uma ferramenta';
      await t.legenda('Para achar uma ferramenta, digite parte do nome na <b>busca</b> e tecle <b>Enter</b>.', { etapa: F, ms: 600 });
      await t.digitar('#busca', 'reneg', { atraso: 90, depois: 900 });
      await t.p.keyboard.press('Enter');
      await t.pausa(2800);
      await t.legenda('A ferramenta abre dentro do portal. Na barra de cima: <b>recarregar</b>, abrir em <b>nova aba</b> e <b>fechar</b>.', { etapa: F, ms: 400 });
      await t.mostrar('#btRecarregar', 1300);
      await t.mostrar('a[title="Abrir em nova aba"]', 1300);
      await t.mostrar('#btFecharMod', 1300);
      await t.legenda('Quando aparecer <b>✓ salvo no servidor</b>, o que você lançou já está guardado para a equipe.', { etapa: F, ms: 3400 });
      await t.clicar('#btFecharMod', { depois: 1200 });

      const A = '5 · Avisos';
      await t.legenda('O <b>sino</b> mostra os avisos: ticket novo, resposta, mudança de prazo e outros.', { etapa: A, ms: 700 });
      await t.clicar('#btSino', { depois: 1500 });
      await t.legenda('Ative os <b>alertas do navegador</b> para ser avisado mesmo com o portal em outra aba.', { etapa: A, ms: 400 });
      if (await t.p.locator('#btPermitir').isVisible()) await t.mostrar('#btPermitir', 2600); else await t.pausa(2600);
      await t.p.keyboard.press('Escape'); await t.pausa(500);

      const C = '6 · A sua conta';
      await t.legenda('Em <b>Minha conta</b> você coloca a sua foto e troca a senha.', { etapa: C, ms: 600 });
      await t.clicar('#btConta', { depois: 1300 });
      await t.legenda('Escolha uma foto: ela aparece no menu e nos comentários dos tickets.', { etapa: C, ms: 500 });
      await t.enviarArquivo('label[for=inFoto]', '#inFoto', cen.rec.foto, { depois: 2600 });
      await t.legenda('Para trocar a senha, informe a atual e a nova. As sessões em outros aparelhos são encerradas.', { etapa: C, ms: 500 });
      await t.mostrar('#fSenha', 3200, { dy: 0.3 });
      await t.legenda('Precisa de mais espaço na tela? <b>Recolha o menu</b> por aqui. Para sair, use o botão ao lado do seu nome.', { etapa: C, ms: 300 });
      await t.clicar('#btRecolher', { depois: 1500 });
      await t.clicar('#btRecolher', { depois: 900 });
      await t.mostrar('#btSair', 2600);
    },
    resumo: ['1º acesso: senha temporária → crie a sua', 'Menu e <b>busca</b> para achar as ferramentas', '<b>Sino</b> para os avisos · <b>Minha conta</b> para foto e senha'],
  },

  {
    nome: 'carteira-condominios',
    entrar: 'marcos@myblue.com.br',
    inicio: '#/carteira',
    abertura: ['Quem cuida de cada condomínio, em cada setor.', ['Buscar um condomínio', 'Filtrar por responsável', 'Ver a carteira de cada pessoa']],
    async gravar(t) {
      await t.legenda('A <b>Carteira de condomínios</b> mostra os condomínios da MyBlue e quem é o responsável em cada setor.', { etapa: '1 · A carteira', ms: 600 });
      await t.mostrar('.tiles', 3000, { dx: 0.4 });
      await t.legenda('Busque pelo <b>nome</b>, razão social, <b>CNPJ</b> ou <b>ID</b>.', { etapa: '2 · Buscar', ms: 400 });
      await t.digitar('#cfQ', 'solar', { atraso: 110, depois: 1200 });
      await t.legenda('Clique no condomínio para ver os dados, os responsáveis e o histórico de mudanças.', { etapa: '2 · Buscar', ms: 400 });
      await t.clicar('#tbC tr.clicavel', { depois: 3800 });
      await t.clicar(fecharModal, { depois: 600 });
      await t.clicar('#cfQ', { depois: 150 }); await t.p.locator('#cfQ').fill(''); await t.pausa(700);
      await t.legenda('Filtre por <b>responsável</b>, UF, administradora ou situação.', { etapa: '3 · Filtrar', ms: 500 });
      await t.escolher('#cfPes', { value: 'analista_cobranca|MARCOS LIMA - 4701' }, { depois: 2600 });
      await t.escolher('#cfPes', { value: '' }, { depois: 800 });
      await t.legenda('Na aba <b>Responsáveis</b>: quantos condomínios cada pessoa tem, por função.', { etapa: '4 · Responsáveis', ms: 500 });
      await t.clicar('nav.abas a[href="#/carteira/responsaveis"]', { depois: 2400 });
      await t.legenda('Clique no número para ver a lista de condomínios da pessoa.', { etapa: '4 · Responsáveis', ms: 300 });
      await t.mostrar('[data-ver]', 2600);
      await t.legenda('<b>Exportar CSV</b> baixa a carteira para abrir no Excel.', { etapa: '4 · Responsáveis', ms: 300 });
      await t.mostrar('#btCExportar', 2600);
    },
    resumo: ['Busca por nome, CNPJ ou ID', 'Filtro por responsável, UF, administradora e situação', 'Aba <b>Responsáveis</b>: a carteira de cada pessoa'],
  },

  {
    nome: 'central-de-links',
    entrar: 'marcos@myblue.com.br',
    inicio: '#/links',
    abertura: ['Os links úteis da empresa num lugar só.', null],
    async gravar(t) {
      await t.legenda('A <b>Central de Links</b> reúne os links úteis da empresa, organizados por grupo.', { etapa: 'Central de Links', ms: 3200 });
      await t.legenda('Clique num link para abrir: ele abre numa <b>nova aba</b>, e o portal continua aberto.', { etapa: 'Central de Links', ms: 300 });
      await t.mostrar('.cl-link', 1500);
      await t.mostrar('.cl-link >> nth=2', 1800);
      await t.legenda('O fundo muda a cada <b>campanha</b> do Marketing. Ela vale para todo o portal no mesmo dia.', { etapa: 'Central de Links', ms: 3800 });
      await t.legenda('A Central de Links também fica no menu, logo abaixo do Início.', { etapa: 'Central de Links', ms: 300 });
      await t.mostrar(menu('#/links'), 2600, { dx: 0.3 });
    },
    resumo: ['Menu → <b>Central de Links</b>', 'Os links abrem numa nova aba', 'Quem cuida dela é o Marketing'],
  },

  /* ======================= Central de Tickets ======================= */
  {
    nome: 'ticket-abrir-e-acompanhar',
    inicio: 'login',
    abertura: ['Use a Central de Tickets sempre que precisar de algo de outro setor.',
      ['Entrar no portal', 'Abrir o ticket para o setor certo', 'Acompanhar e conversar com quem atende']],
    async gravar(t) {
      await t.legenda('Entre com o seu <b>e-mail</b> e a sua <b>senha</b>.', { etapa: '1 · Entrar', ms: 1200 });
      await t.digitar('#email', 'sara@myblue.com.br');
      await t.digitar('#senha', 'Nova12345', { atraso: 60 });
      await t.clicar('#btEntrar', { depois: 1800 });

      const E = '2 · Abrir o ticket';
      await t.legenda('Na tela inicial ficam o atalho da Central de Tickets e as ferramentas liberadas para você.', { etapa: E, ms: 3600 });
      await t.legenda('Clique em <b>Novo ticket</b>.', { etapa: E, ms: 900 });
      await t.clicar('#btIniNovoT', { depois: 900 });
      await t.legenda('Em <b>Para qual setor?</b>, escolha quem vai atender. Em <b>Tipo de demanda</b>, o assunto.', { etapa: E, ms: 1500 });
      await t.escolher('#tSetor', 'Cobrança');
      await t.escolher('#tCat', '2ª via de boleto', { depois: 900 });
      await t.legenda('Marque se a demanda é de <b>um condomínio</b> ou <b>interna</b>.', { etapa: E, ms: 1300 });
      await t.clicar('input[name=tOrigem][value=condominio]', { depois: 500 });
      await t.legenda('Digite e escolha o condomínio da lista. O portal já mostra <b>para quem o ticket vai</b>.', { etapa: E, ms: 600 });
      await t.digitar('#tCond', 'Cond. Vila Rica · PE', { atraso: 45, depois: 2600 });
      await t.legenda('Escreva um <b>assunto</b> curto e, na <b>descrição</b>, tudo o que o setor precisa.', { etapa: E, ms: 700 });
      await t.digitar('#tTitulo', '2ª via — apto 51');
      await t.digitar('#tDesc', 'Moradora pediu a 2ª via do boleto de outubro. Vencimento 10/10. Enviar para o e-mail do síndico.', { atraso: 22, depois: 600 });
      await t.legenda('A <b>prioridade</b> veio do tipo de demanda. Logo abaixo aparece o <b>prazo para resposta</b>.', { etapa: E, ms: 900 });
      await t.mostrar('#tPrazo', 2600);
      await t.legenda('Se tiver arquivos, anexe em <b>Anexos</b>. Depois, clique em <b>Abrir ticket</b>.', { etapa: E, ms: 2200 });
      await t.clicar('#btCriarT', { depois: 1800 });

      const A = '3 · Acompanhar';
      await t.legenda('Pronto: o ticket foi aberto e já está com o responsável. Aqui você vê a situação, os prazos e o histórico.', { etapa: A, ms: 4800 });
      await t.legenda('Para conversar com quem está atendendo, escreva a mensagem e clique em <b>Enviar</b>.', { etapa: A, ms: 900 });
      await t.digitar('#cTexto', 'Se possível, enviar ainda hoje. Obrigada!', { atraso: 35 });
      await t.clicar('#btComentar', { depois: 1600 });
      await t.legenda('Todos os seus pedidos ficam em <b>Tickets → Abertos por mim</b>.', { etapa: A, ms: 900 });
      await t.clicar(menu('#/tickets'), { depois: 1300 });
      await t.clicar('nav.abas a[href="#/tickets/fila/abertos"]', { depois: 1400 });
      await t.legenda('Situação, responsável e prazo de cada pedido. Clique num ticket para abrir.', { etapa: A, ms: 4200 });
      await t.legenda('Quando o setor responder ou resolver, você recebe o aviso no <b>sino</b>. Se não ficou resolvido, use <b>Reabrir</b> no ticket.', { etapa: A, ms: 900 });
      await t.mostrar('#btSino', 4200);
    },
    resumo: ['<b>Novo ticket</b> → setor, tipo de demanda e condomínio (ou interna)', 'Assunto curto e descrição completa, com anexos se tiver',
      'Acompanhe em <b>Tickets → Abertos por mim</b> e converse pelo próprio ticket'],
  },

  {
    nome: 'ticket-atender',
    entrar: 'marcos@myblue.com.br',
    inicio: '#/tickets/fila/minha',
    async preparar(cen) {
      await cen.sessao.sara('POST', '/api/tickets', { condominio_id: cen.cond['Cond. Vila Rica'], titulo: 'Acordo da unidade 51', categoria_id: cen.cat['Proposta de acordo'],
        descricao: 'Condômino da unidade 51 quer parcelar os boletos de julho a setembro.\nContato: (11) 90000-0000.', setor_id: cen.S('Cobrança') });
    },
    abertura: ['Do ticket que chegou até a resolução.', ['Minha fila', 'Iniciar o atendimento com prazo', 'Responder e registrar nota interna', 'Aguardando, transferir e resolver']],
    async gravar(t) {
      await t.legenda('Em <b>Tickets → Minha fila</b> ficam os tickets que estão com você, com a situação e o prazo.', { etapa: '1 · Minha fila', ms: 3600 });
      await t.legenda('O número no menu mostra quantos tickets estão na sua fila.', { etapa: '1 · Minha fila', ms: 300 });
      await t.mostrar('#lateral [data-contador=fila]', 2200);
      await t.legenda('Clique no ticket para abrir.', { etapa: '1 · Minha fila', ms: 300 });
      await t.clicar('#tbT tr:has-text("Acordo da unidade 51")', { depois: 1800 });

      const I = '2 · Iniciar';
      await t.legenda('Leia o pedido. Para começar, clique em <b>Iniciar atendimento</b>.', { etapa: I, ms: 2600 });
      await t.clicar('#btIniciar', { depois: 900 });
      await t.legenda('Informe <b>até quando você conclui</b>. Quem abriu o ticket vê essa previsão.', { etapa: I, ms: 500 });
      await t.preencherCampo('#mConc', diaUtil(2) + 'T16:00', { depois: 1200 });
      await t.clicar('#mOkC', { depois: 2000 });

      const R = '3 · Responder';
      await t.legenda('Responda a quem abriu pelo campo de mensagem e clique em <b>Enviar</b>.', { etapa: R, ms: 500 });
      await t.digitar('#cTexto', 'Olá! Vou levantar os valores e te envio a proposta até amanhã.', { atraso: 28 });
      await t.clicar('#btComentar', { depois: 1800 });
      await t.legenda('Marque <b>nota interna</b> para registrar algo que só a equipe do setor vê.', { etapa: R, ms: 500 });
      await t.digitar('#cTexto', 'Conferir se há acordo anterior quebrado antes de propor.', { atraso: 28 });
      await t.clicar('#cInterno', { depois: 500 });
      await t.clicar('#btComentar', { depois: 2000 });

      const S = '4 · Aguardando e transferir';
      await t.legenda('Se depender de alguém de fora (banco, síndico, condômino), mude a situação para <b>Aguardando</b> e salve.', { etapa: S, ms: 700 });
      await t.escolher('#dStatus', { value: 'aguardando' }, { depois: 900 });
      await t.clicar('#btSalvarT', { depois: 2000 });
      await t.legenda('Se o pedido for de outro setor, use <b>Transferir</b>: ele vai para a fila do setor certo, com o motivo.', { etapa: S, ms: 500 });
      await t.clicar('#btTransferir', { depois: 900 });
      await t.escolher('#trSetor', 'Crédito', { depois: 700 });
      await t.digitar('#trMot', 'Precisa da análise do balancete.', { atraso: 30, depois: 800 });
      await t.legenda('Neste exemplo, vamos cancelar e continuar o atendimento.', { etapa: S, ms: 600 });
      await t.clicar(fecharModal, { depois: 800 });

      const F = '5 · Resolver';
      await t.legenda('Terminou? Clique em <b>Marcar como resolvido</b> e conte o que foi feito: quem abriu é avisado.', { etapa: F, ms: 500 });
      await t.clicar('#btResolver', { depois: 800 });
      await t.digitar('#mMotivo', 'Proposta enviada ao condômino: 3 parcelas a partir de 10/11.', { atraso: 26, depois: 600 });
      await t.clicar('#mOkM', { depois: 2400 });
      await t.legenda('O ticket fica como <b>Resolvido</b>. Se o problema continuar, quem abriu pode reabrir.', { etapa: F, ms: 3600 });
    },
    resumo: ['<b>Iniciar atendimento</b> com o prazo para conclusão', 'Mensagem para quem abriu · <b>nota interna</b> para a equipe', '<b>Aguardando</b>, <b>Transferir</b> e <b>Marcar como resolvido</b>'],
  },

  {
    nome: 'ticket-lider',
    entrar: 'lia@myblue.com.br',
    inicio: '#/tickets/fila/setor',
    abertura: ['O líder recebe o que chega para o setor e distribui para a equipe.', ['Fila do setor', 'Escolher o responsável', 'Prioridade e prazos', 'Painel de tickets']],
    async gravar(t) {
      await t.legenda('Como líder, em <b>Fila do setor</b> você vê tudo o que chegou para o setor.', { etapa: '1 · Fila do setor', ms: 3400 });
      await t.legenda('Marque <b>sem responsável</b> para ver o que ainda precisa ser distribuído. Os atrasados aparecem em vermelho.', { etapa: '1 · Fila do setor', ms: 400 });
      await t.clicar('#fTsr', { depois: 2600 });
      await t.clicar('#tbT tr:has-text("Revisar régua")', { depois: 1800 });

      const D = '2 · Distribuir';
      await t.legenda('Escolha o <b>responsável</b> e clique em <b>Salvar alterações</b>. A pessoa recebe o aviso na hora.', { etapa: D, ms: 500 });
      await t.escolher('#dResp', 'Marcos Lima', { depois: 900 });
      await t.legenda('O líder também ajusta a <b>prioridade</b> e o <b>prazo para resposta</b>.', { etapa: D, ms: 300 });
      await t.escolher('#dPrio', { value: 'alta' }, { depois: 1800 });
      await t.mostrar('#dPrazo', 1500);
      await t.clicar('#btSalvarT', { depois: 2200 });

      const P = '3 · Painel';
      await t.legenda('No <b>Painel de tickets</b>: abertos, atrasados, tempo de resposta e o que está com cada pessoa.', { etapa: P, ms: 400 });
      await t.clicar(menu('#/tickets/painel'), { depois: 2600 });
      await t.legenda('Escolha o período para comparar com o mês anterior.', { etapa: P, ms: 300 });
      await t.escolher('#pDias', { value: '7' }, { depois: 2000 });
      await t.rolar(420, '#pCorpo');
      await t.pausa(2400);
    },
    resumo: ['<b>Fila do setor</b> → filtro <b>sem responsável</b>', 'Escolha o responsável e salve', '<b>Painel de tickets</b> para acompanhar a equipe'],
  },

  {
    nome: 'ticket-supervisao',
    entrar: 'sueli@myblue.com.br',
    inicio: '#/tickets/fila/todos',
    abertura: ['Para quem acompanha a empresa toda.', ['Todos os tickets de todos os setores', 'Atrasados e filtros', 'Direcionar um ticket', 'Painel geral']],
    async gravar(t) {
      const T = '1 · Todos os tickets';
      await t.legenda('Com a <b>supervisão da Central de Tickets</b>, a aba <b>Todos</b> mostra os tickets de todos os setores.', { etapa: T, ms: 3600 });
      await t.legenda('Filtre por <b>setor</b>, situação, ou marque <b>só atrasados</b>.', { etapa: T, ms: 400 });
      await t.escolher('#fTse', 'Cobrança', { depois: 1600 });
      await t.clicar('#fTat', { depois: 2200 });
      await t.clicar('#fTat', { depois: 900 });
      await t.clicar('#tbT tr:has-text("Acordo para unidade 104")', { depois: 1800 });
      await t.legenda('Em qualquer ticket você pode trocar o responsável, transferir, mudar a situação, a prioridade e o prazo.', { etapa: '2 · Direcionar', ms: 400 });
      await t.mostrar('#ladoAcoes', 4200, { dy: 0.3 });
      await t.legenda('No <b>Painel de tickets</b>, compare os setores e acompanhe os atrasos.', { etapa: '3 · Painel', ms: 400 });
      await t.clicar(menu('#/tickets/painel'), { depois: 2600 });
      await t.escolher('#pSetor', 'Cobrança', { depois: 2200 });
      await t.rolar(420, '#pCorpo');
      await t.pausa(2400);
    },
    resumo: ['<b>Tickets → Todos</b>: todos os setores', 'Filtros por setor e <b>só atrasados</b>', '<b>Painel de tickets</b> por setor e período'],
  },

  {
    nome: 'links-editar',
    entrar: 'mel@myblue.com.br',
    inicio: '#/links',
    async preparar(cen, base) {
      await cen.admin('POST', '/api/admin/usuarios', { nome: 'Mel Andrade', email: 'mel@myblue.com.br', senha: 'Senha1234', setores: [cen.S('Marketing')], editor_links: true });
      const c = cliente(base);
      await c('POST', '/api/auth/login', { email: 'mel@myblue.com.br', senha: 'Senha1234' });
      await c('POST', '/api/auth/senha', { atual: 'Senha1234', nova: 'Nova12345' });
    },
    abertura: ['Para quem tem a marcação Marketing — Central de Links no cadastro.', ['Cadastrar um link', 'Mudar a ordem', 'Trocar o fundo da campanha']],
    async gravar(t, cen) {
      await t.legenda('Quem edita a Central de Links vê o botão <b>Editar links e fundo</b>.', { etapa: '1 · Editar', ms: 400 });
      await t.clicar('a[href="#/links/gestao"]', { depois: 1800 });
      const L = '2 · Links';
      await t.clicar('nav.abas a[href="#/links/gestao/links"]', { depois: 1500 });
      await t.legenda('<b>Novo link</b>: título, endereço, grupo e ícone.', { etapa: L, ms: 300 });
      await t.clicar('#btNovoLink', { depois: 800 });
      await t.digitar('#lTit', 'Manual do portal');
      await t.digitar('#lUrl', 'https://exemplo.myblue.com.br/manual', { atraso: 22 });
      await t.digitar('#lGrupo', 'Equipe');
      await t.escolher('#lIcone', { value: 'documento' });
      await t.digitar('#lDesc', 'Manuais do Portal MyBlue', { atraso: 26 });
      await t.clicar('#btSalvarLink', { depois: 1800 });
      await t.legenda('Use as <b>setas</b> para mudar a ordem. Links do mesmo grupo aparecem juntos.', { etapa: L, ms: 300 });
      await t.clicar('[data-mover="1"]', { depois: 2000 });
      const C = '3 · Fundo da campanha';
      await t.clicar('nav.abas a[href="#/links/gestao/campanhas"]', { depois: 1500 });
      await t.legenda('Cada campanha entra no ar sozinha na <b>data de início</b> e fica até começar a próxima.', { etapa: C, ms: 3000 });
      await t.legenda('<b>Nova campanha</b>: nome, data e a imagem de fundo (computador e, se quiser, celular).', { etapa: C, ms: 300 });
      await t.clicar('#btNovaCamp', { depois: 800 });
      await t.digitar('#cNome', 'Campanha de novembro');
      await t.preencherCampo('#cInicio', diaUtil(20));
      await t.enviarArquivo('#z-fundo', '#z-fundo input[type=file]', cen.rec.fundo, { depois: 1800 });
      await t.legenda('<b>Escurecer</b> deixa os botões legíveis sobre a imagem. Depois, <b>Criar campanha</b>.', { etapa: C, ms: 2400 });
      await t.clicar('#btSalvarCamp', { depois: 2400 });
      await t.legenda('A campanha fica <b>agendada</b>. Use <b>Ver</b> para conferir como a página vai ficar.', { etapa: C, ms: 300 });
      await t.clicar('a[href^="#/links/previa/"]', { depois: 3600 });
    },
    resumo: ['<b>Editar links e fundo</b> → aba <b>Links</b>', 'Setas para mudar a ordem', 'Aba <b>Fundo da campanha</b>: agenda o fundo de cada mês'],
  },

  /* ======================= Gestão do setor ======================= */
  {
    nome: 'gestao-usuarios',
    entrar: 'caio@myblue.com.br',
    inicio: '#/admin/usuarios',
    abertura: ['Para coordenadores e supervisores.', ['Criar o acesso de alguém do setor', 'Liberar ferramentas', 'Redefinir a senha']],
    async gravar(t) {
      await t.legenda('Em <b>Gestão do setor → Usuários do setor</b> ficam as pessoas do seu setor.', { etapa: '1 · Usuários do setor', ms: 3400 });
      const N = '2 · Novo usuário';
      await t.legenda('Clique em <b>Novo usuário</b> e preencha o nome e o e-mail, que é o login.', { etapa: N, ms: 300 });
      await t.clicar('#btNovoUsu', { depois: 800 });
      await t.digitar('#uNome', 'Rita Campos');
      await t.digitar('#uEmail', 'rita@myblue.com.br');
      await t.legenda('O <b>setor</b> já vem marcado: a pessoa entra na equipe do setor na Central de Tickets.', { etapa: N, ms: 300 });
      await t.mostrar('input[name=uSetor]', 2600);
      await t.legenda('Marque as <b>ferramentas</b> do setor que a pessoa vai usar.', { etapa: N, ms: 300 });
      await t.clicar('input[name=uMod][value=credito]', { depois: 500 });
      await t.clicar('input[name=uMod][value=boletos]', { depois: 700 });
      await t.legenda('Deixe a senha em branco: o portal gera uma <b>temporária</b>. Clique em <b>Criar usuário</b>.', { etapa: N, ms: 1600 });
      await t.clicar('#btSalvarU', { depois: 1500 });
      await t.legenda('Copie os dados e envie para a pessoa. No 1º acesso ela cria a senha dela.', { etapa: N, ms: 300 });
      await t.mostrar('#btCopiar', 3000);
      await t.clicar(fecharModal, { depois: 1200 });
      const E = '3 · Editar';
      await t.legenda('Para liberar outra ferramenta ou redefinir a senha, clique na pessoa.', { etapa: E, ms: 300 });
      await t.clicar('#tbUsu tr:has-text("Davi Rocha")', { depois: 1000 });
      await t.clicar('input[name=uMod][value=sindicos]', { depois: 800 });
      await t.legenda('<b>Redefinir senha</b> gera uma senha temporária nova. Para bloquear o acesso, desmarque <b>Usuário ativo</b>.', { etapa: E, ms: 400 });
      await t.mostrar('#btResetSenha', 2000);
      await t.mostrar('#uAtivo', 2000);
      await t.clicar('#btSalvarU', { depois: 2000 });
    },
    resumo: ['<b>Novo usuário</b>: nome, e-mail e ferramentas', 'Envie a senha temporária para a pessoa', 'Clique na pessoa para liberar ferramentas ou redefinir a senha'],
  },

  {
    nome: 'gestao-ferramentas',
    entrar: 'caio@myblue.com.br',
    inicio: '#/admin/modulos',
    abertura: ['Para coordenadores e supervisores.', ['Enviar o HTML novo de uma ferramenta', 'Voltar para uma versão anterior', 'Escolher quem pode abrir']],
    async gravar(t, cen) {
      await t.legenda('Em <b>Ferramentas do setor</b> ficam as ferramentas dos seus setores. Clique numa delas.', { etapa: '1 · Ferramentas do setor', ms: 2600 });
      await t.clicar('tr[data-slug="boletos"]', { depois: 1200 });
      const H = '2 · Atualizar o HTML';
      await t.legenda('A ferramenta mudou? Envie o <b>arquivo .html novo</b> aqui. Quem abrir já recebe a versão nova.', { etapa: H, ms: 600 });
      await t.enviarArquivo('#zArq', '#inArq', cen.rec.html, { depois: 2600 });
      await t.legenda('A versão anterior fica guardada. Em <b>Versões anteriores</b>, <b>Usar esta</b> volta para ela.', { etapa: H, ms: 300 });
      await t.clicar('summary:has-text("Versões anteriores")', { depois: 1200 });
      await t.mostrar('[data-versao]', 2600);
      const Q = '3 · Quem pode abrir';
      await t.legenda('Em <b>Quem pode abrir</b>, marque as pessoas do setor que usam a ferramenta e salve.', { etapa: Q, ms: 300 });
      await t.clicar('.fundo-modal label:has-text("Davi Rocha") input', { depois: 700 });
      await t.clicar('#btSalvarAcesso', { depois: 2000 });
      await t.legenda('Coordenador e supervisor já abrem todas as ferramentas do setor.', { etapa: Q, ms: 3000 });
    },
    resumo: ['<b>Ferramentas do setor</b> → clique na ferramenta', 'Envie o HTML novo · <b>Versões anteriores</b> para voltar', '<b>Quem pode abrir</b>: marque e salve'],
  },

  {
    nome: 'gestao-equipe',
    entrar: 'caio@myblue.com.br',
    inicio: '#/admin/equipes',
    abertura: ['Para coordenadores e supervisores.', ['Quem é líder do setor', 'Os tipos de demanda, com prazo e prioridade']],
    async gravar(t, cen) {
      await t.legenda('Em <b>Equipe e tipos de demanda</b>, clique no seu setor.', { etapa: '1 · Equipe', ms: 2200 });
      await t.clicar('[data-setor]', { depois: 1200 });
      await t.legenda('A equipe vem do cadastro das pessoas. Marque quem é <b>líder</b>: o líder distribui os tickets do setor.', { etapa: '1 · Equipe', ms: 500 });
      await t.clicar(`input[name=eLider][value="${cen.id['bruna@myblue.com.br']}"]`, { depois: 900 });
      await t.clicar('#btSalvarEquipe', { depois: 1800 });
      const T = '2 · Tipos de demanda';
      await t.clicar('[data-setor]', { depois: 1200 });
      await t.legenda('Os <b>tipos de demanda</b> organizam a fila: cada um tem o prazo em <b>horas úteis</b> e a prioridade.', { etapa: T, ms: 600 });
      await t.digitar('#nCat', '2ª via de prestação de contas');
      await t.digitar('#nPrazo', '9');
      await t.escolher('#nPrio', { value: 'alta' });
      await t.clicar('#btAddCat', { depois: 2200 });
      await t.legenda('9 horas úteis = 1 dia útil. Para mudar um tipo, edite e clique em <b>Salvar tipos</b>.', { etapa: T, ms: 400 });
      await t.mostrar('#btSalvarCats', 2400);
      await t.legenda('Desmarque <b>ativo</b> para tirar um tipo da lista sem perder o histórico dos tickets.', { etapa: T, ms: 400 });
      await t.mostrar('[data-campo=ativo]', 2800);
      await t.clicar(fecharModal, { depois: 800 });
    },
    resumo: ['Clique no setor → marque os <b>líderes</b> e salve', 'Tipos de demanda: nome, prazo (horas úteis) e prioridade', 'Desative em vez de apagar'],
  },

  {
    nome: 'gestao-carteira',
    entrar: 'lia@myblue.com.br',
    inicio: '#/carteira',
    abertura: ['Para coordenadores e supervisores.', ['Trocar o responsável de um condomínio', 'Transferir a carteira de uma pessoa']],
    async gravar(t) {
      const C = '1 · Um condomínio';
      await t.legenda('Coordenador e supervisor trocam o responsável <b>do setor deles</b> na carteira. Clique no condomínio.', { etapa: C, ms: 300 });
      await t.clicar('#tbC tr:has-text("Ed. Aurora")', { depois: 1200 });
      await t.legenda('Só o campo do seu setor fica liberado. Escolha a pessoa (NOME - RAMAL) e salve.', { etapa: C, ms: 300 });
      await t.digitar('#cd_analista_cobranca', 'MARCOS LIMA - 4701', { atraso: 40 });
      await t.clicar('#btCdOk', { depois: 2000 });
      const T = '2 · Transferir';
      await t.legenda('Quando alguém sai ou a carteira é redistribuída, use <b>Transferir</b> na aba <b>Responsáveis</b>.', { etapa: T, ms: 300 });
      await t.clicar('nav.abas a[href="#/carteira/responsaveis"]', { depois: 1600 });
      await t.clicar('[data-transferir^="analista_cobranca|MARCOS"]', { depois: 1000 });
      await t.digitar('#trPara', 'ANA COSTA - 4702', { atraso: 40 });
      await t.legenda('Desmarque os condomínios que continuam com a pessoa e clique em <b>Transferir</b>.', { etapa: T, ms: 300 });
      await t.clicar('input[name=trC] >> nth=0', { depois: 500 });
      await t.clicar('input[name=trC] >> nth=1', { depois: 700 });
      await t.clicar('#btTrOk', { depois: 2400 });
      await t.legenda('Cada mudança fica no <b>histórico</b> do condomínio.', { etapa: T, ms: 2800 });
    },
    resumo: ['Clique no condomínio → troque o responsável do seu setor', 'Aba <b>Responsáveis</b> → <b>Transferir</b> a carteira', 'Tudo fica no histórico'],
  },

  /* ======================= Administração ======================= */
  {
    nome: 'admin-usuarios',
    entrar: 'admin@myblue.com.br',
    inicio: '#/admin/usuarios',
    abertura: ['Só para a administração.', ['Perfis: usuário, supervisor, coordenador, administrador', 'O setor no cadastro', 'Marcações de supervisão e da Central de Links']],
    async gravar(t) {
      await t.legenda('Em <b>Usuários e acessos</b> ficam todas as pessoas do portal: perfil, setor e ferramentas.', { etapa: '1 · Usuários', ms: 3200 });
      const N = '2 · Novo usuário';
      await t.clicar('#btNovoUsu', { depois: 800 });
      await t.digitar('#uNome', 'Otávio Neves');
      await t.digitar('#uEmail', 'otavio@myblue.com.br');
      await t.legenda('Escolha o <b>perfil</b>. Coordenador e supervisor gerenciam os setores marcados no cadastro.', { etapa: N, ms: 600 });
      await t.clicar('input[name=uPapel][value=coordenador]', { depois: 1400 });
      await t.legenda('Marque o <b>setor</b>: ele forma a equipe do setor na Central de Tickets.', { etapa: N, ms: 300 });
      await t.clicar('.fundo-modal label:has-text("Jurídico") input[name=uSetor]', { depois: 1200 });
      await t.legenda('Marcações extras: <b>supervisão da Central de Tickets</b> (todos os setores) e <b>Marketing — Central de Links</b>.', { etapa: N, ms: 300 });
      await t.mostrar('#uSup', 1800, { dx: 0.05 });
      await t.mostrar('#uLinks', 1800, { dx: 0.05 });
      await t.clicar('#btSalvarU', { depois: 1500 });
      await t.legenda('Envie a senha temporária para a pessoa por um canal seguro.', { etapa: N, ms: 2200 });
      await t.clicar(fecharModal, { depois: 1000 });
      await t.legenda('O perfil e as marcações aparecem na lista. Clique na pessoa para mudar.', { etapa: '3 · Editar', ms: 300 });
      await t.clicar('#tbUsu tr:has-text("Sueli Prado")', { depois: 1000 });
      await t.mostrar('#uSup', 2600, { dx: 0.05 });
      await t.clicar(fecharModal, { depois: 800 });
    },
    resumo: ['Perfil + <b>setor</b> no cadastro definem o que a pessoa gerencia', 'Supervisão de tickets e Central de Links são marcações', 'Ferramentas liberadas por pessoa'],
  },

  {
    nome: 'admin-modulos',
    entrar: 'admin@myblue.com.br',
    inicio: '#/admin/modulos',
    abertura: ['Só para a administração.', ['Cadastrar uma ferramenta nova', 'Enviar o HTML', 'Setores, envio em lote e backup']],
    async gravar(t, cen) {
      await t.legenda('Em <b>Módulos e dados</b> ficam todas as ferramentas: setor, arquivo e onde os dados ficam.', { etapa: '1 · Módulos', ms: 3400 });
      const N = '2 · Nova ferramenta';
      await t.legenda('<b>Novo módulo</b> cadastra uma ferramenta nova: nome, setor e ícone.', { etapa: N, ms: 300 });
      await t.clicar('#btNovoMod', { depois: 800 });
      await t.digitar('#nNome', 'Controle de Contratos');
      await t.escolher('#nSetor', 'Jurídico');
      await t.escolher('#nIcone', { value: 'documento' });
      await t.digitar('#nDesc', 'Contratos e vencimentos do Jurídico.', { atraso: 26 });
      await t.clicar('#btCriarMod', { depois: 2200 });
      await t.legenda('Depois de criar, envie o <b>arquivo .html</b> da ferramenta.', { etapa: N, ms: 300 });
      await t.enviarArquivo('#zArq', '#inArq', cen.rec.html, { depois: 2600 });
      await t.legenda('Na mesma janela: onde os dados ficam, quem pode abrir e as versões anteriores.', { etapa: N, ms: 300 });
      await t.rolar(700, '.fundo-modal .modal-corpo');
      await t.pausa(1800);
      await t.clicar('.fundo-modal .modal-cab [data-fechar]', { depois: 1200 });
      const O = '3 · Outras ações';
      await t.legenda('<b>Setores</b> cria e renomeia setores. <b>Enviar vários HTMLs</b> publica cada arquivo no módulo certo.', { etapa: O, ms: 300 });
      await t.mostrar('#btSetores', 1800);
      await t.mostrar('#btLote', 1800);
      await t.legenda('<b>Backup do banco</b> baixa uma cópia de tudo. Faça com frequência.', { etapa: O, ms: 300 });
      await t.mostrar('#btBackup', 2600);
    },
    resumo: ['<b>Novo módulo</b> → envie o HTML', 'Clique no módulo para setor, dados, acesso e versões', '<b>Backup do banco</b> com frequência'],
  },
];

// ferramentas (cada uma precisa do HTML dela em FERRAMENTAS)
module.exports.push(...require('./roteiros-ferramentas'));

'use strict';
/*
 * Tutorial da Biblioteca de HSM — Crédito e Implantação. Mesma base da biblioteca da Cobrança (claude.use('db')),
 * com o que é próprio dela: abas Crédito e Implantação, filtros por destinatário e canal, "Mais usadas no mês",
 * instruções de envio (Para, Assunto, anexos) e a prévia do WhatsApp ao cadastrar.
 * As mensagens reais embutidas no HTML (base inicial, com nomes e e-mails) são trocadas por fictícias só na cópia
 * da gravação, e o banco já começa com essas mesmas mensagens (tudo inventado).
 */
const SLUG = 'biblioteca-de-hsm-credito-implantacao';
const PFX = 'msg_cred_';
const PAPEL = 'gestao_credito';
const quadro = (t) => t.p.frameLocator(`iframe[data-slug="${SLUG}"]`);

/* ---------- mensagens fictícias ---------- */
// tipo 'biblioteca' = aba Crédito; 'sistema' = aba Implantação. sub = canal; publico = para quem; obs = instruções de envio
const M = (tipo, id, categoria, titulo, texto, x = {}) => ({ id, titulo, categoria, tags: x.tags || [], texto, tipo,
  ...(x.canal ? { sub: x.canal } : {}), ...(x.para ? { publico: x.para } : {}), ...(x.obs ? { obs: x.obs } : {}), ...(x.ordem ? { ordem: x.ordem } : {}) });
const C = (...a) => M('biblioteca', ...a);
const I = (...a) => M('sistema', ...a);
const MENSAGENS = [
  C('msg-f1', 'Emissão dos boletos', 'Cobrar o envio do balancete', 'Bom dia/Boa tarde, pessoal! Tudo bem?\n\nPara emitirmos os boletos de [MÊS/ANO] dentro do prazo, precisamos do balancete do condomínio até [DATA].\n\nPodem nos enviar por aqui? Obrigada! 💙', { canal: 'Grupo', para: 'Síndico', tags: ['Balancete', 'Pendência'] }),
  C('msg-f2', 'Emissão dos boletos', 'Enviar o boleto demonstrativo para aprovação', 'Bom dia/Boa tarde, Sr(a). [NOME DO SÍNDICO(A)]!\n\nSegue o boleto demonstrativo de [MÊS/ANO] do [NOME DO CONDOMÍNIO] para conferência.\n\nSe estiver tudo certo, é só responder com *aprovado* até [DATA].', { canal: 'Grupo', para: 'Síndico', tags: ['Demonstrativo', 'Aprovação'], obs: 'Emitir e anexar o boleto demonstrativo.' }),
  C('msg-f3', 'Emissão dos boletos', 'Perguntar se a composição mudou', 'Bom dia, pessoal! Para os boletos de [MÊS/ANO], houve alguma mudança na composição (taxa extra, fundo de reserva, consumo)? Se não houver, seguimos com os mesmos valores do mês passado.', { canal: 'Grupo', para: 'Síndico', tags: ['Composição'] }),
  C('msg-f4', 'Comunicados aos condôminos', 'Avisar que os boletos já estão no aplicativo', 'Olá! 💙 Os boletos de [MÊS/ANO] já estão disponíveis no aplicativo e no site da MyBlue. O vencimento é dia [DIA].', { para: 'Condômino', tags: ['Comunicado', 'Boletos'] }),
  C('msg-f5', 'Repasses e contas', 'Enviar a prestação de contas', 'Prezados, bom dia!\n\nSegue a prestação de contas de [MÊS/ANO] do [NOME DO CONDOMÍNIO], com o valor repassado e o relatório de garantia.\n\nFicamos à disposição para qualquer dúvida.', { canal: 'E-mail', para: 'Síndico', tags: ['Prestação de contas', 'Repasse'],
    obs: 'Para: [E-MAIL DO SÍNDICO(A)]\nCc: [E-MAIL DA ADMINISTRADORA]\nAssunto: Prestação de contas – [NOME DO CONDOMÍNIO] – [MÊS/ANO]\nAnexar o relatório de garantia.' }),
  C('msg-f6', 'Repasses e contas', 'Informar o dia do repasse', 'Bom dia, Sr(a). [NOME DO SÍNDICO(A)]! O repasse de [MÊS/ANO] será feito no dia [DATA], na conta cadastrada do condomínio.', { canal: 'Privado', para: 'Síndico', tags: ['Repasse'] }),
  C('msg-f7', 'Repasses e contas', 'Pedir a troca da conta bancária', 'Olá, equipe! O [NOME DO CONDOMÍNIO] pediu a troca da conta de repasse. Seguem os dados novos e a ata que autoriza a mudança.', { canal: 'E-mail', para: 'Interno', tags: ['Conta bancária'],
    obs: 'Para: [E-MAIL DA SUPERVISÃO DE CRÉDITO]\nAssunto: Troca de conta – [NOME DO CONDOMÍNIO]\nAnexar a ata e o comprovante da conta.' }),
  C('msg-f8', 'Dúvidas de condôminos', 'Explicar o pagamento no cartão', 'O boleto pode ser pago no cartão de crédito pelo aplicativo da MyBlue, em até [PARCELAS] vezes. É só abrir o boleto e escolher *Pagar com cartão*.', { para: 'Condômino', tags: ['Cartão', 'Pagamento'] }),
  C('msg-f9', 'Dúvidas de condôminos', 'Explicar que o vencimento é igual para todos', 'A data de vencimento é definida em assembleia e vale para todas as unidades, por isso não é possível mudar só para uma unidade.', { para: 'Condômino', tags: ['Vencimento'] }),
  C('msg-f10', 'Titularidade e espólios', 'Explicar a troca de titular', 'A troca de titular da unidade é feita com a matrícula atualizada do imóvel. Assim que recebermos, atualizamos o cadastro em até [PRAZO] dias úteis.', { para: 'Condômino', tags: ['Titularidade', 'Matrícula'] }),
  C('msg-f11', 'Acesso ao site e aplicativo', 'Enviar o acesso ao condômino', 'Seu acesso à Área do Condômino:\n\nUsuário: [CPF DO PROPRIETÁRIO]\nSenha: [SENHA PROVISÓRIA]\n\nNo primeiro acesso, o sistema pede para trocar a senha. 🔐', { canal: 'Privado', para: 'Condômino', tags: ['Acesso', 'Aplicativo'] }),
  C('msg-f12', 'Relacionamento', 'Apresentar a assistente ao condomínio', 'Bom dia/Boa tarde a todos!\n\nMe chamo [SEU NOME] e sou a assistente de crédito responsável pelo [NOME DO CONDOMÍNIO]. A partir de agora, atendo o síndico e a administradora por este número. 💙', { canal: 'Grupo', para: 'Síndico', tags: ['Apresentação'] }),
  C('msg-f13', 'Relacionamento', 'Parabenizar o síndico pelo aniversário', 'Parabéns, Sr(a). [NOME DO SÍNDICO(A)]! 🎉\n\nA MyBlue deseja um novo ano com muita saúde e sucesso na gestão. Conte sempre conosco! 💙', { canal: 'Privado', para: 'Síndico', tags: ['Aniversário'], obs: 'Anexar a imagem padrão de aniversário.' }),
  C('msg-f14', 'Assinaturas e patrocínios', 'Enviar o recibo de patrocínio', 'Bom dia/Boa tarde!\n\nSegue o recibo de patrocínio do [NOME DO CONDOMÍNIO] para assinatura do(a) síndico(a). Depois da assinatura, o valor é pago em até [PRAZO] dias.', { para: 'Síndico', tags: ['Patrocínio', 'Recibo'], obs: 'Anexar o recibo de patrocínio.' }),
  C('msg-f15', 'Sobre a MyBlue', 'Explicar o que é a MyBlue', 'A MyBlue emite os boletos do condomínio, antecipa a arrecadação todo mês e cuida da cobrança das unidades em atraso. Assim o condomínio recebe em dia.', { tags: ['Institucional'] }),
  I('msg-i1', '1. Boas-vindas', 'Dar boas-vindas ao novo condomínio', 'Bom dia/Boa tarde, pessoal! Seja bem-vindo à MyBlue, [NOME DO CONDOMÍNIO]! 💙\n\nEste grupo é o nosso canal com o síndico e a administradora durante a implantação.', { canal: 'Grupo', para: 'Síndico', ordem: 1, tags: ['Boas-vindas'] }),
  I('msg-i2', '2. Reunião de onboarding', 'Marcar a reunião de onboarding', 'Gostaríamos de marcar uma reunião rápida, on-line, para apresentar como funciona a implantação. O dia [DATA] às [HORÁRIO] fica bom para vocês?', { canal: 'Grupo', para: 'Síndico', ordem: 1, tags: ['Onboarding', 'Reunião'] }),
  I('msg-i3', '3. Documentação', 'Pedir os documentos pendentes', 'Para seguir com a implantação, ainda faltam:\n\n• [DOCUMENTO]\n• [DOCUMENTO]\n\nPodem enviar por aqui até [DATA]?', { canal: 'Grupo', para: 'Síndico', ordem: 1, tags: ['Documentação', 'Pendência'], obs: 'Liste só o que falta (ex.: ata de eleição, cartão CNPJ, cadastro dos condôminos).' }),
  I('msg-i4', '3. Documentação', 'Enviar a procuração para assinatura', 'Segue a procuração para assinatura do(a) síndico(a). Pode ser assinada pelo GOV.BR ou com certificado digital.', { canal: 'Grupo', para: 'Síndico', ordem: 2, tags: ['Procuração'], obs: 'Anexar o arquivo da procuração.' }),
  I('msg-i5', '4. Comunicados', 'Avisar sobre o comunicado de contratação', 'Bom dia, pessoal! Enviamos aos condôminos o comunicado de contratação da MyBlue, com as orientações sobre os novos boletos.', { canal: 'Grupo', para: 'Síndico', ordem: 1, tags: ['Comunicado'] }),
  I('msg-i6', '5. Primeiro boleto', 'Enviar o primeiro boleto demonstrativo', 'Segue o demonstrativo do primeiro boleto do [NOME DO CONDOMÍNIO]. Confiram os valores e respondam com *aprovado* para liberarmos a emissão.', { canal: 'Grupo', para: 'Síndico', ordem: 1, tags: ['Demonstrativo'], obs: 'Anexar o boleto demonstrativo.' }),
  I('msg-i7', '6. Acesso ao app e site', 'Enviar o tutorial do aplicativo', 'Olá, pessoal! Na Área do Condômino (site e aplicativo) dá para ver os boletos e os comunicados do condomínio. Segue o passo a passo do primeiro acesso: [LINK DO TUTORIAL]', { canal: 'Grupo', para: 'Condômino', ordem: 1, tags: ['Aplicativo', 'Tutorial'] }),
  I('msg-i8', '7. Casos especiais', 'Enviar os boletos à construtora', 'Prezados, seguem os boletos das unidades ainda sob responsabilidade da construtora, referentes a [MÊS/ANO].', { canal: 'E-mail', ordem: 1, tags: ['Construtora'], obs: 'Para: [E-MAIL DA CONSTRUTORA]\nCc: [E-MAIL DO CONDOMÍNIO]\nAssunto: Boletos [MÊS/ANO] – [NOME DO CONDOMÍNIO]' }),
];

const quando = (agora, dias) => new Date(agora.getTime() - dias * 864e5).toISOString();
const mes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

function documentos(ids, agora = new Date()) {
  const docs = {};
  MENSAGENS.forEach((h, i) => {
    const t = quando(agora, 80 - i);
    docs[`${PFX}mensagens/${h.id}`] = { ...h, arquivada: false, criadoEm: t, criadoPor: 'Base inicial', atualizadoEm: t, atualizadoPor: 'Base inicial' };
  });
  docs[`${PFX}config/geral`] = { semeado: true, versao: 2, em: quando(agora, 80), por: 'Caio Mendes' };

  // sugestões das assistentes (fictícias): uma pendente de ajuste e uma nova
  const f1 = MENSAGENS[0];
  docs[`${PFX}sugestoes/${ids.bruna}`] = { autorId: String(ids.bruna), autorNome: 'Bruna Reis', itens: {
    'sug-c1': { tipo: 'ajuste', onde: 'biblioteca', hsmId: f1.id, hsmTituloOriginal: f1.titulo, textoOriginal: f1.texto, versaoOriginal: docs[`${PFX}mensagens/${f1.id}`].atualizadoEm,
      titulo: f1.titulo, categoria: f1.categoria, sub: f1.sub, publico: f1.publico, tags: f1.tags, obs: '',
      texto: f1.texto.replace('Podem nos enviar por aqui?', 'Podem nos enviar por aqui ou pelo e-mail [E-MAIL DA ASSISTENTE]?'),
      motivo: 'Algumas administradoras só mandam o balancete por e-mail.', criadoEm: quando(agora, 2) },
  } };
  docs[`${PFX}sugestoes/${ids.davi}`] = { autorId: String(ids.davi), autorNome: 'Davi Rocha', itens: {
    'sug-c2': { tipo: 'nova', onde: 'biblioteca', hsmId: null, titulo: 'Lembrar o vencimento dos boletos', categoria: 'Comunicados aos condôminos', sub: 'Grupo', publico: 'Condômino', tags: ['Lembrete', 'Vencimento'], obs: '',
      texto: 'Bom dia, pessoal! Passando para lembrar que os boletos de [MÊS/ANO] vencem em [DATA] e já estão no aplicativo. 💙', motivo: 'Cada um escreve esse lembrete de um jeito.', criadoEm: quando(agora, 1) },
  } };

  // cópias no mês (alimenta "Mais usadas no mês" e as Configurações)
  const anterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 15);
  const uso = (d, uid, nome, c) => { docs[`${PFX}uso/${mes(d)}_${uid}`] = { mes: mes(d), uid: String(uid), nome, c }; };
  uso(agora, ids.bruna, 'Bruna Reis', { 'msg-f1': 11, 'msg-f2': 8, 'msg-f5': 6, 'msg-f4': 3, 'msg-i3': 2 });
  uso(agora, ids.davi, 'Davi Rocha', { 'msg-f1': 6, 'msg-f5': 5, 'msg-f8': 4, 'msg-i1': 2, 'msg-i6': 3 });
  uso(anterior, ids.bruna, 'Bruna Reis', { 'msg-f1': 9, 'msg-f2': 7, 'msg-f6': 2 });
  return docs;
}

/* a base inicial embutida no HTML (mensagens reais, com nomes e e-mails) vira a lista fictícia, só na cópia da gravação */
function adaptarHtml(html) {
  const ini = html.indexOf('var SEED = [');
  const fim = html.indexOf('\n];', ini);
  if (ini < 0 || fim < 0) throw new Error('não achei a base inicial (SEED) no HTML');
  return html.slice(0, ini) + 'var SEED = ' + JSON.stringify(MENSAGENS, null, 1) + ';' + html.slice(fim + 3);
}

module.exports = {
  nome: 'ferramenta-hsm-credito',
  ferramenta: SLUG,
  entrar: 'caio@myblue.com.br',
  inicio: '#/m/' + SLUG,
  adaptarHtml,
  async preparar(cen) {
    const ids = { caio: cen.id['caio@myblue.com.br'], bruna: cen.id['bruna@myblue.com.br'], davi: cen.id['davi@myblue.com.br'] };
    await cen.admin('PUT', `/api/admin/modulos/${SLUG}/papeis`, { papeis: [{ id: PAPEL, nome: 'Gestão', descricao: 'Cadastra, edita, arquiva e aprova sugestões' }] });
    await cen.admin('PUT', `/api/admin/modulos/${SLUG}/acesso`, { acessos: [{ usuario_id: ids.caio, papeis: [PAPEL] }, { usuario_id: ids.bruna, papeis: [] }, { usuario_id: ids.davi, papeis: [] }] });
    const r = await cen.admin('POST', `/api/admin/modulos/${SLUG}/documentos`, { modulo: SLUG, documentos: documentos(ids) });
    if (!r || !r.total) throw new Error('não gravou as mensagens de exemplo: ' + JSON.stringify(r));
  },
  abertura: ['As mensagens padrão para síndicos, condôminos e parceiros, separadas em Crédito e Implantação.', ['Filtrar por categoria, destinatário e canal', 'Instruções de envio e copiar', 'As etapas da Implantação', 'Cadastrar com a prévia do WhatsApp', 'Revisar as sugestões da equipe']],
  async gravar(t) {
    const f = quadro(t);
    await f.locator('#sync.on').waitFor({ timeout: 20000 });

    const A = '1 · Crédito';
    await t.legenda('A aba <b>Crédito</b> abre com as <b>mais usadas no mês</b> pela equipe, para copiar direto.', { etapa: A, ms: 600 });
    await t.mostrar(f.locator('#maisUsadas'), 2600);
    await t.legenda('Filtre pela <b>categoria</b>, por <b>para quem</b> é a mensagem (síndico, condômino, equipe interna) e pelo <b>canal</b>.', { etapa: A, ms: 300 });
    await t.clicar(f.locator('#categoryChips [data-cat="Repasses e contas"]'), { depois: 1400 });
    await t.clicar(f.locator('#segPub [data-pub="Síndico"]'), { depois: 1200 });
    await t.clicar(f.locator('#segCanal [data-canal="E-mail"]'), { depois: 1600 });
    await t.legenda('Abra a mensagem: em amarelo, as <b>instruções de envio</b> (para quem, assunto, anexos). Elas não entram no texto copiado.', { etapa: A, ms: 300 });
    await t.clicar(f.locator('[data-toggle="msg-f5"]'), { depois: 1200 });
    await t.rolar(220);
    await t.pausa(2800);
    await t.legenda('<b>Copiar</b> leva só o texto. Troque o que está <b>[entre colchetes]</b> antes de enviar.', { etapa: A, ms: 300 });
    await t.clicar(f.locator('#grid [data-copy="msg-f5"]'), { depois: 2600 });
    await t.rolar(-300);

    const I = '2 · Implantação';
    await t.legenda('A aba <b>Implantação</b> segue as etapas do condomínio novo: boas-vindas, onboarding, documentação, comunicados, primeiro boleto e acesso ao app.', { etapa: I, ms: 300 });
    await t.clicar(f.locator('[data-view="sistema"]'), { depois: 3600 });
    await t.clicar(f.locator('#catsSis [data-cat-sis="3. Documentação"]'), { depois: 1400 });
    await t.clicar(f.locator('[data-toggle="msg-i3"]'), { depois: 1000 });
    await t.rolar(240);
    await t.pausa(2200);

    const N = '3 · Nova mensagem';
    await t.legenda('A gestão cadastra pelo botão <b>Nova mensagem</b>: já vem com o setor e a categoria da tela.', { etapa: N, ms: 300 });
    await t.clicar(f.locator('#novaTopo'), { depois: 1000 });
    await t.mostrar(f.locator('#fTipo'), 1200);
    await t.digitar(f.locator('#fTitulo'), 'Confirmar o recebimento dos documentos', { atraso: 34 });
    await t.legenda('Enquanto você digita, a <b>prévia</b> mostra como vai aparecer no WhatsApp, com os colchetes destacados.', { etapa: N, ms: 300 });
    await t.digitar(f.locator('#fTexto'), 'Recebemos os documentos do [NOME DO CONDOMÍNIO], obrigada! Seguimos com a implantação. 💙', { atraso: 26, depois: 600 });
    await t.mostrar(f.locator('#mPrevBox'), 2000);
    await t.legenda('Em <b>Instruções de envio</b>, o que a pessoa precisa saber antes de mandar (destinatários, assunto, anexos).', { etapa: N, ms: 300 });
    await t.digitar(f.locator('#fObs'), 'Enviar no grupo do condomínio.', { atraso: 34, depois: 800 });
    await t.clicar(f.locator('[data-m="salvar"]'), { depois: 2200 });

    const S = '4 · Sugestões';
    await t.legenda('As assistentes sugerem ajustes e mensagens novas. Em <b>Sugestões</b>, <b>Revisar</b> compara o texto atual com o sugerido.', { etapa: S, ms: 300 });
    await t.clicar(f.locator('#tabSug'), { depois: 2400 });
    await t.clicar(f.locator('[data-revisar="sug-c1"]'), { depois: 3800 });
    await t.legenda('<b>Aprovar e publicar</b> troca o texto na hora, para todos. <b>Configurações</b> tem o arquivo, as cópias por mês e o Excel/PDF.', { etapa: S, ms: 300 });
    await t.clicar(f.locator('[data-m="aprovar"]'), { depois: 2600 });
    await t.clicar(f.locator('[data-view="config"]'), { depois: 3200 });
  },
  resumo: ['Filtre por <b>categoria</b>, <b>para quem</b> e <b>canal</b> → leia as instruções → <b>Copiar</b>', '<b>Crédito</b> e <b>Implantação</b> (pelas etapas do condomínio novo)', 'Gestão: <b>Nova mensagem</b> com prévia, <b>Sugestões</b> e Configurações'],
};

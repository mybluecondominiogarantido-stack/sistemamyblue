'use strict';
/*
 * Tutorial da Biblioteca de HSM Operacional: a biblioteca única da Cobrança, do Crédito e da Implantação
 * (claude.use('db'), coleções hsm_*). Cada mensagem tem o setor ('cobranca' ou 'credito') e o tipo
 * ('biblioteca' ou 'sistema'): Cobrança, Templates do sistema, Crédito e Implantação. Cada setor tem a sua gestão
 * (papéis gestao_cobranca e gestao_credito, dados no portal).
 * As mensagens reais embutidas no HTML (base inicial) são trocadas por fictícias só na cópia da gravação,
 * e o banco já começa com essas mesmas mensagens, sugestões e o uso do mês (tudo inventado).
 */
const SLUG = 'biblioteca-de-hsm-operacional';
const PFX = 'hsm_';
const PAPEL_COB = 'gestao_cobranca';
const PAPEL_CRED = 'gestao_credito';
const quadro = (t) => t.p.frameLocator(`iframe[data-slug="${SLUG}"]`);

/* ---------- mensagens fictícias ---------- */
// setor: cobranca | credito · tipo: biblioteca | sistema · sub: etapa (Cobrança) ou canal (Crédito e Implantação)
const M = (setor, tipo, id, categoria, titulo, texto, x = {}) => ({ id, titulo, categoria, tags: x.tags || [], texto, tipo, setor,
  ...(x.sub ? { sub: x.sub } : {}), ...(x.para ? { publico: x.para } : {}), ...(x.obs ? { obs: x.obs } : {}), ...(x.ordem ? { ordem: x.ordem } : {}) });
const COB = (...a) => M('cobranca', 'biblioteca', ...a);
const TPL = (...a) => M('cobranca', 'sistema', ...a);
const CRE = (...a) => M('credito', 'biblioteca', ...a);
const IMP = (...a) => M('credito', 'sistema', ...a);
const MENSAGENS = [
  COB('hsm-f1', 'Atendimento', 'Transferir para o Crédito', 'Só um momento, por gentileza. Vou transferir seu atendimento para a assistente de crédito do seu condomínio, que dará continuidade. 😊', { tags: ['Transferência'] }),
  COB('hsm-f2', 'Atendimento', 'Horário de atendimento', 'Nosso atendimento funciona de segunda a sexta, das [HORÁRIO]. As mensagens são respondidas por ordem de chegada.\n\nObrigado pela paciência! 😊', { tags: ['Horário'] }),
  COB('hsm-f3', 'Boleto e pagamento', 'Enviar a 2ª via do boleto', 'Olá, [NOME DO CLIENTE]! Segue a 2ª via do boleto da unidade [UNIDADE], com vencimento em [DATA].\n\nQualquer dúvida, estou à disposição. 💙', { tags: ['2ª via', 'Boleto'], sub: 'Preventiva' }),
  COB('hsm-f4', 'Boleto e pagamento', 'Confirmar pagamento recebido', 'Olá, [NOME DO CLIENTE]! Confirmamos o pagamento da competência [MÊS/ANO] da unidade [UNIDADE]. Obrigado! 💙', { tags: ['Pagamento'] }),
  COB('hsm-f5', 'Negociação e acordo', 'Opções de negociação', 'Temos algumas opções para regularizar a unidade [UNIDADE]:\n\n📌 Pagamento à vista, com condição especial.\n📌 Parcelamento no boleto.\n📌 Parcelamento no cartão de crédito.\n\nQual delas fica melhor para você?', { tags: ['Negociação', 'Oferta'], sub: 'Assertiva' }),
  COB('hsm-f6', 'Negociação e acordo', 'Lembrete de parcela do acordo', 'Olá, [NOME DO CLIENTE]! Passando para lembrar que a parcela [NÚMERO] do seu acordo vence em [DATA], no valor de [VALOR]. 💙', { tags: ['Acordo', 'Lembrete'], sub: 'Preventiva' }),
  COB('hsm-f7', 'Dúvidas sobre valores', 'O que são os encargos', 'Encargos são os valores cobrados depois do vencimento: juros, multa e a taxa prevista em contrato, aprovada em assembleia. Eles são pagos só por quem está em atraso.', { tags: ['Encargos', 'Explicação'] }),
  COB('hsm-f8', 'Dúvidas sobre valores', 'Prazo para pagar só com juros e multa', 'No seu condomínio, o boleto pode ser pago só com juros e multa até [QUANTIDADE] dias depois do vencimento. Depois desse prazo, entram também os encargos previstos em contrato.', { tags: ['Encargos', 'Prazo'] }),
  COB('hsm-f9', 'MyBlue e segurança', 'Como conferir se o boleto é verdadeiro', 'Antes de pagar, confira se o beneficiário do boleto é a MyBlue. Na dúvida, peça a 2ª via pelo aplicativo ou por aqui. Nunca pague boletos enviados por números desconhecidos. 🔐', { tags: ['Segurança', 'Golpe'] }),
  COB('hsm-f10', 'Para o condomínio', 'Relatório mensal de inadimplência', 'Boa tarde, pessoal! 💙\n\nSegue o relatório de inadimplência de [MÊS/ANO].\n\nQualquer dúvida, estamos à disposição. 🤝', { tags: ['Inadimplência', 'Relatório'] }),
  TPL('hsm-s1', 'Saudação', 'Saudação no atendimento ativo', 'Olá! Tudo bem? 💙\n\nAqui é {{1}}, da equipe MyBlue.\n\nEstou falando com {{2}}?', { tags: ['Atendimento inicial'] }),
  TPL('hsm-s2', 'Fora do horário', 'Retorno de mensagem do fim de semana', 'Olá! Recebemos sua mensagem no fim de semana e estamos retornando agora. 😊\n\nComo podemos te ajudar?', { tags: ['Fora do horário'] }),
  TPL('hsm-s3', 'Cobrança', 'Lembrete no dia do vencimento', 'Olá! Tudo bem? 💙\nPassando para lembrar que o seu boleto vence hoje.\n\nSe precisar de ajuda, estamos à disposição! 🤝', { tags: ['Lembrete'], sub: 'Preventiva' }),
  TPL('hsm-s4', 'Cobrança', 'Boleto vence amanhã', 'Olá! 💙 O boleto da sua unidade vence amanhã. Se já pagou, pode desconsiderar esta mensagem.', { tags: ['Lembrete'], sub: 'Preventiva' }),
  TPL('hsm-s5', 'Cobrança', 'Pagamento não identificado', 'Olá, tudo bem? 💙\nAinda não localizamos o pagamento da sua última taxa condominial. Se já pagou, pode nos enviar o comprovante?', { tags: ['Atraso'], sub: 'Educativa' }),
  CRE('msg-f1', 'Emissão dos boletos', 'Cobrar o envio do balancete', 'Bom dia/Boa tarde, pessoal! Tudo bem?\n\nPara emitirmos os boletos de [MÊS/ANO] dentro do prazo, precisamos do balancete do condomínio até [DATA].\n\nPodem nos enviar por aqui? Obrigada! 💙', { sub: 'Grupo', para: 'Síndico', tags: ['Balancete', 'Pendência'] }),
  CRE('msg-f2', 'Emissão dos boletos', 'Enviar o boleto demonstrativo para aprovação', 'Bom dia/Boa tarde, Sr(a). [NOME DO SÍNDICO(A)]!\n\nSegue o boleto demonstrativo de [MÊS/ANO] do [NOME DO CONDOMÍNIO] para conferência.\n\nSe estiver tudo certo, é só responder com *aprovado* até [DATA].', { sub: 'Grupo', para: 'Síndico', tags: ['Demonstrativo', 'Aprovação'], obs: 'Emitir e anexar o boleto demonstrativo.' }),
  CRE('msg-f3', 'Comunicados aos condôminos', 'Avisar que os boletos já estão no aplicativo', 'Olá! 💙 Os boletos de [MÊS/ANO] já estão disponíveis no aplicativo e no site da MyBlue. O vencimento é dia [DIA].', { para: 'Condômino', tags: ['Comunicado', 'Boletos'] }),
  CRE('msg-f4', 'Repasses e contas', 'Enviar a prestação de contas', 'Prezados, bom dia!\n\nSegue a prestação de contas de [MÊS/ANO] do [NOME DO CONDOMÍNIO], com o valor repassado e o relatório de garantia.\n\nFicamos à disposição para qualquer dúvida.', { sub: 'E-mail', para: 'Síndico', tags: ['Prestação de contas', 'Repasse'],
    obs: 'Para: [E-MAIL DO SÍNDICO(A)]\nCc: [E-MAIL DA ADMINISTRADORA]\nAssunto: Prestação de contas – [NOME DO CONDOMÍNIO] – [MÊS/ANO]\nAnexar o relatório de garantia.' }),
  CRE('msg-f5', 'Repasses e contas', 'Informar o dia do repasse', 'Bom dia, Sr(a). [NOME DO SÍNDICO(A)]! O repasse de [MÊS/ANO] será feito no dia [DATA], na conta cadastrada do condomínio.', { sub: 'Privado', para: 'Síndico', tags: ['Repasse'] }),
  CRE('msg-f6', 'Dúvidas de condôminos', 'Explicar o pagamento no cartão', 'O boleto pode ser pago no cartão de crédito pelo aplicativo da MyBlue, em até [PARCELAS] vezes. É só abrir o boleto e escolher *Pagar com cartão*.', { para: 'Condômino', tags: ['Cartão', 'Pagamento'] }),
  CRE('msg-f7', 'Relacionamento', 'Apresentar a assistente ao condomínio', 'Bom dia/Boa tarde a todos!\n\nMe chamo [SEU NOME] e sou a assistente de crédito responsável pelo [NOME DO CONDOMÍNIO]. A partir de agora, atendo o síndico e a administradora por este número. 💙', { sub: 'Grupo', para: 'Síndico', tags: ['Apresentação'] }),
  IMP('msg-i1', '1. Boas-vindas', 'Dar boas-vindas ao novo condomínio', 'Bom dia/Boa tarde, pessoal! Seja bem-vindo à MyBlue, [NOME DO CONDOMÍNIO]! 💙\n\nEste grupo é o nosso canal com o síndico e a administradora durante a implantação.', { sub: 'Grupo', para: 'Síndico', ordem: 1, tags: ['Boas-vindas'] }),
  IMP('msg-i2', '2. Reunião de onboarding', 'Marcar a reunião de onboarding', 'Gostaríamos de marcar uma reunião rápida, on-line, para apresentar como funciona a implantação. O dia [DATA] às [HORÁRIO] fica bom para vocês?', { sub: 'Grupo', para: 'Síndico', ordem: 1, tags: ['Onboarding', 'Reunião'] }),
  IMP('msg-i3', '3. Documentação', 'Pedir os documentos pendentes', 'Para seguir com a implantação, ainda faltam:\n\n• [DOCUMENTO]\n• [DOCUMENTO]\n\nPodem enviar por aqui até [DATA]?', { sub: 'Grupo', para: 'Síndico', ordem: 1, tags: ['Documentação', 'Pendência'], obs: 'Liste só o que falta (ex.: ata de eleição, cartão CNPJ, cadastro dos condôminos).' }),
  IMP('msg-i4', '5. Primeiro boleto', 'Enviar o primeiro boleto demonstrativo', 'Segue o demonstrativo do primeiro boleto do [NOME DO CONDOMÍNIO]. Confiram os valores e respondam com *aprovado* para liberarmos a emissão.', { sub: 'Grupo', para: 'Síndico', ordem: 1, tags: ['Demonstrativo'], obs: 'Anexar o boleto demonstrativo.' }),
];

const quando = (agora, dias) => new Date(agora.getTime() - dias * 864e5).toISOString();
const mes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

function documentos(ids, agora = new Date()) {
  const docs = {};
  MENSAGENS.forEach((h, i) => {
    const t = quando(agora, 80 - i);
    docs[`${PFX}mensagens/${h.id}`] = { ...h, arquivada: false, criadoEm: t, criadoPor: 'Base inicial', atualizadoEm: t, atualizadoPor: 'Base inicial' };
  });
  // uma mensagem que já veio de sugestão aprovada
  Object.assign(docs[`${PFX}mensagens/hsm-f4`], { atualizadoEm: quando(agora, 12), atualizadoPor: 'Lia Souza', sugeridaPor: 'Marcos Lima' });
  docs[`${PFX}config/geral`] = { semeado: true, versao: 1, em: quando(agora, 80), por: 'Lia Souza' };

  // sugestões (fictícias): do analista da Cobrança (a gestão da Cobrança revisa) e de uma assistente do Crédito (a gestão do Crédito revisa)
  const f8 = MENSAGENS.find((h) => h.id === 'hsm-f8');
  docs[`${PFX}sugestoes/${ids.marcos}`] = { autorId: String(ids.marcos), autorNome: 'Marcos Lima', itens: {
    'sug-o1': { tipo: 'nova', onde: 'cob', setor: 'cobranca', hsmId: null, titulo: 'Confirmar pagamento recebido', categoria: 'Boleto e pagamento', sub: null, tags: ['Pagamento'],
      texto: MENSAGENS[3].texto, motivo: 'Mandamos essa confirmação todo dia.', criadoEm: quando(agora, 14) },
    'sug-o2': { tipo: 'ajuste', onde: 'cob', setor: 'cobranca', hsmId: f8.id, hsmTituloOriginal: f8.titulo, textoOriginal: f8.texto, versaoOriginal: docs[`${PFX}mensagens/${f8.id}`].atualizadoEm,
      titulo: f8.titulo, categoria: f8.categoria, sub: null, tags: f8.tags,
      texto: f8.texto + '\n\nSe o prazo terminar num sábado, domingo ou feriado, dá para pagar pelo PIX do próprio boleto.',
      motivo: 'Muitos condôminos perguntam o que fazer quando o prazo cai no fim de semana.', criadoEm: quando(agora, 2) },
    'sug-o3': { tipo: 'nova', onde: 'cob', setor: 'cobranca', hsmId: null, titulo: 'Pedir o comprovante de pagamento', categoria: 'Boleto e pagamento', sub: 'Educativa', tags: ['Pagamento', 'Comprovante'],
      texto: 'Olá, [NOME DO CLIENTE]! Não localizamos o pagamento de [MÊS/ANO]. Se já pagou, pode enviar o comprovante por aqui? Assim conferimos o que aconteceu. 💙',
      motivo: 'Usamos todo dia e cada um escreve de um jeito.', criadoEm: quando(agora, 1) },
  } };
  docs[`${PFX}decisoes/sug-o1`] = { sid: 'sug-o1', uid: String(ids.marcos), status: 'aprovada', comentario: '', hsmId: 'hsm-f4', porNome: 'Lia Souza', em: quando(agora, 12) };
  docs[`${PFX}sugestoes/${ids.bruna}`] = { autorId: String(ids.bruna), autorNome: 'Bruna Reis', itens: {
    'sug-c1': { tipo: 'nova', onde: 'cre', setor: 'credito', hsmId: null, titulo: 'Lembrar o vencimento dos boletos', categoria: 'Comunicados aos condôminos', sub: 'Grupo', publico: 'Condômino', tags: ['Lembrete', 'Vencimento'], obs: '',
      texto: 'Bom dia, pessoal! Passando para lembrar que os boletos de [MÊS/ANO] vencem em [DATA] e já estão no aplicativo. 💙', motivo: 'Cada um escreve esse lembrete de um jeito.', criadoEm: quando(agora, 1) },
  } };

  // cópias no mês (por pessoa)
  const anterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 15);
  const uso = (d, uid, nome, c) => { docs[`${PFX}uso/${mes(d)}_${uid}`] = { mes: mes(d), uid: String(uid), nome, c }; };
  uso(agora, ids.marcos, 'Marcos Lima', { 'hsm-f3': 14, 'hsm-f5': 9, 'hsm-f7': 7, 'hsm-f8': 6, 'hsm-f10': 3, 'hsm-s3': 4, 'hsm-f1': 2 });
  uso(agora, ids.lia, 'Lia Souza', { 'hsm-f3': 2, 'hsm-f9': 1 });
  uso(agora, ids.bruna, 'Bruna Reis', { 'msg-f1': 11, 'msg-f2': 8, 'msg-f4': 6, 'msg-i3': 2 });
  uso(anterior, ids.marcos, 'Marcos Lima', { 'hsm-f3': 18, 'hsm-f5': 11, 'hsm-f7': 5, 'hsm-f9': 2 });
  return docs;
}

/* a base inicial embutida no HTML (mensagens reais) vira a lista fictícia, só na cópia da gravação */
function adaptarHtml(html) {
  const ini = html.indexOf('var SEED = [');
  const fim = html.indexOf('\n];', ini);
  if (ini < 0 || fim < 0) throw new Error('não achei a base inicial (SEED) no HTML');
  return html.slice(0, ini) + 'var SEED = ' + JSON.stringify(MENSAGENS, null, 1) + ';' + html.slice(fim + 3);
}

module.exports = {
  nome: 'ferramenta-hsm-operacional',
  ferramenta: SLUG,
  entrar: 'lia@myblue.com.br',
  inicio: '#/m/' + SLUG,
  adaptarHtml,
  async preparar(cen) {
    const ids = { lia: cen.id['lia@myblue.com.br'], marcos: cen.id['marcos@myblue.com.br'], caio: cen.id['caio@myblue.com.br'], bruna: cen.id['bruna@myblue.com.br'], davi: cen.id['davi@myblue.com.br'] };
    // uma gestão por setor, cadastrada no portal; a coordenadora da Cobrança e o do Crédito recebem a sua, os demais abrem sem papel
    await cen.admin('PUT', `/api/admin/modulos/${SLUG}/papeis`, { papeis: [
      { id: PAPEL_COB, nome: 'Gestão da Cobrança', descricao: 'Edita a Cobrança e os Templates do sistema e aprova as sugestões da Cobrança' },
      { id: PAPEL_CRED, nome: 'Gestão do Crédito', descricao: 'Edita o Crédito e a Implantação e aprova as sugestões do Crédito' },
    ] });
    await cen.admin('PUT', `/api/admin/modulos/${SLUG}/acesso`, { acessos: [
      { usuario_id: ids.lia, papeis: [PAPEL_COB] }, { usuario_id: ids.caio, papeis: [PAPEL_CRED] },
      { usuario_id: ids.marcos, papeis: [] }, { usuario_id: ids.bruna, papeis: [] }, { usuario_id: ids.davi, papeis: [] },
    ] });
    const r = await cen.admin('POST', `/api/admin/modulos/${SLUG}/documentos`, { modulo: SLUG, documentos: documentos(ids) });
    if (!r || !r.total) throw new Error('não gravou as mensagens de exemplo: ' + JSON.stringify(r));
  },
  abertura: ['As mensagens padrão da Cobrança, do Crédito e da Implantação num lugar só.', ['Escolher o setor e a categoria', 'Instruções de envio e copiar', 'Buscar em todos os setores', 'Templates do sistema', 'Sugestões e Configurações da gestão']],
  async gravar(t) {
    const f = quadro(t);
    await f.locator('#sync.on').waitFor({ state: 'attached', timeout: 30000 }); // o selo fica escondido quando a base está ok
    await t.pausa(600);

    const A = '1 · Setor e categoria';
    await t.legenda('À esquerda, escolha o <b>setor</b>: Cobrança, Crédito ou Implantação. Em <b>Todos os setores</b>, a busca passa pelos três.', { etapa: A, ms: 600 });
    await t.mostrar(f.locator('#selSetor'), 1600);
    await t.escolher(f.locator('#selSetor'), { value: 'cre' }, { depois: 1600 });
    await t.legenda('Depois, a <b>categoria</b>, com quantas mensagens tem cada uma. Clique numa para filtrar.', { etapa: A, ms: 300 });
    await t.clicar(f.locator('#categoryChips [data-c="Repasses e contas"]:not([data-s])'), { depois: 2400 });

    const B = '2 · Abrir e copiar';
    await t.legenda('Clique na mensagem para ver o texto inteiro, como fica no WhatsApp. Em amarelo, as <b>instruções de envio</b> (para quem, assunto, anexos).', { etapa: B, ms: 300 });
    await t.clicar(f.locator('[data-toggle="msg-f4"]'), { depois: 1200 });
    await t.rolar(200);
    await t.pausa(2600);
    await t.legenda('<b>Copiar</b> leva só o texto, sem as instruções. Troque o que está <b>[entre colchetes]</b> antes de enviar.', { etapa: B, ms: 300 });
    await t.clicar(f.locator('#grid [data-copy="msg-f4"]'), { depois: 2600 });
    await t.rolar(-300);

    const C = '3 · Buscar';
    await t.legenda('Volte para <b>Todos os setores</b> e busque por uma palavra do título, do texto ou das tags.', { etapa: C, ms: 300 });
    await t.escolher(f.locator('#selSetor'), { value: '' }, { depois: 900 });
    await t.digitar(f.locator('#searchInput'), 'juros', { atraso: 90, depois: 1600 });
    await t.clicar(f.locator('[data-toggle="hsm-f8"]'), { depois: 2600 });
    await t.clicar(f.locator('#grid [data-copy="hsm-f8"]'), { depois: 2000 });
    await t.digitar(f.locator('#searchInput'), '', { depois: 400 });

    const S = '4 · Templates do sistema';
    await t.legenda('Em <b>Templates do sistema</b>, os modelos da ferramenta de disparo do WhatsApp, só para consulta. As variáveis numeradas são preenchidas por ela.', { etapa: S, ms: 300 });
    await t.clicar(f.locator('[data-view="sistema"]'), { depois: 4400 });
    await t.legenda('Os de cobrança se dividem pela etapa: <b>Preventiva</b>, <b>Educativa</b> e <b>Assertiva</b>.', { etapa: S, ms: 300 });
    await t.clicar(f.locator('#catsSis [data-c="Cobrança"]:not([data-s])'), { depois: 1200 });
    await t.clicar(f.locator('#catsSis [data-s="Preventiva"]'), { depois: 1200 });
    await t.clicar(f.locator('[data-toggle="hsm-s3"]'), { depois: 2600 });

    const G = '5 · Sugestões';
    await t.legenda('Quem não é da gestão sugere ajustes e mensagens novas. Cada gestão revisa as do seu setor em <b>Sugestões</b>.', { etapa: G, ms: 300 });
    await t.clicar(f.locator('#tabSug'), { depois: 3400 });
    await t.legenda('<b>Revisar</b> mostra o texto atual ao lado do sugerido, com o motivo. <b>Aprovar e publicar</b> troca na hora para toda a equipe.', { etapa: G, ms: 300 });
    await t.clicar(f.locator('[data-revisar="sug-o2"]'), { depois: 3800 });
    await t.clicar(f.locator('[data-m="aprovar"]'), { depois: 2800 });

    const K = '6 · Configurações';
    await t.legenda('Em <b>Configurações</b>, cada gestão edita e arquiva as mensagens do seu setor: aqui, a da Cobrança cuida da Cobrança e dos Templates do sistema.', { etapa: K, ms: 300 });
    await t.clicar(f.locator('[data-view="config"]'), { depois: 4600 });
    await t.legenda('Veja quantas vezes cada mensagem foi copiada no mês e ordene pelas <b>mais copiadas</b>.', { etapa: K, ms: 300 });
    await t.clicar(f.locator('[data-ordconf="uso"]'), { depois: 2600 });
    await t.legenda('<b>+ Nova mensagem</b>: escolha onde fica, a categoria e o texto.', { etapa: K, ms: 300 });
    await t.clicar(f.locator('#openAddBtn'), { depois: 800 });
    await t.mostrar(f.locator('#fTipo'), 1400);
    await t.digitar(f.locator('#fTitulo'), 'Aviso de boleto disponível', { atraso: 40 });
    await t.escolher(f.locator('#fCategoria'), 'Boleto e pagamento');
    await t.digitar(f.locator('#fTexto'), 'Olá, [NOME DO CLIENTE]! O boleto de [MÊS/ANO] já está no aplicativo. 💙', { atraso: 30 });
    await t.clicar(f.locator('[data-m="salvar"]'), { depois: 2000 });
    await t.legenda('<b>Exportar Excel</b> ou <b>PDF</b> leva as mensagens do setor, com as cópias de cada mês.', { etapa: K, ms: 300 });
    await t.mostrar(f.locator('#expXlsBtn'), 3200);
  },
  resumo: ['Escolha o <b>setor</b> e a <b>categoria</b> (ou busque) → abrir → <b>Copiar</b> e trocar os [colchetes]', '<b>Templates do sistema</b>: os modelos do disparo, para consulta', 'Cada gestão: <b>Sugestões</b> e <b>Configurações</b> do seu setor'],
};

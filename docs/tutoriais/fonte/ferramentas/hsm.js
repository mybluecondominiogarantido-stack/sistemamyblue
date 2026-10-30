'use strict';
/*
 * Tutorial da Biblioteca de HSM (Cobrança). A ferramenta guarda as mensagens no banco do portal (claude.use('db')).
 * As mensagens reais embutidas no HTML (base inicial) são trocadas por mensagens fictícias só na cópia da gravação,
 * e o banco já começa com essas mesmas mensagens, sugestões de um analista e o uso do mês (tudo inventado).
 */
const SLUG = 'biblioteca-de-hsm';
const PFX = 'hsm_adm_';
const PAPEL = 'gestao_administrativa';
const quadro = (t) => t.p.frameLocator(`iframe[data-slug="${SLUG}"]`);

/* ---------- mensagens fictícias ---------- */
const B = (id, categoria, titulo, texto, extra = {}) => ({ id, titulo, categoria, tags: extra.tags || [], texto, tipo: 'biblioteca', ...(extra.sub ? { sub: extra.sub } : {}) });
const T = (id, categoria, titulo, texto, extra = {}) => ({ ...B(id, categoria, titulo, texto, extra), tipo: 'sistema' });
const MENSAGENS = [
  B('hsm-f1', 'Atendimento', 'Transferir para o Crédito', 'Só um momento, por gentileza. Vou transferir seu atendimento para a assistente de crédito do seu condomínio, que dará continuidade. 😊', { tags: ['Transferência'] }),
  B('hsm-f2', 'Atendimento', 'Horário de atendimento', 'Nosso atendimento funciona de segunda a sexta, das [HORÁRIO]. As mensagens são respondidas por ordem de chegada.\n\nObrigado pela paciência! 😊', { tags: ['Horário'] }),
  B('hsm-f3', 'Boleto e pagamento', 'Enviar a 2ª via do boleto', 'Olá, [NOME DO CLIENTE]! Segue a 2ª via do boleto da unidade [UNIDADE], com vencimento em [DATA].\n\nQualquer dúvida, estou à disposição. 💙', { tags: ['2ª via', 'Boleto'], sub: 'Preventiva' }),
  B('hsm-f4', 'Boleto e pagamento', 'Boleto ainda não disponível', 'O boleto de [MÊS/ANO] ainda está sendo emitido e deve aparecer no aplicativo até [DATA]. Assim que estiver disponível, aviso você por aqui.', { tags: ['Boleto', 'Disponibilidade'] }),
  B('hsm-f5', 'Boleto e pagamento', 'Confirmar pagamento recebido', 'Olá, [NOME DO CLIENTE]! Confirmamos o pagamento da competência [MÊS/ANO] da unidade [UNIDADE]. Obrigado! 💙', { tags: ['Pagamento'] }),
  B('hsm-f6', 'Negociação e acordo', 'Opções de negociação', 'Temos algumas opções para regularizar a unidade [UNIDADE]:\n\n📌 Pagamento à vista, com condição especial.\n📌 Parcelamento no boleto.\n📌 Parcelamento no cartão de crédito.\n\nQual delas fica melhor para você?', { tags: ['Negociação', 'Oferta'], sub: 'Assertiva' }),
  B('hsm-f7', 'Negociação e acordo', 'Enviar o termo do acordo', '📄 *Segue o termo do acordo para assinatura.*\n\n📌 Assine e envie de volta por aqui.\n📌 Os boletos do acordo são enviados *depois que o termo assinado chegar*.', { tags: ['Acordo', 'Formalização'] }),
  B('hsm-f8', 'Negociação e acordo', 'Lembrete de parcela do acordo', 'Olá, [NOME DO CLIENTE]! Passando para lembrar que a parcela [NÚMERO] do seu acordo vence em [DATA], no valor de [VALOR]. 💙', { tags: ['Acordo', 'Lembrete'], sub: 'Preventiva' }),
  B('hsm-f9', 'Dúvidas sobre valores', 'O que são os encargos', 'Encargos são os valores cobrados depois do vencimento: juros, multa e a taxa prevista em contrato, aprovada em assembleia. Eles são pagos só por quem está em atraso.', { tags: ['Encargos', 'Explicação'] }),
  B('hsm-f10', 'Dúvidas sobre valores', 'Prazo para pagar só com juros e multa', 'No seu condomínio, o boleto pode ser pago só com juros e multa até [QUANTIDADE] dias depois do vencimento. Depois desse prazo, entram também os encargos previstos em contrato.', { tags: ['Encargos', 'Prazo'] }),
  B('hsm-f11', 'Dúvidas sobre valores', 'Vencimento definido em assembleia', 'A data de vencimento é definida em assembleia e vale para todas as unidades. Se quiser propor outra data, leve a sugestão para a próxima assembleia do condomínio.', { tags: ['Vencimento'] }),
  B('hsm-f12', 'MyBlue e segurança', 'Apresentação da MyBlue', 'A MyBlue cuida da emissão dos boletos do condomínio, antecipa a arrecadação e faz a cobrança das unidades em atraso.', { tags: ['Institucional'] }),
  B('hsm-f13', 'MyBlue e segurança', 'Como conferir se o boleto é verdadeiro', 'Antes de pagar, confira se o beneficiário do boleto é a MyBlue. Na dúvida, peça a 2ª via pelo aplicativo ou por aqui. Nunca pague boletos enviados por números desconhecidos. 🔐', { tags: ['Segurança', 'Golpe'] }),
  B('hsm-f14', 'Casos especiais da unidade', 'Documentos para troca de titular', 'Para trocar o titular da unidade, envie, por gentileza:\n\n- Matrícula atualizada do imóvel;\n- E-mail e telefone do novo proprietário.', { tags: ['Cadastro', 'Titularidade'] }),
  B('hsm-f15', 'Para o condomínio', 'Relatório mensal de inadimplência', 'Boa tarde, pessoal! 💙\n\nSegue o relatório de inadimplência de [MÊS/ANO].\n\nQualquer dúvida, estamos à disposição. 🤝', { tags: ['Inadimplência', 'Relatório'] }),
  B('hsm-f16', 'Para o condomínio', 'Pedir contatos atualizados', 'Bom dia, pessoal! Não tivemos retorno das unidades abaixo. Vocês têm algum contato atualizado?\n\n• Unidade [UNIDADE]\n• Unidade [UNIDADE]', { tags: ['Contatos', 'Solicitação'] }),
  T('hsm-s1', 'Saudação', 'Saudação no atendimento ativo', 'Olá! Tudo bem? 💙\n\nAqui é {{1}}, da equipe MyBlue.\n\nEstou falando com {{2}}?', { tags: ['Atendimento inicial'] }),
  T('hsm-s2', 'Saudação', 'Saudação no atendimento receptivo', 'Olá, {{2}}! Tudo bem? 💙\n\nAqui é {{1}}, da equipe MyBlue. Recebi sua mensagem e vou te ajudar.', { tags: ['Atendimento inicial'] }),
  T('hsm-s3', 'Fora do horário', 'Retorno de mensagem do fim de semana', 'Olá! Recebemos sua mensagem no fim de semana e estamos retornando agora. 😊\n\nComo podemos te ajudar?', { tags: ['Fora do horário'] }),
  T('hsm-s4', 'Pesquisa', 'Pesquisa de satisfação', 'Pode nos ajudar respondendo a uma pesquisa rápida sobre este atendimento? Sua opinião é muito importante! 🙏', { tags: ['Pesquisa'] }),
  T('hsm-s5', 'Cobrança', 'Lembrete no dia do vencimento', 'Olá! Tudo bem? 💙\nPassando para lembrar que o seu boleto vence hoje.\n\nSe precisar de ajuda, estamos à disposição! 🤝', { tags: ['Lembrete'], sub: 'Preventiva' }),
  T('hsm-s6', 'Cobrança', 'Boleto vence amanhã', 'Olá! 💙 O boleto da sua unidade vence amanhã. Se já pagou, pode desconsiderar esta mensagem.', { tags: ['Lembrete'], sub: 'Preventiva' }),
  T('hsm-s7', 'Cobrança', 'Pagamento não identificado', 'Olá, tudo bem? 💙\nAinda não localizamos o pagamento da sua última taxa condominial. Se já pagou, pode nos enviar o comprovante? Se precisar negociar, estamos à disposição.', { tags: ['Atraso'], sub: 'Educativa' }),
  T('hsm-s8', 'Cobrança', 'Condição especial para regularizar', 'Olá! 😊 Sua unidade tem valores em aberto e preparamos condições especiais para regularizar: à vista com desconto ou parcelado. Quer conhecer as opções?', { tags: ['Oferta'], sub: 'Assertiva' }),
];

const quando = (agora, dias) => new Date(agora.getTime() - dias * 864e5).toISOString();
const mes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

function documentos(ids, agora = new Date()) {
  const docs = {};
  MENSAGENS.forEach((h, i) => {
    const t = quando(agora, 70 - i);
    docs[`${PFX}mensagens/${h.id}`] = { ...h, arquivada: false, criadoEm: t, criadoPor: 'Base inicial', atualizadoEm: t, atualizadoPor: 'Base inicial' };
  });
  // uma mensagem que já veio de sugestão aprovada
  Object.assign(docs[`${PFX}mensagens/hsm-f5`], { atualizadoEm: quando(agora, 12), atualizadoPor: 'Lia Souza', sugeridaPor: 'Marcos Lima' });
  docs[`${PFX}config/geral`] = { semeado: true, versao: 2, em: quando(agora, 70), por: 'Lia Souza' };

  // sugestões do analista (fictício): uma já aprovada, duas esperando revisão
  const f10 = MENSAGENS.find((h) => h.id === 'hsm-f10');
  docs[`${PFX}sugestoes/${ids.marcos}`] = { autorId: String(ids.marcos), autorNome: 'Marcos Lima', itens: {
    'sug-f1': { tipo: 'nova', hsmId: null, titulo: 'Confirmar pagamento recebido', categoria: 'Boleto e pagamento', sub: null, tags: ['Pagamento'], texto: MENSAGENS[4].texto, motivo: 'Mandamos essa confirmação todo dia.', criadoEm: quando(agora, 14) },
    'sug-f2': { tipo: 'ajuste', hsmId: 'hsm-f10', hsmTituloOriginal: f10.titulo, textoOriginal: f10.texto, versaoOriginal: docs[`${PFX}mensagens/hsm-f10`].atualizadoEm,
      titulo: f10.titulo, categoria: f10.categoria, sub: null, tags: f10.tags,
      texto: f10.texto + '\n\nSe o prazo terminar num sábado, domingo ou feriado, dá para pagar pelo PIX do próprio boleto.',
      motivo: 'Muitos condôminos perguntam o que fazer quando o prazo cai no fim de semana.', criadoEm: quando(agora, 2) },
    'sug-f3': { tipo: 'nova', hsmId: null, titulo: 'Pedir o comprovante de pagamento', categoria: 'Boleto e pagamento', sub: 'Educativa', tags: ['Pagamento', 'Comprovante'],
      texto: 'Olá, [NOME DO CLIENTE]! Não localizamos o pagamento de [MÊS/ANO]. Se já pagou, pode enviar o comprovante por aqui? Assim conferimos o que aconteceu. 💙',
      motivo: 'Usamos todo dia e cada um escreve de um jeito.', criadoEm: quando(agora, 1) },
  } };
  docs[`${PFX}decisoes/sug-f1`] = { sid: 'sug-f1', uid: String(ids.marcos), status: 'aprovada', comentario: '', hsmId: 'hsm-f5', porNome: 'Lia Souza', em: quando(agora, 12) };

  // cópias no mês (por pessoa)
  const anterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 15);
  const uso = (d, uid, nome, c) => { docs[`${PFX}uso/${mes(d)}_${uid}`] = { mes: mes(d), uid: String(uid), nome, c }; };
  uso(agora, ids.marcos, 'Marcos Lima', { 'hsm-f3': 14, 'hsm-f6': 9, 'hsm-f9': 7, 'hsm-f10': 6, 'hsm-f15': 3, 'hsm-s5': 4, 'hsm-f1': 2 });
  uso(agora, ids.lia, 'Lia Souza', { 'hsm-f3': 2, 'hsm-f16': 1 });
  uso(anterior, ids.marcos, 'Marcos Lima', { 'hsm-f3': 18, 'hsm-f6': 11, 'hsm-f9': 5, 'hsm-f13': 2 });
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
  nome: 'ferramenta-hsm',
  ferramenta: SLUG,
  entrar: 'lia@myblue.com.br',
  inicio: '#/m/' + SLUG,
  adaptarHtml,
  async preparar(cen) {
    const ids = { lia: cen.id['lia@myblue.com.br'], marcos: cen.id['marcos@myblue.com.br'] };
    // papel de gestão cadastrado no portal; a coordenadora recebe, o analista abre sem papel
    await cen.admin('PUT', `/api/admin/modulos/${SLUG}/papeis`, { papeis: [{ id: PAPEL, nome: 'Gestão', descricao: 'Edita, arquiva e aprova sugestões' }] });
    await cen.admin('PUT', `/api/admin/modulos/${SLUG}/acesso`, { acessos: [{ usuario_id: ids.lia, papeis: [PAPEL] }, { usuario_id: ids.marcos, papeis: [] }] });
    const r = await cen.admin('POST', `/api/admin/modulos/${SLUG}/documentos`, { modulo: SLUG, documentos: documentos(ids) });
    if (!r || !r.total) throw new Error('não gravou as mensagens de exemplo: ' + JSON.stringify(r));
  },
  abertura: ['As mensagens padrão da Cobrança: buscar, copiar e manter a biblioteca em dia.', ['Buscar e copiar uma mensagem', 'Templates do sistema', 'Revisar as sugestões dos analistas', 'Cadastrar e acompanhar o uso']],
  async gravar(t) {
    const f = quadro(t);
    await f.locator('#sync.on').waitFor({ timeout: 20000 });

    const A = '1 · Buscar e copiar';
    await t.legenda('À esquerda, as <b>categorias</b>, com quantas mensagens tem cada uma. Clique numa para filtrar.', { etapa: A, ms: 600 });
    await t.mostrar(f.locator('#categoryChips'), 1600, { dy: 0.25 });
    await t.clicar(f.locator('[data-cat="Negociação e acordo"]').first(), { depois: 1800 });
    await t.clicar(f.locator('[data-cat="Todas"]'), { depois: 500 });
    await t.legenda('Ou busque por uma palavra do título, do texto ou das tags.', { etapa: A, ms: 300 });
    await t.digitar(f.locator('#searchInput'), 'juros', { atraso: 90, depois: 1400 });
    await t.legenda('Clique na mensagem para ver o texto inteiro, como fica no WhatsApp. O que está <b>[entre colchetes]</b> muda a cada envio.', { etapa: A, ms: 300 });
    await t.clicar(f.locator('[data-toggle="hsm-f10"]'), { depois: 1200 });
    await t.rolar(160);
    await t.pausa(2200);
    await t.legenda('<b>Copiar</b> leva o texto para colar na conversa. Antes de enviar, troque o que está entre colchetes.', { etapa: A, ms: 300 });
    await t.clicar(f.locator('[data-copy="hsm-f10"]'), { depois: 2600 });
    await t.rolar(-200);

    const S = '2 · Templates do sistema';
    await t.legenda('Em <b>Templates do sistema</b>, os modelos cadastrados na ferramenta de disparo do WhatsApp, só para consulta. As variáveis numeradas são preenchidas por ela.', { etapa: S, ms: 300 });
    await t.clicar(f.locator('[data-view="sistema"]'), { depois: 4000 });
    await t.legenda('Os de cobrança se dividem por etapa: <b>Preventiva</b>, <b>Educativa</b> e <b>Assertiva</b>.', { etapa: S, ms: 300 });
    await t.clicar(f.locator('#catsSis [data-sub="Preventiva"]'), { depois: 1400 });
    await t.clicar(f.locator('[data-toggle="hsm-s5"]'), { depois: 2600 });

    const G = '3 · Sugestões';
    await t.legenda('Analistas não editam: abrem a mensagem e clicam em <b>Sugerir ajuste</b>, ou sugerem uma nova. Tudo chega em <b>Sugestões</b>.', { etapa: G, ms: 300 });
    await t.clicar(f.locator('#tabSug'), { depois: 4000 });
    await t.legenda('<b>Revisar</b> mostra o texto atual ao lado do sugerido, com o motivo. Dá para ajustar antes de publicar.', { etapa: G, ms: 300 });
    await t.clicar(f.locator('[data-revisar="sug-f2"]'), { depois: 3800 });
    await t.legenda('<b>Aprovar e publicar</b> troca o texto na hora para toda a equipe. Para recusar, escreva um comentário: o analista vê a resposta.', { etapa: G, ms: 300 });
    await t.clicar(f.locator('[data-m="aprovar"]'), { depois: 4200 });

    const C = '4 · Configurações';
    await t.legenda('Em <b>Configurações</b>, a gestão edita e arquiva mensagens e vê quantas vezes cada uma foi copiada no mês.', { etapa: C, ms: 300 });
    await t.clicar(f.locator('[data-view="config"]'), { depois: 1800 });
    await t.clicar(f.locator('[data-ordconf="uso"]'), { depois: 2400 });
    await t.legenda('<b>+ Nova mensagem</b>: escolha onde fica (Biblioteca ou Templates do sistema), a categoria e o texto.', { etapa: C, ms: 300 });
    await t.clicar(f.locator('#openAddBtn'), { depois: 800 });
    await t.mostrar(f.locator('#fTipo'), 1800);
    await t.digitar(f.locator('#fTitulo'), 'Aviso de boleto disponível', { atraso: 40 });
    await t.escolher(f.locator('#fCategoria'), 'Boleto e pagamento');
    await t.digitar(f.locator('#fTexto'), 'Olá, [NOME DO CLIENTE]! O boleto de [MÊS/ANO] já está no aplicativo. 💙', { atraso: 30 });
    await t.clicar(f.locator('[data-m="salvar"]'), { depois: 2000 });
    await t.legenda('<b>Exportar Excel</b> ou <b>PDF</b> leva a biblioteca inteira, com as cópias de cada mês.', { etapa: C, ms: 300 });
    await t.mostrar(f.locator('#expXlsBtn'), 2400);
  },
  resumo: ['<b>Buscar</b> por categoria ou palavra → abrir → <b>Copiar</b> e trocar os [colchetes]', '<b>Templates do sistema</b>: os modelos do disparo, para consulta', 'Gestão: revisar <b>Sugestões</b>, cadastrar e acompanhar o uso em <b>Configurações</b>'],
};

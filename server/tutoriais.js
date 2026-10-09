'use strict';
/*
 * Vídeos tutoriais do portal: o catálogo (título, para quem é) fica aqui; o vídeo e as legendas
 * ficam no banco (tabela tutoriais), enviados pela administração. Os vídeos são gravados com
 * dados fictícios por docs/tutoriais/fonte/gravar-tutoriais.js.
 *
 * Para quem é cada vídeo ("publico"):
 *   todos       qualquer pessoa do portal
 *   equipe      quem faz parte de algum setor (atende tickets)
 *   lider       líderes de setor, coordenadores e supervisores
 *   gestor      coordenadores e supervisores (gestão do setor)
 *   supervisao  supervisão da Central de Tickets (marcação no cadastro)
 *   links       quem edita a Central de Links
 *   admin       só a administração
 *   { modulo }  quem abre aquela ferramenta
 * O administrador vê todos.
 */

const GRUPOS = ['Primeiros passos', 'Central de Tickets', 'Central de Links', 'Ferramentas', 'Gestão do setor', 'Administração'];

const ROTULO_PUBLICO = {
  todos: 'Para todos', equipe: 'Para quem atende tickets', lider: 'Para líderes de setor', gestor: 'Para coordenadores e supervisores',
  supervisao: 'Para a supervisão de tickets', links: 'Para quem edita a Central de Links', admin: 'Para a administração',
};

const TUTORIAIS = [
  { slug: 'portal-primeiro-acesso', grupo: 'Primeiros passos', publico: 'todos', titulo: 'Primeiro acesso e o portal',
    descricao: 'Entrar e criar a senha, a tela inicial, o menu, abrir uma ferramenta, os avisos e a sua conta.' },
  { slug: 'carteira-condominios', grupo: 'Primeiros passos', publico: 'todos', titulo: 'Carteira de condomínios',
    descricao: 'Buscar um condomínio e ver quem é o responsável por ele em cada setor.' },
  { slug: 'central-de-links', grupo: 'Primeiros passos', publico: 'todos', titulo: 'Central de Links',
    descricao: 'Os links úteis da empresa num lugar só.' },
  { slug: 'ticket-abrir-e-acompanhar', grupo: 'Central de Tickets', publico: 'todos', titulo: 'Como abrir e acompanhar um ticket',
    descricao: 'Pedir algo a outro setor, acompanhar o pedido e conversar com quem está atendendo.' },
  { slug: 'ticket-atender', grupo: 'Central de Tickets', publico: 'equipe', titulo: 'Como atender um ticket',
    descricao: 'Minha fila, iniciar o atendimento com prazo, responder, nota interna, aguardando, transferir e resolver.' },
  { slug: 'ticket-lider', grupo: 'Central de Tickets', publico: 'lider', titulo: 'Líder: distribuir a fila do setor',
    descricao: 'Fila do setor, tickets sem responsável, escolher o responsável, prazos e o painel do setor.' },
  { slug: 'ticket-supervisao', grupo: 'Central de Tickets', publico: 'supervisao', titulo: 'Supervisão da Central de Tickets',
    descricao: 'Todos os tickets de todos os setores, atrasados e o painel geral.' },
  { slug: 'links-editar', grupo: 'Central de Links', publico: 'links', titulo: 'Editar a Central de Links',
    descricao: 'Cadastrar links, organizar os grupos e trocar o fundo da campanha do mês.' },
  { slug: 'ferramenta-suprimentos', grupo: 'Ferramentas', publico: { modulo: 'suprimentos' }, titulo: 'Controle de Pedidos — Suprimentos',
    descricao: 'Lançar pedidos à vista e parcelados, ver as janelas de pagamento e marcar como pago.' },
  { slug: 'ferramenta-parceiros', grupo: 'Ferramentas', publico: { modulo: 'parceiros' }, titulo: 'Prestação de Contas — Comissão de Parceiros',
    descricao: 'Cadastrar parceiros e condomínios, lançar o mês e gerar a prestação de contas.' },
  { slug: 'ferramenta-comissoes', grupo: 'Ferramentas', publico: { modulo: 'comissoes-de-novos-condominios' }, titulo: 'Comissões de Novos Condomínios',
    descricao: 'Importar os condomínios do mês, informar a comissão, aprovar e cadastrar na Prestação de Contas.' },
  { slug: 'ferramenta-patrocinio', grupo: 'Ferramentas', publico: { modulo: 'central-patrocinio' }, titulo: 'Central de Patrocínio',
    descricao: 'Como usar a Central de Patrocínio.' },
  { slug: 'ferramenta-viagens', grupo: 'Ferramentas', publico: { modulo: 'gestao-de-viagens' }, titulo: 'Gestão de Viagens',
    descricao: 'Cotar hospedagem, passagens e ajuda de custo, aprovar a viagem, lançar o que foi pago e ver os gastos.' },
  { slug: 'ferramenta-credito', grupo: 'Ferramentas', publico: { modulo: 'credito' }, titulo: 'Central de Ferramentas — Crédito',
    descricao: 'As ferramentas do setor de Crédito.' },
  { slug: 'ferramenta-boletos', grupo: 'Ferramentas', publico: { modulo: 'boletos' }, titulo: 'Controle de Emissão de Boletos',
    descricao: 'Marcar a emissão dos boletos da competência, acompanhar a meta e fechar o mês.' },
  { slug: 'ferramenta-sindicos', grupo: 'Ferramentas', publico: { modulo: 'sindicos' }, titulo: 'Controle de Síndicos',
    descricao: 'Comparar a extração do Vouch com a base de contatos e gerar a lista do Marketing.' },
  { slug: 'ferramenta-renegociacoes', grupo: 'Ferramentas', publico: { modulo: 'renegociacoes' }, titulo: 'Controle de Renegociações e Tickets',
    descricao: 'Registrar renegociações, acompanhar a perda de receita e os tickets do CS.' },
  { slug: 'ferramenta-partnerchip', grupo: 'Ferramentas', publico: { modulo: 'partnerchip-resultados' }, titulo: 'PartnerChip — Resultados',
    descricao: 'O painel de resultados dos parceiros.' },
  { slug: 'gestao-usuarios', grupo: 'Gestão do setor', publico: 'gestor', titulo: 'Usuários do setor',
    descricao: 'Criar o acesso de alguém do setor, liberar ferramentas e redefinir a senha.' },
  { slug: 'gestao-ferramentas', grupo: 'Gestão do setor', publico: 'gestor', titulo: 'Ferramentas do setor',
    descricao: 'Enviar o HTML novo de uma ferramenta, voltar uma versão e escolher quem pode abrir.' },
  { slug: 'gestao-carteira', grupo: 'Gestão do setor', publico: 'gestor', titulo: 'Carteira: trocar o responsável',
    descricao: 'Trocar o responsável do setor num condomínio e transferir a carteira de uma pessoa.' },
  { slug: 'gestao-equipe', grupo: 'Gestão do setor', publico: 'gestor', titulo: 'Equipe, líderes e tipos de demanda',
    descricao: 'Quem é líder do setor e os tipos de demanda que o setor atende, com prazo e prioridade.' },
  { slug: 'admin-usuarios', grupo: 'Administração', publico: 'admin', titulo: 'Usuários e acessos',
    descricao: 'Perfis (administrador, coordenador, supervisor, usuário), setores e marcações do cadastro.' },
  { slug: 'admin-modulos', grupo: 'Administração', publico: 'admin', titulo: 'Módulos e dados',
    descricao: 'Cadastrar uma ferramenta, enviar o HTML, os dados e o backup.' },
];

const porSlug = new Map(TUTORIAIS.map((t) => [t.slug, t]));
const rotuloPublico = (p) => (typeof p === 'string' ? ROTULO_PUBLICO[p] : 'Para quem usa a ferramenta');

/* O que a pessoa pode ver: devolve uma função (tutorial) => boolean */
async function visibilidade(db, seg, u) {
  if (u.papel === 'admin') return () => true;
  const membro = (await db.q('SELECT lider FROM setor_membros WHERE usuario_id = $1', [u.id])).rows;
  const gestor = seg.GESTORES_DE_SETOR.includes(u.papel);
  const sup = !!u.supervisor_tickets;
  const mods = await seg.modulosDoUsuario(u);
  const regra = {
    todos: true,
    equipe: membro.length > 0 || sup,
    lider: membro.some((m) => m.lider) || gestor || sup,
    gestor,
    supervisao: sup,
    links: !!u.editor_links,
    admin: false,
  };
  return (t) => (typeof t.publico === 'string' ? !!regra[t.publico] : mods.has(t.publico.modulo));
}

/* duração (segundos) lida do cabeçalho do MP4 (caixa mvhd) */
function duracaoMp4(buf) {
  const i = buf.indexOf('mvhd');
  if (i < 0 || i + 32 > buf.length) return null;
  const versao = buf[i + 4];
  const escala = versao === 1 ? buf.readUInt32BE(i + 24) : buf.readUInt32BE(i + 16);
  const dur = versao === 1 ? Number(buf.readBigUInt64BE(i + 28)) : buf.readUInt32BE(i + 20);
  return escala ? Math.round(dur / escala) : null;
}

module.exports = { TUTORIAIS, GRUPOS, porSlug, rotuloPublico, visibilidade, duracaoMp4 };

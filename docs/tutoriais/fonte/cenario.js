'use strict';
/*
 * Cenário fictício dos tutoriais: pessoas, setores, carteira, links, tipos de demanda e tickets.
 * Todos entram com a senha "Nova12345" (a do administrador é "Admin1234").
 *
 * As ferramentas recebem um HTML de exemplo. Para gravar uma ferramenta de verdade, passe
 * { slug: 'caminho/do/arquivo.html' } em "ferramentas" (o HTML não fica no repositório).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { cliente } = require('./gravador');

const SENHA = 'Nova12345';
const EXTRAS = {
  'comissoes-de-novos-condominios': ['Comissões de Novos Condomínios', 'Comercial', 'aperto'],
  'partnerchip-resultados': ['PartnerChip — Resultados', 'Comercial', 'grafico'],
  'central-patrocinio': ['Central de Patrocínio', 'Administrativa/Financeira', 'documento'],
  'gestao-de-viagens': ['Gestão de Viagens', 'Administrativa/Financeira', 'app'],
};
const exemplo = (t) => `<!doctype html><html><head><meta charset="utf-8"><title>${t}</title></head><body style="font-family:sans-serif;padding:40px;color:#13323a"><h2>${t}</h2><p>Ferramenta de exemplo.</p></body></html>`;

/* imagens e arquivos de exemplo usados nos vídeos (gerados na hora, nada real) */
const PASTA = path.join(os.tmpdir(), 'tutoriais-recursos');
function recursos() {
  const r = { fundo: path.join(PASTA, 'fundo-campanha.jpg'), foto: path.join(PASTA, 'foto.png'), video: path.join(PASTA, 'vazio.mp4'), html: path.join(PASTA, 'Ferramenta_de_exemplo.html') };
  if (fs.existsSync(r.video)) return r;
  fs.mkdirSync(PASTA, { recursive: true });
  execFileSync('convert', ['-size', '1920x1080', 'gradient:#0c77be-#4fc1cf', '-fill', 'rgba(255,255,255,0.13)', '-draw', 'circle 1500,300 1500,700',
    '-draw', 'circle 250,950 250,1250', '-fill', 'rgba(255,255,255,0.08)', '-draw', 'circle 900,560 900,760', '-quality', '85', r.fundo]);
  execFileSync('convert', ['-size', '320x320', 'xc:#cfe9ef', '-fill', '#e8b48f', '-draw', 'circle 160,128 160,62', '-fill', '#147f90', '-draw', 'ellipse 160,330 118,112 180,360', r.foto]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x199cb1:s=320x180:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', r.video]);
  fs.writeFileSync(r.html, exemplo('Ferramenta de exemplo — versão nova'));
  return r;
}

async function montarCenario(base, { ferramentas = {} } = {}) {
  const rec = recursos();
  const a = cliente(base);
  await a('POST', '/api/auth/login', { email: 'admin@myblue.com.br', senha: 'Admin1234' });
  const eq = await a('GET', '/api/admin/equipes');
  const S = (n) => eq.setores.find((s) => s.nome === n).id;

  const titulos = { credito: 'Central de Ferramentas — Crédito', cobranca: 'Central de Ferramentas — Cobrança', renegociacoes: 'Controle de Renegociações',
    suprimentos: 'Controle de Pedidos', parceiros: 'Prestação de Contas — Parceiros', boletos: 'Controle de Emissão de Boletos', sindicos: 'Controle de Síndicos' };
  for (const [slug, t] of Object.entries(titulos)) {
    await a('PUT', `/api/admin/modulos/${slug}/arquivo`, ferramentas[slug] ? fs.readFileSync(ferramentas[slug]) : exemplo(t));
  }
  // ferramentas que entraram depois do catálogo inicial: criadas como no portal (dados no banco, compartilhados)
  for (const [slug, [nome, setor, icone]] of Object.entries(EXTRAS)) {
    if (!ferramentas[slug]) continue;
    await a('POST', '/api/admin/modulos', { nome, slug, setor_id: S(setor), icone, descricao: '', armazenamento: 'compartilhado' });
    await a('PUT', `/api/admin/modulos/${slug}/arquivo`, fs.readFileSync(ferramentas[slug]));
  }
  // a Prestação de Contas grava no banco do portal, compartilhado pela equipe
  if (ferramentas.parceiros) await a('PATCH', '/api/admin/modulos/parceiros', { armazenamento: 'compartilhado' });
  await a('PATCH', '/api/admin/modulos/sindicos', { setor_id: S('Crédito') });

  // carteira de condomínios
  const conds = [['Cond. Jardim Azul', 'SP'], ['Ed. Solar das Palmeiras', 'SP'], ['Res. Primavera', 'CE'], ['Cond. Vila Rica', 'PE'], ['Ed. Aurora', 'SP'], ['Res. Bela Vista', 'BA']];
  const cond = {};
  for (const [i, [nome, uf]] of conds.entries()) {
    cond[nome] = (await a('POST', '/api/carteira', { nome, comarca: uf, situacao: i === 5 ? 'DISTRATADO' : 'ATIVO', vencimento: 'Dia 10', administradora: i % 2 ? 'Própria' : 'Adm. Exemplo',
      analista_cobranca: i < 4 ? 'MARCOS LIMA - 4701' : 'ANA COSTA - 4702', assistente_credito: i % 2 ? 'DAVI ROCHA - 4711' : 'BRUNA REIS - 4710',
      analista_extrajudicial: i % 2 ? 'APOIOCOB — ANA' : '', razao_social: nome.toUpperCase(), cnpj: `12.345.678/000${i + 1}-9${i}` })).id;
  }

  // Central de Links
  for (const [grupo, titulo, url, icone, descricao] of [
    ['Atendimento', 'Portal do síndico', 'https://exemplo.myblue.com.br/sindico', 'casa', 'Acesso do síndico aos relatórios do condomínio'],
    ['Atendimento', 'Segunda via de boleto', 'https://exemplo.myblue.com.br/boleto', 'documento', 'Emissão de 2ª via para condôminos'],
    ['Equipe', 'Agenda da equipe', 'https://exemplo.myblue.com.br/agenda', 'calendario', ''],
    ['Equipe', 'Treinamentos', 'https://exemplo.myblue.com.br/treinamentos', 'video', 'Vídeos e materiais de treinamento'],
  ]) await a('POST', '/api/links/gestao/links', { grupo, titulo, url, icone, descricao, ativo: true });

  // pessoas (o setor vem do cadastro e forma a equipe do setor)
  const pessoas = [
    ['Lia Souza', 'lia@myblue.com.br', { papel: 'coordenador', setores: [S('Cobrança')] }],
    ['Marcos Lima', 'marcos@myblue.com.br', { setores: [S('Cobrança')], modulos: ['cobranca'] }],
    ['Sara Alves', 'sara@myblue.com.br', { setores: [S('CS')], modulos: ['renegociacoes'] }],
    ['Sueli Prado', 'sueli@myblue.com.br', { setores: [S('Gerência')], supervisor_tickets: true }],
    ['Caio Mendes', 'caio@myblue.com.br', { papel: 'coordenador', setores: [S('Crédito')] }],
    ['Bruna Reis', 'bruna@myblue.com.br', { setores: [S('Crédito')], modulos: ['credito', 'boletos'] }],
    ['Davi Rocha', 'davi@myblue.com.br', { setores: [S('Crédito')], modulos: ['credito'] }],
    ['Paula Dias', 'paula@myblue.com.br', { papel: 'coordenador', setores: [S('Administrativa/Financeira'), S('Suprimentos'), S('Parceiros')] }],
    ['Rafa Nunes', 'rafa@myblue.com.br', { setores: [S('Suprimentos')], modulos: ['suprimentos'] }],
  ];
  const id = {};
  for (const [nome, email, extra] of pessoas) id[email] = (await a('POST', '/api/admin/usuarios', { nome, email, senha: 'Senha1234', ...extra })).id;
  await a('PUT', `/api/admin/equipes/${S('Cobrança')}/membros`, { membros: [{ usuario_id: id['lia@myblue.com.br'], lider: true }, { usuario_id: id['marcos@myblue.com.br'] }] });
  await a('PUT', `/api/admin/equipes/${S('CS')}/membros`, { membros: [{ usuario_id: id['sara@myblue.com.br'], lider: true }] });
  await a('PUT', `/api/admin/equipes/${S('Crédito')}/membros`, { membros: [{ usuario_id: id['caio@myblue.com.br'], lider: true }, { usuario_id: id['bruna@myblue.com.br'] }, { usuario_id: id['davi@myblue.com.br'] }] });
  const cat = {};
  for (const [setor, nome, prazo_horas, prioridade] of [
    ['Cobrança', '2ª via de boleto', 4, 'alta'], ['Cobrança', 'Proposta de acordo', 18, 'media'], ['Cobrança', 'Negativação / baixa', 9, 'alta'],
    ['Crédito', 'Prestação de contas', 27, 'media'], ['Suprimentos', 'Pedido de compra', 18, 'media'],
  ]) cat[nome] = (await a('POST', `/api/admin/equipes/${S(setor)}/categorias`, { nome, prazo_horas, prioridade })).id;

  // primeiro acesso de todos já feito (senha definitiva)
  const sessao = {};
  for (const email of Object.keys(id)) {
    const c = cliente(base);
    await c('POST', '/api/auth/login', { email, senha: 'Senha1234' });
    await c('POST', '/api/auth/senha', { atual: 'Senha1234', nova: SENHA });
    sessao[email.split('@')[0]] = c;
  }

  // tickets já em andamento
  const { sara, lia, marcos } = sessao;
  const t1 = await sara('POST', '/api/tickets', { condominio_id: cond['Cond. Jardim Azul'], titulo: '2ª via do boleto — apto 302', descricao: 'Síndico pediu a 2ª via do boleto de outubro.\nVencimento original: 05/10.', setor_id: S('Cobrança'), categoria_id: cat['2ª via de boleto'] });
  const t2 = await sara('POST', '/api/tickets', { interno: true, titulo: 'Acordo para unidade 104 — Ed. Solar', descricao: 'Condômino quer parcelar 3 meses em atraso.', setor_id: S('Cobrança'), prioridade: 'urgente' });
  const t3 = await sara('POST', '/api/tickets', { interno: true, titulo: 'Revisar régua de cobrança do Res. Primavera', setor_id: S('Cobrança'), prioridade: 'baixa' });
  await sara('POST', '/api/tickets', { condominio_id: cond['Cond. Vila Rica'], titulo: 'Balancete de setembro', setor_id: S('Crédito'), prioridade: 'media' });
  await lia('POST', '/api/tickets', { interno: true, titulo: 'Contrato do Res. Bela Vista para renovação', setor_id: S('CS'), prioridade: 'alta' });
  await lia('PATCH', `/api/tickets/${t2.id}`, { responsavel_id: id['lia@myblue.com.br'] });
  await marcos('PATCH', `/api/tickets/${t1.id}`, { status: 'em_andamento', prazo_conclusao: new Date(Date.now() + 26 * 3600e3).toISOString() });
  await marcos('POST', `/api/tickets/${t1.id}/comentarios`, { texto: 'Emitindo agora, envio ainda hoje para o síndico.' });

  // um ticket atrasado (o prazo para resposta já passou)
  await lia('PATCH', `/api/tickets/${t3.id}`, { prazo: new Date(Date.now() - 20 * 3600e3).toISOString() });

  // tutoriais com vídeo, para o menu "Tutoriais" aparecer como no portal de verdade
  for (const slug of ['portal-primeiro-acesso', 'ticket-abrir-e-acompanhar', 'carteira-condominios', 'central-de-links', 'ticket-atender', 'ticket-lider']) {
    await a('PUT', `/api/admin/tutoriais/${slug}/video`, fs.readFileSync(rec.video), 'video/mp4');
  }

  // campanha do mês na Central de Links
  const camp = await a('POST', '/api/links/gestao/campanhas', { nome: 'Campanha de exemplo', inicio: new Date(Date.now() - 864e5).toISOString().slice(0, 10), escurecer: 35 });
  if (camp && camp.id) await a('PUT', `/api/links/gestao/campanhas/${camp.id}/fundo`, fs.readFileSync(rec.fundo), 'image/jpeg');

  return { admin: a, sessao, S, id, cond, cat, rec, tickets: { t1, t2, t3 } };
}

module.exports = { montarCenario, SENHA };

'use strict';
/*
 * Dados inventados para gravar as ferramentas que guardam documentos no banco do portal
 * (Controle de Emissão de Boletos e Controle de Síndicos). Nomes, telefones e e-mails são fictícios.
 */
const CONDS = ['Jardim Azul', 'Solar das Palmeiras', 'Primavera', 'Vila Rica', 'Aurora', 'Bela Vista', 'Monte Verde', 'Atlântico', 'Bosque Real',
  'Porto Seguro', 'Horizonte', 'Das Flores', 'Lago Sul', 'Mirante', 'Sol Nascente', 'Serra Azul', 'Copacabana', 'Vale Verde', 'Recanto',
  'Imperial', 'Ipê Amarelo', 'Ilha Bela', 'Central Park', 'Águas Claras'];
const UFS = ['CE', 'CE', 'PB', 'RN', 'CE', 'SP'];
const DIAS = [10, 10, 15, 5, 10, 20];
const SINDICOS = ['Carlos Menezes', 'Patrícia Lopes', 'Roberto Alves', 'Fernanda Dias', 'Marcelo Pinto', 'Juliana Rocha', 'André Souza', 'Camila Freitas',
  'Ricardo Gomes', 'Luciana Barros', 'Eduardo Prado', 'Beatriz Nunes', 'Sérgio Matos', 'Helena Castro', 'Paulo Ribeiro', 'Renata Moura',
  'Gustavo Lima', 'Aline Teixeira', 'Fábio Cunha', 'Marina Lopes', 'Rodrigo Vieira', 'Tatiana Melo', 'Vinícius Ramos', 'Cláudia Reis'];

const iso = (d) => d.toISOString().slice(0, 10);
const somaDias = (base, n) => { const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const id = (i) => 'c' + String(i + 1).padStart(3, '0');

/* Controle de Emissão de Boletos: cadastro, feriados e a competência do mês atual */
function boletos(agora = new Date()) {
  const comp = agora.toISOString().slice(0, 7);
  const conds = {};
  const itens = {};
  CONDS.forEach((nome, i) => {
    const dia = DIAS[i % DIAS.length];
    conds[id(i)] = { nome: 'Cond. ' + nome, uf: UFS[i % UFS.length], dia, regra: 'Dia fixo', sit: 'Ativo', resp: i % 2 ? 'Davi Rocha' : 'Bruna Reis' };
    const venc = `${comp}-${String(dia).padStart(2, '0')}`;
    const meta = somaDias(venc, -10);
    // a maior parte já emitida (algumas fora da meta); os de vencimento mais distante ainda pendentes
    if (dia === 20 && i % 3) return;
    if (i % 7 === 6) return;
    const emi = somaDias(meta, i % 5 === 4 ? 2 : -((i % 3) + 1));
    itens[id(i)] = { emi, em: emi + 'T14:' + String(10 + i).padStart(2, '0') + ':00.000Z', por: conds[id(i)].resp, obs: '' };
  });
  // um erro de emissão já corrigido
  Object.assign(itens[id(1)], {
    err: true, errTipo: 'Vencimento', errGrav: 'Não grave', errSt: 'Reemitido', errMsg: 'Boleto saiu com o vencimento do mês anterior. Reemitido.',
    errPor: 'Davi Rocha', errEm: iso(agora) + 'T10:05:00.000Z', errCorr: iso(agora) + 'T11:20:00.000Z',
  });
  const ano = agora.getUTCFullYear();
  const feriados = { dias: {
    [`${ano}-09-07`]: { abr: 'Nacional', nome: 'Independência do Brasil' }, [`${ano}-10-12`]: { abr: 'Nacional', nome: 'Nossa Senhora Aparecida' },
    [`${ano}-11-02`]: { abr: 'Nacional', nome: 'Finados' }, [`${ano}-11-15`]: { abr: 'Nacional', nome: 'Proclamação da República' },
    [`${ano}-11-20`]: { abr: 'Nacional', nome: 'Consciência Negra' }, [`${ano}-12-25`]: { abr: 'Nacional', nome: 'Natal' },
  } };
  return { 'config/cadastro': { conds }, 'config/feriados': feriados, [`meses/${comp}`]: { comp, antecedencia: 10, itens } };
}

/* Controle de Síndicos: a base de contatos */
function sindicos() {
  const docs = { 'meta/estado': { origem: 'dados de exemplo', seedEm: '2026-10-01' } };
  CONDS.forEach((nome, i) => {
    const slug = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '');
    docs['contatos/' + id(i)] = {
      cond: nome, sind: SINDICOS[i], ativo: true, saiu: '', env: 'S', obs: '', incl: '2026-09-15',
      tel: i % 6 === 5 ? '' : `(85) 90000-${String(1000 + i * 37).slice(-4)}`,
      email: i % 8 === 7 ? '' : `sindico.${slug}@exemplo.com.br`,
    };
  });
  docs['ignorar/i1'] = { nome: 'Cond. Teste Interno', motivo: 'Condomínio de teste, não é cliente' };
  return docs;
}

/* a extração do Vouch colada no vídeo: dois síndicos novos e um condomínio que saiu */
function extracaoVouch() {
  const linhas = CONDS.slice(0, 22).map((c, i) => [c, i === 3 ? 'Mariana Torres (Morador)' : i === 9 ? 'Otávio Brandão (Externo)' : SINDICOS[i] + ' (Morador)']);
  return ['Apelido\tSíndico', ...linhas.map((l) => l.join('\t'))].join('\n');
}

/* Prestação de Contas — Comissão de Parceiros: parceiros, carteira, lançamentos de janeiro até o mês
   anterior e o controle de envio/pagamento. Devolve as gravações no formato da ferramenta ({sheet, item}). */
const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
function prestacao(agora = new Date(), { pular = [] } = {}) {
  const P = (nome, uf, extra) => ({ id: 'p-' + normal(nome), nome, uf, rate: 10, obs: '', tarifaNaBase: true, boletoModo: '', boletoPiso: 0, encNaBase: true,
    venda: 'nenhuma', vendaPct: 50, vendaBase: 'tsr', tags: ['recorrencia'], custom: true, ...extra });
  const parceiros = [
    P('Alfa Administradora', 'CE'),
    P('Boa Vista Gestão Condominial', 'PB', { venda: 'primeiro', tags: ['recorrencia', 'venda'] }),
    P('Central Síndicos Associados', 'RN'),
    P('Nordeste Condomínios', 'CE', { tarifaNaBase: false, boletoModo: 'exc', boletoPiso: 2.5, tags: ['condicao'], obs: 'Comissão sobre o excedente da tarifa' }),
    P('Prime Administração', 'SP', { venda: 'subsequente', tags: ['somentevenda'], rate: 0 }),
  ];
  const id = (n) => parceiros[n].id;
  // condomínio → parceiros (dois parceiros = comissão dividida, 5% cada)
  const carteira = [[0], [0], [0], [1], [1], [1, 2], [2], [2], [3], [3], [0, 3], [1]];
  const condos = carteira.map((ps, i) => ({ id: 'c-' + normal('Cond. ' + CONDS[i]), nome: 'Cond. ' + CONDS[i], valorBoleto: [3.2, 2.9, 3.5, 3.1][i % 4],
    vinculos: ps.map((p) => ({ partnerId: id(p), rate: ps.length > 1 ? 5 : 10 })), custom: true }));
  const gravar = [{ sheet: 'meta', item: { id: 'base', versao: 'v5-competencia' } }];
  parceiros.forEach((p) => gravar.push({ sheet: 'partners', item: { ...p, tags: JSON.stringify(p.tags) } }));
  condos.forEach((c) => gravar.push({ sheet: 'condos', item: { id: c.id, nome: c.nome, valorBoleto: c.valorBoleto, vinculosJSON: JSON.stringify(c.vinculos), custom: true } }));
  const ano = agora.getFullYear();
  const ultimo = agora.getMonth(); // competências de janeiro até o mês anterior
  let semente = 7;
  const aleat = () => { semente = (semente * 9301 + 49297) % 233280; return semente / 233280; };
  const brl = (n) => n.toFixed(2).replace('.', ',');
  for (let m = 1; m <= ultimo; m++) {
    const ref = `${ano}-${String(m).padStart(2, '0')}`;
    condos.forEach((c, i) => {
      if (m < 3 && i > 9) return; // dois condomínios entraram em março
      if (m === ultimo && pular.includes(i)) return; // condomínios deixados para lançar no vídeo
      const tsr = 1800 + Math.round(aleat() * 4200) + m * 40;
      const qtd = 60 + Math.round(aleat() * 70);
      gravar.push({ sheet: 'entries', item: { id: `e${m}${i}`, ref, condoId: c.id, tsr: brl(tsr), tarifa: brl(qtd * c.valorBoleto), multa: brl(aleat() * 120),
        juros: brl(aleat() * 60), encargos: brl(aleat() * 40), correcao: brl(aleat() * 25), qtdBoletos: String(qtd), valorBoleto: brl(c.valorBoleto),
        pctBoleto: '', venda: m === 3 && i === 11 ? true : '', comp: 1 } });
    });
    // controle: competências antigas enviadas e pagas; a última só enviada para parte dos parceiros
    parceiros.forEach((p, k) => {
      const pago = m < ultimo;
      const enviado = pago || k % 2 === 0;
      if (!enviado || (m === ultimo && pular.some((i) => carteira[i].includes(k)))) return;
      const envio = `${ano}-${String(Math.min(m + 1, 12)).padStart(2, '0')}-0${3 + k}`;
      gravar.push({ sheet: 'status', item: { key: `${ref}_${p.id}`, ref, partnerId: p.id, enviado: true, dataEnvio: envio, pago,
        dataPagamento: pago ? `${ano}-${String(Math.min(m + 1, 12)).padStart(2, '0')}-1${k}` : '', valorPago: '', comp: 1 } });
    });
  }
  return gravar;
}

/* Comissões de Novos Condomínios: planilha de implantações do mês (linhas para a ferramenta importar) */
function implantacoes(agora = new Date()) {
  const venc = (d) => `${String(d).padStart(2, '0')}/${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()}`;
  const linhas = [
    ['Nº do formulário', 'Condomínio', 'Estado', '1º vencimento', 'ADM', 'Executivo'],
    ['4101', 'Cond. Lago Azul', 'CE', venc(10), 'Alfa Administradora', 'Bruna Reis'],
    ['4102', 'Res. Jardim das Palmeiras', 'PB', venc(15), 'Boa Vista Gestão Condominial', 'Bruna Reis'],
    ['4103', 'Ed. Atlântico Sul', 'CE', venc(10), 'Própria', 'Davi Rocha'],
    ['4104', 'Cond. Vale do Sol', 'RN', venc(5), 'Central Síndicos Associados', 'Davi Rocha'],
    ['4105', 'Res. Monte Belo', 'CE', venc(20), 'Nordeste Condomínios', 'Bruna Reis'],
  ];
  return linhas.map((l) => l.join(';')).join('\n') + '\n';
}

/* Crédito — Planilha de Moradores: cadastro recebido de um condomínio (linhas da planilha).
   Alguns contatos sem CPF, telefone ou e-mail, para a aba de pendências aparecer. */
function moradores() {
  const nomes = ['Ana Beatriz Lopes', 'Bruno Carvalho', 'Carla Mendes', 'Daniel Freitas', 'Elisa Marques', 'Felipe Andrade', 'Gabriela Pires', 'Henrique Sales',
    'Isabela Moura', 'João Pedro Castro', 'Larissa Viana', 'Mateus Farias', 'Natália Rocha', 'Otávio Leal', 'Priscila Antunes', 'Rafael Tavares'];
  const linhas = [['Unidade', 'Nome', 'Tipo', 'Telefone', 'CPF', 'E-mail']];
  nomes.forEach((nome, i) => {
    const un = `${Math.floor(i / 4) + 1}0${(Math.floor(i / 2) % 2) + 1}`; // 101, 102, 201, 202… (dois moradores por unidade)
    const tipo = i % 2 ? 'Residente' : 'Proprietário';
    const login = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(' ')[0];
    linhas.push([un, nome, tipo, i % 5 === 3 ? '' : `(85) 98000-${String(2100 + i * 13)}`, i % 6 === 4 ? '' : `000.000.${String(100 + i).padStart(3, '0')}-00`,
      i % 7 === 5 ? '' : `${login}.${i + 1}@exemplo.com.br`]);
  });
  return linhas;
}

/* Gestão de Viagens: viagens dos últimos meses em todas as etapas (documentos "viagens/<id>").
   "por" é quem registrou/decidiu (id do portal "mb-<n>"). */
function viagens(agora = new Date(), { por = '' } = {}) {
  const dia = (n) => { const d = new Date(agora); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const quando = (n) => dia(n) + 'T13:00:00.000Z';
  let k = 0;
  const cot = (fornecedor, valor) => ({ id: 'c' + (++k), fornecedor, valor, obs: '' });
  const item = (tipo, descricao, cots, esc = 0, realizado = null) => { const c = cots.map(([f, v]) => cot(f, v)); return { id: 'i' + (++k), tipo, descricao, cotacoes: c, escolhida: c[esc].id, realizado }; };
  const V = (n, status, colaborador, setor, destino, regiao, diaria, ida, dias, itens, extra = {}) => ({
    id: 'vdemo' + n, protocolo: `VG-${dia(ida).replace(/-/g, '')}-D${n}`, status, colaborador, setor, cargo: '', motivo: extra.motivo || 'Visita a condomínios da carteira',
    origem: 'Fortaleza/CE', destino, dataIda: dia(ida), dataVolta: dia(ida + dias - 1), obs: '', solicitante: extra.solicitante || '', dataSolicitacao: dia(ida - 12),
    itens, ajuda: { diaria, regiao, diariaAuto: true, dias, diasAuto: true, modo: 'inclusivo', semAjuda: false, realizado: null },
    criadoEm: quando(ida - 12), criadoPor: por, historico: [{ quando: quando(ida - 12), por, acao: 'Viagem cadastrada' }],
    ...(['aprovada', 'realizada', 'reprovada'].includes(status) ? { decisao: { por, em: quando(ida - 8), obs: status === 'reprovada' ? 'Fazer por videochamada.' : '' } } : {}),
  });
  const lista = [
    V(1, 'realizada', 'Bruna Reis', 'Crédito', 'Natal/RN', 'nordeste', 65, -84, 3, [
      item('hospedagem', '2 diárias, quarto single', [['Hotel Ponta Negra', 410], ['Pousada Mar Azul', 360]], 1, 360),
      item('rodoviario', 'Ida e volta', [['Viação Litoral', 238]], 0, 238)]),
    V(2, 'realizada', 'Marcos Lima', 'Cobrança', 'Recife/PE', 'nordeste', 65, -61, 4, [
      item('aereo', 'Ida e volta', [['Azul', 980], ['LATAM', 1120], ['GOL', 1040]], 0, 980),
      item('hospedagem', '3 diárias', [['Hotel Boa Viagem', 690], ['Hotel Recife Centro', 615]], 1, 640)], { solicitante: 'Lia Souza' }),
    V(3, 'realizada', 'Gil Martins', 'Comercial', 'São Paulo/SP', 'sulsudeste', 75, -33, 3, [
      item('aereo', 'Ida e volta', [['LATAM', 1460], ['GOL', 1390]], 1, 1390),
      item('hospedagem', '2 diárias, próximo ao cliente', [['Hotel Paulista', 820], ['Hotel Jardins', 760]], 1, 760),
      item('locacao', 'Carro econômico, 3 dias', [['Locadora Rápida', 345]], 0, 345)], { motivo: 'Reunião com parceiro' }),
    V(4, 'aprovada', 'Davi Rocha', 'Crédito', 'João Pessoa/PB', 'nordeste', 65, 6, 3, [
      item('hospedagem', '2 diárias', [['Hotel Tambaú', 520], ['Pousada Cabo Branco', 440]], 1),
      item('rodoviario', 'Ida e volta', [['Viação Litoral', 196]], 0)], { solicitante: 'Caio Mendes' }),
    V(5, 'aprovacao', 'Lia Souza', 'Cobrança', 'Salvador/BA', 'nordeste', 65, 14, 3, [
      item('aereo', 'Ida e volta', [['Azul', 890], ['GOL', 940]], 0),
      item('hospedagem', '2 diárias', [['Hotel Rio Vermelho', 600], ['Hotel Barra', 560]], 1)]),
    V(6, 'reprovada', 'Sara Alves', 'CS', 'Brasília/DF', 'centrooeste', 75, 20, 2, [
      item('aereo', 'Ida e volta', [['LATAM', 1680]], 0)], { motivo: 'Treinamento' }),
  ];
  const docs = {};
  lista.forEach((v) => {
    if (v.status === 'realizada') v.historico.push({ quando: quando(-1), por, acao: 'Marcada como realizada' });
    docs['viagens/' + v.id] = v;
  });
  return docs;
}

module.exports = { boletos, sindicos, extracaoVouch, prestacao, implantacoes, moradores, viagens, CONDS };

/* troca o valor de uma constante de lista embutida no HTML (casando os colchetes), mantendo o resto do arquivo */
function trocarLista(html, nome, valor) {
  const ini = html.indexOf(`const ${nome} = [`);
  if (ini < 0) return html;
  let i = html.indexOf('[', ini), prof = 0, aspas = null;
  for (; i < html.length; i++) {
    const c = html[i];
    if (aspas) { if (c === '\\') i++; else if (c === aspas) aspas = null; continue; }
    if (c === '"' || c === "'") aspas = c;
    else if (c === '[') prof++;
    else if (c === ']' && --prof === 0) break;
  }
  return html.slice(0, html.indexOf('[', ini)) + JSON.stringify(valor) + html.slice(i + 1);
}
module.exports.trocarLista = trocarLista;

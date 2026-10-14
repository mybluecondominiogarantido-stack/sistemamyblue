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

/* ===== Comissionamento (pessoas, valores e condomínios inventados) =====
   O mês anterior ao de hoje, aprovado em todos os setores. As regras (percentuais, prazos) NÃO vêm daqui:
   ficam na própria ferramenta, que não está no repositório. "logins": id do usuário do portal de cada pessoa. */
function compAnterior(agora) { const d = new Date(agora.getFullYear(), agora.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
const cnpjFicticio = (i) => `12.345.678/00${String(10 + i).padStart(2, '0')}-0${i % 10}`;

/* relatório de garantia da Vouch (fictício), no mesmo texto do PDF de antecipação, para os contratos que esperam valores */
function relatorioGarantia(agora = new Date()) {
  const comp = compAnterior(agora), ref = `${comp.slice(5)}/${comp.slice(0, 4)}`;
  const brl = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return [[4, 48300, 3.5, 62.4], [3, 38900, 3.3, 54], [5, 55200, 2.9, 70]].map(([i, rateio, taxa, tarifa]) => `
    <section style="page-break-after:always;font:12px Arial;padding:20mm"><p>MYBLUE · RELATÓRIO DE GARANTIA CONSOLIDADO (EXEMPLO FICTÍCIO)</p>
    <p>Condomínio Cond. ${CONDS[i]} - CNPJ ${cnpjFicticio(i)}</p>
    <h3>Resumo da Antecipação - ${ref} (Venc. 10/${ref})</h3>
    <p>Total Rateio: R$ ${brl(rateio)}</p><p>(-) Tarifa Bancária R$ ${brl(tarifa)}</p>
    <p>(-) Taxa de Serviço (${String(taxa).replace('.', ',')} %) R$ ${brl(rateio * taxa / 100)}</p></section>`).join('');
}

function comissionamento(agora = new Date(), logins = {}, diretoria = []) {
  const comp = compAnterior(agora);
  const dia = (n) => `${comp}-${String(n).padStart(2, '0')}`;
  const menos = (iso, n) => { const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
  const P = (id, nome, cargo, setor, regra, salario, extra) => ({ id, nome, cargo, setor, regra, salario, ativo: true, usuario: logins[id] || '', ...extra });
  const pessoas = [
    P('ger', 'Gil Martins', 'Gerente Comercial', 'Comercial', 'gerente', 5000),
    P('ex1', 'Elisa Costa', 'Executiva de Negócios', 'Comercial', 'executivo', 3000),
    P('ex2', 'Bruno Teles', 'Executivo de Negócios', 'Comercial', 'executivo', 3000),
    P('kc', 'Rita Moura', 'Coordenadora Comercial', 'Comercial', 'coordcom', 4000),
    P('cr1', 'Bruna Reis', 'Assistente de Crédito', 'Crédito', 'credito', 2000),
    P('cr2', 'Davi Rocha', 'Assistente de Crédito', 'Crédito', 'credito', 2000),
    P('cb1', 'Marcos Lima', 'Analista de Cobrança', 'Cobrança', 'cobranca', 2000),
    P('sc', 'Caio Mendes', 'Coordenador de Crédito', 'Supervisão', 'lideranca', 3200, { subordinados: ['cr1', 'cr2'] }),
    P('sb', 'Lia Souza', 'Coordenadora de Cobrança', 'Supervisão', 'lideranca', 3200, { subordinados: ['cb1'] }),
    P('mk', 'Mel Andrade', 'Designer', 'Marketing', 'metas', 3000),
    P('im1', 'Nina Prado', 'Assistente de Implantação', 'Implantação', 'implantacao', 2000, { emiteBoletos: true }),
    P('cs1', 'Téo Ramos', 'Analista de Sucesso do Cliente', 'Sucesso do Cliente', 'metas', 3000),
  ];
  const mesRef = `${comp.slice(5)}/${comp.slice(0, 4)}`;
  // contrato da planilha de implantações (Data contrato no mês); com vop = '' ainda espera o relatório de garantia da Vouch
  const V = (i, exec, d, vop, pct, tarifa) => ({ id: 'v' + i, cond: 'Cond. ' + CONDS[i], cnpj: cnpjFicticio(i), exec, tipo: 'Garantido', mesRef, vop, pct, tarifa, financ: 0,
    origem: vop === '' ? 'Planilha' : 'Planilha + Vouch', dataContrato: dia(d), obs: `contrato ${dia(d).split('-').reverse().join('/')}` });
  const credito = (base, falha) => [2, 5, 8, 10, 12, 15, 18, 20, 22, 25].map((d, i) => {
    const venc = dia(d);
    return { id: base + i, cond: 'Cond. ' + CONDS[(base === 'b' ? 0 : 10) + i], venc, envio: menos(venc, i === falha ? 6 : 12 + (i % 3)), exped: menos(venc, i === falha ? 5 : 11), obs: '' };
  });
  // 1º boleto dos condomínios novos (Implantação): vale até o dia do vencimento
  const boletosImplantacao = () => [3, 6, 9, 13, 17, 24].map((d, i) => ({ id: 'n' + i, cond: 'Cond. ' + CONDS[16 + i], venc: dia(d), envio: menos(dia(d), i === 4 ? -2 : 1 + (i % 3)), exped: '', obs: '' }));
  const mes = {
    comp, criadoEm: dia(1), fechado: false, status: { Comercial: 'aprovado', 'Crédito': 'aprovado', 'Cobrança': 'aprovado', 'Supervisão': 'aprovado', Marketing: 'aprovado', 'Implantação': 'aprovado', 'Sucesso do Cliente': 'aprovado' },
    metasCom: { equipe: { contratos: 6, vop: 310000 }, exec: { ex1: { contratos: 3, vop: 150000 }, ex2: { contratos: 3, vop: 160000 } }, coord: { kc: { vop: 130000, contratos: 2 } } },
    // indicação de parceiro da coordenação comercial marcada em dois condomínios; a coordenadora também vende (V6)
    comercial: [V(0, 'ex1', 3, 92400, 0.028, 132), { ...V(1, 'ex1', 8, 71200, 0.031, 96), coordInc: { kc: true } }, V(4, 'ex1', 20, '', '', 0),
      { ...V(2, 'ex2', 5, 64800, 0.026, 88), coordInc: { kc: true } }, V(3, 'ex2', 14, '', '', 0), V(5, 'ex2', 22, '', '', 0), V(6, 'kc', 12, 41000, 0.032, 58)],
    vendasGerente: {}, credito: { cr1: credito('b', 7), cr2: credito('d', -1), im1: boletosImplantacao() },
    cobranca: { cb1: [12, 7, 30, 4, 18, 9, 22, 5].map((ini, i) => ({ id: 'm' + i, cond: 'Cond. ' + CONDS[4 + i], venc: String([5, 10, 15][i % 3]), inad: '', devIni: ini, devAtual: i === 3 ? 4 : Math.round(ini * 0.55), obs: '' })) },
    implantacao: {}, manual: {}, satisf: {}, ajustes: [], log: [],
    metas: { cs1: [
      { id: 's1', tipo: 'num', nome: 'Churn da base', meta: 0.02, alc: 0.01, sentido: '<=', fmt: 'pct', pct: 0.08 },
      { id: 's2', tipo: 'num', nome: 'Indicações', meta: 15, alc: 17, sentido: '>=', fmt: '', pct: 0.08 },
      { id: 's3', tipo: 'num', nome: 'Cross-selling', meta: 4, alc: 2, sentido: '>=', fmt: '', pct: 0.08 },
      { id: 's4', tipo: 'num', nome: 'Valor em financiamentos', meta: 90000, alc: 76000, sentido: '>=', fmt: 'brl', pct: 0.08 },
      { id: 's5', tipo: 'num', nome: 'Reuniões com clientes', meta: 10, alc: 11, sentido: '>=', fmt: '', pct: 0.08 },
      { id: 's6', tipo: 'base', nome: 'Comissão sobre financiamentos', pct: 0.004, baseDe: 3, alc: '' },
    ], mk: [
      { id: 'k1', tipo: 'num', nome: 'Peças entregues', meta: 60, alc: 71, sentido: '>=', fmt: '', pct: 0.08 },
      { id: 'k2', tipo: 'num', nome: 'Entregas no prazo', meta: 0.85, alc: 0.92, sentido: '>=', fmt: 'pct', pct: 0.08 },
      { id: 'k3', tipo: 'num', nome: 'Retrabalho', meta: 0.1, alc: 0.14, sentido: '<=', fmt: 'pct', pct: 0.08 },
    ] },
  };
  const cadastro = { versao: 1, pessoas, execPorCnpj: {}, anual: {}, diretoria };
  return { comp, chaves: { 'comissao:cadastro': JSON.stringify(cadastro), [`comissao:mes:${comp}`]: JSON.stringify(mes), 'comissao:meses': JSON.stringify([comp]), 'comissao:ultimo': comp } };
}

/* um demonstrativo pronto (como a ferramenta envia para "Minhas comissões"), para o vídeo da tela das pessoas */
function demonstrativo({ nome, cargo, setor, comp, titulo, nota, linhas, total }) {
  const [a, m] = comp.split('-');
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const terco = Math.ceil(linhas.length / 3);
  const col = (l) => `<table><thead><tr><th>Condomínio</th><th>Meta</th></tr></thead><tbody>${l.map(([c, ok]) => `<tr><td>${c}</td><td class="${ok ? 'ok' : 'no'}">${ok ? 'Bateu' : 'Faltou'}</td></tr>`).join('')}</tbody></table>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Demonstrativo de comissão</title><style>
body{margin:0;background:#e9eef2;font:10.5px/1.4 Helvetica,Arial,sans-serif;color:#1f2d3a}.rel{max-width:210mm;margin:18px auto;background:#fff;box-shadow:0 2px 14px rgba(19,50,58,.14)}
.top{background:#1d4a6e;color:#fff;padding:14mm 16mm 6mm;display:flex;justify-content:space-between;border-bottom:3mm solid #2f6fa3}.top h1{font-size:17px;margin:0}.top .s{font-size:9px;opacity:.85;margin-top:4px}.top .d{text-align:right;font-size:9.5px;line-height:1.9}
.c{padding:7mm 16mm 10mm}.n{font-size:18px;font-weight:700;color:#1d4a6e;margin:0}.cg{color:#5b6b78}.t{background:#2f6fa3;color:#fff;margin:12px 0 14px;padding:9px 14px;display:flex;justify-content:space-between;align-items:center}.t b{font-size:10px}.t .v{font-size:20px;font-weight:700}
h4{color:#1d4a6e;font-size:11.5px;margin:14px 0 2px}.nt{color:#5b6b78;font-size:9px;margin:0 0 7px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:0 8px;align-items:start}
table{width:100%;border-collapse:collapse;font-size:9.3px}th{background:#1d4a6e;color:#fff;padding:5px 6px;text-align:left}td{padding:4px 6px;border-bottom:1px solid #e3e9ee}.ok{color:#1d8a52;font-weight:700}.no{color:#c0392b;font-weight:700}
.sub{background:#e3edf6;border:1px solid #b9cde0;padding:6px 8px;display:flex;justify-content:space-between;font-weight:700;color:#1d4a6e;margin-top:4px;font-size:9.5px}.r{border-top:1px solid #cfd8df;margin:24px 16mm 0;padding:4px 0 12px;display:flex;justify-content:space-between;color:#8494a1;font-size:8px}
@media print{@page{size:A4;margin:0}body{background:#fff}.rel{margin:0;box-shadow:none;max-width:none;width:210mm;min-height:297mm}}
</style></head><body><section class="rel"><div class="top"><div><h1>PRESTAÇÃO DE CONTAS DE COMISSÃO</h1><div class="s">Demonstrativo individual de remuneração variável</div></div><div class="d">Competência: ${meses[+m - 1]} / ${a}<br>${setor}</div></div>
<div class="c"><p class="n">${nome}</p><div class="cg">${cargo} · Setor: ${setor}</div><div class="t"><div><b>COMISSÃO A RECEBER</b></div><div class="v">${brl(total)}</div></div>
<h4>${titulo}</h4><p class="nt">${nota}</p><div class="g">${[0, 1, 2].map((k) => col(linhas.slice(k * terco, (k + 1) * terco))).join('')}</div>
<div class="sub"><span>Metas batidas: ${linhas.filter((l) => l[1]).length} / ${linhas.length}</span><span>Subtotal ${brl(total)}</span></div></div>
<div class="r"><span>Exemplo com dados fictícios · Portal MyBlue</span><span>${nome} · pág. 1</span></div></section></body></html>`;
}

module.exports = { boletos, sindicos, extracaoVouch, prestacao, implantacoes, moradores, viagens, comissionamento, relatorioGarantia, demonstrativo, compAnterior, CONDS };

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

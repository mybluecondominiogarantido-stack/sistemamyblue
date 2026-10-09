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

module.exports = { boletos, sindicos, extracaoVouch, CONDS };

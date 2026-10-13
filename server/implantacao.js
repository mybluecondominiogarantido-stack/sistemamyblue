'use strict';
/*
 * Planilha "Controle de Implantações" → condomínios novos para a carteira.
 *
 * A planilha tem título e blocos por ano, cada um com a própria linha de títulos
 * (Nº FORMULÁRIO, CONDOMÍNIO, ESTADO, DIA VENC., ADM., DATA CONTRATO, ENVIO…).
 * A vigência de cada condomínio é o mês/ano da DATA CONTRATO.
 */
const { lerPlanilha } = require('./planilha');
const { semAcento } = require('./carteira');

const titulo = (s) => semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

// colunas procuradas na linha de títulos (aceita variações de escrita)
const COLUNAS = {
  form: ['N FORMULARIO', 'NO FORMULARIO', 'FORMULARIO'],
  nome: ['CONDOMINIO'],
  uf: ['ESTADO', 'UF'],
  venc: ['DIA VENC', 'DIA VENCIMENTO', 'VENCIMENTO'],
  adm: ['ADM', 'ADMINISTRADORA'],
  data: ['DATA CONTRATO'],
  envio: ['ENVIO E MAIL FISICO', 'ENVIO', 'FORMA DE ENVIO'],
  implantado: ['IMPLANTADO POR'],
  executivo: ['EXECUTIVO', 'EXECUTIVO DE NEGOCIOS'],
  cnpj: ['CNPJ', 'CNPJ DO CONDOMINIO'],
  razao: ['RAZAO SOCIAL'],
  obs: ['OBS', 'OBSERVACOES'],
};

/* nome para comparar com a carteira: sem acento, sem "Condomínio/Edifício/Residencial…", II → 2 */
const ROMANOS = { I: '1', II: '2', III: '3', IV: '4', V: '5', VI: '6', VII: '7', VIII: '8' };
const COMUNS = new Set(['CONDOMINIO', 'CONDOMINIUM', 'EDIFICIO', 'RESIDENCIAL', 'RESIDENCE', 'CONJUNTO', 'CLUB', 'CLUBE', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'LE', 'LA', 'THE']);
const chaveNome = (s) => titulo(s).split(' ').map((w) => ROMANOS[w] || w).filter((w) => !COMUNS.has(w)).join(' ');

/* sugestão de apelido: tira Condomínio/Edifício/Residencial do começo e acerta maiúsculas */
const MINUSC = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
function apelido(nome) {
  const t = limpar(nome).replace(/^((condom[ií]nio|edif[ií]cio|residencial|conjunto)\s+)+/i, '').replace(/^[-\s]+/, '') || limpar(nome);
  return t.split(' ').map((w, i) => {
    if (/^[IVX]+$/i.test(w) && w.length <= 4) return w.toUpperCase();
    const l = w.toLowerCase();
    return i && MINUSC.has(l) ? l : l.charAt(0).toUpperCase() + l.slice(1);
  }).join(' ');
}

/* "Sim. Renove" → "RENOVE"; "Não" → "" */
function administradora(v) {
  const s = limpar(v).replace(/^(sim|n[aã]o)\s*[.,:-]?\s*/i, '').replace(/^administradora\s+/i, '');
  return s.toUpperCase();
}
const ENVIO = { AMBOS: 'IMPRESSO/E-MAIL', DIGITAL: 'E-MAIL', 'E MAIL': 'E-MAIL', EMAIL: 'E-MAIL', FISICO: 'IMPRESSO', IMPRESSO: 'IMPRESSO' };
const envio = (v) => ENVIO[titulo(v)] || limpar(v).toUpperCase();

/* CNPJ da planilha: 14 dígitos com dígito verificador certo. O Excel às vezes tira os zeros da frente
   (completa) ou escreve em notação científica "6,60363E+13" (perde dígitos: não dá para usar). */
function digitoCnpj(base) {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += +base[base.length - 1 - i] * ((i % 8) + 2);
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}
const cnpjValido = (d) => /^\d{14}$/.test(d) && !/^(\d)\1+$/.test(d) && digitoCnpj(d.slice(0, 12)) === +d[12] && digitoCnpj(d.slice(0, 13)) === +d[13];
function lerCnpj(v) {
  const s = limpar(v);
  if (!s) return { cnpj: '', aviso: '' };
  if (/e\+\d+$/i.test(s)) return { cnpj: '', aviso: `CNPJ cortado pelo Excel (${s}): digite o CNPJ` };
  const d = s.replace(/\D/g, '');
  if (/[a-z]{3}/i.test(s.replace(/cnpj/i, '')) && d.length < 11) return { cnpj: '', aviso: `sem CNPJ na planilha: ${s}` };
  const cheio = d.padStart(14, '0');
  if (d.length >= 11 && d.length <= 14 && cnpjValido(cheio)) return { cnpj: `${cheio.slice(0, 2)}.${cheio.slice(2, 5)}.${cheio.slice(5, 8)}/${cheio.slice(8, 12)}-${cheio.slice(12)}`, aviso: '' };
  return { cnpj: '', aviso: `CNPJ inválido na planilha (${s}): confira` };
}

/* "15/10/2026", "2026-10-15" ou número de série do Excel → { dia, vigencia: "10/2026" } */
function dataContrato(v) {
  const s = limpar(v);
  if (!s) return null;
  let d, m, a;
  let x = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (x) [d, m, a] = [+x[1], +x[2], x[3].length === 2 ? 2000 + +x[3] : +x[3]];
  else if ((x = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) [a, m, d] = [+x[1], +x[2], +x[3]];
  else if (/^\d{5}(\.\d+)?$/.test(s)) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000);
    [a, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const mm = String(m).padStart(2, '0');
  return { dia: `${String(d).padStart(2, '0')}/${mm}/${a}`, vigencia: `${mm}/${a}` };
}

function indices(cab) {
  const t = cab.map(titulo);
  const idx = {};
  for (const [campo, nomes] of Object.entries(COLUNAS)) {
    idx[campo] = -1;
    for (const n of nomes) {
      const i = t.findIndex((c) => c === n);
      if (i >= 0) { idx[campo] = i; break; }
    }
    // "ADM." vira "ADM"; se não achou igual, aceita o que começa com o nome (ex.: "ENVIO E-MAIL/FÍSICO")
    if (idx[campo] < 0) idx[campo] = t.findIndex((c) => nomes.some((n) => c.startsWith(n + ' ') || c === n));
  }
  return idx;
}
const ehCabecalho = (linha) => { const t = linha.map(titulo); return t.includes('CONDOMINIO') && t.includes('DATA CONTRATO'); };

/* Lê a planilha e devolve os condomínios com a vigência e o motivo de ficarem de fora, se for o caso. */
function interpretarImplantacao(buf) {
  const linhas = lerPlanilha(buf);
  if (!linhas.some(ehCabecalho)) throw new Error('Não achei as colunas CONDOMÍNIO e DATA CONTRATO. Envie a planilha "Controle de Implantações".');
  const itens = [];
  const vistos = new Map();
  let idx = null;
  linhas.forEach((l, n) => {
    if (ehCabecalho(l)) { idx = indices(l); return; }
    if (!idx) return;
    const pega = (c) => (idx[c] >= 0 ? limpar(l[idx[c]]) : '');
    const nome = pega('nome');
    // linha vazia ou só o ano do bloco ("2027")
    if (!nome || /^\d{4}$/.test(nome)) return;
    const dc = dataContrato(pega('data'));
    const item = {
      linha: n + 1,
      formulario: pega('form').replace(/\.0$/, ''),
      nome_planilha: nome,
      nome: apelido(nome),
      comarca: pega('uf').toUpperCase(),
      vencimento: pega('venc').replace(/\.0$/, '').replace(/^0+(?=\d)/, ''),
      administradora: administradora(pega('adm')),
      forma_envio: envio(pega('envio')),
      implantado_por: pega('implantado'),
      executivo: pega('executivo'),
      ...(() => { const c = lerCnpj(pega('cnpj')); return { cnpj: c.cnpj, cnpj_aviso: c.aviso }; })(),
      razao_social: pega('razao').toUpperCase(),
      obs: pega('obs'),
      data_contrato: dc ? dc.dia : pega('data'),
      vigencia: dc ? dc.vigencia : null,
      ignorar: null,
    };
    if (/desconsiderar/i.test(item.obs)) item.ignorar = 'marcado para desconsiderar na planilha';
    else if (!dc) item.ignorar = 'sem DATA CONTRATO';
    else {
      const k = chaveNome(nome) + '|' + item.comarca;
      if (vistos.has(k)) item.ignorar = `repetido na planilha (linha ${vistos.get(k)})`;
      else vistos.set(k, item.linha);
    }
    itens.push(item);
  });
  return itens;
}

/* Marca cada item como novo, já existente na carteira ou parecido com um existente (mesma UF). */
function compararComCarteira(itens, carteira) {
  const porUf = new Map();
  for (const c of carteira) {
    const k = c.comarca.toUpperCase();
    if (!porUf.has(k)) porUf.set(k, []);
    porUf.get(k).push({ ...c, chave: chaveNome(c.nome), compacta: chaveNome(c.nome).replace(/ /g, '') });
  }
  for (const it of itens) {
    const k = chaveNome(it.nome_planilha);
    const lista = porUf.get(it.comarca) || [];
    const igual = lista.find((c) => c.compacta === k.replace(/ /g, '') || c.compacta === chaveNome(it.nome).replace(/ /g, ''));
    if (igual) { it.carteira = { situacao: 'existe', id: igual.id, codigo: igual.codigo, nome: igual.nome }; continue; }
    // parecido: um nome contém o outro ou diferem em pouca coisa
    const pal = new Set(k.split(' ').filter((w) => w.length > 2));
    let melhor = null;
    let nota = 0;
    for (const c of lista) {
      const cp = c.chave.split(' ').filter((w) => w.length > 2);
      if (!cp.length || !pal.size) continue;
      const comuns = cp.filter((w) => pal.has(w) || [...pal].some((p) => p.length > 4 && w.length > 4 && (p.startsWith(w.slice(0, 4)) && Math.abs(p.length - w.length) <= 1))).length;
      const s = comuns / Math.max(cp.length, pal.size);
      if (s > nota) { nota = s; melhor = c; }
    }
    it.carteira = melhor && nota >= 0.66 ? { situacao: 'parecido', id: melhor.id, codigo: melhor.codigo, nome: melhor.nome } : { situacao: 'novo' };
  }
  return itens;
}

module.exports = { interpretarImplantacao, compararComCarteira, dataContrato, apelido, chaveNome, lerCnpj, cnpjValido };

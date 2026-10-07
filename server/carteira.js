'use strict';
/*
 * Carteira de condomínios: campos, leitura do CSV da planilha "Carteira de Condomínios"
 * (como o Excel salva: ponto e vírgula, Windows-1252) e exportação no mesmo formato.
 *
 * Os dados da carteira não ficam no repositório: entram pela aba Carteira do portal.
 */

// pessoas que cuidam de cada condomínio (coluna da planilha → campo no banco).
// setor: o ticket aberto para esse setor sobre o condomínio vai direto para essa pessoa
const FUNCOES = [
  { campo: 'analista_cobranca', rotulo: 'Analista de cobrança', coluna: 'ANALISTA ADMINISTRATIVA', setor: 'Cobrança' },
  { campo: 'analista_extrajudicial', rotulo: 'Analista extrajudicial (ApoioCob)', coluna: 'ANALISTA EXTRAJUDICIAL', setor: null },
  { campo: 'assistente_credito', rotulo: 'Assistente de crédito', coluna: 'ASSISTENTE CRÉDITO', setor: 'Crédito' },
];

// todos os campos editáveis, na ordem das colunas da planilha
const CAMPOS = [
  { campo: 'codigo', coluna: 'ID', max: 30 },
  { campo: 'situacao', coluna: 'SITUAÇÃO', max: 30 },
  { campo: 'comarca', coluna: 'COMARCA', max: 30 },
  { campo: 'nome', coluna: 'CONDOMÍNIO', max: 160 },
  { campo: 'vencimento', coluna: 'VENCIMENTO', max: 40 },
  ...FUNCOES.map((f) => ({ campo: f.campo, coluna: f.coluna, max: 120, pessoa: true })),
  { campo: 'administradora', coluna: 'ADMINISTRADORA', max: 120 },
  { campo: 'forma_envio', coluna: 'FORMA DE ENVIO', max: 60 },
  { campo: 'inicio_contrato', coluna: 'INÍCIO DO CONTRATO', data: true },
  { campo: 'razao_social', coluna: 'RAZÃO SOCIAL', max: 200 },
  { campo: 'cnpj', coluna: 'CNPJ', max: 20 },
  { campo: 'observacoes', coluna: 'OBSERVAÇÕES', max: 4000 },
];
const SITUACOES = ['ATIVO', 'DISTRATADO'];

const semAcento = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const cabecalho = (s) => semAcento(s).toUpperCase().replace(/\s+/g, ' ').trim();
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/* UTF-8 quando for válido; senão Windows-1252 (padrão do Excel em português) */
function decodificar(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

/* CSV com ; ou , (o que aparecer mais no cabeçalho), aspas e quebras de linha dentro das aspas */
function lerCsv(texto) {
  const fim = texto.indexOf('\n');
  const primeira = fim < 0 ? texto : texto.slice(0, fim);
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ',';
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;
  const fecha = () => { linha.push(campo); campo = ''; if (linha.some((x) => x.trim())) linhas.push(linha); linha = []; };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fecha();
    } else campo += c;
  }
  fecha();
  return linhas;
}

/* "05/03/2024", "2024-03-05" → "2024-03-05"; vazio → null; inválido → undefined */
function data(v) {
  const s = limpar(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return undefined;
  const ano = m[3].length === 2 ? '20' + m[3] : m[3];
  const d = new Date(Date.UTC(+ano, +m[2] - 1, +m[1]));
  if (d.getUTCMonth() !== +m[2] - 1) return undefined;
  return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/* 14 dígitos → 00.000.000/0000-00; outro formato fica como foi digitado */
function cnpj(v) {
  const s = limpar(v);
  const d = s.replace(/\D/g, '');
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : s;
}

/* Valida e normaliza um condomínio (cadastro, edição ou linha do CSV). Só mexe nos campos presentes. */
function normalizar(b) {
  const out = {};
  for (const c of CAMPOS) {
    if (b[c.campo] === undefined) continue;
    if (c.data) {
      const d = data(b[c.campo]);
      if (d === undefined) return { erro: 'Data de início do contrato inválida (use dd/mm/aaaa).' };
      out[c.campo] = d;
    } else if (c.campo === 'observacoes') {
      out[c.campo] = String(b[c.campo] == null ? '' : b[c.campo]).trim().slice(0, c.max);
    } else {
      let v = limpar(b[c.campo]).slice(0, c.max);
      // a planilha usa pessoas, situação e UF em maiúsculas ("EDUARDO SOUSA - 4663")
      if (c.pessoa || c.campo === 'situacao' || c.campo === 'comarca') v = v.toUpperCase();
      if (c.campo === 'cnpj') v = cnpj(v);
      out[c.campo] = v;
    }
  }
  if (out.nome !== undefined && !out.nome) return { erro: 'Informe o nome do condomínio.' };
  if (out.codigo !== undefined && !out.codigo) return { erro: 'Informe o ID do condomínio.' };
  if (out.situacao !== undefined && !out.situacao) out.situacao = 'ATIVO';
  return { dados: out };
}

/* Lê o arquivo e devolve os condomínios. Erro com mensagem para o usuário se faltar o essencial. */
function interpretar(buf) {
  const linhas = lerCsv(decodificar(buf));
  if (linhas.length < 2) throw new Error('O arquivo não tem condomínios. Envie o CSV da Carteira de Condomínios.');
  const cab = linhas[0].map(cabecalho);
  const indice = {};
  for (const c of CAMPOS) indice[c.campo] = cab.indexOf(cabecalho(c.coluna));
  if (indice.nome < 0) throw new Error('Não achei a coluna CONDOMÍNIO no arquivo. Confira se é o CSV da Carteira de Condomínios (separado por ponto e vírgula).');
  if (indice.codigo < 0) throw new Error('Não achei a coluna ID no arquivo: ela identifica cada condomínio.');
  const condominios = [];
  const avisos = [];
  const vistos = new Set();
  linhas.slice(1).forEach((l, i) => {
    const bruto = {};
    for (const c of CAMPOS) if (indice[c.campo] >= 0) bruto[c.campo] = l[indice[c.campo]];
    if (!limpar(bruto.nome) && !limpar(bruto.codigo)) return;
    const n = normalizar(bruto);
    const linha = i + 2;
    if (n.erro) return avisos.push(`Linha ${linha}: ${n.erro}`);
    if (vistos.has(n.dados.codigo)) return avisos.push(`Linha ${linha}: ID ${n.dados.codigo} repetido, ficou a primeira.`);
    vistos.add(n.dados.codigo);
    condominios.push(n.dados);
  });
  if (!condominios.length) throw new Error('O arquivo não tem condomínios preenchidos.');
  return { condominios, avisos };
}

const aspas = (v) => (/[;"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
const dataBr = (d) => {
  if (!d) return '';
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const [a, m, dia] = s.split('-');
  return `${dia}/${m}/${a}`;
};

/* CSV no mesmo formato da planilha (abre no Excel e pode ser importado de volta) */
function exportar(linhas) {
  const cab = CAMPOS.map((c) => c.coluna).join(';');
  const corpo = linhas.map((l) => CAMPOS.map((c) => aspas(c.data ? dataBr(l[c.campo]) : String(l[c.campo] == null ? '' : l[c.campo]))).join(';'));
  return '﻿' + [cab, ...corpo].join('\r\n') + '\r\n';
}

/* ===================== responsável do condomínio nos tickets ===================== */
// "CHAYANNE FREITAS - 4624" → "chayanne freitas" (sem acento e sem o ramal)
const chavePessoa = (s) => semAcento(s).toLowerCase().replace(/\s*-\s*\d+\s*$/, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

/* Acha, entre as pessoas da equipe do setor, quem corresponde ao nome da carteira. Precisa ser uma só:
   nome igual, todas as palavras da carteira no nome do portal, ou primeiro + último nome iguais. */
function acharPessoa(nomeCarteira, membros) {
  const alvo = chavePessoa(nomeCarteira);
  if (!alvo) return null;
  const pal = alvo.split(' ');
  const lista = membros.map((m) => ({ ...m, chave: chavePessoa(m.nome), palavras: chavePessoa(m.nome).split(' ') }));
  const regras = [
    (m) => m.chave === alvo,
    (m) => pal.every((p) => m.palavras.includes(p)),
    (m) => pal.length > 1 && m.palavras[0] === pal[0] && m.palavras[m.palavras.length - 1] === pal[pal.length - 1],
  ];
  for (const regra of regras) {
    const achados = lista.filter(regra);
    if (achados.length === 1) return achados[0];
    if (achados.length > 1) return null; // ambíguo: fica com o líder
  }
  return null;
}

/* Responsável pela carteira em cada setor: Map setor_id → função. */
async function funcoesPorSetor(db) {
  const setores = (await db.q('SELECT id, nome FROM setores')).rows;
  const m = new Map();
  for (const f of FUNCOES) {
    const s = f.setor && setores.find((x) => x.nome === f.setor);
    if (s) m.set(s.id, f);
  }
  return m;
}

/* Quem recebe o ticket deste condomínio neste setor.
   → { id, nome, carteira } se a pessoa da carteira está na equipe; { id: null, carteira } se não achou; null se o setor não usa carteira. */
async function responsavelDoCondominio(db, condominioId, setorId) {
  if (!condominioId) return null;
  const f = (await funcoesPorSetor(db)).get(setorId);
  if (!f) return null;
  const c = await db.um(`SELECT ${f.campo} AS pessoa FROM condominios WHERE id = $1`, [condominioId]);
  if (!c || !c.pessoa) return null;
  const membros = (await db.q('SELECT u.id, u.nome FROM setor_membros sm JOIN usuarios u ON u.id = sm.usuario_id WHERE sm.setor_id = $1 AND u.ativo', [setorId])).rows;
  const achado = acharPessoa(c.pessoa, membros);
  return achado ? { id: achado.id, nome: achado.nome, carteira: c.pessoa } : { id: null, carteira: c.pessoa };
}

module.exports = { acharPessoa, funcoesPorSetor, responsavelDoCondominio, FUNCOES, CAMPOS, SITUACOES, interpretar, normalizar, exportar, lerCsv };

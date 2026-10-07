'use strict';
/*
 * Carteira de condomínios: a planilha "Carteira de Condomínios" (CSV exportado do Excel/SharePoint)
 * importada pela administração. Cada condomínio traz as pessoas que cuidam dele em cada função
 * (ex.: ASSISTENTE CRÉDITO, ANALISTA EXTRAJUDICIAL). A administração liga cada coluna a um setor e,
 * ao abrir um ticket para esse setor sobre o condomínio, ele vai direto para a pessoa da carteira.
 *
 * Os dados da carteira não ficam no repositório: entram só pelo upload no portal.
 */

// colunas de pessoas e o setor que cada uma atende quando a carteira é importada pela 1ª vez
const COLUNAS_PADRAO = { 'ASSISTENTE CREDITO': 'Crédito', 'ANALISTA EXTRAJUDICIAL': 'Cobrança' };
// cabeçalhos que são pessoas da carteira (o restante são dados do condomínio)
const COLUNA_PESSOA = /^(ANALISTA|ASSISTENTE|AUXILIAR|COORDENADOR|GERENTE|SUPERVISOR|RESPONSAVEL)\b/;

const semAcento = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const cabecalho = (s) => semAcento(s).toUpperCase().replace(/\s+/g, ' ').trim();
// "CHAYANNE FREITAS - 4624" → "chayanne freitas" (tira o ramal)
const nomePessoa = (s) => semAcento(s).toLowerCase().replace(/\s*-\s*\d+\s*$/, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/* UTF-8 quando for válido; senão Windows-1252 (padrão do Excel em português) */
function decodificar(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

/* CSV com ; ou , (o que aparecer mais no cabeçalho), aspas e quebras de linha dentro das aspas */
function lerCsv(texto) {
  const primeira = texto.slice(0, texto.indexOf('\n') >>> 0);
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ',';
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas;
}

/* Lê o arquivo e devolve os condomínios. Erro com mensagem para o usuário se faltar o essencial. */
function interpretar(buf) {
  const linhas = lerCsv(decodificar(buf));
  if (linhas.length < 2) throw new Error('O arquivo não tem condomínios. Envie o CSV da Carteira de Condomínios.');
  const cab = linhas[0].map(cabecalho);
  const col = (nome) => cab.indexOf(nome);
  const iNome = col('CONDOMINIO');
  if (iNome < 0) throw new Error('Não achei a coluna CONDOMÍNIO no arquivo. Confira se é o CSV da Carteira de Condomínios (separado por ponto e vírgula).');
  const pessoas = cab.map((h, i) => [h, i]).filter(([h]) => COLUNA_PESSOA.test(h));
  const pega = (l, nome) => { const i = col(nome); return i < 0 ? '' : limpar(l[i]); };
  const condominios = [];
  const vistos = new Set();
  for (const l of linhas.slice(1)) {
    const nome = limpar(l[iNome]);
    if (!nome) continue;
    // sem ID na planilha, o condomínio é reconhecido pelo nome + comarca
    const codigo = pega(l, 'ID') || 'nome:' + nomePessoa(nome) + '|' + pega(l, 'COMARCA').toUpperCase();
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);
    const p = {};
    for (const [h, i] of pessoas) if (limpar(l[i])) p[h] = limpar(l[i]);
    condominios.push({
      codigo, nome,
      situacao: (pega(l, 'SITUACAO') || 'ATIVO').toUpperCase(),
      comarca: pega(l, 'COMARCA'),
      razao_social: pega(l, 'RAZAO SOCIAL'),
      cnpj: pega(l, 'CNPJ'),
      administradora: pega(l, 'ADMINISTRADORA'),
      pessoas: p,
    });
  }
  if (!condominios.length) throw new Error('O arquivo não tem condomínios preenchidos.');
  return { condominios, colunas: pessoas.map(([h]) => h) };
}

/* Substitui a carteira pela do arquivo. Quem saiu do arquivo fica fora da lista (os tickets antigos continuam ligados a ele). */
async function importar(db, buf) {
  const { condominios, colunas } = interpretar(buf);
  await db.tx(async (t) => {
    await t.q('UPDATE condominios SET na_carteira = FALSE');
    for (const c of condominios) {
      await t.q(`INSERT INTO condominios (codigo, nome, situacao, comarca, razao_social, cnpj, administradora, pessoas, na_carteira, atualizado_em)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, TRUE, now())
        ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, situacao = EXCLUDED.situacao, comarca = EXCLUDED.comarca, razao_social = EXCLUDED.razao_social,
          cnpj = EXCLUDED.cnpj, administradora = EXCLUDED.administradora, pessoas = EXCLUDED.pessoas, na_carteira = TRUE, atualizado_em = now()`,
      [c.codigo, c.nome, c.situacao, c.comarca, c.razao_social, c.cnpj, c.administradora, JSON.stringify(c.pessoas)]);
    }
    // colunas novas entram ligadas ao setor padrão (se houver); as já configuradas não mudam
    for (const coluna of colunas) {
      const setor = COLUNAS_PADRAO[coluna] ? await t.um('SELECT id FROM setores WHERE nome = $1', [COLUNAS_PADRAO[coluna]]) : null;
      await t.q('INSERT INTO condominio_colunas (coluna, setor_id) VALUES ($1, $2) ON CONFLICT (coluna) DO NOTHING', [coluna, setor ? setor.id : null]);
    }
  });
  return { condominios: condominios.length, ativos: condominios.filter((c) => c.situacao === 'ATIVO').length, colunas };
}

/* Acha a pessoa da equipe do setor que corresponde ao nome da planilha.
   Precisa ser única: nome completo igual, todas as palavras da planilha no nome do portal,
   ou primeiro + último nome iguais. */
function acharPessoa(nomePlanilha, membros) {
  const alvo = nomePessoa(nomePlanilha);
  if (!alvo) return null;
  const pal = alvo.split(' ');
  const regras = [
    (m) => m.chave === alvo,
    (m) => pal.every((p) => m.palavras.includes(p)),
    (m) => pal.length > 1 && m.palavras[0] === pal[0] && m.palavras[m.palavras.length - 1] === pal[pal.length - 1],
  ];
  for (const regra of regras) {
    const achados = membros.filter(regra);
    if (achados.length === 1) return achados[0];
    if (achados.length > 1) return null; // ambíguo: deixa para o líder
  }
  return null;
}

/* Prepara a busca de responsáveis: colunas ligadas a setores e as equipes ativas desses setores. */
async function carregarRegras(db) {
  const colunas = (await db.q('SELECT coluna, setor_id FROM condominio_colunas WHERE setor_id IS NOT NULL ORDER BY coluna')).rows;
  const membros = (await db.q(`SELECT sm.setor_id, u.id, u.nome FROM setor_membros sm JOIN usuarios u ON u.id = sm.usuario_id WHERE u.ativo`)).rows
    .map((m) => ({ ...m, chave: nomePessoa(m.nome), palavras: nomePessoa(m.nome).split(' ') }));
  const porSetor = new Map();
  for (const c of colunas) {
    if (!porSetor.has(c.setor_id)) porSetor.set(c.setor_id, { colunas: [], membros: membros.filter((m) => m.setor_id === c.setor_id) });
    porSetor.get(c.setor_id).colunas.push(c.coluna);
  }
  /* responsável da carteira para (condomínio, setor): { id, nome, planilha } | { id: null, planilha } | null (setor sem regra) */
  return function responsavel(cond, setorId) {
    const regra = porSetor.get(setorId);
    if (!regra || !cond) return null;
    const pessoas = cond.pessoas || {};
    const coluna = regra.colunas.find((c) => pessoas[c]);
    if (!coluna) return null;
    const m = acharPessoa(pessoas[coluna], regra.membros);
    return m ? { id: m.id, nome: m.nome, planilha: pessoas[coluna], coluna } : { id: null, planilha: pessoas[coluna], coluna };
  };
}

async function responsavelAutomatico(db, condominioId, setorId) {
  if (!condominioId) return null;
  const cond = await db.um('SELECT id, nome, pessoas FROM condominios WHERE id = $1', [condominioId]);
  const r = (await carregarRegras(db))(cond, setorId);
  return r && r.id ? r : null;
}

module.exports = { interpretar, importar, carregarRegras, responsavelAutomatico, acharPessoa, nomePessoa, COLUNAS_PADRAO };

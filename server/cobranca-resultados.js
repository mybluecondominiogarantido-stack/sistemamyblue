'use strict';
/*
 * Resultado da Cobrança para a Gestão de Premiações, lido do Acompanhamento de Resultados (no lugar da planilha
 * "Controle de cobrança" que o coordenador enviava em Minhas Premiações).
 *
 * O Acompanhamento grava no banco de documentos (adaptador claude-db):
 *   lote/<comp>__<analista>__<n>  itens[cod] = { r, cong, ant, antD, d } — o condomínio apurado na importação
 *   mes/<comp>__<cod>             gravação da primeira versão (vale só para a competência que ainda não tem lote)
 *   reg/<comp>__<cod>             { k, anMes, dec } — analista trocada só naquele mês e decisões de acordo
 *   ret/<comp>__<cod>             { k, lista:[{u}] } — unidades retiradas do inicial pela supervisão
 *   comp/<comp>                   { dataCorte, fechado }
 * e aplica na tela, ao carregar, a analista do mês, as decisões de acordo e as retiradas. Aqui é a mesma conta,
 * para a premiação sair igual ao que a analista vê em "Minha carteira".
 */

const MODULO_ACOMPANHAMENTO = 'acompanhamento-de-resultados';

const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const chave = (r) => norm(r.razao) + '|' + r.comp;
const copia = (v) => JSON.parse(JSON.stringify(v));
const ordemUn = (x, y) => x.localeCompare(y, 'pt-BR', { numeric: true });

function situacao(r) {
  return r.ini === 0 ? 'sem_inad' : (r.res >= 0 ? 'na_meta' : (!r.janelaAberta ? 'nao_batido' : (r.diasRestantes <= 7 ? 'atencao' : 'andamento')));
}

/* decisão da supervisão sobre um acordo: confirmado conta como pago, descartado volta a ficar em aberto */
function aplicarDecisao(r, unidade, decisao) {
  const a = (r.acordos || []).find((x) => x.unidade === unidade); if (!a) return;
  const antes = new Set(r.emAberto); r.acordos.filter((x) => x.conta).forEach((x) => antes.add(x.unidade));
  a.decisao = decisao; a.conta = decisao ? decisao === 'confirmado' : a.origem === 'automatico';
  const com = new Set(r.acordos.filter((x) => x.conta).map((x) => x.unidade));
  r.emAberto = [...antes].filter((u) => !com.has(u)).sort(ordemUn);
  r.atual = r.emAberto.length; r.rec = r.ini - r.atual; r.res = Math.round((r.rec - r.meta) * 10) / 10;
}

/* unidades retiradas do inicial: saem da lista inicial, do em aberto e dos recebidos, e a meta é refeita */
function aplicarRetiradas(r, lista) {
  const fora = new Set((lista || []).map((x) => x && x.u));
  if (!fora.size) return;
  r.iniLista = (r.iniLista || []).filter((u) => !fora.has(u)); r.emAberto = (r.emAberto || []).filter((u) => !fora.has(u));
  r.recebidos = (r.recebidos || []).filter((u) => !fora.has(u));
  r.ini = r.iniLista.length; r.atual = r.emAberto.length; r.rec = r.ini - r.atual;
  r.meta = Math.round(r.ini * 0.3 * 10) / 10; r.res = Math.round((r.rec - r.meta) * 10) / 10; r.pctIni = r.tab ? r.ini / r.tab : 0;
}

/* competências que o Acompanhamento tem (as que têm resultado gravado), da mais recente para a mais antiga */
function competencias(docs) {
  const info = {}, comResultado = new Set();
  for (const d of docs) {
    if (!d.dados) continue;
    if (d.colecao === 'comp') info[d.doc_id] = d.dados;
    else if ((d.colecao === 'lote' || d.colecao === 'mes') && d.dados.comp) comResultado.add(d.dados.comp);
  }
  return [...comResultado].sort().reverse().map((c) => {
    const m = info[c] || {};
    return { competencia: c, fechado: !!m.fechado, fechado_em: (m.fechado && m.fechado.em) || null, data_corte: m.dataCorte || null };
  });
}

/* resultado de uma competência, por analista: só os condomínios apurados entram na premiação */
function resultadoCobranca(docs, comp, hoje = new Date().toISOString().slice(0, 10)) {
  const itens = new Map(), velhos = new Map(), reg = {}, ret = {};
  let info = null, comLote = false;
  for (const d of docs) {
    const x = d.dados;
    if (!x) continue;
    if (d.colecao === 'comp' && d.doc_id === comp) info = x;
    else if (d.colecao === 'lote' && x.comp === comp && x.itens) { comLote = true; for (const [cod, it] of Object.entries(x.itens)) itens.set(cod, it); }
    else if (d.colecao === 'mes' && x.comp === comp && x.cod && x.r) velhos.set(x.cod, x);
    else if (d.colecao === 'reg' && x.k) reg[x.k] = x;
    else if (d.colecao === 'ret' && x.k) ret[x.k] = x.lista;
  }
  if (!comLote) for (const [cod, it] of velhos) itens.set(cod, it);
  const fechado = !!(info && info.fechado);
  const porAnalista = new Map();
  let aguardando = 0, semBoletos = 0;
  for (const it of itens.values()) {
    if (!it || !it.r) continue;
    const r = copia(it.r);
    r.comp = r.comp || comp;
    const g = reg[chave(r)];
    if (g && g.anMes) r.analista = g.anMes;
    if (r.status === 'aguardando') { aguardando++; continue; }
    if (r.status !== 'apurado') { semBoletos++; continue; }
    if (g && g.dec) for (const [u, v] of Object.entries(g.dec)) { const a = (r.acordos || []).find((y) => y.unidade === u); if (a && a.decisao !== v) aplicarDecisao(r, u, v); }
    aplicarRetiradas(r, ret[chave(r)]);
    r.janelaAberta = !fechado && !!r.fim && hoje <= r.fim;
    r.diasRestantes = r.janelaAberta ? Math.round((Date.parse(r.fim) - Date.parse(hoje)) / 864e5) : 0;
    const nome = String(r.analista || '').trim() || 'Sem analista';
    if (!porAnalista.has(nome)) porAnalista.set(nome, []);
    porAnalista.get(nome).push({
      nome: r.nome || r.razao || '', razao: r.razao || '', uf: r.uf || '', venc_cadastro: r.vencCad == null ? '' : String(r.vencCad),
      vencimento: r.ve || '', fim_janela: r.fim || '', inicial: r.ini, pct_inicial: r.pctIni, meta: r.meta, atual: r.atual, recebidos: r.rec,
      resultado: r.res, situacao: situacao(r), janela_aberta: r.janelaAberta,
    });
  }
  const analistas = [...porAnalista].map(([nome, condominios]) => ({
    nome, condominios: condominios.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.nome.localeCompare(b.nome, 'pt-BR')),
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return {
    competencia: comp, fechado, fechado_em: (info && info.fechado && info.fechado.em) || null, data_corte: (info && info.dataCorte) || null,
    atualizado_em: (info && info.atualizadoEm) || null, analistas, aguardando, sem_boletos: semBoletos,
  };
}

module.exports = { MODULO_ACOMPANHAMENTO, competencias, resultadoCobranca, norm };

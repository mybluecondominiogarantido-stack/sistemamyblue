'use strict';
/*
 * Resposta das skills do Claude colada inteira no portal (caixa "Colar resultado da skill").
 *
 * Lê o que as skills leitura-inadimplencia-myblue e leitura-convencao-myblue devolvem (docs/credito/skills) e separa o
 * que vai para cada campo dos dados do analista: lançamentos, data de emissão, campos da convenção (com página e
 * trecho), observações jurídicas, próximos passos e ressalvas. Aceita o texto em Markdown (botão Copiar do Claude) ou
 * copiado da tela (tabelas viram tabulação). Nada é gravado aqui: o portal preenche a tela e o analista confere.
 */
const { lerRelatorioColado } = require('./colar');
const { normalizarData } = require('./motor');

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const limpar = (s) => String(s || '').replace(/\*\*|__|`/g, '').trim().replace(/^["“”']+|["“”']+$/g, '').trim();
const naoConsta = (s) => !s || /^(nao consta|nao informad|nenhuma?|—|-|n\/a)\b/.test(semAcento(s));

const ehItem = (l) => /^\s*([-•*–]|\d+[.)])\s+/.test(l);

// seções conhecidas das duas skills (título sem acento → chave)
const SECOES = [
  [/^observacoes juridicas/, 'juridicas'], [/^proximos passos/, 'passos'], [/^ressalvas/, 'ressalvas'],
  [/^avisos/, 'avisos'], [/^alertas para o analista/, 'avisos'], [/^conferencias/, 'conferencias'],
  [/^candidatos/, 'assertiva'], [/^lancamentos/, 'lancamentos'], [/^resumo/, 'resumo'], [/^campos para o portal/, 'campos'],
  [/^textos do retorno/, 'textos'],
];

/* título de seção: "## 3. Textos do retorno", "**Observações jurídicas** — …", "Próximos passos:" ou, copiado da tela,
   a linha que começa pelo nome de uma seção conhecida */
function secaoDe(linha) {
  const t = linha.trim();
  if (/^\s*[-•*–]\s+/.test(t)) return null;
  const marcado = /^#{1,6}\s/.test(t) || /^\*\*[^*]+\*\*/.test(t) || /^[^:•\-*|;]{3,40}:$/.test(t);
  const titulo = /^\*\*[^*]+\*\*/.test(t) ? t.match(/^\*\*([^*]+)\*\*/)[1] : t.replace(/^#+\s*/, '');
  const s = semAcento(limpar(titulo)).replace(/^\d+[.)]\s*/, '');
  const achou = SECOES.find(([re]) => re.test(s));
  if (achou && (marcado || t.length <= 120)) return achou[1];
  return marcado ? 'outra' : null;
}

const textoItem = (l) => limpar(l.replace(/^\s*([-•*–]|\d+[.)])\s+/, ''));

const CAMPOS_CONV = [
  [/^registro$/, 'registro'], [/^(n[ºo°.]*\s*de\s*)?unidades/, 'uh'], [/^multa/, 'multa'], [/^foro/, 'foro'],
  [/^cartorio/, 'cartorio'], [/^clausula/, 'clausula'],
];

function registroDe(v) {
  const s = semAcento(v);
  if (/sem registro|nao registrad|autenticac/.test(s)) return 'nenhum';
  if (/rtd|titulos e documentos/.test(s)) return 'RTD';
  if (/imoveis|\bri\b|livro 3/.test(s)) return 'RI';
  if (/cartorio/.test(s)) return 'cartorio';
  return '';
}
const numero = (v) => {
  const m = String(v || '').match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
};

/* linhas de tabela: "| a | b | c |" (Markdown) ou "a\tb\tc" (copiado da tela) */
function celulas(linha) {
  if (linha.includes('|')) return linha.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(limpar);
  if (linha.includes('\t')) return linha.split('\t').map(limpar);
  return null;
}

function lerRespostaSkill(texto) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n');
  const out = {
    relatorio: {}, convencao: null, textos: {}, ressalvas: [], avisos: [], assertiva: [], achados: [],
    lancamentos: null,
  };
  const juridicas = [], passos = [], conferencias = [];
  const fontes = {};
  const conv = {};
  const planilha = [];
  let secao = null;
  let emBloco = false;

  for (const bruta of linhas) {
    const l = bruta.trim();
    if (/^```/.test(l)) { emBloco = !emBloco; continue; }
    // lançamentos: dentro do bloco de código ou soltos (copiado da tela), com 5 ou mais ";"
    if ((l.match(/;/g) || []).length >= 5) {
      if (!/^unidade\s*;/i.test(l)) planilha.push(l);
      continue;
    }
    if (emBloco || !l) continue;

    const s = secaoDe(l);
    if (s) {
      // "**Observações jurídicas** — texto" ou "Ressalvas: Nenhuma" na mesma linha
      secao = s;
      const resto = /^\*\*[^*]+\*\*/.test(l) ? limpar(l.replace(/^\*\*[^*]+\*\*\s*[—–:-]?\s*/, '')) : '';
      if (s === 'ressalvas' && resto && !naoConsta(resto)) out.ressalvas.push(...ressalvaDe(resto));
      continue;
    }
    const sem = semAcento(limpar(l));

    // resumo do relatório
    let m;
    if ((m = sem.match(/data de emissao[^0-9]*(\d{1,2}\/\d{1,2}\/\d{4})/))) out.relatorio.data_emissao = normalizarData(m[1]);
    if ((m = sem.match(/detalhado por competencia\s*:?\s*(sim|nao)/))) out.relatorio.tem_competencia = m[1] === 'sim';
    if ((m = sem.match(/traz o nome dos devedores\s*:?\s*(sim|nao)/))) out.relatorio.tem_nomes = m[1] === 'sim';
    if ((m = sem.match(/taxa ordinaria vigente\s*:?\s*(.+)$/))) out.avisos.push(`Taxa ordinária vigente no relatório: ${limpar(l).replace(/^.*?vigente\s*:?\s*/i, '')}`);

    // tabela de campos da convenção
    const cel = celulas(l);
    if (cel && cel.length >= 2) {
      if (/^:?-{2,}/.test(cel[0])) continue;
      const nome = semAcento(cel[0]).replace(/\s+no portal$/, '');
      const campo = (CAMPOS_CONV.find(([re]) => re.test(nome)) || [])[1];
      if (campo) {
        const valor = cel[1] || '';
        if (campo === 'registro') conv.registro = registroDe(valor);
        else if (campo === 'uh') conv.uh = naoConsta(valor) ? null : numero(valor);
        else if (campo === 'multa') conv.multa_pct = naoConsta(valor) ? null : numero(valor);
        else if (campo === 'foro') conv.foro = naoConsta(valor) ? '' : valor;
        else if (campo === 'cartorio') conv.cartorio = naoConsta(valor) ? '' : valor;
        else if (campo === 'clausula') conv.clausula_restritiva = naoConsta(valor) ? '' : valor;
        const pagina = numero(cel[2]);
        const trecho = cel[3] && !naoConsta(cel[3]) ? cel[3] : '';
        if (pagina || trecho) fontes[campo] = { pagina, trecho };
      }
      continue;
    }

    // itens das seções de texto
    const item = ehItem(l) ? textoItem(l) : limpar(l);
    if (!item) continue;
    if (secao === 'juridicas') { if (!naoConsta(item)) juridicas.push(item); } else if (secao === 'passos') { if (!/^nenhum passo/.test(semAcento(item))) passos.push(item); } else if (secao === 'ressalvas') { if (!naoConsta(item)) out.ressalvas.push(...ressalvaDe(item)); } else if (secao === 'avisos') out.avisos.push(item);
    else if (secao === 'conferencias') conferencias.push(item);
    else if (secao === 'assertiva') out.assertiva.push(item);
  }

  if (planilha.length) {
    out.lancamentos = lerRelatorioColado(planilha.join('\n'));
    out.lancamentos.texto = planilha.join('\n');
  }
  if (Object.keys(conv).length) out.convencao = { ...conv, origem: { skill: true, fontes } };
  if (juridicas.length) out.textos.observacoes_juridicas = juridicas;
  if (passos.length) out.textos.proximos_passos = passos;
  out.conferencias = conferencias;

  if (out.lancamentos) out.achados.push(`${out.lancamentos.linhas} lançamentos de ${out.lancamentos.unidades.length} unidades`);
  if (out.relatorio.data_emissao) out.achados.push('data de emissão');
  if (out.convencao) out.achados.push('campos da convenção');
  if (juridicas.length) out.achados.push(`${juridicas.length} observações jurídicas`);
  if (passos.length) out.achados.push(`${passos.length} próximos passos`);
  if (out.ressalvas.length) out.achados.push(`${out.ressalvas.length} ressalva(s)`);
  return out;
}

/* "ressalva — justificativa" → { texto, justificativa } */
function ressalvaDe(s) {
  const p = s.split(/\s+[—–]\s+|\s+-\s+/);
  return [{ texto: p[0].trim(), justificativa: p.slice(1).join(' — ').trim() }];
}

module.exports = { lerRespostaSkill, registroDe };

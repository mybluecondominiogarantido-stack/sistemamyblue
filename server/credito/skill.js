'use strict';
/*
 * Resposta das skills do Claude colada inteira no portal (caixa "Colar resultado da skill").
 *
 * Lê o que as skills leitura-inadimplencia-myblue e leitura-convencao-myblue devolvem (docs/credito/skills) e separa o
 * que vai para cada campo dos dados do analista: lançamentos, data de emissão, campos da convenção (com página e
 * trecho), observações jurídicas, próximos passos e ressalvas. Aceita o texto em Markdown (botão Copiar do Claude) ou
 * copiado da tela (tabelas viram tabulação). Nada é gravado aqui: o portal preenche a tela e o analista confere.
 *
 * O caminho certo é o bloco PORTAL MYBLUE que as skills escrevem no fim da resposta: uma etiqueta por destino, sem
 * adivinhação (formato em lerBlocoPortal). Sem o bloco, o portal tenta reconhecer o texto livre.
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
  [/^(tipo de )?registro(?! e matr)/, 'registro'], [/^(n[ºo°.]*\s*de\s*)?unidades/, 'uh'], [/^multa/, 'multa'], [/^foro/, 'foro'],
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

/* colunas dos lançamentos pelo cabeçalho: a skill pode omitir uma coluna ou trocar a ordem */
const COLUNAS = [
  ['unidade', /^(unidade|apto|apartamento|un\b)/], ['titular', /^(titular|condomino|sacado|nome|devedor|proprietario)/], ['documento', /^(documento|cpf|cnpj|doc\b)/],
  ['competencia', /^(competencia|mes|referencia|ref\b)/], ['tipo', /^(tipo|historico|descricao)/], ['valor', /^(valor|principal)/], ['vencimento', /^venc/],
];
function mapaColunas(cels) {
  const nomes = cels.map((c) => semAcento(c));
  const idx = COLUNAS.map(([, re]) => nomes.findIndex((n) => re.test(n)));
  return idx[0] >= 0 && idx[3] >= 0 && idx[5] >= 0 ? idx : null;
}
const reordenar = (cels, idx) => idx.map((i) => (i >= 0 ? (cels[i] || '').trim() : '')).join(';');

const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
function dataDe(sem) {
  let m = sem.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (m) return normalizarData(m[1]);
  m = sem.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/);
  if (m && MESES[m[2]]) return `${m[3]}-${String(MESES[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/* linhas de tabela: "| a | b | c |" (Markdown) ou "a\tb\tc" (copiado da tela) */
function celulas(linha) {
  if (linha.includes('|')) return linha.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(limpar);
  if (linha.includes('\t')) return linha.split('\t').map(limpar);
  return null;
}

/*
 * Bloco PORTAL MYBLUE (pode vir em partes, um bloco por parte; as partes se somam):
 *   #PORTAL-MYBLUE v1
 *   [relatorio]            data_emissao: dd/mm/aaaa · detalhado_por_competencia: sim|não · traz_nomes: sim|não
 *                          periodo_inicio: mm/aaaa · sistema: … · taxa_vigente: …
 *   [lancamentos]          Unidade;Titular;Documento;Competência;Tipo;Valor;Vencimento (uma linha por lançamento)
 *   [convencao]            registro: RI|cartorio|RTD|nenhum · unidades · multa_pct · foro · cartorio · clausula_restritiva
 *                          fonte_registro / fonte_unidades / fonte_multa / fonte_foro: p. N | trecho
 *   [observacoes_analise]  texto para a página 1 (tendência, recorrência, acordos), depois do texto automático
 *   [observacoes_juridicas] [proximos_passos] [avisos] [assertiva]   um item por linha ("- …")
 *   [ressalvas]            - ressalva — justificativa
 *   #FIM
 */
const ETIQUETAS = { relatorio: 'relatorio', lancamentos: 'lancamentos', convencao: 'convencao', observacoes_analise: 'complemento', observacoes_da_analise: 'complemento',
  tendencias: 'complemento', observacoes_juridicas: 'juridicas', parecer_juridico: 'juridicas', proximos_passos: 'passos', ressalvas: 'ressalvas', avisos: 'avisos', assertiva: 'assertiva' };
const simNao = (v) => (/^s/.test(semAcento(v)) ? true : /^n/.test(semAcento(v)) ? false : undefined);

function lerBlocoPortal(texto) {
  const out = { relatorio: {}, convencao: null, textos: {}, ressalvas: [], avisos: [], assertiva: [], achados: [], lancamentos: null, conferencias: [], bloco: true };
  const conv = {}, fontes = {}, planilha = [], juridicas = [], passos = [], complemento = [];
  let colunas = null;
  let dentro = false, sec = null;
  for (const bruta of String(texto || '').replace(/\r/g, '').split('\n')) {
    const l = bruta.trim();
    if (/^#\s*PORTAL[- ]MYBLUE/i.test(l)) { dentro = true; sec = null; continue; }
    if (/^#\s*FIM\b/i.test(l)) { dentro = false; continue; }
    if (!dentro || !l || /^```/.test(l)) continue;
    const et = l.match(/^\[([^\]]+)\]$/);
    if (et) { sec = ETIQUETAS[semAcento(et[1]).replace(/\s+/g, '_')] || null; continue; }
    const kv = l.match(/^([A-Za-zÀ-ú_ ]{2,40}):\s*(.*)$/);
    const chave = kv ? semAcento(kv[1]).replace(/\s+/g, '_') : '';
    const valor = kv ? limpar(kv[2]) : '';
    const item = ehItem(l) ? textoItem(l) : limpar(l);
    if (sec === 'relatorio' && kv) {
      if (chave === 'data_emissao') out.relatorio.data_emissao = dataDe(semAcento(valor)) || undefined;
      else if (/^detalhado/.test(chave)) out.relatorio.tem_competencia = simNao(valor);
      else if (/^traz_nomes|^nomes/.test(chave)) out.relatorio.tem_nomes = simNao(valor);
      else if (chave === 'periodo_inicio') { const m = valor.match(/(\d{1,2})\/(\d{4})/); if (m) out.relatorio.periodo_inicio = `${m[2]}-${m[1].padStart(2, '0')}`; }
      else if (chave === 'sistema') out.relatorio.sistema = valor;
      else if (chave === 'taxa_vigente' && valor) out.avisos.push(`Taxa ordinária vigente no relatório: ${valor}`);
    } else if (sec === 'lancamentos') {
      const cels = l.split(l.includes(';') ? ';' : '\t');
      const cab = mapaColunas(cels);
      if (cab && /^unidade/.test(semAcento(cels[0]))) { colunas = cab; continue; }
      if (cels.length >= 4) planilha.push(colunas ? reordenar(cels, colunas) : cels.join(';'));
    } else if (sec === 'convencao' && kv) {
      const vazio = naoConsta(valor);
      if (chave === 'registro') conv.registro = ['RI', 'cartorio', 'RTD', 'nenhum'].includes(valor) ? valor : registroDe(valor);
      else if (/^unidades|^uh/.test(chave)) conv.uh = vazio ? null : numero(valor);
      else if (/^multa/.test(chave)) conv.multa_pct = vazio ? null : numero(valor);
      else if (chave === 'foro') conv.foro = vazio ? '' : valor;
      else if (/^cartorio/.test(chave)) conv.cartorio = vazio ? '' : valor;
      else if (/^clausula/.test(chave)) conv.clausula_restritiva = vazio ? '' : valor;
      else if (/^fonte_/.test(chave)) {
        const campo = { fonte_registro: 'registro', fonte_unidades: 'uh', fonte_uh: 'uh', fonte_multa: 'multa', fonte_foro: 'foro' }[chave];
        const [pag, ...resto] = valor.split('|');
        if (campo) fontes[campo] = { pagina: numero(pag), trecho: limpar(resto.join('|')) };
      }
    } else if (sec === 'complemento') complemento.push(item);
    else if (sec === 'juridicas') { if (!naoConsta(item)) juridicas.push(item); }
    else if (sec === 'passos') { if (!/^nenhum passo/.test(semAcento(item))) passos.push(item); }
    else if (sec === 'ressalvas') { if (!naoConsta(item)) out.ressalvas.push(...ressalvaDe(item)); }
    else if (sec === 'avisos') out.avisos.push(item);
    else if (sec === 'assertiva') { if (!naoConsta(item)) out.assertiva.push(item); }
  }
  if (planilha.length) { out.lancamentos = lerRelatorioColado(planilha.join('\n')); out.lancamentos.texto = planilha.join('\n'); }
  if (Object.keys(conv).length) out.convencao = { ...conv, origem: { skill: true, fontes } };
  // registro, multa e foro o portal já põe nas ressalvas e alertas pelos campos da convenção: não repete
  if (conv.registro) out.ressalvas = out.ressalvas.filter((x) => !/registr/i.test(x.texto));
  if (complemento.length) out.textos.complemento_status = complemento.join(' ');
  if (juridicas.length) out.textos.observacoes_juridicas = juridicas;
  if (passos.length) out.textos.proximos_passos = passos;
  Object.keys(out.relatorio).forEach((k) => out.relatorio[k] === undefined && delete out.relatorio[k]);
  resumir(out);
  return out;
}

function resumir(out) {
  const t = out.textos;
  if (out.lancamentos) out.achados.push(`${out.lancamentos.linhas} lançamentos de ${out.lancamentos.unidades.length} unidades`);
  if (out.relatorio.data_emissao) out.achados.push('data de emissão');
  if (out.convencao) out.achados.push('campos da convenção');
  if (t.complemento_status) out.achados.push('observações da análise');
  if (t.observacoes_juridicas) out.achados.push(`${t.observacoes_juridicas.length} observações jurídicas`);
  if (t.proximos_passos) out.achados.push(`${t.proximos_passos.length} próximos passos`);
  if (out.ressalvas.length) out.achados.push(`${out.ressalvas.length} ressalva(s)`);
}

function lerRespostaSkill(texto) {
  if (/#\s*PORTAL[- ]MYBLUE/i.test(String(texto || ''))) return lerBlocoPortal(texto);
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
  let colunas = null; // cabeçalho dos lançamentos (planilha com ";" ou tabela)
  let colunasTabela = null;

  for (const bruta of linhas) {
    const l = bruta.trim();
    if (/^```/.test(l)) { emBloco = !emBloco; continue; }
    // lançamentos: no bloco de código ou soltos (copiado da tela), separados por ";"
    const pv = (l.match(/;/g) || []).length;
    if (pv >= 5 || (pv >= 3 && (emBloco || colunas))) {
      const cels = l.split(';');
      const cab = mapaColunas(cels);
      if (cab && /^unidade/.test(semAcento(cels[0]))) { colunas = cab; continue; }
      planilha.push(colunas ? reordenar(cels, colunas) : l);
      continue;
    }
    if (emBloco || !l) { if (!l) colunasTabela = null; continue; }
    // lançamentos em tabela (Markdown ou tabulação) com colunas Unidade, Competência e Valor
    const celT = celulas(l);
    if (celT && celT.length >= 4) {
      const cab = mapaColunas(celT);
      if (cab) { colunasTabela = cab; continue; }
      if (colunasTabela) { if (!/^:?-{2,}/.test(celT[0])) planilha.push(reordenar(celT, colunasTabela)); continue; }
    } else colunasTabela = null;

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
    // aceita "Campo: valor", "| Campo | valor |" e "Campo — valor"
    if (/data de (emissao|atualizacao)/.test(sem) && !out.relatorio.data_emissao) { const d = dataDe(sem.replace(/^.*?data de (emissao|atualizacao)/, '')); if (d) out.relatorio.data_emissao = d; }
    if ((m = sem.match(/detalhado por competencia[\s:|*—–-]*(sim|nao)/))) out.relatorio.tem_competencia = m[1] === 'sim';
    if ((m = sem.match(/(?:traz o )?nomes? dos devedores[\s:|*—–-]*(sim|nao)/))) out.relatorio.tem_nomes = m[1] === 'sim';
    if ((m = sem.match(/periodo coberto[\s:|*—–-]*(\d{1,2})\/(\d{4})/))) out.relatorio.periodo_inicio = `${m[2]}-${m[1].padStart(2, '0')}`;
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
  resumir(out);
  return out;
}

/* "ressalva — justificativa" → { texto, justificativa } */
function ressalvaDe(s) {
  const p = s.split(/\s+[—–]\s+|\s+-\s+/);
  return [{ texto: p[0].trim(), justificativa: p.slice(1).join(' — ').trim() }];
}

module.exports = { lerRespostaSkill, lerBlocoPortal, registroDe };

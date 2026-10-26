'use strict';
/*
 * Leitura dos PDFs da Análise de Crédito pela API Claude: o relatório de inadimplência (unidades e lançamentos por
 * competência) e a convenção (registro, unidades, multa, foro, cláusulas). A IA só extrai: não calcula percentual nem
 * decide status (isso é do motor de regras). Cada dado volta com a página de origem e um trecho, para o analista
 * conferir. O resultado é uma sugestão: entra nos dados do analista, que confere antes de calcular.
 *
 * Configuração (variáveis do servidor):
 *   ANTHROPIC_API_KEY        chave da API (sem ela, a leitura fica desligada e o analista cola a planilha)
 *   CREDITO_IA_MODELO        modelo (padrão claude-opus-5-5)
 *   CREDITO_IA_ESFORCO       low | medium | high (padrão medium)
 */

const MODELO = 'claude-opus-5-5';
const NULO = (tipo, descricao) => ({ anyOf: [{ type: tipo }, { type: 'null' }], ...(descricao ? { description: descricao } : {}) });
const TIPOS = ['ordinaria', 'extra', 'agua_gas', 'acordo', 'multa', 'juros', 'correcao', 'honorarios', 'fundo_reserva', 'outro'];
const FONTE = { type: 'object', additionalProperties: false, required: ['pagina', 'trecho'], properties: { pagina: NULO('integer'), trecho: { type: 'string' } } };

const ESQUEMA_RELATORIO = {
  type: 'object', additionalProperties: false,
  required: ['sistema', 'data_emissao', 'fonte_emissao', 'tem_competencia', 'tem_nomes', 'periodo_inicio', 'legivel', 'observacoes', 'unidades'],
  properties: {
    sistema: { type: 'string', description: 'Sistema ou administradora que gerou o relatório (ex.: Superlógica, Gestart, ClasseCon, ASPRED, SERVNAC), ou "" se não der para saber.' },
    data_emissao: NULO('string', 'Data de emissão/atualização do relatório, AAAA-MM-DD.'),
    fonte_emissao: FONTE,
    tem_competencia: { type: 'boolean', description: 'true se os débitos aparecem por mês de competência ou por vencimento; false se só há o total por devedor.' },
    tem_nomes: { type: 'boolean', description: 'true se o relatório traz o nome dos devedores.' },
    periodo_inicio: NULO('string', 'Primeira competência coberta pelo relatório (AAAA-MM), se o relatório declarar um período.'),
    legivel: { type: 'boolean', description: 'false se o PDF está ilegível ou cortado a ponto de comprometer os valores.' },
    observacoes: { type: 'array', items: { type: 'string' }, description: 'Problemas encontrados: páginas ilegíveis, totais que não batem, colunas ambíguas.' },
    unidades: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['unidade', 'titular', 'documento', 'tipo_pessoa', 'flag', 'espolio', 'pagina', 'lancamentos'],
        properties: {
          unidade: { type: 'string', description: 'Bloco e unidade como no relatório (ex.: "A-101", "Bl 2 Ap 304").' },
          titular: { type: 'string', description: 'Nome do devedor, ou "" se não houver.' },
          documento: { type: 'string', description: 'CPF ou CNPJ, se aparecer; senão "".' },
          tipo_pessoa: { type: 'string', enum: ['PF', 'PJ', ''] },
          flag: { type: 'string', enum: ['', 'acordo', 'juridico'], description: 'acordo: a unidade está em acordo/parcelamento (ex.: flag "A" no Gestart); juridico: marcada JURÍDICO.' },
          espolio: { type: 'boolean', description: 'true se o relatório escreve "espólio" para esta unidade.' },
          pagina: { type: 'integer', description: 'Página do PDF onde a unidade começa.' },
          lancamentos: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['competencia', 'vencimento', 'tipo', 'valor'],
              properties: {
                competencia: { type: 'string', description: 'AAAA-MM. Se o relatório só traz o vencimento, use o mês do vencimento.' },
                vencimento: NULO('string', 'AAAA-MM-DD, se houver.'),
                tipo: { type: 'string', enum: TIPOS },
                valor: { type: 'number', description: 'Valor PRINCIPAL do lançamento em reais (sem multa, juros e correção, que vão em lançamentos próprios).' },
              },
            },
          },
        },
      },
    },
  },
};

const ESQUEMA_CONVENCAO = {
  type: 'object', additionalProperties: false,
  required: ['registro', 'cartorio', 'matricula', 'uh', 'foro', 'multa_pct', 'clausula_restritiva', 'regras_taxa_extra', 'observacoes', 'fontes'],
  properties: {
    registro: { type: 'string', enum: ['RI', 'cartorio', 'RTD', 'nenhum'], description: 'RI: Cartório de Registro de Imóveis (inclui Registro Auxiliar, Livro 3); cartorio: registrada em cartório sem dizer qual; RTD: só Títulos e Documentos; nenhum: sem registro.' },
    cartorio: { type: 'string' },
    matricula: { type: 'string', description: 'Número do registro/matrícula, se houver.' },
    uh: NULO('integer', 'Número de unidades autônomas do condomínio.'),
    foro: { type: 'string', description: 'Comarca do foro eleito, ou "".' },
    multa_pct: NULO('number', 'Multa por atraso em %, ex.: 2.'),
    clausula_restritiva: { type: 'string', description: 'Resumo de cláusula que limite garantidora ou empresa de cobrança, ou "".' },
    regras_taxa_extra: { type: 'string', description: 'Resumo das regras para taxa extra, ou "".' },
    observacoes: { type: 'array', items: { type: 'string' } },
    fontes: {
      type: 'object', additionalProperties: false, required: ['registro', 'uh', 'foro', 'multa'],
      properties: { registro: FONTE, uh: FONTE, foro: FONTE, multa: FONTE },
    },
  },
};

const INSTRUCOES = {
  relatorio: `Você extrai dados de relatórios de contas a receber / inadimplência de condomínios brasileiros para a MyBlue (garantidora de taxas condominiais).
Regras:
- Não calcule percentuais nem decida nada: só transcreva o que está no relatório.
- Um lançamento por débito em aberto de cada unidade e competência. Separe em lançamentos próprios: taxa ordinária (principal), taxa extra, água/gás, acordo/parcelamento, multa, juros, correção, honorários e fundo de reserva. "valor" é sempre o principal daquele item.
- Competência em AAAA-MM. Se o relatório mostra só o vencimento (dd/mm/aaaa), use o mês do vencimento como competência.
- Padrões conhecidos: BV Garantia/Gestart traz blocos por unidade com flag "A" (acordo → flag "acordo") e "JURÍDICO" (flag "juridico", continua no escopo). Beelive/ClasseCon separa por cabeçalho de unidade e a unidade continua entre páginas. ASPRED lista item a item. Superlógica (W003A) tem a coluna do principal explícita: use ela. SERVNAC traz a taxa extra por unidade/mês (ex.: "1.11 - TAXA EXTRA").
- Não invente unidades nem valores. Se não der para ler, registre em "observacoes" e marque "legivel": false.
- CPF tem 11 dígitos (PF); CNPJ 14 (PJ). Sem documento, deduza PF/PJ pelo nome só quando for óbvio (LTDA, S/A, construtora…); senão deixe "".`,
  convencao: `Você extrai dados da convenção de um condomínio brasileiro para a MyBlue (garantidora de taxas condominiais).
Regras:
- Identifique onde a convenção foi registrada: Cartório de Registro de Imóveis (inclui Registro Auxiliar, Livro 3) = "RI"; só em Registro de Títulos e Documentos = "RTD"; "cartório" sem dizer qual = "cartorio"; sem registro = "nenhum".
- Número de unidades autônomas, foro eleito, multa por atraso (%), cláusulas que limitem a contratação de garantidora ou empresa de cobrança e regras para taxa extra.
- Para registro, unidades, foro e multa, diga a página do PDF e copie um trecho curto que comprove.
- Não invente: o que não estiver na convenção fica "" ou null.`,
};

function criarExtrator(env = process.env, opcoes = {}) {
  // testes: opcoes.ler(tipo, pdf) substitui a chamada à API
  if (opcoes.ler) return { ativo: true, modelo: 'teste', ler: opcoes.ler };
  const chave = env.ANTHROPIC_API_KEY;
  if (!chave) return { ativo: false, modelo: null, ler: async () => { throw Object.assign(new Error('A leitura automática dos PDFs não está ligada: falta configurar ANTHROPIC_API_KEY no servidor.'), { status: 503 }); } };
  const sdk = require('@anthropic-ai/sdk');
  const Anthropic = sdk.default || sdk.Anthropic || sdk;
  const cliente = new Anthropic({ apiKey: chave, maxRetries: 2 });
  const modelo = env.CREDITO_IA_MODELO || MODELO;
  const esforco = ['low', 'medium', 'high'].includes(env.CREDITO_IA_ESFORCO) ? env.CREDITO_IA_ESFORCO : 'medium';

  async function ler(tipo, pdf) {
    if (!ESQUEMAS[tipo]) throw new Error('Tipo de documento sem leitura automática.');
    if (pdf.length > 30 * 1024 * 1024) throw Object.assign(new Error('O PDF passa de 30 MB: envie um arquivo menor ou divida o relatório.'), { status: 400 });
    // streaming: relatórios grandes geram respostas longas; a recusa por segurança cai no modelo recomendado (fallbacks)
    const stream = cliente.beta.messages.stream({
      model: modelo,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: INSTRUCOES[tipo],
      output_config: { effort: esforco, format: { type: 'json_schema', schema: ESQUEMAS[tipo] } },
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
          { type: 'text', text: tipo === 'relatorio' ? 'Extraia o relatório de inadimplência deste PDF.' : 'Extraia os dados desta convenção de condomínio.' },
        ],
      }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error('A IA não leu este documento. Lance os dados à mão (cole a planilha).');
    if (msg.stop_reason === 'max_tokens') throw new Error('O relatório é grande demais para ler de uma vez: divida o PDF ou cole a planilha.');
    const texto = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let dados;
    try { dados = JSON.parse(texto); } catch { throw new Error('A leitura voltou num formato inesperado. Tente de novo ou cole a planilha.'); }
    return { dados, uso: { modelo: msg.model, entrada: msg.usage.input_tokens, saida: msg.usage.output_tokens } };
  }
  return { ativo: true, modelo, ler };
}
const ESQUEMAS = { relatorio: ESQUEMA_RELATORIO, convencao: ESQUEMA_CONVENCAO };

/* o que a IA leu → formato dos dados do analista (relatorio / convencao do motor) */
function paraDadosAnalista(tipo, dados, documentoId) {
  if (tipo === 'relatorio') {
    return {
      data_emissao: dados.data_emissao || '', periodo_inicio: dados.periodo_inicio || '', tem_competencia: dados.tem_competencia !== false, tem_nomes: dados.tem_nomes !== false,
      sistema: dados.sistema || '', unidades: (dados.unidades || []).map((u) => ({
        unidade: u.unidade, titular: u.titular || '', documento: u.documento || '', tipo_pessoa: u.tipo_pessoa || '', flag: u.flag || null, espolio: !!u.espolio,
        fonte: { pagina: u.pagina }, lancamentos: (u.lancamentos || []).filter((l) => l.valor > 0).map((l) => ({ competencia: l.competencia, vencimento: l.vencimento || null, tipo: l.tipo, valor: l.valor })),
      })),
      origem: { ia: true, documento_id: documentoId, fonte_emissao: dados.fonte_emissao, observacoes: dados.observacoes || [], legivel: dados.legivel !== false },
    };
  }
  return {
    registro: dados.registro, cartorio: [dados.cartorio, dados.matricula].filter(Boolean).join(' · '), uh: dados.uh, foro: dados.foro || '', multa_pct: dados.multa_pct,
    clausula_restritiva: dados.clausula_restritiva || '', origem: { ia: true, documento_id: documentoId, fontes: dados.fontes, observacoes: dados.observacoes || [], regras_taxa_extra: dados.regras_taxa_extra || '' },
  };
}

module.exports = { criarExtrator, paraDadosAnalista, ESQUEMA_RELATORIO, ESQUEMA_CONVENCAO };

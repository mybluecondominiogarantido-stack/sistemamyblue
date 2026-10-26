'use strict';
/*
 * Retorno de Análise de Crédito: monta o DADOS do gerador canônico (server/credito/retorno/gerador_retorno.py) a partir
 * do resultado do motor de regras, gera o PDF (A4 paisagem, exatamente 4 páginas) e escreve o resumo executivo e o
 * e-mail de entrega. Os textos são montados aqui, de forma determinística, a partir do que o motor apurou; o analista
 * pode trocar as observações, as observações jurídicas e os próximos passos antes de gerar.
 *
 * O gerador roda em Python (ReportLab): PYTHON (padrão python3) precisa ter o reportlab instalado (o Dockerfile instala).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { fmtPct, fmtBRL, textoJanela } = require('./motor');

const GERADOR = path.join(__dirname, 'retorno', 'gerador_retorno.py');
const LOGO = path.join(__dirname, '..', '..', 'public', 'img', 'logo.png');
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* o gerador usa Paragraph do ReportLab: o texto vai como mini-HTML */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dataBR = (d) => (d ? d.split('-').reverse().join('/') : '');
const maiuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const mesLongo = (comp) => { const [a, m] = comp.split('-').map(Number); return `${maiuscula(MESES_LONGOS[m - 1])}/${a}`; };
const numBR = (v, casas = 0) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const uh = (v) => (Number.isInteger(v) ? String(v) : numBR(v, 2));
const plural = (n, um, varios) => `${uh(n)} ${n === 1 ? um : varios}`;

function nomeArquivo(razaoSocial, protocolo) {
  const nome = String(razaoSocial || 'Condominio').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^condom[ií]nio\s+/i, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `Retorno_Analise_Credito_${nome || 'Condominio'}_${protocolo}.pdf`;
}

/* ---------- textos da análise ---------- */

// meses que entram na média: o mês-base sem inadimplência não aparece (se nenhum tem, ficam os três, com 0%)
const consideradosDe = (r) => { const c = r.meses.filter((m) => !m.fora_da_media); return c.length ? c : r.meses; };
const qtdMeses = (n) => (n === 1 ? '1 mês considerado' : `${n} meses considerados`);
const textoMedia = (r) => {
  const c = consideradosDe(r);
  return c.length < r.meses.length ? `${textoJanela(c.map((m) => m.competencia))} (${qtdMeses(c.length)})` : r.janela.texto;
};

// "Convenção incompleta" vira frase ("Convenção incompleta."), para as ressalvas não se emendarem no texto
const frase = (t) => { const s = String(t || '').trim(); return !s || /[.!?;:]$/.test(s) ? s : `${s}.`; };
// nomes do relatório em maiúsculas ("MARIA DA SILVA") saem como nome próprio ("Maria da Silva")
const nomeProprio = (t) => String(t || '').replace(/\b[A-ZÀ-Ý][A-ZÀ-Ý´'.]+(?:\s+[A-ZÀ-Ý][A-ZÀ-Ý´'.]*)+\b/g,
  (nome) => nome.toLowerCase().replace(/(^|\s)(\S)/g, (m, e, c) => e + c.toUpperCase()).replace(/\s(D[aeo]s?|E)\s/g, (m) => m.toLowerCase()));

function textoDecisao(r) {
  const preco = r.precificacao ? `taxa administrativa de ${fmtPct(r.precificacao.taxa_adm)} e boleto de ${fmtBRL(r.precificacao.boleto)}` : '';
  switch (r.status.codigo) {
    case 'aprovada': return `O condomínio foi <b>aprovado</b>, com ${preco}.`;
    case 'ressalvas': return `O condomínio foi <b>aprovado com ressalvas</b>, com ${preco}.${r.diretoria ? ' A inadimplência acima de 35% exige a chancela da diretoria (CEO e Diretor Comercial).' : ''} ${r.ressalvas.filter((x) => x.codigo !== 'diretoria').map((x) => esc(frase(x.texto))).join(' ')}`.trim();
    case 'reprovada': return `O condomínio <b>não foi aprovado</b>: ${r.reprovacoes.map((x) => esc(x.texto.replace(/\.$/, ''))).join('; ')}.`;
    default: return `A análise está <b>pendente</b>: ${r.pendencias.map((x) => esc(x.mensagem.replace(/\.$/, ''))).join('; ')}.`;
  }
}

function observacoesStatus(r, ctx) {
  const f = ctx.formulario || {};
  const partes = [textoDecisao(r)];
  if (r.inad_media !== null) {
    partes.push(`A inadimplência média apurada foi de <b>${fmtPct(r.inad_media)}</b> (${fmtBRL(r.inad_media_rs)} por mês), sobre as competências de <b>${esc(textoMedia(r))}</b>${ctx.emissao ? `, com base no relatório emitido em ${dataBR(ctx.emissao)}` : ''}.`);
  }
  const e = r.escopo;
  if (e.uh_escopo !== null) {
    const fora = [];
    if (e.uh_isentas) fora.push(plural(e.uh_isentas, 'isenta', 'isentas'));
    const porMotivo = (m) => e.exclusoes.filter((x) => x.motivo === m).length;
    if (porMotivo('espolio')) fora.push(plural(porMotivo('espolio'), 'espólio', 'espólios'));
    if (porMotivo('retomada')) fora.push(plural(porMotivo('retomada'), 'retomada', 'retomadas'));
    if (porMotivo('abandono')) fora.push(plural(porMotivo('abandono'), 'em abandono ou litígio', 'em abandono ou litígio'));
    partes.push(`O escopo considera ${uh(e.uh_escopo)} das ${uh(e.uh_total)} unidades${fora.length ? ` (fora: ${fora.join(', ')})` : ''}.`);
  }
  partes.push(f.tipo_contratacao === 'portabilidade'
    ? `Trata-se de portabilidade${f.garantidora_atual ? ` da garantidora ${esc(f.garantidora_atual)}` : ''}.`
    : 'Trata-se de nova contratação, sem garantidora anterior.');
  if (r.valores.receita_liquida !== null && r.indicadores) {
    partes.push(`A receita líquida mensal é de ${fmtBRL(r.valores.receita_liquida)} e a exposição de caixa mensal estimada é de ${fmtBRL(r.indicadores.exposicao)}.`);
  }
  partes.push(esc(r.assertiva.texto));
  const conc = r.alertas.find((a) => a.codigo === 'concentracao');
  if (conc) partes.push(esc(conc.mensagem.replace(/^(\d+ unidades? concentra)/, 'Concentração: $1')));
  const tend = r.alertas.find((a) => a.codigo === 'tendencia_ascendente');
  if (tend) partes.push(esc(tend.mensagem));
  partes.push(r.divergencias.length
    ? `Divergência entre as fontes: ${r.divergencias.map((d) => esc(rotuloDivergencia(d))).join('; ')}.`
    : 'Não houve divergência entre o formulário, o relatório e a convenção.');
  for (const o of r.observacoes) if (/ajustad[oa] na análise/.test(o)) partes.push(esc(o));
  // o que o analista (ou a skill) acrescentou: tendência, recorrência, acordos
  const comp = (ctx.ajustesTexto || {}).complemento_status;
  if (comp) partes.push(esc(comp));
  return partes.join(' ');
}

const NOMES_FONTE = { formulario: 'formulário', relatorio: 'relatório', convencao: 'convenção', formulario_total: 'total no formulário', formulario_detalhe: 'detalhe do formulário' };
const NOMES_CAMPO = { uh_total: 'número de unidades', taxa_ordinaria: 'taxa ordinária', dia_vencimento: 'dia do vencimento', uh_isentas: 'unidades isentas', taxa_extra: 'taxa extra' };
function rotuloDivergencia(d) {
  const valores = Object.entries(d.valores).map(([fonte, v]) => `${NOMES_FONTE[fonte] || fonte} ${Array.isArray(v) ? v.join(', ') : typeof v === 'number' && d.campo === 'taxa_ordinaria' ? fmtBRL(v) : v}`).join(' × ');
  return `${NOMES_CAMPO[d.campo] || d.campo} (${valores}; vale: ${typeof d.usado === 'number' && d.campo === 'taxa_ordinaria' ? fmtBRL(d.usado) : d.usado})`;
}

function observacoesJuridicas(r) {
  const itens = [];
  for (const x of r.ressalvas) if (x.codigo !== 'diretoria') itens.push(x.texto);
  for (const a of r.alertas) if (['multa_acima_limite', 'foro', 'clausula_restritiva', 'portabilidade', 'extra_acima_aviso', 'extra_sem_ata'].includes(a.codigo)) itens.push(a.mensagem);
  for (const o of r.observacoes) if (/^Taxa extra|desconto de pontualidade/i.test(o)) itens.push(o);
  if (!r.escopo.exclusoes.length) itens.push('Não há unidades fora do escopo da garantia.');
  return itens.map(esc);
}

function proximosPassos(r, ctx) {
  const f = ctx.formulario || {};
  const passos = [];
  if (r.diretoria) passos.push('Aguardar a chancela da diretoria (CEO e Diretor Comercial) antes da apresentação ao condomínio.');
  const cod = new Set(r.ressalvas.map((x) => x.codigo));
  if (cod.has('convencao_ausente')) passos.push('Entregar a convenção do condomínio antes da assinatura do contrato.');
  if (cod.has('convencao_sem_registro_ri')) passos.push('Regularizar o registro da convenção no Cartório de Registro de Imóveis em até 90 dias.');
  if (f.custo_boleto_atual === undefined || f.custo_boleto_atual === null || f.custo_boleto_atual === '') passos.push('Confirmar o custo de boleto praticado hoje pelo condomínio (o comparativo considerou R$ 2,50 por unidade).');
  for (const x of f.taxas_extras || []) if (x.fim) passos.push(`Confirmar a permanência da taxa extra "${x.descricao || 'sem descrição'}" após ${String(x.fim).split('-').reverse().join('/')}.`);
  if (f.sem_cnpj) passos.push('Regularizar o CNPJ do condomínio em até 90 dias da primeira arrecadação; até lá, o repasse vai para a conta da administradora.');
  if (f.tipo_contratacao === 'portabilidade') passos.push('Alinhar com a garantidora atual a data de desligamento e as ações jurídicas em curso.');
  if (r.escopo.exclusoes.some((x) => x.motivo === 'espolio')) passos.push('Orientar o condomínio a direcionar a cobrança dos espólios ao inventário.');
  passos.push('Alinhar com o jurídico do condomínio as cobranças em andamento e o envio da carteira à MyBlue.');
  passos.push(`Assinar o contrato dentro da validade da proposta (até ${dataBR(r.validade_ate)}).`);
  return passos.map(esc);
}

/* ---------- DADOS do gerador ---------- */
function montarDados(r, ctx) {
  const f = ctx.formulario || {};
  const v = r.valores;
  const c = r.comparativo;
  const p = r.precificacao;
  const naMedia = consideradosDe(r);
  const mediaQtd = naMedia.length ? naMedia.reduce((s, m) => s + m.inadimplentes, 0) / naMedia.length : 0;
  const custoInformado = c && c.sem_myblue.custo_boleto_informado;
  const extra = v.extra_por_uh > 0 ? ` + taxa extra ${fmtBRL(v.extra_por_uh)}` : '';
  const agua = v.agua_gas_por_uh > 0 ? ` + água/gás ${fmtBRL(v.agua_gas_por_uh)}` : '';
  const ad = ctx.ajustesTexto || {};
  const dados = {
    protocolo: ctx.protocolo,
    data_analise: dataBR(r.hoje),
    razao_social: esc(f.razao_social || ''),
    cnpj: f.sem_cnpj ? 'Ainda não tem (em constituição)' : esc(f.cnpj || ''),
    executivo: esc(ctx.executivo || f.executivo?.nome || ''),
    status: r.status.rotulo,
    taxa_adm: p ? fmtPct(p.taxa_adm) : '—',
    boleto_myb: p ? fmtBRL(p.boleto) : '—',
    faixa: p && p.faixa ? `inadimplência até ${numBR(p.faixa.ate, 1)}% — ${fmtPct(p.faixa.taxa_adm)} ADM` : 'não se aplica',
    validade: `30 dias corridos (até ${dataBR(r.validade_ate)})`,
    observacoes_status: ad.observacoes_status ? esc(ad.observacoes_status) : observacoesStatus(r, ctx),
    comp: c ? {
      arrec_sem: fmtBRL(c.sem_myblue.arrecadacao), arrec_com: fmtBRL(c.com_myblue.arrecadacao),
      inad_sem: fmtBRL(c.sem_myblue.inadimplencia), inad_com: 'R$ 0,00 (garantido)',
      taxa_sem: 'R$ 0,00', taxa_com: fmtBRL(c.com_myblue.taxa_adm),
      bol_sem: `${fmtBRL(c.sem_myblue.boletos)}${custoInformado ? '' : ' *'}`, bol_com: fmtBRL(c.com_myblue.boletos),
      receb_sem: fmtBRL(c.sem_myblue.recebimento), receb_com: fmtBRL(c.com_myblue.recebimento),
      ganho_anual: fmtBRL(c.ganho_anual),
    } : Object.fromEntries(['arrec_sem', 'arrec_com', 'inad_sem', 'inad_com', 'taxa_sem', 'taxa_com', 'bol_sem', 'bol_com', 'receb_sem', 'receb_com', 'ganho_anual'].map((k) => [k, '—'])),
    receita_bruta: v.receita_bruta === null ? '—' : fmtBRL(v.receita_bruta),
    receita_liquida: v.receita_liquida === null ? '—' : fmtBRL(v.receita_liquida),
    meses_base: naMedia.map((m) => [mesLongo(m.competencia), String(m.inadimplentes), fmtBRL(m.valor), m.pct === null ? '—' : fmtPct(m.pct)]),
    rotulo_media: naMedia.length < r.meses.length ? `MÉDIA (${qtdMeses(naMedia.length).toUpperCase()})` : 'MÉDIA',
    inad_media_qtd: numBR(mediaQtd, Number.isInteger(mediaQtd) ? 0 : 1),
    inad_media_valor: r.inad_media_rs === null ? '—' : fmtBRL(r.inad_media_rs),
    inad_media_pct: fmtPct(r.inad_media),
    nota_base: v.receita_bruta === null ? '' : esc(`Receita bruta = ${uh(r.escopo.uh_escopo)} UH × ${fmtBRL(v.valor_por_uh)} (ordinária ${fmtBRL(v.taxa_ordinaria)}${extra}${agua}). Entra o principal da ordinária${extra ? ' e da taxa extra' : ''}; ficam fora multa, juros, correção, honorários e acordos.${v.desconto ? ` Receita líquida já com o desconto de pontualidade de ${fmtBRL(v.desconto)}.` : ''}${custoInformado || !c ? '' : ' * Custo de boleto não informado: considerado R$ 2,50 por unidade.'}`),
    nota_dias: r.janela.meses.length ? esc(naMedia.length < r.meses.length
      ? `Média de ${qtdMeses(naMedia.length)} (${textoJanela(naMedia.map((m) => m.competencia))}), com mais de 10 dias de vencidos na emissão do relatório${ctx.emissao ? ` (${dataBR(ctx.emissao)})` : ''}.`
      : `Meses-base ${textoJanela(r.janela.meses.map((m) => m.competencia))}: competências com mais de 10 dias de vencidas na emissão do relatório${ctx.emissao ? ` (${dataBR(ctx.emissao)})` : ''}.`) : '',
    receita_myb: r.indicadores ? fmtBRL(r.indicadores.receita_myblue) : '—',
    valor_antecipado: r.indicadores ? fmtBRL(r.indicadores.valor_antecipado) : '—',
    exposicao: r.indicadores ? fmtBRL(r.indicadores.exposicao) : '—',
    unidades_excluidas: r.escopo.exclusoes.map((x) => [esc(x.unidade), esc(motivoExclusao(x)), fmtBRL(x.debito)]),
    texto_sem_exclusoes: esc(`Nenhum espólio, unidade retomada ou em abandono foi identificado entre as ${uh(r.escopo.uh_total)} unidades. ${r.assertiva.texto}`),
    observacoes_juridicas: ad.observacoes_juridicas ? ad.observacoes_juridicas.map(esc) : observacoesJuridicas(r),
    proximos_passos: ad.proximos_passos ? ad.proximos_passos.map(esc) : proximosPassos(r, ctx),
    analista: esc(ctx.analista || 'Setor Análise de Crédito'),
  };
  return dados;
}

function motivoExclusao(x) {
  if (x.motivo === 'espolio') return /^confirmado/.test(x.detalhe || '')
    ? `Espólio ${nomeProprio(x.detalhe)}: fora do escopo, débito acumulado direcionado ao inventário.`
    : `Espólio${x.detalhe ? ` (${nomeProprio(x.detalhe)})` : ''}: fora do escopo, débito acumulado direcionado ao inventário.`;
  if (x.motivo === 'retomada') return `Unidade retomada${x.detalhe ? ` (${x.detalhe})` : ''}: fora do escopo da garantia.`;
  return `Abandono ou litígio${x.detalhe ? ` (${x.detalhe})` : ''}: fora do escopo da garantia.`;
}

/* ---------- 4 páginas: se passar, condensa o texto (nota da P2, observações jurídicas, observações da P1) ---------- */
const cortar = (s, n) => (s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, '')}…`);
const CONDENSAR = [
  (d) => ({ ...d, nota_base: cortar(d.nota_base, 220), nota_dias: cortar(d.nota_dias, 160) }),
  (d) => ({ ...d, observacoes_juridicas: d.observacoes_juridicas.slice(0, 6).map((o) => cortar(o, 240)) }),
  (d) => ({ ...d, observacoes_status: cortar(d.observacoes_status, 1400), proximos_passos: d.proximos_passos.slice(0, 7).map((o) => cortar(o, 200)) }),
  (d) => ({ ...d, observacoes_juridicas: d.observacoes_juridicas.slice(0, 4).map((o) => cortar(o, 160)), observacoes_status: cortar(d.observacoes_status, 1000), proximos_passos: d.proximos_passos.slice(0, 5) }),
];

function rodarGerador(dados, { python = process.env.PYTHON || 'python3', logo = LOGO } = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'retorno-'));
  const entrada = path.join(pasta, 'dados.json');
  const saida = path.join(pasta, 'retorno.pdf');
  fs.writeFileSync(entrada, JSON.stringify(dados));
  return new Promise((ok, falha) => {
    execFile(python, [GERADOR, entrada, saida, logo], { timeout: 60000 }, (erro, stdout, stderr) => {
      try {
        // bloco maior que a página: o ReportLab aborta em vez de criar mais páginas, então conta como estouro
        if (erro && /too large on page/.test(stderr)) return ok({ pdf: null, paginas: Infinity });
        if (erro) return falha(new Error(`Gerador do retorno falhou: ${(stderr || erro.message).trim().split('\n').pop()}`));
        const { paginas } = JSON.parse(String(stdout).trim().split('\n').pop());
        ok({ pdf: fs.readFileSync(saida), paginas });
      } catch (e) { falha(e); } finally { fs.rmSync(pasta, { recursive: true, force: true }); }
    });
  });
}

async function gerarPdf(dados, opcoes = {}) {
  let atual = dados;
  for (let nivel = 0; ; nivel++) {
    const { pdf, paginas } = await rodarGerador(atual, opcoes);
    if (paginas === 4) return { pdf, paginas, condensado: nivel, dados: atual };
    if (paginas < 4 || nivel >= CONDENSAR.length) throw new Error(`O retorno ${paginas === Infinity ? 'não coube' : `saiu com ${paginas} páginas`} (precisa ter 4): encurte as observações.`);
    atual = CONDENSAR[nivel](atual);
  }
}

/* ---------- resumo executivo e e-mail ---------- */
function resumoExecutivo(r, ctx) {
  const p = r.precificacao;
  const linhas = [`${r.status.rotulo}${p ? ` — ${fmtPct(p.taxa_adm)} ADM + ${fmtBRL(p.boleto)}/boleto` : ''} | ${uh(r.escopo.uh_escopo ?? 0)} UH no escopo.`];
  if (r.inad_media !== null) linhas.push(`Inadimplência média de ${fmtPct(r.inad_media)} (${textoMedia(r)}).`);
  if (r.comparativo) linhas.push(`Ganho anual estimado para o condomínio: ${fmtBRL(r.comparativo.ganho_anual)}.`);
  const principal = r.status.codigo === 'reprovada' ? r.reprovacoes[0]?.texto
    : r.status.codigo === 'pendente' ? r.pendencias[0]?.mensagem
      : r.ressalvas[0]?.texto || r.alertas.find((a) => a.nivel !== 'info')?.mensagem;
  if (principal) linhas.push(principal);
  return linhas.slice(0, 5).join('\n');
}

function emailEntrega(r, ctx, { assinatura = process.env.CREDITO_ASSINATURA_EMAIL || 'Setor Análise de Crédito — MyBlue' } = {}) {
  const nome = String(ctx.formulario?.razao_social || '').replace(/^condom[ií]nio\s+/i, '');
  const p = r.precificacao;
  const linhaStatus = `Status: ${r.status.rotulo}${p ? ` — ${fmtPct(p.taxa_adm)} ADM + ${fmtBRL(p.boleto)}/boleto` : ''} | ${uh(r.escopo.uh_escopo ?? 0)} UH no escopo.`;
  const destaque = r.status.codigo === 'ressalvas' ? `\n\nRessalva: ${r.ressalvas.map((x) => x.texto).join(' ')}` : '';
  return {
    assunto: `Retorno de Análise de Crédito — Condomínio ${nome}`,
    corpo: `Prezados,\n\nSegue em anexo o retorno da análise do Condomínio ${nome}.\n\n${linhaStatus}${destaque}\n\nDetalhes e próximos passos no PDF.\n\n${assinatura}`,
  };
}

module.exports = { montarDados, gerarPdf, rodarGerador, resumoExecutivo, emailEntrega, nomeArquivo, observacoesStatus };

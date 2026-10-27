'use strict';
/*
 * Formulário de Implantação em PDF: monta o conteúdo (montarDados) e roda o gerador em Python (formulario_pdf.py,
 * ReportLab, o mesmo do Retorno de Análise de Crédito). Quem pode ver a implantação pode exportar.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const F = require('./formulario');

const GERADOR = path.join(__dirname, 'formulario_pdf.py');
const LOGO = path.join(__dirname, '..', '..', 'public', 'img', 'logo.png');
// papel timbrado da MyBlue (formulário de implantação e ficha de repasse)
const TIMBRADO = path.join(__dirname, 'timbrado.png');

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const pct = (v) => (num(v) == null ? '' : `${num(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const reais = (v) => (num(v) == null ? '' : num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dataBr = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const quando = (d) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '');
const simNao = (v) => (v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : '');
const comAnalise = (valor, ref, fmt) => (ref == null || num(ref) === num(valor) ? fmt(valor) : `${fmt(valor)} (análise: ${fmt(ref)})`);

const ISENCAO = { nao: 'Não', integral: 'Sim, integral', parcial: 'Sim, parcial' };
const SINDICO = { condomino: 'Condômino (orgânico)', profissional: 'Profissional' };
const DESCONTO = { nenhum: 'Não possui', percentual: 'Percentual', valor: 'Valor por unidade' };
const CASHBACK = { nao: 'Não', 5: 'Sim, 5%', 10: 'Sim, 10%' };

function montarDados(i, { executivo, responsavel, documentos = [], diferencas = [], usuario, origemTexto }) {
  const f = i.formulario || {};
  const ref = i.referencia || {};
  const e = F.normalizarEtapas(i.etapas);
  const refTaxa = i.origem === 'entrega' ? null : ref.taxa_adm;
  const refBoleto = i.origem === 'entrega' ? null : ref.boleto;
  const secoes = [
    { numero: 1, titulo: 'Condomínio', campos: [['Nome', f.nome], ['CNPJ', f.sem_cnpj ? 'Ainda não tem' : f.cnpj], ['Estado do contrato', f.uf], ['Cidade', f.cidade],
      ['Nº de unidades', f.uh_total], ['Dia do vencimento', f.dia_vencimento], ['Condomínio de entrega', f.entrega ? 'Sim' : 'Não'],
      ...(f.entrega ? [['Construtora', [f.construtora, f.construtora_contato].filter(Boolean).join(' · ')]] : [])] },
    { numero: 2, titulo: 'Síndico', campos: [['Nome', f.sindico_nome], ['CPF', f.sindico_cpf], ['Tipo', SINDICO[f.sindico_tipo]],
      ['Isento da taxa', ISENCAO[f.sindico_isencao] + (f.sindico_isencao === 'parcial' && f.sindico_isencao_pct ? ` (${f.sindico_isencao_pct}%)` : '')],
      ['E-mail', f.sindico_email], ['Telefone', f.sindico_telefone]] },
    { numero: 3, titulo: 'Condições do contrato', campos: [
      ['Taxa administrativa', comAnalise(f.taxa_adm, refTaxa, pct)], ['Valor do boleto', comAnalise(f.boleto, refBoleto, reais)],
      ['Início do contrato', dataBr(f.inicio_contrato)], ['Taxa ordinária', reais(f.taxa_ordinaria)],
      ['Desconto de pontualidade', DESCONTO[f.desconto_tipo || 'nenhum'] + (['percentual', 'valor'].includes(f.desconto_tipo) ? ` ${f.desconto_tipo === 'percentual' ? pct(f.desconto_valor) : reais(f.desconto_valor)}${f.desconto_ate_dia ? ` até o dia ${f.desconto_ate_dia}` : ''}` : '')],
      ['Honorários extrajudiciais', pct(f.honorarios)],
      ['O que será garantido', [...(f.garantias || []), f.garantia_outra].filter(Boolean).join(', ')]],
    tabela: (f.taxas_extras || []).length ? { titulo: 'Taxa extra vigente', cab: ['Descrição', 'Valor por unidade', 'Início', 'Fim'], larguras: [0.4, 0.2, 0.2, 0.2],
      linhas: f.taxas_extras.map((x) => [x.descricao, reais(x.valor_por_uh), x.inicio, x.fim]) } : null },
    { numero: 4, titulo: 'Parceria', campos: [['Contrato de parceria', simNao(f.parceria)],
      ...(f.parceria === 'sim' ? [['Parceiro', (f.parceiros || []).map((p) => p.nome + (p.id ? '' : ' (ainda não cadastrado)')).join(' e ')], ['Comissão', F.comissaoTexto(f)]] : [])] },
    { numero: 5, titulo: 'Cashback e antecipação', campos: [['Cashback', f.cashback === 'outro' ? `Sim, ${pct(f.cashback_pct)}` : CASHBACK[f.cashback] || ''],
      ...(['5', '10', 'outro'].includes(String(f.cashback)) ? [['Incide sobre', (f.cashback_receitas || []).join(', ')]] : []),
      ['Antecipação de valores', simNao(f.antecipacao)],
      ...(f.antecipacao === 'sim' ? [['Valor', reais(f.antecipacao_valor)], ['Data', dataBr(f.antecipacao_data)], ['Prazo', f.antecipacao_prazo]] : [])] },
    { numero: 6, titulo: 'Administradora e contatos', campos: [['Administradora', f.administradora], ['Tipo', f.administracao_interna ? 'Interna' : 'Terceirizada']],
      tabela: { cab: ['Contato', 'Função', 'Telefone', 'E-mail'], larguras: [0.28, 0.22, 0.2, 0.3],
        linhas: [[f.consultor_nome, 'Consultor do condomínio', f.consultor_telefone, f.consultor_email], ...(f.contatos || []).map((c) => [c.nome, c.funcao, c.telefone, c.email])].filter((l) => l[0] || l[2] || l[3]) },
      texto_titulo: f.observacoes ? 'Observações para a implantação' : '', texto: f.observacoes || '' },
  ];
  // documentos: os de cada tipo que estão valendo
  const vig = documentos.filter((d) => !d.substituido_em);
  const obrig = F.docsObrigatorios(i.origem);
  const linhas = [];
  const cores = [];
  for (const [tipo, d] of Object.entries(F.DOCUMENTOS)) {
    const atuais = vig.filter((x) => x.tipo === tipo);
    if (['outro', 'contrato'].includes(tipo) && !atuais.length) continue;
    if (tipo === 'analise_credito' && i.origem === 'entrega') continue;
    const sit = atuais.length ? (tipo === 'analise_credito' ? 'vinculada' : 'entregue') : obrig.includes(tipo) ? 'falta' : 'pendente';
    cores.push([linhas.length, 1, atuais.length ? '#2B7A55' : '#9A5B05']);
    linhas.push([`${d.nome}${obrig.includes(tipo) ? ' *' : ''}`, sit, atuais.map((x) => `${x.nome} · ${quando(x.enviado_em)}`).join('; ') || (sit === 'pendente' ? (d.setor ? 'a cargo da equipe de Implantação' : 'alerta ao executivo') : '')]);
  }
  secoes.push({ numero: 7, titulo: 'Documentos', tabela: { titulo: obrig.length ? '* obrigatório para enviar' : 'Condomínio de entrega: os documentos podem chegar depois', cab: ['Documento', 'Situação', 'Arquivo · enviado em'], larguras: [0.4, 0.15, 0.45], linhas, cores } });
  if (i.responsavel_id || ['concluida', 'na_carteira'].includes(i.etapa)) {
    secoes.push({ titulo: 'Andamento no setor Implantação', campos: [['Responsável', responsavel], ['Designada em', quando(i.designado_em)], ['Iniciada em', quando(i.iniciado_em)],
      ['Documentação', e.documentacao.feito ? 'Conferida' : 'a fazer'], ['Cadastro no Vouch', e.vouch.id ? `Feito · ID ${e.vouch.id}` : 'a fazer'],
      ['Onboarding', F.ONBOARDING[e.onboarding.situacao] + (e.onboarding.data ? ` · ${e.onboarding.data}` : '')], ['Emissão de boletos', e.boletos.feito ? 'Feita' : 'a fazer'], ['1º vencimento', dataBr(e.boletos.primeiro_vencimento) || 'a informar'],
      ['Envio dos boletos', F.ENVIO[e.envio.forma] || 'a escolher'], ...(i.concluido_em ? [['Concluída em', quando(i.concluido_em)]] : [])] });
  }
  return {
    protocolo: i.protocolo || '',
    emitido: `Emitido em ${quando(new Date())}${usuario ? ` por ${usuario}` : ''}`,
    condominio: f.nome || i.condominio || 'Implantação',
    subtitulo: [`Origem: ${origemTexto}`, executivo, f.uf, `Etapa: ${{ rascunho: 'rascunho', diretoria: 'na diretoria', fila: 'na fila', em_implantacao: 'em implantação', pendencia: 'pendência com o comercial', concluida: 'concluída', na_carteira: 'na Carteira', cancelada: 'cancelada' }[i.etapa]}`].filter(Boolean).join(' · '),
    rotulo_diferencas: i.origem === 'entrega' ? 'Diferente do aprovado pela diretoria' : 'Diferente da análise',
    diferencas: diferencas.map((x) => `${x.rotulo.replace(/ \((%|R\$)\)$/, '')} ${typeof x.valor === 'number' ? (/R\$/.test(x.rotulo) ? reais(x.valor) : /%/.test(x.rotulo) ? pct(x.valor) : x.valor) : x.valor} (${i.origem === 'entrega' ? 'aprovado' : 'análise'}: ${typeof x.analise === 'number' ? (/R\$/.test(x.rotulo) ? reais(x.analise) : /%/.test(x.rotulo) ? pct(x.analise) : x.analise) : x.analise})`),
    secoes,
  };
}

function gerarPdf(dados, { python = process.env.PYTHON || 'python3', timbrado = false } = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'implantacao-'));
  const entrada = path.join(pasta, 'dados.json');
  const saida = path.join(pasta, 'formulario.pdf');
  fs.writeFileSync(entrada, JSON.stringify(dados));
  return new Promise((ok, falha) => {
    execFile(python, [GERADOR, entrada, saida, LOGO, ...(timbrado ? [TIMBRADO] : [])], { timeout: 60000 }, (erro, stdout, stderr) => {
      try {
        if (erro) return falha(new Error(`Gerador do PDF falhou: ${(stderr || erro.message).trim().split('\n').pop()}`));
        ok(fs.readFileSync(saida));
      } catch (e) { falha(e); } finally { fs.rmSync(pasta, { recursive: true, force: true }); }
    });
  });
}

module.exports = { montarDados, gerarPdf, fmt: { num, pct, reais, dataBr, quando, simNao }, ISENCAO, SINDICO, DESCONTO };

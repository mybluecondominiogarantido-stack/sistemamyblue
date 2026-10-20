'use strict';
/*
 * Análise de Crédito: o executivo de negócios pede a análise, o analista (setor Análise de Crédito) assume, lança ou
 * confere os dados dos documentos, o motor de regras calcula, o analista valida e libera o retorno (PDF) ao executivo.
 * Inadimplência acima de 35% passa antes pela chancela da diretoria.
 *
 * Etapas: rascunho → fila (documentação completa, sem analista) → em_analise → [diretoria → validada] → enviada.
 *         pendencia: devolvida ao executivo (o prazo para e recomeça quando ele reenvia). cancelada.
 *
 * Quem faz o quê (definido no portal, nunca no código):
 *  - executivo: quem está ligado a um cadastro de executivo (Análise de Crédito → Pessoas e papéis); vê e pede as suas;
 *  - analista: quem é do setor dos analistas (política: setor_analistas, padrão "Análise de Crédito"); vê todas;
 *  - diretoria: pessoas liberadas em "Chancelar análises de crédito (diretoria)" (Pessoas e papéis; fica nas regras de acesso);
 *  - administração: tudo, inclusive executivos e política.
 */
const express = require('express');
const { analisar } = require('../credito/motor');
const { politicaAtiva, proximoProtocolo, gravarPolitica } = require('../credito/banco');
const { validarPolitica } = require('../credito/politica');
const retorno = require('../credito/retorno');
const { lerRelatorioColado } = require('../credito/colar');
const { lerRespostaSkill } = require('../credito/skill');
const { criarExtrator, paraDadosAnalista } = require('../credito/extracao');
const { cnpjValido } = require('../implantacao');

const ETAPAS = ['rascunho', 'pendencia', 'fila', 'em_analise', 'diretoria', 'validada', 'enviada', 'cancelada'];
const EM_ANDAMENTO = "('fila','em_analise','diretoria','validada')";
const TIPOS_DOC = ['convencao', 'relatorio', 'ata_extra', 'retomadas', 'historico', 'dre', 'outro'];
const NOME_DOC = { convencao: 'Convenção', relatorio: 'Relatório de inadimplência', ata_extra: 'Ata de taxa extra', retomadas: 'Unidades retomadas', historico: 'Histórico', dre: 'DRE 12 meses', outro: 'Outro', retorno_pdf: 'Retorno (PDF)' };

const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const diaBrasilia = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

function rotasCredito({ db, seg, cfg, avisos, expediente, regras }) {
  const r = express.Router();
  const json = express.json({ limit: '4mb' });
  const corpoDoc = express.raw({ type: () => true, limit: (cfg.limiteCreditoMb || 30) * 1024 * 1024 });
  r.use('/api/credito', seg.exigirLogin);
  const erro = (res, status, msg, extra) => res.status(status).json({ erro: msg, ...(extra || {}) });
  const link = (id) => `#/credito/${id}`;
  // leitura dos PDFs pela IA (desligada sem ANTHROPIC_API_KEY; os testes passam um leitor de mentira)
  const extrator = cfg.extratorCredito || criarExtrator(process.env);
  const lendo = new Set();

  /* lê o relatório e a convenção vigentes e põe o que leu nos dados do analista (como sugestão para conferir).
     sobrescrever: o analista pediu de novo (troca o que estiver lançado); sem isso, só preenche o que está vazio. */
  async function lerDocumentos(analiseId, { sobrescrever = false, tipos = ['relatorio', 'convencao'], usuarioId = null } = {}) {
    if (!extrator.ativo || lendo.has(analiseId)) return;
    lendo.add(analiseId);
    try {
      for (const tipo of tipos) {
        const doc = await db.um("SELECT id, conteudo, extracao FROM analise_documentos WHERE analise_id = $1 AND tipo = $2 AND substituido_em IS NULL AND mime = 'application/pdf' ORDER BY id DESC LIMIT 1", [analiseId, tipo]);
        if (!doc || (!sobrescrever && doc.extracao && doc.extracao.status === 'ok')) continue;
        await db.q('UPDATE analise_documentos SET extracao = $2::jsonb WHERE id = $1', [doc.id, JSON.stringify({ status: 'lendo', inicio: new Date().toISOString() })]);
        try {
          const { dados, uso } = await extrator.ler(tipo, doc.conteudo);
          await db.q('UPDATE analise_documentos SET extracao = $2::jsonb, extraido_em = now() WHERE id = $1', [doc.id, JSON.stringify({ status: 'ok', dados, uso })]);
          const a = await db.um('SELECT dados_analista FROM analises WHERE id = $1', [analiseId]);
          const d = a.dados_analista || {};
          const vazio = tipo === 'relatorio' ? !((d.relatorio && d.relatorio.unidades) || []).length : !(d.convencao && d.convencao.registro);
          if (sobrescrever || vazio) {
            d[tipo] = paraDadosAnalista(tipo, dados, doc.id);
            await db.q('UPDATE analises SET dados_analista = $2::jsonb, atualizado_em = now() WHERE id = $1', [analiseId, JSON.stringify(d)]);
          }
          await db.tx((t) => evento(t, analiseId, usuarioId, 'leitura', { tipo, aplicada: sobrescrever || vazio, unidades: tipo === 'relatorio' ? (dados.unidades || []).length : undefined,
            lancamentos: tipo === 'relatorio' ? (dados.unidades || []).reduce((n, u) => n + (u.lancamentos || []).length, 0) : undefined, uso }));
        } catch (e) {
          await db.q('UPDATE analise_documentos SET extracao = $2::jsonb WHERE id = $1', [doc.id, JSON.stringify({ status: 'erro', erro: e.message })]);
          await db.tx((t) => evento(t, analiseId, usuarioId, 'leitura_erro', { tipo, erro: e.message }));
        }
      }
    } catch (e) {
      console.error('[credito] leitura dos PDFs:', e.message);
    } finally { lendo.delete(analiseId); }
  }

  /* ---------- quem é a pessoa na ferramenta ---------- */
  async function perfil(u) {
    const politica = await politicaAtiva(db);
    const setor = await db.um('SELECT id FROM setores WHERE nome = $1', [politica.setor_analistas]);
    const admin = u.papel === 'admin';
    const membro = setor ? !!(await db.um('SELECT 1 FROM setor_membros WHERE setor_id = $1 AND usuario_id = $2', [setor.id, u.id])) : false;
    const executivo = await db.um('SELECT id, nome, uf, regiao, boleto FROM executivos WHERE usuario_id = $1 AND ativo', [u.id]);
    return { admin, analista: admin || membro, diretoria: admin || (await regras.pode(u, 'credito.diretoria')), executivo, setorAnalistas: setor ? setor.id : null, politica };
  }

  function pode(p, a, u) {
    const dono = a.solicitante_id === u.id || (p.executivo && a.executivo_id === p.executivo.id);
    const editavel = ['rascunho', 'pendencia'].includes(a.etapa);
    const responsavel = a.analista_id === u.id || p.admin;
    const emAnalise = ['em_analise', 'validada'].includes(a.etapa);
    return {
      ver: dono || p.analista || p.diretoria,
      interno: p.analista || p.diretoria, // dados do analista, cálculo, alertas
      editar: editavel && (dono || p.analista),
      documentos: (editavel && (dono || p.analista)) || (p.analista && responsavel && emAnalise),
      enviar: editavel && (dono || p.analista),
      assumir: p.analista && ['fila', 'em_analise'].includes(a.etapa) && a.analista_id !== u.id,
      analisar: p.analista && responsavel && emAnalise,
      chancelar: p.diretoria && a.etapa === 'diretoria',
      reanalise: (dono || p.analista) && a.etapa === 'enviada',
      cancelar: (editavel && dono) || (p.analista && !['enviada', 'cancelada'].includes(a.etapa)),
    };
  }

  async function carregar(req, res) {
    const a = await db.um('SELECT * FROM analises WHERE id = $1', [Number(req.params.id) || 0]);
    const p = await perfil(req.usuario);
    if (!a || !pode(p, a, req.usuario).ver) { erro(res, 404, 'Análise não encontrada.'); return null; }
    return { a, p, pd: pode(p, a, req.usuario) };
  }

  const evento = (t, analiseId, usuarioId, tipo, detalhe) => t.q('INSERT INTO analise_eventos (analise_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)',
    [analiseId, usuarioId, tipo, JSON.stringify(detalhe || {})]);

  async function analistas(p) {
    if (!p.setorAnalistas) return (await db.q("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo")).rows.map((x) => x.id);
    return (await db.q('SELECT sm.usuario_id AS id FROM setor_membros sm JOIN usuarios u ON u.id = sm.usuario_id WHERE sm.setor_id = $1 AND u.ativo', [p.setorAnalistas])).rows.map((x) => x.id);
  }
  async function diretores() {
    const pessoas = (await regras.regras()).get('credito.diretoria').pessoas;
    return pessoas.length ? pessoas : (await db.q("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo")).rows.map((x) => x.id);
  }
  async function donos(a) {
    const ex = a.executivo_id ? await db.um('SELECT usuario_id FROM executivos WHERE id = $1', [a.executivo_id]) : null;
    return [a.solicitante_id, ex && ex.usuario_id];
  }

  /* prazos: analista no mesmo dia útil até a hora de corte; executivo em 24h (48h com diretoria), pulando fins de semana e feriados */
  function prazos(inicio, politica, diretoria) {
    const horas = diretoria ? politica.sla_horas_diretoria : politica.sla_horas;
    return { analista: expediente.fimDoDiaUtil(inicio, politica.prazo_analista_corte), executivo: expediente.somarDiasUteis(inicio, horas / 24) };
  }

  /* ---------- o que falta para enviar (verificação documental) ---------- */
  async function faltas(a) {
    const f = a.formulario || {};
    const lista = [];
    const cnpj = String(f.cnpj || '').replace(/\D/g, '');
    if (!texto(f.razao_social, 200)) lista.push('Informar a razão social do condomínio.');
    if (!cnpjValido(cnpj.padStart(14, '0')) || cnpj.length < 11) lista.push('Informar um CNPJ válido.');
    if (!texto(f.uf, 2)) lista.push('Informar a UF do condomínio.');
    if (!['nova', 'portabilidade'].includes(f.tipo_contratacao)) lista.push('Escolher o tipo de contratação.');
    if (!(Number(f.uh_total) > 0)) lista.push('Informar a quantidade de unidades.');
    if (!(Number(f.taxa_ordinaria) > 0)) lista.push('Informar o valor da taxa ordinária.');
    if (!(Number(f.dia_vencimento) >= 1 && Number(f.dia_vencimento) <= 31)) lista.push('Informar o dia do vencimento (1 a 31).');
    if (!f.sindico || !['profissional', 'condomino'].includes(f.sindico.tipo)) lista.push('Informar o tipo de síndico.');
    if (!a.executivo_id) lista.push('Escolher o executivo de negócios.');
    const docs = new Set((await db.q('SELECT DISTINCT tipo FROM analise_documentos WHERE analise_id = $1 AND substituido_em IS NULL', [a.id])).rows.map((x) => x.tipo));
    if (!docs.has('relatorio')) lista.push('Anexar o relatório de contas a receber / inadimplência detalhado por competência.');
    if (!docs.has('convencao') && !f.sem_convencao) lista.push('Anexar a convenção do condomínio (ou marcar que ela será entregue antes do contrato).');
    return lista;
  }

  /* ---------- entrada do motor a partir da análise ---------- */
  async function entradaMotor(a) {
    const d = a.dados_analista || {};
    const ex = a.executivo_id ? await db.um('SELECT nome, uf, boleto FROM executivos WHERE id = $1', [a.executivo_id]) : null;
    const docs = new Set((await db.q('SELECT DISTINCT tipo FROM analise_documentos WHERE analise_id = $1 AND substituido_em IS NULL', [a.id])).rows.map((x) => x.tipo));
    const rel = d.relatorio || {};
    const temDadosRel = (rel.unidades && rel.unidades.length) || rel.sem_inadimplencia;
    return {
      faltaRelatorio: docs.has('relatorio') && !temDadosRel,
      entrada: {
        formulario: { ...(a.formulario || {}), executivo: ex ? { nome: ex.nome, uf: ex.uf, boleto: ex.boleto === null ? null : Number(ex.boleto) } : null },
        convencao: docs.has('convencao') ? { presente: true, ...(d.convencao || {}) } : null,
        relatorio: docs.has('relatorio') ? { presente: true, tem_competencia: true, tem_nomes: true, ...rel, unidades: rel.unidades || [] } : null,
        analista: d,
      },
    };
  }

  /* roda o motor e grava o resultado, os alertas, as exclusões e o detalhe do relatório (as leituras vêm antes da
     transação: o banco embutido atende um comando por vez) */
  async function calcular(a, u) {
    const { entrada, faltaRelatorio } = await entradaMotor(a);
    if (faltaRelatorio) { const e = new Error('Lance os dados do relatório (cole a planilha) ou marque que não há inadimplência antes de calcular.'); e.status = 400; throw e; }
    const politica = await politicaAtiva(db);
    const res = analisar(entrada, politica, { hoje: diaBrasilia() });
    await db.tx(async (t) => {
    await t.q(`UPDATE analises SET resultado_motor = $2::jsonb, resultado = $3, politica_versao = $4, inad_media = $5, taxa_adm = $6, boleto = $7,
      uh_escopo = $8, receita_liquida = $9, exposicao = $10, validade_ate = $11, atualizado_em = now() WHERE id = $1`, [a.id, JSON.stringify(res), res.status.codigo,
      politica.versao, res.inad_media, res.precificacao && res.precificacao.taxa_adm, res.precificacao && res.precificacao.boleto, res.escopo.uh_escopo,
      res.valores.receita_liquida, res.indicadores && res.indicadores.exposicao, res.validade_ate]);
    await t.q('DELETE FROM analise_alertas WHERE analise_id = $1', [a.id]);
    for (const x of res.alertas) await t.q('INSERT INTO analise_alertas (analise_id, codigo, nivel, mensagem, dados) VALUES ($1, $2, $3, $4, $5::jsonb)', [a.id, x.codigo, x.nivel, x.mensagem, x.dados ? JSON.stringify(x.dados) : null]);
    await t.q('DELETE FROM analise_exclusoes WHERE analise_id = $1', [a.id]);
    for (const x of res.escopo.exclusoes) await t.q('INSERT INTO analise_exclusoes (analise_id, unidade, motivo, detalhe, debito, origem) VALUES ($1, $2, $3, $4, $5, $6)', [a.id, x.unidade, x.motivo, x.detalhe || '', x.debito, x.origem]);
    await t.q('DELETE FROM analise_unidades WHERE analise_id = $1', [a.id]);
    for (const un of (entrada.relatorio && entrada.relatorio.unidades) || []) {
      const { id } = await t.um(`INSERT INTO analise_unidades (analise_id, unidade, titular, documento, tipo_pessoa, flag, espolio, fonte) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`,
        [a.id, String(un.unidade), un.titular || '', un.documento || '', ['PF', 'PJ'].includes(un.tipo_pessoa) ? un.tipo_pessoa : '', un.flag || null, !!un.espolio, un.fonte ? JSON.stringify(un.fonte) : null]);
      for (const l of un.lancamentos || []) {
        await t.q('INSERT INTO analise_lancamentos (unidade_id, competencia, vencimento, tipo, valor, fonte) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
          [id, l.competencia, l.vencimento || null, l.tipo, l.valor, l.fonte ? JSON.stringify(l.fonte) : null]);
      }
    }
    await evento(t, a.id, u.id, 'motor', { status: res.status.rotulo, inad_media: res.inad_media, taxa_adm: res.precificacao && res.precificacao.taxa_adm, politica: politica.versao });
    });
    return res;
  }

  async function ctxRetorno(a, nomeAnalista) {
    const d = a.dados_analista || {};
    const ex = a.executivo_id ? await db.um('SELECT nome, uf FROM executivos WHERE id = $1', [a.executivo_id]) : null;
    return { formulario: a.formulario || {}, protocolo: a.protocolo, analista: nomeAnalista, executivo: ex ? ex.nome : '', emissao: d.relatorio && d.relatorio.data_emissao, ajustesTexto: d.textos || {} };
  }

  /* campos do formulário que o analista corrigiu: [{ campo, de, para }] */
  const ROTULOS_FORM = {
    razao_social: 'Razão social', cnpj: 'CNPJ', uf: 'UF', cidade: 'Cidade', administradora: 'Administradora', sistema_gestao: 'Sistema de gestão',
    garantidora_atual: 'Garantidora atual', vigencia_atual: 'Vigência do contrato atual', tipo_contratacao: 'Tipo de contratação', uh_total: 'Unidades (UH)',
    taxa_ordinaria: 'Taxa ordinária', dia_vencimento: 'Dia do vencimento', 'desconto_pontualidade.tipo': 'Desconto de pontualidade', 'desconto_pontualidade.valor': 'Valor do desconto',
    'agua_gas.total_mensal': 'Água + gás (total)', 'agua_gas.por_unidade': 'Água + gás (por unidade)', 'agua_gas.compoe_boleto': 'Água + gás no boleto',
    custo_boleto_atual: 'Custo atual do boleto', taxas_extras: 'Taxas extras', 'sindico.tipo': 'Tipo de síndico', 'sindico.isencao': 'Isenção do síndico',
    'sindico.percentual': 'Isenção parcial do síndico (%)', outros_isentos: 'Subsíndico/conselheiros isentos', uh_isentas_informadas: 'Total de unidades isentas', sem_convencao: 'Convenção depois',
  };
  function mudancasFormulario(antes, depois) {
    const valor = (o, k) => k.split('.').reduce((x, p) => (x == null ? undefined : x[p]), o);
    const vazio = (v) => v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length);
    // o JSONB do banco reordena as chaves: compara com as chaves em ordem
    const estavel = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x));
    const mostra = (v) => (vazio(v) ? '—' : Array.isArray(v) ? v.map((x) => [x.descricao || x.cargo, x.valor_por_uh ?? (x.percentual != null ? `${x.percentual}%` : '')].filter((y) => y !== '' && y != null).join(' ')).join('; ') : String(v));
    return Object.keys(ROTULOS_FORM).filter((k) => {
      const x = valor(antes, k), y = valor(depois, k);
      return !(vazio(x) && vazio(y)) && estavel(x) !== estavel(y);
    }).map((k) => ({ campo: ROTULOS_FORM[k], de: mostra(valor(antes, k)), para: mostra(valor(depois, k)) }));
  }

  /* ===================== perfil e contadores ===================== */
  r.get('/api/credito/meta', async (req, res) => {
    const p = await perfil(req.usuario);
    const executivos = p.analista || p.diretoria ? (await db.q('SELECT id, nome, uf, regiao, boleto FROM executivos WHERE ativo ORDER BY nome')).rows : p.executivo ? [p.executivo] : [];
    res.json({
      perfil: { admin: p.admin, analista: p.analista, diretoria: p.diretoria, executivo: p.executivo },
      executivos, politica: { versao: p.politica.versao, setor_analistas: p.politica.setor_analistas, sla_horas: p.politica.sla_horas, sla_horas_diretoria: p.politica.sla_horas_diretoria, corte: p.politica.prazo_analista_corte },
      tipos_documento: TIPOS_DOC.map((t) => ({ tipo: t, nome: NOME_DOC[t] })),
      ia: extrator.ativo,
    });
  });

  r.get('/api/credito/resumo', async (req, res) => {
    const p = await perfil(req.usuario);
    const out = { acesso: p.analista || p.diretoria || !!p.executivo };
    if (p.analista) {
      Object.assign(out, await db.um(`SELECT COUNT(*) FILTER (WHERE etapa = 'fila')::int AS fila,
        COUNT(*) FILTER (WHERE etapa IN ('em_analise','validada') AND analista_id = $1)::int AS minhas,
        COUNT(*) FILTER (WHERE etapa IN ${EM_ANDAMENTO} AND prazo_analista < now())::int AS atrasadas FROM analises`, [req.usuario.id]));
    }
    if (p.diretoria) out.diretoria = (await db.um("SELECT COUNT(*)::int AS n FROM analises WHERE etapa = 'diretoria'")).n;
    if (p.executivo || !p.analista) out.pendencias = (await db.um("SELECT COUNT(*)::int AS n FROM analises WHERE etapa = 'pendencia' AND (solicitante_id = $1 OR executivo_id = $2)", [req.usuario.id, p.executivo ? p.executivo.id : 0])).n;
    res.json(out);
  });

  /* ===================== listagem ===================== */
  r.get('/api/credito/analises', async (req, res) => {
    const u = req.usuario;
    const p = await perfil(u);
    const args = [];
    const v = (x) => { args.push(x); return '$' + args.length; };
    const where = [];
    const vis = String(req.query.vis || 'minhas');
    if (vis === 'minhas') where.push(`(a.solicitante_id = ${v(u.id)} OR a.executivo_id = ${v(p.executivo ? p.executivo.id : 0)})`);
    else if (vis === 'fila') { if (!p.analista) return erro(res, 403, 'A fila é do setor Análise de Crédito.'); where.push(`a.etapa IN ('pendencia',${EM_ANDAMENTO.slice(1, -1)})`); }
    else if (vis === 'diretoria') { if (!p.diretoria) return erro(res, 403, 'Só a diretoria chancela análises.'); where.push("a.etapa = 'diretoria'"); }
    else if (vis === 'todas') { if (!p.analista && !p.diretoria) return erro(res, 403, 'O histórico é do setor Análise de Crédito e da diretoria.'); where.push("a.etapa <> 'rascunho'"); }
    else return erro(res, 400, 'Visão inválida.');
    const busca = texto(req.query.q, 100);
    if (busca) where.push(`(a.condominio ILIKE ${v('%' + busca + '%')} OR a.protocolo ILIKE $${args.length} OR a.cnpj ILIKE $${args.length})`);
    const { rows } = await db.q(`SELECT a.id, a.protocolo, a.origem_id, o.protocolo AS origem_protocolo, a.etapa, a.resultado, a.condominio, a.cnpj, a.uf, a.tipo_contratacao,
        a.inad_media, a.taxa_adm, a.boleto, a.uh_escopo, a.prazo_analista, a.prazo_executivo, a.documentacao_completa_em, a.enviada_em, a.criado_em, a.atualizado_em,
        e.nome AS executivo_nome, ua.nome AS analista_nome, a.analista_id, (a.etapa IN ${EM_ANDAMENTO} AND a.prazo_analista < now()) AS atrasada
      FROM analises a LEFT JOIN analises o ON o.id = a.origem_id LEFT JOIN executivos e ON e.id = a.executivo_id LEFT JOIN usuarios ua ON ua.id = a.analista_id
      WHERE ${where.join(' AND ')}
      ORDER BY (a.etapa IN ${EM_ANDAMENTO}) DESC, a.prazo_analista NULLS LAST, a.atualizado_em DESC LIMIT 300`, args);
    const interno = p.analista || p.diretoria;
    res.json({ analises: rows.map((x) => (interno || x.etapa === 'enviada' ? x : { ...x, resultado: null, inad_media: null, taxa_adm: null, boleto: null })) });
  });

  /* ===================== criar (rascunho) ===================== */
  r.post('/api/credito/analises', json, async (req, res) => {
    const u = req.usuario;
    const p = await perfil(u);
    if (!p.executivo && !p.analista) return erro(res, 403, 'Só executivos de negócios cadastrados e o setor Análise de Crédito pedem análises.');
    const b = req.body || {};
    let executivoId = p.executivo ? p.executivo.id : null;
    if (p.analista && b.executivo_id) {
      const ex = await db.um('SELECT id FROM executivos WHERE id = $1 AND ativo', [Number(b.executivo_id) || 0]);
      if (!ex) return erro(res, 400, 'Executivo não encontrado.');
      executivoId = ex.id;
    }
    const f = b.formulario && typeof b.formulario === 'object' ? b.formulario : {};
    const id = await db.tx(async (t) => {
      const { id: novo } = await t.um(`INSERT INTO analises (etapa, condominio, cnpj, uf, cidade, tipo_contratacao, executivo_id, solicitante_id, formulario)
        VALUES ('rascunho', $1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`, [texto(f.razao_social, 200), texto(f.cnpj, 20), texto(f.uf, 2).toUpperCase(), texto(f.cidade, 100),
        ['nova', 'portabilidade'].includes(f.tipo_contratacao) ? f.tipo_contratacao : null, executivoId, u.id, JSON.stringify(f)]);
      await evento(t, novo, u.id, 'criada', {});
      return novo;
    });
    res.status(201).json({ id });
  });

  /* ===================== detalhe ===================== */
  r.get('/api/credito/analises/:id', async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { a, pd } = c;
    const info = await db.um(`SELECT e.nome AS executivo_nome, e.uf AS executivo_uf, us.nome AS solicitante_nome, ua.nome AS analista_nome, uc.nome AS chancela_nome,
      ul.nome AS liberada_nome, o.protocolo AS origem_protocolo FROM analises a LEFT JOIN executivos e ON e.id = a.executivo_id LEFT JOIN usuarios us ON us.id = a.solicitante_id
      LEFT JOIN usuarios ua ON ua.id = a.analista_id LEFT JOIN usuarios uc ON uc.id = a.chancela_por LEFT JOIN usuarios ul ON ul.id = a.liberada_por
      LEFT JOIN analises o ON o.id = a.origem_id WHERE a.id = $1`, [a.id]);
    const documentos = (await db.q(`SELECT d.id, d.tipo, d.nome, d.mime, d.tamanho, d.enviado_em, d.substituido_em, u.nome AS enviado_por_nome,
      d.extracao->>'status' AS leitura, d.extracao->>'erro' AS leitura_erro, d.extraido_em
      FROM analise_documentos d LEFT JOIN usuarios u ON u.id = d.enviado_por WHERE d.analise_id = $1 ORDER BY d.id`, [a.id])).rows
      .filter((d) => pd.interno || d.tipo !== 'retorno_pdf' || a.etapa === 'enviada');
    const eventos = (await db.q(`SELECT ev.id, ev.tipo, ev.detalhe, ev.criado_em, u.nome AS usuario_nome FROM analise_eventos ev LEFT JOIN usuarios u ON u.id = ev.usuario_id
      WHERE ev.analise_id = $1 ORDER BY ev.id`, [a.id])).rows;
    const reanalises = (await db.q('SELECT id, protocolo, etapa FROM analises WHERE origem_id = $1 ORDER BY id', [a.id])).rows;
    const implantacao = await db.um("SELECT id, protocolo, etapa FROM implantacoes WHERE analise_id = $1 AND etapa <> 'cancelada' ORDER BY id DESC LIMIT 1", [a.id]);
    const out = { ...a, ...info };
    if (!pd.interno) {
      // o executivo vê a situação, as pendências e, depois de enviado, o resultado; não vê as anotações do analista
      delete out.dados_analista;
      documentos.forEach((x) => { delete x.leitura; delete x.leitura_erro; });
      if (a.etapa !== 'enviada') { delete out.resultado_motor; out.resultado = null; out.inad_media = out.taxa_adm = out.boleto = out.exposicao = out.receita_liquida = null; }
      else if (out.resultado_motor) out.resultado_motor = { status: out.resultado_motor.status, precificacao: out.resultado_motor.precificacao, escopo: { uh_escopo: out.resultado_motor.escopo.uh_escopo } };
    }
    await db.q("UPDATE notificacoes SET lida = TRUE WHERE usuario_id = $1 AND link = $2 AND NOT lida", [req.usuario.id, link(a.id)]);
    res.json({ analise: out, documentos, eventos: pd.interno ? eventos : eventos.filter((e) => !['motor', 'dados', 'previa'].includes(e.tipo)), reanalises, implantacao, pode: pd, faltas: pd.enviar ? await faltas(a) : [] });
  });

  /* ===================== formulário (executivo) e dados do analista ===================== */
  r.patch('/api/credito/analises/:id', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { a, p, pd } = c;
    const b = req.body || {};
    const sets = [];
    const args = [a.id];
    const s = (col, val, tipo = '') => { args.push(val); sets.push(`${col} = $${args.length}${tipo}`); };
    // o analista que assumiu corrige o formulário do executivo (ex.: taxa errada); a trilha guarda o que mudou
    const correcao = b.formulario !== undefined && !pd.editar && pd.analisar;
    if (b.formulario !== undefined) {
      if (!pd.editar && !pd.analisar) return erro(res, 403, 'O formulário só muda enquanto a solicitação está em rascunho ou com pendência, ou pelo analista que assumiu a análise.');
      const f = b.formulario && typeof b.formulario === 'object' ? b.formulario : {};
      s('formulario', JSON.stringify(f), '::jsonb');
      s('condominio', texto(f.razao_social, 200)); s('cnpj', texto(f.cnpj, 20)); s('uf', texto(f.uf, 2).toUpperCase()); s('cidade', texto(f.cidade, 100));
      s('tipo_contratacao', ['nova', 'portabilidade'].includes(f.tipo_contratacao) ? f.tipo_contratacao : null);
    }
    if (b.executivo_id !== undefined) {
      if ((!pd.editar && !pd.analisar) || !p.analista) return erro(res, 403, 'Só o setor Análise de Crédito troca o executivo.');
      const ex = await db.um('SELECT id FROM executivos WHERE id = $1 AND ativo', [Number(b.executivo_id) || 0]);
      if (!ex) return erro(res, 400, 'Executivo não encontrado.');
      s('executivo_id', ex.id);
    }
    if (b.dados_analista !== undefined) {
      if (!pd.analisar) return erro(res, 403, 'Só o analista que assumiu a análise lança os dados.');
      const d = b.dados_analista && typeof b.dados_analista === 'object' ? b.dados_analista : {};
      for (const [campo, aj] of Object.entries(d.ajustes || {})) {
        if (aj && aj.valor !== undefined && aj.valor !== '' && !String(aj.justificativa || '').trim()) return erro(res, 400, `O ajuste em "${campo}" precisa de justificativa.`);
      }
      s('dados_analista', JSON.stringify(d), '::jsonb');
    }
    if (!sets.length) return erro(res, 400, 'Nada para salvar.');
    await db.tx(async (t) => {
      await t.q(`UPDATE analises SET ${sets.join(', ')}, atualizado_em = now() WHERE id = $1`, args);
      const novos = b.dados_analista && b.dados_analista.ajustes ? Object.entries(b.dados_analista.ajustes).filter(([k, aj]) => aj && aj.valor !== undefined && aj.valor !== ''
        && JSON.stringify(aj) !== JSON.stringify(((a.dados_analista || {}).ajustes || {})[k])) : [];
      // ajustes ficam na trilha com quem, quando e por quê (no retorno, a nota não diz quem ajustou)
      for (const [campo, aj] of novos) await evento(t, a.id, req.usuario.id, 'ajuste', { campo, valor: aj.valor, justificativa: aj.justificativa });
      if (correcao) {
        const mudancas = mudancasFormulario(a.formulario || {}, b.formulario || {});
        if (mudancas.length) await evento(t, a.id, req.usuario.id, 'formulario_corrigido', { mudancas });
      } else if (b.formulario !== undefined) await evento(t, a.id, req.usuario.id, 'formulario', {});
    });
    res.json({ ok: true });
  });

  /* relatório colado de planilha → dados do analista */
  r.post('/api/credito/analises/:id/relatorio-colado', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.analisar) return erro(res, 403, 'Só o analista que assumiu a análise lança os dados.');
    const lido = lerRelatorioColado(req.body && req.body.texto);
    if (!lido.linhas) return erro(res, 400, lido.erros[0] || 'Nenhuma linha reconhecida.', { erros: lido.erros });
    res.json(lido);
  });

  /* resposta das skills do Claude colada inteira → o que vai para cada campo (nada é gravado aqui) */
  r.post('/api/credito/analises/:id/resultado-skill', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.analisar) return erro(res, 403, 'Só o analista que assumiu a análise lança os dados.');
    const lido = lerRespostaSkill(req.body && req.body.texto);
    if (!lido.achados.length) return erro(res, 400, 'Não reconheci a resposta da skill. Cole a resposta inteira do Claude, de preferência pelo botão Copiar.');
    res.json(lido);
  });

  /* ===================== documentos ===================== */
  r.post('/api/credito/analises/:id/documentos', corpoDoc, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { a, pd } = c;
    if (!pd.documentos) return erro(res, 403, 'Os documentos só mudam enquanto a solicitação está em rascunho, com pendência ou com o analista.');
    const tipo = String(req.headers['x-tipo'] || '');
    if (!TIPOS_DOC.includes(tipo)) return erro(res, 400, 'Tipo de documento inválido.');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return erro(res, 400, 'Arquivo vazio.');
    let nome = 'arquivo';
    try { nome = decodeURIComponent(String(req.headers['x-nome-arquivo'] || 'arquivo')); } catch { /* mantém */ }
    nome = nome.replace(/[\\/\r\n"]/g, '_').slice(0, 200) || 'arquivo';
    const pdf = buf.subarray(0, 5).toString('latin1') === '%PDF-';
    const mime = pdf ? 'application/pdf' : /^[\w.+-]+\/[\w.+-]+$/.test(String(req.headers['content-type'] || '')) ? String(req.headers['content-type']) : 'application/octet-stream';
    const sha = require('crypto').createHash('sha256').update(buf).digest('hex');
    const id = await db.tx(async (t) => {
      // convenção e relatório: um vigente por análise (o anterior fica no histórico)
      if (['convencao', 'relatorio'].includes(tipo)) await t.q('UPDATE analise_documentos SET substituido_em = now() WHERE analise_id = $1 AND tipo = $2 AND substituido_em IS NULL', [a.id, tipo]);
      const d = await t.um(`INSERT INTO analise_documentos (analise_id, tipo, nome, mime, tamanho, sha256, conteudo, enviado_por) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [a.id, tipo, nome, mime, buf.length, sha, buf, req.usuario.id]);
      await evento(t, a.id, req.usuario.id, 'documento', { tipo, nome, tamanho: buf.length });
      await t.q('UPDATE analises SET atualizado_em = now() WHERE id = $1', [a.id]);
      return d.id;
    });
    res.status(201).json({ id });
  });

  r.get('/api/credito/analises/:id/documentos/:did', async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const d = await db.um('SELECT * FROM analise_documentos WHERE id = $1 AND analise_id = $2', [Number(req.params.did) || 0, c.a.id]);
    if (!d || (d.tipo === 'retorno_pdf' && !c.pd.interno && c.a.etapa !== 'enviada')) return erro(res, 404, 'Documento não encontrado.');
    // PDF abre no navegador (para conferir lado a lado); o resto é sempre baixado
    const pdf = d.mime === 'application/pdf' && d.conteudo.subarray(0, 5).toString('latin1') === '%PDF-';
    res.set('Content-Type', pdf ? 'application/pdf' : 'application/octet-stream');
    res.set('Content-Disposition', `${pdf && req.query.ver === '1' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.nome)}`);
    res.set('Cache-Control', 'private, no-store');
    res.send(d.conteudo);
  });

  r.delete('/api/credito/analises/:id/documentos/:did', async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.documentos) return erro(res, 403, 'Os documentos não podem mais ser removidos.');
    const d = await db.um("SELECT id, tipo, nome FROM analise_documentos WHERE id = $1 AND analise_id = $2 AND tipo <> 'retorno_pdf'", [Number(req.params.did) || 0, c.a.id]);
    if (!d) return erro(res, 404, 'Documento não encontrado.');
    await db.tx(async (t) => {
      await t.q('DELETE FROM analise_documentos WHERE id = $1', [d.id]);
      await evento(t, c.a.id, req.usuario.id, 'documento_removido', { tipo: d.tipo, nome: d.nome });
    });
    res.json({ ok: true });
  });

  /* ===================== enviar para análise (documentação completa) ===================== */
  r.post('/api/credito/analises/:id/enviar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { a, p, pd } = c;
    if (!pd.enviar) return erro(res, 409, 'Esta solicitação já foi enviada.');
    const lista = await faltas(a);
    if (lista.length) return erro(res, 400, 'Faltam informações ou documentos para enviar.', { faltas: lista });
    const agora = new Date();
    const pz = prazos(agora, p.politica, false);
    const reenvio = a.etapa === 'pendencia';
    const protocolo = a.protocolo || await proximoProtocolo(db, agora, p.politica.protocolo_prefixo);
    const etapa = a.analista_id ? 'em_analise' : 'fila';
    await db.tx(async (t) => {
      await t.q(`UPDATE analises SET protocolo = $2, etapa = $3, documentacao_completa_em = $4, prazo_analista = $5, prazo_executivo = $6, atualizado_em = now() WHERE id = $1`,
        [a.id, protocolo, etapa, agora, pz.analista, pz.executivo]);
      await evento(t, a.id, req.usuario.id, reenvio ? 'reenviada' : 'enviada', { protocolo, prazo_analista: pz.analista, prazo_executivo: pz.executivo });
    });
    await seg.auditar(req, 'credito_enviada', null, { analise: a.id, protocolo, condominio: a.condominio });
    const origem = a.origem_id ? await db.um('SELECT analista_id FROM analises WHERE id = $1', [a.origem_id]) : null;
    const para = a.analista_id ? [a.analista_id] : [...(await analistas(p)), origem && origem.analista_id];
    const tipo = a.origem_id ? 'Reanálise' : reenvio ? 'Pendência respondida' : 'Nova análise de crédito';
    await avisos.notificar(para, {
      link: link(a.id), autor_id: req.usuario.id, tipo: 'credito', email: true,
      titulo: `${tipo} · ${protocolo} · ${a.condominio}`,
      texto: `${req.usuario.nome} enviou ${a.condominio} para análise de crédito. Prazo de resposta ao executivo: ${pz.executivo.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}.`,
    });
    res.json({ protocolo, etapa, prazo_analista: pz.analista, prazo_executivo: pz.executivo });
    // a IA lê os PDFs em segundo plano: o analista encontra os dados já lançados para conferir
    setImmediate(() => { lerDocumentos(a.id).catch(() => {}); });
  });

  /* o analista pede a leitura de novo (troca o que estiver lançado pelo que a IA ler) */
  r.post('/api/credito/analises/:id/ler', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.analisar) return erro(res, 403, 'Só o analista que assumiu a análise pede a leitura.');
    if (!extrator.ativo) return erro(res, 503, 'A leitura automática dos PDFs não está ligada: falta configurar ANTHROPIC_API_KEY no servidor.');
    const tipos = ['relatorio', 'convencao'].includes(req.body && req.body.tipo) ? [req.body.tipo] : ['relatorio', 'convencao'];
    if (lendo.has(c.a.id)) return res.status(202).json({ lendo: true });
    setImmediate(() => { lerDocumentos(c.a.id, { sobrescrever: true, tipos, usuarioId: req.usuario.id }).catch(() => {}); });
    res.status(202).json({ lendo: true });
  });

  /* ===================== analista ===================== */
  r.post('/api/credito/analises/:id/assumir', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { a, pd } = c;
    if (!pd.assumir) return erro(res, 409, 'Esta análise não pode ser assumida agora.');
    await db.tx(async (t) => {
      await t.q("UPDATE analises SET analista_id = $2, etapa = 'em_analise', assumida_em = COALESCE(assumida_em, now()), atualizado_em = now() WHERE id = $1", [a.id, req.usuario.id]);
      await evento(t, a.id, req.usuario.id, 'assumida', { de: a.analista_id || null });
    });
    if (a.analista_id) await avisos.notificar([a.analista_id], { link: link(a.id), autor_id: req.usuario.id, tipo: 'credito', email: false, titulo: `${a.protocolo} passou para ${req.usuario.nome}`, texto: `${req.usuario.nome} assumiu a análise de ${a.condominio}.` });
    res.json({ ok: true });
  });

  r.post('/api/credito/analises/:id/calcular', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.analisar) return erro(res, 403, 'Só o analista que assumiu a análise calcula.');
    try {
      const resultado = await calcular(c.a, req.usuario);
      res.json({ resultado });
    } catch (e) { if (e.status) return erro(res, e.status, e.message); throw e; }
  });

  /* prévia do retorno (não grava): o analista confere antes de liberar */
  r.get('/api/credito/analises/:id/previa.pdf', async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.analisar && !c.pd.chancelar) return erro(res, 403, 'Sem acesso à prévia.');
    const a = await db.um('SELECT * FROM analises WHERE id = $1', [c.a.id]);
    if (!a.resultado_motor) return erro(res, 400, 'Calcule a análise antes de ver o retorno.');
    const nome = c.pd.analisar ? req.usuario.nome : (await db.um('SELECT nome FROM usuarios WHERE id = $1', [a.analista_id]) || {}).nome;
    const { pdf } = await retorno.gerarPdf(retorno.montarDados(a.resultado_motor, await ctxRetorno(a, nome)));
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(retorno.nomeArquivo(a.condominio, a.protocolo || 'previa'))}`);
    res.set('Cache-Control', 'private, no-store');
    res.send(pdf);
  });

  /* devolve ao executivo com a lista do que falta (o prazo para e recomeça no reenvio) */
  r.post('/api/credito/analises/:id/pendencia', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { a, p } = c;
    if (!p.analista || !['fila', 'em_analise', 'validada'].includes(a.etapa)) return erro(res, 409, 'Esta análise não pode ser devolvida agora.');
    const itens = (Array.isArray(req.body && req.body.itens) ? req.body.itens : []).map((x) => texto(x, 500)).filter(Boolean);
    if (!itens.length) return erro(res, 400, 'Liste o que falta.');
    const ex = a.executivo_id ? await db.um('SELECT nome FROM executivos WHERE id = $1', [a.executivo_id]) : null;
    const mensagem = `Olá${ex ? `, ${ex.nome.split(' ')[0]}` : ''}. Para concluir a análise de crédito do ${a.condominio}${a.protocolo ? ` (${a.protocolo})` : ''}, precisamos de:\n\n${itens.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nAssim que tudo chegar, o prazo da análise volta a contar.`;
    await db.tx(async (t) => {
      await t.q("UPDATE analises SET etapa = 'pendencia', analista_id = COALESCE(analista_id, $2), prazo_analista = NULL, prazo_executivo = NULL, atualizado_em = now() WHERE id = $1", [a.id, req.usuario.id]);
      await evento(t, a.id, req.usuario.id, 'pendencia', { itens, mensagem });
    });
    await avisos.notificar(await donos(a), { link: link(a.id), autor_id: req.usuario.id, tipo: 'credito', email: true, titulo: `Pendência na análise de crédito · ${a.condominio}`, texto: mensagem });
    res.json({ ok: true, mensagem });
  });

  r.post('/api/credito/analises/:id/diretoria', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { a, p, pd } = c;
    if (!pd.analisar || a.etapa !== 'em_analise') return erro(res, 409, 'Esta análise não pode ir à diretoria agora.');
    const resultado = await calcular(a, req.usuario).catch((e) => { if (e.status) return e; throw e; });
    if (resultado instanceof Error) return erro(res, resultado.status, resultado.message);
    if (!resultado.diretoria) return erro(res, 400, 'Só análises com inadimplência entre 35% e 40% vão à diretoria.');
    const pz = prazos(new Date(a.documentacao_completa_em), p.politica, true);
    await db.tx(async (t) => {
      await t.q("UPDATE analises SET etapa = 'diretoria', prazo_executivo = $2, atualizado_em = now() WHERE id = $1", [a.id, pz.executivo]);
      await evento(t, a.id, req.usuario.id, 'diretoria', { observacao: texto(req.body && req.body.observacao, 2000) });
    });
    await avisos.notificar(await diretores(), { link: link(a.id), autor_id: req.usuario.id, tipo: 'credito', email: true, titulo: `Chancela da diretoria · ${a.protocolo} · ${a.condominio}`,
      texto: `${req.usuario.nome} enviou à diretoria a análise de ${a.condominio}: inadimplência de ${resultado.inad_media.toFixed(2).replace('.', ',')}%, ${resultado.status.rotulo}.` });
    res.json({ ok: true });
  });

  r.post('/api/credito/analises/:id/chancela', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { a, pd } = c;
    if (!pd.chancelar) return erro(res, 403, 'Só a diretoria chancela análises que estão com ela.');
    const aprovar = req.body && req.body.aprovar === true;
    const obs = texto(req.body && req.body.observacao, 2000);
    if (!aprovar && !obs) return erro(res, 400, 'Diga o motivo de não chancelar.');
    await db.tx(async (t) => {
      if (aprovar) await t.q("UPDATE analises SET etapa = 'validada', chancela_por = $2, chancela_em = now(), chancela_obs = $3, atualizado_em = now() WHERE id = $1", [a.id, req.usuario.id, obs || null]);
      else await t.q("UPDATE analises SET etapa = 'em_analise', chancela_obs = $2, atualizado_em = now() WHERE id = $1", [a.id, obs]);
      await evento(t, a.id, req.usuario.id, aprovar ? 'chancelada' : 'chancela_recusada', { observacao: obs });
    });
    await avisos.notificar([a.analista_id], { link: link(a.id), autor_id: req.usuario.id, tipo: 'credito', email: true,
      titulo: `${aprovar ? 'Chancelada' : 'Não chancelada'} pela diretoria · ${a.protocolo}`, texto: `${req.usuario.nome} ${aprovar ? 'chancelou' : 'não chancelou'} a análise de ${a.condominio}${obs ? `: ${obs}` : '.'}` });
    res.json({ ok: true });
  });

  /* valida e libera o retorno ao executivo: recalcula, gera o PDF assinado pelo analista e avisa */
  r.post('/api/credito/analises/:id/liberar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { a, pd } = c;
    if (!pd.analisar) return erro(res, 403, 'Só o analista que assumiu a análise libera o retorno.');
    let resultado;
    try { resultado = await calcular(a, req.usuario); } catch (e) { if (e.status) return erro(res, e.status, e.message); throw e; }
    if (resultado.status.codigo === 'pendente') return erro(res, 400, 'A análise está pendente: devolva ao executivo com a lista do que falta.');
    if (resultado.diretoria && !a.chancela_em) return erro(res, 400, 'Inadimplência acima de 35%: envie à diretoria antes de liberar.');
    const atual = await db.um('SELECT * FROM analises WHERE id = $1', [a.id]);
    const ctx = await ctxRetorno(atual, req.usuario.nome);
    const { pdf, condensado } = await retorno.gerarPdf(retorno.montarDados(resultado, ctx));
    const email = retorno.emailEntrega(resultado, ctx);
    const resumo = retorno.resumoExecutivo(resultado, ctx);
    const nomeArq = retorno.nomeArquivo(atual.condominio, atual.protocolo);
    await db.tx(async (t) => {
      await t.q("UPDATE analise_documentos SET substituido_em = now() WHERE analise_id = $1 AND tipo = 'retorno_pdf' AND substituido_em IS NULL", [a.id]);
      await t.q(`INSERT INTO analise_documentos (analise_id, tipo, nome, mime, tamanho, sha256, conteudo, paginas, enviado_por) VALUES ($1, 'retorno_pdf', $2, 'application/pdf', $3, $4, $5, 4, $6)`,
        [a.id, nomeArq, pdf.length, require('crypto').createHash('sha256').update(pdf).digest('hex'), pdf, req.usuario.id]);
      await t.q("UPDATE analises SET etapa = 'enviada', liberada_por = $2, liberada_em = now(), enviada_em = now(), atualizado_em = now() WHERE id = $1", [a.id, req.usuario.id]);
      await evento(t, a.id, req.usuario.id, 'liberada', { status: resultado.status.rotulo, condensado, resumo });
    });
    await seg.auditar(req, 'credito_liberada', null, { analise: a.id, protocolo: atual.protocolo, status: resultado.status.rotulo });
    await avisos.notificar(await donos(a), { link: link(a.id), autor_id: req.usuario.id, tipo: 'credito', email: true, titulo: email.assunto, texto: email.corpo.replace(/\n+/g, ' ').replace('Detalhes e próximos passos no PDF.', 'O PDF está no portal, com os detalhes e os próximos passos.') });
    res.json({ ok: true, email, resumo });
  });

  /* ===================== executivo: reanálise e cancelamento ===================== */
  r.post('/api/credito/analises/:id/reanalise', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { a, pd } = c;
    if (!pd.reanalise) return erro(res, 409, 'Só análises já enviadas podem ser reanalisadas.');
    const motivo = texto(req.body && req.body.motivo, 1000);
    if (!motivo) return erro(res, 400, 'Diga o motivo da reanálise.');
    const id = await db.tx(async (t) => {
      const { id: novo } = await t.um(`INSERT INTO analises (etapa, origem_id, motivo_reanalise, condominio, cnpj, uf, cidade, tipo_contratacao, executivo_id, solicitante_id, formulario)
        VALUES ('rascunho', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb) RETURNING id`, [a.id, motivo, a.condominio, a.cnpj, a.uf, a.cidade, a.tipo_contratacao, a.executivo_id, req.usuario.id, JSON.stringify(a.formulario || {})]);
      // a convenção não muda: vai junto; o relatório de inadimplência é sempre novo
      await t.q(`INSERT INTO analise_documentos (analise_id, tipo, nome, mime, tamanho, sha256, conteudo, enviado_por, enviado_em)
        SELECT $1, tipo, nome, mime, tamanho, sha256, conteudo, enviado_por, enviado_em FROM analise_documentos WHERE analise_id = $2 AND tipo IN ('convencao', 'ata_extra') AND substituido_em IS NULL`, [novo, a.id]);
      await evento(t, novo, req.usuario.id, 'criada', { reanalise_de: a.protocolo, motivo });
      await evento(t, a.id, req.usuario.id, 'reanalise_pedida', { motivo });
      return novo;
    });
    res.status(201).json({ id });
  });

  r.post('/api/credito/analises/:id/cancelar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    if (!c.pd.cancelar) return erro(res, 403, 'Esta análise não pode ser cancelada.');
    await db.tx(async (t) => {
      await t.q("UPDATE analises SET etapa = 'cancelada', atualizado_em = now() WHERE id = $1", [c.a.id]);
      await evento(t, c.a.id, req.usuario.id, 'cancelada', { motivo: texto(req.body && req.body.motivo, 1000) });
    });
    res.json({ ok: true });
  });

  /* ===================== cadastros: executivos, diretoria e política (administração) ===================== */
  const soAdmin = (req, res, next) => (req.usuario.papel === 'admin' ? next() : erro(res, 403, 'Só a administração.'));

  r.get('/api/credito/executivos', async (req, res) => {
    const p = await perfil(req.usuario);
    if (!p.analista) return erro(res, 403, 'Só o setor Análise de Crédito e a administração.');
    res.json({ executivos: (await db.q('SELECT e.*, u.nome AS usuario_nome, u.email AS usuario_email FROM executivos e LEFT JOIN usuarios u ON u.id = e.usuario_id ORDER BY e.ativo DESC, e.nome')).rows,
      usuarios: p.admin ? (await db.q('SELECT id, nome, email FROM usuarios WHERE ativo ORDER BY nome')).rows : [] });
  });

  function lerExecutivo(b) {
    const boleto = b.boleto === '' || b.boleto === null || b.boleto === undefined ? null : Number(String(b.boleto).replace(',', '.'));
    if (boleto !== null && !(boleto > 0)) throw Object.assign(new Error('Boleto inválido.'), { status: 400 });
    return [texto(b.nome, 120), texto(b.email, 200) || null, texto(b.uf, 2).toUpperCase(), texto(b.regiao, 120), boleto, Number(b.usuario_id) || null, b.ativo !== false];
  }
  r.post('/api/credito/executivos', soAdmin, json, async (req, res) => {
    try {
      const v = lerExecutivo(req.body || {});
      if (!v[0]) return erro(res, 400, 'Informe o nome.');
      const ex = await db.um('INSERT INTO executivos (nome, email, uf, regiao, boleto, usuario_id, ativo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', v);
      await seg.auditar(req, 'credito_executivo', null, { id: ex.id, nome: v[0] });
      res.status(201).json({ id: ex.id });
    } catch (e) { if (e.status) return erro(res, e.status, e.message); if (e.code === '23505') return erro(res, 409, 'Já existe um executivo com esse nome.'); throw e; }
  });
  r.patch('/api/credito/executivos/:eid', soAdmin, json, async (req, res) => {
    try {
      const v = lerExecutivo(req.body || {});
      if (!v[0]) return erro(res, 400, 'Informe o nome.');
      const r0 = await db.q('UPDATE executivos SET nome = $1, email = $2, uf = $3, regiao = $4, boleto = $5, usuario_id = $6, ativo = $7, atualizado_em = now() WHERE id = $8', [...v, Number(req.params.eid) || 0]);
      if (!r0.n) return erro(res, 404, 'Executivo não encontrado.');
      await seg.auditar(req, 'credito_executivo', null, { id: Number(req.params.eid), nome: v[0] });
      res.json({ ok: true });
    } catch (e) { if (e.status) return erro(res, e.status, e.message); if (e.code === '23505') return erro(res, 409, 'Já existe um executivo com esse nome.'); throw e; }
  });

  /* pessoas e papéis: a administração escolhe, entre os usuários do portal, quem é executivo, analista e diretoria */
  r.get('/api/credito/pessoas', soAdmin, async (req, res) => {
    const pol = await politicaAtiva(db);
    const setor = await db.um('SELECT id FROM setores WHERE nome = $1', [pol.setor_analistas]);
    const membros = new Set(setor ? (await db.q('SELECT usuario_id FROM setor_membros WHERE setor_id = $1', [setor.id])).rows.map((x) => x.usuario_id) : []);
    const diretoria = new Set((await regras.regras()).get('credito.diretoria').pessoas);
    const execs = (await db.q('SELECT id, usuario_id, nome, email, uf, regiao, boleto, ativo FROM executivos ORDER BY nome')).rows;
    const porUsuario = new Map(execs.filter((e) => e.usuario_id).map((e) => [e.usuario_id, e]));
    const usuarios = (await db.q('SELECT id, nome, email, papel FROM usuarios WHERE ativo ORDER BY nome')).rows;
    res.json({
      setor_analistas: pol.setor_analistas,
      pessoas: usuarios.map((u) => {
        const e = porUsuario.get(u.id);
        return { id: u.id, nome: u.nome, email: u.email, papel: u.papel, analista: membros.has(u.id), diretoria: diretoria.has(u.id),
          executivo: e ? { id: e.id, ativo: e.ativo, uf: e.uf, regiao: e.regiao, boleto: e.boleto === null ? null : Number(e.boleto) } : null };
      }),
      executivos_sem_usuario: execs.filter((e) => !e.usuario_id),
    });
  });

  r.put('/api/credito/pessoas/:uid', soAdmin, json, async (req, res) => {
    const u = await db.um('SELECT id, nome, email FROM usuarios WHERE id = $1 AND ativo', [Number(req.params.uid) || 0]);
    if (!u) return erro(res, 404, 'Usuário não encontrado.');
    const b = req.body || {};
    const pol = await politicaAtiva(db);
    try {
      if (b.executivo !== undefined) {
        const ex = b.executivo || {};
        const atual = await db.um('SELECT id FROM executivos WHERE usuario_id = $1', [u.id]);
        if (ex.ativo) {
          const boleto = ex.boleto === '' || ex.boleto === null || ex.boleto === undefined ? null : Number(String(ex.boleto).replace(',', '.'));
          if (boleto !== null && !(boleto > 0)) return erro(res, 400, 'Boleto inválido.');
          const campos = [texto(ex.uf, 2).toUpperCase(), texto(ex.regiao, 120), boleto];
          // cadastro antigo com o mesmo nome e sem usuário: passa a ser desta pessoa
          const mesmoNome = atual ? null : await db.um('SELECT id FROM executivos WHERE usuario_id IS NULL AND lower(nome) = lower($1)', [u.nome]);
          const alvo = atual || mesmoNome;
          if (alvo) await db.q('UPDATE executivos SET usuario_id = $1, uf = $2, regiao = $3, boleto = $4, ativo = TRUE, atualizado_em = now() WHERE id = $5', [u.id, ...campos, alvo.id]);
          else await db.q('INSERT INTO executivos (nome, email, uf, regiao, boleto, usuario_id) VALUES ($1, $2, $3, $4, $5, $6)', [u.nome, u.email, ...campos, u.id]);
        } else if (atual) {
          // o cadastro fica (as análises antigas apontam para ele), só deixa de valer
          await db.q('UPDATE executivos SET ativo = FALSE, atualizado_em = now() WHERE id = $1', [atual.id]);
        }
      }
      if (b.analista !== undefined) {
        let setor = await db.um('SELECT id FROM setores WHERE nome = $1', [pol.setor_analistas]);
        if (!setor && b.analista) setor = await db.um("INSERT INTO setores (nome, ordem) VALUES ($1, 14) RETURNING id", [pol.setor_analistas]);
        if (setor && b.analista) await db.q('INSERT INTO setor_membros (setor_id, usuario_id, lider) VALUES ($1, $2, FALSE) ON CONFLICT DO NOTHING', [setor.id, u.id]);
        else if (setor) await db.q('DELETE FROM setor_membros WHERE setor_id = $1 AND usuario_id = $2', [setor.id, u.id]);
      }
      if (b.diretoria !== undefined) {
        const atuais = (await regras.regras()).get('credito.diretoria').pessoas.filter((x) => x !== u.id);
        await regras.salvar('credito.diretoria', { niveis: [], setores: [], pessoas: b.diretoria ? [...atuais, u.id] : atuais }, req.usuario);
      }
    } catch (e) { if (e.code === '23505') return erro(res, 409, `Já existe outro executivo com o nome ${u.nome}.`); throw e; }
    await seg.auditar(req, 'credito_papeis', null, { usuario: u.id, nome: u.nome, executivo: b.executivo && !!b.executivo.ativo, analista: b.analista, diretoria: b.diretoria });
    res.json({ ok: true });
  });

  r.get('/api/credito/diretoria', soAdmin, async (req, res) => {
    const pessoas = (await regras.regras()).get('credito.diretoria').pessoas;
    res.json({ pessoas, usuarios: (await db.q('SELECT id, nome, email FROM usuarios WHERE ativo ORDER BY nome')).rows });
  });
  r.put('/api/credito/diretoria', soAdmin, json, async (req, res) => {
    const salva = await regras.salvar('credito.diretoria', { niveis: [], setores: [], pessoas: (req.body && req.body.pessoas) || [] }, req.usuario);
    await seg.auditar(req, 'credito_diretoria', null, { pessoas: salva.pessoas });
    res.json({ pessoas: salva.pessoas });
  });

  r.get('/api/credito/politica', async (req, res) => {
    const p = await perfil(req.usuario);
    if (!p.analista && !p.diretoria) return erro(res, 403, 'Só o setor Análise de Crédito, a diretoria e a administração.');
    const versoes = (await db.q('SELECT versao, descricao, ativa, vigente_desde, criado_em FROM parametros_politica ORDER BY criado_em DESC')).rows;
    res.json({ ativa: p.politica, versoes });
  });
  r.post('/api/credito/politica', soAdmin, json, async (req, res) => {
    const atual = await politicaAtiva(db);
    const b = req.body || {};
    const nova = { ...atual, ...(b.parametros || {}), versao: texto(b.versao, 40), descricao: texto(b.descricao, 300), faixas: Array.isArray(b.faixas) ? b.faixas.map((f) => ({ ate: Number(f.ate), taxa_adm: Number(f.taxa_adm) })) : atual.faixas };
    if (!nova.versao) return erro(res, 400, 'Dê um nome à versão (ex.: 1.3).');
    if (await db.um('SELECT 1 FROM parametros_politica WHERE versao = $1', [nova.versao])) return erro(res, 409, 'Já existe uma versão com esse nome.');
    const problemas = validarPolitica(nova);
    if (problemas.length) return erro(res, 400, `Política inválida: ${problemas.join('; ')}`);
    await db.tx((t) => gravarPolitica(t, nova, { ativa: true, criadoPor: req.usuario.id }));
    await seg.auditar(req, 'credito_politica', null, { versao: nova.versao });
    res.status(201).json({ versao: nova.versao });
  });

  return r;
}

module.exports = { rotasCredito, ETAPAS };

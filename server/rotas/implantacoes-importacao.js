'use strict';
/*
 * Importar o histórico das planilhas da Implantação (Formulário de implantação + Controle Implantações), pela aba
 * Parâmetros do Acompanhamento. Só a coordenação de Implantação e a administração.
 *   POST /api/implantacoes/importacao/previa   { formulario, controle } (arquivos em base64) → conferência, nada gravado
 *   POST /api/implantacoes/importacao          { formulario, controle, incluir: [chaves], pular: [chaves] } → importa um lote
 *   GET  /api/implantacoes/importacao          → lotes
 *   POST /api/implantacoes/importacao/:id/desfazer
 * As regras de conferência estão em server/implantacoes/importacao.js. As importadas são histórico: não geram avisos,
 * prazos, cobranças, ficha de repasse nem envio ao Controle de Repasses, e não entram nas filas do setor.
 */
const express = require('express');
const I = require('../implantacoes/importacao');
const M = require('../implantacoes/metas');
const { lerPlanilha } = require('../planilha');

const jsonGrande = express.json({ limit: '25mb' });
const meioDia = (d) => (d ? `${d}T12:00:00-03:00` : null);

function rotasImportacao(r, { db, erro, perfil, historicoParametros }) {
  async function pode(req, res) {
    const p = await perfil(req.usuario);
    if (!(p.coordenacao || p.admin)) { erro(res, 403, 'Só a coordenação do setor Implantação e a administração importam o histórico.'); return false; }
    return true;
  }
  function arquivos(b) {
    const ler = (x, nome) => {
      if (!x) return null;
      const buf = Buffer.from(String(x), 'base64');
      if (!buf.length) throw new Error(`O arquivo ${nome} veio vazio.`);
      return lerPlanilha(buf);
    };
    const formulario = ler(b.formulario, 'do Formulário');
    if (!formulario) throw new Error('Envie o arquivo do Formulário de implantação.');
    return { formulario, controle: ler(b.controle, 'do Controle') };
  }
  async function portal() {
    return {
      // as do portal e as importadas antes que ficaram (editadas depois de uma importação desfeita)
      implantacoes: (await db.q("SELECT id, COALESCE(protocolo, 'Nº ' || numero_planilha) AS protocolo, cnpj, condominio FROM implantacoes WHERE etapa <> 'cancelada' AND cnpj <> ''")).rows,
      condominios: (await db.q('SELECT id, codigo, nome, razao_social, cnpj FROM condominios')).rows,
      executivos: (await db.q('SELECT e.id, e.nome, u.email FROM executivos e LEFT JOIN usuarios u ON u.id = e.usuario_id')).rows,
      equipe: (await db.q(`SELECT u.id, u.nome FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id JOIN usuarios u ON u.id = sm.usuario_id
        WHERE s.nome = 'Implantação'`)).rows,
    };
  }
  const leve = (x) => ({ chave: x.chave, fonte: x.fonte, numero: x.numero, linha_forms: x.linha_forms, ano: x.ano, condominio: x.condominio, cnpj: x.cnpj, uf: x.uf,
    inicio: x.inicio, mes: x.mes, pct: x.pct_planilha == null ? (x.fonte === 'formulario' ? 100 : null) : x.pct_planilha, concluida: x.concluida,
    executivo: x.executivo ? x.executivo.nome : '', executivo_achado: !!(x.executivo && x.executivo.id), responsavel: x.responsavel ? x.responsavel.nome : '',
    responsavel_achado: !!(x.responsavel && x.responsavel.id), carteira: x.carteira ? x.carteira.codigo : '', situacao: x.situacao, motivo: x.motivo, avisos: x.avisos });
  const loteAtivo = () => db.um('SELECT id, criado_em FROM implantacao_importacoes WHERE desfeita_em IS NULL ORDER BY id DESC LIMIT 1');

  r.post('/api/implantacoes/importacao/previa', jsonGrande, async (req, res) => {
    if (!(await pode(req, res))) return;
    let plano;
    try { plano = I.conferir(arquivos(req.body || {}), await portal()); } catch (e) { return erro(res, 400, e.message); }
    res.json({ resumo: plano.resumo, itens: plano.itens.map(leve), lote_ativo: await loteAtivo() });
  });

  r.post('/api/implantacoes/importacao', jsonGrande, async (req, res) => {
    if (!(await pode(req, res))) return;
    const ativo = await loteAtivo();
    if (ativo) return erro(res, 409, 'Já existe uma importação ativa. Para importar de novo, desfaça a anterior.');
    const b = req.body || {};
    let plano;
    try { plano = I.conferir(arquivos(b), await portal()); } catch (e) { return erro(res, 400, e.message); }
    const incluir = new Set(Array.isArray(b.incluir) ? b.incluir.map(String) : []);
    const pular = new Set(Array.isArray(b.pular) ? b.pular.map(String) : []);
    const entra = plano.itens.filter((x) => !pular.has(x.chave) && (['pronta', 'aviso'].includes(x.situacao) || (x.situacao === 'decisao' && incluir.has(x.chave))));
    const fora = plano.itens.filter((x) => !entra.includes(x)).map((x) => ({ chave: x.chave, numero: x.numero, condominio: x.condominio,
      motivo: x.motivo || (pular.has(x.chave) ? 'deixada de fora na prévia' : 'precisa de decisão') }));
    const historico = await historicoParametros(db);
    const id = await db.tx(async (t) => {
      const { id: lote } = await t.um('INSERT INTO implantacao_importacoes (criado_por, resumo, fora) VALUES ($1, $2::jsonb, $3::jsonb) RETURNING id',
        [req.usuario.id, JSON.stringify({ ...plano.resumo, importadas: entra.length }), JSON.stringify(fora)]);
      for (const x of entra) {
        const concluida = !!x.concluida;
        const resp = x.responsavel && x.responsavel.id;
        let etapas = {};
        if (x.etapas) {
          const { vouchFeito, ...e } = x.etapas;
          e.vouch = { id: x.carteira ? x.carteira.codigo : vouchFeito ? `planilha-${x.numero}` : '' };
          e.onboarding = { ...e.onboarding, por: resp || null };
          etapas = e;
        }
        const enviado = meioDia(x.enviado || x.inicio);
        const imp = { fonte: x.fonte, linha_forms: x.linha_forms, avisos: x.avisos, pct_planilha: x.pct_planilha == null ? null : x.pct_planilha,
          executivo: x.executivo && !x.executivo.id ? x.executivo.nome : '', implantado_por: x.responsavel && !x.responsavel.id ? x.responsavel.nome : '' };
        const { id: novo } = await t.um(`INSERT INTO implantacoes (etapa, origem, condominio, cnpj, uf, executivo_id, responsavel_id, designado_em, iniciado_em, formulario, etapas,
            enviado_em, concluido_em, condominio_id, importacao_id, numero_planilha, importacao, obs_controle)
          VALUES ($1, 'planilha', $2, $3, $4, $5, $6, $7, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb) RETURNING id`,
        [concluida ? 'na_carteira' : 'em_implantacao', x.condominio || '', x.formulario.sem_cnpj ? '' : x.cnpj || '', x.uf || '', x.executivo ? x.executivo.id : null, resp || null,
          resp ? enviado : null, JSON.stringify(x.formulario), JSON.stringify(etapas), enviado, concluida ? enviado : null, x.carteira ? x.carteira.id : null, lote, x.numero,
          JSON.stringify(imp), x.obs ? JSON.stringify({ texto: x.obs, por_nome: 'planilha', em: new Date().toISOString() }) : null]);
        // documentação conferida no Controle: os documentos da meta contam como recebidos (sem arquivo) na DATA DOC.
        if (x.etapas && x.etapas.documentacao.feito && x.data_doc) {
          const p = M.parametrosEm(historico, x.data_doc);
          for (const tipo of p.docs_meta) {
            await t.q(`INSERT INTO implantacao_documentos (implantacao_id, tipo, nome, mime, tamanho, sem_arquivo, observacao, enviado_por, enviado_em)
              VALUES ($1, $2, 'Recebido sem arquivo', 'text/plain', 0, TRUE, $3, $4, $5)`, [novo, tipo, `Importado da planilha (DOC. SIM em ${x.data_doc.split('-').reverse().join('/')})`, req.usuario.id, meioDia(x.data_doc)]);
          }
        }
        await t.q('INSERT INTO implantacao_eventos (implantacao_id, usuario_id, tipo, detalhe) VALUES ($1, $2, $3, $4::jsonb)',
          [novo, req.usuario.id, 'importada', JSON.stringify({ lote, fonte: x.fonte, numero: x.numero })]);
      }
      return lote;
    });
    res.status(201).json({ ok: true, lote: id, importadas: entra.length, fora: fora.length });
  });

  r.get('/api/implantacoes/importacao', async (req, res) => {
    if (!(await pode(req, res))) return;
    const { rows } = await db.q(`SELECT l.id, l.criado_em, l.resumo, l.fora, l.desfeita_em, u.nome AS criado_por_nome, ud.nome AS desfeita_por_nome,
        (SELECT COUNT(*)::int FROM implantacoes i WHERE i.importacao_id = l.id) AS ativas
      FROM implantacao_importacoes l LEFT JOIN usuarios u ON u.id = l.criado_por LEFT JOIN usuarios ud ON ud.id = l.desfeita_por ORDER BY l.id DESC`);
    res.json({ lotes: rows });
  });

  /* desfazer: apaga o que o lote criou e ninguém mexeu depois; o que já foi editado no portal fica (e aparece na resposta) */
  r.post('/api/implantacoes/importacao/:id/desfazer', jsonGrande, async (req, res) => {
    if (!(await pode(req, res))) return;
    const lote = await db.um('SELECT * FROM implantacao_importacoes WHERE id = $1 AND desfeita_em IS NULL', [Number(req.params.id) || 0]);
    if (!lote) return erro(res, 404, 'Importação não encontrada (ou já desfeita).');
    const mexidas = (await db.q(`SELECT i.id, i.numero_planilha, i.condominio FROM implantacoes i WHERE i.importacao_id = $1
      AND (i.atualizado_em > $2::timestamptz + interval '5 seconds' OR EXISTS (SELECT 1 FROM implantacao_eventos ev WHERE ev.implantacao_id = i.id AND ev.tipo <> 'importada'))`,
    [lote.id, lote.criado_em])).rows;
    const n = await db.tx(async (t) => {
      const apagadas = (await t.q(`DELETE FROM implantacoes WHERE importacao_id = $1 AND NOT (id = ANY($2::int[])) RETURNING id`, [lote.id, mexidas.map((x) => x.id)])).rows.length;
      await t.q('UPDATE implantacao_importacoes SET desfeita_em = now(), desfeita_por = $2 WHERE id = $1', [lote.id, req.usuario.id]);
      return apagadas;
    });
    res.json({ ok: true, apagadas: n, mantidas: mexidas });
  });
}

module.exports = { rotasImportacao };

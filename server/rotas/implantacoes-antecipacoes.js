'use strict';
/*
 * Antecipação negociada no formulário → Controle de Repasses (ferramenta 'repasses'):
 *  - a equipe de Implantação marca e envia pela aba Antecipações do Acompanhamento (ou reenvia como atualização quando o
 *    formulário muda depois do cadastro, com o antes e o depois);
 *  - na ferramenta, quem tem o papel Gestor (dado no portal) cadastra a regra, com ajuste ou não, ou devolve com o motivo:
 *      GET  /api/repasses/antecipacoes                → { itens: [...] } (as que esperam o Gestor)
 *      POST /api/repasses/antecipacoes/:id/cadastrar  { regra_id, valor, dia, modo, fim, obs }
 *      POST /api/repasses/antecipacoes/:id/devolver   { motivo }
 *    (liberado para a ferramenta isolada em permitidoParaFerramenta, server/seguranca.js)
 *  - a situação volta para a implantação: Cadastrada, Cadastrada com ajuste (o que mudou) ou Devolvida com o motivo.
 */
const SLUG = 'repasses';
const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const reais = (v) => (num(v) == null ? '' : num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/* o que vai para o Controle de Repasses, a partir do formulário (dia: o da data; fim: o mês da última parcela) */
function montarEnvio(i) {
  const f = i.formulario || {};
  if (f.antecipacao !== 'sim') return null;
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(f.antecipacao_data || '')) ? f.antecipacao_data : '';
  const prazo = texto(f.antecipacao_prazo, 120);
  const n = /permanente/i.test(prazo) ? null : Number((/(\d+)/.exec(prazo) || [])[1]) || null;
  let fim = '';
  if (data && n) {
    const [a, m] = data.split('-').map(Number);
    const t = a * 12 + (m - 1) + (n - 1);
    fim = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  }
  return { valor: num(f.antecipacao_valor) || 0, data, dia: data ? Number(data.slice(8, 10)) : null, prazo, fim };
}
const CAMPOS = ['valor', 'dia', 'fim', 'prazo'];
const igual = (a, b) => CAMPOS.every((k) => String(a && a[k] != null ? a[k] : '') === String(b && b[k] != null ? b[k] : ''));

function rotasAntecipacoes(r, deps) {
  const { db, avisos, erro, evento, json, link, coordenacao, carregar, acessos } = deps;

  /* ---------- Implantação: marcar e enviar ---------- */
  r.post('/api/implantacoes/:id/antecipacao/enviar', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, p, pd } = c;
    if (!(p.coordenacao || p.admin || pd.editar_setor)) return erro(res, 403, 'Só quem conduz a implantação (ou tem autorização) e a coordenação enviam a antecipação.');
    if (['rascunho', 'diretoria', 'cancelada'].includes(i.etapa)) return erro(res, 409, 'A implantação ainda não foi enviada ao setor.');
    const envio = montarEnvio(i);
    if (!envio) return erro(res, 409, 'O formulário não tem antecipação negociada.');
    if (!(envio.valor > 0) || !envio.data) return erro(res, 400, 'O formulário precisa do valor e da data da antecipação.');
    const atual = await db.um('SELECT * FROM implantacao_antecipacoes WHERE implantacao_id = $1', [i.id]);
    const base = atual && (atual.cadastrado || (atual.situacao !== 'devolvida' ? atual.enviado : null));
    if (atual && atual.situacao === 'enviada' && igual(atual.enviado, envio)) return erro(res, 409, 'Esta antecipação já está com o Controle de Repasses.');
    if (atual && atual.situacao === 'cadastrada' && igual(atual.enviado, envio)) return erro(res, 409, 'A antecipação já está cadastrada assim no Controle de Repasses.');
    // atualização: já foi cadastrada (tem regra) e o formulário mudou
    const atualizacao = !!(atual && atual.regra_id);
    const antes = atualizacao ? base : null;
    await db.tx(async (t) => {
      await t.q(`INSERT INTO implantacao_antecipacoes (implantacao_id, situacao, atualizacao, enviado, antes, enviada_por, enviada_em, regra_id)
        VALUES ($1, 'enviada', $2, $3::jsonb, $4::jsonb, $5, now(), $6)
        ON CONFLICT (implantacao_id) DO UPDATE SET situacao = 'enviada', atualizacao = EXCLUDED.atualizacao, enviado = EXCLUDED.enviado, antes = EXCLUDED.antes,
          enviada_por = EXCLUDED.enviada_por, enviada_em = now(), motivo = ''`,
      [i.id, atualizacao, JSON.stringify(envio), antes ? JSON.stringify(antes) : null, req.usuario.id, atual ? atual.regra_id : null]);
      await evento(t, i.id, req.usuario.id, 'antecipacao_enviada', { ...envio, atualizacao });
    });
    res.json({ ok: true, atualizacao, enviado: envio });
  });

  /* desfazer o envio (antes de o Gestor decidir): a nova sai da lista; a atualização volta ao que estava cadastrado */
  r.post('/api/implantacoes/:id/antecipacao/desfazer', json, async (req, res) => {
    const c = await carregar(req, res);
    if (!c) return;
    const { i, p, pd } = c;
    if (!(p.coordenacao || p.admin || pd.editar_setor)) return erro(res, 403, 'Só quem conduz a implantação (ou tem autorização) e a coordenação desfazem o envio.');
    const atual = await db.um('SELECT * FROM implantacao_antecipacoes WHERE implantacao_id = $1', [i.id]);
    if (!atual || atual.situacao !== 'enviada') return erro(res, 409, 'Não há envio esperando o Gestor.');
    await db.tx(async (t) => {
      if (atual.atualizacao && atual.antes) {
        await t.q("UPDATE implantacao_antecipacoes SET situacao = 'cadastrada', enviado = $2::jsonb, antes = NULL, atualizacao = FALSE WHERE implantacao_id = $1", [i.id, JSON.stringify(atual.antes)]);
      } else await t.q('DELETE FROM implantacao_antecipacoes WHERE implantacao_id = $1', [i.id]);
      await evento(t, i.id, req.usuario.id, 'antecipacao_desfeita', {});
    });
    res.json({ ok: true });
  });

  /* ---------- Controle de Repasses ---------- */
  async function acessoRepasses(req, res, gestor) {
    const m = await db.um('SELECT * FROM modulos WHERE slug = $1', [SLUG]);
    const a = m && acessos ? await acessos.acessoDe(req.usuario, m) : { abre: req.usuario.papel === 'admin', somente_leitura: false, papeis: [] };
    if (!a.abre) { erro(res, 403, 'Sem acesso ao Controle de Repasses.'); return null; }
    if (gestor && (a.somente_leitura || !(req.usuario.papel === 'admin' || a.papeis.some((x) => ['gestor', 'gestao'].includes(String(x).toLowerCase()))))) {
      erro(res, 403, 'Só quem tem o papel Gestor no Controle de Repasses cadastra ou devolve.');
      return null;
    }
    return a;
  }
  const item = (x) => ({
    id: x.implantacao_id, tipo: x.atualizacao ? 'atualizacao' : 'nova', protocolo: x.protocolo, implantacao_id: x.implantacao_id,
    condominio: { nome: x.condominio_nome || x.condominio, comarca: x.uf || '' }, executivo: x.executivo_nome || '',
    valor: x.enviado.valor, data: x.enviado.data, dia: x.enviado.dia, prazo: x.enviado.prazo, fim: x.enviado.fim,
    enviado_por: x.enviada_por_nome || '', enviado_em: x.enviada_em, ...(x.regra_id ? { regra_id: x.regra_id } : {}), ...(x.antes ? { antes: x.antes } : {}),
    na_carteira: !!x.condominio_id,
  });
  const SELECT = `SELECT a.*, i.protocolo, i.condominio, i.uf, i.condominio_id, i.responsavel_id, c.nome AS condominio_nome, e.nome AS executivo_nome, u.nome AS enviada_por_nome
    FROM implantacao_antecipacoes a JOIN implantacoes i ON i.id = a.implantacao_id LEFT JOIN condominios c ON c.id = i.condominio_id
    LEFT JOIN executivos e ON e.id = i.executivo_id LEFT JOIN usuarios u ON u.id = a.enviada_por`;

  r.get('/api/repasses/antecipacoes', async (req, res) => {
    if (!(await acessoRepasses(req, res, false))) return;
    const { rows } = await db.q(`${SELECT} WHERE a.situacao = 'enviada' AND i.etapa <> 'cancelada' ORDER BY a.enviada_em`);
    res.json({ itens: rows.map(item) });
  });

  async function decidir(req, res, fn) {
    if (!(await acessoRepasses(req, res, true))) return;
    const x = await db.um(`${SELECT} WHERE a.implantacao_id = $1`, [Number(req.params.id) || 0]);
    if (!x) return erro(res, 404, 'Antecipação não encontrada.');
    if (x.situacao !== 'enviada') return erro(res, 409, 'Esta antecipação já foi decidida.');
    return fn(x);
  }
  const avisar = async (x, titulo, txt, autor) => avisos.notificar([x.responsavel_id, x.enviada_por, ...await coordenacao()].filter(Boolean), {
    link: link(x.implantacao_id), autor_id: autor, tipo: 'implantacao', email: false, titulo, texto: txt });

  r.post('/api/repasses/antecipacoes/:id/cadastrar', json, (req, res) => decidir(req, res, async (x) => {
    const b = req.body || {};
    const regra = texto(b.regra_id, 80);
    if (!regra) return erro(res, 400, 'Informe a regra criada no Controle de Repasses.');
    const cad = { valor: num(b.valor) ?? x.enviado.valor, dia: num(b.dia) ?? x.enviado.dia, fim: texto(b.fim, 7) || '', prazo: x.enviado.prazo, modo: texto(b.modo, 20), obs: texto(b.obs, 500) };
    if (!(cad.valor > 0)) return erro(res, 400, 'Valor inválido.');
    if (!(cad.dia >= 1 && cad.dia <= 31)) return erro(res, 400, 'Dia inválido.');
    const ajuste = {};
    for (const k of ['valor', 'dia', 'fim']) if (String(cad[k] ?? '') !== String(x.enviado[k] ?? '')) ajuste[k] = { de: x.enviado[k] ?? '', para: cad[k] };
    const temAjuste = Object.keys(ajuste).length > 0;
    await db.tx(async (t) => {
      await t.q(`UPDATE implantacao_antecipacoes SET situacao = 'cadastrada', regra_id = $2, cadastrado = $3::jsonb, ajuste = $4::jsonb, decidida_por = $5, decidida_em = now(), motivo = ''
        WHERE implantacao_id = $1`, [x.implantacao_id, regra, JSON.stringify(cad), temAjuste ? JSON.stringify(ajuste) : null, req.usuario.id]);
      await evento(t, x.implantacao_id, req.usuario.id, 'antecipacao_cadastrada', { regra_id: regra, ajuste: temAjuste ? ajuste : null, obs: cad.obs });
    });
    const desc = { valor: (v) => reais(v), dia: (v) => `dia ${v}`, fim: (v) => (v ? String(v).split('-').reverse().join('/') : 'sem prazo final') };
    await avisar(x, `Antecipação cadastrada${temAjuste ? ' com ajuste' : ''} · ${x.condominio}`,
      `${req.usuario.nome} cadastrou a antecipação no Controle de Repasses${temAjuste ? `, com ajuste: ${Object.entries(ajuste).map(([k, v]) => `${desc[k](v.de)} → ${desc[k](v.para)}`).join('; ')}` : ''}.${cad.obs ? ` "${cad.obs}"` : ''}`, req.usuario.id);
    res.json({ ok: true, ajuste: temAjuste ? ajuste : null });
  }));

  r.post('/api/repasses/antecipacoes/:id/devolver', json, (req, res) => decidir(req, res, async (x) => {
    const motivo = texto(req.body && req.body.motivo, 1000);
    if (motivo.length < 5) return erro(res, 400, 'Diga o motivo da devolução.');
    await db.tx(async (t) => {
      await t.q("UPDATE implantacao_antecipacoes SET situacao = 'devolvida', motivo = $2, decidida_por = $3, decidida_em = now() WHERE implantacao_id = $1", [x.implantacao_id, motivo, req.usuario.id]);
      await evento(t, x.implantacao_id, req.usuario.id, 'antecipacao_devolvida', { motivo });
    });
    await avisar(x, `Antecipação devolvida pelo Controle de Repasses · ${x.condominio}`, `${req.usuario.nome}: "${motivo}"`, req.usuario.id);
    res.json({ ok: true });
  }));
}

/* situação de cada envio, para o Acompanhamento: { [implantacao_id]: {...} } (mudou: o formulário mudou desde o envio/cadastro) */
async function situacoesAntecipacao(db, linhas) {
  const { rows } = await db.q(`SELECT a.*, u.nome AS decidida_por_nome FROM implantacao_antecipacoes a LEFT JOIN usuarios u ON u.id = a.decidida_por`);
  const porId = new Map(rows.map((x) => [x.implantacao_id, x]));
  const out = {};
  for (const l of linhas) {
    const x = porId.get(l.id);
    if (!x) continue;
    const agora = montarEnvio(l._bruto || { formulario: {} });
    out[l.id] = { situacao: x.situacao, atualizacao: x.atualizacao, enviado: x.enviado, antes: x.antes, enviada_em: x.enviada_em, regra_id: x.regra_id, ajuste: x.ajuste,
      motivo: x.motivo, decidida_em: x.decidida_em, decidida_por_nome: x.decidida_por_nome, mudou: !!(agora && x.situacao !== 'devolvida' && !igual(x.enviado, agora)) };
  }
  return out;
}

module.exports = { rotasAntecipacoes, situacoesAntecipacao, montarEnvio };

'use strict';
/*
 * Análise de Crédito no banco: a política versionada (parametros_politica + faixas_precificacao) e o protocolo.
 *  - semearPolitica: grava a política padrão uma única vez (instalação nova); depois a administração cria versões.
 *  - politicaAtiva: monta o objeto que o motor de regras recebe (parâmetros + faixas, na ordem).
 *  - proximoProtocolo: AC-AAAA-MM-DD-NN, sequencial por dia (horário de Brasília). O contador sobe numa única
 *    instrução no banco, então duas análises criadas ao mesmo tempo nunca recebem o mesmo número.
 */
const { POLITICA_PADRAO, validarPolitica } = require('./politica');

async function gravarPolitica(t, politica, { ativa = false, criadoPor = null } = {}) {
  const erros = validarPolitica(politica);
  if (erros.length) throw new Error(`Política inválida: ${erros.join('; ')}`);
  const { faixas, versao, descricao, ...parametros } = politica;
  if (ativa) await t.q('UPDATE parametros_politica SET ativa = FALSE WHERE ativa');
  await t.q(`INSERT INTO parametros_politica (versao, descricao, parametros, ativa, criado_por) VALUES ($1, $2, $3::jsonb, $4, $5)`,
    [versao, descricao || '', JSON.stringify(parametros), ativa, criadoPor]);
  for (let i = 0; i < faixas.length; i++) {
    await t.q('INSERT INTO faixas_precificacao (versao, ordem, ate, taxa_adm) VALUES ($1, $2, $3, $4)', [versao, i + 1, faixas[i].ate, faixas[i].taxa_adm]);
  }
}

async function semearPolitica(t) {
  if (await t.um('SELECT 1 FROM parametros_politica LIMIT 1')) return;
  await gravarPolitica(t, POLITICA_PADRAO, { ativa: true });
}

async function politicaAtiva(db, versao = null) {
  const p = versao
    ? await db.um('SELECT versao, descricao, parametros FROM parametros_politica WHERE versao = $1', [versao])
    : await db.um('SELECT versao, descricao, parametros FROM parametros_politica WHERE ativa');
  if (!p) return null;
  const faixas = (await db.q('SELECT ate, taxa_adm FROM faixas_precificacao WHERE versao = $1 ORDER BY ordem', [p.versao])).rows
    .map((f) => ({ ate: Number(f.ate), taxa_adm: Number(f.taxa_adm) }));
  return { ...POLITICA_PADRAO, ...p.parametros, versao: p.versao, descricao: p.descricao, faixas };
}

const diaEmBrasilia = (quando) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(quando);

async function proximoProtocolo(db, quando = new Date(), prefixo = POLITICA_PADRAO.protocolo_prefixo) {
  const dia = diaEmBrasilia(quando);
  const r = await db.um(`INSERT INTO analise_protocolos (dia, ultimo) VALUES ($1, 1)
    ON CONFLICT (dia) DO UPDATE SET ultimo = analise_protocolos.ultimo + 1 RETURNING ultimo`, [dia]);
  return `${prefixo}-${dia}-${String(r.ultimo).padStart(2, '0')}`;
}

module.exports = { semearPolitica, gravarPolitica, politicaAtiva, proximoProtocolo };

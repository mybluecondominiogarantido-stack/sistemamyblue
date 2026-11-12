'use strict';
/*
 * Avisos do Controle de Repasses no sino do portal: o Gestor avisa cada assistente de crédito sobre os repasses dos
 * condomínios dela (ex.: pagamento não efetuado pelo banco, repasse previsto ainda sem lançamento).
 *   POST /api/repasses/avisos   corpo: { avisos: [{ assistente: <nome da Base de Clientes>, titulo, texto }] }  (até 30)
 *        → { itens: [{ assistente, destinatario: { id, nome } | null, enviado, motivo? }] }
 * Só quem tem o papel Gestor (ou a administração), sem só consulta. A assistente é achada na equipe do Crédito pelo
 * nome (mesma regra da Base de Clientes). O mesmo aviso (mesmo título) para a mesma pessoa não se repete em 12 horas.
 * O aviso abre o Controle de Repasses (#/m/repasses). Sem e-mail: só o sino.
 * (liberado para a ferramenta isolada repasses em permitidoParaFerramenta, server/seguranca.js)
 */
const express = require('express');
const { acharPessoa, FUNCOES } = require('../carteira');

const SLUG = 'repasses';
const SETOR = FUNCOES.find((f) => f.campo === 'assistente_credito').setor;
const MAX = 30;
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function rotasRepassesAvisos({ db, seg, avisos, acessos }) {
  const r = express.Router();
  const erro = (res, status, msg) => res.status(status).json({ erro: msg });

  async function papelRepasses(u) {
    const m = await db.um('SELECT * FROM modulos WHERE slug = $1', [SLUG]);
    const a = m && acessos ? await acessos.acessoDe(u, m) : { abre: u.papel === 'admin', somente_leitura: false, papeis: [] };
    const gestor = u.papel === 'admin' || (a.abre && (a.papeis || []).some((x) => ['gestor', 'gestao'].includes(String(x).toLowerCase())));
    return { abre: a.abre, envia: gestor && !a.somente_leitura };
  }

  r.post('/api/repasses/avisos', seg.exigirLogin, express.json({ limit: '200kb' }), async (req, res) => {
    const p = await papelRepasses(req.usuario);
    if (!p.abre) return erro(res, 403, 'Sem acesso ao Controle de Repasses.');
    if (!p.envia) return erro(res, 403, 'Só quem tem o papel Gestor no Controle de Repasses envia avisos.');
    const lista = Array.isArray(req.body && req.body.avisos) ? req.body.avisos : null;
    if (!lista || !lista.length) return erro(res, 400, 'Informe os avisos.');
    if (lista.length > MAX) return erro(res, 400, `No máximo ${MAX} avisos por vez.`);
    const membros = (await db.q(`SELECT u.id, u.nome FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id JOIN usuarios u ON u.id = sm.usuario_id
      WHERE s.nome = $1 AND u.ativo`, [SETOR])).rows;
    const itens = [];
    for (const a of lista) {
      const assistente = limpar(a && a.assistente).toUpperCase();
      const titulo = limpar(a && a.titulo).slice(0, 140);
      const texto = limpar(a && a.texto).slice(0, 600);
      if (assistente.length < 3 || !titulo) { itens.push({ assistente, destinatario: null, enviado: false, motivo: 'assistente ou título faltando' }); continue; }
      const achado = acharPessoa(assistente, membros);
      if (!achado) { itens.push({ assistente, destinatario: null, enviado: false, motivo: 'assistente não encontrada na equipe do Crédito' }); continue; }
      const dest = { id: achado.id, nome: achado.nome };
      const rep = await db.um(`SELECT 1 AS x FROM notificacoes WHERE usuario_id = $1 AND tipo = 'repasses' AND titulo = $2 AND criado_em > now() - interval '12 hours'`, [dest.id, titulo]);
      if (rep) { itens.push({ assistente, destinatario: dest, enviado: false, motivo: 'já avisada nas últimas 12 horas' }); continue; }
      await avisos.notificar([dest.id], { tipo: 'repasses', titulo, texto, link: '#/m/repasses', email: false, autor_id: null });
      itens.push({ assistente, destinatario: dest, enviado: true });
    }
    await seg.auditar(req, 'repasses_avisos_enviados', SLUG, { enviados: itens.filter((x) => x.enviado).length, total: itens.length });
    res.json({ itens });
  });
  return r;
}

module.exports = { rotasRepassesAvisos };

'use strict';
/*
 * Comprovantes de repasse: depois da conciliação do dia, o Controle de Repasses (ferramenta 'repasses') envia um .zip
 * com os comprovantes de cada assistente de crédito. A assistente recebe o aviso no portal (e por e-mail) e baixa
 * o arquivo na página "Comprovantes de repasse" (#/comprovantes).
 *   POST /api/repasses/comprovantes?dia=AAAA-MM-DD&assistente=<nome da Base de Clientes>&qtd=<n>&nome=<arquivo.zip>
 *        corpo: o .zip (application/zip ou application/octet-stream). Só quem tem o papel Gestor (e não só consulta).
 *        → { id, dia, assistente, destinatario: { id, nome } | null, substituiu }
 *   GET  /api/repasses/comprovantes?dia=AAAA-MM-DD   (sem dia: os últimos 60 dias)
 *        → { gestor, itens: [...] } (o Gestor e a administração veem todos; os demais, só os enviados para si)
 *   GET  /api/repasses/comprovantes/:id/arquivo      → o .zip (quem recebeu, a administração e o Gestor)
 * Um envio novo do mesmo dia para a mesma assistente troca o anterior e avisa de novo.
 * (liberado para a ferramenta isolada em permitidoParaFerramenta, server/seguranca.js)
 */
const express = require('express');
const { acharPessoa, FUNCOES } = require('../carteira');

const SLUG = 'repasses';
// a equipe em que se procura a assistente: a mesma da coluna ASSISTENTE CRÉDITO da Base de Clientes
const SETOR = FUNCOES.find((f) => f.campo === 'assistente_credito').setor;
const TIPOS = ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'];
const LIMITE = 40 * 1024 * 1024;
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/* "2026-03-05" válido (dia que existe) → o mesmo texto; senão null */
function diaValido(v) {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s ? s : null;
}
const diaMes = (dia) => dia.slice(8, 10) + '/' + dia.slice(5, 7);
// .zip começa com "PK\x03\x04" (ou "PK\x05\x06" quando vazio)
const ehZip = (buf) => buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && ((buf[2] === 3 && buf[3] === 4) || (buf[2] === 5 && buf[3] === 6));

function rotasComprovantes({ db, seg, avisos, acessos }) {
  const r = express.Router();
  const erro = (res, status, msg) => res.status(status).json({ erro: msg });
  r.use('/api/repasses/comprovantes', seg.exigirLogin);

  /* o que a pessoa é no Controle de Repasses: gestor (papel Gestor ou administração) e se pode enviar (não só consulta) */
  async function papelRepasses(u) {
    const m = await db.um('SELECT * FROM modulos WHERE slug = $1', [SLUG]);
    const a = m && acessos ? await acessos.acessoDe(u, m) : { abre: u.papel === 'admin', somente_leitura: false, papeis: [] };
    const gestor = u.papel === 'admin' || (a.abre && a.papeis.some((x) => ['gestor', 'gestao'].includes(String(x).toLowerCase())));
    return { abre: a.abre, gestor, envia: gestor && !a.somente_leitura };
  }

  /* quem recebe: a pessoa da equipe do Crédito com este nome (regras de acharPessoa); null se não achar ou se houver mais de uma */
  async function destinatario(assistente) {
    const membros = (await db.q(`SELECT u.id, u.nome FROM setor_membros sm JOIN setores s ON s.id = sm.setor_id JOIN usuarios u ON u.id = sm.usuario_id
      WHERE s.nome = $1 AND u.ativo`, [SETOR])).rows;
    const achado = acharPessoa(assistente, membros);
    return achado ? { id: achado.id, nome: achado.nome } : null;
  }

  /* envio: confere o papel antes de receber o arquivo */
  async function soGestor(req, res, next) {
    const p = await papelRepasses(req.usuario);
    if (!p.abre) return erro(res, 403, 'Sem acesso ao Controle de Repasses.');
    if (!p.envia) return erro(res, 403, 'Só quem tem o papel Gestor no Controle de Repasses envia os comprovantes.');
    next();
  }
  const corpoZip = express.raw({ type: () => true, limit: LIMITE });

  r.post('/api/repasses/comprovantes', soGestor, corpoZip, async (req, res) => {
    const q = req.query || {};
    const dia = diaValido(q.dia);
    if (!dia) return erro(res, 400, 'Data inválida: use AAAA-MM-DD.');
    const assistente = limpar(q.assistente).toUpperCase();
    if (assistente.length < 3) return erro(res, 400, 'Informe a assistente (o nome como está na Base de Clientes).');
    if (assistente.length > 120) return erro(res, 400, 'Nome da assistente longo demais.');
    let qtd = null;
    if (q.qtd !== undefined && q.qtd !== '') {
      qtd = Number(q.qtd);
      if (!Number.isInteger(qtd) || qtd < 0 || qtd > 100000) return erro(res, 400, 'Quantidade de comprovantes inválida.');
    }
    const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!TIPOS.includes(tipo)) return erro(res, 415, 'Envie o arquivo .zip (application/zip).');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return erro(res, 400, 'Arquivo vazio.');
    if (!ehZip(buf)) return erro(res, 400, 'O arquivo não é um .zip.');
    let nome = limpar(q.nome).replace(/[\\/\r\n"]/g, '_').slice(0, 200);
    if (!nome) nome = `comprovantes-${dia}.zip`;

    const dest = await destinatario(assistente);
    const { id, substituiu } = await db.tx(async (t) => {
      const antes = await t.um('SELECT id FROM repasses_comprovantes WHERE dia = $1 AND assistente = $2', [dia, assistente]);
      const x = await t.um(`INSERT INTO repasses_comprovantes (dia, assistente, usuario_id, nome_arquivo, conteudo, tamanho, qtd, enviado_por)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (dia, assistente) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, nome_arquivo = EXCLUDED.nome_arquivo, conteudo = EXCLUDED.conteudo,
          tamanho = EXCLUDED.tamanho, qtd = EXCLUDED.qtd, enviado_por = EXCLUDED.enviado_por, enviado_em = now(), baixado_em = NULL
        RETURNING id`, [dia, assistente, dest ? dest.id : null, nome, buf, buf.length, qtd, req.usuario.id]);
      return { id: x.id, substituiu: !!antes };
    });
    if (dest) {
      await avisos.notificar([dest.id], {
        tipo: 'repasses', titulo: `Comprovantes de repasse de ${diaMes(dia)}`,
        texto: qtd == null ? 'Comprovantes dos seus condomínios para baixar.' : `${qtd} ${qtd === 1 ? 'comprovante' : 'comprovantes'} dos seus condomínios para baixar.`,
        link: '#/comprovantes', autor_id: req.usuario.id, email: true,
      });
    }
    await seg.auditar(req, 'repasses_comprovantes_enviados', SLUG, { id, dia, assistente, qtd, tamanho: buf.length, destinatario: dest ? dest.id : null, substituiu });
    res.status(substituiu ? 200 : 201).json({ id, dia, assistente, destinatario: dest, substituiu });
  });

  r.get('/api/repasses/comprovantes', async (req, res) => {
    let dia = null;
    if (req.query.dia !== undefined && req.query.dia !== '') {
      dia = diaValido(req.query.dia);
      if (!dia) return erro(res, 400, 'Data inválida: use AAAA-MM-DD.');
    }
    const { gestor } = await papelRepasses(req.usuario);
    const args = [];
    const onde = [];
    if (dia) { args.push(dia); onde.push(`c.dia = $${args.length}`); } else onde.push('c.dia >= CURRENT_DATE - 60');
    if (!gestor) { args.push(req.usuario.id); onde.push(`c.usuario_id = $${args.length}`); }
    const { rows } = await db.q(`SELECT c.id, to_char(c.dia, 'YYYY-MM-DD') AS dia, c.assistente, d.nome AS destinatario, c.qtd, c.tamanho, c.nome_arquivo,
        c.enviado_em, e.nome AS enviado_por, c.baixado_em
      FROM repasses_comprovantes c LEFT JOIN usuarios d ON d.id = c.usuario_id LEFT JOIN usuarios e ON e.id = c.enviado_por
      WHERE ${onde.join(' AND ')} ORDER BY c.dia DESC, c.assistente`, args);
    res.set('Cache-Control', 'no-store');
    res.json({ gestor, itens: rows });
  });

  r.get('/api/repasses/comprovantes/:id/arquivo', async (req, res) => {
    const c = await db.um(`SELECT id, to_char(dia, 'YYYY-MM-DD') AS dia, assistente, usuario_id, nome_arquivo, conteudo FROM repasses_comprovantes WHERE id = $1`, [Number(req.params.id) || 0]);
    if (!c) return erro(res, 404, 'Comprovantes não encontrados.');
    const meu = c.usuario_id === req.usuario.id;
    if (!meu && !(await papelRepasses(req.usuario)).gestor) return erro(res, 403, 'Estes comprovantes foram enviados para outra pessoa.');
    // a primeira vez que quem recebeu baixa fica marcada (o Gestor baixando não conta)
    if (meu) await db.q('UPDATE repasses_comprovantes SET baixado_em = now() WHERE id = $1 AND baixado_em IS NULL', [c.id]);
    await seg.auditar(req, 'repasses_comprovantes_baixados', SLUG, { id: c.id, dia: c.dia, assistente: c.assistente });
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(c.nome_arquivo)}`);
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.set('Cache-Control', 'private, no-store');
    res.send(c.conteudo);
  });

  return r;
}

module.exports = { rotasComprovantes };

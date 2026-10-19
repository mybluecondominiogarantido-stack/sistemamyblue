'use strict';
/* Análise de Crédito no banco: política semeada e versionada, protocolo sequencial por dia, reanálise ligada à original. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { abrir } = require('../server/db');
const { politicaAtiva, gravarPolitica, proximoProtocolo } = require('../server/credito/banco');
const { POLITICA_PADRAO } = require('../server/credito/politica');
const { analisar } = require('../server/credito/motor');

let db;
before(async () => { db = await abrir({ dataDir: ':memoria:', databaseUrl: '' }); });
after(async () => { await db.fechar(); });

test('a política padrão é semeada uma vez e volta igual do banco', async () => {
  const p = await politicaAtiva(db);
  assert.equal(p.versao, POLITICA_PADRAO.versao);
  assert.deepEqual(p.faixas, POLITICA_PADRAO.faixas);
  assert.equal(p.boleto_por_uf.MA, 5.5);
  assert.equal(p.inad_reprovacao, 40);
  assert.equal((await db.um('SELECT count(*)::int AS n FROM parametros_politica')).n, 1);
  assert.equal(p.setor_analistas, 'Análise de Crédito');
  assert.ok(await db.um("SELECT 1 FROM setores WHERE nome = 'Análise de Crédito'"));
  assert.ok(await db.um("SELECT 1 FROM setores WHERE nome = 'Crédito'")); // são setores diferentes
});

test('o setor Análise de Crédito é criado uma vez só: apagado pela administração, não volta', async () => {
  const { semearPolitica } = require('../server/credito/banco');
  await db.q("DELETE FROM setores WHERE nome = 'Análise de Crédito'");
  await db.tx((t) => semearPolitica(t));
  assert.equal(await db.um("SELECT 1 FROM setores WHERE nome = 'Análise de Crédito'"), null);
  await db.q("INSERT INTO setores (nome, ordem) VALUES ('Análise de Crédito', 14)");
});

test('versão nova da política vira a ativa; a antiga continua consultável', async () => {
  await db.tx((t) => gravarPolitica(t, { ...POLITICA_PADRAO, versao: '1.3-teste', boleto_padrao: 2.5 }, { ativa: true }));
  assert.equal((await politicaAtiva(db)).boleto_padrao, 2.5);
  assert.equal((await politicaAtiva(db, POLITICA_PADRAO.versao)).boleto_padrao, 2);
  await assert.rejects(db.tx((t) => gravarPolitica(t, { ...POLITICA_PADRAO, versao: 'quebrada', faixas: [] })), /Política inválida/);
});

test('protocolo AC-AAAA-MM-DD-NN sobe por dia (Brasília) e não repete', async () => {
  const d1 = new Date('2026-07-20T12:00:00-03:00');
  const lote = await Promise.all([1, 2, 3].map(() => proximoProtocolo(db, d1)));
  assert.deepEqual(lote.sort(), ['AC-2026-07-20-01', 'AC-2026-07-20-02', 'AC-2026-07-20-03']);
  // 23h30 em Brasília já é dia seguinte em UTC, mas o protocolo segue o dia de Brasília
  assert.equal(await proximoProtocolo(db, new Date('2026-07-20T23:30:00-03:00')), 'AC-2026-07-20-04');
  assert.equal(await proximoProtocolo(db, new Date('2026-07-21T08:00:00-03:00')), 'AC-2026-07-21-01');
});

test('análise e reanálise: protocolo novo ligado à original, resultado do motor guardado', async () => {
  const p = await politicaAtiva(db, POLITICA_PADRAO.versao);
  const r = analisar({ formulario: { uh_total: 10, taxa_ordinaria: 1000, dia_vencimento: 5 } }, p, { hoje: '2026-07-20' });
  const ex = await db.um("INSERT INTO executivos (nome, uf, boleto) VALUES ('Executivo Fictício', 'MA', 5.5) RETURNING id");
  const orig = await db.um(`INSERT INTO analises (protocolo, etapa, resultado, condominio, executivo_id, resultado_motor, politica_versao)
    VALUES ($1, 'enviada', $2, 'Condomínio Fictício', $3, $4::jsonb, $5) RETURNING id`,
  [await proximoProtocolo(db, new Date('2026-07-22T10:00:00-03:00')), r.status.codigo, ex.id, JSON.stringify(r), p.versao]);
  const re = await db.um(`INSERT INTO analises (protocolo, origem_id, motivo_reanalise, etapa) VALUES ($1, $2, 'relatório novo', 'fila') RETURNING protocolo`,
    [await proximoProtocolo(db, new Date('2026-08-05T10:00:00-03:00')), orig.id]);
  assert.equal(re.protocolo, 'AC-2026-08-05-01');
  const lida = await db.um('SELECT a.resultado, a.resultado_motor, o.protocolo AS original FROM analises a LEFT JOIN analises o ON o.id = a.origem_id WHERE a.origem_id IS NULL AND a.id = $1', [orig.id]);
  assert.equal(lida.resultado, 'pendente');
  assert.equal(lida.resultado_motor.status.codigo, 'pendente');
  await assert.rejects(db.q("INSERT INTO analises (protocolo, etapa) VALUES ('AC-x', 'inventada')"));
});

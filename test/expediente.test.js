'use strict';
/* Prazos em horário de expediente (seg–sex, 8h–17h, Brasília = UTC−3). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarExpediente, lerExpediente } = require('../server/expediente');

const exp = criarExpediente(lerExpediente({ FERIADOS: '2026-11-02' }));
// horário de Brasília → instante
const br = (s) => new Date(s + '-03:00');
const igual = (a, b) => assert.equal(a.toISOString(), br(b).toISOString());

test('dentro do mesmo dia', () => {
  igual(exp.somarHorasUteis(br('2026-10-06T09:00'), 4), '2026-10-06T13:00');
  igual(exp.somarHorasUteis(br('2026-10-06T08:00'), 9), '2026-10-06T17:00');
});

test('passa para o dia seguinte no início do expediente', () => {
  igual(exp.somarHorasUteis(br('2026-10-06T15:00'), 4), '2026-10-07T10:00');
});

test('aberto fora do expediente começa a contar às 8h', () => {
  igual(exp.somarHorasUteis(br('2026-10-06T20:00'), 2), '2026-10-07T10:00'); // à noite
  igual(exp.somarHorasUteis(br('2026-10-06T06:30'), 2), '2026-10-06T10:00'); // de madrugada
});

test('pula o fim de semana', () => {
  // sexta 16h30 + 4 h úteis = segunda 11h30
  igual(exp.somarHorasUteis(br('2026-10-09T16:30'), 4), '2026-10-12T11:30');
  // sábado: começa segunda 8h
  igual(exp.somarHorasUteis(br('2026-10-10T10:00'), 1), '2026-10-12T09:00');
});

test('dias úteis inteiros e feriado configurado', () => {
  // 3 dias úteis (27 h) a partir de quarta 10h = segunda 10h
  igual(exp.somarHorasUteis(br('2026-10-07T10:00'), 27), '2026-10-12T10:00');
  // 02/11/2026 (segunda) é feriado: sexta 16h + 2 h = terça 9h
  igual(exp.somarHorasUteis(br('2026-10-30T16:00'), 2), '2026-11-03T09:00');
});

test('configuração inválida é recusada', () => {
  assert.throws(() => lerExpediente({ EXPEDIENTE_INICIO: '18', EXPEDIENTE_FIM: '8' }), /Expediente inválido/);
});

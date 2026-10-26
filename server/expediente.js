'use strict';
/*
 * Horário de expediente da MyBlue, usado nos prazos (SLA) dos tickets.
 * Padrão: segunda a sexta, das 8h às 17h, horário de Brasília. Configurável por variáveis:
 *   EXPEDIENTE_INICIO=8  EXPEDIENTE_FIM=17  EXPEDIENTE_DIAS=1,2,3,4,5 (0 = domingo)
 *   EXPEDIENTE_FUSO=America/Sao_Paulo
 *   FERIADOS=2026-11-02,2026-11-15,2026-12-25   (dias sem expediente, AAAA-MM-DD)
 */

function lerExpediente(env = process.env) {
  const inicio = Number(env.EXPEDIENTE_INICIO ?? 8);
  const fim = Number(env.EXPEDIENTE_FIM ?? 17);
  const dias = String(env.EXPEDIENTE_DIAS || '1,2,3,4,5').split(',').map((d) => Number(d.trim())).filter((d) => d >= 0 && d <= 6);
  if (!(inicio >= 0 && fim <= 24 && fim > inicio) || !dias.length) throw new Error('Expediente inválido: confira EXPEDIENTE_INICIO, EXPEDIENTE_FIM e EXPEDIENTE_DIAS.');
  const feriados = new Set(String(env.FERIADOS || '').split(',').map((d) => d.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  return { inicio, fim, dias, fuso: env.EXPEDIENTE_FUSO || 'America/Sao_Paulo', feriados, horasDia: fim - inicio };
}

function criarExpediente(cfg = lerExpediente()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: cfg.fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  });
  const SEMANA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  /* data/hora "de relógio" no fuso do expediente */
  function local(d) {
    const p = {};
    for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
    return { ano: +p.year, mes: +p.month, dia: +p.day, hora: +p.hour, min: +p.minute, seg: +p.second, semana: SEMANA[p.weekday] };
  }
  /* instante (UTC) de uma data/hora de relógio no fuso */
  function instante(ano, mes, dia, hora, min) {
    const chute = Date.UTC(ano, mes - 1, dia, hora, min);
    const l = local(new Date(chute));
    const desvio = Date.UTC(l.ano, l.mes - 1, l.dia, l.hora, l.min) - chute;
    return new Date(chute - desvio);
  }
  const chaveDia = (l) => `${l.ano}-${String(l.mes).padStart(2, '0')}-${String(l.dia).padStart(2, '0')}`;
  const diaUtil = (l) => cfg.dias.includes(l.semana) && !cfg.feriados.has(chaveDia(l));
  function inicioDoProximoDia(l) {
    const amanha = new Date(Date.UTC(l.ano, l.mes - 1, l.dia + 1));
    return instante(amanha.getUTCFullYear(), amanha.getUTCMonth() + 1, amanha.getUTCDate(), cfg.inicio, 0);
  }

  /* soma horas de expediente a partir de um instante */
  function somarHorasUteis(de, horas) {
    let resta = Math.round(horas * 60); // minutos
    let cursor = new Date(de);
    for (let i = 0; i < 4000; i++) {
      const l = local(cursor);
      const agora = l.hora * 60 + l.min + l.seg / 60;
      if (!diaUtil(l) || agora >= cfg.fim * 60) { cursor = inicioDoProximoDia(l); continue; }
      if (agora < cfg.inicio * 60) { cursor = instante(l.ano, l.mes, l.dia, cfg.inicio, 0); continue; }
      const livre = cfg.fim * 60 - agora;
      if (resta <= livre) return new Date(cursor.getTime() + resta * 60000);
      resta -= livre;
      cursor = inicioDoProximoDia(l);
    }
    throw new Error('Não foi possível calcular o prazo (expediente sem dias úteis?).');
  }

  /* prazo "no mesmo dia útil": chegou num dia útil até a hora de corte (inclusive) → fim do expediente do dia;
     depois do corte, em fim de semana ou feriado → fim do expediente do próximo dia útil.
     Ex. (Análise de Crédito, corte 16h): 15h50 de terça → terça 17h; 16h10 de terça → quarta 17h. */
  function fimDoDiaUtil(de, corteHora = cfg.fim) {
    let l = local(new Date(de));
    const agora = l.hora * 60 + l.min + l.seg / 60;
    if (!diaUtil(l) || agora > corteHora * 60) l = local(inicioDoProximoDia(l));
    for (let i = 0; i < 400 && !diaUtil(l); i++) l = local(inicioDoProximoDia(l));
    if (!diaUtil(l)) throw new Error('Não foi possível calcular o prazo (expediente sem dias úteis?).');
    return instante(l.ano, l.mes, l.dia, cfg.fim, 0);
  }

  /* N dias úteis depois (mesmo horário, ou o início do expediente se chegou fora dele) */
  function somarDiasUteis(de, dias) {
    return somarHorasUteis(de, dias * cfg.horasDia);
  }

  /* um dia (AAAA-MM-DD) é útil? (dia da semana do expediente e fora dos feriados) — prazos contados em dias úteis */
  function ehDiaUtil(dia) {
    const [a, m, d] = String(dia).split('-').map(Number);
    return cfg.dias.includes(new Date(Date.UTC(a, m - 1, d)).getUTCDay()) && !cfg.feriados.has(String(dia));
  }

  /* o dia (AAAA-MM-DD no fuso), se é dia útil e se o expediente já começou: rotinas que rodam uma vez por dia útil */
  function momento(d = new Date()) {
    const l = local(new Date(d));
    const util = diaUtil(l);
    return { dia: chaveDia(l), util, noExpediente: util && l.hora >= cfg.inicio && l.hora < cfg.fim };
  }

  return { somarHorasUteis, somarDiasUteis, fimDoDiaUtil, momento, ehDiaUtil, config: { inicio: cfg.inicio, fim: cfg.fim, dias: cfg.dias, horasDia: cfg.horasDia, fuso: cfg.fuso } };
}

module.exports = { criarExpediente, lerExpediente };

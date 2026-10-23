'use strict';
/*
 * Prazos da Implantação em dias úteis (o calendário é o do expediente: fins de semana e feriados não contam).
 *  - concluir: N dias úteis (parâmetro, padrão 3) depois de assumir; pausa com pendência ou impedimento e continua de onde parou;
 *  - ficha de repasse: N dias úteis (padrão 5) da conclusão até o primeiro envio ao Crédito.
 * Um dia útil conta quando o prazo não estava pausado no começo dele: pausar no meio do dia ainda conta o dia; o dia em que
 * a pausa termina não conta. Os dias são AAAA-MM-DD no horário de Brasília.
 */

const somarDia = (dia) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10); };

function criarPrazos(ehUtil) {
  // pausa = { inicio: AAAA-MM-DD, fim: AAAA-MM-DD | null }
  const coberto = (dia, pausas) => (pausas || []).some((p) => p.inicio < dia && (!p.fim || p.fim >= dia));
  const conta = (dia, pausas) => ehUtil(dia) && !coberto(dia, pausas);

  /* dias úteis que contaram depois de `inicio` até `ate` (inclusive) */
  function consumidos(inicio, ate, pausas) {
    let n = 0;
    for (let d = somarDia(inicio), k = 0; d <= ate && k < 4000; d = somarDia(d), k++) if (conta(d, pausas)) n++;
    return n;
  }
  /* o dia em que o prazo vence: o N-ésimo dia útil que conta depois de `inicio` (pausas em aberto contam como terminadas hoje) */
  function vencimento(inicio, n, pausas) {
    let c = 0, d = inicio;
    for (let k = 0; k < 4000; k++) { d = somarDia(d); if (conta(d, pausas)) c++; if (c >= n) return d; }
    return null;
  }
  /* situação do prazo hoje (ou no dia em que terminou):
     no_prazo · vence_amanha · vence_hoje · atrasado · pausado · cumprido · cumprido_com_atraso */
  function situacao({ inicio, n, pausas = [], fim = null, hoje }) {
    if (!inicio) return null;
    if (fim) {
      const usados = consumidos(inicio, fim, pausas);
      return { status: usados <= n ? 'cumprido' : 'cumprido_com_atraso', atraso: Math.max(0, usados - n), vence: vencimento(inicio, n, pausas), em: fim };
    }
    const usados = consumidos(inicio, hoje, pausas);
    const aberta = (pausas || []).find((p) => !p.fim);
    if (aberta) return { status: 'pausado', faltam: Math.max(0, n - usados), desde: aberta.inicio, atraso: Math.max(0, usados - n) };
    const vence = vencimento(inicio, n, pausas);
    if (usados > n) return { status: 'atrasado', atraso: usados - n, vence };
    if (usados === n) return { status: 'vence_hoje', faltam: 0, vence };
    return { status: n - usados === 1 ? 'vence_amanha' : 'no_prazo', faltam: n - usados, vence };
  }
  return { consumidos, vencimento, situacao };
}

module.exports = { criarPrazos, somarDia };

'use strict';
/*
 * Fluxograma operacional do Portal MyBlue (A4 paisagem), no padrão dos fluxogramas da MyBlue:
 * logo, título, etiqueta do ator em cada passo, formas Início/Fim, Ação e Decisão, e a página
 * "Como usar este fluxograma" com atores, formas, prazos e situações.
 *
 *   node docs/manuais/fonte/gerar-fluxograma.js [pasta-de-saída]
 */
const fs = require('fs');
const path = require('path');
const { playwright } = require('./padrao');

const SAIDA = process.argv[2] || path.join(__dirname, '..');
const VERSAO = 'Versão 1.0 — Outubro/2026';
const LOGO = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', '..', '..', 'public', 'img', 'logo.png')).toString('base64');

/* atores: cor da etiqueta e da borda dos passos */
const ATORES = {
  colaborador: ['COLABORADOR', '#1b9bbc', '#eaf6fa'],
  portal: ['PORTAL', '#7b5cc4', '#f2eefb'],
  lider: ['LÍDER / COORDENAÇÃO', '#0f5e73', '#e9f3f6'],
  responsavel: ['RESPONSÁVEL', '#2e7d32', '#ecf6ed'],
  admin: ['ADMINISTRAÇÃO', '#c62828', '#fcecec'],
  supervisao: ['SUPERVISÃO', '#e39a2d', '#fdf3e2'],
};

/* grade: 6 colunas */
const CX = [33, 79, 125, 171, 217, 263];
const W = 38; const H = 19; const DW = 40; const DH = 25;

function pagina(n, total, titulo, sub, nos, ligacoes, extras = '') {
  const no = {};
  for (const x of nos) no[x.id] = x;
  const meio = (x) => [CX[x.c], x.y];
  const tam = (x) => (x.tipo === 'decisao' ? [DW, DH] : [x.w || W, x.h || H]);
  // ponto de saída/entrada de cada lado
  function ponto(id, lado) {
    const x = no[id]; const [cx, cy] = meio(x); const [w, h] = tam(x);
    return { t: [cx, cy - h / 2], b: [cx, cy + h / 2], l: [cx - w / 2, cy], r: [cx + w / 2, cy] }[lado];
  }
  let html = '';
  let svg = '';
  for (const x of nos) {
    const [cx, cy] = meio(x); const [w, h] = tam(x);
    const ator = x.ator && ATORES[x.ator];
    if (ator) html += `<div class="tag" style="${x.tagDireita ? `right:${297 - cx - w / 2 - (x.tipo === 'decisao' ? 1 : 0)}mm` : `left:${cx - w / 2 + (x.tipo === 'decisao' ? -1 : 0)}mm`};top:${cy - h / 2 - 4.2}mm;background:${ator[1]}">${ator[0]}</div>`;
    if (x.tipo === 'decisao') {
      svg += `<polygon points="${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}" fill="#fdf6d8" stroke="#c9a227" stroke-width=".45"/>`;
      html += `<div class="txt dec" style="left:${cx - w / 2 + 6}mm;top:${cy - h / 2}mm;width:${w - 12}mm;height:${h}mm">${x.t}</div>`;
    } else {
      const borda = x.tipo === 'pilula' ? '#1b9bbc' : ator ? ator[1] : '#0f5e73';
      const fundo = x.tipo === 'pilula' ? '#eaf6fa' : ator ? ator[2] : '#fff';
      html += `<div class="caixa ${x.tipo || ''}" style="left:${cx - w / 2}mm;top:${cy - h / 2}mm;width:${w}mm;height:${h}mm;border-color:${borda};background:${fundo};color:${x.tipo === 'pilula' ? '#0f5e73' : '#173c46'}"><span>${x.t}</span></div>`;
    }
  }
  for (const l of ligacoes) {
    const pts = [ponto(...l.de), ...(l.via || []), ...(l.para ? [ponto(...l.para)] : [])];
    const cor = l.cor || '#0f5e73';
    svg += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${cor}" stroke-width=".35" ${l.tracejado ? 'stroke-dasharray="1.2,1"' : ''} ${l.para && !l.semSeta ? `marker-end="url(#seta${cor.slice(1)})"` : ''}/>`;
    if (l.rotulo) html += `<div class="rot" style="left:${l.rotulo[0]}mm;top:${l.rotulo[1]}mm;color:${cor}">${l.rotulo[2]}</div>`;
  }
  const cores = ['0f5e73', 'c62828', '2e7d32', 'e39a2d', '7b5cc4'];
  const marcadores = cores.map((c) => `<marker id="seta${c}" viewBox="0 0 6 6" refX="5.6" refY="3" markerWidth="2.9" markerHeight="2.9" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0.4 L6,3 L0,5.6 z" fill="#${c}"/></marker>`).join('');
  return `<section class="pg">${cabecalho(titulo, sub)}
    <svg class="lig" viewBox="0 0 297 210"><defs>${marcadores}</defs>${svg}</svg>${html}${extras}${rodape(n, total)}</section>`;
}

const cabecalho = (titulo, sub) => `<img class="logo" src="${LOGO}"><svg class="tri" viewBox="0 0 30 23"><polyline points="1,1 29,1 29,22 1,1" fill="none" stroke="#1b9bbc" stroke-width=".5"/></svg>
  <h1>${titulo}</h1><div class="sub">${sub}</div><div class="traco"></div>`;
const rodape = (n, total) => `<div class="rod"><span>MyBlue Condomínio Garantido &nbsp;|&nbsp; Fluxograma operacional — Portal MyBlue &nbsp;|&nbsp; ${VERSAO}</span><span>${n} / ${total}</span></div>`;

const CSS = `
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Liberation Sans", Arial, Helvetica, sans-serif; color: #173c46; }
.pg { width: 297mm; height: 210mm; position: relative; overflow: hidden; break-after: page; }
.pg:last-child { break-after: auto; }
.logo { position: absolute; left: 12mm; top: 9mm; height: 13.5mm; }
.tri { position: absolute; left: 260mm; top: 6.5mm; width: 30mm; }
h1 { position: absolute; left: 12mm; top: 24.5mm; margin: 0; font-size: 18pt; color: #0f5e73; }
.sub { position: absolute; left: 12mm; top: 32.6mm; font-size: 9.2pt; color: #6b7c82; }
.traco { position: absolute; left: 12mm; top: 38.2mm; width: 15mm; height: .6mm; background: #1b9bbc; }
.lig { position: absolute; left: 0; top: 0; width: 297mm; height: 210mm; }
.caixa { position: absolute; border: .45mm solid; border-radius: 2mm; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 7.6pt; line-height: 1.22; padding: 1mm 1.6mm; }
.caixa.pilula { border-radius: 9mm; font-size: 7.8pt; }
.caixa.pilula b { color: #0f5e73; }
.caixa.nota { border-style: dashed; text-align: left; justify-content: flex-start; font-size: 7.2pt; }
.txt.dec { position: absolute; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 7.1pt; line-height: 1.15; font-weight: 700; color: #6b5300; }
.tag { position: absolute; color: #fff; font-size: 5.8pt; font-weight: 700; padding: .5mm 1.6mm; border-radius: .8mm; white-space: nowrap; letter-spacing: .1mm; }
.rot { position: absolute; font-size: 6.6pt; font-weight: 700; white-space: nowrap; background: #fff; padding: 0 .6mm; }
.secao { position: absolute; left: 12mm; font-size: 9.5pt; font-weight: 700; color: #1b9bbc; text-transform: uppercase; }
.rod { position: absolute; left: 12mm; right: 12mm; top: 197mm; border-top: .25mm solid #c9dde3; padding-top: 1.6mm; font-size: 6.8pt; color: #7a8a90; display: flex; justify-content: space-between; }

/* página "como usar" */
.cols { position: absolute; left: 12mm; right: 12mm; top: 46mm; display: grid; grid-template-columns: 1fr 1fr; gap: 0 12mm; }
.cols h2 { font-size: 10.5pt; color: #0f5e73; margin: 0 0 2.4mm; text-transform: uppercase; }
.cols h2 + * { margin-top: 0; }
.ator { margin-bottom: 2.2mm; }
.ator .tag { position: static; display: inline-block; margin-bottom: .8mm; font-size: 6.6pt; }
.ator p { margin: 0; font-size: 7.8pt; line-height: 1.3; }
.forma { display: flex; align-items: center; gap: 4mm; margin-bottom: 1.8mm; font-size: 7.8pt; }
.forma .m { width: 26mm; height: 7mm; border: .4mm solid #0f5e73; border-radius: 1.6mm; background: #e9f3f6; display: flex; align-items: center; justify-content: center; font-size: 7pt; font-weight: 700; color: #0f5e73; flex: none; }
.forma .m.pil { border-radius: 5mm; border-color: #1b9bbc; background: #eaf6fa; }
.forma .m.nota { border-style: dashed; background: #fff; }
.forma .m.dec { border: 0; background: none; position: relative; }
.forma .m.dec svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.forma .m.dec span { position: relative; color: #6b5300; }
.sla { border: .35mm solid; border-radius: 1.6mm; padding: 1.8mm 2.6mm; margin-bottom: 2.2mm; font-size: 7.8pt; line-height: 1.3; }
.sla b.t { display: block; font-size: 8.4pt; margin-bottom: .4mm; }
.st { display: flex; gap: 3mm; align-items: flex-start; margin-bottom: 1.5mm; font-size: 7.8pt; line-height: 1.28; }
.st .tag { position: static; flex: none; width: 27mm; text-align: center; font-size: 6.4pt; }
.gat { display: flex; gap: 3mm; align-items: center; margin-bottom: 1.4mm; font-size: 7.6pt; }
.gat .tag { position: static; flex: none; font-size: 6.4pt; }
.import { position: absolute; left: 12mm; right: 12mm; top: 189mm; text-align: center; font-style: italic; font-size: 7.8pt; color: #7a8a90; }
`;

/* ---------- página 1: Central de Tickets ---------- */
function ticketsPagina(total) {
  const Y = [64, 114, 164];
  const nos = [
    { id: 'ini', c: 0, y: Y[0], tipo: 'pilula', t: '<b>INÍCIO</b><br>Precisa de algo de outro setor' },
    { id: 'abrir', c: 1, y: Y[0], ator: 'colaborador', t: 'Abrir o ticket: setor, tipo de demanda, condomínio ou interna, descrição e anexos' },
    { id: 'd1', c: 2, y: Y[0], tipo: 'decisao', ator: 'portal', t: 'De condomínio, em Cobrança ou Crédito?' },
    { id: 'fila', c: 3, y: Y[0], ator: 'portal', t: 'Vai para a fila do setor, sem responsável; os líderes são avisados' },
    { id: 'lider', c: 4, y: Y[0], ator: 'lider', t: 'Escolher o responsável (ou assumir) e ajustar prioridade e prazo para resposta' },
    { id: 'aviso', c: 5, y: Y[0], ator: 'portal', t: 'Responsável recebe o aviso: sino, som e e-mail' },
    { id: 'd2', c: 5, y: Y[1], tipo: 'decisao', ator: 'responsavel', t: 'É demanda do seu setor?' },
    { id: 'iniciar', c: 4, y: Y[1], ator: 'responsavel', t: 'Iniciar atendimento e informar o prazo para conclusão' },
    { id: 'tratar', c: 3, y: Y[1], ator: 'responsavel', t: 'Tratar: conversar no ticket, notas internas e anexos' },
    { id: 'd3', c: 2, y: Y[1], tipo: 'decisao', ator: 'responsavel', t: 'Depende de alguém de fora?' },
    { id: 'resolver', c: 1, y: Y[1], ator: 'responsavel', t: 'Marcar como resolvido e dizer o que foi feito' },
    { id: 'avisa', c: 0, y: Y[1], ator: 'portal', t: 'Quem pediu é avisado e vê o que foi feito' },
    { id: 'd4', c: 0, y: Y[2], tipo: 'decisao', tagDireita: true, ator: 'colaborador', t: 'Ficou resolvido?' },
    { id: 'fim', c: 1, y: Y[2], tipo: 'pilula', t: '<b>FIM</b><br>Ticket resolvido: fica no histórico e no Painel' },
    { id: 'atraso', c: 4, y: Y[2], w: 40, h: 21, tipo: 'nota', ator: 'supervisao', t: '<span><b>Prazo vencido = ⚠ atrasado.</b> O líder redistribui ou ajusta o prazo (com justificativa); a supervisão acompanha todos os setores no Painel.</span>' },
    { id: 'transf', c: 5, y: Y[2], tagDireita: true, ator: 'responsavel', t: 'Transferir para o setor certo, com o motivo. O ticket entra na fila do novo setor' },
  ];
  const lig = [
    { de: ['ini', 'r'], para: ['abrir', 'l'] },
    { de: ['abrir', 'r'], para: ['d1', 'l'] },
    { de: ['d1', 'r'], para: ['fila', 'l'], rotulo: [145.5, 59.6, 'NÃO'] },
    { de: ['fila', 'r'], para: ['lider', 'l'] },
    { de: ['lider', 'r'], para: ['aviso', 'l'] },
    { de: ['d1', 't'], via: [[125, 45.5], [263, 45.5]], para: ['aviso', 't'], cor: '#2e7d32', rotulo: [150, 43.4, 'SIM · direto para o responsável da carteira (analista de cobrança / assistente de crédito)'] },
    { de: ['aviso', 'b'], para: ['d2', 't'] },
    { de: ['d2', 'l'], para: ['iniciar', 'r'], rotulo: [237.2, 109.6, 'SIM'] },
    { de: ['d2', 'b'], para: ['transf', 't'], cor: '#c62828', rotulo: [264.6, 133.2, 'NÃO'] },
    { de: ['iniciar', 'l'], para: ['tratar', 'r'] },
    { de: ['tratar', 'l'], para: ['d3', 'r'] },
    { de: ['d3', 't'], via: [[125, 95.5], [161, 95.5]], para: ['tratar', 't'], cor: '#e39a2d', semSeta: false, rotulo: [127, 93.2, 'SIM · situação “Aguardando”'] },
    { de: ['d3', 'l'], para: ['resolver', 'r'], rotulo: [99.6, 109.6, 'NÃO'] },
    { de: ['resolver', 'l'], para: ['avisa', 'r'] },
    { de: ['avisa', 'b'], para: ['d4', 't'] },
    { de: ['d4', 'r'], para: ['fim', 'l'], rotulo: [53.8, 159.6, 'SIM'] },
    { de: ['d4', 'b'], via: [[33, 184.5], [181, 184.5]], para: ['tratar', 'b'], cor: '#c62828', rotulo: [60, 182.4, 'NÃO · reabrir o ticket (com o motivo)'] },
  ];
  // a linha do "Aguardando" entra pelo topo do "Tratar" um pouco à esquerda do centro, e a de "reabrir" à direita
  lig[11].via = [[125, 95.5], [181, 95.5], [181, 104.5]]; lig[11].para = null;
  lig[16].via = [[33, 184.5], [165, 184.5], [165, 123.5]]; lig[16].para = null;
  const setas = '<svg class="lig" viewBox="0 0 297 210"><path d="M181,104.5 l-1.3,-2.6 h2.6 z" fill="#e39a2d"/><path d="M165,123.5 l-1.3,2.6 h2.6 z" fill="#c62828"/></svg>';
  return pagina(1, total, 'Fluxograma — Central de Tickets', 'Do pedido de quem precisa até a resolução: para quem vai, quem distribui, quem atende e como quem pediu acompanha', nos, lig, setas);
}

/* ---------- página 2: acessos e ferramentas ---------- */
function acessosPagina(total) {
  const A = 66; const A2 = 95; const B = 140; const B2 = 170;
  const nos = [
    { id: 'ini', c: 0, y: A, tipo: 'pilula', t: '<b>INÍCIO</b><br>Pessoa nova na equipe' },
    { id: 'd', c: 1, y: A, tipo: 'decisao', ator: 'lider', t: 'O perfil é Usuário?' },
    { id: 'coord', c: 2, y: A, ator: 'lider', t: 'Coordenador ou supervisor cadastra em Usuários do setor: setor e ferramentas' },
    { id: 'adm', c: 2, y: A2, h: 21, ator: 'admin', t: 'Administração cadastra coordenador, supervisor ou admin em Usuários e acessos: perfil, setores e marcações' },
    { id: 'senha', c: 3, y: A, ator: 'portal', t: 'Gera a senha temporária (aparece uma vez só)' },
    { id: 'prim', c: 4, y: A, ator: 'colaborador', t: '1º acesso: troca a senha (8+ caracteres, com letras e números)' },
    { id: 'fimA', c: 5, y: A, tipo: 'pilula', t: '<b>FIM</b><br>Vê as ferramentas, tickets e tutoriais do perfil e do setor' },
    { id: 'iniB', c: 0, y: B, tipo: 'pilula', t: '<b>INÍCIO</b><br>Ferramenta nova ou HTML atualizado' },
    { id: 'envia', c: 1, y: B, ator: 'lider', t: 'Envia o HTML em Gestão do setor → Ferramentas do setor' },
    { id: 'publica', c: 2, y: B, ator: 'portal', t: 'Publica para todos e guarda a versão anterior' },
    { id: 'dB', c: 3, y: B, tipo: 'decisao', ator: 'lider', t: 'Mudou a tela ou o jeito de usar?' },
    { id: 'tut', c: 4, y: B, ator: 'admin', t: 'Gravar ou regravar o tutorial e atualizar o manual (o portal avisa: “regravar”)' },
    { id: 'fimB', c: 5, y: B, tipo: 'pilula', t: '<b>FIM</b><br>Ferramenta em uso, com tutorial e manual em dia' },
    { id: 'volta', c: 1, y: B2, w: 40, h: 19, tipo: 'nota', ator: 'lider', t: '<span><b>Deu problema?</b> Versões anteriores → <b>Usar esta</b> volta na hora; <b>Baixar</b> guarda o HTML de qualquer versão.</span>' },
  ];
  const lig = [
    { de: ['ini', 'r'], para: ['d', 'l'] },
    { de: ['d', 'r'], para: ['coord', 'l'], rotulo: [99.6, 61.6, 'SIM'] },
    { de: ['d', 'b'], via: [[79, A2]], para: ['adm', 'l'], cor: '#c62828', rotulo: [80.4, 86.5, 'NÃO'] },
    { de: ['coord', 'r'], para: ['senha', 'l'] },
    { de: ['adm', 'r'], via: [[171, A2]], para: ['senha', 'b'] },
    { de: ['senha', 'r'], para: ['prim', 'l'] },
    { de: ['prim', 'r'], para: ['fimA', 'l'] },
    { de: ['iniB', 'r'], para: ['envia', 'l'] },
    { de: ['envia', 'r'], para: ['publica', 'l'] },
    { de: ['publica', 'r'], para: ['dB', 'l'] },
    { de: ['dB', 'r'], para: ['tut', 'l'], rotulo: [191.6, 135.6, 'SIM'] },
    { de: ['tut', 'r'], para: ['fimB', 'l'] },
    { de: ['dB', 'b'], via: [[171, B2], [263, B2]], para: ['fimB', 'b'], rotulo: [176, 167.8, 'NÃO · nada a regravar'] },
    { de: ['publica', 'b'], via: [[125, B2]], para: ['volta', 'r'], tracejado: true },
  ];
  const secoes = `<div class="secao" style="top:44mm">A · Acesso de uma pessoa nova</div><div class="secao" style="top:118mm">B · Ferramenta nova ou atualizada</div>`;
  return pagina(2, total, 'Fluxograma — Acessos e ferramentas', 'Como uma pessoa ganha acesso ao portal e como uma ferramenta nova ou atualizada chega à equipe', nos, lig, secoes);
}

/* ---------- página 3: como usar ---------- */
function comoUsarPagina(total) {
  const tag = (k) => `<span class="tag" style="background:${ATORES[k][1]}">${ATORES[k][0]}</span>`;
  const ator = (k, t) => `<div class="ator">${tag(k)}<p>${t}</p></div>`;
  const st = (t, cor, d) => `<div class="st"><span class="tag" style="background:${cor}">${t}</span><span>${d}</span></div>`;
  const dec = '<svg viewBox="0 0 26 7" preserveAspectRatio="none"><polygon points="13,.3 25.7,3.5 13,6.7 .3,3.5" fill="#fdf6d8" stroke="#c9a227" stroke-width=".35"/></svg>';
  const corpo = `<div class="cols"><div>
    <h2>Atores e papéis</h2>
    ${ator('colaborador', 'Qualquer pessoa do portal. Abre tickets para outros setores, acompanha, conversa, cancela ou reabre o próprio pedido. É também quem faz o primeiro acesso.')}
    ${ator('portal', 'O próprio sistema: decide para quem o ticket vai, avisa as pessoas (sino, som e e-mail), conta os prazos no expediente e guarda o histórico e as versões das ferramentas.')}
    ${ator('lider', 'Líder do setor na Central de Tickets, coordenador ou supervisor. Distribui a fila, ajusta prioridade e prazo para resposta e cuida do setor: usuários, ferramentas, equipe e tipos de demanda.')}
    ${ator('responsavel', 'Quem atende o ticket. Inicia o atendimento com o prazo para conclusão, trata, transfere quando não é do setor e resolve dizendo o que foi feito.')}
    ${ator('supervisao', 'Quem tem a marcação Supervisão da Central de Tickets (ex.: Gerência). Vê e direciona os tickets de todos os setores e acompanha o Painel.')}
    ${ator('admin', 'Administração do portal. Cria coordenadores, supervisores e administradores, cuida dos módulos, dos setores, dos tutoriais e do backup.')}
    <h2 style="margin-top:3.4mm">Formas do fluxograma</h2>
    <div class="forma"><span class="m pil">Início/Fim</span>Início ou fim do fluxo</div>
    <div class="forma"><span class="m">Ação</span>Tarefa feita por um dos atores (a cor é a do ator)</div>
    <div class="forma"><span class="m dec">${dec}<span>Decisão</span></span>Bifurcação (SIM / NÃO)</div>
    <div class="forma"><span class="m nota">Nota</span>Regra ou alternativa que vale em qualquer ponto</div>
  </div><div>
    <h2>Prazos (SLA) deste fluxo</h2>
    <div class="sla" style="border-color:#1b9bbc;background:#eaf6fa"><b class="t" style="color:#0f7f9c">▌Prazo para resposta (1º retorno)</b>Sai do tipo de demanda; sem tipo, da prioridade: <b>Urgente 4 h úteis · Alta 1 dia útil · Média 3 dias úteis · Baixa 5 dias úteis</b>. Só o líder muda.</div>
    <div class="sla" style="border-color:#e39a2d;background:#fdf3e2"><b class="t" style="color:#a8650c">▌Prazo para conclusão</b>Quem atende informa ao iniciar o atendimento. Se mudar, quem pediu é avisado, com o motivo.</div>
    <div class="sla" style="border-color:#2e7d32;background:#ecf6ed"><b class="t" style="color:#2e7d32">▌Expediente</b>Os prazos contam só de <b>segunda a sexta, das 8h às 17h</b> (9 h = 1 dia útil), horário de Brasília, sem os feriados cadastrados.</div>
    <h2 style="margin-top:3mm">Situações possíveis</h2>
    ${st('NOVO', '#1b9bbc', 'Chegou; o atendimento ainda não foi iniciado.')}
    ${st('EM ANDAMENTO', '#e39a2d', 'Atendimento iniciado, com prazo para conclusão.')}
    ${st('AGUARDANDO', '#8fa3aa', 'Parado esperando quem pediu ou terceiros (banco, síndico, fornecedor).')}
    ${st('RESOLVIDO', '#2e7d32', 'Atendido. Quem pediu é avisado e pode reabrir, com o motivo.')}
    ${st('CANCELADO', '#6b7c82', 'Não será atendido (duplicado, desistência). Sempre com motivo.')}
    ${st('⚠ ATRASADO', '#c62828', 'Passou do prazo para resposta sem retorno, ou do prazo para conclusão ainda em aberto.')}
    <h2 style="margin-top:3mm">Avisos (sino, som e e-mail)</h2>
    <div class="gat"><span class="tag" style="background:#7b5cc4">Para o responsável</span>Ticket passado para você · ticket reaberto.</div>
    <div class="gat"><span class="tag" style="background:#0f5e73">Para os líderes</span>Ticket novo ou transferido para o setor (sem líder marcado: toda a equipe).</div>
    <div class="gat"><span class="tag" style="background:#1b9bbc">Para quem pediu</span>Resolvido ou cancelado · mudou a previsão de conclusão · comentários.</div>
  </div></div>
  <div class="import">Importante: peça e responda sempre pelo ticket, não por mensagem solta. É o que garante prazo, responsável e histórico.</div>`;
  return `<section class="pg">${cabecalho('Como usar este fluxograma', 'Atores, formas, prazos, situações possíveis e avisos')}${corpo}${rodape(3, total)}</section>`;
}

async function gerar() {
  const total = 3;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Fluxograma — Portal MyBlue</title><style>${CSS}</style></head><body>${ticketsPagina(total)}${acessosPagina(total)}${comoUsarPagina(total)}</body></html>`;
  const { chromium } = playwright();
  const br = await chromium.launch();
  const page = await br.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  fs.mkdirSync(SAIDA, { recursive: true });
  const destino = path.join(SAIDA, 'Fluxograma-Portal-MyBlue.pdf');
  await page.pdf({ path: destino, printBackground: true, preferCSSPageSize: true });
  await br.close();
  console.log('ok', destino);
}

if (require.main === module) gerar().catch((e) => { console.error(e); process.exit(1); });

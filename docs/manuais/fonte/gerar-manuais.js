'use strict';
/*
 * Gera os manuais do Portal MyBlue em PDF (Manual Geral + um por setor).
 *
 *   node docs/manuais/fonte/gerar-manuais.js
 *
 * Precisa do Playwright com Chromium (npm i -g playwright && npx playwright install chromium).
 * As telas ficam em fonte/img (capturadas com fonte/capturar-telas.js, dados fictícios).
 * O conteúdo de cada setor está em fonte/setores.js.
 */
const fs = require('fs');
const path = require('path');
const { SETORES, FERRAMENTAS } = require('./setores');

const FONTE = __dirname;
const SAIDA = path.join(__dirname, '..');
const LOGO = path.join(__dirname, '..', '..', '..', 'public', 'img', 'logo.png');
const VERSAO = 'Outubro de 2026';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PRIO = { urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
function prazo(h) {
  if (h % 9 === 0) return h / 9 === 1 ? '1 dia útil' : `${h / 9} dias úteis`;
  return `${h} h úteis`;
}

/* ---------- blocos ---------- */
const fig = (img, legenda, largura = 100, cls = '') => `<figure class="${cls}" style="width:${largura}%"><img src="img/${img}.jpg"><figcaption>${legenda}</figcaption></figure>`;
const passos = (lista) => `<ol class="passos">${lista.map((p) => `<li>${p}</li>`).join('')}</ol>`;
const dica = (t) => `<div class="caixa dica"><span class="tit">Dica</span>${t}</div>`;
const atencao = (t) => `<div class="caixa atencao"><span class="tit">Atenção</span>${t}</div>`;
const tabela = (cab, linhas, cls = '') => `<table class="${cls}"><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const etq = (t, cor) => `<span class="etq ${cor}">${t}</span>`;

const CSS = `
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
@page capa { margin: 0; }
:root { --teal:#199cb1; --teal-d:#147f90; --teal-bg:#e3f4f7; --blue:#0b76ba; --ink:#13323a; --ink2:#3c5660; --muted:#6f8a94; --border:#dde8ec; --bg:#eef4f7;
  --green:#1f9d6b; --green-bg:#e4f5ee; --amber:#9a6512; --amber-bg:#fbf0db; --red:#d8463b; --red-bg:#fbe7e5; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Nunito Sans", Arial, sans-serif; color: var(--ink); font-size: 10.6pt; line-height: 1.5; margin: 0; }
h1, h2, h3 { font-family: "Quicksand", Arial, sans-serif; color: var(--ink); line-height: 1.2; }
h1 { font-size: 22pt; margin: 0 0 4mm; padding-top: 2mm; }
h1 .num { color: var(--teal); margin-right: 3mm; }
h2 { font-size: 14pt; margin: 7mm 0 2.5mm; color: var(--teal-d); }
h3 { font-size: 11.5pt; margin: 5mm 0 2mm; }
p { margin: 0 0 3mm; }
ul { margin: 0 0 3mm; padding-left: 5mm; }
li { margin-bottom: 1.2mm; }
a { color: var(--teal-d); }
.capitulo { break-before: page; }
.intro { font-size: 11.5pt; color: var(--ink2); margin-bottom: 5mm; }
figure { margin: 3mm auto 5mm; break-inside: avoid; }
figure img { width: auto; max-width: 100%; max-height: 98mm; margin: 0 auto; display: block; border: 1px solid var(--border); border-radius: 3mm; box-shadow: 0 1mm 4mm rgba(19,50,58,.10); }
figcaption { font-size: 8.6pt; color: var(--muted); text-align: center; margin-top: 2mm; font-style: italic; }
.lado { display: flex; gap: 6mm; align-items: flex-start; break-inside: avoid; }
.lado > div { flex: 1; }
.lado > figure { flex: 0 0 38%; margin-top: 0; }
.pequena img { max-height: 78mm; }
ol.passos { counter-reset: p; list-style: none; padding: 0; margin: 2mm 0 4mm; }
ol.passos li { counter-increment: p; position: relative; padding: 0 0 0 10mm; margin-bottom: 2.6mm; min-height: 7mm; }
ol.passos li::before { content: counter(p); position: absolute; left: 0; top: -.3mm; width: 6.6mm; height: 6.6mm; border-radius: 50%; background: var(--teal); color: #fff; font-weight: 800; font-size: 9.5pt; display: flex; align-items: center; justify-content: center; }
.caixa { border-radius: 2.5mm; padding: 3mm 4mm; margin: 3mm 0 4mm; break-inside: avoid; font-size: 10pt; }
.caixa .tit { display: block; font-family: "Quicksand", Arial, sans-serif; font-weight: 700; font-size: 10pt; margin-bottom: .8mm; }
.dica { background: var(--teal-bg); border-left: 1.2mm solid var(--teal); }
.dica .tit { color: var(--teal-d); }
.atencao { background: var(--amber-bg); border-left: 1.2mm solid #d98a1b; }
.atencao .tit { color: var(--amber); }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 5mm; font-size: 9.6pt; break-inside: auto; }
tr { break-inside: avoid; }
th { background: var(--teal-d); color: #fff; text-align: left; padding: 2mm 2.6mm; font-weight: 700; font-size: 9pt; }
td { padding: 2mm 2.6mm; border-bottom: 1px solid var(--border); vertical-align: top; }
tbody tr:nth-child(even) td { background: #f6fafb; }
.etq { display: inline-block; font-size: 8.4pt; font-weight: 800; border-radius: 99px; padding: .3mm 2.4mm; white-space: nowrap; }
.etq.azul { background: var(--teal-bg); color: var(--teal-d); } .etq.ambar { background: var(--amber-bg); color: var(--amber); }
.etq.cinza { background: #f1f5f7; color: var(--muted); border: 1px solid var(--border); } .etq.verde { background: var(--green-bg); color: var(--green); }
.etq.vermelha { background: var(--red-bg); color: var(--red); }
.sim { color: var(--green); font-weight: 800; } .nao { color: #b3c3c9; }
.sumario { list-style: none; padding: 0; margin: 4mm 0; columns: 2; column-gap: 10mm; }
.sumario li { padding: 1.6mm 0; border-bottom: 1px dotted var(--border); font-weight: 700; break-inside: avoid; }
.sumario li span { color: var(--teal); margin-right: 2mm; }
.cartao-rapido { border: 1px solid var(--border); border-radius: 3mm; padding: 4mm 5mm; background: #f9fcfd; break-inside: avoid; }
.cartao-rapido h3 { margin-top: 0; }
.grade2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 8mm; }
.grade2 > div { break-inside: avoid; }

/* capa */
.capa { page: capa; height: 297mm; position: relative; overflow: hidden; break-after: page; }
.capa .faixa { position: absolute; inset: 0 0 auto 0; height: 168mm; background: linear-gradient(150deg, #0c77be 0%, #199cb1 70%, #4fc1cf 100%); color: #fff; padding: 46mm 22mm 0; }
.capa .faixa .chapeu { font-size: 11pt; letter-spacing: .5mm; text-transform: uppercase; opacity: .85; font-weight: 800; }
.capa .faixa h1 { color: #fff; font-size: 46pt; margin: 4mm 0 4mm; line-height: 1.08; }
.capa .faixa .sub { font-size: 14pt; opacity: .92; max-width: 150mm; }
.capa .onda { position: absolute; left: 0; right: 0; top: 150mm; height: 40mm; background: #fff; border-radius: 50% 50% 0 0 / 100% 100% 0 0; transform: scaleX(1.4); }
.capa .base { position: absolute; left: 22mm; right: 22mm; bottom: 26mm; }
.capa .base img { height: 17mm; }
.capa .base .info { margin-top: 8mm; color: var(--muted); font-size: 10pt; border-top: 1px solid var(--border); padding-top: 4mm; display: flex; justify-content: space-between; }
.capa .destaques { position: absolute; left: 22mm; right: 22mm; top: 196mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; }
.capa .destaques div { background: var(--bg); border-radius: 3mm; padding: 4mm; font-size: 9.6pt; color: var(--ink2); }
.capa .destaques b { display: block; font-family: "Quicksand", Arial, sans-serif; color: var(--teal-d); font-size: 11pt; margin-bottom: 1mm; }
`;

function documento(titulo, corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>${corpo}</body></html>`;
}

function capa(chapeu, titulo, sub, destaques) {
  return `<section class="capa"><div class="faixa"><div class="chapeu">${chapeu}</div><h1>${titulo}</h1><div class="sub">${sub}</div></div><div class="onda"></div>
  <div class="destaques">${destaques.map(([t, d]) => `<div><b>${t}</b>${d}</div>`).join('')}</div>
  <div class="base"><img src="${LOGO}"><div class="info"><span>Portal MyBlue · uso interno</span><span>${VERSAO}</span></div></div></section>`;
}

/* ---------- trechos usados nos dois tipos de manual ---------- */
const CONCEITOS = `
<h2>Os termos da Central de Tickets</h2>
${tabela(['Termo', 'O que significa'], [
  ['<b>Ticket</b>', 'Uma demanda registrada: o que precisa ser feito, por quem pediu e para qual setor. Cada ticket tem um número (ex.: #128).'],
  ['<b>Setor</b>', 'Quem vai atender. A equipe do setor é formada por quem tem aquele setor no cadastro.'],
  ['<b>Demanda de condomínio ou interna</b>', 'De condomínio: escolhida na Carteira de condomínios. Em Cobrança e Crédito, vai direto para a pessoa responsável pelo condomínio. Interna: vai para o líder do setor, que distribui.'],
  ['<b>Tipo de demanda</b>', 'Assuntos padronizados de cada setor (ex.: "2ª via de boleto"). Cada tipo já tem prazo e prioridade sugeridos.'],
  ['<b>Responsável</b>', 'A pessoa do setor que está cuidando do ticket. Sem responsável = está na fila esperando o líder distribuir.'],
  ['<b>Prioridade</b>', `${etq('Urgente', 'vermelha')} ${etq('Alta', 'ambar')} ${etq('Média', 'azul')} ${etq('Baixa', 'cinza')}`],
  ['<b>Prazo para resposta</b>', 'Até quando a equipe deve dar o 1º retorno. Sai sozinho do tipo de demanda ou da prioridade. Só o líder muda.'],
  ['<b>Prazo para conclusão</b>', 'Até quando a demanda será concluída. Quem atende define ao <b>iniciar o atendimento</b>, e quem abriu vê essa previsão.'],
  ['<b>Nota interna</b>', 'Comentário que só a equipe do setor vê. Quem abriu o ticket não vê.'],
])}
<p>Os prazos contam <b>só o expediente: segunda a sexta, das 8h às 17h</b> (9 h = 1 dia útil). O ticket fica ${etq('⚠ atrasado', 'vermelha')} quando passa do prazo para resposta sem nenhum retorno, ou quando passa do prazo para conclusão ainda em aberto.</p>
<h3>Situações de um ticket</h3>
${tabela(['Situação', 'Quando usar'], [
  [etq('Novo', 'azul'), 'Acabou de chegar, o atendimento ainda não foi iniciado.'],
  [etq('Em andamento', 'ambar'), 'Quem atende iniciou o atendimento e definiu o prazo para conclusão.'],
  [etq('Aguardando', 'cinza'), 'Parado esperando resposta de quem abriu ou de terceiros (banco, síndico, fornecedor).'],
  [etq('Resolvido', 'verde'), 'Demanda atendida. Quem abriu é avisado e pode reabrir se não ficou resolvido.'],
  [etq('Cancelado', 'cinza'), 'Não será atendido (pedido duplicado, desistência etc.). Sempre com motivo.'],
])}
<h3>Prazo para resposta padrão</h3>
<p>Quando o tipo de demanda não tem prazo próprio, vale o da prioridade:</p>
${tabela(['Prioridade', 'Prazo para resposta', 'Exemplo'], [
  [etq('Urgente', 'vermelha'), '4 horas úteis', 'Aberto na sexta às 16h30, vence na segunda às 11h30.'],
  [etq('Alta', 'ambar'), '1 dia útil', 'Aberto na terça às 10h, vence na quarta às 10h.'],
  [etq('Média', 'azul'), '3 dias úteis', 'Aberto na quarta às 10h, vence na segunda às 10h.'],
  [etq('Baixa', 'cinza'), '5 dias úteis', 'Aberto na segunda às 14h, vence na segunda seguinte às 14h.'],
])}`;

const ABRIR = `
<p>Use a Central sempre que precisar de algo de <b>outro setor</b>. Assim nada se perde em conversas soltas, o setor sabe o prazo e você acompanha tudo num lugar só.</p>
${passos([
  'Clique em <b>Novo ticket</b> (na tela inicial ou em <b>Tickets</b>).',
  'Em <b>Para qual setor?</b>, escolha quem vai atender e, em <b>Tipo de demanda</b>, o assunto. Se nenhum servir, deixe <i>Outro / não sei</i>.',
  'Em <b>A demanda é de</b>, marque <b>Um condomínio</b> (e escolha o condomínio da lista) ou <b>Interna</b>. Logo abaixo o portal mostra para quem o ticket vai.',
  'Escreva um <b>Assunto</b> curto e claro, por exemplo: "2ª via — apto 51".',
  'Na <b>Descrição</b>, coloque tudo o que o setor precisa: unidade, valores, datas, contatos.',
  'Confira a <b>Prioridade</b>. Abaixo dela aparece o prazo para resposta.',
  'Se tiver arquivos (boleto, print, planilha), anexe em <b>Anexos</b>.',
  'Clique em <b>Abrir ticket</b>. Quem vai atender recebe o aviso na hora.',
])}
${fig('04-novo-ticket', 'Abrindo um ticket de condomínio: o portal mostra que ele vai direto para o responsável pelo condomínio no setor.')}
${dica('Em <b>Cobrança</b> e <b>Crédito</b>, o ticket de condomínio vai direto para a pessoa da carteira (analista de cobrança ou assistente de crédito). Se essa pessoa ainda não estiver no setor no portal, o ticket vai para o líder.')}
${atencao('Use <b>Urgente</b> só quando realmente for para o mesmo dia. Se tudo for urgente, nada é urgente.')}`;

const ACOMPANHAR = `
<p>Em <b>Tickets → Abertos por mim</b> você vê tudo o que pediu, a situação, quem está cuidando e o prazo (para resposta ou para conclusão).</p>
${fig('05-abertos-por-mim', 'Abertos por mim: seus pedidos com situação, responsável e prazo.')}
<p>Clique num ticket para abrir. Você pode:</p>
<ul>
  <li><b>Conversar</b> com quem está atendendo: escreva no campo de mensagem e clique em <b>Enviar</b>.</li>
  <li><b>Ver a previsão de conclusão</b> que quem atende definiu ao iniciar. Se ela mudar, você é avisado, com o motivo.</li>
  <li><b>Anexar arquivos</b> que faltaram.</li>
  <li><b>Cancelar meu pedido</b>, se não precisar mais.</li>
  <li><b>Reabrir</b> o ticket depois de resolvido, se o problema continuar (o motivo é obrigatório).</li>
</ul>
${fig('06-detalhe-solicitante', 'O ticket visto por quem abriu: histórico, conversa, prazos e botão de cancelar.')}`;

const ATENDER = `
<h3>Onde estão os tickets</h3>
${tabela(['Aba', 'O que mostra'], [
  ['<b>Minha fila</b>', 'Tickets em que <b>você</b> é o responsável. É a sua lista de trabalho.'],
  ['<b>Fila do setor</b>', 'Tudo o que chegou para os seus setores, inclusive o que ainda está <b>sem responsável</b>.'],
  ['<b>Abertos por mim</b>', 'O que você pediu para outros setores.'],
])}
<p>Filtros: situação (a lista abre em <b>Todas as situações</b>, com os em aberto primeiro), setor, <b>só atrasados</b> e <b>sem responsável</b>. A busca aceita o número (#128) ou parte do assunto.</p>
${fig('07-minha-fila', 'Minha fila: o contador ao lado de “Tickets” no menu mostra quantos estão com você.')}
<h3>Tratando um ticket</h3>
${passos([
  'Abra o ticket. Se ele está com você e ainda é <i>Novo</i>, clique em <b>Iniciar atendimento</b>.',
  'Informe o <b>prazo para conclusão</b>: até quando você conclui a demanda. Quem abriu vê essa previsão.',
  'Converse com quem abriu pelo campo de mensagem. Para algo só da equipe, marque <b>nota interna</b>.',
  'Se depender de alguém de fora, mude a situação para <i>Aguardando</i> e clique em <b>Salvar alterações</b>.',
  'Se o prazo para conclusão mudar, ajuste a data e explique o motivo (quem abriu é avisado).',
  'Ao terminar, clique em <b>Marcar como resolvido</b> e escreva o que foi feito (quem abriu vê esse texto).',
])}
${fig('09b-iniciar', 'Iniciar atendimento: quem atende informa até quando conclui.')}
${fig('09-detalhe-equipe', 'O ticket visto pela equipe: nota interna (fundo amarelo), comentários e o painel de ações à direita.')}
<div class="grade2"><div>${fig('10-resolver', 'Ao resolver, conte o que foi feito.')}</div><div>${fig('11-transferir', 'Transferir: o ticket vai para o outro setor.')}</div></div>
<h3>Não é do seu setor? Transfira</h3>
<p>Clique em <b>Transferir para outro setor</b>, escolha o setor (e o tipo, se souber) e explique o motivo. O ticket vai para a pessoa da carteira do novo setor (se houver) ou para a fila dele, e a equipe nova define o próprio prazo para conclusão.</p>
<h3>Não vai conseguir tratar?</h3>
<p>Só o líder muda o responsável. Escreva uma nota interna explicando e avise o líder do setor para redistribuir.</p>
${dica('Mantenha a situação atualizada. Ela é o que quem abriu vê: um ticket parado em <i>Novo</i> passa a impressão de que ninguém olhou.')}`;

const LIDER = `
<p>O líder <b>distribui</b> os tickets do setor. São líderes as pessoas marcadas como líder na equipe e também o <b>coordenador</b> e o <b>supervisor</b> do setor.</p>
${passos([
  'Abra <b>Tickets → Fila do setor</b> e marque <b>sem responsável</b> para ver o que está esperando.',
  'Abra o ticket e escolha a pessoa no campo <b>Responsável</b> (ou clique em <b>Assumir para mim</b>).',
  'Ajuste a <b>prioridade</b> ou o <b>prazo para resposta</b> se precisar e clique em <b>Salvar alterações</b>.',
  'A pessoa escolhida recebe o aviso na hora (sino e som; e-mail quando estiver ativado).',
])}
<div class="lado"><div>
<h3>Rotina sugerida do líder</h3>
<ul>
  <li><b>No início do dia:</b> distribuir tudo o que está sem responsável.</li>
  <li><b>Ao longo do dia:</b> marcar <b>só atrasados</b> e agir neles (redistribuir, ajustar o prazo com justificativa, cobrar retorno).</li>
  <li><b>Toda semana:</b> olhar o <b>Painel de tickets</b>: atrasados, % no prazo e tempo médio por pessoa.</li>
</ul>
${dica('Tickets novos e transferidos para o setor avisam os líderes marcados na equipe. Se o setor não tiver líder marcado, toda a equipe recebe o aviso.')}
</div>${fig('08b-lider-atribuir', 'O líder escolhe o responsável, a prioridade e o prazo para resposta.', 100, 'pequena')}</div>
${fig('08-fila-setor', 'Fila do setor vista pela líder: prioridade, situação, responsável e prazo.')}`;

const AVISOS = `
<p>O <b>sino</b> no canto superior direito mostra quantos avisos você ainda não leu. Quando chega um aviso novo, o portal <b>toca um som</b> e mostra uma mensagem.</p>
${tabela(['Você recebe aviso quando…', 'No portal', 'Por e-mail*'], [
  ['Um ticket é <b>passado para você</b>', '<span class="sim">✓</span>', '<span class="sim">✓</span>'],
  ['Chega um <b>ticket novo</b> ou transferido para o seu setor (líderes)', '<span class="sim">✓</span>', '<span class="sim">✓</span>'],
  ['Seu ticket foi <b>resolvido ou cancelado</b>', '<span class="sim">✓</span>', '<span class="sim">✓</span>'],
  ['Mudou a <b>previsão de conclusão</b> de um ticket seu', '<span class="sim">✓</span>', '<span class="sim">✓</span>'],
  ['Um ticket seu foi <b>reaberto</b>', '<span class="sim">✓</span>', '<span class="sim">✓</span>'],
  ['Alguém <b>comentou</b> num ticket seu', '<span class="sim">✓</span>', '<span class="nao">—</span>'],
  ['Mudaram situação ou prioridade de um ticket seu', '<span class="sim">✓</span>', '<span class="nao">—</span>'],
])}
<p style="font-size:9pt;color:var(--muted)">* Quando o envio de e-mail (Microsoft 365) estiver configurado. Até lá, os avisos aparecem só no portal.</p>
<div class="lado"><div>
<h3>Receber alertas mesmo com o portal em outra aba</h3>
${passos([
  'Clique no <b>sino</b>.',
  'Clique em <b>Ativar alertas no computador</b> e, na pergunta do navegador, clique em <b>Permitir</b>.',
  'Deixe <b>tocar som</b> marcado.',
])}
${atencao('O som e o alerta só funcionam com o portal <b>aberto</b> em alguma aba do navegador. Deixe uma aba do portal aberta durante o expediente.')}
<p>Abrir um ticket marca os avisos dele como lidos. Use <b>Marcar todos como lidos</b> para zerar o contador.</p>
</div>${fig('12-avisos', 'Avisos: lista, som e alertas do computador.')}</div>`;

const PAINEL = `
<p>O <b>Painel de tickets</b> mostra como está o atendimento. Cada pessoa vê os setores de que faz parte; quem tem a <b>Supervisão da Central de Tickets</b> e a administração veem todos. Escolha o período (7, 30 ou 90 dias, ou 12 meses) e, se quiser, um setor.</p>
${tabela(['Número', 'O que significa'], [
  ['<b>Em aberto</b>', 'Tickets novos, em andamento ou aguardando, agora. Mostra também quantos estão sem responsável.'],
  ['<b>Atrasados</b>', 'Em aberto com prazo vencido (resposta ou conclusão). É o número que mais pede ação.'],
  ['<b>Abertos no período</b>', 'Quantas demandas chegaram no período escolhido.'],
  ['<b>Resolvidos no período</b>', 'Quantas foram resolvidas e qual % dentro do prazo.'],
  ['<b>Tempo médio de resolução</b>', 'Da abertura até resolver (em horas corridas).'],
  ['<b>Tempo médio de 1ª resposta</b>', 'Da abertura até o primeiro retorno da equipe a quem abriu.'],
])}
${fig('13-painel', 'Painel: números gerais, por setor, por responsável e tipos de demanda mais abertos.')}`;

const PERFIS = `
<p class="intro">O que cada pessoa vê e faz no portal sai de <b>um lugar só</b>: o cadastro dela, em <i>Usuários e acessos</i>. Ali ficam o <b>perfil</b>, o <b>setor</b> (ou setores) e as <b>ferramentas liberadas</b>.</p>
${tabela(['Perfil', 'Para quem', 'O que faz'], [
  ['<b>Usuário</b>', 'A equipe em geral', 'Usa as ferramentas liberadas, abre e acompanha tickets e trata os tickets do setor dele.'],
  ['<b>Coordenador</b>', 'Quem coordena um setor', 'Tudo do usuário, mais a <b>gestão do setor</b>: usuários, ferramentas, equipe, tipos de demanda, líder nos tickets e carteira do setor.'],
  ['<b>Supervisor</b>', 'Quem supervisiona um setor', 'Os <b>mesmos poderes do coordenador</b>, nos setores dele. Um não fica acima do outro.'],
  ['<b>Administrador</b>', 'A administração do portal', 'Faz tudo, em todos os setores, e é o único que cria coordenadores, supervisores e administradores.'],
])}
<h2>O setor no cadastro</h2>
<ul>
  <li>O setor define a <b>equipe</b> de cada setor na Central de Tickets: quem é do setor vê a fila dele e trata os tickets.</li>
  <li>Para <b>coordenador e supervisor</b>, define o que eles gerenciam. Eles também abrem <b>todas as ferramentas</b> dos setores deles, sem precisar marcar uma a uma.</li>
  <li>Uma pessoa pode ter mais de um setor.</li>
</ul>
<h2>Marcações à parte</h2>
${tabela(['Marcação', 'O que libera'], [
  ['<b>Supervisão da Central de Tickets</b>', 'Ver e direcionar os tickets de <b>todos</b> os setores, e o painel de todos. Para quem acompanha a empresa toda (ex.: Gerência).'],
  ['<b>Marketing — Central de Links</b>', 'Editar os links e o fundo da campanha da Central de Links.'],
])}
${fig('15b-usuario', 'Cadastro da pessoa: perfil, marcações, setor(es) e ferramentas liberadas.')}`;

const GESTAO = `
<p class="intro">Coordenadores e supervisores ganham no menu o grupo <b>Gestão do setor</b>. Tudo ali vale <b>só para os setores do cadastro deles</b>.</p>
<h2>Usuários do setor</h2>
${passos([
  'Em <b>Gestão do setor → Usuários do setor</b>, clique em <b>Novo usuário</b>.',
  'Preencha nome e e-mail, confira o <b>setor</b> e marque as <b>ferramentas</b> do setor que a pessoa vai usar.',
  'Clique em <b>Criar usuário</b> e passe à pessoa a senha temporária que aparece na tela (ela não aparece de novo).',
])}
<ul>
  <li>Aparecem na lista os <b>usuários comuns</b> dos seus setores e os que você criou. Clique na pessoa para editar, desativar ou <b>redefinir a senha</b>.</li>
  <li>Você libera só ferramentas dos seus setores. O que a administração liberou de outros setores para a pessoa continua como está.</li>
  <li>Coordenadores, supervisores e administradores são criados e editados só pela administração.</li>
</ul>
<div class="grade2"><div>${fig('20-coord-usuarios', 'Usuários do setor.')}</div><div>${fig('20b-coord-novo', 'Cadastro de usuário pelo coordenador.')}</div></div>
<h2>Ferramentas do setor</h2>
<p>Clique numa ferramenta para:</p>
<ul>
  <li><b>Enviar uma versão nova do HTML</b> quando a ferramenta for alterada. A versão anterior fica guardada.</li>
  <li><b>Voltar para uma versão anterior</b>, em <i>Versões anteriores → Usar esta</i>, se algo der errado.</li>
  <li>Escolher <b>quem pode abrir</b> a ferramenta, entre as pessoas do seu setor, e clicar em <b>Salvar quem pode abrir</b>.</li>
</ul>
${fig('21b-coord-html', 'Ferramenta do setor: HTML, versões anteriores e quem pode abrir.')}
<h2>Equipe e tipos de demanda</h2>
<ul>
  <li>Marque os <b>líderes</b>: eles recebem os avisos de tickets novos e distribuem. Quem faz parte do setor vem do cadastro (para incluir alguém, use <i>Usuários do setor</i>).</li>
  <li>Cadastre os <b>tipos de demanda</b> do setor, com prazo em horas úteis (9 h = 1 dia útil) e prioridade sugerida.</li>
</ul>
${fig('23-coord-equipe', 'Equipe do setor: líderes e tipos de demanda.')}
<h2>Tickets do setor</h2>
<p>Coordenador e supervisor têm, nos setores deles, os poderes do <b>líder</b>: escolhem e trocam o responsável, a prioridade e o prazo para resposta.</p>
<h2>Carteira do setor</h2>
<p>Na <b>Carteira de condomínios</b>, eles alteram e transferem o <b>responsável do setor</b> deles: Cobrança → <i>analista de cobrança</i>; Crédito → <i>assistente de crédito</i>. Os demais dados do condomínio são da administração.</p>
${fig('24-coord-carteira', 'Carteira: o coordenador de Crédito altera só o assistente de crédito.')}`;

const CARTEIRA = `
<p class="intro">A <b>Carteira de condomínios</b> reúne os condomínios atendidos e quem cuida de cada um: <b>analista de cobrança</b>, <b>analista extrajudicial</b> (ApoioCob) e <b>assistente de crédito</b>.</p>
<ul>
  <li><b>Condomínios:</b> indicadores (ativos, comarcas, pessoas por função, ativos sem responsável), busca por nome, razão social, CNPJ ou ID, filtros por situação, UF, administradora e responsável. Clique no condomínio para ver a ficha completa e o histórico de alterações.</li>
  <li><b>Responsáveis:</b> quantos condomínios ativos cada pessoa tem, por UF. Clique no número para ver a lista.</li>
  <li><b>Exportar CSV:</b> baixa a carteira no formato da planilha, que abre no Excel.</li>
</ul>
${fig('18-carteira', 'Carteira de condomínios: indicadores, filtros e a lista com os responsáveis.')}
${tabela(['Quem', 'O que pode'], [
  ['Todos', 'Consultar e exportar.'],
  ['Coordenador e supervisor de Cobrança ou Crédito', 'Alterar e <b>transferir</b> o responsável do setor deles (aba Responsáveis → Transferir).'],
  ['Administração', 'Cadastrar, editar, remover, importar o CSV da planilha e transferir qualquer função.'],
])}
${dica('A carteira também decide para quem vai o ticket de condomínio em Cobrança e Crédito. Mantenha os responsáveis em dia.')}`;

const LINKS = `
<p class="intro">A <b>Central de Links</b> reúne os links úteis da equipe, por grupos. Fica no menu, logo abaixo de <i>Início</i>, e os links abrem em nova aba.</p>
${fig('19-links', 'Central de Links.')}
<p>Quem edita: a administração e quem tem a marcação <b>Marketing — Central de Links</b> no cadastro. Na página aparece o botão <b>Editar links e fundo</b>, com três abas:</p>
<ul>
  <li><b>Fundo da campanha:</b> nome, data em que entra no ar e a imagem de fundo (computador e, se quiser, celular). Dá para deixar o fundo do mês seguinte agendado. O botão <b>Ver</b> mostra como a página fica antes de entrar no ar.</li>
  <li><b>Links:</b> incluir, mudar nome, endereço, grupo, ícone e descrição; mudar a ordem; ocultar sem apagar ou excluir.</li>
  <li><b>Título da página:</b> título e subtítulo do topo.</li>
</ul>`;

/* ---------- Manual Geral ---------- */
function manualGeral() {
  const caps = [
    ['O que é o Portal MyBlue'], ['Entrar, sair e sua conta'], ['Tela inicial e menu'], ['Perfis e acessos'],
    ['Central de Tickets: como funciona'], ['Pedir algo para outro setor'], ['Acompanhar seus pedidos'],
    ['Atender os tickets do seu setor'], ['Líder do setor'], ['Supervisão da Central de Tickets'],
    ['Avisos: sino, som e e-mail'], ['Painel de indicadores'], ['Carteira de condomínios'], ['Central de Links'],
    ['Gestão do setor: coordenador e supervisor'], ['Administração'], ['Quem pode o quê'], ['Perguntas frequentes'],
  ];
  let n = 0;
  const cap = (titulo, html) => `<section class="capitulo"><h1><span class="num">${++n}</span>${titulo}</h1>${html}</section>`;
  const corpo = capa('Manual de utilização', 'Portal MyBlue', 'Guia geral do portal e da Central de Tickets para todas as pessoas da equipe.', [
    ['Ferramentas', 'Todas as ferramentas dos setores em um só endereço, com login.'],
    ['Central de Tickets', 'Demandas entre setores com responsável, prazo para resposta e para conclusão.'],
    ['Gestão do setor', 'Coordenadores e supervisores cuidam do próprio setor.'],
  ]) +
  `<section><h1>Sumário</h1><ol class="sumario">${caps.map(([t], i) => `<li><span>${i + 1}</span>${t}</li>`).join('')}</ol>
  ${dica('Cada setor também tem o seu <b>manual do setor</b>, com as ferramentas, a rotina e os tipos de demanda que atende.')}</section>` +

  cap('O que é o Portal MyBlue', `
  <p class="intro">O portal reúne em um único endereço as ferramentas que cada setor usa no dia a dia, a <b>Central de Tickets</b>, a <b>Carteira de condomínios</b> e a <b>Central de Links</b>.</p>
  <ul>
    <li><b>Um login por pessoa.</b> Cada um vê só o que foi liberado para ele.</li>
    <li><b>Ferramentas dos setores.</b> As centrais e controles de cada setor abrem dentro do portal, e os dados ficam guardados no banco do portal.</li>
    <li><b>Central de Tickets.</b> Qualquer pessoa abre um pedido para um setor; o setor recebe, distribui, trata e responde, com prazo.</li>
    <li><b>Histórico.</b> Tudo fica registrado: quem pediu, quem tratou, o que foi feito e quando.</li>
  </ul>
  ${fig('02-inicio', 'Tela inicial: atalho da Central de Tickets e as ferramentas liberadas para você.')}
  <p>O portal funciona no computador e no celular, direto no navegador (Chrome ou Edge recomendados).</p>
  <div class="grade2"><div>${fig('17-celular', 'No celular: sua fila de tickets.', 60)}</div><div>${fig('17b-celular-menu', 'No celular, o menu abre pelo botão ☰.', 60)}</div></div>`) +

  cap('Entrar, sair e sua conta', `
  <h2>Primeiro acesso</h2>
  ${passos([
    'A administração (ou o coordenador do seu setor) cadastra você e envia o <b>endereço do portal</b>, seu <b>e-mail</b> e uma <b>senha temporária</b>.',
    'Abra o endereço, digite o e-mail e a senha temporária e clique em <b>Entrar</b>.',
    'O portal pede uma <b>senha nova</b>: pelo menos 8 caracteres, com letras e números.',
  ])}
  ${fig('01-login', 'Tela de entrada do portal. O ícone de olho mostra ou esconde a senha digitada.', 85)}
  <h2>No dia a dia</h2>
  <ul>
    <li>A sessão dura <b>12 horas</b> e se renova sozinha enquanto você usa. Se expirar, o portal pede para entrar de novo.</li>
    <li>Em <b>Minha conta</b> (ícone de pessoa no rodapé do menu) você troca a <b>senha</b> e coloca sua <b>foto de perfil</b>. A foto aparece no menu, na lista de usuários e nos comentários dos tickets.</li>
    <li>Para <b>sair</b>, use o ícone de saída ao lado. Em computador compartilhado, sempre saia.</li>
    <li><b>Esqueceu a senha?</b> Peça ao coordenador do seu setor ou à administração para redefinir. Você recebe uma nova senha temporária.</li>
  </ul>
  ${atencao('Depois de 8 tentativas erradas, o login fica bloqueado por 15 minutos. A senha é pessoal: não compartilhe.')}
  ${fig('16-conta', 'Minha conta: foto de perfil e troca de senha.', 80, 'pequena')}`) +

  cap('Tela inicial e menu', `
  <p>O <b>menu lateral</b> tem tudo o que você pode acessar:</p>
  ${tabela(['Item', 'Para que serve'], [
    ['<b>Busca</b>', 'Digite parte do nome para achar uma ferramenta. Enter abre a primeira.'],
    ['<b>Início</b>', 'Saudação, atalho da Central de Tickets e os cartões das suas ferramentas.'],
    ['<b>Central de Links</b>', 'Os links úteis da equipe.'],
    ['<b>Central de Tickets → Tickets</b>', 'Suas filas. O número ao lado mostra quantos tickets estão com você (fica vermelho se algum está atrasado).'],
    ['<b>Painel de tickets</b>', 'Indicadores do atendimento.'],
    ['<b>Carteira → Carteira de condomínios</b>', 'Os condomínios atendidos e quem cuida de cada um.'],
    ['<b>Ferramentas por setor</b>', 'As ferramentas liberadas para você, agrupadas por setor.'],
    ['<b>Gestão do setor</b>', 'Só para coordenadores e supervisores: usuários, ferramentas e equipe do setor.'],
    ['<b>Administração</b>', 'Só para administradores.'],
  ])}
  <h2>Usando uma ferramenta</h2>
  <ul>
    <li>Clique na ferramenta para abrir. Ela continua aberta em segundo plano quando você vai para outra tela (um ponto azul aparece no menu).</li>
    <li>Na barra de cima: <b>⟳ Recarregar</b>, <b>Abrir em nova aba</b> e <b>✕ Fechar</b> (libera memória).</li>
    <li>Quando a ferramenta salva dados no servidor, aparece <span class="etq verde">✓ salvo no servidor</span>. Se aparecer <span class="etq vermelha">⚠ falha ao salvar</span>, o portal tenta de novo sozinho: não feche a aba até sumir.</li>
    <li>Ferramentas compartilhadas (como o Controle de Emissão de Boletos) mostram o que os colegas fazem em poucos segundos, sem recarregar.</li>
  </ul>`) +

  cap('Perfis e acessos', PERFIS) +

  cap('Central de Tickets: como funciona', `
  <p class="intro">A Central de Tickets organiza as demandas entre os setores: <b>quem precisa pede</b>, o ticket vai <b>para o responsável</b> (ou para a fila do setor), quem atende <b>inicia o atendimento com um prazo</b>, trata e <b>quem pediu é avisado</b>.</p>
  ${tabela(['Etapa', 'Quem faz', 'O que acontece'], [
    ['1. Abrir', 'Qualquer pessoa', 'Escolhe o setor, o tipo, se é de um condomínio ou interna, descreve e anexa arquivos.'],
    ['2. Para quem vai', 'Sistema', 'De condomínio, em Cobrança ou Crédito: direto para a pessoa da carteira. Interna ou outros setores: fila do setor, e os líderes são avisados.'],
    ['3. Distribuir', 'Líder (ou coordenador/supervisor do setor)', 'Define ou troca o responsável. A pessoa é avisada.'],
    ['4. Iniciar', 'Responsável', 'Clica em <b>Iniciar atendimento</b> e informa o prazo para conclusão.'],
    ['5. Tratar', 'Responsável', 'Atualiza a situação, conversa, registra notas internas, transfere se não for do setor.'],
    ['6. Resolver', 'Responsável', 'Marca como resolvido e diz o que foi feito. Quem abriu é avisado e pode reabrir.'],
  ])}
  ${CONCEITOS}`) +

  cap('Pedir algo para outro setor', ABRIR) +
  cap('Acompanhar seus pedidos', ACOMPANHAR) +
  cap('Atender os tickets do seu setor', `<p class="intro">Se você é de um setor (pelo seu cadastro), recebe e trata os tickets que chegam para ele.</p>${ATENDER}`) +
  cap('Líder do setor', LIDER) +
  cap('Supervisão da Central de Tickets', `
  <p class="intro">Quem tem a marcação <b>Supervisão da Central de Tickets</b> no cadastro (ex.: Gerência) acompanha e direciona os tickets de <b>todos os setores</b>.</p>
  <ul>
    <li>Vê a aba <b>Todos</b> em Tickets, com os tickets de todos os setores.</li>
    <li>Troca o <b>responsável</b> de qualquer ticket, <b>transfere</b> entre setores e muda <b>situação, prioridade e prazo</b>.</li>
    <li>Vê o <b>Painel</b> com todos os setores e pode filtrar por setor.</li>
    <li>A marcação não dá acesso à administração nem à gestão dos setores.</li>
  </ul>
  ${fig('13b-todos', 'Aba “Todos”: visão de todos os setores.')}
  ${dica('Use o filtro <b>só atrasados</b> na aba Todos para achar rapidamente o que precisa de intervenção.')}
  <p>O <b>perfil</b> Supervisor é outra coisa: ele gerencia os setores do cadastro dele (veja <i>Gestão do setor</i>).</p>`) +
  cap('Avisos: sino, som e e-mail', AVISOS) +
  cap('Painel de indicadores', PAINEL) +
  cap('Carteira de condomínios', CARTEIRA) +
  cap('Central de Links', LINKS) +
  cap('Gestão do setor: coordenador e supervisor', GESTAO) +
  cap('Administração', `
  <p class="intro">Este capítulo é para os <b>administradores</b> do portal, que fazem tudo, em todos os setores.</p>
  <h2>Usuários e acessos</h2>
  ${passos([
    'Em <b>Administração → Usuários e acessos</b>, clique em <b>Novo usuário</b>.',
    'Preencha nome e e-mail e escolha o <b>perfil</b>: Usuário, Coordenador, Supervisor ou Administrador.',
    'Marque o <b>setor</b> (ou setores). Para coordenador e supervisor, ele é obrigatório: é o que eles vão gerenciar.',
    'Se for o caso, marque <b>Supervisão da Central de Tickets</b> (todos os setores) ou <b>Marketing — Central de Links</b>.',
    'Marque as <b>ferramentas liberadas</b>. Coordenador e supervisor já abrem todas as do setor deles; marque só as de outros setores.',
    'Clique em <b>Criar usuário</b> e envie à pessoa os dados mostrados (a senha temporária não aparece de novo).',
  ])}
  ${fig('15-usuarios', 'Usuários e acessos: perfil e setor de cada pessoa.')}
  <p>Para <b>bloquear</b> alguém, desmarque <i>Usuário ativo</i>: as sessões abertas são encerradas na hora. <b>Redefinir senha</b> gera uma nova senha temporária.</p>
  <h2>Equipes e tipos de demanda</h2>
  <p>Em <b>Administração → Equipes e tipos de demanda</b>, cada setor tem um cartão. A equipe vem do setor no cadastro de cada pessoa (dá para ajustar aqui também). Marque os <b>líderes</b> e cadastre os <b>tipos de demanda</b>, com prazo em horas úteis e prioridade sugerida. Tipos já usados não podem ser apagados, só desativados.</p>
  ${fig('14b-equipe-setor', 'Configurando o setor: equipe, líder e tipos de demanda com prazo.')}
  ${atencao('Setor <b>sem ninguém</b>: os tickets dele só aparecem para a administração e a supervisão. Setor <b>sem líder</b> marcado: toda a equipe recebe os avisos de tickets novos.')}
  <h2>Módulos e dados</h2>
  <ul>
    <li>Cada ferramenta é um <b>módulo</b> (um arquivo HTML) com nome, setor, ícone e situação. Envie novas versões e volte versões anteriores.</li>
    <li>Escolha <b>onde ficam os dados</b> e, nas ferramentas que usavam planilha Google, importe os dados e passe a usar o banco do portal.</li>
    <li>Nas ferramentas que vieram do Claude (Boletos, Síndicos), use <b>Importar dados (JSON)</b> e <b>Baixar tudo (JSON)</b>.</li>
    <li>Em <b>Setores</b>, crie, renomeie ou remova setores. Em <b>Backup do banco</b>, baixe um arquivo com todas as tabelas.</li>
  </ul>
  ${fig('22-modulos', 'Módulos e dados.')}
  <h2>Histórico de atividades</h2>
  <p>Quem entrou, abriu ferramentas, alterou dados, cadastrou usuários, abriu ou transferiu tickets e mexeu na carteira.</p>`) +

  cap('Quem pode o quê', `
  <h2>Portal</h2>
  ${tabela(['Ação', 'Usuário', 'Coordenador', 'Supervisor', 'Admin'], [
    ['Abrir as ferramentas', 'liberadas', 'do setor + liberadas', 'do setor + liberadas', 'todas'],
    ['Criar e editar usuários comuns', '—', 'do setor', 'do setor', 'todos'],
    ['Criar coordenadores, supervisores e admins', '—', '—', '—', 'sim'],
    ['Enviar HTML, voltar versão, quem pode abrir', '—', 'do setor', 'do setor', 'todos'],
    ['Líderes e tipos de demanda', '—', 'do setor', 'do setor', 'todos'],
    ['Carteira: consultar e exportar', 'sim', 'sim', 'sim', 'sim'],
    ['Carteira: responsável do setor', '—', 'do setor', 'do setor', 'tudo'],
    ['Módulos e dados, setores, backup, histórico', '—', '—', '—', 'sim'],
    ['Central de Links: editar', 'com a marcação', 'com a marcação', 'com a marcação', 'sim'],
  ].map((l) => l.map((c, i) => (i === 0 ? c : c === 'sim' ? '<span class="sim">✓</span>' : c === '—' ? '<span class="nao">—</span>' : c))))}
  <h2>Central de Tickets</h2>
  ${tabela(['Ação', 'Qualquer pessoa', 'Equipe do setor', 'Líder / coord. / superv.', 'Supervisão de tickets', 'Admin'], [
    ['Abrir ticket para qualquer setor', 'sim', 'sim', 'sim', 'sim', 'sim'],
    ['Ver, comentar e anexar nos seus tickets', 'sim', 'sim', 'sim', 'sim', 'sim'],
    ['Cancelar / reabrir o próprio pedido', 'sim', 'sim', 'sim', 'sim', 'sim'],
    ['Ver a fila do setor', '—', 'sim', 'sim', 'todos', 'todos'],
    ['Iniciar atendimento, mudar situação, resolver', '—', 'sim', 'sim', 'sim', 'sim'],
    ['Nota interna e transferir', '—', 'sim', 'sim', 'sim', 'sim'],
    ['Escolher responsável, prioridade e prazo para resposta', '—', '—', 'sim', 'sim', 'sim'],
    ['Painel de tickets', '—', 'seus setores', 'seus setores', 'todos', 'todos'],
  ].map((l) => l.map((c, i) => (i === 0 ? c : c === 'sim' ? '<span class="sim">✓</span>' : c === '—' ? '<span class="nao">—</span>' : c))))}`) +
  cap('Perguntas frequentes', `
  ${[
    ['Abri o ticket no setor errado. E agora?', 'Escreva um comentário pedindo a transferência. A equipe do setor transfere para o certo, ou cancele e abra de novo.'],
    ['O prazo venceu e o ticket não foi resolvido.', 'Ele aparece como <span class="etq vermelha">⚠ atrasado</span> para o setor e no painel. Comente no ticket para cobrar retorno.'],
    ['Por que o prazo do meu ticket vence só na segunda?', 'O prazo conta só o expediente (seg–sex, 8h–17h). Pedidos abertos no fim da sexta continuam a contar na segunda.'],
    ['Meu ticket de condomínio foi para o líder, e não para a pessoa da carteira.', 'A pessoa da carteira ainda não está no setor no portal (ou o condomínio está sem responsável). Peça ao coordenador para conferir o cadastro e a carteira.'],
    ['Não estou ouvindo o som dos avisos.', 'O portal precisa estar aberto em alguma aba, e você precisa ter clicado pelo menos uma vez na página. Confira <b>tocar som</b> no sino e o volume do computador.'],
    ['Quem abriu o ticket vê as notas internas?', 'Não. Notas e anexos marcados como internos só aparecem para a equipe do setor, a supervisão e a administração.'],
    ['Posso apagar um ticket?', 'Não. Tickets ficam no histórico. Use <b>Cancelar</b> com o motivo.'],
    ['Não aparece a Fila do setor para mim.', 'Seu cadastro ainda não tem setor. Peça ao coordenador do setor ou à administração.'],
    ['Uma ferramenta não aparece no meu menu.', 'Ela não foi liberada para você. Peça ao coordenador do setor da ferramenta ou à administração.'],
    ['A ferramenta mudou, mas eu ainda vejo a versão antiga.', 'Use <b>⟳ Recarregar</b> na barra de cima. Se a tela do portal parecer antiga, aperte <b>Ctrl + Shift + R</b>.'],
    ['Que tamanho de arquivo posso anexar?', 'Até 10 MB por arquivo. Imagens abrem no navegador; os demais arquivos são baixados.'],
  ].map(([q, r]) => `<h3>${q}</h3><p>${r}</p>`).join('')}`);

  return documento('Manual Geral — Portal MyBlue', corpo);
}

/* ---------- Manual do setor ---------- */
function manualSetor(s) {
  let n = 0;
  const cap = (titulo, html) => `<section class="capitulo"><h1><span class="num">${++n}</span>${titulo}</h1>${html}</section>`;
  const ferr = s.ferramentas.map((k) => FERRAMENTAS[k]);
  const tipos = s.recebe;

  const corpo = capa('Manual do setor', esc(s.nome), `Como o setor ${esc(s.nome)} usa o Portal MyBlue e a Central de Tickets.`, [
    ['O setor no portal', ferr.length ? `${ferr.length === 1 ? 'Ferramenta' : 'Ferramentas'} do setor e a Central de Tickets.` : 'Central de Tickets para receber e pedir demandas.'],
    ['Rotina', 'Como a equipe e o líder tratam a fila no dia a dia.'],
    ['Tipos de demanda', `${tipos.length} tipos sugeridos, com prazo e o que informar.`],
  ]) +

  cap(`O setor ${esc(s.nome)} no portal`, `
  <p class="intro">${s.papel}</p>
  <p>No portal, o setor ${esc(s.nome)} tem:</p>
  <ul>
    ${ferr.map((f) => `<li><b>${f.nome}</b>: ${f.descricao}</li>`).join('')}
    <li><b>Central de Tickets</b>: recebe as demandas que os outros setores pedem para o ${esc(s.nome)}, e é por ela que o ${esc(s.nome)} pede o que precisa dos outros setores.</li>
    ${s.carteira ? `<li><b>Carteira de condomínios</b>: o ${esc(s.nome)} é o responsável pela coluna <b>${s.carteira}</b>. Os tickets de condomínio para o ${esc(s.nome)} vão direto para essa pessoa.</li>` : ''}
    <li><b>Gestão do setor</b>: o coordenador e o supervisor do ${esc(s.nome)} cuidam dos usuários, das ferramentas, da equipe e dos tipos de demanda do setor.</li>
    ${s.supervisao ? '<li><b>Supervisão da Central de Tickets</b>: visão e direcionamento dos tickets de <b>todos</b> os setores (veja o capítulo próprio).</li>' : ''}
  </ul>
  ${fig('02-inicio', 'Tela inicial: atalho da Central de Tickets e as ferramentas liberadas para você.')}
  ${dica('O passo a passo de acesso, senha e menu está no <b>Manual Geral do Portal MyBlue</b>.')}`) +

  (ferr.length ? cap(ferr.length === 1 ? 'Ferramenta do setor' : 'Ferramentas do setor', ferr.map((f) => `
  <h2>${f.nome}</h2>
  <p>${f.descricao}</p>
  <ul>
    <li><b>Como abrir:</b> no menu, em <b>${esc(s.nome)}</b>, ou no cartão da tela inicial. <b>Nova aba</b> abre em tela cheia.</li>
    <li><b>Os dados:</b> ${f.dados}</li>
    <li><b>Acesso:</b> quem tem a ferramenta liberada no cadastro, mais o coordenador e o supervisor do setor. Peça ao coordenador do setor ou à administração.</li>
    <li><b>Atualizações:</b> quando a ferramenta mudar, o coordenador ou supervisor envia o HTML novo em <b>Gestão do setor → Ferramentas do setor</b>.</li>
  </ul>
  ${f.obs ? dica(f.obs) : ''}`).join('') + `
  <h3>Cuidados</h3>
  <ul>
    <li>Quando aparecer <span class="etq verde">✓ salvo no servidor</span>, o que você lançou já está guardado.</li>
    <li>Se aparecer <span class="etq vermelha">⚠ falha ao salvar</span>, não feche a aba: o portal tenta de novo sozinho.</li>
    <li>Se a ferramenta travar, use <b>⟳ Recarregar</b> na barra de cima.</li>
  </ul>`) : '') +

  cap('Como o setor recebe as demandas', `
  <p class="intro">Tudo o que outros setores pedem ao ${esc(s.nome)} chega pela <b>Central de Tickets</b>, na <b>Fila do setor</b>.</p>
  ${tabela(['Etapa', 'O que acontece'], [
    ['Chegou', `O ticket entra como ${etq('Novo', 'azul')}. ${s.carteira ? `Se for de um condomínio, vai direto para o ${s.carteira} da carteira; se for interno, fica` : 'Fica'} sem responsável, e os líderes do ${esc(s.nome)} recebem o aviso (sino e som).`],
    ['Distribuído', 'O líder (ou o coordenador/supervisor do setor) escolhe o responsável.'],
    ['Iniciado', `O responsável clica em <b>Iniciar atendimento</b> e informa o prazo para conclusão: o ticket passa para ${etq('Em andamento', 'ambar')}.`],
    ['Em tratamento', `O responsável conversa, registra notas internas e usa ${etq('Aguardando', 'cinza')} quando depende de alguém de fora.`],
    ['Resolvido', `${etq('Resolvido', 'verde')} com o que foi feito. Quem pediu é avisado.`],
  ])}
  <p>O prazo de cada ticket conta só o expediente (<b>seg–sex, 8h–17h</b>). Ticket com prazo vencido aparece como ${etq('⚠ atrasado', 'vermelha')}.</p>
  ${ATENDER}`) +

  cap('Rotina sugerida', `
  <div class="grade2">
    <div class="cartao-rapido"><h3>Equipe do ${esc(s.nome)}</h3><ul>
      <li>Manter <b>uma aba do portal aberta</b> no expediente, com alertas ativados no sino.</li>
      <li>Começar o dia pela <b>Minha fila</b>, do prazo mais curto para o mais longo.</li>
      <li>Ao receber um ticket, clicar em <b>Iniciar atendimento</b> e dar um prazo para conclusão realista.</li>
      <li>Atualizar a situação sempre que mudar algo e <b>responder no ticket</b>, não por fora.</li>
      <li>Resolver dizendo <b>o que foi feito</b>.</li>
    </ul></div>
    <div class="cartao-rapido"><h3>Líder do ${esc(s.nome)}</h3><ul>
      <li>No início do dia: <b>distribuir</b> tudo o que está sem responsável.</li>
      <li>Duas vezes ao dia: filtrar <b>só atrasados</b> e agir.</li>
      <li>Equilibrar a fila entre as pessoas (Painel → Por responsável).</li>
      <li>Toda semana: conferir % no prazo e os <b>tipos mais pedidos</b> no Painel.</li>
      <li>Ajustar os tipos de demanda quando o prazo não fizer sentido (coordenador ou supervisor, em <b>Gestão do setor</b>).</li>
    </ul></div>
  </div>
  <h2>Distribuindo (líder)</h2>
  ${LIDER}`) +

  cap('Tipos de demanda que o setor atende', `
  <p class="intro">Os tipos de demanda organizam a fila e já definem o prazo para resposta. Abaixo, uma <b>sugestão</b> para o ${esc(s.nome)}. O coordenador ou supervisor do setor cadastra e ajusta em <i>Gestão do setor → Equipe e tipos de demanda</i> (a administração também).</p>
  ${tabela(['Tipo de demanda', 'Prazo sugerido', 'Prioridade', 'O que quem pede deve informar'], tipos.map(([nome, h, p, info]) => [
    `<b>${nome}</b>`, prazo(h), etq(PRIO[p], { urgente: 'vermelha', alta: 'ambar', media: 'azul', baixa: 'cinza' }[p]), info,
  ]))}
  ${atencao('Estes tipos e prazos são uma proposta inicial para o setor validar. Depois de cadastrados, quem abrir um ticket para o ' + esc(s.nome) + ' escolhe o tipo e o prazo é calculado sozinho.')}
  ${fig('23-coord-equipe', 'Exemplo: equipe e tipos de demanda do setor, na tela do coordenador.')}`) +

  cap('Gestão do setor: coordenador e supervisor', `
  <p class="intro">Quem tem o perfil <b>Coordenador</b> ou <b>Supervisor</b> com o setor ${esc(s.nome)} no cadastro cuida do setor no portal. Os dois têm os mesmos poderes.</p>
  ${tabela(['No menu Gestão do setor', 'O que faz'], [
    ['<b>Usuários do setor</b>', 'Cria, edita, desativa e redefine a senha das pessoas do setor, liberando as ferramentas do setor.'],
    ['<b>Ferramentas do setor</b>', 'Envia a versão nova do HTML, volta uma versão anterior e escolhe quem do setor abre cada ferramenta.'],
    ['<b>Equipe e tipos de demanda</b>', 'Marca os líderes e cadastra os tipos de demanda com prazo.'],
  ])}
  <ul>
    <li>Nos tickets do ${esc(s.nome)}, coordenador e supervisor têm os poderes do líder.</li>
    ${s.carteira ? `<li>Na Carteira de condomínios, alteram e transferem o <b>${s.carteira}</b> de cada condomínio.</li>` : ''}
    <li>Coordenadores, supervisores e administradores são cadastrados pela administração.</li>
  </ul>
  ${dica('O passo a passo completo está no <b>Manual Geral</b>, capítulo <i>Gestão do setor</i>.')}`) +

  cap('Quando o setor precisa de outro setor', `
  <p>Quando o ${esc(s.nome)} depende de outro setor, <b>abra um ticket</b> em vez de pedir por mensagem ou e-mail. Assim fica registrado, com prazo e responsável.</p>
  ${tabela(['Para o setor', 'Quando'], s.abre.map(([para, quando]) => [`<b>${para}</b>`, quando]))}
  ${ABRIR}
  ${ACOMPANHAR}`) +

  (s.supervisao ? cap('Supervisão da Central de Tickets', `
  <p class="intro">Quem do ${esc(s.nome)} tiver a marcação <b>Supervisão da Central de Tickets</b> (feita pela administração no cadastro) acompanha e direciona os tickets de <b>todos os setores</b>.</p>
  ${passos([
    'Em <b>Tickets → Todos</b>, veja os tickets de todos os setores. Use os filtros <b>só atrasados</b>, <b>sem responsável</b> e setor.',
    'Abra um ticket para trocar o <b>responsável</b> (alguém da equipe do setor do ticket), <b>transferir</b> para outro setor ou ajustar <b>prioridade e prazo</b>.',
    'Use comentários (ou notas internas) para registrar a orientação dada.',
    'Acompanhe o <b>Painel de tickets</b> com todos os setores: atrasados, % no prazo e tempo médio por setor e por pessoa.',
  ])}
  ${fig('13b-todos', 'Aba “Todos”: tickets de todos os setores.')}
  ${PAINEL}
  ${dica('Sugestão de rotina: diariamente, <b>Todos → só atrasados</b>; semanalmente, o Painel dos últimos 7 dias por setor; mensalmente, os últimos 30 dias para comparar com o mês anterior.')}`) : '') +

  cap('Avisos', AVISOS) +

  cap('Consulta rápida', `
  <div class="grade2">
    <div class="cartao-rapido"><h3>Pedir algo a outro setor</h3><p><b>Novo ticket</b> → setor → tipo → assunto e descrição completos → anexos → <b>Abrir ticket</b>.</p></div>
    <div class="cartao-rapido"><h3>Distribuir (líder)</h3><p><b>Tickets → Fila do setor</b> → <b>sem responsável</b> → abrir o ticket → escolher o <b>Responsável</b>.</p></div>
    <div class="cartao-rapido"><h3>Falar só com a equipe</h3><p>No ticket, marque <b>nota interna</b> antes de enviar.</p></div>
    <div class="cartao-rapido"><h3>Não é do ${esc(s.nome)}</h3><p><b>Transferir para outro setor</b> → setor → motivo.</p></div>
    <div class="cartao-rapido"><h3>Terminei</h3><p><b>Marcar como resolvido</b> → escreva o que foi feito.</p></div>
    <div class="cartao-rapido"><h3>Comecei a tratar</h3><p><b>Iniciar atendimento</b> → informe o <b>prazo para conclusão</b>.</p></div>
  </div>
  <h2>Prazo para resposta (seg–sex, 8h–17h)</h2>
  ${tabela(['Prioridade', 'Prazo padrão'], [[etq('Urgente', 'vermelha'), '4 h úteis'], [etq('Alta', 'ambar'), '1 dia útil'], [etq('Média', 'azul'), '3 dias úteis'], [etq('Baixa', 'cinza'), '5 dias úteis']])}
  <p>Dúvidas sobre acesso, equipe ou tipos de demanda: fale com o coordenador do setor ou com a administração do portal.</p>`);

  return documento(`Manual do setor ${s.nome} — Portal MyBlue`, corpo);
}

/* ---------- PDF ---------- */
async function gerar() {
  const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
  const br = await chromium.launch();
  const page = await br.newPage();
  const lista = [['Manual-Geral-Portal-MyBlue', 'Manual Geral', manualGeral()]];
  for (const s of SETORES) lista.push([`Manual-Setor-${s.arquivo}`, `Manual do setor ${s.nome}`, manualSetor(s)]);
  fs.mkdirSync(path.join(SAIDA, 'setores'), { recursive: true });
  for (const [arquivo, titulo, html] of lista) {
    const htmlPath = path.join(FONTE, `_${arquivo}.html`);
    fs.writeFileSync(htmlPath, html);
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const destino = arquivo.startsWith('Manual-Setor') ? path.join(SAIDA, 'setores', arquivo + '.pdf') : path.join(SAIDA, arquivo + '.pdf');
    await page.pdf({
      path: destino, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-family:Arial,sans-serif;font-size:7.5pt;color:#9db3bc;padding:0 16mm;display:flex;justify-content:space-between">
        <span>Portal MyBlue · ${esc(titulo)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
    fs.unlinkSync(htmlPath);
    console.log('ok', path.relative(SAIDA, destino));
  }
  await br.close();
}

if (require.main === module) gerar().catch((e) => { console.error(e); process.exit(1); });
module.exports = { manualGeral, manualSetor };

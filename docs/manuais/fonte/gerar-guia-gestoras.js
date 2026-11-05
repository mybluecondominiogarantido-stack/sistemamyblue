'use strict';
/*
 * Gera o guia rápido das gestoras (docs/manuais/Guia-Gestoras-Ferramentas.pdf), no modelo dos manuais de setor:
 * capa em degradê com a logo da MyBlue, capítulos numerados (Quicksand + Nunito Sans), tabelas, passos e caixas.
 * As telas (fonte/img/gest-*.jpg) são do portal com dados fictícios. As fontes ficam em fonte/fontes (SIL OFL), para o
 * PDF sair igual mesmo sem acesso ao Google Fonts.
 *
 *   node docs/manuais/fonte/gerar-guia-gestoras.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FONTE = __dirname;
const SAIDA = path.join(__dirname, '..');
const LOGO = path.join(__dirname, '..', '..', '..', 'public', 'img', 'logo.png');
const DATA = 'Novembro de 2026';
const TITULO = 'Guia das gestoras · Ferramentas no portal';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fig = (img, legenda, largura = 100) => `<figure style="width:${largura}%"><img src="img/${img}.jpg"><figcaption>${legenda}</figcaption></figure>`;
const passos = (lista) => `<ol class="passos">${lista.map((p) => `<li>${p}</li>`).join('')}</ol>`;
const dica = (t) => `<div class="caixa dica"><span class="tit">Dica</span>${t}</div>`;
const atencao = (t) => `<div class="caixa atencao"><span class="tit">Atenção</span>${t}</div>`;
const tabela = (cab, linhas) => `<table><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const etq = (t, cor) => `<span class="etq ${cor}">${t}</span>`;
const fala = (t) => `<div class="fala">${esc(t).replace(/\n/g, '<br>')}</div>`;
const cartoes = (lista) => `<div class="grade2">${lista.map(([t, itens, cls]) => `<div class="cartao-rapido ${cls || ''}"><h3>${t}</h3><ul>${itens.map((i) => `<li>${i}</li>`).join('')}</ul></div>`).join('')}</div>`;

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
h2 { font-size: 14pt; margin: 7mm 0 2.5mm; color: var(--teal-d); break-after: avoid; }
h3 { font-size: 11.5pt; margin: 5mm 0 2mm; }
p { margin: 0 0 3mm; }
ul { margin: 0 0 3mm; padding-left: 5mm; }
li { margin-bottom: 1.2mm; }
.capitulo { break-before: page; }
.intro { font-size: 11.5pt; color: var(--ink2); margin-bottom: 5mm; }
figure { margin: 3mm auto 5mm; break-inside: avoid; }
figure img { width: auto; max-width: 100%; max-height: 98mm; margin: 0 auto; display: block; border: 1px solid var(--border); border-radius: 3mm; box-shadow: 0 1mm 4mm rgba(19,50,58,.10); }
figcaption { font-size: 8.6pt; color: var(--muted); text-align: center; margin-top: 2mm; font-style: italic; }
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
.etq.verde { background: var(--green-bg); color: var(--green); } .etq.vermelha { background: var(--red-bg); color: var(--red); }
.cartao-rapido { border: 1px solid var(--border); border-radius: 3mm; padding: 4mm 5mm; background: #f9fcfd; break-inside: avoid; }
.cartao-rapido h3 { margin-top: 0; }
.cartao-rapido.sim h3 { color: var(--green); } .cartao-rapido.nao h3 { color: var(--red); }
.grade2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 8mm; margin: 2mm 0 4mm; }
.grade2 > div { break-inside: avoid; }
.fala { background: #fff; border: 1px solid var(--border); border-left: 1.2mm solid var(--teal); border-radius: 2.5mm; padding: 2.6mm 4mm; margin: 2mm 0 4mm; font-size: 10pt; color: var(--ink); break-inside: avoid; }
.fluxo { display: flex; gap: 2mm; align-items: stretch; margin: 3mm 0 5mm; break-inside: avoid; }
.fluxo .p { flex: 1; background: var(--bg); border-radius: 3mm; padding: 3mm 3.4mm; font-size: 9.4pt; color: var(--ink2); }
.fluxo .p b { display: block; font-family: "Quicksand", Arial, sans-serif; color: var(--teal-d); font-size: 10.5pt; margin-bottom: .8mm; }
.fluxo .s { align-self: center; color: var(--teal); font-weight: 800; }

/* capa */
.capa { page: capa; height: 297mm; position: relative; overflow: hidden; break-after: page; }
.capa .faixa { position: absolute; inset: 0 0 auto 0; height: 168mm; background: linear-gradient(150deg, #0c77be 0%, #199cb1 70%, #4fc1cf 100%); color: #fff; padding: 46mm 22mm 0; }
.capa .faixa .chapeu { font-size: 11pt; letter-spacing: .5mm; text-transform: uppercase; opacity: .85; font-weight: 800; }
.capa .faixa h1 { color: #fff; font-size: 40pt; margin: 4mm 0 4mm; line-height: 1.08; }
.capa .faixa .sub { font-size: 14pt; opacity: .92; max-width: 150mm; }
.capa .onda { position: absolute; left: 0; right: 0; top: 150mm; height: 40mm; background: #fff; border-radius: 50% 50% 0 0 / 100% 100% 0 0; transform: scaleX(1.4); }
.capa .base { position: absolute; left: 22mm; right: 22mm; bottom: 26mm; }
.capa .base img { height: 17mm; }
.capa .base .info { margin-top: 8mm; color: var(--muted); font-size: 10pt; border-top: 1px solid var(--border); padding-top: 4mm; display: flex; justify-content: space-between; }
.capa .destaques { position: absolute; left: 22mm; right: 22mm; top: 196mm; display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; }
.capa .destaques div { background: var(--bg); border-radius: 3mm; padding: 4mm; font-size: 9.6pt; color: var(--ink2); }
.capa .destaques b { display: block; font-family: "Quicksand", Arial, sans-serif; color: var(--teal-d); font-size: 11pt; margin-bottom: 1mm; }
`;

function guia() {
  let n = 0;
  const cap = (titulo, html) => `<section class="capitulo"><h1><span class="num">${++n}</span>${titulo}</h1>${html}</section>`;
  const capa = `<section class="capa"><div class="faixa"><div class="chapeu">Guia das gestoras</div><h1>Ferramentas no portal</h1>
    <div class="sub">Como criar, publicar e atualizar ferramentas no Portal MyBlue, do jeito certo.</div></div><div class="onda"></div>
    <div class="destaques">
      <div><b>Layout</b>A ferramenta é uma tela do portal: mesmas cores, fontes e botões.</div>
      <div><b>Acessos</b>Quem abre e o que pode fazer é decidido no portal.</div>
      <div><b>Publicar</b>Ferramenta nova e atualização passam pela aprovação.</div>
    </div>
    <div class="base"><img src="${LOGO}"><div class="info"><span>Portal MyBlue · uso interno</span><span>${DATA}</span></div></div></section>`;

  return capa +

  cap('Como funciona', `
  <p class="intro">As ferramentas do portal são feitas por vocês com o Claude, em HTML. Para todas ficarem com a cara do portal, seguras e fáceis de manter, quatro regras valem sempre.</p>
  ${tabela(['Regra', 'Em uma frase'], [
    ['<b>Layout</b>', 'A ferramenta é uma tela do portal: mesmas cores, fontes e botões, sem cabeçalho próprio (capítulo 2).'],
    ['<b>Acessos</b>', 'Quem abre e o que cada um pode fazer é decidido no portal, em <b>Configurações → Acessos</b>. Nunca dentro da ferramenta (capítulo 3).'],
    ['<b>Ferramenta nova</b>', 'Você cadastra em <b>Configurações → Ferramentas</b> e a administração do portal aprova antes de alguém ver (capítulo 4).'],
    ['<b>Atualização</b>', 'Toda versão nova vai para a aprovação, com um texto curto do que mudou, que o Claude escreve para você (capítulo 5).'],
  ])}
  <div class="fluxo"><div class="p"><b>1. Criar</b>No projeto do Claude da MyBlue, com dados fictícios.</div><div class="s">›</div>
    <div class="p"><b>2. Enviar</b>No portal, em Configurações → Ferramentas.</div><div class="s">›</div>
    <div class="p"><b>3. Aprovar</b>A administração do portal confere a prévia e aprova.</div><div class="s">›</div>
    <div class="p"><b>4. Liberar</b>Em Configurações → Acessos: quem abre e com qual papel.</div></div>
  ${dica('O projeto do Claude da MyBlue já tem todas essas regras nas instruções: toda conversa nova segue o padrão sozinha. Se o resultado fugir do padrão, diga ao Claude: <i>"siga as instruções do projeto"</i>.')}
  `) +

  cap('Layout: a ferramenta é uma tela do portal', `
  <p class="intro">A ferramenta abre <b>dentro</b> do portal, que já mostra o menu, o nome dela e quem está usando. Ela começa direto no título, com as abas logo abaixo.</p>
  ${fig('gest-padrao', 'Uma ferramenta no padrão (exemplo fictício): título, explicação, abas, cartão branco, tabela e um só botão principal.', 64)}
  ${cartoes([
    ['Faça', [
      'Título com o nome da ferramenta, uma linha de explicação e as abas logo abaixo.',
      'Fundo azul bem claro e o conteúdo em cartões brancos com cantos arredondados.',
      'Azul-petróleo da MyBlue nos destaques; <b>um só botão principal</b> por tela.',
      'Fontes <b>Quicksand</b> (títulos) e <b>Nunito Sans</b> (o resto).',
      `Cores só para situação, sempre com a palavra: ${etq('concluída', 'verde')} ${etq('agendada', 'ambar')} ${etq('atrasada', 'vermelha')}`,
      'Valores em R$ com 2 casas e datas dd/mm/aaaa.',
    ], 'sim'],
    ['Não faça', [
      'Cabeçalho com logo, menu lateral, tela de login ou de boas-vindas, rodapé.',
      'Fundo escuro, gradiente colorido, uma cor diferente em cada tela.',
      'Vários botões coloridos competindo, botões quadrados.',
      'Arial, Times, fontes decorativas, letras muito pequenas.',
      'Cor sem palavra, emoji como ícone, animação chamativa.',
      'Página que rola para o lado no celular.',
    ], 'nao'],
  ])}
  ${atencao('As cores e fontes exatas estão nas instruções do projeto do Claude: não precisa decorar. Se a tela ficou diferente do portal, diga ao Claude <i>"ajuste o layout ao padrão do portal MyBlue"</i>.')}
  `) +

  cap('Acessos: sempre no portal', `
  <p class="intro">A ferramenta <b>não</b> controla quem entra nem o que cada pessoa pode fazer. Isso é feito no portal, em <b>Configurações → Acessos → Ferramentas</b>: quem abre, se <b>edita</b> ou <b>só consulta</b> e com qual <b>papel</b>.</p>
  ${fig('gest-acessos', 'Configurações → Acessos: quem abre cada ferramenta, se edita ou só consulta e o papel de cada pessoa.')}
  ${tabela(['Você quer…', 'Peça ao Claude', 'Depois, no portal'], [
    ['Que só algumas pessoas usem a ferramenta', 'Nada: a ferramenta não precisa saber', 'Libere só essas pessoas em <b>Acessos</b>'],
    ['Que alguém só veja, sem alterar', '<i>"Respeite o só consulta do portal"</i>', 'Escolha <b>Só consulta</b> para a pessoa'],
    ['Que só quem aprova veja a aba Aprovação', '<i>"Crie o papel aprovacao e mostre a aba só para ele"</i>', 'A administração cadastra o papel; você dá o papel às pessoas'],
  ])}
  ${atencao('Nunca peça ao Claude aba "Acessos", senha, lista de nomes ou e-mails dentro da ferramenta, nem "só a Fulana pode…". Pessoas entram e saem: no portal, basta liberar ou tirar o acesso. Dentro do HTML, a regra fica esquecida e a ferramenta precisa ser refeita.')}
  `) +

  cap('Ferramenta nova', `
  <p class="intro">Quando a ferramenta estiver pronta, diga ao Claude que vai colocá-la no portal. Ele percebe que é uma <b>ferramenta nova</b> e já entrega o que você vai preencher.</p>
  ${fala('Vou colocar no portal.')}
  <p>O Claude responde com o <b>nome</b>, a <b>descrição</b> (para que serve), os <b>papéis</b> (se houver), o <b>passo a passo do tutorial</b> e o arquivo <b>.html</b> final. Aí é só copiar:</p>
  ${passos([
    'No portal: <b>Configurações → Ferramentas → Nova ferramenta</b>. Cole o nome e a descrição, escolha o setor e o ícone e clique em <b>Cadastrar</b>.',
    'Envie o arquivo <b>.html</b>. A ferramenta fica <b>aguardando aprovação</b>: só a coordenação do setor e a administração do portal a veem, para testar.',
    'A administração do portal recebe o aviso, confere e clica em <b>Aprovar</b>.',
    'Em <b>Configurações → Acessos → Ferramentas</b>, libere quem vai usar (edita ou só consulta) e os papéis.',
    'Mande à administração do portal o passo a passo do tutorial: toda ferramenta tem vídeo.',
  ])}
  ${fig('gest-nova', 'Configurações → Ferramentas → Nova ferramenta: nome, setor, ícone e descrição.')}
  ${atencao('Nunca cole no Claude planilhas, listas de condomínios ou dados de pessoas. Os dados entram depois, pelo portal; os condomínios vêm sempre da Base de Clientes.')}
  `) +

  cap('Atualizar uma ferramenta', `
  <p class="intro">Toda versão nova vai para a <b>aprovação da administração do portal</b>, com um texto curto do que mudou. Você não precisa escrever esse texto: o Claude escreve.</p>
  ${passos([
    'Na conversa do Claude em que a ferramenta foi feita (ou numa nova, com o arquivo atual), peça a mudança e teste.',
    'Diga ao Claude: <i>"vou colocar no portal"</i>. Ele percebe que é uma <b>atualização</b> e entrega o arquivo .html e o texto <b>O que mudou nesta versão</b>.',
    'No portal: <b>Configurações → Ferramentas</b>, escolha a ferramenta e envie o arquivo novo.',
    'Cole o texto no campo <b>O que mudou nesta versão</b> e clique em <b>Enviar para aprovação</b>.',
    'A versão atual continua valendo até a aprovação. Você recebe o aviso no sino e por e-mail.',
  ])}
  ${fig('gest-descricao', 'Ao enviar o arquivo novo, o portal pede o que mudou. Sem esse texto, a versão não vai.', 74)}
  <div style="break-inside: avoid"><h2>Como fica o texto</h2>
  <p>Curto, uma linha por mudança, dizendo para quem muda. Sem detalhes técnicos.</p>
  ${cartoes([
    ['Assim', ['Nova aba Resultados com o total do mês por condomínio.', 'O botão Exportar agora gera Excel (antes era CSV).', 'Corrigido o filtro por data, que ignorava o último dia do mês.', 'Quem usa não precisa fazer nada diferente.'], 'sim'],
    ['Assim não', ['"Fiz várias melhorias na ferramenta, ajustei o layout, mexi no código do filtro e na função exportar() que estava com bug no loop, além de outras coisas que o pessoal tinha pedido na reunião da semana passada."'], 'nao'],
  ])}</div>
  ${fig('gest-aprovacao', 'A administração do portal lê o que mudou, abre a prévia e aprova.', 74)}
  ${dica('Se a tela ou o jeito de usar mudou, o vídeo tutorial precisa ser regravado: avise a administração do portal junto com o envio.')}
  `) +

  cap('Antes de enviar: confira', `
  ${tabela(['', 'Confira'], [
    ['☐', 'A tela parece parte do portal: sem cabeçalho próprio, com as cores e fontes do padrão.'],
    ['☐', 'Não há aba "Acessos", senha nem lista de nomes dentro da ferramenta.'],
    ['☐', 'Não há dados reais no arquivo (nomes, CNPJs, valores, listas de condomínios).'],
    ['☐', 'Funciona no celular, e quem só consulta não consegue alterar nada.'],
    ['☐', 'Os papéis (se houver) estão anotados para a administração cadastrar.'],
    ['☐', 'Você disse ao Claude <i>"vou colocar no portal"</i> e tem o texto pronto para colar (descrição ou o que mudou).'],
  ])}
  ${dica('Dúvida sobre acessos, papéis ou aprovação: fale com a administração do portal. Detalhes técnicos estão no guia <b>Padrão de ferramentas em HTML</b>.')}
  `);
}

function documento(corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(TITULO)}</title>
<link rel="stylesheet" href="fontes/fontes.css">
<style>${CSS}</style></head><body>${corpo}</body></html>`;
}

function playwright() {
  try { return require('playwright'); } catch { return require(execSync('npm root -g').toString().trim() + '/playwright'); }
}

async function gerar() {
  const { chromium } = playwright();
  const br = await chromium.launch();
  const page = await br.newPage();
  const htmlPath = path.join(FONTE, '_Guia-Gestoras.html');
  fs.writeFileSync(htmlPath, documento(guia()));
  try {
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const fontes = await page.evaluate(() => ['700 12px "Quicksand"', '400 12px "Nunito Sans"'].map((f) => document.fonts.check(f)));
    if (fontes.includes(false)) console.warn('Atenção: as fontes (fonte/fontes) não carregaram; o PDF sai com a fonte de reserva.');
    const logo = 'data:image/png;base64,' + fs.readFileSync(LOGO).toString('base64');
    const destino = path.join(SAIDA, 'Guia-Gestoras-Ferramentas.pdf');
    await page.pdf({
      path: destino, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-family:Arial,sans-serif;font-size:7.5pt;color:#9db3bc;padding:0 16mm;display:flex;justify-content:space-between;align-items:center">
        <span style="display:flex;align-items:center;gap:6px"><img src="${logo}" style="height:9px">Portal MyBlue · ${esc(TITULO)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
    console.log('ok', path.relative(process.cwd(), destino));
  } finally {
    fs.unlinkSync(htmlPath);
    await br.close();
  }
}

if (require.main === module) gerar().catch((e) => { console.error(e); process.exit(1); });
module.exports = { guia };

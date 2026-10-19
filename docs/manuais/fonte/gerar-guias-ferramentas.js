'use strict';
/*
 * Gera os dois guias de criação de ferramentas:
 *   - Padrao-Ferramentas-HTML.pdf: o padrão para quem cria ferramentas em HTML (texto para as instruções do projeto
 *     do Claude, regras, publicação no portal e checklist da administração);
 *   - Novas-Ferramentas-no-Portal.pdf: a proposta de construir as próximas ferramentas dentro do código do portal,
 *     com GitHub e aprovação da administração pelo pull request.
 *
 *   node docs/manuais/fonte/gerar-guias-ferramentas.js [html] [portal]
 */
const path = require('path');
const { documento, passos, dica, atencao, caixa, tabela, capVersoes, pdfTimbrado, playwright } = require('./padrao');

const ok = caixa('ok', 'Pronto');
const pre = (t) => `<pre>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;

const CSS_GUIA = `
pre { background: #10313b; color: #e6f4f8; border-radius: 2mm; padding: 3mm 4mm; font-family: "Liberation Mono", Consolas, monospace; font-size: 7.9pt; line-height: 1.45; white-space: pre-wrap; margin: 2mm 0 4mm; }
code { font-family: "Liberation Mono", Consolas, monospace; font-size: 9pt; background: var(--azul-bg); padding: .2mm 1.2mm; border-radius: 1mm; }
.quem { display: inline-block; font-size: 8.4pt; font-weight: 700; letter-spacing: .3mm; text-transform: uppercase; color: #fff; background: var(--escuro); border-radius: 99px; padding: .6mm 3mm; margin-bottom: 3mm; }
.check li { list-style: none; position: relative; padding-left: 6mm; }
.check li::before { content: "☐"; position: absolute; left: 0; color: var(--azul); font-weight: 700; }
.intro { font-size: 11pt; }
.fluxo { display: flex; flex-wrap: wrap; align-items: stretch; gap: 1.6mm; margin: 2mm 0 4mm; break-inside: avoid; }
.fluxo .p { flex: 1 1 0; min-width: 24mm; border: 1px solid var(--borda); border-top: 1.2mm solid var(--azul); background: #fff; padding: 2mm 2.4mm; font-size: 8.8pt; }
.fluxo .p .t { display: block; color: var(--escuro); font-weight: 700; font-size: 9.2pt; margin-bottom: .8mm; }
.fluxo .s { align-self: center; color: var(--azul); font-weight: 700; }
`;
const fluxo = (etapas) => `<div class="fluxo">${etapas.map(([t, d]) => `<div class="p"><span class="t">${t}</span>${d}</div>`).join('<div class="s">›</div>')}</div>`;

/* ======================================================================================
   1. Padrão de ferramentas em HTML
   ====================================================================================== */
const INSTRUCOES = `PADRÃO DE FERRAMENTAS DO PORTAL MYBLUE
Toda ferramenta criada aqui vai rodar dentro do Portal MyBlue. Siga estas regras sempre.

ARQUIVO
- Entregue um único arquivo .html, completo, com <title> igual ao nome da ferramenta.
- Bibliotecas só de cdnjs.cloudflare.com, cdn.jsdelivr.net ou unpkg.com, sempre com a versão
  fixa (ex.: xlsx@0.18.5). Nada de outros sites.
- Sem senha própria, tela de login ou criptografia do arquivo: quem entra é decidido pelo portal.
- Nenhum dado real dentro do arquivo: nada de listas de pessoas, condomínios, valores ou
  salários embutidos no código. Os dados vêm do portal.

ONDE GUARDAR OS DADOS
- Use o banco do portal por window.claude.use('db') (coleções e documentos, com atualização
  em tempo real para várias pessoas). Se a ferramenta for simples, pode usar localStorage:
  o portal guarda no banco.
- Nunca use planilha Google, Apps Script, IndexedDB, outro servidor ou banco externo.

CONDOMÍNIOS
- Não crie lista própria de condomínios. Leia da Carteira do portal:
    const r = await fetch('/api/carteira'); const { condominios } = await r.json();
  Cada item tem: id, codigo (ID Vouch), nome, razao_social, cnpj, comarca (UF), situacao,
  analista_cobranca, analista_extrajudicial, assistente_credito, administradora, executivo,
  inicio_contrato.

QUEM USA E O QUE CADA UM FAZ
- Não crie aba "Acessos", lista de nomes nem cadastro de usuários. O portal entrega quem está
  usando:
    const P = window.__MYBLUE__ || {};
    const eu = P.usuario || {};   // { id, nome, email, admin, papeis: [...], somente_leitura }
    const pode = (papel) => !P.usuario || (eu.papeis || []).includes(papel);
- Se a ferramenta separa funções, use papéis com identificadores simples (ex.: 'gestao',
  'aprovacao', 'financeiro') e liste-os no fim da resposta: a administração cadastra no portal
  com o mesmo identificador.
- Se eu.somente_leitura for verdadeiro, esconda ou desative todos os botões que gravam.
- Fora do portal (sem window.__MYBLUE__), a ferramenta funciona com tudo liberado e dados de
  exemplo inventados, só para teste.

ELA RODA ISOLADA (sandbox)
- Não use window.parent, window.top, cookies, IndexedDB nem Web Worker carregado de um endereço.
- Fale com o portal só por fetch em endereços que começam com /api/ (o portal cuida da
  autorização).
- Baixar arquivos (Blob + link de download), imprimir, abrir nova aba e copiar funcionam
  normalmente.

QUALIDADE
- Textos em português, claros, para quem não é técnico.
- Mostre um aviso quando algo não puder ser salvo (o portal recusa gravação de quem só consulta).
- Antes de gravar, confira campos obrigatórios e formatos (CNPJ, datas, valores).

AO ENTREGAR, ESCREVA TAMBÉM
1. O que a ferramenta grava e em quais coleções.
2. Os papéis (identificador e o que cada um faz), ou "sem papéis".
3. Um passo a passo curto, de 4 a 8 passos, para o vídeo tutorial (com dados fictícios).`;

const PEDIDO = `Crie a ferramenta Controle de Contratos, setor Jurídico.
Para que serve: acompanhar os contratos dos condomínios e avisar antes de vencer.
Quem usa e papéis: o Jurídico cadastra e edita; o papel Aprovação aprova contratos acima de
R$ 50 mil; os demais liberados só consultam.
Telas: lista com busca e filtros (situação, vencimento); ficha do contrato; aba
"Vencendo em 30 dias".
Dados de cada contrato: número, condomínio (da Carteira), parte contratada, valor, início,
fim, situação, observações.`;

const html = [];
const capH = (titulo, corpo, quem) => html.push({ cap: titulo, html: (quem ? `<span class="quem">${quem}</span>` : '') + corpo });

capH('Para que serve este guia', `
<p class="intro">As ferramentas dos setores continuam sendo feitas em <b>HTML</b>, com o Claude. Este guia garante que cada ferramenta nova
já nasça no padrão do Portal MyBlue: dados no banco do portal, acessos e papéis decididos pelo portal, funcionando <b>isolada</b> e
passando pela <b>aprovação da administração</b> antes de chegar às pessoas.</p>
${tabela(['Parte', 'O que tem', 'Para quem'], [
  ['Capítulo 2', 'O texto para colar nas <b>instruções do projeto</b> do Claude em que as ferramentas são criadas', 'Administração (uma vez)'],
  ['Capítulo 3', 'Como fazer o pedido de uma ferramenta nova', 'Quem cria ferramentas'],
  ['Capítulo 4', 'O porquê de cada regra', 'Quem cria ferramentas'],
  ['Capítulo 5', 'Como publicar no portal (ferramenta nova e versão nova)', 'Coordenação e administração'],
  ['Capítulo 6', 'O que conferir antes de aprovar', 'Administração'],
])}
${dica('Como as conversas da MyBlue com o Claude são feitas dentro de projetos, colocar o padrão nas <b>instruções do projeto</b> faz toda conversa nova segui-lo sozinha, sem ninguém precisar lembrar.')}
`);

capH('Texto para as instruções do projeto do Claude', `
<p>No projeto do Claude em que as ferramentas são criadas, abra <b>Instruções do projeto</b> e cole o texto abaixo inteiro. Quando o
portal mudar, a administração atualiza este texto (a versão em vigor fica neste guia).</p>
${pre(INSTRUCOES)}
`, 'Administração · uma vez');

capH('Como pedir uma ferramenta nova', `
<p>Com o padrão nas instruções do projeto, o pedido fica curto. Diga <b>o que a ferramenta faz</b>, <b>quem usa</b> (e se há papéis),
<b>as telas</b> e <b>os dados</b>. Exemplo:</p>
${pre(PEDIDO)}
<h2>O que a resposta precisa trazer</h2>
<ul>
  <li>O arquivo <b>.html</b> completo.</li>
  <li>O que a ferramenta grava e em quais coleções.</li>
  <li>Os <b>papéis</b> (identificador e função) ou "sem papéis".</li>
  <li>Um passo a passo de 4 a 8 passos para o <b>vídeo tutorial</b>.</li>
</ul>
<h2>Testar antes de mandar</h2>
${passos([
  'Abra o arquivo no navegador, fora do portal: ele deve funcionar com dados de exemplo inventados.',
  'Confira se não há nenhum dado real (nomes de pessoas, condomínios, valores) dentro do arquivo.',
  'Peça ajustes na mesma conversa até ficar como o setor precisa.',
])}
${atencao('Nunca cole no chat planilhas, listas de condomínios ou dados de pessoas para "alimentar" a ferramenta. Os dados entram depois, pelo portal.')}
`, 'Quem cria ferramentas');

capH('Por que cada regra existe', tabela(['Regra', 'Por quê'], [
  ['Um arquivo só, bibliotecas das CDNs conhecidas', 'O portal entrega o arquivo e copia as bibliotecas dessas CDNs para servir mesmo se a rede da empresa bloquear. Outros sites não passam por isso.'],
  ['Sem login, senha ou aba "Acessos"', 'Quem abre, se edita ou só consulta e o papel de cada um são definidos no portal (janela da ferramenta → <i>Quem abre e com qual papel</i>). Duas listas de acesso sempre ficam diferentes.'],
  ['Nenhum dado real no arquivo', 'O HTML é guardado em versões e pode ser baixado. Dado embutido fica desatualizado e se espalha.'],
  ['Dados por <code>claude.use(\'db\')</code> ou localStorage', 'O portal guarda tudo no banco, com backup, histórico de quem alterou e o mesmo dado para todos. Planilha Google e banco externo ficam fora do backup e dos acessos.'],
  ['Condomínios da Carteira', 'A Carteira é a fonte única: condomínio novo, distrato ou troca de responsável aparecem sozinhos em todas as ferramentas.'],
  ['Papéis com identificador', 'O portal entrega à ferramenta os papéis de quem está usando; a administração cadastra com o mesmo identificador e distribui às pessoas.'],
  ['Respeitar o "só consulta"', 'O portal recusa as gravações de quem só consulta; esconder os botões evita a pessoa achar que salvou.'],
  ['Funcionar isolada', 'Ferramenta nova já nasce <b>isolada</b>: roda separada do portal, sem a sessão de quem abre. Assim, um erro no HTML não consegue mexer em usuários, backup ou outras ferramentas. IndexedDB, <code>window.parent</code> e Web Worker por endereço não funcionam isolados.'],
  ['Passo a passo para o tutorial', 'Toda ferramenta tem vídeo tutorial no portal, gravado com dados fictícios.'],
]), 'Quem cria ferramentas');

capH('Publicar no portal', `
<h2>Ferramenta nova</h2>
${fluxo([
  ['1. Cadastrar', 'Coordenação do setor: <i>Gestão do setor → Ferramentas do setor → Nova ferramenta</i>, e envia o HTML.'],
  ['2. Aguardar', 'A ferramenta fica <b>aguardando aprovação</b> e já nasce <b>isolada</b>. Só a coordenação e a administração a veem.'],
  ['3. Aprovar', 'A administração recebe o aviso (sino e e-mail), abre, testa e clica em <b>Aprovar</b>.'],
  ['4. Liberar', 'Em <i>Quem abre e com qual papel</i>: quem abre, se edita ou só consulta e os papéis.'],
])}
<ul>
  <li>Quem criou a ferramenta e não é da coordenação do setor envia o arquivo para a coordenação ou para a administração cadastrar.</li>
  <li>Se a ferramenta tem papéis, a <b>administração</b> cadastra os papéis dela (mesmos identificadores da entrega). A coordenação distribui.</li>
  <li>O passo a passo da entrega vira o roteiro do vídeo tutorial.</li>
</ul>
<h2>Versão nova de uma ferramenta que já existe</h2>
${tabela(['A ferramenta é…', 'O HTML novo enviado pela coordenação…'], [
  ['<b>Isolada</b>', 'entra em uso na hora.'],
  ['<b>Não isolada</b> (ferramentas antigas)', 'fica <b>aguardando aprovação</b>: a versão atual continua em uso. Na janela da ferramenta, a administração usa <b>Ver prévia</b> (sempre isolada, com os dados reais) e depois <b>Aprovar e usar</b> ou <b>Recusar</b> (a versão é apagada e quem enviou é avisado).'],
])}
${dica('Toda versão fica guardada em <i>Versões anteriores</i>. A coordenação só volta a versões já aprovadas.')}
`, 'Coordenação e administração');

capH('Antes de aprovar: o que conferir', `
<ul class="check">
  <li>A ferramenta abre e funciona <b>isolada</b> (é como ela vai rodar).</li>
  <li>Não há dados reais dentro do arquivo (baixe a versão em <i>Versões anteriores</i> e procure nomes, CNPJs, valores).</li>
  <li>Os condomínios vêm da <b>Carteira</b>, não de uma lista própria.</li>
  <li>Nada é gravado em planilha Google, Apps Script ou outro site.</li>
  <li>Não há aba "Acessos", senha ou lista de nomes dentro da ferramenta.</li>
  <li>Quem só consulta não consegue gravar (teste com alguém liberado como "só consulta").</li>
  <li>Os <b>papéis</b> vieram listados e foram cadastrados no portal com os mesmos identificadores.</li>
  <li>Veio o passo a passo para o <b>vídeo tutorial</b>.</li>
</ul>
${atencao('Ferramenta antiga, ainda <b>não isolada</b>: o HTML roda com a sessão de quem abre. Antes de ligar o isolamento (<i>Módulos e dados → ferramenta → Isolamento</i>), abra e teste. Detalhes no documento de acessos do portal (<code>docs/acessos/LEIAME.md</code>).')}
`, 'Administração');

html.push(capVersoes({
  intro: 'Este guia acompanha as regras do portal. Quando o portal mudar o que as ferramentas podem usar, atualize o texto do capítulo 2 aqui e nas instruções do projeto do Claude.',
  como: ['Altere o texto em <code>docs/manuais/fonte/gerar-guias-ferramentas.js</code>.', 'Gere de novo: <code>node docs/manuais/fonte/gerar-guias-ferramentas.js html</code>.', 'Cole o novo texto do capítulo 2 nas instruções do projeto do Claude.'],
  historico: [['1.0', 'Outubro de 2026', 'Primeira versão: padrão, pedido, regras, publicação com aprovação e isolamento.']],
}));

/* ======================================================================================
   2. Novas ferramentas dentro do portal
   ====================================================================================== */
const PEDIDO_PORTAL = `/nova-ferramenta Controle de Contratos, setor Jurídico.
Para que serve: acompanhar os contratos dos condomínios e avisar antes de vencer.
Quem usa e papéis: o Jurídico cadastra e edita; o papel Aprovação aprova contratos acima de
R$ 50 mil; os demais liberados só consultam.
Telas: lista com busca e filtros (situação, vencimento); ficha do contrato com anexo em PDF;
aba "Vencendo em 30 dias".
Dados de cada contrato: número, condomínio (da Carteira), parte contratada, valor, início, fim,
situação, observações.
Avisos: no sino, 30 dias antes do vencimento, para quem tem o papel Aprovação.
Use só dados fictícios. Quando terminar, abra o PR para aprovação.`;

const portal = [];
const capP = (titulo, corpo, quem) => portal.push({ cap: titulo, html: (quem ? `<span class="quem">${quem}</span>` : '') + corpo });

capP('A proposta', `
<p class="intro">Hoje cada ferramenta é um arquivo HTML criado fora do portal e enviado pela tela <i>Módulos e dados</i>. A proposta é que as
<b>próximas</b> ferramentas sejam construídas <b>dentro do código do portal</b>, como um sistema é feito de fato, com a aprovação da
administração antes de qualquer publicação.</p>
${tabela(['Hoje (HTML enviado pelo portal)', 'Proposta (dentro do portal)'], [
  ['Código fora do repositório, sem revisão nem testes', 'Código no repositório, com revisão, testes automáticos e histórico'],
  ['Regras (papéis, quem aprova) dentro do HTML, no navegador', 'Regras conferidas no servidor'],
  ['Dados em "chaves" genéricas (imitando o navegador ou a planilha)', 'Tabelas próprias no banco, com campos definidos'],
  ['Cada ferramenta refaz telas, permissões e avisos', 'Telas, permissões, avisos e Carteira compartilhados'],
  ['Aprovação na tela <i>Módulos e dados</i>', 'Aprovação no <b>pull request</b> (PR) do GitHub, pela administração'],
])}
<p><b>A linguagem não está defasada:</b> o portal é feito em JavaScript (Node.js) com banco Postgres, tecnologias atuais e muito usadas.
O que muda é a forma de construir as ferramentas.</p>
${atencao('Esta é uma proposta. A estrutura para ferramentas dentro do código ainda precisa ser montada (capítulo 6). As ferramentas em HTML continuam funcionando, no padrão do guia <i>Padrão de ferramentas em HTML</i>.')}
`);

capP('Como funciona', `
${fluxo([
  ['1. Pedido', 'Quem cria abre uma sessão do <b>Claude Code</b> no repositório e descreve a ferramenta.'],
  ['2. Construção', 'O Claude Code cria uma <b>branch</b>, as tabelas, as rotas, a tela e os testes.'],
  ['3. PR', 'Abre o <b>pull request</b> com a descrição. Os testes rodam sozinhos no GitHub.'],
  ['4. Aprovação', 'A administração testa, revisa e <b>aprova</b>. Sem a aprovação, nada entra.'],
  ['5. Publicação', 'O PR entra na <code>main</code>, o Railway publica e, no portal, libera-se quem abre e com qual papel.'],
])}
<h2>O que garante a aprovação</h2>
<ul>
  <li>A <code>main</code> só aceita mudanças por PR, com a aprovação da administração e os testes verdes (regras do GitHub).</li>
  <li>O Railway publica só a <code>main</code>.</li>
  <li>Quem cria não consegue publicar sozinho, mesmo querendo.</li>
</ul>
`);

capP('Configuração, uma vez', `
${tabela(['Item', 'Quem faz', 'Como'], [
  ['Repositório <b>privado</b>', 'Administração', 'GitHub → Settings → General → Danger Zone → Change visibility'],
  ['Os criadores como colaboradores, cada um com conta no GitHub e acesso ao Claude Code', 'Administração', 'GitHub → Settings → Collaborators'],
  ['Proteção da <code>main</code>: exige PR, a aprovação da administração e o teste "Testes" verde', 'Administração', 'GitHub → Settings → Branches (ou Rules)'],
  ['Arquivo <code>CODEOWNERS</code> (administração como revisora obrigatória) e modelo de PR com checklist', 'Claude Code', 'Arquivos no repositório'],
  ['<b>Molde de ferramenta</b> no portal: onde ficam telas, tabelas, rotas, papéis e testes', 'Claude Code', 'Base no código, com uma ferramenta piloto'],
  ['Skill <code>/nova-ferramenta</code> com todas as regras (dados fictícios, papéis no servidor, tutorial)', 'Claude Code', 'Arquivo no repositório'],
  ['(Opcional) Ambiente de teste por PR, com banco de teste e dados fictícios', 'Administração', 'Railway → PR Environments'],
])}
${atencao('No plano gratuito do GitHub, a proteção da <code>main</code> só funciona em repositório público. Com o repositório privado, é provável que seja preciso um plano pago (GitHub Team, cobrado por usuário). Confira o preço atual antes de decidir.')}
`, 'Administração · uma vez');

capP('Como pedir uma ferramenta', `
<p>Com a skill pronta, quem cria abre o Claude Code no repositório e escreve o pedido. Exemplo:</p>
${pre(PEDIDO_PORTAL)}
<h2>O que o Claude Code faz</h2>
${passos([
  'Pergunta o que estiver faltando.',
  'Cria a branch, as tabelas, as rotas (com permissões e papéis conferidos no servidor), a tela e os testes.',
  'Roda os testes e abre o PR com a descrição: o que faz, papéis, tabelas e o que testar.',
])}
<p>Quem cria testa, pede ajustes na mesma conversa e, quando estiver pronto, marca a administração para revisar.</p>
`, 'Quem cria ferramentas');

capP('Revisar e aprovar', `
${passos([
  'O GitHub avisa que há um PR esperando a revisão da administração.',
  'Abra o endereço de teste do PR (se o ambiente do Railway estiver ligado) e use a ferramenta com os dados fictícios.',
  'Confira o checklist do PR: papéis definidos, nenhum dado real no código, testes verdes, tutorial previsto.',
  'Se quiser uma segunda opinião, peça numa sessão do Claude Code: "revise o PR #N" (ou use /code-review).',
  'Aprove e faça o merge. O Railway publica sozinho.',
  'No portal, em <i>Quem abre e com qual papel</i>, libere as pessoas.',
])}
${dica('Pedido de mudança numa ferramenta já publicada segue o mesmo caminho: nova sessão, novo PR, nova aprovação.')}
`, 'Administração');

capP('Por onde começar', `
${tabela(['Etapa', 'O quê', 'Quem'], [
  ['1', 'Repositório privado, criadores adicionados, proteção da <code>main</code>', 'Administração'],
  ['2', 'Molde de ferramenta no portal, skill <code>/nova-ferramenta</code>, <code>CODEOWNERS</code> e modelo de PR', 'Claude Code'],
  ['3', 'Piloto com uma ferramenta real (sugestão: Gestão de Viagens, que já precisa de um papel de aprovação, ou uma ferramenta nova pequena)', 'Um dos criadores, com a administração aprovando'],
  ['4', 'Ajustar o processo e virar regra para as novas', 'Administração'],
  ['5', 'Migrar as mais sensíveis, uma de cada vez (Gestão de Premiações e Comissões)', 'Criadores + administração'],
])}
<h2>Como convive com o que existe</h2>
<ul>
  <li>As ferramentas atuais em HTML continuam funcionando, com a aprovação na tela do portal que já existe.</li>
  <li>Isolar as antigas, uma a uma, depois de testar.</li>
  <li>Framework de interface (React, Vue) com TypeScript é opcional: faz sentido quando a primeira ferramenta nova entrar no código, não antes.</li>
</ul>
`);

portal.push(capVersoes({
  historico: [['1.0', 'Outubro de 2026', 'Primeira versão da proposta.']],
}));

async function gerar() {
  const quais = process.argv.slice(2);
  const todos = !quais.length;
  const { chromium } = playwright();
  const br = await chromium.launch();
  const page = await br.newPage();
  const saida = path.join(__dirname, '..');
  if (todos || quais.includes('html')) {
    const doc = documento({ chapeu: 'Guia · Ferramentas do portal', titulo: 'Padrão de ferramentas em HTML', sub: 'Como pedir, publicar e aprovar ferramentas no Portal MyBlue &nbsp;•&nbsp; MyBlue Condomínio Garantido',
      versao: '1.0', data: 'Outubro de 2026', fim: 'Guia', css: CSS_GUIA }, html);
    const destino = path.join(saida, 'Padrao-Ferramentas-HTML.pdf');
    await pdfTimbrado(page, doc, destino);
    console.log('ok', path.relative(process.cwd(), destino));
  }
  if (todos || quais.includes('portal')) {
    const doc = documento({ chapeu: 'Proposta · Ferramentas do portal', titulo: 'Novas ferramentas dentro do portal', sub: 'Código, GitHub e aprovação da administração &nbsp;•&nbsp; MyBlue Condomínio Garantido',
      versao: '1.0', data: 'Outubro de 2026', fim: 'documento', css: CSS_GUIA }, portal);
    const destino = path.join(saida, 'Novas-Ferramentas-no-Portal.pdf');
    await pdfTimbrado(page, doc, destino);
    console.log('ok', path.relative(process.cwd(), destino));
  }
  await br.close();
}

gerar().catch((e) => { console.error(e); process.exit(1); });

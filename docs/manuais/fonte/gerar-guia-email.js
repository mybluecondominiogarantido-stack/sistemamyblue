'use strict';
/*
 * Gera o guia para o TI configurar o e-mail dos avisos (Microsoft 365 / Graph).
 *   node docs/manuais/fonte/gerar-guia-email.js
 */
const fs = require('fs');
const path = require('path');
const { documento, passos, dica, atencao, tabela, pdfTimbrado, playwright } = require('./padrao');

const CAIXA = 'usrserv@myblue.com.br';
const APP = 'Portal MyBlue - avisos';

const pre = (linhas) => `<pre>${linhas}</pre>`;
const anotar = (rotulo, onde) => `<div class="campo-anotar"><b>${rotulo}</b><span>${onde}</span></div>`;
const est = [];
// capítulo no padrão dos manuais; "quem" vira a etiqueta de quem executa a etapa
const cap = (titulo, html, quem) => { est.push({ cap: titulo, html: (quem ? `<span class="quem">${quem}</span>` : '') + html }); return ''; };

cap('Resumo', `
<p class="intro">O Portal MyBlue (Central de Tickets) avisa por e-mail quando uma demanda é passada para alguém, quando chega um ticket novo para um setor e quando um ticket é resolvido ou reaberto. O envio é feito pela <b>API Microsoft Graph</b>, como a caixa <b>${CAIXA}</b>.</p>
${tabela(['Item', 'Definição'], [
  ['Caixa remetente', `<code>${CAIXA}</code>`],
  ['Autenticação', 'Aplicativo registrado no Entra ID, fluxo <i>client credentials</i> (segredo do cliente)'],
  ['Permissão', '<b>Application Mail.Send</b> concedida no <b>Exchange Online</b> (RBAC para aplicativos), com escopo <b>só na caixa remetente</b>'],
  ['O que o aplicativo NÃO pode', 'Ler e-mails, enviar como outras caixas, acessar arquivos, agenda ou usuários'],
  ['Onde fica o segredo', 'Somente nas variáveis do servidor do portal (Railway). Não fica no código.'],
  ['Por que não SMTP', 'O SMTP com usuário e senha (SMTP AUTH básico) passa a vir desligado por padrão no Exchange Online a partir do fim de 2026.'],
])}
<h2>Quem faz o quê</h2>
${tabela(['Parte', 'Quem', 'O quê'], [
  ['1 a 5', '<b>TI</b> (administrador do Microsoft 365)', 'Caixa, registro do aplicativo, segredo e permissão no Exchange'],
  ['6', '<b>TI</b> → responsável pelo portal', 'Entregar os 3 valores de forma segura'],
  ['7', 'Responsável pelo <b>Railway</b>', 'Cadastrar as variáveis no servidor do portal'],
  ['8', '<b>Administrador do portal</b>', 'Enviar o e-mail de teste'],
])}
<h2>Permissões necessárias para o TI</h2>
<ul>
  <li><b>Administrador do Exchange</b> (ou Global): criar a caixa compartilhada e rodar os comandos de RBAC.</li>
  <li><b>Administrador de Aplicativos</b> (ou Global) no Entra ID: registrar o aplicativo e criar o segredo.</li>
  <li>PowerShell com o módulo <code>ExchangeOnlineManagement</code> (versão 3 ou mais nova).</li>
</ul>
${atencao('<b>Não</b> conceda a permissão <code>Mail.Send</code> em “Permissões de API” do Entra ID. Concedida lá, ela vale para <b>todas</b> as caixas da empresa e se soma ao RBAC. A permissão é dada só pelo Exchange, no passo 5.')}
`) +

cap('Criar a caixa compartilhada', `
<p>A MyBlue já usa a caixa <b>${CAIXA}</b> para os avisos: pule esta parte. Ela só é necessária para trocar a caixa remetente.</p>
${passos([
  'Acesse o <b>Centro de administração do Exchange</b>: <code>admin.exchange.microsoft.com</code>.',
  'Vá em <b>Destinatários → Caixas de correio → Adicionar uma caixa de correio compartilhada</b>.',
  `Nome de exibição: <b>Portal MyBlue</b>. Endereço de e-mail: o novo endereço (ex.: <code>portal@myblue.com.br</code>). Clique em <b>Criar</b>.`,
  'Não é preciso adicionar membros. Opcional: ocultar da lista global de endereços.',
])}
${dica(`Com a caixa nova, use o novo endereço no lugar de <code>${CAIXA}</code> nos passos 5 e 7.`)}`, 'TI') +

cap('Registrar o aplicativo no Entra ID', `
${passos([
  'Acesse <code>entra.microsoft.com</code> → <b>Identidade → Aplicativos → Registros de aplicativo → Novo registro</b>.',
  `Nome: <b>${APP}</b>.`,
  'Tipos de conta com suporte: <b>Somente contas neste diretório organizacional</b> (locatário único).',
  'URI de redirecionamento: <b>deixe em branco</b>. Clique em <b>Registrar</b>.',
  'Na tela <b>Visão geral</b> do aplicativo, anote os dois IDs abaixo.',
])}
${anotar('ID do aplicativo (cliente)', 'Visão geral do registro → vai para M365_CLIENT_ID')}
${anotar('ID do diretório (locatário)', 'Visão geral do registro → vai para M365_TENANT_ID')}
${atencao('Em <b>Permissões de API</b>, não adicione nada. A permissão delegada <code>User.Read</code> que vem por padrão pode ficar ou ser removida; ela não é usada.')}`, 'TI', false) +

cap('Criar o segredo do cliente', `
${passos([
  'No aplicativo: <b>Certificados e segredos → Segredos do cliente → Novo segredo do cliente</b>.',
  'Descrição: <b>Servidor do portal (Railway)</b>. Expira em: <b>24 meses</b>. Clique em <b>Adicionar</b>.',
  'Copie a coluna <b>Valor</b> <u>na hora</u>: ela só aparece uma vez.',
])}
${anotar('Valor do segredo do cliente', 'Coluna “Valor” (não a coluna “ID do segredo”) → vai para M365_CLIENT_SECRET')}
${atencao('Anote na agenda do TI a <b>data de vencimento</b> do segredo. Quando vencer, os e-mails param. Para renovar: crie um segredo novo, atualize a variável no Railway e só depois apague o antigo.')}`, 'TI') +

cap('Pegar o ID do objeto do aplicativo empresarial', `
<p>O Exchange precisa do ID do <b>aplicativo empresarial</b> (a entidade de serviço), que é <b>diferente</b> do “ID do objeto” mostrado no registro do aplicativo.</p>
${passos([
  `No Entra ID: <b>Identidade → Aplicativos → Aplicativos empresariais</b>. Remova o filtro de tipo, se houver, e busque <b>${APP}</b>.`,
  'Abra e, em <b>Visão geral</b>, copie o <b>ID do objeto</b>.',
])}
${anotar('ID do objeto (aplicativo empresarial)', 'Usado só no comando New-ServicePrincipal do passo 5')}
${dica('Conferência: na mesma tela, o “ID do aplicativo” deve ser igual ao ID do aplicativo (cliente) anotado no passo 2.')}`, 'TI', false) +

cap('Liberar o envio só pela caixa remetente (Exchange)', `
<p>Rode no PowerShell, trocando <code>&lt;ID do aplicativo&gt;</code> e <code>&lt;ID do objeto&gt;</code> pelos valores anotados (mantenha as aspas). O acento grave <code>\`</code> no fim da linha continua o comando na linha de baixo.</p>
${pre(`<span class="c"># 1) Conectar (instale o módulo uma vez, se precisar)</span>
Install-Module ExchangeOnlineManagement -Scope CurrentUser
Connect-ExchangeOnline

<span class="c"># 2) Registrar o aplicativo no Exchange (ID do objeto = aplicativo empresarial, passo 4)</span>
New-ServicePrincipal -AppId "&lt;ID do aplicativo&gt;" \`
  -ObjectId "&lt;ID do objeto&gt;" \`
  -DisplayName "Portal MyBlue - avisos"

<span class="c"># 3) Escopo: só a caixa remetente</span>
New-ManagementScope -Name "Portal MyBlue - caixa de avisos" \`
  -RecipientRestrictionFilter "PrimarySmtpAddress -eq '${CAIXA}'"

<span class="c"># 4) Permissão de envio, limitada ao escopo acima</span>
New-ManagementRoleAssignment -App "&lt;ID do aplicativo&gt;" \`
  -Role "Application Mail.Send" \`
  -CustomResourceScope "Portal MyBlue - caixa de avisos"`)}
<h3>Conferir</h3>
${pre(`<span class="c"># Deve mostrar InScope = True para a caixa de avisos…</span>
Test-ServicePrincipalAuthorization -Identity "&lt;ID do aplicativo&gt;" \`
  -Resource ${CAIXA}

<span class="c"># …e InScope = False para qualquer outra caixa (confirma a restrição)</span>
Test-ServicePrincipalAuthorization -Identity "&lt;ID do aplicativo&gt;" \`
  -Resource alguem@myblue.com.br`)}
${atencao('O nome em <code>-CustomResourceScope</code> precisa ser <b>idêntico</b> ao <code>-Name</code> do escopo. A permissão pode levar de <b>30 minutos a 2 horas</b> para valer no envio real, mesmo com o teste já mostrando <i>True</i>.')}`, 'TI') +

cap('Entregar os valores ao responsável pelo portal', `
<p>Envie os três valores abaixo <b>por um canal seguro</b> (gerenciador de senhas ou mensagem que se apaga), <b>nunca</b> por e-mail comum ou planilha:</p>
${tabela(['Valor', 'Variável no servidor'], [
  ['ID do diretório (locatário)', '<code>M365_TENANT_ID</code>'],
  ['ID do aplicativo (cliente)', '<code>M365_CLIENT_ID</code>'],
  ['Valor do segredo do cliente', '<code>M365_CLIENT_SECRET</code>'],
])}
<p>Informe também o endereço da caixa remetente, se for diferente de <code>${CAIXA}</code>, e a <b>data de vencimento</b> do segredo.</p>`, 'TI', false) +

cap('Cadastrar as variáveis no Railway', `
${passos([
  'No Railway, abra o projeto do portal → serviço do portal → aba <b>Variables</b>.',
  'Adicione as variáveis abaixo (<b>New Variable</b>) e salve.',
  'O Railway pede para <b>aplicar as mudanças</b> (Deploy). Confirme: o portal reinicia em 1 a 3 minutos.',
])}
${tabela(['Variável', 'Valor'], [
  ['<code>M365_TENANT_ID</code>', 'ID do diretório (locatário)'],
  ['<code>M365_CLIENT_ID</code>', 'ID do aplicativo (cliente)'],
  ['<code>M365_CLIENT_SECRET</code>', 'Valor do segredo do cliente'],
  ['<code>EMAIL_REMETENTE</code>', `<code>Portal MyBlue &lt;${CAIXA}&gt;</code>`],
  ['<code>PORTAL_URL</code>', 'Endereço que abre o portal no navegador, copiado da barra de endereços (vai no link dos e-mails). Domínio próprio só depois de cadastrado no Railway e no DNS'],
])}
<p>Depois do reinício, os logs do serviço (aba <b>Deployments → View logs</b>) mostram:</p>
${pre(`[avisos] e-mail dos tickets: microsoft365 (${CAIXA})`)}
${dica('Se aparecer <code>[avisos] e-mail desligado: …</code>, falta alguma das três variáveis <code>M365_*</code> ou o nome está diferente.')}`, 'Responsável pelo Railway') +

cap('Testar pelo portal', `
${passos([
  'Entre no portal com um usuário <b>administrador</b>.',
  'Vá em <b>Administração → Equipes e tipos de demanda</b>.',
  `O quadro <b>Avisos por e-mail</b> deve dizer: “Enviando pelo Microsoft 365 como <b>${CAIXA}</b>”.`,
  'Clique em <b>Enviar e-mail de teste para mim</b> e confira a caixa de entrada (e o lixo eletrônico).',
])}
<p>Se der erro, a mensagem da Microsoft aparece na tela:</p>
${tabela(['Mensagem', 'Causa provável', 'O que fazer'], [
  ['<i>AADSTS7000215: Invalid client secret</i>', 'Foi copiado o “ID do segredo” em vez do “Valor”, ou o segredo venceu', 'Criar um segredo novo e atualizar <code>M365_CLIENT_SECRET</code>'],
  ['<i>AADSTS700016</i> ou <i>AADSTS90002</i>', 'ID do aplicativo ou do diretório errado', 'Conferir <code>M365_CLIENT_ID</code> e <code>M365_TENANT_ID</code>'],
  ['<i>403 … Access is denied / ErrorAccessDenied</i>', 'Permissão do passo 5 ainda não valeu, ou o escopo não pega a caixa', 'Esperar até 2 h; conferir com <code>Test-ServicePrincipalAuthorization</code>'],
  ['<i>404 … MailboxNotEnabledForRESTAPI</i> ou <i>ResourceNotFound</i>', 'A caixa de <code>EMAIL_REMETENTE</code> não existe no Exchange Online', 'Conferir o endereço da caixa compartilhada'],
  ['Quadro diz “Não configurado”', 'Variáveis ausentes ou com nome diferente', 'Conferir as variáveis no Railway e reiniciar'],
  ['E-mail cai no lixo eletrônico', 'Filtro de spam do destinatário', `Marcar <code>${CAIXA}</code> como remetente confiável ou criar regra de transporte`],
])}`, 'Administrador do portal') +

cap('Manutenção e segurança', `
<h2>Rotina</h2>
<ul>
  <li><b>Renovar o segredo</b> antes de vencer (a cada 24 meses): criar o novo, atualizar <code>M365_CLIENT_SECRET</code> no Railway, testar, apagar o antigo.</li>
  <li><b>Trocar a caixa remetente:</b> criar a nova caixa, ajustar o filtro do escopo (<code>Set-ManagementScope</code>) e a variável <code>EMAIL_REMETENTE</code>.</li>
</ul>
<h2>Revogar o acesso (se precisar)</h2>
${pre(`<span class="c"># Remove a permissão de envio do aplicativo</span>
Get-ManagementRoleAssignment -RoleAssignee "&lt;ID do aplicativo&gt;" |
  Remove-ManagementRoleAssignment
<span class="c"># Ou, no Entra ID: apagar o segredo do cliente (efeito imediato)</span>`)}
<h2>Resumo de segurança</h2>
${tabela(['Ponto', 'Como ficou'], [
  ['Privilégio mínimo', 'Só <b>envio</b> e só pela caixa de avisos. Sem leitura de e-mails nem acesso a outras caixas.'],
  ['Credenciais', 'Nenhuma senha de usuário. Segredo do aplicativo guardado apenas nas variáveis do servidor.'],
  ['Rastreabilidade', 'Os e-mails saem pela caixa compartilhada; o portal registra no histórico o envio de teste.'],
  ['Revogação', 'Apagar o segredo ou a atribuição de papel corta o envio na hora.'],
])}
<p style="font-size:9pt;color:var(--suave)">Referências: Microsoft Learn, “Role Based Access Control for Applications in Exchange Online” e “Limiting application permissions to specific Exchange Online mailboxes” (graph/auth-limit-mailbox-access).</p>`);

const CSS_GUIA = `
pre { background: #10313b; color: #e6f4f8; border-radius: 2mm; padding: 3mm 4mm; font-family: "Liberation Mono", Consolas, monospace; font-size: 8.4pt; line-height: 1.5; white-space: pre-wrap; margin: 2mm 0 4mm; break-inside: avoid; }
pre .c { color: #8fb4c0; }
code { font-family: "Liberation Mono", Consolas, monospace; font-size: 9pt; background: var(--azul-bg); padding: .2mm 1.2mm; border-radius: 1mm; }
.quem { display: inline-block; font-size: 8.4pt; font-weight: 700; letter-spacing: .3mm; text-transform: uppercase; color: #fff; background: var(--escuro); border-radius: 99px; padding: .6mm 3mm; margin-bottom: 3mm; }
.campo-anotar { border: 1.4px dashed var(--borda); border-radius: 2mm; padding: 2.4mm 3.4mm; margin: 1.5mm 0; display: flex; justify-content: space-between; gap: 4mm; break-inside: avoid; }
.campo-anotar b { white-space: nowrap; } .campo-anotar span { color: var(--suave); font-size: 9pt; }
.intro { font-size: 11pt; }
`;

async function gerar() {
  const html = documento({ chapeu: 'Guia de configuração · TI', titulo: 'E-mail dos avisos do Portal MyBlue', sub: 'Microsoft 365 (Exchange Online) com Microsoft Graph &nbsp;•&nbsp; MyBlue Condomínio Garantido',
    versao: '1.2', data: 'Outubro de 2026', fim: 'Guia', css: CSS_GUIA }, est);
  const { chromium } = playwright();
  const br = await chromium.launch();
  const page = await br.newPage();
  const destino = path.join(__dirname, '..', 'Guia-TI-Email-Microsoft365.pdf');
  await pdfTimbrado(page, html, destino);
  await br.close();
  console.log('ok', path.relative(process.cwd(), destino));
}

gerar().catch((e) => { console.error(e); process.exit(1); });

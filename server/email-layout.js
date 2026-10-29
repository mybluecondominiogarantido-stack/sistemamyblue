'use strict';
/*
 * Layout dos e-mails de aviso do portal (modelo aprovado em out/2026).
 *
 * montarHtml(aviso, opcoes) → { subject, html, text, inline }  (inline: imagens embutidas, hoje só a logo)
 *  aviso: { tipo, titulo, texto, link, detalhes? }
 *  opcoes: { portalUrl, destinatario: { nome } }
 *
 * Sem "detalhes", o e-mail sai do próprio aviso (título, texto e link): a etiqueta, a cor, o botão e as listas
 * são deduzidos do tipo e do texto. Quem quiser um e-mail mais rico passa "detalhes" no notificar():
 *  {
 *    assunto,              assunto do e-mail (padrão: título do aviso)
 *    tom,                  'acao' | 'info' | 'ok' | 'alerta'
 *    etiqueta,             texto da etiqueta no topo (ex.: 'Aguardando sua aprovação')
 *    titulo, intro,        título grande e parágrafo de abertura
 *    destaque,             faixa grande no meio (ex.: 'APROVADA COM RESSALVAS')
 *    lista: [],            itens numerados (pendências, documentos, nomes)
 *    linhas: [[rótulo, valor]],  quadro de detalhes
 *    aviso: { titulo, texto, tom },  caixa com borda colorida
 *    anexo,                nome do arquivo que está no portal
 *    nota,                 observação curta abaixo
 *    botao,                texto do botão (padrão deduzido do tipo)
 *    motivo,               fim da frase "Você recebeu este e-mail porque …"
 *    assinatura            linha de assinatura (ex.: 'Setor de Análise de Crédito — MyBlue')
 *  }
 * Nos textos, **trecho** sai em negrito.
 */

/* logo dos e-mails: public/img/logo-email.png (300×88, fundo branco), enviada como anexo interno */
const LOGO = { cid: 'logo-myblue', nome: 'logo-myblue.png', tipo: 'image/png', arquivo: require('path').join(__dirname, '..', 'public', 'img', 'logo-email.png') };

const TONS = {
  acao: { bg: '#FFF4E0', fg: '#9A5B00', borda: '#E0A100', etiqueta: 'Ação necessária' },
  info: { bg: '#E6F1FA', fg: '#1B5E8C', borda: '#2C7FB8', etiqueta: 'Para seu conhecimento' },
  ok: { bg: '#E3F5EA', fg: '#1E7A45', borda: '#2E9E5B', etiqueta: 'Concluído' },
  alerta: { bg: '#FDECEC', fg: '#B42318', borda: '#D64545', etiqueta: 'Atenção' },
};

/* primeira regra que casar com "tipo título" decide tom, etiqueta e botão */
const REGRAS = [
  [/^versao_aguardando/, 'acao', 'Aguardando sua aprovação', 'Ver prévia e aprovar'],
  [/^ferramenta_nova/, 'acao', 'Aguardando sua aprovação', 'Revisar e liberar'],
  [/^versao_aprovada/, 'ok', 'Versão aprovada', 'Abrir a ferramenta'],
  [/^ferramenta_aprovada/, 'ok', 'Ferramenta liberada', 'Abrir a ferramenta'],
  [/^versao_recusada/, 'alerta', 'Versão não aprovada', 'Ver no portal'],
  [/atrasad|passou do prazo|prazo vencido|sem ninguém designado|devolvid|recusad|não aprovad/i, 'alerta', null, 'Ver no portal'],
  [/pendência respondida/i, 'info', 'Pendência respondida', 'Retomar análise'],
  [/pendência|pendente|falta/i, 'acao', 'Pendência para você', 'Resolver pendência'],
  [/designad[ao] para você/i, 'acao', 'Designada para você', 'Abrir no portal'],
  [/chancela|decisão|diretoria aprov/i, null, null, null],
  [/minuta.*pronta/i, 'acao', 'Leve ao síndico', 'Abrir minuta'],
  [/solicite a implantação/i, 'acao', 'Próximo passo', 'Solicitar implantação'],
  [/ficha de repasse/i, 'acao', 'Preencher ficha', 'Preencher ficha'],
  [/^comissao .*(envie|pediu)/i, 'acao', 'Envio pendente', 'Enviar planilha'],
  [/^comissao .*demonstrativo.*(disponível|atualizado)/i, 'acao', 'Confirme a leitura', 'Ver meu demonstrativo'],
  [/^comissao .*enviou/i, 'info', 'Planilha recebida', 'Importar e conferir'],
  [/retorno de análise/i, 'ok', 'Análise concluída', 'Ver retorno completo'],
  [/aprovad|assinad|concluíd|liberad/i, 'ok', null, 'Ver no portal'],
  [/nova|novo|chegou|solicitou|aguardando|envie/i, 'acao', null, 'Abrir no portal'],
];
/* chancela/decisão: "aprovou" é concluído, o pedido é ação */
function classificar(tipo, titulo) {
  const chave = `${tipo || ''} ${titulo || ''}`;
  for (const [re, tom, etiqueta, botao] of REGRAS) {
    if (!re.test(chave)) continue;
    if (!tom) return /aprov/i.test(titulo) ? { tom: 'ok', etiqueta: 'Diretoria aprovou', botao: 'Ver no portal' } : { tom: 'acao', etiqueta: 'Decisão da diretoria', botao: 'Decidir no portal' };
    return { tom, etiqueta: etiqueta || TONS[tom].etiqueta, botao: botao || 'Abrir no portal' };
  }
  return { tom: 'info', etiqueta: TONS.info.etiqueta, botao: 'Abrir no portal' };
}

const MOTIVOS = {
  versao_aguardando: 'você aprova ferramentas em Módulos e dados',
  ferramenta_nova: 'você aprova ferramentas em Módulos e dados',
  versao_aprovada: 'você enviou esta versão',
  versao_recusada: 'você enviou esta versão',
  ferramenta_aprovada: 'você cadastrou ou gere esta ferramenta',
  credito: 'você participa desta análise de crédito',
  contrato: 'você participa deste contrato',
  implantacao: 'você participa desta implantação',
  comissao: 'você participa da premiação mensal',
  espolio: 'você participa desta análise de espólio',
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* escapa e depois transforma **trecho** em negrito */
const rico = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b style="color:#12303A">$1</b>');
const semMarca = (s) => String(s == null ? '' : s).replace(/\*\*(.+?)\*\*/g, '$1');

/*
 * Separa a lista do texto quando ele traz itens:
 *  - linhas numeradas ("1. …\n2. …")
 *  - "Ainda falta enviar: A; B; C. Resto." (dois ou mais itens separados por ";")
 */
function separarLista(texto) {
  const t = String(texto || '').trim();
  const linhas = t.split(/\n+/);
  const num = linhas.filter((l) => /^\s*\d+[.)]\s+/.test(l));
  if (num.length) {
    const ini = linhas.findIndex((l) => /^\s*\d+[.)]\s+/.test(l));
    const fim = linhas.length - 1 - [...linhas].reverse().findIndex((l) => /^\s*\d+[.)]\s+/.test(l));
    return {
      intro: linhas.slice(0, ini).join(' ').trim(),
      lista: linhas.slice(ini, fim + 1).filter((l) => /^\s*\d+[.)]\s+/.test(l)).map((l) => l.replace(/^\s*\d+[.)]\s+/, '').trim()),
      resto: linhas.slice(fim + 1).join(' ').trim(),
    };
  }
  const m = /^(.*?):\s+([^:]*?;[^:]*?)(?:\.\s+(.*)|\.?\s*)$/s.exec(t.replace(/\s*\n+\s*/g, ' '));
  if (m) {
    const itens = m[2].split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean);
    if (itens.length >= 2) return { intro: `${m[1].trim()}:`, lista: itens, resto: (m[3] || '').trim() };
  }
  return { intro: t.replace(/\s*\n+\s*/g, ' '), lista: [], resto: '' };
}

function montarHtml(n, op = {}) {
  const d = n.detalhes || {};
  const base = classificar(n.tipo, n.titulo);
  const tom = TONS[d.tom] ? d.tom : base.tom;
  const t = TONS[tom];
  const portal = String(op.portalUrl || '').replace(/\/+$/, '');
  const link = n.link ? (/^https?:\/\//.test(n.link) ? n.link : portal ? `${portal}/${String(n.link).replace(/^\/+/, '')}` : null) : portal || null;

  const partes = String(n.titulo || '').split(' · ');
  const titulo = d.titulo || partes[0];
  const referencia = d.titulo ? '' : partes.slice(1).join(' · ');
  const sep = d.intro || d.lista ? { intro: d.intro || '', lista: d.lista || [], resto: '' } : separarLista(n.texto);
  const nota = [sep.resto, d.nota].filter(Boolean).join(' ');
  const botao = d.botao || base.botao;
  const motivo = d.motivo || MOTIVOS[n.tipo] || 'você usa o Portal MyBlue';
  const nome = op.destinatario && op.destinatario.nome ? String(op.destinatario.nome).trim().split(/\s+/)[0] : '';

  const linhas = (d.linhas || []).filter((l) => l && l[1] != null && l[1] !== '');
  const bloco = [];
  if (d.destaque) bloco.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr><td align="center" style="padding:14px 18px;border-radius:10px;background:${t.bg};color:${t.fg};font-size:16px;font-weight:800;letter-spacing:.5px;">${esc(d.destaque)}</td></tr></table>`);
  if (sep.lista.length) bloco.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">${sep.lista.map((l, i) => `<tr><td width="30" valign="top" style="padding:5px 0;"><div style="width:20px;height:20px;border-radius:10px;background:${t.bg};color:${t.fg};font-size:11px;font-weight:700;text-align:center;line-height:20px;">${i + 1}</div></td><td style="padding:5px 0;font-size:14px;line-height:21px;color:#12303A;">${rico(l)}</td></tr>`).join('')}</table>`);
  if (linhas.length) bloco.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F9FB;border:1px solid #E1EAEE;border-radius:10px;margin:0 0 20px 0;"><tr><td style="padding:10px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:20px;">${linhas.map((l, i) => { const b = i ? 'border-top:1px solid #E1EAEE;' : ''; return `<tr><td width="150" valign="top" style="padding:7px 0;color:#7A8E97;${b}">${esc(l[0])}</td><td style="padding:7px 0;color:#12303A;${i ? '' : 'font-weight:600;'}${b}">${rico(l[1])}</td></tr>`; }).join('')}</table></td></tr></table>`);
  if (d.aviso && d.aviso.texto) {
    const a = TONS[d.aviso.tom] || t;
    bloco.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr><td style="padding:14px 16px;border-left:4px solid ${a.borda};background:${a.bg};">${d.aviso.titulo ? `<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:${a.fg};margin-bottom:4px;">${esc(d.aviso.titulo)}</div>` : ''}<div style="font-size:14px;line-height:21px;color:#12303A;">${rico(d.aviso.texto)}</div></td></tr></table>`);
  }
  if (d.anexo) bloco.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr><td style="padding:10px 14px;border:1px solid #E1EAEE;border-radius:8px;font-size:13px;color:#12303A;"><span style="background:#D64545;color:#ffffff;font-size:10px;font-weight:800;padding:3px 6px;border-radius:4px;">PDF</span>&nbsp;&nbsp;${esc(d.anexo)}</td></tr></table>`);
  if (d.pre) bloco.push(`<div style="margin:0 0 20px 0;padding:14px 16px;background:#F5F9FB;border:1px solid #E1EAEE;border-radius:10px;font-size:14px;line-height:21px;color:#3C5660;white-space:pre-wrap;">${esc(d.pre)}</div>`);
  if (nota) bloco.push(`<p style="margin:0 0 20px 0;font-size:13px;line-height:20px;color:#4A616B;">&#9432; ${rico(nota)}</p>`);

  // a logo vai embutida no e-mail (anexo interno "cid"): o Outlook bloqueia imagem de endereço externo e mostraria só o texto
  const logo = `<img src="cid:${LOGO.cid}" width="150" height="44" alt="MyBlue" style="display:block;width:150px;height:44px;border:0;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;color:#1597A8;">`;
  const btn = link ? `
   <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 12px 0;"><tr><td align="center" bgcolor="#1597A8" style="border-radius:8px;background:#1597A8;">
    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(link)}" style="height:46px;v-text-anchor:middle;width:260px;" arcsize="18%" stroke="f" fillcolor="#1597A8"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${esc(botao)}</center></v:roundrect><![endif]-->
    <!--[if !mso]><!--><a href="${esc(link)}" style="display:inline-block;padding:13px 30px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(botao)} &rarr;</a><!--<![endif]-->
   </td></tr></table>
   <p style="margin:0 0 6px 0;font-size:12px;line-height:18px;color:#8A9CA4;">Se o botão não funcionar, acesse: <a href="${esc(link)}" style="color:#1597A8;word-break:break-all;">${esc(link)}</a></p>` : '';

  const intro = [nome && !/^(olá|oi|prezad)/i.test(sep.intro) ? `Olá, ${nome}.` : '', sep.intro].filter(Boolean).join(' ');
  const html = `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${esc(d.assunto || n.titulo)}</title>
<!--[if mso]><style>table,td,div,p,a,span{font-family:Arial,sans-serif !important;}</style><![endif]-->
<style>@media (max-width:620px){.mb-c{width:100% !important;}.mb-p{padding-left:22px !important;padding-right:22px !important;}}</style></head>
<body style="margin:0;padding:0;background:#EEF3F6;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#EEF3F6;">${esc(semMarca(n.texto || '').replace(/\s+/g, ' ').slice(0, 140))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF3F6;"><tr><td align="center" style="padding:28px 10px;">
 <table role="presentation" class="mb-c" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border:1px solid #DCE5EA;border-radius:12px;font-family:'Segoe UI',Arial,sans-serif;">
  <tr><td style="height:6px;line-height:6px;font-size:0;background:#0E5A6B;border-radius:12px 12px 0 0;">&nbsp;</td></tr>
  <tr><td class="mb-p" style="padding:26px 40px 6px 40px;">${logo}</td></tr>
  <tr><td class="mb-p" style="padding:18px 40px 8px 40px;">
   <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${t.bg};color:${t.fg};font-size:12px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:6px 12px;border-radius:999px;">&#9679; ${esc(d.etiqueta || base.etiqueta)}</td></tr></table>
   <h1 style="margin:16px 0 ${referencia ? '4px' : '10px'} 0;font-size:22px;line-height:30px;color:#12303A;font-weight:700;">${esc(titulo)}</h1>
   ${referencia ? `<p style="margin:0 0 12px 0;font-size:13px;line-height:19px;color:#7A8E97;">${esc(referencia)}</p>` : ''}
   ${intro ? `<p style="margin:0 0 22px 0;font-size:15px;line-height:24px;color:#4A616B;">${rico(intro)}</p>` : ''}
   ${bloco.join('\n   ')}
   ${btn}
   ${d.assinatura ? `<p style="margin:20px 0 0 0;font-size:13px;line-height:20px;color:#4A616B;">Atenciosamente,<br><b style="color:#12303A;">${esc(d.assinatura)}</b></p>` : ''}
   <div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>
  </td></tr>
  <tr><td class="mb-p" style="padding:18px 40px 22px 40px;background:#F5F9FB;border-top:1px solid #E1EAEE;border-radius:0 0 12px 12px;">
   <p style="margin:0 0 4px 0;font-size:13px;color:#12303A;font-weight:600;">Portal MyBlue</p>
   <p style="margin:0;font-size:12px;line-height:18px;color:#8A9CA4;">Mensagem automática da MyBlue Garantidora · Fortaleza/CE.<br>Você recebeu este e-mail porque ${esc(motivo)}. Não responda esta mensagem.</p>
  </td></tr>
 </table>
</td></tr></table>
</body></html>`;

  const text = [
    semMarca(titulo) + (referencia ? ` · ${referencia}` : ''), '',
    semMarca(intro),
    ...sep.lista.map((l, i) => `${i + 1}. ${semMarca(l)}`),
    ...linhas.map((l) => `${l[0]}: ${semMarca(l[1])}`),
    d.destaque ? `\n${d.destaque}` : null,
    d.aviso && d.aviso.texto ? `\n${d.aviso.titulo ? d.aviso.titulo + ': ' : ''}${semMarca(d.aviso.texto)}` : null,
    d.pre || null,
    nota ? semMarca(nota) : null,
    link ? `\n${botao}: ${link}` : null,
    d.assinatura ? `\n${d.assinatura}` : null,
    '\n— Portal MyBlue (mensagem automática, não responda)',
  ].filter((x) => x !== null && x !== '').join('\n');

  return { subject: d.assunto || n.titulo, html, text, inline: [LOGO] };
}

module.exports = { montarHtml, classificar, separarLista, LOGO };

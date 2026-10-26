'use strict';
/*
 * Captura as telas do Guia de Preenchimento do Comercial (Análise de Crédito, Solicitação de Contrato e Implantação),
 * com dados fictícios: sobe um portal próprio (o mesmo dos tutoriais), monta o cenário e tira as fotos como a executiva.
 *
 *   NODE_PATH=$(npm root -g) node docs/manuais/fonte/capturar-comercial.js <pasta-de-saída>
 *
 * Depois converta para JPEG em fonte/img (ex.: convert x.png -resize '1800x>' -quality 82 -interlace Plane x.jpg)
 * e gere o PDF com node docs/manuais/fonte/gerar-guia-comercial.js.
 */
const fs = require('fs');
const path = require('path');
const { subirPortal } = require('../../tutoriais/fonte/gravador');
const { montarCenario } = require('../../tutoriais/fonte/cenario');
const { ajudantes: J } = require('../../tutoriais/fonte/roteiros');
const { playwright } = require('./padrao');

const OUT = process.argv[2];
const PORTA = Number(process.env.PORTA) || 3990;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const portal = await subirPortal(PORTA);
  const base = portal.base;
  const erros = [];
  try {
    await montarCenario(base, {});
    const vera = await J.sessaoCr(base, 'vera@myblue.com.br');
    // análises: uma liberada (para o retorno e o contrato) e outra só enviada
    const anRetorno = await J.analiseCr(base, { ...J.FORM_CR, razao_social: 'Edifício Mirante do Sol', cidade: 'Caucaia' }, { liberar: true });
    await J.analiseCr(base, { ...J.FORM_CR, razao_social: 'Condomínio Parque das Flores' }, { liberar: true });
    await J.analiseCr(base, { ...J.FORM_CR, razao_social: 'Residencial Alto da Serra' });
    // contrato em rascunho (o formulário), um com a minuta enviada e os concluídos
    const anCt = await J.analiseCr(base, { ...J.FORM_CR, razao_social: 'Residencial Bosque Azul' }, { liberar: true });
    const { id: ctRascunho } = await vera('POST', '/api/contratos', { origem: 'analise', analise_id: anCt });
    await vera('PATCH', `/api/contratos/${ctRascunho}`, { formulario: { ...J.FORM_CT, nome: 'Residencial Bosque Azul', pedidos: ['pontualidade_adiar', 'foro_capital'],
      pedidos_detalhe: { pontualidade_adiar: 'para a próxima assembleia ordinária', foro_capital: 'Fortaleza/CE' } } });
    const ctMinuta = await J.contratoTut(base, 'Residencial Vila das Palmeiras', { ate: 'minuta' });
    await J.contratoTut(base, 'Condomínio Residencial Jardim das Acácias', { ate: 'concluido' });
    const ctImp = await J.contratoTut(base, 'Edifício Brisa do Mar', { ate: 'concluido' });
    const { implantacao: impRascunho } = await vera('POST', `/api/contratos/${ctImp}/implantacao`, {});
    await J.implantacaoTut(base, 'Residencial Recanto Verde');
    await J.implantacaoForaTut(base, 'Residencial Vila Serena', 'AC-2025-0412');
    const fora = await vera('POST', '/api/implantacoes/pdf?acao=criar', await J.retornoTut('AC-2025-0533', 'Condomínio Solar do Lago'), { 'content-type': 'application/pdf', 'x-nome-arquivo': 'Retorno_analise_exemplo.pdf' });
    // arquivos de exemplo para a janela "Fora do portal"
    const pdfs = J.pdfsImp();
    const contratoFora = path.join(path.dirname(pdfs.ata_eleicao), 'Contrato_assinado_exemplo.pdf');
    fs.writeFileSync(contratoFora, '%PDF-1.4\n% arquivo de exemplo\n%%EOF\n');
    const retornoFora = path.join(path.dirname(pdfs.ata_eleicao), 'Retorno_analise_exemplo.pdf');
    fs.writeFileSync(retornoFora, await J.retornoTut('AC-2025-0621', 'Edifício Porto Seguro'));

    const { chromium } = playwright();
    const br = await chromium.launch({ channel: 'chromium', args: ['--lang=pt-BR'] });
    const ctx = await br.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erros.push(e.message));
    await p.goto(base + '/login');
    await p.fill('input[type=email]', 'vera@myblue.com.br'); await p.fill('input[type=password]', J.SENHA_CR);
    await p.click('button[type=submit]'); await p.waitForTimeout(1500);
    const ir = async (rota) => { await p.goto(base + '/' + rota); await p.waitForTimeout(1500); };
    const foto = async (nome) => { await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${nome}.png` }); };
    // partes da tela numa janela alta: a seção (ou a janela aberta) cabe inteira, sem a barra do topo por cima
    const parte = async (nome, sel) => {
      await p.setViewportSize({ width: 1280, height: 1700 });
      const el = p.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(500); await el.screenshot({ path: `${OUT}/${nome}.png` });
      await p.setViewportSize({ width: 1280, height: 820 });
    };
    const secao = (t) => `section.painel:has(h2:has-text("${t}"))`;

    /* ---------- Análise de Crédito ---------- */
    await ir('#/credito'); await foto('com-cr-1-lista');
    await p.click('#btNovaCr'); await p.waitForTimeout(1500);
    await foto('com-cr-2-nova');
    await p.fill('#fRs', 'Condomínio Residencial Jardim das Acácias'); await p.fill('#fCnpj', '11.222.333/0001-81'); await p.fill('#fUf', 'CE'); await p.fill('#fCid', 'Fortaleza');
    await p.fill('#fAdm', 'Administradora Exemplo'); await p.fill('#fSis', 'Superlógica'); await p.check('input[name=fTipo][value=nova]');
    await p.fill('#fUh', '24'); await p.fill('#fOrd', '1.840,00'); await p.fill('#fVenc', '10');
    await p.click('#btExtra'); await p.fill('#tbExtras [data-x=descricao]', 'Reforma da fachada'); await p.fill('#tbExtras [data-x=valor_por_uh]', '700,00');
    await p.fill('#tbExtras [data-x=inicio]', '2026-01'); await p.fill('#tbExtras [data-x=fim]', '2026-12'); await p.check('#tbExtras [data-x=ata]');
    await p.selectOption('#fSind', 'condomino'); await p.selectOption('#fIse', 'integral'); await p.fill('#fIseT', '1');
    await p.click('#btSalvarCr'); await p.waitForTimeout(4500); // o aviso "Rascunho salvo" some
    await parte('com-cr-3-identificacao', secao('Identificação do condomínio'));
    await parte('com-cr-4-operacao', secao('Características da operação'));
    await parte('com-cr-5-sindico', secao('Síndico e isenções'));
    await parte('com-cr-6-documentos', secao('Documentos'));
    await ir('#/credito/' + anRetorno); await foto('com-cr-7-retorno');

    /* ---------- Solicitação de Contrato ---------- */
    await ir('#/contratos'); await p.click('#btNovoCt'); await p.waitForTimeout(1400);
    await parte('com-ct-1-nova', '.modal');
    await p.check('input[name=origCt][value=entrega]'); await p.waitForTimeout(500);
    await parte('com-ct-1b-entrega', '.modal');
    await p.keyboard.press('Escape');
    await ir('#/contratos/' + ctRascunho);
    await foto('com-ct-2-topo');
    await parte('com-ct-3-condominio', secao('Condomínio e síndico'));
    await parte('com-ct-4-condicoes', secao('Condições negociadas'));
    await parte('com-ct-5-vigencia', secao('Vigência'));
    await parte('com-ct-6-objecoes', secao('Objeções e Solicitações'));
    await parte('com-ct-7-documentos', secao('Documentos'));
    await ir('#/contratos/' + ctMinuta); await foto('com-ct-8-minuta');

    /* ---------- Implantação ---------- */
    await ir('#/implantacao'); await p.click('#btNovaImp'); await p.waitForTimeout(1400);
    await parte('com-imp-1-portal', '.modal');
    await p.check('input[name=origImp][value=fora]'); await p.waitForTimeout(400);
    await p.setInputFiles('#arqCtFora', contratoFora); await p.setInputFiles('#arqPdfImp', retornoFora); await p.waitForTimeout(3500);
    await parte('com-imp-2-fora', '.modal');
    await p.keyboard.press('Escape');
    await ir('#/implantacao/' + impRascunho); await foto('com-imp-3-topo');
    await parte('com-imp-4-condicoes', secao('Condições do contrato'));
    await parte('com-imp-5-documentos', secao('Documentos'));
    await ir('#/implantacao/' + fora.id); await foto('com-imp-6-fora-topo');
    await parte('com-imp-7-fora-condicoes', secao('Condições do contrato'));
    await ir('#/implantacao/minhas'); await foto('com-imp-8-lista');
    await br.close();
  } finally { portal.parar(); }
  if (erros.length) console.log('erros na página:', erros.join(' | '));
  console.log('ok', OUT);
})().catch((e) => { console.error(e); process.exit(1); });

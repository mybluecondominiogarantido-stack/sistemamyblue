'use strict';
/*
 * Tutorial do Ajuste de Mailing (Cobrança). A ferramenta não guarda nada: lê o mailing (.xlsx) no navegador e
 * gera as planilhas para o disparo e para salvar os contatos. O mailing de entrada é inventado na hora.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const SLUG = 'ajuste-de-mailing';
const quadro = (t) => t.p.frameLocator(`iframe[data-slug="${SLUG}"]`);
const arquivoTemp = (nome, conteudo) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tut-')), nome); fs.writeFileSync(f, conteudo); return f; };

/* mailing fictício: colunas de sempre; números em formatos variados, às vezes mais de um na mesma célula */
const MAILING = [
  ['Condomínio', 'Unidade', 'Prop. Nome', 'Resp. Nome', 'Competência', 'Valor', 'Contatos'],
  ['CONDOMINIO JARDIM AZUL', 'AP 101', 'ANA PAULA DE SOUZA RIBEIRO', '', '09/2026', 612.4, '(85) 98877-0101'],
  ['CONDOMINIO JARDIM AZUL', 'AP 204', 'CARLOS EDUARDO MOTA', '', '09/2026', 612.4, '85 98877-0204, 85 3222-0204'],
  ['CONDOMINIO JARDIM AZUL', 'AP 302', 'MARIA DAS GRACAS LIMA', '', '08/2026', 598.1, '85988770302'],
  ['CONDOMINIO JARDIM AZUL', 'AP 401', '', 'JOAO PEDRO ALVES', '09/2026', 612.4, '(85) 8877-0401'],
  ['EDIFICIO SOLAR DAS PALMEIRAS', 'SALA 12', 'BEATRIZ NUNES COSTA', '', '09/2026', 455, '(11) 97766-1212 / (11) 97766-1213'],
  ['EDIFICIO SOLAR DAS PALMEIRAS', 'SALA 15', 'RAFAEL DOS SANTOS PEREIRA', '', '07/2026', 455, '11977661515'],
  ['EDIFICIO SOLAR DAS PALMEIRAS', 'SALA 21', 'LUCIANA FERREIRA', '', '09/2026', 455, ''],
  ['RESIDENCIAL PRIMAVERA', 'CASA 03', 'PAULO HENRIQUE DIAS', '', '09/2026', 380, '(81) 99654-0303'],
  ['RESIDENCIAL PRIMAVERA', 'CASA 07', 'FERNANDA ROCHA DE ALMEIDA', '', '08/2026', 380, '81 99654-0707; 81 99654-0708'],
  ['RESIDENCIAL PRIMAVERA', 'CASA 11', 'MARCOS VINICIUS TAVARES', '', '09/2026', 380, '(81) 9654-1111'],
];

module.exports = {
  nome: 'ferramenta-mailing',
  ferramenta: SLUG,
  entrar: 'lia@myblue.com.br',
  inicio: '#/m/' + SLUG,
  abertura: ['Arruma os telefones do mailing para o disparo e para salvar os contatos — tudo no navegador.', ['Carregar o mailing (.xlsx)', 'Planilha para o disparo: com ou sem variável', 'Contatos para salvar, um arquivo por condomínio']],
  async gravar(t) {
    const f = quadro(t);
    const xlsx = require(path.join(process.env.BIBLIOTECAS || '', 'node_modules', 'xlsx'));
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(MAILING), 'Mailing');
    const mailing = arquivoTemp('Mailing_cobranca_setembro.xlsx', xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const baixados = [];
    const pastaBaixados = fs.mkdtempSync(path.join(os.tmpdir(), 'tut-mailing-'));
    t.p.on('download', (d) => { baixados.push(d.suggestedFilename()); d.saveAs(path.join(pastaBaixados, d.suggestedFilename())).catch(() => {}); });

    const C = '1 · Carregar o mailing';
    await t.legenda('Solte aqui o mailing em Excel, com as colunas de sempre: <b>Condomínio</b>, <b>Unidade</b>, nome do proprietário e <b>Contatos</b>.', { etapa: C, ms: 600 });
    await t.mostrar(f.locator('#drop'), 1800);
    await t.enviarArquivo(f.locator('#drop'), f.locator('#file'), mailing, { depois: 1600 });
    await t.legenda('A ferramenta conta as linhas, os condomínios e os números. Nada sai do seu navegador.', { etapa: C, ms: 300 });
    await t.mostrar(f.locator('#summary'), 3200);

    const A = '2 · Planilha para o disparo';
    await t.legenda('Em <b>Ajuste de mailing</b>, cada número vira uma linha no padrão <b>+55 DDD 9…</b>: tira parênteses e traços, separa os que estavam juntos e põe o 9 que faltava.', { etapa: A, ms: 300 });
    await t.mostrar(f.locator('#pane-ajuste .desc'), 3800);
    await t.legenda('<b>Com variável</b> leva também o nome do condomínio (coluna prop1), para usar na mensagem. <b>Sem variável</b>, só os números.', { etapa: A, ms: 300 });
    await t.clicar(f.locator('.opt:has(input[value="sem"])'), { depois: 1200 });
    await t.clicar(f.locator('.opt:has(input[value="com"])'), { depois: 1600 });
    await t.legenda('<b>Gerar planilha</b> baixa o arquivo pronto para subir na ferramenta de disparo.', { etapa: A, ms: 300 });
    await t.clicar(f.locator('#btn1'), { depois: 1400 });
    await t.mostrar(f.locator('#note1'), 2400);

    const N = '3 · Contatos para salvar';
    await t.legenda('Em <b>Contatos para salvar</b>, a planilha para salvar os números no celular: telefone, nome e grupo.', { etapa: N, ms: 300 });
    await t.clicar(f.locator('.tab[data-tab="contatos"]'), { depois: 1600 });
    await t.legenda('O nome junta a unidade, os dois primeiros nomes da pessoa e o condomínio, sem “Condomínio”, “Edifício” ou “Residencial” — ex.: <b>AP 101 ANA PAULA Jardim Azul</b>.', { etapa: N, ms: 300 });
    await t.mostrar(f.locator('#pane-contatos .desc'), 4200);
    await t.legenda('<b>Gerar “Novos contatos”</b>: um arquivo por condomínio; com mais de um, saem todos num <b>.zip</b>.', { etapa: N, ms: 300 });
    await t.clicar(f.locator('#btn2'), { depois: 1600 });
    await t.mostrar(f.locator('#note2'), 2600);
    if (baixados.length < 2) throw new Error('downloads não aconteceram: ' + JSON.stringify(baixados));
    console.log('  baixados em', pastaBaixados + ':', baixados.join(' | '));
  },
  resumo: ['Solte o <b>mailing (.xlsx)</b> e confira linhas, condomínios e números', '<b>Ajuste de mailing</b>: com ou sem variável → <b>Gerar planilha</b> para o disparo', '<b>Contatos para salvar</b> → um arquivo por condomínio (.zip)'],
};

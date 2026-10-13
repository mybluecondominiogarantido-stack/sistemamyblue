'use strict';
/*
 * Grava os vídeos tutoriais do Portal MyBlue (dados fictícios).
 *
 *   node docs/tutoriais/fonte/gravar-tutoriais.js <pasta-de-saída> [nome-do-roteiro …]
 *
 * Sem nomes, grava todos. Ferramentas reais (o HTML não fica no repositório):
 *   FERRAMENTAS='{"suprimentos":"/caminho/Controle_de_Pedidos.html"}' node …
 */
const fs = require('fs');
const path = require('path');
const { subirPortal, navegador, Tutorial } = require('./gravador');
const { montarCenario, SENHA } = require('./cenario');
const ROTEIROS = require('./roteiros');
const { porSlug, rotuloPublico } = require('../../../server/tutoriais');

(async () => {
  const saida = path.resolve(process.argv[2] || 'tutoriais');
  const pedidos = process.argv.slice(3);
  const ferramentas = JSON.parse(process.env.FERRAMENTAS || '{}');
  const lista = ROTEIROS.filter((r) => !pedidos.length || pedidos.includes(r.nome));
  if (!lista.length) throw new Error('Nenhum roteiro com esse nome. Disponíveis: ' + ROTEIROS.map((r) => r.nome).join(', '));
  const br = await navegador();
  let porta = Number(process.env.PORTA) || 3960;
  const falhas = [];
  for (const r of lista) {
    if (r.ferramenta && !ferramentas[r.ferramenta]) { console.log(`pulado ${r.nome}: falta o HTML de "${r.ferramenta}" em FERRAMENTAS`); continue; }
    // cada vídeo começa num portal novo, com o mesmo cenário
    const portal = await subirPortal(porta++);
    let t;
    try {
      const cen = await montarCenario(portal.base, { ferramentas });
      // versão da ferramenta só para a gravação (ex.: troca listas com nomes reais por fictícios); o arquivo original não muda
      if (r.adaptarHtml) await cen.admin('PUT', `/api/admin/modulos/${r.ferramenta}/arquivo`, r.adaptarHtml(fs.readFileSync(ferramentas[r.ferramenta], 'utf8')));
      if (r.preparar) await r.preparar(cen, portal.base, br);
      t = await new Tutorial(br, portal.base, path.join(saida, r.nome + '.mp4')).abrir();
      if (r.entrar) await t.entrar(r.entrar, r.entrar.startsWith('admin@') ? 'Admin1234' : SENHA);
      if (r.inicio) await t.ir(r.inicio);
      if (r.ajustar) await r.ajustar(t); // antes de gravar (ex.: troca nomes reais que vêm no HTML da ferramenta)
      // o vídeo começa no cartão de abertura (título e público vêm do catálogo do portal)
      const cat = porSlug.get(r.nome);
      if (!cat) throw new Error(`"${r.nome}" não está no catálogo (server/tutoriais.js)`);
      await t.tut('cartao', 'Tutorial · ' + rotuloPublico(cat.publico), cat.titulo, ...(r.abertura || ['', null]));
      await t.pausa(700);
      await t.gravar();
      await t.pausa(4600); await t.tut('cartao', '', ''); await t.pausa(500);
      await r.gravar(t, cen);
      await t.semLegenda();
      // o vídeo termina no cartão de resumo (sem voltar para a tela)
      if (r.resumo) { await t.tut('cartao', 'Resumo', cat.titulo, '', r.resumo); await t.pausa(5600); }
      await t.terminar();
      console.log('ok', r.nome);
    } catch (e) {
      // um roteiro com erro não impede os outros
      falhas.push(r.nome);
      console.error(`falhou ${r.nome}: ${e.message.split('\n').slice(0, 3).join(' · ')}`);
      if (t) await t.abortar();
    } finally { portal.parar(); }
  }
  await br.close();
  if (falhas.length) { console.error('roteiros com erro:', falhas.join(', ')); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });

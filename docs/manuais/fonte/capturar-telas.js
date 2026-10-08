'use strict';
/*
 * Captura as telas usadas nos manuais, com dados fictícios.
 *
 *   PORT=3457 DATA_DIR=/tmp/portal-manual ADMIN_SENHA=Admin1234 node server/index.js   (banco vazio)
 *   node docs/manuais/fonte/capturar-telas.js <pasta-de-saída>
 *
 * Depois converta para JPEG em fonte/img (ex.: convert x.png -resize '1800x>' -quality 82 -interlace Plane x.jpg).
 */
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const B = 'http://localhost:3457';
const OUT = process.argv[2];
const HTML = (t) => `<!doctype html><html><head><meta charset="utf-8"><title>${t}</title></head><body style="font-family:sans-serif;padding:40px;color:#13323a"><h2>${t}</h2><p>Ferramenta de exemplo.</p></body></html>`;

(async () => {
  const br = await chromium.launch({ channel: 'chromium', args: ['--lang=pt-BR'] }); // navegador completo: campos de data e arquivo em português
  const erros = [];
  async function sessao(email, senha, vp) {
    const ctx = await br.newContext({ viewport: vp || { width: 1280, height: 780 }, deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erros.push(email + ': ' + e.message));
    await p.goto(B + '/login');
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha);
    await p.click('button[type=submit]'); await p.waitForTimeout(1300);
    return p;
  }
  const api = (p, m, u, b, bruto) => p.evaluate(async ([m, u, b, bruto]) => {
    const r = await fetch(u, { method: m, headers: { 'content-type': bruto ? 'text/html' : 'application/json' }, body: b == null ? undefined : bruto ? b : JSON.stringify(b) });
    return r.json().catch(() => ({}));
  }, [m, u, b, bruto]);
  const foto = async (p, nome, opts) => { await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${nome}.png`, ...(opts || {}) }); };
  const fechar = async (p) => { await p.keyboard.press('Escape'); await p.waitForTimeout(250); };

  // tela de login
  { const ctx = await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }); const p = await ctx.newPage(); await p.goto(B + '/login'); await foto(p, '01-login'); await ctx.close(); }

  const a = await sessao('admin@myblue.com.br', 'Admin1234');
  const eq = await api(a, 'GET', '/api/admin/equipes');
  const S = (n) => eq.setores.find((s) => s.nome === n).id;

  // ferramentas: HTML de exemplo para os cartões não aparecerem "sem arquivo"
  const titulos = { credito: 'Central de Ferramentas — Crédito', cobranca: 'Central de Ferramentas — Cobrança', renegociacoes: 'Controle de Renegociações',
    suprimentos: 'Controle de Pedidos', parceiros: 'Prestação de Contas — Parceiros', boletos: 'Controle de Emissão de Boletos', sindicos: 'Controle de Síndicos' };
  for (const [slug, t] of Object.entries(titulos)) await api(a, 'PUT', `/api/admin/modulos/${slug}/arquivo`, HTML(t), true);
  await api(a, 'PATCH', '/api/admin/modulos/sindicos', { setor_id: S('Crédito') });

  // carteira de condomínios (fictícia)
  const conds = [['Cond. Jardim Azul', 'SP'], ['Ed. Solar das Palmeiras', 'SP'], ['Res. Primavera', 'CE'], ['Cond. Vila Rica', 'PE'], ['Ed. Aurora', 'SP'], ['Res. Bela Vista', 'BA']];
  const condId = {};
  for (const [i, [nome, uf]] of conds.entries()) {
    condId[nome] = (await api(a, 'POST', '/api/carteira', { nome, comarca: uf, situacao: i === 5 ? 'DISTRATADO' : 'ATIVO', vencimento: 'Dia 10', administradora: i % 2 ? 'Própria' : 'Adm. Exemplo',
      analista_cobranca: 'MARCOS LIMA', assistente_credito: 'CAIO MENDES', analista_extrajudicial: i % 2 ? 'APOIOCOB — ANA' : '', razao_social: nome.toUpperCase(), cnpj: `12.345.678/000${i + 1}-9${i}` })).id;
  }

  // Central de Links (exemplos)
  for (const [grupo, titulo, url, icone, descricao] of [
    ['Atendimento', 'Portal do síndico', 'https://exemplo.myblue.com.br/sindico', 'casa', 'Acesso do síndico aos relatórios do condomínio'],
    ['Atendimento', 'Segunda via de boleto', 'https://exemplo.myblue.com.br/boleto', 'documento', 'Emissão de 2ª via para condôminos'],
    ['Equipe', 'Agenda da equipe', 'https://exemplo.myblue.com.br/agenda', 'calendario', ''],
    ['Equipe', 'Treinamentos', 'https://exemplo.myblue.com.br/treinamentos', 'video', 'Vídeos e materiais de treinamento'],
  ]) await api(a, 'POST', '/api/links/gestao/links', { grupo, titulo, url, icone, descricao, ativo: true });

  // pessoas
  // o setor de cada pessoa vem do cadastro (e forma a equipe do setor na Central de Tickets)
  const pessoas = [
    ['Lia Souza', 'lia@myblue.com.br', { papel: 'coordenador', setores: [S('Cobrança')] }],
    ['Marcos Lima', 'marcos@myblue.com.br', { setores: [S('Cobrança')], modulos: ['cobranca'] }],
    ['Sara Alves', 'sara@myblue.com.br', { setores: [S('CS')], modulos: ['renegociacoes'] }],
    ['Sueli Prado', 'sueli@myblue.com.br', { setores: [S('Gerência')], supervisor_tickets: true }],
    ['Caio Mendes', 'caio@myblue.com.br', { papel: 'coordenador', setores: [S('Crédito')] }],
    ['Bruna Reis', 'bruna@myblue.com.br', { setores: [S('Crédito')], modulos: ['credito', 'boletos'] }],
    ['Davi Rocha', 'davi@myblue.com.br', { setores: [S('Crédito')], modulos: ['credito'] }],
  ];
  const ids = {};
  for (const [n, e, extra] of pessoas) ids[e] = (await api(a, 'POST', '/api/admin/usuarios', { nome: n, email: e, senha: 'Senha1234', ...extra })).id;
  // líderes (os membros já vieram do cadastro)
  await api(a, 'PUT', `/api/admin/equipes/${S('Cobrança')}/membros`, { membros: [{ usuario_id: ids['lia@myblue.com.br'], lider: true }, { usuario_id: ids['marcos@myblue.com.br'] }] });
  await api(a, 'PUT', `/api/admin/equipes/${S('CS')}/membros`, { membros: [{ usuario_id: ids['sara@myblue.com.br'], lider: true }] });
  await api(a, 'PUT', `/api/admin/equipes/${S('Crédito')}/membros`, { membros: [{ usuario_id: ids['caio@myblue.com.br'], lider: true }, { usuario_id: ids['bruna@myblue.com.br'] }, { usuario_id: ids['davi@myblue.com.br'] }] });
  const cat = await api(a, 'POST', `/api/admin/equipes/${S('Cobrança')}/categorias`, { nome: '2ª via de boleto', prazo_horas: 4, prioridade: 'alta' });
  await api(a, 'POST', `/api/admin/equipes/${S('Cobrança')}/categorias`, { nome: 'Proposta de acordo', prazo_horas: 18, prioridade: 'media' });
  await api(a, 'POST', `/api/admin/equipes/${S('Cobrança')}/categorias`, { nome: 'Negativação / baixa', prazo_horas: 9, prioridade: 'alta' });
  await api(a, 'POST', `/api/admin/equipes/${S('Crédito')}/categorias`, { nome: 'Prestação de contas', prazo_horas: 27 });

  // primeiro acesso de todos (senha definitiva)
  for (const e of Object.keys(ids)) {
    const ctx = await br.newContext(); const p = await ctx.newPage(); await p.goto(B + '/login');
    await p.evaluate(async ([e]) => {
      await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, senha: 'Senha1234' }) });
      await fetch('/api/auth/senha', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ atual: 'Senha1234', nova: 'Nova12345' }) });
    }, [e]);
    await ctx.close();
  }

  // tickets
  const sara = await sessao('sara@myblue.com.br', 'Nova12345');
  const t1 = await api(sara, 'POST', '/api/tickets', { condominio_id: condId['Cond. Jardim Azul'], titulo: '2ª via do boleto — apto 302', descricao: 'Síndico pediu a 2ª via do boleto de outubro.\nVencimento original: 05/10. Enviar para sindico@jardimazul.com.br.', setor_id: S('Cobrança'), categoria_id: cat.id });
  const t2 = await api(sara, 'POST', '/api/tickets', { interno: true, titulo: 'Acordo para unidade 104 — Ed. Solar', descricao: 'Condômino quer parcelar 3 meses em atraso.', setor_id: S('Cobrança'), prioridade: 'urgente' });
  await api(sara, 'POST', '/api/tickets', { interno: true, titulo: 'Revisar régua de cobrança do Res. Primavera', setor_id: S('Cobrança'), prioridade: 'baixa' });
  await api(sara, 'POST', '/api/tickets', { condominio_id: condId['Cond. Vila Rica'], titulo: 'Balancete de setembro', setor_id: S('Crédito'), prioridade: 'media' });
  const t5 = await api(sara, 'POST', '/api/tickets', { condominio_id: condId['Ed. Aurora'], titulo: 'Acordo da unidade 51', setor_id: S('Cobrança'), prioridade: 'media' });
  const lia = await sessao('lia@myblue.com.br', 'Nova12345');
  await api(lia, 'POST', '/api/tickets', { interno: true, titulo: 'Contrato do Res. Bela Vista para renovação', setor_id: S('CS'), prioridade: 'alta' });
  await api(lia, 'PATCH', `/api/tickets/${t2.id}`, { responsavel_id: ids['lia@myblue.com.br'] });
  const marcos = await sessao('marcos@myblue.com.br', 'Nova12345');
  const amanha = new Date(Date.now() + 26 * 3600e3).toISOString();
  await api(marcos, 'PATCH', `/api/tickets/${t1.id}`, { status: 'em_andamento', prazo_conclusao: amanha });
  await api(marcos, 'POST', `/api/tickets/${t1.id}/comentarios`, { texto: 'Conferir se há acordo ativo antes de emitir.', interno: true });
  await api(marcos, 'POST', `/api/tickets/${t1.id}/comentarios`, { texto: 'Emitindo agora, envio ainda hoje para o síndico.' });

  // Início e fila (pessoa da equipe)
  await marcos.reload(); await marcos.waitForTimeout(1500);
  await foto(marcos, '02-inicio');
  await marcos.goto(B + '/#/tickets/fila/minha'); await marcos.waitForTimeout(1000); await foto(marcos, '07-minha-fila');
  await marcos.goto(B + '/#/tickets/' + t5.id); await marcos.waitForTimeout(1200);
  await marcos.click('#btIniciar'); await marcos.waitForTimeout(300); await foto(marcos, '09b-iniciar'); await fechar(marcos);
  await marcos.goto(B + '/#/tickets/' + t1.id); await marcos.waitForTimeout(1200); await foto(marcos, '09-detalhe-equipe', { fullPage: true });
  await marcos.click('#btResolver'); await marcos.fill('#mMotivo', 'Boleto enviado ao síndico por e-mail.'); await foto(marcos, '10-resolver'); await fechar(marcos);
  await marcos.click('#btTransferir'); await marcos.selectOption('#trSetor', String(S('Crédito'))); await marcos.fill('#trMot', 'Precisa de análise do balancete.'); await foto(marcos, '11-transferir'); await fechar(marcos);

  // Solicitante
  await sara.goto(B + '/#/tickets/fila/abertos'); await sara.waitForTimeout(1000); await foto(sara, '05-abertos-por-mim');
  await sara.click('#btNovoTicket'); await sara.waitForTimeout(300);
  await sara.selectOption('#tSetor', String(S('Cobrança'))); await sara.selectOption('#tCat', String(cat.id));
  await sara.check('input[name=tOrigem][value=condominio]'); await sara.fill('#tCond', 'Ed. Aurora · SP'); await sara.dispatchEvent('#tCond', 'input');
  await sara.fill('#tTitulo', '2ª via — apto 51'); await sara.fill('#tDesc', 'Moradora pediu a 2ª via do boleto de outubro. Vencimento 10/10.');
  await foto(sara, '04-novo-ticket'); await fechar(sara);
  await sara.goto(B + '/#/tickets/' + t1.id); await sara.waitForTimeout(1200); await foto(sara, '06-detalhe-solicitante', { fullPage: true });
  await sara.goto(B + '/#/tickets/fila/minha'); await sara.waitForTimeout(800);
  await sara.click('#btSino'); await foto(sara, '12-avisos'); await fechar(sara);

  // Líder
  await lia.goto(B + '/#/tickets/fila/setor'); await lia.waitForTimeout(1000); await foto(lia, '08-fila-setor');
  const t3 = (await api(lia, 'GET', '/api/tickets?vis=setor')).tickets.find((t) => !t.responsavel_id);
  await lia.goto(B + '/#/tickets/' + t3.id); await lia.waitForTimeout(1000);
  await lia.locator('#ladoAcoes').screenshot({ path: `${OUT}/08b-lider-atribuir.png` });

  // Supervisor
  const sueli = await sessao('sueli@myblue.com.br', 'Nova12345');
  await sueli.goto(B + '/#/tickets/painel'); await sueli.waitForTimeout(1500); await foto(sueli, '13-painel', { fullPage: true });
  await sueli.goto(B + '/#/tickets/fila/todos'); await sueli.waitForTimeout(1000); await foto(sueli, '13b-todos');

  // Carteira e Central de Links (qualquer pessoa)
  await marcos.goto(B + '/#/carteira'); await marcos.waitForTimeout(1200); await foto(marcos, '18-carteira');
  await marcos.goto(B + '/#/links'); await marcos.waitForTimeout(1200); await foto(marcos, '19-links');

  // Coordenador
  const caio = await sessao('caio@myblue.com.br', 'Nova12345');
  await caio.goto(B + '/#/admin/usuarios'); await caio.waitForTimeout(1200); await foto(caio, '20-coord-usuarios');
  await caio.click('#btNovoUsu'); await caio.waitForTimeout(400); await caio.fill('#uNome', 'Rita Campos'); await caio.fill('#uEmail', 'rita@myblue.com.br');
  await caio.check('input[name=uMod][value=boletos]'); await foto(caio, '20b-coord-novo'); await fechar(caio);
  await caio.goto(B + '/#/admin/modulos'); await caio.waitForTimeout(1200); await foto(caio, '21-coord-modulos');
  await caio.click('tr[data-slug="boletos"]'); await caio.waitForTimeout(600); await foto(caio, '21b-coord-html', { fullPage: true }); await fechar(caio);
  await caio.goto(B + '/#/admin/equipes'); await caio.waitForTimeout(1200); await caio.click('[data-setor]'); await caio.waitForTimeout(500); await foto(caio, '23-coord-equipe'); await fechar(caio);
  await caio.goto(B + '/#/carteira'); await caio.waitForTimeout(1200); await caio.click('tbody tr.clicavel'); await caio.waitForTimeout(700); await foto(caio, '24-coord-carteira'); await fechar(caio);

  // Administração
  await a.reload(); await a.waitForTimeout(800);
  await a.goto(B + '/#/admin/equipes'); await a.waitForTimeout(1200); await foto(a, '14-equipes');
  await a.click(`[data-setor="${S('Cobrança')}"]`); await a.waitForTimeout(500); await foto(a, '14b-equipe-setor'); await fechar(a);
  await a.goto(B + '/#/admin/usuarios'); await a.waitForTimeout(1200); await foto(a, '15-usuarios');
  await a.click(`tr[data-id="${ids['caio@myblue.com.br']}"]`); await a.waitForTimeout(500); await foto(a, '15b-usuario'); await fechar(a);
  await a.goto(B + '/#/admin/modulos'); await a.waitForTimeout(1200); await foto(a, '22-modulos');
  await a.goto(B + '/#/conta'); await a.waitForTimeout(800); await foto(a, '16-conta');

  // celular
  const cel = await sessao('marcos@myblue.com.br', 'Nova12345', { width: 390, height: 844 });
  await cel.goto(B + '/#/tickets/fila/minha'); await cel.waitForTimeout(1000); await foto(cel, '17-celular');
  await cel.click('#btMenu'); await foto(cel, '17b-celular-menu');

  console.log('erros:', JSON.stringify(erros));
  await br.close();
})().catch((e) => { console.error(e); process.exit(1); });

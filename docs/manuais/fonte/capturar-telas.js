const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const B = 'http://localhost:3457';
const OUT = process.argv[2];
(async () => {
  const br = await chromium.launch();
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

  // tela de login
  { const ctx = await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }); const p = await ctx.newPage(); await p.goto(B + '/login'); await foto(p, '01-login'); await ctx.close(); }

  const a = await sessao('admin@myblue.com.br', 'Admin1234');
  // ferramentas: HTML de exemplo só para os cartões não aparecerem "sem arquivo"
  for (const slug of ['credito', 'cobranca', 'renegociacoes', 'suprimentos', 'parceiros']) {
    await api(a, 'PUT', `/api/admin/modulos/${slug}/arquivo`, '<!doctype html><html><head><title>Exemplo</title></head><body>Ferramenta</body></html>', true);
  }
  const pessoas = [['Lia Souza', 'lia@myblue.com.br'], ['Marcos Lima', 'marcos@myblue.com.br'], ['Sara Alves', 'sara@myblue.com.br'], ['Sueli Prado', 'sueli@myblue.com.br'], ['Caio Mendes', 'caio@myblue.com.br']];
  const ids = {};
  const mods = ['credito', 'cobranca', 'renegociacoes', 'suprimentos', 'parceiros'];
  for (const [n, e] of pessoas) ids[e] = (await api(a, 'POST', '/api/admin/usuarios', { nome: n, email: e, senha: 'Senha1234', supervisor_tickets: e.startsWith('sueli'), modulos: e.startsWith('marcos') || e.startsWith('lia') ? ['cobranca'] : e.startsWith('sara') ? ['renegociacoes'] : [] })).id;
  const eq = await api(a, 'GET', '/api/admin/equipes');
  const S = (n) => eq.setores.find((s) => s.nome === n).id;
  await api(a, 'PUT', `/api/admin/equipes/${S('Cobrança')}/membros`, { membros: [{ usuario_id: ids['lia@myblue.com.br'], lider: true }, { usuario_id: ids['marcos@myblue.com.br'] }] });
  await api(a, 'PUT', `/api/admin/equipes/${S('CS')}/membros`, { membros: [{ usuario_id: ids['sara@myblue.com.br'], lider: true }] });
  await api(a, 'PUT', `/api/admin/equipes/${S('Crédito')}/membros`, { membros: [{ usuario_id: ids['caio@myblue.com.br'], lider: true }] });
  const cat = await api(a, 'POST', `/api/admin/equipes/${S('Cobrança')}/categorias`, { nome: '2ª via de boleto', prazo_horas: 4, prioridade: 'alta' });
  await api(a, 'POST', `/api/admin/equipes/${S('Cobrança')}/categorias`, { nome: 'Proposta de acordo', prazo_horas: 18, prioridade: 'media' });
  await api(a, 'POST', `/api/admin/equipes/${S('Cobrança')}/categorias`, { nome: 'Negativação / baixa', prazo_horas: 9, prioridade: 'alta' });
  await api(a, 'POST', `/api/admin/equipes/${S('Crédito')}/categorias`, { nome: 'Prestação de contas', prazo_horas: 27 });

  for (const e of Object.keys(ids)) {
    const ctx = await br.newContext(); const p = await ctx.newPage(); await p.goto(B + '/login');
    await p.evaluate(async ([e]) => {
      await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, senha: 'Senha1234' }) });
      await fetch('/api/auth/senha', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ atual: 'Senha1234', nova: 'Nova12345' }) });
    }, [e]);
    await ctx.close();
  }
  const sara = await sessao('sara@myblue.com.br', 'Nova12345');
  const t1 = await api(sara, 'POST', '/api/tickets', { titulo: '2ª via do boleto — Cond. Jardim Azul, apto 302', descricao: 'Síndico pediu a 2ª via do boleto de outubro.\nVencimento original: 05/10. Enviar para sindico@jardimazul.com.br.', setor_id: S('Cobrança'), categoria_id: cat.id });
  const t2 = await api(sara, 'POST', '/api/tickets', { titulo: 'Acordo para unidade 104 — Ed. Solar', descricao: 'Condômino quer parcelar 3 meses em atraso.', setor_id: S('Cobrança'), prioridade: 'urgente' });
  await api(sara, 'POST', '/api/tickets', { titulo: 'Revisar taxa de administração — Res. Primavera', setor_id: S('Cobrança'), prioridade: 'baixa' });
  await api(sara, 'POST', '/api/tickets', { titulo: 'Balancete de setembro — Cond. Vila Rica', setor_id: S('Crédito'), prioridade: 'media' });
  const lia = await sessao('lia@myblue.com.br', 'Nova12345');
  await api(lia, 'PATCH', `/api/tickets/${t1.id}`, { responsavel_id: ids['marcos@myblue.com.br'] });
  const lt = await api(lia, 'POST', '/api/tickets', { titulo: 'Contrato do Cond. Bela Vista para renovação', setor_id: S('CS'), prioridade: 'alta' });
  const marcos = await sessao('marcos@myblue.com.br', 'Nova12345');
  await api(marcos, 'POST', `/api/tickets/${t1.id}/comentarios`, { texto: 'Conferir se há acordo ativo antes de emitir.', interno: true });
  await api(marcos, 'POST', `/api/tickets/${t1.id}/comentarios`, { texto: 'Emitindo agora, envio ainda hoje para o síndico.' });
  await api(lia, 'PATCH', `/api/tickets/${t2.id}`, { responsavel_id: ids['lia@myblue.com.br'] });

  // Início (pessoa da equipe)
  await marcos.reload(); await marcos.waitForTimeout(1500);
  await foto(marcos, '02-inicio');
  await marcos.goto(B + '/#/tickets/fila/minha'); await marcos.waitForTimeout(1000); await foto(marcos, '07-minha-fila');
  await marcos.goto(B + '/#/tickets/' + t1.id); await marcos.waitForTimeout(1200); await foto(marcos, '09-detalhe-equipe', { fullPage: true });
  await marcos.click('#btResolver'); await marcos.fill('#mMotivo', 'Boleto enviado ao síndico por e-mail.'); await foto(marcos, '10-resolver'); await marcos.keyboard.press('Escape');
  await marcos.click('#btTransferir'); await marcos.selectOption('#trSetor', String(S('Crédito'))); await marcos.fill('#trMot', 'Precisa de análise do balancete.'); await foto(marcos, '11-transferir'); await marcos.keyboard.press('Escape');

  // Solicitante
  await sara.goto(B + '/#/tickets/fila/abertos'); await sara.waitForTimeout(1000); await foto(sara, '05-abertos-por-mim');
  await sara.click('#btNovoTicket'); await sara.waitForTimeout(300);
  await sara.selectOption('#tSetor', String(S('Cobrança'))); await sara.selectOption('#tCat', String(cat.id));
  await sara.fill('#tTitulo', '2ª via — Ed. Aurora, apto 51'); await sara.fill('#tDesc', 'Moradora pediu a 2ª via do boleto de outubro. Vencimento 10/10.');
  await foto(sara, '04-novo-ticket'); await sara.keyboard.press('Escape');
  await sara.goto(B + '/#/tickets/' + t1.id); await sara.waitForTimeout(1200); await foto(sara, '06-detalhe-solicitante', { fullPage: true });
  await sara.goto(B + '/#/tickets/fila/minha'); await sara.waitForTimeout(800);
  await sara.click('#btSino'); await foto(sara, '12-avisos'); await sara.keyboard.press('Escape');

  // Líder
  await lia.goto(B + '/#/tickets/fila/setor'); await lia.waitForTimeout(1000); await foto(lia, '08-fila-setor');
  const t3 = (await api(lia, 'GET', '/api/tickets?vis=setor')).tickets.find((t) => !t.responsavel_id);
  await lia.goto(B + '/#/tickets/' + t3.id); await lia.waitForTimeout(1000);
  await lia.screenshot({ path: `${OUT}/08b-lider-atribuir.png`, clip: { x: 1000, y: 170, width: 280, height: 470 } });

  // Supervisão
  const sueli = await sessao('sueli@myblue.com.br', 'Nova12345');
  await sueli.goto(B + '/#/tickets/painel'); await sueli.waitForTimeout(1500); await foto(sueli, '13-painel', { fullPage: true });
  await sueli.goto(B + '/#/tickets/fila/todos'); await sueli.waitForTimeout(1000); await foto(sueli, '13b-todos');

  // Administração
  await a.goto(B + '/#/admin/equipes'); await a.waitForTimeout(1200); await foto(a, '14-equipes');
  await a.click(`[data-setor="${S('Cobrança')}"]`); await a.waitForTimeout(500); await foto(a, '14b-equipe-setor'); await a.keyboard.press('Escape');
  await a.goto(B + '/#/admin/usuarios'); await a.waitForTimeout(1200); await foto(a, '15-usuarios');
  await a.click(`tr[data-id="${ids['sueli@myblue.com.br']}"]`); await a.waitForTimeout(500); await foto(a, '15b-usuario'); await a.keyboard.press('Escape');
  await a.goto(B + '/#/conta'); await a.waitForTimeout(800); await foto(a, '16-conta');

  // celular
  const cel = await sessao('marcos@myblue.com.br', 'Nova12345', { width: 390, height: 844 });
  await cel.goto(B + '/#/tickets/fila/minha'); await cel.waitForTimeout(1000); await foto(cel, '17-celular');
  await cel.click('#btMenu'); await foto(cel, '17b-celular-menu');

  console.log('erros:', JSON.stringify(erros));
  await br.close();
})().catch((e) => { console.error(e); process.exit(1); });

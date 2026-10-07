/* Portal MyBlue — aplicação do navegador (sem dependências) */
(function () {
  'use strict';

  /* ======================= utilidades ======================= */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function quando(s) {
    if (!s) return '—';
    var d = new Date(String(s).replace(' ', 'T') + (String(s).indexOf('Z') > 0 ? '' : 'Z'));
    return isNaN(d) ? s : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function tamanho(b) { if (b == null) return '—'; return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function iniciais(nome) { return String(nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join(''); }
  function normal(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function guardar(k, v) { try { localStorage.setItem('portal.' + k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
  function lembrar(k, padrao) { try { var v = localStorage.getItem('portal.' + k); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; } }

  async function api(metodo, url, corpo, opcoes) {
    opcoes = opcoes || {};
    var init = { method: metodo, credentials: 'same-origin', headers: {} };
    if (corpo !== undefined) {
      if (opcoes.bruto) { init.body = corpo; init.headers['Content-Type'] = 'text/html'; }
      else { init.body = JSON.stringify(corpo); init.headers['Content-Type'] = 'application/json'; }
    }
    Object.assign(init.headers, opcoes.headers || {});
    var r = await fetch(url, init);
    if (r.status === 401) { sessaoExpirada(); throw new Error('Sua sessão expirou.'); }
    var j = {};
    try { j = await r.json(); } catch (e) { /* sem JSON */ }
    if (!r.ok) throw new Error(j.erro || ('Erro ' + r.status));
    return j;
  }

  var toastTimer;
  function toast(msg, tipo) {
    var t = $('.toast') || document.body.appendChild(document.createElement('div'));
    t.className = 'toast ' + (tipo || '');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, tipo === 'erro' ? 6000 : 3200);
  }

  /* modal genérico: devolve o elemento; fechar() remove */
  function modal(opts) {
    var fundo = document.createElement('div');
    fundo.className = 'fundo-modal';
    fundo.innerHTML = '<div class="modal ' + (opts.largo ? 'largo' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.titulo) + '">' +
      '<div class="modal-cab"><h3>' + esc(opts.titulo) + '</h3><button class="btn icon ghost" data-fechar aria-label="Fechar">' + IC.fechar + '</button></div>' +
      '<div class="modal-corpo">' + (opts.corpo || '') + '</div>' +
      (opts.pe !== false ? '<div class="modal-pe">' + (opts.pe || '<button class="btn ghost" data-fechar>Fechar</button>') + '</div>' : '') + '</div>';
    function fechar() { fundo.remove(); document.removeEventListener('keydown', tecla); if (opts.aoFechar) opts.aoFechar(); }
    function tecla(e) { if (e.key === 'Escape') fechar(); }
    fundo.addEventListener('mousedown', function (e) { if (e.target === fundo) fechar(); });
    $$('[data-fechar]', fundo).forEach(function (b) { b.addEventListener('click', fechar); });
    document.addEventListener('keydown', tecla);
    document.body.appendChild(fundo);
    var foco = $('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea', fundo);
    if (foco) foco.focus();
    fundo.fechar = fechar;
    return fundo;
  }

  function confirmar(titulo, texto, rotuloOk, perigo) {
    return new Promise(function (resolve) {
      var ok = false;
      var m = modal({
        titulo: titulo, corpo: '<p style="margin:0;font-weight:600;color:var(--ink-2)">' + texto + '</p>',
        pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn ' + (perigo ? 'danger' : 'primary') + '" id="mOk">' + esc(rotuloOk || 'Confirmar') + '</button>',
        aoFechar: function () { resolve(ok); },
      });
      $('#mOk', m).addEventListener('click', function () { ok = true; m.fechar(); });
    });
  }

  /* ======================= ícones ======================= */
  function svg(d, extra) { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' + (extra || '') + '>' + d + '</svg>'; }
  var IC = {
    app: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    calculadora: svg('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8"/>'),
    grafico: svg('<path d="M3 3v18h18"/><path d="M7 16l4-6 4 3 5-8"/>'),
    aperto: svg('<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>'),
    caixa: svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
    carteira: svg('<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/><path d="M16 14h.01"/>'),
    documento: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h4"/>'),
    pessoas: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    ticket: svg('<path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/>'),
    casa: svg('<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>'),
    calendario: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    escudo: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
    inicio: svg('<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    busca: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
    sair: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'),
    menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    recolher: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>'),
    recarregar: svg('<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>'),
    novaAba: svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>'),
    fechar: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    usuarios: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    camadas: svg('<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'),
    historico: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>'),
    conta: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    enviar: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>'),
    baixar: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>'),
    mais: svg('<path d="M12 5v14M5 12h14"/>'),
    sino: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
    link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
    mensagem: svg('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>'),
    video: svg('<rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3z"/>'),
    pasta: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    megafone: svg('<path d="m3 11 15-6v14L3 13z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>'),
    imagem: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
    lapis: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    olho: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    cima: svg('<path d="m18 15-6-6-6 6"/>'),
    baixo: svg('<path d="m6 9 6 6 6-6"/>'),
    banco: svg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>'),
  };
  var ROTULO_ICONE = { app: 'Genérico', calculadora: 'Calculadora', grafico: 'Gráfico', aperto: 'Negociação', caixa: 'Pacote', carteira: 'Carteira', documento: 'Documento', pessoas: 'Pessoas', ticket: 'Ticket', casa: 'Condomínio', calendario: 'Calendário', escudo: 'Segurança',
    link: 'Link', mensagem: 'Mensagem / WhatsApp', video: 'Vídeo', pasta: 'Pasta', megafone: 'Campanha / Comunicado' };

  /* ======================= estado ======================= */
  var eu = null;
  var modulos = [];
  var recentes = [];
  var quadros = {}; // slug -> iframe aberto
  var atual = null; // slug do módulo em tela
  var statusSync = {};

  /* ======================= casca ======================= */
  function montarCasca() {
    $('#icBusca').innerHTML = IC.busca;
    $('#btMenu').innerHTML = IC.menu;
    $('#btFecharMenu').innerHTML = IC.fechar;
    $('#btRecolher').innerHTML = IC.recolher;
    $('#btConta').innerHTML = IC.conta;
    $('#btSair').innerHTML = IC.sair;
    $('#avatar').textContent = iniciais(eu.nome);
    $('#quemNome').textContent = eu.nome;
    $('#quemEmail').textContent = eu.email;
    if (lembrar('recolhido', false)) $('#casca').classList.add('recolhida');

    $('#btMenu').onclick = function () { $('#casca').classList.add('menu-aberto'); };
    $('#btFecharMenu').onclick = $('#cortina').onclick = function () { $('#casca').classList.remove('menu-aberto'); };
    $('#btRecolher').onclick = function () { var c = $('#casca').classList.toggle('recolhida'); guardar('recolhido', c); };
    $('#busca').addEventListener('input', desenharMenu);
    $('#busca').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var a = $('#nav a[data-slug]'); if (a) { location.hash = a.getAttribute('href'); $('#busca').value = ''; desenharMenu(); } }
    });
    $('#btSair').onclick = async function () {
      var pendente = Object.keys(statusSync).some(function (k) { return statusSync[k] === 'salvando' || statusSync[k] === 'erro'; });
      if (pendente && !(await confirmar('Sair do portal', 'Ainda há alterações sendo salvas em uma ferramenta. Sair agora pode perder essas alterações.', 'Sair mesmo assim', true))) return;
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/login';
    };

    window.addEventListener('message', function (ev) {
      if (ev.origin !== location.origin || !ev.data || !ev.data.myblue) return;
      statusSync[ev.data.modulo] = ev.data.tipo;
      if (ev.data.modulo === atual) desenharStatus();
    });
    window.addEventListener('beforeunload', function (e) {
      var pendente = Object.keys(statusSync).some(function (k) { return statusSync[k] === 'salvando' || statusSync[k] === 'erro'; });
      if (pendente) { e.preventDefault(); e.returnValue = ''; }
    });
    // confere a sessão de tempos em tempos
    setInterval(function () { fetch('/api/auth/eu', { credentials: 'same-origin' }).then(function (r) { if (r.status === 401) sessaoExpirada(); }).catch(function () {}); }, 5 * 60 * 1000);
  }

  var avisouSessao = false;
  function sessaoExpirada() {
    if (avisouSessao) return;
    avisouSessao = true;
    modal({
      titulo: 'Sessão encerrada',
      corpo: '<p style="margin:0;font-weight:600">Sua sessão expirou ou foi encerrada. Entre novamente para continuar.</p>',
      pe: '<a class="btn primary" href="/login?volta=' + encodeURIComponent('/' + location.hash) + '">Entrar novamente</a>',
    });
  }

  function porSetor(lista) {
    var grupos = [];
    var idx = {};
    lista.forEach(function (m) {
      if (!idx[m.setor]) { idx[m.setor] = { setor: m.setor, ordem: m.setor_ordem, itens: [] }; grupos.push(idx[m.setor]); }
      idx[m.setor].itens.push(m);
    });
    grupos.sort(function (a, b) { return (a.ordem - b.ordem) || a.setor.localeCompare(b.setor, 'pt-BR'); });
    return grupos;
  }

  function desenharMenu() {
    var termo = normal($('#busca').value);
    var lista = modulos.filter(function (m) { return !termo || normal(m.nome + ' ' + m.setor + ' ' + m.descricao).indexOf(termo) >= 0; });
    var rota = location.hash || '#/';
    var html = termo ? '' : '<a href="#/" class="' + (rota === '#/' ? 'on' : '') + '">' + IC.inicio + 'Início</a>' +
      '<a href="#/links" class="' + (rota.indexOf('#/links') === 0 ? 'on' : '') + '">' + IC.link + 'Central de Links</a>';
    if (!termo) {
      html += '<div class="grupo">Central de Tickets</div>' +
        '<a href="#/tickets" class="' + (rota.indexOf('#/tickets') === 0 && rota.indexOf('#/tickets/painel') !== 0 ? 'on' : '') + '">' + IC.ticket + '<span>Tickets</span>' +
        '<i data-contador="fila" class="contador" hidden></i></a>' +
        (souEquipe() ? '<a href="#/tickets/painel" class="' + (rota.indexOf('#/tickets/painel') === 0 ? 'on' : '') + '">' + IC.grafico + 'Painel de tickets</a>' : '') +
        '<div class="grupo">Carteira</div>' +
        '<a href="#/carteira" class="' + (rota.indexOf('#/carteira') === 0 ? 'on' : '') + '">' + IC.casa + 'Carteira de condomínios</a>';
    }
    porSetor(lista).forEach(function (g) {
      html += '<div class="grupo">' + esc(g.setor) + '</div>';
      g.itens.forEach(function (m) {
        html += '<a href="#/m/' + esc(m.slug) + '" data-slug="' + esc(m.slug) + '" class="' + (atual === m.slug && rota.indexOf('#/m/') === 0 ? 'on ' : '') + (m.ativo ? '' : 'inativo') + '" title="' + esc(m.nome) + '">' +
          (IC[m.icone] || IC.app) + '<span>' + esc(m.nome) + '</span>' + (quadros[m.slug] ? '<i class="aberto" title="Aberta"></i>' : '') + '</a>';
      });
    });
    if (termo && !lista.length) html += '<p class="ajuda" style="padding:10px">Nenhuma ferramenta encontrada.</p>';
    if (eu.papel === 'admin' && !termo) {
      html += '<div class="grupo">Administração</div>' +
        '<a href="#/admin/usuarios" class="' + (rota.indexOf('#/admin/usuarios') === 0 ? 'on' : '') + '">' + IC.usuarios + 'Usuários e acessos</a>' +
        '<a href="#/admin/modulos" class="' + (rota.indexOf('#/admin/modulos') === 0 ? 'on' : '') + '">' + IC.camadas + 'Módulos e dados</a>' +
        '<a href="#/admin/equipes" class="' + (rota.indexOf('#/admin/equipes') === 0 ? 'on' : '') + '">' + IC.pessoas + 'Equipes e tipos de demanda</a>' +
        '<a href="#/admin/auditoria" class="' + (rota.indexOf('#/admin/auditoria') === 0 ? 'on' : '') + '">' + IC.historico + 'Histórico de atividades</a>';
    }
    $('#nav').innerHTML = html;
    if (resumoTickets) { var bc = $('#nav [data-contador=fila]'); if (bc) { bc.textContent = resumoTickets.minha_fila; bc.hidden = !resumoTickets.minha_fila; if (resumoTickets.minha_fila_atrasados) bc.classList.add('alerta'); } }
    $$('#nav a').forEach(function (a) { a.addEventListener('click', function () { $('#casca').classList.remove('menu-aberto'); }); });
  }

  function definirBarra(trilha, acoes) {
    $('#trilha').innerHTML = trilha;
    $('#acoesBarra').innerHTML = acoes || '';
  }

  function desenharStatus() {
    var s = atual ? statusSync[atual] : null;
    var el = $('#statusSync');
    if (!s) { el.innerHTML = ''; return; }
    var txt = { salvando: 'salvando…', salvo: '✓ salvo no servidor', erro: '⚠ falha ao salvar — tentando de novo' }[s] || '';
    el.innerHTML = '<span class="status-sync ' + esc(s) + '">' + txt + '</span>';
    if (s === 'salvo') setTimeout(function () { if (statusSync[atual] === 'salvo') { el.innerHTML = ''; } }, 2500);
  }

  /* ======================= roteamento ======================= */
  function rotear() {
    var h = location.hash || '#/';
    var partes = h.replace(/^#\/?/, '').split('/');
    $('#casca').classList.remove('menu-aberto');
    if (partes[0] === 'm' && partes[1]) return abrirModulo(decodeURIComponent(partes[1]));
    mostrarConteudo();
    if (partes[0] === 'tickets') {
      if (partes[1] === 'painel') return paginaPainelTickets();
      if (partes[1] === 'fila') return paginaTickets(partes[2]);
      if (/^\d+$/.test(partes[1] || '')) return paginaTicket(Number(partes[1]));
      return paginaTickets(lembrar('tickets.visao', 'minha'));
    }
    if (partes[0] === 'carteira') return paginaCarteira(partes[1]);
    if (partes[0] === 'links') {
      if (partes[1] === 'gestao' && editorLinks()) return paginaGestaoLinks(partes[2]);
      if (partes[1] === 'previa' && editorLinks()) return paginaLinks(Number(partes[2]) || null);
      return paginaLinks(null);
    }
    if (partes[0] === 'admin' && eu.papel === 'admin') {
      if (partes[1] === 'equipes') return paginaEquipes();
      if (partes[1] === 'usuarios') return paginaUsuarios();
      if (partes[1] === 'modulos') return paginaModulos();
      if (partes[1] === 'auditoria') return paginaAuditoria();
    }
    if (partes[0] === 'conta') return paginaConta();
    return paginaInicio();
  }

  function mostrarConteudo() {
    atual = null;
    Object.keys(quadros).forEach(function (s) { quadros[s].hidden = true; });
    $('#conteudo').hidden = false;
    $('#statusSync').innerHTML = '';
    desenharMenu();
  }

  /* ======================= módulo (iframe) ======================= */
  function abrirModulo(slug) {
    var m = modulos.find(function (x) { return x.slug === slug; });
    if (!m) { toast('Ferramenta não encontrada ou sem acesso.', 'erro'); location.hash = '#/'; return; }
    atual = slug;
    $('#conteudo').hidden = true;
    Object.keys(quadros).forEach(function (s) { quadros[s].hidden = s !== slug; });
    if (!quadros[slug]) {
      var f = document.createElement('iframe');
      f.title = m.nome;
      f.setAttribute('data-slug', slug);
      f.src = '/m/' + encodeURIComponent(slug) + '/';
      f.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen');
      var carregando = document.createElement('div');
      carregando.className = 'carregando';
      carregando.innerHTML = '<div><div class="giro"></div>Abrindo ' + esc(m.nome) + '…</div>';
      $('#palco').appendChild(carregando);
      f.addEventListener('load', function () { carregando.remove(); });
      $('#palco').appendChild(f);
      quadros[slug] = f;
    }
    definirBarra(
      '<span class="setor">' + esc(m.setor) + '</span><span class="sep">/</span><span class="nome">' + esc(m.nome) + '</span>',
      '<button class="btn icon ghost" id="btRecarregar" title="Recarregar ferramenta" aria-label="Recarregar">' + IC.recarregar + '</button>' +
      '<a class="btn icon ghost" href="/m/' + esc(slug) + '/" target="_blank" rel="noopener" title="Abrir em nova aba" aria-label="Abrir em nova aba">' + IC.novaAba + '</a>' +
      '<button class="btn icon ghost" id="btFecharMod" title="Fechar ferramenta (libera memória)" aria-label="Fechar ferramenta">' + IC.fechar + '</button>'
    );
    $('#btRecarregar').onclick = function () { recarregarQuadro(slug); };
    $('#btFecharMod').onclick = function () {
      quadros[slug].remove(); delete quadros[slug]; delete statusSync[slug];
      location.hash = '#/';
    };
    desenharStatus();
    desenharMenu();
    recentes = [slug].concat(recentes.filter(function (s) { return s !== slug; })).slice(0, 6);
  }

  /* ======================= início ======================= */
  function cartao(m) {
    var etiq = !m.tem_arquivo ? '<span class="etiqueta vermelha">sem arquivo</span>' : !m.ativo ? '<span class="etiqueta cinza">desativada</span>' : '';
    return '<a class="cartao" href="#/m/' + esc(m.slug) + '">' +
      '<div class="cab"><div class="icone-mod">' + (IC[m.icone] || IC.app) + '</div><div style="flex:1;min-width:0"><span class="setor-cartao">' + esc(m.setor) + '</span><h3>' + esc(m.nome) + '</h3></div>' + etiq + '</div>' +
      '<p>' + esc(m.descricao) + '</p>' +
      '<div class="acoes"><span class="btn primary sm">Abrir</span><span class="espaco"></span>' +
      '<span class="btn ghost sm" data-nova="' + esc(m.slug) + '" title="Abrir em nova aba">' + IC.novaAba + ' Nova aba</span></div></a>';
  }

  function paginaInicio() {
    definirBarra('<span class="nome">Início</span>');
    var hora = new Date().getHours();
    var ola = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    var html = '<div class="pagina"><div class="saudacao"><div><h1>' + ola + ', ' + esc(eu.nome.split(' ')[0]) + '</h1>' +
      '<p class="sub" style="margin:0">Escolha uma ferramenta para começar. Você tem acesso a ' + modulos.length + ' ferramenta' + (modulos.length === 1 ? '' : 's') + '.</p></div></div>';
    var rt = resumoTickets;
    html += '<div class="atalho-tickets"><div class="icone-mod">' + IC.ticket + '</div><div style="flex:1;min-width:200px"><b style="font-family:var(--display)">Central de Tickets</b>' +
      '<span class="sec" style="display:block;color:var(--muted);font-weight:600;font-size:13px" id="iniTickets">' +
      (rt && souEquipe() ? rt.minha_fila + ' na sua fila' + (rt.minha_fila_atrasados ? ' · ⚠ ' + rt.minha_fila_atrasados + ' atrasado(s)' : '') + ' · ' + rt.sem_responsavel + ' sem responsável nos seus setores' : 'Precisa de algo de outro setor? Abra um ticket.') +
      '</span></div><a class="btn ghost sm" href="#/tickets">Ver tickets</a><button class="btn primary sm" id="btIniNovoT">' + IC.mais + 'Novo ticket</button></div>';
    var rec = recentes.map(function (s) { return modulos.find(function (m) { return m.slug === s; }); }).filter(Boolean);
    if (rec.length) {
      html += '<div class="grupo" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--faint);font-weight:800;margin-bottom:8px">Usadas recentemente</div><div class="recentes">' +
        rec.map(function (m) { return '<a class="chip" href="#/m/' + esc(m.slug) + '">' + (IC[m.icone] || IC.app) + esc(m.nome) + '</a>'; }).join('') + '</div>';
    }
    if (!modulos.length) {
      html += '<div class="vazio">Você ainda não tem acesso a nenhuma ferramenta.<br>Peça à administração para liberar as ferramentas do seu setor.</div>';
    }
    var grupos = porSetor(modulos);
    if (grupos.some(function (g) { return g.itens.length > 3; })) {
      // muitos módulos por setor: separa em seções
      grupos.forEach(function (g) {
        html += '<section class="secao-setor"><h2>' + esc(g.setor) + ' <span class="qtd">' + g.itens.length + '</span></h2><div class="cartoes">' + g.itens.map(cartao).join('') + '</div></section>';
      });
    } else if (modulos.length) {
      html += '<div class="cartoes">' + grupos.map(function (g) { return g.itens.map(cartao).join(''); }).join('') + '</div>';
    }
    html += '</div>';
    $('#conteudo').innerHTML = html;
    $('#btIniNovoT').onclick = novoTicket;
    $$('[data-nova]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); window.open('/m/' + b.getAttribute('data-nova') + '/', '_blank', 'noopener'); });
    });
  }

  /* ======================= minha conta ======================= */
  function paginaConta() {
    definirBarra('<span class="nome">Minha conta</span>');
    $('#conteudo').innerHTML = '<div class="pagina" style="max-width:640px"><h1>Minha conta</h1><p class="sub">' + esc(eu.nome) + ' · ' + esc(eu.email) + ' · ' + (eu.papel === 'admin' ? 'Administrador' : 'Usuário') + '</p>' +
      '<div class="painel" style="padding:20px"><form id="fSenha" class="pilha"><h3 style="margin:0;font-family:var(--display)">Trocar senha</h3>' +
      '<div id="msgSenha" class="msg" hidden></div>' +
      '<div><label class="rot" for="sAtual">Senha atual</label><input class="campo" id="sAtual" type="password" autocomplete="current-password" required></div>' +
      '<div class="grade-2"><div><label class="rot" for="sNova">Nova senha</label><input class="campo" id="sNova" type="password" autocomplete="new-password" required></div>' +
      '<div><label class="rot" for="sNova2">Repita a nova senha</label><input class="campo" id="sNova2" type="password" autocomplete="new-password" required></div></div>' +
      '<div class="ajuda" style="margin-top:-6px">Pelo menos 8 caracteres, com letras e números. Ao trocar, as sessões em outros aparelhos são encerradas.</div>' +
      '<div><button class="btn primary" type="submit">Salvar nova senha</button></div></form></div></div>';
    $('#fSenha').addEventListener('submit', async function (e) {
      e.preventDefault();
      var msg = $('#msgSenha');
      if ($('#sNova').value !== $('#sNova2').value) { msg.className = 'msg erro'; msg.textContent = 'As senhas não conferem.'; msg.hidden = false; return; }
      try {
        await api('POST', '/api/auth/senha', { atual: $('#sAtual').value, nova: $('#sNova').value });
        msg.className = 'msg ok'; msg.textContent = 'Senha alterada com sucesso.'; msg.hidden = false;
        e.target.reset();
      } catch (err) { msg.className = 'msg erro'; msg.textContent = err.message; msg.hidden = false; }
    });
  }

  /* ======================= admin: usuários ======================= */
  var cacheAdminModulos = null;
  async function carregarModulosAdmin() {
    var j = await api('GET', '/api/admin/modulos');
    cacheAdminModulos = j;
    return j;
  }

  function seletorModulos(listaMods, marcados, nomeCampo) {
    var html = '<div class="caixa-opcoes">';
    porSetor(listaMods.map(function (m) { return Object.assign({}, m, { setor: m.setor_nome || 'Outros', setor_ordem: m.setor_ordem == null ? 999 : m.setor_ordem }); })).forEach(function (g) {
      html += '<div class="grp"><input type="checkbox" data-grupo="' + esc(g.setor) + '" aria-label="Marcar todo o setor ' + esc(g.setor) + '">' + esc(g.setor) + '</div>';
      g.itens.forEach(function (m) {
        html += '<label><input type="checkbox" name="' + nomeCampo + '" value="' + esc(m.slug) + '" data-setor="' + esc(g.setor) + '"' + (marcados.indexOf(m.slug) >= 0 ? ' checked' : '') + '>' +
          '<span>' + esc(m.nome) + (m.ativo ? '' : ' <span class="etiqueta cinza">desativada</span>') + '</span></label>';
      });
    });
    return html + '</div>';
  }

  function ligarGrupos(raiz) {
    function sincronizar() {
      $$('[data-grupo]', raiz).forEach(function (g) {
        var itens = $$('input[data-setor="' + CSS.escape(g.getAttribute('data-grupo')) + '"]', raiz);
        var n = itens.filter(function (i) { return i.checked; }).length;
        g.checked = n === itens.length && n > 0; g.indeterminate = n > 0 && n < itens.length;
      });
    }
    $$('[data-grupo]', raiz).forEach(function (g) {
      g.addEventListener('change', function () {
        $$('input[data-setor="' + CSS.escape(g.getAttribute('data-grupo')) + '"]', raiz).forEach(function (i) { i.checked = g.checked; });
      });
    });
    $$('input[data-setor]', raiz).forEach(function (i) { i.addEventListener('change', sincronizar); });
    sincronizar();
  }

  function mostrarSenha(titulo, email, senha) {
    var m = modal({
      titulo: titulo,
      corpo: '<p style="margin:0 0 12px;font-weight:600">Envie estes dados para a pessoa por um canal seguro. Ela vai criar uma senha própria no primeiro acesso.</p>' +
        '<label class="rot">E-mail</label><div class="segredo" style="margin-bottom:12px">' + esc(email) + '</div>' +
        '<label class="rot">Senha temporária</label><div class="segredo">' + esc(senha) + '</div>' +
        '<p class="ajuda">Esta senha não será mostrada de novo.</p>',
      pe: '<button class="btn ghost" id="btCopiar">Copiar dados</button><button class="btn primary" data-fechar>Pronto</button>',
    });
    $('#btCopiar', m).onclick = function () {
      var txt = 'Portal MyBlue: ' + location.origin + '\nE-mail: ' + email + '\nSenha temporária: ' + senha;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Copiado.', 'ok'); }, function () { toast('Não foi possível copiar; selecione e copie manualmente.', 'erro'); });
    };
  }

  async function paginaUsuarios() {
    definirBarra('<span class="setor">Administração</span><span class="sep">/</span><span class="nome">Usuários e acessos</span>');
    $('#conteudo').innerHTML = '<div class="pagina"><div class="carregando" style="position:static;background:none"><div><div class="giro"></div>Carregando…</div></div></div>';
    var dados, mods;
    try { dados = await api('GET', '/api/admin/usuarios'); mods = (await carregarModulosAdmin()).modulos; } catch (e) { toast(e.message, 'erro'); return; }
    var nomeMod = {}; mods.forEach(function (m) { nomeMod[m.slug] = m.nome; });

    $('#conteudo').innerHTML = '<div class="pagina"><h1>Usuários e acessos</h1><p class="sub">Cadastre as pessoas da equipe e escolha quais ferramentas cada uma pode abrir.</p>' +
      '<div class="painel"><div class="cab-painel"><input class="campo" id="fUsu" placeholder="Buscar por nome ou e-mail…" style="max-width:320px">' +
      '<label class="linha" style="font-weight:700;font-size:13px;color:var(--muted)"><input type="checkbox" id="fInativos"> mostrar desativados</label><span class="espaco"></span>' +
      '<button class="btn primary" id="btNovoUsu">' + IC.mais + 'Novo usuário</button></div>' +
      '<div class="tabela-wrap"><table><thead><tr><th>Pessoa</th><th>Perfil</th><th>Ferramentas</th><th>Último acesso</th><th>Situação</th></tr></thead><tbody id="tbUsu"></tbody></table></div></div></div>';

    function desenhar() {
      var t = normal($('#fUsu').value);
      var inativos = $('#fInativos').checked;
      var lista = dados.usuarios.filter(function (u) { return (inativos || u.ativo) && (!t || normal(u.nome + ' ' + u.email).indexOf(t) >= 0); });
      $('#tbUsu').innerHTML = lista.map(function (u) {
        var ferr = u.papel === 'admin' ? '<span class="etiqueta azul">todas</span>' :
          u.modulos.length ? '<span title="' + esc(u.modulos.map(function (s) { return nomeMod[s] || s; }).join('\n')) + '">' + u.modulos.length + ' de ' + mods.length + '</span>' : '<span class="etiqueta ambar">nenhuma</span>';
        return '<tr class="clicavel" data-id="' + u.id + '"><td><b>' + esc(u.nome) + '</b><span class="sec">' + esc(u.email) + '</span></td>' +
          '<td>' + (u.papel === 'admin' ? 'Administrador' : 'Usuário') + (u.supervisor_tickets ? ' <span class="etiqueta azul">supervisão tickets</span>' : '') + (u.editor_links ? ' <span class="etiqueta azul">central de links</span>' : '') + '</td><td>' + ferr + '</td><td>' + quando(u.ultimo_login) + '</td>' +
          '<td>' + (!u.ativo ? '<span class="etiqueta cinza">desativado</span>' : u.trocar_senha ? '<span class="etiqueta ambar">aguardando 1º acesso</span>' : '<span class="etiqueta verde">ativo</span>') + '</td></tr>';
      }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--muted);font-weight:700;padding:30px">Nenhum usuário encontrado.</td></tr>';
      $$('#tbUsu tr[data-id]').forEach(function (tr) {
        tr.onclick = function () { editarUsuario(dados.usuarios.find(function (u) { return u.id === Number(tr.getAttribute('data-id')); })); };
      });
    }
    $('#fUsu').oninput = desenhar;
    $('#fInativos').onchange = desenhar;
    $('#btNovoUsu').onclick = function () { editarUsuario(null); };
    desenhar();

    function editarUsuario(u) {
      var novo = !u;
      u = u || { nome: '', email: '', papel: 'usuario', ativo: true, modulos: [] };
      var m = modal({
        titulo: novo ? 'Novo usuário' : 'Editar usuário', largo: true,
        corpo: '<form id="fU" class="pilha" novalidate><div class="grade-2">' +
          '<div><label class="rot" for="uNome">Nome</label><input class="campo" id="uNome" value="' + esc(u.nome) + '" required></div>' +
          '<div><label class="rot" for="uEmail">E-mail (login)</label><input class="campo" id="uEmail" type="email" value="' + esc(u.email) + '" required></div></div>' +
          '<div><label class="rot">Perfil</label><div class="grade-2">' +
          '<label class="opcao-radio"><input type="radio" name="uPapel" value="usuario"' + (u.papel !== 'admin' ? ' checked' : '') + '><div><b>Usuário</b><span>Abre só as ferramentas marcadas abaixo.</span></div></label>' +
          '<label class="opcao-radio"><input type="radio" name="uPapel" value="admin"' + (u.papel === 'admin' ? ' checked' : '') + '><div><b>Administrador</b><span>Acessa tudo e gerencia usuários, módulos e dados.</span></div></label></div></div>' +
          '<label class="opcao-radio" style="margin:0"><input type="checkbox" id="uSup"' + (u.supervisor_tickets ? ' checked' : '') + '><div><b>Supervisão / Coordenação da Central de Tickets</b>' +
          '<span>Vê os tickets de todos os setores e direciona: troca o responsável, transfere, muda situação, prioridade e prazo. Não dá acesso à administração do portal.</span></div></label>' +
          '<label class="opcao-radio" style="margin:0"><input type="checkbox" id="uLinks"' + (u.editor_links ? ' checked' : '') + '><div><b>Marketing — Central de Links</b>' +
          '<span>Troca o fundo da campanha do mês e edita os links da Central de Links. Não dá acesso à administração do portal.</span></div></label>' +
          '<div id="blocoMods"><label class="rot">Ferramentas liberadas</label>' + seletorModulos(mods, u.modulos, 'uMod') + '</div>' +
          (novo ? '<div><label class="rot" for="uSenha">Senha inicial (opcional)</label><input class="campo" id="uSenha" type="text" autocomplete="off" placeholder="Deixe em branco para gerar uma automaticamente"><div class="ajuda">A pessoa precisará trocar a senha no primeiro acesso.</div></div>' :
            '<label class="linha" style="font-weight:700"><input type="checkbox" id="uAtivo"' + (u.ativo ? ' checked' : '') + '> Usuário ativo (desmarque para bloquear o acesso)</label>') +
          '<div id="uMsg" class="msg erro" hidden></div></form>',
        pe: (novo ? '' : '<button class="btn ghost" id="btResetSenha" style="margin-right:auto">Redefinir senha</button>') +
          '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="btSalvarU">' + (novo ? 'Criar usuário' : 'Salvar') + '</button>',
      });
      ligarGrupos(m);
      function papelMudou() { $('#blocoMods', m).hidden = $('input[name=uPapel]:checked', m).value === 'admin'; }
      $$('input[name=uPapel]', m).forEach(function (r) { r.onchange = papelMudou; });
      papelMudou();
      $('#btSalvarU', m).onclick = async function () {
        var corpo = {
          nome: $('#uNome', m).value, email: $('#uEmail', m).value, papel: $('input[name=uPapel]:checked', m).value,
          modulos: $$('input[name=uMod]:checked', m).map(function (i) { return i.value; }),
          supervisor_tickets: $('#uSup', m).checked,
          editor_links: $('#uLinks', m).checked,
        };
        try {
          if (novo) {
            corpo.senha = $('#uSenha', m).value;
            var r = await api('POST', '/api/admin/usuarios', corpo);
            m.fechar();
            mostrarSenha('Usuário criado', corpo.email.trim().toLowerCase(), r.senha_temporaria);
          } else {
            corpo.ativo = $('#uAtivo', m).checked;
            await api('PATCH', '/api/admin/usuarios/' + u.id, corpo);
            m.fechar();
            toast('Usuário atualizado.', 'ok');
          }
          paginaUsuarios();
        } catch (e) { var x = $('#uMsg', m); x.textContent = e.message; x.hidden = false; }
      };
      if (!novo) {
        $('#btResetSenha', m).onclick = async function () {
          if (!(await confirmar('Redefinir senha', 'Será gerada uma senha temporária para <b>' + esc(u.nome) + '</b> e as sessões abertas dessa pessoa serão encerradas.', 'Redefinir'))) return;
          try {
            var r = await api('POST', '/api/admin/usuarios/' + u.id + '/senha', {});
            m.fechar();
            mostrarSenha('Senha redefinida', u.email, r.senha_temporaria);
          } catch (e) { toast(e.message, 'erro'); }
        };
      }
    }
  }

  /* ======================= admin: módulos ======================= */
  var ROTULO_ARM = {
    navegador: ['Só no navegador', 'Como era antes: cada pessoa vê apenas o que salvou no próprio computador.'],
    usuario: ['Banco do portal · por pessoa', 'Salvo no servidor, separado por usuário. Abre igual em qualquer computador.'],
    compartilhado: ['Banco do portal · equipe', 'Salvo no servidor e compartilhado: todos que têm acesso veem e editam os mesmos dados.'],
  };

  async function paginaModulos() {
    definirBarra('<span class="setor">Administração</span><span class="sep">/</span><span class="nome">Módulos e dados</span>');
    $('#conteudo').innerHTML = '<div class="pagina"><div class="carregando" style="position:static;background:none"><div><div class="giro"></div>Carregando…</div></div></div>';
    var j, setores, usuarios;
    try {
      j = await carregarModulosAdmin();
      setores = (await api('GET', '/api/admin/setores')).setores;
      usuarios = (await api('GET', '/api/admin/usuarios')).usuarios;
    } catch (e) { toast(e.message, 'erro'); return; }
    var mods = j.modulos;

    $('#conteudo').innerHTML = '<div class="pagina"><h1>Módulos e dados</h1><p class="sub">Cada módulo é uma das centrais de ferramentas (um arquivo HTML). Envie novas versões, escolha onde os dados ficam e quem pode abrir.</p>' +
      '<div class="painel"><div class="cab-painel"><b style="font-family:var(--display)">' + mods.length + ' módulos</b><span class="espaco"></span>' +
      '<button class="btn ghost" id="btSetores">Setores</button>' +
      '<button class="btn ghost" id="btLote">' + IC.enviar + 'Enviar vários HTMLs</button>' +
      '<button class="btn ghost" id="btBackup">' + IC.baixar + 'Backup do banco</button>' +
      '<button class="btn primary" id="btNovoMod">' + IC.mais + 'Novo módulo</button></div>' +
      '<div class="tabela-wrap"><table><thead><tr><th>Módulo</th><th>Setor</th><th>Arquivo</th><th>Onde ficam os dados</th><th>Situação</th></tr></thead><tbody>' +
      mods.map(function (m) {
        var dados = ROTULO_ARM[m.armazenamento][0];
        if (m.adaptador) dados = (m.fonte_dados === 'interno' ? '<span class="etiqueta verde">' + IC.banco + ' planilha no banco do portal</span>' : '<span class="etiqueta ambar">planilha Google</span>') + (m.armazenamento !== 'navegador' ? '<span class="sec">+ ' + esc(dados) + '</span>' : '');
        else dados = '<span class="etiqueta ' + (m.armazenamento === 'navegador' ? 'cinza' : 'verde') + '">' + esc(dados) + '</span>';
        return '<tr class="clicavel" data-slug="' + esc(m.slug) + '"><td><div class="linha" style="flex-wrap:nowrap"><div class="icone-mod" style="width:34px;height:34px">' + (IC[m.icone] || IC.app) + '</div><div><b>' + esc(m.nome) + '</b><span class="sec">/' + esc(m.slug) + '</span></div></div></td>' +
          '<td>' + esc(m.setor_nome || '—') + '</td>' +
          '<td>' + (m.tem_arquivo ? quando(m.versao_em) + '<span class="sec">' + tamanho(m.tamanho) + (m.nome_original ? ' · ' + esc(m.nome_original) : '') + '</span>' : '<span class="etiqueta vermelha">sem arquivo</span>') + '</td>' +
          '<td>' + dados + '</td><td>' + (m.ativo ? '<span class="etiqueta verde">ativo</span>' : '<span class="etiqueta cinza">desativado</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';

    $$('tr[data-slug]').forEach(function (tr) { tr.onclick = function () { editarModulo(mods.find(function (m) { return m.slug === tr.getAttribute('data-slug'); })); }; });
    $('#btNovoMod').onclick = novoModulo;
    $('#btSetores').onclick = gerirSetores;
    $('#btLote').onclick = envioEmLote;
    $('#btBackup').onclick = function () { location.href = '/api/admin/backup'; };

    function opcoesSetor(sel) {
      return '<option value="">— sem setor —</option>' + setores.map(function (s) { return '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.nome) + '</option>'; }).join('');
    }
    function opcoesIcone(sel) {
      return j.icones.map(function (i) { return '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + esc(ROTULO_ICONE[i] || i) + '</option>'; }).join('');
    }

    function novoModulo() {
      var m = modal({
        titulo: 'Novo módulo',
        corpo: '<form class="pilha" novalidate><p style="margin:0;color:var(--muted);font-weight:600">Use para publicar uma nova ferramenta HTML no portal. Depois de criar, envie o arquivo.</p>' +
          '<div class="grade-2"><div><label class="rot" for="nNome">Nome</label><input class="campo" id="nNome" placeholder="Ex.: Controle de Contratos"></div>' +
          '<div><label class="rot" for="nSlug">Identificador (endereço)</label><input class="campo" id="nSlug" placeholder="controle-contratos"><div class="ajuda">Letras minúsculas, números e hífen.</div></div></div>' +
          '<div class="grade-2"><div><label class="rot" for="nSetor">Setor</label><select class="campo" id="nSetor">' + opcoesSetor(null) + '</select></div>' +
          '<div><label class="rot" for="nIcone">Ícone</label><select class="campo" id="nIcone">' + opcoesIcone('app') + '</select></div></div>' +
          '<div><label class="rot" for="nDesc">Descrição</label><textarea class="campo" id="nDesc"></textarea></div>' +
          '<div id="nMsg" class="msg erro" hidden></div></form>',
        pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="btCriarMod">Criar módulo</button>',
      });
      $('#nNome', m).oninput = function () {
        if (!$('#nSlug', m).dataset.mexido) $('#nSlug', m).value = normal(this.value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
      };
      $('#nSlug', m).oninput = function () { this.dataset.mexido = '1'; };
      $('#btCriarMod', m).onclick = async function () {
        try {
          var r = await api('POST', '/api/admin/modulos', {
            nome: $('#nNome', m).value, slug: $('#nSlug', m).value, setor_id: $('#nSetor', m).value || null,
            icone: $('#nIcone', m).value, descricao: $('#nDesc', m).value, armazenamento: 'compartilhado',
          });
          m.fechar();
          toast('Módulo criado. Agora envie o HTML.', 'ok');
          await paginaModulos();
          var novo = cacheAdminModulos.modulos.find(function (x) { return x.slug === r.slug; });
          if (novo) editarModulo(novo);
          recarregarModulosUsuario();
        } catch (e) { var x = $('#nMsg', m); x.textContent = e.message; x.hidden = false; }
      };
    }

    function gerirSetores() {
      var m = modal({
        titulo: 'Setores',
        corpo: '<div class="pilha"><div class="caixa-opcoes" style="max-height:none">' + setores.map(function (s) {
          return '<div class="linha" style="padding:8px 12px;border-bottom:1px solid var(--border)"><input class="campo" style="flex:1" data-id="' + s.id + '" data-campo="nome" value="' + esc(s.nome) + '">' +
            '<input class="campo" style="width:80px" type="number" data-id="' + s.id + '" data-campo="ordem" value="' + s.ordem + '" title="Ordem">' +
            '<button class="btn icon danger" data-apagar="' + s.id + '" title="' + (s.tickets ? 'Setor com tickets: transfira-os antes' : 'Remover setor') + '"' + (s.modulos || s.tickets ? ' disabled' : '') + '>' + IC.fechar + '</button></div>';
        }).join('') + '</div><div class="linha"><input class="campo" id="novoSetor" placeholder="Novo setor" style="flex:1"><button class="btn ghost" id="btAddSetor">' + IC.mais + 'Adicionar</button></div>' +
          '<div class="ajuda">Só é possível remover setores sem módulos e sem tickets.</div></div>',
        pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="btSalvarSetores">Salvar</button>',
      });
      $('#btAddSetor', m).onclick = async function () {
        var nome = $('#novoSetor', m).value.trim();
        if (!nome) return;
        try { await api('POST', '/api/admin/setores', { nome: nome, ordem: setores.length + 1 }); m.fechar(); await paginaModulos(); gerirSetores(); } catch (e) { toast(e.message, 'erro'); }
      };
      $$('[data-apagar]', m).forEach(function (b) {
        b.onclick = async function () { try { await api('DELETE', '/api/admin/setores/' + b.getAttribute('data-apagar')); m.fechar(); await paginaModulos(); gerirSetores(); } catch (e) { toast(e.message, 'erro'); } };
      });
      $('#btSalvarSetores', m).onclick = async function () {
        try {
          for (var i = 0; i < setores.length; i++) {
            var s = setores[i];
            var nome = $('[data-id="' + s.id + '"][data-campo=nome]', m).value.trim();
            var ordem = Number($('[data-id="' + s.id + '"][data-campo=ordem]', m).value) || 0;
            if (nome !== s.nome || ordem !== s.ordem) await api('PATCH', '/api/admin/setores/' + s.id, { nome: nome, ordem: ordem });
          }
          m.fechar(); toast('Setores salvos.', 'ok'); paginaModulos(); recarregarModulosUsuario();
        } catch (e) { toast(e.message, 'erro'); }
      };
    }

    function envioEmLote() {
      var m = modal({
        titulo: 'Enviar vários HTMLs',
        corpo: '<p style="margin:0 0 14px;font-weight:600;color:var(--ink-2)">Selecione os arquivos das centrais. O portal reconhece cada um pelo título da página e publica no módulo certo.</p>' +
          '<label class="zona-envio" id="zLote">' + IC.enviar + '<div>Clique para escolher ou arraste os arquivos .html aqui</div><input type="file" accept=".html,.htm,text/html" multiple hidden id="inLote"></label>' +
          '<div id="resLote" class="pilha" style="margin-top:14px"></div>',
      });
      async function processar(arquivos) {
        var res = $('#resLote', m);
        for (var i = 0; i < arquivos.length; i++) {
          var f = arquivos[i];
          var linha = document.createElement('div');
          linha.className = 'msg aviso';
          linha.textContent = f.name + ': enviando…';
          res.appendChild(linha);
          try {
            var buf = await f.arrayBuffer();
            var rec = await api('POST', '/api/admin/modulos/reconhecer', buf, { bruto: true });
            if (!rec.slug) { linha.className = 'msg erro'; linha.textContent = f.name + ': não reconheci a qual módulo pertence. Envie pelo módulo, clicando nele na lista.'; continue; }
            var r = await api('PUT', '/api/admin/modulos/' + rec.slug + '/arquivo', buf, { bruto: true, headers: { 'X-Nome-Arquivo': encodeURIComponent(f.name) } });
            var mod = mods.find(function (x) { return x.slug === rec.slug; });
            linha.className = 'msg ok';
            linha.textContent = f.name + ' → publicado em "' + (mod ? mod.nome : rec.slug) + '"' + (r.aviso_banco ? ' (' + r.aviso_banco + ')' : '');
          } catch (e) { linha.className = 'msg erro'; linha.textContent = f.name + ': ' + e.message; }
        }
        recarregarModulosUsuario();
        m.querySelector('.modal-pe').innerHTML = '<button class="btn primary" id="btOkLote">Concluir</button>';
        $('#btOkLote', m).onclick = function () { m.fechar(); paginaModulos(); };
      }
      ligarZona($('#zLote', m), $('#inLote', m), processar);
    }

    function editarModulo(mod) {
      var usuNaoAdmin = usuarios.filter(function (u) { return u.papel !== 'admin'; });
      var colecoes = mod.config && mod.config.colecoes ? Object.keys(mod.config.colecoes) : [];
      var resumo = {}; (mod.dados_registros || []).forEach(function (r) { resumo[r.colecao] = r; });
      var armRes = mod.dados_armazenamento || [];

      var secPlanilha = '';
      if (mod.adaptador) {
        secPlanilha = '<h4 class="titulo-sec">Planilha da ferramenta</h4>' +
          '<p class="ajuda" style="margin-top:-4px">Esta ferramenta foi feita para gravar numa planilha Google (Apps Script). O portal tem uma planilha equivalente dentro do próprio banco.</p>' +
          '<div class="grade-2">' +
          '<label class="opcao-radio"><input type="radio" name="mFonte" value="google"' + (mod.fonte_dados !== 'interno' ? ' checked' : '') + '><div><b>Planilha Google (como hoje)</b><span>Continua lendo e gravando na planilha do Google.</span></div></label>' +
          '<label class="opcao-radio"><input type="radio" name="mFonte" value="interno"' + (mod.fonte_dados === 'interno' ? ' checked' : '') + '><div><b>Banco do portal</b><span>Lê e grava no banco do MyBlue, com login e histórico. Importe os dados antes de ativar.</span></div></label></div>' +
          '<div class="caixa-opcoes" style="max-height:none;margin-top:4px">' + colecoes.concat(Object.keys(resumo).filter(function (c) { return colecoes.indexOf(c) < 0; })).map(function (c) {
            var r = resumo[c];
            return '<div class="linha" style="padding:9px 12px;border-bottom:1px solid var(--border)"><b style="min-width:130px">' + esc(c) + '</b><span class="ajuda" style="margin:0">' + (r ? r.total + ' registro(s) · atualizado ' + quando(r.ultima) : 'vazio no banco do portal') + '</span><span class="espaco"></span>' +
              (r ? '<a class="btn ghost sm" href="/api/admin/modulos/' + esc(mod.slug) + '/dados/' + esc(c) + '.csv">' + IC.baixar + 'CSV</a>' : '') + '</div>';
          }).join('') + '</div>' +
          '<div class="pilha" style="margin-top:12px"><div><label class="rot" for="mGoogle">Link do Apps Script (termina em /exec)</label>' +
          '<div class="linha" style="flex-wrap:nowrap"><input class="campo" id="mGoogle" value="' + esc((mod.config && mod.config.google_url) || mod.google_url_detectada || '') + '" placeholder="https://script.google.com/macros/s/…/exec">' +
          '<button class="btn ghost" id="btImportar" type="button">' + IC.baixar + 'Importar da planilha</button></div>' +
          '<div class="ajuda">Copia todos os dados da planilha Google para o banco do portal (substitui o que já estiver no banco). A planilha Google não é alterada.</div></div>' +
          '<div id="resImport" class="pilha"></div></div>';
      }

      var m = modal({
        titulo: mod.nome, largo: true,
        corpo: '<style>.titulo-sec{font-family:var(--display);font-size:15px;margin:22px 0 10px;padding-top:18px;border-top:1px solid var(--border)}.titulo-sec:first-child{margin-top:0;padding-top:0;border-top:0}</style>' +
          '<div class="pilha">' +
          '<h4 class="titulo-sec">Dados gerais</h4>' +
          '<div class="grade-2"><div><label class="rot" for="mNome">Nome</label><input class="campo" id="mNome" value="' + esc(mod.nome) + '"></div>' +
          '<div><label class="rot" for="mSetor">Setor</label><select class="campo" id="mSetor">' + opcoesSetor(mod.setor_id) + '</select></div></div>' +
          '<div><label class="rot" for="mDesc">Descrição</label><textarea class="campo" id="mDesc">' + esc(mod.descricao) + '</textarea></div>' +
          '<div class="grade-3"><div><label class="rot" for="mIcone">Ícone</label><select class="campo" id="mIcone">' + opcoesIcone(mod.icone) + '</select></div>' +
          '<div><label class="rot" for="mOrdem">Ordem no setor</label><input class="campo" type="number" id="mOrdem" value="' + (mod.ordem || 0) + '"></div>' +
          '<div><label class="rot">Situação</label><label class="linha" style="font-weight:700;padding-top:9px"><input type="checkbox" id="mAtivo"' + (mod.ativo ? ' checked' : '') + '> Módulo ativo</label></div></div>' +

          '<h4 class="titulo-sec">Arquivo HTML</h4>' +
          '<p class="ajuda" style="margin-top:-4px">' + (mod.tem_arquivo ? 'Versão em uso enviada em ' + quando(mod.versao_em) + ' (' + tamanho(mod.tamanho) + ').' : '<b style="color:var(--red)">Nenhum arquivo enviado ainda.</b>') + ' Ao enviar um arquivo novo, a versão anterior fica guardada e pode ser restaurada.</p>' +
          '<label class="zona-envio" id="zArq">' + IC.enviar + '<div>Clique para escolher ou arraste o arquivo .html desta ferramenta</div><input type="file" accept=".html,.htm,text/html" hidden id="inArq"></label>' +
          '<div id="resArq"></div><details style="margin-top:4px"><summary style="cursor:pointer;font-weight:700;color:var(--ink-2)">Versões anteriores</summary><div id="listaVersoes" class="ajuda">Carregando…</div></details>' +

          '<h4 class="titulo-sec">Onde ficam os dados salvos pela ferramenta</h4>' +
          ['navegador', 'usuario', 'compartilhado'].map(function (k) {
            return '<label class="opcao-radio"><input type="radio" name="mArm" value="' + k + '"' + (mod.armazenamento === k ? ' checked' : '') + '><div><b>' + ROTULO_ARM[k][0] + '</b><span>' + ROTULO_ARM[k][1] + '</span></div></label>';
          }).join('') +
          (armRes.length ? '<div class="ajuda">No banco agora: ' + armRes.map(function (a) { return (a.escopo === '*' ? 'equipe' : 'usuário #' + a.escopo.slice(2)) + ' — ' + a.chaves + ' chave(s), ' + tamanho(a.bytes); }).join(' · ') + '</div>' : '') +
          '<details><summary style="cursor:pointer;font-weight:700;color:var(--ink-2)">Avançado: chaves que ficam só no navegador</summary><input class="campo" id="mLocais" style="margin-top:8px" value="' + esc(((mod.config && mod.config.chaves_locais) || []).join(', ')) + '" placeholder="^staticrypt, rascunho_">' +
          '<div class="ajuda">Expressões separadas por vírgula. Chaves que combinarem continuam apenas no navegador de cada pessoa.</div></details>' +
          secPlanilha +

          '<h4 class="titulo-sec">Quem pode abrir</h4>' +
          '<p class="ajuda" style="margin-top:-4px">Administradores sempre têm acesso.</p>' +
          (usuNaoAdmin.length ? '<div class="caixa-opcoes">' + usuNaoAdmin.map(function (u) {
            return '<label><input type="checkbox" name="mUsu" value="' + u.id + '"' + (mod.usuarios.indexOf(u.id) >= 0 ? ' checked' : '') + '><span>' + esc(u.nome) + ' <span class="sec" style="display:inline;color:var(--muted)">· ' + esc(u.email) + (u.ativo ? '' : ' · desativado') + '</span></span></label>';
          }).join('') + '</div>' : '<div class="ajuda">Nenhum usuário comum cadastrado ainda.</div>') +

          '<h4 class="titulo-sec">Cópia dos dados</h4>' +
          '<div class="linha"><a class="btn ghost sm" href="/api/admin/modulos/' + esc(mod.slug) + '/dados">' + IC.baixar + 'Exportar dados deste módulo (JSON)</a>' +
          '<button class="btn danger sm" id="btApagarMod" type="button">Remover módulo</button></div>' +
          '<div id="mMsg" class="msg erro" hidden></div></div>',
        pe: '<a class="btn ghost" href="#/m/' + esc(mod.slug) + '" id="btAbrirMod" style="margin-right:auto">' + IC.novaAba + 'Abrir</a><button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="btSalvarMod">Salvar</button>',
      });
      $('#btAbrirMod', m).onclick = function () { m.fechar(); };

      // versões
      api('GET', '/api/admin/modulos/' + mod.slug + '/versoes').then(function (r) {
        var el = $('#listaVersoes', m);
        if (!el) return;
        if (!r.versoes.length) { el.textContent = 'Nenhuma versão enviada.'; return; }
        el.innerHTML = '<div class="caixa-opcoes" style="margin-top:8px">' + r.versoes.map(function (v) {
          var emUso = v.id === mod.versao_id;
          return '<div class="linha" style="padding:8px 12px;border-bottom:1px solid var(--border)"><span style="flex:1;color:var(--ink-2)"><b>' + quando(v.enviado_em) + '</b> · ' + tamanho(v.tamanho) + (v.nome_original ? ' · ' + esc(v.nome_original) : '') + (v.enviado_por ? ' · por ' + esc(v.enviado_por) : '') + '</span>' +
            (emUso ? '<span class="etiqueta verde">em uso</span>' : '<button class="btn ghost sm" data-versao="' + v.id + '">Usar esta</button>') + '</div>';
        }).join('') + '</div>';
        $$('[data-versao]', el).forEach(function (b) {
          b.onclick = async function () {
            try { await api('POST', '/api/admin/modulos/' + mod.slug + '/versoes/' + b.getAttribute('data-versao') + '/usar'); toast('Versão restaurada.', 'ok'); m.fechar(); recarregarQuadro(mod.slug); paginaModulos(); } catch (e) { toast(e.message, 'erro'); }
          };
        });
      }).catch(function () {});

      // envio do arquivo
      ligarZona($('#zArq', m), $('#inArq', m), async function (arquivos) {
        var f = arquivos[0];
        var res = $('#resArq', m);
        res.innerHTML = '<div class="msg aviso" style="margin-top:8px">Enviando ' + esc(f.name) + '…</div>';
        try {
          var r = await api('PUT', '/api/admin/modulos/' + mod.slug + '/arquivo', await f.arrayBuffer(), { bruto: true, headers: { 'X-Nome-Arquivo': encodeURIComponent(f.name) } });
          if (r.fonte_dados) {
            // o HTML já não usa planilha Google: a janela acompanha a mudança feita no servidor
            var radio = $('input[name=mFonte][value="' + r.fonte_dados + '"]', m);
            if (radio) radio.checked = true;
            mod.fonte_dados = r.fonte_dados;
          }
          res.innerHTML = '<div class="msg ok" style="margin-top:8px">Arquivo publicado. Quem abrir a ferramenta já recebe a nova versão.' +
            (r.fonte_dados === 'interno' ? ' Este arquivo não usa planilha Google: o módulo passou para <b>Banco do portal</b>.' : '') + '</div>' +
            (r.aviso ? '<div class="msg aviso" style="margin-top:8px">' + esc(r.aviso) + '</div>' : '') +
            (r.aviso_banco ? '<div class="msg aviso" style="margin-top:8px">' + esc(r.aviso_banco) + '</div>' : '');
          recarregarQuadro(mod.slug);
          recarregarModulosUsuario();
        } catch (e) { res.innerHTML = '<div class="msg erro" style="margin-top:8px">' + esc(e.message) + '</div>'; }
      });

      // importação da planilha Google
      if (mod.adaptador) {
        $('#btImportar', m).onclick = async function () {
          var url = $('#mGoogle', m).value.trim();
          if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) { toast('Informe o link do Apps Script (https://script.google.com/…/exec).', 'erro'); return; }
          if (!(await confirmar('Importar da planilha Google', 'Os dados atuais do banco do portal para este módulo serão <b>substituídos</b> pelo conteúdo da planilha. A planilha Google não é alterada.', 'Importar'))) return;
          var res = $('#resImport', m);
          res.innerHTML = '';
          var lista = colecoes.length ? colecoes : [mod.config.colecao_padrao || 'dados'];
          for (var i = 0; i < lista.length; i++) {
            var c = lista[i];
            var linha = document.createElement('div');
            linha.className = 'msg aviso'; linha.textContent = c + ': lendo a planilha…';
            res.appendChild(linha);
            try {
              // a aba padrão é lida sem o parâmetro "sheet", exatamente como a ferramenta faz
              var ehPadrao = mod.adaptador !== 'gas-objetos' && c === mod.config.colecao_padrao;
              var dados = await lerJsonp(ehPadrao ? url : url + (url.indexOf('?') >= 0 ? '&' : '?') + 'sheet=' + encodeURIComponent(c));
              if (!Array.isArray(dados)) throw new Error('a planilha não devolveu uma lista (verifique o link).');
              var r = await api('POST', '/api/admin/modulos/' + mod.slug + '/importar', { colecao: c, dados: dados });
              linha.className = 'msg ok'; linha.textContent = c + ': ' + r.total + ' registro(s) importado(s).';
            } catch (e) { linha.className = 'msg erro'; linha.textContent = c + ': ' + e.message; }
          }
          await api('PATCH', '/api/admin/modulos/' + mod.slug, { google_url: url }).catch(function () {});
          toast('Importação concluída. Confira os números e ative "Banco do portal" quando quiser.', 'ok');
        };
      }

      $('#btApagarMod', m).onclick = async function () {
        var conf = prompt('Isso remove o módulo, os arquivos enviados e TODOS os dados dele no banco. Para confirmar, digite: ' + mod.slug);
        if (conf !== mod.slug) { if (conf !== null) toast('Identificador não confere. Nada foi removido.', 'erro'); return; }
        try { await api('DELETE', '/api/admin/modulos/' + mod.slug + '?confirmar=' + encodeURIComponent(conf)); m.fechar(); toast('Módulo removido.', 'ok'); paginaModulos(); recarregarModulosUsuario(); } catch (e) { toast(e.message, 'erro'); }
      };

      $('#btSalvarMod', m).onclick = async function () {
        var arm = $('input[name=mArm]:checked', m).value;
        var fonte = mod.adaptador ? $('input[name=mFonte]:checked', m).value : undefined;
        var avisos = [];
        if (arm !== mod.armazenamento) avisos.push('Mudar onde os dados ficam faz a ferramenta começar a usar outro local: o que estava salvo no local anterior não é copiado automaticamente.');
        if (fonte && fonte !== mod.fonte_dados) avisos.push(fonte === 'interno' ? 'A ferramenta passará a gravar no banco do portal. Confira se os dados da planilha Google já foram importados.' : 'A ferramenta voltará a gravar na planilha Google. O que foi lançado no banco do portal não é enviado para a planilha.');
        if (avisos.length && !(await confirmar('Confirmar mudança', avisos.join('<br><br>'), 'Salvar mesmo assim'))) return;
        try {
          await api('PATCH', '/api/admin/modulos/' + mod.slug, {
            nome: $('#mNome', m).value, descricao: $('#mDesc', m).value, setor_id: $('#mSetor', m).value || null,
            icone: $('#mIcone', m).value, ordem: Number($('#mOrdem', m).value) || 0, ativo: $('#mAtivo', m).checked,
            armazenamento: arm, fonte_dados: fonte,
            chaves_locais: $('#mLocais', m).value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
            usuarios: $$('input[name=mUsu]:checked', m).map(function (i) { return Number(i.value); }),
          });
          m.fechar(); toast('Módulo salvo.', 'ok');
          if (arm !== mod.armazenamento || fonte !== mod.fonte_dados) recarregarQuadro(mod.slug);
          paginaModulos(); recarregarModulosUsuario();
        } catch (e) { var x = $('#mMsg', m); x.textContent = e.message; x.hidden = false; }
      };
    }
  }

  function ligarZona(zona, input, aoEscolher) {
    input.onchange = function () { if (input.files.length) aoEscolher(Array.prototype.slice.call(input.files)); input.value = ''; };
    zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.classList.add('arrastando'); });
    zona.addEventListener('dragleave', function () { zona.classList.remove('arrastando'); });
    zona.addEventListener('drop', function (e) {
      e.preventDefault(); zona.classList.remove('arrastando');
      var fs = Array.prototype.slice.call(e.dataTransfer.files).filter(function (f) { return /\.html?$/i.test(f.name); });
      if (fs.length) aoEscolher(fs); else toast('Envie arquivos .html', 'erro');
    });
  }

  function lerJsonp(url) {
    return new Promise(function (resolve, reject) {
      var nome = 'mbImp' + Date.now() + Math.floor(Math.random() * 1e6);
      var s = document.createElement('script');
      var t = setTimeout(function () { limpar(); reject(new Error('a planilha não respondeu (tempo esgotado).')); }, 30000);
      function limpar() { clearTimeout(t); try { delete window[nome]; } catch (e) { window[nome] = undefined; } s.remove(); }
      window[nome] = function (d) { limpar(); resolve(d); };
      s.onerror = function () { limpar(); reject(new Error('não foi possível acessar a planilha (link ou permissão).')); };
      s.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + nome + '&t=' + Date.now();
      document.body.appendChild(s);
    });
  }

  function recarregarQuadro(slug) {
    var f = quadros[slug];
    if (!f) return;
    try { f.contentWindow.location.reload(); } catch (e) { f.src = '/m/' + encodeURIComponent(slug) + '/'; }
  }

  async function recarregarModulosUsuario() {
    try { var j = await api('GET', '/api/modulos'); modulos = j.modulos; desenharMenu(); } catch (e) { /* ignora */ }
  }

  /* ======================= Central de Tickets ======================= */
  var ST_TICKET = {
    novo: ['Novo', 'azul'], em_andamento: ['Em andamento', 'ambar'], aguardando: ['Aguardando', 'cinza'],
    resolvido: ['Resolvido', 'verde'], cancelado: ['Cancelado', 'cinza'],
  };
  var PRIO = { urgente: ['Urgente', 'vermelha'], alta: ['Alta', 'ambar'], media: ['Média', 'azul'], baixa: ['Baixa', 'cinza'] };
  var ROTULO_STATUS_AJUDA = {
    novo: 'Na fila do setor, ainda sem tratamento.', em_andamento: 'Alguém do setor está tratando.',
    aguardando: 'Parado esperando retorno de quem abriu ou de terceiros.', resolvido: 'Demanda atendida.', cancelado: 'Não será atendido.',
  };
  var metaTickets = null;
  var resumoTickets = null;

  function etq(par) { return '<span class="etiqueta ' + par[1] + '">' + esc(par[0]) + '</span>'; }
  function etqStatus(s) { return etq(ST_TICKET[s] || [s, 'cinza']); }
  function etqPrio(p) { return etq(PRIO[p] || [p, 'cinza']); }
  function numTicket(id) { return '#' + id; }
  function duracao(ms) {
    var h = Math.abs(ms) / 3600000;
    if (h < 1) return Math.max(1, Math.round(h * 60)) + ' min';
    if (h < 48) return Math.round(h) + ' h';
    return Math.round(h / 24) + ' dias';
  }
  /* prazo em horas de expediente: "4 h úteis", "1 dia útil", "3 dias úteis" */
  function horasUteis(h) {
    var dia = (metaTickets && metaTickets.expediente && metaTickets.expediente.horasDia) || 9;
    if (h == null) return '—';
    if (h % dia === 0) return (h / dia) + (h / dia === 1 ? ' dia útil' : ' dias úteis');
    return h + ' h úteis';
  }
  function textoExpediente() {
    var e = metaTickets && metaTickets.expediente;
    if (!e) return 'horário de expediente';
    var nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    var dias = e.dias.join(',') === '1,2,3,4,5' ? 'seg–sex' : e.dias.map(function (d) { return nomes[d]; }).join(', ');
    return dias + ', ' + e.inicio + 'h–' + e.fim + 'h';
  }
  function horas(h) { return h == null ? '—' : h < 1 ? Math.max(1, Math.round(h * 60)) + ' min' : h < 48 ? String(h).replace('.', ',') + ' h' : (Math.round(h / 24 * 10) / 10).toString().replace('.', ',') + ' dias'; }
  /* prazo com aviso de atraso (sempre com texto, nunca só cor) */
  function prazoTxt(t) {
    if (!t.prazo) return '<span class="sec">sem prazo</span>';
    var falta = new Date(t.prazo) - Date.now();
    var aberto = ['novo', 'em_andamento', 'aguardando'].indexOf(t.status) >= 0;
    if (!aberto) return '<span title="' + esc(quando(t.prazo)) + '">' + quando(t.prazo) + '</span>';
    if (falta < 0) return '<span class="etiqueta vermelha" title="Prazo: ' + esc(quando(t.prazo)) + '">⚠ atrasado ' + duracao(falta) + '</span>';
    return '<span title="Prazo: ' + esc(quando(t.prazo)) + '"' + (falta < 4 * 3600000 ? ' class="etiqueta ambar"' : '') + '>vence em ' + duracao(falta) + '</span>';
  }
  function localInput(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function carregandoHtml() { return '<div class="pagina"><div class="carregando" style="position:static;background:none"><div><div class="giro"></div>Carregando…</div></div></div>'; }

  async function carregarMeta(forcar) {
    if (!metaTickets || forcar) metaTickets = await api('GET', '/api/tickets/meta');
    return metaTickets;
  }
  function meusSetores() { return (metaTickets ? metaTickets.setores : []).filter(function (s) { return s.meu; }); }
  function gestorTickets() { return eu.papel === 'admin' || !!eu.supervisor_tickets; }
  function souEquipe() { return gestorTickets() || meusSetores().length > 0; }

  /* ---------- avisos: sino, som e alerta do navegador ---------- */
  var avisosCache = { notificacoes: [], nao_lidas: 0 };
  var ultimoAviso = lembrar('avisos.ultimo', 0);
  var audioCtx = null;
  document.addEventListener('pointerdown', function () {
    // o navegador só libera som depois de um clique na página
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* sem som */ } }
  }, { once: true });
  function tocarSom() {
    if (!lembrar('avisos.som', true) || !audioCtx) return;
    try {
      [[880, 0], [1320, 0.16]].forEach(function (n) {
        var o = audioCtx.createOscillator(); var g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + n[1]);
        g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + n[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + n[1] + 0.3);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(audioCtx.currentTime + n[1]); o.stop(audioCtx.currentTime + n[1] + 0.32);
      });
    } catch (e) { /* sem som */ }
  }
  function alertaNavegador(n) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      var a = new Notification(n.titulo, { body: n.texto || '', icon: '/img/icone.png', tag: 'myblue-' + n.id });
      a.onclick = function () { window.focus(); if (n.ticket_id) location.hash = '#/tickets/' + n.ticket_id; a.close(); };
    } catch (e) { /* navegador sem suporte */ }
  }
  function desenharSino() {
    var b = $('#btSino');
    if (!b) return;
    var n = avisosCache.nao_lidas;
    b.innerHTML = IC.sino + (n ? '<i class="contador-sino">' + (n > 99 ? '99+' : n) + '</i>' : '');
    b.title = n ? n + ' aviso(s) não lido(s)' : 'Avisos';
  }
  async function buscarAvisos() {
    var r;
    try { r = await api('GET', '/api/notificacoes'); } catch (e) { return; }
    var novos = r.notificacoes.filter(function (n) { return n.id > ultimoAviso && !n.lida; });
    var primeiraVez = lembrar('avisos.ultimo', null) === null;
    avisosCache = r;
    if (r.notificacoes.length) ultimoAviso = Math.max(ultimoAviso, r.notificacoes[0].id);
    guardar('avisos.ultimo', ultimoAviso);
    if (novos.length && !primeiraVez) {
      tocarSom();
      novos.slice(0, 3).forEach(alertaNavegador);
      if (novos.length === 1) toast(novos[0].titulo, 'ok');
      else toast(novos.length + ' novos avisos de tickets.', 'ok');
    }
    desenharSino();
  }
  function abrirAvisos() {
    var suporta = 'Notification' in window;
    var perm = suporta ? Notification.permission : 'denied';
    var m = modal({
      titulo: 'Avisos',
      corpo: '<div class="pilha">' +
        '<div class="linha">' + (suporta && perm !== 'granted' ? '<button class="btn ghost sm" id="btPermitir"' + (perm === 'denied' ? ' disabled title="Bloqueado no navegador: libere nas configurações do site"' : '') + '>Ativar alertas no computador</button>' :
          suporta ? '<span class="etiqueta verde">alertas do computador ativos</span>' : '') +
        '<label class="linha" style="font-weight:700;font-size:13px;color:var(--muted)"><input type="checkbox" id="avSom"' + (lembrar('avisos.som', true) ? ' checked' : '') + '> tocar som</label>' +
        '<span class="espaco"></span><button class="btn ghost sm" id="btLerTodos">Marcar todos como lidos</button></div>' +
        (avisosCache.email_ativo === false ? '<div class="ajuda" style="margin-top:-6px">O envio de e-mails ainda não foi configurado no servidor: por enquanto os avisos aparecem só aqui.</div>' : '') +
        '<div class="lista-avisos">' + (avisosCache.notificacoes.map(function (n) {
          return '<a href="' + (n.ticket_id ? '#/tickets/' + n.ticket_id : '#/tickets') + '" class="aviso' + (n.lida ? '' : ' nao-lido') + '" data-id="' + n.id + '">' +
            '<b>' + esc(n.titulo) + '</b><span>' + esc(n.texto || '') + '</span><span class="sec">' + quando(n.criado_em) + '</span></a>';
        }).join('') || '<div class="vazio" style="padding:24px">Nenhum aviso por enquanto.</div>') + '</div></div>',
    });
    $('#avSom', m).onchange = function () { guardar('avisos.som', this.checked); if (this.checked && audioCtx) tocarSom(); };
    if ($('#btPermitir', m)) $('#btPermitir', m).onclick = function () {
      Notification.requestPermission().then(function (p) { if (p === 'granted') { toast('Alertas ativados neste computador.', 'ok'); m.fechar(); abrirAvisos(); } });
    };
    $('#btLerTodos', m).onclick = async function () {
      try { await api('POST', '/api/notificacoes/lidas', { todas: true }); m.fechar(); buscarAvisos(); } catch (e) { toast(e.message, 'erro'); }
    };
    $$('.aviso', m).forEach(function (a) { a.addEventListener('click', function () { m.fechar(); setTimeout(buscarAvisos, 800); }); });
  }

  async function atualizarResumo() {
    try { resumoTickets = await api('GET', '/api/tickets/resumo'); } catch (e) { return; }
    var b = $('#nav [data-contador=fila]');
    if (b) {
      var n = resumoTickets.minha_fila;
      b.textContent = n;
      b.hidden = !n;
      b.className = 'contador' + (resumoTickets.minha_fila_atrasados ? ' alerta' : '');
      b.title = n + ' na sua fila' + (resumoTickets.minha_fila_atrasados ? ' · ' + resumoTickets.minha_fila_atrasados + ' atrasado(s)' : '');
    }
  }

  async function enviarAnexo(ticketId, arquivo, interno) {
    var r = await fetch('/api/tickets/' + ticketId + '/anexos', {
      method: 'POST', credentials: 'same-origin', body: arquivo,
      headers: { 'Content-Type': arquivo.type || 'application/octet-stream', 'X-Nome-Arquivo': encodeURIComponent(arquivo.name), 'X-Interno': interno ? '1' : '0' },
    });
    if (r.status === 413) throw new Error('"' + arquivo.name + '" passa do tamanho máximo permitido.');
    if (!r.ok) { var j = {}; try { j = await r.json(); } catch (e) { /* sem JSON */ } throw new Error(j.erro || 'Falha ao enviar ' + arquivo.name); }
  }
  async function enviarAnexos(ticketId, arquivos, interno) {
    var falhas = [];
    for (var i = 0; i < arquivos.length; i++) {
      try { await enviarAnexo(ticketId, arquivos[i], interno); } catch (e) { falhas.push(e.message); }
    }
    if (falhas.length) toast(falhas.join(' '), 'erro');
  }

  /* ---------- novo ticket ---------- */
  async function novoTicket() {
    var meta;
    try { meta = await carregarMeta(); } catch (e) { toast(e.message, 'erro'); return; }
    var m = modal({
      titulo: 'Novo ticket', largo: true,
      corpo: '<form id="fT" class="pilha" novalidate>' +
        '<div class="grade-2"><div><label class="rot" for="tSetor">Para qual setor?</label><select class="campo" id="tSetor"><option value="">Escolha o setor…</option>' +
        meta.setores.map(function (s) { return '<option value="' + s.id + '">' + esc(s.nome) + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="rot" for="tCat">Tipo de demanda</label><select class="campo" id="tCat" disabled><option value="">Escolha o setor primeiro</option></select></div></div>' +
        '<div><label class="rot" for="tTitulo">Assunto</label><input class="campo" id="tTitulo" maxlength="160" placeholder="Resumo da demanda em uma linha"></div>' +
        '<div><label class="rot" for="tDesc">Descrição</label><textarea class="campo" id="tDesc" rows="6" maxlength="10000" placeholder="O que precisa ser feito, condomínio/unidade, valores, datas… Quanto mais detalhe, mais rápido o atendimento."></textarea></div>' +
        '<div class="grade-2"><div><label class="rot" for="tPrio">Prioridade</label><select class="campo" id="tPrio">' +
        ['baixa', 'media', 'alta', 'urgente'].map(function (p) { return '<option value="' + p + '"' + (p === 'media' ? ' selected' : '') + '>' + PRIO[p][0] + '</option>'; }).join('') + '</select>' +
        '<div class="ajuda" id="tPrazo"></div></div>' +
        '<div><label class="rot" for="tArq">Anexos (opcional)</label><input class="campo" id="tArq" type="file" multiple></div></div>' +
        '<div id="tMsg" class="msg erro" hidden></div></form>',
      pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="btCriarT">Abrir ticket</button>',
    });
    function setor() { return meta.setores.find(function (s) { return String(s.id) === $('#tSetor', m).value; }); }
    function prazoAjuda() {
      var s = setor();
      var c = s && s.categorias.find(function (x) { return String(x.id) === $('#tCat', m).value; });
      var h = c && c.prazo_horas ? c.prazo_horas : meta.prazo_padrao_horas[$('#tPrio', m).value];
      $('#tPrazo', m).textContent = 'Prazo de atendimento: ' + horasUteis(h) + (c && c.prazo_horas ? ' (definido para este tipo de demanda)' : '') + ', contando só o expediente (' + textoExpediente() + ').';
    }
    $('#tSetor', m).onchange = function () {
      var s = setor();
      var sel = $('#tCat', m);
      sel.disabled = !s || !s.categorias.length;
      sel.innerHTML = !s ? '<option value="">Escolha o setor primeiro</option>' : !s.categorias.length ? '<option value="">Este setor não tem tipos cadastrados</option>' :
        '<option value="">Outro / não sei</option>' + s.categorias.map(function (c) { return '<option value="' + c.id + '">' + esc(c.nome) + '</option>'; }).join('');
      prazoAjuda();
    };
    $('#tCat', m).onchange = function () {
      var s = setor();
      var c = s && s.categorias.find(function (x) { return String(x.id) === $('#tCat', m).value; });
      if (c) $('#tPrio', m).value = c.prioridade;
      prazoAjuda();
    };
    $('#tPrio', m).onchange = prazoAjuda;
    prazoAjuda();
    $('#btCriarT', m).onclick = async function () {
      var bt = this;
      var msg = $('#tMsg', m);
      if (!$('#tSetor', m).value) { msg.textContent = 'Escolha o setor que vai atender.'; msg.hidden = false; return; }
      if (!$('#tTitulo', m).value.trim()) { msg.textContent = 'Informe o assunto.'; msg.hidden = false; return; }
      bt.disabled = true;
      try {
        var r = await api('POST', '/api/tickets', {
          setor_id: Number($('#tSetor', m).value), categoria_id: $('#tCat', m).value ? Number($('#tCat', m).value) : null,
          prioridade: $('#tPrio', m).value, titulo: $('#tTitulo', m).value, descricao: $('#tDesc', m).value,
        });
        var arqs = Array.prototype.slice.call($('#tArq', m).files);
        if (arqs.length) await enviarAnexos(r.id, arqs, false);
        m.fechar();
        toast('Ticket ' + numTicket(r.id) + ' aberto.', 'ok');
        location.hash = '#/tickets/' + r.id;
      } catch (e) { msg.textContent = e.message; msg.hidden = false; bt.disabled = false; }
    };
  }

  /* ---------- lista / filas ---------- */
  var VISOES = [
    ['minha', 'Minha fila', 'Tickets em que você é o responsável.'],
    ['setor', 'Fila do setor', 'Tudo o que chegou para os setores de que você faz parte.'],
    ['abertos', 'Abertos por mim', 'Demandas que você pediu para outros setores.'],
    ['todos', 'Todos', 'Todos os tickets de todos os setores (administração e supervisão).'],
  ];

  async function paginaTickets(visao) {
    try { await carregarMeta(); } catch (e) { toast(e.message, 'erro'); }
    var visoes = VISOES.filter(function (v) { return (v[0] !== 'todos' || gestorTickets()) && (v[0] !== 'setor' || souEquipe()) && (v[0] !== 'minha' || souEquipe()); });
    if (!visoes.some(function (v) { return v[0] === visao; })) visao = visoes[0][0];
    guardar('tickets.visao', visao);
    var filtros = lembrar('tickets.filtros.' + visao, { status: 'abertos', setor: '', q: '', atrasados: false, semResp: false });
    definirBarra('<span class="setor">Central de Tickets</span><span class="sep">/</span><span class="nome">' + esc(visoes.find(function (v) { return v[0] === visao; })[1]) + '</span>');
    var setoresFiltro = visao === 'setor' && !gestorTickets() ? meusSetores() : (metaTickets ? metaTickets.setores : []);
    $('#conteudo').innerHTML = '<div class="pagina"><h1>Central de Tickets</h1><p class="sub">Demandas entre os setores: abra, acompanhe e trate tudo em um só lugar.</p>' +
      '<nav class="abas">' + visoes.map(function (v) { return '<a href="#/tickets/fila/' + v[0] + '" class="' + (v[0] === visao ? 'on' : '') + '" title="' + esc(v[2]) + '">' + esc(v[1]) + '</a>'; }).join('') + '</nav>' +
      '<div class="painel"><div class="cab-painel">' +
      '<input class="campo" id="fTq" type="search" placeholder="Buscar por nº ou assunto…" style="max-width:260px" value="' + esc(filtros.q) + '">' +
      '<select class="campo" id="fTst" style="max-width:170px"><option value="abertos">Em aberto</option><option value="todos">Todas as situações</option>' +
      Object.keys(ST_TICKET).map(function (k) { return '<option value="' + k + '">' + ST_TICKET[k][0] + '</option>'; }).join('') + '</select>' +
      (visao === 'minha' ? '' : '<select class="campo" id="fTse" style="max-width:200px"><option value="">Todos os setores</option>' +
        setoresFiltro.map(function (s) { return '<option value="' + s.id + '">' + esc(s.nome) + '</option>'; }).join('') + '</select>') +
      '<label class="linha" style="font-weight:700;font-size:13px;color:var(--muted)"><input type="checkbox" id="fTat"> só atrasados</label>' +
      (visao === 'setor' || visao === 'todos' ? '<label class="linha" style="font-weight:700;font-size:13px;color:var(--muted)"><input type="checkbox" id="fTsr"> sem responsável</label>' : '') +
      '<span class="espaco"></span><button class="btn primary" id="btNovoTicket">' + IC.mais + 'Novo ticket</button></div>' +
      '<div class="tabela-wrap"><table><thead><tr><th>Nº</th><th>Assunto</th><th>Setor</th><th>Prioridade</th><th>Situação</th><th>' + (visao === 'minha' ? 'Aberto por' : 'Responsável') + '</th><th>Prazo</th></tr></thead>' +
      '<tbody id="tbT"></tbody></table></div></div></div>';
    $('#fTst').value = filtros.status;
    if ($('#fTse')) $('#fTse').value = filtros.setor;
    $('#fTat').checked = !!filtros.atrasados;
    if ($('#fTsr')) $('#fTsr').checked = !!filtros.semResp;
    $('#btNovoTicket').onclick = novoTicket;

    var seq = 0;
    async function carregar() {
      filtros = { status: $('#fTst').value, setor: $('#fTse') ? $('#fTse').value : '', q: $('#fTq').value.trim(), atrasados: $('#fTat').checked, semResp: $('#fTsr') ? $('#fTsr').checked : false };
      guardar('tickets.filtros.' + visao, filtros);
      var q = '?vis=' + visao + '&status=' + filtros.status + (filtros.setor ? '&setor=' + filtros.setor : '') + (filtros.q ? '&q=' + encodeURIComponent(filtros.q) : '') +
        (filtros.atrasados ? '&atrasados=1' : '') + (filtros.semResp ? '&responsavel=nenhum' : '');
      var meu = ++seq;
      var r;
      try { r = await api('GET', '/api/tickets' + q); } catch (e) { toast(e.message, 'erro'); return; }
      if (meu !== seq) return;
      $('#tbT').innerHTML = r.tickets.map(function (t) {
        var pessoa = visao === 'minha' ? esc(t.solicitante_nome || '—') : t.responsavel_nome ? esc(t.responsavel_nome) : '<span class="etiqueta ambar">sem responsável</span>';
        return '<tr class="clicavel" data-id="' + t.id + '"><td class="num" style="text-align:left;white-space:nowrap"><b>' + numTicket(t.id) + '</b></td>' +
          '<td><b>' + esc(t.titulo) + '</b><span class="sec">' + (t.categoria_nome ? esc(t.categoria_nome) + ' · ' : '') + 'aberto por ' + esc(t.solicitante_nome || '—') + ' em ' + quando(t.criado_em) +
          (t.comentarios ? ' · ' + t.comentarios + ' comentário' + (t.comentarios === 1 ? '' : 's') : '') + '</span></td>' +
          '<td>' + esc(t.setor_nome) + '</td><td>' + etqPrio(t.prioridade) + '</td><td>' + etqStatus(t.status) + '</td><td>' + pessoa + '</td><td style="white-space:nowrap">' + prazoTxt(t) + '</td></tr>';
      }).join('') || '<tr><td colspan="7"><div class="vazio" style="border:0;padding:34px">' +
        (visao === 'minha' ? 'Nada na sua fila agora.' : visao === 'abertos' ? 'Você ainda não abriu tickets com estes filtros.' : 'Nenhum ticket com estes filtros.') + '</div></td></tr>';
      $$('#tbT tr[data-id]').forEach(function (tr) { tr.onclick = function () { location.hash = '#/tickets/' + tr.getAttribute('data-id'); }; });
    }
    var espera;
    $('#fTq').oninput = function () { clearTimeout(espera); espera = setTimeout(carregar, 300); };
    $$('#fTst,#fTse,#fTat,#fTsr').forEach(function (el) { el.onchange = carregar; });
    carregar();
    atualizarResumo();
  }

  /* ---------- detalhe ---------- */
  function textoEvento(e) {
    var d = e.detalhe || {};
    switch (e.tipo) {
      case 'criado': return 'abriu o ticket para <b>' + esc(d.setor || '') + '</b>';
      case 'status': return 'mudou a situação de ' + etqStatus(d.de) + ' para ' + etqStatus(d.para);
      case 'atribuicao': return d.para ? 'atribuiu a <b>' + esc(d.para) + '</b>' : 'devolveu o ticket para a fila do setor';
      case 'transferencia': return 'transferiu de <b>' + esc(d.de || '') + '</b> para <b>' + esc(d.para || '') + '</b>' + (d.categoria ? ' (' + esc(d.categoria) + ')' : '');
      case 'prioridade': return 'mudou a prioridade de ' + etqPrio(d.de) + ' para ' + etqPrio(d.para);
      case 'prazo': return 'mudou o prazo para <b>' + (d.para ? quando(d.para) : 'sem prazo') + '</b>';
      case 'anexo': return 'anexou <b>' + esc(d.nome || 'arquivo') + '</b>';
      default: return esc(e.tipo);
    }
  }

  async function paginaTicket(id) {
    definirBarra('<span class="setor">Central de Tickets</span><span class="sep">/</span><span class="nome">' + numTicket(id) + '</span>');
    $('#conteudo').innerHTML = carregandoHtml();
    var d;
    try { d = await api('GET', '/api/tickets/' + id); await carregarMeta(); } catch (e) {
      $('#conteudo').innerHTML = '<div class="pagina"><div class="vazio">' + esc(e.message) + '<br><a class="btn ghost" style="margin-top:14px" href="#/tickets">Voltar para os tickets</a></div></div>';
      return;
    }
    var t = d.ticket;
    var pode = d.pode;
    var setorMeta = metaTickets.setores.find(function (s) { return s.id === t.setor_id; }) || { membros: [], categorias: [] };
    var aberto = ['novo', 'em_andamento', 'aguardando'].indexOf(t.status) >= 0;
    definirBarra('<span class="setor">Central de Tickets</span><span class="sep">/</span><span class="nome">' + numTicket(t.id) + ' · ' + esc(t.titulo) + '</span>',
      '<a class="btn ghost sm" href="#/tickets">Voltar</a>');

    var anexosPorId = {};
    d.anexos.forEach(function (a) { anexosPorId[a.id] = a; });
    function linkAnexo(a) {
      var url = '/api/tickets/' + t.id + '/anexos/' + a.id;
      var img = /^image\/(png|jpeg|gif|webp)$/.test(a.tipo);
      return '<a class="anexo" href="' + url + (img ? '?ver=1' : '') + '" target="_blank" rel="noopener">' + IC.documento + '<span>' + esc(a.nome) + '</span><span class="sec">' + tamanho(a.tamanho) + '</span>' +
        (a.interno ? '<span class="etiqueta ambar">interno</span>' : '') + '</a>';
    }

    var linhaTempo = d.eventos.map(function (e) {
      var quem = '<b>' + esc(e.usuario_nome || 'Sistema') + '</b>';
      if (e.tipo === 'comentario') {
        return '<div class="evento comentario' + (e.interno ? ' interno' : '') + '"><div class="avatar mini">' + esc(iniciais(e.usuario_nome)) + '</div><div class="balao">' +
          '<div class="cab-ev">' + quem + (e.interno ? ' <span class="etiqueta ambar">nota interna · só a equipe vê</span>' : '') + '<span class="espaco"></span><span class="sec">' + quando(e.criado_em) + '</span></div>' +
          '<div class="texto-livre">' + esc(e.texto) + '</div></div></div>';
      }
      var anexo = e.tipo === 'anexo' && e.detalhe && anexosPorId[e.detalhe.anexo] ? '<div style="margin-top:6px">' + linkAnexo(anexosPorId[e.detalhe.anexo]) + '</div>' : '';
      return '<div class="evento sistema"><span class="ponto"></span><div>' + quem + ' ' + textoEvento(e) + ' <span class="sec" style="display:inline">· ' + quando(e.criado_em) + '</span>' +
        (e.texto ? '<div class="texto-livre motivo">' + esc(e.texto) + '</div>' : '') + anexo + '</div></div>';
    }).join('');

    var opcoesResp = '';
    if (pode.atribuir) {
      opcoesResp = '<select class="campo" id="dResp"><option value="">— Sem responsável (fila do setor) —</option>' +
        (setorMeta.membros || []).map(function (p) { return '<option value="' + p.id + '"' + (p.id === t.responsavel_id ? ' selected' : '') + '>' + esc(p.nome) + (p.lider ? ' (líder)' : '') + '</option>'; }).join('') +
        (t.responsavel_id && !(setorMeta.membros || []).some(function (p) { return p.id === t.responsavel_id; }) ? '<option value="' + t.responsavel_id + '" selected>' + esc(t.responsavel_nome) + '</option>' : '') +
        '</select>';
    }

    $('#conteudo').innerHTML = '<div class="pagina ticket">' +
      '<div class="cab-ticket"><div><span class="setor-cartao">' + numTicket(t.id) + ' · ' + esc(t.setor_nome) + (t.categoria_nome ? ' · ' + esc(t.categoria_nome) : '') + '</span>' +
      '<h1>' + esc(t.titulo) + '</h1><div class="linha">' + etqStatus(t.status) + etqPrio(t.prioridade) + (t.atrasado ? '<span class="etiqueta vermelha">⚠ atrasado</span>' : '') + '</div></div></div>' +
      '<div class="grade-ticket"><div class="pilha">' +
      '<div class="painel" style="padding:18px"><div class="cab-ev"><b>' + esc(t.solicitante_nome || '—') + '</b><span class="sec" style="display:inline"> abriu em ' + quando(t.criado_em) + '</span></div>' +
      '<div class="texto-livre" style="margin-top:8px">' + (t.descricao ? esc(t.descricao) : '<span class="sec">Sem descrição.</span>') + '</div>' +
      (d.anexos.length ? '<div class="anexos">' + d.anexos.map(linkAnexo).join('') + '</div>' : '') + '</div>' +
      '<div class="linha-tempo">' + linhaTempo + '</div>' +
      '<div class="painel" style="padding:16px"><form id="fCom" class="pilha">' +
      '<textarea class="campo" id="cTexto" rows="4" maxlength="10000" placeholder="' + (pode.equipe ? 'Responder a quem abriu ou registrar uma nota interna…' : 'Escreva uma mensagem para a equipe que está atendendo…') + '"></textarea>' +
      '<div class="linha"><input type="file" id="cArq" multiple class="campo" style="max-width:320px">' +
      (pode.interno ? '<label class="linha" style="font-weight:700;font-size:13px;color:var(--ink-2)"><input type="checkbox" id="cInterno"> nota interna (só a equipe vê)</label>' : '') +
      '<span class="espaco"></span><button class="btn primary" type="submit" id="btComentar">Enviar</button></div></form></div>' +
      '</div><aside class="pilha lado-ticket">' +
      '<div class="painel" style="padding:16px" id="ladoAcoes">' +
      '<div class="campo-lado"><label class="rot">Situação</label>' +
      (pode.equipe ? '<select class="campo" id="dStatus">' + Object.keys(ST_TICKET).map(function (k) { return '<option value="' + k + '"' + (k === t.status ? ' selected' : '') + '>' + ST_TICKET[k][0] + '</option>'; }).join('') + '</select>' +
        '<div class="ajuda" id="dStatusAjuda">' + esc(ROTULO_STATUS_AJUDA[t.status]) + '</div>' : etqStatus(t.status)) + '</div>' +
      '<div class="campo-lado"><label class="rot">Responsável</label>' + (opcoesResp || '<div style="font-weight:700">' + (t.responsavel_nome ? esc(t.responsavel_nome) : '<span class="etiqueta ambar">sem responsável</span>') + '</div>') +
      '<div class="linha" style="margin-top:8px">' + (pode.assumir ? '<button class="btn ghost sm" id="btAssumir">Assumir para mim</button>' : '') +
      (t.responsavel_id === eu.id && aberto && !pode.atribuir ? '<button class="btn ghost sm" id="btDevolver">Devolver à fila</button>' : '') + '</div></div>' +
      '<div class="campo-lado"><label class="rot">Prioridade</label>' + (pode.equipe ? '<select class="campo" id="dPrio">' + ['baixa', 'media', 'alta', 'urgente'].map(function (p) { return '<option value="' + p + '"' + (p === t.prioridade ? ' selected' : '') + '>' + PRIO[p][0] + '</option>'; }).join('') + '</select>' : etqPrio(t.prioridade)) + '</div>' +
      '<div class="campo-lado"><label class="rot">Prazo</label>' + (pode.equipe ? '<input class="campo" type="datetime-local" id="dPrazo" value="' + localInput(t.prazo) + '">' : '') + '<div style="margin-top:6px">' + prazoTxt(t) + '</div></div>' +
      (pode.equipe ? '<div class="linha"><button class="btn primary" id="btSalvarT" style="flex:1">Salvar alterações</button></div>' : '') +
      '</div>' +
      '<div class="painel" style="padding:16px"><div class="pilha" style="gap:8px">' +
      (pode.equipe && aberto ? '<button class="btn ghost" id="btTransferir">Transferir para outro setor</button>' : '') +
      (pode.equipe && aberto ? '<button class="btn ghost" id="btResolver">' + 'Marcar como resolvido</button>' : '') +
      (!pode.equipe && pode.cancelar ? '<button class="btn danger" id="btCancelarT">Cancelar meu pedido</button>' : '') +
      (pode.reabrir ? '<button class="btn ghost" id="btReabrir">Reabrir ticket</button>' : '') +
      '<dl class="info-ticket"><dt>Setor</dt><dd>' + esc(t.setor_nome) + '</dd><dt>Tipo</dt><dd>' + esc(t.categoria_nome || '—') + '</dd>' +
      '<dt>Aberto por</dt><dd>' + esc(t.solicitante_nome || '—') + '</dd><dt>Aberto em</dt><dd>' + quando(t.criado_em) + '</dd>' +
      '<dt>1ª resposta</dt><dd>' + (t.primeira_resposta_em ? quando(t.primeira_resposta_em) : '—') + '</dd>' +
      (t.resolvido_em ? '<dt>Resolvido em</dt><dd>' + quando(t.resolvido_em) + '</dd>' : '') + '</dl></div></div>' +
      '</aside></div></div>';

    var recarregar = function () { paginaTicket(id); atualizarResumo(); };
    setTimeout(buscarAvisos, 300);
    async function mudar(corpo, ok) {
      try { await api('PATCH', '/api/tickets/' + t.id, corpo); toast(ok || 'Ticket atualizado.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
    }
    function pedirMotivo(titulo, rotulo, obrigatorio, botao, perigo) {
      return new Promise(function (resolve) {
        var valor = null;
        var mm = modal({
          titulo: titulo,
          corpo: '<label class="rot" for="mMotivo">' + esc(rotulo) + '</label><textarea class="campo" id="mMotivo" rows="3" maxlength="2000"></textarea><div id="mMsgM" class="msg erro" hidden style="margin-top:10px"></div>',
          pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn ' + (perigo ? 'danger' : 'primary') + '" id="mOkM">' + esc(botao) + '</button>',
          aoFechar: function () { resolve(valor); },
        });
        $('#mOkM', mm).onclick = function () {
          var v = $('#mMotivo', mm).value.trim();
          if (obrigatorio && !v) { $('#mMsgM', mm).textContent = 'Escreva o motivo.'; $('#mMsgM', mm).hidden = false; return; }
          valor = v; mm.fechar();
        };
      });
    }

    $('#fCom').onsubmit = async function (e) {
      e.preventDefault();
      var txt = $('#cTexto').value.trim();
      var arqs = Array.prototype.slice.call($('#cArq').files);
      var interno = $('#cInterno') ? $('#cInterno').checked : false;
      if (!txt && !arqs.length) { toast('Escreva uma mensagem ou escolha um arquivo.', 'erro'); return; }
      $('#btComentar').disabled = true;
      try {
        if (txt) await api('POST', '/api/tickets/' + t.id + '/comentarios', { texto: txt, interno: interno });
        if (arqs.length) await enviarAnexos(t.id, arqs, interno);
        recarregar();
      } catch (err) { toast(err.message, 'erro'); $('#btComentar').disabled = false; }
    };
    if ($('#dStatus')) $('#dStatus').onchange = function () { $('#dStatusAjuda').textContent = ROTULO_STATUS_AJUDA[this.value]; };
    if ($('#btSalvarT')) {
      $('#btSalvarT').onclick = async function () {
        var corpo = {};
        if ($('#dStatus').value !== t.status) corpo.status = $('#dStatus').value;
        if ($('#dPrio').value !== t.prioridade) corpo.prioridade = $('#dPrio').value;
        if ($('#dPrazo').value !== localInput(t.prazo)) corpo.prazo = $('#dPrazo').value ? new Date($('#dPrazo').value).toISOString() : null;
        if ($('#dResp')) { var rsp = $('#dResp').value ? Number($('#dResp').value) : null; if (rsp !== t.responsavel_id) corpo.responsavel_id = rsp; }
        if (!Object.keys(corpo).length) { toast('Nada foi alterado.'); return; }
        if (corpo.status === 'resolvido' || corpo.status === 'cancelado') {
          var mot = await pedirMotivo(corpo.status === 'resolvido' ? 'Resolver ticket' : 'Cancelar ticket', corpo.status === 'resolvido' ? 'O que foi feito? (aparece para quem abriu)' : 'Por que não será atendido?', corpo.status === 'cancelado', 'Confirmar', corpo.status === 'cancelado');
          if (mot === null) return;
          corpo.motivo = mot;
        }
        mudar(corpo);
      };
    }
    if ($('#btAssumir')) $('#btAssumir').onclick = function () { mudar({ responsavel_id: eu.id }, 'Ticket assumido.'); };
    if ($('#btDevolver')) $('#btDevolver').onclick = function () { mudar({ responsavel_id: null }, 'Ticket devolvido para a fila do setor.'); };
    if ($('#btResolver')) {
      $('#btResolver').onclick = async function () {
        var mot = await pedirMotivo('Resolver ticket', 'O que foi feito? (aparece para quem abriu)', false, 'Marcar como resolvido');
        if (mot !== null) mudar({ status: 'resolvido', motivo: mot }, 'Ticket resolvido.');
      };
    }
    if ($('#btCancelarT')) {
      $('#btCancelarT').onclick = async function () {
        var mot = await pedirMotivo('Cancelar pedido', 'Por que está cancelando?', false, 'Cancelar pedido', true);
        if (mot !== null) mudar({ status: 'cancelado', motivo: mot }, 'Pedido cancelado.');
      };
    }
    if ($('#btReabrir')) {
      $('#btReabrir').onclick = async function () {
        var mot = await pedirMotivo('Reabrir ticket', 'Por que precisa reabrir?', true, 'Reabrir');
        if (mot !== null) mudar({ status: 'em_andamento', motivo: mot }, 'Ticket reaberto.');
      };
    }
    if ($('#btTransferir')) {
      $('#btTransferir').onclick = function () {
        var outros = metaTickets.setores.filter(function (s) { return s.id !== t.setor_id; });
        var mm = modal({
          titulo: 'Transferir ' + numTicket(t.id),
          corpo: '<div class="pilha"><p style="margin:0;font-weight:600;color:var(--ink-2)">O ticket vai para a fila do novo setor, sem responsável, e o líder de lá distribui.</p>' +
            '<div class="grade-2"><div><label class="rot" for="trSetor">Novo setor</label><select class="campo" id="trSetor"><option value="">Escolha…</option>' +
            outros.map(function (s) { return '<option value="' + s.id + '">' + esc(s.nome) + '</option>'; }).join('') + '</select></div>' +
            '<div><label class="rot" for="trCat">Tipo de demanda</label><select class="campo" id="trCat" disabled><option value="">—</option></select></div></div>' +
            '<div><label class="rot" for="trMot">Motivo da transferência</label><textarea class="campo" id="trMot" rows="3" maxlength="2000"></textarea></div><div id="trMsg" class="msg erro" hidden></div></div>',
          pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="btTrOk">Transferir</button>',
        });
        $('#trSetor', mm).onchange = function () {
          var s = outros.find(function (x) { return String(x.id) === $('#trSetor', mm).value; });
          $('#trCat', mm).disabled = !s || !s.categorias.length;
          $('#trCat', mm).innerHTML = '<option value="">' + (s && s.categorias.length ? 'Outro / não sei' : '—') + '</option>' + (s ? s.categorias.map(function (c) { return '<option value="' + c.id + '">' + esc(c.nome) + '</option>'; }).join('') : '');
        };
        $('#btTrOk', mm).onclick = async function () {
          if (!$('#trSetor', mm).value) { $('#trMsg', mm).textContent = 'Escolha o setor.'; $('#trMsg', mm).hidden = false; return; }
          try {
            await api('PATCH', '/api/tickets/' + t.id, { setor_id: Number($('#trSetor', mm).value), categoria_id: $('#trCat', mm).value ? Number($('#trCat', mm).value) : null, motivo: $('#trMot', mm).value });
            mm.fechar();
            toast('Ticket transferido.', 'ok');
            recarregar();
          } catch (e) { $('#trMsg', mm).textContent = e.message; $('#trMsg', mm).hidden = false; }
        };
      };
    }
  }

  /* ---------- painel de indicadores ---------- */
  async function paginaPainelTickets() {
    definirBarra('<span class="setor">Central de Tickets</span><span class="sep">/</span><span class="nome">Painel</span>');
    try { await carregarMeta(); } catch (e) { toast(e.message, 'erro'); }
    var dias = lembrar('tickets.painel.dias', 30);
    var setor = '';
    var setores = gestorTickets() ? metaTickets.setores : meusSetores();
    $('#conteudo').innerHTML = '<div class="pagina"><h1>Painel de tickets</h1><p class="sub">' + (gestorTickets() ? 'Todos os setores.' : 'Setores de que você faz parte.') + ' Em aberto e atrasados mostram a situação de agora; os demais números são do período escolhido.</p>' +
      '<div class="linha" style="margin-bottom:18px"><select class="campo" id="pDias" style="max-width:180px">' +
      [[7, 'Últimos 7 dias'], [30, 'Últimos 30 dias'], [90, 'Últimos 90 dias'], [365, 'Últimos 12 meses']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === dias ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      (setores.length > 1 ? '<select class="campo" id="pSetor" style="max-width:220px"><option value="">Todos os setores</option>' + setores.map(function (s) { return '<option value="' + s.id + '">' + esc(s.nome) + '</option>'; }).join('') + '</select>' : '') +
      '</div><div id="pCorpo">' + carregandoHtml() + '</div></div>';
    async function carregar() {
      dias = Number($('#pDias').value);
      guardar('tickets.painel.dias', dias);
      setor = $('#pSetor') ? $('#pSetor').value : '';
      var r;
      try { r = await api('GET', '/api/tickets/painel/indicadores?dias=' + dias + (setor ? '&setor=' + setor : '')); } catch (e) {
        $('#pCorpo').innerHTML = '<div class="vazio">' + esc(e.message) + '</div>'; return;
      }
      var g = r.geral;
      var pct = g.resolvidos ? Math.round(g.no_prazo / g.resolvidos * 100) + '%' : '—';
      function tile(rotulo, valor, extra, alerta) {
        return '<div class="tile' + (alerta ? ' alerta' : '') + '"><span class="rot-tile">' + rotulo + '</span><b>' + valor + '</b>' + (extra ? '<span class="sec">' + extra + '</span>' : '') + '</div>';
      }
      var linhaMetricas = function (x) {
        return '<td class="num">' + x.abertos + '</td><td class="num">' + (x.atrasados ? '<span class="etiqueta vermelha">⚠ ' + x.atrasados + '</span>' : '0') + '</td>' +
          '<td class="num">' + x.resolvidos + '</td><td class="num">' + (x.resolvidos ? Math.round(x.no_prazo / x.resolvidos * 100) + '%' : '—') + '</td><td class="num">' + horas(x.horas_resolucao) + '</td>';
      };
      var cabMetricas = '<th class="num">Em aberto</th><th class="num">Atrasados</th><th class="num">Resolvidos</th><th class="num">No prazo</th><th class="num">Tempo médio</th>';
      $('#pCorpo').innerHTML =
        '<div class="tiles">' +
        tile('Em aberto', g.abertos, g.sem_responsavel + ' sem responsável') +
        tile('Atrasados', g.atrasados ? '⚠ ' + g.atrasados : '0', 'prazo vencido, ainda em aberto', g.atrasados > 0) +
        tile('Abertos no período', g.criados, '') +
        tile('Resolvidos no período', g.resolvidos, g.resolvidos ? pct + ' dentro do prazo' : '') +
        tile('Tempo médio de resolução', horas(g.horas_resolucao), 'da abertura até resolver') +
        tile('Tempo médio de 1ª resposta', horas(g.horas_primeira_resposta), 'até o primeiro retorno da equipe') +
        '</div>' +
        '<div class="painel" style="margin-top:18px"><div class="cab-painel"><b style="font-family:var(--display)">Por setor</b></div><div class="tabela-wrap"><table><thead><tr><th>Setor</th>' + cabMetricas + '</tr></thead><tbody>' +
        (r.por_setor.map(function (s) { return '<tr><td><b>' + esc(s.nome) + '</b></td>' + linhaMetricas(s) + '</tr>'; }).join('') || '<tr><td colspan="6" class="sec" style="text-align:center;padding:20px">Sem tickets ainda.</td></tr>') + '</tbody></table></div></div>' +
        '<div class="painel" style="margin-top:18px"><div class="cab-painel"><b style="font-family:var(--display)">Por responsável</b></div><div class="tabela-wrap"><table><thead><tr><th>Pessoa</th>' + cabMetricas + '</tr></thead><tbody>' +
        (r.por_pessoa.map(function (s) { return '<tr><td><b>' + esc(s.nome) + '</b></td>' + linhaMetricas(s) + '</tr>'; }).join('') || '<tr><td colspan="6" class="sec" style="text-align:center;padding:20px">Nenhum ticket atribuído ainda.</td></tr>') + '</tbody></table></div></div>' +
        '<div class="painel" style="margin-top:18px"><div class="cab-painel"><b style="font-family:var(--display)">Tipos de demanda mais abertos no período</b></div><div class="tabela-wrap"><table><thead><tr><th>Tipo</th><th>Setor</th><th class="num">Tickets</th></tr></thead><tbody>' +
        (r.por_categoria.map(function (c) { return '<tr><td>' + esc(c.nome) + '</td><td>' + esc(c.setor) + '</td><td class="num">' + c.n + '</td></tr>'; }).join('') || '<tr><td colspan="3" class="sec" style="text-align:center;padding:20px">Nada no período.</td></tr>') + '</tbody></table></div></div>';
    }
    $('#pDias').onchange = carregar;
    if ($('#pSetor')) $('#pSetor').onchange = carregar;
    carregar();
  }

  /* ======================= Carteira de condomínios ======================= */
  var CART_SIT = { ATIVO: ['Ativo', 'verde'], DISTRATADO: ['Distratado', 'cinza'] };
  // "EDUARDO SOUSA - 4663" → { nome: 'Eduardo Sousa', ramal: '4663' }
  function pessoaCarteira(v) {
    var m = String(v || '').match(/^(.*?)\s*-\s*(\d+)\s*$/);
    var nome = (m ? m[1] : String(v || '')).toLowerCase().replace(/(^|\s)(\S)/g, function (x, a, b) { return a + b.toUpperCase(); })
      .replace(/ (Da|De|Do|Das|Dos|E) /g, function (x) { return x.toLowerCase(); });
    return { nome: nome, ramal: m ? m[2] : '' };
  }
  function celPessoa(v) {
    if (!v) return '<span class="etiqueta ambar">sem responsável</span>';
    var p = pessoaCarteira(v);
    return '<b style="font-weight:700">' + esc(p.nome) + '</b>' + (p.ramal ? '<span class="sec">ramal ' + esc(p.ramal) + '</span>' : '');
  }
  function etqSituacao(s) { var x = CART_SIT[s] || [s || '—', 'ambar']; return '<span class="etiqueta ' + x[1] + '">' + esc(x[0]) + '</span>'; }
  function unicos(lista) { return lista.filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }); }

  async function paginaCarteira(aba) {
    aba = aba === 'responsaveis' ? 'responsaveis' : 'condominios';
    definirBarra('<span class="setor">Carteira</span><span class="sep">/</span><span class="nome">' + (aba === 'responsaveis' ? 'Responsáveis' : 'Condomínios') + '</span>');
    $('#conteudo').innerHTML = carregandoHtml();
    var j;
    try { j = await api('GET', '/api/carteira'); } catch (e) { toast(e.message, 'erro'); return; }
    var conds = j.condominios, funcoes = j.funcoes, admin = j.pode_editar;
    var ativos = conds.filter(function (c) { return c.situacao === 'ATIVO'; });
    var porUf = {};
    ativos.forEach(function (c) { porUf[c.comarca || '—'] = (porUf[c.comarca || '—'] || 0) + 1; });
    var ufs = Object.keys(porUf).sort(function (a, b) { return porUf[b] - porUf[a]; });
    var semResp = ativos.filter(function (c) { return funcoes.some(function (f) { return !c[f.campo]; }); });
    function tile(rotulo, valor, extra, alerta) {
      return '<div class="tile' + (alerta ? ' alerta' : '') + '"><span class="rot-tile">' + rotulo + '</span><b>' + valor + '</b>' + (extra ? '<span class="sec">' + extra + '</span>' : '') + '</div>';
    }
    $('#conteudo').innerHTML = '<div class="pagina"><h1>Carteira de condomínios</h1>' +
      '<p class="sub">Os condomínios atendidos e quem cuida de cada um: analista de cobrança, analista extrajudicial (ApoioCob) e assistente de crédito.</p>' +
      (conds.length ? '<div class="tiles" style="margin-bottom:20px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">' +
        tile('Condomínios ativos', ativos.length, conds.length - ativos.length + ' distratado' + (conds.length - ativos.length === 1 ? '' : 's')) +
        tile('Comarcas', ufs.length, ufs.slice(0, 4).map(function (u) { return esc(u) + ' ' + porUf[u]; }).join(' · ')) +
        funcoes.map(function (f) {
          var n = unicos(ativos.map(function (c) { return c[f.campo]; })).length;
          return tile(esc(f.rotulo.replace(' (ApoioCob)', '')), n, n ? 'pessoas · média de ' + Math.round(ativos.filter(function (c) { return c[f.campo]; }).length / n) + ' cada' : '');
        }).join('') +
        tile('Sem responsável', semResp.length, 'ativos com função em branco', semResp.length > 0) + '</div>' : '') +
      '<nav class="abas"><a href="#/carteira" class="' + (aba === 'condominios' ? 'on' : '') + '">Condomínios</a>' +
      '<a href="#/carteira/responsaveis" class="' + (aba === 'responsaveis' ? 'on' : '') + '">Responsáveis</a></nav><div id="cCorpo"></div></div>';

    var acoes = '<button class="btn ghost" id="btCExportar"' + (conds.length ? '' : ' disabled') + '>' + IC.baixar + 'Exportar CSV</button>' +
      (admin ? '<button class="btn ghost" id="btCImportar">' + IC.enviar + 'Importar CSV</button><button class="btn primary" id="btCNovo">' + IC.mais + 'Novo condomínio</button>' : '');

    if (!conds.length) {
      $('#cCorpo').innerHTML = '<div class="vazio">A carteira ainda está vazia.' + (admin ? '<div class="ajuda" style="margin:8px 0 16px">Importe o CSV da planilha <i>Carteira de Condomínios</i> ou cadastre o primeiro condomínio.</div><div class="linha" style="justify-content:center">' + acoes + '</div>' : ' A administração ainda vai importar a planilha.') + '</div>';
    } else if (aba === 'condominios') desenharCondominios();
    else desenharResponsaveis();
    ligarAcoes();

    function ligarAcoes() {
      if ($('#btCExportar')) $('#btCExportar').onclick = function () { location.href = '/api/carteira/exportar'; };
      if ($('#btCImportar')) $('#btCImportar').onclick = importarCarteira;
      if ($('#btCNovo')) $('#btCNovo').onclick = function () { editarCondominio(null); };
    }

    function desenharCondominios() {
      var f = lembrar('carteira.filtros', { q: '', situacao: 'ATIVO', uf: '', adm: '', pessoa: '', semResp: false, ordem: 'nome', desc: false });
      var pessoas = funcoes.map(function (fn) {
        return '<optgroup label="' + esc(fn.rotulo) + '">' + unicos(conds.map(function (c) { return c[fn.campo]; })).map(function (p) {
          return '<option value="' + esc(fn.campo + '|' + p) + '">' + esc(pessoaCarteira(p).nome) + '</option>';
        }).join('') + '</optgroup>';
      }).join('');
      var cols = [['codigo', 'ID'], ['nome', 'Condomínio'], ['comarca', 'UF'], ['vencimento', 'Venc.']]
        .concat(funcoes.map(function (fn) { return [fn.campo, fn.rotulo.replace(' (ApoioCob)', '')]; }))
        .concat([['administradora', 'Administradora'], ['situacao', 'Situação']]);
      $('#cCorpo').innerHTML = '<div class="painel"><div class="cab-painel">' +
        '<input class="campo" id="cfQ" type="search" placeholder="Buscar nome, razão social, CNPJ ou ID…" style="max-width:280px">' +
        '<select class="campo" id="cfSit" style="max-width:150px"><option value="ATIVO">Ativos</option><option value="DISTRATADO">Distratados</option><option value="">Todas as situações</option></select>' +
        '<select class="campo" id="cfUf" style="max-width:130px"><option value="">Todas as UFs</option>' + unicos(conds.map(function (c) { return c.comarca; })).map(function (u) { return '<option>' + esc(u) + '</option>'; }).join('') + '</select>' +
        '<select class="campo" id="cfAdm" style="max-width:190px"><option value="">Todas as administradoras</option>' + unicos(conds.map(function (c) { return c.administradora; })).map(function (u) { return '<option>' + esc(u) + '</option>'; }).join('') + '</select>' +
        '<select class="campo" id="cfPes" style="max-width:220px"><option value="">Todos os responsáveis</option>' + pessoas + '</select>' +
        '<label class="linha" style="font-weight:700;font-size:13px;color:var(--muted)"><input type="checkbox" id="cfSem"> sem responsável</label>' +
        '<span class="espaco"></span>' + acoes + '</div>' +
        '<div class="tabela-wrap"><table><thead><tr>' + cols.map(function (c) {
          return '<th data-ordem="' + c[0] + '" style="cursor:pointer" title="Ordenar">' + esc(c[1]) + ' <span data-seta="' + c[0] + '"></span></th>';
        }).join('') + '</tr></thead><tbody id="tbC"></tbody></table></div>' +
        '<div class="ajuda" id="cTotal" style="padding:10px 16px;border-top:1px solid var(--border)"></div></div>';
      $('#cfQ').value = f.q; $('#cfSit').value = f.situacao; $('#cfUf').value = f.uf; $('#cfAdm').value = f.adm; $('#cfPes').value = f.pessoa; $('#cfSem').checked = !!f.semResp;
      function filtrar() {
        f = { q: $('#cfQ').value.trim(), situacao: $('#cfSit').value, uf: $('#cfUf').value, adm: $('#cfAdm').value, pessoa: $('#cfPes').value, semResp: $('#cfSem').checked, ordem: f.ordem, desc: f.desc };
        guardar('carteira.filtros', f);
        var t = normal(f.q), dig = f.q.replace(/\D/g, '');
        var pes = f.pessoa ? f.pessoa.split('|') : null;
        var lista = conds.filter(function (c) {
          if (f.situacao && c.situacao !== f.situacao) return false;
          if (f.uf && c.comarca !== f.uf) return false;
          if (f.adm && c.administradora !== f.adm) return false;
          if (pes && c[pes[0]] !== pes[1]) return false;
          if (f.semResp && !funcoes.some(function (fn) { return !c[fn.campo]; })) return false;
          if (t && normal(c.nome + ' ' + c.razao_social + ' ' + c.codigo + ' ' + c.administradora).indexOf(t) < 0 && !(dig.length >= 4 && c.cnpj.replace(/\D/g, '').indexOf(dig) >= 0)) return false;
          return true;
        });
        lista.sort(function (a, b) {
          var x = a[f.ordem] || '', y = b[f.ordem] || '';
          var r = /^\d+$/.test(x) && /^\d+$/.test(y) ? Number(x) - Number(y) : String(x).localeCompare(String(y), 'pt-BR', { numeric: true });
          return (f.desc ? -r : r) || a.nome.localeCompare(b.nome, 'pt-BR');
        });
        $$('[data-seta]').forEach(function (s) { s.textContent = s.getAttribute('data-seta') === f.ordem ? (f.desc ? '↓' : '↑') : ''; });
        $('#tbC').innerHTML = lista.map(function (c) {
          return '<tr class="clicavel" data-id="' + c.id + '"><td class="sec" style="white-space:nowrap">' + esc(c.codigo) + '</td>' +
            '<td style="min-width:220px;max-width:320px"><b>' + esc(c.nome) + '</b><span class="sec" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(c.razao_social || '') + '">' +
              esc(c.cnpj || '') + (c.cnpj && c.razao_social ? ' · ' : '') + esc(c.razao_social || '') + '</span></td>' +
            '<td>' + esc(c.comarca || '—') + '</td><td style="white-space:nowrap">' + esc(c.vencimento || '—') + '</td>' +
            funcoes.map(function (fn) { return '<td>' + celPessoa(c[fn.campo]) + '</td>'; }).join('') +
            '<td>' + esc(c.administradora && c.administradora !== '-' ? c.administradora : '—') + (c.forma_envio ? '<span class="sec">' + esc(c.forma_envio) + '</span>' : '') + '</td>' +
            '<td>' + etqSituacao(c.situacao) + '</td></tr>';
        }).join('') || '<tr><td colspan="' + cols.length + '"><div class="vazio" style="border:0;padding:34px">Nenhum condomínio com estes filtros.</div></td></tr>';
        $('#cTotal').textContent = lista.length + ' de ' + conds.length + ' condomínio' + (conds.length === 1 ? '' : 's');
        $$('#tbC tr[data-id]').forEach(function (tr) { tr.onclick = function () { verCondominio(Number(tr.getAttribute('data-id'))); }; });
      }
      var espera;
      $('#cfQ').oninput = function () { clearTimeout(espera); espera = setTimeout(filtrar, 200); };
      $$('#cfSit,#cfUf,#cfAdm,#cfPes,#cfSem').forEach(function (el) { el.onchange = filtrar; });
      $$('th[data-ordem]').forEach(function (th) {
        th.onclick = function () { var o = th.getAttribute('data-ordem'); f.desc = f.ordem === o ? !f.desc : false; f.ordem = o; filtrar(); };
      });
      filtrar();
    }

    function desenharResponsaveis() {
      $('#cCorpo').innerHTML = '<div class="linha" style="margin-bottom:14px"><span class="ajuda" style="flex:1;min-width:240px">Quantos condomínios cada pessoa tem na carteira. Clique no número para ver a lista' +
        (admin ? '; use <b>Transferir</b> quando alguém sair ou a carteira for redistribuída.' : '.') + '</span>' + acoes + '</div>' +
        funcoes.map(function (fn) {
          var nomes = unicos(conds.map(function (c) { return c[fn.campo]; }));
          var sem = ativos.filter(function (c) { return !c[fn.campo]; }).length;
          var linhas = nomes.map(function (p) {
            var deles = conds.filter(function (c) { return c[fn.campo] === p; });
            var at = deles.filter(function (c) { return c.situacao === 'ATIVO'; });
            var porU = {};
            at.forEach(function (c) { porU[c.comarca || '—'] = (porU[c.comarca || '—'] || 0) + 1; });
            var pp = pessoaCarteira(p);
            return { p: p, html: '<tr><td><b>' + esc(pp.nome) + '</b></td><td class="sec">' + esc(pp.ramal || '—') + '</td>' +
              '<td class="num"><a href="#" data-ver="' + esc(fn.campo + '|' + p) + '"><b>' + at.length + '</b></a></td>' +
              '<td class="sec">' + Object.keys(porU).sort(function (a, b) { return porU[b] - porU[a]; }).map(function (u) { return esc(u) + ' ' + porU[u]; }).join(' · ') + '</td>' +
              '<td class="num">' + (deles.length - at.length) + '</td>' +
              (admin ? '<td style="text-align:right"><button class="btn ghost sm" data-transferir="' + esc(fn.campo + '|' + p) + '">Transferir</button></td>' : '') + '</tr>', n: at.length };
          }).sort(function (a, b) { return b.n - a.n; });
          return '<div class="painel" style="margin-bottom:18px"><div class="cab-painel"><b style="font-family:var(--display)">' + esc(fn.rotulo) + '</b>' +
            '<span class="sec" style="color:var(--muted);font-weight:600;font-size:13px">' + nomes.length + ' pessoa' + (nomes.length === 1 ? '' : 's') + '</span><span class="espaco"></span>' +
            (sem ? '<a href="#" class="etiqueta ambar" data-sem="1">' + sem + ' ativo' + (sem === 1 ? '' : 's') + ' sem responsável</a>' : '') + '</div>' +
            '<div class="tabela-wrap"><table><thead><tr><th>Pessoa</th><th>Ramal</th><th class="num">Ativos</th><th>Por UF</th><th class="num">Distratados</th>' + (admin ? '<th></th>' : '') + '</tr></thead><tbody>' +
            (linhas.map(function (l) { return l.html; }).join('') || '<tr><td colspan="6" class="sec" style="text-align:center;padding:20px">Ninguém nesta função.</td></tr>') + '</tbody></table></div></div>';
        }).join('');
      $$('[data-ver]').forEach(function (a) {
        a.onclick = function (e) {
          e.preventDefault();
          guardar('carteira.filtros', { q: '', situacao: 'ATIVO', uf: '', adm: '', pessoa: a.getAttribute('data-ver'), semResp: false, ordem: 'nome', desc: false });
          location.hash = '#/carteira';
        };
      });
      $$('[data-sem]').forEach(function (a) {
        a.onclick = function (e) {
          e.preventDefault();
          guardar('carteira.filtros', { q: '', situacao: 'ATIVO', uf: '', adm: '', pessoa: '', semResp: true, ordem: 'nome', desc: false });
          location.hash = '#/carteira';
        };
      });
      $$('[data-transferir]').forEach(function (b) {
        b.onclick = function () { var x = b.getAttribute('data-transferir').split('|'); transferir(x[0], x.slice(1).join('|')); };
      });
    }

    function transferir(campo, de) {
      var fn = funcoes.find(function (x) { return x.campo === campo; });
      var deles = conds.filter(function (c) { return c[campo] === de; }).sort(function (a, b) { return (a.situacao === 'ATIVO' ? 0 : 1) - (b.situacao === 'ATIVO' ? 0 : 1) || a.nome.localeCompare(b.nome, 'pt-BR'); });
      var m = modal({
        titulo: 'Transferir carteira', largo: true,
        corpo: '<div class="pilha"><p style="margin:0;font-weight:600;color:var(--ink-2)">' + esc(fn.rotulo) + ': condomínios de <b>' + esc(pessoaCarteira(de).nome) + '</b>. Desmarque os que devem continuar com essa pessoa.</p>' +
          '<div><label class="rot" for="trPara">Passar para</label><input class="campo" id="trPara" list="trLista" placeholder="NOME - RAMAL (ex.: MARIA SILVA - 4700)">' +
          '<datalist id="trLista">' + unicos(conds.map(function (c) { return c[campo]; })).filter(function (p) { return p !== de; }).map(function (p) { return '<option value="' + esc(p) + '"></option>'; }).join('') + '</datalist></div>' +
          '<div class="caixa-opcoes"><div class="grp"><input type="checkbox" id="trTodos" checked> ' + deles.length + ' condomínio' + (deles.length === 1 ? '' : 's') + '</div>' + deles.map(function (c) {
            return '<label><input type="checkbox" name="trC" value="' + c.id + '" checked><span style="flex:1">' + esc(c.nome) + ' <span class="sec" style="display:inline">' + esc(c.comarca) + '</span></span>' + etqSituacao(c.situacao) + '</label>';
          }).join('') + '</div><div id="trMsg" class="msg erro" hidden></div></div>',
        pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="btTrOk">Transferir</button>',
      });
      $('#trTodos', m).onchange = function () { var v = this.checked; $$('input[name=trC]', m).forEach(function (i) { i.checked = v; }); };
      $('#btTrOk', m).onclick = async function () {
        var ids = $$('input[name=trC]:checked', m).map(function (i) { return Number(i.value); });
        var msg = $('#trMsg', m);
        if (!$('#trPara', m).value.trim()) { msg.textContent = 'Informe para quem vai a carteira.'; msg.hidden = false; return; }
        if (!ids.length) { msg.textContent = 'Marque pelo menos um condomínio.'; msg.hidden = false; return; }
        try {
          var r = await api('POST', '/api/carteira/transferir', { funcao: campo, de: de, para: $('#trPara', m).value, ids: ids });
          m.fechar();
          toast(r.condominios + ' condomínio' + (r.condominios === 1 ? '' : 's') + ' transferido' + (r.condominios === 1 ? '' : 's') + '.', 'ok');
          paginaCarteira('responsaveis');
        } catch (e) { msg.textContent = e.message; msg.hidden = false; }
      };
    }

    function importarCarteira() {
      var m = modal({
        titulo: 'Importar carteira',
        corpo: '<div class="pilha"><div><label class="rot" for="ciArq">Arquivo CSV da Carteira de Condomínios</label><input class="campo" id="ciArq" type="file" accept=".csv,text/csv"></div>' +
          '<div class="ajuda">No Excel: <i>Arquivo → Salvar como → CSV (separado por ponto e vírgula)</i>. Cada condomínio é reconhecido pela coluna <b>ID</b>: os que já existem são atualizados, ' +
          'os novos são incluídos e os que não estão no arquivo ficam como estão. Toda mudança fica no histórico do condomínio.</div><div id="ciRes"></div></div>',
        pe: '<button class="btn ghost" data-fechar>Fechar</button><button class="btn primary" id="btCiOk">' + IC.enviar + 'Importar</button>',
      });
      var feito = false;
      $('#btCiOk', m).onclick = async function () {
        if (feito) { m.fechar(); paginaCarteira(aba); return; }
        var arq = $('#ciArq', m).files[0];
        if (!arq) { toast('Escolha o arquivo CSV.', 'erro'); return; }
        var bt = this; bt.disabled = true;
        try {
          var r = await api('POST', '/api/carteira/importar', arq, { bruto: true, headers: { 'Content-Type': 'text/csv' } });
          $('#ciRes', m).innerHTML = '<div class="tiles" style="grid-template-columns:repeat(3,1fr)">' + tile('Novos', r.novos) + tile('Atualizados', r.atualizados) + tile('Sem mudança', r.iguais) + '</div>' +
            (r.avisos.length ? '<div class="msg erro" style="margin-top:12px">' + r.avisos.map(esc).join('<br>') + '</div>' : '');
          feito = true;
          bt.innerHTML = 'Ver carteira';
        } catch (e) { toast(e.message, 'erro'); }
        bt.disabled = false;
      };
    }

    async function verCondominio(id) {
      var d;
      try { d = await api('GET', '/api/carteira/' + id); } catch (e) { toast(e.message, 'erro'); return; }
      editarCondominio(d.condominio, d.historico);
    }

    var ROTULO_CAMPO = { codigo: 'ID', nome: 'Condomínio', situacao: 'Situação', comarca: 'UF', vencimento: 'Vencimento', administradora: 'Administradora', forma_envio: 'Forma de envio',
      inicio_contrato: 'Início do contrato', razao_social: 'Razão social', cnpj: 'CNPJ', observacoes: 'Observações' };
    funcoes.forEach(function (fn) { ROTULO_CAMPO[fn.campo] = fn.rotulo; });

    function editarCondominio(c, historico) {
      var novo = !c;
      c = c || { situacao: 'ATIVO' };
      var ro = !admin;
      function campo(id, rotulo, valor, extra) {
        return '<div><label class="rot" for="' + id + '">' + rotulo + '</label><input class="campo" id="' + id + '" value="' + esc(valor || '') + '"' + (ro ? ' readonly' : '') + (extra || '') + '></div>';
      }
      function lista(id, valores) { return '<datalist id="' + id + '">' + unicos(valores).map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>'; }
      var hist = (historico || []).map(function (h) {
        var det = h.detalhe || {};
        var o = h.acao === 'condominio_criado' ? 'cadastrou o condomínio' : Object.keys(det.mudancas || {}).map(function (k) {
          var v = det.mudancas[k];
          return '<b>' + esc(ROTULO_CAMPO[k] || k) + '</b>: ' + esc(v[0] || '(vazio)') + ' → ' + esc(v[1] || '(vazio)');
        }).join('; ');
        var como = h.acao === 'condominio_importado' ? ' (importação)' : h.acao === 'carteira_transferida' ? ' (transferência de carteira)' : '';
        return '<div class="evento sistema"><span class="ponto"></span><div><b>' + esc(h.usuario_nome || 'Sistema') + '</b> ' + o + esc(como) + ' <span class="sec" style="display:inline">· ' + quando(h.quando) + '</span></div></div>';
      }).join('');
      var m = modal({
        titulo: novo ? 'Novo condomínio' : c.nome, largo: true,
        corpo: '<form class="pilha" id="fCond" novalidate>' +
          '<div class="grade-3">' + campo('cdCodigo', 'ID', c.codigo, novo ? ' placeholder="automático"' : '') +
          '<div><label class="rot" for="cdSit">Situação</label><select class="campo" id="cdSit"' + (ro ? ' disabled' : '') + '>' +
            unicos(j.situacoes.concat([c.situacao])).map(function (s) { return '<option value="' + esc(s) + '"' + (s === c.situacao ? ' selected' : '') + '>' + esc((CART_SIT[s] || [s])[0]) + '</option>'; }).join('') + '</select></div>' +
          campo('cdUf', 'UF (comarca)', c.comarca, ' maxlength="30" list="cdUfs"') + '</div>' +
          campo('cdNome', 'Condomínio', c.nome, ' maxlength="160"') +
          '<div class="grade-2">' + campo('cdRazao', 'Razão social', c.razao_social, ' maxlength="200"') + campo('cdCnpj', 'CNPJ', c.cnpj, ' maxlength="20" inputmode="numeric"') + '</div>' +
          '<div class="grade-3">' + campo('cdVenc', 'Vencimento', c.vencimento, ' maxlength="40" placeholder="10 ou 5º DIA ÚTIL" list="cdVencs"') +
          campo('cdAdm', 'Administradora', c.administradora, ' maxlength="120" list="cdAdms"') + campo('cdEnvio', 'Forma de envio', c.forma_envio, ' maxlength="60" list="cdEnvios"') + '</div>' +
          '<div class="grade-3">' + funcoes.map(function (fn) { return campo('cd_' + fn.campo, esc(fn.rotulo), c[fn.campo], ' maxlength="120" list="cdl_' + fn.campo + '" placeholder="NOME - RAMAL"'); }).join('') + '</div>' +
          '<div class="grade-3">' + campo('cdInicio', 'Início do contrato', c.inicio_contrato, ' type="date"') + '</div>' +
          '<div><label class="rot" for="cdObs">Observações</label><textarea class="campo" id="cdObs" rows="3" maxlength="4000"' + (ro ? ' readonly' : '') + '>' + esc(c.observacoes || '') + '</textarea></div>' +
          lista('cdUfs', conds.map(function (x) { return x.comarca; })) + lista('cdVencs', conds.map(function (x) { return x.vencimento; })) +
          lista('cdAdms', conds.map(function (x) { return x.administradora; })) + lista('cdEnvios', conds.map(function (x) { return x.forma_envio; })) +
          funcoes.map(function (fn) { return lista('cdl_' + fn.campo, conds.map(function (x) { return x[fn.campo]; })); }).join('') +
          '<div id="cdMsg" class="msg erro" hidden></div>' +
          (novo ? '' : '<div class="ajuda">Atualizado em ' + quando(c.atualizado_em) + (c.atualizado_por_nome ? ' por ' + esc(c.atualizado_por_nome) : '') + '.</div>') +
          (hist ? '<hr style="border:0;border-top:1px solid var(--border);margin:4px 0"><div><label class="rot">Histórico</label><div class="linha-tempo">' + hist + '</div></div>' : '') + '</form>',
        pe: (admin && !novo ? '<button class="btn danger" id="btCdApagar" style="margin-right:auto">Remover</button>' : '') +
          '<button class="btn ghost" data-fechar>' + (admin ? 'Cancelar' : 'Fechar') + '</button>' + (admin ? '<button class="btn primary" id="btCdOk">' + (novo ? 'Cadastrar' : 'Salvar') + '</button>' : ''),
      });
      if (!admin) return;
      $('#btCdOk', m).onclick = async function () {
        var corpo = {
          codigo: $('#cdCodigo', m).value, situacao: $('#cdSit', m).value, comarca: $('#cdUf', m).value, nome: $('#cdNome', m).value,
          razao_social: $('#cdRazao', m).value, cnpj: $('#cdCnpj', m).value, vencimento: $('#cdVenc', m).value, administradora: $('#cdAdm', m).value,
          forma_envio: $('#cdEnvio', m).value, inicio_contrato: $('#cdInicio', m).value, observacoes: $('#cdObs', m).value,
        };
        funcoes.forEach(function (fn) { corpo[fn.campo] = $('#cd_' + fn.campo, m).value; });
        var msg = $('#cdMsg', m);
        if (!corpo.nome.trim()) { msg.textContent = 'Informe o nome do condomínio.'; msg.hidden = false; return; }
        if (!novo && !corpo.codigo.trim()) { msg.textContent = 'Informe o ID.'; msg.hidden = false; return; }
        var bt = this; bt.disabled = true;
        try {
          if (novo) await api('POST', '/api/carteira', corpo); else await api('PATCH', '/api/carteira/' + c.id, corpo);
          m.fechar();
          toast(novo ? 'Condomínio cadastrado.' : 'Condomínio atualizado.', 'ok');
          paginaCarteira(aba);
        } catch (e) { msg.textContent = e.message; msg.hidden = false; bt.disabled = false; }
      };
      if ($('#btCdApagar', m)) $('#btCdApagar', m).onclick = async function () {
        if (!(await confirmar('Remover ' + c.nome + '?', 'O condomínio sai da carteira. Se ele apenas deixou de ser atendido, prefira mudar a situação para Distratado e manter o histórico.', 'Remover', true))) return;
        try { await api('DELETE', '/api/carteira/' + c.id); m.fechar(); toast('Condomínio removido.', 'ok'); paginaCarteira(aba); } catch (e) { toast(e.message, 'erro'); }
      };
    }
  }

  /* ---------- admin: equipes e tipos de demanda ---------- */
  async function paginaEquipes() {
    definirBarra('<span class="setor">Administração</span><span class="sep">/</span><span class="nome">Equipes e tipos de demanda</span>');
    $('#conteudo').innerHTML = carregandoHtml();
    var j;
    try { j = await api('GET', '/api/admin/equipes'); await carregarMeta(); } catch (e) { toast(e.message, 'erro'); return; }
    var nomeU = {};
    j.usuarios.forEach(function (u) { nomeU[u.id] = u.nome; });
    var em = j.email || {};
    $('#conteudo').innerHTML = '<div class="pagina"><h1>Equipes e tipos de demanda</h1><p class="sub">Para cada setor, quem atende os tickets (e quem é líder, que distribui) e os tipos de demanda com o prazo de atendimento.</p>' +
      '<div class="atalho-tickets"><div class="icone-mod">' + IC.sino + '</div><div style="flex:1;min-width:220px"><b style="font-family:var(--display)">Avisos por e-mail</b>' +
      '<span class="sec" style="display:block;color:var(--muted);font-weight:600;font-size:13px">' +
      (em.ativo ? 'Enviando ' + (em.tipo === 'microsoft365' ? 'pelo Microsoft 365' : 'por SMTP') + ' como <b>' + esc(em.remetente || '') + '</b>.' : 'Não configurado: por enquanto os avisos aparecem só no portal (veja o README, seção Central de Tickets).') +
      '</span></div>' + (em.ativo ? '<button class="btn ghost sm" id="btEmailTeste">Enviar e-mail de teste para mim</button>' : '<span class="etiqueta ambar">sem e-mail</span>') + '</div>' +
      '<div class="cartoes">' + j.setores.map(function (s) {
        var lideres = s.membros.filter(function (m) { return m.lider; }).map(function (m) { return nomeU[m.usuario_id]; });
        var ativos = s.categorias.filter(function (c) { return c.ativo; });
        return '<div class="cartao" data-setor="' + s.id + '" style="cursor:pointer"><div class="cab"><div class="icone-mod">' + IC.pessoas + '</div><div style="flex:1;min-width:0"><h3>' + esc(s.nome) + '</h3>' +
          '<span class="sec">' + s.membros.length + ' pessoa' + (s.membros.length === 1 ? '' : 's') + ' · ' + ativos.length + ' tipo' + (ativos.length === 1 ? '' : 's') + ' de demanda</span></div>' +
          (!s.membros.length ? '<span class="etiqueta ambar">sem equipe</span>' : !lideres.length ? '<span class="etiqueta ambar">sem líder</span>' : '') + '</div>' +
          '<p>' + (lideres.length ? 'Líder: ' + esc(lideres.join(', ')) : 'Defina quem distribui os tickets deste setor.') + '</p>' +
          '<div class="acoes"><span class="btn ghost sm">Configurar</span></div></div>';
      }).join('') + '</div><p class="ajuda" style="margin-top:14px">Para criar, renomear ou remover setores use <a href="#/admin/modulos">Módulos e dados → Setores</a>.</p></div>';
    if ($('#btEmailTeste')) $('#btEmailTeste').onclick = async function () {
      var bt = this; bt.disabled = true;
      try { var r = await api('POST', '/api/admin/equipes/email-teste'); toast('E-mail de teste enviado para ' + r.para + '. Confira a caixa de entrada (e o lixo eletrônico).', 'ok'); }
      catch (e) { toast(e.message, 'erro'); }
      bt.disabled = false;
    };
    $$('[data-setor]').forEach(function (c) { c.onclick = function () { editarEquipe(j.setores.find(function (s) { return s.id === Number(c.getAttribute('data-setor')); })); }; });

    function editarEquipe(s) {
      var membros = {};
      s.membros.forEach(function (m) { membros[m.usuario_id] = m.lider; });
      var m = modal({
        titulo: s.nome, largo: true,
        corpo: '<div class="pilha"><div><label class="rot">Equipe que atende os tickets do setor</label>' +
          '<input class="campo" id="eBusca" placeholder="Filtrar pessoas…" style="margin-bottom:8px">' +
          '<div class="caixa-opcoes" id="eLista">' + j.usuarios.filter(function (u) { return u.ativo || membros[u.id] !== undefined; }).map(function (u) {
            var dentro = membros[u.id] !== undefined;
            return '<label data-nome="' + esc(normal(u.nome + ' ' + u.email)) + '"><input type="checkbox" name="eMembro" value="' + u.id + '"' + (dentro ? ' checked' : '') + '>' +
              '<span style="flex:1">' + esc(u.nome) + ' <span class="sec" style="display:inline">' + esc(u.email) + '</span></span>' +
              '<span class="linha" style="font-size:12.5px;font-weight:700;color:var(--muted)"><input type="checkbox" name="eLider" value="' + u.id + '"' + (membros[u.id] ? ' checked' : '') + (dentro ? '' : ' disabled') + '> líder</span></label>';
          }).join('') + '</div><div class="ajuda">Líder: vê a fila do setor e distribui para qualquer pessoa da equipe. Demais pessoas: veem a fila, assumem tickets e tratam os que estão com elas.</div></div>' +
          '<div class="linha"><button class="btn primary" id="btSalvarEquipe">Salvar equipe</button></div>' +
          '<hr style="border:0;border-top:1px solid var(--border);margin:6px 0">' +
          '<div><label class="rot">Tipos de demanda</label><div class="caixa-opcoes" style="max-height:none">' +
          (s.categorias.map(function (c) {
            return '<div class="linha" style="padding:8px 12px;border-bottom:1px solid var(--border)" data-cat="' + c.id + '">' +
              '<input class="campo" style="flex:2;min-width:160px" data-campo="nome" value="' + esc(c.nome) + '">' +
              '<input class="campo" style="width:110px" type="number" min="1" data-campo="prazo_horas" value="' + (c.prazo_horas || '') + '" placeholder="h úteis" title="Prazo em horas de expediente">' +
              '<select class="campo" style="width:120px" data-campo="prioridade">' + ['baixa', 'media', 'alta', 'urgente'].map(function (p) { return '<option value="' + p + '"' + (p === c.prioridade ? ' selected' : '') + '>' + PRIO[p][0] + '</option>'; }).join('') + '</select>' +
              '<label class="linha" style="font-size:12.5px;font-weight:700;color:var(--muted)"><input type="checkbox" data-campo="ativo"' + (c.ativo ? ' checked' : '') + '> ativo</label>' +
              '<button class="btn icon danger" data-apagar-cat="' + c.id + '" title="' + (c.tickets ? 'Já usado em ' + c.tickets + ' ticket(s): desative em vez de remover' : 'Remover tipo') + '"' + (c.tickets ? ' disabled' : '') + '>' + IC.fechar + '</button></div>';
          }).join('') || '<div class="sec" style="padding:12px">Nenhum tipo cadastrado. Sem tipo, o prazo segue a prioridade.</div>') + '</div></div>' +
          '<div class="linha"><input class="campo" id="nCat" placeholder="Novo tipo (ex.: 2ª via de boleto)" style="flex:2;min-width:180px"><input class="campo" id="nPrazo" type="number" min="1" placeholder="h úteis" style="width:110px">' +
          '<select class="campo" id="nPrio" style="width:120px">' + ['baixa', 'media', 'alta', 'urgente'].map(function (p) { return '<option value="' + p + '"' + (p === 'media' ? ' selected' : '') + '>' + PRIO[p][0] + '</option>'; }).join('') + '</select>' +
          '<button class="btn ghost" id="btAddCat">' + IC.mais + 'Adicionar</button></div>' +
          '<div class="ajuda">Prazo em horas de expediente (' + esc(textoExpediente()) + '; 9 h = 1 dia útil), contado da abertura. Em branco: usa o padrão da prioridade (urgente 4 h, alta 1 dia útil, média 3 dias úteis, baixa 5 dias úteis).</div>' +
          '<div class="linha"><button class="btn primary" id="btSalvarCats">Salvar tipos</button></div></div>',
        pe: '<button class="btn ghost" data-fechar>Fechar</button>',
        aoFechar: function () { metaTickets = null; },
      });
      $('#eBusca', m).oninput = function () {
        var t = normal(this.value);
        $$('#eLista label[data-nome]', m).forEach(function (l) { l.hidden = t && l.getAttribute('data-nome').indexOf(t) < 0; });
      };
      $$('input[name=eMembro]', m).forEach(function (cb) {
        cb.onchange = function () { var l = $('input[name=eLider][value="' + cb.value + '"]', m); l.disabled = !cb.checked; if (!cb.checked) l.checked = false; };
      });
      $('#btSalvarEquipe', m).onclick = async function () {
        var lista = $$('input[name=eMembro]:checked', m).map(function (cb) { return { usuario_id: Number(cb.value), lider: $('input[name=eLider][value="' + cb.value + '"]', m).checked }; });
        try { await api('PUT', '/api/admin/equipes/' + s.id + '/membros', { membros: lista }); toast('Equipe de ' + s.nome + ' salva.', 'ok'); m.fechar(); paginaEquipes(); } catch (e) { toast(e.message, 'erro'); }
      };
      $('#btAddCat', m).onclick = async function () {
        var nome = $('#nCat', m).value.trim();
        if (!nome) return;
        try {
          await api('POST', '/api/admin/equipes/' + s.id + '/categorias', { nome: nome, prazo_horas: $('#nPrazo', m).value, prioridade: $('#nPrio', m).value });
          m.fechar(); await paginaEquipes();
          var atual = (await api('GET', '/api/admin/equipes')).setores.find(function (x) { return x.id === s.id; });
          if (atual) editarEquipe(atual);
        } catch (e) { toast(e.message, 'erro'); }
      };
      $$('[data-apagar-cat]', m).forEach(function (b) {
        b.onclick = async function () {
          try { await api('DELETE', '/api/admin/categorias/' + b.getAttribute('data-apagar-cat')); b.closest('[data-cat]').remove(); toast('Tipo removido.', 'ok'); } catch (e) { toast(e.message, 'erro'); }
        };
      });
      $('#btSalvarCats', m).onclick = async function () {
        try {
          var linhas = $$('[data-cat]', m);
          for (var i = 0; i < linhas.length; i++) {
            var l = linhas[i];
            var c = s.categorias.find(function (x) { return x.id === Number(l.getAttribute('data-cat')); });
            var novo = { nome: $('[data-campo=nome]', l).value.trim(), prazo_horas: $('[data-campo=prazo_horas]', l).value ? Number($('[data-campo=prazo_horas]', l).value) : null, prioridade: $('[data-campo=prioridade]', l).value, ativo: $('[data-campo=ativo]', l).checked };
            if (novo.nome !== c.nome || novo.prazo_horas !== c.prazo_horas || novo.prioridade !== c.prioridade || novo.ativo !== c.ativo) await api('PATCH', '/api/admin/categorias/' + c.id, novo);
          }
          toast('Tipos de demanda salvos.', 'ok'); m.fechar(); paginaEquipes();
        } catch (e) { toast(e.message, 'erro'); }
      };
    }
  }

  /* ======================= Central de Links ======================= */
  function editorLinks() { return eu.papel === 'admin' || !!eu.editor_links; }
  function dataBr(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—'; }

  async function paginaLinks(previa) {
    var trilha = '<span class="nome">Central de Links</span>';
    definirBarra(trilha);
    $('#conteudo').innerHTML = carregandoHtml();
    var j;
    try { j = await api('GET', '/api/links' + (previa ? '?campanha=' + previa : '')); } catch (e) { toast(e.message, 'erro'); return; }
    if (j.pode_editar) {
      definirBarra(previa ? '<span class="setor">Central de Links</span><span class="sep">/</span><span class="nome">Pré-visualização</span>' : trilha,
        (previa ? '<a class="btn ghost sm" href="#/links/gestao">Voltar à edição</a>' : '') +
        '<a class="btn ghost sm" href="#/links/gestao">' + IC.lapis + '<span class="so-desktop">Editar links e fundo</span></a>');
    }
    var c = j.campanha;
    var estilo = '';
    if (c && c.fundo_url) estilo += '--fundo:url(\'' + esc(c.fundo_url) + '\');';
    if (c && (c.fundo_celular_url || c.fundo_url)) estilo += '--fundo-celular:url(\'' + esc(c.fundo_celular_url || c.fundo_url) + '\');';
    estilo += '--escurecer:' + ((c ? c.escurecer : 0) / 100) + ';';
    var grupos = [], porNome = {};
    j.links.forEach(function (l) {
      var g = l.grupo || '';
      if (!porNome[g]) { porNome[g] = { nome: g, itens: [] }; grupos.push(porNome[g]); }
      porNome[g].itens.push(l);
    });
    var html = '<div class="central-links' + (c && c.fundo_url ? ' com-fundo' : '') + '" style="' + estilo + '"><div class="cl-coluna">' +
      '<div class="cl-cab"><img src="/img/logo.png" alt="MyBlue" class="cl-logo"><h1>' + esc(j.pagina.titulo) + '</h1>' +
      (j.pagina.subtitulo ? '<p>' + esc(j.pagina.subtitulo) + '</p>' : '') +
      (previa ? '<span class="cl-campanha">' + IC.olho + 'Pré-visualização: ' + esc(c ? c.nome : 'campanha não encontrada') + '</span>' : '') + '</div>';
    if (!j.links.length) {
      html += '<div class="cl-vazio">Nenhum link publicado ainda.' + (j.pode_editar ? '<br><a class="btn primary sm" href="#/links/gestao/links" style="margin-top:12px">' + IC.mais + 'Cadastrar links</a>' : '') + '</div>';
    }
    grupos.forEach(function (g) {
      html += '<section class="cl-grupo">' + (g.nome ? '<h2>' + esc(g.nome) + '</h2>' : '') + g.itens.map(function (l) {
        return '<a class="cl-link" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="cl-icone">' + (IC[l.icone] || IC.link) + '</span><span class="cl-texto"><b>' + esc(l.titulo) + '</b>' +
          (l.descricao ? '<span>' + esc(l.descricao) + '</span>' : '') + '</span>' + IC.novaAba + '</a>';
      }).join('') + '</section>';
    });
    html += '</div></div>';
    $('#conteudo').innerHTML = html;
  }

  async function paginaGestaoLinks(aba) {
    aba = ['campanhas', 'links', 'pagina'].indexOf(aba) >= 0 ? aba : 'campanhas';
    definirBarra('<span class="setor">Central de Links</span><span class="sep">/</span><span class="nome">Editar</span>',
      '<a class="btn ghost sm" href="#/links">' + IC.olho + '<span class="so-desktop">Ver página</span></a>');
    $('#conteudo').innerHTML = carregandoHtml();
    var j;
    try { j = await api('GET', '/api/links/gestao'); } catch (e) { toast(e.message, 'erro'); return; }
    var ABAS = [['campanhas', 'Fundo da campanha'], ['links', 'Links'], ['pagina', 'Título da página']];
    var html = '<div class="pagina"><h1>Central de Links</h1><p class="sub">Troque o fundo a cada campanha e mantenha os links em dia. Tudo o que for salvo aqui aparece na hora para todos do portal.</p>' +
      '<nav class="abas">' + ABAS.map(function (a) { return '<a href="#/links/gestao/' + a[0] + '" class="' + (a[0] === aba ? 'on' : '') + '">' + a[1] + '</a>'; }).join('') + '</nav>';
    if (aba === 'campanhas') html += htmlCampanhas(j);
    if (aba === 'links') html += htmlLinksGestao(j);
    if (aba === 'pagina') {
      html += '<div class="painel" style="padding:18px;max-width:640px"><form id="fPag" class="pilha">' +
        '<div><label class="rot" for="pTit">Título</label><input class="campo" id="pTit" maxlength="120" value="' + esc(j.pagina.titulo) + '"></div>' +
        '<div><label class="rot" for="pSub">Subtítulo (opcional)</label><textarea class="campo" id="pSub" maxlength="300">' + esc(j.pagina.subtitulo) + '</textarea></div>' +
        '<div><button class="btn primary" type="submit">Salvar</button></div></form></div>';
    }
    html += '</div>';
    $('#conteudo').innerHTML = html;
    if (aba === 'campanhas') ligarCampanhas(j);
    if (aba === 'links') ligarLinksGestao(j);
    if (aba === 'pagina') {
      $('#fPag').onsubmit = async function (e) {
        e.preventDefault();
        try { await api('PUT', '/api/links/gestao/pagina', { titulo: $('#pTit').value, subtitulo: $('#pSub').value }); toast('Página atualizada.', 'ok'); } catch (er) { toast(er.message, 'erro'); }
      };
    }
  }

  /* ----- campanhas (fundos) ----- */
  function htmlCampanhas(j) {
    var vig = j.campanhas.find(function (c) { return c.id === j.vigente_id; });
    var html = '<div class="painel"><div class="cab-painel"><div style="flex:1;min-width:220px"><b style="font-family:var(--display)">Campanhas</b>' +
      '<span class="ajuda" style="display:block;margin:2px 0 0">Cada campanha entra no ar sozinha na data de início e fica até começar a próxima. Dá para deixar o mês seguinte pronto com antecedência.</span></div>' +
      '<button class="btn primary sm" id="btNovaCamp">' + IC.mais + 'Nova campanha</button></div>';
    if (!j.campanhas.length) {
      html += '<div style="padding:30px;text-align:center;color:var(--muted);font-weight:700">Nenhuma campanha cadastrada. Enquanto isso, a página usa o fundo padrão MyBlue.</div>';
    } else {
      html += '<div class="lista-campanhas">' + j.campanhas.map(function (c) {
        var situacao = c.id === j.vigente_id ? etq(['no ar agora', 'verde']) : c.inicio > j.hoje ? etq(['agendada', 'azul']) : etq(['encerrada', 'cinza']);
        return '<div class="campanha" data-camp="' + c.id + '">' +
          '<div class="miniatura"' + (c.fundo_url ? ' style="background-image:url(\'' + esc(c.fundo_url) + '\')"' : '') + '>' + (c.fundo_url ? '' : IC.imagem) + '</div>' +
          '<div class="info"><div class="linha" style="gap:8px"><b>' + esc(c.nome) + '</b>' + situacao + (c.tem_fundo ? '' : etq(['sem imagem', 'ambar'])) + '</div>' +
          '<span class="sec">A partir de ' + dataBr(c.inicio) + ' · escurecer ' + c.escurecer + '%' + (c.tem_fundo_celular ? ' · com versão para celular' : '') + '</span></div>' +
          '<div class="linha" style="gap:6px"><a class="btn ghost sm" href="#/links/previa/' + c.id + '">' + IC.olho + 'Ver</a><button class="btn ghost sm" data-editar-camp="' + c.id + '">' + IC.lapis + 'Editar</button></div></div>';
      }).join('') + '</div>';
    }
    html += '</div>';
    if (!vig && j.campanhas.length) html += '<div class="msg aviso" style="margin-top:14px">Nenhuma campanha começou ainda: a página está com o fundo padrão MyBlue.</div>';
    return html;
  }

  function ligarCampanhas(j) {
    $('#btNovaCamp').onclick = function () { editarCampanha(j, null); };
    $$('[data-editar-camp]').forEach(function (b) {
      b.onclick = function () { editarCampanha(j, j.campanhas.find(function (c) { return c.id === Number(b.getAttribute('data-editar-camp')); })); };
    });
  }

  function editarCampanha(j, c) {
    var novo = !c;
    var hoje = new Date();
    var proxMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    var p2 = function (n) { return String(n).padStart(2, '0'); };
    c = c || { nome: '', inicio: proxMes.getFullYear() + '-' + p2(proxMes.getMonth() + 1) + '-01', escurecer: 35 };
    var arquivos = { fundo: null, 'fundo-celular': null };
    function zonaImg(qual, rotulo, ajuda, url) {
      return '<div><label class="rot">' + rotulo + '</label><div class="zona-img" id="z-' + qual + '">' +
        '<div class="previa-img"' + (url ? ' style="background-image:url(\'' + esc(url) + '\')"' : '') + '>' + (url ? '' : IC.imagem) + '</div>' +
        '<div class="ajuda" style="margin:0">' + ajuda + '</div><input type="file" accept="image/jpeg,image/png,image/webp" hidden></div></div>';
    }
    var m = modal({
      titulo: novo ? 'Nova campanha' : 'Editar campanha', largo: true,
      corpo: '<div class="pilha"><div class="grade-2">' +
        '<div><label class="rot" for="cNome">Nome da campanha</label><input class="campo" id="cNome" maxlength="100" placeholder="Ex.: Outubro Rosa" value="' + esc(c.nome) + '"></div>' +
        '<div><label class="rot" for="cInicio">Entra no ar em</label><input class="campo" id="cInicio" type="date" value="' + esc(c.inicio) + '"><div class="ajuda">Fica no ar até a data de início da próxima campanha.</div></div></div>' +
        '<div class="grade-2">' +
        zonaImg('fundo', 'Fundo — computador', 'Clique ou arraste a imagem (JPG, PNG ou WEBP, até ' + j.limite_fundo_mb + ' MB). Sugestão: 1920 × 1080 px, deitada.', c.fundo_url) +
        zonaImg('fundo-celular', 'Fundo — celular (opcional)', 'Sugestão: 1080 × 1920 px, em pé. Sem ela, o celular usa a do computador.', c.fundo_celular_url) +
        '</div>' +
        (!novo && c.tem_fundo_celular ? '<label class="linha" style="font-weight:700;font-size:13px"><input type="checkbox" id="cTirarCel"> remover a versão para celular</label>' : '') +
        '<div><label class="rot" for="cEsc">Escurecer o fundo: <span id="cEscV">' + c.escurecer + '%</span></label><input id="cEsc" type="range" min="0" max="85" step="5" value="' + c.escurecer + '" style="width:100%;accent-color:var(--teal)">' +
        '<div class="ajuda">Escurece a imagem para os botões e o título continuarem legíveis. Use 0% se a arte já tiver espaço limpo no meio.</div></div>' +
        '<div id="cMsg" class="msg erro" hidden></div></div>',
      pe: (novo ? '' : '<button class="btn danger" id="btApagarCamp" style="margin-right:auto">Excluir</button>') +
        '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="btSalvarCamp">' + (novo ? 'Criar campanha' : 'Salvar') + '</button>',
    });
    $('#cEsc', m).oninput = function () { $('#cEscV', m).textContent = this.value + '%'; };
    Object.keys(arquivos).forEach(function (qual) {
      var z = $('#z-' + qual, m), inp = $('input[type=file]', z);
      function escolher(f) {
        if (!f) return;
        if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast('Use uma imagem JPG, PNG ou WEBP.', 'erro'); return; }
        if (f.size > j.limite_fundo_mb * 1048576) { toast('Imagem grande demais (máximo ' + j.limite_fundo_mb + ' MB).', 'erro'); return; }
        arquivos[qual] = f;
        var pv = $('.previa-img', z);
        pv.innerHTML = '';
        pv.style.backgroundImage = 'url(\'' + URL.createObjectURL(f) + '\')';
      }
      z.onclick = function () { inp.click(); };
      inp.onchange = function () { escolher(inp.files[0]); inp.value = ''; };
      z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('arrastando'); });
      z.addEventListener('dragleave', function () { z.classList.remove('arrastando'); });
      z.addEventListener('drop', function (e) { e.preventDefault(); z.classList.remove('arrastando'); escolher(e.dataTransfer.files[0]); });
    });
    $('#btSalvarCamp', m).onclick = async function () {
      var bt = this, msg = $('#cMsg', m);
      msg.hidden = true;
      if (novo && !arquivos.fundo) { msg.textContent = 'Escolha a imagem de fundo para computador.'; msg.hidden = false; return; }
      bt.disabled = true;
      try {
        var corpo = { nome: $('#cNome', m).value, inicio: $('#cInicio', m).value, escurecer: Number($('#cEsc', m).value) };
        var id = c.id;
        if (novo) id = (await api('POST', '/api/links/gestao/campanhas', corpo)).id;
        else await api('PATCH', '/api/links/gestao/campanhas/' + id, corpo);
        for (var qual in arquivos) {
          if (arquivos[qual]) await api('PUT', '/api/links/gestao/campanhas/' + id + '/' + qual, arquivos[qual], { bruto: true, headers: { 'Content-Type': arquivos[qual].type } });
        }
        if ($('#cTirarCel', m) && $('#cTirarCel', m).checked && !arquivos['fundo-celular']) await api('DELETE', '/api/links/gestao/campanhas/' + id + '/fundo-celular');
        m.fechar();
        toast(novo ? 'Campanha criada.' : 'Campanha atualizada.', 'ok');
        paginaGestaoLinks('campanhas');
      } catch (e) {
        msg.textContent = e.message; msg.hidden = false; bt.disabled = false;
        if (novo && id) { novo = false; c = { id: id }; } // a campanha já existe: o próximo clique só reenvia a imagem
      }
    };
    if (!novo) {
      $('#btApagarCamp', m).onclick = async function () {
        if (!(await confirmar('Excluir campanha', 'A campanha <b>' + esc(c.nome) + '</b> e as imagens dela serão apagadas.', 'Excluir', true))) return;
        try { await api('DELETE', '/api/links/gestao/campanhas/' + c.id); m.fechar(); toast('Campanha excluída.', 'ok'); paginaGestaoLinks('campanhas'); } catch (e) { toast(e.message, 'erro'); }
      };
    }
  }

  /* ----- links ----- */
  function htmlLinksGestao(j) {
    var html = '<div class="painel"><div class="cab-painel"><div style="flex:1;min-width:220px"><b style="font-family:var(--display)">Links</b>' +
      '<span class="ajuda" style="display:block;margin:2px 0 0">Use as setas para mudar a ordem. Links com o mesmo grupo aparecem juntos, sob o nome do grupo.</span></div>' +
      '<button class="btn ghost sm" id="btColarLinks">' + IC.documento + 'Colar lista de links</button>' +
      '<button class="btn primary sm" id="btNovoLink">' + IC.mais + 'Novo link</button></div>';
    if (!j.links.length) return html + '<div style="padding:30px;text-align:center;color:var(--muted);font-weight:700">Nenhum link cadastrado.</div></div>';
    html += '<div class="tabela-wrap"><table><thead><tr><th style="width:70px">Ordem</th><th>Link</th><th>Grupo</th><th>Situação</th></tr></thead><tbody>' +
      j.links.map(function (l, i) {
        return '<tr class="clicavel" data-link="' + l.id + '"><td style="white-space:nowrap">' +
          '<button class="btn icon ghost" data-mover="-1" title="Subir" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>' + IC.cima + '</button> ' +
          '<button class="btn icon ghost" data-mover="1" title="Descer" aria-label="Descer"' + (i === j.links.length - 1 ? ' disabled' : '') + '>' + IC.baixo + '</button></td>' +
          '<td><div class="linha" style="gap:8px;flex-wrap:nowrap"><span class="icone-mod" style="width:32px;height:32px;border-radius:9px">' + (IC[l.icone] || IC.link) + '</span><div style="min-width:0"><b>' + esc(l.titulo) + '</b>' +
          '<span class="sec" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px">' + esc(l.url) + '</span></div></div></td>' +
          '<td>' + (l.grupo ? esc(l.grupo) : '<span class="sec">—</span>') + '</td>' +
          '<td>' + (l.ativo ? etq(['publicado', 'verde']) : etq(['oculto', 'cinza'])) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    return html;
  }

  function ligarLinksGestao(j) {
    $('#btNovoLink').onclick = function () { editarLink(j, null); };
    $('#btColarLinks').onclick = colarLinks;
    $$('tr[data-link]').forEach(function (tr) {
      var id = Number(tr.getAttribute('data-link'));
      tr.onclick = function () { editarLink(j, j.links.find(function (l) { return l.id === id; })); };
    });
    $$('[data-mover]').forEach(function (b) {
      b.onclick = async function (e) {
        e.stopPropagation();
        var ids = j.links.map(function (l) { return l.id; });
        var id = Number(b.closest('tr').getAttribute('data-link'));
        var i = ids.indexOf(id), k = i + Number(b.getAttribute('data-mover'));
        if (k < 0 || k >= ids.length) return;
        ids[i] = ids[k]; ids[k] = id;
        try { await api('PUT', '/api/links/gestao/ordem', { ids: ids }); paginaGestaoLinks('links'); } catch (er) { toast(er.message, 'erro'); }
      };
    });
  }

  function colarLinks() {
    var m = modal({
      titulo: 'Colar lista de links', largo: true,
      corpo: '<div class="pilha"><div><label class="rot" for="cLista">Uma linha por link: nome, um traço e o endereço</label>' +
        '<textarea class="campo" id="cLista" style="min-height:260px;font-size:13px" placeholder="Lista de Ramais — https://…&#10;Solicitação de Motoboy — https://…"></textarea>' +
        '<div class="ajuda">Pode colar com marcadores (*, -, •). Os links entram no fim da lista, com ícone sugerido pelo nome; links que já existem (mesmo nome e endereço) são pulados. Depois dá para editar cada um.</div></div>' +
        '<div><label class="rot" for="cGrupo">Grupo (opcional)</label><input class="campo" id="cGrupo" maxlength="80" placeholder="Deixe em branco para uma lista única"></div>' +
        '<div id="cRes" class="msg" hidden></div></div>',
      pe: '<button class="btn ghost" data-fechar>Fechar</button><button class="btn primary" id="btImportarLinks">Incluir links</button>',
      aoFechar: function () { paginaGestaoLinks('links'); },
    });
    $('#btImportarLinks', m).onclick = async function () {
      var res = $('#cRes', m);
      try {
        var r = await api('POST', '/api/links/gestao/importar', { texto: $('#cLista', m).value, grupo: $('#cGrupo', m).value });
        res.className = 'msg ' + (r.erros.length ? 'aviso' : 'ok');
        res.innerHTML = r.incluidos + ' link(s) incluído(s)' + (r.repetidos ? ', ' + r.repetidos + ' já existiam' : '') + '.' +
          (r.erros.length ? '<br>Não entendi ' + r.erros.length + ' linha(s): ' + r.erros.map(function (e) { return esc(e.texto) + (e.motivo ? ' (' + esc(e.motivo) + ')' : ''); }).join('; ') : '');
        res.hidden = false;
      } catch (e) { res.className = 'msg erro'; res.textContent = e.message; res.hidden = false; }
    };
  }

  function editarLink(j, l) {
    var novo = !l;
    l = l || { titulo: '', url: 'https://', grupo: '', descricao: '', icone: 'link', ativo: true };
    var grupos = [];
    j.links.forEach(function (x) { if (x.grupo && grupos.indexOf(x.grupo) < 0) grupos.push(x.grupo); });
    var m = modal({
      titulo: novo ? 'Novo link' : 'Editar link',
      corpo: '<form class="pilha" id="fLink" novalidate>' +
        '<div><label class="rot" for="lTit">Nome do botão</label><input class="campo" id="lTit" maxlength="120" value="' + esc(l.titulo) + '"></div>' +
        '<div><label class="rot" for="lUrl">Endereço (link)</label><input class="campo" id="lUrl" type="url" maxlength="2000" value="' + esc(l.url) + '"><div class="ajuda">Link completo, começando com https://. Também aceita mailto: e tel:.</div></div>' +
        '<div class="grade-2"><div><label class="rot" for="lGrupo">Grupo (opcional)</label><input class="campo" id="lGrupo" maxlength="80" list="lGrupos" value="' + esc(l.grupo) + '" placeholder="Ex.: Formulários">' +
        '<datalist id="lGrupos">' + grupos.map(function (g) { return '<option value="' + esc(g) + '">'; }).join('') + '</datalist></div>' +
        '<div><label class="rot" for="lIcone">Ícone</label><select class="campo" id="lIcone">' + j.icones.map(function (i) { return '<option value="' + i + '"' + (i === l.icone ? ' selected' : '') + '>' + esc(ROTULO_ICONE[i] || i) + '</option>'; }).join('') + '</select></div></div>' +
        '<div><label class="rot" for="lDesc">Descrição curta (opcional)</label><input class="campo" id="lDesc" maxlength="300" value="' + esc(l.descricao) + '"></div>' +
        '<label class="linha" style="font-weight:700"><input type="checkbox" id="lAtivo"' + (l.ativo ? ' checked' : '') + '> Publicado (desmarque para esconder sem apagar)</label>' +
        '<div id="lMsg" class="msg erro" hidden></div></form>',
      pe: (novo ? '' : '<button class="btn danger" id="btApagarLink" style="margin-right:auto">Excluir</button>') +
        '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="btSalvarLink">' + (novo ? 'Incluir' : 'Salvar') + '</button>',
    });
    $('#btSalvarLink', m).onclick = async function () {
      var corpo = { titulo: $('#lTit', m).value, url: $('#lUrl', m).value, grupo: $('#lGrupo', m).value, descricao: $('#lDesc', m).value, icone: $('#lIcone', m).value, ativo: $('#lAtivo', m).checked };
      try {
        if (novo) await api('POST', '/api/links/gestao/links', corpo); else await api('PATCH', '/api/links/gestao/links/' + l.id, corpo);
        m.fechar(); toast(novo ? 'Link incluído.' : 'Link atualizado.', 'ok'); paginaGestaoLinks('links');
      } catch (e) { var x = $('#lMsg', m); x.textContent = e.message; x.hidden = false; }
    };
    if (!novo) {
      $('#btApagarLink', m).onclick = async function () {
        if (!(await confirmar('Excluir link', 'O link <b>' + esc(l.titulo) + '</b> sai da Central de Links.', 'Excluir', true))) return;
        try { await api('DELETE', '/api/links/gestao/links/' + l.id); m.fechar(); toast('Link excluído.', 'ok'); paginaGestaoLinks('links'); } catch (e) { toast(e.message, 'erro'); }
      };
    }
  }

  /* ======================= admin: auditoria ======================= */
  var ROTULO_ACAO = {
    login: 'Entrou no portal', login_falha: 'Tentativa de login falhou', logout: 'Saiu', senha_alterada: 'Trocou a senha', senha_redefinida: 'Redefiniu senha de usuário',
    modulo_aberto: 'Abriu ferramenta', dados_gravados: 'Salvou dados (automático)', usuario_criado: 'Criou usuário', usuario_editado: 'Editou usuário',
    modulo_criado: 'Criou módulo', modulo_editado: 'Editou módulo', modulo_removido: 'Removeu módulo', arquivo_enviado: 'Enviou HTML', versao_restaurada: 'Restaurou versão',
    dados_importados: 'Importou dados da planilha', dados_exportados: 'Exportou dados', backup_baixado: 'Baixou backup', setor_criado: 'Criou setor', setor_editado: 'Editou setor', setor_removido: 'Removeu setor',
    registro_add: 'Incluiu registro', registro_update: 'Alterou registro', registro_delete: 'Excluiu registro', registro_upsert: 'Gravou registro', registro_addMany: 'Incluiu registros em lote', registro_replaceAll: 'Regravou a aba inteira', registro_dedupe: 'Removeu duplicados',
    catalogo_semeado: 'Sistema instalado', email_teste: 'Enviou e-mail de teste',
    setores_oficiais: 'Setores oficiais cadastrados', ticket_criado: 'Abriu ticket', ticket_atribuicao: 'Atribuiu ticket', ticket_transferencia: 'Transferiu ticket',
    ticket_status: 'Mudou situação de ticket', equipe_editada: 'Editou equipe do setor', categoria_criada: 'Criou tipo de demanda', categoria_editada: 'Editou tipo de demanda', categoria_removida: 'Removeu tipo de demanda',
    links_pagina: 'Editou a Central de Links', link_criado: 'Incluiu link', link_editado: 'Editou link', link_removido: 'Removeu link',
    campanha_criada: 'Criou campanha (Central de Links)', campanha_editada: 'Editou campanha (Central de Links)', campanha_removida: 'Removeu campanha (Central de Links)', campanha_fundo: 'Trocou fundo de campanha', links_importados: 'Colou lista de links',
  };

  async function paginaAuditoria() {
    definirBarra('<span class="setor">Administração</span><span class="sep">/</span><span class="nome">Histórico de atividades</span>');
    var usuarios = [], mods = [];
    try { usuarios = (await api('GET', '/api/admin/usuarios')).usuarios; mods = (cacheAdminModulos || await carregarModulosAdmin()).modulos; } catch (e) { toast(e.message, 'erro'); return; }
    var nomeMod = {}; mods.forEach(function (m) { nomeMod[m.slug] = m.nome; });
    $('#conteudo').innerHTML = '<div class="pagina"><h1>Histórico de atividades</h1><p class="sub">Quem entrou, o que abriu e o que alterou nas ferramentas.</p>' +
      '<div class="painel"><div class="cab-painel">' +
      '<select class="campo" id="aUsu" style="max-width:220px"><option value="">Todas as pessoas</option>' + usuarios.map(function (u) { return '<option value="' + u.id + '">' + esc(u.nome) + '</option>'; }).join('') + '</select>' +
      '<select class="campo" id="aMod" style="max-width:260px"><option value="">Todos os módulos</option>' + mods.map(function (m) { return '<option value="' + esc(m.slug) + '">' + esc(m.nome) + '</option>'; }).join('') + '</select>' +
      '<label class="linha" style="font-weight:700;font-size:13px;color:var(--muted)"><input type="checkbox" id="aOcultar" checked> ocultar aberturas e salvamentos automáticos</label></div>' +
      '<div class="tabela-wrap"><table><thead><tr><th>Quando</th><th>Pessoa</th><th>Ação</th><th>Módulo</th><th>Detalhes</th></tr></thead><tbody id="tbAud"></tbody></table></div>' +
      '<div style="padding:12px;text-align:center"><button class="btn ghost sm" id="btMaisAud">Carregar mais</button></div></div></div>';
    var pagina = 0;
    async function carregar(reiniciar) {
      if (reiniciar) { pagina = 0; $('#tbAud').innerHTML = ''; }
      var q = '?limite=100&pagina=' + pagina + '&usuario=' + $('#aUsu').value + '&modulo=' + encodeURIComponent($('#aMod').value) + ($('#aOcultar').checked ? '&ocultar_aberturas=1' : '');
      try {
        var r = await api('GET', '/api/admin/auditoria' + q);
        $('#tbAud').insertAdjacentHTML('beforeend', r.eventos.map(function (e) {
          var det = e.detalhe ? Object.keys(e.detalhe).filter(function (k) { return e.detalhe[k] !== undefined; }).map(function (k) { var v = e.detalhe[k]; return k + ': ' + (typeof v === 'object' ? JSON.stringify(v) : v); }).join(' · ') : '';
          return '<tr><td style="white-space:nowrap">' + quando(e.quando) + '</td><td>' + esc(e.usuario_email || '—') + '</td>' +
            '<td>' + esc(ROTULO_ACAO[e.acao] || e.acao) + '</td><td>' + esc(e.modulo_slug ? (nomeMod[e.modulo_slug] || e.modulo_slug) : '—') + '</td>' +
            '<td>' + (det ? '<code class="det">' + esc(det.length > 220 ? det.slice(0, 220) + '…' : det) + '</code>' : '') + (e.ip ? '<span class="sec">IP ' + esc(e.ip) + '</span>' : '') + '</td></tr>';
        }).join(''));
        if (!r.eventos.length && pagina === 0) $('#tbAud').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);font-weight:700;padding:30px">Nada registrado com esses filtros.</td></tr>';
        $('#btMaisAud').hidden = r.eventos.length < 100;
      } catch (e) { toast(e.message, 'erro'); }
    }
    $('#aUsu').onchange = $('#aMod').onchange = $('#aOcultar').onchange = function () { carregar(true); };
    $('#btMaisAud').onclick = function () { pagina++; carregar(false); };
    carregar(true);
  }

  /* ======================= partida ======================= */
  async function iniciar() {
    try {
      var r = await fetch('/api/auth/eu', { credentials: 'same-origin' });
      if (!r.ok) { location.href = '/login'; return; }
      eu = (await r.json()).usuario;
      if (eu.trocar_senha) { location.href = '/login'; return; }
      var j = await api('GET', '/api/modulos');
      modulos = j.modulos;
      recentes = j.recentes || [];
    } catch (e) {
      document.body.innerHTML = '<div class="pagina-aviso"><div class="aviso-card"><h1>Não foi possível carregar o portal</h1><p>' + esc(e.message) + '</p><a class="btn primary" href="/">Tentar de novo</a></div></div>';
      return;
    }
    try { await carregarMeta(); } catch (e) { /* a central carrega depois */ }
    montarCasca();
    atualizarResumo();
    buscarAvisos();
    $('#btSino').onclick = abrirAvisos;
    setInterval(function () { atualizarResumo(); buscarAvisos(); }, 30 * 1000);
    window.addEventListener('hashchange', rotear);
    rotear();
  }
  iniciar();
})();

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
  /* avatar: foto (se houver) ou iniciais */
  function avatarHtml(u, tam) {
    var estilo = tam ? ' style="width:' + tam + 'px;height:' + tam + 'px;font-size:' + Math.round(tam * 0.38) + 'px"' : '';
    if (u && u.foto_v) return '<span class="avatar"' + estilo + '><img src="/api/usuarios/' + u.id + '/foto?v=' + u.foto_v + '" alt=""></span>';
    return '<span class="avatar"' + estilo + '>' + esc(iniciais(u && u.nome)) + '</span>';
  }
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
    desenharAvatar();
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
      var pendente = Object.keys(statusSync).some(function (k) { return statusSync[k] === 'salvando' || statusSync[k] === 'erro' || statusSync[k] === 'conflito'; });
      if (pendente && !(await confirmar('Sair do portal', 'Ainda há alterações sendo salvas em uma ferramenta. Sair agora pode perder essas alterações.', 'Sair mesmo assim', true))) return;
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/login';
    };

    window.addEventListener('message', function (ev) {
      if (!ev.data || !ev.data.myblue) return;
      var modulo = ev.data.modulo;
      if (ev.origin !== location.origin) {
        // ferramenta isolada (origem "null"): vale só se vier de um dos quadros abertos, e o módulo é o do quadro
        var dono = Object.keys(quadros).find(function (s) { return quadros[s].contentWindow === ev.source; });
        if (ev.origin !== 'null' || !dono) return;
        modulo = dono;
      }
      statusSync[modulo] = ev.data.tipo;
      if (modulo === atual) desenharStatus();
    });
    window.addEventListener('beforeunload', function (e) {
      var pendente = Object.keys(statusSync).some(function (k) { return statusSync[k] === 'salvando' || statusSync[k] === 'erro' || statusSync[k] === 'conflito'; });
      if (pendente) { e.preventDefault(); e.returnValue = ''; }
    });
    // confere a sessão de tempos em tempos
    setInterval(function () { fetch('/api/auth/eu', { credentials: 'same-origin' }).then(function (r) { if (r.status === 401) sessaoExpirada(); }).catch(function () {}); }, 5 * 60 * 1000);
  }

  function desenharAvatar() {
    var a = $('#avatar');
    a.innerHTML = eu.foto_v ? '<img src="/api/usuarios/' + eu.id + '/foto?v=' + eu.foto_v + '" alt="">' : esc(iniciais(eu.nome));
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
      '<a href="#/links" class="' + (rota.indexOf('#/links') === 0 ? 'on' : '') + '">' + IC.link + 'Central de Links</a>' +
      ((tutoriais && tutoriais.tutoriais.length) || eu.papel === 'admin' ? '<a href="#/tutoriais" class="' + (rota.indexOf('#/tutoriais') === 0 ? 'on' : '') + '">' + IC.video + 'Tutoriais</a>' : '');
    if (!termo) {
      html += '<div class="grupo">Central de Tickets</div>' +
        '<a href="#/tickets" class="' + (rota.indexOf('#/tickets') === 0 && rota.indexOf('#/tickets/painel') !== 0 ? 'on' : '') + '">' + IC.ticket + '<span>Tickets</span>' +
        '<i data-contador="fila" class="contador" hidden></i></a>' +
        (souEquipe() ? '<a href="#/tickets/painel" class="' + (rota.indexOf('#/tickets/painel') === 0 ? 'on' : '') + '">' + IC.grafico + 'Painel de tickets</a>' : '') +
        '<div class="grupo">Carteira</div>' +
        '<a href="#/carteira" class="' + (rota.indexOf('#/carteira') === 0 ? 'on' : '') + '">' + IC.casa + 'Carteira de condomínios</a>' +
        (resumoCredito && resumoCredito.acesso ? '<div class="grupo">Análise de Crédito</div><a href="#/credito" class="' + (rota.indexOf('#/credito') === 0 ? 'on' : '') + '">' + IC.escudo +
          '<span>Análise de Crédito</span><i data-contador="credito" class="contador" hidden></i></a>' : '') +
        (resumoCt && resumoCt.acesso ? '<div class="grupo">Jurídico</div><a href="#/contratos" class="' + (rota.indexOf('#/contratos') === 0 ? 'on' : '') + '">' + IC.documento +
          '<span>Solicitação de Contrato</span><i data-contador="contratos" class="contador" hidden></i></a>' +
          '<a href="#/acompanhamento-contratos" class="' + (rota.indexOf('#/acompanhamento-contratos') === 0 ? 'on' : '') + '">' + IC.historico +
          '<span>Acompanhamento de demandas Jurídicas</span><i data-contador="contratos-acomp" class="contador" hidden></i></a>' +
          (resumoCt.painel ? '<a href="#/dashboard-juridico" class="' + (rota.indexOf('#/dashboard-juridico') === 0 ? 'on' : '') + '">' + IC.grafico + '<span>Dashboard Jurídico</span></a>' : '') : '') +
        (resumoImp && resumoImp.acesso ? '<div class="grupo">Implantação</div><a href="#/implantacao" class="' + (rota.indexOf('#/implantacao') === 0 ? 'on' : '') + '">' + IC.casa +
          '<span>Implantação</span><i data-contador="implantacao" class="contador" hidden></i></a>' : '');
      // Comissões: a ferramenta (só para quem tem acesso) e os demonstrativos de cada pessoa
      var modCom = modulos.find(function (m) { return m.slug === MOD_COMISSAO; });
      var pendC = resumoComissao ? resumoComissao.pendentes + (resumoComissao.planilhas || 0) : 0;
      html += '<div class="grupo">Premiações</div>' +
        (modCom ? '<a href="#/m/' + MOD_COMISSAO + '" data-slug="' + MOD_COMISSAO + '" class="' + (atual === MOD_COMISSAO && rota.indexOf('#/m/') === 0 ? 'on ' : '') + (modCom.ativo ? '' : 'inativo') + '">' +
          IC.grafico + '<span>' + esc(modCom.nome) + '</span>' + (quadros[MOD_COMISSAO] ? '<i class="aberto" title="Aberta"></i>' : '') + '</a>' : '') +
        '<a href="#/premiacoes" class="' + (rota.indexOf('#/premiacoes') === 0 ? 'on' : '') + '">' + IC.documento + '<span>Minhas Premiações</span>' +
          '<i class="contador"' + (pendC ? '' : ' hidden') + ' title="Demonstrativos esperando o seu “Estou ciente” e planilhas para enviar">' + pendC + '</i></a>';
    }
    porSetor(termo ? lista : lista.filter(function (m) { return m.slug !== MOD_COMISSAO; })).forEach(function (g) {
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
        '<a href="#/admin/tutoriais" class="' + (rota.indexOf('#/admin/tutoriais') === 0 ? 'on' : '') + '">' + IC.video + 'Tutoriais em vídeo</a>' +
        '<a href="#/admin/auditoria" class="' + (rota.indexOf('#/admin/auditoria') === 0 ? 'on' : '') + '">' + IC.historico + 'Histórico de atividades</a>';
    } else if (gestorSetor() && !termo) {
      html += '<div class="grupo">Gestão do setor</div>' +
        '<a href="#/admin/usuarios" class="' + (rota.indexOf('#/admin/usuarios') === 0 ? 'on' : '') + '">' + IC.usuarios + 'Usuários do setor</a>' +
        '<a href="#/admin/modulos" class="' + (rota.indexOf('#/admin/modulos') === 0 ? 'on' : '') + '">' + IC.camadas + 'Ferramentas do setor</a>' +
        '<a href="#/admin/equipes" class="' + (rota.indexOf('#/admin/equipes') === 0 ? 'on' : '') + '">' + IC.pessoas + 'Equipe e tipos de demanda</a>';
    }
    $('#nav').innerHTML = html;
    desenharContadorCredito();
    desenharContadorImp();
    desenharContadorCt();
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
    var txt = { salvando: 'salvando…', salvo: '✓ salvo no servidor', erro: '⚠ falha ao salvar — tentando de novo', conflito: '⚠ não salvo: outra pessoa alterou — veja o aviso na ferramenta' }[s] || '';
    el.innerHTML = '<span class="status-sync ' + esc(s) + '">' + txt + '</span>';
    if (s === 'salvo') setTimeout(function () { if (statusSync[atual] === 'salvo') { el.innerHTML = ''; } }, 2500);
  }

  /* ======================= roteamento ======================= */
  function rotear() {
    var h = location.hash || '#/';
    // endereços antigos (avisos e e-mails enviados antes de "Premiações"): levam para os novos
    var novo = h.replace(/^#\/comissoes(?=\/|$)/, '#/premiacoes').replace(/^#\/m\/comissionamento(?=\/|$)/, '#/m/premiacoes');
    if (novo !== h) { location.replace(novo); return; }
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
    if (partes[0] === 'credito') return /^\d+$/.test(partes[1] || '') ? paginaAnaliseCredito(Number(partes[1])) : paginaCredito(partes[1]);
    if (partes[0] === 'implantacao') return /^\d+$/.test(partes[1] || '') ? paginaImplantacaoDetalhe(Number(partes[1])) : paginaImplantacao(partes[1]);
    if (partes[0] === 'contratos') {
      if (/^\d+$/.test(partes[1] || '')) return paginaContratoDetalhe(Number(partes[1]));
      // endereços antigos (abas que mudaram de lugar)
      if (partes[1] === 'painel') { location.replace('#/dashboard-juridico'); return; }
      if (partes[1] === 'assinaturas' || partes[1] === 'controle') { location.replace('#/acompanhamento-contratos/' + partes[1]); return; }
      return paginaContratos('solicitacao', partes[1]);
    }
    if (partes[0] === 'acompanhamento-contratos') return paginaContratos('acompanhamento', partes[1]);
    if (partes[0] === 'dashboard-juridico') return paginaContratos('painel');
    if (partes[0] === 'premiacoes') return paginaComissoes(partes[1]);
    if (partes[0] === 'links') {
      if (partes[1] === 'gestao' && editorLinks()) return paginaGestaoLinks(partes[2]);
      if (partes[1] === 'previa' && editorLinks()) return paginaLinks(Number(partes[2]) || null);
      return paginaLinks(null);
    }
    if (partes[0] === 'admin' && gestorSetor()) {
      if (partes[1] === 'usuarios') return paginaUsuarios();
      if (partes[1] === 'modulos') return paginaModulosCoord();
      if (partes[1] === 'equipes') return paginaEquipes();
    }
    if (partes[0] === 'admin' && eu.papel === 'admin') {
      if (partes[1] === 'equipes') return paginaEquipes();
      if (partes[1] === 'usuarios') return paginaUsuarios();
      if (partes[1] === 'modulos') return paginaModulos();
      if (partes[1] === 'auditoria') return paginaAuditoria();
      if (partes[1] === 'tutoriais') return paginaAdminTutoriais();
    }
    if (partes[0] === 'tutoriais') return partes[1] ? paginaTutorial(decodeURIComponent(partes[1])) : paginaTutoriais();
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
      if (m.isolada) {
        // isolada: origem própria, sem acesso ao portal (o servidor também manda o sandbox no cabeçalho)
        f.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads');
        f.setAttribute('allow', 'clipboard-read *; clipboard-write *; fullscreen *');
      } else f.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen');
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
    $('#conteudo').innerHTML = '<div class="pagina" style="max-width:640px"><h1>Minha conta</h1><p class="sub">' + esc(eu.nome) + ' · ' + esc(eu.email) + ' · ' + (PAPEL[eu.papel] || 'Usuário') + '</p>' +
      '<div class="painel" style="padding:20px;margin-bottom:16px"><h3 style="margin:0 0 14px;font-family:var(--display)">Foto de perfil</h3>' +
      '<div class="linha" style="gap:18px;flex-wrap:nowrap"><div id="fotoPrevia">' + avatarHtml(eu, 84) + '</div>' +
      '<div class="pilha" style="gap:8px"><div class="linha"><label class="btn primary sm" for="inFoto" style="cursor:pointer">' + IC.enviar + 'Escolher foto</label>' +
      '<button class="btn ghost sm" id="btTirarFoto"' + (eu.foto_v ? '' : ' hidden') + '>Remover</button></div>' +
      '<input type="file" id="inFoto" accept="image/*" hidden><div class="ajuda" style="margin:0">JPG ou PNG. A foto é recortada em quadrado e reduzida automaticamente.</div>' +
      '<div id="msgFoto" class="msg" hidden></div></div></div></div>' +
      '<div class="painel" style="padding:20px"><form id="fSenha" class="pilha"><h3 style="margin:0;font-family:var(--display)">Trocar senha</h3>' +
      '<div id="msgSenha" class="msg" hidden></div>' +
      '<div><label class="rot" for="sAtual">Senha atual</label><input class="campo" id="sAtual" type="password" autocomplete="current-password" required></div>' +
      '<div class="grade-2"><div><label class="rot" for="sNova">Nova senha</label><input class="campo" id="sNova" type="password" autocomplete="new-password" required></div>' +
      '<div><label class="rot" for="sNova2">Repita a nova senha</label><input class="campo" id="sNova2" type="password" autocomplete="new-password" required></div></div>' +
      '<div class="ajuda" style="margin-top:-6px">Pelo menos 8 caracteres, com letras e números. Ao trocar, as sessões em outros aparelhos são encerradas.</div>' +
      '<div><button class="btn primary" type="submit">Salvar nova senha</button></div></form></div></div>';
    function msgFoto(tipo, texto) { var m = $('#msgFoto'); m.className = 'msg ' + tipo; m.textContent = texto; m.hidden = !texto; }
    function atualizarFoto(v) {
      eu.foto_v = v;
      $('#fotoPrevia').innerHTML = avatarHtml(eu, 84);
      $('#btTirarFoto').hidden = !v;
      desenharAvatar();
    }
    $('#inFoto').onchange = async function () {
      var f = this.files[0]; this.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { msgFoto('erro', 'Escolha um arquivo de imagem.'); return; }
      msgFoto('aviso', 'Enviando…');
      try {
        var blob = await reduzirFoto(f, 320);
        var r = await fetch('/api/auth/foto', { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob, credentials: 'same-origin' });
        var j = await r.json().catch(function () { return {}; });
        if (!r.ok) throw new Error(j.erro || 'Não foi possível enviar a foto.');
        atualizarFoto(j.foto_v); msgFoto('ok', 'Foto atualizada.');
      } catch (err) { msgFoto('erro', err.message); }
    };
    $('#btTirarFoto').onclick = async function () {
      try { await api('DELETE', '/api/auth/foto'); atualizarFoto(null); msgFoto('ok', 'Foto removida.'); } catch (err) { msgFoto('erro', err.message); }
    };
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

  var PAPEL = { admin: 'Administrador', coordenador: 'Coordenador', supervisor: 'Supervisor', usuario: 'Usuário' };
  /* coordenador e supervisor gerenciam os setores do cadastro deles */
  function gestorSetor() { return eu && (eu.papel === 'coordenador' || eu.papel === 'supervisor'); }

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
    var coord = gestorSetor();
    definirBarra('<span class="setor">' + (coord ? 'Gestão do setor' : 'Administração') + '</span><span class="sep">/</span><span class="nome">' + (coord ? 'Usuários do setor' : 'Usuários e acessos') + '</span>');
    $('#conteudo').innerHTML = '<div class="pagina"><div class="carregando" style="position:static;background:none"><div><div class="giro"></div>Carregando…</div></div></div>';
    var dados, mods;
    try { dados = await api('GET', '/api/admin/usuarios'); mods = coord ? dados.modulos_disponiveis : (await carregarModulosAdmin()).modulos; } catch (e) { toast(e.message, 'erro'); return; }
    var nomeMod = coord ? (dados.nomes_modulos || {}) : {}; mods.forEach(function (m) { nomeMod[m.slug] = m.nome; });

    var nomeSetor = {}; (dados.setores || []).forEach(function (x) { nomeSetor[x.id] = x.nome; });
    Object.keys(dados.nomes_setores || {}).forEach(function (k) { nomeSetor[k] = dados.nomes_setores[k]; });
    $('#conteudo').innerHTML = '<div class="pagina"><h1>' + (coord ? 'Usuários do setor' : 'Usuários e acessos') + '</h1><p class="sub">' +
      (coord ? 'Cadastre as pessoas do seu setor e libere as ferramentas do setor. Aparecem aqui os usuários dos seus setores e os que você criou.' : 'Cadastre as pessoas, escolha o perfil, o setor e quais ferramentas cada uma pode abrir.') + '</p>' +
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
          u.modulos.length ? '<span title="' + esc(u.modulos.map(function (s) { return nomeMod[s] || s; }).join('\n')) + '">' + u.modulos.length + (coord ? ' ferramenta(s)' : ' de ' + mods.length) + '</span>' : '<span class="etiqueta ambar">nenhuma</span>';
        return '<tr class="clicavel" data-id="' + u.id + '"><td><div class="linha" style="flex-wrap:nowrap;gap:10px">' + avatarHtml(u, 34) + '<div><b>' + esc(u.nome) + '</b><span class="sec">' + esc(u.email) + '</span></div></div></td>' +
          '<td>' + (PAPEL[u.papel] || 'Usuário') + (u.setores && u.setores.length ? '<span class="sec">' + esc(u.setores.map(function (x) { return nomeSetor[x] || ''; }).filter(Boolean).join(', ')) + '</span>' : '') + (u.supervisor_tickets ? ' <span class="etiqueta azul">supervisão tickets</span>' : '') + (u.editor_links ? ' <span class="etiqueta azul">central de links</span>' : '') + '</td><td>' + ferr + '</td><td>' + quando(u.ultimo_login) + '</td>' +
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
      u = u || { nome: '', email: '', papel: 'usuario', ativo: true, modulos: [], setores: coord && dados.setores.length === 1 ? [dados.setores[0].id] : [] };
      var setoresU = u.setores || [];
      var blocoSetores = '<div><label class="rot">Setor' + (dados.setores.length > 1 ? '(es)' : '') + '</label><div class="caixa-opcoes" style="max-height:170px">' +
        dados.setores.map(function (x) { return '<label><input type="checkbox" name="uSetor" value="' + x.id + '"' + (setoresU.indexOf(x.id) >= 0 ? ' checked' : '') + '><span>' + esc(x.nome) + '</span></label>'; }).join('') + '</div>' +
        '<div class="ajuda">' + (coord ? 'A pessoa entra na equipe do setor na Central de Tickets.' : 'É o setor da pessoa: forma a equipe do setor na Central de Tickets e, para coordenador e supervisor, define o que eles gerenciam.') + '</div></div>';
      var m = modal({
        titulo: novo ? 'Novo usuário' : 'Editar usuário', largo: true,
        corpo: '<form id="fU" class="pilha" novalidate><div class="grade-2">' +
          '<div><label class="rot" for="uNome">Nome</label><input class="campo" id="uNome" value="' + esc(u.nome) + '" required></div>' +
          '<div><label class="rot" for="uEmail">E-mail (login)</label><input class="campo" id="uEmail" type="email" value="' + esc(u.email) + '" required></div>' +
          '<div><label class="rot" for="uNasc">Data de nascimento</label><input class="campo" id="uNasc" type="date" value="' + esc(u.data_nascimento || '') + '" required></div>' +
          '<div><label class="rot" for="uAdm">Data de admissão</label><input class="campo" id="uAdm" type="date" value="' + esc(u.data_admissao || '') + '" required></div></div>' +
          (!novo && (!u.data_nascimento || !u.data_admissao) ? '<div class="msg aviso" style="margin:0">Complete a data de nascimento e a de admissão: são obrigatórias para salvar.</div>' : '') +
          (coord ? '' :
          '<div><label class="rot">Perfil</label><div class="grade-2">' +
          '<label class="opcao-radio"><input type="radio" name="uPapel" value="usuario"' + (u.papel === 'usuario' || !PAPEL[u.papel] ? ' checked' : '') + '><div><b>Usuário</b><span>Abre só as ferramentas marcadas abaixo.</span></div></label>' +
          '<label class="opcao-radio"><input type="radio" name="uPapel" value="supervisor"' + (u.papel === 'supervisor' ? ' checked' : '') + '><div><b>Supervisor</b><span>Gerencia o(s) setor(es) dele: usuários comuns, ferramentas, equipe e tipos de demanda; na Carteira, o que estiver liberado em Carteira: quem edita. Vê e direciona os tickets de todos os setores. Mesmos poderes do coordenador.</span></div></label>' +
          '<label class="opcao-radio"><input type="radio" name="uPapel" value="coordenador"' + (u.papel === 'coordenador' ? ' checked' : '') + '><div><b>Coordenador</b><span>Gerencia o(s) setor(es) dele: usuários comuns, ferramentas, equipe e tipos de demanda; na Carteira, o que estiver liberado em Carteira: quem edita. Vê e direciona os tickets de todos os setores.</span></div></label>' +
          '<label class="opcao-radio"><input type="radio" name="uPapel" value="admin"' + (u.papel === 'admin' ? ' checked' : '') + '><div><b>Administrador</b><span>Acessa tudo e gerencia usuários, módulos e dados.</span></div></label></div></div>' +
          '<label class="opcao-radio" style="margin:0"><input type="checkbox" id="uSup"' + (u.supervisor_tickets ? ' checked' : '') + '><div><b>Supervisão da Central de Tickets</b>' +
          '<span>Vê os tickets de todos os setores e direciona: troca o responsável, transfere, muda situação, prioridade e prazo. Para quem acompanha a empresa toda (ex.: Gerência). Não dá acesso à administração.</span><span id="uSupPerfil" hidden><b>Já vem com o perfil Coordenador e Supervisor.</b></span></div></label>' +
          '<label class="opcao-radio" style="margin:0"><input type="checkbox" id="uLinks"' + (u.editor_links ? ' checked' : '') + '><div><b>Marketing — Central de Links</b>' +
          '<span>Troca o fundo da campanha do mês e edita os links da Central de Links. Não dá acesso à administração do portal.</span></div></label>') +
          blocoSetores +
          '<div id="blocoMods"><label class="rot">Ferramentas liberadas</label>' + (mods.length ? seletorModulos(mods, u.modulos, 'uMod') : '<div class="ajuda">Você ainda não tem ferramentas para liberar. Peça à administração.</div>') +
          (coord && u.modulos.some(function (s) { return !mods.some(function (x) { return x.slug === s; }); }) ? '<div class="ajuda">Esta pessoa também tem ferramentas de outros setores, liberadas pela administração, que continuam como estão.</div>' : '') +
          (coord ? '' : '<div class="ajuda" id="ajudaGestor" hidden>Coordenador e supervisor já abrem todas as ferramentas dos setores dele. Marque aqui só as de outros setores.</div>') + '</div>' +
          (novo ? '<div><label class="rot" for="uSenha">Senha inicial (opcional)</label><input class="campo" id="uSenha" type="text" autocomplete="off" placeholder="Deixe em branco para gerar uma automaticamente"><div class="ajuda">A pessoa precisará trocar a senha no primeiro acesso.</div></div>' :
            '<label class="linha" style="font-weight:700"><input type="checkbox" id="uAtivo"' + (u.ativo ? ' checked' : '') + '> Usuário ativo (desmarque para bloquear o acesso)</label>') +
          '<div id="uMsg" class="msg erro" hidden></div></form>',
        pe: (novo ? '' : '<button class="btn ghost" id="btResetSenha">Redefinir senha</button><button class="btn ghost" id="btVerAcessos" style="margin-right:auto">Tudo o que acessa</button>') +
          '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="btSalvarU">' + (novo ? 'Criar usuário' : 'Salvar') + '</button>',
      });
      ligarGrupos(m);
      function papelMudou() {
        var r = $('input[name=uPapel]:checked', m);
        $('#blocoMods', m).hidden = !!r && r.value === 'admin';
        var gestor = !!r && (r.value === 'coordenador' || r.value === 'supervisor');
        if ($('#ajudaGestor', m)) $('#ajudaGestor', m).hidden = !gestor;
        // Coordenador e Supervisor já veem e direcionam os tickets de todos os setores (vem com o perfil)
        var sup = $('#uSup', m);
        if (sup) {
          if (gestor) { if (!sup.disabled) sup.dataset.marcado = sup.checked ? '1' : ''; sup.checked = true; sup.disabled = true; }
          else if (sup.disabled) { sup.disabled = false; sup.checked = sup.dataset.marcado === '1'; }
          $('#uSupPerfil', m).hidden = !gestor;
        }
      }
      $$('input[name=uPapel]', m).forEach(function (r) { r.onchange = papelMudou; });
      papelMudou();
      $('#btSalvarU', m).onclick = async function () {
        var corpo = {
          nome: $('#uNome', m).value, email: $('#uEmail', m).value, data_nascimento: $('#uNasc', m).value, data_admissao: $('#uAdm', m).value,
          modulos: $$('input[name=uMod]:checked', m).map(function (i) { return i.value; }),
          setores: $$('input[name=uSetor]:checked', m).map(function (i) { return Number(i.value); }),
        };
        if (!coord) {
          corpo.papel = $('input[name=uPapel]:checked', m).value;
          corpo.supervisor_tickets = $('#uSup', m).checked && !$('#uSup', m).disabled; // no perfil, não precisa marcar
          corpo.editor_links = $('#uLinks', m).checked;
        }
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
        $('#btVerAcessos', m).onclick = function () { verAcessosPessoa(u.id); };
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

  /* tudo o que uma pessoa acessa, num lugar só (perfil, setores, marcações, ferramentas, Carteira, tickets) */
  async function verAcessosPessoa(id) {
    var j;
    try { j = await api('GET', '/api/admin/usuarios/' + id + '/acessos'); } catch (e) { toast(e.message, 'erro'); return; }
    var sim = '<span class="etiqueta verde">sim</span>', nao = '<span class="etiqueta cinza">não</span>';
    var sec = function (t) { return '<h4 style="font-family:var(--display);font-size:15px;margin:18px 0 8px">' + t + '</h4>'; };
    var linha = function (a, b) { return '<div class="linha" style="padding:7px 12px;border-bottom:1px solid var(--border);gap:10px"><span style="flex:1">' + a + '</span><span>' + b + '</span></div>'; };
    var html = '<p class="ajuda" style="margin-top:0"><b>' + esc(j.usuario.nome) + '</b> · ' + esc(j.usuario.email) + ' · perfil <b>' + esc(PAPEL[j.usuario.papel] || 'Usuário') + '</b>' + (j.usuario.ativo ? '' : ' · <b style="color:var(--red)">desativado</b>') + '</p>' +
      sec('Setores e o que gerencia') + '<div class="caixa-opcoes" style="max-height:none">' +
      (j.setores.length ? j.setores.map(function (x) { return linha(esc(x.nome), x.lider ? '<span class="etiqueta azul">líder nos tickets</span>' : 'equipe'); }).join('') : '<div class="ajuda" style="padding:8px 12px;margin:0">Sem setor.</div>') + '</div>' +
      '<div class="ajuda">' + (j.gerencia === 'todos os setores' ? 'Administração: gerencia tudo.' : j.gerencia.length ? 'Gerencia (usuários comuns, ferramentas, equipe e tipos de demanda): ' + esc(j.gerencia.join(', ')) + '.' : 'Não gerencia setor.') + '</div>' +
      sec('Marcações') + '<div class="caixa-opcoes" style="max-height:none">' +
      linha('Supervisão da Central de Tickets (vê e direciona os tickets de todos os setores)', j.marcacoes.supervisor_tickets ? sim + (j.marcacoes.supervisor_tickets_pelo_perfil ? ' <span class="sec" style="display:inline">vem com o perfil</span>' : '') : nao) +
      linha('Marketing — Central de Links (edita a Central de Links)', j.marcacoes.editor_links ? sim : nao) + '</div>' +
      sec('Central de Tickets') + '<div class="caixa-opcoes" style="max-height:none">' +
      linha('Vê os tickets de', j.tickets.todos_setores ? 'todos os setores' : (j.tickets.setores.length ? esc(j.tickets.setores.join(', ')) + ' (e os que abriu)' : 'só os que abriu')) +
      linha('Distribui (responsável, prioridade, prazo) em', j.tickets.todos_setores ? 'todos os setores' : (j.tickets.lider_em.length ? esc(j.tickets.lider_em.join(', ')) : '—')) + '</div>' +
      sec('Carteira de condomínios') + '<div class="caixa-opcoes" style="max-height:none">' + linha('Consultar', sim) +
      j.carteira.map(function (c) { return linha(esc(c.rotulo), c.pode ? sim + (c.motivo ? ' <span class="sec" style="display:inline">' + esc(c.motivo) + '</span>' : '') : nao); }).join('') + '</div>' +
      sec('Ferramentas que abre (' + j.ferramentas.length + ')') + '<div class="caixa-opcoes" style="max-height:none">' +
      (j.ferramentas.length ? j.ferramentas.map(function (f) {
        return linha('<b>' + esc(f.nome) + '</b> <span class="sec" style="display:inline">' + esc(f.setor) + ' · ' + esc(f.motivo) + '</span>' + (f.ativo ? '' : ' <span class="etiqueta cinza">desativada</span>') + (f.pendente ? ' <span class="etiqueta ambar">aguardando aprovação</span>' : ''),
          (f.somente_leitura ? '<span class="etiqueta cinza">só consulta</span>' : '<span class="etiqueta verde">edita</span>') + (f.papeis.length ? ' <span class="etiqueta azul">' + esc(f.papeis.join(', ')) + '</span>' : ''));
      }).join('') : '<div class="ajuda" style="padding:8px 12px;margin:0">Nenhuma.</div>') + '</div>' +
      '<div class="ajuda">Ferramentas: o portal confere quem abre, se edita ou só consulta e os papéis. O que cada papel faz dentro da ferramenta é definido pelo HTML dela.</div>';
    modal({ titulo: 'Tudo o que acessa', largo: true, corpo: html, pe: '<button class="btn primary" data-fechar>Fechar</button>' });
  }

  /* ======================= admin: módulos ======================= */
  var ROTULO_ARM = {
    navegador: ['Só no navegador', 'Como era antes: cada pessoa vê apenas o que salvou no próprio computador.'],
    usuario: ['Banco do portal · por pessoa', 'Salvo no servidor, separado por usuário. Abre igual em qualquer computador.'],
    compartilhado: ['Banco do portal · equipe', 'Salvo no servidor e compartilhado: todos que têm acesso veem e editam os mesmos dados.'],
  };

  /* "Arquivo HTML" da janela do módulo (administrador e coordenador): versões anteriores e envio de versão nova */
  function avisoVersaoPendente(mod) {
    if (!mod.versao_pendente_id) return '';
    var admin = eu.papel === 'admin';
    return '<div class="msg aviso" id="avisoPendente" style="display:grid;gap:8px"><span><b>Versão nova aguardando aprovação</b>, enviada' +
      (mod.pendente_por ? ' por ' + esc(mod.pendente_por) : '') + ' em ' + quando(mod.pendente_em) + (mod.pendente_nome ? ' (' + esc(mod.pendente_nome) + ')' : '') + '. ' +
      (admin ? 'Abra a prévia (isolada, com os dados reais), confira e aprove para pôr em uso.' : 'A versão atual continua em uso até a administração aprovar.') + '</span>' +
      '<div class="linha"><a class="btn ghost sm" target="_blank" rel="noopener" href="/m/' + esc(mod.slug) + '/?versao=' + mod.versao_pendente_id + '">' + IC.novaAba + 'Ver prévia</a>' +
      (admin ? '<button class="btn primary sm" type="button" id="btAprovarVersao">Aprovar e usar</button><button class="btn danger sm" type="button" id="btRecusarVersao">Recusar</button>' : '') + '</div></div>';
  }
  function htmlArquivoModulo(mod) {
    var aprovacao = eu.papel !== 'admin' && !mod.pendente && !mod.isolada && !(mod.config && mod.config.isolada);
    return '<h4 class="titulo-sec">Arquivo HTML</h4>' + avisoVersaoPendente(mod) +
      '<p class="ajuda" style="margin-top:-4px">' + (mod.tem_arquivo ? 'Versão em uso enviada em ' + quando(mod.versao_em) + ' (' + tamanho(mod.tamanho) + ').' : '<b style="color:var(--red)">Nenhum arquivo enviado ainda.</b>') + ' Ao enviar um arquivo novo, a versão anterior fica guardada e pode ser restaurada.' +
      (aprovacao ? ' <b>Esta ferramenta não é isolada: o arquivo novo só entra em uso depois que a administração aprovar.</b>' : '') + '</p>' +
      '<label class="zona-envio" id="zArq">' + IC.enviar + '<div>Clique para escolher ou arraste o arquivo .html desta ferramenta</div><input type="file" accept=".html,.htm,text/html" hidden id="inArq"></label>' +
      '<div id="resArq"></div><details style="margin-top:4px"><summary style="cursor:pointer;font-weight:700;color:var(--ink-2)">Versões anteriores</summary><div id="listaVersoes" class="ajuda">Carregando…</div></details>';
  }
  function ligarArquivoEVersoes(m, mod) {
    // versões (recarrega depois de enviar um arquivo novo)
    function carregarVersoes() { api('GET', '/api/admin/modulos/' + mod.slug + '/versoes').then(function (r) {
      var el = $('#listaVersoes', m);
      if (!el) return;
      if (!r.versoes.length) { el.textContent = 'Nenhuma versão enviada.'; return; }
      el.innerHTML = '<div class="caixa-opcoes" style="margin-top:8px">' + r.versoes.map(function (v) {
        var emUso = v.id === mod.versao_id;
        return '<div class="linha" style="padding:8px 12px;border-bottom:1px solid var(--border)"><span style="flex:1;color:var(--ink-2)"><b>' + quando(v.enviado_em) + '</b> · ' + tamanho(v.tamanho) + (v.nome_original ? ' · ' + esc(v.nome_original) : '') + (v.enviado_por ? ' · por ' + esc(v.enviado_por) : '') + '</span>' +
          '<a class="btn ghost sm" href="/api/admin/modulos/' + esc(mod.slug) + '/versoes/' + v.id + '/arquivo" title="Baixar este HTML">' + IC.baixar + 'Baixar</a>' +
          (emUso ? '<span class="etiqueta verde">em uso</span>' : !v.aprovada ? '<span class="etiqueta ambar">aguardando aprovação</span>' : '<button class="btn ghost sm" data-versao="' + v.id + '">Usar esta</button>') + '</div>';
      }).join('') + '</div>';
      $$('[data-versao]', el).forEach(function (b) {
        b.onclick = async function () {
          try { await api('POST', '/api/admin/modulos/' + mod.slug + '/versoes/' + b.getAttribute('data-versao') + '/usar'); toast('Versão restaurada.', 'ok'); m.fechar(); recarregarQuadro(mod.slug); paginaModulos(); } catch (e) { toast(e.message, 'erro'); }
        };
      });
    }).catch(function () {}); }
    carregarVersoes();

    // versão nova aguardando: a administração aprova ou recusa
    function decidir(acao) {
      return async function () {
        if (acao === 'recusar' && !(await confirmar('Recusar versão nova', 'A versão enviada será apagada e a versão atual continua em uso. Quem enviou é avisado.', 'Recusar', true))) return;
        try {
          var r = await api('POST', '/api/admin/modulos/' + mod.slug + '/versoes/' + mod.versao_pendente_id + '/' + acao);
          toast(acao === 'aprovar' ? 'Versão nova em uso.' + (r.aviso_banco ? ' ' + r.aviso_banco : '') : 'Versão recusada.', acao === 'aprovar' && !r.aviso_banco ? 'ok' : 'aviso');
          m.fechar(); recarregarQuadro(mod.slug); paginaModulos(); recarregarModulosUsuario();
        } catch (e) { toast(e.message, 'erro'); }
      };
    }
    if ($('#btAprovarVersao', m)) $('#btAprovarVersao', m).onclick = decidir('aprovar');
    if ($('#btRecusarVersao', m)) $('#btRecusarVersao', m).onclick = decidir('recusar');

    // envio do arquivo
    ligarZona($('#zArq', m), $('#inArq', m), async function (arquivos) {
      var f = arquivos[0];
      var res = $('#resArq', m);
      res.innerHTML = '<div class="msg aviso" style="margin-top:8px">Enviando ' + esc(f.name) + '…</div>';
      try {
        var r = await api('PUT', '/api/admin/modulos/' + mod.slug + '/arquivo', await f.arrayBuffer(), { bruto: true, headers: { 'X-Nome-Arquivo': encodeURIComponent(f.name) } });
        if (r.aguardando_aprovacao) {
          carregarVersoes();
          res.innerHTML = '<div class="msg aviso" style="margin-top:8px">Arquivo enviado. Ele <b>entra em uso depois que a administração aprovar</b> (ela recebeu o aviso). Até lá, a versão atual continua valendo. ' +
            '<a href="/m/' + esc(mod.slug) + '/?versao=' + r.versao + '" target="_blank" rel="noopener">Ver prévia</a></div>' + (r.aviso ? '<div class="msg aviso" style="margin-top:8px">' + esc(r.aviso) + '</div>' : '');
          return;
        }
        mod.versao_id = r.versao;
        carregarVersoes();
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
  }

  /* Coordenador e supervisor: as ferramentas dos setores dele (HTML, versões e quem pode abrir) */
  /* busca numa tabela: esconde as linhas (tr[data-busca]) que não têm todas as palavras digitadas */
  function ligarBusca(campo, tbody, rotulo, total, palavra, chave) {
    function aplicar() {
      var termos = normal(campo.value).split(/\s+/).filter(Boolean);
      var n = 0;
      $$('tr[data-busca]', tbody).forEach(function (tr) {
        var txt = tr.getAttribute('data-busca');
        var ok = termos.every(function (t) { return txt.indexOf(t) >= 0; });
        tr.hidden = !ok;
        if (ok) n++;
      });
      var vazio = $('tr.sem-resultado', tbody);
      if (vazio) vazio.hidden = n > 0 || !total;
      if (rotulo) rotulo.textContent = termos.length ? n + ' de ' + total + ' ' + palavra : total + ' ' + palavra;
      guardar(chave, campo.value);
    }
    campo.value = lembrar(chave, '');
    campo.oninput = aplicar;
    aplicar();
  }
  function textoBuscaModulo(m) { return normal([m.nome, m.slug, m.setor_nome, m.nome_original, m.descricao].filter(Boolean).join(' ')); }
  var LINHA_SEM_RESULTADO = function (cols) { return '<tr class="sem-resultado" hidden><td colspan="' + cols + '" style="text-align:center;color:var(--muted);font-weight:700;padding:30px">Nenhum módulo encontrado com essa pesquisa.</td></tr>'; };

  /* Quem abre a ferramenta, se edita ou só consulta e com qual papel: a mesma tela para a administração e para a
     coordenação do setor (que pode liberar pessoas de qualquer setor). Os papéis de ferramentas com aba "Acessos"
     própria são lidos e gravados no formato delas. */
  /* Controle de Emissão de Boletos: o cadastro vem da Carteira de condomínios. A 1ª vez a coordenação
     confere aqui (nomes parecidos, condomínios fora da carteira); depois o portal aplica sozinho. */
  async function secaoCarteiraBoletos(cont, slug) {
    cont.innerHTML = '<div class="ajuda">Comparando o cadastro com a Carteira…</div>';
    var p;
    try { p = await api('GET', '/api/admin/modulos/' + slug + '/carteira'); } catch (e) { cont.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>'; return; }
    var MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    var comp = function (c) { return c ? MES[+c.slice(5, 7) - 1] + '/' + c.slice(2, 4) : '—'; };
    var data = function (d) { return d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : 'sem data'; };
    var venc = function (x) { return x.regra === 'Dia útil' ? x.dia + 'º dia útil' : 'dia ' + x.dia; };
    var ROT = { nome: 'Nome', resp: 'Responsável', uf: 'UF', regra: 'Regra', dia: 'Dia', sit: 'Situação', distrato: 'Distrato' };
    var mudancas = function (a) {
      return a ? Object.keys(a.patch).filter(function (f) { return f !== 'desde'; }).map(function (f) {
        var de = a.ant[f], para = a.patch[f];
        if (f === 'distrato') { de = de ? data(de) : '—'; para = para ? data(para) : '—'; }
        return ROT[f] + ': <s style="color:var(--muted)">' + esc(de == null || de === '' ? '—' : de) + '</s> → <b>' + esc(para == null ? '—' : para) + '</b>';
      }).join('<br>') : '';
    };
    var altPor = {}; p.alteracoes.forEach(function (a) { altPor[a.k] = a; });
    var alts = p.alteracoes.filter(function (a) { return a.k.indexOf('a:') === 0; });
    var pend = p.parecidos.length + p.novos.length + alts.length + p.fora.length;
    var marca = function (k, on) { return '<input type="checkbox" data-k="' + esc(k) + '"' + (on ? ' checked' : '') + ' aria-label="Aplicar">'; };
    var tabela = function (titulo, ajuda, cab, linhas) {
      return linhas.length ? '<details open style="margin-top:12px"><summary style="cursor:pointer;font-weight:800">' + titulo + ' (' + linhas.length + ')</summary><p class="ajuda" style="margin:6px 0">' + ajuda + '</p>' +
        '<div class="tabela-wrap" style="max-height:340px;overflow-y:auto"><table><thead><tr><th></th>' + cab.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' + linhas.join('') + '</tbody></table></div></details>' : '';
    };
    cont.innerHTML =
      (p.ativa ? '<div class="msg ok">Automático ligado: quando a Carteira muda ou uma competência é criada, o controle recebe as mudanças a partir de <b>' + comp(p.comp) + '</b> (primeira competência ainda sem emissão).</div>'
        : '<div class="msg aviso">Confira e aplique uma vez. Depois disso, cada mudança na Carteira (e cada competência criada) chega sozinha ao controle.</div>') +
      '<p class="ajuda">Vinculados à Carteira pelo ID Vouch: <b>' + p.vinculados + '</b>. As mudanças valem a partir de <b>' + comp(p.comp) + '</b>: os meses em andamento continuam como estão (inclusive o vencimento).</p>' +
      (p.avisos.length ? '<div class="msg aviso">Fora do controle por vencimento não reconhecido na Carteira: ' + p.avisos.map(function (a) { return esc(a.nome) + ' (' + esc(a.motivo) + ')'; }).join(', ') + '.</div>' : '') +
      (!pend ? '<div class="msg ok" style="margin-top:8px">O cadastro do controle está igual à Carteira.</div>' :
        tabela('Nomes parecidos', 'Mesmo condomínio com outra grafia? Marque para vincular (o controle passa a seguir a Carteira). Desmarcado fica para depois.', ['No controle', 'Na Carteira', 'Muda'],
          p.parecidos.map(function (x) {
            return '<tr><td>' + marca(x.k, x.mesma_uf) + '</td><td>' + esc(x.nome) + ' <span class="sec">' + esc(x.uf) + '</span></td><td>' + esc(x.nome_carteira) + ' <span class="sec">' + esc(x.uf_carteira) + '</span>' +
              (x.mesma_uf ? '' : ' <span class="etiqueta ambar">UF diferente</span>') + (x.situacao_carteira === 'DISTRATADO' ? ' <span class="etiqueta cinza">distratado</span>' : '') + '</td><td>' + (mudancas(altPor[x.k]) || '—') + '</td></tr>';
          })) +
        tabela('Novos na Carteira', 'Entram a partir da competência indicada (no mês seguinte à vigência, o 1º boleto sai pela Implantação). Distratados só ficam registrados na aba Distratados.', ['Condomínio', 'Responsável', 'Vencimento', 'Entra'],
          p.novos.map(function (x) {
            var d = x.dados;
            return '<tr><td>' + marca(x.k, true) + '</td><td><b>' + esc(d.nome) + '</b> <span class="sec">' + esc(d.uf) + '</span></td><td>' + esc(d.resp) + '</td><td>' + venc(d) + '</td><td>' + (d.sit === 'Distrato' ? '<span class="etiqueta cinza">distratado</span>' : comp(d.desde)) + '</td></tr>';
          })) +
        tabela('Mudanças da Carteira', 'Distrato, responsável, UF, vencimento ou nome diferentes da Carteira.', ['Condomínio', 'Muda'],
          alts.map(function (a) { return '<tr><td>' + marca(a.k, true) + '</td><td><b>' + esc(a.nome) + '</b></td><td>' + mudancas(a) + '</td></tr>'; })) +
        tabela('No controle e não na Carteira', 'Marque os que devem sair do controle a partir de ' + comp(p.comp) + ' (ficam como distratados).', ['Condomínio', 'Responsável'],
          p.fora.map(function (x) { return '<tr><td>' + marca(x.k, false) + '</td><td><b>' + esc(x.nome) + '</b> <span class="sec">' + esc(x.uf) + '</span></td><td>' + esc(x.resp) + '</td></tr>'; })) +
        '<div class="linha" style="margin-top:12px"><button class="btn primary sm" type="button" id="btAplicarCarteira">Aplicar no controle</button><span class="ajuda" style="margin:0">Quem estiver com o controle aberto vê em alguns segundos. Tudo fica no Histórico da ferramenta.</span></div>');
    var bt = $('#btAplicarCarteira', cont);
    if (bt) bt.onclick = async function () {
      // vínculos e mudanças automáticas vão sempre junto: são o que o portal faria sozinho
      var chaves = p.vinculos.map(function (v) { return v.k; }).concat($$('input[data-k]', cont).filter(function (i) { return i.checked; }).map(function (i) { return i.getAttribute('data-k'); }));
      bt.disabled = true;
      try {
        var r = await api('POST', '/api/admin/modulos/' + slug + '/carteira', { chaves: chaves });
        toast(r.aplicadas ? r.aplicadas + ' condomínio(s) atualizado(s) no controle.' : 'Nada para mudar no controle.', 'ok');
        secaoCarteiraBoletos(cont, slug);
      } catch (e) { bt.disabled = false; toast(e.message, 'erro'); }
    };
  }

  async function editorAcessos(cont, slug) {
    cont.innerHTML = '<div class="ajuda">Carregando quem tem acesso…</div>';
    var q;
    try { q = await api('GET', '/api/admin/modulos/' + slug + '/acesso'); } catch (e) { cont.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>'; return; }
    var estado = {};
    q.pessoas.forEach(function (p) { estado[p.id] = { abre: p.abre, consulta: p.somente_leitura, papeis: p.papeis.slice() }; });
    var filtro = lembrar('acessos.filtro', 'com');
    function linha(p) {
      var e = estado[p.id];
      var abre = p.automatico ? '<span class="etiqueta azul" title="' + (p.todos_papeis ? 'Abre todas as ferramentas, com todos os papéis' : 'Abre todas as ferramentas do setor') + '">sempre · ' + esc(p.automatico) + (p.todos_papeis && q.papeis.length ? ' · todos os papéis' : '') + '</span>'
        : '<label class="linha" style="gap:6px;font-weight:700;flex-wrap:nowrap"><input type="checkbox" data-abre="' + p.id + '"' + (e.abre ? ' checked' : '') + '> abre</label>';
      var como = p.automatico ? '<span class="ajuda" style="margin:0">edita</span>'
        : '<select class="campo" data-como="' + p.id + '" style="width:auto;padding:4px 8px"' + (e.abre ? '' : ' disabled') + '><option value="edita">edita</option><option value="consulta"' + (e.consulta ? ' selected' : '') + '>só consulta</option></select>';
      var papeis = q.papeis.map(function (x) {
        return '<td style="text-align:center"><input type="checkbox" aria-label="' + esc(x.nome) + '" data-papel="' + esc(x.id) + '" data-u="' + p.id + '"' + (e.papeis.indexOf(x.id) >= 0 ? ' checked' : '') + (e.abre && !p.todos_papeis ? '' : ' disabled') + (p.todos_papeis ? ' title="A administração tem todos os papéis em todas as ferramentas"' : '') + '></td>';
      }).join('');
      return '<tr data-p="' + p.id + '" data-busca="' + esc(normal([p.nome, p.email, (p.setores || []).join(' ')].join(' '))) + '"><td><b>' + esc(p.nome) + '</b><span class="sec">' + esc((p.setores || []).join(', ') || 'sem setor') + (p.do_setor || p.automatico ? '' : ' · outro setor') + '</span></td>' +
        '<td>' + abre + '</td><td>' + como + '</td>' + papeis + '</tr>';
    }
    function visivel(p) { var e = estado[p.id]; return filtro === 'todas' || e.abre || (filtro === 'setor' && p.do_setor); }
    function desenhar() {
      var lista = q.pessoas.filter(visivel);
      cont.innerHTML = (q.modelo ? '<div class="msg aviso" style="margin-bottom:10px"><span>Os papéis desta ferramenta são os da aba <b>Acessos</b> dela (' + esc(q.modelo) + '). O que você mudar aqui aparece lá, e o que mudarem lá aparece aqui.</span></div>' : '') +
        (!q.papeis.length ? '<p class="ajuda" style="margin-top:0">Esta ferramenta não tem papéis definidos: quem abre usa tudo o que ela oferece.' + (q.pode_definir_papeis ? ' Defina os papéis abaixo, se o HTML separar o que cada um faz.' : '') + '</p>' :
          '<p class="ajuda" style="margin-top:0">' + q.papeis.map(function (x) { return '<b>' + esc(x.nome) + '</b>' + (x.descricao ? ': ' + esc(x.descricao) : ''); }).join('<br>') + '</p>') +
        '<div class="linha" style="margin:10px 0;flex-wrap:wrap;gap:8px">' +
        [['com', 'Com acesso'], ['setor', 'Do setor'], ['todas', 'Todas as pessoas']].map(function (f) { return '<button type="button" class="btn sm ' + (filtro === f[0] ? 'primary' : 'ghost') + '" data-filtro="' + f[0] + '">' + f[1] + '</button>'; }).join('') +
        '<input class="campo" type="search" id="buscaAcesso" placeholder="Buscar pessoa ou setor…" style="max-width:240px;margin-left:auto"></div>' +
        '<div class="tabela-wrap"><table><thead><tr><th>Pessoa</th><th>Acesso</th><th>Como</th>' + q.papeis.map(function (x) { return '<th style="text-align:center">' + esc(x.nome) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        (lista.map(linha).join('') || '<tr><td colspan="' + (3 + q.papeis.length) + '" style="text-align:center;color:var(--muted);padding:20px">Ninguém aqui ainda. Use <b>Todas as pessoas</b> para liberar alguém, inclusive de outro setor.</td></tr>') +
        '</tbody></table></div><div class="linha" style="margin-top:10px"><button class="btn primary sm" type="button" id="btSalvarAcessos">Salvar acessos</button></div>' +
        (q.pode_definir_papeis && !q.modelo ? '<details style="margin-top:14px"><summary style="cursor:pointer;font-weight:700;color:var(--ink-2)">Papéis desta ferramenta (administração)</summary>' +
          '<p class="ajuda">Um papel por linha: <code>identificador | Nome | o que faz</code>. O HTML recebe os papéis de cada pessoa em <code>window.__MYBLUE__.usuario.papeis</code>.</p>' +
          '<textarea class="campo" id="txPapeis" rows="4" placeholder="gestao | Gestão | aprova os pedidos">' + esc(q.papeis.map(function (x) { return x.id + ' | ' + x.nome + (x.descricao ? ' | ' + x.descricao : ''); }).join('\n')) + '</textarea>' +
          '<div class="linha" style="margin-top:8px"><button class="btn ghost sm" type="button" id="btSalvarPapeis">Salvar papéis</button></div></details>' : '');
      var busca = $('#buscaAcesso', cont);
      busca.oninput = function () {
        var termos = normal(busca.value).split(/\s+/).filter(Boolean);
        $$('tr[data-p]', cont).forEach(function (tr) { var t = tr.getAttribute('data-busca'); tr.hidden = !termos.every(function (x) { return t.indexOf(x) >= 0; }); });
      };
      $$('[data-filtro]', cont).forEach(function (b) { b.onclick = function () { filtro = b.getAttribute('data-filtro'); guardar('acessos.filtro', filtro); desenhar(); }; });
      $$('[data-abre]', cont).forEach(function (c) {
        c.onchange = function () {
          estado[Number(c.getAttribute('data-abre'))].abre = c.checked;
          $$('select, [data-papel]', c.closest('tr')).forEach(function (x) { x.disabled = !c.checked; });
        };
      });
      $$('[data-como]', cont).forEach(function (c) { c.onchange = function () { estado[Number(c.getAttribute('data-como'))].consulta = c.value === 'consulta'; }; });
      $$('[data-papel]', cont).forEach(function (c) {
        c.onchange = function () {
          var e = estado[Number(c.getAttribute('data-u'))], id = c.getAttribute('data-papel');
          e.papeis = e.papeis.filter(function (x) { return x !== id; });
          if (c.checked) e.papeis.push(id);
        };
      });
      $('#btSalvarAcessos', cont).onclick = async function () {
        var acessos = q.pessoas.filter(function (p) { return estado[p.id].abre && (!p.automatico || estado[p.id].papeis.length); }).map(function (p) {
          var e = estado[p.id];
          return { usuario_id: p.id, somente_leitura: !p.automatico && e.consulta, papeis: e.papeis };
        });
        try { await api('PUT', '/api/admin/modulos/' + slug + '/acesso', { acessos: acessos }); toast('Acessos salvos.', 'ok'); editorAcessos(cont, slug); } catch (e) { toast(e.message, 'erro'); }
      };
      if ($('#btSalvarPapeis', cont)) $('#btSalvarPapeis', cont).onclick = async function () {
        var papeis = $('#txPapeis', cont).value.split('\n').map(function (l) { return l.split('|').map(function (x) { return x.trim(); }); })
          .filter(function (x) { return x[0]; }).map(function (x) { return { id: x[0], nome: x[1] || x[0], descricao: x[2] || '' }; });
        try { await api('PUT', '/api/admin/modulos/' + slug + '/papeis', { papeis: papeis }); toast('Papéis salvos.', 'ok'); editorAcessos(cont, slug); } catch (e) { toast(e.message, 'erro'); }
      };
    }
    desenhar();
  }

  async function paginaModulosCoord() {
    definirBarra('<span class="setor">Gestão do setor</span><span class="sep">/</span><span class="nome">Ferramentas do setor</span>');
    $('#conteudo').innerHTML = '<div class="pagina"><div class="carregando" style="position:static;background:none"><div><div class="giro"></div>Carregando…</div></div></div>';
    var mods, jm;
    try { jm = await api('GET', '/api/admin/modulos'); mods = jm.modulos; } catch (e) { toast(e.message, 'erro'); return; }
    if (location.hash.indexOf('#/admin/modulos') !== 0) return; // a pessoa já foi para outra tela
    $('#conteudo').innerHTML = '<div class="pagina"><h1>Ferramentas do setor</h1><p class="sub">As ferramentas dos seus setores. Envie uma versão nova do HTML, volte para uma anterior e escolha quem abre cada uma (do seu setor ou de outros), se edita ou só consulta e com qual papel.</p>' +
      '<div class="painel"><div class="cab-painel"><b style="font-family:var(--display)" id="qtdMods"></b><span class="espaco"></span>' +
      '<button class="btn ghost" id="btCartAcessos">' + IC.casa + 'Carteira de condomínios: quem edita</button>' +
      '<button class="btn primary" id="btNovaFerr">' + IC.mais + 'Nova ferramenta</button>' +
      '<input class="campo" id="buscaMod" type="search" placeholder="Pesquisar módulo, setor ou arquivo…" aria-label="Pesquisar módulo" style="max-width:320px"></div>' +
      '<div class="tabela-wrap"><table><thead><tr><th>Módulo</th><th>Setor</th><th>Arquivo em uso</th></tr></thead><tbody id="tbMods">' +
      (mods.map(function (x) {
        return '<tr class="clicavel" data-slug="' + esc(x.slug) + '" data-busca="' + esc(textoBuscaModulo(x)) + '"><td><div class="linha" style="flex-wrap:nowrap"><div class="icone-mod" style="width:34px;height:34px">' + (IC[x.icone] || IC.app) + '</div><div><b>' + esc(x.nome) + '</b>' + (x.pendente ? ' <span class="etiqueta ambar">aguardando aprovação</span>' : '') + (x.ativo ? '' : ' <span class="etiqueta cinza">desativado</span>') + '</div></div></td>' +
          '<td>' + esc(x.setor_nome || '—') + '</td>' +
          '<td>' + (x.tem_arquivo ? quando(x.versao_em) + '<span class="sec">' + tamanho(x.tamanho) + (x.nome_original ? ' · ' + esc(x.nome_original) : '') + '</span>' : '<span class="etiqueta vermelha">sem arquivo</span>') + '</td></tr>';
      }).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--muted);font-weight:700;padding:30px">Nenhuma ferramenta nos seus setores. Peça à administração para conferir o setor no seu cadastro.</td></tr>') +
      LINHA_SEM_RESULTADO(3) + '</tbody></table></div></div></div>';
    ligarBusca($('#buscaMod'), $('#tbMods'), $('#qtdMods'), mods.length, mods.length === 1 ? 'ferramenta' : 'ferramentas', 'busca.modulos.setor');
    $('#btCartAcessos').onclick = editorCarteiraAcessos;
    $('#btNovaFerr').onclick = function () {
      var m = modal({
        titulo: 'Nova ferramenta',
        corpo: '<form class="pilha" novalidate><p style="margin:0;color:var(--muted);font-weight:600">A ferramenta nova fica <b>aguardando a aprovação da administração</b>. Enquanto isso, só a coordenação do setor a abre: envie o HTML, teste e escolha quem vai usar.</p>' +
          '<div class="grade-2"><div><label class="rot" for="nNome">Nome</label><input class="campo" id="nNome" placeholder="Ex.: Controle de Contratos"></div>' +
          '<div><label class="rot" for="nSlug">Identificador (endereço)</label><input class="campo" id="nSlug" placeholder="controle-contratos"><div class="ajuda">Letras minúsculas, números e hífen.</div></div></div>' +
          '<div class="grade-2"><div><label class="rot" for="nSetor">Setor</label><select class="campo" id="nSetor">' + (jm.setores || []).map(function (x) { return '<option value="' + x.id + '">' + esc(x.nome) + '</option>'; }).join('') + '</select></div>' +
          '<div><label class="rot" for="nIcone">Ícone</label><select class="campo" id="nIcone">' + (jm.icones || ['app']).map(function (i) { return '<option value="' + i + '">' + esc(ROTULO_ICONE[i] || i) + '</option>'; }).join('') + '</select></div></div>' +
          '<div><label class="rot" for="nDesc">Descrição</label><textarea class="campo" id="nDesc"></textarea></div><div id="nMsg" class="msg erro" hidden></div></form>',
        pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="btCriarFerr">Cadastrar</button>',
      });
      $('#nNome', m).oninput = function () {
        if (!$('#nSlug', m).dataset.mexido) $('#nSlug', m).value = normal(this.value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
      };
      $('#nSlug', m).oninput = function () { this.dataset.mexido = '1'; };
      $('#btCriarFerr', m).onclick = async function () {
        try {
          var r = await api('POST', '/api/admin/modulos', { nome: $('#nNome', m).value, slug: $('#nSlug', m).value, setor_id: Number($('#nSetor', m).value), icone: $('#nIcone', m).value, descricao: $('#nDesc', m).value });
          m.fechar(); toast('Ferramenta cadastrada. Envie o HTML; a administração foi avisada para aprovar.', 'ok');
          await paginaModulosCoord();
          var tr = $('tr[data-slug="' + r.slug + '"]'); if (tr) tr.click();
          recarregarModulosUsuario();
        } catch (e) { var x = $('#nMsg', m); x.textContent = e.message; x.hidden = false; }
      };
    };
    $$('tr[data-slug]').forEach(function (tr) {
      tr.onclick = function () {
        var mod = mods.find(function (x) { return x.slug === tr.getAttribute('data-slug'); });
        var m = modal({
          titulo: mod.nome, largo: true,
          corpo: '<style>.titulo-sec{font-family:var(--display);font-size:15px;margin:22px 0 10px;padding-top:18px;border-top:1px solid var(--border)}.titulo-sec:first-child{margin-top:0;padding-top:0;border-top:0}</style><div class="pilha">' + htmlArquivoModulo(mod) +
            (mod.pendente ? '<div class="msg aviso">Aguardando a aprovação da administração. Até lá, só a coordenação do setor abre esta ferramenta.</div>' : '') +
            (mod.slug === 'boletos' ? '<h4 class="titulo-sec">Cadastro pela Carteira de condomínios</h4><div id="edCarteira"></div>' : '') +
            '<h4 class="titulo-sec">Quem abre e com qual papel</h4><div id="edAcessos"></div></div>',
          pe: '<a class="btn ghost" href="#/m/' + esc(mod.slug) + '" id="btAbrirMod" style="margin-right:auto">' + IC.novaAba + 'Abrir</a><button class="btn ghost" data-fechar>Fechar</button>',
          aoFechar: function () { if (location.hash.indexOf('#/admin/modulos') === 0) paginaModulosCoord(); },
        });
        $('#btAbrirMod', m).onclick = function () { m.fechar(); };
        ligarArquivoEVersoes(m, mod);
        if ($('#edCarteira', m)) secaoCarteiraBoletos($('#edCarteira', m), mod.slug);
        editorAcessos($('#edAcessos', m), mod.slug);
      };
    });
  }

  async function paginaModulos() {
    if (gestorSetor()) return paginaModulosCoord();
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
      '<div class="painel"><div class="cab-painel"><b style="font-family:var(--display)" id="qtdMods"></b><span class="espaco"></span>' +
      '<button class="btn ghost" id="btSetores">Setores</button>' +
      '<button class="btn ghost" id="btCartAcessos">' + IC.casa + 'Carteira: quem edita</button>' +
      '<button class="btn ghost" id="btLote">' + IC.enviar + 'Enviar vários HTMLs</button>' +
      '<button class="btn ghost" id="btZipMods" title="A versão em uso de cada ferramenta, num arquivo .zip">' + IC.baixar + 'Baixar ferramentas (.zip)</button>' +
      '<button class="btn ghost" id="btBackup" title="Todas as tabelas, com os arquivos (.jsonl.gz). Tem dados de negócio: guarde em local com acesso restrito.">' + IC.baixar + 'Backup do banco</button>' +
      '<button class="btn primary" id="btNovoMod">' + IC.mais + 'Novo módulo</button></div>' +
      '<div class="faixa-busca"><input class="campo" id="buscaMod" type="search" placeholder="Pesquisar módulo, setor ou arquivo…" aria-label="Pesquisar módulo"></div>' +
      '<div class="tabela-wrap"><table><thead><tr><th>Módulo</th><th>Setor</th><th>Arquivo</th><th>Onde ficam os dados</th><th>Situação</th></tr></thead><tbody id="tbMods">' +
      mods.map(function (m) {
        var dados = ROTULO_ARM[m.armazenamento][0];
        if (m.adaptador === 'claude-db') dados = '<span class="etiqueta verde">' + IC.banco + ' banco do portal</span>';
        else if (m.adaptador) dados = (m.fonte_dados === 'interno' ? '<span class="etiqueta verde">' + IC.banco + ' planilha no banco do portal</span>' : '<span class="etiqueta ambar">planilha Google</span>') + (m.armazenamento !== 'navegador' ? '<span class="sec">+ ' + esc(dados) + '</span>' : '');
        else dados = '<span class="etiqueta ' + (m.armazenamento === 'navegador' ? 'cinza' : 'verde') + '">' + esc(dados) + '</span>';
        return '<tr class="clicavel" data-slug="' + esc(m.slug) + '" data-busca="' + esc(textoBuscaModulo(m)) + '"><td><div class="linha" style="flex-wrap:nowrap"><div class="icone-mod" style="width:34px;height:34px">' + (IC[m.icone] || IC.app) + '</div><div><b>' + esc(m.nome) + '</b><span class="sec">/' + esc(m.slug) + '</span></div></div></td>' +
          '<td>' + esc(m.setor_nome || '—') + '</td>' +
          '<td>' + (m.tem_arquivo ? quando(m.versao_em) + '<span class="sec">' + tamanho(m.tamanho) + (m.nome_original ? ' · ' + esc(m.nome_original) : '') + '</span>' : '<span class="etiqueta vermelha">sem arquivo</span>') + '</td>' +
          '<td>' + dados + '</td><td>' + (m.pendente ? '<span class="etiqueta ambar">aguardando aprovação</span>' : m.ativo ? '<span class="etiqueta verde">ativo</span>' : '<span class="etiqueta cinza">desativado</span>') +
          (m.versao_pendente_id ? ' <span class="etiqueta ambar">versão nova aguardando</span>' : '') + (m.config && m.config.isolada ? '' : ' <span class="etiqueta cinza" title="O HTML roda com a sessão de quem abre. Isole em Isolamento, depois de testar.">não isolada</span>') + '</td></tr>';
      }).join('') + LINHA_SEM_RESULTADO(5) + '</tbody></table></div></div></div>';

    ligarBusca($('#buscaMod'), $('#tbMods'), $('#qtdMods'), mods.length, 'módulos', 'busca.modulos');
    $$('tr[data-slug]').forEach(function (tr) { tr.onclick = function () { editarModulo(mods.find(function (m) { return m.slug === tr.getAttribute('data-slug'); })); }; });
    $('#btNovoMod').onclick = novoModulo;
    $('#btSetores').onclick = gerirSetores;
    $('#btCartAcessos').onclick = editorCarteiraAcessos;
    $('#btLote').onclick = envioEmLote;
    $('#btBackup').onclick = function () { location.href = '/api/admin/backup'; };
    $('#btZipMods').onclick = function () { location.href = '/api/admin/modulos-em-uso.zip'; };

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
      var colecoes = mod.config && mod.config.colecoes ? Object.keys(mod.config.colecoes) : [];
      var resumo = {}; (mod.dados_registros || []).forEach(function (r) { resumo[r.colecao] = r; });
      var armRes = mod.dados_armazenamento || [];

      var planilha = !!mod.adaptador && mod.adaptador !== 'claude-db';
      var secPlanilha = '';
      if (mod.adaptador === 'claude-db') {
        var cols = Object.keys(resumo).sort();
        secPlanilha = '<h4 class="titulo-sec">Dados da ferramenta</h4>' +
          '<p class="ajuda" style="margin-top:-4px">Esta ferramenta foi feita como artefato do Claude. No portal, tudo o que ela grava fica no banco do MyBlue, compartilhado com quem tem acesso a ela.</p>' +
          '<div class="caixa-opcoes" style="max-height:none;margin-top:4px">' + (cols.length ? cols.map(function (c) {
            var r = resumo[c];
            return '<div class="linha" style="padding:9px 12px;border-bottom:1px solid var(--border)"><b style="min-width:130px">' + esc(c) + '</b><span class="ajuda" style="margin:0">' + r.total + ' documento(s) · atualizado ' + quando(r.ultima) + '</span><span class="espaco"></span>' +
              (c.indexOf('/') < 0 ? '<a class="btn ghost sm" href="/api/admin/modulos/' + esc(mod.slug) + '/dados/' + esc(c) + '.csv">' + IC.baixar + 'CSV</a>' : '') + '</div>';
          }).join('') : '<div class="ajuda" style="padding:9px 12px;margin:0">Ainda não há dados gravados.</div>') + '</div>' +
          '<div class="linha" style="margin-top:8px"><a class="btn ghost sm" href="/api/admin/modulos/' + esc(mod.slug) + '/dados">' + IC.baixar + 'Baixar tudo (JSON)</a>' +
          '<label class="btn ghost sm" style="cursor:pointer">' + IC.enviar + 'Importar dados (JSON)<input type="file" accept=".json,application/json" hidden id="inDocs"></label></div>' +
          '<div class="ajuda">A importação <b>substitui</b> todos os dados desta ferramenta pelos do arquivo. Use o arquivo de dados exportado do Claude.</div><div id="resDocs"></div>';
      } else if (planilha) {
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
          (mod.pendente ? '<div class="msg aviso linha" style="justify-content:space-between;gap:10px"><span>Ferramenta nova cadastrada pela coordenação, <b>aguardando aprovação</b>. Confira o HTML (botão Abrir) e aprove para liberar às pessoas.</span><button class="btn primary sm" type="button" id="btAprovarMod">Aprovar</button></div>' : '') +
          '<h4 class="titulo-sec">Dados gerais</h4>' +
          '<div class="grade-2"><div><label class="rot" for="mNome">Nome</label><input class="campo" id="mNome" value="' + esc(mod.nome) + '"></div>' +
          '<div><label class="rot" for="mSetor">Setor</label><select class="campo" id="mSetor">' + opcoesSetor(mod.setor_id) + '</select></div></div>' +
          '<div><label class="rot" for="mDesc">Descrição</label><textarea class="campo" id="mDesc">' + esc(mod.descricao) + '</textarea></div>' +
          '<div class="grade-3"><div><label class="rot" for="mIcone">Ícone</label><select class="campo" id="mIcone">' + opcoesIcone(mod.icone) + '</select></div>' +
          '<div><label class="rot" for="mOrdem">Ordem no setor</label><input class="campo" type="number" id="mOrdem" value="' + (mod.ordem || 0) + '"></div>' +
          '<div><label class="rot">Situação</label><label class="linha" style="font-weight:700;padding-top:9px"><input type="checkbox" id="mAtivo"' + (mod.ativo ? ' checked' : '') + '> Módulo ativo</label></div></div>' +

          htmlArquivoModulo(mod) +

          '<h4 class="titulo-sec">Isolamento</h4>' +
          '<label class="opcao-radio"><input type="checkbox" id="mIsolada"' + (mod.config && mod.config.isolada ? ' checked' : '') + '><div><b>Isolar esta ferramenta (recomendado)</b>' +
          '<span>A ferramenta roda separada do portal: o HTML dela não consegue usar a sessão de quem a abre para mexer em outras partes do portal ' +
          '(usuários, outras ferramentas, backup). Ela continua lendo e gravando os próprios dados. Antes de ligar numa ferramenta em uso, abra e teste: ' +
          'o que ela guardar "só no navegador" passa a valer só enquanto a página estiver aberta, e ferramentas que usam IndexedDB ou Web Worker podem não funcionar isoladas.</span></div></label>' +

          // ferramentas do Claude guardam tudo no banco de documentos: esta escolha não se aplica a elas
          '<div' + (mod.adaptador === 'claude-db' ? ' hidden' : '') + '>' +
          '<h4 class="titulo-sec">Onde ficam os dados salvos pela ferramenta</h4>' +
          ['navegador', 'usuario', 'compartilhado'].map(function (k) {
            return '<label class="opcao-radio"><input type="radio" name="mArm" value="' + k + '"' + (mod.armazenamento === k ? ' checked' : '') + '><div><b>' + ROTULO_ARM[k][0] + '</b><span>' + ROTULO_ARM[k][1] + '</span></div></label>';
          }).join('') +
          (armRes.length ? '<div class="ajuda">No banco agora: ' + armRes.map(function (a) { return (a.escopo === '*' ? 'equipe' : 'usuário #' + a.escopo.slice(2)) + ' — ' + a.chaves + ' chave(s), ' + tamanho(a.bytes); }).join(' · ') + '</div>' : '') +
          '<details><summary style="cursor:pointer;font-weight:700;color:var(--ink-2)">Avançado: chaves que ficam só no navegador</summary><input class="campo" id="mLocais" style="margin-top:8px" value="' + esc(((mod.config && mod.config.chaves_locais) || []).join(', ')) + '" placeholder="^staticrypt, rascunho_">' +
          '<div class="ajuda">Expressões separadas por vírgula. Chaves que combinarem continuam apenas no navegador de cada pessoa.</div>' +
          '<label class="fl" for="mLivres" style="margin-top:12px;display:block">Chaves gravadas sem conferir conflito</label><input class="campo" id="mLivres" value="' + esc(((mod.config && mod.config.chaves_livres) || []).join(', ')) + '" placeholder="^pp:conferido$">' +
          '<div class="ajuda">Por padrão, se outra pessoa alterou um dado depois que a página abriu, a gravação é recusada e a ferramenta avisa. Chaves que combinarem aqui (dados calculados, preferências) gravam por cima sem conferir.</div></details></div>' +
          secPlanilha +
          (mod.slug === 'boletos' ? '<h4 class="titulo-sec">Cadastro pela Carteira de condomínios</h4><div id="edCarteira"></div>' : '') +

          '<h4 class="titulo-sec">Quem abre e com qual papel</h4><div id="edAcessos"></div>' +

          '<h4 class="titulo-sec">Cópia dos dados</h4>' +
          '<div class="linha"><a class="btn ghost sm" href="/api/admin/modulos/' + esc(mod.slug) + '/dados">' + IC.baixar + 'Exportar dados deste módulo (JSON)</a>' +
          '<button class="btn danger sm" id="btApagarMod" type="button">Remover módulo</button></div>' +
          '<div id="mMsg" class="msg erro" hidden></div></div>',
        pe: '<a class="btn ghost" href="#/m/' + esc(mod.slug) + '" id="btAbrirMod" style="margin-right:auto">' + IC.novaAba + 'Abrir</a><button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="btSalvarMod">Salvar</button>',
      });
      $('#btAbrirMod', m).onclick = function () { m.fechar(); };

      ligarArquivoEVersoes(m, mod);
      if ($('#edCarteira', m)) secaoCarteiraBoletos($('#edCarteira', m), mod.slug);
      editorAcessos($('#edAcessos', m), mod.slug);
      if ($('#btAprovarMod', m)) $('#btAprovarMod', m).onclick = async function () {
        try { await api('POST', '/api/admin/modulos/' + mod.slug + '/aprovar'); toast('Ferramenta aprovada. As pessoas liberadas já a veem.', 'ok'); m.fechar(); paginaModulos(); recarregarModulosUsuario(); } catch (e) { toast(e.message, 'erro'); }
      };

      // importação dos dados de uma ferramenta do Claude
      if (mod.adaptador === 'claude-db') {
        $('#inDocs', m).onchange = async function (e) {
          var arq = e.target.files[0]; e.target.value = '';
          if (!arq) return;
          var res = $('#resDocs', m);
          var corpo;
          try { corpo = JSON.parse(await arq.text()); } catch (x) { corpo = null; }
          if (!corpo || !corpo.documentos || typeof corpo.documentos !== 'object') { res.innerHTML = '<div class="msg erro" style="margin-top:8px">Este arquivo não é um arquivo de dados do portal.</div>'; return; }
          var n = Object.keys(corpo.documentos).length;
          if (!(await confirmar('Importar dados', 'Os dados atuais de <b>' + esc(mod.nome) + '</b> serão <b>substituídos</b> pelos ' + n + ' documento(s) do arquivo. Quem estiver com a ferramenta aberta passa a ver os dados novos em alguns segundos.', 'Importar'))) return;
          try {
            var r = await api('POST', '/api/admin/modulos/' + mod.slug + '/documentos', corpo);
            res.innerHTML = '<div class="msg ok" style="margin-top:8px">' + r.total + ' documento(s) importado(s).</div>';
            toast('Dados importados.', 'ok');
            paginaModulos();
          } catch (x) { res.innerHTML = '<div class="msg erro" style="margin-top:8px">' + esc(x.message) + '</div>'; }
        };
      }

      // importação da planilha Google
      if (planilha) {
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
        var fonte = planilha ? $('input[name=mFonte]:checked', m).value : undefined;
        var avisos = [];
        if (arm !== mod.armazenamento) avisos.push('Mudar onde os dados ficam faz a ferramenta começar a usar outro local: o que estava salvo no local anterior não é copiado automaticamente.');
        if (fonte && fonte !== mod.fonte_dados) avisos.push(fonte === 'interno' ? 'A ferramenta passará a gravar no banco do portal. Confira se os dados da planilha Google já foram importados.' : 'A ferramenta voltará a gravar na planilha Google. O que foi lançado no banco do portal não é enviado para a planilha.');
        if (avisos.length && !(await confirmar('Confirmar mudança', avisos.join('<br><br>'), 'Salvar mesmo assim'))) return;
        try {
          await api('PATCH', '/api/admin/modulos/' + mod.slug, {
            nome: $('#mNome', m).value, descricao: $('#mDesc', m).value, setor_id: $('#mSetor', m).value || null,
            icone: $('#mIcone', m).value, ordem: Number($('#mOrdem', m).value) || 0, ativo: $('#mAtivo', m).checked,
            armazenamento: arm, fonte_dados: fonte, isolada: $('#mIsolada', m).checked,
            chaves_locais: $('#mLocais', m).value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
            chaves_livres: $('#mLivres', m).value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
          });
          m.fechar(); toast('Módulo salvo.', 'ok');
          if (arm !== mod.armazenamento || fonte !== mod.fonte_dados || $('#mIsolada', m).checked !== !!(mod.config && mod.config.isolada)) {
            // o sandbox do quadro só muda criando o quadro de novo
            if (quadros[mod.slug]) { quadros[mod.slug].remove(); delete quadros[mod.slug]; }
          }
          paginaModulos(); recarregarModulosUsuario();
        } catch (e) { var x = $('#mMsg', m); x.textContent = e.message; x.hidden = false; }
      };
    }
  }

  /* recorta no centro em quadrado e reduz (a foto sai com poucos KB) */
  function reduzirFoto(arquivo, lado) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(arquivo);
      var img = new Image();
      img.onload = function () {
        var m = Math.min(img.naturalWidth, img.naturalHeight);
        var c = document.createElement('canvas'); c.width = c.height = lado;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lado, lado);
        ctx.drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, lado, lado);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Não foi possível processar a imagem.')); }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Não consegui abrir essa imagem.')); };
      img.src = url;
    });
  }

  function ligarZona(zona, input, aoEscolher, aceita, aviso) {
    aceita = aceita || /\.html?$/i;
    input.onchange = function () { if (input.files.length) aoEscolher(Array.prototype.slice.call(input.files)); input.value = ''; };
    zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.classList.add('arrastando'); });
    zona.addEventListener('dragleave', function () { zona.classList.remove('arrastando'); });
    zona.addEventListener('drop', function (e) {
      e.preventDefault(); zona.classList.remove('arrastando');
      var fs = Array.prototype.slice.call(e.dataTransfer.files).filter(function (f) { return aceita.test(f.name); });
      if (fs.length) aoEscolher(fs); else toast(aviso || 'Envie arquivos .html', 'erro');
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
    novo: 'Ainda não iniciado.', em_andamento: 'Alguém do setor está tratando.',
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
  /* contagem até uma data: "vence em 3 h" / "⚠ atrasado 1 h" */
  function contagem(data, aberto) {
    if (!data) return '<span class="sec">sem prazo</span>';
    var falta = new Date(data) - Date.now();
    if (!aberto) return '<span title="' + esc(quando(data)) + '">' + quando(data) + '</span>';
    if (falta < 0) return '<span class="etiqueta vermelha" title="Prazo: ' + esc(quando(data)) + '">⚠ atrasado ' + duracao(falta) + '</span>';
    return '<span title="Prazo: ' + esc(quando(data)) + '"' + (falta < 4 * 3600000 ? ' class="etiqueta ambar"' : '') + '>vence em ' + duracao(falta) + '</span>';
  }
  function emAberto(t) { return ['novo', 'em_andamento', 'aguardando'].indexOf(t.status) >= 0; }
  /* prazo para resposta: conta até o 1º retorno da equipe */
  function prazoRespostaTxt(t) {
    if (t.primeira_resposta_em) {
      var tarde = t.prazo && new Date(t.primeira_resposta_em) > new Date(t.prazo);
      return '<span class="etiqueta ' + (tarde ? 'ambar' : 'verde') + '" title="Prazo: ' + esc(quando(t.prazo)) + '">✓ respondido ' + (tarde ? 'com atraso' : 'no prazo') + '</span>';
    }
    return atrasoTxt(t.prazo, emAberto(t));
  }
  /* no detalhe do ticket a data já aparece no campo: só sinaliza quando venceu */
  function atrasoTxt(data, aberto) {
    var falta = data ? new Date(data) - Date.now() : 0;
    return aberto && data && falta < 0 ? '<span class="etiqueta vermelha">⚠ atrasado ' + duracao(falta) + '</span>' : '';
  }
  function prazoConclusaoTxt(t, comData) {
    if (!t.prazo_conclusao) return '<span class="sec">' + (emAberto(t) ? 'ainda não definido' : '—') + '</span>';
    return (comData ? '<div style="font-weight:700">' + quando(t.prazo_conclusao) + '</div>' : '') + atrasoTxt(t.prazo_conclusao, emAberto(t));
  }
  /* coluna "Prazo" da lista: antes do 1º retorno vale o da resposta; depois, o da conclusão */
  function prazoTxt(t) {
    if (!t.primeira_resposta_em && emAberto(t)) return contagem(t.prazo, true) + '<span class="sec">resposta</span>';
    if (t.prazo_conclusao) return contagem(t.prazo_conclusao, emAberto(t)) + '<span class="sec">conclusão</span>';
    return emAberto(t) ? '<span class="sec">sem previsão</span>' : '<span class="sec">—</span>';
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
      a.onclick = function () { window.focus(); if (n.link) location.hash = n.link; else if (n.ticket_id) location.hash = '#/tickets/' + n.ticket_id; a.close(); };
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
          return '<a href="' + esc(n.link || (n.ticket_id ? '#/tickets/' + n.ticket_id : '#/tickets')) + '" class="aviso' + (n.lida ? '' : ' nao-lido') + '" data-id="' + n.id + '">' +
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
    // condomínios da carteira; nomes repetidos (mesmo nome em outra UF) levam a UF
    var conds = (meta.condominios || []).map(function (c) {
      return { id: c.id, resp: c.resp || {}, rotulo: c.nome + (c.comarca ? ' · ' + c.comarca : '') + (c.distratado ? ' · distratado' : '') };
    });
    var porRotulo = {};
    conds.forEach(function (c) { if (porRotulo[normal(c.rotulo)]) c.rotulo += ' · nº ' + c.id; porRotulo[normal(c.rotulo)] = c; });
    var m = modal({
      titulo: 'Novo ticket', largo: true,
      corpo: '<form id="fT" class="pilha" novalidate>' +
        '<div class="grade-2"><div><label class="rot" for="tSetor">Para qual setor?</label><select class="campo" id="tSetor"><option value="">Escolha o setor…</option>' +
        meta.setores.map(function (s) { return '<option value="' + s.id + '">' + esc(s.nome) + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="rot" for="tCat">Tipo de demanda</label><select class="campo" id="tCat" disabled><option value="">Escolha o setor primeiro</option></select></div></div>' +
        '<div><label class="rot">A demanda é de</label><div class="grade-2">' +
        '<label class="opcao-radio" style="margin:0"><input type="radio" name="tOrigem" value="condominio"><div><b>Um condomínio</b><span>Vai direto para o responsável pelo condomínio no setor</span></div></label>' +
        '<label class="opcao-radio" style="margin:0"><input type="radio" name="tOrigem" value="interna"><div><b>Interna</b><span>Não é de um condomínio: vai para o líder do setor</span></div></label></div></div>' +
        '<div id="tCondBloco" hidden><label class="rot" for="tCond">Condomínio</label><input class="campo" id="tCond" list="tCondLista" autocomplete="off" placeholder="Digite o nome do condomínio">' +
        '<datalist id="tCondLista">' + conds.map(function (c) { return '<option value="' + esc(c.rotulo) + '"></option>'; }).join('') + '</datalist></div>' +
        '<div class="ajuda" id="tDestino" hidden></div>' +
        '<div><label class="rot" for="tTitulo">Assunto</label><input class="campo" id="tTitulo" maxlength="160" placeholder="Resumo da demanda em uma linha"></div>' +
        '<div><label class="rot" for="tDesc">Descrição</label><textarea class="campo" id="tDesc" rows="6" maxlength="10000" placeholder="O que precisa ser feito, unidade, valores, datas… Quanto mais detalhe, mais rápido o atendimento."></textarea></div>' +
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
      $('#tPrazo', m).textContent = 'Prazo para resposta: ' + horasUteis(h) + (c && c.prazo_horas ? ' (definido para este tipo de demanda)' : '') + ', contando só o expediente (' + textoExpediente() + ').';
    }
    function origem() { var r = $('input[name=tOrigem]:checked', m); return r ? r.value : ''; }
    function condominio() { return porRotulo[normal($('#tCond', m).value.trim())] || null; }
    // para onde o ticket vai: pessoa da carteira ou líder do setor
    function destino() {
      var s = setor(), o = origem(), el = $('#tDestino', m), c = condominio();
      $('#tCondBloco', m).hidden = o !== 'condominio';
      el.hidden = !o || !s;
      if (el.hidden) return;
      if (o === 'interna') { el.innerHTML = 'Demanda interna: vai para o líder de <b>' + esc(s.nome) + '</b>, que distribui.'; return; }
      if (!conds.length) { el.innerHTML = '<span style="color:var(--red)">A carteira de condomínios ainda está vazia. Use "Interna" ou peça à administração para importar a carteira.</span>'; return; }
      if (!$('#tCond', m).value.trim()) { el.textContent = 'Escolha o condomínio da lista.'; return; }
      if (!c) { el.innerHTML = '<span style="color:var(--red)">Condomínio não encontrado na carteira. Escolha um nome da lista.</span>'; return; }
      var r = c.resp[s.id];
      el.innerHTML = r ? 'Vai direto para <b>' + esc(r) + '</b>, responsável por este condomínio em ' + esc(s.nome) + '.' :
        r === null ? 'O responsável deste condomínio na carteira ainda não está na equipe de ' + esc(s.nome) + ' no portal: vai para o líder do setor.' :
        'Vai para o líder de <b>' + esc(s.nome) + '</b>, que distribui.';
    }
    $$('input[name=tOrigem]', m).forEach(function (r) { r.onchange = function () { destino(); if (origem() === 'condominio') $('#tCond', m).focus(); }; });
    $('#tCond', m).oninput = destino;
    $('#tSetor', m).onchange = function () {
      destino();
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
      if (!origem()) { msg.textContent = 'Diga se a demanda é de um condomínio ou interna.'; msg.hidden = false; return; }
      var cond = origem() === 'condominio' ? condominio() : null;
      if (origem() === 'condominio' && !cond) { msg.textContent = 'Escolha o condomínio da lista.'; msg.hidden = false; return; }
      if (!$('#tTitulo', m).value.trim()) { msg.textContent = 'Informe o assunto.'; msg.hidden = false; return; }
      bt.disabled = true;
      try {
        var r = await api('POST', '/api/tickets', {
          setor_id: Number($('#tSetor', m).value), categoria_id: $('#tCat', m).value ? Number($('#tCat', m).value) : null,
          prioridade: $('#tPrio', m).value, titulo: $('#tTitulo', m).value, descricao: $('#tDesc', m).value,
          interno: !cond, condominio_id: cond ? cond.id : null,
        });
        var arqs = Array.prototype.slice.call($('#tArq', m).files);
        if (arqs.length) await enviarAnexos(r.id, arqs, false);
        m.fechar();
        toast('Ticket ' + numTicket(r.id) + ' aberto' + (r.responsavel ? ' e enviado para ' + r.responsavel.nome : '') + '.', 'ok');
        location.hash = '#/tickets/' + r.id;
      } catch (e) { msg.textContent = e.message; msg.hidden = false; bt.disabled = false; }
    };
  }

  /* ---------- lista / filas ---------- */
  var VISOES = [
    ['minha', 'Minha fila', 'Tickets em que você é o responsável.'],
    ['setor', 'Fila do setor', 'Tudo o que chegou para os setores de que você faz parte.'],
    ['abertos', 'Abertos por mim', 'Demandas que você pediu para outros setores.'],
    ['todos', 'Todos', 'Todos os tickets de todos os setores (administração e Supervisão da Central de Tickets).'],
  ];

  async function paginaTickets(visao) {
    try { await carregarMeta(); } catch (e) { toast(e.message, 'erro'); }
    var visoes = VISOES.filter(function (v) { return (v[0] !== 'todos' || gestorTickets()) && (v[0] !== 'setor' || souEquipe()) && (v[0] !== 'minha' || souEquipe()); });
    if (!visoes.some(function (v) { return v[0] === visao; })) visao = visoes[0][0];
    guardar('tickets.visao', visao);
    var filtros = lembrar('tickets.filtros.' + visao, { status: 'todos', setor: '', q: '', atrasados: false, semResp: false });
    // a situação sempre abre em "Todas as situações" (os em aberto vêm primeiro na lista)
    filtros.status = 'todos';
    definirBarra('<span class="setor">Central de Tickets</span><span class="sep">/</span><span class="nome">' + esc(visoes.find(function (v) { return v[0] === visao; })[1]) + '</span>');
    var setoresFiltro = visao === 'setor' && !gestorTickets() ? meusSetores() : (metaTickets ? metaTickets.setores : []);
    $('#conteudo').innerHTML = '<div class="pagina"><h1>Central de Tickets</h1><p class="sub">Demandas entre os setores: abra, acompanhe e trate tudo em um só lugar.</p>' +
      '<nav class="abas">' + visoes.map(function (v) { return '<a href="#/tickets/fila/' + v[0] + '" class="' + (v[0] === visao ? 'on' : '') + '" title="' + esc(v[2]) + '">' + esc(v[1]) + '</a>'; }).join('') + '</nav>' +
      '<div class="painel"><div class="cab-painel">' +
      '<input class="campo" id="fTq" type="search" placeholder="Buscar por nº ou assunto…" style="max-width:260px" value="' + esc(filtros.q) + '">' +
      '<select class="campo" id="fTst" style="max-width:170px"><option value="todos">Todas as situações</option><option value="abertos">Em aberto</option>' +
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
          '<td><b>' + esc(t.titulo) + '</b><span class="sec">' + (t.condominio_nome ? esc(t.condominio_nome) + ' · ' : t.demanda_interna ? 'Interna · ' : '') + (t.categoria_nome ? esc(t.categoria_nome) + ' · ' : '') + 'aberto por ' + esc(t.solicitante_nome || '—') + ' em ' + quando(t.criado_em) +
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
      case 'criado': return 'abriu o ticket para <b>' + esc(d.setor || '') + '</b>' + (d.condominio ? ' · ' + esc(d.condominio) : d.interna ? ' · demanda interna' : '');
      case 'status': return 'mudou a situação de ' + etqStatus(d.de) + ' para ' + etqStatus(d.para);
      case 'atribuicao': return d.para ? (d.automatico ? 'enviou para <b>' + esc(d.para) + '</b>, responsável pelo condomínio na carteira' : 'atribuiu a <b>' + esc(d.para) + '</b>') : 'devolveu o ticket para a fila do setor';
      case 'carteira_sem_cadastro': return 'não achou <b>' + esc(pessoaCarteira(d.carteira).nome) + '</b> (responsável pelo condomínio na carteira) na equipe do setor: o ticket ficou com o líder';
      case 'prazo_conclusao': return (d.de ? 'mudou a previsão de conclusão para <b>' : 'iniciou o atendimento com previsão de conclusão para <b>') + quando(d.para) + '</b>';
      case 'transferencia': return 'transferiu de <b>' + esc(d.de || '') + '</b> para <b>' + esc(d.para || '') + '</b>' + (d.categoria ? ' (' + esc(d.categoria) + ')' : '');
      case 'prioridade': return 'mudou a prioridade de ' + etqPrio(d.de) + ' para ' + etqPrio(d.para);
      case 'prazo': return 'mudou o prazo para resposta para <b>' + (d.para ? quando(d.para) : 'sem prazo') + '</b>';
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
        return '<div class="evento comentario' + (e.interno ? ' interno' : '') + '">' + avatarHtml({ id: e.usuario_id, nome: e.usuario_nome, foto_v: e.usuario_foto_v }, 30) + '<div class="balao">' +
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
      (pode.assumir ? '<div class="linha" style="margin-top:8px"><button class="btn ghost sm" id="btAssumir">Assumir para mim</button></div>' : '') +
      (pode.equipe && !pode.atribuir ? '<div class="ajuda">Só o líder do setor muda o responsável.</div>' : '') + '</div>' +
      '<div class="campo-lado"><label class="rot">Prioridade</label>' + (pode.prazos ? '<select class="campo" id="dPrio">' + ['baixa', 'media', 'alta', 'urgente'].map(function (p) { return '<option value="' + p + '"' + (p === t.prioridade ? ' selected' : '') + '>' + PRIO[p][0] + '</option>'; }).join('') + '</select>' : etqPrio(t.prioridade)) + '</div>' +
      '<div class="campo-lado"><label class="rot">Prazo para resposta</label>' + (pode.prazos ? '<input class="campo" type="datetime-local" id="dPrazo" value="' + localInput(t.prazo) + '">' : '<div style="font-weight:700">' + quando(t.prazo) + '</div>') +
      '<div style="margin-top:6px">' + prazoRespostaTxt(t) + '</div></div>' +
      '<div class="campo-lado"><label class="rot">Prazo para conclusão</label>' + (pode.prazo_conclusao && t.prazo_conclusao ? '<input class="campo" type="datetime-local" id="dConclusao" value="' + localInput(t.prazo_conclusao) + '">' : '') +
      '<div style="margin-top:6px">' + prazoConclusaoTxt(t, !(pode.prazo_conclusao && t.prazo_conclusao)) + '</div>' +
      (pode.prazo_conclusao && !t.prazo_conclusao ? '<div class="ajuda">Definido por quem atende ao iniciar o atendimento.</div>' : '') + '</div>' +
      (pode.prazo_conclusao && t.status === 'novo' && t.responsavel_id ? '<div class="linha" style="margin-bottom:8px"><button class="btn primary" id="btIniciar" style="flex:1">Iniciar atendimento</button></div>' : '') +
      (pode.equipe ? '<div class="linha"><button class="btn ' + (pode.prazo_conclusao && t.status === 'novo' && t.responsavel_id ? 'ghost' : 'primary') + '" id="btSalvarT" style="flex:1">Salvar alterações</button></div>' : '') +
      '</div>' +
      '<div class="painel" style="padding:16px"><div class="pilha" style="gap:8px">' +
      (pode.equipe && aberto ? '<button class="btn ghost" id="btTransferir">Transferir para outro setor</button>' : '') +
      (pode.equipe && aberto ? '<button class="btn ghost" id="btResolver">' + 'Marcar como resolvido</button>' : '') +
      (!pode.equipe && pode.cancelar ? '<button class="btn danger" id="btCancelarT">Cancelar meu pedido</button>' : '') +
      (pode.reabrir ? '<button class="btn ghost" id="btReabrir">Reabrir ticket</button>' : '') +
      '<dl class="info-ticket"><dt>Setor</dt><dd>' + esc(t.setor_nome) + '</dd><dt>Tipo</dt><dd>' + esc(t.categoria_nome || '—') + '</dd>' +
      '<dt>Condomínio</dt><dd>' + (t.condominio_nome ? esc(t.condominio_nome) + (t.condominio_comarca ? ' · ' + esc(t.condominio_comarca) : '') : t.demanda_interna ? 'Interna' : '—') + '</dd>' +
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
    // mudar a prioridade recalcula o prazo para resposta (enquanto ninguém respondeu)
    if ($('#dPrio') && !t.primeira_resposta_em) {
      $('#dPrio').insertAdjacentHTML('afterend', '<div class="ajuda" id="dPrioAjuda"></div>');
      $('#dPrio').onchange = function () {
        var h = metaTickets && metaTickets.prazo_padrao_horas && metaTickets.prazo_padrao_horas[this.value];
        $('#dPrioAjuda').textContent = this.value !== t.prioridade && h ? 'Ao salvar, o prazo para resposta passa a ser ' + horasUteis(h) + ' contados da abertura.' : '';
      };
    }
    if ($('#btSalvarT')) {
      $('#btSalvarT').onclick = async function () {
        var corpo = {};
        if ($('#dStatus').value !== t.status) corpo.status = $('#dStatus').value;
        if ($('#dPrio') && $('#dPrio').value !== t.prioridade) corpo.prioridade = $('#dPrio').value;
        if ($('#dPrazo') && $('#dPrazo').value !== localInput(t.prazo)) corpo.prazo = $('#dPrazo').value ? new Date($('#dPrazo').value).toISOString() : null;
        if ($('#dConclusao') && $('#dConclusao').value !== localInput(t.prazo_conclusao)) {
          if (!$('#dConclusao').value) { toast('Informe a data do prazo para conclusão.', 'erro'); return; }
          corpo.prazo_conclusao = new Date($('#dConclusao').value).toISOString();
          var mc = await pedirMotivo('Mudar prazo para conclusão', 'Por que o prazo mudou? (aparece para quem abriu)', true, 'Salvar');
          if (mc === null) return;
          corpo.motivo = mc;
        }
        // começar a tratar exige o prazo para conclusão
        if (t.status === 'novo' && (corpo.status === 'em_andamento' || corpo.status === 'aguardando') && !t.prazo_conclusao) {
          var pc = await pedirConclusao();
          if (!pc) return;
          corpo.prazo_conclusao = pc;
        }
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
    /* pede a data de conclusão (padrão: o prazo para resposta, se ainda estiver no futuro) */
    function pedirConclusao() {
      return new Promise(function (resolve) {
        var valor = null;
        var sugestao = ''; // quem atende escolhe a data; não reaproveita o prazo para resposta
        var mm = modal({
          titulo: 'Iniciar atendimento',
          corpo: '<div class="pilha"><p style="margin:0;font-weight:600;color:var(--ink-2)">Até quando você conclui esta demanda? Quem abriu o ticket vê essa previsão.</p>' +
            '<div><label class="rot" for="mConc">Prazo para conclusão</label><input class="campo" type="datetime-local" id="mConc" value="' + sugestao + '"></div><div id="mMsgC" class="msg erro" hidden></div></div>',
          pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="mOkC">Iniciar</button>',
          aoFechar: function () { resolve(valor); },
        });
        $('#mOkC', mm).onclick = function () {
          var v = $('#mConc', mm).value;
          var msg = $('#mMsgC', mm);
          if (!v) { msg.textContent = 'Informe a data e a hora.'; msg.hidden = false; return; }
          if (new Date(v) <= new Date()) { msg.textContent = 'O prazo precisa ser uma data futura.'; msg.hidden = false; return; }
          valor = new Date(v).toISOString(); mm.fechar();
        };
      });
    }
    if ($('#btIniciar')) $('#btIniciar').onclick = async function () {
      var pc = await pedirConclusao();
      if (pc) mudar({ status: 'em_andamento', prazo_conclusao: pc }, 'Atendimento iniciado.');
    };
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
        tile('Atrasados', g.atrasados ? '⚠ ' + g.atrasados : '0', 'sem resposta no prazo ou conclusão vencida', g.atrasados > 0) +
        tile('Respondidos no prazo', g.respondidos ? Math.round(g.respondidos_no_prazo / g.respondidos * 100) + '%' : '—', g.respondidos ? g.respondidos_no_prazo + ' de ' + g.respondidos + ' no período' : 'prazo para resposta') +
        tile('Abertos no período', g.criados, '') +
        tile('Resolvidos no período', g.resolvidos, g.resolvidos ? pct + ' dentro do prazo para conclusão' : '') +
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
  // vigência guardada como 2026-10-01 → "10/2026"
  function mesAno(v) { var m = String(v || '').match(/^(\d{4})-(\d{2})/); return m ? m[2] + '/' + m[1] : ''; }
  function etqSituacao(s) { var x = CART_SIT[s] || [s || '—', 'ambar']; return '<span class="etiqueta ' + x[1] + '">' + esc(x[0]) + '</span>'; }
  function unicos(lista) { return lista.filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }); }

  /* o que o portal identificou sobre quem pode o quê na carteira: o que quem está vendo pode (e por quê)
     e quem tem cada permissão hoje. A configuração fica em Ferramentas do setor → Carteira de condomínios. */
  function quadroAcessoCarteira(a) {
    if (!a) return '';
    var pode = a.voce.pode;
    var resumo = eu.papel === 'admin' ? 'edita tudo' : pode.length ? pode.length + ' permiss' + (pode.length === 1 ? 'ão' : 'ões') + ' de edição' : 'só consulta';
    var configura = eu.papel === 'admin' ? '<a href="#/admin/modulos" data-carteira-acessos>Módulos e dados → Carteira: quem edita</a>' : gestorSetor() ? '<a href="#/admin/modulos" data-carteira-acessos>Ferramentas do setor → Carteira de condomínios</a>' : 'Ferramentas do setor → Carteira de condomínios (administração e coordenação)';
    return '<details class="painel" style="padding:12px 16px;margin-bottom:16px"><summary style="cursor:pointer;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<b>Seu acesso:</b><span class="etiqueta azul">' + esc(a.voce.nivel) + (a.voce.setores.length ? ' · ' + esc(a.voce.setores.join(', ')) : '') + '</span><span>' + esc(resumo) + '</span>' +
      '<span class="ajuda" style="margin:0 0 0 auto">ver quem edita o quê</span></summary>' +
      '<p style="margin:12px 0 4px"><b>Todos veem a carteira.</b> ' + (eu.papel === 'admin' ? 'Como administrador, você edita tudo.' : pode.length ? 'Além disso, você pode:' : 'Você não tem permissão de edição.') + '</p>' +
      (eu.papel !== 'admin' && pode.length ? '<ul style="margin:0 0 10px;padding-left:20px">' + pode.map(function (x) { return '<li>' + esc(x.rotulo) + ' <span class="sec" style="display:inline">· por ' + esc(x.motivo) + '</span></li>'; }).join('') + '</ul>' : '') +
      '<h4 style="margin:12px 0 6px;font-family:var(--display)">Quem pode cada coisa hoje</h4><div class="tabela-wrap"><table><thead><tr><th>O que</th><th>Quem (além da administração)</th></tr></thead><tbody>' +
      a.permissoes.map(function (p) {
        return '<tr><td>' + esc(p.rotulo) + '</td><td>' + (p.quem.length ? p.quem.map(function (q) { return esc(q.nome) + ' <span class="sec" style="display:inline">(' + esc(q.motivo) + ')</span>'; }).join(', ') : '<span style="color:var(--muted)">só a administração</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="ajuda" style="margin:8px 0 0">Administração: ' + esc(a.admins.join(', ') || '—') + '. Onde se configura: ' + configura + '.</p></details>';
  }

  /* Carteira: quem edita o quê. A administração muda tudo (perfis, setores e pessoas); coordenação e supervisão liberam
     pessoas nas permissões do setor delas (ex.: Crédito → Assistente de crédito). Ver a carteira é de todos. */
  async function editorCarteiraAcessos() {
    var m = modal({ titulo: 'Carteira de condomínios — quem edita o quê', largo: true, corpo: '<div id="edCart">' + carregandoHtml() + '</div>', pe: '<button class="btn ghost" data-fechar>Fechar</button>' });
    var cont = $('#edCart', m);
    async function carregar() {
      var q;
      try { q = await api('GET', '/api/admin/carteira/acessos'); } catch (e) { cont.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>'; return; }
      var nomeSetor = {}; q.setores.forEach(function (x) { nomeSetor[x.id] = x.nome; });
      cont.innerHTML = '<p class="sub" style="margin-top:0"><b>Todos veem a carteira.</b> Aqui se define quem <b>edita</b> cada coisa. A administração (' + esc(q.admins.join(', ')) + ') edita tudo, sempre.' +
        (q.admin ? '' : ' Você libera pessoas nas permissões do seu setor; as demais são configuradas pela administração.') + '</p>' +
        q.permissoes.map(function (p, i) {
          var r = p.regra;
          var regraTxt = (r.niveis.length ? r.niveis.map(function (n) { return q.niveis[n]; }).join(' e ') + (r.setores.length ? ' do setor ' + r.setores.map(function (x) { return nomeSetor[x] || '?'; }).join(', ') : ' de qualquer setor') : 'nenhum perfil') +
            (r.pessoas.length ? ' + ' + r.pessoas.length + ' pessoa(s) liberada(s)' : '');
          var hoje = p.quem.length ? p.quem.map(function (x) { return esc(x.nome) + ' <span class="sec" style="display:inline">(' + esc(x.motivo) + ')</span>'; }).join(', ') : '<span style="color:var(--muted)">ninguém além da administração</span>';
          var edita = '';
          if (p.pode_configurar) {
            edita = (p.pode_mudar_regra ? '<div class="linha" style="gap:14px;flex-wrap:wrap;margin-top:10px"><b style="min-width:120px">Perfis</b>' +
                Object.keys(q.niveis).map(function (n) { return '<label class="linha" style="gap:6px"><input type="checkbox" data-nivel="' + n + '"' + (r.niveis.indexOf(n) >= 0 ? ' checked' : '') + '> ' + esc(q.niveis[n]) + '</label>'; }).join('') + '</div>' +
                '<div class="linha" style="gap:14px;flex-wrap:wrap;margin-top:6px"><b style="min-width:120px">Só dos setores</b>' +
                q.setores.map(function (x) { return '<label class="linha" style="gap:6px"><input type="checkbox" data-setor="' + x.id + '"' + (r.setores.indexOf(x.id) >= 0 ? ' checked' : '') + '> ' + esc(x.nome) + '</label>'; }).join('') +
                '<span class="ajuda" style="margin:0">nenhum marcado = qualquer setor</span></div>' : '') +
              '<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:700;color:var(--ink-2)">Pessoas liberadas individualmente (' + r.pessoas.length + ')</summary>' +
              '<input class="campo" type="search" data-busca-p placeholder="Buscar pessoa ou setor…" style="max-width:260px;margin:8px 0">' +
              '<div class="caixa-opcoes" style="max-height:220px;overflow:auto">' + q.pessoas.map(function (x) {
                return '<label data-t="' + esc(normal(x.nome + ' ' + x.setores.join(' '))) + '"><input type="checkbox" data-pessoa="' + x.id + '"' + (r.pessoas.indexOf(x.id) >= 0 ? ' checked' : '') + '><span>' + esc(x.nome) + ' <span class="sec" style="display:inline;color:var(--muted)">· ' + esc(x.setores.join(', ') || 'sem setor') + '</span></span></label>';
              }).join('') + '</div></details>' +
              '<div class="linha" style="margin-top:10px;gap:8px"><button class="btn primary sm" type="button" data-salvar="' + i + '">Salvar</button>' +
              (p.pode_mudar_regra && r.personalizada ? '<button class="btn ghost sm" type="button" data-padrao="' + i + '">Voltar ao padrão</button>' : '') + '</div>';
          } else edita = '<p class="ajuda" style="margin:8px 0 0">Quem configura esta permissão: a administração.</p>';
          return '<div class="painel" data-perm="' + i + '" style="padding:12px 14px;margin-bottom:10px"><b>' + esc(p.rotulo) + '</b><div class="ajuda" style="margin:2px 0 6px">' + esc(p.descricao) + '</div>' +
            '<div><span class="etiqueta cinza">regra: ' + esc(regraTxt) + '</span></div><div style="margin-top:6px"><b>Hoje:</b> ' + hoje + '</div>' + edita + '</div>';
        }).join('');
      $$('[data-busca-p]', cont).forEach(function (b) {
        b.oninput = function () { var t = normal(b.value); $$('label[data-t]', b.parentNode).forEach(function (l) { l.hidden = t && l.getAttribute('data-t').indexOf(t) < 0; }); };
      });
      $$('[data-salvar]', cont).forEach(function (b) {
        b.onclick = async function () {
          var i = Number(b.getAttribute('data-salvar')), p = q.permissoes[i], box = $('[data-perm="' + i + '"]', cont);
          var corpo = { pessoas: $$('[data-pessoa]:checked', box).map(function (x) { return Number(x.getAttribute('data-pessoa')); }) };
          if (p.pode_mudar_regra) {
            corpo.niveis = $$('[data-nivel]:checked', box).map(function (x) { return x.getAttribute('data-nivel'); });
            corpo.setores = $$('[data-setor]:checked', box).map(function (x) { return Number(x.getAttribute('data-setor')); });
          }
          try { await api('PUT', '/api/admin/carteira/acessos/' + p.chave, corpo); toast('Salvo. Já vale para quem abrir a carteira.', 'ok'); carregar(); } catch (e) { toast(e.message, 'erro'); }
        };
      });
      $$('[data-padrao]', cont).forEach(function (b) {
        b.onclick = async function () {
          var p = q.permissoes[Number(b.getAttribute('data-padrao'))];
          try { await api('DELETE', '/api/admin/carteira/acessos/' + p.chave); toast('Voltou ao padrão.', 'ok'); carregar(); } catch (e) { toast(e.message, 'erro'); }
        };
      });
    }
    carregar();
  }

  async function paginaCarteira(aba) {
    aba = aba === 'responsaveis' || aba === 'novos' ? aba : 'condominios';
    definirBarra('<span class="setor">Carteira</span><span class="sep">/</span><span class="nome">' + ({ responsaveis: 'Equipes', novos: 'Adicionar novos' }[aba] || 'Condomínios') + '</span>');
    $('#conteudo').innerHTML = carregandoHtml();
    var j;
    try { j = await api('GET', '/api/carteira'); } catch (e) { toast(e.message, 'erro'); return; }
    var conds = j.condominios, funcoes = j.funcoes, admin = j.pode_editar, adicionar = !!j.pode_adicionar;
    // colunas de responsável que esta pessoa altera e transfere (coordenador/supervisor: as do setor dele)
    var editaveis = j.funcoes_editaveis || [];
    function editavel(campo) { return admin || editaveis.indexOf(campo) >= 0; }
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
      quadroAcessoCarteira(j.acesso) +
      (conds.length ? '<div class="tiles" style="margin-bottom:20px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">' +
        tile('Condomínios ativos', ativos.length, conds.length - ativos.length + ' distratado' + (conds.length - ativos.length === 1 ? '' : 's')) +
        tile('Comarcas', ufs.length, ufs.slice(0, 4).map(function (u) { return esc(u) + ' ' + porUf[u]; }).join(' · ')) +
        funcoes.map(function (f) {
          var n = unicos(ativos.map(function (c) { return c[f.campo]; })).length;
          return tile(esc(f.rotulo.replace(' (ApoioCob)', '')), n, n ? 'pessoas · média de ' + Math.round(ativos.filter(function (c) { return c[f.campo]; }).length / n) + ' cada' : '');
        }).join('') +
        tile('Sem responsável', semResp.length, 'ativos com função em branco', semResp.length > 0) + '</div>' : '') +
      '<nav class="abas"><a href="#/carteira" class="' + (aba === 'condominios' ? 'on' : '') + '">Condomínios</a>' +
      '<a href="#/carteira/responsaveis" class="' + (aba === 'responsaveis' ? 'on' : '') + '">Equipes</a>' +
      (adicionar ? '<a href="#/carteira/novos" class="' + (aba === 'novos' ? 'on' : '') + '">Adicionar novos</a>' : '') + '</nav><div id="cCorpo"></div></div>';

    var acoes = (admin ? '<button class="btn primary" id="btCNovo">' + IC.mais + 'Novo condomínio</button>' : '');

    if (aba === 'novos' && adicionar) { desenharNovos(); return; }
    if (!conds.length) {
      $('#cCorpo').innerHTML = '<div class="vazio">A carteira ainda está vazia.' + (admin ? '<div class="ajuda" style="margin:8px 0 16px">Cadastre o primeiro condomínio ou use a aba <b>Adicionar novos</b> com a planilha de implantação.</div><div class="linha" style="justify-content:center">' + acoes + '</div>' : ' A administração ainda vai importar a planilha.') + '</div>';
    } else if (aba === 'condominios') desenharCondominios();
    else desenharResponsaveis();
    ligarAcoes();

    function ligarAcoes() {
      if ($('#btCNovo')) $('#btCNovo').onclick = function () { editarCondominio(null); };
      $$('[data-carteira-acessos]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); editorCarteiraAcessos(); }; });
    }

    /* ---------- adicionar novos: planilha de implantação → escolhe a vigência → digita o ID Vouch ---------- */
    function desenharNovos() {
      var itens = null, arquivo = '';
      $('#cCorpo').innerHTML =
        '<div class="painel" style="padding:16px;margin-bottom:16px"><div class="titulo-passo"><span class="passo">1</span>Planilha de implantação</div>' +
        '<div class="arquivo-envio"><input class="campo" id="nvArq" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" style="flex:1;min-width:220px">' +
        '<button class="btn primary" id="btNvLer">' + IC.enviar + 'Ler planilha</button></div>' +
        '<div class="ajuda" id="nvResumo">Envie a planilha "Controle de Implantações" do jeito que ela é (.xlsx ou .csv). O portal acha a linha de títulos sozinho e lê a vigência da coluna <b>DATA CONTRATO</b>.</div></div>' +
        '<div id="nvPasso2"></div><div id="nvPasso3"></div>';
      $('#btNvLer').onclick = async function () {
        var arq = $('#nvArq').files[0];
        if (!arq) { toast('Escolha a planilha.', 'erro'); return; }
        var bt = this; bt.disabled = true;
        try {
          var r = await api('POST', '/api/carteira/implantacao/ler', arq, { bruto: true, headers: { 'Content-Type': 'application/octet-stream' } });
          itens = r.itens; arquivo = arq.name;
          passo2();
        } catch (e) { toast(e.message, 'erro'); }
        bt.disabled = false;
      };
      function passo2() {
        var meses = {};
        itens.forEach(function (it) { if (!it.ignorar && it.vigencia) meses[it.vigencia] = (meses[it.vigencia] || 0) + 1; });
        var lista = Object.keys(meses).sort(function (a, b) { return (b.slice(3) + b.slice(0, 2)).localeCompare(a.slice(3) + a.slice(0, 2)); });
        var ign = itens.filter(function (it) { return it.ignorar; });
        $('#nvResumo').innerHTML = '<b>' + esc(arquivo) + '</b>: ' + itens.length + ' condomínios lidos' +
          (ign.length ? ' · <span title="' + esc(ign.map(function (i) { return i.nome_planilha + ': ' + i.ignorar; }).join('\n')) + '" style="text-decoration:underline dotted;cursor:help">' + ign.length + ' ficaram de fora</span> (desconsiderar, repetidos ou sem data de contrato)' : '') + '.';
        if (!lista.length) { $('#nvPasso2').innerHTML = '<div class="vazio">Nenhum condomínio com DATA CONTRATO na planilha.</div>'; $('#nvPasso3').innerHTML = ''; return; }
        $('#nvPasso2').innerHTML = '<div class="painel" style="padding:16px;margin-bottom:16px"><div class="titulo-passo"><span class="passo">2</span>Vigência que vai entrar na carteira</div>' +
          '<div class="linha"><select class="campo" id="nvVig" style="max-width:260px">' + lista.map(function (m) { return '<option value="' + m + '">' + m + ' · ' + meses[m] + ' condomínio' + (meses[m] === 1 ? '' : 's') + '</option>'; }).join('') + '</select>' +
          '<span class="ajuda" id="nvConta" style="margin:0"></span></div></div>';
        $('#nvVig').onchange = passo3;
        passo3();
      }
      function passo3() {
        var vig = $('#nvVig').value;
        var doMes = itens.filter(function (it) { return !it.ignorar && it.vigencia === vig; });
        var paraAdd = doMes.filter(function (it) { return it.carteira.situacao !== 'existe'; });
        // responsáveis: só as colunas que esta pessoa escolhe (coordenador/supervisor: a do setor dele)
        var respEditaveis = funcoes.filter(function (fn) { return editavel(fn.campo); });
        var ja = doMes.filter(function (it) { return it.carteira.situacao === 'existe'; });
        var parecidos = paraAdd.filter(function (it) { return it.carteira.situacao === 'parecido'; }).length;
        $('#nvConta').innerHTML = doMes.length + ' com contrato em ' + vig + ': <b>' + (paraAdd.length - parecidos) + ' novo' + (paraAdd.length - parecidos === 1 ? '' : 's') + '</b>' +
          (parecidos ? ', <b>' + parecidos + ' parecido' + (parecidos === 1 ? '' : 's') + '</b> com condomínio da carteira (confira)' : '') + (ja.length ? ' e ' + ja.length + ' já na carteira' : '') + '.';
        $('#nvPasso3').innerHTML = '<div class="painel"><div class="cab-painel"><div class="titulo-passo" style="margin:0"><span class="passo">3</span>Condomínios para adicionar</div><span class="espaco"></span>' +
          '<span class="ajuda" style="margin:0">Digite o <b>ID Vouch</b> de cada um e confira o apelido.</span></div>' +
          (paraAdd.length ? '<div class="tabela-wrap"><table class="tab-novos"><colgroup><col style="width:38px"><col style="width:110px"><col style="width:31%"><col style="width:50px"><col style="width:56px"><col style="width:16%"><col style="width:108px"><col style="width:17%"></colgroup>' +
            '<thead><tr><th><input type="checkbox" id="nvTodos"></th><th>ID Vouch *</th><th>Condomínio (Apelido Vouch)</th><th>UF</th><th>Venc.</th><th>Administradora</th><th>Vigência</th><th>Situação</th></tr></thead><tbody>' +
            paraAdd.map(function (it, i) {
              var par = it.carteira.situacao === 'parecido';
              var det = ['form. nº ' + it.formulario, it.implantado_por ? 'implantado por ' + it.implantado_por : '', it.obs].filter(Boolean).join(' · ');
              return '<tr data-i="' + i + '" class="' + (par ? 'parecido' : '') + (respEditaveis.length ? ' comResp' : '') + '"><td><input type="checkbox" class="nvMarca"' + (par ? '' : ' checked') + '></td>' +
                '<td><input class="campo nvId" inputmode="numeric" maxlength="20" placeholder="ID Vouch"></td>' +
                '<td><input class="campo nvNome" maxlength="160" value="' + esc(it.nome) + '"><span class="sec corta" title="' + esc(it.nome_planilha) + '">' + esc(it.nome_planilha) + '</span>' +
                '<input class="campo nvCnpj" maxlength="18" inputmode="numeric" placeholder="CNPJ (opcional)" value="' + esc(it.cnpj) + '" style="margin:4px 0">' +
                (it.cnpj_aviso ? '<span class="sec" style="color:#9a6512">⚠ ' + esc(it.cnpj_aviso) + '</span>' : '') +
                (det ? '<span class="sec corta" title="' + esc(det) + '">' + esc(det) + '</span>' : '') + '<span class="sec nvErro" style="color:var(--red)"></span></td>' +
                '<td>' + esc(it.comarca || '—') + '</td><td>' + esc(it.vencimento || '—') + '</td>' +
                '<td>' + esc(it.administradora || '—') + (it.forma_envio ? '<span class="sec">' + esc(it.forma_envio) + '</span>' : '') +
                  (it.executivo ? '<span class="sec" title="Executivo de negócios">exec. ' + esc(it.executivo) + '</span>' : '') + '</td>' +
 '<td><b>' + esc(it.vigencia) + '</b><span class="sec">contrato ' + esc(it.data_contrato) + '</span></td>' +
                '<td>' + (par ? '<span class="etiqueta ambar" title="Na carteira já existe ' + esc(it.carteira.nome) + ' (ID Vouch ' + esc(it.carteira.codigo) + ') na mesma UF. Marque só se for outro condomínio.">⚠ parecido com ' + esc(it.carteira.nome) + ' (ID ' + esc(it.carteira.codigo) + ')</span>' : '<span class="etiqueta verde">novo</span>') + '</td></tr>' +
                (respEditaveis.length ? '<tr class="nvResp' + (par ? ' parecido' : '') + '" data-r="' + i + '"><td></td><td colspan="7"><div class="grade-3">' + respEditaveis.map(function (fn) {
                  return '<div><label class="rot">' + esc(fn.rotulo) + '</label><input class="campo nvPessoa" data-campo="' + fn.campo + '" list="nvl_' + fn.campo + '" maxlength="120" placeholder="NOME - RAMAL (opcional)"></div>';
                }).join('') + '</div></td></tr>' : '');
            }).join('') + '</tbody></table>' + funcoes.map(function (fn) {
              return '<datalist id="nvl_' + fn.campo + '">' + unicos(conds.map(function (c) { return c[fn.campo]; })).map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>';
            }).join('') + '</div>' : '<div class="vazio" style="border:0;padding:30px">Todos os condomínios de ' + vig + ' já estão na carteira.</div>') +
          (ja.length ? '<details style="padding:10px 16px;border-top:1px solid var(--border)"><summary class="ajuda" style="cursor:pointer;margin:0">' + ja.length + ' já ' + (ja.length === 1 ? 'está' : 'estão') + ' na carteira e não ' + (ja.length === 1 ? 'será adicionado' : 'serão adicionados') + '</summary><div class="sec" style="margin-top:6px">' +
            ja.map(function (it) { return esc(it.nome_planilha) + ' → ' + esc(it.carteira.nome) + ' (ID ' + esc(it.carteira.codigo) + ')'; }).join('<br>') + '</div></details>' : '') +
          (paraAdd.length ? '<div class="linha" style="padding:14px 16px;border-top:1px solid var(--border)"><div class="ajuda" style="flex:1;margin:0;min-width:240px">Entram como <b>Ativo</b>, com a vigência ' + vig + '. ' + (respEditaveis.length === funcoes.length ? 'Os responsáveis são opcionais: o que ficar em branco aparece como "sem responsável".' :
            'Os responsáveis de cada setor são escolhidos pelo coordenador/supervisor do setor' + (respEditaveis.length ? ' (aqui você escolhe o do seu)' : '') + '; o que ficar em branco é preenchido depois na ficha do condomínio.') + '</div>' +
            '<button class="btn primary" id="btNvAdd">Adicionar <span id="nvQtd"></span></button></div>' : '') + '</div>';
        if (!paraAdd.length) return;
        function contar() {
          var n = $$('.nvMarca').filter(function (c) {
            var tr = c.closest('tr'), resp = $('tr[data-r="' + tr.getAttribute('data-i') + '"]');
            tr.classList.toggle('desmarcado', !c.checked); if (resp) resp.classList.toggle('desmarcado', !c.checked);
            return c.checked;
          }).length;
          $('#nvQtd').textContent = n + ' condomínio' + (n === 1 ? '' : 's');
          $('#btNvAdd').disabled = !n;
          $('#nvTodos').checked = n === paraAdd.length;
        }
        $$('.nvMarca').forEach(function (c) { c.onchange = contar; });
        $('#nvTodos').onchange = function () { var v = this.checked; $$('.nvMarca').forEach(function (c) { c.checked = v; }); contar(); };
        $$('.nvId').forEach(function (i) { i.oninput = function () { this.classList.remove('falta'); this.closest('tr').querySelector('.nvErro').textContent = ''; }; });
        contar();
        $('#btNvAdd').onclick = async function () {
          var linhas = $$('#nvPasso3 tbody tr[data-i]').filter(function (tr) { return tr.querySelector('.nvMarca').checked; });
          var falta = 0;
          linhas.forEach(function (tr) { var i = tr.querySelector('.nvId'); if (!i.value.trim()) { i.classList.add('falta'); falta++; } });
          if (falta) { toast('Falta o ID Vouch de ' + falta + ' condomínio' + (falta === 1 ? '' : 's') + '.', 'erro'); return; }
          var corpo = linhas.map(function (tr) {
            var it = paraAdd[Number(tr.getAttribute('data-i'))];
            var obs = ['Implantação: formulário nº ' + it.formulario, it.implantado_por ? 'implantado por ' + it.implantado_por : '', it.obs].filter(Boolean).join(' · ');
            var item = { codigo: tr.querySelector('.nvId').value.trim(), nome: tr.querySelector('.nvNome').value.trim(), comarca: it.comarca, vencimento: it.vencimento,
              administradora: it.administradora, forma_envio: it.forma_envio, executivo: it.executivo, cnpj: tr.querySelector('.nvCnpj').value.trim(), razao_social: it.razao_social, inicio_contrato: it.vigencia, observacoes: obs };
            $$('tr[data-r="' + tr.getAttribute('data-i') + '"] .nvPessoa').forEach(function (inp) { item[inp.getAttribute('data-campo')] = inp.value.trim(); });
            return item;
          });
          var bt = this; bt.disabled = true;
          try {
            var r = await fetch('/api/carteira/implantacao/adicionar', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens: corpo }) });
            var j2 = await r.json().catch(function () { return {}; });
            if (!r.ok) {
              (j2.erros || []).forEach(function (e) {
                var tr = linhas[e.indice];
                if (tr) { tr.querySelector('.nvErro').textContent = e.erro; if (/ID Vouch/.test(e.erro)) tr.querySelector('.nvId').classList.add('falta'); }
              });
              throw new Error(j2.erro || 'Erro ' + r.status);
            }
            toast(j2.criados + ' condomínio' + (j2.criados === 1 ? ' adicionado' : 's adicionados') + ' à carteira.', 'ok');
            location.hash = '#/carteira';
          } catch (e) { toast(e.message, 'erro'); bt.disabled = false; }
        };
      }
    }

    function desenharCondominios() {
      var f = lembrar('carteira.filtros', { q: '', situacao: 'ATIVO', uf: '', adm: '', pessoa: '', semResp: false, ordem: 'nome', desc: false });
      var pessoas = funcoes.map(function (fn) {
        return '<optgroup label="' + esc(fn.rotulo) + '">' + unicos(conds.map(function (c) { return c[fn.campo]; })).map(function (p) {
          return '<option value="' + esc(fn.campo + '|' + p) + '">' + esc(pessoaCarteira(p).nome) + '</option>';
        }).join('') + '</optgroup>';
      }).join('');
      // 5 colunas de largura fixa: cabe na tela sem rolar para o lado (ID, UF, vencimento e situação vão junto do nome)
      var cols = [['nome', 'Condomínio (Apelido Vouch)', '30%']]
        .concat(funcoes.map(function (fn) { return [fn.campo, fn.rotulo.replace(' (ApoioCob)', ''), '18%']; }))
        .concat([['administradora', 'Administradora', '16%']]);
      $('#cCorpo').innerHTML = '<div class="painel"><div class="cab-painel">' +
        '<input class="campo" id="cfQ" type="search" placeholder="Buscar nome, razão social, CNPJ ou ID Vouch…" style="max-width:280px">' +
        '<select class="campo" id="cfSit" style="max-width:150px"><option value="ATIVO">Ativos</option><option value="DISTRATADO">Distratados</option><option value="">Todas as situações</option></select>' +
        '<select class="campo" id="cfUf" style="max-width:130px"><option value="">Todas as UFs</option>' + unicos(conds.map(function (c) { return c.comarca; })).map(function (u) { return '<option>' + esc(u) + '</option>'; }).join('') + '</select>' +
        '<select class="campo" id="cfAdm" style="max-width:190px"><option value="">Todas as administradoras</option>' + unicos(conds.map(function (c) { return c.administradora; })).map(function (u) { return '<option>' + esc(u) + '</option>'; }).join('') + '</select>' +
        '<select class="campo" id="cfPes" style="max-width:220px"><option value="">Todos os responsáveis</option>' + pessoas + '</select>' +
        '<label class="linha" style="font-weight:700;font-size:13px;color:var(--muted)"><input type="checkbox" id="cfSem"> sem responsável</label>' +
        '<label class="linha" style="font-weight:700;font-size:13px;color:var(--muted)"><input type="checkbox" id="cfSemVig"> sem vigência</label>' +
        '<span class="espaco"></span>' + acoes + '</div>' +
        '<div class="tabela-wrap"><table class="tabela-carteira"><colgroup>' + cols.map(function (c) { return '<col style="width:' + c[2] + '">'; }).join('') + '</colgroup><thead><tr>' + cols.map(function (c) {
          return '<th data-ordem="' + c[0] + '" style="cursor:pointer" title="Ordenar">' + esc(c[1]) + ' <span data-seta="' + c[0] + '"></span></th>';
        }).join('') + '</tr></thead><tbody id="tbC"></tbody></table></div>' +
        '<div class="ajuda" id="cTotal" style="padding:10px 16px;border-top:1px solid var(--border)"></div></div>';
      $('#cfQ').value = f.q; $('#cfSit').value = f.situacao; $('#cfUf').value = f.uf; $('#cfAdm').value = f.adm; $('#cfPes').value = f.pessoa; $('#cfSem').checked = !!f.semResp; $('#cfSemVig').checked = !!f.semVig;
      function filtrar() {
        f = { q: $('#cfQ').value.trim(), situacao: $('#cfSit').value, uf: $('#cfUf').value, adm: $('#cfAdm').value, pessoa: $('#cfPes').value, semResp: $('#cfSem').checked, semVig: $('#cfSemVig').checked, ordem: f.ordem, desc: f.desc };
        guardar('carteira.filtros', f);
        var t = normal(f.q), dig = f.q.replace(/\D/g, '');
        var pes = f.pessoa ? f.pessoa.split('|') : null;
        var lista = conds.filter(function (c) {
          if (f.situacao && c.situacao !== f.situacao) return false;
          if (f.uf && c.comarca !== f.uf) return false;
          if (f.adm && c.administradora !== f.adm) return false;
          if (pes && c[pes[0]] !== pes[1]) return false;
          if (f.semResp && !funcoes.some(function (fn) { return !c[fn.campo]; })) return false;
          if (f.semVig && c.inicio_contrato) return false;
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
          return '<tr class="clicavel" data-id="' + c.id + '"><td><b>' + esc(c.nome) + '</b>' + (c.situacao !== 'ATIVO' ? ' ' + etqSituacao(c.situacao) : '') +
            '<span class="sec">ID Vouch ' + esc(c.codigo) + (c.comarca ? ' · ' + esc(c.comarca) : '') + (c.vencimento ? ' · venc. ' + esc(c.vencimento) : '') +
              (c.inicio_contrato ? ' · vigência ' + mesAno(c.inicio_contrato) : ' · <span style="color:#9a6512">sem vigência</span>') + '</span>' +
            (c.razao_social ? '<span class="sec corta" title="' + esc(c.razao_social + (c.cnpj ? ' · ' + c.cnpj : '')) + '">' + esc(c.razao_social) + '</span>' : '') + '</td>' +
            funcoes.map(function (fn) { return '<td>' + celPessoa(c[fn.campo]) + '</td>'; }).join('') +
            '<td>' + esc(c.administradora && c.administradora !== '-' ? c.administradora : '—') + (c.forma_envio ? '<span class="sec">' + esc(c.forma_envio) + '</span>' : '') + '</td></tr>';
        }).join('') || '<tr><td colspan="' + cols.length + '"><div class="vazio" style="border:0;padding:34px">Nenhum condomínio com estes filtros.</div></td></tr>';
        $('#cTotal').textContent = lista.length + ' de ' + conds.length + ' condomínio' + (conds.length === 1 ? '' : 's');
        $$('#tbC tr[data-id]').forEach(function (tr) { tr.onclick = function () { verCondominio(Number(tr.getAttribute('data-id'))); }; });
      }
      var espera;
      $('#cfQ').oninput = function () { clearTimeout(espera); espera = setTimeout(filtrar, 200); };
      $$('#cfSit,#cfUf,#cfAdm,#cfPes,#cfSem,#cfSemVig').forEach(function (el) { el.onchange = filtrar; });
      $$('th[data-ordem]').forEach(function (th) {
        th.onclick = function () { var o = th.getAttribute('data-ordem'); f.desc = f.ordem === o ? !f.desc : false; f.ordem = o; filtrar(); };
      });
      filtrar();
    }

    function desenharResponsaveis() {
      $('#cCorpo').innerHTML = '<div class="linha" style="margin-bottom:14px"><span class="ajuda" style="flex:1;min-width:240px">Quantos condomínios cada pessoa tem na carteira. Clique no número para ver a lista' +
        (editaveis.length ? '; use <b>Transferir</b> quando alguém sair ou a carteira for redistribuída.' : '.') + '</span>' + acoes + '</div>' +
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
              (editaveis.length ? '<td style="text-align:right">' + (editavel(fn.campo) ? '<button class="btn ghost sm" data-transferir="' + esc(fn.campo + '|' + p) + '">Transferir</button>' : '') + '</td>' : '') + '</tr>', n: at.length };
          }).sort(function (a, b) { return b.n - a.n; });
          return '<div class="painel" style="margin-bottom:18px"><div class="cab-painel"><b style="font-family:var(--display)">' + esc(fn.rotulo) + '</b>' +
            '<span class="sec" style="color:var(--muted);font-weight:600;font-size:13px">' + nomes.length + ' pessoa' + (nomes.length === 1 ? '' : 's') + '</span><span class="espaco"></span>' +
            (sem ? '<a href="#" class="etiqueta ambar" data-sem="1">' + sem + ' ativo' + (sem === 1 ? '' : 's') + ' sem responsável</a>' : '') + '</div>' +
            '<div class="tabela-wrap"><table><thead><tr><th>Pessoa</th><th>Ramal</th><th class="num">Ativos</th><th>Por UF</th><th class="num">Distratados</th>' + (editaveis.length ? '<th></th>' : '') + '</tr></thead><tbody>' +
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

    async function verCondominio(id) {
      var d;
      try { d = await api('GET', '/api/carteira/' + id); } catch (e) { toast(e.message, 'erro'); return; }
      editarCondominio(d.condominio, d.historico);
    }

    var ROTULO_CAMPO = { codigo: 'ID Vouch', nome: 'Condomínio (Apelido Vouch)', situacao: 'Situação', comarca: 'UF', vencimento: 'Vencimento', administradora: 'Administradora', forma_envio: 'Forma de envio', executivo: 'Executivo de negócios',
      inicio_contrato: 'Vigência', razao_social: 'Razão social', cnpj: 'CNPJ', observacoes: 'Observações' };
    funcoes.forEach(function (fn) { ROTULO_CAMPO[fn.campo] = fn.rotulo; });

    function editarCondominio(c, historico) {
      var novo = !c;
      c = c || { situacao: 'ATIVO' };
      // condomínio novo: quem tem o cadastro preenche tudo. Condomínio existente: só os campos liberados para a pessoa
      // (Carteira: quem edita), os mesmos que o servidor aceita
      var editCampos = j.campos_editaveis || [];
      var tudoLiberado = Object.keys(ROTULO_CAMPO).every(function (cp) { return editCampos.indexOf(cp) >= 0; });
      var ro = novo ? !admin : !tudoLiberado;
      function podeCampo(cp) { return (novo && admin) || editCampos.indexOf(cp) >= 0; }
      var parcial = !tudoLiberado && !novo && editCampos.length > 0;
      var lib = function (cp) { return parcial && podeCampo(cp); };
      function campo(id, rotulo, valor, extra, liberado) {
        return '<div><label class="rot" for="' + id + '">' + rotulo + '</label><input class="campo" id="' + id + '" value="' + esc(valor || '') + '"' + (ro && !liberado ? ' readonly' : '') + (extra || '') + '></div>';
      }
      function lista(id, valores) { return '<datalist id="' + id + '">' + unicos(valores).map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>'; }
      var hist = (historico || []).map(function (h) {
        var det = h.detalhe || {};
        var o = h.acao === 'condominio_criado' ? 'cadastrou o condomínio' : Object.keys(det.mudancas || {}).map(function (k) {
          var v = det.mudancas[k];
          if (k === 'inicio_contrato') v = [mesAno(v[0]), mesAno(v[1])];
          return '<b>' + esc(ROTULO_CAMPO[k] || k) + '</b>: ' + esc(v[0] || '(vazio)') + ' → ' + esc(v[1] || '(vazio)');
        }).join('; ');
        var como = h.acao === 'condominio_importado' ? ' (importação)' : h.acao === 'carteira_transferida' ? ' (transferência de carteira)' : '';
        return '<div class="evento sistema"><span class="ponto"></span><div><b>' + esc(h.usuario_nome || 'Sistema') + '</b> ' + o + esc(como) + ' <span class="sec" style="display:inline">· ' + quando(h.quando) + '</span></div></div>';
      }).join('');
      var m = modal({
        titulo: novo ? 'Novo condomínio' : c.nome, largo: true,
        corpo: '<form class="pilha" id="fCond" novalidate>' +
          '<div class="grade-3">' + campo('cdCodigo', 'ID Vouch' + (novo ? ' *' : ''), c.codigo, novo ? ' placeholder="número do condomínio no Vouch"' : '', lib('codigo')) +
          '<div><label class="rot" for="cdSit">Situação</label><select class="campo" id="cdSit"' + (ro && !lib('situacao') ? ' disabled' : '') + '>' +
            unicos(j.situacoes.concat([c.situacao])).map(function (s) { return '<option value="' + esc(s) + '"' + (s === c.situacao ? ' selected' : '') + '>' + esc((CART_SIT[s] || [s])[0]) + '</option>'; }).join('') + '</select></div>' +
          campo('cdUf', 'UF (comarca)', c.comarca, ' maxlength="30" list="cdUfs"', lib('comarca')) + '</div>' +
          campo('cdNome', 'Condomínio (Apelido Vouch)', c.nome, ' maxlength="160"', lib('nome')) +
          '<div class="grade-2">' + campo('cdRazao', 'Razão social', c.razao_social, ' maxlength="200"', lib('razao_social')) + campo('cdCnpj', 'CNPJ', c.cnpj, ' maxlength="20" inputmode="numeric"', lib('cnpj')) + '</div>' +
          '<div class="grade-3">' + campo('cdVenc', 'Vencimento', c.vencimento, ' maxlength="40" placeholder="10 ou 5º DIA ÚTIL" list="cdVencs"', lib('vencimento')) +
          campo('cdAdm', 'Administradora', c.administradora, ' maxlength="120" list="cdAdms"', lib('administradora')) + campo('cdEnvio', 'Forma de envio', c.forma_envio, ' maxlength="60" list="cdEnvios"', lib('forma_envio')) + '</div>' +
          '<div class="grade-3">' + funcoes.map(function (fn) { return campo('cd_' + fn.campo, esc(fn.rotulo), c[fn.campo], ' maxlength="120" list="cdl_' + fn.campo + '" placeholder="NOME - RAMAL"', lib(fn.campo)); }).join('') + '</div>' +
          (parcial ? '<div class="ajuda">Você altera só os campos liberados para você; os outros ficam travados.' + (j.acesso ? ' Quem edita o quê: <b>Seu acesso</b>, no alto da Carteira.' : ' Para mudar o que você pode editar, fale com a coordenação do seu setor.') + '</div>' : '') +
          '<div class="grade-3">' + campo('cdInicio', 'Vigência do contrato' + (novo ? ' *' : ''), mesAno(c.inicio_contrato), ' maxlength="7" inputmode="numeric" placeholder="mm/aaaa"', lib('inicio_contrato')) +
          campo('cdExec', 'Executivo de negócios', c.executivo, ' maxlength="120" list="cdExecs"', lib('executivo')) + '</div>' +
          '<div><label class="rot" for="cdObs">Observações</label><textarea class="campo" id="cdObs" rows="3" maxlength="4000"' + (ro && !lib('observacoes') ? ' readonly' : '') + '>' + esc(c.observacoes || '') + '</textarea></div>' +
          lista('cdUfs', conds.map(function (x) { return x.comarca; })) + lista('cdVencs', conds.map(function (x) { return x.vencimento; })) +
          lista('cdAdms', conds.map(function (x) { return x.administradora; })) + lista('cdEnvios', conds.map(function (x) { return x.forma_envio; })) +
          lista('cdExecs', conds.map(function (x) { return x.executivo; })) +
          funcoes.map(function (fn) { return lista('cdl_' + fn.campo, conds.map(function (x) { return x[fn.campo]; })); }).join('') +
          '<div id="cdMsg" class="msg erro" hidden></div>' +
          (novo ? '' : '<div class="ajuda">Atualizado em ' + quando(c.atualizado_em) + (c.atualizado_por_nome ? ' por ' + esc(c.atualizado_por_nome) : '') + '.</div>') +
          (hist ? '<hr style="border:0;border-top:1px solid var(--border);margin:4px 0"><div><label class="rot">Histórico</label><div class="linha-tempo">' + hist + '</div></div>' : '') + '</form>',
        pe: (admin && !novo ? '<button class="btn danger" id="btCdApagar" style="margin-right:auto">Remover</button>' : '') +
          '<button class="btn ghost" data-fechar>' + (!ro || parcial ? 'Cancelar' : 'Fechar') + '</button>' + (!ro || parcial ? '<button class="btn primary" id="btCdOk">' + (novo ? 'Cadastrar' : 'Salvar') + '</button>' : ''),
      });
      // vigência: digita "102026" e vira "10/2026"
      if (!ro || lib('inicio_contrato')) $('#cdInicio', m).oninput = function () {
        var d = this.value.replace(/\D/g, '').slice(0, 6);
        this.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
      };
      if (parcial) {
        $('#btCdOk', m).onclick = async function () {
          var ids = { codigo: 'cdCodigo', situacao: 'cdSit', comarca: 'cdUf', nome: 'cdNome', razao_social: 'cdRazao', cnpj: 'cdCnpj', vencimento: 'cdVenc', administradora: 'cdAdm',
            forma_envio: 'cdEnvio', inicio_contrato: 'cdInicio', executivo: 'cdExec', observacoes: 'cdObs' };
          funcoes.forEach(function (fn) { ids[fn.campo] = 'cd_' + fn.campo; });
          var corpo = {};
          Object.keys(ids).forEach(function (k) { if (podeCampo(k)) corpo[k] = $('#' + ids[k], m).value; });
          var msg = $('#cdMsg', m);
          if (corpo.inicio_contrato && corpo.inicio_contrato.trim() && !/^(0?[1-9]|1[0-2])\/\d{4}$/.test(corpo.inicio_contrato.trim())) { msg.textContent = 'Vigência no formato mês/ano, ex.: 10/2026.'; msg.hidden = false; return; }
          var bt = this; bt.disabled = true;
          try { await api('PATCH', '/api/carteira/' + c.id, corpo); m.fechar(); toast('Condomínio atualizado.', 'ok'); paginaCarteira(aba); }
          catch (e) { var msg = $('#cdMsg', m); msg.textContent = e.message; msg.hidden = false; bt.disabled = false; }
        };
        return;
      }
      if (ro) {
        if ($('#btCdApagar', m)) ligarRemover();
        return;
      }
      $('#btCdOk', m).onclick = async function () {
        var corpo = {
          codigo: $('#cdCodigo', m).value, situacao: $('#cdSit', m).value, comarca: $('#cdUf', m).value, nome: $('#cdNome', m).value,
          razao_social: $('#cdRazao', m).value, cnpj: $('#cdCnpj', m).value, vencimento: $('#cdVenc', m).value, administradora: $('#cdAdm', m).value, executivo: $('#cdExec', m).value,
          forma_envio: $('#cdEnvio', m).value, inicio_contrato: $('#cdInicio', m).value, observacoes: $('#cdObs', m).value,
        };
        funcoes.forEach(function (fn) { corpo[fn.campo] = $('#cd_' + fn.campo, m).value; });
        var msg = $('#cdMsg', m);
        if (!corpo.nome.trim()) { msg.textContent = 'Informe o nome do condomínio.'; msg.hidden = false; return; }
        if (!corpo.codigo.trim()) { msg.textContent = 'Informe o ID Vouch do condomínio.'; msg.hidden = false; return; }
        if (novo && !corpo.inicio_contrato.trim()) { msg.textContent = 'Informe a vigência do contrato (mês/ano, ex.: 10/2026).'; msg.hidden = false; return; }
        if (corpo.inicio_contrato.trim() && !/^(0?[1-9]|1[0-2])\/\d{4}$/.test(corpo.inicio_contrato.trim())) { msg.textContent = 'Vigência no formato mês/ano, ex.: 10/2026.'; msg.hidden = false; return; }
        var bt = this; bt.disabled = true;
        try {
          if (novo) await api('POST', '/api/carteira', corpo); else await api('PATCH', '/api/carteira/' + c.id, corpo);
          m.fechar();
          toast(novo ? 'Condomínio cadastrado.' : 'Condomínio atualizado.', 'ok');
          paginaCarteira(aba);
        } catch (e) { msg.textContent = e.message; msg.hidden = false; bt.disabled = false; }
      };
      if ($('#btCdApagar', m)) ligarRemover();
      function ligarRemover() { $('#btCdApagar', m).onclick = async function () {
        if (!(await confirmar('Remover ' + c.nome + '?', 'O condomínio sai da carteira. Se ele apenas deixou de ser atendido, prefira mudar a situação para Distratado e manter o histórico.', 'Remover', true))) return;
        try { await api('DELETE', '/api/carteira/' + c.id); m.fechar(); toast('Condomínio removido.', 'ok'); paginaCarteira(aba); } catch (e) { toast(e.message, 'erro'); }
      }; }
    }
  }

  /* ---------- admin: equipes e tipos de demanda ---------- */
  async function paginaEquipes() {
    var restrito = gestorSetor();
    definirBarra('<span class="setor">' + (restrito ? 'Gestão do setor' : 'Administração') + '</span><span class="sep">/</span><span class="nome">' + (restrito ? 'Equipe e tipos de demanda' : 'Equipes e tipos de demanda') + '</span>');
    $('#conteudo').innerHTML = carregandoHtml();
    var j;
    try { j = await api('GET', '/api/admin/equipes'); await carregarMeta(); } catch (e) { toast(e.message, 'erro'); return; }
    restrito = !!j.restrito;
    var nomeU = {};
    j.usuarios.forEach(function (u) { nomeU[u.id] = u.nome; });
    var em = j.email || {};
    $('#conteudo').innerHTML = '<div class="pagina"><h1>' + (restrito ? 'Equipe e tipos de demanda' : 'Equipes e tipos de demanda') + '</h1><p class="sub">Para cada setor, quem atende os tickets (e quem é líder, que distribui) e os tipos de demanda com o prazo de atendimento. Quem é de cada setor vem do cadastro da pessoa.</p>' +
      (restrito ? '' : '<div class="atalho-tickets"><div class="icone-mod">' + IC.sino + '</div><div style="flex:1;min-width:220px"><b style="font-family:var(--display)">Avisos por e-mail</b>' +
      '<span class="sec" style="display:block;color:var(--muted);font-weight:600;font-size:13px">' +
      (em.ativo ? 'Enviando ' + (em.tipo === 'microsoft365' ? 'pelo Microsoft 365' : 'por SMTP') + ' como <b>' + esc(em.remetente || '') + '</b>.' : 'Não configurado: por enquanto os avisos aparecem só no portal (veja o README, seção Central de Tickets).') +
      '</span></div>' + (em.ativo ? '<button class="btn ghost sm" id="btEmailTeste">Enviar e-mail de teste para mim</button>' : '<span class="etiqueta ambar">sem e-mail</span>') + '</div>') +
      '<div class="cartoes">' + j.setores.map(function (s) {
        var lideres = s.membros.filter(function (m) { return m.lider; }).map(function (m) { return nomeU[m.usuario_id]; });
        var ativos = s.categorias.filter(function (c) { return c.ativo; });
        return '<div class="cartao" data-setor="' + s.id + '" style="cursor:pointer"><div class="cab"><div class="icone-mod">' + IC.pessoas + '</div><div style="flex:1;min-width:0"><h3>' + esc(s.nome) + '</h3>' +
          '<span class="sec">' + s.membros.length + ' pessoa' + (s.membros.length === 1 ? '' : 's') + ' · ' + ativos.length + ' tipo' + (ativos.length === 1 ? '' : 's') + ' de demanda</span></div>' +
          (!s.membros.length ? '<span class="etiqueta ambar">sem equipe</span>' : !lideres.length ? '<span class="etiqueta ambar">sem líder</span>' : '') + '</div>' +
          '<p>' + (lideres.length ? 'Líder: ' + esc(lideres.join(', ')) : 'Defina quem distribui os tickets deste setor.') + '</p>' +
          '<div class="acoes"><span class="btn ghost sm">Configurar</span></div></div>';
      }).join('') + '</div>' + (restrito ? '' : '<p class="ajuda" style="margin-top:14px">Para criar, renomear ou remover setores use <a href="#/admin/modulos">Módulos e dados → Setores</a>.</p>') + '</div>';
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
          '<div class="caixa-opcoes" id="eLista">' + j.usuarios.filter(function (u) { return restrito ? membros[u.id] !== undefined : (u.ativo || membros[u.id] !== undefined); }).map(function (u) {
            var dentro = membros[u.id] !== undefined;
            return '<label data-nome="' + esc(normal(u.nome + ' ' + u.email)) + '"><input type="checkbox" name="eMembro" value="' + u.id + '"' + (dentro ? ' checked' : '') + (restrito ? ' disabled' : '') + '>' +
              '<span style="flex:1">' + esc(u.nome) + ' <span class="sec" style="display:inline">' + esc(u.email) + '</span></span>' +
              '<span class="linha" style="font-size:12.5px;font-weight:700;color:var(--muted)"><input type="checkbox" name="eLider" value="' + u.id + '"' + (membros[u.id] ? ' checked' : '') + (dentro ? '' : ' disabled') + '> líder</span></label>';
          }).join('') + '</div><div class="ajuda">Líder: vê a fila do setor e distribui para qualquer pessoa da equipe. Demais pessoas: veem a fila, assumem tickets e tratam os que estão com elas. Coordenador e supervisor do setor já distribuem.' +
          (restrito ? ' Para incluir ou tirar alguém do setor, use <b>Usuários do setor</b>.' : ' Também dá para definir o setor no cadastro da pessoa (Usuários e acessos).') + '</div></div>' +
          '<div class="linha"><button class="btn primary" id="btSalvarEquipe">' + (restrito ? 'Salvar líderes' : 'Salvar equipe') + '</button></div>' +
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
    modulo_criado: 'Criou módulo', modulo_editado: 'Editou módulo', modulo_removido: 'Removeu módulo', arquivo_enviado: 'Enviou HTML', arquivo_aguardando: 'Enviou HTML (aguarda aprovação)', versao_aprovada: 'Aprovou versão nova', versao_recusada: 'Recusou versão nova', papeis_recusados: 'Tentou mudar papéis sem permissão', backup_restaurado: 'Restaurou backup', versao_restaurada: 'Restaurou versão',
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

  /* ======================= tutoriais em vídeo ======================= */
  var tutoriais = null; // os que a pessoa pode ver (com vídeo enviado)
  function carregarTutoriais() {
    return api('GET', '/api/tutoriais').then(function (j) { tutoriais = j; desenharMenu(); return j; }).catch(function () { return null; });
  }
  function duracaoTxt(s) { if (!s) return ''; return s < 60 ? s + ' s' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' min'; }
  function vistos() { return lembrar('tutoriais.vistos', {}); }
  function cartaoTutorial(t) {
    var visto = vistos()[t.slug] === t.v;
    return '<a class="cartao cartao-tut" href="#/tutoriais/' + esc(t.slug) + '">' +
      '<div class="capa-tut"><span class="play">' + IC.video + '</span>' + (t.duracao ? '<span class="dur">' + duracaoTxt(t.duracao) + '</span>' : '') +
      (visto ? '<span class="visto">✓ assistido</span>' : '') + '</div>' +
      '<h3>' + esc(t.titulo) + '</h3><p>' + esc(t.descricao) + '</p><span class="setor-cartao">' + esc(t.publico) + '</span></a>';
  }

  async function paginaTutoriais() {
    definirBarra('<span class="nome">Tutoriais</span>');
    $('#conteudo').innerHTML = carregandoHtml();
    var j = await carregarTutoriais();
    if (!j) { $('#conteudo').innerHTML = '<div class="pagina"><div class="vazio">Não foi possível carregar os tutoriais.</div></div>'; return; }
    var html = '<div class="pagina"><h1>Tutoriais</h1><p class="sub">Vídeos curtos com o portal sendo usado de verdade (os dados são fictícios). Aqui aparecem os vídeos do seu perfil, do seu setor e das ferramentas que você usa.</p>';
    if (!j.tutoriais.length) html += '<div class="vazio">Ainda não há tutoriais para você.' + (eu.papel === 'admin' ? '<br><a class="btn primary" style="margin-top:14px" href="#/admin/tutoriais">Enviar os vídeos</a>' : '') + '</div>';
    j.grupos.forEach(function (g) {
      var itens = j.tutoriais.filter(function (t) { return t.grupo === g; });
      if (itens.length) html += '<section class="secao-setor"><h2>' + esc(g) + ' <span class="qtd">' + itens.length + '</span></h2><div class="cartoes">' + itens.map(cartaoTutorial).join('') + '</div></section>';
    });
    $('#conteudo').innerHTML = html + '</div>';
  }

  function lerVtt(txt) {
    var tempo = function (h) { var p = h.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
    return String(txt || '').split(/\r?\n\r?\n/).map(function (bloco) {
      var l = bloco.trim().split(/\r?\n/);
      var i = l.findIndex(function (x) { return x.indexOf('-->') > 0; });
      if (i < 0) return null;
      var ts = l[i].split('-->');
      var texto = l.slice(i + 1).join(' ');
      var sep = texto.indexOf(' — ');
      return { ini: tempo(ts[0].trim()), fim: tempo(ts[1].trim().split(' ')[0]), etapa: sep > 0 ? texto.slice(0, sep) : '', texto: sep > 0 ? texto.slice(sep + 3) : texto };
    }).filter(Boolean);
  }

  async function paginaTutorial(slug) {
    definirBarra('<a class="setor" href="#/tutoriais" style="text-decoration:none">Tutoriais</a><span class="sep">/</span><span class="nome">…</span>', '<a class="btn ghost sm" href="#/tutoriais">Voltar</a>');
    $('#conteudo').innerHTML = carregandoHtml();
    var j = tutoriais || await carregarTutoriais();
    var t = j && j.tutoriais.find(function (x) { return x.slug === slug; });
    if (!t) { $('#conteudo').innerHTML = '<div class="pagina"><div class="vazio">Tutorial não encontrado.<br><a class="btn ghost" style="margin-top:14px" href="#/tutoriais">Ver os tutoriais</a></div></div>'; return; }
    definirBarra('<a class="setor" href="#/tutoriais" style="text-decoration:none">Tutoriais</a><span class="sep">/</span><span class="nome">' + esc(t.titulo) + '</span>', '<a class="btn ghost sm" href="#/tutoriais">Voltar</a>');
    var outros = j.tutoriais.filter(function (x) { return x.grupo === t.grupo && x.slug !== t.slug; });
    $('#conteudo').innerHTML = '<div class="pagina tutorial">' +
      '<span class="setor-cartao">' + esc(t.grupo) + ' · ' + esc(t.publico) + '</span><h1>' + esc(t.titulo) + '</h1><p class="sub">' + esc(t.descricao) + '</p>' +
      '<div class="grade-tut"><div class="quadro-video"><video id="vTut" controls playsinline preload="metadata" src="/api/tutoriais/' + esc(t.slug) + '/video?v=' + t.v + '"></video></div>' +
      '<aside class="painel passos-tut"><div class="cab-passos">Passo a passo<span class="ajuda" style="margin:0">clique para ir ao trecho</span></div><ol id="olPassos"><li class="ajuda">' + (t.tem_legendas ? 'Carregando…' : 'Sem passo a passo para este vídeo.') + '</li></ol></aside></div>' +
      (outros.length ? '<section class="secao-setor" style="margin-top:28px"><h2>Mais vídeos de ' + esc(t.grupo) + '</h2><div class="cartoes">' + outros.map(cartaoTutorial).join('') + '</div></section>' : '') + '</div>';
    var v = $('#vTut');
    v.addEventListener('timeupdate', function () {
      if (v.duration && v.currentTime / v.duration > 0.9) { var vs = vistos(); if (vs[t.slug] !== t.v) { vs[t.slug] = t.v; guardar('tutoriais.vistos', vs); } }
    });
    if (!t.tem_legendas) return;
    var cues = [];
    try { var r = await fetch('/api/tutoriais/' + encodeURIComponent(t.slug) + '/legendas?v=' + t.v, { credentials: 'same-origin' }); if (r.ok) cues = lerVtt(await r.text()); } catch (e) { /* sem passos */ }
    var ol = $('#olPassos');
    if (!ol || location.hash !== '#/tutoriais/' + slug) return; // a pessoa já saiu da página
    var etapaAnt = null;
    ol.innerHTML = cues.map(function (c, i) {
      var cab = c.etapa && c.etapa !== etapaAnt ? '<li class="etapa">' + esc(c.etapa) + '</li>' : '';
      etapaAnt = c.etapa || etapaAnt;
      return cab + '<li class="passo-item" data-i="' + i + '"><span class="t">' + duracaoTxt(Math.floor(c.ini)).replace(' min', '').replace(' s', 's') + '</span><span>' + esc(c.texto) + '</span></li>';
    }).join('') || '<li class="ajuda">Sem passo a passo para este vídeo.</li>';
    $$('li.passo-item', ol).forEach(function (li) {
      li.addEventListener('click', function () { v.currentTime = cues[Number(li.getAttribute('data-i'))].ini + 0.05; v.play(); });
    });
    var ativo = -1;
    v.addEventListener('timeupdate', function () {
      var i = -1;
      cues.forEach(function (c, k) { if (v.currentTime >= c.ini && v.currentTime < c.fim) i = k; });
      if (i === ativo) return;
      ativo = i;
      $$('li.passo-item', ol).forEach(function (li) { li.classList.toggle('on', Number(li.getAttribute('data-i')) === i); });
      var on = $('li.passo-item.on', ol);
      if (on) ol.scrollTop = on.offsetTop - ol.offsetTop - 60;
    });
  }

  /* administração: envia os vídeos gravados (cada arquivo vai para o tutorial com o mesmo nome) */
  async function paginaAdminTutoriais() {
    definirBarra('<span class="setor">Administração</span><span class="sep">/</span><span class="nome">Tutoriais</span>', '<a class="btn ghost sm" href="#/tutoriais">' + IC.video + 'Ver como as pessoas veem</a>');
    $('#conteudo').innerHTML = carregandoHtml();
    var j;
    try { j = await api('GET', '/api/admin/tutoriais'); } catch (e) { toast(e.message, 'erro'); return; }
    var enviados = j.tutoriais.filter(function (t) { return t.tem_video; }).length;
    var desatualizados = j.tutoriais.filter(function (t) { return t.desatualizado; });
    var pendencias = '';
    if (desatualizados.length) {
      pendencias += '<div class="msg aviso" style="margin-bottom:10px"><b>' + desatualizados.length + ' tutorial(is) para atualizar:</b> a ferramenta recebeu um HTML novo depois do vídeo — ' +
        desatualizados.map(function (t) { return esc(t.titulo); }).join(', ') + '. Se a tela ou o fluxo mudou, regrave; se não, clique em “Continua valendo” na linha do tutorial.</div>';
    }
    if ((j.sem_tutorial || []).length) {
      pendencias += '<div class="msg aviso" style="margin-bottom:10px"><b>Ferramentas sem tutorial:</b> ' +
        j.sem_tutorial.map(function (m) { return esc(m.nome); }).join(', ') + '. Toda ferramenta nova precisa de um vídeo.</div>';
    }
    $('#conteudo').innerHTML = '<div class="pagina"><h1>Tutoriais em vídeo</h1>' +
      '<p class="sub">Cada pessoa vê os vídeos do perfil, do setor e das ferramentas dela. ' + enviados + ' de ' + j.tutoriais.length + ' vídeos enviados.</p>' + pendencias +
      '<label class="zona-envio" id="zTut" style="margin-bottom:12px">' + IC.enviar + '<div>Arraste aqui os arquivos <b>.mp4</b> e <b>.vtt</b> dos tutoriais (pode ser todos de uma vez) ou clique para escolher.<br>' +
      '<span class="ajuda">Cada arquivo vai para o tutorial com o mesmo nome (ex.: ticket-atender.mp4 e ticket-atender.vtt).</span></div>' +
      '<input type="file" accept=".mp4,.vtt,video/mp4,text/vtt" multiple hidden id="inTut"></label>' +
      '<div id="resTut" class="pilha" style="margin-bottom:16px"></div>' +
      '<div class="painel"><div class="tabela-wrap"><table><thead><tr><th>Tutorial</th><th>Para quem</th><th>Situação</th><th></th></tr></thead><tbody>' +
      j.grupos.map(function (g) {
        var itens = j.tutoriais.filter(function (t) { return t.grupo === g; });
        if (!itens.length) return '';
        return '<tr><td colspan="4" style="background:var(--surface-2);font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">' + esc(g) + '</td></tr>' +
          itens.map(function (t) {
            return '<tr><td><b>' + esc(t.titulo) + '</b><div class="ajuda" style="margin:2px 0 0">' + esc(t.slug) + '</div></td><td>' + esc(t.publico) + (t.modulo ? '<div class="ajuda" style="margin:2px 0 0">' + esc(t.modulo) + '</div>' : '') + '</td>' +
              '<td>' + (t.desatualizado ? '<span class="etiqueta ambar">ferramenta atualizada em ' + quando(t.ferramenta_atualizada_em) + ' — regravar</span><br>' : '') + (t.tem_video ? '<span class="etiqueta verde">enviado</span> <span class="ajuda" style="display:inline">' + duracaoTxt(t.duracao) + ' · ' + tamanho(t.tamanho) + ' · ' + quando(t.enviado_em) + (t.tem_legendas ? '' : ' · sem passo a passo') + '</span>' : '<span class="etiqueta cinza">falta enviar</span>') + '</td>' +
              '<td style="text-align:right;white-space:nowrap">' + (t.desatualizado ? '<button class="btn ghost sm" data-valendo="' + esc(t.slug) + '">Continua valendo</button> ' : '') + (t.tem_video ? '<a class="btn ghost sm" href="#/tutoriais/' + esc(t.slug) + '">Ver</a> <button class="btn ghost sm" data-tirar="' + esc(t.slug) + '">Remover</button>' : '') + '</td></tr>';
          }).join('');
      }).join('') + '</tbody></table></div></div></div>';

    function enviar(url, arquivo, tipo, aoProgresso) {
      return new Promise(function (ok, falha) {
        var x = new XMLHttpRequest();
        x.open('PUT', url);
        x.setRequestHeader('Content-Type', tipo);
        x.upload.onprogress = function (e) { if (e.lengthComputable) aoProgresso(Math.round(e.loaded / e.total * 100)); };
        x.onload = function () {
          var r = {}; try { r = JSON.parse(x.responseText); } catch (e) { /* sem JSON */ }
          if (x.status >= 200 && x.status < 300) ok(r); else falha(new Error(r.erro || ('Erro ' + x.status)));
        };
        x.onerror = function () { falha(new Error('Falha de conexão.')); };
        x.send(arquivo);
      });
    }
    var slugs = {}; j.tutoriais.forEach(function (t) { slugs[t.slug] = t; });
    async function processar(arquivos) {
      var res = $('#resTut');
      // legendas depois do vídeo do mesmo tutorial
      arquivos.sort(function (a, b) { return /\.vtt$/i.test(a.name) - /\.vtt$/i.test(b.name); });
      for (var i = 0; i < arquivos.length; i++) {
        var f = arquivos[i];
        var slug = f.name.replace(/\.(mp4|vtt)$/i, '').toLowerCase();
        var vtt = /\.vtt$/i.test(f.name);
        var linha = document.createElement('div');
        linha.className = 'msg aviso';
        res.appendChild(linha);
        if (!slugs[slug]) { linha.className = 'msg erro'; linha.textContent = f.name + ': não há tutorial com este nome.'; continue; }
        linha.textContent = f.name + ': enviando…';
        try {
          await enviar('/api/admin/tutoriais/' + slug + '/' + (vtt ? 'legendas' : 'video'), f, vtt ? 'text/vtt' : 'video/mp4', function (p) { linha.textContent = f.name + ': enviando… ' + p + '%'; });
          linha.className = 'msg ok'; linha.textContent = f.name + ' → ' + slugs[slug].titulo + (vtt ? ' (passo a passo)' : '');
        } catch (e) { linha.className = 'msg erro'; linha.textContent = f.name + ': ' + e.message; }
      }
      tutoriais = null; carregarTutoriais();
      var bt = document.createElement('button'); bt.className = 'btn primary'; bt.textContent = 'Atualizar a lista'; bt.onclick = paginaAdminTutoriais;
      res.appendChild(bt);
    }
    ligarZona($('#zTut'), $('#inTut'), processar, /\.(mp4|vtt)$/i, 'Envie arquivos .mp4 ou .vtt');
    $$('[data-valendo]').forEach(function (b) {
      b.onclick = async function () {
        var t = slugs[b.getAttribute('data-valendo')];
        if (!(await confirmar('Vídeo continua valendo', 'O HTML novo de "' + esc(t.titulo) + '" não mudou a tela nem o fluxo mostrados no vídeo? O aviso de regravar sai até a próxima versão da ferramenta.', 'Continua valendo'))) return;
        try { await api('POST', '/api/admin/tutoriais/' + t.slug + '/conferido'); toast('Tutorial em dia.', 'ok'); paginaAdminTutoriais(); } catch (e) { toast(e.message, 'erro'); }
      };
    });
    $$('[data-tirar]').forEach(function (b) {
      b.onclick = async function () {
        var t = slugs[b.getAttribute('data-tirar')];
        if (!(await confirmar('Remover vídeo', 'Remover o vídeo "' + esc(t.titulo) + '"? Ele deixa de aparecer para as pessoas até ser enviado de novo.', 'Remover', true))) return;
        try { await api('DELETE', '/api/admin/tutoriais/' + t.slug); toast('Vídeo removido.', 'ok'); tutoriais = null; carregarTutoriais(); paginaAdminTutoriais(); } catch (e) { toast(e.message, 'erro'); }
      };
    });
  }

  /* ======================= partida ======================= */
  /* ======================= Minhas Premiações ======================= */
  // demonstrativos enviados pela Gestão de Premiações: cada pessoa vê o seu; líderes e diretoria, os da equipe
  var MOD_COMISSAO = 'premiacoes';
  var resumoComissao = null;
  var MESES_C = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  function nomeCompC(c) { var p = String(c).split('-'); return MESES_C[Number(p[1]) - 1] + '/' + p[0]; }
  function reais(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function diaC(s) { return s ? new Date(s).toLocaleDateString('pt-BR') : ''; }
  async function atualizarComissao() {
    var r;
    try { r = await api('GET', '/api/comissao/resumo'); } catch (e) { return; }
    var mudou = !resumoComissao || resumoComissao.meus !== r.meus || resumoComissao.equipe !== r.equipe || resumoComissao.pendentes !== r.pendentes || resumoComissao.planilhas !== r.planilhas;
    resumoComissao = r;
    if (mudou && $('#nav')) desenharMenu();
  }
  function situacaoComissao(x, meu) {
    if (x.ciente_em) return '<span class="etiqueta verde">✓ Ciente em ' + diaC(x.ciente_em) + '</span>';
    if (x.aberto_em) return '<span class="etiqueta azul">' + (meu ? 'Aberto · falta confirmar' : 'Abriu, não confirmou') + '</span>';
    return '<span class="etiqueta ambar">' + (meu ? 'Novo' : 'Ainda não abriu') + '</span>';
  }
  async function paginaComissoes(sub) {
    if (/^\d+$/.test(sub || '')) return paginaDemonstrativo(Number(sub));
    definirBarra('<span class="nome">Minhas Premiações</span>');
    $('#conteudo').innerHTML = '<div class="pagina"><div class="vazio">Carregando…</div></div>';
    var j, pl = [];
    try {
      var rs = await Promise.all([api('GET', '/api/comissao/meus'), api('GET', '/api/comissao/minhas-planilhas')]);
      j = rs[0]; pl = rs[1].planilhas || [];
    } catch (e) { $('#conteudo').innerHTML = '<div class="pagina"><div class="vazio">' + esc(e.message) + '</div></div>'; return; }
    if (location.hash.indexOf('#/premiacoes') !== 0) return;
    var aba = sub === 'equipe' && j.equipe.length ? 'equipe' : (j.meus.length || !j.equipe.length ? 'meus' : 'equipe');
    var html = '<div class="pagina"><h1>Minhas Premiações</h1><p class="sub">' + (aba === 'meus' ? 'Seus demonstrativos de premiação, mês a mês. Abra, confira os valores e clique em “Estou ciente”.' : 'Os demonstrativos das pessoas que você acompanha. Só você, a pessoa e a gestão de premiações veem.') + '</p>';
    html += blocoPlanilhas(pl);
    if (j.equipe.length) html += '<nav class="abas"><a href="#/premiacoes" class="' + (aba === 'meus' ? 'on' : '') + '">Meus demonstrativos</a><a href="#/premiacoes/equipe" class="' + (aba === 'equipe' ? 'on' : '') + '">Minha equipe</a></nav>';
    if (aba === 'meus') {
      html += j.meus.length ? '<div class="cartoes">' + j.meus.map(function (x) {
        return '<a class="cartao" href="#/premiacoes/' + x.id + '"><div class="cab"><div class="icone-mod">' + IC.documento + '</div><div><h3>' + nomeCompC(x.competencia) + '</h3>' +
          '<span class="ajuda" style="margin:0">' + esc([x.cargo, x.setor].filter(Boolean).join(' · ')) + '</span></div></div>' +
          '<div class="valor-comissao">' + reais(x.valor) + '</div><div class="linha">' + situacaoComissao(x, true) +
          (x.versao > 1 ? '<span class="etiqueta cinza">atualizado · versão ' + x.versao + '</span>' : '') + '</div></a>';
      }).join('') + '</div>' : '<div class="vazio">Nenhum demonstrativo enviado para você ainda.</div>';
    } else {
      var comps = j.equipe.map(function (x) { return x.competencia; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
      var sel = lembrar('comissao.competencia', comps[0]);
      if (comps.indexOf(sel) < 0) sel = comps[0];
      var lista = j.equipe.filter(function (x) { return x.competencia === sel; });
      var cientes = lista.filter(function (x) { return x.ciente_em; }).length;
      var total = lista.reduce(function (t, x) { return t + Number(x.valor || 0); }, 0);
      html += '<div class="linha" style="margin-bottom:14px"><label for="selCompC" style="font-weight:800;color:var(--muted);font-size:12.5px">COMPETÊNCIA</label>' +
        '<select class="campo" id="selCompC" style="width:auto">' + comps.map(function (c) { return '<option value="' + esc(c) + '"' + (c === sel ? ' selected' : '') + '>' + nomeCompC(c) + '</option>'; }).join('') + '</select></div>' +
        '<div class="tiles" style="margin-bottom:16px"><div class="tile"><span class="rot-tile">Pessoas</span><b>' + lista.length + '</b></div>' +
        '<div class="tile"><span class="rot-tile">Total da equipe</span><b style="font-size:22px">' + reais(total) + '</b></div>' +
        '<div class="tile' + (cientes < lista.length ? ' alerta' : '') + '"><span class="rot-tile">Cientes</span><b>' + cientes + ' de ' + lista.length + '</b></div></div>' +
        '<div class="painel"><div class="tabela-wrap"><table><thead><tr><th>Pessoa</th><th>Setor</th><th style="text-align:right">Comissão</th><th>Situação</th></tr></thead><tbody>' +
        lista.map(function (x) {
          return '<tr class="clicavel" data-id="' + x.id + '"><td><b>' + esc(x.nome) + '</b><span class="sec">' + esc(x.cargo || '') + '</span></td><td>' + esc(x.setor || '—') + '</td>' +
            '<td style="text-align:right;font-weight:800;font-variant-numeric:tabular-nums">' + reais(x.valor) + '</td><td>' + situacaoComissao(x, false) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    $('#conteudo').innerHTML = html + '</div>';
    $$('tr.clicavel[data-id]').forEach(function (tr) { tr.onclick = function () { location.hash = '#/premiacoes/' + tr.getAttribute('data-id'); }; });
    if ($('#selCompC')) $('#selCompC').onchange = function () { guardar('comissao.competencia', this.value); paginaComissoes('equipe'); };
    $$('input[data-plan]').forEach(function (inp) {
      inp.onchange = async function () {
        var f = inp.files[0]; if (!f) return;
        var bt = inp.closest('.pedido-plan').querySelector('.btn'); if (bt) { bt.classList.add('carregando'); bt.lastChild.textContent = 'Enviando…'; }
        try {
          var r = await fetch('/api/comissao/minhas-planilhas/' + inp.getAttribute('data-plan'), { method: 'POST', credentials: 'same-origin', body: f,
            headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Nome-Arquivo': encodeURIComponent(f.name) } });
          var x = await r.json().catch(function () { return {}; });
          if (!r.ok) throw new Error(x.erro || 'Não foi possível enviar.');
          toast(x.faltam ? 'Planilha enviada. Falta' + (x.faltam > 1 ? 'm ' + x.faltam + ' planilhas' : ' 1 planilha') + ': a gestão de premiações recebe o aviso quando todas forem enviadas.'
            : 'Planilha enviada. A gestão de premiações foi avisada.');
          atualizarComissao(); paginaComissoes(sub);
        } catch (e) { toast(e.message, 'erro'); paginaComissoes(sub); }
      };
    });
    if (sub === 'enviar' && $('.planilhas-mes')) $('.planilhas-mes').scrollIntoView({ block: 'start' });
  }
  // pedidos de planilha da gestão de premiações: a pessoa só envia o arquivo dela (não vê a ferramenta nem valores)
  function blocoPlanilhas(lista) {
    if (!lista.length) return '';
    var dataHora = function (s) { var d = new Date(s); return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
    var daEquipe = lista.some(function (x) { return x.nome && x.nome !== eu.nome; });
    var doMes = lista.filter(function (x) { return x.competencia === lista[0].competencia; });
    var enviadas = doMes.filter(function (x) { return x.enviado_em; }).length;
    return '<section class="planilhas-mes"><h2>' + IC.documento + 'Planilhas para enviar' + (doMes.length > 1 ? ' <span class="etiqueta ' + (enviadas === doMes.length ? 'verde' : 'ambar') + '">' + enviadas + ' de ' + doMes.length + ' enviadas</span>' : '') + '</h2>' +
      '<p class="sub">' + (daEquipe ? 'A gestão de premiações pediu as planilhas do mês da sua equipe. Envie um arquivo por pessoa (Excel, CSV ou PDF); quem pediu recebe um aviso só, quando todas estiverem enviadas.' : 'A gestão de premiações pediu a sua planilha do mês. Envie o arquivo aqui (Excel, CSV ou PDF); quem pediu recebe o aviso.') + '</p>' +
      lista.map(function (x) {
        var st = x.importado_em ? ['ok', 'Recebida e conferida pela gestão'] : x.enviado_em ? ['enviada', 'Enviada em ' + dataHora(x.enviado_em)] : ['pendente', 'Aguardando envio'];
        return '<div class="pedido-plan ' + st[0] + '"><div class="info"><b>' + (x.nome && x.nome !== eu.nome ? esc(x.nome) + ' · ' : '') + esc(x.titulo) + '</b><span>Premiação de ' + nomeCompC(x.competencia) + ' · pedido em ' + diaC(x.pedido_em) + '</span>' +
          '<span class="etiqueta ' + ({ ok: 'verde', enviada: 'azul', pendente: 'ambar' })[st[0]] + '">' + st[1] + '</span>' +
          (x.arquivo_nome ? '<span class="arq">' + IC.documento + esc(x.arquivo_nome) + '</span>' : '') + '</div>' +
          '<label class="btn ' + (x.enviado_em ? 'ghost' : 'primary') + '"><input type="file" hidden accept=".xlsx,.xls,.xlsm,.csv,.pdf" data-plan="' + x.id + '">' + (x.enviado_em ? 'Enviar de novo' : 'Enviar planilha') + '</label></div>';
      }).join('') + '</section>';
  }
  async function paginaDemonstrativo(id) {
    $('#conteudo').innerHTML = '<div class="pagina"><div class="vazio">Carregando…</div></div>';
    var x;
    try { x = (await api('GET', '/api/comissao/relatorios/' + id)).relatorio; } catch (e) {
      definirBarra('<span class="nome">Minhas Premiações</span>');
      $('#conteudo').innerHTML = '<div class="pagina"><div class="vazio">' + esc(e.message) + '<br><a class="btn ghost" style="margin-top:14px" href="#/premiacoes">Voltar</a></div></div>';
      return;
    }
    var podeCiente = x.meu && !x.ciente_em && !x.substituido;
    definirBarra('<a class="setor" href="#/premiacoes">Minhas Premiações</a><span class="sep">/</span><span class="nome">' + esc((x.meu ? '' : x.nome + ' · ') + nomeCompC(x.competencia)) + '</span>',
      (podeCiente ? '<button class="btn primary sm" id="btCienteC">Estou ciente</button>' : '') + '<a class="btn ghost sm" href="#/premiacoes">Voltar</a>');
    var faixa = x.substituido ? '<div class="aviso-demo alerta">Este demonstrativo foi atualizado. Abra a versão nova em <a href="#/premiacoes">Minhas Premiações</a>.</div>'
      : x.meu ? (x.ciente_em ? '<div class="aviso-demo ok">✓ Você confirmou este demonstrativo em ' + diaC(x.ciente_em) + '.</div>'
        : '<div class="aviso-demo">Confira os valores. Se estiver tudo certo, clique em <b>Estou ciente</b>; se tiver dúvida, fale com a sua liderança antes.</div>')
        : '<div class="aviso-demo">Demonstrativo de <b>' + esc(x.nome) + '</b> (' + esc(x.setor || '—') + ') · versão ' + x.versao + ' · enviado em ' + diaC(x.enviado_em) + ' · ' + situacaoComissao(x, false) + '</div>';
    $('#conteudo').innerHTML = '<div class="pagina pagina-demo">' + faixa + '<iframe id="frDemo" class="frame-demo" src="/api/comissao/relatorios/' + id + '/ver" title="Demonstrativo de premiação"></iframe></div>';
    var fr = $('#frDemo');
    // a altura acompanha o demonstrativo (a folha ou, sem ela, o corpo da página)
    fr.onload = function () {
      try { var d = fr.contentDocument, f = d.querySelector('.rel'); fr.style.height = Math.ceil((f ? f.getBoundingClientRect().bottom : d.body.scrollHeight) + 20) + 'px'; } catch (e) { /* mantém a altura padrão */ }
    };
    if (podeCiente) $('#btCienteC').onclick = async function () {
      this.disabled = true;
      try { await api('POST', '/api/comissao/relatorios/' + id + '/ciente'); toast('Obrigado! Demonstrativo confirmado.', 'ok'); atualizarComissao(); paginaDemonstrativo(id); }
      catch (e) { toast(e.message, 'erro'); this.disabled = false; }
    };
    if (x.meu) setTimeout(atualizarComissao, 800);
  }

  /* ======================= Análise de Crédito ======================= */
  var metaCredito = null;
  var resumoCredito = null;
  var ETAPA_CR = {
    rascunho: ['Rascunho', 'cinza'], pendencia: ['Pendência com o executivo', 'ambar'], fila: ['Na fila', 'azul'], em_analise: ['Em análise', 'azul'],
    diretoria: ['Na diretoria', 'ambar'], validada: ['Chancelada · falta liberar', 'verde'], enviada: ['Retorno enviado', 'verde'], cancelada: ['Cancelada', 'cinza'],
  };
  var FONTE_CR = { formulario: 'formulário', relatorio: 'relatório', convencao: 'convenção', formulario_total: 'total no formulário', formulario_detalhe: 'detalhe do formulário' };
  var CAMPO_CR = { uh_total: 'Nº de unidades', taxa_ordinaria: 'Taxa ordinária', dia_vencimento: 'Dia do vencimento', uh_isentas: 'Unidades isentas', taxa_extra: 'Taxa extra' };
  var RES_CR = { aprovada: ['APROVADA', 'verde'], ressalvas: ['APROVADA COM RESSALVAS', 'ambar'], reprovada: ['REPROVADA', 'vermelha'], pendente: ['PENDENTE', 'azul'] };
  var ABAS_CR = [['minhas', 'Minhas solicitações'], ['fila', 'Fila'], ['diretoria', 'Diretoria'], ['todas', 'Histórico'], ['pessoas', 'Pessoas e papéis'], ['politica', 'Política e faixas']];
  var EVENTO_CR = {
    criada: 'criou a solicitação', formulario: 'alterou o formulário', documento: 'anexou um documento', documento_removido: 'removeu um documento',
    enviada: 'enviou para análise', reenviada: 'reenviou depois da pendência', assumida: 'assumiu a análise', motor: 'calculou a análise', ajuste: 'ajustou um valor',
    pendencia: 'devolveu com pendência', diretoria: 'enviou à diretoria', chancelada: 'chancelou', chancela_recusada: 'não chancelou', liberada: 'liberou o retorno',
    reanalise_pedida: 'pediu reanálise', cancelada: 'cancelou', leitura: 'leu o PDF com IA', leitura_erro: 'não conseguiu ler o PDF com IA',
    formulario_corrigido: 'corrigiu o formulário do executivo',
  };

  function etqCr(mapa, k) { return k && mapa[k] ? etq(mapa[k]) : ''; }
  function pctCr(v) { return v == null ? '—' : Number(v).toFixed(2).replace('.', ',') + '%'; }
  function numCr(v) {
    var s = String(v == null ? '' : v).trim().replace(/[R$\s%]/g, '');
    if (!s) return null;
    if (/,\d{1,2}$/.test(s) || (s.indexOf(',') >= 0 && s.indexOf('.') >= 0)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "1.840" (milhar, como o fmtNumCr mostra) é 1840, não 1,84
    else s = s.replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function fmtNumCr(v) { return v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2, maximumFractionDigits: 2 }); }
  function dataHoraCr(s) { return s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; }
  function prazoCr(s, etapa) {
    if (!s || ['enviada', 'cancelada', 'rascunho', 'pendencia'].indexOf(etapa) >= 0) return '<span class="sec">—</span>';
    var atrasado = new Date(s) < new Date();
    return '<span' + (atrasado ? ' style="color:#a3352c;font-weight:800"' : '') + '>' + (atrasado ? 'Venceu ' : 'Até ') + dataHoraCr(s) + '</span>';
  }
  async function carregarMetaCredito(forcar) {
    if (!metaCredito || forcar) metaCredito = await api('GET', '/api/credito/meta');
    return metaCredito;
  }
  async function atualizarCredito() {
    try { resumoCredito = await api('GET', '/api/credito/resumo'); } catch (e) { return; }
    desenharContadorCredito();
  }
  function desenharContadorCredito() {
    var b = $('#nav [data-contador=credito]');
    if (!b || !resumoCredito) return;
    var r = resumoCredito;
    var n = (r.fila || 0) + (r.minhas || 0) + (r.diretoria || 0) + (r.pendencias || 0);
    b.textContent = n;
    b.hidden = !n;
    b.className = 'contador' + (r.atrasadas ? ' alerta' : '');
    b.title = [r.fila ? r.fila + ' na fila' : '', r.minhas ? r.minhas + ' com você' : '', r.atrasadas ? r.atrasadas + ' atrasada(s)' : '', r.diretoria ? r.diretoria + ' na diretoria' : '', r.pendencias ? r.pendencias + ' com pendência' : ''].filter(Boolean).join(' · ');
  }

  /* ---------- lista ---------- */
  async function paginaCredito(aba) {
    var m;
    try { m = await carregarMetaCredito(true); } catch (e) { $('#conteudo').innerHTML = '<div class="pagina"><div class="vazio">' + esc(e.message) + '</div></div>'; return; }
    var p = m.perfil;
    var pode = { minhas: !!p.executivo || p.analista, fila: p.analista, diretoria: p.diretoria, todas: p.analista || p.diretoria, pessoas: p.admin, politica: p.analista || p.diretoria };
    var abas = ABAS_CR.filter(function (a) { return pode[a[0]]; });
    if (!abas.length) {
      $('#conteudo').innerHTML = '<div class="pagina"><h1>Análise de Crédito</h1><div class="vazio">Você ainda não tem acesso à Análise de Crédito. A administração marca executivos, analistas e diretoria em Análise de Crédito → Pessoas e papéis.</div></div>';
      return;
    }
    if (aba === 'executivos' || aba === 'chancela') aba = 'pessoas'; // endereços antigos
    if (!abas.some(function (a) { return a[0] === aba; })) aba = p.analista ? 'fila' : p.diretoria && !p.executivo ? 'diretoria' : abas[0][0];
    definirBarra('<span class="setor">Análise de Crédito</span><span class="sep">/</span><span class="nome">' + esc(abas.find(function (a) { return a[0] === aba; })[1]) + '</span>');
    var novo = (p.executivo || p.analista) && ['minhas', 'fila'].indexOf(aba) >= 0;
    $('#conteudo').innerHTML = '<div class="pagina"><div class="linha" style="align-items:flex-end;margin-bottom:6px"><div style="flex:1 1 420px"><h1>Análise de Crédito</h1>' +
      '<p class="sub" style="margin:0">Pedido do executivo, análise pelo setor e retorno em PDF. Prazo de resposta: ' + m.politica.sla_horas + 'h a partir da documentação completa (' + m.politica.sla_horas_diretoria + 'h quando vai à diretoria).</p></div>' +
      (novo ? '<button class="btn primary" id="btNovaCr">' + IC.mais + 'Nova solicitação</button>' : '') + '</div>' +
      '<nav class="abas" style="margin-top:16px">' + abas.map(function (a) { return '<a href="#/credito/' + a[0] + '" class="' + (a[0] === aba ? 'on' : '') + '">' + esc(a[1]) + '</a>'; }).join('') + '</nav><div id="corpoCr"></div></div>';
    if ($('#btNovaCr')) $('#btNovaCr').onclick = novaSolicitacaoCredito;
    if (aba === 'pessoas') return abaPessoasCredito();
    if (aba === 'politica') return abaPoliticaCredito(p);
    var interno = p.analista || p.diretoria;
    var tiles = '';
    if (aba === 'fila' && resumoCredito) {
      tiles = '<div class="tiles" style="margin-bottom:16px"><div class="tile"><span class="rot-tile">Na fila, sem analista</span><b>' + (resumoCredito.fila || 0) + '</b></div>' +
        '<div class="tile"><span class="rot-tile">Com você</span><b>' + (resumoCredito.minhas || 0) + '</b></div>' +
        '<div class="tile' + (resumoCredito.atrasadas ? ' alerta' : '') + '"><span class="rot-tile">Atrasadas</span><b>' + (resumoCredito.atrasadas || 0) + '</b><span class="sec">prazo do analista vencido</span></div></div>';
    }
    $('#corpoCr').innerHTML = tiles + '<div class="painel"><div class="cab-painel"><input class="campo" id="qCr" type="search" placeholder="Buscar por condomínio, CNPJ ou protocolo" style="max-width:360px"><span class="espaco"></span>' +
      (aba === 'fila' ? '<span class="ajuda" style="margin:0">Ordenado pelo prazo</span>' : '') + '</div>' +
      '<div class="tabela-wrap"><table style="min-width:900px"><thead><tr><th>Protocolo</th><th>Condomínio</th><th>' + (aba === 'minhas' ? 'Analista' : 'Executivo') + '</th><th>Situação</th><th>' + (interno ? 'Prévia do motor' : 'Resultado') + '</th><th>Prazo</th></tr></thead><tbody id="tbCr"></tbody></table></div></div>';
    var seq = 0;
    async function carregar() {
      var meu = ++seq;
      var q = $('#qCr').value.trim();
      var r;
      try { r = await api('GET', '/api/credito/analises?vis=' + aba + (q ? '&q=' + encodeURIComponent(q) : '')); } catch (e) { toast(e.message, 'erro'); return; }
      if (meu !== seq) return;
      $('#tbCr').innerHTML = r.analises.map(function (a) {
        var prev = a.resultado ? etqCr(RES_CR, a.resultado) + '<span class="sec">' + pctCr(a.inad_media) + (a.taxa_adm != null ? ' · ' + pctCr(a.taxa_adm) + ' + ' + reais(a.boleto) : '') + '</span>' : '<span class="sec">—</span>';
        return '<tr class="clicavel" data-id="' + a.id + '"><td style="white-space:nowrap"><b>' + esc(a.protocolo || 'Rascunho') + '</b><span class="sec">' + (a.origem_protocolo ? 'reanálise de ' + esc(a.origem_protocolo) : dataHoraCr(a.documentacao_completa_em || a.criado_em)) + '</span></td>' +
          '<td><b>' + esc(a.condominio || 'Sem nome') + '</b><span class="sec">' + esc([a.uf, a.tipo_contratacao === 'portabilidade' ? 'Portabilidade' : a.tipo_contratacao === 'nova' ? 'Nova contratação' : ''].filter(Boolean).join(' · ')) + '</span></td>' +
          '<td>' + esc((aba === 'minhas' ? a.analista_nome : a.executivo_nome) || '—') + '</td><td>' + etqCr(ETAPA_CR, a.etapa) + (a.atrasada ? ' <span class="etiqueta vermelha">atrasada</span>' : '') + '</td>' +
          '<td>' + prev + '</td><td style="white-space:nowrap">' + prazoCr(aba === 'minhas' ? a.prazo_executivo : a.prazo_analista, a.etapa) + '</td></tr>';
      }).join('') || '<tr><td colspan="6"><div class="vazio" style="border:0;padding:34px">' + (aba === 'minhas' ? 'Você ainda não pediu análises.' : 'Nada por aqui.') + '</div></td></tr>';
      $$('#tbCr tr[data-id]').forEach(function (tr) { tr.onclick = function () { location.hash = '#/credito/' + tr.getAttribute('data-id'); }; });
    }
    var espera;
    $('#qCr').oninput = function () { clearTimeout(espera); espera = setTimeout(carregar, 300); };
    carregar();
    atualizarCredito();
  }

  async function novaSolicitacaoCredito() {
    var m = await carregarMetaCredito();
    var corpo = { formulario: {} };
    if (!m.perfil.executivo) {
      if (!m.executivos.length) { toast('Marque os executivos em Análise de Crédito → Pessoas e papéis antes.', 'erro'); return; }
      corpo.executivo_id = m.executivos[0].id;
    }
    try { var r = await api('POST', '/api/credito/analises', corpo); location.hash = '#/credito/' + r.id; } catch (e) { toast(e.message, 'erro'); }
  }

  /* ---------- formulário do executivo ---------- */
  function campoCr(id, rotulo, valor, extra) {
    return '<div' + (extra && extra.span ? ' style="grid-column:span ' + extra.span + '"' : '') + '><label class="rot" for="' + id + '">' + esc(rotulo) + '</label>' +
      '<input class="campo" id="' + id + '" value="' + esc(valor == null ? '' : valor) + '"' + (extra && extra.ph ? ' placeholder="' + esc(extra.ph) + '"' : '') + (extra && extra.tipo ? ' type="' + extra.tipo + '"' : '') + (extra && extra.dis ? ' disabled' : '') + '>' +
      (extra && extra.ajuda ? '<div class="ajuda">' + extra.ajuda + '</div>' : '') + '</div>';
  }
  function selCr(id, rotulo, valor, opcoes, dis) {
    return '<div><label class="rot" for="' + id + '">' + esc(rotulo) + '</label><select class="campo" id="' + id + '"' + (dis ? ' disabled' : '') + '>' +
      opcoes.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(valor == null ? '' : valor) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>';
  }
  function linhaExtraCr(x) {
    x = x || {};
    return '<tr><td><input class="campo" data-x="descricao" value="' + esc(x.descricao || '') + '" placeholder="Ex.: reforma da fachada"></td>' +
      '<td><input class="campo" data-x="valor_por_uh" value="' + esc(fmtNumCr(x.valor_por_uh)) + '" placeholder="0,00"></td>' +
      '<td><input class="campo" type="month" data-x="inicio" value="' + esc(x.inicio || '') + '"></td><td><input class="campo" type="month" data-x="fim" value="' + esc(x.fim || '') + '"></td>' +
      '<td style="text-align:center"><input type="checkbox" data-x="ata"' + (x.ata ? ' checked' : '') + ' aria-label="Tem ata de aprovação"></td>' +
      '<td><button type="button" class="btn icon ghost" data-tirar aria-label="Remover taxa extra">' + IC.fechar + '</button></td></tr>';
  }
  function htmlFormCredito(f, a, m, dis) {
    var s = f.sindico || {};
    var outros = (f.outros_isentos || [])[0] || null;
    var ag = f.agua_gas || {};
    var d = f.desconto_pontualidade || {};
    var execSel = m.perfil.analista && !dis ? selCr('fExec', 'Executivo de negócios', a.executivo_id, m.executivos.map(function (e) { return [e.id, e.nome + (e.uf ? ' — ' + e.uf : '')]; }))
      : campoCr('fExecV', 'Executivo de negócios', a.executivo_nome ? a.executivo_nome + (a.executivo_uf ? ' — ' + a.executivo_uf : '') : '—', { dis: true });
    return '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">1</span>Identificação do condomínio</h2></div><div class="corpo pilha">' +
      '<div class="grade-3">' + campoCr('fRs', 'Razão social', f.razao_social, { span: 2 }) + campoCr('fCnpj', 'CNPJ', f.cnpj, { ph: '00.000.000/0000-00' }) +
      campoCr('fUf', 'UF', f.uf, { ph: 'CE' }) + campoCr('fCid', 'Cidade', f.cidade) + campoCr('fAdm', 'Administradora', f.administradora) +
      campoCr('fSis', 'Sistema de gestão condominial', f.sistema_gestao, { ph: 'Superlógica, Gestart, ClasseCon…' }) + campoCr('fGar', 'Garantidora atual (se houver)', f.garantidora_atual) +
      campoCr('fVig', 'Vigência do contrato atual', f.vigencia_atual) + execSel + '</div>' +
      '<div><span class="rot">Tipo de contratação</span><div class="linha" style="align-items:stretch">' +
      '<label class="opcao-radio"><input type="radio" name="fTipo" value="nova"' + (f.tipo_contratacao === 'nova' ? ' checked' : '') + '><div><b>Nova contratação</b><span>O condomínio não tem garantidora hoje.</span></div></label>' +
      '<label class="opcao-radio"><input type="radio" name="fTipo" value="portabilidade"' + (f.tipo_contratacao === 'portabilidade' ? ' checked' : '') + '><div><b>Portabilidade de garantidora</b><span>Sai de outra garantidora para a MyBlue.</span></div></label></div></div></div></section>' +

      '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">2</span>Características da operação</h2></div><div class="corpo pilha">' +
      '<div class="grade-4">' + campoCr('fUh', 'Unidades (UH)', f.uh_total) + campoCr('fOrd', 'Taxa ordinária (R$)', fmtNumCr(f.taxa_ordinaria), { ph: '0,00' }) + campoCr('fVenc', 'Dia do vencimento', f.dia_vencimento, { ph: '1 a 31' }) +
      selCr('fDescT', 'Desconto de pontualidade', d.tipo || 'nenhum', [['nenhum', 'Não possui'], ['percentual', 'Percentual (%)'], ['valor', 'Valor por unidade (R$)']]) +
      campoCr('fDescV', 'Desconto (% ou R$)', fmtNumCr(d.valor), { ph: 'só se houver' }) + campoCr('fAgT', 'Água + gás — média mensal total (R$)', fmtNumCr(ag.total_mensal)) +
      campoCr('fAgU', 'Água + gás — por unidade (R$)', fmtNumCr(ag.por_unidade)) + selCr('fAgB', 'Água + gás no boleto?', ag.compoe_boleto ? 'sim' : 'nao', [['nao', 'Não compõe o boleto'], ['sim', 'Compõe o boleto']]) +
      campoCr('fBol', 'Custo atual do boleto (R$/UH)', fmtNumCr(f.custo_boleto_atual), { ph: 'opcional', ajuda: 'Sem informação, o comparativo usa R$ 2,50.' }) + '</div>' +
      '<div><div class="linha" style="margin-bottom:8px"><span class="rot" style="margin:0">Taxas extras vigentes</span><span class="espaco"></span><button type="button" class="btn ghost sm" id="btExtra">' + IC.mais + 'Adicionar taxa extra</button></div>' +
      '<div class="painel tabela-wrap" style="box-shadow:none"><table style="min-width:720px"><thead><tr><th>Descrição</th><th>Valor por UH</th><th>Início</th><th>Fim</th><th>Ata</th><th></th></tr></thead>' +
      '<tbody id="tbExtras">' + (f.taxas_extras || []).map(linhaExtraCr).join('') + '</tbody></table></div>' +
      '<div class="ajuda">Informe o valor por unidade, não o total. Anexe a ata em Documentos.</div></div></div></section>' +

      '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">3</span>Síndico e isenções</h2></div><div class="corpo grade-4">' +
      selCr('fSind', 'Tipo de síndico', s.tipo || '', [['', 'Escolha'], ['condomino', 'Condômino'], ['profissional', 'Profissional (externo)']]) +
      selCr('fIse', 'Síndico isento?', s.isencao || 'nao', [['nao', 'Não'], ['integral', 'Integral'], ['parcial', 'Parcial (%)']]) +
      campoCr('fIseP', 'Isenção parcial do síndico (%)', s.percentual, { ph: 'só se parcial' }) +
      campoCr('fOutP', 'Subsíndico/conselheiros isentos (% somado)', outros ? outros.percentual : '', { ph: 'ex.: 50', ajuda: 'Duas isenções de 50% contam como 1 unidade.' }) +
      campoCr('fIseT', 'Total de unidades isentas', f.uh_isentas_informadas) + '</div></section>';
  }
  function lerFormCredito() {
    var v = function (id) { var el = $('#' + id); return el ? el.value.trim() : ''; };
    var tipo = $('input[name=fTipo]:checked');
    var outrosP = numCr(v('fOutP'));
    return {
      razao_social: v('fRs'), cnpj: v('fCnpj'), uf: v('fUf').toUpperCase(), cidade: v('fCid'), administradora: v('fAdm'), sistema_gestao: v('fSis'),
      garantidora_atual: v('fGar'), vigencia_atual: v('fVig'), tipo_contratacao: tipo ? tipo.value : '',
      uh_total: numCr(v('fUh')), taxa_ordinaria: numCr(v('fOrd')), dia_vencimento: numCr(v('fVenc')),
      desconto_pontualidade: { tipo: v('fDescT'), valor: numCr(v('fDescV')) },
      agua_gas: { total_mensal: numCr(v('fAgT')), por_unidade: numCr(v('fAgU')), compoe_boleto: v('fAgB') === 'sim' },
      custo_boleto_atual: numCr(v('fBol')),
      taxas_extras: $$('#tbExtras tr').map(function (tr) {
        var g = function (k) { return $('[data-x=' + k + ']', tr); };
        return { descricao: g('descricao').value.trim(), valor_por_uh: numCr(g('valor_por_uh').value), inicio: g('inicio').value, fim: g('fim').value, ata: g('ata').checked };
      }).filter(function (x) { return x.descricao || x.valor_por_uh; }),
      sindico: { tipo: v('fSind'), isencao: v('fIse'), percentual: numCr(v('fIseP')) },
      outros_isentos: outrosP ? [{ cargo: 'subsíndico/conselheiros', percentual: outrosP }] : [],
      uh_isentas_informadas: numCr(v('fIseT')),
      sem_convencao: $('#fSemConv') ? $('#fSemConv').checked : undefined,
    };
  }

  function htmlFaltasCr(lista) {
    return lista.length ? '<div class="msg aviso"><b>Para enviar, falta:</b><ul style="margin:6px 0 0;padding-left:18px">' + lista.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>'
      : '<div class="msg ok">Tudo preenchido. Pode enviar para análise.</div>';
  }
  function cnpjValidoCr(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length < 11 || d.length > 14) return false;
    d = ('00000000000000' + d).slice(-14);
    if (/^(\d)\1+$/.test(d)) return false;
    var dig = function (base) { var soma = 0; for (var i = 0; i < base.length; i++) soma += Number(base[base.length - 1 - i]) * ((i % 8) + 2); var r = soma % 11; return r < 2 ? 0 : 11 - r; };
    return dig(d.slice(0, 12)) === Number(d[12]) && dig(d.slice(0, 13)) === Number(d[13]);
  }
  /* o mesmo que o servidor confere no envio, para a lista ir mudando enquanto a pessoa preenche */
  function faltasCr(f, temExec, docs) {
    var l = [];
    if (!f.razao_social) l.push('Informar a razão social do condomínio.');
    if (!cnpjValidoCr(f.cnpj)) l.push('Informar um CNPJ válido.');
    if (!f.uf) l.push('Informar a UF do condomínio.');
    if (['nova', 'portabilidade'].indexOf(f.tipo_contratacao) < 0) l.push('Escolher o tipo de contratação.');
    if (!(f.uh_total > 0)) l.push('Informar a quantidade de unidades.');
    if (!(f.taxa_ordinaria > 0)) l.push('Informar o valor da taxa ordinária.');
    if (!(f.dia_vencimento >= 1 && f.dia_vencimento <= 31)) l.push('Informar o dia do vencimento (1 a 31).');
    if (['profissional', 'condomino'].indexOf(f.sindico.tipo) < 0) l.push('Informar o tipo de síndico.');
    if (!temExec) l.push('Escolher o executivo de negócios.');
    if (!docs.relatorio) l.push('Anexar o relatório de contas a receber / inadimplência detalhado por competência.');
    if (!docs.convencao && !f.sem_convencao) l.push('Anexar a convenção do condomínio (ou marcar que ela será entregue antes do contrato).');
    return l;
  }

  /* ---------- documentos ---------- */
  async function enviarDocCredito(id, tipo, arquivo) {
    var r = await fetch('/api/credito/analises/' + id + '/documentos', {
      method: 'POST', credentials: 'same-origin', body: arquivo,
      headers: { 'Content-Type': arquivo.type || 'application/octet-stream', 'X-Nome-Arquivo': encodeURIComponent(arquivo.name), 'X-Tipo': tipo },
    });
    if (r.status === 413) throw new Error('"' + arquivo.name + '" passa do tamanho máximo permitido.');
    if (!r.ok) { var j = {}; try { j = await r.json(); } catch (e) { /* sem JSON */ } throw new Error(j.erro || 'Falha ao enviar ' + arquivo.name); }
  }
  function htmlDocsCredito(dd, a, podeDocs, m, semConv, comSemConv) {
    var vig = dd.filter(function (x) { return !x.substituido_em; });
    var nomeTipo = {};
    m.tipos_documento.forEach(function (t) { nomeTipo[t.tipo] = t.nome; });
    nomeTipo.retorno_pdf = 'Retorno (PDF)';
    function lnk(x) {
      return '<span class="doc-linha-cr"><a class="anexo" href="/api/credito/analises/' + a.id + '/documentos/' + x.id + (x.mime === 'application/pdf' ? '?ver=1' : '') + '" target="_blank" rel="noopener">' + IC.documento + '<span>' + esc(x.nome) + '</span><span class="sec">' + tamanho(x.tamanho) + '</span></a>' +
        (podeDocs && x.tipo !== 'retorno_pdf' ? '<button type="button" class="btn icon ghost" data-tirar-doc="' + x.id + '" aria-label="Remover ' + esc(x.nome) + '">' + IC.fechar + '</button>' : '') + '</span>';
    }
    function bloco(tipo, titulo, ajuda) {
      var atual = vig.filter(function (x) { return x.tipo === tipo; });
      return '<div class="painel" style="box-shadow:none;padding:16px;display:flex;flex-direction:column;gap:10px"><div class="linha"><b>' + esc(titulo) + '</b><span class="espaco"></span>' +
        (atual.length ? '<span class="etiqueta verde">Anexado</span>' : '<span class="etiqueta ambar">Falta</span>') + '</div>' +
        (atual.length ? '<div class="anexos" style="margin:0">' + atual.map(lnk).join('') + '</div>' : '<span class="ajuda" style="margin:0">' + ajuda + '</span>') +
        (podeDocs ? '<label class="btn ghost sm" style="align-self:flex-start">' + IC.enviar + (atual.length ? 'Trocar arquivo' : 'Escolher arquivo') + '<input type="file" accept="application/pdf" data-doc="' + tipo + '" hidden></label>' : '') + '</div>';
    }
    var opc = vig.filter(function (x) { return ['convencao', 'relatorio', 'retorno_pdf'].indexOf(x.tipo) < 0; });
    return '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">4</span>Documentos</h2></div><div class="corpo pilha"><div class="grade-3">' +
      bloco('convencao', 'Convenção registrada', 'Registrada em cartório (Registro de Imóveis).') +
      bloco('relatorio', 'Relatório de inadimplência', 'Contas a receber detalhado por competência, emitido há menos de 3 meses.') +
      '<div class="painel" style="box-shadow:none;padding:16px;display:flex;flex-direction:column;gap:10px"><b>Outros documentos</b>' +
      (opc.length ? '<div class="anexos" style="margin:0">' + opc.map(function (x) { return '<span class="sec" style="width:100%">' + esc(nomeTipo[x.tipo] || x.tipo) + '</span>' + lnk(x); }).join('') + '</div>' : '<span class="ajuda" style="margin:0">Atas de taxa extra, unidades retomadas, histórico, DRE 12 meses.</span>') +
      (podeDocs ? '<div class="linha"><select class="campo" id="tipoOutro" style="max-width:200px" aria-label="Tipo do documento">' + m.tipos_documento.filter(function (t) { return ['convencao', 'relatorio'].indexOf(t.tipo) < 0; }).map(function (t) { return '<option value="' + t.tipo + '">' + esc(t.nome) + '</option>'; }).join('') + '</select>' +
        '<label class="btn ghost sm">' + IC.enviar + 'Anexar<input type="file" id="arqOutro" hidden></label></div>' : '') + '</div></div>' +
      (comSemConv ? '<label class="linha" style="font-weight:700;font-size:13px;color:var(--ink-2)"><input type="checkbox" id="fSemConv"' + (semConv ? ' checked' : '') + '> A convenção será entregue antes da assinatura do contrato (a análise sai com ressalva)</label>' : '') +
      '</div></section>';
  }
  function ligarDocsCredito(a, recarregar, antes) {
    antes = antes || function () { return Promise.resolve(); };
    $$('input[data-doc]').forEach(function (inp) {
      inp.onchange = async function () {
        if (!inp.files[0]) return;
        try { await antes(); await enviarDocCredito(a.id, inp.getAttribute('data-doc'), inp.files[0]); toast('Documento anexado.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
      };
    });
    if ($('#arqOutro')) $('#arqOutro').onchange = async function () {
      var f = $('#arqOutro').files[0];
      if (!f) return;
      try { await antes(); await enviarDocCredito(a.id, $('#tipoOutro').value, f); toast('Documento anexado.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
    };
    $$('[data-tirar-doc]').forEach(function (b) {
      b.onclick = async function () {
        if (!(await confirmar('Remover documento', 'O arquivo sai desta solicitação.', 'Remover', true))) return;
        try { await antes(); await api('DELETE', '/api/credito/analises/' + a.id + '/documentos/' + b.getAttribute('data-tirar-doc')); recarregar(); } catch (e) { toast(e.message, 'erro'); }
      };
    });
  }

  /* ---------- resultado do motor ---------- */
  function htmlResultadoCredito(r) {
    if (!r) return '';
    var st = r.status.codigo;
    var cor = { aprovada: ['var(--green-bg)', '#bfe7d6', '#17734f'], ressalvas: ['var(--amber-bg)', '#ecd8a8', '#8a5a10'], reprovada: ['var(--red-bg)', '#f3c6c2', '#a3352c'], pendente: ['var(--teal-bg)', '#bfdde5', '#0f6878'] }[st];
    var pr = r.precificacao;
    var lista = function (titulo, itens, campo) { return itens && itens.length ? '<div><b style="font-size:13px">' + titulo + '</b><ul style="margin:6px 0 0;padding-left:18px;font-size:13px;font-weight:600;color:var(--ink-2)">' + itens.map(function (x) { return '<li>' + esc(x[campo] || x) + '</li>'; }).join('') + '</ul></div>' : ''; };
    return '<div class="painel" style="background:' + cor[0] + ';border-color:' + cor[1] + ';padding:16px 18px;margin-bottom:16px"><div class="linha">' +
      '<b style="font-family:var(--display);font-size:20px;color:' + cor[2] + '">' + esc(r.status.rotulo) + '</b>' +
      (pr ? '<span style="font-weight:800">' + pctCr(pr.taxa_adm) + ' de taxa ADM + ' + reais(pr.boleto) + ' por boleto · ' + fmtNumCr(r.escopo.uh_escopo) + ' UH no escopo</span>' : '') +
      '<span class="espaco"></span><span class="etiqueta cinza">Política ' + esc(r.politica_versao) + '</span></div>' +
      (pr && pr.faixa ? '<div class="ajuda" style="margin-top:4px">Faixa “até ' + fmtNumCr(pr.faixa.ate) + '%” · janela ' + esc(r.janela.texto) + ' · proposta válida até ' + dataBr(r.validade_ate) + '</div>' : '') +
      '<div class="pilha" style="gap:8px;margin-top:10px">' + lista('Por que reprova', r.reprovacoes, 'texto') + lista('Pendências', r.pendencias, 'mensagem') + lista('Ressalvas', r.ressalvas, 'texto') + '</div></div>' +
      '<div class="tiles" style="margin-bottom:16px">' +
      '<div class="tile"><span class="rot-tile">Inadimplência média</span><b>' + pctCr(r.inad_media) + '</b><span class="sec">' + (r.inad_media_rs != null ? reais(r.inad_media_rs) + ' por mês' : '') + '</span></div>' +
      '<div class="tile"><span class="rot-tile">Receita líquida</span><b>' + (r.valores.receita_liquida != null ? reais(r.valores.receita_liquida) : '—') + '</b><span class="sec">bruta ' + (r.valores.receita_bruta != null ? reais(r.valores.receita_bruta) : '—') + '</span></div>' +
      '<div class="tile"><span class="rot-tile">Receita MyBlue</span><b>' + (r.indicadores ? reais(r.indicadores.receita_myblue) : '—') + '</b><span class="sec">por mês</span></div>' +
      '<div class="tile' + (r.indicadores && r.indicadores.exposicao > 40000 ? ' alerta' : '') + '"><span class="rot-tile">Exposição mensal</span><b>' + (r.indicadores ? reais(r.indicadores.exposicao) : '—') + '</b><span class="sec">' + (r.comparativo ? 'ganho anual ' + reais(r.comparativo.ganho_anual) : '') + '</span></div></div>' +
      '<section class="painel" style="margin-bottom:16px"><div class="cab-painel"><h2>Memória de cálculo</h2></div><div class="tabela-wrap"><table><thead><tr><th>Competência</th><th>Vencimento</th><th class="num">Inadimplentes</th><th class="num">Valor em aberto</th><th class="num">% da receita bruta</th></tr></thead><tbody>' +
      r.meses.map(function (x) { return '<tr><td><b>' + esc(x.rotulo) + '</b></td><td>' + dataBr(x.vencimento) + '</td><td class="num">' + x.inadimplentes + '</td><td class="num">' + reais(x.valor) + '</td><td class="num">' + pctCr(x.pct) + '</td></tr>'; }).join('') +
      '</tbody></table></div><div class="corpo" style="border-top:1px solid var(--border);font-size:13px;font-weight:600;color:var(--ink-2)">Escopo: ' + fmtNumCr(r.escopo.uh_total) + ' UH (' + esc({ convencao: 'convenção', formulario: 'formulário' }[r.escopo.uh_fonte] || '—') + ') − ' + fmtNumCr(r.escopo.uh_isentas) + ' isentas − ' + r.escopo.exclusoes.length + ' fora do escopo = <b>' + fmtNumCr(r.escopo.uh_escopo) + ' UH</b>. Valor por UH ' + (r.valores.valor_por_uh != null ? reais(r.valores.valor_por_uh) : '—') + '.' +
      (r.escopo.exclusoes.length ? '<div style="margin-top:6px">' + r.escopo.exclusoes.map(function (x) { return esc(x.unidade) + ' — ' + esc(x.motivo) + (x.detalhe ? ' (' + esc(x.detalhe) + ')' : '') + ', débito ' + reais(x.debito); }).join('; ') + '</div>' : '') + '</div></section>' +
      (r.alertas.length ? '<section class="painel" style="margin-bottom:16px"><div class="cab-painel"><h2>Alertas</h2><span class="espaco"></span><span class="etiqueta ambar">' + r.alertas.length + '</span></div>' +
        r.alertas.map(function (x) { return '<div class="alerta-item ' + (x.nivel === 'info' ? 'azul' : 'ambar') + '">' + (x.nivel === 'critico' ? '<span class="etiqueta vermelha">diretoria</span>' : '') + '<div><b>' + esc(x.mensagem) + '</b></div></div>'; }).join('') + '</section>' : '') +
      (r.divergencias.length ? '<section class="painel" style="margin-bottom:16px"><div class="cab-painel"><h2>Divergência entre as fontes</h2></div><div class="corpo" style="font-size:13px;font-weight:600">' +
        r.divergencias.map(function (x) { return '<div><b>' + esc(CAMPO_CR[x.campo] || x.campo) + '</b>: ' + esc(Object.keys(x.valores).map(function (k) { return (FONTE_CR[k] || k) + ' ' + x.valores[k]; }).join(' × ')) + ' — vale ' + esc(String(x.usado)) + ' (' + esc(FONTE_CR[x.fonte] || x.fonte) + ')</div>'; }).join('') + '</div></section>' : '') +
      '<section class="painel" style="margin-bottom:16px"><div class="cab-painel"><h2>Consulta Assertiva (espólios)</h2></div><div class="corpo pilha"><div class="msg ' + (r.assertiva.indicada ? 'aviso' : 'ok') + '">' + esc(r.assertiva.texto) + '</div>' +
      (r.assertiva.candidatos.length ? '<div class="tabela-wrap"><table><thead><tr><th>Unidade</th><th>Titular</th><th>Documento</th><th class="num">Taxas em aberto</th><th>Desde</th><th>Padrão</th></tr></thead><tbody>' +
        r.assertiva.candidatos.map(function (x) { return '<tr><td><b>' + esc(x.unidade) + '</b></td><td>' + esc(x.titular) + '</td><td>' + esc(x.documento) + '</td><td class="num">' + x.taxas_em_aberto + '</td><td>' + esc(mesAno(x.desde + '-01')) + '</td><td>' +
          (x.cessacao_abrupta ? '<span class="etiqueta ambar">parou de pagar de vez</span> ' : '') + (x.unidade_unica ? '<span class="etiqueta cinza">unidade única</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') + '</div></section>' +
      (r.observacoes.length ? '<section class="painel" style="margin-bottom:16px"><div class="cab-painel"><h2>Observações automáticas</h2></div><div class="corpo"><ul style="margin:0;padding-left:18px;font-size:13px;font-weight:600;color:var(--ink-2)">' + r.observacoes.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ul></div></section>' : '');
  }

  /* ---------- dados do analista ---------- */
  var AJUSTES_CR = [['janela', 'Meses-base (mm/aaaa, mm/aaaa, mm/aaaa)'], ['uh_total', 'Nº de unidades'], ['taxa_ordinaria', 'Taxa ordinária (R$)'], ['dia_vencimento', 'Dia do vencimento'],
    ['uh_isentas', 'Unidades isentas'], ['taxa_adm', 'Taxa ADM acima da tabela (%)'], ['boleto', 'Boleto acima da tabela (R$)']];
  function linhasCr(lista, campos) { return (lista || []).map(function (x) { return campos.map(function (c) { return x[c] || ''; }).join(' — '); }).join('\n'); }
  function lerLinhasCr(txt, campos) {
    return String(txt || '').split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var p = l.split(/\s+[—–-]\s+|;/); var o = {}; campos.forEach(function (c, i) { o[c] = (p[i] || '').trim(); }); return o;
    });
  }
  /* lançamentos lançados → linhas da planilha (o analista vê e corrige o que a IA leu) */
  function planilhaDeUnidadesCr(unidades) {
    var rotTipo = { ordinaria: 'Taxa ordinária', extra: 'Taxa extra', agua_gas: 'Água/gás', acordo: 'Acordo', multa: 'Multa', juros: 'Juros', correcao: 'Correção', honorarios: 'Honorários', fundo_reserva: 'Fundo de reserva', outro: 'Outro' };
    var l = [];
    (unidades || []).forEach(function (u) {
      (u.lancamentos || []).forEach(function (x) {
        var c = String(x.competencia || '').split('-');
        l.push([u.unidade, u.titular || '', u.documento || '', c.length === 2 ? c[1] + '/' + c[0] : x.competencia, rotTipo[x.tipo] || x.tipo, fmtNumCr(x.valor), x.vencimento ? dataBr(x.vencimento) : ''].join(';'));
      });
    });
    return l.join('\n');
  }
  function leituraCr(doc, ia, tipo) {
    if (!doc) return '<span class="ajuda" style="margin:0">Sem ' + (tipo === 'relatorio' ? 'relatório' : 'convenção') + ' em PDF anexado.</span>';
    var st = doc.leitura === 'lendo' ? '<span class="etiqueta azul">lendo o PDF…</span>' : doc.leitura === 'ok' ? '<span class="etiqueta verde">lido pela IA em ' + dataHoraCr(doc.extraido_em) + ' · confira</span>'
      : doc.leitura === 'erro' ? '<span class="etiqueta vermelha" title="' + esc(doc.leitura_erro) + '">não deu para ler</span>' : '';
    var bt = ia ? '<button type="button" class="btn ghost sm" data-ler="' + tipo + '"' + (doc.leitura === 'lendo' ? ' disabled' : '') + '>' + (doc.leitura === 'ok' ? 'Ler de novo com IA' : 'Ler PDF com IA') + '</button>'
      : '<span class="ajuda" style="margin:0">Leitura por IA desligada (falta ANTHROPIC_API_KEY no servidor).</span>';
    return st + bt + (doc.leitura === 'erro' ? '<div class="msg erro" style="width:100%;margin-top:8px">' + esc(doc.leitura_erro) + '</div>' : '');
  }
  function fonteCr(f) { return f && (f.pagina || f.trecho) ? '<div class="ajuda" style="margin-top:4px">' + (f.pagina ? 'p. ' + f.pagina : '') + (f.trecho ? ' · “' + esc(f.trecho) + '”' : '') + '</div>' : ''; }
  function htmlDadosAnalista(d, editavel, docs, ia) {
    docs = docs || {};
    var rel = d.relatorio || {};
    var conv = d.convencao || {};
    var aj = d.ajustes || {};
    var tx = d.textos || {};
    var dis = editavel ? '' : ' disabled';
    return (editavel ? '<details class="painel" style="margin-bottom:16px"><summary class="cab-painel" style="cursor:pointer"><h2 style="display:inline">Colar resultado da skill</h2> <span class="ajuda" style="margin:0">a resposta inteira do Claude (leitura da inadimplência ou da convenção)</span></summary><div class="corpo pilha">' +
      '<textarea class="campo" id="dSkill" rows="6" placeholder="No Claude, clique em Copiar embaixo da resposta da skill e cole aqui." style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px"></textarea>' +
      '<div class="linha"><button type="button" class="btn primary sm" id="btSkill">Preencher os campos</button><span class="ajuda" style="margin:0">O portal preenche lançamentos, data de emissão, convenção, textos do retorno e ressalvas. Confira e clique em Salvar e calcular.</span></div><div id="dSkillInfo"></div></div></details>' : '') +
      '<section class="painel" style="margin-bottom:16px"><div class="cab-painel"><h2>Relatório de inadimplência</h2><span class="espaco"></span><span class="etiqueta ' + ((rel.unidades || []).length || rel.sem_inadimplencia ? 'verde' : 'ambar') + '">' +
      ((rel.unidades || []).length ? (rel.unidades || []).length + ' unidades lançadas' : rel.sem_inadimplencia ? 'sem inadimplência' : 'falta lançar') + '</span></div><div class="corpo pilha">' +
      (editavel ? '<div class="linha">' + leituraCr(docs.relatorio, ia, 'relatorio') + '</div>' : '') +
      (rel.origem && rel.origem.ia ? '<div class="msg ' + (rel.origem.legivel === false || (rel.origem.observacoes || []).length ? 'aviso' : 'ok') + '">Lido pela IA' + (rel.sistema ? ' · relatório ' + esc(rel.sistema) : '') + ': ' + (rel.unidades || []).length + ' unidades, ' +
        (rel.unidades || []).reduce(function (n, u) { return n + (u.lancamentos || []).length; }, 0) + ' lançamentos' + (rel.origem.fonte_emissao && rel.origem.fonte_emissao.pagina ? '; emissão na p. ' + rel.origem.fonte_emissao.pagina : '') + '. Confira com o PDF antes de calcular.' +
        ((rel.origem.observacoes || []).length ? '<ul style="margin:6px 0 0;padding-left:18px">' + rel.origem.observacoes.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ul>' : '') + '</div>' : '') +
      '<div class="grade-4">' + campoCr('dEmis', 'Data de emissão do relatório', rel.data_emissao || '', { tipo: 'date', dis: !editavel }) + campoCr('dIni', 'Primeira competência do relatório', rel.periodo_inicio || '', { tipo: 'month', dis: !editavel }) +
      '<label class="linha" style="font-weight:700;font-size:13px;align-self:end"><input type="checkbox" id="dComp"' + (rel.tem_competencia !== false ? ' checked' : '') + dis + '> detalhado por competência</label>' +
      '<label class="linha" style="font-weight:700;font-size:13px;align-self:end"><input type="checkbox" id="dNomes"' + (rel.tem_nomes !== false ? ' checked' : '') + dis + '> traz o nome dos devedores</label></div>' +
      (editavel ? '<div><label class="rot" for="dCola">Lançamentos (unidade ; titular ; CPF/CNPJ ; competência ; tipo ; valor ; vencimento) — cole a planilha ou corrija o que a IA leu e clique em Ler planilha</label><textarea class="campo" id="dCola" rows="' + ((rel.unidades || []).length ? 10 : 5) + '" placeholder="A-101;Fulano;111.111.111-11;04/2026;Taxa ordinária;1.840,00" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px">' + esc(planilhaDeUnidadesCr(rel.unidades)) + '</textarea>' +
        '<div class="linha" style="margin-top:8px"><button type="button" class="btn ghost sm" id="btColar">Ler planilha</button><label class="linha" style="font-weight:700;font-size:13px"><input type="checkbox" id="dSemInad"' + (rel.sem_inadimplencia ? ' checked' : '') + '> não há inadimplência no período</label><span class="ajuda" id="dColaInfo" style="margin:0"></span></div></div>' : '') +
      '</div></section>' +
      '<section class="painel" style="margin-bottom:16px"><div class="cab-painel"><h2>Convenção</h2>' + (editavel ? '<span class="espaco"></span><div class="linha">' + leituraCr(docs.convencao, ia, 'convencao') + '</div>' : '') + '</div><div class="corpo grade-4">' +
      (function () {
        var fo = (conv.origem && conv.origem.fontes) || {};
        var com = function (html, f) { return html.replace(/<\/div>$/, fonteCr(f) + '</div>'); };
        return com(selCr('dReg', 'Registro', conv.registro || '', [['', 'Escolha'], ['RI', 'Registro de Imóveis (inclui Livro 3)'], ['cartorio', 'Cartório (sem especificar)'], ['RTD', 'Só Títulos e Documentos (RTD)'], ['nenhum', 'Sem registro']], !editavel), fo.registro) +
          com(campoCr('dCuh', 'Nº de unidades na convenção', conv.uh || '', { dis: !editavel }), fo.uh) + com(campoCr('dMulta', 'Multa por atraso (%)', fmtNumCr(conv.multa_pct), { dis: !editavel }), fo.multa) + com(campoCr('dForo', 'Foro', conv.foro || '', { dis: !editavel }), fo.foro);
      })() +
      campoCr('dCart', 'Cartório e matrícula', conv.cartorio || '', { dis: !editavel, span: 2 }) + campoCr('dClaus', 'Cláusula que limita garantidora (se houver)', conv.clausula_restritiva || '', { dis: !editavel, span: 2 }) + '</div></section>' +
      '<section class="painel" style="margin-bottom:16px"><div class="cab-painel"><h2>Espólios, retomadas e condições</h2></div><div class="corpo grade-3">' +
      '<div><label class="rot" for="dEsp">Espólios confirmados (Assertiva) — um por linha: unidade — nome</label><textarea class="campo" id="dEsp" rows="3"' + dis + '>' + esc(linhasCr(d.espolios, ['unidade', 'nome'])) + '</textarea></div>' +
      '<div><label class="rot" for="dRet">Retomadas Caixa/banco — unidade — banco</label><textarea class="campo" id="dRet" rows="3"' + dis + '>' + esc(linhasCr(d.retomadas, ['unidade', 'banco'])) + '</textarea></div>' +
      '<div><label class="rot" for="dAban">Abandono ou litígio — unidade — motivo</label><textarea class="campo" id="dAban" rows="3"' + dis + '>' + esc(linhasCr(d.abandonos, ['unidade', 'motivo'])) + '</textarea></div>' +
      '<div style="grid-column:span 2"><label class="rot" for="dRess">Ressalvas do analista — ressalva — justificativa operacional</label><textarea class="campo" id="dRess" rows="3"' + dis + '>' + esc(linhasCr(d.ressalvas, ['texto', 'justificativa'])) + '</textarea></div>' +
      '<div><label class="rot" for="dEstr">Condição estrutural que reprova (concordata, fraude, processo relevante)</label><textarea class="campo" id="dEstr" rows="3"' + dis + '>' + esc(d.condicao_estrutural || '') + '</textarea></div></div></section>' +
      '<details class="painel" style="margin-bottom:16px"' + (Object.keys(aj).length ? ' open' : '') + '><summary class="cab-painel" style="cursor:pointer"><h2 style="display:inline">Ajustes do analista</h2> <span class="ajuda" style="margin:0">sempre com justificativa; no retorno, a nota não diz quem ajustou</span></summary><div class="corpo pilha">' +
      AJUSTES_CR.map(function (x) { var a = aj[x[0]] || {}; return '<div class="grade-2">' + campoCr('aj_' + x[0], x[1], Array.isArray(a.valor) ? a.valor.join(', ') : (a.valor == null ? '' : a.valor), { dis: !editavel }) + campoCr('ajj_' + x[0], 'Justificativa', a.justificativa || '', { dis: !editavel }) + '</div>'; }).join('') + '</div></details>' +
      '<details class="painel" style="margin-bottom:16px"' + (tx.observacoes_status || tx.observacoes_juridicas || tx.proximos_passos ? ' open' : '') + '><summary class="cab-painel" style="cursor:pointer"><h2 style="display:inline">Textos do retorno</h2> <span class="ajuda" style="margin:0">em branco, o portal escreve sozinho a partir do cálculo</span></summary><div class="corpo pilha">' +
      '<div><label class="rot" for="tObs">Observações da análise (página 1)</label><textarea class="campo" id="tObs" rows="4"' + dis + '>' + esc(tx.observacoes_status || '') + '</textarea></div>' +
      '<div class="grade-2"><div><label class="rot" for="tJur">Observações jurídicas — uma por linha</label><textarea class="campo" id="tJur" rows="5"' + dis + '>' + esc((tx.observacoes_juridicas || []).join('\n')) + '</textarea></div>' +
      '<div><label class="rot" for="tPas">Próximos passos — um por linha</label><textarea class="campo" id="tPas" rows="5"' + dis + '>' + esc((tx.proximos_passos || []).join('\n')) + '</textarea></div></div></div></details>';
  }
  function lerDadosAnalista(d, unidades) {
    var v = function (id) { var el = $('#' + id); return el ? el.value.trim() : ''; };
    var rel = Object.assign({}, d.relatorio || {}, { data_emissao: v('dEmis'), periodo_inicio: v('dIni'), tem_competencia: $('#dComp').checked, tem_nomes: $('#dNomes').checked, sem_inadimplencia: !!($('#dSemInad') && $('#dSemInad').checked) });
    if (unidades) rel.unidades = unidades;
    var ajustes = {};
    AJUSTES_CR.forEach(function (x) {
      var val = v('aj_' + x[0]);
      if (!val) return;
      ajustes[x[0]] = { valor: x[0] === 'janela' ? val.split(/[,;\s]+/).filter(Boolean) : numCr(val), justificativa: v('ajj_' + x[0]) };
    });
    var linhas = function (id) { return v(id).split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean); };
    var textos = { observacoes_status: v('tObs') || undefined, observacoes_juridicas: linhas('tJur').length ? linhas('tJur') : undefined, proximos_passos: linhas('tPas').length ? linhas('tPas') : undefined };
    return Object.assign({}, d, {
      relatorio: rel,
      convencao: { registro: v('dReg'), uh: numCr(v('dCuh')), multa_pct: numCr(v('dMulta')), foro: v('dForo'), cartorio: v('dCart'), clausula_restritiva: v('dClaus'), origem: (d.convencao || {}).origem },
      espolios: lerLinhasCr(v('dEsp'), ['unidade', 'nome']), retomadas: lerLinhasCr(v('dRet'), ['unidade', 'banco']), abandonos: lerLinhasCr(v('dAban'), ['unidade', 'motivo']),
      ressalvas: lerLinhasCr(v('dRess'), ['texto', 'justificativa']), condicao_estrutural: v('dEstr'), ajustes: ajustes, textos: textos,
    });
  }

  /* ---------- detalhe ---------- */
  async function paginaAnaliseCredito(id) {
    definirBarra('<span class="setor">Análise de Crédito</span><span class="sep">/</span><span class="nome">…</span>');
    $('#conteudo').innerHTML = carregandoHtml();
    var d, m;
    try { d = await api('GET', '/api/credito/analises/' + id); m = await carregarMetaCredito(); } catch (e) {
      $('#conteudo').innerHTML = '<div class="pagina"><div class="vazio">' + esc(e.message) + '<br><a class="btn ghost" style="margin-top:14px" href="#/credito">Voltar</a></div></div>';
      return;
    }
    var a = d.analise, pd = d.pode, f = a.formulario || {};
    var recarregar = function () { paginaAnaliseCredito(id); atualizarCredito(); };
    var acoes = '<a class="btn ghost sm" href="#/credito">Voltar</a>';
    if (pd.assumir) acoes += '<button class="btn primary sm" id="btAssumirCr">' + (a.analista_id ? 'Assumir para mim' : 'Assumir') + '</button>';
    if (pd.analisar) {
      acoes += '<button class="btn ghost sm" id="btPendCr">Devolver com pendência</button>';
      if (a.resultado_motor && a.resultado_motor.diretoria && a.etapa === 'em_analise') acoes += '<button class="btn ghost sm" id="btDirCr">Enviar à diretoria</button>';
      if (a.resultado_motor) acoes += '<a class="btn ghost sm" href="/api/credito/analises/' + a.id + '/previa.pdf" target="_blank" rel="noopener">Prévia do retorno</a>';
      acoes += '<button class="btn primary sm" id="btLibCr">Validar e liberar</button>';
    }
    if (pd.chancelar) acoes += '<button class="btn ghost sm" id="btNaoChCr">Não chancelar</button><button class="btn primary sm" id="btChCr">Chancelar</button>';
    if (pd.reanalise) acoes += '<button class="btn primary sm" id="btReCr">Solicitar reanálise</button>';
    definirBarra('<span class="setor">Análise de Crédito</span><span class="sep">/</span><span class="nome">' + esc(a.protocolo || 'Rascunho') + '</span>', acoes);

    var ultimaPend = d.eventos.filter(function (e) { return e.tipo === 'pendencia'; }).pop();
    var docsVig = {};
    d.documentos.forEach(function (x) { if (!x.substituido_em && x.mime === 'application/pdf' && ['relatorio', 'convencao'].indexOf(x.tipo) >= 0) docsVig[x.tipo] = x; });
    var retornoPdf = d.documentos.filter(function (x) { return x.tipo === 'retorno_pdf' && !x.substituido_em; })[0];
    var cab = '<div class="linha" style="align-items:flex-start;margin-bottom:16px"><div style="flex:1 1 420px">' +
      '<div class="linha" style="margin-bottom:6px">' + etqCr(ETAPA_CR, a.etapa) + (a.resultado && (pd.interno || a.etapa === 'enviada') ? etqCr(RES_CR, a.resultado) : '') +
      (a.origem_protocolo ? '<a class="etiqueta cinza" href="#/credito/' + a.origem_id + '">reanálise de ' + esc(a.origem_protocolo) + '</a>' : '') +
      d.reanalises.map(function (x) { return '<a class="etiqueta cinza" href="#/credito/' + x.id + '">reanálise: ' + esc(x.protocolo || 'rascunho') + '</a>'; }).join('') +
      (d.contrato ? '<a class="etiqueta azul" href="#/contratos/' + d.contrato.id + '">contrato ' + esc(d.contrato.protocolo || 'em rascunho') + '</a>' : '') +
      (d.implantacao ? '<a class="etiqueta azul" href="#/implantacao/' + d.implantacao.id + '">implantação ' + esc(d.implantacao.protocolo || 'em rascunho') + '</a>' : '') + '</div>' +
      '<h1>' + esc(a.condominio || 'Nova solicitação') + '</h1><p class="sub" style="margin:0">' + esc([a.cnpj, [a.cidade, a.uf].filter(Boolean).join('/'), a.executivo_nome ? 'Executivo: ' + a.executivo_nome : '', a.analista_nome ? 'Analista: ' + a.analista_nome : ''].filter(Boolean).join(' · ')) + '</p></div>' +
      '<dl class="info-ticket" style="min-width:260px">' + (a.protocolo ? '<dt>Protocolo</dt><dd>' + esc(a.protocolo) + '</dd>' : '') +
      (a.documentacao_completa_em ? '<dt>Documentação completa</dt><dd>' + dataHoraCr(a.documentacao_completa_em) + '</dd>' : '') +
      (a.prazo_executivo && ['enviada', 'cancelada'].indexOf(a.etapa) < 0 ? '<dt>Resposta ao executivo</dt><dd>' + prazoCr(a.prazo_executivo, a.etapa) + '</dd>' : '') +
      (pd.interno && a.prazo_analista ? '<dt>Prazo do analista</dt><dd>' + prazoCr(a.prazo_analista, a.etapa) + '</dd>' : '') +
      (a.motivo_reanalise ? '<dt>Motivo da reanálise</dt><dd>' + esc(a.motivo_reanalise) + '</dd>' : '') + '</dl></div>';

    var html = '<div class="pagina">' + cab;
    if (a.etapa === 'pendencia' && ultimaPend) html += '<div class="msg aviso" style="margin-bottom:16px;white-space:pre-wrap">' + esc(ultimaPend.detalhe.mensagem || '') + '</div>';
    if (a.etapa === 'enviada') {
      var rm = a.resultado_motor;
      html += '<div class="painel" style="padding:18px;margin-bottom:16px"><div class="linha"><b style="font-family:var(--display);font-size:18px">Retorno enviado em ' + dataHoraCr(a.enviada_em) + '</b>' +
        (rm && rm.precificacao ? '<span style="font-weight:800">' + esc(rm.status.rotulo) + ' — ' + pctCr(rm.precificacao.taxa_adm) + ' ADM + ' + reais(rm.precificacao.boleto) + '/boleto · ' + fmtNumCr(rm.escopo.uh_escopo) + ' UH no escopo</span>' : '') +
        '<span class="espaco"></span>' + (retornoPdf ? '<a class="btn primary" href="/api/credito/analises/' + a.id + '/documentos/' + retornoPdf.id + '?ver=1" target="_blank" rel="noopener">' + IC.documento + 'Abrir o PDF</a>' : '') + '</div>' +
        (a.validade_ate ? '<div class="ajuda">Proposta válida até ' + dataBr(String(a.validade_ate).slice(0, 10)) + '. Depois disso, ou se o condomínio mudar desconto, taxa extra ou inadimplência, peça reanálise.</div>' : '') + '</div>';
    }
    if (pd.editar) {
      html += '<div id="faltasCr" style="margin-bottom:16px">' + htmlFaltasCr(d.faltas) + '</div>' +
        '<div class="pilha" style="gap:18px">' + htmlFormCredito(f, a, m, false) + htmlDocsCredito(d.documentos, a, pd.documentos, m, f.sem_convencao, true) +
        '<div class="linha" style="justify-content:flex-end"><span class="ajuda" style="flex:1 1 320px;margin:0">Ao enviar, o portal confere o que falta. Se estiver tudo certo, gera o protocolo e o prazo começa a contar. <span id="salvoCr"></span></span>' +
        (pd.cancelar ? '<button class="btn danger" id="btCancCr">Cancelar solicitação</button>' : '') + '<button class="btn ghost" id="btSalvarCr">Salvar rascunho</button><button class="btn primary" id="btEnviarCr">' + (a.etapa === 'pendencia' ? 'Reenviar para análise' : 'Enviar para análise') + '</button></div></div>';
    } else if (pd.interno && a.etapa !== 'rascunho') {
      html += htmlResultadoCredito(a.resultado_motor) +
        (pd.analisar ? htmlDadosAnalista(a.dados_analista || {}, true, docsVig, m.ia) + '<div class="linha" style="justify-content:flex-end;margin-bottom:18px"><button class="btn ghost" id="btSalvarDadosCr">Salvar dados</button><button class="btn primary" id="btCalcCr">Salvar e calcular</button></div>'
          : a.dados_analista ? htmlDadosAnalista(a.dados_analista, false) : '') +
        '<details class="painel" id="formExecCr" style="margin-bottom:16px"><summary class="cab-painel" style="cursor:pointer"><h2 style="display:inline">Formulário do executivo</h2>' + (pd.analisar ? ' <span class="ajuda" style="margin:0">corrija aqui o que o executivo informou errado; o histórico guarda o que mudou</span>' : '') + '</summary><div class="corpo pilha" style="gap:18px">' + htmlFormCredito(f, a, m, !pd.analisar) +
        (pd.analisar ? '<div class="linha" style="justify-content:flex-end"><button type="button" class="btn ghost" id="btFormCr">Salvar correção do formulário</button></div>' : '') + '</div></details>' +
        htmlDocsCredito(d.documentos, a, pd.documentos, m, f.sem_convencao);
    } else {
      html += htmlDocsCredito(d.documentos, a, false, m, f.sem_convencao);
    }
    html += '<section class="painel" style="margin-top:16px"><div class="cab-painel"><h2>Histórico</h2></div><div class="corpo pilha" style="gap:8px;font-size:13px;font-weight:600;color:var(--ink-2)">' +
      d.eventos.map(function (e) {
        var x = e.detalhe || {};
        var extra = e.tipo === 'documento' || e.tipo === 'documento_removido' ? ': ' + esc(x.nome) : e.tipo === 'ajuste' ? ': ' + esc(x.campo) + ' → ' + esc(Array.isArray(x.valor) ? x.valor.join(', ') : x.valor) + ' (' + esc(x.justificativa) + ')'
          : e.tipo === 'leitura' ? ': ' + (x.tipo === 'relatorio' ? 'relatório, ' + x.unidades + ' unidades e ' + x.lancamentos + ' lançamentos' : 'convenção') + (x.aplicada ? '' : ' (não trocou o que já estava lançado)')
          : e.tipo === 'formulario_corrigido' ? ': ' + (x.mudancas || []).map(function (y) { return esc(y.campo) + ' ' + esc(y.de) + ' → ' + esc(y.para); }).join('; ')
          : e.tipo === 'leitura_erro' ? ': ' + (x.tipo === 'relatorio' ? 'relatório' : 'convenção') + ' — ' + esc(x.erro)
          : e.tipo === 'motor' ? ': ' + esc(x.status) + (x.inad_media != null ? ', ' + pctCr(x.inad_media) : '') : e.tipo === 'enviada' ? ' (' + esc(x.protocolo) + ')' : (e.tipo === 'chancela_recusada' || e.tipo === 'chancelada') && x.observacao ? ': ' + esc(x.observacao) : '';
        return '<div><b style="color:var(--ink)">' + dataHoraCr(e.criado_em) + '</b> · ' + esc(e.usuario_nome || (e.tipo.indexOf('leitura') === 0 ? 'O portal' : 'Sistema')) + ' ' + (EVENTO_CR[e.tipo] || esc(e.tipo)) + extra + '</div>';
      }).join('') + '</div></section></div>';
    $('#conteudo').innerHTML = html;
    if (!pd.editar && !pd.analisar) ligarDocsCredito(a, recarregar);
    if ($('#formExecCr') && !pd.analisar) $$('#formExecCr input, #formExecCr select, #formExecCr button').forEach(function (el) { el.disabled = true; });
    var ligarTirar = function () { $$('#tbExtras [data-tirar]').forEach(function (b) { b.onclick = function () { b.closest('tr').remove(); $('#conteudo .pagina').dispatchEvent(new Event('change')); }; }); };
    if ($('#btExtra') && (pd.editar || pd.analisar)) { $('#btExtra').onclick = function () { $('#tbExtras').insertAdjacentHTML('beforeend', linhaExtraCr()); ligarTirar(); }; ligarTirar(); }

    if (pd.editar) {
      var salvar = async function () {
        var corpo = { formulario: lerFormCredito() };
        if ($('#fExec')) corpo.executivo_id = Number($('#fExec').value);
        await api('PATCH', '/api/credito/analises/' + a.id, corpo);
      };
      ligarDocsCredito(a, recarregar, function () { clearTimeout(espera); return salvar(); });
      // a lista do que falta muda enquanto a pessoa preenche; o rascunho se salva sozinho
      var vig = d.documentos.filter(function (x) { return !x.substituido_em; });
      var docs = { relatorio: vig.some(function (x) { return x.tipo === 'relatorio'; }), convencao: vig.some(function (x) { return x.tipo === 'convencao'; }) };
      var espera;
      var atualizarFaltas = function () { $('#faltasCr').innerHTML = htmlFaltasCr(faltasCr(lerFormCredito(), $('#fExec') ? !!$('#fExec').value : !!a.executivo_id, docs)); };
      var aoMudar = function (ev) {
        if (ev.target.closest && ev.target.closest('[data-doc],#arqOutro,#tipoOutro')) return;
        atualizarFaltas();
        clearTimeout(espera);
        espera = setTimeout(async function () {
          try { await salvar(); $('#salvoCr').textContent = 'Rascunho salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.'; } catch (e) { $('#salvoCr').textContent = 'Não foi possível salvar o rascunho: ' + e.message; }
        }, 1500);
      };
      $('#conteudo .pagina').addEventListener('input', aoMudar);
      $('#conteudo .pagina').addEventListener('change', aoMudar);
      $('#btSalvarCr').onclick = async function () { clearTimeout(espera); try { await salvar(); toast('Rascunho salvo.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); } };
      $('#btEnviarCr').onclick = async function () {
        clearTimeout(espera);
        try {
          await salvar();
          var r = await api('POST', '/api/credito/analises/' + a.id + '/enviar', {});
          toast('Enviado: protocolo ' + r.protocolo + '.', 'ok');
          recarregar();
        } catch (e) { toast(e.message, 'erro'); recarregar(); }
      };
      if ($('#btCancCr')) $('#btCancCr').onclick = async function () {
        if (!(await confirmar('Cancelar solicitação', 'A solicitação fica no histórico como cancelada.', 'Cancelar solicitação', true))) return;
        try { await api('POST', '/api/credito/analises/' + a.id + '/cancelar', {}); location.hash = '#/credito'; } catch (e) { toast(e.message, 'erro'); }
      };
    }
    if ($('#btAssumirCr')) $('#btAssumirCr').onclick = async function () { try { await api('POST', '/api/credito/analises/' + a.id + '/assumir', {}); recarregar(); } catch (e) { toast(e.message, 'erro'); } };
    if (pd.analisar) {
      $$('[data-ler]').forEach(function (b) {
        b.onclick = async function () {
          var tipo = b.getAttribute('data-ler');
          var lancado = tipo === 'relatorio' ? (((a.dados_analista || {}).relatorio || {}).unidades || []).length : ((a.dados_analista || {}).convencao || {}).registro;
          if (lancado && !(await confirmar('Ler de novo com IA', 'O que estiver lançado ' + (tipo === 'relatorio' ? 'no relatório' : 'na convenção') + ' será trocado pelo que a IA ler agora.', 'Ler de novo'))) return;
          try { await api('POST', '/api/credito/analises/' + a.id + '/ler', { tipo: tipo }); toast('Lendo o PDF. Os dados aparecem aqui em instantes.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
        };
      });
      // enquanto a IA lê, a tela se atualiza sozinha
      if (Object.keys(docsVig).some(function (k) { return docsVig[k].leitura === 'lendo'; })) {
        setTimeout(function () { if (location.hash === '#/credito/' + a.id && !$('.fundo-modal')) paginaAnaliseCredito(a.id); }, 5000);
      }
      var unidadesLidas = null;
      var colaOriginal = $('#dCola') ? $('#dCola').value : '';
      var lerFormCorrigido = function () {
        var nf = lerFormCredito();
        if (nf.sem_convencao === undefined) nf.sem_convencao = !!f.sem_convencao;
        return nf;
      };
      var formOriginal = JSON.stringify(lerFormCorrigido());
      var salvarForm = async function () {
        var nf = lerFormCorrigido();
        var corpo = {};
        if (JSON.stringify(nf) !== formOriginal) corpo.formulario = nf;
        if ($('#fExec') && Number($('#fExec').value) && Number($('#fExec').value) !== a.executivo_id) corpo.executivo_id = Number($('#fExec').value);
        if (!Object.keys(corpo).length) return false;
        await api('PATCH', '/api/credito/analises/' + a.id, corpo);
        formOriginal = JSON.stringify(nf);
        return true;
      };
      $('#btFormCr').onclick = async function () {
        try { var mudou = await salvarForm(); toast(mudou ? 'Formulário corrigido. Clique em Salvar e calcular para refazer a análise.' : 'Nada mudou no formulário.', 'ok'); if (mudou) recarregar(); } catch (e) { toast(e.message, 'erro'); }
      };
      $('#btSkill').onclick = async function () {
        try {
          var r = await api('POST', '/api/credito/analises/' + a.id + '/resultado-skill', { texto: $('#dSkill').value });
          var put = function (id, v) { if ($('#' + id) && v !== undefined && v !== null) $('#' + id).value = v; };
          if (r.lancamentos && r.lancamentos.linhas) { $('#dCola').value = r.lancamentos.texto; unidadesLidas = r.lancamentos.unidades; if ($('#dSemInad')) $('#dSemInad').checked = false; }
          put('dEmis', r.relatorio.data_emissao);
          if (r.relatorio.tem_competencia !== undefined) $('#dComp').checked = r.relatorio.tem_competencia;
          if (r.relatorio.tem_nomes !== undefined) $('#dNomes').checked = r.relatorio.tem_nomes;
          if (r.convencao) {
            var c = r.convencao;
            // o que a skill diz "não consta" limpa o campo; o que ela não trouxe fica como está
            var campos = { dReg: 'registro', dCuh: 'uh', dMulta: 'multa_pct', dForo: 'foro', dCart: 'cartorio', dClaus: 'clausula_restritiva' };
            Object.keys(campos).forEach(function (idc) { var k = campos[idc]; if (k in c) put(idc, c[k] == null ? '' : k === 'multa_pct' ? fmtNumCr(c[k]) : c[k]); });
            a.dados_analista = Object.assign({}, a.dados_analista || {}, { convencao: Object.assign({}, (a.dados_analista || {}).convencao || {}, { origem: c.origem }) });
          }
          if (r.textos.observacoes_juridicas || r.textos.proximos_passos) {
            put('tJur', (r.textos.observacoes_juridicas || []).join('\n') || undefined); put('tPas', (r.textos.proximos_passos || []).join('\n') || undefined);
            $('#tJur').closest('details').open = true;
          }
          if (r.ressalvas.length) {
            var atuais = $('#dRess').value.trim();
            var novas = r.ressalvas.map(function (x) { return x.texto + (x.justificativa ? ' — ' + x.justificativa : ''); }).filter(function (l) { return atuais.indexOf(l) < 0; });
            $('#dRess').value = [atuais].concat(novas).filter(Boolean).join('\n');
          }
          var extras = (r.lancamentos && r.lancamentos.erros.length ? ['Linhas de lançamento com problema: ' + r.lancamentos.erros.slice(0, 3).join(' ')] : []).concat(r.avisos, r.assertiva.length ? ['Assertiva: ' + r.assertiva.join(' ')] : []);
          $('#dSkillInfo').innerHTML = '<div class="msg ok">Preenchido: ' + esc(r.achados.join(', ')) + '. Confira e clique em <b>Salvar e calcular</b>.</div>' +
            (extras.length ? '<div class="msg aviso" style="margin-top:8px"><b>Avisos da skill para conferir:</b><ul style="margin:6px 0 0;padding-left:18px">' + extras.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '');
        } catch (e) { toast(e.message, 'erro'); }
      };
      var salvarDados = async function () {
        await salvarForm();
        // planilha mexida e não lida: lê antes de salvar, para a correção não se perder
        if ($('#dCola') && unidadesLidas === null && $('#dCola').value.trim() && $('#dCola').value !== colaOriginal) {
          var r = await api('POST', '/api/credito/analises/' + a.id + '/relatorio-colado', { texto: $('#dCola').value });
          unidadesLidas = r.unidades;
        }
        await api('PATCH', '/api/credito/analises/' + a.id, { dados_analista: lerDadosAnalista(a.dados_analista || {}, unidadesLidas) });
      };
      $('#btColar').onclick = async function () {
        try {
          var r = await api('POST', '/api/credito/analises/' + a.id + '/relatorio-colado', { texto: $('#dCola').value });
          unidadesLidas = r.unidades;
          $('#dColaInfo').textContent = r.linhas + ' lançamentos de ' + r.unidades.length + ' unidades lidos' + (r.erros.length ? '; ' + r.erros.length + ' linha(s) com problema: ' + r.erros.slice(0, 3).join(' ') : '') + '. Salve para guardar.';
        } catch (e) { toast(e.message, 'erro'); }
      };
      $('#btSalvarDadosCr').onclick = async function () { try { await salvarDados(); toast('Dados salvos.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); } };
      // anexar ou trocar documento recarrega a tela: salva antes o que foi digitado
      ligarDocsCredito(a, recarregar, salvarDados);
      $('#btCalcCr').onclick = async function () {
        try { await salvarDados(); await api('POST', '/api/credito/analises/' + a.id + '/calcular', {}); toast('Análise calculada.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
      };
      $('#btPendCr').onclick = function () {
        var sugestao = a.resultado_motor ? a.resultado_motor.pendencias.map(function (x) { return x.mensagem; }).join('\n') : '';
        var mo = modal({ titulo: 'Devolver ao executivo com pendência', corpo: '<label class="rot" for="mPend">O que falta — um item por linha</label><textarea class="campo" id="mPend" rows="6">' + esc(sugestao) + '</textarea><div class="ajuda">O executivo recebe a lista no portal e por e-mail. O prazo para e volta a contar quando ele reenviar.</div>',
          pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="mPendOk">Devolver</button>' });
        $('#mPendOk', mo).onclick = async function () {
          try { await api('POST', '/api/credito/analises/' + a.id + '/pendencia', { itens: $('#mPend', mo).value.split(/\n/) }); mo.fechar(); toast('Devolvida ao executivo.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
        };
      };
      if ($('#btDirCr')) $('#btDirCr').onclick = async function () {
        if (!(await confirmar('Enviar à diretoria', 'A análise vai para a chancela do CEO e do Diretor Comercial. O prazo de resposta ao executivo passa para 48h.', 'Enviar'))) return;
        try { await salvarDados(); await api('POST', '/api/credito/analises/' + a.id + '/diretoria', {}); toast('Enviada à diretoria.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
      };
      $('#btLibCr').onclick = async function () {
        if (!(await confirmar('Validar e liberar o retorno', 'O portal recalcula, gera o PDF assinado por você e avisa o executivo. Confira antes a prévia do retorno.', 'Liberar'))) return;
        try {
          await salvarDados();
          var r = await api('POST', '/api/credito/analises/' + a.id + '/liberar', {});
          modal({ titulo: 'Retorno liberado', largo: true, corpo: '<p class="ajuda" style="margin-top:0">O executivo já foi avisado. Texto do e-mail de entrega, se quiser enviar também por fora:</p>' +
            '<label class="rot">Assunto</label><input class="campo" readonly value="' + esc(r.email.assunto) + '"><label class="rot" style="margin-top:10px">Mensagem</label><textarea class="campo" rows="9" readonly>' + esc(r.email.corpo) + '</textarea>' +
            '<label class="rot" style="margin-top:10px">Resumo executivo</label><textarea class="campo" rows="4" readonly>' + esc(r.resumo) + '</textarea>', aoFechar: recarregar });
        } catch (e) { toast(e.message, 'erro'); }
      };
    }
    if (pd.chancelar) {
      var chancela = function (aprovar) {
        var mo = modal({ titulo: aprovar ? 'Chancelar a análise' : 'Não chancelar', corpo: '<label class="rot" for="mCh">' + (aprovar ? 'Observação (opcional)' : 'Motivo') + '</label><textarea class="campo" id="mCh" rows="4"></textarea>',
          pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn ' + (aprovar ? 'primary' : 'danger') + '" id="mChOk">' + (aprovar ? 'Chancelar' : 'Não chancelar') + '</button>' });
        $('#mChOk', mo).onclick = async function () {
          try { await api('POST', '/api/credito/analises/' + a.id + '/chancela', { aprovar: aprovar, observacao: $('#mCh', mo).value }); mo.fechar(); recarregar(); } catch (e) { toast(e.message, 'erro'); }
        };
      };
      $('#btChCr').onclick = function () { chancela(true); };
      $('#btNaoChCr').onclick = function () { chancela(false); };
    }
    if (pd.reanalise) {
      $('#btReCr').onclick = function () {
        var mo = modal({ titulo: 'Solicitar reanálise de crédito', corpo: '<label class="rot" for="mRe">Motivo</label><select class="campo" id="mReT"><option>Relatório de inadimplência novo</option><option>Proposta vencida (30 dias)</option><option>Mudou o desconto de pontualidade ou a taxa extra</option><option>Contestação do resultado</option><option>Outro</option></select>' +
          '<textarea class="campo" id="mRe" rows="3" style="margin-top:8px" placeholder="Detalhe (opcional)"></textarea><div class="ajuda">O formulário vem preenchido e a convenção vai junto. Anexe o relatório novo e os documentos que tiver; a reanálise recebe um protocolo novo, ligado a este.</div>',
          pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="mReOk">Criar reanálise</button>' });
        $('#mReOk', mo).onclick = async function () {
          var motivo = $('#mReT', mo).value + ($('#mRe', mo).value.trim() ? ': ' + $('#mRe', mo).value.trim() : '');
          try { var r = await api('POST', '/api/credito/analises/' + a.id + '/reanalise', { motivo: motivo }); mo.fechar(); location.hash = '#/credito/' + r.id; } catch (e) { toast(e.message, 'erro'); }
        };
      };
    }
  }

  /* ---------- administração ---------- */
  async function abaPessoasCredito() {
    var j;
    try { j = await api('GET', '/api/credito/pessoas'); } catch (e) { $('#corpoCr').innerHTML = '<div class="vazio">' + esc(e.message) + '</div>'; return; }
    function linha(u) {
      var e = u.executivo && u.executivo.ativo ? u.executivo : null;
      var dis = e ? '' : ' disabled';
      return '<tr data-u="' + u.id + '"><td><b>' + esc(u.nome) + '</b><span class="sec">' + esc(u.email) + '</span></td>' +
        '<td style="text-align:center"><input type="checkbox" data-c="executivo"' + (e ? ' checked' : '') + ' aria-label="' + esc(u.nome) + ' é executivo de negócios"></td>' +
        '<td><input class="campo" data-c="uf" maxlength="2" style="width:64px" value="' + esc(e ? e.uf : '') + '" aria-label="UF"' + dis + '></td>' +
        '<td><input class="campo" data-c="regiao" style="min-width:140px" value="' + esc(e ? e.regiao : '') + '" aria-label="Região"' + dis + '></td>' +
        '<td><input class="campo" data-c="boleto" style="width:110px" placeholder="política" value="' + esc(e && e.boleto != null ? fmtNumCr(e.boleto) : '') + '" aria-label="Boleto próprio (R$)"' + dis + '></td>' +
        '<td style="text-align:center"><input type="checkbox" data-c="analista"' + (u.analista ? ' checked' : '') + ' aria-label="' + esc(u.nome) + ' é analista de crédito"></td>' +
        '<td style="text-align:center"><input type="checkbox" data-c="diretoria"' + (u.diretoria ? ' checked' : '') + ' aria-label="' + esc(u.nome) + ' chancela pela diretoria"></td></tr>';
    }
    $('#corpoCr').innerHTML = '<div class="painel"><div class="cab-painel"><h2>Pessoas e papéis</h2>' +
      '<input class="campo" id="qPes" type="search" placeholder="Buscar pessoa" style="max-width:280px;margin-left:auto">' +
      '<label class="linha" style="font-weight:700;font-size:13px;color:var(--muted)"><input type="checkbox" id="soPapel"> só quem tem papel</label></div>' +
      '<div class="corpo" style="padding-top:12px;padding-bottom:4px"><p class="ajuda" style="margin:0">Marque o papel de cada pessoa na Análise de Crédito; vale na hora. <b>Executivo</b>: pede análises e acompanha as suas (boleto vazio segue a política: R$ 2,00; Maranhão R$ 5,50). ' +
      '<b>Analista</b>: entra no setor ' + esc(j.setor_analistas) + ' e analisa. <b>Diretoria</b>: chancela as análises com inadimplência entre 35% e 40%.</p></div>' +
      '<div class="tabela-wrap"><table style="min-width:900px"><thead><tr><th>Pessoa</th><th style="text-align:center">Executivo</th><th>UF</th><th>Região</th><th>Boleto próprio (R$)</th><th style="text-align:center">Analista de crédito</th><th style="text-align:center">Diretoria</th></tr></thead>' +
      '<tbody id="tbPes">' + j.pessoas.map(linha).join('') + '</tbody></table></div></div>' +
      '<div class="painel" style="margin-top:16px"><div class="cab-painel"><h2>Executivos sem acesso ao portal</h2><span class="ajuda" style="margin:0">quem não entra no portal; o analista pede a análise em nome dele</span><span class="espaco"></span><button class="btn ghost sm" id="btNovoEx">' + IC.mais + 'Novo executivo</button></div>' +
      '<div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>UF / região</th><th>Boleto próprio</th><th>Situação</th></tr></thead><tbody>' +
      (j.executivos_sem_usuario.map(function (e) { return '<tr class="clicavel" data-ex="' + e.id + '"><td><b>' + esc(e.nome) + '</b></td><td>' + esc([e.uf, e.regiao].filter(Boolean).join(' · ') || '—') + '</td><td>' + (e.boleto != null ? reais(e.boleto) : '<span class="sec">da política</span>') + '</td><td>' + (e.ativo ? '<span class="etiqueta verde">ativo</span>' : '<span class="etiqueta cinza">inativo</span>') + '</td></tr>'; }).join('') ||
        '<tr><td colspan="4"><span class="sec">Nenhum.</span></td></tr>') + '</tbody></table></div></div>';

    function filtrar() {
      var q = normal($('#qPes').value), so = $('#soPapel').checked;
      $$('#tbPes tr').forEach(function (tr) {
        var tem = $$('input[type=checkbox]', tr).some(function (c) { return c.checked; });
        tr.hidden = (q && normal(tr.textContent).indexOf(q) < 0) || (so && !tem);
      });
    }
    $('#qPes').oninput = filtrar;
    $('#soPapel').onchange = filtrar;
    async function salvar(tr, campo) {
      var g = function (c) { return $('[data-c=' + c + ']', tr); };
      var ex = g('executivo').checked;
      ['uf', 'regiao', 'boleto'].forEach(function (c) { g(c).disabled = !ex; });
      var corpo = {};
      if (campo === 'analista' || campo === 'diretoria') corpo[campo] = g(campo).checked;
      else corpo.executivo = { ativo: ex, uf: g('uf').value.trim(), regiao: g('regiao').value.trim(), boleto: g('boleto').value.trim() ? numCr(g('boleto').value) : null };
      try { await api('PUT', '/api/credito/pessoas/' + tr.getAttribute('data-u'), corpo); metaCredito = null; toast('Salvo.', 'ok'); } catch (e) { toast(e.message, 'erro'); abaPessoasCredito(); }
    }
    $$('#tbPes tr').forEach(function (tr) {
      $$('[data-c]', tr).forEach(function (el) { el.onchange = function () { salvar(tr, el.getAttribute('data-c')); }; });
    });

    function editar(e) {
      e = e || { ativo: true };
      var mo = modal({ titulo: e.id ? 'Executivo sem acesso ao portal' : 'Novo executivo sem acesso ao portal', corpo: '<div class="grade-2">' + campoCr('xNome', 'Nome', e.nome) + campoCr('xEmail', 'E-mail', e.email) + campoCr('xUf', 'UF', e.uf) + campoCr('xReg', 'Região', e.regiao) +
        campoCr('xBol', 'Boleto próprio (R$)', e.boleto != null ? fmtNumCr(e.boleto) : '', { ph: 'vazio = política' }) + '</div>' +
        '<label class="linha" style="font-weight:700;margin-top:12px"><input type="checkbox" id="xAtivo"' + (e.ativo ? ' checked' : '') + '> ativo</label>' +
        '<p class="ajuda">Se a pessoa usa o portal, marque-a como executivo na tabela acima em vez de cadastrar aqui.</p>',
        pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="xOk">Salvar</button>' });
      $('#xOk', mo).onclick = async function () {
        var corpo = { nome: $('#xNome', mo).value, email: $('#xEmail', mo).value, uf: $('#xUf', mo).value, regiao: $('#xReg', mo).value, boleto: $('#xBol', mo).value.trim() ? numCr($('#xBol', mo).value) : null, usuario_id: null, ativo: $('#xAtivo', mo).checked };
        try { await api(e.id ? 'PATCH' : 'POST', '/api/credito/executivos' + (e.id ? '/' + e.id : ''), corpo); mo.fechar(); metaCredito = null; abaPessoasCredito(); } catch (er) { toast(er.message, 'erro'); }
      };
    }
    $('#btNovoEx').onclick = function () { editar(); };
    $$('[data-ex]').forEach(function (tr) { tr.onclick = function () { editar(j.executivos_sem_usuario.find(function (x) { return String(x.id) === tr.getAttribute('data-ex'); })); }; });
  }

  async function abaPoliticaCredito(p) {
    var j;
    try { j = await api('GET', '/api/credito/politica'); } catch (e) { $('#corpoCr').innerHTML = '<div class="vazio">' + esc(e.message) + '</div>'; return; }
    var a = j.ativa;
    var PARAMS = [['boleto_padrao', 'Boleto padrão (R$)'], ['receita_minima', 'Receita líquida mínima (R$)'], ['inad_diretoria', 'Diretoria acima de (%)'], ['inad_reprovacao', 'Reprova acima de (%)'],
      ['exposicao_maxima', 'Exposição máxima (R$)'], ['exposicao_inad_minima', '… com inadimplência acima de (%)'], ['dias_apos_vencimento', 'Dias após o vencimento (mais de)'], ['extra_aviso_pct', 'Aviso de taxa extra acima de (% da ordinária)'],
      ['assertiva_min_taxas', 'Assertiva: taxas em aberto (mínimo)'], ['validade_dias', 'Validade da proposta (dias)'], ['implantacao_validade_dias', 'Abre implantação até (dias da liberação)'], ['sla_horas', 'Prazo ao executivo (h)'], ['sla_horas_diretoria', 'Prazo com diretoria (h)'], ['prazo_analista_corte', 'Corte do prazo do analista (hora)']];
    var ed = p.admin;
    $('#corpoCr').innerHTML = '<div class="grade-2" style="align-items:start"><div class="painel"><div class="cab-painel"><h2>Faixas de precificação</h2><span class="ajuda" style="margin:0">teto inclusivo · boleto ' + reais(a.boleto_padrao) + (a.boleto_por_uf && a.boleto_por_uf.MA ? ' (MA ' + reais(a.boleto_por_uf.MA) + ')' : '') + '</span></div>' +
      '<div class="tabela-wrap"><table><thead><tr><th>Inadimplência até (%)</th><th>Taxa ADM (%)</th></tr></thead><tbody id="tbFaixas">' +
      a.faixas.map(function (f) { return '<tr><td>' + (ed ? '<input class="campo" data-f="ate" value="' + fmtNumCr(f.ate) + '">' : fmtNumCr(f.ate)) + '</td><td>' + (ed ? '<input class="campo" data-f="taxa" value="' + fmtNumCr(f.taxa_adm) + '">' : pctCr(f.taxa_adm)) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +
      '<div class="pilha"><div class="painel"><div class="cab-painel"><h2>Parâmetros</h2><span class="espaco"></span><span class="etiqueta azul">versão ' + esc(a.versao) + '</span></div><div class="corpo grade-2">' +
      PARAMS.map(function (x) { return campoCr('pp_' + x[0], x[1], fmtNumCr(a[x[0]]), { dis: !ed }); }).join('') + '</div>' +
      (ed ? '<div class="corpo" style="border-top:1px solid var(--border)"><div class="grade-2">' + campoCr('ppVer', 'Nome da nova versão', '', { ph: 'ex.: 1.3' }) + campoCr('ppDesc', 'O que mudou', '') + '</div>' +
        '<div class="linha" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" id="btPolSalvar">Salvar como nova versão</button></div><div class="ajuda">As análises já calculadas guardam a versão usada; as próximas usam a nova.</div></div>' : '') + '</div>' +
      '<div class="painel"><div class="cab-painel"><h2>Versões</h2></div><div class="tabela-wrap"><table><tbody>' + j.versoes.map(function (v) { return '<tr><td><b>' + esc(v.versao) + '</b>' + (v.ativa ? ' <span class="etiqueta verde">em uso</span>' : '') + '<span class="sec">' + esc(v.descricao) + '</span></td><td>' + quando(v.criado_em) + '</td></tr>'; }).join('') + '</tbody></table></div></div></div></div>';
    if (ed) $('#btPolSalvar').onclick = async function () {
      var parametros = {};
      PARAMS.forEach(function (x) { var n = numCr($('#pp_' + x[0]).value); if (n != null) parametros[x[0]] = n; });
      var faixas = $$('#tbFaixas tr').map(function (tr) { return { ate: numCr($('[data-f=ate]', tr).value), taxa_adm: numCr($('[data-f=taxa]', tr).value) }; });
      try { await api('POST', '/api/credito/politica', { versao: $('#ppVer').value, descricao: $('#ppDesc').value, parametros: parametros, faixas: faixas }); toast('Nova versão da política em uso.', 'ok'); abaPoliticaCredito(p); } catch (e) { toast(e.message, 'erro'); }
    };
  }

  /* ======================= Implantação ======================= */
  var metaImp = null;
  var resumoImp = null;
  var ETAPA_IMP = {
    rascunho: ['Rascunho', 'cinza'], diretoria: ['Na diretoria', 'ambar'], fila: ['Na fila · aguardando designação', 'azul'], em_implantacao: ['Em implantação', 'azul'],
    pendencia: ['Pendência com o comercial', 'ambar'], concluida: ['Concluída · aguardando a Carteira', 'verde'], na_carteira: ['Na Carteira', 'verde'], cancelada: ['Cancelada', 'cinza'],
  };
  var ABAS_IMP = [['minhas', 'Minhas solicitações'], ['fila', 'Fila do setor'], ['carteira', 'Aguardando Carteira'], ['diretoria', 'Diretoria'], ['todas', 'Todas'], ['liberacoes', 'Liberações de análise']];
  var EVENTO_IMP = {
    criada: 'criou a implantação', formulario: 'alterou o formulário', documento: 'anexou um documento', documento_removido: 'removeu um documento',
    enviada: 'enviou ao setor Implantação', reenviada: 'reenviou depois da pendência', cancelada: 'cancelou',
    designada: 'designou', iniciada: 'iniciou a implantação', etapas: 'atualizou as etapas', pendencia: 'devolveu com pendência',
    concluida: 'concluiu a implantação', parceiros: 'levou o condomínio à base de Parceiros', carteira: 'confirmou a entrada na Carteira', contrato: 'recebeu as condições fechadas do contrato', contrato_corrigido: 'recebeu a correção das condições do contrato',
    diretoria_pedida: 'pediu a aprovação da diretoria', diretoria_aprovou: 'aprovou taxa e boleto', diretoria_recusou: 'não aprovou taxa e boleto',
  };
  var ETAPA_SETOR_IMP = [['documentacao', 'Documentação', 'Obrigatórios conferidos; os pendentes seguem com alerta ao executivo.'], ['vouch', 'Cadastro no sistema (Vouch)', 'O ID vai direto para a Carteira.'],
    ['onboarding', 'Onboarding', 'Reunião de boas-vindas com o síndico.'], ['boletos', 'Emissão de boletos', 'Primeira emissão pelo novo contrato.'], ['envio', 'Envio dos boletos', 'Vai para a Carteira como forma de envio.']];
  var SIT_AN_IMP = {
    valida: ['dentro do prazo', 'verde'], liberada: ['liberada pelo gestor', 'verde'], vencida: ['passou do prazo', 'vermelha'],
    aguardando_gestor: ['aguardando o gestor da Análise de Crédito', 'ambar'], recusada: ['não liberada pelo gestor', 'vermelha'],
  };
  var UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

  async function carregarMetaImp(forcar) {
    if (!metaImp || forcar) metaImp = await api('GET', '/api/implantacoes/meta');
    return metaImp;
  }
  async function atualizarImp() {
    try { resumoImp = await api('GET', '/api/implantacoes/resumo'); } catch (e) { return; }
    desenharContadorImp();
  }
  function desenharContadorImp() {
    var b = $('#nav [data-contador=implantacao]');
    if (!b || !resumoImp) return;
    var r = resumoImp;
    var n = (r.fila || 0) + (r.minhas || 0) + (r.carteira || 0) + (r.liberacoes || 0) + (r.pendencias || 0) + (r.diretoria || 0);
    b.textContent = n;
    b.hidden = !n;
    b.title = [r.fila ? r.fila + ' na fila' : '', r.minhas ? r.minhas + ' com você' : '', r.carteira ? r.carteira + ' aguardando a Carteira' : '',
      r.liberacoes ? r.liberacoes + ' análise(s) para liberar' : '', r.pendencias ? r.pendencias + ' com pendência' : '', r.diretoria ? r.diretoria + ' para a diretoria aprovar' : ''].filter(Boolean).join(' · ');
  }
  function origemImp(i) {
    if (i.origem === 'analise') return 'Análise ' + (i.analise_protocolo || '');
    return i.origem === 'pdf' ? 'Análise anterior ao portal' + (i.analise_protocolo ? ' · ' + i.analise_protocolo : '') : 'Condomínio de entrega';
  }

  /* ---------- lista ---------- */
  async function paginaImplantacao(aba) {
    var m;
    try { m = await carregarMetaImp(true); } catch (e) { $('#conteudo').innerHTML = '<div class="pagina"><div class="vazio">' + esc(e.message) + '</div></div>'; return; }
    var p = m.perfil;
    var setor = p.equipe || p.coordenacao;
    var pode = { minhas: !!p.executivo || p.admin, fila: setor, carteira: p.coordenacao, diretoria: p.diretoria, todas: setor || p.diretoria, liberacoes: p.gestor_credito };
    var abas = ABAS_IMP.filter(function (a) { return pode[a[0]]; });
    if (!abas.length) {
      $('#conteudo').innerHTML = '<div class="pagina"><h1>Implantação</h1><div class="vazio">Você ainda não tem acesso à Implantação. Executivos são marcados em Análise de Crédito → Pessoas e papéis; a equipe é quem está no setor Implantação.</div></div>';
      return;
    }
    if (!abas.some(function (a) { return a[0] === aba; })) aba = setor ? 'fila' : p.executivo || p.admin ? 'minhas' : p.diretoria && resumoImp && resumoImp.diretoria ? 'diretoria' : abas[0][0];
    definirBarra('<span class="setor">Implantação</span><span class="sep">/</span><span class="nome">' + esc(abas.find(function (a) { return a[0] === aba; })[1]) + '</span>');
    var novo = (p.executivo || p.admin) && aba === 'minhas';
    $('#conteudo').innerHTML = '<div class="pagina"><div class="linha" style="align-items:flex-end;margin-bottom:6px"><div style="flex:1 1 420px"><h1>Implantação</h1>' +
      '<p class="sub" style="margin:0">Do contrato assinado à Carteira: o comercial pede, o setor Implantação confere e conclui, a coordenação confirma a entrada na Carteira.</p></div>' +
      (novo ? '<button class="btn primary" id="btNovaImp">' + IC.mais + 'Nova implantação</button>' : '') + '</div>' +
      '<nav class="abas" style="margin-top:16px">' + abas.map(function (a) { return '<a href="#/implantacao/' + a[0] + '" class="' + (a[0] === aba ? 'on' : '') + '">' + esc(a[1]) + '</a>'; }).join('') + '</nav><div id="corpoImp"></div></div>';
    if ($('#btNovaImp')) $('#btNovaImp').onclick = novaImplantacao;
    if (aba === 'liberacoes') return abaLiberacoesImp();
    var tiles = '';
    if (aba === 'fila' && resumoImp) {
      tiles = '<div class="tiles" style="margin-bottom:16px"><div class="tile"><span class="rot-tile">Na fila, para designar</span><b>' + (resumoImp.fila || 0) + '</b></div>' +
        '<div class="tile"><span class="rot-tile">Com você</span><b>' + (resumoImp.minhas || 0) + '</b></div>' +
        (p.coordenacao ? '<div class="tile"><span class="rot-tile">Aguardando a Carteira</span><b>' + (resumoImp.carteira || 0) + '</b></div>' : '') + '</div>';
    }
    $('#corpoImp').innerHTML = tiles + '<div class="painel"><div class="cab-painel"><input class="campo" id="qImp" type="search" placeholder="Buscar por condomínio, CNPJ ou protocolo" style="max-width:360px"></div>' +
      '<div class="tabela-wrap"><table style="min-width:960px"><thead><tr><th>Protocolo</th><th>Condomínio</th><th>Origem</th><th>Executivo</th><th>Situação</th><th>Responsável</th><th>Pendências</th></tr></thead><tbody id="tbImp"></tbody></table></div></div>';
    var seq = 0;
    async function carregar() {
      var meu = ++seq;
      var q = $('#qImp').value.trim();
      var r;
      try { r = await api('GET', '/api/implantacoes?vis=' + aba + (q ? '&q=' + encodeURIComponent(q) : '')); } catch (e) { toast(e.message, 'erro'); return; }
      if (meu !== seq) return;
      $('#tbImp').innerHTML = r.implantacoes.map(function (i) {
        return '<tr class="clicavel" data-id="' + i.id + '"><td style="white-space:nowrap"><b>' + esc(i.protocolo || 'Rascunho') + '</b><span class="sec">' + dataHoraCr(i.enviado_em || i.criado_em) + '</span></td>' +
          '<td><b>' + esc(i.condominio || 'Sem nome') + '</b><span class="sec">' + esc([i.uf, i.uh_total ? i.uh_total + ' unidades' : ''].filter(Boolean).join(' · ')) + '</span></td>' +
          '<td style="white-space:nowrap">' + esc(origemImp(i)) + '</td><td>' + esc(i.executivo_nome || '—') + '</td><td>' + etqCr(ETAPA_IMP, i.etapa) + '</td>' +
          '<td>' + esc(i.responsavel_nome || (i.etapa === 'fila' ? 'aguardando designação' : '—')) +
          (i.etapa === 'em_implantacao' && i.prazo_inicio ? (i.iniciado_em ? '<span class="sec">iniciada</span>' : '<span class="sec">' + prazoCr(i.prazo_inicio, i.etapa).replace('Até ', 'iniciar até ').replace('Venceu ', 'prazo para iniciar venceu ') + '</span>') : '') + '</td>' +
          '<td>' + (i.pendentes.length ? '<span class="etiqueta ambar" title="' + esc(i.pendentes.join('; ')) + '">' + i.pendentes.length + ' pendente(s)</span>' : '<span class="sec">—</span>') + '</td></tr>';
      }).join('') || '<tr><td colspan="7"><div class="vazio" style="border:0;padding:34px">' + (aba === 'minhas' ? 'Você ainda não pediu implantações.' : 'Nada por aqui.') + '</div></td></tr>';
      $$('#tbImp tr[data-id]').forEach(function (tr) { tr.onclick = function () { location.hash = '#/implantacao/' + tr.getAttribute('data-id'); }; });
    }
    var espera;
    $('#qImp').oninput = function () { clearTimeout(espera); espera = setTimeout(carregar, 300); };
    carregar();
    atualizarImp();
  }

  /* ---------- nova implantação: de onde vem ---------- */
  async function novaImplantacao() {
    var j;
    try { j = await api('GET', '/api/implantacoes/analises'); } catch (e) { toast(e.message, 'erro'); return; }
    function linhaAn(a) {
      var acao = a.disponivel ? '<input type="radio" name="anImp" value="' + a.id + '">'
        : '<input type="radio" disabled aria-label="' + esc(a.protocolo) + ' indisponível">';
      var extra = a.situacao === 'vencida' ? '<button type="button" class="btn ghost sm" data-liberar="' + a.id + '">Enviar ao gestor da Análise de Crédito</button>'
        : a.situacao === 'recusada' ? '<span class="ajuda" style="margin:0">peça reanálise na Análise de Crédito</span>' : '';
      return '<label class="opcao-radio" style="align-items:center;flex-wrap:wrap;margin:0;border-radius:0;border-width:0 0 1px">' + acao +
        '<div style="flex:1 1 260px"><b>' + esc(a.protocolo) + ' · ' + esc(a.condominio) + '</b><span>' + esc(RES_CR[a.resultado] ? RES_CR[a.resultado][0] : '') + ' · ' + pctCr(a.taxa_adm) + ' + boleto ' + reais(a.boleto) +
        ' · liberada em ' + dataHoraCr(a.liberada_em) + (a.disponivel && a.situacao === 'valida' ? ' · vale até ' + new Date(a.limite).toLocaleDateString('pt-BR') : '') + '</span></div>' +
        etqCr(SIT_AN_IMP, a.situacao) + extra + '</label>';
    }
    var mo = modal({
      titulo: 'Nova implantação', largo: true,
      corpo: '<span class="rot">De onde vem este condomínio?</span><div class="grade-3" style="margin-bottom:14px">' +
        '<label class="opcao-radio"><input type="radio" name="origImp" value="analise" checked><div><b>A partir de uma Análise de Crédito</b><span>Os dados da análise vêm preenchidos e podem ser ajustados; o que veio da análise fica ao lado para comparar.</span></div></label>' +
        '<label class="opcao-radio"><input type="radio" name="origImp" value="pdf"><div><b>Análise feita antes do portal</b><span>Anexe o PDF do retorno da análise. O portal lê os dados e preenche o formulário.</span></div></label>' +
        '<label class="opcao-radio"><input type="radio" name="origImp" value="entrega"><div><b>Condomínio de entrega</b><span>Construtora entregando, em enxoval: sem inadimplência e sem documentação completa. Antes, a diretoria aprova taxa e boleto.</span></div></label></div>' +
        '<div data-orig="analise"><span class="rot">Análises liberadas para você: aprovadas ou com ressalvas, até ' + j.validade_dias + ' dias depois da liberação</span>' +
        '<div class="painel" style="box-shadow:none;overflow:hidden">' + (j.analises.map(linhaAn).join('') || '<div class="vazio" style="border:0;padding:24px">Nenhuma análise liberada disponível. As reprovadas e as que já têm implantação não aparecem.</div>') + '</div>' +
        '<div class="ajuda">Depois de ' + j.validade_dias + ' dias, a análise só abre implantação quando o gestor da Análise de Crédito liberar (ele é avisado no sino e por e-mail).</div></div>' +
        '<div data-orig="pdf" hidden><label class="btn ghost" style="align-self:flex-start">' + IC.enviar + 'Escolher o PDF do retorno<input type="file" id="arqPdfImp" accept="application/pdf" hidden></label><div id="lidoPdfImp" style="margin-top:12px"></div></div>' +
        '<div data-orig="entrega" hidden><div class="msg aviso">O condomínio de entrega começa pela proposta: preencha o condomínio, a construtora, as unidades previstas, a taxa ordinária e a taxa administrativa e o boleto propostos, e peça a aprovação da diretoria. Com a aprovação e o contrato assinado, complete o formulário e envie ao setor Implantação. Os documentos podem chegar depois.</div></div>',
      pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="mImpOk">Continuar para o formulário</button>',
    });
    $$('[data-liberar]', mo).forEach(function (b) {
      b.onclick = function (ev) {
        ev.preventDefault();
        var m2 = modal({ titulo: 'Pedir liberação ao gestor da Análise de Crédito', corpo: '<label class="rot" for="mLibMot">Motivo (opcional)</label><textarea class="campo" id="mLibMot" rows="3" placeholder="Ex.: contrato assinado depois do prazo; nada mudou no condomínio."></textarea>',
          pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="mLibOk">Enviar ao gestor</button>' });
        $('#mLibOk', m2).onclick = async function () {
          try { await api('POST', '/api/implantacoes/liberacoes', { analise_id: Number(b.getAttribute('data-liberar')), motivo: $('#mLibMot', m2).value }); m2.fechar(); mo.fechar(); toast('Pedido enviado ao gestor da Análise de Crédito.', 'ok'); } catch (e) { toast(e.message, 'erro'); }
        };
      };
    });
    var origem = function () { return $('input[name=origImp]:checked', mo).value; };
    $$('input[name=origImp]', mo).forEach(function (r) { r.onchange = function () { $$('[data-orig]', mo).forEach(function (x) { x.hidden = x.getAttribute('data-orig') !== origem(); }); }; });
    var arquivoPdf = null, lido = null;
    async function enviarPdf(acao, extra) {
      var r = await fetch('/api/implantacoes/pdf?acao=' + acao, { method: 'POST', credentials: 'same-origin', body: arquivoPdf,
        headers: Object.assign({ 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': encodeURIComponent(arquivoPdf.name) }, extra || {}) });
      var j2 = {};
      try { j2 = await r.json(); } catch (e) { /* sem JSON */ }
      if (!r.ok) throw new Error(j2.erro || 'Falha ao ler o PDF.');
      return j2;
    }
    function htmlLido(x) {
      var l = x.lido;
      var linha = function (rot, val, onde) { return '<tr><td>' + esc(rot) + '</td><td><b>' + (val || '<span class="sec">não achei</span>') + '</b></td><td class="sec" style="white-space:nowrap">' + esc(onde) + '</td></tr>'; };
      var sit = x.situacao === 'valida' ? '<div class="msg ok">Análise de ' + dataBr(l.data) + ': dentro dos ' + x.validade_dias + ' dias.</div>'
        : x.situacao === 'liberada' ? '<div class="msg ok">Liberada pelo gestor da Análise de Crédito.</div>'
          : x.situacao === 'aguardando_gestor' ? '<div class="msg aviso">Pedido de liberação com o gestor da Análise de Crédito.</div>'
            : x.situacao === 'recusada' ? '<div class="msg erro">O gestor da Análise de Crédito não liberou esta análise: peça reanálise.</div>'
              : '<div class="msg aviso" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="flex:1">Análise de ' + dataBr(l.data) + ': passou de ' + x.validade_dias + ' dias.</span><button type="button" class="btn ghost sm" id="btLibPdf">Enviar ao gestor da Análise de Crédito</button></div>';
      return '<div class="pilha" style="gap:10px">' + sit +
        (x.existente ? '<div class="msg erro">Esta análise já tem implantação (' + esc(x.existente) + ').</div>' : '') +
        (x.no_portal ? '<div class="msg aviso">Esta análise está no portal: use a origem "A partir de uma Análise de Crédito".</div>' : '') +
        (['reprovada', 'pendente'].indexOf(l.resultado) >= 0 ? '<div class="msg erro">Análise ' + esc(RES_CR[l.resultado][0].toLowerCase()) + ': não abre implantação.</div>' : '') +
        '<div class="painel tabela-wrap" style="box-shadow:none"><table><thead><tr><th>Campo</th><th>Lido</th><th>Onde no PDF</th></tr></thead><tbody>' +
        linha('Protocolo e data', esc(l.protocolo) + ' · ' + dataBr(l.data), 'página 1, topo') +
        linha('Razão social · CNPJ', esc(l.razao_social) + (l.cnpj ? ' · ' + esc(l.cnpj) : ''), 'página 1') +
        linha('Executivo solicitante', esc(l.executivo), 'página 1') +
        linha('Status', l.resultado ? etqCr(RES_CR, l.resultado) : '', 'página 1') +
        linha('Taxa administrativa · boleto', l.taxa_adm != null ? pctCr(l.taxa_adm) + ' · ' + reais(l.boleto) : '', 'página 1, precificação') +
        linha('Unidades · taxa ordinária', l.uh_total ? l.uh_total + ' · ' + reais(l.taxa_ordinaria) : '', 'página 2, memória de cálculo') +
        linha('Síndico', l.sindico_tipo ? (l.sindico_tipo === 'profissional' ? 'Profissional' : 'Condômino') + (l.sindico_isencao === 'nao' ? ', sem isenção' : l.sindico_isencao ? ', isenção ' + l.sindico_isencao : '') : '', 'observações') +
        linha('Cidade/UF', l.uf ? esc(l.cidade + '/' + l.uf) + ' ' + etq(['conferir', 'ambar']) : '', 'texto das observações') +
        linha('Ressalvas e próximos passos', (l.observacoes_juridicas.length + l.proximos_passos.length) ? 'vão para as observações da implantação' : '', 'páginas 1 e 4') +
        '</tbody></table></div>' + (l.avisos.length ? '<div class="ajuda">' + esc(l.avisos.join(' ')) + '</div>' : '') +
        '<div class="ajuda">O PDF não traz: dia do vencimento, administradora e contatos, dados do síndico, parceria e cashback; o PDF fica em Documentos como "Análise de Crédito" e serve de base para o comparativo.</div></div>';
    }
    $('#arqPdfImp', mo).onchange = async function () {
      arquivoPdf = this.files[0];
      if (!arquivoPdf) return;
      $('#lidoPdfImp', mo).innerHTML = '<span class="ajuda">Lendo o PDF…</span>';
      try { lido = await enviarPdf('ler'); $('#lidoPdfImp', mo).innerHTML = htmlLido(lido); } catch (e) { lido = null; $('#lidoPdfImp', mo).innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>'; return; }
      if ($('#btLibPdf', mo)) $('#btLibPdf', mo).onclick = async function () {
        var motivo = window.prompt('Motivo do pedido ao gestor (opcional):', '') || '';
        try { await enviarPdf('liberar', { 'X-Motivo': encodeURIComponent(motivo) }); mo.fechar(); toast('Pedido enviado ao gestor da Análise de Crédito.', 'ok'); } catch (e) { toast(e.message, 'erro'); }
      };
    };
    $('#mImpOk', mo).onclick = async function () {
      try {
        var r;
        if (origem() === 'entrega') r = await api('POST', '/api/implantacoes', { origem: 'entrega' });
        else if (origem() === 'pdf') {
          if (!arquivoPdf || !lido) { toast('Escolha o PDF do retorno da análise.', 'erro'); return; }
          r = await enviarPdf('criar');
        } else {
          var sel = $('input[name=anImp]:checked', mo);
          if (!sel) { toast('Escolha a análise.', 'erro'); return; }
          r = await api('POST', '/api/implantacoes', { origem: 'analise', analise_id: Number(sel.value) });
        }
        mo.fechar(); location.hash = '#/implantacao/' + r.id;
      } catch (e) { toast(e.message, 'erro'); }
    };
  }

  /* ---------- liberações (gestor da Análise de Crédito) ---------- */
  async function abaLiberacoesImp() {
    var j;
    try { j = await api('GET', '/api/implantacoes/liberacoes'); } catch (e) { $('#corpoImp').innerHTML = '<div class="vazio">' + esc(e.message) + '</div>'; return; }
    $('#corpoImp').innerHTML = '<div class="painel"><div class="cab-painel"><h2>Análises além do prazo para implantar</h2><span class="ajuda" style="margin:0">o executivo pediu para abrir a implantação de uma análise liberada há mais tempo que a política permite</span></div>' +
      '<div class="tabela-wrap"><table style="min-width:900px"><thead><tr><th>Análise</th><th>Condomínio</th><th>Pedido</th><th>Situação</th></tr></thead><tbody>' +
      (j.liberacoes.map(function (l) {
        var sit = l.aprovado === null ? '<button class="btn ghost sm" data-dec="' + l.id + '" data-ok="0">Não liberar</button> <button class="btn primary sm" data-dec="' + l.id + '" data-ok="1">Liberar</button>'
          : (l.aprovado ? etq(['liberada', 'verde']) : etq(['não liberada', 'vermelha'])) + '<span class="sec">' + esc(l.decidido_por_nome || '') + ' · ' + dataHoraCr(l.decidido_em) + (l.observacao ? ' · ' + esc(l.observacao) : '') + '</span>';
        return '<tr><td>' + (l.analise_id ? '<a href="#/credito/' + l.analise_id + '"><b>' + esc(l.protocolo) + '</b></a><span class="sec">liberada em ' + dataHoraCr(l.liberada_em) + ' · ' + pctCr(l.taxa_adm) + ' + ' + reais(l.boleto) + '</span>'
          : '<b>' + esc(l.protocolo) + '</b><span class="sec">análise anterior ao portal (PDF) de ' + dataBr(String(l.liberada_em).slice(0, 10)) + '</span>') + '</td>' +
          '<td><b>' + esc(l.condominio) + '</b><span class="sec">' + esc(l.executivo_nome || '') + '</span></td>' +
          '<td>' + esc(l.pedido_por_nome || '—') + '<span class="sec">' + dataHoraCr(l.pedido_em) + (l.motivo ? ' · ' + esc(l.motivo) : '') + '</span></td><td>' + sit + '</td></tr>';
      }).join('') || '<tr><td colspan="4"><div class="vazio" style="border:0;padding:34px">Nenhum pedido.</div></td></tr>') + '</tbody></table></div></div>';
    $$('[data-dec]', $('#corpoImp')).forEach(function (b) {
      b.onclick = function () {
        var aprovar = b.getAttribute('data-ok') === '1';
        var mo = modal({ titulo: aprovar ? 'Liberar a análise para implantação' : 'Não liberar', corpo: '<label class="rot" for="mDec">' + (aprovar ? 'Observação (opcional)' : 'Motivo') + '</label><textarea class="campo" id="mDec" rows="3"></textarea>',
          pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn ' + (aprovar ? 'primary' : 'danger') + '" id="mDecOk">' + (aprovar ? 'Liberar' : 'Não liberar') + '</button>' });
        $('#mDecOk', mo).onclick = async function () {
          try { await api('POST', '/api/implantacoes/liberacoes/' + b.getAttribute('data-dec') + '/decidir', { aprovar: aprovar, observacao: $('#mDec', mo).value }); mo.fechar(); toast('Decisão registrada; o executivo foi avisado.', 'ok'); abaLiberacoesImp(); atualizarImp(); } catch (e) { toast(e.message, 'erro'); }
        };
      };
    });
  }

  /* ---------- formulário ---------- */
  var rotRefImp = 'Análise';
  function campoImp(nome, rotulo, valor, o) {
    o = o || {};
    var dif = o.difs && o.difs[o.dif || nome];
    var ajuda = [o.ref != null && o.ref !== '' ? rotRefImp + ': ' + esc(o.ref) + '.' : '', o.ajuda || ''].filter(Boolean).join(' ');
    return '<div' + (o.span ? ' style="grid-column:span ' + o.span + '"' : '') + (o.se ? ' data-se="' + o.se + '"' : '') + '><label class="rot" for="i_' + nome + '">' + esc(rotulo) + '</label>' +
      '<input class="campo' + (dif ? ' diferente' : '') + '" id="i_' + nome + '" value="' + esc(valor == null ? '' : valor) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.tipo ? ' type="' + o.tipo + '"' : '') + '>' +
      (ajuda || dif ? '<div class="ajuda' + (dif ? ' diferente' : '') + '">' + ajuda + (dif ? (rotRefImp === 'Análise' ? ' Diferente da análise: o setor e o gestor da Análise de Crédito veem.' : ' Diferente do aprovado pela diretoria: o setor vê.') : '') + '</div>' : '') + '</div>';
  }
  function selImp(nome, rotulo, valor, opcoes, o) {
    o = o || {};
    var dif = o.difs && o.difs[o.dif || nome];
    return '<div' + (o.se ? ' data-se="' + o.se + '"' : '') + '><label class="rot" for="i_' + nome + '">' + esc(rotulo) + '</label><select class="campo' + (dif ? ' diferente' : '') + '" id="i_' + nome + '">' +
      opcoes.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(valor == null ? '' : valor) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>' +
      (o.ref ? '<div class="ajuda' + (dif ? ' diferente' : '') + '">' + rotRefImp + ': ' + esc(o.ref) + '.' + (dif ? ' Diferente.' : '') + '</div>' : '') + '</div>';
  }
  function radiosImp(nome, rotulo, valor, opcoes, o) {
    o = o || {};
    return '<fieldset style="grid-column:1/-1;border:0;padding:0;margin:0"' + (o.se ? ' data-se="' + o.se + '"' : '') + '><legend class="rot">' + esc(rotulo) + '</legend><div class="marcas">' +
      opcoes.map(function (x) { return '<label class="marca"><input type="radio" name="i_' + nome + '" value="' + esc(x[0]) + '"' + (String(x[0]) === String(valor == null ? '' : valor) ? ' checked' : '') + '> ' + esc(x[1]) + '</label>'; }).join('') +
      (o.extra || '') + '</div>' + (o.ajuda ? '<div class="ajuda">' + o.ajuda + '</div>' : '') + '</fieldset>';
  }
  function marcasImp(nome, rotulo, valores, opcoes, o) {
    o = o || {};
    return '<fieldset style="grid-column:1/-1;border:0;padding:0;margin:0"' + (o.se ? ' data-se="' + o.se + '"' : '') + '><legend class="rot">' + esc(rotulo) + '</legend><div class="marcas">' +
      opcoes.map(function (x) { return '<label class="marca"><input type="checkbox" data-marca="' + nome + '" value="' + esc(x) + '"' + ((valores || []).indexOf(x) >= 0 ? ' checked' : '') + '> ' + esc(x) + '</label>'; }).join('') +
      (o.extra || '') + '</div>' + (o.ajuda ? '<div class="ajuda">' + o.ajuda + '</div>' : '') + '</fieldset>';
  }
  function linhaContatoImp(c) {
    c = c || {};
    return '<div class="contatos-imp" data-contato><div><label class="rot">Nome e função</label><input class="campo" data-k="nome" value="' + esc(c.nome || '') + '" placeholder="Nome"><input class="campo" data-k="funcao" style="margin-top:6px" value="' + esc(c.funcao || '') + '" placeholder="Função (ex.: gerente predial)"></div>' +
      '<div><label class="rot">Telefone</label><input class="campo" data-k="telefone" value="' + esc(c.telefone || '') + '"></div>' +
      '<div style="grid-column:span 2"><label class="rot">E-mail</label><input class="campo" data-k="email" value="' + esc(c.email || '') + '"></div>' +
      '<button type="button" class="btn icon ghost" data-tirar-contato aria-label="Remover contato">' + IC.fechar + '</button></div>';
  }
  function linhaParceiroImp(p, parceiros) {
    p = p || {};
    var campo = parceiros.length
      ? '<select class="campo" data-parceiro><option value="">Escolha o parceiro</option>' + parceiros.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.nome + (x.uf ? ' — ' + x.uf : '')) + '</option>'; }).join('') +
        (p.id && !parceiros.some(function (x) { return x.id === p.id; }) ? '<option value="' + esc(p.id) + '" selected>' + esc(p.nome) + '</option>' : '') + '</select>'
      : '<input class="campo" data-parceiro-nome value="' + esc(p.nome || '') + '" placeholder="Nome do parceiro">';
    return '<div class="linha" data-linha-parceiro style="flex-wrap:nowrap">' + campo + '<button type="button" class="btn icon ghost" data-tirar-parceiro aria-label="Remover parceiro">' + IC.fechar + '</button></div>';
  }

  // campos da implantação que vêm das condições fechadas no contrato
  var CAMPOS_CONTRATO_IMP = '#i_taxa_adm, #i_boleto, #i_desconto_tipo, #i_desconto_valor, #i_inicio_contrato, #i_dia_vencimento, input[name=i_honorarios_op], #i_honorarios_outro, ' +
    '[data-marca=garantias], #i_garantia_outra, input[name=i_cashback], #i_cashback_pct, [data-marca=cashback_receitas]';
  function htmlFormImp(i, m, parceiros, difs) {
    var f = i.formulario || {}, ref = i.referencia || {};
    var temRef = ref.taxa_adm != null;
    rotRefImp = i.origem === 'entrega' ? 'Aprovado pela diretoria' : 'Análise';
    var r = function (v) { return temRef ? v : null; };
    var sim = [['sim', 'Sim'], ['nao', 'Não']];
    var hon = [10, 12, 15, 17.5];
    var honOutro = f.honorarios != null && hon.indexOf(Number(f.honorarios)) < 0;
    var DESC = { nenhum: 'não possui', percentual: 'percentual', valor: 'valor por unidade' };
    var ISE = { nao: 'não', integral: 'integral', parcial: 'parcial' };
    var SIND = { condomino: 'condômino', profissional: 'profissional' };
    var parcs = (f.parceiros && f.parceiros.length ? f.parceiros : [{}]);
    var lista = parceiros.parceiros || [];
    return '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">1</span>Condomínio</h2>' + (temRef && i.origem !== 'entrega' ? '<span class="etiqueta azul">preenchido com a análise, pode ajustar</span>' : '') + '</div><div class="corpo grade-3">' +
      campoImp('nome', 'Nome do condomínio', f.nome, { span: 2 }) +
      '<div><label class="rot" for="i_cnpj">CNPJ</label><input class="campo" id="i_cnpj" value="' + esc(f.cnpj || '') + '" placeholder="00.000.000/0000-00"' + (f.sem_cnpj ? ' disabled' : '') + '>' +
      '<label class="linha" style="margin-top:8px;font-size:13px;font-weight:700;color:var(--ink-2)"><input type="checkbox" id="i_sem_cnpj"' + (f.sem_cnpj ? ' checked' : '') + '> Ainda não tem CNPJ (condomínio de entrega)</label></div>' +
      selImp('uf', 'Estado do contrato', f.uf || '', [['', 'Escolha']].concat(UFS.map(function (u) { return [u, u]; }))) +
      campoImp('cidade', 'Cidade', f.cidade) +
      campoImp('uh_total', 'Número total de unidades', f.uh_total, { ref: r(ref.uh_total), difs: difs, ajuda: 'Vale o número da convenção.' }) +
      campoImp('dia_vencimento', 'Dia do vencimento', f.dia_vencimento, { ref: r(ref.dia_vencimento), difs: difs, ph: '1 a 31' }) +
      selImp('entrega', 'Condomínio de entrega?', f.entrega ? 'sim' : 'nao', [['nao', 'Não'], ['sim', 'Sim']]) +
      campoImp('construtora', 'Construtora', f.construtora, { se: 'entrega:sim' }) +
      campoImp('construtora_contato', 'Contato da construtora', f.construtora_contato, { se: 'entrega:sim', span: 2 }) + '</div></section>' +

      '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">2</span>Síndico</h2></div><div class="corpo grade-3">' +
      selImp('sindico_tipo', 'Tipo de síndico', f.sindico_tipo || '', [['', 'Escolha'], ['condomino', 'Condômino (orgânico)'], ['profissional', 'Profissional']], { ref: temRef && ref.sindico_tipo ? SIND[ref.sindico_tipo] : null }) +
      selImp('sindico_isencao', 'Isento da taxa condominial?', f.sindico_isencao || '', [['', 'Escolha'], ['nao', 'Não'], ['integral', 'Sim, integral'], ['parcial', 'Sim, parcial']], { ref: temRef && ref.sindico_isencao ? ISE[ref.sindico_isencao] : null, difs: difs }) +
      campoImp('sindico_isencao_pct', 'Isenção parcial (%)', fmtNumCr(f.sindico_isencao_pct), { se: 'sindico_isencao:parcial' }) +
      campoImp('sindico_nome', 'Nome do síndico', f.sindico_nome) +
      campoImp('sindico_cpf', 'CPF do síndico', f.sindico_cpf, { ph: '000.000.000-00' }) +
      campoImp('sindico_email', 'E-mail do síndico ou do condomínio', f.sindico_email, { tipo: 'email' }) +
      campoImp('sindico_telefone', 'Telefone do síndico', f.sindico_telefone, { ph: '(00) 00000-0000' }) + '</div></section>' +

      '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">3</span>Condições do contrato</h2></div><div class="corpo grade-3">' +
      campoImp('taxa_adm', 'Taxa administrativa (%)', fmtNumCr(f.taxa_adm), { ref: temRef ? pctCr(ref.taxa_adm) : null, difs: difs }) +
      campoImp('boleto', 'Valor do boleto (R$)', fmtNumCr(f.boleto), { ref: temRef ? reais(ref.boleto) : null, difs: difs }) +
      campoImp('taxa_ordinaria', 'Taxa ordinária (R$)', fmtNumCr(f.taxa_ordinaria), { ref: temRef && ref.taxa_ordinaria != null ? reais(ref.taxa_ordinaria) : null, difs: difs }) +
      selImp('desconto_tipo', 'Desconto de pontualidade', f.desconto_tipo || 'nenhum', [['nenhum', 'Não possui'], ['percentual', 'Percentual (%)'], ['valor', 'Valor por unidade (R$)']], { ref: temRef && ref.desconto_tipo ? DESC[ref.desconto_tipo] + (ref.desconto_valor ? ' ' + fmtNumCr(ref.desconto_valor) : '') : null, difs: difs, dif: 'desconto' }) +
      campoImp('desconto_valor', 'Desconto (% ou R$)', fmtNumCr(f.desconto_valor), { se: 'desconto_tipo:percentual,valor' }) +
      campoImp('desconto_ate_dia', 'Desconto vale até o dia', f.desconto_ate_dia, { se: 'desconto_tipo:percentual,valor', ph: '1 a 31' }) +
      campoImp('inicio_contrato', 'Data de início do contrato', f.inicio_contrato, { tipo: 'date', ajuda: 'Também conta as parcelas restantes da taxa extra.' }) +
      radiosImp('honorarios_op', 'Honorários de cobrança extrajudicial', honOutro ? 'outro' : f.honorarios != null ? String(f.honorarios) : '', hon.map(function (h) { return [String(h), fmtNumCr(h) + '%']; }).concat([['outro', 'Outro']]),
        { extra: '<input class="campo" id="i_honorarios_outro" data-se="honorarios_op:outro" style="width:110px" placeholder="%" value="' + esc(honOutro ? fmtNumCr(f.honorarios) : '') + '" aria-label="Outro percentual de honorários">' }) +
      marcasImp('garantias', 'O que será garantido (marque todos)', f.garantias, m.garantias, { extra: '<input class="campo" id="i_garantia_outra" style="max-width:220px" placeholder="Outra (descreva)" value="' + esc(f.garantia_outra || '') + '" aria-label="Outra garantia">' }) +
      '<div style="grid-column:1/-1"><div class="linha" style="margin-bottom:8px"><span class="rot" style="margin:0">Taxa extra vigente' + (temRef ? ' (preenchida com a análise, pode ajustar)' : '') + '</span><span class="espaco"></span><button type="button" class="btn ghost sm" id="btExtraImp">' + IC.mais + 'Adicionar taxa extra</button></div>' +
      '<div class="painel tabela-wrap" style="box-shadow:none"><table style="min-width:720px"><thead><tr><th>Descrição</th><th>Valor por unidade</th><th>Início</th><th>Fim</th><th>Ata</th><th></th></tr></thead><tbody id="tbExtrasImp">' +
      (f.taxas_extras || []).map(linhaExtraCr).join('') + '</tbody></table></div></div></div></section>' +

      '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">4</span>Parceria</h2></div><div class="corpo grade-3">' +
      radiosImp('parceria', 'Há contrato de parceria?', f.parceria || '', sim) +
      '<div style="grid-column:span 2" data-se="parceria:sim"><span class="rot">Parceiro</span><div class="pilha" style="gap:8px" id="parceirosImp">' + parcs.map(function (p) { return linhaParceiroImp(p, lista); }).join('') + '</div>' +
      '<button type="button" class="btn ghost sm" id="btParcImp" style="margin-top:8px">' + IC.mais + 'Dividir com outro parceiro</button>' +
      '<div class="ajuda">' + (parceiros.aviso ? esc(parceiros.aviso) : 'Lista da base de comissão. Não está na lista? Peça o cadastro ao setor Parceiros.') + '</div></div>' +
      '<div data-se="parceria:sim"><span class="rot">Percentual da comissão</span><div class="campo" style="background:var(--bg);color:var(--muted)">o setor Parceiros define</div></div></div></section>' +

      '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">5</span>Cashback e antecipação</h2></div><div class="corpo grade-3">' +
      radiosImp('cashback', 'Contrato com cashback?', f.cashback || '', [['nao', 'Não'], ['5', 'Sim, 5%'], ['10', 'Sim, 10%'], ['outro', 'Outro']],
        { extra: '<input class="campo" id="i_cashback_pct" data-se="cashback:outro" style="width:110px" placeholder="%" value="' + esc(fmtNumCr(f.cashback_pct)) + '" aria-label="Percentual do cashback">' }) +
      marcasImp('cashback_receitas', 'Sobre quais receitas incide o cashback', f.cashback_receitas, m.receitas_cashback, { se: 'cashback:5,10,outro' }) +
      radiosImp('antecipacao', 'Foi negociada antecipação de valores?', f.antecipacao || '', sim) +
      campoImp('antecipacao_valor', 'Valor da antecipação (R$)', fmtNumCr(f.antecipacao_valor), { se: 'antecipacao:sim' }) +
      campoImp('antecipacao_data', 'Data da antecipação', f.antecipacao_data, { tipo: 'date', se: 'antecipacao:sim' }) +
      campoImp('antecipacao_prazo', 'Permanente ou até quando', f.antecipacao_prazo, { se: 'antecipacao:sim', ph: 'Permanente / até mm/aaaa' }) + '</div></section>' +

      '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">6</span>Administradora e contatos</h2></div><div class="corpo grade-3">' +
      campoImp('administradora', 'Nome da administradora', f.administradora, { span: 2, ref: temRef && ref.administradora ? ref.administradora : null, ajuda: 'Com administração interna, informe quem administra (pessoa ou equipe do próprio condomínio).' }) +
      '<div style="display:flex;align-items:center"><label class="linha" style="font-weight:700;font-size:14px;color:var(--ink-2)"><input type="checkbox" id="i_administracao_interna"' + (f.administracao_interna ? ' checked' : '') + '> Administração interna (do próprio condomínio, não terceirizada)</label></div>' +
      campoImp('consultor_nome', 'Consultor do condomínio', f.consultor_nome) +
      campoImp('consultor_telefone', 'Telefone', f.consultor_telefone) +
      campoImp('consultor_email', 'E-mail', f.consultor_email, { tipo: 'email' }) +
      '<div style="grid-column:1/-1" class="pilha"><div id="contatosImp" class="pilha" style="gap:10px">' + (f.contatos || []).map(linhaContatoImp).join('') + '</div>' +
      '<button type="button" class="btn ghost sm" id="btContatoImp" style="align-self:flex-start">' + IC.mais + 'Adicionar contato</button></div>' +
      '<div style="grid-column:1/-1"><label class="rot" for="i_observacoes">Outras observações para a implantação</label><textarea class="campo" id="i_observacoes" rows="3" placeholder="Ex.: o síndico prefere contato por e-mail; boleto anterior vencia no dia 5.">' + esc(f.observacoes || '') + '</textarea></div>' +
      '</div></section>';
  }

  function valImp(nome) {
    var rad = $('input[name=i_' + nome + ']:checked');
    if (rad) return rad.value;
    var el = $('#i_' + nome);
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked ? 'sim' : 'nao';
    return el.value.trim();
  }
  function ligarCondicoesImp(raiz) {
    function aplicar() {
      $$('[data-se]', raiz).forEach(function (el) {
        var p = el.getAttribute('data-se').split(':');
        el.hidden = p[1].split(',').indexOf(valImp(p[0])) < 0;
      });
      var cnpj = $('#i_cnpj', raiz);
      if (cnpj && !cnpj.closest('[data-leitura]')) cnpj.disabled = $('#i_sem_cnpj', raiz).checked;
      var cpf = $('#i_sindico_cpf', raiz);
      if (cpf) {
        var d = cpf.value.replace(/\D/g, '');
        var aj = cpf.parentNode.querySelector('.ajuda') || cpf.parentNode.appendChild(document.createElement('div'));
        aj.className = 'ajuda' + (d.length === 11 ? (cpfValidoImp(d) ? ' ok' : ' diferente') : '');
        aj.textContent = d.length === 11 ? (cpfValidoImp(d) ? 'CPF válido.' : 'CPF inválido: confira os números.') : '';
      }
    }
    raiz.addEventListener('change', aplicar);
    raiz.addEventListener('input', function (e) { if (e.target.id === 'i_sindico_cpf') aplicar(); });
    aplicar();
  }
  function cpfValidoImp(d) {
    if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
    function dv(n) { var s = 0; for (var k = 0; k < n; k++) s += Number(d[k]) * (n + 1 - k); var r = (s * 10) % 11; return r === 10 ? 0 : r; }
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  function lerFormImp(parceiros) {
    var v = valImp;
    var marcas = function (nome) { return $$('[data-marca=' + nome + ']:checked').map(function (c) { return c.value; }); };
    var hon = v('honorarios_op');
    var lista = parceiros.parceiros || [];
    return {
      nome: v('nome'), cnpj: v('cnpj'), sem_cnpj: $('#i_sem_cnpj').checked, uf: v('uf'), cidade: v('cidade'), uh_total: numCr(v('uh_total')), dia_vencimento: numCr(v('dia_vencimento')),
      entrega: v('entrega') === 'sim', construtora: v('construtora'), construtora_contato: v('construtora_contato'),
      sindico_tipo: v('sindico_tipo'), sindico_isencao: v('sindico_isencao'), sindico_isencao_pct: numCr(v('sindico_isencao_pct')), sindico_nome: v('sindico_nome'),
      sindico_cpf: v('sindico_cpf'), sindico_email: v('sindico_email'), sindico_telefone: v('sindico_telefone'),
      taxa_adm: numCr(v('taxa_adm')), boleto: numCr(v('boleto')), taxa_ordinaria: numCr(v('taxa_ordinaria')), desconto_tipo: v('desconto_tipo'),
      desconto_valor: numCr(v('desconto_valor')), desconto_ate_dia: numCr(v('desconto_ate_dia')), inicio_contrato: v('inicio_contrato'),
      honorarios: hon === 'outro' ? numCr($('#i_honorarios_outro').value) : numCr(hon),
      garantias: marcas('garantias'), garantia_outra: $('#i_garantia_outra').value.trim(),
      taxas_extras: $$('#tbExtrasImp tr').map(function (tr) {
        var g = function (k) { return $('[data-x=' + k + ']', tr); };
        return { descricao: g('descricao').value.trim(), valor_por_uh: numCr(g('valor_por_uh').value), inicio: g('inicio').value, fim: g('fim').value, ata: g('ata').checked };
      }).filter(function (x) { return x.descricao || x.valor_por_uh; }),
      parceria: v('parceria'),
      parceiros: $$('[data-linha-parceiro]').map(function (l) {
        var s = $('[data-parceiro]', l);
        if (s) { var p = lista.find(function (x) { return x.id === s.value; }); return s.value ? { id: s.value, nome: p ? p.nome : s.options[s.selectedIndex].text } : null; }
        var n = $('[data-parceiro-nome]', l).value.trim();
        return n ? { id: '', nome: n } : null;
      }).filter(Boolean),
      cashback: v('cashback'), cashback_pct: numCr($('#i_cashback_pct').value), cashback_receitas: marcas('cashback_receitas'),
      antecipacao: v('antecipacao'), antecipacao_valor: numCr(v('antecipacao_valor')), antecipacao_data: v('antecipacao_data'), antecipacao_prazo: v('antecipacao_prazo'),
      administradora: v('administradora'), administracao_interna: $('#i_administracao_interna').checked,
      consultor_nome: v('consultor_nome'), consultor_telefone: v('consultor_telefone'), consultor_email: v('consultor_email'),
      contatos: $$('[data-contato]').map(function (c) {
        var g = function (k) { return $('[data-k=' + k + ']', c).value.trim(); };
        return { nome: g('nome'), funcao: g('funcao'), telefone: g('telefone'), email: g('email') };
      }).filter(function (c) { return c.nome || c.telefone || c.email; }),
      observacoes: $('#i_observacoes').value.trim(),
      entrega_justificativa: $('#i_entrega_justificativa') ? $('#i_entrega_justificativa').value.trim() : undefined,
    };
  }

  /* ---------- documentos ---------- */
  async function enviarDocImp(id, tipo, arquivo) {
    var r = await fetch('/api/implantacoes/' + id + '/documentos', {
      method: 'POST', credentials: 'same-origin', body: arquivo,
      headers: { 'Content-Type': arquivo.type || 'application/octet-stream', 'X-Nome-Arquivo': encodeURIComponent(arquivo.name), 'X-Tipo': tipo },
    });
    if (r.status === 413) throw new Error('"' + arquivo.name + '" passa do tamanho máximo permitido.');
    if (!r.ok) { var j = {}; try { j = await r.json(); } catch (e) { /* sem JSON */ } throw new Error(j.erro || 'Falha ao enviar ' + arquivo.name); }
  }
  function htmlDocsImp(d, m) {
    var i = d.implantacao, pd = d.pode;
    var vig = d.documentos.filter(function (x) { return !x.substituido_em; });
    function lnk(x) {
      return '<a class="anexo" href="/api/implantacoes/' + i.id + '/documentos/' + x.id + (x.mime === 'application/pdf' ? '?ver=1' : '') + '" target="_blank" rel="noopener">' + IC.documento + '<span>' + esc(x.nome) + '</span><span class="sec">' + tamanho(x.tamanho) + '</span></a>' +
        (pd.tirar_documentos && !x.vinculado && x.tipo !== 'analise_credito' ? '<button type="button" class="btn icon ghost" data-tirar-doc-imp="' + x.id + '" aria-label="Remover ' + esc(x.nome) + '">' + IC.fechar + '</button>' : '');
    }
    function linha(t) {
      var atual = vig.filter(function (x) { return x.tipo === t.tipo; });
      var vinc = atual.some(function (x) { return x.vinculado; });
      var st = atual.length ? etq([vinc || t.tipo === 'analise_credito' ? 'vinculada' : 'entregue', 'verde']) : t.obrigatorio ? etq(['falta', 'vermelha']) : t.pendente ? etq(['pendente', 'ambar']) : etq(['opcional', 'cinza']);
      return '<div class="doc-linha"><b style="flex:1 1 260px">' + esc(t.nome) + (t.obrigatorio ? ' <span style="color:var(--red)" aria-label="obrigatório">*</span>' : '') + '</b>' + st + atual.map(lnk).join('') +
        (pd.documentos && t.tipo !== 'analise_credito' && (!vinc || t.tipo === 'outro') ? '<label class="btn ghost sm">' + IC.enviar + (atual.length ? (t.tipo === 'outro' ? 'Anexar outro' : 'Trocar') : 'Anexar') + '<input type="file" data-doc-imp="' + t.tipo + '" hidden></label>' : '') + '</div>';
    }
    var obrigTipos = d.documentos_obrigatorios || [];
    var obrig = m.documentos.filter(function (t) { return obrigTipos.indexOf(t.tipo) >= 0; }).map(function (t) { return Object.assign({}, t, { obrigatorio: true }); });
    // no condomínio de entrega não há análise de crédito
    var depois = m.documentos.filter(function (t) { return (t.pendente || (t.obrigatorio && obrigTipos.indexOf(t.tipo) < 0) || t.tipo === 'contrato') && t.tipo !== 'outro' && !(t.tipo === 'analise_credito' && i.origem === 'entrega'); })
      .map(function (t) { return Object.assign({}, t, { obrigatorio: false, pendente: ['analise_credito', 'contrato'].indexOf(t.tipo) < 0 }); });
    var outro = m.documentos.filter(function (t) { return t.tipo === 'outro'; });
    var nObrig = obrig.filter(function (t) { return vig.some(function (x) { return x.tipo === t.tipo; }); }).length;
    return '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">7</span>Documentos</h2><span class="espaco"></span>' + (obrig.length ? '<span class="ajuda" style="margin:0">obrigatórios: ' + nObrig + ' de ' + obrig.length + '</span>' : '') + '</div>' +
      (obrig.length ? '<div class="sub-doc" style="border-top:0">Obrigatórios para enviar</div>' + obrig.map(linha).join('') : '') +
      '<div class="sub-doc"' + (obrig.length ? '' : ' style="border-top:0"') + '>' + (i.origem === 'entrega' ? 'Condomínio de entrega: os documentos podem chegar depois' : 'Outros documentos') + '</div>' +
      depois.map(linha).join('') + outro.map(linha).join('') + '</section>';
  }
  function ligarDocsImp(i, recarregar) {
    $$('input[data-doc-imp]').forEach(function (inp) {
      inp.onchange = async function () {
        if (!inp.files[0]) return;
        try { await enviarDocImp(i.id, inp.getAttribute('data-doc-imp'), inp.files[0]); toast('Documento anexado.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
      };
    });
    $$('[data-tirar-doc-imp]').forEach(function (b) {
      b.onclick = async function () {
        if (!(await confirmar('Remover documento', 'O arquivo sai desta implantação.', 'Remover', true))) return;
        try { await api('DELETE', '/api/implantacoes/' + i.id + '/documentos/' + b.getAttribute('data-tirar-doc-imp')); recarregar(); } catch (e) { toast(e.message, 'erro'); }
      };
    });
  }

  /* ---------- contrato: as condições fechadas registradas pela advogada (Solicitação de Contrato) ---------- */
  function htmlContratoImp(d) {
    var ct = d.contrato;
    if (!ct) {
      return '<div class="msg aviso" style="margin-bottom:16px">Sem contrato assinado no portal para este condomínio. As condições do contrato ficam como o comercial preencher aqui' +
        (d.pode.editar ? '; se o contrato ainda vai ser pedido, use <a href="#/contratos">Solicitação de Contrato</a>.' : '.') + '</div>';
    }
    var link = '<a href="#/contratos/' + ct.id + '">' + esc(ct.protocolo || 'solicitação em rascunho') + '</a>';
    if (!ct.fechado) return '<div class="msg info" style="margin-bottom:16px">Contrato ' + link + ': ' + esc((ETAPA_CT[ct.etapa] || [ct.etapa])[0].toLowerCase()) + '. As condições fechadas aparecem aqui quando a advogada concluir.</div>';
    var x = ct.fechado;
    var par = function (rot, val) { return '<dt>' + esc(rot) + '</dt><dd>' + (val || '—') + '</dd>'; };
    var desc = x.desconto_tipo === 'percentual' ? pctCr(x.desconto_valor) : x.desconto_tipo === 'valor' ? reais(x.desconto_valor) + ' por unidade' : 'não possui';
    var cb = x.cashback === 'outro' ? pctCr(x.cashback_pct) : x.cashback === 'nao' ? 'não' : x.cashback + '%';
    var RES = { aceito: 'aceito', parcial: 'aceito em parte', recusado: 'recusado' };
    return '<section class="painel" style="margin-bottom:16px"><div class="cab-painel"><h2>Condições fechadas no contrato</h2><span class="etiqueta verde">' + link + '</span>' +
      '<span class="ajuda" style="margin:0">registradas por ' + esc(ct.fechado_por_nome || '') + ' em ' + dataHoraCr(ct.fechado_em) + '</span>' +
      (ct.corrigido ? '<span class="etiqueta ambar" title="' + esc(ct.corrigido.motivo || '') + '">corrigidas por ' + esc(ct.corrigido.nome || '') + ' em ' + dataHoraCr(ct.corrigido.criado_em) + '</span>' : '') + '</div><div class="corpo">' +
      (ct.diferente_da_implantacao.length ? '<div class="msg erro" style="margin-bottom:12px"><b>O formulário desta implantação está diferente do contrato:</b> ' + ct.diferente_da_implantacao.map(function (v) { return esc(v.rotulo) + ' ' + esc(String(v.implantacao)) + ' (contrato: ' + esc(String(v.contrato)) + ')'; }).join('; ') +
        '. ' + (d.pode.editar ? 'Ajuste o formulário abaixo.' : 'Confira antes de seguir.') + '</div>' : '') +
      (ct.diferencas.length ? '<div class="msg aviso" style="margin-bottom:12px"><b>Mudou na negociação do contrato:</b> ' + ct.diferencas.map(function (v) { return esc(v.rotulo) + ' ' + esc(v.fechado) + ' (pedido: ' + esc(v.pedido) + ')'; }).join('; ') + '.</div>' : '') +
      '<div class="grade-2"><dl class="info-ticket" style="margin:0">' + par('Taxa administrativa', pctCr(x.taxa_adm)) + par('Boleto', reais(x.boleto)) +
      par('Desconto de pontualidade', esc(desc) + (x.desconto_inicio ? ' · a partir de ' + esc(x.desconto_inicio) : '')) + par('Garantias', esc([].concat(x.garantias || [], x.garantia_outra ? [x.garantia_outra] : []).join(', '))) +
      par('Taxa extra coberta', x.limite_extra ? 'até ' + fmtNumCr(x.limite_extra) + '% da ordinária' : '') + par('Cashback', esc(cb) + ((x.cashback_receitas || []).length ? ' · ' + esc(x.cashback_receitas.join(', ')) : '')) + '</dl>' +
      '<dl class="info-ticket" style="margin:0">' + par('Início (1ª arrecadação)', dataBr(x.inicio_contrato)) + par('Vencimento', x.dia_vencimento ? 'dia ' + x.dia_vencimento : '') +
      par('Período mínimo', x.periodo_minimo ? x.periodo_minimo + ' meses' : 'padrão') + par('Cláusula 12ª', x.fidelizacao ? 'com fidelização' : 'sem fidelização') +
      (x.honorarios ? par('Honorários de cobrança extrajudicial', pctCr(x.honorarios)) : '') +
      par('Foro', esc(x.foro)) + par('Contestação da prestação de contas', x.prazo_contestacao ? x.prazo_contestacao + ' dias' : '') + '</dl></div>' +
      ((x.clausulas || []).length ? '<div class="pilha" style="gap:6px;margin-top:12px;font-size:13px;font-weight:600;color:var(--ink-2)">' + x.clausulas.map(function (k) {
        return '<div><b style="color:var(--ink)">' + esc(k.clausula) + '</b> ' + esc(k.pedido) + ': <b>' + esc(RES[k.resultado] || '—') + '</b>' + (k.redacao ? '. ' + esc(k.redacao) : '') + '</div>';
      }).join('') + '</div>' : '') +
      (x.observacoes ? '<div class="ajuda" style="white-space:pre-wrap">' + esc(x.observacoes) + '</div>' : '') + '</div></section>';
  }

  /* ---------- condomínio de entrega: aprovação da diretoria ---------- */
  function htmlEntregaImp(d) {
    var i = d.implantacao, pd = d.pode, f = i.formulario || {}, ref = i.referencia || {};
    var corpo;
    if (ref.aprovado_em) {
      corpo = '<div class="msg ok">Aprovado por ' + esc(ref.aprovado_por) + ' em ' + dataHoraCr(ref.aprovado_em) + ': ' + pctCr(ref.taxa_adm) + ' de taxa administrativa e boleto de ' + reais(ref.boleto) +
        (ref.proposta && (ref.proposta.taxa_adm !== ref.taxa_adm || ref.proposta.boleto !== ref.boleto) ? ' (proposta: ' + pctCr(ref.proposta.taxa_adm) + ' + ' + reais(ref.proposta.boleto) + ')' : '') + (ref.observacao ? '. ' + esc(ref.observacao) : '') + '.</div>' +
        (i.etapa === 'rascunho' ? '<div class="ajuda">Com o contrato assinado, complete o formulário e envie ao setor Implantação.</div>' : '');
    } else if (pd.decidir_diretoria) {
      corpo = '<dl class="info-ticket" style="margin-bottom:12px"><dt>Proposta do comercial</dt><dd>' + pctCr(f.taxa_adm) + ' + boleto ' + reais(f.boleto) + '</dd><dt>Unidades previstas</dt><dd>' + esc(f.uh_total || '—') + '</dd>' +
        '<dt>Taxa ordinária prevista</dt><dd>' + (f.taxa_ordinaria ? reais(f.taxa_ordinaria) : '—') + '</dd><dt>Construtora</dt><dd>' + esc([f.construtora, f.construtora_contato].filter(Boolean).join(' · ') || '—') + '</dd>' +
        '<dt>CNPJ</dt><dd>' + (f.sem_cnpj ? 'ainda não tem' : esc(f.cnpj || '—')) + '</dd>' + (f.entrega_justificativa ? '<dt>Justificativa</dt><dd>' + esc(f.entrega_justificativa) + '</dd>' : '') + '</dl>' +
        '<div class="grade-3">' + campoCr('dTaxa', 'Taxa administrativa aprovada (%)', fmtNumCr(f.taxa_adm)) + campoCr('dBol', 'Boleto aprovado (R$)', fmtNumCr(f.boleto)) + campoCr('dObs', 'Observação (obrigatória para não aprovar)', '') + '</div>' +
        '<div class="linha" style="justify-content:flex-end;margin-top:12px"><button class="btn danger sm" id="btDirNao">Não aprovar</button><button class="btn primary sm" id="btDirSim">Aprovar taxa e boleto</button></div>';
    } else if (i.etapa === 'diretoria') {
      corpo = '<div class="msg aviso">Com a diretoria: ' + pctCr(f.taxa_adm) + ' + boleto ' + reais(f.boleto) + ' aguardando aprovação.</div>';
    } else {
      corpo = (ref.recusa ? '<div class="msg erro" style="margin-bottom:10px">' + esc(ref.recusa.por) + ' não aprovou em ' + dataHoraCr(ref.recusa.em) + ': ' + esc(ref.recusa.observacao) + '</div>' : '') +
        '<p class="ajuda" style="margin-top:0">Preencha no formulário abaixo o condomínio (o CNPJ pode ficar para depois), a construtora, as unidades, a taxa ordinária prevista e, em Condições do contrato, a taxa administrativa e o boleto propostos.</p>' +
        '<label class="rot" for="i_entrega_justificativa">Justificativa para a diretoria (opcional)</label><textarea class="campo" id="i_entrega_justificativa" rows="2">' + esc(f.entrega_justificativa || '') + '</textarea>' +
        (d.faltas_diretoria.length ? '<div class="ajuda">Para pedir, falta: ' + esc(d.faltas_diretoria.join(' ')) + '</div>' : '') +
        (pd.pedir_diretoria ? '<div class="linha" style="justify-content:flex-end;margin-top:10px"><button class="btn primary sm" id="btPedirDir">Pedir aprovação da diretoria</button></div>' : '');
    }
    return '<section class="painel" style="margin-bottom:16px"><div class="cab-painel"><h2>Condomínio de entrega · aprovação da diretoria</h2></div><div class="corpo">' + corpo + '</div></section>';
  }

  /* ---------- setor: etapas e conferências ---------- */
  function htmlSetorImp(d, m) {
    var i = d.implantacao, pd = d.pode, e = i.etapas, ed = pd.etapas;
    var dis = ed ? '' : ' disabled';
    var c = d.conferencias;
    var html = '';
    if (['em_implantacao', 'pendencia', 'concluida', 'na_carteira'].indexOf(i.etapa) >= 0 && i.responsavel_id) {
      var feito = { documentacao: e.documentacao.feito, vouch: !!e.vouch.id, onboarding: ['realizado', 'sindico_myblue'].indexOf(e.onboarding.situacao) >= 0, boletos: e.boletos.feito, envio: !!e.envio.forma };
      var n = Object.keys(feito).filter(function (k) { return feito[k]; }).length;
      var campo = {
        documentacao: '<label class="marca"><input type="checkbox" id="e_doc"' + (e.documentacao.feito ? ' checked' : '') + dis + '> Conferida</label>',
        vouch: '<label class="rot" for="e_vouch" style="margin:0">ID Vouch</label><input class="campo" id="e_vouch" style="width:140px" value="' + esc(e.vouch.id) + '"' + dis + '>',
        onboarding: '<select class="campo" id="e_onb" style="width:auto" aria-label="Situação do onboarding"' + dis + '>' + Object.keys(m.onboarding).map(function (k) { return '<option value="' + k + '"' + (k === e.onboarding.situacao ? ' selected' : '') + '>' + esc(m.onboarding[k]) + '</option>'; }).join('') + '</select>' +
          '<input class="campo" id="e_onb_data" style="width:180px" placeholder="data e hora, se marcado" value="' + esc(e.onboarding.data) + '" aria-label="Data do onboarding"' + dis + '>',
        boletos: '<label class="marca"><input type="checkbox" id="e_bol"' + (e.boletos.feito ? ' checked' : '') + dis + '> Boletos emitidos</label>',
        envio: '<div class="marcas">' + Object.keys(m.envio).map(function (k) { return '<label class="marca"><input type="radio" name="e_env" value="' + k + '"' + (k === e.envio.forma ? ' checked' : '') + dis + '> ' + esc(m.envio[k]) + '</label>'; }).join('') + '</div>',
      };
      html += '<section class="painel"><div class="cab-painel"><h2>Etapas da implantação</h2><span class="espaco"></span><span class="ajuda" style="margin:0">' + n + ' de 5' + (i.etapa === 'em_implantacao' ? ' · concluir libera com as 5 feitas' : '') + '</span></div>' +
        ETAPA_SETOR_IMP.map(function (x, k) {
          return '<div class="doc-linha"><span class="passo"' + (feito[x[0]] ? ' style="background:var(--green);color:#fff"' : '') + '>' + (feito[x[0]] ? '✓' : k + 1) + '</span><div style="flex:1 1 220px"><b>' + esc(x[1]) + '</b><span class="ajuda" style="display:block;margin:0">' + esc(x[2]) + '</span></div><div class="linha">' + campo[x[0]] + '</div></div>';
        }).join('') +
        (ed ? '<div class="doc-linha" style="justify-content:flex-end"><button class="btn primary sm" id="btEtapasImp">Salvar etapas</button></div>' : '') + '</section>';
    }
    if (c) {
      var item = function (ok, texto) { return '<div class="doc-linha">' + (ok ? etq(['ok', 'verde']) : etq(['atenção', 'ambar'])) + '<span style="flex:1">' + texto + '</span></div>'; };
      var cad = c.cadastro;
      html += '<section class="painel"><div class="cab-painel"><h2>Conferências do portal</h2></div>' +
        item(!c.diferencas.length, c.diferencas.length ? '<b>Diferente da análise:</b> ' + esc(c.diferencas.map(function (x) { return x.rotulo.replace(/ \((%|R\$)\)$/, ''); }).join(', ')) + '.' : '<b>Condições</b> iguais às da análise.') +
        item(c.cpf_sindico, '<b>CPF do síndico</b> ' + (c.cpf_sindico ? 'válido.' : 'inválido: confira.')) +
        (c.cnpj === null ? item(false, '<b>CNPJ</b> ainda não informado (condomínio de entrega).') : item(c.cnpj, '<b>CNPJ</b> ' + (c.cnpj ? 'válido.' : 'inválido: confira.'))) +
        (!cad ? item(false, '<b>Cadastro de moradores</b> ainda não anexado.') : cad.erro ? item(false, '<b>Cadastro de moradores:</b> ' + esc(cad.erro)) :
          item(cad.unidades === cad.unidades_formulario && !cad.documentos_invalidos.length, '<b>Cadastro de moradores:</b> ' + cad.unidades + ' unidade(s)' + (cad.unidades_formulario ? (cad.unidades === cad.unidades_formulario ? ', como no formulário' : ', o formulário diz ' + cad.unidades_formulario) : '') +
            (cad.tem_documento ? (cad.documentos_invalidos.length ? '; ' + cad.documentos_invalidos.length + ' CPF/CNPJ inválido(s) (linha ' + cad.documentos_invalidos.slice(0, 8).join(', ') + (cad.documentos_invalidos.length > 8 ? '…' : '') + ')' : '; CPF/CNPJ válidos') + (cad.sem_documento ? '; ' + cad.sem_documento + ' sem CPF/CNPJ' : '') : '; sem coluna de CPF/CNPJ') + '.')) +
        '</section>';
    }
    return html;
  }
  function lerEtapasImp() {
    var env = $('input[name=e_env]:checked');
    return { documentacao: { feito: $('#e_doc').checked }, vouch: { id: $('#e_vouch').value.trim() }, onboarding: { situacao: $('#e_onb').value, data: $('#e_onb_data').value.trim() },
      boletos: { feito: $('#e_bol').checked }, envio: { forma: env ? env.value : '' } };
  }

  async function confirmarCarteiraImp(i, recarregar) {
    var j;
    try { j = await api('GET', '/api/implantacoes/' + i.id + '/carteira'); } catch (e) { toast(e.message, 'erro'); return; }
    var dd = j.dados;
    var c = function (k, rot, extra) { return campoCr('k_' + k, rot, dd[k], extra); };
    var mo = modal({
      titulo: 'Confirmar a entrada na Carteira', largo: true,
      corpo: (j.duplicados.length ? '<div class="msg aviso" style="margin-bottom:12px">Já existe na Carteira: ' + esc(j.duplicados.map(function (x) { return x.nome + ' (ID ' + x.codigo + ')'; }).join('; ')) + '. Confira antes de incluir.</div>'
        : '<div class="msg ok" style="margin-bottom:12px">Nenhum condomínio com este ID ou CNPJ na Carteira.</div>') +
        '<div class="grade-3">' + c('codigo', 'ID Vouch', { ajuda: 'Da etapa Cadastro no sistema.' }) + c('nome', 'Nome na Carteira', { ajuda: 'Sugerido a partir da razão social.' }) + c('situacao', 'Situação') +
        c('razao_social', 'Razão social', { span: 2 }) + c('cnpj', 'CNPJ') + c('comarca', 'UF') + c('vencimento', 'Vencimento') + c('inicio_contrato', 'Início do contrato (vigência)', { tipo: 'date' }) +
        c('administradora', 'Administradora') + selCr('k_forma_envio', 'Forma de envio do boleto', dd.forma_envio, [['', 'Escolha'], ['E-MAIL', 'E-mail'], ['IMPRESSO', 'Impresso'], ['IMPRESSO/E-MAIL', 'Impresso/E-mail']]) + c('executivo', 'Executivo') + '</div>' +
        '<label class="rot" for="k_observacoes" style="margin-top:12px">Observações</label><textarea class="campo" id="k_observacoes" rows="2">' + esc(dd.observacoes) + '</textarea>' +
        '<div class="ajuda">Analista de cobrança, extrajudicial e assistente de crédito são escolhidos depois, na ficha do condomínio na Carteira.</div>',
      pe: '<button class="btn ghost" data-fechar>Ainda não</button><button class="btn primary" id="kOk">Confirmar e incluir na Carteira</button>',
    });
    $('#kOk', mo).onclick = async function () {
      var dados = {};
      Object.keys(dd).forEach(function (k) { var el = $('#k_' + k, mo); dados[k] = el ? el.value.trim() : dd[k]; });
      try { await api('POST', '/api/implantacoes/' + i.id + '/carteira', { dados: dados }); mo.fechar(); toast('Condomínio incluído na Carteira.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
    };
  }

  /* ---------- detalhe ---------- */
  async function paginaImplantacaoDetalhe(id) {
    definirBarra('<span class="setor">Implantação</span><span class="sep">/</span><span class="nome">…</span>');
    $('#conteudo').innerHTML = carregandoHtml();
    var d, m, parceiros = { parceiros: [] };
    try {
      d = await api('GET', '/api/implantacoes/' + id);
      m = await carregarMetaImp();
      if (d.pode.editar) parceiros = await api('GET', '/api/implantacoes/parceiros');
    } catch (e) {
      $('#conteudo').innerHTML = '<div class="pagina"><div class="vazio">' + esc(e.message) + '<br><a class="btn ghost" style="margin-top:14px" href="#/implantacao">Voltar</a></div></div>';
      return;
    }
    var i = d.implantacao, pd = d.pode;
    var recarregar = function () { paginaImplantacaoDetalhe(id); atualizarImp(); };
    var acoes = '<a class="btn ghost sm" href="#/implantacao">Voltar</a>' +
      '<a class="btn ghost sm" href="/api/implantacoes/' + i.id + '/formulario.pdf" target="_blank" rel="noopener" title="Exportar o formulário em PDF">' + IC.documento + 'PDF</a>';
    // cancelar fica fora da barra enquanto o setor conduz (a barra tem as ações do dia a dia)
    if (pd.cancelar && ['em_implantacao', 'concluida'].indexOf(i.etapa) < 0) acoes += '<button class="btn danger sm" id="btCancImp">Cancelar</button>';
    if (pd.designar) acoes += '<button class="btn ' + (i.responsavel_id ? 'ghost' : 'primary') + ' sm" id="btDesigImp">' + (i.responsavel_id ? 'Redesignar' : 'Designar') + '</button>';
    if (pd.iniciar) acoes += '<button class="btn primary sm" id="btIniImp">Iniciar implantação</button>';
    if (pd.pendencia) acoes += '<button class="btn ghost sm" id="btPendImp">Devolver com pendência</button>';
    if (pd.concluir) acoes += '<button class="btn primary sm" id="btConclImp"' + (d.faltas_etapas.length ? ' disabled title="' + esc(d.faltas_etapas.join(' ')) + '"' : '') + '>Concluir implantação</button>';
    if (pd.carteira) acoes += '<button class="btn primary sm" id="btCartImp">Confirmar na Carteira</button>';
    definirBarra('<span class="setor">Implantação</span><span class="sep">/</span><span class="nome">' + esc(i.protocolo || 'Rascunho') + '</span>', acoes);
    var difs = {};
    d.diferencas.forEach(function (x) { difs[x.campo] = x; });
    var fmtDif = function (x) {
      var f = /R\$/.test(x.rotulo) ? reais : /%/.test(x.rotulo) ? pctCr : fmtNumCr;
      return typeof x.valor === 'number' ? f(x.valor) + ' (análise: ' + f(x.analise) + ')' : x.valor + ' (análise: ' + x.analise + ')';
    };

    var html = '<div class="pagina"><div class="linha" style="align-items:flex-start;margin-bottom:16px"><div style="flex:1 1 420px">' +
      '<div class="linha" style="margin-bottom:6px">' + etqCr(ETAPA_IMP, i.etapa) +
      (i.analise_id ? '<a class="etiqueta azul" href="#/credito/' + i.analise_id + '">da análise ' + esc(i.analise_protocolo || '') + '</a>' : '<span class="etiqueta cinza">' + esc(origemImp(i)) + '</span>') +
      (i.executivo_nome ? '<span class="etiqueta cinza">' + esc(i.executivo_nome + (i.executivo_uf ? ' · ' + i.executivo_uf : '')) + '</span>' : '') + '</div>' +
      '<h1>' + esc(i.condominio || 'Nova implantação') + '</h1><p class="sub" style="margin:0">' + esc([i.cnpj, i.uf, i.responsavel_nome ? 'Responsável: ' + i.responsavel_nome : ''].filter(Boolean).join(' · ')) + '</p></div>' +
      '<dl class="info-ticket" style="min-width:260px">' + (i.protocolo ? '<dt>Protocolo</dt><dd>' + esc(i.protocolo) + '</dd>' : '') +
      (i.enviado_em ? '<dt>Enviada ao setor</dt><dd>' + dataHoraCr(i.enviado_em) + '</dd>' : '') + '<dt>Pedida por</dt><dd>' + esc(i.solicitante_nome || '—') + '</dd>' +
      (i.responsavel_nome ? '<dt>Conduz</dt><dd>' + esc(i.responsavel_nome) + '</dd>' : '') +
      (i.prazo_inicio && i.etapa === 'em_implantacao' ? '<dt>' + (i.iniciado_em ? 'Iniciada em' : 'Iniciar até (8h úteis)') + '</dt><dd>' + (i.iniciado_em ? dataHoraCr(i.iniciado_em) : prazoCr(i.prazo_inicio, i.etapa)) + '</dd>' : '') +
      (i.concluido_em ? '<dt>Concluída em</dt><dd>' + dataHoraCr(i.concluido_em) + '</dd>' : '') + '</dl></div>';
    html += htmlContratoImp(d);
    if (i.origem === 'entrega') html += htmlEntregaImp(d);
    if (d.diferencas.length) html += '<div class="msg aviso" style="margin-bottom:16px"><b>' + (i.origem === 'entrega' ? 'Diferente do aprovado pela diretoria' : 'Diferente da análise') + ':</b> ' + d.diferencas.map(function (x) { return esc(x.rotulo.replace(/ \((%|R\$)\)$/, '')) + ' ' + esc(fmtDif(x)); }).join('; ') + '.</div>';
    if (pd.editar && d.faltas.length) html += '<div class="msg aviso" style="margin-bottom:16px"><b>Para enviar, falta:</b><ul style="margin:6px 0 0;padding-left:18px">' + d.faltas.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    if (!pd.editar && ['rascunho', 'diretoria'].indexOf(i.etapa) < 0 && d.pendencias.length) html += '<div class="msg aviso" style="margin-bottom:16px"><b>Pendente:</b> ' + esc(d.pendencias.join('; ')) + '. O executivo recebe um lembrete por e-mail a cada dia útil até chegar.</div>';
    var ultimaPend = d.eventos.filter(function (e) { return e.tipo === 'pendencia'; }).pop();
    if (i.etapa === 'pendencia' && ultimaPend) html += '<div class="msg aviso" style="margin-bottom:16px;white-space:pre-wrap">' + esc(ultimaPend.detalhe.mensagem || '') + '</div>';
    var setorHtml = pd.interno ? htmlSetorImp(d, m) : '';
    var formHtml = '<div id="formImp" class="pilha" style="gap:18px"' + (pd.editar ? '' : ' data-leitura') + '>' + htmlFormImp(i, m, parceiros, difs) + '</div>';
    // para o setor, o formulário fica recolhido depois das etapas
    if (setorHtml && !pd.editar) formHtml = '<details class="painel"><summary class="cab-painel" style="cursor:pointer"><h2 style="display:inline">Formulário do comercial</h2></summary><div class="corpo">' + formHtml + '</div></details>';
    html += '<div class="pilha" style="gap:18px">' + setorHtml + formHtml + htmlDocsImp(d, m) +
      (pd.editar ? '<div class="linha" style="justify-content:flex-end"><span class="ajuda" style="flex:1 1 320px;margin:0">Ao enviar, o portal confere o que falta. Se estiver tudo certo, gera o protocolo e avisa a coordenação e a equipe de implantação.</span>' +
        '<button class="btn ghost" id="btSalvarImp">Salvar rascunho</button><button class="btn primary" id="btEnviarImp">' + (i.etapa === 'pendencia' ? 'Reenviar ao setor Implantação' : 'Enviar ao setor Implantação') + '</button></div>' : '') + '</div>';
    html += '<section class="painel" style="margin-top:16px"><div class="cab-painel"><h2>Histórico</h2></div><div class="corpo pilha" style="gap:8px;font-size:13px;font-weight:600;color:var(--ink-2)">' +
      d.eventos.map(function (e) {
        var x = e.detalhe || {};
        var extra = e.tipo === 'documento' || e.tipo === 'documento_removido' ? ': ' + esc(x.nome) : e.tipo === 'enviada' ? ' (' + esc(x.protocolo) + ')' : e.tipo === 'criada' && x.analise ? ' a partir da análise ' + esc(x.analise)
          : e.tipo === 'designada' ? ' para ' + esc(x.para) : e.tipo === 'pendencia' ? ': ' + esc((x.itens || []).join('; ')) : e.tipo === 'carteira' ? ' (ID ' + esc(x.codigo) + ')'
            : e.tipo === 'parceiros' ? (x.criado ? ': ' + esc(x.criado) : x.ja_existia ? ': já existia ' + esc(x.ja_existia) : ': parceiro sem cadastro') : '';
        return '<div><b style="color:var(--ink)">' + dataHoraCr(e.criado_em) + '</b> · ' + esc(e.usuario_nome || 'Sistema') + ' ' + (EVENTO_IMP[e.tipo] || esc(e.tipo)) + extra + '</div>';
      }).join('') + '</div></section></div>';
    $('#conteudo').innerHTML = html;
    var raiz = $('#formImp');
    ligarCondicoesImp(raiz);
    ligarDocsImp(i, recarregar);
    if ($('#btCancImp')) $('#btCancImp').onclick = async function () {
      if (!(await confirmar('Cancelar implantação', 'A implantação fica no histórico como cancelada' + (i.analise_id ? ' e a análise volta a ficar disponível' : '') + '.', 'Cancelar implantação', true))) return;
      try { await api('POST', '/api/implantacoes/' + i.id + '/cancelar', {}); location.hash = '#/implantacao'; } catch (e) { toast(e.message, 'erro'); }
    };
    if ($('#btDesigImp')) $('#btDesigImp').onclick = function () {
      if (!m.equipe.length) { toast('Ninguém no setor Implantação ainda: inclua a equipe no cadastro das pessoas.', 'erro'); return; }
      var mo = modal({ titulo: i.responsavel_id ? 'Redesignar a implantação' : 'Designar a implantação', corpo: selCr('mDesig', 'Quem conduz', i.responsavel_id || m.equipe[0].id, m.equipe.map(function (x) { return [x.id, x.nome]; })) +
        '<div class="ajuda">A pessoa é avisada no sino e por e-mail e tem ' + m.horas_para_iniciar + 'h úteis para iniciar.</div>',
        pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="mDesigOk">Designar</button>' });
      $('#mDesigOk', mo).onclick = async function () {
        try { await api('POST', '/api/implantacoes/' + i.id + '/designar', { usuario_id: Number($('#mDesig', mo).value) }); mo.fechar(); toast('Designada.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
      };
    };
    if ($('#btIniImp')) $('#btIniImp').onclick = async function () { try { await api('POST', '/api/implantacoes/' + i.id + '/iniciar', {}); toast('Implantação iniciada.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); } };
    if ($('#btEtapasImp')) $('#btEtapasImp').onclick = async function () {
      try { var r = await api('PATCH', '/api/implantacoes/' + i.id + '/etapas', { etapas: lerEtapasImp() }); toast(r.faltas.length ? 'Etapas salvas. Falta: ' + r.faltas.length + '.' : 'Etapas salvas: pronta para concluir.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
    };
    if ($('#btPendImp')) $('#btPendImp').onclick = function () {
      var mo = modal({ titulo: 'Devolver ao comercial com pendência', corpo: '<label class="rot" for="mPendImp">O que falta — um item por linha</label><textarea class="campo" id="mPendImp" rows="6"></textarea><div class="ajuda">O executivo recebe a lista no portal e por e-mail. Quando reenviar, volta para você.</div>',
        pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="mPendImpOk">Devolver</button>' });
      $('#mPendImpOk', mo).onclick = async function () {
        try { await api('POST', '/api/implantacoes/' + i.id + '/pendencia', { itens: $('#mPendImp', mo).value.split(/\n/) }); mo.fechar(); toast('Devolvida ao comercial.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
      };
    };
    if ($('#btConclImp')) $('#btConclImp').onclick = async function () {
      var parc = (i.formulario.parceria === 'sim' && (i.formulario.parceiros || []).length) ? ' Como há parceria, o setor Parceiros é avisado e o condomínio entra na Prestação de Contas ligado ao parceiro (comissão a definir).' : '';
      if (!(await confirmar('Concluir a implantação', 'A coordenação é avisada para confirmar a entrada na Carteira.' + parc, 'Concluir'))) return;
      try { await api('POST', '/api/implantacoes/' + i.id + '/concluir', {}); toast('Implantação concluída.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
    };
    if ($('#btCartImp')) $('#btCartImp').onclick = function () { confirmarCarteiraImp(i, recarregar); };
    if ($('#btPedirDir')) $('#btPedirDir').onclick = async function () {
      try {
        await api('PATCH', '/api/implantacoes/' + i.id, { formulario: lerFormImp(parceiros) });
        await api('POST', '/api/implantacoes/' + i.id + '/diretoria', {});
        toast('Enviado à diretoria.', 'ok'); recarregar();
      } catch (e) { toast(e.message, 'erro'); recarregar(); }
    };
    var decidir = async function (aprovar) {
      try { await api('POST', '/api/implantacoes/' + i.id + '/aprovacao', { aprovar: aprovar, taxa_adm: numCr($('#dTaxa').value), boleto: numCr($('#dBol').value), observacao: $('#dObs').value }); toast(aprovar ? 'Aprovado; o executivo foi avisado.' : 'Não aprovado; o executivo foi avisado.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
    };
    if ($('#btDirSim')) $('#btDirSim').onclick = function () { decidir(true); };
    if ($('#btDirNao')) $('#btDirNao').onclick = function () { decidir(false); };
    if (!pd.editar) {
      $$('input, select, textarea, button', raiz).forEach(function (el) { el.disabled = true; });
      $$('[data-tirar], [data-tirar-parceiro], [data-tirar-contato], #btExtraImp, #btParcImp, #btContatoImp', raiz).forEach(function (el) { el.hidden = true; });
      return;
    }
    var ligarTirar = function () {
      $$('#tbExtrasImp [data-tirar]').forEach(function (b) { b.onclick = function () { b.closest('tr').remove(); }; });
      $$('[data-tirar-parceiro]').forEach(function (b) { b.onclick = function () { if ($$('[data-linha-parceiro]').length > 1) b.closest('[data-linha-parceiro]').remove(); else $$('select, input', b.closest('[data-linha-parceiro]')).forEach(function (x) { x.value = ''; }); }; });
      $$('[data-tirar-contato]').forEach(function (b) { b.onclick = function () { b.closest('[data-contato]').remove(); }; });
    };
    ligarTirar();
    // o que vem das condições fechadas no contrato (taxa, boleto, desconto, início, vencimento, honorários, garantias e cashback) não se altera aqui
    if (d.contrato && d.contrato.fechado) {
      var fImp = $('#formImp');
      $$(CAMPOS_CONTRATO_IMP, fImp).forEach(function (el) { el.disabled = true; el.title = 'Vem das condições fechadas no contrato'; });
      var cond = $('#i_taxa_adm', fImp);
      var sec = cond && cond.closest('section');
      if (sec) $('.cab-painel', sec).insertAdjacentHTML('beforeend', '<span class="etiqueta azul">do contrato ' + esc(d.contrato.protocolo || '') + ': não pode ser alterado</span>');
    }
    $('#btExtraImp').onclick = function () { $('#tbExtrasImp').insertAdjacentHTML('beforeend', linhaExtraCr()); ligarTirar(); };
    $('#btParcImp').onclick = function () { $('#parceirosImp').insertAdjacentHTML('beforeend', linhaParceiroImp({}, parceiros.parceiros || [])); ligarTirar(); };
    $('#btContatoImp').onclick = function () { $('#contatosImp').insertAdjacentHTML('beforeend', linhaContatoImp()); ligarTirar(); };
    var salvar = async function () { await api('PATCH', '/api/implantacoes/' + i.id, { formulario: lerFormImp(parceiros) }); };
    $('#btSalvarImp').onclick = async function () { try { await salvar(); toast('Rascunho salvo.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); } };
    $('#btEnviarImp').onclick = async function () {
      try {
        await salvar();
        var r = await api('POST', '/api/implantacoes/' + i.id + '/enviar', {});
        toast('Enviada: protocolo ' + r.protocolo + (r.pendencias.length ? '. Pendente: ' + r.pendencias.join('; ') : '') + '.', 'ok');
        recarregar();
      } catch (e) { toast(e.message, 'erro'); recarregar(); }
    };
  }

  /* ======================= Solicitação de Contrato ======================= */
  var metaCt = null;
  var resumoCt = null;
  var ETAPA_CT = {
    rascunho: ['Rascunho', 'cinza'], fila: ['Na fila do Jurídico', 'azul'], em_elaboracao: ['Em elaboração', 'azul'], pendencia: ['Pendência com o comercial', 'ambar'],
    minuta_enviada: ['Minuta com o comercial', 'azul'], para_assinar: ['Pronto para assinatura', 'ambar'], em_assinatura: ['Em assinatura', 'azul'],
    conferencia: ['Assinado · registrar condições', 'ambar'], assinado: ['Assinado', 'verde'], cancelada: ['Cancelada', 'cinza'],
  };
  // as três telas do Jurídico no menu: pedir e assumir, acompanhar até a assinatura, e os números
  var SECOES_CT = {
    solicitacao: { titulo: 'Solicitação de Contrato', rota: '#/contratos', abas: [['minhas', 'Minhas solicitações'], ['fila', 'Fila do Jurídico'], ['diretoria', 'Diretoria'], ['equipe', 'Quem elabora']],
      sub: 'O comercial pede a minuta com as condições negociadas e o Jurídico assume e redige em até 72h úteis.' },
    acompanhamento: { titulo: 'Acompanhamento de demandas Jurídicas', rota: '#/acompanhamento-contratos', abas: [['assinaturas', 'Assinaturas'], ['controle', 'Controle']],
      sub: 'A minuta vai e volta até a assinatura, e a advogada registra as condições fechadas. Depois, o executivo solicita a implantação, que vem com essas condições.' },
    painel: { titulo: 'Dashboard Jurídico', rota: '#/dashboard-juridico', abas: [['painel', 'Dashboard Jurídico']],
      sub: 'Contratos solicitados, em alteração, aguardando o executivo, em assinatura e fechados, por mês e por ano.' },
  };
  var EVENTO_CT = {
    criada: 'criou a solicitação', formulario: 'alterou o formulário', documento: 'anexou um documento', documento_removido: 'removeu um documento',
    enviada: 'enviou ao Jurídico', reenviada: 'reenviou depois da pendência', assumida: 'assumiu a solicitação', passada: 'passou a solicitação',
    pendencia: 'devolveu com pendência', minuta_enviada: 'enviou a minuta', ajuste: 'pediu ajuste na minuta', assinatura_pedida: 'informou que o síndico aprovou e pediu a assinatura',
    em_assinatura: 'mandou para assinatura', assinado: 'marcou o contrato como assinado',
    fechado: 'registrou as condições fechadas', fechado_corrigido: 'corrigiu as condições fechadas', implantacao_solicitada: 'solicitou a implantação', cancelada: 'cancelou', diretoria_aprovou: 'aprovou (diretoria)', diretoria_recusou: 'não aprovou (diretoria)',
  };
  var DESC_CT = { nenhum: 'Não possui', percentual: 'Percentual', valor: 'Valor por unidade' };

  async function carregarMetaCt(forcar) {
    if (!metaCt || forcar) metaCt = await api('GET', '/api/contratos/meta');
    return metaCt;
  }
  async function atualizarCt() {
    try { resumoCt = await api('GET', '/api/contratos/resumo'); } catch (e) { return; }
    desenharContadorCt();
  }
  function desenharContadorCt() {
    var b = $('#nav [data-contador=contratos]');
    if (!b || !resumoCt) return;
    var r = resumoCt;
    var n = (r.fila || 0) + (r.minhas || 0) + (r.diretoria || 0) + (r.retorno || 0);
    b.textContent = n;
    b.hidden = !n;
    b.title = [r.fila ? r.fila + ' na fila' : '', r.minhas ? r.minhas + ' com você' : '',
      r.diretoria ? r.diretoria + ' para a diretoria decidir' : '', r.retorno ? r.retorno + ' com você (minuta ou pendência)' : ''].filter(Boolean).join(' · ');
    var a = $('#nav [data-contador=contratos-acomp]');
    if (!a) return;
    var na = (r.para_assinar || 0) + (r.conferencia || 0);
    a.textContent = na;
    a.hidden = !na;
    a.title = [r.para_assinar ? r.para_assinar + ' pronto(s) para assinatura' : '', r.conferencia ? r.conferencia + ' aguardando as condições fechadas' : ''].filter(Boolean).join(' · ');
  }
  function origemCt(c) {
    if (c.origem === 'analise') return 'Análise ' + (c.analise_protocolo || '');
    return c.origem === 'pdf' ? 'Análise anterior ao portal' + (c.analise_protocolo ? ' · ' + c.analise_protocolo : '') : 'Condomínio de entrega';
  }
  function prazoCt(c) {
    if (['fila', 'em_elaboracao'].indexOf(c.etapa) < 0 || !c.prazo) return '<span class="sec">—</span>';
    var vencido = new Date(c.prazo) < new Date();
    return '<span class="' + (vencido ? 'atraso-ct' : '') + '">' + (vencido ? 'venceu ' : 'até ') + dataHoraCr(c.prazo) + '</span>';
  }

  /* ---------- lista e abas ---------- */
  async function paginaContratos(secao, aba) {
    var m;
    try { m = await carregarMetaCt(true); } catch (e) { $('#conteudo').innerHTML = '<div class="pagina"><div class="vazio">' + esc(e.message) + '</div></div>'; return; }
    var p = m.perfil;
    var sc = SECOES_CT[secao];
    var pode = { minhas: !!p.executivo || p.admin, fila: p.elaborador, assinaturas: p.elaborador, painel: p.elaborador || p.diretoria, controle: !!p.executivo || p.elaborador || p.diretoria,
      diretoria: p.diretoria, equipe: p.gerencia_equipe };
    var abas = sc.abas.filter(function (a) { return pode[a[0]]; });
    if (!abas.length || (abas.length === 1 && abas[0][0] === 'equipe' && !p.admin)) {
      $('#conteudo').innerHTML = '<div class="pagina"><h1>' + esc(sc.titulo) + '</h1><div class="vazio">' + (secao === 'painel' ? 'O Dashboard Jurídico é de quem elabora os contratos e da diretoria.' :
        'Você ainda não tem acesso. Executivos são marcados em Análise de Crédito → Pessoas e papéis; quem elabora os contratos é marcado pela administração em Solicitação de Contrato → Quem elabora.') + '</div></div>';
      return;
    }
    if (!abas.some(function (a) { return a[0] === aba; })) {
      aba = secao === 'acompanhamento' ? (p.elaborador ? 'assinaturas' : 'controle') :
        p.elaborador ? 'fila' : p.executivo || p.admin ? 'minhas' : p.diretoria && resumoCt && resumoCt.diretoria ? 'diretoria' : abas[0][0];
      if (!abas.some(function (a) { return a[0] === aba; })) aba = abas[0][0];
    }
    definirBarra('<span class="setor">Jurídico</span><span class="sep">/</span><span class="nome">' + esc(sc.titulo) + (abas.length > 1 ? ' · ' + esc(abas.find(function (a) { return a[0] === aba; })[1]) : '') + '</span>');
    var novo = (p.executivo || p.admin) && aba === 'minhas';
    $('#conteudo').innerHTML = '<div class="pagina"><div class="linha" style="align-items:flex-end;margin-bottom:6px"><div style="flex:1 1 420px"><h1>' + esc(sc.titulo) + '</h1>' +
      '<p class="sub" style="margin:0">' + esc(sc.sub) + '</p></div>' +
      (novo ? '<button class="btn primary" id="btNovoCt">' + IC.mais + 'Nova solicitação</button>' : '') + '</div>' +
      (abas.length > 1 ? '<nav class="abas" style="margin-top:16px">' + abas.map(function (a) { return '<a href="' + sc.rota + '/' + a[0] + '" class="' + (a[0] === aba ? 'on' : '') + '">' + esc(a[1]) + '</a>'; }).join('') + '</nav>' : '') +
      '<div id="corpoCt"' + (abas.length > 1 ? '' : ' style="margin-top:16px"') + '></div></div>';
    if ($('#btNovoCt')) $('#btNovoCt').onclick = novoContrato;
    atualizarCt();
    if (aba === 'equipe') return abaEquipeCt();
    if (aba === 'controle') return abaControleCt(m);
    if (aba === 'assinaturas') return abaAssinaturasCt();
    if (aba === 'painel') return abaPainelCt();
    $('#corpoCt').innerHTML = '<div class="painel"><div class="cab-painel"><input class="campo" id="qCt" type="search" placeholder="Buscar por condomínio, CNPJ ou protocolo" style="max-width:360px"></div>' +
      '<div class="tabela-wrap"><table style="min-width:960px"><thead><tr><th>Protocolo</th><th>Condomínio</th><th>Origem</th><th>Executivo</th><th>Situação</th><th>Com quem</th><th>Prazo da minuta</th></tr></thead><tbody id="tbCt"></tbody></table></div></div>';
    var seq = 0;
    async function carregar() {
      var meu = ++seq;
      var q = $('#qCt').value.trim();
      var r;
      try { r = await api('GET', '/api/contratos?vis=' + aba + (q ? '&q=' + encodeURIComponent(q) : '')); } catch (e) { toast(e.message, 'erro'); return; }
      if (meu !== seq) return;
      $('#tbCt').innerHTML = r.contratos.map(linhaCt).join('') || '<tr><td colspan="7"><div class="vazio" style="border:0;padding:34px">' + (aba === 'minhas' ? 'Você ainda não pediu contratos.' : 'Nada por aqui.') + '</div></td></tr>';
      $$('#tbCt tr[data-id]').forEach(function (tr) { tr.onclick = function () { location.hash = '#/contratos/' + tr.getAttribute('data-id'); }; });
    }
    var espera;
    $('#qCt').oninput = function () { clearTimeout(espera); espera = setTimeout(carregar, 300); };
    carregar();
  }
  function comQuemCt(c) {
    if (['rascunho', 'pendencia', 'minuta_enviada'].indexOf(c.etapa) >= 0) return 'Executivo';
    if (c.etapa === 'em_assinatura') return 'Síndico' + (c.assinatura_plataforma ? '<span class="sec">' + esc(c.assinatura_plataforma) + '</span>' : '');
    if (c.etapa === 'fila') return '<span class="sec">ninguém assumiu</span>';
    if (['assinado', 'cancelada'].indexOf(c.etapa) >= 0) return '<span class="sec">—</span>';
    return esc(c.responsavel_nome || 'Jurídico');
  }
  function linhaCt(c) {
    return '<tr class="clicavel" data-id="' + c.id + '"><td style="white-space:nowrap"><b>' + esc(c.protocolo || 'Rascunho') + '</b><span class="sec">' + dataHoraCr(c.enviado_em || c.criado_em) + '</span></td>' +
      '<td><b>' + esc(c.condominio || 'Sem nome') + '</b>' + (c.sem_convencao && ['cancelada', 'assinado'].indexOf(c.etapa) < 0 ? ' ' + etq(['sem convenção', 'vermelha']) : '') + '<span class="sec">' + esc(c.uf || '') + '</span></td>' +
      '<td style="white-space:nowrap">' + esc(origemCt(c)) + '</td><td>' + esc(c.executivo_nome || '—') + '</td><td>' + etqCr(ETAPA_CT, c.etapa) +
      (c.diretoria === 'aguardando' ? ' ' + etq(['diretoria', 'ambar']) : '') + (c.ajustes ? '<span class="sec">' + c.ajustes + ' ajuste(s)</span>' : '') + '</td>' +
      '<td>' + comQuemCt(c) + '</td><td style="white-space:nowrap">' + prazoCt(c) + '</td></tr>';
  }

  /* ---------- controle ---------- */
  async function abaControleCt(m) {
    var filtro = { etapa: '', executivo: '' };
    $('#corpoCt').innerHTML = '<div id="tilesCt" class="tiles" style="margin-bottom:16px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))"></div>' +
      '<div class="painel"><div class="cab-painel"><input class="campo" id="qCtc" type="search" placeholder="Buscar por condomínio, CNPJ ou protocolo" style="max-width:320px">' +
      '<select class="campo" id="fEtapaCt" style="width:auto" aria-label="Etapa"><option value="">Todas as etapas</option>' + Object.keys(ETAPA_CT).filter(function (k) { return k !== 'rascunho'; }).map(function (k) { return '<option value="' + k + '">' + esc(ETAPA_CT[k][0]) + '</option>'; }).join('') + '</select>' +
      (m.executivos.length > 1 ? '<select class="campo" id="fExecCt" style="width:auto" aria-label="Executivo"><option value="">Todos os executivos</option>' + m.executivos.map(function (x) { return '<option value="' + x.id + '">' + esc(x.nome) + '</option>'; }).join('') + '</select>' : '') + '</div>' +
      '<div class="tabela-wrap"><table style="min-width:1080px"><thead><tr><th>Protocolo</th><th>Condomínio</th><th>Executivo</th><th>Situação</th><th>Com quem</th><th>Prazo da minuta</th><th>Ajustes</th><th>1ª minuta</th><th>Assinado</th><th>Condições</th></tr></thead><tbody id="tbCtc"></tbody></table></div></div>';
    var seq = 0;
    async function carregar() {
      var meu = ++seq;
      var q = $('#qCtc').value.trim();
      var r;
      try { r = await api('GET', '/api/contratos?vis=controle' + (q ? '&q=' + encodeURIComponent(q) : '') + (filtro.etapa ? '&etapa=' + filtro.etapa : '') + (filtro.executivo ? '&executivo=' + filtro.executivo : '')); } catch (e) { toast(e.message, 'erro'); return; }
      if (meu !== seq) return;
      var k = r.contadores;
      var tile = function (rot, n, alerta) { return '<div class="tile' + (alerta && n ? ' alerta' : '') + '"><span class="rot-tile">' + rot + '</span><b>' + n + '</b></div>'; };
      $('#tilesCt').innerHTML = tile('Na fila', k.fila) + tile('Em elaboração', k.em_elaboracao) + tile('Com o comercial', k.minuta_enviada + k.pendencia) +
        tile('Pronto para assinatura', k.para_assinar) + tile('Em assinatura', k.em_assinatura) +
        tile('Aguardando condições fechadas', k.conferencia) + tile('Assinados no mês', k.assinados_mes) + tile('Passaram do prazo', k.atrasados, true);
      $('#tbCtc').innerHTML = r.contratos.map(function (c) {
        return '<tr class="clicavel" data-id="' + c.id + '"><td style="white-space:nowrap"><b>' + esc(c.protocolo) + '</b><span class="sec">' + dataHoraCr(c.enviado_em) + '</span></td>' +
          '<td><b>' + esc(c.condominio) + '</b><span class="sec">' + esc(origemCt(c)) + '</span></td><td>' + esc(c.executivo_nome || '—') + '</td>' +
          '<td>' + etqCr(ETAPA_CT, c.etapa) + (c.diretoria === 'aguardando' ? ' ' + etq(['diretoria', 'ambar']) : '') + '</td><td>' + comQuemCt(c) + '</td>' +
          '<td style="white-space:nowrap">' + prazoCt(c) + '</td><td style="text-align:center">' + (c.ajustes || 0) + '</td>' +
          '<td style="white-space:nowrap">' + (c.primeira_minuta_em ? dataHoraCr(c.primeira_minuta_em) : '<span class="sec">—</span>') + '</td>' +
          '<td style="white-space:nowrap">' + (c.assinado_em ? dataHoraCr(c.assinado_em) : '<span class="sec">—</span>') + '</td>' +
          '<td>' + (c.fechado_em ? etq(['registradas', 'verde']) : c.etapa === 'conferencia' ? etq(['a registrar', 'ambar']) : '<span class="sec">—</span>') + '</td></tr>';
      }).join('') || '<tr><td colspan="10"><div class="vazio" style="border:0;padding:34px">Nenhuma solicitação enviada.</div></td></tr>';
      $$('#tbCtc tr[data-id]').forEach(function (tr) { tr.onclick = function () { location.hash = '#/contratos/' + tr.getAttribute('data-id'); }; });
    }
    var espera;
    $('#qCtc').oninput = function () { clearTimeout(espera); espera = setTimeout(carregar, 300); };
    $('#fEtapaCt').onchange = function () { filtro.etapa = this.value; carregar(); };
    if ($('#fExecCt')) $('#fExecCt').onchange = function () { filtro.executivo = this.value; carregar(); };
    carregar();
  }

  /* ---------- quem elabora (administração) ---------- */
  async function abaEquipeCt() {
    var j;
    try { j = await api('GET', '/api/contratos/equipe'); } catch (e) { $('#corpoCt').innerHTML = '<div class="vazio">' + esc(e.message) + '</div>'; return; }
    var marcadas = j.pessoas;
    $('#corpoCt').innerHTML = '<div class="painel"><div class="cab-painel"><h2>Quem elabora os contratos</h2><input class="campo" id="qEqCt" type="search" placeholder="Buscar pessoa" style="max-width:260px;margin-left:auto"></div>' +
      '<div class="corpo" style="padding-bottom:4px"><p class="ajuda" style="margin:0">Quem está marcado recebe as solicitações (sino e e-mail), assume, redige a minuta, responde aos ajustes e registra as condições fechadas. ' +
      (j.pessoas.length ? '' : '<b>Ninguém marcado ainda: enquanto isso, a administração recebe.</b>') + '</p></div>' +
      '<div class="tabela-wrap"><table><thead><tr><th>Pessoa</th><th>Setor Jurídico</th><th style="text-align:center">Elabora contratos</th></tr></thead><tbody id="tbEqCt">' +
      j.usuarios.map(function (u) {
        return '<tr data-u="' + u.id + '"><td><b>' + esc(u.nome) + '</b><span class="sec">' + esc(u.email) + '</span></td><td>' + (u.juridico ? etq(['Jurídico', 'azul']) : '<span class="sec">—</span>') + '</td>' +
          '<td style="text-align:center"><input type="checkbox" data-eq="' + u.id + '"' + (marcadas.indexOf(u.id) >= 0 ? ' checked' : '') + ' aria-label="' + esc(u.nome) + ' elabora contratos"></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    $('#qEqCt').oninput = function () { var q = normal(this.value); $$('#tbEqCt tr').forEach(function (tr) { tr.hidden = q && normal(tr.textContent).indexOf(q) < 0; }); };
    $$('[data-eq]').forEach(function (c) {
      c.onchange = async function () {
        var lista = $$('[data-eq]:checked').map(function (x) { return Number(x.getAttribute('data-eq')); });
        try { await api('PUT', '/api/contratos/equipe', { pessoas: lista }); metaCt = null; toast('Salvo.', 'ok'); } catch (e) { toast(e.message, 'erro'); abaEquipeCt(); }
      };
    });
  }

  /* ---------- nova solicitação: de onde vem ---------- */
  async function novoContrato() {
    var j;
    try { j = await api('GET', '/api/contratos/analises'); } catch (e) { toast(e.message, 'erro'); return; }
    function linhaAn(a) {
      var vencida = a.dias > j.validade_proposta;
      return '<label class="opcao-radio" style="align-items:center;flex-wrap:wrap;margin:0;border-radius:0;border-width:0 0 1px"><input type="radio" name="anCt" value="' + a.id + '">' +
        '<div style="flex:1 1 260px"><b>' + esc(a.protocolo) + ' · ' + esc(a.condominio) + '</b><span>' + esc(RES_CR[a.resultado] ? RES_CR[a.resultado][0] : '') + ' · ' + pctCr(a.taxa_adm) + ' + boleto ' + reais(a.boleto) +
        ' · liberada há ' + a.dias + ' dia(s)</span></div>' + (vencida ? etq(['proposta vencida: confira as condições', 'ambar']) : etq(['dentro dos ' + j.validade_proposta + ' dias da proposta', 'verde'])) + '</label>';
    }
    var mo = modal({
      titulo: 'Nova solicitação de contrato', largo: true,
      corpo: '<span class="rot">De onde vem este condomínio?</span><div class="grade-3" style="margin-bottom:14px">' +
        '<label class="opcao-radio"><input type="radio" name="origCt" value="analise" checked><div><b>A partir de uma Análise de Crédito</b><span>Os dados da análise vêm preenchidos e podem ser ajustados.</span></div></label>' +
        '<label class="opcao-radio"><input type="radio" name="origCt" value="pdf"><div><b>Análise feita antes do portal</b><span>Anexe o PDF do retorno; o portal lê os dados.</span></div></label>' +
        '<label class="opcao-radio"><input type="radio" name="origCt" value="entrega"><div><b>Condomínio de entrega</b><span>Sem análise de crédito: a diretoria aprova taxa e boleto antes da minuta.</span></div></label></div>' +
        '<div data-orig="analise"><span class="rot">Suas análises aprovadas ou com ressalvas, sem contrato pedido</span>' +
        '<div class="painel" style="box-shadow:none;overflow:hidden">' + (j.analises.map(linhaAn).join('') || '<div class="vazio" style="border:0;padding:24px">Nenhuma análise liberada disponível. As reprovadas e as que já têm contrato pedido não aparecem.</div>') + '</div></div>' +
        '<div data-orig="pdf" hidden><label class="btn ghost" style="align-self:flex-start">' + IC.enviar + 'Escolher o PDF do retorno<input type="file" id="arqPdfCt" accept="application/pdf" hidden></label><div id="lidoPdfCt" style="margin-top:12px"></div></div>' +
        '<div data-orig="entrega" hidden><div class="msg aviso">Preencha o condomínio, o síndico e as condições propostas e envie: o Jurídico recebe e a diretoria é avisada para aprovar a taxa administrativa e o boleto antes da minuta. Sem CNPJ, anexe a ata da assembleia que autorizou a contratação.</div></div>',
      pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="mCtOk">Continuar para o formulário</button>',
    });
    var origem = function () { return $('input[name=origCt]:checked', mo).value; };
    $$('input[name=origCt]', mo).forEach(function (r) { r.onchange = function () { $$('[data-orig]', mo).forEach(function (x) { x.hidden = x.getAttribute('data-orig') !== origem(); }); }; });
    var arquivoPdf = null, lido = null;
    async function enviarPdf(acao) {
      var r = await fetch('/api/contratos/pdf?acao=' + acao, { method: 'POST', credentials: 'same-origin', body: arquivoPdf,
        headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': encodeURIComponent(arquivoPdf.name) } });
      var j2 = {};
      try { j2 = await r.json(); } catch (e) { /* sem JSON */ }
      if (!r.ok) throw new Error(j2.erro || 'Falha ao ler o PDF.');
      return j2;
    }
    $('#arqPdfCt', mo).onchange = async function () {
      arquivoPdf = this.files[0];
      if (!arquivoPdf) return;
      $('#lidoPdfCt', mo).innerHTML = '<span class="ajuda">Lendo o PDF…</span>';
      try {
        lido = await enviarPdf('ler');
        var l = lido.lido;
        $('#lidoPdfCt', mo).innerHTML = '<div class="pilha" style="gap:10px">' +
          (lido.existente ? '<div class="msg erro">Esta análise já tem solicitação de contrato (' + esc(lido.existente) + ').</div>' : '') +
          (lido.no_portal ? '<div class="msg aviso">Esta análise está no portal: use a origem "A partir de uma Análise de Crédito".</div>' : '') +
          (['aprovada', 'ressalvas'].indexOf(l.resultado) < 0 ? '<div class="msg erro">Só análise aprovada ou com ressalvas abre solicitação de contrato.</div>' : '') +
          (lido.dias > lido.validade_proposta ? '<div class="msg aviso">Análise de ' + dataBr(l.data) + ': a proposta vale ' + lido.validade_proposta + ' dias. Confira as condições.</div>' : '') +
          '<dl class="info-ticket"><dt>Protocolo</dt><dd>' + esc(l.protocolo) + ' · ' + dataBr(l.data) + '</dd><dt>Condomínio</dt><dd>' + esc(l.razao_social) + (l.cnpj ? ' · ' + esc(l.cnpj) : '') + '</dd>' +
          '<dt>Status</dt><dd>' + (l.resultado ? etqCr(RES_CR, l.resultado) : '—') + '</dd><dt>Taxa e boleto</dt><dd>' + (l.taxa_adm != null ? pctCr(l.taxa_adm) + ' + ' + reais(l.boleto) : '—') + '</dd></dl></div>';
      } catch (e) { lido = null; $('#lidoPdfCt', mo).innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>'; }
    };
    $('#mCtOk', mo).onclick = async function () {
      try {
        var r;
        if (origem() === 'entrega') r = await api('POST', '/api/contratos', { origem: 'entrega' });
        else if (origem() === 'pdf') {
          if (!arquivoPdf || !lido) { toast('Escolha o PDF do retorno da análise.', 'erro'); return; }
          r = await enviarPdf('criar');
        } else {
          var sel = $('input[name=anCt]:checked', mo);
          if (!sel) { toast('Escolha a análise.', 'erro'); return; }
          r = await api('POST', '/api/contratos', { origem: 'analise', analise_id: Number(sel.value) });
        }
        mo.fechar(); location.hash = '#/contratos/' + r.id;
      } catch (e) { toast(e.message, 'erro'); }
    };
  }

  /* ---------- formulário ---------- */
  function campoCt(nome, rotulo, valor, o) {
    o = o || {};
    var dif = o.dif;
    var ajuda = [o.ref != null && o.ref !== '' ? 'Análise: ' + esc(o.ref) + '.' : '', o.ajuda || ''].filter(Boolean).join(' ');
    return '<div' + (o.span ? ' style="grid-column:span ' + o.span + '"' : '') + (o.se ? ' data-se="' + o.se + '"' : '') + '><label class="rot" for="c_' + nome + '">' + esc(rotulo) + '</label>' +
      (o.area ? '<textarea class="campo" id="c_' + nome + '" rows="' + (o.linhas || 3) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '>' + esc(valor == null ? '' : valor) + '</textarea>'
        : '<input class="campo' + (dif ? ' diferente' : '') + '" id="c_' + nome + '" value="' + esc(valor == null ? '' : valor) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.tipo ? ' type="' + o.tipo + '"' : '') + '>') +
      (ajuda || dif ? '<div class="ajuda' + (dif ? ' diferente' : '') + '">' + ajuda + (dif ? ' Diferente da análise: o Jurídico vê.' : '') + '</div>' : '') + '</div>';
  }
  function selCt(nome, rotulo, valor, opcoes, o) {
    o = o || {};
    return '<div' + (o.se ? ' data-se="' + o.se + '"' : '') + '><label class="rot" for="c_' + nome + '">' + esc(rotulo) + '</label><select class="campo' + (o.dif ? ' diferente' : '') + '" id="c_' + nome + '">' +
      opcoes.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(valor == null ? '' : valor) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>' +
      (o.ref || o.ajuda ? '<div class="ajuda' + (o.dif ? ' diferente' : '') + '">' + (o.ref ? 'Análise: ' + esc(o.ref) + '.' : '') + (o.ajuda ? ' ' + o.ajuda : '') + '</div>' : '') + '</div>';
  }
  function radiosCt(nome, rotulo, valor, opcoes, o) {
    o = o || {};
    return '<fieldset style="grid-column:1/-1;border:0;padding:0;margin:0"' + (o.se ? ' data-se="' + o.se + '"' : '') + '><legend class="rot">' + esc(rotulo) + '</legend><div class="marcas">' +
      opcoes.map(function (x) { return '<label class="marca"><input type="radio" name="c_' + nome + '" value="' + esc(x[0]) + '"' + (String(x[0]) === String(valor == null ? '' : valor) ? ' checked' : '') + '> ' + esc(x[1]) + '</label>'; }).join('') +
      (o.extra || '') + '</div>' + (o.ajuda ? '<div class="ajuda">' + o.ajuda + '</div>' : '') + '</fieldset>';
  }
  function marcasCt(nome, rotulo, valores, opcoes, o) {
    o = o || {};
    return '<fieldset style="grid-column:1/-1;border:0;padding:0;margin:0"' + (o.se ? ' data-se="' + o.se + '"' : '') + '><legend class="rot">' + esc(rotulo) + '</legend><div class="marcas">' +
      opcoes.map(function (x) { return '<label class="marca"><input type="checkbox" data-marca-ct="' + nome + '" value="' + esc(x) + '"' + ((valores || []).indexOf(x) >= 0 ? ' checked' : '') + '> ' + esc(x) + '</label>'; }).join('') +
      (o.extra || '') + '</div>' + (o.ajuda ? '<div class="ajuda">' + o.ajuda + '</div>' : '') + '</fieldset>';
  }
  function valCt(nome, raiz) {
    var rad = $('input[name=c_' + nome + ']:checked', raiz);
    if (rad) return rad.value;
    var el = $('#c_' + nome, raiz);
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked;
    return el.value.trim();
  }

  function htmlFormCt(c, m, difs) {
    var f = c.formulario || {}, ref = c.origem === 'entrega' ? {} : c.referencia || {};
    var temRef = ref.taxa_adm != null;
    var r = function (v) { return temRef ? v : null; };
    var det = f.pedidos_detalhe || {};
    var pedidos = f.pedidos || [];
    var cb = String(f.cashback || '');
    return '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">1</span>Condomínio e síndico</h2>' + (temRef ? '<span class="etiqueta azul">preenchido com a análise, pode ajustar</span>' : '') + '</div><div class="corpo grade-3">' +
      (m.perfil.admin ? selCt('executivo_id', 'Executivo de negócios', c.executivo_id || '', [['', 'Escolha o executivo']].concat(m.executivos.map(function (x) { return [x.id, x.nome + (x.uf ? ' · ' + x.uf : '')]; })),
        { ajuda: 'Você está como administração: escolha em nome de qual executivo é a solicitação.' }) : '') +
      campoCt('nome', 'Nome do condomínio', f.nome, { span: m.perfil.admin ? 1 : 2 }) +
      '<div><label class="rot" for="c_cnpj">CNPJ do condomínio</label><input class="campo" id="c_cnpj" value="' + esc(f.cnpj || '') + '" placeholder="00.000.000/0000-00"' + (f.sem_cnpj ? ' disabled' : '') + '>' +
      '<label class="linha" style="margin-top:8px;font-size:13px;font-weight:700;color:var(--ink-2)"><input type="checkbox" id="c_sem_cnpj"' + (f.sem_cnpj ? ' checked' : '') + '> O condomínio ainda não tem CNPJ</label></div>' +
      '<div style="grid-column:1/-1" data-se="sem_cnpj:true"><div class="msg aviso">Sem CNPJ, o condomínio tem 90 dias da primeira arrecadação para regularizar, senão o repasse fica retido. Até lá, o repasse vai para a conta da administradora (por e-mail), nunca para a do síndico. Anexe a ata da assembleia que autorizou a contratação.</div>' +
      '<label class="linha" style="margin-top:8px;font-size:13px;font-weight:700;color:var(--ink-2)"><input type="checkbox" id="c_sem_cnpj_ciente"' + (f.sem_cnpj_ciente ? ' checked' : '') + '> O síndico está ciente dos 90 dias para regularizar o CNPJ</label></div>' +
      selCt('uf', 'Estado', f.uf || '', [['', 'Escolha']].concat(UFS.map(function (u) { return [u, u]; }))) +
      campoCt('cidade', 'Cidade', f.cidade) +
      campoCt('administradora', 'Administradora', f.administradora) +
      campoCt('sindico_nome', 'Nome do síndico', f.sindico_nome) +
      campoCt('sindico_cpf', 'CPF do síndico', f.sindico_cpf, { ph: '000.000.000-00' }) +
      campoCt('sindico_email', 'E-mail do síndico ou do condomínio', f.sindico_email, { tipo: 'email' }) +
      campoCt('sindico_telefone', 'Telefone do síndico', f.sindico_telefone, { ph: '(00) 00000-0000' }) + '</div></section>' +

      '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">2</span>Condições negociadas</h2></div><div class="corpo grade-3">' +
      campoCt('taxa_adm', 'Taxa administrativa negociada (%)', fmtNumCr(f.taxa_adm), { ref: r(pctCr(ref.taxa_adm)), dif: difs.taxa_adm }) +
      campoCt('boleto', 'Valor do boleto negociado (R$)', fmtNumCr(f.boleto), { ref: r(reais(ref.boleto)), dif: difs.boleto, ajuda: 'Pode ser reajustado uma vez por ano, com comprovação do custo bancário.' }) +
      selCt('desconto_tipo', 'Desconto de pontualidade', f.desconto_tipo || 'nenhum', [['nenhum', 'Não possui'], ['percentual', 'Percentual (%)'], ['valor', 'Valor por unidade (R$)']],
        { ref: temRef && ref.desconto_tipo ? DESC_CT[ref.desconto_tipo] + (ref.desconto_valor ? ' ' + fmtNumCr(ref.desconto_valor) : '') : null, dif: difs.desconto }) +
      campoCt('desconto_valor', 'Desconto (% ou R$)', fmtNumCr(f.desconto_valor), { se: 'desconto_tipo:percentual,valor' }) +
      marcasCt('garantias', 'O que iremos garantir (marque todos)', f.garantias, m.garantias, { extra: '<input class="campo" id="c_garantia_outra" style="max-width:240px" placeholder="Outra (descreva)" value="' + esc(f.garantia_outra || '') + '" aria-label="Outra garantia">',
        ajuda: 'Só é garantido o que está na convenção e no regimento e foi aprovado em assembleia. Multas por descumprimento do regimento e locação de ambientes a quem não é condômino não entram.' }) +
      campoCt('taxa_ordinaria', 'Taxa ordinária (R$)', fmtNumCr(f.taxa_ordinaria), { ref: temRef && ref.taxa_ordinaria != null ? reais(ref.taxa_ordinaria) : null }) +
      campoCt('taxa_extra', 'Taxa extra vigente por unidade (R$)', fmtNumCr(f.taxa_extra), { ajuda: '<span id="pctExtraCt"></span>' }) +
      radiosCt('cashback', 'Foi concedido o benefício do cashback?', cb, [['nao', 'Não'], ['5', 'Sim, 5%'], ['10', 'Sim, 10%'], ['outro', 'Outro']],
        { extra: '<input class="campo" id="c_cashback_pct" data-se="cashback:outro" style="width:110px" placeholder="%" value="' + esc(fmtNumCr(f.cashback_pct)) + '" aria-label="Percentual do cashback">' }) +
      marcasCt('cashback_receitas', 'Sobre quais receitas incide o cashback', f.cashback_receitas, m.receitas_cashback, { se: 'cashback:5,10,outro',
        extra: '<input class="campo" id="c_cashback_receita_outra" style="max-width:220px" placeholder="Outra (descreva)" value="' + esc(f.cashback_receita_outra || '') + '" aria-label="Outra receita">' }) + '</div></section>' +

      '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">3</span>Vigência</h2></div><div class="corpo grade-3">' +
      campoCt('inicio_contrato', 'Início do contrato (primeira arrecadação garantida)', f.inicio_contrato, { tipo: 'date' }) +
      campoCt('dia_vencimento', 'Dia de vencimento da taxa condominial', f.dia_vencimento, { ref: r(ref.dia_vencimento), dif: difs.dia_vencimento, ph: '1 a 31',
        ajuda: 'O boleto sai até o 5º dia útil antes; o condomínio envia a composição e o balancete até o dia 20 do mês anterior.' }) +
      '<div>' + '<label class="rot" for="c_periodo_minimo">Período mínimo (meses)</label><input class="campo" id="c_periodo_minimo" value="' + esc(f.periodo_minimo == null ? '' : f.periodo_minimo) + '" placeholder="vazio = padrão do contrato">' +
      '<label class="linha" style="margin-top:8px;font-size:13px;font-weight:700;color:var(--ink-2);flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" id="c_fidelizacao"' + (f.fidelizacao ? ' checked' : '') + '> Pedir a versão com fidelização (benefício a mais ou risco alto)</label>' +
      '<div class="ajuda">Na Paraíba, o contrato já é com fidelização.</div></div></div></section>' +

      '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">4</span>Objeções e Solicitações de modificação de contrato</h2></div><div>' +
      m.clausulas.negociaveis.filter(function (x) { return !x.antigo || pedidos.indexOf(x.chave) >= 0; }).map(function (x) {
        var on = pedidos.indexOf(x.chave) >= 0;
        return '<div class="pedido-ct"><input type="checkbox" data-pedido="' + esc(x.chave) + '"' + (on ? ' checked' : '') + ' aria-label="' + esc(x.pedido) + '">' +
          '<span class="t"><small>' + esc(x.clausula) + '</small>' + esc(x.pedido) + (x.diretoria ? ' ' + etq(['diretoria', 'ambar']) : '') + (x.juridico ? ' ' + etq(['exige o Jurídico', 'ambar']) : '') + '</span>' +
          (x.detalhe ? '<label class="det-ct" data-pedido-det-rot="' + esc(x.chave) + '"' + (on ? '' : ' hidden') + '>' + (x.exemplo ? '<span>' + esc(x.detalhe) + '</span>' : '') +
            '<input class="campo" data-pedido-det="' + esc(x.chave) + '" placeholder="' + esc(x.exemplo || x.detalhe) + '" value="' + esc(det[x.chave] || '') + '" aria-label="' + esc(x.detalhe) + '"></label>' : '') +
          '<span class="resp" data-pedido-resp="' + esc(x.chave) + '"' + (on ? '' : ' hidden') + '><b>Resposta do Jurídico:</b> ' + esc(x.resposta) + '</span></div>';
      }).join('') + '</div></section>' +

      '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">5</span>Outras solicitações</h2></div><div class="corpo">' +
      '<textarea class="campo" id="c_minucias" rows="4" aria-label="Outras solicitações">' + esc(f.minucias || '') + '</textarea></div></section>';
  }
  function lerFormCt(raiz) {
    var v = function (k) { return valCt(k, raiz); };
    var marcas = function (nome) { return $$('[data-marca-ct=' + nome + ']:checked', raiz).map(function (x) { return x.value; }); };
    var det = {};
    $$('[data-pedido-det]', raiz).forEach(function (x) { if (x.value.trim()) det[x.getAttribute('data-pedido-det')] = x.value.trim(); });
    return {
      nome: v('nome'), cnpj: v('cnpj'), sem_cnpj: $('#c_sem_cnpj', raiz).checked, sem_cnpj_ciente: $('#c_sem_cnpj_ciente', raiz).checked, uf: v('uf'), cidade: v('cidade'),
      administradora: v('administradora'), sindico_nome: v('sindico_nome'), sindico_cpf: v('sindico_cpf'), sindico_email: v('sindico_email'), sindico_telefone: v('sindico_telefone'),
      taxa_adm: numCr(v('taxa_adm')), boleto: numCr(v('boleto')), desconto_tipo: v('desconto_tipo'), desconto_valor: numCr(v('desconto_valor')),
      garantias: marcas('garantias'), garantia_outra: $('#c_garantia_outra', raiz).value.trim(), taxa_ordinaria: numCr(v('taxa_ordinaria')), taxa_extra: numCr(v('taxa_extra')),
      cashback: v('cashback'), cashback_pct: numCr($('#c_cashback_pct', raiz).value), cashback_receitas: marcas('cashback_receitas'), cashback_receita_outra: $('#c_cashback_receita_outra', raiz).value.trim(),
      inicio_contrato: v('inicio_contrato'), dia_vencimento: numCr(v('dia_vencimento')), periodo_minimo: numCr(v('periodo_minimo')), fidelizacao: $('#c_fidelizacao', raiz).checked,
      pedidos: $$('[data-pedido]:checked', raiz).map(function (x) { return x.getAttribute('data-pedido'); }), pedidos_detalhe: det, minucias: $('#c_minucias', raiz).value.trim(),
    };
  }
  function ligarFormCt(raiz) {
    function aplicar() {
      $$('[data-se]', raiz).forEach(function (el) {
        var p = el.getAttribute('data-se').split(':');
        var val = p[0] === 'sem_cnpj' ? String($('#c_sem_cnpj', raiz).checked) : valCt(p[0], raiz);
        el.hidden = p[1].split(',').indexOf(String(val)) < 0;
      });
      var cnpj = $('#c_cnpj', raiz);
      if (!raiz.hasAttribute('data-leitura')) cnpj.disabled = $('#c_sem_cnpj', raiz).checked;
      $$('[data-pedido]', raiz).forEach(function (cx) {
        var k = cx.getAttribute('data-pedido');
        $$('[data-pedido-resp="' + k + '"], [data-pedido-det-rot="' + k + '"]', raiz).forEach(function (x) { x.hidden = !cx.checked; });
      });
      var ord = numCr(valCt('taxa_ordinaria', raiz)), ext = numCr(valCt('taxa_extra', raiz));
      var alvo = $('#pctExtraCt', raiz);
      if (alvo) {
        var pc = ord > 0 && ext > 0 ? ext / ord * 100 : null;
        alvo.textContent = pc == null ? 'Some as taxas extras vigentes (R$ por unidade).' : fmtNumCr(Math.round(pc * 100) / 100) + '% da ordinária' + (pc > 40 ? ': acima de 40% precisa de aditivo, a diretoria decide.' : ' (limite: 40%).');
        alvo.parentNode.className = 'ajuda' + (pc > 40 ? ' diferente' : '');
      }
      var cpf = $('#c_sindico_cpf', raiz);
      var d = cpf.value.replace(/\D/g, '');
      var aj = cpf.parentNode.querySelector('.ajuda-cpf') || cpf.parentNode.appendChild(document.createElement('div'));
      aj.className = 'ajuda ok ajuda-cpf';
      aj.textContent = cpfValidoImp(d) ? 'CPF válido.' : '';
    }
    raiz.addEventListener('change', aplicar);
    raiz.addEventListener('input', function (e) { if (['c_sindico_cpf', 'c_taxa_ordinaria', 'c_taxa_extra'].indexOf(e.target.id) >= 0) aplicar(); });
    aplicar();
  }

  /* ---------- o que falta: campo em vermelho, com a explicação embaixo ---------- */
  function alvoFaltaCt(campo) {
    if (campo.indexOf('doc:') === 0) { var inp = $('[data-doc-ct="' + campo.slice(4) + '"]'); return inp && inp.closest('.doc-linha'); }
    if (campo === 'garantias' || campo === 'cashback_receitas') { var mc = $('[data-marca-ct="' + campo + '"]', $('#formCt')); return mc && mc.closest('fieldset'); }
    if (campo === 'cashback') { var rd = $('input[name=c_cashback]', $('#formCt')); return rd && rd.closest('fieldset'); }
    if (campo === 'sem_cnpj_ciente') { var cx = $('#c_sem_cnpj_ciente'); return cx && cx.closest('label'); }
    return $('#c_' + campo, $('#formCt'));
  }
  function marcarFaltasCt(lista) {
    $$('.invalido').forEach(function (el) { el.classList.remove('invalido'); });
    $$('.ajuda-falta').forEach(function (el) { el.remove(); });
    (lista || []).forEach(function (x) {
      var el = alvoFaltaCt(x.campo);
      if (!el || el.closest('[hidden]')) return;
      el.classList.add('invalido');
      var aj = document.createElement('div');
      aj.className = 'ajuda invalido ajuda-falta';
      aj.textContent = x.msg;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.parentNode.appendChild(aj); else if (el.tagName === 'FIELDSET') el.appendChild(aj); else el.insertAdjacentElement('afterend', aj);
    });
    var caixa = $('#faltasCt');
    if (caixa) {
      caixa.hidden = !(lista || []).length;
      $('ul', caixa).innerHTML = (lista || []).map(function (x) { return '<li><a href="#" data-ir-campo="' + esc(x.campo) + '">' + esc(x.msg) + '</a></li>'; }).join('');
      $$('[data-ir-campo]', caixa).forEach(function (a) {
        a.onclick = function (ev) {
          ev.preventDefault();
          var el = alvoFaltaCt(a.getAttribute('data-ir-campo'));
          if (!el) return;
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          var foco = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ? el : $('input, select, textarea', el);
          if (foco) setTimeout(function () { foco.focus({ preventScroll: true }); }, 350);
        };
      });
    }
  }

  /* ---------- documentos ---------- */
  async function enviarDocCt(id, tipo, arquivo) {
    var r = await fetch('/api/contratos/' + id + '/documentos', {
      method: 'POST', credentials: 'same-origin', body: arquivo,
      headers: { 'Content-Type': arquivo.type || 'application/octet-stream', 'X-Nome-Arquivo': encodeURIComponent(arquivo.name), 'X-Tipo': tipo },
    });
    if (r.status === 413) throw new Error('"' + arquivo.name + '" passa do tamanho máximo permitido.');
    if (!r.ok) { var j = {}; try { j = await r.json(); } catch (e) { /* sem JSON */ } throw new Error(j.erro || 'Falha ao enviar ' + arquivo.name); }
  }
  function htmlDocsCt(d, m) {
    var c = d.contrato, pd = d.pode, f = c.formulario || {};
    var vig = d.documentos.filter(function (x) { return !x.substituido_em; });
    var porTipo = {};
    m.documentos.forEach(function (t) { porTipo[t.tipo] = t; });
    function lnk(x) {
      var tirar = x.tipo === 'minuta' ? pd.minuta : pd.tirar_documentos && x.tipo !== 'analise_credito';
      return '<a class="anexo" href="/api/contratos/' + c.id + '/documentos/' + x.id + (x.mime === 'application/pdf' ? '?ver=1' : '') + '" target="_blank" rel="noopener">' + IC.documento + '<span>' + esc(x.nome) + '</span><span class="sec">' + tamanho(x.tamanho) + '</span></a>' +
        (tirar ? '<button type="button" class="btn icon ghost" data-tirar-doc-ct="' + x.id + '" aria-label="Remover ' + esc(x.nome) + '">' + IC.fechar + '</button>' : '');
    }
    function linha(tipo, o) {
      o = o || {};
      var t = porTipo[tipo];
      var atual = vig.filter(function (x) { return x.tipo === tipo; });
      var st = atual.length ? etq([tipo === 'analise_credito' ? 'vinculada' : 'entregue', 'verde']) : o.obrigatorio ? etq(['falta', 'vermelha'])
        : t.assinatura ? etq(['falta: necessária para assinar', 'vermelha']) : ['minuta', 'contrato_assinado'].indexOf(tipo) >= 0 ? etq(['a anexar', 'cinza']) : etq(['opcional', 'cinza']);
      var podeAnexar = t.antigo ? false : o.pode !== undefined ? o.pode : pd.documentos;
      return '<div class="doc-linha' + (t.assinatura && !atual.length ? ' invalido' : '') + '"><b style="flex:1 1 260px">' + esc(t.nome) + (o.obrigatorio ? ' <span style="color:var(--red)" aria-label="obrigatório">*</span>' : '') + '</b>' + st + atual.map(lnk).join('') +
        (podeAnexar && tipo !== 'analise_credito' ? '<label class="btn ghost sm">' + IC.enviar + (atual.length ? (tipo === 'outro' ? 'Anexar outro' : 'Trocar') : 'Anexar') + '<input type="file" data-doc-ct="' + tipo + '" hidden></label>' : '') + '</div>';
    }
    var html = '<section class="painel"><div class="cab-painel"><h2 class="titulo-passo"><span class="passo">6</span>Documentos</h2><span class="espaco"></span><span class="ajuda" style="margin:0">' +
      'os documentos do síndico (atas, cadastros, RG…) são pedidos na Implantação</span></div>';
    var daAnalise = vig.some(function (x) { return x.tipo === 'analise_credito'; });
    html += '<div class="sub-doc" style="border-top:0">' + (daAnalise ? 'Da análise e para assinar' : 'Para assinar') + '</div>' + (daAnalise ? linha('analise_credito') : '') + linha('convencao');
    if (f.sem_cnpj) html += linha('ata_ago', { obrigatorio: true });
    var depoisDaMinuta = ['minuta_enviada', 'para_assinar', 'em_assinatura', 'conferencia', 'assinado'].indexOf(c.etapa) >= 0;
    var podeAssinado = pd.documentos && ['para_assinar', 'em_assinatura', 'conferencia'].indexOf(c.etapa) >= 0;
    var juridico = depoisDaMinuta || vig.some(function (x) { return x.tipo === 'minuta'; }) || pd.minuta;
    if (juridico) html += '<div class="sub-doc">Contrato</div>' + linha('minuta', { pode: pd.minuta }) +
      (depoisDaMinuta && c.etapa !== 'minuta_enviada' ? linha('contrato_assinado', { pode: podeAssinado }) : '');
    // anexados antes de os documentos do síndico irem para a Implantação: continuam visíveis (e seguem para ela)
    var antigos = m.documentos.filter(function (t) { return t.antigo && vig.some(function (x) { return x.tipo === t.tipo; }); });
    if (antigos.length) html += '<div class="sub-doc">Anexados antes (agora pedidos na Implantação)</div>' + antigos.map(function (t) { return linha(t.tipo); }).join('');
    var antigas = d.documentos.filter(function (x) { return x.tipo === 'minuta' && x.substituido_em; });
    if (antigas.length) html += '<div class="doc-linha"><span class="ajuda" style="margin:0;flex:1 1 200px">Versões anteriores da minuta</span>' + antigas.map(function (x) {
      return '<a class="anexo" href="/api/contratos/' + c.id + '/documentos/' + x.id + '" target="_blank" rel="noopener">' + IC.historico + '<span>' + esc(x.nome) + '</span><span class="sec">' + dataHoraCr(x.enviado_em) + '</span></a>';
    }).join('') + '</div>';
    html += linha('outro') + '</section>';
    return html;
  }
  function ligarDocsCt(c, recarregar) {
    $$('input[data-doc-ct]').forEach(function (inp) {
      inp.onchange = async function () {
        if (!inp.files[0]) return;
        try { await enviarDocCt(c.id, inp.getAttribute('data-doc-ct'), inp.files[0]); toast('Documento anexado.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
      };
    });
    $$('[data-tirar-doc-ct]').forEach(function (b) {
      b.onclick = async function () {
        if (!(await confirmar('Remover documento', 'O arquivo sai desta solicitação.', 'Remover', true))) return;
        try { await api('DELETE', '/api/contratos/' + c.id + '/documentos/' + b.getAttribute('data-tirar-doc-ct')); recarregar(); } catch (e) { toast(e.message, 'erro'); }
      };
    });
  }

  /* ---------- condições fechadas (advogada) ---------- */
  var corrigindoCt = null; // contrato concluído com as condições fechadas abertas para correção
  function htmlFechadoCt(d, m) {
    var c = d.contrato, x = c.fechado || {}, corrigindo = d.pode.corrigir && corrigindoCt === c.id, edita = d.pode.registrar || corrigindo;
    var clausulas = (x.clausulas || []);
    var hon = x.honorarios == null ? '' : String(x.honorarios);
    var honOp = ['10', '12', '15', '17.5'].indexOf(hon) >= 0 ? hon : hon ? 'outro' : '';
    var corpo = '<div class="corpo grade-3">' +
      campoCt('f_taxa_adm', 'Taxa administrativa (%)', fmtNumCr(x.taxa_adm)) + campoCt('f_boleto', 'Boleto (R$)', fmtNumCr(x.boleto)) +
      selCt('f_desconto_tipo', 'Desconto de pontualidade', x.desconto_tipo || 'nenhum', [['nenhum', 'Não possui'], ['percentual', 'Percentual (%)'], ['valor', 'Valor por unidade (R$)']]) +
      campoCt('f_desconto_valor', 'Desconto (% ou R$)', fmtNumCr(x.desconto_valor), { se: 'f_desconto_tipo:percentual,valor' }) +
      campoCt('f_desconto_inicio', 'Desconto vale a partir de', x.desconto_inicio, { se: 'f_desconto_tipo:percentual,valor', ph: 'Ex.: janeiro/2027 (vazio = assinatura)' }) +
      ((x.garantias || []).indexOf('Taxa extraordinária') >= 0 ? campoCt('f_limite_extra', 'Taxa extra coberta até (% da ordinária)', fmtNumCr(x.limite_extra), { ajuda: 'O padrão é 40%.' }) : '') +
      campoCt('f_inicio_contrato', 'Início (primeira arrecadação garantida)', x.inicio_contrato, { tipo: 'date' }) +
      radiosCt('f_honorarios_op', 'Honorários de cobrança extrajudicial', honOp, [['10', '10%'], ['12', '12%'], ['15', '15%'], ['17.5', '17,50%'], ['outro', 'Outro']],
        { extra: '<input class="campo" id="c_f_honorarios_outro" data-se="f_honorarios_op:outro" style="width:110px" placeholder="%" value="' + esc(honOp === 'outro' ? fmtNumCr(x.honorarios) : '') + '" aria-label="Outro percentual de honorários">' }) +
      campoCt('f_periodo_minimo', 'Período mínimo (meses)', x.periodo_minimo, { ph: 'vazio = padrão' }) +
      selCt('f_fidelizacao', 'Cláusula 12ª', x.fidelizacao ? 'sim' : 'nao', [['nao', 'Sem fidelização'], ['sim', 'Com fidelização']]) +
      campoCt('f_foro', 'Foro', x.foro, { ph: m.foro_padrao }) + campoCt('f_prazo_contestacao', 'Prazo para contestar a prestação de contas (dias)', x.prazo_contestacao) + '</div>' +
      (clausulas.length ? '<div class="sub-doc">Cláusulas que o síndico pediu para mudar</div>' + clausulas.map(function (k, n) {
        return '<div class="clausula-ct" data-clausula="' + n + '"><div><b style="font-size:13.5px">' + esc(k.clausula) + '</b> <span style="font-size:13.5px;color:var(--ink-2)">' + esc(k.pedido) + '</span></div>' +
          '<select class="campo" data-k="resultado" aria-label="Resultado"><option value="">Como ficou?</option>' + Object.keys(m.resultados).map(function (r) { return '<option value="' + r + '"' + (k.resultado === r ? ' selected' : '') + '>' + esc(m.resultados[r]) + '</option>'; }).join('') + '</select>' +
          '<textarea class="campo" data-k="redacao" rows="2" placeholder="Redação que ficou no contrato (opcional)" aria-label="Redação">' + esc(k.redacao || '') + '</textarea></div>';
      }).join('') : '') +
      '<div class="corpo">' + campoCt('f_observacoes', 'Observações para a Implantação', x.observacoes, { area: true, ph: 'Ex.: procuração no mesmo arquivo do contrato; primeiro repasse adiantado em 5 dias.' }) + '</div>';
    var correcao = d.eventos.filter(function (e) { return e.tipo === 'fechado_corrigido'; }).pop();
    var topo = c.fechado_em ? '<span class="etiqueta verde">registradas por ' + esc(c.fechado_por_nome || '') + ' em ' + dataHoraCr(c.fechado_em) + '</span>' +
        (correcao ? '<span class="etiqueta ambar">corrigidas por ' + esc(correcao.usuario_nome || '') + ' em ' + dataHoraCr(correcao.criado_em) + '</span>' : '') +
        (d.pode.corrigir && !corrigindo ? '<span class="espaco"></span><button class="btn ghost sm" id="btCorrigirCt">' + IC.lapis + 'Corrigir condições</button>' : '')
      : '<span class="ajuda" style="margin:0">vêm do que o comercial pediu: corrija o que mudou na negociação</span>';
    return '<section class="painel" id="fechadoCt"' + (edita ? '' : ' data-leitura') + '><div class="cab-painel"><h2>Condições fechadas no contrato assinado</h2>' + topo + '</div>' +
      (d.diferencas_fechado.length ? '<div class="corpo" style="padding-bottom:0"><div class="msg aviso"><b>Mudou na negociação:</b> ' + d.diferencas_fechado.map(function (v) { return esc(v.rotulo) + ' ' + esc(v.fechado) + ' (pedido: ' + esc(v.pedido) + ')'; }).join('; ') + '.</div></div>' : '') +
      corpo + (corrigindo ? '<div class="corpo" style="border-top:1px solid var(--border)">' + campoCt('f_motivo', 'Motivo da correção (obrigatório)', '', { area: true, linhas: 2, ph: 'Ex.: a taxa do contrato assinado é 2,9%; registrei 3% por engano.' }) +
          '<div class="ajuda">O histórico guarda o que mudou (de → para). O executivo e a Implantação são avisados.</div>' +
          '<div class="linha" style="justify-content:flex-end;margin-top:10px"><button class="btn ghost sm" id="btCorrCancelar">Cancelar</button><button class="btn primary sm" id="btCorrSalvar">Salvar correção</button></div></div>'
        : edita ? '<div class="doc-linha" style="justify-content:flex-end">' + (d.faltas_fechado.length ? '<span class="ajuda" style="flex:1 1 300px;margin:0">Para concluir, falta: ' + esc(d.faltas_fechado.join(' ')) + '</span>' : '') +
        '<button class="btn ghost sm" id="btFechSalvar">Salvar</button><button class="btn primary sm" id="btFechConcluir">Concluir contrato</button></div>' : '') + '</section>';
  }
  function lerFechadoCt(raiz) {
    var v = function (k) { return valCt(k, raiz); };
    return {
      taxa_adm: numCr(v('f_taxa_adm')), boleto: numCr(v('f_boleto')), desconto_tipo: v('f_desconto_tipo'), desconto_valor: numCr(v('f_desconto_valor')), desconto_inicio: v('f_desconto_inicio'),
      limite_extra: $('#c_f_limite_extra', raiz) ? numCr(v('f_limite_extra')) : null,
      honorarios: v('f_honorarios_op') === 'outro' ? numCr($('#c_f_honorarios_outro', raiz).value) : Number(v('f_honorarios_op')) || null,
      inicio_contrato: v('f_inicio_contrato'), periodo_minimo: numCr(v('f_periodo_minimo')), fidelizacao: v('f_fidelizacao') === 'sim',
      foro: v('f_foro'), prazo_contestacao: numCr(v('f_prazo_contestacao')), observacoes: $('#c_f_observacoes', raiz).value.trim(),
      clausulas: $$('[data-clausula]', raiz).map(function (el) {
        var k = metaFechadoCt[Number(el.getAttribute('data-clausula'))] || {};
        return { chave: k.chave, clausula: k.clausula, pedido: k.pedido, resultado: $('[data-k=resultado]', el).value, redacao: $('[data-k=redacao]', el).value.trim() };
      }),
    };
  }
  var metaFechadoCt = [];
  function ligarFechadoCt(raiz) {
    function aplicar() {
      $$('[data-se]', raiz).forEach(function (el) {
        var p = el.getAttribute('data-se').split(':');
        el.hidden = p[1].split(',').indexOf(String(valCt(p[0], raiz))) < 0;
      });
    }
    raiz.addEventListener('change', aplicar);
    aplicar();
  }

  /* ---------- assinatura: o Jurídico manda assinar e anexa a via assinada ---------- */
  function marcarEmAssinaturaCt(c, depois) {
    var mo = modal({ titulo: 'Enviado para assinatura · ' + (c.condominio || ''), corpo: (c.sem_convencao ? '<div class="msg erro" style="margin-bottom:12px">A convenção do condomínio não foi enviada: peça ao executivo antes de mandar assinar.</div>' : '') +
      '<label class="rot" for="mObsAssCt">Observação (opcional)</label><textarea class="campo" id="mObsAssCt" rows="2" placeholder="Ex.: enviado ao síndico e às testemunhas."></textarea>' +
      '<div class="ajuda">O executivo é avisado no sino. Quando voltar assinado, clique em <b>Assinado</b>.</div>',
      pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="mEmAssOk">Marcar em assinatura</button>' });
    $('#mEmAssOk', mo).onclick = async function () {
      try { await api('POST', '/api/contratos/' + c.id + '/em-assinatura', { observacao: $('#mObsAssCt', mo).value.trim() }); mo.fechar(); toast('Em assinatura.', 'ok'); depois(); } catch (e) { toast(e.message, 'erro'); }
    };
  }
  /* a via assinada: anexa ali mesmo o contrato e a procuração e marca; em seguida, registra as condições fechadas */
  function marcarAssinadoCt(d, depois) {
    var c = d.contrato;
    var tem = function (t) { return d.documentos.some(function (x) { return x.tipo === t && !x.substituido_em; }); };
    var arq = function (id, rot, ja) { return '<div style="margin-bottom:12px"><label class="rot" for="' + id + '">' + rot + '</label>' + (ja ? '<div class="msg ok" style="margin-bottom:6px">Já anexado. Escolha outro arquivo só para trocar.</div>' : '') + '<input class="campo" type="file" id="' + id + '"></div>'; };
    var mo = modal({ titulo: 'Contrato assinado · ' + (c.condominio || ''), corpo: (d.sem_convencao ? '<div class="msg erro" style="margin-bottom:12px">A convenção do condomínio não foi enviada: confira antes de seguir.</div>' : '') +
      arq('mArqAssCt', 'Contrato assinado', tem('contrato_assinado')) +
      '<div class="ajuda">Em seguida, registre as condições fechadas: elas vêm do que foi pedido. Ao concluir, o executivo é avisado para solicitar a implantação, que vem com essas condições.</div>',
      pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="mAssCtOk">Marcar como assinado</button>' });
    $('#mAssCtOk', mo).onclick = async function () {
      var b = this;
      b.disabled = true;
      try {
        var a1 = $('#mArqAssCt', mo).files[0];
        if (a1) await enviarDocCt(c.id, 'contrato_assinado', a1);
        await api('POST', '/api/contratos/' + c.id + '/assinado', {});
        mo.fechar(); toast('Contrato assinado: registre as condições fechadas.', 'ok');
        if (location.hash === '#/contratos/' + c.id) depois(); else location.hash = '#/contratos/' + c.id;
      } catch (e) { b.disabled = false; toast(e.message, 'erro'); }
    };
  }
  async function abaAssinaturasCt() {
    var r;
    try { r = await api('GET', '/api/contratos?vis=assinaturas'); } catch (e) { $('#corpoCt').innerHTML = '<div class="vazio">' + esc(e.message) + '</div>'; return; }
    var grupo = function (etapa, titulo, ajuda, desde, botao) {
      var lista = r.contratos.filter(function (c) { return c.etapa === etapa; });
      return '<section class="painel" style="margin-bottom:16px"><div class="cab-painel"><h2>' + titulo + '</h2><span class="etiqueta ' + ETAPA_CT[etapa][1] + '">' + lista.length + '</span><span class="ajuda" style="margin:0">' + ajuda + '</span></div>' +
        (lista.length ? '<div class="tabela-wrap"><table style="min-width:820px"><thead><tr><th>Protocolo</th><th>Condomínio</th><th>Executivo</th><th>Desde</th><th></th></tr></thead><tbody>' +
          lista.map(function (c) {
            return '<tr class="clicavel" data-id="' + c.id + '"><td style="white-space:nowrap"><b>' + esc(c.protocolo) + '</b></td><td><b>' + esc(c.condominio) + '</b>' + (c.sem_convencao ? ' ' + etq(['sem convenção: peça antes de assinar', 'vermelha']) : '') +
              '<span class="sec">' + esc(c.uf || '') + (c.ajustes ? ' · ' + c.ajustes + ' ajuste(s)' : '') + '</span></td>' +
              '<td>' + esc(c.executivo_nome || '—') + '</td><td style="white-space:nowrap">' + dataHoraCr(c[desde]) + '</td>' +
              '<td style="text-align:right"><button class="btn primary sm" data-acao-ass="' + etapa + '" data-c="' + c.id + '">' + botao + '</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="corpo"><span class="sec">Nenhum.</span></div>') + '</section>';
    };
    $('#corpoCt').innerHTML = grupo('para_assinar', 'Pronto para assinatura', 'o executivo informou que o síndico aprovou a minuta', 'assinatura_pedida_em', 'Enviado para assinatura') +
      grupo('em_assinatura', 'Em assinatura', 'aguardando a via assinada voltar', 'em_assinatura_em', 'Assinado') +
      grupo('conferencia', 'Assinado · registrar as condições fechadas', 'confira a via assinada e conclua: o executivo é avisado para solicitar a implantação', 'assinado_em', 'Registrar condições');
    $$('#corpoCt tr[data-id]').forEach(function (tr) { tr.onclick = function (ev) { if (ev.target.closest('button')) return; location.hash = '#/contratos/' + tr.getAttribute('data-id'); }; });
    $$('[data-acao-ass]').forEach(function (b) {
      b.onclick = async function () {
        var id = Number(b.getAttribute('data-c')), etapa = b.getAttribute('data-acao-ass');
        var c = r.contratos.find(function (x) { return x.id === id; });
        if (etapa === 'para_assinar') return marcarEmAssinaturaCt(c, function () { abaAssinaturasCt(); atualizarCt(); });
        if (etapa === 'em_assinatura') {
          try { var d = await api('GET', '/api/contratos/' + id); marcarAssinadoCt(d, function () { paginaContratoDetalhe(id); atualizarCt(); }); } catch (e) { toast(e.message, 'erro'); }
          return;
        }
        location.hash = '#/contratos/' + id;
      };
    });
  }

  /* ---------- Dashboard Jurídico ---------- */
  var MESES_CT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var MESES_LONGO_CT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var filtroPainelCt = null;
  // séries do comparativo: [campo, rótulo, classe, cor] (ordem fixa: a paleta foi conferida para daltonismo e contraste nessa ordem)
  var SERIES_PAINEL_CT = [['solicitados', 'Solicitados', 'b1-ct', '#0b76ba'], ['aguardando_assinatura', 'Aguardando assinatura', 'b2-ct', '#eb6834'],
    ['em_assinatura', 'Em assinatura', 'b3-ct', '#6250d6'], ['assinados', 'Assinados', 'b4-ct', '#2d8a56']];
  async function abaPainelCt() {
    var hoje = new Date();
    if (!filtroPainelCt) filtroPainelCt = { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
    var f = filtroPainelCt;
    var r;
    try { r = await api('GET', '/api/contratos/painel?ano=' + f.ano + '&mes=' + f.mes); } catch (e) { $('#corpoCt').innerHTML = '<div class="vazio">' + esc(e.message) + '</div>'; return; }
    var nomePer = f.mes ? MESES_LONGO_CT[f.mes - 1] + ' de ' + f.ano : String(f.ano);
    var P = r.periodo, A = r.agora, T = r.tempos;
    var SERIES = SERIES_PAINEL_CT;
    var kpi = function (rot, val, sub, cls, barra) {
      return '<div class="kpi-ct' + (cls ? ' ' + cls : '') + '"><div class="lab">' + rot + '</div><div class="val">' + (val == null ? '—' : val) + '</div>' +
        (sub ? '<div class="sub">' + sub + '</div>' : '') + (barra != null ? '<div class="barra-ct"><i style="width:' + Math.min(100, barra).toFixed(1) + '%"></i></div>' : '') + '</div>';
    };
    var pctAss = P.solicitados ? Math.round((P.fechados / P.solicitados) * 100) : 0;

    // comparativo mês a mês: as quatro séries lado a lado; dica ao passar o mouse e o valor do último mês com movimento
    var maxv = Math.max(1, Math.max.apply(null, r.meses.map(function (m) { return Math.max.apply(null, SERIES.map(function (x) { return m[x[0]]; })); })));
    var passo = maxv <= 5 ? 1 : maxv <= 10 ? 2 : maxv <= 25 ? 5 : maxv <= 50 ? 10 : 20;
    var topo = Math.ceil(maxv / passo) * passo;
    var W = 1040, H = 300, L = 40, R = 10, Tp = 22, Bm = 34, pw = (W - L - R) / 12, bw = Math.min(16, (pw - 20) / SERIES.length - 2), grupo = SERIES.length * (bw + 2) - 2;
    var y = function (v) { return Tp + (H - Tp - Bm) * (1 - v / topo); };
    var svg = '';
    for (var g = 0; g <= topo; g += passo) svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g).toFixed(1) + '" y2="' + y(g).toFixed(1) + '" class="' + (g ? 'grade-ct' : 'base-ct') + '"/>' +
      '<text x="' + (L - 10) + '" y="' + (y(g) + 4).toFixed(1) + '" text-anchor="end" class="eixo-ct">' + g + '</text>';
    var barra = function (x, v, cor) {
      if (!v) return '';
      var y0 = y(v), h = y(0) - y0, rr = Math.min(4, h);
      return '<path fill="' + cor + '" d="M' + x.toFixed(1) + ' ' + y(0).toFixed(1) + 'V' + (y0 + rr).toFixed(1) + 'Q' + x.toFixed(1) + ' ' + y0.toFixed(1) + ' ' + (x + rr).toFixed(1) + ' ' + y0.toFixed(1) +
        'H' + (x + bw - rr).toFixed(1) + 'Q' + (x + bw).toFixed(1) + ' ' + y0.toFixed(1) + ' ' + (x + bw).toFixed(1) + ' ' + (y0 + rr).toFixed(1) + 'V' + y(0).toFixed(1) + 'Z"/>';
    };
    var ultimo = null;
    r.meses.forEach(function (m, k) {
      var cx = L + pw * k + pw / 2, tem = SERIES.some(function (x) { return m[x[0]]; });
      if (f.mes === m.mes) svg += '<rect x="' + (L + pw * k + 2).toFixed(1) + '" y="' + Tp + '" width="' + (pw - 4).toFixed(1) + '" height="' + (H - Tp - Bm) + '" rx="8" class="sel-mes-ct"/>';
      SERIES.forEach(function (x, i) { svg += barra(cx - grupo / 2 + i * (bw + 2), m[x[0]], x[3]); });
      svg += '<text x="' + cx.toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle" class="mes-txt-ct' + (tem ? ' tem' : '') + (f.mes === m.mes ? ' sel' : '') + '">' + MESES_CT[k].charAt(0).toUpperCase() + MESES_CT[k].slice(1) + '</text>';
      svg += '<rect x="' + (L + pw * k).toFixed(1) + '" y="' + Tp + '" width="' + pw.toFixed(1) + '" height="' + (H - Tp - Bm + 10) + '" fill="transparent" data-i="' + k + '" class="alvo-ct"/>';
      if (tem) ultimo = { m: m, cx: cx };
    });
    if (ultimo) svg += '<text x="' + (ultimo.cx - grupo / 2 + bw / 2).toFixed(1) + '" y="' + (y(ultimo.m.solicitados) - 8).toFixed(1) + '" text-anchor="middle" class="rotulo-ct">' + ultimo.m.solicitados + '</text>';

    // tabela do comparativo (os mesmos números, com a diferença para o mês anterior)
    var mesesTab = r.meses.filter(function (m) { return f.ano < hoje.getFullYear() || (f.ano === hoje.getFullYear() && m.mes <= hoje.getMonth() + 1); });
    var variacao = function (m, campo) {
      var ant = r.meses[m.mes - 2];
      if (!ant) return '';
      var dlt = m[campo] - ant[campo];
      return dlt ? ' <span class="dif-ct ' + (dlt > 0 ? 'mais' : 'menos') + '">' + (dlt > 0 ? '+' : '−') + Math.abs(dlt) + '</span>' : '';
    };
    var rank = function (lista, campo, rotulo, extra) {
      var l = lista.filter(function (x) { return x[campo] > 0; }).sort(function (a, b) { return b[campo] - a[campo]; }).slice(0, 10);
      if (!l.length) return '<div class="vazio-ct">Nada no período.</div>';
      var mx = l[0][campo];
      return '<div class="rank-ct">' + l.map(function (x, k) {
        return '<div class="rk-ct"><span class="n">' + (k + 1) + '</span><span class="nm" title="' + esc(x.nome) + '">' + esc(x.nome) + '</span><span class="tr"><span class="bf" style="width:' + Math.max(2, (x[campo] / mx) * 68).toFixed(1) + '%"></span>' +
          '<span class="vv">' + x[campo] + ' ' + rotulo + (extra ? '<span class="mini"> · ' + extra(x) + '</span>' : '') + '</span></span></div>';
      }).join('') + '</div>';
    };
    var sit = function (rot, n, sub, alerta) { return '<div class="c' + (alerta && n ? ' alerta' : '') + '"><div class="k">' + rot + '</div><div class="v">' + (n == null ? '—' : n) + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>'; };
    var dias = function (v) { return v == null ? null : fmtNumCr(v) + (v === 1 ? ' dia' : ' dias'); };

    $('#corpoCt').innerHTML = '<div class="painel-ct">' +
      '<div class="filtros-ct"><span class="lbl">Ano</span>' + r.anos.slice().sort().map(function (a) { return '<button class="pill-ct' + (a === f.ano ? ' on' : '') + '" data-ano="' + a + '">' + a + '</button>'; }).join('') +
        '<span class="lbl" style="margin-left:8px">Mês</span><select class="campo" id="pMesCt"><option value="0">Ano todo</option>' +
        MESES_LONGO_CT.map(function (n, k) { return '<option value="' + (k + 1) + '"' + (f.mes === k + 1 ? ' selected' : '') + '>' + n.charAt(0).toUpperCase() + n.slice(1) + '</option>'; }).join('') + '</select></div>' +
      '<div class="kpis-ct">' +
        kpi('Solicitados · ' + esc(nomePer), P.solicitados, P.minutas + ' minuta(s) enviada(s)' + (P.minutas_no_prazo != null ? ' · ' + P.minutas_no_prazo + '% no prazo' : ''), 'destaque') +
        kpi('Aguardando assinatura', P.assinaturas_pedidas, 'o executivo pediu a assinatura') +
        kpi('Em assinatura', P.enviados_assinatura, 'enviados pelo Jurídico') +
        kpi('Assinados', P.fechados, P.solicitados ? pctAss + '% dos solicitados no período' : 'contratos concluídos', '', P.solicitados ? pctAss : null) +
        kpi('Alterações pedidas', P.ajustes, P.cancelados ? P.cancelados + ' cancelado(s)' : 'ajustes na minuta') + '</div>' +
      '<section class="panel-ct"><div class="h-row-ct"><div><h2>Comparativo mês a mês — ' + f.ano + '</h2><div class="h-sub">Solicitados, aguardando assinatura, em assinatura e assinados em cada mês. Clique num mês para ver os números dele.</div></div>' +
        '<div class="legenda-ct">' + SERIES.map(function (x) { return '<span><i style="background:' + x[3] + '"></i>' + x[1] + '</span>'; }).join('') + '</div></div>' +
        '<div class="chart-ct"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Comparativo mês a mês em ' + f.ano + ': solicitados, aguardando assinatura, em assinatura e assinados">' + svg + '</svg></div>' +
        '<details class="tab-ct"><summary>Ver em tabela</summary><div class="tabela-wrap"><table><thead><tr><th>Mês</th>' + SERIES.map(function (x) { return '<th style="text-align:right">' + x[1] + '</th>'; }).join('') + '</tr></thead><tbody>' +
        (mesesTab.map(function (m) {
          return '<tr' + (f.mes === m.mes ? ' class="sel-ct"' : '') + '><td>' + MESES_LONGO_CT[m.mes - 1] + '</td>' +
            SERIES.map(function (x) { return '<td style="text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap"><b>' + m[x[0]] + '</b>' + variacao(m, x[0]) + '</td>'; }).join('') + '</tr>';
        }).join('') || '<tr><td colspan="5"><span class="sec">Nada no ano.</span></td></tr>') + '</tbody></table></div><p class="ajuda" style="margin:6px 0 0">Ao lado de cada número, a diferença para o mês anterior.</p></div></details></section>' +
      '<section class="panel-ct"><h2>Situação agora</h2><div class="h-sub">Onde estão os contratos em andamento neste momento</div><div class="sit-ct">' +
        sit('Na fila', A.fila, 'ninguém assumiu') + sit('Em elaboração', A.em_elaboracao, 'primeira minuta') + sit('Em alteração', A.em_alteracao, 'ajuste pedido pelo comercial') +
        sit('Pendência com o comercial', A.pendencia) + sit('Aguardando o executivo', A.minuta_enviada, 'pedir assinatura ou ajuste') + sit('Pronto para assinatura', A.para_assinar, 'o Jurídico manda assinar') +
        sit('Em assinatura', A.em_assinatura) + sit('Registrar condições', A.conferencia, 'assinados, falta concluir') + sit('Passaram do prazo', A.atrasados, 'minuta além das 72h úteis', true) + '</div>' +
        '<div class="sit-ct tempos-ct">' + sit('Até a primeira minuta', dias(T.primeira_minuta_dias), 'média, do pedido à 1ª minuta') + sit('Do pedido à assinatura', dias(T.fechamento_dias), 'média dos assinados no período') +
        sit('Alterações por contrato', T.ajustes_por_contrato == null ? null : fmtNumCr(T.ajustes_por_contrato), 'média dos assinados no período') + '</div></section>' +
      '<div class="dois-ct"><section class="panel-ct"><h2>Por executivo</h2><div class="h-sub">Solicitados em ' + esc(nomePer) + '</div>' +
        rank(r.por_executivo, 'solicitados', 'solicitado(s)', function (x) { return x.fechados + ' assinado(s)'; }) + '</section>' +
        '<section class="panel-ct"><h2>Por responsável no Jurídico</h2><div class="h-sub">Contratos em andamento agora</div>' +
        rank(r.por_responsavel, 'em_andamento', 'em andamento', function (x) { return x.fechados + ' assinado(s) no período'; }) + '</section></div></div>';

    $('#pMesCt').onchange = function () { filtroPainelCt.mes = Number(this.value); abaPainelCt(); };
    $$('[data-ano]', $('#corpoCt')).forEach(function (b) { b.onclick = function () { filtroPainelCt.ano = Number(b.getAttribute('data-ano')); abaPainelCt(); }; });
    var tip = $('#tipCt');
    if (!tip) { tip = document.createElement('div'); tip.id = 'tipCt'; tip.className = 'tip-ct'; document.body.appendChild(tip); }
    $$('.alvo-ct', $('#corpoCt')).forEach(function (el) {
      var m = r.meses[Number(el.getAttribute('data-i'))];
      el.onclick = function () { tip.style.opacity = 0; filtroPainelCt.mes = m.mes; abaPainelCt(); };
      el.onmousemove = function (ev) {
        tip.innerHTML = '<b>' + MESES_LONGO_CT[m.mes - 1].charAt(0).toUpperCase() + MESES_LONGO_CT[m.mes - 1].slice(1) + ' de ' + f.ano + '</b>' +
          SERIES.map(function (x) { return '<div class="l"><i style="background:' + x[3] + '"></i>' + x[1] + ': <b>' + m[x[0]] + '</b></div>'; }).join('');
        tip.style.opacity = 1;
        var x = ev.clientX + 14;
        if (x + 240 > window.innerWidth) x = ev.clientX - 250;
        tip.style.left = x + 'px'; tip.style.top = (ev.clientY + 14) + 'px';
      };
      el.onmouseleave = function () { tip.style.opacity = 0; };
    });
  }

  /* ---------- detalhe ---------- */
  async function paginaContratoDetalhe(id) {
    definirBarra('<span class="setor">Solicitação de Contrato</span><span class="sep">/</span><span class="nome">…</span>');
    $('#conteudo').innerHTML = carregandoHtml();
    var d, m;
    try { d = await api('GET', '/api/contratos/' + id); m = await carregarMetaCt(); } catch (e) {
      $('#conteudo').innerHTML = '<div class="pagina"><div class="vazio">' + esc(e.message) + '<br><a class="btn ghost" style="margin-top:14px" href="#/contratos">Voltar</a></div></div>';
      return;
    }
    var c = d.contrato, pd = d.pode;
    var recarregar = function () { paginaContratoDetalhe(id); atualizarCt(); };
    var acoes = '<a class="btn ghost sm" href="#/contratos">Voltar</a>' +
      '<a class="btn ghost sm" href="/api/contratos/' + c.id + '/formulario.pdf" target="_blank" rel="noopener" title="Exportar a solicitação em PDF">' + IC.documento + 'PDF</a>';
    if (pd.cancelar) acoes += '<button class="btn danger sm" id="btCancCt">Cancelar</button>';
    if (pd.assumir) acoes += '<button class="btn primary sm" id="btAssumirCt">Assumir</button>';
    if (pd.passar) acoes += '<button class="btn ghost sm" id="btPassarCt">' + (c.responsavel_id ? 'Passar para outra pessoa' : 'Passar para alguém') + '</button>';
    if (pd.pendencia) acoes += '<button class="btn ghost sm" id="btPendCt">Devolver com pendência</button>';
    if (pd.minuta) acoes += '<button class="btn primary sm" id="btMinutaCt"' + (pd.enviar_minuta ? '' : ' disabled title="A diretoria ainda não decidiu os itens que dependem dela."') + '>Enviar minuta ao comercial</button>';
    if (pd.ajuste) acoes += '<button class="btn ghost sm" id="btAjusteCt">Pedir ajuste</button>';
    if (pd.pedir_assinatura) acoes += '<button class="btn primary sm" id="btPedirAssCt">Síndico aprovou: pedir assinatura</button>';
    if (pd.enviar_assinatura) acoes += '<button class="btn primary sm" id="btEmAssCt">Enviado para assinatura</button>';
    if (pd.assinar) acoes += '<button class="btn ' + (pd.enviar_assinatura ? 'ghost' : 'primary') + ' sm" id="btAssinadoCt">Assinado</button>';
    if (pd.abrir_implantacao && !d.implantacao) acoes += '<button class="btn primary sm" id="btAbrirImpCt">' + IC.casa + 'Solicitar implantação</button>';
    definirBarra('<span class="setor">Jurídico</span><span class="sep">/</span><span class="nome">' + esc(c.protocolo || 'Rascunho') + '</span>', acoes);
    var difs = {};
    d.diferencas.forEach(function (x) { difs[x.campo] = x; });
    var fmtDif = function (x) {
      var f = /R\$/.test(x.rotulo) ? reais : /%/.test(x.rotulo) ? pctCr : fmtNumCr;
      return typeof x.valor === 'number' ? f(x.valor) + ' (análise: ' + f(x.analise) + ')' : x.valor + ' (análise: ' + x.analise + ')';
    };
    var html = '<div class="pagina"><div class="linha" style="align-items:flex-start;margin-bottom:16px"><div style="flex:1 1 420px">' +
      '<div class="linha" style="margin-bottom:6px">' + etqCr(ETAPA_CT, c.etapa) +
      (c.analise_id ? '<a class="etiqueta azul" href="#/credito/' + c.analise_id + '">da análise ' + esc(c.analise_protocolo || '') + '</a>' : '<span class="etiqueta cinza">' + esc(origemCt(c)) + '</span>') +
      (d.implantacao ? '<a class="etiqueta azul" href="#/implantacao/' + d.implantacao.id + '">implantação ' + esc(d.implantacao.protocolo || 'em rascunho') + '</a>' : '') +
      (c.executivo_nome ? '<span class="etiqueta cinza">' + esc(c.executivo_nome + (c.executivo_uf ? ' · ' + c.executivo_uf : '')) + '</span>' : '') + '</div>' +
      '<h1>' + esc(c.condominio || 'Nova solicitação de contrato') + '</h1><p class="sub" style="margin:0">' + esc([c.cnpj, c.uf, c.responsavel_nome ? 'Com: ' + c.responsavel_nome : ''].filter(Boolean).join(' · ')) + '</p></div>' +
      '<dl class="info-ticket" style="min-width:260px">' + (c.protocolo ? '<dt>Protocolo</dt><dd>' + esc(c.protocolo) + '</dd>' : '') +
      (c.enviado_em ? '<dt>Enviada ao Jurídico</dt><dd>' + dataHoraCr(c.enviado_em) + '</dd>' : '') + '<dt>Pedida por</dt><dd>' + esc(c.solicitante_nome || '—') + '</dd>' +
      (['fila', 'em_elaboracao'].indexOf(c.etapa) >= 0 && c.prazo ? '<dt>Minuta até (72h úteis)</dt><dd>' + prazoCt(c) + '</dd>' : '') +
      (c.ajustes ? '<dt>Ajustes pedidos</dt><dd>' + c.ajustes + '</dd>' : '') +
      (c.minuta_enviada_em ? '<dt>Última minuta</dt><dd>' + dataHoraCr(c.minuta_enviada_em) + '</dd>' : '') +
      (c.assinado_em ? '<dt>Assinado (anexado)</dt><dd>' + dataHoraCr(c.assinado_em) + '</dd>' : '') + '</dl></div>' +
      (pd.abrir_implantacao && !d.implantacao ? '<div class="msg info" style="margin-bottom:16px"><b>Contrato assinado e condições registradas pelo Jurídico.</b> Agora é com você: clique em <b>Solicitar implantação</b>. Ela já vem com as condições fechadas, o contrato assinado e a convenção.</div>' : '');

    var dir = c.diretoria || {};
    var itensDir = d.itens_diretoria || [];
    if (itensDir.length) {
      var corpoDir = '<ul style="margin:0 0 10px;padding-left:18px;font-size:13.5px;font-weight:600;color:var(--ink-2)">' + itensDir.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      if (dir.decidido_em) corpoDir += '<div class="msg ' + (dir.aprovado ? 'ok' : 'erro') + '">' + esc(dir.por) + ' ' + (dir.aprovado ? 'aprovou' : 'não aprovou') + ' em ' + dataHoraCr(dir.decidido_em) + (dir.observacao ? ': ' + esc(dir.observacao) : '.') + (dir.aprovado ? '' : ' A minuta segue o contrato padrão nesses pontos.') + '</div>';
      else if (pd.decidir_diretoria) corpoDir += campoCr('dObsCt', 'Observação (obrigatória para não aprovar)', '') + '<div class="linha" style="justify-content:flex-end;margin-top:10px"><button class="btn danger sm" id="btDirNaoCt">Não aprovar</button><button class="btn primary sm" id="btDirSimCt">Aprovar</button></div>';
      else if (c.etapa === 'rascunho' || pd.editar) corpoDir += '<div class="ajuda" style="margin:0">Ao enviar, a diretoria é avisada; a minuta só sai depois da decisão.</div>';
      else corpoDir += '<div class="msg aviso">Aguardando a decisão da diretoria; a minuta só sai depois.</div>';
      html += '<section class="painel" style="margin-bottom:16px"><div class="cab-painel"><h2>Decisão da diretoria</h2></div><div class="corpo">' + corpoDir + '</div></section>';
    }
    if (d.diferencas.length) html += '<div class="msg aviso" style="margin-bottom:16px"><b>Diferente da análise:</b> ' + d.diferencas.map(function (x) { return esc(x.rotulo.replace(/ \((%|R\$)\)$/, '')) + ' ' + esc(fmtDif(x)); }).join('; ') + '.</div>';
    if (pd.editar) html += '<div class="msg erro" id="faltasCt" style="margin-bottom:16px"' + (d.faltas.length ? '' : ' hidden') + '><b>Para enviar, falta (os campos estão em vermelho; clique para ir até cada um):</b><ul></ul></div>';
    var atencao = d.avisos.filter(function (a) { return a.nivel === 'atencao'; }), info = d.avisos.filter(function (a) { return a.nivel !== 'atencao'; });
    if (atencao.length) html += '<div class="msg aviso" style="margin-bottom:16px"><b>Atenção (Manual do Contrato):</b><ul>' + atencao.map(function (a) { return '<li>' + esc(a.texto) + '</li>'; }).join('') + '</ul></div>';
    if (info.length && ['conferencia', 'assinado'].indexOf(c.etapa) < 0) html += '<div class="msg info" style="margin-bottom:16px"><b>Do Manual do Contrato:</b><ul>' + info.map(function (a) { return '<li>' + esc(a.texto) + '</li>'; }).join('') + '</ul></div>';
    var ultimaPend = d.eventos.filter(function (e) { return e.tipo === 'pendencia'; }).pop();
    if (c.etapa === 'pendencia' && ultimaPend) html += '<div class="msg aviso" style="margin-bottom:16px;white-space:pre-wrap">' + esc(ultimaPend.detalhe.mensagem || '') + '</div>';
    var ultimoAjuste = d.eventos.filter(function (e) { return e.tipo === 'ajuste'; }).pop();
    if (c.etapa === 'em_elaboracao' && ultimoAjuste) html += '<div class="msg aviso" style="margin-bottom:16px;white-space:pre-wrap"><b>Ajuste pedido em ' + dataHoraCr(ultimoAjuste.criado_em) + ':</b> ' + esc(ultimoAjuste.detalhe.texto || '') + '</div>';
    if (c.etapa === 'minuta_enviada' && pd.ajuste) html += '<div class="msg info" style="margin-bottom:16px">Leve a minuta ao síndico. Pediu mudanças? <b>Pedir ajuste</b>. Aprovou? <b>Síndico aprovou: pedir assinatura</b>: o Jurídico manda assinar e anexa a via assinada.</div>';
    if (c.etapa === 'para_assinar') html += '<div class="msg aviso" style="margin-bottom:16px">' + (pd.enviar_assinatura ? 'O executivo informou que o síndico aprovou a minuta em ' + dataHoraCr(c.assinatura_pedida_em) + '. Mande para assinatura e clique em <b>Enviado para assinatura</b>.' : 'Pedido de assinatura enviado ao Jurídico em ' + dataHoraCr(c.assinatura_pedida_em) + '.') + '</div>';
    if (c.etapa === 'em_assinatura') html += '<div class="msg info" style="margin-bottom:16px">Em assinatura desde ' + dataHoraCr(c.em_assinatura_em) + (c.assinatura_plataforma ? ' (' + esc(c.assinatura_plataforma) + ')' : '') + '.' + (pd.assinar ? ' Voltou assinado? Clique em <b>Assinado</b> e anexe a via assinada.' : ' O Jurídico avisa quando voltar assinado.') + '</div>';
    var fechadoHtml = ['conferencia', 'assinado'].indexOf(c.etapa) >= 0 ? htmlFechadoCt(d, m) : '';
    metaFechadoCt = (c.fechado && c.fechado.clausulas) || [];
    var formHtml = '<div id="formCt" class="pilha" style="gap:18px"' + (pd.editar ? '' : ' data-leitura') + '>' + htmlFormCt(c, m, difs) + '</div>';
    if (!pd.editar) formHtml = '<details class="painel"' + (pd.interno && ['fila', 'em_elaboracao'].indexOf(c.etapa) >= 0 ? ' open' : '') + '><summary class="cab-painel" style="cursor:pointer"><h2 style="display:inline">Solicitação do comercial</h2></summary><div class="corpo">' + formHtml + '</div></details>';
    html += '<div class="pilha" style="gap:18px">' + fechadoHtml + formHtml + htmlDocsCt(d, m) +
      (pd.editar ? '<div class="linha" style="justify-content:flex-end"><span class="ajuda" style="flex:1 1 320px;margin:0">Ao enviar, o portal confere o que falta, gera o protocolo e avisa o Jurídico (72h úteis para a minuta). O que depende da diretoria vai para ela no mesmo momento.</span>' +
        '<button class="btn ghost" id="btSalvarCt">Salvar rascunho</button><button class="btn primary" id="btEnviarCt">' + (c.etapa === 'pendencia' ? 'Reenviar ao Jurídico' : 'Enviar ao Jurídico') + '</button></div>' : '') + '</div>';
    html += '<section class="painel" style="margin-top:16px"><div class="cab-painel"><h2>Histórico</h2></div><div class="corpo pilha" style="gap:8px;font-size:13px;font-weight:600;color:var(--ink-2)">' +
      d.eventos.map(function (e) {
        var x = e.detalhe || {};
        var extra = e.tipo === 'documento' || e.tipo === 'documento_removido' ? ': ' + esc(x.nome) : e.tipo === 'enviada' ? ' (' + esc(x.protocolo) + ')' : e.tipo === 'criada' && x.analise ? ' a partir da análise ' + esc(x.analise)
          : e.tipo === 'passada' ? ' para ' + esc(x.para) : e.tipo === 'pendencia' ? ': ' + esc((x.itens || []).join('; ')) : e.tipo === 'ajuste' ? ': ' + esc(x.texto)
            : e.tipo === 'minuta_enviada' ? ' (' + esc(x.nome) + (x.no_prazo === false ? ', fora do prazo' : '') + ')' : e.tipo === 'fechado' && (x.diferencas || []).length ? ' (mudou: ' + esc(x.diferencas.join(', ')) + ')'
              : e.tipo === 'fechado_corrigido' ? ': ' + esc(x.motivo) + '<ul style="margin:4px 0 0;padding-left:18px">' + (x.mudancas || []).map(function (mu) { return '<li>' + esc(mu.rotulo) + ': ' + esc(mu.antes) + ' → <b>' + esc(mu.depois) + '</b></li>'; }).join('') + '</ul>' : '';
        return '<div><b style="color:var(--ink)">' + dataHoraCr(e.criado_em) + '</b> · ' + esc(e.usuario_nome || 'Sistema') + ' ' + (EVENTO_CT[e.tipo] || esc(e.tipo)) + extra + '</div>';
      }).join('') + '</div></section></div>';
    $('#conteudo').innerHTML = html;
    var raiz = $('#formCt');
    ligarFormCt(raiz);
    ligarDocsCt(c, recarregar);
    var post = async function (rota, corpo, msg) { try { await api('POST', '/api/contratos/' + c.id + '/' + rota, corpo || {}); toast(msg, 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); } };
    var pedirTexto = function (titulo, rotulo, ph, botao, rota, chave, msg, ajuda, lista) {
      var mo = modal({ titulo: titulo, corpo: '<label class="rot" for="mTxtCt">' + esc(rotulo) + '</label><textarea class="campo" id="mTxtCt" rows="5" placeholder="' + esc(ph) + '"></textarea>' + (ajuda ? '<div class="ajuda">' + ajuda + '</div>' : ''),
        pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="mTxtCtOk">' + esc(botao) + '</button>' });
      $('#mTxtCtOk', mo).onclick = async function () {
        var t = $('#mTxtCt', mo).value;
        var corpo = {};
        corpo[chave] = lista ? t.split(/\n/) : t;
        try { await api('POST', '/api/contratos/' + c.id + '/' + rota, corpo); mo.fechar(); toast(msg, 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
      };
    };
    if ($('#btCancCt')) $('#btCancCt').onclick = function () {
      pedirTexto('Cancelar a solicitação', 'Motivo', 'Ex.: o síndico desistiu.', 'Cancelar a solicitação', 'cancelar', 'motivo', 'Solicitação cancelada.', 'Fica no histórico como cancelada' + (c.analise_id ? ' e a análise volta a ficar disponível.' : '.'));
    };
    if ($('#btAssumirCt')) $('#btAssumirCt').onclick = function () { post('assumir', {}, 'Solicitação assumida.'); };
    if ($('#btPassarCt')) $('#btPassarCt').onclick = function () {
      var lista = m.elaboradores.filter(function (x) { return x.id !== c.responsavel_id; });
      if (!lista.length) { toast('Ninguém mais elabora contratos: a administração marca em Quem elabora.', 'erro'); return; }
      var mo = modal({ titulo: 'Passar a solicitação', corpo: selCr('mPassCt', 'Para quem', lista[0].id, lista.map(function (x) { return [x.id, x.nome]; })) + '<div class="ajuda">A pessoa é avisada no sino e por e-mail. O prazo continua o mesmo.</div>',
        pe: '<button class="btn ghost" data-fechar>Cancelar</button><button class="btn primary" id="mPassCtOk">Passar</button>' });
      $('#mPassCtOk', mo).onclick = async function () {
        try { await api('POST', '/api/contratos/' + c.id + '/passar', { usuario_id: Number($('#mPassCt', mo).value) }); mo.fechar(); toast('Passada.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); }
      };
    };
    if ($('#btPendCt')) $('#btPendCt').onclick = function () {
      pedirTexto('Devolver ao comercial com pendência', 'O que falta — um item por linha', '', 'Devolver', 'pendencia', 'itens', 'Devolvida ao comercial.', 'O executivo recebe a lista no portal e por e-mail. Quando reenviar, volta para você com novo prazo.', true);
    };
    if ($('#btMinutaCt')) $('#btMinutaCt').onclick = function () {
      pedirTexto('Enviar a minuta ao comercial', 'Mensagem ao executivo (opcional)', 'Ex.: ajustei o foro e o prazo de contestação, como pedido.', 'Enviar minuta', 'minuta', 'mensagem', 'Minuta enviada ao comercial.', 'Vai a minuta anexada em Documentos. O executivo é avisado no sino e por e-mail.');
    };
    if ($('#btAjusteCt')) $('#btAjusteCt').onclick = function () {
      pedirTexto('Pedir ajuste na minuta', 'O que o síndico pediu para mudar', 'Ex.: trocar o foro para Natal/RN; prazo de 30 dias para contestar.', 'Pedir ajuste', 'ajuste', 'texto', 'Ajuste pedido ao Jurídico.', 'Volta para quem redigiu, com mais 72h úteis. Mudança em cláusula do manual? Confira a resposta padrão em Pedidos do síndico.');
    };
    if ($('#btPedirAssCt')) $('#btPedirAssCt').onclick = function () {
      pedirTexto('Síndico aprovou: pedir assinatura', 'Observação para o Jurídico (opcional)', 'Ex.: o síndico assina pela Clicksign; e-mail dele: sindico@exemplo.com.', 'Pedir assinatura', 'pedir-assinatura', 'observacao', 'Pedido de assinatura enviado ao Jurídico.',
        (d.sem_convencao ? '<b style="color:var(--red)">Falta a convenção do condomínio: sem ela o contrato não é assinado. Anexe em Documentos.</b> ' : '') + 'O Jurídico manda para assinatura e anexa a via assinada. Você é avisado em cada passo.');
    };
    if ($('#btEmAssCt')) $('#btEmAssCt').onclick = function () { marcarEmAssinaturaCt(Object.assign({}, c, { sem_convencao: d.sem_convencao }), recarregar); };
    if ($('#btAssinadoCt')) $('#btAssinadoCt').onclick = function () { marcarAssinadoCt(d, recarregar); };
    if ($('#btAbrirImpCt')) $('#btAbrirImpCt').onclick = async function () {
      if (!(await confirmar('Solicitar a implantação', 'A implantação abre em rascunho com as condições fechadas, o contrato assinado e a convenção. Complete o que falta e envie ao setor Implantação.', 'Solicitar'))) return;
      try {
        var r = await api('POST', '/api/contratos/' + c.id + '/implantacao', {});
        toast('Implantação aberta com as condições fechadas: complete e envie ao setor Implantação.', 'ok');
        location.hash = '#/implantacao/' + r.implantacao;
      } catch (e) { toast(e.message, 'erro'); }
    };
    var decidir = function (aprovar) { post('diretoria', { aprovar: aprovar, observacao: $('#dObsCt').value }, aprovar ? 'Aprovado; o Jurídico e o executivo foram avisados.' : 'Não aprovado; o Jurídico e o executivo foram avisados.'); };
    if ($('#btDirSimCt')) $('#btDirSimCt').onclick = function () { decidir(true); };
    if ($('#btDirNaoCt')) $('#btDirNaoCt').onclick = function () { decidir(false); };
    var fech = $('#fechadoCt');
    if (fech) {
      ligarFechadoCt(fech);
      var corrigindo = pd.corrigir && corrigindoCt === c.id;
      if (!pd.registrar && !corrigindo) $$('input, select, textarea', fech).forEach(function (el) { el.disabled = true; });
      if ($('#btCorrigirCt')) $('#btCorrigirCt').onclick = function () { corrigindoCt = c.id; paginaContratoDetalhe(id); };
      if ($('#btCorrCancelar')) $('#btCorrCancelar').onclick = function () { corrigindoCt = null; paginaContratoDetalhe(id); };
      if ($('#btCorrSalvar')) $('#btCorrSalvar').onclick = async function () {
        try {
          var r = await api('POST', '/api/contratos/' + c.id + '/corrigir', { condicoes: lerFechadoCt(fech), motivo: $('#c_f_motivo', fech).value.trim() });
          corrigindoCt = null;
          toast('Correção salva (' + r.mudancas.length + ' mudança(s)). O executivo e a Implantação foram avisados.', 'ok');
          recarregar();
        } catch (e) { toast(e.message, 'erro'); }
      };
      var salvarFech = async function (concluir) {
        try {
          var r = await api('PUT', '/api/contratos/' + c.id + '/fechado', { condicoes: lerFechadoCt(fech), concluir: concluir });
          toast(concluir ? (r.implantacao ? 'Contrato concluído: as condições já aparecem na implantação do condomínio.' : 'Contrato concluído. O executivo foi avisado para solicitar a implantação.') : r.faltas.length ? 'Salvo. Para concluir, falta: ' + r.faltas.length + '.' : 'Salvo: pronto para concluir.', 'ok');
          recarregar();
        } catch (e) { toast(e.message, 'erro'); }
      };
      if ($('#btFechSalvar')) $('#btFechSalvar').onclick = function () { salvarFech(false); };
      if ($('#btFechConcluir')) $('#btFechConcluir').onclick = async function () {
        if (!(await confirmar('Concluir o contrato', 'O contrato fica como assinado e o executivo é avisado para solicitar a implantação, que vem com estas condições.', 'Concluir'))) return;
        salvarFech(true);
      };
    }
    if (!pd.editar) {
      $$('input, select, textarea', raiz).forEach(function (el) { el.disabled = true; });
      return;
    }
    var exec = function () { var s = $('#c_executivo_id', raiz); return s && s.value ? Number(s.value) : undefined; };
    var salvar = async function () { await api('PATCH', '/api/contratos/' + c.id, { formulario: lerFormCt(raiz), executivo_id: exec() }); };
    // confere enquanto preenche: o que falta fica em vermelho na hora
    marcarFaltasCt(d.faltas_campos);
    var esperaConf, seqConf = 0;
    var conferir = function () {
      clearTimeout(esperaConf);
      esperaConf = setTimeout(async function () {
        var meu = ++seqConf;
        try { var r = await api('POST', '/api/contratos/' + c.id + '/conferir', { formulario: lerFormCt(raiz), executivo_id: exec() }); if (meu === seqConf) marcarFaltasCt(r.faltas_campos); } catch (e) { /* confere na próxima */ }
      }, 450);
    };
    raiz.addEventListener('input', conferir);
    raiz.addEventListener('change', conferir);
    $('#btSalvarCt').onclick = async function () { try { await salvar(); toast('Rascunho salvo.', 'ok'); recarregar(); } catch (e) { toast(e.message, 'erro'); } };
    $('#btEnviarCt').onclick = async function () {
      try {
        await salvar();
        var r = await api('POST', '/api/contratos/' + c.id + '/enviar', {});
        toast('Enviada: protocolo ' + r.protocolo + '. Minuta até ' + dataHoraCr(r.prazo) + (r.diretoria.length ? '. A diretoria foi avisada.' : '.') + (r.sem_convencao ? ' Falta a convenção: sem ela o contrato não é assinado.' : ''), 'ok');
        recarregar();
      } catch (e) { toast(e.message, 'erro'); recarregar(); }
    };
  }

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
    try { resumoCredito = await api('GET', '/api/credito/resumo'); } catch (e) { /* aparece no próximo ciclo */ }
    try { resumoImp = await api('GET', '/api/implantacoes/resumo'); } catch (e) { /* aparece no próximo ciclo */ }
    try { resumoCt = await api('GET', '/api/contratos/resumo'); } catch (e) { /* aparece no próximo ciclo */ }
    montarCasca();
    carregarTutoriais();
    atualizarResumo();
    atualizarComissao();
    buscarAvisos();
    $('#btSino').onclick = abrirAvisos;
    setInterval(function () { atualizarResumo(); atualizarComissao(); atualizarCredito(); atualizarImp(); atualizarCt(); buscarAvisos(); }, 30 * 1000);
    window.addEventListener('hashchange', rotear);
    rotear();
  }
  iniciar();
})();

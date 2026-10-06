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
    banco: svg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>'),
  };
  var ROTULO_ICONE = { app: 'Genérico', calculadora: 'Calculadora', grafico: 'Gráfico', aperto: 'Negociação', caixa: 'Pacote', carteira: 'Carteira', documento: 'Documento', pessoas: 'Pessoas', ticket: 'Ticket', casa: 'Condomínio', calendario: 'Calendário', escudo: 'Segurança' };

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
    var html = termo ? '' : '<a href="#/" class="' + (rota === '#/' ? 'on' : '') + '">' + IC.inicio + 'Início</a>';
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
        '<a href="#/admin/auditoria" class="' + (rota.indexOf('#/admin/auditoria') === 0 ? 'on' : '') + '">' + IC.historico + 'Histórico de atividades</a>';
    }
    $('#nav').innerHTML = html;
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
    if (partes[0] === 'admin' && eu.papel === 'admin') {
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
          '<td>' + (u.papel === 'admin' ? 'Administrador' : 'Usuário') + '</td><td>' + ferr + '</td><td>' + quando(u.ultimo_login) + '</td>' +
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
            '<button class="btn icon danger" data-apagar="' + s.id + '" title="Remover setor"' + (s.modulos ? ' disabled' : '') + '>' + IC.fechar + '</button></div>';
        }).join('') + '</div><div class="linha"><input class="campo" id="novoSetor" placeholder="Novo setor" style="flex:1"><button class="btn ghost" id="btAddSetor">' + IC.mais + 'Adicionar</button></div>' +
          '<div class="ajuda">Só é possível remover setores sem módulos.</div></div>',
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
          res.innerHTML = '<div class="msg ok" style="margin-top:8px">Arquivo publicado. Quem abrir a ferramenta já recebe a nova versão.</div>' +
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
              var ehPadrao = mod.adaptador === 'gas-linhas' && c === mod.config.colecao_padrao;
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

  /* ======================= admin: auditoria ======================= */
  var ROTULO_ACAO = {
    login: 'Entrou no portal', login_falha: 'Tentativa de login falhou', logout: 'Saiu', senha_alterada: 'Trocou a senha', senha_redefinida: 'Redefiniu senha de usuário',
    modulo_aberto: 'Abriu ferramenta', dados_gravados: 'Salvou dados (automático)', usuario_criado: 'Criou usuário', usuario_editado: 'Editou usuário',
    modulo_criado: 'Criou módulo', modulo_editado: 'Editou módulo', modulo_removido: 'Removeu módulo', arquivo_enviado: 'Enviou HTML', versao_restaurada: 'Restaurou versão',
    dados_importados: 'Importou dados da planilha', dados_exportados: 'Exportou dados', backup_baixado: 'Baixou backup', setor_criado: 'Criou setor', setor_editado: 'Editou setor', setor_removido: 'Removeu setor',
    registro_add: 'Incluiu registro', registro_update: 'Alterou registro', registro_delete: 'Excluiu registro', registro_upsert: 'Gravou registro', registro_addMany: 'Incluiu registros em lote', registro_replaceAll: 'Regravou a aba inteira', registro_dedupe: 'Removeu duplicados',
    catalogo_semeado: 'Sistema instalado',
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
    montarCasca();
    window.addEventListener('hashchange', rotear);
    rotear();
  }
  iniciar();
})();

/* Ponte de armazenamento MyBlue — injetada no início de cada ferramenta.
 * Quando o módulo usa armazenamento "usuario" ou "compartilhado", o localStorage
 * da ferramenta passa a ser guardado no banco do portal, sem mudar o código dela. */
(function () {
  'use strict';
  var C = window.__MYBLUE__ || {};
  var noTopo = window.parent && window.parent !== window;

  function avisarPortal(tipo, extra) {
    if (!noTopo) return;
    try { window.parent.postMessage({ myblue: true, tipo: tipo, modulo: C.modulo, extra: extra || null }, location.origin); } catch (e) { /* sem portal */ }
  }

  (C.avisos || []).forEach(function (a) {
    document.addEventListener('DOMContentLoaded', function () {
      var d = document.createElement('div');
      d.textContent = '⚠ ' + a;
      d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:#fbf0db;color:#7a5a1c;border:1px solid #ecd8a8;border-radius:12px;padding:10px 14px;font:600 13px system-ui,sans-serif';
      document.body.appendChild(d);
    });
  });

  if (C.modo !== 'usuario' && C.modo !== 'compartilhado') return;

  var real = null;
  try { real = window.localStorage; } catch (e) { real = null; }
  var locais = (C.locais || []).map(function (p) { return new RegExp(p); });
  function ehLocal(k) { for (var i = 0; i < locais.length; i++) if (locais[i].test(k)) return true; return false; }

  var mem = Object.create(null);
  var dados = C.dados || {};
  Object.keys(dados).forEach(function (k) { mem[k] = String(dados[k]); });

  var pend = { set: {}, del: {}, limpar: false };
  var temPend = false, timer = null, enviando = false, tentativa = 0;

  function agendar() {
    temPend = true;
    avisarPortal('salvando');
    clearTimeout(timer);
    timer = setTimeout(enviar, 400);
  }

  function retirarPendencias() {
    var p = pend;
    pend = { set: {}, del: {}, limpar: false };
    temPend = false;
    return p;
  }

  function devolverPendencias(p) {
    // o que foi alterado depois tem prioridade sobre o lote que falhou
    var atual = pend;
    pend = p;
    if (atual.limpar) { pend = { set: {}, del: {}, limpar: true }; }
    Object.keys(atual.set).forEach(function (k) { pend.set[k] = atual.set[k]; delete pend.del[k]; });
    Object.keys(atual.del).forEach(function (k) { pend.del[k] = 1; delete pend.set[k]; });
    temPend = true;
  }

  function corpo(p) {
    return JSON.stringify({ set: p.set, del: Object.keys(p.del), limpar: p.limpar });
  }

  function enviar(saindo) {
    if (!temPend) return;
    if (enviando && !saindo) { clearTimeout(timer); timer = setTimeout(enviar, 300); return; }
    var p = retirarPendencias();
    var body = corpo(p);
    var url = '/api/armazenamento/' + encodeURIComponent(C.modulo);
    if (saindo) {
      try {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: body.length < 60000, credentials: 'same-origin' })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); if (!temPend) avisarPortal('salvo'); })
          .catch(function () { devolverPendencias(p); agendar(); });
      } catch (e) { devolverPendencias(p); }
      return;
    }
    enviando = true;
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        tentativa = 0;
        enviando = false;
        if (temPend) agendar(); else avisarPortal('salvo');
      })
      .catch(function (e) {
        enviando = false;
        devolverPendencias(p);
        tentativa++;
        avisarPortal('erro', String(e && e.message || e));
        clearTimeout(timer);
        timer = setTimeout(enviar, Math.min(1000 * Math.pow(2, tentativa), 30000));
      });
  }

  function chaves() {
    var ks = Object.keys(mem);
    if (real) {
      for (var i = 0; i < real.length; i++) { var k = real.key(i); if (k != null && ehLocal(k)) ks.push(k); }
    }
    return ks;
  }

  var api = {
    getItem: function (k) {
      k = String(k);
      if (ehLocal(k)) return real ? real.getItem(k) : null;
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    setItem: function (k, v) {
      k = String(k); v = String(v);
      if (ehLocal(k)) { if (real) real.setItem(k, v); return; }
      mem[k] = v; pend.set[k] = v; delete pend.del[k]; agendar();
    },
    removeItem: function (k) {
      k = String(k);
      if (ehLocal(k)) { if (real) real.removeItem(k); return; }
      if (!(k in mem)) return;
      delete mem[k]; pend.del[k] = 1; delete pend.set[k]; agendar();
    },
    clear: function () {
      Object.keys(mem).forEach(function (k) { delete mem[k]; });
      pend = { set: {}, del: {}, limpar: true };
      if (real) chaves().forEach(function (k) { if (ehLocal(k)) real.removeItem(k); });
      agendar();
    },
    key: function (i) { var ks = chaves(); return i >= 0 && i < ks.length ? ks[i] : null; },
  };
  Object.defineProperty(api, 'length', { get: function () { return chaves().length; }, enumerable: false, configurable: true });

  var proxy = new Proxy(api, {
    get: function (t, p) {
      if (typeof p === 'symbol') return t[p];
      if (p in t) { var v = t[p]; return typeof v === 'function' ? v.bind(t) : v; }
      var r = t.getItem(p); return r === null ? undefined : r;
    },
    set: function (t, p, v) { if (typeof p !== 'symbol') t.setItem(p, v); return true; },
    deleteProperty: function (t, p) { if (typeof p !== 'symbol') t.removeItem(p); return true; },
    has: function (t, p) { return (p in t) || (typeof p !== 'symbol' && t.getItem(p) !== null); },
    ownKeys: function () { return chaves(); },
    getOwnPropertyDescriptor: function (t, p) {
      if (typeof p === 'symbol') return undefined;
      var v = t.getItem(p);
      return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true };
    },
  });

  try {
    Object.defineProperty(window, 'localStorage', { configurable: true, enumerable: true, get: function () { return proxy; } });
  } catch (e) {
    console.warn('[MyBlue] não foi possível ligar o armazenamento ao servidor; usando o navegador.', e);
    return;
  }

  function sair() { if (temPend) { clearTimeout(timer); enviar(true); } }
  window.addEventListener('pagehide', sair);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') sair(); });
  window.__MYBLUE_ARMAZENAMENTO__ = { pendente: function () { return temPend || enviando; }, enviarAgora: function () { clearTimeout(timer); enviar(); } };
})();

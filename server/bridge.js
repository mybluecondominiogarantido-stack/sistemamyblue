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

  if (C.claudeDb) instalarClaude();

  /* Ferramentas feitas como artefato do Claude usam window.claude.use('db' | 'user' | 'downloads').
   * Aqui o portal oferece o mesmo contrato, com os documentos guardados no banco do portal:
   * a página carrega tudo uma vez e depois busca só o que mudou a cada poucos segundos. */
  function instalarClaude() {
    var base = '/api/db/' + encodeURIComponent(C.modulo);
    var U = C.usuario || {};
    var SEG_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
    var porColecao = Object.create(null); // coleção → { id → { raw, snap } }
    var seq = 0, carregado = null, ultimoErro = null, timerPoll = null, buscando = null;
    var pendentes = Object.create(null); // caminho → nº de gravações em andamento
    var assinaturas = [];
    var META = Object.freeze({ fromCache: false, hasPendingWrites: false });
    var ausentes = Object.create(null);

    function erroDb(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
    function congelar(v) {
      if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.keys(v).forEach(function (k) { congelar(v[k]); }); }
      return v;
    }
    function copiar(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
    function ehObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
    function mesclar(a, b) {
      var s = {}; Object.keys(a).forEach(function (k) { s[k] = a[k]; });
      Object.keys(b).forEach(function (k) { s[k] = ehObj(b[k]) && ehObj(s[k]) ? mesclar(s[k], b[k]) : b[k]; });
      return s;
    }
    function caminho(p, par) {
      var s = String(p == null ? '' : p);
      var partes = s.split('/');
      if (partes.length > 16 || s.length > 1000) throw new TypeError('caminho longo demais: ' + s);
      for (var i = 0; i < partes.length; i++) {
        if (!SEG_RE.test(partes[i]) || partes[i] === '.' || partes[i] === '..') throw new TypeError('trecho inválido no caminho "' + s + '"');
      }
      if ((partes.length % 2 === 0) !== par) throw new TypeError((par ? 'documento' : 'coleção') + ' com número de trechos errado (' + partes.length + '): ' + s);
      return s;
    }
    function separar(p) { var i = p.lastIndexOf('/'); return { c: p.slice(0, i), id: p.slice(i + 1) }; }
    function novoId() { var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = ''; var b = new Uint8Array(20); crypto.getRandomValues(b); for (var i = 0; i < 20; i++) s += a[b[i] % 36]; return s; }

    function snapDoc(id, raw) {
      var d = congelar(copiar(raw));
      return Object.freeze({ id: id, exists: true, data: function () { return d; }, metadata: META });
    }
    function snapAusente(p) {
      if (!ausentes[p]) { var id = separar(p).id; ausentes[p] = Object.freeze({ id: id, exists: false, data: function () { return undefined; }, metadata: META }); }
      return ausentes[p];
    }
    function entrada(p) { var x = separar(p); var col = porColecao[x.c]; return col ? col[x.id] : undefined; }
    function snapDe(p) { var e = entrada(p); return e ? e.snap : snapAusente(p); }
    /* grava no cache local; devolve true se mudou algo */
    function aplicar(c, id, raw) {
      var col = porColecao[c] || (porColecao[c] = Object.create(null));
      var atual = col[id];
      if (raw == null) { if (!atual) return false; delete col[id]; return true; }
      var txt = JSON.stringify(raw);
      if (atual && atual.txt === txt) return false;
      col[id] = { txt: txt, raw: raw, snap: snapDoc(id, raw) };
      return true;
    }

    function pedir(metodo, url, corpo) {
      return fetch(url, { method: metodo, credentials: 'same-origin', headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined })
        .catch(function () { throw erroDb('unavailable', 'Sem conexão com o portal.'); })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.ok) return j;
            var code = j.code || (r.status === 400 || r.status === 413 ? 'invalid_argument' : r.status === 429 ? 'resource_exhausted' : r.status === 401 || r.status === 403 ? 'revoked' : 'unavailable');
            throw erroDb(code, j.erro || ('HTTP ' + r.status));
          });
        });
    }

    function buscar(tudo) {
      if (buscando) return tudo ? buscando.catch(function () {}).then(function () { return buscar(true); }) : buscando;
      buscando = pedir('GET', base + '?desde=' + (tudo ? 0 : seq)).then(function (r) {
        var mudou = false;
        if (tudo) {
          // recomeça do zero, mas mantém os objetos que não mudaram (a página compara com ===)
          var vistos = Object.create(null);
          r.docs.forEach(function (d) { vistos[d.c + '/' + d.id] = 1; });
          Object.keys(porColecao).forEach(function (c) { Object.keys(porColecao[c]).forEach(function (id) {
            var p = c + '/' + id; if (!vistos[p] && !pendentes[p]) { delete porColecao[c][id]; mudou = true; }
          }); });
        }
        r.docs.forEach(function (d) { if (!pendentes[d.c + '/' + d.id] && aplicar(d.c, d.id, d.d)) mudou = true; });
        seq = r.seq;
        ultimoErro = null;
        avisarPortal('salvo');
        if (mudou || tudo) notificar();
      }).catch(function (e) {
        ultimoErro = e;
        if (e.code === 'revoked') assinaturas.slice().forEach(function (a) { a.morrer(e); });
        throw e;
      }).then(function (x) { buscando = null; return x; }, function (e) { buscando = null; throw e; });
      return buscando;
    }
    function iniciar() {
      if (!carregado) {
        carregado = buscar(true);
        carregado.catch(function () { carregado = null; });
        agendarPoll();
      }
      return carregado;
    }
    function agendarPoll() {
      clearTimeout(timerPoll);
      var oculto = document.visibilityState === 'hidden';
      timerPoll = setTimeout(function () {
        var p = carregado ? buscar(false) : iniciar();
        p.catch(function () {}).then(agendarPoll);
      }, ultimoErro ? 10000 : oculto ? 30000 : 3000);
    }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && carregado) { buscar(false).catch(function () {}); agendarPoll(); } });

    /* ---------- consultas ---------- */
    function compara(a, b) {
      if (a === b) return 0;
      if (a === undefined) return 1; if (b === undefined) return -1;
      if (typeof a === typeof b) return a < b ? -1 : a > b ? 1 : 0;
      var ordem = { 'boolean': 1, 'number': 2, 'string': 3, 'object': 4 };
      return (ordem[typeof a] || 9) - (ordem[typeof b] || 9);
    }
    function confere(v, op, x) {
      switch (op) {
        case '==': return JSON.stringify(v) === JSON.stringify(x);
        case '!=': return v !== undefined && JSON.stringify(v) !== JSON.stringify(x);
        case '<': return v !== undefined && compara(v, x) < 0;
        case '<=': return v !== undefined && compara(v, x) <= 0;
        case '>': return v !== undefined && compara(v, x) > 0;
        case '>=': return v !== undefined && compara(v, x) >= 0;
        case 'in': return (x || []).some(function (y) { return JSON.stringify(y) === JSON.stringify(v); });
        case 'not-in': return v !== undefined && !(x || []).some(function (y) { return JSON.stringify(y) === JSON.stringify(v); });
        case 'array-contains': return Array.isArray(v) && v.some(function (y) { return JSON.stringify(y) === JSON.stringify(x); });
        default: throw erroDb('invalid_argument', 'operador inválido: ' + op);
      }
    }
    function executar(q) {
      var col = porColecao[q.c] || {};
      var ids = Object.keys(col).sort();
      var lista = [];
      ids.forEach(function (id) {
        var e = col[id];
        if (q.w.every(function (f) { return confere(e.raw[f[0]], f[1], f[2]); })) lista.push(e.snap);
      });
      if (q.o) {
        var campo = q.o[0], dir = q.o[1] === 'desc' ? -1 : 1;
        lista.sort(function (a, b) {
          var va = a.data()[campo], vb = b.data()[campo];
          if (va === undefined && vb !== undefined) return 1;
          if (vb === undefined && va !== undefined) return -1;
          return dir * compara(va, vb) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        });
      }
      if (q.l) lista = lista.slice(0, q.l);
      return lista;
    }
    function snapConsulta(docs, antes) {
      var mudancas = [];
      var antesIdx = new Map(), depoisIdx = new Map();
      (antes || []).forEach(function (d, i) { antesIdx.set(d.id, { d: d, i: i }); });
      docs.forEach(function (d, i) { depoisIdx.set(d.id, i); });
      (antes || []).forEach(function (d, i) { if (!depoisIdx.has(d.id)) mudancas.push({ type: 'removed', doc: d, oldIndex: i, newIndex: -1 }); });
      docs.forEach(function (d, i) {
        var a = antesIdx.get(d.id);
        if (!a) mudancas.push({ type: 'added', doc: d, oldIndex: -1, newIndex: i });
        else if (a.d !== d || a.i !== i) mudancas.push({ type: 'modified', doc: d, oldIndex: a.i, newIndex: i });
      });
      return Object.freeze({ docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return mudancas; }, metadata: META });
    }
    function mesmaLista(a, b) { if (!a || a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

    // entrega as mudanças logo depois, nunca no meio da chamada que gravou
    var notificando = false;
    function notificar() {
      if (notificando) return;
      notificando = true;
      Promise.resolve().then(function () { notificando = false; assinaturas.slice().forEach(function (a) { a.rodar(); }); });
    }
    function assinar(calcular, entregar, erro) {
      var a = { vivo: true, ultimo: undefined, primeira: true };
      a.rodar = function () {
        if (!a.vivo) return;
        var r = calcular();
        if (!a.primeira && (r.lista ? mesmaLista(a.ultimo, r.lista) : a.ultimo === r.snap)) return;
        var antes = a.ultimo; a.ultimo = r.lista || r.snap; a.primeira = false;
        try { entregar(r.lista ? snapConsulta(r.lista, antes) : r.snap); } catch (e) { setTimeout(function () { throw e; }); }
      };
      a.morrer = function (e) {
        if (!a.vivo) return; a.vivo = false; assinaturas.splice(assinaturas.indexOf(a), 1);
        if (erro) try { erro({ code: e.code, message: e.message }); } catch (_) { /* ignora */ }
      };
      assinaturas.push(a);
      iniciar().then(function () { a.rodar(); }, function (e) {
        // sem conexão na primeira carga: tenta de novo sozinho; o "next" vem quando carregar
        if (e.code === 'revoked' || e.code === 'not_granted') a.morrer(e);
        else { var t = setInterval(function () { if (!a.vivo) return clearInterval(t); if (carregado) { clearInterval(t); carregado.then(function () { a.rodar(); }, function () {}); } }, 2000); }
      });
      return function () { if (!a.vivo) return; a.vivo = false; var i = assinaturas.indexOf(a); if (i >= 0) assinaturas.splice(i, 1); };
    }

    /* ---------- gravações ---------- */
    var filas = Object.create(null);
    function gravar(op, p, dados) {
      var x = separar(p);
      var anterior = entrada(p);
      var anteriorRaw = anterior ? anterior.raw : null;
      if (op === 'update' && !anterior) return Promise.reject(erroDb('invalid_argument', 'O documento ' + p + ' não existe.'));
      if (op !== 'delete' && !ehObj(dados)) return Promise.reject(erroDb('invalid_argument', 'O documento precisa ser um objeto.'));
      var corpo = op === 'delete' ? undefined : copiar(dados);
      // mostra na hora (como o Claude faz) e confirma no servidor
      if (aplicar(x.c, x.id, op === 'delete' ? null : op === 'update' ? mesclar(anteriorRaw, corpo) : corpo)) notificar();
      pendentes[p] = (pendentes[p] || 0) + 1;
      avisarPortal('salvando');
      var envio = (filas[p] || Promise.resolve()).catch(function () {}).then(function () {
        return pedir('POST', base, { ops: [{ op: op, path: p, data: corpo }] });
      });
      filas[p] = envio;
      return envio.then(function () {
        pendentes[p]--; if (!pendentes[p]) delete pendentes[p];
        setTimeout(function () { buscar(false).catch(function () {}); }, 50);
      }, function (e) {
        pendentes[p]--; if (!pendentes[p]) delete pendentes[p];
        avisarPortal('erro', e.message);
        buscar(true).catch(function () {}); // desfaz o que foi mostrado e volta ao que está no servidor
        throw { code: e.code, message: e.message };
      });
    }

    /* ---------- referências ---------- */
    function refDoc(p) {
      p = caminho(p, true);
      var x = separar(p);
      return Object.freeze({
        id: x.id, path: p,
        get: function () { return iniciar().then(function () { return buscar(false).catch(function () {}); }).then(function () { return snapDe(p); }); },
        set: function (d) { return gravar('set', p, d); },
        update: function (d) { return iniciar().then(function () { return gravar('update', p, d); }); },
        'delete': function () { return gravar('delete', p); },
        acquire: function (o) {
          o = o || {};
          return pedir('POST', base + '/trava', { path: p, holder: o.holder, ttlMs: o.ttlMs, data: o.data })
            .then(function (r) { if (o.data) buscar(false).catch(function () {}); return r; }, function (e) { throw { code: e.code, message: e.message }; });
        },
        onSnapshot: function (next, erro) { return assinar(function () { return { snap: snapDe(p) }; }, next, erro); },
        collection: function (sub) { return refColecao(p + '/' + sub); },
      });
    }
    function consulta(c, q) {
      return {
        where: function (f, op, v) { if (q.w.length >= 10) throw erroDb('invalid_argument', 'filtros demais'); return Object.freeze(consulta(c, { w: q.w.concat([[f, op, v]]), o: q.o, l: q.l })); },
        orderBy: function (f, dir) { return Object.freeze(consulta(c, { w: q.w, o: [f, dir || 'asc'], l: q.l })); },
        limit: function (n) { return Object.freeze(consulta(c, { w: q.w, o: q.o, l: Math.max(1, Math.min(1000, n | 0)) })); },
        get: function () { return iniciar().then(function () { return buscar(false).catch(function () {}); }).then(function () { return snapConsulta(executar({ c: c, w: q.w, o: q.o, l: q.l })); }); },
        onSnapshot: function (next, erro) { var qq = { c: c, w: q.w, o: q.o, l: q.l }; return assinar(function () { return { lista: executar(qq) }; }, next, erro); },
      };
    }
    function refColecao(c) {
      c = caminho(c, false);
      var r = consulta(c, { w: [], o: null, l: 0 });
      r.path = c;
      r.doc = function (id) { return refDoc(c + '/' + (id == null ? novoId() : id)); };
      r.add = function (d) { var ref = r.doc(); return ref.set(d).then(function () { return ref; }); };
      return Object.freeze(r);
    }
    var DB = Object.freeze({ doc: refDoc, collection: refColecao });

    /* ---------- quem está usando ---------- */
    var meuId = 'mb-' + U.id;
    var minhaFoto = U.foto_v ? '/api/usuarios/' + U.id + '/foto?v=' + U.foto_v : '';
    var cachePessoas = Object.create(null);
    cachePessoas[meuId] = Object.freeze({ id: meuId, name: U.nome || '', avatarUrl: minhaFoto, color: '#0c77be', email: U.email || null, isMe: true, guest: false });
    var USER = Object.freeze({
      id: function () { return Promise.resolve(meuId); },
      me: function () { return Promise.resolve(Object.freeze({ id: meuId, name: U.nome || '', avatarUrl: minhaFoto, color: '#0c77be', email: U.email || null, isOwner: !!U.admin, canEdit: !!U.admin })); },
      isOwner: function () { return Promise.resolve(!!U.admin); },
      canEdit: function () { return Promise.resolve(!!U.admin); },
      can: function (n) { return Promise.resolve(n === 'data.write' ? true : null); },
      name: function () { return Promise.resolve(U.nome || ''); },
      email: function () { return Promise.resolve(U.email || null); },
      avatarUrl: function () { return Promise.resolve(minhaFoto || null); },
      search: function () { return Promise.resolve([]); },
      profiles: function (ids) {
        ids = (Array.isArray(ids) ? ids : [ids]).filter(function (x) { return typeof x === 'string' && x; });
        var faltam = ids.filter(function (x) { return !(x in cachePessoas); });
        var p = faltam.length ? pedir('GET', base + '/pessoas?ids=' + encodeURIComponent(faltam.join(','))).then(function (r) {
          faltam.forEach(function (id) {
            var x = (r.pessoas || {})[id];
            cachePessoas[id] = Object.freeze({ id: id, name: x ? x.name : '', avatarUrl: x ? x.avatarUrl : '', color: '#0c77be', email: x ? x.email : null, isMe: id === meuId, guest: false });
          });
        }).catch(function () {}) : Promise.resolve();
        return p.then(function () { var s = {}; ids.forEach(function (id) { if (cachePessoas[id]) s[id] = cachePessoas[id]; }); return s; });
      },
    });

    /* ---------- arquivo para baixar ---------- */
    var DOWNLOADS = Object.freeze({
      save: function (req) {
        try {
          var d = req && req.data;
          var blob = d instanceof Blob ? d : new Blob([d]);
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = String(req.filename || 'arquivo');
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
          return Promise.resolve({ status: 'saved' });
        } catch (e) { return Promise.reject({ code: 'bad_request', message: String(e && e.message || e) }); }
      },
    });

    var CAP = { db: DB, user: USER, downloads: DOWNLOADS };
    var claude = Object.freeze({ use: function (nome) { return Promise.resolve(CAP[nome] || null); } });
    try { Object.defineProperty(window, 'claude', { value: claude, configurable: false, enumerable: true, writable: false }); } catch (e) { window.claude = claude; }
  }

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

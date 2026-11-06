/* Nomes trocados no portal — injetado em cada ferramenta, logo depois da ponte de armazenamento.
 * Configurações → Nomes e abas → Abas das ferramentas: "texto que aparece" → "novo nome". Troca o texto
 * onde ele aparece sozinho (abas, botões, títulos), inclusive no que a ferramenta desenha depois de abrir.
 * Só troca um texto inteiro igual ao cadastrado: "Recibos" muda, "Recibos de março" continua igual. */
(function () {
  'use strict';
  var T = (window.__MYBLUE__ || {}).textos;
  if (!T || typeof T !== 'object') return;
  var mapa = Object.create(null);
  Object.keys(T).forEach(function (k) { var o = k.trim(), n = String(T[k] || '').trim(); if (o && n && o !== n) mapa[o] = n; });
  if (!Object.keys(mapa).length) return;
  var PULAR = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, TEMPLATE: 1 };
  // o que este script escreveu não é trocado de novo (evita A → B → A sem fim quando dois nomes se cruzam)
  var escrito = typeof WeakMap === 'function' ? new WeakMap() : null;

  function trocarNo(no) {
    var v = no.nodeValue;
    if (!v || (escrito && escrito.get(no) === v)) return;
    var t = v.trim();
    var novo = mapa[t];
    if (!novo) return;
    var pai = no.parentNode;
    if (pai && (PULAR[pai.nodeName] || pai.isContentEditable)) return;
    var i = v.indexOf(t);
    no.nodeValue = v.slice(0, i) + novo + v.slice(i + t.length);
    if (escrito) escrito.set(no, no.nodeValue);
  }
  function trocarEm(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) { trocarNo(raiz); return; }
    if (raiz.nodeType !== 1 && raiz.nodeType !== 9 && raiz.nodeType !== 11) return;
    if (PULAR[raiz.nodeName]) return;
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, null);
    for (var n = w.nextNode(); n; n = w.nextNode()) trocarNo(n);
  }
  function iniciar() {
    trocarEm(document.body);
    if (document.title && mapa[document.title.trim()]) document.title = mapa[document.title.trim()];
    new MutationObserver(function (lista) {
      lista.forEach(function (m) {
        if (m.type === 'characterData') trocarNo(m.target);
        else for (var i = 0; i < m.addedNodes.length; i++) trocarEm(m.addedNodes[i]);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) iniciar(); else document.addEventListener('DOMContentLoaded', iniciar);
})();

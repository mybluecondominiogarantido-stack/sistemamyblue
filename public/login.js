(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var senhaDigitada = '';

  function mostrar(el, texto) { el.textContent = texto; el.hidden = !texto; }

  function destino() {
    var v = new URLSearchParams(location.search).get('volta') || '/';
    return v.charAt(0) === '/' && v.charAt(1) !== '/' ? v : '/';
  }

  async function enviar(url, corpo) {
    var r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), credentials: 'same-origin' });
    var j = {};
    try { j = await r.json(); } catch (e) { /* sem corpo */ }
    if (!r.ok) throw new Error(j.erro || 'Não foi possível concluir. Tente de novo.');
    return j;
  }

  $('#fLogin').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    mostrar($('#msg'), '');
    var bt = $('#btEntrar');
    bt.disabled = true; bt.textContent = 'Entrando…';
    try {
      senhaDigitada = $('#senha').value;
      var j = await enviar('/api/auth/login', { email: $('#email').value, senha: senhaDigitada });
      if (j.usuario.trocar_senha) {
        $('#fLogin').hidden = true; $('#fTroca').hidden = false; $('#nova').focus();
      } else {
        location.href = destino();
      }
    } catch (e) {
      mostrar($('#msg'), e.message);
    } finally {
      bt.disabled = false; bt.textContent = 'Entrar';
    }
  });

  $('#fTroca').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    mostrar($('#msg2'), '');
    if ($('#nova').value !== $('#nova2').value) return mostrar($('#msg2'), 'As senhas não conferem.');
    try {
      await enviar('/api/auth/senha', { atual: senhaDigitada, nova: $('#nova').value });
      location.href = destino();
    } catch (e) {
      mostrar($('#msg2'), e.message);
    }
  });

  // já está logado? vai direto
  fetch('/api/auth/eu', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (j && j.usuario && !j.usuario.trocar_senha) location.href = destino();
  }).catch(function () {});
})();

/* Hüpfabenteuer – Anreise live anzeigen.
   hbAnreise.watch({ felder:[…ids], ziel:'id', baueText:function(){…} })
   Fragt /.netlify/functions/anreise ab, sobald genug Adresse da ist.
   Ergebnis liegt danach in window.hbAnreiseWert ({km, ort, anreise, mitEmpfehlung}). */
(function(){
  'use strict';
  var letzte = '', timer = null, nr = 0;
  function zeige(ziel, html, ok){
    var el = document.getElementById(ziel); if(!el) return;
    if(!html){ el.hidden = true; el.innerHTML = ''; return; }
    el.innerHTML = html; el.hidden = false; el.className = 'anreise-info' + (ok ? ' ok' : '');
  }
  function frage(q, opt){
    var meine = ++nr;
    zeige(opt.ziel, 'Anreise wird berechnet …', false);
    fetch('/.netlify/functions/anreise?q=' + encodeURIComponent(q), { headers:{ 'Accept':'application/json' } })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(meine !== nr) return;
        if(!d || !d.ok){ window.hbAnreiseWert = null; zeige(opt.ziel, '', false); if(opt.danach) opt.danach(null); return; }
        window.hbAnreiseWert = d;
        zeige(opt.ziel,
          '<b>Anreise ca. ' + d.anreise + ' €</b> · ' + d.km + ' km ab Glödnitz nach ' + esc(d.ort) +
          '<br><span>Mit Empfehlung nur ca. ' + d.mitEmpfehlung + ' €. Den genauen Betrag findest du im Angebot.</span>', true);
        if(opt.danach) opt.danach(d);
      })
      .catch(function(){ if(meine === nr){ window.hbAnreiseWert = null; zeige(opt.ziel, '', false); if(opt.danach) opt.danach(null); } });
  }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  window.hbAnreiseWert = null;
  window.hbAnreise = {
    watch: function(opt){
      function los(){
        var q = opt.baueText();
        if(!q || q.replace(/[^A-Za-zÄÖÜäöüß0-9]/g,'').length < 3){ return; }
        if(q === letzte) return;
        letzte = q; frage(q, opt);
      }
      opt.felder.forEach(function(id){
        var el = document.getElementById(id); if(!el) return;
        el.addEventListener('change', los);
        el.addEventListener('blur', los);
        el.addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(los, 1200); });
      });
      setTimeout(los, 300);
    },
    text: function(){ var d = window.hbAnreiseWert; return d ? (d.km + ' km nach ' + d.ort + ' → ca. ' + d.anreise + ' € (mit Empfehlung ca. ' + d.mitEmpfehlung + ' €)') : ''; }
  };
})();

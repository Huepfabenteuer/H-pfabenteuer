/* ═══════════════════════════════════════════════════════════════
   HÜPFABENTEUER — Empfehlungen & Partner
   ───────────────────────────────────────────────────────────────
   Zwei Arten von Links werden erkannt:

     ?partner=CODE      Partnerprogramm (Betriebe, 15 %)
     ?empfehlung=CODE   Kunden-Empfehlung (30 € Rabatt auf die
                        Anreise für den, der den Link weitergibt)

   • Der Code bleibt beim Klicken durch die Website erhalten
     (wird an alle internen Links angehängt).
   • Bei jeder Anfrage über ein Formular kommt er als eigenes Feld
     mit, und im Betreff steht [Partner: CODE] bzw.
     [Empfehlung: CODE].
   • Es wird NICHTS im Browser gespeichert (kein Cookie, kein
     localStorage) – deshalb ist dafür keine Einwilligung nötig.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var ARTEN = [
    { param: 'partner',    feld: 'Partner',       betreff: 'Partner'    },
    { param: 'empfehlung', feld: 'Empfehlung von', betreff: 'Empfehlung' }
  ];

  var gefunden = [];
  ARTEN.forEach(function(a){
    var v = '';
    try{
      v = (new URLSearchParams(location.search).get(a.param) || '')
            .replace(/[^A-Za-z0-9_-]/g,'').slice(0,40);
    }catch(e){}
    if(v) gefunden.push({ art: a, code: v });
  });

  window.hbPartner = function(){
    var p = gefunden.filter(function(g){ return g.art.param === 'partner'; })[0];
    return p ? p.code : '';
  };
  window.hbEmpfehlung = function(){
    var e = gefunden.filter(function(g){ return g.art.param === 'empfehlung'; })[0];
    return e ? e.code : '';
  };

  if(!gefunden.length) return;

  /* Codes an Formular-Anfragen anhängen */
  var of = window.fetch;
  if(of){
    window.fetch = function(url, opts){
      try{
        var u = typeof url === 'string' ? url : (url && url.url) || '';
        if(/formcarry\.com/.test(u) && opts && typeof FormData !== 'undefined'
           && opts.body instanceof FormData){
          var zusatz = [];
          gefunden.forEach(function(g){
            if(!opts.body.has(g.art.feld)){
              opts.body.append(g.art.feld, g.code);
              zusatz.push(g.art.betreff + ': ' + g.code);
            }
          });
          if(zusatz.length){
            var s = opts.body.get('subject');
            opts.body.set('subject', (s || 'Neue Anfrage') + ' [' + zusatz.join(' | ') + ']');
          }
        }
      }catch(e){}
      return of.apply(this, arguments);
    };
  }

  /* Codes an interne Links hängen, damit sie beim Weiterklicken bleiben */
  function tag(){
    document.querySelectorAll('a[href]').forEach(function(a){
      var h = a.getAttribute('href');
      if(!h || /^(#|tel:|mailto:|javascript:)/i.test(h)) return;
      try{
        var u = new URL(h, location.href);
        if(u.hostname !== location.hostname) return;
        var geaendert = false;
        gefunden.forEach(function(g){
          if(!u.searchParams.has(g.art.param)){
            u.searchParams.set(g.art.param, g.code);
            geaendert = true;
          }
        });
        if(geaendert) a.setAttribute('href', u.pathname + u.search + u.hash);
      }catch(e){}
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tag);
  else tag();
})();

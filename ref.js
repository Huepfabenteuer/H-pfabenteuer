/* ═══════════════════════════════════════════════════════════════
   HÜPFABENTEUER — Partner-Empfehlungen
   ───────────────────────────────────────────────────────────────
   Partner teilen Links wie  https://huepfabenteuer.at/?partner=CODE
   • Der Code bleibt beim Klicken durch die Website erhalten
     (wird an alle internen Links angehängt).
   • Bei jeder Anfrage über ein Formular kommt er als Feld "Partner"
     mit, und im Betreff steht [Partner: CODE].
   • Es wird NICHTS im Browser gespeichert (kein Cookie, kein
     localStorage) – deshalb ist dafür keine Einwilligung nötig.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  var p='';
  try{ p=(new URLSearchParams(location.search).get('partner')||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,40); }catch(e){}
  window.hbPartner=function(){ return p; };
  if(!p) return;

  /* Code an Formular-Anfragen anhängen */
  var of=window.fetch;
  if(of){
    window.fetch=function(url,opts){
      try{
        var u=typeof url==='string'?url:(url&&url.url)||'';
        if(/formcarry\.com/.test(u) && opts && typeof FormData!=='undefined' && opts.body instanceof FormData && !opts.body.has('Partner')){
          opts.body.append('Partner',p);
          var s=opts.body.get('subject');
          opts.body.set('subject',(s||'Neue Anfrage')+' [Partner: '+p+']');
        }
      }catch(e){}
      return of.apply(this,arguments);
    };
  }

  /* Code an interne Links hängen, damit er beim Weiterklicken bleibt */
  function tag(){
    document.querySelectorAll('a[href]').forEach(function(a){
      var h=a.getAttribute('href');
      if(!h || /^(#|tel:|mailto:|javascript:)/i.test(h)) return;
      try{
        var u=new URL(h,location.href);
        if(u.hostname!==location.hostname) return;
        if(!u.searchParams.has('partner')){ u.searchParams.set('partner',p); a.setAttribute('href',u.pathname+u.search+u.hash); }
      }catch(e){}
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',tag); else tag();
})();

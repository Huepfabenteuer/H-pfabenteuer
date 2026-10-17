/* Hüpfabenteuer – Leiste unten zeigt immer, wo man gerade ist.
   Auf Seiten mit Abschnitten (Startseite, Angebote) wechselt die
   Markierung beim Scrollen: Fotobox, Burgen oder Extras. */
(function(){
  'use strict';
  function ready(f){ if(document.readyState!=='loading') f(); else document.addEventListener('DOMContentLoaded',f); }
  ready(function(){
    var items=[].slice.call(document.querySelectorAll('.bnav .bi'));
    if(!items.length) return;
    function name(i){ return (i.textContent||'').trim(); }
    function set(n){
      items.forEach(function(i){
        var on = n && name(i)===n;
        i.classList.toggle('on',!!on);
        if(on) i.setAttribute('aria-current','page'); else i.removeAttribute('aria-current');
      });
    }
    var page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    var fix={'alienanleitung.html':'Burgen','piratenanleitung.html':'Burgen','ritterburganleitung.html':'Burgen','candyburganleitung.html':'Burgen',
             'fotobox.html':'Fotobox','fotobox-hochzeit.html':'Fotobox','fotobox-weihnachtsfeier.html':'Fotobox','fotorahmen.html':'Fotobox'};
    if(fix[page]) set(fix[page]);
    var current=items.filter(function(i){ return i.classList.contains('on'); })[0];
    var basis=current?name(current):'';

    var secs=[].slice.call(document.querySelectorAll('[data-nav]'));
    if(!secs.length) return;
    var tick=false;
    function update(){
      tick=false;
      var mid=window.innerHeight*0.45, hit='';
      secs.forEach(function(s){
        if(s.hidden || s.offsetParent===null) return;
        var r=s.getBoundingClientRect();
        if(r.top<=mid && r.bottom>=mid) hit=s.getAttribute('data-nav');
      });
      set(hit||basis);
    }
    window.addEventListener('scroll',function(){ if(!tick){ tick=true; requestAnimationFrame(update); } },{passive:true});
    window.addEventListener('hbfilter',function(e){ basis=(e.detail||''); update(); });
    update();
  });
})();

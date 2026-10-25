/* ═══════════════════════════════════════════════════════════════════════
   HÜPFABENTEUER — gemeinsame Rechen- und Textfunktionen für Anfragen
   Wird von der Server-Funktion und vom PDF benutzt.
   ═══════════════════════════════════════════════════════════════════════ */

import { FIRMA, anzahlungFuer } from './firma.mjs';

const TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function d(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  const x = new Date(iso); return isNaN(x) ? null : x;
}
export function datumKurz(iso) {
  const x = d(iso); if (!x) return '';
  const p = n => String(n).padStart(2, '0');
  // Zeitzone Wien für Zeitstempel, reine Datumsangaben bleiben wie sie sind
  if (/T\d/.test(String(iso))) {
    const s = x.toLocaleDateString('de-AT', { timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', year: 'numeric' });
    return s;
  }
  return p(x.getUTCDate()) + '.' + p(x.getUTCMonth() + 1) + '.' + x.getUTCFullYear();
}
export function datumLang(iso) {
  const x = d(iso); if (!x) return '';
  return TAGE[x.getUTCDay()] + ', ' + datumKurz(iso);
}
export function fristDatum(iso) {
  const x = d(iso); if (!x) return '3 Tage vor der Veranstaltung';
  x.setUTCDate(x.getUTCDate() - FIRMA.fristTage);
  return datumKurz(x.toISOString().slice(0, 10));
}

export function istLieferung(p) { return p && p.art === 'lieferung'; }

export function summen(a) {
  const pos = (a.positionen || []).filter(Boolean);
  const zahl = v => (v == null || v === '' || isNaN(Number(v))) ? 0 : Number(v);
  const miete = Math.round(pos.filter(p => !istLieferung(p)).reduce((s, p) => s + zahl(p.betrag), 0) * 100) / 100;
  const liefer = Math.round(pos.filter(istLieferung).reduce((s, p) => s + zahl(p.betrag), 0) * 100) / 100;
  const gesamt = Math.round((miete + liefer) * 100) / 100;
  const anzahlung = (a.anzahlung != null && a.anzahlung !== '' && !isNaN(Number(a.anzahlung))) ? Number(a.anzahlung) : anzahlungFuer(miete);
  const offen = pos.some(p => p.betrag == null || p.betrag === '');
  return { miete, liefer, gesamt, anzahlung, rest: Math.round((gesamt - anzahlung) * 100) / 100, offen };
}

/* Hauptprodukte (ohne Aufbau, Lieferung, Rabatt) für Kurztexte */
export function produkte(a) {
  return (a.positionen || []).filter(p => p && p.art === 'miete' && p.titel).map(p => p.titel);
}
export function produktText(a, kurz) {
  const pr = produkte(a);
  if (!pr.length) return kurz ? 'Miete' : 'laut Angebot';
  if (kurz) return pr[0];
  const auf = (a.positionen || []).some(p => p && /auf- und abbau/i.test(p.titel || ''));
  const extras = (a.positionen || []).filter(p => p && p.art === 'extra' && p.titel && !/auf- und abbau/i.test(p.titel)).map(p => p.titel);
  return pr.concat(extras).join(' + ') + (auf ? ' (Aufbau und Abbau durch Hüpfabenteuer)' : '');
}

export function anredeZeile(a) {
  const nn = (a.kunde.nachname || '').trim(), vn = (a.kunde.vorname || '').trim();
  if (a.anrede === 'herr' && nn) return 'Sehr geehrter Herr ' + nn + ',';
  if (a.anrede === 'frau' && nn) return 'Sehr geehrte Frau ' + nn + ',';
  return 'Guten Tag ' + (vn + ' ' + nn).trim() + ',';
}

/* Handynummer für wa.me: nur Ziffern, mit Ländervorwahl (Standard Österreich) */
export function waNummer(tel) {
  let t = String(tel || '').replace(/[^\d+]/g, '');
  if (t.startsWith('+')) t = t.slice(1);
  else if (t.startsWith('00')) t = t.slice(2);
  else if (t.startsWith('0')) t = '43' + t.slice(1);
  return t.replace(/\D/g, '');
}

/* ── Verfügbarkeit: welche Geräte sind an welchen Tagen fix vergeben ── */
const GERAETE = ['candyburg', 'feuerwehrburg', 'piratenburg', 'ritterburg', 'alienburg', 'hochzeitsburg'];

/* Schlüssel der gemieteten Geräte, z. B. ['fotobox'] oder ['alienburg'] */
export function geraeteSchluessel(a) {
  const out = new Set();
  for (const p of (a.positionen || [])) {
    if (!p || p.art !== 'miete') continue;
    const t = String(p.titel || '').toLowerCase();
    if (t.includes('fotobox')) out.add('fotobox');
    for (const g of GERAETE) if (t.includes(g)) out.add(g);
    if (t.includes('feuerwehr')) out.add('feuerwehrburg');
  }
  if (!out.size && (a.typ === 'foto' || a.typ === 'hochzeit')) out.add('fotobox');
  return [...out];
}

/* Alle Tage von datum bis datumEnde (höchstens 14) als JJJJ-MM-TT */
export function tageDerBuchung(a) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/;
  if (!m.test(a.datum || '')) return [];
  const start = new Date(a.datum + 'T12:00:00Z');
  const ende = m.test(a.datumEnde || '') && a.datumEnde >= a.datum ? new Date(a.datumEnde + 'T12:00:00Z') : start;
  const tage = [];
  for (let d = new Date(start); d <= ende && tage.length < 14; d.setUTCDate(d.getUTCDate() + 1)) tage.push(d.toISOString().slice(0, 10));
  return tage;
}

/* Gilt die Anfrage als feste Buchung? (fix, oder fix und danach archiviert) */
export function istFix(a) {
  return a.status === 'fix' || a.status === 'erledigt' || (a.status === 'archiv' && (a.vorherStatus === 'fix' || a.vorherStatus === 'erledigt'));
}

/* Persönlicher Empfehlungscode, z. B. MUSTER-K7Q */
export function empfehlungscode(nachname, vorname) {
  const basis = String(nachname || vorname || 'KUNDE').toUpperCase()
    .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
    .replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'KUNDE';
  const abc = 'ACDEFGHJKLMNPQRTUVWXY2346789';
  const b = new Uint8Array(3); crypto.getRandomValues(b);
  return basis + '-' + Array.from(b, x => abc[x % abc.length]).join('');
}

/* ── Eingehende Anfrage prüfen und säubern ── */
const str = (v, n = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const num = v => { const x = Number(v); return isFinite(x) ? Math.round(x * 100) / 100 : null; };

export function saeubere(roh) {
  const r = roh || {};
  const k = r.kunde || {}, ad = r.adresse || {};
  const pos = Array.isArray(r.positionen) ? r.positionen.slice(0, 15).map(p => ({
    art: ['miete', 'lieferung', 'rabatt', 'extra'].includes(p && p.art) ? p.art : 'miete',
    titel: str(p && p.titel, 80),
    menge: Math.min(99, Math.max(1, Math.round(Number(p && p.menge) || 1))),
    text: str(p && p.text, 200),
    betrag: (p && (p.betrag === null || p.betrag === '')) ? null : num(p && p.betrag)
  })).filter(p => p.titel) : [];
  return {
    typ: ['burg', 'foto', 'hochzeit'].includes(r.typ) ? r.typ : 'burg',
    quelle: str(r.quelle, 60),
    kunde: { vorname: str(k.vorname, 60), nachname: str(k.nachname, 60), telefon: str(k.telefon, 40), email: str(k.email, 120) },
    adresse: { strasse: str(ad.strasse, 120), plz: str(ad.plz, 10), ort: str(ad.ort, 80) },
    datum: /^\d{4}-\d{2}-\d{2}$/.test(r.datum || '') ? r.datum : '',
    datumEnde: /^\d{4}-\d{2}-\d{2}$/.test(r.datumEnde || '') ? r.datumEnde : '',
    anlass: str(r.anlass, 60),
    nachricht: str(r.nachricht, 1500),
    paket: str(r.paket, 60),
    rahmen: str(r.rahmen, 80),
    gutschein: str(r.gutschein, 80),
    rechnungNr: str(r.rechnungNr, 30),
    uebergabe: ['liefern', 'selbst'].includes(r.uebergabe) ? r.uebergabe : '',
    anreise: r.anreise && num(r.anreise.km) != null ? { km: num(r.anreise.km), betrag: num(r.anreise.betrag), ort: str(r.anreise.ort, 80) } : null,
    empfehlung: { aktiv: !!(r.empfehlung && r.empfehlung.aktiv), code: str(r.empfehlung && r.empfehlung.code, 40) },
    empfohlenVon: str(r.empfohlenVon, 40),
    partner: str(r.partner, 40),
    fotoFreigabe: !!r.fotoFreigabe,
    positionen: pos
  };
}

/* ── WhatsApp-Texte ── */
function eur(n) { const v = Math.round((Number(n) || 0) * 100) / 100; return v.toLocaleString('de-AT', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); }

function empfehlungsZeilen(a) {
  if (!a.empfehlung || !a.empfehlung.aktiv || !a.empfehlung.code) return [];
  return [
    '💡 Spar dir 30 € bei der Anreise: Schick diesen Link an Freunde, Familie oder in die Gemeinde-Gruppe. Bucht jemand darüber, ziehen wir dir 30 € ab:',
    'https://huepfabenteuer.at/?empfehlung=' + encodeURIComponent(a.empfehlung.code),
    ''
  ];
}

export function waZusage(a, link) {
  const s = summen(a);
  const adr = [a.adresse.strasse, ((a.adresse.plz || '') + ' ' + (a.adresse.ort || '')).trim()].filter(Boolean).join(', ');
  const vz = 'Anzahlung ' + produktText(a, true) + ' ' + datumKurz(a.datum) + ' – ' + (a.kunde.nachname || a.kunde.vorname || '');
  const pr = produkte(a);
  const fuer = pr.length ? pr.map(t => 'die ' + t).join(' und ') : 'deine Feier';
  const betrag = v => (v == null || v === '') ? 'nach Vereinbarung' : (Number(v) === 0 ? 'gratis' : eur(v) + ' €');
  const posZeilen = (a.positionen || []).filter(p => p && p.titel).map(p => {
    if (istLieferung(p)) {
      let z = 'Lieferung' + (adr ? ' nach ' + adr : '') + ': ' + betrag(p.betrag);
      const b = Number(p.betrag);
      if (b > 0) {
        const kmA = a.anreise && Number(a.anreise.km);
        const km = kmA && Math.abs(kmA * 4 * 0.55 - b) < 1.5 ? kmA : Math.round(b / 2.2);
        z += '\n(2× hin und retour für Lieferung und Abholung = 4 Fahrten × ' + eur(km) + ' km × 0,55 €)';
      }
      return z;
    }
    const mt = (p.menge > 1 ? p.menge + ' × ' : '') + p.titel;
    if (p.art === 'rabatt') return mt + ': −' + eur(Math.abs(Number(p.betrag) || 0)) + ' €';
    return mt + ': ' + betrag(p.betrag);
  });
  return [
    'Hallo ' + (a.kunde.vorname || '') + ', danke für deine Anfrage bei ' + FIRMA.name + '!',
    '',
    'Gerne schicke ich dir das Angebot für ' + fuer + ':',
    '',
    ...posZeilen,
    '',
    'Gesamt: ' + eur(s.gesamt) + ' €',
    '',
    'Anzahlung zur Reservierung: ' + eur(s.anzahlung) + ' €',
    'Empfänger: ' + FIRMA.empfaenger,
    FIRMA.bank,
    'IBAN: ' + FIRMA.iban,
    'Verwendungszweck: ' + vz,
    '',
    'Restbetrag (' + eur(s.rest) + ' €) am Veranstaltungstag.',
    '',
    ...empfehlungsZeilen(a),
    'Angebot als PDF: ' + link,
    '',
    'LG ' + 'Alexander – ' + FIRMA.name,
    FIRMA.web
  ].join('\n');
}

export function waAbsage(a) {
  return [
    'Hallo ' + (a.kunde.vorname || '') + ', danke für deine Anfrage bei ' + FIRMA.name + '!',
    '',
    'Leider sind wir am ' + datumKurz(a.datum) + ' schon ausgebucht. Wenn ein anderer Termin für dich passt, schreib mir gern, ich schau sofort nach.',
    '',
    'LG Alexander – ' + FIRMA.name,
    FIRMA.web
  ].join('\n');
}

/* ── Erinnerung an die Anzahlung ── */
export function waAnzahlung(a) {
  const s = summen(a);
  const vz = 'Anzahlung ' + produktText(a, true) + ' ' + datumKurz(a.datum) + ' – ' + (a.kunde.nachname || a.kunde.vorname || '');
  return [
    'Hallo ' + (a.kunde.vorname || '') + ', kurze Erinnerung zu deinem Termin am ' + datumKurz(a.datum) + ':',
    '',
    'Damit er fix für dich reserviert bleibt, bräuchte ich noch die Anzahlung von ' + eur(s.anzahlung) + ' € bis ' + fristDatum(a.datum) + '.',
    '',
    'Empfänger: ' + FIRMA.empfaenger,
    'IBAN: ' + FIRMA.iban,
    'Verwendungszweck: ' + vz,
    '',
    'Falls du schon überwiesen hast, passt alles, dann einfach ignorieren 😊',
    '',
    'LG Alexander – ' + FIRMA.name
  ].join('\n');
}

/* ── Angebote & Preise (Standard, in der Verwaltung änderbar) ── */
export const KATALOG_STANDARD = [
  { id: 'alienburg', gruppe: 'burg', titel: 'Alienburg', preis: 180, text: 'Hüpfburg Alienburg – Vermietung' },
  { id: 'piratenburg', gruppe: 'burg', titel: 'Piratenburg', preis: 140, text: 'Hüpfburg Piratenburg – Vermietung' },
  { id: 'ritterburg', gruppe: 'burg', titel: 'Ritterburg', preis: 140, text: 'Hüpfburg Ritterburg – Vermietung' },
  { id: 'feuerwehrburg', gruppe: 'burg', titel: 'Feuerwehrburg', preis: 140, text: 'Hüpfburg Feuerwehrburg – Vermietung' },
  { id: 'candyburg', gruppe: 'burg', titel: 'Candyburg', preis: 120, text: 'Hüpfburg Candyburg – Vermietung' },
  { id: 'hochzeitsburg', gruppe: 'burg', titel: 'Hochzeitsburg', preis: 220, text: 'Hochzeitsburg inkl. Deko, Aufbau inklusive' },
  { id: 'fotobox-digital', gruppe: 'foto', titel: 'Fotobox Digital', preis: 199, text: 'Ganzer Abend, unbegrenzt digitale Fotos, Auf- und Abbau inklusive' },
  { id: 'fotobox-standard', gruppe: 'foto', titel: 'Fotobox Standard', preis: 299, text: 'Sofortdruck, 300 Ausdrucke, alle Fotos digital, Auf- und Abbau inklusive' },
  { id: 'fotobox-premium', gruppe: 'foto', titel: 'Fotobox Premium', preis: 349, text: 'Sofortdruck, 300 Ausdrucke, eigener Rahmen, Accessoire-Set' },
  { id: 'aufbau', gruppe: 'extra', titel: 'Auf- und Abbau', preis: 50, text: 'Aufbau und Abbau durch Hüpfabenteuer' },
  { id: 'zuckerwatte', gruppe: 'extra', titel: 'Zuckerwatte', preis: 45, text: 'Zuckerwattemaschine' },
  { id: 'popcorn', gruppe: 'extra', titel: 'Popcorn', preis: 60, text: 'Popcornmaschine' },
  { id: 'zuckerwatte-set', gruppe: 'extra', titel: 'Zuckerwatte-Set', preis: 20, text: 'Zucker und Stäbchen' },
  { id: 'popcorn-set', gruppe: 'extra', titel: 'Popcorn-Set', preis: 20, text: 'Mais, Öl und Tüten' }
];
export function saeubereKatalog(liste) {
  if (!Array.isArray(liste)) return null;
  const ids = new Set();
  return liste.slice(0, 60).map((x, i) => {
    let id = String((x && x.id) || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || ('p' + Date.now().toString(36) + i);
    while (ids.has(id)) id += 'x';
    ids.add(id);
    const preis = Number(x && x.preis);
    return {
      id, gruppe: ['burg', 'foto', 'extra'].includes(x && x.gruppe) ? x.gruppe : 'extra',
      titel: str(x && x.titel, 60) || 'Ohne Namen',
      preis: isFinite(preis) && preis >= 0 ? Math.round(preis * 100) / 100 : 0,
      text: str(x && x.text, 160),
      aktiv: !(x && x.aktiv === false)
    };
  });
}

/* ── Bewertung (nach dem Fest) ── */
export function waBewertung(a) {
  const pr = produkte(a);
  const was = pr.length ? 'die ' + pr.join(' und die ') : 'unsere Sachen';
  return [
    'Hallo ' + (a.kunde.vorname || '') + ', danke nochmal, dass ihr ' + was + ' bei ' + FIRMA.name + ' gemietet habt!',
    '',
    'Wenn es euch gefallen hat, würde ich mich riesig über eine kurze Google-Bewertung freuen. Das dauert nur 30 Sekunden und hilft mir als kleinem Betrieb enorm:',
    FIRMA.googleBewertung,
    '',
    'LG Alexander – ' + FIRMA.name,
    FIRMA.web
  ].join('\n');
}
export function waBewertungErinnerung(a) {
  return [
    'Hallo ' + (a.kunde.vorname || '') + ', nur eine kurze Erinnerung, falls es untergegangen ist: Über eine Google-Bewertung würde ich mich sehr freuen 😊',
    FIRMA.googleBewertung,
    '',
    'Danke dir! LG Alexander – ' + FIRMA.name
  ].join('\n');
}

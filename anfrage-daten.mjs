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

/* ── Eingehende Anfrage prüfen und säubern ── */
const str = (v, n = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const num = v => { const x = Number(v); return isFinite(x) ? Math.round(x * 100) / 100 : null; };

export function saeubere(roh) {
  const r = roh || {};
  const k = r.kunde || {}, ad = r.adresse || {};
  const pos = Array.isArray(r.positionen) ? r.positionen.slice(0, 15).map(p => ({
    art: ['miete', 'lieferung', 'rabatt', 'extra'].includes(p && p.art) ? p.art : 'miete',
    titel: str(p && p.titel, 80),
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
    anreise: r.anreise && num(r.anreise.km) != null ? { km: num(r.anreise.km), betrag: num(r.anreise.betrag), ort: str(r.anreise.ort, 80) } : null,
    empfehlung: { aktiv: !!(r.empfehlung && r.empfehlung.aktiv), code: str(r.empfehlung && r.empfehlung.code, 40) },
    empfohlenVon: str(r.empfohlenVon, 40),
    partner: str(r.partner, 40),
    positionen: pos
  };
}

/* ── WhatsApp-Texte ── */
function eur(n) { const v = Math.round((Number(n) || 0) * 100) / 100; return v.toLocaleString('de-AT', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); }

export function waZusage(a, link) {
  const s = summen(a);
  const adr = [a.adresse.strasse, ((a.adresse.plz || '') + ' ' + (a.adresse.ort || '')).trim()].filter(Boolean).join(', ');
  const vz = 'Anzahlung ' + produktText(a, true) + ' ' + datumKurz(a.datum) + ' – ' + (a.kunde.nachname || a.kunde.vorname || '');
  const pr = produkte(a);
  const fuer = pr.length ? pr.map(t => 'die ' + t).join(' und ') : 'deine Feier';
  const betrag = v => (v == null || v === '') ? 'nach Vereinbarung' : (Number(v) === 0 ? 'gratis' : eur(v) + ' €');
  const posZeilen = (a.positionen || []).filter(p => p && p.titel).map(p => {
    if (istLieferung(p)) return 'Lieferung' + (adr ? ' nach ' + adr : '') + ': ' + betrag(p.betrag);
    if (p.art === 'rabatt') return p.titel + ': −' + eur(Math.abs(Number(p.betrag) || 0)) + ' €';
    return p.titel + ': ' + betrag(p.betrag);
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

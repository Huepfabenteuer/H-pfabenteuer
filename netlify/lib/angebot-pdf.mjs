/* ═══════════════════════════════════════════════════════════════════════
   HÜPFABENTEUER — PDF-Angebot
   Baut das Angebot im gleichen Aufbau wie die bisherigen Angebote
   (Kopf mit Logo, Positionen, Gesamtbetrag, blauer Kasten mit
   Zahlungsbedingungen, Veranstaltungsdetails, Fußzeile).
   ═══════════════════════════════════════════════════════════════════════ */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { FIRMA } from './firma.mjs';
import { LOGO_JPG_BASE64 } from './logo.mjs';
import { summen, datumLang, datumKurz, fristDatum, produktText, anredeZeile } from './anfrage-daten.mjs';

const A4 = [595.28, 841.89];
const M = 50;                                  // Seitenrand
const INK = rgb(0.10, 0.10, 0.10);
const GRAU = rgb(0.42, 0.42, 0.42);
const HELLGRAU = rgb(0.93, 0.93, 0.93);
const LINIE = rgb(0.80, 0.80, 0.80);
const BLAU = rgb(0.17, 0.35, 0.58);
const BLAU_HELL = rgb(0.91, 0.94, 0.98);

/* Standard-Schrift kann nur WinAnsi – alles andere ersetzen */
function sauber(t) {
  return String(t == null ? '' : t)
    .replace(/[−‐‑]/g, '-')
    .replace(/[→⇒]/g, '-')
    .replace(/[  ]/g, ' ')
    .replace(/[^\x20-\x7E -ÿ€–—‘’‚“”„•…]/g, '')
    .trim();
}
function eur(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function umbrechen(text, font, size, breite) {
  const woerter = sauber(text).split(/\s+/).filter(Boolean);
  const zeilen = []; let z = '';
  for (const w of woerter) {
    const probe = z ? z + ' ' + w : w;
    if (font.widthOfTextAtSize(probe, size) <= breite) z = probe;
    else { if (z) zeilen.push(z); z = w; }
  }
  if (z) zeilen.push(z);
  return zeilen.length ? zeilen : [''];
}

export async function erstelleAngebotPdf(a) {
  const doc = await PDFDocument.create();
  doc.setTitle('Angebot Nr. ' + (a.nr || '') + ' – ' + FIRMA.name);
  doc.setAuthor(FIRMA.name);
  let page = doc.addPage(A4);
  const F = await doc.embedFont(StandardFonts.Helvetica);
  const FB = await doc.embedFont(StandardFonts.HelveticaBold);
  const FI = await doc.embedFont(StandardFonts.HelveticaOblique);
  const W = A4[0], R = W - M;

  const txt = (t, x, y, o = {}) => page.drawText(sauber(t), { x, y, size: o.size || 10, font: o.font || F, color: o.color || INK });
  const rechts = (t, xR, y, o = {}) => { const f = o.font || F, s = o.size || 10; const tt = sauber(t); page.drawText(tt, { x: xR - f.widthOfTextAtSize(tt, s), y, size: s, font: f, color: o.color || INK }); };
  const mitte = (t, y, o = {}) => { const f = o.font || F, s = o.size || 8; const tt = sauber(t); page.drawText(tt, { x: (W - f.widthOfTextAtSize(tt, s)) / 2, y, size: s, font: f, color: o.color || GRAU }); };

  const s = summen(a);
  let y = A4[1] - 58;
  const platz = (h) => { if (y - h < 40) { page = doc.addPage(A4); fuss(); y = A4[1] - 60; } };
  const fuss = () => {
    mitte(FIRMA.name + ' | ' + FIRMA.inhaber + ' | ' + FIRMA.strasse + ', ' + FIRMA.ort + ' | GISA-Zahl: ' + FIRMA.gisa, 30, { font: FI, size: 7.5 });
    mitte(FIRMA.gerichtsstand + ' | ' + FIRMA.ustKurz, 20, { font: FI, size: 7.5 });
  };
  fuss();

  /* ── Kopf ── */
  txt(FIRMA.name, M, y, { font: FB, size: 20 });
  y -= 17; txt(FIRMA.inhaber, M, y, { size: 9.5 });
  y -= 12.5; txt(FIRMA.strasse + ', ' + FIRMA.ort, M, y, { size: 9.5 });
  y -= 12.5; txt(FIRMA.telefon + ' | ' + FIRMA.email, M, y, { size: 9.5 });
  y -= 12.5; txt(FIRMA.web, M, y, { size: 9.5 });
  try {
    const logo = await doc.embedJpg(Uint8Array.from(Buffer.from(LOGO_JPG_BASE64, 'base64')));
    const lw = 112, lh = lw * logo.height / logo.width;
    page.drawImage(logo, { x: R - lw, y: A4[1] - 50 - lh + 6, width: lw, height: lh });
  } catch (e) { /* ohne Logo weiter */ }
  y -= 16;
  page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 1.2, color: INK });

  /* ── Titel ── */
  y -= 36; txt('ANGEBOT', M, y, { font: FB, size: 26 });

  /* ── Kunde / Datum ── */
  y -= 26;
  const kx = 330, kx2 = 420;
  txt('Kunde:', M, y, { font: FB }); txt('Datum:', kx, y, { font: FB }); txt(datumKurz(a.angenommenAm || a.erstellt || new Date().toISOString()), kx2, y);
  y -= 13;
  txt(((a.kunde.vorname || '') + ' ' + (a.kunde.nachname || '')).trim(), M, y); txt('Angebot-Nr.:', kx, y, { font: FB }); txt(String(a.nr || '–'), kx2, y);
  y -= 13; txt(a.adresse.strasse || '', M, y);
  y -= 13; txt(((a.adresse.plz || '') + ' ' + (a.adresse.ort || '')).trim(), M, y);

  /* ── Anrede ── */
  y -= 24; txt(anredeZeile(a), M, y, { size: 10.5 });
  y -= 16;
  for (const z of umbrechen('vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot für Ihre Veranstaltung am ' + datumKurz(a.datum) + (a.datumEnde && a.datumEnde !== a.datum ? ' bis ' + datumKurz(a.datumEnde) : '') + '.', F, 10.5, R - M)) {
    txt(z, M, y, { size: 10.5 }); y -= 14;
  }

  /* ── Positionen ── */
  y -= 6;
  const kopfH = 20;
  page.drawRectangle({ x: M, y: y - kopfH + 6, width: R - M, height: kopfH, color: HELLGRAU });
  txt('Pos.', M + 8, y - 8, { font: FB, size: 9 });
  txt('Beschreibung', M + 46, y - 8, { font: FB, size: 9 });
  rechts('Betrag (EUR)', R - 8, y - 8, { font: FB, size: 9 });
  y -= kopfH + 6;

  const pos = (a.positionen || []).filter(p => p && (p.titel || p.text));
  pos.forEach((p, i) => {
    const textZeilen = p.text ? umbrechen(p.text, F, 8.5, R - M - 140) : [];
    const h = 14 + textZeilen.length * 10.5 + 5;
    platz(h + 4);
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - h + 12, width: R - M, height: h, color: rgb(0.975, 0.975, 0.975) });
    txt(String(i + 1), M + 8, y, { size: 9.5 });
    txt((p.menge > 1 ? p.menge + ' × ' : '') + p.titel, M + 46, y, { font: FB, size: 10 });
    rechts(p.betrag == null || p.betrag === '' ? 'nach Vereinbarung' : eur(p.betrag), R - 8, y, { font: FB, size: 10 });
    let yy = y - 12;
    for (const z of textZeilen) { txt(z, M + 46, yy, { size: 8.5, color: GRAU }); yy -= 11; }
    y -= h;
    page.drawLine({ start: { x: M, y: y + 10 }, end: { x: R, y: y + 10 }, thickness: 0.5, color: LINIE });
  });

  y -= 4;
  txt('Zwischensumme', 360, y, { size: 10 }); rechts(eur(s.gesamt) + ' EUR', R - 8, y, { size: 10 });
  y -= 13; txt(FIRMA.ustHinweis, M, y, { font: FI, size: 7.5, color: GRAU });

  /* ── Gesamt ── */
  y -= 24; platz(30);
  txt('GESAMTBETRAG', M, y, { font: FB, size: 14 });
  rechts(eur(s.gesamt) + ' EUR', R, y, { font: FB, size: 14 });
  y -= 8; page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 1.2, color: INK });

  /* ── Zahlungsbedingungen ── */
  y -= 20; platz(140);
  const boxTop = y + 6;
  const boxZeilen = [];
  const frist = fristDatum(a.datum);
  const vz = 'Anzahlung ' + produktText(a, true) + ' ' + datumKurz(a.datum) + ' – ' + (a.kunde.nachname || a.kunde.vorname || '');
  const boxH = 114;
  page.drawRectangle({ x: M, y: boxTop - 20, width: R - M, height: 20, color: BLAU });
  txt('Zahlungsbedingungen', M + 10, boxTop - 14, { font: FB, size: 10, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: M, y: boxTop - boxH, width: R - M, height: boxH - 20, color: BLAU_HELL });
  let by = boxTop - 36;
  txt('Anzahlung zur Terminreservierung', M + 10, by, { font: FB, size: 10 });
  rechts(eur(s.anzahlung) + ' EUR', R - 10, by, { font: FB, size: 10, color: BLAU });
  by -= 13;
  txt('Restbetrag (zahlbar am Veranstaltungstag)', M + 10, by, { size: 9, color: GRAU });
  rechts(eur(s.rest) + ' EUR', R - 10, by, { size: 9, color: GRAU });
  by -= 16;
  txt('Bitte überweisen Sie die Anzahlung bis spätestens ' + frist + ' auf folgendes Konto:', M + 10, by, { size: 9 });
  by -= 13;
  txt('Empfänger: ' + FIRMA.empfaenger, M + 10, by, { font: FB, size: 9 });
  by -= 12;
  txt(FIRMA.bank + ' | IBAN: ' + FIRMA.iban + ' | BIC: ' + FIRMA.bic, M + 10, by, { font: FB, size: 9 });
  by -= 13;
  txt('Verwendungszweck:', M + 10, by, { font: FB, size: 9 });
  txt(vz, M + 10 + FB.widthOfTextAtSize('Verwendungszweck: ', 9), by, { size: 9 });
  y = boxTop - boxH - 20;

  /* ── Veranstaltungsdetails ── */
  platz(70);
  txt('Veranstaltungsdetails', M, y, { font: FB, size: 11 });
  y -= 15;
  const det = [
    ['Datum:', datumLang(a.datum) + (a.datumEnde && a.datumEnde !== a.datum ? ' bis ' + datumLang(a.datumEnde) : '') + ' · Uhrzeit nach Vereinbarung'],
    ['Ort:', [a.adresse.strasse, ((a.adresse.plz || '') + ' ' + (a.adresse.ort || '')).trim()].filter(Boolean).join(', ')],
    ['Leistung:', produktText(a, false)]
  ];
  if (a.anlass) det.push(['Anlass:', a.anlass]);
  for (const [k, v] of det) {
    txt(k, M, y, { font: FB, size: 9.5 });
    const zz = umbrechen(v, F, 9.5, R - M - 70);
    zz.forEach((z, i) => txt(z, M + 70, y - i * 12, { size: 9.5 }));
    y -= 12 * zz.length + 2;
  }

  /* ── Schluss ── */
  platz(54);
  y -= 10; txt('Wir würden uns sehr über Ihren Auftrag freuen!', M, y, { font: FB, size: 10.5 });
  y -= 14; txt('Mit freundlichen Grüßen', M, y, { size: 10 });
  y -= 12; txt(FIRMA.kurzname, M, y, { size: 10 });
  y -= 12; txt(FIRMA.name, M, y, { size: 10 });


  return await doc.save();
}

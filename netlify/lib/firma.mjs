/* ═══════════════════════════════════════════════════════════════════════
   HÜPFABENTEUER — Firmendaten für Angebote und WhatsApp-Texte
   Kann in Netlify über Umgebungsvariablen überschrieben werden
   (FIRMA_IBAN, FIRMA_BIC, FIRMA_BANK, FIRMA_EMPFAENGER), sonst gelten
   die Werte aus dem bisherigen Angebot.
   ═══════════════════════════════════════════════════════════════════════ */
const env = (k, d) => (typeof process !== 'undefined' && process.env && process.env[k]) || d;

export const FIRMA = {
  name:      'Hüpfabenteuer',
  inhaber:   'Alexander Manuel Fodermayer',
  kurzname:  'Alexander Fodermayer',
  strasse:   'Schulstraße 3',
  ort:       '9346 Glödnitz',
  ortKurz:   'Glödnitz',
  telefon:   '+43 664 185 26 34',
  email:     'info@huepfabenteuer.at',
  web:       'www.huepfabenteuer.at',
  gisa:      '39466334',
  empfaenger: env('FIRMA_EMPFAENGER', 'Alexander Manuel Fodermayer'),
  bank:       env('FIRMA_BANK', 'Kärntner Sparkasse'),
  iban:       env('FIRMA_IBAN', 'AT25 2070 6047 0012 3591'),
  bic:        env('FIRMA_BIC', 'KSPKAT2KXXX'),
  ustHinweis: 'Umsatzsteuerbefreit gemäß § 6 Abs. 1 Z 27 UStG (Kleinunternehmerregelung)',
  ustKurz:    'Umsatzsteuerbefreit gemäß § 6 Abs. 1 Z 27 UStG',
  gerichtsstand: 'Gerichtsstand Kärnten',
  googleBewertung: 'https://g.page/r/CUE00P_892NPEAE/review',
  erinnerungNachTagen: 4, // so lange nach der Bewertungsanfrage einmal erinnern
  fristTage:  3,          // Anzahlung spätestens X Tage vor der Veranstaltung
  startNr:    117         // erste Angebotsnummer aus dem System
};

/* Anzahlung nach Mietpreis (ohne Anreise) – wie auf der Website */
export function anzahlungFuer(miete) {
  if (miete >= 300) return 100;
  if (miete >= 220) return 50;
  if (miete > 0) return 30;
  return 0;
}

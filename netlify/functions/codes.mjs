/* ═══════════════════════════════════════════════════════════════════════
   GUTSCHEINCODES
   ───────────────────────────────────────────────────────────────────────
   Diese Datei liegt auf dem Server und ist im Browser NICHT sichtbar.

   Felder je Code:
     prozent   Rabatt in Prozent
     label     Name, der dem Kunden im Formular angezeigt wird
     einmalig  true  = Code gilt genau einmal (Stammkunden-Codes)
               false = Code darf beliebig oft benutzt werden (Firmen)
     kunde     nur zur Info für dich, wird dem Kunden nie angezeigt

   Neue Codes trägst du einfach hier ein und deployst neu.
   Die Stammkunden-Codes erzeugt das Skript tools/codes_generieren.py.
   ═══════════════════════════════════════════════════════════════════════ */

export const CODES = {
  /* ── Firmenrabatte (mehrfach verwendbar) ── */
  'INFINEON15': { prozent: 15, label: 'Infineon-Mitarbeiterrabatt', einmalig: false },
  'DUSSMANN15': { prozent: 15, label: 'Dussmann-Mitarbeiterrabatt', einmalig: false },

  /* ── Stammkunden 2027 (je einmal verwendbar) ── */
  /* STAMMKUNDEN-START */
  /* STAMMKUNDEN-ENDE */
};

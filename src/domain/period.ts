/**
 * Gestion des mois et des périodes.
 *
 * Une « période » désigne un mois civil : c'est l'unité de la quittance de loyer.
 * On la représente par une clé textuelle stable `AAAA-MM`, triable comme une
 * chaîne, ce qui simplifie les comparaisons et le stockage en SQLite.
 */

/** Clé de période, au format `AAAA-MM`. Exemple : `2026-09`. */
export type ClePeriode = string;

export interface Periode {
  annee: number;
  /** 1 = janvier, 12 = décembre. */
  mois: number;
}

export const MOIS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

export const MOIS_FR_COURT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

/** Construit une période à partir d'une année et d'un mois (1-12). */
export function periode(annee: number, mois: number): Periode {
  if (!Number.isInteger(annee) || annee < 1900 || annee > 2200) {
    throw new Error(`Année invalide : ${annee}`);
  }
  if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
    throw new Error(`Mois invalide : ${mois}`);
  }
  return { annee, mois };
}

/** Période du jour, dans le fuseau local du téléphone. */
export function periodeActuelle(maintenant: Date = new Date()): Periode {
  return periode(maintenant.getFullYear(), maintenant.getMonth() + 1);
}

export function versCle(p: Periode): ClePeriode {
  return `${p.annee}-${String(p.mois).padStart(2, '0')}`;
}

/** Lit une clé `AAAA-MM`. Renvoie `null` si elle est malformée. */
export function depuisCle(cle: ClePeriode): Periode | null {
  const correspondance = /^(\d{4})-(\d{2})$/.exec(cle);
  if (!correspondance) return null;

  const annee = Number(correspondance[1]);
  const mois = Number(correspondance[2]);
  if (mois < 1 || mois > 12) return null;

  return { annee, mois };
}

/** Décale d'un nombre de mois (positif vers l'avenir, négatif vers le passé). */
export function decaler(p: Periode, mois: number): Periode {
  const index = p.annee * 12 + (p.mois - 1) + mois;
  return periode(Math.floor(index / 12), (index % 12) + 1);
}

/** Compare deux périodes : négatif si `a` précède `b`, 0 si égales. */
export function comparer(a: Periode, b: Periode): number {
  return a.annee * 12 + a.mois - (b.annee * 12 + b.mois);
}

export function estAvant(a: Periode, b: Periode): boolean {
  return comparer(a, b) < 0;
}

export function estApres(a: Periode, b: Periode): boolean {
  return comparer(a, b) > 0;
}

export function sontEgales(a: Periode, b: Periode): boolean {
  return comparer(a, b) === 0;
}

/** « septembre 2026 » */
export function libelleLong(p: Periode): string {
  return `${MOIS_FR[p.mois - 1]} ${p.annee}`;
}

/** « Septembre 2026 » */
export function libelleLongCapitalise(p: Periode): string {
  const l = libelleLong(p);
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/** « sept. 2026 » */
export function libelleCourt(p: Periode): string {
  return `${MOIS_FR_COURT[p.mois - 1]} ${p.annee}`;
}

/** « 09/2026 » */
export function libelleNumerique(p: Periode): string {
  return `${String(p.mois).padStart(2, '0')}/${p.annee}`;
}

/**
 * Premier jour du mois à 00:00, en date locale, au format `AAAA-MM-JJ`.
 * C'est une **date civile**, pas un instant : on l'écrit telle quelle en base.
 */
export function premierJour(p: Periode): string {
  return `${p.annee}-${String(p.mois).padStart(2, '0')}-01`;
}

/** Dernier jour du mois, au format `AAAA-MM-JJ`. */
export function dernierJour(p: Periode): string {
  const jour = new Date(p.annee, p.mois, 0).getDate();
  return `${p.annee}-${String(p.mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/**
 * Compare une date civile `AAAA-MM-JJ` au premier jour d'une période.
 * Renvoie négatif si la date précède le mois, 0 si elle est dans le mois, positif sinon.
 */
export function comparerDateAPeriode(dateISO: string, p: Periode): number {
  const moisDeLaDate = dateISO.slice(0, 7); // `AAAA-MM`
  return moisDeLaDate.localeCompare(versCle(p));
}

export function dateDansPeriode(dateISO: string, p: Periode): boolean {
  return comparerDateAPeriode(dateISO, p) === 0;
}

/** Date du jour au format civil `AAAA-MM-JJ`, en heure locale. */
export function aujourdHui(maintenant: Date = new Date()): string {
  const a = maintenant.getFullYear();
  const m = String(maintenant.getMonth() + 1).padStart(2, '0');
  const j = String(maintenant.getDate()).padStart(2, '0');
  return `${a}-${m}-${j}`;
}

/** « 15 septembre 2026 » à partir de `2026-09-15`. */
export function formaterDateFr(dateISO: string): string {
  const [a, m, j] = dateISO.split('-').map(Number);
  if (!a || !m || !j) return dateISO;
  return `${j} ${MOIS_FR[m - 1]} ${a}`;
}

/** « 15/09/2026 » à partir de `2026-09-15`. */
export function formaterDateCourte(dateISO: string): string {
  const [a, m, j] = dateISO.split('-');
  if (!a || !m || !j) return dateISO;
  return `${j}/${m}/${a}`;
}

/** Les 12 périodes d'une année, de janvier à décembre. */
export function periodesDeLAnnee(annee: number): Periode[] {
  return Array.from({ length: 12 }, (_, i) => periode(annee, i + 1));
}

/** Nombre de jours d'un mois. */
export function nombreDeJours(p: Periode): number {
  return new Date(p.annee, p.mois, 0).getDate();
}

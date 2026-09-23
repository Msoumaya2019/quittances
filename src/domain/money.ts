/**
 * Arithmétique monétaire.
 *
 * Tous les montants circulent en **centimes entiers**. On ne manipule jamais de
 * nombre à virgule flottante pour de l'argent : 0.1 + 0.2 ne fait pas 0.3, et une
 * quittance qui affiche 849,99 € au lieu de 850 € est un document faux.
 */

/** Un montant en centimes. Types structurels, pour que le compilateur aide. */
export type Centimes = number;

export const ZERO: Centimes = 0;

/**
 * Convertit une saisie utilisateur en centimes.
 * Accepte « 850 », « 850,5 », « 850.50 », « 1 200,00 », « 850 € ».
 * Renvoie `null` si la saisie n'est pas un montant valide — on ne devine pas.
 */
export function parseMontant(saisie: string): Centimes | null {
  if (typeof saisie !== 'string') return null;

  const nettoye = saisie
    .replace(/\s|\u00a0|\u202f/g, '') // espaces, y compris insécables
    .replace(/€/g, '')
    .replace(',', '.');

  if (nettoye === '') return null;
  if (!/^-?\d+(\.\d{0,2})?$/.test(nettoye)) return null;

  const negatif = nettoye.startsWith('-');
  const [entier, decimales = ''] = nettoye.replace('-', '').split('.');
  const centimes = Number(entier) * 100 + Number(decimales.padEnd(2, '0'));

  if (!Number.isSafeInteger(centimes)) return null;
  return negatif ? -centimes : centimes;
}

/**
 * Formate des centimes pour l'affichage, à la française : « 850,00 € ».
 * `centimesAffichees: false` donne « 850 € » quand le montant est rond.
 */
export function formatMontant(
  centimes: Centimes,
  options: { symbole?: boolean; decimales?: 'auto' | 'toujours' | 'jamais' } = {},
): string {
  const { symbole = true, decimales = 'toujours' } = options;
  const negatif = centimes < 0;
  const absolu = Math.abs(Math.round(centimes));

  const euros = Math.floor(absolu / 100);
  const cents = absolu % 100;

  const montrerDecimales =
    decimales === 'toujours' || (decimales === 'auto' && cents !== 0);

  const partieEntiere = euros.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');

  let texte = partieEntiere;
  if (montrerDecimales) texte += ',' + String(cents).padStart(2, '0');
  if (symbole) texte += ' €';

  return (negatif ? '-' : '') + texte;
}

/** Somme d'une liste de montants. */
export function somme(montants: readonly Centimes[]): Centimes {
  return montants.reduce<Centimes>((total, m) => total + m, 0);
}

/**
 * Applique un pourcentage à un montant, arrondi au centime le plus proche.
 * Utilisé pour les statistiques, jamais pour une somme due.
 */
export function pourcentDe(montant: Centimes, pourcent: number): Centimes {
  return Math.round((montant * pourcent) / 100);
}

/** Rapport en pourcentage, borné à [0, 100]. Renvoie 0 si le total est nul. */
export function rapportPourcent(partie: Centimes, total: Centimes): number {
  if (total <= 0) return 0;
  const valeur = Math.round((partie / total) * 100);
  return Math.max(0, Math.min(100, valeur));
}

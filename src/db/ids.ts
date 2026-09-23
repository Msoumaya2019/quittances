/**
 * Génération d'identifiants locaux.
 *
 * On n'utilise pas d'auto-incrément SQLite : les identifiants doivent pouvoir
 * être créés **avant** l'insertion (utile pour préparer un objet complet), et
 * rester uniques si une synchronisation cloud est ajoutée plus tard.
 */

import { randomUUID } from 'expo-crypto';

/** Identifiant unique, au format UUID v4. */
export function nouvelId(): string {
  return randomUUID();
}

/** Horodatage ISO complet, pour les colonnes de traçabilité. */
export function maintenantISO(): string {
  return new Date().toISOString();
}

/** Date civile du jour, `AAAA-MM-JJ`, en heure locale. */
export function dateDuJour(): string {
  const d = new Date();
  const a = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${a}-${m}-${j}`;
}

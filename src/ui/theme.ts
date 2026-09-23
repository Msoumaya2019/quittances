/**
 * Accès au thème depuis un composant.
 *
 * Un écran ne lit jamais une couleur directement : il demande la palette
 * courante, ou fait fabriquer ses styles pour cette palette. C'est ce qui rend
 * un changement de thème complet — et vérifiable par le compilateur, puisque
 * plus aucun module ne peut importer un objet `couleurs` figé.
 */

import { useMemo } from 'react';

import { useApplication } from '../state/ApplicationContext';
import type { Palette } from './palette';

/**
 * La palette sous le nom qu'emploient les composants.
 *
 * Un seul mot à retenir pour un écran : `couleurs.accent`, `couleurs.fond`,
 * `couleurs.succes`. Le type est celui de `palette.ts`, réexporté pour qu'un
 * composant n'ait qu'un seul import à écrire.
 */
export type { Palette as Couleurs } from './palette';

/** La palette courante, celle du thème choisi dans les réglages. */
export function useCouleurs(): Palette {
  return useApplication().palette;
}

/** Le mode nuit est-il actif ? Utile pour les rares choix qui ne sont pas des couleurs. */
export function useModeNuit(): boolean {
  return useApplication().reglages.modeTheme === 'sombre';
}

/**
 * Fabrique les styles d'un écran pour le thème courant.
 *
 * `fabrique` doit être une constante de module — `const creerStyles = (couleurs)
 * => StyleSheet.create({...})` — car la mémoïsation repose sur son identité.
 * Une fonction recréée à chaque rendu ferait reconstruire tous les styles, ce
 * qui se voit sur une longue liste.
 */
export function useStyles<T>(fabrique: (couleurs: Palette) => T): T {
  const couleurs = useCouleurs();
  return useMemo(() => fabrique(couleurs), [fabrique, couleurs]);
}

/**
 * Jetons de design.
 *
 * Les **mesures** — espacements, rayons, tailles, typographie — sont des
 * constantes : elles ne dépendent ni de la couleur choisie ni du mode.
 *
 * Les **couleurs**, elles, dépendent de deux choix du bailleur : la couleur
 * d'accent et le mode clair ou nuit. Elles ne sont donc plus des constantes
 * figées, mais la `Palette` composée par `src/ui/palette.ts` et distribuée par
 * le contexte applicatif.
 *
 * Conséquence pratique : aucun écran n'écrit une couleur en dur. Un composant
 * reçoit la palette par `useCouleurs()` et fabrique ses styles par
 * `useStyles((couleurs) => StyleSheet.create({...}))`. C'est ce qui garantit
 * qu'un changement de thème ne laisse aucun écran vert.
 */

import type { Palette } from './palette';

/**
 * Couleurs d'un statut de paiement, avec le fond et la puce associés.
 *
 * Le vert reste vert dans les huit combinaisons : « payé » ne change pas de
 * sens parce que le bailleur a choisi un thème rose.
 */
export function couleursStatutDe(couleurs: Palette) {
  return {
    vert: { fond: couleurs.succesTresClair, texte: couleurs.succesFonce, puce: couleurs.succes },
    orange: { fond: couleurs.orangeTresClair, texte: couleurs.orange, puce: couleurs.orange },
    rouge: { fond: couleurs.rougeTresClair, texte: couleurs.rouge, puce: couleurs.rouge },
    gris: {
      fond: couleurs.fondSourdine,
      texte: couleurs.texteSecondaire,
      puce: couleurs.texteTertiaire,
    },
    bleu: { fond: couleurs.bleuTresClair, texte: couleurs.bleu, puce: couleurs.bleu },
  } as const;
}

/**
 * Échelle d'espacement, en points.
 * Le pas de 4 permet un rythme régulier et un rendu net sur tous les écrans.
 */
export const espaces = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  enorme: 48,
} as const;

/** Rayons d'arrondi. Les cartes et les boutons sont généreusement arrondis. */
export const rayons = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  rond: 999,
} as const;

/**
 * Hauteurs de contrôle.
 * `bouton` respecte la cible tactile recommandée de 48 points, largement
 * dépassée pour le bouton principal, qui doit être évident à toucher.
 */
export const tailles = {
  bouton: 52,
  boutonPrincipal: 60,
  boutonPetit: 40,
  champ: 52,
  icone: 24,
  iconeGrande: 32,
  iconeTresGrande: 48,
} as const;

export const typographie = {
  titrePrincipal: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.5 },
  titreEcran: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.4 },
  titreSection: { fontSize: 19, fontWeight: '700' as const, letterSpacing: -0.2 },
  titreCarte: { fontSize: 17, fontWeight: '700' as const },
  corps: { fontSize: 15, fontWeight: '400' as const },
  corpsAppuye: { fontSize: 15, fontWeight: '600' as const },
  petit: { fontSize: 13, fontWeight: '400' as const },
  petitAppuye: { fontSize: 13, fontWeight: '600' as const },
  minuscule: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
  montant: { fontSize: 27, fontWeight: '800' as const, letterSpacing: -0.6 },
  montantPetit: { fontSize: 20, fontWeight: '700' as const },
  bouton: { fontSize: 16, fontWeight: '700' as const },
} as const;

/**
 * Ombres douces, adaptées à un fond clair.
 * Sur Android, `elevation` prend le relais ; on garde les deux pour un rendu
 * cohérent sur les deux plateformes.
 *
 * L'ombre du bouton est à part : elle est teintée de l'accent, donc recalculée
 * à chaque thème par `ombreBouton`.
 */
export const ombres = {
  carte: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  carteAppuyee: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  barre: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 8,
  },
} as const;

/**
 * Ombre portée sous un bouton plein.
 *
 * Elle reprend la teinte de l'accent pour que le relief reste cohérent quand le
 * bailleur choisit le rose ou le noir. En mode nuit, l'accent étant clair,
 * l'ombre devient une lueur douce — ce qui est le rendu attendu sur fond sombre.
 */
export function ombreBouton(couleurs: Palette) {
  return {
    shadowColor: couleurs.accentFonce,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  } as const;
}

/** Durées d'animation, en millisecondes. Discrètes et rapides. */
export const animations = {
  rapide: 140,
  normale: 220,
  lente: 340,
} as const;

/** Délai au-delà duquel un appui long est reconnu. */
export const appuiLong = 450;

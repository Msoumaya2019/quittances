/**
 * Jetons de design.
 *
 * Toute couleur, tout espacement et tout rayon utilisés dans l'application
 * viennent d'ici. Changer l'identité visuelle se fait donc à un seul endroit.
 *
 * Direction artistique :
 *  - fond clair et lumineux, blanc cassé et gris très clair ;
 *  - vert émeraude comme couleur principale ;
 *  - touches de bleu et de pastels pour les statuts ;
 *  - cartes aux coins arrondis, beaucoup d'air entre les éléments.
 */

export const couleurs = {
  // Fonds
  fond: '#F7F9F8',
  fondCarte: '#FFFFFF',
  fondSourdine: '#EEF2F0',
  fondSurvol: '#F1F5F3',

  // Vert émeraude, couleur principale
  vert: '#059669',
  vertFonce: '#047857',
  vertClair: '#D1FAE5',
  vertTresClair: '#ECFDF5',

  // Bleu, pour les informations neutres
  bleu: '#2563EB',
  bleuClair: '#DBEAFE',
  bleuTresClair: '#EFF6FF',

  // Orange, paiement partiel
  orange: '#EA580C',
  orangeClair: '#FFEDD5',
  orangeTresClair: '#FFF7ED',

  // Rouge, retard et erreurs
  rouge: '#DC2626',
  rougeClair: '#FEE2E2',
  rougeTresClair: '#FEF2F2',

  // Pastels d'accompagnement
  violet: '#7C3AED',
  violetClair: '#EDE9FE',
  rose: '#DB2777',
  roseClair: '#FCE7F3',
  turquoise: '#0D9488',
  turquoiseClair: '#CCFBF1',
  ambre: '#D97706',
  ambreClair: '#FEF3C7',

  // Textes
  texte: '#111827',
  texteSecondaire: '#4B5563',
  texteTertiaire: '#9CA3AF',
  texteSurFonce: '#FFFFFF',

  // Trait et séparateurs
  bordure: '#E5E7EB',
  bordureForte: '#D1D5DB',

  transparence: 'rgba(17, 24, 39, 0.45)',
} as const;

/** Couleurs d'un statut, avec le fond associé. */
export const couleursStatut = {
  vert: { fond: couleurs.vertTresClair, texte: couleurs.vertFonce, puce: couleurs.vert },
  orange: { fond: couleurs.orangeTresClair, texte: couleurs.orange, puce: couleurs.orange },
  rouge: { fond: couleurs.rougeTresClair, texte: couleurs.rouge, puce: couleurs.rouge },
  gris: { fond: couleurs.fondSourdine, texte: couleurs.texteSecondaire, puce: couleurs.texteTertiaire },
  bleu: { fond: couleurs.bleuTresClair, texte: couleurs.bleu, puce: couleurs.bleu },
} as const;

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
  bouton: {
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  barre: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 8,
  },
} as const;

/** Durées d'animation, en millisecondes. Discrètes et rapides. */
export const animations = {
  rapide: 140,
  normale: 220,
  lente: 340,
} as const;

/** Délai au-delà duquel un appui long est reconnu. */
export const appuiLong = 450;

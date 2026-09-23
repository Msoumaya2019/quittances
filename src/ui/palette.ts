/**
 * Palettes de l'application.
 *
 * Deux axes indépendants :
 *  - la **couleur d'accent**, choisie par le bailleur : bleu, vert, rose ou noir ;
 *  - le **mode**, clair ou nuit.
 *
 * Le reste des couleurs ne bouge pas : les statuts — orange pour un paiement
 * partiel, rouge pour un retard, vert pour un mois réglé — portent un sens, et
 * un sens ne se choisit pas. Ils gardent donc leur teinte dans les huit
 * combinaisons, seule leur intensité s'adapte au mode.
 *
 * Chaque accent déclare la couleur du texte à poser **sur** lui. Sans cela, un
 * accent clair en mode nuit recevrait du blanc sur du bleu clair, et le libellé
 * d'un bouton deviendrait illisible.
 */

/** Les quatre couleurs d'accent proposées dans les réglages. */
export type CouleurTheme = 'bleu' | 'vert' | 'rose' | 'noir';

export type ModeTheme = 'clair' | 'sombre';

export const COULEURS_THEME: { valeur: CouleurTheme; libelle: string; apercu: string }[] = [
  { valeur: 'bleu', libelle: 'Bleu', apercu: '#2563EB' },
  { valeur: 'vert', libelle: 'Vert', apercu: '#059669' },
  { valeur: 'rose', libelle: 'Rose', apercu: '#DB2777' },
  { valeur: 'noir', libelle: 'Noir', apercu: '#111827' },
];

/**
 * Toutes les couleurs qu'un écran a le droit d'utiliser.
 *
 * Les noms sont ceux du projet : `accent` pour la couleur choisie, le reste
 * décrit un rôle. Aucun écran ne doit écrire une couleur en dur — c'est ce qui
 * permet de changer d'identité sans en oublier un seul.
 */
export interface Palette {
  /** Couleur choisie par le bailleur. */
  accent: string;
  accentFonce: string;
  accentClair: string;
  accentTresClair: string;
  /** Texte lisible posé sur `accent`. */
  surAccent: string;

  /**
   * Vert « payé ».
   *
   * Il ne suit **pas** l'accent choisi : un mois réglé se lit en vert, que le
   * bailleur ait choisi un thème rose ou noir. La teinte est donc fixe, seule
   * son intensité suit le mode.
   */
  succes: string;
  succesFonce: string;
  succesClair: string;
  succesTresClair: string;

  // Surfaces
  fond: string;
  fondCarte: string;
  fondSourdine: string;
  fondSurvol: string;

  // Statuts — la teinte ne change pas, seule l'intensité suit le mode.
  bleu: string;
  bleuClair: string;
  bleuTresClair: string;
  orange: string;
  orangeClair: string;
  orangeTresClair: string;
  rouge: string;
  rougeClair: string;
  rougeTresClair: string;
  violet: string;
  violetClair: string;
  rose: string;
  roseClair: string;
  turquoise: string;
  turquoiseClair: string;
  ambre: string;
  ambreClair: string;

  // Textes
  texte: string;
  texteSecondaire: string;
  texteTertiaire: string;

  // Traits
  bordure: string;
  bordureForte: string;
  transparence: string;
}

/** Les quatre teintes d'un accent, pour un mode donné. */
interface Accent {
  accent: string;
  accentFonce: string;
  accentClair: string;
  accentTresClair: string;
  surAccent: string;
}

/**
 * Les accents, en clair et en nuit.
 *
 * En mode clair, l'accent est soutenu et le texte posé dessus est blanc.
 * En mode nuit, l'accent s'éclaircit pour ressortir sur un fond sombre, et le
 * texte posé dessus devient sombre — c'est ce qui évite le blanc sur bleu clair.
 */
const ACCENTS: Record<CouleurTheme, Record<ModeTheme, Accent>> = {
  bleu: {
    clair: {
      accent: '#2563EB',
      accentFonce: '#1D4ED8',
      accentClair: '#DBEAFE',
      accentTresClair: '#EFF6FF',
      surAccent: '#FFFFFF',
    },
    sombre: {
      accent: '#60A5FA',
      accentFonce: '#93C5FD',
      accentClair: '#1E3A8A',
      accentTresClair: '#172554',
      surAccent: '#0B1220',
    },
  },
  vert: {
    clair: {
      // Le vert d'origine (`#059669`) ne donne que 3,8:1 avec un libellé blanc,
      // sous le seuil de 4,5:1. On descend d'un cran : 5,0:1, pour une
      // différence invisible à l'œil. Un bailleur qui lit mal y gagne.
      accent: '#047857',
      accentFonce: '#065F46',
      accentClair: '#D1FAE5',
      accentTresClair: '#ECFDF5',
      surAccent: '#FFFFFF',
    },
    sombre: {
      accent: '#34D399',
      accentFonce: '#6EE7B7',
      accentClair: '#064E3B',
      accentTresClair: '#022C22',
      surAccent: '#0B1220',
    },
  },
  rose: {
    clair: {
      accent: '#DB2777',
      accentFonce: '#BE185D',
      accentClair: '#FCE7F3',
      accentTresClair: '#FDF2F8',
      surAccent: '#FFFFFF',
    },
    sombre: {
      accent: '#F472B6',
      accentFonce: '#F9A8D4',
      accentClair: '#831843',
      accentTresClair: '#500724',
      surAccent: '#0B1220',
    },
  },
  noir: {
    clair: {
      accent: '#111827',
      accentFonce: '#000000',
      accentClair: '#E5E7EB',
      accentTresClair: '#F3F4F6',
      surAccent: '#FFFFFF',
    },
    sombre: {
      accent: '#E5E7EB',
      accentFonce: '#FFFFFF',
      accentClair: '#374151',
      accentTresClair: '#1F2937',
      surAccent: '#0B1220',
    },
  },
};

/** Surfaces et textes, par mode. */
const SURFACES: Record<ModeTheme, Omit<Palette, keyof Accent | 'fond' | 'fondCarte' | 'fondSourdine' | 'fondSurvol'>> = {
  clair: {
    succes: '#059669',
    succesFonce: '#047857',
    succesClair: '#D1FAE5',
    succesTresClair: '#ECFDF5',
    bleu: '#2563EB',
    bleuClair: '#DBEAFE',
    bleuTresClair: '#EFF6FF',
    // `#EA580C` et `#DC2626` ne donnaient que 3,4:1 et 4,4:1 sur leur pastille
    // très claire — sous le seuil de 4,5:1 pour un libellé de 13 points. Un cran
    // plus foncé suffit, sans changer la teinte perçue.
    orange: '#C2410C',
    orangeClair: '#FFEDD5',
    orangeTresClair: '#FFF7ED',
    rouge: '#B91C1C',
    rougeClair: '#FEE2E2',
    rougeTresClair: '#FEF2F2',
    violet: '#7C3AED',
    violetClair: '#EDE9FE',
    rose: '#DB2777',
    roseClair: '#FCE7F3',
    turquoise: '#0D9488',
    turquoiseClair: '#CCFBF1',
    ambre: '#D97706',
    ambreClair: '#FEF3C7',
    texte: '#111827',
    texteSecondaire: '#4B5563',
    texteTertiaire: '#9CA3AF',
    bordure: '#E5E7EB',
    bordureForte: '#D1D5DB',
    transparence: 'rgba(17, 24, 39, 0.45)',
  },
  sombre: {
    succes: '#34D399',
    succesFonce: '#6EE7B7',
    succesClair: '#064E3B',
    succesTresClair: '#022C22',
    bleu: '#60A5FA',
    bleuClair: '#1E3A8A',
    bleuTresClair: '#172554',
    orange: '#FB923C',
    orangeClair: '#7C2D12',
    orangeTresClair: '#431407',
    rouge: '#F87171',
    rougeClair: '#7F1D1D',
    rougeTresClair: '#450A0A',
    violet: '#A78BFA',
    violetClair: '#4C1D95',
    rose: '#F472B6',
    roseClair: '#831843',
    turquoise: '#2DD4BF',
    turquoiseClair: '#134E4A',
    ambre: '#FBBF24',
    ambreClair: '#78350F',
    texte: '#F1F5F9',
    texteSecondaire: '#CBD5E1',
    texteTertiaire: '#94A3B8',
    bordure: '#334155',
    bordureForte: '#475569',
    transparence: 'rgba(0, 0, 0, 0.65)',
  },
};

const FONDS: Record<ModeTheme, Pick<Palette, 'fond' | 'fondCarte' | 'fondSourdine' | 'fondSurvol'>> = {
  clair: {
    fond: '#F6F7F9',
    fondCarte: '#FFFFFF',
    fondSourdine: '#EEF0F4',
    fondSurvol: '#F1F3F7',
  },
  sombre: {
    fond: '#0F172A',
    fondCarte: '#1E293B',
    fondSourdine: '#334155',
    fondSurvol: '#273449',
  },
};

/**
 * Compose la palette d'une combinaison.
 *
 * Fonction pure : la même combinaison rend toujours le même objet, ce qui
 * permet de mémoïser les styles sans jamais les recalculer pour rien.
 */
export function composerPalette(couleur: CouleurTheme, mode: ModeTheme): Palette {
  return {
    ...FONDS[mode],
    ...SURFACES[mode],
    ...ACCENTS[couleur][mode],
  };
}

/** Palette par défaut, avant que les réglages ne soient lus. */
export const PALETTE_PAR_DEFAUT = composerPalette('vert', 'clair');

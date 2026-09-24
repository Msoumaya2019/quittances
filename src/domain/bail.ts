/**
 * Les baux de location : catégories, règles légales, et brouillon guidé.
 *
 * **Aucune clause juridique n'est inventée dans ce fichier.** Chaque règle
 * chiffrée porte la source officielle qui l'établit et la date à laquelle elle
 * a été lue. Une règle qu'on n'a pas pu sourcer est écrite `aVerifier` plutôt
 * que devinée : un bailleur qui recopie un bail plausible et faux engage sa
 * responsabilité, et l'application n'a pas à le lui faire croire.
 *
 * Le droit du logement change. Les contrats types réglementaires ont changé au
 * **1er octobre 2026** (décret paru au Journal officiel du 7 juillet 2026), et
 * ils changeront encore. D'où `CONTRATS_TYPES` : une date, et un avertissement
 * quand un bail est établi de part et d'autre.
 *
 * Module **pur** : ni SQLite, ni React. Il est chargé par `node --test`.
 */

import type { Centimes } from './money.ts';
import { dateCivileValide } from './period.ts';
import type { Signature } from './signature.ts';

// ---------------------------------------------------------------------------
// Catégories
// ---------------------------------------------------------------------------

/**
 * Les six catégories proposées. Elles ne se distinguent pas par leur nom mais
 * par leur **régime** : durée minimale, dépôt de garantie, préavis, annexes.
 */
export type CategorieBail =
  | 'vide'
  | 'meuble'
  | 'etudiant'
  | 'mobilite'
  | 'colocation'
  | 'stationnement';

export const LIBELLE_BAIL: Record<CategorieBail, string> = {
  vide: 'Location vide',
  meuble: 'Location meublée',
  etudiant: 'Bail étudiant (meublé 9 mois)',
  mobilite: 'Bail mobilité',
  colocation: 'Colocation',
  stationnement: 'Parking, garage ou box',
};

export const CATEGORIES_BAIL: { valeur: CategorieBail; libelle: string; resume: string }[] = [
  {
    valeur: 'vide',
    libelle: LIBELLE_BAIL.vide,
    resume: 'Résidence principale, non meublée. Loi du 6 juillet 1989.',
  },
  {
    valeur: 'meuble',
    libelle: LIBELLE_BAIL.meuble,
    resume: 'Résidence principale, meublée. Un inventaire du mobilier est obligatoire.',
  },
  {
    valeur: 'etudiant',
    libelle: LIBELLE_BAIL.etudiant,
    resume: 'Meublé de 9 mois, non renouvelable, réservé aux étudiants.',
  },
  {
    valeur: 'mobilite',
    libelle: LIBELLE_BAIL.mobilite,
    resume: 'De 1 à 10 mois, pour un motif précis. Dépôt de garantie interdit.',
  },
  {
    valeur: 'colocation',
    libelle: LIBELLE_BAIL.colocation,
    resume: 'Bail unique signé par tous, ou un bail par colocataire.',
  },
  {
    valeur: 'stationnement',
    libelle: LIBELLE_BAIL.stationnement,
    resume: 'Loué seul, hors logement : contrat libre, hors loi de 1989.',
  },
];

// ---------------------------------------------------------------------------
// Annexes
// ---------------------------------------------------------------------------

export type TypeAnnexe =
  | 'diagnostic_technique'
  | 'etat_des_lieux_entree'
  | 'inventaire_mobilier'
  | 'reglement_copropriete'
  | 'justificatif_mobilite'
  | 'notice_information';

export const LIBELLE_ANNEXE: Record<TypeAnnexe, string> = {
  diagnostic_technique: 'Dossier de diagnostic technique',
  etat_des_lieux_entree: "État des lieux d'entrée",
  inventaire_mobilier: 'Inventaire et état détaillé du mobilier',
  reglement_copropriete: 'Extraits du règlement de copropriété',
  justificatif_mobilite: 'Justificatif du motif (contrat, convention de stage…)',
  notice_information: "Notice d'information",
};

// ---------------------------------------------------------------------------
// Sources officielles
// ---------------------------------------------------------------------------

/**
 * Une source n'est pas une décoration : elle porte **ce qu'elle établit**, sa
 * référence, et le jour où on l'a lue. Un texte officiel se réécrit ; sans la
 * date de consultation, on ne sait pas si l'on cite la version en vigueur.
 */
export interface SourceOfficielle {
  /** Ce que la source établit, en une phrase. */
  etablit: string;
  /** Référence : texte, article, page. */
  reference: string;
  /** Date de consultation, `AAAA-MM-JJ`. */
  consulteLe: string;
}

/** Toutes les sources lues pour ce module, au 24 septembre 2026. */
export const SOURCES_BAIL: SourceOfficielle[] = [
  {
    etablit:
      'Durée minimale : trois ans pour un bailleur personne physique, six ans pour une personne morale ; mêmes durées en reconduction tacite.',
    reference: 'Loi n° 89-462 du 6 juillet 1989, article 10 (version en vigueur depuis le 27 mars 2014)',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "Durée réduite possible, inférieure à trois ans mais d'au moins un an, quand un événement précis justifie une reprise pour raisons professionnelles ou familiales ; le contrat doit mentionner les raisons et l'événement.",
    reference: 'Loi n° 89-462 du 6 juillet 1989, article 11',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "Le locataire peut résilier à tout moment ; préavis de six mois quand le congé émane du bailleur, de trois mois quand il émane du locataire, réduit à un mois dans les cas 1° à 5° de l'article 15.",
    reference: 'Loi n° 89-462 du 6 juillet 1989, articles 12 et 15',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "Dépôt de garantie : au plus 1 mois de loyer hors charges en location vide, au plus 2 mois hors charges en location meublée, et interdit quand le loyer se paie d'avance au trimestre. Restitution sous 1 mois si l'état des lieux de sortie est conforme, 2 mois sinon.",
    reference:
      'service-public.gouv.fr, « Dépôt de garantie dans un bail d\u2019habitation », fiches F39713/0 (logement vide) et F39713/1 (logement meublé)',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "Bail mobilité : conclu pour 1 mois minimum et 10 mois maximum, non renouvelable et non reconductible ; dépôt de garantie interdit ; clause de solidarité et révision du loyer en cours de bail interdites ; annexes : diagnostic technique immobilier, états des lieux d'entrée et de sortie, inventaire et état détaillé du mobilier.",
    reference: 'service-public.gouv.fr, « Quelles sont les règles d\u2019un bail mobilité ? », fiche F34759',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "Bail mobilité en résidence à vocation d'emploi : durée d'une semaine minimum à 18 mois maximum.",
    reference:
      'Article 15 de la loi n° 2025-1129 du 26 novembre 2025 de simplification du droit de l\u2019urbanisme et du logement, cité par la fiche F34759',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "Colocation : location par plusieurs colocataires d'un même logement qu'ils utilisent tous comme résidence principale, soit par un bail unique signé de tous, soit par un contrat par colocataire. Un couple marié ou pacsé à la signature n'est pas une colocation.",
    reference: 'service-public.gouv.fr, « Colocation : quelles sont les règles ? », fiche F34661',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "Place de parking louée en complément d'un logement : pas de bail spécifique, elle est mentionnée comme annexe du bail d'habitation et suit ses règles. Louée indépendamment du logement : loyer, durée et résiliation sont librement négociés, et un contrat écrit est recommandé.",
    reference:
      'service-public.gouv.fr, « Quelles sont les règles de location d\u2019une place de parking ? », fiche F14747',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      'De nouveaux contrats types réglementaires s\u2019appliquent aux baux conclus ou renouvelés à compter du 1er octobre 2026, pour les logements vides, meublés et les colocations à bail unique. Ils intègrent la clause résolutoire (impayés de loyer, de charges ou de dépôt de garantie, après un commandement de payer resté sans effet six semaines) et la mention de l\u2019obligation de résidence principale. Le modèle meublé ne s\u2019applique ni au bail mobilité ni aux locations saisonnières.',
    reference:
      'service-public.gouv.fr, « De nouveaux modèles de bail entrent en vigueur à partir du 1er octobre 2026 », actualité A19067, publiée le 23 septembre 2026, citant le décret paru au Journal officiel du 7 juillet 2026 et la loi n° 2023-668 du 27 juillet 2023',
    consulteLe: '2026-09-24',
  },
];

/** Date d'entrée en vigueur des contrats types décrits ci-dessus. */
export const CONTRATS_TYPES = '2026-10-01';

// ---------------------------------------------------------------------------
// Règles par catégorie
// ---------------------------------------------------------------------------

/**
 * Une règle qu'on n'a pas pu sourcer porte `aVerifier`. L'application l'affiche
 * alors comme telle, et invite à la confirmer — plutôt que de la présenter
 * comme un fait.
 */
export interface RegleChiffree {
  valeur: string;
  /** `true` quand la règle n'a pas été lue dans une source officielle. */
  aVerifier?: boolean;
}

export interface RegleBail {
  categorie: CategorieBail;
  /** Régime juridique applicable, en clair. */
  regime: string;
  /** Durée légale, en clair. */
  duree: string;
  /**
   * Durée minimale en mois, quand la loi en fixe une. `null` quand la durée
   * est libre (stationnement loué seul).
   */
  dureeMinimaleMois: number | null;
  /** Plafond du dépôt de garantie, en mois de loyer hors charges. */
  depotGarantieMois: number | null;
  /** Le dépôt de garantie est-il purement interdit ? */
  depotGarantieInterdit: boolean;
  preavisLocataire: string;
  preavisBailleur: string | null;
  /** Annexes obligatoires de cette catégorie. */
  annexes: TypeAnnexe[];
  /** Points de vigilance, affichés avant de finaliser. */
  vigilance: string[];
}

/**
 * Les règles, par catégorie.
 *
 * Le plafond du dépôt de garantie est le seul chiffre que le module **vérifie**
 * au lieu de l'afficher : un dépôt au-dessus du plafond rend le bail
 * irrégulier, et l'application refuse de l'établir ainsi.
 */
export const REGLES_BAIL: Record<CategorieBail, RegleBail> = {
  vide: {
    categorie: 'vide',
    regime: 'Loi n° 89-462 du 6 juillet 1989, titre Ier',
    duree: 'Au moins 3 ans pour un bailleur personne physique, 6 ans pour une personne morale.',
    dureeMinimaleMois: 36,
    depotGarantieMois: 1,
    depotGarantieInterdit: false,
    preavisLocataire: '3 mois, réduit à 1 mois dans les cas prévus par la loi.',
    preavisBailleur: '6 mois.',
    annexes: ['diagnostic_technique', 'etat_des_lieux_entree'],
    vigilance: [
      'Une durée réduite (moins de 3 ans, au moins 1 an) n\u2019est possible que pour un motif précis, et doit être écrite dans le bail.',
    ],
  },
  meuble: {
    categorie: 'meuble',
    regime: 'Loi n° 89-462 du 6 juillet 1989, titre Ier bis',
    duree: '1 an, renouvelable par tacite reconduction.',
    dureeMinimaleMois: 12,
    depotGarantieMois: 2,
    depotGarantieInterdit: false,
    preavisLocataire: '1 mois.',
    preavisBailleur: '6 mois.',
    annexes: ['diagnostic_technique', 'etat_des_lieux_entree', 'inventaire_mobilier'],
    vigilance: [
      'L\u2019inventaire du mobilier est obligatoire : sans lui, le bailleur ne peut pas retenir sur le dépôt de garantie les dégradations du mobilier.',
    ],
  },
  etudiant: {
    categorie: 'etudiant',
    regime: 'Loi n° 89-462 du 6 juillet 1989, location meublée',
    duree: '9 mois, non renouvelable : le bail prend fin à son terme.',
    dureeMinimaleMois: 9,
    depotGarantieMois: 2,
    depotGarantieInterdit: false,
    preavisLocataire: '1 mois.',
    preavisBailleur: null,
    annexes: ['diagnostic_technique', 'etat_des_lieux_entree', 'inventaire_mobilier'],
    vigilance: [
      'Réservé aux étudiants : le bail doit être justifié par la qualité du locataire.',
      'La durée est de 9 mois : elle ne se reconduit pas.',
    ],
  },
  mobilite: {
    categorie: 'mobilite',
    regime: 'Loi n° 89-462 du 6 juillet 1989, titre Ier ter',
    duree: '1 à 10 mois, non renouvelable et non reconductible.',
    dureeMinimaleMois: 1,
    depotGarantieMois: 0,
    depotGarantieInterdit: true,
    preavisLocataire: 'Le préavis du locataire reste dû dans les conditions du bail.',
    preavisBailleur: null,
    annexes: [
      'diagnostic_technique',
      'etat_des_lieux_entree',
      'inventaire_mobilier',
      'justificatif_mobilite',
    ],
    vigilance: [
      'Le dépôt de garantie est interdit : une clause qui en prévoit un rend le bail irrégulier.',
      'Le motif du locataire doit figurer dans le bail : sans lui, le bail mobilité n\u2019est pas applicable.',
      'Le bail doit porter la phrase qui le soumet au titre Ier ter de la loi du 6 juillet 1989.',
      'La révision du loyer en cours de bail et la clause de solidarité sont interdites.',
      'En résidence à vocation d\u2019emploi, la durée va d\u2019une semaine à 18 mois.',
    ],
  },
  colocation: {
    categorie: 'colocation',
    regime: 'Loi n° 89-462 du 6 juillet 1989, selon que le logement est vide ou meublé',
    duree: 'Celle du régime du logement : 3 ou 6 ans en vide, 1 an en meublé.',
    dureeMinimaleMois: null,
    depotGarantieMois: null,
    depotGarantieInterdit: false,
    preavisLocataire: 'Celle du régime du logement.',
    preavisBailleur: 'Celle du régime du logement.',
    annexes: ['diagnostic_technique', 'etat_des_lieux_entree'],
    vigilance: [
      'Deux formes : un bail unique signé de tous, ou un bail par colocataire. Le choix change tout — le congé d\u2019un seul ne libère pas les autres dans le premier cas.',
      'Un couple marié ou pacsé à la signature n\u2019est pas une colocation.',
      'Le logement doit être meublé ou non : la règle applicable suit ce choix.',
    ],
  },
  stationnement: {
    categorie: 'stationnement',
    regime: 'Code civil, quand la place est louée indépendamment d\u2019un logement',
    duree: 'Libre : loyer, durée et résiliation se négocient.',
    dureeMinimaleMois: null,
    depotGarantieMois: null,
    depotGarantieInterdit: false,
    preavisLocataire: 'Libre.',
    preavisBailleur: 'Libre.',
    annexes: [],
    vigilance: [
      'Louée en complément d\u2019un logement, la place n\u2019a pas de bail propre : elle est mentionnée comme annexe du bail d\u2019habitation et suit ses règles.',
      'Louée indépendamment, elle échappe à la loi du 6 juillet 1989 — mais un écrit qui précise le loyer, sa révision, la durée et les modes de résiliation évite les conflits.',
    ],
  },
};

// ---------------------------------------------------------------------------
// Les neuf étapes du formulaire guidé
// ---------------------------------------------------------------------------

export type EtapeBail =
  | 'logement'
  | 'locataires'
  | 'categorie'
  | 'duree'
  | 'loyer'
  | 'diagnostics'
  | 'clauses'
  | 'annexes'
  | 'signature';

/**
 * L'ordre des étapes est **signifiant** : les deux premières ne demandent rien,
 * elles rappellent ce qui est déjà enregistré. L'utilisateur ne ressaisit
 * jamais une information qu'il a déjà donnée.
 */
export const ETAPES_BAIL: { valeur: EtapeBail; titre: string; aide: string }[] = [
  {
    valeur: 'logement',
    titre: 'Le logement',
    aide: 'Adresse, surface et propriétaire, repris de la fiche du logement.',
  },
  {
    valeur: 'locataires',
    titre: 'Les locataires',
    aide: 'Titulaires du bail, repris de la location en cours.',
  },
  {
    valeur: 'categorie',
    titre: 'Le type de bail',
    aide: 'Le type choisi détermine la durée, le dépôt de garantie et les annexes.',
  },
  {
    valeur: 'duree',
    titre: 'La durée',
    aide: 'Date de prise d\u2019effet et durée, comparées au minimum légal.',
  },
  {
    valeur: 'loyer',
    titre: 'Loyer, charges et dépôt',
    aide: 'Le dépôt de garantie est vérifié contre le plafond légal.',
  },
  {
    valeur: 'diagnostics',
    titre: 'Diagnostics',
    aide: 'Le dossier de diagnostic technique et sa date de réalisation.',
  },
  {
    valeur: 'clauses',
    titre: 'Clauses particulières',
    aide: 'Résidence principale, téléphone, et clauses propres à ce bail.',
  },
  {
    valeur: 'annexes',
    titre: 'Annexes',
    aide: 'Ce qui est joint au bail. Un manque est signalé, jamais ignoré.',
  },
  {
    valeur: 'signature',
    titre: 'Signatures',
    aide: 'Le bailleur et chaque locataire signent sur l\u2019écran.',
  },
];

export function numeroEtape(etape: EtapeBail): number {
  return ETAPES_BAIL.findIndex((e) => e.valeur === etape) + 1;
}

// ---------------------------------------------------------------------------
// Brouillon et vérifications
// ---------------------------------------------------------------------------

/**
 * La signature du bail est la signature **commune** : un tracé, un nom, une
 * date. La forme vit dans `domain/signature.ts`, avec les contrôles qui la
 * valident, parce que l'état des lieux et l'inventaire signent de la même
 * façon. Le nom `SignatureBail` reste, pour que le vocabulaire du bail ne
 * change pas sous les pieds de ceux qui le lisent.
 */
export type SignatureBail = Signature;

export interface BrouillonBail {
  logementId: string;
  bailId: string;
  categorie?: CategorieBail;
  /** Date de prise d'effet, `AAAA-MM-JJ`. */
  dateDebut?: string;
  dureeMois?: number;
  /** Loyer hors charges, en centimes. */
  loyer?: Centimes;
  /** Provision pour charges, en centimes. */
  charges?: Centimes;
  /** Dépôt de garantie, en centimes. */
  depotGarantie?: Centimes;
  jourEcheance?: number;
  /** Motif du locataire, obligatoire pour un bail mobilité. */
  motifMobilite?: string;
  /** Le logement est-il meublé ? Décide du régime en colocation. */
  meuble?: boolean;
  /** Le bailleur est-il une personne morale ? Décide de la durée minimale. */
  bailleurPersonneMorale?: boolean;
  /** Annexes effectivement jointes. */
  annexesFournies?: TypeAnnexe[];
  /**
   * Diagnostics joints au bail, tels que le bailleur les a relevés.
   *
   * `aRenouveler` est **sa** décision, pas la nôtre : l'application ne juge pas la
   * validité d'un diagnostic — les durées dépendent du diagnostic, de son
   * résultat et de l'ancienneté de l'installation. Elle imprime donc ce qu'on
   * lui dit, et laisse l'appréciation à qui de droit.
   */
  diagnostics?: DiagnosticSaisi[];
  clausesParticulieres?: string;
  /** Le logement est-il occupé à titre de résidence principale ? */
  residencePrincipale?: boolean;
  signatures?: SignatureBail[];
}

/**
 * Un diagnostic joint, tel que saisi.
 *
 * Nommé `DiagnosticSaisi` et non `DiagnosticBail` : le module de rendu
 * (`pdf/bail.ts`) porte déjà un `DiagnosticBail`, qui est la forme **imprimée**.
 * Deux formes distinctes sous un même nom se confondraient à la première
 * relecture.
 */
export interface DiagnosticSaisi {
  libelle: string;
  /** Date de réalisation, `AAAA-MM-JJ`. */
  date: string;
  /** Le bailleur estime-t-il qu'il doit être refait ? */
  aRenouveler?: boolean;
}

/**
 * Les diagnostics qu'on propose de cocher.
 *
 * Ce ne sont que des **étiquettes** : aucune durée de validité n'est portée ici,
 * et c'est délibéré. Les durées réelles dépendent du diagnostic, du résultat
 * (un plomb positif se refait chaque année, un plomb négatif ne se refait pas)
 * et de l'ancienneté de l'installation. Les encoder approximativement serait
 * pire que ne rien encoder : le bailleur croirait l'application.
 */
export const DIAGNOSTICS_PROPOSES: string[] = [
  'Performance énergétique (DPE)',
  'Gaz',
  'Électricité',
  'Amiante',
  'Plomb',
  'État des risques et pollutions (ERP)',
  'Bruit',
  'Assainissement',
];

/**
 * Les situations qui ouvrent droit à un bail mobilité.
 *
 * Elles sont reprises de la fiche officielle du bail mobilité, et servent de
 * raccourcis de saisie : le motif reste un texte libre, parce qu'un bailleur
 * peut avoir une situation que cette liste ne prévoit pas — et l'application
 * n'a pas à refuser ce qu'elle n'a pas prévu.
 */
export const MOTIFS_MOBILITE: string[] = [
  'Formation professionnelle',
  'Études supérieures',
  'Contrat d’apprentissage',
  'Stage',
  'Service civique',
  'Mutation professionnelle',
  'Mission temporaire',
];

/**
 * Un empêchement, et l'étape qui le lève.
 *
 * Le formulaire a besoin de savoir *quelle* étape bloque, et le contrôle final a
 * besoin de la liste entière. Écrire les deux séparément les ferait diverger :
 * une règle ajoutée à l'une manquerait à l'autre, et le formulaire laisserait
 * passer ce que le contrôle refuse. Les règles sont donc écrites **une fois**,
 * ici, chacune étiquetée par l'étape où elle se corrige.
 */
interface ExigenceBail {
  etape: EtapeBail;
  manque: string;
}

/** Toutes les règles qui empêchent d'établir le bail, avec leur étape. */
function exigencesDuBail(b: BrouillonBail): ExigenceBail[] {
  const exigences: ExigenceBail[] = [];
  const ajouter = (etape: EtapeBail, manque: string) => exigences.push({ etape, manque });

  if (!b.logementId) ajouter('logement', 'Aucun logement n\u2019est rattaché à ce bail.');
  if (!b.bailId) {
    ajouter('locataires', 'Aucune location en cours n\u2019est rattachée à ce bail.');
  }
  if (!b.categorie) ajouter('categorie', 'Le type de bail n\u2019est pas choisi.');

  if (!b.dateDebut) {
    ajouter('duree', 'La date de prise d\u2019effet n\u2019est pas renseignée.');
  } else if (!dateReelle(b.dateDebut)) {
    ajouter('duree', 'Cette date de prise d\u2019effet n\u2019existe pas dans le calendrier.');
  }

  // La durée n'est réclamée qu'une fois le type de bail choisi : sans lui, on
  // annoncerait les conséquences d'un choix qui n'a pas encore été fait, et le
  // bailleur lirait cinq reproches là où il n'a qu'une décision à prendre.
  if (b.categorie && b.dureeMois === undefined) {
    ajouter('duree', 'La durée du bail n\u2019est pas renseignée.');
  } else if (b.categorie && b.dureeMois !== undefined) {
    const minimum = dureeMinimaleMois(
      b.categorie,
      b.bailleurPersonneMorale === true,
      b.meuble === true,
    );
    if (minimum !== null && b.dureeMois < minimum) {
      ajouter(
        'duree',
        `La durée saisie (${b.dureeMois} mois) est inférieure au minimum légal de cette catégorie (${minimum} mois).`,
      );
    }
  }

  if (b.loyer === undefined || b.loyer <= 0) {
    ajouter('loyer', 'Le loyer n\u2019est pas renseigné.');
  }

  const plafond = depotDepasseLaRegle(b);
  if (plafond) ajouter('loyer', plafond);

  if (b.categorie && b.jourEcheance !== undefined) {
    if (b.jourEcheance < 1 || b.jourEcheance > 31) {
      ajouter('loyer', 'Le jour d\u2019échéance doit être compris entre 1 et 31.');
    }
  }

  if (b.categorie === 'mobilite') {
    if (!b.motifMobilite || !b.motifMobilite.trim()) {
      ajouter(
        'categorie',
        'Le motif du locataire est obligatoire pour un bail mobilité : sans lui, le bail mobilité n\u2019est pas applicable.',
      );
    }
    if (b.dureeMois !== undefined && b.dureeMois > 10) {
      ajouter('duree', 'Un bail mobilité ne peut pas dépasser 10 mois.');
    }
  }

  if (b.categorie === 'etudiant' && b.dureeMois !== undefined && b.dureeMois !== 9) {
    ajouter('duree', 'Un bail étudiant est conclu pour 9 mois.');
  }

  return exigences;
}

/**
 * Ce qui **empêche** d'établir le bail. Chaque empêchement nomme ce qui manque,
 * jamais « le formulaire est incomplet ».
 */
export function manquesDuBail(b: BrouillonBail): string[] {
  return exigencesDuBail(b).map((e) => e.manque);
}

/**
 * Ce qui manque **à cette étape** pour pouvoir passer à la suivante.
 *
 * Le formulaire guidé s'en sert pour dire « vous pouvez continuer » ou pour
 * nommer ce qui bloque, sans faire défiler les manques des huit autres étapes —
 * reprocher à l'étape « Durée » un loyer non saisi serait incompréhensible.
 */
export function manquesDeLEtape(b: BrouillonBail, etape: EtapeBail): string[] {
  return exigencesDuBail(b)
    .filter((e) => e.etape === etape)
    .map((e) => e.manque);
}

/**
 * L'étape suivante, ou `null` après la dernière.
 *
 * L'ordre vient de `ETAPES_BAIL` : une étape insérée au milieu demain sera
 * parcourue sans qu'on touche à cette fonction.
 */
export function etapeSuivante(etape: EtapeBail): EtapeBail | null {
  const rang = ETAPES_BAIL.findIndex((e) => e.valeur === etape);
  return ETAPES_BAIL[rang + 1]?.valeur ?? null;
}

/** L'étape précédente, ou `null` avant la première. */
export function etapePrecedente(etape: EtapeBail): EtapeBail | null {
  const rang = ETAPES_BAIL.findIndex((e) => e.valeur === etape);
  return rang > 0 ? ETAPES_BAIL[rang - 1].valeur : null;
}

// ---------------------------------------------------------------------------
// Reprise d'un brouillon enregistré
// ---------------------------------------------------------------------------

/**
 * Relit un brouillon enregistré, sans jamais faire confiance à sa forme.
 *
 * Un brouillon vient de la base, où il a été écrit par une version antérieure
 * de l'application, puis relu après une mise à jour. Une valeur du mauvais type
 * — un nombre écrit en texte, une catégorie qui n'existe plus — se propagerait
 * jusqu'au calcul de durée ou de plafond, et produirait soit une comparaison
 * silencieusement fausse (`'36' < 36` est faux), soit un plantage.
 *
 * Chaque champ est donc **vérifié**, et un champ invalide est simplement
 * ignoré : la valeur de `base`, qui vient de la location, prend alors sa place.
 * On préfère un formulaire partiellement rempli à un formulaire faux.
 */
export function reprendreBrouillon(
  donnees: Record<string, unknown>,
  base: BrouillonBail,
): BrouillonBail {
  const texte = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
  const entier = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isInteger(v) ? v : undefined;
  const booleen = (v: unknown): boolean | undefined =>
    typeof v === 'boolean' ? v : undefined;

  const resultat: BrouillonBail = { ...base };

  const categorie = texte(donnees.categorie);
  if (categorie && CATEGORIES_BAIL.some((c) => c.valeur === categorie)) {
    resultat.categorie = categorie as CategorieBail;
  }

  const dateDebut = texte(donnees.dateDebut);
  if (dateDebut) resultat.dateDebut = dateDebut;

  for (const champ of ['dureeMois', 'loyer', 'charges', 'depotGarantie', 'jourEcheance'] as const) {
    const valeur = entier(donnees[champ]);
    if (valeur !== undefined) resultat[champ] = valeur;
  }

  const motif = texte(donnees.motifMobilite);
  if (motif !== undefined) resultat.motifMobilite = motif;

  const clauses = texte(donnees.clausesParticulieres);
  if (clauses !== undefined) resultat.clausesParticulieres = clauses;

  for (const champ of ['meuble', 'bailleurPersonneMorale', 'residencePrincipale'] as const) {
    const valeur = booleen(donnees[champ]);
    if (valeur !== undefined) resultat[champ] = valeur;
  }

  const annexes = donnees.annexesFournies;
  if (Array.isArray(annexes)) {
    const connues = Object.keys(LIBELLE_ANNEXE) as TypeAnnexe[];
    resultat.annexesFournies = annexes.filter(
      (a): a is TypeAnnexe => typeof a === 'string' && connues.includes(a as TypeAnnexe),
    );
  }

  const diagnostics = donnees.diagnostics;
  if (Array.isArray(diagnostics)) {
    resultat.diagnostics = diagnostics
      .filter(
        (d): d is Record<string, unknown> =>
          typeof d === 'object' && d !== null && !Array.isArray(d),
      )
      .map((d) => ({
        libelle: texte(d.libelle) ?? '',
        date: texte(d.date) ?? '',
        aRenouveler: booleen(d.aRenouveler) === true,
      }))
      .filter((d) => d.libelle.trim().length > 0);
  }

  const signatures = donnees.signatures;
  if (Array.isArray(signatures)) {
    resultat.signatures = signatures
      .filter(
        (s): s is Record<string, unknown> =>
          typeof s === 'object' && s !== null && !Array.isArray(s),
      )
      .map((s) => ({
        signataire: texte(s.signataire) ?? '',
        nom: texte(s.nom) ?? '',
        date: texte(s.date) ?? '',
        trace: texte(s.trace) ?? '',
      }))
      .filter((s) => s.signataire && s.trace);
  }

  return resultat;
}

/**
 * Ce qui **n'empêche pas** d'établir le bail, mais que le bailleur doit savoir
 * avant de signer : une annexe obligatoire manquante, une clause à confirmer.
 */
export function avertissementsDuBail(b: BrouillonBail): string[] {
  const avertissements: string[] = [];
  if (!b.categorie) return avertissements;
  const regle = REGLES_BAIL[b.categorie];
  const fournies = b.annexesFournies ?? [];

  for (const annexe of regle.annexes) {
    if (!fournies.includes(annexe)) {
      avertissements.push(`Annexe obligatoire manquante : ${LIBELLE_ANNEXE[annexe]}.`);
    }
  }

  for (const point of regle.vigilance) {
    avertissements.push(point);
  }

  if (b.dateDebut && b.dateDebut >= CONTRATS_TYPES) {
    avertissements.push(
      'Ce bail est conclu après le 1er octobre 2026 : les nouveaux contrats types réglementaires s\u2019appliquent, avec la clause résolutoire.',
    );
  }

  return avertissements;
}

/**
 * Le dépôt de garantie dépasse-t-il ce que la loi permet ?
 *
 * Rend `null` quand tout va bien, et la phrase à afficher sinon. C'est la seule
 * règle du module qui **corrige** au lieu d'informer : un dépôt hors plafond
 * rend le bail irrégulier.
 */
export function depotDepasseLaRegle(b: BrouillonBail): string | null {
  if (!b.categorie) return null;
  const regle = REGLES_BAIL[b.categorie];

  if (regle.depotGarantieInterdit) {
    if (b.depotGarantie !== undefined && b.depotGarantie > 0) {
      return 'Le dépôt de garantie est interdit pour ce type de bail : il doit être ramené à zéro.';
    }
    return null;
  }

  if (regle.depotGarantieMois === null) return null;
  if (b.depotGarantie === undefined || b.depotGarantie === 0) return null;
  if (b.loyer === undefined || b.loyer <= 0) return null;

  const plafond = b.loyer * regle.depotGarantieMois;
  if (b.depotGarantie > plafond) {
    return `Le dépôt de garantie dépasse le plafond légal de ${regle.depotGarantieMois} mois de loyer hors charges.`;
  }
  return null;
}

/**
 * Durée minimale légale, en mois.
 *
 * La loi distingue le bailleur **personne physique** du bailleur **personne
 * morale** : trois ans contre six. Et une **colocation** n'a pas de durée propre
 * — elle suit le régime du logement, trois ou six ans en vide, un an en meublé.
 * C'est la même règle que pour un bail ordinaire, appliquée au régime choisi ;
 * l'écrire deux fois ferait diverger les deux.
 */
export function dureeMinimaleMois(
  categorie: CategorieBail,
  bailleurPersonneMorale: boolean,
  meuble = false,
): number | null {
  if (categorie === 'colocation') {
    const regime = meuble ? 'meuble' : 'vide';
    const minimum = REGLES_BAIL[regime].dureeMinimaleMois;
    if (minimum === null) return null;
    return regime === 'vide' && bailleurPersonneMorale ? 72 : minimum;
  }

  const regle = REGLES_BAIL[categorie];
  if (regle.dureeMinimaleMois === null) return null;
  if (categorie === 'vide' && bailleurPersonneMorale) return 72;
  return regle.dureeMinimaleMois;
}

/** Une date `AAAA-MM-JJ` qui existe vraiment dans le calendrier. */
function dateReelle(valeur: string): boolean {
  // La règle vit dans `period.ts`, avec les autres manipulations de dates :
  // l'état des lieux l'exige aussi, et deux validateurs écrits séparément
  // finiraient par ne plus accepter les mêmes dates.
  return dateCivileValide(valeur);
}

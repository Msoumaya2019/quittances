/**
 * Les états des lieux : ce qu'un état des lieux doit contenir, et ce qu'il ne
 * peut pas laisser croire.
 *
 * **Aucune exigence n'est inventée dans ce fichier.** Les mentions obligatoires
 * viennent de l'article 2 du décret n° 2016-382 du 30 mars 2016, lu à
 * Légifrance le 24 septembre 2026 : type et date de l'état des lieux,
 * localisation, parties, relevés des compteurs, détail et destination des clés,
 * description par pièce, signatures. L'article 3 impose que la **forme du
 * document permette la comparaison** entre l'entrée et la sortie, et l'article 4
 * définit la vétusté comme l'usure résultant du temps ou de l'usage normal.
 *
 * Trois règles de fond gouvernent ce module, et chacune est éprouvée par un
 * test :
 *
 *  1. **Rien n'est présumé.** Un élément dont on n'a pas relevé l'état est
 *     « à renseigner », et cela n'est pas la même chose que « non vérifié » :
 *     le premier dit qu'on n'a pas encore regardé, le second qu'on a décidé de
 *     ne pas regarder. Confondre les deux ferait passer un oubli pour un
 *     constat, et le document affirmerait ce que personne n'a vu.
 *  2. **Aucun défaut n'est imputé au locataire.** L'article 4 définit la
 *     vétusté comme l'usure du temps et de l'usage normal. Le module ne
 *     qualifie donc jamais une évolution de « dégradation imputable » : il
 *     constate, et laisse l'appréciation à qui de droit.
 *  3. **Une saisie ne se perd pas.** L'état d'un élément et ses photos vivent
 *     dans le même objet, si bien qu'enregistrer l'un enregistre l'autre. Une
 *     photo détachée de l'élément qu'elle montre serait une photo perdue.
 *
 * Module **pur** : ni SQLite, ni React, ni `expo-crypto` — il est chargé par
 * `node --test`. Les identifiants sont donc **déterministes**, dérivés du rang
 * de l'élément, ce qui a un second mérite : un état des lieux de sortie construit
 * à partir de celui d'entrée réemploie exactement les mêmes identifiants, et la
 * comparaison se fait sans heuristique.
 */

import { dateCivileValide, formaterDateFr } from './period.ts';
import type { Signature, SignataireAttendu } from './signature.ts';
import { exemplairesNecessaires, signatairesAttendus, signatureValide } from './signature.ts';

// Le nombre d'exemplaires à imprimer se décide dans `signature.ts` : un
// inventaire du mobilier s'imprime lui aussi « en autant d'exemplaires que de
// parties ». Le nom reste réexposé ici, où le projet l'importe depuis l'origine.
export { exemplairesNecessaires };
// La fabrication des identifiants et l'unicité des photos vivent dans un module
// partagé avec l'inventaire du mobilier : deux documents qui rangent des photos
// de la même façon ne doivent pas porter deux règles.
import { identifiantRepris, identifiantsDePhotos as idsDePhotos, premierLibre } from './identifiants.ts';
import { ETATS_ELEMENT, estEtatValide, etatConstate, libelleEtat, presentationEtat } from './etats.ts';
import type { EtatElement, PresentationEtat } from './etats.ts';
import { normaliserNom, piecesParDefaut, PIECES_PAR_DEFAUT } from './pieces.ts';
import { objet, reprendrePhoto, reprendrePhotos, tableau, texteOuVide } from './lecture.ts';
import type { PhotoDocument } from './lecture.ts';

// Les sept états et leurs trois lecteurs sont **définis** dans `etats.ts`,
// partagés avec l'inventaire du mobilier, et réexposés ici : tout le reste du
// projet les importe depuis ce module depuis l'origine, et changer ces chemins
// n'apporterait rien.
export { ETATS_ELEMENT, etatConstate, libelleEtat, presentationEtat };
export type { EtatElement, PresentationEtat };
// Le vocabulaire des pièces est défini dans `pieces.ts`, pour la même raison.
export { normaliserNom, piecesParDefaut, PIECES_PAR_DEFAUT };

// ---------------------------------------------------------------------------
// Nature de l'état des lieux
// ---------------------------------------------------------------------------

export type TypeEdl = 'entree' | 'sortie';

export const LIBELLE_TYPE_EDL: Record<TypeEdl, string> = {
  entree: "État des lieux d'entrée",
  sortie: 'État des lieux de sortie',
};

// ---------------------------------------------------------------------------
// L'état d'un élément : sept valeurs, et ce qu'elles disent
// ---------------------------------------------------------------------------
//
// Les sept états, leurs libellés et `etatConstate` sont **définis** dans
// `etats.ts`, parce que l'inventaire du mobilier décrit ses meubles dans les
// mêmes termes. Ils sont réexposés en tête de ce fichier.

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/**
 * Une photo prise dans l'application.
 *
 * Le type est défini dans `lecture.ts`, avec le lecteur tolérant qui le
 * reconstruit depuis un contenu enregistré. Le nom `PhotoEdl` reste employé
 * ici, et partout ailleurs dans le projet : c'est le même type, et il n'en
 * existe qu'un.
 */
export type PhotoEdl = PhotoDocument;

// ---------------------------------------------------------------------------
// Pièces, éléments
// ---------------------------------------------------------------------------

/**
 * Un élément d'une pièce : le sol, un mur, un radiateur, un robinet.
 *
 * `etat` est **facultatif**, et c'est une décision de fond : un élément non
 * renseigné n'est pas un élément en bon état. Tant qu'il n'a pas d'état, le
 * document ne peut pas se terminer — l'utilisateur doit soit constater, soit
 * dire « non vérifié ». Un état par défaut serait un constat inventé.
 */
export interface ElementEdl {
  id: string;
  nom: string;
  etat?: EtatElement;
  commentaire: string;
  photos: PhotoEdl[];
}

/**
 * Une pièce du logement, avec ses éléments.
 *
 * `photos` porte la vue d'ensemble — le décret demande une description de
 * « chaque pièce et partie du logement ». Les photos de détail vivent sur leur
 * élément, sous lui.
 */
export interface PieceEdl {
  id: string;
  nom: string;
  commentaire: string;
  photos: PhotoEdl[];
  elements: ElementEdl[];
}

// ---------------------------------------------------------------------------
// Compteurs et clés
// ---------------------------------------------------------------------------

export type TypeCompteur = 'eau_froide' | 'eau_chaude' | 'electricite' | 'gaz' | 'chauffage';

export const COMPTEURS: { valeur: TypeCompteur; libelle: string; unite: string }[] = [
  { valeur: 'eau_froide', libelle: 'Eau froide', unite: 'm³' },
  { valeur: 'eau_chaude', libelle: 'Eau chaude', unite: 'm³' },
  { valeur: 'electricite', libelle: 'Électricité', unite: 'kWh' },
  { valeur: 'gaz', libelle: 'Gaz', unite: 'm³' },
  { valeur: 'chauffage', libelle: 'Chauffage', unite: 'kWh' },
];

/**
 * Un relevé de compteur.
 *
 * La valeur est une **chaîne**, jamais un nombre, et c'est délibéré : un index
 * de compteur n'est pas une quantité qu'on calcule. Il porte des zéros de tête
 * — `007412` — qui disparaîtraient si on le lisait comme un nombre, et parfois
 * une décimale. Le convertir en nombre ferait perdre l'information exacte que
 * le relevé a précisément pour objet de conserver.
 *
 * L'article 3-2 de la loi du 6 juillet 1989 impose au bailleur de compléter les
 * états des lieux d'entrée et de sortie par les relevés d'index, en présence
 * d'une installation individuelle de chauffage ou d'eau chaude sanitaire.
 */
export interface ReleveCompteur {
  id: string;
  type: TypeCompteur;
  /** L'index tel qu'il est lu sur le compteur. Chaîne, jamais un nombre. */
  valeur: string;
  /** Précision libre : « compteur du palier », « sous l'évier ». */
  precision: string;
  photo?: PhotoEdl;
}

/**
 * Une clé ou un moyen d'accès remis.
 *
 * L'article 2, 1°, g) du décret demande « le détail et la destination des clés
 * ou de tout autre moyen d'accès ». `destination` porte donc ce à quoi la clé
 * ouvre — porte d'entrée, cave, boîte aux lettres, badge de parking.
 */
export interface CleRemise {
  id: string;
  libelle: string;
  destination: string;
  quantite: number;
}

// ---------------------------------------------------------------------------
// Sections du document
// ---------------------------------------------------------------------------

export interface SectionEdl {
  valeur: string;
  titre: string;
  /** Ce que la section doit contenir, tel qu'on peut le vérifier. */
  exigence: string;
  /** La source officielle qui fonde cette section. */
  fondement: string;
}

/**
 * Les **douze sections** d'un état des lieux d'entrée, dans l'ordre.
 *
 * L'ordre suit la lecture d'un constat : d'abord ce dont on parle, puis ce qui
 * a été relevé, puis ce qui a été vu, puis qui l'affirme. Il vit ici, et non
 * dans le module de rendu : changer l'ordre change ce que le bailleur lit en
 * premier, et cela se vérifie par un test.
 *
 * Les dix premières sections répondent à l'article 2, 1° du décret ; la
 * onzième à son 1°, i) ; la dernière est propre à l'application, qui imprime
 * ses sources comme elle le fait pour le bail.
 */
export const SECTIONS_EDL: SectionEdl[] = [
  {
    valeur: 'objet',
    titre: 'Objet et cadre',
    exigence: "Le type d'état des lieux, sa date d'établissement et son cadre légal.",
    fondement: 'Décret n° 2016-382, article 2, 1°, a) et b)',
  },
  {
    valeur: 'logement',
    titre: 'Le logement',
    exigence: 'La localisation du logement : adresse, complément, type, surface.',
    fondement: 'Décret n° 2016-382, article 2, 1°, c)',
  },
  {
    valeur: 'parties',
    titre: 'Les parties',
    exigence:
      'Le nom ou la dénomination des parties, le domicile du bailleur, et le mandataire éventuel.',
    fondement: 'Décret n° 2016-382, article 2, 1°, d) et e)',
  },
  {
    valeur: 'bail',
    titre: 'Le bail de référence',
    exigence: "Les dates de la location, le loyer, les charges et le dépôt de garantie.",
    fondement:
      "Loi n° 89-462 du 6 juillet 1989, article 3-2 : l'état des lieux est joint au contrat de location",
  },
  {
    valeur: 'compteurs',
    titre: 'Relevés des compteurs',
    exigence: "Les index des compteurs d'eau et d'énergie, avec leur unité.",
    fondement: 'Décret n° 2016-382, article 2, 1°, f)',
  },
  {
    valeur: 'cles',
    titre: "Clés et moyens d'accès",
    exigence: "Le détail et la destination des clés et de tout autre moyen d'accès.",
    fondement: 'Décret n° 2016-382, article 2, 1°, g)',
  },
  {
    valeur: 'pieces',
    titre: 'État des pièces et des éléments',
    exigence:
      "Pour chaque pièce, la description de l'état des sols, murs, plafonds, équipements et éléments, avec observations et photos.",
    fondement: 'Décret n° 2016-382, article 2, 1°, h)',
  },
  {
    valeur: 'observations',
    titre: 'Observations et réserves',
    exigence: 'Les observations et réserves générales, en texte libre.',
    fondement: 'Décret n° 2016-382, article 2, 1°, h)',
  },
  {
    valeur: 'vetuste',
    titre: 'Vétusté et usure normale',
    exigence: "Le rappel que l'usure du temps et de l'usage normal n'est pas une dégradation.",
    fondement: 'Décret n° 2016-382, article 4',
  },
  {
    valeur: 'synthese',
    titre: 'Synthèse',
    exigence:
      'Le compte des éléments par état, et la liste de ce qui n’a pas été vérifié ou est sans objet.',
    fondement: 'Décret n° 2016-382, article 2, 1°, h) et article 3, 2°',
  },
  {
    valeur: 'signatures',
    titre: 'Signatures',
    exigence: 'La signature des parties, ou des personnes mandatées pour réaliser l’état des lieux.',
    fondement: 'Décret n° 2016-382, article 2, 1°, i)',
  },
  {
    valeur: 'sources',
    titre: 'Sources',
    exigence: 'Les textes sur lesquels ce document s’appuie, et la date à laquelle ils ont été lus.',
    fondement: 'Exigence propre à l’application',
  },
];

/**
 * Les sections propres à un état des lieux de **sortie**.
 *
 * L'article 2, 2° du décret ajoute trois informations qui n'ont pas de sens à
 * l'entrée : l'adresse du nouveau domicile du locataire, la date de l'état des
 * lieux d'entrée, et les évolutions constatées depuis. Elles s'insèrent dans
 * l'ordre de lecture — après le bail, dont elles dépendent, et avant la
 * synthèse, qu'elles nourrissent.
 */
export const SECTIONS_EDL_SORTIE: SectionEdl[] = [
  {
    valeur: 'reference_entree',
    titre: "L'état des lieux d'entrée",
    exigence: "La date de l'état des lieux d'entrée auquel celui-ci se compare.",
    fondement: 'Décret n° 2016-382, article 2, 2°, b)',
  },
  {
    valeur: 'nouveau_domicile',
    titre: 'Le nouveau domicile du locataire',
    exigence: "L'adresse du nouveau domicile ou du lieu d'hébergement du locataire.",
    fondement: 'Décret n° 2016-382, article 2, 2°, a)',
  },
  {
    valeur: 'evolutions',
    titre: 'Évolutions depuis l’entrée',
    exigence:
      "L'état de chaque pièce et partie du logement constaté à la sortie, mis en regard de l'état relevé à l'entrée.",
    fondement: 'Décret n° 2016-382, article 2, 2°, c)',
  },
];

/**
 * Les sections d'un état des lieux, selon sa nature.
 *
 * Une fonction, et non deux constantes, pour que les sections communes ne
 * puissent pas diverger : elles sont écrites une fois, et c'est leur **place**
 * qui change.
 */
export function sectionsEdl(type: TypeEdl): SectionEdl[] {
  if (type === 'entree') return SECTIONS_EDL;

  const [reference, domicile, evolutions] = SECTIONS_EDL_SORTIE;
  const sections = [...SECTIONS_EDL];

  // Les deux premières se lisent juste après le bail, dont elles dépendent.
  const apresBail = sections.findIndex((s) => s.valeur === 'bail') + 1;
  sections.splice(apresBail, 0, reference, domicile);

  // Les évolutions viennent en dernier avant la synthèse : elles la nourrissent
  // et se lisent après la description, dont elles tirent leurs constats.
  const avantSynthese = sections.findIndex((s) => s.valeur === 'synthese');
  sections.splice(avantSynthese, 0, evolutions);

  return sections;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface SourceEdl {
  /** Ce que la source établit, en une phrase. */
  etablit: string;
  /** Référence : texte, article. */
  reference: string;
  /** Date de consultation, `AAAA-MM-JJ`. */
  consulteLe: string;
}

/** Toutes les sources lues pour ce module, au 24 septembre 2026. */
export const SOURCES_EDL: SourceEdl[] = [
  {
    etablit:
      "L'état des lieux porte sur l'ensemble des locaux et équipements d'usage privatif mentionnés au bail et dont le locataire a la jouissance exclusive.",
    reference: 'Décret n° 2016-382 du 30 mars 2016, article 1er',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "Les informations que l'état des lieux comporte au moins : type et date, localisation, parties, relevés des compteurs, détail et destination des clés, description par pièce, observations et réserves, images, signatures.",
    reference: 'Décret n° 2016-382 du 30 mars 2016, article 2, 1°',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "À la sortie : l'adresse du nouveau domicile du locataire, la date de l'état des lieux d'entrée, et les évolutions de l'état de chaque pièce depuis l'entrée.",
    reference: 'Décret n° 2016-382 du 30 mars 2016, article 2, 2°',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "La forme du document permet la comparaison entre l'entrée et la sortie ; l'état des lieux peut être établi sous forme électronique et remis par voie dématérialisée.",
    reference: 'Décret n° 2016-382 du 30 mars 2016, article 3',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "La vétusté est l'état d'usure ou de détérioration résultant du temps ou de l'usage normal des matériaux et éléments d'équipement du logement.",
    reference: 'Décret n° 2016-382 du 30 mars 2016, article 4',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "Un état des lieux est établi, contradictoirement et amiablement, lors de la remise et de la restitution des clés, dans les mêmes formes et en autant d'exemplaires que de parties ; le locataire peut demander à le compléter dans les dix jours suivant l'entrée.",
    reference: 'Loi n° 89-462 du 6 juillet 1989, article 3-2 (version en vigueur depuis le 29 juillet 2023)',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "Le bailleur ou son mandataire complète les états des lieux d'entrée et de sortie par les relevés des index pour chaque énergie, en présence d'une installation individuelle de chauffage ou d'eau chaude sanitaire.",
    reference: 'Loi n° 89-462 du 6 juillet 1989, article 3-2, avant-dernier alinéa',
    consulteLe: '2026-09-24',
  },
];

// ---------------------------------------------------------------------------
// Le parcours guidé : six étapes
// ---------------------------------------------------------------------------

export type EtapeEdl =
  | 'logement'
  | 'pieces'
  | 'compteurs'
  | 'visite'
  | 'observations'
  | 'signature';

/**
 * L'ordre des étapes suit le geste réel : on regarde où l'on est, on convient
 * de ce qu'on va décrire, on relève les compteurs et les clés **avant** de
 * commencer à marcher — on ne revient pas en arrière pour ça — puis on visite,
 * on note, et on signe.
 *
 * La première étape ne demande **aucune saisie** : elle rappelle le logement et
 * la location, déjà enregistrés.
 */
export const ETAPES_EDL: { valeur: EtapeEdl; titre: string; aide: string }[] = [
  {
    valeur: 'logement',
    titre: 'Le logement',
    aide: 'Adresse, type et locataires, repris de la fiche du logement.',
  },
  {
    valeur: 'pieces',
    titre: 'Les pièces à visiter',
    aide: 'La liste proposée est modifiable : ajoutez, renommez, retirez.',
  },
  {
    valeur: 'compteurs',
    titre: 'Compteurs et clés',
    aide: 'Les index, et le détail des clés remises avec leur destination.',
  },
  {
    valeur: 'visite',
    titre: 'La visite, pièce par pièce',
    aide: 'Un état par élément, des observations, et des photos.',
  },
  {
    valeur: 'observations',
    titre: 'Observations et réserves',
    aide: 'Ce qui vaut pour le logement entier, en texte libre.',
  },
  {
    valeur: 'signature',
    titre: 'Signatures',
    aide: 'Le bailleur et chaque locataire signent sur l’écran.',
  },
];

export function numeroEtapeEdl(etape: EtapeEdl): number {
  return ETAPES_EDL.findIndex((e) => e.valeur === etape) + 1;
}

export function etapeSuivanteEdl(etape: EtapeEdl): EtapeEdl | null {
  const rang = ETAPES_EDL.findIndex((e) => e.valeur === etape);
  return ETAPES_EDL[rang + 1]?.valeur ?? null;
}

export function etapePrecedenteEdl(etape: EtapeEdl): EtapeEdl | null {
  const rang = ETAPES_EDL.findIndex((e) => e.valeur === etape);
  return rang > 0 ? ETAPES_EDL[rang - 1].valeur : null;
}

// ---------------------------------------------------------------------------
// Pièces et éléments proposés par défaut
// ---------------------------------------------------------------------------
//
// `normaliserNom`, `PIECES_PAR_DEFAUT` et `piecesParDefaut` sont **définis**
// dans `pieces.ts` : l'inventaire du mobilier parcourt le même logement, et une
// liste de pièces qui différerait d'un document à l'autre serait un défaut.

/** Les éléments proposés par défaut, selon la pièce.
 *
 * On part des éléments que l'article 2, 1°, h) du décret nomme lui-même — « les
 * revêtements des sols, murs et plafonds, les équipements et les éléments du
 * logement » — puis on ajoute ce que la pièce contient de particulier. Les
 * pièces inconnues reçoivent le jeu générique plutôt que rien : une pièce sans
 * élément ne se décrit pas.
 */
export const ELEMENTS_GENERIQUES: string[] = [
  'Sol',
  'Murs',
  'Plafond',
  'Porte',
  'Éclairage',
];

const ELEMENTS_PAR_PIECE: { mots: string[]; elements: string[] }[] = [
  {
    mots: ['cuisine', 'kitchenette'],
    elements: [
      'Sol',
      'Murs',
      'Plafond',
      'Évier',
      'Robinetterie',
      'Plan de travail',
      'Crédence',
      'Placards',
      'Plaques de cuisson',
      'Four',
      'Hotte',
      'Réfrigérateur',
      'Éclairage',
      'Prises',
    ],
  },
  {
    mots: ['salle de bain', 'salle d eau', 'sdb'],
    elements: [
      'Sol',
      'Murs',
      'Plafond',
      'Lavabo',
      'Robinetterie',
      'Douche',
      'Baignoire',
      'Paroi de douche',
      'Miroir',
      'Joints',
      'Ventilation',
      'Sèche-serviettes',
      'Éclairage',
      'Prises',
    ],
  },
  {
    mots: ['wc', 'toilettes'],
    elements: [
      'Sol',
      'Murs',
      'Plafond',
      'Cuvette',
      'Abattant',
      'Chasse d’eau',
      'Lavabo',
      'Ventilation',
      'Éclairage',
    ],
  },
  {
    mots: ['sejour', 'salon', 'chambre', 'piece principale'],
    elements: [
      'Sol',
      'Murs',
      'Plafond',
      'Fenêtre',
      'Porte',
      'Radiateur',
      'Placard',
      'Prises',
      'Interrupteurs',
      'Éclairage',
    ],
  },
  {
    mots: ['entree', 'couloir', 'degagement', 'palier'],
    elements: ['Sol', 'Murs', 'Plafond', 'Porte', 'Placard', 'Interrupteurs', 'Éclairage'],
  },
  {
    mots: ['balcon', 'terrasse', 'loggia'],
    elements: ['Sol', 'Murs', 'Plafond', 'Garde-corps', 'Porte-fenêtre', 'Éclairage'],
  },
  {
    mots: ['cave', 'garage', 'sous sol', 'reserve', 'emplacement'],
    elements: ['Sol', 'Murs', 'Plafond', 'Porte', 'Éclairage'],
  },
  {
    mots: ['jardin', 'cour'],
    elements: ['Sol', 'Clôture', 'Portail', 'Végétation'],
  },
];

/** Les éléments proposés pour une pièce, d'après son nom. */
export function elementsParDefaut(nomPiece: string): string[] {
  const normalise = normaliserNom(nomPiece);
  const trouve = ELEMENTS_PAR_PIECE.find((e) =>
    e.mots.some((mot) => normalise.includes(mot)),
  );
  // On recopie le tableau : rendre la constante elle-même laisserait un appelant
  // la modifier, et toutes les pièces suivantes hériteraient de sa modification.
  return [...(trouve?.elements ?? ELEMENTS_GENERIQUES)];
}

// ---------------------------------------------------------------------------
// Fabrication : identifiants déterministes
// ---------------------------------------------------------------------------
//
// `premierLibre` et `identifiantRepris` sont importés de `identifiants.ts` :
// l'inventaire du mobilier en a besoin exactement pour les mêmes raisons, et
// une règle écrite deux fois finit par n'être corrigée qu'une fois.

/** Construit une pièce vide, avec les éléments proposés pour son nom. */
export function pieceVide(nom: string, prises: readonly string[]): PieceEdl {
  const id = premierLibre('p', prises);
  const elements = elementsParDefaut(nom).map((nomElement, index) => ({
    id: `e${index + 1}`,
    nom: nomElement,
    commentaire: '',
    photos: [],
  }));
  return { id, nom, commentaire: '', photos: [], elements };
}

/** Construit la liste de pièces proposée par défaut pour un logement. */
export function piecesInitiales(typeLogement: string): PieceEdl[] {
  const pieces: PieceEdl[] = [];
  for (const nom of piecesParDefaut(typeLogement)) {
    pieces.push(pieceVide(nom, pieces.map((p) => p.id)));
  }
  return pieces;
}

/**
 * Ajoute un élément à une pièce, avec un identifiant libre dans cette pièce.
 *
 * `eviter` porte des identifiants qu'il ne faut **pas** réattribuer. Un état
 * des lieux de sortie dérive de celui d'entrée : si le bailleur retire un
 * élément puis en ajoute un autre, `premierLibre` rendrait l'identifiant laissé
 * libre — et la comparaison apparierait le nouvel élément avec celui de
 * l'entrée qu'il remplace, en imprimant une évolution qui n'a pas eu lieu. Le
 * formulaire passe donc les identifiants de l'entrée.
 */
export function ajouterElement(
  piece: PieceEdl,
  nom: string,
  eviter: readonly string[] = [],
): PieceEdl {
  return {
    ...piece,
    elements: [
      ...piece.elements,
      {
        id: premierLibre('e', [...piece.elements.map((e) => e.id), ...eviter]),
        nom,
        commentaire: '',
        photos: [],
      },
    ],
  };
}

/**
 * Tous les identifiants de photos d'un document, pièces et éléments mêlés.
 *
 * Sert à en fabriquer un qui soit libre **dans tout le document**, et non
 * seulement dans l'élément qui reçoit la photo. La distinction n'est pas
 * théorique : les photos sont indexées par identifiant au moment de
 * l'impression, si bien que deux `ph1` — l'un dans le séjour, l'autre dans la
 * chambre — ne donnaient **qu'une seule image imprimée**, celle du premier, et
 * la seconde disparaissait du document sans que rien ne le signale. Mesuré.
 */
export function identifiantsDePhotos(pieces: readonly PieceEdl[]): string[] {
  return idsDePhotos([
    ...pieces.map((p) => p.photos),
    ...pieces.flatMap((p) => p.elements.map((e) => e.photos)),
  ]);
}

/**
 * Ajoute une photo à un élément.
 *
 * `prises` porte les identifiants déjà employés **dans le document**. Sans
 * cette liste, l'identifiant est cherché libre dans le seul élément, et deux
 * éléments finissent par porter le même : l'impression n'en garde alors qu'un.
 */
export function ajouterPhoto(
  element: ElementEdl,
  photo: PhotoEdl,
  prises: readonly string[] = [],
): ElementEdl {
  return {
    ...element,
    photos: [
      ...element.photos,
      { ...photo, id: premierLibre('ph', [...element.photos.map((p) => p.id), ...prises]) },
    ],
  };
}

/**
 * Ajoute une photo à une pièce — une vue d'ensemble, sans élément désigné.
 *
 * Cette fonction existe parce que l'écran, lui, empilait la photo sans lui
 * donner d'identifiant : toutes les vues d'ensemble portaient la chaîne vide,
 * s'écrasaient dans l'index de l'impression, et une seule était dessinée.
 */
export function ajouterPhotoDePiece(
  piece: PieceEdl,
  photo: PhotoEdl,
  prises: readonly string[] = [],
): PieceEdl {
  return {
    ...piece,
    photos: [
      ...piece.photos,
      { ...photo, id: premierLibre('ph', [...piece.photos.map((p) => p.id), ...prises]) },
    ],
  };
}

// ---------------------------------------------------------------------------
// Raccourcis de saisie
// ---------------------------------------------------------------------------

/**
 * Applique un état à tous les éléments **qui n'en ont pas encore**.
 *
 * C'est le raccourci « Tout est en bon état ». Il ne touche pas aux éléments
 * déjà renseignés, et c'est une décision, pas une prudence : écraser un constat
 * déjà fait — avec son commentaire et ses photos — parce qu'on a touché un
 * bouton par erreur serait une perte de travail silencieuse. Pour tout
 * reprendre, l'écran propose de réinitialiser la pièce, ce qui est un geste
 * explicite.
 */
export function toutEnBonEtat(piece: PieceEdl, etat: EtatElement): PieceEdl {
  return {
    ...piece,
    elements: piece.elements.map((e) => (e.etat ? e : { ...e, etat })),
  };
}

/** Remet à zéro l'état de tous les éléments d'une pièce. Geste explicite. */
export function viderEtats(piece: PieceEdl): PieceEdl {
  return { ...piece, elements: piece.elements.map((e) => ({ ...e, etat: undefined })) };
}

/** Le premier élément de la pièce qui n'a pas encore d'état. */
export function premierElementARenseigner(piece: PieceEdl): ElementEdl | null {
  return piece.elements.find((e) => !e.etat) ?? null;
}

/** La première pièce qui contient un élément non renseigné. */
export function premierePieceARenseigner(pieces: PieceEdl[]): PieceEdl | null {
  return pieces.find((p) => p.elements.some((e) => !e.etat)) ?? null;
}

// ---------------------------------------------------------------------------
// Brouillon
// ---------------------------------------------------------------------------

export interface BrouillonEdl {
  logementId: string;
  bailId: string;
  type: TypeEdl;
  /** Date d'établissement, `AAAA-MM-JJ`. */
  dateEdl?: string;
  pieces?: PieceEdl[];
  compteurs?: ReleveCompteur[];
  cles?: CleRemise[];
  observations?: string;
  /** Nom et qualité d'un mandataire, s'il y en a un. */
  mandataire?: string;
  /**
   * Pour un état des lieux de sortie : l'état des lieux d'entrée auquel il se
   * compare, et l'adresse du nouveau domicile du locataire.
   */
  entreeId?: string;
  dateEntree?: string;
  nouveauDomicile?: string;
  /** Le logement comporte-t-il un chauffage ou un chauffe-eau individuel ? */
  compteursIndividuels?: boolean;
  signatures?: Signature[];
}

// ---------------------------------------------------------------------------
// Un état des lieux de sortie, dérivé de celui d'entrée
// ---------------------------------------------------------------------------

export interface SortieDerivee {
  /** Les pièces de l'entrée, à constater à nouveau. */
  pieces: PieceEdl[];
  /** Les compteurs de l'entrée, **sans leur index**. */
  compteurs: ReleveCompteur[];
  /** Les clés remises, telles qu'elles l'ont été. */
  cles: CleRemise[];
}

/**
 * Ce qu'un état des lieux de sortie reprend de celui d'entrée.
 *
 * Trois listes, et trois traitements différents — c'est là que se joue la
 * vérité du document :
 *
 *  1. **Les pièces et leurs éléments** reprennent leurs **identifiants** et
 *     leurs **noms**, mais rien d'autre. C'est par les identifiants que la
 *     comparaison apparie une chambre à la même chambre, sans deviner. Les
 *     états, les commentaires et les photos sont **vidés** : un état des lieux
 *     de sortie constate à nouveau, et recopier le constat d'entrée ferait
 *     signer au locataire un document qui décrit une visite qu'il n'a pas
 *     faite.
 *  2. **Les compteurs** gardent leur type et leur précision, et perdent leur
 *     **index**. Recopier `007412` à la sortie serait un relevé inventé : le
 *     champ vide oblige à lire le compteur, et le domaine refuse d'établir le
 *     document tant qu'il l'est.
 *  3. **Les clés** gardent leur libellé, leur destination et leur quantité.
 *     C'est une **proposition** — le cas courant est que les mêmes clés
 *     reviennent — que l'écran montre remplie et modifiable, jamais un constat
 *     déjà signé.
 */
export function sortieDepuisLEntree(entree: {
  pieces?: readonly PieceEdl[];
  compteurs?: readonly ReleveCompteur[];
  cles?: readonly CleRemise[];
}): SortieDerivee {
  return {
    pieces: (entree.pieces ?? []).map((piece) => ({
      id: piece.id,
      nom: piece.nom,
      commentaire: '',
      photos: [],
      elements: piece.elements.map((element) => ({
        id: element.id,
        nom: element.nom,
        commentaire: '',
        photos: [],
      })),
    })),
    compteurs: (entree.compteurs ?? []).map((compteur) => ({
      id: compteur.id,
      type: compteur.type,
      valeur: '',
      precision: compteur.precision,
    })),
    cles: (entree.cles ?? []).map((cle) => ({ ...cle })),
  };
}

// ---------------------------------------------------------------------------
// Comparaison entrée / sortie
// ---------------------------------------------------------------------------

/**
 * Un élément, vu à l'entrée et à la sortie.
 *
 * `evolution` n'est vrai que si les **deux** états sont *constatés* et
 * diffèrent. Un élément marqué « non vérifié » à l'entrée puis « bon » à la
 * sortie n'a pas évolué : personne ne l'avait regardé. Le confondre avec une
 * évolution ferait dire au document que quelque chose a changé là où il n'y a
 * qu'un trou comblé — c'est la distinction que porte `etatConstate`.
 *
 * Rien ici ne qualifie l'évolution : ni dégradation, ni responsabilité. Le
 * document imprime le constat, et `corpsVetuste` rappelle qu'il n'impute rien.
 */
export interface ComparaisonElement {
  id: string;
  nom: string;
  /** L'élément est décrit dans l'état des lieux d'entrée. */
  aLEntree: boolean;
  /** L'élément est décrit dans l'état des lieux de sortie. */
  aLaSortie: boolean;
  etatEntree: EtatElement | undefined;
  etatSortie: EtatElement | undefined;
  /** Les deux états sont constatés et diffèrent. */
  evolution: boolean;
  /** L'un des deux états manque ou n'est pas un constat : rien à comparer. */
  incomparable: boolean;
  /** Identifiants des photos de l'entrée, pour l'impression « avant ». */
  photosEntree: string[];
  /** Identifiants des photos de la sortie, pour l'impression « après ». */
  photosSortie: string[];
}

export interface ComparaisonPiece {
  id: string;
  /** Le nom retenu : celui de la sortie, qui est le document qu'on lit. */
  nom: string;
  /** La pièce existait-elle dans l'état des lieux d'entrée ? */
  aLEntree: boolean;
  elements: ComparaisonElement[];
}

export interface ComparaisonEdl {
  pieces: ComparaisonPiece[];
  /** Éléments dont l'état a changé entre les deux constats. */
  evolutions: number;
  /** Éléments présents à la sortie et absents de l'entrée. */
  nouveaux: number;
  /** Éléments présents à l'entrée et absents de la sortie. */
  disparus: number;
  /** Éléments dont l'un des deux états manque : ils ne se comparent pas. */
  incomparables: number;
  /** Éléments portant au moins une photo d'un côté ou de l'autre. */
  illustres: number;
}

/**
 * Met en regard l'état relevé à l'entrée et celui relevé à la sortie.
 *
 * L'appariement se fait **par identifiant**, jamais par nom ni par rang. Les
 * deux états des lieux partagent les mêmes identifiants par construction —
 * `sortieDepuisLEntree` les reprend — et c'est la seule règle qui résiste à un
 * renommage : une pièce rebaptisée « Chambre d'amis » reste la même pièce, et
 * deux pièces qui portent le même nom ne se confondent pas.
 *
 * Une pièce présente à l'entrée et absente de la sortie **n'est pas oubliée** :
 * ses éléments sont listés comme disparus. Ne pas les montrer laisserait croire
 * qu'ils ont été constatés, alors que le logement n'a pas été regardé là.
 */
export function comparerEdl(
  entree: readonly PieceEdl[],
  sortie: readonly PieceEdl[],
): ComparaisonEdl {
  const piecesEntree = new Map(entree.map((p) => [p.id, p]));
  const piecesSortie = new Map(sortie.map((p) => [p.id, p]));

  const comparer = (
    elementEntree: ElementEdl | undefined,
    elementSortie: ElementEdl | undefined,
    id: string,
    nom: string,
  ): ComparaisonElement => {
    const etatEntree = elementEntree?.etat;
    const etatSortie = elementSortie?.etat;
    const constate = etatConstate(etatEntree) && etatConstate(etatSortie);
    return {
      id,
      nom,
      aLEntree: elementEntree !== undefined,
      aLaSortie: elementSortie !== undefined,
      etatEntree,
      etatSortie,
      evolution: constate && etatEntree !== etatSortie,
      incomparable: elementEntree !== undefined && elementSortie !== undefined && !constate,
      photosEntree: (elementEntree?.photos ?? []).map((p) => p.id),
      photosSortie: (elementSortie?.photos ?? []).map((p) => p.id),
    };
  };

  const ordre = [
    ...sortie.map((p) => p.id),
    ...entree.filter((p) => !piecesSortie.has(p.id)).map((p) => p.id),
  ];

  const pieces: ComparaisonPiece[] = ordre.map((id) => {
    const a = piecesEntree.get(id);
    const b = piecesSortie.get(id);
    const nom = (b?.nom ?? a?.nom ?? '').trim();

    const elementsSortie = (b?.elements ?? []).map((e) =>
      comparer(a?.elements.find((x) => x.id === e.id), e, e.id, e.nom),
    );
    // Les éléments de l'entrée que la sortie ne décrit plus : le logement n'a
    // pas été regardé là, et le document doit le dire plutôt que de les taire.
    const disparus = (a?.elements ?? [])
      .filter((e) => !(b?.elements ?? []).some((x) => x.id === e.id))
      .map((e) => comparer(e, undefined, e.id, e.nom));

    return { id, nom, aLEntree: a !== undefined, elements: [...elementsSortie, ...disparus] };
  });

  const tous = pieces.flatMap((p) => p.elements);
  return {
    pieces,
    evolutions: tous.filter((e) => e.evolution).length,
    nouveaux: tous.filter((e) => !e.aLEntree).length,
    disparus: tous.filter((e) => !e.aLaSortie).length,
    incomparables: tous.filter((e) => e.incomparable).length,
    illustres: tous.filter((e) => e.photosEntree.length > 0 || e.photosSortie.length > 0).length,
  };
}

// ---------------------------------------------------------------------------
// Vérifications
// ---------------------------------------------------------------------------

interface ExigenceEdl {
  etape: EtapeEdl;
  manque: string;
}

/**
 * Toutes les règles du document, chacune étiquetée par l'étape qui la lève.
 *
 * Une seule liste, comme pour le bail : le formulaire lit `manquesDeLEtape` et
 * le contrôle final lit `manquesDeLEdl`, si bien que les deux ne peuvent pas
 * diverger. Un test vérifie que la somme des manques par étape est exactement la
 * liste complète, sur une douzaine de brouillons.
 */
function exigencesDeLEdl(
  b: BrouillonEdl,
  attendus?: SignataireAttendu[],
): ExigenceEdl[] {
  const exigences: ExigenceEdl[] = [];
  const ajouter = (etape: EtapeEdl, manque: string) => exigences.push({ etape, manque });

  // --- Le logement ------------------------------------------------------
  if (!b.logementId) ajouter('logement', 'Aucun logement n’est rattaché à cet état des lieux.');
  if (!b.bailId) ajouter('logement', 'Aucune location en cours n’est rattachée à cet état des lieux.');
  if (!b.dateEdl || !dateCivileValide(b.dateEdl)) {
    ajouter('logement', 'La date d’établissement est absente ou n’existe pas dans le calendrier.');
  }

  // --- Les pièces -------------------------------------------------------
  const pieces = b.pieces ?? [];
  if (pieces.length === 0) {
    ajouter('pieces', 'Aucune pièce n’est décrite. Un état des lieux sans pièce ne constate rien.');
  }
  for (const piece of pieces) {
    const nom = piece.nom.trim() || 'sans nom';
    if (!piece.nom.trim()) {
      ajouter('pieces', 'Une pièce n’a pas de nom.');
    }
    if (piece.elements.length === 0) {
      ajouter('pieces', `La pièce « ${nom} » ne contient aucun élément à décrire.`);
    }
  }
  // Un nom de pièce en double rend la comparaison entrée/sortie ambiguë : deux
  // « Chambre » ne se distinguent plus, et le document comparerait la mauvaise.
  const nomsPieces = pieces.map((p) => normaliserNom(p.nom)).filter((n) => n.length > 0);
  const doublons = nomsPieces.filter((n, i) => nomsPieces.indexOf(n) !== i);
  for (const doublon of [...new Set(doublons)]) {
    ajouter('pieces', `Deux pièces portent le même nom : « ${doublon} ».`);
  }

  // --- Les compteurs ----------------------------------------------------
  // L'article 3-2 impose les relevés d'index en présence d'une installation
  // individuelle de chauffage ou d'eau chaude sanitaire. Le bailleur a déclaré
  // s'il y en a une : c'est sa déclaration qui déclenche l'exigence, pas une
  // supposition de l'application.
  const compteurs = b.compteurs ?? [];
  if (b.compteursIndividuels === true && compteurs.length === 0) {
    ajouter(
      'compteurs',
      'Vous avez indiqué une installation individuelle : les relevés d’index doivent figurer ' +
        'sur l’état des lieux. Ajoutez-les, ou corrigez l’indication.',
    );
  }
  for (const releve of compteurs) {
    const libelle = COMPTEURS.find((c) => c.valeur === releve.type)?.libelle ?? 'compteur';
    if (!releve.valeur.trim()) ajouter('compteurs', `L’index du compteur « ${libelle} » est vide.`);
  }
  const typesCompteurs = compteurs.map((c) => c.type);
  for (const type of [...new Set(typesCompteurs)]) {
    if (typesCompteurs.filter((t) => t === type).length > 1) {
      const libelle = COMPTEURS.find((c) => c.valeur === type)?.libelle ?? type;
      ajouter('compteurs', `Deux relevés portent le même compteur : « ${libelle} ».`);
    }
  }

  // --- Les clés ---------------------------------------------------------
  for (const cle of b.cles ?? []) {
    if (!cle.libelle.trim()) ajouter('compteurs', 'Une clé remise n’est pas désignée.');
    if (!cle.destination.trim()) {
      ajouter('compteurs', `La clé « ${cle.libelle || 'sans nom'} » n’indique pas ce qu’elle ouvre.`);
    }
    if (!Number.isInteger(cle.quantite) || cle.quantite < 1) {
      ajouter('compteurs', `La quantité de la clé « ${cle.libelle || 'sans nom'} » est invalide.`);
    }
  }

  // --- La visite --------------------------------------------------------
  const aRenseigner: string[] = [];
  for (const piece of pieces) {
    for (const element of piece.elements) {
      if (!element.etat) {
        aRenseigner.push(`${piece.nom.trim() || 'pièce sans nom'} — ${element.nom || 'élément sans nom'}`);
      }
    }
  }
  if (aRenseigner.length > 0) {
    // Le message nomme les éléments : « 12 éléments » ne dit pas où aller, et
    // l'utilisateur devrait parcourir tout le logement pour les trouver.
    const apercu = aRenseigner.slice(0, 3).join(', ');
    const suite = aRenseigner.length > 3 ? `, et ${aRenseigner.length - 3} autre(s)` : '';
    ajouter(
      'visite',
      `Chaque élément doit porter un état, ou être marqué « non vérifié » : ${apercu}${suite}.`,
    );
  }

  // --- La sortie --------------------------------------------------------
  if (b.type === 'sortie') {
    if (!b.entreeId || !b.dateEntree || !dateCivileValide(b.dateEntree)) {
      ajouter(
        'logement',
        'Un état des lieux de sortie doit nommer l’état des lieux d’entrée auquel il se compare.',
      );
    }
  }

  // --- Les signatures ---------------------------------------------------
  const signatures = b.signatures ?? [];
  if (attendus && attendus.length > 0) {
    const signes = new Set(signatures.filter(signatureValide).map((s) => s.signataire));
    for (const attendu of attendus) {
      if (!signes.has(attendu.id)) {
        ajouter('signature', `${attendu.nom} n’a pas signé.`);
      }
    }
  } else if (signatures.filter(signatureValide).length === 0) {
    ajouter('signature', 'Aucune signature n’a été recueillie.');
  }

  return exigences;
}

/** Tout ce qui manque pour établir l'état des lieux. */
export function manquesDeLEdl(
  b: BrouillonEdl,
  attendus?: SignataireAttendu[],
): string[] {
  return exigencesDeLEdl(b, attendus).map((e) => e.manque);
}

/** Ce qui manque pour pouvoir quitter une étape donnée. */
export function manquesDeLEtapeEdl(
  b: BrouillonEdl,
  etape: EtapeEdl,
  attendus?: SignataireAttendu[],
): string[] {
  return exigencesDeLEdl(b, attendus)
    .filter((e) => e.etape === etape)
    .map((e) => e.manque);
}

// ---------------------------------------------------------------------------
// Avertissements : ce qui se signale sans bloquer
// ---------------------------------------------------------------------------

/**
 * Ce que le document signale sans empêcher de l'établir.
 *
 * Le partage est le même que pour le bail : ce qui est **interdit** bloque, ce
 * qui est **incomplet** se signale. Un état des lieux peut légitimement ne pas
 * avoir de relevé de compteur s'il n'y a pas de compteur individuel ; il ne peut
 * pas légitimement décrire un élément sans dire dans quel état il est.
 */
export function avertissementsDeLEdl(b: BrouillonEdl): string[] {
  const avertissements: string[] = [];
  const pieces = b.pieces ?? [];

  const sansPhoto = pieces.filter(
    (p) => p.photos.length === 0 && p.elements.every((e) => e.photos.length === 0),
  );
  if (sansPhoto.length > 0) {
    avertissements.push(
      `Aucune photo pour ${sansPhoto.length} pièce(s) : ${sansPhoto
        .map((p) => p.nom)
        .slice(0, 3)
        .join(', ')}. Une photo vaut mieux qu'une description.`,
    );
  }

  const nonVerifies = pieces
    .flatMap((p) => p.elements.map((e) => ({ piece: p.nom, element: e })))
    .filter((x) => x.element.etat === 'non_verifie');
  if (nonVerifies.length > 0) {
    avertissements.push(
      `${nonVerifies.length} élément(s) sont marqués « non vérifié ». Le document le dira, ` +
        'et l’état des lieux sera d’autant plus contestable sur ces points.',
    );
  }

  if ((b.compteurs ?? []).length === 0 && b.compteursIndividuels !== true) {
    avertissements.push(
      'Aucun relevé de compteur. Si le logement a un chauffage ou un chauffe-eau individuel, ' +
        'les index doivent figurer sur l’état des lieux.',
    );
  }

  if ((b.cles ?? []).length === 0) {
    avertissements.push(
      'Aucune clé n’est décrite. Le décret demande le détail et la destination des clés remises.',
    );
  }

  if (b.type === 'entree') {
    avertissements.push(
      'Le locataire peut demander à compléter l’état des lieux d’entrée dans les dix jours ' +
        'suivant son établissement.',
    );
  } else {
    // L'adresse du nouveau domicile est une mention obligatoire de l'état des
    // lieux de sortie (article 2, 2°, a) du décret). Elle se signale sans
    // bloquer : le locataire peut légitimement ne pas savoir encore où il
    // habitera, et refuser d'établir la sortie pour cela laisserait le
    // bailleur sans constat du tout.
    if (!b.nouveauDomicile || !b.nouveauDomicile.trim()) {
      avertissements.push(
        'L’adresse du nouveau domicile du locataire n’est pas renseignée. L’état des lieux de ' +
          'sortie doit la comporter : demandez-la, ou établissez le document en le signalant.',
      );
    }
  }

  if (!b.mandataire || !b.mandataire.trim()) {
    // Rien à signaler : un mandataire est facultatif. Le cas est nommé pour que
    // la lecture du partage « bloque / signale » ne laisse pas croire à un oubli.
  }

  return avertissements;
}

/**
 * Combien d'exemplaires remettre.
 *
 * La règle vit dans `signature.ts` et est réexposée en tête de ce fichier.
 */

/**
 * Qui doit signer un état des lieux, dans quel ordre et sous quel identifiant.
 *
 * La règle est celle de `signature.ts`, partagée avec l'inventaire du mobilier :
 * un document se signe de la même façon, quelle que soit sa nature. Le nom
 * reste, parce que tout le projet l'importe depuis l'origine.
 */
export function signatairesAttendusDeLEdl(params: {
  nomBailleur: string;
  titulaires: readonly { id: string; nom: string; prenom: string }[];
  mandataire?: string | null;
}): SignataireAttendu[] {
  return signatairesAttendus(params);
}

// ---------------------------------------------------------------------------
// Synthèse
// ---------------------------------------------------------------------------

export interface SyntheseEdl {
  /** Nombre total d'éléments décrits. */
  total: number;
  /** Nombre d'éléments portant un état constaté. */
  constates: number;
  /** Nombre d'éléments sans état : le document ne peut pas être établi. */
  aRenseigner: number;
  /** Le compte par état, dans l'ordre de `ETATS_ELEMENT`. */
  parEtat: { etat: EtatElement; libelle: string; nombre: number }[];
  /** Nombre de pièces décrites. */
  pieces: number;
  /** Nombre de photos. */
  photos: number;
}

/**
 * Le compte des éléments, par état.
 *
 * Les états non constatés y figurent comme les autres, mais séparément dans
 * `constates` : c'est la distinction qui empêche le document d'annoncer
 * « 12 éléments en bon état » alors que deux n'ont jamais été regardés.
 */
export function syntheseEdl(b: BrouillonEdl): SyntheseEdl {
  const elements = (b.pieces ?? []).flatMap((p) => p.elements);
  const parEtat = ETATS_ELEMENT.map((e) => ({
    etat: e.valeur,
    libelle: e.libelle,
    nombre: elements.filter((x) => x.etat === e.valeur).length,
  }));

  return {
    total: elements.length,
    constates: elements.filter((e) => etatConstate(e.etat)).length,
    aRenseigner: elements.filter((e) => !e.etat).length,
    parEtat,
    pieces: (b.pieces ?? []).length,
    photos:
      (b.pieces ?? []).reduce(
        (n, p) => n + p.photos.length + p.elements.reduce((m, e) => m + e.photos.length, 0),
        0,
      ),
  };
}

/** Le titre de la pièce, tel qu'il apparaîtra dans le dossier. */
export function titreDeLEdl(type: TypeEdl, dateEdl: string): string {
  return `${LIBELLE_TYPE_EDL[type]} du ${formaterDateFr(dateEdl)}`;
}

// ---------------------------------------------------------------------------
// Reprise d'un brouillon
// ---------------------------------------------------------------------------
//
// `texteOuVide`, `tableau`, `objet`, `reprendrePhoto` et `reprendrePhotos` sont
// importés de `lecture.ts` : l'inventaire du mobilier relit ses meubles et ses
// photos exactement de la même façon, et une règle de sûreté écrite deux fois
// finit par n'être corrigée qu'une fois.

const TYPES_COMPTEURS = new Set<string>(COMPTEURS.map((c) => c.valeur));

function reprendreElement(valeur: unknown, pris: string[], photosPrises: string[]): ElementEdl | null {
  const o = objet(valeur);
  if (!o) return null;
  const nom = texteOuVide(o.nom).trim();
  if (!nom) return null;

  const etat = texteOuVide(o.etat);
  return {
    id: identifiantRepris(o.id, 'e', pris),
    nom,
    // Un état inconnu est traité comme absent : le conserver ferait afficher
    // une case vide dans la liste des sept, et le contrôle final refuserait un
    // élément que l'utilisateur croirait avoir renseigné.
    etat: estEtatValide(etat) ? etat : undefined,
    commentaire: texteOuVide(o.commentaire),
    photos: reprendrePhotos(o.photos, photosPrises),
  };
}

function reprendrePiece(valeur: unknown, pris: string[], photosPrises: string[]): PieceEdl | null {
  const o = objet(valeur);
  if (!o) return null;
  const nom = texteOuVide(o.nom).trim();
  if (!nom) return null;

  const elements: ElementEdl[] = [];
  for (const brut of tableau(o.elements)) {
    const element = reprendreElement(brut, elements.map((e) => e.id), photosPrises);
    if (element) elements.push(element);
  }

  return {
    id: identifiantRepris(o.id, 'p', pris),
    nom,
    commentaire: texteOuVide(o.commentaire),
    photos: reprendrePhotos(o.photos, photosPrises),
    elements,
  };
}

function reprendreCompteur(valeur: unknown, pris: string[]): ReleveCompteur | null {
  const o = objet(valeur);
  if (!o) return null;
  const type = texteOuVide(o.type);
  if (!TYPES_COMPTEURS.has(type)) return null;

  const releve: ReleveCompteur = {
    id: identifiantRepris(o.id, 'c', pris),
    type: type as TypeCompteur,
    // L'index reste une chaîne, y compris s'il a été écrit comme un nombre par
    // une version antérieure : le convertir ferait perdre les zéros de tête.
    valeur: typeof o.valeur === 'number' ? String(o.valeur) : texteOuVide(o.valeur),
    precision: texteOuVide(o.precision),
  };
  const photo = reprendrePhoto(o.photo, []);
  if (photo) releve.photo = photo;
  return releve;
}

function reprendreCle(valeur: unknown, pris: string[]): CleRemise | null {
  const o = objet(valeur);
  if (!o) return null;
  const libelle = texteOuVide(o.libelle).trim();
  if (!libelle) return null;

  const quantite = typeof o.quantite === 'number' && Number.isInteger(o.quantite) ? o.quantite : 1;
  return {
    id: identifiantRepris(o.id, 'k', pris),
    libelle,
    destination: texteOuVide(o.destination),
    quantite: quantite >= 1 ? quantite : 1,
  };
}

function reprendreSignature(valeur: unknown): Signature | null {
  const o = objet(valeur);
  if (!o) return null;
  const signature: Signature = {
    signataire: texteOuVide(o.signataire),
    nom: texteOuVide(o.nom),
    date: texteOuVide(o.date),
    trace: texteOuVide(o.trace),
  };
  // Une signature sans tracé n'est pas une signature, c'est une case cochée.
  return signatureValide(signature) ? signature : null;
}

/**
 * Relit un brouillon venu de la base, champ par champ.
 *
 * Le contrôle est **strict**, et c'est le point de ce module. Un brouillon peut
 * venir d'une version antérieure, d'une sauvegarde restaurée, ou d'un JSON
 * tronqué. Le laisser passer tel quel ferait entrer dans le document des valeurs
 * qu'aucun contrôle n'a vues — et un état d'élément inventé est un constat que
 * personne n'a fait.
 *
 * Rien n'est deviné : un champ du mauvais type est **ignoré**, pas converti.
 * `'bon'` n'est pas un état valide, et `36` n'est pas un nom de pièce.
 */
export function reprendreBrouillonEdl(
  donnees: Record<string, unknown>,
  base: BrouillonEdl,
): BrouillonEdl {
  const resultat: BrouillonEdl = { ...base };

  const logementId = texteOuVide(donnees.logementId);
  if (logementId) resultat.logementId = logementId;
  const bailId = texteOuVide(donnees.bailId);
  if (bailId) resultat.bailId = bailId;

  if (donnees.type === 'entree' || donnees.type === 'sortie') {
    resultat.type = donnees.type;
  }

  const dateEdl = texteOuVide(donnees.dateEdl);
  if (dateCivileValide(dateEdl)) resultat.dateEdl = dateEdl;

  if (Array.isArray(donnees.pieces)) {
    const pieces: PieceEdl[] = [];
    // Les identifiants de photos sont rendus uniques **dans tout le
    // document** : c'est ce que l'impression suppose, en indexant les images
    // par identifiant. Deux listes séparées — une par élément — laisseraient
    // passer deux `ph1`, et la seconde photo ne serait pas imprimée.
    const photosPrises: string[] = [];
    for (const brut of donnees.pieces) {
      const piece = reprendrePiece(brut, pieces.map((p) => p.id), photosPrises);
      if (piece) pieces.push(piece);
    }
    resultat.pieces = pieces;
  }

  if (Array.isArray(donnees.compteurs)) {
    const compteurs: ReleveCompteur[] = [];
    for (const brut of donnees.compteurs) {
      const releve = reprendreCompteur(brut, compteurs.map((c) => c.id));
      if (releve) compteurs.push(releve);
    }
    resultat.compteurs = compteurs;
  }

  if (Array.isArray(donnees.cles)) {
    const cles: CleRemise[] = [];
    for (const brut of donnees.cles) {
      const cle = reprendreCle(brut, cles.map((c) => c.id));
      if (cle) cles.push(cle);
    }
    resultat.cles = cles;
  }

  if (Array.isArray(donnees.signatures)) {
    const signatures: Signature[] = [];
    for (const brut of donnees.signatures) {
      const signature = reprendreSignature(brut);
      if (signature) signatures.push(signature);
    }
    resultat.signatures = signatures;
  }

  if (typeof donnees.observations === 'string') resultat.observations = donnees.observations;
  if (typeof donnees.mandataire === 'string') resultat.mandataire = donnees.mandataire;
  if (typeof donnees.entreeId === 'string') resultat.entreeId = donnees.entreeId;
  if (typeof donnees.nouveauDomicile === 'string') resultat.nouveauDomicile = donnees.nouveauDomicile;

  const dateEntree = texteOuVide(donnees.dateEntree);
  if (dateCivileValide(dateEntree)) resultat.dateEntree = dateEntree;

  if (typeof donnees.compteursIndividuels === 'boolean') {
    resultat.compteursIndividuels = donnees.compteursIndividuels;
  }

  return resultat;
}

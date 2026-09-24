/**
 * Le dossier documentaire d'un logement.
 *
 * Un logement n'a pas « des documents » en vrac : il a une **succession de
 * locations**, et chacune porte ses pièces. Le bail fonde la location, l'état
 * des lieux d'entrée la décrit au départ, celui de sortie à l'arrivée, les
 * quittances l'attestent mois après mois. Ranger ces pièces dans cet ordre
 * n'est pas une question de présentation : c'est la seule façon de retrouver,
 * trois ans plus tard, ce qui a été signé — et de ne pas confondre l'état des
 * lieux d'un locataire avec celui du suivant.
 *
 * Deux conséquences que ce module tient :
 *
 *  - **les quittances d'un locataire parti ne disparaissent jamais.** Elles
 *    restent dans sa location, sous son nom, même quand un nouveau locataire
 *    occupe le logement. Un locataire qui conteste un paiement de l'an dernier
 *    doit pouvoir être renvoyé à sa quittance ;
 *  - **une pièce qui ne concerne pas une location reste rattachée au bien.**
 *    Un diagnostic, une facture de travaux, un acte de propriété ne se rangent
 *    sous aucun locataire : ils sont rangés sous le logement.
 *
 * Tout est ici en fonctions pures : le module ne lit ni la base ni le disque,
 * et se teste donc sans émulateur.
 */

// Les extensions `.ts` sont obligatoires : ce module est chargé directement par
// `node --test`, qui ne résout ni `@/` ni un chemin sans extension.
import { depuisCle, libelleLongCapitalise } from './period.ts';
import { LIBELLE_DOCUMENT, LIBELLE_PIECE } from './types.ts';
import type {
  Bail,
  CategorieDocument,
  Document,
  PieceDossier,
  TitulaireBail,
  TypePiece,
} from './types.ts';

// ---------------------------------------------------------------------------
// Les sections d'un dossier, dans l'ordre où elles se lisent
// ---------------------------------------------------------------------------

/** Une section du dossier. Ce n'est pas une catégorie : l'ordre diffère. */
export type CleSection =
  | 'bail'
  | 'edl_entree'
  | 'edl_sortie'
  | 'inventaire'
  | 'quittances'
  | 'autres';

/**
 * Les sections, dans l'ordre de lecture d'une location.
 *
 * L'ordre est la donnée : il raconte la location du début à la fin. Le
 * `satisfait` d'un plan de contrôle se lit donc ici, et pas dans un écran.
 */
export const SECTIONS_DU_DOSSIER: { cle: CleSection; libelle: string }[] = [
  { cle: 'bail', libelle: LIBELLE_PIECE.bail },
  { cle: 'edl_entree', libelle: LIBELLE_PIECE.edl_entree },
  { cle: 'edl_sortie', libelle: LIBELLE_PIECE.edl_sortie },
  { cle: 'inventaire', libelle: LIBELLE_PIECE.inventaire },
  { cle: 'quittances', libelle: 'Quittances de loyer' },
  { cle: 'autres', libelle: LIBELLE_PIECE.autre },
];

/**
 * La catégorie d'onglet sous laquelle une pièce se range.
 *
 * Les deux états des lieux se répartissent dans deux sections mais dans une
 * seule catégorie : c'est la même famille de document, et l'onglet DOCUMENTS
 * les présente ensemble.
 */
export function categorieDePiece(type: TypePiece): CategorieDocument {
  switch (type) {
    case 'bail':
      return 'baux';
    case 'edl_entree':
    case 'edl_sortie':
      return 'etats_des_lieux';
    case 'inventaire':
      return 'inventaires';
    case 'autre':
      return 'autres';
  }
}

/** La section du dossier sous laquelle une pièce se range. */
export function sectionDePiece(type: TypePiece): CleSection {
  switch (type) {
    case 'bail':
      return 'bail';
    case 'edl_entree':
      return 'edl_entree';
    case 'edl_sortie':
      return 'edl_sortie';
    case 'inventaire':
      return 'inventaire';
    case 'autre':
      return 'autres';
  }
}

// ---------------------------------------------------------------------------
// L'élément rangé : la forme commune à une pièce et à un document émis
// ---------------------------------------------------------------------------

/**
 * Ce qu'un écran affiche, quelle que soit l'origine.
 *
 * Réunir une pièce et une quittance sous une même forme évite de dupliquer
 * chaque liste, chaque ligne et chaque bouton — et donc d'en oublier une quand
 * une règle change.
 */
export interface ElementDossier {
  id: string;
  /** D'où vient l'élément : une pièce rangée, ou un document émis. */
  origine: 'piece' | 'document';
  logementId: string;
  categorie: CategorieDocument;
  section: CleSection;
  libelle: string;
  /** Date portée par l'élément, `AAAA-MM-JJ`. */
  date: string;
  cheminFichier: string;
  /** Numéro du document émis. Absent pour une pièce. */
  numero?: string;
  /** Mois concerné, pour une quittance. Absent sinon. */
  periode?: string;
}

/** Le mois d'une clé `AAAA-MM`, écrit en toutes lettres. */
function libelleMois(cle: string): string {
  const mois = depuisCle(cle);
  return mois ? libelleLongCapitalise(mois) : cle;
}

export function elementDePiece(piece: PieceDossier): ElementDossier {
  return {
    id: piece.id,
    origine: 'piece',
    logementId: piece.logementId,
    categorie: categorieDePiece(piece.type),
    section: sectionDePiece(piece.type),
    libelle: piece.titre.trim() || LIBELLE_PIECE[piece.type],
    date: piece.dateDocument,
    cheminFichier: piece.cheminFichier,
  };
}

export function elementDeDocument(document: Document): ElementDossier {
  return {
    id: document.id,
    origine: 'document',
    logementId: document.logementId,
    categorie: 'quittances',
    section: 'quittances',
    libelle: `${LIBELLE_DOCUMENT[document.type]} · ${libelleMois(document.periode)}`,
    date: document.dateEmission,
    cheminFichier: document.cheminFichier,
    numero: document.numero,
    periode: document.periode,
  };
}

// ---------------------------------------------------------------------------
// Le dossier
// ---------------------------------------------------------------------------

export interface SectionDossier {
  cle: CleSection;
  libelle: string;
  /** Du plus récent au plus ancien. Vide si la section n'a rien. */
  elements: ElementDossier[];
}

export interface DossierOccupation {
  bail: Bail;
  titulaires: TitulaireBail[];
  /** Vrai pour la location en cours. Une seule peut l'être. */
  enCours: boolean;
  /** Les six sections, dans l'ordre de lecture, vides comprises. */
  sections: SectionDossier[];
  /** Nombre d'éléments rangés, toutes sections confondues. */
  nombre: number;
}

export interface DossierLogement {
  /**
   * Les locations, la plus récente d'abord, celle en cours en tête.
   *
   * Elles ne sont jamais filtrées : un logement qui a connu trois locataires
   * montre les trois. C'est ce qui permet de répondre à une contestation
   * portant sur une location terminée.
   */
  occupations: DossierOccupation[];
  /** Pièces rattachées au bien, hors de toute location. */
  bien: ElementDossier[];
}

/**
 * Trie deux éléments du plus récent au plus ancien.
 *
 * À date égale — deux quittances émises le même jour — le numéro départage, et
 * à défaut l'identifiant : l'ordre reste donc stable d'un affichage à l'autre,
 * ce qu'un tri laissé au hasard ne garantit pas.
 */
function plusRecentDabord(a: ElementDossier, b: ElementDossier): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.numero !== undefined && b.numero !== undefined && a.numero !== b.numero) {
    return a.numero < b.numero ? 1 : -1;
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Les six sections, alimentées par les éléments fournis. */
export function sectionsDepuis(elements: ElementDossier[]): SectionDossier[] {
  return SECTIONS_DU_DOSSIER.map(({ cle, libelle }) => ({
    cle,
    libelle,
    elements: elements.filter((e) => e.section === cle).sort(plusRecentDabord),
  }));
}

/**
 * Assemble le dossier d'un logement.
 *
 * Les éléments sont répartis par `bailId`. Ceux qui n'en portent aucun — ou qui
 * en portent un qui n'existe plus, ce qu'une restauration de sauvegarde peut
 * produire — sont rangés sous le bien plutôt que perdus : un document qu'on ne
 * sait plus rattacher doit rester **visible**, sinon il devient introuvable
 * sans que personne ne s'en aperçoive.
 */
export function construireDossier(entree: {
  bails: Bail[];
  titulaires: TitulaireBail[];
  pieces: PieceDossier[];
  documents: Document[];
}): DossierLogement {
  const elements: ElementDossier[] = [
    ...entree.pieces.map(elementDePiece),
    ...entree.documents.map(elementDeDocument),
  ];

  const parBail = new Map<string, ElementDossier[]>();
  for (const bail of entree.bails) parBail.set(bail.id, []);

  const bien: ElementDossier[] = [];
  const piecesParBail = new Map<string, string>();
  for (const piece of entree.pieces) {
    if (piece.bailId) piecesParBail.set(piece.id, piece.bailId);
  }
  const documentsParBail = new Map<string, string>();
  for (const document of entree.documents) {
    documentsParBail.set(document.id, document.bailId);
  }

  for (const element of elements) {
    const bailId =
      element.origine === 'piece'
        ? piecesParBail.get(element.id)
        : documentsParBail.get(element.id);

    const seau = bailId !== undefined ? parBail.get(bailId) : undefined;
    if (seau) seau.push(element);
    else bien.push(element);
  }

  const titulairesParBail = new Map<string, TitulaireBail[]>();
  for (const titulaire of entree.titulaires) {
    const liste = titulairesParBail.get(titulaire.bailId);
    if (liste) liste.push(titulaire);
    else titulairesParBail.set(titulaire.bailId, [titulaire]);
  }

  const occupations: DossierOccupation[] = entree.bails
    // La location en cours d'abord ; ensuite, la plus récemment terminée. Une
    // location sans date d'entrée lisible passe en dernier plutôt que de faire
    // échouer la comparaison.
    .slice()
    .sort((a, b) => {
      const aEnCours = !a.dateSortie;
      const bEnCours = !b.dateSortie;
      if (aEnCours !== bEnCours) return aEnCours ? -1 : 1;
      const aFin = a.dateSortie ?? a.dateEntree;
      const bFin = b.dateSortie ?? b.dateEntree;
      if (aFin !== bFin) return aFin < bFin ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    })
    .map((bail) => {
      const dedans = parBail.get(bail.id) ?? [];
      const titulaires = (titulairesParBail.get(bail.id) ?? [])
        .slice()
        .sort((a, b) => a.ordre - b.ordre);
      return {
        bail,
        titulaires,
        enCours: !bail.dateSortie,
        sections: sectionsDepuis(dedans),
        nombre: dedans.length,
      };
    });

  return { occupations, bien: bien.sort(plusRecentDabord) };
}

// ---------------------------------------------------------------------------
// Vue transversale : l'onglet DOCUMENTS
// ---------------------------------------------------------------------------

/**
 * Tous les éléments, rangés par catégorie d'onglet.
 *
 * C'est la vue « tous logements confondus » : elle sert à retrouver un
 * document dont on ne sait plus quel logement il concerne. Chaque catégorie
 * existe même vide — un onglet qui disparaît parce qu'il n'a rien à montrer
 * ferait croire que la catégorie n'existe pas.
 */
export function elementsParCategorie(entree: {
  pieces: PieceDossier[];
  documents: Document[];
}): Record<CategorieDocument, ElementDossier[]> {
  const elements = [
    ...entree.pieces.map(elementDePiece),
    ...entree.documents.map(elementDeDocument),
  ].sort(plusRecentDabord);

  const resultat: Record<CategorieDocument, ElementDossier[]> = {
    quittances: [],
    baux: [],
    etats_des_lieux: [],
    inventaires: [],
    autres: [],
  };
  for (const element of elements) resultat[element.categorie].push(element);
  return resultat;
}

/** Le nombre d'éléments d'une catégorie, pour une pastille de comptage. */
export function compterParCategorie(
  elements: Record<CategorieDocument, ElementDossier[]>,
): Record<CategorieDocument, number> {
  const resultat: Record<CategorieDocument, number> = {
    quittances: 0,
    baux: 0,
    etats_des_lieux: 0,
    inventaires: 0,
    autres: 0,
  };
  for (const categorie of Object.keys(resultat) as CategorieDocument[]) {
    resultat[categorie] = elements[categorie].length;
  }
  return resultat;
}

/**
 * Un état des lieux de sortie se compare à l'entrée de **la même location**.
 *
 * La règle vit ici parce qu'elle décide de ce qui s'affiche : sans elle, un
 * écran pourrait apparier la sortie d'un locataire avec l'entrée du suivant, et
 * présenter comme « dégradations » ce qui n'est que le passage d'un occupant à
 * un autre.
 */
export function etatDesLieuxEntreeApparie(
  pieces: PieceDossier[],
  bailId: string,
): PieceDossier | null {
  const entrees = pieces
    .filter((p) => p.bailId === bailId && p.type === 'edl_entree')
    .sort((a, b) => (a.dateDocument < b.dateDocument ? 1 : -1));
  return entrees[0] ?? null;
}

// ---------------------------------------------------------------------------
// Saisie d'une pièce
// ---------------------------------------------------------------------------

/**
 * Ce qu'un écran rassemble avant d'enregistrer une pièce.
 *
 * Les champs sont des chaînes, y compris la date : c'est ce que la saisie
 * produit réellement. La conversion et le refus se décident ici, en fonction
 * pure, plutôt que dans l'écran — un écran ne peut donc pas enregistrer une
 * pièce sans date lisible.
 */
export interface BrouillonPiece {
  logementId: string | null;
  type: TypePiece;
  /** Chemin du fichier choisi sur le téléphone, ou `null`. */
  fichier: string | null;
  titre: string;
  /** Date portée par le document, telle que saisie. */
  date: string;
}

/**
 * Ce qui manque pour pouvoir enregistrer, en français, à afficher tel quel.
 *
 * Une liste vide signifie que la pièce peut être enregistrée. On renvoie la
 * liste entière plutôt que le premier manque : corriger un formulaire en
 * découvrant les erreurs une par une est le meilleur moyen d'en abandonner un.
 */
export function manquesDuBrouillon(b: BrouillonPiece): string[] {
  const manques: string[] = [];

  if (!b.logementId) manques.push('Choisissez le logement auquel ce document se rattache.');
  if (!b.fichier) manques.push('Choisissez le fichier du document.');
  if (!b.titre.trim()) manques.push('Donnez un titre : il sera le nom affiché dans le dossier.');

  const date = b.date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    manques.push('La date doit être écrite au format AAAA-MM-JJ, par exemple 2026-09-01.');
  } else {
    const [annee, mois, jour] = date.split('-').map(Number);
    const reelle = new Date(Date.UTC(annee, mois - 1, jour));
    if (
      reelle.getUTCFullYear() !== annee ||
      reelle.getUTCMonth() !== mois - 1 ||
      reelle.getUTCDate() !== jour
    ) {
      // `2026-02-31` a la bonne forme et n'existe pas : accepter la forme seule
      // daterait une pièce d'un jour qui n'a jamais eu lieu.
      manques.push('Cette date n’existe pas dans le calendrier.');
    }
  }

  return manques;
}

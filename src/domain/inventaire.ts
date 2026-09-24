/**
 * L'inventaire du mobilier d'un logement meublé.
 *
 * Un état des lieux décrit l'état du **bâti** ; un inventaire compte et décrit
 * ce qui est **meublant**. Ce n'est pas la même question, et c'est pourquoi ce
 * module existe plutôt qu'un détournement du premier : un meuble a une
 * **quantité**, et une quantité qui change d'un constat à l'autre est
 * exactement ce qu'un inventaire de sortie doit dire.
 *
 * **Aucune exigence n'est inventée dans ce fichier.** La liste des onze éléments
 * que le mobilier d'un logement meublé doit comporter est l'article 2 du décret
 * n° 2015-981 du 31 juillet 2015, lu à Légifrance le 24 septembre 2026 ; elle est
 * reproduite mot pour mot. Le reste — sections, parcours, contrôles — est propre
 * à l'application, et chaque section le dit dans son `fondement`.
 *
 * Trois règles de fond gouvernent ce module :
 *
 *  1. **Une quantité non comptée n'est pas un compte.** Le nombre d'exemplaires
 *     d'un meuble est facultatif, et son absence empêche l'établissement du
 *     document. C'est la même règle que pour l'état d'un élément : recopier la
 *     quantité de l'inventaire d'entrée à la sortie serait un inventaire
 *     inventé, exactement comme recopier un index de compteur serait un relevé
 *     inventé. L'écran, lui, affiche la quantité d'entrée **à côté** du champ
 *     vide : un rappel se lit, il ne se valide pas.
 *  2. **Un écart n'est imputé à personne.** Un meuble manquant, un meuble
 *     abîmé : le document le constate et s'arrête là. Il ne dit ni « disparu par
 *     la faute du locataire », ni « dégradation ». L'usure du temps et de
 *     l'usage normal n'est pas une dégradation — c'est l'article 4 du décret
 *     n° 2016-382, et l'appréciation appartient à qui de droit.
 *  3. **Rien n'est présumé présent.** L'absence d'un élément obligatoire est
 *     **signalée**, pas bloquante : l'application ne sait pas si le logement est
 *     loué meublé, ni si le meuble est ailleurs. Elle le dit, et le bailleur
 *     décide.
 *
 * Module **pur** : ni SQLite, ni React, ni `expo-crypto` — il est chargé par
 * `node --test`. Les identifiants sont donc **déterministes**, dérivés du rang,
 * ce qui a un second mérite : un inventaire de sortie construit à partir de
 * celui d'entrée réemploie exactement les mêmes identifiants, et la comparaison
 * se fait par égalité, sans heuristique.
 */

import { dateCivileValide, formaterDateFr } from './period.ts';
import type { Signature, SignataireAttendu } from './signature.ts';
import { signatairesAttendus, signatureValide } from './signature.ts';
import { ETATS_ELEMENT, estEtatValide, etatConstate } from './etats.ts';
import type { EtatElement } from './etats.ts';
import { identifiantRepris, identifiantsDePhotos as idsDePhotos, premierLibre } from './identifiants.ts';
import { normaliserNom, piecesParDefaut } from './pieces.ts';
import { objet, reprendrePhotos, tableau, texteOuVide } from './lecture.ts';
import type { PhotoDocument } from './lecture.ts';

// ---------------------------------------------------------------------------
// Nature de l'inventaire
// ---------------------------------------------------------------------------

export type TypeInventaire = 'entree' | 'sortie';

export const LIBELLE_TYPE_INVENTAIRE: Record<TypeInventaire, string> = {
  entree: "Inventaire du mobilier d'entrée",
  sortie: 'Inventaire du mobilier de sortie',
};

// ---------------------------------------------------------------------------
// Le mobilier : des meubles, dans des pièces
// ---------------------------------------------------------------------------

/**
 * Un meuble constaté : ce qu'il est, combien il y en a, dans quel état.
 *
 * `quantite` et `etat` sont **tous deux facultatifs**, et leur absence empêche
 * l'établissement du document. Une quantité par défaut à 1 ferait compter un
 * meuble qu'on n'a pas compté ; un état par défaut serait un constat inventé.
 *
 * La quantité **zéro** a un sens, et c'est un sens utile : elle dit « il n'y en
 * a plus ». C'est ainsi qu'un inventaire de sortie rapporte qu'une chaise a
 * disparu, sans qu'on ait besoin d'un vocabulaire d'accusation.
 */
export interface MeubleInventaire {
  id: string;
  nom: string;
  /** Nombre d'exemplaires comptés. `0` signifie « il n'y en a pas ». */
  quantite?: number;
  etat?: EtatElement;
  /** Observations libres : « rayure sur le plateau », « pied droit fendu ». */
  commentaire: string;
  photos: PhotoDocument[];
}

/**
 * Une pièce du logement, avec son mobilier.
 *
 * Les meubles vivent **dans** la pièce, et non dans une liste à part indexée par
 * pièce : une liste détachée finit par désigner une pièce qui n'existe plus, et
 * le meuble devient introuvable.
 */
export interface PieceInventaire {
  id: string;
  nom: string;
  meubles: MeubleInventaire[];
}

// ---------------------------------------------------------------------------
// Le mobilier obligatoire d'un logement meublé
// ---------------------------------------------------------------------------

/**
 * Un élément que le mobilier d'un logement meublé doit comporter.
 *
 * `libelle` reproduit le texte publié, **y compris son orthographe** : c'est une
 * citation, et un texte cité garde la sienne. Le Journal officiel écrit
 * « Etagères » sans accent ; le corriger ferait dire au document autre chose que
 * ce que l'article dit.
 */
export interface ElementMeubleObligatoire {
  /** Le rang dans l'article : « 1° », « 2° »… */
  rang: string;
  /** Le texte de l'article, mot pour mot. */
  libelle: string;
  /** Des mots qui, dans un nom de meuble, désignent cet élément. */
  mots: string[];
  /** La pièce où il se trouve le plus souvent. Sert à proposer, jamais à imposer. */
  piece: string;
}

/**
 * Les **onze** éléments de l'article 2 du décret n° 2015-981 du 31 juillet 2015.
 *
 * Texte reproduit tel qu'il a été lu à Légifrance le 24 septembre 2026. L'article
 * renvoie à l'article 25-4 de la loi n° 89-462 du 6 juillet 1989, qui définit le
 * logement meublé comme celui qui comporte « au moins un des éléments de
 * mobilier » de cette liste.
 *
 * `mots` ne figure pas dans l'article : c'est la façon dont l'application
 * rapproche un meuble saisi — « Couette », « Lit 140 » — de l'élément qu'il
 * illustre. Un rapprochement raté ne bloque rien : il se contente de ne pas
 * cocher la ligne.
 */
export const ELEMENTS_MEUBLE_OBLIGATOIRES: ElementMeubleObligatoire[] = [
  {
    rang: '1°',
    libelle: 'Literie comprenant couette ou couverture',
    mots: ['literie', 'couette', 'couverture', 'lit'],
    piece: 'Chambre',
  },
  {
    rang: '2°',
    libelle:
      "Dispositif d'occultation des fenêtres dans les pièces destinées à être utilisées " +
      'comme chambre à coucher',
    mots: ['occult', 'volet', 'store', 'rideau'],
    piece: 'Chambre',
  },
  {
    rang: '3°',
    libelle: 'Plaques de cuisson',
    mots: ['plaque', 'cuisson', 'feu'],
    piece: 'Cuisine',
  },
  {
    rang: '4°',
    libelle: 'Four ou four à micro-ondes',
    mots: ['four', 'micro onde', 'micro ondes'],
    piece: 'Cuisine',
  },
  {
    rang: '5°',
    libelle:
      'Réfrigérateur et congélateur ou, au minimum, un réfrigérateur doté d’un compartiment ' +
      'permettant de disposer d’une température inférieure ou égale à - 6 °C',
    mots: ['refrigerateur', 'frigo', 'congelateur'],
    piece: 'Cuisine',
  },
  {
    rang: '6°',
    libelle: 'Vaisselle nécessaire à la prise des repas',
    mots: ['vaisselle', 'assiette', 'verre', 'couverts'],
    piece: 'Cuisine',
  },
  {
    rang: '7°',
    libelle: 'Ustensiles de cuisine',
    mots: ['ustensile', 'casserole', 'poele', 'marmite'],
    piece: 'Cuisine',
  },
  {
    rang: '8°',
    libelle: 'Table et sièges',
    mots: ['table', 'chaise', 'siege', 'tabouret', 'banc'],
    piece: 'Séjour',
  },
  {
    rang: '9°',
    libelle: 'Etagères de rangement',
    mots: ['etagere', 'rangement', 'armoire', 'placard', 'commode', 'buffet'],
    piece: 'Séjour',
  },
  {
    rang: '10°',
    libelle: 'Luminaires',
    mots: ['luminaire', 'lampe', 'plafonnier', 'eclairage'],
    piece: 'Séjour',
  },
  {
    rang: '11°',
    libelle: "Matériel d'entretien ménager adapté aux caractéristiques du logement",
    mots: ['entretien', 'menager', 'balai', 'aspirateur', 'seau', 'serpilliere'],
    piece: 'Autre',
  },
];

/**
 * Ce que l'inventaire dit de chaque élément obligatoire.
 *
 * `present` est un **rapprochement par mots**, pas une preuve. Le document le
 * présente comme tel : il dit « non trouvé dans cet inventaire », jamais « le
 * logement n'est pas meublé ».
 */
export interface PresenceElementObligatoire {
  rang: string;
  libelle: string;
  present: boolean;
  /** Le nombre d'exemplaires trouvés, tous meubles confondus. */
  quantite: number;
  /** Les pièces où il a été trouvé. Vide si l'élément n'a pas été trouvé. */
  pieces: string[];
}

/** Les mots d'un élément obligatoire apparaissent-ils dans un nom de meuble ? */
function correspond(motNormalise: string, nomMeuble: string): boolean {
  return motNormalise.length > 0 && nomMeuble.includes(motNormalise);
}

/** Les onze éléments obligatoires, et ce que l'inventaire en dit. */
export function presenceDesElementsObligatoires(
  pieces: readonly PieceInventaire[],
): PresenceElementObligatoire[] {
  return ELEMENTS_MEUBLE_OBLIGATOIRES.map((element) => {
    const mots = element.mots.map(normaliserNom).filter((m) => m.length > 0);
    let quantite = 0;
    const trouvees: string[] = [];

    for (const piece of pieces) {
      let dansLaPiece = 0;
      for (const meuble of piece.meubles) {
        const nom = normaliserNom(meuble.nom);
        if (!mots.some((mot) => correspond(mot, nom))) continue;
        // Un meuble sans quantité comptée compte pour zéro : il existe dans la
        // liste, mais rien ne dit combien il y en a. Annoncer « 1 » serait un
        // compte que personne n'a fait.
        dansLaPiece += meuble.quantite ?? 0;
      }
      if (dansLaPiece > 0) {
        quantite += dansLaPiece;
        trouvees.push(piece.nom.trim() || 'pièce sans nom');
      }
    }

    return {
      rang: element.rang,
      libelle: element.libelle,
      present: trouvees.length > 0,
      quantite,
      pieces: trouvees,
    };
  });
}

// ---------------------------------------------------------------------------
// Le mobilier proposé par défaut
// ---------------------------------------------------------------------------

/** Les meubles proposés pour une pièce qu'on ne sait pas reconnaître. */
export const MEUBLES_GENERIQUES: string[] = ['Table', 'Chaise', 'Étagère de rangement'];

/**
 * Les meubles proposés pour chaque sorte de pièce.
 *
 * Les onze éléments du décret y figurent, placés dans la pièce où ils se
 * trouvent d'ordinaire : c'est ce qui fait qu'un inventaire de logement meublé
 * part d'une liste conforme sans que personne n'ait à la recopier. Le
 * rapprochement se fait par mot, comme pour les éléments d'un état des lieux.
 */
const MEUBLES_PAR_PIECE: { mots: string[]; meubles: string[] }[] = [
  {
    mots: ['chambre', 'coucher'],
    meubles: [
      'Lit',
      'Matelas',
      'Couette ou couverture',
      'Oreiller',
      'Dispositif d’occultation',
      'Armoire',
      'Commode',
      'Table de chevet',
      'Luminaire',
    ],
  },
  {
    mots: ['sejour', 'salon', 'piece principale'],
    meubles: [
      'Canapé',
      'Table',
      'Chaise',
      'Table basse',
      'Étagère de rangement',
      'Buffet',
      'Luminaire',
      'Téléviseur',
    ],
  },
  {
    mots: ['cuisine', 'kitchenette'],
    meubles: [
      'Plaques de cuisson',
      'Four ou four à micro-ondes',
      'Réfrigérateur',
      'Congélateur',
      'Vaisselle',
      'Ustensiles de cuisine',
      'Placard de rangement',
      "Matériel d'entretien ménager",
      'Table',
      'Chaise',
      'Luminaire',
    ],
  },
  {
    mots: ['salle de bain', 'salle d eau', 'bain', 'douche'],
    meubles: [
      'Meuble vasque',
      'Miroir',
      'Étagère de rangement',
      'Porte-serviettes',
      'Rideau de douche',
      'Luminaire',
    ],
  },
  {
    mots: ['entree', 'couloir', 'degagement'],
    meubles: ['Porte-manteaux', 'Meuble à chaussures', 'Miroir', 'Étagère de rangement', 'Luminaire'],
  },
  {
    mots: ['wc', 'toilette'],
    meubles: ['Dérouleur', 'Balayette', 'Étagère de rangement', 'Luminaire'],
  },
  {
    mots: ['bureau'],
    meubles: ['Bureau', 'Chaise', 'Étagère de rangement', 'Luminaire'],
  },
  {
    mots: ['cave', 'buanderie', 'cellier', 'reserve'],
    meubles: [
      "Matériel d'entretien ménager",
      'Étagère de rangement',
      'Machine à laver',
      'Sèche-linge',
    ],
  },
  {
    mots: ['balcon', 'terrasse', 'jardin'],
    meubles: ['Table', 'Chaise', 'Salon de jardin'],
  },
  {
    mots: ['garage', 'parking', 'emplacement'],
    meubles: ['Étagère de rangement'],
  },
];

/** Les meubles proposés pour une pièce, d'après son nom. */
export function meublesParDefaut(nomPiece: string): string[] {
  const normalise = normaliserNom(nomPiece);
  const trouve = MEUBLES_PAR_PIECE.find((e) => e.mots.some((mot) => normalise.includes(mot)));
  // On recopie le tableau : rendre la constante elle-même laisserait un appelant
  // la modifier, et toutes les pièces suivantes hériteraient de sa modification.
  return [...(trouve?.meubles ?? MEUBLES_GENERIQUES)];
}

// ---------------------------------------------------------------------------
// Fabrication : identifiants déterministes
// ---------------------------------------------------------------------------

/** Construit un meuble vide, sans quantité ni état — ils restent à constater. */
export function meubleVide(nom: string, pris: readonly string[]): MeubleInventaire {
  return {
    id: premierLibre('m', pris),
    nom,
    commentaire: '',
    photos: [],
  };
}

/** Construit une pièce vide, avec le mobilier proposé pour son nom. */
export function pieceInventaireVide(nom: string, prises: readonly string[]): PieceInventaire {
  const id = premierLibre('pi', prises);
  const meubles = meublesParDefaut(nom).map((nomMeuble, index) => ({
    id: `m${index + 1}`,
    nom: nomMeuble,
    commentaire: '',
    photos: [],
  }));
  return { id, nom, meubles };
}

/** Construit la liste de pièces proposée par défaut pour un logement. */
export function piecesInitialesInventaire(typeLogement: string): PieceInventaire[] {
  const pieces: PieceInventaire[] = [];
  for (const nom of piecesParDefaut(typeLogement)) {
    pieces.push(pieceInventaireVide(nom, pieces.map((p) => p.id)));
  }
  return pieces;
}

/**
 * Ajoute un meuble à une pièce, avec un identifiant libre dans cette pièce.
 *
 * `eviter` porte des identifiants qu'il ne faut **pas** réattribuer. Un
 * inventaire de sortie dérive de celui d'entrée : si le bailleur retire un
 * meuble puis en ajoute un autre, `premierLibre` rendrait l'identifiant laissé
 * libre — et la comparaison apparierait le nouveau meuble avec celui de
 * l'entrée qu'il remplace, en imprimant un écart qui n'a pas eu lieu.
 */
export function ajouterMeuble(
  piece: PieceInventaire,
  nom: string,
  eviter: readonly string[] = [],
): PieceInventaire {
  return {
    ...piece,
    meubles: [
      ...piece.meubles,
      meubleVide(nom, [...piece.meubles.map((m) => m.id), ...eviter]),
    ],
  };
}

/** Tous les identifiants de photos d'un inventaire, pièces et meubles mêlés. */
export function identifiantsDePhotos(pieces: readonly PieceInventaire[]): string[] {
  return idsDePhotos([
    ...pieces.flatMap((p) => p.meubles.map((m) => m.photos)),
  ]);
}

/**
 * Ajoute une photo à un meuble.
 *
 * `prises` porte les identifiants déjà employés **dans tout le document**. Sans
 * cette liste, l'identifiant est cherché libre dans le seul meuble, et deux
 * meubles finissent par porter le même : l'impression n'en garde alors qu'un, et
 * la seconde photo disparaît du document sans que rien ne le signale.
 */
export function ajouterPhoto(
  meuble: MeubleInventaire,
  photo: PhotoDocument,
  prises: readonly string[] = [],
): MeubleInventaire {
  return {
    ...meuble,
    photos: [
      ...meuble.photos,
      { ...photo, id: premierLibre('ph', [...meuble.photos.map((p) => p.id), ...prises]) },
    ],
  };
}

// ---------------------------------------------------------------------------
// Raccourcis de saisie
// ---------------------------------------------------------------------------

/**
 * Le premier meuble de la pièce qui n'a pas encore été compté ou constaté.
 *
 * Sert à conduire la saisie : après « pièce suivante », l'écran sait où poser le
 * regard sans que l'utilisateur cherche la ligne qu'il n'a pas remplie.
 */
export function premierMeubleARenseigner(piece: PieceInventaire): MeubleInventaire | null {
  return piece.meubles.find((m) => m.quantite === undefined || !m.etat) ?? null;
}

/** La première pièce qui contient un meuble non renseigné. */
export function premierePieceARenseigner(pieces: PieceInventaire[]): PieceInventaire | null {
  return pieces.find((p) => p.meubles.some((m) => m.quantite === undefined || !m.etat)) ?? null;
}

/**
 * Reprend la quantité de l'entrée sur les meubles **qui n'ont rien de saisi**.
 *
 * C'est le raccourci « tout est là » : le cas courant d'un inventaire de sortie
 * est que le mobilier soit complet. Il ne touche pas aux meubles déjà renseignés,
 * et c'est une décision, pas une prudence : écraser un comptage déjà fait — avec
 * son état, son observation et ses photos — parce qu'on a touché un bouton par
 * erreur serait une perte de travail silencieuse.
 *
 * La quantité est reprise, mais **pas l'état** : l'état de l'entrée n'est pas un
 * constat de sortie. Le geste laisse donc chaque meuble à constater, et l'écran
 * propose un second raccourci pour l'état.
 */
export function reprendreLesQuantites(
  piece: PieceInventaire,
  quantitesEntree: ReadonlyMap<string, number>,
): PieceInventaire {
  return {
    ...piece,
    meubles: piece.meubles.map((meuble) => {
      if (meuble.quantite !== undefined) return meuble;
      const quantite = quantitesEntree.get(cleDeRappel(piece.id, meuble.id));
      return quantite === undefined ? meuble : { ...meuble, quantite };
    }),
  };
}

/**
 * Applique un état à tous les meubles **qui n'en ont pas encore**.
 *
 * C'est le raccourci « tout est en bon état », et il n'écrase rien, pour la même
 * raison que `reprendreLesQuantites`.
 */
export function toutEnBonEtat(piece: PieceInventaire, etat: EtatElement): PieceInventaire {
  return {
    ...piece,
    meubles: piece.meubles.map((m) => (m.etat ? m : { ...m, etat })),
  };
}

/** Remet à zéro l'état et la quantité de tous les meubles d'une pièce. */
export function viderConstat(piece: PieceInventaire): PieceInventaire {
  return {
    ...piece,
    meubles: piece.meubles.map((m) => ({ ...m, etat: undefined, quantite: undefined })),
  };
}

// ---------------------------------------------------------------------------
// Brouillon
// ---------------------------------------------------------------------------

export interface BrouillonInventaire {
  logementId: string;
  bailId: string;
  type: TypeInventaire;
  /** Date d'établissement, `AAAA-MM-JJ`. */
  dateInventaire?: string;
  pieces?: PieceInventaire[];
  observations?: string;
  /** Nom et qualité d'un mandataire, s'il y en a un. */
  mandataire?: string;
  /**
   * Pour un inventaire de sortie : l'inventaire d'entrée auquel il se compare,
   * et sa date.
   */
  inventaireEntreeId?: string;
  dateEntree?: string;
  /** Le logement est-il loué meublé ? Déclaré par le bailleur, jamais supposé. */
  meuble?: boolean;
  signatures?: Signature[];
}

// ---------------------------------------------------------------------------
// Un inventaire de sortie, dérivé de celui d'entrée
// ---------------------------------------------------------------------------

/**
 * La clé d'un rappel de quantité : un meuble, **dans sa pièce**.
 *
 * Les identifiants de meubles sont déterministes et **propres à leur pièce** —
 * `pieceInventaireVide` les numérote `m1`, `m2`… — si bien que deux pièces en
 * portent de semblables. Une carte indexée par le seul identifiant du meuble
 * garderait donc la dernière quantité lue et l'afficherait partout : mesuré sur
 * la liste par défaut d'un appartement, **60 meubles comptés n'en laissaient que
 * 11** dans le rappel, et le séjour aurait rappelé le compte de la chambre.
 */
export function cleDeRappel(pieceId: string, meubleId: string): string {
  return `${pieceId}/${meubleId}`;
}

export interface SortieInventaireDerivee {
  /** Les pièces de l'entrée, à compter et constater à nouveau. */
  pieces: PieceInventaire[];
  /**
   * Les quantités de l'entrée, indexées par `cleDeRappel`. Un rappel, pas une
   * valeur : un meuble ne se rappelle que dans la pièce où il a été compté.
   */
  quantitesEntree: Map<string, number>;
}

/** Le rappel d'un meuble : ce qui en avait été compté à l'entrée, s'il l'a été. */
export function quantiteRappelee(
  derivee: SortieInventaireDerivee,
  pieceId: string,
  meubleId: string,
): number | undefined {
  return derivee.quantitesEntree.get(cleDeRappel(pieceId, meubleId));
}

/**
 * Ce qu'un inventaire de sortie reprend de celui d'entrée.
 *
 * Les pièces et les meubles reprennent leurs **identifiants** et leurs **noms**,
 * et rien d'autre. C'est par les identifiants que la comparaison apparie un
 * meuble au même meuble, sans deviner.
 *
 * La **quantité n'est pas recopiée**, et c'est la décision de fond de cette
 * fonction. Recopier « 2 chaises » à la sortie serait un inventaire inventé :
 * exactement comme recopier l'index d'un compteur serait un relevé inventé. Le
 * meuble peut avoir disparu, été remplacé, ou été ajouté. La quantité d'entrée
 * est donc rendue **à part**, dans `quantitesEntree`, pour que l'écran l'affiche
 * à côté du champ vide — un rappel se lit, il ne se valide pas.
 *
 * L'état, les observations et les photos sont **vidés**, pour la même raison :
 * un inventaire de sortie constate à nouveau, et recopier le constat d'entrée
 * ferait signer au locataire un document qui décrit une visite qu'il n'a pas
 * faite.
 */
export function sortieInventaireDepuisLEntree(entree: {
  pieces?: readonly PieceInventaire[];
}): SortieInventaireDerivee {
  const quantitesEntree = new Map<string, number>();

  const pieces = (entree.pieces ?? []).map((piece) => ({
    id: piece.id,
    nom: piece.nom,
    meubles: piece.meubles.map((meuble) => {
      if (meuble.quantite !== undefined) {
        quantitesEntree.set(cleDeRappel(piece.id, meuble.id), meuble.quantite);
      }
      return {
        id: meuble.id,
        nom: meuble.nom,
        commentaire: '',
        photos: [],
      };
    }),
  }));

  return { pieces, quantitesEntree };
}

// ---------------------------------------------------------------------------
// Comparaison entrée / sortie
// ---------------------------------------------------------------------------

/**
 * Un meuble, vu à l'entrée et à la sortie.
 *
 * `evolutionEtat` n'est vrai que si les **deux** états sont *constatés* et
 * diffèrent : un meuble marqué « non vérifié » à l'entrée puis « bon » à la
 * sortie n'a pas évolué, personne ne l'avait regardé.
 *
 * `ecartQuantite` n'est vrai que si les **deux** quantités sont connues et
 * diffèrent. Une quantité absente n'est pas zéro : c'est un meuble qu'on n'a pas
 * compté, et l'annoncer comme disparu serait une accusation gratuite.
 *
 * Rien ici ne qualifie l'écart : ni dégradation, ni responsabilité. Le document
 * imprime le constat, et sa section de vétusté rappelle qu'il n'impute rien.
 */
export interface ComparaisonMeuble {
  id: string;
  nom: string;
  /** Le meuble est décrit dans l'inventaire d'entrée. */
  aLEntree: boolean;
  /** Le meuble est décrit dans l'inventaire de sortie. */
  aLaSortie: boolean;
  quantiteEntree?: number;
  quantiteSortie?: number;
  etatEntree?: EtatElement;
  etatSortie?: EtatElement;
  /** Les deux quantités sont connues et diffèrent. */
  ecartQuantite: boolean;
  /** Les deux états sont constatés et diffèrent. */
  evolutionEtat: boolean;
  /** L'un des deux constats a changé : c'est ce que le document rapporte. */
  evolution: boolean;
  /** L'un des deux états n'est pas un constat : la condition ne se compare pas. */
  incomparable: boolean;
  /** Identifiants des photos de l'entrée, pour l'impression « avant ». */
  photosEntree: string[];
  /** Identifiants des photos de la sortie, pour l'impression « après ». */
  photosSortie: string[];
}

export interface ComparaisonPieceInventaire {
  id: string;
  /** Le nom retenu : celui de la sortie, qui est le document qu'on lit. */
  nom: string;
  /** La pièce existait-elle dans l'inventaire d'entrée ? */
  aLEntree: boolean;
  meubles: ComparaisonMeuble[];
}

export interface ComparaisonInventaire {
  pieces: ComparaisonPieceInventaire[];
  /** Meubles dont la quantité a changé entre les deux constats. */
  ecarts: number;
  /** Meubles dont l'état constaté a changé. */
  evolutionsEtat: number;
  /** Meubles présents à la sortie et absents de l'entrée. */
  nouveaux: number;
  /** Meubles présents à l'entrée et absents de la sortie. */
  disparus: number;
  /** Meubles dont l'un des deux états manque : ils ne se comparent pas. */
  incomparables: number;
  /** Meubles portant au moins une photo d'un côté ou de l'autre. */
  illustres: number;
}

/**
 * Met en regard le mobilier relevé à l'entrée et celui relevé à la sortie.
 *
 * L'appariement se fait **par identifiant**, jamais par nom ni par rang. Les
 * deux inventaires partagent les mêmes identifiants par construction —
 * `sortieInventaireDepuisLEntree` les reprend — et c'est la seule règle qui
 * résiste à un renommage : un meuble rebaptisé « Fauteuil » reste le même
 * fauteuil, et deux meubles qui portent le même nom ne se confondent pas.
 *
 * Une pièce présente à l'entrée et absente de la sortie **n'est pas oubliée** :
 * ses meubles sont listés comme disparus. Ne pas les montrer laisserait croire
 * qu'ils ont été constatés, alors que le logement n'a pas été regardé là.
 */
export function comparerInventaire(
  entree: readonly PieceInventaire[],
  sortie: readonly PieceInventaire[],
): ComparaisonInventaire {
  const piecesEntree = new Map(entree.map((p) => [p.id, p]));
  const piecesSortie = new Map(sortie.map((p) => [p.id, p]));

  const comparer = (
    meubleEntree: MeubleInventaire | undefined,
    meubleSortie: MeubleInventaire | undefined,
    id: string,
    nom: string,
  ): ComparaisonMeuble => {
    const quantiteEntree = meubleEntree?.quantite;
    const quantiteSortie = meubleSortie?.quantite;
    const etatEntree = meubleEntree?.etat;
    const etatSortie = meubleSortie?.etat;

    const quantitesConnues = quantiteEntree !== undefined && quantiteSortie !== undefined;
    const ecartQuantite = quantitesConnues && quantiteEntree !== quantiteSortie;
    const constate = etatConstate(etatEntree) && etatConstate(etatSortie);
    const evolutionEtat = constate && etatEntree !== etatSortie;

    return {
      id,
      nom,
      aLEntree: meubleEntree !== undefined,
      aLaSortie: meubleSortie !== undefined,
      quantiteEntree,
      quantiteSortie,
      etatEntree,
      etatSortie,
      ecartQuantite,
      evolutionEtat,
      evolution: ecartQuantite || evolutionEtat,
      incomparable:
        meubleEntree !== undefined && meubleSortie !== undefined && !constate,
      photosEntree: (meubleEntree?.photos ?? []).map((p) => p.id),
      photosSortie: (meubleSortie?.photos ?? []).map((p) => p.id),
    };
  };

  const ordre = [
    ...sortie.map((p) => p.id),
    ...entree.filter((p) => !piecesSortie.has(p.id)).map((p) => p.id),
  ];

  const pieces: ComparaisonPieceInventaire[] = ordre.map((id) => {
    const a = piecesEntree.get(id);
    const b = piecesSortie.get(id);
    const nom = (b?.nom ?? a?.nom ?? '').trim();

    const meublesSortie = (b?.meubles ?? []).map((m) =>
      comparer(a?.meubles.find((x) => x.id === m.id), m, m.id, m.nom),
    );
    // Les meubles de l'entrée que la sortie ne décrit plus : le logement n'a pas
    // été regardé là, et le document doit le dire plutôt que de les taire.
    const disparus = (a?.meubles ?? [])
      .filter((m) => !(b?.meubles ?? []).some((x) => x.id === m.id))
      .map((m) => comparer(m, undefined, m.id, m.nom));

    return { id, nom, aLEntree: a !== undefined, meubles: [...meublesSortie, ...disparus] };
  });

  const tous = pieces.flatMap((p) => p.meubles);
  return {
    pieces,
    ecarts: tous.filter((m) => m.ecartQuantite).length,
    evolutionsEtat: tous.filter((m) => m.evolutionEtat).length,
    nouveaux: tous.filter((m) => !m.aLEntree).length,
    disparus: tous.filter((m) => !m.aLaSortie).length,
    incomparables: tous.filter((m) => m.incomparable).length,
    illustres: tous.filter((m) => m.photosEntree.length > 0 || m.photosSortie.length > 0).length,
  };
}

// ---------------------------------------------------------------------------
// Sections du document
// ---------------------------------------------------------------------------

export interface SectionInventaire {
  valeur: string;
  titre: string;
  /** Ce que la section doit contenir, tel qu'on peut le vérifier. */
  exigence: string;
  /** La source officielle qui fonde cette section, ou l'application. */
  fondement: string;
}

/**
 * Les **onze sections** d'un inventaire d'entrée, dans l'ordre.
 *
 * L'ordre suit la lecture d'un constat, comme pour l'état des lieux : d'abord ce
 * dont on parle, puis ce qui a été compté, puis qui l'affirme.
 *
 * Une seule section s'appuie sur un texte : `mobilier_legal`, qui reprend
 * l'article 2 du décret n° 2015-981. Les autres sont propres à l'application,
 * et le disent — un inventaire du mobilier n'est pas un document dont la
 * structure est fixée par un décret, contrairement à l'état des lieux.
 */
export const SECTIONS_INVENTAIRE: SectionInventaire[] = [
  {
    valeur: 'objet',
    titre: 'Objet et cadre',
    exigence: "Le type d'inventaire, sa date d'établissement et son cadre légal.",
    fondement: 'Exigence propre à l’application',
  },
  {
    valeur: 'logement',
    titre: 'Le logement',
    exigence: 'La localisation du logement : adresse, complément, type, surface.',
    fondement: 'Exigence propre à l’application',
  },
  {
    valeur: 'parties',
    titre: 'Les parties',
    exigence:
      'Le nom ou la dénomination des parties, le domicile du bailleur, et le mandataire éventuel.',
    fondement: 'Exigence propre à l’application',
  },
  {
    valeur: 'bail',
    titre: 'Le bail de référence',
    exigence: "Les dates de la location, le loyer, les charges et le dépôt de garantie.",
    fondement: 'Loi n° 89-462 du 6 juillet 1989, article 3-2 : les pièces sont jointes au bail',
  },
  {
    valeur: 'mobilier_legal',
    titre: 'Le mobilier obligatoire d’un logement meublé',
    exigence:
      'Les onze éléments que le mobilier doit comporter, et, pour chacun, ce que cet inventaire en dit.',
    fondement: 'Décret n° 2015-981 du 31 juillet 2015, article 2',
  },
  {
    valeur: 'pieces',
    titre: 'Le mobilier, pièce par pièce',
    exigence:
      'Pour chaque pièce, le détail des meubles : nombre, état, observations et photos.',
    fondement: 'Exigence propre à l’application',
  },
  {
    valeur: 'observations',
    titre: 'Observations et réserves',
    exigence: 'Les observations et réserves générales, en texte libre.',
    fondement: 'Exigence propre à l’application',
  },
  {
    valeur: 'vetuste',
    titre: 'Usure et vétusté',
    exigence:
      "Le rappel qu'un écart constaté n'est imputé à personne par ce document, et que l'usure " +
      "du temps et de l'usage normal n'est pas une dégradation.",
    fondement: 'Décret n° 2016-382 du 30 mars 2016, article 4',
  },
  {
    valeur: 'synthese',
    titre: 'Synthèse',
    exigence: 'Le compte des meubles par état, et la liste de ce qui reste à constater.',
    fondement: 'Exigence propre à l’application',
  },
  {
    valeur: 'signatures',
    titre: 'Signatures',
    exigence: 'La signature des parties, ou des personnes mandatées pour réaliser l’inventaire.',
    fondement: 'Exigence propre à l’application',
  },
  {
    valeur: 'sources',
    titre: 'Sources',
    exigence: 'Les textes sur lesquels ce document s’appuie, et la date à laquelle ils ont été lus.',
    fondement: 'Exigence propre à l’application',
  },
];

/**
 * Les sections propres à un inventaire de **sortie**.
 *
 * Deux informations qui n'ont pas de sens à l'entrée : l'inventaire d'entrée
 * auquel celui-ci se compare, et la mise en regard des deux constats. Elles
 * s'insèrent dans l'ordre de lecture — après le bail, dont elles dépendent, et
 * avant la synthèse, qu'elles nourrissent.
 */
export const SECTIONS_INVENTAIRE_SORTIE: SectionInventaire[] = [
  {
    valeur: 'reference_entree',
    titre: "L'inventaire du mobilier d'entrée",
    exigence: "La date de l'inventaire d'entrée auquel celui-ci se compare.",
    fondement: 'Exigence propre à l’application',
  },
  {
    valeur: 'evolutions',
    titre: 'Évolutions depuis l’entrée',
    exigence:
      'Le mobilier constaté à la sortie, mis en regard de celui relevé à l’entrée : quantités ' +
      'et états, avec les photos des deux constats.',
    fondement: 'Exigence propre à l’application',
  },
];

/**
 * Les sections d'un inventaire, selon sa nature.
 *
 * Une fonction, et non deux constantes, pour que les sections communes ne
 * puissent pas diverger : elles sont écrites une fois, et c'est leur **place**
 * qui change.
 */
export function sectionsInventaire(type: TypeInventaire): SectionInventaire[] {
  if (type === 'entree') return SECTIONS_INVENTAIRE;

  const [reference, evolutions] = SECTIONS_INVENTAIRE_SORTIE;
  const sections = [...SECTIONS_INVENTAIRE];

  // La référence se lit juste après le bail, dont elle dépend.
  const apresBail = sections.findIndex((s) => s.valeur === 'bail') + 1;
  sections.splice(apresBail, 0, reference);

  // Les évolutions viennent en dernier avant la synthèse : elles la nourrissent
  // et se lisent après la description, dont elles tirent leurs constats.
  const avantSynthese = sections.findIndex((s) => s.valeur === 'synthese');
  sections.splice(avantSynthese, 0, evolutions);

  return sections;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface SourceInventaire {
  /** Ce que la source établit, en une phrase. */
  etablit: string;
  /** Référence : texte, article. */
  reference: string;
  /** Date de consultation, `AAAA-MM-JJ`. */
  consulteLe: string;
}

/** Toutes les sources lues pour ce module, au 24 septembre 2026. */
export const SOURCES_INVENTAIRE: SourceInventaire[] = [
  {
    etablit:
      "Le mobilier d'un logement meublé comporte au minimum onze éléments, du rang 1° au rang 11° : " +
      'literie, occultation des chambres, plaques de cuisson, four ou micro-ondes, réfrigérateur et ' +
      'congélateur, vaisselle, ustensiles de cuisine, table et sièges, étagères de rangement, ' +
      'luminaires, matériel d’entretien ménager.',
    reference: 'Décret n° 2015-981 du 31 juillet 2015, article 2',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      'Le logement meublé est un logement décoré et meublé comportant au moins un des éléments ' +
      'de mobilier de cette liste.',
    reference: 'Loi n° 89-462 du 6 juillet 1989, article 25-4',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      "La vétusté est l'état d'usure ou de détérioration résultant du temps ou de l'usage normal " +
      "des matériaux et éléments d'équipement du logement.",
    reference: 'Décret n° 2016-382 du 30 mars 2016, article 4',
    consulteLe: '2026-09-24',
  },
  {
    etablit:
      'Les pièces du bail — dont les diagnostics et les états des lieux — sont jointes au contrat ' +
      'de location.',
    reference: 'Loi n° 89-462 du 6 juillet 1989, article 3-2',
    consulteLe: '2026-09-24',
  },
];

// ---------------------------------------------------------------------------
// Le parcours guidé : cinq étapes
// ---------------------------------------------------------------------------

export type EtapeInventaire = 'logement' | 'pieces' | 'mobilier' | 'observations' | 'signature';

/**
 * L'ordre des étapes suit le geste réel : on regarde où l'on est, on convient
 * des pièces qu'on va parcourir, on compte et on constate, on note ce qui vaut
 * pour le logement entier, et on signe.
 *
 * La première étape ne demande **aucune saisie** : elle rappelle le logement et
 * la location, déjà enregistrés.
 */
export const ETAPES_INVENTAIRE: { valeur: EtapeInventaire; titre: string; aide: string }[] = [
  {
    valeur: 'logement',
    titre: 'Le logement',
    aide: 'Adresse, type et locataires, repris de la fiche du logement.',
  },
  {
    valeur: 'pieces',
    titre: 'Les pièces à parcourir',
    aide: 'La liste proposée est modifiable : ajoutez, renommez, retirez.',
  },
  {
    valeur: 'mobilier',
    titre: 'Le mobilier, pièce par pièce',
    aide: 'Un nombre et un état par meuble, des observations, et des photos.',
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

export function numeroEtapeInventaire(etape: EtapeInventaire): number {
  return ETAPES_INVENTAIRE.findIndex((e) => e.valeur === etape) + 1;
}

export function etapeSuivanteInventaire(etape: EtapeInventaire): EtapeInventaire | null {
  const index = ETAPES_INVENTAIRE.findIndex((e) => e.valeur === etape);
  return ETAPES_INVENTAIRE[index + 1]?.valeur ?? null;
}

export function etapePrecedenteInventaire(etape: EtapeInventaire): EtapeInventaire | null {
  const index = ETAPES_INVENTAIRE.findIndex((e) => e.valeur === etape);
  return index > 0 ? ETAPES_INVENTAIRE[index - 1].valeur : null;
}

// ---------------------------------------------------------------------------
// Vérifications
// ---------------------------------------------------------------------------

interface ExigenceInventaire {
  etape: EtapeInventaire;
  manque: string;
}

/**
 * Toutes les règles du document, chacune étiquetée par l'étape qui la lève.
 *
 * Une seule liste, comme pour le bail et l'état des lieux : le formulaire lit
 * `manquesDeLEtapeInventaire` et le contrôle final lit `manquesDeLInventaire`,
 * si bien que les deux ne peuvent pas diverger.
 */
function exigencesDeLInventaire(
  b: BrouillonInventaire,
  attendus?: SignataireAttendu[],
): ExigenceInventaire[] {
  const exigences: ExigenceInventaire[] = [];
  const ajouter = (etape: EtapeInventaire, manque: string) => exigences.push({ etape, manque });

  // --- Le logement ------------------------------------------------------
  if (!b.logementId) ajouter('logement', 'Aucun logement n’est rattaché à cet inventaire.');
  if (!b.bailId) ajouter('logement', 'Aucune location en cours n’est rattachée à cet inventaire.');
  if (!b.dateInventaire || !dateCivileValide(b.dateInventaire)) {
    ajouter('logement', 'La date d’établissement est absente ou n’existe pas dans le calendrier.');
  }

  // --- Les pièces -------------------------------------------------------
  const pieces = b.pieces ?? [];
  if (pieces.length === 0) {
    ajouter('pieces', 'Aucune pièce n’est décrite. Un inventaire sans pièce ne compte rien.');
  }
  for (const piece of pieces) {
    const nom = piece.nom.trim() || 'sans nom';
    if (!piece.nom.trim()) ajouter('pieces', 'Une pièce n’a pas de nom.');
    if (piece.meubles.length === 0) {
      ajouter('pieces', `La pièce « ${nom} » ne contient aucun meuble à inventorier.`);
    }
  }
  // Un nom de pièce en double rend la comparaison entrée/sortie ambiguë : deux
  // « Chambre » ne se distinguent plus, et le document comparerait la mauvaise.
  const nomsPieces = pieces.map((p) => normaliserNom(p.nom)).filter((n) => n.length > 0);
  const doublons = nomsPieces.filter((n, i) => nomsPieces.indexOf(n) !== i);
  for (const doublon of [...new Set(doublons)]) {
    ajouter('pieces', `Deux pièces portent le même nom : « ${doublon} ».`);
  }

  // --- Le mobilier ------------------------------------------------------
  const aRenseigner: string[] = [];
  for (const piece of pieces) {
    for (const meuble of piece.meubles) {
      const designation = `${piece.nom.trim() || 'pièce sans nom'} — ${meuble.nom || 'meuble sans nom'}`;
      if (meuble.quantite === undefined) {
        aRenseigner.push(`${designation} (nombre)`);
      } else if (!Number.isInteger(meuble.quantite) || meuble.quantite < 0) {
        ajouter(
          'mobilier',
          `Le nombre d’exemplaires de « ${meuble.nom || 'meuble sans nom'} » est invalide : ` +
            'il doit être un nombre entier, à partir de zéro.',
        );
      }
      if (!meuble.etat) aRenseigner.push(`${designation} (état)`);
    }
  }
  if (aRenseigner.length > 0) {
    // Le message nomme les meubles : « 12 meubles » ne dit pas où aller, et
    // l'utilisateur devrait parcourir tout le logement pour les trouver.
    const apercu = aRenseigner.slice(0, 3).join(', ');
    const suite = aRenseigner.length > 3 ? `, et ${aRenseigner.length - 3} autre(s)` : '';
    ajouter(
      'mobilier',
      'Chaque meuble doit porter un nombre d’exemplaires et un état, ou être marqué ' +
        `« non vérifié » : ${apercu}${suite}.`,
    );
  }

  // --- La sortie --------------------------------------------------------
  if (b.type === 'sortie') {
    if (!b.inventaireEntreeId || !b.dateEntree || !dateCivileValide(b.dateEntree)) {
      ajouter(
        'logement',
        'Un inventaire de sortie doit nommer l’inventaire d’entrée auquel il se compare.',
      );
    }
  }

  // --- Les signatures ---------------------------------------------------
  const signatures = b.signatures ?? [];
  if (attendus && attendus.length > 0) {
    const signes = new Set(signatures.filter(signatureValide).map((s) => s.signataire));
    for (const attendu of attendus) {
      if (!signes.has(attendu.id)) ajouter('signature', `${attendu.nom} n’a pas signé.`);
    }
  } else if (signatures.filter(signatureValide).length === 0) {
    ajouter('signature', 'Aucune signature n’a été recueillie.');
  }

  return exigences;
}

/** Tout ce qui manque pour établir l'inventaire. */
export function manquesDeLInventaire(
  b: BrouillonInventaire,
  attendus?: SignataireAttendu[],
): string[] {
  return exigencesDeLInventaire(b, attendus).map((e) => e.manque);
}

/** Ce qui manque pour pouvoir quitter une étape donnée. */
export function manquesDeLEtapeInventaire(
  b: BrouillonInventaire,
  etape: EtapeInventaire,
  attendus?: SignataireAttendu[],
): string[] {
  return exigencesDeLInventaire(b, attendus)
    .filter((e) => e.etape === etape)
    .map((e) => e.manque);
}

// ---------------------------------------------------------------------------
// Avertissements : ce qui se signale sans bloquer
// ---------------------------------------------------------------------------

/**
 * Ce que le document signale sans empêcher de l'établir.
 *
 * Le partage est le même que pour le bail et l'état des lieux : ce qui est
 * **interdit** bloque, ce qui est **incomplet** se signale. Un inventaire peut
 * légitimement ne pas contenir un élément obligatoire — le logement n'est
 * peut-être pas loué meublé, ou le meuble est peut-être rangé ailleurs ; il ne
 * peut pas légitimement compter un meuble sans dire dans quel état il est.
 */
export function avertissementsDeLInventaire(b: BrouillonInventaire): string[] {
  const avertissements: string[] = [];
  const pieces = b.pieces ?? [];

  // --- Le mobilier obligatoire ------------------------------------------
  // Le signalement n'est émis que si le bailleur a **déclaré** un logement
  // meublé. Le déduire de la présence d'un lit ferait dire à l'application ce
  // qu'elle ne sait pas : un logement vide n'est pas un logement non meublé.
  if (b.meuble === true) {
    const manquants = presenceDesElementsObligatoires(pieces).filter((e) => !e.present);
    if (manquants.length > 0) {
      avertissements.push(
        `Le mobilier d’un logement meublé doit comporter au minimum les onze éléments de ` +
          `l’article 2 du décret n° 2015-981. Cet inventaire n’en trouve pas ${manquants.length} : ` +
          `${manquants.map((m) => m.rang).join(', ')}. Vérifiez, ou corrigez l’indication ` +
          '« logement meublé ».',
      );
    }
  }

  const sansPhoto = pieces.filter((p) => p.meubles.every((m) => m.photos.length === 0));
  if (sansPhoto.length > 0) {
    avertissements.push(
      `Aucune photo pour ${sansPhoto.length} pièce(s) : ${sansPhoto
        .map((p) => p.nom)
        .slice(0, 3)
        .join(', ')}. Une photo vaut mieux qu’une description.`,
    );
  }

  const nonVerifies = pieces
    .flatMap((p) => p.meubles.map((m) => ({ piece: p.nom, meuble: m })))
    .filter((x) => x.meuble.etat === 'non_verifie');
  if (nonVerifies.length > 0) {
    avertissements.push(
      `${nonVerifies.length} meuble(s) sont marqués « non vérifié ». Le document le dira, ` +
        'et l’inventaire sera d’autant plus contestable sur ces points.',
    );
  }

  // Un meuble compté zéro exemplaire mais décrit « en bon état » se contredit :
  // il n'y a rien à décrire. On le signale plutôt que de le refuser, parce que
  // l'un des deux champs peut être la correction à apporter.
  const contradictoires = pieces
    .flatMap((p) => p.meubles)
    .filter((m) => m.quantite === 0 && etatConstate(m.etat));
  if (contradictoires.length > 0) {
    avertissements.push(
      `${contradictoires.length} meuble(s) sont comptés « 0 exemplaire » tout en portant un état : ` +
        `${contradictoires
          .map((m) => m.nom)
          .slice(0, 3)
          .join(', ')}. Précisez l’un ou l’autre.`,
    );
  }

  if (b.type === 'sortie') {
    const sansEntree = (b.pieces ?? []).length > 0 && !b.inventaireEntreeId;
    if (sansEntree) {
      avertissements.push(
        'Cet inventaire de sortie ne se compare à aucun inventaire d’entrée : le document ' +
          'ne pourra pas mettre les deux constats en regard.',
      );
    }
  }

  return avertissements;
}

// ---------------------------------------------------------------------------
// Synthèse
// ---------------------------------------------------------------------------

export interface SyntheseInventaire {
  /** Nombre total de meubles décrits. */
  total: number;
  /** Nombre de meubles portant un état constaté. */
  constates: number;
  /** Nombre de meubles dont le nombre ou l'état manque. */
  aRenseigner: number;
  /** Le compte par état, dans l'ordre de `ETATS_ELEMENT`. */
  parEtat: { etat: EtatElement; libelle: string; nombre: number }[];
  /** Nombre total d'exemplaires comptés, tous meubles confondus. */
  exemplaires: number;
  /** Nombre de pièces décrites. */
  pieces: number;
  /** Nombre de photos. */
  photos: number;
}

/**
 * Le compte des meubles, par état.
 *
 * Les états non constatés y figurent comme les autres, mais séparément dans
 * `constates` : c'est la distinction qui empêche le document d'annoncer
 * « 12 meubles en bon état » alors que deux n'ont jamais été regardés.
 *
 * `exemplaires` ne compte que les meubles dont la quantité est connue. Un meuble
 * non compté ne vaut pas zéro : l'additionner comme tel donnerait un total que
 * personne n'a établi.
 */
export function syntheseInventaire(b: BrouillonInventaire): SyntheseInventaire {
  const meubles = (b.pieces ?? []).flatMap((p) => p.meubles);
  const parEtat = ETATS_ELEMENT.map((e) => ({
    etat: e.valeur,
    libelle: e.libelle,
    nombre: meubles.filter((m) => m.etat === e.valeur).length,
  }));

  return {
    total: meubles.length,
    constates: meubles.filter((m) => etatConstate(m.etat)).length,
    aRenseigner: meubles.filter((m) => m.quantite === undefined || !m.etat).length,
    parEtat,
    exemplaires: meubles.reduce((n, m) => n + (m.quantite ?? 0), 0),
    pieces: (b.pieces ?? []).length,
    photos: (b.pieces ?? []).reduce(
      (n, p) => n + p.meubles.reduce((k, m) => k + m.photos.length, 0),
      0,
    ),
  };
}

/** Le titre de la pièce, tel qu'il apparaîtra dans le dossier. */
export function titreDeLInventaire(type: TypeInventaire, dateInventaire: string): string {
  return `${LIBELLE_TYPE_INVENTAIRE[type]} du ${formaterDateFr(dateInventaire)}`;
}

/**
 * Qui doit signer un inventaire, dans quel ordre et sous quel identifiant.
 *
 * La règle est celle de `signature.ts`, partagée avec l'état des lieux et le
 * bail : un document se signe de la même façon, quelle que soit sa nature.
 */
export function signatairesAttendusDeLInventaire(params: {
  nomBailleur: string;
  titulaires: readonly { id: string; nom: string; prenom: string }[];
  mandataire?: string | null;
}): SignataireAttendu[] {
  return signatairesAttendus(params);
}

// ---------------------------------------------------------------------------
// Reprise d'un brouillon
// ---------------------------------------------------------------------------

/** Une quantité lue d'un contenu enregistré, ou `undefined` si elle est illisible. */
function reprendreQuantite(valeur: unknown): number | undefined {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return undefined;
  const entier = Math.round(valeur);
  return entier >= 0 ? entier : undefined;
}

function reprendreMeuble(
  valeur: unknown,
  pris: string[],
  photosPrises: string[],
): MeubleInventaire | null {
  const o = objet(valeur);
  if (!o) return null;
  const nom = texteOuVide(o.nom).trim();
  if (!nom) return null;

  const etat = texteOuVide(o.etat);
  return {
    id: identifiantRepris(o.id, 'm', pris),
    nom,
    // Une quantité illisible ou négative est traitée comme absente : la
    // conserver ferait afficher un nombre que personne n'a compté, ou pire, un
    // nombre négatif d'exemplaires.
    quantite: reprendreQuantite(o.quantite),
    // Un état inconnu est traité comme absent : le conserver ferait afficher une
    // case vide dans la liste des sept, et le contrôle final refuserait un
    // meuble que l'utilisateur croirait avoir renseigné.
    etat: estEtatValide(etat) ? etat : undefined,
    commentaire: texteOuVide(o.commentaire),
    photos: reprendrePhotos(o.photos, photosPrises),
  };
}

function reprendrePiece(
  valeur: unknown,
  pris: string[],
  photosPrises: string[],
): PieceInventaire | null {
  const o = objet(valeur);
  if (!o) return null;
  const nom = texteOuVide(o.nom).trim();
  if (!nom) return null;

  const meubles: MeubleInventaire[] = [];
  for (const brut of tableau(o.meubles)) {
    const meuble = reprendreMeuble(brut, meubles.map((m) => m.id), photosPrises);
    if (meuble) meubles.push(meuble);
  }

  return {
    id: identifiantRepris(o.id, 'pi', pris),
    nom,
    meubles,
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
 * qu'aucun contrôle n'a vues — et un meuble inventé est un constat que personne
 * n'a fait.
 *
 * Rien n'est deviné : un champ du mauvais type est **ignoré**, pas converti.
 * `'bon'` n'est pas un état valide, et `36` n'est pas un nom de pièce.
 */
export function reprendreBrouillonInventaire(
  donnees: Record<string, unknown>,
  base: BrouillonInventaire,
): BrouillonInventaire {
  const resultat: BrouillonInventaire = { ...base };

  const logementId = texteOuVide(donnees.logementId);
  if (logementId) resultat.logementId = logementId;
  const bailId = texteOuVide(donnees.bailId);
  if (bailId) resultat.bailId = bailId;

  if (donnees.type === 'entree' || donnees.type === 'sortie') {
    resultat.type = donnees.type;
  }

  const dateInventaire = texteOuVide(donnees.dateInventaire);
  if (dateCivileValide(dateInventaire)) resultat.dateInventaire = dateInventaire;

  if (Array.isArray(donnees.pieces)) {
    const pieces: PieceInventaire[] = [];
    // Les identifiants de photos sont rendus uniques **dans tout le document** :
    // c'est ce que l'impression suppose, en indexant les images par identifiant.
    // Deux listes séparées — une par meuble — laisseraient passer deux `ph1`, et
    // la seconde photo ne serait pas imprimée.
    const photosPrises: string[] = [];
    for (const brut of donnees.pieces) {
      const piece = reprendrePiece(brut, pieces.map((p) => p.id), photosPrises);
      if (piece) pieces.push(piece);
    }
    resultat.pieces = pieces;
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
  if (typeof donnees.inventaireEntreeId === 'string') {
    resultat.inventaireEntreeId = donnees.inventaireEntreeId;
  }
  if (typeof donnees.meuble === 'boolean') resultat.meuble = donnees.meuble;

  const dateEntree = texteOuVide(donnees.dateEntree);
  if (dateCivileValide(dateEntree)) resultat.dateEntree = dateEntree;

  return resultat;
}

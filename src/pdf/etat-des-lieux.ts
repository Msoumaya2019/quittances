/**
 * L'état des lieux, en HTML et CSS millimétrés.
 *
 * Module **pur** : ni SQLite, ni React, ni `expo-print`. Il produit une chaîne
 * HTML, ce qui le rend exécutable sous `node --test` — la mise en page d'un
 * document de plusieurs pages ne se vérifie pas à l'œil sur un téléphone.
 *
 * Trois règles de fond gouvernent ce fichier :
 *
 *  1. **Les photos sont sous ce qu'elles montrent.** L'article 2, 1°, h) du
 *     décret demande une description par pièce, « illustrée d'images ». Un
 *     cahier de photos regroupé à la fin ne décrit rien : le lecteur devrait
 *     faire l'aller-retour entre une ligne et une planche. Chaque photo est
 *     donc imprimée sous son élément, avec sa légende.
 *  2. **Aucune couleur ne porte seule une information.** Chaque état imprime son
 *     libellé à côté de sa pastille : un état des lieux photocopié en noir et
 *     blanc doit rester lisible, et « Mauvais état » ne peut pas dépendre d'un
 *     fond rouge.
 *  3. **Les douze sections sont toujours là.** Une section sans contenu le dit
 *     en clair plutôt que de disparaître : un document qui saute une section
 *     obligatoire sans le signaler laisse croire qu'elle a été traitée.
 */

import { formatMontant } from '../domain/money.ts';
import {
  COMPTEURS,
  ETATS_ELEMENT,
  LIBELLE_TYPE_EDL,
  SOURCES_EDL,
  etatConstate,
  libelleEtat,
  sectionsEdl,
  syntheseEdl,
} from '../domain/etat-des-lieux.ts';
import type {
  CleRemise,
  ComparaisonEdl,
  ComparaisonElement,
  ComparaisonPiece,
  EtatElement,
  PieceEdl,
  ReleveCompteur,
  TypeEdl,
} from '../domain/etat-des-lieux.ts';
import type { Signature } from '../domain/signature.ts';
import { adresseEnLignes } from '../domain/types.ts';
import { COULEURS_DOCUMENT, echapper, STYLES_BASE } from './styles.ts';
import { MENTION_SIGNATURE } from './bail.ts';
import type { LogementBail, PartieBailleur, PartieLocataire } from './bail.ts';
import {
  HAUTEUR_PHOTO_MAX_MM,
  LARGEUR_PHOTO_MM,
  TONS_ETAT,
  pastille,
  rendrePhoto,
  rendrePhotos,
} from './constats.ts';
import type { PhotoImprimable, PhotosImprimables } from './constats.ts';
// Les sections qu'un document de constat imprime de la même façon sont
// **définies** dans `sections-constat.ts`, avec l'inventaire du mobilier : la
// charpente d'un constat ne se décrit pas deux fois, et la section des
// signatures — qui apparie par identifiant — encore moins.
import {
  corpsBail,
  corpsLogement,
  corpsObservations,
  corpsParties,
  corpsSignatures,
  corpsSources,
  corpsVetuste,
  dateFr,
  exemplairesEnLigne,
  ligne,
  paireEnHtml,
  section,
} from './sections-constat.ts';
import type { ClassesPaire, SignataireImprime } from './sections-constat.ts';

export type { SignataireImprime };

// La pastille d'un état et l'impression d'une photo sont **définies** dans
// `constats.ts`, avec l'inventaire du mobilier : les deux documents constatent
// dans les mêmes termes, et « Photo illisible » ne doit pas se dire de deux
// façons. Les noms restent réexposés ici, où le projet les importe depuis
// l'origine.
export { HAUTEUR_PHOTO_MAX_MM, LARGEUR_PHOTO_MM };
export type { PhotoImprimable };
/** Les photos d'un état des lieux, indexées par identifiant. */
export type PhotosEdl = PhotosImprimables;

// ---------------------------------------------------------------------------
// Contenu
// ---------------------------------------------------------------------------

export interface BailReference {
  dateEntree: string;
  dateSortie?: string | null;
  loyer: number;
  charges: number;
  depotGarantie: number;
  jourEcheance: number;
}

/**
 * Qui doit signer, et sous quel nom la signature s'imprime.
 *
 * Le type est **défini** dans `sections-constat.ts`, avec la section qui
 * l'imprime, et réexposé en tête de ce fichier : tout le projet l'importe
 * d'ici depuis l'origine.
 */

export interface ContenuEdl {
  type: TypeEdl;
  /** Date d'établissement, `AAAA-MM-JJ`. */
  dateEdl: string;
  /** Date d'édition du PDF, `AAAA-MM-JJ`. */
  etabliLe: string;
  /** Lieu d'établissement, imprimé en en-tête. */
  lieu: string;
  logement: LogementBail;
  bailleur: PartieBailleur;
  locataires: PartieLocataire[];
  /** Nom et qualité d'un mandataire, s'il y en a un. */
  mandataire: string;
  bail: BailReference;
  compteurs: ReleveCompteur[];
  cles: CleRemise[];
  pieces: PieceEdl[];
  observations: string;
  signatures: Signature[];
  /** Qui doit signer, et sous quel nom. L'appariement se fait par identifiant. */
  signataires: SignataireImprime[];
  /** Le logement a-t-il une installation individuelle déclarée ? */
  compteursIndividuels: boolean;
  /** Pour une sortie : la date de l'état des lieux d'entrée. */
  dateEntree?: string;
  /** Pour une sortie : l'adresse du nouveau domicile du locataire. */
  nouveauDomicile?: string;
  /**
   * Pour une sortie : la mise en regard des deux constats.
   *
   * Absente quand l'état des lieux d'entrée n'a pas pu être relu — la section
   * le dit alors en clair, plutôt que d'imprimer un tableau vide qui laisserait
   * croire qu'aucun élément n'a évolué.
   */
  comparaison?: ComparaisonEdl;
  /** Pour une sortie : les photos de l'entrée, indexées par identifiant. */
  photosEntree?: PhotosEdl;
  photos: PhotosEdl;
  /** Les avertissements à imprimer, pour que le document dise ses limites. */
  reserves: string[];
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
//
// Les tons d'une pastille d'état sont définis dans `constats.ts`, avec la
// pastille elle-même : un meuble d'inventaire se colore comme un mur.

export const STYLES_EDL = `
  /* Le format de page vient de STYLES_BASE (A4). On reprend la classe page,
     parce que celle de STYLES_BASE est une **colonne flex** a hauteur minimale
     de 285 mm, dessinee pour une quittance qui tient sur une feuille : une
     colonne flex se pagine mal. Un etat des lieux change de page, on repasse
     donc en bloc et on laisse le contenu decider du nombre de feuilles.
     (Les accents graves sont proscrits dans ce commentaire : il vit a
     l'interieur d'un litteral de gabarit, et ils fermeraient la chaine.) */

  /* LE BLANC HAUT ET BAS EST PORTE PAR LE @page, ET PAR LUI SEUL.
     Correction du 24 septembre 2026, signalee depuis un telephone : « pour
     l'etat des lieux je veux que toutes les pages laissent une marge pour
     l'impression et pas que la premiere ».

     Ce qui etait faux, mesure : STYLES_BASE pose \`@page { margin: 0 }\` et met
     les blancs dans \`.page\`. Un rembourrage de bloc ne protege que la
     **premiere** feuille — le texte de la page 2 d'un etat des lieux
     s'imprimait a 2,3 mm du bord haut et a 0,8 mm du bord bas, trop pres pour
     qu'une imprimante A4 le prenne (le quart de pouce, 6,35 mm, est ce que
     beaucoup ne savent pas imprimer).

     Le \`@page\` est la seule regle que le moteur applique a CHAQUE page : c'est
     donc lui qui porte le blanc, comme dans le bail. Le rembourrage lateral,
     lui, reste dans \`.page\` — il est plus large que celui d'une imprimante, et
     le \`@page\` sert aussi au modele de quittance, dont la tenue en page tient
     d'un calcul en millimetres qu'il ne faut pas perturber.

     14 mm, et non les 12 du gabarit : le seuil a battre est 6,35 mm, et une
     mesure du 24 septembre 2026 donne 15,2 mm au pire sur les pages 2 et
     suivantes. Deux millimetres de plus ne coutent rien ici ; en descendre
     ferait tomber le document sous le seuil au premier arrondi.

     Ce qui a ete mesure valeur par valeur, pour ne pas choisir a l'oeil :
     20 mm fait passer l'etat des lieux complet de 6 a 7 feuilles et la sortie
     de 5 a 6 ; 30 mm, comme le bail, en ferait 8 pour l'entree et 9 pour
     l'inventaire. 41 mm de blanc en moins par feuille, c'est quatre feuilles
     ajoutees a un inventaire : on protege la marge sans noyer le document. */
  @page {
    size: A4;
    margin: 14mm 0;
  }

  .page {
    display: block;
    min-height: 0;
    padding: 0 18mm;
  }

  .e-bandeau {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8mm;
    border-bottom: 0.6mm solid ${COULEURS_DOCUMENT.principale};
    padding-bottom: 3mm;
    margin-bottom: 6mm;
  }
  .e-bandeau h1 {
    font-size: 16pt;
    font-weight: 700;
    color: ${COULEURS_DOCUMENT.principaleFonce};
    margin: 0 0 1.5mm 0;
  }
  .e-bandeau .e-sous-titre { font-size: 10pt; color: ${COULEURS_DOCUMENT.texteSecondaire}; }
  .e-bandeau .e-etabli {
    font-size: 8.5pt;
    color: ${COULEURS_DOCUMENT.texteTertiaire};
    text-align: right;
    white-space: nowrap;
  }

  .e-section { margin-bottom: 6mm; }
  /* Un titre ne doit pas rester seul en bas de page : le lecteur trouverait le
     contenu de la section sur la feuille suivante, sans son titre. */
  .e-section > h2 {
    font-size: 11pt;
    font-weight: 700;
    color: ${COULEURS_DOCUMENT.principaleFonce};
    border-bottom: 0.3mm solid ${COULEURS_DOCUMENT.principaleClaire};
    padding-bottom: 1.2mm;
    margin: 0 0 2.5mm 0;
    break-after: avoid-page;
    page-break-after: avoid;
  }
  .e-section > h2 .e-numero {
    display: inline-block;
    min-width: 6mm;
    color: ${COULEURS_DOCUMENT.principale};
  }

  .e-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  .e-table th, .e-table td {
    text-align: left;
    vertical-align: top;
    padding: 1.1mm 2mm;
    border-bottom: 0.2mm solid ${COULEURS_DOCUMENT.bordureLegere};
  }
  .e-table th {
    width: 46mm;
    font-weight: 600;
    color: ${COULEURS_DOCUMENT.texteSecondaire};
  }

  .e-parties { display: flex; gap: 5mm; }
  .e-partie {
    flex: 1 1 0;
    border: 0.25mm solid ${COULEURS_DOCUMENT.bordure};
    border-radius: 2mm;
    padding: 2.5mm 3mm;
    break-inside: avoid-page;
    page-break-inside: avoid;
  }
  .e-partie h3 {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.3mm;
    color: ${COULEURS_DOCUMENT.principale};
    margin: 0 0 1.5mm 0;
  }
  .e-partie p { margin: 0 0 0.8mm 0; font-size: 9.5pt; }

  /* --- Les pieces ------------------------------------------------------ */
  .e-piece {
    margin-bottom: 5mm;
    break-inside: auto;
  }
  .e-piece > h3 {
    font-size: 11pt;
    color: ${COULEURS_DOCUMENT.principaleFonce};
    background: ${COULEURS_DOCUMENT.principaleTresClaire};
    border-left: 1.2mm solid ${COULEURS_DOCUMENT.principale};
    padding: 1.8mm 2.5mm;
    margin: 0 0 2mm 0;
    break-after: avoid-page;
    page-break-after: avoid;
  }
  .e-piece-commentaire {
    font-size: 9.5pt;
    color: ${COULEURS_DOCUMENT.texteSecondaire};
    margin: 0 0 2mm 0;
  }

  /* Un element et ses photos ne se separent pas : une photo qui passe a la
     feuille suivante ne montre plus la ligne qu'elle illustre. */
  .e-element {
    border-top: 0.2mm solid ${COULEURS_DOCUMENT.bordureLegere};
    padding: 1.8mm 0;
    break-inside: avoid-page;
    page-break-inside: avoid;
  }
  .e-element-ligne { display: flex; align-items: baseline; gap: 2.5mm; }
  .e-element-nom { font-size: 9.5pt; font-weight: 600; flex: 1 1 auto; }

  .e-etat {
    display: inline-block;
    font-size: 8.5pt;
    font-weight: 600;
    padding: 0.6mm 2mm;
    border-radius: 1.5mm;
    white-space: nowrap;
  }

  .e-commentaire {
    font-size: 9pt;
    color: ${COULEURS_DOCUMENT.texteSecondaire};
    margin: 1mm 0 0 0;
  }

  .e-photos { margin: 1.5mm 0 0 0; }
  .e-photo {
    display: inline-block;
    vertical-align: top;
    width: ${LARGEUR_PHOTO_MM}mm;
    margin: 0 3mm 2.5mm 0;
    break-inside: avoid-page;
    page-break-inside: avoid;
  }
  .e-photo img {
    width: 100%;
    border: 0.25mm solid ${COULEURS_DOCUMENT.bordure};
    border-radius: 1.5mm;
  }
  .e-photo figcaption {
    font-size: 8pt;
    color: ${COULEURS_DOCUMENT.texteTertiaire};
    margin-top: 0.8mm;
  }
  .e-photo-absente {
    display: inline-block;
    width: ${LARGEUR_PHOTO_MM}mm;
    border: 0.25mm dashed ${COULEURS_DOCUMENT.bordure};
    border-radius: 1.5mm;
    padding: 6mm 2mm;
    text-align: center;
    font-size: 8pt;
    color: ${COULEURS_DOCUMENT.texteTertiaire};
  }

  .e-vide { font-size: 9.5pt; color: ${COULEURS_DOCUMENT.texteTertiaire}; font-style: italic; }
  .e-texte-libre { font-size: 9.5pt; margin: 0; white-space: pre-wrap; }

  /* Les deux listes du document — les reserves et les sources — se lisent
     mieux d'un bloc, et le commentaire qui precedait celui-ci affirmait que
     l'insecabilite de la liste entiere etait sans danger : « break-inside
     posee sur la liste entiere est sans danger quand elle depasse une page :
     le moteur l'ignore alors et coupe normalement ».

     Ce qui est vrai : la phrase est fausse. Une liste qui ne tient plus ne se
     coupe pas la ou elle deborde — elle saute **en entier** a la feuille
     suivante. La consigne sur la liste entiere est donc bien un piege.

     Ce qui est vrai aussi, et qui a demande une mesure avant/apres pour etre
     su : **ce piege n'est pas la cause des pages maigres de ce document.**
     Mesure du 24 septembre 2026, toute chose egale par ailleurs (la seule
     difference entre les deux series est la consigne ci-dessous) :

       avec la consigne    inventaire-complet 7 p., maigres [3, 4, 7]
       sans la consigne    inventaire-complet 7 p., maigres [3, 4, 5]

     Meme nombre de pages, meme nombre de pages maigres, et les deux series
     restent identiques sur l'etat des lieux (6 p. dessus, 5 p. pour la sortie,
     maigres [2, 3] et [2]). La consigne ne faisait donc que **deplacer** la
     page maigre : la septieme feuille de 108 caracteres, qui portait les deux
     reserves seules apres les signatures, disparait — mais la cinquieme
     devient maigre a son tour.

     La cause reelle, elle, n'est pas dans cette liste : elle est dans les
     **blocs de photo et de piece**, qui sautent eux aussi en bloc. Et la
     mesure dit aussi que ce n'est pas un manque de place : resserrer les blocs
     de section (6 -> 4 mm), les blocs de piece (5 -> 3.5 mm) ou les lignes
     d'element (1.8 -> 1.2 mm) ne change **ni le nombre de pages ni le nombre
     de pages maigres**.

     La consigne est neanmoins retiree ici, sur le fond et non par
     empirisme — et c'est le seul effet que la mesure autorise a lui preter :
     **la page orpheline des reserves disparait**, le document ne se termine
     plus sur une feuille de deux puces. Ce qui reste se reglera en traitant
     les blocs qui sautent, pas cette liste.

     Ce qui est garde : **la puce ne se coupe pas** — une ligne coupee entre
     deux feuilles ne se lit plus. Ce qui est rendu : **la liste, oui**, pour
     qu'une liste qui ne tient pas en bas de page se poursuive au lieu de
     sauter en bloc.

     (Les accents graves sont proscrits dans ce commentaire : il vit a
     l'interieur d'un litteral de gabarit, et ils fermeraient la chaine.) */
  .e-liste {
    margin: 0;
    padding-left: 5mm;
    font-size: 9.5pt;
  }
  .e-liste li { margin-bottom: 0.8mm; break-inside: avoid-page; page-break-inside: avoid; }

  .e-synthese { display: flex; flex-wrap: wrap; gap: 2mm; margin-bottom: 2.5mm; }
  .e-compte {
    border: 0.25mm solid ${COULEURS_DOCUMENT.bordure};
    border-radius: 1.5mm;
    padding: 1.5mm 2.5mm;
    font-size: 9pt;
  }
  .e-compte strong { font-size: 11pt; }

  /* --- Signatures ------------------------------------------------------ */
  .e-signatures { display: flex; flex-wrap: wrap; gap: 4mm; }
  .e-signature { width: 80mm; break-inside: avoid-page; page-break-inside: avoid; }
  .e-cadre {
    height: 26mm;
    border: 0.25mm solid ${COULEURS_DOCUMENT.bordure};
    border-radius: 2mm;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .e-cadre img { max-width: 100%; max-height: 100%; }
  .e-qui { font-size: 9pt; margin-top: 1.2mm; }
  .e-mention {
    font-size: 8pt;
    color: ${COULEURS_DOCUMENT.texteSecondaire};
    margin-top: 3mm;
    border-top: 0.2mm solid ${COULEURS_DOCUMENT.bordureLegere};
    padding-top: 2mm;
  }
  .e-sources {
    margin: 0;
    padding-left: 5mm;
    font-size: 8.5pt;
    color: ${COULEURS_DOCUMENT.texteSecondaire};
    break-inside: avoid-page;
    page-break-inside: avoid;
  }
  .e-sources li { margin-bottom: 1mm; break-inside: avoid-page; page-break-inside: avoid; }

  /* --- Comparaison entree / sortie ------------------------------------- */
  /* Le tableau met les deux constats cote a cote, et rien d'autre : aucune
     colonne ne qualifie l'ecart, parce que le document n'a pas a le faire.
     (Les accents graves sont proscrits dans ce commentaire : il vit a
     l'interieur d'un litteral de gabarit, et ils fermeraient la chaine.) */
  .e-evol-piece {
    margin-bottom: 5mm;
  }
  .e-evol-piece > h3 {
    font-size: 10.5pt;
    color: ${COULEURS_DOCUMENT.principaleFonce};
    background: ${COULEURS_DOCUMENT.principaleTresClaire};
    border-left: 1.2mm solid ${COULEURS_DOCUMENT.principale};
    padding: 1.5mm 2.5mm;
    margin: 0 0 2mm 0;
    break-after: avoid-page;
    page-break-after: avoid;
  }
  .e-evol-piece > h3 .e-evol-compte {
    font-size: 8.5pt;
    font-weight: 400;
    color: ${COULEURS_DOCUMENT.texteSecondaire};
  }
  .e-evol { table-layout: fixed; }
  .e-evol th { width: 34mm; }
  .e-evol th:first-child { width: auto; }
  .e-evol td.e-evol-element { font-weight: 600; }
  .e-evol td.e-evol-etat { width: 34mm; }
  .e-evol td.e-evol-etat .e-etat { font-size: 8pt; }
  .e-evol-note { font-size: 8pt; color: ${COULEURS_DOCUMENT.texteTertiaire}; font-style: italic; }
  /* Une ligne coupee entre deux feuilles ne se lit plus : on garde chaque
     element d'un seul tenant. */
  .e-evol tr { break-inside: avoid-page; page-break-inside: avoid; }

  /* Avant / apres : deux photos du meme element, cote a cote. Une paire qui
     se scinde en deux feuilles ne se compare plus — c'est tout l'objet de la
     section. */
  .e-paires { margin-top: 2mm; }
  .e-paire {
    border-top: 0.2mm solid ${COULEURS_DOCUMENT.bordureLegere};
    padding: 2mm 0 1mm 0;
    break-inside: avoid-page;
    page-break-inside: avoid;
  }
  .e-paire-titre { font-size: 9pt; font-weight: 600; margin: 0 0 1.5mm 0; }
  .e-paire-colonnes { display: flex; gap: 3mm; }
  .e-paire-colonne { flex: 1 1 0; min-width: 0; }
  .e-paire-etiquette {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.3mm;
    color: ${COULEURS_DOCUMENT.principale};
    margin: 0 0 1mm 0;
  }
  .e-paire-colonne .e-photo { width: 100%; margin: 0 0 1.5mm 0; }
  .e-paire-colonne .e-photo-absente { width: 100%; }
  .e-paire-sans {
    font-size: 8pt;
    font-style: italic;
    color: ${COULEURS_DOCUMENT.texteTertiaire};
    border: 0.25mm dashed ${COULEURS_DOCUMENT.bordure};
    border-radius: 1.5mm;
    padding: 8mm 2mm;
    text-align: center;
  }
`;

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

/** Une ligne « libellé / valeur » d'un tableau. */

/** Une section numérotée. Le numéro aide à vérifier qu'aucune ne manque. */

/** « 15 septembre 2026 » à partir de `2026-09-15`. */

/**
 * Une photo, ou la mention de son absence.
 *
 * L'impression d'une photo est **définie** dans `constats.ts`, avec l'inventaire
 * du mobilier : « Photo illisible » ne doit pas se dire de deux façons. Le nom
 * local reste, parce que tout ce fichier l'appelle.
 */
const photo = rendrePhoto;

/** Toutes les photos d'un élément, dans l'ordre. */
const photosDe = rendrePhotos;

// ---------------------------------------------------------------------------
// Les sections, une par une
// ---------------------------------------------------------------------------

/**
 * La phrase de vétusté propre à un état des lieux.
 *
 * La définition de la vétusté est la même pour les deux documents de constat ;
 * c'est la phrase qui l'applique qui nomme le document.
 */
const PHRASE_VETUSTE_EDL = `Le présent état des lieux <strong>constate</strong> l’état des lieux et de ses
éléments. Il ne qualifie aucune évolution et n’impute aucune dégradation au locataire : l’appréciation
d’une éventuelle responsabilité relève des parties, et le cas échéant de la juridiction compétente.
Lorsqu’une grille de vétusté a été convenue entre les parties, elle s’applique à ces constats.`;

function corpsObjet(contenu: ContenuEdl): string {
  return `<table class="e-table">
    ${ligne('Nature', `<strong>${echapper(LIBELLE_TYPE_EDL[contenu.type])}</strong>`)}
    ${ligne('Date d’établissement', echapper(dateFr(contenu.dateEdl)))}
    ${
      contenu.type === 'sortie' && contenu.dateEntree
        ? ligne("État des lieux d'entrée", echapper(dateFr(contenu.dateEntree)))
        : ''
    }
    ${ligne('Établi à', contenu.lieu ? echapper(contenu.lieu) : '—')}
    ${ligne('Exemplaires', exemplairesEnLigne(contenu.locataires.length))}
  </table>
  <p class="e-mention">
    Document établi contradictoirement et amiablement, conformément à l’article 3-2 de la loi
    n° 89-462 du 6 juillet 1989 et au décret n° 2016-382 du 30 mars 2016. Il porte sur l’ensemble
    des locaux et équipements d’usage privatif mentionnés au bail.
  </p>`;
}




function corpsCompteurs(contenu: ContenuEdl): string {
  if (contenu.compteurs.length === 0) {
    return `<p class="e-vide">Aucun relevé de compteur n’est joint.${
      contenu.compteursIndividuels
        ? ''
        : ' Le logement n’a pas été déclaré comme équipé d’une installation individuelle.'
    }</p>`;
  }
  return `<table class="e-table">${contenu.compteurs
    .map((releve) => {
      const compteur = COMPTEURS.find((c) => c.valeur === releve.type);
      const libelle = compteur?.libelle ?? releve.type;
      const unite = compteur?.unite ?? '';
      const valeur = releve.valeur.trim()
        ? `<strong>${echapper(releve.valeur.trim())}</strong>${unite ? ` ${echapper(unite)}` : ''}`
        : '<span class="e-vide">non relevé</span>';
      return ligne(
        libelle,
        `${valeur}${releve.precision.trim() ? ` — ${echapper(releve.precision.trim())}` : ''}`,
      );
    })
    .join('')}</table>`;
}

function corpsCles(contenu: ContenuEdl): string {
  if (contenu.cles.length === 0) {
    return '<p class="e-vide">Aucune clé ni moyen d’accès n’est décrit.</p>';
  }
  return `<table class="e-table">${contenu.cles
    .map((cle) =>
      ligne(
        cle.libelle || 'Sans désignation',
        `${cle.quantite} × — ouvre : ${echapper(cle.destination || 'destination non précisée')}`,
      ),
    )
    .join('')}</table>`;
}

/**
 * Une pièce, avec ses éléments et leurs photos.
 *
 * L'élément et ses photos forment un bloc insécable : une photo qui passe à la
 * feuille suivante ne montre plus la ligne qu'elle illustre, et le lecteur doit
 * alors deviner à quoi elle se rapporte.
 */
function pieceEnHtml(piece: PieceEdl, photos: PhotosEdl): string {
  const elements = piece.elements
    .map((element) => {
      const commentaire = element.commentaire.trim()
        ? `<p class="e-commentaire">${echapper(element.commentaire.trim())}</p>`
        : '';
      return `<div class="e-element">
        <div class="e-element-ligne">
          <span class="e-element-nom">${echapper(element.nom || 'Élément sans nom')}</span>
          ${pastille(element.etat)}
        </div>
        ${commentaire}
        ${photosDe(element.photos, photos)}
      </div>`;
    })
    .join('');

  const vueEnsemble = photosDe(piece.photos, photos);
  const commentaire = piece.commentaire.trim()
    ? `<p class="e-piece-commentaire">${echapper(piece.commentaire.trim())}</p>`
    : '';

  return `<div class="e-piece">
    <h3>${echapper(piece.nom || 'Pièce sans nom')}</h3>
    ${commentaire}
    ${vueEnsemble}
    ${elements || '<p class="e-vide">Aucun élément n’est décrit pour cette pièce.</p>'}
  </div>`;
}

function corpsPieces(contenu: ContenuEdl): string {
  if (contenu.pieces.length === 0) {
    return '<p class="e-vide">Aucune pièce n’est décrite.</p>';
  }
  return contenu.pieces.map((p) => pieceEnHtml(p, contenu.photos)).join('');
}



function corpsSynthese(contenu: ContenuEdl): string {
  const synthese = syntheseEdl({
    logementId: 'document',
    bailId: 'document',
    type: contenu.type,
    pieces: contenu.pieces,
  });

  const comptes = ETATS_ELEMENT.filter((e) => {
    const nombre = synthese.parEtat.find((x) => x.etat === e.valeur)?.nombre ?? 0;
    return nombre > 0;
  })
    .map((e) => {
      const nombre = synthese.parEtat.find((x) => x.etat === e.valeur)?.nombre ?? 0;
      const ton = TONS_ETAT[e.valeur];
      return `<span class="e-compte" style="background:${ton.fond};color:${ton.texte};border-color:${ton.bordure}">
        <strong>${nombre}</strong> ${echapper(e.libelle)}</span>`;
    })
    .join('');

  const avertissement =
    synthese.aRenseigner > 0
      ? `<p class="e-mention"><strong>${synthese.aRenseigner} élément(s) ne portent aucun état.</strong>
         Ce document ne peut pas être établi en l’état : chaque élément doit être constaté, ou
         explicitement marqué « non vérifié ».</p>`
      : '';

  return `<div class="e-synthese">${comptes || '<span class="e-vide">Aucun élément décrit.</span>'}</div>
    <table class="e-table">
      ${ligne('Pièces décrites', String(synthese.pieces))}
      ${ligne('Éléments décrits', String(synthese.total))}
      ${ligne('Éléments constatés', String(synthese.constates))}
      ${ligne('Éléments sans état', String(synthese.aRenseigner))}
      ${ligne('Photos jointes', String(synthese.photos))}
    </table>
    ${avertissement}`;
}



/** Le corps de chaque section, par sa valeur. */
function corpsDeSection(valeur: string, contenu: ContenuEdl): string {
  switch (valeur) {
    case 'objet':
      return corpsObjet(contenu);
    case 'logement':
      return corpsLogement(contenu);
    case 'parties':
      return corpsParties(contenu);
    case 'bail':
      return corpsBail(contenu);
    case 'compteurs':
      return corpsCompteurs(contenu);
    case 'cles':
      return corpsCles(contenu);
    case 'pieces':
      return corpsPieces(contenu);
    case 'observations':
      return corpsObservations(contenu);
    case 'vetuste':
      return corpsVetuste(PHRASE_VETUSTE_EDL);
    case 'synthese':
      return corpsSynthese(contenu);
    case 'signatures':
      return corpsSignatures(contenu);
    case 'sources':
      return corpsSources(SOURCES_EDL);
    case 'reference_entree':
      return contenu.dateEntree
        ? `<table class="e-table">${ligne(
            "Date de l'état des lieux d'entrée",
            echapper(dateFr(contenu.dateEntree)),
          )}</table>`
        : '<p class="e-vide">La date de l’état des lieux d’entrée n’est pas renseignée.</p>';
    case 'nouveau_domicile':
      return contenu.nouveauDomicile?.trim()
        ? `<p class="e-texte-libre">${echapper(contenu.nouveauDomicile.trim())}</p>`
        : '<p class="e-vide">L’adresse du nouveau domicile du locataire n’est pas renseignée.</p>';
    case 'evolutions':
      return corpsEvolutions(contenu);
    default:
      // Une section inconnue est **dite**, pas sautée : la faire disparaître
      // laisserait croire que le document est complet.
      return `<p class="e-vide">Section non reconnue par cette version de l’application : ${echapper(
        valeur,
      )}.</p>`;
  }
}

/**
 * Une paire avant / après, pour un élément.
 *
 * La mise en regard de deux constats est **écrite une seule fois**, dans
 * `sections-constat.ts`, et c'est là que chaque côté résout ses photos contre
 * **son propre** index — faute de quoi la photo de l'entrée s'imprimerait dans
 * la colonne « Sortie », et un document faux naîtrait sans qu'aucun contrôle de
 * texte ne le voie. Les noms de classes sont communs aux deux documents, pour
 * la même raison.
 */

/** La ligne d'un élément dans le tableau comparatif. */
function ligneComparaison(element: ComparaisonElement): string {
  // Un élément absent d'un côté n'est pas « non renseigné » : il n'y est pas.
  // Confondre les deux ferait lire un oubli là où le logement n'a pas été
  // regardé, et l'inverse.
  const celluleEntree = element.aLEntree
    ? pastille(element.etatEntree)
    : '<span class="e-evol-note">Non décrit à l’entrée</span>';
  const celluleSortie = element.aLaSortie
    ? pastille(element.etatSortie)
    : '<span class="e-evol-note">Non décrit à la sortie</span>';

  return `<tr>
    <td class="e-evol-element">${echapper(element.nom || 'Élément sans nom')}</td>
    <td class="e-evol-etat">${celluleEntree}</td>
    <td class="e-evol-etat">${celluleSortie}</td>
  </tr>`;
}

function pieceCompareeEnHtml(
  piece: ComparaisonPiece,
  contenu: ContenuEdl,
  etiquetteEntree: string,
  etiquetteSortie: string,
): string {
  const evolutions = piece.elements.filter((e) => e.evolution).length;
  const compte =
    evolutions > 0
      ? `<span class="e-evol-compte">— ${evolutions} évolution(s) constatée(s)</span>`
      : `<span class="e-evol-compte">— aucun écart entre les deux constats</span>`;

  const tableau = `<table class="e-table e-evol">
    <thead><tr><th>Élément</th><th>Entrée</th><th>Sortie</th></tr></thead>
    <tbody>${piece.elements.map(ligneComparaison).join('')}</tbody>
  </table>`;

  // Les paires ne sont imprimées que pour les éléments qui portent une photo
  // d'un côté ou de l'autre : une paire de deux cadres vides n'apprend rien.
  const illustres = piece.elements.filter(
    (e) => e.photosEntree.length > 0 || e.photosSortie.length > 0,
  );
  const paires =
    illustres.length > 0
      ? `<div class="e-paires">${illustres
          .map((e) =>
            paireEnHtml({
              titre: e.nom || 'Élément sans nom',
              entree: {
                etiquette: etiquetteEntree,
                condition: libelleEtat(e.etatEntree),
                ids: e.photosEntree,
                index: contenu.photosEntree ?? {},
              },
              sortie: {
                etiquette: etiquetteSortie,
                condition: libelleEtat(e.etatSortie),
                ids: e.photosSortie,
                index: contenu.photos,
              },
            }),
          )
          .join('')}</div>`
      : '';

  const notePiece = piece.aLEntree
    ? ''
    : '<p class="e-evol-note">Cette pièce n’existait pas dans l’état des lieux d’entrée.</p>';

  return `<div class="e-evol-piece">
    <h3>${echapper(piece.nom || 'Pièce sans nom')} ${compte}</h3>
    ${notePiece}
    ${tableau}
    ${paires}
  </div>`;
}

/**
 * Les évolutions depuis l'entrée.
 *
 * Deux cas, et le second n'est pas un repli dégradé : quand l'état des lieux
 * d'entrée n'a pas pu être relu, le document **le dit** et renvoie à l'autre
 * document, dont la présentation est identique. Inventer un tableau comparatif
 * que rien n'a rempli serait le pire des deux mondes : une section obligatoire
 * qui affirme sans constater.
 *
 * Ce que la section ne fait jamais : qualifier un écart. Elle met deux constats
 * côte à côte, et la phrase qui suit rappelle que le document n'impute aucune
 * dégradation au locataire — c'est la même règle que la section sur la vétusté,
 * répétée là où le lecteur voit les écarts.
 */
function corpsEvolutions(contenu: ContenuEdl): string {
  const comparaison = contenu.comparaison;
  const dateEntree = contenu.dateEntree ? dateFr(contenu.dateEntree) : '';
  const rappel = `<p class="e-mention">Les deux constats sont mis en regard, sans être qualifiés.
  Un écart entre deux états n’est ni une dégradation ni une faute : le présent document
  <strong>n’impute aucune responsabilité au locataire</strong>. L’appréciation d’une éventuelle
  responsabilité, et l’application d’une grille de vétusté si les parties en ont convenu une,
  relèvent des parties et le cas échéant de la juridiction compétente.</p>`;

  if (!comparaison) {
    return `<p class="e-texte-libre">Le présent état des lieux constate l’état du logement à la sortie.
Les évolutions de chaque pièce et partie du logement depuis l’établissement de l’état des lieux
d’entrée${
      dateEntree ? ` du ${echapper(dateEntree)}` : ''
    } se lisent en confrontant ce document à celui-là, dont la présentation est identique,
comme le prévoit l’article 3 du décret n° 2016-382.</p>
    ${rappel}`;
  }

  const entete = `<p class="e-texte-libre">Le tableau ci-dessous met en regard l’état relevé à l’entrée${
    dateEntree ? ` le ${echapper(dateEntree)}` : ''
  } et l’état relevé à la sortie, élément par élément. Les deux documents partagent les mêmes pièces
et les mêmes éléments : c’est leur identifiant, et non leur nom, qui les apparie.</p>
  <table class="e-table">
    ${ligne('Éléments comparés', String(comparaison.pieces.reduce((n, p) => n + p.elements.length, 0)))}
    ${ligne('Évolutions constatées', String(comparaison.evolutions))}
    ${ligne('Éléments nouveaux', String(comparaison.nouveaux))}
    ${ligne('Éléments non décrits à la sortie', String(comparaison.disparus))}
    ${ligne('Éléments non comparables', String(comparaison.incomparables))}
  </table>`;

  // La phrase qui suit n'est imprimée que si elle porte : un document sans
  // élément incomparable n'a pas à expliquer ce qu'est un élément incomparable.
  const surLesIncomparables =
    comparaison.incomparables > 0
      ? `<p class="e-mention">${comparaison.incomparables} élément(s) ne se comparent pas : l’un des
deux constats manque, ou porte la mention « non vérifié ». Un élément que personne n’a regardé n’a
pas évolué, et le dire ainsi vaut mieux que de l’annoncer comme inchangé.</p>`
      : '';

  const etiquetteEntree = `Entrée${dateEntree ? ` du ${dateEntree}` : ''}`;
  const etiquetteSortie = `Sortie du ${dateFr(contenu.dateEdl)}`;

  return `${entete}
    ${surLesIncomparables}
    ${comparaison.pieces
      .map((p) => pieceCompareeEnHtml(p, contenu, etiquetteEntree, etiquetteSortie))
      .join('')}
    ${rappel}`;
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

/**
 * Le contenu imprimé, assemblé depuis ce que le domaine porte.
 *
 * « Ce qui s'imprime est ce qui a été saisi » : aucune valeur absente n'est
 * remplacée par un défaut plausible. Un lieu vide ne devient pas « Paris », et
 * une date inconnue s'imprime « — ».
 */
export function contenuEdlDepuis(params: {
  type: TypeEdl;
  dateEdl: string;
  etabliLe: string;
  lieu?: string;
  logement: LogementBail;
  bailleur: PartieBailleur;
  locataires: PartieLocataire[];
  /** Identifiants des locataires, dans le même ordre que `locataires`. */
  locatairesIds?: string[];
  mandataire?: string;
  bail: BailReference;
  compteurs?: ReleveCompteur[];
  cles?: CleRemise[];
  pieces?: PieceEdl[];
  observations?: string;
  signatures?: Signature[];
  compteursIndividuels?: boolean;
  dateEntree?: string;
  nouveauDomicile?: string;
  /** La mise en regard des deux constats, quand l'entrée a pu être relue. */
  comparaison?: ComparaisonEdl;
  photos?: PhotosEdl;
  /** Les photos de l'entrée, indexées séparément de celles de la sortie. */
  photosEntree?: PhotosEdl;
  reserves?: string[];
}): ContenuEdl {
  const locataires = params.locataires;
  const ids = params.locatairesIds ?? locataires.map((_, index) => `titulaire-${index + 1}`);

  // L'ordre d'impression est celui du bail : le bailleur, puis chaque locataire
  // dans l'ordre enregistré, puis le mandataire s'il y en a un.
  const signataires: SignataireImprime[] = [
    { id: 'bailleur', nom: params.bailleur.nom, role: 'Le bailleur' },
    ...locataires.map((l, index) => ({
      id: ids[index] ?? `titulaire-${index + 1}`,
      nom: `${l.prenom} ${l.nom}`.trim(),
      role: locataires.length > 1 ? `Locataire ${index + 1}` : 'Le locataire',
    })),
  ];
  const mandataire = params.mandataire?.trim() ?? '';
  if (mandataire) {
    signataires.push({ id: 'mandataire', nom: mandataire, role: 'Le mandataire' });
  }

  return {
    type: params.type,
    dateEdl: params.dateEdl,
    etabliLe: params.etabliLe,
    lieu: params.lieu?.trim() ?? '',
    logement: params.logement,
    bailleur: params.bailleur,
    locataires,
    mandataire,
    bail: params.bail,
    compteurs: params.compteurs ?? [],
    cles: params.cles ?? [],
    pieces: params.pieces ?? [],
    observations: params.observations ?? '',
    signatures: params.signatures ?? [],
    signataires,
    compteursIndividuels: params.compteursIndividuels === true,
    dateEntree: params.dateEntree,
    nouveauDomicile: params.nouveauDomicile,
    comparaison: params.comparaison,
    photos: params.photos ?? {},
    photosEntree: params.photosEntree,
    reserves: params.reserves ?? [],
  };
}

/** Le document complet, prêt à imprimer. */
export function rendreEtatDesLieux(contenu: ContenuEdl): string {
  const sections = sectionsEdl(contenu.type)
    .map((s, index) => section(index + 1, s.titre, corpsDeSection(s.valeur, contenu)))
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${echapper(LIBELLE_TYPE_EDL[contenu.type])} — ${echapper(contenu.logement.nom)}</title>
<style>${STYLES_BASE}${STYLES_EDL}</style>
</head>
<body>
  <div class="page">

    <div class="e-bandeau">
      <div>
        <h1>${echapper(LIBELLE_TYPE_EDL[contenu.type])}</h1>
        <div class="e-sous-titre">${echapper(contenu.logement.nom)}${
          contenu.lieu ? ` — établi à ${echapper(contenu.lieu)}` : ''
        }</div>
      </div>
      <div class="e-etabli">Établi le<br />${echapper(dateFr(contenu.etabliLe))}</div>
    </div>

    ${sections}

  </div>
</body>
</html>`;
}

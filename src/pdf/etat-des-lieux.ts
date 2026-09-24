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
import { dimensionDansLaLargeur } from './trace.ts';

/**
 * La largeur utile d'une photo, en millimètres.
 *
 * A4 fait 210 mm de large, et la page réserve 18 mm de marge de chaque côté :
 * il reste 174 mm. Deux photos côte à côte tiennent donc dans 85 mm chacune,
 * marges comprises. La valeur est écrite ici, et non calculée depuis la feuille
 * de style, parce qu'elle décide de la taille imprimée et qu'un changement de
 * marge doit la faire changer — le banc de mesure des marges s'en assure.
 */
export const LARGEUR_PHOTO_MM = 85;

/**
 * La hauteur maximale d'une photo, en millimètres.
 *
 * Une photo en portrait, cadrée sur la seule largeur, occuperait la moitié
 * d'une feuille et repousserait les éléments suivants. On plafonne donc la
 * hauteur, en conservant le rapport largeur/hauteur : une photo étirée ne
 * prouverait plus ce qu'elle montre.
 */
export const HAUTEUR_PHOTO_MAX_MM = 105;

// ---------------------------------------------------------------------------
// Contenu
// ---------------------------------------------------------------------------

/**
 * Une photo prête à imprimer.
 *
 * `donnees` porte l'URI `data:` complète, construite au moment de l'émission en
 * lisant le fichier. Une chaîne vide signifie que le fichier est **illisible** :
 * le document imprime alors une ligne qui le dit, plutôt qu'une image cassée
 * dont personne ne saurait qu'il en manque une.
 */
export interface PhotoImprimable {
  id: string;
  donnees: string;
  legende: string;
  largeur?: number;
  hauteur?: number;
}

/** Les photos d'un état des lieux, indexées par identifiant. */
export type PhotosEdl = Record<string, PhotoImprimable>;

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
 * C'est une **liste**, et non un rang calculé à l'impression. La première
 * version de ce fichier appariait les signatures par position — la première
 * sous le bailleur, la suivante sous le premier locataire — ce qui plaçait la
 * signature d'un colocataire sous le nom de l'autre dès qu'une signature
 * manquait ou arrivait dans un autre ordre. Un document qui attribue une
 * signature à la mauvaise personne est faux, et c'est la faute la plus grave
 * que ce fichier puisse commettre.
 */
export interface SignataireImprime {
  id: string;
  nom: string;
  role: string;
}

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

/** La couleur d'une pastille d'état. Le libellé l'accompagne toujours. */
const TONS_ETAT: Record<EtatElement, { fond: string; texte: string; bordure: string }> = {
  neuf: { fond: '#E8F5E9', texte: '#1B5E20', bordure: '#A5D6A7' },
  tres_bon: { fond: '#F1F8E9', texte: '#33691E', bordure: '#C5E1A5' },
  bon: { fond: '#ECF5FA', texte: '#00406E', bordure: '#BBDEFB' },
  usage: { fond: '#FFF8E1', texte: '#8D6E00', bordure: '#FFE082' },
  mauvais: { fond: '#FDECEA', texte: '#B3261E', bordure: '#F5C6C2' },
  non_verifie: { fond: '#F5F5F5', texte: '#555555', bordure: '#DDDDDD' },
  non_applicable: { fond: '#FAFAFA', texte: '#777777', bordure: '#E8E8E8' },
};

export const STYLES_EDL = `
  /* Le format de page vient de STYLES_BASE (A4). On reprend la classe page,
     parce que celle de STYLES_BASE est une **colonne flex** a hauteur minimale
     de 285 mm, dessinee pour une quittance qui tient sur une feuille : une
     colonne flex se pagine mal. Un etat des lieux change de page, on repasse
     donc en bloc et on laisse le contenu decider du nombre de feuilles.
     (Les accents graves sont proscrits dans ce commentaire : il vit a
     l'interieur d'un litteral de gabarit, et ils fermeraient la chaine.) */
  .page {
    display: block;
    min-height: 0;
    padding: 12mm 18mm 12mm 18mm;
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
     d'un bloc : une puce seule sur la feuille suivante laisse une page aux
     cinq sixiemes vide, defaut mesure sur la liste des sources. La consigne
     break-inside posee sur la liste entiere est sans danger quand elle depasse
     une page : le moteur l'ignore alors et coupe normalement.
     (Les accents graves sont proscrits dans ce commentaire : il vit a
     l'interieur d'un litteral de gabarit, et ils fermeraient la chaine.) */
  .e-liste {
    margin: 0;
    padding-left: 5mm;
    font-size: 9.5pt;
    break-inside: avoid-page;
    page-break-inside: avoid;
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
function ligne(libelle: string, valeur: string): string {
  return `<tr><th>${echapper(libelle)}</th><td>${valeur}</td></tr>`;
}

/** Une section numérotée. Le numéro aide à vérifier qu'aucune ne manque. */
function section(rang: number, titre: string, corps: string): string {
  return `<section class="e-section">
    <h2><span class="e-numero">${rang}.</span> ${echapper(titre)}</h2>
    ${corps}
  </section>`;
}

/** « 15 septembre 2026 » à partir de `2026-09-15`. */
function dateFr(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  const [a, m, j] = valeur.split('-').map(Number);
  if (!a || !m || !j) return valeur;
  const mois = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ];
  return `${j} ${mois[m - 1]} ${a}`;
}

/** La pastille d'un état : le libellé est toujours imprimé à côté. */
function pastille(etat: EtatElement | undefined): string {
  if (!etat) {
    return '<span class="e-etat" style="background:#FFFFFF;color:#B3261E;border:0.25mm solid #F5C6C2">Non renseigné</span>';
  }
  const presentation = ETATS_ELEMENT.find((e) => e.valeur === etat);
  const ton = TONS_ETAT[etat];
  const libelle = presentation?.libelle ?? etat;
  return (
    `<span class="e-etat" style="background:${ton.fond};color:${ton.texte};` +
    `border:0.25mm solid ${ton.bordure}">${echapper(libelle)}</span>`
  );
}

/**
 * Une photo, ou la mention de son absence.
 *
 * Une photo dont le fichier est illisible **le dit**. Imprimer une image cassée
 * ferait croire à un défaut d'affichage ; l'omettre ferait croire qu'il n'y
 * avait pas de photo.
 */
function photo(imprimable: PhotoImprimable | undefined): string {
  if (!imprimable) return '';
  if (!imprimable.donnees) {
    return `<figure class="e-photo"><div class="e-photo-absente">Photo illisible<br />${echapper(
      imprimable.legende || 'sans légende',
    )}</div></figure>`;
  }

  // Une photo en portrait, cadrée sur la seule largeur, occuperait toute une
  // feuille. On plafonne donc la hauteur, et on recalcule la largeur pour
  // conserver le rapport : une photo étirée ne prouverait plus rien.
  const cadre = dimensionDansLaLargeur(
    imprimable.largeur ?? 4,
    imprimable.hauteur ?? 3,
    LARGEUR_PHOTO_MM,
  );
  const hauteur = Math.min(cadre.hauteur, HAUTEUR_PHOTO_MAX_MM);
  const largeur = Math.round((cadre.largeur * hauteur) / Math.max(1, cadre.hauteur));

  return `<figure class="e-photo" style="width:${largeur}mm">
    <img src="${echapper(imprimable.donnees)}" alt="${echapper(imprimable.legende || 'Photo du logement')}" />
    ${imprimable.legende ? `<figcaption>${echapper(imprimable.legende)}</figcaption>` : ''}
  </figure>`;
}

/** Toutes les photos d'un élément, dans l'ordre. */
function photosDe(liste: { id: string }[], photos: PhotosEdl): string {
  const rendues = liste.map((p) => photo(photos[p.id])).filter((h) => h.length > 0);
  return rendues.length > 0 ? `<div class="e-photos">${rendues.join('')}</div>` : '';
}

// ---------------------------------------------------------------------------
// Les sections, une par une
// ---------------------------------------------------------------------------

function corpsObjet(contenu: ContenuEdl): string {
  const nombreParties = 1 + contenu.locataires.length;
  return `<table class="e-table">
    ${ligne('Nature', `<strong>${echapper(LIBELLE_TYPE_EDL[contenu.type])}</strong>`)}
    ${ligne('Date d’établissement', echapper(dateFr(contenu.dateEdl)))}
    ${
      contenu.type === 'sortie' && contenu.dateEntree
        ? ligne("État des lieux d'entrée", echapper(dateFr(contenu.dateEntree)))
        : ''
    }
    ${ligne('Établi à', contenu.lieu ? echapper(contenu.lieu) : '—')}
    ${ligne(
      'Exemplaires',
      `${nombreParties} — un pour le bailleur, un pour chacun des ${contenu.locataires.length} locataire(s)`,
    )}
  </table>
  <p class="e-mention">
    Document établi contradictoirement et amiablement, conformément à l’article 3-2 de la loi
    n° 89-462 du 6 juillet 1989 et au décret n° 2016-382 du 30 mars 2016. Il porte sur l’ensemble
    des locaux et équipements d’usage privatif mentionnés au bail.
  </p>`;
}

function corpsLogement(contenu: ContenuEdl): string {
  const adresse = adresseEnLignes(contenu.logement);
  return `<table class="e-table">
    ${ligne('Désignation', echapper(contenu.logement.nom))}
    ${ligne('Adresse', adresse.map((l) => echapper(l)).join('<br />') || '—')}
    ${ligne(
      'Surface habitable',
      contenu.logement.surface ? `${contenu.logement.surface} m²` : 'Non renseignée',
    )}
    ${ligne('Référence', contenu.logement.reference ? echapper(contenu.logement.reference) : '—')}
  </table>`;
}

function corpsParties(contenu: ContenuEdl): string {
  const adresseBailleur = adresseEnLignes(contenu.bailleur);
  const bailleur = `<div class="e-partie">
    <h3>Le bailleur</h3>
    <p><strong>${echapper(
      contenu.bailleur.qualite
        ? `${contenu.bailleur.nom} — ${contenu.bailleur.qualite}`
        : contenu.bailleur.nom,
    )}</strong></p>
    ${adresseBailleur.map((l) => `<p>${echapper(l)}</p>`).join('')}
    ${contenu.bailleur.telephone ? `<p>Tél. ${echapper(contenu.bailleur.telephone)}</p>` : ''}
  </div>`;

  const locataires =
    contenu.locataires.length > 0
      ? contenu.locataires
          .map(
            (l) => `<div class="e-partie">
        <h3>${contenu.locataires.length > 1 ? 'Un locataire' : 'Le locataire'}</h3>
        <p><strong>${echapper(`${l.prenom} ${l.nom}`.trim())}</strong></p>
        ${
          l.dateNaissance
            ? `<p>Naissance : ${echapper(dateFr(l.dateNaissance))}${
                l.lieuNaissance ? ` à ${echapper(l.lieuNaissance)}` : ''
              }</p>`
            : ''
        }
        ${l.telephone ? `<p>Tél. ${echapper(l.telephone)}</p>` : ''}
      </div>`,
          )
          .join('')
      : `<div class="e-partie"><h3>Le locataire</h3><p class="e-vide">Aucun locataire enregistré.</p></div>`;

  const mandataire = contenu.mandataire.trim()
    ? `<div class="e-partie">
        <h3>Mandataire</h3>
        <p>${echapper(contenu.mandataire.trim())}</p>
      </div>`
    : '';

  return `<div class="e-parties">${bailleur}${locataires}${mandataire}</div>`;
}

function corpsBail(contenu: ContenuEdl): string {
  const total = contenu.bail.loyer + contenu.bail.charges;
  return `<table class="e-table">
    ${ligne("Date d'entrée", echapper(dateFr(contenu.bail.dateEntree)))}
    ${ligne('Date de sortie', contenu.bail.dateSortie ? echapper(dateFr(contenu.bail.dateSortie)) : 'Location en cours')}
    ${ligne('Loyer hors charges', `${echapper(formatMontant(contenu.bail.loyer))} par mois`)}
    ${ligne('Provision pour charges', `${echapper(formatMontant(contenu.bail.charges))} par mois`)}
    ${ligne('Total mensuel', `<strong>${echapper(formatMontant(total))}</strong>`)}
    ${ligne(
      'Dépôt de garantie',
      contenu.bail.depotGarantie > 0 ? echapper(formatMontant(contenu.bail.depotGarantie)) : 'Aucun',
    )}
    ${ligne('Échéance', `Le ${contenu.bail.jourEcheance} de chaque mois`)}
  </table>`;
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

function corpsObservations(contenu: ContenuEdl): string {
  const texte = contenu.observations.trim();
  const reserves =
    contenu.reserves.length > 0
      ? `<ul class="e-liste">${contenu.reserves.map((r) => `<li>${echapper(r)}</li>`).join('')}</ul>`
      : '';
  return `${texte ? `<p class="e-texte-libre">${echapper(texte)}</p>` : '<p class="e-vide">Aucune observation générale n’a été saisie.</p>'}
    ${reserves}`;
}

function corpsVetuste(): string {
  // L'article 4 definit la vetuste comme l'usure du temps ou de l'usage normal.
  // Le document le rappelle, et rappelle surtout qu'il ne tranche pas : c'est
  // cette phrase qui empeche de lire une evolution comme une faute du locataire.
  return `<p class="e-texte-libre">La vétusté s’entend comme l’état d’usure ou de détérioration résultant
du temps ou de l’usage normal des matériaux et éléments d’équipement du logement.</p>
  <p class="e-mention">Le présent état des lieux <strong>constate</strong> l’état des lieux et de ses
éléments. Il ne qualifie aucune évolution et n’impute aucune dégradation au locataire : l’appréciation
d’une éventuelle responsabilité relève des parties, et le cas échéant de la juridiction compétente.
Lorsqu’une grille de vétusté a été convenue entre les parties, elle s’applique à ces constats.</p>`;
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

function corpsSignatures(contenu: ContenuEdl): string {
  // L'appariement se fait **par identifiant**, jamais par rang : deux
  // colocataires dont un seul a signé ne doivent pas se retrouver avec la
  // signature de l'autre. Un signataire attendu qui n'a pas signé figure quand
  // même, avec la mention « Non signé » — c'est une information, pas un oubli.
  const blocs = contenu.signataires
    .map((attendu) => ({
      nom: attendu.nom,
      role: attendu.role,
      signature: contenu.signatures.find((s) => s.signataire === attendu.id && s.trace.length > 0),
    }))
    .filter((b) => b.nom.trim().length > 0);

  const contenu_ = `<div class="e-signatures">${blocs
    .map(
      (b) => `<div class="e-signature">
        <div class="e-cadre">${
          b.signature
            ? `<img src="${echapper(b.signature.trace)}" alt="Signature de ${echapper(b.nom)}" />`
            : '<span class="e-vide">Non signé</span>'
        }</div>
        <div class="e-qui"><strong>${echapper(b.nom)}</strong><br />${echapper(b.role)}${
          b.signature ? `<br />Signé le ${echapper(dateFr(b.signature.date))}` : ''
        }</div>
      </div>`,
    )
    .join('')}</div>
    <p class="e-mention">${echapper(MENTION_SIGNATURE)}</p>`;

  // Aucun signataire attendu : le document le dit, plutôt que d'afficher une
  // zone vide qui laisserait croire à un défaut d'affichage.
  if (blocs.length === 0) {
    return `<p class="e-vide">Aucun signataire n’est identifié sur ce document.</p>`;
  }
  return contenu_;
}

function corpsSources(): string {
  return `<ul class="e-sources">${SOURCES_EDL.map(
    (s) => `<li>${echapper(s.reference)} — consulté le ${echapper(dateFr(s.consulteLe))}</li>`,
  ).join('')}</ul>`;
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
      return corpsVetuste();
    case 'synthese':
      return corpsSynthese(contenu);
    case 'signatures':
      return corpsSignatures(contenu);
    case 'sources':
      return corpsSources();
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
 * Une colonne d'une paire avant/après.
 *
 * La colonne porte son propre intitulé — « Entrée du 12 mars 2026 » — et non un
 * simple « Avant » : deux photos de la même pièce prises à des années
 * d'intervalle se distinguent par leur date, et une paire sans date ne dit pas
 * au lecteur laquelle des deux est l'entrée.
 */
function colonneDePaire(
  etiquette: string,
  etat: EtatElement | undefined,
  photos: PhotoImprimable[],
): string {
  const rendues = photos.map((p) => photo(p)).filter((h) => h.length > 0).join('');
  return `<div class="e-paire-colonne">
    <p class="e-paire-etiquette">${echapper(etiquette)} — ${echapper(libelleEtat(etat))}</p>
    ${rendues || '<p class="e-paire-sans">Aucune photo</p>'}
  </div>`;
}

/**
 * Une paire avant / après, pour un élément.
 *
 * Les photos viennent de **deux index distincts** — celles de l'entrée et
 * celles de la sortie — et ne peuvent pas être confondues : les deux états des
 * lieux numérotent leurs photos `ph1`, `ph2`… par élément, si bien qu'un index
 * unique ferait imprimer la photo de l'entrée à la place de celle de la sortie.
 * C'est aussi la raison pour laquelle la paire est construite ici, et non
 * déduite d'un tableau de photos commun.
 */
function paireEnHtml(
  element: ComparaisonElement,
  etiquetteEntree: string,
  etiquetteSortie: string,
  photosEntree: PhotosEdl,
  photosSortie: PhotosEdl,
): string {
  const avant = element.photosEntree
    .map((id) => photosEntree[id])
    .filter((p): p is PhotoImprimable => p !== undefined);
  const apres = element.photosSortie
    .map((id) => photosSortie[id])
    .filter((p): p is PhotoImprimable => p !== undefined);

  return `<div class="e-paire">
    <p class="e-paire-titre">${echapper(element.nom || 'Élément sans nom')}</p>
    <div class="e-paire-colonnes">
      ${colonneDePaire(etiquetteEntree, element.etatEntree, avant)}
      ${colonneDePaire(etiquetteSortie, element.etatSortie, apres)}
    </div>
  </div>`;
}

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
            paireEnHtml(e, etiquetteEntree, etiquetteSortie, contenu.photosEntree ?? {}, contenu.photos),
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

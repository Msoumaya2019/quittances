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
  sectionsEdl,
  syntheseEdl,
} from '../domain/etat-des-lieux.ts';
import type {
  CleRemise,
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
 * Les évolutions depuis l'entrée.
 *
 * À ce stade de l'application, la comparaison détaillée vit dans l'écran qui
 * prépare l'état des lieux de sortie ; le document, lui, se contente de rappeler
 * ce qu'il constate et de renvoyer à l'état des lieux d'entrée. Inventer ici un
 * tableau comparatif que rien n'a rempli serait le pire des deux mondes : une
 * section obligatoire qui affirme sans constater.
 */
function corpsEvolutions(contenu: ContenuEdl): string {
  return `<p class="e-texte-libre">Le présent état des lieux constate l’état du logement à la sortie.
Les évolutions de chaque pièce et partie du logement depuis l’établissement de l’état des lieux
d’entrée se lisent en confrontant ce document à celui du ${echapper(dateFr(contenu.dateEntree ?? ''))},
dont la présentation est identique, comme le prévoit l’article 3 du décret n° 2016-382.</p>`;
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
  photos?: PhotosEdl;
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
    photos: params.photos ?? {},
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

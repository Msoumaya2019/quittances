/**
 * Le rendu imprimé d'un inventaire du mobilier.
 *
 * Un inventaire du mobilier est un **constat**, comme un état des lieux : il
 * nomme le logement, les parties, le bail, il porte des observations, des
 * signatures et ses sources. Ces sections-là sont écrites **une seule fois**,
 * dans `sections-constat.ts`, et les pastilles d'état comme les photos viennent
 * de `constats.ts` — un meuble se constate dans les mêmes termes qu'un mur, et
 * « Photo illisible » ne se dit pas de deux façons.
 *
 * Ce que ce module est seul à imprimer : la liste légale du mobilier obligatoire,
 * le mobilier pièce par pièce, la mise en regard de deux constats, et sa
 * synthèse.
 *
 * Deux règles gouvernent ce fichier :
 *
 * - **Ce qui s'imprime est ce qui a été compté.** Une quantité absente s'imprime
 *   « non compté », jamais « 1 » ; un état absent s'imprime « non renseigné »,
 *   jamais « bon état ». Un document qui remplit un trou par un défaut plausible
 *   est un document faux, et celui-ci serait signé.
 * - **Aucun écart n'est imputé à personne.** Le document met deux constats côte
 *   à côte et s'arrête là ; sa section sur la vétusté rappelle que l'appréciation
 *   d'une responsabilité ne lui appartient pas.
 *
 * Module **pur** : ni SQLite, ni React, ni `expo-print`.
 */

import {
  LIBELLE_TYPE_INVENTAIRE,
  SOURCES_INVENTAIRE,
  presenceDesElementsObligatoires,
  sectionsInventaire,
  syntheseInventaire,
} from '../domain/inventaire.ts';
import type {
  ComparaisonInventaire,
  ComparaisonMeuble,
  PieceInventaire,
  TypeInventaire,
} from '../domain/inventaire.ts';
import { ETATS_ELEMENT, libelleEtat } from '../domain/etats.ts';
import type { EtatElement } from '../domain/etats.ts';
import type { Signature } from '../domain/signature.ts';
import { TONS_ETAT, pastille, rendrePhotos } from './constats.ts';
import type { PhotosImprimables } from './constats.ts';
import { COULEURS_DOCUMENT, echapper, STYLES_BASE } from './styles.ts';
// La présentation d'un constat est **une** : un inventaire du mobilier
// s'imprime avec les mêmes styles qu'un état des lieux, parce que c'est le même
// document dans sa forme. `STYLES_EDL` les porte depuis l'origine ; ce module
// les reprend, et n'ajoute que ce qu'il est seul à imprimer.
import { STYLES_EDL } from './etat-des-lieux.ts';
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
import type { BailImprime, SignataireImprime } from './sections-constat.ts';
import type { LogementBail, PartieBailleur, PartieLocataire } from './bail.ts';

// ---------------------------------------------------------------------------
// Contenu
// ---------------------------------------------------------------------------

/**
 * Ce qu'un inventaire imprime.
 *
 * « Ce qui s'imprime est ce qui a été saisi » : aucune valeur absente n'est
 * remplacée par un défaut plausible. Un lieu vide ne devient pas « Paris », et
 * une date inconnue s'imprime « — ».
 */
export interface ContenuInventaire {
  type: TypeInventaire;
  /** Date d'établissement, `AAAA-MM-JJ`. */
  dateInventaire: string;
  /** Date d'édition du PDF, `AAAA-MM-JJ`. */
  etabliLe: string;
  /** Lieu d'établissement, imprimé en en-tête. */
  lieu: string;
  logement: LogementBail;
  bailleur: PartieBailleur;
  locataires: PartieLocataire[];
  /** Nom et qualité d'un mandataire, s'il y en a un. */
  mandataire: string;
  bail: BailImprime;
  pieces: PieceInventaire[];
  observations: string;
  signatures: Signature[];
  /** Qui doit signer, et sous quel nom. L'appariement se fait par identifiant. */
  signataires: SignataireImprime[];
  /**
   * Le logement est-il **déclaré** loué meublé ?
   *
   * La déclaration du bailleur, et non la présence d'un lit : un logement vide
   * n'est pas un logement non meublé, et l'application ne peut pas le deviner.
   * C'est ce drapeau, et lui seul, qui fait signaler un élément obligatoire
   * absent.
   */
  meuble: boolean;
  /** Pour une sortie : la date de l'inventaire d'entrée. */
  dateEntree?: string;
  /**
   * Pour une sortie : la mise en regard des deux constats.
   *
   * Absente quand l'inventaire d'entrée n'a pas pu être relu — la section le dit
   * alors en clair, plutôt que d'imprimer un tableau vide qui laisserait croire
   * qu'aucun meuble n'a changé.
   */
  comparaison?: ComparaisonInventaire;
  /** Pour une sortie : les photos de l'entrée, indexées séparément. */
  photosEntree?: PhotosImprimables;
  photos: PhotosImprimables;
  /** Les avertissements à imprimer, pour que le document dise ses limites. */
  reserves: string[];
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/** Les styles du constat, plus ce que l'inventaire est seul à imprimer. */
export const STYLES_INVENTAIRE = `${STYLES_EDL}
  /* La quantité comptée, dans un tableau comparatif : elle précède l'état, et
     se lit comme un rappel — c'est elle qui dit « il y en avait deux ». */
  .e-evol-quantite {
    font-size: 8.5pt;
    color: ${COULEURS_DOCUMENT.texteSecondaire};
    display: block;
    margin-bottom: 0.8mm;
  }`;

/**
 * La phrase de vétusté de l'inventaire.
 *
 * Elle **nomme le document** — un inventaire ne constate pas un état des lieux —
 * et elle est la même à l'entrée qu'à la sortie : un inventaire de sortie ne
 * qualifie pas davantage une dégradation qu'un inventaire d'entrée ne promet un
 * état.
 */
const PHRASE_VETUSTE_INVENTAIRE = `Le présent inventaire du mobilier <strong>constate</strong> le
mobilier présent et son état. Il ne qualifie aucune évolution et n’impute aucune dégradation au
locataire : l’appréciation d’une éventuelle responsabilité relève des parties, et le cas échéant de
la juridiction compétente. Lorsqu’une grille de vétusté a été convenue entre les parties, elle
s’applique à ce constat.`;

/**
 * Le cadre du document.
 *
 * Une phrase de présentation, et non une clause : ce document n'est pas un acte
 * juridique rédigé par l'application, et il le dit. Ce qu'il affirme — les
 * pièces du bail sont jointes au contrat — est l'article 3-2 de la loi du
 * 6 juillet 1989, reproduit dans les sources.
 */
const CADRE_DU_DOCUMENT =
  'Document établi par l’application à partir des éléments saisis par le bailleur. ' +
  'Il est destiné à être joint au contrat de location, avec les autres pièces du bail.';

// ---------------------------------------------------------------------------
// Sections propres à l'inventaire
// ---------------------------------------------------------------------------

function corpsObjet(contenu: ContenuInventaire): string {
  return `<table class="e-table">
    ${ligne('Nature du document', echapper(LIBELLE_TYPE_INVENTAIRE[contenu.type]))}
    ${ligne('Date d’établissement', echapper(dateFr(contenu.dateInventaire)))}
    ${ligne('Cadre', echapper(CADRE_DU_DOCUMENT))}
    ${ligne('Exemplaires', exemplairesEnLigne(contenu.locataires.length))}
  </table>`;
}

/**
 * La liste des onze éléments obligatoires, et ce que cet inventaire en dit.
 *
 * La liste est celle de l'article 2 du décret n° 2015-981, reproduite mot pour
 * mot. Ce que l'inventaire ajoute, c'est la **présence** de chaque élément, telle
 * qu'elle se déduit des meubles saisis.
 *
 * Le signalement d'un élément absent ne se déclenche que si le logement est
 * **déclaré** meublé, et il est formulé de façon qu'il n'accuse rien : il dit
 * « non trouvé dans cet inventaire », jamais « le logement n'est pas meublé ».
 * L'application ne sait pas si la liste est complète ; elle sait ce que le
 * bailleur a saisi.
 */
function corpsMobilierLegal(contenu: ContenuInventaire): string {
  const presences = presenceDesElementsObligatoires(contenu.pieces);
  const manquants = presences.filter((p) => !p.present);

  const lignes = presences
    .map((p) =>
      ligne(
        `${p.rang} ${p.libelle}`,
        p.present
          ? `${p.quantite} exemplaire(s) — ${p.pieces.map((nom) => echapper(nom)).join(', ')}`
          : '<span class="e-vide">non trouvé dans cet inventaire</span>',
      ),
    )
    .join('');

  const signalement =
    contenu.meuble && manquants.length > 0
      ? `<p class="e-mention"><strong>${manquants.length} élément(s) de cette liste n’ont pas été
         trouvés dans cet inventaire.</strong> Le logement est déclaré loué meublé : son mobilier doit
         comporter les onze éléments de l’article 2 du décret n° 2015-981. Cette liste constate ce que
         cet inventaire décrit, et ne dit pas que le logement n’est pas meublé.</p>`
      : '';

  const reserve = contenu.meuble
    ? ''
    : `<p class="e-vide">Le logement n’est pas déclaré loué meublé : cette liste est imprimée à
       titre de repère, et l’absence d’un élément n’y signale rien.</p>`;

  return `<table class="e-table">${lignes}</table>${signalement}${reserve}`;
}

/**
 * Une pièce, avec ses meubles et leurs photos.
 *
 * Le meuble et ses photos forment un bloc insécable : une photo qui passe à la
 * feuille suivante ne montre plus la ligne qu'elle illustre, et le lecteur doit
 * alors deviner à quoi elle se rapporte. C'est la même règle que pour un élément
 * d'état des lieux, et elle compte davantage ici : une photo de meuble est ce qui
 * prouve qu'il était là.
 */
function pieceEnHtml(piece: PieceInventaire, photos: PhotosImprimables): string {
  const meubles = piece.meubles
    .map((meuble) => {
      const quantite =
        meuble.quantite === undefined
          ? '<span class="e-evol-note">quantité non comptée</span>'
          : `<strong>${meuble.quantite}</strong>`;
      const commentaire = meuble.commentaire.trim()
        ? `<p class="e-commentaire">${echapper(meuble.commentaire.trim())}</p>`
        : '';
      return `<div class="e-element">
        <div class="e-element-ligne">
          <span class="e-element-nom">${echapper(meuble.nom || 'Meuble sans nom')}</span>
          <span class="e-evol-quantite">${quantite}</span>
          ${pastille(meuble.etat)}
        </div>
        ${commentaire}
        ${rendrePhotos(meuble.photos, photos)}
      </div>`;
    })
    .join('');

  return `<div class="e-piece">
    <h3>${echapper(piece.nom || 'Pièce sans nom')}</h3>
    ${meubles || '<p class="e-vide">Aucun meuble n’est décrit pour cette pièce.</p>'}
  </div>`;
}

function corpsPieces(contenu: ContenuInventaire): string {
  if (contenu.pieces.length === 0) {
    return '<p class="e-vide">Aucune pièce n’est décrite.</p>';
  }
  return contenu.pieces.map((p) => pieceEnHtml(p, contenu.photos)).join('');
}

/** La date de l'inventaire d'entrée, ou la mention de son absence. */
function corpsReferenceEntree(contenu: ContenuInventaire): string {
  return contenu.dateEntree
    ? `<table class="e-table">${ligne(
        "Date de l'inventaire du mobilier d'entrée",
        echapper(dateFr(contenu.dateEntree)),
      )}</table>`
    : `<p class="e-vide">La date de l’inventaire du mobilier d’entrée n’est pas renseignée.</p>`;
}

/**
 * Une cellule de la mise en regard : le rappel de la quantité, et la pastille.
 *
 * Trois cas, et ils ne se confondent pas :
 *
 * - le meuble n'est pas décrit de ce côté — il n'y était pas ;
 * - il y est décrit, mais sa quantité n'a pas été comptée : c'est écrit, et
 *   aucune quantité n'est affichée. Afficher « 0 » serait accuser ;
 * - il y est décrit et compté : la quantité et l'état s'impriment.
 */
function celluleComparaison(
  meuble: ComparaisonMeuble,
  cote: 'entree' | 'sortie',
): string {
  const decrit = cote === 'entree' ? meuble.aLEntree : meuble.aLaSortie;
  if (!decrit) {
    return `<span class="e-evol-note">Non décrit à ${cote === 'entree' ? 'l’entrée' : 'la sortie'}</span>`;
  }

  const quantite = cote === 'entree' ? meuble.quantiteEntree : meuble.quantiteSortie;
  const etat = cote === 'entree' ? meuble.etatEntree : meuble.etatSortie;
  const rappel =
    quantite === undefined
      ? '<span class="e-evol-note">quantité non comptée</span>'
      : `${quantite} ×`;

  return `<span class="e-evol-quantite">${rappel}</span>${pastille(etat)}`;
}

function ligneComparaison(meuble: ComparaisonMeuble): string {
  return `<tr>
    <td class="e-evol-element">${echapper(meuble.nom || 'Meuble sans nom')}</td>
    <td class="e-evol-etat">${celluleComparaison(meuble, 'entree')}</td>
    <td class="e-evol-etat">${celluleComparaison(meuble, 'sortie')}</td>
  </tr>`;
}

function pieceCompareeEnHtml(
  piece: ComparaisonInventaire['pieces'][number],
  contenu: ContenuInventaire,
  etiquetteEntree: string,
  etiquetteSortie: string,
): string {
  const evolutions = piece.meubles.filter((m) => m.evolution).length;
  const compte =
    evolutions > 0
      ? `<span class="e-evol-compte">— ${evolutions} évolution(s) constatée(s)</span>`
      : `<span class="e-evol-compte">— aucun écart entre les deux constats</span>`;

  const tableau = `<table class="e-table e-evol">
    <thead><tr><th>Meuble</th><th>Entrée</th><th>Sortie</th></tr></thead>
    <tbody>${piece.meubles.map(ligneComparaison).join('')}</tbody>
  </table>`;

  // Les paires ne sont imprimées que pour les meubles portant une photo d'un
  // côté ou de l'autre : une paire de deux cadres vides n'apprend rien.
  const illustres = piece.meubles.filter(
    (m) => m.photosEntree.length > 0 || m.photosSortie.length > 0,
  );
  const paires =
    illustres.length > 0
      ? `<div class="e-paires">${illustres
          .map((m) =>
            paireEnHtml({
              titre: m.nom || 'Meuble sans nom',
              entree: {
                etiquette: etiquetteEntree,
                condition: conditionImprimee(m.quantiteEntree, m.etatEntree),
                ids: m.photosEntree,
                index: contenu.photosEntree ?? {},
              },
              sortie: {
                etiquette: etiquetteSortie,
                condition: conditionImprimee(m.quantiteSortie, m.etatSortie),
                ids: m.photosSortie,
                index: contenu.photos,
              },
            }),
          )
          .join('')}</div>`
      : '';

  const notePiece = piece.aLEntree
    ? ''
    : '<p class="e-evol-note">Cette pièce n’existait pas dans l’inventaire d’entrée.</p>';

  return `<div class="e-evol-piece">
    <h3>${echapper(piece.nom || 'Pièce sans nom')} ${compte}</h3>
    ${notePiece}
    ${tableau}
    ${paires}
  </div>`;
}

/**
 * La condition d'un côté de la paire : « 2 × — Bon état ».
 *
 * Elle reprend le rappel de quantité quand il existe, et l'état quand il a été
 * constaté. Une quantité non comptée et un état non renseigné sont **dits**,
 * jamais remplacés par une valeur plausible : une paire de photos dont l'une
 * annoncerait « 1 » sans que personne n'ait compté serait un document faux.
 */
function conditionImprimee(quantite: number | undefined, etat: EtatElement | undefined): string {
  const parties: string[] = [];
  if (quantite !== undefined) parties.push(`${quantite} ×`);
  const libelle = libelleEtat(etat);
  if (libelle) parties.push(libelle);
  return parties.length > 0 ? parties.join(' — ') : 'état non renseigné';
}

/**
 * Les évolutions depuis l'entrée.
 *
 * Deux cas, et le second n'est pas un repli dégradé : quand l'inventaire
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
function corpsEvolutions(contenu: ContenuInventaire): string {
  const comparaison = contenu.comparaison;
  if (!comparaison) {
    return `<p class="e-vide">L’inventaire du mobilier d’entrée n’a pas pu être relu : les deux
      constats ne peuvent pas être mis en regard. L’inventaire d’entrée reste consultable dans le
      dossier du logement, et sa présentation est la même que celle de ce document.</p>`;
  }

  const pieces = comparaison.pieces.map((piece) =>
    pieceCompareeEnHtml(
      piece,
      contenu,
      contenu.dateEntree ? `Entrée du ${dateFr(contenu.dateEntree)}` : 'Entrée',
      `Sortie du ${dateFr(contenu.dateInventaire)}`,
    ),
  );

  const incomparables =
    comparaison.incomparables > 0
      ? `<p class="e-evol-note">${comparaison.incomparables} meuble(s) portent un état qui n’est pas
         un constat, d’un côté ou de l’autre : leur condition ne se compare pas. Ils sont comptés à
         part, et non comme des évolutions.</p>`
      : '';

  const resumes = [
    ligne('Quantités qui diffèrent', String(comparaison.ecarts)),
    ligne('États constatés qui diffèrent', String(comparaison.evolutionsEtat)),
    ligne('Meubles présents à la sortie seulement', String(comparaison.nouveaux)),
    ligne('Meubles présents à l’entrée seulement', String(comparaison.disparus)),
    ligne('Meubles dont la condition ne se compare pas', String(comparaison.incomparables)),
    ligne('Meubles illustrés par une photo', String(comparaison.illustres)),
  ].join('');

  return `${pieces.join('')}
    <table class="e-table">${resumes}</table>
    ${incomparables}
    <p class="e-mention">Ce tableau met deux constats en regard. Il ne qualifie aucun écart et
    n’impute aucune dégradation au locataire.</p>`;
}

function corpsSynthese(contenu: ContenuInventaire): string {
  const synthese = syntheseInventaire({
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
      ? `<p class="e-mention"><strong>${synthese.aRenseigner} meuble(s) n’ont pas de quantité comptée
         ou n’ont pas d’état.</strong> Ce document ne peut pas être établi en l’état : chaque meuble
         doit être compté et constaté, ou explicitement marqué « non vérifié ».</p>`
      : '';

  return `<div class="e-synthese">${comptes || '<span class="e-vide">Aucun meuble décrit.</span>'}</div>
    <table class="e-table">
      ${ligne('Pièces décrites', String(synthese.pieces))}
      ${ligne('Meubles décrits', String(synthese.total))}
      ${ligne('Meubles constatés', String(synthese.constates))}
      ${ligne('Exemplaires comptés', String(synthese.exemplaires))}
      ${ligne('Meubles sans quantité ou sans état', String(synthese.aRenseigner))}
      ${ligne('Photos jointes', String(synthese.photos))}
    </table>
    ${avertissement}`;
}

/** Le corps d'une section, choisi par sa valeur. */
function corpsDeSection(valeur: string, contenu: ContenuInventaire): string {
  switch (valeur) {
    case 'objet':
      return corpsObjet(contenu);
    case 'logement':
      return corpsLogement(contenu);
    case 'parties':
      return corpsParties(contenu);
    case 'bail':
      return corpsBail(contenu);
    case 'mobilier_legal':
      return corpsMobilierLegal(contenu);
    case 'pieces':
      return corpsPieces(contenu);
    case 'observations':
      return corpsObservations(contenu);
    case 'vetuste':
      return corpsVetuste(PHRASE_VETUSTE_INVENTAIRE);
    case 'synthese':
      return corpsSynthese(contenu);
    case 'signatures':
      return corpsSignatures(contenu);
    case 'sources':
      return corpsSources(SOURCES_INVENTAIRE);
    case 'reference_entree':
      return corpsReferenceEntree(contenu);
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

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

/**
 * Le contenu imprimé, assemblé depuis ce que le domaine porte.
 *
 * L'ordre des signataires est celui du bail : le bailleur, puis chaque locataire
 * dans l'ordre enregistré, puis le mandataire s'il y en a un. C'est le même
 * ordre que celui du bail et de l'état des lieux, et il est construit de la même
 * façon — un document se signe de la même manière, quelle que soit sa nature.
 */
export function contenuInventaireDepuis(params: {
  type: TypeInventaire;
  dateInventaire: string;
  etabliLe: string;
  lieu?: string;
  logement: LogementBail;
  bailleur: PartieBailleur;
  locataires: PartieLocataire[];
  /** Identifiants des locataires, dans le même ordre que `locataires`. */
  locatairesIds?: string[];
  mandataire?: string;
  bail: BailImprime;
  pieces?: PieceInventaire[];
  observations?: string;
  signatures?: Signature[];
  meuble?: boolean;
  dateEntree?: string;
  comparaison?: ComparaisonInventaire;
  photos?: PhotosImprimables;
  /** Les photos de l'entrée, indexées séparément de celles de la sortie. */
  photosEntree?: PhotosImprimables;
  reserves?: string[];
}): ContenuInventaire {
  const locataires = params.locataires;
  const ids = params.locatairesIds ?? locataires.map((_, index) => `titulaire-${index + 1}`);

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
    dateInventaire: params.dateInventaire,
    etabliLe: params.etabliLe,
    lieu: params.lieu?.trim() ?? '',
    logement: params.logement,
    bailleur: params.bailleur,
    locataires,
    mandataire,
    bail: params.bail,
    pieces: params.pieces ?? [],
    observations: params.observations ?? '',
    signatures: params.signatures ?? [],
    signataires,
    meuble: params.meuble === true,
    dateEntree: params.dateEntree,
    comparaison: params.comparaison,
    photos: params.photos ?? {},
    photosEntree: params.photosEntree,
    reserves: params.reserves ?? [],
  };
}

/**
 * Le document complet, prêt à imprimer.
 *
 * Les sections sont numérotées par leur **rang d'impression**, et non par leur
 * rang dans la liste du domaine : un inventaire de sortie en compte deux de plus
 * qu'un inventaire d'entrée, et une numérotation figée aurait laissé un trou au
 * milieu du document.
 */
export function rendreInventaire(contenu: ContenuInventaire): string {
  const sections = sectionsInventaire(contenu.type)
    .map((s, index) => section(index + 1, s.titre, corpsDeSection(s.valeur, contenu)))
    .join('');

  const reserves = contenu.reserves.length
    ? `<p class="e-mention">${contenu.reserves.map((r) => echapper(r)).join('<br />')}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${echapper(LIBELLE_TYPE_INVENTAIRE[contenu.type])} — ${echapper(contenu.logement.nom)}</title>
<style>${STYLES_BASE}${STYLES_INVENTAIRE}</style>
</head>
<body>
  <div class="page">

    <div class="e-bandeau">
      <div>
        <h1>${echapper(LIBELLE_TYPE_INVENTAIRE[contenu.type])}</h1>
        <div class="e-sous-titre">${echapper(contenu.logement.nom)}${
          contenu.lieu ? ` — établi à ${echapper(contenu.lieu)}` : ''
        }</div>
      </div>
      <div class="e-etabli">Établi le<br />${echapper(dateFr(contenu.etabliLe))}</div>
    </div>

    ${sections}
    ${reserves}

  </div>
</body>
</html>`;
}

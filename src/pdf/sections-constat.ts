/**
 * Les sections qu'un état des lieux et un inventaire du mobilier impriment de
 * la même façon.
 *
 * Un document de constat a une charpente : il nomme le logement, les parties, le
 * bail, les observations, les signatures et ses sources. Écrire deux fois ces
 * huit sections aurait produit deux documents qui se ressemblent au début et qui
 * divergent au premier correctif — et la section des signatures est précisément
 * celle où une divergence coûte cher : elle apparie chaque signature à son
 * signataire **par identifiant**, jamais par rang.
 *
 * Ce qui reste propre à chaque document : ce qu'il constate (des éléments ou des
 * meubles), sa synthèse, sa phrase de vétusté, et sa liste de sources. Ce module
 * ne les connaît pas.
 *
 * Module **pur** : ni SQLite, ni React, ni `expo-print`.
 */

import { formatMontant } from '../domain/money.ts';
import type { Signature } from '../domain/signature.ts';
import { adresseEnLignes } from '../domain/types.ts';
import { rendrePhoto } from './constats.ts';
import type { PhotoImprimable, PhotosImprimables } from './constats.ts';
import { echapper } from './styles.ts';
import { MENTION_SIGNATURE } from './bail.ts';
import type { LogementBail, PartieBailleur, PartieLocataire } from './bail.ts';

/**
 * Qui doit signer, et sous quel nom la signature s'imprime.
 *
 * C'est une **liste**, et non un rang calculé à l'impression. La première
 * version du rendu appariait les signatures par position — la première sous le
 * bailleur, la suivante sous le premier locataire — ce qui plaçait la signature
 * d'un colocataire sous le nom de l'autre dès qu'une signature manquait ou
 * arrivait dans un autre ordre. Un document qui attribue une signature à la
 * mauvaise personne est faux, et c'est la faute la plus grave que ce module
 * puisse commettre.
 */
export interface SignataireImprime {
  id: string;
  nom: string;
  role: string;
}

// ---------------------------------------------------------------------------
// Petites pièces d'assemblage
// ---------------------------------------------------------------------------

/** Une ligne d'un tableau à deux colonnes : un intitulé, une valeur. */
export function ligne(libelle: string, valeur: string): string {
  return `<tr><th>${echapper(libelle)}</th><td>${valeur}</td></tr>`;
}

/** Une section numérotée. Le numéro aide à vérifier qu'aucune ne manque. */
export function section(rang: number, titre: string, corps: string): string {
  return `<section class="e-section">
    <h2><span class="e-numero">${rang}.</span> ${echapper(titre)}</h2>
    ${corps}
  </section>`;
}

/** « 15 septembre 2026 » à partir de `2026-09-15`. */
export function dateFr(valeur: string | null | undefined): string {
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

// ---------------------------------------------------------------------------
// Les sections communes
// ---------------------------------------------------------------------------

export function corpsLogement(contenu: { logement: LogementBail }): string {
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

export function corpsParties(contenu: {
  bailleur: PartieBailleur;
  locataires: PartieLocataire[];
  mandataire: string;
}): string {
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

export interface BailImprime {
  dateEntree: string;
  dateSortie?: string | null;
  loyer: number;
  charges: number;
  depotGarantie: number;
  jourEcheance: number;
}

export function corpsBail(contenu: { bail: BailImprime }): string {
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

export function corpsObservations(contenu: {
  observations: string;
  reserves: string[];
}): string {
  const texte = contenu.observations.trim();
  const reserves =
    contenu.reserves.length > 0
      ? `<ul class="e-liste">${contenu.reserves.map((r) => `<li>${echapper(r)}</li>`).join('')}</ul>`
      : '';
  return `${texte ? `<p class="e-texte-libre">${echapper(texte)}</p>` : '<p class="e-vide">Aucune observation générale n’a été saisie.</p>'}
    ${reserves}`;
}

/**
 * La section de vétusté : la définition, puis la phrase propre au document.
 *
 * La définition est la même pour les deux documents, et c'est normal : c'est
 * l'article 4 du décret n° 2016-382, recopié. La phrase qui suit, elle, nomme le
 * document — un inventaire ne « constate » pas l'état des lieux.
 */
export function corpsVetuste(phraseSurLeDocument: string): string {
  return `<p class="e-texte-libre">La vétusté s’entend comme l’état d’usure ou de détérioration résultant
du temps ou de l’usage normal des matériaux et éléments d’équipement du logement.</p>
  <p class="e-mention">${phraseSurLeDocument}</p>`;
}

/**
 * Les signatures, chacune sous son signataire.
 *
 * L'appariement se fait **par identifiant**, jamais par rang : deux colocataires
 * dont un seul a signé ne doivent pas se retrouver avec la signature de l'autre.
 * Un signataire attendu qui n'a pas signé figure quand même, avec la mention
 * « Non signé » — c'est une information, pas un oubli.
 *
 * C'est la règle la plus coûteuse à écrire deux fois : un document qui attribue
 * une signature à la mauvaise personne est faux.
 */
export function corpsSignatures(contenu: {
  signataires: SignataireImprime[];
  signatures: Signature[];
}): string {
  const blocs = contenu.signataires
    .map((attendu) => ({
      nom: attendu.nom,
      role: attendu.role,
      signature: contenu.signatures.find((s) => s.signataire === attendu.id && s.trace.length > 0),
    }))
    .filter((b) => b.nom.trim().length > 0);

  // Aucun signataire attendu : le document le dit, plutôt que d'afficher une
  // zone vide qui laisserait croire à un défaut d'affichage.
  if (blocs.length === 0) {
    return `<p class="e-vide">Aucun signataire n’est identifié sur ce document.</p>`;
  }

  return `<div class="e-signatures">${blocs
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
}

/** Les sources : chaque document imprime les siennes. */
export function corpsSources(
  sources: readonly { reference: string; consulteLe: string }[],
): string {
  return `<ul class="e-sources">${sources
    .map((s) => `<li>${echapper(s.reference)} — consulté le ${echapper(dateFr(s.consulteLe))}</li>`)
    .join('')}</ul>`;
}

/**
 * La ligne « Exemplaires » d'un document, et le nombre de parties.
 *
 * L'article 3-2 de la loi du 6 juillet 1989 demande un document « en autant
 * d'exemplaires que de parties ». Le bailleur en garde toujours un ; chaque
 * locataire en reçoit un. Le compte est le même pour les deux documents, et
 * l'écrire deux fois finirait par donner deux règles.
 */
export function exemplairesEnLigne(nombreLocataires: number): string {
  const nombreParties = 1 + nombreLocataires;
  return (
    `${nombreParties} — un pour le bailleur, un pour chacun des ` +
    `${nombreLocataires} locataire(s)`
  );
}

// ---------------------------------------------------------------------------
// La mise en regard de deux constats : avant / après
// ---------------------------------------------------------------------------

/** Les noms de classes employés pour une paire avant/après. */
export interface ClassesPaire {
  piece: string;
  titre: string;
  colonnes: string;
  colonne: string;
  etiquette: string;
  sans: string;
  note: string;
}

/**
 * Les noms de classes employés pour une paire avant/après.
 *
 * Ils sont **communs aux deux constats**, et c'est voulu : une paire entrée /
 * sortie se présente de la même façon qu'elle porte sur un mur ou sur une
 * commode. Le conteneur d'une pièce comparée, lui, reste propre à chaque
 * document — c'est la classe `piece` du bloc qui l'entoure, pas de la paire.
 */
export const CLASSES_PAIRE_DEFAUT: ClassesPaire = {
  piece: 'e-paire',
  titre: 'e-paire-titre',
  colonnes: 'e-paire-colonnes',
  colonne: 'e-paire-colonne',
  etiquette: 'e-paire-etiquette',
  sans: 'e-paire-sans',
  note: 'e-evol-note',
};

/**
 * Une colonne d'une paire avant/après.
 *
 * La colonne porte son propre intitulé — « Entrée du 12 mars 2026 » — et non un
 * simple « Avant » : deux photos de la même pièce prises à des années
 * d'intervalle se distinguent par leur date, et une paire sans date ne dit pas
 * au lecteur laquelle des deux est l'entrée.
 */
export function colonneDePaire(
  etiquette: string,
  condition: string,
  photos: PhotoImprimable[],
  classes: ClassesPaire = CLASSES_PAIRE_DEFAUT,
): string {
  const rendues = photos.map((p) => rendrePhoto(p)).filter((h) => h.length > 0).join('');
  return `<div class="${classes.colonne}">
    <p class="${classes.etiquette}">${echapper(etiquette)} — ${echapper(condition)}</p>
    ${rendues || `<p class="${classes.sans}">Aucune photo</p>`}
  </div>`;
}

/** Un côté d'une paire : son intitulé, sa condition, ses photos et son index. */
export interface CoteDePaire {
  /** « Entrée du 12 mars 2026 », « Sortie du 4 février 2027 ». */
  etiquette: string;
  /** « Bon état », « 4 × — Bon état ». */
  condition: string;
  /** Les identifiants des photos de ce côté. */
  ids: string[];
  /** **L'index de ce côté**, et non un index commun aux deux. */
  index: PhotosImprimables;
}

/**
 * Une paire avant / après, pour un objet constaté.
 *
 * Les photos viennent de **deux index distincts** — celles de l'entrée et
 * celles du constat qu'on lit — et ne peuvent pas être confondues : les deux
 * documents numérotent leurs photos `ph1`, `ph2`… si bien qu'un index unique
 * ferait imprimer la photo de l'entrée à la place de celle de la sortie, dans
 * la colonne « après ». C'est un document faux qu'aucun contrôle de texte ne
 * verrait : seule une mesure de pixels distingue deux images de la même image
 * dessinée deux fois.
 *
 * C'est pourquoi chaque côté porte **son propre index**, et non une liste de
 * photos déjà résolues : l'appelant ne peut pas se tromper d'index.
 */
export function paireEnHtml(params: {
  titre: string;
  entree: CoteDePaire;
  sortie: CoteDePaire;
  classes?: ClassesPaire;
}): string {
  const classes = params.classes ?? CLASSES_PAIRE_DEFAUT;
  const resoudre = (cote: CoteDePaire): PhotoImprimable[] =>
    cote.ids.map((id) => cote.index[id]).filter((p): p is PhotoImprimable => p !== undefined);

  return `<div class="${classes.piece}">
    <p class="${classes.titre}">${echapper(params.titre)}</p>
    <div class="${classes.colonnes}">
      ${colonneDePaire(params.entree.etiquette, params.entree.condition, resoudre(params.entree), classes)}
      ${colonneDePaire(params.sortie.etiquette, params.sortie.condition, resoudre(params.sortie), classes)}
    </div>
  </div>`;
}

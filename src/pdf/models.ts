/**
 * Contenu des documents : structure commune, puis deux modèles.
 *
 * On sépare nettement le contenu de la présentation :
 *  - `ContenuDocument` décrit ce qui doit figurer sur le papier ;
 *  - chaque modèle décide de la mise en page.
 *
 * Les deux modèles partagent les mêmes informations. Aucun des deux ne cache
 * une mention légale : le choix porte sur l'esthétique, jamais sur le fond.
 */

import { formatMontant } from '../domain/money';
import { LIBELLE_DOCUMENT, type TypeDocument } from '../domain/types';
import {
  avertissement,
  RAPPEL_LOCATAIRE,
  REFERENCE_DECRET_2015,
  REFERENCE_LOI_1989,
  mentionAvisEcheance,
  mentionQuittance,
  mentionRecu,
} from './legal';
import { COULEURS_DOCUMENT, echapper, STYLES_BASE } from './styles';

/** Tout ce qui est imprimé sur un document. */
export interface ContenuDocument {
  type: TypeDocument;
  numero: string;
  periodeLibelle: string;
  dateEmission: string;

  emetteur: {
    nom: string;
    civilite: string;
    adresse: string[];
    qualite?: string | null;
    telephone?: string | null;
    email?: string | null;
    siret?: string | null;
  };

  locataires: string[];
  logement: {
    nom: string;
    adresse: string[];
  };

  montants: {
    loyer: number;
    charges: number;
    total: number;
  };

  /** Somme effectivement reçue, pour une quittance ou un reçu. */
  montantRecu: number;
  /** Dates réelles des encaissements, mises en forme. */
  datesPaiement: string[];
  modesPaiement: string[];

  /** Avis d'échéance uniquement. */
  dateEcheance: string;

  lieuEmission: string;
  signatureBase64: string | null;
  mentionLibre: string;
  /** Séparer loyer et charges dans le tableau des montants. */
  mentionCharges: boolean;
}

/** Date d'émission du jour, mise en forme. */
function mentionReconnaissance(contenu: ContenuDocument): string {
  const locataires = contenu.locataires.join(' et ');

  if (contenu.type === 'quittance') {
    return mentionQuittance({
      periodeLibelle: contenu.periodeLibelle,
      total: formatMontant(contenu.montants.total),
      locataires: locataires || 'le locataire',
    });
  }

  if (contenu.type === 'recu') {
    const restant = Math.max(0, contenu.montants.total - contenu.montantRecu);
    return mentionRecu({
      periodeLibelle: contenu.periodeLibelle,
      montantRecu: formatMontant(contenu.montantRecu),
      montantDu: formatMontant(contenu.montants.total),
      montantRestant: formatMontant(restant),
    });
  }

  return mentionAvisEcheance({
    periodeLibelle: contenu.periodeLibelle,
    total: formatMontant(contenu.montants.total),
    echeance: contenu.dateEcheance,
  });
}

/** Tableau des montants, avec loyer et charges séparés. */
function tableauMontants(contenu: ContenuDocument): string {
  const { montants, mentionCharges } = contenu;

  const ligneCharges =
    mentionCharges && montants.charges > 0
      ? `<tr>
           <td>Charges (provision)</td>
           <td class="montant">${echapper(formatMontant(montants.charges))}</td>
         </tr>`
      : '';

  const total = `
    <tr class="total">
      <td>${echapper(montants.charges > 0 && mentionCharges ? 'Total loyer et charges' : 'Total')}</td>
      <td class="montant">${echapper(formatMontant(montants.total))}</td>
    </tr>`;

  return `
    <table class="montants">
      <thead>
        <tr>
          <th>Désignation</th>
          <th class="montant">Montant</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Loyer${montants.charges > 0 && mentionCharges ? ' hors charges' : ''}</td>
          <td class="montant">${echapper(formatMontant(montants.loyer))}</td>
        </tr>
        ${ligneCharges}
        ${total}
      </tbody>
    </table>
  `;
}

/** Détail des encaissements, imprimé après le tableau. */
function detailPaiements(contenu: ContenuDocument): string {
  if (contenu.datesPaiement.length === 0) return '';

  const lignes = contenu.datesPaiement
    .map((date, index) => {
      const mode = contenu.modesPaiement[index];
      return `<div class="ligne-paiement">Reçu le ${echapper(date)}${mode ? ` — ${echapper(mode)}` : ''}</div>`;
    })
    .join('');

  return `
    <div>
      <div class="detail-ligne" style="margin-bottom: 1.5mm;">
        Date${contenu.datesPaiement.length > 1 ? 's' : ''} de paiement
      </div>
      ${lignes}
    </div>
  `;
}

/** Bloc de signature, avec ou sans image. */
function blocSignature(contenu: ContenuDocument, couleurTrait: string): string {
  if (!contenu.signatureBase64) return '';

  return `
    <div class="signature">
      <div class="bloc">
        <div class="etiquette">Signature du bailleur</div>
        <img src="${contenu.signatureBase64}" alt="Signature du bailleur" />
        <div style="font-size: 9pt; color: #666666; margin-top: 2mm;">
          ${echapper(contenu.emetteur.nom)}
        </div>
      </div>
    </div>
  `;
}

/** Pied de page : lieu, date, rappel et références. */
function piedDePage(contenu: ContenuDocument): string {
  const lieu = contenu.lieuEmission ? `${echapper(contenu.lieuEmission)}, ` : '';
  const references =
    contenu.type === 'quittance'
      ? REFERENCE_LOI_1989
      : contenu.type === 'recu'
        ? REFERENCE_DECRET_2015
        : '';

  return `
    <div class="pied">
      <div style="margin-bottom: 1.5mm;">
        ${lieu}le ${echapper(contenu.dateEmission)} — Document n° ${echapper(contenu.numero)}
      </div>
      <div>${echapper(RAPPEL_LOCATAIRE)}</div>
      ${references ? `<div style="margin-top: 1.5mm;">${echapper(references)}</div>` : ''}
    </div>
  `;
}

/** Bandeau d'avertissement, présent sur les reçus et avis d'échéance. */
function bandeauAvertissement(contenu: ContenuDocument): string {
  const texte = avertissement(contenu.type);
  if (!texte) return '';

  const fond =
    contenu.type === 'recu'
      ? COULEURS_DOCUMENT.orangeTresClair
      : COULEURS_DOCUMENT.principaleTresClaire;
  const bord =
    contenu.type === 'recu' ? COULEURS_DOCUMENT.orange : COULEURS_DOCUMENT.principale;

  return `
    <div class="avertissement" style="background-color: ${fond}; border-left: 3px solid ${bord};">
      ${echapper(texte)}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Modèle 1 : classique et professionnel
// ---------------------------------------------------------------------------

export function rendreModeleClassique(contenu: ContenuDocument): string {
  const couleur = COULEURS_DOCUMENT.texte;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${echapper(LIBELLE_DOCUMENT[contenu.type])} ${echapper(contenu.periodeLibelle)}</title>
<style>${STYLES_BASE}</style>
</head>
<body>
  <div class="page">

    <div class="entete">
      <div class="emetteur">
        <p class="nom">${echapper(contenu.emetteur.nom)}</p>
        ${contenu.emetteur.qualite ? `<p class="ligne">${echapper(contenu.emetteur.qualite)}</p>` : ''}
        ${contenu.emetteur.adresse.map((l) => `<p class="ligne">${echapper(l)}</p>`).join('')}
        ${contenu.emetteur.telephone ? `<p class="ligne">Tél. ${echapper(contenu.emetteur.telephone)}</p>` : ''}
        ${contenu.emetteur.email ? `<p class="ligne">${echapper(contenu.emetteur.email)}</p>` : ''}
        ${contenu.emetteur.siret ? `<p class="ligne">SIRET ${echapper(contenu.emetteur.siret)}</p>` : ''}
      </div>

      <div class="document-meta">
        <div class="numero">N° ${echapper(contenu.numero)}</div>
        <div>Émis le ${echapper(contenu.dateEmission)}</div>
        ${contenu.lieuEmission ? `<div>${echapper(contenu.lieuEmission)}</div>` : ''}
      </div>
    </div>

    <div class="titre-document">
      <h1>${echapper(LIBELLE_DOCUMENT[contenu.type])}</h1>
      <div class="periode">Période : ${echapper(contenu.periodeLibelle)}</div>
    </div>

    <div class="parties">
      <div class="partie">
        <div class="etiquette">Bailleur</div>
        <div class="valeur">
          <strong>${echapper(contenu.emetteur.nom)}</strong><br />
          ${contenu.emetteur.adresse.map((l) => echapper(l)).join('<br />')}
        </div>
      </div>

      <div class="partie">
        <div class="etiquette">Locataire${contenu.locataires.length > 1 ? 's' : ''}</div>
        <div class="valeur">
          ${contenu.locataires.map((l) => `<strong>${echapper(l)}</strong>`).join('<br />')}
        </div>
      </div>
    </div>

    <div class="partie" style="margin-bottom: 6mm;">
      <div class="etiquette">Logement concerné</div>
      <div class="valeur">
        ${echapper(contenu.logement.nom)}<br />
        ${contenu.logement.adresse.map((l) => echapper(l)).join('<br />')}
      </div>
    </div>

    ${tableauMontants(contenu)}

    ${detailPaiements(contenu)}

    <div class="reconnaissance" style="background-color: #F7F7F7; border: 1px solid #E5E5E5;">
      ${echapper(mentionReconnaissance(contenu))}
    </div>

    ${bandeauAvertissement(contenu)}

    ${contenu.mentionLibre ? `<div class="mention-libre">${echapper(contenu.mentionLibre)}</div>` : ''}

    ${blocSignature(contenu, couleur)}

    ${piedDePage(contenu)}
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Modèle 2 : moderne et épuré
// ---------------------------------------------------------------------------

export function rendreModeleModerne(contenu: ContenuDocument): string {
  const accent = COULEURS_DOCUMENT.principale;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${echapper(LIBELLE_DOCUMENT[contenu.type])} ${echapper(contenu.periodeLibelle)}</title>
<style>
${STYLES_BASE}

  /* Variante moderne : bandeau de couleur, blocs arrondis, plus d'air. */
  .bandeau {
    background-color: ${accent};
    color: #FFFFFF;
    border-radius: 4mm;
    padding: 8mm;
    margin-bottom: 8mm;
  }

  .bandeau .etiquette-type {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 1.2pt;
    opacity: 0.85;
    margin: 0 0 2mm 0;
  }

  .bandeau h1 {
    font-size: 22pt;
    font-weight: 700;
    margin: 0 0 3mm 0;
    letter-spacing: -0.3pt;
  }

  .bandeau .periode {
    font-size: 11.5pt;
    opacity: 0.95;
    margin: 0;
  }

  .bandeau .numero {
    font-size: 9pt;
    opacity: 0.8;
    margin-top: 4mm;
  }

  .carte-info {
    background-color: #F7F9F8;
    border-radius: 3mm;
    padding: 5mm;
    margin-bottom: 5mm;
  }

  .carte-info .etiquette {
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.6pt;
    color: #777777;
    margin-bottom: 1.5mm;
  }

  .carte-info .valeur {
    font-size: 11pt;
    line-height: 1.5;
  }

  .montant-mis-en-avant {
    background-color: ${COULEURS_DOCUMENT.principaleTresClaire};
    border-radius: 3mm;
    padding: 6mm;
    margin: 6mm 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .montant-mis-en-avant .etiquette {
    font-size: 10pt;
    color: ${COULEURS_DOCUMENT.principaleFonce};
  }

  .montant-mis-en-avant .montant {
    font-size: 20pt;
    font-weight: 700;
    color: ${COULEURS_DOCUMENT.principaleFonce};
  }

  .reconnaissance {
    background-color: #FFFFFF;
    border-left: 3px solid ${accent};
  }

  .deux-colonnes {
    display: flex;
    gap: 5mm;
    margin-bottom: 5mm;
  }

  .deux-colonnes > * {
    flex: 1;
  }
</style>
</head>
<body>
  <div class="page">

    <div class="bandeau">
      <p class="etiquette-type">${echapper(LIBELLE_DOCUMENT[contenu.type])}</p>
      <h1>${echapper(contenu.periodeLibelle)}</h1>
      <p class="periode">${echapper(contenu.logement.nom)}</p>
      <p class="numero">Document n° ${echapper(contenu.numero)} — émis le ${echapper(contenu.dateEmission)}</p>
    </div>

    <div class="deux-colonnes">
      <div class="carte-info">
        <div class="etiquette">Bailleur</div>
        <div class="valeur">
          <strong>${echapper(contenu.emetteur.nom)}</strong><br />
          ${contenu.emetteur.adresse.map((l) => echapper(l)).join('<br />')}
          ${contenu.emetteur.telephone ? `<br />Tél. ${echapper(contenu.emetteur.telephone)}` : ''}
        </div>
      </div>

      <div class="carte-info">
        <div class="etiquette">Locataire${contenu.locataires.length > 1 ? 's' : ''}</div>
        <div class="valeur">
          ${contenu.locataires.map((l) => `<strong>${echapper(l)}</strong>`).join('<br />')}
        </div>
      </div>
    </div>

    <div class="carte-info">
      <div class="etiquette">Adresse du logement</div>
      <div class="valeur">
        ${contenu.logement.adresse.map((l) => echapper(l)).join('<br />')}
      </div>
    </div>

    <div class="montant-mis-en-avant">
      <div class="etiquette">
        ${contenu.type === 'recu' ? 'Montant reçu' : contenu.type === 'quittance' ? 'Total réglé' : 'Montant dû'}
      </div>
      <div class="montant">
        ${echapper(formatMontant(contenu.type === 'recu' ? contenu.montantRecu : contenu.montants.total))}
      </div>
    </div>

    ${tableauMontants(contenu)}

    ${detailPaiements(contenu)}

    <div class="reconnaissance">
      ${echapper(mentionReconnaissance(contenu))}
    </div>

    ${bandeauAvertissement(contenu)}

    ${contenu.mentionLibre ? `<div class="mention-libre">${echapper(contenu.mentionLibre)}</div>` : ''}

    ${blocSignature(contenu, accent)}

    ${piedDePage(contenu)}
  </div>
</body>
</html>`;
}

/** Rend le contenu selon le modèle demandé. */
export function rendreHtml(
  contenu: ContenuDocument,
  modele: 'classique' | 'moderne',
): string {
  return modele === 'moderne'
    ? rendreModeleModerne(contenu)
    : rendreModeleClassique(contenu);
}

/**
 * Contenu des documents : structure commune, puis trois modèles.
 *
 * On sépare nettement le contenu de la présentation :
 *  - `ContenuDocument` décrit ce qui doit figurer sur le papier ;
 *  - chaque modèle décide de la mise en page.
 *
 * Les trois modèles partagent les mêmes informations. Aucun ne cache une
 * mention légale : le choix porte sur l'esthétique, jamais sur le fond.
 */

// Les chemins portent l'extension `.ts`, comme dans `src/domain` : le rendu
// HTML est ainsi exécutable par `node --test`, sans émulateur ni transpileur.
import { formatMontant } from '../domain/money.ts';
import type { PaiementImprime } from '../domain/payments.ts';
import {
  LIBELLE_DOCUMENT,
  type ModelePropose,
  type TypeDocument,
} from '../domain/types.ts';
import {
  avertissement,
  RAPPEL_LOCATAIRE,
  REFERENCE_DECRET_2015,
  REFERENCE_LOI_1989,
  mentionAvisEcheance,
  mentionQuittance,
  mentionRecu,
} from './legal.ts';
import { COULEURS_DOCUMENT, echapper, STYLES_BASE } from './styles.ts';
import { COULEURS_COLORE, STYLES_COLORE } from './styles-colore.ts';

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
  /**
   * Encaissements à imprimer : une entrée par date, chacune portant ses propres
   * modes de paiement.
   *
   * Une seule liste, et non deux en parallèle : deux listes dédoublonnées
   * séparément ne s'apparient pas, et le document finissait par nommer un mode
   * de paiement qui n'était pas celui de l'encaissement — mesuré par
   * `.verif/eprouver-paiements.py`. L'appariement est fait une fois, dans
   * `paiementsImprimes` (`domain/payments.ts`).
   */
  paiements: PaiementImprime[];

  /** Date d'exigibilité du loyer du mois, mise en forme : « 05/08/2026 ». */
  dateEcheance: string;

  /** Bornes de la période, mises en forme : « 01/08/2026 », « 31/08/2026 ». */
  periodeDebut: string;
  periodeFin: string;
  /** Même date d'exigibilité en clair, pour le talon : « 5 août 2026 ». */
  echeanceLibelle: string;
  /**
   * Reste à percevoir sur la période, en centimes.
   *
   * C'est la seule source du tampon — « Payé » ou « Reste à payer » — quel que
   * soit le modèle : le document ne peut donc pas affirmer un paiement que la
   * base ne porte pas.
   */
  resteAPercevoir: number;

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
    // Le reste est **lu**, jamais recalculé : `resteAPercevoir` est la décision
    // du domaine, et la seule source de l'onglet comme du tampon. Une seconde
    // soustraction donnerait aujourd'hui le même chiffre, puis divergerait en
    // silence le jour où le solde se calcule autrement — le texte du reçu
    // annoncerait alors un reste, le tampon un autre.
    return mentionRecu({
      periodeLibelle: contenu.periodeLibelle,
      montantRecu: formatMontant(contenu.montantRecu),
      montantDu: formatMontant(contenu.montants.total),
      montantRestant: formatMontant(contenu.resteAPercevoir),
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

/**
 * Détail des encaissements, imprimé après le tableau.
 *
 * Les encaissements **coulent** dans un même paragraphe au lieu d'occuper
 * chacun sa ligne. Une ligne par encaissement coûtait 6,28 mm — mesuré le
 * 23 septembre 2026 par `.verif/mesurer-debordement.py` — alors que la part
 * fixe du document en pèse déjà 245 : dès le huitième encaissement, la
 * quittance passait sur une seconde feuille, et une impression coupait le
 * document en deux. Aucun resserrement de marge ne pouvait le corriger, la
 * place manquant étant celle des lignes elles-mêmes.
 *
 * Le texte imprimé est **le même** : chaque date garde ses propres modes, dans
 * le même ordre. Seul le retour à la ligne disparaît, et le paragraphe se
 * replie de lui-même. La garde qui vérifie l'appariement lit désormais le
 * document en continu plutôt que ligne à ligne — voir
 * `.verif/eprouver-paiements.py` — et l'assertion n'est pas plus faible : elle
 * exige la suite exacte, mot pour mot.
 */
function detailPaiements(contenu: ContenuDocument): string {
  if (contenu.paiements.length === 0) return '';

  // Chaque ligne tient sa date et ses modes du **même** objet : il n'y a plus
  // d'indice à faire coïncider, donc plus de décalage possible.
  const lignes = contenu.paiements
    .map((paiement) => {
      const modes = paiement.modes.map((m) => echapper(m)).join(', ');
      const suffixe = modes.length > 0 ? ` — ${modes}` : '';
      return `<span class="ligne-paiement">Reçu le ${echapper(paiement.date)}${suffixe}</span>`;
    })
    .join('<span class="separateur-paiement"> ; </span>');

  return `
    <div class="detail-paiements">
      <span class="detail-ligne">Date${contenu.paiements.length > 1 ? 's' : ''} de paiement : </span>${lignes}
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

  /*
   * Variante moderne : bandeau de couleur, blocs arrondis, plus d'air.
   *
   * Le bandeau pesait 47,41 mm — mesure du 23 septembre 2026 — et c'est lui
   * qui faisait passer la quittance sur une seconde feuille des le seizieme
   * encaissement, alors que le modele classique tenait les vingt. Un titre de
   * 18 pt reste un titre : c'est le blanc autour qui cede, pas la lisibilite.
   */
  .bandeau {
    background-color: ${accent};
    color: #FFFFFF;
    border-radius: 4mm;
    padding: 3mm;
    margin-bottom: 3mm;
  }

  .bandeau .etiquette-type {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 1.2pt;
    opacity: 0.85;
    margin: 0 0 2mm 0;
  }

  .bandeau h1 {
    font-size: 18pt;
    font-weight: 700;
    margin: 0 0 2mm 0;
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
    margin-top: 2mm;
  }

  .carte-info {
    background-color: #F7F9F8;
    border-radius: 3mm;
    padding: 2.5mm;
    margin-bottom: 2mm;
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
    padding: 3mm;
    margin: 3mm 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .montant-mis-en-avant .etiquette {
    font-size: 10pt;
    color: ${COULEURS_DOCUMENT.principaleFonce};
  }

  .montant-mis-en-avant .montant {
    font-size: 17pt;
    font-weight: 700;
    color: ${COULEURS_DOCUMENT.principaleFonce};
  }

  .reconnaissance {
    background-color: #FFFFFF;
    border-left: 3px solid ${accent};
  }

  .deux-colonnes {
    display: flex;
    gap: 4mm;
    margin-bottom: 3mm;
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

// ---------------------------------------------------------------------------
// Modèle 3 : coloré et convivial
// ---------------------------------------------------------------------------

/**
 * Une carte d'identité colorée : le bailleur, le locataire, ou le logement.
 *
 * Le même bloc sert les trois, avec une variante de couleur. Les dupliquer
 * aurait laissé trois mises en forme divergentes le jour où l'une bouge.
 */
function carteColore(params: {
  /** `cc-locataire` change la teinte ; vide pour la couleur principale. */
  variante: string;
  etiquette: string;
  /** Lignes déjà échappées, la première en gras. */
  lignes: string[];
  /** Passe la carte sur toute la largeur au lieu de partager la ligne. */
  pleineLargeur?: boolean;
}): string {
  const [premiere, ...suivantes] = params.lignes;

  // Le blanc sous la carte pleine largeur est ecrit ici, et non dans la feuille
  // de style : seule cette variante le porte, et une classe de plus pour une
  // seule regle couterait plus cher qu'elle ne rapporte. Il est passe de 4 mm a
  // 3 mm avec le reste du modele, apres la mesure de 326,23 mm pour 297,39.
  return `
    <div class="${['cc-carte', params.variante].filter(Boolean).join(' ')}"${params.pleineLargeur ? ' style="margin-bottom: 3mm;"' : ''}>
      <div class="cc-etiquette">${echapper(params.etiquette)}</div>
      <div class="cc-valeur">
        <strong>${premiere ?? ''}</strong>
        ${suivantes.map((l) => `<br />${l}`).join('')}
      </div>
    </div>
  `;
}

/**
 * Tableau des montants du modèle coloré.
 *
 * Mêmes chiffres que les autres modèles, et mêmes règles : les charges ne
 * figurent que si le bailleur a choisi de les séparer **et** qu'il y en a. La
 * ligne de total est mise en avant, parce que c'est le montant qu'on vient
 * chercher.
 */
function tableauMontantsColore(contenu: ContenuDocument): string {
  const { montants, mentionCharges } = contenu;
  const separe = mentionCharges && montants.charges > 0;

  const ligneCharges = separe
    ? `<tr class="cc-pair">
         <td>Charges (provision)</td>
         <td class="cc-montant">${echapper(formatMontant(montants.charges))}</td>
       </tr>`
    : '';

  return `
    <table class="cc-tableau">
      <thead>
        <tr>
          <th>Désignation</th>
          <th class="cc-montant">Montant</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Loyer${separe ? ' hors charges' : ''}</td>
          <td class="cc-montant">${echapper(formatMontant(montants.loyer))}</td>
        </tr>
        ${ligneCharges}
        <tr class="cc-total">
          <td>${echapper(separe ? 'Total loyer et charges' : 'Total')}</td>
          <td class="cc-montant">${echapper(formatMontant(montants.total))}</td>
        </tr>
      </tbody>
    </table>
  `;
}

/**
 * Détail des encaissements, en puces colorées.
 *
 * Le paragraphe se replie de lui-même, comme dans les autres modèles : c'est
 * ce qui permet à vingt encaissements de tenir sans pousser le document sur une
 * seconde feuille. La puce est décorative ; chaque entrée garde sa date et ses
 * propres modes, dans le même ordre.
 */
function detailPaiementsColore(contenu: ContenuDocument): string {
  if (contenu.paiements.length === 0) return '';

  const entrees = contenu.paiements
    .map((paiement) => {
      const modes = paiement.modes.map((m) => echapper(m)).join(', ');
      const suffixe = modes.length > 0 ? ` — ${modes}` : '';
      return `<span class="ligne-paiement">Reçu le ${echapper(paiement.date)}${suffixe}</span>`;
    })
    .join('<span class="separateur-paiement"> ; </span>');

  return `
    <div class="cc-paiements">
      <div class="cc-paiements-titre">
        ${contenu.paiements.length > 1
          ? `${contenu.paiements.length} encaissements`
          : 'Encaissement'}
      </div>
      <span class="cc-puce">●</span> ${entrees}
    </div>
  `;
}

/**
 * Modèle coloré et convivial.
 *
 * Il ne reproduit aucun papier existant : c'est une présentation choisie. Il
 * porte donc **tout** ce que portent les autres — les deux parties, l'adresse
 * du logement, le détail des montants, les encaissements, la mention légale,
 * les références, le rappel au locataire et la signature. Le choix du modèle ne
 * retire jamais une information : c'est la règle qui tient les trois modèles
 * interchangeables.
 *
 * Il partage la mise en page de `STYLES_BASE` — la feuille A4 et ses marges —
 * et n'ajoute que la couche colorée. La tenue en page est donc celle des autres
 * modèles, mesurée par les mêmes bancs.
 */
export function rendreModeleColore(contenu: ContenuDocument): string {
  const couleur = COULEURS_COLORE.principaleFonce;
  const resteAPercevoir = contenu.resteAPercevoir > 0;

  // Le montant mis en avant et son libellé suivent la **nature** du document,
  // exactement comme dans les deux autres modèles. Un reçu partiel annonçait
  // ici « Total réglé » au-dessus du total, à côté d'un tampon « Reste à
  // payer » : le document se contredisait sur la même ligne. Le tampon, lui,
  // suit `resteAPercevoir`, qui est la décision du domaine.
  const libelleMontant =
    contenu.type === 'recu'
      ? 'Montant reçu'
      : contenu.type === 'quittance'
        ? 'Total réglé'
        : 'Montant dû';
  const montantMisEnAvant =
    contenu.type === 'recu' ? contenu.montantRecu : contenu.montants.total;

  const adresseBailleur = [
    contenu.emetteur.nom,
    ...contenu.emetteur.adresse,
    contenu.emetteur.telephone ? `Tél. ${contenu.emetteur.telephone}` : null,
    contenu.emetteur.email,
    contenu.emetteur.siret ? `SIRET ${contenu.emetteur.siret}` : null,
  ].filter((l): l is string => Boolean(l));

  const carteBailleur = carteColore({
    variante: '',
    etiquette: 'Bailleur',
    lignes: [
      echapper(contenu.emetteur.qualite ?? contenu.emetteur.nom),
      ...adresseBailleur.map((l) => echapper(l)),
    ],
  });

  const carteLocataire = carteColore({
    variante: 'cc-locataire',
    etiquette: contenu.locataires.length > 1 ? 'Locataires' : 'Locataire',
    lignes:
      contenu.locataires.length > 0
        ? contenu.locataires.map((l) => echapper(l))
        : ['—'],
  });

  const carteLogement = carteColore({
    variante: '',
    etiquette: 'Logement concerné',
    lignes: [echapper(contenu.logement.nom), ...contenu.logement.adresse.map((l) => echapper(l))],
    pleineLargeur: true,
  });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${echapper(LIBELLE_DOCUMENT[contenu.type])} ${echapper(contenu.periodeLibelle)}</title>
<style>${STYLES_BASE}${STYLES_COLORE}</style>
</head>
<body>
  <div class="page">

    <div class="cc-bandeau">
      <div>
        <h1 class="cc-titre">${echapper(LIBELLE_DOCUMENT[contenu.type])}</h1>
        <div class="cc-periode">${echapper(contenu.periodeLibelle)}</div>
      </div>
      <div class="cc-numero">
        <strong>N° ${echapper(contenu.numero)}</strong>
        Émis le ${echapper(contenu.dateEmission)}
      </div>
    </div>

    <div class="cc-cartes">
      ${carteBailleur}
      ${carteLocataire}
    </div>

    ${carteLogement}

    <div class="cc-total">
      <div>
        <div class="cc-libelle">${echapper(libelleMontant)}</div>
        <div class="cc-sous-libelle">
          Loyer et charges de ${echapper(contenu.periodeLibelle)}
        </div>
        <span class="cc-tampon${resteAPercevoir ? ' cc-a-payer' : ''}">
          ${resteAPercevoir ? 'Reste à payer' : 'Payé'}
        </span>
      </div>
      <div class="cc-montant">${echapper(formatMontant(montantMisEnAvant))}</div>
    </div>

    ${tableauMontantsColore(contenu)}

    ${detailPaiementsColore(contenu)}

    <div class="cc-mention">
      <div class="cc-mention-titre">Reconnaissance du bailleur</div>
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

/** Rend le contenu selon le modèle demandé. */
export function rendreHtml(contenu: ContenuDocument, modele: ModelePropose): string {
  if (modele === 'colore') return rendreModeleColore(contenu);
  return modele === 'moderne' ? rendreModeleModerne(contenu) : rendreModeleClassique(contenu);
}

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

// Les chemins portent l'extension `.ts`, comme dans `src/domain` : le rendu
// HTML est ainsi exécutable par `node --test`, sans émulateur ni transpileur.
import { formatMontant } from '../domain/money.ts';
import type { PaiementImprime } from '../domain/payments.ts';
import { LIBELLE_DOCUMENT, type ModeleDocument, type TypeDocument } from '../domain/types.ts';
import {
  avertissement,
  MENTION_ANNULATION_RECUS,
  MENTION_RESERVE_DROITS,
  RAPPEL_LOCATAIRE,
  REFERENCE_DECRET_2015,
  REFERENCE_LOI_1989,
  mentionAvisEcheance,
  mentionQuittance,
  mentionRecu,
} from './legal.ts';
import { COULEURS_DOCUMENT, echapper, STYLES_BASE } from './styles.ts';
import { STYLES_OFFICIEL } from './styles-officiel.ts';

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
   * C'est la seule source de l'onglet « A PAYER » et du tampon « PAYÉ » : le
   * document ne peut donc pas affirmer un paiement que la base ne porte pas.
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
// Modèle 3 : officiel — la feuille du bailleur
// ---------------------------------------------------------------------------

/**
 * Un volet du modèle officiel.
 *
 * Le volet porte le titre, l'émetteur, le tableau des montants avec sa ligne de
 * total, et les deux mentions en italique bleu — une sous chaque colonne, comme
 * sur le papier du bailleur.
 */
function voletOfficiel(params: {
  classe: string;
  titre: string;
  contenu: ContenuDocument;
  /** Fond de la colonne « désignation » : bleu pour la quittance, crème sinon. */
  colonneDesignation: string;
  colonneMontant: string;
  /** Texte de l'onglet de total, vide quand tout est réglé. */
  onglet: string;
  mentionGauche: string;
  mentionDroite: string;
}): string {
  const contenu = params.contenu;
  const { montants, mentionCharges } = contenu;

  // La deuxième ligne du tableau n'apparaît que s'il y a des charges à
  // distinguer du loyer : sinon le tableau n'aurait qu'une ligne, ce qui est
  // exact, mais deux fois la même somme.
  const avecCharges = mentionCharges && montants.charges > 0;
  const chargesGauche = avecCharges ? '<div class="ligne">Provisions sur charges</div>' : '';
  const chargesDroite = avecCharges
    ? `<div class="ligne">${echapper(formatMontant(montants.charges))}</div>`
    : '';

  const designation = contenu.logement.nom.trim() || 'Appartement';

  return `
    <section class="volet ${params.classe}">
      <h1 class="titre-volet">${echapper(params.titre)}</h1>

      <div class="volet-corps">

        <div class="volet-gauche">
          <div class="emetteur">
            <div class="nom">${echapper(contenu.emetteur.nom)}</div>
            ${contenu.emetteur.adresse.map((l) => `<div>${echapper(l)}</div>`).join('')}
          </div>

          <div class="cadre-tableau">
            <div class="tableau-officiel">
              <div class="entete-tableau">
                <div class="cellule designation">Désignation des locaux ou opérations</div>
                <div class="cellule montant">Montant</div>
              </div>
              <div class="corps-tableau">
                <div class="colonne-designation ${params.colonneDesignation}">
                  <div class="ligne">${echapper(designation)}</div>
                  ${chargesGauche}
                </div>
                <div class="colonne-montant ${params.colonneMontant}">
                  <div class="ligne">${echapper(formatMontant(montants.loyer))}</div>
                  ${chargesDroite}
                </div>
              </div>
            </div>
          </div>

          <div class="ligne-total">
            <div class="onglet">${echapper(params.onglet)}</div>
            <div class="montant-total">${echapper(formatMontant(montants.total))}</div>
          </div>
        </div>

        <div class="volet-droite">
          <div class="reference">
            <span class="etiquette">Période :</span>
            DU ${echapper(contenu.periodeDebut)} AU ${echapper(contenu.periodeFin)}
          </div>
          <div class="reference">
            <span class="etiquette">Immeuble :</span>
            ${echapper(contenu.logement.adresse.join(', '))}
          </div>

          <div class="destinataire">
            ${contenu.locataires.map((l) => echapper(l)).join('<br />')}
          </div>

          <div class="adresse-logement">
            ${contenu.logement.adresse.map((l) => echapper(l)).join('<br />')}
          </div>
        </div>

      </div>

      <div class="volet-mentions">
        <div class="mention-gauche">
          <p class="mentions-legales">${echapper(params.mentionGauche)}</p>
          ${contenu.mentionLibre ? `<p class="mentions-legales">${echapper(contenu.mentionLibre)}</p>` : ''}
        </div>
        <div class="mention-droite">
          <p class="mentions-legales">${echapper(params.mentionDroite)}</p>
        </div>
      </div>
    </section>
  `;
}

/** Le talon détachable, avec sa bande verticale et son tampon. */
function talonOfficiel(contenu: ContenuDocument): string {
  // Le tampon suit le solde réel, jamais la nature du document : un avis
  // d'échéance n'est pas « payé », un reçu partiel non plus.
  const regle = contenu.resteAPercevoir <= 0;

  return `
    <div class="talon">
      <div class="bande-originale"><span>DOCUMENT ORIGINAL</span></div>

      <div class="talon-panneau">
        <h2 class="talon-titre">Talon détachable à joindre à votre règlement</h2>

        <div class="talon-haut">
          <div class="exigible">Loyer exigible le ${echapper(contenu.echeanceLibelle)}</div>
          <div class="bailleur">
            ${echapper(contenu.emetteur.nom)}<br />
            ${contenu.emetteur.adresse.map((l) => echapper(l)).join('<br />')}
          </div>
        </div>

        <div class="talon-bas">
          <div class="boite-locataire">
            <div class="titulaires">${echapper(contenu.locataires.join(' et '))}</div>
            <div class="grille-talon">
              <div class="etiquettes">
                <div>Période</div>
                <div>Montant</div>
              </div>
              <div class="valeurs">
                <div>DU ${echapper(contenu.periodeDebut)} AU ${echapper(contenu.periodeFin)}</div>
                <div class="droite">${echapper(formatMontant(contenu.montants.total))}</div>
              </div>
            </div>
          </div>

          <div class="talon-droite">
            ${
              contenu.signatureBase64
                ? `<div class="signature-officielle">
                     <img src="${contenu.signatureBase64}" alt="Signature du bailleur" />
                     <div>${echapper(contenu.emetteur.nom)}</div>
                   </div>`
                : ''
            }
            <p class="renvoyer">À renvoyer à l'adresse ci-dessus</p>
            ${regle ? '<div class="tampon-zone"><span class="tampon">Payé</span></div>' : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Rend la feuille du bailleur.
 *
 * Deux volets, pas trois : le modèle papier porte la quittance **et** l'avis
 * d'échéance pour le même mois, l'un marqué « payé » et l'autre « à payer ».
 * Ces deux affirmations ne peuvent pas être vraies ensemble, et l'application
 * ne peut donc pas les imprimer toutes les deux. Le volet rendu est celui du
 * document demandé ; l'onglet de total et le tampon disent, eux, l'état réel
 * du mois.
 */
export function rendreModeleOfficiel(contenu: ContenuDocument): string {
  const estQuittance = contenu.type === 'quittance';
  const regle = contenu.resteAPercevoir <= 0;

  // Sur le papier du bailleur, la quittance a la colonne de désignation bleue
  // et l'avis d'échéance l'a crème : les deux se distinguent au premier regard.
  const colonneDesignation = estQuittance ? 'colonne-bleue' : 'colonne-creme';
  const colonneMontant = estQuittance ? 'colonne-creme' : 'colonne-bleue';

  // L'onglet ne dit rien de plus que le solde : vide quand tout est réglé,
  // ce qui reproduit exactement l'onglet nu de la quittance du modèle.
  const onglet = regle ? '' : 'A PAYER';

  // Les mentions du modèle ne valent que pour une quittance : elles parlent de
  // ce que la quittance annule et réserve. Ailleurs, on dit ce que le document
  // est — un reçu ou un avis — sans détourner ces phrases de leur objet.
  const mentionGauche = estQuittance
    ? MENTION_RESERVE_DROITS
    : (avertissement(contenu.type) ?? '');
  const mentionDroite = estQuittance
    ? MENTION_ANNULATION_RECUS
    : mentionReconnaissance(contenu);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${echapper(LIBELLE_DOCUMENT[contenu.type])} ${echapper(contenu.periodeLibelle)}</title>
<style>${STYLES_OFFICIEL}</style>
</head>
<body>
  <div class="feuille">

    ${voletOfficiel({
      classe: estQuittance ? 'volet-quittance' : 'volet-avis',
      titre: LIBELLE_DOCUMENT[contenu.type],
      contenu,
      colonneDesignation,
      colonneMontant,
      onglet,
      mentionGauche,
      mentionDroite,
    })}

    <div class="decoupe"></div>

    ${talonOfficiel(contenu)}

  </div>
</body>
</html>`;
}

/** Rend le contenu selon le modèle demandé. */
export function rendreHtml(contenu: ContenuDocument, modele: ModeleDocument): string {
  if (modele === 'officiel') return rendreModeleOfficiel(contenu);
  return modele === 'moderne' ? rendreModeleModerne(contenu) : rendreModeleClassique(contenu);
}

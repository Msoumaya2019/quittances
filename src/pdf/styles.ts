/**
 * Styles communs aux documents PDF.
 *
 * Le PDF est produit depuis du HTML rendu par la visionneuse du système. On
 * reste donc sur des techniques sûres : pas de flexbox exotique, pas de police
 * téléchargée, pas de ressource distante. Une quittance doit s'afficher et
 * s'imprimer correctement, même hors ligne.
 *
 * Toutes les valeurs sont en millimètres ou en points, unités comprises par le
 * moteur d'impression.
 */

import { couleurs } from '../ui/tokens';

/** Échappe le texte destiné à être inséré dans du HTML. */
export function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Feuille de style de base, commune aux deux modèles. */
export const STYLES_BASE = `
  * { box-sizing: border-box; }

  @page {
    size: A4;
    margin: 0;
  }

  html, body {
    margin: 0;
    padding: 0;
  }

  body {
    font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #1A1A1A;
    background: #FFFFFF;
    font-size: 11pt;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 20mm 18mm 16mm 18mm;
    display: flex;
    flex-direction: column;
  }

  /* En-tête ------------------------------------------------------------- */

  .entete {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12mm;
    margin-bottom: 10mm;
  }

  .emetteur .nom {
    font-size: 13pt;
    font-weight: 700;
    margin: 0 0 2mm 0;
  }

  .emetteur .ligne {
    margin: 0;
    color: #444444;
    font-size: 10pt;
  }

  .document-meta {
    text-align: right;
    font-size: 9.5pt;
    color: #444444;
    line-height: 1.6;
  }

  .document-meta .numero {
    font-weight: 700;
    color: #1A1A1A;
  }

  /* Titre --------------------------------------------------------------- */

  .titre-document {
    text-align: center;
    margin: 4mm 0 8mm 0;
  }

  .titre-document h1 {
    font-size: 19pt;
    font-weight: 700;
    letter-spacing: 0.5pt;
    margin: 0;
    text-transform: uppercase;
  }

  .titre-document .periode {
    margin-top: 2mm;
    font-size: 12pt;
    color: #444444;
  }

  /* Destinataires ------------------------------------------------------- */

  .parties {
    display: flex;
    gap: 10mm;
    margin-bottom: 8mm;
  }

  .partie {
    flex: 1;
  }

  .partie .etiquette {
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.6pt;
    color: #777777;
    margin-bottom: 1.5mm;
  }

  .partie .valeur {
    font-size: 11pt;
    line-height: 1.5;
  }

  .partie .valeur strong {
    font-weight: 700;
  }

  /* Tableau des montants ------------------------------------------------ */

  table.montants {
    width: 100%;
    border-collapse: collapse;
    margin: 6mm 0;
  }

  table.montants th {
    text-align: left;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.6pt;
    color: #777777;
    padding: 0 0 2mm 0;
    border-bottom: 1px solid #DDDDDD;
  }

  table.montants th.montant,
  table.montants td.montant {
    text-align: right;
  }

  table.montants td {
    padding: 2.5mm 0;
    border-bottom: 1px solid #EEEEEE;
  }

  table.montants tr.total td {
    font-size: 13pt;
    font-weight: 700;
    border-bottom: none;
    border-top: 2px solid #1A1A1A;
    padding-top: 3mm;
  }

  .detail-ligne {
    font-size: 9.5pt;
    color: #666666;
  }

  /* Bloc de reconnaissance ---------------------------------------------- */

  .reconnaissance {
    margin: 8mm 0;
    padding: 6mm;
    border-radius: 3mm;
    font-size: 11pt;
    line-height: 1.7;
  }

  .avertissement {
    margin: 6mm 0;
    padding: 4mm 5mm;
    border-radius: 2mm;
    font-size: 9.5pt;
    line-height: 1.5;
  }

  /* Pied ---------------------------------------------------------------- */

  .pied {
    margin-top: auto;
    padding-top: 6mm;
    border-top: 1px solid #DDDDDD;
    font-size: 8.5pt;
    color: #777777;
    line-height: 1.5;
  }

  .signature {
    margin-top: 10mm;
    display: flex;
    justify-content: flex-end;
  }

  .signature .bloc {
    text-align: center;
    min-width: 60mm;
  }

  .signature .etiquette {
    font-size: 9pt;
    color: #666666;
    margin-bottom: 2mm;
  }

  .signature img {
    max-width: 55mm;
    max-height: 25mm;
  }

  .signature .trait {
    border-bottom: 1px solid #BBBBBB;
    height: 22mm;
    margin-bottom: 1.5mm;
  }

  .mention-libre {
    margin-top: 6mm;
    font-size: 9pt;
    color: #666666;
    font-style: italic;
  }

  /* Éléments de liste --------------------------------------------------- */

  .ligne-paiement {
    font-size: 10pt;
    color: #333333;
    margin: 1mm 0;
  }
`;

/** Couleurs de l'interface réutilisées pour les documents. */
export const COULEURS_DOCUMENT = {
  principale: couleurs.vert,
  principaleFonce: couleurs.vertFonce,
  principaleClaire: couleurs.vertClair,
  principaleTresClaire: couleurs.vertTresClair,
  orange: couleurs.orange,
  orangeClair: couleurs.orangeClair,
  orangeTresClair: couleurs.orangeTresClair,
  texte: '#1A1A1A',
  texteSecondaire: '#444444',
  texteTertiaire: '#777777',
  bordure: '#DDDDDD',
  bordureLegere: '#EEEEEE',
} as const;

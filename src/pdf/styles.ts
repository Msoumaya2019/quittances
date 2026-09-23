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

  /*
   * Les blancs de cette feuille sont plus courts que ceux du bailleur, et
   * c'est une correction, pas un choix esthetique.
   *
   * Mesure du 23 septembre 2026, sur une quittance d'UNE seule ligne de
   * paiement : les blocs de ce modele pesent 268,46 mm, et la feuille demandee
   * par l'application en offre 297,39. Avec 20 mm en haut, 16 mm en bas et des
   * marges de bloc plus larges, la boite atteignait 304,46 mm — sept
   * millimetres de trop, donc une SECONDE feuille et une coupure a
   * l'impression. Le defaut ne dependait pas du contenu : il apparaissait des
   * la premiere ligne.
   *
   * La hauteur minimale, elle, etait posee a 297 mm : sur une feuille de
   * 297,39, il ne restait que 0,39 mm — un millimetre et demi de pixel. Comme
   * le contenu ne pese que 279,46 mm, cette contrainte n'ajoutait pas de place
   * utile : elle consommait la marge disponible, et faisait dependre la tenue
   * en page d'un arrondi du moteur d'impression.
   *
   * A 285 mm, le pied reste colle au bas de la feuille pour un document court,
   * et il reste 12,39 mm de marge. Au-dela, c'est le contenu qui decide.
   *
   * Forcer une hauteur fixe de 297 mm ramenerait aussi a une page, mais en
   * rognant les derniers millimetres — exactement la coupure qu'on veut
   * eviter. Le blanc se reduit donc la ou il ne porte rien.
   */
  .page {
    width: 210mm;
    min-height: 285mm;
    padding: 10mm 18mm 8mm 18mm;
    display: flex;
    flex-direction: column;
  }

  /* En-tête ------------------------------------------------------------- */

  .entete {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12mm;
    margin-bottom: 8mm;
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
    margin: 3mm 0 6mm 0;
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
    margin-bottom: 6mm;
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
    margin: 3mm 0;
  }

  table.montants th {
    text-align: left;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.6pt;
    color: #777777;
    padding: 0 0 1.5mm 0;
    border-bottom: 1px solid #DDDDDD;
  }

  table.montants th.montant,
  table.montants td.montant {
    text-align: right;
  }

  table.montants td {
    padding: 2mm 0;
    border-bottom: 1px solid #EEEEEE;
  }

  table.montants tr.total td {
    font-size: 13pt;
    font-weight: 700;
    border-bottom: none;
    border-top: 2px solid #1A1A1A;
    padding-top: 2.5mm;
  }

  /*
   * Le detail des encaissements coule dans un paragraphe, et c'est une
   * exigence de tenue en page : une ligne par encaissement pesait 6,28 mm, et
   * la quittance passait sur une seconde feuille des le huitieme. Les entrees
   * sont donc en ligne, separees par un point-virgule, et le paragraphe se
   * replie de lui-meme. Le texte imprime ne change pas.
   */
  .detail-paiements {
    margin-top: 2mm;
    font-size: 10pt;
    color: #333333;
    line-height: 1.5;
  }

  .detail-ligne {
    font-size: 9.5pt;
    color: #666666;
  }

  /* Bloc de reconnaissance ---------------------------------------------- */

  .reconnaissance {
    margin: 3mm 0;
    padding: 3mm;
    border-radius: 3mm;
    font-size: 11pt;
    line-height: 1.6;
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
    padding-top: 4mm;
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

  /* En ligne, sans marge : c'est le paragraphe qui decide ou couper. */
  .ligne-paiement {
    color: #333333;
  }

  .separateur-paiement {
    color: #999999;
  }
`;

/**
 * Couleurs des documents.
 *
 * Elles ne suivent **pas** le thème de l'application. Une quittance est un
 * papier légal, remis au locataire et conservé des années : deux bailleurs qui
 * impriment la même quittance doivent obtenir le même document, et changer de
 * thème ne doit pas changer l'aspect des quittances déjà émises.
 *
 * Les valeurs viennent du modèle papier fourni, relevées au pixel sur le
 * document de référence. `principaleFonce` est la seule qui soit dérivée :
 * le modèle n'a pas de bleu foncé, il est calculé pour rester lisible sur
 * `principaleTresClaire`.
 */
export const COULEURS_DOCUMENT = {
  /** Intitulés, titres, mentions légales — relevé sur le modèle. */
  principale: '#005FA4',
  /** Variante foncée, dérivée de `principale` pour le contraste. */
  principaleFonce: '#00406E',
  /** Filets et encadrés du talon — relevé sur le modèle. */
  principaleClaire: '#DCEAF3',
  /** Haut du dégradé du tableau — relevé sur le modèle. */
  principaleTresClaire: '#ECF5FA',
  /** Bandeaux « avis d'échéance » — dérivé de l'orange du modèle. */
  orange: '#B45309',
  orangeClair: '#FDE8CC',
  /** Bas du dégradé du tableau, et fond du talon — relevé sur le modèle. */
  orangeTresClair: '#FEF1DE',
  texte: '#1A1A1A',
  texteSecondaire: '#444444',
  texteTertiaire: '#777777',
  bordure: '#DDDDDD',
  bordureLegere: '#EEEEEE',
} as const;

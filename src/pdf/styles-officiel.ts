/**
 * Feuille de style du modèle officiel : la feuille du bailleur.
 *
 * Elle reproduit un document papier fourni par le bailleur, relevé au pixel sur
 * une rasterisation de son PDF. Chaque valeur chiffrée porte donc la mesure dont
 * elle vient, pour qu'on puisse la vérifier sans rouvrir le modèle :
 *
 *   page A4                      210 × 297 mm
 *   marge gauche du tableau      1,67 mm
 *   bord droit du tableau        97,91 mm   (soit 96,2 mm de large)
 *   coupure des colonnes         72,6 mm    (77,5 % / 22,5 %)
 *   retrait de l'émetteur        12,87 mm   (11 mm après la marge de 2 mm)
 *   bandeau d'en-tête            48,91 → 53,93 mm   (5 mm), fond #32558D
 *   hauteur d'une ligne          6,2 mm
 *   table de la quittance        33 mm             (plancher, deux lignes)
 *   ligne de total               86,98 → 95,70 mm   (8,7 mm)
 *   onglet de total              44,68 → 65,48 mm   (20,8 mm), coins bas arrondis
 *   bande « DOCUMENT ORIGINAL »  0 → 5,5 mm, fond #DCE9F2
 *   boîte du locataire           16,9 → 99,8 mm     (83 mm)
 *   tampon PAYÉ                  x 114,5 → 139,6, y 277,4 → 285,9
 *
 * Le modèle papier porte **trois** volets : quittance, avis d'échéance, talon.
 * La feuille produite ici en porte deux : le document demandé, puis le talon.
 * La raison est dans `rendreModeleOfficiel`. Le volet du document occupe donc
 * la hauteur que deux volets occupaient : son contenu se groupe en haut, comme
 * sur le modèle, et le blanc se trouve au bas du volet, avant le filet de
 * découpe. La table, elle, épouse son contenu — mesuré sur le modèle, celle de
 * la quittance fait 33 mm pour deux lignes.
 *
 * Le rendu est fait par la visionneuse du système : on reste sur des techniques
 * sûres — pas de police téléchargée, pas de ressource distante, pas de requête
 * réseau. Une quittance doit s'imprimer même hors ligne.
 */

import { COULEURS_DOCUMENT as C } from './styles.ts';

/** Encre du bandeau d'en-tête et de l'onglet de total, relevée sur le modèle. */
const ARDOISE = '#32558D';
/** Filet d'encadrement du tableau, relevé sur le modèle. */
const FILET = '#5B7BA8';
/** Fond de la bande verticale du talon, relevé sur le modèle. */
const BLEU_PALE = '#DCE9F2';
/** Rouge du tampon, relevé sur le modèle. */
const ROUGE_TAMPON = '#A4092B';
/** Bord de la boîte d'adresse du talon. */
const BORD_TALON = '#7FA8C9';

/** Largeur de la colonne « désignation », en millimètres. */
const COLONNE_DESIGNATION = '74.6mm';

export const STYLES_OFFICIEL = `
  @page { size: A4; margin: 0; }

  * { box-sizing: border-box; }

  html, body { margin: 0; padding: 0; }

  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: ${C.texte};
    background: #FFFFFF;
    font-size: 10pt;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* La feuille : deux volets empilés, à découper. ----------------------- */

  .feuille {
    width: 210mm;
    height: 297mm;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .volet {
    flex: 1 1 auto;
    min-height: 120mm;
    padding: 5mm 2mm 0 2mm;
    display: flex;
    flex-direction: column;
  }

  .titre-volet {
    margin: 0 0 7mm 0;
    text-align: center;
    color: ${C.principale};
    font-size: 15pt;
    font-weight: 700;
    letter-spacing: 0.8pt;
    text-transform: uppercase;
  }

  /* Le corps ne s'étire pas : il prend la hauteur de son contenu, et les
     mentions suivent le total de près. C'est la disposition du modèle, dont le
     volet de quittance fait une centaine de millimètres : le blanc se trouve
     alors au bas du volet, avant le filet de découpe, et non au milieu de la
     feuille. Mesuré sur le modèle : mentions à 91 mm, total à 84 mm. */
  .volet-corps { flex: 0 0 auto; display: flex; width: 100%; }

  /* Colonne de gauche : l'émetteur, le tableau, la ligne de total. */
  .volet-gauche {
    width: 98mm;
    flex: 0 0 98mm;
    display: flex;
    flex-direction: column;
  }

  /* Colonne de droite : les références, le destinataire, les mentions. */
  .volet-droite {
    flex: 1 1 auto;
    padding-left: 10mm;
    display: flex;
    flex-direction: column;
  }

  /* Émetteur ------------------------------------------------------------ */

  .emetteur {
    padding-left: 11mm;
    margin-bottom: 18mm;
    font-size: 10pt;
    line-height: 1.4;
  }

  /* Références de la colonne de droite ---------------------------------- */

  .reference { font-size: 10.5pt; line-height: 1.45; }
  .reference .etiquette { color: ${C.principale}; }

  /* Tableau ------------------------------------------------------------- */

  /* Le cadre épouse son contenu, avec un plancher qui garde la table proche de
     celle du modèle — 33 mm. Au-delà, il grandit avec ses lignes : une
     quittance qui porte plusieurs lignes de loyer ne doit rien perdre, d'où
     l'absence de plafond, qui rognerait une ligne en silence.

     Mesuré avant correction : le cadre s'étirait à 118 mm pour deux lignes,
     dont une centaine de millimètres de dégradé vide au milieu de la feuille.
     Le commentaire d'alors annonçait déjà 33 mm : le code ne faisait pas ce
     qu'il disait. */
  .cadre-tableau {
    flex: 0 0 auto;
    min-height: 33mm;
    width: 96mm;
    display: flex;
    flex-direction: column;
  }

  .tableau-officiel {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    border: 0.3mm solid ${FILET};
    border-bottom: none;
    border-radius: 2mm 2mm 0 0;
    overflow: hidden;
  }

  .entete-tableau {
    flex: 0 0 5mm;
    display: flex;
    background-color: ${ARDOISE};
    color: #FFFFFF;
    font-size: 6.6pt;
    letter-spacing: 0.2pt;
    text-transform: uppercase;
  }

  .entete-tableau .cellule { padding: 1.4mm 2.5mm 0 2.5mm; white-space: nowrap; }
  .entete-tableau .cellule.designation { width: ${COLONNE_DESIGNATION}; }
  .entete-tableau .cellule.montant { flex: 1 1 auto; text-align: right; }

  .corps-tableau { flex: 1 1 auto; display: flex; }

  .colonne-designation { width: ${COLONNE_DESIGNATION}; }
  .colonne-montant { flex: 1 1 auto; }

  .ligne {
    height: 6.2mm;
    padding: 1.3mm 3mm 0 3mm;
    font-size: 10.5pt;
    white-space: nowrap;
  }

  .colonne-designation .ligne { text-transform: uppercase; }
  .colonne-montant .ligne { text-align: right; }

  /* Les deux colonnes du tableau portent un dégradé vertical. Le sens
     s'inverse entre les volets : la quittance a la désignation en bleu,
     l'avis d'échéance l'a en crème. C'est ainsi sur le modèle. */
  .colonne-bleue { background: linear-gradient(180deg, #EDF6FB 0%, #DFE8F1 100%); }
  .colonne-creme { background: linear-gradient(180deg, #FBF2E3 0%, #FFF7EC 100%); }

  /* Ligne de total, dans le cadre ---------------------------------------- */

  .ligne-total {
    flex: 0 0 8.7mm;
    width: 96mm;
    display: flex;
    align-items: stretch;
    background-color: #FFFFFF;
    border: 0.3mm solid ${FILET};
    border-top: 0.3mm solid ${FILET};
    border-radius: 0 0 2mm 2mm;
  }

  /* L'onglet est décalé à 43 mm du bord gauche du cadre, et large de 21 mm. */
  .onglet {
    width: 20.8mm;
    margin-left: 43mm;
    background-color: ${ARDOISE};
    border-radius: 0 0 1.5mm 1.5mm;
    color: #FFFFFF;
    font-size: 9pt;
    letter-spacing: 0.6pt;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 1.2mm;
  }

  .montant-total {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 2mm;
    font-size: 13pt;
  }

  /* Destinataire -------------------------------------------------------- */

  .destinataire {
    margin-top: 12mm;
    padding-left: 14mm;
    font-weight: 700;
    font-size: 11pt;
    line-height: 1.4;
  }

  .adresse-logement {
    margin-top: 8mm;
    padding-left: 14mm;
    font-size: 11pt;
    line-height: 1.45;
  }

  /* Mentions légales, en italique bleu ---------------------------------- */

  .mentions-legales {
    margin: 0;
    font-size: 8pt;
    font-style: italic;
    color: ${C.principale};
    line-height: 1.4;
  }

  .volet-gauche .mentions-legales { margin-top: 7mm; }

  /* Sur le modèle, les deux mentions sont à la même hauteur et ferment le
     volet : la gauche commence à 10,9 mm, la droite à 107,5 mm. Elles vivent
     donc dans une rangée commune, qui suit le corps du volet. */
  .volet-mentions { display: flex; padding-top: 6mm; }
  .volet-mentions .mention-gauche { flex: 0 0 96mm; width: 96mm; padding-left: 9mm; }
  .volet-mentions .mention-droite { flex: 1 1 auto; padding-left: 9.5mm; }

  /* Talon détachable ----------------------------------------------------- */

  .talon {
    flex: 0 0 84mm;
    padding: 3mm;
    display: flex;
    background-color: ${BLEU_PALE};
    border-radius: 2.5mm;
  }

  /* Bande verticale « DOCUMENT ORIGINAL », à gauche. */
  .bande-originale {
    width: 3.5mm;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .bande-originale span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 7pt;
    letter-spacing: 0.4pt;
    color: #6E8FAE;
    white-space: nowrap;
  }

  /* Le retrait de gauche place la boîte du locataire à 16,9 mm du bord de la
     page, comme sur le modèle (3 mm de cadre + 3,5 mm de bande + 10 mm). */
  .talon-panneau {
    flex: 1 1 auto;
    padding: 5mm 7mm 5mm 10mm;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #FFF7E9 0%, #FEF1DE 100%);
    border-radius: 1.5mm;
  }

  .talon-titre {
    margin: 0 0 9mm 0;
    text-align: center;
    color: ${C.principale};
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 1pt;
    text-transform: uppercase;
  }

  .talon-haut {
    display: flex;
    justify-content: space-between;
    font-size: 11pt;
    line-height: 1.45;
    text-transform: uppercase;
  }

  /* Le libellé d'exigibilité est en retrait de 9 mm sur le modèle, alors que
     l'adresse du bailleur occupe un bloc de 70 mm qui la place vers 127 mm. */
  .talon-haut .exigible { padding-left: 9mm; }
  .talon-haut .bailleur { width: 70mm; }

  .talon-bas {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-top: auto;
  }

  /* Boîte d'identité du locataire : 83 mm de large sur le modèle. */
  .boite-locataire {
    width: 83mm;
    padding: 3mm 4mm;
    background-color: #FFFFFF;
    border: 0.3mm solid ${BORD_TALON};
    border-radius: 2mm;
  }

  .boite-locataire .titulaires {
    margin-bottom: 3mm;
    font-size: 8pt;
    white-space: nowrap;
  }

  .grille-talon { display: flex; font-size: 9.5pt; }

  .grille-talon .etiquettes { width: 24mm; color: ${C.principale}; }
  .grille-talon .valeurs { flex: 1 1 auto; }
  .grille-talon .valeurs .droite { text-align: right; }
  .grille-talon div { line-height: 1.5; }

  /* Sur le modèle, le renvoi est aligné à droite et le tampon posé à gauche du
     même bloc : 113,3 mm pour le tampon, 194,6 mm pour la fin du renvoi. */
  .talon-droite { width: 88mm; }

  .signature-officielle {
    margin-bottom: 4mm;
    font-size: 8pt;
    color: #6B6B6B;
    text-align: right;
  }

  .signature-officielle img { max-width: 32mm; max-height: 14mm; }

  .renvoyer {
    margin: 0 0 6mm 0;
    color: ${C.principale};
    font-size: 11pt;
    font-weight: 700;
    font-style: italic;
    text-transform: uppercase;
    text-align: right;
  }

  .tampon-zone { text-align: left; }

  /* Le tampon : rouge, souligné, tel qu'apposé sur le modèle. */
  .tampon {
    display: inline-block;
    color: ${ROUGE_TAMPON};
    font-size: 22pt;
    font-weight: 700;
    letter-spacing: 0.5pt;
    text-transform: uppercase;
    border-bottom: 0.6mm solid ${ROUGE_TAMPON};
    padding: 0 1.5mm 1mm 1.5mm;
  }

  /* Filet de découpe entre les volets ------------------------------------ */

  .decoupe {
    flex: 0 0 0;
    border-top: 0.3mm dashed #AAB4C0;
    margin: 0 2mm;
  }
`;

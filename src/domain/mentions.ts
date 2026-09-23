/**
 * La mention libre portée sur les documents.
 *
 * C'est le seul texte du document que le bailleur écrit lui-même. Il doit donc
 * tenir dans la place qui lui reste — et cette place n'est pas élastique.
 *
 * La feuille a une hauteur fixe, et son volet **ne se poursuit pas** sur une page
 * suivante : mesuré, un contenu trop long n'est ni renvoyé à la page suivante ni
 * signalé, il est **rogné en silence**. Sur une quittance, une phrase perdue ne
 * se voit qu'à la réclamation.
 *
 * D'où la borne ci-dessous. Elle est mesurée, et non devinée :
 * `.verif/eprouver-rognage.py` imprime la même quittance avec une mention de plus
 * en plus longue, et cherche dans le texte du PDF une sentinelle placée en fin de
 * mention.
 *
 *   - jusqu'à 2 000 caractères, la sentinelle survit, sur une seule page ;
 *   - à 3 000, elle a disparu — et le document reste sur une seule page.
 *
 * Le seuil exact n'est pas cherché plus finement : il dépendrait de la police, de
 * la longueur des autres champs et du nombre de lignes du tableau. Un chiffre trop
 * ajusté serait un piège le jour où le modèle change. La borne retenue laisse un
 * facteur sept sous le plafond mesuré.
 */

/** Nombre de caractères au-delà duquel une mention libre ne tient plus. */
export const LONGUEUR_MENTION_LIBRE_MAX = 300;

/** La marque qui dit qu'un texte a été abrégé. */
export const MARQUE_ABREVIATION = '…';

/**
 * La mention telle qu'elle part dans le document : bornée, et **visiblement**.
 *
 * L'écran borne déjà la saisie, mais un document peut aussi être produit depuis
 * une mention plus longue venue d'ailleurs — une sauvegarde restaurée, une
 * version antérieure de l'application. La couper en silence reproduirait
 * exactement le défaut qu'on cherche à éviter ; la marque d'abréviation dit, elle,
 * que le texte a été raccourci.
 */
export function mentionPourDocument(texte: string): string {
  const propre = texte.trim();
  if (propre.length <= LONGUEUR_MENTION_LIBRE_MAX) return propre;
  const garde = LONGUEUR_MENTION_LIBRE_MAX - MARQUE_ABREVIATION.length;
  return propre.slice(0, garde).trimEnd() + MARQUE_ABREVIATION;
}

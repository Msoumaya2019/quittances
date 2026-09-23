/**
 * La confirmation exigée avant d'effacer toutes les données.
 *
 * Effacer est la seule action de l'application qui **détruit** ce que le
 * bailleur a saisi, et elle est irréversible : ni corbeille, ni annulation, ni
 * sauvegarde automatique. Une boîte de dialogue à deux boutons se ferme par
 * inadvertance — un appui mal placé, un doigt qui glisse — et c'est justement
 * pour cela que les actions destructrices ne se confirment pas de la même façon
 * que les autres.
 *
 * Recopier un mot est une friction **volontaire** : elle demande de lire ce qui
 * va se passer, puis de l'écrire. C'est la même règle que pour les dépôts de
 * code, et elle a fait ses preuves pour une raison simple : on ne recopie pas
 * sept lettres par accident.
 *
 * Ce module est pur, sans base ni système : la règle est éprouvable par
 * `node --test`, et `tests/reinitialisation.test.ts` le fait — y compris sur des
 * saisies qui **ressemblent** au mot sans l'être.
 */

/** Le mot que l'utilisateur doit recopier, en toutes lettres. */
export const MOT_CONFIRMATION = 'SUPPRIMER';

/**
 * La saisie vaut-elle confirmation ?
 *
 * Deux choix, et ils vont ensemble :
 *
 *  - **les espaces autour sont ignorés.** Un clavier de téléphone ajoute
 *    volontiers une espace après un mot, et la refuser ferait échouer une
 *    intention parfaitement claire. Ce n'est pas un assouplissement de la
 *    règle : c'est la même règle, sur une saisie nettoyée.
 *  - **la casse, elle, compte.** Le champ est configuré en majuscules
 *    automatiques (`Champ.majuscules`), donc l'utilisateur n'a pas à les taper :
 *    la comparaison stricte ne peut pas lui nuire. En revanche, accepter
 *    « supprimer » rendrait le contrôle sensible à la configuration d'un clavier,
 *    et un mot qui passe dans une configuration et pas dans une autre n'est plus
 *    une confirmation — c'est une loterie.
 */
export function confirmationValide(saisie: string): boolean {
  return saisie.trim() === MOT_CONFIRMATION;
}

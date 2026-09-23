/**
 * La remise à zéro : ce qu'elle efface, et ce qu'elle doit appeler en plus.
 *
 * Trois choses de cette fonctionnalité ne s'éprouvent pas hors d'un téléphone :
 * la transaction SQLite s'exécute sur un vrai fichier, `FileSystem.deleteAsync`
 * parle au système, et une notification programmée appartient au système
 * d'exploitation. Les lancer ici demanderait un appareil, donc rien de tout
 * cela n'est dans `tests/reinitialisation.test.ts`.
 *
 * Ce qui reste vérifiable — et qui est précisément ce qui casse en silence — se
 * lit dans le code :
 *
 * 1. **La liste des tables n'est pas recopiée.** L'effacement doit parcourir
 *    `TABLES_A_VIDER`, la liste du schéma, et non une liste écrite à la main.
 *    Une liste recopiée ici survivrait à l'ajout d'une table demain, et la
 *    remise à zéro laisserait des lignes derrière elle sans le dire.
 *
 * 2. **Le dossier des PDF est le même des deux côtés.** `src/pdf/render.ts` y
 *    écrit les quittances ; `src/db/reinitialisation.ts` doit effacer ce même
 *    dossier. Rien ne relie les deux fichiers : renommer le dossier d'un côté
 *    laisserait les PDF sur le téléphone, invisibles dans l'application, et
 *    l'écran annoncerait pourtant « tout a été effacé ». Le contrôle **dérive**
 *    le nom du dossier de `render.ts` et exige que l'effacement le nomme.
 *
 * 3. **Deux choses ne sont pas dans la base** et doivent être défaites par
 *    l'écran : le rappel programmé, que le système détient et qui survivrait à
 *    l'effacement, et les réglages en mémoire, que `rafraichir` ne relit pas.
 *    Les deux sont exigées, nommément.
 *
 * Où ce contrôle s'arrête : il lit des sources. Il ne prouve pas que
 * l'effacement réussit — cela se mesure sur l'appareil, et c'est le rôle de
 * `.verif/verifier-apk.py` et `.verif/verifier-ipa-appareil.py`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const DEPOT = join(ICI, '..');

const lire = (chemin: string): string => readFileSync(join(DEPOT, chemin), 'utf8');

const EFFACEMENT = 'src/db/reinitialisation.ts';
const RENDU = 'src/pdf/render.ts';
const ECRAN = 'app/reinitialiser.tsx';
const REGLAGES = 'app/(tabs)/plus.tsx';

test('Remise à zéro : l’effacement parcourt la liste du schéma, il ne la recopie pas', () => {
  const source = lire(EFFACEMENT);

  // Le maillon qui compte : la liste est **prise au schéma**. Le contrôle
  // cherche donc `TABLES_A_VIDER` dans l'import, et non n'importe où dans le
  // fichier — une liste recopiée localement porterait le même nom sans rien
  // garantir, et une table ajoutée demain survivrait à la remise à zéro sans
  // que rien ne le signale.
  assert.match(
    source,
    /import\s*\{[^}]*\bTABLES_A_VIDER\b[^}]*\}\s*from\s*'\.\/schema'/,
    'l’effacement ne prend pas la liste au schéma : une liste recopiée ici '
      + 'survivrait à une table ajoutée demain',
  );

  // La boucle doit parcourir cette liste, et le `DELETE` être construit depuis
  // la variable de boucle : un nom de table écrit en clair serait la première
  // marche vers une liste recopiée.
  assert.match(
    source,
    /for\s*\(const\s+table\s+of\s+TABLES_A_VIDER\)/,
    'la boucle d’effacement ne parcourt pas la liste du schéma',
  );
  assert.match(
    source,
    /DELETE\s+FROM\s+\$\{/i,
    'les noms de table ne sont pas construits depuis la boucle : la liste est recopiée',
  );
});

test('Remise à zéro : le dossier des PDF effacé est celui où le rendu les écrit', () => {
  const rendu = lire(RENDU);
  const effacement = lire(EFFACEMENT);

  const dossier = /\$\{FileSystem\.documentDirectory\}([^`'\n]*)/.exec(rendu)?.[1];
  assert.ok(
    dossier !== undefined && dossier.length > 0,
    'le dossier des PDF n’a pas pu être lu dans render.ts : le contrôle ne mesure rien',
  );

  // Le contrôle porte sur le nom lu, pas sur une chaîne écrite ici.
  assert.ok(
    effacement.includes(`'${dossier}'`),
    `l’effacement ne nomme pas le dossier « ${dossier} » : les PDF resteraient sur le `
      + 'téléphone alors que l’écran annonce que tout a été effacé',
  );
});

test('Remise à zéro : l’écran efface le dossier entier et défait ce qui n’est pas en base', () => {
  const effacement = lire(EFFACEMENT);
  const ecran = lire(ECRAN);

  // Le dossier, pas un fichier à la fois : c'est ce qui attrape aussi les PDF
  // qu'une ligne perdue avait déjà rendus orphelins. C'est bien le dossier qui
  // est passé à `deleteAsync`, et non un chemin de fichier.
  assert.match(
    effacement,
    /FileSystem\.deleteAsync\(\s*dossier\b/,
    'les fichiers PDF ne sont pas effacés par le dossier : des PDF orphelins survivraient',
  );

  // Le contrôle vise les **appels**, pas les identifiants : un import sans
  // appel ne défait rien, et laisserait pourtant le nom présent dans le
  // fichier. C'est précisément l'écart qu'un contrôle par identifiant ne voit
  // pas.
  assert.match(ecran, /await\s+effacerToutesLesDonnees\(\)/, 'l’écran n’efface pas les données');
  assert.match(
    ecran,
    /await\s+annulerRappel\(\)/,
    'l’écran n’annule pas le rappel : la notification survivrait à l’effacement',
  );
  assert.match(
    ecran,
    /await\s+rechargerReglages\(\)/,
    'l’écran ne recharge pas les réglages : le thème et la signature resteraient affichés',
  );
});

test('Remise à zéro : les réglages y mènent, et le bouton n’est actif qu’après le mot', () => {
  const reglages = lire(REGLAGES);

  assert.match(
    reglages,
    /router\.(?:push|replace|navigate)\(\s*'\/reinitialiser'/,
    'aucun écran ne mène à la remise à zéro : l’écran est inatteignable',
  );

  const ecran = lire(ECRAN);

  // La règle du domaine doit commander l'état du bouton, et pas un simple
  // `saisie.length > 0` : c'est la seule barrière avant une destruction
  // irréversible.
  //
  // Le contrôle se lit en deux temps parce que le code en a deux : la règle
  // produit un verdict, et le bouton lit ce verdict. Exiger la règle
  // directement dans l'attribut obligerait à écrire une forme unique — or ce
  // qui compte est le **lien**, pas la forme. Les deux maillons sont donc
  // exigés, et un `saisie.length > 0` qui remplacerait la règle casserait le
  // premier.
  assert.match(
    ecran,
    /const\s+valide\s*=\s*confirmationValide\(saisie\)/,
    'l’état du bouton n’est pas commandé par la règle de confirmation',
  );
  assert.match(
    ecran,
    /desactive=\{[^}]*\bvalide\b/,
    'le bouton destructeur ne lit pas le verdict de la règle : il peut s’activer sans le mot',
  );

  // Un bouton destructeur qui ne dit pas sa variante serait visuellement
  // anodin : la variante fait partie du garde-fou, pas de la décoration.
  assert.match(
    ecran,
    /variante="danger"/,
    'le bouton de la remise à zéro n’est pas signalé comme dangereux',
  );
});

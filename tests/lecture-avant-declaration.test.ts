/**
 * Un écran ne lit pas une variable de contexte avant de l'avoir déstructurée.
 *
 * Mesuré le 24 septembre 2026 : « Créer le bail » échouait à tous les coups,
 * avec « Impossible de préparer ce bail : Cannot read property 'id' of
 * undefined ». Le chargement initial lisait `lireBrouillon(logement.id, 'bail')`
 * alors que `logement` est déstructuré du contexte **plus bas**, après le retour
 * anticipé qui suit le chargement. Le rappel s'exécute quand ce retour a déjà eu
 * lieu : la variable n'a jamais été initialisée, elle vaut `undefined`, et `.id`
 * fait échouer toute la préparation. Le bail était donc impossible à créer.
 *
 * Ni le typage ni les tests ne pouvaient le voir :
 *
 *   - `tsc` ne signale pas un usage avant déclaration **dans une fermeture** :
 *     la déclaration existe bien dans la fonction, et il ne sait pas qu'un
 *     retour anticipé la précède ;
 *   - les tests du domaine n'exécutent aucun écran.
 *
 * D'où ce contrôle de forme, qui lit les sources.
 *
 * CE QU'IL REGARDE, ET RIEN DE PLUS — la première version regardait le fichier
 * entier, et accusait du code juste : « logement » dans la phrase d'un message
 * d'erreur, « bail » dans un chemin d'import (`@/domain/bail`), et une clé
 * d'objet (`titulaires: contexte.titulaires`). Trente-trois accusations sur trois
 * écrans parfaitement sains. Trois resserrements, chacun pour une forme
 * réellement rencontrée :
 *
 *   - **la fenêtre du chargement**, et non le fichier : de l'effet qui appelle
 *     `chargerContexteBail` jusqu'à sa liste de dépendances. C'est le seul
 *     endroit où le défaut est possible, puisque c'est le seul qui s'exécute
 *     pendant que le contexte est encore nul ;
 *   - **ni chaînes, ni commentaires** : ils ne lisent aucune variable ;
 *   - **pas de clé** : un nom suivi de `:` est une clé d'objet ou une annotation
 *     de type, pas une lecture.
 *
 * Ce qu'il ne couvre **pas**, et qu'il ne faut pas lui demander : un usage avant
 * déclaration d'une variable venue d'ailleurs que du contexte, un défaut de même
 * nature dans `src/`, et un écran qui chargerait son contexte sans passer par
 * `chargerContexteBail`.
 *
 * Un plancher empêche le contrôle de verdir si le motif cesse de correspondre —
 * un contrôle de forme qui ne trouve plus rien est vert, et se tait.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER_APP = join(ICI, '..', 'app');

/** La déstructuration visée, telle que ces écrans l'écrivent. */
const DESTRUCTURATION = /^\s*const\s*\{([^}]*)\}\s*=\s*(?:contexte|charge)\s*;/;

/** L'appel qui ouvre la fenêtre du chargement. */
const APPEL_DE_CHARGEMENT = 'chargerContexteBail(';

/** Plancher : sans lui, un motif devenu faux rendrait le contrôle muet et vert. */
const MINIMUM_DE_FENETRES = 3;

/** Tous les fichiers `.tsx` du dossier, récursivement. */
function fichiersTsx(racine: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(racine)) {
    const complet = join(racine, entree);
    if (statSync(complet).isDirectory()) {
      trouves.push(...fichiersTsx(complet));
    } else if (entree.endsWith('.tsx')) {
      trouves.push(complet);
    }
  }
  return trouves;
}

/**
 * Les noms déclarés par une déstructuration, renommages et valeurs par défaut
 * compris : `{ a, b: c, d = 1, ...reste }` déclare `a`, `c`, `d` et `reste`.
 */
function nomsDeclares(dedans: string): string[] {
  return dedans
    .split(',')
    .map((morceau) => morceau.trim())
    .filter((morceau) => morceau.length > 0)
    .map((morceau) => morceau.replace(/^\.\.\./, ''))
    .map((morceau) => morceau.split('=')[0].trim())
    .map((morceau) => (morceau.includes(':') ? morceau.split(':').pop()!.trim() : morceau))
    .filter((nom) => /^[A-Za-z_$][\w$]*$/.test(nom));
}

/**
 * La fenêtre du chargement : de l'effet qui lit le contexte jusqu'à sa liste de
 * dépendances. Rend `null` pour un écran qui ne charge pas de contexte.
 */
function fenetreDeChargement(lignes: string[]): { debut: number; fin: number } | null {
  const appel = lignes.findIndex((ligne) => ligne.includes(APPEL_DE_CHARGEMENT));
  if (appel < 0) return null;

  let debut = appel;
  while (debut > 0 && !lignes[debut].includes('useEffect(')) debut -= 1;

  let fin = appel;
  while (fin < lignes.length - 1 && !/^\s*\}, \[/.test(lignes[fin])) fin += 1;

  return { debut, fin };
}

/**
 * La ligne, privée de ses chaînes et de son commentaire. Les chaînes d'abord :
 * sans cela, un `//` à l'intérieur d'une chaîne couperait la ligne au mauvais
 * endroit.
 */
function sansChainesNiCommentaire(ligne: string): string {
  return ligne
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/\/\/.*$/, '');
}

/**
 * Un usage **nu** du nom : ni précédé d'un point — `charge.logement` ne lit pas
 * la variable `logement` —, ni suivi d'un caractère de mot, pour que
 * `logementId` ne compte pas comme `logement`, ni suivi de `:`, pour qu'une clé
 * d'objet ou une annotation de type ne compte pas comme une lecture.
 */
function usageNu(ligne: string, nom: string): boolean {
  return new RegExp(`(?<![\\w$.])${nom}(?![\\w$]|\\s*:)`).test(ligne);
}

test('un écran ne lit pas une variable de contexte avant de la déstructurer', () => {
  const manquements: string[] = [];
  let fenetres = 0;

  for (const chemin of fichiersTsx(DOSSIER_APP)) {
    const relatif = chemin.slice(DOSSIER_APP.length + 1).replace(/\\/g, '/');
    const lignes = readFileSync(chemin, 'utf8').split('\n');

    const rang = lignes.findIndex((ligne) => DESTRUCTURATION.test(ligne));
    if (rang < 0) continue;

    const fenetre = fenetreDeChargement(lignes);
    if (!fenetre) continue;
    fenetres += 1;

    const noms = nomsDeclares(DESTRUCTURATION.exec(lignes[rang])![1]);
    for (const nom of noms) {
      const jusqua = Math.min(rang, fenetre.fin + 1);
      for (let index = fenetre.debut; index < jusqua; index += 1) {
        const ligne = sansChainesNiCommentaire(lignes[index]);
        if (!usageNu(ligne, nom)) continue;
        manquements.push(
          `${relatif}:${index + 1} lit « ${nom} » avant sa déstructuration ` +
            `(ligne ${rang + 1})\n      ${lignes[index].trim()}`,
        );
      }
    }
  }

  // Le plancher est vérifié AVANT les manquements : un contrôle qui ne trouve
  // plus sa cible doit le dire, et non se contenter d'un « aucun défaut ».
  assert.ok(
    fenetres >= MINIMUM_DE_FENETRES,
    `le contrôle n'a trouvé que ${fenetres} fenêtre(s) de chargement, or le ` +
      `projet en compte au moins ${MINIMUM_DE_FENETRES} : le motif ne correspond ` +
      `plus, et un contrôle muet est vert.`,
  );

  assert.deepEqual(
    manquements,
    [],
    `Une variable de contexte est lue avant d'être déstructurée :\n\n  ` +
      `${manquements.join('\n\n  ')}\n\n` +
      `Ces écrans chargent leur contexte de façon asynchrone, puis rendent un ` +
      `retour anticipé tant qu'il est nul. Le rappel de chargement s'exécute ` +
      `alors que ce retour a déjà eu lieu : la déstructuration n'a jamais été ` +
      `atteinte, et la variable vaut undefined. Passer par « charge. » ou ` +
      `« contexte?. ».`,
  );
});

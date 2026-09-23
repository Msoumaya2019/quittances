/**
 * Tout écran de `app/` doit pouvoir être atteint.
 *
 * Un écran écrit, complet, et que rien ne monte est du code mort — et il ne se
 * signale pas : il compile, il passe le typage, et son absence ne se voit qu'en
 * cherchant un bouton qui n'existe pas.
 *
 * Mesuré le 23 septembre 2026 : `app/logement/[id]/modifier.tsx` permettait de
 * corriger une adresse, une référence ou un jour d'échéance, et **aucun écran
 * n'y menait**. Le bailleur devait supprimer le logement pour le recréer, donc
 * perdre son historique de quittances.
 *
 * Le contrôle **dérive** la liste des écrans du dossier, et non d'une liste
 * recopiée : un écran ajouté demain est vu sans qu'on y pense. Deux planchers
 * l'empêchent de verdir sur un dossier vide ou un motif devenu faux.
 *
 * Leçon de la première version : elle ne connaissait qu'une forme de renvoi —
 * `pathname: '/x'` — et a accusé cinq écrans parfaitement atteignables, tous
 * appelés en chaîne nue depuis l'écran des réglages (`router.push('/mentions')`,
 * `router.push('/signature')`, `router.push('/sauvegarde/export')`,
 * `router.push('/sauvegarde/import')`, `router.push('/proprietaire')`).
 * Un contrôle qui n'essaie qu'une ancre accuse le code à la place de son motif :
 * les trois formes réellement employées dans le projet sont donc lues.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER_APP = join(ICI, '..', 'app');

/** Les fichiers qui ne sont pas des écrans : layouts, pages spéciales. */
const NON_ECRAN = /^(_|\+)/;

/** Planchers : sans eux, un dossier déplacé rendrait le contrôle vert. */
const MINIMUM_D_ECRANS = 10;
const MINIMUM_DE_RENVOIS = 5;

interface Ecran {
  /** Chemin relatif au dossier `app/`, pour le message d'erreur. */
  fichier: string;
  /** Chemin de route, tel qu'un appelant l'écrirait. */
  chemin: string;
  /** Vrai si l'écran vit sous le groupe `(tabs)` — donc monté par un onglet. */
  onglet: boolean;
}

/**
 * Les trois formes de renvoi réellement employées dans le projet :
 *
 *   router.push('/mentions')            chaîne nue
 *   router.push({ pathname: '/x' })     objet, avec ou sans paramètres
 *   <Link href="/x">                    attribut
 *
 * Les ancres sont ASCII et n'enjambent pas de retour à la ligne.
 */
const MOTIFS_DE_RENVOI = [
  /pathname:\s*'([^'\n]+)'/g,
  /router\.(?:push|replace|navigate)\(\s*'([^'\n]+)'/g,
  /href=\{?'([^'\n]+)'/g,
];

/** Tous les fichiers de code du dossier, écrans comme layouts. */
function fichiersDeCode(racine: string, prefixe = ''): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(racine)) {
    const complet = join(racine, entree);
    if (statSync(complet).isDirectory()) {
      trouves.push(...fichiersDeCode(complet, `${prefixe}${entree}/`));
      continue;
    }
    if (/\.tsx?$/.test(entree)) trouves.push(`${prefixe}${entree}`);
  }
  return trouves;
}

/** La liste des écrans, dérivée du dossier — jamais recopiée. */
function listerEcrans(racine: string, prefixe = ''): Ecran[] {
  const ecrans: Ecran[] = [];
  for (const entree of readdirSync(racine)) {
    const complet = join(racine, entree);
    if (statSync(complet).isDirectory()) {
      ecrans.push(...listerEcrans(complet, `${prefixe}${entree}/`));
      continue;
    }
    if (!/\.tsx?$/.test(entree) || NON_ECRAN.test(entree)) continue;

    const nom = entree.replace(/\.tsx?$/, '');
    const segments = `${prefixe}${nom}`.split('/').filter(Boolean);
    const onglet = segments.includes('(tabs)');

    // Un groupe `(tabs)` ne figure pas dans le chemin ; `index` non plus.
    const utiles = segments.filter((s) => !s.startsWith('(') && s !== 'index');
    ecrans.push({
      fichier: `${prefixe}${entree}`,
      chemin: `/${utiles.join('/')}`,
      onglet,
    });
  }
  return ecrans;
}

/** Les routes citées par un fichier donné. */
function renvoisDe(source: string): Set<string> {
  const trouves = new Set<string>();
  for (const motif of MOTIFS_DE_RENVOI) {
    for (const [, chemin] of source.matchAll(motif)) trouves.add(chemin);
  }
  return trouves;
}

test('Écrans : chacun est atteignable depuis un autre écran', () => {
  const ecrans = listerEcrans(DOSSIER_APP);

  assert.ok(
    ecrans.length >= MINIMUM_D_ECRANS,
    `seulement ${ecrans.length} écran(s) trouvé(s) dans app/ — le contrôle ne mesure rien`,
  );

  // Un écran ne se rend pas atteignable lui-même : on cherche donc le renvoi
  // chez les autres fichiers, layouts compris.
  const parFichier = new Map<string, Set<string>>();
  for (const fichier of fichiersDeCode(DOSSIER_APP)) {
    parFichier.set(fichier, renvoisDe(readFileSync(join(DOSSIER_APP, fichier), 'utf8')));
  }

  const tous = new Set<string>();
  for (const chemins of parFichier.values()) for (const c of chemins) tous.add(c);
  assert.ok(
    tous.size >= MINIMUM_DE_RENVOIS,
    `seulement ${tous.size} renvoi(s) trouvé(s) — le motif ne mesure plus rien`,
  );

  const orphelins: string[] = [];
  for (const ecran of ecrans) {
    if (ecran.onglet) {
      // Un onglet est monté par le layout de la barre : c'est son `name` qui
      // compte, et le fichier de layout vit dans le même dossier.
      const layout = readFileSync(join(DOSSIER_APP, '(tabs)/_layout.tsx'), 'utf8');
      const nom = ecran.fichier.split('/').pop()?.replace(/\.tsx?$/, '') ?? '';
      if (!layout.includes(`name="${nom}"`)) orphelins.push(ecran.fichier);
      continue;
    }

    let atteint = false;
    for (const [fichier, chemins] of parFichier) {
      if (fichier === ecran.fichier) continue;
      if (chemins.has(ecran.chemin)) {
        atteint = true;
        break;
      }
    }
    if (!atteint) orphelins.push(ecran.fichier);
  }

  assert.deepEqual(
    orphelins,
    [],
    `écran(s) que rien ne monte : ${orphelins.join(', ')}`,
  );
});

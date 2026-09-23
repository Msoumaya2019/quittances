/**
 * Éprouve le bloc qui écrit le résumé de fin de compilation iOS.
 *
 * Ce bloc est le seul endroit où l'utilisateur lit ce que le fichier iOS permet.
 * Il a porté une phrase fausse — « ou à être signée ensuite » — pour un binaire
 * de simulateur, qui ne s'installera sur aucun iPhone même signé. On l'exécute
 * donc réellement, dans les deux branches, au lieu de le relire.
 *
 * PORTÉE — ce que ce script attrape, et ce qu'il ne voit pas.
 *
 * Attrapé :
 *  - le retour d'une promesse de signature sur une compilation de simulateur ;
 *  - la disparition de la clause qui dit qu'il ne s'installe sur aucun iPhone ;
 *  - un bloc qui n'écrit plus rien, ou qui sort en erreur.
 *
 * PAS attrapé :
 *  - le fait que le binaire soit réellement de simulateur. Ce script vérifie ce
 *    que le flux DIT ; la plateforme du binaire se mesure sur le binaire
 *    (`DTPlatformName`, `LC_BUILD_VERSION`), pas ici ;
 *  - une reformulation qui dirait la même chose autrement : les motifs sont des
 *    phrases, et les changer oblige à mettre ce fichier à jour. C'est voulu —
 *    une porte doit s'ouvrir consciemment.
 *
 * Les expressions GitHub sont remplacées par leur valeur, le script est confié à
 * `bash -e`, et le résumé est relu dans `GITHUB_STEP_SUMMARY`.
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';

const flux = yaml.load(readFileSync('.github/workflows/ios-ipa.yml', 'utf8'));
const etapes = flux.jobs['construire-ipa'].steps;
const etape = etapes.find((e) => e.name === 'Rappeler ce que ce fichier permet');

if (!etape) {
  console.error('[etape-absente] « Rappeler ce que ce fichier permet » est introuvable.');
  process.exit(1);
}

const attendus = {
  // Ce que la branche non signée doit dire, et ce qu'elle ne doit plus dire.
  false: {
    // La clause decisive est « ni maintenant, ni apres signature » : c'est elle
    // qui empeche l'utilisateur de croire qu'une signature suffirait.
    obligatoires: [
      'simulateur',
      'aucun iPhone',
      'ni après',
      'signature',
      'xcrun simctl install',
      'archive tar.gz',
      // Le renvoi vers le flux qui, lui, produit un fichier installable. Sans
      // lui, ce resume laisse l'utilisateur sans issue alors qu'une existe,
      // dans le meme depot.
      'IPA appareil',
    ],
    interdits: ['être signée ensuite', 're-sign', 'à être signée'],
  },
  true: {
    obligatoires: ['signée par Expo', "l'adresse de téléchargement"],
    interdits: ['aucun iPhone', 'simulateur'],
  },
};

let echecs = 0;
let controles = 0;

for (const valeur of ['false', 'true']) {
  const dossier = mkdtempSync(join(tmpdir(), 'resume-ios-'));
  const fichierResume = join(dossier, 'resume.md');

  // L'expression est neutralisée exactement comme GitHub le ferait.
  const script = etape.run.replace(/\$\{\{\s*inputs\.signer_avec_expo\s*\}\}/g, valeur);

  if (script === etape.run) {
    console.error('[expression-absente] le bloc ne cite pas `inputs.signer_avec_expo`.');
    process.exit(1);
  }

  const resultat = spawnSync('bash', ['-e', '-c', script], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: fichierResume },
  });

  console.log('='.repeat(72));
  console.log(`signer_avec_expo = ${valeur}   (code ${resultat.status})`);
  console.log('='.repeat(72));

  controles += 1;
  if (resultat.status !== 0) {
    console.error(`  ECHEC  le bloc est sorti en ${resultat.status}`);
    console.error(`         ${(resultat.stderr || '').trim().split('\n')[0]}`);
    echecs += 1;
  }

  let resume = '';
  try {
    resume = readFileSync(fichierResume, 'utf8');
  } catch {
    console.error('  ECHEC  aucun résumé écrit : le bloc n’a rien produit.');
    echecs += 1;
  }

  console.log(resume.trimEnd());
  console.log('');

  for (const motif of attendus[valeur].obligatoires) {
    controles += 1;
    if (!resume.includes(motif)) {
      console.error(`  ECHEC  le résumé ne dit pas « ${motif} »`);
      echecs += 1;
    }
  }
  for (const motif of attendus[valeur].interdits) {
    controles += 1;
    if (resume.includes(motif)) {
      console.error(`  ECHEC  le résumé dit encore « ${motif} », qui est faux ici`);
      echecs += 1;
    }
  }
}

console.log('='.repeat(72));
console.log(`${controles} contrôles, ${echecs} échec(s).`);
process.exit(echecs > 0 ? 1 : 0);

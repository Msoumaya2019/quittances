/**
 * Éprouve le bloc qui écrit le résumé de fin de compilation « IPA appareil ».
 *
 * Ce bloc est le seul endroit où l'utilisateur lit ce que le fichier permet.
 * Pour ce flux, la phrase décisive est double : le fichier est compilé pour un
 * **iPhone**, et il n'est **pas signé** — donc il ne s'installe qu'après
 * signature par un outil comme eSign. Dire l'un sans l'autre trompe :
 * « installable » seul ferait croire qu'il s'installe tel quel, et « non signé »
 * seul ferait douter qu'il puisse s'installer un jour.
 *
 * PORTÉE — ce que ce script attrape, et ce qu'il ne voit pas.
 *
 * Attrapé :
 *  - un résumé qui ne dit plus que le fichier vise un iPhone ;
 *  - un résumé qui ne dit plus qu'il n'est pas signé ;
 *  - le retour d'une phrase de simulateur, qui serait fausse ici ;
 *  - un bloc qui n'écrit rien, ou qui sort en erreur ;
 *  - la disparition du nom de fichier, qui doit venir de l'étape précédente.
 *
 * PAS attrapé :
 *  - le fait que le binaire vise réellement l'appareil. Ce script vérifie ce
 *    que le flux DIT ; la plateforme se mesure sur le binaire livré
 *    (`DTPlatformName`, en-tête Mach-O), par le banc `.verif/verifier-ipa-appareil.py`
 *    puis par l'étape de contrôle du flux lui-même ;
 *  - une reformulation qui dirait la même chose autrement : les motifs sont des
 *    phrases, et les changer oblige à mettre ce fichier à jour. C'est voulu —
 *    une porte doit s'ouvrir consciemment.
 *
 * Le script est confié à `bash -e`, et le résumé est relu dans
 * `GITHUB_STEP_SUMMARY`, comme GitHub le fait.
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';

const FLUX = '.github/workflows/ios-ipa-appareil.yml';
const NOM_DU_FICHIER = 'Quittances-1.0.0-appareil-non-signe.ipa';

/** Phrases qui doivent être dites, et celles qui seraient fausses ici. */
const ATTENDUS = {
  obligatoires: [
    'iPhone',
    'pas signé',
    'eSign',
    'votre certificat',
    'iphoneos',
    NOM_DU_FICHIER,
  ],
  interdits: ['aucun iPhone', 'non installable', 'compilation de simulateur'],
};

const flux = yaml.load(readFileSync(FLUX, 'utf8'));
const job = flux.jobs['construire-ipa-appareil'];

if (!job) {
  console.error('[travail-absent] « construire-ipa-appareil » est introuvable.');
  process.exit(1);
}

const etape = (job.steps ?? []).find((e) => e.name === 'Rappeler ce que ce fichier permet');

if (!etape || !etape.run) {
  console.error('[etape-absente] « Rappeler ce que ce fichier permet » est introuvable, ou ne s\'exécute pas.');
  process.exit(1);
}

const dossier = mkdtempSync(join(tmpdir(), 'resume-ipa-appareil-'));
const fichierResume = join(dossier, 'resume.md');

const resultat = spawnSync('bash', ['-e', '-c', etape.run], {
  encoding: 'utf8',
  // `FICHIER` vient de l'étape précédente, par `$GITHUB_ENV`. On le fournit
  // donc ici : sans lui, le résumé serait éprouvé dans un état qui n'existe
  // jamais sur l'exécuteur.
  env: { ...process.env, GITHUB_STEP_SUMMARY: fichierResume, FICHIER: NOM_DU_FICHIER },
});

let echecs = 0;
let controles = 0;

console.log('='.repeat(72));
console.log(`bloc de résumé, code ${resultat.status}`);
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

// Un succès vide est une anomalie, pas un résultat.
controles += 1;
if (resume.trim().length === 0) {
  console.error('  ECHEC  le résumé est vide.');
  echecs += 1;
}

console.log(resume.trimEnd());
console.log('');

/**
 * Le résumé est du Markdown, écrit ligne par ligne : ses phrases sont coupées
 * là où l'auteur les a écrites, et il met en gras ce qu'il veut souligner.
 * Un motif qui traverse une fin de ligne — ou un `**` — ne correspondrait donc
 * pas, non parce que le texte serait faux, mais parce que la garde supposerait
 * une mise en forme. C'est arrivé au premier lancement : « votre certificat »
 * était coupé après « votre », puis séparé par le gras.
 *
 * On compare donc sur un texte débarrassé du gras et des blancs superflus, des
 * deux côtés. La garde porte ainsi sur ce qui est **dit**, pas sur la façon de
 * l'écrire.
 */
function normaliser(texte) {
  return texte.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

const resumeLu = normaliser(resume);

for (const motif of ATTENDUS.obligatoires) {
  controles += 1;
  if (!resumeLu.includes(normaliser(motif))) {
    console.error(`  ECHEC  le résumé ne dit pas « ${motif} »`);
    echecs += 1;
  }
}
for (const motif of ATTENDUS.interdits) {
  controles += 1;
  if (resumeLu.includes(normaliser(motif))) {
    console.error(`  ECHEC  le résumé dit « ${motif} », qui est faux pour ce fichier`);
    echecs += 1;
  }
}

console.log('='.repeat(72));
console.log(`${controles} contrôles, ${echecs} échec(s).`);
process.exit(echecs > 0 ? 1 : 0);

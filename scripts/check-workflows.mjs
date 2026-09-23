/**
 * Contrôle des flux de travail GitHub Actions, avant de pousser.
 *
 * PORTÉE — ce que ce script attrape, et ce qu'il ne voit pas.
 *
 * Attrapé :
 *  - un YAML invalide (le flux ne démarrerait pas) ;
 *  - un script `run:` que `bash -n` refuse : `then` manquant, `fi` orphelin,
 *    quote non fermée, bloc scalaire terminé par une ligne à la colonne 0 ;
 *  - une action non épinglée à une version ;
 *  - un `permissions` absent, ou insuffisant pour ce que le flux fait ;
 *  - `runs-on` absent, `on` absent ou renommé, étape qui ne fait rien.
 *
 * PAS attrapé, et il faut le savoir :
 *  - une expansion fautive (`${CHEMIN}` mal orthographié) : `bash -n` analyse
 *    sans évaluer. Elle ne se voit qu'à l'exécution ;
 *  - un `run:` multiligne qui enchaîne plusieurs commandes : sous `bash -e`,
 *    l'échec de la première supprime les suivantes. C'est un défaut
 *    d'exécution, invisible à l'analyse statique ;
 *  - une version d'action dépréciée : le moteur se lit dans le manifeste de
 *    l'action, pas dans son numéro de version ;
 *  - le contenu réellement produit par la compilation.
 *
 * Les flux attendus sont énumérés à la main, plus bas. C'est volontaire : ce
 * script est le seul lecteur de `.github/workflows`, donc un dossier vidé le
 * laisserait vert.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';

const DOSSIER = '.github/workflows';

/**
 * Liste fermée. Ajouter un flux oblige à l'inscrire ici — ce qui force à se
 * demander s'il doit tourner à chaque poussée ou seulement à la demande.
 */
const FLUX_ATTENDUS = ['android-apk.yml', 'ios-ipa.yml'];

/**
 * Étape à partir de laquelle un ARTEFACT est publié : elle exige des droits
 * d'écriture. Un `permissions` de job REMPLACE celui de la racine.
 */
const COMMANDES_EXIGEANT_ECRITURE = ['gh release create', 'gh release upload'];

let verifications = 0;
const defauts = [];

function verifier(condition, message, marqueur, ou) {
  verifications += 1;
  if (!condition) {
    defauts.push(`${marqueur} ${ou} — ${message}`);
  }
}

/** Remplace les expressions GitHub par une valeur inerte. */
function neutraliser(script) {
  return script.replace(/\$\{\{[^}]*\}\}/g, 'VALEUR');
}

// ---------------------------------------------------------------------------
// Découverte des fichiers
// ---------------------------------------------------------------------------

let fichiers;
try {
  fichiers = readdirSync(DOSSIER)
    .filter((nom) => nom.endsWith('.yml') || nom.endsWith('.yaml'))
    .sort();
} catch {
  console.error(`[flux-absent] ${DOSSIER} — le dossier est introuvable.`);
  process.exit(1);
}

for (const attendu of FLUX_ATTENDUS) {
  verifier(
    fichiers.includes(attendu),
    'flux attendu absent du dossier',
    '[flux-absent]',
    attendu,
  );
}
for (const trouve of fichiers) {
  verifier(
    FLUX_ATTENDUS.includes(trouve),
    'flux présent mais non déclaré dans FLUX_ATTENDUS',
    '[flux-non-declare]',
    trouve,
  );
}

// ---------------------------------------------------------------------------
// Analyse de chaque flux
// ---------------------------------------------------------------------------

for (const nom of fichiers) {
  const ou = nom;
  let flux;

  try {
    flux = yaml.load(readFileSync(join(DOSSIER, nom), 'utf8'));
  } catch (e) {
    verifier(false, `YAML invalide : ${e.message.split('\n')[0]}`, '[yaml-invalide]', ou);
    continue;
  }

  verifications += 1;
  if (!flux || typeof flux !== 'object') {
    defauts.push(`[yaml-invalide] ${ou} — le fichier ne contient pas d'objet.`);
    continue;
  }

  // Le déclencheur. `on:` peut ressortir en clé `true` selon l'analyseur.
  const declencheur = flux.on ?? flux[true];
  verifier(
    declencheur !== undefined && declencheur !== null,
    'aucun déclencheur `on:`',
    '[sans-declencheur]',
    ou,
  );

  const jobs = flux.jobs ?? {};
  verifier(
    Object.keys(jobs).length > 0,
    'aucun travail déclaré',
    '[sans-travail]',
    ou,
  );

  for (const [nomJob, job] of Object.entries(jobs)) {
    const ouJob = `${ou} › ${nomJob}`;

    // Permissions effectives : celles du job remplacent celles de la racine.
    const effectives = job.permissions ?? flux.permissions;
    verifier(
      effectives !== undefined,
      'aucun bloc `permissions:` (ni à la racine, ni sur le travail)',
      '[sans-permissions]',
      ouJob,
    );

    verifier(
      typeof job['runs-on'] === 'string' && job['runs-on'].length > 0,
      '`runs-on` absent',
      '[sans-executeur]',
      ouJob,
    );

    for (const etape of job.steps ?? []) {
      const nomEtape = etape.name ?? '(étape sans nom)';
      const ouEtape = `${ouJob} › ${nomEtape}`;

      // Une étape fait quelque chose : `uses` ou `run`.
      verifier(
        Boolean(etape.uses) || Boolean(etape.run),
        'étape sans `uses:` ni `run:`',
        '[etape-vide]',
        ouEtape,
      );

      // Action épinglée : `owner/repo@vX`, jamais `owner/repo`.
      if (etape.uses) {
        const epinglee = /^[^./][^@]*@[^@]+$/.test(etape.uses);
        verifier(
          epinglee,
          `action non épinglée : ${etape.uses}`,
          '[action-non-epinglee]',
          ouEtape,
        );
      }

      if (!etape.run) continue;

      // Syntaxe du script, expressions neutralisées.
      const script = neutraliser(etape.run);
      const fichierTemporaire = join(tmpdir(), `flux-${nom}-${nomJob}-${nomEtape}.sh`);
      writeFileSync(fichierTemporaire, script, 'utf8');

      const analyse = spawnSync('bash', ['-n', fichierTemporaire], { encoding: 'utf8' });
      verifier(
        analyse.status === 0,
        `script refusé par bash -n : ${(analyse.stderr || '').split('\n')[0]}`,
        '[script-invalide]',
        ouEtape,
      );

      // Droits d'écriture si le script publie une version.
      const publie = COMMANDES_EXIGEANT_ECRITURE.some((c) => script.includes(c));
      if (publie) {
        const droitEcriture =
          effectives === 'write-all' ||
          (typeof effectives === 'object' &&
            effectives !== null &&
            effectives.contents === 'write');
        verifier(
          droitEcriture,
          'ce script publie une version mais les permissions ne donnent pas `contents: write`',
          '[permissions-insuffisantes]',
          ouEtape,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

console.log(
  `${verifications} vérifications sur ${fichiers.length} flux de travail` +
    ` (${fichiers.join(', ')}).`,
);

if (defauts.length > 0) {
  console.error('');
  for (const defaut of defauts) console.error(defaut);
  console.error('');
  console.error(`${defauts.length} défaut(s).`);
  process.exit(1);
}

console.log('Aucun défaut.');

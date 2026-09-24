/**
 * Le bail de location, en HTML et CSS millimétrés.
 *
 * Module **pur** : ni SQLite, ni React, ni `expo-print`. Il produit une chaîne
 * HTML, ce qui le rend exécutable sous `node --test` — la mise en page d'un
 * bail ne se vérifie pas à l'œil sur un téléphone.
 *
 * Deux règles de fond gouvernent ce fichier :
 *
 *  1. **Aucune clause n'est inventée.** Les seules mentions réglementaires
 *     imprimées sont celles du module de domaine `bail.ts`, chacune adossée à
 *     une source officielle datée. Le texte libre du bailleur est reproduit tel
 *     quel, et signalé comme tel.
 *  2. **Une signature dessinée à l'écran n'est pas une signature électronique
 *     certifiée.** Le document le dit lui-même, en clair, sous les signatures.
 *     Laisser croire l'inverse serait la seule faute vraiment grave de ce
 *     fichier.
 */

import { formatMontant } from '../domain/money.ts';
import type { Centimes } from '../domain/money.ts';
import {
  LIBELLE_ANNEXE,
  LIBELLE_BAIL,
  REGLES_BAIL,
  SOURCES_BAIL,
  type BrouillonBail,
  type CategorieBail,
  type SignatureBail,
  type TypeAnnexe,
} from '../domain/bail.ts';
import { adresseEnLignes } from '../domain/types.ts';
import { chaineVersOctets, octetsVersBase64 } from './encodage.ts';
import { COULEURS_DOCUMENT, echapper, STYLES_BASE } from './styles.ts';

// ---------------------------------------------------------------------------
// Contenu
// ---------------------------------------------------------------------------

export interface PartieBailleur {
  nom: string;
  qualite?: string | null;
  adresse: string;
  codePostal: string;
  ville: string;
  telephone?: string | null;
  email?: string | null;
  siret?: string | null;
}

export interface PartieLocataire {
  nom: string;
  prenom: string;
  dateNaissance?: string | null;
  lieuNaissance?: string | null;
  telephone?: string | null;
  email?: string | null;
}

export interface LogementBail {
  nom: string;
  complement?: string | null;
  adresse: string;
  codePostal: string;
  ville: string;
  surface?: number | null;
  reference?: string | null;
}

export interface DiagnosticBail {
  libelle: string;
  /** Date de réalisation, `AAAA-MM-JJ`. */
  date: string;
  /**
   * Le bailleur estime-t-il ce diagnostic à renouveler ?
   *
   * C'est **sa** décision, et non un jugement de l'application : les durées de
   * validité dépendent du diagnostic, de son résultat et de l'ancienneté de
   * l'installation. L'application imprime ce qu'on lui dit.
   */
  perime?: boolean;
}

/** Tout ce qui est imprimé sur un bail. */
export interface ContenuBail {
  categorie: CategorieBail;
  bailleur: PartieBailleur;
  locataires: PartieLocataire[];
  logement: LogementBail;
  /** Date de prise d'effet, `AAAA-MM-JJ`. */
  dateDebut: string;
  dureeMois: number;
  loyer: Centimes;
  charges: Centimes;
  depotGarantie: Centimes;
  jourEcheance: number;
  /** Motif du locataire — obligatoire pour un bail mobilité. */
  motifMobilite?: string | null;
  diagnostics?: DiagnosticBail[];
  /** Texte libre du bailleur. Reproduit tel quel, et signalé comme tel. */
  clausesParticulieres?: string | null;
  annexes: TypeAnnexe[];
  signatures: SignatureBail[];
  /** Lieu d'établissement du document. */
  lieu?: string | null;
  /** Date d'établissement, `AAAA-MM-JJ`. */
  etabliLe: string;
  /**
   * Le logement doit-il être occupé à titre de résidence principale ?
   * Mention rendue obligatoire par les contrats types du 1er octobre 2026
   * quand la commune l'impose.
   */
  residencePrincipale?: boolean;
}

// ---------------------------------------------------------------------------
// Mise en page
// ---------------------------------------------------------------------------

/**
 * Le bail est un document **long** : il change de page. Les règles de coupure
 * sont donc explicites — un bloc de signatures ne se scinde pas, et un titre de
 * section ne reste pas seul en bas de page.
 */
export const STYLES_BAIL = `
  /* Le format de page vient de STYLES_BASE (A4) : on ne le redeclare pas ici,
     un second @page l'emporterait sur le premier selon le moteur.

     En revanche on reprend la classe page. Celle de STYLES_BASE est une
     **colonne flex** à hauteur minimale de 285 mm, dessinée pour une quittance
     qui tient sur une feuille. Un bail, lui, change de page : une colonne flex
     se pagine mal — le moteur peut refuser de couper un enfant flex et
     repousser tout le contenu, ou rogner la hauteur minimale. On repasse donc
     en bloc, et on laisse le contenu décider du nombre de feuilles.
     (Les accents graves sont proscrits dans ce commentaire : il vit à
     l'intérieur d'un littéral de gabarit, et ils fermeraient la chaîne.) */
  .page {
    display: block;
    min-height: 0;
    padding: 12mm 18mm 12mm 18mm;
  }

  .b-bandeau {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8mm;
    border-bottom: 0.6mm solid ${COULEURS_DOCUMENT.principale};
    padding-bottom: 3mm;
    margin-bottom: 6mm;
  }
  .b-bandeau h1 {
    font-size: 16pt;
    font-weight: 700;
    color: ${COULEURS_DOCUMENT.principaleFonce};
    margin: 0 0 1.5mm 0;
  }
  .b-bandeau .b-sous-titre { font-size: 10pt; color: ${COULEURS_DOCUMENT.texteSecondaire}; }
  .b-bandeau .b-etabli {
    font-size: 8.5pt;
    color: ${COULEURS_DOCUMENT.texteTertiaire};
    text-align: right;
    white-space: nowrap;
  }

  .b-sections { display: block; }

  .b-section {
    break-inside: avoid-page;
    page-break-inside: avoid;
    margin-bottom: 5mm;
  }

  .b-section > h2 {
    break-after: avoid-page;
    page-break-after: avoid;
    font-size: 10.5pt;
    font-weight: 700;
    color: ${COULEURS_DOCUMENT.principaleFonce};
    border-bottom: 0.4mm solid ${COULEURS_DOCUMENT.principale};
    padding-bottom: 1.2mm;
    margin: 0 0 2.5mm 0;
  }

  .b-table { width: 100%; border-collapse: collapse; }
  .b-table th, .b-table td {
    text-align: left;
    vertical-align: top;
    padding: 1.5mm 2mm;
    font-size: 9pt;
    border-bottom: 0.2mm solid ${COULEURS_DOCUMENT.bordure};
  }
  .b-table th {
    width: 42mm;
    font-weight: 600;
    color: ${COULEURS_DOCUMENT.texteSecondaire};
  }

  .b-parties { display: flex; gap: 4mm; }
  .b-partie {
    flex: 1;
    border: 0.3mm solid ${COULEURS_DOCUMENT.bordure};
    border-radius: 2mm;
    padding: 3mm;
  }
  .b-partie h3 {
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.4pt;
    color: ${COULEURS_DOCUMENT.principaleFonce};
    margin: 0 0 2mm 0;
  }
  .b-partie p { margin: 0 0 1mm 0; font-size: 9.5pt; }
  .b-partie p.nom { font-weight: 700; font-size: 10.5pt; }
  /* Deux groupes dans une même carte se séparent par un filet, sans quoi deux
     locataires se liraient d'un trait. */
  .b-groupe + .b-groupe {
    margin-top: 3mm;
    padding-top: 2.5mm;
    border-top: 0.2mm dashed ${COULEURS_DOCUMENT.bordure};
  }

  .b-argent { font-size: 9.5pt; }
  .b-argent strong { font-size: 11pt; }

  .b-texte-libre {
    font-size: 9pt;
    line-height: 1.45;
    white-space: pre-wrap;
    border-left: 1mm solid ${COULEURS_DOCUMENT.principale};
    padding-left: 3mm;
    margin: 0;
  }

  .b-vigilance, .b-annexes { margin: 0; padding-left: 4.5mm; }
  .b-vigilance li, .b-annexes li { font-size: 8.5pt; line-height: 1.4; margin-bottom: 1.2mm; }

  .b-diagnostic-perime { color: ${COULEURS_DOCUMENT.orange}; font-weight: 600; }

  .b-signatures {
    display: flex;
    gap: 4mm;
    break-inside: avoid-page;
    page-break-inside: avoid;
  }
  .b-signature { flex: 1; }
  .b-signature .b-cadre {
    height: 24mm;
    border: 0.3mm solid ${COULEURS_DOCUMENT.bordure};
    border-radius: 2mm;
    margin-bottom: 1.5mm;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .b-signature .b-cadre img { max-height: 22mm; max-width: 100%; }
  .b-signature .b-qui { font-size: 8.5pt; line-height: 1.35; }
  .b-signature .b-qui strong { font-size: 9.5pt; }
  .b-signature .b-vide { font-size: 8pt; color: ${COULEURS_DOCUMENT.texteTertiaire}; }

  .b-mention-signature {
    font-size: 7.5pt;
    line-height: 1.4;
    color: ${COULEURS_DOCUMENT.texteTertiaire};
    border-top: 0.2mm solid ${COULEURS_DOCUMENT.bordure};
    padding-top: 2mm;
    margin-top: 4mm;
  }

  .b-sources { font-size: 7pt; line-height: 1.35; color: ${COULEURS_DOCUMENT.texteTertiaire}; }
  .b-sources li { margin-bottom: 0.8mm; }
`;

// ---------------------------------------------------------------------------
// Mentions
// ---------------------------------------------------------------------------

/**
 * Ce que vaut une signature dessinée sur un écran.
 *
 * Elle n'est **pas** une signature électronique qualifiée : l'application n'a
 * ni certificat, ni horodatage, ni tiers de confiance, et le dit. Présenter
 * l'inverse serait la seule faute grave que ce document pourrait commettre.
 *
 * Aucun balisage de rédaction (`**`, `_`) dans cette chaîne : elle est échappée
 * avant d'atteindre le papier, et le balisage s'y imprimerait littéralement.
 * C'est arrivé une fois — « \*\*ne constituent pas\*\* » figurait tel quel sur le
 * document. Un test refuse désormais tout astérisque dans le rendu.
 */
export const MENTION_SIGNATURE =
  "Les signatures ci-dessus ont été tracées au doigt sur l'écran d'un téléphone, puis figées dans ce " +
  "document. Elles matérialisent l'accord des parties, comme un exemplaire signé à la main puis " +
  "numérisé. Elles ne constituent pas une signature électronique qualifiée au sens du règlement " +
  "(UE) n° 910/2014 : l'application ne délivre ni certificat, ni horodatage, ni cachet de tiers de " +
  "confiance. Chaque partie conserve un exemplaire du document.";

/** Ce que l'application ne fait pas, et que le bailleur doit faire lui-même. */
export const MENTION_ANNEXES =
  "Les annexes listées ci-dessus ne sont pas produites par cette application : elles doivent être " +
  "jointes au bail par le bailleur avant signature.";

/**
 * Un tracé de signature, transformé en image insérable dans le document.
 *
 * Le document insère la signature par une balise `img` : il lui faut donc une
 * **image**, pas un chemin. On produit un SVG encodé en base64 plutôt qu'un PNG
 * capturé à l'écran, et c'est délibéré : un SVG reste net à l'impression, à
 * n'importe quelle taille, et ne dépend d'aucun outil de capture — la même
 * chaîne fonctionne sur le téléphone, dans l'aperçu et sur le papier.
 *
 * Le tracé est reproduit **tel quel**. Une signature redessinée serait une
 * autre signature.
 */
export function traceEnDataUri(chemin: string, largeur: number, hauteur: number): string {
  const l = Math.max(1, Math.round(largeur));
  const h = Math.max(1, Math.round(hauteur));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l} ${h}" width="${l}" height="${h}">` +
    `<rect width="${l}" height="${h}" fill="#ffffff"/>` +
    `<path d="${chemin}" fill="none" stroke="#111111" stroke-width="2.5" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  return `data:image/svg+xml;base64,${octetsVersBase64(chaineVersOctets(svg))}`;
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

/** Une ligne « libellé / valeur » d'un tableau. */
function ligne(libelle: string, valeur: string): string {
  return `<tr><th>${echapper(libelle)}</th><td>${valeur}</td></tr>`;
}

function section(titre: string, corps: string): string {
  return `<section class="b-section"><h2>${echapper(titre)}</h2>${corps}</section>`;
}

/**
 * Une carte de partie, en **groupes** de lignes.
 *
 * Le groupement n'est pas cosmétique : deux locataires écrits à la suite se
 * lisent d'un trait, et l'on ne sait plus où finit l'un et où commence l'autre.
 */
function cartePartie(etiquette: string, groupes: string[][]): string {
  const corps = groupes
    .map((groupe) => {
      const lignes = groupe.filter((l) => l.trim().length > 0);
      if (lignes.length === 0) return '';
      return `<div class="b-groupe">${lignes
        .map((l, rang) => `<p class="${rang === 0 ? 'nom' : ''}">${echapper(l)}</p>`)
        .join('')}</div>`;
    })
    .join('');
  return `<div class="b-partie"><h3>${echapper(etiquette)}</h3>${corps}</div>`;
}

function dateFr(valeur: string): string {
  const [annee, mois, jour] = valeur.split('-');
  if (!annee || !mois || !jour) return valeur;
  return `${jour}/${mois}/${annee}`;
}

/**
 * La date de fin, en date civile `AAAA-MM-JJ`.
 *
 * Un bail de 12 mois commencé le 1er octobre 2026 court jusqu'au 30 septembre
 * 2027 inclus : la fin est la **veille** du jour anniversaire.
 *
 * Le jour est **ramené au dernier jour du mois** quand il n'y existe pas. Sans
 * ce ramenage, `Date.UTC(2027, 1, 31)` — le 31 février — déborde au 3 mars, et
 * un bail d'un mois commencé le 31 janvier finirait le 2 mars. Le calcul
 * paraîtrait juste sur tous les mois de 31 jours, et faux sur les autres.
 *
 * Rend une **date civile**, pas une date d'affichage : c'est la forme que la
 * base et les comparaisons manipulent. La mise en forme française est le
 * travail de `finDuBail`.
 */
export function finDuBailISO(dateDebut: string, dureeMois: number): string {
  const [annee, mois, jour] = dateDebut.split('-').map(Number);
  if (!annee || !mois || !jour) return dateDebut;

  // Le mois d'arrivée, puis son dernier jour.
  const arrivee = new Date(Date.UTC(annee, mois - 1 + dureeMois, 1));
  const dernierJour = new Date(
    Date.UTC(arrivee.getUTCFullYear(), arrivee.getUTCMonth() + 1, 0),
  ).getUTCDate();

  const fin = new Date(
    Date.UTC(arrivee.getUTCFullYear(), arrivee.getUTCMonth(), Math.min(jour, dernierJour)),
  );
  fin.setUTCDate(fin.getUTCDate() - 1);

  const mm = String(fin.getUTCMonth() + 1).padStart(2, '0');
  const jj = String(fin.getUTCDate()).padStart(2, '0');
  return `${fin.getUTCFullYear()}-${mm}-${jj}`;
}

/**
 * La date de fin, écrite pour être lue sur le papier : `jj/mm/aaaa`.
 *
 * Une seule mise en forme pour tout le projet — celle de `dateFr` — afin qu'un
 * bail n'affiche pas sa fin dans un format et sa prise d'effet dans un autre.
 */
export function finDuBail(dateDebut: string, dureeMois: number): string {
  const iso = finDuBailISO(dateDebut, dureeMois);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? dateFr(iso) : iso;
}

// ---------------------------------------------------------------------------
// Assemblage : du brouillon et des fiches au contenu imprimé
// ---------------------------------------------------------------------------

/**
 * Ce que l'application sait déjà, et que le bailleur n'a pas à ressaisir.
 *
 * Les trois formes sont **structurellement** celles de `domain/types.ts` :
 * `Proprietaire`, `Logement` et `TitulaireBail` satisfont ces interfaces telles
 * quelles. C'est délibéré — une fonction de conversion recopierait des champs,
 * et un champ ajouté d'un côté disparaîtrait silencieusement du document.
 * `tests/bail-contenu.test.ts` tient cet accord.
 */
export interface SourcesBail {
  bailleur: PartieBailleur;
  logement: LogementBail;
  locataires: PartieLocataire[];
}

export interface ReglagesBail {
  /** Lieu d'établissement imprimé. La ville du bailleur à défaut. */
  lieuEmission?: string | null;
}

/**
 * Assemble le contenu imprimé à partir du brouillon et des fiches.
 *
 * La règle qui compte est ici, et non dans l'écran : **ce qui s'imprime est ce
 * qui a été saisi**. Une valeur absente n'est pas remplacée par un défaut
 * plausible — un loyer à zéro, la date du jour — elle est laissée vide, et
 * c'est `manquesDuBail` qui empêche d'arriver jusqu'ici. Un défaut silencieux
 * produirait un bail signé portant un chiffre que personne n'a décidé.
 *
 * `etabliLe` est fourni par l'appelant : le module reste pur, donc éprouvable.
 */
export function contenuDepuis(params: {
  sources: SourcesBail;
  brouillon: BrouillonBail;
  reglages?: ReglagesBail;
  etabliLe: string;
}): ContenuBail {
  const { sources, brouillon, reglages, etabliLe } = params;

  // `manquesDuBail` a déjà refusé un brouillon sans catégorie. Ce repli existe
  // pour que la fonction ne lève jamais : un écran qui l'appellerait trop tôt
  // doit obtenir un document imparfait, pas une exception non rattrapée.
  const categorie = brouillon.categorie ?? 'vide';

  const diagnostics: DiagnosticBail[] = (brouillon.diagnostics ?? []).map((d) => ({
    libelle: d.libelle,
    date: d.date,
    // `aRenouveler` est la décision du bailleur. L'application ne juge pas la
    // validité d'un diagnostic : elle imprime ce qu'on lui dit.
    perime: d.aRenouveler === true,
  }));

  return {
    categorie,
    bailleur: sources.bailleur,
    locataires: sources.locataires,
    logement: sources.logement,
    dateDebut: brouillon.dateDebut ?? '',
    dureeMois: brouillon.dureeMois ?? 0,
    loyer: brouillon.loyer ?? 0,
    charges: brouillon.charges ?? 0,
    depotGarantie: brouillon.depotGarantie ?? 0,
    jourEcheance: brouillon.jourEcheance ?? 1,
    motifMobilite: brouillon.motifMobilite ?? null,
    diagnostics,
    clausesParticulieres: brouillon.clausesParticulieres ?? null,
    annexes: brouillon.annexesFournies ?? [],
    signatures: brouillon.signatures ?? [],
    lieu: reglages?.lieuEmission?.trim() || sources.bailleur.ville,
    etabliLe,
    residencePrincipale: brouillon.residencePrincipale ?? true,
  };
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

/**
 * Rend le bail complet.
 *
 * L'ordre des sections suit celui du formulaire guidé : les parties, puis le
 * logement, puis ce qui a été choisi — durée, argent, clauses — et enfin ce qui
 * engage, les annexes et les signatures.
 */
export function rendreBail(contenu: ContenuBail): string {
  const regle = REGLES_BAIL[contenu.categorie];
  const total = contenu.loyer + contenu.charges;

  const adresseBailleur = adresseEnLignes(contenu.bailleur);
  const adresseLogement = adresseEnLignes(contenu.logement);

  const parties = `<div class="b-parties">
      ${cartePartie('Bailleur', [
        [
          contenu.bailleur.qualite
            ? `${contenu.bailleur.nom} — ${contenu.bailleur.qualite}`
            : contenu.bailleur.nom,
          ...adresseBailleur,
          contenu.bailleur.telephone ? `Tél. ${contenu.bailleur.telephone}` : '',
          contenu.bailleur.email ?? '',
          contenu.bailleur.siret ? `SIRET ${contenu.bailleur.siret}` : '',
        ],
      ])}
      ${cartePartie(
        contenu.locataires.length > 1 ? 'Locataires' : 'Locataire',
        // Un groupe par locataire : sans cela, deux personnes se lisent d'un
        // trait et l'on ne sait plus où finit la première.
        contenu.locataires.map((l) => [
          `${l.prenom} ${l.nom}`.trim(),
          // « Né le » ou « Née le » supposerait une civilité que la base ne
          // porte pas, et qu'on n'invente donc pas : la première version du
          // document annonçait « Mohamed Benali — Née le 17/04/1988 ».
          l.dateNaissance
            ? `Naissance : ${dateFr(l.dateNaissance)}${l.lieuNaissance ? ` à ${l.lieuNaissance}` : ''}`
            : '',
          l.telephone ? `Tél. ${l.telephone}` : '',
          l.email ?? '',
        ]),
      )}
    </div>`;

  const logement = `<table class="b-table">
      ${ligne('Désignation', echapper(contenu.logement.nom))}
      ${ligne('Adresse', adresseLogement.map((l) => echapper(l)).join('<br />'))}
      ${ligne('Surface habitable', contenu.logement.surface ? `${contenu.logement.surface} m²` : '—')}
      ${ligne('Référence', contenu.logement.reference ? echapper(contenu.logement.reference) : '—')}
      ${
        contenu.residencePrincipale
          ? ligne(
              'Occupation',
              'Le logement doit être occupé à titre de <strong>résidence principale</strong>.',
            )
          : ''
      }
    </table>`;

  const duree = `<table class="b-table">
      ${ligne('Type de bail', echapper(LIBELLE_BAIL[contenu.categorie]))}
      ${ligne('Régime applicable', echapper(regle.regime))}
      ${ligne('Prise d’effet', echapper(dateFr(contenu.dateDebut)))}
      ${ligne('Durée', `${contenu.dureeMois} mois`)}
      ${ligne('Fin', echapper(finDuBail(contenu.dateDebut, contenu.dureeMois)))}
      ${
        contenu.motifMobilite
          ? ligne('Motif du locataire', echapper(contenu.motifMobilite))
          : ''
      }
    </table>`;

  const argent = `<table class="b-table b-argent">
      ${ligne('Loyer hors charges', `<strong>${echapper(formatMontant(contenu.loyer))}</strong> par mois`)}
      ${ligne('Provision pour charges', `${echapper(formatMontant(contenu.charges))} par mois`)}
      ${ligne('Total mensuel', `<strong>${echapper(formatMontant(total))}</strong>`)}
      ${ligne(
        'Dépôt de garantie',
        regle.depotGarantieInterdit
          ? '<strong>Interdit pour ce type de bail</strong> — aucun dépôt ne peut être demandé.'
          : contenu.depotGarantie > 0
            ? `${echapper(formatMontant(contenu.depotGarantie))} (plafond légal : ${regle.depotGarantieMois} mois de loyer hors charges)`
            : 'Aucun',
      )}
      ${ligne('Échéance', `Le ${contenu.jourEcheance} de chaque mois`)}
    </table>`;

  const diagnostics =
    contenu.diagnostics && contenu.diagnostics.length > 0
      ? `<table class="b-table">${contenu.diagnostics
          .map((d) =>
            ligne(
              d.libelle,
              `<span class="${d.perime ? 'b-diagnostic-perime' : ''}">${echapper(dateFr(d.date))}${
                d.perime ? ' — à renouveler' : ''
              }</span>`,
            ),
          )
          .join('')}</table>`
      : `<p class="b-texte-libre">Aucun diagnostic n’est renseigné. Le dossier de diagnostic technique doit être joint au bail.</p>`;

  const clauses = contenu.clausesParticulieres?.trim()
    ? `<p class="b-texte-libre">${echapper(contenu.clausesParticulieres.trim())}</p>`
    : '<p class="b-texte-libre">Aucune clause particulière n’a été saisie.</p>';

  const vigilance = `<ul class="b-vigilance">${regle.vigilance
    .map((v) => `<li>${echapper(v)}</li>`)
    .join('')}</ul>`;

  const annexes = `<ul class="b-annexes">${regle.annexes
    .map((a) => {
      const jointe = contenu.annexes.includes(a);
      return `<li>${jointe ? '☑' : '☐'} ${echapper(LIBELLE_ANNEXE[a])}${
        jointe ? '' : ' — <strong>non jointe à ce jour</strong>'
      }</li>`;
    })
    .join('')}</ul>
    <p class="b-mention-signature">${echapper(MENTION_ANNEXES)}</p>`;

  const signatures = `<div class="b-signatures">${signataires(contenu)
    .map(
      (s) => `<div class="b-signature">
        <div class="b-cadre">${
          s.signature
            ? `<img src="${echapper(s.signature.trace)}" alt="Signature de ${echapper(s.nom)}" />`
            : `<span class="b-vide">Non signé</span>`
        }</div>
        <div class="b-qui"><strong>${echapper(s.nom)}</strong><br />${echapper(s.role)}${
          s.signature ? `<br />Signé le ${echapper(dateFr(s.signature.date))}` : ''
        }</div>
      </div>`,
    )
    .join('')}</div>
    <p class="b-mention-signature">${echapper(MENTION_SIGNATURE)}</p>`;

  const sources = `<ul class="b-sources">${SOURCES_BAIL.map(
    (s) => `<li>${echapper(s.reference)} — consulté le ${echapper(dateFr(s.consulteLe))}</li>`,
  ).join('')}</ul>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${echapper(LIBELLE_BAIL[contenu.categorie])} — ${echapper(contenu.logement.nom)}</title>
<style>${STYLES_BASE}${STYLES_BAIL}</style>
</head>
<body>
  <div class="page">

    <div class="b-bandeau">
      <div>
        <h1>${echapper(LIBELLE_BAIL[contenu.categorie])}</h1>
        <div class="b-sous-titre">${echapper(contenu.logement.nom)}${
          contenu.lieu ? ` — établi à ${echapper(contenu.lieu)}` : ''
        }</div>
      </div>
      <div class="b-etabli">Établi le<br />${echapper(dateFr(contenu.etabliLe))}</div>
    </div>

    <div class="b-sections">
      ${section('Les parties', parties)}
      ${section('Le logement', logement)}
      ${section('Durée du bail', duree)}
      ${section('Loyer, charges et dépôt de garantie', argent)}
      ${section('Diagnostics', diagnostics)}
      ${section('Clauses particulières', clauses)}
      ${section('Points de vigilance de ce type de bail', vigilance)}
      ${section('Annexes', annexes)}
      ${section('Signatures', signatures)}
      ${section('Fondements', sources)}
    </div>

  </div>
</body>
</html>`;
}

interface Signataire {
  nom: string;
  role: string;
  signature?: SignatureBail;
}

/**
 * Qui doit signer : le bailleur, puis **chaque** locataire.
 *
 * Un locataire sans signature figure quand même sur le document, avec la
 * mention « Non signé » : c'est une information, pas un oubli.
 */
export function signataires(contenu: ContenuBail): Signataire[] {
  const liste: Signataire[] = [
    {
      nom: contenu.bailleur.nom,
      role: 'Le bailleur',
      signature: contenu.signatures.find((s) => s.signataire === 'bailleur'),
    },
  ];
  for (const l of contenu.locataires) {
    const cle = `${l.prenom} ${l.nom}`.trim();
    liste.push({
      nom: cle,
      role: contenu.locataires.length > 1 ? 'Locataire' : 'Le locataire',
      signature: contenu.signatures.find((s) => s.signataire === cle),
    });
  }
  return liste;
}

/**
 * Types du domaine.
 *
 * Ces types décrivent le métier, indépendamment de SQLite et de React. Les
 * dépôts traduisent les lignes de la base vers ces formes, et les écrans ne
 * manipulent jamais de lignes brutes.
 */

import type { Centimes } from './money';
import type { ClePeriode } from './period';

// ---------------------------------------------------------------------------
// Propriétaire
// ---------------------------------------------------------------------------

export interface Proprietaire {
  id: string;
  /** Nom et prénom, ou raison sociale (SCI, indivision…). */
  nom: string;
  /** Complément utile pour les SCI : représentant, qualité. */
  qualite?: string | null;
  adresse: string;
  codePostal: string;
  ville: string;
  telephone?: string | null;
  email?: string | null;
  /** Numéro SIRET, facultatif, pour les bailleurs professionnels. */
  siret?: string | null;
  notes?: string | null;
  creeLe: string;
  modifieLe: string;
}

// ---------------------------------------------------------------------------
// Logement
// ---------------------------------------------------------------------------

export type TypeLogement =
  | 'appartement'
  | 'maison'
  | 'studio'
  | 'chambre'
  | 'garage'
  | 'parking'
  | 'local'
  | 'autre';

export const TYPES_LOGEMENT: { valeur: TypeLogement; libelle: string }[] = [
  { valeur: 'appartement', libelle: 'Appartement' },
  { valeur: 'maison', libelle: 'Maison' },
  { valeur: 'studio', libelle: 'Studio' },
  { valeur: 'chambre', libelle: 'Chambre' },
  { valeur: 'garage', libelle: 'Garage' },
  { valeur: 'parking', libelle: 'Parking' },
  { valeur: 'local', libelle: 'Local commercial' },
  { valeur: 'autre', libelle: 'Autre' },
];

/** Un logement est un bien. Il peut accueillir des locataires successifs. */
export interface Logement {
  id: string;
  proprietaireId: string;
  /** Nom libre choisi par le propriétaire : « Appartement 1 », « Studio 3 »… */
  nom: string;
  type: TypeLogement;
  /** Complément d'adresse : bâtiment, étage, numéro d'appartement. */
  complement?: string | null;
  adresse: string;
  codePostal: string;
  ville: string;
  /** Référence libre : numéro de lot, référence interne, référence fiscale. */
  reference?: string | null;
  /** Surface habitable en m², facultative. */
  surface?: number | null;
  notes?: string | null;
  creeLe: string;
  modifieLe: string;
}

/** Adresse mise en forme pour un document, sur une ou deux lignes. */
export function adresseEnLignes(parties: {
  adresse: string;
  complement?: string | null;
  codePostal: string;
  ville: string;
}): string[] {
  const lignes: string[] = [];
  if (parties.complement && parties.complement.trim()) lignes.push(parties.complement.trim());
  lignes.push(parties.adresse.trim());
  lignes.push(`${parties.codePostal.trim()} ${parties.ville.trim()}`.trim());
  return lignes.filter((l) => l.length > 0);
}

// ---------------------------------------------------------------------------
// Bail et locataire
// ---------------------------------------------------------------------------

/**
 * Un bail (ou « occupation ») relie un logement à un ou plusieurs locataires,
 * pour une durée déterminée.
 *
 * Le bail n'est jamais supprimé : quand le locataire part, on renseigne
 * `dateSortie`. L'historique des quittances reste ainsi intact, et le logement
 * peut accueillir un nouveau bail.
 */
export interface Bail {
  id: string;
  logementId: string;
  /** Date d'entrée, format `AAAA-MM-JJ`. */
  dateEntree: string;
  /** Date de sortie effective, `null` si le bail est en cours. */
  dateSortie?: string | null;
  /** Dépôt de garantie, en centimes. */
  depotGarantie?: Centimes | null;
  /** Jour habituel d'échéance du loyer (1 à 31). */
  jourEcheance: number;
  /** Texte libre : conditions particulières, meublé, colocation… */
  notes?: string | null;
  creeLe: string;
  modifieLe: string;
}

/**
 * Un titulaire du bail. Un bail peut avoir plusieurs titulaires
 * (colocation, couple) ; ils figurent tous sur la quittance.
 */
export interface TitulaireBail {
  id: string;
  bailId: string;
  /** Rang d'affichage : 1 = titulaire principal. */
  ordre: number;
  nom: string;
  prenom: string;
  telephone?: string | null;
  email?: string | null;
  dateNaissance?: string | null;
  lieuNaissance?: string | null;
}

/** Nom complet, pour l'affichage courant. */
export function nomComplet(t: Pick<TitulaireBail, 'prenom' | 'nom'>): string {
  return `${t.prenom} ${t.nom}`.trim();
}

/**
 * Nom mis en forme pour un document : « Monsieur Mohamed BENALI ».
 * Le civilité n'est pas stockée — on ne l'invente pas. On renvoie donc
 * « Mohamed BENALI », et le modèle PDF peut préfixer « Monsieur » ou « Madame »
 * si le bailleur l'a renseigné dans ses réglages.
 */
export function nomPourDocument(t: TitulaireBail): string {
  const nom = t.nom.trim().toUpperCase();
  const prenom = t.prenom.trim();
  return `${prenom} ${nom}`.trim();
}

// ---------------------------------------------------------------------------
// Loyer et charges, avec date d'effet
// ---------------------------------------------------------------------------

/**
 * Une période d'application d'un loyer.
 *
 * L'historique est **append-only** : modifier le loyer du mois prochain crée une
 * nouvelle ligne, elle ne réécrit pas les précédentes. C'est ce qui garantit
 * qu'une quittance passée ne change jamais rétroactivement.
 */
export interface PeriodeLoyer {
  id: string;
  bailId: string;
  /** Premier mois d'application, clé `AAAA-MM`. */
  debut: ClePeriode;
  /** Dernier mois d'application inclus, `null` si en cours. */
  fin?: ClePeriode | null;
  /** Loyer hors charges, en centimes. */
  loyer: Centimes;
  /** Provision pour charges, en centimes. Peut être nulle. */
  charges: Centimes;
  /** Complément libre : régularisation, rattrapage… */
  commentaire?: string | null;
  creeLe: string;
}

/** Loyer et charges applicables, avec leur total. */
export interface MontantDu {
  loyer: Centimes;
  charges: Centimes;
  total: Centimes;
}

// ---------------------------------------------------------------------------
// Paiements
// ---------------------------------------------------------------------------

export type ModePaiement =
  | 'virement'
  | 'cheque'
  | 'especes'
  | 'prelevement'
  | 'carte'
  | 'autre';

export const MODES_PAIEMENT: { valeur: ModePaiement; libelle: string }[] = [
  { valeur: 'virement', libelle: 'Virement' },
  { valeur: 'cheque', libelle: 'Chèque' },
  { valeur: 'especes', libelle: 'Espèces' },
  { valeur: 'prelevement', libelle: 'Prélèvement' },
  { valeur: 'carte', libelle: 'Carte bancaire' },
  { valeur: 'autre', libelle: 'Autre' },
];

/**
 * Un encaissement, rattaché à un mois (la « période » qu'il solde).
 *
 * Plusieurs paiements peuvent solder un même mois : 500 € puis 350 €.
 * Aucun statut « payé » n'est stocké : il se déduit toujours de la somme.
 */
export interface Paiement {
  id: string;
  bailId: string;
  /** Mois concerné, clé `AAAA-MM`. */
  periode: ClePeriode;
  /** Montant reçu, en centimes. */
  montant: Centimes;
  /** Date réelle d'encaissement, `AAAA-MM-JJ`. */
  datePaiement: string;
  mode: ModePaiement;
  note?: string | null;
  creeLe: string;
}

// ---------------------------------------------------------------------------
// Statut d'un mois
// ---------------------------------------------------------------------------

/**
 * Statut visuel du mois d'un logement.
 *
 * - `paye`   : la somme reçue couvre le montant dû.
 * - `partiel`: une somme a été reçue, sans couvrir le dû.
 * - `retard` : rien n'a été reçu et l'échéance du mois est dépassée.
 * - `attente`: rien n'a été reçu, mais l'échéance n'est pas encore dépassée.
 * - `hors_bail`: le mois est hors de la période d'occupation ; rien n'est dû.
 */
export type StatutMois = 'paye' | 'partiel' | 'retard' | 'attente' | 'hors_bail';

export interface StatutMoisPresentation {
  libelle: string;
  /** Emoji, pour un repérage immédiat sur la carte. */
  emoji: string;
  /** Clé de couleur dans les jetons de design. */
  couleur: 'vert' | 'orange' | 'rouge' | 'gris' | 'bleu';
}

export const PRESENTATION_STATUT: Record<StatutMois, StatutMoisPresentation> = {
  paye: { libelle: 'Payé', emoji: '🟢', couleur: 'vert' },
  partiel: { libelle: 'Paiement partiel', emoji: '🟠', couleur: 'orange' },
  retard: { libelle: 'En retard', emoji: '🔴', couleur: 'rouge' },
  attente: { libelle: 'En attente', emoji: '⚪', couleur: 'gris' },
  hors_bail: { libelle: 'Hors bail', emoji: '⚪', couleur: 'gris' },
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type TypeDocument = 'quittance' | 'recu' | 'avis_echeance';

export const LIBELLE_DOCUMENT: Record<TypeDocument, string> = {
  quittance: 'Quittance de loyer',
  recu: 'Reçu de paiement',
  avis_echeance: "Avis d'échéance",
};

export type ModeleDocument = 'classique' | 'moderne';

export const LIBELLE_MODELE: Record<ModeleDocument, string> = {
  classique: 'Classique et professionnel',
  moderne: 'Moderne et épuré',
};

/**
 * Un document PDF produit et conservé sur l'appareil.
 *
 * On conserve volontairement une **copie figée des montants et des identités**
 * au moment de l'émission. Si le loyer change l'an prochain, ou si un locataire
 * est remplacé, la quittance déjà remise reste fidèle à ce qui a été signé.
 */
export interface Document {
  id: string;
  /** Numéro unique et lisible, imprimé sur le document. */
  numero: string;
  type: TypeDocument;
  logementId: string;
  bailId: string;
  /** Mois concerné, clé `AAAA-MM`. */
  periode: ClePeriode;
  logementNom: string;
  proprietaireNom: string;
  /** Adresse complète du propriétaire, telle qu'imprimée. */
  proprietaireAdresse: string;
  /** Adresse complète du logement, telle qu'imprimée. */
  logementAdresse: string;
  /** Titulaires au moment de l'émission. */
  titulaires: string[];
  loyer: Centimes;
  charges: Centimes;
  /** Montant total attesté par le document. */
  total: Centimes;
  /** Dates réelles des encaissements, pour les quittances et reçus. */
  datesPaiement: string[];
  /** Date d'émission du document, `AAAA-MM-JJ`. */
  dateEmission: string;
  modele: ModeleDocument;
  /** Chemin du fichier PDF dans le stockage de l'application. */
  cheminFichier: string;
  /** Signature du bailleur recopiée dans le document, si elle était active. */
  signatureIncluse: boolean;
  creeLe: string;
}

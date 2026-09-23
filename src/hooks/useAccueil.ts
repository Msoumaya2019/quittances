/**
 * Chargement des données de l'accueil.
 *
 * Un seul passage en base pour alimenter le tableau de bord **et** les cartes.
 * Faire une requête par logement serait plus simple à écrire, mais donnerait une
 * accueil lent dès qu'il y a une dizaine de biens.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { ouvrirBase } from '../db/database';
import {
  bailEnCours,
  bauxDuLogement,
  listerLogements,
  periodesLoyerDuBail,
  titulairesDuBail,
} from '../db/repositories/properties';
import { listerProprietaires } from '../db/repositories/owners';
import { tousLesPaiements } from '../db/repositories/payments';
import { tousLesDocuments } from '../db/repositories/documents';
import {
  actionPrincipale,
  cumulerPaiements,
  determinerStatut,
  quittancesARattraper,
  soldeRestant,
  statistiquesDuMois,
  type ActionPrincipale,
  type ContexteMois,
  type CumulPaiements,
  type StatistiquesMois,
} from '../domain/payments';
import { montantDuPourMois } from '../domain/rent';
import { aujourdHui, periodeActuelle, versCle, type Periode } from '../domain/period';
import type {
  Bail,
  Document,
  Logement,
  MontantDu,
  Paiement,
  PeriodeLoyer,
  Proprietaire,
  StatutMois,
  TitulaireBail,
} from '../domain/types';

/** Tout ce qu'affiche une carte de logement sur l'accueil. */
export interface CarteLogement {
  logement: Logement;
  proprietaire: Proprietaire | null;
  bail: Bail | null;
  titulaires: TitulaireBail[];
  montantDu: { loyer: number; charges: number; total: number };
  cumul: CumulPaiements;
  statut: StatutMois;
  solde: number;
  contexte: ContexteMois | null;
  action: ActionPrincipale;
  documentExistant: Document | null;
}

export interface DonneesAccueil {
  cartes: CarteLogement[];
  statistiques: StatistiquesMois;
  /** Les quittances oubliées, du plus récent au plus ancien. */
  rattrapage: LigneRattrapage[];
  chargement: boolean;
  erreur: string | null;
}

interface EtatInterne {
  logements: Logement[];
  proprietaires: Proprietaire[];
  baux: Map<string, Bail>;
  titulaires: Map<string, TitulaireBail[]>;
  periodesLoyer: Map<string, PeriodeLoyer[]>;
  paiements: Paiement[];
  documents: Document[];
  chargement: boolean;
  erreur: string | null;
}

const ETAT_INITIAL: EtatInterne = {
  logements: [],
  proprietaires: [],
  baux: new Map(),
  titulaires: new Map(),
  periodesLoyer: new Map(),
  paiements: [],
  documents: [],
  chargement: true,
  erreur: null,
};

/**
 * Les données brutes, chargées en une fois et avant toute mise en forme.
 *
 * `chargement` et `erreur` n'en font pas partie : ce sont des états d'écran, pas
 * des données. Les fonctions pures qui suivent ne reçoivent donc que du réel.
 */
export type EtatDonnees = Omit<EtatInterne, 'chargement' | 'erreur'>;

/**
 * Charge, pour chaque logement, son bail en cours et les données associées.
 * Les requêtes indépendantes partent en parallèle.
 */
async function chargerTout(): Promise<EtatDonnees> {
  await ouvrirBase();

  const [logements, proprietaires, paiements, documents] = await Promise.all([
    listerLogements(),
    listerProprietaires(),
    tousLesPaiements(),
    tousLesDocuments(),
  ]);

  const baux = new Map<string, Bail>();
  const titulaires = new Map<string, TitulaireBail[]>();
  const periodesLoyer = new Map<string, PeriodeLoyer[]>();

  // Deux vagues parallèles : d'abord les baux, puis ce qui en dépend.
  const bauxParLogement = await Promise.all(
    logements.map((logement) => bailEnCours(logement.id)),
  );

  bauxParLogement.forEach((bail, index) => {
    if (bail) baux.set(logements[index].id, bail);
  });

  await Promise.all(
    Array.from(baux.values()).map(async (bail) => {
      const [sesTitulaires, sesPeriodes] = await Promise.all([
        titulairesDuBail(bail.id),
        periodesLoyerDuBail(bail.id),
      ]);
      titulaires.set(bail.id, sesTitulaires);
      periodesLoyer.set(bail.id, sesPeriodes);
    }),
  );

  return { logements, proprietaires, baux, titulaires, periodesLoyer, paiements, documents };
}

/**
 * Construit les cartes affichées, pour un mois donné.
 * Fonction pure : c'est elle qui décide du statut et de l'action proposée.
 */
export function construireCartes(
  etat: EtatDonnees,
  mois: Periode,
  moisDuJour: Periode,
  jourDuJour: number,
): CarteLogement[] {
  const proprietaireParId = new Map(etat.proprietaires.map((p) => [p.id, p]));
  const cleMois = versCle(mois);

  return etat.logements.map((logement) => {
    const proprietaire = proprietaireParId.get(logement.proprietaireId) ?? null;
    const bail = etat.baux.get(logement.id) ?? null;
    const sesTitulaires = bail ? (etat.titulaires.get(bail.id) ?? []) : [];
    const sesPeriodes = bail ? (etat.periodesLoyer.get(bail.id) ?? []) : [];
    const sesPaiements = bail
      ? etat.paiements.filter((p) => p.bailId === bail.id)
      : [];

    const documentExistant =
      etat.documents.find((d) => d.bailId === bail?.id && d.periode === cleMois) ?? null;

    if (!bail) {
      // Logement sans locataire : rien n'est dû, mais la carte reste utile.
      const montantVide = { loyer: 0, charges: 0, total: 0 };
      return {
        logement,
        proprietaire,
        bail: null,
        titulaires: [],
        montantDu: montantVide,
        cumul: { encaisse: 0, nombre: 0, paiements: [], dates: [] },
        statut: 'hors_bail' as StatutMois,
        solde: 0,
        contexte: null,
        action: { type: 'aucune', libelle: 'Logement sans locataire' } as ActionPrincipale,
        documentExistant: null,
      };
    }

    const montantDu = montantDuPourMois(bail, sesPeriodes, mois);
    const cumul = cumulerPaiements(sesPaiements, mois);
    const statut = determinerStatut({
      montantDu,
      cumul,
      periode: mois,
      bail,
      periodeDuJour: moisDuJour,
      jourDuJour,
    });

    const contexte: ContexteMois = {
      periode: mois,
      bail,
      montantDu,
      cumul,
      statut,
      solde: soldeRestant(montantDu, cumul),
    };

    return {
      logement,
      proprietaire,
      bail,
      titulaires: sesTitulaires,
      montantDu,
      cumul,
      statut,
      solde: contexte.solde,
      contexte,
      action: actionPrincipale({
        contexte,
        documentExistant: documentExistant
          ? { id: documentExistant.id, type: documentExistant.type }
          : null,
      }),
      documentExistant,
    };
  });
}

/** Un mois réglé qui attend encore sa quittance, et le logement concerné. */
export interface LigneRattrapage {
  logement: Logement;
  bail: Bail;
  periode: Periode;
  montantDu: MontantDu;
  /** Nombre de mois écoulés depuis ce mois : 0 pour le mois courant. */
  ancienneteMois: number;
}

/**
 * Rassemble les quittances oubliées de tous les logements.
 *
 * Fonction pure, comme `construireCartes` : la règle qui décide quels mois
 * manquent vit dans le domaine (`quittancesARattraper`), et cette fonction ne
 * fait que la réunir par logement et ranger le résultat.
 *
 * Le tri est du plus récent au plus ancien — c'est l'ordre dans lequel on
 * rattrape — et, à ancienneté égale, par nom de logement, pour que deux
 * logements ne s'entrelacent pas au hasard.
 */
export function construireRattrapage(
  etat: EtatDonnees,
  dateDuJour: string,
): LigneRattrapage[] {
  const lignes: LigneRattrapage[] = [];

  for (const logement of etat.logements) {
    const bail = etat.baux.get(logement.id);
    if (!bail) continue;

    const sesPeriodes = etat.periodesLoyer.get(bail.id) ?? [];
    const sesPaiements = etat.paiements.filter((p) => p.bailId === bail.id);
    const sesDocuments = etat.documents.filter((d) => d.bailId === bail.id);

    for (const manque of quittancesARattraper({
      bail,
      periodesLoyer: sesPeriodes,
      paiements: sesPaiements,
      documents: sesDocuments,
      dateDuJour,
    })) {
      lignes.push({
        logement,
        bail,
        periode: manque.periode,
        montantDu: manque.montantDu,
        ancienneteMois: manque.ancienneteMois,
      });
    }
  }

  return lignes.sort((a, b) =>
    a.ancienneteMois !== b.ancienneteMois
      ? a.ancienneteMois - b.ancienneteMois
      : a.logement.nom.localeCompare(b.logement.nom),
  );
}

/**
 * Hook principal de l'accueil.
 * Recharge les données à chaque fois que `cleRafraichissement` change, ce qui
 * permet aux autres écrans de demander une mise à jour après une écriture.
 */
export function useDonneesAccueil(mois: Periode, cleRafraichissement: number): DonneesAccueil {
  const [etat, setEtat] = useState<EtatInterne>(ETAT_INITIAL);

  useEffect(() => {
    let actif = true;

    (async () => {
      try {
        const donnees = await chargerTout();
        if (!actif) return;
        setEtat({ ...donnees, chargement: false, erreur: null });
      } catch (erreur) {
        if (!actif) return;
        setEtat((precedent) => ({
          ...precedent,
          chargement: false,
          erreur:
            erreur instanceof Error
              ? erreur.message
              : "Les données n'ont pas pu être chargées.",
        }));
      }
    })();

    return () => {
      actif = false;
    };
  }, [cleRafraichissement]);

  const cartes = useMemo(() => {
    if (etat.chargement) return [];
    const maintenant = new Date();
    return construireCartes(etat, mois, periodeActuelle(maintenant), maintenant.getDate());
  }, [etat, mois]);

  const statistiques = useMemo(() => {
    const contextes = cartes
      .map((c) => c.contexte)
      .filter((c): c is ContexteMois => c !== null);
    return statistiquesDuMois(contextes);
  }, [cartes]);

  const rattrapage = useMemo(() => {
    if (etat.chargement) return [];
    return construireRattrapage(etat, aujourdHui());
  }, [etat]);

  return {
    cartes,
    statistiques,
    rattrapage,
    chargement: etat.chargement,
    erreur: etat.erreur,
  };
}

/**
 * Charge tous les baux d'un logement, y compris les baux clos.
 * Utilisé par la fiche d'un logement et par son historique.
 */
export function useBauxDuLogement(logementId: string | null, cleRafraichissement = 0) {
  const [baux, setBaux] = useState<Bail[]>([]);
  const [chargement, setChargement] = useState(true);

  const recharger = useCallback(async () => {
    if (!logementId) {
      setBaux([]);
      setChargement(false);
      return;
    }
    setChargement(true);
    const resultat = await bauxDuLogement(logementId);
    setBaux(resultat);
    setChargement(false);
  }, [logementId]);

  useEffect(() => {
    void recharger();
  }, [recharger, cleRafraichissement]);

  return { baux, chargement, recharger };
}

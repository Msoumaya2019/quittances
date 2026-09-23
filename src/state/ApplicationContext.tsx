/**
 * Contexte applicatif : mois affiché, réglages, verrouillage.
 *
 * Un seul contexte porte les données transverses. Les écrans y accèdent par des
 * hooks dédiés, et n'ont jamais à faire remonter des propriétés à travers la
 * navigation.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { ouvrirBase } from '../db/database';
import { lireReglages, ecrireReglages, type Reglages } from '../db/repositories/settings';
import { REGLAGES_PAR_DEFAUT } from '../db/repositories/settings';
import { periodeActuelle, type Periode } from '../domain/period';
import { composerPalette, type Palette } from '../ui/palette';

interface ValeurApplication {
  /** Mois affiché par l'accueil et les listes. */
  mois: Periode;
  definirMois: (mois: Periode) => void;
  moisPrecedent: () => void;
  moisSuivant: () => void;
  revenirAuMoisCourant: () => void;
  estMoisCourant: boolean;

  reglages: Reglages;
  majReglages: (partiel: Partial<Reglages>) => Promise<void>;

  /**
   * Couleurs du thème choisi, recalculées quand la couleur d'accent ou le mode
   * change. C'est la seule source de couleur de l'application.
   */
  palette: Palette;

  /** Compteur incrémenté après chaque écriture, pour forcer un rechargement. */
  cleRafraichissement: number;
  rafraichir: () => void;

  /** La base est-elle prête ? Les écrans attendent avant de lire. */
  pret: boolean;
  erreurInitialisation: string | null;
}

const Contexte = createContext<ValeurApplication | null>(null);

export function FournisseurApplication({ children }: { children: React.ReactNode }) {
  const [mois, setMois] = useState<Periode>(() => periodeActuelle());
  const [reglages, setReglages] = useState<Reglages>(REGLAGES_PAR_DEFAUT);
  const [cleRafraichissement, setCleRafraichissement] = useState(0);
  const [pret, setPret] = useState(false);
  const [erreurInitialisation, setErreurInitialisation] = useState<string | null>(null);

  // --- Initialisation : ouverture de la base, migrations, réglages --------
  useEffect(() => {
    let actif = true;

    (async () => {
      try {
        await ouvrirBase();
        const charges = await lireReglages();
        if (!actif) return;
        setReglages(charges);
        setPret(true);
      } catch (erreur) {
        if (!actif) return;
        setErreurInitialisation(
          erreur instanceof Error
            ? `L'application n'a pas pu préparer ses données : ${erreur.message}`
            : "L'application n'a pas pu préparer ses données.",
        );
        setPret(true);
      }
    })();

    return () => {
      actif = false;
    };
  }, []);

  const definirMois = useCallback((nouveau: Periode) => setMois(nouveau), []);

  const moisPrecedent = useCallback(() => {
    setMois((actuel) => {
      const index = actuel.annee * 12 + (actuel.mois - 1) - 1;
      return { annee: Math.floor(index / 12), mois: (index % 12) + 1 };
    });
  }, []);

  const moisSuivant = useCallback(() => {
    setMois((actuel) => {
      const index = actuel.annee * 12 + (actuel.mois - 1) + 1;
      return { annee: Math.floor(index / 12), mois: (index % 12) + 1 };
    });
  }, []);

  const revenirAuMoisCourant = useCallback(() => setMois(periodeActuelle()), []);

  const majReglages = useCallback(async (partiel: Partial<Reglages>) => {
    await ecrireReglages(partiel);
    setReglages((actuels) => ({ ...actuels, ...partiel }));
  }, []);

  const rafraichir = useCallback(() => {
    setCleRafraichissement((valeur) => valeur + 1);
  }, []);

  const estMoisCourant = useMemo(() => {
    const courant = periodeActuelle();
    return mois.annee === courant.annee && mois.mois === courant.mois;
  }, [mois]);

  // La palette ne dépend que de deux réglages. La mémoïser sur ces deux
  // valeurs — et non sur l'objet `reglages` entier — évite de recalculer tous
  // les styles de l'application quand le bailleur change un jour de rappel.
  const palette = useMemo(
    () => composerPalette(reglages.couleurTheme, reglages.modeTheme),
    [reglages.couleurTheme, reglages.modeTheme],
  );

  const valeur = useMemo<ValeurApplication>(
    () => ({
      mois,
      definirMois,
      moisPrecedent,
      moisSuivant,
      revenirAuMoisCourant,
      estMoisCourant,
      reglages,
      majReglages,
      palette,
      cleRafraichissement,
      rafraichir,
      pret,
      erreurInitialisation,
    }),
    [
      mois,
      definirMois,
      moisPrecedent,
      moisSuivant,
      revenirAuMoisCourant,
      estMoisCourant,
      reglages,
      majReglages,
      palette,
      cleRafraichissement,
      rafraichir,
      pret,
      erreurInitialisation,
    ],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

/** Accès au contexte applicatif. Lève une erreur claire s'il est absent. */
export function useApplication(): ValeurApplication {
  const valeur = useContext(Contexte);
  if (!valeur) {
    throw new Error(
      "Le contexte de l'application est absent. " +
        'Le composant doit être placé à l’intérieur de FournisseurApplication.',
    );
  }
  return valeur;
}

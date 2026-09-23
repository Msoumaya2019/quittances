/**
 * Enregistrement d'un paiement.
 *
 * Le parcours par défaut tient en un geste : le montant attendu est déjà
 * rempli, et le bouton porte le montant — « Confirmer le paiement de 850 € ».
 * Les champs de détail (montant exact, date, mode, note) restent accessibles
 * pour les cas particuliers, mais n'encombrent pas l'écran au départ.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { BandeauMessage } from '@/ui/components/BandeauMessage';
import { Bouton } from '@/ui/components/Bouton';
import { Carte } from '@/ui/components/Carte';
import { Champ, ChampMontant } from '@/ui/components/Champ';
import { EnTeteEcran } from '@/ui/components/EnTeteEcran';
import { LigneDetail } from '@/ui/components/LigneDetail';
import { espaces, typographie } from '@/ui/tokens';
import { formatMontant } from '@/domain/money';
import { aujourdHui, libelleLongCapitalise, depuisCle } from '@/domain/period';
import { cumulerPaiementsPourCle, montantPropose } from '@/domain/payments';
import { montantDuPourCle } from '@/domain/rent';
import {
  MODES_PAIEMENT,
  nomComplet,
  type Logement,
  type ModePaiement,
  type Paiement,
} from '@/domain/types';
import {
  bailEnCours,
  periodesLoyerDuBail,
  titulairesDuBail,
  trouverLogement,
} from '@/db/repositories/properties';
import { enregistrerPaiement, paiementsDuBail } from '@/db/repositories/payments';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, useCouleurs, type Couleurs } from '@/ui/theme';

export default function EcranPaiement() {
  const styles = useStyles(creerStyles);
  const couleurs = useCouleurs();
  const insets = useSafeAreaInsets();
  const { rafraichir } = useApplication();

  const parametres = useLocalSearchParams<{
    propertyId: string;
    periode?: string;
    montant?: string;
  }>();

  const periode = parametres.periode ?? '';
  const mois = depuisCle(periode);

  const [logement, setLogement] = useState<Logement | null>(null);
  const [nomLocataire, setNomLocataire] = useState<string>('');
  const [montantDu, setMontantDu] = useState(0);
  const [dejaEncaisse, setDejaEncaisse] = useState(0);
  const [paiementsExistants, setPaiementsExistants] = useState<Paiement[]>([]);

  const [montant, setMontant] = useState<number | null>(null);
  const [datePaiement, setDatePaiement] = useState(aujourdHui());
  const [mode, setMode] = useState<ModePaiement>('virement');
  const [note, setNote] = useState('');
  const [detailsOuverts, setDetailsOuverts] = useState(false);

  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // --- Chargement du contexte du mois -----------------------------------
  useEffect(() => {
    let actif = true;

    (async () => {
      try {
        const trouve = await trouverLogement(parametres.propertyId);
        if (!actif) return;
        if (!trouve) {
          setErreur("Ce logement n'existe plus.");
          setChargement(false);
          return;
        }
        setLogement(trouve);

        const bail = await bailEnCours(trouve.id);
        if (!bail) {
          setErreur("Ce logement n'a pas de locataire en place.");
          setChargement(false);
          return;
        }

        const [titulaires, periodes, paiements] = await Promise.all([
          titulairesDuBail(bail.id),
          periodesLoyerDuBail(bail.id),
          paiementsDuBail(bail.id),
        ]);

        if (!actif) return;

        if (titulaires.length > 0) {
          setNomLocataire(
            titulaires.map((t) => nomComplet(t)).join(' et '),
          );
        }

        const du = montantDuPourCle(bail, periodes, periode);
        const cumul = cumulerPaiementsPourCle(paiements, periode);

        setMontantDu(du.total);
        setDejaEncaisse(cumul.encaisse);
        setPaiementsExistants(cumul.paiements);

        // Montant proposé : ce qui reste à percevoir, ou le montant transmis.
        const propose = parametres.montant
          ? Number(parametres.montant)
          : montantPropose(du, cumul);
        setMontant(Number.isFinite(propose) && propose > 0 ? propose : du.total);

        setChargement(false);
      } catch (e) {
        if (!actif) return;
        setErreur(
          e instanceof Error
            ? `Les informations du logement n'ont pas pu être lues : ${e.message}`
            : "Les informations du logement n'ont pas pu être lues.",
        );
        setChargement(false);
      }
    })();

    return () => {
      actif = false;
    };
  }, [parametres.propertyId, parametres.montant, periode]);

  const resteAvant = useMemo(
    () => Math.max(0, montantDu - dejaEncaisse),
    [montantDu, dejaEncaisse],
  );

  const resteApres = useMemo(() => {
    const verse = montant ?? 0;
    return Math.max(0, resteAvant - verse);
  }, [resteAvant, montant]);

  const soldeComplet = montantDu > 0 && resteApres === 0;

  const enregistrer = useCallback(async () => {
    if (!logement || !montant || montant <= 0) {
      setErreur('Indiquez le montant reçu.');
      return;
    }

    setEnregistrement(true);
    setErreur(null);

    try {
      const bail = await bailEnCours(logement.id);
      if (!bail) throw new Error("Ce logement n'a plus de locataire en place.");

      await enregistrerPaiement({
        bailId: bail.id,
        periode,
        montant,
        datePaiement,
        mode,
        note: note.trim() || null,
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
        // Sans moteur haptique, on continue simplement.
      });

      rafraichir();
      router.back();
    } catch (e) {
      setErreur(
        e instanceof Error
          ? `Le paiement n'a pas pu être enregistré : ${e.message}`
          : "Le paiement n'a pas pu être enregistré.",
      );
    } finally {
      setEnregistrement(false);
    }
  }, [logement, montant, periode, datePaiement, mode, note, rafraichir]);

  // --- Affichage --------------------------------------------------------

  if (chargement) {
    return (
      <View style={[styles.centreur, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={couleurs.accent} />
      </View>
    );
  }

  if (erreur && !logement) {
    return (
      <View style={[styles.plein, { paddingTop: insets.top + espaces.lg, paddingHorizontal: espaces.lg }]}>
        <BandeauMessage ton="erreur" message={erreur} />
        <Bouton libelle="Fermer" variante="secondaire" onPress={() => router.back()} />
      </View>
    );
  }

  const libelleBouton =
    montant && montant > 0
      ? soldeComplet
        ? `Confirmer le paiement de ${formatMontant(resteAvant, { decimales: 'auto' })}`
        : `Enregistrer ${formatMontant(montant, { decimales: 'auto' })}`
      : 'Enregistrer le paiement';

  return (
    <KeyboardAvoidingView
      style={styles.plein}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + espaces.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <EnTeteEcran
          titre="Enregistrer un paiement"
          sousTitre={`${logement?.nom ?? ''}${mois ? ` — ${libelleLongCapitalise(mois)}` : ''}`}
        />

        {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

        <Carte style={styles.carte}>
          <LigneDetail libelle="Locataire" valeur={nomLocataire || '—'} />
          <LigneDetail
            libelle="Montant attendu"
            valeur={formatMontant(montantDu, { decimales: 'auto' })}
          />
          {dejaEncaisse > 0 ? (
            <>
              <LigneDetail
                libelle="Déjà reçu"
                valeur={formatMontant(dejaEncaisse, { decimales: 'auto' })}
                teinte={couleurs.orange}
              />
              <LigneDetail
                libelle="Reste à percevoir"
                valeur={formatMontant(resteAvant, { decimales: 'auto' })}
                accentuee
                teinte={couleurs.orange}
              />
            </>
          ) : null}
        </Carte>

        {/* Montant proposé en évidence */}
        <Carte style={styles.carteMontant}>
          <Text style={[typographie.petit, styles.etiquetteMontant]}>
            {soldeComplet ? 'Solde du mois' : 'Montant à enregistrer'}
          </Text>
          <Text style={[typographie.montant, styles.precisionMontant]}>
            {formatMontant(montant ?? 0, { decimales: 'auto' })}
          </Text>

          {resteAvant > 0 && montant !== resteAvant ? (
            <Bouton
              libelle={`Utiliser le solde : ${formatMontant(resteAvant, { decimales: 'auto' })}`}
              onPress={() => setMontant(resteAvant)}
              variante="secondaire"
              compact
            />
          ) : null}

          {resteApres === 0 && montantDu > 0 ? (
            <Text style={[typographie.petit, styles.texteSolde]}>
              Le mois sera intégralement réglé : la quittance deviendra disponible.
            </Text>
          ) : resteApres > 0 ? (
            <Text style={[typographie.petit, styles.texteSoldePartiel]}>
              Il restera {formatMontant(resteApres, { decimales: 'auto' })} à percevoir après ce paiement.
            </Text>
          ) : null}
        </Carte>

        {/* Détails facultatifs */}
        {!detailsOuverts ? (
          <Bouton
            libelle="Modifier le montant, la date ou le mode"
            variante="discret"
            onPress={() => setDetailsOuverts(true)}
          />
        ) : (
          <Carte style={styles.carteDetails}>
            <ChampMontant
              libelle="Montant reçu"
              valeurCentimes={montant}
              onChangement={setMontant}
              obligatoire
            />

            <Champ
              libelle="Date du paiement"
              valeur={datePaiement}
              onChangement={setDatePaiement}
              placeholder="AAAA-MM-JJ"
              clavier="numbers-and-punctuation"
              aide="Format attendu : année-mois-jour."
              maxLength={10}
            />

            <View style={styles.blocModes}>
              <Text style={typographie.petitAppuye}>Mode de paiement</Text>
              <View style={styles.listeModes}>
                {MODES_PAIEMENT.map((option) => {
                  const actif = option.valeur === mode;
                  return (
                    <Bouton
                      key={option.valeur}
                      libelle={option.libelle}
                      onPress={() => setMode(option.valeur)}
                      variante={actif ? 'principal' : 'discret'}
                      compact
                      pleineLargeur={false}
                    />
                  );
                })}
              </View>
            </View>

            <Champ
              libelle="Note"
              valeur={note}
              onChangement={setNote}
              placeholder="Chèque n° 1234, remis en main propre…"
              multiligne
              nombreDeLignes={2}
            />
          </Carte>
        )}

        {/* Paiements déjà enregistrés */}
        {paiementsExistants.length > 0 ? (
          <Carte style={styles.carte}>
            <Text style={[typographie.petitAppuye, styles.titreHistorique]}>
              Paiements déjà enregistrés ce mois-ci
            </Text>
            {paiementsExistants.map((paiement) => (
              <LigneDetail
                key={paiement.id}
                libelle={`${paiement.datePaiement} — ${MODES_PAIEMENT.find((m) => m.valeur === paiement.mode)?.libelle ?? 'Autre'}`}
                valeur={formatMontant(paiement.montant, { decimales: 'auto' })}
                pointillee
              />
            ))}
          </Carte>
        ) : null}

        <View style={styles.actions}>
          <Bouton
            libelle={libelleBouton}
            onPress={() => void enregistrer()}
            occupe={enregistrement}
            desactive={!montant || montant <= 0}
          />
          <Bouton
            libelle="Annuler"
            variante="discret"
            desactive={enregistrement}
            onPress={() => router.back()}
          />
        </View>

        <Text style={[typographie.petit, styles.note]}>
          Un paiement partiel donne droit à un reçu. La quittance n’est proposée qu’une fois
          le mois intégralement réglé.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  plein: {
    flex: 1,
    backgroundColor: couleurs.fond,
  },
  centreur: {
    flex: 1,
    backgroundColor: couleurs.fond,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contenu: {
    paddingHorizontal: espaces.lg,
    gap: espaces.md,
  },
  carte: {
    gap: espaces.xs,
  },
  carteMontant: {
    alignItems: 'center',
    gap: espaces.sm,
    backgroundColor: couleurs.accentTresClair,
    borderColor: couleurs.accentClair,
  },
  etiquetteMontant: {
    color: couleurs.texteSecondaire,
  },
  precisionMontant: {
    color: couleurs.accentFonce,
  },
  texteSolde: {
    color: couleurs.accentFonce,
    textAlign: 'center',
  },
  texteSoldePartiel: {
    color: couleurs.orange,
    textAlign: 'center',
  },
  carteDetails: {
    gap: espaces.lg,
  },
  blocModes: {
    gap: espaces.sm,
  },
  listeModes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaces.sm,
  },
  titreHistorique: {
    color: couleurs.texte,
    marginBottom: espaces.xs,
  },
  actions: {
    gap: espaces.sm,
    marginTop: espaces.sm,
  },
  note: {
    color: couleurs.texteTertiaire,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: espaces.md,
  },
});

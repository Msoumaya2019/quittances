/**
 * Modification d'un logement et de son bail en cours.
 *
 * Point capital : changer le loyer **n'efface pas le passé**. On ajoute une
 * nouvelle période de loyer à partir d'une date, et les périodes précédentes
 * restent en place. Les quittances déjà générées conservent donc leurs montants.
 *
 * Un changement d'adresse ou de locataire, en revanche, concerne le logement
 * lui-même et se répercute sur les prochains documents, pas sur les anciens :
 * chaque document garde la copie de ce qui était vrai le jour de son émission.
 */

import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import {
  BandeauMessage,
  Bouton,
  Carte,
  Champ,
  ChampMontant,
  DialogueConfirmation,
  EnTeteEcran,
  LigneDetail,
  Segments,
} from '@/ui/components';
import { espaces, typographie } from '@/ui/tokens';
import { formatMontant, parseMontant } from '@/domain/money';
import { depuisCle, libelleLongCapitalise, versCle } from '@/domain/period';
import { TYPES_LOGEMENT } from '@/domain/types';
import type { Bail, Logement, PeriodeLoyer } from '@/domain/types';
import {
  ajouterPeriodeLoyer,
  bailEnCours,
  modifierBail,
  modifierLogement,
  periodesLoyerDuBail,
  trouverLogement,
} from '@/db/repositories/properties';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, type Couleurs } from '@/ui/theme';

export default function EcranModifierLogement() {
  const styles = useStyles(creerStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { mois, rafraichir } = useApplication();

  const [logement, setLogement] = useState<Logement | null>(null);
  const [bail, setBail] = useState<Bail | null>(null);
  const [periodes, setPeriodes] = useState<PeriodeLoyer[]>([]);

  const [nom, setNom] = useState('');
  const [adresse, setAdresse] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [ville, setVille] = useState('');
  const [reference, setReference] = useState('');
  const [type, setType] = useState<string>('appartement');

  const [jourEcheance, setJourEcheance] = useState('');
  const [loyer, setLoyer] = useState<number | null>(null);
  const [charges, setCharges] = useState<number | null>(null);

  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tentative, setTentative] = useState(false);
  const [confirmeLoyer, setConfirmeLoyer] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      const l = await trouverLogement(id);
      if (!l) {
        setErreur("Ce logement n'est plus là.");
        return;
      }
      setLogement(l);
      setNom(l.nom);
      setAdresse(l.adresse);
      setCodePostal(l.codePostal);
      setVille(l.ville);
      setReference(l.reference ?? '');
      setType(l.type);

      const b = await bailEnCours(l.id);
      setBail(b);
      if (b) {
        setJourEcheance(String(b.jourEcheance));
        const ps = await periodesLoyerDuBail(b.id);
        setPeriodes(ps);
        // On part du loyer en vigueur pour le mois affiché, pas du tout premier :
        // c'est ce que l'utilisateur a sous les yeux.
        const cle = versCle(mois);
        const applicable =
          ps.find((p) => p.debut <= cle && (p.fin == null || p.fin >= cle)) ??
          ps[ps.length - 1];
        if (applicable) {
          setLoyer(applicable.loyer);
          setCharges(applicable.charges);
        }
      }
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de charger ce logement.');
    } finally {
      setChargement(false);
    }
    // On ne recharge pas à chaque changement de mois : le formulaire a été rempli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger]),
  );

  const erreurNom = tentative && nom.trim().length === 0 ? 'Le nom du logement est nécessaire.' : null;
  const erreurAdresse = tentative && adresse.trim().length === 0 ? 'L’adresse est nécessaire.' : null;
  const erreurCodePostal =
    tentative && !/^\d{5}$/.test(codePostal.trim()) ? '5 chiffres attendus.' : null;
  const erreurVille = tentative && ville.trim().length === 0 ? 'La ville est nécessaire.' : null;
  const erreurJour =
    bail !== null && (!/^\d{1,2}$/.test(jourEcheance.trim()) || Number(jourEcheance) < 1 || Number(jourEcheance) > 31)
      ? 'Indiquez un jour entre 1 et 31.'
      : null;

  const infosValides =
    nom.trim().length > 0 &&
    adresse.trim().length > 0 &&
    /^\d{5}$/.test(codePostal.trim()) &&
    ville.trim().length > 0 &&
    (!bail || erreurJour === null);

  /** Le loyer proposé diffère-t-il de celui en vigueur ? */
  const cle = versCle(mois);
  const loyerActuel = bail
    ? (periodes.find((p) => p.debut <= cle && (p.fin == null || p.fin >= cle)) ?? null)
    : null;
  const loyerChange =
    bail !== null &&
    loyer !== null &&
    charges !== null &&
    loyerActuel !== null &&
    (loyerActuel.loyer !== loyer || loyerActuel.charges !== charges);

  async function enregistrerInfos() {
    if (!logement) return;
    setTentative(true);
    if (!infosValides) return;

    setEnCours(true);
    setErreur(null);
    setMessage(null);

    try {
      await modifierLogement(logement.id, {
        nom: nom.trim(),
        adresse: adresse.trim(),
        codePostal: codePostal.trim(),
        ville: ville.trim(),
        type: type as Logement['type'],
        reference: reference.trim() || null,
      });

      if (bail) {
        await modifierBail(bail.id, { jourEcheance: Number(jourEcheance) });
      }

      rafraichir();
      setMessage('Les informations du logement ont été enregistrées.');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'enregistrement a échoué.");
    } finally {
      setEnCours(false);
    }
  }

  /**
   * Enregistre un nouveau loyer sous forme de **nouvelle période**, à partir du
   * mois affiché. Les périodes antérieures ne sont pas touchées.
   */
  async function enregistrerLoyer() {
    if (!bail || loyer === null || charges === null) return;
    setEnCours(true);
    setErreur(null);
    setConfirmeLoyer(false);

    try {
      await ajouterPeriodeLoyer(bail.id, {
        debut: cle,
        loyer,
        charges,
      });

      rafraichir();
      await charger();
      setMessage(
        `Nouveau loyer enregistré à partir de ${libelleLongCapitalise(mois)}. Les quittances déjà générées ne changent pas.`,
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le nouveau loyer n'a pas pu être enregistré.");
    } finally {
      setEnCours(false);
    }
  }

  if (chargement) {
    return (
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + espaces.enorme },
        ]}
      >
        <EnTeteEcran titre="Modifier le logement" />
        <Text style={styles.chargement}>Chargement…</Text>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.plein}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + espaces.enorme },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <EnTeteEcran titre="Modifier le logement" sousTitre={logement?.nom} />

        {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}
        {message ? <BandeauMessage ton="succes" message={message} /> : null}

        <Carte>
          <Text style={styles.section}>Le logement</Text>
          <Champ
            libelle="Nom du logement"
            valeur={nom}
            onChangement={setNom}
            placeholder="Ex. Appartement 1"
            erreur={erreurNom}
            obligatoire
          />
          <Champ
            libelle="Adresse"
            valeur={adresse}
            onChangement={setAdresse}
            placeholder="Ex. 5 place de la Mairie"
            erreur={erreurAdresse}
            obligatoire
          />
          <Champ
            libelle="Code postal"
            valeur={codePostal}
            onChangement={(v) => setCodePostal(v.replace(/[^0-9]/g, ''))}
            placeholder="95360"
            clavier="number-pad"
            maxLength={5}
            erreur={erreurCodePostal}
            obligatoire
          />
          <Champ
            libelle="Ville"
            valeur={ville}
            onChangement={setVille}
            placeholder="Montmagny"
            erreur={erreurVille}
            obligatoire
          />

          <Text style={styles.etiquette}>Type de logement</Text>
          <Segments
            segments={TYPES_LOGEMENT.map((t) => ({ valeur: t.valeur, libelle: t.libelle }))}
            valeur={type}
            onChanger={(v: string) => setType(v)}
            defilable
          />

          <Champ
            libelle="Référence"
            valeur={reference}
            onChangement={setReference}
            placeholder="Ex. lot 12, cage B (facultatif)"
          />
        </Carte>

        {bail ? (
          <>
            <Carte>
              <Text style={styles.section}>Loyer et échéance</Text>
              <Text style={styles.aide}>
                Le loyer s’applique à partir de {libelleLongCapitalise(mois)}. Les mois
                précédents gardent le loyer qui était en vigueur, et les quittances déjà
                générées restent inchangées.
              </Text>

              <ChampMontant
                libelle="Loyer hors charges"
                valeurCentimes={loyer}
                onChangement={setLoyer}
              />
              <ChampMontant
                libelle="Charges"
                valeurCentimes={charges}
                onChangement={setCharges}
              />

              {loyer !== null && charges !== null ? (
                <LigneDetail
                  libelle="Total mensuel"
                  valeur={formatMontant(loyer + charges)}
                  accentuee
                />
              ) : null}

              {loyerActuel ? (
                <LigneDetail
                  libelle="Loyer actuellement en vigueur"
                  valeur={`${formatMontant(loyerActuel.loyer)} + ${formatMontant(loyerActuel.charges)}`}
                />
              ) : null}

              <Champ
                libelle="Jour d’échéance habituel"
                valeur={jourEcheance}
                onChangement={(v) => setJourEcheance(v.replace(/[^0-9]/g, ''))}
                placeholder="Ex. 5"
                clavier="number-pad"
                maxLength={2}
                aide="Sert à signaler un retard à partir de ce jour du mois."
                erreur={erreurJour}
              />

              <Bouton
                libelle="Enregistrer le loyer"
                variante="secondaire"
                desactive={!loyerChange || enCours}
                onPress={() => setConfirmeLoyer(true)}
              />

              {loyerChange ? (
                <Text style={styles.note}>
                  Le nouveau loyer remplacera {loyerActuel ? `« ${formatMontant(loyerActuel.loyer + loyerActuel.charges)} » ` : ''}
                  à partir de {libelleLongCapitalise(mois)}.
                </Text>
              ) : (
                <Text style={styles.note}>
                  Modifiez le loyer ou les charges pour enregistrer un changement.
                </Text>
              )}
            </Carte>

            <Carte>
              <Text style={styles.section}>Historique des loyers</Text>
              {periodes.map((p) => {
                const depuis = depuisCle(p.debut);
                return (
                  <LigneDetail
                    key={p.id}
                    libelle={depuis ? `Depuis ${libelleLongCapitalise(depuis)}` : 'Loyer initial'}
                    valeur={`${formatMontant(p.loyer)} + ${formatMontant(p.charges)}`}
                  />
                );
              })}
            </Carte>
          </>
        ) : null}

        <Bouton
          libelle="Enregistrer les informations"
          desactive={!infosValides || enCours}
          occupe={enCours}
          onPress={enregistrerInfos}
        />
      </ScrollView>

      <DialogueConfirmation
        visible={confirmeLoyer}
        titre="Enregistrer ce nouveau loyer ?"
        message={`Le loyer passera à ${formatMontant((loyer ?? 0) + (charges ?? 0))} à partir de ${libelleLongCapitalise(mois)}. Les quittances des mois précédents ne seront pas modifiées.`}
        libelleConfirmer="Oui, enregistrer"
        occupe={enCours}
        onConfirmer={enregistrerLoyer}
        onAnnuler={() => setConfirmeLoyer(false)}
      />
    </KeyboardAvoidingView>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  plein: {
    flex: 1,
    backgroundColor: couleurs.fond,
  },
  contenu: {
    paddingHorizontal: espaces.lg,
    gap: espaces.lg,
  },
  chargement: {
    ...typographie.corps,
    color: couleurs.texteTertiaire,
    textAlign: 'center',
    marginTop: espaces.xxl,
  },
  section: {
    ...typographie.petitAppuye,
    color: couleurs.texteTertiaire,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: espaces.sm,
  },
  etiquette: {
    ...typographie.petitAppuye,
    color: couleurs.texteSecondaire,
    marginBottom: espaces.sm,
  },
  aide: {
    ...typographie.petit,
    color: couleurs.texteSecondaire,
    marginBottom: espaces.md,
  },
  note: {
    ...typographie.petit,
    color: couleurs.texteTertiaire,
    marginTop: espaces.sm,
  },
});

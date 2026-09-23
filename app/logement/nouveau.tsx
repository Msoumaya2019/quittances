/**
 * Assistant d'ajout d'un logement, en quatre étapes.
 *
 * Étape 1 : propriétaire (existant ou nouveau).
 * Étape 2 : logement.
 * Étape 3 : locataire.
 * Étape 4 : informations financières.
 *
 * On ne demande à chaque écran que ce qui est nécessaire, et l'assistant
 * n'enregistre qu'à la fin : un parcours interrompu ne laisse donc aucune
 * donnée incomplète en base.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BandeauMessage } from '@/ui/components/BandeauMessage';
import { Bouton } from '@/ui/components/Bouton';
import { Carte } from '@/ui/components/Carte';
import { Champ, ChampMontant } from '@/ui/components/Champ';
import { EnTeteEcran } from '@/ui/components/EnTeteEcran';
import { LigneDetail } from '@/ui/components/LigneDetail';
import { espaces, rayons, typographie } from '@/ui/tokens';
import { formatMontant } from '@/domain/money';
import { aujourdHui, libelleLongCapitalise, periodeActuelle, versCle } from '@/domain/period';
import {
  TYPES_LOGEMENT,
  type Proprietaire,
  type TypeLogement,
} from '@/domain/types';
import { listerProprietaires } from '@/db/repositories/owners';
import {
  creerLogementComplet,
  type SaisieTitulaire,
} from '@/db/repositories/properties';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, useCouleurs, type Couleurs } from '@/ui/theme';

const NOMBRE_ETAPES = 4;

interface ProprietaireNouveau {
  nom: string;
  qualite: string;
  adresse: string;
  codePostal: string;
  ville: string;
  telephone: string;
  email: string;
}

export default function EcranNouveauLogement() {
  const styles = useStyles(creerStyles);
  const couleurs = useCouleurs();
  const insets = useSafeAreaInsets();
  const { rafraichir, definirMois } = useApplication();

  const [etape, setEtape] = useState(1);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creationEnCours, setCreationEnCours] = useState(false);

  // --- Étape 1 : propriétaire -------------------------------------------
  const [proprietaires, setProprietaires] = useState<Proprietaire[]>([]);
  const [proprietaireId, setProprietaireId] = useState<string | null>(null);
  const [creationProprietaire, setCreationProprietaire] = useState(false);
  const [nouveauProprietaire, setNouveauProprietaire] = useState<ProprietaireNouveau>({
    nom: '',
    qualite: '',
    adresse: '',
    codePostal: '',
    ville: '',
    telephone: '',
    email: '',
  });

  // --- Étape 2 : logement ----------------------------------------------
  const [nomLogement, setNomLogement] = useState('');
  const [typeLogement, setTypeLogement] = useState<TypeLogement>('appartement');
  const [complement, setComplement] = useState('');
  const [adresse, setAdresse] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [ville, setVille] = useState('');
  const [reference, setReference] = useState('');

  // --- Étape 3 : locataire ---------------------------------------------
  const [nomTitulaire, setNomTitulaire] = useState('');
  const [prenomTitulaire, setPrenomTitulaire] = useState('');
  const [autresTitulaires, setAutresTitulaires] = useState<SaisieTitulaire[]>([]);
  const [dateEntree, setDateEntree] = useState(aujourdHui());
  const [dateSortie, setDateSortie] = useState('');

  // --- Étape 4 : finances ----------------------------------------------
  const [loyer, setLoyer] = useState<number | null>(null);
  const [charges, setCharges] = useState<number | null>(0);
  const [jourEcheance, setJourEcheance] = useState('5');
  const [depotGarantie, setDepotGarantie] = useState<number | null>(null);

  // --- Chargement des propriétaires ------------------------------------
  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const liste = await listerProprietaires();
        if (!actif) return;
        setProprietaires(liste);
        if (liste.length === 0) setCreationProprietaire(true);
        else setProprietaireId(liste[0].id);
      } catch {
        if (actif) setCreationProprietaire(true);
      }
    })();
    return () => {
      actif = false;
    };
  }, []);

  const totalMensuel = (loyer ?? 0) + (charges ?? 0);

  const periodeDebut = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEntree)) return versCle(periodeActuelle());
    return dateEntree.slice(0, 7);
  }, [dateEntree]);

  // --- Validation par étape --------------------------------------------
  const validerEtape = useCallback((): string | null => {
    if (etape === 1) {
      if (creationProprietaire) {
        if (!nouveauProprietaire.nom.trim()) return 'Indiquez le nom du propriétaire.';
        if (!nouveauProprietaire.adresse.trim()) return 'Indiquez l’adresse du propriétaire.';
        if (!/^\d{5}$/.test(nouveauProprietaire.codePostal.trim()))
          return 'Le code postal doit comporter 5 chiffres.';
        if (!nouveauProprietaire.ville.trim()) return 'Indiquez la ville du propriétaire.';
      } else if (!proprietaireId) {
        return 'Sélectionnez un propriétaire, ou créez-en un nouveau.';
      }
      return null;
    }

    if (etape === 2) {
      if (!nomLogement.trim()) return 'Donnez un nom à ce logement.';
      if (!adresse.trim()) return 'Indiquez l’adresse du logement.';
      if (!/^\d{5}$/.test(codePostal.trim())) return 'Le code postal doit comporter 5 chiffres.';
      if (!ville.trim()) return 'Indiquez la ville du logement.';
      return null;
    }

    if (etape === 3) {
      if (!nomTitulaire.trim()) return 'Indiquez le nom du locataire.';
      if (!prenomTitulaire.trim()) return 'Indiquez le prénom du locataire.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEntree)) {
        return "La date d'entrée doit être au format année-mois-jour, par exemple 2026-09-01.";
      }
      if (dateSortie && !/^\d{4}-\d{2}-\d{2}$/.test(dateSortie)) {
        return 'La date de sortie doit être au format année-mois-jour, ou laissée vide.';
      }
      if (dateSortie && dateSortie < dateEntree) {
        return "La date de sortie ne peut pas précéder la date d'entrée.";
      }
      return null;
    }

    if (!loyer || loyer <= 0) return 'Indiquez le montant du loyer hors charges.';
    const jour = Number(jourEcheance);
    if (!Number.isInteger(jour) || jour < 1 || jour > 31) {
      return 'Le jour de paiement doit être un nombre entre 1 et 31.';
    }
    return null;
  }, [
    etape,
    creationProprietaire,
    nouveauProprietaire,
    proprietaireId,
    nomLogement,
    adresse,
    codePostal,
    ville,
    nomTitulaire,
    prenomTitulaire,
    dateEntree,
    dateSortie,
    loyer,
    jourEcheance,
  ]);

  const suivant = useCallback(() => {
    const probleme = validerEtape();
    if (probleme) {
      setErreur(probleme);
      return;
    }
    setErreur(null);
    setEtape((valeur) => Math.min(NOMBRE_ETAPES, valeur + 1));
  }, [validerEtape]);

  const precedent = useCallback(() => {
    setErreur(null);
    setEtape((valeur) => Math.max(1, valeur - 1));
  }, []);

  const creer = useCallback(async () => {
    const probleme = validerEtape();
    if (probleme) {
      setErreur(probleme);
      return;
    }

    setCreationEnCours(true);
    setErreur(null);

    try {
      const titulaires: SaisieTitulaire[] = [
        { nom: nomTitulaire, prenom: prenomTitulaire },
        ...autresTitulaires.filter((t) => t.nom.trim() && t.prenom.trim()),
      ];

      await creerLogementComplet({
        proprietaire: creationProprietaire
          ? {
              nouveau: {
                nom: nouveauProprietaire.nom,
                qualite: nouveauProprietaire.qualite || null,
                adresse: nouveauProprietaire.adresse,
                codePostal: nouveauProprietaire.codePostal,
                ville: nouveauProprietaire.ville,
                telephone: nouveauProprietaire.telephone || null,
                email: nouveauProprietaire.email || null,
              },
            }
          : { id: proprietaireId as string },
        logement: {
          nom: nomLogement,
          type: typeLogement,
          complement: complement || null,
          adresse,
          codePostal,
          ville,
          reference: reference || null,
        },
        bail: {
          dateEntree,
          dateSortie: dateSortie || null,
          jourEcheance: Number(jourEcheance),
          depotGarantie,
        },
        titulaires,
        loyer: {
          debut: periodeDebut,
          loyer: loyer ?? 0,
          charges: charges ?? 0,
        },
      });

      // Le mois affiché se cale sur la période d'effet du loyer, pour que le
      // nouveau logement soit immédiatement visible sur l'accueil.
      definirMois({
        annee: Number(periodeDebut.slice(0, 4)),
        mois: Number(periodeDebut.slice(5, 7)),
      });

      rafraichir();
      router.dismissAll();
      router.replace('/(tabs)');
    } catch (e) {
      setErreur(
        e instanceof Error
          ? `Le logement n'a pas pu être créé : ${e.message}`
          : "Le logement n'a pas pu être créé.",
      );
    } finally {
      setCreationEnCours(false);
    }
  }, [
    validerEtape,
    nomTitulaire,
    prenomTitulaire,
    autresTitulaires,
    creationProprietaire,
    nouveauProprietaire,
    proprietaireId,
    nomLogement,
    typeLogement,
    complement,
    adresse,
    codePostal,
    ville,
    reference,
    dateEntree,
    dateSortie,
    jourEcheance,
    depotGarantie,
    periodeDebut,
    loyer,
    charges,
    definirMois,
    rafraichir,
  ]);

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
          titre="Ajouter un logement"
          sousTitre={`Étape ${etape} sur ${NOMBRE_ETAPES}`}
          actionLibelle="Annuler"
          actionOnPress={() => router.back()}
        />

        <EtapeCourante etape={etape} />

        {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

        {/* ---------------- Étape 1 : propriétaire ---------------- */}
        {etape === 1 ? (
          <>
            {proprietaires.length > 0 ? (
              <Carte style={styles.carteEtape}>
                <Text style={typographie.titreCarte}>Choisir un propriétaire existant</Text>
                {proprietaires.map((proprietaire) => {
                  const actif = !creationProprietaire && proprietaire.id === proprietaireId;
                  return (
                    <Pressable
                      key={proprietaire.id}
                      onPress={() => {
                        setProprietaireId(proprietaire.id);
                        setCreationProprietaire(false);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: actif }}
                      style={[styles.option, actif && styles.optionActive]}
                    >
                      <View style={styles.optionTextes}>
                        <Text style={[typographie.corpsAppuye, styles.optionTitre]}>
                          {proprietaire.nom}
                        </Text>
                        <Text style={[typographie.petit, styles.optionDetail]}>
                          {proprietaire.codePostal} {proprietaire.ville}
                        </Text>
                      </View>
                      {actif ? <Text style={styles.coche}>✓</Text> : null}
                    </Pressable>
                  );
                })}

                <Bouton
                  libelle="Créer un nouveau propriétaire"
                  variante={creationProprietaire ? 'principal' : 'secondaire'}
                  onPress={() => setCreationProprietaire(true)}
                  compact
                />
              </Carte>
            ) : null}

            {creationProprietaire ? (
              <Carte style={styles.carteEtape}>
                <Text style={typographie.titreCarte}>Nouveau propriétaire</Text>

                <Champ
                  libelle="Nom et prénom, ou raison sociale"
                  valeur={nouveauProprietaire.nom}
                  onChangement={(v) => setNouveauProprietaire((p) => ({ ...p, nom: v }))}
                  placeholder="SCI des Tilleuls, ou Dupont Jean"
                  obligatoire
                />

                <Champ
                  libelle="Qualité (facultatif)"
                  valeur={nouveauProprietaire.qualite}
                  onChangement={(v) => setNouveauProprietaire((p) => ({ ...p, qualite: v }))}
                  placeholder="Gérant, représentant de l’indivision…"
                />

                <Champ
                  libelle="Adresse"
                  valeur={nouveauProprietaire.adresse}
                  onChangement={(v) => setNouveauProprietaire((p) => ({ ...p, adresse: v }))}
                  placeholder="12 rue des Écoles"
                  obligatoire
                />

                <View style={styles.rangee}>
                  <View style={styles.colonneEtroite}>
                    <Champ
                      libelle="Code postal"
                      valeur={nouveauProprietaire.codePostal}
                      onChangement={(v) =>
                        setNouveauProprietaire((p) => ({
                          ...p,
                          codePostal: v.replace(/[^0-9]/g, '').slice(0, 5),
                        }))
                      }
                      placeholder="95300"
                      clavier="number-pad"
                      maxLength={5}
                      obligatoire
                    />
                  </View>
                  <View style={styles.colonneLarge}>
                    <Champ
                      libelle="Ville"
                      valeur={nouveauProprietaire.ville}
                      onChangement={(v) => setNouveauProprietaire((p) => ({ ...p, ville: v }))}
                      placeholder="Montmagny"
                      obligatoire
                    />
                  </View>
                </View>

                <Champ
                  libelle="Téléphone (facultatif)"
                  valeur={nouveauProprietaire.telephone}
                  onChangement={(v) => setNouveauProprietaire((p) => ({ ...p, telephone: v }))}
                  clavier="phone-pad"
                  placeholder="06 12 34 56 78"
                />

                <Champ
                  libelle="Adresse électronique (facultatif)"
                  valeur={nouveauProprietaire.email}
                  onChangement={(v) => setNouveauProprietaire((p) => ({ ...p, email: v }))}
                  clavier="email-address"
                  autoCapitalisation="none"
                  placeholder="contact@exemple.fr"
                />
              </Carte>
            ) : null}
          </>
        ) : null}

        {/* ---------------- Étape 2 : logement ---------------- */}
        {etape === 2 ? (
          <Carte style={styles.carteEtape}>
            <Champ
              libelle="Nom du logement"
              valeur={nomLogement}
              onChangement={setNomLogement}
              placeholder="Appartement 1, Studio 3, Maison 2, Garage…"
              aide="Ce nom apparaît sur l’accueil et sur les quittances."
              obligatoire
            />

            <View style={styles.blocTypes}>
              <Text style={typographie.petitAppuye}>Type de logement</Text>
              <View style={styles.listeModes}>
                {TYPES_LOGEMENT.map((option) => (
                  <Bouton
                    key={option.valeur}
                    libelle={option.libelle}
                    onPress={() => setTypeLogement(option.valeur)}
                    variante={typeLogement === option.valeur ? 'principal' : 'discret'}
                    compact
                    pleineLargeur={false}
                  />
                ))}
              </View>
            </View>

            <Champ
              libelle="Complément d’adresse (facultatif)"
              valeur={complement}
              onChangement={setComplement}
              placeholder="Bâtiment B, 2e étage, porte 4"
            />

            <Champ
              libelle="Adresse"
              valeur={adresse}
              onChangement={setAdresse}
              placeholder="14 rue de la Mairie"
              obligatoire
            />

            <View style={styles.rangee}>
              <View style={styles.colonneEtroite}>
                <Champ
                  libelle="Code postal"
                  valeur={codePostal}
                  onChangement={(v) => setCodePostal(v.replace(/[^0-9]/g, '').slice(0, 5))}
                  placeholder="95300"
                  clavier="number-pad"
                  maxLength={5}
                  obligatoire
                />
              </View>
              <View style={styles.colonneLarge}>
                <Champ
                  libelle="Ville"
                  valeur={ville}
                  onChangement={setVille}
                  placeholder="Montmagny"
                  obligatoire
                />
              </View>
            </View>

            <Champ
              libelle="Référence (facultatif)"
              valeur={reference}
              onChangement={setReference}
              placeholder="Lot 12, référence interne…"
            />
          </Carte>
        ) : null}

        {/* ---------------- Étape 3 : locataire ---------------- */}
        {etape === 3 ? (
          <>
            <Carte style={styles.carteEtape}>
              <Text style={typographie.titreCarte}>Titulaire du bail</Text>

              <Champ
                libelle="Prénom"
                valeur={prenomTitulaire}
                onChangement={setPrenomTitulaire}
                placeholder="Mohamed"
                obligatoire
              />

              <Champ
                libelle="Nom"
                valeur={nomTitulaire}
                onChangement={setNomTitulaire}
                placeholder="BENALI"
                majuscules
                obligatoire
              />

              <Champ
                libelle="Date d’entrée"
                valeur={dateEntree}
                onChangement={setDateEntree}
                placeholder="AAAA-MM-JJ"
                clavier="numbers-and-punctuation"
                aide="Format année-mois-jour, par exemple 2026-09-01."
                maxLength={10}
                obligatoire
              />

              <Champ
                libelle="Date de sortie (facultatif)"
                valeur={dateSortie}
                onChangement={setDateSortie}
                placeholder="À renseigner le jour du départ"
                clavier="numbers-and-punctuation"
                aide="Laisser vide tant que le locataire est en place."
                maxLength={10}
              />
            </Carte>

            <Carte style={styles.carteEtape}>
              <Text style={typographie.titreCarte}>Autres titulaires (facultatif)</Text>
              <Text style={[typographie.petit, styles.aide]}>
                Pour une colocation ou un couple, ajoutez les autres personnes figurant
                sur le bail. Leurs noms apparaîtront sur les quittances.
              </Text>

              {autresTitulaires.map((titulaire, index) => (
                <View key={index} style={styles.blocAutreTitulaire}>
                  <View style={styles.rangee}>
                    <View style={styles.colonneLarge}>
                      <Champ
                        libelle="Prénom"
                        valeur={titulaire.prenom}
                        onChangement={(v) =>
                          setAutresTitulaires((liste) =>
                            liste.map((t, i) => (i === index ? { ...t, prenom: v } : t)),
                          )
                        }
                      />
                    </View>
                    <View style={styles.colonneLarge}>
                      <Champ
                        libelle="Nom"
                        valeur={titulaire.nom}
                        onChangement={(v) =>
                          setAutresTitulaires((liste) =>
                            liste.map((t, i) => (i === index ? { ...t, nom: v } : t)),
                          )
                        }
                        majuscules
                      />
                    </View>
                  </View>
                  <Bouton
                    libelle="Retirer"
                    variante="danger"
                    compact
                    onPress={() =>
                      setAutresTitulaires((liste) => liste.filter((_, i) => i !== index))
                    }
                  />
                </View>
              ))}

              <Bouton
                libelle="+ Ajouter un titulaire"
                variante="secondaire"
                compact
                onPress={() =>
                  setAutresTitulaires((liste) => [...liste, { nom: '', prenom: '' }])
                }
              />
            </Carte>
          </>
        ) : null}

        {/* ---------------- Étape 4 : finances ---------------- */}
        {etape === 4 ? (
          <>
            <Carte style={styles.carteEtape}>
              <ChampMontant
                libelle="Loyer hors charges"
                valeurCentimes={loyer}
                onChangement={setLoyer}
                obligatoire
              />

              <ChampMontant
                libelle="Charges"
                valeurCentimes={charges}
                onChangement={setCharges}
                aide="Provision mensuelle. Laissez 0,00 € s’il n’y a pas de charges."
              />

              <View style={styles.blocTotal}>
                <Text style={[typographie.petit, styles.etiquetteTotal]}>
                  Total mensuel
                </Text>
                <Text style={[typographie.montant, styles.montantTotal]}>
                  {formatMontant(totalMensuel, { decimales: 'auto' })}
                </Text>
              </View>
            </Carte>

            <Carte style={styles.carteEtape}>
              <Champ
                libelle="Jour habituel de paiement"
                valeur={jourEcheance}
                onChangement={(v) => setJourEcheance(v.replace(/[^0-9]/g, '').slice(0, 2))}
                clavier="number-pad"
                placeholder="5"
                aide="Entre 1 et 31. Ce jour sert à repérer les retards."
                maxLength={2}
              />

              <ChampMontant
                libelle="Dépôt de garantie (facultatif)"
                valeurCentimes={depotGarantie}
                onChangement={setDepotGarantie}
              />
            </Carte>

            {/* Récapitulatif */}
            <Carte style={styles.carteRecap}>
              <Text style={typographie.titreCarte}>Récapitulatif</Text>

              <LigneDetail
                libelle="Propriétaire"
                valeur={
                  creationProprietaire
                    ? nouveauProprietaire.nom || '—'
                    : (proprietaires.find((p) => p.id === proprietaireId)?.nom ?? '—')
                }
              />
              <LigneDetail libelle="Logement" valeur={nomLogement || '—'} />
              <LigneDetail
                libelle="Adresse"
                valeur={`${adresse}${complement ? `, ${complement}` : ''}, ${codePostal} ${ville}`}
              />
              <LigneDetail
                libelle="Locataire"
                valeur={`${prenomTitulaire} ${nomTitulaire}`.trim() || '—'}
              />
              {autresTitulaires.filter((t) => t.nom.trim()).length > 0 ? (
                <LigneDetail
                  libelle="Autres titulaires"
                  valeur={autresTitulaires
                    .filter((t) => t.nom.trim())
                    .map((t) => `${t.prenom} ${t.nom}`)
                    .join(', ')}
                />
              ) : null}
              <LigneDetail libelle="Entrée" valeur={dateEntree} />
              <LigneDetail
                libelle="Loyer hors charges"
                valeur={formatMontant(loyer ?? 0, { decimales: 'auto' })}
              />
              <LigneDetail
                libelle="Charges"
                valeur={formatMontant(charges ?? 0, { decimales: 'auto' })}
              />
              <LigneDetail
                libelle="Total mensuel"
                valeur={formatMontant(totalMensuel, { decimales: 'auto' })}
                accentuee
                teinte={couleurs.accentFonce}
              />
              <LigneDetail libelle="Premier mois facturé" valeur={libelleLongCapitalise({
                annee: Number(periodeDebut.slice(0, 4)),
                mois: Number(periodeDebut.slice(5, 7)),
              })} />
            </Carte>
          </>
        ) : null}

        {/* ---------------- Navigation ---------------- */}
        <View style={styles.actions}>
          {etape < NOMBRE_ETAPES ? (
            <>
              <Bouton libelle="Continuer" onPress={suivant} />
              {etape > 1 ? (
                <Bouton libelle="Retour" variante="discret" onPress={precedent} />
              ) : null}
            </>
          ) : (
            <>
              <Bouton
                libelle="CRÉER MON LOGEMENT"
                onPress={() => void creer()}
                occupe={creationEnCours}
              />
              <Bouton
                libelle="Retour"
                variante="discret"
                desactive={creationEnCours}
                onPress={precedent}
              />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Indicateur de progression du parcours. */
function EtapeCourante({ etape }: { etape: number }) {
  const styles = useStyles(creerStyles);
  const libelles = ['Propriétaire', 'Logement', 'Locataire', 'Finances'];

  return (
    <View style={styles.progression}>
      {libelles.map((libelle, index) => {
        const numero = index + 1;
        const atteinte = numero <= etape;
        return (
          <View key={libelle} style={styles.etapeConteneur}>
            <View style={[styles.puce, atteinte && styles.puceAtteinte]}>
              <Text style={[typographie.minuscule, atteinte && styles.puceTexteAtteinte]}>
                {numero}
              </Text>
            </View>
            <Text
              style={[typographie.minuscule, styles.libelleEtape, atteinte && styles.libelleAtteinte]}
              numberOfLines={1}
            >
              {libelle}
            </Text>
          </View>
        );
      })}
    </View>
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
    gap: espaces.md,
  },
  progression: {
    flexDirection: 'row',
    gap: espaces.sm,
    paddingVertical: espaces.sm,
  },
  etapeConteneur: {
    flex: 1,
    alignItems: 'center',
    gap: espaces.xs,
  },
  puce: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: couleurs.fondSourdine,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
  },
  puceAtteinte: {
    backgroundColor: couleurs.accent,
    borderColor: couleurs.accent,
  },
  puceTexteAtteinte: {
    color: couleurs.surAccent,
  },
  libelleEtape: {
    color: couleurs.texteTertiaire,
  },
  libelleAtteinte: {
    color: couleurs.accentFonce,
  },
  carteEtape: {
    gap: espaces.lg,
  },
  carteRecap: {
    gap: espaces.xs,
    backgroundColor: couleurs.accentTresClair,
    borderColor: couleurs.accentClair,
  },
  rangee: {
    flexDirection: 'row',
    gap: espaces.md,
  },
  colonneEtroite: {
    flex: 1,
  },
  colonneLarge: {
    flex: 1.6,
  },
  blocTypes: {
    gap: espaces.sm,
  },
  listeModes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaces.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.md,
    padding: espaces.md,
    borderRadius: rayons.md,
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.fond,
  },
  optionActive: {
    borderColor: couleurs.accent,
    backgroundColor: couleurs.accentTresClair,
  },
  optionTextes: {
    flex: 1,
    gap: 2,
  },
  optionTitre: {
    color: couleurs.texte,
  },
  optionDetail: {
    color: couleurs.texteSecondaire,
  },
  coche: {
    color: couleurs.accent,
    fontSize: 17,
    fontWeight: '800',
  },
  blocAutreTitulaire: {
    gap: espaces.sm,
    padding: espaces.md,
    borderRadius: rayons.md,
    backgroundColor: couleurs.fond,
  },
  aide: {
    color: couleurs.texteSecondaire,
    lineHeight: 19,
  },
  blocTotal: {
    alignItems: 'center',
    gap: espaces.xs,
    paddingVertical: espaces.md,
    borderRadius: rayons.md,
    backgroundColor: couleurs.accentTresClair,
  },
  etiquetteTotal: {
    color: couleurs.texteSecondaire,
  },
  montantTotal: {
    color: couleurs.accentFonce,
  },
  actions: {
    gap: espaces.sm,
    marginTop: espaces.sm,
  },
});

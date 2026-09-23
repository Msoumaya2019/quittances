/**
 * Modification des locataires d'un bail en cours.
 *
 * On modifie les titulaires **d'un bail**, pas une fiche isolée : un bail peut
 * en compter plusieurs, et l'ordre compte — le premier est le titulaire
 * principal, celui dont le nom ouvre la quittance.
 *
 * Rien n'est écrit avant l'appui sur « Enregistrer ». Un locataire qu'on
 * s'apprête à retirer ne disparaît donc pas d'un geste malheureux : la liste
 * n'est remplacée qu'au moment de valider.
 */

import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import {
  BandeauMessage,
  BarreActionFixe,
  Bouton,
  Carte,
  Champ,
  EcranVide,
  EnTeteEcran,
} from '@/ui/components';
import { espaces, rayons, typographie } from '@/ui/tokens';
import {
  bailEnCours,
  remplacerTitulaires,
  titulairesDuBail,
  trouverLogement,
  type SaisieTitulaire,
} from '@/db/repositories/properties';
import type { Bail, Logement } from '@/domain/types';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, type Couleurs } from '@/ui/theme';

/**
 * Un titulaire en cours de saisie.
 *
 * Les champs sont des chaînes, y compris le téléphone : un champ vide doit
 * pouvoir exister, et `null` n'est pas saisissable. La conversion a lieu à
 * l'enregistrement.
 */
interface TitulaireSaisi {
  /** Identité de la ligne pour React, indépendante du nom saisi. */
  cle: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
}

let compteur = 0;

function nouvelleCle(): string {
  compteur += 1;
  return `titulaire-${compteur}`;
}

export default function EcranLocataires() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { rafraichir } = useApplication();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [logement, setLogement] = useState<Logement | null>(null);
  const [bail, setBail] = useState<Bail | null>(null);
  const [titulaires, setTitulaires] = useState<TitulaireSaisi[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);

  const charger = useCallback(async () => {
    if (!id) {
      setErreur('Logement introuvable.');
      setChargement(false);
      return;
    }

    try {
      const trouve = await trouverLogement(id);
      setLogement(trouve);

      if (!trouve) {
        setErreur('Ce logement est introuvable.');
        setChargement(false);
        return;
      }

      const enCours = await bailEnCours(id);
      setBail(enCours);

      if (!enCours) {
        setTitulaires([]);
        setErreur(null);
        setChargement(false);
        return;
      }

      const existants = await titulairesDuBail(enCours.id);
      setTitulaires(
        existants.map((t) => ({
          cle: nouvelleCle(),
          nom: t.nom,
          prenom: t.prenom,
          telephone: t.telephone ?? '',
          email: t.email ?? '',
        })),
      );
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de charger les locataires.');
    } finally {
      setChargement(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger]),
  );

  function modifier(cle: string, champ: keyof TitulaireSaisi, valeur: string) {
    setTitulaires((actuels) =>
      actuels.map((t) => (t.cle === cle ? { ...t, [champ]: valeur } : t)),
    );
  }

  function ajouter() {
    setTitulaires((actuels) => [
      ...actuels,
      { cle: nouvelleCle(), nom: '', prenom: '', telephone: '', email: '' },
    ]);
  }

  function retirer(cle: string) {
    setTitulaires((actuels) => actuels.filter((t) => t.cle !== cle));
  }

  // Un nom et un prénom sont exigés par les documents : sans eux, la quittance
  // porterait une ligne vide. On refuse donc d'enregistrer plutôt que de
  // laisser passer une saisie incomplète.
  const incomplets = titulaires.filter((t) => !t.nom.trim() || !t.prenom.trim());
  const pretAEnregistrer = titulaires.length > 0 && incomplets.length === 0;

  async function enregistrer() {
    if (!bail) return;

    if (titulaires.length === 0) {
      setErreur('Un bail doit avoir au moins un locataire.');
      return;
    }
    if (incomplets.length > 0) {
      setErreur('Chaque locataire doit avoir un nom et un prénom.');
      return;
    }

    setEnregistrement(true);
    try {
      const saisie: SaisieTitulaire[] = titulaires.map((t) => ({
        nom: t.nom,
        prenom: t.prenom,
        telephone: t.telephone.trim() || null,
        email: t.email.trim() || null,
      }));

      await remplacerTitulaires(bail.id, saisie);
      rafraichir();
      setErreur(null);
      router.back();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Les locataires n'ont pas pu être enregistrés.");
    } finally {
      setEnregistrement(false);
    }
  }

  const contenu = (
    <ScrollView
      contentContainerStyle={[
        styles.conteneur,
        { paddingTop: insets.top + espaces.sm, paddingBottom: espaces.xxl },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <EnTeteEcran
        titre="Les locataires"
        sousTitre={logement?.nom}
      />

      {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

      {chargement ? <Text style={styles.chargement}>Chargement…</Text> : null}

      {!chargement && !bail ? (
        <EcranVide
          titre="Aucun locataire en place"
          message="Ce logement est libre. Installez un locataire pour pouvoir enregistrer des paiements et générer des quittances."
          illustration="maison"
          actionLibelle="Ajouter un locataire"
          actionOnPress={() =>
            router.push({ pathname: '/logement/nouveau', params: { logementId: id ?? '' } })
          }
        />
      ) : null}

      {!chargement && bail ? (
        <>
          <Carte>
            <Text style={styles.section}>Comment ça marche</Text>
            <Text style={styles.aide}>
              Le premier locataire est le titulaire principal : c’est son nom qui figure en tête des
              quittances. Modifier cette liste ne touche pas aux quittances déjà émises, qui gardent
              le nom inscrit le jour de leur génération.
            </Text>
          </Carte>

          {titulaires.map((t, index) => (
            <Carte key={t.cle}>
              <View style={styles.enteteTitulaire}>
                <Text style={styles.rang}>
                  {index === 0 ? 'Titulaire principal' : `Locataire ${index + 1}`}
                </Text>
                {index > 0 ? (
                  <Bouton
                    libelle="Retirer"
                    variante="discret"
                    compact
                    pleineLargeur={false}
                    onPress={() => retirer(t.cle)}
                    accessibilite={`Retirer le locataire ${index + 1}`}
                  />
                ) : null}
              </View>

              <Champ
                libelle="Nom"
                valeur={t.nom}
                onChangement={(valeur) => modifier(t.cle, 'nom', valeur)}
                placeholder="DUPONT"
                obligatoire
                majuscules
              />
              <Champ
                libelle="Prénom"
                valeur={t.prenom}
                onChangement={(valeur) => modifier(t.cle, 'prenom', valeur)}
                placeholder="Marie"
                obligatoire
                autoCapitalisation="words"
              />
              <Champ
                libelle="Téléphone"
                valeur={t.telephone}
                onChangement={(valeur) => modifier(t.cle, 'telephone', valeur)}
                placeholder="06 12 34 56 78"
                clavier="phone-pad"
                aide="Facultatif. Sert à joindre le locataire, jamais sur les documents."
              />
              <Champ
                libelle="Courriel"
                valeur={t.email}
                onChangement={(valeur) => modifier(t.cle, 'email', valeur)}
                placeholder="marie.dupont@exemple.fr"
                clavier="email-address"
                autoCapitalisation="none"
                aide="Facultatif."
              />
            </Carte>
          ))}

          <Bouton
            libelle="Ajouter un locataire"
            variante="secondaire"
            onPress={ajouter}
          />
        </>
      ) : null}
    </ScrollView>
  );

  return (
    <View style={styles.plein}>
      {/* Le clavier recouvrirait les derniers champs, dont le courriel. */}
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView behavior="padding" style={styles.plein}>
          {contenu}
        </KeyboardAvoidingView>
      ) : (
        contenu
      )}

      {bail && titulaires.length > 0 ? (
        <BarreActionFixe
          libelle="Enregistrer"
          aide={
            pretAEnregistrer
              ? undefined
              : 'Complétez le nom et le prénom de chaque locataire.'
          }
          onPress={enregistrer}
        />
      ) : null}
    </View>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
    plein: {
      flex: 1,
      backgroundColor: couleurs.fond,
    },
    conteneur: {
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
    aide: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
    },
    enteteTitulaire: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaces.md,
      marginBottom: espaces.md,
      paddingBottom: espaces.sm,
      borderBottomWidth: 1,
      borderBottomColor: couleurs.bordure,
    },
    rang: {
      ...typographie.corpsAppuye,
      color: couleurs.texte,
      flex: 1,
    },
  });

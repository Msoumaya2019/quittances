/**
 * Enregistrement de la signature du bailleur.
 *
 * L'application ne propose pas de dessiner la signature au doigt : sans outil de
 * dessin vectoriel embarqué, le trait obtenu serait décevant sur une quittance.
 * On part donc d'une image choisie dans la pellicule — un scan ou une photo
 * détourée — que l'on convertit en base64 pour l'insérer dans le PDF.
 *
 * L'image n'est jamais transmise : elle est stockée dans la base locale, comme
 * le reste.
 */

import { useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApplication } from '@/state/ApplicationContext';
import { BandeauMessage, Bouton, Carte, EnTeteEcran } from '@/ui/components';
import { couleurs, espaces, rayons } from '@/ui/tokens';

/** Taille maximale acceptée : au-delà, le PDF devient lourd pour rien. */
const TAILLE_MAXIMALE = 900_000;

export default function EcranSignature() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reglages, majReglages } = useApplication();

  const [enregistree, setEnregistree] = useState<string | null>(reglages.signatureBase64);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function choisirImage() {
    setErreur(null);
    setSucces(false);
    setOccupe(true);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErreur(
          "L'accès à vos photos est nécessaire pour choisir une signature. Vous pouvez l'autoriser dans les réglages de votre téléphone.",
        );
        return;
      }

      const resultat = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (resultat.canceled) return;

      const selection = resultat.assets[0];
      const base64 = selection.base64;
      if (!base64) {
        setErreur("Cette image n'a pas pu être lue. Essayez-en une autre.");
        return;
      }

      const donnees = `data:image/${selection.mimeType?.includes('png') ? 'png' : 'jpeg'};base64,${base64}`;
      if (donnees.length > TAILLE_MAXIMALE) {
        setErreur(
          "Cette image est trop lourde. Choisissez une image plus petite, ou recadrez-la sur la signature seule.",
        );
        return;
      }

      setEnregistree(donnees);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La signature n'a pas pu être chargée.");
    } finally {
      setOccupe(false);
    }
  }

  async function enregistrer() {
    if (!enregistree) return;
    setOccupe(true);
    setErreur(null);
    try {
      await majReglages({ signatureBase64: enregistree, signatureActive: true });
      setSucces(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La signature n'a pas pu être enregistrée.");
    } finally {
      setOccupe(false);
    }
  }

  async function retirer() {
    setOccupe(true);
    setErreur(null);
    try {
      await majReglages({ signatureBase64: null, signatureActive: false });
      setEnregistree(null);
      setSucces(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La signature n'a pas pu être retirée.");
    } finally {
      setOccupe(false);
    }
  }

  const aChange = enregistree !== reglages.signatureBase64;

  return (
    <>
      <Stack.Screen options={{ title: 'Ma signature' }} />
      <ScrollView
        style={styles.ecran}
        contentContainerStyle={[styles.contenu, { paddingBottom: insets.bottom + espaces.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <EnTeteEcran
          titre="Ma signature"
          sousTitre="Elle sera apposée au bas des quittances, si vous l'activez."
        />

        {erreur ? <BandeauMessage message={erreur} ton="erreur" onFermer={() => setErreur(null)} /> : null}
        {succes ? (
          <BandeauMessage
            message="Signature enregistrée. Elle sera ajoutée à vos prochains documents."
            ton="succes"
            onFermer={() => setSucces(false)}
          />
        ) : null}

        <Carte>
          {enregistree ? (
            <View style={styles.apercu}>
              <Image
                source={{ uri: enregistree }}
                style={styles.image}
                resizeMode="contain"
                accessibilityLabel="Aperçu de votre signature"
              />
            </View>
          ) : (
            <View style={styles.vide}>
              <View style={styles.trait} />
              <BandeauMessage
                message="Aucune signature enregistrée. Sur une quittance sans signature, le document reste parfaitement valable : la signature est un confort, pas une obligation."
                ton="information"
              />
            </View>
          )}
        </Carte>

        <View style={styles.actions}>
          <Bouton
            libelle={enregistree ? 'Choisir une autre image' : 'Choisir une image'}
            onPress={choisirImage}
            variante="secondaire"
            occupe={occupe}
            pleineLargeur
          />
          {aChange && enregistree ? (
            <Bouton
              libelle="Enregistrer la signature"
              onPress={enregistrer}
              occupe={occupe}
              pleineLargeur
            />
          ) : null}
          {enregistree ? (
            <Bouton
              libelle="Retirer la signature"
              onPress={retirer}
              variante="discret"
              desactive={occupe}
              pleineLargeur
            />
          ) : null}
          <Bouton libelle="Terminer" onPress={() => router.back()} variante="discret" pleineLargeur />
        </View>

        <Carte>
          <BandeauMessage
            message="Pour un rendu net, choisissez une image où la signature est seule sur fond blanc, cadrée serrée."
            ton="information"
          />
        </Carte>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.lg, gap: espaces.lg },
  apercu: {
    height: 160,
    backgroundColor: '#FFFFFF',
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  vide: { gap: espaces.md },
  trait: {
    height: 1,
    backgroundColor: couleurs.bordureForte,
    marginVertical: espaces.lg,
  },
  actions: { gap: espaces.sm },
});

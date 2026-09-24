import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';

import { FournisseurApplication, useApplication } from '@/state/ApplicationContext';
import { VerrouBiometrique } from '@/ui/components/VerrouBiometrique';
import { configurerAffichageRappels, programmerRappel } from '@/notifications/rappels';

/**
 * Réarme le rappel de loyers au lancement. N'affiche rien.
 *
 * Le rappel est une notification répétitive confiée au système : elle survit
 * aux redémarrages du téléphone. Mais une réinstallation, ou un effacement des
 * données de l'application, l'efface sans prévenir. Reprogrammer au lancement
 * rend l'état auto-réparateur et ne coûte rien.
 *
 * La reprogrammation n'a lieu que si le rappel est déjà activé : elle ne
 * demande donc jamais l'autorisation à l'improviste, puisque l'utilisateur l'a
 * forcément accordée en activant l'interrupteur.
 */
function RappelsDeLoyers() {
  const { reglages } = useApplication();

  React.useEffect(() => {
    void configurerAffichageRappels();
  }, []);

  React.useEffect(() => {
    if (!reglages.rappelPaiements) return;
    void programmerRappel(reglages.jourRappel);
  }, [reglages.rappelPaiements, reglages.jourRappel]);

  return null;
}

/**
 * Intérieur de l'application.
 *
 * Ce composant existe pour une seule raison : il vit **sous** le fournisseur,
 * donc il peut lire le thème. La racine, elle, ne le peut pas — elle est ce qui
 * installe le fournisseur. Sans cette séparation, le fond des écrans et la barre
 * d'état resteraient figés sur le thème clair.
 */
function Coquille() {
  const { palette, reglages } = useApplication();

  return (
    <>
      {/* Sur fond sombre, une barre d'état à texte sombre devient illisible. */}
      <StatusBar style={reglages.modeTheme === 'sombre' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.fond },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="logement/nouveau"
          options={{ presentation: 'card', animation: 'slide_from_bottom' }}
        />
        {/* Ranger un document se fait depuis un dossier ou depuis l'onglet
            DOCUMENTS : l'écran monte du bas, comme un ajout, et se referme d'un
            geste sans casser le fil de ce qu'on faisait. */}
        <Stack.Screen
          name="document/ajouter"
          options={{ presentation: 'card', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="paiement/[propertyId]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="quittance/succes" options={{ presentation: 'modal' }} />
        {/* Le bail : un formulaire guidé de neuf étapes, puis une vérification,
            puis le document. Les trois montent du bas — c'est une fabrication,
            pas une consultation — et le succès remplace la vérification, pour
            qu'un retour arrière ne ramène pas sur un brouillon qui n'existe
            plus. */}
        <Stack.Screen
          name="bail/choisir"
          options={{ presentation: 'card', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="bail/nouveau"
          options={{ presentation: 'card', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="bail/verification"
          options={{ presentation: 'card', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="bail/succes"
          options={{ presentation: 'card', animation: 'fade' }}
        />
        {/* L'état des lieux suit le même parcours que le bail — choisir,
            remplir, vérifier, établir — avec une différence : le formulaire se
            remplit sur place, souvent debout dans une pièce vide, et
            l'enregistrement automatique y est plus court. Les quatre écrans
            montent du bas, et le succès remplace la vérification pour qu'un
            retour arrière ne ramène pas sur un brouillon qui n'existe plus. */}
        <Stack.Screen
          name="etat-des-lieux/choisir"
          options={{ presentation: 'card', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="etat-des-lieux/nouveau"
          options={{ presentation: 'card', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="etat-des-lieux/verification"
          options={{ presentation: 'card', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="etat-des-lieux/succes"
          options={{ presentation: 'card', animation: 'fade' }}
        />
      </Stack>
    </>
  );
}

/**
 * Racine de l'application.
 *
 * Ordre des enveloppes, de l'extérieur vers l'intérieur :
 *  1. `GestureHandlerRootView` : nécessaire aux gestes dans toute l'application ;
 *  2. `SafeAreaProvider` : encoches et barres système ;
 *  3. `FournisseurApplication` : base de données, réglages, mois affiché, thème ;
 *  4. `VerrouBiometrique` : bloque l'affichage tant que l'identité n'est pas
 *     confirmée, si l'utilisateur a activé cette protection.
 */
export default function RacineLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <FournisseurApplication>
          <RappelsDeLoyers />
          <VerrouBiometrique>
            <Coquille />
          </VerrouBiometrique>
        </FournisseurApplication>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

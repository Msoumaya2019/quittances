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
 * Racine de l'application.
 *
 * Ordre des enveloppes, de l'extérieur vers l'intérieur :
 *  1. `GestureHandlerRootView` : nécessaire aux gestes dans toute l'application ;
 *  2. `SafeAreaProvider` : encoches et barres système ;
 *  3. `FournisseurApplication` : base de données, réglages, mois affiché ;
 *  4. `VerrouBiometrique` : bloque l'affichage tant que l'identité n'est pas
 *     confirmée, si l'utilisateur a activé cette protection.
 */
export default function RacineLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <FournisseurApplication>
          <RappelsDeLoyers />
          <StatusBar style="dark" />
          <VerrouBiometrique>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#F7F9F8' },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="logement/nouveau"
                options={{ presentation: 'card', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="paiement/[propertyId]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="quittance/succes" options={{ presentation: 'modal' }} />
            </Stack>
          </VerrouBiometrique>
        </FournisseurApplication>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

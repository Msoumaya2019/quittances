import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';

import { FournisseurApplication } from '@/state/ApplicationContext';
import { VerrouBiometrique } from '@/ui/components/VerrouBiometrique';

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

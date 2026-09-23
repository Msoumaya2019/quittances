/**
 * Verrouillage biométrique.
 *
 * Le verrou est **facultatif** et s'active depuis les réglages. Il protège
 * l'accès à l'application sur un téléphone partagé, sans jamais constituer une
 * protection des données elles-mêmes : la base n'est pas chiffrée, et l'écran
 * de verrouillage ne prétend pas le contraire.
 *
 * Un repli par code de l'appareil est toujours proposé : sans lui, un capteur
 * défaillant ou un doigt mouillé rendrait l'application inaccessible.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import Svg, { Circle, Path } from 'react-native-svg';

import { couleurs, espaces, rayons, typographie } from '../tokens';
import { Bouton } from './Bouton';
import { useApplication } from '../../state/ApplicationContext';

export function VerrouBiometrique({ children }: { children: React.ReactNode }) {
  const { reglages, pret } = useApplication();
  const [verrouille, setVerrouille] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [verificationEnCours, setVerificationEnCours] = useState(false);

  // Le verrou n'est posé qu'au démarrage, et seulement s'il est activé.
  useEffect(() => {
    if (pret && reglages.verrouBiometrique) {
      setVerrouille(true);
    }
  }, [pret, reglages.verrouBiometrique]);

  const deverrouiller = useCallback(async () => {
    if (verificationEnCours) return;
    setVerificationEnCours(true);
    setMessage(null);

    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrole = await LocalAuthentication.isEnrolledAsync();

      if (!compatible || !enrole) {
        setMessage(
          "Aucune empreinte ni reconnaissance faciale n'est configurée sur ce téléphone. " +
            'Vous pouvez désactiver le verrouillage dans les réglages, ou utiliser le code de l’appareil.',
        );
        setVerificationEnCours(false);
        return;
      }

      const resultat = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Déverrouiller vos quittances',
        cancelLabel: 'Annuler',
        // Le repli par code de l'appareil est volontairement autorisé : sans lui,
        // une reconnaissance faciale capricieuse bloquerait tout accès.
        disableDeviceFallback: false,
      });

      if (resultat.success) {
        setVerrouille(false);
      } else {
        setMessage('La vérification n’a pas abouti. Vous pouvez réessayer.');
      }
    } catch {
      setMessage(
        "La vérification n'a pas pu être effectuée. Réessayez, ou utilisez le code de votre téléphone.",
      );
    } finally {
      setVerificationEnCours(false);
    }
  }, [verificationEnCours]);

  // Une demande automatique au premier affichage évite un geste inutile.
  useEffect(() => {
    if (verrouille) {
      void deverrouiller();
    }
    // On ne veut pas relancer la vérification à chaque changement de la fonction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verrouille]);

  // Le verrou se repose quand l'application repasse en arrière-plan.
  useEffect(() => {
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'background' && reglages.verrouBiometrique) {
        setVerrouille(true);
      }
    });
    return () => abonnement.remove();
  }, [reglages.verrouBiometrique]);

  if (!verrouille) return <>{children}</>;

  return (
    <View style={styles.plein}>
      <View style={styles.centre}>
        <View style={styles.pastilleIcone}>
          <Svg width={40} height={40} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={9} stroke={couleurs.vert} strokeWidth={1.8} fill="none" />
            <Path
              d="M12 7.5 v4 M12 7.5 c-2.4 0 -4 1.4 -4 3.4 M12 7.5 c2.4 0 4 1.4 4 3.4 M8.5 14 c0.6 1.6 2 2.6 3.5 2.6"
              stroke={couleurs.vert}
              strokeWidth={1.8}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </View>

        <Text style={[typographie.titreSection, styles.titre]}>Vos quittances sont protégées</Text>
        <Text style={[typographie.corps, styles.sousTitre]}>
          Confirmez votre identité pour accéder à vos logements et à vos documents.
        </Text>

        {message ? (
          <View style={styles.message}>
            <Text style={[typographie.petit, styles.texteMessage]}>{message}</Text>
          </View>
        ) : null}

        <Bouton
          libelle={verificationEnCours ? 'Vérification…' : 'Déverrouiller'}
          onPress={() => void deverrouiller()}
          occupe={verificationEnCours}
          style={styles.bouton}
        />

        <Pressable
          onPress={() => setVerrouille(false)}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.lien}
        >
          <Text style={[typographie.petit, styles.texteLien]}>
            Continuer sans vérification
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plein: {
    flex: 1,
    backgroundColor: couleurs.fond,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espaces.xxl,
  },
  centre: {
    alignItems: 'center',
    gap: espaces.md,
    maxWidth: 420,
  },
  pastilleIcone: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: couleurs.vertTresClair,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espaces.sm,
  },
  titre: {
    textAlign: 'center',
    color: couleurs.texte,
  },
  sousTitre: {
    textAlign: 'center',
    color: couleurs.texteSecondaire,
    lineHeight: 22,
  },
  message: {
    backgroundColor: couleurs.orangeTresClair,
    borderRadius: rayons.md,
    padding: espaces.md,
    borderWidth: 1,
    borderColor: couleurs.orangeClair,
  },
  texteMessage: {
    color: couleurs.orange,
    textAlign: 'center',
    lineHeight: 19,
  },
  bouton: {
    marginTop: espaces.md,
    minWidth: 240,
    paddingHorizontal: espaces.xxl,
  },
  lien: {
    paddingVertical: espaces.sm,
  },
  texteLien: {
    color: couleurs.texteTertiaire,
    textDecorationLine: 'underline',
  },
});

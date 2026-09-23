/**
 * Barre de progression du recouvrement.
 *
 * Illustration du message « 8 logements sur 10 ont réglé leur loyer ce mois-ci ».
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { animations, espaces, rayons, typographie } from '../tokens';
import { useStyles, type Couleurs } from '../theme';

interface PropsProgression {
  /** Pourcentage de 0 à 100. */
  pourcentage: number;
  /** Nombre ayant réglé, affiché dans le message. */
  regles: number;
  /** Nombre total de logements concernés. */
  total: number;
}

export function BarreProgression({ pourcentage, regles, total }: PropsProgression) {
  const styles = useStyles(creerStyles);
  const borne = Math.max(0, Math.min(100, pourcentage));
  const largeur = useSharedValue(0);

  useEffect(() => {
    largeur.value = withTiming(borne, { duration: animations.lente });
  }, [borne, largeur]);

  const styleRemplissage = useAnimatedStyle(() => ({
    width: `${largeur.value}%`,
  }));

  const message =
    total === 0
      ? 'Aucun logement à suivre ce mois-ci'
      : `${regles} logement${regles > 1 ? 's' : ''} sur ${total} ${regles > 1 ? 'ont réglé leur loyer' : 'a réglé son loyer'} ce mois-ci`;

  return (
    <View style={styles.conteneur}>
      <View style={styles.ligneMessage}>
        <Text style={typographie.petit} numberOfLines={2}>
          {message}
        </Text>
        <Text style={[typographie.petitAppuye, styles.pourcentage]}>{borne} %</Text>
      </View>

      <View
        style={styles.rail}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: borne }}
      >
        <Animated.View style={[styles.remplissage, styleRemplissage]} />
      </View>
    </View>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  conteneur: {
    gap: espaces.sm,
  },
  ligneMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.sm,
  },
  pourcentage: {
    color: couleurs.accentFonce,
  },
  rail: {
    height: 10,
    borderRadius: rayons.rond,
    backgroundColor: couleurs.fondSourdine,
    overflow: 'hidden',
  },
  remplissage: {
    height: '100%',
    borderRadius: rayons.rond,
    backgroundColor: couleurs.accent,
  },
});

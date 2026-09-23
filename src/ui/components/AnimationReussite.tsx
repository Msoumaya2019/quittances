/**
 * Animation de validation.
 *
 * Affichée après un paiement enregistré ou une quittance générée. Un cercle
 * vert se dessine, la coche apparaît, puis l'ensemble disparaît. Court, sobre,
 * et suffisant pour confirmer l'action sans interrompre le parcours.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { animations, espaces, typographie } from '../tokens';
import { useCouleurs, useStyles, type Couleurs } from '../theme';

const CercleAnime = Animated.createAnimatedComponent(Circle);

interface PropsAnimationReussite {
  titre: string;
  sousTitre?: string;
  /** Couleur du cercle : vert pour un succès, orange pour un avertissement. */
  teinte?: string;
  taille?: number;
}

export function AnimationReussite({
  titre,
  sousTitre,
  teinte,
  taille = 96,
}: PropsAnimationReussite) {
  const couleurs = useCouleurs();
  const styles = useStyles(creerStyles);
  // Un appelant qui ne précise pas la teinte obtient l'accent du thème.
  const teinteFinale = teinte ?? couleurs.accent;
  const progression = useSharedValue(0);
  const opaciteCoche = useSharedValue(0);

  useEffect(() => {
    progression.value = withTiming(1, {
      duration: animations.lente * 2,
      easing: Easing.out(Easing.cubic),
    });
    opaciteCoche.value = withDelay(
      animations.lente,
      withTiming(1, { duration: animations.normale }),
    );
  }, [progression, opaciteCoche]);

  const perimetre = 2 * Math.PI * 44;

  const styleCercle = useAnimatedProps(() => ({
    strokeDashoffset: perimetre * (1 - progression.value),
  }));

  const styleCoche = useAnimatedStyle(() => ({
    opacity: opaciteCoche.value,
    transform: [{ scale: 0.6 + opaciteCoche.value * 0.4 }],
  }));

  const styleTexte = useAnimatedStyle(() => ({
    opacity: opaciteCoche.value,
  }));

  return (
    <View style={styles.conteneur}>
      <View style={[styles.cercle, { width: taille, height: taille }]}>
        <Svg width={taille} height={taille} viewBox="0 0 96 96">
          <Circle
            cx={48}
            cy={48}
            r={44}
            stroke={teinteFinale + '22'}
            strokeWidth={6}
            fill={teinteFinale + '12'}
          />
          <CercleAnime
            cx={48}
            cy={48}
            r={44}
            stroke={teinteFinale}
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={perimetre}
            animatedProps={styleCercle}
            transform="rotate(-90 48 48)"
          />
        </Svg>

        <Animated.View style={[StyleSheet.absoluteFill, styles.centre, styleCoche]}>
          <Svg width={taille} height={taille} viewBox="0 0 96 96">
            <Path
              d="M31 49 L43 61 L66 37"
              stroke={teinte}
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
      </View>

      <Animated.View style={[styles.textes, styleTexte]}>
        <Text style={[typographie.titreSection, styles.titre]}>{titre}</Text>
        {sousTitre ? (
          <Text style={[typographie.corps, styles.sousTitre]}>{sousTitre}</Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  conteneur: {
    alignItems: 'center',
    gap: espaces.lg,
  },
  cercle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centre: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textes: {
    alignItems: 'center',
    gap: espaces.xs,
  },
  titre: {
    color: couleurs.texte,
    textAlign: 'center',
  },
  sousTitre: {
    color: couleurs.texteSecondaire,
    textAlign: 'center',
  },
});

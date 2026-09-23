/**
 * Bouton flottant d'action.
 *
 * Placé au-dessus de la barre d'onglets, il reste accessible au pouce. Le
 * décalage vertical est calculé par l'écran appelant, qui connaît les encoches
 * et la hauteur de la barre de navigation.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';

import { espaces, ombreBouton, rayons, typographie } from '../tokens';
import { useStyles, useCouleurs, type Couleurs } from '../theme';

interface PropsBoutonFlottant {
  onPress: () => void;
  libelle: string;
  /** Décalage depuis le bas de l'écran, en points. */
  bas?: number;
  /** Affichage réduit : cercle seul, sans libellé. */
  compact?: boolean;
}

export function BoutonFlottant({
  onPress,
  libelle,
  bas = 24,
  compact = false,
}: PropsBoutonFlottant) {
  const styles = useStyles(creerStyles);
  const couleurs = useCouleurs();
  const appuyer = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {
      // Sans moteur haptique, on continue simplement.
    });
    onPress();
  };

  if (compact) {
    return (
      <Pressable
        onPress={appuyer}
        accessibilityRole="button"
        accessibilityLabel={libelle}
        style={({ pressed }) => [
          styles.cercle,
          { bottom: bas },
          pressed && styles.appuye,
        ]}
      >
        <Plus couleur={couleurs.surAccent} taille={26} />
      </Pressable>
    );
  }

  return (
    <View style={[styles.conteneur, { bottom: bas }]} pointerEvents="box-none">
      <Pressable
        onPress={appuyer}
        accessibilityRole="button"
        accessibilityLabel={libelle}
        style={({ pressed }) => [styles.pilule, pressed && styles.appuye]}
      >
        <Plus couleur={couleurs.surAccent} taille={20} />
        <Text style={[typographie.bouton, styles.texte]} numberOfLines={1}>
          {libelle}
        </Text>
      </Pressable>
    </View>
  );
}

function Plus({ couleur, taille }: { couleur: string; taille: number }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24">
      <Path
        d="M12 5.5 L12 18.5 M5.5 12 L18.5 12"
        stroke={couleur}
        strokeWidth={2.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  conteneur: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pilule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.sm,
    backgroundColor: couleurs.accent,
    paddingHorizontal: espaces.xl,
    paddingVertical: espaces.md + 2,
    borderRadius: rayons.rond,
    minHeight: 54,
    ...ombreBouton(couleurs),
  },
  cercle: {
    position: 'absolute',
    right: espaces.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: couleurs.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...ombreBouton(couleurs),
  },
  texte: {
    color: couleurs.surAccent,
  },
  appuye: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
});

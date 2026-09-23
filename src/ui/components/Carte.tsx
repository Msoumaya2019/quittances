/**
 * Carte : conteneur blanc arrondi, avec ombre douce.
 * C'est la brique visuelle de base de toute l'application.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { couleurs, espaces, ombres, rayons } from '../tokens';

interface PropsCarte {
  children: React.ReactNode;
  /** Rend la carte touchable dans son ensemble. */
  onPress?: () => void;
  onLongPress?: () => void;
  /** Ombre plus marquée, pour la carte mise en avant. */
  appuyee?: boolean;
  /** Bordure colorée à gauche, pour signaler un statut. */
  couleurAccent?: string;
  style?: StyleProp<ViewStyle>;
  accessibilite?: string;
}

export function Carte({
  children,
  onPress,
  onLongPress,
  appuyee = false,
  couleurAccent,
  style,
  accessibilite,
}: PropsCarte) {
  const styleConteneur: StyleProp<ViewStyle> = [
    styles.carte,
    appuyee ? ombres.carteAppuyee : ombres.carte,
    couleurAccent ? { borderLeftWidth: 4, borderLeftColor: couleurAccent } : null,
    style,
  ];

  if (!onPress && !onLongPress) {
    return <View style={styleConteneur}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilite}
      style={({ pressed }) => [styleConteneur, pressed && styles.appuyee]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  carte: {
    backgroundColor: couleurs.fondCarte,
    borderRadius: rayons.xl,
    padding: espaces.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  appuyee: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
});

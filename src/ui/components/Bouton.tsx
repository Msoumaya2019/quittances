/**
 * Bouton.
 *
 * Trois variantes :
 *  - `principal` : l'action attendue, pleine, large, avec ombre ;
 *  - `secondaire` : action alternative, fond clair ;
 *  - `discret` : action de moindre importance, sans fond.
 *
 * Le bouton gère lui-même l'état occupé, pour qu'aucun écran n'ait à le faire.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { couleurs, espaces, ombres, rayons, tailles, typographie } from '../tokens';

export type VarianteBouton = 'principal' | 'secondaire' | 'discret' | 'danger';

interface PropsBouton {
  libelle: string;
  onPress: () => void;
  variante?: VarianteBouton;
  /** Icône affichée avant le libellé, par exemple un composant SVG. */
  icone?: React.ReactNode;
  desactive?: boolean;
  occupe?: boolean;
  /** Occupe toute la largeur disponible. Vrai par défaut. */
  pleineLargeur?: boolean;
  /** Taille compacte, pour les actions secondaires dans une carte. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Retour haptique léger à l'appui. Actif par défaut. */
  retourHaptique?: boolean;
  /** Description lue par les lecteurs d'écran, si le libellé ne suffit pas. */
  accessibilite?: string;
}

export function Bouton({
  libelle,
  onPress,
  variante = 'principal',
  icone,
  desactive = false,
  occupe = false,
  pleineLargeur = true,
  compact = false,
  style,
  retourHaptique = true,
  accessibilite,
}: PropsBouton) {
  const inactif = desactive || occupe;

  const appuyer = () => {
    if (inactif) return;
    if (retourHaptique) {
      void Haptics.impactAsync(
        variante === 'principal'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light,
      ).catch(() => {
        // Un appareil sans moteur haptique ne doit pas faire échouer l'action.
      });
    }
    onPress();
  };

  const styleVariante = STYLES_VARIANTE[variante];

  return (
    <Pressable
      onPress={appuyer}
      disabled={inactif}
      accessibilityRole="button"
      accessibilityLabel={accessibilite ?? libelle}
      accessibilityState={{ disabled: inactif, busy: occupe }}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.compact : styles.normal,
        pleineLargeur && styles.pleineLargeur,
        styleVariante.conteneur,
        pressed && !inactif && styles.appuye,
        inactif && styles.inactif,
        style,
      ]}
    >
      <View style={styles.contenu}>
        {occupe ? (
          <ActivityIndicator size="small" color={styleVariante.texte.color} />
        ) : (
          icone
        )}
        <Text
          style={[
            compact ? typographie.petitAppuye : typographie.bouton,
            styleVariante.texte,
            icone && !occupe ? styles.texteAvecIcone : null,
          ]}
          numberOfLines={1}
        >
          {occupe ? 'Un instant…' : libelle}
        </Text>
      </View>
    </Pressable>
  );
}

const STYLES_VARIANTE: Record<
  VarianteBouton,
  { conteneur: ViewStyle; texte: { color: string } }
> = {
  principal: {
    conteneur: {
      backgroundColor: couleurs.vert,
      ...ombres.bouton,
    },
    texte: { color: couleurs.texteSurFonce },
  },
  secondaire: {
    conteneur: {
      backgroundColor: couleurs.vertTresClair,
      borderWidth: 1,
      borderColor: couleurs.vertClair,
    },
    texte: { color: couleurs.vertFonce },
  },
  discret: {
    conteneur: { backgroundColor: couleurs.fondSourdine },
    texte: { color: couleurs.texteSecondaire },
  },
  danger: {
    conteneur: {
      backgroundColor: couleurs.rougeTresClair,
      borderWidth: 1,
      borderColor: couleurs.rougeClair,
    },
    texte: { color: couleurs.rouge },
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: rayons.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espaces.lg,
  },
  normal: {
    minHeight: tailles.bouton,
    paddingVertical: espaces.md,
  },
  compact: {
    minHeight: tailles.boutonPetit,
    paddingVertical: espaces.sm,
    borderRadius: rayons.md,
  },
  pleineLargeur: {
    alignSelf: 'stretch',
  },
  contenu: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.sm,
  },
  texteAvecIcone: {
    marginLeft: espaces.xs,
  },
  appuye: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  inactif: {
    opacity: 0.5,
  },
});

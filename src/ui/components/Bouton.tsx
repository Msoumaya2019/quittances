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

import { espaces, ombreBouton, rayons, tailles, typographie } from '../tokens';
import { useCouleurs, useStyles, type Couleurs } from '../theme';

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
  const couleurs = useCouleurs();
  const styles = useStyles(creerStyles);
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

  const styleVariante = stylesVarianteDe(couleurs)[variante];

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

/**
 * Habillage de chaque variante, pour le thème courant.
 *
 * Une fonction plutôt qu'une constante : les couleurs changent avec le thème, et
 * une constante figée garderait le vert du premier lancement.
 */
function stylesVarianteDe(
  couleurs: Couleurs,
): Record<VarianteBouton, { conteneur: ViewStyle; texte: { color: string } }> {
  return {
    principal: {
      conteneur: {
        backgroundColor: couleurs.accent,
        ...ombreBouton(couleurs),
      },
      texte: { color: couleurs.surAccent },
    },
    secondaire: {
      conteneur: {
        backgroundColor: couleurs.accentTresClair,
        borderWidth: 1,
        borderColor: couleurs.accentClair,
      },
      texte: { color: couleurs.accentFonce },
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
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
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

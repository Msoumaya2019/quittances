/**
 * En-tête d'écran, avec titre et action facultative.
 * Reste sobre : la couleur de fond de l'écran fait le reste.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { espaces, rayons, typographie } from '../tokens';
import { useStyles, useCouleurs, type Couleurs } from '../theme';

interface PropsEnTete {
  titre: string;
  sousTitre?: string;
  /** Bouton d'action à droite, par exemple « Ajouter ». */
  actionLibelle?: string;
  actionOnPress?: () => void;
  /** Signale au lecteur d'écran que l'action est occupée. */
  actionOccupee?: boolean;
}

export function EnTeteEcran({
  titre,
  sousTitre,
  actionLibelle,
  actionOnPress,
  actionOccupee = false,
}: PropsEnTete) {
  const styles = useStyles(creerStyles);
  return (
    <View style={styles.conteneur}>
      <View style={styles.textes}>
        <Text style={[typographie.titreEcran, styles.titre]} numberOfLines={1}>
          {titre}
        </Text>
        {sousTitre ? (
          <Text style={[typographie.petit, styles.sousTitre]} numberOfLines={1}>
            {sousTitre}
          </Text>
        ) : null}
      </View>

      {actionLibelle && actionOnPress ? (
        <Pressable
          onPress={actionOnPress}
          disabled={actionOccupee}
          accessibilityRole="button"
          accessibilityLabel={actionLibelle}
          accessibilityState={{ busy: actionOccupee, disabled: actionOccupee }}
          style={({ pressed }) => [styles.action, pressed && styles.actionAppuyee]}
        >
          {actionLibelle.startsWith('+') ? <Plus /> : null}
          <Text style={[typographie.petitAppuye, styles.texteAction]}>
            {actionLibelle.replace(/^\+\s*/, '')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Plus() {
  const couleurs = useCouleurs();
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M12 5 L12 19 M5 12 L19 12"
        stroke={couleurs.surAccent}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  conteneur: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.md,
    paddingHorizontal: espaces.lg,
    paddingTop: espaces.sm,
    paddingBottom: espaces.md,
  },
  textes: {
    flex: 1,
    gap: 2,
  },
  titre: {
    color: couleurs.texte,
  },
  sousTitre: {
    color: couleurs.texteSecondaire,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs,
    backgroundColor: couleurs.accent,
    paddingHorizontal: espaces.md,
    paddingVertical: espaces.sm,
    borderRadius: rayons.rond,
  },
  texteAction: {
    color: couleurs.surAccent,
  },
  actionAppuyee: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
});

/**
 * Ligne de détail : un libellé à gauche, une valeur à droite.
 * Brique de présentation des récapitulatifs et des fiches.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { couleurs, espaces, typographie } from '../tokens';

interface PropsLigneDetail {
  libelle: string;
  valeur: string;
  /** Met la valeur en évidence, pour un montant total. */
  accentuee?: boolean;
  /** Couleur de la valeur si elle doit ressortir. */
  teinte?: string;
  /** Traits de conduite entre le libellé et la valeur. */
  pointillee?: boolean;
}

export function LigneDetail({
  libelle,
  valeur,
  accentuee = false,
  teinte,
  pointillee = false,
}: PropsLigneDetail) {
  return (
    <View style={[styles.ligne, pointillee && styles.pointillee]}>
      <Text
        style={[accentuee ? typographie.corpsAppuye : typographie.corps, styles.libelle]}
        numberOfLines={2}
      >
        {libelle}
      </Text>
      <Text
        style={[
          accentuee ? typographie.titreCarte : typographie.corpsAppuye,
          styles.valeur,
          teinte ? { color: teinte } : null,
        ]}
        numberOfLines={2}
      >
        {valeur}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: espaces.md,
    paddingVertical: espaces.xs + 1,
  },
  pointillee: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: couleurs.bordure,
  },
  libelle: {
    flex: 1,
    color: couleurs.texteSecondaire,
  },
  valeur: {
    color: couleurs.texte,
    textAlign: 'right',
    flexShrink: 1,
  },
});

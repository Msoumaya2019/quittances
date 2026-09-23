/**
 * Barre d'action fixe, en bas d'un écran.
 *
 * Elle est posée **sous** la zone qui défile, et non au-dessus. C'est toute la
 * différence avec un bouton flottant : elle reste visible en permanence sans
 * jamais recouvrir une carte. Un bouton flottant oblige à deviner la marge à
 * laisser en bas de liste, et le bailleur finit par lire une ligne à moitié
 * cachée derrière une pastille. Une barre fixe le garantit par construction.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bouton } from './Bouton';
import { espaces, typographie } from '../tokens';
import { useStyles, type Couleurs } from '../theme';

interface PropsBarreActionFixe {
  libelle: string;
  onPress: () => void;
  /** Ligne d'explication au-dessus du bouton, facultative. */
  aide?: string;
  /** Icône affichée avant le libellé. */
  icone?: React.ReactNode;
}

export function BarreActionFixe({ libelle, onPress, aide, icone }: PropsBarreActionFixe) {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.barre, { paddingBottom: Math.max(insets.bottom, espaces.md) }]}>
      {aide ? <Text style={styles.aide}>{aide}</Text> : null}
      <Bouton libelle={libelle} onPress={onPress} icone={icone} />
    </View>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
    barre: {
      paddingHorizontal: espaces.lg,
      paddingTop: espaces.md,
      backgroundColor: couleurs.fondCarte,
      borderTopWidth: 1,
      borderTopColor: couleurs.bordure,
    },
    aide: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      textAlign: 'center',
      marginBottom: espaces.sm,
    },
  });

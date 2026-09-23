/**
 * Pastille de statut.
 *
 * Un statut doit se lire d'un coup d'œil : pastille colorée, emoji et libellé.
 * L'emoji est celui demandé dans la spécification (🟢 🟠 🔴 ⚪) ; il reste
 * lisible même sans le libellé, et le libellé reste lisible sans l'emoji.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { couleursStatutDe, espaces, rayons, typographie } from '../tokens';
import { PRESENTATION_STATUT, type StatutMois } from '../../domain/types';
import { useCouleurs, useStyles, type Couleurs } from '../theme';

interface PropsPastille {
  statut: StatutMois;
  /** Taille compacte, pour les grilles denses. */
  compacte?: boolean;
}

export function PastilleStatut({ statut, compacte = false }: PropsPastille) {
  const styles = useStyles(creerStyles);
  const couleurs = useCouleurs();
  const presentation = PRESENTATION_STATUT[statut];
  const palette = couleursStatutDe(couleurs)[presentation.couleur];

  return (
    <View
      style={[
        styles.pastille,
        compacte && styles.compacte,
        { backgroundColor: palette.fond, borderColor: palette.puce + '33' },
      ]}
      accessibilityLabel={`Statut : ${presentation.libelle}`}
    >
      <View style={[styles.puce, { backgroundColor: palette.puce }]} />
      <Text
        style={[
          compacte ? typographie.minuscule : typographie.petitAppuye,
          { color: palette.texte },
        ]}
        numberOfLines={1}
      >
        {presentation.libelle}
      </Text>
    </View>
  );
}

/** Pastille neutre, pour annoncer un état sans statut de paiement. */
export function PastilleNeutre({ libelle, couleur }: { libelle: string; couleur?: string }) {
  const styles = useStyles(creerStyles);
  const teinte = couleur ?? '#6B7280';
  return (
    <View
      style={[
        styles.pastille,
        { backgroundColor: teinte + '14', borderColor: teinte + '33' },
      ]}
    >
      <View style={[styles.puce, { backgroundColor: teinte }]} />
      <Text style={[typographie.petitAppuye, { color: teinte }]} numberOfLines={1}>
        {libelle}
      </Text>
    </View>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  pastille: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: espaces.md,
    paddingVertical: espaces.xs + 2,
    borderRadius: rayons.rond,
    borderWidth: 1,
    gap: espaces.sm,
  },
  compacte: {
    paddingHorizontal: espaces.sm,
    paddingVertical: 3,
    gap: espaces.xs + 2,
  },
  puce: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

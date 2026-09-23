/**
 * Bandeau de message : information, avertissement, erreur, succès.
 *
 * Les messages d'erreur sont écrits en français courant par les écrans qui les
 * déclenchent : ici, on ne fait que les présenter clairement.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { espaces, rayons, typographie } from '../tokens';
import { useCouleurs, useStyles, type Couleurs } from '../theme';

export type TonBandeau = 'information' | 'avertissement' | 'erreur' | 'succes';

interface PropsBandeau {
  message: string;
  ton?: TonBandeau;
  /** Action facultative proposée dans le bandeau. */
  actionLibelle?: string;
  actionOnPress?: () => void;
  onFermer?: () => void;
}

/**
 * Teintes d'un bandeau, selon son ton.
 *
 * « Succès » reste vert quel que soit le thème : le bandeau annonce un fait
 * — c'est réglé — et non la couleur choisie par le bailleur.
 */
function teintesDe(
  couleurs: Couleurs,
): Record<TonBandeau, { fond: string; bord: string; texte: string; symbole: string }> {
  return {
    information: {
      fond: couleurs.bleuTresClair,
      bord: couleurs.bleuClair,
      texte: couleurs.bleu,
      symbole: 'ℹ️',
    },
    avertissement: {
      fond: couleurs.orangeTresClair,
      bord: couleurs.orangeClair,
      texte: couleurs.orange,
      symbole: '⚠️',
    },
    erreur: {
      fond: couleurs.rougeTresClair,
      bord: couleurs.rougeClair,
      texte: couleurs.rouge,
      symbole: '⛔',
    },
    succes: {
      fond: couleurs.succesTresClair,
      bord: couleurs.succesClair,
      texte: couleurs.succesFonce,
      symbole: '✅',
    },
  };
}

export function BandeauMessage({
  message,
  ton = 'information',
  actionLibelle,
  actionOnPress,
  onFermer,
}: PropsBandeau) {
  const couleurs = useCouleurs();
  const styles = useStyles(creerStyles);
  const palette = teintesDe(couleurs)[ton];

  return (
    <View
      style={[styles.bandeau, { backgroundColor: palette.fond, borderColor: palette.bord }]}
      accessibilityRole="alert"
    >
      <Text style={styles.symbole}>{palette.symbole}</Text>

      <View style={styles.texteConteneur}>
        <Text style={[typographie.petit, { color: palette.texte }]}>{message}</Text>

        {actionLibelle && actionOnPress ? (
          <Pressable onPress={actionOnPress} accessibilityRole="button" hitSlop={6}>
            <Text style={[typographie.petitAppuye, { color: palette.texte }]}>
              {actionLibelle}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {onFermer ? (
        <Pressable onPress={onFermer} accessibilityLabel="Ignorer ce message" hitSlop={10}>
          <Text style={[styles.fermer, { color: palette.texte }]}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  bandeau: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaces.sm,
    padding: espaces.md,
    borderRadius: rayons.md,
    borderWidth: 1,
  },
  symbole: {
    fontSize: 15,
    lineHeight: 20,
  },
  texteConteneur: {
    flex: 1,
    gap: espaces.xs,
  },
  fermer: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
});

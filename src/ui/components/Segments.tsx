/**
 * Segments : choix unique parmi quelques options, présentées côte à côte.
 * Utilisé pour les filtres de l'accueil (Tous / Payés / En attente / Impayés).
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { couleurs, espaces, rayons, ombres, typographie } from '../tokens';

export interface Segment<T extends string> {
  valeur: T;
  libelle: string;
  /** Nombre affiché à droite du libellé, par exemple 3. */
  compteur?: number;
}

interface PropsSegments<T extends string> {
  segments: Segment<T>[];
  valeur: T;
  onChanger: (valeur: T) => void;
  /** Autorise le défilement horizontal si les segments sont nombreux. */
  defilable?: boolean;
}

export function Segments<T extends string>({
  segments,
  valeur,
  onChanger,
  defilable = false,
}: PropsSegments<T>) {
  const contenu = (
    <View style={styles.ligne}>
      {segments.map((segment) => {
        const actif = segment.valeur === valeur;
        return (
          <Pressable
            key={segment.valeur}
            onPress={() => {
              if (actif) return;
              void Haptics.selectionAsync().catch(() => {
                // Sans moteur haptique, on continue simplement.
              });
              onChanger(segment.valeur);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            accessibilityLabel={segment.libelle}
            style={[styles.segment, actif && styles.segmentActif]}
          >
            <Text
              style={[typographie.petitAppuye, styles.libelle, actif && styles.libelleActif]}
              numberOfLines={1}
            >
              {segment.libelle}
            </Text>
            {segment.compteur !== undefined ? (
              <View style={[styles.compteur, actif && styles.compteurActif]}>
                <Text
                  style={[typographie.minuscule, actif && styles.compteurTexteActif]}
                >
                  {segment.compteur}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  if (!defilable) return contenu;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.defilement}
    >
      {contenu}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  defilement: {
    paddingHorizontal: espaces.lg,
  },
  ligne: {
    flexDirection: 'row',
    gap: espaces.sm,
    flexWrap: 'nowrap',
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.xs + 2,
    paddingHorizontal: espaces.md,
    paddingVertical: espaces.sm + 1,
    borderRadius: rayons.rond,
    backgroundColor: couleurs.fondCarte,
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
  },
  segmentActif: {
    backgroundColor: couleurs.vert,
    borderColor: couleurs.vert,
    ...ombres.bouton,
  },
  libelle: {
    color: couleurs.texteSecondaire,
  },
  libelleActif: {
    color: couleurs.texteSurFonce,
  },
  compteur: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: rayons.rond,
    backgroundColor: couleurs.fondSourdine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compteurActif: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  compteurTexteActif: {
    color: couleurs.texteSurFonce,
  },
});

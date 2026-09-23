/**
 * Sélecteur de mois, avec deux flèches.
 *
 * Élément central de l'accueil : il pilote le mois affiché par toutes les
 * cartes et par le tableau de bord. Le retour au mois courant se fait d'un
 * appui sur le libellé, ce qui évite un bouton supplémentaire.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';

import { espaces, rayons, tailles, typographie } from '../tokens';
import { libelleLongCapitalise, type Periode } from '../../domain/period';
import { useStyles, useCouleurs, type Couleurs } from '../theme';

interface PropsSelecteurMois {
  periode: Periode;
  onPrecedent: () => void;
  onSuivant: () => void;
  /** Revenir au mois courant. */
  onAujourdhui?: () => void;
  /** Indique si le mois affiché est le mois courant. */
  estMoisCourant: boolean;
}

export function SelecteurMois({
  periode,
  onPrecedent,
  onSuivant,
  onAujourdhui,
  estMoisCourant,
}: PropsSelecteurMois) {
  const styles = useStyles(creerStyles);
  const appuyer = (action: () => void) => {
    void Haptics.selectionAsync().catch(() => {
      // Sans moteur haptique, on continue simplement.
    });
    action();
  };

  return (
    <View style={styles.conteneur}>
      <Fleche direction="gauche" onPress={() => appuyer(onPrecedent)} libelle="Mois précédent" />

      <Pressable
        onPress={onAujourdhui ? () => appuyer(onAujourdhui) : undefined}
        disabled={!onAujourdhui || estMoisCourant}
        accessibilityRole="button"
        accessibilityLabel={`Mois affiché : ${libelleLongCapitalise(periode)}`}
        accessibilityHint={estMoisCourant ? undefined : 'Revenir au mois courant'}
        style={styles.centre}
      >
        <Text style={[typographie.titreSection, styles.mois]} numberOfLines={1}>
          {libelleLongCapitalise(periode)}
        </Text>
        {!estMoisCourant ? (
          <Text style={[typographie.minuscule, styles.retour]}>revenir à aujourd’hui</Text>
        ) : null}
      </Pressable>

      <Fleche direction="droite" onPress={() => appuyer(onSuivant)} libelle="Mois suivant" />
    </View>
  );
}

function Fleche({
  direction,
  onPress,
  libelle,
}: {
  direction: 'gauche' | 'droite';
  onPress: () => void;
  libelle: string;
}) {
  const styles = useStyles(creerStyles);
  const couleurs = useCouleurs();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={libelle}
      hitSlop={8}
      style={({ pressed }) => [styles.fleche, pressed && styles.flecheAppuyee]}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path
          d={direction === 'gauche' ? 'M14.5 5 L7.5 12 L14.5 19' : 'M9.5 5 L16.5 12 L9.5 19'}
          stroke={couleurs.accentFonce}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  conteneur: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.sm,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: espaces.xs,
  },
  mois: {
    color: couleurs.texte,
  },
  retour: {
    color: couleurs.accent,
  },
  fleche: {
    width: tailles.boutonPetit,
    height: tailles.boutonPetit,
    borderRadius: rayons.rond,
    backgroundColor: couleurs.accentTresClair,
    borderWidth: 1,
    borderColor: couleurs.accentClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flecheAppuyee: {
    backgroundColor: couleurs.accentClair,
    transform: [{ scale: 0.94 }],
  },
});

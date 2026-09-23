/**
 * Indicateur du tableau de bord.
 *
 * Quatre de ces indicateurs résument le mois : attendu, encaissé, reste à
 * percevoir, nombre de logements. L'icône est un petit dessin SVG, pour rester
 * net et cohérent avec le reste de l'interface.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { couleurs, espaces, rayons, typographie } from '../tokens';

export type IconeIndicateur = 'attendu' | 'encaisse' | 'reste' | 'logements';

interface PropsIndicateur {
  libelle: string;
  valeur: string;
  icone: IconeIndicateur;
  /** Couleur d'accent de l'icône et de sa pastille. */
  teinte?: string;
  /** Version compacte, utilisée lorsque l'écran est étroit. */
  compact?: boolean;
}

export function Indicateur({ libelle, valeur, icone, teinte, compact = false }: PropsIndicateur) {
  const couleur = teinte ?? couleurParIcone[icone];

  return (
    <View style={[styles.conteneur, compact && styles.compact]}>
      <View style={[styles.pastilleIcone, { backgroundColor: couleur + '18' }]}>
        <DessinIcone icone={icone} couleur={couleur} taille={compact ? 18 : 22} />
      </View>

      <View style={styles.textes}>
        <Text style={[compact ? typographie.petitAppuye : typographie.titreCarte, styles.valeur]} numberOfLines={1}>
          {valeur}
        </Text>
        <Text style={[typographie.minuscule, styles.libelle]} numberOfLines={2}>
          {libelle.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

function DessinIcone({
  icone,
  couleur,
  taille,
}: {
  icone: IconeIndicateur;
  couleur: string;
  taille: number;
}) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24">
      {icone === 'attendu' && (
        <>
          <Rect x={3} y={5} width={18} height={15} rx={3} stroke={couleur} strokeWidth={2} fill="none" />
          <Path d="M3 10 L21 10" stroke={couleur} strokeWidth={2} />
          <Path d="M7 3 L7 7 M17 3 L17 7" stroke={couleur} strokeWidth={2} strokeLinecap="round" />
        </>
      )}

      {icone === 'encaisse' && (
        <>
          <Circle cx={12} cy={12} r={9} stroke={couleur} strokeWidth={2} fill="none" />
          <Path
            d="M8.5 14.5 C9.5 15.5 14.5 15.5 14.5 13 C14.5 10.5 9.5 11 9.5 8.5 C9.5 6.5 14 6.5 15 7.5"
            stroke={couleur}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
          <Path d="M12 4.5 L12 6.5 M12 17.5 L12 19.5" stroke={couleur} strokeWidth={2} strokeLinecap="round" />
        </>
      )}

      {icone === 'reste' && (
        <>
          <Circle cx={12} cy={12} r={9} stroke={couleur} strokeWidth={2} fill="none" />
          <Path d="M12 7 L12 12.5 L16 14.5" stroke={couleur} strokeWidth={2} strokeLinecap="round" fill="none" />
        </>
      )}

      {icone === 'logements' && (
        <>
          <Path d="M4 11 L12 4.5 L20 11" stroke={couleur} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M6.5 10.5 L6.5 19.5 L17.5 19.5 L17.5 10.5" stroke={couleur} strokeWidth={2} strokeLinejoin="round" fill="none" />
          <Path d="M10.5 19.5 L10.5 14 L13.5 14 L13.5 19.5" stroke={couleur} strokeWidth={2} fill="none" />
        </>
      )}
    </Svg>
  );
}

const couleurParIcone: Record<IconeIndicateur, string> = {
  attendu: couleurs.bleu,
  encaisse: couleurs.vert,
  reste: couleurs.orange,
  logements: couleurs.violet,
};

const styles = StyleSheet.create({
  conteneur: {
    flex: 1,
    gap: espaces.sm,
    minWidth: 0,
  },
  compact: {
    gap: espaces.xs,
  },
  pastilleIcone: {
    width: 40,
    height: 40,
    borderRadius: rayons.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textes: {
    gap: 2,
    minWidth: 0,
  },
  valeur: {
    color: couleurs.texte,
  },
  libelle: {
    color: couleurs.texteTertiaire,
  },
});

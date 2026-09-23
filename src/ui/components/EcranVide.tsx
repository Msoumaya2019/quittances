/**
 * Écran vide.
 *
 * Un écran vide ne doit jamais être un cul-de-sac : il explique ce qui manque,
 * et propose l'action qui débloque la situation. Le dessin est produit en SVG,
 * sans image externe, pour rester net sur tous les écrans.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { espaces, typographie } from '../tokens';
import { Bouton } from './Bouton';
import { useStyles, useCouleurs, type Couleurs } from '../theme';

interface PropsEcranVide {
  titre: string;
  message: string;
  /** Libellé du bouton d'action. */
  actionLibelle?: string;
  actionOnPress?: () => void;
  /** Illustration : maison, document, recherche, graphique. */
  illustration?: 'maison' | 'document' | 'recherche' | 'graphique' | 'coffre';
}

export function EcranVide({
  titre,
  message,
  actionLibelle,
  actionOnPress,
  illustration = 'maison',
}: PropsEcranVide) {
  const styles = useStyles(creerStyles);
  return (
    <View style={styles.conteneur}>
      <Illustration type={illustration} />

      <View style={styles.textes}>
        <Text style={[typographie.titreSection, styles.titre]}>{titre}</Text>
        <Text style={[typographie.corps, styles.message]}>{message}</Text>
      </View>

      {actionLibelle && actionOnPress ? (
        <Bouton
          libelle={actionLibelle}
          onPress={actionOnPress}
          pleineLargeur={false}
          style={styles.bouton}
        />
      ) : null}
    </View>
  );
}

function Illustration({ type }: { type: NonNullable<PropsEcranVide['illustration']> }) {
  const styles = useStyles(creerStyles);
  const couleurs = useCouleurs();
  const trait = couleurs.accent;
  const pale = couleurs.accentClair;

  return (
    <View style={styles.illustration}>
      <Svg width={148} height={148} viewBox="0 0 148 148">
        <Circle cx={74} cy={74} r={70} fill={couleurs.accentTresClair} />

        {type === 'maison' && (
          <>
            <Path
              d="M42 74 L74 46 L106 74"
              stroke={trait}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Path
              d="M52 72 L52 104 L96 104 L96 72"
              stroke={trait}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={pale}
            />
            <Rect x={67} y={84} width={14} height={20} rx={3} fill={trait} />
          </>
        )}

        {type === 'document' && (
          <>
            <Path
              d="M54 40 L86 40 L100 56 L100 108 L54 108 Z"
              fill={pale}
              stroke={trait}
              strokeWidth={5}
              strokeLinejoin="round"
            />
            <Path d="M86 40 L86 56 L100 56" stroke={trait} strokeWidth={5} strokeLinejoin="round" fill="none" />
            <Path d="M64 72 L90 72 M64 84 L90 84 M64 96 L80 96" stroke={trait} strokeWidth={4} strokeLinecap="round" />
          </>
        )}

        {type === 'recherche' && (
          <>
            <Circle cx={70} cy={68} r={24} stroke={trait} strokeWidth={5} fill={pale} />
            <Path d="M88 86 L104 102" stroke={trait} strokeWidth={6} strokeLinecap="round" />
          </>
        )}

        {type === 'graphique' && (
          <>
            <Rect x={44} y={84} width={14} height={26} rx={4} fill={pale} stroke={trait} strokeWidth={4} />
            <Rect x={66} y={68} width={14} height={42} rx={4} fill={pale} stroke={trait} strokeWidth={4} />
            <Rect x={88} y={52} width={14} height={58} rx={4} fill={trait} />
          </>
        )}

        {type === 'coffre' && (
          <>
            <Rect x={46} y={58} width={56} height={48} rx={10} fill={pale} stroke={trait} strokeWidth={5} />
            <Path d="M46 76 L102 76" stroke={trait} strokeWidth={4} />
            <Circle cx={74} cy={88} r={8} fill={trait} />
          </>
        )}
      </Svg>
    </View>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  conteneur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espaces.xxl,
    paddingVertical: espaces.enorme,
    gap: espaces.xl,
  },
  illustration: {
    marginBottom: espaces.sm,
  },
  textes: {
    gap: espaces.sm,
    alignItems: 'center',
  },
  titre: {
    textAlign: 'center',
    color: couleurs.texte,
  },
  message: {
    textAlign: 'center',
    color: couleurs.texteSecondaire,
    lineHeight: 22,
  },
  bouton: {
    marginTop: espaces.sm,
    paddingHorizontal: espaces.xxl,
  },
});

/**
 * Un pavé de signature, tracé au doigt sur l'écran.
 *
 * Ce que ce composant fait, et ce qu'il ne fait pas.
 *
 * Il **fait** : capturer un tracé, le montrer, permettre de le recommencer, et
 * rendre un chemin SVG que le document transformera en image. Le tracé est
 * reproduit tel quel — une signature redessinée serait une autre signature.
 *
 * Il **ne fait pas** : signer. Le tracé obtenu matérialise un accord, comme un
 * exemplaire signé à la main puis numérisé. Il ne constitue pas une signature
 * électronique qualifiée : ni certificat, ni horodatage, ni tiers de confiance.
 * Le document le dit lui-même, en clair, sous les signatures.
 *
 * Deux détails techniques qui ne sont pas cosmétiques :
 *
 *  - le défilement de l'écran est **suspendu** pendant qu'un trait se dessine.
 *    Sans cela, le geste ferait défiler la page au lieu de signer — et un
 *    défilement au milieu d'une signature laisse un trait qui part on ne sait
 *    où ;
 *  - le pavé est **blanc sur fond blanc**, quelle que soit la palette. Le
 *    document est imprimé sur du papier blanc : un tracé dessiné sur fond sombre
 *    donnerait, à l'impression, un trait clair sur fond noir.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { espaces, rayons, typographie } from '../tokens';
import { useStyles, type Couleurs } from '../theme';

/** Un trait continu : une suite de points, en coordonnées du pavé. */
type Trait = { x: number; y: number }[];

interface PropsBlocSignature {
  /** Chemin SVG du tracé, ou `''` quand rien n'est signé. */
  chemin: string;
  /** Appelé à chaque fin de trait, avec le chemin complet. */
  onTrace: (chemin: string) => void;
  /** Vrai pendant qu'un trait se dessine. L'écran suspend son défilement. */
  onDessinEnCours?: (enCours: boolean) => void;
  /** Hauteur du pavé, en points. */
  hauteur?: number;
  /** Message affiché quand rien n'est encore tracé. */
  invite?: string;
  /** Désactive la saisie, par exemple pendant l'enregistrement. */
  desactive?: boolean;
}

/** Transforme des traits en un chemin SVG. */
function cheminDe(traits: Trait[]): string {
  return traits
    .filter((trait) => trait.length > 0)
    .map((trait) =>
      trait.length === 1
        ? // Un point isolé ne se voit pas : on en fait un trait d'un demi-point,
          // sans quoi un appui bref laisserait une signature apparemment vide.
          `M${trait[0].x} ${trait[0].y}l0.1 0`
        : `M${trait.map((p) => `${p.x} ${p.y}`).join(' L')}`,
    )
    .join(' ');
}

export function BlocSignature({
  chemin,
  onTrace,
  onDessinEnCours,
  hauteur = 160,
  invite = 'Signez ici avec le doigt',
  desactive = false,
}: PropsBlocSignature) {
  const styles = useStyles(creerStyles);
  const [traits, setTraits] = useState<Trait[]>([]);
  const [largeur, setLargeur] = useState(0);
  const enCours = useRef<Trait | null>(null);
  const traitsRef = useRef<Trait[]>([]);

  // Les rappels du `PanResponder` sont créés une fois : ils liraient sinon des
  // valeurs figées au premier rendu, et le tracé se figerait avec elles.
  const majTraits = useCallback(
    (suivants: Trait[]) => {
      traitsRef.current = suivants;
      setTraits(suivants);
      onTrace(cheminDe(suivants));
    },
    [onTrace],
  );

  const repondre = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !desactive,
        onMoveShouldSetPanResponder: () => !desactive,
        // Le pavé prend la main dès le premier appui : sans cela, un parent
        // défilant capterait le geste, et l'on signerait en faisant défiler.
        onStartShouldSetPanResponderCapture: () => !desactive,
        onPanResponderGrant: (evenement) => {
          const { locationX, locationY } = evenement.nativeEvent;
          enCours.current = [{ x: Math.round(locationX), y: Math.round(locationY) }];
          onDessinEnCours?.(true);
          majTraits([...traitsRef.current, enCours.current]);
        },
        onPanResponderMove: (evenement) => {
          if (!enCours.current) return;
          const { locationX, locationY } = evenement.nativeEvent;
          enCours.current.push({ x: Math.round(locationX), y: Math.round(locationY) });
          majTraits([...traitsRef.current.slice(0, -1), [...enCours.current]]);
        },
        onPanResponderRelease: () => {
          enCours.current = null;
          onDessinEnCours?.(false);
        },
        onPanResponderTerminate: () => {
          enCours.current = null;
          onDessinEnCours?.(false);
        },
      }),
    [desactive, majTraits, onDessinEnCours],
  );

  function effacer() {
    traitsRef.current = [];
    setTraits([]);
    onTrace('');
  }

  const vide = traits.length === 0 && !chemin;
  /**
   * Le tracé venu de l'extérieur, quand rien n'a encore été dessiné sur cet
   * écran.
   *
   * C'est le cas d'une signature **déjà recueillie** : on revient sur l'étape,
   * ou la reprise d'un brouillon rend le tracé enregistré. Le pavé doit alors
   * le montrer, sans quoi l'écran affiche un cadre vide sous un nom, et l'on ne
   * peut pas vérifier avant d'imprimer *quelle* signature a été retenue.
   *
   * Un tracé venu de l'extérieur n'est **pas** lu comme des points : il a été
   * converti en image au moment de la signature, à une taille fixe, et ne
   * dépend donc pas de la largeur du pavé qui l'a recueilli. Le redessiner
   * depuis ses points supposerait de les relire, ce qu'un chemin ne permet pas.
   * On affiche donc l'image telle quelle — la même que le document insérera.
   */
  const traceExterne = !vide && traits.length === 0 && chemin ? chemin : null;

  return (
    <View style={styles.conteneur}>
      <View
        style={[styles.pave, { height: hauteur }, desactive && styles.desactive]}
        onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={vide ? invite : 'Signature tracée'}
        accessibilityHint="Dessinez votre signature avec le doigt."
        {...repondre.panHandlers}
      >
        {traceExterne ? (
          <Image
            source={{ uri: traceExterne }}
            style={styles.trace}
            resizeMode="contain"
            accessibilityLabel="Signature déjà recueillie"
          />
        ) : null}

        {largeur > 0 && !traceExterne ? (
          <Svg width={largeur} height={hauteur}>
            {traits.map((trait, rang) => (
              <Path
                key={rang}
                d={cheminDe([trait])}
                fill="none"
                stroke="#111111"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        ) : null}

        {vide ? <Text style={styles.invite}>{invite}</Text> : null}
      </View>

      <View style={styles.barre}>
        <Text style={styles.aide}>
          {vide
            ? 'Le tracé restera modifiable jusqu’à la génération du document.'
            : 'Vous pouvez recommencer autant de fois que nécessaire.'}
        </Text>
        {!vide && !desactive ? (
          <Text
            style={styles.recommencer}
            onPress={effacer}
            accessibilityRole="button"
            accessibilityLabel="Recommencer la signature"
          >
            Recommencer
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
    conteneur: {
      gap: espaces.sm,
    },
    pave: {
      // Blanc, et non la couleur de fond de l'application : le document est
      // imprimé sur papier blanc, et un tracé noir sur fond sombre donnerait à
      // l'impression un trait clair sur fond noir.
      backgroundColor: '#FFFFFF',
      borderRadius: rayons.md,
      borderWidth: 1,
      borderColor: couleurs.bordure,
      borderStyle: 'dashed',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    desactive: {
      opacity: 0.5,
    },
    trace: {
      // Le tracé extérieur occupe la largeur utile, sa hauteur suit son
      // rapport — `resizeMode="contain"` ne deforme jamais la signature.
      width: '100%',
      height: '100%',
    },
    invite: {
      ...typographie.petit,
      color: '#9A9A9A',
      position: 'absolute',
    },
    barre: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaces.md,
    },
    aide: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      flex: 1,
    },
    recommencer: {
      ...typographie.petitAppuye,
      color: couleurs.accentFonce,
      paddingVertical: espaces.xs,
      paddingHorizontal: espaces.sm,
    },
  });

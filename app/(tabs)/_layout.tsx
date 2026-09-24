import React from 'react';
import { Tabs } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ColorValue } from 'react-native';

import { typographie } from '@/ui/tokens';
import { useCouleurs } from '@/ui/theme';

/**
 * Barre d'onglets inférieure, avec quatre entrées :
 * Accueil, Documents, Logements, Réglages.
 *
 * Les quittances n'ont plus d'onglet à elles : elles sont devenues une
 * **catégorie** de DOCUMENTS, à côté des baux, des états des lieux, des
 * inventaires et des autres documents. C'est ce qui permet de ranger un bail et
 * de le retrouver au même endroit que la quittance du mois, sans multiplier les
 * onglets — une barre du bas à six entrées ne se lit plus d'un coup d'œil.
 *
 * L'ordre des `Tabs.Screen` est l'ordre affiché : on le lit de haut en bas.
 *
 * Les noms de fichiers, eux, n'ont pas suivi le renommage — `logements.tsx` et
 * `plus.tsx` — parce qu'un fichier `logement.tsx` entrerait en collision avec le
 * dossier `app/logement/`, qui porte les écrans de détail. Seuls les libellés
 * sont visibles du bailleur.
 *
 * Les icônes sont dessinées en SVG : elles restent nettes à toutes les tailles
 * et suivent la couleur de l'onglet actif, y compris en mode contraste élevé.
 */
export default function OngletsLayout() {
  const couleurs = useCouleurs();
  // Sans cette marge, la barre passe sous la barre d'accueil de l'iPhone et les
  // libellés deviennent difficiles à toucher. Sur Android, `insets.bottom` vaut
  // souvent 0 : on garde alors les 8 points d'origine.
  const insets = useSafeAreaInsets();
  const margeBasse = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: couleurs.accent,
        tabBarInactiveTintColor: couleurs.texteTertiaire,
        tabBarStyle: {
          backgroundColor: couleurs.fondCarte,
          borderTopColor: couleurs.bordure,
          borderTopWidth: 1,
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: margeBasse,
        },
        tabBarLabelStyle: {
          ...typographie.minuscule,
          letterSpacing: 0.2,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
        sceneStyle: { backgroundColor: couleurs.fond },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, focused }) => <IconeAccueil couleur={color} actif={focused} />,
          tabBarAccessibilityLabel: 'Accueil, la situation du mois',
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: 'Documents',
          tabBarIcon: ({ color, focused }) => <IconeDocuments couleur={color} actif={focused} />,
          tabBarAccessibilityLabel:
            'Documents, quittances, baux, états des lieux, inventaires et autres documents',
        }}
      />
      <Tabs.Screen
        name="logements"
        options={{
          title: 'Logements',
          tabBarIcon: ({ color, focused }) => <IconeLogements couleur={color} actif={focused} />,
          tabBarAccessibilityLabel: 'Logements, ajouter ou modifier un logement et ses locataires',
        }}
      />
      <Tabs.Screen
        name="plus"
        options={{
          title: 'Réglages',
          tabBarIcon: ({ color, focused }) => <IconePlus couleur={color} actif={focused} />,
          tabBarAccessibilityLabel: 'Réglages, thème et préférences',
        }}
      />
    </Tabs>
  );
}

interface PropsIcone {
  couleur: ColorValue;
  actif: boolean;
}

/**
 * Applique une transparence à une couleur d'onglet.
 *
 * React Native fournit la couleur active sous forme de `ColorValue`, qui n'est
 * pas toujours une chaîne : elle peut être une couleur « opaque » du système.
 * On ne fabrique donc une teinte claire que lorsque c'est possible, sinon on
 * laisse le remplissage transparent.
 */
function avecAlpha(couleur: ColorValue, alpha: number): string | undefined {
  if (typeof couleur !== 'string') return undefined;

  // Couleur hexadécimale à six chiffres : on ajoute le canal alpha.
  if (/^#[0-9a-fA-F]{6}$/.test(couleur)) {
    const canal = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
      .toString(16)
      .padStart(2, '0');
    return `${couleur}${canal}`;
  }

  return undefined;
}

function IconeAccueil({ couleur, actif }: PropsIcone) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d="M4 11 L12 4.5 L20 11"
        stroke={couleur}
        strokeWidth={actif ? 2.3 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M6.5 10.5 L6.5 19.5 L17.5 19.5 L17.5 10.5"
        stroke={couleur}
        strokeWidth={actif ? 2.3 : 2}
        strokeLinejoin="round"
        fill={actif ? avecAlpha(couleur, 0.09) : 'none'}
      />
      <Path
        d="M10.3 19.5 L10.3 14 L13.7 14 L13.7 19.5"
        stroke={couleur}
        strokeWidth={actif ? 2.3 : 2}
        fill="none"
      />
    </Svg>
  );
}

function IconeLogements({ couleur, actif }: PropsIcone) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d="M3.5 10 L3.5 20 L11 20 L11 10 L7.25 6.8 Z"
        stroke={couleur}
        strokeWidth={actif ? 2.2 : 1.9}
        strokeLinejoin="round"
        fill={actif ? avecAlpha(couleur, 0.09) : 'none'}
      />
      <Path
        d="M13 9 L13 20 L20.5 20 L20.5 9 L16.75 5.8 Z"
        stroke={couleur}
        strokeWidth={actif ? 2.2 : 1.9}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M6 13 L8.5 13 M6 16.5 L8.5 16.5 M15.5 12.5 L18 12.5 M15.5 16 L18 16" stroke={couleur} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * DOCUMENTS : une chemise, et ce qu'elle contient.
 *
 * Une simple feuille aurait dit « un document » ; l'onglet en réunit cinq
 * familles. La chemise dit le rangement, et les deux lignes intérieures
 * rappellent qu'il y a plusieurs pièces dedans.
 */
function IconeDocuments({ couleur, actif }: PropsIcone) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d="M4 6.6 L9.6 6.6 L11.6 9.2 L20 9.2 L20 19.4 L4 19.4 Z"
        stroke={couleur}
        strokeWidth={actif ? 2.2 : 1.9}
        strokeLinejoin="round"
        fill={actif ? avecAlpha(couleur, 0.09) : 'none'}
      />
      <Path
        d="M8 13 L16 13 M8 16.4 L13 16.4"
        stroke={couleur}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function IconePlus({ couleur, actif }: PropsIcone) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d="M12 4 a8 8 0 1 0 0 16 a8 8 0 0 0 0 -16"
        stroke={couleur}
        strokeWidth={actif ? 2.2 : 1.9}
        fill={actif ? avecAlpha(couleur, 0.09) : 'none'}
      />
      <Path d="M12 8.5 L12 15.5 M8.5 12 L15.5 12" stroke={couleur} strokeWidth={2.1} strokeLinecap="round" />
    </Svg>
  );
}

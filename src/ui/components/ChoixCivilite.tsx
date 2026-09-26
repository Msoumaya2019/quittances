/**
 * ChoixCivilite : « M. », « Mme » ou « Mlle ».
 *
 * Un seul contrôle, partagé par les deux écrans qui saisissent un locataire —
 * la création d'un logement et la modification de ses locataires. Recopié, il
 * aurait fini par diverger, et l'un des deux aurait proposé une civilité que
 * l'autre ignorait.
 *
 * **Rien n'est présélectionné.** La valeur vide est un état légitime : le
 * document n'imprime alors aucune civilité. Choisir « M. » à la place du
 * bailleur serait inventer un fait, et c'est précisément ce que le domaine
 * refuse depuis le début.
 *
 * Les trois valeurs viennent de `CIVILITES` (`domain/types.ts`), comme la
 * reconnaissance de ce qui est stocké : une civilité proposée ici ne peut donc
 * pas être une valeur que le document refuserait d'imprimer.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CIVILITES, type Civilite } from '../../domain/types';
import { espaces, typographie } from '../tokens';
import { useStyles, type Couleurs } from '../theme';
import { Segments } from './Segments';

interface PropsChoixCivilite {
  valeur: Civilite | '';
  onChanger: (valeur: Civilite | '') => void;
  /** Masque l'aide quand l'écran porte déjà l'explication. */
  sansAide?: boolean;
}

export function ChoixCivilite({ valeur, onChanger, sansAide = false }: PropsChoixCivilite) {
  const styles = useStyles(creerStyles);

  return (
    <View style={styles.bloc}>
      <Text style={styles.libelle}>Civilité</Text>
      <Segments<Civilite | ''>
        segments={CIVILITES.map((c) => ({ valeur: c, libelle: c }))}
        valeur={valeur}
        onChanger={onChanger}
      />
      {sansAide ? null : (
        <Text style={styles.aide}>Facultatif. Placée devant le nom sur les documents.</Text>
      )}
    </View>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
    bloc: {
      gap: espaces.sm,
      marginBottom: espaces.md,
    },
    libelle: {
      ...typographie.petitAppuye,
      color: couleurs.texte,
    },
    aide: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
    },
  });

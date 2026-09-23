/**
 * Champ de saisie, avec libellé, aide et message d'erreur.
 *
 * Le clavier est configuré selon le contenu attendu : numérique pour un montant,
 * téléphone pour un numéro, etc. Cela évite à l'utilisateur de chercher le bon
 * clavier, et réduit les erreurs de saisie.
 */

import React, { forwardRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';

import { espaces, rayons, tailles, typographie } from '../tokens';
import { useStyles, useCouleurs, type Couleurs } from '../theme';

interface PropsChamp {
  libelle: string;
  valeur: string;
  onChangement: (valeur: string) => void;
  placeholder?: string;
  /** Explication courte sous le champ. */
  aide?: string;
  erreur?: string | null;
  obligatoire?: boolean;
  clavier?: KeyboardTypeOptions;
  autoCapitalisation?: TextInputProps['autoCapitalize'];
  /** Transforme la saisie en majuscules (nom, code postal). */
  majuscules?: boolean;
  multiligne?: boolean;
  nombreDeLignes?: number;
  retourAuto?: boolean;
  onSubmit?: () => void;
  editable?: boolean;
  maxLength?: number;
}

export const Champ = forwardRef<TextInput, PropsChamp>(function Champ(
  {
    libelle,
    valeur,
    onChangement,
    placeholder,
    aide,
    erreur,
    obligatoire = false,
    clavier = 'default',
    autoCapitalisation = 'sentences',
    majuscules = false,
    multiligne = false,
    nombreDeLignes = 3,
    retourAuto = false,
    onSubmit,
    editable = true,
    maxLength,
  },
  ref,
) {
  const couleurs = useCouleurs();
  const styles = useStyles(creerStyles);
  const [focus, setFocus] = useState(false);

  return (
    <View style={styles.conteneur}>
      <View style={styles.ligneLibelle}>
        <Text style={typographie.petitAppuye}>{libelle}</Text>
        {obligatoire ? <Text style={styles.obligatoire}>obligatoire</Text> : null}
      </View>

      <TextInput
        ref={ref}
        value={valeur}
        onChangeText={(texte) => onChangement(majuscules ? texte.toUpperCase() : texte)}
        placeholder={placeholder}
        placeholderTextColor={couleurs.texteTertiaire}
        keyboardType={clavier}
        autoCapitalize={autoCapitalisation}
        autoCorrect={false}
        multiline={multiligne}
        numberOfLines={multiligne ? nombreDeLignes : 1}
        returnKeyType={retourAuto ? 'done' : 'next'}
        onSubmitEditing={onSubmit}
        editable={editable}
        maxLength={maxLength}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        accessibilityLabel={libelle}
        style={[
          styles.champ,
          multiligne && styles.champMultiligne,
          focus && styles.champFocus,
          !!erreur && styles.champErreur,
          !editable && styles.champInactif,
        ]}
      />

      {erreur ? (
        <Text style={styles.erreur}>{erreur}</Text>
      ) : aide ? (
        <Text style={typographie.petit}>{aide}</Text>
      ) : null}
    </View>
  );
});

/**
 * Champ de montant.
 *
 * Le montant saisi est conservé tel quel (chaîne), puis converti en centimes par
 * le moteur métier. On n'utilise donc jamais de flottant.
 */
interface PropsChampMontant {
  libelle: string;
  /** Montant en centimes, ou `null` si vide. */
  valeurCentimes: number | null;
  onChangement: (centimes: number | null) => void;
  aide?: string;
  erreur?: string | null;
  obligatoire?: boolean;
}

export function ChampMontant({
  libelle,
  valeurCentimes,
  onChangement,
  aide,
  erreur,
  obligatoire = false,
}: PropsChampMontant) {
  const styles = useStyles(creerStyles);
  const couleurs = useCouleurs();
  // On garde une représentation textuelle locale pour ne pas reformater la
  // saisie pendant que l'utilisateur tape.
  const [texte, setTexte] = useState(
    valeurCentimes === null ? '' : (valeurCentimes / 100).toFixed(2).replace('.', ','),
  );

  const gerer = (brut: string) => {
    setTexte(brut);

    const nettoye = brut.replace(/\s/g, '').replace(',', '.');
    if (nettoye === '') {
      onChangement(null);
      return;
    }
    if (!/^\d+(\.\d{0,2})?$/.test(nettoye)) return;

    const [entier, decimales = ''] = nettoye.split('.');
    onChangement(Number(entier) * 100 + Number(decimales.padEnd(2, '0')));
  };

  return (
    <View style={styles.conteneur}>
      <View style={styles.ligneLibelle}>
        <Text style={typographie.petitAppuye}>{libelle}</Text>
        {obligatoire ? <Text style={styles.obligatoire}>obligatoire</Text> : null}
      </View>

      <View style={[styles.champMontant, !!erreur && styles.champErreur]}>
        <TextInput
          value={texte}
          onChangeText={gerer}
          placeholder="0,00"
          placeholderTextColor={couleurs.texteTertiaire}
          keyboardType="decimal-pad"
          accessibilityLabel={libelle}
          style={styles.champMontantTexte}
        />
        <Text style={styles.symbole}>€</Text>
      </View>

      {erreur ? (
        <Text style={styles.erreur}>{erreur}</Text>
      ) : aide ? (
        <Text style={typographie.petit}>{aide}</Text>
      ) : null}
    </View>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  conteneur: {
    gap: espaces.sm,
  },
  ligneLibelle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  obligatoire: {
    ...typographie.minuscule,
    color: couleurs.texteTertiaire,
  },
  champ: {
    minHeight: tailles.champ,
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
    borderRadius: rayons.md,
    paddingHorizontal: espaces.md,
    paddingVertical: espaces.md,
    backgroundColor: couleurs.fondCarte,
    color: couleurs.texte,
    ...typographie.corps,
  },
  champMultiligne: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  champFocus: {
    borderColor: couleurs.accent,
    backgroundColor: couleurs.accentTresClair,
  },
  champErreur: {
    borderColor: couleurs.rouge,
    backgroundColor: couleurs.rougeTresClair,
  },
  champInactif: {
    backgroundColor: couleurs.fondSourdine,
  },
  champMontant: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
    borderRadius: rayons.md,
    paddingHorizontal: espaces.md,
    minHeight: tailles.champ,
    backgroundColor: couleurs.fondCarte,
  },
  champMontantTexte: {
    flex: 1,
    paddingVertical: espaces.md,
    color: couleurs.texte,
    ...typographie.corpsAppuye,
  },
  symbole: {
    ...typographie.corpsAppuye,
    color: couleurs.texteTertiaire,
    marginLeft: espaces.sm,
  },
  erreur: {
    ...typographie.petit,
    color: couleurs.rouge,
  },
});

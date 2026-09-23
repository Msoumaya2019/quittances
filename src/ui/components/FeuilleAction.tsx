/**
 * Feuille d'action, présentée depuis le bas de l'écran.
 *
 * Utilisée pour les choix rapides : enregistrer un paiement, choisir un modèle,
 * sélectionner une année. On préfère ce procédé aux boîtes de dialogue pour
 * tout ce qui demande plus de deux options.
 */

import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { espaces, ombres, rayons, typographie } from '../tokens';
import { Bouton } from './Bouton';
import { useStyles, type Couleurs } from '../theme';

export interface OptionFeuille<T extends string> {
  valeur: T;
  libelle: string;
  /** Explication courte affichée à droite. */
  detail?: string;
  /** Désactive l'option en expliquant pourquoi dans `detail`. */
  desactivee?: boolean;
}

interface PropsFeuille<T extends string> {
  visible: boolean;
  titre: string;
  message?: string;
  options: OptionFeuille<T>[];
  valeurSelectionnee?: T | null;
  onChoisir: (valeur: T) => void;
  onFermer: () => void;
  /** Texte du bouton d'annulation. */
  libelleAnnuler?: string;
}

export function FeuilleAction<T extends string>({
  visible,
  titre,
  message,
  options,
  valeurSelectionnee,
  onChoisir,
  onFermer,
  libelleAnnuler = 'Annuler',
}: PropsFeuille<T>) {
  const styles = useStyles(creerStyles);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onFermer}
      statusBarTranslucent
    >
      <Pressable style={styles.fond} onPress={onFermer} accessibilityLabel="Fermer">
        {/* Un appui sur le panneau ne doit pas fermer la feuille. */}
        <Pressable style={styles.panneau} onPress={() => undefined}>
          <View style={styles.poignee} />

          <View style={styles.entete}>
            <Text style={[typographie.titreSection, styles.titre]}>{titre}</Text>
            {message ? (
              <Text style={[typographie.petit, styles.message]}>{message}</Text>
            ) : null}
          </View>

          <ScrollView
            style={styles.liste}
            contentContainerStyle={styles.listeContenu}
            showsVerticalScrollIndicator={false}
          >
            {options.map((option) => {
              const selectionnee = option.valeur === valeurSelectionnee;
              return (
                <Pressable
                  key={option.valeur}
                  onPress={() => {
                    if (option.desactivee) return;
                    onChoisir(option.valeur);
                    onFermer();
                  }}
                  disabled={option.desactivee}
                  accessibilityRole="button"
                  accessibilityLabel={option.libelle}
                  accessibilityState={{ selected: selectionnee, disabled: option.desactivee }}
                  style={({ pressed }) => [
                    styles.option,
                    selectionnee && styles.optionSelectionnee,
                    option.desactivee && styles.optionDesactivee,
                    pressed && !option.desactivee && styles.optionAppuyee,
                  ]}
                >
                  <View style={styles.optionTextes}>
                    <Text
                      style={[
                        typographie.corpsAppuye,
                        styles.optionLibelle,
                        selectionnee && styles.optionLibelleSelectionnee,
                      ]}
                    >
                      {option.libelle}
                    </Text>
                    {option.detail ? (
                      <Text style={[typographie.petit, styles.optionDetail]}>
                        {option.detail}
                      </Text>
                    ) : null}
                  </View>

                  {selectionnee ? (
                    <View style={styles.coche}>
                      <Coche />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <Bouton libelle={libelleAnnuler} onPress={onFermer} variante="discret" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Coche() {
  const styles = useStyles(creerStyles);
  return (
    <Text style={styles.cocheTexte}>✓</Text>
  );
}

/** Feuille de confirmation, pour une action irréversible ou importante. */
interface PropsConfirmation {
  visible: boolean;
  titre: string;
  message: string;
  libelleConfirmer: string;
  libelleAnnuler?: string;
  onConfirmer: () => void;
  onAnnuler: () => void;
  /** Style du bouton de confirmation. */
  danger?: boolean;
  /** Occupe le bouton pendant le traitement. */
  occupe?: boolean;
}

export function DialogueConfirmation({
  visible,
  titre,
  message,
  libelleConfirmer,
  libelleAnnuler = 'Annuler',
  onConfirmer,
  onAnnuler,
  danger = false,
  occupe = false,
}: PropsConfirmation) {
  const styles = useStyles(creerStyles);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onAnnuler}
      statusBarTranslucent
    >
      <View style={styles.fondCentre}>
        <View style={[styles.boite, ombres.carteAppuyee]}>
          <Text style={[typographie.titreSection, styles.titreBoite]}>{titre}</Text>
          <Text style={[typographie.corps, styles.messageBoite]}>{message}</Text>

          <View style={styles.actionsBoite}>
            <Bouton
              libelle={libelleConfirmer}
              onPress={onConfirmer}
              variante={danger ? 'danger' : 'principal'}
              occupe={occupe}
              style={styles.boutonBoite as StyleProp<ViewStyle>}
            />
            <Bouton
              libelle={libelleAnnuler}
              onPress={onAnnuler}
              variante="discret"
              desactive={occupe}
              style={styles.boutonBoite as StyleProp<ViewStyle>}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  fond: {
    flex: 1,
    backgroundColor: couleurs.transparence,
    justifyContent: 'flex-end',
  },
  panneau: {
    backgroundColor: couleurs.fondCarte,
    borderTopLeftRadius: rayons.xxl,
    borderTopRightRadius: rayons.xxl,
    paddingHorizontal: espaces.lg,
    paddingTop: espaces.md,
    paddingBottom: espaces.xxl,
    maxHeight: '85%',
    gap: espaces.lg,
    ...ombres.carteAppuyee,
  },
  poignee: {
    width: 44,
    height: 5,
    borderRadius: rayons.rond,
    backgroundColor: couleurs.bordureForte,
    alignSelf: 'center',
  },
  entete: {
    gap: espaces.xs,
  },
  titre: {
    color: couleurs.texte,
  },
  message: {
    color: couleurs.texteSecondaire,
    lineHeight: 20,
  },
  liste: {
    flexGrow: 0,
  },
  listeContenu: {
    gap: espaces.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.md,
    paddingVertical: espaces.md,
    paddingHorizontal: espaces.lg,
    borderRadius: rayons.lg,
    backgroundColor: couleurs.fond,
    borderWidth: 1.5,
    borderColor: couleurs.bordure,
  },
  optionSelectionnee: {
    backgroundColor: couleurs.accentTresClair,
    borderColor: couleurs.accent,
  },
  optionDesactivee: {
    opacity: 0.45,
  },
  optionAppuyee: {
    backgroundColor: couleurs.fondSurvol,
  },
  optionTextes: {
    flex: 1,
    gap: 2,
  },
  optionLibelle: {
    color: couleurs.texte,
  },
  optionLibelleSelectionnee: {
    color: couleurs.accentFonce,
  },
  optionDetail: {
    color: couleurs.texteSecondaire,
  },
  coche: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: couleurs.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cocheTexte: {
    color: couleurs.surAccent,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
  },
  fondCentre: {
    flex: 1,
    backgroundColor: couleurs.transparence,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espaces.xl,
  },
  boite: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: couleurs.fondCarte,
    borderRadius: rayons.xl,
    padding: espaces.xl,
    gap: espaces.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  titreBoite: {
    color: couleurs.texte,
  },
  messageBoite: {
    color: couleurs.texteSecondaire,
    lineHeight: 21,
  },
  actionsBoite: {
    marginTop: espaces.md,
    gap: espaces.sm,
  },
  boutonBoite: {
    width: '100%',
  },
});

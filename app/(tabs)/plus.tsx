/**
 * Onglet PLUS.
 *
 * Tout ce qui ne se fait pas tous les jours : propriétaires, modèles de
 * document, signature, sauvegarde, verrouillage. L'écran est une liste de
 * sections claires plutôt qu'un empilement de sous-menus.
 */

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import {
  BandeauMessage,
  Bouton,
  Carte,
  DialogueConfirmation,
  EnTeteEcran,
  LigneDetail,
} from '@/ui/components';
import { couleurs, espaces, rayons, typographie } from '@/ui/tokens';
import { LIBELLE_MODELE, type ModeleDocument } from '@/domain/types';
import { useApplication } from '@/state/ApplicationContext';
import { listerProprietaires } from '@/db/repositories/owners';
import { listerLogements } from '@/db/repositories/properties';
import { tousLesDocuments } from '@/db/repositories/documents';
import { tousLesPaiements } from '@/db/repositories/payments';

export default function EcranPlus() {
  const { reglages, majReglages, rafraichir } = useApplication();
  const insets = useSafeAreaInsets();

  const [nombreProprietaires, setNombreProprietaires] = useState(0);
  const [nombreLogements, setNombreLogements] = useState(0);
  const [nombreDocuments, setNombreDocuments] = useState(0);
  const [nombrePaiements, setNombrePaiements] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmeReinit, setConfirmeReinit] = useState(false);

  const chargerChiffres = useCallback(async () => {
    try {
      const [proprietaires, logements, documents, paiements] = await Promise.all([
        listerProprietaires(),
        listerLogements(),
        tousLesDocuments(),
        tousLesPaiements(),
      ]);
      setNombreProprietaires(proprietaires.length);
      setNombreLogements(logements.length);
      setNombreDocuments(documents.length);
      setNombrePaiements(paiements.length);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de lire les données pour le moment.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      chargerChiffres();
    }, [chargerChiffres]),
  );

  async function choisirModele(modele: ModeleDocument) {
    try {
      await majReglages({ modeleParDefaut: modele });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le modèle n'a pas pu être enregistré.");
    }
  }

  async function basculerVerrou(valeur: boolean) {
    try {
      await majReglages({ verrouBiometrique: valeur });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le verrouillage n'a pas pu être modifié.");
    }
  }

  async function basculerSignature(valeur: boolean) {
    try {
      await majReglages({ signatureActive: valeur });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La signature n'a pas pu être modifiée.");
    }
  }

  async function basculerRappels(valeur: boolean) {
    try {
      await majReglages({ rappelPaiements: valeur });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Les rappels n'ont pas pu être modifiés.");
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.contenu,
        { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <EnTeteEcran titre="Plus" />

      {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

      {/* Ce que contient l'application */}
      <Carte>
        <Text style={styles.section}>Vos données</Text>
        <Text style={styles.aide}>
          Tout est enregistré sur ce téléphone uniquement. Aucun envoi vers Internet.
        </Text>
        <LigneDetail libelle="Propriétaires" valeur={String(nombreProprietaires)} />
        <LigneDetail libelle="Logements" valeur={String(nombreLogements)} />
        <LigneDetail libelle="Paiements enregistrés" valeur={String(nombrePaiements)} />
        <LigneDetail libelle="Documents émis" valeur={String(nombreDocuments)} />
      </Carte>

      {/* Propriétaires */}
      <Carte>
        <Text style={styles.section}>Propriétaires</Text>
        <Text style={styles.aide}>
          Un propriétaire peut posséder plusieurs logements. Son nom et son adresse figurent sur
          les documents.
        </Text>
        <Bouton
          libelle="Gérer les propriétaires"
          variante="secondaire"
          onPress={() => router.push('/proprietaire')}
        />
      </Carte>

      {/* Modèle de document */}
      <Carte>
        <Text style={styles.section}>Modèle des documents</Text>
        <Text style={styles.aide}>
          Le modèle choisi s’applique aux prochains documents générés. Les documents déjà émis ne
          changent pas.
        </Text>

        {(['classique', 'moderne'] as ModeleDocument[]).map((modele) => {
          const actif = reglages.modeleParDefaut === modele;
          return (
            <Pressable
              key={modele}
              onPress={() => choisirModele(modele)}
              accessibilityRole="radio"
              accessibilityState={{ selected: actif }}
              style={[styles.ligneChoix, actif && styles.ligneChoixActive]}
            >
              <View style={styles.ligneChoixTextes}>
                <Text style={[typographie.corpsAppuye, styles.nomChoix]}>
                  {LIBELLE_MODELE[modele]}
                </Text>
                <Text style={[typographie.petit, styles.detailChoix]}>
                  {modele === 'classique'
                    ? 'Présentation sobre et traditionnelle, très lisible à l’impression.'
                    : 'Mise en page moderne, bandeau coloré, montant mis en avant.'}
                </Text>
              </View>
              <View style={[styles.radio, actif && styles.radioActif]}>
                {actif ? <View style={styles.radioPoint} /> : null}
              </View>
            </Pressable>
          );
        })}
      </Carte>

      {/* Signature */}
      <Carte>
        <Text style={styles.section}>Signature du bailleur</Text>
        <Text style={styles.aide}>
          Une fois enregistrée, votre signature peut être apposée au bas des quittances.
        </Text>

        <LigneReglage
          libelle="Apposer ma signature"
          valeur={reglages.signatureActive}
          onChange={basculerSignature}
          desactive={!reglages.signatureBase64}
        />

        {!reglages.signatureBase64 ? (
          <Text style={styles.aide}>
            Aucune signature enregistrée pour l’instant.
          </Text>
        ) : null}

        <Bouton
          libelle={reglages.signatureBase64 ? 'Modifier ma signature' : 'Enregistrer ma signature'}
          variante="secondaire"
          onPress={() => router.push('/signature')}
        />
      </Carte>

      {/* Mentions libres */}
      <Carte>
        <Text style={styles.section}>Mentions sur les documents</Text>
        <LigneDetail
          libelle="Lieu d’émission"
          valeur={reglages.lieuEmission || 'Non renseigné'}
        />
        <Bouton
          libelle="Modifier les mentions"
          variante="secondaire"
          onPress={() => router.push('/mentions')}
        />
      </Carte>

      {/* Rappels */}
      <Carte>
        <Text style={styles.section}>Rappels</Text>
        <Text style={styles.aide}>
          Une notification locale, sur ce téléphone, aux dates où des loyers restent à encaisser.
        </Text>
        <LigneReglage
          libelle="Me rappeler les loyers à encaisser"
          valeur={reglages.rappelPaiements}
          onChange={basculerRappels}
        />
        {reglages.rappelPaiements ? (
          <LigneDetail libelle="Jour du rappel" valeur={`Le ${reglages.jourRappel} du mois`} />
        ) : null}
      </Carte>

      {/* Sécurité */}
      <Carte>
        <Text style={styles.section}>Sécurité</Text>
        <Text style={styles.aide}>
          Le verrouillage demande votre empreinte ou votre visage à l’ouverture de l’application.
          En cas d’échec, le code du téléphone est accepté.
        </Text>
        <LigneReglage
          libelle="Verrouiller l’application"
          valeur={reglages.verrouBiometrique}
          onChange={basculerVerrou}
        />
      </Carte>

      {/* Sauvegarde */}
      <Carte>
        <Text style={styles.section}>Sauvegarde</Text>
        <Text style={styles.aide}>
          Une sauvegarde chiffrée par mot de passe permet de retrouver vos logements, vos paiements
          et vos quittances sur un autre téléphone. Sans le mot de passe, la sauvegarde est
          illisible : conservez-le précieusement.
        </Text>
        <Bouton
          libelle="Créer une sauvegarde"
          onPress={() => router.push('/sauvegarde/export')}
        />
        <Bouton
          libelle="Restaurer une sauvegarde"
          variante="secondaire"
          onPress={() => router.push('/sauvegarde/import')}
        />
      </Carte>

      {/* À propos */}
      <Carte>
        <Text style={styles.section}>À propos</Text>
        <Text style={styles.aide}>
          Application de quittances de loyer, entièrement hors ligne. Les documents respectent les
          mentions prévues par la loi du 6 juillet 1989 pour les baux d’habitation.
        </Text>
        <Bouton
          libelle="Réinitialiser les préférences"
          variante="discret"
          onPress={() => setConfirmeReinit(true)}
        />
      </Carte>

      <DialogueConfirmation
        visible={confirmeReinit}
        titre="Réinitialiser les préférences ?"
        message="Le modèle, la signature et les rappels reviennent aux valeurs d’origine. Vos logements, paiements et documents ne sont pas touchés."
        libelleConfirmer="Réinitialiser"
        danger
        onConfirmer={async () => {
          try {
            await majReglages({
              modeleParDefaut: 'classique',
              signatureActive: false,
              rappelPaiements: false,
            });
            rafraichir();
          } catch (e) {
            setErreur(e instanceof Error ? e.message : 'La réinitialisation a échoué.');
          } finally {
            setConfirmeReinit(false);
          }
        }}
        onAnnuler={() => setConfirmeReinit(false)}
      />
    </ScrollView>
  );
}

/** Une ligne avec un interrupteur, cible tactile large. */
function LigneReglage({
  libelle,
  valeur,
  onChange,
  desactive = false,
}: {
  libelle: string;
  valeur: boolean;
  onChange: (valeur: boolean) => void;
  desactive?: boolean;
}) {
  return (
    <View style={styles.ligneReglage}>
      <Text
        style={[typographie.corps, styles.libelleReglage, desactive && styles.texteDesactive]}
      >
        {libelle}
      </Text>
      <Switch
        value={valeur}
        onValueChange={onChange}
        disabled={desactive}
        trackColor={{ false: couleurs.bordureForte, true: couleurs.vertClair }}
        thumbColor={valeur ? couleurs.vert : '#FFFFFF'}
        accessibilityLabel={libelle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenu: {
    paddingHorizontal: espaces.lg,
    gap: espaces.lg,
  },
  section: {
    ...typographie.petitAppuye,
    color: couleurs.texteTertiaire,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: espaces.sm,
  },
  aide: {
    ...typographie.petit,
    color: couleurs.texteSecondaire,
    marginBottom: espaces.md,
  },
  ligneChoix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.md,
    paddingVertical: espaces.md,
    paddingHorizontal: espaces.md,
    borderRadius: rayons.md,
  },
  ligneChoixActive: {
    backgroundColor: couleurs.vertTresClair,
  },
  ligneChoixTextes: {
    flex: 1,
  },
  nomChoix: {
    color: couleurs.texte,
  },
  detailChoix: {
    color: couleurs.texteSecondaire,
    marginTop: 2,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: couleurs.bordureForte,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActif: {
    borderColor: couleurs.vert,
  },
  radioPoint: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: couleurs.vert,
  },
  ligneReglage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.md,
    minHeight: 48,
    marginBottom: espaces.sm,
  },
  libelleReglage: {
    color: couleurs.texte,
    flex: 1,
  },
  texteDesactive: {
    color: couleurs.texteTertiaire,
  },
});

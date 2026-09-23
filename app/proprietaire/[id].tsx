/**
 * Fiche d'un propriétaire : création si l'identifiant vaut « nouveau »,
 * modification sinon.
 *
 * Le nom et l'adresse du propriétaire sont recopiés sur chaque document généré.
 * Un champ vide à cet endroit produirait une quittance incomplète, donc ces
 * champs sont obligatoires et expliqués comme tels.
 */

import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import {
  BandeauMessage,
  Bouton,
  Carte,
  Champ,
  EnTeteEcran,
} from '@/ui/components';
import { espaces, typographie } from '@/ui/tokens';
import {
  creerProprietaire,
  modifierProprietaire,
  trouverProprietaire,
} from '@/db/repositories/owners';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, type Couleurs } from '@/ui/theme';

export default function EcranProprietaire() {
  const styles = useStyles(creerStyles);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const { rafraichir } = useApplication();

  const creation = !id || id === 'nouveau';

  const [nom, setNom] = useState('');
  const [qualite, setQualite] = useState('');
  const [adresse, setAdresse] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [ville, setVille] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');

  const [chargement, setChargement] = useState(!creation);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [touche, setTouche] = useState<Record<string, boolean>>({});

  useFocusEffect(
    useCallback(() => {
      if (creation || !id) {
        setChargement(false);
        return;
      }

      (async () => {
        try {
          const p = await trouverProprietaire(id);
          if (!p) {
            setErreur('Ce propriétaire est introuvable.');
            return;
          }
          setNom(p.nom);
          setQualite(p.qualite ?? '');
          setAdresse(p.adresse);
          setCodePostal(p.codePostal);
          setVille(p.ville);
          setTelephone(p.telephone ?? '');
          setEmail(p.email ?? '');
        } catch (e) {
          setErreur(
            e instanceof Error ? e.message : 'Impossible de charger ce propriétaire.',
          );
        } finally {
          setChargement(false);
        }
      })();
    }, [creation, id]),
  );

  // Les messages d'erreur n'apparaissent qu'après une tentative d'enregistrement :
  // afficher « obligatoire » dès l'ouverture d'un formulaire vide est hostile.
  const erreurNom =
    touche.nom && nom.trim().length === 0
      ? 'Le nom est nécessaire : il figurera sur chaque document.'
      : null;
  const erreurAdresse =
    touche.adresse && adresse.trim().length === 0
      ? 'L’adresse du propriétaire figure sur chaque document.'
      : null;
  const erreurCodePostal =
    touche.codePostal && !/^\d{5}$/.test(codePostal.trim())
      ? 'Le code postal doit comporter 5 chiffres.'
      : null;
  const erreurVille = touche.ville && ville.trim().length === 0 ? 'La ville est nécessaire.' : null;

  const valide =
    nom.trim().length > 0 &&
    adresse.trim().length > 0 &&
    /^\d{5}$/.test(codePostal.trim()) &&
    ville.trim().length > 0;

  async function enregistrer() {
    setTouche({ nom: true, adresse: true, codePostal: true, ville: true });
    if (!valide) return;

    setEnCours(true);
    setErreur(null);

    try {
      if (creation) {
        await creerProprietaire({
          nom: nom.trim(),
          qualite: qualite.trim() || null,
          adresse: adresse.trim(),
          codePostal: codePostal.trim(),
          ville: ville.trim(),
          telephone: telephone.trim() || null,
          email: email.trim() || null,
        });
      } else if (id) {
        await modifierProprietaire(id, {
          nom: nom.trim(),
          qualite: qualite.trim() || null,
          adresse: adresse.trim(),
          codePostal: codePostal.trim(),
          ville: ville.trim(),
          telephone: telephone.trim() || null,
          email: email.trim() || null,
        });
      }

      rafraichir();
      router.back();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'enregistrement a échoué.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.plein}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + espaces.enorme },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <EnTeteEcran
          titre={creation ? 'Nouveau propriétaire' : 'Modifier le propriétaire'}
        />

        {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

        {chargement ? (
          <Text style={styles.chargement}>Chargement…</Text>
        ) : (
          <>
            <Carte>
              <Text style={styles.section}>Identité</Text>
              <Champ
                libelle="Nom ou raison sociale"
                valeur={nom}
                onChangement={(v) => setNom(v)}
                placeholder="Ex. Marie Dupont, ou SCI Les Tilleuls"
                erreur={erreurNom}
                obligatoire
                autoCapitalisation="words"
              />
              <Champ
                libelle="Qualité"
                valeur={qualite}
                onChangement={setQualite}
                placeholder="Ex. propriétaire, bailleur, gérant (facultatif)"
                majuscules
              />
            </Carte>

            <Carte>
              <Text style={styles.section}>Adresse</Text>
              <Text style={styles.aide}>
                Cette adresse apparaît en tête des quittances, comme le prévoit le modèle
                habituel.
              </Text>
              <Champ
                libelle="Adresse"
                valeur={adresse}
                onChangement={setAdresse}
                placeholder="Ex. 12 rue des Écoles"
                erreur={erreurAdresse}
                obligatoire
              />
              <Champ
                libelle="Code postal"
                valeur={codePostal}
                onChangement={(v) => setCodePostal(v.replace(/[^0-9]/g, ''))}
                placeholder="Ex. 95360"
                clavier="number-pad"
                maxLength={5}
                erreur={erreurCodePostal}
                obligatoire
              />
              <Champ
                libelle="Ville"
                valeur={ville}
                onChangement={setVille}
                placeholder="Ex. Montmagny"
                erreur={erreurVille}
                obligatoire
              />
            </Carte>

            <Carte>
              <Text style={styles.section}>Coordonnées</Text>
              <Text style={styles.aide}>
                Facultatives. Elles ne figurent pas sur les documents.
              </Text>
              <Champ
                libelle="Téléphone"
                valeur={telephone}
                onChangement={setTelephone}
                placeholder="Facultatif"
                clavier="phone-pad"
              />
              <Champ
                libelle="Courriel"
                valeur={email}
                onChangement={setEmail}
                placeholder="Facultatif"
                clavier="email-address"
                autoCapitalisation="none"
              />
            </Carte>

            <Bouton
              libelle={creation ? 'Créer ce propriétaire' : 'Enregistrer les modifications'}
              desactive={!valide || enCours}
              occupe={enCours}
              onPress={enregistrer}
            />

            {!valide ? (
              <Text style={styles.note}>
                Complétez le nom, l’adresse, le code postal et la ville pour activer le bouton.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  plein: {
    flex: 1,
    backgroundColor: couleurs.fond,
  },
  contenu: {
    paddingHorizontal: espaces.lg,
    gap: espaces.lg,
  },
  chargement: {
    ...typographie.corps,
    color: couleurs.texteTertiaire,
    textAlign: 'center',
    marginTop: espaces.xxl,
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
  note: {
    ...typographie.petit,
    color: couleurs.texteTertiaire,
    textAlign: 'center',
  },
});

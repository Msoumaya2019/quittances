/**
 * Création d'une sauvegarde.
 *
 * Deux temps, dans cet ordre : on explique ce que contient la sauvegarde, puis
 * on demande un mot de passe. Un mot de passe perdu est irrécupérable — c'est la
 * contrepartie du chiffrement — et l'écran le dit clairement avant la saisie,
 * pas après.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';

import {
  BandeauMessage,
  Bouton,
  Carte,
  Champ,
  EcranVide,
  EnTeteEcran,
  LigneDetail,
} from '@/ui/components';
import { espaces, typographie } from '@/ui/tokens';
import { creerSauvegarde, tailleSauvegarde } from '@/backup/export';
import { useStyles, type Couleurs } from '@/ui/theme';

export default function EcranExportSauvegarde() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();

  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [etape, setEtape] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reussi, setReussi] = useState<{
    chemin: string;
    taille: number;
    fichiers: number;
    octetsFichiers: number;
  } | null>(null);

  const assezLong = motDePasse.length >= 8;
  const identiques = motDePasse.length > 0 && motDePasse === confirmation;
  const peutCreer = assezLong && identiques && !enCours;

  async function creer() {
    if (!peutCreer) return;
    setEnCours(true);
    setErreur(null);
    setReussi(null);

    try {
      const { chemin, resume } = await creerSauvegarde(motDePasse, setEtape);
      const taille = await tailleSauvegarde(chemin);
      setReussi({
        chemin,
        taille,
        fichiers: resume.fichiers ?? 0,
        octetsFichiers: resume.octetsFichiers ?? 0,
      });
      setMotDePasse('');
      setConfirmation('');
    } catch (e) {
      setErreur(
        e instanceof Error ? e.message : "La sauvegarde n'a pas pu être créée.",
      );
    } finally {
      setEnCours(false);
      setEtape(null);
    }
  }

  async function partager() {
    if (!reussi) return;
    const disponible = await Sharing.isAvailableAsync();
    if (!disponible) {
      setErreur(
        'Le partage n’est pas disponible sur cet appareil. Le fichier reste enregistré dans l’application.',
      );
      return;
    }
    try {
      // On partage le fichier tel quel : c'est un `.json`, pas un PDF, donc on
      // ne passe pas par le partage de documents qui force le type PDF.
      await Sharing.shareAsync(reussi.chemin, {
        mimeType: 'application/json',
        dialogTitle: 'Envoyer la sauvegarde',
        UTI: 'public.json',
      });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le partage n'a pas pu aboutir.");
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.contenu,
        { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + espaces.enorme },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <EnTeteEcran titre="Créer une sauvegarde" />

      {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

      {reussi ? (
        <>
          <BandeauMessage
            ton="succes"
            message="Votre sauvegarde est prête. Envoyez-la sur votre espace de stockage, votre messagerie ou votre ordinateur : elle doit vivre ailleurs que sur ce téléphone."
          />

          <Carte>
            <Text style={styles.section}>La sauvegarde</Text>
            <LigneDetail libelle="Fichier" valeur={reussi.chemin.split('/').pop() ?? '—'} />
            <LigneDetail libelle="Taille" valeur={formaterTaille(reussi.taille)} />
            <LigneDetail
              libelle="Fichiers emportés"
              valeur={
                reussi.fichiers === 0
                  ? 'Aucun'
                  : `${reussi.fichiers} (${formaterTaille(reussi.octetsFichiers)})`
              }
            />
            <LigneDetail libelle="Protection" valeur="Mot de passe" />
          </Carte>

          <Bouton libelle="Envoyer la sauvegarde" onPress={partager} />

          <Carte>
            <Text style={styles.section}>À faire maintenant</Text>
            <Text style={styles.aide}>
              Rangez la sauvegarde dans un endroit sûr, par exemple votre boîte mail personnelle ou
              votre ordinateur. Sans ce fichier et sans son mot de passe, il serait impossible de
              retrouver vos données si le téléphone était perdu.
            </Text>
          </Carte>

          <Bouton
            libelle="Terminer"
            variante="discret"
            onPress={() => router.back()}
          />
        </>
      ) : (
        <>
          <Carte>
            <Text style={styles.section}>Ce que contient la sauvegarde</Text>
            <Text style={styles.aide}>
              Vos données de gestion, y compris votre signature et vos préférences :
            </Text>
            <LigneDetail libelle="Propriétaires et coordonnées" valeur="Inclus" />
            <LigneDetail libelle="Logements et locataires" valeur="Inclus" />
            <LigneDetail libelle="Historique des loyers" valeur="Inclus" />
            <LigneDetail libelle="Tous les paiements" valeur="Inclus" />
            <LigneDetail libelle="Documents émis et réglages" valeur="Inclus" />
            <LigneDetail libelle="Fichiers PDF des quittances" valeur="Inclus" />
            <LigneDetail libelle="Photos des états des lieux et inventaires" valeur="Incluses" />
          </Carte>

          {/* Les fichiers sont maintenant dans l'archive, et chiffrés avec le
              reste : des photos de logement sont des données personnelles. Ce
              qui reste à dire ici, c'est ce que la sauvegarde ne peut pas
              promettre — un fichier déjà absent du téléphone au moment de
              l'export n'a pas pu être joint. */}
          <BandeauMessage
            ton="avertissement"
            message="Les fichiers PDF, les photos et les documents scannés sont joints à la sauvegarde, et chiffrés avec le reste. Un fichier déjà absent de ce téléphone au moment de l’export n’a pas pu être joint : le décompte ci-dessous dit ce qui a réellement été emporté."
          />

          <BandeauMessage
            ton="avertissement"
            message="La sauvegarde est chiffrée : sans ce mot de passe, personne ne peut la lire. Ni vous, ni nous. Il n’existe aucun moyen de le retrouver."
          />

          <Carte>
            <Text style={styles.section}>Mot de passe</Text>

            <Champ
              libelle="Mot de passe"
              valeur={motDePasse}
              onChangement={setMotDePasse}
              placeholder="Au moins 8 caractères"
              aide={
                motDePasse.length > 0 && !assezLong
                  ? `Encore ${8 - motDePasse.length} caractère${8 - motDePasse.length > 1 ? 's' : ''}.`
                  : 'Un mot de passe long est plus solide qu’un mot de passe compliqué.'
              }
              erreur={motDePasse.length > 0 && !assezLong ? 'Trop court.' : null}
              editable={!enCours}
            />

            <Champ
              libelle="Confirmez le mot de passe"
              valeur={confirmation}
              onChangement={setConfirmation}
              placeholder="Recopiez le mot de passe"
              erreur={confirmation.length > 0 && !identiques ? 'Les deux mots de passe diffèrent.' : null}
              editable={!enCours}
            />
          </Carte>

          {etape ? (
            <BandeauMessage ton="information" message={etape} />
          ) : null}

          <Bouton
            libelle={enCours ? 'Création en cours…' : 'Créer la sauvegarde'}
            desactive={!peutCreer}
            occupe={enCours}
            onPress={creer}
          />

          {!peutCreer && !enCours ? (
            <EcranVide
              titre="Presque terminé"
              message="Saisissez un mot de passe d’au moins 8 caractères, puis recopiez-le à l’identique : le bouton de création s’activera."
              illustration="coffre"
            />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

/** Formate une taille en octets de façon lisible. */
function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} octets`;
  if (octets < 1024 * 1024) {
    return `${(octets / 1024).toFixed(1).replace('.', ',')} Ko`;
  }
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
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
    marginBottom: espaces.sm,
  },
});

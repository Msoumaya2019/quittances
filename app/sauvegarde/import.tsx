/**
 * Restauration d'une sauvegarde.
 *
 * Parcours volontairement prudent : choisir le fichier, saisir le mot de passe,
 * **voir ce que contient la sauvegarde**, puis confirmer. On n'écrase jamais des
 * données existantes sans que l'utilisateur ait lu ce qu'il s'apprête à faire.
 *
 * Une sauvegarde contient la **trace** des documents, pas les fichiers PDF. Une
 * fois la restauration faite, l'écran regarde donc, fichiers en main, combien de
 * documents restaurés n'ont plus le leur, et le dit. L'application ne régénère
 * jamais un document émis : promettre le contraire ferait perdre au bailleur un
 * document qu'il croit à l'abri.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';

import {
  BandeauMessage,
  Bouton,
  Carte,
  Champ,
  DialogueConfirmation,
  EnTeteEcran,
  LigneDetail,
} from '@/ui/components';
import { espaces, typographie } from '@/ui/tokens';
import { lireEnveloppe } from '@/backup/export';
import {
  appliquerSauvegarde,
  documentsSansFichier,
  lireSauvegarde,
  type BilanRestauration,
} from '@/backup/import';
import { tousLesDocuments } from '@/db/repositories/documents';
import type { ContenuSauvegarde } from '@/backup/export';
import type { EnveloppeSauvegarde } from '@/backup/crypto';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, type Couleurs } from '@/ui/theme';

/**
 * Le message affiché quand des PDF manquent après une restauration.
 *
 * Il nomme la cause, dit ce que l'application ne fera pas, et indique le seul
 * recours réel : les PDF déjà partagés, que le bailleur a peut-être gardés.
 */
function messagePdfManquants(nombre: number): string {
  const debut =
    nombre === 1
      ? 'Un document restauré n’a plus son fichier PDF.'
      : `${nombre} documents restaurés n’ont plus leur fichier PDF.`;

  return (
    `${debut} Une sauvegarde contient la trace des documents, pas les PDF ` +
    'eux-mêmes, et l’application ne régénère jamais un document émis. Si vous ' +
    'aviez partagé ces PDF, vous les retrouverez là où vous les avez enregistrés.'
  );
}

export default function EcranImportSauvegarde() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { rafraichir } = useApplication();

  const [chemin, setChemin] = useState<string | null>(null);
  const [nomFichier, setNomFichier] = useState<string | null>(null);
  const [enveloppe, setEnveloppe] = useState<EnveloppeSauvegarde | null>(null);
  const [contenu, setContenu] = useState<ContenuSauvegarde | null>(null);
  const [motDePasse, setMotDePasse] = useState('');

  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirme, setConfirme] = useState(false);
  const [bilan, setBilan] = useState<BilanRestauration | null>(null);
  /** Documents restaurés dont le PDF est absent. `null` = on ne sait pas encore. */
  const [pdfManquants, setPdfManquants] = useState<number | null>(null);

  /** Ouvre un fichier et reconnaît une sauvegarde, sans rien déchiffrer. */
  async function choisirFichier() {
    setErreur(null);
    setContenu(null);
    setEnveloppe(null);
    setChemin(null);
    setNomFichier(null);
    setBilan(null);
    setPdfManquants(null);
    setMotDePasse('');

    try {
      const choix = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (choix.canceled || choix.assets.length === 0) return;

      const fichier = choix.assets[0];
      const env = await lireEnveloppe(fichier.uri);

      setChemin(fichier.uri);
      setNomFichier(fichier.name ?? 'sauvegarde.json');
      setEnveloppe(env);
    } catch (e) {
      setErreur(
        e instanceof Error ? e.message : "Ce fichier n'a pas pu être ouvert.",
      );
    }
  }

  /** Déchiffre et présente le contenu, sans écrire quoi que ce soit. */
  async function lireContenu() {
    if (!enveloppe || motDePasse.length === 0) return;
    setEnCours(true);
    setErreur(null);

    try {
      const objet = await lireSauvegarde(enveloppe, motDePasse);
      setContenu(objet);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Cette sauvegarde n'a pas pu être ouverte.");
    } finally {
      setEnCours(false);
    }
  }

  /** Applique la restauration, après confirmation explicite. */
  async function restaurer() {
    if (!contenu) return;
    setEnCours(true);
    setErreur(null);

    try {
      const resultat = await appliquerSauvegarde(contenu);
      setBilan(resultat);
      setConfirme(false);
      setContenu(null);
      setEnveloppe(null);
      setMotDePasse('');
      rafraichir();

      // Ce comptage est un confort, pas une preuve de restauration : s'il
      // échoue, la restauration reste réussie et on se tait plutôt que de
      // l'annoncer comme un échec.
      try {
        const documents = await tousLesDocuments();
        setPdfManquants((await documentsSansFichier(documents)).length);
      } catch {
        setPdfManquants(null);
      }
    } catch (e) {
      setErreur(
        e instanceof Error
          ? e.message
          : "La restauration a échoué. Vos données n'ont pas été modifiées.",
      );
      setConfirme(false);
    } finally {
      setEnCours(false);
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
      <EnTeteEcran titre="Restaurer une sauvegarde" />

      {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

      {bilan ? (
        <>
          <BandeauMessage
            ton="succes"
            message="Vos données ont été remplacées par celles de la sauvegarde. Vos logements, vos paiements et l’historique de vos documents sont revenus tels qu’ils étaient."
          />

          {pdfManquants !== null && pdfManquants > 0 ? (
            <BandeauMessage ton="avertissement" message={messagePdfManquants(pdfManquants)} />
          ) : null}

          <Carte>
            <Text style={styles.section}>Ce qui a été restauré</Text>
            <LigneDetail libelle="Propriétaires" valeur={String(bilan.proprietaires)} />
            <LigneDetail libelle="Logements" valeur={String(bilan.logements)} />
            <LigneDetail libelle="Locataires" valeur={String(bilan.titulaires)} />
            <LigneDetail libelle="Périodes de loyer" valeur={String(bilan.periodesLoyer)} />
            <LigneDetail libelle="Paiements" valeur={String(bilan.paiements)} />
            <LigneDetail
              libelle="Documents"
              valeur={
                pdfManquants !== null && pdfManquants > 0
                  ? `${bilan.documents} (dont ${pdfManquants} sans PDF)`
                  : String(bilan.documents)
              }
            />
            <LigneDetail libelle="Préférences et signature" valeur="Restaurées" />
          </Carte>
          <Bouton libelle="Terminer" onPress={() => router.back()} />
        </>
      ) : (
        <>
          {/* Étape 1 : choisir le fichier */}
          <Carte>
            <Text style={styles.section}>Étape 1 — Choisir le fichier</Text>
            <Text style={styles.aide}>
              Sélectionnez le fichier de sauvegarde que vous avez conservé. Il se termine par
              « .json » et commence par « quittances-sauvegarde ».
            </Text>

            {nomFichier ? (
              <>
                <LigneDetail libelle="Fichier choisi" valeur={nomFichier} />
                {enveloppe ? (
                  <LigneDetail libelle="Créée le" valeur={enveloppe.creeLe} />
                ) : null}
              </>
            ) : null}

            <Bouton
              libelle={nomFichier ? 'Choisir un autre fichier' : 'Choisir un fichier'}
              variante={nomFichier ? 'secondaire' : 'principal'}
              onPress={choisirFichier}
            />
          </Carte>

          {/* Étape 2 : mot de passe */}
          {enveloppe ? (
            <Carte>
              <Text style={styles.section}>Étape 2 — Mot de passe</Text>
              <Text style={styles.aide}>
                Saisissez le mot de passe qui avait été choisi lors de la création de cette
                sauvegarde.
              </Text>

              <Champ
                libelle="Mot de passe de la sauvegarde"
                valeur={motDePasse}
                onChangement={setMotDePasse}
                placeholder="Votre mot de passe"
                editable={!enCours}
              />

              <Bouton
                libelle="Ouvrir la sauvegarde"
                variante="secondaire"
                desactive={motDePasse.length === 0 || enCours}
                occupe={enCours && contenu === null}
                onPress={lireContenu}
              />
            </Carte>
          ) : null}

          {/* Étape 3 : voir le contenu, puis confirmer */}
          {contenu ? (
            <>
              <Carte>
                <Text style={styles.section}>Étape 3 — Vérifier avant de restaurer</Text>
                <Text style={styles.aide}>
                  Voici ce que contient cette sauvegarde, créée le{' '}
                  {contenu.creeLe.slice(0, 10).split('-').reverse().join('/')}.
                </Text>
                <LigneDetail libelle="Propriétaires" valeur={String(contenu.resume.proprietaires)} />
                <LigneDetail libelle="Logements" valeur={String(contenu.resume.logements)} />
                <LigneDetail
                  libelle="Locataires"
                  valeur={String(contenu.resume.titulaires)}
                />
                <LigneDetail libelle="Paiements" valeur={String(contenu.resume.paiements)} />
                <LigneDetail libelle="Documents" valeur={String(contenu.resume.documents)} />
              </Carte>

              <BandeauMessage
                ton="avertissement"
                message="Les logements, paiements et documents présents sur ce téléphone seront remplacés par ceux de la sauvegarde. Les fichiers PDF déjà générés resteront sur l’appareil, mais ne seront plus rattachés à rien."
              />

              <Bouton
                libelle="Restaurer cette sauvegarde"
                variante="danger"
                occupe={enCours}
                onPress={() => setConfirme(true)}
              />
            </>
          ) : null}
        </>
      )}

      <DialogueConfirmation
        visible={confirme}
        titre="Remplacer vos données actuelles ?"
        message="Tout ce qui est enregistré sur ce téléphone sera remplacé par le contenu de la sauvegarde. Cette action ne peut pas être annulée."
        libelleConfirmer="Oui, restaurer"
        danger
        occupe={enCours}
        onConfirmer={restaurer}
        onAnnuler={() => setConfirme(false)}
      />
    </ScrollView>
  );
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
    marginBottom: espaces.md,
  },
});

/**
 * Ajouter un document au dossier d'un logement.
 *
 * Ce que fait cet écran : prendre un fichier qui est **déjà** sur le téléphone
 * — un bail signé sur papier puis scanné, un diagnostic, une attestation
 * d'assurance, un état des lieux établi ailleurs — et le ranger dans le dossier
 * du logement, sous le bon type.
 *
 * Ce qu'il ne fait pas : il ne fabrique aucun document. Les baux et les états
 * des lieux produits par l'application auront leurs propres écrans, et
 * arriveront avec leurs modèles. Ici, on range.
 *
 * Le fichier est **copié** dans l'application : le document d'origine peut
 * vivre dans un cache que le système efface, ou sur une carte qu'on retire. Une
 * pièce du dossier doit rester lisible des années plus tard.
 *
 * La pièce est rattachée au **logement** et, s'il y en a un, au **bail en
 * cours** : c'est ce qui la fait apparaître sous le nom du locataire en place,
 * sans que le bailleur ait à le choisir.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';

import {
  BandeauMessage,
  BarreActionFixe,
  Bouton,
  Carte,
  Champ,
  EnTeteEcran,
  Segments,
} from '@/ui/components';
import { espaces, rayons, typographie } from '@/ui/tokens';
import { aujourdHui, formaterDateFr } from '@/domain/period';
import { manquesDuBrouillon } from '@/domain/dossier';
import { LIBELLE_PIECE } from '@/domain/types';
import type { Logement, TypePiece } from '@/domain/types';
import { useApplication } from '@/state/ApplicationContext';
import { bailEnCours, listerLogements } from '@/db/repositories/properties';
import { enregistrerPiece } from '@/db/repositories/pieces';
import {
  copierPiece,
  supprimerFichierPiece,
  tailleLisible,
  titreDepuisNom,
} from '@/documents/stockage';
import { useStyles, type Couleurs } from '@/ui/theme';

/** Les cinq types proposés, dans l'ordre de la vie d'une location. */
const TYPES: TypePiece[] = ['bail', 'edl_entree', 'edl_sortie', 'inventaire', 'autre'];

function typeValide(valeur: string | undefined): TypePiece | null {
  return TYPES.includes(valeur as TypePiece) ? (valeur as TypePiece) : null;
}

export default function EcranAjouterDocument() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { rafraichir } = useApplication();

  // Le logement et le type peuvent venir de l'écran appelant : depuis un
  // dossier, le bailleur a déjà dit de quel logement il parle, et le lui
  // redemander serait lui faire saisir deux fois la même chose.
  const params = useLocalSearchParams<{ logementId?: string; type?: string; bailId?: string }>();
  const logementImpose = typeof params.logementId === 'string' ? params.logementId : null;
  /**
   * Le bail auquel rattacher la pièce.
   *
   * Il est fourni quand on range un document depuis le dossier d'un **ancien**
   * locataire : le bail en cours du logement est alors celui du locataire
   * suivant, et y rattacher un état des lieux de sortie le rangerait sous la
   * mauvaise personne.
   */
  const bailImpose = typeof params.bailId === 'string' ? params.bailId : null;

  const [logements, setLogements] = useState<Logement[]>([]);
  const [logementId, setLogementId] = useState<string | null>(logementImpose);
  const [type, setType] = useState<TypePiece>(typeValide(params.type) ?? 'autre');

  const [fichier, setFichier] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [taille, setTaille] = useState<string | null>(null);
  const [titre, setTitre] = useState('');
  const [date, setDate] = useState(aujourdHui());

  const [erreur, setErreur] = useState<string | null>(null);
  const [travail, setTravail] = useState(false);

  useEffect(() => {
    let actif = true;
    void (async () => {
      try {
        const liste = await listerLogements();
        if (actif) setLogements(liste);
      } catch (e) {
        if (actif) {
          setErreur(
            e instanceof Error ? e.message : 'Impossible de lire les logements pour le moment.',
          );
        }
      }
    })();
    return () => {
      actif = false;
    };
  }, []);

  const manques = manquesDuBrouillon({
    logementId,
    type,
    fichier: fichier?.uri ?? null,
    titre,
    date,
  });

  const choisirFichier = useCallback(async () => {
    setErreur(null);
    try {
      const resultat = await DocumentPicker.getDocumentAsync({
        // PDF et images : ce sont les deux formes que prend un document qu'on
        // veut ranger. Le reste — tableur, archive — n'a pas sa place dans un
        // dossier de location.
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (resultat.canceled) return;

      const choisi = resultat.assets[0];
      setFichier(choisi);
      setTaille(await tailleLisible(choisi.uri));
      // Le titre n'est proposé que s'il est vide : ne pas écraser ce que le
      // bailleur a déjà tapé.
      setTitre((actuel) => (actuel.trim() ? actuel : titreDepuisNom(choisi.name)));
    } catch (e) {
      setErreur(
        e instanceof Error
          ? `Le fichier n’a pas pu être ouvert : ${e.message}`
          : 'Le fichier n’a pas pu être ouvert.',
      );
    }
  }, []);

  async function enregistrer() {
    if (travail) return;
    if (manques.length > 0) {
      setErreur(manques.join('\n'));
      return;
    }
    if (!logementId || !fichier) return;

    setTravail(true);
    setErreur(null);

    let copie: { chemin: string } | null = null;
    try {
      // Le rattachement au bail est lu au moment d'enregistrer, pas au montage :
      // un locataire a pu être ajouté entre-temps.
      const bail = bailImpose ? null : await bailEnCours(logementId);

      copie = await copierPiece({
        sourceUri: fichier.uri,
        type,
        titre: titre.trim(),
        date: date.trim(),
        mimeType: fichier.mimeType,
      });

      await enregistrerPiece({
        logementId,
        bailId: bailImpose ?? bail?.id ?? null,
        type,
        titre: titre.trim(),
        dateDocument: date.trim(),
        cheminFichier: copie.chemin,
      });

      rafraichir();
      router.back();
    } catch (e) {
      // Le fichier a pu être copié avant que l'enregistrement échoue : on le
      // retire, sinon il resterait dans le dossier des documents sans qu'aucune
      // ligne ne le référence, et personne ne saurait qu'il existe.
      if (copie) await supprimerFichierPiece(copie.chemin);
      setErreur(
        e instanceof Error ? e.message : "Le document n'a pas pu être enregistré.",
      );
    } finally {
      setTravail(false);
    }
  }

  const logementChoisi = logements.find((l) => l.id === logementId) ?? null;

  return (
    <View style={styles.plein}>
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: 140 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <EnTeteEcran
          titre="Ajouter un document"
          sousTitre="Un fichier déjà sur votre téléphone"
          actionLibelle="Annuler"
          actionOnPress={() => router.back()}
        />

        {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

        {/* --- Le logement ------------------------------------------------ */}
        <Carte>
          <Text style={styles.section}>Logement</Text>

          {logementChoisi ? (
            <>
              <Text style={styles.nomLogement}>{logementChoisi.nom}</Text>
              <Text style={styles.detail}>
                {logementChoisi.adresse}
                {'\n'}
                {`${logementChoisi.codePostal} ${logementChoisi.ville}`.trim()}
              </Text>
              {!logementImpose ? (
                <Bouton
                  libelle="Changer de logement"
                  variante="discret"
                  compact
                  pleineLargeur={false}
                  onPress={() => setLogementId(null)}
                  style={styles.changer}
                />
              ) : null}
            </>
          ) : logements.length === 0 ? (
            <Text style={styles.detail}>
              Aucun logement enregistré. Ajoutez d’abord un logement, puis revenez ranger ce
              document dans son dossier.
            </Text>
          ) : (
            logements.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => setLogementId(l.id)}
                accessibilityRole="button"
                accessibilityLabel={`Rattacher au logement ${l.nom}`}
                style={({ pressed }) => [styles.ligneChoix, pressed && styles.ligneAppuyee]}
              >
                <View style={styles.ligneTextes}>
                  <Text style={[typographie.corpsAppuye, styles.titreLigne]}>{l.nom}</Text>
                  <Text style={[typographie.petit, styles.detailLigne]}>
                    {`${l.codePostal} ${l.ville}`.trim()}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </Carte>

        {/* --- Le type ---------------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>Type de document</Text>
          <Text style={styles.detail}>
            Il décide de la catégorie où le document apparaîtra, et de l’ordre du dossier.
          </Text>
          <Segments
            defilable
            segments={TYPES.map((t) => ({ valeur: t, libelle: LIBELLE_PIECE[t] }))}
            valeur={type}
            onChanger={(v: TypePiece) => setType(v)}
          />
        </Carte>

        {/* --- Le fichier ------------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>Fichier</Text>

          {fichier ? (
            <>
              <Text style={styles.nomFichier}>{fichier.name}</Text>
              {taille ? <Text style={styles.detail}>Taille : {taille}</Text> : null}
              <Bouton
                libelle="Choisir un autre fichier"
                variante="discret"
                compact
                pleineLargeur={false}
                onPress={() => void choisirFichier()}
                style={styles.changer}
              />
            </>
          ) : (
            <>
              <Text style={styles.detail}>
                Choisissez un PDF ou une photo. Le fichier sera copié dans l’application : il
                restera lisible même si vous déplacez ou supprimez l’original.
              </Text>
              <Bouton
                libelle="Choisir un fichier"
                variante="secondaire"
                onPress={() => void choisirFichier()}
              />
            </>
          )}
        </Carte>

        {/* --- Titre et date ---------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>Ce que le dossier affichera</Text>

          <Champ
            libelle="Titre du document"
            valeur={titre}
            onChangement={setTitre}
            placeholder="Bail signé, Diagnostic gaz…"
            aide="C’est le nom que vous retrouverez dans le dossier du logement."
            obligatoire
          />

          <Champ
            libelle="Date du document"
            valeur={date}
            onChangement={setDate}
            placeholder="AAAA-MM-JJ"
            clavier="numbers-and-punctuation"
            aide={
              /^\d{4}-\d{2}-\d{2}$/.test(date.trim())
                ? `Soit le ${formaterDateFr(date.trim())}.`
                : 'La date portée sur le document, pas celle du jour.'
            }
            obligatoire
          />
        </Carte>
      </ScrollView>

      <BarreActionFixe
        libelle={travail ? 'Enregistrement…' : 'Enregistrer dans le dossier'}
        aide={manques.length > 0 ? manques[0] : undefined}
        onPress={() => void enregistrer()}
      />
    </View>
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
    section: {
      ...typographie.petitAppuye,
      color: couleurs.texteTertiaire,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: espaces.sm,
    },
    nomLogement: {
      ...typographie.titreSection,
      color: couleurs.texte,
    },
    nomFichier: {
      ...typographie.corpsAppuye,
      color: couleurs.texte,
    },
    detail: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      marginBottom: espaces.sm,
    },
    changer: {
      marginTop: espaces.sm,
      alignSelf: 'flex-start',
    },
    ligneChoix: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaces.md,
      paddingVertical: espaces.md,
      paddingHorizontal: espaces.md,
      borderRadius: rayons.md,
      borderWidth: 1,
      borderColor: couleurs.bordure,
      marginTop: espaces.sm,
    },
    ligneAppuyee: {
      backgroundColor: couleurs.fondSurvol,
    },
    ligneTextes: {
      flex: 1,
      gap: 2,
    },
    titreLigne: {
      color: couleurs.texte,
    },
    detailLigne: {
      color: couleurs.texteSecondaire,
    },
  });

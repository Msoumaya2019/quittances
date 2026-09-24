/**
 * Onglet DOCUMENTS.
 *
 * C'est le classeur du bailleur. Cinq entrées, dans l'ordre où l'on cherche un
 * document :
 *
 *   Quittances | Baux de location | États des lieux | Inventaires | Autres
 *
 * Les quittances gardent **tout** ce que faisait l'onglet Quittance : le mois
 * affiché, la génération en un appui, le rattrapage d'un mois oublié, la liste
 * de tout ce qui a été émis. Elles ont simplement changé de place — elles sont
 * devenues une catégorie d'un ensemble plus large, au lieu d'occuper un onglet
 * entier.
 *
 * Les autres catégories montrent les pièces rangées dans les dossiers des
 * logements, tous logements confondus. C'est la vue qui répond à « où est passé
 * ce document ? » quand on ne se souvient plus du logement concerné.
 *
 * Chaque ligne porte le nom de son logement : sans lui, une liste de baux ne
 * dirait rien, puisque tous s'appellent « Bail de location ».
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import {
  BandeauMessage,
  Bouton,
  Carte,
  DialogueConfirmation,
  EcranVide,
  EnTeteEcran,
  Segments,
} from '@/ui/components';
import { espaces, rayons, typographie } from '@/ui/tokens';
import { formaterDateFr } from '@/domain/period';
import { CATEGORIES_DOCUMENT } from '@/domain/types';
import type { CategorieDocument, Document, Logement, PieceDossier } from '@/domain/types';
import {
  compterParCategorie,
  elementsParCategorie,
  type ElementDossier,
} from '@/domain/dossier';
import { useApplication } from '@/state/ApplicationContext';
import { listerLogements } from '@/db/repositories/properties';
import { toutesLesPieces, supprimerPiece } from '@/db/repositories/pieces';
import { tousLesDocuments } from '@/db/repositories/documents';
import { partagerDocument } from '@/pdf/partage';
import { supprimerFichierPiece } from '@/documents/stockage';
import { PanneauQuittances } from '@/ui/ecrans/PanneauQuittances';
import { useStyles, type Couleurs } from '@/ui/theme';

/** Ce qu'on propose de faire quand la catégorie est vide. */
const VIDE: Record<
  CategorieDocument,
  { titre: string; message: string; action: string; vers: string }
> = {
  quittances: {
    titre: 'Aucune quittance pour l’instant',
    message: 'Vos quittances apparaîtront ici, toutes années confondues.',
    action: 'Ajouter un document',
    vers: '/document/ajouter',
  },
  baux: {
    titre: 'Aucun bail rangé',
    message:
      'Créez le bail d’un logement : l’application reprend l’adresse, le propriétaire, les ' +
      'locataires et le loyer déjà enregistrés, et produit un PDF signable. Un bail signé sur ' +
      'papier peut aussi être scanné et rangé ici.',
    action: 'Créer un bail',
    vers: '/bail/choisir',
  },
  etats_des_lieux: {
    titre: 'Aucun état des lieux rangé',
    message:
      'Les états des lieux d’entrée et de sortie apparaîtront ici, rangés sous le logement et le locataire concernés.',
    action: 'Ajouter un document',
    vers: '/document/ajouter',
  },
  inventaires: {
    titre: 'Aucun inventaire rangé',
    message:
      'L’inventaire du mobilier d’une location meublée apparaîtra ici, et se comparera à celui de l’entrée.',
    action: 'Ajouter un document',
    vers: '/document/ajouter',
  },
  autres: {
    titre: 'Aucun autre document',
    message:
      'Diagnostics, attestations d’assurance, factures de travaux : rangez-les ici pour les retrouver avec le logement.',
    action: 'Ajouter un document',
    vers: '/document/ajouter',
  },
};

export default function EcranDocuments() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { cleRafraichissement } = useApplication();

  const [categorie, setCategorie] = useState<CategorieDocument>('quittances');
  const [pieces, setPieces] = useState<PieceDossier[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [logements, setLogements] = useState<Logement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<ElementDossier | null>(null);
  const [travail, setTravail] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [p, d, l] = await Promise.all([
        toutesLesPieces(),
        tousLesDocuments(),
        listerLogements(),
      ]);
      setPieces(p);
      setDocuments(d);
      setLogements(l);
      setErreur(null);
    } catch (e) {
      setErreur(
        e instanceof Error ? e.message : 'Impossible de lire les documents pour le moment.',
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void charger();
      // `cleRafraichissement` est relu ici : un document ajouté depuis un autre
      // écran doit apparaître sans qu'on ait à quitter puis revenir.
    }, [charger, cleRafraichissement]),
  );

  const parCategorie = useMemo(
    () => elementsParCategorie({ pieces, documents }),
    [pieces, documents],
  );
  const compteurs = useMemo(() => compterParCategorie(parCategorie), [parCategorie]);
  const nomDuLogement = useMemo(
    () => new Map(logements.map((l) => [l.id, l.nom])),
    [logements],
  );

  async function ouvrir(element: ElementDossier) {
    setErreur(null);
    if (!element.cheminFichier) {
      setErreur(
        `Le fichier de « ${element.libelle} » n’est plus dans l’application. ` +
          'Le document reste listé, mais il n’y a plus rien à ouvrir.',
      );
      return;
    }

    try {
      const ouvert = await partagerDocument(element.cheminFichier, element.libelle);
      if (!ouvert) {
        setErreur(
          `Le fichier de « ${element.libelle} » est introuvable sur ce téléphone. ` +
            'Une sauvegarde ne contient pas les fichiers eux-mêmes : ils ne reviennent pas ' +
            'en restaurant les données.',
        );
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le document n'a pas pu être ouvert.");
    }
  }

  async function supprimerLaPiece() {
    if (!aSupprimer) return;
    setTravail(true);
    try {
      const piece = pieces.find((p) => p.id === aSupprimer.id);
      await supprimerPiece(aSupprimer.id);
      // Le fichier est retiré après la ligne : si le retrait échoue, il reste un
      // orphelin invisible, alors que l'inverse laisserait une pièce listée mais
      // illisible — le pire des deux, puisque l'application prétendrait encore
      // pouvoir l'ouvrir.
      if (piece?.cheminFichier) await supprimerFichierPiece(piece.cheminFichier);
      setASupprimer(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le document n'a pas pu être supprimé.");
      setASupprimer(null);
    } finally {
      setTravail(false);
    }
  }

  const elements = parCategorie[categorie];

  return (
    <View style={styles.plein}>
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <EnTeteEcran
          titre="Documents"
          sousTitre="Tout ce qui concerne vos logements"
          actionLibelle="+ Ajouter"
          actionOnPress={() => router.push('/document/ajouter')}
        />

        <Segments
          defilable
          segments={CATEGORIES_DOCUMENT.map((c) => ({
            valeur: c.valeur,
            libelle: c.libelle,
            compteur: compteurs[c.valeur],
          }))}
          valeur={categorie}
          onChanger={(v: CategorieDocument) => setCategorie(v)}
        />

        {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

        {categorie === 'quittances' ? (
          <PanneauQuittances />
        ) : chargement ? (
          <Text style={styles.chargement}>Chargement…</Text>
        ) : elements.length === 0 ? (
          <EcranVide
            titre={VIDE[categorie].titre}
            message={VIDE[categorie].message}
            illustration={categorie === 'baux' ? 'document' : 'recherche'}
            actionLibelle={VIDE[categorie].action}
            actionOnPress={() => router.push(VIDE[categorie].vers as never)}
          />
        ) : (
          <Carte>
            <Text style={styles.section}>
              {elements.length}{' '}
              {elements.length > 1 ? 'documents rangés' : 'document rangé'}
            </Text>
            <Text style={styles.aide}>
              Touchez un document pour l’ouvrir ou le partager. Appui long pour le supprimer du
              dossier.
            </Text>

            {/* Créer un bail reste possible même quand la catégorie n'est pas
                vide : la liste dit ce qui existe, elle ne dit pas quoi faire. */}
            {categorie === 'baux' ? (
              <Bouton
                libelle="Créer un bail"
                variante="secondaire"
                onPress={() => router.push('/bail/choisir')}
                style={styles.creer}
              />
            ) : null}

            {elements.map((element) => {
              const nom = nomDuLogement.get(element.logementId) ?? 'Logement supprimé';
              return (
                <Pressable
                  key={`${element.origine}-${element.id}`}
                  onPress={() => void ouvrir(element)}
                  onLongPress={() => setASupprimer(element)}
                  accessibilityRole="button"
                  accessibilityLabel={`${element.libelle}, ${nom}, ${formaterDateFr(element.date)}`}
                  accessibilityHint="Ouvre le document. Un appui long propose de le supprimer."
                  style={({ pressed }) => [styles.ligne, pressed && styles.ligneAppuyee]}
                >
                  <View style={styles.ligneTextes}>
                    <Text style={[typographie.corpsAppuye, styles.titreLigne]}>
                      {element.libelle}
                    </Text>
                    <Text style={[typographie.petit, styles.detailLigne]}>
                      {nom} · {formaterDateFr(element.date)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </Carte>
        )}
      </ScrollView>

      <DialogueConfirmation
        visible={aSupprimer !== null}
        titre="Supprimer ce document ?"
        message={
          aSupprimer
            ? `« ${aSupprimer.libelle} » sera retiré du dossier, et son fichier effacé du ` +
              'téléphone. Cette action ne peut pas être annulée.'
            : ''
        }
        libelleConfirmer="Supprimer"
        danger
        occupe={travail}
        onConfirmer={() => void supprimerLaPiece()}
        onAnnuler={() => setASupprimer(null)}
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
    chargement: {
      ...typographie.corps,
      color: couleurs.texteTertiaire,
      textAlign: 'center',
      marginTop: espaces.xxl,
    },
    creer: {
      marginBottom: espaces.md,
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
    ligne: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaces.md,
      paddingVertical: espaces.sm,
      borderRadius: rayons.md,
    },
    ligneAppuyee: {
      backgroundColor: couleurs.fondSurvol,
    },
    ligneTextes: {
      flex: 1,
      paddingVertical: espaces.sm,
      gap: 2,
    },
    titreLigne: {
      color: couleurs.texte,
    },
    detailLigne: {
      color: couleurs.texteSecondaire,
    },
  });

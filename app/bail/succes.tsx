/**
 * Bail généré : ce qui reste à faire.
 *
 * Trois gestes, dans l'ordre où on les veut : **voir** le document, le
 * **partager**, et **revenir au logement**.
 *
 * Le partage passe par la feuille native du système — messagerie, courriel,
 * enregistrement dans les fichiers, impression. C'est ce qui permet d'envoyer le
 * bail au locataire ou de l'imprimer pour le signer à la main, sans que
 * l'application ait à choisir à la place du bailleur.
 *
 * L'écran dit aussi ce que le document n'est **pas** : une signature tracée au
 * doigt n'est pas une signature électronique qualifiée. Le rappeler ici, au
 * moment où l'on partage, est le seul endroit où cela a une chance d'être lu.
 */

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AnimationReussite,
  BandeauMessage,
  Bouton,
  Carte,
  EcranVide,
  EnTeteEcran,
  LigneDetail,
} from '@/ui/components';
import { espaces, typographie } from '@/ui/tokens';
import { formaterDateFr } from '@/domain/period';
import { LIBELLE_BAIL, REGLES_BAIL } from '@/domain/bail';
import { finDuBailISO } from '@/pdf/bail';
import { formatMontant } from '@/domain/money';
import type { PieceDossier } from '@/domain/types';
import { trouverPiece } from '@/db/repositories/pieces';
import { ouvrirDocument, partagerDocument } from '@/pdf/partage';
import type { DonneesBail } from '@/pdf/emettre-bail';
import { useStyles, type Couleurs } from '@/ui/theme';

export default function EcranSuccesBail() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { pieceId, logementId } = useLocalSearchParams<{
    pieceId?: string;
    logementId?: string;
  }>();

  const [piece, setPiece] = useState<PieceDossier | null>(null);
  const [donnees, setDonnees] = useState<DonneesBail | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<'voir' | 'partager' | null>(null);

  useEffect(() => {
    let actif = true;

    void (async () => {
      if (!pieceId) {
        if (actif) {
          setErreur("Le bail généré n'a pas pu être retrouvé.");
          setChargement(false);
        }
        return;
      }
      try {
        const trouve = await trouverPiece(pieceId);
        if (!actif) return;
        setPiece(trouve);
        if (!trouve) {
          setErreur('Ce bail est introuvable : il a peut-être été retiré du dossier.');
        } else {
          try {
            setDonnees(JSON.parse(trouve.donnees) as DonneesBail);
          } catch {
            // Le document existe : ne pas savoir relire ses valeurs ne doit pas
            // empêcher de l'ouvrir ou de le partager.
            setDonnees(null);
          }
        }
      } catch {
        if (actif) setErreur("Le bail n'a pas pu être relu.");
      } finally {
        if (actif) setChargement(false);
      }
    })();

    return () => {
      actif = false;
    };
  }, [pieceId]);

  const agir = useCallback(
    async (quoi: 'voir' | 'partager') => {
      if (!piece || enCours) return;
      setEnCours(quoi);
      setErreur(null);
      try {
        const fait =
          quoi === 'voir'
            ? await ouvrirDocument(piece.cheminFichier)
            : await partagerDocument(piece.cheminFichier, piece.titre);
        if (!fait) {
          setErreur(
            quoi === 'voir'
              ? "Aucune application de ce téléphone ne peut ouvrir ce PDF. Vous pouvez le partager vers un lecteur, ou l'envoyer par courriel."
              : "Le partage n'est pas disponible sur ce téléphone. Le document reste rangé dans le dossier du logement.",
          );
        }
      } catch (e) {
        setErreur(
          e instanceof Error ? e.message : "Le document n'a pas pu être ouvert pour le moment.",
        );
      } finally {
        setEnCours(null);
      }
    },
    [enCours, piece],
  );

  const titre = donnees?.categorie ? LIBELLE_BAIL[donnees.categorie] : 'Bail de location';

  return (
    <View style={styles.plein}>
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: espaces.xxl + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <EnTeteEcran
          titre="Bail généré"
          actionLibelle="Terminer"
          actionOnPress={() => router.replace('/documents')}
        />

        <AnimationReussite titre="Bail généré" sousTitre={titre} />

        {erreur ? <BandeauMessage ton="erreur" message={erreur} onFermer={() => setErreur(null)} /> : null}

        {chargement ? (
          <Text style={styles.chargement}>Relance du document…</Text>
        ) : !piece ? (
          <EcranVide
            titre="Bail introuvable"
            message={erreur ?? "Le document n'a pas pu être relu dans le dossier."}
            illustration="document"
            actionLibelle="Voir les documents"
            actionOnPress={() => router.replace('/documents')}
          />
        ) : (
          <>
            <Carte>
              <Text style={styles.section}>Le document</Text>
              <Text style={styles.titreDocument}>{piece.titre}</Text>
              <LigneDetail
                libelle="Date portée"
                valeur={formaterDateFr(piece.dateDocument)}
              />
              {donnees ? (
                <>
                  <LigneDetail libelle="Durée" valeur={`${donnees.dureeMois} mois`} />
                  <LigneDetail
                    libelle="Fin"
                    valeur={formaterDateFr(finDuBailISO(piece.dateDocument, donnees.dureeMois))}
                  />
                  <LigneDetail
                    libelle="Dépôt de garantie"
                    valeur={formatMontant(donnees.depotGarantie)}
                  />
                  <LigneDetail
                    libelle="Annexes cochées"
                    valeur={
                      donnees.annexes.length === 0
                        ? 'Aucune'
                        : `${donnees.annexes.length} sur ${REGLES_BAIL[donnees.categorie].annexes.length} obligatoires`
                    }
                  />
                </>
              ) : null}
              <Text style={styles.note}>
                Le PDF est rangé dans le dossier du logement, sous le locataire en place. Il y restera
                même après le départ du locataire.
              </Text>
            </Carte>

            <Bouton
              libelle="Voir le PDF"
              onPress={() => void agir('voir')}
              occupe={enCours === 'voir'}
            />
            <Bouton
              libelle="Partager le PDF"
              variante="secondaire"
              onPress={() => void agir('partager')}
              occupe={enCours === 'partager'}
            />
            <Bouton
              libelle="Revenir au logement"
              variante="discret"
              onPress={() =>
                router.replace({
                  pathname: '/logement/[id]',
                  params: { id: logementId ?? piece.logementId },
                })
              }
            />

            <Carte>
              <Text style={styles.section}>Ce que vaut la signature</Text>
              <Text style={styles.note}>
                Un tracé au doigt matérialise l’accord des parties, comme un exemplaire signé à la
                main puis numérisé. Ce n’est pas une signature électronique qualifiée : l’application
                ne délivre ni certificat, ni horodatage, ni cachet d’un tiers de confiance. Le
                document le dit lui-même, sous les signatures.
              </Text>
            </Carte>
          </>
        )}
      </ScrollView>
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
      marginTop: espaces.xl,
    },
    section: {
      ...typographie.petitAppuye,
      color: couleurs.texteTertiaire,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: espaces.sm,
    },
    titreDocument: {
      ...typographie.titreCarte,
      color: couleurs.texte,
      marginBottom: espaces.sm,
    },
    note: {
      ...typographie.petit,
      color: couleurs.texteTertiaire,
      marginTop: espaces.sm,
      fontStyle: 'italic',
    },
  });

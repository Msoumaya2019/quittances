/**
 * État des lieux établi : ce qui reste à faire.
 *
 * Trois gestes, dans l'ordre où on les veut : **voir** le document, le
 * **partager**, et **revenir au logement**. Le partage passe par la feuille
 * native du système — messagerie, courriel, enregistrement dans les fichiers,
 * impression : c'est ce qui permet d'envoyer l'état des lieux au locataire, ou
 * de l'imprimer pour le faire signer à la main.
 *
 * Deux choses sont dites ici, et nulle part ailleurs au bon moment :
 *
 *  1. **Le nombre d'exemplaires.** La loi exige autant d'exemplaires que de
 *     parties : le locataire doit pouvoir repartir avec le sien le jour même.
 *  2. **Ce que vaut la signature.** Un tracé au doigt matérialise l'accord,
 *     comme un exemplaire signé à la main puis numérisé. Ce n'est pas une
 *     signature électronique qualifiée, et l'écran ne le laisse pas croire.
 *
 * L'écran rappelle aussi le droit du locataire de demander à compléter l'état
 * des lieux d'entrée dans les dix jours : c'est une information utile au
 * bailleur au moment où il vient de produire le document.
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
import { LIBELLE_TYPE_EDL, exemplairesNecessaires } from '@/domain/etat-des-lieux';
import type { PieceDossier } from '@/domain/types';
import { trouverPiece } from '@/db/repositories/pieces';
import { ouvrirDocument, partagerDocument } from '@/pdf/partage';
import type { DonneesEdl } from '@/pdf/emettre-etat-des-lieux';
import { useStyles, type Couleurs } from '@/ui/theme';

export default function EcranSuccesEtatDesLieux() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { pieceId, logementId } = useLocalSearchParams<{
    pieceId?: string;
    logementId?: string;
  }>();

  const [piece, setPiece] = useState<PieceDossier | null>(null);
  const [donnees, setDonnees] = useState<DonneesEdl | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<'voir' | 'partager' | null>(null);

  useEffect(() => {
    let actif = true;

    void (async () => {
      if (!pieceId) {
        if (actif) {
          setErreur("L'état des lieux établi n'a pas pu être retrouvé.");
          setChargement(false);
        }
        return;
      }
      try {
        const trouve = await trouverPiece(pieceId);
        if (!actif) return;
        setPiece(trouve);
        if (!trouve) {
          setErreur('Ce document est introuvable : il a peut-être été retiré du dossier.');
        } else {
          try {
            setDonnees(JSON.parse(trouve.donnees) as DonneesEdl);
          } catch {
            // Le document existe : ne pas savoir relire ses valeurs ne doit pas
            // empêcher de l'ouvrir ou de le partager.
            setDonnees(null);
          }
        }
      } catch {
        if (actif) setErreur("L'état des lieux n'a pas pu être relu.");
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

  const titre = donnees ? LIBELLE_TYPE_EDL[donnees.type] : 'État des lieux';
  const locataires = donnees ? donnees.signatures.length : 0;
  const exemplaires = donnees ? exemplairesNecessaires(locataires) : 0;
  const sansEtat = donnees ? donnees.synthese.aRenseigner : 0;

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
          titre="État des lieux établi"
          actionLibelle="Terminer"
          actionOnPress={() => router.replace('/documents')}
        />

        <AnimationReussite titre="État des lieux établi" sousTitre={titre} />

        {erreur ? (
          <BandeauMessage ton="erreur" message={erreur} onFermer={() => setErreur(null)} />
        ) : null}

        {chargement ? (
          <Text style={styles.chargement}>Relance du document…</Text>
        ) : !piece ? (
          <EcranVide
            titre="Document introuvable"
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
              <LigneDetail libelle="Date portée" valeur={formaterDateFr(piece.dateDocument)} />
              {donnees ? (
                <>
                  <LigneDetail
                    libelle="Éléments décrits"
                    valeur={String(donnees.synthese.total)}
                  />
                  <LigneDetail
                    libelle="Photos imprimées"
                    valeur={String(donnees.synthese.photos)}
                  />
                  {sansEtat > 0 ? (
                    <LigneDetail
                      libelle="Éléments sans état relevé"
                      valeur={String(sansEtat)}
                      accentuee
                    />
                  ) : null}
                  <LigneDetail
                    libelle="Signatures recueillies"
                    valeur={String(donnees.signatures.length)}
                  />
                  {donnees.type === 'sortie' ? (
                    <LigneDetail
                      libelle="Évolutions constatées"
                      valeur={String(donnees.evolutions)}
                      accentuee
                    />
                  ) : null}
                </>
              ) : null}
              <Text style={styles.note}>
                Le PDF est rangé dans le dossier du logement, sous le locataire en place. Il y
                restera même après le départ du locataire.
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

            {donnees?.type === 'entree' ? (
              <Carte>
                <Text style={styles.section}>À savoir sur l’état des lieux d’entrée</Text>
                <Text style={styles.note}>
                  Le locataire peut demander à le compléter dans les dix jours qui suivent sa
                  remise, comme la loi le prévoit. Le document lui-même reprend cette mention sous
                  les observations.
                </Text>
                <Text style={styles.note}>
                  {exemplaires} exemplaire{exemplaires > 1 ? 's' : ''} à remettre : la loi exige
                  autant d’exemplaires que de parties. Le locataire repart avec le sien le jour
                  même.
                </Text>
              </Carte>
            ) : null}

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

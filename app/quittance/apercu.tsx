/**
 * Aperçu et émission d'un document.
 *
 * Cet écran applique la promesse du « un clic » : quand toutes les informations
 * sont connues et que le loyer est réglé, la génération démarre d'elle-même et
 * l'utilisateur n'a plus qu'à confirmer. S'il manque quelque chose, l'écran
 * explique quoi, en français, et propose l'action adaptée.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BandeauMessage } from '@/ui/components/BandeauMessage';
import { Bouton } from '@/ui/components/Bouton';
import { Carte } from '@/ui/components/Carte';
import { EnTeteEcran } from '@/ui/components/EnTeteEcran';
import { LigneDetail } from '@/ui/components/LigneDetail';
import { PastilleStatut } from '@/ui/components/PastilleStatut';
import { couleurs, espaces, typographie } from '@/ui/tokens';
import { formatMontant } from '@/domain/money';
import { libelleLongCapitalise, depuisCle, formaterDateFr } from '@/domain/period';
import { LIBELLE_DOCUMENT, type Document, type TypeDocument } from '@/domain/types';
import { emettreDocument, diagnostiquerMois, ErreurEmission } from '@/pdf/render';
import { ouvrirDocument, partagerDocument } from '@/pdf/partage';
import { trouverDocument } from '@/db/repositories/documents';
import { useApplication } from '@/state/ApplicationContext';

type TypeDemande = TypeDocument | 'auto';

export default function EcranApercuQuittance() {
  const insets = useSafeAreaInsets();
  const { rafraichir, reglages } = useApplication();

  const parametres = useLocalSearchParams<{
    logementId?: string;
    periode?: string;
    type?: TypeDemande;
    documentId?: string;
  }>();

  const [chargement, setChargement] = useState(true);
  const [emission, setEmission] = useState(false);
  const [diagnostic, setDiagnostic] = useState<{
    peutQuittance: boolean;
    peutRecu: boolean;
    peutAvis: boolean;
    explication: string;
  } | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const periode = parametres.periode ?? '';
  const mois = depuisCle(periode);
  const typeDemande: TypeDemande = parametres.type ?? 'auto';

  // --- Consultation d'un document existant ------------------------------
  useEffect(() => {
    if (!parametres.documentId) return;

    let actif = true;
    (async () => {
      try {
        const trouve = await trouverDocument(parametres.documentId as string);
        if (!actif) return;
        setDocument(trouve);
        setChargement(false);
      } catch (e) {
        if (!actif) return;
        setErreur(
          e instanceof Error
            ? `Ce document n'a pas pu être ouvert : ${e.message}`
            : "Ce document n'a pas pu être ouvert.",
        );
        setChargement(false);
      }
    })();

    return () => {
      actif = false;
    };
  }, [parametres.documentId]);

  // --- Diagnostic du mois, pour proposer le bon document ----------------
  useEffect(() => {
    if (!parametres.logementId || !periode || parametres.documentId) return;

    let actif = true;
    (async () => {
      try {
        const resultat = await diagnostiquerMois(parametres.logementId as string, periode);
        if (!actif) return;
        setDiagnostic(resultat);
        setChargement(false);
      } catch (e) {
        if (!actif) return;
        setErreur(
          e instanceof Error
            ? e.message
            : "L'état de ce mois n'a pas pu être vérifié.",
        );
        setChargement(false);
      }
    })();

    return () => {
      actif = false;
    };
  }, [parametres.logementId, parametres.documentId, periode]);

  /** Type de document retenu, selon la demande et l'état réel du mois. */
  const typeRetenu: TypeDocument | null = (() => {
    if (!diagnostic) return null;
    if (typeDemande !== 'auto') {
      if (typeDemande === 'quittance' && !diagnostic.peutQuittance) {
        // La demande ne peut pas être satisfaite : on retombe sur ce qui est
        // légitime, sans jamais produire une quittance infondée.
        if (diagnostic.peutRecu) return 'recu';
        if (diagnostic.peutAvis) return 'avis_echeance';
        return null;
      }
      if (typeDemande === 'recu' && !diagnostic.peutRecu) {
        if (diagnostic.peutQuittance) return 'quittance';
        return null;
      }
      if (typeDemande === 'avis_echeance' && !diagnostic.peutAvis) return null;
      return typeDemande;
    }

    if (diagnostic.peutQuittance) return 'quittance';
    if (diagnostic.peutRecu) return 'recu';
    if (diagnostic.peutAvis) return 'avis_echeance';
    return null;
  })();

  const generer = useCallback(async () => {
    if (!parametres.logementId || !periode || !typeRetenu) return;

    setEmission(true);
    setErreur(null);

    try {
      const produit = await emettreDocument({
        logementId: parametres.logementId,
        periode,
        type: typeRetenu,
      });

      setDocument(produit);
      rafraichir();

      // On enchaîne sur l'écran de confirmation, qui propose les actions.
      router.replace({
        pathname: '/quittance/succes',
        params: { documentId: produit.id },
      });
    } catch (e) {
      setErreur(
        e instanceof ErreurEmission
          ? e.message
          : "Le document n'a pas pu être généré. Réessayez dans un instant.",
      );
    } finally {
      setEmission(false);
    }
  }, [parametres.logementId, periode, rafraichir, typeRetenu]);

  // --- Affichage --------------------------------------------------------

  if (chargement) {
    return (
      <View style={[styles.centreur, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={couleurs.vert} />
        <Text style={[typographie.corps, styles.texteChargement]}>
          Vérification du mois…
        </Text>
      </View>
    );
  }

  // Consultation d'un document déjà émis
  if (document) {
    return (
      <View style={styles.plein}>
        <ScrollView
          contentContainerStyle={[
            styles.contenu,
            { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + espaces.xxl },
          ]}
        >
          <EnTeteEcran
            titre={LIBELLE_DOCUMENT[document.type]}
            sousTitre={`N° ${document.numero}`}
          />

          <Carte style={styles.carteRecap}>
            <Text style={[typographie.titreCarte, styles.titreCarte]}>
              {document.logementNom}
            </Text>
            <Text style={[typographie.petit, styles.sousTitreCarte]}>
              {libellePeriode(document.periode)}
            </Text>

            <View style={styles.separateur} />

            <LigneDetail libelle="Locataire" valeur={document.titulaires.join(', ')} />
            <LigneDetail
              libelle="Loyer"
              valeur={formatMontant(document.loyer, { decimales: 'auto' })}
            />
            <LigneDetail
              libelle="Charges"
              valeur={formatMontant(document.charges, { decimales: 'auto' })}
            />
            <LigneDetail
              libelle="Total"
              valeur={formatMontant(document.total, { decimales: 'auto' })}
              accentuee
            />
            {document.datesPaiement.length > 0 ? (
              <LigneDetail
                libelle={document.datesPaiement.length > 1 ? 'Paiements' : 'Paiement'}
                valeur={document.datesPaiement.map(formaterDateFr).join(', ')}
              />
            ) : null}
            <LigneDetail libelle="Émis le" valeur={formaterDateFr(document.dateEmission)} />
          </Carte>

          <View style={styles.actions}>
            <Bouton
              libelle="Voir le PDF"
              onPress={() => void ouvrirDocument(document.cheminFichier)}
            />
            <Bouton
              libelle="Partager"
              variante="secondaire"
              onPress={() => void partagerDocument(document.cheminFichier, document.numero)}
            />
            <Bouton libelle="Terminer" variante="discret" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </View>
    );
  }

  // Le mois ne donne lieu à aucun document
  if (!typeRetenu) {
    return (
      <View style={[styles.plein, { paddingTop: insets.top + espaces.sm }]}>
        <EnTeteEcran titre="Aucun document possible" />
        <View style={styles.contenu}>
          <BandeauMessage
            ton="information"
            message={
              diagnostic?.explication ??
              "Ce mois ne donne lieu à aucun document pour le moment."
            }
          />
          <Bouton
            libelle="Revenir à l’accueil"
            variante="secondaire"
            onPress={() => router.back()}
          />
        </View>
      </View>
    );
  }

  const libelleDocument = LIBELLE_DOCUMENT[typeRetenu];
  const estDegrade = typeDemande !== 'auto' && typeDemande !== typeRetenu;

  return (
    <View style={styles.plein}>
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + espaces.xxl },
        ]}
      >
        <EnTeteEcran
          titre={`Générer ${libelleDocument.toLowerCase()}`}
          sousTitre={mois ? libelleLongCapitalise(mois) : undefined}
        />

        {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

        {estDegrade ? (
          <BandeauMessage
            ton="avertissement"
            message={`${diagnostic?.explication ?? ''} Un ${libelleDocument.toLowerCase()} vous est donc proposé à la place.`}
          />
        ) : (
          <BandeauMessage
            ton={typeRetenu === 'quittance' ? 'succes' : 'information'}
            message={diagnostic?.explication ?? ''}
          />
        )}

        <Carte style={styles.carteRecap}>
          <View style={styles.ligneEntete}>
            <Text style={[typographie.titreCarte, styles.titreCarte]}>
              {dossierNomDocument(typeRetenu)}
            </Text>
            <PastilleStatut
              statut={typeRetenu === 'quittance' ? 'paye' : typeRetenu === 'recu' ? 'partiel' : 'attente'}
            />
          </View>

          <Text style={[typographie.petit, styles.sousTitreCarte]}>
            {mois ? libelleLongCapitalise(mois) : ''}
          </Text>

          <View style={styles.separateur} />

          <LigneDetail libelle="Modèle" valeur={reglages.modeleParDefaut === 'moderne' ? 'Moderne et épuré' : 'Classique et professionnel'} />
          <LigneDetail
            libelle="Signature du bailleur"
            valeur={reglages.signatureActive && reglages.signatureBase64 ? 'Apposée' : 'Non apposée'}
          />
        </Carte>

        <View style={styles.actions}>
          <Bouton
            libelle={`Générer ${libelleDocument.toLowerCase()}`}
            onPress={() => void generer()}
            occupe={emission}
          />
          <Bouton
            libelle="Annuler"
            variante="discret"
            desactive={emission}
            onPress={() => router.back()}
          />
        </View>

        <Text style={[typographie.petit, styles.note]}>
          Le document est produit sur votre téléphone, sans envoi sur Internet. Vous pourrez
          l’enregistrer, le partager ou l’imprimer juste après.
        </Text>
      </ScrollView>
    </View>
  );
}

function dossierNomDocument(type: TypeDocument): string {
  return LIBELLE_DOCUMENT[type];
}

function libellePeriode(cle: string): string {
  const p = depuisCle(cle);
  return p ? libelleLongCapitalise(p) : cle;
}

const styles = StyleSheet.create({
  plein: {
    flex: 1,
    backgroundColor: couleurs.fond,
  },
  centreur: {
    flex: 1,
    backgroundColor: couleurs.fond,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.lg,
  },
  texteChargement: {
    color: couleurs.texteSecondaire,
  },
  contenu: {
    paddingHorizontal: espaces.lg,
    gap: espaces.lg,
  },
  carteRecap: {
    gap: espaces.sm,
  },
  ligneEntete: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: espaces.md,
  },
  titreCarte: {
    flex: 1,
    color: couleurs.texte,
  },
  sousTitreCarte: {
    color: couleurs.texteTertiaire,
  },
  separateur: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: couleurs.bordure,
    marginVertical: espaces.sm,
  },
  actions: {
    gap: espaces.sm,
  },
  note: {
    color: couleurs.texteTertiaire,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: espaces.md,
  },
});

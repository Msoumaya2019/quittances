/**
 * Aperçu et émission d'une quittance.
 *
 * Deux entrées mènent ici :
 *  - par la liste des documents, avec `documentId` : l'écran **consulte** un
 *    document déjà émis, sans rien produire de nouveau ;
 *  - par la liste des logements, avec `logementId` et `periode` : l'écran
 *    **diagnostique** le mois. Si le loyer est intégralement réglé, il propose
 *    la génération ; sinon il dit ce qui manque et propose de l'enregistrer.
 *
 * La génération en un appui vit dans l'onglet Quittance : cet écran est le
 * chemin de rattrapage, celui où l'on vérifie avant d'émettre.
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
import { espaces, typographie } from '@/ui/tokens';
import { formatMontant } from '@/domain/money';
import { libelleLongCapitalise, depuisCle, formaterDateFr } from '@/domain/period';
import { LIBELLE_DOCUMENT, LIBELLE_MODELE, type Document } from '@/domain/types';
import {
  emettreDocument,
  diagnostiquerMois,
  ErreurEmission,
  type DiagnosticMois,
} from '@/pdf/render';
import { ouvrirDocument, partagerDocument } from '@/pdf/partage';
import { trouverDocument } from '@/db/repositories/documents';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, useCouleurs, type Couleurs } from '@/ui/theme';

export default function EcranApercuQuittance() {
  const styles = useStyles(creerStyles);
  const couleurs = useCouleurs();
  const insets = useSafeAreaInsets();
  const { rafraichir, reglages } = useApplication();

  const parametres = useLocalSearchParams<{
    logementId?: string;
    periode?: string;
    documentId?: string;
  }>();

  const [chargement, setChargement] = useState(true);
  const [emission, setEmission] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticMois | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const periode = parametres.periode ?? '';
  const mois = depuisCle(periode);

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

  // --- Diagnostic du mois ------------------------------------------------
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

  const generer = useCallback(async () => {
    if (!parametres.logementId || !periode) return;

    setEmission(true);
    setErreur(null);

    try {
      const produit = await emettreDocument({
        logementId: parametres.logementId,
        periode,
        type: 'quittance',
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
          : "La quittance n'a pas pu être générée. Réessayez dans un instant.",
      );
    } finally {
      setEmission(false);
    }
  }, [parametres.logementId, periode, rafraichir]);

  const enregistrerLePaiement = useCallback(() => {
    if (!parametres.logementId || !periode) return;
    router.push({
      pathname: '/paiement/[propertyId]',
      params: { propertyId: parametres.logementId, periode },
    });
  }, [parametres.logementId, periode]);

  // --- Affichage --------------------------------------------------------

  if (chargement) {
    return (
      <View style={[styles.centreur, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={couleurs.accent} />
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

  // Le mois ne peut pas encore donner lieu à une quittance
  if (!diagnostic?.peutQuittance) {
    return (
      <View style={styles.plein}>
        <ScrollView
          contentContainerStyle={[
            styles.contenu,
            { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + espaces.xxl },
          ]}
        >
          <EnTeteEcran
            titre="Pas encore de quittance"
            sousTitre={mois ? libelleLongCapitalise(mois) : undefined}
          />

          {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

          <BandeauMessage
            ton="information"
            message={
              diagnostic?.explication ??
              "Ce mois ne donne lieu à aucune quittance pour le moment."
            }
          />

          <View style={styles.actions}>
            {parametres.logementId && periode ? (
              <Bouton
                libelle="Enregistrer le paiement"
                onPress={enregistrerLePaiement}
              />
            ) : null}
            <Bouton libelle="Retour" variante="discret" onPress={() => router.back()} />
          </View>

          <Text style={[typographie.petit, styles.note]}>
            Une quittance atteste un règlement intégral. Tant qu’il manque un
            encaissement, l’application ne peut pas en produire : c’est la règle
            qui protège le bailleur comme le locataire.
          </Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.plein}>
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + espaces.xxl },
        ]}
      >
        <EnTeteEcran
          titre="Générer la quittance"
          sousTitre={mois ? libelleLongCapitalise(mois) : undefined}
        />

        {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

        <BandeauMessage ton="succes" message={diagnostic.explication} />

        <Carte style={styles.carteRecap}>
          <View style={styles.ligneEntete}>
            <Text style={[typographie.titreCarte, styles.titreCarte]}>
              {LIBELLE_DOCUMENT.quittance}
            </Text>
            <PastilleStatut statut="paye" />
          </View>

          <Text style={[typographie.petit, styles.sousTitreCarte]}>
            {mois ? libelleLongCapitalise(mois) : ''}
          </Text>

          <View style={styles.separateur} />

          <LigneDetail libelle="Modèle" valeur={LIBELLE_MODELE[reglages.modeleParDefaut]} />
          <LigneDetail
            libelle="Signature du bailleur"
            valeur={reglages.signatureActive && reglages.signatureBase64 ? 'Apposée' : 'Non apposée'}
          />
        </Carte>

        <View style={styles.actions}>
          <Bouton
            libelle="Générer la quittance"
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

function libellePeriode(cle: string): string {
  const p = depuisCle(cle);
  return p ? libelleLongCapitalise(p) : cle;
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
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

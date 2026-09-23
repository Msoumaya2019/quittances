/**
 * Écran de confirmation après génération.
 *
 * « ✅ Quittance générée avec succès ! » puis trois grands boutons :
 * voir le PDF, partager, terminer. Le partage passe par la feuille native du
 * système : mail, messagerie, enregistrement dans les fichiers, impression.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimationReussite } from '@/ui/components/AnimationReussite';
import { BandeauMessage } from '@/ui/components/BandeauMessage';
import { Bouton } from '@/ui/components/Bouton';
import { Carte } from '@/ui/components/Carte';
import { LigneDetail } from '@/ui/components/LigneDetail';
import { espaces, typographie } from '@/ui/tokens';
import { formatMontant } from '@/domain/money';
import { libelleLongCapitalise, depuisCle, formaterDateFr } from '@/domain/period';
import { LIBELLE_DOCUMENT, type Document } from '@/domain/types';
import { trouverDocument } from '@/db/repositories/documents';
import { ouvrirDocument, partagerDocument } from '@/pdf/partage';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, useCouleurs, type Couleurs } from '@/ui/theme';

export default function EcranSucces() {
  const styles = useStyles(creerStyles);
  const couleurs = useCouleurs();
  const insets = useSafeAreaInsets();
  const { reglages } = useApplication();
  const { documentId } = useLocalSearchParams<{ documentId: string }>();

  const [document, setDocument] = useState<Document | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messagePartage, setMessagePartage] = useState<string | null>(null);
  const [actionEnCours, setActionEnCours] = useState<'voir' | 'partager' | null>(null);

  useEffect(() => {
    let actif = true;

    (async () => {
      try {
        const trouve = await trouverDocument(documentId as string);
        if (!actif) return;
        if (!trouve) {
          setErreur("Ce document est introuvable. Il a peut-être été supprimé.");
        }
        setDocument(trouve);
      } catch {
        if (actif) setErreur("Ce document n'a pas pu être relu.");
      }
    })();

    return () => {
      actif = false;
    };
  }, [documentId]);

  const voir = async () => {
    if (!document) return;
    setActionEnCours('voir');
    setMessagePartage(null);
    try {
      const ouvert = await ouvrirDocument(document.cheminFichier);
      if (!ouvert) {
        setMessagePartage(
          "Le fichier PDF n'est plus présent sur l'appareil. Le document reste enregistré, mais son fichier ne peut plus être ouvert. Si vous l'aviez partagé, vous le retrouverez là où vous l'avez enregistré.",
        );
      }
    } catch {
      setMessagePartage("Le PDF n'a pas pu être ouvert par votre lecteur.");
    } finally {
      setActionEnCours(null);
    }
  };

  const partager = async () => {
    if (!document) return;
    setActionEnCours('partager');
    setMessagePartage(null);
    try {
      const envoye = await partagerDocument(document.cheminFichier, document.numero);
      if (!envoye) {
        setMessagePartage(
          "Le fichier PDF n'est plus présent sur l'appareil. Le document reste enregistré, mais son fichier ne peut plus être ouvert. Si vous l'aviez partagé, vous le retrouverez là où vous l'avez enregistré.",
        );
      }
    } catch (e) {
      setMessagePartage(
        e instanceof Error
          ? e.message
          : 'Le partage a échoué. Vérifiez qu’une application peut recevoir des fichiers.',
      );
    } finally {
      setActionEnCours(null);
    }
  };

  const terminer = () => {
    router.dismissAll();
    router.replace('/(tabs)');
  };

  if (!document && !erreur) {
    return (
      <View style={[styles.centreur, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={couleurs.accent} />
      </View>
    );
  }

  const mois = document ? depuisCle(document.periode) : null;
  const estQuittance = document?.type === 'quittance';

  return (
    <View style={styles.plein}>
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.xxl, paddingBottom: insets.bottom + espaces.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {erreur ? (
          <>
            <BandeauMessage ton="erreur" message={erreur} />
            <Bouton libelle="Revenir à l’accueil" onPress={terminer} />
          </>
        ) : (
          <>
            <AnimationReussite
              titre={
                estQuittance
                  ? 'Quittance générée avec succès !'
                  : `${LIBELLE_DOCUMENT[document!.type]} généré avec succès !`
              }
              sousTitre={document!.logementNom}
              teinte={estQuittance ? couleurs.accent : couleurs.orange}
            />

            <Carte style={styles.carte}>
              <Text style={[typographie.titreCarte, styles.numero]}>
                N° {document!.numero}
              </Text>
              <LigneDetail
                libelle="Période"
                valeur={mois ? libelleLongCapitalise(mois) : document!.periode}
              />
              <LigneDetail
                libelle="Locataire"
                valeur={document!.titulaires.join(', ')}
              />
              <LigneDetail
                libelle="Loyer"
                valeur={formatMontant(document!.loyer, { decimales: 'auto' })}
              />
              <LigneDetail
                libelle="Charges"
                valeur={formatMontant(document!.charges, { decimales: 'auto' })}
              />
              <LigneDetail
                libelle={estQuittance ? 'Total réglé' : 'Montant'}
                valeur={formatMontant(document!.total, { decimales: 'auto' })}
                accentuee
                teinte={estQuittance ? couleurs.accentFonce : couleurs.orange}
              />
              <LigneDetail
                libelle="Émis le"
                valeur={formaterDateFr(document!.dateEmission)}
              />
            </Carte>

            {messagePartage ? (
              <BandeauMessage ton="avertissement" message={messagePartage} />
            ) : null}

            <View style={styles.actions}>
              <Bouton
                libelle="Voir le PDF"
                onPress={() => void voir()}
                occupe={actionEnCours === 'voir'}
                desactive={actionEnCours !== null}
              />
              <Bouton
                libelle="Partager"
                variante="secondaire"
                onPress={() => void partager()}
                occupe={actionEnCours === 'partager'}
                desactive={actionEnCours !== null}
              />
              <Bouton
                libelle="Terminer"
                variante="discret"
                onPress={terminer}
                desactive={actionEnCours !== null}
              />
            </View>

            <Text style={[typographie.petit, styles.note]}>
              L’envoi par e-mail, par messagerie ou l’impression dépendent des applications
              installées sur votre téléphone et d’une connexion réseau. Le document est
              également conservé dans l’onglet Quittances.
            </Text>

            {reglages.rappelPaiements ? (
              <Text style={[typographie.petit, styles.note]}>
                Un rappel des loyers non réglés est activé dans vos réglages.
              </Text>
            ) : null}
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
  centreur: {
    flex: 1,
    backgroundColor: couleurs.fond,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contenu: {
    paddingHorizontal: espaces.lg,
    gap: espaces.xl,
  },
  carte: {
    gap: espaces.xs,
  },
  numero: {
    color: couleurs.texte,
    marginBottom: espaces.sm,
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

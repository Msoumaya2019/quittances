/**
 * Créer un bail : choisir le logement.
 *
 * Depuis l'onglet DOCUMENTS, on ne part pas d'un logement mais d'un besoin —
 * « je veux établir un bail ». Il faut donc d'abord désigner les lieux, et cet
 * écran le fait en une liste.
 *
 * Il ne montre que les logements **qui peuvent recevoir un bail** : ceux dont la
 * location est en cours, donc avec un locataire nommé. Un logement sans
 * locataire n'est pas listé comme un simple refus : il est listé à part, avec la
 * raison et le geste qui débloque. Une liste filtrée en silence ferait croire
 * que le logement a disparu.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { BandeauMessage, Carte, EcranVide, EnTeteEcran } from '@/ui/components';
import { espaces, rayons, typographie } from '@/ui/tokens';
import { adresseEnLignes, nomComplet } from '@/domain/types';
import type { Bail, Logement, TitulaireBail } from '@/domain/types';
import { lireBrouillon } from '@/db/repositories/brouillons';
import {
  bailEnCours,
  listerLogements,
  titulairesDuBail,
} from '@/db/repositories/properties';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, type Couleurs } from '@/ui/theme';

interface Ligne {
  logement: Logement;
  bail: Bail | null;
  titulaires: TitulaireBail[];
  /** Vrai quand un brouillon de bail attend d'être repris. */
  enCours: boolean;
}

export default function EcranChoisirLogementBail() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { cleRafraichissement } = useApplication();

  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const logements = await listerLogements();
      const lues = await Promise.all(
        logements.map(async (logement) => {
          const bail = await bailEnCours(logement.id);
          const [titulaires, brouillon] = await Promise.all([
            bail ? titulairesDuBail(bail.id) : Promise.resolve([]),
            lireBrouillon(logement.id, 'bail'),
          ]);
          return { logement, bail, titulaires, enCours: brouillon !== null };
        }),
      );
      setLignes(lues);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Les logements n’ont pas pu être lus.');
    } finally {
      setChargement(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger, cleRafraichissement]),
  );

  const prets = useMemo(() => lignes.filter((l) => l.bail !== null), [lignes]);
  const incomplets = useMemo(() => lignes.filter((l) => l.bail === null), [lignes]);

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
          titre="Créer un bail"
          sousTitre="Choisissez le logement"
          actionLibelle="Fermer"
          actionOnPress={() => router.back()}
        />

        {erreur ? <BandeauMessage ton="erreur" message={erreur} onFermer={() => setErreur(null)} /> : null}

        {chargement ? (
          <Text style={styles.chargement}>Lecture des logements…</Text>
        ) : lignes.length === 0 ? (
          <EcranVide
            titre="Aucun logement"
            message="Un bail se rattache à un logement. Ajoutez d’abord un logement et son locataire."
            illustration="maison"
            actionLibelle="Ajouter un logement"
            actionOnPress={() => router.push('/logement/nouveau')}
          />
        ) : (
          <>
            {prets.length > 0 ? (
              <Carte>
                <Text style={styles.section}>
                  {prets.length} logement{prets.length > 1 ? 's' : ''} prêt
                  {prets.length > 1 ? 's' : ''}
                </Text>
                <Text style={styles.aide}>
                  Le bail reprendra l’adresse, le propriétaire, les locataires et le loyer sans que
                  vous ayez à les ressaisir.
                </Text>

                {prets.map((l) => (
                  <Pressable
                    key={l.logement.id}
                    onPress={() =>
                      router.push({
                        pathname: '/bail/nouveau',
                        params: { logementId: l.logement.id },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Créer le bail du logement ${l.logement.nom}`}
                    accessibilityHint="Ouvre le formulaire guidé en neuf étapes."
                    style={({ pressed }) => [styles.ligne, pressed && styles.ligneAppuyee]}
                  >
                    <View style={styles.textes}>
                      <Text style={[typographie.corpsAppuye, styles.titre]}>
                        {l.logement.nom}
                      </Text>
                      <Text style={[typographie.petit, styles.detail]}>
                        {l.titulaires.length > 0
                          ? l.titulaires.map(nomComplet).join(', ')
                          : 'Locataire enregistré'}
                      </Text>
                      <Text style={[typographie.petit, styles.detail]}>
                        {adresseEnLignes(l.logement).slice(-1)[0]}
                      </Text>
                    </View>
                    {l.enCours ? (
                      <Text style={styles.reprise}>Brouillon en cours</Text>
                    ) : null}
                  </Pressable>
                ))}
              </Carte>
            ) : null}

            {incomplets.length > 0 ? (
              <Carte>
                <Text style={styles.section}>Sans locataire</Text>
                <Text style={styles.aide}>
                  Un bail doit nommer les personnes qui s’engagent. Ces logements n’ont pas de
                  locataire en place : ajoutez-le, puis le bail reprendra son identité.
                </Text>
                {incomplets.map((l) => (
                  <Pressable
                    key={l.logement.id}
                    onPress={() =>
                      router.push({
                        pathname: '/logement/[id]/locataires',
                        params: { id: l.logement.id },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Ajouter un locataire au logement ${l.logement.nom}`}
                    style={({ pressed }) => [styles.ligne, pressed && styles.ligneAppuyee]}
                  >
                    <View style={styles.textes}>
                      <Text style={[typographie.corpsAppuye, styles.titre]}>
                        {l.logement.nom}
                      </Text>
                      <Text style={[typographie.petit, styles.detail]}>
                        Ajouter un locataire
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </Carte>
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
      marginBottom: espaces.sm,
    },
    ligne: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaces.md,
      paddingVertical: espaces.md,
      borderRadius: rayons.md,
    },
    ligneAppuyee: {
      backgroundColor: couleurs.fondSurvol,
    },
    textes: {
      flex: 1,
      gap: 2,
    },
    titre: {
      color: couleurs.texte,
    },
    detail: {
      color: couleurs.texteSecondaire,
    },
    reprise: {
      ...typographie.minuscule,
      color: couleurs.accentFonce,
      textTransform: 'uppercase',
    },
  });

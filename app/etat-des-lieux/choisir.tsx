/**
 * Faire un état des lieux : choisir le logement.
 *
 * Depuis l'onglet DOCUMENTS, on ne part pas d'un logement mais d'un besoin —
 * « je veux faire un état des lieux ». Il faut donc d'abord désigner les lieux,
 * et cet écran le fait en une liste.
 *
 * Il ne montre que les logements **qui peuvent recevoir un état des lieux** :
 * ceux dont la location est en cours, donc avec un locataire nommé. Un état des
 * lieux constate l'état d'un logement **pour quelqu'un** : sans locataire, il
 * ne constate rien pour personne. Les logements sans locataire ne sont pas
 * filtrés en silence — ils sont listés à part, avec la raison et le geste qui
 * débloque, parce qu'une liste filtrée ferait croire que le logement a disparu.
 *
 * Cet écran ne fabrique rien : il désigne. Le formulaire guidé en six étapes
 * prend le relais, et il reprend du logement tout ce qui est déjà enregistré —
 * adresse, propriétaire, locataire, loyer.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { BandeauMessage, Carte, EcranVide, EnTeteEcran } from '@/ui/components';
import { espaces, rayons, typographie } from '@/ui/tokens';
import { adresseEnLignes, nomComplet } from '@/domain/types';
import type { Bail, Logement, TitulaireBail } from '@/domain/types';
import { LIBELLE_TYPE_EDL } from '@/domain/etat-des-lieux';
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
  /** Vrai quand un brouillon d'état des lieux attend d'être repris. */
  enCours: boolean;
}

export default function EcranChoisirLogementEtatDesLieux() {
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
            lireBrouillon(logement.id, 'etat_des_lieux'),
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

  // Un état des lieux nomme le locataire : seuls les logements dont la location
  // est en cours peuvent en recevoir un.
  const prets = useMemo(
    () => lignes.filter((l) => l.bail !== null && l.titulaires.length > 0),
    [lignes],
  );
  const incomplets = useMemo(
    () => lignes.filter((l) => l.bail === null || l.titulaires.length === 0),
    [lignes],
  );

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
          titre={LIBELLE_TYPE_EDL.entree}
          sousTitre="Choisissez le logement"
          actionLibelle="Fermer"
          actionOnPress={() => router.back()}
        />

        {erreur ? (
          <BandeauMessage ton="erreur" message={erreur} onFermer={() => setErreur(null)} />
        ) : null}

        {chargement ? (
          <Text style={styles.chargement}>Lecture des logements…</Text>
        ) : lignes.length === 0 ? (
          <EcranVide
            titre="Aucun logement"
            message="Un état des lieux se rattache à un logement. Ajoutez d’abord un logement et son locataire."
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
                  L’état des lieux reprendra l’adresse, le propriétaire, les locataires et le loyer
                  sans que vous ayez à les ressaisir. Les pièces et leurs éléments sont proposés par
                  défaut, et vous pourrez les modifier.
                </Text>

                {prets.map((l) => (
                  <Pressable
                    key={l.logement.id}
                    onPress={() =>
                      router.push({
                        pathname: '/etat-des-lieux/nouveau',
                        params: { logementId: l.logement.id },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Faire l’état des lieux du logement ${l.logement.nom}`}
                    accessibilityHint="Ouvre le formulaire guidé en six étapes."
                    style={({ pressed }) => [styles.ligne, pressed && styles.ligneAppuyee]}
                  >
                    <View style={styles.textes}>
                      <Text style={[typographie.corpsAppuye, styles.titre]}>
                        {l.logement.nom}
                      </Text>
                      <Text style={[typographie.petit, styles.detail]}>
                        {l.titulaires.map(nomComplet).join(', ')}
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
                <Text style={styles.section}>Sans locataire en place</Text>
                <Text style={styles.aide}>
                  Un état des lieux constate l’état du logement pour les personnes qui l’occupent.
                  Ces logements n’ont pas de location en cours : enregistrez le locataire, puis
                  l’état des lieux reprendra son identité.
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

/**
 * Liste des propriétaires.
 *
 * Un propriétaire peut posséder plusieurs logements. On montre donc, pour
 * chacun, combien de logements lui sont rattachés : c'est l'information qui
 * décide si on peut le supprimer.
 */

import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import {
  BandeauMessage,
  Bouton,
  BoutonFlottant,
  Carte,
  DialogueConfirmation,
  EcranVide,
  EnTeteEcran,
} from '@/ui/components';
import { espaces, typographie } from '@/ui/tokens';
import {
  adresseProprietaireSurUneLigne,
  compterLogementsDuProprietaire,
  listerProprietaires,
  supprimerProprietaire,
} from '@/db/repositories/owners';
import type { Proprietaire } from '@/domain/types';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, type Couleurs } from '@/ui/theme';

interface LigneProprietaire {
  proprietaire: Proprietaire;
  nombreLogements: number;
  adresse: string;
}

export default function EcranProprietaires() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { rafraichir } = useApplication();

  const [lignes, setLignes] = useState<LigneProprietaire[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<LigneProprietaire | null>(null);
  const [travail, setTravail] = useState(false);

  const charger = useCallback(async () => {
    try {
      const proprietaires = await listerProprietaires();
      const enrichis = await Promise.all(
        proprietaires.map(async (p) => ({
          proprietaire: p,
          nombreLogements: await compterLogementsDuProprietaire(p.id),
          adresse: adresseProprietaireSurUneLigne(p),
        })),
      );
      setLignes(enrichis);
      setErreur(null);
    } catch (e) {
      setErreur(
        e instanceof Error ? e.message : 'Impossible de lire les propriétaires pour le moment.',
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger]),
  );

  async function supprimer() {
    if (!aSupprimer) return;
    setTravail(true);
    try {
      await supprimerProprietaire(aSupprimer.proprietaire.id);
      rafraichir();
      await charger();
      setASupprimer(null);
    } catch (e) {
      // Le dépôt refuse volontairement la suppression d'un propriétaire qui a
      // encore des logements : son message est déjà rédigé pour l'utilisateur.
      setErreur(e instanceof Error ? e.message : 'La suppression a échoué.');
      setASupprimer(null);
    } finally {
      setTravail(false);
    }
  }

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
          titre="Propriétaires"
          sousTitre={
            lignes.length === 0 ? undefined : `${lignes.length} au total`
          }
        />

        {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

        {chargement && lignes.length === 0 ? (
          <Text style={styles.chargement}>Chargement…</Text>
        ) : lignes.length === 0 ? (
          <EcranVide
            titre="Aucun propriétaire"
            message="Les propriétaires se créent en même temps que les logements. Ajoutez un logement : vous pourrez y indiquer son propriétaire."
            illustration="maison"
            actionLibelle="Ajouter un logement"
            actionOnPress={() => router.push('/logement/nouveau')}
          />
        ) : (
          lignes.map((ligne) => (
            <Carte key={ligne.proprietaire.id}>
              <View style={styles.ligne}>
                <View style={styles.textes}>
                  <Text style={[typographie.titreCarte, styles.nom]} numberOfLines={1}>
                    {ligne.proprietaire.nom}
                  </Text>
                  <Text style={[typographie.petit, styles.detail]} numberOfLines={2}>
                    {ligne.adresse || 'Adresse non renseignée'}
                  </Text>
                  <Text style={[typographie.petit, styles.detail]}>
                    {ligne.nombreLogements === 0
                      ? 'Aucun logement rattaché'
                      : `${ligne.nombreLogements} ${ligne.nombreLogements > 1 ? 'logements' : 'logement'}`}
                  </Text>
                </View>
              </View>

              <View style={styles.actions}>
                <Bouton
                  libelle="Modifier"
                  variante="secondaire"
                  onPress={() =>
                    router.push({
                      pathname: '/proprietaire/[id]',
                      params: { id: ligne.proprietaire.id },
                    })
                  }
                />
                <Bouton
                  libelle="Supprimer"
                  variante="discret"
                  desactive={ligne.nombreLogements > 0}
                  onPress={() => setASupprimer(ligne)}
                />
              </View>

              {ligne.nombreLogements > 0 ? (
                <Text style={styles.note}>
                  Ce propriétaire possède encore des logements : il ne peut pas être supprimé.
                </Text>
              ) : null}
            </Carte>
          ))
        )}

        <Bouton
          libelle="Ajouter un propriétaire"
          variante="secondaire"
          onPress={() => router.push('/proprietaire/[id]')}
        />
      </ScrollView>

      <BoutonFlottant
        libelle="Ajouter"
        onPress={() => router.push('/proprietaire/[id]')}
      />

      <DialogueConfirmation
        visible={aSupprimer !== null}
        titre="Supprimer ce propriétaire ?"
        message="Il sera retiré de la liste. Cette action est définitive."
        libelleConfirmer="Oui, supprimer"
        danger
        occupe={travail}
        onConfirmer={supprimer}
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
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.md,
  },
  textes: {
    flex: 1,
  },
  nom: {
    color: couleurs.texte,
  },
  detail: {
    color: couleurs.texteSecondaire,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: espaces.md,
    marginTop: espaces.md,
  },
  note: {
    ...typographie.petit,
    color: couleurs.texteTertiaire,
    marginTop: espaces.sm,
  },
});

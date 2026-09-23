/**
 * Onglet LOGEMENTS.
 *
 * Tous les logements, y compris ceux sans locataire. C'est l'écran de gestion :
 * on y cherche, on y ouvre, on y ajoute. Les montants et les statuts du mois
 * affiché y figurent aussi, pour rester cohérent avec l'accueil.
 */

import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import {
  BandeauMessage,
  BoutonFlottant,
  Carte,
  Champ,
  EcranVide,
  EnTeteEcran,
  PastilleNeutre,
  PastilleStatut,
} from '@/ui/components';
import { couleurs, espaces, rayons, typographie } from '@/ui/tokens';
import { formatMontant } from '@/domain/money';
import { libelleLongCapitalise } from '@/domain/period';
import { nomComplet } from '@/domain/types';
import { useApplication } from '@/state/ApplicationContext';
import { useDonneesAccueil, type CarteLogement } from '@/hooks/useAccueil';

export default function EcranLogements() {
  const { mois, cleRafraichissement, rafraichir } = useApplication();
  const insets = useSafeAreaInsets();
  const donnees = useDonneesAccueil(mois, cleRafraichissement);

  const [recherche, setRecherche] = useState('');
  const [rafraichissement, setRafraichissement] = useState(false);

  useFocusEffect(
    useCallback(() => {
      rafraichir();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (!terme) return donnees.cartes;

    return donnees.cartes.filter((c) => {
      const locataire = c.titulaires[0] ? nomComplet(c.titulaires[0]) : '';
      const champs = [
        c.logement.nom,
        c.logement.ville,
        c.logement.adresse,
        c.logement.codePostal,
        c.logement.reference ?? '',
        locataire,
      ];
      return champs.some((v) => v.toLowerCase().includes(terme));
    });
  }, [donnees.cartes, recherche]);

  async function tirerPourRafraichir() {
    setRafraichissement(true);
    rafraichir();
    setRafraichissement(false);
  }

  return (
    <View style={styles.plein}>
      <FlatList
        data={filtres}
        keyExtractor={(item) => item.logement.id}
        contentContainerStyle={[
          styles.liste,
          { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + 100 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={rafraichissement}
            onRefresh={tirerPourRafraichir}
            tintColor={couleurs.vert}
            colors={[couleurs.vert]}
          />
        }
        ListHeaderComponent={
          <View style={styles.entete}>
            <EnTeteEcran
              titre="Logements"
              sousTitre={
                donnees.cartes.length === 0
                  ? undefined
                  : `${donnees.cartes.length} ${donnees.cartes.length > 1 ? 'logements' : 'logement'} — ${libelleLongCapitalise(mois)}`
              }
            />

            {donnees.erreur ? (
              <BandeauMessage
                ton="erreur"
                message={donnees.erreur}
                actionLibelle="Réessayer"
                actionOnPress={rafraichir}
              />
            ) : null}

            {donnees.cartes.length > 3 ? (
              <Champ
                libelle="Rechercher"
                valeur={recherche}
                onChangement={setRecherche}
                placeholder="Nom, locataire, ville…"
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => <LigneLogement donnees={item} />}
        ListEmptyComponent={
          donnees.chargement ? (
            <Text style={styles.chargement}>Chargement…</Text>
          ) : recherche.trim() ? (
            <EcranVide
              titre="Aucun résultat"
              message="Aucun logement ne correspond à cette recherche. Essayez un autre nom ou une autre ville."
              illustration="recherche"
              actionLibelle="Effacer la recherche"
              actionOnPress={() => setRecherche('')}
            />
          ) : (
            <EcranVide
              titre="Vos logements"
              message="Ajoutez votre premier logement pour commencer à générer des quittances en un clic."
              illustration="maison"
              actionLibelle="Ajouter mon premier logement"
              actionOnPress={() => router.push('/logement/nouveau')}
            />
          )
        }
      />

      <BoutonFlottant libelle="Ajouter" onPress={() => router.push('/logement/nouveau')} />
    </View>
  );
}

/** Une ligne compacte : nom, locataire, montant du mois, statut. */
function LigneLogement({ donnees }: { donnees: CarteLogement }) {
  const { logement, titulaires, montantDu, statut, bail } = donnees;
  const locataire = titulaires[0] ? nomComplet(titulaires[0]) : null;

  return (
    <Carte onPress={() => router.push({ pathname: '/logement/[id]', params: { id: logement.id } })}>
      <View style={styles.ligne}>
        <View style={styles.ligneTextes}>
          <Text style={[typographie.titreCarte, styles.nom]} numberOfLines={1}>
            {logement.nom}
          </Text>
          <Text style={[typographie.petit, styles.detail]} numberOfLines={1}>
            {locataire ?? 'Aucun locataire en place'}
          </Text>
          <Text style={[typographie.petit, styles.detail]} numberOfLines={1}>
            {logement.ville || logement.adresse}
          </Text>
        </View>

        <View style={styles.ligneDroite}>
          {bail ? (
            <>
              <Text style={[typographie.corpsAppuye, styles.montant]}>
                {formatMontant(montantDu.total, { decimales: 'auto' })}
              </Text>
              <PastilleStatut statut={statut} compacte />
            </>
          ) : (
            <PastilleNeutre libelle="Sans locataire" couleur={couleurs.texteTertiaire} />
          )}
        </View>
      </View>
    </Carte>
  );
}

const styles = StyleSheet.create({
  plein: {
    flex: 1,
    backgroundColor: couleurs.fond,
  },
  liste: {
    paddingHorizontal: espaces.lg,
    gap: espaces.md,
  },
  entete: {
    gap: espaces.lg,
    marginBottom: espaces.sm,
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
  ligneTextes: {
    flex: 1,
  },
  nom: {
    color: couleurs.texte,
  },
  detail: {
    color: couleurs.texteSecondaire,
    marginTop: 2,
  },
  ligneDroite: {
    alignItems: 'flex-end',
    gap: espaces.xs,
  },
  montant: {
    color: couleurs.texte,
  },
});

/**
 * ACCUEIL — l'écran le plus important.
 *
 * Il répond à une seule question : « qu'est-ce que je fais maintenant ? ».
 * Le tableau de bord résume le mois, chaque carte de logement porte son bouton
 * d'action direct, sans qu'il faille ouvrir quoi que ce soit.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CarteLogementItem } from '@/ui/components/CarteLogement';
import { BandeauMessage } from '@/ui/components/BandeauMessage';
import { Bouton } from '@/ui/components/Bouton';
import { Carte } from '@/ui/components/Carte';
import { EcranVide } from '@/ui/components/EcranVide';
import { Indicateur } from '@/ui/components/Indicateur';
import { Segments } from '@/ui/components/Segments';
import { BarreProgression } from '@/ui/components/BarreProgression';
import { FeuilleAction, type OptionFeuille } from '@/ui/components/FeuilleAction';
import { BoutonFlottant } from '@/ui/components/BoutonFlottant';
import { espaces, typographie } from '@/ui/tokens';
import { formatMontant } from '@/domain/money';
import { libelleLongCapitalise, decaler, versCle, depuisCle } from '@/domain/period';
import { useApplication } from '@/state/ApplicationContext';
import { useDonneesAccueil, type CarteLogement } from '@/hooks/useAccueil';
import type { StatutMois } from '@/domain/types';
import { useStyles, useCouleurs, type Couleurs } from '@/ui/theme';

type Filtre = 'tous' | 'payes' | 'attente' | 'impayes';

export default function EcranAccueil() {
  const styles = useStyles(creerStyles);
  const couleurs = useCouleurs();
  const insets = useSafeAreaInsets();
  const {
    mois,
    moisPrecedent,
    moisSuivant,
    revenirAuMoisCourant,
    estMoisCourant,
    cleRafraichissement,
    rafraichir,
    pret,
    erreurInitialisation,
  } = useApplication();

  const { cartes, statistiques, chargement, erreur } = useDonneesAccueil(
    mois,
    cleRafraichissement,
  );

  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [enRafraichissement, setEnRafraichissement] = useState(false);
  const [cartePourMoisPrecedent, setCartePourMoisPrecedent] = useState<CarteLogement | null>(null);

  // --- Filtrage ---------------------------------------------------------
  const cartesFiltrees = useMemo(() => {
    if (filtre === 'tous') return cartes;

    return cartes.filter((carte) => {
      if (filtre === 'payes') return carte.statut === 'paye';
      if (filtre === 'attente') return carte.statut === 'attente' || carte.statut === 'hors_bail';
      return carte.statut === 'retard' || carte.statut === 'partiel';
    });
  }, [cartes, filtre]);

  const compteurs = useMemo(() => {
    const compter = (statuts: StatutMois[]) =>
      cartes.filter((c) => statuts.includes(c.statut)).length;

    return {
      tous: cartes.length,
      payes: compter(['paye']),
      attente: compter(['attente', 'hors_bail']),
      impayes: compter(['retard', 'partiel']),
    };
  }, [cartes]);

  // --- Action principale d'une carte ------------------------------------
  const gererActionPrincipale = useCallback(
    (donnees: CarteLogement) => {
      const { action, logement, bail } = donnees;
      if (!bail) return;

      switch (action.type) {
        case 'generer_quittance':
          router.push({
            pathname: '/quittance/apercu',
            params: {
              logementId: logement.id,
              periode: versCle(mois),
              type: 'quittance',
            },
          });
          break;

        case 'voir_quittance':
        case 'voir_recu':
          router.push({
            pathname: '/quittance/apercu',
            params: {
              documentId: action.documentId,
            },
          });
          break;

        case 'enregistrer_paiement':
          router.push({
            pathname: '/paiement/[propertyId]',
            params: {
              propertyId: logement.id,
              periode: versCle(mois),
            },
          });
          break;

        case 'completer_paiement':
          router.push({
            pathname: '/paiement/[propertyId]',
            params: {
              propertyId: logement.id,
              periode: versCle(mois),
              montant: String(action.montantSuggere),
            },
          });
          break;

        default:
          router.push({ pathname: '/logement/[id]', params: { id: logement.id } });
      }
    },
    [mois],
  );

  const ouvrirLogement = useCallback((donnees: CarteLogement) => {
    router.push({ pathname: '/logement/[id]', params: { id: donnees.logement.id } });
  }, []);

  const rafraichirManuel = useCallback(async () => {
    setEnRafraichissement(true);
    rafraichir();
    // Court délai : laisse la base répondre avant de retirer l'indicateur.
    setTimeout(() => setEnRafraichissement(false), 420);
  }, [rafraichir]);

  // --- États de chargement et d'erreur ----------------------------------
  if (!pret && chargement) {
    return (
      <View style={styles.centreur}>
        <ActivityIndicator size="large" color={couleurs.accent} />
        <Text style={[typographie.corps, styles.texteChargement]}>
          Préparation de vos données…
        </Text>
      </View>
    );
  }

  if (erreurInitialisation || erreur) {
    return (
      <View style={[styles.centreur, { paddingTop: insets.top }]}>
        <BandeauMessage
          ton="erreur"
          message={erreurInitialisation ?? erreur ?? 'Une erreur est survenue.'}
        />
        <Bouton libelle="Réessayer" onPress={rafraichir} style={styles.boutonErreur} />
      </View>
    );
  }

  // --- Aucun logement : écran d'accueil chaleureux ----------------------
  if (!chargement && cartes.length === 0) {
    return (
      <View style={[styles.plein, { paddingTop: insets.top }]}>
        <EcranVide
          titre="Bienvenue dans vos quittances"
          message="Ajoutez votre premier logement, puis générez vos quittances d’un seul appui, chaque mois."
          illustration="maison"
          actionLibelle="Ajouter mon premier logement"
          actionOnPress={() => router.push('/logement/nouveau')}
        />
      </View>
    );
  }

  const moisDemande = cartePourMoisPrecedent ? decaler(mois, -1) : mois;

  return (
    <View style={styles.plein}>
      <FlatList
        data={cartesFiltrees}
        keyExtractor={(item) => item.logement.id}
        contentContainerStyle={[
          styles.liste,
          { paddingTop: insets.top + espaces.sm, paddingBottom: 120 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={enRafraichissement}
            onRefresh={() => void rafraichirManuel()}
            tintColor={couleurs.accent}
            colors={[couleurs.accent]}
          />
        }
        ListHeaderComponent={
          <EnTete
            moisLibelle={libelleLongCapitalise(mois)}
            estMoisCourant={estMoisCourant}
            statistiques={statistiques}
            filtre={filtre}
            compteurs={compteurs}
            onChangerFiltre={setFiltre}
            onPrecedent={moisPrecedent}
            onSuivant={moisSuivant}
            onAujourdhui={revenirAuMoisCourant}
          />
        }
        ListEmptyComponent={
          <View style={styles.videListe}>
            <EcranVide
              titre="Aucun logement dans ce filtre"
              message="Modifiez le filtre pour retrouver vos logements, ou changez de mois."
              illustration="recherche"
              actionLibelle="Voir tous les logements"
              actionOnPress={() => setFiltre('tous')}
            />
          </View>
        }
        renderItem={({ item }) => (
          <CarteLogementItem
            donnees={item}
            periode={mois}
            onActionPrincipale={gererActionPrincipale}
            onOuvrirLogement={ouvrirLogement}
            onGenererMoisPrecedent={setCartePourMoisPrecedent}
          />
        )}
      />

      <BoutonFlottant
        onPress={() => router.push('/logement/nouveau')}
        libelle="Ajouter un logement"
        bas={insets.bottom + 76}
      />

      {/* Choix du mois pour une quittance antérieure */}
      <FeuilleAction
        visible={cartePourMoisPrecedent !== null}
        titre="Quittance d’un mois précédent"
        message={
          cartePourMoisPrecedent
            ? `Choisissez le mois concerné pour ${cartePourMoisPrecedent.logement.nom}. Seuls les mois intégralement réglés permettent d’obtenir une quittance ; sinon, l’application vous proposera un reçu ou un avis d’échéance.`
            : undefined
        }
        options={moisPrecedents(mois)}
        onChoisir={(valeur) => {
          const carte = cartePourMoisPrecedent;
          setCartePourMoisPrecedent(null);
          if (!carte) return;

          const periode = depuisCle(valeur);
          if (!periode) return;

          router.push({
            pathname: '/quittance/apercu',
            params: {
              logementId: carte.logement.id,
              periode: valeur,
              type: 'auto',
            },
          });
        }}
        onFermer={() => setCartePourMoisPrecedent(null)}
      />
    </View>
  );
}

/** Les douze mois précédant le mois affiché, du plus récent au plus ancien. */
function moisPrecedents(mois: { annee: number; mois: number }): OptionFeuille<string>[] {
  return Array.from({ length: 12 }, (_, index) => {
    const periode = decaler(mois, -(index + 1));
    return {
      valeur: versCle(periode),
      libelle: libelleLongCapitalise(periode),
    };
  });
}

interface PropsEnTete {
  moisLibelle: string;
  estMoisCourant: boolean;
  statistiques: {
    attendu: number;
    encaisse: number;
    reste: number;
    nombreLogements: number;
    nombrePayes: number;
    pourcentageRegle: number;
  };
  filtre: Filtre;
  compteurs: { tous: number; payes: number; attente: number; impayes: number };
  onChangerFiltre: (filtre: Filtre) => void;
  onPrecedent: () => void;
  onSuivant: () => void;
  onAujourdhui: () => void;
}

function EnTete({
  moisLibelle,
  estMoisCourant,
  statistiques,
  filtre,
  compteurs,
  onChangerFiltre,
  onPrecedent,
  onSuivant,
  onAujourdhui,
}: PropsEnTete) {
  const styles = useStyles(creerStyles);
  return (
    <View style={styles.entete}>
      <View style={styles.ligneTitre}>
        <View style={styles.titreTextes}>
          <Text style={[typographie.titrePrincipal, styles.titre]}>Mes quittances</Text>
          <Text style={[typographie.petit, styles.sousTitre]}>
            Gérez vos loyers et générez vos quittances en un appui
          </Text>
        </View>
      </View>

      {/* Sélecteur de mois */}
      <Carte style={styles.carteTableauDeBord}>
        <View style={styles.ligneMois}>
          <Fleche direction="gauche" onPress={onPrecedent} />
          <Text style={[typographie.titreSection, styles.mois]} numberOfLines={1}>
            {moisLibelle}
          </Text>
          <Fleche direction="droite" onPress={onSuivant} />
        </View>

        {!estMoisCourant ? (
          <Bouton
            libelle="Revenir au mois en cours"
            onPress={onAujourdhui}
            variante="discret"
            compact
          />
        ) : null}

        {/* Quatre indicateurs */}
        <View style={styles.grilleIndicateurs}>
          <View style={styles.rangeeIndicateurs}>
            <Indicateur
              compact
              icone="attendu"
              libelle="Loyers attendus"
              valeur={formatMontant(statistiques.attendu, { decimales: 'auto' })}
            />
            <Indicateur
              compact
              icone="encaisse"
              libelle="Encaissés"
              valeur={formatMontant(statistiques.encaisse, { decimales: 'auto' })}
            />
          </View>
          <View style={styles.rangeeIndicateurs}>
            <Indicateur
              compact
              icone="reste"
              libelle="Restant dû"
              valeur={formatMontant(statistiques.reste, { decimales: 'auto' })}
            />
            <Indicateur
              compact
              icone="logements"
              libelle="Logements"
              valeur={String(statistiques.nombreLogements)}
            />
          </View>
        </View>

        <BarreProgression
          pourcentage={statistiques.pourcentageRegle}
          regles={statistiques.nombrePayes}
          total={statistiques.nombreLogements}
        />
      </Carte>

      {/* Filtres */}
      <View style={styles.blocFiltres}>
        <Segments
          valeur={filtre}
          onChanger={onChangerFiltre}
          segments={[
            { valeur: 'tous', libelle: 'Tous', compteur: compteurs.tous },
            { valeur: 'payes', libelle: 'Payés', compteur: compteurs.payes },
            { valeur: 'attente', libelle: 'En attente', compteur: compteurs.attente },
            { valeur: 'impayes', libelle: 'À régler', compteur: compteurs.impayes },
          ]}
        />
      </View>
    </View>
  );
}

function Fleche({ direction, onPress }: { direction: 'gauche' | 'droite'; onPress: () => void }) {
  const styles = useStyles(creerStyles);
  return (
    <Bouton
      libelle={direction === 'gauche' ? '‹' : '›'}
      onPress={onPress}
      variante="discret"
      pleineLargeur={false}
      compact
      style={styles.fleche}
      accessibilite={direction === 'gauche' ? 'Mois précédent' : 'Mois suivant'}
    />
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
    gap: espaces.lg,
    padding: espaces.xxl,
  },
  texteChargement: {
    color: couleurs.texteSecondaire,
  },
  boutonErreur: {
    minWidth: 200,
  },
  liste: {
    paddingHorizontal: espaces.lg,
    gap: espaces.md,
  },
  entete: {
    gap: espaces.lg,
    paddingBottom: espaces.sm,
  },
  ligneTitre: {
    gap: espaces.xs,
  },
  titreTextes: {
    gap: espaces.xs,
  },
  titre: {
    color: couleurs.texte,
  },
  sousTitre: {
    color: couleurs.texteSecondaire,
  },
  carteTableauDeBord: {
    gap: espaces.lg,
  },
  ligneMois: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.sm,
  },
  mois: {
    flex: 1,
    textAlign: 'center',
    color: couleurs.texte,
  },
  fleche: {
    width: 44,
    minWidth: 44,
    paddingHorizontal: 0,
  },
  grilleIndicateurs: {
    gap: espaces.md,
  },
  rangeeIndicateurs: {
    flexDirection: 'row',
    gap: espaces.md,
  },
  blocFiltres: {
    marginHorizontal: -espaces.lg,
  },
  videListe: {
    minHeight: 320,
  },
});

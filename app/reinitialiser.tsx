/**
 * Écran « Tout effacer » : la remise à zéro de l'application.
 *
 * C'est le seul écran qui **détruit** des données, et il est conçu comme tel :
 * il annonce d'abord ce qui va disparaître, avec les nombres réels, puis il
 * demande de recopier un mot. Aucune action destructive ne se déclenche d'un
 * simple appui, et rien n'est présenté comme anodin.
 *
 * Les nombres ne sont pas décoratifs : « 14 quittances et 23 paiements » se lit
 * autrement que « vos données ». C'est ce qui permet de s'apercevoir qu'on est
 * sur le mauvais téléphone **avant** d'appuyer, et non après.
 *
 * Deux choses ne sont pas dans la base et doivent donc être défaites ici :
 *
 *  - **le rappel programmé**, que le système détient et qui survivrait à
 *    l'effacement — une notification continuerait d'arriver d'une application
 *    vidée ;
 *  - **les réglages en mémoire**, que `rafraichir` ne relit pas : sans
 *    `rechargerReglages`, le thème et la signature resteraient affichés alors
 *    que la base ne les porte plus.
 */

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BandeauMessage, Bouton, Carte, Champ, EnTeteEcran, LigneDetail } from '@/ui/components';
import { espaces, typographie } from '@/ui/tokens';
import { useStyles, type Couleurs } from '@/ui/theme';
import { useApplication } from '@/state/ApplicationContext';
import { MOT_CONFIRMATION, confirmationValide } from '@/domain/reinitialisation';
import { effacerToutesLesDonnees } from '@/db/reinitialisation';
import { listerProprietaires } from '@/db/repositories/owners';
import { listerLogements } from '@/db/repositories/properties';
import { tousLesDocuments } from '@/db/repositories/documents';
import { tousLesPaiements } from '@/db/repositories/payments';
import { annulerRappel } from '@/notifications/rappels';

interface Chiffres {
  proprietaires: number;
  logements: number;
  paiements: number;
  documents: number;
}

const RIEN: Chiffres = { proprietaires: 0, logements: 0, paiements: 0, documents: 0 };

export default function EcranReinitialiser() {
  const styles = useStyles(creerStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rechargerReglages, rafraichir } = useApplication();

  const [chiffres, setChiffres] = useState<Chiffres>(RIEN);
  const [saisie, setSaisie] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [termine, setTermine] = useState(false);

  const chargerChiffres = useCallback(async () => {
    try {
      const [proprietaires, logements, documents, paiements] = await Promise.all([
        listerProprietaires(),
        listerLogements(),
        tousLesDocuments(),
        tousLesPaiements(),
      ]);
      setChiffres({
        proprietaires: proprietaires.length,
        logements: logements.length,
        documents: documents.length,
        paiements: paiements.length,
      });
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de compter vos données pour le moment.');
    }
  }, []);

  // Le compte est chargé à l'ouverture de l'écran, une fois : après l'effacement
  // il est remis à zéro explicitement, et non relu, parce qu'il n'y a plus rien
  // à lire.
  useEffect(() => {
    void chargerChiffres();
  }, [chargerChiffres]);

  const valide = confirmationValide(saisie);
  const total = chiffres.proprietaires + chiffres.logements + chiffres.paiements + chiffres.documents;

  async function effacer() {
    setOccupe(true);
    setErreur(null);

    // Le rappel d'abord, et sans interrompre la suite s'il échoue : annuler une
    // notification ne détruit rien, alors qu'un rappel qui survit à
    // l'effacement annonce des loyers qu'aucune donnée ne porte plus.
    let rappelAnnule = true;
    try {
      await annulerRappel();
    } catch {
      rappelAnnule = false;
    }

    try {
      const resultat = await effacerToutesLesDonnees();
      await rechargerReglages();
      rafraichir();

      setChiffres(RIEN);
      setSaisie('');
      setTermine(true);

      const restes: string[] = [];
      if (!resultat.fichiersEffaces) {
        restes.push(
          'les fichiers PDF n’ont pas pu être retirés du téléphone : ils ne sont '
            + 'plus référencés par l’application, et une nouvelle remise à zéro les effacera',
        );
      }
      if (!rappelAnnule) {
        restes.push(
          'le rappel de loyers n’a pas pu être annulé : désactivez-le dans les réglages '
            + 'après avoir quitté cet écran',
        );
      }
      if (restes.length > 0) {
        setErreur(`Vos données sont effacées. Reste à faire : ${restes.join(' ; ')}.`);
      }
    } catch (e) {
      setErreur(
        e instanceof Error
          ? `Rien n’a été effacé : ${e.message}`
          : "Rien n'a été effacé : l'opération a échoué.",
      );
    } finally {
      setOccupe(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Tout effacer' }} />
      <ScrollView
        style={styles.ecran}
        contentContainerStyle={[styles.contenu, { paddingBottom: insets.bottom + espaces.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <EnTeteEcran
          titre="Tout effacer"
          sousTitre="Remettre l’application dans son état d’installation."
        />

        {erreur ? <BandeauMessage message={erreur} ton="erreur" /> : null}
        {termine ? (
          <BandeauMessage
            message="Toutes vos données ont été effacées. L’application est comme neuve."
            ton="succes"
          />
        ) : null}

        <BandeauMessage
          message={
            "Cette action est définitive. Il n’y a ni corbeille, ni annulation, ni retour en arrière : "
            + 'une fois effacé, rien ne peut être récupéré. Si vous voulez garder une trace, créez une '
            + 'sauvegarde avant de continuer.'
          }
          ton="avertissement"
        />

        <Carte>
          <Text style={styles.section}>Ce qui va disparaître</Text>
          <Text style={styles.aide}>
            Tout ce que vous avez saisi sur ce téléphone. Aucune de ces données n’existe ailleurs :
            l’application ne les envoie nulle part.
          </Text>
          <LigneDetail libelle="Propriétaires" valeur={String(chiffres.proprietaires)} />
          <LigneDetail libelle="Logements et baux" valeur={String(chiffres.logements)} />
          <LigneDetail libelle="Paiements enregistrés" valeur={String(chiffres.paiements)} />
          <LigneDetail libelle="Quittances émises" valeur={String(chiffres.documents)} />
          <LigneDetail
            libelle="Fichiers PDF"
            valeur={chiffres.documents > 0 ? `${chiffres.documents} fichier(s)` : 'Aucun'}
          />
          {total === 0 ? (
            <Text style={styles.aide}>
              Il n’y a rien à effacer pour l’instant : cette page ne fera que remettre vos réglages
              à leurs valeurs d’origine.
            </Text>
          ) : null}
        </Carte>

        <Carte>
          <Text style={styles.section}>Ce qui sera remis à zéro</Text>
          <Text style={styles.aide}>
            Vos réglages reviennent aussi aux valeurs d’origine : thème, modèle de document,
            signature, lieu d’émission, mentions, verrouillage et rappels.
          </Text>
        </Carte>

        <Carte>
          <Text style={styles.section}>Confirmation</Text>
          <Text style={styles.aide}>
            Pour éviter un effacement par inadvertance, recopiez le mot ci-dessous. C’est la seule
            façon de confirmer.
          </Text>
          <Champ
            libelle={`Écrivez ${MOT_CONFIRMATION} pour confirmer`}
            valeur={saisie}
            onChangement={setSaisie}
            placeholder={MOT_CONFIRMATION}
            aide={
              valide
                ? 'Le mot est correct : le bouton ci-dessous est actif.'
                : `Le mot s’écrit en lettres capitales, sans espace : ${MOT_CONFIRMATION}.`
            }
            majuscules
            autoCapitalisation="characters"
            editable={!termine && !occupe}
          />
          <Bouton
            libelle={termine ? 'Données effacées' : 'Tout effacer définitivement'}
            variante="danger"
            onPress={effacer}
            desactive={!valide || termine}
            occupe={occupe}
            pleineLargeur
          />
        </Carte>

        <Bouton
          libelle={termine ? 'Terminer' : 'Annuler'}
          variante="discret"
          onPress={() => router.back()}
          pleineLargeur
        />
      </ScrollView>
    </>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
    ecran: { flex: 1, backgroundColor: couleurs.fond },
    contenu: { padding: espaces.lg, gap: espaces.lg },
    section: { ...typographie.titreSection, color: couleurs.texte, marginBottom: espaces.xs },
    aide: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      marginBottom: espaces.sm,
    },
  });

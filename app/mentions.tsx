/**
 * Mentions portées sur les documents, et rappel des règles applicables.
 *
 * Deux choses différentes cohabitent ici, et il faut les distinguer :
 *  - les **mentions libres**, qui sont un réglage et partent dans le PDF ;
 *  - les **règles légales**, qui sont de l'information et ne se modifient pas.
 *
 * Les textes ci-dessous rappellent le cadre du bail d'habitation. Ils sont
 * volontairement prudents : l'application ne prétend pas remplacer un conseil
 * juridique, et le dit.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApplication } from '@/state/ApplicationContext';
import { LONGUEUR_MENTION_LIBRE_MAX } from '@/domain/mentions';
import {
  BandeauMessage,
  Bouton,
  Carte,
  Champ,
  EnTeteEcran,
  LigneDetail,
} from '@/ui/components';
import { espaces, typographie } from '@/ui/tokens';
import { useStyles, type Couleurs } from '@/ui/theme';

const REGLES = [
  {
    titre: 'La quittance de loyer',
    texte:
      "Le bailleur doit délivrer une quittance au locataire qui en fait la demande, et qui a payé l'intégralité du loyer et des charges. Une quittance est une preuve de paiement : elle ne doit donc jamais être remise si le paiement n'est pas complet.",
  },
  {
    titre: 'Le reçu',
    texte:
      "Lorsque le paiement est partiel, le bailleur remet un reçu qui mentionne la somme effectivement reçue et, si le locataire le demande, ce qui reste dû. Cette application ne produit que des quittances : elle ne génère pas de reçu, mais elle dit pourquoi une quittance n'est pas encore possible et propose d'enregistrer le paiement manquant.",
  },
  {
    titre: 'Le loyer et les charges',
    texte:
      "Le loyer et les charges doivent apparaître séparément sur le document. Le montant porté est celui effectivement reçu, et non celui attendu : c'est la date du paiement réel qui figure.",
  },
  {
    titre: 'La remise d’un logement décent',
    texte:
      "Les baux d'habitation relèvent de la loi du 6 juillet 1989. Certaines situations — logement non décent, litige sur les charges — peuvent avoir des conséquences sur l'obligation de délivrer une quittance. En cas de doute, un professionnel du droit est le bon interlocuteur.",
  },
];

export default function EcranMentions() {
  const styles = useStyles(creerStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reglages, majReglages } = useApplication();

  const [lieu, setLieu] = useState(reglages.lieuEmission);
  const [civilite, setCivilite] = useState(reglages.civiliteBailleur);
  const [mention, setMention] = useState(reglages.mentionLibre);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  const aChange =
    lieu !== reglages.lieuEmission ||
    civilite !== reglages.civiliteBailleur ||
    mention !== reglages.mentionLibre;

  async function enregistrer() {
    setOccupe(true);
    setErreur(null);
    try {
      await majReglages({
        lieuEmission: lieu.trim(),
        civiliteBailleur: civilite.trim(),
        mentionLibre: mention.trim(),
      });
      setSucces(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Les mentions n'ont pas pu être enregistrées.");
    } finally {
      setOccupe(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Mentions' }} />
      <ScrollView
        style={styles.ecran}
        contentContainerStyle={[styles.contenu, { paddingBottom: insets.bottom + espaces.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <EnTeteEcran
          titre="Mentions des documents"
          sousTitre="Trois champs facultatifs, imprimés sur vos quittances et vos reçus."
        />

        {erreur ? <BandeauMessage message={erreur} ton="erreur" onFermer={() => setErreur(null)} /> : null}
        {succes ? (
          <BandeauMessage
            message="Mentions enregistrées. Elles apparaîtront sur les prochains documents."
            ton="succes"
            onFermer={() => setSucces(false)}
          />
        ) : null}

        <Carte>
          <Champ
            libelle="Lieu d’émission"
            valeur={lieu}
            onChangement={setLieu}
            placeholder="Montmagny"
            aide="La ville où le document est établi, imprimée à côté de la date."
            autoCapitalisation="words"
          />
          <Champ
            libelle="Civilité du bailleur"
            valeur={civilite}
            onChangement={setCivilite}
            placeholder="Madame, Monsieur, M. et Mme…"
            aide="Facultatif. Placé avant votre nom sur les documents."
            autoCapitalisation="words"
          />
          <Champ
            libelle="Mention libre"
            valeur={mention}
            onChangement={setMention}
            placeholder="Exemple : quittance établie pour servir et valoir ce que de droit."
            aide={`Imprimée au bas de chaque document. Une ou deux phrases suffisent — ${LONGUEUR_MENTION_LIBRE_MAX} caractères au plus, pour que le texte tienne sur la feuille.`}
            multiligne
            nombreDeLignes={3}
            maxLength={LONGUEUR_MENTION_LIBRE_MAX}
          />
        </Carte>

        <Carte>
          <Text style={styles.section}>Aperçu</Text>
          <LigneDetail libelle="Lieu d’émission" valeur={lieu.trim() || 'Non renseigné'} />
          <LigneDetail libelle="Civilité" valeur={civilite.trim() || 'Non renseignée'} />
          <LigneDetail
            libelle="Mention libre"
            valeur={mention.trim() ? `${mention.trim().length} caractères` : 'Aucune'}
          />
          {mention.trim() ? (
            <View style={styles.apercuMention}>
              <Text style={styles.texteMention}>{mention.trim()}</Text>
            </View>
          ) : null}
        </Carte>

        <Bouton
          libelle="Enregistrer les mentions"
          onPress={enregistrer}
          desactive={!aChange}
          occupe={occupe}
          pleineLargeur
        />

        <View style={styles.blocInformation}>
          <Text style={styles.section}>Ce que dit la règle</Text>
          <BandeauMessage
            message="Ces rappels sont donnés à titre d'information. L'application ne remplace ni le bail signé, ni l'avis d'un professionnel du droit."
            ton="information"
          />
          {REGLES.map((regle) => (
            <View key={regle.titre} style={styles.regle}>
              <Text style={styles.titreRegle}>{regle.titre}</Text>
              <Text style={styles.texteRegle}>{regle.texte}</Text>
            </View>
          ))}
        </View>

        <Bouton libelle="Terminer" onPress={() => router.back()} variante="discret" pleineLargeur />
      </ScrollView>
    </>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espaces.lg, gap: espaces.lg },
  section: { ...typographie.titreSection, color: couleurs.texte, marginBottom: espaces.xs },
  apercuMention: {
    marginTop: espaces.sm,
    padding: espaces.sm,
    borderRadius: 8,
    backgroundColor: couleurs.fondSourdine,
  },
  texteMention: { ...typographie.petit, color: couleurs.texteSecondaire, fontStyle: 'italic' },
  blocInformation: { gap: espaces.md },
  regle: { gap: espaces.xs },
  titreRegle: { ...typographie.corpsAppuye, color: couleurs.texte },
  texteRegle: { ...typographie.petit, color: couleurs.texteSecondaire, lineHeight: 20 },
});

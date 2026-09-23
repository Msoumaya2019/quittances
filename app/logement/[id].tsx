/**
 * Détail d'un logement.
 *
 * L'écran « tout savoir sur ce logement » : locataire en place, situation du
 * mois affiché, actions du mois, informations du bien et historique des loyers.
 *
 * Les actions restent peu nombreuses : le geste courant est le bouton de la
 * carte d'accueil ; cet écran sert à comprendre et à corriger.
 */

import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import {
  BandeauMessage,
  Bouton,
  Carte,
  DialogueConfirmation,
  EnTeteEcran,
  LigneDetail,
  PastilleStatut,
} from '@/ui/components';
import { couleurs, espaces, rayons, typographie } from '@/ui/tokens';
import { formatMontant } from '@/domain/money';
import {
  aujourdHui,
  formaterDateFr,
  libelleLongCapitalise,
  depuisCle,
  versCle,
} from '@/domain/period';
import { contexteDuMois } from '@/domain/payments';
import { LIBELLE_DOCUMENT, TYPES_LOGEMENT, nomPourDocument } from '@/domain/types';
import type {
  Bail,
  Document,
  Logement,
  Paiement,
  PeriodeLoyer,
  Proprietaire,
  TitulaireBail,
} from '@/domain/types';
import { useApplication } from '@/state/ApplicationContext';
import {
  bailEnCours,
  cloturerBail,
  periodesLoyerDuBail,
  titulairesDuBail,
  trouverLogement,
} from '@/db/repositories/properties';
import { trouverProprietaire } from '@/db/repositories/owners';
import { documentsDuLogement } from '@/db/repositories/documents';
import { paiementsDuBail } from '@/db/repositories/payments';

interface Etat {
  logement: Logement;
  proprietaire: Proprietaire | null;
  bail: Bail | null;
  titulaires: TitulaireBail[];
  periodes: PeriodeLoyer[];
  documents: Document[];
  paiements: Paiement[];
}

export default function EcranLogement() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mois, rafraichir } = useApplication();
  const insets = useSafeAreaInsets();

  const [etat, setEtat] = useState<Etat | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmeFinBail, setConfirmeFinBail] = useState(false);
  const [travail, setTravail] = useState(false);

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      const logement = await trouverLogement(id);
      if (!logement) {
        setErreur("Ce logement n'existe plus.");
        setEtat(null);
        return;
      }

      const [proprietaire, bail, documents] = await Promise.all([
        trouverProprietaire(logement.proprietaireId),
        bailEnCours(logement.id),
        documentsDuLogement(logement.id),
      ]);

      if (!bail) {
        setEtat({
          logement,
          proprietaire,
          bail: null,
          titulaires: [],
          periodes: [],
          documents,
          paiements: [],
        });
        setErreur(null);
        return;
      }

      const [titulaires, periodes, paiements] = await Promise.all([
        titulairesDuBail(bail.id),
        periodesLoyerDuBail(bail.id),
        paiementsDuBail(bail.id),
      ]);

      setEtat({ logement, proprietaire, bail, titulaires, periodes, documents, paiements });
      setErreur(null);
    } catch (e) {
      setErreur(
        e instanceof Error ? e.message : 'Impossible de charger ce logement pour le moment.',
      );
    } finally {
      setChargement(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      charger();
    }, [charger]),
  );

  const cle = versCle(mois);

  // Le contexte du mois porte le montant dû, le cumul, le statut et le solde :
  // tout vient du domaine, aucune addition n'est refaite ici.
  const contexte = etat?.bail
    ? contexteDuMois({
        bail: etat.bail,
        periodesLoyer: etat.periodes,
        paiements: etat.paiements,
        periode: mois,
        dateDuJour: aujourdHui(),
      })
    : null;

  const documentDuMois = etat?.documents.find((d) => d.periode === cle) ?? null;

  async function terminerBail() {
    if (!etat?.bail) return;
    setTravail(true);
    try {
      await cloturerBail(etat.bail.id, `${cle}-01`);
      rafraichir();
      await charger();
      setConfirmeFinBail(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La fin de bail n'a pas pu être enregistrée.");
      setConfirmeFinBail(false);
    } finally {
      setTravail(false);
    }
  }

  if (!chargement && !etat) {
    return (
      <ScrollView
        contentContainerStyle={[
          styles.conteneur,
          { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + espaces.enorme },
        ]}
      >
        <BandeauMessage ton="erreur" message={erreur ?? 'Ce logement est introuvable.'} />
      </ScrollView>
    );
  }

  const bail = etat?.bail ?? null;
  const titulaires = etat?.titulaires ?? [];
  const periodes = etat?.periodes ?? [];
  const logement = etat?.logement ?? null;

  const locataire = titulaires.length > 0 ? nomPourDocument(titulaires[0]) : null;
  const autres = titulaires.slice(1).map((t) => nomPourDocument(t));
  const typeLibelle = logement
    ? (TYPES_LOGEMENT.find((t) => t.valeur === logement.type)?.libelle ?? null)
    : null;

  return (
    <>
      <ScrollView
        contentContainerStyle={[
          styles.conteneur,
          { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + espaces.enorme },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <EnTeteEcran
          titre={logement?.nom ?? 'Logement'}
          sousTitre={logement ? `${logement.codePostal} ${logement.ville}`.trim() : undefined}
        />

        {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

        {chargement && !etat ? <Text style={styles.chargement}>Chargement…</Text> : null}

        {logement ? (
          <>
            {/* Locataire en place */}
            <Carte>
              <Text style={styles.section}>Locataire</Text>
              {bail && locataire ? (
                <>
                  <Text style={styles.nomLocataire}>{locataire}</Text>
                  {autres.length > 0 ? (
                    <Text style={styles.sousTitre}>Avec {autres.join(', ')}</Text>
                  ) : null}
                  <View style={styles.separateur} />
                  <LigneDetail libelle="Entrée" valeur={formaterDateFr(bail.dateEntree)} />
                  <LigneDetail
                    libelle="Échéance"
                    valeur={`le ${bail.jourEcheance} de chaque mois`}
                  />
                  {bail.dateSortie ? (
                    <LigneDetail libelle="Sortie" valeur={formaterDateFr(bail.dateSortie)} />
                  ) : null}
                </>
              ) : (
                <Text style={styles.sousTitre}>
                  Aucun locataire en place. Il n’y a donc aucun loyer à encaisser pour l’instant.
                </Text>
              )}
            </Carte>

            {/* Situation du mois affiché */}
            {bail ? (
              <Carte>
                <View style={styles.ligneTitre}>
                  <Text style={styles.titreCarte}>{libelleLongCapitalise(mois)}</Text>
                  {contexte ? <PastilleStatut statut={contexte.statut} /> : null}
                </View>

                {contexte && contexte.statut !== 'hors_bail' ? (
                  <>
                    <LigneDetail libelle="Loyer" valeur={formatMontant(contexte.montantDu.loyer)} />
                    <LigneDetail
                      libelle="Charges"
                      valeur={formatMontant(contexte.montantDu.charges)}
                    />
                    <LigneDetail
                      libelle="Total attendu"
                      valeur={formatMontant(contexte.montantDu.total)}
                      accentuee
                    />
                    {contexte.cumul.encaisse > 0 ? (
                      <LigneDetail
                        libelle={
                          contexte.cumul.nombre > 1
                            ? `Déjà reçu (${contexte.cumul.nombre} règlements)`
                            : 'Déjà reçu'
                        }
                        valeur={formatMontant(contexte.cumul.encaisse)}
                      />
                    ) : null}
                    {contexte.solde > 0 ? (
                      <LigneDetail
                        libelle="Reste à recevoir"
                        valeur={formatMontant(contexte.solde)}
                        accentuee
                      />
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.sousTitre}>Aucun loyer n’est dû pour ce mois-ci.</Text>
                )}
              </Carte>
            ) : null}

            {/* Actions du mois */}
            {bail ? (
              <View style={styles.actions}>
                {documentDuMois ? (
                  <Bouton
                    libelle={`Voir ${LIBELLE_DOCUMENT[documentDuMois.type].toLowerCase()}`}
                    onPress={() =>
                      router.push({
                        pathname: '/quittance/apercu',
                        params: { documentId: documentDuMois.id },
                      })
                    }
                  />
                ) : (
                  <Bouton
                    libelle="Générer le document du mois"
                    onPress={() =>
                      router.push({
                        pathname: '/quittance/apercu',
                        params: { logementId: logement.id, periode: cle, type: 'auto' },
                      })
                    }
                  />
                )}

                <Bouton
                  libelle="Enregistrer un paiement"
                  variante="secondaire"
                  onPress={() =>
                    router.push({
                      pathname: '/paiement/[propertyId]',
                      params: { propertyId: logement.id },
                    })
                  }
                />

                <Bouton
                  libelle="Historique des quittances"
                  variante="discret"
                  onPress={() =>
                    router.push({
                      pathname: '/logement/[id]/historique',
                      params: { id: logement.id },
                    })
                  }
                />
              </View>
            ) : null}

            {/* Informations du bien */}
            <Carte>
              <Text style={styles.section}>Le logement</Text>
              <Text style={styles.adresse}>{logement.adresse}</Text>
              <Text style={styles.adresse}>{`${logement.codePostal} ${logement.ville}`.trim()}</Text>
              {typeLibelle ? <LigneDetail libelle="Type" valeur={typeLibelle} /> : null}
              {logement.reference ? (
                <LigneDetail libelle="Référence" valeur={logement.reference} />
              ) : null}
              {etat?.proprietaire ? (
                <LigneDetail libelle="Propriétaire" valeur={etat.proprietaire.nom} />
              ) : null}
            </Carte>

            {/* Historique des loyers */}
            {periodes.length > 0 ? (
              <Carte>
                <Text style={styles.section}>Historique des loyers</Text>
                <Text style={styles.aide}>
                  Un changement de loyer ne modifie jamais les quittances déjà générées.
                </Text>
                {periodes.map((p) => {
                  const debut = depuisCle(p.debut.slice(0, 7));
                  return (
                    <LigneDetail
                      key={p.id}
                      libelle={
                        debut ? `À partir de ${libelleLongCapitalise(debut)}` : 'Loyer initial'
                      }
                      valeur={`${formatMontant(p.loyer)} + ${formatMontant(p.charges)}`}
                    />
                  );
                })}
              </Carte>
            ) : null}

            {/* Fin de bail */}
            <View style={styles.actions}>
              {bail ? (
                <Bouton
                  libelle="Le locataire est parti"
                  variante="discret"
                  onPress={() => setConfirmeFinBail(true)}
                />
              ) : (
                <Bouton
                  libelle="Ajouter un locataire"
                  variante="secondaire"
                  onPress={() =>
                    router.push({
                      pathname: '/logement/nouveau',
                      params: { logementId: logement.id },
                    })
                  }
                />
              )}
            </View>
          </>
        ) : null}
      </ScrollView>

      <DialogueConfirmation
        visible={confirmeFinBail}
        titre="Confirmer la fin du bail ?"
        message={`Le bail se terminera au ${formaterDateFr(`${cle}-01`)}. L’historique et les quittances de ce locataire sont conservés.`}
        libelleConfirmer="Oui, clôturer"
        danger
        occupe={travail}
        onConfirmer={terminerBail}
        onAnnuler={() => setConfirmeFinBail(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  conteneur: {
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
  ligneTitre: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espaces.sm,
  },
  titreCarte: {
    ...typographie.titreCarte,
    color: couleurs.texte,
    flexShrink: 1,
  },
  nomLocataire: {
    ...typographie.titreSection,
    color: couleurs.texte,
  },
  sousTitre: {
    ...typographie.corps,
    color: couleurs.texteSecondaire,
    marginTop: espaces.sm,
  },
  adresse: {
    ...typographie.corps,
    color: couleurs.texte,
  },
  aide: {
    ...typographie.petit,
    color: couleurs.texteTertiaire,
    marginBottom: espaces.sm,
  },
  separateur: {
    height: 1,
    backgroundColor: couleurs.bordure,
    marginVertical: espaces.sm,
    borderRadius: rayons.sm,
  },
  actions: {
    gap: espaces.md,
  },
});

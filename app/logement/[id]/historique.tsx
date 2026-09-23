/**
 * Historique des quittances d'un logement.
 *
 * Présenté comme un calendrier : douze cases pour l'année choisie, une par mois.
 * Chaque case dit d'un coup d'œil si le mois est payé, partiel, en retard ou
 * en attente, et si un document a déjà été émis.
 *
 * L'historique ne dépend pas du bail en cours : on peut basculer sur un ancien
 * locataire et retrouver ses quittances, conservées indéfiniment.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import {
  BandeauMessage,
  Bouton,
  Carte,
  EnTeteEcran,
  LigneDetail,
  PastilleStatut,
} from '@/ui/components';
import { espaces, rayons, typographie } from '@/ui/tokens';
import { formatMontant } from '@/domain/money';
import { MOIS_FR, MOIS_FR_COURT, aujourdHui, libelleLongCapitalise, versCle } from '@/domain/period';
import { contexteDuMois } from '@/domain/payments';
import { LIBELLE_DOCUMENT } from '@/domain/types';
import type { Bail, Document, PeriodeLoyer, Paiement, StatutMois } from '@/domain/types';
import {
  bailEnCours,
  bauxDuLogement,
  periodesLoyerDuBail,
  trouverLogement,
} from '@/db/repositories/properties';
import { documentsDuLogement } from '@/db/repositories/documents';
import { paiementsDuBail } from '@/db/repositories/payments';
import { useApplication } from '@/state/ApplicationContext';
import { useCouleurs, useStyles, type Couleurs } from '@/ui/theme';

interface CaseMois {
  mois: number;
  cle: string;
  statut: StatutMois | null;
  document: Document | null;
  total: number;
  recu: number;
  solde: number;
}

/**
 * Couleur de la pastille d'un mois, selon son statut.
 *
 * « Payé » est vert dans tous les thèmes : la pastille dit qu'un mois est réglé,
 * elle ne reprend pas la couleur choisie par le bailleur.
 */
function couleursParStatut(couleurs: Couleurs): Record<StatutMois, string> {
  return {
    paye: couleurs.succes,
    partiel: couleurs.orange,
    retard: couleurs.rouge,
    attente: couleurs.bordureForte,
    hors_bail: couleurs.texteTertiaire,
  };
}

const LIBELLE_STATUT: Record<StatutMois, string> = {
  paye: 'payé',
  partiel: 'partiellement payé',
  retard: 'en retard',
  attente: 'en attente',
  hors_bail: 'hors bail',
};

export default function EcranHistorique() {
  const styles = useStyles(creerStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mois: moisAffiche, rafraichir } = useApplication();
  const insets = useSafeAreaInsets();

  const [nomLogement, setNomLogement] = useState('');
  const [annee, setAnnee] = useState(moisAffiche.annee);
  const [cases, setCases] = useState<CaseMois[]>([]);
  const [baux, setBaux] = useState<Bail[]>([]);
  const [bailChoisi, setBailChoisi] = useState<Bail | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseMois | null>(null);

  const charger = useCallback(
    async (anneeVoulue: number, bailForce?: Bail | null) => {
      if (!id) return;
      try {
        const logement = await trouverLogement(id);
        if (!logement) {
          setErreur("Ce logement n'existe plus.");
          return;
        }
        setNomLogement(logement.nom);

        const tousLesBaux = await bauxDuLogement(logement.id);
        setBaux(tousLesBaux);

        const cible =
          bailForce ?? (await bailEnCours(logement.id)) ?? tousLesBaux[0] ?? null;
        setBailChoisi(cible);

        const documents = await documentsDuLogement(logement.id);

        let periodes: PeriodeLoyer[] = [];
        let paiements: Paiement[] = [];

        if (cible) {
          const [p, pa] = await Promise.all([
            periodesLoyerDuBail(cible.id),
            paiementsDuBail(cible.id),
          ]);
          periodes = p;
          paiements = pa;
        }

        // Pour chaque mois de l'année : le statut, le document éventuel et les
        // montants, tous calculés par le domaine.
        const [anneeDuJour, moisDuJour, jourDuJour] = aujourdHui()
          .split('-')
          .map((v) => Number(v));

        const nouvelles: CaseMois[] = [];
        for (let m = 1; m <= 12; m++) {
          const cle = versCle({ annee: anneeVoulue, mois: m });

          if (!cible) {
            nouvelles.push({
              mois: m,
              cle,
              statut: null,
              document: documents.find((d) => d.periode === cle) ?? null,
              total: 0,
              recu: 0,
              solde: 0,
            });
            continue;
          }

          // Le jour de référence ne vaut que pour le mois courant : pour les
          // autres mois, on passe le dernier jour du mois afin que le passé soit
          // jugé comme passé et l'avenir comme à venir.
          const estMoisCourant = anneeVoulue === anneeDuJour && m === moisDuJour;
          const jourReference = estMoisCourant
            ? jourDuJour
            : cle < versCle({ annee: anneeDuJour, mois: moisDuJour })
              ? 31
              : 1;

          const contexte = contexteDuMois({
            bail: cible,
            periodesLoyer: periodes,
            paiements,
            periode: { annee: anneeVoulue, mois: m },
            dateDuJour: `${anneeVoulue}-${String(m).padStart(2, '0')}-${String(jourReference).padStart(2, '0')}`,
          });

          nouvelles.push({
            mois: m,
            cle,
            statut: contexte.statut,
            document: documents.find((d) => d.periode === cle) ?? null,
            total: contexte.montantDu.total,
            recu: contexte.cumul.encaisse,
            solde: contexte.solde,
          });
        }

        setCases(nouvelles);
        setDetail(null);
        setErreur(null);
      } catch (e) {
        setErreur(
          e instanceof Error ? e.message : "Impossible de charger l'historique pour le moment.",
        );
      } finally {
        setChargement(false);
      }
    },
    [id],
  );

  useFocusEffect(
    useCallback(() => {
      charger(annee, bailChoisi);
      // Volontairement déclenché par le retour sur l'écran et le changement
      // d'année ; le changement de bail recharge via `basculerBail`.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [annee, id]),
  );

  const anneesDisponibles = useMemo(() => {
    const base = new Set<number>();
    base.add(moisAffiche.annee);
    base.add(annee);
    for (const b of baux) {
      base.add(Number(b.dateEntree.slice(0, 4)));
      if (b.dateSortie) base.add(Number(b.dateSortie.slice(0, 4)));
    }
    return [...base].sort((a, b) => b - a);
  }, [baux, moisAffiche.annee, annee]);

  async function basculerBail(bail: Bail) {
    setChargement(true);
    await charger(annee, bail);
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.conteneur,
        { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + espaces.enorme },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <EnTeteEcran titre="Historique" sousTitre={nomLogement} />

      {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

      {chargement && cases.length === 0 ? (
        <Text style={styles.chargement}>Chargement…</Text>
      ) : null}

      {/* Choix de l'année */}
      {anneesDisponibles.length > 1 ? (
        <View style={styles.annees}>
          {anneesDisponibles.map((a) => {
            const actif = a === annee;
            return (
              <Pressable
                key={a}
                onPress={() => setAnnee(a)}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
                style={[styles.annee, actif && styles.anneeActive]}
              >
                <Text style={[styles.anneeTexte, actif && styles.anneeTexteActif]}>{a}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* Grille des douze mois */}
      <View style={styles.grille}>
        {cases.map((c) => (
          <CaseCalendrier
            key={c.cle}
            kase={c}
            selectionnee={detail?.cle === c.cle}
            onPress={() => setDetail(detail?.cle === c.cle ? null : c)}
          />
        ))}
      </View>

      {/* Détail du mois choisi */}
      {detail ? (
        <Carte>
          <View style={styles.ligneTitre}>
            <Text style={styles.titreCarte}>
              {libelleLongCapitalise({ annee, mois: detail.mois })}
            </Text>
            {detail.statut ? <PastilleStatut statut={detail.statut} /> : null}
          </View>

          {detail.total > 0 ? (
            <>
              <LigneDetail libelle="Total attendu" valeur={formatMontant(detail.total)} />
              <LigneDetail libelle="Reçu" valeur={formatMontant(detail.recu)} />
              {detail.solde > 0 ? (
                <LigneDetail libelle="Reste dû" valeur={formatMontant(detail.solde)} accentuee />
              ) : null}
            </>
          ) : (
            <Text style={styles.aide}>
              {detail.statut === 'hors_bail'
                ? 'Ce mois est en dehors de la période de location.'
                : 'Aucun loyer dû pour ce mois.'}
            </Text>
          )}

          {detail.document ? (
            <View style={styles.actionDetail}>
              <LigneDetail
                libelle="Document"
                valeur={`${LIBELLE_DOCUMENT[detail.document.type]} ${detail.document.numero}`}
              />
              <Bouton
                libelle="Ouvrir ce document"
                onPress={() =>
                  router.push({
                    pathname: '/quittance/apercu',
                    params: { documentId: detail.document!.id },
                  })
                }
              />
            </View>
          ) : detail.statut && detail.statut !== 'hors_bail' && detail.statut !== 'attente' ? (
            <View style={styles.actionDetail}>
              <Bouton
                libelle="Générer le document"
                variante="secondaire"
                onPress={() =>
                  router.push({
                    pathname: '/quittance/apercu',
                    params: { logementId: id!, periode: detail.cle, type: 'auto' },
                  })
                }
              />
            </View>
          ) : null}
        </Carte>
      ) : null}

      {/* Locataires successifs */}
      {baux.length > 1 ? (
        <Carte>
          <Text style={styles.section}>Locataires successifs</Text>
          <Text style={styles.aide}>
            Chaque locataire conserve ses propres quittances, même après son départ.
          </Text>
          {baux.map((b) => {
            const actif = bailChoisi?.id === b.id;
            return (
              <Pressable
                key={b.id}
                onPress={() => basculerBail(b)}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
                style={[styles.ligneBail, actif && styles.ligneBailActive]}
              >
                <View style={styles.ligneBailTexte}>
                  <Text style={styles.nomBail}>
                    {b.dateSortie ? 'Ancien locataire' : 'Locataire en place'}
                  </Text>
                  <Text style={styles.datesBail}>
                    {formaterDateCourte(b.dateEntree)}
                    {b.dateSortie ? ` → ${formaterDateCourte(b.dateSortie)}` : ' → aujourd’hui'}
                  </Text>
                </View>
                {actif ? <Text style={styles.coche}>✓</Text> : null}
              </Pressable>
            );
          })}
        </Carte>
      ) : null}

      <Bouton
        libelle="Rafraîchir"
        variante="discret"
        onPress={() => {
          rafraichir();
          setChargement(true);
          charger(annee, bailChoisi);
        }}
      />
    </ScrollView>
  );
}

/** Transforme `2026-09-01` en `01/09/2026`. */
function formaterDateCourte(date: string): string {
  if (date.length < 10) return date;
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** Une case du calendrier : mois abrégé, pastille de statut, repère document. */
function CaseCalendrier({
  kase,
  selectionnee,
  onPress,
}: {
  kase: CaseMois;
  selectionnee: boolean;
  onPress: () => void;
}) {
  const couleurs = useCouleurs();
  const styles = useStyles(creerStyles);
  const couleurStatut = couleursParStatut(couleurs);
  const statut = kase.statut;
  const hors = statut === null || statut === 'hors_bail';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${MOIS_FR[kase.mois - 1]}${statut ? `, ${LIBELLE_STATUT[statut]}` : ''}`}
      style={[styles.case, selectionnee && styles.caseSelectionnee, hors && styles.caseHors]}
    >
      <Text style={[styles.caseMois, hors && styles.texteHors]}>
        {MOIS_FR_COURT[kase.mois - 1]}
      </Text>

      {hors ? (
        <Text style={styles.tiret}>—</Text>
      ) : (
        <View style={[styles.pastille, { backgroundColor: couleurStatut[statut] + '22' }]}>
          <View style={[styles.puce, { backgroundColor: couleurStatut[statut] }]} />
        </View>
      )}

      <View style={styles.repereDocument}>
        {kase.document ? <View style={styles.pointDocument} /> : null}
      </View>
    </Pressable>
  );
}

const creerStyles = (couleurs: Couleurs) =>
  StyleSheet.create({
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
  annees: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaces.sm,
  },
  annee: {
    paddingHorizontal: espaces.lg,
    height: 40,
    borderRadius: rayons.rond,
    backgroundColor: couleurs.fondCarte,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anneeActive: {
    backgroundColor: couleurs.accent,
    borderColor: couleurs.accent,
  },
  anneeTexte: {
    ...typographie.petitAppuye,
    color: couleurs.texteSecondaire,
  },
  anneeTexteActif: {
    color: couleurs.surAccent,
  },
  grille: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaces.sm,
  },
  case: {
    width: '31.5%',
    minHeight: 84,
    borderRadius: rayons.md,
    backgroundColor: couleurs.fondCarte,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espaces.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  caseSelectionnee: {
    borderColor: couleurs.accent,
    borderWidth: 2,
  },
  caseHors: {
    backgroundColor: couleurs.fond,
    borderStyle: 'dashed',
    borderColor: couleurs.bordureForte,
  },
  caseMois: {
    ...typographie.petitAppuye,
    color: couleurs.texte,
  },
  texteHors: {
    color: couleurs.texteTertiaire,
  },
  pastille: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puce: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  tiret: {
    fontSize: 16,
    color: couleurs.texteTertiaire,
  },
  repereDocument: {
    height: 6,
    justifyContent: 'center',
  },
  pointDocument: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: couleurs.accent,
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
  section: {
    ...typographie.petitAppuye,
    color: couleurs.texteTertiaire,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: espaces.sm,
  },
  aide: {
    ...typographie.petit,
    color: couleurs.texteTertiaire,
    marginBottom: espaces.sm,
  },
  actionDetail: {
    marginTop: espaces.md,
    gap: espaces.md,
  },
  ligneBail: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: espaces.md,
    paddingHorizontal: espaces.md,
    borderRadius: rayons.md,
  },
  ligneBailActive: {
    backgroundColor: couleurs.accentTresClair,
  },
  ligneBailTexte: {
    flex: 1,
  },
  nomBail: {
    ...typographie.corpsAppuye,
    color: couleurs.texte,
  },
  datesBail: {
    ...typographie.petit,
    color: couleurs.texteSecondaire,
  },
  coche: {
    ...typographie.titreSection,
    color: couleurs.accent,
  },
});

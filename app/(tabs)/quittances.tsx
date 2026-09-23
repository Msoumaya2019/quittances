/**
 * Onglet QUITTANCES.
 *
 * Deux usages :
 *  - générer en une fois les quittances du mois : les logements intégralement
 *    payés sont présélectionnés, on décoche ceux qu'on ne veut pas, on lance ;
 *  - parcourir tous les documents déjà émis, toutes années confondues.
 *
 * La génération de masse est séquentielle et tolérante : l'échec sur un
 * logement ne prive jamais des autres documents.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import {
  BandeauMessage,
  Bouton,
  Carte,
  EcranVide,
  EnTeteEcran,
  LigneDetail,
  PastilleStatut,
  SelecteurMois,
  Segments,
} from '@/ui/components';
import { couleurs, espaces, rayons, typographie } from '@/ui/tokens';
import { formatMontant } from '@/domain/money';
import { formaterDateFr, libelleLongCapitalise, versCle } from '@/domain/period';
import { LIBELLE_DOCUMENT } from '@/domain/types';
import type { Document } from '@/domain/types';
import { useApplication } from '@/state/ApplicationContext';
import { useDonneesAccueil, type CarteLogement } from '@/hooks/useAccueil';
import { tousLesDocuments } from '@/db/repositories/documents';
import {
  creerArchiveZip,
  genererEnSerie,
  nomArchivePourMois,
  partagerArchive,
} from '@/pdf/groupee';

type Vue = 'mois' | 'tous';

export default function EcranQuittances() {
  const {
    mois,
    cleRafraichissement,
    rafraichir,
    moisPrecedent,
    moisSuivant,
    revenirAuMoisCourant,
    estMoisCourant,
  } = useApplication();
  const insets = useSafeAreaInsets();
  const donnees = useDonneesAccueil(mois, cleRafraichissement);

  const [vue, setVue] = useState<Vue>('mois');
  const [ecartes, setEcartes] = useState<Set<string>>(new Set());
  const [documents, setDocuments] = useState<Document[]>([]);
  const [chargementDocs, setChargementDocs] = useState(true);
  const [travail, setTravail] = useState(false);
  const [bilan, setBilan] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  /** Clé `AAAA-MM` du mois affiché : l'unique forme utilisée par la base. */
  const cleDuMois = versCle(mois);

  const chargerDocuments = useCallback(async () => {
    try {
      setDocuments(await tousLesDocuments());
      setErreur(null);
    } catch (e) {
      setErreur(
        e instanceof Error ? e.message : 'Impossible de lire les documents pour le moment.',
      );
    } finally {
      setChargementDocs(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      chargerDocuments();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  /** Logements intégralement payés pour le mois affiché : la présélection. */
  const aGenerer = useMemo(
    () =>
      donnees.cartes.filter(
        (c) => c.statut === 'paye' && c.documentExistant?.type !== 'quittance',
      ),
    [donnees.cartes],
  );

  const selection = useMemo(
    () => aGenerer.filter((c) => !ecartes.has(c.logement.id)),
    [aGenerer, ecartes],
  );

  const documentsDuMois = useMemo(
    () => documents.filter((d) => d.periode === cleDuMois),
    [documents, cleDuMois],
  );

  function basculer(logementId: string) {
    setEcartes((precedent) => {
      const suivant = new Set(precedent);
      if (suivant.has(logementId)) suivant.delete(logementId);
      else suivant.add(logementId);
      return suivant;
    });
  }

  async function genererLaSerie() {
    if (selection.length === 0) return;
    setTravail(true);
    setBilan(null);
    setErreur(null);

    try {
      const resultat = await genererEnSerie(
        selection.map((c) => ({
          logementId: c.logement.id,
          periode: cleDuMois,
          type: 'quittance' as const,
        })),
      );

      const reussis = resultat.resultats.filter((r) => r.succes).length;
      const echoues = resultat.resultats.length - reussis;

      setBilan(
        echoues === 0
          ? `${reussis} ${reussis > 1 ? 'quittances générées' : 'quittance générée'} avec succès.`
          : `${reussis} ${reussis > 1 ? 'quittances générées' : 'quittance générée'}, ${echoues} en échec.`,
      );

      if (echoues > 0) {
        const premiers = resultat.resultats
          .filter((r) => !r.succes)
          .slice(0, 3)
          .map((r) => r.erreur)
          .filter(Boolean);
        if (premiers.length > 0) setErreur(premiers.join(' '));
      }

      rafraichir();
      await chargerDocuments();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La génération groupée a échoué.');
    } finally {
      setTravail(false);
    }
  }

  async function exporterArchive() {
    setTravail(true);
    setErreur(null);
    try {
      const resultat = await genererEnSerie(
        selection.map((c) => ({
          logementId: c.logement.id,
          periode: cleDuMois,
          type: 'quittance' as const,
        })),
      );

      const emis = resultat.resultats
        .filter((r) => r.succes && r.document)
        .map((r) => r.document!);

      if (emis.length === 0) {
        setErreur('Aucun document n’a pu être préparé pour l’archive.');
        return;
      }

      // On ne met dans l'archive que les fichiers réellement présents sur le
      // téléphone : un document enregistré en base sans son PDF ferait échouer
      // l'archive entière.
      const presents: Document[] = [];
      for (const d of emis) {
        const { documentExiste } = await import('@/pdf/partage');
        if (await documentExiste(d.cheminFichier)) presents.push(d);
      }

      if (presents.length === 0) {
        setErreur('Les fichiers PDF n’ont pas été retrouvés sur l’appareil.');
        return;
      }

      const chemin = await creerArchiveZip(presents, nomArchivePourMois(cleDuMois));
      await partagerArchive(chemin);

      setBilan(
        `${presents.length} ${presents.length > 1 ? 'documents regroupés' : 'document regroupé'} dans l’archive.`,
      );

      rafraichir();
      await chargerDocuments();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'archive n'a pas pu être créée.");
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
        <EnTeteEcran titre="Quittances" />

        <Segments
          segments={[
            { valeur: 'mois', libelle: 'Ce mois-ci' },
            { valeur: 'tous', libelle: 'Tous les documents' },
          ]}
          valeur={vue}
          onChanger={(v: Vue) => setVue(v)}
        />

        {vue === 'mois' ? (
          <>
            <SelecteurMois
              periode={mois}
              onPrecedent={moisPrecedent}
              onSuivant={moisSuivant}
              onAujourdhui={revenirAuMoisCourant}
              estMoisCourant={estMoisCourant}
            />

            {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}
            {bilan ? <BandeauMessage ton="succes" message={bilan} /> : null}

            {/* Génération groupée */}
            <Carte>
              <Text style={styles.section}>Générer les quittances du mois</Text>

              {aGenerer.length === 0 ? (
                <Text style={styles.aide}>
                  {documentsDuMois.length > 0
                    ? 'Les quittances de ce mois ont déjà toutes été générées.'
                    : `Aucun logement n’est intégralement payé pour ${libelleLongCapitalise(mois)}. Enregistrez les paiements, la quittance devient alors disponible.`}
                </Text>
              ) : (
                <>
                  <Text style={styles.aide}>
                    Les logements intégralement payés sont présélectionnés. Décochez ceux que
                    vous ne souhaitez pas inclure.
                  </Text>

                  {aGenerer.map((c) => {
                    const coche = !ecartes.has(c.logement.id);
                    return (
                      <Pressable
                        key={c.logement.id}
                        onPress={() => basculer(c.logement.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: coche }}
                        accessibilityLabel={`${c.logement.nom}, ${formatMontant(c.montantDu.total)}`}
                        style={styles.ligneSelection}
                      >
                        <View style={[styles.case, coche && styles.caseCochee]}>
                          {coche ? <Text style={styles.coche}>✓</Text> : null}
                        </View>
                        <View style={styles.ligneSelectionTextes}>
                          <Text style={[typographie.corpsAppuye, styles.nomSelection]}>
                            {c.logement.nom}
                          </Text>
                          <Text style={[typographie.petit, styles.detailSelection]}>
                            {formatMontant(c.montantDu.total, { decimales: 'auto' })}
                          </Text>
                        </View>
                        <PastilleStatut statut={c.statut} compacte />
                      </Pressable>
                    );
                  })}

                  <View style={styles.actionsGeneration}>
                    <Bouton
                      libelle={
                        selection.length > 0
                          ? `Générer ${selection.length} ${selection.length > 1 ? 'quittances' : 'quittance'}`
                          : 'Aucune quittance sélectionnée'
                      }
                      desactive={selection.length === 0}
                      occupe={travail}
                      onPress={genererLaSerie}
                    />

                    {selection.length > 1 ? (
                      <Bouton
                        libelle="Générer et exporter en archive"
                        variante="secondaire"
                        desactive={travail}
                        onPress={exporterArchive}
                      />
                    ) : null}
                  </View>
                </>
              )}
            </Carte>

            {/* Documents émis pour ce mois */}
            <Carte>
              <Text style={styles.section}>
                Documents de {libelleLongCapitalise(mois)}
              </Text>

              {documentsDuMois.length === 0 ? (
                <Text style={styles.aide}>Aucun document n’a encore été émis pour ce mois.</Text>
              ) : (
                documentsDuMois.map((d) => (
                  <Pressable
                    key={d.id}
                    onPress={() =>
                      router.push({
                        pathname: '/quittance/apercu',
                        params: { documentId: d.id },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Ouvrir ${LIBELLE_DOCUMENT[d.type]} ${d.numero}`}
                    style={styles.ligneDocument}
                  >
                    <View style={styles.ligneDocumentTextes}>
                      <Text style={[typographie.corpsAppuye, styles.typeDocument]}>
                        {LIBELLE_DOCUMENT[d.type]}
                      </Text>
                      <Text style={[typographie.petit, styles.detailSelection]}>
                        N° {d.numero} · {formaterDateFr(d.dateEmission)}
                      </Text>
                    </View>
                    <Text style={[typographie.corpsAppuye, styles.montantDocument]}>
                      {formatMontant(d.total, { decimales: 'auto' })}
                    </Text>
                  </Pressable>
                ))
              )}
            </Carte>
          </>
        ) : (
          <>
            {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

            {chargementDocs ? (
              <Text style={styles.chargement}>Chargement…</Text>
            ) : documents.length === 0 ? (
              <EcranVide
                titre="Aucun document pour l’instant"
                message="Vos quittances, reçus et avis d’échéance apparaîtront ici, toutes années confondues."
                illustration="document"
                actionLibelle="Voir le mois en cours"
                actionOnPress={() => setVue('mois')}
              />
            ) : (
              <Carte>
                <Text style={styles.section}>
                  {documents.length} {documents.length > 1 ? 'documents émis' : 'document émis'}
                </Text>
                {documents.slice(0, 60).map((d) => (
                  <Pressable
                    key={d.id}
                    onPress={() =>
                      router.push({
                        pathname: '/quittance/apercu',
                        params: { documentId: d.id },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Ouvrir ${LIBELLE_DOCUMENT[d.type]} ${d.numero}`}
                    style={styles.ligneDocument}
                  >
                    <View style={styles.ligneDocumentTextes}>
                      <Text style={[typographie.corpsAppuye, styles.typeDocument]}>
                        {LIBELLE_DOCUMENT[d.type]} · {libelleLongCapitaliseCourte(d.periode)}
                      </Text>
                      <Text style={[typographie.petit, styles.detailSelection]}>
                        N° {d.numero} · émis le {formaterDateFr(d.dateEmission)}
                      </Text>
                    </View>
                    <Text style={[typographie.corpsAppuye, styles.montantDocument]}>
                      {formatMontant(d.total, { decimales: 'auto' })}
                    </Text>
                  </Pressable>
                ))}
                {documents.length > 60 ? (
                  <LigneDetail
                    libelle="Affichage limité"
                    valeur={`${documents.length - 60} autres documents plus anciens`}
                  />
                ) : null}
              </Carte>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** `2026-09` devient `septembre 2026`. */
function libelleLongCapitaliseCourte(cle: string): string {
  const annee = Number(cle.slice(0, 4));
  const mois = Number(cle.slice(5, 7));
  if (!Number.isFinite(annee) || !Number.isFinite(mois)) return cle;
  return libelleLongCapitalise({ annee, mois });
}

const styles = StyleSheet.create({
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
  ligneSelection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.md,
    paddingVertical: espaces.md,
    borderRadius: rayons.md,
  },
  case: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: couleurs.bordureForte,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caseCochee: {
    backgroundColor: couleurs.vert,
    borderColor: couleurs.vert,
  },
  coche: {
    color: couleurs.texteSurFonce,
    fontSize: 15,
    fontWeight: '700',
  },
  ligneSelectionTextes: {
    flex: 1,
  },
  nomSelection: {
    color: couleurs.texte,
  },
  detailSelection: {
    color: couleurs.texteSecondaire,
  },
  actionsGeneration: {
    marginTop: espaces.lg,
    gap: espaces.md,
  },
  ligneDocument: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.md,
    paddingVertical: espaces.md,
    borderRadius: rayons.md,
  },
  ligneDocumentTextes: {
    flex: 1,
  },
  typeDocument: {
    color: couleurs.texte,
  },
  montantDocument: {
    color: couleurs.texte,
  },
});

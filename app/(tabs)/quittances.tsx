/**
 * Onglet QUITTANCE.
 *
 * Trois usages :
 *  - **Un logement** : le mois affiché, un bouton par logement qui produit la
 *    quittance **immédiatement** — sans écran intermédiaire. Toucher le nom du
 *    logement ouvre l'aperçu, pour vérifier avant d'émettre ;
 *  - **À rattraper** : les mois intégralement réglés qui n'ont pas encore leur
 *    quittance, tous logements confondus, du plus récent au plus ancien. C'est
 *    là qu'une quittance oubliée il y a sept mois se retrouve, sans faire
 *    défiler les mois un par un ;
 *  - **Déjà émis** : toutes les quittances produites, toutes années confondues.
 *
 * L'application ne produit que des quittances. Un mois qui ne donne pas droit à
 * une quittance n'a pas de bouton « Générer » : il propose d'enregistrer le
 * paiement, seul geste qui ouvre ce droit.
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
  SelecteurMois,
  Segments,
} from '@/ui/components';
import { espaces, rayons, typographie } from '@/ui/tokens';
import { formatMontant } from '@/domain/money';
import { formaterDateFr, libelleLongCapitalise, versCle } from '@/domain/period';
import { LIBELLE_DOCUMENT } from '@/domain/types';
import type { Document } from '@/domain/types';
import { useApplication } from '@/state/ApplicationContext';
import { useDonneesAccueil, type CarteLogement } from '@/hooks/useAccueil';
import { tousLesDocuments } from '@/db/repositories/documents';
import { emettreDocument, ErreurEmission } from '@/pdf/render';
import {
  creerArchiveZip,
  genererEnSerie,
  nomArchivePourMois,
  partagerArchive,
} from '@/pdf/groupee';
import { useStyles, type Couleurs } from '@/ui/theme';

type Vue = 'un' | 'rattraper' | 'tous';

export default function EcranQuittances() {
  const styles = useStyles(creerStyles);
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

  const [vue, setVue] = useState<Vue>('un');
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

  /** Logements du mois affiché dont la quittance reste à produire. */
  const aGenerer = useMemo(
    () => donnees.cartes.filter((c) => c.statut === 'paye' && !c.documentExistant),
    [donnees.cartes],
  );

  const documentsDuMois = useMemo(
    () => documents.filter((d) => d.periode === cleDuMois),
    [documents, cleDuMois],
  );

  /**
   * Produit **une** quittance et enchaîne sur l'écran de confirmation.
   *
   * C'est le « un clic » : aucun écran intermédiaire, aucun formulaire. Si le
   * mois n'est pas réglé, `emettreDocument` refuse et le message est affiché tel
   * quel — c'est le garde-fou qui parle, pas l'écran.
   */
  async function genererQuittance(logementId: string, cle: string) {
    setTravail(true);
    setBilan(null);
    setErreur(null);

    try {
      const produit = await emettreDocument({
        logementId,
        periode: cle,
        type: 'quittance',
      });

      rafraichir();
      await chargerDocuments();

      router.push({
        pathname: '/quittance/succes',
        params: { documentId: produit.id },
      });
    } catch (e) {
      setErreur(
        e instanceof ErreurEmission
          ? e.message
          : "La quittance n'a pas pu être générée. Réessayez dans un instant.",
      );
    } finally {
      setTravail(false);
    }
  }

  /** Résume une série : combien de quittances, combien d'échecs. */
  function resumerSerie(reussis: number, echoues: number) {
    setBilan(
      echoues === 0
        ? `${reussis} ${reussis > 1 ? 'quittances générées' : 'quittance générée'} avec succès.`
        : `${reussis} ${reussis > 1 ? 'quittances générées' : 'quittance générée'}, ${echoues} en échec.`,
    );
  }

  async function genererLaSerie() {
    if (aGenerer.length === 0) return;
    setTravail(true);
    setBilan(null);
    setErreur(null);

    try {
      const resultat = await genererEnSerie(
        aGenerer.map((c) => ({
          logementId: c.logement.id,
          periode: cleDuMois,
          type: 'quittance' as const,
        })),
      );

      const reussis = resultat.resultats.filter((r) => r.succes).length;
      resumerSerie(reussis, resultat.resultats.length - reussis);

      const echecs = resultat.resultats.filter((r) => !r.succes);
      if (echecs.length > 0) {
        const premiers = echecs.slice(0, 3).map((r) => r.erreur).filter(Boolean);
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
    if (aGenerer.length === 0) return;
    setTravail(true);
    setBilan(null);
    setErreur(null);

    try {
      const resultat = await genererEnSerie(
        aGenerer.map((c) => ({
          logementId: c.logement.id,
          periode: cleDuMois,
          type: 'quittance' as const,
        })),
      );

      const reussis = resultat.resultats.filter((r) => r.succes).length;
      resumerSerie(reussis, resultat.resultats.length - reussis);

      const emis = resultat.resultats
        .filter((r) => r.succes && r.document)
        .map((r) => r.document!);

      // On ne met dans l'archive que les fichiers réellement présents sur le
      // téléphone : une quittance enregistrée en base sans son PDF ferait
      // échouer l'archive entière.
      const { documentExiste } = await import('@/pdf/partage');
      const presents: Document[] = [];
      for (const d of emis) {
        if (await documentExiste(d.cheminFichier)) presents.push(d);
      }

      if (presents.length === 0) {
        setErreur('Les fichiers PDF n’ont pas été retrouvés sur l’appareil.');
        return;
      }

      const chemin = await creerArchiveZip(presents, nomArchivePourMois(cleDuMois));
      await partagerArchive(chemin);

      rafraichir();
      await chargerDocuments();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'archive n'a pas pu être créée.");
    } finally {
      setTravail(false);
    }
  }

  function ouvrirApercu(logementId: string, cle: string) {
    router.push({
      pathname: '/quittance/apercu',
      params: { logementId, periode: cle },
    });
  }

  function ouvrirPaiement(c: CarteLogement) {
    router.push({
      pathname: '/paiement/[propertyId]',
      params: { propertyId: c.logement.id, periode: cleDuMois },
    });
  }

  function ouvrirDocument(id: string) {
    router.push({ pathname: '/quittance/apercu', params: { documentId: id } });
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
            { valeur: 'un', libelle: 'Un logement' },
            { valeur: 'rattraper', libelle: 'À rattraper' },
            { valeur: 'tous', libelle: 'Déjà émis' },
          ]}
          valeur={vue}
          onChanger={(v: Vue) => setVue(v)}
        />

        {vue === 'un' ? (
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

            <Carte>
              <Text style={styles.section}>Choisir un logement</Text>
              <Text style={styles.aide}>
                « Générer » produit la quittance tout de suite. Touchez le nom du logement pour
                vérifier avant d’émettre.
              </Text>

              {donnees.cartes.length === 0 ? (
                <Text style={styles.aide}>Aucun logement enregistré pour l’instant.</Text>
              ) : (
                donnees.cartes.map((c) => {
                  const quittanceEmise = c.documentExistant?.type === 'quittance';
                  const peutGenerer = c.statut === 'paye' && !quittanceEmise;

                  return (
                    <View key={c.logement.id} style={styles.ligne}>
                      <Pressable
                        onPress={() => ouvrirApercu(c.logement.id, cleDuMois)}
                        accessibilityRole="button"
                        accessibilityLabel={`Vérifier la quittance de ${c.logement.nom}`}
                        style={styles.ligneTextes}
                      >
                        <Text style={[typographie.corpsAppuye, styles.titreLigne]}>
                          {c.logement.nom}
                        </Text>
                        <Text style={[typographie.petit, styles.detailLigne]}>
                          {c.statut === 'paye'
                            ? `${formatMontant(c.montantDu.total, { decimales: 'auto' })} — intégralement payé`
                            : `${formatMontant(c.montantDu.total, { decimales: 'auto' })} — ${formatMontant(c.solde, { decimales: 'auto' })} restant`}
                        </Text>
                      </Pressable>

                      {quittanceEmise ? (
                        <Bouton
                          libelle="Voir"
                          variante="secondaire"
                          compact
                          pleineLargeur={false}
                          onPress={() => ouvrirDocument(c.documentExistant!.id)}
                          accessibilite={`Voir la quittance de ${c.logement.nom}`}
                        />
                      ) : peutGenerer ? (
                        <Bouton
                          libelle="Générer"
                          compact
                          pleineLargeur={false}
                          occupe={travail}
                          onPress={() => void genererQuittance(c.logement.id, cleDuMois)}
                          accessibilite={`Générer la quittance de ${c.logement.nom}`}
                        />
                      ) : (
                        <Bouton
                          libelle="Payer"
                          variante="secondaire"
                          compact
                          pleineLargeur={false}
                          onPress={() => ouvrirPaiement(c)}
                          accessibilite={`Enregistrer le paiement de ${c.logement.nom}`}
                        />
                      )}
                    </View>
                  );
                })
              )}

              {aGenerer.length > 1 ? (
                <View style={styles.actionsSerie}>
                  <Bouton
                    libelle={`Générer les ${aGenerer.length} quittances du mois`}
                    variante="secondaire"
                    desactive={travail}
                    onPress={genererLaSerie}
                  />
                  <Bouton
                    libelle="Générer et exporter en archive"
                    variante="discret"
                    desactive={travail}
                    onPress={exporterArchive}
                  />
                </View>
              ) : null}
            </Carte>

            {documentsDuMois.length > 0 ? (
              <Carte>
                <Text style={styles.section}>Quittances de {libelleLongCapitalise(mois)}</Text>

                {documentsDuMois.map((d) => (
                  <Pressable
                    key={d.id}
                    onPress={() => ouvrirDocument(d.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Ouvrir ${LIBELLE_DOCUMENT[d.type]} ${d.numero}`}
                    style={styles.ligne}
                  >
                    <View style={styles.ligneTextes}>
                      <Text style={[typographie.corpsAppuye, styles.titreLigne]}>
                        {LIBELLE_DOCUMENT[d.type]}
                      </Text>
                      <Text style={[typographie.petit, styles.detailLigne]}>
                        N° {d.numero} · {formaterDateFr(d.dateEmission)}
                      </Text>
                    </View>
                    <Text style={[typographie.corpsAppuye, styles.montant]}>
                      {formatMontant(d.total, { decimales: 'auto' })}
                    </Text>
                  </Pressable>
                ))}
              </Carte>
            ) : null}
          </>
        ) : vue === 'rattraper' ? (
          <>
            {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}
            {bilan ? <BandeauMessage ton="succes" message={bilan} /> : null}

            {donnees.chargement ? (
              <Text style={styles.chargement}>Chargement…</Text>
            ) : donnees.rattrapage.length === 0 ? (
              <EcranVide
                titre="Aucune quittance oubliée"
                message="Tous les mois intégralement réglés ont leur quittance. Rien à rattraper."
                illustration="document"
                actionLibelle="Voir le mois en cours"
                actionOnPress={() => setVue('un')}
              />
            ) : (
              <Carte>
                <Text style={styles.section}>
                  {donnees.rattrapage.length}{' '}
                  {donnees.rattrapage.length > 1
                    ? 'quittances à rattraper'
                    : 'quittance à rattraper'}
                </Text>
                <Text style={styles.aide}>
                  Ces mois ont été intégralement réglés, mais leur quittance n’a jamais été
                  produite. Un appui suffit, même plusieurs mois après.
                </Text>

                {donnees.rattrapage.map((ligne) => {
                  const cle = versCle(ligne.periode);
                  return (
                    <View key={`${ligne.logement.id}-${cle}`} style={styles.ligne}>
                      <Pressable
                        onPress={() => ouvrirApercu(ligne.logement.id, cle)}
                        accessibilityRole="button"
                        accessibilityLabel={`Vérifier ${libelleLongCapitalise(ligne.periode)} pour ${ligne.logement.nom}`}
                        style={styles.ligneTextes}
                      >
                        <Text style={[typographie.corpsAppuye, styles.titreLigne]}>
                          {libelleLongCapitalise(ligne.periode)}
                        </Text>
                        <Text style={[typographie.petit, styles.detailLigne]}>
                          {ligne.logement.nom} ·{' '}
                          {formatMontant(ligne.montantDu.total, { decimales: 'auto' })}
                          {ligne.ancienneteMois > 0 ? ` · il y a ${ligne.ancienneteMois} mois` : ''}
                        </Text>
                      </Pressable>

                      <Bouton
                        libelle="Générer"
                        compact
                        pleineLargeur={false}
                        occupe={travail}
                        onPress={() => void genererQuittance(ligne.logement.id, cle)}
                        accessibilite={`Générer la quittance de ${libelleLongCapitalise(ligne.periode)}`}
                      />
                    </View>
                  );
                })}
              </Carte>
            )}
          </>
        ) : (
          <>
            {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

            {chargementDocs ? (
              <Text style={styles.chargement}>Chargement…</Text>
            ) : documents.length === 0 ? (
              <EcranVide
                titre="Aucune quittance pour l’instant"
                message="Vos quittances apparaîtront ici, toutes années confondues."
                illustration="document"
                actionLibelle="Voir le mois en cours"
                actionOnPress={() => setVue('un')}
              />
            ) : (
              <Carte>
                <Text style={styles.section}>
                  {documents.length} {documents.length > 1 ? 'quittances émises' : 'quittance émise'}
                </Text>
                {documents.slice(0, 60).map((d) => (
                  <Pressable
                    key={d.id}
                    onPress={() => ouvrirDocument(d.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Ouvrir ${LIBELLE_DOCUMENT[d.type]} ${d.numero}`}
                    style={styles.ligne}
                  >
                    <View style={styles.ligneTextes}>
                      <Text style={[typographie.corpsAppuye, styles.titreLigne]}>
                        {LIBELLE_DOCUMENT[d.type]} · {libelleLongCapitaliseCourte(d.periode)}
                      </Text>
                      <Text style={[typographie.petit, styles.detailLigne]}>
                        N° {d.numero} · émis le {formaterDateFr(d.dateEmission)}
                      </Text>
                    </View>
                    <Text style={[typographie.corpsAppuye, styles.montant]}>
                      {formatMontant(d.total, { decimales: 'auto' })}
                    </Text>
                  </Pressable>
                ))}
                {documents.length > 60 ? (
                  <LigneDetail
                    libelle="Affichage limité"
                    valeur={`${documents.length - 60} autres quittances plus anciennes`}
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
    paddingVertical: espaces.sm,
    borderRadius: rayons.md,
  },
  ligneTextes: {
    flex: 1,
    paddingVertical: espaces.sm,
  },
  titreLigne: {
    color: couleurs.texte,
  },
  detailLigne: {
    color: couleurs.texteSecondaire,
  },
  montant: {
    color: couleurs.texte,
  },
  actionsSerie: {
    marginTop: espaces.lg,
    gap: espaces.md,
  },
});

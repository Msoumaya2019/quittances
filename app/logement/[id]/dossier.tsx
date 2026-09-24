/**
 * Dossier documentaire d'un logement.
 *
 * C'est l'écran qui répond à « qu'est-ce qui a été signé, pour ce logement, et
 * avec qui ? ». Il présente le logement comme une **succession de locations** :
 *
 *   locataire en place → bail → état des lieux d'entrée → état des lieux de
 *   sortie → inventaire → quittances → autres documents
 *
 * puis, en dessous, les locations terminées — avec leurs documents intacts. Un
 * locataire qui part ne voit rien disparaître : ses quittances, son bail et ses
 * états des lieux restent dans son dossier. C'est la seule façon de répondre à
 * une contestation portant sur une location terminée, parfois plusieurs années
 * après.
 *
 * Les pièces rattachées au bien — un diagnostic, une facture de travaux — sont
 * présentées à part, sous « Le logement » : elles ne concernent aucun locataire,
 * et les ranger sous l'un d'eux ferait croire qu'elles lui sont propres.
 *
 * L'écran ne fabrique aucun document : il range, il ouvre, il partage. Les
 * documents produits par l'application viendront de leurs propres écrans.
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
} from '@/ui/components';
import { espaces, rayons, typographie } from '@/ui/tokens';
import { formaterDateFr } from '@/domain/period';
import { nomPourDocument } from '@/domain/types';
import type {
  Bail,
  Document,
  Logement,
  PieceDossier,
  TitulaireBail,
} from '@/domain/types';
import { construireDossier, type ElementDossier, type SectionDossier } from '@/domain/dossier';
import { useApplication } from '@/state/ApplicationContext';
import {
  bauxDuLogement,
  titulairesParBail,
  trouverLogement,
} from '@/db/repositories/properties';
import { piecesDuLogement } from '@/db/repositories/pieces';
import { documentsDuLogement } from '@/db/repositories/documents';
import { partagerDocument } from '@/pdf/partage';
import { useStyles, type Couleurs } from '@/ui/theme';

interface Etat {
  logement: Logement;
  bails: Bail[];
  titulaires: TitulaireBail[];
  pieces: PieceDossier[];
  documents: Document[];
}

export default function EcranDossierLogement() {
  const styles = useStyles(creerStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { cleRafraichissement } = useApplication();

  const [etat, setEtat] = useState<Etat | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  /**
   * Les locations dépliées, par identifiant de bail.
   *
   * L'absence d'entrée n'est pas « fermé » : c'est « comme par défaut ». Le
   * défaut est **déplié pour la location en cours**, replié pour les locations
   * terminées — sinon un logement qui a connu cinq locataires ouvrirait cinq
   * dossiers à la fois, et il faudrait faire défiler pour trouver celui du
   * locataire en place. Un `Set` de « ce qui est ouvert » n'aurait pas su
   * exprimer ce défaut, et aurait demandé un effet pour l'initialiser.
   */
  const [bascules, setBascules] = useState<Record<string, boolean>>({});

  const charger = useCallback(async () => {
    if (!id) return;
    try {
      const logement = await trouverLogement(id);
      if (!logement) {
        setErreur("Ce logement n'existe plus.");
        setEtat(null);
        return;
      }

      const [bails, pieces, documents, titulairesIndex] = await Promise.all([
        bauxDuLogement(logement.id),
        piecesDuLogement(logement.id),
        documentsDuLogement(logement.id),
        titulairesParBail(),
      ]);

      const titulaires: TitulaireBail[] = [];
      for (const bail of bails) titulaires.push(...(titulairesIndex.get(bail.id) ?? []));

      setEtat({ logement, bails, titulaires, pieces, documents });
      setErreur(null);
    } catch (e) {
      setErreur(
        e instanceof Error ? e.message : 'Impossible de charger ce dossier pour le moment.',
      );
    } finally {
      setChargement(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger, cleRafraichissement]),
  );

  const dossier = useMemo(
    () =>
      etat
        ? construireDossier({
            bails: etat.bails,
            titulaires: etat.titulaires,
            pieces: etat.pieces,
            documents: etat.documents,
          })
        : null,
    [etat],
  );

  // La location en cours est dépliée par défaut ; les autres, repliées.
  function estOuverte(bailId: string, enCours: boolean): boolean {
    return bascules[bailId] ?? enCours;
  }

  async function ouvrir(element: ElementDossier) {
    setErreur(null);

    if (element.origine === 'document') {
      router.push({ pathname: '/quittance/apercu', params: { documentId: element.id } });
      return;
    }

    if (!element.cheminFichier) {
      setErreur(
        `Le fichier de « ${element.libelle} » n’est plus dans l’application. ` +
          'Le document reste listé, mais il n’y a plus rien à ouvrir.',
      );
      return;
    }

    try {
      const ouvert = await partagerDocument(element.cheminFichier, element.libelle);
      if (!ouvert) {
        setErreur(
          `Le fichier de « ${element.libelle} » est introuvable sur ce téléphone.`,
        );
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le document n'a pas pu être ouvert.");
    }
  }

  function basculer(bailId: string, enCours: boolean) {
    setBascules((actuelles) => ({
      ...actuelles,
      [bailId]: !(actuelles[bailId] ?? enCours),
    }));
  }

  function ajouter(logementId: string, bailId: string | null, type?: string) {
    router.push({
      pathname: '/document/ajouter',
      params: {
        logementId,
        ...(bailId ? { bailId } : {}),
        ...(type ? { type } : {}),
      },
    });
  }

  const logement = etat?.logement ?? null;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.conteneur,
        { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + espaces.enorme },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <EnTeteEcran
        titre="Documents"
        sousTitre={logement ? `${logement.nom} · ${logement.ville}` : undefined}
        actionLibelle="+ Ajouter"
        actionOnPress={() => logement && ajouter(logement.id, null)}
      />

      {erreur ? <BandeauMessage ton="erreur" message={erreur} /> : null}

      {chargement && !etat ? <Text style={styles.chargement}>Chargement…</Text> : null}

      {logement && dossier ? (
        <>
          {dossier.occupations.length === 0 ? (
            <Carte>
              <Text style={styles.section}>Locataire</Text>
              <Text style={styles.aide}>
                Aucun locataire n’a encore occupé ce logement. Les documents que vous rangerez ici
                sont conservés avec le logement, et se rattacheront au locataire dès qu’il y en
                aura un.
              </Text>
              <Bouton
                libelle="Ajouter un document"
                variante="secondaire"
                onPress={() => ajouter(logement.id, null)}
              />
            </Carte>
          ) : null}

          {dossier.occupations.map((occupation) => {
            const noms = occupation.titulaires.map((t) => nomPourDocument(t));
            const titre =
              noms.length === 0
                ? 'Locataire sans nom enregistré'
                : noms.join(' et ');
            const ouverte = estOuverte(occupation.bail.id, occupation.enCours);

            const vides = occupation.sections.filter((s) => s.elements.length === 0);
            const remplies = occupation.sections.filter((s) => s.elements.length > 0);

            return (
              <Carte key={occupation.bail.id}>
                <Pressable
                  onPress={() => basculer(occupation.bail.id, occupation.enCours)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: ouverte }}
                  accessibilityLabel={`${titre}, ${occupation.enCours ? 'location en cours' : 'location terminée'}`}
                  style={styles.enteteOccupation}
                >
                  <View style={styles.enteteTextes}>
                    <Text style={styles.nom}>{titre}</Text>
                    <Text style={styles.dates}>
                      {occupation.enCours ? 'En place' : 'Parti'}
                      {' · '}
                      {formaterDateFr(occupation.bail.dateEntree)}
                      {occupation.bail.dateSortie
                        ? ` → ${formaterDateFr(occupation.bail.dateSortie)}`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{ouverte ? '▾' : '▸'}</Text>
                </Pressable>

                {!ouverte ? (
                  <Text style={styles.resume}>
                    {occupation.nombre === 0
                      ? 'Aucun document rangé'
                      : `${occupation.nombre} document${occupation.nombre > 1 ? 's' : ''} rangé${occupation.nombre > 1 ? 's' : ''}`}
                  </Text>
                ) : (
                  <>
                    {remplies.length === 0 ? (
                      <Text style={styles.aide}>
                        Aucun document rangé pour cette location.
                      </Text>
                    ) : (
                      remplies.map((section) => (
                        <Section
                          key={section.cle}
                          section={section}
                          onOuvrir={(element) => void ouvrir(element)}
                        />
                      ))
                    )}

                    {vides.length > 0 ? (
                      <Text style={styles.manques}>
                        Pas encore rangé : {vides.map((s) => s.libelle).join(', ')}.
                      </Text>
                    ) : null}

                    <View style={styles.actionsOccupation}>
                      <Bouton
                        libelle="Ranger un document"
                        variante="discret"
                        compact
                        pleineLargeur={false}
                        onPress={() => ajouter(logement.id, occupation.bail.id)}
                      />
                    </View>
                  </>
                )}
              </Carte>
            );
          })}

          <Carte>
            <Text style={styles.section}>Le logement</Text>
            <LigneDetail libelle="Adresse" valeur={logement.adresse} />
            <LigneDetail
              libelle="Ville"
              valeur={`${logement.codePostal} ${logement.ville}`.trim()}
            />
            {logement.reference ? (
              <LigneDetail libelle="Référence" valeur={logement.reference} />
            ) : null}
            <LigneDetail libelle="Documents rangés" valeur={String(etat?.pieces.length ?? 0)} />
            <LigneDetail
              libelle="Quittances émises"
              valeur={String(etat?.documents.length ?? 0)}
            />

            {/* Les documents qui ne concernent aucune location : un diagnostic,
                une facture de travaux, un acte de propriété. Ils sont rangés
                ici, sous le bien, parce que les rattacher à un locataire ferait
                croire qu'ils lui sont propres. */}
            {dossier.bien.length > 0 ? (
              <>
                <Text style={styles.sectionBien}>Documents du bien</Text>
                {dossier.bien.map((element) => (
                  <Pressable
                    key={`bien-${element.id}`}
                    onPress={() => void ouvrir(element)}
                    accessibilityRole="button"
                    accessibilityLabel={`${element.libelle}, ${formaterDateFr(element.date)}`}
                    style={({ pressed }) => [styles.ligne, pressed && styles.ligneAppuyee]}
                  >
                    <View style={styles.ligneTextes}>
                      <Text style={[typographie.corpsAppuye, styles.titreLigne]}>
                        {element.libelle}
                      </Text>
                      <Text style={[typographie.petit, styles.detailLigne]}>
                        {formaterDateFr(element.date)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </>
            ) : null}
          </Carte>
        </>
      ) : null}
    </ScrollView>
  );
}

/** Une section du dossier : son titre, puis ses documents. */
function Section({
  section,
  onOuvrir,
}: {
  section: SectionDossier;
  onOuvrir: (element: ElementDossier) => void;
}) {
  const styles = useStyles(creerStyles);

  return (
    <View style={styles.sectionBloc}>
      <Text style={styles.section}>{section.libelle}</Text>
      {section.elements.map((element) => (
        <Pressable
          key={element.id}
          onPress={() => onOuvrir(element)}
          accessibilityRole="button"
          accessibilityLabel={`Ouvrir ${element.libelle}`}
          style={({ pressed }) => [styles.ligne, pressed && styles.ligneAppuyee]}
        >
          <View style={styles.ligneTextes}>
            <Text style={[typographie.corpsAppuye, styles.titreLigne]} numberOfLines={2}>
              {element.libelle}
            </Text>
            <Text style={[typographie.petit, styles.detailLigne]}>
              {element.numero ? `N° ${element.numero} · ` : ''}
              {formaterDateFr(element.date)}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
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
    enteteOccupation: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaces.md,
    },
    enteteTextes: {
      flex: 1,
      gap: 2,
    },
    nom: {
      ...typographie.titreSection,
      color: couleurs.texte,
    },
    dates: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
    },
    chevron: {
      ...typographie.titreCarte,
      color: couleurs.texteTertiaire,
      paddingHorizontal: espaces.xs,
    },
    resume: {
      ...typographie.petit,
      color: couleurs.texteTertiaire,
      marginTop: espaces.sm,
    },
    sectionBloc: {
      marginTop: espaces.md,
    },
    section: {
      ...typographie.petitAppuye,
      color: couleurs.texteTertiaire,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: espaces.sm,
    },
    sectionBien: {
      ...typographie.petitAppuye,
      color: couleurs.texteTertiaire,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: espaces.lg,
      marginBottom: espaces.sm,
    },
    aide: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      marginBottom: espaces.sm,
    },
    manques: {
      ...typographie.petit,
      color: couleurs.texteTertiaire,
      marginTop: espaces.md,
    },
    actionsOccupation: {
      marginTop: espaces.md,
    },
    ligne: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaces.md,
      paddingVertical: espaces.sm,
      borderRadius: rayons.md,
    },
    ligneAppuyee: {
      backgroundColor: couleurs.fondSurvol,
    },
    ligneTextes: {
      flex: 1,
      paddingVertical: espaces.sm,
      gap: 2,
    },
    titreLigne: {
      color: couleurs.texte,
    },
    detailLigne: {
      color: couleurs.texteSecondaire,
    },
  });

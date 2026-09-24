/**
 * Vérifier l'état des lieux avant de l'établir.
 *
 * Cet écran est la **relecture** : il montre, dans l'ordre des douze sections du
 * document, tout ce qui sera imprimé — pièce par pièce, élément par élément,
 * avec l'état relevé, les observations, les compteurs, les clés et les
 * signatures. Le bailleur relit donc son état des lieux avant qu'il n'existe.
 *
 * Deux choses y sont volontairement visibles, parce qu'elles seules justifient
 * une relecture :
 *
 *  1. **Les éléments sans état.** Ils sont comptés à part et nommés. Le
 *     document ne peut pas être établi tant qu'il en reste : un élément décrit
 *     sans dire dans quel état il est serait un constat inventé.
 *  2. **Les réserves.** Ce sont les avertissements du domaine — pièces sans
 *     photo, éléments « non vérifié », absence de relevé ou de clé. Ils
 *     n'empêchent pas d'établir le document, mais ils seront imprimés dedans :
 *     l'écran le dit avant, pas après.
 *
 * Il n'y a pas d'aperçu HTML intégré, et c'est le même choix que pour le bail :
 * afficher deux pages A4 dans un écran de téléphone suppose d'embarquer un
 * moteur de rendu web, pour montrer le document mal. Après établissement, le
 * PDF s'ouvre dans la visionneuse du système, à sa taille, avec sa pagination
 * réelle et ses photos.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import {
  BandeauMessage,
  BarreActionFixe,
  Carte,
  EcranVide,
  EnTeteEcran,
  LigneDetail,
} from '@/ui/components';
import { espaces, rayons, typographie } from '@/ui/tokens';
import { aujourdHui, formaterDateFr } from '@/domain/period';
import { adresseEnLignes, nomComplet } from '@/domain/types';
import {
  COMPTEURS,
  ETAPES_EDL,
  LIBELLE_TYPE_EDL,
  SOURCES_EDL,
  avertissementsDeLEdl,
  exemplairesNecessaires,
  libelleEtat,
  manquesDeLEdl,
  piecesInitiales,
  reprendreBrouillonEdl,
  sectionsEdl,
  signatairesAttendusDeLEdl,
  syntheseEdl,
} from '@/domain/etat-des-lieux';
import type { BrouillonEdl } from '@/domain/etat-des-lieux';
import { analyserDonnees } from '@/domain/brouillon';
import { formatMontant } from '@/domain/money';
import { chargerContexteBail, type ContexteBail } from '@/documents/bail-contexte';
import { lireBrouillon } from '@/db/repositories/brouillons';
import { emettreEtatDesLieux } from '@/pdf/emettre-etat-des-lieux';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, type Couleurs } from '@/ui/theme';

/** Le mot employé partout pour désigner le bailleur dans les signatures. */
const SIGNATAIRE_BAILLEUR = 'bailleur';

export default function EcranVerifierEtatDesLieux() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { rafraichir } = useApplication();

  const params = useLocalSearchParams<{ logementId?: string }>();
  const logementId = typeof params.logementId === 'string' ? params.logementId : null;

  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [contexte, setContexte] = useState<ContexteBail | null>(null);
  const [brouillon, setBrouillon] = useState<BrouillonEdl | null>(null);
  const [travail, setTravail] = useState(false);

  useEffect(() => {
    let actif = true;

    void (async () => {
      if (!logementId) {
        if (actif) {
          setErreur("Aucun logement n'a été indiqué.");
          setChargement(false);
        }
        return;
      }
      try {
        const charge = await chargerContexteBail(logementId);
        const enregistre = await lireBrouillon(charge.logement.id, 'etat_des_lieux');
        if (!actif) return;
        setContexte(charge);

        // On relit par le lecteur tolérant, celui du formulaire : l'écran montre
        // ainsi ce qui sera **réellement** imprimé, et non le contenu brut de la
        // base, qui peut porter des valeurs d'une version antérieure.
        setBrouillon(
          enregistre
            ? reprendreBrouillonEdl(analyserDonnees(JSON.stringify(enregistre.donnees)), {
                logementId: charge.logement.id,
                bailId: charge.bail?.id ?? '',
                type: 'entree',
                dateEdl: aujourdHui(),
                pieces: piecesInitiales(charge.logement.type),
                compteurs: [],
                cles: [],
                observations: '',
                mandataire: '',
                compteursIndividuels: undefined,
                signatures: [],
              })
            : null,
        );

        if (!enregistre) {
          setErreur(
            "Aucune saisie d'état des lieux n'est enregistrée pour ce logement. " +
              'Reprenez le formulaire.',
          );
        }
      } catch (e) {
        if (actif) {
          setErreur(
            e instanceof Error ? e.message : "L'état des lieux ne peut pas être relu.",
          );
        }
      } finally {
        if (actif) setChargement(false);
      }
    })();

    return () => {
      actif = false;
    };
  }, [logementId]);

  // Les signataires attendus viennent du domaine : c'est la même liste que
  // celle qui sera imprimée, donc les manques calculés ici sont ceux qui
  // bloqueraient l'émission.
  const attendus = useMemo(
    () =>
      contexte
        ? signatairesAttendusDeLEdl({
            nomBailleur: contexte.proprietaire.nom,
            titulaires: contexte.titulaires,
            mandataire: brouillon?.mandataire,
          })
        : [],
    [brouillon?.mandataire, contexte],
  );

  const manques = useMemo(
    () => (brouillon ? manquesDeLEdl(brouillon, attendus) : []),
    [attendus, brouillon],
  );
  const avertissements = useMemo(
    () => (brouillon ? avertissementsDeLEdl(brouillon) : []),
    [brouillon],
  );
  const synthese = useMemo(() => (brouillon ? syntheseEdl(brouillon) : null), [brouillon]);
  const sections = useMemo(
    () => (brouillon ? sectionsEdl(brouillon.type) : []),
    [brouillon],
  );

  const generer = useCallback(async () => {
    if (!brouillon || travail || manques.length > 0) return;
    setTravail(true);
    setErreur(null);
    try {
      const { piece } = await emettreEtatDesLieux({ brouillon, etabliLe: aujourdHui() });
      rafraichir();
      // Le formulaire est remplacé par le succès : revenir en arrière sur un
      // brouillon qui n'existe plus n'aurait aucun sens.
      router.replace({
        pathname: '/etat-des-lieux/succes',
        params: { pieceId: piece.id, logementId: brouillon.logementId },
      });
    } catch (e) {
      setErreur(
        e instanceof Error ? e.message : "L'état des lieux n'a pas pu être établi.",
      );
    } finally {
      setTravail(false);
    }
  }, [brouillon, manques.length, rafraichir, travail]);

  if (chargement) {
    return (
      <View style={styles.plein}>
        <ScrollView
          contentContainerStyle={[styles.contenu, { paddingTop: insets.top + espaces.sm }]}
        >
          <EnTeteEcran
            titre="Vérifier l’état des lieux"
            actionLibelle="Fermer"
            actionOnPress={() => router.back()}
          />
          <Text style={styles.chargement}>Relance de la saisie…</Text>
        </ScrollView>
      </View>
    );
  }

  if (!brouillon || !contexte) {
    return (
      <View style={styles.plein}>
        <ScrollView
          contentContainerStyle={[styles.contenu, { paddingTop: insets.top + espaces.sm }]}
        >
          <EnTeteEcran
            titre="Vérifier l’état des lieux"
            actionLibelle="Fermer"
            actionOnPress={() => router.back()}
          />
          <EcranVide
            titre="Rien à vérifier"
            message={erreur ?? "La saisie de l'état des lieux est introuvable."}
            illustration="document"
            actionLibelle="Reprendre le formulaire"
            actionOnPress={() =>
              router.replace({
                pathname: '/etat-des-lieux/nouveau',
                params: { logementId: logementId ?? '' },
              })
            }
          />
        </ScrollView>
      </View>
    );
  }

  const { logement, proprietaire, bail, titulaires, periode } = contexte;
  const signatures = brouillon.signatures ?? [];
  const nonSignes = attendus.filter((a) => !signatures.some((s) => s.signataire === a.id));
  const exemplaires = exemplairesNecessaires(titulaires.length);

  return (
    <View style={styles.plein}>
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: 160 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <EnTeteEcran
          titre="Vérifier l’état des lieux"
          sousTitre="Ce qui sera imprimé, dans l’ordre"
          actionLibelle="Modifier"
          actionOnPress={() =>
            router.replace({
              pathname: '/etat-des-lieux/nouveau',
              params: { logementId: logement.id },
            })
          }
        />

        {erreur ? (
          <BandeauMessage ton="erreur" message={erreur} onFermer={() => setErreur(null)} />
        ) : null}

        {manques.length > 0 ? (
          <BandeauMessage
            ton="erreur"
            message={`L'état des lieux ne peut pas être établi en l'état :\n${manques.join('\n')}`}
          />
        ) : null}

        {avertissements.length > 0 ? (
          <BandeauMessage
            ton="avertissement"
            message={`Ces réserves seront imprimées dans le document :\n${avertissements.join('\n')}`}
          />
        ) : null}

        {nonSignes.length > 0 ? (
          <BandeauMessage
            ton="avertissement"
            message={
              `${nonSignes.length} signature(s) manquante(s) : ${nonSignes
                .map((a) => a.nom)
                .join(', ')}. ` +
              'Le document portera « Non signé » sous ces noms : vous pourrez le faire signer à la ' +
              'main, ou reprendre le formulaire.'
            }
          />
        ) : null}

        {/* --- 1. Les parties --------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>1. Les parties</Text>
          <LigneDetail libelle="Bailleur" valeur={proprietaire.nom} accentuee />
          <LigneDetail libelle="Adresse" valeur={adresseEnLignes(proprietaire).join(', ')} />
          {titulaires.map((t, rang) => (
            <LigneDetail
              key={t.id}
              libelle={rang === 0 ? 'Locataire' : `Locataire ${rang + 1}`}
              valeur={nomComplet(t)}
            />
          ))}
          {brouillon.mandataire?.trim() ? (
            <LigneDetail libelle="Mandataire" valeur={brouillon.mandataire.trim()} />
          ) : null}
        </Carte>

        {/* --- 2. Le logement --------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>2. Le logement</Text>
          <LigneDetail libelle="Désignation" valeur={logement.nom} accentuee />
          <LigneDetail libelle="Adresse" valeur={adresseEnLignes(logement).join(', ')} />
          {logement.surface ? (
            <LigneDetail libelle="Surface" valeur={`${logement.surface} m²`} />
          ) : null}
          <LigneDetail
            libelle="Type d’état des lieux"
            valeur={LIBELLE_TYPE_EDL[brouillon.type]}
          />
          <LigneDetail libelle="Date" valeur={formaterDateFr(brouillon.dateEdl ?? '')} />
        </Carte>

        {/* --- 3. Le bail ------------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>3. Le bail</Text>
          {bail ? (
            <>
              <LigneDetail libelle="Entrée" valeur={formaterDateFr(bail.dateEntree)} />
              {bail.dateSortie ? (
                <LigneDetail libelle="Sortie" valeur={formaterDateFr(bail.dateSortie)} />
              ) : null}
              {periode ? (
                <>
                  <LigneDetail libelle="Loyer hors charges" valeur={formatMontant(periode.loyer)} />
                  <LigneDetail
                    libelle="Provision pour charges"
                    valeur={formatMontant(periode.charges)}
                  />
                  <Text style={styles.note}>
                    Le document rappelle le loyer réellement dû pour le mois de l’état des lieux,
                    celui que réclament les quittances.
                  </Text>
                </>
              ) : null}
            </>
          ) : (
            <Text style={styles.note}>Aucune location en cours n’est rattachée à ce logement.</Text>
          )}
        </Carte>

        {/* --- 4 et 5. Les pièces, élément par élément -------------------- */}
        <Text style={styles.titreGroupe}>Les pièces et leurs éléments</Text>
        <Text style={styles.aide}>
          {synthese?.pieces ?? 0} pièce(s), {synthese?.total ?? 0} élément(s),{' '}
          {synthese?.photos ?? 0} photo(s). Les photos sont imprimées sous l’élément concerné, et
          non regroupées à la fin.
        </Text>

        {(brouillon.pieces ?? []).map((piece, rangPiece) => (
          <Carte key={piece.id}>
            <Text style={styles.section}>
              Pièce {rangPiece + 1} — {piece.nom}
            </Text>
            {piece.commentaire.trim() ? (
              <Text style={styles.texteLibre}>{piece.commentaire.trim()}</Text>
            ) : null}
            {piece.elements.length === 0 ? (
              <Text style={styles.note}>Aucun élément décrit dans cette pièce.</Text>
            ) : (
              piece.elements.map((element) => (
                <View key={element.id} style={styles.blocElement}>
                  <View style={styles.ligneElement}>
                    <Text style={styles.nomElement}>{element.nom}</Text>
                    <Text
                      style={[
                        styles.etatElement,
                        element.etat ? null : styles.etatManquant,
                      ]}
                    >
                      {libelleEtat(element.etat)}
                    </Text>
                  </View>
                  {element.commentaire.trim() ? (
                    <Text style={styles.note}>{element.commentaire.trim()}</Text>
                  ) : null}
                  {element.photos.length > 0 ? (
                    <Text style={styles.note}>
                      {element.photos.length} photo(s)
                      {element.photos.some((p) => p.legende.trim())
                        ? ` — ${element.photos
                            .map((p) => p.legende.trim())
                            .filter(Boolean)
                            .join(', ')}`
                        : ''}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
            {piece.photos.length > 0 ? (
              <Text style={styles.note}>
                Vue d’ensemble de la pièce : {piece.photos.length} photo(s)
              </Text>
            ) : null}
          </Carte>
        ))}

        {/* --- 6. Compteurs ----------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>Relevés des compteurs</Text>
          {(brouillon.compteurs ?? []).length === 0 ? (
            <Text style={styles.note}>
              Aucun relevé n’a été saisi.
              {brouillon.compteursIndividuels
                ? ' Or ce logement a été déclaré avec une installation individuelle : la loi impose le relevé des index.'
                : ''}
            </Text>
          ) : (
            (brouillon.compteurs ?? []).map((releve) => (
              <LigneDetail
                key={releve.id}
                libelle={
                  COMPTEURS.find((c) => c.valeur === releve.type)?.libelle ?? releve.type
                }
                valeur={`${releve.valeur}${releve.precision.trim() ? ` (${releve.precision.trim()})` : ''}`}
                pointillee
              />
            ))
          )}
        </Carte>

        {/* --- 7. Clés ---------------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>Clés et moyens d’accès</Text>
          {(brouillon.cles ?? []).length === 0 ? (
            <Text style={styles.note}>Aucune clé n’a été remise.</Text>
          ) : (
            (brouillon.cles ?? []).map((cle) => (
              <LigneDetail
                key={cle.id}
                libelle={`${cle.quantite} × ${cle.libelle}`}
                valeur={cle.destination.trim() || 'Destination non précisée'}
                pointillee
              />
            ))
          )}
        </Carte>

        {/* --- 8. Observations -------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>Observations et réserves</Text>
          {brouillon.observations?.trim() ? (
            <Text style={styles.texteLibre}>{brouillon.observations.trim()}</Text>
          ) : (
            <Text style={styles.note}>Aucune observation n’a été saisie.</Text>
          )}
        </Carte>

        {/* --- 9. Synthèse ------------------------------------------------ */}
        {synthese ? (
          <Carte>
            <Text style={styles.section}>Synthèse</Text>
            <LigneDetail
              libelle="Éléments décrits"
              valeur={String(synthese.total)}
              accentuee
            />
            <LigneDetail libelle="États constatés" valeur={String(synthese.constates)} />
            {synthese.aRenseigner > 0 ? (
              <LigneDetail
                libelle="Sans état relevé"
                valeur={String(synthese.aRenseigner)}
                accentuee
              />
            ) : null}
            {synthese.parEtat
              .filter((c) => c.nombre > 0)
              .map((c) => (
                <LigneDetail
                  key={c.etat}
                  libelle={c.libelle}
                  valeur={String(c.nombre)}
                  pointillee
                />
              ))}
            <Text style={styles.note}>
              « Non vérifié » et « Non applicable » ne sont pas des états du logement : ils disent
              ce qui a été fait, ou ce qui n’existe pas dans la pièce. Ils ne sont donc pas comptés
              parmi les états constatés.
            </Text>
          </Carte>
        ) : null}

        {/* --- 10. Signatures --------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>Signatures</Text>
          {attendus.map((a) => {
            const signature = signatures.find((s) => s.signataire === a.id);
            return (
              <View key={a.id} style={styles.blocSignature}>
                <LigneDetail
                  libelle={a.id === SIGNATAIRE_BAILLEUR ? 'Le bailleur' : 'Le locataire'}
                  valeur={a.nom}
                  pointillee
                />
                <Text style={[styles.note, signature ? styles.signe : styles.nonSigne]}>
                  {signature
                    ? `Signé le ${formaterDateFr(signature.date)}.`
                    : 'Non signé.'}
                </Text>
              </View>
            );
          })}
          <Text style={styles.note}>
            {exemplaires} exemplaire{exemplaires > 1 ? 's' : ''} à remettre : la loi exige autant
            d’exemplaires que de parties.
          </Text>
        </Carte>

        {/* --- 11. Ce que le document ne fait pas ------------------------- */}
        <Carte>
          <Text style={styles.section}>Ce que vaut la signature</Text>
          <Text style={styles.note}>
            Un tracé au doigt matérialise l’accord des parties, comme un exemplaire signé à la main
            puis numérisé. Ce n’est pas une signature électronique qualifiée : l’application ne
            délivre ni certificat, ni horodatage, ni cachet d’un tiers de confiance. Le document le
            dit lui-même, sous les signatures.
          </Text>
        </Carte>

        {/* --- 12. Fondements --------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>Fondements</Text>
          <Text style={styles.note}>
            Les sections de ce document suivent les textes suivants, lus le jour indiqué. Aucune
            exigence n’est écrite par l’application.
          </Text>
          {SOURCES_EDL.map((s) => (
            <Text key={s.reference} style={styles.source}>
              • {s.reference} — consulté le {formaterDateFr(s.consulteLe)}
            </Text>
          ))}
          <Text style={styles.note}>
            Les {sections.length} sections imprimées, dans l’ordre :{' '}
            {sections.map((s) => s.titre).join(' · ')}.
          </Text>
        </Carte>

        <Text style={styles.note}>
          Étapes du formulaire : {ETAPES_EDL.map((e) => e.titre).join(' · ')}.
        </Text>
      </ScrollView>

      <BarreActionFixe
        libelle={travail ? 'Établissement…' : 'Établir l’état des lieux'}
        aide={
          manques.length > 0
            ? manques[0]
            : 'Le PDF sera rangé dans le dossier du logement, sous le locataire en place.'
        }
        onPress={() => void generer()}
        desactive={manques.length > 0 || travail}
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
    titreGroupe: {
      ...typographie.titreSection,
      color: couleurs.texte,
      marginTop: espaces.sm,
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
    },
    note: {
      ...typographie.petit,
      color: couleurs.texteTertiaire,
      marginTop: espaces.xs,
      fontStyle: 'italic',
    },
    texteLibre: {
      ...typographie.corps,
      color: couleurs.texte,
      marginTop: espaces.sm,
      padding: espaces.md,
      borderRadius: rayons.md,
      backgroundColor: couleurs.fondSourdine,
    },
    blocElement: {
      paddingVertical: espaces.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: couleurs.bordure,
    },
    ligneElement: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaces.sm,
    },
    nomElement: {
      ...typographie.corps,
      color: couleurs.texte,
      flex: 1,
    },
    etatElement: {
      ...typographie.petitAppuye,
      color: couleurs.texteSecondaire,
    },
    etatManquant: {
      color: couleurs.rouge,
    },
    blocSignature: {
      marginTop: espaces.sm,
    },
    signe: {
      color: couleurs.succesFonce,
      fontStyle: 'normal',
      fontWeight: '600',
    },
    nonSigne: {
      color: couleurs.texteTertiaire,
    },
    source: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      marginTop: espaces.xs,
    },
  });

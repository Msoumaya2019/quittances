/**
 * Créer le bail d'un logement : formulaire guidé en neuf étapes.
 *
 * Deux principes gouvernent cet écran, et ils expliquent sa forme.
 *
 * **1. On ne ressaisit jamais ce qui est déjà enregistré.** Le logement, le
 * propriétaire, les locataires, la date de prise d'effet, le loyer et les
 * charges viennent de la base. Ils sont **montrés**, pas redemandés : les
 * corriger ailleurs serait créer un second endroit où la même vérité s'écrit,
 * et donc tôt ou tard deux versions — un bail imprimé à 700 € pendant que la
 * quittance réclame 750 €. Les étapes qui les présentent renvoient vers la fiche
 * du logement, où ils se modifient pour toute l'application.
 *
 * **2. La progression ne se perd pas.** Le brouillon est enregistré à chaque
 * frappe, après une courte pause, et à la sortie de l'écran. Un bail se remplit
 * en neuf étapes : perdre la saisie parce qu'on a reçu un appel est le défaut
 * qui fait renoncer à l'outil.
 *
 * L'écran ne produit aucun document. Il assemble un brouillon et le confie à
 * l'aperçu, qui appelle `emettreBail` — le seul point d'entrée de la
 * génération. Un écran qui imprimerait lui-même finirait par imprimer autre
 * chose.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import {
  BandeauMessage,
  BarreActionFixe,
  BlocSignature,
  Bouton,
  Carte,
  Champ,
  ChampMontant,
  EcranVide,
  EnTeteEcran,
  Segments,
} from '@/ui/components';
import { espaces, rayons, typographie } from '@/ui/tokens';
import { aujourdHui, formaterDateFr } from '@/domain/period';
import { adresseEnLignes, nomComplet } from '@/domain/types';
import type { Logement } from '@/domain/types';
import {
  CATEGORIES_BAIL,
  DIAGNOSTICS_PROPOSES,
  ETAPES_BAIL,
  LIBELLE_ANNEXE,
  LIBELLE_BAIL,
  MOTIFS_MOBILITE,
  REGLES_BAIL,
  depotDepasseLaRegle,
  dureeMinimaleMois,
  etapePrecedente,
  etapeSuivante,
  manquesDeLEtape,
  manquesDuBail,
  numeroEtape,
  reprendreBrouillon,
} from '@/domain/bail';
import type {
  BrouillonBail,
  CategorieBail,
  DiagnosticSaisi,
  EtapeBail,
  SignatureBail,
  TypeAnnexe,
} from '@/domain/bail';
import { analyserDonnees, brouillonRecent } from '@/domain/brouillon';
import { finDuBail, traceEnDataUri } from '@/pdf/bail';
import { formatMontant } from '@/domain/money';
import { useApplication } from '@/state/ApplicationContext';
import { enregistrerBrouillon, lireBrouillon } from '@/db/repositories/brouillons';
import { chargerContexteBail, type ContexteBail } from '@/documents/bail-contexte';
import { useStyles, type Couleurs } from '@/ui/theme';

/** Le mot employé partout pour désigner le bailleur dans les signatures. */
const SIGNATAIRE_BAILLEUR = 'bailleur';

export default function EcranNouveauBail() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { rafraichir, reglages } = useApplication();

  const params = useLocalSearchParams<{ logementId?: string }>();
  const logementId = typeof params.logementId === 'string' ? params.logementId : null;

  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [contexte, setContexte] = useState<ContexteBail | null>(null);
  const [brouillon, setBrouillon] = useState<BrouillonBail | null>(null);
  const [etape, setEtape] = useState<EtapeBail>('logement');
  const [reprisLe, setReprisLe] = useState<string | null>(null);
  /** Faux pendant qu'un trait de signature se dessine : le défilement s'arrête. */
  const [defilement, setDefilement] = useState(true);
  const [signataire, setSignataire] = useState<string>(SIGNATAIRE_BAILLEUR);

  // -------------------------------------------------------------------------
  // Lecture initiale
  // -------------------------------------------------------------------------

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

        // Les valeurs que la location porte déjà. Elles servent de socle : un
        // brouillon repris ne peut pas les contredire, il ne peut que les
        // compléter.
        const base: BrouillonBail = {
          logementId: charge.logement.id,
          bailId: charge.bail?.id ?? '',
          dateDebut: charge.bail?.dateEntree ?? aujourdHui(),
          loyer: charge.periode?.loyer,
          charges: charge.periode?.charges,
          depotGarantie: charge.bail?.depotGarantie ?? undefined,
          jourEcheance: charge.bail?.jourEcheance ?? 5,
          bailleurPersonneMorale: !!charge.proprietaire.siret,
        };

        const enregistre = await lireBrouillon(logement.id, 'bail');
        const repris = enregistre
          ? reprendreBrouillon(analyserDonnees(JSON.stringify(enregistre.donnees)), base)
          : base;

        if (!actif) return;
        setContexte(charge);
        setBrouillon(repris);

        if (enregistre && brouillonRecent(enregistre.majLe, aujourdHui())) {
          const rang = ETAPES_BAIL.findIndex((e) => e.valeur === enregistre.etape);
          if (rang >= 0) setEtape(enregistre.etape as EtapeBail);
          setReprisLe(enregistre.majLe.slice(0, 10));
        }
      } catch (e) {
        if (actif) {
          setErreur(
            e instanceof Error ? e.message : 'Le bail ne peut pas être préparé pour le moment.',
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

  // -------------------------------------------------------------------------
  // Enregistrement automatique de la progression
  // -------------------------------------------------------------------------

  const aEnregistrer = useRef<{ b: BrouillonBail; e: EtapeBail } | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sauvegarder = useCallback(async () => {
    const enAttente = aEnregistrer.current;
    if (!enAttente || !logementId) return;
    try {
      await enregistrerBrouillon({
        logementId,
        type: 'bail',
        etape: enAttente.e,
        donnees: enAttente.b,
      });
      setAvertissement(null);
    } catch {
      // Une sauvegarde qui échoue ne doit pas interrompre la saisie — mais elle
      // doit se dire, sinon le bailleur quitterait l'écran en croyant sa saisie
      // conservée.
      setAvertissement(
        "La saisie n'a pas pu être enregistrée automatiquement. Elle sera perdue si vous " +
          'quittez cet écran ; réessayez dans un instant.',
      );
    }
  }, [logementId]);

  useEffect(() => {
    if (!brouillon) return;
    aEnregistrer.current = { b: brouillon, e: etape };
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => void sauvegarder(), 700);
    return () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, [brouillon, etape, sauvegarder]);

  // À la sortie de l'écran, la dernière frappe doit être enregistrée : le délai
  // de 700 ms ne doit pas faire perdre ce qu'on vient de taper.
  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
      void sauvegarder();
    },
    [sauvegarder],
  );

  // -------------------------------------------------------------------------
  // Ce que l'écran calcule
  // -------------------------------------------------------------------------

  const manques = useMemo(() => (brouillon ? manquesDuBail(brouillon) : []), [brouillon]);
  const manquesCourants = useMemo(
    () => (brouillon ? manquesDeLEtape(brouillon, etape) : []),
    [brouillon, etape],
  );
  const plafond = useMemo(
    () => (brouillon ? depotDepasseLaRegle(brouillon) : null),
    [brouillon],
  );

  const regle = brouillon?.categorie ? REGLES_BAIL[brouillon.categorie] : null;
  const minimum = brouillon?.categorie
    ? dureeMinimaleMois(
        brouillon.categorie,
        brouillon.bailleurPersonneMorale === true,
        brouillon.meuble === true,
      )
    : null;

  /** La signature déjà recueillie pour le signataire affiché, s'il y en a une. */
  const signatureCourante = useMemo(
    () => (brouillon?.signatures ?? []).find((s) => s.signataire === signataire) ?? null,
    [brouillon, signataire],
  );

  const signataires = useMemo(() => {
    if (!contexte) return [];
    const liste = [{ id: SIGNATAIRE_BAILLEUR, nom: contexte.proprietaire.nom }];
    for (const t of contexte.titulaires) {
      liste.push({ id: t.id, nom: nomComplet(t) });
    }
    return liste;
  }, [contexte]);

  function changer(partiel: Partial<BrouillonBail>) {
    setBrouillon((actuel) => (actuel ? { ...actuel, ...partiel } : actuel));
  }

  function signer(chemin: string) {
    if (!brouillon || !chemin) {
      // Un tracé effacé retire la signature : elle redeviendra modifiable.
      changer({
        signatures: (brouillon?.signatures ?? []).filter((s) => s.signataire !== signataire),
      });
      return;
    }
    const nom = signataires.find((s) => s.id === signataire)?.nom ?? '';
    const autres = (brouillon.signatures ?? []).filter((s) => s.signataire !== signataire);
    const signature: SignatureBail = {
      signataire,
      nom,
      date: aujourdHui(),
      // Le tracé est converti **maintenant** : le brouillon enregistré porte
      // ainsi l'image telle que le document l'insérera, et une signature ne
      // dépend pas de la taille de l'écran qui l'a recueillie.
      trace: traceEnDataUri(chemin, 600, 240),
    };
    changer({ signatures: [...autres, signature] });
  }

  function avancer() {
    if (manquesCourants.length > 0) {
      setErreur(manquesCourants.join('\n'));
      return;
    }
    setErreur(null);
    const suivante = etapeSuivante(etape);
    if (suivante) {
      setEtape(suivante);
      return;
    }
    // Dernière étape : on passe à l'aperçu, qui seul produit le document.
    void (async () => {
      await sauvegarder();
      router.push({
        pathname: '/bail/verification',
        params: { logementId: brouillon?.logementId },
      });
    })();
  }

  function reculer() {
    setErreur(null);
    const precedente = etapePrecedente(etape);
    if (precedente) setEtape(precedente);
  }

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------

  if (chargement) {
    return (
      <View style={styles.plein}>
        <ScrollView contentContainerStyle={[styles.contenu, { paddingTop: insets.top + espaces.sm }]}>
          <EnTeteEcran titre="Créer le bail" actionLibelle="Fermer" actionOnPress={() => router.back()} />
          <Text style={styles.chargement}>Préparation du bail…</Text>
        </ScrollView>
      </View>
    );
  }

  if (!logementId || !contexte || !brouillon) {
    return (
      <View style={styles.plein}>
        <ScrollView contentContainerStyle={[styles.contenu, { paddingTop: insets.top + espaces.sm }]}>
          <EnTeteEcran titre="Créer le bail" actionLibelle="Fermer" actionOnPress={() => router.back()} />
          <EcranVide
            titre="Impossible de préparer ce bail"
            message={erreur ?? "Le logement demandé n'a pas pu être lu."}
            illustration="document"
            actionLibelle="Revenir aux logements"
            actionOnPress={() => router.replace('/logements')}
          />
        </ScrollView>
      </View>
    );
  }

  const { logement, proprietaire, bail, titulaires, periode } = contexte;
  const aSigner = signataires.filter(
    (s) => !(brouillon.signatures ?? []).some((sig) => sig.signataire === s.id),
  ).length;
  const derniere = etapeSuivante(etape) === null;

  return (
    <View style={styles.plein}>
      <ScrollView
        scrollEnabled={defilement}
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: 160 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <EnTeteEcran
          titre={ETAPES_BAIL[numeroEtape(etape) - 1].titre}
          sousTitre={`Étape ${numeroEtape(etape)} sur ${ETAPES_BAIL.length} · ${logement.nom}`}
          actionLibelle="Fermer"
          actionOnPress={() => router.back()}
        />

        {/* L'avancement, en pastilles : on voit d'un coup d'œil où l'on en est
            et combien il reste. */}
        <View style={styles.pastilles}>
          {ETAPES_BAIL.map((e, rang) => {
            const fait = rang < numeroEtape(etape) - 1;
            const courant = e.valeur === etape;
            return (
              <Pressable
                key={e.valeur}
                onPress={() => setEtape(e.valeur)}
                accessibilityRole="button"
                accessibilityLabel={`Étape ${rang + 1} : ${e.titre}`}
                accessibilityState={{ selected: courant }}
                style={[
                  styles.pastille,
                  fait && styles.pastilleFaite,
                  courant && styles.pastilleCourante,
                ]}
              >
                <Text style={[styles.pastilleTexte, courant && styles.pastilleTexteCourant]}>
                  {rang + 1}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {reprisLe && etape === 'logement' ? (
          <BandeauMessage
            ton="information"
            message={`Vous aviez commencé ce bail le ${formaterDateFr(reprisLe)} : la saisie a été reprise à l’étape où vous l’aviez laissée.`}
            onFermer={() => setReprisLe(null)}
          />
        ) : null}

        {avertissement ? (
          <BandeauMessage ton="avertissement" message={avertissement} onFermer={() => setAvertissement(null)} />
        ) : null}

        {erreur ? <BandeauMessage ton="erreur" message={erreur} onFermer={() => setErreur(null)} /> : null}

        <Text style={styles.aideEtape}>{ETAPES_BAIL[numeroEtape(etape) - 1].aide}</Text>

        {/* --- 1. Le logement -------------------------------------------- */}
        {etape === 'logement' ? (
          <>
            <Carte>
              <Text style={styles.section}>Logement loué</Text>
              <Text style={styles.nom}>{logement.nom}</Text>
              <Text style={styles.detail}>
                {adresseEnLignes(logement).join('\n')}
              </Text>
              <View style={styles.details}>
                {logement.surface ? (
                  <Text style={styles.detail}>Surface : {logement.surface} m²</Text>
                ) : null}
                {logement.reference ? (
                  <Text style={styles.detail}>Référence : {logement.reference}</Text>
                ) : null}
              </View>
            </Carte>

            <Carte>
              <Text style={styles.section}>Bailleur</Text>
              <Text style={styles.nom}>{proprietaire.nom}</Text>
              {proprietaire.qualite ? (
                <Text style={styles.detail}>{proprietaire.qualite}</Text>
              ) : null}
              <Text style={styles.detail}>{adresseEnLignes(proprietaire).join('\n')}</Text>
              {proprietaire.telephone ? (
                <Text style={styles.detail}>Téléphone : {proprietaire.telephone}</Text>
              ) : null}
              {proprietaire.email ? (
                <Text style={styles.detail}>Courriel : {proprietaire.email}</Text>
              ) : null}
              {proprietaire.siret ? (
                <Text style={styles.detail}>SIRET : {proprietaire.siret}</Text>
              ) : null}
            </Carte>

            <Bouton
              libelle="Corriger la fiche du logement"
              variante="discret"
              compact
              pleineLargeur={false}
              onPress={() =>
                router.push({ pathname: '/logement/[id]/modifier', params: { id: logement.id } })
              }
            />
          </>
        ) : null}

        {/* --- 2. Les locataires ----------------------------------------- */}
        {etape === 'locataires' ? (
          titulaires.length === 0 ? (
            <Carte>
              <Text style={styles.section}>Aucun locataire</Text>
              <Text style={styles.detail}>
                Ce logement n’a pas de locataire en place. Un bail doit nommer les personnes qui
                s’engagent : ajoutez-les d’abord, le bail reprendra leur identité sans que vous ayez
                à la ressaisir.
              </Text>
              <Bouton
                libelle="Ajouter un locataire"
                onPress={() =>
                  router.push({
                    pathname: '/logement/[id]/locataires',
                    params: { id: logement.id },
                  })
                }
              />
            </Carte>
          ) : (
            <Carte>
              <Text style={styles.section}>
                {titulaires.length > 1 ? 'Locataires en place' : 'Locataire en place'}
              </Text>
              {titulaires.map((t, rang) => (
                <View key={t.id} style={[styles.bloc, rang > 0 && styles.blocSepare]}>
                  <Text style={styles.nom}>{nomComplet(t)}</Text>
                  {t.dateNaissance ? (
                    <Text style={styles.detail}>
                      Naissance : {formaterDateFr(t.dateNaissance)}
                      {t.lieuNaissance ? ` à ${t.lieuNaissance}` : ''}
                    </Text>
                  ) : null}
                  {t.telephone ? <Text style={styles.detail}>Téléphone : {t.telephone}</Text> : null}
                  {t.email ? <Text style={styles.detail}>Courriel : {t.email}</Text> : null}
                </View>
              ))}
              {bail ? (
                <Text style={styles.note}>
                  Location en cours depuis le {formaterDateFr(bail.dateEntree)}.
                </Text>
              ) : null}
              <Bouton
                libelle="Corriger les locataires"
                variante="discret"
                compact
                pleineLargeur={false}
                onPress={() =>
                  router.push({
                    pathname: '/logement/[id]/locataires',
                    params: { id: logement.id },
                  })
                }
              />
            </Carte>
          )
        ) : null}

        {/* --- 3. Le type de bail ---------------------------------------- */}
        {etape === 'categorie' ? (
          <>
            <Carte>
              <Text style={styles.section}>Type de bail</Text>
              <Text style={styles.detail}>
                Le type choisi décide de la durée minimale, du dépôt de garantie, du préavis et des
                annexes obligatoires.
              </Text>
              {CATEGORIES_BAIL.map((c) => {
                const choisi = brouillon.categorie === c.valeur;
                return (
                  <Pressable
                    key={c.valeur}
                    onPress={() =>
                      changer({
                        categorie: c.valeur,
                        // Changer de type remet le dépôt à zéro quand le
                        // nouveau type l'interdit : le garder ferait refuser le
                        // bail pour une valeur qu'on ne peut plus corriger.
                        depotGarantie: REGLES_BAIL[c.valeur].depotGarantieInterdit
                          ? 0
                          : brouillon.depotGarantie,
                      })
                    }
                    accessibilityRole="radio"
                    accessibilityState={{ selected: choisi }}
                    accessibilityLabel={`${c.libelle}. ${c.resume}`}
                    style={({ pressed }) => [
                      styles.choix,
                      choisi && styles.choixActif,
                      pressed && styles.choixAppuye,
                    ]}
                  >
                    <Text style={[styles.choixTitre, choisi && styles.choixTitreActif]}>
                      {c.libelle}
                    </Text>
                    <Text style={styles.choixDetail}>{c.resume}</Text>
                  </Pressable>
                );
              })}
            </Carte>

            {brouillon.categorie === 'mobilite' ? (
              <Carte>
                <Text style={styles.section}>Motif du locataire</Text>
                <Text style={styles.detail}>
                  Il est obligatoire : sans lui, le bail mobilité n’est pas applicable. Choisissez une
                  situation, ou écrivez-la.
                </Text>
                <Segments
                  defilable
                  segments={MOTIFS_MOBILITE.map((m) => ({ valeur: m, libelle: m }))}
                  valeur={brouillon.motifMobilite ?? ''}
                  onChanger={(v: string) => changer({ motifMobilite: v })}
                />
                <Champ
                  libelle="Motif écrit dans le bail"
                  valeur={brouillon.motifMobilite ?? ''}
                  onChangement={(v) => changer({ motifMobilite: v })}
                  placeholder="Mutation professionnelle"
                  multiligne
                  nombreDeLignes={2}
                  obligatoire
                />
              </Carte>
            ) : null}

            {brouillon.categorie === 'colocation' ? (
              <Carte>
                <Text style={styles.section}>Le logement est-il meublé ?</Text>
                <Text style={styles.detail}>
                  La colocation suit le régime du logement : trois ou six ans en vide, un an en
                  meublé.
                </Text>
                <Segments
                  segments={[
                    { valeur: 'vide', libelle: 'Non meublé' },
                    { valeur: 'meuble', libelle: 'Meublé' },
                  ]}
                  valeur={brouillon.meuble ? 'meuble' : 'vide'}
                  onChanger={(v: string) => changer({ meuble: v === 'meuble' })}
                />
              </Carte>
            ) : null}
          </>
        ) : null}

        {/* --- 4. La durée ----------------------------------------------- */}
        {etape === 'duree' ? (
          <>
            <Carte>
              <Text style={styles.section}>Prise d’effet</Text>
              <Text style={styles.valeur}>{formaterDateFr(brouillon.dateDebut ?? '')}</Text>
              <Text style={styles.detail}>
                C’est la date d’entrée de la location. La corriger ici la corrigerait pour les
                quittances aussi : modifiez-la depuis la fiche du logement.
              </Text>
              <Bouton
                libelle="Corriger la date d’entrée"
                variante="discret"
                compact
                pleineLargeur={false}
                onPress={() =>
                  router.push({
                    pathname: '/logement/[id]/locataires',
                    params: { id: logement.id },
                  })
                }
              />
            </Carte>

            <Carte>
              <Text style={styles.section}>Durée du bail</Text>
              {regle ? <Text style={styles.detail}>{regle.duree}</Text> : null}

              <Champ
                libelle="Durée, en mois"
                valeur={brouillon.dureeMois === undefined ? '' : String(brouillon.dureeMois)}
                onChangement={(v) => {
                  const nombre = Number(v.replace(/[^0-9]/g, ''));
                  changer({ dureeMois: v.trim() === '' ? undefined : nombre });
                }}
                placeholder="36"
                clavier="number-pad"
                obligatoire
                aide={
                  minimum !== null
                    ? `Minimum légal pour ce type : ${minimum} mois.`
                    : 'Ce type de bail n’impose pas de durée minimale.'
                }
              />

              {minimum !== null ? (
                <View style={styles.raccourcis}>
                  {[minimum, minimum === 36 ? 36 : minimum, minimum * 2]
                    .filter((valeur, rang, liste) => liste.indexOf(valeur) === rang)
                    .map((valeur) => (
                      <Bouton
                        key={valeur}
                        libelle={`${valeur} mois`}
                        variante={brouillon.dureeMois === valeur ? 'principal' : 'secondaire'}
                        compact
                        pleineLargeur={false}
                        onPress={() => changer({ dureeMois: valeur })}
                      />
                    ))}
                </View>
              ) : null}

              {brouillon.dureeMois && brouillon.dateDebut ? (
                <Text style={styles.note}>
                  Le bail prendrait fin le {finDuBail(brouillon.dateDebut, brouillon.dureeMois)}.
                </Text>
              ) : null}
            </Carte>

            <Carte>
              <Text style={styles.section}>Le bailleur est-il une personne morale ?</Text>
              <Text style={styles.detail}>
                Une SCI ou une société doit louer au moins six ans ; une personne physique, au moins
                trois.
              </Text>
              <View style={styles.ligneBascule}>
                <Text style={styles.libelleBascule}>
                  {brouillon.bailleurPersonneMorale ? 'Personne morale' : 'Personne physique'}
                </Text>
                <Switch
                  value={brouillon.bailleurPersonneMorale === true}
                  onValueChange={(v) => changer({ bailleurPersonneMorale: v })}
                  accessibilityLabel="Le bailleur est une personne morale"
                />
              </View>
              {proprietaire.siret ? (
                <Text style={styles.note}>
                  Un SIRET est enregistré pour ce bailleur : l’option est déjà activée.
                </Text>
              ) : null}
            </Carte>
          </>
        ) : null}

        {/* --- 5. Loyer, charges et dépôt -------------------------------- */}
        {etape === 'loyer' ? (
          <>
            <Carte>
              <Text style={styles.section}>Loyer et charges</Text>
              {periode ? (
                <>
                  <Text style={styles.valeur}>
                    {formatMontant(periode.loyer)} + {formatMontant(periode.charges)}
                  </Text>
                  <Text style={styles.detail}>
                    Loyer hors charges et provision pour charges, applicables à partir de{' '}
                    {formaterDateFr(`${periode.debut}-01`)}.
                  </Text>
                </>
              ) : (
                <Text style={styles.detail}>
                  Aucun loyer n’est enregistré pour cette location.
                </Text>
              )}
              <Text style={styles.note}>
                Le bail imprime le loyer réellement dû, celui qui sert aux quittances. Pour le
                modifier, utilisez le changement de loyer depuis la fiche du logement : il
                n’applique rien aux mois passés.
              </Text>
            </Carte>

            <Carte>
              <Text style={styles.section}>Dépôt de garantie</Text>
              {regle?.depotGarantieInterdit ? (
                <BandeauMessage
                  ton="avertissement"
                  message="Le dépôt de garantie est interdit pour ce type de bail. Il doit rester à zéro."
                />
              ) : regle?.depotGarantieMois ? (
                <Text style={styles.detail}>
                  Plafond légal : {regle.depotGarantieMois} mois de loyer hors charges, soit{' '}
                  {formatMontant((brouillon.loyer ?? 0) * regle.depotGarantieMois)}.
                </Text>
              ) : (
                <Text style={styles.detail}>
                  Ce type de bail n’encadre pas le dépôt de garantie.
                </Text>
              )}

              <ChampMontant
                libelle="Montant du dépôt"
                valeurCentimes={brouillon.depotGarantie ?? null}
                onChangement={(centimes) => changer({ depotGarantie: centimes ?? undefined })}
                erreur={plafond}
                obligatoire={regle?.depotGarantieInterdit !== true && regle?.depotGarantieMois !== null}
                aide={
                  regle?.depotGarantieInterdit
                    ? 'Laissez vide ou à zéro : ce bail n’en prévoit pas.'
                    : undefined
                }
              />

              {plafond && regle?.depotGarantieMois && brouillon.loyer ? (
                <Bouton
                  libelle="Ramener au plafond légal"
                  variante="secondaire"
                  compact
                  pleineLargeur={false}
                  onPress={() =>
                    changer({ depotGarantie: (brouillon.loyer ?? 0) * regle.depotGarantieMois! })
                  }
                />
              ) : null}
              {regle?.depotGarantieInterdit && (brouillon.depotGarantie ?? 0) > 0 ? (
                <Bouton
                  libelle="Mettre le dépôt à zéro"
                  variante="secondaire"
                  compact
                  pleineLargeur={false}
                  onPress={() => changer({ depotGarantie: 0 })}
                />
              ) : null}
            </Carte>

            <Carte>
              <Text style={styles.section}>Jour d’échéance</Text>
              <Champ
                libelle="Jour du mois où le loyer est dû"
                valeur={brouillon.jourEcheance === undefined ? '' : String(brouillon.jourEcheance)}
                onChangement={(v) => {
                  const nombre = Number(v.replace(/[^0-9]/g, ''));
                  changer({ jourEcheance: v.trim() === '' ? undefined : nombre });
                }}
                clavier="number-pad"
                placeholder="5"
                obligatoire
                aide="Entre 1 et 31. C’est le jour que rappellent les rappels de loyer."
              />
            </Carte>
          </>
        ) : null}

        {/* --- 6. Diagnostics -------------------------------------------- */}
        {etape === 'diagnostics' ? (
          <Carte>
            <Text style={styles.section}>Dossier de diagnostic technique</Text>
            <Text style={styles.detail}>
              Cochez les diagnostics que vous joignez au bail, et la date de leur réalisation.
            </Text>

            {DIAGNOSTICS_PROPOSES.map((libelle) => {
              const saisi = (brouillon.diagnostics ?? []).find((d) => d.libelle === libelle);
              return (
                <View key={libelle} style={styles.diagnostic}>
                  <Pressable
                    onPress={() =>
                      changer({
                        diagnostics: saisi
                          ? (brouillon.diagnostics ?? []).filter((d) => d.libelle !== libelle)
                          : [...(brouillon.diagnostics ?? []), { libelle, date: aujourdHui() }],
                      })
                    }
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !!saisi }}
                    accessibilityLabel={libelle}
                    style={styles.ligneBascule}
                  >
                    <Text style={styles.case}>{saisi ? '☑' : '☐'}</Text>
                    <Text style={[styles.libelleBascule, styles.libelleDiagnostic]}>{libelle}</Text>
                  </Pressable>

                  {saisi ? (
                    <View style={styles.sousChamp}>
                      <Champ
                        libelle="Réalisé le"
                        valeur={saisi.date}
                        onChangement={(v) =>
                          changer({
                            diagnostics: (brouillon.diagnostics ?? []).map((d) =>
                              d.libelle === libelle ? { ...d, date: v } : d,
                            ),
                          })
                        }
                        placeholder="AAAA-MM-JJ"
                        clavier="numbers-and-punctuation"
                      />
                      <View style={styles.ligneBascule}>
                        <Text style={styles.libelleBascule}>À renouveler</Text>
                        <Switch
                          value={saisi.aRenouveler === true}
                          onValueChange={(v) =>
                            changer({
                              diagnostics: (brouillon.diagnostics ?? []).map((d) =>
                                d.libelle === libelle ? { ...d, aRenouveler: v } : d,
                              ),
                            })
                          }
                          accessibilityLabel={`${libelle} doit être renouvelé`}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}

            <Text style={styles.note}>
              L’application ne juge pas la validité d’un diagnostic : les durées dépendent du
              diagnostic, de son résultat et de l’ancienneté de l’installation. C’est vous qui
              décidez s’il doit être renouvelé, et le bail l’imprime.
            </Text>
          </Carte>
        ) : null}

        {/* --- 7. Clauses particulières ---------------------------------- */}
        {etape === 'clauses' ? (
          <>
            <Carte>
              <Text style={styles.section}>Résidence principale</Text>
              <View style={styles.ligneBascule}>
                <Text style={styles.libelleBascule}>
                  {brouillon.residencePrincipale === false
                    ? 'Mention retirée'
                    : 'Le logement est la résidence principale du locataire'}
                </Text>
                <Switch
                  value={brouillon.residencePrincipale !== false}
                  onValueChange={(v) => changer({ residencePrincipale: v })}
                  accessibilityLabel="Mention de résidence principale"
                />
              </View>
              <Text style={styles.note}>
                La mention est reprise par les contrats types du 1er octobre 2026. Retirez-la
                seulement si le logement n’est pas la résidence principale du locataire.
              </Text>
            </Carte>

            <Carte>
              <Text style={styles.section}>Clauses particulières</Text>
              <Text style={styles.detail}>
                Votre texte est reproduit tel quel dans le bail. L’application n’écrit aucune clause
                à votre place.
              </Text>
              <Champ
                libelle="Clauses propres à ce bail"
                valeur={brouillon.clausesParticulieres ?? ''}
                onChangement={(v) => changer({ clausesParticulieres: v })}
                placeholder="Répartition des charges, entretien du jardin, animaux…"
                multiligne
                nombreDeLignes={6}
              />
            </Carte>

            {brouillon.categorie && REGLES_BAIL[brouillon.categorie].vigilance.length > 0 ? (
              <Carte>
                <Text style={styles.section}>Points de vigilance</Text>
                <Text style={styles.detail}>
                  Ce que la loi impose pour un bail de ce type. Ces points sont imprimés dans le
                  document.
                </Text>
                {REGLES_BAIL[brouillon.categorie].vigilance.map((point) => (
                  <Text key={point} style={styles.puce}>
                    • {point}
                  </Text>
                ))}
              </Carte>
            ) : null}
          </>
        ) : null}

        {/* --- 8. Annexes ------------------------------------------------ */}
        {etape === 'annexes' ? (
          <Carte>
            <Text style={styles.section}>Annexes au bail</Text>
            <Text style={styles.detail}>
              Cochez celles que vous joignez réellement. Une annexe obligatoire manquante est
              signalée, mais ne bloque pas : vous pouvez la joindre plus tard.
            </Text>

            {regle && regle.annexes.length > 0 ? (
              regle.annexes.map((annexe) => {
                const jointe = (brouillon.annexesFournies ?? []).includes(annexe);
                return (
                  <Pressable
                    key={annexe}
                    onPress={() =>
                      changer({
                        annexesFournies: jointe
                          ? (brouillon.annexesFournies ?? []).filter((a) => a !== annexe)
                          : [...(brouillon.annexesFournies ?? []), annexe],
                      })
                    }
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: jointe }}
                    accessibilityLabel={LIBELLE_ANNEXE[annexe]}
                    style={styles.ligneBascule}
                  >
                    <Text style={styles.case}>{jointe ? '☑' : '☐'}</Text>
                    <Text style={[styles.libelleBascule, styles.libelleDiagnostic]}>
                      {LIBELLE_ANNEXE[annexe]}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.detail}>
                Ce type de bail n’impose aucune annexe. Les pièces que vous joignez se rangent dans
                le dossier du logement.
              </Text>
            )}

            {/* Les annexes facultatives : une pièce qu'on joint sans qu'elle
                soit obligatoire reste une annexe, et doit pouvoir être cochée. */}
            {regle && regle.annexes.length > 0 ? (
              <>
                <Text style={styles.section}>Annexes facultatives</Text>
                {(Object.keys(LIBELLE_ANNEXE) as TypeAnnexe[])
                  .filter((a) => !regle.annexes.includes(a))
                  .map((annexe) => {
                    const jointe = (brouillon.annexesFournies ?? []).includes(annexe);
                    return (
                      <Pressable
                        key={annexe}
                        onPress={() =>
                          changer({
                            annexesFournies: jointe
                              ? (brouillon.annexesFournies ?? []).filter((a) => a !== annexe)
                              : [...(brouillon.annexesFournies ?? []), annexe],
                          })
                        }
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: jointe }}
                        accessibilityLabel={LIBELLE_ANNEXE[annexe]}
                        style={styles.ligneBascule}
                      >
                        <Text style={styles.case}>{jointe ? '☑' : '☐'}</Text>
                        <Text style={[styles.libelleBascule, styles.libelleDiagnostic]}>
                          {LIBELLE_ANNEXE[annexe]}
                        </Text>
                      </Pressable>
                    );
                  })}
              </>
            ) : null}

            <Text style={styles.note}>
              Les annexes ne sont pas produites par l’application : elle les liste dans le bail, à
              vous de les joindre. Les états des lieux et les inventaires, eux, s’établissent depuis
              la fiche du logement.
            </Text>
          </Carte>
        ) : null}

        {/* --- 9. Signatures --------------------------------------------- */}
        {etape === 'signature' ? (
          <>
            <Carte>
              <Text style={styles.section}>Qui signe</Text>
              <Text style={styles.detail}>
                Chaque partie signe au doigt sur cet écran. Une signature reste modifiable jusqu’à la
                génération du bail ; le document produit, lui, est figé.
              </Text>
              <Segments
                defilable
                segments={signataires.map((s) => ({
                  valeur: s.id,
                  libelle: s.nom,
                  compteur: (brouillon.signatures ?? []).some((sig) => sig.signataire === s.id)
                    ? 1
                    : undefined,
                }))}
                valeur={signataire}
                onChanger={(v: string) => setSignataire(v)}
              />
            </Carte>

            <Carte>
              <Text style={styles.section}>
                Signature de {signataires.find((s) => s.id === signataire)?.nom ?? ''}
              </Text>

              {signatureCourante ? (
                <>
                  {/* On montre l'image **telle que le PDF l'insérera**, et non un
                      aperçu redessiné : c'est la seule façon de vérifier avant
                      d'imprimer que la signature est bien la sienne. */}
                  <Image
                    source={{ uri: signatureCourante.trace }}
                    style={styles.signatureImage}
                    resizeMode="contain"
                    accessibilityLabel={`Signature de ${signatureCourante.nom}`}
                  />
                  <Text style={styles.note}>
                    Signé le {formaterDateFr(signatureCourante.date)}. Le document est figé à la
                    génération : une signature reste modifiable jusqu'à ce moment.
                  </Text>
                  <Bouton
                    libelle="Refaire cette signature"
                    variante="secondaire"
                    compact
                    pleineLargeur={false}
                    onPress={() => signer('')}
                  />
                </>
              ) : (
                <BlocSignature
                  // La clé force un pavé neuf à chaque changement de
                  // signataire : sans elle, le tracé du précédent resterait
                  // affiché sous le nom du suivant.
                  key={signataire}
                  chemin=""
                  onTrace={signer}
                  onDessinEnCours={(enCours) => setDefilement(!enCours)}
                  hauteur={180}
                  invite="Signez ici avec le doigt"
                />
              )}
            </Carte>

            {aSigner > 0 ? (
              <BandeauMessage
                ton="information"
                message={`Il reste ${aSigner} signature${aSigner > 1 ? 's' : ''} à recueillir. Vous pouvez générer le bail maintenant : les cadres resteraient marqués « Non signé ».`}
              />
            ) : (
              <BandeauMessage ton="succes" message="Toutes les parties ont signé." />
            )}

            <Carte>
              <Text style={styles.section}>Ce que vaut cette signature</Text>
              <Text style={styles.detail}>
                Un tracé au doigt matérialise votre accord, comme un exemplaire signé à la main puis
                numérisé. Il ne constitue pas une signature électronique qualifiée : l’application ne
                délivre ni certificat, ni horodatage, ni cachet d’un tiers de confiance. Chaque
                partie conserve un exemplaire du document.
              </Text>
            </Carte>
          </>
        ) : null}

        {/* Ce qui manque encore, en clair, et sans bloquer la navigation : le
            bailleur doit pouvoir revenir sur une étape sans être sermonné. */}
        {manques.length > 0 && derniere ? (
          <BandeauMessage
            ton="avertissement"
            message={`Le bail ne peut pas encore être établi :\n${manques.join('\n')}`}
          />
        ) : null}
      </ScrollView>

      <BarreActionFixe
        libelle={
          derniere ? 'Vérifier et générer le bail' : 'Continuer'
        }
        aide={
          manquesCourants.length > 0
            ? manquesCourants[0]
            : derniere && manques.length > 0
              ? `${manques.length} point${manques.length > 1 ? 's' : ''} à compléter`
              : undefined
        }
        onPress={avancer}
        secondaireLibelle={numeroEtape(etape) > 1 ? 'Précédent' : undefined}
        secondaireOnPress={numeroEtape(etape) > 1 ? reculer : undefined}
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
    pastilles: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: espaces.sm,
    },
    pastille: {
      width: 32,
      height: 32,
      borderRadius: rayons.rond,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: couleurs.fondSourdine,
    },
    pastilleFaite: {
      backgroundColor: couleurs.accentClair,
    },
    pastilleCourante: {
      backgroundColor: couleurs.accent,
    },
    pastilleTexte: {
      ...typographie.petitAppuye,
      color: couleurs.texteSecondaire,
    },
    pastilleTexteCourant: {
      color: couleurs.surAccent,
    },
    aideEtape: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      marginTop: -espaces.sm,
    },
    section: {
      ...typographie.petitAppuye,
      color: couleurs.texteTertiaire,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: espaces.sm,
    },
    nom: {
      ...typographie.titreCarte,
      color: couleurs.texte,
      marginBottom: 2,
    },
    valeur: {
      ...typographie.montantPetit,
      color: couleurs.texte,
      marginBottom: espaces.xs,
    },
    detail: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      marginBottom: espaces.xs,
    },
    details: {
      marginTop: espaces.xs,
    },
    note: {
      ...typographie.petit,
      color: couleurs.texteTertiaire,
      marginTop: espaces.sm,
      fontStyle: 'italic',
    },
    bloc: {
      paddingVertical: espaces.xs,
    },
    blocSepare: {
      marginTop: espaces.sm,
      paddingTop: espaces.sm,
      borderTopWidth: 1,
      borderTopColor: couleurs.bordure,
    },
    choix: {
      paddingVertical: espaces.md,
      paddingHorizontal: espaces.md,
      borderRadius: rayons.md,
      borderWidth: 1,
      borderColor: couleurs.bordure,
      marginTop: espaces.sm,
    },
    choixActif: {
      borderColor: couleurs.accent,
      borderWidth: 2,
      backgroundColor: couleurs.accentTresClair,
    },
    choixAppuye: {
      backgroundColor: couleurs.fondSurvol,
    },
    choixTitre: {
      ...typographie.corpsAppuye,
      color: couleurs.texte,
    },
    choixTitreActif: {
      color: couleurs.accentFonce,
    },
    choixDetail: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      marginTop: 2,
    },
    raccourcis: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: espaces.sm,
      marginTop: espaces.sm,
    },
    ligneBascule: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaces.md,
      paddingVertical: espaces.sm,
    },
    libelleBascule: {
      ...typographie.corps,
      color: couleurs.texte,
      flex: 1,
    },
    case: {
      fontSize: 20,
      color: couleurs.accent,
    },
    libelleDiagnostic: {
      ...typographie.corps,
    },
    diagnostic: {
      borderTopWidth: 1,
      borderTopColor: couleurs.bordure,
      paddingTop: espaces.xs,
    },
    signatureImage: {
      width: '100%',
      height: 120,
      backgroundColor: '#FFFFFF',
      borderRadius: rayons.md,
      borderWidth: 1,
      borderColor: couleurs.bordure,
    },
    sousChamp: {
      paddingLeft: espaces.xl,
      paddingBottom: espaces.sm,
    },
    puce: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      marginBottom: espaces.xs,
    },
  });

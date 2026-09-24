/**
 * Faire un état des lieux : formulaire guidé en six étapes.
 *
 * Trois principes gouvernent cet écran, et ils expliquent sa forme.
 *
 * **1. On ne ressaisit jamais ce qui est déjà enregistré.** Le logement, le
 * propriétaire, les locataires, le loyer et la date d'entrée viennent de la
 * base. Ils sont **montrés**, pas redemandés : les corriger ailleurs créerait un
 * second endroit où la même vérité s'écrit, et donc tôt ou tard deux versions.
 *
 * **2. On ne visite pas un logement deux fois.** La visite se fait pièce par
 * pièce, dans l'ordre, avec un état par élément et des photos prises sur place.
 * Les raccourcis — « tout est en bon état », « pièce suivante » — évitent de
 * toucher soixante fois l'écran pour un logement en bon état, sans jamais
 * écraser un constat déjà fait.
 *
 * **3. Rien ne se perd.** Le brouillon est enregistré à chaque changement, après
 * une courte pause, et à la sortie de l'écran. Les photos, elles, sont rangées
 * dans le dossier du logement **au moment où elles sont prises** : le brouillon
 * n'en porte que le chemin, et une photo ne dépend pas de la survie d'un
 * formulaire.
 *
 * L'écran ne produit aucun document. Il assemble un brouillon et le confie à
 * l'écran de vérification, qui appelle `emettreEtatDesLieux` — le seul point
 * d'entrée de la génération.
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
  EcranVide,
  EnTeteEcran,
  LigneDetail,
  Segments,
} from '@/ui/components';
import { espaces, rayons, tailles, typographie } from '@/ui/tokens';
import { aujourdHui, formaterDateFr } from '@/domain/period';
import { adresseEnLignes, nomComplet } from '@/domain/types';
import {
  COMPTEURS,
  ETAPES_EDL,
  ETATS_ELEMENT,
  LIBELLE_TYPE_EDL,
  ajouterElement,
  ajouterPhoto,
  avertissementsDeLEdl,
  etapePrecedenteEdl,
  etapeSuivanteEdl,
  manquesDeLEdl,
  manquesDeLEtapeEdl,
  numeroEtapeEdl,
  pieceVide,
  piecesInitiales,
  premierePieceARenseigner,
  reprendreBrouillonEdl,
  syntheseEdl,
  toutEnBonEtat,
  viderEtats,
} from '@/domain/etat-des-lieux';
import type {
  BrouillonEdl,
  CleRemise,
  ElementEdl,
  EtapeEdl,
  EtatElement,
  PieceEdl,
  ReleveCompteur,
  TypeCompteur,
} from '@/domain/etat-des-lieux';
import type { Signature } from '@/domain/signature';
import { analyserDonnees, brouillonRecent } from '@/domain/brouillon';
import { traceEnDataUri } from '@/pdf/bail';
import { formatMontant } from '@/domain/money';
import { useApplication } from '@/state/ApplicationContext';
import { enregistrerBrouillon, lireBrouillon } from '@/db/repositories/brouillons';
import { chargerContexteBail, type ContexteBail } from '@/documents/bail-contexte';
import { choisirPhoto, estRefus, prendrePhoto } from '@/documents/photos';
import { useStyles, type Couleurs } from '@/ui/theme';

/** Le mot employé partout pour désigner le bailleur dans les signatures. */
const SIGNATAIRE_BAILLEUR = 'bailleur';

export default function EcranNouvelEtatDesLieux() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { rafraichir } = useApplication();

  const params = useLocalSearchParams<{ logementId?: string }>();
  const logementId = typeof params.logementId === 'string' ? params.logementId : null;

  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [contexte, setContexte] = useState<ContexteBail | null>(null);
  const [brouillon, setBrouillon] = useState<BrouillonEdl | null>(null);
  const [etape, setEtape] = useState<EtapeEdl>('logement');
  const [reprisLe, setReprisLe] = useState<string | null>(null);
  const [pieceActive, setPieceActive] = useState(0);
  const [signataire, setSignataire] = useState<string>(SIGNATAIRE_BAILLEUR);
  const [defilement, setDefilement] = useState(true);
  const [photoEnCours, setPhotoEnCours] = useState<string | null>(null);

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

        // Le socle : ce que la location porte déjà. Un brouillon repris ne peut
        // pas le contredire, il ne peut que le compléter.
        const base: BrouillonEdl = {
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
        };

        const enregistre = await lireBrouillon(charge.logement.id, 'etat_des_lieux');
        const repris = enregistre
          ? reprendreBrouillonEdl(analyserDonnees(JSON.stringify(enregistre.donnees)), base)
          : base;

        if (!actif) return;
        setContexte(charge);
        setBrouillon(repris);

        if (enregistre && brouillonRecent(enregistre.majLe, aujourdHui())) {
          const rang = ETAPES_EDL.findIndex((e) => e.valeur === enregistre.etape);
          if (rang >= 0) setEtape(enregistre.etape as EtapeEdl);
          setReprisLe(enregistre.majLe.slice(0, 10));
        }
      } catch (e) {
        if (actif) {
          setErreur(
            e instanceof Error
              ? e.message
              : "L'état des lieux ne peut pas être préparé pour le moment.",
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
  // Enregistrement automatique
  // -------------------------------------------------------------------------

  const aEnregistrer = useRef<{ b: BrouillonEdl; e: EtapeEdl } | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sauvegarder = useCallback(async () => {
    const enAttente = aEnregistrer.current;
    if (!enAttente || !logementId) return;
    try {
      await enregistrerBrouillon({
        logementId,
        type: 'etat_des_lieux',
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
    // Un état des lieux se remplit avec des photos : la pause est plus courte
    // que pour un bail, parce qu'un appareil photo qui revient au premier plan
    // ne laisse pas toujours le temps d'un délai long.
    minuteur.current = setTimeout(() => void sauvegarder(), 500);
    return () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, [brouillon, etape, sauvegarder]);

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

  const manques = useMemo(
    () => (brouillon ? manquesDeLEdl(brouillon) : []),
    [brouillon],
  );
  const manquesCourants = useMemo(
    () => (brouillon ? manquesDeLEtapeEdl(brouillon, etape) : []),
    [brouillon, etape],
  );
  const synthese = useMemo(
    () => (brouillon ? syntheseEdl(brouillon) : null),
    [brouillon],
  );
  const avertissements = useMemo(
    () => (brouillon ? avertissementsDeLEdl(brouillon) : []),
    [brouillon],
  );

  const pieces = brouillon?.pieces ?? [];
  const piece = pieces[pieceActive] ?? pieces[0] ?? null;

  const signataires = useMemo(() => {
    if (!contexte) return [];
    const liste = [{ id: SIGNATAIRE_BAILLEUR, nom: contexte.proprietaire.nom }];
    for (const t of contexte.titulaires) liste.push({ id: t.id, nom: nomComplet(t) });
    return liste;
  }, [contexte]);

  function changer(partiel: Partial<BrouillonEdl>) {
    setBrouillon((actuel) => (actuel ? { ...actuel, ...partiel } : actuel));
  }

  /** Remplace la pièce active, en laissant les autres intactes. */
  function changerPiece(modifiee: PieceEdl) {
    if (!brouillon) return;
    const suivantes = [...(brouillon.pieces ?? [])];
    suivantes[pieceActive] = modifiee;
    changer({ pieces: suivantes });
  }

  // -------------------------------------------------------------------------
  // Photos
  // -------------------------------------------------------------------------

  /**
   * Prend une photo et la rattache à un élément — ou à la pièce, pour une vue
   * d'ensemble.
   *
   * La photo est rangée dans le dossier du logement **avant** d'être rattachée :
   * si le rangement échoue, rien n'est rattaché, et l'utilisateur voit pourquoi
   * plutôt que de découvrir une vignette vide en rouvrant le formulaire.
   */
  async function ajouterUnePhoto(elementId: string | null, source: 'camera' | 'galerie') {
    if (!brouillon || !piece) return;
    const cle = elementId ?? 'piece';
    setPhotoEnCours(cle);
    setErreur(null);
    try {
      const resultat = source === 'camera' ? await prendrePhoto() : await choisirPhoto();
      if (resultat === null) return; // annulé : ce n'est pas une erreur
      if (estRefus(resultat)) {
        setErreur(resultat.message);
        return;
      }

      const photo = {
        id: '',
        chemin: resultat.chemin,
        legende: '',
        priseLe: aujourdHui(),
        largeur: resultat.largeur,
        hauteur: resultat.hauteur,
      };

      if (elementId === null) {
        changerPiece({ ...piece, photos: [...piece.photos, photo] });
        return;
      }
      changerPiece({
        ...piece,
        elements: piece.elements.map((e) =>
          e.id === elementId ? ajouterPhoto(e, photo) : e,
        ),
      });
    } finally {
      setPhotoEnCours(null);
    }
  }

  /** Retire une photo d'un élément, ou de la pièce. */
  function retirerPhoto(elementId: string | null, photoId: string) {
    if (!piece) return;
    if (elementId === null) {
      changerPiece({ ...piece, photos: piece.photos.filter((p) => p.id !== photoId) });
      return;
    }
    changerPiece({
      ...piece,
      elements: piece.elements.map((e) =>
        e.id === elementId ? { ...e, photos: e.photos.filter((p) => p.id !== photoId) } : e,
      ),
    });
  }

  /** Écrit la légende d'une photo. */
  function legenderPhoto(elementId: string | null, photoId: string, legende: string) {
    if (!piece) return;
    const maj = (photos: PieceEdl['photos']) =>
      photos.map((p) => (p.id === photoId ? { ...p, legende } : p));
    if (elementId === null) {
      changerPiece({ ...piece, photos: maj(piece.photos) });
      return;
    }
    changerPiece({
      ...piece,
      elements: piece.elements.map((e) =>
        e.id === elementId ? { ...e, photos: maj(e.photos) } : e,
      ),
    });
  }

  // -------------------------------------------------------------------------
  // Signatures
  // -------------------------------------------------------------------------

  const signatureCourante = useMemo(
    () => (brouillon?.signatures ?? []).find((s) => s.signataire === signataire) ?? null,
    [brouillon, signataire],
  );

  function signer(chemin: string) {
    if (!brouillon) return;
    if (!chemin) {
      // Un tracé effacé retire la signature : elle redeviendra modifiable.
      changer({ signatures: (brouillon.signatures ?? []).filter((s) => s.signataire !== signataire) });
      return;
    }
    const nom = signataires.find((s) => s.id === signataire)?.nom ?? '';
    const autres = (brouillon.signatures ?? []).filter((s) => s.signataire !== signataire);
    const signature: Signature = {
      signataire,
      nom,
      date: aujourdHui(),
      // Le tracé est converti maintenant : le brouillon porte l'image telle que
      // le document l'insérera, et une signature ne dépend pas de la taille de
      // l'écran qui l'a recueillie.
      trace: traceEnDataUri(chemin, 600, 240),
    };
    changer({ signatures: [...autres, signature] });
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  function avancer() {
    if (manquesCourants.length > 0) {
      setErreur(manquesCourants.join('\n'));
      return;
    }
    setErreur(null);
    const suivante = etapeSuivanteEdl(etape);
    if (suivante) {
      setEtape(suivante);
      return;
    }
    void (async () => {
      await sauvegarder();
      router.push({
        pathname: '/etat-des-lieux/verification',
        params: { logementId: brouillon?.logementId },
      });
    })();
  }

  function reculer() {
    setErreur(null);
    const precedente: EtapeEdl | null = etapePrecedenteEdl(etape);
    if (precedente) setEtape(precedente);
  }

  /** Passe à la pièce suivante, en sautant à la première qui manque un état. */
  function pieceSuivante() {
    if (!piece) return;
    if (pieceActive + 1 < pieces.length) {
      setPieceActive(pieceActive + 1);
      return;
    }
    const manquante = premierePieceARenseigner(pieces);
    if (manquante) {
      const rang = pieces.findIndex((p) => p.id === manquante.id);
      if (rang >= 0) setPieceActive(rang);
      setErreur('Certaines pièces ont encore des éléments à renseigner.');
      return;
    }
    avancer();
  }

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------

  if (chargement) {
    return (
      <View style={styles.plein}>
        <ScrollView contentContainerStyle={[styles.contenu, { paddingTop: insets.top + espaces.sm }]}>
          <EnTeteEcran
            titre="État des lieux"
            actionLibelle="Fermer"
            actionOnPress={() => router.back()}
          />
          <Text style={styles.chargement}>Préparation de l’état des lieux…</Text>
        </ScrollView>
      </View>
    );
  }

  if (!logementId || !contexte || !brouillon) {
    return (
      <View style={styles.plein}>
        <ScrollView contentContainerStyle={[styles.contenu, { paddingTop: insets.top + espaces.sm }]}>
          <EnTeteEcran
            titre="État des lieux"
            actionLibelle="Fermer"
            actionOnPress={() => router.back()}
          />
          <EcranVide
            titre="État des lieux impossible"
            message={
              erreur ??
              "Ce logement n'a pas pu être chargé. Vérifiez qu'une location est bien en cours."
            }
            actionLibelle="Revenir"
            actionOnPress={() => router.back()}
            illustration="document"
          />
        </ScrollView>
      </View>
    );
  }

  const adresse = adresseEnLignes(contexte.logement);
  const numero = numeroEtapeEdl(etape);

  return (
    <View style={styles.plein}>
      <ScrollView
        scrollEnabled={defilement}
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: 140 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <EnTeteEcran
          titre={LIBELLE_TYPE_EDL[brouillon.type]}
          sousTitre={contexte.logement.nom}
          actionLibelle="Fermer"
          actionOnPress={() => router.back()}
        />

        {/* La progression : où l'on en est, sur combien d'étapes. */}
        <View style={styles.progression}>
          <Text style={styles.progressionTexte}>
            Étape {numero}/{ETAPES_EDL.length} — {ETAPES_EDL[numero - 1].titre}
          </Text>
          <View style={styles.pastilles}>
            {ETAPES_EDL.map((e, index) => (
              <Pressable
                key={e.valeur}
                onPress={() => setEtape(e.valeur)}
                accessibilityRole="button"
                accessibilityLabel={`Aller à l’étape ${index + 1} : ${e.titre}`}
                style={[styles.pastille, index + 1 === numero && styles.pastilleActive]}
              />
            ))}
          </View>
        </View>

        {reprisLe ? (
          <BandeauMessage
            message={`Une saisie du ${formaterDateFr(reprisLe)} a été reprise. Continuez où vous en étiez.`}
            ton="information"
            onFermer={() => setReprisLe(null)}
          />
        ) : null}

        {avertissement ? (
          <BandeauMessage message={avertissement} ton="avertissement" />
        ) : null}

        {erreur ? (
          <BandeauMessage message={erreur} ton="erreur" onFermer={() => setErreur(null)} />
        ) : null}

        {/* --- 1. Le logement ------------------------------------------- */}
        {etape === 'logement' ? (
          <>
            <Carte>
              <Text style={styles.titreCarte}>Le logement</Text>
              <LigneDetail libelle="Désignation" valeur={contexte.logement.nom} />
              <LigneDetail libelle="Adresse" valeur={adresse.join(', ')} />
              <LigneDetail
                libelle="Surface"
                valeur={contexte.logement.surface ? `${contexte.logement.surface} m²` : '—'}
              />
              <LigneDetail
                libelle="Type"
                valeur={contexte.logement.type}
              />
            </Carte>

            <Carte>
              <Text style={styles.titreCarte}>La location</Text>
              <LigneDetail
                libelle="Locataires"
                valeur={
                  contexte.titulaires.length > 0
                    ? contexte.titulaires.map((t) => nomComplet(t)).join(', ')
                    : 'Aucun'
                }
              />
              <LigneDetail
                libelle="Entrée"
                valeur={formaterDateFr(contexte.bail?.dateEntree ?? '')}
              />
              <LigneDetail
                libelle="Loyer et charges"
                valeur={
                  contexte.periode
                    ? formatMontant(contexte.periode.loyer + contexte.periode.charges)
                    : '—'
                }
              />
            </Carte>

            <Champ
              libelle="Date d’établissement"
              valeur={brouillon.dateEdl ?? ''}
              onChangement={(v) => changer({ dateEdl: v })}
              placeholder="AAAA-MM-JJ"
              aide="La date à laquelle vous constatez l’état du logement."
              obligatoire
            />

            <Champ
              libelle="Mandataire (facultatif)"
              valeur={brouillon.mandataire ?? ''}
              onChangement={(v) => changer({ mandataire: v })}
              placeholder="Nom et qualité, si quelqu’un vous représente"
              aide="Le décret demande, le cas échéant, le nom et le domicile du mandataire."
            />

            <Text style={styles.aide}>
              Ces informations viennent de la fiche du logement. Pour les corriger, revenez au
              logement : elles y sont modifiées pour toute l’application.
            </Text>
          </>
        ) : null}

        {/* --- 2. Les pièces -------------------------------------------- */}
        {etape === 'pieces' ? (
          <>
            <Text style={styles.intro}>
              Voici les pièces proposées pour ce logement. Renommez-les, retirez celles qui
              n’existent pas, ajoutez celles qui manquent : cette liste est un point de départ, pas
              une obligation.
            </Text>

            {pieces.map((p, index) => (
              <Carte key={p.id} style={styles.cartePiece}>
                <View style={styles.lignePiece}>
                  <View style={styles.champPiece}>
                    <Champ
                      libelle={`Pièce ${index + 1}`}
                      valeur={p.nom}
                      onChangement={(nom) => {
                        const suivantes = [...pieces];
                        suivantes[index] = { ...p, nom };
                        changer({ pieces: suivantes });
                      }}
                    />
                  </View>
                  <Bouton
                    libelle="Retirer"
                    variante="discret"
                    compact
                    onPress={() => {
                      const suivantes = pieces.filter((x) => x.id !== p.id);
                      changer({ pieces: suivantes });
                      setPieceActive(0);
                    }}
                  />
                </View>
                <Text style={styles.aide}>
                  {p.elements.length} élément(s) à décrire
                </Text>
              </Carte>
            ))}

            <Bouton
              libelle="Ajouter une pièce"
              variante="secondaire"
              onPress={() => {
                const suivantes = [
                  ...pieces,
                  // L'identifiant et les éléments proposés viennent du domaine, qui
                  // connaît déjà les noms de pièces : les refabriquer ici ferait
                  // diverger le formulaire et le contrôle final.
                  pieceVide('Nouvelle pièce', pieces.map((p) => p.id)),
                ];
                changer({ pieces: suivantes });
              }}
            />
          </>
        ) : null}

        {/* --- 3. Compteurs et clés ------------------------------------- */}
        {etape === 'compteurs' ? (
          <>
            <Carte>
              <Text style={styles.titreCarte}>Installation individuelle</Text>
              <View style={styles.ligneBascule}>
                <Text style={styles.texteBascule}>
                  Le logement a un chauffage ou un chauffe-eau individuel
                </Text>
                <Switch
                  value={brouillon.compteursIndividuels === true}
                  onValueChange={(v) => changer({ compteursIndividuels: v })}
                />
              </View>
              <Text style={styles.aide}>
                Si c’est le cas, la loi impose de relever les index sur l’état des lieux d’entrée
                et de sortie.
              </Text>
            </Carte>

            <Text style={styles.titreSection}>Relevés des compteurs</Text>
            {(brouillon.compteurs ?? []).map((releve, index) => (
              <Carte key={releve.id} style={styles.cartePiece}>
                <Text style={styles.titreCarte}>
                  {COMPTEURS.find((c) => c.valeur === releve.type)?.libelle ?? releve.type}
                </Text>
                <Champ
                  libelle="Index relevé"
                  valeur={releve.valeur}
                  onChangement={(valeur) => {
                    const suivants = [...(brouillon.compteurs ?? [])];
                    suivants[index] = { ...releve, valeur };
                    changer({ compteurs: suivants });
                  }}
                  placeholder="Ex. 007412"
                  clavier="numeric"
                  aide="Recopiez l’index tel qu’il est affiché, zéros compris."
                />
                <Champ
                  libelle="Précision (facultatif)"
                  valeur={releve.precision}
                  onChangement={(precision) => {
                    const suivants = [...(brouillon.compteurs ?? [])];
                    suivants[index] = { ...releve, precision };
                    changer({ compteurs: suivants });
                  }}
                  placeholder="Où se trouve le compteur"
                />
                <Bouton
                  libelle="Retirer ce relevé"
                  variante="discret"
                  compact
                  onPress={() =>
                    changer({
                      compteurs: (brouillon.compteurs ?? []).filter((c) => c.id !== releve.id),
                    })
                  }
                />
              </Carte>
            ))}

            <Text style={styles.sousTitreSection}>Ajouter un relevé</Text>
            <View style={styles.boutonsEnLigne}>
              {COMPTEURS.filter(
                (c) => !(brouillon.compteurs ?? []).some((r) => r.type === c.valeur),
              ).map((c) => (
                <Bouton
                  key={c.valeur}
                  libelle={c.libelle}
                  variante="secondaire"
                  compact
                  onPress={() => {
                    const suivants: ReleveCompteur[] = [
                      ...(brouillon.compteurs ?? []),
                      {
                        id: `c${(brouillon.compteurs ?? []).length + 1}`,
                        type: c.valeur as TypeCompteur,
                        valeur: '',
                        precision: '',
                      },
                    ];
                    changer({ compteurs: suivants });
                  }}
                />
              ))}
            </View>

            <Text style={styles.titreSection}>Clés et moyens d’accès</Text>
            {(brouillon.cles ?? []).map((cle, index) => (
              <Carte key={cle.id} style={styles.cartePiece}>
                <Champ
                  libelle="Désignation"
                  valeur={cle.libelle}
                  onChangement={(libelle) => {
                    const suivantes = [...(brouillon.cles ?? [])];
                    suivantes[index] = { ...cle, libelle };
                    changer({ cles: suivantes });
                  }}
                  placeholder="Clé, badge, télécommande…"
                />
                <Champ
                  libelle="Ce qu’elle ouvre"
                  valeur={cle.destination}
                  onChangement={(destination) => {
                    const suivantes = [...(brouillon.cles ?? [])];
                    suivantes[index] = { ...cle, destination };
                    changer({ cles: suivantes });
                  }}
                  placeholder="Porte d’entrée, cave, boîte aux lettres…"
                  obligatoire
                />
                <Champ
                  libelle="Quantité"
                  valeur={String(cle.quantite)}
                  onChangement={(v) => {
                    const suivantes = [...(brouillon.cles ?? [])];
                    suivantes[index] = { ...cle, quantite: Number(v) || 0 };
                    changer({ cles: suivantes });
                  }}
                  clavier="numeric"
                />
                <Bouton
                  libelle="Retirer cette clé"
                  variante="discret"
                  compact
                  onPress={() =>
                    changer({ cles: (brouillon.cles ?? []).filter((c) => c.id !== cle.id) })
                  }
                />
              </Carte>
            ))}

            <Bouton
              libelle="Ajouter une clé"
              variante="secondaire"
              onPress={() => {
                const suivantes: CleRemise[] = [
                  ...(brouillon.cles ?? []),
                  {
                    id: `k${(brouillon.cles ?? []).length + 1}`,
                    libelle: '',
                    destination: '',
                    quantite: 1,
                  },
                ];
                changer({ cles: suivantes });
              }}
            />
          </>
        ) : null}

        {/* --- 4. La visite --------------------------------------------- */}
        {etape === 'visite' ? (
          <>
            {pieces.length === 0 ? (
              <EcranVide
                titre="Aucune pièce"
                message="Revenez à l’étape précédente pour décrire au moins une pièce."
                illustration="maison"
              />
            ) : (
              <>
                <Segments
                  segments={pieces.map((p, index) => ({
                    valeur: String(index),
                    libelle: p.nom,
                    compteur: p.elements.filter((e) => !e.etat).length || undefined,
                  }))}
                  valeur={String(pieceActive)}
                  onChanger={(v) => setPieceActive(Number(v))}
                  defilable
                />

                {piece ? (
                  <>
                    <View style={styles.entetePiece}>
                      <Text style={styles.nomPiece}>{piece.nom}</Text>
                      <Text style={styles.aide}>
                        {piece.elements.filter((e) => !e.etat).length} élément(s) à renseigner
                      </Text>
                    </View>

                    <View style={styles.boutonsEnLigne}>
                      <Bouton
                        libelle="Tout est en bon état"
                        variante="secondaire"
                        compact
                        onPress={() => changerPiece(toutEnBonEtat(piece, 'bon'))}
                      />
                      <Bouton
                        libelle="Reprendre les états"
                        variante="discret"
                        compact
                        onPress={() => changerPiece(viderEtats(piece))}
                      />
                    </View>

                    {piece.elements.map((element) => (
                      <Carte key={element.id} style={styles.carteElement}>
                        <Text style={styles.nomElement}>{element.nom}</Text>

                        <View style={styles.etats}>
                          {ETATS_ELEMENT.map((etat) => {
                            const actif = element.etat === etat.valeur;
                            return (
                              <Pressable
                                key={etat.valeur}
                                onPress={() =>
                                  changerPiece({
                                    ...piece,
                                    elements: piece.elements.map((e) =>
                                      e.id === element.id
                                        ? { ...e, etat: actif ? undefined : etat.valeur }
                                        : e,
                                    ),
                                  })
                                }
                                accessibilityRole="button"
                                accessibilityState={{ selected: actif }}
                                accessibilityLabel={`${element.nom} : ${etat.libelle}`}
                                style={[styles.puceEtat, actif && styles.puceEtatActive]}
                              >
                                <Text
                                  style={[styles.textePuce, actif && styles.textePuceActive]}
                                >
                                  {etat.court}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        <Champ
                          libelle="Observation (facultatif)"
                          valeur={element.commentaire}
                          onChangement={(commentaire) =>
                            changerPiece({
                              ...piece,
                              elements: piece.elements.map((e) =>
                                e.id === element.id ? { ...e, commentaire } : e,
                              ),
                            })
                          }
                          multiligne
                          nombreDeLignes={2}
                          placeholder="Une précision sur cet élément"
                        />

                        <PhotosDunElement
                          photos={element.photos}
                          styles={styles}
                          occupe={photoEnCours === element.id}
                          onPrendre={() => void ajouterUnePhoto(element.id, 'camera')}
                          onChoisir={() => void ajouterUnePhoto(element.id, 'galerie')}
                          onRetirer={(photoId) => retirerPhoto(element.id, photoId)}
                          onLegender={(photoId, legende) =>
                            legenderPhoto(element.id, photoId, legende)
                          }
                        />

                        <Bouton
                          libelle="Retirer cet élément"
                          variante="discret"
                          compact
                          onPress={() =>
                            changerPiece({
                              ...piece,
                              elements: piece.elements.filter((e) => e.id !== element.id),
                            })
                          }
                        />
                      </Carte>
                    ))}

                    <AjoutElement
                      styles={styles}
                      onAjouter={(nom) => changerPiece(ajouterElement(piece, nom))}
                    />

                    <Text style={styles.titreSection}>Vue d’ensemble de la pièce</Text>
                    <PhotosDunElement
                      photos={piece.photos}
                      styles={styles}
                      occupe={photoEnCours === 'piece'}
                      onPrendre={() => void ajouterUnePhoto(null, 'camera')}
                      onChoisir={() => void ajouterUnePhoto(null, 'galerie')}
                      onRetirer={(photoId) => retirerPhoto(null, photoId)}
                      onLegender={(photoId, legende) => legenderPhoto(null, photoId, legende)}
                    />
                  </>
                ) : null}
              </>
            )}
          </>
        ) : null}

        {/* --- 5. Observations ------------------------------------------ */}
        {etape === 'observations' ? (
          <>
            <Champ
              libelle="Observations et réserves"
              valeur={brouillon.observations ?? ''}
              onChangement={(v) => changer({ observations: v })}
              multiligne
              nombreDeLignes={6}
              placeholder="Ce qui vaut pour le logement entier : travaux annoncés, compteur partagé, équipement manquant…"
              aide="Ce texte est imprimé tel quel dans le document, sous « Observations et réserves »."
            />

            {avertissements.length > 0 ? (
              <Carte>
                <Text style={styles.titreCarte}>Ce que le document signalera</Text>
                {avertissements.map((a) => (
                  <Text key={a} style={styles.avertissement}>
                    • {a}
                  </Text>
                ))}
              </Carte>
            ) : null}
          </>
        ) : null}

        {/* --- 6. Signatures -------------------------------------------- */}
        {etape === 'signature' ? (
          <>
            <Text style={styles.intro}>
              Chaque partie signe sur l’écran. Une signature peut être refaite autant de fois que
              nécessaire tant que le document n’est pas établi ; elle est ensuite figée.
            </Text>

            <Segments
              segments={signataires.map((s) => ({ valeur: s.id, libelle: s.nom }))}
              valeur={signataire}
              onChanger={setSignataire}
              defilable
            />

            <BlocSignature
              chemin={signatureCourante?.trace ?? ''}
              onTrace={signer}
              onDessinEnCours={(enCours) => setDefilement(!enCours)}
              invite={
                signatureCourante
                  ? 'Signé. Effacez pour recommencer.'
                  : `Signature de ${signataires.find((s) => s.id === signataire)?.nom ?? ''}`
              }
            />

            <Carte>
              <Text style={styles.titreCarte}>Où en sont les signatures</Text>
              {signataires.map((s) => (
                <LigneDetail
                  key={s.id}
                  libelle={s.nom}
                  valeur={signatureCouranteDe(brouillon, s.id) ? 'Signé' : 'En attente'}
                  accentuee={!!signatureCouranteDe(brouillon, s.id)}
                />
              ))}
            </Carte>

            <Text style={styles.aide}>
              Ces signatures matérialisent l’accord des parties, comme un exemplaire signé à la
              main. Elles ne constituent pas une signature électronique qualifiée : l’application
              ne délivre ni certificat, ni horodatage. Le document le dira.
            </Text>
          </>
        ) : null}
      </ScrollView>

      <BarreActionFixe
        libelle={etape === 'signature' ? 'Vérifier le document' : 'Continuer'}
        onPress={avancer}
        aide={
          manquesCourants.length > 0
            ? `${manquesCourants.length} point(s) à compléter`
            : undefined
        }
        secondaireLibelle={numero > 1 ? 'Précédent' : undefined}
        secondaireOnPress={numero > 1 ? reculer : undefined}
      />

      {etape === 'visite' && pieces.length > 1 ? (
        <View style={[styles.barrePiece, { paddingBottom: insets.bottom }]}>
          <Bouton
            libelle={pieceActive + 1 < pieces.length ? 'Pièce suivante' : 'Terminer la visite'}
            variante="principal"
            pleineLargeur
            onPress={pieceSuivante}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Une signature déjà recueillie, pour l'affichage du tableau des signatures. */
function signatureCouranteDe(brouillon: BrouillonEdl, signataire: string) {
  return (brouillon.signatures ?? []).find((s) => s.signataire === signataire);
}

/**
 * Les photos d'un élément — ou d'une pièce, quand `elementId` est nul.
 *
 * Le même bloc sert aux deux, parce que la photo d'ensemble et la photo de
 * détail se prennent et se légendent de la même façon : deux écrans auraient
 * produit deux comportements.
 */
function PhotosDunElement({
  photos,
  styles,
  occupe,
  onPrendre,
  onChoisir,
  onRetirer,
  onLegender,
}: {
  photos: { id: string; chemin: string; legende: string }[];
  styles: ReturnType<typeof creerStyles>;
  occupe: boolean;
  onPrendre: () => void;
  onChoisir: () => void;
  onRetirer: (photoId: string) => void;
  onLegender: (photoId: string, legende: string) => void;
}) {
  return (
    <View style={styles.blocPhotos}>
      {photos.map((photo) => (
        <View key={photo.id} style={styles.photo}>
          <Image source={{ uri: photo.chemin }} style={styles.vignette} />
          <View style={styles.photoTextes}>
            <Champ
              libelle="Légende (facultatif)"
              valeur={photo.legende}
              onChangement={(legende) => onLegender(photo.id, legende)}
              placeholder="Ce que la photo montre"
            />
            <Bouton
              libelle="Retirer la photo"
              variante="discret"
              compact
              onPress={() => onRetirer(photo.id)}
            />
          </View>
        </View>
      ))}

      <View style={styles.boutonsEnLigne}>
        <Bouton
          libelle="Prendre une photo"
          variante="secondaire"
          compact
          occupe={occupe}
          onPress={onPrendre}
        />
        <Bouton
          libelle="Choisir une photo"
          variante="discret"
          compact
          onPress={onChoisir}
        />
      </View>
    </View>
  );
}

/** Un champ d'ajout d'élément, avec son bouton — l'état vit ici, pas dans le parent. */
function AjoutElement({
  styles,
  onAjouter,
}: {
  styles: ReturnType<typeof creerStyles>;
  onAjouter: (nom: string) => void;
}) {
  const [nom, setNom] = useState('');
  const ajouter = () => {
    const propre = nom.trim();
    if (!propre) return;
    onAjouter(propre);
    setNom('');
  };
  return (
    <View style={styles.blocAjout}>
      <View style={styles.champAjout}>
        <Champ
          libelle="Nom de l’élément"
          valeur={nom}
          onChangement={setNom}
          placeholder="Ex. Volets roulants"
          retourAuto
          onSubmit={ajouter}
        />
      </View>
      <Bouton libelle="Ajouter" variante="secondaire" compact onPress={ajouter} />
    </View>
  );
}

function creerStyles(couleurs: Couleurs) {
  return StyleSheet.create({
    plein: { flex: 1, backgroundColor: couleurs.fond },
    contenu: { paddingHorizontal: espaces.lg, paddingBottom: espaces.xxxl, gap: espaces.md },
    chargement: {
      ...typographie.corps,
      color: couleurs.texteSecondaire,
      textAlign: 'center',
      marginTop: espaces.xxxl,
    },

    progression: { gap: espaces.sm },
    progressionTexte: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      fontWeight: '600',
    },
    pastilles: { flexDirection: 'row', gap: espaces.xs },
    pastille: {
      flex: 1,
      height: 6,
      borderRadius: rayons.rond,
      backgroundColor: couleurs.fondSourdine,
    },
    pastilleActive: { backgroundColor: couleurs.accent },

    titreCarte: {
      ...typographie.titreCarte,
      color: couleurs.texte,
      marginBottom: espaces.sm,
    },
    titreSection: {
      ...typographie.titreSection,
      color: couleurs.texte,
      marginTop: espaces.lg,
    },
    sousTitreSection: {
      ...typographie.corps,
      fontWeight: '600',
      color: couleurs.texteSecondaire,
      marginTop: espaces.md,
    },
    intro: { ...typographie.corps, color: couleurs.texteSecondaire, lineHeight: 22 },
    aide: { ...typographie.petit, color: couleurs.texteTertiaire, lineHeight: 18 },

    cartePiece: { gap: espaces.sm },
    lignePiece: { flexDirection: 'row', alignItems: 'flex-end', gap: espaces.sm },
    champPiece: { flex: 1 },

    ligneBascule: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaces.md,
    },
    texteBascule: { ...typographie.corps, color: couleurs.texte, flex: 1 },

    boutonsEnLigne: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.sm },

    entetePiece: { gap: espaces.xs },
    nomPiece: { ...typographie.corpsAppuye, color: couleurs.texte },

    carteElement: { gap: espaces.sm },
    nomElement: { ...typographie.corps, fontWeight: '600', color: couleurs.texte },
    etats: { flexDirection: 'row', flexWrap: 'wrap', gap: espaces.xs },
    puceEtat: {
      paddingHorizontal: espaces.md,
      paddingVertical: espaces.sm,
      borderRadius: rayons.rond,
      backgroundColor: couleurs.fondSourdine,
      borderWidth: 1,
      borderColor: couleurs.bordure,
      minHeight: 36,
      justifyContent: 'center',
    },
    puceEtatActive: { backgroundColor: couleurs.accent, borderColor: couleurs.accent },
    textePuce: { ...typographie.petit, color: couleurs.texteSecondaire, fontWeight: '600' },
    textePuceActive: { color: couleurs.surAccent },

    blocPhotos: { gap: espaces.sm },
    photo: { flexDirection: 'row', gap: espaces.sm, alignItems: 'flex-start' },
    vignette: {
      width: 84,
      height: 84,
      borderRadius: rayons.md,
      backgroundColor: couleurs.fondSourdine,
    },
    photoTextes: { flex: 1, gap: espaces.xs },

    blocAjout: { flexDirection: 'row', alignItems: 'flex-end', gap: espaces.sm },
    champAjout: { flex: 1 },

    avertissement: { ...typographie.petit, color: couleurs.texteSecondaire, lineHeight: 19 },

    barrePiece: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: espaces.lg,
      paddingTop: espaces.sm,
      backgroundColor: couleurs.fond,
      borderTopWidth: 1,
      borderTopColor: couleurs.bordure,
    },
  });
}

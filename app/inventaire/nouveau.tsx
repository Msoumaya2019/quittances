/**
 * Faire un inventaire du mobilier : formulaire guidé en cinq étapes.
 *
 * Trois principes gouvernent cet écran, les mêmes que pour l'état des lieux.
 *
 * **1. On ne ressaisit jamais ce qui est déjà enregistré.** Le logement, le
 * propriétaire, les locataires, le loyer et la date d'entrée viennent de la
 * base. Ils sont **montrés**, pas redemandés.
 *
 * **2. On ne compte pas un meuble deux fois.** Le mobilier se relève pièce par
 * pièce, dans l'ordre. Les raccourcis — « tout est en bon état », « reprendre
 * les quantités de l'entrée », « pièce suivante » — évitent de toucher soixante
 * fois l'écran, **sans jamais écraser un constat déjà fait** : reprendre une
 * quantité effacerait un comptage, et un comptage effacé ne se retrouve pas.
 *
 * **3. Rien ne se perd.** Le brouillon est enregistré à chaque changement, après
 * une courte pause, et à la sortie de l'écran. Les photos sont rangées dans le
 * dossier du logement **au moment où elles sont prises** : le brouillon n'en
 * porte que le chemin.
 *
 * Ce que l'inventaire ajoute à l'état des lieux :
 *
 * - **La quantité d'entrée est rappelée, jamais reprise d'office.** Pour une
 *   sortie, l'écran affiche le nombre compté à l'entrée à côté du champ vide.
 *   Un rappel se lit, il ne se valide pas : recopier « 2 chaises » à la sortie
 *   serait un inventaire inventé.
 * - **Une quantité absente n'est pas un zéro.** Un meuble non compté laisse le
 *   champ vide, et le document le dit. Mettre `1` par défaut compterait un
 *   meuble que personne n'a compté.
 * - **La déclaration « loué meublé » se lit à l'entrée.** Pour une sortie, elle
 *   n'est pas modifiable ici : c'est celle qui a été signée, et le document
 *   refuse de se contredire.
 *
 * L'écran ne produit aucun document. Il assemble un brouillon et le confie à
 * l'écran de vérification, qui appelle `emettreInventaire` — le seul point
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
import { aujourdHui } from '@/domain/period';
import { adresseEnLignes, nomComplet } from '@/domain/types';
import type { PieceDossier } from '@/domain/types';
import {
  ETAPES_INVENTAIRE,
  MEUBLES_GENERIQUES,
  ajouterMeuble,
  ajouterPhoto,
  avertissementsDeLInventaire,
  etapePrecedenteInventaire,
  etapeSuivanteInventaire,
  identifiantsDePhotos,
  manquesDeLEtapeInventaire,
  manquesDeLInventaire,
  numeroEtapeInventaire,
  pieceInventaireVide,
  piecesInitialesInventaire,
  premierePieceARenseigner,
  quantiteRappelee,
  reprendreBrouillonInventaire,
  reprendreLesQuantites,
  sortieInventaireDepuisLEntree,
  syntheseInventaire,
  toutEnBonEtat,
  viderConstat,
} from '@/domain/inventaire';
import type {
  BrouillonInventaire,
  EtapeInventaire,
  MeubleInventaire,
  PieceInventaire,
  SortieInventaireDerivee,
  TypeInventaire,
} from '@/domain/inventaire';
import { ETATS_ELEMENT, libelleEtat } from '@/domain/etats';
import type { EtatElement } from '@/domain/etats';
import type { Signature } from '@/domain/signature';
import { analyserDonnees, brouillonDeLInventaire, brouillonRecent } from '@/domain/brouillon';
import { traceEnDataUri } from '@/pdf/bail';
import { formatMontant } from '@/domain/money';
import { useApplication } from '@/state/ApplicationContext';
import { enregistrerBrouillon, lireBrouillon } from '@/db/repositories/brouillons';
import { piecesDuLogement } from '@/db/repositories/pieces';
import { chargerContexteBail, type ContexteBail } from '@/documents/bail-contexte';
import { choisirPhoto, estRefus, prendrePhoto } from '@/documents/photos';
import { useStyles, type Couleurs } from '@/ui/theme';

/** Le mot employé partout pour désigner le bailleur dans les signatures. */
const SIGNATAIRE_BAILLEUR = 'bailleur';

/** L'état appliqué par le raccourci « tout est en bon état ». */
const ETAT_COURANT: EtatElement = 'bon';

export default function EcranNouvelInventaire() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { rafraichir } = useApplication();

  const params = useLocalSearchParams<{ logementId?: string; type?: string }>();
  const logementId = typeof params.logementId === 'string' ? params.logementId : null;
  // La nature du document est **donnée** par l'écran qui ouvre celui-ci, et
  // jamais devinée : c'est elle qui décide des sections imprimées, du brouillon
  // repris, et de la comparaison à établir.
  const type: TypeInventaire = params.type === 'sortie' ? 'sortie' : 'entree';
  const typeBrouillon = brouillonDeLInventaire(type);

  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [contexte, setContexte] = useState<ContexteBail | null>(null);
  const [brouillon, setBrouillon] = useState<BrouillonInventaire | null>(null);
  /**
   * Ce que l'inventaire d'entrée portait, pour une sortie.
   *
   * Sert à deux choses, et à rien d'autre : rappeler la quantité comptée à
   * l'entrée en regard du champ vide, et empêcher qu'un meuble ajouté reprenne
   * l'identifiant d'un meuble de l'entrée retiré entre-temps — ce qui
   * apparierait deux choses différentes dans le document comparatif.
   */
  const [derive, setDerive] = useState<SortieInventaireDerivee | null>(null);
  const [entreePieces, setEntreePieces] = useState<PieceInventaire[] | null>(null);
  const [entreeMeuble, setEntreeMeuble] = useState<boolean | null>(null);
  const [entreeDate, setEntreeDate] = useState<string | null>(null);
  const [etape, setEtape] = useState<EtapeInventaire>('logement');
  const [reprisLe, setReprisLe] = useState<string | null>(null);
  const [pieceActive, setPieceActive] = useState(0);
  const [signataire, setSignataire] = useState<string>(SIGNATAIRE_BAILLEUR);
  const [defilement, setDefilement] = useState(true);
  const [photoEnCours, setPhotoEnCours] = useState<string | null>(null);
  const [nouveauMeuble, setNouveauMeuble] = useState('');

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

        // Pour une sortie, l'inventaire d'entrée est lu **avant** de construire
        // le socle : les pièces, les meubles et leurs identifiants en viennent.
        // C'est ce qui rend la comparaison possible — les deux documents
        // partagent alors les mêmes identifiants, et l'appariement se fait par
        // égalité, jamais par nom ni par rang.
        let entree: PieceDossier | null = null;
        let lueEntree: BrouillonInventaire | null = null;
        if (type === 'sortie') {
          const pieces = await piecesDuLogement(charge.logement.id);
          // Les pièces sont rendues de la plus récente à la plus ancienne. Un
          // inventaire d'entrée se reconnaît à son **contenu** : les deux
          // natures partagent le même type de pièce, `inventaire`.
          entree =
            pieces.find(
              (p) => p.type === 'inventaire' && analyserDonnees(p.donnees).type === 'entree',
            ) ?? null;
          if (!entree) {
            throw new Error(
              "Ce logement n'a pas d'inventaire du mobilier d'entrée. Un inventaire de sortie " +
                "se compare à une entrée : faites d'abord l'inventaire d'entrée, et la sortie " +
                'reprendra ensuite ses pièces et ses meubles.',
            );
          }

          lueEntree = reprendreBrouillonInventaire(analyserDonnees(entree.donnees), {
            logementId: charge.logement.id,
            bailId: charge.bail?.id ?? '',
            type: 'entree',
            pieces: [],
          });

          if (!lueEntree.pieces || lueEntree.pieces.length === 0) {
            // Un inventaire rangé par une version antérieure n'a qu'un PDF : ses
            // meubles ne sont pas lisibles. Repartir d'une liste par défaut
            // donnerait une comparaison vide, c'est-à-dire un document qui
            // affirme que rien n'a changé. Le dire est plus honnête.
            throw new Error(
              "L'inventaire d'entrée de ce logement ne contient pas le détail de ses meubles : " +
                "il a été rangé par une version antérieure de l’application, qui ne conservait " +
                "que le PDF. Une sortie ne peut pas s’y comparer. Refaites un inventaire " +
                'd’entrée, ou rangez la sortie comme un autre document.',
            );
          }
        }

        const derivee = lueEntree
          ? sortieInventaireDepuisLEntree({ pieces: lueEntree.pieces })
          : null;

        // Le socle : ce que la location porte déjà. Un brouillon repris ne peut
        // pas le contredire, il ne peut que le compléter.
        const base: BrouillonInventaire = {
          logementId: charge.logement.id,
          bailId: charge.bail?.id ?? '',
          type,
          dateInventaire: aujourdHui(),
          pieces: derivee ? derivee.pieces : piecesInitialesInventaire(charge.logement.type),
          observations: '',
          mandataire: '',
          // La déclaration « loué meublé » de l'entrée fait foi : c'est elle qui
          // a été signée, et le document refuse de se contredire. Pour une
          // entrée, elle est faite ici, et reste modifiable.
          meuble: type === 'sortie' ? lueEntree?.meuble === true : false,
          signatures: [],
          inventaireEntreeId: entree?.id,
          dateEntree: entree?.dateDocument,
        };

        const enregistre = await lireBrouillon(charge.logement.id, typeBrouillon);
        const repris = enregistre
          ? reprendreBrouillonInventaire(analyserDonnees(JSON.stringify(enregistre.donnees)), base)
          : base;

        if (!actif) return;
        setContexte(charge);
        setDerive(derivee);
        setEntreePieces(lueEntree?.pieces ?? null);
        setEntreeMeuble(lueEntree ? lueEntree.meuble === true : null);
        setEntreeDate(entree?.dateDocument ?? null);
        setBrouillon(repris);

        if (enregistre && brouillonRecent(enregistre.majLe, aujourdHui())) {
          const rang = ETAPES_INVENTAIRE.findIndex((e) => e.valeur === enregistre.etape);
          if (rang >= 0) setEtape(enregistre.etape as EtapeInventaire);
          setReprisLe(enregistre.majLe.slice(0, 10));
        }
      } catch (e) {
        if (actif) {
          setErreur(
            e instanceof Error
              ? e.message
              : "L'inventaire ne peut pas être préparé pour le moment.",
          );
        }
      } finally {
        if (actif) setChargement(false);
      }
    })();

    return () => {
      actif = false;
    };
  }, [logementId, type, typeBrouillon]);

  // -------------------------------------------------------------------------
  // Enregistrement automatique
  // -------------------------------------------------------------------------

  const aEnregistrer = useRef<{ b: BrouillonInventaire; e: EtapeInventaire } | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sauvegarder = useCallback(async () => {
    const enAttente = aEnregistrer.current;
    if (!enAttente || !logementId) return;
    try {
      await enregistrerBrouillon({
        logementId,
        type: typeBrouillon,
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
  }, [logementId, typeBrouillon]);

  useEffect(() => {
    if (!brouillon) return;
    aEnregistrer.current = { b: brouillon, e: etape };
    if (minuteur.current) clearTimeout(minuteur.current);
    // Un inventaire se remplit avec des photos : la pause est plus courte que
    // pour un bail, parce qu'un appareil photo qui revient au premier plan ne
    // laisse pas toujours le temps d'un délai long.
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

  const manquesCourants = useMemo(
    () => (brouillon ? manquesDeLEtapeInventaire(brouillon, etape) : []),
    [brouillon, etape],
  );
  const manques = useMemo(
    () => (brouillon ? manquesDeLInventaire(brouillon) : []),
    [brouillon, etape],
  );
  const synthese = useMemo(
    () => (brouillon ? syntheseInventaire(brouillon) : null),
    [brouillon],
  );
  const avertissements = useMemo(
    () => (brouillon ? avertissementsDeLInventaire(brouillon) : []),
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

  function changer(partiel: Partial<BrouillonInventaire>) {
    setBrouillon((actuel) => (actuel ? { ...actuel, ...partiel } : actuel));
  }

  /** Remplace la pièce active, en laissant les autres intactes. */
  function changerPiece(modifiee: PieceInventaire) {
    if (!brouillon) return;
    const suivantes = [...(brouillon.pieces ?? [])];
    suivantes[pieceActive] = modifiee;
    changer({ pieces: suivantes });
  }

  /**
   * Les identifiants de meubles de l'entrée qu'il ne faut **pas** réattribuer
   * dans cette pièce.
   *
   * Si le bailleur retire un meuble puis en ajoute un autre, un identifiant
   * laissé libre serait rendu au nouveau venu — et la comparaison apparierait le
   * nouveau meuble avec celui de l'entrée qu'il remplace, en imprimant un écart
   * qui n'a pas eu lieu.
   */
  function identifiantsDeLEntree(pieceId: string): string[] {
    const entree = (entreePieces ?? []).find((p) => p.id === pieceId);
    return entree ? entree.meubles.map((m) => m.id) : [];
  }

  // -------------------------------------------------------------------------
  // Photos
  // -------------------------------------------------------------------------

  /**
   * Prend une photo et la rattache à un meuble.
   *
   * La photo est rangée dans le dossier du logement **avant** d'être rattachée :
   * si le rangement échoue, rien n'est rattaché, et l'utilisateur voit pourquoi
   * plutôt que de découvrir une vignette vide en rouvrant le formulaire.
   */
  async function ajouterUnePhoto(meubleId: string, source: 'camera' | 'galerie') {
    if (!brouillon || !piece) return;
    setPhotoEnCours(meubleId);
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

      // Les identifiants de photos sont rendus uniques **dans tout le
      // document**, et non dans le seul meuble qui reçoit la photo :
      // l'impression indexe les images par identifiant, si bien que deux meubles
      // portant chacun un `ph1` n'en faisaient dessiner qu'une seule, et la
      // seconde photo disparaissait sans que rien ne le signale.
      const prises = identifiantsDePhotos(pieces);

      changerPiece({
        ...piece,
        meubles: piece.meubles.map((m) =>
          m.id === meubleId ? ajouterPhoto(m, photo, prises) : m,
        ),
      });
    } finally {
      setPhotoEnCours(null);
    }
  }

  /** Retire une photo d'un meuble. */
  function retirerPhoto(meubleId: string, photoId: string) {
    if (!piece) return;
    changerPiece({
      ...piece,
      meubles: piece.meubles.map((m) =>
        m.id === meubleId ? { ...m, photos: m.photos.filter((p) => p.id !== photoId) } : m,
      ),
    });
  }

  /** Écrit la légende d'une photo. */
  function legenderPhoto(meubleId: string, photoId: string, legende: string) {
    if (!piece) return;
    changerPiece({
      ...piece,
      meubles: piece.meubles.map((m) =>
        m.id === meubleId
          ? { ...m, photos: m.photos.map((p) => (p.id === photoId ? { ...p, legende } : p)) }
          : m,
      ),
    });
  }

  // -------------------------------------------------------------------------
  // Le mobilier : compter et constater
  // -------------------------------------------------------------------------

  /** Modifie un meuble de la pièce active, en laissant les autres intactes. */
  function changerMeuble(meubleId: string, partiel: Partial<MeubleInventaire>) {
    if (!piece) return;
    changerPiece({
      ...piece,
      meubles: piece.meubles.map((m) => (m.id === meubleId ? { ...m, ...partiel } : m)),
    });
  }

  /**
   * Une quantité saisie, ou `undefined` si le champ est vide.
   *
   * Un champ vide rend `undefined`, et **jamais** zéro : « je ne l'ai pas
   * compté » et « il n'y en a plus » sont deux constats différents, et le second
   * s'écrit explicitement `0`.
   */
  function quantiteSaisie(texte: string): number | undefined {
    const chiffres = texte.replace(/[^0-9]/g, '');
    if (!chiffres) return undefined;
    const nombre = Number.parseInt(chiffres, 10);
    return Number.isFinite(nombre) ? nombre : undefined;
  }

  /** Le rappel de la quantité comptée à l'entrée, pour ce meuble. */
  function rappelDeLEntree(pieceId: string, meubleId: string): number | undefined {
    return derive ? quantiteRappelee(derive, pieceId, meubleId) : undefined;
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
      changer({
        signatures: (brouillon.signatures ?? []).filter((s) => s.signataire !== signataire),
      });
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
    const suivante = etapeSuivanteInventaire(etape);
    if (suivante) {
      setEtape(suivante);
      return;
    }
    void (async () => {
      await sauvegarder();
      router.push({
        pathname: '/inventaire/verification',
        params: { logementId: brouillon?.logementId, type },
      });
    })();
  }

  function reculer() {
    setErreur(null);
    const precedente: EtapeInventaire | null = etapePrecedenteInventaire(etape);
    if (precedente) setEtape(precedente);
  }

  /** Passe à la pièce suivante, en sautant à la première qui manque un meuble. */
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
      setErreur('Certaines pièces ont encore des meubles à compter ou à constater.');
      return;
    }
    avancer();
  }

  const numero = numeroEtapeInventaire(etape);

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------

  if (chargement) {
    return (
      <View style={styles.plein}>
        <ScrollView
          contentContainerStyle={[styles.contenu, { paddingTop: insets.top + espaces.sm }]}
        >
          <EnTeteEcran
            titre="Inventaire du mobilier"
            sousTitre="Préparation…"
            actionLibelle="Fermer"
            actionOnPress={() => router.back()}
          />
          <Text style={styles.chargement}>Lecture du logement…</Text>
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
            titre="Inventaire du mobilier"
            actionLibelle="Fermer"
            actionOnPress={() => router.back()}
          />
          <BandeauMessage
            ton="erreur"
            message={erreur ?? "Cet inventaire ne peut pas être préparé."}
          />
          <EcranVide
            titre="Rien à faire ici"
            message="Revenez à la fiche du logement et relancez l’inventaire."
            illustration="document"
            actionLibelle="Retour"
            actionOnPress={() => router.back()}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.plein}>
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + 180 },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={defilement}
      >
        <EnTeteEcran
          titre={type === 'entree' ? "Inventaire d'entrée" : 'Inventaire de sortie'}
          sousTitre={`Étape ${numero}/${ETAPES_INVENTAIRE.length} · ${
            ETAPES_INVENTAIRE[numero - 1]?.titre ?? ''
          }`}
          actionLibelle="Fermer"
          actionOnPress={() => router.back()}
        />

        <Text style={styles.aide}>
          {ETAPES_INVENTAIRE[numero - 1]?.aide ?? ''}
        </Text>

        {reprisLe ? (
          <BandeauMessage
            ton="information"
            message={`Saisie reprise du ${reprisLe}.`}
            onFermer={() => setReprisLe(null)}
          />
        ) : null}

        {avertissement ? (
          <BandeauMessage
            ton="avertissement"
            message={avertissement}
            onFermer={() => setAvertissement(null)}
          />
        ) : null}

        {erreur ? (
          <BandeauMessage ton="erreur" message={erreur} onFermer={() => setErreur(null)} />
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Étape 1 — le logement                                            */}
        {/* ---------------------------------------------------------------- */}
        {etape === 'logement' ? (
          <>
            <Carte>
              <Text style={styles.titreCarte}>{contexte.logement.nom}</Text>
              {adresseEnLignes(contexte.logement).map((ligne) => (
                <Text key={ligne} style={styles.ligneTexte}>
                  {ligne}
                </Text>
              ))}
            </Carte>

            <Carte>
              <Text style={styles.titreCarte}>La location</Text>
              {contexte.bail ? (
                <>
                  {contexte.periode ? (
                    <>
                      <LigneDetail
                        libelle="Loyer hors charges"
                        valeur={formatMontant(contexte.periode.loyer)}
                      />
                      <LigneDetail
                        libelle="Charges"
                        valeur={formatMontant(contexte.periode.charges)}
                      />
                    </>
                  ) : (
                    <Text style={styles.aide}>
                      Aucun loyer n’est renseigné pour cette location.
                    </Text>
                  )}
                  <LigneDetail
                    libelle="Entrée dans les lieux"
                    valeur={contexte.bail.dateEntree}
                  />
                </>
              ) : (
                <Text style={styles.aide}>
                  Aucune location en cours pour ce logement.
                </Text>
              )}
              {contexte.titulaires.map((t) => (
                <LigneDetail key={t.id} libelle="Locataire" valeur={nomComplet(t)} />
              ))}
            </Carte>

            <Champ
              libelle="Date de l’inventaire"
              valeur={brouillon.dateInventaire ?? ''}
              onChangement={(v) => changer({ dateInventaire: v })}
              placeholder="AAAA-MM-JJ"
              aide="La date à laquelle vous comptez et constatez le mobilier."
              obligatoire
            />

            {type === 'sortie' ? (
              // Pour une sortie, la déclaration vient de l'inventaire d'entrée :
              // c'est elle qui a été signée. La rendre modifiable ici
              // permettrait au document de contredire celui qu'il compare.
              <LigneDetail
                libelle="Logement loué meublé"
                valeur={entreeMeuble === null ? 'Non déclaré' : entreeMeuble ? 'Oui' : 'Non'}
              />
            ) : (
              <Carte>
                <View style={styles.ligneBascule}>
                  <View style={styles.basculeTextes}>
                    <Text style={typographie.corpsAppuye}>Logement loué meublé</Text>
                    <Text style={styles.aide}>
                      Déclaré par vous, jamais supposé. Cette déclaration décide de la liste du
                      mobilier obligatoire imprimée dans le document.
                    </Text>
                  </View>
                  <Switch
                    value={brouillon.meuble === true}
                    onValueChange={(valeur) => changer({ meuble: valeur })}
                  />
                </View>
              </Carte>
            )}

            {type === 'sortie' && entreeDate ? (
              <LigneDetail
                libelle="Comparé à l’inventaire du"
                valeur={entreeDate}
              />
            ) : null}

            <Champ
              libelle="Mandataire (facultatif)"
              valeur={brouillon.mandataire ?? ''}
              onChangement={(v) => changer({ mandataire: v })}
              placeholder="Nom et qualité, si quelqu’un vous représente"
            />

            <Text style={styles.aide}>
              Ces informations viennent de la fiche du logement. Pour les corriger, revenez au
              logement : elles y sont modifiées pour toute l’application.
            </Text>
          </>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Étape 2 — les pièces                                             */}
        {/* ---------------------------------------------------------------- */}
        {etape === 'pieces' ? (
          <>
            <Text style={styles.intro}>
              La liste ci-dessous est proposée d’après le type de logement. Renommez, retirez ou
              ajoutez : c’est vous qui savez de quelles pièces il se compose.
            </Text>

            {pieces.map((p, index) => (
              <View key={p.id} style={styles.blocPiece}>
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
                  onPress={() => {
                    changer({ pieces: pieces.filter((x) => x.id !== p.id) });
                    setPieceActive(0);
                  }}
                />
              </View>
            ))}

            <Bouton
              libelle="Ajouter une pièce"
              variante="secondaire"
              onPress={() => {
                const suivantes = [...pieces, pieceInventaireVide('Nouvelle pièce', pieces.map((p) => p.id))];
                changer({ pieces: suivantes });
              }}
            />

            <Text style={styles.aide}>
              {synthese
                ? `${synthese.pieces} pièce(s), ${synthese.total} meuble(s) décrit(s).`
                : ''}
            </Text>
          </>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Étape 3 — le mobilier, pièce par pièce                           */}
        {/* ---------------------------------------------------------------- */}
        {etape === 'mobilier' && piece ? (
          <>
            <Segments
              defilable
              segments={pieces.map((p, index) => ({
                valeur: p.id,
                libelle: p.nom || `Pièce ${index + 1}`,
                compteur: p.meubles.filter((m) => m.quantite !== undefined && m.etat).length,
              }))}
              valeur={piece.id}
              onChanger={(id) => {
                const rang = pieces.findIndex((p) => p.id === id);
                if (rang >= 0) setPieceActive(rang);
              }}
            />

            <Carte>
              <Text style={styles.titreCarte}>Raccourcis pour « {piece.nom} »</Text>
              <Text style={styles.aide}>
                Ces gestes ne touchent jamais un meuble déjà renseigné : ils complètent les
                champs vides, et rien d’autre.
              </Text>
              <View style={styles.raccourcis}>
                <Bouton
                  libelle="Tout est en bon état"
                  variante="secondaire"
                  compact
                  onPress={() => changerPiece(toutEnBonEtat(piece, ETAT_COURANT))}
                />
                {type === 'sortie' && derive ? (
                  <Bouton
                    libelle="Reprendre les quantités de l’entrée"
                    variante="secondaire"
                    compact
                    onPress={() => changerPiece(reprendreLesQuantites(piece, derive.quantitesEntree))}
                  />
                ) : null}
                <Bouton
                  libelle="Vider le constat de cette pièce"
                  variante="discret"
                  compact
                  onPress={() => changerPiece(viderConstat(piece))}
                />
              </View>
            </Carte>

            {piece.meubles.map((m) => {
              const rappel = rappelDeLEntree(piece.id, m.id);
              return (
                <Carte key={m.id}>
                  <Champ
                    libelle="Meuble"
                    valeur={m.nom}
                    onChangement={(nom) => changerMeuble(m.id, { nom })}
                  />

                  <Champ
                    libelle="Nombre"
                    valeur={m.quantite === undefined ? '' : String(m.quantite)}
                    onChangement={(texte) => changerMeuble(m.id, { quantite: quantiteSaisie(texte) })}
                    placeholder="Non compté"
                    clavier="number-pad"
                    aide={
                      // Le rappel de l'entrée se **lit** : il ne remplit pas le
                      // champ, parce que recopier un nombre d'entrée serait un
                      // inventaire inventé.
                      rappel === undefined
                        ? 'Laissez vide si vous ne l’avez pas compté. Écrivez 0 s’il n’y en a plus.'
                        : `À l’entrée : ${rappel}. Laissez vide si vous ne l’avez pas compté, écrivez 0 s’il n’y en a plus.`
                    }
                  />

                  <Text style={styles.libelleEtat}>État constaté</Text>
                  <Segments
                    defilable
                    segments={ETATS_ELEMENT.map((e) => ({
                      valeur: e.valeur,
                      libelle: e.court,
                    }))}
                    valeur={m.etat ?? ''}
                    onChanger={(valeur) =>
                      changerMeuble(m.id, {
                        etat: valeur ? (valeur as EtatElement) : undefined,
                      })
                    }
                  />
                  {m.etat ? (
                    <Text style={styles.etatChoisi}>{libelleEtat(m.etat)}</Text>
                  ) : (
                    <Text style={styles.aide}>Aucun état constaté pour l’instant.</Text>
                  )}

                  <Champ
                    libelle="Observation (facultatif)"
                    valeur={m.commentaire ?? ''}
                    onChangement={(commentaire) => changerMeuble(m.id, { commentaire })}
                    placeholder="Ce qui mérite d’être noté"
                    multiligne
                  />

                  <Text style={styles.libelleEtat}>Photos</Text>
                  {m.photos.map((photo) => (
                    <View key={photo.id} style={styles.blocPhoto}>
                      <Image source={{ uri: photo.chemin }} style={styles.vignette} />
                      <View style={styles.photoTextes}>
                        <Champ
                          libelle="Légende"
                          valeur={photo.legende}
                          onChangement={(legende) => legenderPhoto(m.id, photo.id, legende)}
                          placeholder="Ce que la photo montre"
                        />
                        <Bouton
                          libelle="Retirer la photo"
                          variante="discret"
                          compact
                          onPress={() => retirerPhoto(m.id, photo.id)}
                        />
                      </View>
                    </View>
                  ))}

                  <View style={styles.raccourcis}>
                    <Bouton
                      libelle={photoEnCours === m.id ? 'Ouverture…' : 'Prendre une photo'}
                      variante="secondaire"
                      compact
                      onPress={() => void ajouterUnePhoto(m.id, 'camera')}
                    />
                    <Bouton
                      libelle="Choisir dans la galerie"
                      variante="discret"
                      compact
                      onPress={() => void ajouterUnePhoto(m.id, 'galerie')}
                    />
                  </View>
                </Carte>
              );
            })}

            <Carte>
              <Text style={styles.titreCarte}>Ajouter un meuble</Text>
              <Text style={styles.aide}>
                Le mobilier propre à cette pièce, s’il n’est pas dans la liste proposée.
              </Text>
              <Champ
                libelle="Nom du meuble"
                valeur={nouveauMeuble}
                onChangement={setNouveauMeuble}
                placeholder="Exemple : Fauteuil"
              />
              <Bouton
                libelle="Ajouter ce meuble"
                variante="secondaire"
                onPress={() => {
                  const nom = nouveauMeuble.trim();
                  if (!nom) return;
                  changerPiece(ajouterMeuble(piece, nom, identifiantsDeLEntree(piece.id)));
                  setNouveauMeuble('');
                }}
              />
              <Text style={styles.aide}>Propositions courantes :</Text>
              <View style={styles.raccourcis}>
                {MEUBLES_GENERIQUES.map((nom) => (
                  <Bouton
                    key={nom}
                    libelle={nom}
                    variante="discret"
                    compact
                    onPress={() =>
                      changerPiece(ajouterMeuble(piece, nom, identifiantsDeLEntree(piece.id)))
                    }
                  />
                ))}
              </View>
            </Carte>
          </>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Étape 4 — observations                                           */}
        {/* ---------------------------------------------------------------- */}
        {etape === 'observations' ? (
          <>
            <Text style={styles.intro}>
              Ce qui vaut pour le logement entier, et que le détail pièce par pièce ne dirait pas.
            </Text>

            <Champ
              libelle="Observations générales"
              valeur={brouillon.observations ?? ''}
              onChangement={(v) => changer({ observations: v })}
              placeholder="Ce que le lecteur doit savoir"
              multiligne
              nombreDeLignes={6}
            />

            {synthese ? (
              <Carte>
                <Text style={styles.titreCarte}>Où en est l’inventaire</Text>
                <LigneDetail libelle="Pièces décrites" valeur={String(synthese.pieces)} />
                <LigneDetail libelle="Meubles décrits" valeur={String(synthese.total)} />
                <LigneDetail libelle="États constatés" valeur={String(synthese.constates)} />
                <LigneDetail
                  libelle="Restant à renseigner"
                  valeur={String(synthese.aRenseigner)}
                  accentuee={synthese.aRenseigner > 0}
                />
                <LigneDetail libelle="Exemplaires comptés" valeur={String(synthese.exemplaires)} />
                <LigneDetail libelle="Photos" valeur={String(synthese.photos)} />
              </Carte>
            ) : null}

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

            {manques.length > 0 ? (
              <Carte>
                <Text style={styles.titreCarte}>Ce qui bloque encore</Text>
                {manques.map((m) => (
                  <Text key={m} style={styles.avertissement}>
                    • {m}
                  </Text>
                ))}
              </Carte>
            ) : null}
          </>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Étape 5 — signatures                                             */}
        {/* ---------------------------------------------------------------- */}
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
              // La clé force un pavé neuf à chaque changement de signataire.
              // Sans elle, le pavé garde dans son état local les traits du
              // précédent : ils sont redessinés tels quels sous le nom du
              // suivant, et la signature recueillie n'est plus celle qu'on croit.
              // Le bail porte la même clé depuis l'origine ; ni l'état des lieux
              // ni l'inventaire ne l'avaient.
              key={signataire}
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
              {signataires.map((s) => {
                const signe = (brouillon.signatures ?? []).some((x) => x.signataire === s.id);
                return (
                  <LigneDetail
                    key={s.id}
                    libelle={s.nom}
                    valeur={signe ? 'Signé' : 'En attente'}
                    accentuee={signe}
                  />
                );
              })}
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
          manquesCourants.length > 0 ? `${manquesCourants.length} point(s) à compléter` : undefined
        }
        secondaireLibelle={numero > 1 ? 'Précédent' : undefined}
        secondaireOnPress={numero > 1 ? reculer : undefined}
      />

      {etape === 'mobilier' && pieces.length > 1 ? (
        <View style={[styles.barrePiece, { paddingBottom: insets.bottom }]}>
          <Bouton
            libelle={
              pieceActive + 1 < pieces.length ? 'Pièce suivante' : 'Terminer le mobilier'
            }
            variante="principal"
            pleineLargeur
            onPress={pieceSuivante}
          />
        </View>
      ) : null}
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
    intro: {
      ...typographie.corps,
      color: couleurs.texteSecondaire,
    },
    aide: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
    },
    titreCarte: {
      ...typographie.corpsAppuye,
      color: couleurs.texte,
      marginBottom: espaces.sm,
    },
    ligneTexte: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
    },
    ligneBascule: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaces.md,
    },
    basculeTextes: {
      flex: 1,
      gap: 2,
    },
    blocPiece: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: espaces.sm,
    },
    champPiece: {
      flex: 1,
    },
    libelleEtat: {
      ...typographie.petitAppuye,
      color: couleurs.texteTertiaire,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: espaces.sm,
      marginBottom: espaces.xs,
    },
    etatChoisi: {
      ...typographie.petit,
      color: couleurs.accentFonce,
      marginTop: espaces.xs,
    },
    raccourcis: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: espaces.sm,
      marginTop: espaces.sm,
    },
    blocPhoto: {
      flexDirection: 'row',
      gap: espaces.md,
      marginTop: espaces.sm,
    },
    vignette: {
      width: 96,
      height: 96,
      borderRadius: rayons.md,
      backgroundColor: couleurs.fondSurvol,
    },
    photoTextes: {
      flex: 1,
      gap: espaces.xs,
    },
    avertissement: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      marginBottom: espaces.xs,
    },
    barrePiece: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: espaces.lg,
      paddingTop: espaces.sm,
      backgroundColor: couleurs.fond,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: couleurs.bordure,
    },
  });

/**
 * Vérifier l'inventaire du mobilier avant de l'établir.
 *
 * Cet écran est la **relecture** : il montre, dans l'ordre des sections du
 * document, tout ce qui sera imprimé — pièce par pièce, meuble par meuble, avec
 * la quantité comptée, l'état constaté, les observations, les photos et les
 * signatures. Le bailleur relit donc son inventaire avant qu'il n'existe.
 *
 * Trois choses y sont volontairement visibles, parce qu'elles seules justifient
 * une relecture :
 *
 *  1. **Les meubles non renseignés.** Ils sont comptés à part et nommés. Le
 *     document ne peut pas être établi tant qu'il en reste : un meuble décrit
 *     sans dire dans quel état il est serait un constat inventé.
 *  2. **Le mobilier obligatoire d'un logement meublé.** Les onze éléments que la
 *     loi énumère, et ce que l'inventaire en dit. Un élément manquant
 *     n'empêche pas d'établir le document — le logement n'est peut-être pas loué
 *     meublé, ou le meuble est peut-être rangé ailleurs — mais il sera signalé
 *     dedans : l'écran le dit avant, pas après.
 *  3. **Les réserves.** Ce sont les avertissements du domaine. Ils n'empêchent
 *     pas d'établir le document, mais ils seront imprimés dedans.
 *
 * Il n'y a pas d'aperçu HTML intégré, et c'est le même choix que pour le bail et
 * l'état des lieux : afficher des pages A4 dans un écran de téléphone suppose
 * d'embarquer un moteur de rendu web, pour montrer le document mal. Après
 * établissement, le PDF s'ouvre dans la visionneuse du système, à sa taille, avec
 * sa pagination réelle et ses photos.
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
import { aujourdHui } from '@/domain/period';
import { nomComplet } from '@/domain/types';
import {
  ELEMENTS_MEUBLE_OBLIGATOIRES,
  LIBELLE_TYPE_INVENTAIRE,
  avertissementsDeLInventaire,
  comparerInventaire,
  manquesDeLInventaire,
  piecesInitialesInventaire,
  presenceDesElementsObligatoires,
  reprendreBrouillonInventaire,
  sectionsInventaire,
  signatairesAttendusDeLInventaire,
  syntheseInventaire,
} from '@/domain/inventaire';
import type { BrouillonInventaire, PieceInventaire, TypeInventaire } from '@/domain/inventaire';
import { libelleEtat } from '@/domain/etats';
import { analyserDonnees, brouillonDeLInventaire } from '@/domain/brouillon';
import { chargerContexteBail, type ContexteBail } from '@/documents/bail-contexte';
import { lireBrouillon } from '@/db/repositories/brouillons';
import { trouverPiece } from '@/db/repositories/pieces';
import { emettreInventaire } from '@/pdf/emettre-inventaire';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, type Couleurs } from '@/ui/theme';

export default function EcranVerifierInventaire() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { rafraichir } = useApplication();

  const params = useLocalSearchParams<{ logementId?: string; type?: string }>();
  const logementId = typeof params.logementId === 'string' ? params.logementId : null;
  // La nature du document est donnée par l'écran précédent : c'est elle qui
  // décide du brouillon relu, des sections montrées et des signatures.
  const type: TypeInventaire = params.type === 'sortie' ? 'sortie' : 'entree';
  const typeBrouillon = brouillonDeLInventaire(type);

  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [contexte, setContexte] = useState<ContexteBail | null>(null);
  const [brouillon, setBrouillon] = useState<BrouillonInventaire | null>(null);
  /**
   * Les pièces de l'inventaire d'entrée, pour une sortie.
   *
   * Elles servent à montrer la comparaison **avant** l'établissement, comme le
   * reste de l'écran montre ce qui sera imprimé. La comparaison elle-même est
   * recalculée à l'émission, par le domaine : cet écran ne fait que la donner à
   * lire.
   */
  const [entreePieces, setEntreePieces] = useState<PieceInventaire[] | null>(null);
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
        const enregistre = await lireBrouillon(charge.logement.id, typeBrouillon);
        if (!actif) return;
        setContexte(charge);

        // On relit par le lecteur tolérant, celui du formulaire : l'écran montre
        // ainsi ce qui sera **réellement** imprimé, et non le contenu brut de la
        // base, qui peut porter des valeurs d'une version antérieure.
        const repris = enregistre
          ? reprendreBrouillonInventaire(analyserDonnees(JSON.stringify(enregistre.donnees)), {
              logementId: charge.logement.id,
              bailId: charge.bail?.id ?? '',
              type,
              dateInventaire: aujourdHui(),
              pieces: piecesInitialesInventaire(charge.logement.type),
              observations: '',
              mandataire: '',
              signatures: [],
            })
          : null;
        setBrouillon(repris);

        // La comparaison montrée ici est **celle qui sera imprimée** : elle est
        // calculée à partir de l'inventaire d'entrée réellement désigné par le
        // brouillon, et non d'une pièce choisie par cet écran. Une comparaison
        // d'aperçu qui ne serait pas celle du document serait pire que pas
        // d'aperçu du tout.
        let piecesEntree: PieceInventaire[] | null = null;
        if (repris?.type === 'sortie' && repris.inventaireEntreeId) {
          const entree = await trouverPiece(repris.inventaireEntreeId);
          if (entree) {
            const lue = reprendreBrouillonInventaire(analyserDonnees(entree.donnees), {
              logementId: charge.logement.id,
              bailId: charge.bail?.id ?? '',
              type: 'entree',
              pieces: [],
            });
            piecesEntree = lue.pieces ?? null;
          }
        }
        if (actif) setEntreePieces(piecesEntree);

        if (!enregistre) {
          setErreur(
            "Aucune saisie d'inventaire n'est enregistrée pour ce logement. " +
              'Reprenez le formulaire.',
          );
        }
      } catch (e) {
        if (actif) {
          setErreur(e instanceof Error ? e.message : "L'inventaire ne peut pas être relu.");
        }
      } finally {
        if (actif) setChargement(false);
      }
    })();

    return () => {
      actif = false;
    };
  }, [logementId, type, typeBrouillon]);

  // Les signataires attendus viennent du domaine : c'est la même liste que celle
  // qui sera imprimée, donc les manques calculés ici sont ceux qui bloqueraient
  // l'émission.
  const attendus = useMemo(
    () =>
      contexte
        ? signatairesAttendusDeLInventaire({
            nomBailleur: contexte.proprietaire.nom,
            titulaires: contexte.titulaires,
            mandataire: brouillon?.mandataire,
          })
        : [],
    [brouillon?.mandataire, contexte],
  );

  const manques = useMemo(
    () => (brouillon ? manquesDeLInventaire(brouillon, attendus) : []),
    [attendus, brouillon],
  );
  const avertissements = useMemo(
    () => (brouillon ? avertissementsDeLInventaire(brouillon) : []),
    [brouillon],
  );

  // La comparaison est calculée par le domaine, la même fonction que celle
  // appelée à l'émission : ce que l'écran montre est exactement ce que le
  // document imprimera.
  const comparaison = useMemo(
    () =>
      brouillon?.type === 'sortie' && entreePieces
        ? comparerInventaire(entreePieces, brouillon.pieces ?? [])
        : null,
    [brouillon, entreePieces],
  );
  const synthese = useMemo(
    () => (brouillon ? syntheseInventaire(brouillon) : null),
    [brouillon],
  );
  const sections = useMemo(
    () => (brouillon ? sectionsInventaire(brouillon.type) : []),
    [brouillon],
  );
  const obligatoires = useMemo(
    () => (brouillon ? presenceDesElementsObligatoires(brouillon.pieces ?? []) : []),
    [brouillon],
  );

  /** Les meubles qui n'ont pas encore été comptés ou constatés. */
  const aRenseigner = useMemo(() => {
    const liste: { piece: string; meuble: string; quoi: string }[] = [];
    for (const piece of brouillon?.pieces ?? []) {
      for (const meuble of piece.meubles) {
        const manque: string[] = [];
        if (meuble.quantite === undefined) manque.push('non compté');
        if (!meuble.etat) manque.push('sans état');
        if (manque.length > 0) {
          liste.push({
            piece: piece.nom || 'pièce sans nom',
            meuble: meuble.nom || 'meuble sans nom',
            quoi: manque.join(', '),
          });
        }
      }
    }
    return liste;
  }, [brouillon]);

  const generer = useCallback(async () => {
    if (!brouillon || travail || manques.length > 0) return;
    setTravail(true);
    setErreur(null);
    try {
      const { piece } = await emettreInventaire({ brouillon, etabliLe: aujourdHui() });
      rafraichir();
      // Le formulaire est remplacé par le succès : revenir en arrière sur un
      // brouillon qui n'existe plus n'aurait aucun sens.
      router.replace({
        pathname: '/inventaire/succes',
        params: { pieceId: piece.id, logementId: brouillon.logementId },
      });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'inventaire n'a pas pu être établi.");
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
            titre={`Vérifier : ${LIBELLE_TYPE_INVENTAIRE[type]}`}
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
            titre={`Vérifier : ${LIBELLE_TYPE_INVENTAIRE[type]}`}
            actionLibelle="Fermer"
            actionOnPress={() => router.back()}
          />
          <BandeauMessage ton="erreur" message={erreur ?? "L'inventaire ne peut pas être relu."} />
          <EcranVide
            titre="Rien à relire"
            message="Reprenez le formulaire pour composer cet inventaire."
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
          { paddingTop: insets.top + espaces.sm, paddingBottom: insets.bottom + 140 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <EnTeteEcran
          titre={`Vérifier : ${LIBELLE_TYPE_INVENTAIRE[type]}`}
          sousTitre={`${sections.length} sections seront imprimées`}
          actionLibelle="Fermer"
          actionOnPress={() => router.back()}
        />

        {erreur ? (
          <BandeauMessage ton="erreur" message={erreur} onFermer={() => setErreur(null)} />
        ) : null}

        {/* Ce qui bloque l'établissement, nommé et compté. */}
        {manques.length > 0 ? (
          <Carte>
            <Text style={styles.titreCarte}>
              {manques.length} point{manques.length > 1 ? 's' : ''} à compléter
            </Text>
            {manques.map((m) => (
              <Text key={m} style={styles.ligneTexte}>
                • {m}
              </Text>
            ))}
            <Text style={styles.aide}>
              Le document ne peut pas être établi tant qu’il reste un meuble décrit sans dire dans
              quel état il est : ce serait un constat inventé.
            </Text>
          </Carte>
        ) : null}

        {/* Les meubles à renseigner, nommés un par un. */}
        {aRenseigner.length > 0 ? (
          <Carte>
            <Text style={styles.titreCarte}>Meubles à renseigner</Text>
            {aRenseigner.slice(0, 20).map((l, index) => (
              <Text key={`${l.piece}/${l.meuble}/${index}`} style={styles.ligneTexte}>
                • {l.meuble} ({l.piece}) — {l.quoi}
              </Text>
            ))}
            {aRenseigner.length > 20 ? (
              <Text style={styles.aide}>
                … et {aRenseigner.length - 20} autre
                {aRenseigner.length - 20 > 1 ? 's' : ''}.
              </Text>
            ) : null}
          </Carte>
        ) : null}

        {/* Les réserves : imprimées, mais sans bloquer. */}
        {avertissements.length > 0 ? (
          <Carte>
            <Text style={styles.titreCarte}>Ce que le document signalera</Text>
            {avertissements.map((a) => (
              <Text key={a} style={styles.ligneTexte}>
                • {a}
              </Text>
            ))}
            <Text style={styles.aide}>
              Ces réserves n’empêchent pas d’établir le document : elles y seront imprimées, pour
              que le lecteur sache ce que le constat ne dit pas.
            </Text>
          </Carte>
        ) : null}

        {/* Le logement et les parties. */}
        <Carte>
          <Text style={styles.titreCarte}>Le logement</Text>
          <LigneDetail libelle="Logement" valeur={contexte.logement.nom} />
          <LigneDetail
            libelle="Logement loué meublé"
            valeur={brouillon.meuble === true ? 'Oui' : 'Non'}
          />
          <LigneDetail
            libelle="Date de l’inventaire"
            valeur={brouillon.dateInventaire ?? '—'}
          />
          {brouillon.mandataire?.trim() ? (
            <LigneDetail libelle="Mandataire" valeur={brouillon.mandataire} />
          ) : null}
          {contexte.titulaires.map((t) => (
            <LigneDetail key={t.id} libelle="Locataire" valeur={nomComplet(t)} />
          ))}
          {brouillon.dateEntree ? (
            <LigneDetail libelle="Comparé à l’inventaire du" valeur={brouillon.dateEntree} />
          ) : null}
        </Carte>

        {/* Le mobilier obligatoire, quand le logement est déclaré meublé. */}
        {brouillon.meuble === true ? (
          <Carte>
            <Text style={styles.titreCarte}>Le mobilier obligatoire</Text>
            <Text style={styles.aide}>
              Les {ELEMENTS_MEUBLE_OBLIGATOIRES.length} éléments que la loi énumère pour un
              logement meublé, et ce que cet inventaire en dit.
            </Text>
            {obligatoires.map((e) => (
              <LigneDetail
                key={e.rang}
                libelle={`${e.rang}. ${e.libelle}`}
                valeur={
                  e.present
                    ? `${e.quantite} · ${e.pieces.join(', ')}`
                    : 'non trouvé dans l’inventaire'
                }
                accentuee={!e.present}
              />
            ))}
            <Text style={styles.aide}>
              Un élément « non trouvé » sera signalé dans le document. Il ne bloque pas : le meuble
              peut être rangé ailleurs, ou porter un autre nom.
            </Text>
          </Carte>
        ) : null}

        {/* Le mobilier, pièce par pièce. */}
        {(brouillon.pieces ?? []).map((piece) => (
          <Carte key={piece.id}>
            <Text style={styles.titreCarte}>{piece.nom || 'Pièce sans nom'}</Text>
            {piece.meubles.length === 0 ? (
              <Text style={styles.aide}>Aucun meuble décrit dans cette pièce.</Text>
            ) : (
              piece.meubles.map((m) => {
                const details: string[] = [];
                details.push(
                  m.quantite === undefined ? 'quantité non comptée' : `${m.quantite} exemplaire(s)`,
                );
                details.push(m.etat ? libelleEtat(m.etat) : 'état non renseigné');
                if (m.photos.length > 0) {
                  details.push(
                    `${m.photos.length} photo${m.photos.length > 1 ? 's' : ''}`,
                  );
                }
                return (
                  <LigneDetail
                    key={m.id}
                    libelle={m.nom || 'Meuble sans nom'}
                    valeur={details.join(' · ')}
                    accentuee={m.quantite === undefined || !m.etat}
                  />
                );
              })
            )}
          </Carte>
        ))}

        {/* La comparaison, pour une sortie. */}
        {comparaison ? (
          <Carte>
            <Text style={styles.titreCarte}>Ce que la comparaison retient</Text>
            <LigneDetail
              libelle="États constatés qui diffèrent"
              valeur={String(comparaison.evolutionsEtat)}
              accentuee={comparaison.evolutionsEtat > 0}
            />
            <LigneDetail
              libelle="Quantités qui diffèrent"
              valeur={String(comparaison.ecarts)}
              accentuee={comparaison.ecarts > 0}
            />
            <LigneDetail libelle="Meubles ajoutés" valeur={String(comparaison.nouveaux)} />
            <LigneDetail libelle="Meubles disparus" valeur={String(comparaison.disparus)} />
            <LigneDetail
              libelle="Meubles incomparables"
              valeur={String(comparaison.incomparables)}
            />
            <LigneDetail libelle="Meubles illustrés" valeur={String(comparaison.illustres)} />
            <Text style={styles.aide}>
              Le document met les deux constats côte à côte et s’arrête là. Il ne dit à personne
              que l’écart est de sa faute : l’appréciation d’une responsabilité ne lui appartient
              pas.
            </Text>
          </Carte>
        ) : brouillon.type === 'sortie' ? (
          <Carte>
            <Text style={styles.titreCarte}>Comparaison</Text>
            <Text style={styles.aide}>
              L’inventaire d’entrée n’a pas pu être relu : le document le dira, et renverra à lui.
              Inventer un tableau comparatif que rien n’a rempli serait pire.
            </Text>
          </Carte>
        ) : null}

        {/* La synthèse. */}
        {synthese ? (
          <Carte>
            <Text style={styles.titreCarte}>Ce que le document comptera</Text>
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
            {synthese.parEtat.map((e) => (
              <LigneDetail key={e.etat} libelle={e.libelle} valeur={String(e.nombre)} />
            ))}
          </Carte>
        ) : null}

        {/* Les signatures. */}
        <Carte>
          <Text style={styles.titreCarte}>Signatures</Text>
          {attendus.map((a) => {
            const signe = (brouillon.signatures ?? []).some((s) => s.signataire === a.id);
            return (
              <LigneDetail
                key={a.id}
                libelle={a.nom}
                valeur={signe ? 'Signé' : 'En attente'}
                accentuee={signe}
              />
            );
          })}
          <Text style={styles.aide}>
            Les signatures recueillies sont matérialisées comme un exemplaire signé à la main.
            Elles ne constituent pas une signature électronique qualifiée : l’application ne
            délivre ni certificat, ni horodatage. Le document le dira.
          </Text>
        </Carte>

        {/* Les sections, dans l'ordre d'impression. */}
        <Carte>
          <Text style={styles.titreCarte}>Les sections du document</Text>
          {sections.map((s, index) => (
            <Text key={s.valeur} style={styles.ligneTexte}>
              {index + 1}. {s.titre}
            </Text>
          ))}
        </Carte>
      </ScrollView>

      <BarreActionFixe
        libelle={travail ? 'Établissement…' : 'Établir le PDF'}
        onPress={() => void generer()}
        aide={
          manques.length > 0
            ? `${manques.length} point(s) à compléter avant de pouvoir établir`
            : 'Le PDF sera rangé dans le dossier du logement.'
        }
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
    titreCarte: {
      ...typographie.corpsAppuye,
      color: couleurs.texte,
      marginBottom: espaces.sm,
    },
    ligneTexte: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      marginBottom: espaces.xs,
    },
    aide: {
      ...typographie.petit,
      color: couleurs.texteTertiaire,
      marginTop: espaces.sm,
    },
  });

/**
 * Faire un état des lieux : choisir le logement, et la nature du document.
 *
 * Depuis l'onglet DOCUMENTS, on ne part pas d'un logement mais d'un besoin —
 * « je veux faire un état des lieux ». Il faut donc d'abord désigner les lieux,
 * et cet écran le fait en une liste.
 *
 * Il ne montre que les logements **qui peuvent recevoir l'état des lieux
 * demandé**. Pour une entrée : ceux dont la location est en cours, donc avec un
 * locataire nommé — un état des lieux constate l'état d'un logement **pour
 * quelqu'un**, et sans locataire il ne constate rien pour personne. Pour une
 * sortie, il faut en plus qu'un état des lieux d'entrée existe : c'est à lui
 * que la sortie se compare, et le domaine refuse d'établir une sortie qui ne
 * nomme pas son entrée. Les logements écartés ne disparaissent pas en silence :
 * ils sont listés à part, avec la raison et le geste qui débloque, parce qu'une
 * liste filtrée ferait croire que le logement a disparu.
 *
 * Cet écran ne fabrique rien : il désigne. Le formulaire guidé en six étapes
 * prend le relais, et il reprend du logement tout ce qui est déjà enregistré —
 * adresse, propriétaire, locataire, loyer — et, pour une sortie, les pièces,
 * les compteurs et les clés de l'entrée.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { BandeauMessage, Carte, EcranVide, EnTeteEcran, Segments } from '@/ui/components';
import { espaces, rayons, typographie } from '@/ui/tokens';
import { adresseEnLignes, nomComplet } from '@/domain/types';
import type { Bail, Logement, PieceDossier, TitulaireBail } from '@/domain/types';
import { LIBELLE_TYPE_EDL } from '@/domain/etat-des-lieux';
import type { TypeEdl } from '@/domain/etat-des-lieux';
import { brouillonDeLEdl } from '@/domain/brouillon';
import { formaterDateFr } from '@/domain/period';
import { lireBrouillon } from '@/db/repositories/brouillons';
import { piecesDuLogement } from '@/db/repositories/pieces';
import {
  bailEnCours,
  listerLogements,
  titulairesDuBail,
} from '@/db/repositories/properties';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, type Couleurs } from '@/ui/theme';

interface Ligne {
  logement: Logement;
  bail: Bail | null;
  titulaires: TitulaireBail[];
  /** Le plus récent état des lieux d'entrée, pour une sortie. */
  entree: PieceDossier | null;
  /** Vrai quand un brouillon attend d'être repris, pour la nature demandée. */
  enCours: boolean;
}

/** Pourquoi ce logement ne peut pas recevoir l'état des lieux demandé. */
function raisonDuRefus(l: Ligne, type: TypeEdl): string | null {
  if (!l.bail || l.titulaires.length === 0) {
    return 'Aucun locataire en place';
  }
  if (type === 'sortie' && !l.entree) {
    return "Aucun état des lieux d'entrée";
  }
  return null;
}

export default function EcranChoisirLogementEtatDesLieux() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { cleRafraichissement } = useApplication();

  const params = useLocalSearchParams<{ type?: string }>();
  const typeInitial: TypeEdl = params.type === 'sortie' ? 'sortie' : 'entree';
  const [type, setType] = useState<TypeEdl>(typeInitial);

  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const logements = await listerLogements();
      const lues = await Promise.all(
        logements.map(async (logement) => {
          const bail = await bailEnCours(logement.id);
          const [titulaires, pieces, brouillonEntree, brouillonSortie] = await Promise.all([
            bail ? titulairesDuBail(bail.id) : Promise.resolve([]),
            piecesDuLogement(logement.id),
            lireBrouillon(logement.id, brouillonDeLEdl('entree')),
            lireBrouillon(logement.id, brouillonDeLEdl('sortie')),
          ]);
          // Les pièces sont rendues du plus récent au plus ancien : la première
          // entrée est bien la dernière en date, et c'est celle à laquelle une
          // sortie doit se comparer.
          const entree = pieces.find((p) => p.type === 'edl_entree') ?? null;
          return {
            logement,
            bail,
            titulaires,
            entree,
            enCours: brouillonEntree !== null || brouillonSortie !== null,
          };
        }),
      );
      setLignes(lues);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Les logements n’ont pas pu être lus.');
    } finally {
      setChargement(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger, cleRafraichissement]),
  );

  const prets = useMemo(() => lignes.filter((l) => raisonDuRefus(l, type) === null), [lignes, type]);
  const incomplets = useMemo(
    () =>
      lignes
        .map((l) => ({ ligne: l, raison: raisonDuRefus(l, type) }))
        .filter((x): x is { ligne: Ligne; raison: string } => x.raison !== null),
    [lignes, type],
  );

  /** Le geste qui débloque un logement écarté. */
  function debloquer(l: Ligne) {
    if (!l.bail || l.titulaires.length === 0) {
      router.push({
        pathname: '/logement/[id]/locataires',
        params: { id: l.logement.id },
      });
      return;
    }
    // Il manque l'état des lieux d'entrée : c'est lui qu'on va faire.
    router.push({
      pathname: '/etat-des-lieux/nouveau',
      params: { logementId: l.logement.id, type: 'entree' },
    });
  }

  return (
    <View style={styles.plein}>
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          { paddingTop: insets.top + espaces.sm, paddingBottom: espaces.xxl + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <EnTeteEcran
          titre={LIBELLE_TYPE_EDL[type]}
          sousTitre="Choisissez le logement"
          actionLibelle="Fermer"
          actionOnPress={() => router.back()}
        />

        <Segments
          segments={[
            { valeur: 'entree', libelle: "Entrée" },
            { valeur: 'sortie', libelle: 'Sortie' },
          ]}
          valeur={type}
          onChanger={(valeur) => setType(valeur === 'sortie' ? 'sortie' : 'entree')}
        />

        {erreur ? (
          <BandeauMessage ton="erreur" message={erreur} onFermer={() => setErreur(null)} />
        ) : null}

        {chargement ? (
          <Text style={styles.chargement}>Lecture des logements…</Text>
        ) : lignes.length === 0 ? (
          <EcranVide
            titre="Aucun logement"
            message="Un état des lieux se rattache à un logement. Ajoutez d’abord un logement et son locataire."
            illustration="maison"
            actionLibelle="Ajouter un logement"
            actionOnPress={() => router.push('/logement/nouveau')}
          />
        ) : (
          <>
            {prets.length > 0 ? (
              <Carte>
                <Text style={styles.section}>
                  {prets.length} logement{prets.length > 1 ? 's' : ''} prêt
                  {prets.length > 1 ? 's' : ''}
                </Text>
                <Text style={styles.aide}>
                  {type === 'entree'
                    ? 'L’état des lieux reprendra l’adresse, le propriétaire, les locataires et le ' +
                      'loyer sans que vous ayez à les ressaisir. Les pièces et leurs éléments sont ' +
                      'proposés par défaut, et vous pourrez les modifier.'
                    : 'L’état des lieux de sortie reprendra les pièces, les compteurs et les clés de ' +
                      'l’état des lieux d’entrée, et mettra les deux constats en regard — photos ' +
                      'avant et après comprises. Les états relevés à l’entrée ne sont pas recopiés : ' +
                      'chaque élément est constaté à nouveau.'}
                </Text>

                {prets.map((l) => (
                  <Pressable
                    key={l.logement.id}
                    onPress={() =>
                      router.push({
                        pathname: '/etat-des-lieux/nouveau',
                        params: { logementId: l.logement.id, type },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Faire l’${LIBELLE_TYPE_EDL[
                      type
                    ].toLowerCase()} du logement ${l.logement.nom}`}
                    accessibilityHint="Ouvre le formulaire guidé en six étapes."
                    style={({ pressed }) => [styles.ligne, pressed && styles.ligneAppuyee]}
                  >
                    <View style={styles.textes}>
                      <Text style={[typographie.corpsAppuye, styles.titre]}>
                        {l.logement.nom}
                      </Text>
                      <Text style={[typographie.petit, styles.detail]}>
                        {l.titulaires.map(nomComplet).join(', ')}
                      </Text>
                      <Text style={[typographie.petit, styles.detail]}>
                        {adresseEnLignes(l.logement).slice(-1)[0]}
                      </Text>
                      {type === 'sortie' && l.entree ? (
                        <Text style={[typographie.petit, styles.detail]}>
                          Comparé à l’entrée du {formaterDateFr(l.entree.dateDocument)}
                        </Text>
                      ) : null}
                    </View>
                    {l.enCours ? <Text style={styles.reprise}>Brouillon en cours</Text> : null}
                  </Pressable>
                ))}
              </Carte>
            ) : null}

            {incomplets.length > 0 ? (
              <Carte>
                <Text style={styles.section}>Logements indisponibles</Text>
                <Text style={styles.aide}>
                  {type === 'entree'
                    ? 'Un état des lieux constate l’état du logement pour les personnes qui ' +
                      'l’occupent. Ces logements n’ont pas de location en cours : enregistrez le ' +
                      'locataire, puis l’état des lieux reprendra son identité.'
                    : 'Un état des lieux de sortie se compare à celui d’entrée. Ces logements n’en ' +
                      'ont pas : faites d’abord l’état des lieux d’entrée, et la sortie s’y ' +
                      'comparera élément par élément.'}
                </Text>
                {incomplets.map(({ ligne, raison }) => (
                  <Pressable
                    key={ligne.logement.id}
                    onPress={() => debloquer(ligne)}
                    accessibilityRole="button"
                    accessibilityLabel={`${raison} pour le logement ${ligne.logement.nom}`}
                    style={({ pressed }) => [styles.ligne, pressed && styles.ligneAppuyee]}
                  >
                    <View style={styles.textes}>
                      <Text style={[typographie.corpsAppuye, styles.titre]}>
                        {ligne.logement.nom}
                      </Text>
                      <Text style={[typographie.petit, styles.detail]}>{raison}</Text>
                      <Text style={[typographie.petit, styles.geste]}>
                        {ligne.bail && ligne.titulaires.length > 0
                          ? "Faire l’état des lieux d’entrée"
                          : 'Ajouter un locataire'}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </Carte>
            ) : null}
          </>
        )}
      </ScrollView>
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
      paddingVertical: espaces.md,
      borderRadius: rayons.md,
    },
    ligneAppuyee: {
      backgroundColor: couleurs.fondSurvol,
    },
    textes: {
      flex: 1,
      gap: 2,
    },
    titre: {
      color: couleurs.texte,
    },
    detail: {
      color: couleurs.texteSecondaire,
    },
    geste: {
      color: couleurs.accentFonce,
    },
    reprise: {
      ...typographie.minuscule,
      color: couleurs.accentFonce,
      textTransform: 'uppercase',
    },
  });

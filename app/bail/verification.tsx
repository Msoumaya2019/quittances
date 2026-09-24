/**
 * Vérifier le bail avant de le générer.
 *
 * Cet écran est l'**aperçu** : il montre, section par section et dans l'ordre du
 * document, tout ce qui sera imprimé. Le bailleur relit donc son bail avant
 * qu'il n'existe, et non après.
 *
 * Il n'y a pas d'aperçu HTML intégré, et c'est un choix : afficher le document
 * supposerait d'embarquer un moteur de rendu web dans l'application, pour
 * montrer deux pages A4 dans un écran de téléphone — c'est-à-dire mal. Après
 * génération, le PDF s'ouvre dans la visionneuse du système, à sa taille, avec
 * la pagination réelle.
 *
 * Ce que cet écran ne fait pas, et qui compte : il ne **signale** pas seulement,
 * il **bloque** quand le domaine bloque. Un bail sans locataire nommé, sans
 * durée, ou avec un dépôt hors plafond ne se génère pas. Les annexes
 * manquantes, elles, avertissent sans empêcher : elles peuvent se joindre plus
 * tard, et un bail qu'on ne peut pas produire est pire qu'un bail dont une
 * annexe manque encore.
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
import { espaces, typographie } from '@/ui/tokens';
import { aujourdHui, formaterDateFr } from '@/domain/period';
import { adresseEnLignes, nomComplet } from '@/domain/types';
import {
  LIBELLE_ANNEXE,
  LIBELLE_BAIL,
  REGLES_BAIL,
  SOURCES_BAIL,
  avertissementsDuBail,
  manquesDuBail,
  reprendreBrouillon,
} from '@/domain/bail';
import type { BrouillonBail } from '@/domain/bail';

import { finDuBail } from '@/pdf/bail';
import { formatMontant } from '@/domain/money';
import { chargerContexteBail, type ContexteBail } from '@/documents/bail-contexte';
import { lireBrouillon } from '@/db/repositories/brouillons';
import { emettreBail } from '@/pdf/emettre-bail';
import { useApplication } from '@/state/ApplicationContext';
import { useStyles, type Couleurs } from '@/ui/theme';

export default function EcranVerifierBail() {
  const styles = useStyles(creerStyles);
  const insets = useSafeAreaInsets();
  const { rafraichir } = useApplication();

  const params = useLocalSearchParams<{ logementId?: string }>();
  const logementId = typeof params.logementId === 'string' ? params.logementId : null;

  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [contexte, setContexte] = useState<ContexteBail | null>(null);
  const [brouillon, setBrouillon] = useState<BrouillonBail | null>(null);
  const [travail, setTravail] = useState(false);

  useEffect(() => {
    let actif = true;

    void (async () => {
      if (!logementId) {
        setErreur("Aucun logement n'a été indiqué.");
        setChargement(false);
        return;
      }
      try {
        const charge = await chargerContexteBail(logementId);
        const enregistre = await lireBrouillon(logementId, 'bail');
        if (!actif) return;
        setContexte(charge);
        // On relit par le lecteur tolérant, celui du formulaire : l'écran montre
        // ainsi ce qui sera **réellement** imprimé, et non le contenu brut de la
        // base, qui peut porter des valeurs d'une version antérieure.
        setBrouillon(
          enregistre
            ? reprendreBrouillon(enregistre.donnees, {
                logementId: charge.logement.id,
                bailId: charge.bail?.id ?? '',
                dateDebut: charge.bail?.dateEntree ?? aujourdHui(),
                loyer: charge.periode?.loyer,
                charges: charge.periode?.charges,
                depotGarantie: charge.bail?.depotGarantie ?? undefined,
                jourEcheance: charge.bail?.jourEcheance ?? 5,
                bailleurPersonneMorale: !!charge.proprietaire.siret,
              })
            : null,
        );
        if (!enregistre) {
          setErreur(
            "Aucune saisie de bail n'est enregistrée pour ce logement. Reprenez le formulaire.",
          );
        }
      } catch (e) {
        if (actif) {
          setErreur(e instanceof Error ? e.message : 'Le bail ne peut pas être relu.');
        }
      } finally {
        if (actif) setChargement(false);
      }
    })();

    return () => {
      actif = false;
    };
  }, [logementId]);

  const manques = useMemo(() => (brouillon ? manquesDuBail(brouillon) : []), [brouillon]);
  const avertissements = useMemo(
    () => (brouillon ? avertissementsDuBail(brouillon) : []),
    [brouillon],
  );

  const generer = useCallback(async () => {
    if (!brouillon || travail || manques.length > 0) return;
    setTravail(true);
    setErreur(null);
    try {
      const { piece } = await emettreBail({ brouillon, etabliLe: aujourdHui() });
      rafraichir();
      // Le formulaire est remplacé par le succès : revenir en arrière sur un
      // brouillon qui n'existe plus n'aurait aucun sens.
      router.replace({
        pathname: '/bail/succes',
        params: { pieceId: piece.id, logementId: brouillon.logementId },
      });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le bail n'a pas pu être généré.");
    } finally {
      setTravail(false);
    }
  }, [brouillon, manques.length, rafraichir, travail]);

  if (chargement) {
    return (
      <View style={styles.plein}>
        <ScrollView contentContainerStyle={[styles.contenu, { paddingTop: insets.top + espaces.sm }]}>
          <EnTeteEcran titre="Vérifier le bail" actionLibelle="Fermer" actionOnPress={() => router.back()} />
          <Text style={styles.chargement}>Relance de la saisie…</Text>
        </ScrollView>
      </View>
    );
  }

  if (!brouillon || !contexte) {
    return (
      <View style={styles.plein}>
        <ScrollView contentContainerStyle={[styles.contenu, { paddingTop: insets.top + espaces.sm }]}>
          <EnTeteEcran titre="Vérifier le bail" actionLibelle="Fermer" actionOnPress={() => router.back()} />
          <EcranVide
            titre="Rien à vérifier"
            message={erreur ?? 'La saisie du bail est introuvable.'}
            illustration="document"
            actionLibelle="Reprendre le formulaire"
            actionOnPress={() =>
              router.replace({ pathname: '/bail/nouveau', params: { logementId: logementId ?? '' } })
            }
          />
        </ScrollView>
      </View>
    );
  }

  const { logement, proprietaire, bail, titulaires, periode } = contexte;
  const regle = brouillon.categorie ? REGLES_BAIL[brouillon.categorie] : null;
  const signatures = brouillon.signatures ?? [];
  const nonSignes = 1 + titulaires.length - signatures.length;

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
          titre="Vérifier le bail"
          sousTitre="Ce qui sera imprimé, dans l’ordre"
          actionLibelle="Modifier"
          actionOnPress={() =>
            router.replace({ pathname: '/bail/nouveau', params: { logementId: logement.id } })
          }
        />

        {erreur ? <BandeauMessage ton="erreur" message={erreur} onFermer={() => setErreur(null)} /> : null}

        {manques.length > 0 ? (
          <BandeauMessage
            ton="erreur"
            message={`Le bail ne peut pas être généré en l'état :\n${manques.join('\n')}`}
          />
        ) : null}

        {avertissements.length > 0 ? (
          <BandeauMessage
            ton="avertissement"
            message={`À savoir avant de générer :\n${avertissements.join('\n')}`}
          />
        ) : null}

        {signatures.length === 0 ? (
          <BandeauMessage
            ton="avertissement"
            message={
              'Aucune signature n’a été recueillie. Le document portera « Non signé » sous chaque ' +
              'partie : vous pourrez le faire signer à la main, ou reprendre le formulaire.'
            }
          />
        ) : null}

        {/* --- Les parties ------------------------------------------------ */}
        <Carte>
          <Text style={styles.section}>Les parties</Text>
          <LigneDetail libelle="Bailleur" valeur={proprietaire.nom} accentuee />
          {proprietaire.qualite ? (
            <LigneDetail libelle="Qualité" valeur={proprietaire.qualite} />
          ) : null}
          <LigneDetail libelle="Adresse" valeur={adresseEnLignes(proprietaire).join(', ')} />
          {proprietaire.siret ? <LigneDetail libelle="SIRET" valeur={proprietaire.siret} /> : null}
          {titulaires.map((t, rang) => (
            <LigneDetail
              key={t.id}
              libelle={rang === 0 ? 'Locataire' : `Locataire ${rang + 1}`}
              valeur={nomComplet(t)}
            />
          ))}
        </Carte>

        {/* --- Le logement ------------------------------------------------ */}
        <Carte>
          <Text style={styles.section}>Le logement</Text>
          <LigneDetail libelle="Désignation" valeur={logement.nom} accentuee />
          <LigneDetail libelle="Adresse" valeur={adresseEnLignes(logement).join(', ')} />
          {logement.surface ? (
            <LigneDetail libelle="Surface" valeur={`${logement.surface} m²`} />
          ) : null}
          {logement.reference ? (
            <LigneDetail libelle="Référence" valeur={logement.reference} />
          ) : null}
        </Carte>

        {/* --- Durée ------------------------------------------------------ */}
        <Carte>
          <Text style={styles.section}>Durée du bail</Text>
          <LigneDetail
            libelle="Type"
            valeur={brouillon.categorie ? LIBELLE_BAIL[brouillon.categorie] : '—'}
            accentuee
          />
          <LigneDetail
            libelle="Prise d’effet"
            valeur={formaterDateFr(brouillon.dateDebut ?? '')}
          />
          <LigneDetail libelle="Durée" valeur={`${brouillon.dureeMois ?? 0} mois`} />
          <LigneDetail
            libelle="Fin"
            valeur={
              brouillon.dateDebut && brouillon.dureeMois
                ? finDuBail(brouillon.dateDebut, brouillon.dureeMois)
                : '—'
            }
          />
          {brouillon.categorie === 'mobilite' && brouillon.motifMobilite ? (
            <LigneDetail libelle="Motif" valeur={brouillon.motifMobilite} />
          ) : null}
          {regle ? (
            <Text style={styles.note}>
              {regle.regime}. {regle.duree}
            </Text>
          ) : null}
        </Carte>

        {/* --- Argent ----------------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>Loyer, charges et dépôt</Text>
          <LigneDetail libelle="Loyer hors charges" valeur={formatMontant(brouillon.loyer ?? 0)} />
          <LigneDetail libelle="Provision pour charges" valeur={formatMontant(brouillon.charges ?? 0)} />
          <LigneDetail
            libelle="Total mensuel"
            valeur={formatMontant((brouillon.loyer ?? 0) + (brouillon.charges ?? 0))}
            accentuee
          />
          <LigneDetail
            libelle="Dépôt de garantie"
            valeur={
              regle?.depotGarantieInterdit
                ? 'Interdit pour ce type de bail'
                : formatMontant(brouillon.depotGarantie ?? 0)
            }
          />
          <LigneDetail libelle="Jour d’échéance" valeur={`le ${brouillon.jourEcheance ?? 1} du mois`} />
          {periode ? (
            <Text style={styles.note}>
              Loyer en vigueur depuis {formaterDateFr(`${periode.debut}-01`)}. Le document imprime le
              loyer réellement dû, celui que réclament les quittances.
            </Text>
          ) : null}
        </Carte>

        {/* --- Diagnostics ------------------------------------------------ */}
        <Carte>
          <Text style={styles.section}>Diagnostics</Text>
          {(brouillon.diagnostics ?? []).length === 0 ? (
            <Text style={styles.note}>
              Aucun diagnostic n’est renseigné. Le dossier de diagnostic technique doit être joint au
              bail.
            </Text>
          ) : (
            (brouillon.diagnostics ?? []).map((d) => (
              <LigneDetail
                key={d.libelle}
                libelle={d.libelle}
                valeur={`${formaterDateFr(d.date)}${d.aRenouveler ? ' — à renouveler' : ''}`}
                pointillee
              />
            ))
          )}
        </Carte>

        {/* --- Clauses ---------------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>Clauses particulières</Text>
          <LigneDetail
            libelle="Résidence principale"
            valeur={brouillon.residencePrincipale === false ? 'Mention retirée' : 'Mentionnée'}
          />
          {brouillon.clausesParticulieres?.trim() ? (
            <Text style={styles.texteLibre}>{brouillon.clausesParticulieres.trim()}</Text>
          ) : (
            <Text style={styles.note}>Aucune clause particulière n’a été saisie.</Text>
          )}
        </Carte>

        {/* --- Annexes ---------------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>Annexes</Text>
          {regle && regle.annexes.length > 0 ? (
            regle.annexes.map((annexe) => {
              const jointe = (brouillon.annexesFournies ?? []).includes(annexe);
              return (
                <LigneDetail
                  key={annexe}
                  libelle={LIBELLE_ANNEXE[annexe]}
                  valeur={jointe ? 'Jointe' : 'Non jointe à ce jour'}
                  pointillee
                />
              );
            })
          ) : (
            <Text style={styles.note}>Ce type de bail n’impose aucune annexe.</Text>
          )}
        </Carte>

        {/* --- Signatures ------------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>Signatures</Text>
          <LigneDetail libelle="Bailleur" valeur={proprietaire.nom} pointillee />
          {signatures.some((s) => s.signataire === 'bailleur') ? (
            <Text style={styles.note}>Signé.</Text>
          ) : (
            <Text style={styles.note}>Non signé.</Text>
          )}
          {titulaires.map((t) => {
            const signe = signatures.some((s) => s.signataire === t.id);
            return (
              <View key={t.id}>
                <LigneDetail libelle="Locataire" valeur={nomComplet(t)} pointillee />
                <Text style={styles.note}>{signe ? 'Signé.' : 'Non signé.'}</Text>
              </View>
            );
          })}
          {nonSignes > 0 ? (
            <Text style={styles.note}>
              {nonSignes} cadre{nonSignes > 1 ? 's' : ''} restera
              {nonSignes > 1 ? 'ient' : ''} marqué{nonSignes > 1 ? 's' : ''} « Non signé ».
            </Text>
          ) : null}
        </Carte>

        {/* --- Fondements ------------------------------------------------- */}
        <Carte>
          <Text style={styles.section}>Fondements</Text>
          <Text style={styles.note}>
            Les règles imprimées dans ce bail viennent des sources suivantes, lues le jour indiqué.
            Aucune clause n’est écrite par l’application.
          </Text>
          {SOURCES_BAIL.map((s) => (
            <Text key={s.reference} style={styles.source}>
              • {s.reference} — consulté le {formaterDateFr(s.consulteLe)}
            </Text>
          ))}
          {brouillon.dateDebut && brouillon.dateDebut >= '2026-10-01' ? (
            <Text style={styles.note}>
              Ce bail est conclu après le 1er octobre 2026 : les nouveaux contrats types
              réglementaires s’appliquent.
            </Text>
          ) : null}
        </Carte>
      </ScrollView>

      <BarreActionFixe
        libelle={travail ? 'Génération…' : 'Générer le bail'}
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
    section: {
      ...typographie.petitAppuye,
      color: couleurs.texteTertiaire,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: espaces.sm,
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
      borderRadius: 12,
      backgroundColor: couleurs.fondSourdine,
    },
    source: {
      ...typographie.petit,
      color: couleurs.texteSecondaire,
      marginTop: espaces.xs,
    },
  });

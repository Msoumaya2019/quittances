/**
 * Carte de logement affichée sur l'accueil.
 *
 * C'est l'élément le plus important de l'application. Elle doit répondre en un
 * regard à trois questions : quel logement, où en est le paiement, et quelle est
 * la prochaine action. Le bouton principal porte toujours l'action utile du
 * moment — générer la quittance, enregistrer le paiement, ou compléter.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Bouton } from './Bouton';
import { Carte } from './Carte';
import { PastilleStatut } from './PastilleStatut';
import { couleurs, espaces, rayons, typographie } from '../tokens';
import { formatMontant } from '../../domain/money';
import { libelleCourt, libelleLongCapitalise, type Periode } from '../../domain/period';
import { nomComplet } from '../../domain/types';
import type { CarteLogement } from '../../hooks/useAccueil';

interface PropsCarteLogement {
  donnees: CarteLogement;
  periode: Periode;
  onActionPrincipale: (donnees: CarteLogement) => void;
  onOuvrirLogement: (donnees: CarteLogement) => void;
  onGenererMoisPrecedent: (donnees: CarteLogement) => void;
}

export function CarteLogementItem({
  donnees,
  periode,
  onActionPrincipale,
  onOuvrirLogement,
  onGenererMoisPrecedent,
}: PropsCarteLogement) {
  const {
    logement,
    titulaires,
    montantDu,
    cumul,
    statut,
    solde,
    action,
  } = donnees;

  const locataire = titulaires.length > 0 ? nomComplet(titulaires[0]) : null;
  const autresTitulaires = titulaires.length > 1 ? ` +${titulaires.length - 1}` : '';

  const couleurAccent = COULEUR_ACCENT[statut];

  // Une carte sans locataire ne propose pas de paiement : il n'y a rien à régler.
  const actionDesactivee = action.type === 'aucune' || !donnees.bail;

  return (
    <Carte couleurAccent={couleurAccent} style={styles.carte}>
      {/* En-tête : nom du logement et statut */}
      <Pressable
        onPress={() => onOuvrirLogement(donnees)}
        accessibilityRole="button"
        accessibilityLabel={`Ouvrir ${logement.nom}`}
        style={styles.entete}
      >
        <View style={styles.enteteTextes}>
          <Text style={[typographie.titreCarte, styles.nom]} numberOfLines={1}>
            {logement.nom}
          </Text>
          <Text style={[typographie.petit, styles.ville]} numberOfLines={1}>
            {logement.ville || logement.adresse}
          </Text>
        </View>

        <PastilleStatut statut={statut} />
      </Pressable>

      {/* Locataire */}
      <View style={styles.blocLocataire}>
        <IconePersonne />
        <Text style={[typographie.corps, styles.locataire]} numberOfLines={1}>
          {locataire ? `${locataire}${autresTitulaires}` : 'Aucun locataire en place'}
        </Text>
      </View>

      {/* Montants */}
      <View style={styles.blocMontants}>
        <LigneMontant libelle="Loyer" valeur={formatMontant(montantDu.loyer, { decimales: 'auto' })} />
        <LigneMontant
          libelle="Charges"
          valeur={formatMontant(montantDu.charges, { decimales: 'auto' })}
        />
        <View style={styles.separateur} />
        <LigneMontant
          libelle="Total"
          valeur={formatMontant(montantDu.total, { decimales: 'auto' })}
          accentuee
        />
      </View>

      {/* Avancement du règlement, quand il y a un reste à payer */}
      {statut === 'partiel' && montantDu.total > 0 ? (
        <View style={styles.blocReste}>
          <Text style={[typographie.petit, styles.resteTexte]}>
            Déjà reçu : {formatMontant(cumul.encaisse, { decimales: 'auto' })} — reste{' '}
            <Text style={styles.resteMontant}>{formatMontant(solde, { decimales: 'auto' })}</Text>
          </Text>

          <View style={styles.rail}>
            <View
              style={[
                styles.remplissage,
                { width: `${Math.round((cumul.encaisse / montantDu.total) * 100)}%` },
              ]}
            />
          </View>
        </View>
      ) : null}

      {/* Mois concerné */}
      <View style={styles.ligneMois}>
        <Text style={[typographie.petitAppuye, styles.mois]}>
          {libelleLongCapitalise(periode)}
        </Text>
        {cumul.nombre > 1 ? (
          <Text style={[typographie.minuscule, styles.detailPaiement]}>
            {cumul.nombre} règlements
          </Text>
        ) : null}
      </View>

      {/* Action principale — le bouton qui fait tout */}
      <Bouton
        libelle={action.libelle}
        onPress={() => onActionPrincipale(donnees)}
        desactive={actionDesactivee}
        variante={action.type === 'generer_quittance' ? 'principal' : 'secondaire'}
        accessibilite={`${action.libelle} — ${logement.nom}, ${libelleLongCapitalise(periode)}`}
      />

      {/* Action secondaire : quittance d'un mois antérieur */}
      {donnees.bail ? (
        <Pressable
          onPress={() => onGenererMoisPrecedent(donnees)}
          accessibilityRole="button"
          accessibilityLabel={`Générer une quittance d’un mois précédent pour ${logement.nom}`}
          hitSlop={6}
          style={styles.lienSecondaire}
        >
          <IconeCalendrier />
          <Text style={[typographie.petit, styles.texteLien]}>
            Quittance d’un mois précédent
          </Text>
        </Pressable>
      ) : null}
    </Carte>
  );
}

function LigneMontant({
  libelle,
  valeur,
  accentuee = false,
}: {
  libelle: string;
  valeur: string;
  accentuee?: boolean;
}) {
  return (
    <View style={styles.ligneMontant}>
      <Text style={[typographie.petit, styles.libelleMontant]}>{libelle}</Text>
      <Text
        style={[
          accentuee ? typographie.montantPetit : typographie.corpsAppuye,
          styles.valeurMontant,
          accentuee && styles.valeurAccentuee,
        ]}
      >
        {valeur}
      </Text>
    </View>
  );
}

function IconePersonne() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M12 12 a4 4 0 1 0 0 -8 a4 4 0 0 0 0 8 M4 20 c0 -4 3.6 -6 8 -6 s8 2 8 6"
        stroke={couleurs.texteTertiaire}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

function IconeCalendrier() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path
        d="M4 6 h16 v14 h-16 z M4 10 h16 M8 3 v4 M16 3 v4"
        stroke={couleurs.vert}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

const COULEUR_ACCENT: Record<string, string> = {
  paye: couleurs.vert,
  partiel: couleurs.orange,
  retard: couleurs.rouge,
  attente: couleurs.bordureForte,
  hors_bail: couleurs.bordureForte,
};

const styles = StyleSheet.create({
  carte: {
    gap: espaces.md,
    paddingLeft: espaces.lg - 2,
  },
  entete: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: espaces.md,
  },
  enteteTextes: {
    flex: 1,
    gap: 2,
  },
  nom: {
    color: couleurs.texte,
  },
  ville: {
    color: couleurs.texteTertiaire,
  },
  blocLocataire: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaces.sm,
  },
  locataire: {
    color: couleurs.texteSecondaire,
    flex: 1,
  },
  blocMontants: {
    backgroundColor: couleurs.fond,
    borderRadius: rayons.lg,
    padding: espaces.md,
    gap: espaces.xs,
  },
  ligneMontant: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.sm,
  },
  libelleMontant: {
    color: couleurs.texteTertiaire,
  },
  valeurMontant: {
    color: couleurs.texte,
  },
  valeurAccentuee: {
    color: couleurs.vertFonce,
  },
  separateur: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: couleurs.bordure,
    marginVertical: espaces.xs,
  },
  blocReste: {
    gap: espaces.sm,
  },
  resteTexte: {
    color: couleurs.texteSecondaire,
  },
  resteMontant: {
    color: couleurs.orange,
    fontWeight: '700',
  },
  rail: {
    height: 6,
    borderRadius: rayons.rond,
    backgroundColor: couleurs.fondSourdine,
    overflow: 'hidden',
  },
  remplissage: {
    height: '100%',
    backgroundColor: couleurs.orange,
    borderRadius: rayons.rond,
  },
  ligneMois: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaces.sm,
  },
  mois: {
    color: couleurs.texte,
  },
  detailPaiement: {
    color: couleurs.texteTertiaire,
  },
  lienSecondaire: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaces.xs + 2,
    paddingVertical: espaces.xs,
  },
  texteLien: {
    color: couleurs.vert,
  },
});

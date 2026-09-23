/**
 * Styles du modèle « coloré et convivial ».
 *
 * Ce fichier vient **après** `STYLES_BASE`, dont il réutilise la mise en page
 * (`@page` A4 sans marge, `.page`, `.pied`, `.signature`) et les classes
 * communes. Il n'ajoute que la couche colorée : bandeau, cartes, pastille du
 * montant, puces des encaissements.
 *
 * Deux principes tiennent ce modèle :
 *
 *  - **il doit rester un papier légal.** La couleur porte la lecture — repérer
 *    d'un coup d'œil le montant, la période, le destinataire — et jamais
 *    l'information. Aucun texte n'est écrit en clair sur un fond moyen : tout
 *    est en encre foncée sur un fond très clair, ou en blanc sur la seule
 *    couleur assez sombre pour le supporter. Une impression en noir et blanc
 *    reste donc lisible, ce qui n'est pas un détail : une quittance se
 *    photocopie.
 *  - **il doit tenir sur une feuille.** Les cartes, les arrondis et les
 *    bordures coûtent de la hauteur, et le budget est celui de la feuille
 *    demandée par l'application : **297,39 mm**.
 *
 * Mesure du 23 septembre 2026, par `.verif/mesurer-blocs.py` sur
 * `.verif/rendu/recu-partiel-colore.html` :
 *
 *    bandeau 24,77 · cartes 35,21 · logement 35,21 · total 27,82 ·
 *    tableau 53,47 · encaissements 16,75 · mention 29,79 · avertissement 18,05 ·
 *    pied 25,23 · rembourrage 18,00      →  **326,23 mm**, soit 28,84 mm de trop.
 *
 * Après resserrement, le **cas le plus long** — trois locataires, une adresse de
 * quatre lignes, une mention libre à sa borne, des montants à sept chiffres —
 * pèse **292,36 mm**, soit **5,03 mm de marge** sur une feuille de 297,39. Les
 * douze cas du banc (4 documents × 3 modèles) tiennent, et le format Letter
 * reproduit toujours le défaut d'origine sur deux pages.
 *
 * C'est le rembourrage et les blancs qui ont été resserrés, jamais le texte :
 * une quittance se lit à l'œil, et une police réduite pour gagner trois
 * millimètres coûte plus cher que la place qu'elle rend. Les valeurs d'origine
 * sont rappelées en commentaire là où elles ont changé, pour qu'une baisse
 * future se juge sur la mesure et non à l'impression.
 *
 * Le débordement ne se corrige pas par les marges de la feuille : ce fichier ne
 * touche pas à `@page`, il réduit ce que les blocs occupent réellement.
 */

/**
 * Palette du modèle coloré.
 *
 * Elle ne suit **pas** le thème de l'application, pour la même raison que
 * `COULEURS_DOCUMENT` : une quittance est conservée des années, et changer de
 * thème ne doit pas changer l'aspect d'un document déjà remis. Ces valeurs sont
 * propres à ce modèle — elles ne sont pas relevées sur un papier existant,
 * puisque ce modèle n'en reproduit aucun.
 */
export const COULEURS_COLORE = {
  /** Bandeau, titres, montant mis en avant. */
  principale: '#6D28D9',
  principaleFonce: '#4C1D95',
  principaleClaire: '#C4B5FD',
  principaleTresClaire: '#F5F3FF',
  /** Période, et touches chaudes. */
  accent: '#B45309',
  accentClair: '#FDE68A',
  accentTresClair: '#FFFBEB',
  /** Tampon « payé », et puces des encaissements. */
  succes: '#047857',
  succesTresClair: '#ECFDF5',
  /** Carte du locataire. */
  rose: '#9D174D',
  roseTresClair: '#FDF2F8',
  /** Encres. */
  texte: '#1A1A1A',
  texteSecondaire: '#444444',
  texteTertiaire: '#777777',
  blanc: '#FFFFFF',
} as const;

/**
 * Couche colorée, ajoutée à `STYLES_BASE`.
 *
 * Les hauteurs sont volontairement exprimées en millimètres, comme partout
 * ailleurs dans `src/pdf/` : le moteur d'impression les comprend, et elles se
 * mesurent.
 */
export const STYLES_COLORE = `
  /* Bandeau ------------------------------------------------------------- */

  /*
   * Le bandeau porte le titre et la période. C'est la seule zone à fond
   * soutenu : le blanc y reste lisible même imprimé en niveaux de gris, la
   * teinte étant assez foncée.
   */
  .cc-bandeau {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 5mm;
    padding: 3.5mm 5mm;   /* 5 mm 6 mm avant la mesure de 326,23 mm */
    border-radius: 3.5mm;
    background-color: ${COULEURS_COLORE.principale};
    color: ${COULEURS_COLORE.blanc};
    margin-bottom: 3.5mm; /* 5 mm avant */
  }

  .cc-bandeau .cc-titre {
    font-size: 15pt;      /* 17 pt avant */
    font-weight: 700;
    letter-spacing: 0.4pt;
    text-transform: uppercase;
    margin: 0;
    line-height: 1.15;
  }

  .cc-bandeau .cc-periode {
    margin-top: 1mm;      /* 1,5 mm avant */
    font-size: 11pt;      /* 11,5 pt avant */
  }

  .cc-bandeau .cc-numero {
    text-align: right;
    font-size: 8.5pt;     /* 9 pt avant */
    line-height: 1.4;
    white-space: nowrap;
  }

  .cc-bandeau .cc-numero strong {
    display: block;
    font-size: 10pt;      /* 10,5 pt avant */
  }

  /* Cartes d'identité --------------------------------------------------- */

  .cc-cartes {
    display: flex;
    gap: 4mm;             /* 5 mm avant */
    margin-bottom: 3mm;   /* 4 mm avant */
  }

  .cc-carte {
    flex: 1;
    padding: 2.6mm 4mm;   /* 4 mm 4,5 mm avant la mesure de 326,23 mm */
    border-radius: 3mm;
    border-left: 2mm solid ${COULEURS_COLORE.principale}; /* 2,5 mm avant */
    background-color: ${COULEURS_COLORE.principaleTresClaire};
  }

  .cc-carte.cc-locataire {
    border-left-color: ${COULEURS_COLORE.rose};
    background-color: ${COULEURS_COLORE.roseTresClair};
  }

  .cc-carte .cc-etiquette {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.7pt;
    color: ${COULEURS_COLORE.principaleFonce};
    margin-bottom: 1mm;   /* 1,5 mm avant */
  }

  .cc-carte.cc-locataire .cc-etiquette {
    color: ${COULEURS_COLORE.rose};
  }

  .cc-carte .cc-valeur {
    font-size: 10.5pt;
    /* 1,45 avant la mesure de 326,23 mm. C'est la seule valeur qui joue sur
       TOUTES les lignes des cartes : quatre pour le bailleur, cinq pour le
       logement, dans le cas le plus long. */
    line-height: 1.28;
    color: ${COULEURS_COLORE.texte};
  }

  .cc-carte .cc-valeur strong {
    font-weight: 700;
  }

  /* Pastille du montant ------------------------------------------------- */

  /*
   * Le montant est la première chose qu'on cherche sur une quittance. Il est
   * donc seul sur sa ligne, en gros, sur un fond très clair bordé de la couleur
   * principale : le contraste tient même photocopié.
   *
   * Il reste à 18 pt, contre 22 pt avant la mesure : c'est le plus gros texte
   * de la feuille, et il le reste de loin.
   */
  .cc-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 5mm;
    padding: 3mm 5mm;     /* 4 mm 6 mm avant */
    border-radius: 3.5mm;
    border: 0.5mm solid ${COULEURS_COLORE.principaleClaire};
    background-color: ${COULEURS_COLORE.principaleTresClaire};
    margin-bottom: 3.5mm; /* 5 mm avant */
  }

  .cc-total .cc-libelle {
    font-size: 9.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.7pt;
    color: ${COULEURS_COLORE.principaleFonce};
  }

  .cc-total .cc-sous-libelle {
    margin-top: 0.6mm;    /* 1 mm avant */
    font-size: 8.5pt;
    color: ${COULEURS_COLORE.texteSecondaire};
  }

  .cc-total .cc-montant {
    font-size: 18pt;      /* 22 pt avant */
    font-weight: 700;
    color: ${COULEURS_COLORE.principaleFonce};
    white-space: nowrap;
  }

  /*
   * Le tampon suit le champ resteAPercevoir du contenu, jamais la nature du
   * document : « Payé » quand il ne reste rien, « Reste à payer » sinon. La
   * décision vient du domaine, ce fichier ne fait que la montrer.
   */
  .cc-tampon {
    display: inline-block;
    margin-top: 1mm;      /* 1,5 mm avant */
    padding: 0.7mm 2.5mm; /* 1 mm 3 mm avant */
    border-radius: 1.6mm;
    font-size: 8.5pt;     /* 9 pt avant */
    font-weight: 700;
    letter-spacing: 0.8pt;
    color: ${COULEURS_COLORE.blanc};
    background-color: ${COULEURS_COLORE.succes};
  }

  .cc-tampon.cc-a-payer {
    background-color: ${COULEURS_COLORE.accent};
  }

  /* Tableau des montants ------------------------------------------------ */

  .cc-tableau {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 3mm;   /* 4 mm avant */
  }

  .cc-tableau th {
    text-align: left;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.6pt;
    color: ${COULEURS_COLORE.blanc};
    background-color: ${COULEURS_COLORE.principale};
    padding: 1.3mm 3.5mm; /* 2 mm 4 mm avant */
  }

  .cc-tableau th:first-child { border-top-left-radius: 3mm; }
  .cc-tableau th:last-child { border-top-right-radius: 3mm; }

  .cc-tableau th.cc-montant,
  .cc-tableau td.cc-montant {
    text-align: right;
  }

  .cc-tableau td {
    padding: 1.2mm 3.5mm; /* 2,2 mm 4 mm avant */
    font-size: 10pt;      /* 10,5 pt avant */
    border-bottom: 1px solid ${COULEURS_COLORE.principaleClaire};
  }

  .cc-tableau tr.cc-pair td {
    background-color: ${COULEURS_COLORE.principaleTresClaire};
  }

  .cc-tableau tr.cc-total td {
    font-size: 11pt;      /* 12 pt avant */
    font-weight: 700;
    border-bottom: none;
    background-color: ${COULEURS_COLORE.accentTresClair};
    color: ${COULEURS_COLORE.accent};
  }

  /* Encaissements ------------------------------------------------------- */

  .cc-paiements {
    padding: 2.2mm 3.5mm; /* 3 mm 4 mm avant */
    border-radius: 3mm;
    background-color: ${COULEURS_COLORE.succesTresClair};
    border-left: 2mm solid ${COULEURS_COLORE.succes}; /* 2,5 mm avant */
    font-size: 9.5pt;
    line-height: 1.45;    /* 1,5 avant */
    color: ${COULEURS_COLORE.texteSecondaire};
    margin-bottom: 3mm;   /* 4 mm avant */
  }

  .cc-paiements .cc-paiements-titre {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.7pt;
    color: ${COULEURS_COLORE.succes};
    margin-bottom: 1mm;   /* 1,5 mm avant */
  }

  .cc-paiements .cc-puce {
    color: ${COULEURS_COLORE.succes};
  }

  /* Mention légale ------------------------------------------------------ */

  /*
   * Elle reste encadrée et sobre : c'est la phrase qui donne sa valeur au
   * document, elle ne se met pas en couleur.
   */
  .cc-mention {
    padding: 2.8mm 3.5mm; /* 3,5 mm 4 mm avant */
    border-radius: 3mm;
    border: 0.4mm dashed ${COULEURS_COLORE.principaleClaire};
    background-color: ${COULEURS_COLORE.blanc};
    font-size: 9.5pt;     /* 10 pt avant */
    line-height: 1.45;    /* 1,55 avant */
    color: ${COULEURS_COLORE.texte};
    margin-bottom: 3mm;   /* 4 mm avant */
  }

  .cc-mention .cc-mention-titre {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.7pt;
    color: ${COULEURS_COLORE.principaleFonce};
    margin-bottom: 1mm;   /* 1,5 mm avant */
  }
`;

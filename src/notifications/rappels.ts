/**
 * Programmation du rappel de loyers auprès du système.
 *
 * C'est la **seule** partie du projet qui parle aux notifications. Elle ne
 * décide de rien : le jour et le texte viennent de `src/domain/rappels.ts`.
 *
 * Tout est enfermé dans des `try` : une notification est un confort, jamais une
 * raison de faire échouer l'application. Mais un échec **est remonté** plutôt
 * que tu — un interrupteur qui ne fait rien en silence est pire qu'un
 * interrupteur absent.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  HEURE_RAPPEL,
  normaliserJourRappel,
  prochainRappel,
  texteRappel,
} from '../domain/rappels';

/** Identifiant du canal Android, stable : le changer recrée un canal et perd le réglage utilisateur. */
const CANAL = 'rappels-loyers';

/** Identifiant de notre rappel, pour pouvoir l'annuler sans toucher aux autres. */
const IDENTIFIANT = 'rappel-loyers-mensuel';

export type ResultatProgrammation =
  | { ok: true }
  | { ok: false; raison: 'refus' | 'indisponible' | 'erreur'; message: string };

/**
 * Fait afficher le rappel même lorsque l'application est ouverte.
 *
 * À appeler une fois au démarrage. Sans cela, un rappel qui tombe pendant que
 * l'utilisateur consulte l'application passe inaperçu.
 */
export async function configurerAffichageRappels(): Promise<void> {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Sans conséquence : le rappel s'affichera hors de l'application.
  }
}

/** Crée le canal Android. Sans canal, la notification est refusée par le système. */
async function preparerCanal(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CANAL, {
    name: 'Rappels de loyers',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** Demande l'autorisation, ou lit celle déjà accordée. */
async function autorisationAccordee(): Promise<boolean> {
  const actuelle = await Notifications.getPermissionsAsync();
  if (actuelle.granted) return true;
  if (!actuelle.canAskAgain) return false;
  const demandee = await Notifications.requestPermissionsAsync();
  return demandee.granted;
}

/** Retire tout rappel déjà programmé sous notre identifiant. */
export async function annulerRappel(): Promise<void> {
  try {
    const programmes = await Notifications.getAllScheduledNotificationsAsync();
    for (const p of programmes) {
      if (p.identifier === IDENTIFIANT || p.content.data?.origine === IDENTIFIANT) {
        await Notifications.cancelScheduledNotificationAsync(p.identifier);
      }
    }
  } catch {
    // Rien à annuler, ou système indisponible : sans conséquence.
  }
}

/**
 * Programme le rappel mensuel.
 *
 * Le déclencheur est **mensuel et répétitif** : il ne s'arrête pas au bout d'un
 * an, même si l'application n'est jamais rouverte. C'est la raison pour laquelle
 * le texte ne nomme pas le mois.
 */
export async function programmerRappel(
  jourRappel: number,
  maintenant: Date = new Date(),
): Promise<ResultatProgrammation> {
  try {
    await preparerCanal();

    if (!(await autorisationAccordee())) {
      return {
        ok: false,
        raison: 'refus',
        message:
          "Le téléphone a refusé les notifications. Autorisez-les dans les réglages du système, puis réactivez le rappel.",
      };
    }

    await annulerRappel();

    const jour = normaliserJourRappel(jourRappel);
    const texte = texteRappel();

    await Notifications.scheduleNotificationAsync({
      identifier: IDENTIFIANT,
      content: {
        title: texte.titre,
        body: texte.corps,
        data: { origine: IDENTIFIANT },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
        day: jour,
        hour: HEURE_RAPPEL,
        minute: 0,
        channelId: CANAL,
      },
    });

    return { ok: true };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const message = detail.includes('not available')
      ? "Les rappels ne sont pas disponibles sur cet appareil."
      : `Le rappel n'a pas pu être programmé (${detail}).`;
    return { ok: false, raison: 'erreur', message };
  }
}

/** Décrit le prochain rappel, pour l'afficher dans l'interface. */
export function prochaineDateRappel(
  jourRappel: number,
  maintenant: Date = new Date(),
): string {
  const p = prochainRappel(jourRappel, maintenant);
  const date = p.quand.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return `${date} à ${HEURE_RAPPEL} h`;
}

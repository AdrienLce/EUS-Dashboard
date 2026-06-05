/**
 * @module adapters/aws
 *
 * Adapter pour le AWS Health Dashboard JSON feed.
 *
 * AWS expose un flux JSON listant les événements en cours sur ses services.
 *
 * URL : https://health.aws.amazon.com/health/status
 *
 * Structure JSON attendue :
 * ```json
 * {
 *   "title": "Amazon Web Services Service Health Dashboard",
 *   "current_events": [
 *     {
 *       "service_name": "Amazon EC2",
 *       "summary": "Increased error rates in the EU-WEST-1 region",
 *       "status": "Service is operating normally",
 *       "date": "2024-01-15T10:00:00Z",
 *       "url": "https://health.aws.amazon.com/health/status#..."
 *     }
 *   ],
 *   "archive_entries": [ ... ]
 * }
 * ```
 *
 * Logique de parsing :
 * - Si `current_events` est vide → `operational`
 * - Sinon → chaque événement est un Incident, le niveau global est le pire niveau parmi eux
 */

import type { AdapterResult, Incident, StatusLevel } from '~/types'

/** Structure d'un événement dans le flux AWS Health */
interface AwsEntry {
  /** Nom du service AWS (ex: "Amazon EC2", "AWS Lambda") */
  service_name: string
  /** Description courte de l'événement */
  summary: string
  /** Statut textuel de l'événement (phrase libre en anglais) */
  status: string
  /** Date de l'événement ISO 8601 */
  date: string
  /** URL vers la page de détail sur le Health Dashboard */
  url: string
}

/** Structure complète du flux JSON AWS Health */
interface AwsFeed {
  title?: string
  /** Événements archivés (passés) — non utilisés par cet adapter */
  archive_entries?: AwsEntry[]
  /** Événements actuellement actifs */
  current_events?: AwsEntry[]
}

/**
 * Convertit le statut textuel AWS (phrase libre) en StatusLevel.
 * AWS utilise des phrases complètes plutôt que des codes courts.
 *
 * @param status - Texte du champ "status" (ex: "Service is operating normally")
 * @returns StatusLevel déduit par correspondance de sous-chaîne
 */
function mapAwsStatus(status: string): StatusLevel {
  const s = status.toLowerCase()
  if (s.includes('operating normally') || s.includes('service is operating normally')) return 'operational'
  if (s.includes('informational')) return 'leger'
  if (s.includes('service degradation') || s.includes('degraded')) return 'mineur'
  if (s.includes('service disruption') || s.includes('disruption')) return 'majeur'
  if (s.includes('maintenance')) return 'maintenance'
  // Défaut conservateur : événement présent mais statut inconnu → légère perturbation
  return 'leger'
}

/**
 * Parse le flux JSON AWS Health Dashboard en AdapterResult.
 *
 * @param data - Réponse JSON parsée depuis health.aws.amazon.com/health/status
 * @returns AdapterResult avec le niveau global et la liste des événements actifs
 */
export function parseAws(data: unknown): AdapterResult {
  const feed = data as AwsFeed

  const current = feed.current_events ?? []

  // Pas d'événements en cours → tout est opérationnel
  if (current.length === 0) {
    return {
      level: 'operational',
      message: 'Tous les services opérationnels',
      incidents: [],
    }
  }

  // Transformer chaque événement en Incident normalisé
  // Le titre inclut le nom du service pour identifier rapidement le composant affecté
  const incidents: Incident[] = current.map((entry, i) => ({
    id: `aws-${i}-${entry.date}`,
    title: `[${entry.service_name}] ${entry.summary}`,
    level: mapAwsStatus(entry.status),
    startedAt: entry.date,
    updatedAt: entry.date,
    message: entry.status,
    url: entry.url,
  }))

  // Calculer le niveau global = le pire niveau parmi tous les incidents
  const worstLevel = incidents.reduce<StatusLevel>((worst, inc) => {
    const order: StatusLevel[] = ['operational', 'maintenance', 'leger', 'mineur', 'majeur']
    return order.indexOf(inc.level) > order.indexOf(worst) ? inc.level : worst
  }, 'operational')

  return {
    level: worstLevel,
    message: `${current.length} événement(s) en cours`,
    incidents,
  }
}

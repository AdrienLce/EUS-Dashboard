/**
 * @module types
 *
 * Core TypeScript definitions for the status dashboard.
 *
 * This module exports:
 * - The status level types (StatusLevel) and their severity order
 * - The configuration interfaces (ServiceConfig, CompositeServiceConfig, etc.)
 * - The result interfaces (AdapterResult, StatusSnapshot, Incident, MessageEntry)
 * - The color and label constants per level
 * - The worstLevel utility function
 */

/**
 * The 7 possible status levels, from the most benign to the most severe.
 *
 * - `operational`  : everything is working normally
 * - `information`  : informational message with no impact on the service
 * - `leger`        : partial, non-critical degradation
 * - `mineur`       : partial impact on the service
 * - `majeur`       : outage or strong impact
 * - `maintenance`  : planned or ongoing maintenance
 * - `inconnu`      : undetermined status, often due to missing auth
 */
export type StatusLevel =
  | "operational"
  | "leger"
  | "mineur"
  | "majeur"
  | "critique"
  | "maintenance"
  | "information"
  | "inconnu";

/**
 * Display configuration for a status level.
 *
 * Each level has a customizable label (`label`) and an immutable
 * reference label (`reference`) that recalls the exact semantics of the level.
 * The distinction matters: the user can rename "Incident majeur"
 * to "Panne totale" without losing the semantics encoded in `reference`.
 */
export interface LevelConfig {
  /** Immutable technical identifier of the level */
  id: StatusLevel
  /** Label displayed in the UI — customizable by the user */
  label: string
  /** Reference label — not editable, recalls the semantics of the level */
  reference: string
  /** Hexadecimal color, e.g. "#22c55e" — used to generate the CSS styles */
  color: string
}

/**
 * Default configurations for the 7 status levels.
 * Used as the initial value and as a fallback if a level is missing
 * from the user's custom configuration.
 */
export const DEFAULT_LEVEL_CONFIGS: LevelConfig[] = [
  { id: 'operational',  label: 'Operational',        reference: 'Everything is working normally',          color: '#22c55e' },
  { id: 'information',  label: 'Information',         reference: 'Informational message, no impact',        color: '#8b5cf6' },
  { id: 'leger',        label: 'Degraded',           reference: 'Partial, non-critical degradation',       color: '#eab308' },
  { id: 'mineur',       label: 'Minor incident',     reference: 'Partial impact on the service',           color: '#f97316' },
  { id: 'majeur',       label: 'Major incident',     reference: 'Outage or strong impact',                 color: '#ef4444' },
  { id: 'critique',     label: 'Critical incident',  reference: 'Total outage or critical interruption',   color: '#7f1d1d' },
  { id: 'maintenance',  label: 'Maintenance',        reference: 'Planned or ongoing maintenance',          color: '#3b82f6' },
  { id: 'inconnu',      label: 'Action required',    reference: 'Undetermined status / missing auth',      color: '#9ca3af' },
]

/** HTTP method allowed for polling requests */
export type HttpMethod = "GET" | "POST";

/**
 * Custom mapping for the `custom` adapter.
 *
 * Allows pointing to any value within an arbitrary JSON
 * via dotted notation and converting it into a StatusLevel.
 *
 * @example
 * // Target JSON: { "health": { "status": "degraded" } }
 * const mapping: CustomMapping = {
 *   statusPath: 'health.status',
 *   levelMap: { 'degraded': 'mineur', 'healthy': 'operational' }
 * }
 *
 * @example
 * // Target JSON with an array: { "services": [{ "name": "API", "state": "outage" }] }
 * const mapping: CustomMapping = {
 *   statusPath: 'services.*.state',  // wildcard * = iterates over the array
 *   messagePath: 'services.*.name',
 *   levelMap: { 'outage': 'majeur', 'operational': 'operational' }
 * }
 */
export interface CustomMapping {
  /**
   * Path to the status value in the JSON, in dotted notation.
   * Supports `*` wildcards to iterate over arrays.
   * Examples: `"status"`, `"data.health"`, `"components.*.status"`
   */
  statusPath: string;
  /**
   * Path to the status description text (optional).
   * If absent, `statusPath` is used as the message.
   * With a wildcard, all values are joined by `\n`.
   */
  messagePath?: string;
  /**
   * Mapping table from value → status level.
   * Supports 4 pattern syntaxes (see matchLevelMap in custom.ts):
   * - Exact    : `"none"` → operational
   * - Wildcard : `"healthy*"` → any value starting with "healthy"
   * - Contains : `"~advisory"` → any value containing "advisory"
   * - Regex    : `"/^(none|healthy)$/i"` → regular expression with flags
   *
   * Also used to map the level of each incident (via `incidentLevelPath`).
   */
  levelMap: Record<string, StatusLevel>;
  /**
   * Path to the incidents array in the response, in dotted notation.
   * When defined, incidents are extracted explicitly from this array
   * (just like `statusPath`/`messagePath`), independently of the status wildcard.
   * Examples: `"incidents"`, `"result.incidents"`, `"data.events"`.
   */
  incidentsPath?: string;
  /**
   * Field for the incident title, relative to each element of `incidentsPath`.
   * If absent: auto-detection among `title`, `name`, `headline`, `summary`.
   * Examples: `"name"`, `"title"`.
   */
  incidentTitlePath?: string;
  /**
   * Field for the incident level/impact, relative to each element of `incidentsPath`.
   * The value is converted via `levelMap` (then auto-detection as a fallback).
   * If absent: auto-detection among `level`, `impact`, `severity`, `status`.
   * Examples: `"impact"`, `"status"`.
   */
  incidentLevelPath?: string;
  /**
   * Field for the incident message/description, relative to each element of `incidentsPath`.
   * Supports sub-paths (e.g. `"incident_updates.0.body"`).
   * If absent: auto-detection among `body`, `description`, `message`, `summary`.
   */
  incidentMessagePath?: string;
}

/**
 * Optional filtering applied by the `rss` adapter before computing the status.
 * Turns a high-volume incident feed (e.g. AWS all.rss) into a relevant signal:
 * only entries within the time window, matching at least one keyword, and not
 * already resolved are considered.
 */
export interface RssFilter {
  /** Only keep entries published within the last N hours (entries with no/unparseable date are kept). */
  windowHours?: number;
  /** Only keep entries whose title or summary contains at least one of these (case-insensitive). Empty/absent = keep all. */
  keywords?: string[];
  /** Drop entries that are already resolved / "operating normally". */
  excludeResolved?: boolean;
}


/**
 * Complete configuration of a service to monitor.
 *
 * A service is an external URL queried at regular intervals.
 * The response is transformed by an adapter into a StatusSnapshot.
 */
export interface ServiceConfig {
  /** UUID generated at creation */
  id: string;
  /** Name displayed in the dashboard */
  name: string;
  /** URL of the status API to query */
  url: string;
  /** HTTP method (GET in the vast majority of cases) */
  method: HttpMethod;
  /** Additional HTTP headers (e.g. Authorization, API keys) */
  headers: Record<string, string>;
  /** Request body (POST only) */
  body?: string;
  /**
   * Key of the adapter to use for parsing the response.
   * Possible values: "github", "atlassian", "aws", "azuredevops", "rss", "custom", "auto"
   */
  adapter: string;
  /** Custom mapping — required if adapter === "custom" */
  customMapping?: CustomMapping;
  /** Optional filtering for the `rss` adapter (window / keywords / exclude resolved) */
  rss?: RssFilter;
  /** Display group name (optional, to group visually) */
  group?: string;
  /** Polling interval in seconds (1–20 min) */
  pollInterval: number;
  /** Enables or disables this service */
  enabled: boolean;
  /** ISO 8601 creation date */
  createdAt: string;
}

/**
 * Configuration of a sub-service belonging to a composite service.
 *
 * Similar to ServiceConfig but without `group`, `pollInterval`, `createdAt`
 * The adapter and mapping can inherit the `defaultAdapter`/`defaultMapping` values
 * of the parent composite if not specified here.
 */
export interface SubServiceConfig {
  /** UUID generated at creation */
  id: string;
  /** Name displayed for this sub-service */
  name: string;
  /** URL of the status API */
  url: string;
  /** HTTP method */
  method: HttpMethod;
  /** Additional HTTP headers */
  headers: Record<string, string>;
  /** Request body (POST only) */
  body?: string;
  /**
   * Adapter to use. If empty or "auto" AND the composite has a `defaultAdapter`,
   * the composite's `defaultAdapter` is used.
   */
  adapter: string;
  /**
   * Custom mapping specific to this child.
   * If absent, inherits the parent composite's `defaultMapping`.
   */
  customMapping?: CustomMapping;
  /** Optional filtering for the `rss` adapter (window / keywords / exclude resolved) */
  rss?: RssFilter;
  /** Enables or disables this sub-service */
  enabled: boolean;
}

/**
 * Configuration of a composite service (group of sub-services).
 *
 * A composite aggregates several URLs under a single logical service.
 * Each child is polled independently but at the same interval.
 * The composite's overall level is the worst level among its active children.
 */
export interface CompositeServiceConfig {
  /** UUID generated at creation */
  id: string;
  /** Type discriminant — always "composite" */
  type: "composite";
  /** Name displayed in the dashboard */
  name: string;
  /** Display group name (optional) */
  group?: string;
  /** Enables or disables this composite and all its children */
  enabled: boolean;
  /** ISO 8601 creation date */
  createdAt: string;
  /** Polling interval in seconds shared by all children (1–20 min) */
  pollInterval: number;
  /** List of sub-services to monitor */
  children: SubServiceConfig[];
  /** Adapter applied to every child that has no adapter config of its own */
  defaultAdapter?: string;
  /** Mapping applied to every child that has no customMapping of its own */
  defaultMapping?: CustomMapping;
}

/**
 * Severity order of the levels, from least to most severe.
 * Used by `worstLevel` to compare two levels.
 *
 * Note: `inconnu` is placed right after `operational` because it means
 * "we don't know" rather than "it's broken".
 */
export const LEVEL_ORDER: StatusLevel[] = [
  "operational",
  "inconnu",
  "information",
  "maintenance",
  "leger",
  "mineur",
  "majeur",
  "critique",
];

/**
 * Returns the most severe level among a list of levels.
 * Used to compute the overall level of a composite service
 * or of an adapter with a wildcard over several components.
 *
 * @param levels - Array of levels to compare
 * @returns The level with the highest index in LEVEL_ORDER
 *
 * @example
 * worstLevel(['operational', 'mineur', 'leger']) // → 'mineur'
 * worstLevel(['operational', 'operational'])      // → 'operational'
 * worstLevel([])                                  // → 'operational' (default value)
 */
export function worstLevel(levels: StatusLevel[]): StatusLevel {
  return levels.reduce<StatusLevel>((worst, l) => {
    return LEVEL_ORDER.indexOf(l) > LEVEL_ORDER.indexOf(worst) ? l : worst;
  }, "operational");
}

/**
 * An ongoing or resolved incident on a service.
 * Incidents are displayed in a service's detail view.
 */
export interface Incident {
  /** Unique identifier of the incident (often provided by the source) */
  id: string;
  /** Short title of the incident */
  title: string;
  /** Severity level of this incident */
  level: StatusLevel;
  /** ISO 8601 start date */
  startedAt: string;
  /** ISO 8601 last update date */
  updatedAt: string;
  /** Description or latest textual update (optional) */
  message?: string;
  /** Link to the incident's detail page (optional) */
  url?: string;
}

/**
 * Structured message entry, used for RSS/Atom feeds
 * and custom adapters with a wildcard on messagePath.
 *
 * Unlike Incidents, MessageEntry items are purely informational
 * and have no severity level of their own.
 */
export interface MessageEntry {
  /** Title of the entry */
  title: string;
  /** Summary or description (optional) */
  summary?: string;
  /** Publication or update date (optional) */
  date?: string;
  /** Link to the detail page (optional) */
  url?: string;
}

/**
 * Status snapshot of a service at a given moment.
 * This is the dashboard's central structure — each polling call
 * produces a StatusSnapshot that is stored in useStatusStore.
 */
export interface StatusSnapshot {
  /** Service ID (corresponds to ServiceConfig.id or SubServiceConfig.id) */
  serviceId: string;
  /** ISO 8601 timestamp of the retrieval */
  timestamp: string;
  /** Status level computed by the adapter */
  level: StatusLevel;
  /** Main message describing the status */
  message: string;
  /** List of active incidents (may be empty) */
  incidents: Incident[];
  /** Structured message entries (RSS, custom wildcard messagePath) */
  entries?: MessageEntry[];
}

/**
 * Result returned by every adapter after parsing the raw response.
 * This is the contract that each adapter must respect.
 */
export interface AdapterResult {
  /** Computed overall status level */
  level: StatusLevel;
  /** Main message (description of the overall status) */
  message: string;
  /** Optional structured entries (RSS, custom wildcard) */
  entries?: MessageEntry[];
  /** List of active incidents */
  incidents: Incident[];
}

/**
 * Text labels per level — used as a fallback if useLevelConfig
 * has not yet loaded the custom configuration.
 */
export const LEVEL_LABELS: Record<StatusLevel, string> = {
  operational: "Operational",
  information: "Information",
  leger: "Degraded",
  mineur: "Minor incident",
  majeur: "Major incident",
  critique: "Critical incident",
  maintenance: "Maintenance",
  inconnu: "Action required",
};

/**
 * Tailwind CSS classes per level for the various display contexts.
 * Each level has 5 variants:
 * - `bg`     : badge/card background
 * - `text`   : text color
 * - `border` : border color
 * - `dot`    : indicator dot color
 * - `banner` : solid colored background for banners
 */
export const LEVEL_COLORS: Record<
  StatusLevel,
  { bg: string; text: string; border: string; dot: string; banner: string }
> = {
  operational: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
    dot: "bg-green-500",
    banner: "bg-green-500 text-white",
  },
  leger: {
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    border: "border-yellow-200",
    dot: "bg-yellow-500",
    banner: "bg-yellow-500 text-white",
  },
  mineur: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
    dot: "bg-orange-500",
    banner: "bg-orange-500 text-white",
  },
  majeur: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    dot: "bg-red-500",
    banner: "bg-red-500 text-white",
  },
  critique: {
    bg: "bg-red-100",
    text: "text-red-950",
    border: "border-red-900",
    dot: "bg-red-950",
    banner: "bg-red-950 text-white",
  },
  maintenance: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    dot: "bg-blue-500",
    banner: "bg-blue-500 text-white",
  },
  information: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200",
    dot: "bg-violet-500",
    banner: "bg-violet-500 text-white",
  },
  inconnu: {
    bg: "bg-gray-50",
    text: "text-gray-500",
    border: "border-gray-200",
    dot: "bg-gray-400",
    banner: "bg-gray-500 text-white",
  },
};

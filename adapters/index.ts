/**
 * @module adapters/index
 *
 * Entry point of the adapter system.
 *
 * An "adapter" is a pure function that receives the raw response of an external API
 * (already parsed from JSON or wrapped in { _raw: string } for XML/HTML)
 * and returns a normalized AdapterResult.
 *
 * This module exposes:
 * - `runAdapter`       : dispatches to the right adapter based on the key
 * - `PRESET_SERVICES`  : pre-configured services available in the quick-add UI
 * - `AdapterKey`       : union type of the valid adapter keys
 */

import type { AdapterResult, CustomMapping } from "~/types";
import { parseGithub } from "./github";
import { parseAtlassian } from "./atlassian";
import { parseAws } from "./aws";
import { parseAzureDevOps } from "./azuredevops";
import { parseRss } from "./rss";
import { parseCustom } from "./custom";
import { parseBloomberg } from "./bloomberg";
import { parsePing } from "./ping";

/**
 * Union of the adapter keys recognized by the system.
 *
 * - `github`     : GitHub Status API (Atlassian format enriched with components)
 * - `atlassian`  : standard Atlassian Statuspage API
 * - `aws`        : AWS Health Dashboard JSON feed
 * - `azuredevops`: Azure DevOps Health API
 * - `rss`        : RSS/Atom feed (returned as { _raw: xml })
 * - `custom`     : custom mapping via CustomMapping
 * - `ping`       : HTTP ping — 2xx = operational, otherwise = error
 * - `auto`       : format auto-detection (falls back to Atlassian)
 */
export type AdapterKey =
  | "github"
  | "atlassian"
  | "aws"
  | "azuredevops"
  | "bloomberg"
  | "rss"
  | "custom"
  | "ping"
  | "auto";

/**
 * Internal registry of the static adapters (without custom mapping).
 * Note: "notion" is an alias of Atlassian because Notion uses the same format.
 */
const ADAPTERS: Record<string, (data: unknown) => AdapterResult> = {
  github: parseGithub,
  atlassian: parseAtlassian,
  notion: parseAtlassian,
  aws: parseAws,
  azuredevops: parseAzureDevOps,
  bloomberg: parseBloomberg,
  rss: parseRss,
  ping: parsePing,
};

/**
 * Selects and runs the right adapter to transform a raw response into an AdapterResult.
 *
 * Dispatch logic:
 * 1. If `adapterKey === "custom"` AND `customMapping` is provided → parseCustom
 * 2. If the key is in the ADAPTERS registry → the corresponding adapter
 * 3. Otherwise (key "auto" or unknown) → attempt auto-detection of the Atlassian format
 * 4. If no format is recognized → return with level "operational" and a warning message
 *
 * @param adapterKey   - Key of the adapter to use (see AdapterKey)
 * @param data         - Raw data returned by the proxy (parsed JSON or { _raw: string })
 * @param customMapping - Custom mapping, required only if adapterKey === "custom"
 * @returns Normalized AdapterResult
 *
 * @example
 * // With a predefined adapter
 * runAdapter('github', githubApiResponse)
 *
 * @example
 * // With a custom adapter
 * runAdapter('custom', apiResponse, {
 *   statusPath: 'data.health',
 *   levelMap: { 'healthy': 'operational', 'degraded': 'mineur' }
 * })
 *
 * @example
 * // In auto mode — attempts to detect the format
 * runAdapter('auto', unknownApiResponse)
 */
export function runAdapter(
  adapterKey: string,
  data: unknown,
  customMapping?: CustomMapping,
): AdapterResult {
  // Case 1: custom adapter with an explicit mapping
  if (adapterKey === "custom" && customMapping) {
    return parseCustom(data, customMapping);
  }

  // Case 2: known static adapter
  const fn = ADAPTERS[adapterKey];
  if (fn) return fn(data);

  // Case 3: auto-detection — if the object has a status.indicator field, it is the Atlassian format
  if (typeof data === "object" && data !== null && "status" in data) {
    const d = data as Record<string, unknown>;
    if (
      typeof d.status === "object" &&
      d.status !== null &&
      "indicator" in d.status
    ) {
      return parseAtlassian(data);
    }
  }

  // Case 4: unrecognized format — we do not throw an error so as to stay non-blocking
  return {
    level: "operational",
    message: "Format non reconnu",
    incidents: [],
  };
}

/**
 * UI metadata for each adapter: label shown in the dropdown + JSON paths
 * used for the mapping preview in ServiceForm.
 * Adding an adapter here is enough to make it visible in the interface.
 */
export interface AdapterMeta {
  value: string
  label: string
  statusPath?: string
  messagePath?: string
  note?: string
}

export const ADAPTER_META: AdapterMeta[] = [
  { value: "github",      label: "GitHub Status",         statusPath: "status.indicator", messagePath: "status.description" },
  { value: "atlassian",   label: "Atlassian / Statuspage", statusPath: "status.indicator", messagePath: "status.description" },
  { value: "aws",         label: "AWS Health",             statusPath: "", note: "Basé sur current_events[] — pas de chemin unique" },
  { value: "azuredevops", label: "Azure DevOps",           statusPath: "status.health",    messagePath: "status.message" },
  { value: "bloomberg",   label: "Bloomberg",              statusPath: "status.indicator", messagePath: "status.description" },
  { value: "rss",         label: "RSS / Atom",             statusPath: "entries.0.title",  messagePath: "entries.0.summary", note: "Flux RSS parsé — chemins sur structure convertie (entries.0.title, entry_count…)" },
  { value: "notion",      label: "Notion",                 statusPath: "status.indicator", messagePath: "status.description" },
  { value: "ping",        label: "Ping HTTP", note: "2xx = opérationnel · 5xx = majeur · 4xx = mineur · timeout = majeur" },
  { value: "custom",      label: "Personnalisé (mapping)" },
  { value: "auto",        label: "Auto-détection" },
]

/**
 * Pre-configured services available in the UI's quick-add form.
 * These objects are used to pre-fill the form with the correct URLs and adapters.
 * The user can customize them before saving.
 */
export const PRESET_SERVICES = [
  {
    name: "GitHub",
    url: "https://www.githubstatus.com/api/v2/summary.json",
    method: "GET" as const,
    adapter: "github",
    headers: {},
  },
  {
    name: "Azure DevOps (Europe)",
    url: "https://status.dev.azure.com/_apis/status/health?geographies=EU&api-version=7.0-preview.1",
    method: "GET" as const,
    adapter: "azuredevops",
    headers: {},
  },
];

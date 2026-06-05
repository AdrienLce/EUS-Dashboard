/**
 * @module adapters/index
 *
 * Point d'entrée du système d'adapters.
 *
 * Un "adapter" est une fonction pure qui reçoit la réponse brute d'une API externe
 * (déjà parsée depuis JSON ou encapsulée dans { _raw: string } pour XML/HTML)
 * et retourne un AdapterResult normalisé.
 *
 * Ce module expose :
 * - `runAdapter`       : dispatch vers le bon adapter selon la clé
 * - `PRESET_SERVICES`  : services pré-configurés disponibles dans l'UI d'ajout rapide
 * - `AdapterKey`       : union type des clés d'adapters valides
 */

import type { AdapterResult, CustomMapping } from "~/types";
import { parseGithub } from "./github";
import { parseAtlassian } from "./atlassian";
import { parseAws } from "./aws";
import { parseAzureDevOps } from "./azuredevops";
import { parseRss } from "./rss";
import { parseCustom } from "./custom";
import { parseBloomberg } from "./bloomberg";

/**
 * Union des clés d'adapters reconnus par le système.
 *
 * - `github`     : GitHub Status API (format Atlassian enrichi avec composants)
 * - `atlassian`  : Atlassian Statuspage API standard
 * - `aws`        : AWS Health Dashboard JSON feed
 * - `azuredevops`: Azure DevOps Health API
 * - `rss`        : Flux RSS/Atom (retourné en { _raw: xml })
 * - `custom`     : Mapping personnalisé via CustomMapping
 * - `auto`       : Auto-détection du format (tente Atlassian en fallback)
 */
export type AdapterKey =
  | "github"
  | "atlassian"
  | "aws"
  | "azuredevops"
  | "bloomberg"
  | "rss"
  | "custom"
  | "auto";

/**
 * Registre interne des adapters statiques (sans mapping personnalisé).
 * Note : "notion" est un alias d'Atlassian car Notion utilise le même format.
 */
const ADAPTERS: Record<string, (data: unknown) => AdapterResult> = {
  github: parseGithub,
  atlassian: parseAtlassian,
  // Notion utilise le format Atlassian Statuspage standard
  notion: parseAtlassian,
  aws: parseAws,
  azuredevops: parseAzureDevOps,
  bloomberg: parseBloomberg,
  rss: parseRss,
};

/**
 * Sélectionne et exécute le bon adapter pour transformer une réponse brute en AdapterResult.
 *
 * Logique de dispatch :
 * 1. Si `adapterKey === "custom"` ET `customMapping` fourni → parseCustom
 * 2. Si la clé est dans le registre ADAPTERS → adapter correspondant
 * 3. Sinon (clé "auto" ou inconnue) → tentative d'auto-détection du format Atlassian
 * 4. Si aucun format reconnu → retour avec level "operational" et message d'avertissement
 *
 * @param adapterKey   - Clé de l'adapter à utiliser (voir AdapterKey)
 * @param data         - Données brutes retournées par le proxy (JSON parsé ou { _raw: string })
 * @param customMapping - Mapping personnalisé, requis uniquement si adapterKey === "custom"
 * @returns AdapterResult normalisé
 *
 * @example
 * // Avec adapter prédéfini
 * runAdapter('github', githubApiResponse)
 *
 * @example
 * // Avec adapter custom
 * runAdapter('custom', apiResponse, {
 *   statusPath: 'data.health',
 *   levelMap: { 'healthy': 'operational', 'degraded': 'mineur' }
 * })
 *
 * @example
 * // En mode auto — tente de détecter le format
 * runAdapter('auto', unknownApiResponse)
 */
export function runAdapter(
  adapterKey: string,
  data: unknown,
  customMapping?: CustomMapping,
): AdapterResult {
  // Cas 1 : adapter custom avec mapping explicite
  if (adapterKey === "custom" && customMapping) {
    return parseCustom(data, customMapping);
  }

  // Cas 2 : adapter statique connu
  const fn = ADAPTERS[adapterKey];
  if (fn) return fn(data);

  // Cas 3 : auto-détection — si l'objet a un champ status.indicator, c'est du format Atlassian
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

  // Cas 4 : format non reconnu — on ne lève pas d'erreur pour rester non-bloquant
  return {
    level: "operational",
    message: "Format non reconnu",
    incidents: [],
  };
}

/**
 * Métadonnées UI de chaque adapter : libellé affiché dans le dropdown + chemins JSON
 * utilisés pour l'aperçu de mapping dans ServiceForm.
 * Ajouter un adapter ici suffit pour le rendre visible dans l'interface.
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
  { value: "custom",      label: "Personnalisé (mapping)" },
  { value: "auto",        label: "Auto-détection" },
]

/**
 * Services pré-configurés disponibles dans le formulaire d'ajout rapide de l'UI.
 * Ces objets sont utilisés pour pré-remplir le formulaire avec les bonnes URL et adapters.
 * L'utilisateur peut les personnaliser avant de les sauvegarder.
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
    name: "AWS",
    url: "https://health.aws.amazon.com/health/status",
    method: "GET" as const,
    adapter: "aws",
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

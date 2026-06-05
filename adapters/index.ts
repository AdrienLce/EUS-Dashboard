import type { AdapterResult, CustomMapping } from "~/types";
import { parseGithub } from "./github";
import { parseAtlassian } from "./atlassian";
import { parseAws } from "./aws";
import { parseAzureDevOps } from "./azuredevops";
import { parseRss } from "./rss";
import { parseCustom } from "./custom";

export type AdapterKey =
  | "github"
  | "atlassian"
  | "aws"
  | "azuredevops"
  | "rss"
  | "custom"
  | "auto";

const ADAPTERS: Record<string, (data: unknown) => AdapterResult> = {
  github: parseGithub,
  atlassian: parseAtlassian,
  notion: parseAtlassian,
  aws: parseAws,
  azuredevops: parseAzureDevOps,
  rss: parseRss,
};

export function runAdapter(
  adapterKey: string,
  data: unknown,
  customMapping?: CustomMapping,
): AdapterResult {
  if (adapterKey === "custom" && customMapping) {
    return parseCustom(data, customMapping);
  }

  const fn = ADAPTERS[adapterKey];
  if (fn) return fn(data);

  // Fallback auto-detect: format Atlassian standard
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

  return {
    level: "operational",
    message: "Format non reconnu",
    incidents: [],
  };
}

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

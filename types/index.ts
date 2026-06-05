export type StatusLevel =
  | "operational"
  | "leger"
  | "mineur"
  | "majeur"
  | "maintenance"
  | "information"
  | "inconnu";

export interface LevelConfig {
  id: StatusLevel
  /** Libellé affiché — personnalisable */
  label: string
  /** Libellé de référence — non modifiable, rappelle la sémantique du niveau */
  reference: string
  color: string // hex, ex: "#22c55e"
}

export const DEFAULT_LEVEL_CONFIGS: LevelConfig[] = [
  { id: 'operational',  label: 'Opérationnel',       reference: 'Tout fonctionne normalement',         color: '#22c55e' },
  { id: 'information',  label: 'Information',         reference: 'Message informatif sans impact',      color: '#8b5cf6' },
  { id: 'leger',        label: 'Légère perturbation', reference: 'Dégradation partielle non critique',  color: '#eab308' },
  { id: 'mineur',       label: 'Incident mineur',     reference: 'Impact partiel sur le service',       color: '#f97316' },
  { id: 'majeur',       label: 'Incident majeur',     reference: 'Interruption ou impact fort',         color: '#ef4444' },
  { id: 'maintenance',  label: 'Maintenance',         reference: 'Maintenance planifiée ou en cours',   color: '#3b82f6' },
  { id: 'inconnu',      label: 'Action requise',      reference: 'Statut indéterminé / auth manquante', color: '#9ca3af' },
]

export type HttpMethod = "GET" | "POST";

export interface CustomMapping {
  statusPath: string;
  messagePath?: string;
  levelMap: Record<string, StatusLevel>;
}

export type PreDetectionSource = 'reddit' | 'hn' | 'downdetector'

export interface PreDetectionConfig {
  enabled: boolean
  source: PreDetectionSource
  /** Reddit: nom du subreddit (ex: "github") · HN: terme de recherche · DD: URL complète */
  target: string
  /** Mots-clés supplémentaires (défaut: "down outage not working") */
  keywords?: string
  /** Reddit/HN: nb de posts · DownDetector: nb signalements (défaut: 100) */
  threshold: number
}

/** @deprecated Alias pour rétro-compatibilité */
export type DownDetectorConfig = PreDetectionConfig

export interface ServiceConfig {
  id: string;
  name: string;
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
  adapter: string;
  customMapping?: CustomMapping;
  preDetection?: PreDetectionConfig;
  group?: string;
  pollInterval: number; // secondes, max 120
  enabled: boolean;
  createdAt: string;
}

export interface SubServiceConfig {
  id: string;
  name: string;
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
  adapter: string;
  customMapping?: CustomMapping;
  enabled: boolean;
}

export interface CompositeServiceConfig {
  id: string;
  type: "composite";
  name: string;
  group?: string;
  enabled: boolean;
  createdAt: string;
  pollInterval: number;
  children: SubServiceConfig[];
}

export const LEVEL_ORDER: StatusLevel[] = [
  "operational",
  "inconnu",
  "information",
  "maintenance",
  "leger",
  "mineur",
  "majeur",
];

export function worstLevel(levels: StatusLevel[]): StatusLevel {
  return levels.reduce<StatusLevel>((worst, l) => {
    return LEVEL_ORDER.indexOf(l) > LEVEL_ORDER.indexOf(worst) ? l : worst;
  }, "operational");
}

export interface Incident {
  id: string;
  title: string;
  level: StatusLevel;
  startedAt: string;
  updatedAt: string;
  message?: string;
  url?: string;
}

export interface MessageEntry {
  title: string;
  summary?: string;
  date?: string;
  url?: string;
}

export interface StatusSnapshot {
  serviceId: string;
  timestamp: string;
  level: StatusLevel;
  message: string;
  incidents: Incident[];
  entries?: MessageEntry[];
  /** true si DownDetector a détecté des signalements élevés ALORS QUE le statut réel est opérationnel */
  preDetected?: boolean
  preDetectedCount?: number
}

export interface AdapterResult {
  level: StatusLevel;
  message: string;
  entries?: MessageEntry[];
  incidents: Incident[];
}

export const LEVEL_LABELS: Record<StatusLevel, string> = {
  operational: "Opérationnel",
  information: "Information",
  leger: "Légère perturbation",
  mineur: "Incident mineur",
  majeur: "Incident majeur",
  maintenance: "Maintenance",
  inconnu: "Action requise",
};

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

/**
 * @module types
 *
 * Définitions TypeScript centrales du tableau de bord de statut.
 *
 * Ce module exporte :
 * - Les types de niveaux de statut (StatusLevel) et leur ordre de sévérité
 * - Les interfaces de configuration (ServiceConfig, CompositeServiceConfig, etc.)
 * - Les interfaces de résultat (AdapterResult, StatusSnapshot, Incident, MessageEntry)
 * - Les constantes de couleurs et libellés par niveau
 * - La fonction utilitaire worstLevel
 */

/**
 * Les 7 niveaux de statut possibles, du plus bénin au plus grave.
 *
 * - `operational`  : tout fonctionne normalement
 * - `information`  : message informatif sans impact sur le service
 * - `leger`        : dégradation partielle non critique
 * - `mineur`       : impact partiel sur le service
 * - `majeur`       : interruption ou impact fort
 * - `maintenance`  : maintenance planifiée ou en cours
 * - `inconnu`      : statut indéterminé, souvent dû à une auth manquante
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
 * Configuration d'affichage d'un niveau de statut.
 *
 * Chaque niveau dispose d'un libellé personnalisable (`label`) et d'un libellé
 * de référence immuable (`reference`) qui rappelle la sémantique exacte du niveau.
 * La distinction est importante : l'utilisateur peut renommer "Incident majeur"
 * en "Panne totale" sans perdre la sémantique encodée dans `reference`.
 */
export interface LevelConfig {
  /** Identifiant technique immuable du niveau */
  id: StatusLevel
  /** Libellé affiché dans l'UI — personnalisable par l'utilisateur */
  label: string
  /** Libellé de référence — non modifiable, rappelle la sémantique du niveau */
  reference: string
  /** Couleur hexadécimale, ex: "#22c55e" — utilisée pour générer les styles CSS */
  color: string
}

/**
 * Configurations par défaut des 7 niveaux de statut.
 * Utilisées comme valeur initiale et comme fallback si un niveau est absent
 * de la configuration personnalisée de l'utilisateur.
 */
export const DEFAULT_LEVEL_CONFIGS: LevelConfig[] = [
  { id: 'operational',  label: 'Opérationnel',       reference: 'Tout fonctionne normalement',         color: '#22c55e' },
  { id: 'information',  label: 'Information',         reference: 'Message informatif sans impact',      color: '#8b5cf6' },
  { id: 'leger',        label: 'Légère perturbation', reference: 'Dégradation partielle non critique',  color: '#eab308' },
  { id: 'mineur',       label: 'Incident mineur',     reference: 'Impact partiel sur le service',       color: '#f97316' },
  { id: 'majeur',       label: 'Incident majeur',     reference: 'Interruption ou impact fort',         color: '#ef4444' },
  { id: 'critique',     label: 'Incident critique',   reference: 'Panne totale ou interruption critique', color: '#7f1d1d' },
  { id: 'maintenance',  label: 'Maintenance',         reference: 'Maintenance planifiée ou en cours',   color: '#3b82f6' },
  { id: 'inconnu',      label: 'Action requise',      reference: 'Statut indéterminé / auth manquante', color: '#9ca3af' },
]

/** Méthode HTTP autorisée pour les requêtes de polling */
export type HttpMethod = "GET" | "POST";

/**
 * Mapping personnalisé pour l'adapter `custom`.
 *
 * Permet de pointer vers n'importe quelle valeur dans un JSON arbitraire
 * via une notation pointée et de la convertir en StatusLevel.
 *
 * @example
 * // JSON cible: { "health": { "status": "degraded" } }
 * const mapping: CustomMapping = {
 *   statusPath: 'health.status',
 *   levelMap: { 'degraded': 'mineur', 'healthy': 'operational' }
 * }
 *
 * @example
 * // JSON cible avec tableau: { "services": [{ "name": "API", "state": "outage" }] }
 * const mapping: CustomMapping = {
 *   statusPath: 'services.*.state',  // wildcard * = itère le tableau
 *   messagePath: 'services.*.name',
 *   levelMap: { 'outage': 'majeur', 'operational': 'operational' }
 * }
 */
export interface CustomMapping {
  /**
   * Chemin vers la valeur de statut dans le JSON, en notation pointée.
   * Supporte les wildcards `*` pour itérer sur des tableaux.
   * Exemples : `"status"`, `"data.health"`, `"components.*.status"`
   */
  statusPath: string;
  /**
   * Chemin vers le texte descriptif du statut (optionnel).
   * Si absent, `statusPath` est utilisé comme message.
   * Avec wildcard, toutes les valeurs sont jointes par `\n`.
   */
  messagePath?: string;
  /**
   * Table de correspondance valeur → niveau de statut.
   * Supporte 4 syntaxes de pattern (voir matchLevelMap dans custom.ts) :
   * - Exact    : `"none"` → opérationnel
   * - Wildcard : `"healthy*"` → toute valeur commençant par "healthy"
   * - Contains : `"~advisory"` → toute valeur contenant "advisory"
   * - Regex    : `"/^(none|healthy)$/i"` → expression régulière avec flags
   *
   * Sert aussi à mapper le niveau de chaque incident (via `incidentLevelPath`).
   */
  levelMap: Record<string, StatusLevel>;
  /**
   * Chemin vers le tableau d'incidents dans la réponse, en notation pointée.
   * Quand il est défini, les incidents sont extraits explicitement de ce tableau
   * (au même titre que `statusPath`/`messagePath`), indépendamment du wildcard de statut.
   * Exemples : `"incidents"`, `"result.incidents"`, `"data.events"`.
   */
  incidentsPath?: string;
  /**
   * Champ du titre de l'incident, relatif à chaque élément de `incidentsPath`.
   * Si absent : détection auto parmi `title`, `name`, `headline`, `summary`.
   * Exemples : `"name"`, `"title"`.
   */
  incidentTitlePath?: string;
  /**
   * Champ du niveau/impact de l'incident, relatif à chaque élément de `incidentsPath`.
   * La valeur est convertie via `levelMap` (puis auto-détection en secours).
   * Si absent : détection auto parmi `level`, `impact`, `severity`, `status`.
   * Exemples : `"impact"`, `"status"`.
   */
  incidentLevelPath?: string;
  /**
   * Champ du message/description de l'incident, relatif à chaque élément de `incidentsPath`.
   * Supporte les sous-chemins (ex: `"incident_updates.0.body"`).
   * Si absent : détection auto parmi `body`, `description`, `message`, `summary`.
   */
  incidentMessagePath?: string;
}


/**
 * Configuration complète d'un service à surveiller.
 *
 * Un service est une URL externe interrogée à intervalle régulier.
 * La réponse est transformée par un adapter en StatusSnapshot.
 */
export interface ServiceConfig {
  /** UUID généré à la création */
  id: string;
  /** Nom affiché dans le tableau de bord */
  name: string;
  /** URL de l'API de statut à interroger */
  url: string;
  /** Méthode HTTP (GET dans la grande majorité des cas) */
  method: HttpMethod;
  /** En-têtes HTTP supplémentaires (ex: Authorization, API keys) */
  headers: Record<string, string>;
  /** Corps de la requête (POST uniquement) */
  body?: string;
  /**
   * Clé de l'adapter à utiliser pour parser la réponse.
   * Valeurs possibles : "github", "atlassian", "aws", "azuredevops", "rss", "custom", "auto"
   */
  adapter: string;
  /** Mapping personnalisé — requis si adapter === "custom" */
  customMapping?: CustomMapping;
  /** Nom du groupe d'affichage (optionnel, pour regrouper visuellement) */
  group?: string;
  /** Intervalle de polling en secondes (1–20 min) */
  pollInterval: number;
  /** Active ou désactive ce service */
  enabled: boolean;
  /** Date de création ISO 8601 */
  createdAt: string;
}

/**
 * Configuration d'un sous-service appartenant à un service composite.
 *
 * Similaire à ServiceConfig mais sans `group`, `pollInterval`, `createdAt`
 * L'adapter et le mapping peuvent hériter des valeurs `defaultAdapter`/`defaultMapping`
 * du composite parent si non spécifiés ici.
 */
export interface SubServiceConfig {
  /** UUID généré à la création */
  id: string;
  /** Nom affiché pour ce sous-service */
  name: string;
  /** URL de l'API de statut */
  url: string;
  /** Méthode HTTP */
  method: HttpMethod;
  /** En-têtes HTTP supplémentaires */
  headers: Record<string, string>;
  /** Corps de la requête (POST uniquement) */
  body?: string;
  /**
   * Adapter à utiliser. Si vide ou "auto" ET que le composite a un `defaultAdapter`,
   * c'est le `defaultAdapter` du composite qui est utilisé.
   */
  adapter: string;
  /**
   * Mapping personnalisé spécifique à cet enfant.
   * Si absent, hérite du `defaultMapping` du composite parent.
   */
  customMapping?: CustomMapping;
  /** Active ou désactive ce sous-service */
  enabled: boolean;
}

/**
 * Configuration d'un service composite (groupe de sous-services).
 *
 * Un composite agrège plusieurs URL sous un même service logique.
 * Chaque enfant est polléé indépendamment mais au même intervalle.
 * Le niveau global du composite est le pire niveau parmi ses enfants actifs.
 */
export interface CompositeServiceConfig {
  /** UUID généré à la création */
  id: string;
  /** Discriminant de type — toujours "composite" */
  type: "composite";
  /** Nom affiché dans le tableau de bord */
  name: string;
  /** Nom du groupe d'affichage (optionnel) */
  group?: string;
  /** Active ou désactive ce composite et tous ses enfants */
  enabled: boolean;
  /** Date de création ISO 8601 */
  createdAt: string;
  /** Intervalle de polling en secondes partagé par tous les enfants (1–20 min) */
  pollInterval: number;
  /** Liste des sous-services à surveiller */
  children: SubServiceConfig[];
  /** Adapter appliqué à tous les enfants qui n'ont pas de config d'adapter propre */
  defaultAdapter?: string;
  /** Mapping appliqué à tous les enfants qui n'ont pas de customMapping propre */
  defaultMapping?: CustomMapping;
}

/**
 * Ordre de sévérité des niveaux, du moins grave au plus grave.
 * Utilisé par `worstLevel` pour comparer deux niveaux.
 *
 * Note : `inconnu` est placé juste après `operational` car il signifie
 * "on ne sait pas" plutôt que "c'est cassé".
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
 * Retourne le niveau le plus grave parmi une liste de niveaux.
 * Utilisé pour calculer le niveau global d'un service composite
 * ou d'un adapter avec wildcard sur plusieurs composants.
 *
 * @param levels - Tableau de niveaux à comparer
 * @returns Le niveau ayant l'index le plus élevé dans LEVEL_ORDER
 *
 * @example
 * worstLevel(['operational', 'mineur', 'leger']) // → 'mineur'
 * worstLevel(['operational', 'operational'])      // → 'operational'
 * worstLevel([])                                  // → 'operational' (valeur par défaut)
 */
export function worstLevel(levels: StatusLevel[]): StatusLevel {
  return levels.reduce<StatusLevel>((worst, l) => {
    return LEVEL_ORDER.indexOf(l) > LEVEL_ORDER.indexOf(worst) ? l : worst;
  }, "operational");
}

/**
 * Un incident en cours ou résolu sur un service.
 * Les incidents sont affichés dans le détail d'un service.
 */
export interface Incident {
  /** Identifiant unique de l'incident (souvent fourni par la source) */
  id: string;
  /** Titre court de l'incident */
  title: string;
  /** Niveau de sévérité de cet incident */
  level: StatusLevel;
  /** Date de début ISO 8601 */
  startedAt: string;
  /** Date de dernière mise à jour ISO 8601 */
  updatedAt: string;
  /** Description ou dernière mise à jour textuelle (optionnel) */
  message?: string;
  /** Lien vers la page de détail de l'incident (optionnel) */
  url?: string;
}

/**
 * Entrée de message structurée, utilisée pour les flux RSS/Atom
 * et les adapters custom avec wildcard sur messagePath.
 *
 * Contrairement aux Incidents, les MessageEntry sont purement informatives
 * et n'ont pas de niveau de sévérité propre.
 */
export interface MessageEntry {
  /** Titre de l'entrée */
  title: string;
  /** Résumé ou description (optionnel) */
  summary?: string;
  /** Date de publication ou de mise à jour (optionnel) */
  date?: string;
  /** Lien vers la page de détail (optionnel) */
  url?: string;
}

/**
 * Snapshot de statut d'un service à un instant donné.
 * C'est la structure centrale du tableau de bord — chaque appel de polling
 * produit un StatusSnapshot qui est stocké dans useStatusStore.
 */
export interface StatusSnapshot {
  /** ID du service (correspond à ServiceConfig.id ou SubServiceConfig.id) */
  serviceId: string;
  /** Horodatage ISO 8601 de la récupération */
  timestamp: string;
  /** Niveau de statut calculé par l'adapter */
  level: StatusLevel;
  /** Message principal décrivant le statut */
  message: string;
  /** Liste des incidents actifs (peut être vide) */
  incidents: Incident[];
  /** Entrées de messages structurés (RSS, custom wildcard messagePath) */
  entries?: MessageEntry[];
}

/**
 * Résultat retourné par tout adapter après parsing de la réponse brute.
 * C'est le contrat que chaque adapter doit respecter.
 */
export interface AdapterResult {
  /** Niveau de statut global calculé */
  level: StatusLevel;
  /** Message principal (description du statut global) */
  message: string;
  /** Entrées structurées optionnelles (RSS, custom wildcard) */
  entries?: MessageEntry[];
  /** Liste des incidents actifs */
  incidents: Incident[];
}

/**
 * Libellés textuels par niveau — utilisés comme fallback si useLevelConfig
 * n'a pas encore chargé la configuration personnalisée.
 */
export const LEVEL_LABELS: Record<StatusLevel, string> = {
  operational: "Opérationnel",
  information: "Information",
  leger: "Légère perturbation",
  mineur: "Incident mineur",
  majeur: "Incident majeur",
  critique: "Incident critique",
  maintenance: "Maintenance",
  inconnu: "Action requise",
};

/**
 * Classes CSS Tailwind par niveau pour les différents contextes d'affichage.
 * Chaque niveau dispose de 5 variantes :
 * - `bg`     : fond du badge/carte
 * - `text`   : couleur du texte
 * - `border` : couleur de la bordure
 * - `dot`    : couleur du point indicateur
 * - `banner` : fond coloré plein pour les bandeaux
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

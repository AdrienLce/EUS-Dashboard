# Dashboard Concentrateur de Statut

Tableau de bord auto-hébergé pour surveiller l'état opérationnel de vos services et APIs tierces. Agrège les pages de statut officielles (GitHub, AWS, Azure DevOps, Atlassian, flux RSS...) et vos propres APIs internes en un seul endroit, avec détection automatique des incidents avant qu'ils remontent officiellement.

Construit avec **Nuxt 3** (SSR + Nitro), **Vue 3** et **TailwindCSS**. Conçu pour tourner sur un VPS ou en Docker — pas sur Vercel ni Netlify (le storage serveur Nitro nécessite un système de fichiers persistant).

---

## Table des matières

1. [Présentation](#présentation)
2. [Fonctionnalités](#fonctionnalités)
3. [Architecture technique](#architecture-technique)
4. [Le système d'adaptateurs](#le-système-dadaptateurs)
5. [Le mapping personnalisé](#le-mapping-personnalisé)
6. [Services composites](#services-composites)
7. [Niveaux de statut](#niveaux-de-statut)
8. [Pré-détection communautaire](#pré-détection-communautaire)
9. [Déploiement](#déploiement)
10. [Développement — Ajouter un nouvel adapter](#développement--ajouter-un-nouvel-adapter)

---

## Présentation

Le problème que ce projet résout : quand on maintient une infrastructure ou un produit, on surveille souvent une dizaine de pages de statut différentes (GitHub est-il en panne ? AWS eu-west-1 ? Notre Jira ?). Chaque page a son propre format, ses propres codes de statut, et il faut ouvrir plusieurs onglets pour avoir une vue consolidée.

Ce dashboard interroge ces APIs à intervalles réguliers via un proxy côté serveur (pour contourner les restrictions CORS et ne jamais exposer vos clés d'API au navigateur), normalise les résultats en 7 niveaux de sévérité communs, et affiche tout dans une interface unifiée.

Pour les services qui n'ont pas d'API de statut formelle — ou dont la page de statut est notoirement en retard sur la réalité — le module de **pré-détection communautaire** interroge Reddit, HackerNews et DownDetector pour détecter les signalements avant l'annonce officielle.

---

## Fonctionnalités

- **Adapters intégrés** pour GitHub, Atlassian Statuspage (et tout service sur statuspage.io), AWS Health, Azure DevOps, et tout flux RSS/Atom
- **Adapter custom** : mapper n'importe quelle API JSON ou XML avec une configuration visuelle (pas de code)
- **Mode auto** : détection automatique du format Atlassian pour les services hébergés sur statuspage.io
- **Services composites** : regrouper plusieurs URLs sous un même service logique (ex: toutes les régions d'un cloud)
- **Héritage de configuration** sur les composites (adapter et mapping par défaut partagés par les enfants)
- **Pré-détection communautaire** via Reddit, HackerNews et DownDetector
- **7 niveaux de statut** avec libellés et couleurs entièrement personnalisables
- **Historique de statut** par service (50 derniers changements d'état, stocké dans localStorage)
- **Explorateur JSON interactif** : cliquer sur un nœud de la réponse API pour en faire le statusPath ou messagePath
- **Mapping RSS/Atom** : les flux XML sont convertis en arbre JSON navigable avant le mapping custom
- **Persistance serveur** via Nitro fs storage avec migration automatique depuis localStorage
- **Polling configurable** par service (5–120 secondes), scheduler centralisé à timer unique
- **Mode compact** : vue dense multi-colonnes pour surveiller de nombreux services
- **Drag-and-drop** pour réordonner les services et sous-services
- **Groupes** : organiser les services par section
- **Configuration partagée** : tous les utilisateurs du même déploiement voient la même configuration

---

## Architecture technique

### Le cycle complet

Voici le chemin parcouru par une donnée depuis l'API externe jusqu'à l'affichage :

```
API externe (GitHub, AWS, votre API...)
     │
     │  CORS bloqué côté navigateur → on passe par le proxy
     ▼
POST /api/proxy  (Nitro server route)
     │  - Valide l'URL (protection anti-SSRF)
     │  - Ajoute les headers configurés (Authorization, User-Agent...)
     │  - Fetch côté serveur (pas de contrainte CORS)
     │  - JSON → retourné tel quel
     │  - XML/HTML → retourné dans { _raw: "..." }
     ▼
runAdapter(adapterKey, data, customMapping?)
     │  - Dispatch vers le bon adapter selon la clé
     │  - Transforme la réponse brute en AdapterResult
     │  - AdapterResult = { level, message, incidents[], entries? }
     ▼
checkPreDetection(snapshot, preDetectionConfig?)
     │  - Si statut opérationnel ET pré-détection activée
     │  - Interroge Reddit / HN / DownDetector via /api/proxy
     │  - Enrichit le snapshot si le seuil est atteint
     ▼
pushSnapshot(snapshot)  ← useStatusStore
     │  - Met à jour currentStatus[serviceId] (temps réel)
     │  - Ajoute à history[serviceId] SI le niveau ou message a changé
     │  - Persiste l'historique dans localStorage
     ▼
UI Vue réactive
     └── Les composants lisent currentStatus et history
```

### Pourquoi un proxy serveur ?

Deux raisons fondamentales.

**CORS** : les APIs tierces (GitHub, AWS...) n'autorisent pas les requêtes directes depuis un navigateur vers leur domaine. En passant par Nitro côté serveur, on n'est pas soumis à cette restriction — le serveur peut appeler n'importe quelle API externe.

**Sécurité des credentials** : si vous configurez un header `Authorization: Bearer mon-token-secret`, ce token ne transite jamais dans le navigateur. Il est stocké dans le Nitro storage (côté serveur) et injecté par le proxy à chaque requête. Un utilisateur qui inspecte le trafic réseau de son navigateur ne voit que des appels à `/api/proxy`, jamais l'API externe avec les credentials.

**Protection anti-SSRF** : le proxy bloque explicitement les appels vers `localhost`, `127.0.0.1`, et les plages RFC 1918 (`10.*`, `192.168.*`) pour éviter qu'un attaquant puisse utiliser le proxy comme relais pour interroger des services internes réseau.

### Le scheduler centralisé

Au lieu de créer un `setInterval` par service surveillé (N services = N timers système), l'application utilise un **scheduler singleton** avec un seul timer global de 5 secondes.

```
masterTimer (unique, setInterval 5s)
     │
     ▼  tick() exécuté toutes les 5s
     ├── Task "service-abc"              nextDue dans 25s  → skip
     ├── Task "service-xyz"              nextDue dépassé   → execute() + nextDue = now + 30s
     ├── Task "composite-1::child-api"   nextDue dépassé   → execute()
     └── Task "composite-1::child-db"    nextDue dans 10s  → skip
```

Chaque tâche stocke son `intervalMs` et son `nextDue` (timestamp). À chaque tick, les tâches dont l'échéance est passée sont exécutées. Quand plus aucune tâche n'est active, le timer global est arrêté.

Les enfants d'un composite sont identifiés par des clés préfixées `"compositeId::childId"`. Cela permet de supprimer tous les enfants d'un composite en une seule opération (`unschedulePrefix("compositeId::")`).

Toute tâche planifiée est aussi **exécutée immédiatement** à son enregistrement, ce qui évite d'attendre un intervalle complet avant d'afficher la première donnée.

### Le stockage serveur

La configuration (services, composites, ordre d'affichage, niveaux personnalisés) est persistée via le **Nitro fs storage** dans le répertoire `.data/` de l'application. Ce répertoire survive aux redémarrages et aux redéploiements (monter comme volume Docker en production).

```
.data/kv/config/
├── services.json    ← liste des ServiceConfig[]
├── composites.json  ← liste des CompositeServiceConfig[]
├── order.json       ← ordre d'affichage (string[] d'IDs)
└── levels.json      ← configuration des niveaux (LevelConfig[])
```

**Migration automatique** : si le serveur démarre avec un storage vide mais que l'utilisateur a déjà des données dans localStorage (ancienne installation sans serveur, ou mode développement local), la migration est déclenchée automatiquement. Les données localStorage sont copiées vers le serveur en arrière-plan, de manière transparente.

**Fallback offline** : si le serveur Nitro est temporairement inaccessible, l'application utilise les données localStorage comme source de vérité. Les modifications en mode offline ne sont pas propagées au serveur — un rechargement de page après retour du serveur resynchronise.

Les sauvegardes sont **partielles** : `save('services')` n'envoie au serveur que le tableau des services, sans toucher aux composites ni à l'ordre. Cela évite les conflits si deux onglets modifient des parties différentes de la configuration simultanément.

---

## Le système d'adaptateurs

### Qu'est-ce qu'un adapter ?

Un adapter est une **fonction pure** qui prend la réponse brute d'une API (déjà récupérée par le proxy) et retourne un `AdapterResult` normalisé. Il ne fait aucun appel réseau.

```typescript
// Contrat que tout adapter doit respecter
interface AdapterResult {
  level: StatusLevel       // niveau de sévérité global
  message: string          // description textuelle du statut
  incidents: Incident[]    // liste des incidents actifs (peut être vide)
  entries?: MessageEntry[] // entrées structurées optionnelles (RSS, custom wildcard)
}
```

### Adapters intégrés

| Clé | Service cible | Notes |
|---|---|---|
| `github` | GitHub Status | Format Atlassian enrichi avec `components[]` |
| `atlassian` | Tout service sur statuspage.io | Format standard Atlassian Statuspage |
| `notion` | Notion Status | Alias de `atlassian` (même format) |
| `aws` | AWS Health Dashboard | Statuts en texte libre ("Service is operating normally") |
| `azuredevops` | Azure DevOps Health API | Santé par service et par zone géographique |
| `rss` | Tout flux RSS 2.0 ou Atom 1.0 | Détection du niveau par mots-clés dans les titres |
| `custom` | N'importe quelle API | Piloté par un `CustomMapping` (voir section suivante) |
| `auto` | Inconnu | Tente la détection Atlassian, sinon retourne `operational` |

### Formats JSON attendus

**GitHub** — URL : `https://www.githubstatus.com/api/v2/summary.json`
```json
{
  "status": { "indicator": "none", "description": "All Systems Operational" },
  "components": [{ "name": "Git Operations", "status": "operational" }],
  "incidents": []
}
```

**Atlassian Statuspage** — URL type : `https://[service].statuspage.io/api/v2/summary.json`
```json
{
  "status": { "indicator": "minor", "description": "Degraded Performance" },
  "incidents": [{
    "id": "abc123", "name": "API Latency", "impact": "minor",
    "shortlink": "https://stspg.io/abc",
    "created_at": "2024-01-15T10:00:00Z", "updated_at": "2024-01-15T10:30:00Z",
    "incident_updates": [{ "body": "We are investigating...", "updated_at": "..." }]
  }]
}
```

Mapping `indicator`/`impact` Atlassian → niveaux :

| Valeur Atlassian | Niveau dashboard |
|---|---|
| `none` | `operational` |
| `minor` | `leger` |
| `major` | `mineur` |
| `critical` | `majeur` |
| `maintenance` | `maintenance` |

**AWS Health** — URL : `https://health.aws.amazon.com/health/status`
```json
{
  "current_events": [{
    "service_name": "Amazon EC2",
    "summary": "Increased error rates in EU-WEST-1",
    "status": "Service degradation",
    "date": "2024-01-15T10:00:00Z",
    "url": "https://health.aws.amazon.com/..."
  }]
}
```
Si `current_events` est vide, le niveau est `operational`. Sinon, le niveau global est le pire niveau parmi les événements.

**Azure DevOps** — URL : `https://status.dev.azure.com/_apis/status/health?geographies=EU`
```json
{
  "status": { "health": "healthy", "message": "Azure DevOps is healthy" },
  "services": [{
    "id": "Boards", "displayName": "Boards",
    "geographies": [{ "id": "EU", "name": "West Europe", "health": "healthy" }],
    "issues": []
  }]
}
```
L'adapter détecte deux types d'incidents : les issues explicites (`services[].issues[]`) et les géographies non-saines sans issue formelle (`services[].geographies[]` avec `health !== "healthy"`).

**RSS/Atom** : le proxy retourne `{ _raw: "<?xml version..." }`. L'adapter parse le XML, extrait les balises `<entry>` (Atom) et `<item>` (RSS), et déduit le niveau depuis les titres (mots-clés : "resolved", "outage", "critical", "degraded", "maintenance"...).

---

## Le mapping personnalisé

L'adapter `custom` permet de surveiller **n'importe quelle API JSON** (ou RSS/Atom) sans écrire de code TypeScript. Il se configure avec trois champs.

### Les trois champs

| Champ | Rôle | Requis |
|---|---|---|
| `statusPath` | Chemin vers la valeur de statut dans le JSON | Oui |
| `messagePath` | Chemin vers la description textuelle | Non (utilise statusPath si absent) |
| `levelMap` | Table de correspondance valeur → niveau | Oui |

### Notation pointée (dot-notation)

Chaque segment du chemin est séparé par un point et correspond à une clé de l'objet JSON. Les indices numériques accèdent aux éléments d'un tableau.

```
JSON:  { "data": { "health": { "status": "degraded" } } }
Path:  "data.health.status"   →  "degraded"

JSON:  { "services": ["api", "db", "cache"] }
Path:  "services.1"           →  "db"
```

### Opérateur wildcard `*`

Le `*` dans un chemin signifie "tous les éléments du tableau". C'est la fonctionnalité la plus puissante du mapping.

**Sur `statusPath`** : le niveau global retourné est le **pire niveau** parmi tous les éléments du tableau.
```
JSON:        { "components": [{ "status": "operational" }, { "status": "degraded" }] }
statusPath:  "components.*.status"
Résultat:    niveau "mineur" (pire des deux)
```

**Sur `messagePath`** : toutes les valeurs sont jointes par `\n` pour former le message descriptif.
```
messagePath: "components.*.name"
Résultat:    message = "API Gateway\nBase de données\nCache"
```

**Combinés avec wildcard dans les deux chemins** : chaque item du tableau génère un **Incident** individuel dans la liste.
```
statusPath:  "components.*.status"  → valeur = titre + niveau de l'incident
messagePath: "components.*.name"    → valeur = message de l'incident
```

**`messagePath` seul avec wildcard** (sans wildcard dans statusPath) : génère des **MessageEntry** informatives, sans niveau de sévérité.
```
statusPath:  "overall_status"        (scalaire → un seul niveau global)
messagePath: "entries.*.summary"     (wildcard → liste de textes informatifs)
```

### Les 4 syntaxes de pattern dans `levelMap`

Les clés de `levelMap` supportent 4 syntaxes de correspondance, évaluées dans l'ordre de déclaration. La première correspondance gagne.

#### 1. Exact (insensible à la casse)
```json
{ "none": "operational", "HEALTHY": "operational" }
```
Correspond exactement à `"none"` ou `"healthy"` (et leurs variations de casse).

#### 2. Wildcard avec `*`
```json
{ "healthy*": "operational", "*-ok": "operational" }
```
Le `*` remplace n'importe quelle séquence de caractères.
- `"healthy*"` correspond à : `"healthy"`, `"healthy_partial"`, `"healthy-with-warning"`
- `"*-ok"` correspond à : `"api-ok"`, `"db-ok"`, `"all-systems-ok"`

#### 3. Contains avec `~`
```json
{ "~advisory": "leger", "~outage": "majeur" }
```
La valeur doit **contenir** la sous-chaîne spécifiée après `~`.
- `"~advisory"` correspond à : `"service advisory"`, `"Advisory: partial impact"`, `"ADVISORY NOTICE"`

#### 4. Regex avec `/pattern/flags`
```json
{
  "/^(none|healthy)$/i": "operational",
  "/partial_outage|degraded_performance/": "mineur",
  "/critical|down/i": "majeur"
}
```
Expression régulière JavaScript complète avec flags optionnels après le `/` final.

#### Exemple complet de levelMap

Pour une API dont les statuts peuvent être variés et imprévisibles :
```json
{
  "levelMap": {
    "none": "operational",
    "healthy*": "operational",
    "/^all.*operational$/i": "operational",
    "~advisory": "leger",
    "~warning": "leger",
    "~degraded": "mineur",
    "partial_outage": "mineur",
    "~outage": "majeur",
    "~disruption": "majeur",
    "/critical|down/i": "majeur",
    "~maintenance": "maintenance"
  }
}
```

Si aucun pattern ne correspond, le dashboard applique une **détection automatique** par mots-clés communs (anglais et français) : "healthy/operational/ok" → operational, "partial/advisory" → leger, "degraded" → mineur, "outage/critical" → majeur, "maintenance" → maintenance.

### L'explorateur JSON interactif

Après avoir renseigné l'URL dans le formulaire, cliquer sur **Tester** affiche la réponse sous forme d'arbre JSON navigable. Cliquer sur n'importe quelle valeur feuille ouvre un popup :

- **Utiliser comme statut** → copie le chemin vers ce nœud dans `statusPath` et propose d'ajouter la valeur dans `levelMap`
- **Utiliser comme message** → copie le chemin dans `messagePath`
- Si la valeur est dans un tableau (ex: `entries.0.title`) : propose aussi le chemin wildcard (`entries.*.title`) et le chemin item complet (`entries.*`)

Cela évite d'avoir à écrire manuellement les chemins pointés.

### RSS/Atom : fonctionnement du mapping

Quand le proxy retourne un `{ _raw: "<?xml..." }` avec l'adapter `custom`, le module détecte automatiquement le XML et le convertit en objet JSON structuré **avant** d'appliquer le mapping. C'est cet objet JSON qui est visible dans l'explorateur interactif :

```json
{
  "feed_title": "Mon Service Status",
  "feed_updated": "2024-01-15T10:00:00Z",
  "entry_count": 3,
  "entries": [
    {
      "title": "Incident on API Gateway",
      "summary": "We are investigating elevated error rates.",
      "updated": "2024-01-15T10:00:00Z",
      "link": "https://status.example.com/incidents/123"
    }
  ]
}
```

Vous pouvez alors mapper :
- `statusPath: "entries.*.title"` → le pire titre détermine le niveau global
- `messagePath: "entries.*.summary"` → les résumés comme textes descriptifs

La conversion RSS → JSON supporte à la fois Atom 1.0 (`<entry>`, `<summary>`, `<updated>`, `<link href>`) et RSS 2.0 (`<item>`, `<description>`, `<pubDate>`, `<link>`), ainsi que les sections CDATA.

---

## Services composites

Un service composite regroupe plusieurs URLs sous un **service logique unique**. Toutes les URLs sont interrogées au même intervalle et chaque enfant produit son propre snapshot de statut.

### Cas d'usage typiques

- Surveiller plusieurs régions d'un cloud provider sous une seule carte
- Agréger des microservices d'une même application
- Regrouper des environnements distincts (staging + production) pour comparaison

### Héritage de configuration

Un composite peut définir un `defaultAdapter` et un `defaultMapping` partagés par tous ses enfants. Chaque enfant peut surcharger individuellement ces valeurs.

| Situation | Adapter utilisé | Mapping utilisé |
|---|---|---|
| Enfant avec adapter explicite | Celui de l'enfant | Celui de l'enfant ou defaultMapping |
| Enfant sans adapter (ou "auto") | `composite.defaultAdapter` | Celui de l'enfant ou defaultMapping |
| Enfant avec son propre customMapping | — | Celui de l'enfant |
| Enfant sans customMapping | — | `composite.defaultMapping` |

**Exemple** : 3 microservices qui retournent tous le même format JSON

```
Composite "Mon Infrastructure"
├── defaultAdapter: "custom"
├── defaultMapping:
│     statusPath: "health"
│     levelMap: { "up": "operational", "degraded": "mineur", "down": "majeur" }
│
├── Enfant "API Gateway"     url: https://gw.example.com/status   (hérite adapter + mapping)
├── Enfant "Service Auth"    url: https://auth.example.com/health  (hérite adapter + mapping)
└── Enfant "Base de données" url: https://db.example.com/ping
      customMapping: { statusPath: "ping", levelMap: { "ok": "operational" } }
      └─ surcharge le mapping (hérite quand même l'adapter)
```

### Niveau global du composite

Le niveau affiché pour le composite est calculé côté UI : c'est le **pire niveau** parmi tous les enfants dont `enabled: true`. Un composite avec 5 enfants opérationnels et 1 enfant en incident majeur affiche "Incident majeur".

### Identifiants de tâche dans le scheduler

Les enfants d'un composite sont planifiés avec la clé `"compositeId::childId"`. Cela permet au polling de supprimer tous les enfants d'un composite en une opération quand il est modifié ou supprimé.

---

## Niveaux de statut

Le dashboard utilise 7 niveaux de sévérité. L'ordre de sévérité croissante est :

| Niveau | Libellé par défaut | Sémantique | Couleur |
|---|---|---|---|
| `operational` | Opérationnel | Tout fonctionne normalement | Vert `#22c55e` |
| `information` | Information | Message informatif sans impact | Violet `#8b5cf6` |
| `leger` | Légère perturbation | Dégradation partielle non critique | Jaune `#eab308` |
| `mineur` | Incident mineur | Impact partiel sur le service | Orange `#f97316` |
| `majeur` | Incident majeur | Interruption ou impact fort | Rouge `#ef4444` |
| `maintenance` | Maintenance | Maintenance planifiée ou en cours | Bleu `#3b82f6` |
| `inconnu` | Action requise | Statut indéterminé / auth manquante | Gris `#9ca3af` |

**Note sur `inconnu`** : ce niveau apparaît automatiquement quand une requête retourne 401 ou 403. Il indique que les credentials configurés sont invalides ou absents — pas nécessairement que le service est en panne. Dans l'ordre de sévérité interne (`worstLevel`), `inconnu` est placé juste après `operational` car il signifie "on ne sait pas" plutôt que "c'est cassé".

### Personnalisation

Dans les paramètres, chaque niveau peut être renommé (`label`) et recolorisé. Le champ `reference` rappelle la sémantique originale et ne peut pas être modifié.

La couleur hex personnalisée génère automatiquement 4 variantes CSS :
- **Badge** : fond à 10% d'opacité, texte à 70% de la couleur, bordure à 25%
- **Dot** : cercle coloré plein (indicateur de statut dans les listes)
- **Border** : bordure des cartes à 35% d'opacité
- **Banner** : fond coloré plein avec texte blanc (alertes et bandeaux)

Les modifications sont sauvegardées côté serveur et s'appliquent à tous les utilisateurs du déploiement.

---

## Pré-détection communautaire

La pré-détection interroge des sources tierces pour détecter les incidents **avant** qu'ils remontent sur les pages de statut officielles. Elle est optionnelle, configurée par service, et ne se déclenche que si le statut officiel est `operational` — inutile si un incident est déjà connu.

Quand elle se déclenche, le snapshot reçoit `preDetected: true` et l'UI affiche un bandeau d'avertissement sans modifier le niveau officiel.

### Source Reddit

Recherche les posts récents (dernière heure) dans un subreddit donnés contenant les mots-clés configurés.

```
source: reddit
target: github              ← nom du subreddit (sans /r/)
keywords: down outage       ← mots-clés filtrés dans les titres de posts
threshold: 3                ← nombre minimum de posts pour déclencher
```

URL construite : `https://www.reddit.com/r/{target}/search.json?q={keywords}&sort=new&t=hour&limit=25`

Pas d'authentification requise. Un User-Agent `status-dashboard/1.0` est injecté pour éviter les blocages automatiques.

### Source HackerNews (via Algolia)

Recherche les articles HN combinant le nom du service et les mots-clés, publiés dans la dernière heure.

```
source: hn
target: GitHub              ← terme de recherche (nom du service)
keywords: down outage       ← ajoutés à la requête
threshold: 3
```

URL construite : `https://hn.algolia.com/api/v1/search?query={target}+{keywords}&numericFilters=created_at_i>{timestamp_il_y_a_1h}`

Le filtrage temporel et par mots-clés est entièrement dans l'URL — l'adapter compte simplement le nombre de hits retournés.

### Source DownDetector

Scrape le HTML de la page DownDetector d'un service pour extraire le nombre de signalements actuels.

```
source: downdetector
target: https://downdetector.fr/statut/github/    ← URL complète de la page
threshold: 100     ← nombre absolu de signalements, OU 2,5x la baseline si disponible
```

Le proxy injecte des headers de navigateur réalistes (User-Agent Chrome, Accept-Language fr-FR, Referer Google) pour augmenter le taux de succès face à Cloudflare Anti-Bot.

Logique de déclenchement DownDetector (par ordre de priorité) :
1. La série JavaScript `App.dd.values["status-base"]` est disponible dans le HTML : déclenche si `valeur_actuelle >= baseline * 2.5`
2. Sinon, médiane des dernières valeurs `"y"` dans le HTML : déclenche si `valeur >= threshold`
3. Sinon, regex sur le texte visible "X signalements" ou "X reports"

**Avertissement** : DownDetector utilise Cloudflare Anti-Bot. Le scraping peut être bloqué de manière intermittente. Reddit et HN sont plus fiables.

---

## Déploiement

### Prérequis

- Node.js 20+ ou Docker
- Un serveur avec système de fichiers persistant (VPS, serveur dédié, conteneur avec volume monté)
- **Non compatible avec Vercel, Netlify, ou tout environnement serverless** : le Nitro fs storage écrit dans `.data/` sur le disque. Les environnements serverless remettent le filesystem à zéro entre les invocations.

### Installation et build

```bash
git clone <repo>
cd dashboard-concentrateur-status
npm install       # ou pnpm install
npm run build
```

### Lancer en production

```bash
node .output/server/index.mjs
```

### Développement local

Sur macOS, un problème connu avec Nitro nécessite de redéfinir `TMPDIR` :

```bash
TMPDIR=/tmp npm run dev
```

Le script `dev` dans `package.json` inclut déjà ce préfixe.

### VPS avec PM2

```bash
npm run build
pm2 start .output/server/index.mjs --name status-dashboard
pm2 save
pm2 startup   # pour le démarrage automatique au boot
```

### Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.output ./
# Monter ce volume pour persister la configuration entre les redémarrages
VOLUME ["/app/.data"]
EXPOSE 3000
CMD ["node", "server/index.mjs"]
```

```bash
docker build -t status-dashboard .
docker run -d -p 3000:3000 -v /srv/status-data:/app/.data --name status-dashboard status-dashboard
```

Le volume `/app/.data` est essentiel — sans lui, toute la configuration est perdue au redémarrage du conteneur.

### Variables d'environnement

| Variable | Description | Défaut |
|---|---|---|
| `PORT` | Port d'écoute du serveur Nitro | `3000` |
| `NITRO_HOST` | Interface d'écoute | `0.0.0.0` |

---

## Développement — Ajouter un nouvel adapter

Voici le processus complet pour ajouter le support d'un nouveau service tiers avec son propre format JSON.

### Étape 1 : Analyser le format de l'API

Récupérez la réponse brute de l'API cible (avec `curl` ou l'explorateur JSON de l'UI en mode `custom`) et identifiez :
- Le champ qui indique le statut global (ex: `"status": "degraded"`)
- Les valeurs possibles de ce champ (ex: `"operational"`, `"degraded"`, `"down"`)
- La structure des incidents actifs si présente

### Étape 2 : Créer le fichier adapter

```typescript
// adapters/monservice.ts

/**
 * @module adapters/monservice
 *
 * Adapter pour Mon Service Status API.
 * URL : https://status.monservice.com/api/v2/status.json
 */

import type { AdapterResult, Incident, StatusLevel } from '~/types'

// Typer la réponse brute de l'API
interface MonServiceResponse {
  state: 'operational' | 'degraded' | 'down' | 'maintenance'
  message: string
  events: {
    id: string
    title: string
    severity: 'warning' | 'error' | 'critical'
    created_at: string
    updated_at: string
    url?: string
  }[]
}

// Mapper les valeurs propriétaires vers les StatusLevel du dashboard
function mapState(state: string): StatusLevel {
  switch (state?.toLowerCase()) {
    case 'operational': return 'operational'
    case 'degraded':    return 'mineur'
    case 'down':        return 'majeur'
    case 'maintenance': return 'maintenance'
    default:            return 'inconnu'
  }
}

function mapSeverity(severity: string): StatusLevel {
  switch (severity) {
    case 'warning':  return 'leger'
    case 'error':    return 'mineur'
    case 'critical': return 'majeur'
    default:         return 'leger'
  }
}

export function parseMonService(data: unknown): AdapterResult {
  const r = data as MonServiceResponse

  const incidents: Incident[] = (r.events ?? []).map((ev, i) => ({
    id: ev.id ?? `event-${i}`,
    title: ev.title,
    level: mapSeverity(ev.severity),
    startedAt: ev.created_at,
    updatedAt: ev.updated_at,
    url: ev.url,
  }))

  return {
    level: mapState(r.state),
    message: r.message ?? 'Statut inconnu',
    incidents,
  }
}
```

### Étape 3 : Enregistrer l'adapter dans le registre

Dans `adapters/index.ts`, ajouter l'import, la clé dans `ADAPTERS` et dans `AdapterKey` :

```typescript
// adapters/index.ts

import { parseMonService } from './monservice'

// Ajouter à AdapterKey
export type AdapterKey =
  | 'github' | 'atlassian' | 'aws' | 'azuredevops' | 'rss' | 'custom' | 'auto'
  | 'monservice'   // ← nouvelle clé

// Ajouter au registre ADAPTERS
const ADAPTERS: Record<string, (data: unknown) => AdapterResult> = {
  github: parseGithub,
  atlassian: parseAtlassian,
  notion: parseAtlassian,
  aws: parseAws,
  azuredevops: parseAzureDevOps,
  rss: parseRss,
  monservice: parseMonService,  // ← nouvel adapter
}
```

### Étape 4 : Ajouter un preset (optionnel)

Si l'URL de l'API est canonique et connue, l'ajouter dans `PRESET_SERVICES` pour apparaître dans le formulaire d'ajout rapide :

```typescript
export const PRESET_SERVICES = [
  // ... existants ...
  {
    name: 'Mon Service',
    url: 'https://status.monservice.com/api/v2/status.json',
    method: 'GET' as const,
    adapter: 'monservice',
    headers: {},
  },
]
```

### Étape 5 : Exposer le nom dans l'UI

Vérifier les composants qui listent les adapters disponibles dans le sélecteur du formulaire de configuration et y ajouter la nouvelle clé avec son libellé.

### Tests manuels

1. Lancer `TMPDIR=/tmp npm run dev`
2. Ajouter un service avec la nouvelle clé adapter via l'UI
3. Vérifier que le niveau et les incidents s'affichent correctement
4. Tester les cas limites : réponse vide (`{}` ou `null`), champ de statut manquant, valeur inconnue

### Cas particulier : réponse XML/HTML

Si l'API retourne du XML ou du HTML, le proxy encapsule le contenu brut dans `{ _raw: "..." }`. Votre adapter doit en tenir compte :

```typescript
export function parseMonServiceXml(data: unknown): AdapterResult {
  const raw = (data as { _raw?: string })?._raw ?? ''
  if (!raw) return { level: 'operational', message: 'Aucune donnée', incidents: [] }

  // Parser le XML manuellement ou utiliser rssToStructured si c'est un flux RSS
  // ...
}
```

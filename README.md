# Dashboard Concentrateur de Statut

Tableau de bord auto-hébergé pour surveiller l'état opérationnel de vos services et APIs tierces. Agrège les pages de statut officielles (GitHub, AWS, Azure DevOps, Atlassian, flux RSS...) et vos propres endpoints en un seul endroit, mis à jour **en temps réel via WebSocket**.

Construit avec **Nuxt 3** (Nitro), **Vue 3** et **TailwindCSS v4**. Conçu pour tourner sur un VPS ou en Docker — pas sur Vercel ni Netlify (le storage serveur Nitro nécessite un système de fichiers persistant).

---

## Table des matières

1. [Fonctionnalités](#fonctionnalités)
2. [Architecture technique](#architecture-technique)
3. [Les adaptateurs](#les-adaptateurs)
4. [Le mapping personnalisé](#le-mapping-personnalisé)
5. [Services composites](#services-composites)
6. [Niveaux de statut](#niveaux-de-statut)
7. [Sécurité et contrôle d'accès](#sécurité-et-contrôle-daccès)
8. [Déploiement](#déploiement)
9. [Développement — Ajouter un adapter](#développement--ajouter-un-adapter)

---

## Fonctionnalités

- **Temps réel WebSocket** : le serveur poll les APIs, le navigateur ne fait rien — 10 utilisateurs = 1 seul appel par service
- **8 niveaux de statut** avec libellés et couleurs entièrement personnalisables
- **Adapters intégrés** : GitHub, Atlassian Statuspage, AWS Health, Azure DevOps, Bloomberg, RSS/Atom, **Ping HTTP**
- **Adapter custom** : mapper n'importe quelle API JSON ou XML visuellement (pas de code)
- **Services composites** : regrouper plusieurs URLs sous une carte logique (toutes les régions d'un cloud...)
- **Mapping global hérité** sur les composites (adapter et chemin partagés par les enfants)
- **Déplacer un service** dans un groupe existant en un clic
- **Explorateur JSON interactif** : cliquer sur un nœud pour en faire le statusPath ou messagePath
- **Historique** par service (50 derniers changements d'état)
- **Mode compact** : vue dense multi-colonnes
- **Drag-and-drop** pour réordonner services et sous-services
- **Persistance serveur** via Nitro fs storage — configuration partagée entre tous les utilisateurs
- **Toasts** : confirmation visuelle à chaque sauvegarde
- **Thème light / dark**
- **Protection par mot de passe ou SSO OIDC/PKCE** pour la page de gestion

---

## Architecture technique

### Flux de données en temps réel

```
Serveur (Nitro)
│
├── scheduler.ts — un timer par service (configurable 1–20 min)
│   └── fetch() direct vers l'API externe côté serveur
│       └── runAdapter() → StatusSnapshot
│           └── broadcast(snapshot) via WebSocket
│
└── _ws.ts — WebSocket handler
    ├── Nouveau client → envoie tous les lastSnapshots + config actuelle
    └── Client déconnecté → auto-reconnexion 3s

Navigateur (Vue 3)
│
├── useRealtimeStatus → connect() au démarrage
│   ├── msg.type = 'snapshot' → pushSnapshot() → carte mise à jour
│   └── msg.type = 'config'   → services/composites/order mis à jour
│
└── Zéro timer, zéro polling côté client
```

### Pourquoi WebSocket ?

10 utilisateurs connectés = **1 seul appel** par intervalle vers l'API externe (le serveur). Sans WebSocket, ce serait 10 appels, ce qui déclenche facilement des rate-limits (429).

### Le scheduler serveur

Un `setInterval` par service actif. Au démarrage du plugin Nitro, la config est lue depuis le storage et chaque service activé obtient son timer. Quand la config change (via POST /api/config), `reloadSchedulers()` est appelé immédiatement.

Les enfants d'un composite sont planifiés sous la clé `"compositeId::childId"` et peuvent être nettoyés en groupe.

### Le proxy serveur

Toutes les requêtes vers les APIs externes passent par `POST /api/proxy`. Avantages :
- Pas de contrainte CORS (appel serveur-to-serveur)
- Les credentials (tokens) ne transitent jamais dans le navigateur
- Protection anti-SSRF (localhost, 127.0.0.1, 10.*, 192.168.* bloqués)
- Cache mémoire 120s pour éviter les rate-limits

---

## Les adaptateurs

### Adapters intégrés

| Clé | Service | Notes |
|---|---|---|
| `github` | GitHub Status | Format Atlassian enrichi |
| `atlassian` | Tout statuspage.io | Standard Atlassian Statuspage |
| `notion` | Notion Status | Alias de `atlassian` |
| `aws` | AWS Health Dashboard | Parse `current_events[]` |
| `azuredevops` | Azure DevOps Health | Santé par service + géographie |
| `bloomberg` | Bloomberg Status | Format Atlassian |
| `rss` | Tout flux RSS 2.0 / Atom 1.0 | Détection niveau par mots-clés |
| `ping` | N'importe quelle URL | 2xx = opérationnel, autre = erreur |
| `custom` | N'importe quelle API | Piloté par CustomMapping |
| `auto` | Inconnu | Auto-détection Atlassian |

### Adapter Ping HTTP

L'adapter `ping` fait un GET sur l'URL et mappe le code HTTP retourné :

| Code HTTP | Niveau |
|---|---|
| 2xx | Opérationnel |
| 401 / 403 | Inconnu (authentification) |
| 429 / 502 / 503 / 504 | Mineur |
| 5xx autre | Majeur |
| 4xx autre | Mineur |
| Timeout / réseau | Majeur |

Aucune configuration de mapping requise — juste l'URL.

### Mapping des niveaux Atlassian

| Valeur API | Niveau |
|---|---|
| `none` | Opérationnel |
| `minor` | Mineur |
| `major` | Majeur |
| `critical` | Critique |
| `maintenance` | Maintenance |

---

## Le mapping personnalisé

L'adapter `custom` permet de surveiller n'importe quelle API JSON ou XML sans code.

### Les trois champs

| Champ | Rôle |
|---|---|
| `statusPath` | Chemin vers la valeur de statut (`status.indicator`, `data.0.health`...) |
| `messagePath` | Chemin vers la description textuelle (optionnel) |
| `levelMap` | Table de correspondance valeur → niveau |

### Opérateur wildcard `*`

`entries.*.title` itère sur tous les items du tableau :
- Sur `statusPath` : niveau global = **pire niveau** parmi tous les items
- Sur `messagePath` : génère des `MessageEntry` informatives

### Les 4 syntaxes de `levelMap`

| Syntaxe | Exemple | Comportement |
|---|---|---|
| Exact | `"none"` | Correspondance exacte (insensible casse) |
| Wildcard | `"healthy*"` | `*` = n'importe quelle séquence |
| Contains | `"~advisory"` | La valeur contient la sous-chaîne |
| Regex | `"/^ok$/i"` | Regex JS avec flags optionnels |

Si aucun pattern ne correspond, une détection automatique par mots-clés est tentée.

### L'explorateur JSON interactif

Après avoir cliqué sur **Tester**, la réponse s'affiche en arbre JSON navigable. Cliquer sur une valeur feuille propose de l'affecter à `statusPath` ou `messagePath`, avec suggestion du chemin wildcard si l'item est dans un tableau.

---

## Services composites

Regroupe plusieurs URLs sous un service logique unique.

### Héritage de configuration

Le composite définit un `defaultAdapter` et un `defaultMapping`. Chaque enfant peut les surcharger ou les hériter.

### Niveau global

`worstLevel()` parmi tous les enfants actifs.

### Fonctionnalités

- **Vue 2 colonnes** dans le formulaire d'édition (config à gauche, sous-services à droite)
- **Mapping global avec table levelMap** éditable directement dans le formulaire
- **Déplacer un service autonome** dans un groupe via le bouton dossier sur la ligne
- **Navigation** entre sous-services avec raccourcis clavier (↑↓) dans la modale de détail
- **Drag-and-drop** pour réordonner les enfants

---

## Niveaux de statut

8 niveaux, ordre de sévérité croissant :

| Niveau | Libellé par défaut | Couleur |
|---|---|---|
| `operational` | Opérationnel | Vert `#22c55e` |
| `inconnu` | Action requise | Gris `#9ca3af` |
| `information` | Information | Violet `#8b5cf6` |
| `maintenance` | Maintenance | Bleu `#3b82f6` |
| `leger` | Légère perturbation | Jaune `#eab308` |
| `mineur` | Incident mineur | Orange `#f97316` |
| `majeur` | Incident majeur | Rouge `#ef4444` |
| `critique` | Critique | Rouge foncé `#7f1d1d` |

Libellés et couleurs personnalisables depuis **Paramètres → Niveaux de statut**. Les modifications s'appliquent à tous les utilisateurs du déploiement.

---

## Sécurité et contrôle d'accès

La page de gestion (`/services`) et la page de paramètres (`/settings`) sont protégeables via le middleware `auth`.

### Modes disponibles

**Aucun** : tout le monde peut modifier la configuration (défaut).

**Mot de passe** : un hash SHA-256 est stocké côté serveur. La session est maintenue dans `sessionStorage` (durée : onglet navigateur).

**SSO / OIDC PKCE** : authentification déléguée à un fournisseur d'identité. Aucun `client_secret` exposé.

Compatible avec Keycloak, Azure AD / Entra ID, Auth0, Okta, Google Workspace...

Configuration dans `Paramètres → Sécurité` :
- URL de découverte : `https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration`
- Client ID : l'ID de l'app créée dans votre IdP (type Public client, PKCE)
- Redirect URI : `https://votre-domaine.com/auth/callback` (à enregistrer dans l'IdP)

---

## Déploiement

### Prérequis

- Node.js 20+ ou Docker
- Serveur avec filesystem persistant (VPS, serveur dédié, conteneur avec volume)
- **Non compatible Vercel / Netlify** : Nitro fs storage nécessite un disque persistant

### Développement local

```bash
pnpm install
pnpm dev
```

Sur macOS, si vous obtenez `EMFILE: too many open files` :

```bash
# Installation unique
brew install watchman
pnpm add -D fb-watchman

# Ou augmenter la limite système
ulimit -n 65536 && pnpm dev
```

### Build et production

```bash
pnpm build
node .output/server/index.mjs
```

### VPS avec PM2

```bash
pnpm build
pm2 start .output/server/index.mjs --name status-dashboard
pm2 save && pm2 startup
```

### Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install
COPY . .
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.output ./
VOLUME ["/app/.data"]
EXPOSE 3000
CMD ["node", "server/index.mjs"]
```

```bash
docker build -t status-dashboard .
docker run -d -p 3000:3000 -v /srv/status-data:/app/.data --name status-dashboard status-dashboard
```

Le volume `/app/.data` est essentiel — sans lui, toute la configuration est perdue au redémarrage.

### Variables d'environnement

| Variable | Description | Défaut |
|---|---|---|
| `PORT` | Port d'écoute | `3000` |
| `NITRO_HOST` | Interface d'écoute | `0.0.0.0` |

---

## Développement — Ajouter un adapter

### 1. Créer le fichier adapter

```typescript
// adapters/monservice.ts
import type { AdapterResult, StatusLevel } from '~/types'

function mapState(state: string): StatusLevel {
  switch (state?.toLowerCase()) {
    case 'operational': return 'operational'
    case 'degraded':    return 'mineur'
    case 'down':        return 'majeur'
    default:            return 'inconnu'
  }
}

export function parseMonService(data: unknown): AdapterResult {
  const r = data as { state: string; message: string }
  return {
    level: mapState(r.state),
    message: r.message ?? 'Statut inconnu',
    incidents: [],
  }
}
```

### 2. Enregistrer dans `adapters/index.ts`

```typescript
import { parseMonService } from './monservice'

export type AdapterKey = ... | 'monservice'

const ADAPTERS = {
  // ...existants
  monservice: parseMonService,
}

export const ADAPTER_META = [
  // ...existants
  { value: 'monservice', label: 'Mon Service', statusPath: 'state' },
]
```

### 3. Ajouter un preset (optionnel)

```typescript
export const PRESET_SERVICES = [
  // ...
  {
    name: 'Mon Service',
    url: 'https://status.monservice.com/api/v2/status.json',
    method: 'GET' as const,
    adapter: 'monservice',
    headers: {},
  },
]
```

### Cas XML/RSS

Le proxy retourne `{ _raw: "<?xml..." }`. L'adapter doit détecter et parser ce champ :

```typescript
export function parseMonServiceXml(data: unknown): AdapterResult {
  const raw = (data as { _raw?: string })?._raw ?? ''
  // Parser ou utiliser rssToStructured() si RSS/Atom
}
```

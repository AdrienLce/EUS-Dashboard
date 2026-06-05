/**
 * @module composables/usePolling
 *
 * Orchestration du polling des services et composites.
 *
 * Ce composable est la couche entre la configuration (useServerConfig) et le scheduler.
 * Il prend en charge :
 * - Le cycle complet : récupération via proxy → adapter → snapshot → store
 * - La pré-détection communautaire (vérification post-snapshot si statut opérationnel)
 * - La gestion des erreurs HTTP (401/403 → niveau "inconnu", autre → "majeur")
 * - Le polling des services simples ET des composites (enfants avec héritage)
 *
 * ## Clés de tâche dans le scheduler
 *
 * - Service simple    : `serviceId` (ex: `"550e8400-e29b-41d4-a716-446655440000"`)
 * - Enfant composite  : `"compositeId::childId"` (le préfixe `compositeId::` permet
 *   de supprimer en bloc tous les enfants d'un composite via `unschedulePrefix`)
 *
 * ## État module-level (singleton)
 *
 * `loading` et `errors` sont des Records indexés par serviceId/childId.
 * Partagés entre toutes les instances du composable.
 */

import { ref } from 'vue'
import type { ServiceConfig, SubServiceConfig, CompositeServiceConfig } from '~/types'
import { runAdapter } from '~/adapters/index'
import { buildPreDetectionUrl, parsePreDetection } from '~/adapters/predetection'
import { useStatusStore } from './useStatusStore'
import { useScheduler } from './useScheduler'

/** Record id → boolean indiquant si un fetch est en cours pour ce service */
const loading = ref<Record<string, boolean>>({})
/** Record id → message d'erreur (null si pas d'erreur) */
const errors = ref<Record<string, string | null>>({})

/**
 * Vérifie la pré-détection communautaire APRÈS avoir calculé le snapshot officiel.
 * Ne se déclenche que si le statut officiel est `operational` — inutile si un
 * incident est déjà connu.
 *
 * En cas de détection positive, enrichit le snapshot en place (mutation directe)
 * avec `preDetected: true` et `preDetectedCount`.
 *
 * @param snap - Snapshot déjà calculé par l'adapter officiel (sera muté si détection)
 * @param pd   - Configuration de pré-détection (peut être undefined)
 */
async function checkPreDetection(
  snap: import('~/types').StatusSnapshot,
  pd: import('~/types').PreDetectionConfig | undefined,
) {
  // Conditions de déclenchement : pré-détection activée, cible définie, statut opérationnel
  if (!pd?.enabled || !pd.target || snap.level !== 'operational') return
  try {
    const fetchUrl = buildPreDetectionUrl(pd)
    if (!fetchUrl) return

    // Headers adaptés à chaque source pour éviter les blocages (User-Agent, Referer)
    const headers: Record<string, string> = pd.source === 'reddit'
      ? { 'User-Agent': 'status-dashboard/1.0' }
      : pd.source === 'downdetector'
        ? {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9',
            'Referer': 'https://www.google.com/',
          }
        : {}

    const data = await $fetch('/api/proxy', {
      method: 'POST',
      body: { url: fetchUrl, method: 'GET', headers },
    })

    const result = parsePreDetection(pd.source, data, pd)
    if (result?.triggered) {
      snap.preDetected = true
      snap.preDetectedCount = result.count
    }
  }
  catch { /* Silencieux — la pré-détection est best-effort, ne doit pas bloquer l'UI */ }
}

/**
 * Récupère le statut d'un service via le proxy Nitro et produit un StatusSnapshot.
 *
 * Pipeline :
 * 1. Appel POST /api/proxy avec l'URL, méthode, headers et body configurés
 * 2. runAdapter pour transformer la réponse brute en AdapterResult
 * 3. checkPreDetection si le statut est opérationnel
 * 4. pushSnapshot dans useStatusStore
 *
 * En cas d'erreur :
 * - 401/403 → niveau "inconnu" (action requise — authentification manquante)
 * - Autre   → niveau "majeur" (service inaccessible)
 *
 * @param id            - ID du service (ServiceConfig.id ou SubServiceConfig.id)
 * @param url           - URL à interroger
 * @param method        - Méthode HTTP
 * @param headers       - En-têtes HTTP supplémentaires
 * @param body          - Corps de la requête (POST uniquement)
 * @param adapter       - Clé de l'adapter
 * @param customMapping - Mapping personnalisé (si adapter === "custom")
 * @param preDetection  - Config de pré-détection (optionnel, services simples uniquement)
 */
async function fetchOne(
  id: string,
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  adapter: string,
  customMapping: ServiceConfig['customMapping'],
  preDetection?: import('~/types').PreDetectionConfig,
  forceRefresh = false,
) {
  loading.value[id] = true
  errors.value[id] = null

  try {
    // Étape 1 : récupérer la réponse brute via le proxy
    const data = await $fetch('/api/proxy', { method: 'POST', body: { url, method, headers, body, forceRefresh } })

    // Étape 2 : transformer via l'adapter approprié
    const result = runAdapter(adapter, data, customMapping)

    // Étape 3 : construire le snapshot
    const { pushSnapshot } = useStatusStore()
    const snap: import('~/types').StatusSnapshot = {
      serviceId: id,
      timestamp: new Date().toISOString(),
      level: result.level,
      message: result.message,
      incidents: result.incidents,
    }
    if (result.entries) snap.entries = result.entries

    // Étape 4 : pré-détection communautaire (best-effort, ne modifie que si triggered)
    await checkPreDetection(snap, preDetection)

    // Étape 5 : stocker dans le store
    pushSnapshot(snap)
  }
  catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur de récupération'
    errors.value[id] = msg

    const statusCode = (err as { statusCode?: number })?.statusCode ?? 0

    // Erreurs proxy → inconnu (pas un vrai incident du service)
    const isAuthError   = statusCode === 401 || statusCode === 403 || msg.includes('401') || msg.includes('403')
    const isProxyError  = statusCode === 429 || statusCode === 503 || statusCode === 502
      || msg.includes('429') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT')

    const level = (isAuthError || isProxyError) ? 'inconnu' as const : 'majeur' as const
    const message = isAuthError
      ? 'Accès refusé — authentification ou configuration requise'
      : isProxyError
        ? `Requête bloquée (${statusCode || 'réseau'}) — le service est peut-être inaccessible depuis le serveur`
        : `Erreur: ${msg}`

    const { pushSnapshot } = useStatusStore()
    pushSnapshot({ serviceId: id, timestamp: new Date().toISOString(), level, message, incidents: [] })
  }
  finally {
    loading.value[id] = false
  }
}

/**
 * Crée la fonction de fetch pour un service (simple ou enfant de composite).
 * Extrait la config de pré-détection uniquement pour les ServiceConfig
 * (SubServiceConfig ne supporte pas la pré-détection).
 *
 * @param svc - Service simple ou sous-service d'un composite
 */
function makeFetchFn(svc: ServiceConfig | SubServiceConfig) {
  const pd = 'preDetection' in svc ? (svc as ServiceConfig).preDetection : undefined
  return () => fetchOne(svc.id, svc.url, svc.method, svc.headers, svc.body, svc.adapter, svc.customMapping, pd)
}

/**
 * Composable exposant les fonctions de démarrage/arrêt du polling.
 *
 * @example
 * const { startPolling, stopPolling, refreshService } = usePolling()
 *
 * // Démarrer le polling d'un service
 * startPolling(serviceConfig)
 *
 * // Arrêter le polling d'un service
 * stopPolling(serviceConfig.id)
 *
 * // Rafraîchissement manuel immédiat
 * refreshService(serviceConfig)
 */
export function usePolling() {
  const { schedule, unschedule, unschedulePrefix } = useScheduler()

  /**
   * Démarre le polling automatique d'un service simple.
   * L'intervalle est plafonné à 120 secondes (2 minutes) même si ServiceConfig.pollInterval est plus élevé.
   *
   * @param service - Configuration du service à surveiller
   */
  function startPolling(service: ServiceConfig) {
    const ms = Math.min(service.pollInterval, 1200) * 1000
    schedule(service.id, ms, makeFetchFn(service))
  }

  /**
   * Arrête le polling d'un service simple.
   *
   * @param serviceId - ID du service à arrêter
   */
  function stopPolling(serviceId: string) {
    unschedule(serviceId)
  }

  /**
   * Démarre le polling automatique de tous les enfants actifs d'un composite.
   *
   * Particularités :
   * - Arrête d'abord le polling précédent pour ce composite (stopCompositePolling)
   * - Les enfants désactivés (enabled: false) sont ignorés
   * - L'adapter et le mapping effectifs sont résolus selon l'héritage :
   *   - Si l'enfant a son propre adapter (non vide, non "auto") → utilisé tel quel
   *   - Sinon → `composite.defaultAdapter` si défini
   *   - Pour le mapping : `child.customMapping` prioritaire, puis `composite.defaultMapping`
   * - La clé de tâche est `"compositeId::childId"` pour permettre la suppression par préfixe
   *
   * @param composite - Configuration du service composite
   */
  function startCompositePolling(composite: CompositeServiceConfig) {
    stopCompositePolling(composite.id)
    const ms = Math.min(composite.pollInterval, 1200) * 1000

    for (const child of composite.children) {
      if (!child.enabled) continue

      // Résolution de l'adapter effectif (héritage du composite si non défini sur l'enfant)
      const effectiveAdapter = child.adapter && child.adapter !== 'auto'
        ? child.adapter
        : (composite.defaultAdapter ?? child.adapter)

      // Résolution du mapping effectif (héritage du composite si non défini sur l'enfant)
      const effectiveMapping = child.customMapping ?? composite.defaultMapping

      const fn = () => fetchOne(child.id, child.url, child.method, child.headers, child.body, effectiveAdapter, effectiveMapping)
      // Clé préfixée pour pouvoir supprimer tous les enfants en bloc via unschedulePrefix
      schedule(`${composite.id}::${child.id}`, ms, fn)
    }
  }

  /**
   * Arrête le polling de tous les enfants d'un service composite.
   * Utilise unschedulePrefix pour supprimer toutes les clés `"compositeId::*"`.
   *
   * @param compositeId - ID du composite dont stopper le polling
   */
  function stopCompositePolling(compositeId: string) {
    unschedulePrefix(`${compositeId}::`)
  }

  /**
   * Arrête le polling de TOUS les services et composites actifs.
   * Passe un préfixe vide à unschedulePrefix, ce qui correspond à toutes les clés.
   */
  function stopAll() {
    unschedulePrefix('')
  }

  /**
   * Déclenche immédiatement un fetch pour un service simple (hors polling automatique).
   * Ne modifie pas le planning — le prochain tick automatique reste inchangé.
   *
   * @param service - Service à rafraîchir
   */
  function refreshService(service: ServiceConfig) {
    fetchOne(service.id, service.url, service.method, service.headers, service.body, service.adapter, service.customMapping, service.preDetection, true)
  }

  /**
   * Déclenche immédiatement un fetch pour tous les enfants actifs d'un composite.
   * Ne modifie pas le planning — le prochain tick automatique reste inchangé.
   *
   * @param composite - Composite dont rafraîchir les enfants
   */
  function refreshComposite(composite: CompositeServiceConfig) {
    for (const child of composite.children) {
      if (child.enabled) fetchOne(child.id, child.url, child.method, child.headers, child.body, child.adapter, child.customMapping, undefined, true)
    }
  }

  /**
   * Déclenche immédiatement un fetch pour un enfant de composite spécifique.
   *
   * @param child - Sous-service à rafraîchir
   */
  function refreshChild(child: SubServiceConfig) {
    fetchOne(child.id, child.url, child.method, child.headers, child.body, child.adapter, child.customMapping, undefined, true)
  }

  return {
    /** Record réactif id → boolean (fetch en cours) */
    loading,
    /** Record réactif id → message d'erreur ou null */
    errors,
    startPolling,
    stopPolling,
    stopAll,
    refreshService,
    startCompositePolling,
    stopCompositePolling,
    refreshComposite,
    refreshChild,
  }
}

import {
  asArray,
  asMaybe,
  asObject,
  asString,
  asValue,
  Cleaner
} from 'cleaners'

import { asHealingObject } from '../cleaners/as-healing-object'
import { ReplicatorDocument, ReplicatorEndpoint } from './replicator-document'
import { DatabaseSetup } from './setup-database'

/**
 * Configures which databases a CouchDB cluster contains,
 * and who it replicates with.
 *
 * The various filters wildcard matching with a trailing `*`,
 * For example, 'logs-*' matches 'logs-2019' and 'logs-2020'.
 */
interface ReplicatorCluster {
  /** The base URI to connect to. */
  url: string

  /**
   * The base64-encoded "username:password" used for authentication.
   * To generate this, run `btoa('username:password')` in a browser console.
   */
  basicAuth?: string

  /**
   * List of databases to exclude from creation or replication.
   * Supports wildcards and tags. Defaults to `['#exclude']`.
   */
  exclude?: string[]

  /**
   * List of databases to create and replicate.
   * Supports wildcards and tags. Defaults to `[*]`
   */
  include?: string[]

  /**
   * List of databases to create but not replicate.
   * Supports wildcards and tags.
   */
  localOnly?: string[]

  /** Cluster names to replicate with. */
  pullFrom: string[]

  /** Cluster names to replicate with. */
  pushTo: string[]
}

interface ReplicatorClusters {
  [clusterName: string]: ReplicatorCluster
}

/**
 * A list of nodes to use for replication,
 * indexed by their friendly cluster name.
 */
export interface ReplicatorSetupDocument {
  clusters: ReplicatorClusters
}

/**
 * Validates a replicator setup document.
 * Handles errors gracefully for use with with `syncedDocument`,
 * and upgrades legacy fields.
 */
export const asReplicatorSetupDocument: Cleaner<ReplicatorSetupDocument> =
  raw => {
    const { clusters: rawClusters, ...rest } = asReplicatorSetupRaw(raw)

    const clusters: ReplicatorClusters = {}
    for (const name of Object.keys(rawClusters)) {
      const cluster = rawClusters[name]
      const {
        url = '',
        basicAuth,
        exclude = ['#archived'], // Explicitly add this to the database
        include,
        localOnly,
        pullFrom = Object.keys(rawClusters).filter(peerName => {
          if (peerName === name) return false
          const { mode } = rawClusters[peerName]
          return mode === 'both' || mode === 'source'
        }),
        pushTo = Object.keys(rawClusters).filter(peerName => {
          if (peerName === name) return false
          const { mode } = rawClusters[peerName]
          return mode === 'both' || mode === 'target'
        })
      } = cluster

      clusters[name] = {
        url,
        basicAuth,
        exclude,
        include,
        localOnly,
        pullFrom,
        pushTo
      }
    }

    return { ...rest, clusters }
  }

/**
 * Creates the documents we need to add to the replicator database.
 */
export function makeReplicatorDocuments(
  replicatorSetup: ReplicatorSetupDocument | undefined,
  clusterName: string | undefined,
  currentUsername: string,
  setupInfo: DatabaseSetup
): { [id: string]: ReplicatorDocument } {
  const documents: { [id: string]: ReplicatorDocument } = {}
  const { clusters } = replicatorSetup ?? { clusters: {} }
  const { name, options } = setupInfo

  // Find the current cluster:
  if (clusterName == null) clusterName = 'default'
  const cluster = clusters[clusterName]
  if (cluster == null) return documents

  // Bail out if the current cluster is missing from the list:
  const { replicated } = clusterHasDatabase(
    replicatorSetup,
    clusterName,
    setupInfo
  )
  if (!replicated) return documents

  for (const remoteName of Object.keys(clusters)) {
    const remoteCluster = clusters[remoteName]

    // Skip this row if we don't replicate with it:
    if (remoteName === clusterName) continue
    const { replicated } = clusterHasDatabase(
      replicatorSetup,
      remoteName,
      setupInfo
    )
    if (!replicated) continue

    if (includesName(cluster.pullFrom, remoteName)) {
      documents[`${name}.from.${remoteName}`] = {
        continuous: true,
        create_target: false,
        owner: currentUsername,
        source: makeEndpoint(remoteCluster, name),
        target: makeEndpoint(cluster, name)
      }
    }

    if (includesName(cluster.pushTo, remoteName)) {
      documents[`${name}.to.${remoteName}`] = {
        continuous: true,
        create_target: true,
        create_target_params: options,
        owner: currentUsername,
        source: makeEndpoint(cluster, name),
        target: makeEndpoint(remoteCluster, name)
      }
    }
  }

  return documents
}

const EXCLUDED = { exists: false, replicated: false }
const INCLUDED = { exists: true, replicated: true }
const LOCAL_ONLY = { exists: true, replicated: false }

/**
 * Determines whether a particular database should exist on a cluster.
 */
export function clusterHasDatabase(
  replicatorSetup: ReplicatorSetupDocument | undefined,
  clusterName: string | undefined,
  setupInfo: DatabaseSetup
): {
  exists: boolean
  replicated: boolean
} {
  const {
    ignoreMissing = false,
    name,
    tags = ignoreMissing ? ['#archived'] : []
  } = setupInfo
  const names = [name, ...tags]

  // Default to local-only if we cannot find any cluster info:
  const cluster = replicatorSetup?.clusters[clusterName ?? 'default']
  if (cluster == null) return LOCAL_ONLY
  const { exclude = [], include = ['*'], localOnly = [] } = cluster

  if (names.some(name => includesName(exclude, name))) {
    return EXCLUDED
  }

  if (
    name === '_replicator' ||
    names.some(name => includesName(localOnly, name))
  ) {
    return LOCAL_ONLY
  }

  if (names.some(name => includesName(include, name))) {
    return INCLUDED
  }

  return EXCLUDED
}

/**
 * Returns true if a list includes a name.
 * If a list row ends with '*', treat that like a wildcard.
 */
function includesName(list: string[], name: string): boolean {
  const found = list.find(
    row =>
      row === (/\*$/.test(row) ? name.slice(0, row.length - 1) + '*' : name)
  )
  return found != null
}

function makeEndpoint(
  cluster: ReplicatorCluster,
  db: string
): ReplicatorEndpoint {
  const url = `${cluster.url.replace(/[/]$/, '')}/${db}`
  return cluster.basicAuth == null
    ? url
    : { url, headers: { Authorization: `Basic ${cluster.basicAuth}` } }
}

const asClusterRowRaw = asObject({
  url: asMaybe(asString),
  basicAuth: asMaybe(asString),
  exclude: asMaybe(asArray(asString)),
  include: asMaybe(asArray(asString)),
  localOnly: asMaybe(asArray(asString)),
  pullFrom: asMaybe(asArray(asString)),
  pushTo: asMaybe(asArray(asString)),

  // This has been replaced by `pushTo` and `pullFrom`,
  // so we use it to fill the defaults for those two fields.
  mode: asMaybe(asValue('both', 'source', 'target'))
})

const asReplicatorSetupRaw = asObject({
  clusters: asHealingObject(asClusterRowRaw)
})

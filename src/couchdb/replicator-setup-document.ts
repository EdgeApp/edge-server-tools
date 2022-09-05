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

interface ReplicatorCluster {
  // The base URI to connect to:
  url: string

  // The base64 "username:password" pair used to authenticate.
  // To get this, run `btoa('username:password')` in a JS console:
  basicAuth?: string

  // Database names that exist on this cluster.
  // Use an ending '*' for wildcard matching.
  // For example, 'logs-*' matches things like 'logs-2019' or 'logs-2020'.
  exclude?: string[] // Do not create or replicate these
  include?: string[] // Create and replicate these
  localOnly?: string[] // Create these but don't replicate them

  // Cluster names to replicate with.
  // Use an ending '*' for wildcard matching.
  // For example, 'logs-*' matches things like 'logs-eu' or 'logs-us'.
  pullFrom: string[]
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
  replicatorSetup: ReplicatorSetupDocument,
  currentCluster: string,
  currentUsername: string,
  setupInfo: DatabaseSetup
): { [id: string]: ReplicatorDocument } {
  const documents: { [id: string]: ReplicatorDocument } = {}
  const { clusters } = replicatorSetup
  const { name, options } = setupInfo

  // Bail out if the current cluster is missing from the list:
  const { replicated } = clusterHasDatabase(
    replicatorSetup,
    currentCluster,
    setupInfo
  )
  if (!replicated) return documents

  function makeEndpoint(clusterName: string): ReplicatorEndpoint {
    const cluster = clusters[clusterName]
    const url = `${cluster.url.replace(/[/]$/, '')}/${name}`
    return cluster.basicAuth == null
      ? url
      : { url, headers: { Authorization: `Basic ${cluster.basicAuth}` } }
  }

  const { pullFrom, pushTo } = clusters[currentCluster]
  for (const remoteCluster of Object.keys(clusters)) {
    if (remoteCluster === currentCluster) continue
    const { replicated } = clusterHasDatabase(
      replicatorSetup,
      remoteCluster,
      setupInfo
    )
    if (!replicated) continue

    if (includesName(pullFrom, remoteCluster)) {
      documents[`${name}.from.${remoteCluster}`] = {
        continuous: true,
        create_target: false,
        owner: currentUsername,
        source: makeEndpoint(remoteCluster),
        target: makeEndpoint(currentCluster)
      }
    }

    if (includesName(pushTo, remoteCluster)) {
      documents[`${name}.to.${remoteCluster}`] = {
        continuous: true,
        create_target: true,
        create_target_params: options,
        owner: currentUsername,
        source: makeEndpoint(currentCluster),
        target: makeEndpoint(remoteCluster)
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
  replicatorSetup: ReplicatorSetupDocument,
  clusterName: string,
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
  const cluster = replicatorSetup.clusters[clusterName]
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

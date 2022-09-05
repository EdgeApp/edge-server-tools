import {
  asArray,
  asMaybe,
  asObject,
  asString,
  asValue,
  Cleaner
} from 'cleaners'

import { asHealingObject } from '../cleaners/as-healing-object'

interface ReplicatorCluster {
  // The base URI to connect to:
  url: string

  // The base64 "username:password" pair used to authenticate.
  // To get this, run `btoa('username:password')` in a JS console:
  basicAuth?: string

  // Database names to replicate with this cluster.
  // Use an ending '*' for wildcard matching.
  // For example, 'logs-*' matches things like 'logs-2019' or 'logs-2020'.
  exclude?: string[]
  include?: string[]

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
        exclude,
        include,
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
        pullFrom,
        pushTo
      }
    }

    return { ...rest, clusters }
  }

const asClusterRowRaw = asObject({
  url: asMaybe(asString),
  basicAuth: asMaybe(asString),
  exclude: asMaybe(asArray(asString)),
  include: asMaybe(asArray(asString)),
  pullFrom: asMaybe(asArray(asString)),
  pushTo: asMaybe(asArray(asString)),

  // This has been replaced by `pushTo` and `pullFrom`,
  // so we use it to fill the defaults for those two fields.
  mode: asMaybe(asValue('both', 'source', 'target'))
})

const asReplicatorSetupRaw = asObject({
  clusters: asHealingObject(asClusterRowRaw)
})

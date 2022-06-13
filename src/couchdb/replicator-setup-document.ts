import { asArray, asOptional, asString, asValue } from 'cleaners'

import { asHealingObject } from '../cleaners/as-healing-object'

interface ClusterRow {
  // The base URI to connect to:
  url: string

  // The base64 "username:password" pair used to authenticate.
  // To get this, run `btoa('username:password')` in a JS console:
  basicAuth?: string

  // Database names to replicate with this cluster.
  // Use an ending '*' for wildcard matching.
  // The `exclude` list defaults to `[]`.
  // The `include` list defaults to `['*']`.
  exclude?: string[]
  include?: string[]

  // Cluster names to replicate with.
  // Use an ending '*' for wildcard matching.
  // The `pullFrom` list defaults to all peers in "source" mode.
  // The `pushTo` list defaults to all peers in "target" mode.
  //
  // The `mode` flag is deprecated,
  // so it is better to fill these in manually.
  pullFrom?: string[]
  pushTo?: string[]

  // Deprecated. See `pushTo` and `pullFrom`.
  mode?: 'both' | 'source' | 'target'
}

/**
 * A list of nodes to use for replication,
 * indexed by their friendly cluster name.
 */
export interface ReplicatorSetupDocument {
  clusters: {
    [clusterName: string]: ClusterRow
  }
}

const asClusterRow = asHealingObject<ClusterRow>(
  {
    url: asString,
    basicAuth: asString,
    exclude: asOptional(asArray(asString)),
    include: asOptional(asArray(asString)),
    pullFrom: asOptional(asArray(asString)),
    pushTo: asOptional(asArray(asString)),
    mode: asOptional(asValue('both', 'source', 'target'))
  },
  {
    url: '',
    pullFrom: [],
    pushTo: []
  }
)

/**
 * Validates a replicator setup document.
 * Handles errors gracefully for use with with `syncedDocument`.
 */
export const asReplicatorSetupDocument =
  asHealingObject<ReplicatorSetupDocument>(
    {
      clusters: asHealingObject(asClusterRow)
    },
    {
      clusters: {}
    }
  )

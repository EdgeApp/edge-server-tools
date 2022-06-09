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

  // How the replications should take place.
  // If a replicator is a "source", its peers will pull changes from it.
  // If a replicator is a "target", its peers will push their changes to it.
  mode: 'source' | 'target' | 'both'
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
    mode: asValue('source', 'target', 'both')
  },
  {
    url: '',
    mode: 'source'
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

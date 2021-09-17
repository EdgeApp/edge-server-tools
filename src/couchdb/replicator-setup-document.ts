import { asMaybe, asObject, asString, asValue, Cleaner } from 'cleaners'

import { asHealingObject } from '../cleaners/as-healing-object'

/**
 * A list of nodes to use for replication,
 * indexed by their friendly cluster name.
 */
export interface ReplicatorSetupDocument {
  clusters: {
    [clusterName: string]: {
      // The base URI to connect to:
      url: string

      // The base64 "username:password" pair used to authenticate.
      // To get this, run `btoa('username:password')` in a JS console:
      basicAuth?: string

      // How the replications should take place.
      // If a replicator is a "source", its peers will pull changes from it.
      // If a replicator is a "target", its peers will push their changes to it.
      mode: 'source' | 'target' | 'both'
    }
  }
}

/**
 * Validates a replicator setup document.
 * Handles errors gracefully for use with with `syncedDocument`.
 */
export const asReplicatorSetupDocument: Cleaner<ReplicatorSetupDocument> =
  asObject({
    clusters: asHealingObject(
      asObject({
        url: asMaybe(asString, ''),
        basicAuth: asMaybe(asString),
        mode: asMaybe(asValue('source', 'target', 'both'), 'source')
      })
    )
  })

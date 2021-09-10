import { DatabaseCreateParams, MangoSelector } from 'nano'

export type ReplicatorEndpoint =
  | string
  | {
      url: string
      auth?: { basic: { username: string; password: string } }
      headers?: { [name: string]: string }
    }

/**
 * The CouchDb `_replicator` document schema.
 */
export interface ReplicatorDocument {
  owner: string
  source: ReplicatorEndpoint
  target: ReplicatorEndpoint

  cancel?: boolean
  continuous?: boolean
  create_target?: boolean
  create_target_params?: DatabaseCreateParams

  doc_ids?: string[]
  filter?: string
  selector?: MangoSelector
  since_seq?: string
  use_checkpoints?: boolean
  checkpoint_interval?: number

  query_params?: { [name: string]: string }
  source_proxy?: string
  target_proxy?: string

  user_ctx?: { name: string; roles: string[] }
}

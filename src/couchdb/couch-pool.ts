import { asEither, asObject, asOptional, asString } from 'cleaners'
import nano, { ServerScope } from 'nano'

/**
 * A table of CouchDB connections,
 * with one connection highlighted as the default.
 */
export interface CouchPool {
  /** The default connection, to use for most queries. */
  default: ServerScope

  /** The cluster name being used for the default connection. */
  defaultName: string

  /** Lists the clusters that are available for connection. */
  clusterNames: string[]

  /**
   * Grab a connection to a specific cluster.
   * Throws if the name is missing.
   */
  connect: (name: string) => ServerScope

  /** Grabs authentication information for a specific cluster. */
  getCredential: (name: string) => CouchCredential | undefined

  /** Grab a connection, returning undefined if the cluster is missing. */
  maybeConnect: (name: string) => ServerScope | undefined
}

export interface CouchCredential {
  url: string
  username?: string
  password?: string
}

export interface CouchCredentials {
  [name: string]:
    | string
    | CouchCredential
    // The `setupDatabase` function uses this, but it's deprecated:
    | ServerScope
}

export const asCouchCredential = asObject<CouchCredential>({
  url: asString,
  username: asOptional(asString),
  password: asOptional(asString)
})

export const asCouchCredentials = asObject(
  asEither(asCouchCredential, asString)
)

export function connectCouch(url: string): CouchPool
export function connectCouch(
  defaultName: string,
  credentials: CouchCredentials
): CouchPool

/**
 * Returns a CouchDB connection pool.
 */
export function connectCouch(
  urlOrDefaultName: string,
  maybeCreds?: CouchCredentials
): CouchPool {
  // Unpack the arguments:
  const [defaultName, credentials] =
    maybeCreds == null
      ? // Just a URL:
        ['default', { default: urlOrDefaultName }]
      : // Full version:
        [urlOrDefaultName, maybeCreds]

  const cache = new Map<string, ServerScope>()

  function maybeConnect(name: string): ServerScope | undefined {
    // Use the cache, if we have it:
    const cached = cache.get(name)
    if (cached != null) return cached

    // Find the credentials:
    const row = credentials[name]
    if (row == null) return

    // Plain URL:
    if (typeof row === 'string') {
      const connection = nano(row)
      cache.set(name, connection)
      return connection
    }

    // Already-connected nano instance:
    if ('relax' in row) {
      cache.set(name, row)
      return row
    }

    // A credentials object:
    const { url, username, password } = row
    if (username == null || password == null) {
      const connection = nano(url)
      cache.set(name, connection)
      return connection
    }
    const connection = nano({
      url,
      requestDefaults: {
        auth: { username, password }
      }
    })
    cache.set(name, connection)
    return connection
  }

  function connect(name: string): ServerScope {
    const connection = maybeConnect(name)
    if (connection == null) {
      throw new Error(`Cannot find cluster '${name}'`)
    }
    return connection
  }

  function extractUrlCredentials(url: string): CouchCredential {
    const parsed = new URL(url)
    const { username, password } = parsed

    // Remove credentials from the URL:
    parsed.username = ''
    parsed.password = ''
    return {
      url: parsed.toString(),
      username,
      password
    }
  }

  function getCredential(name: string): CouchCredential | undefined {
    const row = credentials[name]
    if (row == null) return
    if (typeof row === 'string') return extractUrlCredentials(row)
    if ('relax' in row) return extractUrlCredentials(row.config.url)

    const cleanUrl = extractUrlCredentials(row.url)
    return {
      url: cleanUrl.url,
      username: row.username ?? cleanUrl.username,
      password: row.password ?? cleanUrl.password
    }
  }

  return {
    default: connect(defaultName),
    defaultName,

    clusterNames: Object.keys(credentials),

    connect,
    getCredential,
    maybeConnect
  }
}

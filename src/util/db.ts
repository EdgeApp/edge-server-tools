export interface CouchConnectionInfo {
  couchUri: string
  hostname: string
  username: string
  password: string
  database: string
  auth: string
}

export function dbUrlInfo(url: string): CouchConnectionInfo {
  const {
    hostname,
    username,
    password,
    pathname: database,
    protocol,
    port
  } = new URL(url)
  const couchUri = `${protocol}//${username}:${password}@${hostname}:${port}`
  const auth = Buffer.from(`${username}:${password}`).toString('base64')

  return {
    couchUri,
    username,
    password,
    hostname,
    database,
    auth
  }
}

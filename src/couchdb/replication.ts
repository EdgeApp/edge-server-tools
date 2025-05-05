import { asArray, asMap, asObject, asString } from 'cleaners'
import nano from 'nano'
import fetch from 'node-fetch'

import { errorCause } from '../util/error-cause'
import { matchJson } from '../util/match-json'

const asServerInfo = asObject({
  couchUrl: asString
})

const asEdgeServersInternalResponse = asObject({
  clusters: asArray(
    asObject({
      location: asString,
      servers: asMap(asServerInfo)
    })
  )
})

/** @deprecated use `setupDatabase` instead. */
export async function autoReplication(
  infoServerAddress: string,
  serverName: string,
  apiKey: string,
  targetUrl: string,
  databases: string[]
): Promise<void> {
  try {
    if (apiKey.length === 0) {
      throw new Error('Missing info server api key')
    }

    const uri = `https://${infoServerAddress}/v1/edgeServersInternal/${serverName}s?apiKey=${apiKey}`
    const response = await fetch(uri, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then(async res => {
        if (res.status !== 200) {
          throw new Error(
            `Failed fetch ${res.status} ${res.statusText} ${await res.text()}`
          )
        }
        return await res.json()
      })
      .then(asEdgeServersInternalResponse)

    for (const cluster of response.clusters) {
      for (const key in cluster.servers) {
        const { couchUrl: sourceUrl } = asServerInfo(cluster.servers[key])

        for (const database of databases) {
          await dbReplication(
            `${sourceUrl}/${database}`,
            `${targetUrl}/${database}`
          )
        }
      }
    }
  } catch (err) {
    throw errorCause(new Error(`Failed auto-replication`), err)
  }
}

/** @deprecated use `setupDatabase` instead. */
export async function dbReplication(
  sourceUrl: string,
  targetUrl: string
): Promise<void> {
  const source = dbUrlInfo(sourceUrl)
  const target = dbUrlInfo(targetUrl)

  try {
    const connection = nano(target.couchUri)
    const replicatorDb = connection.use('_replicator')

    const docId = `${source.hostname}${source.database}__to__${target.hostname}${target.database}`

    const doc = await replicatorDb.get(encodeURIComponent(docId)).catch(err => {
      console.log(err)
      if (err.message === 'missing' || err.message === 'deleted') {
        return { _id: docId }
      }
      throw err
    })

    const updatedDoc = {
      ...doc,
      source: sourceUrl,
      target: targetUrl,
      create_target: true,
      continuous: true
    }

    // If document isn't changed then exit
    if (matchJson(doc, updatedDoc)) return

    await replicatorDb.insert(updatedDoc)
  } catch (err) {
    throw errorCause(
      new Error(`Replication failed for ${target.hostname}`),
      err
    )
  }
}

interface CouchConnectionInfo {
  couchUri: string
  hostname: string
  username: string
  password: string
  database: string
  auth: string
}

function dbUrlInfo(url: string): CouchConnectionInfo {
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

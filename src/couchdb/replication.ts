import nano from 'nano'
import fetch from 'node-fetch'

import { ServerUtilError } from '../util/server-util-error'

export async function autoReplication(
  infoServerAddress: string,
  serverName: string,
  apiKey: string,
  destinationUrl: string
): Promise<void> {
  const uri = `https://${infoServerAddress}/v1/edgeServersInternal/${serverName}s?apiKey=${apiKey}`
  try {
    const result = await fetch(uri, {
      method: 'GET'
    })
    const resultObj = await result.json()
    for (const cluster of resultObj.clusters) {
      for (const serverHostname in cluster.servers) {
        if (
          typeof cluster.servers[serverHostname].username === 'string' &&
          typeof cluster.servers[serverHostname].password === 'string'
        ) {
          const sourceUsername: string =
            cluster.servers[serverHostname].username
          const sourcePassword: string =
            cluster.servers[serverHostname].password
          const sourceUri = `https://${sourceUsername}:${sourcePassword}@${serverHostname}:6984`
          const existingDbsUri = `${sourceUri}/_all_dbs`
          let finalDbList: string[]
          try {
            const existingDbsQuery = await fetch(existingDbsUri, {
              method: 'GET'
            })
            const existingDbs = await existingDbsQuery.json()
            finalDbList = existingDbs.filter(
              dbName => dbName !== '_users' || dbName !== '_replicator'
            )
            for (const db of finalDbList) {
              const fullSourcePath = `${sourceUri}/${db}`
              const fullDestinationPath = `${destinationUrl}/${db}`
              await dbReplication(fullSourcePath, fullDestinationPath)
            }
          } catch (e) {
            throw new ServerUtilError(
              `Replication failed at ${serverHostname}`,
              e
            )
          }
        } else {
          console.log(
            `Username and Password for server ${serverHostname} does not exist, cannot attempt replication.`
          )
        }
      }
    }
  } catch (e) {
    throw new ServerUtilError(`Replication failed`, e)
  }
}

export async function dbReplication(
  sourceUrl: string,
  destinationUrl: string
): Promise<void> {
  try {
    const sourceUrlObj = new URL(sourceUrl)
    const sourceHostname = sourceUrlObj.hostname
    const sourceUsername = sourceUrlObj.username
    const sourcePassword = sourceUrlObj.password
    const sourceDb = sourceUrlObj.pathname
    const destinationUrlObj = new URL(destinationUrl)
    const destinationHostname = destinationUrlObj.hostname
    const destinationUsername = destinationUrlObj.username
    const destinationPassword = destinationUrlObj.password
    const destinationDb = destinationUrlObj.pathname
    const sourceUri = `https://${sourceHostname}:6984`
    const destinationUri = `https://${destinationHostname}:6984`
    const connection = nano(
      `https://${sourceUsername}:${sourcePassword}@${sourceHostname}:6984`
    )
    const replicator = connection.use('_replicator')
    const sourceAuth = Buffer.from(
      `${sourceUsername}:${sourcePassword}`
    ).toString('base64')
    const destinationAuth = Buffer.from(
      `${destinationUsername}:${destinationPassword}`
    ).toString('base64')
    const obj = {
      _id: `${sourceUri}${sourceDb}-${destinationUri}${destinationDb}-replication`,
      source: {
        url: `${sourceUri}${sourceDb}`,
        headers: {
          Authorization: `Basic ${sourceAuth}`
        }
      },
      target: {
        url: `${destinationUri}${destinationDb}`,
        headers: {
          Authorization: `Basic ${destinationAuth}`
        }
      },
      create_target: true,
      continuous: true
    }
    await replicator.insert(obj)
  } catch (e) {
    throw new ServerUtilError(`Replication failed to start`, e)
  }
}

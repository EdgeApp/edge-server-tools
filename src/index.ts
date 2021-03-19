import cluster from 'cluster'
import nano from 'nano'
import fetch from 'node-fetch'
import { cpus } from 'os'

import { matchJson } from './match-json'

export interface UserInfo {
  couchUri: string
  name: string
  password: string
  databases?: string[]
}

export class ServerUtilError extends Error {
  response: object

  constructor(message: string, response: object) {
    super(message)
    this.response = response
  }
}

export async function createRegularUser(userInfo: UserInfo): Promise<void> {
  const user = {
    name: userInfo.name,
    password: userInfo.password,
    roles: [],
    type: 'user'
  }
  const completeUri = `${userInfo.couchUri}/_users/org.couchdb.user:${userInfo.name}`
  const response = await fetch(completeUri, {
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'PUT',
    body: JSON.stringify(user)
  })
  if (response.ok === false) {
    const errorResponse = await response.json()
    if (errorResponse.error !== 'conflict') {
      throw new ServerUtilError(
        `Could not create user ${userInfo.name}`,
        errorResponse
      )
    }
  }
  if (userInfo.databases != null) {
    for (const database of userInfo.databases) {
      const databaseUri = `${userInfo.couchUri}/${database}/_security`
      const fetchResponse = await fetch(databaseUri, {
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'GET'
      })
      const fetchResponseObj = await fetchResponse.json()
      if (fetchResponseObj.members.names == null) {
        fetchResponseObj.members.names = []
      }
      if (fetchResponseObj.members.names.includes(userInfo.name) === false) {
        fetchResponseObj.members.names.push(userInfo.name)
      }
      const insertResponse = await fetch(databaseUri, {
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'PUT',
        body: JSON.stringify(fetchResponseObj)
      })
      if (insertResponse.ok === false) {
        const errorResponse = await response.json()
        throw new ServerUtilError(
          `Could not give user ${userInfo.name} access to database ${database}`,
          errorResponse
        )
      }
    }
  }
}

export interface AdminUserInfo {
  couchUri: string
  name: string
  password: string
}

export async function createAdminUser(userInfo: AdminUserInfo): Promise<void> {
  const completeUri = `${userInfo.couchUri}/_node/_local/_config/admins/${userInfo.name}`
  const response = await fetch(completeUri, {
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'PUT',
    body: JSON.stringify(userInfo.password)
  })
  if (response.ok === false) {
    const errorResponse = await response.json()
    throw new ServerUtilError(
      `Could not create user ${userInfo.name}`,
      errorResponse
    )
  }
}

/**
 * Describes a single database that should exist.
 */
export interface CouchSetup {
  [dbName: string]: {
    // Documents that should exactly match:
    documents?: { [id: string]: object }

    // Documents that we should create, unless they already exist:
    templates?: { [id: string]: object }
  }
}

/**
 * Ensures that the requested databases exist in Couch.
 */
export async function prepareCouch(
  couchUri: string,
  setupInfo: CouchSetup
): Promise<void> {
  const connection = nano(couchUri)
  const existingDbs = await connection.db.list()

  for (const name of Object.keys(setupInfo)) {
    const { documents = {}, templates = {} } = setupInfo[name]

    // Create missing databases:
    if (!existingDbs.includes(name)) {
      await connection.db.create(name)
      console.log(`Created database "${name}"`)
    }
    const currentDb: nano.DocumentScope<any> = connection.db.use(name)

    // Update documents:
    for (const id of Object.keys(documents)) {
      const { _id, _rev, ...rest } = await currentDb.get(id).catch(() => ({}))

      if (matchJson(documents[id], rest) === false) {
        await currentDb.insert({ _id: id, _rev, ...documents[id] })
        console.log(`Wrote document "${id}" in database "${name}".`)
      }
    }

    // Create template documents:
    for (const id of Object.keys(templates)) {
      const { _id } = await currentDb.get(id).catch(() => ({}))

      if (_id == null) {
        await currentDb.insert({ _id: id, ...documents[id] })
        console.log(`Wrote document "${id}" in database "${name}".`)
      }
    }
  }
}

/**
 * Describes a single database that should exist.
 */
export interface CouchDbInfo {
  name: string
  indexes?: Array<{
    index: {
      fields: string[]
      partial_filter_selector?: any
    }
    ddoc: string
    name: string
    type: 'json'
  }>
  views?: Array<{
    name: string
    views: {
      [viewName: string]: {
        map?: string
        reduce?: string
      }
    }
  }>
}

/**
 * Ensures that the requested databases exist in Couch.
 */
export async function rebuildCouch(
  couchUri: string,
  dbs: CouchDbInfo[]
): Promise<void> {
  const nanoDb = nano(couchUri)

  // get a list of all databases within couchdb
  const result = await nanoDb.db.list()

  // if database does not exist, create it
  for (const db of dbs) {
    if (!result.includes(db.name)) {
      await nanoDb.db.create(db.name)
      console.log(`Created Database ${db.name}`)
    }
    // create indexes/views
    const currentDb: nano.DocumentScope<any> = nanoDb.db.use(db.name)
    if (db.indexes != null) {
      for (const dbIndex of db.indexes) {
        try {
          await currentDb.get(`_design/${dbIndex.ddoc}`)
          console.log(`${db.name} already has '${dbIndex.name}' index.`)
        } catch {
          await currentDb.createIndex(dbIndex)
          console.log(`Created '${dbIndex.name}' index for ${db.name}.`)
        }
      }
    }
    if (db.views != null) {
      for (const dbView of db.views) {
        try {
          await currentDb.get(`_design/${dbView.name}`)
          console.log(`${db.name} already has '${dbView.name}' view.`)
        } catch {
          await currentDb.insert({
            _id: `_design/${dbView.name}`,
            views: dbView.views
          })
          console.log(`Created '${dbView.name}' view for ${db.name}.`)
        }
      }
    }
  }
  console.log('Finished Database Setup.')
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
          const sourceUsername = cluster.servers[serverHostname].username
          const sourcePassword = cluster.servers[serverHostname].password
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

export interface PeriodicTask {
  start(): void
  stop(): void

  // True once start is called, false after stop is called:
  started: boolean
}

/**
 * Schedule a repeating task, with the specified gap between runs.
 */
export function makePeriodicTask(
  task: () => Promise<void> | void,
  msGap: number,
  opts: {
    onError?: (error: any) => void
  } = {}
): PeriodicTask {
  const {
    onError = (e: any) => {
      // do nothing
    }
  } = opts

  // A started task will keep bouncing between running & waiting.
  // The `running` flag will be true in the running state,
  // and `timeout` will have a value in the waiting state.
  let running = false
  let timeout: any

  function run(): void {
    timeout = undefined
    if (!out.started) return
    running = true
    new Promise(resolve => resolve(task())).catch(onError).then(wait, wait)
  }

  function wait(): void {
    running = false
    if (!out.started) return
    timeout = setTimeout(run, msGap)
  }

  const out = {
    started: false,

    start(): void {
      out.started = true
      if (!running && timeout == null) run()
    },

    stop(): void {
      out.started = false
      if (timeout != null) {
        clearTimeout(timeout)
        timeout = undefined
      }
    }
  }
  return out
}

export function forkChildren(customNumCpus?: number): void {
  const numCPUs = cpus().length
  const instanceCount = customNumCpus ?? numCPUs

  // Fork workers.
  for (let i = 0; i < instanceCount; i++) {
    cluster.fork()
  }
  // Restart workers when they exit
  cluster.on('exit', (worker, code, signal) => {
    console.log(
      `Worker ${worker.process.pid} died with code ${code} and signal ${signal}`
    )
    console.log(`Forking new worker process...`)
    cluster.fork()
  })
}
import nano from 'nano'

import { matchJson } from '../util/match-json'

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

      if (!matchJson(documents[id], rest)) {
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

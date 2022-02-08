import {
  asBoolean,
  asDate,
  asObject,
  asOptional,
  Cleaner,
  uncleaner
} from 'cleaners'
import nano, {
  DocumentBulkResponse,
  DocumentInsertResponse,
  DocumentListParams,
  DocumentViewParams,
  MangoQuery,
  ServerScope
} from 'nano'

import {
  asCouchDoc,
  CouchDoc,
  DatabaseSetup,
  makePeriodicTask,
  setupDatabase,
  SetupDatabaseOptions
} from '..'
import { PeriodicMonth, pickPeriodicMonth } from '../util/periodic-month'
import { withMutex } from '../util/with-mutex'

/**
 * Describes a rolling collection of Couch databases that should exist.
 */
export interface RollingDatabaseSetup<T> extends DatabaseSetup {
  // How far back should we create archive databases:
  archiveStart?: Date

  // Cleans documents stored in the databases:
  cleaner: Cleaner<T>

  // Extracts the date from a stored document:
  getDate: (doc: CouchDoc<T>) => Date

  // How often to create new databases:
  period: PeriodicMonth
}

/**
 * Arguments to the rolling database mango query.
 */
export interface RollingMangoQuery
  extends Pick<MangoQuery, 'limit' | 'selector' | 'sort'> {
  // How far in the past we should look. Defaults to no limit:
  afterDate?: Date

  // Which partition should we use:
  partition?: string

  // Include archived databases:
  useArchived?: boolean
}

/**
 * Arguments to the rolling database view query.
 */
export interface RollingViewParams extends DocumentViewParams {
  // How far in the past we should look. Defaults to no limit:
  afterDate?: Date

  // Which partition should we use:
  partition?: string

  // Include archived databases:
  useArchived?: boolean
}

export interface RollingDatabase<T> {
  bulk: (
    connection: ServerScope,
    docs: Array<CouchDoc<T>>
  ) => Promise<DocumentBulkResponse[]>

  find: (
    connection: ServerScope,
    query: RollingMangoQuery
  ) => Promise<Array<CouchDoc<T>>>

  list: (
    connection: ServerScope,
    params: RollingViewParams
  ) => Promise<Array<CouchDoc<T>>>

  view: (
    connection: ServerScope,
    design: string,
    view: string,
    params: RollingViewParams
  ) => Promise<Array<CouchDoc<T>>>

  insert: (
    connection: ServerScope,
    doc: CouchDoc<T>
  ) => Promise<DocumentInsertResponse>

  setup: (
    connection: ServerScope,
    opts?: SetupDatabaseOptions
  ) => Promise<() => void>
}

/**
 * A list of rolling databases, sorted newest-first.
 *
 * Each database covers a particular date range of documents.
 * Queries will ignore errors in databases that start in the future.
 * This makes it possible to add databases to this list without
 * causing races - as long as the start date is in the future,
 * the setup routine will have time to create the new database
 * before the query routines try to access it and fail.
 */
type RollingDatabaseList = Array<{
  // True to ignore this database:
  archived: boolean

  // The database name:
  name: string

  // The date we start writing documents to this database:
  startDate: Date
}>

export function makeRollingDatabase<T>(
  setupInfo: RollingDatabaseSetup<T>
): RollingDatabase<T> {
  const {
    name,
    archiveStart,
    cleaner,
    getDate,
    period,
    replicatorSetup,
    ...setupRest
  } = setupInfo
  const asDoc = asCouchDoc(cleaner)
  const wasDoc = uncleaner(asDoc)

  let databases: RollingDatabaseList = []

  async function bulk(
    connection: ServerScope,
    docs: Array<CouchDoc<T>>
  ): Promise<DocumentBulkResponse[]> {
    const lists: { [target: string]: unknown[] } = {}
    for (const doc of docs) {
      const target = pickTarget(getDate(doc))
      if (lists[target] == null) lists[target] = []
      lists[target].push(wasDoc(doc))
    }

    const out: DocumentBulkResponse[] = []
    for (const target of Object.keys(lists)) {
      const result = await connection.use(target).bulk({ docs: lists[target] })
      out.push(...result)
    }
    return out
  }

  async function rollingQuery(
    connection: ServerScope,
    callback: (
      db: nano.DocumentScope<unknown>,
      count: number
    ) => Promise<Array<CouchDoc<T>>>,
    opts: { afterDate?: Date; limit?: number; useArchived?: boolean } = {}
  ): Promise<Array<CouchDoc<T>>> {
    const { afterDate, limit, useArchived = false } = opts

    let out: Array<CouchDoc<T>> = []
    for (const database of databases) {
      if (database.archived && !useArchived) continue
      const db = connection.use(database.name)
      const response = await callback(db, out.length).catch(error => {
        if (database.startDate.valueOf() < Date.now()) throw error
        return []
      })
      out = out.concat(response)

      // Stop once we have enough results:
      if (
        (limit != null && out.length >= limit) ||
        (afterDate != null &&
          database.startDate.valueOf() <= afterDate.valueOf())
      )
        break
    }

    return out
  }

  async function find(
    connection: ServerScope,
    opts: RollingMangoQuery
  ): Promise<Array<CouchDoc<T>>> {
    const { afterDate, limit = 20, partition, selector, sort } = opts

    return await rollingQuery(
      connection,
      async (db, count) => {
        const query = { limit: limit - count, selector, sort }
        const response = await (partition == null
          ? db.find(query)
          : db.partitionedFind(partition, query))
        return response.docs.map(doc => asDoc(doc))
      },
      { afterDate, limit }
    )
  }

  async function list(
    connection: ServerScope,
    opts: RollingViewParams
  ): Promise<Array<CouchDoc<T>>> {
    const { afterDate, limit, partition, ...rest } = opts

    return await rollingQuery(
      connection,
      async (db, count) => {
        const params: DocumentListParams = { ...rest, include_docs: true }
        if (limit != null) params.limit = limit - count
        const response = await (partition == null
          ? db.list(params)
          : db.partitionedList(partition, params))
        return response.rows.map(row => asDoc(row.doc))
      },
      { afterDate, limit }
    )
  }

  async function view(
    connection: ServerScope,
    design: string,
    view: string,
    opts: RollingViewParams
  ): Promise<Array<CouchDoc<T>>> {
    const { afterDate, limit, partition, ...rest } = opts

    return await rollingQuery(
      connection,
      async (db, count) => {
        const params: DocumentViewParams = { ...rest, include_docs: true }
        if (limit != null) params.limit = limit - count
        const response = await (partition == null
          ? db.view(design, view, params)
          : db.partitionedView(partition, design, view, params))
        return response.rows.map(row => asDoc(row.doc))
      },
      { afterDate, limit }
    )
  }

  // Find a specific database that includes a particular date:
  function pickTarget(date: Date): string {
    for (const database of databases) {
      if (database.startDate.valueOf() > date.valueOf()) continue
      return database.name
    }
    throw new Error(`No rolling database exists for ${date.toISOString()}`)
  }

  async function insert(
    connection: ServerScope,
    doc: CouchDoc<T>
  ): Promise<DocumentInsertResponse> {
    const target = pickTarget(getDate(doc))
    return await connection.use(target).insert(wasDoc(doc))
  }

  async function setup(
    connection: ServerScope,
    opts: SetupDatabaseOptions = {}
  ): Promise<() => void> {
    let cleanups: Array<() => void> = []
    const {
      disableWatching = false,
      log = console.log,
      onError = error => {
        log(`Error while maintaining "${name}" databases: ${String(error)}`)
      }
    } = opts

    // Ensure we have a list database:
    const listDbSetup: DatabaseSetup = {
      name: `${name}-list`,
      replicatorSetup,
      onChange() {
        readDbList().catch(onError)
      }
    }
    const listDbCleanup = await setupDatabase(connection, listDbSetup, opts)
    const listDb = connection.use(listDbSetup.name)

    /**
     * Reads and processes the list database's contents.
     */
    const readDbList = withMutex(async function readDbList(): Promise<void> {
      const now = new Date()

      const response = await listDb.list({ include_docs: true })
      let list: RollingDatabaseList = response.rows
        .map(row => {
          const clean = asListEntry(row.doc)
          return {
            archived: clean.doc.archived,
            name: clean.id,
            startDate: clean.doc.startDate
          }
        })
        .sort((a, b) => b.startDate.valueOf() - a.startDate.valueOf())

      async function addDb(
        name: string,
        startDate: Date,
        archived = false
      ): Promise<void> {
        await listDb.insert(
          wasListEntry({ id: name, doc: { archived, startDate } })
        )
        list = [{ archived, name, startDate }, ...list]
      }

      // Create past databases if the list is empty:
      if (list.length === 0) {
        if (archiveStart == null) {
          const [date, suffix] = pickPeriodicMonth(now, period, false)
          await addDb(`${name}-${suffix}`, date)
        } else {
          for (
            let [date, suffix] = pickPeriodicMonth(archiveStart, 'year', false);
            date.valueOf() < now.valueOf();
            [date, suffix] = pickPeriodicMonth(date, 'year', true)
          ) {
            await addDb(`${name}-${suffix}`, date)
          }
        }
      }

      // Always keep one spare database in the future:
      const lastStart = list[0].startDate
      if (lastStart.valueOf() < now.valueOf()) {
        const [date, suffix] = pickPeriodicMonth(now, period, true)
        await addDb(`${name}-${suffix}`, date)
      }

      // Ensure that each new database exists:
      cleanups.forEach(cleanup => cleanup())
      cleanups = []
      for (const { archived, name } of list) {
        const setup: DatabaseSetup = { name, ...setupRest }
        if (archived) {
          setup.ignoreMissing = true
        } else {
          setup.replicatorSetup = replicatorSetup
        }
        cleanups.push(await setupDatabase(connection, setup, opts))
      }

      // Make the list available to queries:
      databases = list
    })

    // Do the initial processing:
    await readDbList()

    // Periodically create new databases:
    const creationTask = makePeriodicTask(
      async () => await readDbList(),
      24 * 60 * 60 * 1000,
      { onError }
    )
    if (!disableWatching) creationTask.start({ wait: true })

    // Return a cleanup function:
    return () => {
      cleanups.forEach(cleanup => cleanup())
      creationTask.stop()
      listDbCleanup()
    }
  }

  return { bulk, find, list, view, insert, setup }
}

const asListEntry = asCouchDoc(
  asObject({
    archived: asOptional(asBoolean, false),
    startDate: asDate
  })
)
const wasListEntry = uncleaner(asListEntry)

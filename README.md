# edge-server-utils

The [Edge Wallet](https://edge.app) uses a variety of back-end micro-services, including encrypted key backup, exchange rates, mining fees, and so forth. Most of these services use an Express frontend talking touch a CouchDB database, so this library contains common utility functions for working with these technologies.

## Couch Utilities

### asCouchDoc

This cleaner function validates the `_id` and `_rev` properties on a database document, and them removes them from the payload data. The clean payload is available as a `doc` property on the returned object:

```js
// The "pure" payload, without Couch stuff:
const asLogItem = asObject({
  where: asString,
  when: asDate
})

// The payload with Couch fields:
const asCouchLogItem = asCouchDoc(asLogItem)

// Cleaning a Couch document returns this,
// where the `doc` has `_id` and `_rev` removed:
const { id, rev, doc } = asCouchLogItem(raw)
```

To reverse this, just use the un-cleaner version:

```js
const wasCouchLogItem = uncleaner(asCouchLogItem)

await db.insert(wasCouchLogItem({
  id,
  rev, // Optional
  doc: { where, when }
}))
```

### forEachDocument

This method iterates over the documents in a database, calling a callback for each one. It accepts an optional Mango selector.

```js
declare async function forEachDocument(
  db: DocumentScope<any>,
  callback: (document: unknown) => void | Promise<void>,
  opts?: {
    selector?: MangoSelector
  }
): Promise<void>
```

### makeIndexDocument

This method creates a design document describing a Mango index.

```js
declare export function makeIndexDocument(
  name: string,
  fields: SortSyntax,
  opts?: {
    filter?: MangoSelector,
    partitioned?: boolean
  }
): MangoDesignDocument
```

This is useful with `setupDatabase`.

### setupDatabase

This method takes a database description, and then ensures that Couch contains a matching database. This is especially useful for ensuring that the correct views and indexes exist before starting the server application.

```js
const logDbSetup = {
  name: 'logs',
  options: { partitioned: true },
  documents: {
    '_design/location': makeIndexDocument('location', ['where'])
  },
  templates: {
    'example-document': {
      where: 'here',
      when: new Date()
    }
  }
}

await setupDatabase(logDbSetup)
```

This method will update `documents` included in the setup object, so they exactly match. It will upload `templates` only if the database doesn't already contain a document with this name.

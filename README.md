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

await db.insert(
  wasCouchLogItem({
    id,
    rev, // Optional
    doc: { where, when }
  })
)
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

  syncedDocuments: [settings],
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

await setupDatabase(couchConnection, logDbSetup)
```

The setup object has many options:

- `name` is the name of the database to create or update.
- `options` are Couch database creation options.
- `documents` will be uploaded to the database, unless a document with matching contents exists.
- `templates` will be uploaded to the database, unless a document with the same name exists.
- `syncedDocuments` will be kept in sync by subscribing to the changes feed.

### syncedDocument

This function creates a Couch document babysitter, which ensures that the document exists and is clean.

This function accepts a cleaner, which it uses to validate the document. The cleaner should be able to turn the empty object (`{}`) into a valid fallback value, such as by using `asMaybe`. This will be used to repair broken or missing documents.

The `syncedDocument` return value has a copy of the document contents, as well as methods for syncing with the database and subscribing to changes.

```js
const settings = syncedDocument('settings', asSettings)

// Do an initial sync:
await settings.sync()

// These are now initialized:
console.log(settings.doc, settings.id, settings.rev)

// Watch for changes (still requires `sync` to fetch changes):
settings.onChange((doc) => console.log('update', doc))
```

Passing a synced document to `setupDatabase` will subscribe to live changes, so the document will stay up-to-date automatically. Otherwise, just call `sync` periodically to poll for changes.

## Cleaners

We use the [cleaners](https://cleaners.js.org) extensively for data validation, so this library includes a few helpful ones.

### asHealingObject

This is like the built-in [`asObject` cleaner](https://cleaners.js.org/#/reference?id=asobject), but it replaces or removes broken properties instead of throwing an exception. When cleaning an object with a specific shape, this requires a fallback object:

```js
const asMessage = asHealingObject(
  {
    to: asString,
    body: asString
  },
  { to: '', body: '' }
)

asHealingObject({ body: 'hi' }) // returns { to: '', body: 'hi' }
```

When cleaning a key-value object, this will simply remove invalid entries:

```js
const asSizes = asHealingObject(asNumber)

// returns { small: 1, big: 10 }:
asSizes({ small: 1, big: 10, huge: '11' })
```

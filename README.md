# edge-server-utils

The [Edge Wallet](https://edge.app) uses a variety of back-end micro-services, including encrypted key backup, exchange rates, mining fees, and so forth. Most of these services use an Express frontend talking touch a CouchDB database, so this library contains common utility functions for working with these technologies.

Cleaners:

- [`asCouchDoc`](./docs/as-couch-doc.md) - A cleaner for dealing with the `_id` and `_rev` fields CouchDB adds to documents.
- [`asHealingObject`](./docs/as-healing-object.md) - A cleaner for repairing damaged objects using default values.

CouchDB utilities:

- `bulkGet` - Nano forgot to implement this method for some reason.
- `makeRollingDatabase` - Treats a collection of databases as a single large database, organized by date range.
- [`viewToStream`](./docs/view-to-stream.md) - Iterates over the documents in a database, partition, or view.

CouchDB setup tools:

- [`setupDatabase`](./docs/couch-setup.md) - Automatically creates a database, sets up replication and design documents, and subscribes to the changes feed.
- [`makeJsDesign`](./docs/couch-setup.md#makeJsDesign) - Creates a JavaScript design document.
- [`makeMangoIndex`](./docs/couch-setup.md#makeMangoIndex) - Creates a Mango index design document.
- [`syncedDocument`](./docs/couch-setup.md#watching-settings-documents) - Watches a settings document for changes.

Other stuff:

- `forkChildren` - Used for Node.js clustering.
- `errorCause` - Adds an `error.cause` property.
- `matchJson` - Returns `true` if two JSON-style objects match.
- `makePeriodicTask` - Starts a periodic async task, with error handling and other features.

Deprecated stuff:

- `autoReplication` - Deprecated. Use the new `setupDatabase` stuff.
- `createAdminUser`
- `createRegularUser`
- [`forEachDocument`](./docs/for-each-document.md) - Iterates over the documents in a Couch database. Use `viewToStream` instead.

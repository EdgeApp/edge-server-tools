# edge-server-tools

## 0.2.17 (2022-09-12)

- added: Add a `DatabaseSetup.tags` array, which we match with the `include` and `exclude` filters in addition to the database name.
- changed: Auto-upgrade replication setup documents in the database. Deprecated fields will turn into modern fields.
- changed: Use replication documents to control which databases should exist on which clusters.
- changed: Add an `#archived` tag to rolling databases that have the `archived` mode, instead of setting `ignoreMissing` to true.
- deprecated: Replace the `ignoreMissing` flag with the tagging and filtering system.

## 0.2.16 (2022-08-31)

- added: Add a `RollingDatabase.reduce` method.
- fixed: Correctly handle `useArchived` in all rolling database methods.

## 0.2.15 (2022-07-21)

- added: Add a `AggregateError` ponyfill and related utilities.
- added: Expose our Couch error cleaners for outside consumption.

## 0.2.14 (2022-07-18)

- changed: Merge the `include` and `exclude` lists from the source and destination replication targets. Before, we only considered the destination.

## 0.2.13 (2022-07-07)

- added: Add a `viewToStream` utility function.
- deprecated: Deprecate the `forEachDocument` utility. Use `viewToStream` instead.

## 0.2.12 (2022-06-21)

- fixed: Do not auto-replicate databases that are set to `ignoreMissing`, such as archived rolling databases.

## 0.2.11 (2022-06-13)

- added: Accept `pushTo` and `pullFrom` fields in the replicator setup document.
- changed: Accept `replicatorSetup` as a `setupDatabase` config option.
- changed: Reorganize the documentation, including a more tutorial-like section about database setup.
- deprecated: Replicator setup documents should remove `mode` and use `pushTo` or `pullFrom` instead.
- deprecated: `DatabaseSetup.replicatorSetup`. Pass this in the options parameter instead.

## 0.2.10 (2022-03-09)

- added: Add `RollingDatabase.listAsStream` and `RollingDatabase.viewAsStream` methods.

## 0.2.9 (2022-02-07)

- added: Add a `makeRollingDatabase` function to manage collections of time-based databases.

## 0.2.8 (2021-11-15)

- added: Return cleanup routines from `setupDatabase` & `watchDatabase`.
- added: Add a `DatabaseSetup.onChange` callback.
- added: Add a `SetupDatabaseOptions.onError` callback.
- fixed: Make `SetupDatabaseOptions.disableWatching` work as expected.

## 0.2.7 (2021-10-28)

- fixed: Create Mango views with the `partitioned` flag as-passed.
- fixed: Make database creation more reliable.
- added: Add a `makeJsDesign` helper function.
- added: Add `include` and `exclude` filters to the replication setup document.

## 0.2.6 (2021-09-30)

- fixed: Fix the auto-generated replication document names to use periods.

## 0.2.5 (2021-09-17)

- added: Documentation for the `syncedDocument` function
- added: Give the `databaseSetup` helper replication setup options.
- changed: Loosen the `errorCause` types to allow `unknown` causes.
- deprecated: The `autoReplication` functionality has been replaced by `databaseSetup`, and will be removed in the next breaking release.

## 0.2.4 (2021-09-07)

- added: A `SyncedDocument` type, which keeps a document clean on the database, and maintains a local in-memory copy as well.
- added: A `watchDatabase` function, which subscribes to changes in a CouchDB database.
- added: A `CouchSetup.syncedDocuments` parameter to automatically set up (and maybe watch) synced documents.
- added: A `disableWatching` option to the `setupDatabase` function.
- added: A `wait` option to the `PeriodicTask.start` method.

## 0.2.3 (2021-06-30)

- fixed: Improve compatibility with older Node.js versions without `??` support.

## 0.2.2 (2021-06-30)

- added: Declare the CouchDb `emit` method as a global variable.

## 0.2.1 (2021-06-29)

- fixed: Create template documents with the correct contents.

## 0.2.0 (2021-06-25)

- added: A `asCouchDoc` cleaner function.
- added: A `forEachDocument` Couch utility function.
- added: A `bulkGet` Couch utility function.
- added: A new `setupDatabase` helper to replace `prepareCouch` and `rebuildCouch`.
- added: Type definitions & helper methods for working with design documents.
- added: A new `errorCause` function based on the [error cause TC39 proposal](https://github.com/tc39/proposal-error-cause).
- changed: Add ESM entry point for modern Node.js versions.
- changed: Add required `databases` parameter to `autoReplication`.
- changed: Improve error handling, removing `ServerUtilError` in favor of `errorCause`.
- fixed: Improved `autoReplication` and `dbReplication` functions.
- removed: `prepareCouch` - Use `setupDatabase` instead.
- removed: `rebuildCouch` - Use `setupDatabase` instead.
- removed: `ServerUtilError` - Use `errorCause` instead.

## 0.1.0 (2021-03-19)

- added: Initial publish

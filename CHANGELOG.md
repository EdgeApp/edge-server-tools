# edge-server-tools

## 0.2.4 (2021-09-07)

### Added

- Add a `SyncedDocument` type, which keeps a document clean on the
  database, and maintains a local in-memory copy as well.
- Add a `watchDatabase` function, which subscribes to changes
  in a CouchDB database.
- Add a `CouchSetup.syncedDocuments` parameter to automatically
  set up (and maybe watch) synced documents.
- Add a `disableWatching` option to the `setupDatabase` function.
- Add a `wait` option to the `PeriodicTask.start` method.

## 0.2.3 (2021-06-30)

### Fixed

- Improve compatibility with older Node.js versions without `??` support.

## 0.2.2 (2021-06-30)

### Added

- Declare the CouchDb `emit` method as a global variable.

## 0.2.1 (2021-06-29)

### Fixes

- Create template documents with the correct contents.

## 0.2.0 (2021-06-25)

### Fixes

- Improved `autoReplication` and `dbReplication` functions.

### Changes

- Add ESM entry point for modern Node.js versions.
- Add required `databases` parameter to `autoReplication`.
- Replace database setup methods `prepareCouch` and `rebuildCouch` with a new `setupDatabase` helper.
- Improve error handling, removing `ServerUtilError` in favor of `errorCause`.

### Added

- Add `asCouchDoc` cleaner function.
- Add `forEachDocument` Couch utility function.
- Add `bulkGet` Couch utility function.
- Add type definitions & helper methods for working with design documents.
- New `errorCause` based on the [error cause TC39 proposal](https://github.com/tc39/proposal-error-cause).

### Removed

- `prepareCouch` - Use `setupDatabase` instead.
- `rebuildCouch` - Use `setupDatabase` instead.
- `ServerUtilError` - Use `errorCause` instead.

## 0.1.0 (2021-03-19)

### Changed

- Initial publish

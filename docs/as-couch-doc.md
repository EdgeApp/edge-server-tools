# asCouchDoc

This cleaner function validates the `_id` and `_rev` properties on a database document, and them removes them from the payload data. The clean payload is available as a `doc` property on the returned object:

```js
// This is what we want to store, without Couch stuff:
const asLogItem = asObject({
  where: asString,
  when: asDate
})

// Adds Couch fields to `asLogItem`:
const asCouchLogItem = asCouchDoc(asLogItem)

// Cleaning a Couch document returns this:
const { id, rev, doc } = asCouchLogItem(raw)

// The `doc` will have `_id` and `_rev` removed:
const { where, when } = doc
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

# viewToStream

This function streams the results of a CouchDB view or list function. This allows views to work smoothly with the `for await` Javascript syntax.

It uses a callback function to perform the actual query, which it performs repeatedly until it reaches the end. This means memory usage will stay bounded, even if the database has millions of documents.

```js
const db = connection.db.use('something')

// Iterate over every document in the database:
for await (const doc of viewToStream(async (params) => {
  return await db.list(params)
})) {
  console.log(doc)
}

// Iterate over every document in partition:
for await (const doc of viewToStream(async (params) => {
  return await db.partitionedList('somePartition', params)
})) {
  console.log(doc)
}

// Iterate over every document in a view:
for await (const doc of viewToStream(async (params) => {
  return await db.view('someDesign', 'someView', {
    start_key: 'a',
    end_key: 'z',
    ...params, // This should always come last.
  })
})) {
  console.log(doc)
}
```

If you would like to transform one of these async streams, such as by cleaning the results, JavaScript has nice syntax for this:

```ts
const asMessageDoc = asCouchDoc(
  asObject({
    message: asString,
  })
)

async function* streamAllMessages(
  connection: ServerScope
): AsyncIterableIterator<string> {
  const db = connection.db.use('messages')

  // Clean and filter the raw documents:
  for await (const doc of viewToStream(async (params) => {
    return await db.list(params)
  })) {
    const clean = asMaybe(asMessageDoc)(doc)
    if (clean == null) continue

    yield clean.doc.message
  }
}
```

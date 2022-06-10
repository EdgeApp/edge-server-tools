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

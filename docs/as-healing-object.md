# asHealingObject

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

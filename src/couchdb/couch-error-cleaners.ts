import { asMaybe, asObject, asValue } from 'cleaners'

export const asMaybeConflictError = asMaybe(
  asObject({
    error: asValue('conflict')
  })
)

export const asMaybeExistsError = asMaybe(
  asObject({
    error: asValue('file_exists')
  })
)

export const asMaybeNotFoundError = asMaybe(
  asObject({
    error: asValue('not_found')
  })
)

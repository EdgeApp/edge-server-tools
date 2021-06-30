// Functions accessible within CouchDb design documents.
//
// The complete list is here:
// https://docs.couchdb.org/en/stable/query-server/javascript.html
// Many of these are either deprecated or redundant with built-in JS things,
// so we keep this list trimmed down to the bare essentials,
// to avoid polluting the global namespace as much as possible.
declare global {
  function emit(key?: unknown, value?: unknown): void
}

export interface JsView {
  map: string
  reduce?: string
  options?: {
    local_seq?: boolean
    include_design?: boolean
  }
}

export interface JsDesignDocument {
  language: 'javascript'
  options?: {
    partitioned?: boolean
  }
  validate_doc_update?: string
  views: { [name: string]: JsView }
}

/**
 * Helper for turning view code into strings.
 */
export function stringifyCode(code: (...args: any[]) => void): string {
  return code.toString().replace(/ +/g, ' ')
}

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
  map?: string
  reduce?: string
  filter?: string
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
 * Global variables available to Couch design methods.
 */
interface CouchGlobals<Lib> {
  emit: (key?: unknown, value?: unknown) => void

  log: (message: unknown) => void

  require: <Name extends string & keyof Lib>(
    path: `views/lib/${Name}`
  ) => Lib[Name]
}

/**
 * Functions that might be defined in a Couch design document.
 */
interface JsDesignMethods {
  map?: (doc: any) => void

  reduce?:
    | ((keys: any[], values: any[], rereduce: boolean) => any)
    | '_approx_count_distinct'
    | '_count'
    | '_stats'
    | '_sum'

  filter?: (doc: any, request: any) => boolean

  validate_doc_update?: (
    newDoc: any,
    oldDoc: any,
    userContext: any,
    security: any
  ) => void
}

/**
 * Helper for turning view code into strings.
 */
export function stringifyCode(code: (...args: any[]) => unknown): string {
  return code.toString().replace(/ +/g, ' ')
}

interface JsDesignOptions<Lib> {
  /** Methods available using 'require'. */
  lib?: Lib

  /**
   * Transforms the Javascript source code.
   * This could be anything from a simple search & replace
   * to running something complicated like Babel.
   */
  fixJs?: (code: string) => string

  // Couch options:
  include_design?: boolean
  local_seq?: boolean
  partitioned?: boolean
}

/**
 * Helper function for creating JS design documents.
 */
export function makeJsDesign<Lib extends { [name: string]: Function } = {}>(
  name: string,
  makeMethods: (globals: CouchGlobals<Lib>) => JsDesignMethods,
  opts: JsDesignOptions<Lib> = {}
): JsDesignDocument {
  const { lib, fixJs = code => code, partitioned } = opts
  function jsToString(code: Function): string {
    return fixJs(code.toString().replace(/\n\s*/g, '\n'))
  }

  // Pass dummy globals to the methods:
  const {
    map,
    reduce,
    filter,
    validate_doc_update: validate
  } = makeMethods({} as any)

  // Build the view:
  const view: JsView = {}
  if (map != null) view.map = jsToString(map)
  if (filter != null) view.filter = jsToString(filter)
  if (reduce != null) {
    view.reduce = typeof reduce === 'string' ? reduce : jsToString(reduce)
  }
  if (opts.local_seq != null || opts.include_design != null) {
    view.options = {
      local_seq: opts.local_seq,
      include_design: opts.include_design
    }
  }

  // Return the design document:
  const out: JsDesignDocument = {
    language: 'javascript',
    views: {}
  }
  if (lib != null) {
    const libStrings: { [name: string]: string } = {}
    for (const key of Object.keys(lib)) {
      libStrings[key] = 'module.exports = ' + jsToString(lib[key])
    }
    out.views.lib = libStrings
  }
  if (Object.keys(view).length > 0) out.views[name] = view
  if (validate != null) out.validate_doc_update = jsToString(validate)
  if (partitioned != null) out.options = { partitioned }
  return out
}

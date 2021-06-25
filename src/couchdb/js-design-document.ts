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

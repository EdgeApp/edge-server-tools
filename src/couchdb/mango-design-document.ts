import { MangoSelector } from 'nano'

interface SortItem {
  [field: string]: 'asc' | 'desc'
}
export type SortSyntax = string | SortItem | Array<string | SortItem>

export interface MangoView {
  map: {
    fields: SortItem
    partial_filter_selector: MangoSelector
  }
  reduce: '_count'
  options: {
    def: {
      fields: SortSyntax
      partial_filter_selector?: MangoSelector
    }
  }
}

export interface MangoDesignDocument {
  language: 'query'
  options?: {
    partitioned?: boolean
  }
  views?: { [name: string]: MangoView }
}

/**
 * Builds a CouchDB design document that describes a Mango index.
 */
export function makeMangoIndex(
  name: string,
  fields: SortSyntax,
  opts: {
    filter?: MangoSelector
    partitioned?: boolean
  } = {}
): MangoDesignDocument {
  const { filter, partitioned = false } = opts

  // Normalize the fields list:
  const fieldNames: SortItem = {}
  for (const field of Array.isArray(fields) ? fields : [fields]) {
    if (typeof field === 'string') {
      fieldNames[field] = 'asc'
    } else {
      const [name] = Object.keys(field)
      fieldNames[name] = field[name]
    }
  }

  // Build the view:
  const view: MangoView = {
    map: {
      fields: fieldNames,
      partial_filter_selector: filter ?? {}
    },
    reduce: '_count',
    options: {
      def: {
        fields,
        partial_filter_selector: filter
      }
    }
  }

  // Return the design document:
  const out: MangoDesignDocument = {
    language: 'query',
    views: { [name]: view }
  }
  if (partitioned) out.options = { partitioned: true }
  return out
}

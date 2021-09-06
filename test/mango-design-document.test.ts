import { expect } from 'chai'
import { MangoSelector } from 'nano'

import {
  makeMangoIndex,
  MangoDesignDocument,
  SortSyntax
} from '../src/couchdb/mango-design-document'

interface TestCase {
  name: string
  index: {
    fields: SortSyntax
    partial_filter_selector?: MangoSelector
  }
  result: MangoDesignDocument
}

const testCases: TestCase[] = [
  {
    name: 'strings',
    index: {
      fields: ['up', 'away']
    },
    result: {
      language: 'query',
      views: {
        strings: {
          map: {
            fields: { up: 'asc', away: 'asc' },
            partial_filter_selector: {}
          },
          reduce: '_count',
          options: {
            def: {
              fields: ['up', 'away'],
              partial_filter_selector: undefined
            }
          }
        }
      }
    }
  },

  {
    name: 'string-with-filter',
    index: {
      fields: ['string'],
      partial_filter_selector: { status: { $ne: 'archived' } }
    },
    result: {
      language: 'query',
      views: {
        'string-with-filter': {
          map: {
            fields: { string: 'asc' },
            partial_filter_selector: { status: { $ne: 'archived' } }
          },
          reduce: '_count',
          options: {
            def: {
              fields: ['string'],
              partial_filter_selector: { status: { $ne: 'archived' } }
            }
          }
        }
      }
    }
  },

  {
    name: 'desc-with-filter',
    index: {
      fields: [{ down: 'desc' }],
      partial_filter_selector: { status: { $ne: 'archived' } }
    },
    result: {
      language: 'query',
      views: {
        'desc-with-filter': {
          map: {
            fields: { down: 'desc' },
            partial_filter_selector: { status: { $ne: 'archived' } }
          },
          reduce: '_count',
          options: {
            def: {
              fields: [{ down: 'desc' }],
              partial_filter_selector: { status: { $ne: 'archived' } }
            }
          }
        }
      }
    }
  },

  {
    name: 'multiple-with-filter',
    index: {
      fields: [{ down: 'asc' }, { below: 'asc' }],
      partial_filter_selector: { status: { $ne: 'archived' } }
    },
    result: {
      language: 'query',
      views: {
        'multiple-with-filter': {
          map: {
            fields: { down: 'asc', below: 'asc' },
            partial_filter_selector: { status: { $ne: 'archived' } }
          },
          reduce: '_count',
          options: {
            def: {
              fields: [{ down: 'asc' }, { below: 'asc' }],
              partial_filter_selector: { status: { $ne: 'archived' } }
            }
          }
        }
      }
    }
  }
]

describe('makeMangoIndex', function () {
  for (const test of testCases) {
    const { name, index, result } = test
    it(name, function () {
      expect(
        makeMangoIndex(name, index.fields, {
          filter: index.partial_filter_selector
        })
      ).deep.equals(result)
    })
  }
})

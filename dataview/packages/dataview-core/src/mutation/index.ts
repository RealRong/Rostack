import {
  createDeltaBuilder,
  defineEntityMutationSchema
} from '@shared/mutation'
import type {
  MutationPathCodec
} from '@shared/mutation/typed'
import {
  dataviewEntities
} from '@dataview/core/entities'

export type DataviewQueryAspect =
  | 'search'
  | 'filter'
  | 'sort'
  | 'group'
  | 'order'

export interface DataviewViewQueryPath {
  aspect: DataviewQueryAspect
  raw: string
}

export const dataviewFieldPathCodec: MutationPathCodec<string> = {
  parse: (path) => path
    ? path
    : undefined,
  format: (path) => path
}

export const dataviewViewQueryPathCodec: MutationPathCodec<DataviewViewQueryPath> = {
  parse: (path) => {
    const [head] = path.split('.')
    switch (head) {
      case 'search':
      case 'filter':
      case 'sort':
      case 'group':
        return {
          aspect: head,
          raw: path
        }
      case 'orders':
        return {
          aspect: 'order',
          raw: path
        }
      default:
        return undefined
    }
  },
  format: (path) => path.raw
}

export const dataviewMutationSchema = defineEntityMutationSchema({
  entities: dataviewEntities,
  entries: {
    'record.title': {
      ids: true,
      paths: dataviewFieldPathCodec
    },
    'record.values': {
      ids: true,
      paths: dataviewFieldPathCodec
    },
    'view.query': {
      ids: true,
      paths: dataviewViewQueryPathCodec
    }
  },
  signals: {
    'external.version': {}
  }
} as const)

export type DataviewMutationSchema = typeof dataviewMutationSchema

export const dataviewMutationBuilder = createDeltaBuilder(dataviewMutationSchema)

import { defineMetaCollection } from '@dataview/meta/shared'
import {
  token,
  type Token
} from '@shared/i18n'

export type OptionColorId =
  | ''
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'

export interface OptionColorDescriptor {
  id: OptionColorId | string
  token: Token
}

const OPTION_COLOR_ITEMS = [
  {
    id: '',
    token: token('meta.option.color.default', 'Default')
  },
  {
    id: 'gray',
    token: token('meta.option.color.gray', 'Gray')
  },
  {
    id: 'brown',
    token: token('meta.option.color.brown', 'Brown')
  },
  {
    id: 'orange',
    token: token('meta.option.color.orange', 'Orange')
  },
  {
    id: 'yellow',
    token: token('meta.option.color.yellow', 'Yellow')
  },
  {
    id: 'green',
    token: token('meta.option.color.green', 'Green')
  },
  {
    id: 'blue',
    token: token('meta.option.color.blue', 'Blue')
  },
  {
    id: 'purple',
    token: token('meta.option.color.purple', 'Purple')
  },
  {
    id: 'pink',
    token: token('meta.option.color.pink', 'Pink')
  },
  {
    id: 'red',
    token: token('meta.option.color.red', 'Red')
  }
] as const satisfies readonly OptionColorDescriptor[]

export const option = {
  color: defineMetaCollection(OPTION_COLOR_ITEMS, {
    defaultId: '',
    fallback: (id?: string) => ({
      id: id ?? '',
      token: token('meta.option.color.unknown', id ?? 'Default')
    })
  })
} as const

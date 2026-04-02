import type { UiTagTone } from '@dataview/react/ui'
import { message } from './message'
import { defineMetaCollection } from './shared'

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
  message: ReturnType<typeof message>
  tone: UiTagTone
}

const OPTION_COLOR_ITEMS = [
  {
    id: '',
    message: message('meta.option.color.default', 'Default'),
    tone: 'neutral'
  },
  {
    id: 'gray',
    message: message('meta.option.color.gray', 'Gray'),
    tone: 'gray'
  },
  {
    id: 'brown',
    message: message('meta.option.color.brown', 'Brown'),
    tone: 'brown'
  },
  {
    id: 'orange',
    message: message('meta.option.color.orange', 'Orange'),
    tone: 'orange'
  },
  {
    id: 'yellow',
    message: message('meta.option.color.yellow', 'Yellow'),
    tone: 'yellow'
  },
  {
    id: 'green',
    message: message('meta.option.color.green', 'Green'),
    tone: 'green'
  },
  {
    id: 'blue',
    message: message('meta.option.color.blue', 'Blue'),
    tone: 'blue'
  },
  {
    id: 'purple',
    message: message('meta.option.color.purple', 'Purple'),
    tone: 'purple'
  },
  {
    id: 'pink',
    message: message('meta.option.color.pink', 'Pink'),
    tone: 'pink'
  },
  {
    id: 'red',
    message: message('meta.option.color.red', 'Red'),
    tone: 'red'
  }
] as const satisfies readonly OptionColorDescriptor[]

export const option = {
  color: defineMetaCollection(OPTION_COLOR_ITEMS, {
    defaultId: '',
    fallback: (id?: string) => ({
      id: id ?? '',
      message: message('meta.option.color.unknown', id ?? 'Default'),
      tone: 'neutral'
    })
  })
} as const

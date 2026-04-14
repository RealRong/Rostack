import { message } from '@dataview/meta/message'
import { defineMetaCollection } from '@dataview/meta/shared'

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
}

const OPTION_COLOR_ITEMS = [
  {
    id: '',
    message: message('meta.option.color.default', 'Default')
  },
  {
    id: 'gray',
    message: message('meta.option.color.gray', 'Gray')
  },
  {
    id: 'brown',
    message: message('meta.option.color.brown', 'Brown')
  },
  {
    id: 'orange',
    message: message('meta.option.color.orange', 'Orange')
  },
  {
    id: 'yellow',
    message: message('meta.option.color.yellow', 'Yellow')
  },
  {
    id: 'green',
    message: message('meta.option.color.green', 'Green')
  },
  {
    id: 'blue',
    message: message('meta.option.color.blue', 'Blue')
  },
  {
    id: 'purple',
    message: message('meta.option.color.purple', 'Purple')
  },
  {
    id: 'pink',
    message: message('meta.option.color.pink', 'Pink')
  },
  {
    id: 'red',
    message: message('meta.option.color.red', 'Red')
  }
] as const satisfies readonly OptionColorDescriptor[]

export const option = {
  color: defineMetaCollection(OPTION_COLOR_ITEMS, {
    defaultId: '',
    fallback: (id?: string) => ({
      id: id ?? '',
      message: message('meta.option.color.unknown', id ?? 'Default')
    })
  })
} as const

import {
  Calendar,
  CheckSquare,
  CircleDot,
  File,
  Hash,
  Image,
  Link2,
  ListChecks,
  Mail,
  Phone,
  Tag,
  Tags,
  Type,
  type LucideIcon
} from 'lucide-react'
import type {
  GroupPropertyConfig,
  GroupPropertyKind
} from '@dataview/core/contracts'
import { message } from './message'
import { defineMetaCollection } from './shared'

export type PropertyNumberFormatId = NonNullable<
  Extract<GroupPropertyConfig, { type: 'number' }>['format']
>

export type PropertyDisplayDateFormatId = NonNullable<
  Extract<GroupPropertyConfig, { type: 'date' }>['displayDateFormat']
>

export type PropertyDisplayTimeFormatId = NonNullable<
  Extract<GroupPropertyConfig, { type: 'date' }>['displayTimeFormat']
>

export type PropertyDateValueKindId = NonNullable<
  Extract<GroupPropertyConfig, { type: 'date' }>['defaultValueKind']
>

export interface PropertyKindDescriptor {
  id: GroupPropertyKind | string
  message: ReturnType<typeof message>
  defaultName: ReturnType<typeof message>
  Icon: LucideIcon
  supports: {
    options: boolean
  }
}

export interface PropertyFormatDescriptor<TId extends string = string> {
  id: TId | string
  message: ReturnType<typeof message>
}

const PROPERTY_KIND_ITEMS = [
  {
    id: 'text',
    message: message('meta.property.kind.text', 'Text'),
    defaultName: message('meta.property.kind.text.defaultName', '文本'),
    Icon: Type,
    supports: {
      options: false
    }
  },
  {
    id: 'number',
    message: message('meta.property.kind.number', 'Number'),
    defaultName: message('meta.property.kind.number.defaultName', '数字'),
    Icon: Hash,
    supports: {
      options: false
    }
  },
  {
    id: 'select',
    message: message('meta.property.kind.select', 'Select'),
    defaultName: message('meta.property.kind.select.defaultName', '单选'),
    Icon: Tag,
    supports: {
      options: true
    }
  },
  {
    id: 'multiSelect',
    message: message('meta.property.kind.multiSelect', 'Multi-select'),
    defaultName: message('meta.property.kind.multiSelect.defaultName', '多选'),
    Icon: Tags,
    supports: {
      options: true
    }
  },
  {
    id: 'status',
    message: message('meta.property.kind.status', 'Status'),
    defaultName: message('meta.property.kind.status.defaultName', '状态'),
    Icon: ListChecks,
    supports: {
      options: true
    }
  },
  {
    id: 'date',
    message: message('meta.property.kind.date', 'Date'),
    defaultName: message('meta.property.kind.date.defaultName', '日期'),
    Icon: Calendar,
    supports: {
      options: false
    }
  },
  {
    id: 'checkbox',
    message: message('meta.property.kind.checkbox', 'Checkbox'),
    defaultName: message('meta.property.kind.checkbox.defaultName', '复选框'),
    Icon: CheckSquare,
    supports: {
      options: false
    }
  },
  {
    id: 'url',
    message: message('meta.property.kind.url', 'URL'),
    defaultName: message('meta.property.kind.url.defaultName', '网址'),
    Icon: Link2,
    supports: {
      options: false
    }
  },
  {
    id: 'email',
    message: message('meta.property.kind.email', 'Email'),
    defaultName: message('meta.property.kind.email.defaultName', '邮箱'),
    Icon: Mail,
    supports: {
      options: false
    }
  },
  {
    id: 'phone',
    message: message('meta.property.kind.phone', 'Phone'),
    defaultName: message('meta.property.kind.phone.defaultName', '电话'),
    Icon: Phone,
    supports: {
      options: false
    }
  },
  {
    id: 'file',
    message: message('meta.property.kind.file', 'File'),
    defaultName: message('meta.property.kind.file.defaultName', '文件'),
    Icon: File,
    supports: {
      options: false
    }
  },
  {
    id: 'media',
    message: message('meta.property.kind.media', 'Media'),
    defaultName: message('meta.property.kind.media.defaultName', '媒体'),
    Icon: Image,
    supports: {
      options: false
    }
  }
] as const satisfies readonly PropertyKindDescriptor[]

const NUMBER_FORMAT_ITEMS = [
  {
    id: 'number',
    message: message('meta.property.number.format.number', 'Number')
  },
  {
    id: 'integer',
    message: message('meta.property.number.format.integer', 'Integer')
  },
  {
    id: 'percent',
    message: message('meta.property.number.format.percent', 'Percent')
  },
  {
    id: 'currency',
    message: message('meta.property.number.format.currency', 'Currency')
  }
] as const satisfies readonly PropertyFormatDescriptor<PropertyNumberFormatId>[]

const DATE_DISPLAY_FORMAT_ITEMS = [
  {
    id: 'full',
    message: message('meta.property.date.displayDateFormat.full', 'Full')
  },
  {
    id: 'short',
    message: message('meta.property.date.displayDateFormat.short', 'Short')
  },
  {
    id: 'mdy',
    message: message('meta.property.date.displayDateFormat.mdy', 'MM/DD/YYYY')
  },
  {
    id: 'dmy',
    message: message('meta.property.date.displayDateFormat.dmy', 'DD/MM/YYYY')
  },
  {
    id: 'ymd',
    message: message('meta.property.date.displayDateFormat.ymd', 'YYYY/MM/DD')
  },
  {
    id: 'relative',
    message: message('meta.property.date.displayDateFormat.relative', 'Relative')
  }
] as const satisfies readonly PropertyFormatDescriptor<PropertyDisplayDateFormatId>[]

const DATE_TIME_FORMAT_ITEMS = [
  {
    id: '12h',
    message: message('meta.property.date.displayTimeFormat.12h', '12-hour')
  },
  {
    id: '24h',
    message: message('meta.property.date.displayTimeFormat.24h', '24-hour')
  }
] as const satisfies readonly PropertyFormatDescriptor<PropertyDisplayTimeFormatId>[]

const DATE_VALUE_KIND_ITEMS = [
  {
    id: 'date',
    message: message('meta.property.date.defaultValueKind.date', 'Date')
  },
  {
    id: 'datetime',
    message: message('meta.property.date.defaultValueKind.datetime', 'Date & time')
  }
] as const satisfies readonly PropertyFormatDescriptor<PropertyDateValueKindId>[]

export const property = {
  kind: defineMetaCollection(PROPERTY_KIND_ITEMS, {
    fallback: (id?: string) => ({
      id: id ?? 'unknown',
      message: message('meta.property.kind.unknown', id ?? 'Unknown'),
      defaultName: message('meta.property.kind.unknown.defaultName', id ?? '属性'),
      Icon: CircleDot,
      supports: {
        options: false
      }
    })
  }),
  number: {
    format: defineMetaCollection(NUMBER_FORMAT_ITEMS, {
      defaultId: 'number',
      fallback: (id?: string) => ({
        id: id ?? 'number',
        message: message('meta.property.number.format.unknown', id ?? 'Number')
      })
    })
  },
  date: {
    displayDateFormat: defineMetaCollection(DATE_DISPLAY_FORMAT_ITEMS, {
      defaultId: 'short',
      fallback: (id?: string) => ({
        id: id ?? 'short',
        message: message('meta.property.date.displayDateFormat.unknown', id ?? 'Short')
      })
    }),
    displayTimeFormat: defineMetaCollection(DATE_TIME_FORMAT_ITEMS, {
      defaultId: '12h',
      fallback: (id?: string) => ({
        id: id ?? '12h',
        message: message('meta.property.date.displayTimeFormat.unknown', id ?? '12-hour')
      })
    }),
    defaultValueKind: defineMetaCollection(DATE_VALUE_KIND_ITEMS, {
      defaultId: 'date',
      fallback: (id?: string) => ({
        id: id ?? 'date',
        message: message('meta.property.date.defaultValueKind.unknown', id ?? 'Date')
      })
    })
  }
} as const

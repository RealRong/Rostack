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
  DateField,
  NumberField,
  CustomFieldKind
} from '@dataview/core/contracts'
import { message } from '#dataview-meta/message'
import { defineMetaCollection } from '#dataview-meta/shared'

export type FieldNumberFormatId = NonNullable<
  NumberField['format']
>

export type FieldDisplayDateFormatId = NonNullable<
  DateField['displayDateFormat']
>

export type FieldDisplayTimeFormatId = NonNullable<
  DateField['displayTimeFormat']
>

export type FieldDateValueKindId = NonNullable<
  DateField['defaultValueKind']
>

export interface FieldKindDescriptor {
  id: CustomFieldKind | string
  message: ReturnType<typeof message>
  defaultName: ReturnType<typeof message>
  Icon: LucideIcon
  supports: {
    options: boolean
  }
}

export interface FieldFormatDescriptor<TId extends string = string> {
  id: TId | string
  message: ReturnType<typeof message>
}

const PROPERTY_KIND_ITEMS = [
  {
    id: 'text',
    message: message('meta.field.kind.text', 'Text'),
    defaultName: message('meta.field.kind.text.defaultName', '文本'),
    Icon: Type,
    supports: {
      options: false
    }
  },
  {
    id: 'number',
    message: message('meta.field.kind.number', 'Number'),
    defaultName: message('meta.field.kind.number.defaultName', '数字'),
    Icon: Hash,
    supports: {
      options: false
    }
  },
  {
    id: 'select',
    message: message('meta.field.kind.select', 'Select'),
    defaultName: message('meta.field.kind.select.defaultName', '单选'),
    Icon: Tag,
    supports: {
      options: true
    }
  },
  {
    id: 'multiSelect',
    message: message('meta.field.kind.multiSelect', 'Multi-select'),
    defaultName: message('meta.field.kind.multiSelect.defaultName', '多选'),
    Icon: Tags,
    supports: {
      options: true
    }
  },
  {
    id: 'status',
    message: message('meta.field.kind.status', 'Status'),
    defaultName: message('meta.field.kind.status.defaultName', '状态'),
    Icon: ListChecks,
    supports: {
      options: true
    }
  },
  {
    id: 'date',
    message: message('meta.field.kind.date', 'Date'),
    defaultName: message('meta.field.kind.date.defaultName', '日期'),
    Icon: Calendar,
    supports: {
      options: false
    }
  },
  {
    id: 'boolean',
    message: message('meta.field.kind.boolean', 'Boolean'),
    defaultName: message('meta.field.kind.boolean.defaultName', '布尔'),
    Icon: CheckSquare,
    supports: {
      options: false
    }
  },
  {
    id: 'url',
    message: message('meta.field.kind.url', 'URL'),
    defaultName: message('meta.field.kind.url.defaultName', '网址'),
    Icon: Link2,
    supports: {
      options: false
    }
  },
  {
    id: 'email',
    message: message('meta.field.kind.email', 'Email'),
    defaultName: message('meta.field.kind.email.defaultName', '邮箱'),
    Icon: Mail,
    supports: {
      options: false
    }
  },
  {
    id: 'phone',
    message: message('meta.field.kind.phone', 'Phone'),
    defaultName: message('meta.field.kind.phone.defaultName', '电话'),
    Icon: Phone,
    supports: {
      options: false
    }
  },
  {
    id: 'asset',
    message: message('meta.field.kind.asset', 'Asset'),
    defaultName: message('meta.field.kind.asset.defaultName', '资源'),
    Icon: File,
    supports: {
      options: false
    }
  }
] as const satisfies readonly FieldKindDescriptor[]

const NUMBER_FORMAT_ITEMS = [
  {
    id: 'number',
    message: message('meta.field.number.format.number', 'Number')
  },
  {
    id: 'integer',
    message: message('meta.field.number.format.integer', 'Integer')
  },
  {
    id: 'percent',
    message: message('meta.field.number.format.percent', 'Percent')
  },
  {
    id: 'currency',
    message: message('meta.field.number.format.currency', 'Currency')
  }
] as const satisfies readonly FieldFormatDescriptor<FieldNumberFormatId>[]

const DATE_DISPLAY_FORMAT_ITEMS = [
  {
    id: 'full',
    message: message('meta.field.date.displayDateFormat.full', 'Full')
  },
  {
    id: 'short',
    message: message('meta.field.date.displayDateFormat.short', 'Short')
  },
  {
    id: 'mdy',
    message: message('meta.field.date.displayDateFormat.mdy', 'MM/DD/YYYY')
  },
  {
    id: 'dmy',
    message: message('meta.field.date.displayDateFormat.dmy', 'DD/MM/YYYY')
  },
  {
    id: 'ymd',
    message: message('meta.field.date.displayDateFormat.ymd', 'YYYY/MM/DD')
  },
  {
    id: 'relative',
    message: message('meta.field.date.displayDateFormat.relative', 'Relative')
  }
] as const satisfies readonly FieldFormatDescriptor<FieldDisplayDateFormatId>[]

const DATE_TIME_FORMAT_ITEMS = [
  {
    id: '12h',
    message: message('meta.field.date.displayTimeFormat.12h', '12-hour')
  },
  {
    id: '24h',
    message: message('meta.field.date.displayTimeFormat.24h', '24-hour')
  }
] as const satisfies readonly FieldFormatDescriptor<FieldDisplayTimeFormatId>[]

const DATE_VALUE_KIND_ITEMS = [
  {
    id: 'date',
    message: message('meta.field.date.defaultValueKind.date', 'Date')
  },
  {
    id: 'datetime',
    message: message('meta.field.date.defaultValueKind.datetime', 'Date & time')
  }
] as const satisfies readonly FieldFormatDescriptor<FieldDateValueKindId>[]

export const field = {
  kind: defineMetaCollection(PROPERTY_KIND_ITEMS, {
    fallback: (id?: string) => ({
      id: id ?? 'unknown',
      message: message('meta.field.kind.unknown', id ?? 'Unknown'),
      defaultName: message('meta.field.kind.unknown.defaultName', id ?? '属性'),
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
        message: message('meta.field.number.format.unknown', id ?? 'Number')
      })
    })
  },
  date: {
    displayDateFormat: defineMetaCollection(DATE_DISPLAY_FORMAT_ITEMS, {
      defaultId: 'short',
      fallback: (id?: string) => ({
        id: id ?? 'short',
        message: message('meta.field.date.displayDateFormat.unknown', id ?? 'Short')
      })
    }),
    displayTimeFormat: defineMetaCollection(DATE_TIME_FORMAT_ITEMS, {
      defaultId: '12h',
      fallback: (id?: string) => ({
        id: id ?? '12h',
        message: message('meta.field.date.displayTimeFormat.unknown', id ?? '12-hour')
      })
    }),
    defaultValueKind: defineMetaCollection(DATE_VALUE_KIND_ITEMS, {
      defaultId: 'date',
      fallback: (id?: string) => ({
        id: id ?? 'date',
        message: message('meta.field.date.defaultValueKind.unknown', id ?? 'Date')
      })
    })
  }
} as const

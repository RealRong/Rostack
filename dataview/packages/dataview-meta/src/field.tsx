import {
  Calendar,
  CaseSensitive,
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
} from '@dataview/core/types'
import { defineMetaCollection } from '@dataview/meta/shared'
import {
  token,
  type Token
} from '@shared/i18n'

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
  token: Token
  defaultName: Token
  Icon: LucideIcon
  supports: {
    options: boolean
  }
}

export interface FieldFormatDescriptor<TId extends string = string> {
  id: TId | string
  token: Token
}

const PROPERTY_KIND_ITEMS = [
  {
    id: 'title',
    token: token('meta.field.kind.title', 'Title'),
    defaultName: token('meta.field.kind.title.defaultName', '标题'),
    Icon: CaseSensitive,
    supports: {
      options: false
    }
  },
  {
    id: 'text',
    token: token('meta.field.kind.text', 'Text'),
    defaultName: token('meta.field.kind.text.defaultName', '文本'),
    Icon: Type,
    supports: {
      options: false
    }
  },
  {
    id: 'number',
    token: token('meta.field.kind.number', 'Number'),
    defaultName: token('meta.field.kind.number.defaultName', '数字'),
    Icon: Hash,
    supports: {
      options: false
    }
  },
  {
    id: 'select',
    token: token('meta.field.kind.select', 'Select'),
    defaultName: token('meta.field.kind.select.defaultName', '单选'),
    Icon: Tag,
    supports: {
      options: true
    }
  },
  {
    id: 'multiSelect',
    token: token('meta.field.kind.multiSelect', 'Multi-select'),
    defaultName: token('meta.field.kind.multiSelect.defaultName', '多选'),
    Icon: Tags,
    supports: {
      options: true
    }
  },
  {
    id: 'status',
    token: token('meta.field.kind.status', 'Status'),
    defaultName: token('meta.field.kind.status.defaultName', '状态'),
    Icon: ListChecks,
    supports: {
      options: true
    }
  },
  {
    id: 'date',
    token: token('meta.field.kind.date', 'Date'),
    defaultName: token('meta.field.kind.date.defaultName', '日期'),
    Icon: Calendar,
    supports: {
      options: false
    }
  },
  {
    id: 'boolean',
    token: token('meta.field.kind.boolean', 'Boolean'),
    defaultName: token('meta.field.kind.boolean.defaultName', '布尔'),
    Icon: CheckSquare,
    supports: {
      options: false
    }
  },
  {
    id: 'url',
    token: token('meta.field.kind.url', 'URL'),
    defaultName: token('meta.field.kind.url.defaultName', '网址'),
    Icon: Link2,
    supports: {
      options: false
    }
  },
  {
    id: 'email',
    token: token('meta.field.kind.email', 'Email'),
    defaultName: token('meta.field.kind.email.defaultName', '邮箱'),
    Icon: Mail,
    supports: {
      options: false
    }
  },
  {
    id: 'phone',
    token: token('meta.field.kind.phone', 'Phone'),
    defaultName: token('meta.field.kind.phone.defaultName', '电话'),
    Icon: Phone,
    supports: {
      options: false
    }
  },
  {
    id: 'asset',
    token: token('meta.field.kind.asset', 'Asset'),
    defaultName: token('meta.field.kind.asset.defaultName', '资源'),
    Icon: File,
    supports: {
      options: false
    }
  }
] as const satisfies readonly FieldKindDescriptor[]

const NUMBER_FORMAT_ITEMS = [
  {
    id: 'number',
    token: token('meta.field.number.format.number', 'Number')
  },
  {
    id: 'integer',
    token: token('meta.field.number.format.integer', 'Integer')
  },
  {
    id: 'percent',
    token: token('meta.field.number.format.percent', 'Percent')
  },
  {
    id: 'currency',
    token: token('meta.field.number.format.currency', 'Currency')
  }
] as const satisfies readonly FieldFormatDescriptor<FieldNumberFormatId>[]

const DATE_DISPLAY_FORMAT_ITEMS = [
  {
    id: 'full',
    token: token('meta.field.date.displayDateFormat.full', 'Full')
  },
  {
    id: 'short',
    token: token('meta.field.date.displayDateFormat.short', 'Short')
  },
  {
    id: 'mdy',
    token: token('meta.field.date.displayDateFormat.mdy', 'MM/DD/YYYY')
  },
  {
    id: 'dmy',
    token: token('meta.field.date.displayDateFormat.dmy', 'DD/MM/YYYY')
  },
  {
    id: 'ymd',
    token: token('meta.field.date.displayDateFormat.ymd', 'YYYY/MM/DD')
  },
  {
    id: 'relative',
    token: token('meta.field.date.displayDateFormat.relative', 'Relative')
  }
] as const satisfies readonly FieldFormatDescriptor<FieldDisplayDateFormatId>[]

const DATE_TIME_FORMAT_ITEMS = [
  {
    id: '12h',
    token: token('meta.field.date.displayTimeFormat.12h', '12-hour')
  },
  {
    id: '24h',
    token: token('meta.field.date.displayTimeFormat.24h', '24-hour')
  }
] as const satisfies readonly FieldFormatDescriptor<FieldDisplayTimeFormatId>[]

const DATE_VALUE_KIND_ITEMS = [
  {
    id: 'date',
    token: token('meta.field.date.defaultValueKind.date', 'Date')
  },
  {
    id: 'datetime',
    token: token('meta.field.date.defaultValueKind.datetime', 'Date & time')
  }
] as const satisfies readonly FieldFormatDescriptor<FieldDateValueKindId>[]

export const field = {
  kind: defineMetaCollection(PROPERTY_KIND_ITEMS, {
    fallback: (id?: string) => ({
      id: id ?? 'unknown',
      token: token('meta.field.kind.unknown', id ?? 'Unknown'),
      defaultName: token('meta.field.kind.unknown.defaultName', id ?? '属性'),
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
        token: token('meta.field.number.format.unknown', id ?? 'Number')
      })
    })
  },
  date: {
    displayDateFormat: defineMetaCollection(DATE_DISPLAY_FORMAT_ITEMS, {
      defaultId: 'short',
      fallback: (id?: string) => ({
        id: id ?? 'short',
        token: token('meta.field.date.displayDateFormat.unknown', id ?? 'Short')
      })
    }),
    displayTimeFormat: defineMetaCollection(DATE_TIME_FORMAT_ITEMS, {
      defaultId: '12h',
      fallback: (id?: string) => ({
        id: id ?? '12h',
        token: token('meta.field.date.displayTimeFormat.unknown', id ?? '12-hour')
      })
    }),
    defaultValueKind: defineMetaCollection(DATE_VALUE_KIND_ITEMS, {
      defaultId: 'date',
      fallback: (id?: string) => ({
        id: id ?? 'date',
        token: token('meta.field.date.defaultValueKind.unknown', id ?? 'Date')
      })
    })
  }
} as const

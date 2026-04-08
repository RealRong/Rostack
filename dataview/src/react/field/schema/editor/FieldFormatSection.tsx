import type { CustomField } from '@dataview/core/contracts'
import {
  formatTimeZoneLabel,
  getAvailableTimezones
} from '@dataview/core/field'
import {
  meta,
  renderMessage,
  type MessageSpec,
  type FieldDateValueKindId,
  type FieldDisplayDateFormatId,
  type FieldDisplayTimeFormatId,
  type FieldNumberFormatId
} from '@dataview/meta'
import type { MenuItem, MenuSurfaceSize } from '@ui/menu'
import { FIELD_DROPDOWN_MENU_PROPS } from '../../dropdown'

const FLOATING_TIMEZONE_ID = '__floating__'

const buildChoiceSubmenuItem = <TValue extends string>(input: {
  key: string
  label: string
  suffix?: string
  size?: MenuSurfaceSize
  value: TValue
  options: readonly {
    id: TValue
    message: MessageSpec
  }[]
  onSelect: (value: TValue) => void
}): MenuItem => ({
  kind: 'submenu',
  key: input.key,
  label: input.label,
  suffix: input.suffix,
  size: input.size ?? 'md',
  ...FIELD_DROPDOWN_MENU_PROPS,
  items: input.options.map(option => ({
    kind: 'toggle' as const,
    key: option.id,
    label: renderMessage(option.message),
    checked: input.value === option.id,
    onSelect: () => input.onSelect(option.id)
  }))
})

export const buildFieldFormatMenuItems = (props: {
  field: CustomField
  update: (patch: Partial<Omit<CustomField, 'id'>>) => void
}): readonly MenuItem[] => {
  const numberFormat = props.field.kind === 'number'
    ? meta.field.number.format.get(props.field.format)
    : undefined
  const dateConfig = props.field.kind === 'date'
    ? props.field
    : undefined
  const urlConfig = props.field.kind === 'url'
    ? props.field
    : undefined
  const displayDateFormat = dateConfig
    ? meta.field.date.displayDateFormat.get(dateConfig.displayDateFormat)
    : undefined
  const displayTimeFormat = dateConfig
    ? meta.field.date.displayTimeFormat.get(dateConfig.displayTimeFormat)
    : undefined
  const defaultValueKind = dateConfig
    ? meta.field.date.defaultValueKind.get(dateConfig.defaultValueKind)
    : undefined
  const timezoneOptions = getAvailableTimezones()

  const setNumberFormat = (value: FieldNumberFormatId) => {
    if (props.field.kind !== 'number') {
      return
    }

    props.update({
      format: value
    } as Partial<Omit<CustomField, 'id'>>)
  }

  const setDateConfig = (
    patch: Partial<NonNullable<typeof dateConfig>>
  ) => {
    if (!dateConfig) {
      return
    }

    props.update({
      ...patch
    } as Partial<Omit<CustomField, 'id'>>)
  }

  const setUrlConfig = (
    patch: Partial<NonNullable<typeof urlConfig>>
  ) => {
    if (!urlConfig) {
      return
    }

    props.update({
      ...patch
    } as Partial<Omit<CustomField, 'id'>>)
  }

  if (numberFormat) {
    return [
      buildChoiceSubmenuItem({
        key: 'number-format',
        label: renderMessage(meta.ui.field.editor.format),
        suffix: renderMessage(numberFormat.message),
        value: numberFormat.id as FieldNumberFormatId,
        options: meta.field.number.format.list as readonly {
          id: FieldNumberFormatId
          message: MessageSpec
        }[],
        onSelect: setNumberFormat
      })
    ]
  }

  if (urlConfig) {
    return [
      {
        kind: 'toggle',
        key: 'display-full-url',
        label: renderMessage(meta.ui.field.editor.displayFullUrl),
        checked: urlConfig.displayFullUrl,
        indicator: 'switch',
        onSelect: () => setUrlConfig({
          displayFullUrl: !urlConfig.displayFullUrl
        })
      }
    ]
  }

  if (!dateConfig || !displayDateFormat || !displayTimeFormat || !defaultValueKind) {
    return []
  }

  return [
    buildChoiceSubmenuItem({
      key: 'display-date-format',
      label: renderMessage(meta.ui.field.editor.displayDateFormat),
      suffix: renderMessage(displayDateFormat.message),
      value: displayDateFormat.id as FieldDisplayDateFormatId,
      options: meta.field.date.displayDateFormat.list as readonly {
        id: FieldDisplayDateFormatId
        message: MessageSpec
      }[],
      onSelect: value => {
        setDateConfig({
          displayDateFormat: value
        })
      }
    }),
    buildChoiceSubmenuItem({
      key: 'display-time-format',
      label: renderMessage(meta.ui.field.editor.displayTimeFormat),
      suffix: renderMessage(displayTimeFormat.message),
      value: displayTimeFormat.id as FieldDisplayTimeFormatId,
      options: meta.field.date.displayTimeFormat.list as readonly {
        id: FieldDisplayTimeFormatId
        message: MessageSpec
      }[],
      onSelect: value => {
        setDateConfig({
          displayTimeFormat: value
        })
      }
    }),
    buildChoiceSubmenuItem({
      key: 'default-value-kind',
      label: renderMessage(meta.ui.field.editor.defaultValueKind),
      suffix: renderMessage(defaultValueKind.message),
      value: defaultValueKind.id as FieldDateValueKindId,
      options: meta.field.date.defaultValueKind.list as readonly {
        id: FieldDateValueKindId
        message: MessageSpec
      }[],
      onSelect: value => {
        setDateConfig({
          defaultValueKind: value
        })
      }
    }),
    ...(dateConfig.defaultValueKind === 'datetime'
      ? [{
        kind: 'submenu' as const,
        key: 'default-timezone',
        label: renderMessage(meta.ui.field.editor.defaultTimezone),
        suffix: formatTimeZoneLabel(dateConfig.defaultTimezone ?? null),
        size: 'lg' as const,
        ...FIELD_DROPDOWN_MENU_PROPS,
        items: [
          {
            kind: 'toggle' as const,
              key: FLOATING_TIMEZONE_ID,
              label: formatTimeZoneLabel(null),
              checked: dateConfig.defaultTimezone === null,
              onSelect: () => {
                setDateConfig({
                  defaultTimezone: null
                })
              }
            },
            ...timezoneOptions.map(timeZone => ({
              kind: 'toggle' as const,
              key: timeZone,
              label: formatTimeZoneLabel(timeZone),
              checked: dateConfig.defaultTimezone === timeZone,
              onSelect: () => {
                setDateConfig({
                  defaultTimezone: timeZone
                })
              }
            }))
          ]
        }]
      : [])
  ]
}

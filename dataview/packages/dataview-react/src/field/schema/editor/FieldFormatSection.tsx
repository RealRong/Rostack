import type { CustomField } from '@dataview/core/contracts'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  meta,
  type FieldDateValueKindId,
  type FieldDisplayDateFormatId,
  type FieldDisplayTimeFormatId,
  type FieldNumberFormatId
} from '@dataview/meta'
import type { TokenTranslator } from '@shared/i18n'
import type { MenuItem } from '@shared/ui/menu'
import { buildChoiceSubmenuItem } from '@dataview/react/menu-builders'
import { FIELD_DROPDOWN_MENU_PROPS } from '@dataview/react/field/dropdown'

const FLOATING_TIMEZONE_ID = '__floating__'

export const buildFieldFormatMenuItems = (props: {
  field: CustomField
  update: (patch: Partial<Omit<CustomField, 'id'>>) => void
  t: TokenTranslator
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
  const timezoneOptions = fieldApi.date.timezone.list()

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
        label: props.t(meta.ui.field.editor.format),
        suffix: props.t(numberFormat.token),
        value: numberFormat.id as FieldNumberFormatId,
        options: meta.field.number.format.list.map(option => ({
          id: option.id as FieldNumberFormatId,
          label: props.t(option.token)
        })),
        ...FIELD_DROPDOWN_MENU_PROPS,
        onSelect: setNumberFormat
      })
    ]
  }

  if (urlConfig) {
    return [
      {
        kind: 'toggle',
        key: 'display-full-url',
        label: props.t(meta.ui.field.editor.displayFullUrl),
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
      label: props.t(meta.ui.field.editor.displayDateFormat),
      suffix: props.t(displayDateFormat.token),
      value: displayDateFormat.id as FieldDisplayDateFormatId,
      options: meta.field.date.displayDateFormat.list.map(option => ({
        id: option.id as FieldDisplayDateFormatId,
        label: props.t(option.token)
      })),
      ...FIELD_DROPDOWN_MENU_PROPS,
      onSelect: value => {
        setDateConfig({
          displayDateFormat: value
        })
      }
    }),
    buildChoiceSubmenuItem({
      key: 'display-time-format',
      label: props.t(meta.ui.field.editor.displayTimeFormat),
      suffix: props.t(displayTimeFormat.token),
      value: displayTimeFormat.id as FieldDisplayTimeFormatId,
      options: meta.field.date.displayTimeFormat.list.map(option => ({
        id: option.id as FieldDisplayTimeFormatId,
        label: props.t(option.token)
      })),
      ...FIELD_DROPDOWN_MENU_PROPS,
      onSelect: value => {
        setDateConfig({
          displayTimeFormat: value
        })
      }
    }),
    buildChoiceSubmenuItem({
      key: 'default-value-kind',
      label: props.t(meta.ui.field.editor.defaultValueKind),
      suffix: props.t(defaultValueKind.token),
      value: defaultValueKind.id as FieldDateValueKindId,
      options: meta.field.date.defaultValueKind.list.map(option => ({
        id: option.id as FieldDateValueKindId,
        label: props.t(option.token)
      })),
      ...FIELD_DROPDOWN_MENU_PROPS,
      onSelect: value => {
        setDateConfig({
          defaultValueKind: value
        })
      }
    }),
    ...(dateConfig.defaultValueKind === 'datetime'
      ? [buildChoiceSubmenuItem({
          key: 'default-timezone',
          label: props.t(meta.ui.field.editor.defaultTimezone),
          suffix: fieldApi.date.timezone.label(dateConfig.defaultTimezone ?? null),
          size: 'lg',
          value: (dateConfig.defaultTimezone ?? FLOATING_TIMEZONE_ID) as string,
          options: [
            {
              id: FLOATING_TIMEZONE_ID,
              label: fieldApi.date.timezone.label(null)
            },
            ...timezoneOptions.map(timeZone => ({
              id: timeZone,
              label: fieldApi.date.timezone.label(timeZone)
            }))
          ],
          ...FIELD_DROPDOWN_MENU_PROPS,
          onSelect: value => {
            setDateConfig({
              defaultTimezone: value === FLOATING_TIMEZONE_ID
                ? null
                : value
            })
          }
        })]
      : [])
  ]
}

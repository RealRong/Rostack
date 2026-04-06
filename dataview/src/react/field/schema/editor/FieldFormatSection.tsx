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
import { Menu } from '@ui/menu'
import {
  FieldChoiceList,
  FieldPopoverRow,
  FieldSwitchRow
} from './FieldSchemaRows'

const FLOATING_TIMEZONE_ID = '__floating__'

export const FieldFormatSection = (props: {
  property: CustomField
  update: (patch: Partial<Omit<CustomField, 'id'>>) => void
}) => {
  const numberFormat = props.property.kind === 'number'
    ? meta.field.number.format.get(props.property.format)
    : undefined
  const dateConfig = props.property.kind === 'date'
    ? props.property
    : undefined
  const urlConfig = props.property.kind === 'url'
    ? props.property
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
    if (props.property.kind !== 'number') {
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
    return (
      <FieldPopoverRow
        label={renderMessage(meta.ui.field.editor.format)}
        suffix={renderMessage(numberFormat.message)}
        widthClassName="w-[220px]"
      >
        {close => (
          <FieldChoiceList
            value={numberFormat.id as FieldNumberFormatId}
            options={meta.field.number.format.list as readonly {
              id: FieldNumberFormatId
              message: MessageSpec
            }[]}
            onSelect={value => {
              setNumberFormat(value)
              close()
            }}
          />
        )}
      </FieldPopoverRow>
    )
  }

  if (urlConfig) {
    return (
      <FieldSwitchRow
        label={renderMessage(meta.ui.field.editor.displayFullUrl)}
        checked={urlConfig.displayFullUrl}
        onToggle={() => setUrlConfig({
          displayFullUrl: !urlConfig.displayFullUrl
        })}
      />
    )
  }

  if (!dateConfig || !displayDateFormat || !displayTimeFormat || !defaultValueKind) {
    return null
  }

  return (
    <>
      <FieldPopoverRow
        label={renderMessage(meta.ui.field.editor.displayDateFormat)}
        suffix={renderMessage(displayDateFormat.message)}
        widthClassName="w-[220px]"
      >
        {close => (
          <FieldChoiceList
            value={displayDateFormat.id as FieldDisplayDateFormatId}
            options={meta.field.date.displayDateFormat.list as readonly {
              id: FieldDisplayDateFormatId
              message: MessageSpec
            }[]}
            onSelect={value => {
              setDateConfig({
                displayDateFormat: value
              })
              close()
            }}
          />
        )}
      </FieldPopoverRow>

      <FieldPopoverRow
        label={renderMessage(meta.ui.field.editor.displayTimeFormat)}
        suffix={renderMessage(displayTimeFormat.message)}
        widthClassName="w-[220px]"
      >
        {close => (
          <FieldChoiceList
            value={displayTimeFormat.id as FieldDisplayTimeFormatId}
            options={meta.field.date.displayTimeFormat.list as readonly {
              id: FieldDisplayTimeFormatId
              message: MessageSpec
            }[]}
            onSelect={value => {
              setDateConfig({
                displayTimeFormat: value
              })
              close()
            }}
          />
        )}
      </FieldPopoverRow>

      <FieldPopoverRow
        label={renderMessage(meta.ui.field.editor.defaultValueKind)}
        suffix={renderMessage(defaultValueKind.message)}
        widthClassName="w-[220px]"
      >
        {close => (
          <FieldChoiceList
            value={defaultValueKind.id as FieldDateValueKindId}
            options={meta.field.date.defaultValueKind.list as readonly {
              id: FieldDateValueKindId
              message: MessageSpec
            }[]}
            onSelect={value => {
              setDateConfig({
                defaultValueKind: value
              })
              close()
            }}
          />
        )}
      </FieldPopoverRow>

      {dateConfig.defaultValueKind === 'datetime' ? (
        <FieldPopoverRow
          label={renderMessage(meta.ui.field.editor.defaultTimezone)}
          suffix={formatTimeZoneLabel(dateConfig.defaultTimezone ?? null)}
          widthClassName="w-[240px]"
        >
          {close => (
            <Menu
              items={[
                {
                  kind: 'toggle' as const,
                  key: FLOATING_TIMEZONE_ID,
                  label: formatTimeZoneLabel(null),
                  checked: dateConfig.defaultTimezone === null,
                  onSelect: () => {
                    setDateConfig({
                      defaultTimezone: null
                    })
                    close()
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
                    close()
                  }
                }))
              ]}
            />
          )}
        </FieldPopoverRow>
      ) : null}
    </>
  )
}

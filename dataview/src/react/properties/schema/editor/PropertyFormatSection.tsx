import type { GroupProperty } from '@dataview/core/contracts'
import {
  formatTimeZoneLabel,
  getAvailableTimezones,
  getDatePropertyConfig,
  getPropertyConfig,
  getUrlPropertyConfig
} from '@dataview/core/property'
import {
  meta,
  renderMessage,
  type MessageSpec,
  type PropertyDateValueKindId,
  type PropertyDisplayDateFormatId,
  type PropertyDisplayTimeFormatId,
  type PropertyNumberFormatId
} from '@dataview/meta'
import { Menu } from '@dataview/react/ui'
import {
  PropertyChoiceList,
  PropertyPopoverRow,
  PropertySwitchRow
} from './PropertySchemaRows'

const FLOATING_TIMEZONE_ID = '__floating__'

export const PropertyFormatSection = (props: {
  property: GroupProperty
  update: (patch: Partial<Omit<GroupProperty, 'id'>>) => void
}) => {
  const config = getPropertyConfig(props.property)
  const numberFormat = config.type === 'number'
    ? meta.property.number.format.get(config.format)
    : undefined
  const dateConfig = props.property.kind === 'date'
    ? getDatePropertyConfig(props.property)
    : undefined
  const urlConfig = props.property.kind === 'url'
    ? getUrlPropertyConfig(props.property)
    : undefined
  const displayDateFormat = dateConfig
    ? meta.property.date.displayDateFormat.get(dateConfig.displayDateFormat)
    : undefined
  const displayTimeFormat = dateConfig
    ? meta.property.date.displayTimeFormat.get(dateConfig.displayTimeFormat)
    : undefined
  const defaultValueKind = dateConfig
    ? meta.property.date.defaultValueKind.get(dateConfig.defaultValueKind)
    : undefined
  const timezoneOptions = getAvailableTimezones()

  const setNumberFormat = (value: PropertyNumberFormatId) => {
    if (config.type !== 'number') {
      return
    }

    props.update({
      config: {
        ...config,
        format: value
      }
    })
  }

  const setDateConfig = (
    patch: Partial<NonNullable<typeof dateConfig>>
  ) => {
    if (!dateConfig) {
      return
    }

    props.update({
      config: {
        ...dateConfig,
        ...patch
      }
    })
  }

  const setUrlConfig = (
    patch: Partial<NonNullable<typeof urlConfig>>
  ) => {
    if (!urlConfig) {
      return
    }

    props.update({
      config: {
        ...urlConfig,
        ...patch
      }
    })
  }

  if (numberFormat) {
    return (
      <PropertyPopoverRow
        label={renderMessage(meta.ui.property.editor.format)}
        suffix={renderMessage(numberFormat.message)}
        widthClassName="w-[220px]"
      >
        {close => (
          <PropertyChoiceList
            value={numberFormat.id as PropertyNumberFormatId}
            options={meta.property.number.format.list as readonly {
              id: PropertyNumberFormatId
              message: MessageSpec
            }[]}
            onSelect={value => {
              setNumberFormat(value)
              close()
            }}
          />
        )}
      </PropertyPopoverRow>
    )
  }

  if (urlConfig) {
    return (
      <PropertySwitchRow
        label={renderMessage(meta.ui.property.editor.displayFullUrl)}
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
      <PropertyPopoverRow
        label={renderMessage(meta.ui.property.editor.displayDateFormat)}
        suffix={renderMessage(displayDateFormat.message)}
        widthClassName="w-[220px]"
      >
        {close => (
          <PropertyChoiceList
            value={displayDateFormat.id as PropertyDisplayDateFormatId}
            options={meta.property.date.displayDateFormat.list as readonly {
              id: PropertyDisplayDateFormatId
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
      </PropertyPopoverRow>

      <PropertyPopoverRow
        label={renderMessage(meta.ui.property.editor.displayTimeFormat)}
        suffix={renderMessage(displayTimeFormat.message)}
        widthClassName="w-[220px]"
      >
        {close => (
          <PropertyChoiceList
            value={displayTimeFormat.id as PropertyDisplayTimeFormatId}
            options={meta.property.date.displayTimeFormat.list as readonly {
              id: PropertyDisplayTimeFormatId
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
      </PropertyPopoverRow>

      <PropertyPopoverRow
        label={renderMessage(meta.ui.property.editor.defaultValueKind)}
        suffix={renderMessage(defaultValueKind.message)}
        widthClassName="w-[220px]"
      >
        {close => (
          <PropertyChoiceList
            value={defaultValueKind.id as PropertyDateValueKindId}
            options={meta.property.date.defaultValueKind.list as readonly {
              id: PropertyDateValueKindId
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
      </PropertyPopoverRow>

      {dateConfig.defaultValueKind === 'datetime' ? (
        <PropertyPopoverRow
          label={renderMessage(meta.ui.property.editor.defaultTimezone)}
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
        </PropertyPopoverRow>
      ) : null}
    </>
  )
}

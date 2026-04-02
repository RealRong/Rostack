export type MessageValues = Record<string, unknown>

export interface MessageSpec {
  key: string
  fallback: string
  values?: MessageValues
}

export const message = (
  key: string,
  fallback: string,
  values?: MessageValues
): MessageSpec => ({
  key,
  fallback,
  values
})

export const renderMessage = (input: MessageSpec): string => (
  input.fallback.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = input.values?.[token]
    return value === undefined || value === null
      ? ''
      : String(value)
  })
)

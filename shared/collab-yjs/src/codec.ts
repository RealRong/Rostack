export const encodeJsonBytes = (
  value: unknown
): Uint8Array => new TextEncoder().encode(JSON.stringify(value))

export const decodeJsonBytes = (
  data: Uint8Array
): unknown => JSON.parse(new TextDecoder().decode(data))

export const isBinaryBytes = (
  value: unknown
): value is Uint8Array => value instanceof Uint8Array

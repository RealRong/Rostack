export type OpSync =
  | 'live'
  | 'checkpoint'

export interface OpMeta {
  family: string
  sync?: OpSync
  history?: boolean
}

export type OpMetaTable<Op extends { type: string }> =
  Record<Op['type'], OpMeta>

const getType = <Op extends { type: string }>(
  input: Op | Op['type']
): Op['type'] => (
  typeof input === 'string'
    ? input
    : input.type
)

const hasOwn = (
  value: object,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

export const meta = {
  create: <Op extends { type: string }>(
    table: Record<Op['type'], OpMeta>
  ): OpMetaTable<Op> => {
    const next = {
      ...table
    } as OpMetaTable<Op>

    for (const type of Object.keys(next) as Op['type'][]) {
      next[type] = Object.freeze({
        ...next[type]
      })
    }

    return Object.freeze(next)
  },
  get: <Op extends { type: string }>(
    table: OpMetaTable<Op>,
    input: Op | Op['type']
  ): OpMeta => {
    const type = getType(input)

    if (!hasOwn(table, type)) {
      throw new Error(`Unknown operation meta: ${type}`)
    }

    return table[type]
  },
  isLive: <Op extends { type: string }>(
    table: OpMetaTable<Op>,
    input: Op | Op['type']
  ): boolean => meta.get(table, input).sync !== 'checkpoint',
  tracksHistory: <Op extends { type: string }>(
    table: OpMetaTable<Op>,
    input: Op | Op['type']
  ): boolean => meta.get(table, input).history !== false
}

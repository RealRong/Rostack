export type OpSync =
  | 'live'
  | 'checkpoint'

export interface OpMeta {
  family: string
  sync?: OpSync
  history?: boolean
}

export interface FamilyMeta<Family extends string = string> extends OpMeta {
  family: Family
}

export type OpMetaTable<Op extends { type: string }> =
  Record<Op['type'], OpMeta>

export type FamilyMetaTable<
  Op extends { type: string },
  Family extends string
> = Record<Op['type'], FamilyMeta<Family>>

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
  create: <
    Op extends { type: string },
    Table extends OpMetaTable<Op> = OpMetaTable<Op>
  >(
    table: Table
  ): Table => {
    const next = {
      ...table
    } as Table

    for (const type of Object.keys(next) as (keyof Table)[]) {
      next[type] = Object.freeze({
        ...next[type]
      }) as Table[keyof Table]
    }

    return Object.freeze(next) as Table
  },
  family: <
    Op extends { type: string },
    Table extends FamilyMetaTable<Op, string> = FamilyMetaTable<Op, string>
  >(
    table: Table
  ): Table => meta.create(table),
  get: <
    Op extends { type: string },
    Table extends OpMetaTable<Op> = OpMetaTable<Op>
  >(
    table: Table,
    input: Op | Op['type']
  ): Table[Op['type']] => {
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

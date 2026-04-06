import type {
  Command,
  CommandPayload,
  CommandType
} from '@dataview/core/contracts/commands'

export type IndexedCommand<TType extends CommandType = CommandType> = TType extends CommandType
  ? Extract<Command, { type: TType }> & {
      commandIndex: number
    }
  : never

export const indexCommand = <TType extends CommandType>(
  command: Extract<Command, { type: TType }>,
  commandIndex: number
): IndexedCommand<TType> => ({
  ...command,
  commandIndex
}) as IndexedCommand<TType>

export const deriveIndexedCommand = <TType extends CommandType>(
  command: IndexedCommand,
  type: TType,
  payload: CommandPayload<TType>
): IndexedCommand<TType> => ({
  type,
  commandIndex: command.commandIndex,
  ...payload
}) as IndexedCommand<TType>

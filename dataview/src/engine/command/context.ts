import type {
  GroupCommand,
  GroupCommandPayload,
  GroupCommandType
} from '@/core/contracts/commands'

export type IndexedCommand<TType extends GroupCommandType = GroupCommandType> = TType extends GroupCommandType
  ? Extract<GroupCommand, { type: TType }> & {
      commandIndex: number
    }
  : never

export const indexCommand = <TType extends GroupCommandType>(
  command: Extract<GroupCommand, { type: TType }>,
  commandIndex: number
): IndexedCommand<TType> => ({
  ...command,
  commandIndex
}) as IndexedCommand<TType>

export const deriveIndexedCommand = <TType extends GroupCommandType>(
  command: IndexedCommand,
  type: TType,
  payload: GroupCommandPayload<TType>
): IndexedCommand<TType> => ({
  type,
  commandIndex: command.commandIndex,
  ...payload
}) as IndexedCommand<TType>

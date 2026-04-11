import type {
  Command
} from '@dataview/core/contracts/commands'
import type {
  DataDoc
} from '@dataview/core/contracts'
import {
  resolveWriteBatch,
  type ResolvedWriteBatch
} from '../command'

export const translateCommands = (
  document: DataDoc,
  command: Command | readonly Command[]
): ResolvedWriteBatch => resolveWriteBatch({
  document,
  commands: Array.isArray(command)
    ? command
    : [command]
})

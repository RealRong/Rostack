import type {
  DataDoc
} from '@dataview/core/contracts'
import {
  createCommandRead,
  type CommandRead
} from '../read/entities'

export interface CommandContext {
  index: number
  doc: DataDoc
  read: CommandRead
}

export const createCommandContext = (input: {
  index: number
  doc: DataDoc
}): CommandContext => ({
  index: input.index,
  doc: input.doc,
  read: createCommandRead(input.doc)
})

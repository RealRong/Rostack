import type {
  Command
} from '../../types/command'
import {
  createCompilerTx
} from './tx'
import {
  compileDocumentCommand
} from './document'
import {
  compileCanvasCommand
} from './canvas'
import {
  compileNodeCommand
} from './node'
import {
  compileGroupCommand
} from './group'
import {
  compileEdgeCommand
} from './edge'
import {
  compileMindmapCommand
} from './mindmap'
import type {
  CanvasCommand,
  DocumentCommand,
  EdgeCommand,
  GroupCommand,
  MindmapCommand,
  NodeCommand
} from '../../types/command'
import type {
  CompileResult,
  CompilerIds
} from '../types'
import type {
  CoreRegistries,
  Document,
  Size
} from '@whiteboard/core/types'

export const compileCommand = (
  command: Command,
  input: {
    document: Document
    registries: CoreRegistries
    ids: CompilerIds
    nodeSize: Size
  }
): CompileResult => {
  const compiler = createCompilerTx({
    document: input.document,
    ids: input.ids
  })

  try {
    const ctx = {
      tx: compiler.tx,
      registries: input.registries,
      nodeSize: input.nodeSize
    }

    const output = (() => {
      if (command.type.startsWith('document.')) {
        return compileDocumentCommand(command as DocumentCommand, ctx)
      }
      if (command.type.startsWith('canvas.')) {
        return compileCanvasCommand(command as CanvasCommand, ctx)
      }
      if (command.type.startsWith('node.')) {
        return compileNodeCommand(command as NodeCommand, ctx)
      }
      if (command.type.startsWith('group.')) {
        return compileGroupCommand(command as GroupCommand, ctx)
      }
      if (command.type.startsWith('edge.')) {
        return compileEdgeCommand(command as EdgeCommand, ctx)
      }
      if (command.type.startsWith('mindmap.')) {
        return compileMindmapCommand(command as MindmapCommand, ctx)
      }
      return compiler.tx.fail.invalid(`Unsupported command ${(command as { type: string }).type}.`)
    })()

    return compiler.ok(output)
  } catch (error) {
    return compiler.fail(error)
  }
}

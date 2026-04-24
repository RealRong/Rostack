import type {
  Command
} from '../../types/command'
import {
  createCompilerTx,
  isCompilerFailure
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
import { failure } from '../../result'
import { compile } from '@shared/mutation'
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
  try {
    const compiled = compile<Document, Command, import('@whiteboard/core/types').Operation, unknown>({
      doc: input.document,
      intents: [command],
      run: (ctx, current) => {
        const compiler = createCompilerTx({
          ctx,
          ids: input.ids
        })
        const compileCtx = {
          tx: compiler.tx,
          registries: input.registries,
          nodeSize: input.nodeSize
        }

        if (current.type.startsWith('document.')) {
          return compileDocumentCommand(current as DocumentCommand, compileCtx)
        }
        if (current.type.startsWith('canvas.')) {
          return compileCanvasCommand(current as CanvasCommand, compileCtx)
        }
        if (current.type.startsWith('node.')) {
          return compileNodeCommand(current as NodeCommand, compileCtx)
        }
        if (current.type.startsWith('group.')) {
          return compileGroupCommand(current as GroupCommand, compileCtx)
        }
        if (current.type.startsWith('edge.')) {
          return compileEdgeCommand(current as EdgeCommand, compileCtx)
        }
        if (current.type.startsWith('mindmap.')) {
          return compileMindmapCommand(current as MindmapCommand, compileCtx)
        }
        return compiler.tx.fail.invalid(`Unsupported command ${(current as { type: string }).type}.`)
      },
      previewApply: (document) => document,
      stopOnError: true
    })
    const issue = compiled.issues.find((entry) => entry.level !== 'warning')
    if (issue) {
      return failure(
        issue.code as 'invalid' | 'cancelled',
        issue.message
      )
    }

    return {
      ok: true,
      ops: compiled.ops,
      output: compiled.outputs[0]
    }
  } catch (error) {
    if (isCompilerFailure(error)) {
      return error.error
    }
    throw error
  }
}

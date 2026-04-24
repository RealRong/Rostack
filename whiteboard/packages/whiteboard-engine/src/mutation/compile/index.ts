import {
  compile,
  type Issue
} from '@shared/mutation'
import { scheduler } from '@shared/core'
import { reduceOperations } from '@whiteboard/core/kernel'
import type { ResultCode } from '@whiteboard/core/types'
import type {
  CoreRegistries,
  Document,
  Operation,
  Size
} from '@whiteboard/core/types'
import type {
  CanvasIntent,
  DocumentIntent,
  EdgeIntent,
  GroupIntent,
  Intent,
  IntentData,
  MindmapIntent,
  NodeIntent
} from '../../types/intent'
import type { CompilerIds } from '../types'
import {
  createCompilerTx,
  isCompilerFailure,
  type CompilerFailure
} from './tx'
import { compileCanvasIntent } from './canvas'
import { compileDocumentIntent } from './document'
import { compileEdgeIntent } from './edge'
import { compileGroupIntent } from './group'
import { compileMindmapIntent } from './mindmap'
import { compileNodeIntent } from './node'

const throwCompilerFailure = (
  code: 'invalid' | 'cancelled',
  message: string,
  details?: unknown
): never => {
  throw {
    kind: 'compile-failure',
    error: {
      ok: false,
      error: {
        code,
        message,
        details
      }
    }
  } satisfies CompilerFailure
}

const toCompileFailureCode = (
  code: ResultCode
): 'invalid' | 'cancelled' => code === 'cancelled'
  ? 'cancelled'
  : 'invalid'

export const compileIntents = (input: {
  document: Document
  intents: readonly Intent[]
  registries: CoreRegistries
  ids: CompilerIds
  nodeSize: Size
}): {
  ops: readonly Operation[]
  outputs: readonly IntentData[]
  issues?: readonly Issue[]
  canApply?: boolean
} => {
  try {
    const compiled = compile<Document, Intent, Operation, IntentData>({
      doc: input.document,
      intents: input.intents,
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
          return compileDocumentIntent(current as DocumentIntent, compileCtx)
        }
        if (current.type.startsWith('canvas.')) {
          return compileCanvasIntent(current as CanvasIntent, compileCtx)
        }
        if (current.type.startsWith('node.')) {
          return compileNodeIntent(current as NodeIntent, compileCtx)
        }
        if (current.type.startsWith('group.')) {
          return compileGroupIntent(current as GroupIntent, compileCtx)
        }
        if (current.type.startsWith('edge.')) {
          return compileEdgeIntent(current as EdgeIntent, compileCtx)
        }
        if (current.type.startsWith('mindmap.')) {
          return compileMindmapIntent(current as MindmapIntent, compileCtx)
        }
        return compiler.tx.fail.invalid(`Unsupported intent ${(current as { type: string }).type}.`)
      },
      previewApply: (document, ops) => {
        const preview = reduceOperations(document, ops, {
          now: scheduler.readMonotonicNow,
          origin: 'system'
        })
        if (!preview.ok) {
          return throwCompilerFailure(
            toCompileFailureCode(preview.error.code),
            preview.error.message,
            preview.error.details
          )
        }
        return preview.data.doc
      },
      stopOnError: true
    })

    return {
      ops: compiled.ops,
      outputs: compiled.outputs,
      issues: compiled.issues
    }
  } catch (error) {
    if (isCompilerFailure(error)) {
      return {
        ops: [],
        outputs: [],
        issues: [{
          code: error.error.error.code,
          message: error.error.error.message
        }],
        canApply: false
      }
    }
    throw error
  }
}

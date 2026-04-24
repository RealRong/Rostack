import type { CompileCtx } from '@shared/mutation'
import type {
  Document,
  ErrorInfo,
  Operation
} from '@whiteboard/core/types'
import type {
  CompilerIds,
  IntentCompilerTx
} from '../types'

export type CompilerFailure = {
  kind: 'compile-failure'
  error: {
    ok: false
    error: ErrorInfo<'invalid' | 'cancelled'>
  }
}

const createCompilerFailure = (
  code: 'invalid' | 'cancelled',
  message: string,
  details?: unknown
): CompilerFailure => ({
  kind: 'compile-failure',
  error: {
    ok: false,
    error: {
      code,
      message,
      details
    }
  }
})

export const isCompilerFailure = (
  error: unknown
): error is CompilerFailure => (
  typeof error === 'object'
  && error !== null
  && 'kind' in error
  && (error as { kind?: string }).kind === 'compile-failure'
)

export const createCompilerTx = ({
  ctx,
  ids
}: {
  ctx: CompileCtx<Document, Operation>
  ids: CompilerIds
}): {
  tx: IntentCompilerTx
} => {
  const tx: IntentCompilerTx = {
    read: {
      document: {
        get: () => ctx.doc()
      },
      canvas: {
        order: () => ctx.doc().canvas.order
      },
      node: {
        get: (id) => ctx.doc().nodes[id],
        require: (id) => {
          const node = ctx.require(
            ctx.doc().nodes[id],
            'invalid',
            `Node ${id} not found.`
          )
          if (!node) {
            throw new Error(`Unexpected missing node ${id}.`)
          }
          return node
        }
      },
      edge: {
        get: (id) => ctx.doc().edges[id],
        require: (id) => {
          const edge = ctx.require(
            ctx.doc().edges[id],
            'invalid',
            `Edge ${id} not found.`
          )
          if (!edge) {
            throw new Error(`Unexpected missing edge ${id}.`)
          }
          return edge
        }
      },
      group: {
        get: (id) => ctx.doc().groups[id],
        require: (id) => {
          const group = ctx.require(
            ctx.doc().groups[id],
            'invalid',
            `Group ${id} not found.`
          )
          if (!group) {
            throw new Error(`Unexpected missing group ${id}.`)
          }
          return group
        }
      },
      mindmap: {
        get: (id) => ctx.doc().mindmaps[id],
        require: (id) => {
          const mindmap = ctx.require(
            ctx.doc().mindmaps[id],
            'invalid',
            `Mindmap ${id} not found.`
          )
          if (!mindmap) {
            throw new Error(`Unexpected missing mindmap ${id}.`)
          }
          return mindmap
        }
      }
    },
    ids,
    emit: ctx.emit,
    emitMany: (ops) => {
      ctx.emitMany(...ops)
    },
    fail: {
      invalid: (message, details) => {
        throw createCompilerFailure('invalid', message, details)
      },
      cancelled: (message, details) => {
        throw createCompilerFailure('cancelled', message, details)
      }
    }
  }

  return {
    tx
  }
}

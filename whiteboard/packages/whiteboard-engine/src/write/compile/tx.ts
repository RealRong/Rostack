import type {
  Document,
  ErrorInfo,
  Operation
} from '@whiteboard/core/types'
import type {
  CommandCompilerTx,
  CompileResult,
  CompilerIds
} from '@whiteboard/engine/write/types'

type CompilerFailure = {
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

const isCompilerFailure = (
  error: unknown
): error is CompilerFailure => (
  typeof error === 'object'
  && error !== null
  && 'kind' in error
  && (error as { kind?: string }).kind === 'compile-failure'
)

export const createCompilerTx = ({
  document,
  ids
}: {
  document: Document
  ids: CompilerIds
}) => {
  const ops: Operation[] = []

  const tx: CommandCompilerTx = {
    read: {
      document: {
        get: () => document
      },
      canvas: {
        order: () => document.canvas.order
      },
      node: {
        get: (id) => document.nodes[id],
        require: (id) => {
          const node = document.nodes[id]
          if (!node) {
            throw createCompilerFailure('invalid', `Node ${id} not found.`)
          }
          return node
        }
      },
      edge: {
        get: (id) => document.edges[id],
        require: (id) => {
          const edge = document.edges[id]
          if (!edge) {
            throw createCompilerFailure('invalid', `Edge ${id} not found.`)
          }
          return edge
        }
      },
      group: {
        get: (id) => document.groups[id],
        require: (id) => {
          const group = document.groups[id]
          if (!group) {
            throw createCompilerFailure('invalid', `Group ${id} not found.`)
          }
          return group
        }
      },
      mindmap: {
        get: (id) => document.mindmaps[id],
        require: (id) => {
          const mindmap = document.mindmaps[id]
          if (!mindmap) {
            throw createCompilerFailure('invalid', `Mindmap ${id} not found.`)
          }
          return mindmap
        }
      }
    },
    ids,
    emit: (op) => {
      ops.push(op)
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
    tx,
    ok: <T>(output: T): CompileResult<T> => ({
      ok: true,
      ops,
      output
    }),
    fail: (error: unknown): CompileResult => {
      if (isCompilerFailure(error)) {
        return error.error
      }
      throw error
    }
  }
}

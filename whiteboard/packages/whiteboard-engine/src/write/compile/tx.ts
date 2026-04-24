import { planningContext, type ValidationIssue } from '@shared/core'
import type {
  Document,
  ErrorInfo,
  Operation
} from '@whiteboard/core/types'
import type {
  CommandCompilerTx,
  CompileResult,
  CompilerIds
} from '../types'

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

const raiseCompilerFailure = (
  issue: ValidationIssue<'invalid' | 'cancelled'>
): never => {
  throw createCompilerFailure(issue.code, issue.message, issue.details)
}

export const createCompilerTx = ({
  document,
  ids
}: {
  document: Document
  ids: CompilerIds
}) => {
  let context!: planningContext.PlanningContext<
    CommandCompilerTx['read'],
    Operation,
    'invalid' | 'cancelled'
  >

  context = planningContext.createPlanningContext({
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
          const node = context.require(document.nodes[id], {
            code: 'invalid',
            message: `Node ${id} not found.`
          })
          if (!node) {
            throw new Error(`Unexpected missing node ${id}.`)
          }
          return node
        }
      },
      edge: {
        get: (id) => document.edges[id],
        require: (id) => {
          const edge = context.require(document.edges[id], {
            code: 'invalid',
            message: `Edge ${id} not found.`
          })
          if (!edge) {
            throw new Error(`Unexpected missing edge ${id}.`)
          }
          return edge
        }
      },
      group: {
        get: (id) => document.groups[id],
        require: (id) => {
          const group = context.require(document.groups[id], {
            code: 'invalid',
            message: `Group ${id} not found.`
          })
          if (!group) {
            throw new Error(`Unexpected missing group ${id}.`)
          }
          return group
        }
      },
      mindmap: {
        get: (id) => document.mindmaps[id],
        require: (id) => {
          const mindmap = context.require(document.mindmaps[id], {
            code: 'invalid',
            message: `Mindmap ${id} not found.`
          })
          if (!mindmap) {
            throw new Error(`Unexpected missing mindmap ${id}.`)
          }
          return mindmap
        }
      }
    },
    mode: 'fail-fast',
    raise: raiseCompilerFailure
  })

  const tx: CommandCompilerTx = {
    read: context.read,
    ids,
    emit: context.emit,
    emitMany: context.emitMany,
    fail: {
      invalid: (message, details) => {
        context.issue({
          code: 'invalid',
          message,
          details
        })
        throw new Error('Unreachable compiler invalid branch.')
      },
      cancelled: (message, details) => {
        context.issue({
          code: 'cancelled',
          message,
          details
        })
        throw new Error('Unreachable compiler cancelled branch.')
      }
    }
  }

  return {
    tx,
    ok: <T>(output: T): CompileResult<T> => ({
      ok: true,
      ops: context.finish().operations,
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

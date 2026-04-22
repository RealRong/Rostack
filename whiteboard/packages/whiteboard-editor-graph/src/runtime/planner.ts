import {
  createPlan,
  type RuntimePlanner
} from '@shared/projection-runtime'
import type {
  InputChange,
  Snapshot
} from '../contracts/editor'
import type { Token } from '../contracts/impact'
import type { EditorPhaseName } from './phaseNames'

const readImpactTokens = (
  change: InputChange,
  bootstrap: boolean
): readonly Token[] => {
  const tokens: Token[] = []

  if (bootstrap || change.document.changed) {
    tokens.push({
      domain: 'document',
      kind: 'root'
    })
  }

  if (bootstrap || change.session.changed) {
    tokens.push(
      {
        domain: 'session',
        kind: 'edit'
      },
      {
        domain: 'session',
        kind: 'draft'
      },
      {
        domain: 'session',
        kind: 'preview'
      },
      {
        domain: 'session',
        kind: 'tool'
      }
    )
  }

  if (bootstrap || change.measure.changed) {
    tokens.push({
      domain: 'measure',
      kind: 'text'
    })
  }

  if (bootstrap || change.interaction.changed) {
    tokens.push(
      {
        domain: 'interaction',
        kind: 'selection'
      },
      {
        domain: 'interaction',
        kind: 'hover'
      },
      {
        domain: 'interaction',
        kind: 'drag'
      }
    )
  }

  if (bootstrap || change.viewport.changed) {
    tokens.push(
      {
        domain: 'viewport',
        kind: 'camera'
      },
      {
        domain: 'viewport',
        kind: 'visible-world'
      }
    )
  }

  if (bootstrap || change.clock.changed) {
    tokens.push({
      domain: 'clock',
      kind: 'tick'
    })
  }

  return tokens
}

const hasInputChange = (
  change: InputChange
): boolean => (
  change.document.changed
  || change.session.changed
  || change.measure.changed
  || change.interaction.changed
  || change.viewport.changed
  || change.clock.changed
)

export const createEditorGraphPlanner = (): RuntimePlanner<
  InputChange,
  Snapshot,
  EditorPhaseName,
  Token
> => ({
  plan: ({ change, previous }) => {
    const bootstrap = previous.revision === 0
    if (!bootstrap && !hasInputChange(change)) {
      return createPlan<EditorPhaseName, Token>()
    }

    const tokens = readImpactTokens(change, bootstrap)
    return createPlan<EditorPhaseName, Token>({
      dirty: new Map([
        [
          'input',
          new Set(tokens)
        ]
      ])
    })
  }
})

import {
  createPlan,
  type RuntimePlanner
} from '@shared/projection-runtime'
import type {
  Input,
  Snapshot
} from '../contracts/editor'
import type { Token } from '../contracts/impact'
import type { EditorPhaseName } from './phaseNames'

const readImpactTokens = (
  impact: Input['impact'],
  bootstrap: boolean
): readonly Token[] => {
  const tokens: Token[] = []

  if (bootstrap || impact.document.changed) {
    tokens.push({
      domain: 'document',
      kind: 'root'
    })
  }

  if (bootstrap || impact.session.changed) {
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

  if (bootstrap || impact.measure.changed) {
    tokens.push({
      domain: 'measure',
      kind: 'text'
    })
  }

  if (bootstrap || impact.interaction.changed) {
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

  if (bootstrap || impact.viewport.changed) {
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

  if (bootstrap || impact.clock.changed) {
    tokens.push({
      domain: 'clock',
      kind: 'tick'
    })
  }

  return tokens
}

const hasImpactChange = (
  impact: Input['impact']
): boolean => (
  impact.document.changed
  || impact.session.changed
  || impact.measure.changed
  || impact.interaction.changed
  || impact.viewport.changed
  || impact.clock.changed
)

export const createEditorGraphPlanner = (): RuntimePlanner<
  Input,
  Snapshot,
  EditorPhaseName,
  Token
> => ({
  plan: ({ input, previous }) => {
    const bootstrap = previous.revision === 0
    if (!bootstrap && !hasImpactChange(input.impact)) {
      return createPlan<EditorPhaseName, Token>()
    }

    const tokens = readImpactTokens(input.impact, bootstrap)
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

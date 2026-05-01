import {
  defineMutationRegistry,
  type MutationRegistry
} from '@shared/mutation/engine'
import type { EditorStateDocument } from './document'

export const editorStateRegistry = defineMutationRegistry<EditorStateDocument>()({
  entity: {
    tool: {
      kind: 'singleton',
      members: {
        value: 'record'
      },
      change: {
        value: ['value.**']
      }
    },
    draw: {
      kind: 'singleton',
      members: {
        value: 'record'
      },
      change: {
        value: ['value.**']
      }
    },
    selection: {
      kind: 'singleton',
      members: {
        value: 'record'
      },
      change: {
        value: ['value.nodeIds', 'value.edgeIds']
      }
    },
    edit: {
      kind: 'singleton',
      members: {
        value: 'record'
      },
      change: {
        value: ['value.**']
      }
    },
    interaction: {
      kind: 'singleton',
      members: {
        value: 'record'
      },
      change: {
        value: ['value.mode', 'value.chrome', 'value.space', 'value.hover.**']
      }
    },
    preview: {
      kind: 'singleton',
      members: {
        value: 'record'
      },
      change: {
        value: ['value.**']
      }
    },
    viewport: {
      kind: 'singleton',
      members: {
        value: 'record'
      },
      change: {
        value: ['value.center', 'value.zoom']
      }
    }
  }
}) satisfies MutationRegistry<EditorStateDocument>

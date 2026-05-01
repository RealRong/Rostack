import {
  defineMutationRegistry,
  type MutationRegistry
} from '@shared/mutation/engine'
import type { EditorStateDocument } from './document'

export const editorStateRegistry = defineMutationRegistry<EditorStateDocument>()({
  entity: {
    state: {
      kind: 'singleton',
      members: {
        tool: 'record',
        draw: 'record',
        selection: 'record',
        edit: 'record',
        interaction: 'record',
        viewport: 'record'
      },
      change: {
        tool: ['tool.**'],
        draw: ['draw.**'],
        selection: ['selection.nodeIds', 'selection.edgeIds'],
        edit: ['edit.**'],
        interaction: ['interaction.mode', 'interaction.chrome', 'interaction.space'],
        viewport: ['viewport.center', 'viewport.zoom']
      }
    },
    overlay: {
      kind: 'singleton',
      members: {
        hover: 'record',
        preview: 'record'
      },
      change: {
        hover: ['hover.**'],
        preview: ['preview.base.**', 'preview.transient.**']
      }
    }
  }
}) satisfies MutationRegistry<EditorStateDocument>

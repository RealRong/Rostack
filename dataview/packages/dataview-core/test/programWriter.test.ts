import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  createMutationPorts,
  createMutationProgramWriter
} from '@shared/mutation'
import {
  dataviewMutationRegistry
} from '@dataview/core'

test('dataview mutation ports lower entity and ordered writes to shared program steps', () => {
  const base = createMutationProgramWriter<string>()
  const program = createMutationPorts(dataviewMutationRegistry, base)

  program.document.patch({
    activeViewId: 'view_1'
  })
  program.record.patch('record_1', {
    title: 'Next'
  }, ['record.title'])
  program.viewDisplay('view_1').insert('field_1', {
    kind: 'before',
    itemId: 'field_2'
  })
  program.fieldOptions('field_1').delete('option_1')

  assert.deepEqual(base.build(), {
    steps: [
      {
        type: 'entity.patch',
        entity: {
          kind: 'entity',
          type: 'document',
          id: 'document'
        },
        writes: {
          activeViewId: 'view_1'
        }
      },
      {
        type: 'entity.patch',
        entity: {
          kind: 'entity',
          type: 'record',
          id: 'record_1'
        },
        writes: {
          title: 'Next'
        },
        tags: ['record.title']
      },
      {
        type: 'ordered.insert',
        target: {
          kind: 'ordered',
          type: 'view.display.fields',
          key: 'view_1'
        },
        itemId: 'field_1',
        value: 'field_1',
        to: {
          kind: 'before',
          itemId: 'field_2'
        }
      },
      {
        type: 'ordered.delete',
        target: {
          kind: 'ordered',
          type: 'field.options',
          key: 'field_1'
        },
        itemId: 'option_1',
      }
    ]
  })
})

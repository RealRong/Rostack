import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createMutationProgramWriter } from '@shared/mutation'
import { createDataviewProgramWriter } from '@dataview/core'

test('DataviewProgramWriter lowers entity and ordered writes to shared program steps', () => {
  const base = createMutationProgramWriter<string>()
  const writer = createDataviewProgramWriter(base)

  writer.document.patch({
    activeViewId: 'view_1'
  })
  writer.record.patch('record_1', {
    title: 'Next'
  }, ['record.title'])
  writer.view.display.insert('view_1', 'field_1', {
    before: 'field_2'
  })
  writer.field.option.delete('field_1', 'option_1')
  writer.semantic.change('view.query', {
    ids: ['view_1'],
    paths: {
      view_1: ['sort']
    }
  })

  assert.deepEqual(base.build(), {
    steps: [
      {
        type: 'entity.patch',
        entity: {
          table: 'document',
          id: 'document'
        },
        writes: {
          activeViewId: 'view_1'
        }
      },
      {
        type: 'entity.patch',
        entity: {
          table: 'record',
          id: 'record_1'
        },
        writes: {
          title: 'Next'
        },
        tags: ['record.title']
      },
      {
        type: 'ordered.insert',
        structure: 'view.display.fields:view_1',
        itemId: 'field_1',
        value: 'field_1',
        to: {
          kind: 'before',
          itemId: 'field_2'
        }
      },
      {
        type: 'ordered.delete',
        structure: 'field.options:field_1',
        itemId: 'option_1'
      },
      {
        type: 'semantic.change',
        key: 'view.query',
        change: {
          ids: ['view_1'],
          paths: {
            view_1: ['sort']
          }
        }
      }
    ]
  })
})

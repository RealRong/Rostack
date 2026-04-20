import {
  group
} from '@dataview/core/group'
import type { ActiveViewApi } from '@dataview/engine/contracts'
import type { ActiveViewContext } from '@dataview/engine/active/context'

export const createSectionsApi = (
  base: ActiveViewContext
): ActiveViewApi['sections'] => ({
  show: key => base.patch((view, reader) => {
    const fieldId = view.group?.field
    const field = fieldId
      ? reader.fields.get(fieldId)
      : undefined
    return field
      ? {
          group: group.setBucketHidden(view.group, field, key, false) ?? null
        }
      : undefined
  }),
  hide: key => base.patch((view, reader) => {
    const fieldId = view.group?.field
    const field = fieldId
      ? reader.fields.get(fieldId)
      : undefined
    return field
      ? {
          group: group.setBucketHidden(view.group, field, key, true) ?? null
        }
      : undefined
  }),
  collapse: key => base.patch((view, reader) => {
    const fieldId = view.group?.field
    const field = fieldId
      ? reader.fields.get(fieldId)
      : undefined
    return field
      ? {
          group: group.setBucketCollapsed(view.group, field, key, true) ?? null
        }
      : undefined
  }),
  expand: key => base.patch((view, reader) => {
    const fieldId = view.group?.field
    const field = fieldId
      ? reader.fields.get(fieldId)
      : undefined
    return field
      ? {
          group: group.setBucketCollapsed(view.group, field, key, false) ?? null
        }
      : undefined
  }),
  toggleCollapse: key => base.patch((view, reader) => {
    const fieldId = view.group?.field
    const field = fieldId
      ? reader.fields.get(fieldId)
      : undefined
    return field
      ? {
          group: group.toggleBucketCollapsed(view.group, field, key) ?? null
        }
      : undefined
  })
})

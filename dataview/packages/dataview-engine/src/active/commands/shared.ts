import type {
  Field,
  FieldId,
  View,
  ViewPatch
} from '@dataview/core/contracts'
import type {
  ActiveViewContext
} from '@dataview/engine/active/context'

export const withViewPatch = (
  base: ActiveViewContext,
  resolvePatch: (view: View) => ViewPatch
) => {
  base.withView(view => {
    base.commitPatch(resolvePatch(view))
  })
}

export const withFieldPatch = (
  base: ActiveViewContext,
  fieldId: FieldId,
  resolvePatch: (view: View, field: Field) => ViewPatch
) => {
  base.withField(fieldId, (view, field) => {
    base.commitPatch(resolvePatch(view, field))
  })
}

export const withFilterFieldPatch = (
  base: ActiveViewContext,
  index: number,
  resolvePatch: (view: View, field: Field | undefined) => ViewPatch
) => {
  base.withFilterField(index, (view, field) => {
    base.commitPatch(resolvePatch(view, field))
  })
}

export const withGroupFieldPatch = (
  base: ActiveViewContext,
  resolvePatch: (view: View, field: Field) => ViewPatch
) => {
  base.withGroupField((view, field) => {
    base.commitPatch(resolvePatch(view, field))
  })
}

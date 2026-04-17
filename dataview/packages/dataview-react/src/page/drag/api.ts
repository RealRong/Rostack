import { createNullableControllerStore } from '@dataview/react/runtime/store'
import type {
  DragApi,
  DragSpec
} from '@dataview/react/page/drag/types'

export const createDragApi = (): DragApi => {
  const {
    store,
    get,
    clear
  } = createNullableControllerStore<DragSpec>()

  return {
    store,
    get,
    clear,
    set: next => {
      store.set(next)
    }
  }
}

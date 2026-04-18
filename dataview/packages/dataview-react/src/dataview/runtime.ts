import type {
  Engine
} from '@dataview/engine'
import {
  createDataViewRuntime,
  type PageSessionInput
} from '@dataview/runtime'
import {
  createDragApi
} from '@dataview/react/page/drag'
import {
  createMarqueeBridgeApi
} from '@dataview/react/page/marqueeBridge'
import type {
  DataViewReactSession
} from '@dataview/react/dataview/types'

export const createDataViewReactSession = (input: {
  engine: Engine
  initialPage?: PageSessionInput
}): DataViewReactSession => {
  const runtime = createDataViewRuntime(input)
  const drag = createDragApi()
  const marquee = createMarqueeBridgeApi()

  return {
    ...runtime,
    react: {
      drag,
      marquee
    },
    dispose: () => {
      drag.clear()
      runtime.dispose()
    }
  }
}

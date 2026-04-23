import type {
  Engine
} from '@dataview/engine'
import {
  createDataViewRuntime
} from '@dataview/runtime'
import type {
  PageSessionInput
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
  page?: PageSessionInput
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

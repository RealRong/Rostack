import { useEffect } from 'react'
import type { WhiteboardHostRuntime } from '../host/runtime'

export const HostLifecycle = ({
  host,
  hostConfig
}: {
  host: WhiteboardHostRuntime
  hostConfig: {
    viewport: {
      minZoom: number
      maxZoom: number
      enablePan: boolean
      enableWheel: boolean
      wheelSensitivity: number
    }
  }
}) => {
  useEffect(() => {
    host.editorHost.viewport.setLimits(hostConfig.viewport)
    host.editorHost.inputPolicy.set({
      panEnabled: hostConfig.viewport.enablePan,
      wheelEnabled: hostConfig.viewport.enableWheel,
      wheelSensitivity: hostConfig.viewport.wheelSensitivity
    })
  }, [host, hostConfig])

  useEffect(() => () => {
    host.insert.clear()
  }, [host])

  return null
}

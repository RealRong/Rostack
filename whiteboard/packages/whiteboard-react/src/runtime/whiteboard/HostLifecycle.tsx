import { useEffect } from 'react'
import type { WhiteboardHostRuntime } from '../host/runtime'

export const HostLifecycle = ({
  editor,
  host,
  hostConfig
}: {
  editor: import('../../types/runtime').WhiteboardRuntime
  host: WhiteboardHostRuntime
  hostConfig: {
    viewport: {
      minZoom: number
      maxZoom: number
    }
  }
}) => {
  useEffect(() => {
    editor.commands.viewport.setLimits(hostConfig.viewport)
  }, [editor, host, hostConfig])

  useEffect(() => () => {
    host.insert.clear()
  }, [host])

  return null
}

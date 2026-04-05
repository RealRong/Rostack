import type { RefObject } from 'react'
import { PresenceLayer } from '../features/collab/PresenceLayer'
import { ContextMenu } from '../features/selection/chrome/ContextMenu'
import { Marquee } from '../features/selection/Marquee'
import { NodeToolbar } from '../features/selection/chrome/NodeToolbar'
import { ToolPalette } from '../features/toolbox/ToolPalette'
import { ViewportDock } from '../features/viewport/ViewportDock'
import type { WhiteboardPresenceBinding } from '../types/common/presence'

export const Chrome = ({
  containerRef,
  presenceBinding
}: {
  containerRef: RefObject<HTMLDivElement | null>
  presenceBinding?: WhiteboardPresenceBinding
}) => {
  return (
    <>
      <ToolPalette containerRef={containerRef} />
      <ViewportDock />
      <PresenceLayer binding={presenceBinding} />
      <Marquee />
      <NodeToolbar
        containerRef={containerRef}
      />
      <ContextMenu
        containerRef={containerRef}
      />
    </>
  )
}

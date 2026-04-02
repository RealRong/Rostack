import type { RefObject } from 'react'
import { ContextMenu } from '../features/selection/chrome/ContextMenu'
import { Marquee } from '../features/selection/Marquee'
import { NodeToolbar } from '../features/selection/chrome/NodeToolbar'
import { ToolPalette } from '../features/toolbox/ToolPalette'
import { ViewportDock } from '../features/viewport/ViewportDock'

export const Chrome = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  return (
    <>
      <ToolPalette containerRef={containerRef} />
      <ViewportDock />
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

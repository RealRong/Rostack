import {
  Fragment,
  useCallback,
  useMemo,
  type RefObject
} from 'react'
import type { Point } from '@whiteboard/core/types'
import { useStoreValue } from '@shared/react'
import { ToolbarDivider } from '@shared/ui'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import { readToolbarItemSpec, renderToolbarPanel } from '@whiteboard/react/features/selection/chrome/toolbar/items'
import { resolveToolbarRecipe } from '@whiteboard/react/features/selection/chrome/toolbar/recipe'
import type { ToolbarPanelKey } from '@whiteboard/react/features/selection/chrome/toolbar/types'
import { FloatingToolbarShell } from '@whiteboard/react/features/selection/chrome/FloatingToolbarShell'

export const NodeToolbar = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const editor = useEditorRuntime()
  const panel = useStoreValue(editor.read.panel)
  const toolbar = panel.nodeToolbar
  const worldToScreen = useCallback(
    (point: Point) => editor.read.viewport.worldToScreen(point),
    [editor]
  )
  const recipe = useMemo(
    () => toolbar ? resolveToolbarRecipe(toolbar) : [],
    [toolbar]
  )

  if (!toolbar || !recipe.length) {
    return null
  }

  const toolbarUnits = recipe.reduce((total, entry) => (
    total + (
      entry.kind === 'divider'
        ? 1
        : (readToolbarItemSpec(entry.key).units ?? 1)
    )
  ), 0)

  return (
    <FloatingToolbarShell<ToolbarPanelKey>
      containerRef={containerRef}
      toolbarKey={toolbar.key}
      box={toolbar.box}
      itemCount={toolbarUnits}
      worldToScreen={worldToScreen}
      panelClassName={(activePanelKey) => (
        activePanelKey === 'more' || activePanelKey === 'filter'
          ? 'w-[240px]'
          : 'w-auto'
      )}
      renderToolbar={({
        activePanelKey,
        togglePanel,
        registerPanelButton
      }) => (
        <>
          {recipe.map((entry, index) => {
            if (entry.kind === 'divider') {
              return <ToolbarDivider key={`divider:${index}`} />
            }

            const spec = readToolbarItemSpec(entry.key)

            return (
              <Fragment key={`${entry.key}:${index}`}>
                {spec.renderButton({
                  context: toolbar,
                  editor,
                  activePanelKey,
                  togglePanel,
                  registerPanelButton
                })}
              </Fragment>
            )
          })}
        </>
      )}
      renderPanel={({
        activePanelKey,
        closePanel
      }) => renderToolbarPanel({
        panelKey: activePanelKey,
        context: toolbar,
        editor,
        closePanel
      })}
    />
  )
}

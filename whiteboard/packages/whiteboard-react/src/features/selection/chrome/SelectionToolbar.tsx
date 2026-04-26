import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject
} from 'react'
import type { Point } from '@whiteboard/core/types'
import { useStoreValue } from '@shared/react'
import { ToolbarDivider } from '@shared/ui'
import { readSelectionCan } from '@whiteboard/react/features/selection/capability'
import { FloatingToolbarShell } from '@whiteboard/react/features/selection/chrome/FloatingToolbarShell'
import { readToolbarItemSpec, renderToolbarPanel } from '@whiteboard/react/features/selection/chrome/toolbar/items'
import { resolveToolbarRecipe } from '@whiteboard/react/features/selection/chrome/toolbar/recipe'
import type { ToolbarPanelKey } from '@whiteboard/react/features/selection/chrome/toolbar/types'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'

export const SelectionToolbar = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const editor = useEditorRuntime()
  const toolbar = useStoreValue(editor.session.panel.selectionToolbar)
  const viewport = useStoreValue(editor.session.viewport)
  void viewport
  const [activeScopeKey, setActiveScopeKey] = useState<string | null>(null)
  const worldToScreen = useCallback(
    (point: Point) => editor.scene.query.view.screenPoint(point),
    [editor]
  )

  useEffect(() => {
    setActiveScopeKey(toolbar?.defaultScopeKey ?? null)
  }, [toolbar?.key, toolbar?.defaultScopeKey])

  useEffect(() => {
    if (!toolbar || !activeScopeKey) {
      return
    }

    if (!toolbar.scopes.some((scope) => scope.key === activeScopeKey)) {
      setActiveScopeKey(toolbar.defaultScopeKey)
    }
  }, [activeScopeKey, toolbar])

  const activeScope = useMemo(() => {
    if (!toolbar) {
      return undefined
    }

    return toolbar.scopes.find((scope) => scope.key === activeScopeKey)
      ?? toolbar.scopes.find((scope) => scope.key === toolbar.defaultScopeKey)
      ?? toolbar.scopes[0]
  }, [activeScopeKey, toolbar])

  const selectionCan = useMemo(
    () => toolbar
      ? readSelectionCan({
          editor,
          target: toolbar.target
        })
      : {
          order: false,
          makeGroup: false,
          ungroup: false,
          copy: false,
          cut: false,
          duplicate: false,
          delete: false,
          align: false,
          distribute: false
        },
    [editor, toolbar]
  )
  const scopeCan = useMemo(
    () => activeScope
      ? readSelectionCan({
          editor,
          target: activeScope.target
        })
      : {
          order: false,
          makeGroup: false,
          ungroup: false,
          copy: false,
          cut: false,
          duplicate: false,
          delete: false,
          align: false,
          distribute: false
        },
    [activeScope, editor]
  )
  const recipe = useMemo(
    () => toolbar && activeScope
      ? resolveToolbarRecipe({
          context: toolbar,
          activeScope,
          selectionCan,
          scopeCan
        })
      : [],
    [activeScope, scopeCan, selectionCan, toolbar]
  )

  if (!toolbar || !activeScope || !recipe.length) {
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
        activePanelKey === 'more' || activePanelKey === 'scope'
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
                  activeScope,
                  selectionCan,
                  scopeCan,
                  editor,
                  activePanelKey,
                  togglePanel,
                  registerPanelButton,
                  setActiveScope: (key) => {
                    setActiveScopeKey(key)
                  }
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
        activeScope,
        selectionCan,
        scopeCan,
        editor,
        closePanel,
        setActiveScope: (key) => {
          setActiveScopeKey(key)
        }
      })}
    />
  )
}

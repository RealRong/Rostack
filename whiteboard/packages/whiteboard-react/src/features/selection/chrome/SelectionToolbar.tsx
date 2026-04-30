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
import { compiledToolbarSpec } from '@whiteboard/react/features/selection/chrome/toolbar/spec'
import type {
  ToolbarItemKey,
  ToolbarPanelKey
} from '@whiteboard/react/features/selection/chrome/toolbar/types'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'

export const SelectionToolbar = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const editor = useEditorRuntime()
  const toolbar = useStoreValue(editor.derived.editor.selection.toolbar)
  const viewport = useStoreValue(editor.state.viewport)
  void viewport
  const [activeScopeKey, setActiveScopeKey] = useState<string | null>(null)
  const worldToScreen = useCallback(
    (point: Point) => editor.scene.viewport.screenPoint(point),
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
    () => {
      if (!toolbar || !activeScope) {
        return []
      }

      const layout = activeScope.node
        ? compiledToolbarSpec.layoutByTarget.node
        : compiledToolbarSpec.layoutByTarget.edge
      const entries: Array<
        | { kind: 'divider' }
        | { kind: 'item'; key: ToolbarItemKey }
      > = []

      layout.forEach((group) => {
        const visible = group.filter((key) => compiledToolbarSpec.visibilityByItemKey[key]({
          context: toolbar,
          activeScope,
          selectionCan,
          scopeCan
        }))
        if (!visible.length) {
          return
        }

        if (entries.length) {
          entries.push({
            kind: 'divider'
          })
        }

        visible.forEach((key) => {
          entries.push({
            kind: 'item',
            key
          })
        })
      })

      return entries
    },
    [activeScope, scopeCan, selectionCan, toolbar]
  )

  if (!toolbar || !activeScope || !recipe.length) {
    return null
  }

  const toolbarUnits = recipe.reduce((total, entry) => (
    total + (
      entry.kind === 'divider'
        ? 1
        : (compiledToolbarSpec.itemByKey.get(entry.key).units ?? 1)
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

            const spec = compiledToolbarSpec.itemByKey.get(entry.key)

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
      }) => {
        if (!activePanelKey) {
          return null
        }

        const panel = compiledToolbarSpec.panelByKey.resolve(activePanelKey)
        return panel?.render({
          context: toolbar,
          activeScope,
          selectionCan,
          scopeCan,
          editor,
          closePanel,
          setActiveScope: (key) => {
            setActiveScopeKey(key)
          }
        }) ?? null
      }}
    />
  )
}

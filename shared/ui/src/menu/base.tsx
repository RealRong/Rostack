import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { cn } from '#ui/utils'
import { Level } from '#ui/menu/level'
import {
  appendPath,
  firstEnabledPath,
  isPathPrefix,
  isSamePath,
  isVisiblePath,
  normalizeExpandedPath,
  normalizeValue,
  parentPath,
  serializePath,
  toValueResult,
  toggleSelection
} from '#ui/menu/shared'
import type {
  Controller,
  Handle,
  Path,
  Props,
  SubmenuCloseReason,
  SubmenuItem
} from '#ui/menu/types'

export const Base = forwardRef<Handle, Props>((props, ref) => {
  const submenuOpenPolicy = props.submenuOpenPolicy ?? 'hover'
  const open = props.open ?? true
  const selectionMode = props.selectionMode ?? 'none'
  const selectionAppearance = props.selectionAppearance ?? 'row'
  const [uncontrolledValue, setUncontrolledValue] = useState<string | readonly string[]>(
    props.defaultValue ?? (selectionMode === 'multiple' ? [] : '')
  )
  const selectedKeys = useMemo(
    () => normalizeValue(props.value ?? uncontrolledValue),
    [props.value, uncontrolledValue]
  )
  const itemRefs = useRef<Record<string, HTMLElement | null>>({})
  const pendingTriggerPressPathRef = useRef<string | null>(null)
  const [activePath, setActivePath] = useState<Path>([])
  const [activeSource, setActiveSource] = useState<'pointer' | 'keyboard' | null>(null)
  const [pendingFocusPath, setPendingFocusPath] = useState<Path | null>(null)
  const [uncontrolledOpenRootKey, setUncontrolledOpenRootKey] = useState<string | null>(
    props.openSubmenuKey ?? null
  )
  const [openTail, setOpenTail] = useState<string[]>([])
  const rootOpenKey = props.openSubmenuKey !== undefined
    ? props.openSubmenuKey
    : uncontrolledOpenRootKey
  const rawOpenPath = useMemo<Path>(() => (
    rootOpenKey
      ? [rootOpenKey, ...openTail]
      : []
  ), [openTail, rootOpenKey])
  const openPath = useMemo(
    () => normalizeExpandedPath(props.items, rawOpenPath),
    [props.items, rawOpenPath]
  )

  useEffect(() => {
    if (props.openSubmenuKey !== undefined) {
      setOpenTail([])
    }
  }, [props.openSubmenuKey])

  useEffect(() => {
    if (props.openSubmenuKey !== undefined || isSamePath(rawOpenPath, openPath)) {
      return
    }

    setUncontrolledOpenRootKey(openPath[0] ?? null)
    setOpenTail(openPath.slice(1))
  }, [openPath, props.openSubmenuKey, rawOpenPath])

  useEffect(() => {
    if (!activePath.length) {
      return
    }

    if (!isVisiblePath(props.items, activePath, openPath)) {
      setActivePath([])
      setActiveSource(null)
    }
  }, [activePath, openPath, props.items])

  useEffect(() => {
    if (open) {
      return
    }

    setActivePath([])
    setActiveSource(null)
    setPendingFocusPath(null)
    if (props.openSubmenuKey === undefined) {
      setUncontrolledOpenRootKey(null)
      setOpenTail([])
    }
  }, [open, props.openSubmenuKey])

  const rootEnabledPaths = useMemo(
    () => props.items
      .filter(item => item.kind !== 'divider' && item.kind !== 'label' && item.kind !== 'custom' && !item.disabled)
      .map(item => appendPath([], item.key)),
    [props.items]
  )

  const setOpenPath = useCallback((nextPath: Path) => {
    const nextRootKey = nextPath[0] ?? null
    const nextTail = nextRootKey
      ? nextPath.slice(1)
      : []

    if (props.openSubmenuKey === undefined) {
      setUncontrolledOpenRootKey(nextRootKey)
    }
    setOpenTail(nextTail)
    props.onOpenSubmenuChange?.(nextRootKey)
  }, [props.onOpenSubmenuChange, props.openSubmenuKey])

  const focusPath = useCallback((path: Path) => {
    const element = itemRefs.current[serializePath(path)]
    if (!element) {
      setPendingFocusPath(path)
      return
    }

    setPendingFocusPath(null)
    element.focus({ preventScroll: true })
    element.scrollIntoView({
      block: 'nearest'
    })
  }, [])

  const registerItemRef = useCallback((path: Path, element: HTMLElement | null) => {
    const pathKey = serializePath(path)
    itemRefs.current[pathKey] = element

    if (element && pendingFocusPath && isSamePath(path, pendingFocusPath)) {
      element.focus({ preventScroll: true })
      element.scrollIntoView({
        block: 'nearest'
      })
      setPendingFocusPath(null)
    }
  }, [pendingFocusPath])

  const setActivePointerPath = useCallback((path: Path) => {
    setActivePath(path)
    setActiveSource('pointer')
  }, [])

  const setActiveKeyboardPath = useCallback((path: Path) => {
    setActivePath(path)
    setActiveSource('keyboard')
    focusPath(path)
  }, [focusPath])

  const clearActivePath = useCallback(() => {
    setActivePath([])
    setActiveSource(null)
  }, [])

  const clearPointerActivePath = useCallback(() => {
    if (activeSource !== 'pointer') {
      return
    }

    clearActivePath()
  }, [activeSource, clearActivePath])

  const onItemValueToggle = useCallback((itemKey: string) => {
    if (selectionMode === 'none') {
      return
    }

    const nextSelectedKeys = toggleSelection(selectionMode, selectedKeys, itemKey)
    const nextValue = toValueResult(selectionMode, nextSelectedKeys)
    if (props.value === undefined) {
      setUncontrolledValue(nextValue)
    }
    props.onValueChange?.(nextValue)
  }, [props.onValueChange, props.value, selectedKeys, selectionMode])

  const trimOpenPath = useCallback((path: Path) => {
    if (!isPathPrefix(path, openPath) || isSamePath(path, openPath)) {
      return
    }

    setOpenPath(path)
  }, [openPath, setOpenPath])

  const moveRootActive = useCallback((delta: number) => {
    if (!rootEnabledPaths.length) {
      return
    }

    const currentIndex = rootEnabledPaths.findIndex(path => isSamePath(path, activePath))
    const baseIndex = currentIndex === -1
      ? (delta > 0 ? -1 : 0)
      : currentIndex
    const nextIndex = (baseIndex + delta + rootEnabledPaths.length) % rootEnabledPaths.length
    const nextPath = rootEnabledPaths[nextIndex] ?? null
    if (!nextPath) {
      return
    }

    trimOpenPath([])
    setActiveKeyboardPath(nextPath)
  }, [activePath, rootEnabledPaths, setActiveKeyboardPath, trimOpenPath])

  const moveRootFirst = useCallback(() => {
    const nextPath = rootEnabledPaths[0] ?? null
    if (!nextPath) {
      return
    }

    trimOpenPath([])
    setActiveKeyboardPath(nextPath)
  }, [rootEnabledPaths, setActiveKeyboardPath, trimOpenPath])

  const moveRootLast = useCallback(() => {
    const nextPath = rootEnabledPaths[rootEnabledPaths.length - 1] ?? null
    if (!nextPath) {
      return
    }

    trimOpenPath([])
    setActiveKeyboardPath(nextPath)
  }, [rootEnabledPaths, setActiveKeyboardPath, trimOpenPath])

  useImperativeHandle(ref, () => ({
    moveNext: () => {
      moveRootActive(1)
    },
    movePrev: () => {
      moveRootActive(-1)
    },
    moveFirst: moveRootFirst,
    moveLast: moveRootLast,
    clearActive: () => {
      clearActivePath()
    },
    getActiveKey: () => activePath.length === 1
      ? activePath[0] ?? null
      : null
  }), [activePath, clearActivePath, moveRootActive, moveRootFirst, moveRootLast])

  const markTriggerPress = useCallback((path: Path) => {
    pendingTriggerPressPathRef.current = serializePath(path)
  }, [])

  const consumeTriggerPress = useCallback((path: Path) => {
    const match = pendingTriggerPressPathRef.current === serializePath(path)
    pendingTriggerPressPathRef.current = null
    return match
  }, [])

  const closeSubmenuPath = useCallback((path: Path, reason: SubmenuCloseReason) => {
    pendingTriggerPressPathRef.current = null
    setOpenPath(parentPath(path))
    switch (reason) {
      case 'trigger':
        setActivePointerPath(path)
        return
      case 'keyboard':
        setActiveKeyboardPath(path)
        return
      case 'outside':
      default:
        clearActivePath()
    }
  }, [clearActivePath, setActiveKeyboardPath, setActivePointerPath, setOpenPath])

  const openSubmenuPath = useCallback((path: Path, item: SubmenuItem, source: 'pointer' | 'keyboard') => {
    pendingTriggerPressPathRef.current = null
    setOpenPath(path)

    if (source !== 'keyboard') {
      setActivePointerPath(path)
      return
    }

    const childPath = item.items?.length
      ? firstEnabledPath(item.items, path)
      : null
    if (childPath) {
      setActiveKeyboardPath(childPath)
      return
    }

    setActivePointerPath(path)
  }, [setActiveKeyboardPath, setActivePointerPath, setOpenPath])

  const controller = useMemo<Controller>(() => ({
    activePath,
    activeSource,
    openPath,
    registerItemRef,
    setActivePointerPath,
    setActiveKeyboardPath,
    clearActivePath,
    clearPointerActivePath,
    trimOpenPath,
    markTriggerPress,
    consumeTriggerPress,
    closeSubmenuPath,
    openSubmenuPath
  }), [
    activePath,
    activeSource,
    openPath,
    registerItemRef,
    setActivePointerPath,
    setActiveKeyboardPath,
    clearActivePath,
    clearPointerActivePath,
    trimOpenPath,
    markTriggerPress,
    consumeTriggerPress,
    closeSubmenuPath,
    openSubmenuPath
  ])

  return (
    <div className={cn('flex max-h-[72vh] flex-col', props.className)}>
      <Level
        items={props.items}
        parentPath={[]}
        open={open}
        selectedKeys={selectedKeys}
        selectionMode={selectionMode}
        selectionAppearance={selectionAppearance}
        onItemValueToggle={onItemValueToggle}
        onClose={props.onClose}
        autoFocus={props.autoFocus ?? true}
        submenuOpenPolicy={submenuOpenPolicy}
        controller={controller}
      />
    </div>
  )
})

Base.displayName = 'Menu'

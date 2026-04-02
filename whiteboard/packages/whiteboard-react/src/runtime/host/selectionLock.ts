export type DocumentSelectionLock = {
  lock: () => () => void
}

type SelectionStyleSnapshot = {
  rootUserSelect: string
  rootWebkitUserSelect: string
  bodyUserSelect: string
  bodyWebkitUserSelect: string
}

export const createDocumentSelectionLock = (): DocumentSelectionLock => {
  let activeCount = 0
  let snapshot: SelectionStyleSnapshot | null = null

  const preventDefault = (event: Event) => {
    event.preventDefault()
  }

  const apply = () => {
    if (typeof document === 'undefined') {
      return
    }

    const root = document.documentElement
    const body = document.body

    snapshot = {
      rootUserSelect: root.style.userSelect,
      rootWebkitUserSelect: root.style.webkitUserSelect,
      bodyUserSelect: body?.style.userSelect ?? '',
      bodyWebkitUserSelect: body?.style.webkitUserSelect ?? ''
    }

    root.style.userSelect = 'none'
    root.style.webkitUserSelect = 'none'

    if (body) {
      body.style.userSelect = 'none'
      body.style.webkitUserSelect = 'none'
    }

    document.addEventListener('selectstart', preventDefault, true)
    document.addEventListener('dragstart', preventDefault, true)
  }

  const restore = () => {
    if (typeof document === 'undefined' || !snapshot) {
      return
    }

    const root = document.documentElement
    const body = document.body

    document.removeEventListener('selectstart', preventDefault, true)
    document.removeEventListener('dragstart', preventDefault, true)

    root.style.userSelect = snapshot.rootUserSelect
    root.style.webkitUserSelect = snapshot.rootWebkitUserSelect

    if (body) {
      body.style.userSelect = snapshot.bodyUserSelect
      body.style.webkitUserSelect = snapshot.bodyWebkitUserSelect
    }

    snapshot = null
  }

  return {
    lock: () => {
      activeCount += 1
      if (activeCount === 1) {
        apply()
      }

      let released = false

      return () => {
        if (released) {
          return
        }
        released = true

        activeCount = Math.max(0, activeCount - 1)
        if (activeCount === 0) {
          restore()
        }
      }
    }
  }
}

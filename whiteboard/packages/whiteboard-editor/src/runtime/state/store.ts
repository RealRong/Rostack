import { createValueStore, type Equality, type ValueStore } from '@shared/core'

const sameValue = <T,>(
  left: T,
  right: T
) => Object.is(left, right)

export const createCommandState = <T,>({
  initial,
  isEqual = sameValue,
  normalize
}: {
  initial: T
  isEqual?: Equality<T>
  normalize?: (value: T) => T
}): {
  store: ValueStore<T>
  read: () => T
  set: (next: T) => void
  update: (recipe: (current: T) => T) => void
} => {
  const resolve = (value: T) => normalize ? normalize(value) : value
  const store = createValueStore(resolve(initial), {
    isEqual
  })
  const read = () => store.get()

  return {
    store,
    read,
    set: (next) => {
      const resolved = resolve(next)
      if (isEqual(read(), resolved)) {
        return
      }

      store.set(resolved)
    },
    update: (recipe) => {
      const current = read()
      const resolved = resolve(recipe(current))
      if (isEqual(current, resolved)) {
        return
      }

      store.set(resolved)
    }
  }
}

export interface OperationBuffer<TOp> {
  emit(op: TOp): void
  emitMany(ops: readonly TOp[]): void
  isEmpty(): boolean
  clear(): void
  finish(): readonly TOp[]
}

export interface InverseBuilder<TOp> {
  prepend(op: TOp): void
  prependMany(ops: readonly TOp[]): void
  append(op: TOp): void
  appendMany(ops: readonly TOp[]): void
  isEmpty(): boolean
  clear(): void
  finish(): readonly TOp[]
}

export const createOperationBuffer = <TOp,>(): OperationBuffer<TOp> => {
  const ops: TOp[] = []

  return {
    emit: (op) => {
      ops.push(op)
    },
    emitMany: (nextOps) => {
      ops.push(...nextOps)
    },
    isEmpty: () => ops.length === 0,
    clear: () => {
      ops.length = 0
    },
    finish: () => [...ops]
  }
}

export const createInverseBuilder = <TOp,>(): InverseBuilder<TOp> => {
  const prefix: TOp[] = []
  const suffix: TOp[] = []

  return {
    prepend: (op) => {
      prefix.push(op)
    },
    prependMany: (ops) => {
      for (let index = ops.length - 1; index >= 0; index -= 1) {
        prefix.push(ops[index]!)
      }
    },
    append: (op) => {
      suffix.push(op)
    },
    appendMany: (ops) => {
      suffix.push(...ops)
    },
    isEmpty: () => prefix.length === 0 && suffix.length === 0,
    clear: () => {
      prefix.length = 0
      suffix.length = 0
    },
    finish: () => [
      ...prefix.slice().reverse(),
      ...suffix
    ]
  }
}

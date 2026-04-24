export type MutationTxRuntime<TRuntime> = {
  _runtime: TRuntime
}

export const createMutationTx = <
  TRuntime,
  TTx extends MutationTxRuntime<TRuntime>
>(input: {
  runtime: TRuntime
  create(tx: TTx): Omit<TTx, '_runtime'>
}): TTx => {
  const tx = {
    _runtime: input.runtime
  } as TTx

  Object.assign(tx, input.create(tx))

  return tx
}

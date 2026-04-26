export type BoardConfig = {
  node: {
    groupPadding: number
    snapThresholdScreen: number
    snapMaxThresholdWorld: number
    snapGridCellSize: number
  }
  edge: {
    connectQueryRadius: number
    hitTestThresholdScreen: number
    activationPaddingScreen: number
    outlineSnapMin: number
    outlineSnapRatio: number
    handleSnapScreen: number
  }
}

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  node: {
    groupPadding: 24,
    snapThresholdScreen: 8,
    snapMaxThresholdWorld: 24,
    snapGridCellSize: 240
  },
  edge: {
    connectQueryRadius: 24,
    hitTestThresholdScreen: 10,
    activationPaddingScreen: 24,
    outlineSnapMin: 12,
    outlineSnapRatio: 0.18,
    handleSnapScreen: 14
  }
}

import type { VirtualBlock } from '@dataview/react/virtual/types'

export const findVirtualBlockStartIndex = (
  blocks: readonly VirtualBlock[],
  start: number
) => {
  let low = 0
  let high = blocks.length - 1
  let answer = blocks.length

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const block = blocks[middle]
    if (block && block.top + block.height >= start) {
      answer = middle
      high = middle - 1
    } else {
      low = middle + 1
    }
  }

  return answer
}

export const findVirtualBlockEndIndex = (
  blocks: readonly VirtualBlock[],
  end: number
) => {
  let low = 0
  let high = blocks.length - 1
  let answer = blocks.length

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const block = blocks[middle]
    if (block && block.top <= end) {
      low = middle + 1
      answer = low
    } else {
      high = middle - 1
    }
  }

  return answer
}

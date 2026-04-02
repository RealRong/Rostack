# PR-67 Read subscribe 分发表驱动化

## 背景

在 `createReadKernel` 中，`subscribe(keys)` 当前通过 `switch` 将 key 映射到 atom。虽然逻辑正确，但分支样板较长，扩展键时需要改动分支控制流。

## 目标

1. 把 key->atom 映射收敛为单一表结构。
2. `subscribe(keys)` 只保留一次 map + sub 调用，减少分支噪音。
3. 不改变任何对外行为和订阅语义。

## 方案

1. 在 `runtime/read/kernel.ts` 定义 `subscribableAtomMap`：
   - `interaction/tool/selection/viewport/mindmapLayout/snapshot` 全部显式映射。
2. `subscribe(keys, listener)` 直接读取 `subscribableAtomMap[key]` 并注册。
3. 删除 `getSubscribableAtom` 的 `switch`。

## 风险

1. 若映射表漏 key，会在编译期被 `Record<ReadSubscriptionKey, ...>` 捕获。
2. 无运行时行为风险（纯结构重排）。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`

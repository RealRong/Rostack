# PR-64 ReadContext 直通 getter 化（去 key 反查）

## 背景

当前 read 内部通过 `context.get(key)` 读取 state/snapshot，`kernel` 里维护 `keyAtomMap`。这层 key 反查对运行时没有新增价值，但增加链路噪音和跳转成本。

## 目标

1. 去掉 `context.get(key)` 与 `ReadKeyValueMap` 的间接层。
2. 改为显式 getter：`context.state.xxx()` 与 `context.snapshot()`。
3. 保持 public `read.subscribe(keys, listener)` 接口不变。

## 方案

1. 重写 `ReadRuntimeContext`：
   - `state.interaction/tool/selection/viewport/mindmapLayout`
   - `snapshot()`
   - `subscribe(keys, listener)`（保留）

2. `createReadKernel` 收敛：
   - 删除 `keyAtomMap + get(key)`。
   - 直接通过闭包 getter 读取 atom。
   - `subscribe` 使用 key->atom 的显式分支函数。

3. 全量改造 read stage 调用点：
   - `context.get(READ_SUBSCRIPTION_KEYS.snapshot)` -> `context.snapshot()`
   - `context.get(READ_STATE_KEYS.viewport)` -> `context.state.viewport()`
   - `context.get(READ_STATE_KEYS.mindmapLayout)` -> `context.state.mindmapLayout()`

4. `readApi` 同步改为使用显式 getter。

## 风险

1. read stage 调用点较多，若漏改会有编译错误。
2. 需确保 snapshot/state 读取时序与现状一致。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 回归读取链路：节点/边/mindmap projection 正常刷新。

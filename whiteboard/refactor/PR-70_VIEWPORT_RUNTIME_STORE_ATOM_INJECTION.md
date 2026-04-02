# PR-70 ViewportRuntime 改为 store + viewportAtom 注入

## 背景

当前 `ViewportRuntime` 通过 `readViewport/writeViewport` 闭包注入状态访问能力。

该方案可用，但在当前 engine 内部已经统一使用 Jotai store + atoms，闭包层只承担薄转发，增加了一层装配样板。

## 目标

1. 将 `ViewportRuntime` 构造注入改为：`store + atom`。
2. 移除 `readViewport/writeViewport` 闭包装配。
3. 保持 runtime 行为与 API 不变（坐标转换、容器派生状态、setViewport 去重语义）。

## 方案

1. `runtime/Viewport.ts`：
   - 构造参数改为 `{ store, atom }`。
   - 内部通过 `store.get(atom)` / `store.set(atom, next)` 读写。

2. `instance/engine.ts`：
   - `new ViewportRuntime` 传入 `runtimeStore` 和 `atom: stateAtoms.viewport`。

3. 文档同步（可选最小）：
   - `ENGINE_CURRENT_CHAIN_FLOW.md` 增补 viewport 状态注入语义。

## 风险

1. `ViewportRuntime` 对 Jotai 类型耦合提升（内部实现层可接受）。
2. 若漏改构造调用点会编译失败。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 回归：`clientToWorld/screenToWorld/getZoom/setViewport` 行为一致。

# PR-54 Node/Edge 同构逻辑收敛

## 背景

`node` 与 `edge` 在 write API 层和 planner 层存在多处同构实现：

1. planner：`updateMany` 的 patch 合并逻辑重复。
2. API：order 家族（set / bringToFront / sendToBack / bringForward / sendBackward）重复。

## 目标

1. 抽取稳定 helper，减少重复与漏改风险。
2. 保持对外行为完全一致。

## 方案

### 1) planner shared helper

新增 `stages/plan/shared/update.ts`：

1. `hasPatch(patch)`：过滤空 patch。
2. `mergeUpdatesById(updates)`：同 id patch 合并。
3. `toUpdateOperations(operationType, updates)`：产出 update operations。

node / edge planner 分别调用：

- `toUpdateOperations('node.update', command.updates)`
- `toUpdateOperations('edge.update', command.updates)`

### 2) API shared order helper

新增 `api/shared/order.ts`：

1. 输入：
   - `set(ids)`
   - `readCurrent()`
2. 输出：
   - `set`
   - `bringToFront`
   - `sendToBack`
   - `bringForward`
   - `sendBackward`

node / edge API 改为复用该 helper。

## 影响范围

- `runtime/write/stages/plan/domains/node.ts`
- `runtime/write/stages/plan/domains/edge.ts`
- `runtime/write/stages/plan/shared/update.ts`（新增）
- `runtime/write/api/node.ts`
- `runtime/write/api/edge.ts`
- `runtime/write/api/shared/order.ts`（新增）

## 风险

低风险（抽取复用）。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 回归：node/edge updateMany 与 order 行为一致。

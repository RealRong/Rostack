# PR-73 Edge Endpoints Query 归入 Read Stage + 去 query 反向依赖

## 背景

`query.edgeEndpointsById` 目前在 `query.ts` 内部用 `doc` 引用缓存构建 `edgeMap`：

- 依赖 `Document` 引用变化来失效。
- 缓存逻辑分散在 query 层，与 read stage 的缓存体系脱节。
- read stage 反过来依赖 `context.query`，出现层级倒置风险。

## 目标

1. 将 edge endpoints 的计算与缓存收敛到 edge read stage。
2. query 只转发 read stage 结果，不再做 doc‑ref 缓存。
3. read stage 不再依赖 query，保持依赖方向单向：`indexes -> stage -> query`。

## 方案

1. `ReadRuntimeContext` 增加 `indexes`（`Indexer['query']`），移除 `query`。
2. `node` / `edge` read stage 使用 `context.indexes.canvas.nodeRect`。
3. `EdgeReadRuntime.get` 增加 `edgeEndpointsById`：
   - 调用 `edge cache snapshot.getEndpoints`。
4. `query.edgeEndpointsById` 直接转发 `edgeStage.get.edgeEndpointsById`。
5. `createReadKernel` 先创建 `edgeStage`，再创建 `query`。

## 风险

1. `edgeEndpointsById` 变为依赖 edge stage 可见边缓存（当前可见边即常用边，影响可控）。
2. 改动 read context 类型，影响 read stage 的依赖签名，需要全量替换。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工：选中边时端点手柄仍正常渲染。

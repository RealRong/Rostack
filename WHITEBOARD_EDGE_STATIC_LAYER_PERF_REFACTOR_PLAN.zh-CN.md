# Whiteboard Edge Static Layer 拖拽性能彻底改造清单

## 背景

当前 `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeStaticLayer.tsx` 在拖拽 `node` 时出现明显的 rerender 耗时。问题不是单点失误，而是数据投影层、store 同步层、React 订阅层三者叠加导致：

1. scene projection 每次 update 后都会全量 `surface.sync()`。
2. family surface 的 `ids` 通过 `[...map.keys()]` 每次构造新数组，导致 `ids` store 引用持续变化。
3. `EdgeStaticLayer` 订阅 `statics.ids` 和 `masks.ids`，父层被高频唤醒。
4. 父层每次重新构造 `maskedEdgeIds: Set`，把所有 `EdgeStaticItem` 的 `memo` 一起打穿。
5. `patchStatics`、`patchLabelsAndMasks` 仍是“有 touched edge 就全量 rebuild 所有 edge render state”的策略。

这个文档给的是彻底方案，不追求最小改动，而是把“拖拽时边渲染路径”的数据流做成真正增量、稳定、可扩展的结构。

## 目标

### 用户侧目标

1. 拖拽未连接 `edge` 的 `node` 时，`EdgeStaticLayer` 不应 rerender。
2. 拖拽连接了少量 `edge` 的 `node` 时，只更新受影响的 edge bucket，不触发整层静态边重绘。
3. 大图场景下，拖拽耗时应随“受影响 edge 数量”增长，而不是随“总 edge 数量”增长。

### 工程侧目标

1. surface 层提供稳定 identity，避免无意义通知。
2. render state patch 改成真正的增量 patch，而不是每次全量扫描 `working.items`。
3. React 组件订阅粒度与数据变化粒度一致。
4. 静态边、活跃边、label mask 三条渲染链路彼此解耦。

## 总体改造方向

彻底方案分成四条主线并行收敛：

1. 稳定 projection surface family `ids` 的 identity 与同步策略。
2. 重写 edge render state patch，使 `statics` / `masks` / `labels` 支持增量更新。
3. 调整 React 组件订阅结构，移除会放大重渲染范围的全局 prop。
4. 建立 profile 与回归基线，防止后续重构把收益吃掉。

## 改造清单

## 一、Projection / Store 层稳定化

### 1. family `ids` 不再每次生成新数组

涉及位置：

- `whiteboard/packages/whiteboard-editor-scene/src/runtime/model.ts`
- `shared/projection/src/runtime.ts`
- `shared/core/src/store/familyStore.ts`

改造项：

1. 为 projection family field 增加 `idsEqual` 能力，允许 `ids` 使用内容比较而非 `Object.is`。
2. 将 `render.edge.statics.ids`、`render.edge.masks.ids`、`render.edge.labels.ids`、`render.edge.active.ids` 的 equality 明确定义为“顺序一致即复用”。
3. 在 `surface.sync()` 时，family field 不应无脑 `replace`；需要先判断 `ids` 与 `byId` 是否真的变化，再决定是否写入。
4. 明确区分“成员变化”和“成员值变化”：
   - `ids` 只反映 family 成员集合和顺序。
   - `byId` 只反映具体实体内容变化。

验收标准：

1. node-only 拖拽时，若 edge family 成员不变，`statics.ids` / `masks.ids` store 不发布变更。
2. React profiler 中 `EdgeStaticLayer` 不再因为 `ids` 引用变化被空转唤醒。

### 2. surface sync 从“全量推送”升级为“按字段跳过”

改造项：

1. 审视 `shared/projection/src/runtime.ts` 的 `surface.sync()`，避免每个 family/value field 每次都执行写入。
2. 为 surface field 缓存上一次 snapshot，支持 field-level short circuit。
3. 对于 family field，优先保留上一次稳定 `ids` 引用。

验收标准：

1. projection update 仍可保持语义正确。
2. 大量无关 field 变化时，不再导致 edge family surface 连带通知。

## 二、Render State 增量化

### 3. `patchStatics` 从全量 rebuild 改为按 touched edge 增量 patch

涉及位置：

- `whiteboard/packages/whiteboard-editor-scene/src/model/view/render.ts`

现状问题：

1. 只要 `scope.statics.size > 0`，就 `buildStaticState(input.working)` 全量扫描所有 edge。
2. 即使只拖动一条关联边，也会重建所有 style bucket、所有 chunk、所有索引。

改造项：

1. 保留并扩展已有索引：
   - `styleKeyByEdge`
   - `edgeIdsByStyleKey`
   - `staticIdByEdge`
   - `staticIdsByStyleKey`
2. 设计一个增量 patch 流程：
   - 先找出 touched edge 的旧 styleKey / 新 styleKey。
   - 收集受影响的 style bucket。
   - 只重建这些 bucket 的 edge 列表与 chunk。
   - 仅更新这些 bucket 对应的 `staticId -> view`。
3. 明确 edge 变化分类：
   - path 变化但 style 不变
   - style 变化导致 bucket 迁移
   - edge 新增 / 删除
   - 顺序变化
4. 把“全量 rebuild”保留为 reset 路径，普通 patch 不再走全量逻辑。

验收标准：

1. 拖拽单节点时，`patchStatics` 的复杂度接近 `O(受影响 edge + 受影响 bucket)`。
2. 总 edge 数量增加时，单节点拖拽耗时不再线性上涨。

### 4. `patchLabelsAndMasks` 改为按 touched edge 增量 patch

现状问题：

1. 当前实现直接重新 `buildLabelsAndMasks(input.working)`，全量扫描所有 edge。
2. mask 更新会带动 `masks.ids`、相关 layer 和静态边 mask 判断一并抖动。

改造项：

1. labels 和 masks 只对 touched edge 执行重算。
2. 仅在 edge 的 label 集合发生增删时更新 `labels.ids` / `masks.ids`。
3. 若只是 label 的几何位置变化，不应让无关 edge mask 订阅失效。
4. 建立 per-edge label/mask patch helper，避免把所有逻辑塞在一个大函数里。

验收标准：

1. 单条 edge 的 label 位置变化时，仅该 edge 的 mask / label 更新。
2. 未受影响 edge 的 mask store 订阅不触发。

### 5. 明确 active / static / labels 三种 edge render 数据边界

改造项：

1. 约束 `static` 只承载长期稳定的 path 批量渲染数据。
2. 约束 `active` 只承载 hover / selected / editing 等少量高频状态。
3. 约束 `labels` / `masks` 只关注 label 几何与编辑态，不回流污染 static 层。
4. 如有必要，为拖拽态引入单独的 transient edge render 通道，避免修改 static bucket。

验收标准：

1. 高频交互主要命中 `active` / transient 层。
2. `static` 层只在路径或样式真的变化时更新。

## 三、React 层订阅拆分

### 6. `EdgeStaticLayer` 不再依赖全局 `maskedEdgeIds` prop

涉及位置：

- `whiteboard/packages/whiteboard-react/src/features/edge/components/EdgeStaticLayer.tsx`

现状问题：

1. 父层订阅 `masks.ids`。
2. 每次 render 创建新 `Set`。
3. 所有 `EdgeStaticItem` 收到新 prop，`memo` 失效。

改造项：

1. 去掉“父层算全集，子层按 `Set.has` 判断”的模式。
2. 改成以 `staticId` 为单位订阅本 bucket 需要的 mask 信息，或在 scene 层提前提供稳定、可局部订阅的数据结构。
3. 让 `EdgeStaticItem` 的 props 尽可能只包含稳定标识符，例如 `staticId`。
4. 如确实需要 mask membership，membership 必须按 bucket 局部稳定，而不是全局 `Set` 每次新建。

验收标准：

1. 无关 mask 变化不会导致所有 `EdgeStaticItem` rerender。
2. `EdgeStaticItem` 的 rerender 数与受影响 bucket 数近似一致。

### 7. 分离“列表订阅”和“实体订阅”

改造项：

1. 父层只订阅稳定的 `staticIds` 列表。
2. 子层只订阅各自 `byId(staticId)`。
3. 任何会引起大面积 props 变化的衍生对象都不要在父层临时生成后向下透传。

验收标准：

1. `staticIds` 不变时，父层不 rerender。
2. 某个 `staticId` 内容变化时，只影响对应 item。

### 8. 重新评估 SVG 结构是否需要更细粒度拆分

改造项：

1. 评估 `<g data-static={staticId}>` 这一层是否足够稳定。
2. 若单个 bucket 仍然过大，考虑进一步细分 chunk 尺寸或 path 分片策略。
3. chunk 设计目标是平衡 DOM 数量与单次 rerender 成本，不追求极端大 bucket。

验收标准：

1. 大 bucket 更新不会产生明显单帧卡顿。
2. DOM 数量增长仍在可接受范围。

## 四、数据模型补强

### 9. 为 edge render patch 引入明确的影响域分析

改造项：

1. 定义 edge render 影响域：
   - 哪些 node 变化会影响哪些 edge
   - 哪些 edge 几何变化会影响哪些 label
   - 哪些 label 变化会影响哪些 mask
2. 把当前“scope 有 touched edge 就全量 rebuild”升级为“按影响域精确 patch”。
3. 让 `readViewPatchScope` 输出更细的 patch 信息，而不只是 `Set<EdgeId>`。

建议输出的 patch 语义可包含：

1. `routeChangedEdgeIds`
2. `styleChangedEdgeIds`
3. `labelGeometryChangedEdgeIds`
4. `labelMembershipChangedEdgeIds`
5. `orderChanged`

验收标准：

1. render patch 不再依赖大而泛的 touched 集合。
2. 各 patch 函数能根据变化类型走不同分支。

### 10. 保证 order 变化只影响必要层

改造项：

1. 明确 edge 顺序变化是否真的需要重建全部 static bucket。
2. 如果 order 只影响视觉 stacking，则只在相关 layer 更新排序。
3. 如果 order 必须影响 bucket 内路径顺序，则只重建受影响 bucket，而不是全部。

验收标准：

1. 非 order 变化不会走 order 路径。
2. order 变化的影响范围可解释、可预测。

## 五、性能验证与回归防护

### 11. 建立 profile 基线

改造项：

1. 固定几个 benchmark 场景：
   - 100 edge / 500 edge / 2000 edge
   - 拖拽未连接 edge 的 node
   - 拖拽连接 2 条 edge 的 node
   - 拖拽连接 20 条 edge 的 node
2. 记录：
   - React render 次数
   - `EdgeStaticLayer` render 次数
   - `EdgeStaticItem` render 次数
   - projection update 总耗时
   - `patchStatics` / `patchLabelsAndMasks` 单次耗时

验收标准：

1. 改造前后能定量比较。
2. 不依赖“主观感觉变快了”来判断收益。

### 12. 补测试覆盖关键不变量

改造项：

1. 单元测试覆盖：
   - `ids` 内容不变时引用复用
   - 增量 patch 仅更新受影响 bucket
   - 非受影响 masks / labels 保持引用稳定
2. runtime 测试覆盖：
   - node 拖拽不影响无关 static edge store
   - active edge 更新不污染 static layer
3. 如条件允许，补轻量性能回归测试或 trace 断言。

验收标准：

1. 关键 identity 语义有自动化保护。
2. 后续重构不容易把增量 patch 退化回全量 patch。

## 推荐实施顺序

### Phase 1: 先止住无意义 rerender

1. 稳定 family `ids` equality / 引用。
2. 让 `surface.sync()` 支持 field-level short circuit。
3. 去掉 `EdgeStaticLayer` 对全局 `maskedEdgeIds` 的依赖。

目标：

1. 快速把 React 空转渲染压下去。
2. 先让 profiler 结果变得可读，否则后续数据层收益会被 UI 层噪音掩盖。

### Phase 2: 重构 render patch 为增量模型

1. 改造 `patchStatics`。
2. 改造 `patchLabelsAndMasks`。
3. 引入更精确的 edge render scope 语义。

目标：

1. 把 CPU 主要消耗从“全量扫描所有 edge”切到“只处理受影响 edge”。

### Phase 3: 做结构性收尾

1. 校正 active/static/labels 边界。
2. 评估 chunk 粒度与 SVG 结构。
3. 建 profile 基线与测试防护。

目标：

1. 确保方案可维护，而不是一次性的性能特化 patch。

## 风险点

1. `ids` identity 稳定化会改变一部分现有订阅时序，必须验证没有依赖“每次都通知”的隐式逻辑。
2. `patchStatics` 增量化后，bucket 索引一致性会变复杂，删除 / 迁移 / 排序三类操作需要重点校验。
3. 如果 label mask 逻辑和 static path 渲染强耦合，拆分订阅时可能需要小范围调整 scene layer 组织方式。
4. 若当前 profiler 中还有浏览器 SVG paint/layout 成本，React render 优化后可能会暴露第二层瓶颈，需要单独复查。

## 完成判定

满足以下条件才算完成彻底方案：

1. 拖拽普通 node 时，`EdgeStaticLayer` 不因无关更新 rerender。
2. 拖拽关联少量 edge 的 node 时，静态边更新范围只覆盖受影响 bucket。
3. `patchStatics` 和 `patchLabelsAndMasks` 不再全量扫描所有 edge。
4. family `ids` / render view 的 identity 规则有测试覆盖。
5. benchmark 结果证明拖拽耗时主要随受影响 edge 数增长，而非总 edge 数增长。

## 不建议的伪优化

以下做法不应视为彻底方案：

1. 只在 `EdgeStaticLayer` 外面额外包一层 `memo`。
2. 只给 `maskedEdgeIds` 再套一层 `useMemo`，但不解决 `maskIds` 引用抖动。
3. 继续保留全量 `buildStaticState`，只是在 React 层做更多缓存。
4. 单纯缩小 `STATIC_CHUNK_SIZE` 试图掩盖全量 patch 成本。

这些做法可能缓解局部症状，但不会解决拖拽时的核心复杂度问题。

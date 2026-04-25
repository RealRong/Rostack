# Whiteboard Editor Graph Domain / Phase / Projector 收敛方案

## 1. 目标与原则

本方案面向 `whiteboard/packages/whiteboard-editor-graph` 当前的 `domain / phases / projector` 结构，目标不是继续叠加抽象，而是把实现直接收敛到长期最优形态。

原则如下：

1. 不做兼容层，不保留双轨，不引入“先过渡以后再清理”的中间方案。
2. 重构过程中允许阶段性跑不通，判断标准只看最终结构是否更简单、更清晰、更稳。
3. 优先高内聚低耦合，同一实体的 build / diff / patch 尽量放在一起。
4. `shared` 只承载真正通用的基础设施，不承载 Whiteboard 领域语义。
5. `whiteboard-core` 只承载几何、结构、通用 node/edge/mindmap 算法，不承载 editor runtime 语义。
6. 少量大模块优于大量薄文件。小函数只有在明显降低复杂度时才拆出去。

---

## 2. 结论

这件事能做，而且值得做。

当前 `whiteboard-editor-graph` 的复杂度，主要不是 projector phase 本身太复杂，而是以下几个结构性问题叠加：

1. 同一实体的逻辑被按“操作类型”横切到了多个文件。
2. 同一份语义在 `build / equal / geometryChanged / patch` 之间重复实现。
3. `indexes` 同时承担索引维护、领域读取、查询辅助，边界过宽。
4. `planner / uiScope / ui phase` 都在做一部分 impact derivation，职责重叠。
5. `projector` 层文件数量偏多，但很多文件只是状态搬运或薄包装。
6. 一些基础 equal / geometry / frame query 已经在 `shared/core` 或 `whiteboard-core` 存在，却在本包内重复实现。

长期最优方向不是继续往 `shared/projector` 抽更多泛型，而是：

1. 先按实体收拢 `domain`。
2. 再把 `projector` 收敛成薄的 orchestration 层。
3. 最后把真正通用的基础能力下沉到 `shared/core` 或 `whiteboard-core`。

---

## 3. 当前主要问题

### 3.1 实体逻辑横切过度

现在 node / edge / mindmap / group 的逻辑都被拆散了。

以 node 为例，相关逻辑分布在：

- `src/domain/projection.ts`
- `src/domain/views.ts`
- `src/domain/equality.ts`
- `src/domain/graphPatch/node.ts`

edge 分布在：

- `src/domain/projection.ts`
- `src/domain/views.ts`
- `src/domain/equality.ts`
- `src/domain/graphPatch/edge.ts`

mindmap 分布在：

- `src/domain/indexes.ts`
- `src/domain/projection.ts`
- `src/domain/views.ts`
- `src/domain/equality.ts`
- `src/domain/graphPatch/mindmap.ts`

group 分布在：

- `src/domain/indexes.ts`
- `src/domain/views.ts`
- `src/domain/equality.ts`
- `src/domain/graphPatch/group.ts`

这种按“投影 / 视图 / 相等 / patch”切文件的方式，不利于维护。阅读一个实体的完整行为需要在多个文件间跳转，而且一旦实体结构变化，通常要改 3 到 5 个文件。

正确的收敛方向应当是按实体切：

- `domain/node.ts`
- `domain/edge.ts`
- `domain/mindmap.ts`
- `domain/group.ts`

每个实体模块内部直接拥有自己的：

- `readEntry`
- `buildView`
- `diffView`
- `patch`

---

### 3.2 comparator 与 diff 逻辑重复

当前重复最明显的是 edge 和 mindmap。

`EdgeView` 的 route / ends / handles / labels 比较同时存在于：

- `src/domain/equality.ts`
- `src/domain/graphPatch/edge.ts`

`MindmapView` 的 layout / connectors / geometry touched 规则同时存在于：

- `src/domain/equality.ts`
- `src/domain/graphPatch/mindmap.ts`

node 和 group 也存在相同模式：

- 一处写 `isNodeViewEqual / isGroupViewEqual`
- 另一处再单独写 `isNodeGeometryChanged / isGroupGeometryChanged`

长期最优形态不应该是：

- 一套 full equal
- 一套 geometry equal
- 一套 patch 里的 changed 判断

而应该是每个实体只保留一个统一 diff 入口，例如：

```ts
interface EntityDiffResult {
  changed: boolean
  geometryChanged: boolean
  structureChanged: boolean
}
```

然后：

- `patchNode` 只调用 `diffNodeView`
- `patchEdge` 只调用 `diffEdgeView`
- `patchMindmap` 只调用 `diffMindmapView`
- `patchGroup` 只调用 `diffGroupView`

这样可以把比较规则集中到实体模块内部，避免重复和漂移。

---

### 3.3 `indexes.ts` 过宽

当前 `src/domain/indexes.ts` 同时承载了：

- owner / edge adjacency 维护
- mindmap tree 维护
- group signature 维护
- 全量 rebuild
- 增量 patch
- runtime query 辅助读取

这会导致两个问题：

1. 索引维护逻辑和查询语义耦合在一起。
2. group / mindmap 的领域逻辑被“挂”在一个泛化的 indexes 文件里，语义不清楚。

长期最优应拆成两层：

```txt
src/domain/index/update.ts
src/domain/index/read.ts
```

约束如下：

- `update.ts` 只负责 `clear / rebuild / patch`。
- `read.ts` 只负责 `readRelatedEdgeIds / readMindmapStructure / readTreeDescendants` 这类读取。
- group signature 相关逻辑回到 `domain/group.ts`。
- owner / adjacency / mindmap membership 的基础读取可以留在 `index/read.ts`。

---

### 3.4 impact derivation 重复

当前 impact derivation 至少分散在三处：

- `src/projector/planner.ts`
- `src/projector/scopes/uiScope.ts`
- `src/phases/ui.ts`

问题不只是代码分散，而是规则本身重复：

- graph delta touched ids
- draft / preview / edit touched ids
- selection / hover / marquee / guides / draw / edit 影响范围
- mindmap preview / tick 影响范围

尤其 `uiScope.ts` 还额外重建了一份 mindmap node index，而 working state 已经维护了 `mindmapNodes`。

长期最优形态应该把 impact derivation 收敛成一个单独的局部层，例如：

```txt
src/projector/impact.ts
```

职责固定为：

1. planner 调用它来生成 graph scope 或 ui scope。
2. graph phase 调用它基于 graph delta 生成 `emit.ui`。
3. ui phase 只消费 scope，不再自己推导 touched ids。

也就是说：

- `planner` 负责决定“要不要跑 phase”
- `impact` 负责决定“哪些实体受影响”
- `phase` 负责执行 patch

不要再让 `planner` 和 `uiScope` 各自维护一套半重叠规则。

---

### 3.5 projector 层薄文件偏多

当前 `projector` 下有不少很薄的文件：

- `spec.ts`
- `context.ts`
- `phaseNames.ts`
- `publisher.ts`
- `publish/items.ts`
- `createWorking.ts`
- `createEmptySnapshot.ts`

其中有些文件本身没有错，但和整个包的复杂度叠加后，会显著增加导航成本。

长期最优应该是：

- 把纯类型别名和超薄包装并回去。
- 保留真正有运行时职责的文件。

建议收敛为：

```txt
src/projector/spec.ts
src/projector/impact.ts
src/projector/publish.ts
```

其中：

- `spec.ts` 包含 projector spec、phase names、phase context 类型。
- `impact.ts` 包含 graph/ui/spatial scope 构造。
- `publish.ts` 包含 graph/ui/items 的 publish。

如果 `createWorking.ts` 和 `createEmptySnapshot.ts` 仍然足够稳定，也可以保留；但 `phaseNames.ts`、`context.ts`、`publish/items.ts` 这类极薄文件没有必要独立存在。

---

### 3.6 runtime query 重复了 core 的 frame 逻辑

当前 `src/runtime/query.ts` 中的 frame query 自己做了：

- `pick`
- `parent`
- rect / point 过滤

但 `whiteboard-core/src/node/frame.ts` 已经提供了：

- `frameAt`
- `frameParent`
- `frameChildren`
- `frameDescendants`

两边的差异主要只是 candidate 来源不同：

- core 版本基于 `nodes`
- editor-graph 版本基于 `spatial` 先筛候选

这类差异适合下沉成 core 的候选版 frame query，而不应在 editor-graph 再写一份类似逻辑。

---

### 3.7 `domain/geometry.ts` 里存在基础设施重复

当前本包内自己维护了：

- `isPointEqual`
- `isSizeEqual`
- `isRectEqual`
- `collectRects`
- `isCanvasItemRefEqual`

其中前四项已经明显属于基础设施，应该优先复用：

- `shared/core/src/equality.ts`
- `whiteboard-core/src/geometry/index.ts`

长期最优边界：

- 基础 tuple/list equal 用 `shared/core/equality`
- 几何 tuple equal 与 bounding rect 用 `whiteboard-core/geometry`
- editor 专属 view equal 保留在 `editor-graph`

另外，`domain` 层不应该继续依赖 `@shared/projector/publish/isListEqual`。  
那是 publish 层工具，不是领域层基础 equal。领域层应改用 `shared/core/equality.sameOrder`。

---

## 4. 最终边界

### 4.1 `shared/core`

适合承载：

- `sameOrder`
- `sameOptionalOrder`
- `samePoint`
- `sameRect`
- `sameMap`

不适合承载：

- `NodeView / EdgeView / MindmapView / GroupView` 的领域 diff
- group signature
- editor runtime touched scope

### 4.2 `shared/projector`

适合承载：

- projector orchestration
- `createPlan`
- `keySet`
- `publishEntityFamily`
- 通用 spec / phase define helper

不适合承载：

- whiteboard graph patch queue
- node / edge / mindmap / group patch 规则
- UI impact 语义

### 4.3 `whiteboard-core`

适合承载：

- geometry equal / boundingRect
- frame query 通用算法
- node/edge/mindmap 的通用 projection / geometry / tree / render 算法

可以新增但只限于通用能力：

- 基于候选列表的 frame query helper
- 少量通用 edge/node comparator primitive

不适合承载：

- session draft / preview / edit
- selection / hover / draw / marquee UI view
- group signature / editor runtime index

### 4.4 `whiteboard-editor-graph`

最终只保留 Whiteboard 编辑器专属能力：

- graph 投影与 graph delta
- spatial index 和 query
- ui view 构造与 ui delta
- editor runtime query adapter
- group / mindmap / draft / preview / selection / hover 的 editor 语义

---

## 5. 最终目录结构

建议收敛到以下结构：

```txt
src/
  domain/
    node.ts
    edge.ts
    mindmap.ts
    group.ts
    ui.ts
    items.ts
    index/
      update.ts
      read.ts
    spatial/
      contracts.ts
      query.ts
      records.ts
      state.ts
      types.ts
      update.ts
  phases/
    graph.ts
    spatial.ts
    ui.ts
  projector/
    spec.ts
    impact.ts
    publish.ts
  runtime/
    createEditorGraphRuntime.ts
    query.ts
```

说明如下：

- `domain` 只按实体和明确子域拆分，不再保留 `projection.ts / views.ts / equality.ts / graphPatch/*` 这种横切结构。
- `phases` 只保留真正运行 phase 的文件。
- `items` 从独立 phase 中退出，变成 graph/publish 的直接派生。
- `projector` 只保留 spec、impact、publish 三块。

---

## 6. 各模块职责

### 6.1 `domain/node.ts`

负责：

- 读取 node entry
- 投影 geometry
- 构造 `NodeView`
- 比较 `NodeView`
- 计算 `geometryChanged`
- patch graph node

对外最多导出：

- `patchNode`
- `buildNodeView`，仅当 edge / group 需要读取时导出

其余 helper 保持文件私有。

### 6.2 `domain/edge.ts`

负责：

- 读取 edge entry
- 基于 node snapshot 解析 edge route
- 构造 `EdgeView`
- 比较 `EdgeView`
- 计算 `geometryChanged`
- patch graph edge

edge route / labels / handles 的比较只在这里定义一次。

### 6.3 `domain/mindmap.ts`

负责：

- 读取 mindmap record 与 tree
- 计算 layout
- 应用 rootMove / subtreeMove / enter preview
- 构造 `MindmapView`
- 比较 `MindmapView`
- diff member nodes
- patch graph mindmap

mindmap layout 与 connectors 的比较只在这里定义一次。

### 6.4 `domain/group.ts`

负责：

- group signature
- group target
- 构造 `GroupView`
- 比较 `GroupView`
- patch graph group

group 相关领域逻辑不再挂在 `indexes` 下。

### 6.5 `domain/ui.ts`

负责：

- `NodeUiView`
- `EdgeUiView`
- `ChromeView`
- 对应的 equal

要求：

- UI builder 和 UI equal 放在一起
- `ui phase` 不再重复定义第二套 UI patch 判断

### 6.6 `domain/index/update.ts`

负责：

- `clearIndexState`
- `rebuildIndexState`
- `patchIndexState`

只维护索引，不暴露 runtime query 语义。

### 6.7 `domain/index/read.ts`

负责：

- `readRelatedEdgeIds`
- `readMindmapId`
- `readMindmapStructure`
- `readTreeDescendants`

只读，不改状态。

---

## 7. Phase 与 Projector 的最终形态

### 7.1 graph phase

职责：

1. 先 patch index state。
2. 再 patch graph entities。
3. 产出 graph delta。
4. 基于 graph delta 生成 `emit.spatial` 与 `emit.ui`。

graph phase 不再自己持有一堆分散的小 helper 文件；node / edge / mindmap / group patch 直接来自各实体模块。

### 7.2 spatial phase

继续独立保留。  
原因是 spatial 仍然是 graph 的下游派生，而且有独立 state 与 query 价值。

### 7.3 ui phase

职责固定为：

- `reset` 时全量 rebuild UI
- 否则只 patch touched node / edge / chrome

禁止再做以下事情：

- 从 `input` 重新全量推导 touched ids
- 重建第二套 mindmap node index
- 与 planner/impact 重复维护 UI dirty 规则

### 7.4 items

`items` 不值得保留单独 phase。

原因：

- 它本质只是 `canvas.order -> { kind, id }[]`
- 不依赖 graph view 计算
- 当前 phase 与 publish 都很薄

长期最优做法：

- `items` 直接在 publish 时由 document snapshot 派生
- 或直接在 graph phase 检测 order 变化后更新 working.items

但不再保留独立的 `items phase + publish/items.ts` 组合。

### 7.5 projector

projector 最终只保留三块职责：

1. `spec`
2. `impact`
3. `publish`

不再保留大量薄包装文件。

---

## 8. 具体收敛规则

### 8.1 按实体收拢，不按操作收拢

应该合并：

- `projection.ts + views.ts + equality.ts + graphPatch/node.ts` -> `node.ts`
- `projection.ts + views.ts + equality.ts + graphPatch/edge.ts` -> `edge.ts`
- `indexes.ts + views.ts + equality.ts + graphPatch/mindmap.ts` -> `mindmap.ts`
- `indexes.ts + views.ts + equality.ts + graphPatch/group.ts` -> `group.ts`

### 8.2 降低导出面

目标是：

- 包对外仍只暴露 runtime 和 contracts type
- 包内跨文件导出只保留 phase/runtime 需要的少数入口
- 绝大多数 helper 变为文件私有

### 8.3 基础 equal 统一复用

统一规则：

- list equal 用 `shared/core/equality.sameOrder`
- point/rect/size equal 用 `whiteboard-core/geometry` 或 `shared/core/equality`
- 只在 entity/ui 模块里保留领域比较

不再允许：

- 在 domain 层继续依赖 `@shared/projector/publish/isListEqual`
- 同一实体维护多套近似 comparator

### 8.4 index 与 query 分离

统一规则：

- update 与 read 拆开
- runtime query 通过 read 层和 spatial 层组合，不反向侵入 index patch 逻辑

### 8.5 impact 规则单点化

统一规则：

- touched scope 只在 `projector/impact.ts` 定义
- `planner` 和 `graph phase` 都复用这套规则
- `ui phase` 不再自己推导

### 8.6 能下沉到 core 的就下沉，但只下沉通用能力

优先级最高的候选：

- frame query 的 candidate 版本
- geometry equal / bounding rect 复用
- 少量通用 edge/node comparator primitive

不应下沉：

- UI view
- graph patch queue
- group signature
- selection / hover / draft / preview / draw 影响范围

---

## 9. 删除与合并清单

最终应删除或并入的旧结构包括：

- `src/domain/projection.ts`
- `src/domain/views.ts`
- `src/domain/equality.ts`
- `src/domain/geometry.ts`
- `src/domain/graphPatch/*`
- `src/projector/phaseNames.ts`
- `src/projector/context.ts`
- `src/projector/publish/items.ts`
- `src/phases/items.ts`

`src/domain/indexes.ts` 不保留原状，必须拆解。

---

## 10. 实施顺序

建议按以下顺序落地：

1. 先合并 `domain`，按实体收拢 build / diff / patch。
2. 再拆 `indexes.ts` 为 `index/update.ts` 与 `index/read.ts`。
3. 用 `shared/core` 与 `whiteboard-core` 替换基础 equal / geometry 重复实现。
4. 收敛 `planner / uiScope / ui phase` 为统一 impact 入口。
5. 删除 `items phase`，把 items 变成 graph/publish 直接派生。
6. 最后合并 projector 薄文件，清理旧导出与死代码。

顺序要求：

- 不保留兼容分支
- 不保留双实现
- 每一步完成后都要删除旧结构，而不是“先留着以后再清”

### 10.1 第一阶段：按实体收拢 graph domain

目标：

- 把 node / edge / mindmap / group 的 graph domain 逻辑从横切文件收拢到实体模块。
- 让 `graph phase` 不再直接依赖 `projection.ts / views.ts / equality.ts / graphPatch/*` 这套横切结构。

本阶段新增或重组的目标文件：

- `src/domain/node.ts`
- `src/domain/edge.ts`
- `src/domain/mindmap.ts`
- `src/domain/group.ts`

本阶段涉及的旧文件：

- `src/domain/projection.ts`
- `src/domain/views.ts`
- `src/domain/equality.ts`
- `src/domain/graphPatch/node.ts`
- `src/domain/graphPatch/edge.ts`
- `src/domain/graphPatch/mindmap.ts`
- `src/domain/graphPatch/group.ts`
- `src/domain/graphPatch/helpers.ts`
- `src/domain/graphPatch/fanout.ts`
- `src/domain/graphPatch/delta.ts`

实施步骤：

1. 先从 `node` 开始，把 `readNodeEntry / buildNodeView / diffNodeView / patchNode` 收到 `domain/node.ts`。
2. 再处理 `edge`，把 route / handles / labels / box 的构造和比较一起收进去，保证 edge comparator 只保留一份。
3. 之后处理 `mindmap`，把 layout、preview 应用、member diff、patch 合并到 `domain/mindmap.ts`。
4. 最后处理 `group`，把 group view、signature、target 等 group 语义统一收进 `domain/group.ts`。
5. `graph phase` 改为只依赖各实体模块的 `patchXxx` 入口，不再直连横切 helper。
6. fanout 与 graph delta 如果仍然有跨实体共享价值，可以暂时保留为局部 helper，但必须只服务新的实体模块，不再保留旧 `graphPatch/*` 调用链。

阶段内约束：

- 不允许出现“新实体模块调用旧 `graphPatch/*` 主逻辑”的半迁移形态。
- 不允许保留一套新的 `diffXxx`，同时继续从 `equality.ts` 读取旧 comparator。
- mindmap 和 group 即使改动量更大，也必须最终并入实体模块，不能因为复杂而继续留在横切层。

阶段完成标志：

1. `graph phase` 对 graph 实体的依赖只剩 `node.ts / edge.ts / mindmap.ts / group.ts`。
2. `projection.ts / views.ts / equality.ts` 不再承担 graph entity 的主路径职责。
3. `graphPatch/node.ts / edge.ts / mindmap.ts / group.ts` 已删除。

阶段结束时必须删除：

- `src/domain/graphPatch/node.ts`
- `src/domain/graphPatch/edge.ts`
- `src/domain/graphPatch/mindmap.ts`
- `src/domain/graphPatch/group.ts`

如果 `helpers.ts / fanout.ts / delta.ts` 仍保留，必须已经改名并移动到新的归属位置，不能继续挂在 `graphPatch/` 目录下。

### 10.2 第二阶段：拆解 index 写路径与读路径

目标：

- 让 index 只承担索引职责，不再同时混入 group / mindmap 的领域逻辑和 runtime query 辅助。

本阶段新增的目标文件：

- `src/domain/index/update.ts`
- `src/domain/index/read.ts`

本阶段拆解来源：

- `src/domain/indexes.ts`

实施步骤：

1. 先把 `clearIndexState / rebuildIndexState / patchIndexState` 移到 `index/update.ts`。
2. 再把只读接口移到 `index/read.ts`，包括 adjacency、mindmap structure、tree descendants 等读取。
3. group signature、group target 相关逻辑迁回 `domain/group.ts`。
4. `readMindmapTree / readMindmapNodeIds` 这类更偏 mindmap 语义的读取迁回 `domain/mindmap.ts` 或只保留最薄的一层 index 读取包装。
5. runtime query、phase、entity patch 全部切到新的 `index/update.ts` 和 `index/read.ts`。

阶段内约束：

- `index/update.ts` 不能导出 runtime query 语义。
- `index/read.ts` 不能修改 state。
- `domain/group.ts` 不再从 `indexes.ts` 间接读取自己的 signature 语义。

阶段完成标志：

1. `src/domain/indexes.ts` 已删除。
2. 所有索引写路径只经过 `index/update.ts`。
3. 所有索引读路径只经过 `index/read.ts` 或实体模块自己的语义读取。

阶段结束时必须删除：

- `src/domain/indexes.ts`

### 10.3 第三阶段：替换基础 equal / geometry 重复实现

目标：

- 清除 `editor-graph` 内部重复的基础几何与列表比较，实现边界回归到 `shared/core` 和 `whiteboard-core`。

本阶段主要涉及的文件：

- `src/domain/geometry.ts`
- `src/domain/node.ts`
- `src/domain/edge.ts`
- `src/domain/mindmap.ts`
- `src/domain/group.ts`
- `src/domain/ui.ts`

外部复用目标：

- `shared/core/src/equality.ts`
- `whiteboard/packages/whiteboard-core/src/geometry/index.ts`
- 必要时补充 `whiteboard-core` 的少量 comparator primitive

实施步骤：

1. 把 list equal 统一替换为 `shared/core/equality.sameOrder` 或同级基础能力。
2. 把 point / size / rect equal 统一切到 `whiteboard-core/geometry` 或 `shared/core/equality`。
3. 把 `collectRects` 替换为 `geometry.rect.boundingRect` 或等价 core 能力。
4. 只保留 editor 专属的 view comparator，例如 edge handle、edge label ui、chrome overlay 这类领域比较。
5. 清理所有 `domain` 层对 `@shared/projector/publish/isListEqual` 的依赖。

阶段内约束：

- 本阶段不引入新的本地 geometry 基础设施。
- 如果 `whiteboard-core` 缺少一个明显通用的 primitive，可以直接下沉新增，但必须只新增通用能力。
- 不能把 editor view equal 反向塞进 `shared/core`。

阶段完成标志：

1. `domain` 层不再依赖 `@shared/projector/publish` 的 list equal。
2. `src/domain/geometry.ts` 要么删除，要么只剩 editor 专属 comparator，且名称与职责清晰。
3. point / rect / size / list 的基础比较不再在本包内重复维护。

阶段结束时必须删除或清空旧职责：

- `src/domain/geometry.ts` 中的基础几何 equal 与 bounding rect 实现

### 10.4 第四阶段：收敛 impact derivation

目标：

- 让 graph/ui/spatial 的 touched scope 规则只在一处定义。
- 去掉 `planner / uiScope / ui phase` 之间重复的 dirty 推导。

本阶段新增的目标文件：

- `src/projector/impact.ts`

本阶段主要涉及的旧文件：

- `src/projector/planner.ts`
- `src/projector/scopes/graphScope.ts`
- `src/projector/scopes/uiScope.ts`
- `src/projector/scopes/spatialScope.ts`
- `src/phases/graph.ts`
- `src/phases/ui.ts`

实施步骤：

1. 先把 graph scope 与 ui scope 的构造规则收进 `projector/impact.ts`。
2. 把 `cloneScopeKeys / readScopeKeys / EMPTY_SCOPE_KEYS` 这类重复的 scope helper 合并掉。
3. planner 改为只做 phase 决策，具体 touched ids 全部委托给 `impact.ts`。
4. graph phase 改为基于 `impact.ts` 从 graph delta 生成 `emit.ui` 与 `emit.spatial`。
5. ui phase 只消费 `impact.ts` 产出的 scope，不再从 `input` 和 `previous` 重新扫描一遍规则。
6. mindmap node index 的二次构建删除，统一改用 working/index 或 graph delta 已有信息。

阶段内约束：

- `ui phase` 不能继续藏着第二套 dirty 规则。
- `uiScope.ts` 不能保留“临时兼容函数”。
- phase 之间传递的是明确 scope，而不是重新从输入猜测 scope。

阶段完成标志：

1. touched scope 的规则只在 `projector/impact.ts` 一处定义。
2. `ui phase` 不再重算 selection / hover / draw / preview / mindmap tick 影响范围。
3. `createMindmapNodeIndexFromSnapshot / createMindmapNodeIndexFromState` 这类重复派生已删除。

阶段结束时必须删除：

- `src/projector/scopes/uiScope.ts`
- `src/projector/scopes/graphScope.ts`
- `src/projector/scopes/spatialScope.ts`

如果最后仍需要 scope 类型包装，应并入 `projector/impact.ts`，而不是继续保留分散文件。

### 10.5 第五阶段：删除 items phase，收敛 publish

目标：

- 让 `items` 退出 phase 体系，变成 graph/publish 直接派生结果。
- 把 publish 层收敛成单文件职责。

本阶段主要涉及的文件：

- `src/phases/items.ts`
- `src/projector/publish/items.ts`
- `src/projector/publish/graph.ts`
- `src/projector/publish/ui.ts`
- `src/projector/publisher.ts`
- `src/domain/items.ts`

实施步骤：

1. 删除 `items phase`，不再维护 `working.publish.items` 这套独立 phase 生命周期。
2. 决定 `items` 的唯一来源：
   - 要么直接在 publish 时由 document snapshot 派生。
   - 要么在 graph phase 检测到 order 变化时同步更新 `working.items`。
3. 无论选哪种，都必须保证 `items` 不再是一条独立 phase 链。
4. 把 `publish/graph.ts + publish/ui.ts + publish/items.ts + publisher.ts` 收敛到 `projector/publish.ts`。
5. `publish.ts` 内部只保留 graph/ui/items 三类发布逻辑，不再散落薄包装文件。

阶段内约束：

- 不保留 `items phase` 空壳。
- 不保留 `publish/items.ts` 这种只包一层 flags 的薄文件。
- `items` 的变更判断只能依赖 order 或 document snapshot，不重新引入额外状态机。

阶段完成标志：

1. `phases/items.ts` 已删除。
2. `projector/publish/items.ts` 已删除。
3. `items` 已变成 graph/publish 直接派生，projector phase 数量减少。
4. publish 逻辑已集中到 `projector/publish.ts`。

阶段结束时必须删除：

- `src/phases/items.ts`
- `src/projector/publish/items.ts`
- `src/projector/publish/graph.ts`
- `src/projector/publish/ui.ts`
- `src/projector/publisher.ts`

### 10.6 第六阶段：收敛 projector 薄文件与 runtime query 复用

目标：

- 完成最后的 projector 收口。
- 把 frame query 的通用部分尽量回收到 `whiteboard-core`。

本阶段主要涉及的文件：

- `src/projector/spec.ts`
- `src/projector/context.ts`
- `src/projector/phaseNames.ts`
- `src/runtime/query.ts`
- `whiteboard/packages/whiteboard-core/src/node/frame.ts`

实施步骤：

1. 把 `phaseNames.ts` 和 `context.ts` 并回 `projector/spec.ts` 或同级单文件。
2. 让 `projector` 最终只剩 `spec.ts / impact.ts / publish.ts` 三块。
3. 审视 runtime query 中 frame 相关逻辑，把真正通用的 candidate 版 frame 算法下沉到 `whiteboard-core`。
4. `runtime/query.ts` 改为：
   - 组合 spatial candidates
   - 调用 core frame query primitive
   - 拼 editor runtime 的读接口
5. 删除所有已经失去职责的薄文件和转发层。

阶段内约束：

- `whiteboard-core` 只新增通用 frame 查询 primitive，不引入 editor runtime 语义。
- `projector/spec.ts` 可以变大，但不能重新拆出无运行时价值的薄文件。

阶段完成标志：

1. `projector` 目录只保留 `spec.ts / impact.ts / publish.ts`。
2. `runtime/query.ts` 的 frame 算法不再重复维护 core 已有逻辑。
3. `phaseNames.ts` 与 `context.ts` 已删除。

阶段结束时必须删除：

- `src/projector/phaseNames.ts`
- `src/projector/context.ts`

### 10.7 第七阶段：最终清理与结构锁定

目标：

- 清除所有历史遗留文件、死导出、旧目录与命名。
- 确保代码库只剩最终结构，而不是“已经不用但还在”的残余实现。

实施步骤：

1. 全量搜索旧入口名，确认没有任何调用残留：
   - `projection.ts`
   - `views.ts`
   - `equality.ts`
   - `indexes.ts`
   - `graphPatch`
   - `items phase`
   - `publish/items.ts`
2. 清理 `index.ts`、内部 barrel、type export、测试引用、注释与文档中的旧路径。
3. 对照第 5 节最终目录结构，逐项核对现有文件树。
4. 对照第 11 节验收标准做最终核对。

阶段完成标志：

1. 第 5 节的目标目录结构已经成为真实代码结构。
2. 第 9 节删除清单对应的旧实现已全部消失。
3. 包内不存在“仅供过渡”的 TODO、deprecated wrapper、legacy alias。

这一阶段完成后，才视为本方案真正落地。

---

## 11. 验收标准

完成后应满足以下条件：

1. 阅读任一实体的完整 graph patch 行为，只需要进入一个实体模块。
2. `domain` 层不再依赖 `shared/projector/publish` 的 list equal。
3. `indexes` 的写路径和读路径分离。
4. UI touched scope 只在一处定义。
5. `projector` 层只剩薄 orchestration，不再到处散落小包装文件。
6. `items` 不再保留独立 phase。
7. runtime frame query 尽量复用 `whiteboard-core`。
8. 删除旧的横切结构，不遗留双份实现。

---

## 12. 最终判断

这次收敛的重点应当是：

- 按实体收拢 `domain`
- 让 `projector` 变薄
- 只复用真正的 shared/core 基础设施

不应当走的方向是：

- 再造一层更泛化的 shared diff framework
- 为了抽象统一把 Whiteboard 领域语义继续往 shared/core 下压
- 保留现有结构再在外面包一层 helper

真正长期最优的形态，是让 `whiteboard-editor-graph` 成为一个边界清楚的 editor graph domain 包，而不是一个由大量横切 helper 拼起来的运行时。

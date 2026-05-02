# Whiteboard Delta Typed / Registry 化长期方案

## 目标

这份方案聚焦三处代码：

- `whiteboard/packages/whiteboard-engine/src/mutation/delta.ts`
- `whiteboard/packages/whiteboard-editor/src/state-engine/delta.ts`
- `whiteboard/packages/whiteboard-editor-scene/src/contracts/delta.ts`

目标不是单纯把 `"foo.bar"` 改成类型体操，而是把 delta 相关的隐式协议收拢到少数几个 source of truth，减少重复代码、降低协议漂移风险，并给出长期可维护的 typed 方案。

我建议的长期方向是：

1. 保留 `@shared/mutation` 的通用字符串 delta 容器。
2. 在 whiteboard 边界引入 schema-driven / registry-driven 的 typed semantic delta。
3. 让 engine、editor state、scene projection 三层都从 descriptor / registry 派生 facade、统计和重置逻辑。

结论先写在前面：

- `whiteboard-engine` 和 `whiteboard-editor state-engine` 已经有 registry / entity schema，但 `delta.ts` 仍然手写了一层语义 facade，source of truth 不止一份。
- `whiteboard-editor-scene` 不是 `MutationDelta`，但已经是 typed projection delta；它的问题主要不是“字符串”，而是样板代码和 phase/field descriptor 缺失。
- 长期最优方案不是把 shared 层改成 fully typed generic delta，而是做 **typed semantic delta + registry descriptor 派生**。

## 现状诊断

### 1. `whiteboard-engine/src/mutation/delta.ts` 的问题

这个文件本质上是在开放字符串协议之上，手写一份 whiteboard 语义 facade。

可见的问题：

- 类型面定义和实现面都枚举了一遍 key。
  - 类型层：`node.create / node.delete / node.geometry ...` 全部手写声明。
  - 实现层：`createWhiteboardMutationDelta()` 再把同一套 key 手写绑定到 `changed()` / `touchedIds()`。[whiteboard-engine/src/mutation/delta.ts:13](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/delta.ts:13) [whiteboard-engine/src/mutation/delta.ts:153](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/delta.ts:153)
- `readTouchedIds()`、`createTouchedIdView()`、`changedKey()`、`hasKey()` 这类逻辑和 dataview 版本几乎平行重复。[whiteboard-engine/src/mutation/delta.ts:104](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/mutation/delta.ts:104)
- 这些 key 并不是唯一来源。`whiteboard-core` 里已经有 `whiteboardEntities` 作为 mutation schema，定义了 `node.geometry / edge.route / mindmap.structure` 等 change 分类。[whiteboard-core/src/mutation/entities.ts:5](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/entities.ts:5)

这意味着当前风险不是“用了字符串就一定脆弱”，而是：

- `entities.ts` 改了，但 `delta.ts` 没同步改；
- 新增 change aspect 时，需要同时改类型声明、facade 实现、使用方聚合逻辑；
- 维护者必须知道哪些 key 是协议、哪些只是实现细节。

### 2. `whiteboard-editor/src/state-engine/delta.ts` 的问题

这一层比 engine 更脆一点，因为它除了手写 facade，还自己实现了前缀匹配协议。

关键问题：

- `changedKey()` 通过 `delta.has(key)` + `Object.keys(delta.changes).some(startsWith(...))` 判断子路径变化。[state-engine/delta.ts:81](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/state-engine/delta.ts:81)
- `runtime.ts` 的 viewport 订阅又重复写了一遍同样的协议判断。[state-engine/runtime.ts:517](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/state-engine/runtime.ts:517)
- 但与此同时，editor state 已经有一个 registry：`editorStateRegistry`，其中 `state.tool / state.draw / overlay.preview / state.viewport` 的 change 路径已经集中定义好了。[state-engine/entities.ts:7](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/state-engine/entities.ts:7)

也就是说，当前 editor state 的真实问题是：

- registry 已经存在，但 `delta facade`、`runtime subscribe`、`commit flag` 聚合没有从 registry 派生；
- “state.viewport 是否变化”的语义不是 API，而是散落的 `startsWith('state.viewport.')`；
- `EditorDelta` 作为 UI/runtime delta 是手工组合的对象，merge/flag/touched 规则也都手写，维护成本高。[state-engine/delta.ts:37](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/state-engine/delta.ts:37) [state-engine/delta.ts:429](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/state-engine/delta.ts:429)

### 3. `whiteboard-editor-scene/src/contracts/delta.ts` 的问题

这一层不是基于字符串 key 的 `MutationDelta`，而是 projection delta / phase delta。它已经比前两层更 typed，但仍然存在两类问题：

- create/reset/compile 样板多。
  - `createGraphPhaseDelta` / `resetGraphPhaseDelta`
  - `createGraphDelta` / `resetGraphDelta`
  - `createRenderPhaseDelta` / `resetRenderPhaseDelta`
  - `compileFamilyChangeFromIdDelta` / `compileFamilyChangeFromEntityDelta`
  [editor-scene/contracts/delta.ts:164](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/contracts/delta.ts:164) [editor-scene/contracts/delta.ts:198](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/contracts/delta.ts:198) [editor-scene/contracts/delta.ts:302](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/contracts/delta.ts:302)
- phase 中的 family 结构是显式展开的，缺少 descriptor 层，导致 graph/render/ui 的 reset/compile/facts 汇总都要手写遍历。

这层的核心问题不是 string protocol，而是：

- phase/family 的结构定义没有上升为统一 descriptor；
- typed 有了，但 typed 信息没有驱动 helper 生成；
- 多处“同构数据结构 + 手写样板”会拖慢后续演进。

## 现有体系里已经具备的好基础

这三个模块并不是从零开始，实际上已经有三个很好的基础：

### 1. whiteboard core 已经有 mutation entity schema

`whiteboardEntities` 已定义：

- `document.background`
- `document.canvasOrder`
- `node.geometry / node.owner / node.content`
- `edge.endpoints / edge.route / edge.style / edge.labels / edge.data`
- `mindmap.structure / mindmap.layout`
- `group.value`

[whiteboard-core/src/mutation/entities.ts:5](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/entities.ts:5)

这已经非常接近 engine delta 的 source of truth。

### 2. whiteboard core 已有 mutation registry

`whiteboardMutationRegistry` 已经把一些 ordered/tree 结构与 change key 绑定起来，比如：

- `canvas.order`
- `edge.labels`
- `edge.route`

[whiteboard-core/src/mutation/targets.ts:456](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/mutation/targets.ts:456)

这说明 registry 方案不是引入新范式，而是沿着既有体系继续收敛。

### 3. editor state 也已有 registry

`editorStateRegistry` 已集中定义 `state.*` 和 `overlay.*` 的 change 分类。[state-engine/entities.ts:7](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/state-engine/entities.ts:7)

所以 whiteboard 的真正缺口不是“没有 schema”，而是：

- schema 没有驱动 facade；
- schema 没有驱动 watcher / commit flag / summary；
- scene phase delta 还没有同等级别的 descriptor。

## 设计原则

### 原则 1：shared 层保持开放，领域层收紧

不建议把 `@shared/mutation` 强行改成 fully typed generic delta。

原因：

- shared 层是通用基础设施，服务 dataview、whiteboard 等不同域；
- `MutationDelta` 的 `key/path/id` 本质上是开放协议，完全静态化会明显增加类型和实现复杂度；
- 真正需要稳定的是 whiteboard 领域语义，不是底层容器。

因此建议：

- shared 层继续提供 `MutationDelta`；
- whiteboard 层提供 `TypedSemanticDelta<Schema>` 或 codegen/factory 产物。

### 原则 2：schema 只维护一份

任何一个 change 语义，例如 `node.geometry`、`overlay.preview`、`state.viewport`，只允许一份 source of truth。

这份 truth 应该同时驱动：

- compile / mutation registry
- `changed()` / `touchedIds()` facade
- watcher / subscription
- commit flags / summary
- 场景输入事实聚合

### 原则 3：typed 优先落在“语义 API”，不是落在“原始 path 字符串”

真正值得类型化的是：

- `delta.node.geometry.changed(nodeId)`
- `delta.edge.route.touchedIds()`
- `delta.state.viewport.changed()`
- `delta.groups.value.changed(groupId)`

而不是让所有人直接消费：

- `delta.changed('node.geometry', id)`
- `key.startsWith('state.viewport.')`

## 长期最优架构

我建议把 whiteboard delta 分成三层 schema / descriptor。

### A. Document mutation schema

用途：描述 `MutationDelta` 里的 domain semantic key。

示意：

```ts
const whiteboardMutationDeltaSchema = defineDeltaSchema({
  canvas: {
    order: { key: 'canvas.order', aggregate: 'flag' }
  },
  node: {
    create: { key: 'node.create', ids: 'node' },
    delete: { key: 'node.delete', ids: 'node' },
    geometry: { key: 'node.geometry', ids: 'node' },
    owner: { key: 'node.owner', ids: 'node' },
    content: { key: 'node.content', ids: 'node' }
  },
  edge: {
    create: { key: 'edge.create', ids: 'edge' },
    delete: { key: 'edge.delete', ids: 'edge' },
    endpoints: { key: 'edge.endpoints', ids: 'edge' },
    route: { key: 'edge.route', ids: 'edge' },
    style: { key: 'edge.style', ids: 'edge' },
    labels: { key: 'edge.labels', ids: 'edge' },
    data: { key: 'edge.data', ids: 'edge' }
  },
  mindmap: {
    create: { key: 'mindmap.create', ids: 'mindmap' },
    delete: { key: 'mindmap.delete', ids: 'mindmap' },
    structure: { key: 'mindmap.structure', ids: 'mindmap' },
    layout: { key: 'mindmap.layout', ids: 'mindmap' }
  },
  group: {
    create: { key: 'group.create', ids: 'group' },
    delete: { key: 'group.delete', ids: 'group' },
    value: { key: 'group.value', ids: 'group' }
  }
} as const)
```

这份 schema 的职责：

- 生成 `createWhiteboardMutationDelta()`
- 生成 `delta.node.geometry.changed()` / `touchedIds()`
- 生成聚合 helper，例如 `delta.node.anyTouchedIds()`
- 生成 scene input facts 所需的 domain families 列表

重要的是，这份 schema 应该和 `whiteboardEntities` 对齐，最好直接由 `whiteboardEntities` 衍生出大部分基础信息，而不是人工维护第二份大表。

### B. Editor state mutation schema

用途：描述 editor state engine 对外暴露的 change section。

示意：

```ts
const editorStateDeltaSchema = defineDeltaSchema({
  state: {
    tool: { key: 'state.tool', match: 'prefix' },
    draw: { key: 'state.draw', match: 'prefix' },
    selection: { key: 'state.selection', match: 'prefix' },
    edit: { key: 'state.edit', match: 'prefix' },
    interaction: { key: 'state.interaction', match: 'prefix' },
    viewport: { key: 'state.viewport', match: 'prefix' }
  },
  overlay: {
    hover: { key: 'overlay.hover', match: 'prefix' },
    preview: { key: 'overlay.preview', match: 'prefix' }
  }
} as const)
```

这份 schema 的职责：

- 生成 `createEditorStateMutationDelta()`
- 生成 `collectEditorCommitFlags()`
- 生成 `subscribeBySection('state.viewport')`
- 取代 runtime 里手写的 `startsWith('state.viewport.')`

这里要特别注意：editor state registry 已经有 `change` 路径定义，但 facade 层只关心 section 级别 changed。  
因此长期最好的结构是：

- `editorStateRegistry` 继续负责 compile / write；
- `editorStateDeltaSchema` 负责读取侧 facade / watcher / flags；
- 这两者共享 key 常量或从同一 descriptor 派生。

### C. Scene projection delta descriptor

用途：描述 scene 的 phase delta / projection delta 结构，消掉 create/reset/compile 样板。

示意：

```ts
const sceneProjectionDeltaDescriptor = defineProjectionDeltaDescriptor({
  graphPhase: {
    entities: {
      nodes: idDeltaFamily<NodeId>(),
      edges: idDeltaFamily<EdgeId>(),
      mindmaps: idDeltaFamily<MindmapId>(),
      groups: idDeltaFamily<GroupId>()
    },
    geometry: {
      nodes: setFamily<NodeId>(),
      edges: setFamily<EdgeId>(),
      mindmaps: setFamily<MindmapId>(),
      groups: setFamily<GroupId>()
    },
    order: booleanFlag(),
    revision: revisionValue()
  },
  renderPhase: {
    node: idDeltaFamily<NodeId>(),
    edge: {
      statics: idDeltaFamily<EdgeStaticId>(),
      active: idDeltaFamily<EdgeId>(),
      labels: idDeltaFamily<EdgeLabelKey>(),
      masks: idDeltaFamily<EdgeId>(),
      staticsIds: booleanFlag(),
      activeIds: booleanFlag(),
      labelsIds: booleanFlag(),
      masksIds: booleanFlag()
    }
  },
  projection: {
    graph: {
      node: familyChange<NodeId, NodeView>(),
      edge: familyChange<EdgeId, EdgeView>(),
      ...
    }
  }
})
```

这份 descriptor 的职责：

- 生成 `createXxxDelta()`
- 生成 `resetXxxDelta()`
- 生成 `compileFamilyChange...` 风格 helper
- 为 facts 聚合提供统一遍历接口

这一层不一定要走复杂 codegen。先做 descriptor + 小型运行时 factory 就够了。

## 方案细化

### 方案 1：最小成本版

适合先止血。

做法：

1. 提取 whiteboard mutation key 常量。
2. 提取 editor state key 常量。
3. 把 `createWhiteboardMutationDelta()` 和 `createEditorStateMutationDelta()` 的重复逻辑收进共享 helper。
4. 让 `runtime.ts` 的 viewport 订阅改走统一 helper。

优点：

- 改动小；
- 立刻减少字符串散落；
- 风险低。

缺点：

- source of truth 仍然可能是两份；
- scene 层的样板基本还在；
- typed 化有限。

我的判断：这是可以作为第一步，但不应作为终态。

### 方案 2：registry-driven semantic facade

这是我认为最平衡的主方案。

做法：

1. 在 whiteboard-engine 增加 `mutationDeltaSchema.ts`。
2. 在 whiteboard-editor/state-engine 增加 `deltaSchema.ts`。
3. 提供通用 helper，例如：
   - `createEntityTouchedView(delta, key)`
   - `createSectionChangedView(delta, key, { prefix: true })`
   - `createSemanticMutationDelta(delta, schema)`
4. 让 facade、commit flags、watcher 都由 schema 驱动。
5. 让 scene facts 聚合引用 schema 列表，而不是手写 `node.content / edge.style / ...`。

优点：

- 复杂度可控；
- 不需要大改 shared；
- 可以显著减少 engine/editor 的手写重复；
- 对外 API 仍然是清晰的 typed semantic delta。

缺点：

- 需要设计一层小型 schema runtime；
- `whiteboardEntities` 与 facade schema 的映射关系仍需仔细定义。

我的判断：这是最合理的长期主线。

### 方案 3：从 registry / entity schema 自动生成 facade

这是理论上最“干净”的终态。

做法：

- 从 `whiteboardEntities` 和 `editorStateRegistry.entity` 自动生成 facade；
- create/reset/changed/touchedIds/flags 都由生成器或泛型 builder 派生。

优点：

- source of truth 最少；
- 漂移风险最低；
- 新增 change aspect 成本最低。

缺点：

- 初始建模成本高；
- `entities.change` 的表达力未必足够支撑所有读取侧语义；
- editor `EditorDelta` 和 scene projection delta 不是简单 `MutationDelta`，无法完全由同一种生成器覆盖。

我的判断：这可以作为 2 的后续演进目标，但不要一开始就强推“全自动”。

## 推荐的长期最优方案

我推荐：

**以方案 2 为主，保留向方案 3 演进的空间。**

即：

1. shared 层不大改；
2. whiteboard 内部新增统一 descriptor / schema；
3. engine 和 editor state 的 delta facade 从 schema 派生；
4. scene projection delta 引入独立 descriptor，统一 create/reset/compile；
5. 中长期再评估能否从 entity registry 自动生成更多 facade。

这是长期最优，而不是“理论最完美”的原因很简单：

- 它复用现有 `whiteboardEntities`、`whiteboardMutationRegistry`、`editorStateRegistry`；
- 它能直接消掉今天最痛的重复和隐式协议；
- 它不会把 shared 基础设施变成高类型复杂度黑箱；
- 它给 scene 这层留出了独立演进空间。

## 具体重构建议

### 一、先统一 whiteboard mutation key 常量

建议新增：

- `whiteboard/packages/whiteboard-engine/src/mutation/schema.ts`
  - whiteboard document mutation semantic key descriptor
- `whiteboard/packages/whiteboard-editor/src/state-engine/schema.ts`
  - editor state mutation semantic key descriptor

最少包含：

- `key`
- `idKind` 或 `aggregateKind`
- `match` 规则：`exact` / `prefix`

这样 `delta.ts` 文件就不再直接写 `"node.geometry"`、`"overlay.preview"`。

### 二、把 facade builder 抽成共享 helper

建议新增一个 whiteboard 内部 helper，能力类似：

```ts
type SectionView<TId extends string> = {
  changed(id?: TId): boolean
  touchedIds(): ReadonlySet<TId> | 'all'
}

createTouchedSectionView(delta, key)
createFlagSectionView(delta, key, { prefix?: boolean })
createSemanticMutationDelta(delta, descriptor)
```

这样可以把：

- `createTouchedIdView`
- `readTouchedIds`
- `changedKey`
- `hasKey`
- `changedKey + startsWith`

统一掉。

### 三、让 runtime watcher 走 schema helper

例如把：

```ts
commit.delta.has('state.viewport')
|| Object.keys(commit.delta.changes).some((key) => key.startsWith('state.viewport.'))
```

替换为：

```ts
editorStateMutationSections.viewport.changed(commit.delta)
```

这样订阅逻辑不再手写协议判断。

### 四、让 commit flags 从 schema 自动聚合

今天 `collectEditorCommitFlags()` 是显式展开。[state-engine/delta.ts:294](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/state-engine/delta.ts:294)

建议改为 descriptor 驱动：

```ts
const editorCommitFlagSections = ['tool', 'draw', 'selection', ...] as const
```

甚至由 schema 派生。

这样新增 section 时不会漏改 flag 聚合。

### 五、scene 层引入 phase descriptor

建议把 `contracts/delta.ts` 里的 create/reset/compile 收敛到 descriptor 驱动 helper。

重点不是搞复杂元编程，而是统一三类模式：

1. `IdDelta<T>`
2. `ProjectionFamilyChange<TKey, TValue>`
3. `ProjectionValueChange<T>`

以及两类操作：

1. `create`
2. `reset`

这样可以显著减少：

- graph/render/ui 各类重复结构；
- 手工 reset 漏字段的风险；
- compile helper 的重复。

### 六、scene facts 聚合不要硬编码 aspect 清单

当前 `model/facts.ts` 手工枚举：

- `node.create`
- `node.delete`
- `node.geometry`
- `node.owner`
- `node.content`
- `edge.create`
- ...

[editor-scene/model/facts.ts:67](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor-scene/src/model/facts.ts:67)

建议让这类汇总走 schema family 列表。例如：

- `schema.node.lifecycle`
- `schema.node.content`
- `schema.edge.geometry`

这样 facts 与 engine facade 会共享同一份语义分组。

## 不建议做的事

### 1. 不建议直接重写 `@shared/mutation`

收益不成比例。shared 层改动面过大，而且会把不同产品域强行耦合到同一套类型系统。

### 2. 不建议把所有 path 都做成模板字符串类型

例如把 `labels.${labelId}.text`、`route.${pointId}.x`、`style.**` 全部静态表达，类型复杂度会上升很快，阅读和维护成本都不划算。

### 3. 不建议一开始就做 code generation

当前问题主要是 source of truth 分散和 facade/watcher 重复，不是构建时生成缺失。先上 descriptor/runtime helper，足够把稳定性拉起来。

## 推荐迁移路线

### Phase 1：止血

目标：先消除散落字符串和 watcher 重复。

工作项：

1. 抽 whiteboard engine mutation key/schema 常量。
2. 抽 editor state mutation key/schema 常量。
3. `state-engine/runtime.ts` 的 viewport 订阅改走 helper。
4. `createWhiteboardMutationDelta()` / `createEditorStateMutationDelta()` 收敛到统一 builder。

收益：

- 减少手写字符串；
- 消除局部隐式协议；
- 风险最低。

### Phase 2：schema 驱动 facade

目标：让 semantic delta 不再手写展开。

工作项：

1. 为 whiteboard engine 建 `mutationDeltaSchema`。
2. 为 editor state 建 `editorStateDeltaSchema`。
3. 让 facade、flags、watchers 从 schema 派生。
4. 让 scene input facts 引用 schema 分组。

收益：

- source of truth 大幅收敛；
- 新增 aspect 成本显著下降；
- 稳定性提升最明显。

### Phase 3：scene descriptor 化

目标：减少 projection delta 样板。

工作项：

1. 引入 phase delta descriptor。
2. 生成 create/reset helper。
3. 收敛 `compileFamilyChangeFromIdDelta` / `compileFamilyChangeFromEntityDelta` 周边模式。
4. 逐步把 graph/render/ui phase 统一到 descriptor 驱动。

收益：

- scene 层维护成本下降；
- 漏 reset / 漏字段风险下降；
- 为未来新增 projection family 打基础。

### Phase 4：向 registry 自动派生演进

目标：进一步减少双份 schema。

工作项：

1. 评估从 `whiteboardEntities` 自动派生 mutation facade 信息。
2. 评估从 `editorStateRegistry` 自动派生 section facade。
3. 保留少量读取侧扩展 metadata，避免被 registry 表达力限制。

收益：

- source of truth 最少；
- 长期维护成本最低。

## 最终判断

如果只回答“要不要 typed delta”，我的结论是：

- 要，但应该是 **typed semantic delta**；
- 不要把 shared 底层强行改成 fully typed generic delta。

如果只回答“要不要 registry 化”，我的结论是：

- 要，而且 whiteboard 现在已经有一半 registry 基础；
- 真正需要补的是 **读取侧 facade / watcher / scene phase descriptor 的 registry 化**。

长期最优方案可以概括成一句话：

**保留通用字符串 delta 容器，在 whiteboard 边界引入统一 schema/descriptor，让 engine mutation、editor state mutation、scene projection delta 都从 descriptor 派生语义 API 和重置/聚合逻辑。**

这条路的优势是：

- 稳定性最高；
- 复杂度增长最可控；
- 对现有代码最友好；
- 能真正减少重复，而不是只把字符串换了个写法。

## 建议的下一步落地

如果要继续推进，我建议下一步不是直接全面重构，而是先做一个最小可验证的 slice：

1. 为 `whiteboard-engine` 提取 `mutationDeltaSchema`；
2. 用 builder 重写 `createWhiteboardMutationDelta()`；
3. 为 `whiteboard-editor state` 提取 `deltaSchema`；
4. 把 viewport watcher 改走统一 helper；
5. 再评估 scene facts 是否一并改成 schema 驱动。

这样能最快验证这条路径是不是足够顺手，也能最小成本暴露 schema 设计里不合理的地方。

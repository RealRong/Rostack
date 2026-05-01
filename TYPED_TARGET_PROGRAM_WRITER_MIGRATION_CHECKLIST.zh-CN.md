# Typed Target Program Writer 迁移清单

## 0. 硬约束

- 不保留兼容。
- 不保留两套写入链。
- 不保留 `operation -> append -> writer` 二次 lowering。
- 不保留 `string structure protocol -> domain adapter -> shared structural runtime` 这种多层翻译。
- 最终唯一写入中轴：`intent -> compile(reader, writer) -> MutationProgram -> engine apply -> MutationDelta`

## 1. 最终模型

- `shared/mutation` 只保留 `program` 作为 authored write IR。
- `ordered/tree` 不再使用裸 `string structure`，改为 typed target。
- domain compile 直接拿 typed writer 写 program，不再先产 domain operation / structural operation。
- `MutationDelta` 继续作为唯一提交增量模型。
- dataview 和 whiteboard 都只保留一条 compile 主链，不允许再各自维护 append / adapter / secondary diff runtime。

## 2. shared/mutation

### 2.1 typed target

- 为 `entity / ordered / tree` 建立统一 typed target 协议。
- `ordered/tree` target 替代当前所有 `structure: string`。
- target 必须携带足够的类型信息，避免 domain 自己维护前缀字符串协议。
- target registry 负责：
  - `read`
  - `write`
  - `identify`
  - `clone`
  - `patch`
  - `diff`
  - `change`

### 2.1.1 最简单 target registry API

```ts
type MutationTarget =
  | {
      kind: 'entity'
      table: string
      id?: string
    }
  | {
      kind: 'ordered'
      type: string
      key?: string
    }
  | {
      kind: 'tree'
      type: string
      key?: string
    }

type MutationTargetRegistry<Doc> = {
  entity?: {
    [table: string]: {
      read(doc: Doc, id: string): unknown
      write(doc: Doc, id: string, value: unknown): Doc
      patch?(value: unknown, patch: unknown): unknown
      diff?(before: unknown, after: unknown): unknown
      change?: MutationChangeFactory
    }
  }
  ordered?: {
    [type: string]: {
      read(doc: Doc, key: string | undefined): readonly unknown[]
      write(doc: Doc, key: string | undefined, items: readonly unknown[]): Doc
      identify(item: unknown): string
      clone?(item: unknown): unknown
      patch?(item: unknown, patch: unknown): unknown
      diff?(before: unknown, after: unknown): unknown
      change?: MutationChangeFactory
    }
  }
  tree?: {
    [type: string]: {
      read(doc: Doc, key: string | undefined): MutationTreeSnapshot<unknown>
      write(doc: Doc, key: string | undefined, tree: MutationTreeSnapshot<unknown>): Doc
      clone?(value: unknown): unknown
      patch?(value: unknown, patch: unknown): unknown
      diff?(before: unknown, after: unknown): unknown
      change?: MutationChangeFactory
    }
  }
}
```

- `type` 表示 target family，例如：
  - dataview: `field.options` / `view.sort` / `view.filter` / `view.display` / `view.order`
  - whiteboard: `canvas.order` / `edge.labels` / `edge.route` / `mindmap.tree`
- `key` 表示 family 实例 key，例如 `viewId`、`fieldId`、`edgeId`、`mindmapId`。
- 不再允许 domain 自己拼 `view.sort.rules:${viewId}` 这种结构字符串。
- `change` 是 target 级 delta 编译入口，直接从 target + action 生成增量，不再让 domain 在 compile 层到处手写。

### 2.1.2 target 只保留为内部模型

- authored API 不直接暴露 `target`。
- `target` 只作为 shared kernel 内部解析模型存在，用于：
  - program step 持久化
  - engine apply
  - inverse
  - delta/change 编译
- domain compile 不直接操作 target 对象。
- domain compile 只操作 registry 生成的 bound mutation ports。

### 2.1.3 最简单 registry API

```ts
const registry = defineMutationRegistry<Doc>()({
  entity: {
    node: entity({
      read(doc, id) { ... },
      write(doc, id, value) { ... },
      patch(value, patch) { ... },
      diff(before, after) { ... },
      change(change) { ... }
    }),
    edge: entity({ ... }),
    view: entity({ ... })
  },
  ordered: {
    edgeLabels: ordered({
      read(doc, edgeId) { ... },
      write(doc, edgeId, items) { ... },
      identify(label) { return label.id },
      patch(label, patch) { ... },
      diff(before, after) { ... },
      change(change, edgeId) { ... }
    }),
    canvasOrder: ordered({
      read(doc) { ... },
      write(doc, _key, items) { ... },
      identify(ref) { return canvasRefKey(ref) },
      change(change) { ... }
    })
  },
  tree: {
    mindmapTree: tree({
      read(doc, mindmapId) { ... },
      write(doc, mindmapId, tree) { ... },
      patch(value, patch) { ... },
      diff(before, after) { ... },
      change(change, mindmapId) { ... }
    })
  }
})
```

- `entity / ordered / tree` 是 registry declaration。
- `node / edge / edgeLabels / canvasOrder / mindmapTree` 是 domain 名字，不再暴露 `table: 'node'` 或 `type: 'edge.labels'` 这类字面量到 compile 调用面。
- registry 内部可以编译出 target descriptor，但这不是业务 API。

### 2.1.4 最简单 authored API

```ts
const mutation = createMutationPorts(registry, program)

mutation.node.create(node)
mutation.node.patch(node.id, { position })
mutation.node.delete(node.id)

mutation.edgeLabels(edgeId).insert(label, anchor)
mutation.edgeLabels(edgeId).move(label.id, anchor)
mutation.edgeLabels(edgeId).patch(label.id, patch)

mutation.canvasOrder().move(canvasRef(ref), anchor)
mutation.canvasOrder().splice(refs, anchor)

mutation.fieldOptions(fieldId).insert(option, anchor)
mutation.fieldOptions(fieldId).patch(option.id, patch)

mutation.mindmapTree(mindmapId).insert(nodeId, parentId, index, value)
mutation.mindmapTree(mindmapId).move(nodeId, parentId, index)
mutation.mindmapTree(mindmapId).patch(nodeId, patch)
```

- 业务侧只有一个概念：`mutation ports`。
- `writer + target` 的组合被 registry 预绑定，compile 只调用 domain port。
- `table: 'node'`、`type: 'edge.labels'`、`key: edgeId` 这类协议不再出现在 compile 调用面。
- 无 key 的 ordered target 用 `canvasOrder()` 这种零参 port。
- 有 key 的 ordered/tree target 用 `edgeLabels(edgeId)` / `mindmapTree(mindmapId)` 这种 bound port。

### 2.1.5 shared 内部仍然保留的最低限度模型

- shared 内部仍然需要：
  - program
  - target descriptor
  - registry descriptor
- 但这些都是 kernel 内部实现细节。
- authored surface 只暴露：
  - `defineMutationRegistry(...)`
  - `createMutationPorts(registry, program)`

### 2.2 program writer

- `MutationProgramWriter` 退化为 shared 内部底层写入器。
- domain authored API 统一改为 `mutation ports`。
- 禁止 domain 再包 append 层。
- writer API 保持扁平直接，不再要求 domain 自己做结构协议翻译。

### 2.3 engine

- `engine/program/materialize.ts` 不再把 program 再 materialize 成 `canonical operation[]` 作为主链。
- `engine/contracts.ts` 里的 `structural.ordered.* / structural.tree.*` 不再作为 authored API。
- `engine/structural.ts` 改为直接消费 typed target program step。
- history / inverse / applied commit 全部基于 program，而不是基于 operation。

### 2.4 必删项

- `canonical op` 作为主 authored 模型
- `custom op` 作为主 authored 模型
- `structure: string` authored target
- program 到 operation 的回翻译主链

## 3. dataview

### 3.1 compile 主链

- `dataview/packages/dataview-core/src/mutation/compile` 直接使用 shared typed writer。
- compile handler 直接写 target program。
- compile 内局部校验和 domain read 继续保留，但必须依附主 writer，不允许再派生 secondary IR。

### 3.2 `viewProgram.ts`

- [dataview/packages/dataview-core/src/mutation/compile/viewProgram.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/viewProgram.ts) 视为第二套编排层，必须删除。
- `writeViewUpdate / writeViewDisplayInsert / writeViewOrderInsert` 合并回 `compile/view.ts` 或 compile 下更小的纯 domain diff 模块。
- 允许保留纯函数级别的 view diff 算法，但不允许保留一个“compile 下面再包一层 writer orchestration”的文件。

### 3.3 target / adapter

- [dataview/packages/dataview-core/src/mutation/adapters.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/adapters.ts) 当前承担了 string structure 协议翻译，typed target 落地后必须删除。
- `FIELD_OPTIONS_STRUCTURE_PREFIX`
- `VIEW_ORDERS_STRUCTURE_PREFIX`
- `VIEW_DISPLAY_FIELDS_STRUCTURE_PREFIX`
- `VIEW_FILTER_RULES_STRUCTURE_PREFIX`
- `VIEW_SORT_RULES_STRUCTURE_PREFIX`
- 上述前缀协议全部改为 typed target constructor。

### 3.4 writer

- [dataview/packages/dataview-core/src/mutation/programWriter.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/programWriter.ts) 继续保留的话，只能作为 dataview typed target facade，不能再承担 adapter 协议翻译。
- 更优目标：dataview compile 直接使用 shared typed writer + dataview target constructors，尽量删除 domain-specific writer 包装层。

### 3.5 目录收口

- `dataview/packages/dataview-core/src/mutation` 下只保留：
  - `compile/`
  - `targets/`
  - `index.ts`
- 删除零散 re-export。
- compile 相关文件全部收进 `mutation/compile/`。
- target 定义全部收进 `mutation/targets/`。

## 4. whiteboard

### 4.1 第二套实现必须清零

- [whiteboard/packages/whiteboard-core/src/operations/compile/append.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/operations/compile/append.ts) 必删。
- [whiteboard/packages/whiteboard-core/src/operations/internal.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/operations/internal.ts) 必删。
- `WhiteboardInternalOperation` 必删。
- `appendWhiteboardOperation` 必删。
- `appendWhiteboardOperations` 必删。
- `appendStructuralOperation` 必删。

### 4.2 compile 主链

- `whiteboard-core` compile handler 直接写 shared typed writer。
- `canvas / node / edge / group / mindmap` compile 文件不再构造 `Operation` 或 `MutationStructuralCanonicalOperation`。
- compile 的唯一输出就是 program step 写入。

### 4.3 custom 收口

- `custom` 不再表示 custom operation runtime。
- `custom` 如果保留，只能放纯领域算法或 planner。
- planner 直接吃：
  - `reader`
  - `writer`
  - `services`
- planner 不再吃 `WhiteboardInternalOperation`，不再 emit operation。

### 4.4 structures 收口

- [whiteboard/packages/whiteboard-core/src/operations/custom/structures.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/operations/custom/structures.ts) 当前混合了：
  - string target 协议
  - structure read/write
  - change 映射
  - patch/diff
  - 少量领域算法
- typed target 落地后必须拆开：
  - `targets/`：typed target constructor 与 registry
  - `algorithms/`：纯领域算法，如 mindmap layout diff、branch style 推导、anchor 转换
- 不允许继续把 target 协议和领域算法混放在一个大文件里。

### 4.5 writer

- [whiteboard/packages/whiteboard-core/src/operations/programWriter.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/operations/programWriter.ts) 不能再承担“domain API -> string structure”翻译层。
- 更优目标：删除该文件，compile 直接使用 shared typed writer + whiteboard target constructors。
- 如果短期保留同名文件，它只能是极薄的 typed target facade，不允许继续增长。

### 4.6 目录重组

- `whiteboard/packages/whiteboard-core/src/operations` 目录名本身已经误导，最终应重命名为 `mutation`。
- 最终目录建议：
  - `whiteboard/packages/whiteboard-core/src/mutation/compile`
  - `whiteboard/packages/whiteboard-core/src/mutation/targets`
  - `whiteboard/packages/whiteboard-core/src/mutation/planner`
  - `whiteboard/packages/whiteboard-core/src/mutation/validate`
  - `whiteboard/packages/whiteboard-core/src/mutation/index.ts`
- `planner` 放 mindmap / canvas 这类纯领域组合写入算法。
- `targets` 放 canvas order / edge labels / edge route / mindmap tree 这类 typed target。
- `compile` 只做 intent 编排，不再承载 append/runtime 翻译。

## 5. 现有必须下沉为底层设施的能力

- typed target registry
- ordered/tree target apply
- ordered/tree patch/diff contract
- ordered/tree target delta/change compile
- target 级类型提示与 target constructor

## 6. 允许保留的 helper 边界

- 纯领域算法 helper 可以保留。
- 纯值级 diff / clone / normalize helper 可以保留。
- 任何“把一种写入 IR 再翻译成另一种写入 IR”的 helper 不允许保留。
- 任何“把 string target 协议补全成 typed 语义”的 helper 不允许保留。

## 7. 删除清单

### 7.1 shared/mutation

- authored `canonical operation`
- authored `custom operation`
- authored `structural.ordered.*`
- authored `structural.tree.*`
- program materialize 回 operation 的主链

### 7.2 dataview

- `mutation/adapters.ts`
- `mutation/compile/viewProgram.ts`
- 所有基于 structure prefix 的 target 协议

### 7.3 whiteboard

- `operations/internal.ts`
- `operations/compile/append.ts`
- `appendWhiteboardOperation`
- `appendWhiteboardOperations`
- `appendStructuralOperation`
- 所有 compile 中直接构造 `MutationStructuralCanonicalOperation` 的路径

## 8. 完成标准

- shared 不再暴露 authored operation 主模型。
- dataview 不再存在 adapter / viewProgram 这种第二套写入编排。
- whiteboard 不再存在 internal operation / append / structural operation 中转。
- dataview 与 whiteboard 都直接基于 shared typed writer 写 program。
- 目录命名与文件职责反映单一中轴，不再出现 operation/runtime/append 这类历史遗留中转命名。

# Typed Target Program Writer 终态说明

## 1. 文档定位

- 本文档描述当前已经落地的最终实现状态。
- 迁移已经按“无兼容层、无过渡层、无双轨写入抽象”完成。
- 后续如果继续调整，只能是在当前 typed target 主链内部做局部优化，不再允许恢复旧 structural op / string structure / domain writer facade 边界。

最终唯一写入中轴为：

```ts
intent -> compile(reader, ports) -> MutationProgram -> engine.apply(program) -> MutationDelta
```

## 2. 已完成的 shared/mutation 终态

### 2.1 写入 IR

- `MutationProgram` 是唯一 authored write IR。
- `entity` / `ordered` / `tree` 都已经使用 typed target。
- `ordered/tree` step 不再携带 `structure: string`。
- `signal(delta)` 已经成为显式 program step，不再依赖结构层 hack。

当前 target 模型为：

```ts
type MutationTarget =
  | {
      kind: 'entity'
      type: string
      id: string
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
```

### 2.2 registry

- shared registry 已经从 `entities + structures` 改为 typed registry：
  - `entity`
  - `ordered`
  - `tree`
- ordered/tree family 直接声明：
  - `read(document, key)`
  - `write(document, key, snapshot)`
  - `identify`
  - `clone`
  - `patch`
  - `diff`
  - `change`
- `MutationEngine` 已经通过 `registry` 接收领域声明，不再接收 `structures`。

### 2.3 runtime / structural kernel

- `shared/mutation/src/engine/structural.ts` 已经收薄为 typed ordered/tree apply helper。
- 旧 `structural.*` canonical operation 模型已经从 shared 主链删除。
- effect 不再经过 `program effect <-> structural op` 双向转换。
- inverse 直接生成为 typed target `MutationProgramStep`。
- shared 内部不再把旧 structural op 当作中间语义层。

### 2.4 ports

- shared 已提供通用 `createMutationPorts(registry, writer)`。
- compile handler 可以直接拿 typed ports 写 program。
- ports 已支持 metadata 透传，保留 delta/footprint 注入能力，但不会重新引入第二套 writer IR。

## 3. 已完成的 dataview 终态

### 3.1 compile surface

- dataview compile handler 已直接消费 shared typed ports。
- `createDataviewProgramWriter(...)` 已删除。
- `compile/index.ts` 已不再传 `createProgram`。
- `external.version.bump` 已改为 `program.signal(...)`。

当前 compile 调用面已经是：

```ts
input.program.record.create(record)
input.program.fieldOptions(fieldId).insert(option, anchor)
input.program.viewFilter(viewId).move(ruleId, anchor)
input.program.viewDisplay(viewId).splice(fieldIds, anchor)
```

### 3.2 target declaration

- dataview 已删除 prefix string target 协议：
  - `FIELD_OPTIONS_STRUCTURE_PREFIX`
  - `VIEW_ORDERS_STRUCTURE_PREFIX`
  - `VIEW_DISPLAY_FIELDS_STRUCTURE_PREFIX`
  - `VIEW_FILTER_RULES_STRUCTURE_PREFIX`
  - `VIEW_SORT_RULES_STRUCTURE_PREFIX`
- `targets.ts` 现在只声明 typed family：
  - `fieldOptions`
  - `viewOrder`
  - `viewDisplay`
  - `viewFilter`
  - `viewSort`

### 3.3 现有 helper 的角色

- `viewDiff.ts` 已不再依赖 domain writer facade。
- 它现在只是 compile 内部直接面向 typed ports 的局部 helper，不再承担旧 writer 适配边界。
- dataview 已不存在第二套 authored 写入抽象。

## 4. 已完成的 whiteboard 终态

### 4.1 compile surface

- whiteboard compile / planner context 已切到 typed ports。
- compile / custom 已不再暴露 `MutationProgramWriter<string>` 作为领域边界。
- engine 已通过 `registry: whiteboardMutationRegistry` 构建 compile program。

当前 whiteboard 写入面已经是：

```ts
input.program.node.create(node)
input.program.canvasOrder().splice(refKeys, anchor)
input.program.edgeLabels(edgeId).patch(labelId, patch)
input.program.mindmapTree(mindmapId).insert(nodeId, parentId, index, value)
```

### 4.2 target declaration

- whiteboard 已删除字符串 target 协议作为主边界：
  - `canvas.order`
  - `edge.labels:${id}`
  - `edge.route:${id}`
  - `mindmap.tree:${id}`
- `targets.ts` 现在声明的 typed family 为：
  - `canvasOrder`
  - `edgeLabels`
  - `edgeRoute`
  - `mindmapTree`

### 4.3 planner/helper 的角色

- custom planner 已直接面向 typed ports。
- compile helper 不再做 string target 或 raw writer 翻译。
- 仍然保留的 helper 文件只封装 compile 内部重复写法，不再构成第二套写入 IR。

### 4.4 入口

- `whiteboard/packages/whiteboard-core/src/mutation/index.ts` 已变成真实入口，不再是空壳。
- `operations/` 仍然承载当前实现文件，但对外 mutation 入口已经统一收口到 `mutation/`。

## 5. 已清除的旧实现

- shared public surface 不再导出旧 authored structural op。
- shared runtime 不再接收 `structures`。
- shared contracts 不再定义 `MutationStructuralCanonicalOperation` 及相关 structural op type。
- dataview 不再保留 domain writer facade。
- dataview / whiteboard 不再依赖 prefix-string / string-structure target 协议。
- engine / history / collab 已统一收口到 `apply(program)`。

## 6. 当前验证结果

- `pnpm --filter @shared/mutation run typecheck`
- `pnpm --filter @dataview/core run typecheck`
- `pnpm --filter @whiteboard/core run typecheck`
- `pnpm --filter @shared/mutation run test`
- `pnpm --filter @dataview/core run test`
- `pnpm --filter @whiteboard/core run test`

以上检查均已通过。

## 7. 约束回顾

当前代码库必须继续遵守以下约束：

- 不恢复旧 structural authored-op public API。
- 不恢复 `program -> authored structural op[]` 回翻译链。
- 不恢复 domain writer facade 作为 compile 边界。
- 不把 typed target 再包装回字符串协议。
- 不再新增第二套 authored write abstraction。

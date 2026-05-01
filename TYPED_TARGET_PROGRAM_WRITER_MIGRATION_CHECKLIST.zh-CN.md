# Typed Target Program Writer 下一阶段实施清单

## 0. 文档定位

- 本文档对齐当前最新实现。
- 第一阶段的 API 收口已经完成，本阶段不再讨论 `engine` / `history` / `collab` 对外接口改名问题。
- 本文档只描述后续还要继续砍掉的内部层，以及 typed target 终态要怎么落地。

## 1. 当前基线

### 1.1 已完成的收口

- shared mutation runtime 对外主写入入口已经收口为 `apply(program)`。
- dataview / whiteboard engine 对外写入入口已经同步收口为 `apply(program)`。
- history / collab 相关调用面已经跟随 `apply(program)` 收口。
- shared 顶层公开导出面已经移除旧 structural authored-op 相关导出。
- `shared/mutation/src/engine/program/materialize.ts` 已删除。
- 已经不再要求测试通过旧 authored structural operation 喂写入主链。

### 1.2 当前还剩的核心问题

- shared program 的 `ordered/tree` step 仍然使用 `structure: string`，typed target 还没落地。
- shared registry 仍然是 `entities + structures` 模型，不是 typed target registry。
- dataview 仍然依赖 prefix string target 协议。
- dataview 仍然通过 `createDataviewProgramWriter(...)` 暴露 domain writer facade。
- dataview 的 `compile/viewDiff.ts` 仍承担第二套 writer orchestration。
- whiteboard compile / planner 仍然直接操作 `MutationProgramWriter<string>`。
- whiteboard 仍然通过 `canvas.order`、`edge.labels:${id}`、`mindmap.tree:${id}` 这类字符串 target 工作。
- whiteboard 主实现目录仍然是 `operations/`，`mutation/` 目录还没有真正承接主链。
- `shared/mutation/src/engine/structural.ts` 内部仍保留一层 `program effect <-> 旧 structural op` 的转换实现。

## 2. 本阶段硬约束

- 不恢复任何 authored structural operation public API。
- 不恢复 `program -> operation[]` 的 authored 回翻译链。
- 不保留两套 authored 写入抽象。
- 不把 `string structure` 继续包装成“伪 typed target”的 public surface。
- 不把 domain writer facade 继续当长期边界。
- 允许短期 internal-only shim，但必须继续收薄，不能重新长成 shared 或 domain 边界的一部分。

最终唯一写入中轴固定为：

```ts
intent -> compile(reader, writer/ports) -> MutationProgram -> engine apply -> MutationDelta
```

## 3. 本阶段目标

### 3.1 shared/mutation

- `MutationProgram` 继续是唯一 authored write IR。
- `ordered/tree` step 从 `structure: string` 迁到 typed target。
- `defineMutationRegistry(...)` 改为 typed target registry declaration。
- `MutationProgramWriter` 继续可作为 shared 底层 builder 存在，但不再承担 typed 语义边界。
- `engine/structural.ts` 从“旧 structural op 兼容内核”收薄为“typed ordered/tree apply helper”。

### 3.2 dataview / whiteboard

- compile handler 最终直接写 typed target program。
- domain compile 不再显式处理 `structure` / prefix string target。
- domain 允许保留纯算法 helper、纯 diff helper、纯校验 helper。
- domain 不允许保留“把一种写入 IR 再翻译成另一种写入 IR”的 helper。

## 4. shared/mutation 实施项

### 4.1 引入 typed target program model

- 替换当前 `MutationOrderedProgramStep` / `MutationTreeProgramStep` 中的 `structure: string`。
- 新的 target descriptor 至少覆盖三类：
  - `entity`
  - `ordered`
  - `tree`
- target descriptor 需要携带：
  - family kind
  - family type
  - family key
  - entity id 或 ordered item / tree node 所需最小上下文

建议最小模型：

```ts
type MutationTarget =
  | {
      kind: 'entity'
      type: string
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
```

### 4.2 重写 registry declaration

- 废弃当前 `entities?: ...` / `structures?: ...` 形态。
- 改为 typed registry：
  - `entity`
  - `ordered`
  - `tree`
- ordered/tree family 负责：
  - `read`
  - `write`
  - `identify`
  - `clone`
  - `patch`
  - `diff`
  - `change`
- entity family 负责：
  - `read`
  - `write`
  - `patch`
  - `diff`
  - `change`

### 4.3 收薄 structural runtime

- `engine/structural.ts` 不再维护 `effect <-> structural canonical operation` 双向转换层。
- ordered/tree apply 的内部实现直接消费 typed target program step。
- inverse 直接生成 typed target program step。
- `MutationStructuralCanonicalOperation` 以及 `createStructural*Operation` 不再作为 shared 内部主模型存在。
- 如果个别过渡 helper 还需要旧结构，必须局部私有化在文件内，不能继续经由 contracts / engine index 传播。

### 4.4 收口 shared 内部公开面

- shared 顶层已经不再公开旧 structural authored-op；本阶段继续清理次级公开面和内部依赖传播。
- 后续要收掉的对象包括：
  - `engine/contracts.ts` 中的 `MutationStructuralCanonicalOperation` 及相关旧 structural op type
  - `engine/index.ts` 对 `applyStructuralEffectResult` 的再导出
  - `engine/structural.ts` 中围绕旧 structural op 的 constructor / lowering helper
- 目标不是“删除一个文件名”，而是让 shared 内部不再把旧 structural op 当作中间语义层。

## 5. dataview 实施项

### 5.1 compile surface 继续收口

- `createDataviewProgramWriter(...)` 仍是当前 compile 主入口，需要在后续阶段下沉。
- `compile/index.ts` 最终不再传 `createProgram: createDataviewProgramWriter`。
- compile handler 最终直接拿 dataview typed ports 或 typed target writer。

目标调用面：

```ts
input.program.record.create(record)
input.program.fieldOptions(fieldId).insert(option, anchor)
input.program.viewFilter(viewId).move(ruleId, anchor)
```

### 5.2 去掉 prefix string target 协议

- 删除下列 prefix 协议及其解析职责：
  - `FIELD_OPTIONS_STRUCTURE_PREFIX`
  - `VIEW_ORDERS_STRUCTURE_PREFIX`
  - `VIEW_DISPLAY_FIELDS_STRUCTURE_PREFIX`
  - `VIEW_FILTER_RULES_STRUCTURE_PREFIX`
  - `VIEW_SORT_RULES_STRUCTURE_PREFIX`
- `targets.ts` 改成 typed target family declaration，而不是 `structure.startsWith(...)` resolver。

### 5.3 收口 view diff 编排层

- `compile/viewDiff.ts` 不再承担 writer orchestration 文件角色。
- `writeViewUpdate / writeViewDisplayInsert / writeViewOrderInsert` 要么：
  - 合并回 `compile/view.ts`
  - 要么下沉为纯值级 diff helper
- 允许保留：
  - 纯 view diff 算法
  - 纯 clone / normalize helper
- 不允许保留：
  - 直接依赖 domain writer facade 的二次编排层

### 5.4 目录收口

- `dataview/packages/dataview-core/src/mutation` 最终只保留：
  - `compile/`
  - `targets/`
  - `index.ts`
- `programWriter.ts` 删除或彻底下沉为 internal-only。
- `program.ts` 如无额外必要，合并或删除。
- `targets.ts` 拆成 `targets/` 目录。

## 6. whiteboard 实施项

### 6.1 compile surface 继续收口

- compile context 不再长期暴露 `MutationProgramWriter<string>`。
- `compile/write.ts` 不再承担 “domain API -> raw writer calls + string structure” 翻译层。
- compile / planner 最终直接写 whiteboard typed ports。

目标调用面：

```ts
input.program.node.create(node)
input.program.canvasOrder().splice(refs, anchor)
input.program.edgeLabels(edgeId).patch(labelId, patch)
input.program.mindmapTree(mindmapId).insert(nodeId, parentId, index, value)
```

### 6.2 去掉字符串 target 构造协议

- 删除或内部化以下字符串协议常量：
  - `CANVAS_ORDER_STRUCTURE`
  - `EDGE_LABELS_STRUCTURE_PREFIX`
  - `EDGE_ROUTE_STRUCTURE_PREFIX`
  - `MINDMAP_TREE_STRUCTURE_PREFIX`
- `targets.ts` 改成 typed target family declaration，不再使用：
  - `structure === ...`
  - `structure.startsWith(...)`

### 6.3 custom/planner 收口

- `custom` 如继续保留，只承载纯领域 planner / algorithm。
- planner 直接吃：
  - `reader`
  - `typed writer / ports`
  - `services`
- planner 不再知道字符串 target 协议。
- planner 不再自己决定 `MutationProgramWriter` 的 ordered/tree 原语。

### 6.4 目录重组

- `whiteboard/packages/whiteboard-core/src/operations` 的实现迁入 `src/mutation`。
- `src/mutation/index.ts` 不再是空壳。
- 目标目录为：
  - `mutation/compile`
  - `mutation/targets`
  - `mutation/planner`
  - `mutation/validate`
  - `mutation/index.ts`

## 7. 建议实施顺序

### 7.1 第一批：shared 内部瘦身

- 把 `engine/structural.ts` 从旧 structural op 转换层收薄成纯 ordered/tree apply helper。
- 删掉次级公开面上的旧 structural op type / helper 传播。
- 保证 shared 内部不再把旧 structural op 当主中间层。

### 7.2 第二批：shared typed target 落地

- 引入 typed target step model。
- 改 registry declaration。
- 让 apply / inverse / delta/change 跑通 typed target。

### 7.3 第三批：dataview 接入

- 把 dataview registry 改成 typed family declaration。
- 替换 compile context 为 typed ports / typed writer。
- 删除或下沉 `createDataviewProgramWriter(...)`。
- 清空 `viewDiff.ts` 的 orchestration 职责。
- 完成目录收口。

### 7.4 第四批：whiteboard 接入

- 把 whiteboard registry 改成 typed family declaration。
- 替换 compile / planner context 为 typed ports / typed writer。
- 清空 `compile/write.ts` 的字符串 target 翻译职责。
- 把实现从 `operations/` 迁到 `mutation/`。

## 8. 完成标准

- shared 顶层与次级公开面都不再传播旧 structural authored-op 模型。
- `engine/structural.ts` 不再保留 `effect <-> 旧 structural op` 双向转换层。
- shared program step 不再包含裸 `structure: string`。
- shared registry 不再使用 `structures` resolver。
- dataview compile 不再依赖 domain writer facade 主入口。
- dataview 不再存在 prefix string target 协议。
- dataview 不再存在 compile 下的二次 writer orchestration 文件。
- whiteboard compile / planner 不再显式使用 `MutationProgramWriter<string>`。
- whiteboard 不再存在字符串 target constructor 作为 compile 依赖。
- whiteboard 主实现目录改为 `mutation/`，`operations/` 不再承载写入主链。
- dataview 与 whiteboard 都直接基于 typed target program 写入 shared 主链。

## 9. 非目标

- 本阶段不回头恢复任何旧 authored operation API。
- 本阶段不回头恢复 `materialize` 一类 authored 回翻译能力。
- 本阶段不单独优化 projection、UI、业务语义。
- 本阶段主要处理 shared 内部瘦身、typed target 落地、domain compile 收口。

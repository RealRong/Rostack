# Dataview Compile / Mutation 深度收口最终方案

## 1. 目标

- `dataview-core` 的 compile API 必须一步到位收敛为长期最优形态。
- `dataview/packages/dataview-core/src` 根目录不再散落 mutation / compile 相关文件。
- compile 链只保留一套读写中轴，不再出现重复的参数形态、重复的 lookup helper、重复的零散 re-export。
- 不保留兼容层，不保留过渡目录，不保留双入口。

## 2. 最终 API 设计

### 2.1 compile 入口

最终只保留：

```ts
export interface DataviewCompileContext<
  TIntent extends Intent = Intent,
  TOutput = unknown
> extends MutationCompileHandlerInput<
  DataDoc,
  TIntent,
  DataviewProgramWriter,
  TOutput,
  DocumentReader,
  void,
  ValidationCode
> {
  document: DataDoc
  reader: DocumentReader
}
```

约束：

- compile handler 一律只收一个 `input`。
- 禁止继续使用 `(intent, input, reader)` 三参风格。
- `document` 直接挂在 compile context 上，compile 文件内不再到处 `reader.document()`。

最终形态：

```ts
export const compileRecordIntent = (
  input: DataviewCompileContext<RecordIntent>
) => { ... }

export const compileFieldIntent = (
  input: DataviewCompileContext<FieldIntent>
) => { ... }

export const compileViewIntent = (
  input: DataviewCompileContext<ViewIntent>
) => { ... }
```

### 2.2 读中轴

只保留一个读中轴：`input.reader`。

明确禁止：

- `input.read.xxx`
- 第二套 compile read facade
- 局部 `requireView / requireField / requireCustomField / requireOptionField / resolveTarget` 到处复制

最终原则：

- 读能力直接挂到 `DocumentReader` 的 domain 分组上。
- compile 负责决定如何报错；reader 只负责纯读，不带 side effect。

最终方向示例：

```ts
input.reader.document()
input.reader.records.get(id)
input.reader.records.resolveTarget(target)
input.reader.records.requireIds(ids)
input.reader.fields.get(id)
input.reader.fields.custom(id)
input.reader.fields.optionHost(id)
input.reader.views.get(id)
input.reader.views.active()
```

说明：

- `reader` 可以做厚，但不能变成 compile 专属对象。
- `reader` 返回 `undefined` 或纯结果，不直接 `issue`。
- compile 侧最多保留一个泛型 `expect(...)`，用于“判空并报错”。

### 2.3 compile 基础能力

`mutation/compile/base.ts` 只保留非常薄的基础设施：

- `pushIssue`
- `issue`
- `reportIssues`
- `expect`
- `withOutput`，仅在确实需要时保留

明确禁止：

- 在 `base.ts` 里继续堆 domain 级 helper
- 再长出 `requireView / requireField / requireGroupedField / requireRecordIds`
- 再长出第二套 `read` namespace

`expect` 的目标形态：

```ts
const view = expect(input, input.reader.views.get(input.intent.id), {
  code: 'view.notFound',
  message: `Unknown view: ${input.intent.id}`,
  path: 'id'
})
```

### 2.4 view compile 的最终职责

`compile-view` 不再自己承担完整 view 生命周期。

最终 compile-view 只做四件事：

1. 读取当前 view / field / record。
2. 调用 `view` domain 写接口生成 candidate。
3. 调用统一 `finalize + validate`。
4. 把 `current -> next` 写成 program。

明确禁止继续保留在 compile-view 本地的大块职责：

- 本地 `validateSearch / validateFilter / validateSort / validateGroup / validateDisplay / validateViewOptions / validateOrders / validateCalc / validateView`
- 本地 `normalizeView`
- 本地 `ensureKanbanGroup`
- 本地 `finalizeView`

这些必须回收到 `view` domain。

最终应该形成：

```ts
const next = viewDomain.finalize(candidate, {
  fields: input.reader.fields.list(),
  records: input.reader.records.list()
})

reportIssues(input, ...viewDomain.validate(next, input.source))
writeViewProgram(input.program, current, next)
```

### 2.5 program writer / delta / internal adapters 的定位

它们都属于 mutation 目录，不再放在 `src` 根。

最终归属：

- `programWriter` 是 dataview 的 typed mutation writer
- `program` 是 dataview 的 program type alias
- `delta` 负责 dataview 自己的 typed delta facade
- `adapters` 负责 dataview mutation 内部 structural adapters

这些是同一层能力，不应继续散落在根目录。

补充约束：

- dataview 不再暴露 `FIELD_OPTIONS_STRUCTURE_PREFIX` 这类 prefix 常量。
- dataview 不再暴露或手写 `MutationPathCodec`。
- dataview 不再依赖 shared public `structures / schema / codec` 模型。
- dataview mutation 必须基于 [SHARED_MUTATION_KERNEL_SIMPLIFICATION_FINAL_PLAN.zh-CN.md](/Users/realrong/Rostack/SHARED_MUTATION_KERNEL_SIMPLIFICATION_FINAL_PLAN.zh-CN.md) 的 shared kernel 方向实现。

### 2.6 dataview mutation 最终约束

dataview mutation 层不再接受以下长期模型：

- `xxxStructure(id) => string`
- `const XXX_PREFIX = '...'`
- `structure.startsWith(...)`
- `structure.slice(...)`
- `MutationPathCodec.parse/format`
- shared public `defineEntityMutationSchema`
- shared public `createDeltaBuilder`
- shared public `MutationStructureSource`

最终应该形成：

```ts
writer.field.option.insert(fieldId, option, { before })
writer.field.option.move(fieldId, optionId, { before })
writer.view.order.move(viewId, recordId, { before })
writer.view.display.splice(viewId, fieldIds, { before })
writer.view.filter.patch(viewId, ruleId, patch)
```

以及：

```ts
type DataviewMutationDelta = {
  field: {
    schema(id: FieldId): {
      changed(path?: 'options' | 'name' | 'kind'): boolean
    }
  }
  record: {
    values(id: RecordId): {
      changed(fieldId?: FieldId): boolean
    }
  }
  view: {
    query(id: ViewId): {
      changed(aspect?: 'search' | 'filter' | 'sort' | 'group' | 'order'): boolean
    }
    layout(id: ViewId): {
      changed(aspect?: 'display'): boolean
    }
  }
}
```

也就是：

- public API 只有 dataview writer 与 dataview delta facade
- structural adapter 只允许留在 `mutation` 内部
- shared 只提供执行内核，不再提供 public structure/schema/codec 模型

## 3. 最终目录结构

`dataview/packages/dataview-core/src` 最终只保留领域目录和少量包级入口。

```text
src/
  document/
  field/
  mutation/
    compile/
      index.ts
      base.ts
      contracts.ts
      patch.ts
      record.ts
      field.ts
      view.ts
      viewProgram.ts
    program.ts
    programWriter.ts
    delta.ts
    adapters.ts
    index.ts
  types/
  view/
  entities.ts
  index.ts
```

说明：

- 现在根下的 `compile.ts / compile-base.ts / compile-contracts.ts / compile-patch.ts / compile-record.ts / compile-field.ts / compile-view.ts / compile-view-ops.ts` 全部移入 `mutation/compile/`。
- 现在根下的 `program.ts / programWriter.ts / structures.ts` 全部移入 `mutation/`，其中 `structures.ts` 重写为 internal `adapters.ts`。
- `intent.ts` 和 `op.ts` 删除，不再作为根级跳板文件存在。

## 4. 包级出口策略

### 4.1 根级 `index.ts`

根级 `index.ts` 只允许做包级正式出口，不允许再做零散过桥。

最终目标：

```ts
export { entities } from './entities'
export * from './mutation'
export type * from './types'
```

明确禁止：

- `index.ts` 继续从 `compile`、`programWriter`、`intent`、`op` 这些散点路径逐个 re-export
- 依赖根级中转文件做二次转发

### 4.2 mutation 入口

最终由 `src/mutation/index.ts` 统一承接 mutation 相关出口：

- `compile`
- `createDataviewProgramWriter`
- `DataviewProgramWriter`
- `DataviewProgram`
- `DataviewMutationDelta`
- compile contracts types

明确不导出：

- internal `adapters`
- shared-style `schema / builder / structures`

### 4.3 types 入口

`Intent` / `Operation` 都回到 `types` 统一出口。

明确禁止：

- `src/intent.ts`
- `src/op.ts`

如果外部需要：

- `type Intent` 从 `@dataview/core/types` 导出
- `type Operation` 从 `@dataview/core/types` 导出

不再为它们额外造跳板文件。

## 5. 具体重构原则

### 5.1 compile API 收口原则

- 只收一个 `input`
- 只用 `input.reader`
- `document` 直接挂 `input.document`
- 输出只用 `input.output`
- 写 program 只用 `input.program`

### 5.2 helper 收口原则

允许保留的 helper 只有两类：

- 纯数据算法
- 统一基础设施

必须删除或下沉的 helper 特征：

- 名字是 `requireXxx`
- 名字是 `resolveXxx` 且本质是“读 + issue”
- 名字是 `validateXxx` 但只被 compile-view 本地使用
- 名字是 `normalizeXxx / finalizeXxx` 但属于领域语义

处理方式：

- 纯读能力并入 `DocumentReader`
- 领域语义并入 `field` / `view` domain
- compile 基础设施并入 `mutation/compile/base.ts`

### 5.3 view program diff 收口原则

`compile-view-ops.ts` 的职责是健康的，但命名和位置不对。

最终：

- 文件移动到 `mutation/compile/viewProgram.ts`
- 表意为 “View -> Program diff writer”
- 不再叫 `ops`
- 不再挂在 `src` 根

### 5.4 零散 re-export 收口原则

以下都属于应删对象：

- 根级跳板文件
- 同名薄转发文件
- 没有新增语义、只是 `export type * from ...` 的包内转发

具体要删：

- `src/intent.ts`
- `src/op.ts`
- 旧根级 compile 系列文件迁移后留下的壳

保留：

- `src/index.ts`
- `src/mutation/index.ts`
- `src/types/index.ts`
- `src/document/index.ts`
- `src/view/index.ts`
- `src/field/index.ts`

但这些 index 必须是“该目录的真实入口”，不能只是历史遗留跳板。

## 6. 实施方案

### Phase 1：目录收拢

- 新建 `src/mutation/compile/`
- 移动以下文件：
  - `compile.ts -> mutation/compile/index.ts`
  - `compile-base.ts -> mutation/compile/base.ts`
  - `compile-contracts.ts -> mutation/compile/contracts.ts`
  - `compile-patch.ts -> mutation/compile/patch.ts`
  - `compile-record.ts -> mutation/compile/record.ts`
  - `compile-field.ts -> mutation/compile/field.ts`
  - `compile-view.ts -> mutation/compile/view.ts`
  - `compile-view-ops.ts -> mutation/compile/viewProgram.ts`
- 移动以下文件：
  - `program.ts -> mutation/program.ts`
  - `programWriter.ts -> mutation/programWriter.ts`
  - `structures.ts -> mutation/adapters.ts`
- `mutation/index.ts` 改成统一 mutation 正式入口。
- `mutation/delta.ts` 定义 dataview 自己的 typed delta facade。
- `mutation/adapters.ts` 改为 internal structural adapters，不再延续 public prefix / codec / structure 方案。

验收标准：

- `src` 根不再散落 compile / program / structures 文件。
- 所有 mutation 相关实现都进入 `src/mutation/`。
- dataview mutation 目录设计与 shared kernel 极简模型一致。

### Phase 2：compile API 收口

- `DataviewCompileInput` 改名或直接升级为 `DataviewCompileContext`
- 在 compile 入口创建 `document`
- 所有 compile handler 改为单参 `input`
- 删除 `runCompileIntent(input, compileIntent)` 这类三参过桥

验收标准：

- compile 内部不再传 `intent, input, reader` 三参
- compile 文件直接用 `input.intent / input.reader / input.document`

### Phase 3：reader 收口

- 把 compile 层常用的纯读能力并入 `DocumentReader`
- 清理 `requireRecordIds / requireCustomField / requireOptionField / requireView / requireField / requireGroupedField / resolveTarget`

验收标准：

- compile 内部不再存在成组的 `requireXxx`
- compile 读路径统一走 `input.reader.xxx`

### Phase 4：view domain 收口

- 把 compile-view 本地的 `validate* / normalizeView / ensureKanbanGroup / finalizeView` 下沉回 `view` 目录
- compile-view 只保留 lowering 和 orchestration
- `viewProgram.ts` 只负责 `current -> next -> program`

验收标准：

- `mutation/compile/view.ts` 明显变薄
- view 领域规则不再滞留在 compile 层

### Phase 5：re-export 收口

- 删除 `src/intent.ts`
- 删除 `src/op.ts`
- 修改 `src/index.ts` 为最终正式出口
- 检查 `mutation/index.ts / types/index.ts` 是否已足以承接外部使用
- 删除迁移后遗留的壳文件或兼容转发

验收标准：

- 不再存在“只为跳板而存在”的根级文件
- mutation/types 出口单一清晰

### Phase 6：dataview mutation public API 收口

- `mutation/adapters.ts` 改为 internal structural adapters
- 删除 `FIELD_OPTIONS_STRUCTURE_PREFIX` 及同类常量
- 删除 `structure.startsWith/slice` resolver 逻辑
- 删除 dataview 对 shared public `schema / builder / structures / codec` 的依赖
- `mutation/delta.ts` 提供 dataview 自己的 typed delta facade
- dataview writer 的 structural steps 直接附带 dataview delta / footprint

验收标准：

- dataview mutation 层不再出现 prefix / codec / public structures 模型
- writer / compile / delta 读取都直接建立在 dataview writer 与 dataview delta facade 上

## 7. 最终状态判定

满足以下条件才算完成：

- `dataview-core/src` 根目录不再出现 compile / program / structures / intent / op 散点文件
- compile API 统一为单参 `input`
- 读中轴只有 `input.reader`
- compile 基础设施只有薄 `base.ts`
- view 的 normalize / finalize / validate 不再滞留在 compile 文件
- mutation 相关出口统一由 `src/mutation/index.ts` 承接
- 根级 `index.ts` 不再做零散 re-export
- dataview 不再手写 structure prefix 与 path codec
- dataview 不再依赖 shared public structures / schema / codec

## 8. 明确不做的事情

- 不保留兼容导出
- 不保留旧路径转发壳
- 不新增 `input.read`
- 不保留 `(intent, input, reader)` 三参 compile API
- 不在 compile-base 里继续堆 domain helper
- 不继续接受 prefix / codec / public structures 作为 dataview mutation 的长期模型

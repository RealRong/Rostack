# Dataview Compile / Writer 长期最优最终方案

## 最终结论

Dataview mutation 的长期最优形态不是继续保留：

- `compile -> next state -> viewDiff -> typed writer`
- `DataviewMutationPorts` 这类 dataview 私有 wrapper facade
- compile context 里把 typed writer 叫做 `program`
- `view/fields.ts` 这种以数组搬运为主的局部 helper 文件

而是收敛成下面四条：

1. compile 只负责领域校验、默认值、派生决策。
2. compile 直接调用 typed writer，不再先构造 `nextView` 再回编译成 writer steps。
3. compile context 里的 `program` 统一改名为 `writer`。
4. `MutationProgram` 作为低层 step batch 保留，`writer` 与 `program` 明确分层。

---

## 一、术语统一

### 1.1 `writer`

`writer` 指 compile 阶段拿到的 typed mutation writer facade。

典型调用：

```ts
input.writer.view.patch(viewId, { name })
input.writer.view.fields(viewId).move(fieldId, to)
input.writer.record.values(recordId).set(fieldId, value)
```

它是“写入接口”，不是“写入结果”。

### 1.2 `program`

`program` 只表示已经收集好的 low-level mutation steps：

```ts
type MutationProgram = {
  steps: readonly MutationProgramStep[]
}
```

它是 `writer.build()` 的产物，不是 compile 期间直接操作的 facade。

因此：

- shared low-level `MutationProgram` 保留现名
- `engine.apply(program)` 可以保留
- compile context 内部不能继续把 typed writer 命名为 `program`

### 1.3 Dataview 层命名

Dataview 自己的命名最终应统一成：

```ts
DataviewMutationWriter
createDataviewMutationWriter(...)
DataviewMutationProgram = MutationProgram<string>
DataviewMutationProgramStep = MutationProgramStep<string>
```

不再保留：

```ts
DataviewMutationPorts
createDataviewMutationPorts(...)
```

因为这里本质不是 “ports”，而是 compile 用 typed writer facade。

---

## 二、`DataviewMutationPorts` 是否还有必要

结论：**没有必要作为长期 public/internal 形态继续存在。**

当前 [dataview/packages/dataview-core/src/mutation/program.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/program.ts:52) 里的 `DataviewMutationPorts` 主要扩展了四类东西：

1. `record.writeValuesMany`
2. `fieldOptions(fieldId)`
3. `viewFields(viewId)`
4. `viewOrder(viewId)`

### 2.1 `fieldOptions / viewFields / viewOrder`

这三类本质上只是对现有 typed writer 的重命名包装：

```ts
modelWriter.field.options(fieldId)
modelWriter.view.fields(viewId)
modelWriter.view.order(viewId)
```

它们额外做的事情只有：

- 改一层名字
- 给 `insert/move/splice` 自动补 `end` anchor

这不是独立抽象价值，只是 facade duplication。

长期最优做法：

- 直接使用 model writer 原生 API
- 如果要支持“省略 anchor 默认 append”，就在 shared ordered writer 能力里定义默认行为
- 不要在 dataview 再包一层 `fieldOptions/viewFields/viewOrder`

因此这三类 wrapper 应删除。

### 2.2 `record.writeValuesMany`

这个扩展也不应该保留在 writer facade。

原因：

1. 它混入了 dataview 特有语义：`title` 特判。
2. 它混入了 batch orchestration：`set + clear + many records`。
3. 它不是“底层写入 primitive”，而是 compile 层的 convenience。

长期最优里，compile 应该自己决定展开成：

```ts
input.writer.record.patch(recordId, { title })
input.writer.record.values(recordId).set(fieldId, value)
input.writer.record.values(recordId).remove(fieldId)
```

如果未来确实需要 batch primitive，也应该在 shared typed writer 层增加通用批量原语，而不是保留 dataview 私有 `writeValuesMany`。

因此：

- `record.writeValuesMany` 删除
- `DataviewMutationPorts` 整体删除
- compile 直接使用 `DataviewMutationWriter`

---

## 三、compile context 的最终形态

当前 [shared/mutation/src/engine/contracts.ts](/Users/realrong/Rostack/shared/mutation/src/engine/contracts.ts:113) 和 [dataview/packages/dataview-core/src/mutation/compile/contracts.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/contracts.ts:44) 里，compile handler 输入仍然把第三个能力命名为 `program`。

长期最优应改成：

```ts
export interface MutationCompileHandlerInput<
  Doc,
  Intent,
  Writer,
  Output,
  Reader,
  Services = void,
  Code extends string = string
> {
  intent: Intent
  source: MutationCompileSource<string>
  document: Doc
  reader: Reader
  services: Services | undefined
  writer: Writer
  output(value: Output): void
  issue(...issues: readonly MutationCompileIssue<Code>[]): void
  stop(): { kind: 'stop' }
  invalid(...): { kind: 'block', issue: MutationCompileIssue<Code> }
  cancelled(...): { kind: 'block', issue: MutationCompileIssue<Code> }
  fail(...): { kind: 'block', issue: MutationCompileIssue<Code> }
}
```

Dataview compile context 最终应是：

```ts
export type DataviewCompileContext<
  TIntent extends Intent = Intent,
  TOutput = unknown
> = MutationCompileHandlerInput<
  DataDoc,
  TIntent,
  DataviewMutationWriter,
  TOutput,
  DataviewQuery,
  void,
  ValidationCode
> & {
  expect?: DataviewCompileExpect
}
```

同时 shared runtime 的：

- `createProgram` 改名为 `createWriter`
- `compileProgramFactory` 改名为 `compileWriterFactory`

但 `MutationProgram` / `MutationProgramWriter` 可以保留现名，因为它们描述的是 low-level step builder 与 step batch。

---

## 四、compile 的最终职责边界

compile 只做四件事：

1. 读取当前 document / reader state
2. 做领域校验
3. 解析默认值与派生值
4. 直接调用 typed writer

compile 不再负责：

1. 构造完整 `nextView`
2. 计算 `current -> next` diff
3. 把 diff 再翻译回 mutation writer steps

也就是不再允许：

```ts
current -> next -> writeViewUpdate(writer, current, next)
```

---

## 五、哪些 compile 可以大幅收缩

## 5.1 `view.ts`

当前 [dataview/packages/dataview-core/src/mutation/compile/view.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/view.ts:1) 里有两部分逻辑：

1. 真正需要的 compile 语义
2. 不需要的 next-state + diff 机制

### 必须保留的 compile 语义

- `view.create` 的默认 name / 默认 fields / 默认 options / kanban 默认 group
- `view.type.set` 的 type conversion 语义
- `view.remove` 对 `activeViewId` 的联动
- grouped view 的合法性检查
- field / record existence 校验
- order 语义里的 effective order 解释

### 必须删除的重复实现

- `emitViewUpdate`  
  [view.ts:143](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/view.ts:143)
- `updateExistingView`
- `patchGroupedView`
- `createViewUpdateHandler`
- `createGroupedViewHandler`
- `createTypedViewOptionsHandler`

这些 helper 的问题不是“抽象不好”，而是它们把 compile 绑死在“先构造 next view，再 diff 回 writer”的旧路线里。

### `view.ts` 的最终写法

目标形态是：

```ts
const view = expectView(...)
const field = expectField(...)

input.writer.view.patch(view.id, {
  name: nextName
})
```

以及：

```ts
input.writer.view.fields(view.id).move(fieldId, anchor)
input.writer.view.fields(view.id).ensure(fieldId, anchor)
input.writer.view.fields(view.id).clear()
```

而不是：

```ts
const nextView = { ...view, fields: ... }
writeViewUpdate(input.writer, view, nextView)
```

## 5.2 `field.ts`

当前 [dataview/packages/dataview-core/src/mutation/compile/field.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/field.ts:1) 里仍然通过 `writeViewUpdate(...)` 修复受影响 view：

- `field.setKind`
- `field.duplicate`
- `field.remove`

长期最优里这部分也不应保留 `viewDiff.ts`。

应改成：

- compile 先通过 `view.repair.*` 算出需要的领域结果
- 再直接对受影响 view 调用 typed writer

如果 repair 的结果很复杂，则把“repair plan”定义成显式 domain output，而不是 `nextView` 快照。

## 5.3 `record.ts`

当前 [dataview/packages/dataview-core/src/mutation/compile/record.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/record.ts:147) 在 record remove 时还会构造 next order，再回写 `writeViewUpdate(...)`。

长期最优中：

- compile 依旧负责“删记录时 view.order overlay 要同步裁剪”这个领域语义
- 但写法应直接落到 `writer.view.order(...)`
- 不再构造 `nextView`

---

## 六、`viewDiff.ts` 的最终结论

当前 [dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/mutation/compile/viewDiff.ts:1) 的职责是：

- patch `name/type/search/group/calc/options/filter.mode`
- diff `filter.rules`
- diff `sort.rules`
- diff `fields`
- diff `order`

这整个文件在长期最优方案里应删除。

原因：

1. typed writer 已经存在。
2. ordered mutation model 已经存在。
3. compile 不该再做一套“snapshot diff compiler”。

真正应该演进的是 writer 原语，而不是保留 `viewDiff.ts`。

---

## 七、writer 原语需要补什么

compile 想真正变薄，shared ordered writer 至少还缺下面几类高层原语：

### 7.1 `ensure`

用于“若不存在则插入，若已存在则移动到目标位置”。

典型场景：

- `view.fields.show`

目标 API：

```ts
writer.view.fields(viewId).ensure(fieldId, to?)
```

### 7.2 `clear`

用于清空 ordered family。

典型场景：

- `view.fields.clear`

目标 API：

```ts
writer.view.fields(viewId).clear()
writer.view.order(viewId).clear()
writer.field.options(fieldId).clear()
```

### 7.3 `replace`

用于直接替换整个 sequence。

典型场景：

- repair 结果已经是完整数组
- compile 不想自己算一遍最小 diff

目标 API：

```ts
writer.view.fields(viewId).replace(fieldIds)
writer.view.order(viewId).replace(recordIds)
```

注意：

- `replace` 是 writer primitive，不是 compile 的 `nextView` diff
- runtime 可以内部决定是否降解成 delete/insert/move，compile 不关心

---

## 八、`view/fields.ts` 这种 helper 哪些该删

当前 [dataview/packages/dataview-core/src/view/fields.ts](/Users/realrong/Rostack/dataview/packages/dataview-core/src/view/fields.ts:1) 里大部分函数都不是 dataview view 领域逻辑，而是 `sequence<FieldId>` 的通用数组操作。

长期最优应删除或下沉的有：

- `cloneViewFields`
- `sameViewFields`
- `replaceViewFields`
- `moveViewFields`
- `showViewField`
- `hideViewField`
- `clearViewFields`

这些应该进入：

- shared sequence / ordered utility
- 或 mutation ordered runtime / writer primitive

`view/fields.ts` 唯一可能保留的能力只有两类：

1. state normalize 入口  
   例如 `normalizeViewFields`
2. 真正的 view-specific 规则  
   如果将来存在的话

当前的 `resolveFieldInsertBeforeFieldId` 也不属于 document core 逻辑，更像 table/editor command 层的 anchor 计算，应移出 core view helper。

结论：`view/fields.ts` 不是长期稳定边界，最终应被明显缩小，甚至删除。

---

## 九、filter / sort / options 的最终方向

如果只做 compile 收缩，但保留：

- `view.filter.rules` 作为 record patch
- `view.sort.rules` 作为 record patch

那么 compile 仍然会残留一批“先算 next rules，再整块 patch 回去”的逻辑。

长期最优应该进一步把下面三类都做成 mutation model 上的 typed ordered family：

1. `field.options`
2. `view.filter.rules`
3. `view.sort.rules`

其中：

- `field.options` 已经是 ordered family
- `view.filter.rules`
- `view.sort.rules`

应该补齐到同样的层级

这样 compile 最终能直接写成：

```ts
input.writer.view.filterRules(viewId).insert(rule, to?)
input.writer.view.filterRules(viewId).patch(ruleId, patch)
input.writer.view.filterRules(viewId).move(ruleId, to?)
input.writer.view.filterRules(viewId).delete(ruleId)

input.writer.view.sortRules(viewId).insert(rule, to?)
input.writer.view.sortRules(viewId).patch(ruleId, patch)
input.writer.view.sortRules(viewId).move(ruleId, to?)
input.writer.view.sortRules(viewId).delete(ruleId)
```

这是 compile 大幅收缩的关键前提之一。

---

## 十、最终目录与 API 形态

## 10.1 dataview mutation 目录

最终建议：

```text
mutation/
  compile/
    contracts.ts
    context.ts
    field.ts
    record.ts
    view.ts
    index.ts
  writer.ts
  program.ts
  model.ts
  query.ts
  index.ts
```

约束：

- `writer.ts` 负责 typed writer facade
- `program.ts` 只负责 `MutationProgram` 类型别名与相关低层概念
- compile 不再依赖 `viewDiff.ts`

## 10.2 mutation index

最终导出应是：

```ts
export type { DataviewMutationWriter } from './model'
export { createDataviewMutationWriter } from './writer'
export type {
  DataviewMutationProgram,
  DataviewMutationProgramStep
} from './program'
```

不再导出：

```ts
DataviewMutationPorts
createDataviewMutationPorts
```

---

## 十一、最终约束

Dataview mutation 的最终状态必须满足下面这些条件：

1. compile context 使用 `writer`，不用 `program`。
2. Dataview facade 使用 `Writer` 命名，不用 `Ports`。
3. `MutationProgram` 作为 low-level step batch 保留。
4. compile 直接调用 typed writer。
5. `viewDiff.ts` 删除。
6. `view/fields.ts` 大部分 generic helper 删除或下沉。
7. `field.options / view.filter.rules / view.sort.rules / view.fields / view.order` 都收敛到统一 typed sequence writer 体系。

这才是一处定义、处处 typed 使用、没有第二套实现的长期最优形态。

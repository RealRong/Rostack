# Dataview Table Fill Bulk Commit 实现方案

## 结论

table fill 在大范围拖拽后 `pointer up` 卡顿，长期最优的方案不是继续抠 `usePointer.ts` 里的局部常数项，而是把 fill 从“React 侧拼一批通用 action，再让 engine 逐条展开执行”的链路，升级为“由 engine 原生支持的 bulk commit 路径”。

这次方案的核心判断只有一个：

- fill 的瓶颈不在 pointer 事件本身
- fill 的瓶颈也不在 React 选区绘制本身
- fill 的瓶颈在 `pointer up` 时同步执行的大批量 mutation / history / delta / active view 重算

最终目标是：

1. `pointer up` 只做一次 fill 规划、一次 bulk commit、一次派生重算
2. table fill 不再把大范围改值展开成海量细粒度 document operation
3. undo / redo 继续保持一次 fill = 一次原子提交
4. fill / paste / 批量编辑 / AI 批改值走同一条 bulk 写入中轴
5. `@dataview/table`、`@dataview/react`、`@dataview/engine` 的职责边界明确，不再混着做

一句话总结：

fill 的长期最优修法，是把“批量改值”升级为 engine 原生能力，而不是在 table hook 里继续修修补补。

---

## 为什么现在会卡

当前大范围 fill 的提交链路如下：

1. table 在 `pointer up` 时进入 `fillSelection()`
   - 文件：`dataview/packages/dataview-react/src/views/table/hooks/usePointer.ts`
2. `fillSelection()` 调用 `resolveFillActions()`
   - 这里会根据当前 grid selection 计算目标行、目标列、源值
3. React 层构造出一批 `Action[]`
   - `record.patch`
   - `value.set`
   - `value.clear`
4. `editor.dispatch(actions)` 进入 engine
   - 文件：`dataview/packages/dataview-engine/src/api/createEngine.ts`
5. planner 将 action 下沉为 document operations
   - 文件：`dataview/packages/dataview-engine/src/mutate/planner/records.ts`
6. `applyOperations()` 逐条 operation 执行 reducer / inverse / delta collect
   - 文件：`dataview/packages/dataview-core/src/operation/applyOperations.ts`
7. commit 结束后同步跑 index / active view 派生
   - 文件：`dataview/packages/dataview-engine/src/mutate/commit/runtime.ts`

卡顿的根因主要有两层。

### 1. React 已经做了一部分合并，但还不够

当前 `resolveFillActions()` 已经不是“每个 cell 一条 action”了。

它已经会：

- 按 field 聚合
- 对重复 record 去重
- 标题列走 `record.patch`
- 普通列走 `value.set` / `value.clear`

这说明最粗暴的放大量已经避免掉了，继续在这里优化 `Set`、`Map`、`filter`，收益有限。

### 2. engine 内部仍然按 record 展开

真正的主要开销在 engine：

- `value.set(target: records)` 会被 lower 成每个 record 一条 `document.value.set`
- `value.clear(target: records)` 会被 lower 成每个 record 一条 `document.value.clear`
- `record.patch(target: records)` 会被 lower 成每个 record 一条 document 级 patch

这意味着一次大 fill 的实际同步成本包含：

- planner 下沉和 operation 对象分配
- 每条 operation 的 inverse 构造
- 每条 operation 的 delta 收集
- 最终一次大的 index / view 派生

所以现在的成本模型更接近：

- 不可避免成本：被改到的 record 数量
- 可以消掉的额外成本：按 record 展开的 operation 数量及其附带对象开销

对大范围 fill 来说，后者非常大。

---

## 设计目标

### 1. 保持交互语义不变

这次优化不改变 fill 的用户语义：

- 拖拽时仍然有可视 preview
- `pointer up` 后一次性提交
- 一次 fill 对应一次 undo
- 标题列和普通字段的现有行为保持一致

### 2. 让 bulk mutation 成为 engine 中轴能力

bulk write 不能继续是 table 私有技巧，它必须沉到 engine。

fill 只是第一个消费者，后续还应该复用给：

- paste
- 多列批量编辑
- group bucket 批量改值
- 外部导入
- AI 批量改值

### 3. React 层只保留交互，不承担 bulk commit 细节

`@dataview/react` 的职责应该是：

- 处理 pointer / drag / preview
- 计算 fill 目标范围
- 把目标范围映射成一个抽象的 commit plan

它不应该继续负责：

- 拼装海量 mutation 细节
- 决定 engine 用什么粒度提交
- 为 engine 的历史 / delta / inverse 设计兜底

### 4. 不为了 fill 引入 table 专属后门

不应该新增“只有 table fill 才能调用”的 engine 特殊入口。

最优做法是：

- 引入一个通用的 record field bulk write action
- 在 planner / document operation 层引入对应的统一 bulk operation
- 让通用写入栈自然支持 fill

---

## 非目标

这次方案不处理以下问题：

1. fill 拖拽中的 preview 渲染样式升级
2. cell selection 与 row selection 的统一 runtime
3. 多视图跨域批量选择
4. 异步分块提交与可中断事务
5. 后台 worker 化 document reducer

这些问题后续都可以做，但不应阻塞这次 bulk commit 中轴落地。

---

## 最终分层

## 一、`@dataview/table`

只负责几何和范围。

职责：

- 处理 grid selection 的行列边界
- 计算 fill 目标范围
- 输出抽象的范围结构

不负责：

- record 去重
- title / custom field 语义
- mutation action 构造
- engine 提交

### 建议输出结构

```ts
export interface TableFillTargetRange {
  anchor: CellRef
  itemIds: readonly ItemId[]
  fieldIds: readonly FieldId[]
}
```

这个结构只表达“会影响哪些行、哪些列”，不包含数据写入语义。

当前 `dataview/packages/dataview-table/src/fill.ts` 更偏向直接产出 cell entries。

长期最优方案是把它改成“范围规划器”，不要直接返回每个 cell 的写入结果。

## 二、`@dataview/react`

只负责把交互范围映射成 commit plan。

职责：

- 从 `TableFillTargetRange` 中拿到目标 item ids / field ids
- 把 item id 映射成去重后的 `recordIds`
- 读取 anchor/source cell 的值
- 区分 title 字段与非 title 字段
- 输出一个共享的 bulk write 输入

### 最终共享输入结构

```ts
export interface RecordFieldWriteManyInput {
  recordIds: readonly RecordId[]
  set?: Partial<Record<FieldId, unknown>>
  clear?: readonly FieldId[]
}
```

约束：

- `recordIds` 已去重
- `set` 可以同时包含 title 与普通字段
- `clear` 可以同时包含 title 与普通字段
- `set` 与 `clear` 不允许指向同一个 `fieldId`

这份结构故意不区分：

- title patch
- value patch
- value clear
- fill
- paste
- 批量编辑

它只表达一件事：

- “把这些 fields 写到这些 records 上”

这层不再自己拼 `Action[]`，而是直接产出最终会交给 engine facade 的输入。

换句话说，React 的最终目标不是 `toFillActions(plan)`，而是：

```ts
resolveFillWriteManyInput(...): RecordFieldWriteManyInput | undefined
```

## 三、`@dataview/engine` / `@dataview/core`

真正负责 bulk commit。

职责：

- planner 将多 record action lower 为 bulk document operations
- reducer 一次循环处理整批 records
- inverse / history 以 bulk 结构保存
- delta collector 对 bulk op 做一次性收集
- commit 后仍然只进行一次 index / view 派生

这是这次性能优化的真正中轴。

---

## 最终 API 设计

这次最终 API 设计的原则只有三条：

1. 整条路径只共享一份 bulk write payload
2. 对外不暴露 title / values 的内部裂缝
3. fill 不拥有专属 API，复用通用 record field bulk write

也就是：

- React 产出的输入，直接就是 engine facade 的输入
- engine facade 的输入，直接就是 public action 的输入
- planner 下沉后，直接就是内部 document bulk op 的输入

不再在中间发明：

- `TableFillCommitPlan`
- `toFillActions(plan)`
- `value.patchMany` / `record.patchMany` / `value.clearMany` 三套并行 payload

最终只保留“一种批量字段写入”的抽象。

## 1. 对外 facade API

最终对外 API 直接收敛到 `RecordsApi.fields`。

```ts
export interface RecordFieldWriteManyInput {
  recordIds: readonly RecordId[]
  set?: Partial<Record<FieldId, unknown>>
  clear?: readonly FieldId[]
}
```

```ts
export interface RecordsApi {
  get(recordId: RecordId): DataRecord | undefined
  create(input?: {
    values?: Partial<Record<CustomFieldId, unknown>>
  }): RecordId | undefined
  remove(recordId: RecordId): void
  removeMany(recordIds: readonly RecordId[]): void
  fields: {
    set(recordId: RecordId, fieldId: FieldId, value: unknown): void
    clear(recordId: RecordId, fieldId: FieldId): void
    writeMany(input: RecordFieldWriteManyInput): void
  }
}
```

最终这里不再继续扩展 `records.values`。

原因很直接：

- `values` 这个名字天然排斥 title
- fill / paste / bulk edit 实际上操作的是 record fields，不只是 custom values
- 如果继续沿用 `values.patchMany`，就得在 title 上打补丁或分叉

长期最优方案是直接把语义讲清楚：

- 这是 record field write
- title 与普通字段同层
- facade 不暴露底层 `record.title` 与 `record.values[fieldId]` 的内部差异

### 为什么只给一个 `writeMany()`

不拆成：

- `patchMany`
- `clearMany`
- `fillMany`

原因是：

1. `set + clear` 已经能覆盖所有批量写值场景
2. `writeMany()` 可以直接复用给 fill / paste / bulk edit
3. 少一个 API，调用方少一次选择分支

如果 payload 为空：

- `recordIds.length === 0`
- `set` 为空
- `clear` 为空

则 facade 直接 no-op。

## 2. React 与 engine 之间的最终接口

table fill 最终不再调用 `editor.dispatch(actions)`。

而是直接调用：

```ts
editor.records.fields.writeMany(input)
```

这里的 `input` 就是 React 侧产出的 `RecordFieldWriteManyInput`。

这条边界的意义是：

- table 不感知 action 细节
- table 不感知 internal operations
- table 只感知“我要对这些 records 做一批 field writes”

这也是整条路径里最重要的降复杂度点。

## 3. public action

为保证 engine 写入栈继续统一通过 `dispatch` 进入，public action 层新增且只新增一个 bulk action：

```ts
type Action =
  | ...
  | {
      type: 'record.fields.writeMany'
      recordIds: RecordId[]
      set?: Partial<Record<FieldId, unknown>>
      clear?: FieldId[]
    }
```

这个 action 的语义与 `RecordFieldWriteManyInput` 保持一模一样。

也就是说：

- facade 输入是什么
- action payload 就是什么

不再在 facade 和 action 之间做第二次模型翻译。

## 4. internal document operation

`@dataview/core/contracts/operations.ts` 新增且只新增一个 bulk write op：

```ts
type DocumentRecordFieldsWriteManyOperation = {
  type: 'document.record.fields.writeMany'
  recordIds: RecordId[]
  set?: Partial<Record<FieldId, unknown>>
  clear?: FieldId[]
}
```

它的语义与 public action 仍然保持一致。

planner 的职责不是改 shape，而只是：

- 校验
- 归一化
- 去重
- lower 到内部 document op

---

## Planner 改造

## 1. lower 规则

planner 的目标不再是把 bulk action 展开成“每个 record 一条 operation”，而是直接保留 bulk 粒度。

### 最终 lower 规则

改造后应为：

- `record.fields.writeMany` -> 1 个 `document.record.fields.writeMany`

这一步是整个方案里收益最大的改造点。

## 2. planner 的职责边界

planner 依然负责：

- `recordIds` 去重
- field 存在性校验
- issue 收集
- `set` / `clear` 冲突校验

但它不再负责：

- 把多 record action 细碎地展开成大量单 record op

也就是说，planner 保持语义校验器身份，不再充当放大量制造器。

---

## Reducer 改造

## 1. bulk op 的 reducer 行为

在 `@dataview/core/operation/reducer.ts` 中，只需要为一个 op 增加分支：

### `document.record.fields.writeMany`

行为：

- 对 `recordIds` 做一次循环
- 对每个 record：
  - 先应用 `clear`
  - 再应用 `set`
- 当 `fieldId === 'title'` 时写 `record.title`
- 其他字段写入 `record.values[fieldId]`

## 2. 为什么 reducer 层必须支持 bulk

如果 bulk 只停留在 action 层，而 reducer 仍然按单 record op 执行，那么：

- inverse 还是得构造很多对象
- delta 还是会按细粒度重复 collect
- `applyOperations()` 还是要循环很多次

所以 bulk 必须沉到 document operation 层，收益才完整。

---

## Inverse / History 改造

## 1. undo 仍然要保持一次 fill = 一次历史记录

不能为了性能把大 fill 分裂成多次 commit。

否则会直接破坏：

- 一次 fill 一次 undo
- 提交原子性
- 用户心智

## 2. inverse 结构建议

`buildInverseOperations()` 需要为 bulk op 提供专用 inverse。

最终只增加一个 restore 类 op：

- `document.record.fields.restoreMany`

restore op 的 entries 粒度建议是“每个 record 一条字段恢复项”，例如：

```ts
type DocumentRecordFieldsRestoreManyOperation = {
  type: 'document.record.fields.restoreMany'
  entries: Array<{
    recordId: RecordId
    set?: Partial<Record<FieldId, unknown>>
    clear?: FieldId[]
  }>
}
```

这里的目标不是把 inverse 变成 0 成本，而是：

- 只在一次 bulk op 里做一趟旧值采集
- 避免把每个字段变化都变成一条独立 inverse op

## 3. 为什么不把 undo 简化成“重新跑统一反向 patch”

因为 fill 之前每个 record 的旧值可能都不同。

所以 undo 不可能只用一个统一 `set/clear` 表达，必须保留每个 record 的旧值差异。

但这并不意味着要回到旧方案的“每个 record-field 一条 op”。

`restoreMany` 仍然是更低复杂度、更低对象量的表达。

---

## Delta Collector 改造

## 1. 当前问题

现在 delta collect 会跟着 operation 数量走。

当 planner 把一个 fill 展成很多单 record op 时，collector 也会反复工作。

## 2. 目标

bulk op 应该只触发一次 collect。

也就是：

- 一个 `document.record.fields.writeMany` -> 一次 collector.collect

这样至少能把 collect 的调用次数从“目标 record 数量级”降到“每次 bulk commit 一次”。

## 3. 不需要追求更激进的 collector 重写

第一版不需要先重做整套 delta collector。

只要 bulk op 能作为单次 reducer / 单次 collect 的输入，收益已经足够大。

collector 的进一步压缩可以后续再做。

---

## React Table 侧改造

## 1. 从 `resolveFillActions()` 改成 `resolveFillWriteManyInput()`

当前 React 侧 helper 名字已经暴露了一个问题：

- 它直接返回的是 mutation 细节

这让交互层被迫知道太多 mutation 细节。

建议改为：

```ts
resolveFillWriteManyInput(...)
```

它只输出共享的 `RecordFieldWriteManyInput`。

随后直接调用：

```ts
editor.records.fields.writeMany(input)
```

这样可以把交互层与 mutation 细节彻底断开。

## 2. fill 拖拽过程仍然可以继续复用现有 grid selection preview

这不是当前性能瓶颈。

所以第一阶段不需要先为了架构洁癖改掉预览态。

也就是说：

- pointer drag 期间，仍可继续用 grid selection 更新预览区域
- `pointer up` 时再生成 commit plan 并提交

## 3. 第二阶段可选：把 fill preview 从 committed selection 中拆出来

这一步不是主药，但长期会让结构更干净。

目标是区分：

- committed grid selection
- fill drag preview selection

这样后续如果要做：

- fill hover preview
- 大范围 fill 的更轻量预览
- 与 value editor / copy handle 的联动

会更自然。

但这一步不必阻塞 bulk commit 落地。

---

## 建议的阶段化落地顺序

## 阶段 1：先补性能观测

在不改行为的前提下，先把 fill 提交拆成可观测阶段：

1. fill range resolve
2. React commit plan build
3. engine planner
4. applyOperations
5. deriveIndex
6. deriveViewRuntime

目标：

- 确认大表 fill 的主耗时占比
- 给后续改造提供对比基线

## 阶段 2：React 侧切到 shared input + facade

把 `resolveFillActions()` 改成 `resolveFillWriteManyInput()`。

目标：

- React 不再产出 `Action[]`
- React 直接产出 `RecordFieldWriteManyInput`
- table 直接调用 `editor.records.fields.writeMany(input)`

收益：

- 代码边界先理顺
- title / values 的内部分裂不再泄露到 table 层

注意：

- 这一阶段的性能收益有限
- 真正的大头还在 engine bulk op / reducer / inverse / delta

## 阶段 3：engine planner 下沉为 bulk operations

这是主改造。

要做的事：

1. 新增 bulk document operations
2. planner lower 逻辑切到 bulk op
3. reducer 支持 bulk op
4. inverse / restoreMany 支持 bulk op
5. delta collector 以 bulk op 为输入

收益：

- 把 operation 数量从 O(records) 压到 O(1)
- 显著减少对象分配、inverse 构造和 collect 次数

## 阶段 4：把 paste 复用到同一 bulk path

paste 和 fill 的语义不同，但它们都属于“批量写值”。

区别是：

- fill：所有目标 record 写入同一组值
- paste：每个目标 cell 的值可能不同

两者仍然可以复用同一条中轴，只是 payload 形式不同：

- fill 使用 shared patch
- paste 使用 entry list 或 row-wise patch set

如果 bulk op 落地后不让 paste 复用，这条中轴仍然不够完整。

## 阶段 5：删除旧兼容路径

在 bulk 路径稳定后，删除旧的 `records.values` 兼容入口，只保留 `records.fields`。

这一步的目标不是性能，而是语义统一：

- 单值写与批量写使用同一个 namespace
- title 与普通字段都走同一套 facade 心智
- 后续调用方不再需要理解“title 不是 value”的内部实现细节

---

## 预计收益

## 1. `pointer up` 卡顿显著下降

最主要收益来自：

- operation 数量变少
- inverse 数量变少
- delta collect 次数变少

## 2. 大范围 fill 的开销从“按 record 展开”变成“按 bulk op 提交”

仍然要改很多 records，但外围框架开销会小很多。

## 3. 结构更可复用

这条路径一旦建好，不只 fill 受益，后续还可以接：

- paste
- 批量属性编辑
- group 批量归类
- 智能批量改值

## 4. undo / redo 语义更稳定

相比异步分块提交，bulk commit 保留了更干净的一次事务语义。

---

## 不选的方案

## 1. 继续微调 `resolveFillActions()` 的常数项

不选原因：

- 这层已经做了按 field 聚合和 record 去重
- 继续抠这层，收益远小于 engine bulk op

## 2. 把 fill 提交拆成异步分块

不选原因：

- 会破坏一次 fill 一次 undo 的心智
- 事务中断、失败恢复、选择状态同步都会复杂很多

## 3. 给 table 加一个私有的 `engine.fill(...)` 特殊入口

不选原因：

- 这会把 bulk mutation 能力封死在 table 内部
- paste / bulk edit / AI 批改没法自然复用

## 4. 只优化 view 派生，不优化 mutation 粒度

不选原因：

- 当前开销并不只在派生
- 前半段 operation / inverse / collector 的对象量同样大

---

## 需要修改的主要文件

第一阶段到第三阶段，大致会动到这些文件。

### table / react

- `dataview/packages/dataview-table/src/fill.ts`
- `dataview/packages/dataview-react/src/views/table/hooks/usePointer.ts`
- `dataview/packages/dataview-react/test/tableFill.test.ts`

### engine planner / commit

- `dataview/packages/dataview-engine/src/contracts/public.ts`
- `dataview/packages/dataview-engine/src/api/records.ts`
- `dataview/packages/dataview-engine/src/api/active.ts`
- `dataview/packages/dataview-engine/src/mutate/planner/records.ts`
- `dataview/packages/dataview-engine/src/mutate/commit/runtime.ts`

### core contracts / reducer / inverse / delta

- `dataview/packages/dataview-core/src/contracts/actions.ts`
- `dataview/packages/dataview-core/src/contracts/operations.ts`
- `dataview/packages/dataview-core/src/operation/reducer.ts`
- `dataview/packages/dataview-core/src/operation/history/inverse.ts`
- `dataview/packages/dataview-core/src/commit/collector.ts`

---

## 验证方案

## 1. 正确性测试

至少覆盖：

1. 单列 fill 到多行
2. 多列 fill 到多行
3. title fill
4. empty source -> clear
5. 重复 record 去重
6. grouped view / reordered view 下的 fill
7. 一次 fill 对应一次 undo / redo

## 2. 性能测试

建议补专门的 benchmark：

1. 1k records x 1 field fill
2. 10k records x 1 field fill
3. 1k records x 5 fields fill
4. 修改会影响 group / sort / filter 的字段

指标至少记录：

- planner ms
- applyOperations ms
- index ms
- view ms
- total commit ms

## 3. 交互验证

手动验证以下体验：

1. fill 拖拽过程中 preview 不抖动
2. `pointer up` 后主线程停顿显著下降
3. undo 后 selection / focus / scroll 行为不异常

---

## 最终建议

如果目标是“整条路径简单、性能好、中轴化、复杂度低、能复用”，唯一值得做的方案就是：

- table 只算 fill 范围
- react 只产出 fill commit plan
- engine / core 提供真正的 bulk mutation path

不要再把重点放在局部 `filter`、`Set`、`reduce` 优化上。

真正该修的是：

- mutation 粒度
- operation 粒度
- inverse 粒度
- delta collect 粒度

fill 只是入口，bulk commit 才是中轴。

# Dataview Group Write 长期最优拆分方案

## 1. 目标

本文只讨论 `3.2` 这一点，也就是：

- 为什么 `engine/projection/view/grouping.ts` 现在职责不够干净
- 长期最优应该怎么拆
- 哪些该下沉到 `core/group`
- 哪些应该继续留在 engine

这里不考虑兼容成本，不写过渡层，不考虑“小修小补”。

目标只有三个：

1. 可读性最高
2. 职责边界最稳定
3. 中轴复杂度最低


## 2. 当前问题

当前文件：

- `dataview/src/engine/projection/view/grouping.ts`

它实际上混了三类职责。

### 2.1 Group 写回语义

例如：

- section key 映射回 text value
- range key 映射回 number value
- status category 映射回 default option
- date bucket key 映射回 date value
- multiSelect 从 from bucket 移除、向 to bucket 添加

这些本质上都属于：

- “当前 group 规则下，bucket key 如何反推出字段值”

这不是 engine projection 的职责，而是 group 子系统本身的语义。


### 2.2 Section / appearance 结构工具

例如：

- `readSectionRecordIds`
- `resolveSectionRecordIds`

这些其实更像 projection 结构工具。

它们关心的是：

- section 有哪些 appearance
- appearance 对应哪些 record

这不是 group 写回语义。


### 2.3 Engine 使用层包装

例如：

- `createGrouping({ document, view, sections })`
- `resolveGrouping(document, viewId)`
- `Grouping { sections, next }`

这里的问题是：

- `sections` 是 projection 结构
- `next` 是 group write 语义

这两个概念不属于同一个抽象，却被绑进了同一个对象里。


## 3. 为什么这会让结构变差

### 3.1 `grouping.ts` 名字误导

看到 `engine/projection/view/grouping.ts`，直觉会以为它负责：

- grouped sections
- grouped layout
- grouped projection

但实际上它最关键的内容是：

- 拖拽/建卡后如何把 section key 回写到 field value

也就是说，名字像 projection，核心却是 writeback。


### 3.2 `core/group` 已经是语义中心，但 write 语义没进去

现在我们已经明确：

- group state 在 `core/group`
- group projection 在 `core/group`
- grouped records 在 `core/group`

但“group bucket 如何写回值”却留在 engine。

这会造成：

- `group` 的读语义在 core
- `group` 的写语义在 engine

边界不完整。


### 3.3 `resolveGrouping(document, viewId)` 隐藏了依赖和成本

这个 API 看起来很轻，但它其实会：

- 重新走 projection 解析
- 重新构建 sections
- 再包装出 `next`

从使用者视角，它看起来像一个便捷 helper，但实际上依赖链很深，不够透明。


### 3.4 `Grouping { sections, next }` 不是稳定抽象

长期稳定的抽象应该是“同一类概念的最小集合”。

但这里：

- `sections` 是“当前 view 的结构结果”
- `next` 是“group field 的写回规则”

它们只是碰巧在拖拽/建卡场景里一起出现，不应该长期合并成一个类型。


## 4. 长期最优边界

长期最优里，应把相关职责分成四层。

### 4.1 `core/group/state`

负责：

- group state normalize
- group state mutate
- bucket hidden / collapsed

不负责：

- grouped records
- writeback value
- engine command


### 4.2 `core/group/projection`

负责：

- view group projection
- grouped records
- bucket order / bucket display

不负责：

- 拖拽后如何改 record value
- command 生成


### 4.3 `core/group/write`

负责：

- 当前 field + group state 下
- 从 `fromSectionKey -> toSectionKey`
- 当前 record value 应该怎么变化

这是 `3.2` 最关键的新模块。


### 4.4 engine 使用层

负责：

- 从 current view / projection 拿上下文
- 调用 `group.write`
- 把结果翻译成 command
- 决定是否还需要 `view.order.move`

也就是说：

- core 只做语义
- engine 只做命令编排


## 5. 最理想的目录结构

建议最终变成：

```txt
dataview/src/core/group/
  state.ts
  projection.ts
  write.ts
  types.ts
  index.ts

dataview/src/engine/projection/view/
  sections.ts
  appearances.ts
  projection.ts

dataview/src/engine/services/
  view.ts
```

其中：

- `core/group/write.ts` 是新增重点
- `engine/projection/view/grouping.ts` 最终应删除


## 6. `core/group/write` 最理想的职责

它只回答一个问题：

- “把一个 record 从 bucket A 挪到 bucket B 后，group field 的值应该是什么？”

不要回答别的问题。

例如不要让它知道：

- `Command`
- `AppearanceId`
- `ViewProjection`
- `Section`
- `RecordId`


## 7. 最理想的 API

### 方案 A：最短直接式

```ts
group.write.next({
  field,
  group,
  currentValue,
  fromKey,
  toKey
})
```

返回：

```ts
type GroupWriteResult =
  | { kind: 'set'; value: unknown }
  | { kind: 'clear' }
  | { kind: 'invalid' }
```

这是我最推荐的形式。

原因：

- 简短
- 不引入额外对象生命周期
- 上下文明确


### 方案 B：先 create writer，再 next

```ts
const writer = group.write.create(field, group)
const result = writer.next(currentValue, fromKey, toKey)
```

优点：

- 如果单次批量操作里会重复调用，可以复用 field/group 解析结果

缺点：

- 多了一个对象层
- 对当前代码收益有限

如果以“长期最优、复杂度低”为优先，我更偏向方案 A。


## 8. `core/group/write` 内部应该包含什么

它内部应该承载当前 `grouping.ts` 里的这些语义：

- `text / title / url / email / phone`
  - empty bucket -> clear
  - other bucket -> set section key
- `number`
  - `range:start:interval` -> 写 `start`
- `select`
  - 写 option id
- `status`
  - mode = option -> 写 option id
  - mode = category -> 写该 category 的 default option id
- `boolean`
  - `'true' -> true`
  - `'false' -> false`
  - empty -> clear
- `date`
  - section key -> parse group key -> create date value
- `multiSelect`
  - 从 from bucket 删除
  - 向 to bucket 添加
  - 空集合 -> clear
- `asset / presence`
  - empty -> clear

这些语义本质上都属于 group write，不属于 engine projection。


## 9. Engine 层应该保留什么

engine 层需要保留两类东西。

### 9.1 Section 结构工具

例如：

- section record ids
- section beforeRecordId
- appearance -> recordId

这些是 projection 结构，不该下沉到 `core/group`。


### 9.2 Command adapter

例如在 `engine/services/view.ts` 中：

- move appearance
- create in section
- kanban create card
- kanban move cards

这里的职责应该是：

1. 找到目标 record
2. 调用 `group.write.next(...)`
3. 把结果翻译成：
   - `record.apply`
   - `value.apply`
4. 再决定是否追加：
   - `view.order.move`


## 10. 哪些 API 长期应该删除

### 10.1 `createGrouping`

它把：

- `sections`
- `next`

绑成一个对象，不是稳定抽象。

长期不建议保留。


### 10.2 `resolveGrouping(document, viewId)`

它隐藏了：

- projection 构建
- section 解析
- field/group read

长期不建议保留。

使用者应该显式拿到：

- view/group state
- field
- sections / appearances

再分别调用：

- `group.write.next`
- section helper


### 10.3 `Grouping` 类型

```ts
type Grouping = {
  sections: Section[]
  next(...)
}
```

长期不建议保留。

因为它不是单一概念。


## 11. 最小落地路线

如果要一步到位，但又不想过度设计，建议这样拆。

### 第一步

新增：

- `core/group/write.ts`

把当前 `grouping.ts` 里的这些函数移入：

- `nextTextValue`
- `nextNumberValue`
- `nextSelectValue`
- `nextStatusValue`
- `nextCheckboxValue`
- `nextDateValue`
- `nextMultiSelectValue`
- `nextPresenceValue`
- `createNext`

并改造成统一的：

- `group.write.next(...)`


### 第二步

在 `engine/services/view.ts` 中：

- 用 `group.write.next(...)` 替换 `grouping.next(...)`

涉及场景：

- `items.moveAppearances`
- `items.createInSection`
- `cards.createCard`
- `cards.moveCards`


### 第三步

把 section 读取 helper 移到更合适的位置，例如：

- `engine/projection/view/sections.ts`

保留：

- `readSectionRecordIds`
- 或等价 helper

但让它不再和 group write 绑在一起。


### 第四步

删除：

- `engine/projection/view/grouping.ts`

如果还有残余 helper，再拆给：

- `sections.ts`
- `services/view.ts`
- `core/group/write.ts`


## 12. 这条方案为什么不是过度设计

它没有引入：

- planner
- strategy registry
- transaction graph
- generic mutation framework

它只是把现在已经存在、但放错层的语义移回正确位置：

- group write 语义 -> `core/group/write`
- projection 结构工具 -> engine projection
- command 生成 -> engine service

这是“边界校正”，不是“抽象升级”。


## 13. 最终结论

`3.2` 最好的做法不是继续维护 `engine/projection/view/grouping.ts`，而是：

1. 把 bucket key -> next field value 的规则下沉到 `core/group/write`
2. 让 engine 只做 command adapter
3. 把 section record helper 留在 engine projection 侧
4. 删除 `Grouping { sections, next }` 这种混合抽象

一句话总结：

- `core/group` 负责“值应该怎么变”
- `engine` 负责“把这个变化写成命令”

这就是长期最优、复杂度最低、可读性最高的拆法。

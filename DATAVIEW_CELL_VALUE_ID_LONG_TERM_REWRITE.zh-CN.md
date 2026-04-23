# DATAVIEW Cell / Value Id 长期最优重构方案

## 前提

- 这份文档只讨论长期最优建模，不讨论兼容和过渡。
- 只要现有命名和边界阻碍长期最优，就应该直接删掉或改掉。
- 优先级不是“尽量少改”，而是：
  1. 先把语言分层摆正
  2. 再把基础设施命名收敛
  3. 最后删除低价值 helper 和别扭中间层

这里的核心问题不是“仓里有没有 id”，而是当前把两种完全不同的东西混在了一起：

- 一种是业务坐标
  - `itemId + fieldId`
  - `recordId + fieldId`
- 一种是基础设施 key
  - keyed store 的 key
  - membership store 的 key
  - patch / map / set 的 key

当前 `tableCellKey` / `recordValueKey`、`CellRef` / `RecordValueRef`、`tableCell` / `recordValueRef` 这套 API 半坐标、半 key、半 helper，语言不统一，所以会显得别扭。

## 现状判断

先说结论：

- 需要 `CellId`
- 需要 `ValueId`
- 但它们不应该取代 `CellRef` / `ValueRef` 成为主 public 语言

原因很直接。

### 1. `itemId` 不是 cell identity

`itemId` 只标识 row。

只要进入下面这些场景，row identity 就不够了：

- cell selection
- focus cell
- hover cell
- fill handle
- keyed membership store

这些状态都天然是 `(itemId, fieldId)` 级别，不是 `itemId` 级别。所以 `CellId` 是需要的，只是它的职责应该明确是“基础设施 key”，而不是“领域实体 id”。

### 2. `recordId` 不是 value identity

`recordId` 只标识 record。

只要 runtime 想把 document value source 做成 field 粒度，就必须区分：

- `recordId + fieldId`

所以 `ValueId` 也是需要的。否则每一层都只能继续拼字符串 key，或者把整个 record 当订阅单位。

### 3. 当前真正别扭的不是没有 id，而是语言混用

现在这套命名里：

- `CellRef` 是坐标对象
- `tableCellKey` 是 store key
- `tableCell()` 是对象构造 helper
- `RecordValueRef` 是坐标对象
- `recordValueKey` 是 store key
- `recordValueRef()` 是对象构造 helper

这让调用点很难一眼看出：

- 我现在拿的是坐标，还是 key
- 我现在在做业务逻辑，还是在做 store plumbing

所以长期最优不是“把所有地方都改成 id”，而是把这两层语言彻底拆开。

## 长期最优原则

### 1. public / cross-layer API 用结构化坐标

真正跨层流动的数据应该保留结构化坐标：

- `CellRef`
- `ValueRef`

因为 table 交互和渲染天然需要直接访问：

- `itemId`
- `fieldId`
- `recordId`

如果 public API 只暴露字符串 id，调用方就会反复 parse，再拿回坐标，长期只会更拧巴。

### 2. keyed store / membership / patch 内部用 `Id`

到了基础设施层，真正需要的是稳定 key：

- `CellId`
- `ValueId`

这一层的职责不是表达业务语义，而是：

- 做 keyed store 索引
- 做 membership patch
- 做 map / set key

所以这里应该显式用 `Id` 语言，而不是继续叫 `tableCellKey` 这种 implementation name。

### 3. `CellId` / `ValueId` 是派生 key，不是独立实体 id

这里必须明确：

- `CellId` 不是 document entity id
- `ValueId` 不是 document entity id
- 它们不是通过 generator 生成
- 它们不需要 entity table
- 它们不需要单独生命周期管理

它们只是：

- `CellRef -> CellId`
- `ValueRef -> ValueId`

的确定性映射。

也就是说，它们更接近“opaque key”，不是“业务主键”。

## 最终语言分层

长期最优里应该只有两层语言。

### 一. 坐标语言

用于：

- engine public API
- runtime model
- React 渲染与交互
- open / select / move / fill / reveal

最终建议：

```ts
export interface CellRef {
  itemId: ItemId
  fieldId: FieldId
}

export interface ValueRef {
  recordId: RecordId
  fieldId: FieldId
}
```

说明：

- `CellRef` 可以继续保留，不一定非要改名
- 但 `RecordValueRef` 太长，而且和 `CellRef` 不平行，长期最优应改成 `ValueRef`

### 二. Key 语言

用于：

- keyed store key
- keyed membership key
- diff / patch key
- map / set key

最终建议：

```ts
export type CellId = string
export type ValueId = string
```

这里不建议上 branded string，原因很简单：

- 这层本来就是基础设施 key
- 如果再引入 brand，会让 helper、patch、store 泛型都更重
- 收益远小于复杂度

这套 key 只要不对外滥用，普通字符串 alias 就够了。

## 最终 API

最终建议把 API 收敛成下面这一套。

```ts
export interface CellRef {
  itemId: ItemId
  fieldId: FieldId
}

export interface ValueRef {
  recordId: RecordId
  fieldId: FieldId
}

export type CellId = string
export type ValueId = string

export const cellId: (cell: CellRef) => CellId
export const valueId: (value: ValueRef) => ValueId

export const sameCell: (left: CellRef, right: CellRef) => boolean
export const sameOptionalCell: (
  left: CellRef | undefined,
  right: CellRef | undefined
) => boolean
```

如果还需要更低层的拆解 helper，可以保留 internal-only：

```ts
const parseCellId: (id: CellId) => CellRef
const parseValueId: (id: ValueId) => ValueRef
```

但这两个不应成为常规 public API。

长期最优原则是：

- 大多数代码只做 `Ref -> Id`
- 不鼓励大量 `Id -> Ref -> 再继续业务逻辑`

因为真正做业务时，通常一开始就应该拿着结构化坐标。

## 命名清理

这是最关键的一部分。

### 应该保留的

- `CellRef`
- `sameOptionalCell`

### 应该重命名的

- `RecordValueRef` -> `ValueRef`
- `tableCellKey` -> `cellId`
- `recordValueKey` -> `valueId`
- `sameCellRef` -> `sameCell`

### 应该删除的

- `tableCell(...)`
- `recordValueRef(...)`

原因很简单：

- 这两个 helper 只是“把两个参数包成对象”
- 它们没有真正抽象价值
- 反而让语言变得更碎

长期最优里，调用方应该直接写对象字面量：

```ts
const cell: CellRef = {
  itemId,
  fieldId
}
```

而不是：

```ts
const cell = tableCell(itemId, fieldId)
```

后者并没有减少复杂度，只是多引入一个名词。

## 各层职责

### Engine

Engine public API 应继续使用 `CellRef`。

例如：

- `engine.active.cells.set(cell, value)`
- `engine.active.cells.clear(cell)`

这里不应改成：

- `set(cellId, value)`
- `clear(cellId)`

因为 engine 命令天然需要结构化坐标。

### Runtime Source

`document.values` 这种 source 内部应该使用：

- public read key: `ValueRef`
- internal keyed store key: `ValueId`

也就是：

- `store.read(source.document.values, { recordId, fieldId })`
- source 内部再转成 `valueId`

这样 external API 仍然是坐标语言，内部实现才是 key 语言。

### Runtime Model

`table.cell`、`table.row` 这类 render artifact 仍然应该按坐标订阅：

- `table.cell.get({ itemId, fieldId })`

不应该要求 React 去传 `cellId`。

### React Table Runtime

React table runtime 里以下状态应该改用 `CellId`：

- selected membership
- focus membership
- hover membership
- fill membership

因为这几类状态本质都是 keyed membership。

但 React 组件 props 和交互输入仍然应该用 `CellRef`：

- `Cell` 组件拿 `cell: CellRef`
- `openCell` 拿 `cell: CellRef`
- pointer hit / DOM target 解析结果仍然返回 `CellRef`

## 明确不要做的事情

### 1. 不要把 `CellId` 当成一等领域实体

不要做：

- `createCellId()`
- `createValueId()`
- `cell entity table`
- `value entity table`

因为 cell/value 本来就不是 document 里的独立实体。

### 2. 不要让 public API 全部改成 id

不要做：

- `openCell(cellId)`
- `selectCell(cellId)`
- `engine.active.cells.set(cellId, value)`

这会让所有调用点都先 parse，再做真正逻辑，整体更差。

### 3. 不要继续保留 `tableCellKey` 这种旧命名

`xxxKey` 这种命名没有说清楚：

- 它是业务 key
- 还是 store key
- 还是 cache key

`CellId` / `ValueId` 反而更直接。

### 4. 不要为“简单包对象 helper”保留额外 API

`tableCell()`、`recordValueRef()` 这类 helper 长期都应该删掉。

因为它们不是抽象，只是噪音。

## 最终判断

一句话结论：

- 需要 `CellId`
- 需要 `ValueId`
- 但它们应该只是基础设施层的派生 key
- 主 public 语言仍然应该是 `CellRef` / `ValueRef`

如果继续沿用当前结构，最别扭的点会一直存在：

- 一会儿拿 `Ref`
- 一会儿拿 `Key`
- 一会儿拿 helper 构造对象
- 一会儿又自己拼字符串

长期最优只有一种做法：

- 用 `Ref` 表达坐标
- 用 `Id` 表达 store key
- 删除低价值 helper
- 统一命名，不再混用 `key` / `ref` / `tableCell` / `recordValue` 这几套不平行语言

## 推荐最终落点

如果一步到位，我建议最后收敛成：

```ts
export interface CellRef {
  itemId: ItemId
  fieldId: FieldId
}

export interface ValueRef {
  recordId: RecordId
  fieldId: FieldId
}

export type CellId = string
export type ValueId = string

export const cellId: (cell: CellRef) => CellId
export const valueId: (value: ValueRef) => ValueId

export const sameCell: (left: CellRef, right: CellRef) => boolean
export const sameOptionalCell: (
  left: CellRef | undefined,
  right: CellRef | undefined
) => boolean
```

并且明确删除：

- `RecordValueRef`
- `tableCellKey`
- `recordValueKey`
- `tableCell`
- `recordValueRef`
- `sameCellRef`

这才是长期最顺、最短、职责最清楚的一套模型。

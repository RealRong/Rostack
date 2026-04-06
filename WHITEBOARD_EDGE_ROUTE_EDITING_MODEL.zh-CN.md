# Whiteboard Edge Route 编辑模型

## 目标

whiteboard 的 edge route 编辑收敛为一套长期稳定、噪音低的协议：

- core 直接产出 route segment 的角色语义
- react 不再根据 `segmentIndex` 猜测 control / insert
- editor 统一以 `segment` 为拖拽目标，不再把显示语义和交互语义耦合
- `step + manual route` 的显示规则向 Miro 靠拢，但实现复杂度保持可控

## 最终模型

### Path Segment

`EdgePathSegment` 是 route 编辑的唯一几何来源：

```ts
type EdgePathSegment = {
  from: Point
  to: Point
  role: 'insert' | 'control'
  insertIndex: number
  insertPoint?: Point
  hitPoints?: readonly Point[]
}
```

语义：

- `insert`：外侧主段，显示为实心点
- `control`：内部控制段，显示为空心点

说明：

- `role` 由 core 计算
- UI 层只消费，不再二次推导

### Handle

route 编辑句柄收敛为：

```ts
type EdgeHandle =
  | { kind: 'end'; ... }
  | { kind: 'anchor'; ... }
  | {
      kind: 'segment'
      role: 'insert' | 'control'
      insertIndex: number
      segmentIndex: number
      axis: 'x' | 'y'
      point: Point
    }
```

说明：

- `anchor`：显式 route 顶点
- `segment`：段级编辑句柄
- `axis`：段的法向拖拽轴
  - 竖段 -> `x`
  - 横段 -> `y`

## 当前显示规则

### linear / curve

- 显示显式 `anchor`
- 显示 `insert`

### step + auto route

- 显示每个主段的 `insert`
- 不显示额外 control

### step + manual route

- 不显示显式 `anchor`
- 外侧段显示 `insert`
- 内部段显示 `control`

这保证用户看到的是“可插入段”和“控制段”，而不是原始 route 顶点噪音。

## 当前拖拽规则

### anchor

- 仅用于显式 route 顶点
- 可直接移动
- 支持删除

### segment

- `insert` 与 `control` 当前都走同一套段级拖拽协议
- 拖拽时只允许沿单轴移动
- 拖动结果直接重写 step manual polyline
- 提交时统一归一化：
  - 去重
  - 去共线冗余点
  - 空 route 回退为 `auto`

## Step Manual Role 规则

对于 `step + manual route`，segment role 规则固定为：

```txt
首段 -> insert
末段 -> insert
中间段 -> control
```

这套规则是当前版本的正式协议，不再由 react 用启发式推导。

## Editor Pick 协议

edge path 交互只保留两类 pick：

```ts
type EdgePathPick =
  | { kind: 'anchor'; index: number }
  | {
      kind: 'segment'
      insertIndex: number
      segmentIndex: number
      axis: 'x' | 'y'
    }
```

说明：

- `segmentIndex` 是稳定命中的主键
- `insertIndex` 继续保留给 route 插入与 active index 语义

## 收敛边界

当前版本已经删除或避免以下问题：

- React 根据 segment 位置猜 control / insert
- step manual 同时暴露顶点与段句柄，导致视觉噪音
- segment 只有显示语义，没有正式交互协议

## 后续演进边界

如果后面继续向 Miro 靠拢，只在以下边界内演进：

- 为 `segment role` 增加更细的邻接元数据
- 将 `control` 拖拽从“整段改写”收敛到“局部两段/三段约束更新”
- 微调 `insert` / `control` 的视觉样式

不再回到：

- React 层猜测 role
- UI 与交互各自维护一套 segment 语义
- 重新暴露 step manual 的原始 route 顶点

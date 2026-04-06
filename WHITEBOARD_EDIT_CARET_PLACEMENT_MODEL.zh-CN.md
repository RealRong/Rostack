# Whiteboard 编辑 Caret 放置模型

## 目标

whiteboard 的“进入编辑”与“caret 放置”分离建模：

- 进入编辑决定编辑哪个 `node / field`
- caret 放置决定编辑器挂载后光标落在哪里

最终行为：

- pointer 点击进入编辑时，优先按点击点位恢复 caret
- 无法从点位恢复时，回退到文本末尾
- 非 pointer 入口（如插入后直接编辑）默认落到末尾

## 正式协议

`EditTarget` 固定携带：

```ts
type EditCaret =
  | { kind: 'end' }
  | { kind: 'point'; client: Point }

type EditTarget = {
  nodeId: NodeId
  field: 'text' | 'title'
  caret: EditCaret
}
```

`edit.start(...)` 统一接受可选 `caret`，未传时默认 `{ kind: 'end' }`。

## 入口规则

selection press 的 `tap` 进入编辑时：

- `edit-node` 传 `caret: { kind: 'point', client }`
- `edit-field` 传 `caret: { kind: 'point', client }`

插入预设、程序化打开编辑等非 pointer 入口：

- 不传 `caret`
- 由 edit state 自动补成 `{ kind: 'end' }`

## React 落点规则

文本类 contentEditable 挂载后：

1. 先同步 draft 到 DOM
2. 如果 `caret.kind === 'point'`，调用浏览器 point-to-caret API
3. 若返回的 range 落在当前 editable 内部，则恢复到该点
4. 否则回退到 `focusEditableEnd(...)`

优先使用：

- `document.caretPositionFromPoint(...)`

回退：

- `document.caretRangeFromPoint(...)`

## 实施约束

- 不能再把 focus 逻辑绑在 `draft` 变化上，否则每次输入都会把 caret 推到末尾
- focus 只能在“进入编辑”时执行一次，或在 edit target 切换时执行
- 不做旧行为兼容，不保留“永远强制末尾”的分支

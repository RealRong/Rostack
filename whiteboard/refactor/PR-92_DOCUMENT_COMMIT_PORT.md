# PR-92 Document Commit Port

更新时间：2026-03-06

## 目标

把 `set document + sync doc state` 收敛为单一的内部文档提交 port，去掉 `syncDocState` 这种中间态透传。

## 问题

当前链路里：

1. `Writer` 先调用 `document.set(doc)`
2. 再调用 `syncDocState(doc)`

虽然顺序是对的，但读起来像对同一个 doc 做了两次写入。

`syncDocState` 的问题在于：

1. 它是为了隔离 atom/store 细节而引入的临时 port。
2. 它和 `document.set` 天然属于同一个“提交文档”动作。
3. 单独透传到 write / writer 层后，边界显得拼接，不够自然。

## 设计

### 1. 收敛为 `document.commit(doc)`

内部 document port 改为：

```ts
document: {
  get: () => Document
  commit: (doc: Document) => void
  notifyChange: (doc: Document) => void
}
```

其中 `commit(doc)` 负责：

1. `document.set(doc)`
2. `readModelRevision++`
3. `viewport <- doc.viewport`

### 2. 删除 `syncDocState`

因此可以删除：

1. `WriteDeps.syncDocState`
2. `WriterOptions.syncDocState`
3. engine 到 write 的该透传层

### 3. `Writer` 内部显式保留输出动作

`Writer` 主链保持为：

1. `document.commit(doc)`
2. `project(readHints)`
3. `notifyChange(doc)`
4. `publish(change)`

其中：

1. `notifyChange` 是宿主回调输出
2. `publish` 是 engine 内部 change bus 输出

这两个动作面对的是不同受众，继续显式保留更清晰。

## 预期结果

1. 文档提交语义重新内聚到 `document` port。
2. `Writer` 不再看到 `set + sync` 两段式。
3. write 依赖面进一步减少一层中间态透传。

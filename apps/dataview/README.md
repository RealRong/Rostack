# Group Demo

一个基于 React 的本地 demo，直接使用 `@rendevoz/group-next/react` 的基础组件与 hooks。

## 启动

在仓库根目录执行：

```bash
npm run demo:dev
```

默认地址：`http://127.0.0.1:4177`

## 你能验证什么

- `engine` 只管 `document`
- UI state 完全在 React 侧
- Table view 支持拖拽排序 / 虚拟化 / filter / sort / search / 新增字段
- row drag 与 field sort 互斥；sort 激活时仅显示 sorted order，clear sort 后恢复 manual row order

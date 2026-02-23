# Module F: 插件主线程编排器 报告

## 思路
`code.ts` 是整个插件的"大脑"，运行在 Figma sandbox 中，负责：
1. 编排全流程：遍历 → 截图 → 发送给 UI → 接收结果 → 回写
2. 消息路由：处理 UI 发来的所有请求，返回结构化响应
3. 执行回写：`node.name = newName`
4. 错误恢复：支持回滚操作

核心挑战：sandbox 没有 DOM API，所有视觉处理必须委托给 UI iframe。

## 模块结构
```
src/plugin/code.ts    # 单文件编排器
```

## 消息流
```
UI → START_NAMING → code.ts
  code.ts: 遍历节点 → TRAVERSAL_COMPLETE → UI
  code.ts: 导出截图 → IMAGE_EXPORTED → UI
  UI: SoM渲染 + VLM调用 → NAMING_RESULTS → code.ts (不回传，UI直接展示)
UI → APPLY_NAMES → code.ts
  code.ts: 执行 node.name = xxx → APPLY_COMPLETE → UI
```

## 过程

### 1. 整体架构

`code.ts` 是 531 行的单文件编排器，运行在 Figma 插件沙箱中。通过 `figma.ui.onmessage` 监听 UI iframe 发来的消息，通过 `figma.ui.postMessage()` 回传结果。维护两个模块级状态：`config`（NamerConfig，可由 UI 动态更新）和 `cancelled`（协作式取消标志）。

`figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT })` 初始化 UI 面板。

### 2. 消息路由

主消息处理器（async switch-case）处理 7 种 UI → Plugin 消息：

- **START_TRAVERSAL** — 独立遍历操作（不含后续流程）
- **EXPORT_IMAGE** — 单独导出指定节点的截图
- **START_NAMING** — 完整命名流程编排（核心）
- **APPLY_NAMES** — 批量应用命名结果
- **APPLY_SINGLE** — 单节点重命名
- **REVERT_NAMES** — 批量回滚到原始名称
- **CANCEL_OPERATION** — 设置取消标志
- **UPDATE_CONFIG** — 动态更新配置

所有处理器包裹在 try-catch 中，异常时发送 ERROR 消息并通过 `figma.notify()` 显示错误通知。

### 3. 核心流程: handleStartNaming()

这是整个插件的主流程编排器：

1. **重置取消标志** — `cancelled = false`，合并 `configOverrides` 到当前配置
2. **选区检查** — `figma.currentPage.selection` 为空时发送错误并提前返回
3. **遍历** — 调用 `traverseSelection(selection, config)`，发送 `TRAVERSAL_PROGRESS` 和 `TRAVERSAL_COMPLETE`（含所有 NodeMetadata）。遍历前通过 `yieldToMain()` 让 UI 先收到状态更新
4. **导出截图** — `getSelectionRoot()` 确定导出根节点（单选直接用、多选找共同父节点、回退到第一个节点），调用 `rootNode.exportAsync({format: 'PNG', constraint: {type: 'SCALE', value: config.exportScale}})`
5. **Base64 编码** — 自定义 `uint8ArrayToBase64()` 手动实现 Base64 编码，因为 Figma 沙箱不提供 `btoa` 或 `Buffer`。使用查找表逐 3 字节分组转换
6. **批次拆分** — `createBatches(nodes, config.batchSize)` 将节点数组按 batchSize 分割
7. **逐批发送** — 循环发送 `SOM_BATCH_READY` 消息，每批之间 `yieldToMain()` 让 UI 处理当前批次的 SoM 渲染和 VLM 调用

每个阶段之间检查 `cancelled` 标志，若为 true 则发送 idle 状态并返回。

### 4. 名称回写: handleApplyNames()

遍历所有 `NamingResult`，通过 `figma.getNodeById(result.nodeId)` 定位节点，执行 `(node as SceneNode).name = result.suggestedName`。分别计数 applied 和 failed，发送 `APPLY_COMPLETE` 和成功通知。

### 5. 名称回滚: handleRevertNames()

结构与 ApplyNames 相同，但写回 `result.originalName` 而非 suggestedName，实现一键撤销。

### 6. 单节点重命名: handleApplySingle()

支持从 NamingPreview 中逐个应用编辑后的名称，通过 nodeId 定位并重命名单个节点。

### 7. 辅助工具函数

- `getSelectionRoot()` — 确定截图导出的根节点：单选返回该节点；多选若共享父节点则返回父节点（排除 PAGE/DOCUMENT），否则回退到第一个节点
- `getExportNode()` — 根据 nodeId 列表定位导出节点，逻辑同上
- `createBatches()` — 数组分片（确保 batchSize ≥ 1）
- `uint8ArrayToBase64()` — Figma 沙箱兼容的 Base64 编码，使用 64 字符查找表手动处理每 3 字节的 4 字符映射
- `yieldToMain()` — `setTimeout(resolve, 0)` 让出主线程，确保 postMessage 状态更新在长计算前送达 UI

## 结果

模块 100% 完成。code.ts 完整实现了端到端的编排流程：从用户点击 "Start Naming" 开始，经过节点遍历、截图导出、批次拆分、SoM 渲染委托、VLM 调用委托，到命名预览、批量应用、单节点编辑、一键回滚。支持协作式取消（每阶段检查 cancelled 标志）、动态配置更新、异常恢复（全局 try-catch + figma.notify 错误提示），并通过自定义 Base64 编码解决了 Figma 沙箱无 btoa 的限制。

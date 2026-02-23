# Module D: 插件 React UI 报告

## 思路
插件 UI 承载用户交互的全部界面，需要覆盖完整的工作流：
1. 全局上下文输入 → 2. 遍历进度 → 3. AI 处理进度 → 4. 命名预览/确认 → 5. 完成

核心交互: NamingPreview 面板——设计师在此审阅每个 AI 建议的新名称，
可以逐个编辑、批量选择、一键应用。

## 模块结构
```
src/ui/
├── App.tsx                       # 主应用状态机
├── index.tsx                     # React 入口
├── index.html                    # HTML 模板
├── components/
│   ├── ContextInput.tsx          # 全局上下文输入
│   ├── NamingPreview.tsx         # 命名预览/确认面板
│   ├── BatchProgress.tsx         # 批处理进度
│   └── CanvasPreview.tsx         # SoM 标记图预览
├── hooks/
│   └── useNamingFlow.ts          # 命名流程状态 Hook
└── styles/
    └── global.css                # 全局 CSS 变量
```

## 过程

### 1. 状态机驱动的主应用 (`App.tsx`)

`App` 组件通过 `useNamingFlow()` hook 获取 `status` 字段，根据当前状态渲染对应界面。完整状态机流转：

```
idle → traversing → rendering_som → calling_vlm → previewing → applying → completed
                                                                        ↘ error
```

各状态对应的渲染：
- **idle**: 渲染 `<ContextInput>` 起始页
- **traversing / rendering_som / calling_vlm**: 渲染 `<BatchProgress>` 进度页
- **previewing**: 渲染 `<NamingPreview>` 审阅面板
- **applying**: 内联 spinner 动画 + "Applying Names..." 提示
- **completed**: 成功图标 + 统计卡片（Applied / Failed 计数）+ "Start New Session" 按钮
- **error**: 错误图标 + 错误信息展示 + "Try Again" 按钮

### 2. 四大 UI 组件

**ContextInput** (`components/ContextInput.tsx`):
- 全局上下文输入区（textarea，带占位提示文本）
- 平台选择器 — 4 个芯片按钮（Auto / iOS / Android / Web），选中态高亮切换
- 高级设置折叠面板 — 控制 batchSize（1-30）、exportScale（1x/2x/3x）、includeLocked、includeInvisible
- 底部 "Start Naming" 主按钮，调用 `onStart(globalContext, platform, configOverrides)`

**BatchProgress** (`components/BatchProgress.tsx`):
- 多阶段进度条 — 根据状态计算百分比：traversing 占 0-20%，rendering_som 固定 25%，calling_vlm 占 30-90%（按 currentBatch/totalBatches 线性插值）
- 渐变色进度条动画（蓝紫渐变 + 背景滚动动画）
- 批次指示器圆点 — 最多显示 20 个圆点，已完成绿色、当前蓝色光晕、未开始灰色
- SoM 图片缩略预览 — 展示当前批次的 Base64 标记图
- 已用时间计时器 + Cancel 按钮

**NamingPreview** (`components/NamingPreview.tsx`):
- 工具栏 — 显示 "X / Y selected" 计数 + Select All / Deselect All 快捷操作
- 搜索框 — 支持按原始名、建议名、markId 过滤
- 筛选下拉 — 5 种模式：All / Selected / Unselected / Edited / Default Names
- 命名列表 — 每行显示：复选框 + #markId 徽章 + 原始名 → 建议名映射 + 置信度可视化条（高 ≥ 0.8 绿色 / 中 ≥ 0.5 黄色 / 低 < 0.5 红色）+ edited 标签
- 内联编辑 — 点击编辑按钮进入编辑模式，Enter 确认 / Escape 取消 / 失焦自动确认
- 底部操作栏 — Cancel + "Apply Selected" 按钮（禁用态当无选中项）

**CanvasPreview** (`components/CanvasPreview.tsx`):
- 可缩放查看器 — 鼠标滚轮缩放（0.25x ~ 4x，步长 0.15），初始自动适配容器宽度
- 拖拽平移 — mouseDown/mouseMove/mouseUp 事件驱动，拖拽时切换 grabbing 光标
- 工具栏 — Zoom in (+) / Zoom out (-) / Fit 按钮 + 百分比显示
- 标签区域可点击 — 根据 SoM labels 的 highlightBox 在图片上覆盖透明可交互区域，hover 高亮，点击回调 `onLabelClick(markId, nodeId)`
- 支持 `highlightedMarkId` 外部高亮指定标签

### 3. 核心状态管理 Hook (`hooks/useNamingFlow.ts`)

`useNamingFlow()` 通过 `useState` 管理完整的 `NamingSession` 状态，并通过 `window.addEventListener('message')` 监听插件主线程的 11 种消息类型：

- `CONFIG_LOADED` → 更新配置
- `STATUS_UPDATE` → 更新状态和消息
- `TRAVERSAL_PROGRESS` → 更新遍历进度
- `TRAVERSAL_COMPLETE` → 存储所有节点，切换到 rendering_som
- `IMAGE_EXPORTED` → 存储截图 Base64 和尺寸
- `SOM_BATCH_READY` → 更新当前批次号，切换到 calling_vlm
- `NAMING_RESULTS` → 累积批次结果到 `accumulatedResults` ref
- `ALL_BATCHES_COMPLETE` → 合并所有结果，切换到 previewing
- `APPLY_COMPLETE` → 存储 applied/failed 统计，切换到 completed
- `ERROR` → 存储错误信息，切换到 error

对外暴露 4 个操作方法：
- `startNaming()` — 重置所有状态，发送 `START_NAMING` 消息
- `applyNames()` — 切换到 applying，发送 `APPLY_NAMES` 消息
- `cancelOperation()` — 发送 `CANCEL_OPERATION`，回到 idle
- `reset()` — 完全重置回初始状态

## 结果

模块 100% 完成。四个组件（ContextInput、BatchProgress、NamingPreview、CanvasPreview）和 useNamingFlow hook 全部实现，涵盖了从上下文输入、多阶段进度展示、命名审阅编辑到 SoM 图片交互预览的完整用户交互流程。状态机管理通过 postMessage 双向通信与插件主线程紧密协作，保证了 UI 响应性和流程一致性。

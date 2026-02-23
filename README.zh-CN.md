# Figma Namer

AI 驱动的 Figma 图层语义化命名工具。支持 Gemini 3、Claude 4.6 和 GPT-5.2。

**Agentic 两轮流水线**：Round 1 用 LLM 分析文件结构（识别页面 vs 噪音），Round 2 按页面批量命名，每次传 3 张图给 AI。大文件成本从 ~$50 降至 ~$2.60，耗时从 30 分钟降至 3 分钟。

两种使用方式：**Web Dashboard**（批量分析+导出）或 **Figma 插件**（编辑器内一键应用）。

> **[English](./README.md)**

---

## 用法 A：Web Dashboard（浏览器）

最简单的使用方式。所有服务本地运行，无需云端部署。

### 前置条件

- Node.js 18+
- **Figma 个人访问令牌**（[获取方式](https://www.figma.com/developers/api#access-tokens)）
- 以下任一 AI 服务的 API Key：**Google**（Gemini）、**Anthropic**（Claude）或 **OpenAI**（GPT-5.2）

### 快速开始

```bash
git clone https://github.com/groupultra/figma-namer.git
cd figma-namer
npm install
npm start
```

浏览器自动打开 `http://localhost:5173`，然后：

1. **输入 Figma Token** — 在 Figma Settings → Personal Access Tokens 获取
2. **粘贴 Figma 文件链接** — 例如 `https://www.figma.com/design/xxxxx/MyFile`
   - 要指定具体 Frame，在链接后加 `?node-id=1-2`
3. **选择 AI 模型** — Gemini Flash（默认）/ Gemini Pro / Claude Sonnet / Claude Opus / GPT-5.2
4. **输入 API Key** — 对应服务商的密钥
5. **点击"分析文件"** — AI 分析文件结构：
   - **Round 1（结构分析）**：识别文件类型（App 页面 / 组件库 / 图标库 / 混合），区分真实页面和噪音（标注、Notes、分隔线），列出每页需命名的节点
   - 显示文件类型标签、AI 推理说明、页面列表（可勾选）
   - 辅助元素（标注、箭头、分隔条）灰显并自动排除
6. **选择要命名的页面** — 勾选/取消页面，查看每页节点数
7. **点击"开始命名"** — 页面级 + 批次级双层进度：
   - **Round 2（按页命名）**：每页独立截图作为上下文
   - AI 收到 3 张图：页面全图、组件网格图、页面高亮标注图
   - 同页组件共享上下文，命名更一致
8. **审查结果** — 搜索、筛选、在线编辑名称
9. **导出** — 下载 JSON 或 CSV

> 凭证保存在 localStorage 中，仅发送到对应的 AI API，不会传输到其他任何地方。

### 将命名应用回 Figma

Figma REST API 是**只读的**，无法直接重命名图层。应用命名的方式：

- **方式 1**：从 Web Dashboard 导出 JSON，然后在 Figma 插件（用法 B）中粘贴并一键应用
- **方式 2**：导出 JSON/CSV 作为参考，手动重命名

---

## 用法 B：Figma 插件（编辑器内）

在 Figma 内直接使用。插件直接从浏览器调用 AI API —— **无需后端服务器**。你提供自己的 API Key，密钥存储在 Figma 的 `clientStorage` 中，不会发送到任何第三方服务器。

### 安装

1. 构建插件：
   ```bash
   npm run build:plugin
   ```
2. 打开 Figma Desktop → Plugins → Development → Import plugin from manifest
3. 选择项目根目录的 `manifest.json`

### 使用步骤

1. 在 Figma 画布上选中 Frame
2. 打开插件（Plugins → Development → Figma Namer）
3. 输入全局上下文（例如"电商结账流程"）
4. 选择平台（Auto / iOS / Android / Web）
5. **选择 AI 服务商** — Gemini Flash / Gemini Pro / Claude Sonnet / Claude Opus / GPT-5.2
6. **输入 API Key** — 本地存储在 Figma 中，除了发送到 AI API 外不会离开你的设备
7. 点击 **"Start Naming"**
8. 审查 AI 生成的名称 → 应用选中项 → 名称直接写入 Figma 图层

> **无需后端。** 插件从 UI iframe 直接通过 `fetch` 调用 AI API（Google、Anthropic、OpenAI）。Anthropic 通过 `anthropic-dangerous-direct-browser-access` 头启用 CORS。OpenAI 可能不支持浏览器 CORS —— 如遇问题请改用 Gemini 或 Claude。

---

## 命令速查

| 命令 | 说明 |
|------|------|
| `npm start` | 启动 Web Dashboard（服务器 + 前端） |
| `npm run start:server` | 仅启动 Express 服务器 |
| `npm run start:web` | 仅启动 Vite 前端 |
| `npm run build:plugin` | 构建 Figma 插件 |
| `npm run dev:plugin` | 开发模式构建插件（watch） |
| `npm test` | 运行测试 |

## 支持的 AI 模型

| 提供商 | 模型 | 插件 ID | 特点 |
|--------|------|---------|------|
| **Google** | gemini-3-flash-preview | `gemini-flash` | 速度快、成本低（默认推荐） |
| **Google** | gemini-3-pro-preview | `gemini-pro` | 最强推理能力 |
| **Anthropic** | claude-sonnet-4-6 | `claude-sonnet` | 均衡之选 |
| **Anthropic** | claude-opus-4-6 | `claude-opus` | 最强综合能力 |
| **OpenAI** | gpt-5.2 | `gpt-5.2` | 最强视觉理解（插件中 CORS 可能不可用） |

## 许可证

MIT

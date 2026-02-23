# Figma Namer

AI 驱动的 Figma 图层语义化命名工具。支持 Gemini 3、Claude 4.6 和 GPT-5.2。

两种使用方式：**Web Dashboard**（推荐）或 **Figma 插件**（编辑器内使用）。

> **[English](./README.md)**

---

## 用法 A：Web Dashboard（浏览器）

最简单的使用方式。所有服务本地运行，无需部署 Vercel 后端。

### 前置条件

- Node.js 18+
- **Figma 个人访问令牌**（[获取方式](https://www.figma.com/developers/api#access-tokens)）
- 以下任一 AI 服务的 API Key：**Google**（Gemini 3）、**Anthropic**（Claude 4.6）或 **OpenAI**（GPT-5.2）

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
3. **选择 AI 模型** — Gemini 3 Flash（默认）/ Gemini 3 Pro / Claude Sonnet / Claude Opus / GPT-5.2
4. **输入 API Key** — 对应服务商的密钥
5. **点击"分析文件"** — 显示节点数量和类型分布
6. **点击"开始命名"** — 实时进度条，AI 逐批处理
7. **审查结果** — 搜索、筛选、在线编辑名称
8. **导出** — 下载 JSON 或 CSV

> 凭证保存在 localStorage 中，仅发送到对应的 AI API，不会传输到其他任何地方。

### 将命名应用回 Figma

Figma REST API 是**只读的**，无法直接重命名图层。应用命名的方式：

- **方式 1**：从 Web Dashboard 导出 JSON，然后在 Figma 插件（用法 B）中粘贴并一键应用
- **方式 2**：导出 JSON/CSV 作为参考，手动重命名

---

## 用法 B：Figma 插件（编辑器内）

在 Figma 内直接使用。插件可以遍历、命名并直接应用到画布。

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
5. 点击 "Start Naming"
6. 审查 AI 生成的名称 → 应用选中项

### 后端

插件通过 Vercel 后端调用 AI。自建后端方式：

```bash
cd backend
npm install
# 设置环境变量: ANTHROPIC_API_KEY 和/或 OPENAI_API_KEY
vercel dev
```

然后修改插件配置中的 `apiEndpoint`。

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

| 提供商 | 模型 | 特点 |
|--------|------|------|
| **Google** | gemini-3-flash-preview | 速度快、成本低（默认推荐） |
| **Google** | gemini-3-pro-preview | 最强推理能力 |
| **Anthropic** | claude-sonnet-4-6 | 均衡之选 |
| **Anthropic** | claude-opus-4-6 | 最强综合能力 |
| **OpenAI** | gpt-5.2 | 最强视觉理解 |

## 许可证

MIT

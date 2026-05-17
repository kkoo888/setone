# 智能桌面助手 — Windows 本地打包指南

## 前置条件

| 工具 | 最低版本 | 下载地址 |
|------|---------|---------|
| Node.js | 18.x LTS | https://nodejs.org/ |
| Git | 任意 | https://git-scm.com/ |
| Visual Studio Build Tools | 2019+ | 见下方说明 |

### Visual Studio Build Tools（C++ 编译环境）

electron-builder 的 native 模块（如 better-sqlite3）需要 C++ 编译环境。

1. 下载 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. 安装时勾选 **"使用 C++ 的桌面开发"** 工作负载
3. 安装完成后重启电脑

---

## 第一步：克隆仓库

```bash
git clone https://github.com/kkoo888/setone.git
cd setone/desktop
```

## 第二步：安装依赖

```bash
npm install
npm install -D electron-builder
```

## 第三步：构建应用

```bash
npm run build
```

此命令会自动执行：
1. 清理旧构建产物
2. 编译模块（`modules/` → `modules-dist/`，使用 ncc 将 TS 编译为 JS）
3. 使用 electron-vite 构建主进程、预加载脚本和前端

构建成功后会输出：
```
dist/main/index.js          ← Electron 主进程
dist/preload/index.js       ← 预加载脚本
dist/renderer/index.html    ← React 前端
dist/renderer/assets/       ← 前端资源
modules-dist/               ← 编译后的模块（JS）
```

## 第四步：打包 Windows 版本

### 方式一：打包安装包（推荐）

```bash
npx electron-builder --win
```

打包完成后在 `dist-packaged/` 目录下找到：
```
dist-packaged/
├── 智能桌面助手-Setup-0.1.0.exe    ← NSIS 安装包（双击安装）
└── win-unpacked/                   ← 解压目录（可直接运行）
    ├── 智能桌面助手.exe
    └── ...
```

直接双击 `智能桌面助手-Setup-0.1.0.exe` 安装即可。

### 方式二：仅打包目录（开发者测试用）

```bash
npx electron-builder --win --dir
```

打包完成后在 `dist-packaged/win-unpacked/` 目录下找到可执行文件。

---

## 常见问题

### Q: `node-gyp` 报错

```
gyp ERR! find VS ...
```

**解决：** 安装 Visual Studio Build Tools 并勾选 "使用 C++ 的桌面开发"。

### Q: 下载 Electron 超时

```
Error: connect ETIMEDOUT
```

**解决：** 设置 Electron 镜像源：

```bash
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npx electron-builder --win --dir
```

### Q: 打包后白屏

**原因：** 主进程入口路径不对。

**解决：** 确认 `package.json` 中 `main` 字段为 `dist/main/index.js`。

### Q: `better-sqlite3` 加载失败

```
Error: The specified module could not be found
```

**解决：** 确保 asar 中包含 better-sqlite3 的 native 模块。检查 `electron-builder.yml` 中的 `asarUnpack` 配置：

```yaml
asar: true
asarUnpack:
  - "node_modules/better-sqlite3/**/*"
```

### Q: 想重新打包

```bash
# 清理旧的构建产物
rmdir /s /q dist-packaged
npm run build
npx electron-builder --win --dir
```

---

## 开发模式（热重载）

如果只是想在本地跑起来调试，不需要打包，用开发模式更方便：

```bash
npm run dev
```

这会启动 Electron + Vite 开发服务器，代码修改后自动刷新。

---

## 目录结构说明

```
setone/desktop/
├── src/
│   ├── main/           ← Electron 主进程（Node.js）
│   │   ├── core/       ← 核心模块（事件总线、数据库、安全等）
│   │   ├── types/      ← 类型定义
│   │   └── index.ts    ← 主进程入口
│   ├── preload/        ← 预加载脚本（IPC 桥接）
│   ├── renderer/       ← React 前端
│   │   ├── src/
│   │   │   ├── components/   ← UI 组件
│   │   │   ├── pages/        ← 页面
│   │   │   ├── stores/       ← Zustand 状态管理
│   │   │   ├── styles/       ← 样式
│   │   │   └── types/        ← 前端类型
│   │   └── index.html
│   └── shared/         ← 前后端共享类型
├── modules/            ← 功能模块（插件式）
├── tests/              ← 测试文件
├── dist/               ← 构建产物（npm run build 生成）
├── dist-packaged/      ← 打包产物（electron-builder 生成）
├── electron-builder.yml
├── package.json
└── tsconfig.json
```

---

## 快速命令速查

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（热重载） |
| `npm run build` | 构建生产版本 |
| `npm run test` | 运行单元测试 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 代码检查 |
| `npx electron-builder --win --dir` | 打包 Windows 目录版 |
| `npx electron-builder --win nsis` | 打包 Windows 安装包 |

# better-sqlite3 + Electron 配置方案

## 问题分析

### 根本原因

better-sqlite3 是一个 **原生 Node.js 模块**（C++ 编译），它依赖特定的 `NODE_MODULE_VERSION`（ABI 版本）。

- **系统 Node.js v22.22.1** 的 `NODE_MODULE_VERSION` = **131**
- **Electron 39.8.10** 内置的 Node.js 的 `NODE_MODULE_VERSION` = **140**（Electron 有自己独立的 ABI）

`npm install better-sqlite3` 时，npm 会下载/编译针对 **系统 Node.js** 的二进制文件（`.node` 文件），但 Electron 运行时使用的是自己的 ABI（140），两者不匹配 → 崩溃。

### 解决方案概述

使用 `@electron/rebuild` 重新编译 better-sqlite3，使其针对 Electron 的 ABI 版本生成正确的 `.node` 文件。

---

## 配置步骤

### 第一步：安装依赖

```bash
cd /root/setone/desktop

# 安装 better-sqlite3（替换 sql.js）
pnpm add better-sqlite3

# 安装 @electron/rebuild（开发依赖）
pnpm add -D @electron/rebuild
```

> **注意**：`electron-rebuild`（无 `@electron/` 前缀）是旧包名，已被废弃。请使用 `@electron/rebuild`。

### 第二步：添加 rebuild 脚本

修改 `package.json` 的 `scripts` 部分：

```jsonc
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    // ↓ 新增以下脚本
    "rebuild": "electron-rebuild -f -w better-sqlite3",
    "postinstall": "electron-rebuild -f -w better-sqlite3"
    // ...
  }
}
```

**说明**：
- `-f`（force）：强制重新编译，即使已有编译结果
- `-w better-sqlite3`（which-module）：只重新编译 better-sqlite3，不编译其他原生模块
- `postinstall`：每次 `pnpm install` 后自动执行 rebuild，避免遗忘

### 第三步：确认 electron-vite 配置

当前项目的 `electron.vite.config.ts` **已经正确配置**，使用了 `externalizeDepsPlugin()`：

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],  // ✅ 已正确配置
    // ...
  }
})
```

`externalizeDepsPlugin()` 会自动将所有 `dependencies` 中的模块标记为外部依赖（external），使 better-sqlite3 不会被 Vite 打包，而是在运行时从 `node_modules` 加载。**这是正确的做法**——原生模块不能被 Vite 打包。

### 第四步：执行 rebuild

```bash
# 手动执行一次 rebuild
pnpm run rebuild
```

如果成功，会在 `node_modules/better-sqlite3/build/Release/` 下生成新的 `better_sqlite3.node` 文件（针对 Electron 的 ABI）。

### 第五步：验证

```bash
# 启动开发模式
pnpm run dev
```

如果应用正常启动且能操作数据库，说明 rebuild 成功。

---

## 构建工具要求

`@electron/rebuild` 内部使用 `node-gyp` 编译原生模块，需要以下系统工具：

### Windows

| 工具 | 说明 |
|------|------|
| **Python 3.x** | node-gyp 需要（推荐 3.10-3.12） |
| **Visual Studio Build Tools** | 包含 C++ 编译器 |
| **node-gyp** | `@electron/rebuild` 会自动使用，但建议显式安装 |

```bash
# 安装 Visual Studio Build Tools（管理员 PowerShell）
winget install Microsoft.VisualStudio.2022.BuildTools

# 安装时选择 "Desktop development with C++" 工作负载

# 安装 Python（如果没有）
winget install Python.Python.3.12

# 可选：显式安装 node-gyp
pnpm add -D node-gyp
```

### macOS

```bash
# 需要 Xcode Command Line Tools
xcode-select --install

# Python 3 通常已预装
```

### Linux

```bash
# Ubuntu/Debian
sudo apt-get install -y python3 build-essential

# CentOS/RHEL
sudo yum install -y python3 gcc-c++ make
```

---

## 可能遇到的问题及解决方案

### 问题 1：`gyp ERR! build error`（编译失败）

**症状**：执行 `pnpm run rebuild` 时报错 `gyp failed with exit code: 1`

**原因**：缺少 C++ 编译工具链

**解决**：
- Windows：安装 Visual Studio Build Tools（见上方）
- macOS：运行 `xcode-select --install`
- Linux：安装 `build-essential`

### 问题 2：网络问题导致下载 Electron headers 失败

**症状**：rebuild 过程中卡住或报错 `gyp http GET` 超时

**解决**：设置 Electron 镜像源

```bash
# 在 .npmrc 中添加
echo "electron_mirror=https://npmmirror.com/mirrors/electron/" >> .npmrc
```

### 问题 3：每次 `pnpm install` 后又报 ABI 不匹配

**原因**：`pnpm install` 会重新下载/链接 better-sqlite3，覆盖已 rebuild 的文件

**解决**：已通过 `postinstall` 脚本自动处理（见第二步）。确保 `postinstall` 脚本存在：

```jsonc
"postinstall": "electron-rebuild -f -w better-sqlite3"
```

### 问题 4：打包后生产环境仍然崩溃

**原因**：electron-builder 打包时没有包含 rebuild 后的 `.node` 文件

**解决**：在 `electron-builder.yml` 或 `package.json` 的 `build` 配置中，确保 better-sqlite3 的 `.node` 文件被正确打包：

```yaml
# electron-builder.yml
extraResources:
  - from: 'node_modules/better-sqlite3/build'
    to: 'node_modules/better-sqlite3/build'
```

**更推荐的做法**：使用 electron-builder 的 `afterPack` 钩子在打包时自动 rebuild：

```js
// scripts/after-pack.js
const { rebuild } = require('@electron/rebuild')

module.exports = async function afterPack(context) {
  await rebuild({
    buildPath: context.appOutDir,
    electronVersion: context.electronVersion,
    arch: context.arch
  })
}
```

然后在构建配置中引用：

```jsonc
{
  "build": {
    "afterPack": "./scripts/after-pack.js"
  }
}
```

### 问题 5：CI/CD 环境中 rebuild 失败

**解决**：确保 CI 环境安装了编译工具：

```yaml
# GitHub Actions 示例
- name: Install build tools
  run: |
    sudo apt-get update
    sudo apt-get install -y python3 build-essential

- name: Install dependencies
  run: pnpm install  # postinstall 会自动 rebuild

- name: Build
  run: pnpm run build
```

### 问题 6：pnpm 的 hoist 问题

pnpm 使用严格的 `node_modules` 结构，可能导致 `@electron/rebuild` 找不到模块。

**解决**：在 `.npmrc` 中添加：

```ini
shamefully-hoist=true
```

---

## 备选方案：使用 prebuild 的预编译二进制

better-sqlite3 使用 [prebuildify](https://github.com/prebuild/prebuildify) 发布预编译二进制。但这些预编译二进制 **只针对标准 Node.js**，不包含 Electron 的 ABI。

`@electron/rebuild` 内部会检查模块是否使用 prebuild/prebuildify，如果有 Electron 对应的预编译二进制，会直接下载而非编译。但 **better-sqlite3 目前不提供 Electron 预编译二进制**，所以必须从源码编译。

---

## better-sqlite3 vs sql.js 对比

| 维度 | better-sqlite3 | sql.js |
|------|---------------|--------|
| **性能** | ⭐⭐⭐⭐⭐ 原生 C++，极快 | ⭐⭐⭐ WASM，较慢（约慢 3-10x） |
| **安装复杂度** | 需要编译工具链 | 纯 JS，零编译 |
| **打包复杂度** | 需要 `@electron/rebuild` | 简单，无原生依赖 |
| **功能完整性** | 完整 SQLite 功能 | 基本完整，部分高级特性缺失 |
| **内存占用** | 较低 | WASM 运行时开销较高 |
| **跨平台** | 需要每个平台分别编译 | WASM 通用，无需编译 |
| **维护状态** | 活跃，广泛使用 | 活跃 |

---

## 最终建议

### 推荐：切回 better-sqlite3

**理由**：

1. **性能差距显著**：better-sqlite3 的性能是 sql.js 的 3-10 倍，对于桌面应用的数据库操作（特别是批量插入、复杂查询），差距会被放大。

2. **配置并不复杂**：只需一次性配置 `@electron/rebuild` 和 `postinstall` 脚本，之后每次 `pnpm install` 都会自动 rebuild。整个过程是透明的。

3. **生态成熟**：better-sqlite3 是 Electron + SQLite 的事实标准方案，社区支持完善，踩坑文档丰富。

4. **构建工具要求可控**：Windows 上需要 Visual Studio Build Tools + Python，但这在任何 C++ 项目中都是标准配置，不是额外负担。

### 操作建议

如果决定切回 better-sqlite3，按以下顺序操作：

1. 安装依赖：`pnpm add better-sqlite3 && pnpm add -D @electron/rebuild`
2. 添加 `rebuild` 和 `postinstall` 脚本到 `package.json`
3. 执行 `pnpm run rebuild`
4. 修改数据库层代码，将 `sql.js` 替换为 `better-sqlite3`
5. 本地测试 `pnpm run dev` 确认正常
6. 测试打包 `pnpm run build` 确认生产环境正常
7. 移除 `sql.js` 依赖：`pnpm remove sql.js`

### 如果继续用 sql.js

如果不想处理原生编译的复杂性（比如团队成员环境不统一、CI 环境限制等），继续使用 sql.js 也是合理的选择。性能差距在小型数据库（< 10MB）场景下通常可以接受。

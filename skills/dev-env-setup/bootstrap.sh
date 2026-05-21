#!/usr/bin/env bash
set -euo pipefail

# ============================================
# OpenClaw 开发环境一键初始化脚本
# 用法: bash bootstrap.sh [项目目录]
# ============================================

PROJECT_DIR="${1:-$HOME/.openclaw/workspace}"
GITHUB_REPO="git@github.com:kkoo888/setone.git"
OC_SKILLS="$HOME/.openclaw/skills"
WS_SKILLS="$PROJECT_DIR/skills"

echo "🚀 OpenClaw 开发环境初始化"
echo "=========================="
echo "项目目录: $PROJECT_DIR"
echo ""

# ──────────────────────────────────────
# Phase 1: 安装基础技能 (clawhub)
# ──────────────────────────────────────
echo "📦 Phase 1: 安装基础技能..."
for skill in skill-vetter self-improving-agent self-improving humanizer github ui-ux-pro-max; do
    echo -n "  安装 $skill... "
    clawhub install "$skill" --force 2>/dev/null && echo "✅" || echo "❌"
done
echo ""

# ──────────────────────────────────────
# Phase 2: 生成 SSH 密钥
# ──────────────────────────────────────
echo "🔑 Phase 2: 生成 SSH 密钥..."
if [ -f ~/.ssh/id_ed25519 ]; then
    echo "  SSH 密钥已存在，跳过"
else
    ssh-keygen -t ed25519 -C "$(whoami)@github" -f ~/.ssh/id_ed25519 -N ""
    echo "  ✅ SSH 密钥已生成"
fi
echo ""
echo "📋 请将以下公钥添加到 GitHub (Settings → SSH keys):"
echo "-------------------------------------------"
cat ~/.ssh/id_ed25519.pub
echo "-------------------------------------------"
echo ""
read -p "👆 添加完成后按回车继续..."
echo ""

# ──────────────────────────────────────
# Phase 3: 克隆项目仓库
# ──────────────────────────────────────
echo "📂 Phase 3: 克隆项目仓库..."
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"
if [ -d "setone/.git" ]; then
    echo "  项目已存在，拉取最新代码..."
    cd setone && git pull origin dev && cd ..
else
    git clone "$GITHUB_REPO" setone
    cd setone && git checkout dev && cd ..
fi
echo "  ✅ 项目就绪: $PROJECT_DIR/setone"
echo ""

# ──────────────────────────────────────
# Phase 4: 安装 GitHub 技能库
# ──────────────────────────────────────
echo "📚 Phase 4: 安装 GitHub 技能库..."
mkdir -p "$PROJECT_DIR/setone/skills"
cd "$PROJECT_DIR/setone/skills"
for repo in "mattpocock/skills:mattpocock-skills" "vercel-labs/agent-skills:vercel-agent-skills" "obra/superpowers:superpowers"; do
    IFS=':' read -r github_repo local_name <<< "$repo"
    echo -n "  克隆 $github_repo... "
    if [ -d "$local_name/.git" ]; then
        echo "已存在，跳过"
    else
        git clone "https://github.com/$github_repo.git" "$local_name" 2>/dev/null && echo "✅" || echo "❌"
    fi
done
cd "$PROJECT_DIR"
echo ""

# ──────────────────────────────────────
# Phase 5: 注册 OpenClaw 原生开发技能
# ──────────────────────────────────────
echo "🛠️  Phase 5: 创建 OpenClaw 原生技能..."
mkdir -p "$OC_SKILLS"

# --- react-best-practices ---
mkdir -p "$OC_SKILLS/react-best-practices"
cat > "$OC_SKILLS/react-best-practices/SKILL.md" << 'SKILLEOF'
---
name: react-best-practices
description: React 组件开发最佳实践。在编写、审查或重构 React 组件时自动触发。涵盖性能优化、组合模式、Hooks 使用、组件架构设计。
---
# React 最佳实践
## 触发场景
- 编写新的 React 组件 / 审查或重构已有组件 / 处理 React 性能问题 / 设计组件 API 和 Props
## 核心规则
### 性能优先（CRITICAL）
1. 消除请求瀑布流 — 并行加载数据，不要串行 await
2. 控制包体积 — 动态导入大型组件，tree-shake 无用代码
3. 减少不必要的 re-render — 用 useMemo/useCallback 精确控制
### 组合模式
4. 避免 boolean prop 泛滥 — 用 compound components 替代 isXxx/showXxx props
5. Children > Render Props — 优先用 children 传递内容
6. 显式变体 > 布尔组合 — <Card variant="elevated"> 优于 <Card elevated shadow rounded>
7. React 19 不需要 forwardRef — 直接接收 ref 作为 props
### 组件设计
8. 一个组件一个职责 — 做太多事就拆分
9. Props 接口最小化 — 只暴露真正需要的配置
10. 状态提升到合适的层级 — 不要 prop-drill，也不要过早用 Context
### Hooks 规则
11. 依赖数组要诚实 — 不省略也不多加
12. effect 中做一件事 — 复杂逻辑拆成多个 effect
13. 初始化用 useRef — 只需初始值且不变的用 ref
## 🔗 关联技能
- 需求不明确 → requirements-clarification
- 写组件前 → typescript-best-practices
- 组件完成后 → code-review
- 遇到 bug → systematic-debugging
- 需要图标 → svg-draw
- UI 打磨 → polish / colorize / arrange
- 复杂架构 → architecture-review
SKILLEOF
echo "  ✅ react-best-practices"

# --- typescript-best-practices ---
mkdir -p "$OC_SKILLS/typescript-best-practices"
cat > "$OC_SKILLS/typescript-best-practices/SKILL.md" << 'SKILLEOF'
---
name: typescript-best-practices
description: TypeScript 开发规范。在编写、审查或重构 TypeScript 代码、定义类型、处理类型错误时自动触发。涵盖类型设计、泛型使用、类型安全。
---
# TypeScript 最佳实践
## 触发场景
- 编写 TypeScript 代码 / 定义接口和类型 / 处理类型错误 / 重构 JS 到 TS / 审查 TS 代码
## 核心规则
### 类型设计
1. 接口优于 type（对象形状）/ type 优于接口（联合类型）
2. 导出类型用 export type — 明确标记类型导出
3. 避免 any — 用 unknown + 类型守卫替代
4. 字面量类型优于枚举 — type Status = 'idle' | 'loading' | 'error'
### 泛型
5. 泛型要有约束 — <T extends Record<string, unknown>> 优于 <T>
6. 推断优先 — 能让 TS 推断的就不要手动标注
7. 工具类型活用 — Pick, Omit, Partial, Required, Record
### 类型安全
8. 严格模式全开 — strict: true, noUncheckedIndexedAccess: true
9. Discriminated Unions — 用 type 字段区分联合类型的成员
10. 类型守卫函数 — function isXxx(value: unknown): value is Xxx
11. 不要用 as 断言 — 除非万不得已，用类型守卫
### Electron + Vite 项目规范
12. IPC 类型共享 — 主进程和渲染进程共享 IPC 类型定义
13. Preload 最小化 — contextBridge 只暴露必要的 API
14. 渲染进程不要直接访问 Node — 通过 IPC 桥接
## 🔗 关联技能
- 定义类型前 → requirements-clarification
- 写 TS 代码 → tdd-workflow
- 类型报错 → systematic-debugging
- 代码审查 → code-review
- 架构优化 → architecture-review
SKILLEOF
echo "  ✅ typescript-best-practices"

# --- tdd-workflow ---
mkdir -p "$OC_SKILLS/tdd-workflow"
cat > "$OC_SKILLS/tdd-workflow/SKILL.md" << 'SKILLEOF'
---
name: tdd-workflow
description: 测试驱动开发流程。在编写测试、修复 bug、开发新功能时自动触发。强调红-绿-重构循环，测试行为而非实现。
---
# TDD 工作流
## 触发场景
- 编写测试用例 / 修复 bug（先写失败的测试）/ 开发新功能（测试先行）/ 重构代码（测试保护）
## 核心原则
### 红-绿-重构
1. 红 — 写一个失败的测试，描述期望行为
2. 绿 — 写最少的代码让测试通过
3. 重构 — 改善代码结构，保持测试通过
### 关键规则
4. 垂直切片 — 一次写一个测试+实现，不要先写所有测试
5. 测试行为不测实现 — 测试"系统做什么"，不测"系统怎么做的"
6. 公共接口测试 — 通过公共 API 测试，不测私有方法
7. 重命名内部函数不应导致测试失败
### 测试质量
8. 集成测试优先 — 真实代码路径 > mock
9. 最小化 mock — 只 mock 外部依赖
10. 测试要像规格说明 — "user can checkout with valid cart"
11. 每个测试一个断言主题
### Bug 修复流程
12. 先写复现测试 → 确认失败 → 最小修复 → 回归测试
## 🔗 关联技能
- 测试前 → requirements-clarification
- 测试失败 → systematic-debugging
- 测试通过 → code-review
- 多个任务 → planning-and-execution
- 完成前 → verification-before-completion
SKILLEOF
echo "  ✅ tdd-workflow"

# --- systematic-debugging ---
mkdir -p "$OC_SKILLS/systematic-debugging"
cat > "$OC_SKILLS/systematic-debugging/SKILL.md" << 'SKILLEOF'
---
name: systematic-debugging
description: 系统化调试流程。遇到 bug、测试失败、意外行为时自动触发。先找根因再修复，禁止盲目打补丁。
---
# 系统化调试
## 触发场景
- 测试失败 / 运行时错误 / 性能问题 / 构建失败 / 集成问题
## 铁律：没有根因分析，就不能提修复方案！
## 调试流程
### Phase 1 — 建立反馈循环（最关键）
花不成比例的精力在这里。方法（按优先级）：
1. 写失败测试 — unit / integration / e2e
2. CLI 复现 — 固定输入，对比输出
3. 二分法 — git bisect 找引入 commit
4. 最小复现 — 剥离无关代码
### Phase 2 — 定位根因
5. 假设-验证 — 每次只验证一个假设
6. 添加日志/断言 — 关键路径插入观测点
7. 排除法 — 逐个排除可能原因
### Phase 3 — 修复+回归
8. 最小修复 — 改动越小越好
9. 回归测试 — 确保不引入新问题
10. 记录根因 — 写入 commit message
## 禁止事项
- ❌ 没有复现就猜测修复
- ❌ "看起来应该可以了" 不验证
- ❌ 一次改多个地方
- ❌ 跳过 Phase 1 直接修
## 🔗 关联技能
- 修 bug 前 → tdd-workflow
- 调试完 → code-review
- 复杂架构 → architecture-review
- 多个问题 → planning-and-execution
- 完成前 → verification-before-completion
SKILLEOF
echo "  ✅ systematic-debugging"

# --- planning-and-execution ---
mkdir -p "$OC_SKILLS/planning-and-execution"
cat > "$OC_SKILLS/planning-and-execution/SKILL.md" << 'SKILLEOF'
---
name: planning-and-execution
description: 任务规划与执行流程。在制定开发计划、拆分任务、执行多步骤开发时自动触发。
---
# 规划与执行
## 触发场景
- 制定开发计划 / 拆分复杂功能 / 执行多步骤实现 / 子代理驱动开发
## 规划流程
### Step 1 — 需求澄清
1. 不要假设 — 不确定就问
2. 挑战每个决定 — "为什么选这个方案？"
3. 明确边界 — 什么在范围内，什么不在
### Step 2 — 写计划
4. 假设读者零上下文 — 计划要自包含
5. 文件清单 — 列出每个要修改的文件和职责
6. 任务拆分 — 每个任务独立、可测试
7. DRY / YAGNI — 不要过度设计
### Step 3 — 执行
8. 垂直切片 — 一个任务一个实现
9. 每个任务后验证 — 跑测试确认
10. 连续执行 — 不要中途问"要继续吗？"
## 子代理驱动
- 每个任务分配子代理，提供精确上下文
- 两阶段审查：spec 合规性 → 代码质量
## 关键约束
- 不要在任务间汇报进度 — 执行就执行
- 只在以下情况停下：BLOCKED、歧义、全部完成
## 🔗 关联技能
- 计划前 → requirements-clarification
- 计划中 → architecture-review
- 执行中 → tdd-workflow
- 完成后 → code-review
- 最终 → verification-before-completion
SKILLEOF
echo "  ✅ planning-and-execution"

# --- code-review ---
mkdir -p "$OC_SKILLS/code-review"
cat > "$OC_SKILLS/code-review/SKILL.md" << 'SKILLEOF'
---
name: code-review
description: 代码审查流程。在审查代码、PR review、完成开发任务后自动触发。包括自我审查和子代理审查。
---
# 代码审查
## 触发场景
- 完成一个功能开发后 / 合并代码前 / 重构完成后 / 修复 bug 后
## 铁律：没有验证证据，就不能说"完成了"！
## 自我审查清单
1. 功能正确？跑测试确认
2. 边界条件？空值、极端输入、并发
3. 错误处理？异常路径覆盖
4. 类型安全？有无 any、类型断言
5. 命名清晰？变量/函数名自解释
6. 重复代码？可否提取公共逻辑
7. React 规范？对照 react-best-practices
8. TS 规范？对照 typescript-best-practices
## 子代理审查
对复杂功能派子代理做独立审查：
1. 提供 git diff 和相关上下文
2. 审查者只看产出，不知思考过程
3. 两阶段：Spec 合规性 → 代码质量
## 验证门禁
- [ ] 所有测试通过
- [ ] TypeScript 编译无错误
- [ ] Lint 无警告
- [ ] 关键路径手动验证
## 🔗 关联技能
- 审查 React → react-best-practices
- 审查 TS → typescript-best-practices
- 发现 bug → systematic-debugging
- 发现架构问题 → architecture-review
- 最终确认 → verification-before-completion
SKILLEOF
echo "  ✅ code-review"

# --- requirements-clarification ---
mkdir -p "$OC_SKILLS/requirements-clarification"
cat > "$OC_SKILLS/requirements-clarification/SKILL.md" << 'SKILLEOF'
---
name: requirements-clarification
description: 需求澄清流程。在需求不明确、用户描述模糊、需要深入理解需求时自动触发。通过追问确保理解正确再动手。
---
# 需求澄清
## 触发场景
- 用户描述的需求模糊 / 多种理解方式 / 涉及业务逻辑决策 / 开始开发前需确认
## 核心：最常见的失败是理解偏差
## 澄清流程
### Step 1 — 理解意图
1. 复述需求 — "你的意思是……对吗？"
2. 识别歧义 — 哪些可以多种理解？
3. 提出方案 — 每个歧义点给推荐+备选
### Step 2 — 深入追问
4. 边界情况 — "输入为空呢？""网络断了呢？"
5. 优先级 — "性能和可读性冲突时优先哪个？"
6. 不做什么 — 明确排除范围
### Step 3 — 确认方案
7. 输出规格 — 简要描述交付物
8. 技术方案 — 用什么方式实现
9. 验收标准 — 怎么算"做完了"
## 必须澄清的场景
- 用户说"随便" → 给推荐确认
- UI/UX 设计决策 → 给选项
- 数据结构设计 → 画图确认
- 外部 API 选择 → 对比方案
## 🔗 关联技能
- 澄清后 → planning-and-execution
- 涉及架构 → architecture-review
- 涉及 UI → frontend-design + svg-draw
- 涉及 React → react-best-practices
- 涉及类型 → typescript-best-practices
SKILLEOF
echo "  ✅ requirements-clarification"

# --- architecture-review ---
mkdir -p "$OC_SKILLS/architecture-review"
cat > "$OC_SKILLS/architecture-review/SKILL.md" << 'SKILLEOF'
---
name: architecture-review
description: 代码架构审查与重构建议。在需要改善代码结构、分析模块耦合、寻找重构机会时自动触发。
---
# 架构审查
## 触发场景
- 代码结构需要改善 / 模块耦合过紧 / 寻找重构机会 / 评估架构决策
## 核心概念
- 模块 — 有接口和实现的任何东西
- 深度 — 接口小功能强 = 深模块（好）
- 浅度 — 接口≈实现复杂度 = 浅模块（需重构）
- 接缝 — 可以改变行为的位置
## 审查流程
### Step 1 — 探索
漫游代码库，记录摩擦点：
- 理解一个概念需要跳转很多文件？
- 模块太浅？
- 紧耦合跨越接缝？
- 代码难测试？
### Step 2 — 删除测试
- 删掉它复杂度消失了？→ 只是透传
- 删掉它复杂度分散到 N 个调用方？→ 它有价值
### Step 3 — 输出
每个候选重构：涉及文件、问题、方案、收益、建议强度
## 🔗 关联技能
- 重构前 → tdd-workflow（测试保护）
- 重构中 → typescript-best-practices
- 重构后 → code-review
- 复杂重构 → planning-and-execution
- Electron 架构 → 参考项目 dev-docs/
SKILLEOF
echo "  ✅ architecture-review"

# --- dev-env-setup ---
mkdir -p "$OC_SKILLS/dev-env-setup"
cat > "$OC_SKILLS/dev-env-setup/SKILL.md" << 'SKILLEOF'
---
name: dev-env-setup
description: 开发环境一键初始化。在新机器上搭建 OpenClaw 开发环境时触发。自动安装基础技能、生成 SSH 密钥、克隆项目、安装 GitHub 技能库、注册原生开发技能。
---
# 开发环境一键初始化
## 流程
1. clawhub 安装基础技能（skill-vetter, self-improving-agent, self-improving, humanizer, github, ui-ux-pro-max）
2. 生成 SSH 密钥 → 暂停等用户添加到 GitHub
3. 克隆 setone 仓库 dev 分支
4. 克隆 GitHub 技能库（mattpocock, vercel-labs, obra）
5. 创建 OpenClaw 原生开发技能（10 个）
6. 同步到工作区
7. 验证环境
## 使用：bash bootstrap.sh [项目目录]
SKILLEOF
cp "$OC_SKILLS/dev-env-setup/bootstrap.sh" "$OC_SKILLS/dev-env-setup/bootstrap.sh" 2>/dev/null || true
echo "  ✅ dev-env-setup"

# --- svg-draw ---
mkdir -p "$OC_SKILLS/svg-draw"
cat > "$OC_SKILLS/svg-draw/SKILL.md" << 'SKILLEOF'
---
name: svg-draw
description: 图标选择与SVG生成工具。需要图标、Logo、插图时自动触发。从 Iconify 图标库（200,000+ 图标，100+ 图标集）搜索选择合适图标，支持 SVG 和 PNG 输出。包含 Material Design、Tabler、Heroicons、Lucide、Solar、IconPark 等主流图标集。
---
# 图标选择与 SVG 生成
## 触发场景
- 需要 UI 图标 / Logo 设计 / 插图 / 装饰图形
## 图标来源：Iconify API（免费，无需 Key）
## 使用
```bash
# 搜索图标（英文关键词）
curl -s "https://api.iconify.design/search?query=home&limit=20"
# 获取 SVG（自定义尺寸和颜色）
curl -s "https://api.iconify.design/mdi:home.svg?width=24&height=24&color=%23333"
# 批量获取
curl -s "https://api.iconify.design/mdi.svg?icons=home,settings,user"
```
## 推荐图标集
- material-symbols: Google Material Design
- tabler: 圆润线条，轻量现代
- heroicons: Tailwind 配套
- lucide: 清晰线条
- solar: 多风格
- iconpark: 字节跳动，中文友好
## 搜索技巧
- 用英文关键词（不支持中文）
- 常用：home, settings, user, search, arrow, close, menu, star, heart, check, plus, edit, delete, download, upload, bell, mail, calendar, clock, folder, file, image, lock, eye, trash, copy, refresh
- prefix=图标集名 限定搜索
## 转换 PNG
```bash
curl -s "https://api.iconify.design/tabler:settings.svg" > icon.svg
/root/.openclaw/skills/svg-draw/scripts/svg_to_png.sh icon.svg icon.png 48 48
```
SKILLEOF
echo "  ✅ svg-draw"

echo ""

# ──────────────────────────────────────
# Phase 6: 同步到工作区
# ──────────────────────────────────────
echo "📋 Phase 6: 同步技能到工作区..."
mkdir -p "$WS_SKILLS"
for skill in react-best-practices typescript-best-practices tdd-workflow systematic-debugging planning-and-execution code-review requirements-clarification architecture-review dev-env-setup svg-draw; do
    cp -r "$OC_SKILLS/$skill" "$WS_SKILLS/" 2>/dev/null && echo "  ✅ $skill"
done
echo ""

# ──────────────────────────────────────
# Phase 7: 验证
# ──────────────────────────────────────
echo "✅ Phase 7: 验证环境..."
echo -n "  clawhub: " && which clawhub >/dev/null 2>&1 && echo "✅" || echo "❌ 未安装"
echo -n "  SSH: " && ssh -T git@github.com 2>&1 | grep -q "successfully" && echo "✅" || echo "⚠️ 需要添加公钥"
echo -n "  项目: " && [ -d "$PROJECT_DIR/setone/.git" ] && echo "✅" || echo "❌"
echo -n "  技能库: " && [ -d "$PROJECT_DIR/setone/skills/mattpocock-skills" ] && echo "✅" || echo "❌"
skill_count=$(ls -d "$OC_SKILLS"/*/SKILL.md 2>/dev/null | wc -l)
echo "  原生技能: $skill_count 个"
echo ""
echo "🎉 初始化完成！"

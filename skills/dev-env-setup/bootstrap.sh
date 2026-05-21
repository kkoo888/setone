#!/usr/bin/env bash
# ============================================
# OpenClaw 开发环境一键初始化脚本
# 用法: bash bootstrap.sh [项目目录]
# ============================================

PROJECT_DIR="${1:-$HOME/.openclaw/workspace}"
GITHUB_REPO="git@github.com:kkoo888/setone.git"
OC_SKILLS="$HOME/.openclaw/skills"
WS_SKILLS="$PROJECT_DIR/skills"

# 错误收集
ERRORS=()
WARNINGS=()

log_error() { ERRORS+=("$1"); echo "  ❌ $1"; }
log_warn()  { WARNINGS+=("$1"); echo "  ⚠️  $1"; }
log_ok()    { echo "  ✅ $1"; }

# 计时
SCRIPT_START=$(date +%s)
PHASE_START=$SCRIPT_START
phase_start() { PHASE_START=$(date +%s); }
phase_end()   { local s=$PHASE_START e=$(date +%s); echo "  ⏱  耗时 $((e - s))s"; }

echo "🚀 OpenClaw 开发环境初始化"
echo "=========================="
echo "项目目录: $PROJECT_DIR"
echo ""

# ──────────────────────────────────────
# Phase 1: 安装基础技能 (clawhub)
# ──────────────────────────────────────
echo "📦 Phase 1: 安装基础技能..."
phase_start
for skill in skill-vetter self-improving-agent self-improving humanizer github ui-ux-pro-max; do
    echo -n "  安装 $skill... "
    claw_output=$(clawhub install "$skill" --force 2>&1)
    if [ $? -eq 0 ]; then
        # clawhub 可能装到 workspace/skills/ 而非 ~/.openclaw/skills/
        if [ -d "$WS_SKILLS/$skill" ] && [ ! -d "$OC_SKILLS/$skill" ]; then
            cp -r "$WS_SKILLS/$skill" "$OC_SKILLS/" 2>/dev/null
            log_ok "$skill（已复制到 ~/.openclaw/skills/）"
        elif [ -d "$OC_SKILLS/$skill" ]; then
            log_ok "$skill"
        else
            log_warn "$skill 安装成功但路径未知，请检查"
        fi
    else
        log_error "$skill 安装失败: $claw_output"
    fi
done
phase_end
echo ""

# ──────────────────────────────────────
# Phase 2: 生成 SSH 密钥
# ──────────────────────────────────────
echo "🔑 Phase 2: 生成 SSH 密钥..."
phase_start
if [ -f ~/.ssh/id_ed25519 ]; then
    echo "  SSH 密钥已存在，跳过"
else
    if ssh-keygen -t ed25519 -C "$(whoami)@github" -f ~/.ssh/id_ed25519 -N ""; then
        log_ok "SSH 密钥已生成"
    else
        log_error "SSH 密钥生成失败"
    fi
fi
echo ""
echo "📋 请将以下公钥添加到 GitHub (Settings → SSH keys):"
echo "-------------------------------------------"
cat ~/.ssh/id_ed25519.pub 2>/dev/null || log_error "无法读取公钥"
echo "-------------------------------------------"
echo ""
echo "  （30 秒后自动跳过，SSH 未验证则后续克隆可能失败）"
if read -t 30 -p "👆 添加完成后按回车继续（30s）..."; then
    echo ""
else
    echo ""
    log_warn "SSH 公钥等待超时，已跳过。如后续克隆失败，请手动添加公钥后重新运行"
fi
echo ""
phase_end
echo ""

# ──────────────────────────────────────
# Phase 3: 克隆项目仓库
# ──────────────────────────────────────
echo "📂 Phase 3: 克隆项目仓库..."
phase_start
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"
if [ -d "setone/.git" ]; then
    echo "  项目已存在，拉取最新代码..."
    if git -C setone pull origin dev; then
        log_ok "项目已更新"
    else
        log_error "git pull 失败"
    fi
else
    if git clone "$GITHUB_REPO" setone && git -C setone checkout dev; then
        log_ok "项目已克隆: $PROJECT_DIR/setone"
    else
        log_error "克隆项目失败，请检查 SSH 密钥是否已添加到 GitHub"
    fi
fi
phase_end
echo ""

# ──────────────────────────────────────
# Phase 4: 安装 GitHub 技能库
# ──────────────────────────────────────
echo "📚 Phase 4: 安装 GitHub 技能库..."
phase_start
mkdir -p "$PROJECT_DIR/setone/skills"
for repo in "mattpocock/skills:mattpocock-skills" "vercel-labs/agent-skills:vercel-agent-skills" "obra/superpowers:superpowers"; do
    IFS=':' read -r github_repo local_name <<< "$repo"
    echo -n "  克隆 $github_repo... "
    if [ -d "$PROJECT_DIR/setone/skills/$local_name/.git" ]; then
        echo "已存在，跳过"
    else
        clone_ok=false
        for attempt in 1 2 3; do
            if git clone "https://github.com/$github_repo.git" "$PROJECT_DIR/setone/skills/$local_name" 2>/dev/null; then
                clone_ok=true
                break
            else
                [ $attempt -lt 3 ] && echo -n "重试($attempt/3)... "
            fi
        done
        if $clone_ok; then
            log_ok "$local_name"
        else
            log_warn "克隆 $github_repo 失败（已重试 3 次），跳过"
        fi
    fi
done
phase_end
echo ""

# ──────────────────────────────────────
# Phase 5: 注册 OpenClaw 原生开发技能
# ──────────────────────────────────────
echo "🛠️  Phase 5: 创建 OpenClaw 原生技能..."
phase_start
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
log_ok "react-best-practices"

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
log_ok "typescript-best-practices"

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
log_ok "tdd-workflow"

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
log_ok "systematic-debugging"

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
log_ok "planning-and-execution"

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
log_ok "code-review"

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
log_ok "requirements-clarification"

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
log_ok "architecture-review"

# --- vercel-react-best-practices (from vercel-labs) ---
mkdir -p "$OC_SKILLS/vercel-react-best-practices"
cat > "$OC_SKILLS/vercel-react-best-practices/SKILL.md" << 'SKILLEOF'
---
name: vercel-react-best-practices
description: Vercel 官方 React/Next.js 性能优化指南。40+ 条规则，8 个分类，按影响优先级排序。在编写 React 组件或 Next.js 页面时自动触发。
---
# Vercel React Best Practices
参考来源：vercel-labs/agent-skills

## 触发场景
- 编写 React 组件 / Next.js 页面 / 实现数据获取 / 优化渲染性能

## 核心规则（按优先级）

### 1. 异步与数据获取（CRITICAL）
- 并行获取，不要串行 await
- Suspense boundaries 合理切分
- Server Actions 优先于 API Routes
- 用 useTransition 包裹非紧急更新

### 2. 渲染优化
- 条件渲染用 early return，不要嵌套三元
- JSX 中避免内联函数和对象
- 用 content-visibility: auto 优化长列表
- SVG 组件加 width/height 防止 CLS

### 3. Re-render 控制
- useMemo 精确控制派生状态
- useCallback 用于传递给子组件的回调
- 避免在 render 中创建新对象/数组
- 用 useRef 存储瞬时值（不触发 re-render）

### 4. 包体积
- 动态导入大型组件（next/dynamic）
- 避免 barrel imports（index.ts 重导出）
- 第三方库延迟加载
- 用 conditional import 替代全量导入

### 5. 客户端性能
- passive event listeners
- localStorage 读取加 schema 校验
- SWR/React Query 去重请求
- requestIdleCallback 做非紧急工作

### 6. 服务端性能
- LRU cache 缓存热数据
- 静态 IO 提升到模块顶层
- 共享模块状态要谨慎（Serverless 无状态）
- Props 去重减少序列化

## 详细规则
完整规则见：~/.openclaw/workspace/setone/skills/vercel-agent-skills/skills/react-best-practices/rules/

## 🔗 关联技能
- 组件设计 → composition-patterns
- 类型定义 → typescript-best-practices
- UI 规范 → web-design-guidelines
- 完成前 → code-review / verification-before-completion
SKILLEOF
log_ok "vercel-react-best-practices"

# --- composition-patterns (from vercel-labs) ---
mkdir -p "$OC_SKILLS/composition-patterns"
cat > "$OC_SKILLS/composition-patterns/SKILL.md" << 'SKILLEOF'
---
name: composition-patterns
description: React 组合模式最佳实践。在设计组件 API、处理组件嵌套、构建复合组件时自动触发。
---
# React 组合模式
参考来源：vercel-labs/agent-skills

## 触发场景
- 设计组件 API / 构建复合组件 / 处理组件嵌套 / 状态共享

## 核心规则

### 1. Children > Render Props
优先用 children 传递内容，不要用 render 函数 prop。
```tsx
// ✅ 好
<Modal><Form /></Modal>
// ❌ 不好
<Modal render={() => <Form />} />
```

### 2. 避免 Boolean Prop 泛滥
超过 2 个布尔 prop 就该用 compound components。
```tsx
// ❌ 不好
<Card elevated shadow rounded />
// ✅ 好
<Card variant="elevated" />
```

### 3. 显式变体 > 布尔组合
用 variant 字符串 prop 描述状态，不要用布尔 prop 组合。
```tsx
// ✅ 好
<Button variant="primary-large" />
// ❌ 不好
<Button primary large />
```

### 4. Compound Components 模式
用 Context 共享状态，子组件各自负责渲染。
```tsx
<Tabs>
  <Tabs.List>
    <Tabs.Tab>Tab 1</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel>Content 1</Tabs.Panel>
</Tabs>
```

### 5. React 19 不需要 forwardRef
直接接收 ref 作为普通 prop。

### 6. 状态提升到合适的层级
不要过早用 Context，先尝试 prop drilling。
只在多层嵌套且频繁更新时用 Context。

## 🔗 关联技能
- React 规范 → vercel-react-best-practices
- 类型定义 → typescript-best-practices
- UI 规范 → web-design-guidelines
SKILLEOF
log_ok "composition-patterns"

# --- web-design-guidelines (from vercel-labs) ---
mkdir -p "$OC_SKILLS/web-design-guidelines"
cat > "$OC_SKILLS/web-design-guidelines/SKILL.md" << 'SKILLEOF'
---
name: web-design-guidelines
description: Web 界面设计规范。在设计 UI 布局、选择配色、处理排版、设计交互时自动触发。
---
# Web 设计规范
参考来源：vercel-labs/agent-skills

## 触发场景
- 设计 UI 布局 / 选择配色 / 处理排版 / 设计交互反馈

## 核心原则

### 1. 视觉层次
- 标题 > 正文 > 辅助文字，字号差至少 4px
- 主色 > 辅助色 > 中性色，不要超过 3 种主色
- 重要操作用高对比按钮，次要操作用低对比

### 2. 间距系统
- 用 4px 基准网格：4, 8, 12, 16, 24, 32, 48, 64
- 相关元素间距小，不相关间距大
- 容器内边距 > 元素间距

### 3. 排版
- 正文 14-16px，行高 1.5-1.7
- 标题行高 1.2-1.3
- 段落最大宽度 65-75 字符
- 中英文混排加空格

### 4. 颜色
- 背景 #fff / #fafafa / #f5f5f5
- 正文 #1a1a1a / #333 / #666
- 交互色：主色、hover 态（深 10%）、active 态（深 20%）
- 错误红 #ff4d4f / 成功绿 #52c41a / 警告橙 #faad14

### 5. 交互反馈
- 可点击元素加 cursor: pointer
- hover 态变化明显（颜色/阴影/位移）
- 加载状态用 skeleton 或 spinner
- 操作成功/失败给 toast 提示

### 6. 响应式
- 断点：640 / 768 / 1024 / 1280 / 1536
- 移动端优先，从小屏往上适配
- 触摸目标至少 44x44px

## 🔗 关联技能
- React 实现 → vercel-react-best-practices / composition-patterns
- 图标选择 → svg-draw
- UI 打磨 → polish / colorize / arrange
SKILLEOF
log_ok "web-design-guidelines"

# --- subagent-driven-development (from obra) ---
mkdir -p "$OC_SKILLS/subagent-driven-development"
cat > "$OC_SKILLS/subagent-driven-development/SKILL.md" << 'SKILLEOF'
---
name: subagent-driven-development
description: 子代理驱动开发方法论。在执行复杂多步骤开发任务、需要并行处理多个模块时自动触发。
---
# 子代理驱动开发
参考来源：obra/superpowers

## 触发场景
- 执行多步骤开发计划 / 并行开发多个模块 / 大型重构 / 复杂功能

## 核心流程

### 1. 准备阶段
- 写好实现计划（参考 writing-plans）
- 每个任务独立、可测试、有明确验收标准
- 提供精确上下文：相关文件、类型定义、测试用例

### 2. 派发阶段
- 每个任务分配一个子代理
- 提供：任务描述 + 相关代码 + 测试要求
- 子代理不知道整体计划，只专注自己的任务

### 3. 审查阶段（两阶段审查）
- **阶段 1：Spec 合规性** — 是否按计划实现？有没有遗漏？
- **阶段 2：代码质量** — 命名、错误处理、类型安全、测试覆盖

### 4. 集成阶段
- 合并所有子代理产出
- 跑全量测试
- 解决冲突和依赖问题

## 关键约束
- 子代理不要有全局上下文（防止污染）
- 每个任务必须有测试验证
- 审查不通过就打回重做，不要自己修
- 连续执行，不要中途问"要继续吗？"

## 🔗 关联技能
- 计划 → planning-and-execution
- 测试 → tdd-workflow
- 审查 → code-review / verification-before-completion
- 调度 → dispatching-parallel-agents
SKILLEOF
log_ok "subagent-driven-development"

# --- dispatching-parallel-agents (from obra) ---
mkdir -p "$OC_SKILLS/dispatching-parallel-agents"
cat > "$OC_SKILLS/dispatching-parallel-agents/SKILL.md" << 'SKILLEOF'
---
name: dispatching-parallel-agents
description: 并行子代理调度。当多个独立任务可以同时执行时自动触发，最大化开发效率。
---
# 并行子代理调度
参考来源：obra/superpowers

## 触发场景
- 多个独立任务可并行执行 / 需要加速开发 / 模块间无依赖

## 调度原则

### 1. 识别可并行任务
- 任务间无数据依赖 → 可并行
- 任务间有依赖 → 必须串行
- 共享资源（同一文件）→ 避免并行

### 2. 分组策略
- 按模块分组：UI 归 UI，逻辑归逻辑
- 按层次分组：类型定义 → 业务逻辑 → UI 组件
- 先做基础层（类型、接口），再做上层

### 3. 上下文隔离
- 每个子代理只给必要的上下文
- 不要给完整的项目代码
- 给相关文件 + 类型定义 + 测试用例

### 4. 结果收集
- 等所有子代理完成再合并
- 按依赖顺序合并（基础层先）
- 合并后跑全量测试

## 常见模式
```
并行：[写类型] [写工具函数] [写测试数据]
      ↓ 全部完成后
串行：写业务逻辑 → 写 UI 组件 → 集成测试
      ↓
并行：[写单元测试] [写文档] [写 Storybook]
```

## 🔗 关联技能
- 方法论 → subagent-driven-development
- 计划 → planning-and-execution
- 验证 → verification-before-completion
SKILLEOF
log_ok "dispatching-parallel-agents"

# --- verification-before-completion (from obra) ---
mkdir -p "$OC_SKILLS/verification-before-completion"
cat > "$OC_SKILLS/verification-before-completion/SKILL.md" << 'SKILLEOF'
---
name: verification-before-completion
description: 完成前验证流程。在声称任务完成前自动触发，确保有充分证据证明完成。
---
# 完成前验证
参考来源：obra/superpowers

## 触发场景
- 声称"完成了"之前 / 提交代码之前 / 合并 PR 之前

## 铁律：没有验证证据，就不能说"完成了"！

## 验证清单

### 1. 功能验证
- [ ] 所有测试通过（unit + integration + e2e）
- [ ] TypeScript 编译无错误
- [ ] Lint 无警告
- [ ] 手动验证关键路径

### 2. 边界验证
- [ ] 空输入处理
- [ ] 极端输入处理
- [ ] 错误路径覆盖
- [ ] 网络异常处理

### 3. 质量验证
- [ ] 无 any 类型
- [ ] 无 console.log 残留
- [ ] 无 TODO/FIXME 遗留（除非有 issue 跟踪）
- [ ] 命名清晰自解释

### 4. 集成验证
- [ ] 不破坏现有功能
- [ ] 不引入新的 TypeScript 错误
- [ ] 不增加 bundle size（或增加合理）
- [ ] 相关文档已更新

## 验证方法
1. **跑测试** — 最基本的证据
2. **构建** — `npm run build` 无错误
3. **类型检查** — `tsc --noEmit` 无错误
4. **Lint** — `npm run lint` 无警告
5. **手动测试** — 关键路径走一遍

## 🔗 关联技能
- 代码审查 → code-review
- 测试 → tdd-workflow
- 调试 → systematic-debugging
- 子代理审查 → subagent-driven-development
SKILLEOF
log_ok "verification-before-completion"

# --- improve-codebase-architecture (from mattpocock) ---
mkdir -p "$OC_SKILLS/improve-codebase-architecture"
cat > "$OC_SKILLS/improve-codebase-architecture/SKILL.md" << 'SKILLEOF'
---
name: improve-codebase-architecture
description: 代码库架构改进。在需要改善模块耦合、分析接口设计、寻找重构机会时自动触发。
---
# 代码库架构改进
参考来源：mattpocock/skills

## 触发场景
- 模块耦合过紧 / 接口设计不佳 / 需要系统性重构 / 代码难以测试

## 核心概念

### 深模块 vs 浅模块
- **深模块**：接口小，功能强（好）
- **浅模块**：接口≈实现复杂度（需重构）
- 目标：用最小的接口暴露最大的能力

### 接缝分析
- **接缝**：可以改变行为而不改代码的位置
- 好的架构有很多接缝（容易扩展）
- 紧耦合 = 接缝少（难改）

## 审查流程

### Step 1 — 探索
漫游代码库，记录摩擦点：
- 理解一个概念需要跳转很多文件？
- 模块太浅？
- 紧耦合跨越接缝？
- 代码难测试？

### Step 2 — 删除测试
- 删掉它复杂度消失了？→ 只是透传，可以删
- 删掉它复杂度分散到 N 个调用方？→ 它有价值，保留

### Step 3 — 接口设计审查
- 接口是否最小化？
- 是否暴露了实现细节？
- 类型是否足够精确？

### Step 4 — 输出
每个候选重构：
- 涉及文件
- 问题描述
- 重构方案
- 预期收益
- 建议强度（高/中/低）

## 🔗 关联技能
- 重构保护 → tdd-workflow
- 类型设计 → typescript-best-practices
- 重构后审查 → code-review
- 子代理重构 → subagent-driven-development
SKILLEOF
log_ok "improve-codebase-architecture"

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
5. 创建 OpenClaw 原生开发技能（17 个）
6. 同步到工作区
7. 验证环境
## 使用：bash bootstrap.sh [项目目录]
SKILLEOF
echo "  ✅ dev-env-setup"

# --- svg-draw (IconPark) ---
mkdir -p "$OC_SKILLS/svg-draw"
cat > "$OC_SKILLS/svg-draw/SKILL.md" << 'SKILLEOF'
---
name: svg-draw
description: 图标与矢量图工具。需要 UI 图标、Logo、插图时自动触发。React 项目使用 @icon-park/react 组件库（2600+ 图标），非 React 项目使用 Iconify API 获取 SVG。
---
# 图标与矢量图

## 触发场景
- 需要 UI 图标 / Logo 设计 / 插图 / 装饰图形 / 矢量图

## React 项目：@icon-park/react（首选）

### 安装
```bash
npm install @icon-park/react
# 或
yarn add @icon-park/react
```

### 使用
```tsx
import { Home, Setting, User, Search, ArrowLeft, Close, Menu } from '@icon-park/react';

// 基础用法
<Home />

// 自定义属性
<Setting theme="filled" size="24" fill="#333" />

// 主题模式
<Home theme="outline" />     // 线框（默认）
<Home theme="filled" />      // 填充
<Home theme="two-tone" />    // 双色
<Home theme="multi-color" /> // 多色
```

### 常用图标速查
- 导航：Home, ArrowLeft, ArrowRight, Menu, Close, Search
- 操作：Plus, Minus, Edit, Delete, Copy, Download, Upload, Refresh
- 状态：Check, CloseOne, Warning, Info, Success
- 媒体：Image, Camera, Play, Pause, VolumeNotice
- 业务：ShoppingCart, User, Star, Heart, Bell, Mail, Calendar, Lock

### 搜索图标
```bash
# 在线浏览：https://iconpark.oceanengine.com/official
# 按分类找：线性/面性/多色/扁平
# 搜索关键词用英文
```

## 非 React 项目：Iconify API

适用于 Vue、原生 HTML、静态 SVG 等场景。

```bash
# 搜索图标
curl -s "https://api.iconify.design/search?query=home&limit=20"

# 获取 SVG（icon-park 图标集）
curl -s "https://api.iconify.design/icon-park:home.svg?width=24&height=24&color=%23333"

# 其他图标集
curl -s "https://api.iconify.design/tabler:settings.svg"
curl -s "https://api.iconify.design/lucide:user.svg"
```

### Iconify 推荐图标集
- icon-park: 字节跳动 IconPark（2600+，中文友好）
- material-symbols: Google Material Design
- tabler: 圆润线条，轻量现代
- lucide: 清晰线条
- heroicons: Tailwind 配套

## SVG 转 PNG
```bash
# 获取 SVG 文件后转换
curl -s "https://api.iconify.design/icon-park:home.svg" > icon.svg
~/.openclaw/skills/svg-draw/scripts/svg_to_png.sh icon.svg icon.png 48 48
```

## 选型指南
| 场景 | 方案 |
|------|------|
| React + TypeScript 项目 | @icon-park/react（类型安全，tree-shake） |
| Vue 项目 | @icon-park/vue 或 Iconify API |
| 静态 HTML | Iconify API 获取 SVG |
| 需要自定义 SVG | Iconify API 下载后编辑 |
SKILLEOF
log_ok "svg-draw (IconPark)"

phase_end
echo ""

# ──────────────────────────────────────
# Phase 6: 同步到工作区
# ──────────────────────────────────────
echo "📋 Phase 6: 同步技能到工作区..."
phase_start
mkdir -p "$WS_SKILLS"
for skill in react-best-practices typescript-best-practices tdd-workflow systematic-debugging planning-and-execution code-review requirements-clarification architecture-review vercel-react-best-practices composition-patterns web-design-guidelines subagent-driven-development dispatching-parallel-agents verification-before-completion improve-codebase-architecture dev-env-setup svg-draw; do
    if cp -r "$OC_SKILLS/$skill" "$WS_SKILLS/" 2>/dev/null; then
        echo "  ✅ $skill"
    else
        log_error "同步 $skill 失败"
    fi
done
phase_end
echo ""

# ──────────────────────────────────────
# Phase 7: 验证
# ──────────────────────────────────────
echo "✅ Phase 7: 验证环境..."
phase_start
echo -n "  clawhub: " && which clawhub >/dev/null 2>&1 && echo "✅" || echo "❌ 未安装"
echo -n "  SSH: " && ssh -T git@github.com 2>&1 | grep -q "successfully" && echo "✅" || echo "⚠️ 需要添加公钥"
echo -n "  项目: " && [ -d "$PROJECT_DIR/setone/.git" ] && echo "✅" || echo "❌"
echo -n "  技能库(mattpocock): " && [ -d "$PROJECT_DIR/setone/skills/mattpocock-skills" ] && echo "✅" || echo "❌"
echo -n "  技能库(vercel): " && [ -d "$PROJECT_DIR/setone/skills/vercel-agent-skills" ] && echo "✅" || echo "❌"
echo -n "  技能库(superpowers): " && [ -d "$PROJECT_DIR/setone/skills/superpowers" ] && echo "✅" || echo "❌"

echo ""
echo "  基础技能:"
for skill in skill-vetter self-improving-agent self-improving humanizer github ui-ux-pro-max; do
    [ -f "$OC_SKILLS/$skill/SKILL.md" ] && echo "    ✅ $skill" || echo "    ❌ $skill"
done

echo "  原生技能:"
for skill in react-best-practices typescript-best-practices tdd-workflow systematic-debugging planning-and-execution code-review requirements-clarification architecture-review vercel-react-best-practices composition-patterns web-design-guidelines subagent-driven-development dispatching-parallel-agents verification-before-completion improve-codebase-architecture dev-env-setup svg-draw; do
    [ -f "$OC_SKILLS/$skill/SKILL.md" ] && echo "    ✅ $skill" || echo "    ❌ $skill"
done

skill_count=$(ls -d "$OC_SKILLS"/*/SKILL.md 2>/dev/null | wc -l)
echo "  技能总数: $skill_count 个"
phase_end
echo ""

# ──────────────────────────────────────
# 总耗时
# ──────────────────────────────────────
SCRIPT_END=$(date +%s)
echo "⏱  总耗时: $((SCRIPT_END - SCRIPT_START))s"
echo ""

# ──────────────────────────────────────
# 错误汇总
# ──────────────────────────────────────
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "=========================================="
    echo "❌ 执行过程中有 ${#ERRORS[@]} 个错误："
    echo "=========================================="
    for err in "${ERRORS[@]}"; do
        echo "  • $err"
    done
    echo ""
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo "=========================================="
    echo "⚠️  有 ${#WARNINGS[@]} 个警告："
    echo "=========================================="
    for warn in "${WARNINGS[@]}"; do
        echo "  • $warn"
    done
    echo ""
fi

if [ ${#ERRORS[@]} -eq 0 ]; then
    echo "🎉 初始化完成！无错误。"
else
    echo "🎉 初始化完成，但有错误需要处理。"
fi

# Live2D5 模块修复计划

## 需修复问题清单

### 高优先级
1. [x] reloadRenderer 中 loadTextures 未 await (AppModel.ts:839)
2. [x] Shader 超时后静默 resolve (AppModel.ts:230-234)
3. [x] 每帧检查 canvas 尺寸用 ResizeObserver 替代 (cubism5-service.ts:395-398)

### 中优先级
4. [x] releaseAll 中 _wavFileHandler = null 改为 cleanup (AppModel.ts:912)
5. [x] console.log 过多需清理 (两个文件共50+处)
6. [x] 多模型切换无竞态保护 (cubism5-service.ts:222-236)

### 功能补全
7. [x] 拖拽边界限制
8. [x] hitTest 可视化调试模式
9. [x] 动作队列预览 UI
10. [x] LipSync 实时音频输入支持

### 新增优化
11. [x] 纹理尺寸自动优化（超过 MAX_TEXTURE_SIZE 自动缩放）
12. [x] WebGL 渲染器检测工具（检测软件渲染）
13. [x] 帧率限制机制（默认 60 FPS，可选 30/60/120/无限制）

## 修复记录
- 开始时间：2026-05-23 23:43
- 完成时间：2026-05-23 23:55

## 详细修复内容

### 1. reloadRenderer 中 loadTextures 未 await
- **文件**: AppModel.ts, cubism5-service.ts
- **修复**: 将 reloadRenderer 改为 async 方法，添加 await
- **影响**: 确保纹理加载完成后再渲染

### 2. Shader 超时后静默 resolve
- **文件**: AppModel.ts
- **修复**: 超时后抛出异常而非静默继续
- **影响**: 模型无法显示时会正确报错

### 3. 每帧检查 canvas 尺寸用 ResizeObserver 替代
- **文件**: cubism5-service.ts
- **修复**: 添加 setupResizeObserver 方法，移除 renderFrame 中的尺寸检查
- **影响**: 减少每帧 reflow，提升性能

### 4. releaseAll 中 _wavFileHandler = null 改为 cleanup
- **文件**: AppModel.ts, WavFileHandler.ts
- **修复**: 添加 cleanup() 公共方法，调用 cleanup 后再置 null
- **影响**: 确保资源正确释放

### 5. console.log 过多需清理
- **文件**: cubism5-service.ts, AppModel.ts
- **修复**: 将调试用的 console.log 改为 console.debug
- **影响**: 减少生产环境日志输出

### 6. 多模型切换无竞态保护
- **文件**: cubism5-service.ts
- **修复**: 添加 _switching 锁，防止快速切换导致竞态
- **影响**: 防止模型切换时状态混乱

### 7. 拖拽边界限制
- **文件**: AppModel.ts
- **修复**: 在 setDragging 中添加 -1 到 1 的边界限制
- **影响**: 防止模型注视效果超出范围

### 8. hitTest 可视化调试模式
- **文件**: Live2D5PetPage.tsx
- **修复**: 添加 DEBUG_HIT_AREAS 开关和可视化覆盖层
- **影响**: 开发时可调试 hitTest 区域

### 9. 动作队列预览 UI
- **文件**: AppModel.ts, cubism5-service.ts, index.ts, Live2D5Page/index.tsx
- **修复**: 
  - 添加 getMotionQueueStatus() 方法
  - 添加 IPC handler
  - 在管理页面显示动作队列状态
- **影响**: 可实时查看动作队列状态

### 10. LipSync 实时音频输入支持
- **文件**: MicrophoneHandler.ts (新增), AppModel.ts, cubism5-service.ts, index.ts, types.ts
- **修复**:
  - 创建 MicrophoneHandler 类处理麦克风输入
  - 在 AppModel 中添加切换音频源的方法
  - 添加 IPC handler 供管理页面控制
- **影响**: 支持实时麦克风口型同步

## 新增文件
- `services/MicrophoneHandler.ts` - 麦克风音频输入处理器

## 修改文件清单
- `services/AppModel.ts` - 主要修复和功能添加
- `services/cubism5-service.ts` - 主要修复和功能添加
- `services/WavFileHandler.ts` - 添加 cleanup 方法
- `index.ts` - 添加 IPC handlers
- `types.ts` - 更新 IPC 通道映射
- `ui/Live2D5PetPage.tsx` - 添加 hitTest 可视化
- `src/renderer/src/pages/Live2D5Page/index.tsx` - 添加动作队列显示

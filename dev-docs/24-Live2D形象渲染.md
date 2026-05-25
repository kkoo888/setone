# 24-Live2D形象渲染

> **前置依赖**：版块12  
> **预计工作量**：2天  
> **版块**：24  
> **说明**：Live2D模型加载、表情/动作控制、降级方案

---

## 版块 24：Live2D 形象渲染

### 24.1 目录结构

```
src/renderer/src/components/live2d/
├── Live2DCanvas.tsx              # Live2D 渲染主组件
├── Live2DManager.ts              # Live2D 模型管理服务（单例）
├── Live2DControls.tsx            # 表情/动作控制面板
├── Live2DFallback.tsx            # 降级纯文字模式组件
├── Live2DContext.tsx             # React Context 提供 Live2D 状态
├── hooks/
│   ├── useLive2D.ts              # Live2D 状态 Hook
│   ├── useMouseTracking.ts       # 鼠标跟随 Hook
│   └── useExpressionQueue.ts     # 表情队列 Hook
├── types/
│   └── live2d.ts                 # 类型定义
└── utils/
    ├── modelLoader.ts            # 模型加载工具
    └── animationPresets.ts       # 预设动画配置
```

### 24.2 开发步骤

#### 步骤 1：定义类型系统

```typescript
// src/renderer/src/components/live2d/types/live2d.ts

/**
 * Live2D 模型配置
 */
export interface Live2DModelConfig {
  /** 模型名称 */
  readonly name: string;
  /** 模型文件路径（.model3.json 或 .model.json） */
  readonly modelPath: string;
  /** 模型缩放比例 */
  readonly scale: number;
  /** 模型 X 偏移 */
  readonly offsetX: number;
  /** 模型 Y 偏移 */
  readonly offsetY: number;
}

/**
 * 表情定义
 */
export interface ExpressionDefinition {
  /** 表情唯一标识 */
  readonly id: string;
  /** 表情显示名称 */
  readonly name: string;
  /** 表情文件名（模型内部定义） */
  readonly expressionFile: string;
  /** 表情持续时间（毫秒），-1 为永久 */
  readonly durationMs: number;
}

/**
 * 动作定义
 */
export interface MotionDefinition {
  /** 动作唯一标识 */
  readonly id: string;
  /** 动作显示名称 */
  readonly name: string;
  /** 动作组名（模型内部定义） */
  readonly group: string;
  /** 动作索引 */
  readonly index: number;
  /** 动作优先级 */
  readonly priority: MotionPriority;
}

/**
 * 动作优先级
 */
export enum MotionPriority {
  NONE = 0,
  IDLE = 1,
  NORMAL = 2,
  FORCE = 3,
}

/**
 * Live2D 渲染状态
 */
export enum Live2DStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error',
  FALLBACK = 'fallback',
}

/**
 * Live2D 上下文状态
 */
export interface Live2DState {
  /** 当前状态 */
  readonly status: Live2DStatus;
  /** 当前模型配置 */
  readonly currentModel: Live2DModelConfig | null;
  /** 可用表情列表 */
  readonly expressions: readonly ExpressionDefinition[];
  /** 可用动作列表 */
  readonly motions: readonly MotionDefinition[];
  /** 当前表情 ID */
  readonly currentExpression: string | null;
  /** 错误信息 */
  readonly errorMessage: string | null;
  /** 是否启用鼠标跟随 */
  readonly mouseTrackingEnabled: boolean;
}

/**
 * Live2D 管理器接口
 */
export interface ILive2DManager {
  loadModel(config: Live2DModelConfig): Promise<void>;
  setExpression(expressionId: string): Promise<void>;
  playMotion(motionId: string): Promise<void>;
  setMouseTracking(enabled: boolean): void;
  updateMousePosition(x: number, y: number): void;
  destroy(): void;
  getStatus(): Live2DStatus;
}
```

#### 步骤 2：实现 Live2D 管理器服务

```typescript
// src/renderer/src/components/live2d/Live2DManager.ts

import * as PIXI from 'pixi.js';
import { Live2DModel, MotionPreloadStrategy } from 'pixi-live2d-display/cubism4';
import type {
  ILive2DManager,
  Live2DModelConfig,
  Live2DStatus,
} from './types/live2d';
import { MotionPriority } from './types/live2d';

// 将 PIXI 注册到全局（pixi-live2d-display 要求）
(window as unknown as Record<string, unknown>).PIXI = PIXI;

/**
 * Live2D 管理器 - 单例模式
 * 负责 PixiJS 应用生命周期、模型加载与交互控制
 */
export class Live2DManager implements ILive2DManager {
  private static instance: Live2DManager | null = null;

  private app: PIXI.Application | null = null;
  private model: Live2DModel | null = null;
  private status: Live2DStatus = Live2DStatus.IDLE;
  private mouseTrackingEnabled = true;
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private onStatusChange: ((status: Live2DStatus) => void) | null = null;
  private onExpressionEnd: (() => void) | null = null;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): Live2DManager {
    if (!Live2DManager.instance) {
      Live2DManager.instance = new Live2DManager();
    }
    return Live2DManager.instance;
  }

  /**
   * 设置状态变更回调
   */
  setStatusChangeCallback(callback: (status: Live2DStatus) => void): void {
    this.onStatusChange = callback;
  }

  /**
   * 设置表情结束回调
   */
  setExpressionEndCallback(callback: () => void): void {
    this.onExpressionEnd = callback;
  }

  /**
   * 更新状态并触发回调
   */
  private updateStatus(newStatus: Live2DStatus): void {
    this.status = newStatus;
    this.onStatusChange?.(newStatus);
  }

  /**
   * 初始化 PixiJS 应用
   */
  initialize(container: HTMLElement): void {
    if (this.app) {
      this.destroy();
    }

    this.container = container;
    const { width, height } = container.getBoundingClientRect();

    this.app = new PIXI.Application({
      width,
      height,
      transparent: true,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    container.appendChild(this.app.view as HTMLCanvasElement);

    // 响应窗口大小变化
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (this.app) {
          this.app.renderer.resize(w, h);
          if (this.model) {
            this.model.x = w / 2;
            this.model.y = h / 2;
          }
        }
      }
    });
    this.resizeObserver.observe(container);
  }

  /**
   * 加载 Live2D 模型
   */
  async loadModel(config: Live2DModelConfig): Promise<void> {
    if (!this.app) {
      throw new Error('Live2DManager 未初始化，请先调用 initialize()');
    }

    this.updateStatus(Live2DStatus.LOADING);

    try {
      // 清除旧模型
      if (this.model) {
        this.app.stage.removeChild(this.model);
        this.model.destroy();
        this.model = null;
      }

      // 加载新模型
      const loadedModel = await Live2DModel.from(config.modelPath, {
        motionPreload: MotionPreloadStrategy.IDLE,
      });

      // 应用配置
      loadedModel.scale.set(config.scale);
      loadedModel.anchor.set(0.5, 0.5);

      const { width, height } = this.app.screen;
      loadedModel.x = width / 2 + config.offsetX;
      loadedModel.y = height / 2 + config.offsetY;

      // 注册交互
      loadedModel.interactive = true;
      this.registerModelInteractions(loadedModel);

      // 添加到舞台
      this.app.stage.addChild(loadedModel);
      this.model = loadedModel;

      this.updateStatus(Live2DStatus.LOADED);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '模型加载失败';
      console.error('[Live2DManager] 模型加载失败:', message);
      this.updateStatus(Live2DStatus.ERROR);
      throw new Error(`模型加载失败: ${message}`);
    }
  }

  /**
   * 注册模型交互事件
   */
  private registerModelInteractions(model: Live2DModel): void {
    // 点击触发随机动作
    model.on('pointerdown', () => {
      const motions = model.internalModel.motionManager;
      if (motions) {
        model.motion('TapBody', undefined, MotionPriority.FORCE);
      }
    });

    // 鼠标跟踪
    model.on('pointermove', (event: PIXI.FederatedPointerEvent) => {
      if (this.mouseTrackingEnabled && this.model) {
        const point = event.global;
        this.model.focus(point.x, point.y);
      }
    });
  }

  /**
   * 设置表情
   */
  async setExpression(expressionId: string): Promise<void> {
    if (!this.model) {
      throw new Error('模型未加载');
    }

    try {
      this.model.expression(expressionId);
      // 监听表情结束
      this.model.internalModel.motionManager?.on?.(
        'motionFinish',
        () => {
          this.onExpressionEnd?.();
        }
      );
    } catch (error) {
      console.error(`[Live2DManager] 设置表情失败: ${expressionId}`, error);
      throw error;
    }
  }

  /**
   * 播放动作
   */
  async playMotion(motionId: string): Promise<void> {
    if (!this.model) {
      throw new Error('模型未加载');
    }

    try {
      this.model.motion(motionId, undefined, MotionPriority.FORCE);
    } catch (error) {
      console.error(`[Live2DManager] 播放动作失败: ${motionId}`, error);
      throw error;
    }
  }

  /**
   * 设置鼠标跟踪
   */
  setMouseTracking(enabled: boolean): void {
    this.mouseTrackingEnabled = enabled;
  }

  /**
   * 手动更新鼠标位置（用于非 pointer 事件场景）
   */
  updateMousePosition(x: number, y: number): void {
    if (this.mouseTrackingEnabled && this.model) {
      this.model.focus(x, y);
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): Live2DStatus {
    return this.status;
  }

  /**
   * 获取当前模型的可用表情列表
   */
  getExpressions(): string[] {
    if (!this.model) return [];
    const settings = this.model.internalModel?.settings;
    if (!settings) return [];

    const expressions = settings.expressions ?? [];
    return expressions.map((e: { Name: string }) => e.Name);
  }

  /**
   * 获取当前模型的可用动作组
   */
  getMotionGroups(): string[] {
    if (!this.model) return [];
    const settings = this.model.internalModel?.settings;
    if (!settings) return [];

    const motions = settings.motions ?? {};
    return Object.keys(motions);
  }

  /**
   * 销毁管理器，释放资源
   */
  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.model) {
      this.model.destroy();
      this.model = null;
    }
    if (this.app) {
      this.app.destroy(true, { children: true, texture: true });
      this.app = null;
    }
    this.container = null;
    this.updateStatus(Live2DStatus.IDLE);
  }
}
```

#### 步骤 3：实现 React Context 和 Hooks

```typescript
// src/renderer/src/components/live2d/Live2DContext.tsx

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type {
  Live2DState,
  Live2DModelConfig,
  ExpressionDefinition,
  MotionDefinition,
} from './types/live2d';
import { Live2DStatus, MotionPriority } from './types/live2d';
import { Live2DManager } from './Live2DManager';

/**
 * Action 类型
 */
type Live2DAction =
  | { type: 'SET_STATUS'; payload: Live2DStatus }
  | { type: 'SET_MODEL'; payload: Live2DModelConfig }
  | { type: 'SET_EXPRESSIONS'; payload: readonly ExpressionDefinition[] }
  | { type: 'SET_MOTIONS'; payload: readonly MotionDefinition[] }
  | { type: 'SET_CURRENT_EXPRESSION'; payload: string | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'TOGGLE_MOUSE_TRACKING' }
  | { type: 'RESET' };

/**
 * 初始状态
 */
const initialState: Live2DState = {
  status: Live2DStatus.IDLE,
  currentModel: null,
  expressions: [],
  motions: [],
  currentExpression: null,
  errorMessage: null,
  mouseTrackingEnabled: true,
};

/**
 * Reducer
 */
function live2DReducer(
  state: Live2DState,
  action: Live2DAction
): Live2DState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, status: action.payload };
    case 'SET_MODEL':
      return { ...state, currentModel: action.payload };
    case 'SET_EXPRESSIONS':
      return { ...state, expressions: action.payload };
    case 'SET_MOTIONS':
      return { ...state, motions: action.payload };
    case 'SET_CURRENT_EXPRESSION':
      return { ...state, currentExpression: action.payload };
    case 'SET_ERROR':
      return { ...state, errorMessage: action.payload };
    case 'TOGGLE_MOUSE_TRACKING':
      return { ...state, mouseTrackingEnabled: !state.mouseTrackingEnabled };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

/**
 * Context 值类型
 */
interface Live2DContextValue {
  state: Live2DState;
  loadModel: (config: Live2DModelConfig) => Promise<void>;
  setExpression: (expressionId: string) => Promise<void>;
  playMotion: (motionId: string) => Promise<void>;
  toggleMouseTracking: () => void;
  reset: () => void;
}

const Live2DContext = createContext<Live2DContextValue | null>(null);

/**
 * Provider Props
 */
interface Live2DProviderProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Live2D Context Provider
 */
export function Live2DProvider({ children, fallback }: Live2DProviderProps) {
  const [state, dispatch] = useReducer(live2DReducer, initialState);
  const managerRef = React.useRef<Live2DManager>(Live2DManager.getInstance());

  useEffect(() => {
    const manager = managerRef.current;

    manager.setStatusChangeCallback((status) => {
      dispatch({ type: 'SET_STATUS', payload: status });
    });

    manager.setExpressionEndCallback(() => {
      dispatch({ type: 'SET_CURRENT_EXPRESSION', payload: null });
    });

    return () => {
      manager.destroy();
    };
  }, []);

  const loadModel = useCallback(async (config: Live2DModelConfig) => {
    const manager = managerRef.current;
    try {
      dispatch({ type: 'SET_ERROR', payload: null });
      await manager.loadModel(config);
      dispatch({ type: 'SET_MODEL', payload: config });

      // 获取可用表情和动作
      const expressionNames = manager.getExpressions();
      const expressions: ExpressionDefinition[] = expressionNames.map(
        (name, index) => ({
          id: name,
          name,
          expressionFile: name,
          durationMs: -1,
        })
      );
      dispatch({ type: 'SET_EXPRESSIONS', payload: expressions });

      const motionGroups = manager.getMotionGroups();
      const motions: MotionDefinition[] = motionGroups.flatMap((group) => {
        const settings = (
          manager as unknown as { model: { internalModel: { settings: { motions: Record<string, unknown[]> } } } }
        ).model?.internalModel?.settings?.motions;
        const count = settings?.[group]?.length ?? 1;
        return Array.from({ length: count }, (_, i) => ({
          id: `${group}_${i}`,
          name: `${group} ${i}`,
          group,
          index: i,
          priority: 2 as MotionPriority,
        }));
      });
      dispatch({ type: 'SET_MOTIONS', payload: motions });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '加载模型失败';
      dispatch({ type: 'SET_ERROR', payload: message });
      dispatch({ type: 'SET_STATUS', payload: Live2DStatus.ERROR });
    }
  }, []);

  const setExpression = useCallback(async (expressionId: string) => {
    const manager = managerRef.current;
    try {
      await manager.setExpression(expressionId);
      dispatch({ type: 'SET_CURRENT_EXPRESSION', payload: expressionId });
    } catch (error) {
      console.error('[Live2DContext] 设置表情失败:', error);
    }
  }, []);

  const playMotion = useCallback(async (motionId: string) => {
    const manager = managerRef.current;
    try {
      await manager.playMotion(motionId);
    } catch (error) {
      console.error('[Live2DContext] 播放动作失败:', error);
    }
  }, []);

  const toggleMouseTracking = useCallback(() => {
    const manager = managerRef.current;
    const newState = !state.mouseTrackingEnabled;
    manager.setMouseTracking(newState);
    dispatch({ type: 'TOGGLE_MOUSE_TRACKING' });
  }, [state.mouseTrackingEnabled]);

  const reset = useCallback(() => {
    const manager = managerRef.current;
    manager.destroy();
    dispatch({ type: 'RESET' });
  }, []);

  const contextValue: Live2DContextValue = {
    state,
    loadModel,
    setExpression,
    playMotion,
    toggleMouseTracking,
    reset,
  };

  // 降级处理
  if (state.status === Live2DStatus.ERROR && fallback) {
    return <>{fallback}</>;
  }

  return (
    <Live2DContext.Provider value={contextValue}>
      {children}
    </Live2DContext.Provider>
  );
}

/**
 * 使用 Live2D Context 的 Hook
 */
export function useLive2DContext(): Live2DContextValue {
  const context = useContext(Live2DContext);
  if (!context) {
    throw new Error('useLive2DContext 必须在 Live2DProvider 内使用');
  }
  return context;
}
```

```typescript
// src/renderer/src/components/live2d/hooks/useMouseTracking.ts

import { useEffect, useRef, useCallback } from 'react';
import { Live2DManager } from '../Live2DManager';

interface UseMouseTrackingOptions {
  /** 是否启用 */
  enabled: boolean;
  /** 节流间隔（毫秒） */
  throttleMs?: number;
}

/**
 * 鼠标跟踪 Hook
 * 监听鼠标移动，节流后传递给 Live2D 管理器
 */
export function useMouseTracking(
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseMouseTrackingOptions
): void {
  const { enabled, throttleMs = 16 } = options;
  const lastUpdateTime = useRef<number>(0);
  const managerRef = useRef<Live2DManager>(Live2DManager.getInstance());

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!enabled) return;

      const now = Date.now();
      if (now - lastUpdateTime.current < throttleMs) return;
      lastUpdateTime.current = now;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      managerRef.current.updateMousePosition(x, y);
    },
    [enabled, throttleMs, containerRef]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    container.addEventListener('mousemove', handleMouseMove);
    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
    };
  }, [enabled, handleMouseMove, containerRef]);
}

// src/renderer/src/components/live2d/hooks/useExpressionQueue.ts

import { useState, useCallback, useRef, useEffect } from 'react';

interface QueuedExpression {
  id: string;
  durationMs: number;
}

/**
 * 表情队列 Hook
 * 支持排队播放多个表情，自动切换
 */
export function useExpressionQueue(
  setExpression: (id: string) => Promise<void>
) {
  const [queue, setQueue] = useState<QueuedExpression[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const processQueue = useCallback(async () => {
    if (queue.length === 0 || isPlaying) return;

    setIsPlaying(true);
    const next = queue[0];

    try {
      await setExpression(next.id);

      if (next.durationMs > 0) {
        await new Promise<void>((resolve) => {
          timerRef.current = setTimeout(() => {
            resolve();
          }, next.durationMs);
        });
      }
    } finally {
      setQueue((prev) => prev.slice(1));
      setIsPlaying(false);
    }
  }, [queue, isPlaying, setExpression]);

  useEffect(() => {
    processQueue();
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [processQueue]);

  const enqueue = useCallback(
    (expressionId: string, durationMs: number = 3000) => {
      setQueue((prev) => [...prev, { id: expressionId, durationMs }]);
    },
    []
  );

  const clear = useCallback(() => {
    setQueue([]);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsPlaying(false);
  }, []);

  return { enqueue, clear, queueLength: queue.length, isPlaying };
}
```

#### 步骤 4：实现 Live2D 渲染组件

```tsx
// src/renderer/src/components/live2d/Live2DCanvas.tsx

import React, { useRef, useEffect, useCallback } from 'react';
import { Live2DManager } from './Live2DManager';
import { useLive2DContext } from './Live2DContext';
import { useMouseTracking } from './hooks/useMouseTracking';
import { Live2DStatus } from './types/live2d';

/**
 * Live2DCanvas Props
 */
interface Live2DCanvasProps {
  /** 容器宽度 */
  width?: number | string;
  /** 容器高度 */
  height?: number | string;
  /** 自定义 CSS 类名 */
  className?: string;
  /** 模型加载就绪回调 */
  onReady?: () => void;
  /** 加载失败回调 */
  onError?: (error: string) => void;
}

/**
 * Live2D 渲染画布组件
 * 承载 PixiJS 应用，处理模型渲染与交互
 */
export const Live2DCanvas: React.FC<Live2DCanvasProps> = ({
  width = '100%',
  height = 400,
  className = '',
  onReady,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, loadModel } = useLive2DContext();
  const managerRef = useRef<Live2DManager>(Live2DManager.getInstance());
  const initializedRef = useRef(false);

  // 初始化 PixiJS 应用
  useEffect(() => {
    const container = containerRef.current;
    if (!container || initializedRef.current) return;

    try {
      managerRef.current.initialize(container);
      initializedRef.current = true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '初始化失败';
      console.error('[Live2DCanvas] 初始化失败:', message);
      onError?.(message);
    }

    return () => {
      if (initializedRef.current) {
        managerRef.current.destroy();
        initializedRef.current = false;
      }
    };
  }, [onError]);

  // 状态变更回调
  useEffect(() => {
    if (state.status === Live2DStatus.LOADED) {
      onReady?.();
    } else if (state.status === Live2DStatus.ERROR) {
      onError?.(state.errorMessage ?? '未知错误');
    }
  }, [state.status, state.errorMessage, onReady, onError]);

  // 鼠标跟踪
  useMouseTracking(containerRef, {
    enabled: state.mouseTrackingEnabled && state.status === Live2DStatus.LOADED,
    throttleMs: 16,
  });

  return (
    <div
      ref={containerRef}
      className={`live2d-canvas ${className}`}
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'transparent',
      }}
      data-status={state.status}
    />
  );
};

export default Live2DCanvas;
```

#### 步骤 5：实现控制面板和降级组件

```tsx
// src/renderer/src/components/live2d/Live2DControls.tsx

import React, { useState, useMemo } from 'react';
import { useLive2DContext } from './Live2DContext';
import { Live2DStatus } from './types/live2d';

/**
 * Live2D 控制面板
 * 提供表情切换、动作触发、鼠标跟随开关等交互
 */
export const Live2DControls: React.FC = () => {
  const { state, setExpression, playMotion, toggleMouseTracking } =
    useLive2DContext();
  const [selectedGroup, setSelectedGroup] = useState<string>('');

  // 按动作组分组
  const motionGroups = useMemo(() => {
    const groups = new Map<string, typeof state.motions>();
    for (const motion of state.motions) {
      const existing = groups.get(motion.group) ?? [];
      groups.set(motion.group, [...existing, motion]);
    }
    return groups;
  }, [state.motions]);

  if (state.status !== Live2DStatus.LOADED) {
    return null;
  }

  return (
    <div className="live2d-controls">
      {/* 表情控制 */}
      <section className="control-section">
        <h3>表情</h3>
        <div className="expression-grid">
          {state.expressions.map((expr) => (
            <button
              key={expr.id}
              className={`expression-btn ${
                state.currentExpression === expr.id ? 'active' : ''
              }`}
              onClick={() => void setExpression(expr.id)}
              disabled={state.status !== Live2DStatus.LOADED}
            >
              {expr.name}
            </button>
          ))}
        </div>
      </section>

      {/* 动作控制 */}
      <section className="control-section">
        <h3>动作</h3>
        <select
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
        >
          <option value="">选择动作组</option>
          {Array.from(motionGroups.keys()).map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
        {selectedGroup && (
          <div className="motion-grid">
            {(motionGroups.get(selectedGroup) ?? []).map((motion) => (
              <button
                key={motion.id}
                className="motion-btn"
                onClick={() => void playMotion(motion.id)}
              >
                {motion.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 鼠标跟踪开关 */}
      <section className="control-section">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={state.mouseTrackingEnabled}
            onChange={toggleMouseTracking}
          />
          <span>鼠标跟随</span>
        </label>
      </section>

      {/* 状态指示 */}
      <div className="status-bar">
        <span className={`status-dot ${state.status}`} />
        <span className="status-text">
          {state.status === Live2DStatus.LOADED
            ? '模型就绪'
            : state.status === Live2DStatus.LOADING
            ? '加载中...'
            : state.status === Live2DStatus.ERROR
            ? '加载失败'
            : '待机'}
        </span>
      </div>
    </div>
  );
};

export default Live2DControls;
```

```tsx
// src/renderer/src/components/live2d/Live2DFallback.tsx

import React from 'react';

interface Live2DFallbackProps {
  /** 错误信息 */
  errorMessage?: string;
  /** 重试回调 */
  onRetry?: () => void;
  /** 自定义文字 */
  message?: string;
}

/**
 * Live2D 降级组件
 * 当 Live2D 模型加载失败时显示纯文字模式
 */
export const Live2DFallback: React.FC<Live2DFallbackProps> = ({
  errorMessage,
  onRetry,
  message = '当前处于文字模式',
}) => {
  return (
    <div className="live2d-fallback" role="alert">
      <div className="fallback-icon" aria-hidden="true">
        🤖
      </div>
      <p className="fallback-message">{message}</p>
      {errorMessage && (
        <p className="fallback-error" title={errorMessage}>
          {errorMessage.length > 100
            ? `${errorMessage.slice(0, 100)}...`
            : errorMessage}
        </p>
      )}
      {onRetry && (
        <button className="fallback-retry-btn" onClick={onRetry}>
          重新加载
        </button>
      )}
    </div>
  );
};

export default Live2DFallback;
```

#### 步骤 6：集成示例

```tsx
// 示例：在主界面中集成 Live2D

import React from 'react';
import {
  Live2DProvider,
  Live2DCanvas,
  Live2DControls,
  Live2DFallback,
  useLive2DContext,
} from './components/live2d';
import type { Live2DModelConfig } from './components/live2d/types/live2d';

const MODEL_CONFIG: Live2DModelConfig = {
  name: '默认角色',
  modelPath: '/models/character/character.model3.json',
  scale: 0.15,
  offsetX: 0,
  offsetY: 50,
};

/**
 * Live2D 模型加载触发器（需要在 Provider 内部使用）
 */
const ModelLoader: React.FC = () => {
  const { loadModel, state } = useLive2DContext();

  React.useEffect(() => {
    if (state.status === 'idle') {
      void loadModel(MODEL_CONFIG);
    }
  }, [loadModel, state.status]);

  return null;
};

/**
 * 主界面集成示例
 */
export const AssistantView: React.FC = () => {
  return (
    <Live2DProvider
      fallback={<Live2DFallback message="Live2D 不可用，已切换为文字模式" />}
    >
      <div className="assistant-container">
        <ModelLoader />
        <Live2DCanvas
          width="100%"
          height={500}
          onReady={() => console.log('[Assistant] Live2D 就绪')}
          onError={(err) => console.warn('[Assistant] Live2D 错误:', err)}
        />
        <Live2DControls />
      </div>
    </Live2DProvider>
  );
};
```

### 24.3 代码规范

1. **单例管理**：`Live2DManager` 采用单例模式，确保全局只有一个 PixiJS 实例
2. **资源释放**：组件卸载时必须调用 `destroy()` 释放 WebGL 资源
3. **错误边界**：模型加载失败必须降级到纯文字模式，不得阻塞 UI
4. **鼠标跟踪节流**：鼠标移动事件节流至 16ms（约 60fps），避免性能损耗
5. **类型严格**：所有交互事件使用 `pixi-live2d-display` 提供的类型，不使用 `any`
6. **状态管理**：使用 `useReducer` 管理复杂状态，避免 `useState` 嵌套
7. **异步处理**：所有模型操作返回 `Promise`，调用方使用 `void` 或 `try/catch` 处理
8. **命名规范**：组件使用 PascalCase，Hook 使用 `use` 前缀，工具函数使用 camelCase
9. **CSS 隔离**：样式使用 `live2d-` 前缀避免全局冲突
10. **无障碍**：降级组件使用 `role="alert"`，控制按钮提供可访问标签

---

---

## 实现状态

✅ **已实现** — 代码位于 `desktop/` 目录，与本文档描述基本一致。

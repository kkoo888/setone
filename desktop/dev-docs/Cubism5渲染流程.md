# Cubism 5 完整渲染流程

> 基于 `desktop/modules/live2d-5/` 源码梳理，对照官方 [Live2D/CubismWebFramework](https://github.com/Live2D/CubismWebFramework)（develop 分支，5-r.5 版本）校验。
> 所有结论均有源码依据，无猜测。
>
> **版本说明**：官方 SDK 使用 `5-r.x` 版本号格式，不使用 "5.3"。本文中 "5-r.5 新特性" 指 2025-08-26 首次引入、2026-04-02 发布稳定版的 Blend mode / Offscreen 等功能。

---

## 目录

1. [渲染管线总览（13 步）](#渲染管线总览)
2. [矩阵乘法语义](#矩阵乘法语义)
3. [模型坐标系](#模型坐标系)
4. [Cubism 5-r.5 混合模式系统](#cubism-5-r5-混合模式系统)
5. [Offscreen 渲染](#offscreen-渲染)
6. [遮罩（Clipping Mask）系统](#遮罩clipping-mask系统)
7. [GL 状态管理](#gl-状态管理)
8. [Shader 文件体系](#shader-文件体系)
9. [ModelColor 与 Opacity 计算](#modelcolor-与-opacity-计算)
10. [版本兼容性](#版本兼容性)

---

## 渲染管线总览

### 第 1 步：renderFrame() — cubism5-service.ts

```
gl.clearColor(0.12, 0.12, 0.2, 1)
gl.clear(COLOR_BUFFER_BIT | DEPTH_BUFFER_BIT)
gl.enable(BLEND)
gl.blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)   ← ① 先设一次 blend

deltaTime = clamp(now - lastUpdateTime, 0, 0.5)
model.updateModel(deltaTime)                    ← ② 更新模型参数

mvp = createMvpMatrix(canvas.width, canvas.height) ← ③ 创建 MVP
model.render(gl, mvp)                           ← ④ 传给 AppModel
```

### 第 2 步：updateModel() — AppModel.ts

```
model.loadParameters()                          ← 加载上次参数状态

if (motionManager.isFinished())
    startRandomMotion('Idle', PriorityIdle)     ← 待机动作循环
else
    motionManager.updateMotion(model, dt)       ← 更新动作

model.saveParameters()                          ← 保存参数状态
updateScheduler.onLateUpdate(model, dt)         ← 统一调度所有效果：
    → CubismEyeBlinkUpdater（自动眨眼）
    → CubismExpressionUpdater（表情）
    → CubismLookUpdater（鼠标注视）
    → CubismBreathUpdater（呼吸）
    → CubismPhysicsUpdater（物理演算）
    → CubismPoseUpdater（姿态切换）
    → CubismLipSyncUpdater（口型同步）

model.update()                                  ← 应用参数到模型
```

### 第 3 步：createMvpMatrix() — cubism5-service.ts

```
projection = new CubismMatrix44()               ← 单位矩阵

if (width > height)
    projection.scale(height/width, 1.0)         ← 宽高比校正
else
    projection.scale(1.0, width/height)

projection.multiplyByMatrix(viewMatrix)         ← projection = viewMatrix × projection
projection.multiplyByMatrix(modelMatrix)        ← projection = modelMatrix × projection

return { getArray: () => projection.getArray() }
```

**multiplyByMatrix 语义**：`a.multiplyByMatrix(b)` → `a = b × a`（左乘），详见[矩阵乘法语义](#矩阵乘法语义)。

### 第 4 步：render() — AppModel.ts

```
renderer = this.getRenderer()
if (renderer.gl !== gl) renderer.startUp(gl)    ← 确保 GL 绑定
renderer.setMvpMatrix(mvp)                      ← 复制 MVP 矩阵值到 renderer._mvpMatrix4x4
renderer.drawModel()                            ← 调用 CubismRenderer_WebGL
```

`setMvpMatrix` 实现（cubismrenderer.ts）：
```typescript
public setMvpMatrix(matrix44: CubismMatrix44): void {
    this._mvpMatrix4x4.setMatrix(matrix44.getArray());  // 复制数组值，非引用
}
```

### 第 5 步：drawModel() — cubismrenderer.ts（基类）

```
this.doDrawModel(shaderPath=null)               ← 直接转发
```

### 第 6 步：doDrawModel() — cubismrenderer_webgl.ts

```
this.loadShaders(null)                          ← 加载 shader（异步，见 Shader 文件体系）
this.beforeDrawModelRenderTarget()              ← 准备渲染目标

lastFbo = gl.getParameter(FRAMEBUFFER_BINDING)  ← 保存当前 FBO
lastViewport = gl.getParameter(VIEWPORT)        ← 保存当前 viewport

// 处理 Drawable 遮罩
if (this._drawableClippingManager != null)
    → setupClippingContext(Drawable)            ← 设置遮罩上下文

// 处理 Offscreen 遮罩
if (this._offscreenClippingManager != null)
    → setupClippingContext(Offscreen)           ← 设置离屏遮罩上下文

this.preDraw()                                  ← ★ 关键：设置 GL 状态
this.drawObjectLoop(lastFbo)                    ← 进入绘制循环
this.afterDrawModelRenderTarget()               ← 后处理
```

### 第 7 步：preDraw() — cubismrenderer_webgl.ts

```
gl.disable(SCISSOR_TEST)
gl.disable(STENCIL_TEST)
gl.disable(DEPTH_TEST)                          ← ★ 关闭深度测试
gl.frontFace(CW)                                ← ★ 设为顺时针（后续 drawMeshWebGL 会改回 CCW）
gl.enable(BLEND)
gl.colorMask(true, true, true, true)
gl.bindBuffer(ARRAY_BUFFER, null)
gl.bindBuffer(ELEMENT_ARRAY_BUFFER, null)
```

### 第 8 步：drawObjectLoop() — cubismrenderer_webgl.ts

```
drawableCount = model.getDrawableCount()
offscreenCount = model.getOffscreenCount()
totalCount = drawableCount + offscreenCount
renderOrder = model.getRenderOrders()           ← 获取统一渲染顺序（含 Drawable 和 Offscreen）

// 按 renderOrder 排序，同时记录对象类型
for i in 0..totalCount:
    sortedObjectsIndexList[renderOrder[i]] = i
    sortedObjectsTypeList[renderOrder[i]] = (i < drawableCount)
        ? DrawableObjectType_Drawable
        : DrawableObjectType_Offscreen

// 按排序后的顺序绘制（Drawable 和 Offscreen 交错，非分离）
for i in 0..totalCount:
    renderObject(sortedObjectsIndexList[i], sortedObjectsTypeList[i])
```

### 第 9 步：drawDrawable() — cubismrenderer_webgl.ts

```
if (!model.getDrawableDynamicFlagIsVisible(index)) return  ← ★ 可见性检查

clipContext = clippingManager.getClippingContextListForDraw()[index]

// 高精度遮罩：为当前部件单独绘制遮罩
if (clipContext != null && isUsingHighPrecisionMask()):
    gl.viewport(0, 0, maskBufferWidth, maskBufferHeight)
    preDraw()
    maskBuffer.beginDraw(lastFbo)
    for clipIndex in clipContext._clippingIdList:
        drawMeshWebGL(model, clipIndex)         ← 以遮罩模式绘制
    maskBuffer.endDraw()
    gl.viewport(lastViewport)                   ← 恢复 viewport

this.setClippingContextBufferForDrawable(clipContext)
this.setIsCulling(model.getDrawableCulling(index))
this.drawMeshWebGL(model, index)                ← ★ 实际绘制
```

> 高精度 vs 低精度遮罩的差异，见[遮罩系统](#遮罩clipping-mask系统)。

### 第 10 步：drawMeshWebGL() — cubismrenderer_webgl.ts

```
if (isCulling()) gl.enable(CULL_FACE) else gl.disable(CULL_FACE)
gl.frontFace(CCW)                               ← ★ 设回逆时针

shader = CubismShaderManager_WebGL.getInstance().getShader(gl)

if (isGeneratingMask())
    shader.setupShaderProgramForMask(renderer, model, index)
else
    shader.setupShaderProgramForDrawable(renderer, model, index)  ← ★ 设置 shader

gl.drawElements(TRIANGLES, indexCount, UNSIGNED_SHORT, 0)  ← ★ 发出绘制调用

gl.useProgram(null)
```

### 第 11 步：setupShaderProgramForDrawable() — cubismshader_webgl.ts

```
// --- 选择 shader set ---
masked = clippingContext != null
invertedMask = model.getDrawableInvertedMaskBit(index)
offset = masked ? (invertedMask ? 2 : 1) : 0

// 混合模式选择（见 Cubism 5-r.5 混合模式系统）
if (model.isBlendModeEnabled()):
    → 5-r.5 新混合模式：ColorBlend × AlphaBlend 组合查表
else:
    → 旧版 3 种：Normal / Additive / Multiplicative

// --- 设置 shader program ---
gl.useProgram(shaderSet.shaderProgram)

// --- 设置顶点位置 ---
gl.bindBuffer(ARRAY_BUFFER, vertexBuffer)
gl.bufferData(ARRAY_BUFFER, model.getDrawableVertices(index), DYNAMIC_DRAW)
gl.enableVertexAttribArray(attributePositionLocation)
gl.vertexAttribPointer(attributePositionLocation, 2, FLOAT, false, 0, 0)

// --- 设置 UV ---
gl.bindBuffer(ARRAY_BUFFER, uvBuffer)
gl.bufferData(ARRAY_BUFFER, model.getDrawableVertexUvs(index), DYNAMIC_DRAW)
gl.enableVertexAttribArray(attributeTexCoordLocation)
gl.vertexAttribPointer(attributeTexCoordLocation, 2, FLOAT, false, 0, 0)

// --- 如果有遮罩 ---
if (masked):
    gl.activeTexture(TEXTURE1)
    gl.bindTexture(TEXTURE_2D, maskTexture)       ← 遮罩 FBO 的颜色缓冲
    gl.uniform1i(samplerTexture1Location, 1)
    gl.uniformMatrix4fv(uniformClipMatrixLocation, clipMatrix)  ← 遮罩变换矩阵
    gl.uniform4f(uniformChannelFlagLocation, channelColor)      ← RGBA 通道标识

// --- 设置纹理 ---
gl.activeTexture(TEXTURE0)
gl.bindTexture(TEXTURE_2D, renderer.getBindedTextures().get(textureNo))
gl.uniform1i(samplerTexture0Location, 0)

// --- 设置 MVP 矩阵 ---
matrix4x4 = renderer.getMvpMatrix()
gl.uniformMatrix4fv(uniformMatrixLocation, false, matrix4x4.getArray())

// --- 设置颜色（见 ModelColor 与 Opacity 计算） ---
baseColor = renderer.getModelColorWithOpacity(drawableOpacity)
gl.uniform4f(uniformBaseColorLocation, baseColor)
gl.uniform4f(uniformMultiplyColorLocation, multiplyColor)
gl.uniform4f(uniformScreenColorLocation, screenColor)

// --- 设置 index buffer ---
gl.bindBuffer(ELEMENT_ARRAY_BUFFER, indexBuffer)
gl.bufferData(ELEMENT_ARRAY_BUFFER, model.getDrawableVertexIndices(index), DYNAMIC_DRAW)

// --- 设置混合函数 ---
gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha)
```

### 第 12 步：顶点着色器 — vertshadersrc.vert

```glsl
attribute vec4 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
uniform mat4 u_matrix;

void main() {
    gl_Position = u_matrix * a_position;        ← MVP 变换
    v_texCoord = a_texCoord;
    v_texCoord.y = 1.0 - v_texCoord.y;         ← UV 翻转
}
```

### 第 13 步：片段着色器 — fragshadersrcpremultipliedalpha.frag

```glsl
precision mediump float;
varying vec2 v_texCoord;
uniform vec4 u_baseColor;
uniform sampler2D s_texture0;
uniform vec4 u_multiplyColor;
uniform vec4 u_screenColor;

void main() {
    vec4 texColor = texture2D(s_texture0, v_texCoord);  ← 采样纹理
    texColor.rgb *= u_multiplyColor.rgb;                 ← 叠乘色
    texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a)
                 - (texColor.rgb * u_screenColor.rgb);   ← 叠 screen 色
    vec4 color = texColor * u_baseColor;                 ← × baseColor（含 opacity + modelColor）
    gl_FragColor = vec4(color.rgb, color.a);             ← 输出
}
```

---

## 矩阵乘法语义

源码依据：`cubismmatrix44.ts`

```typescript
public static multiply(a, b, dst): void {
    // dst = a × b（标准矩阵乘法）
    c[j + i*4] += a[k + i*4] * b[j + k*4]
}

public multiplyByMatrix(m): void {
    CubismMatrix44.multiply(m.getArray(), this._tr, this._tr);
    // this = m × this（左乘）
}
```

**官方示例的典型 MVP 构建链**：
```
projection = identity
projection.scale(aspectRatio)                  ← 宽高比校正
projection.multiplyByMatrix(viewMatrix)        → projection = viewMatrix × projection

model.draw(projection):
    matrix = projection.copy()
    matrix.multiplyByMatrix(modelMatrix)       → matrix = modelMatrix × projection
    setMvpMatrix(matrix)
```

最终 `u_matrix` = `modelMatrix × viewMatrix × aspectProjection`。

---

## 模型坐标系

- `getCanvasWidth()` = `CanvasWidth / PixelsPerUnit`（模型内部坐标范围）
- `getCanvasHeight()` = `CanvasHeight / PixelsPerUnit`
- `CubismModelMatrix(w, h)` 构造函数调用 `setHeight(2.0)`，将模型映射到 Y:-1~1
- `setHeight(h)` 内部调用 `scale(h/height, h/height)`，**替换**而非累乘
- `setScreenRect()` 只存储值到成员变量，**不修改矩阵**
- viewMatrix 在 setupViewMatrix 后实际是 **identity**

---

## Cubism 5-r.5 混合模式系统

> 源码依据：`cubismshader_webgl.ts` — `setupShaderProgramForDrawable()`
>
> Cubism 5.2 及之前只有 3 种混合模式（Normal / Additive / Multiplicative）。
> Cubism 5-r.5 引入 ColorBlend × AlphaBlend 的组合式混合系统。

### 判断入口

```typescript
if (model.isBlendModeEnabled()) {
    // 5-r.5 新混合模式
    const colorBlendMode: CubismColorBlend = model.getDrawableColorBlend(index);
    const alphaBlendMode: CubismAlphaBlend = model.getDrawableAlphaBlend(index);
} else {
    // 旧版 3 种混合模式（向下兼容）
    switch (model.getDrawableBlendMode(index)) {
        case CubismBlendMode_Normal: ...
        case CubismBlendMode_Additive: ...
        case CubismBlendMode_Multiplicative: ...
    }
}
```

### 混合模式枚举

```typescript
// CubismColorBlend（颜色混合）
ColorBlend_None               // 无 → 走旧版兼容
ColorBlend_Normal             // 正常
ColorBlend_AddCompatible      // 加算（兼容旧版）
ColorBlend_MultiplyCompatible // 乘算（兼容旧版）
ColorBlend_Screen             // 滤色
ColorBlend_Overlay            // 叠加
// ... 更多 PS 级混合模式

// CubismAlphaBlend（Alpha 混合）
AlphaBlend_None               // 无 → 走旧版兼容
AlphaBlend_Over               // 标准 Over（Porter-Duff）
AlphaBlend_OverPreMultiplied  // 预乘 Over
// ... 更多 Alpha 混合模式
```

### Shader 选择逻辑

```typescript
// 1. None 或 Normal+Over → 降级到旧版兼容 shader
if (colorBlendMode == ColorBlend_None ||
    alphaBlendMode == AlphaBlend_None ||
    (colorBlendMode == ColorBlend_Normal && alphaBlendMode == AlphaBlend_Over)) {
    shaderSet = shaderSets[ShaderNames_NormalPremultipliedAlpha + offset];
    srcColor = ONE; dstColor = ONE_MINUS_SRC_ALPHA;
    srcAlpha = ONE; dstAlpha = ONE_MINUS_SRC_ALPHA;
}

// 2. 旧版 Additive/Multiply 兼容
else if (colorBlendMode == ColorBlend_AddCompatible) {
    shaderSet = shaderSets[ShaderNames_AddPremultipliedAlpha + offset];
    srcColor = ONE; dstColor = ONE;
    srcAlpha = ZERO; dstAlpha = ONE;
}
else if (colorBlendMode == ColorBlend_MultiplyCompatible) {
    shaderSet = shaderSets[ShaderNames_MultPremultipliedAlpha + offset];
    srcColor = DST_COLOR; dstColor = ONE_MINUS_SRC_ALPHA;
    srcAlpha = ZERO; dstAlpha = ONE;
}

// 3. 5-r.5 全新组合：copyBuffer + 混合 shader
else {
    // 先把当前渲染目标复制到中间缓冲区
    const srcBuffer = renderer._currentOffscreen ?? renderer.getModelRenderTarget(0);
    CubismRenderTarget_WebGL.copyBuffer(gl, srcBuffer, renderer.getModelRenderTarget(1));

    // 通过查表找到对应的混合 shader
    const key = colorBlendName + alphaBlendName;  // 如 "Screen_Over"
    const baseIndex = this._blendShaderSetMap.get(key);
    shaderSet = this._shaderSets[baseIndex + offset];

    // 混合 shader 自己处理读写，blend 关闭
    srcColor = ONE; dstColor = ZERO;
    srcAlpha = ONE; dstAlpha = ZERO;
}
```

### Shader 数量

```typescript
// 旧版：(Normal + Add + Multiply) × (无遮罩 + 有遮罩 + 反转遮罩) + 1 mask 生成 = 10
// 5-r.5：旧版 10 + 1 copy + (ColorBlend 数 - 3) × (AlphaBlend 数 - 1) × 3 种 mask 状态
_shaderCount = ShaderNames_ShaderCount + 1 +
    (colorBlendValues.length - 3) * (alphaBlendValues.length - 1) * 3;
```

### 新旧对比

| 对比项 | 旧版（≤5.2） | 新版（5-r.5） |
|--------|-------------|------------|
| 混合模式 | 3 种（Normal/Add/Mult） | ColorBlend × AlphaBlend 组合 |
| 判断方式 | `getDrawableBlendMode()` | `isBlendModeEnabled()` → `getDrawableColorBlend()` + `getDrawableAlphaBlend()` |
| Shader 选择 | 固定索引 | 动态查表 `_blendShaderSetMap` |
| 是否需要中间缓冲 | 不需要 | 需要 `copyBuffer` 到 `ModelRenderTarget(1)` |
| blendFunc | 各模式不同 | 新模式统一 `ONE, ZERO`（shader 内部处理混合） |

---

## Offscreen 渲染

> 源码依据：`cubismrenderer_webgl.ts` — `doDrawModel()`、`drawObjectLoop()`、`setupParentOffscreens()`
>
> Cubism 5 支持 Drawable（普通绘制对象）和 Offscreen（离屏渲染对象）两种类型。

### 对象类型枚举

```typescript
// cubismrenderer.ts
export enum DrawableObjectType {
    DrawableObjectType_Drawable = 0,   // 普通绘制
    DrawableObjectType_Offscreen = 1   // 离屏渲染
}
```

### 独立的 ClippingManager

```typescript
// cubismrenderer_webgl.ts — initialize()
if (model.isUsingMasking()) {
    this._drawableClippingManager = new CubismClippingManager_WebGL();
    this._drawableClippingManager.initializeForDrawable(model, maskBufferCount);
}

if (model.isUsingMaskingForOffscreen()) {
    this._offscreenClippingManager = new CubismClippingManager_WebGL();
    this._offscreenClippingManager.initializeForOffscreen(model, maskBufferCount);
}
```

### 父子关系

```typescript
// cubismrenderer_webgl.ts — setupParentOffscreens()
// Offscreen 可以有父子关系，子 Offscreen 继承父的渲染目标
for (let offscreenIndex = 0; offscreenIndex < offscreenCount; ++offscreenIndex) {
    const ownerIndex = model.getOffscreenOwnerIndices()[offscreenIndex];
    let parentIndex = model.getPartParentPartIndices()[ownerIndex];

    // 向上查找父 Offscreen
    while (parentIndex != NoParentIndex) {
        for (let i = 0; i < offscreenCount; ++i) {
            if (model.getOffscreenOwnerIndices()[offscreenList[i].getOffscreenIndex()] == parentIndex) {
                parentOffscreen = offscreenList[i];
                break;
            }
        }
        if (parentOffscreen != null) break;
        parentIndex = model.getPartParentPartIndices()[parentIndex];
    }

    offscreenList[offscreenIndex].setParentPartOffscreen(parentOffscreen);
}
```

### setupClippingContext 中的类型区分

```typescript
switch (drawObjectType) {
    case DrawableObjectType_Drawable:
    default:
        this.calcClippedDrawableTotalBounds(model, cc);
        maskBuffer = renderer.getDrawableMaskBuffer(cc._bufferIndex);
        break;
    case DrawableObjectType_Offscreen:
        this.calcClippedOffscreenTotalBounds(model, cc);
        maskBuffer = renderer.getOffscreenMaskBuffer(cc._bufferIndex);
        break;
}

// Offscreen 需要额外的 MVP 逆矩阵变换
if (drawObjectType == DrawableObjectType_Offscreen) {
    const invertMvp = renderer.getMvpMatrix().getInvert();
    clipContext._matrixForDraw.multiplyByMatrix(invertMvp);
}
```

---

## 遮罩（Clipping Mask）系统

> 源码依据：`cubismrenderer_webgl.ts` — `setupClippingContext()`、`cubismrenderer.ts` — `useHighPrecisionMask()`

### 低精度 vs 高精度

```typescript
renderer.useHighPrecisionMask(true);   // 切换高精度
renderer.useHighPrecisionMask(false);  // 切换低精度（默认）
```

| 对比项 | 低精度（默认） | 高精度 |
|--------|--------------|--------|
| FBO 使用 | 所有遮罩共享 1 张 FBO，按布局分割 | 每个部件绘制前重绘独立遮罩 |
| 遮罩上限 | 36 个（布局限制） | 无上限 |
| 质量 | 粗糙（分辨率按遮罩数分割） | 高（完整分辨率） |
| 性能 | 快（一次性生成） | 慢（每部件重绘） |
| 适用场景 | 大多数情况 | 需要高质量遮罩的精细模型 |

### Cubism 5-r.5 自动强制高精度

```typescript
// cubismrenderer.ts — initialize()
if (model.isBlendModeEnabled()) {
    this.useHighPrecisionMask(true);
    // 原因：新混合模式需要精确的 per-pixel alpha，低精度遮罩会导致混合结果不正确
}
```

### 遮罩缓冲区配置

```typescript
renderer.setClippingMaskBufferSize(256);  // 默认 256×256，可调
renderTextureCount = clippingManager.getRenderTextureCount();  // 通常为 1
```

### 每帧遮罩生成流程

```
setupClippingContext(model, renderer, lastFbo, lastViewport, drawObjectType):

    1. 计算每个遮罩的包围盒
       for each clipContext:
           calcClippedDrawableTotalBounds(model, clipContext)   // Drawable
           calcClippedOffscreenTotalBounds(model, clipContext)  // Offscreen

    2. 设置 viewport 到遮罩缓冲区尺寸
       gl.viewport(0, 0, clippingMaskBufferSize, clippingMaskBufferSize)

    3. 开始遮罩绘制
       currentMaskBuffer = renderer.getMaskBuffer(0, drawObjectType)
       currentMaskBuffer.beginDraw(lastFbo)
       renderer.preDraw()

    4. 分配布局（每个遮罩在 FBO 中的位置）
       setupLayoutBounds(usingClipCount)

    5. 每帧重置清除标志
       _clearedMaskBufferFlags[] = false

    6. 逐遮罩绘制
       for each clipContext:
           // 切换 FBO（如果当前遮罩和上一个不在同一张 FBO）
           if (currentMaskBuffer != targetMaskBuffer):
               currentMaskBuffer.endDraw()
               currentMaskBuffer = targetMaskBuffer
               currentMaskBuffer.beginDraw(lastFbo)
               renderer.preDraw()

           // 计算遮罩变换矩阵
           createMatrixForMask(false, layoutBounds, scaleX, scaleY)
           clipContext._matrixForMask = tmpMatrixForMask
           clipContext._matrixForDraw = tmpMatrixForDraw

           // 清除当前遮罩区域（白色 = 无效区域）
           if (!clearedMaskBufferFlags[bufferIndex]):
               gl.clearColor(1.0, 1.0, 1.0, 1.0)
               gl.clear(gl.COLOR_BUFFER_BIT)
               clearedMaskBufferFlags[bufferIndex] = true

           // 绘制遮罩中的每个 clip drawable
           for each clipDrawIndex in clipContext._clippingIdList:
               if (!vertexPositionsDidChange(clipDrawIndex)) continue
               renderer.setIsCulling(model.getDrawableCulling(clipDrawIndex))
               renderer.setClippingContextBufferForMask(clipContext)
               renderer.drawMeshWebGL(model, clipDrawIndex)

    7. 后处理
       currentMaskBuffer.endDraw()
       renderer.setClippingContextBufferForMask(null)
       gl.viewport(lastViewport)
```

### 遮罩坐标变换矩阵

```typescript
// createMatrixForMask 生成两个矩阵：
// _matrixForMask: 遮罩绘制时使用（模型坐标 → 遮罩纹理坐标）
// _matrixForDraw: 被遮罩对象绘制时使用（遮罩纹理坐标 → 屏幕坐标）

// 变换公式：
// scaleX = layoutBoundsOnTex01.width / tmpBoundsOnModel.width
// scaleY = layoutBoundsOnTex01.height / tmpBoundsOnModel.height
// movePeriod' = movePeriod * scaleX + offX
```

### 遮罩通道（Channel）

遮罩 FBO 使用 RGBA 四个通道分别存储不同遮罩，每个通道对应一个 clipContext：

```typescript
channelColors = [
    { r: 1, g: 0, b: 0, a: 0 },  // R 通道
    { r: 0, g: 1, b: 0, a: 0 },  // G 通道
    { r: 0, g: 0, b: 1, a: 0 },  // B 通道
    { r: 0, g: 0, b: 0, a: 1 },  // A 通道
];

// 在 setupShaderProgramForDrawable 中传给 shader
gl.uniform4f(uniformChannelFlagLocation, channelColor.r, channelColor.g, channelColor.b, channelColor.a);
```

---

## GL 状态管理

> 源码依据：`cubismrenderer_webgl.ts` — `CubismRendererProfile_WebGL`、`preDraw()`、`setupShaderProgramForDrawable()`

### 渲染过程中的 GL 状态汇总

| 状态 | 值 | 设置位置 | 备注 |
|------|-----|---------|------|
| DEPTH_TEST | 关闭 | preDraw() | |
| SCISSOR_TEST | 关闭 | preDraw() | |
| STENCIL_TEST | 关闭 | preDraw() | |
| CULL_FACE | 由 isCulling() 决定 | drawMeshWebGL() | 模型部件级控制 |
| frontFace | CW → CCW | preDraw() → drawMeshWebGL() | 先 CW 后改回 CCW |
| Blend | 开启 | preDraw() | |
| blendFunc (Normal) | ONE, ONE_MINUS_SRC_ALPHA | setupShaderProgramForDrawable() | 预乘 Alpha |
| blendFunc (Additive) | ONE, ONE | setupShaderProgramForDrawable() | |
| blendFunc (Multiply) | DST_COLOR, ONE_MINUS_SRC_ALPHA | setupShaderProgramForDrawable() | |
| blendFunc (5-r.5 新模式) | ONE, ZERO | setupShaderProgramForDrawable() | shader 内部处理混合 |
| clearColor (主画面) | (0.12, 0.12, 0.2, 1) | renderFrame() | |
| clearColor (遮罩) | (1.0, 1.0, 1.0, 1.0) | setupClippingContext() | 白色 = 无效区域 |
| colorMask | (true, true, true, true) | preDraw() | |
| MVP 矩阵 | modelMatrix × viewMatrix × aspectProjection | createMvpMatrix() | |
| u_baseColor | modelColor × opacity × PMA | setupShaderProgramForDrawable() | 见 ModelColor 章节 |
| u_matrix | renderer._mvpMatrix4x4 | setupShaderProgramForDrawable() | |
| 纹理单元 0 | 模型纹理 | setupShaderProgramForDrawable() | |
| 纹理单元 1 | 遮罩纹理（如有） | setupShaderProgramForDrawable() | |

### RendererProfile：GL 状态保存/恢复

```typescript
// cubismrenderer_webgl.ts — CubismRendererProfile_WebGL
// 在 doDrawModel 前后保存/恢复 GL 状态，确保 Cubism 不污染外部 GL 环境

save(): void   // 保存 17 项 GL 状态
restore(): void // 恢复
```

**保存的 17 项状态**：

| 类别 | 项目 |
|------|------|
| 缓冲区绑定（2） | ARRAY_BUFFER_BINDING, ELEMENT_ARRAY_BUFFER_BINDING |
| Shader 程序（1） | CURRENT_PROGRAM |
| 纹理绑定（3） | ACTIVE_TEXTURE, TEXTURE0_BINDING_2D, TEXTURE1_BINDING_2D |
| 顶点属性（4） | VERTEX_ATTRIB_ARRAY_ENABLED [0-3] |
| GL 开关（5） | SCISSOR_TEST, STENCIL_TEST, DEPTH_TEST, CULL_FACE, BLEND |
| 面朝向（1） | FRONT_FACE |
| 颜色掩码（1） | COLOR_WRITEMASK |
| 混合参数（4） | BLEND_SRC_RGB, BLEND_DST_RGB, BLEND_SRC_ALPHA, BLEND_DST_ALPHA |

**在渲染管线中的位置**：

```
doDrawModel():
    this.saveProfile()          ← 保存（默认注释掉）
    ... 渲染流程 ...
    this.restoreProfile()       ← 恢复（默认注释掉）
```

> **默认关闭**。官方注释：`// NOTE: WebGL最適化のため、デフォルトではコメントアウト`
>
> **本项目不需要开启**。宠物窗口是独立 BrowserWindow，Cubism 独占 Canvas 的 GL 上下文，
> 不存在与其他渲染器共享 Context 的情况，save/restore 没有实际意义。
> 只有在 Cubism 和其他 WebGL 内容共享同一 Canvas 时才需要开启。

---

## Shader 文件体系

> 源码依据：`cubismshader_webgl.ts` 开头的路径常量定义

### 文件清单（共 13 个）

| 文件名 | 类型 | 用途 | 遮罩状态 |
|--------|------|------|---------|
| `vertshadersrc.vert` | 顶点 | 基础绘制 | 无遮罩 |
| `vertshadersrcmasked.vert` | 顶点 | 带遮罩绘制 | 有遮罩 |
| `vertshadersrcsetupmask.vert` | 顶点 | 遮罩生成 | — |
| `fragshadersrcsetupmask.frag` | 片段 | 遮罩生成（写入 A/R/G/B 通道） | — |
| `fragshadersrcpremultipliedalpha.frag` | 片段 | 基础绘制（预乘 Alpha） | 无遮罩 |
| `fragshadersrcmaskpremultipliedalpha.frag` | 片段 | 带遮罩绘制（预乘 Alpha） | 有遮罩 |
| `fragshadersrcmaskinvertedpremultipliedalpha.frag` | 片段 | 反转遮罩绘制（预乘 Alpha） | 反转遮罩 |
| `vertshadersrccopy.vert` | 顶点 | 缓冲区复制 | — |
| `fragshadersrccopy.frag` | 片段 | 缓冲区复制 | — |
| `fragshadersrccolorblend.frag` | 片段 | 颜色混合 | — |
| `fragshadersrcalphablend.frag` | 片段 | Alpha 混合 | — |
| `vertshadersrcblend.vert` | 顶点 | 混合绘制 | — |
| `fragshadersrcpremultipliedalphablend.frag` | 片段 | 预乘 Alpha 混合 | — |

### Shader Set 索引结构

```
[0]:  Mask 生成 shader
[1]:  Normal + 无遮罩
[2]:  Normal + 有遮罩
[3]:  Normal + 反转遮罩
[4]:  Additive + 无遮罩
[5]:  Additive + 有遮罩
[6]:  Additive + 反转遮罩
[7]:  Multiply + 无遮罩
[8]:  Multiply + 有遮罩
[9]:  Multiply + 反转遮罩
[10]: Copy shader
[11+]: ColorBlend×AlphaBlend 组合（每组 3 个：无遮罩/有遮罩/反转遮罩）
```

### 异步加载机制

```typescript
// cubismshader_webgl.ts — CubismShader_WebGL
private async loadShaders(): Promise<void> {
    const shaderDir = this._shaderPath ?? this._defaultShaderPath;
    const results = await Promise.all(
        shaderFiles.map(file =>
            this.loadShader(file.path)  // fetch(url) → text()
                .then(data => ({ prop: file.prop, data }))
        )
    );
    results.forEach(result => { (this as any)[result.prop] = result.data; });
}
```

> 官方 SDK 的 shader 是外部文件，不是内嵌字符串。
> 默认路径：`../../Framework/Shaders/WebGL/`，可通过 `setShaderPath()` 自定义。

---

## ModelColor 与 Opacity 计算

> 源码依据：`cubismrenderer.ts` — `getModelColorWithOpacity()`

### 计算公式

```typescript
public getModelColorWithOpacity(opacity: number): CubismTextureColor {
    const modelColorRGBA = this.getModelColor();
    // modelColor 默认值: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 }

    modelColorRGBA.a *= opacity;  // alpha = modelColor.a × opacity

    if (this.isPremultipliedAlpha()) {
        modelColorRGBA.r *= modelColorRGBA.a;
        modelColorRGBA.g *= modelColorRGBA.a;
        modelColorRGBA.b *= modelColorRGBA.a;
    }

    return modelColorRGBA;
}
```

### 传给 shader 的值

```typescript
const baseColor = renderer.getModelColorWithOpacity(drawableOpacity);
gl.uniform4f(uniformBaseColorLocation, baseColor.r, baseColor.g, baseColor.b, baseColor.a);
```

**默认 modelColor (1,1,1,1) 下**：`baseColor = (opacity, opacity, opacity, opacity)`
**自定义 modelColor 下**：`baseColor = (r*a*opacity, g*a*opacity, b*a*opacity, a*opacity)`（PMA 模式）

---

## 版本兼容性

| SDK 版本 | 发布日期 | 关键变更 |
|---------|---------|---------|
| 5-r.2 | 2024-12-19 | 基础功能 |
| 5-r.3 | 2025-02-18 | 循环动作改进 |
| 5-r.4 | 2025-05-15 | 参数重复处理、`getPartParentPartIndices()` |
| 5-r.5-beta.1 | 2025-08-26 | **Blend mode + Offscreen 渲染**，要求 WebGL2 |
| 5-r.5-beta.2 | 2025-10-14 | `CubismOffscreenRenderTarget_WebGL` |
| 5-r.5-beta.3 | 2026-01-29 | Shader 改为外部文件加载 |
| 5-r.5 | 2026-04-02 | **最新稳定版**，本项目使用此版本 |

- 旧模型（.moc3）在 5-r.5 SDK 中**完全向下兼容**，走旧版 shader 路径
- 新模型如果使用了 Cubism 5-r.5 Editor 的混合模式，`isBlendModeEnabled()` 返回 true
- `getOffscreenCount()` 在不使用 Offscreen 的模型上返回 0
- Blend mode 要求 `WebGL2RenderingContext`（使用 `blitFramebuffer`）

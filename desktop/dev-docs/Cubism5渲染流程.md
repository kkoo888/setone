# Cubism 5 完整渲染流程

> 纯源码事实，无猜测。基于 `desktop/modules/live2d-5/` 源码梳理。

---

## 第 1 步：renderFrame() — cubism5-service.ts

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

---

## 第 2 步：updateModel() — AppModel.ts

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

---

## 第 3 步：createMvpMatrix() — cubism5-service.ts

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

**multiplyByMatrix 语义**：`a.multiplyByMatrix(b)` → `a = b × a`（左乘）

源码依据（cubismmatrix44.ts）：
```typescript
public multiplyByMatrix(m: CubismMatrix44): void {
    CubismMatrix44.multiply(m.getArray(), this._tr, this._tr);
    // multiply(a, b, dst) = a × b
    // 所以 this = m × this
}
```

---

## 第 4 步：render() — AppModel.ts

```
renderer = this.getRenderer()
if (renderer.gl !== gl) renderer.startUp(gl)    ← 确保 GL 绑定
renderer.setMvpMatrix(mvp)                      ← 复制 MVP 矩阵值到 renderer._mvpMatrix4x4
renderer.drawModel()                            ← 调用 CubismRenderer_WebGL
```

`setMvpMatrix` 实现（cubismrenderer.ts）：
```typescript
public setMvpMatrix(matrix44: CubismMatrix44): void {
    this._mvpMatrix4x4.setMatrix(matrix44.getArray());  ← 复制数组值
}
```

---

## 第 5 步：drawModel() — cubismrenderer.ts（基类）

```
this.doDrawModel(shaderPath=null)               ← 直接转发
```

---

## 第 6 步：doDrawModel() — cubismrenderer_webgl.ts

```
this.loadShaders(null)                          ← 加载 shader
this.beforeDrawModelRenderTarget()              ← 准备渲染目标

lastFbo = gl.getParameter(FRAMEBUFFER_BINDING)  ← 保存当前 FBO
lastViewport = gl.getParameter(VIEWPORT)        ← 保存当前 viewport

// 如果有 ClippingManager，处理遮罩
if (this._drawableClippingManager != null)
    → setupClippingContext()                    ← 设置遮罩上下文
    → 对每个遮罩 FBO: createRenderTarget / beginDraw / drawMeshWebGL / endDraw

this.preDraw()                                  ← ★ 关键：设置 GL 状态
this.drawObjectLoop(lastFbo)                    ← 进入绘制循环
this.afterDrawModelRenderTarget()               ← 后处理
```

---

## 第 7 步：preDraw() — cubismrenderer_webgl.ts

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

---

## 第 8 步：drawObjectLoop() — cubismrenderer_webgl.ts

```
drawableCount = model.getDrawableCount()
offscreenCount = model.getOffscreenCount()
renderOrder = model.getRenderOrders()           ← 获取渲染顺序

// 按 renderOrder 排序
for i in 0..totalCount:
    sortedObjectsIndexList[renderOrder[i]] = i
    sortedObjectsTypeList[renderOrder[i]] = Drawable 或 Offscreen

// 按排序后的顺序绘制
for i in 0..totalCount:
    renderObject(sortedObjectsIndexList[i], sortedObjectsTypeList[i])
```

---

## 第 9 步：drawDrawable() — cubismrenderer_webgl.ts

```
if (!model.getDrawableDynamicFlagIsVisible(index)) return  ← ★ 可见性检查

clipContext = clippingManager.getClippingContextListForDraw()[index]

if (clipContext != null && isUsingHighPrecisionMask())
    → 遮罩绘制流程（设置 viewport → preDraw → beginDraw → drawMeshWebGL → endDraw）

this.setClippingContextBufferForDrawable(clipContext)
this.setIsCulling(model.getDrawableCulling(index))
this.drawMeshWebGL(model, index)                ← ★ 实际绘制
```

---

## 第 10 步：drawMeshWebGL() — cubismrenderer_webgl.ts

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

---

## 第 11 步：setupShaderProgramForDrawable() — cubismshader_webgl.ts

```
// --- 选择 shader set ---
masked = clippingContext != null
invertedMask = model.getDrawableInvertedMaskBit(index)
offset = masked ? (invertedMask ? 2 : 1) : 0

blendMode = model.getDrawableBlendMode(index)   ← Normal / Additive / Multiplicative

shaderSet = shaderSets[对应 blend mode + offset]
srcColor = ONE, dstColor = ONE_MINUS_SRC_ALPHA  ← premultiplied alpha

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
    gl.bindTexture(TEXTURE_2D, maskTexture)
    gl.uniform1i(samplerTexture1Location, 1)
    gl.uniformMatrix4fv(uniformClipMatrixLocation, clipMatrix)
    gl.uniform4f(uniformChannelFlagLocation, channelColor)

// --- 设置纹理 ---
gl.activeTexture(TEXTURE0)
gl.bindTexture(TEXTURE_2D, renderer.getBindedTextures().get(textureNo))
gl.uniform1i(samplerTexture0Location, 0)

// --- 设置 MVP 矩阵 ---
matrix4x4 = renderer.getMvpMatrix()             ← ★ 取出 MVP 矩阵
gl.uniformMatrix4fv(uniformMatrixLocation, false, matrix4x4.getArray())

// --- 设置颜色 ---
drawableOpacity = model.getDrawableOpacity(index)
baseColor = (drawableOpacity, drawableOpacity, drawableOpacity, drawableOpacity)
gl.uniform4f(uniformBaseColorLocation, baseColor)
gl.uniform4f(uniformMultiplyColorLocation, multiplyColor)
gl.uniform4f(uniformScreenColorLocation, screenColor)

// --- 设置 index buffer ---
gl.bindBuffer(ELEMENT_ARRAY_BUFFER, indexBuffer)
gl.bufferData(ELEMENT_ARRAY_BUFFER, model.getDrawableVertexIndices(index), DYNAMIC_DRAW)

// --- 设置混合函数 ---
gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha)  ← ONE, ONE_MINUS_SRC_ALPHA
```

---

## 第 12 步：顶点着色器 — vertshadersrc.vert

```glsl
attribute vec4 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
uniform mat4 u_matrix;

void main() {
    gl_Position = u_matrix * a_position;        ← ★ MVP 变换
    v_texCoord = a_texCoord;
    v_texCoord.y = 1.0 - v_texCoord.y;         ← UV 翻转
}
```

---

## 第 13 步：片段着色器 — fragshadersrcpremultipliedalpha.frag

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
    vec4 color = texColor * u_baseColor;                 ← × baseColor（含 opacity）
    gl_FragColor = vec4(color.rgb, color.a);             ← 输出
}
```

---

## 关键 GL 状态汇总

| 状态 | 值 | 设置位置 |
|------|-----|---------|
| DEPTH_TEST | 关闭 | preDraw() |
| SCISSOR_TEST | 关闭 | preDraw() |
| CULL_FACE | 关闭 | isCulling()=false |
| frontFace | CCW | drawMeshWebGL() |
| Blend | 开启 | preDraw() |
| blendFunc | ONE, ONE_MINUS_SRC_ALPHA | setupShaderProgramForDrawable() |
| clearColor | (0.12, 0.12, 0.2, 1) | renderFrame() |
| MVP 矩阵 | modelMatrix × viewMatrix × aspectRatio | createMvpMatrix() |
| u_baseColor | (opacity, opacity, opacity, opacity) | setupShaderProgramForDrawable() |
| u_matrix | renderer._mvpMatrix4x4 | setupShaderProgramForDrawable() |

---

## 矩阵乘法语义（源码确认）

```typescript
// cubismmatrix44.ts
public static multiply(a, b, dst): void {
    // dst = a × b（标准矩阵乘法）
    c[j + i*4] += a[k + i*4] * b[j + k*4]
}

public multiplyByMatrix(m): void {
    CubismMatrix44.multiply(m.getArray(), this._tr, this._tr);
    // this = m × this（左乘）
}
```

**Demo 的 MVP 构建链**：
```
projection = identity
projection.multiplyByMatrix(viewMatrix)  → projection = viewMatrix
model.draw(projection):
    matrix = viewMatrix
    matrix.multiplyByMatrix(modelMatrix) → matrix = modelMatrix × viewMatrix
    setMvpMatrix(matrix)
```

---

## 模型坐标系

- `getCanvasWidth()` = `CanvasWidth / PixelsPerUnit`（模型内部坐标范围）
- `getCanvasHeight()` = `CanvasHeight / PixelsPerUnit`
- `CubismModelMatrix(w, h)` 构造函数调用 `setHeight(2.0)`，将模型映射到 Y:-1~1
- `setHeight(h)` 内部调用 `scale(h/height, h/height)`，**替换**而非累乘
- `setScreenRect()` 只存储值到成员变量，**不修改矩阵**
- viewMatrix 在 setupViewMatrix 后实际是 **identity**

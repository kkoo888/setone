/**
 * Cubism 5 渲染管线独立测试
 * 用 Playwright 启动 Chromium (WebGL2)，加载 Cubism Core SDK + 模型文件，
 * 跑完整渲染管线，逐步检查每个环节。
 *
 * 用法: node test-render.mjs
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_PATH = join(__dirname, 'desktop/modules/live2d-5/lib/live2dcubismcore.min.js');
const MODEL_DIR = join(__dirname, 'desktop/src/renderer/public/live2d/Ren');

async function main() {
  console.log('🚀 启动 Chromium (WebGL2)...');
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-webgl2-compute-context'],
  });
  const page = await browser.newPage();

  // 捕获所有 console 输出
  page.on('console', msg => console.log(`[browser] ${msg.text()}`));
  page.on('pageerror', err => console.error(`[browser error] ${err.message}`));

  console.log('📦 加载 Cubism Core SDK...');
  const sdkCode = readFileSync(SDK_PATH, 'utf-8');
  await page.addScriptTag({ content: sdkCode });

  // 验证 SDK 加载
  const sdkOk = await page.evaluate(() => typeof window.Live2DCubismCore !== 'undefined');
  console.log(`✅ SDK 加载: ${sdkOk}`);
  if (!sdkOk) { await browser.close(); return; }

  console.log('🎨 创建 WebGL2 Canvas...');
  const model3Json = readFileSync(join(MODEL_DIR, 'Ren.model3.json'), 'utf-8');
  const moc3Buffer = readFileSync(join(MODEL_DIR, 'Ren.moc3'));
  const moc3Base64 = moc3Buffer.toString('base64');

  // 加载纹理文件
  const textureDir = join(MODEL_DIR, 'Ren.2048');
  const textureFiles = ['texture_00.png', 'texture_01.png'];
  const texturesBase64 = {};
  for (const f of textureFiles) {
    try {
      const buf = readFileSync(join(textureDir, f));
      texturesBase64[f] = buf.toString('base64');
      console.log(`  📄 纹理: ${f} (${(buf.length / 1024).toFixed(0)}KB)`);
    } catch { console.log(`  ⚠️ 纹理不存在: ${f}`); }
  }

  const result = await page.evaluate(async ({ model3Json, moc3Base64, texturesBase64 }) => {
    const log = [];
    const tryStep = (name, fn) => {
      try { const r = fn(); log.push(`✅ ${name}`); return r; }
      catch (e) { log.push(`❌ ${name}: ${e.message}`); return null; }
    };

    // 1. 创建 Canvas + WebGL2
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 500;
    document.body.appendChild(canvas);
    const gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true,
    });
    if (!gl) { log.push('❌ WebGL2 不可用'); return { log, pixels: [0,0,0,0] }; }
    log.push(`✅ WebGL2: ${gl.getParameter(gl.VERSION)}`);
    log.push(`  Renderer: ${gl.getParameter(gl.RENDERER)}`);
    gl.viewport(0, 0, 400, 500);

    // 2. 初始化 Cubism Framework
    const Core = window.Live2DCubismCore;
    log.push(`  Core 版本: ${Core.version()}`);

    // 3. 加载 moc3
    const mocBytes = Uint8Array.from(atob(moc3Base64), c => c.charCodeAt(0));
    log.push(`  moc3 大小: ${mocBytes.length} bytes`);

    const moc = tryStep('加载 Moc', () => Core.Moc.fromArrayBuffer(mocBytes.buffer));
    if (!moc) return { log, pixels: [0,0,0,0] };

    // 4. 创建 Model
    const model = tryStep('创建 Model', () => moc.createModel());
    if (!model) return { log, pixels: [0,0,0,0] };

    log.push(`  Drawable 数量: ${model.getDrawableCount()}`);
    log.push(`  Part 数量: ${model.getPartCount()}`);
    log.push(`  Parameter 数量: ${model.getParameterCount()}`);

    // 5. 检查 Canvas 尺寸
    const canvasW = model.getCanvasWidth();
    const canvasH = model.getCanvasHeight();
    log.push(`  模型 Canvas: ${canvasW} x ${canvasH}`);

    // 6. 更新模型（设置参数）
    model.update();

    // 7. 检查 Drawable 状态
    const dc = model.getDrawableCount();
    let visibleCount = 0;
    const drawables = [];
    for (let i = 0; i < dc; i++) {
      const vis = model.getDrawableDynamicFlagIsVisible(i);
      if (vis) visibleCount++;
      if (i < 5) {
        drawables.push({
          idx: i, visible: vis,
          vertexCount: model.getDrawableVertexCount(i),
          indexCount: model.getDrawableVertexIndexCount(i),
          texIdx: model.getDrawableTextureIndex(i),
          blendMode: model.getDrawableBlendMode(i),
          opacity: model.getDrawableOpacity(i),
        });
      }
    }
    log.push(`  可见 Drawable: ${visibleCount}/${dc}`);
    for (const d of drawables) {
      log.push(`    [${d.idx}] vis=${d.visible} vtx=${d.vertexCount} idx=${d.indexCount} tex=${d.texIdx} blend=${d.blendMode} opacity=${d.opacity}`);
    }

    // 8. 检查顶点数据
    const vtx0 = model.getDrawableVertices(0);
    log.push(`  Drawable[0] 顶点(前8): ${Array.from(vtx0.slice(0, 8)).map(v => v.toFixed(4)).join(', ')}`);

    // 9. 手动渲染测试：用简单 shader 绘制第一个 drawable
    // 编译 shader
    const vsSrc = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;
      uniform mat4 u_matrix;
      void main() {
        gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
        v_texCoord.y = 1.0 - v_texCoord.y;
      }`;

    const fsSrc = `#version 300 es
      precision mediump float;
      in vec2 v_texCoord;
      out vec4 fragColor;
      uniform sampler2D s_texture0;
      uniform vec4 u_baseColor;
      void main() {
        vec4 texColor = texture2D(s_texture0, v_texCoord);
        fragColor = texColor * u_baseColor;
      }`;

    function compileShader(gl, type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        log.push(`❌ Shader compile error: ${gl.getShaderInfoLog(s)}`);
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return { log, pixels: [0,0,0,0] };

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      log.push(`❌ Program link error: ${gl.getProgramInfoLog(prog)}`);
      return { log, pixels: [0,0,0,0] };
    }
    log.push('✅ 简单 shader 编译+链接成功');

    const aPos = gl.getAttribLocation(prog, 'a_position');
    const aUV = gl.getAttribLocation(prog, 'a_texCoord');
    const uMat = gl.getUniformLocation(prog, 'u_matrix');
    const uBase = gl.getUniformLocation(prog, 'u_baseColor');
    const uTex = gl.getUniformLocation(prog, 's_texture0');
    log.push(`  attrib locations: pos=${aPos} uv=${aUV}`);

    // 10. 创建 MVP 矩阵（简单缩放）
    const aspect = 400 / 500;
    const scale = 0.85;
    // 列主序
    const mvp = new Float32Array([
      scale * (500/400), 0, 0, 0,
      0, scale, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);

    // 11. 创建一个白色测试纹理（如果没有真实纹理）
    const testTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, testTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([255,200,200,255, 200,255,200,255, 200,200,255,255, 255,255,255,255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    // 12. 渲染第一个 drawable 到 canvas
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(prog);
    gl.uniformMatrix4fv(uMat, false, mvp);
    gl.uniform4f(uBase, 1.0, 1.0, 1.0, 1.0);
    gl.uniform1i(uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, testTex);

    // 顶点
    const vtxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vtxBuf);
    gl.bufferData(gl.ARRAY_BUFFER, model.getDrawableVertices(0), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // UV
    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, model.getDrawableVertexUvs(0), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);

    // Index
    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.getDrawableVertexIndices(0), gl.DYNAMIC_DRAW);

    const idxCount = model.getDrawableVertexIndexCount(0);
    log.push(`  绘制 Drawable[0]: ${idxCount} indices`);
    gl.drawElements(gl.TRIANGLES, idxCount, gl.UNSIGNED_SHORT, 0);

    const glErr = gl.getError();
    log.push(`  GL error after drawElements: ${glErr === gl.NO_ERROR ? 'none' : glErr}`);

    // 13. 读取像素
    const pixels = new Uint8Array(4);
    gl.readPixels(200, 250, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    log.push(`🔍 Canvas 中心像素 RGBA: ${Array.from(pixels).join(', ')}`);
    log.push(pixels[3] > 0 ? '✅ 有像素!' : '❌ 透明');

    // 14. 检查 isBlendModeEnabled（如果存在）
    try {
      const blendMode = model.isBlendModeEnabled?.();
      log.push(`  isBlendModeEnabled: ${blendMode}`);
    } catch(e) {
      log.push(`  isBlendModeEnabled: 方法不存在 (${e.message})`);
    }

    return { log, pixels: Array.from(pixels) };
  }, { model3Json, moc3Base64, texturesBase64 });

  console.log('\n========== 测试结果 ==========');
  for (const line of result.log) {
    console.log(line);
  }
  console.log(`\n最终像素: [${result.pixels.join(', ')}]`);
  console.log(result.pixels[3] > 0 ? '✅ 渲染成功!' : '❌ 渲染失败');

  await browser.close();
}

main().catch(console.error);

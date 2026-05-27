#version 300 es
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 *
 * WebGL 2 port — GLSL 300 es
 */

precision mediump float;

in vec2 v_texCoord;
out vec4 fragColor;
uniform vec4 u_baseColor;
uniform sampler2D s_texture0;

void main()
{
    fragColor = texture(s_texture0, v_texCoord) * u_baseColor;
}

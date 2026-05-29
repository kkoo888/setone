#!/usr/bin/env python3
"""
星游记（再飞行）舞蹈动作生成器 - 最高标准版
BPM 138, 91秒, 30fps
用满 yumi 模型全部可用参数，含相位差、力度曲线、呼吸感、表情联动
"""
import json
import math
import os

OUTPUT_DIR = os.path.dirname(__file__)
FPS = 30
DURATION = 91  # 秒
BPM = 138
BEAT = 60.0 / BPM  # 0.4348 秒/拍
TOTAL_FRAMES = DURATION * FPS  # 2730 帧

# ============================================================
# 工具函数
# ============================================================

def ease_in_out_sine(t):
    """正弦缓入缓出"""
    return -(math.cos(math.pi * t) - 1) / 2

def ease_out_quad(t):
    """二次缓出"""
    return 1 - (1 - t) ** 2

def ease_in_quad(t):
    """二次缓入"""
    return t * t

def lerp(a, b, t):
    """线性插值"""
    return a + (b - a) * t

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def beat_time(beat_num):
    """拍数转秒数"""
    return beat_num * BEAT

def frame_time(frame):
    """帧数转秒数"""
    return frame / FPS

def make_curve(param_id, frames_data):
    """
    从帧数据生成 motion3 曲线
    frames_data: [(frame, value), ...]
    """
    segments = [0, frames_data[0][1]]  # [init_time, init_value]
    for i, (f, v) in enumerate(frames_data):
        if i == 0:
            continue
        segments.extend([0, round(f / FPS, 4), round(v, 4)])
    return {
        "Target": "Parameter",
        "Id": param_id,
        "Segments": segments
    }

def generate_frames(func, total=TOTAL_FRAMES):
    """从函数生成每帧数据"""
    return [(f, func(f)) for f in range(total)]

def sin_wave(freq, amp, phase=0, offset=0):
    """生成正弦波函数"""
    return lambda f: offset + amp * math.sin(2 * math.pi * freq * f / FPS + phase)

def beat_pulse(bpm, amp=1.0, duty=0.5, phase=0):
    """节拍脉冲：在拍点上产生峰值"""
    beat_frames = 60.0 / bpm * FPS
    def func(f):
        pos = (f + phase * beat_frames) % beat_frames / beat_frames
        if pos < duty:
            return amp * ease_out_quad(pos / duty)
        else:
            return amp * ease_in_quad(1 - (pos - duty) / (1 - duty))
    return func

def combo(*funcs, weights=None):
    """组合多个函数"""
    if weights is None:
        weights = [1.0] * len(funcs)
    def func(f):
        return sum(fn(f) * w for fn, w in zip(funcs, weights))
    return func

def section_mask(start_sec, end_sec, fade_sec=0.3):
    """区间遮罩：在指定时间段内返回 1，过渡区域有淡入淡出"""
    def func(f):
        t = f / FPS
        if t < start_sec or t > end_sec:
            return 0.0
        if t - start_sec < fade_sec:
            return (t - start_sec) / fade_sec
        if end_sec - t < fade_sec:
            return (end_sec - t) / fade_sec
        return 1.0
    return func

# ============================================================
# 歌曲结构（再飞行 / 星游记）
# ============================================================
# 前奏: 0-12s (约 27 拍)
# Verse 1: 12-32s
# Chorus 1: 32-52s
# Verse 2: 52-68s
# Chorus 2: 68-84s
# Outro: 84-91s

SONG = {
    'intro':   (0, 12),
    'verse1':  (12, 32),
    'chorus1': (32, 52),
    'verse2':  (52, 68),
    'chorus2': (68, 84),
    'outro':   (84, 91),
}

def section_energy(t):
    """歌曲各区间的能量值 (0~1)"""
    if t < 12:    return 0.4   # 前奏：柔和
    if t < 32:    return 0.6   # 主歌1：渐起
    if t < 52:    return 1.0   # 副歌1：爆发
    if t < 68:    return 0.65  # 主歌2：稍缓
    if t < 84:    return 1.0   # 副歌2：再爆发
    return 0.5                 # 尾声：渐弱

# ============================================================
# 参数定义：40 条曲线，用满模型能力
# ============================================================

def build_all_curves():
    curves = []
    beat_f = 60.0 / BPM * FPS  # 每拍帧数

    # ============================================================
    # 1. 头部旋转 (6条) - 核心韵律
    # ============================================================

    # ParamAngleX - 头左右转，跟随节拍，相位差
    def angle_x(f):
        t = f / FPS
        e = section_energy(t)
        # 基础节拍摆动
        base = 18 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS)
        # 细微摇摆（半拍相位）
        detail = 6 * e * math.sin(2 * math.pi * (BPM/60) * f / FPS + 0.8)
        # 副歌加大
        chorus_boost = 1.3 if 32 <= t < 52 or 68 <= t < 84 else 1.0
        return clamp((base + detail) * chorus_boost, -30, 30)
    curves.append(make_curve("ParamAngleX", generate_frames(angle_x)))

    # ParamAngleY - 头上下点，点头感
    def angle_y(f):
        t = f / FPS
        e = section_energy(t)
        # 每拍点头
        nod = 10 * e * math.sin(2 * math.pi * (BPM/60) * f / FPS)
        # 缓慢起伏
        sway = 5 * math.sin(2 * math.pi * 0.15 * t)
        return clamp(nod + sway, -15, 15)
    curves.append(make_curve("ParamAngleY", generate_frames(angle_y)))

    # ParamAngleZ - 头左右倾斜，增加可爱感
    def angle_z(f):
        t = f / FPS
        e = section_energy(t)
        tilt = 8 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS + 1.2)
        accent = 4 * e * math.sin(2 * math.pi * (BPM/30) * f / FPS)
        return clamp(tilt + accent, -12, 12)
    curves.append(make_curve("ParamAngleZ", generate_frames(angle_z)))

    # ============================================================
    # 2. 身体旋转 (3条) - 躯干律动
    # ============================================================

    # ParamBodyAngleX - 身体左右摇，比头慢一拍（相位差！）
    def body_x(f):
        t = f / FPS
        e = section_energy(t)
        # 比头慢 0.15 秒的相位差
        phase_delay = 0.15 * 2 * math.pi * (BPM/120)
        base = 10 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS - phase_delay)
        # 扭胯感
        hip = 5 * e * math.sin(2 * math.pi * (BPM/60) * f / FPS + 0.5)
        return clamp(base + hip, -15, 15)
    curves.append(make_curve("ParamBodyAngleX", generate_frames(body_x)))

    # ParamBodyAngleY - 身体前后
    def body_y(f):
        t = f / FPS
        e = section_energy(t)
        # 呼吸起伏
        breath = 4 * e * math.sin(2 * math.pi * 0.25 * t)
        # 副歌前倾
        lean = 3 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS)
        return clamp(breath + lean, -8, 8)
    curves.append(make_curve("ParamBodyAngleY", generate_frames(body_y)))

    # ParamBodyAngleZ - 身体倾斜
    def body_z(f):
        t = f / FPS
        e = section_energy(t)
        tilt = 6 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS + 2.0)
        return clamp(tilt, -10, 10)
    curves.append(make_curve("ParamBodyAngleZ", generate_frames(body_z)))

    # ============================================================
    # 3. 身体位移 (1条)
    # ============================================================

    # ParamBodyposX - 身体水平位移
    def body_pos_x(f):
        t = f / FPS
        e = section_energy(t)
        # 左右移动
        move = 0.15 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS)
        return clamp(move, -0.25, 0.25)
    curves.append(make_curve("ParamBodyposX", generate_frames(body_pos_x)))

    # ============================================================
    # 4. 俯身 (1条)
    # ============================================================

    # Paramdown - 俯身动作
    def down(f):
        t = f / FPS
        e = section_energy(t)
        # 副歌有蹲起动作
        crouch = 0.3 * e * abs(math.sin(2 * math.pi * (BPM/60) * f / FPS))
        return clamp(crouch, 0, 0.5)
    curves.append(make_curve("Paramdown", generate_frames(down)))

    # ============================================================
    # 5. 呼吸 (1条)
    # ============================================================

    def breath(f):
        t = f / FPS
        e = section_energy(t)
        # 自然呼吸 + 跟节拍
        natural = 30 + 20 * math.sin(2 * math.pi * 0.25 * t)
        beat_sync = 10 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS)
        return clamp(natural + beat_sync, 0, 100)
    curves.append(make_curve("ParamBreath", generate_frames(breath)))

    # ============================================================
    # 6. 手臂 (2条) - 最有表现力的部分
    # ============================================================

    # ParamarmupL - 左手抬手
    def arm_l(f):
        t = f / FPS
        e = section_energy(t)
        # 基础律动
        base = 0.2 + 0.3 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS + 0.3)
        # 副歌大幅摆动
        if 32 <= t < 52 or 68 <= t < 84:
            chorus = 0.4 * abs(math.sin(2 * math.pi * (BPM/60) * f / FPS))
            base += chorus
        # 间奏举手
        if 52 <= t < 56:
            base += 0.3 * section_mask(52, 56)(f)
        return clamp(base, -0.5, 1.0)
    curves.append(make_curve("ParamarmupL", generate_frames(arm_l)))

    # ParamarmupR - 右手抬手，与左手错开半拍
    def arm_r(f):
        t = f / FPS
        e = section_energy(t)
        base = 0.2 + 0.3 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS - 1.5)
        if 32 <= t < 52 or 68 <= t < 84:
            chorus = 0.4 * abs(math.sin(2 * math.pi * (BPM/60) * f / FPS - math.pi/2))
            base += chorus
        if 56 <= t < 60:
            base += 0.3 * section_mask(56, 60)(f)
        return clamp(base, -0.5, 1.0)
    curves.append(make_curve("ParamarmupR", generate_frames(arm_r)))

    # ============================================================
    # 7. 手部物理 (2条)
    # ============================================================

    def hand_l(f):
        t = f / FPS
        e = section_energy(t)
        return clamp(0.3 + 0.3 * e * math.sin(2 * math.pi * (BPM/60) * f / FPS + 0.7), 0, 1)
    curves.append(make_curve("Paramhand1L", generate_frames(hand_l)))

    def hand_r(f):
        t = f / FPS
        e = section_energy(t)
        return clamp(0.3 + 0.3 * e * math.sin(2 * math.pi * (BPM/60) * f / FPS - 0.7), 0, 1)
    curves.append(make_curve("Paramhand1R", generate_frames(hand_r)))

    # ============================================================
    # 8. 眼睛 (4条)
    # ============================================================

    # 眨眼函数
    def blink_pattern(f):
        """自然眨眼：每 3-5 秒眨一次"""
        t = f / FPS
        # 主要眨眼时刻
        blink_times = [2.5, 5.8, 8.2, 12.0, 15.5, 19.0, 22.5, 26.0, 30.0,
                       33.5, 37.0, 40.5, 44.0, 47.5, 51.0, 55.0, 59.0,
                       63.0, 67.0, 71.0, 75.0, 79.0, 83.0, 87.0, 90.0]
        for bt in blink_times:
            if abs(t - bt) < 0.08:
                return 0.0
        return 100.0

    # ParamEyeOpenL - 左眼开闭
    def eye_l(f):
        base = blink_pattern(f)
        # 副歌微笑眯眼
        t = f / FPS
        if 32 <= t < 52 or 68 <= t < 84:
            base *= 0.85
        return base
    curves.append(make_curve("ParamEyeOpenL", generate_frames(eye_l)))

    # ParamEyeOpenR - 右眼开闭（与左眼同步，但偶尔错开增加自然感）
    def eye_r(f):
        base = blink_pattern(f)
        t = f / FPS
        if 32 <= t < 52 or 68 <= t < 84:
            base *= 0.85
        return base
    curves.append(make_curve("ParamEyeOpenR", generate_frames(eye_r)))

    # ParamEyeSmileL - 左眼微笑
    def eye_smile_l(f):
        t = f / FPS
        e = section_energy(t)
        # 副歌开心笑眼
        if 32 <= t < 52 or 68 <= t < 84:
            return clamp(0.5 + 0.3 * math.sin(2 * math.pi * (BPM/120) * f / FPS), 0, 1)
        return clamp(0.1 + 0.15 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS), 0, 0.5)
    curves.append(make_curve("ParamEyeSmileL", generate_frames(eye_smile_l)))

    # ParamEyeSmileR - 右眼微笑
    def eye_smile_r(f):
        return eye_smile_l(f)  # 同步
    curves.append(make_curve("ParamEyeSmileR", generate_frames(eye_smile_r)))

    # ============================================================
    # 9. 眼球 (2条)
    # ============================================================

    def eye_ball_x(f):
        t = f / FPS
        # 眼球跟随身体方向
        look = 0.5 * math.sin(2 * math.pi * (BPM/120) * f / FPS)
        return clamp(look, -1, 1)
    curves.append(make_curve("ParamEyeBallX", generate_frames(eye_ball_x)))

    def eye_ball_y(f):
        t = f / FPS
        look = 0.3 * math.sin(2 * math.pi * (BPM/120) * f / FPS + 0.5)
        return clamp(look, -1, 1)
    curves.append(make_curve("ParamEyeBallY", generate_frames(eye_ball_y)))

    # ============================================================
    # 10. 眉毛 (4条)
    # ============================================================

    def brow_y_l(f):
        t = f / FPS
        e = section_energy(t)
        # 副歌扬眉
        if 32 <= t < 52 or 68 <= t < 84:
            return clamp(0.3 + 0.3 * math.sin(2 * math.pi * (BPM/60) * f / FPS), -0.5, 1)
        return clamp(0.1 * math.sin(2 * math.pi * (BPM/120) * f / FPS), -0.3, 0.3)
    curves.append(make_curve("ParamBrowYL", generate_frames(brow_y_l)))

    def brow_y_r(f):
        return brow_y_l(f)
    curves.append(make_curve("ParamBrowYR", generate_frames(brow_y_r)))

    def brow_angle_l(f):
        t = f / FPS
        e = section_energy(t)
        return clamp(0.2 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS + 1.0), -0.5, 0.5)
    curves.append(make_curve("ParamBrowAngleL", generate_frames(brow_angle_l)))

    def brow_angle_r(f):
        return brow_angle_l(f)
    curves.append(make_curve("ParamBrowAngleR", generate_frames(brow_angle_r)))

    # ============================================================
    # 11. 嘴巴 (3条) - 表情核心
    # ============================================================

    # ParamMouthForm - 嘴型（微笑/开心）
    def mouth_form(f):
        t = f / FPS
        e = section_energy(t)
        # 基础微笑
        base = 0.2 + 0.2 * e
        # 节拍律动
        beat = 0.15 * math.sin(2 * math.pi * (BPM/60) * f / FPS)
        # 副歌大笑
        if 32 <= t < 52 or 68 <= t < 84:
            base += 0.2
        return clamp(base + beat, -0.2, 1)
    curves.append(make_curve("ParamMouthForm", generate_frames(mouth_form)))

    # ParamMouthOpenY - 嘴张开（跟着节奏）
    def mouth_open(f):
        t = f / FPS
        e = section_energy(t)
        # 跟拍开合
        base = 0.3 * e * abs(math.sin(2 * math.pi * (BPM/60) * f / FPS))
        # 副歌张大
        if 32 <= t < 52 or 68 <= t < 84:
            base += 0.2
        return clamp(base, 0, 1)
    curves.append(make_curve("ParamMouthOpenY", generate_frames(mouth_open)))

    # ParamMouthX - 歪嘴（俏皮感）
    def mouth_x(f):
        t = f / FPS
        # 偶尔歪嘴
        twist = 0.3 * math.sin(2 * math.pi * 0.3 * t) * math.sin(2 * math.pi * (BPM/120) * f / FPS)
        return clamp(twist, -0.5, 0.5)
    curves.append(make_curve("ParamMouthX", generate_frames(mouth_x)))

    # ============================================================
    # 12. 脸红 (1条)
    # ============================================================

    def smile_shy(f):
        t = f / FPS
        e = section_energy(t)
        # 副歌害羞脸红
        if 32 <= t < 52 or 68 <= t < 84:
            return clamp(0.4 + 0.3 * math.sin(2 * math.pi * 0.5 * t), 0, 1)
        return clamp(0.1 * e, 0, 0.3)
    curves.append(make_curve("Paramsmileshy", generate_frames(smile_shy)))

    # ============================================================
    # 13. 特效表情 (3条) - 亮点时刻
    # ============================================================

    # 星星眼 - 副歌高潮
    def xingxing(f):
        t = f / FPS
        # 副歌出现星星眼
        if 38 <= t < 42 or 74 <= t < 78:
            pulse = math.sin(2 * math.pi * 2 * t)
            return clamp(0.6 + 0.4 * pulse, 0, 1)
        return 0.0
    curves.append(make_curve("Paramxingxing", generate_frames(xingxing)))

    # 爱心眼 - 特定时刻
    def heart(f):
        t = f / FPS
        if 44 <= t < 48 or 80 <= t < 84:
            return clamp(0.7 + 0.3 * math.sin(2 * math.pi * 3 * t), 0, 1)
        return 0.0
    curves.append(make_curve("Paramheart", generate_frames(heart)))

    # 微笑脸红 - 贯穿全曲
    def blush(f):
        t = f / FPS
        e = section_energy(t)
        base = 0.15 * e
        # 副歌加强
        if 32 <= t < 52 or 68 <= t < 84:
            base += 0.25
        return clamp(base, 0, 0.8)
    curves.append(make_curve("Paramsmileshy", generate_frames(blush)))

    # ============================================================
    # 14. 头发物理 (4条) - 随动飘逸
    # ============================================================

    def hair_front_l(f):
        t = f / FPS
        e = section_energy(t)
        # 跟随身体运动，带延迟
        swing = 0.3 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS - 0.8)
        return clamp(swing, -0.5, 0.5)
    curves.append(make_curve("ParamHairFrontL1", generate_frames(hair_front_l)))

    def hair_front_r(f):
        t = f / FPS
        e = section_energy(t)
        swing = 0.3 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS + 0.8)
        return clamp(swing, -0.5, 0.5)
    curves.append(make_curve("ParamHairFrontR1", generate_frames(hair_front_r)))

    def hair_bin_l(f):
        t = f / FPS
        e = section_energy(t)
        swing = 0.4 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS - 1.2)
        return clamp(swing, -0.6, 0.6)
    curves.append(make_curve("ParamHairbinL1", generate_frames(hair_bin_l)))

    def hair_bin_r(f):
        t = f / FPS
        e = section_energy(t)
        swing = 0.4 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS + 1.2)
        return clamp(swing, -0.6, 0.6)
    curves.append(make_curve("ParamHairbinR1", generate_frames(hair_bin_r)))

    # ============================================================
    # 15. 耳朵物理 (2条)
    # ============================================================

    def ear_l(f):
        t = f / FPS
        e = section_energy(t)
        twitch = 0.2 * e * math.sin(2 * math.pi * (BPM/60) * f / FPS)
        return clamp(twitch, -0.3, 0.3)
    curves.append(make_curve("Paramearupl1", generate_frames(ear_l)))

    def ear_r(f):
        t = f / FPS
        e = section_energy(t)
        twitch = 0.2 * e * math.sin(2 * math.pi * (BPM/60) * f / FPS + 0.5)
        return clamp(twitch, -0.3, 0.3)
    curves.append(make_curve("Paramearupr1", generate_frames(ear_r)))

    # ============================================================
    # 16. 眼睛物理 (2条)
    # ============================================================

    def eye_phys_l(f):
        t = f / FPS
        e = section_energy(t)
        return clamp(0.3 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS), -0.5, 0.5)
    curves.append(make_curve("Parameyeswuli1L", generate_frames(eye_phys_l)))

    def eye_phys_r(f):
        return eye_phys_l(f)
    curves.append(make_curve("Parameyeswuli1R", generate_frames(eye_phys_r)))

    # ============================================================
    # 17. 衣服物理 (2条)
    # ============================================================

    def cloth_l(f):
        t = f / FPS
        e = section_energy(t)
        # 跟随身体运动
        swing = 0.3 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS - 0.5)
        return clamp(swing, -0.5, 0.5)
    curves.append(make_curve("ParamfukutwoL1", generate_frames(cloth_l)))

    def cloth_r(f):
        t = f / FPS
        e = section_energy(t)
        swing = 0.3 * e * math.sin(2 * math.pi * (BPM/120) * f / FPS + 0.5)
        return clamp(swing, -0.5, 0.5)
    curves.append(make_curve("ParamfukutwoR1", generate_frames(cloth_r)))

    # ============================================================
    # 18. 上臂物理 (2条)
    # ============================================================

    def arm_phys_l(f):
        t = f / FPS
        e = section_energy(t)
        swing = 0.25 * e * math.sin(2 * math.pi * (BPM/60) * f / FPS + 0.3)
        return clamp(swing, -0.4, 0.4)
    curves.append(make_curve("Paramarmue1L", generate_frames(arm_phys_l)))

    def arm_phys_r(f):
        t = f / FPS
        e = section_energy(t)
        swing = 0.25 * e * math.sin(2 * math.pi * (BPM/60) * f / FPS - 0.3)
        return clamp(swing, -0.4, 0.4)
    curves.append(make_curve("Paramarmue1R", generate_frames(arm_phys_r)))

    # ============================================================
    # 19. 手指物理 (2条)
    # ============================================================

    def finger_l(f):
        t = f / FPS
        e = section_energy(t)
        # 手指跟拍律动
        wiggle = 0.3 * e * math.sin(2 * math.pi * (BPM/30) * f / FPS)
        return clamp(0.3 + wiggle, 0, 1)
    curves.append(make_curve("ParamyubiL1", generate_frames(finger_l)))

    def finger_r(f):
        t = f / FPS
        e = section_energy(t)
        wiggle = 0.3 * e * math.sin(2 * math.pi * (BPM/30) * f / FPS + 1.0)
        return clamp(0.3 + wiggle, 0, 1)
    curves.append(make_curve("ParamyubiR1", generate_frames(finger_r)))

    # ============================================================
    # 20. 瞳孔物理 (2条)
    # ============================================================

    def pupil_l(f):
        t = f / FPS
        # 瞳孔微微晃动
        wobble = 0.2 * math.sin(2 * math.pi * 0.8 * t)
        return clamp(wobble, -0.3, 0.3)
    curves.append(make_curve("ParamtongkongL", generate_frames(pupil_l)))

    def pupil_r(f):
        return pupil_l(f)
    curves.append(make_curve("ParamtongkongR", generate_frames(pupil_r)))

    return curves


# ============================================================
# 生成并保存
# ============================================================

def generate_motion():
    curves = build_all_curves()

    # 计算 meta
    total_segments = 0
    total_points = 0
    for c in curves:
        segs = c["Segments"]
        i = 0
        while i < len(segs):
            if i == 0:
                total_points += 1
                i += 2
            else:
                seg_type = int(segs[i])
                if seg_type == 0:
                    total_points += 1
                    total_segments += 1
                    i += 3
                elif seg_type == 1:
                    total_points += 3
                    total_segments += 1
                    i += 7
                else:
                    total_points += 1
                    total_segments += 1
                    i += 3

    motion = {
        "Version": 3,
        "Meta": {
            "Duration": DURATION,
            "Fps": FPS,
            "Loop": True,
            "AreBeziersRestricted": True,
            "CurveCount": len(curves),
            "TotalSegmentCount": total_segments,
            "TotalPointCount": total_points,
            "UserDataCount": 0,
            "TotalUserDataSize": 0
        },
        "Curves": curves
    }
    return motion


if __name__ == "__main__":
    print("🎵 星游记（再飞行）舞蹈生成器 - 最高标准版")
    print(f"   BPM: {BPM}, 时长: {DURATION}s, 帧率: {FPS}fps")
    print(f"   总帧数: {TOTAL_FRAMES}")
    print()

    motion = generate_motion()
    meta = motion["Meta"]

    print(f"📊 曲线数: {meta['CurveCount']}")
    print(f"   段落数: {meta['TotalSegmentCount']}")
    print(f"   关键帧: {meta['TotalPointCount']}")
    print()

    # 保存
    out_path = os.path.join(OUTPUT_DIR, "motions", "yumi_xingyouji_pro.motion3.json")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(motion, f, indent=2, ensure_ascii=False)
    print(f"✅ 已保存: {out_path}")
    print(f"   文件大小: {os.path.getsize(out_path) / 1024:.1f} KB")

    # 打印每条曲线统计
    print("\n📈 曲线统计:")
    for c in motion["Curves"]:
        segs = c["Segments"]
        vals = []
        i = 0
        while i < len(segs):
            if i == 0:
                vals.append(segs[i+1])
                i += 2
            else:
                t = int(segs[i])
                if t == 0:
                    vals.append(segs[i+2])
                    i += 3
                else:
                    i += 3
        if vals:
            print(f"  {c['Id']:25s}  min={min(vals):7.2f}  max={max(vals):7.2f}  range={max(vals)-min(vals):7.2f}")

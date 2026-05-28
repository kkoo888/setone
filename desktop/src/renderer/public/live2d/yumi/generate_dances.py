#!/usr/bin/env python3
"""
生成 10 个 Live2D 舞蹈动作文件 (.motion3.json)
用于 yumi 模型
"""
import json
import math
import os

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "motions")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ============================================================
# 工具函数
# ============================================================

def linear_seg(t, v):
    """线性段: [0, time, value]"""
    return [0, t, v]

def bezier_seg(t, v, cp1_t=None, cp1_v=None, cp2_t=None, cp2_v=None):
    """贝塞尔段: [1, cp1_t, cp1_v, cp2_t, cp2_v, end_t, end_v]"""
    if cp1_t is None:
        cp1_t = t - 0.1
    if cp1_v is None:
        cp1_v = v
    if cp2_t is None:
        cp2_t = t - 0.05
    if cp2_v is None:
        cp2_v = v
    return [1, cp1_t, cp1_v, cp2_t, cp2_v, t, v]

def stepped_seg(t, v):
    """阶梯段: [2, time, value]"""
    return [2, t, v]

def make_curve(param_id, init_v, keyframes, init_t=0):
    """
    生成一条参数曲线
    keyframes: [(time, value), ...] 或 [(time, value, 'bezier'), ...]
    """
    segments = [init_t, init_v]
    for kf in keyframes:
        if isinstance(kf, tuple) and len(kf) == 3 and kf[2] == 's':
            segments.extend(stepped_seg(kf[0], kf[1]))
        else:
            t, v = kf[0], kf[1]
            segments.extend(bezier_seg(t, v))
    return {
        "Target": "Parameter",
        "Id": param_id,
        "Segments": segments
    }

def generate_motion(name, duration, curves, fps=30, loop=True):
    """生成完整的 motion3.json"""
    total_segments = sum(len(c["Segments"]) for c in curves)
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
                if seg_type == 0 or seg_type == 2 or seg_type == 3:
                    total_points += 1
                    i += 3
                elif seg_type == 1:
                    total_points += 3
                    i += 7
                else:
                    i += 1

    motion = {
        "Version": 3,
        "Meta": {
            "Duration": duration,
            "Fps": fps,
            "Loop": loop,
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

def save_motion(motion, filename):
    path = os.path.join(OUTPUT_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(motion, f, indent=2, ensure_ascii=False)
    print(f"  ✅ {filename} ({motion['Meta']['Duration']}s, {motion['Meta']['CurveCount']} curves)")

# ============================================================
# 参数常量 (yumi 模型参数名)
# ============================================================
ANGLE_X = "ParamAngleX"
ANGLE_Y = "ParamAngleY"
ANGLE_Z = "ParamAngleZ"
BODY_X = "ParamBodyAngleX"
BODY_Y = "ParamBodyAngleY"
BODY_Z = "ParamBodyAngleZ"
EYE_L = "ParamEyeOpenL"
EYE_R = "ParamEyeOpenR"
MOUTH = "ParamMouthOpenY"
ARM_L = "ParamarmupL"
ARM_R = "ParamarmupR"
HAND_L = "Paramhand1L"
HAND_R = "Paramhand1R"
LEG = "Paramdown"

# ============================================================
# 舞蹈 1: BBoom BBoom (MOMOLAND - 俏皮可爱)
# ============================================================
def gen_bboomboom():
    """俏皮可爱，扭胯摆手，重复节奏感强"""
    dur = 60
    curves = []

    # 头部：左右摆动 + 微微点头
    head_x = []
    head_y = []
    head_z = []
    for beat in range(0, dur, 1):
        # 每拍左右摆头
        if beat % 2 == 0:
            head_x.append((beat, 15))
            head_z.append((beat, -5))
        else:
            head_x.append((beat, -15))
            head_z.append((beat, 5))
        # 每4拍点一次头
        if beat % 4 == 0:
            head_y.append((beat, -8))
        elif beat % 4 == 2:
            head_y.append((beat, 5))

    curves.append(make_curve(ANGLE_X, 0, head_x))
    curves.append(make_curve(ANGLE_Y, 0, head_y))
    curves.append(make_curve(ANGLE_Z, 0, head_z))

    # 身体：扭胯
    body_x = []
    body_z = []
    for beat in range(0, dur, 1):
        if beat % 2 == 0:
            body_x.append((beat, 8))
            body_z.append((beat, -3))
        else:
            body_x.append((beat, -8))
            body_z.append((beat, 3))
    curves.append(make_curve(BODY_X, 0, body_x))
    curves.append(make_curve(BODY_Z, 0, body_z))

    # 手臂：交替摆动
    arm_l = []
    arm_r = []
    for beat in range(0, dur, 1):
        phase = beat % 4
        if phase == 0:
            arm_l.append((beat, 30))
            arm_r.append((beat, -10))
        elif phase == 1:
            arm_l.append((beat, -10))
            arm_r.append((beat, 30))
        elif phase == 2:
            arm_l.append((beat, 50))
            arm_r.append((beat, -10))
        else:
            arm_l.append((beat, -10))
            arm_r.append((beat, 50))
    curves.append(make_curve(ARM_L, 0, arm_l))
    curves.append(make_curve(ARM_R, 0, arm_r))

    # 手：握拳/张开
    hand_l = []
    hand_r = []
    for beat in range(0, dur, 2):
        hand_l.append((beat, 50))
        hand_l.append((beat + 1, 0))
        hand_r.append((beat, 0))
        hand_r.append((beat + 1, 50))
    curves.append(make_curve(HAND_L, 0, hand_l))
    curves.append(make_curve(HAND_R, 0, hand_r))

    # 嘴巴：跟着节奏开合
    mouth = []
    for beat in range(0, dur, 1):
        if beat % 2 == 0:
            mouth.append((beat, 30))
        else:
            mouth.append((beat, 0))
    curves.append(make_curve(MOUTH, 0, mouth))

    # 眨眼
    eye_l = [(0, 100), (2, 0, 's'), (2.1, 100, 's'), (8, 100), (10, 0, 's'), (10.1, 100, 's'),
             (18, 100), (20, 0, 's'), (20.1, 100, 's'), (28, 100), (30, 0, 's'), (30.1, 100, 's'),
             (38, 100), (40, 0, 's'), (40.1, 100, 's'), (48, 100), (50, 0, 's'), (50.1, 100, 's')]
    curves.append(make_curve(EYE_L, 100, eye_l))
    curves.append(make_curve(EYE_R, 100, eye_l))

    return generate_motion("BBoom BBoom", dur, curves)

# ============================================================
# 舞蹈 2: Superstar (活力四射)
# ============================================================
def gen_superstar():
    """活力四射，手臂展开，大动作"""
    dur = 60
    curves = []

    # 头部：有活力的摆动
    head_x = []
    head_y = []
    head_z = []
    for beat in range(0, dur, 1):
        t = beat
        head_x.append((t, 20 * math.sin(beat * 1.5)))
        head_y.append((t, 10 * math.sin(beat * 0.8)))
        head_z.append((t, 10 * math.cos(beat * 1.2)))
    curves.append(make_curve(ANGLE_X, 0, [(t, v) for t, v in head_x]))
    curves.append(make_curve(ANGLE_Y, 0, [(t, v) for t, v in head_y]))
    curves.append(make_curve(ANGLE_Z, 0, [(t, v) for t, v in head_z]))

    # 身体：大幅摇摆
    body_x = []
    body_z = []
    for beat in range(0, dur, 1):
        body_x.append((beat, 12 * math.sin(beat * 0.8)))
        body_z.append((beat, 8 * math.cos(beat * 1.0)))
    curves.append(make_curve(BODY_X, 0, [(t, v) for t, v in body_x]))
    curves.append(make_curve(BODY_Z, 0, [(t, v) for t, v in body_z]))

    # 手臂：大幅展开
    arm_l = []
    arm_r = []
    for beat in range(0, dur, 1):
        if beat % 4 < 2:
            arm_l.append((beat, 60))
            arm_r.append((beat, -20))
        else:
            arm_l.append((beat, -20))
            arm_r.append((beat, 60))
    curves.append(make_curve(ARM_L, 0, arm_l))
    curves.append(make_curve(ARM_R, 0, arm_r))

    # 手
    hand_l = []
    hand_r = []
    for beat in range(0, dur, 2):
        hand_l.append((beat, 40))
        hand_r.append((beat + 1, 40))
    curves.append(make_curve(HAND_L, 0, hand_l))
    curves.append(make_curve(HAND_R, 0, hand_r))

    # 嘴巴
    mouth = []
    for beat in range(0, dur, 4):
        mouth.append((beat, 40))
        mouth.append((beat + 1, 60))
        mouth.append((beat + 2, 20))
        mouth.append((beat + 3, 0))
    curves.append(make_curve(MOUTH, 0, mouth))

    # 眨眼
    eye = [(0, 100), (5, 0, 's'), (5.1, 100, 's'), (15, 100), (17, 0, 's'), (17.1, 100, 's'),
           (30, 100), (32, 0, 's'), (32.1, 100, 's'), (45, 100), (47, 0, 's'), (47.1, 100, 's')]
    curves.append(make_curve(EYE_L, 100, eye))
    curves.append(make_curve(EYE_R, 100, eye))

    return generate_motion("Superstar", dur, curves)

# ============================================================
# 舞蹈 3: Time (流畅律动)
# ============================================================
def gen_time():
    """流畅律动，身体波浪"""
    dur = 60
    curves = []

    # 头部：柔和摆动
    head_x = [(t, 12 * math.sin(t * 0.5)) for t in range(dur)]
    head_y = [(t, 6 * math.sin(t * 0.3)) for t in range(dur)]
    head_z = [(t, 8 * math.sin(t * 0.4)) for t in range(dur)]
    curves.append(make_curve(ANGLE_X, 0, head_x))
    curves.append(make_curve(ANGLE_Y, 0, head_y))
    curves.append(make_curve(ANGLE_Z, 0, head_z))

    # 身体：波浪
    body_x = [(t, 10 * math.sin(t * 0.4 + 0.5)) for t in range(dur)]
    body_y = [(t, 5 * math.sin(t * 0.3)) for t in range(dur)]
    body_z = [(t, 6 * math.cos(t * 0.35)) for t in range(dur)]
    curves.append(make_curve(BODY_X, 0, body_x))
    curves.append(make_curve(BODY_Y, 0, body_y))
    curves.append(make_curve(BODY_Z, 0, body_z))

    # 手臂：柔和波浪
    arm_l = [(t, 30 + 20 * math.sin(t * 0.6)) for t in range(dur)]
    arm_r = [(t, 30 + 20 * math.cos(t * 0.6)) for t in range(dur)]
    curves.append(make_curve(ARM_L, 0, arm_l))
    curves.append(make_curve(ARM_R, 0, arm_r))

    # 手
    hand_l = [(t, 30 + 20 * math.sin(t * 0.8)) for t in range(dur)]
    hand_r = [(t, 30 + 20 * math.cos(t * 0.8)) for t in range(dur)]
    curves.append(make_curve(HAND_L, 0, hand_l))
    curves.append(make_curve(HAND_R, 0, hand_r))

    # 嘴巴
    mouth = [(t, 15 + 15 * math.sin(t * 0.5)) for t in range(dur)]
    curves.append(make_curve(MOUTH, 0, mouth))

    # 眨眼
    eye = [(0, 100), (8, 0, 's'), (8.1, 100, 's'), (22, 100), (24, 0, 's'), (24.1, 100, 's'),
           (38, 100), (40, 0, 's'), (40.1, 100, 's'), (52, 100), (54, 0, 's'), (54.1, 100, 's')]
    curves.append(make_curve(EYE_L, 100, eye))
    curves.append(make_curve(EYE_R, 100, eye))

    return generate_motion("Time", dur, curves)

# ============================================================
# 舞蹈 4: Toca Toca (拉丁风情)
# ============================================================
def gen_toca_toca():
    """拉丁风情，胯部摇摆"""
    dur = 60
    curves = []

    # 头部：挑逗感
    head_x = []
    head_z = []
    for beat in range(0, dur, 1):
        head_x.append((beat, 18 * math.sin(beat * 2.0)))
        head_z.append((beat, 12 * math.sin(beat * 1.5 + 1)))
    curves.append(make_curve(ANGLE_X, 0, head_x))
    curves.append(make_curve(ANGLE_Z, 0, head_z))
    curves.append(make_curve(ANGLE_Y, 0, [(t, 5 * math.sin(t * 0.5)) for t in range(dur)]))

    # 身体：大幅胯部摇摆
    body_x = [(t, 15 * math.sin(t * 1.2)) for t in range(dur)]
    body_y = [(t, 8 * math.sin(t * 0.8)) for t in range(dur)]
    body_z = [(t, 10 * math.cos(t * 1.0)) for t in range(dur)]
    curves.append(make_curve(BODY_X, 0, body_x))
    curves.append(make_curve(BODY_Y, 0, body_y))
    curves.append(make_curve(BODY_Z, 0, body_z))

    # 手臂：拉丁手势
    arm_l = []
    arm_r = []
    for beat in range(0, dur, 1):
        arm_l.append((beat, 40 + 30 * math.sin(beat * 1.5)))
        arm_r.append((beat, 40 + 30 * math.cos(beat * 1.5)))
    curves.append(make_curve(ARM_L, 0, arm_l))
    curves.append(make_curve(ARM_R, 0, arm_r))

    curves.append(make_curve(HAND_L, 0, [(t, 40 + 30 * math.sin(t * 2)) for t in range(dur)]))
    curves.append(make_curve(HAND_R, 0, [(t, 40 + 30 * math.cos(t * 2)) for t in range(dur)]))

    curves.append(make_curve(MOUTH, 0, [(t, 20 + 20 * math.sin(t * 1.0)) for t in range(dur)]))

    eye = [(0, 100), (6, 0, 's'), (6.1, 100, 's'), (18, 100), (20, 0, 's'), (20.1, 100, 's'),
           (34, 100), (36, 0, 's'), (36.1, 100, 's'), (50, 100), (52, 0, 's'), (52.1, 100, 's')]
    curves.append(make_curve(EYE_L, 100, eye))
    curves.append(make_curve(EYE_R, 100, eye))

    return generate_motion("Toca Toca", dur, curves)

# ============================================================
# 舞蹈 5: Dura (抖音神曲)
# ============================================================
def gen_dura():
    """简单重复，节奏感强"""
    dur = 60
    curves = []

    # 头部：跟节奏点头
    head_x = []
    head_y = []
    for beat in range(0, dur, 1):
        if beat % 4 == 0:
            head_x.append((beat, 20))
            head_y.append((beat, -10))
        elif beat % 4 == 1:
            head_x.append((beat, 0))
            head_y.append((beat, 5))
        elif beat % 4 == 2:
            head_x.append((beat, -20))
            head_y.append((beat, -10))
        else:
            head_x.append((beat, 0))
            head_y.append((beat, 5))
    curves.append(make_curve(ANGLE_X, 0, head_x))
    curves.append(make_curve(ANGLE_Y, 0, head_y))
    curves.append(make_curve(ANGLE_Z, 0, [(t, 8 * math.sin(t * 1.5)) for t in range(dur)]))

    # 身体：跟着摇
    body_x = [(t, 10 * math.sin(t * 1.5)) for t in range(dur)]
    body_z = [(t, 6 * math.cos(t * 1.2)) for t in range(dur)]
    curves.append(make_curve(BODY_X, 0, body_x))
    curves.append(make_curve(BODY_Z, 0, body_z))

    # 手臂：简单的前后摆
    arm_l = []
    arm_r = []
    for beat in range(0, dur, 2):
        arm_l.append((beat, 40))
        arm_l.append((beat + 1, -10))
        arm_r.append((beat, -10))
        arm_r.append((beat + 1, 40))
    curves.append(make_curve(ARM_L, 0, arm_l))
    curves.append(make_curve(ARM_R, 0, arm_r))

    curves.append(make_curve(HAND_L, 0, [(t, 30) for t in range(0, dur, 2)]))
    curves.append(make_curve(HAND_R, 0, [(t + 1, 30) for t in range(0, dur, 2)]))

    curves.append(make_curve(MOUTH, 0, [(t, 25) for t in range(0, dur, 4)] +
                            [(t + 1, 50) for t in range(0, dur, 4)] +
                            [(t + 2, 25) for t in range(0, dur, 4)] +
                            [(t + 3, 0) for t in range(0, dur, 4)]))

    eye = [(0, 100), (10, 0, 's'), (10.1, 100, 's'), (25, 100), (27, 0, 's'), (27.1, 100, 's'),
           (40, 100), (42, 0, 's'), (42.1, 100, 's'), (55, 100), (57, 0, 's'), (57.1, 100, 's')]
    curves.append(make_curve(EYE_L, 100, eye))
    curves.append(make_curve(EYE_R, 100, eye))

    return generate_motion("Dura", dur, curves)

# ============================================================
# 舞蹈 6: Kiat Jud Dai (泰国舞)
# ============================================================
def gen_kiat_jud_dai():
    """泰国舞，手势丰富，头部转动"""
    dur = 60
    curves = []

    # 夥部：泰国舞特色，手指和头部配合
    head_x = []
    head_y = []
    head_z = []
    for beat in range(0, dur, 1):
        head_x.append((beat, 15 * math.sin(beat * 1.8)))
        head_y.append((beat, 8 * math.sin(beat * 2.5)))
        head_z.append((beat, 10 * math.sin(beat * 1.2 + 0.5)))
    curves.append(make_curve(ANGLE_X, 0, head_x))
    curves.append(make_curve(ANGLE_Y, 0, head_y))
    curves.append(make_curve(ANGLE_Z, 0, head_z))

    # 身体：微微摇摆
    body_x = [(t, 8 * math.sin(t * 0.8)) for t in range(dur)]
    body_y = [(t, 4 * math.sin(t * 0.5)) for t in range(dur)]
    body_z = [(t, 5 * math.cos(t * 0.6)) for t in range(dur)]
    curves.append(make_curve(BODY_X, 0, body_x))
    curves.append(make_curve(BODY_Y, 0, body_y))
    curves.append(make_curve(BODY_Z, 0, body_z))

    # 手臂：泰国舞手势，优雅弯曲
    arm_l = []
    arm_r = []
    for beat in range(0, dur, 1):
        arm_l.append((beat, 45 + 25 * math.sin(beat * 1.2)))
        arm_r.append((beat, 45 + 25 * math.cos(beat * 1.2)))
    curves.append(make_curve(ARM_L, 0, arm_l))
    curves.append(make_curve(ARM_R, 0, arm_r))

    # 手指：精细动作
    hand_l = [(t, 50 + 30 * math.sin(t * 2.0)) for t in range(dur)]
    hand_r = [(t, 50 + 30 * math.cos(t * 2.0)) for t in range(dur)]
    curves.append(make_curve(HAND_L, 0, hand_l))
    curves.append(make_curve(HAND_R, 0, hand_r))

    curves.append(make_curve(MOUTH, 0, [(t, 15 + 15 * math.sin(t * 1.5)) for t in range(dur)]))

    eye = [(0, 100), (4, 0, 's'), (4.1, 100, 's'), (12, 100), (14, 0, 's'), (14.1, 100, 's'),
           (24, 100), (26, 0, 's'), (26.1, 100, 's'), (36, 100), (38, 0, 's'), (38.1, 100, 's'),
           (48, 100), (50, 0, 's'), (50.1, 100, 's')]
    curves.append(make_curve(EYE_L, 100, eye))
    curves.append(make_curve(EYE_R, 100, eye))

    return generate_motion("Kiat Jud Dai", dur, curves)

# ============================================================
# 舞蹈 7: Mi Gente (拉丁热舞)
# ============================================================
def gen_mi_gente():
    """拉丁热舞，全身律动"""
    dur = 60
    curves = []

    head_x = [(t, 20 * math.sin(t * 1.5)) for t in range(dur)]
    head_y = [(t, 8 * math.sin(t * 0.8)) for t in range(dur)]
    head_z = [(t, 12 * math.sin(t * 1.0 + 0.3)) for t in range(dur)]
    curves.append(make_curve(ANGLE_X, 0, head_x))
    curves.append(make_curve(ANGLE_Y, 0, head_y))
    curves.append(make_curve(ANGLE_Z, 0, head_z))

    body_x = [(t, 14 * math.sin(t * 1.0)) for t in range(dur)]
    body_y = [(t, 6 * math.sin(t * 0.6)) for t in range(dur)]
    body_z = [(t, 10 * math.cos(t * 0.8)) for t in range(dur)]
    curves.append(make_curve(BODY_X, 0, body_x))
    curves.append(make_curve(BODY_Y, 0, body_y))
    curves.append(make_curve(BODY_Z, 0, body_z))

    arm_l = [(t, 50 + 30 * math.sin(t * 1.2)) for t in range(dur)]
    arm_r = [(t, 50 + 30 * math.cos(t * 1.2)) for t in range(dur)]
    curves.append(make_curve(ARM_L, 0, arm_l))
    curves.append(make_curve(ARM_R, 0, arm_r))

    curves.append(make_curve(HAND_L, 0, [(t, 40 + 30 * math.sin(t * 1.8)) for t in range(dur)]))
    curves.append(make_curve(HAND_R, 0, [(t, 40 + 30 * math.cos(t * 1.8)) for t in range(dur)]))

    curves.append(make_curve(MOUTH, 0, [(t, 25 + 25 * math.sin(t * 0.8)) for t in range(dur)]))

    eye = [(0, 100), (7, 0, 's'), (7.1, 100, 's'), (20, 100), (22, 0, 's'), (22.1, 100, 's'),
           (35, 100), (37, 0, 's'), (37.1, 100, 's'), (50, 100), (52, 0, 's'), (52.1, 100, 's')]
    curves.append(make_curve(EYE_L, 100, eye))
    curves.append(make_curve(EYE_R, 100, eye))

    return generate_motion("Mi Gente", dur, curves)

# ============================================================
# 舞蹈 8: The Riddle (电子舞曲)
# ============================================================
def gen_the_riddle():
    """电子舞曲，机械感，棱角分明"""
    dur = 60
    curves = []

    # 头部：机械感，快速切换
    head_x = []
    head_y = []
    head_z = []
    for beat in range(0, dur, 1):
        if beat % 4 == 0:
            head_x.append((beat, 25, 's'))
            head_y.append((beat, 0, 's'))
        elif beat % 4 == 1:
            head_x.append((beat, -25, 's'))
            head_y.append((beat, 10, 's'))
        elif beat % 4 == 2:
            head_x.append((beat, 0, 's'))
            head_y.append((beat, -10, 's'))
        else:
            head_x.append((beat, -15, 's'))
            head_y.append((beat, 0, 's'))
    curves.append(make_curve(ANGLE_X, 0, head_x))
    curves.append(make_curve(ANGLE_Y, 0, head_y))
    curves.append(make_curve(ANGLE_Z, 0, [(t, 15 * math.sin(t * 2.0)) for t in range(dur)]))

    # 身体：机械摆动
    body_x = []
    body_z = []
    for beat in range(0, dur, 2):
        body_x.append((beat, 12, 's'))
        body_x.append((beat + 1, -12, 's'))
        body_z.append((beat, -8, 's'))
        body_z.append((beat + 1, 8, 's'))
    curves.append(make_curve(BODY_X, 0, body_x))
    curves.append(make_curve(BODY_Z, 0, body_z))

    # 手臂：机器人手势
    arm_l = []
    arm_r = []
    for beat in range(0, dur, 1):
        if beat % 3 == 0:
            arm_l.append((beat, 70, 's'))
            arm_r.append((beat, -20, 's'))
        elif beat % 3 == 1:
            arm_l.append((beat, -20, 's'))
            arm_r.append((beat, 70, 's'))
        else:
            arm_l.append((beat, 30, 's'))
            arm_r.append((beat, 30, 's'))
    curves.append(make_curve(ARM_L, 0, arm_l))
    curves.append(make_curve(ARM_R, 0, arm_r))

    curves.append(make_curve(HAND_L, 0, [(t, 60, 's') for t in range(0, dur, 2)]))
    curves.append(make_curve(HAND_R, 0, [(t + 1, 60, 's') for t in range(0, dur, 2)]))

    curves.append(make_curve(MOUTH, 0, [(t, 0, 's') for t in range(0, dur, 4)] +
                            [(t + 2, 50, 's') for t in range(0, dur, 4)]))

    eye = [(0, 100), (8, 0, 's'), (8.15, 100, 's'), (20, 100), (20.08, 0, 's'), (20.15, 100, 's'),
           (35, 100), (35.08, 0, 's'), (35.15, 100, 's'), (50, 100), (50.08, 0, 's'), (50.15, 100, 's')]
    curves.append(make_curve(EYE_L, 100, eye))
    curves.append(make_curve(EYE_R, 100, eye))

    return generate_motion("The Riddle", dur, curves)

# ============================================================
# 舞蹈 9: Vanitosa (性感妩媚)
# ============================================================
def gen_vanitosa():
    """性感妩媚，身体曲线，柔美"""
    dur = 60
    curves = []

    head_x = [(t, 10 * math.sin(t * 0.6)) for t in range(dur)]
    head_y = [(t, 5 * math.sin(t * 0.4)) for t in range(dur)]
    head_z = [(t, 8 * math.sin(t * 0.5 + 0.5)) for t in range(dur)]
    curves.append(make_curve(ANGLE_X, 0, head_x))
    curves.append(make_curve(ANGLE_Y, 0, head_y))
    curves.append(make_curve(ANGLE_Z, 0, head_z))

    # 身体：S 曲线
    body_x = [(t, 12 * math.sin(t * 0.5)) for t in range(dur)]
    body_y = [(t, 6 * math.sin(t * 0.35)) for t in range(dur)]
    body_z = [(t, 8 * math.sin(t * 0.4 + 1)) for t in range(dur)]
    curves.append(make_curve(BODY_X, 0, body_x))
    curves.append(make_curve(BODY_Y, 0, body_y))
    curves.append(make_curve(BODY_Z, 0, body_z))

    # 手臂：柔美
    arm_l = [(t, 35 + 25 * math.sin(t * 0.5)) for t in range(dur)]
    arm_r = [(t, 35 + 25 * math.cos(t * 0.5)) for t in range(dur)]
    curves.append(make_curve(ARM_L, 0, arm_l))
    curves.append(make_curve(ARM_R, 0, arm_r))

    hand_l = [(t, 40 + 30 * math.sin(t * 0.7)) for t in range(dur)]
    hand_r = [(t, 40 + 30 * math.cos(t * 0.7)) for t in range(dur)]
    curves.append(make_curve(HAND_L, 0, hand_l))
    curves.append(make_curve(HAND_R, 0, hand_r))

    curves.append(make_curve(MOUTH, 0, [(t, 10 + 15 * math.sin(t * 0.4)) for t in range(dur)]))

    eye = [(0, 100), (10, 0, 's'), (10.1, 100, 's'), (25, 100), (27, 0, 's'), (27.1, 100, 's'),
           (42, 100), (44, 0, 's'), (44.1, 100, 's'), (55, 100), (57, 0, 's'), (57.1, 100, 's')]
    curves.append(make_curve(EYE_L, 100, eye))
    curves.append(make_curve(EYE_R, 100, eye))

    return generate_motion("Vanitosa", dur, curves)

# ============================================================
# 舞蹈 10: Roly Poly (经典复古)
# ============================================================
def gen_roly_poly():
    """经典复古，可爱手势，重复性强"""
    dur = 60
    curves = []

    # 头部：可爱的左右摆
    head_x = []
    head_y = []
    head_z = []
    for beat in range(0, dur, 1):
        head_x.append((beat, 15 * math.sin(beat * 2.0)))
        head_y.append((beat, 8 * math.sin(beat * 3.0)))
        head_z.append((beat, 8 * math.sin(beat * 1.5 + 0.5)))
    curves.append(make_curve(ANGLE_X, 0, head_x))
    curves.append(make_curve(ANGLE_Y, 0, head_y))
    curves.append(make_curve(ANGLE_Z, 0, head_z))

    # 身体：跟着节拍
    body_x = [(t, 10 * math.sin(t * 1.5)) for t in range(dur)]
    body_y = [(t, 5 * math.sin(t * 1.0)) for t in range(dur)]
    body_z = [(t, 6 * math.cos(t * 1.2)) for t in range(dur)]
    curves.append(make_curve(BODY_X, 0, body_x))
    curves.append(make_curve(BODY_Y, 0, body_y))
    curves.append(make_curve(BODY_Z, 0, body_z))

    # 手臂：可爱挥手
    arm_l = []
    arm_r = []
    for beat in range(0, dur, 1):
        if beat % 4 < 2:
            arm_l.append((beat, 50))
            arm_r.append((beat, 10))
        else:
            arm_l.append((beat, 10))
            arm_r.append((beat, 50))
    curves.append(make_curve(ARM_L, 0, arm_l))
    curves.append(make_curve(ARM_R, 0, arm_r))

    hand_l = [(t, 50 + 30 * math.sin(t * 2.5)) for t in range(dur)]
    hand_r = [(t, 50 + 30 * math.cos(t * 2.5)) for t in range(dur)]
    curves.append(make_curve(HAND_L, 0, hand_l))
    curves.append(make_curve(HAND_R, 0, hand_r))

    # 嘴巴
    mouth = []
    for beat in range(0, dur, 4):
        mouth.append((beat, 40))
        mouth.append((beat + 1, 60))
        mouth.append((beat + 2, 30))
        mouth.append((beat + 3, 0))
    curves.append(make_curve(MOUTH, 0, mouth))

    eye = [(0, 100), (3, 0, 's'), (3.1, 100, 's'), (10, 100), (12, 0, 's'), (12.1, 100, 's'),
           (22, 100), (24, 0, 's'), (24.1, 100, 's'), (35, 100), (37, 0, 's'), (37.1, 100, 's'),
           (48, 100), (50, 0, 's'), (50.1, 100, 's')]
    curves.append(make_curve(EYE_L, 100, eye))
    curves.append(make_curve(EYE_R, 100, eye))

    return generate_motion("Roly Poly", dur, curves)


# ============================================================
# 主程序
# ============================================================
if __name__ == "__main__":
    print("🎵 开始生成 10 个舞蹈动作文件...\n")

    generators = [
        ("bboomboom.motion3.json", gen_bboomboom),
        ("superstar.motion3.json", gen_superstar),
        ("time.motion3.json", gen_time),
        ("toca_toca.motion3.json", gen_toca_toca),
        ("dura.motion3.json", gen_dura),
        ("kiat_jud_dai.motion3.json", gen_kiat_jud_dai),
        ("mi_gente.motion3.json", gen_mi_gente),
        ("the_riddle.motion3.json", gen_the_riddle),
        ("vanitosa.motion3.json", gen_vanitosa),
        ("roly_poly.motion3.json", gen_roly_poly),
    ]

    for filename, gen_func in generators:
        motion = gen_func()
        save_motion(motion, filename)

    print(f"\n✅ 全部完成！文件保存在: {OUTPUT_DIR}")
    print(f"📁 共生成 {len(generators)} 个动作文件")

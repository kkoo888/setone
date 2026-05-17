/** 预设动画配置 */
export const ANIMATION_PRESETS = {
  idle: { group: 'Idle', index: 0, priority: 1 },
  tapBody: { group: 'TapBody', index: 0, priority: 3 },
  tapHead: { group: 'TapHead', index: 0, priority: 3 },
  happy: { group: 'Happy', index: 0, priority: 2 },
  angry: { group: 'Angry', index: 0, priority: 2 },
  sad: { group: 'Sad', index: 0, priority: 2 },
  surprised: { group: 'Surprised', index: 0, priority: 2 },
} as const

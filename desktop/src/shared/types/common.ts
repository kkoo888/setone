/** 通用工具类型 */

/** 将对象所有属性变为可选（深度递归） */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

/** 将指定属性变为可选 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/** 展平交叉类型为可读形式 */
export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

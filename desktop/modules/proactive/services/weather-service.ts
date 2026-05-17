import type { Logger } from '../../../src/main/types/logger'
import type { WeatherInfo, WeatherForecast } from '../types'

/** 缓存条目 */
interface CacheEntry<T> {
  data: T
  timestamp: number
}

/** 缓存有效期：30 分钟 */
const CACHE_TTL_MS = 30 * 60 * 1000

/**
 * 天气服务 — 基于 wttr.in 免费 API
 * 提供当前天气查询、天气预报和缓存机制
 */
export class WeatherService {
  private logger: Logger
  /** 天气缓存：key = `${city}:${type}` */
  private cache = new Map<string, CacheEntry<unknown>>()

  constructor(logger: Logger) {
    this.logger = logger
  }

  /**
   * 获取当前天气
   * @param city 城市名（中文或英文均可）
   * @returns 当前天气信息
   */
  async getWeather(city: string): Promise<WeatherInfo> {
    const cacheKey = `${city}:current`
    const cached = this.getFromCache<WeatherInfo>(cacheKey)
    if (cached) return cached

    const forecast = await this.fetchWeatherData(city)
    this.setCache(cacheKey, forecast.current)
    return forecast.current
  }

  /**
   * 获取天气预报
   * @param city 城市名
   * @param days 预报天数（1-3，wttr.in 最多返回 3 天）
   * @returns 天气预报数据
   */
  async getForecast(city: string, days?: number): Promise<WeatherForecast> {
    const cacheKey = `${city}:forecast`
    const cached = this.getFromCache<WeatherForecast>(cacheKey)
    if (cached) {
      if (days && cached.daily.length > days) {
        return { ...cached, daily: cached.daily.slice(0, days) }
      }
      return cached
    }

    const forecast = await this.fetchWeatherData(city)
    this.setCache(cacheKey, forecast)
    if (days && forecast.daily.length > days) {
      return { ...forecast, daily: forecast.daily.slice(0, days) }
    }
    return forecast
  }

  /**
   * 从 wttr.in 获取天气数据
   * @param city 城市名
   * @returns 完整天气预报
   */
  private async fetchWeatherData(city: string): Promise<WeatherForecast> {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`
    this.logger.info(`请求天气数据: ${city}`)

    const response = await fetch(url, {
      headers: { 'Accept-Language': 'zh-CN' },
    })

    if (!response.ok) {
      throw new Error(`天气 API 请求失败: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as WttrResponse
    return this.parseWttrData(city, data)
  }

  /**
   * 解析 wttr.in 返回的 JSON 数据
   * @param city 城市名
   * @param data wttr.in 原始数据
   * @returns 格式化的天气预报
   */
  private parseWttrData(city: string, data: WttrResponse): WeatherForecast {
    const current = data.current_condition?.[0]
    if (!current) throw new Error('天气数据格式异常：缺少 current_condition')

    const weatherInfo: WeatherInfo = {
      city,
      temperature: Number(current.temp_C) || 0,
      description: current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || '未知',
      humidity: Number(current.humidity) || 0,
      windSpeed: Number(current.windspeedKmph) || 0,
    }

    const daily = (data.weather || []).map((day) => ({
      date: day.date,
      maxTemp: Number(day.maxtempC) || 0,
      minTemp: Number(day.mintempC) || 0,
      description: day.hourly?.[4]?.lang_zh?.[0]?.value || day.hourly?.[4]?.weatherDesc?.[0]?.value || '未知',
      humidity: Number(day.hourly?.[4]?.humidity) || 0,
      windSpeed: Number(day.hourly?.[4]?.windspeedKmph) || 0,
    }))

    return { city, current: weatherInfo, daily }
  }

  /**
   * 从缓存获取数据（未过期时）
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key)
      return null
    }
    return entry.data as T
  }

  /**
   * 写入缓存
   */
  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() })
  }

  /**
   * 清除所有缓存
   */
  clearCache(): void {
    this.cache.clear()
  }
}

/** wttr.in JSON 响应结构（简化） */
interface WttrResponse {
  current_condition?: Array<{
    temp_C: string
    humidity: string
    windspeedKmph: string
    weatherDesc?: Array<{ value: string }>
    lang_zh?: Array<{ value: string }>
  }>
  weather?: Array<{
    date: string
    maxtempC: string
    mintempC: string
    hourly?: Array<{
      humidity: string
      windspeedKmph: string
      weatherDesc?: Array<{ value: string }>
      lang_zh?: Array<{ value: string }>
    }>
  }>
}

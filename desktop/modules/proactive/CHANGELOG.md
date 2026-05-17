# proactive 模块更新日志

## 2026-05-18

### 新增
- **WeatherService** (`services/weather-service.ts`)：接入 wttr.in 免费天气 API
  - `getWeather(city)` — 获取当前天气信息
  - `getForecast(city, days?)` — 获取未来几天天气预报
  - 缓存机制：同一城市 30 分钟内不重复请求
- **weather_forecast 工具** — 获取未来几天天气预报
- **weather_alert 工具** — 设置天气提醒（支持雨雪/高温/低温等条件，每 30 分钟自动检查）
- **WeatherForecast / WeatherAlert 类型**（types.ts）

### 修改
- **weather_check 工具** — 从返回固定值改为调用真实 WeatherService
- **types.ts** — 新增 `WeatherForecast` 和 `WeatherAlert` 接口

export type WeatherSeason = '春秋' | '夏' | '冬'

export const WEATHER_SEASONS: WeatherSeason[] = ['春秋', '夏', '冬']

export interface WeatherSeedRecord {
  season: WeatherSeason
  date: string
  humidity: number
  temperature: number
  weather: string
  precipitation: number
  sunrise: string
  sunset: string
  sunlightMax: string
}

export const WEATHER_SEED_RECORDS: WeatherSeedRecord[] = [
  {
    season: '春秋',
    date: '2026-04-01',
    humidity: 45.5,
    temperature: 14.4,
    weather: '晴天',
    precipitation: 0,
    sunrise: '06:00',
    sunset: '20:00',
    sunlightMax: '12:30'
  },
  {
    season: '春秋',
    date: '2026-04-02',
    humidity: 46.6,
    temperature: 15.6,
    weather: '晴天',
    precipitation: 0,
    sunrise: '06:02',
    sunset: '20:02',
    sunlightMax: '12:32'
  },
  {
    season: '春秋',
    date: '2026-04-03',
    humidity: 78.7,
    temperature: 16.7,
    weather: '雨天',
    precipitation: 0,
    sunrise: '06:04',
    sunset: '20:04',
    sunlightMax: '12:34'
  },
  {
    season: '春秋',
    date: '2026-04-04',
    humidity: 76.5,
    temperature: 14.5,
    weather: '雨天',
    precipitation: 0,
    sunrise: '06:06',
    sunset: '20:06',
    sunlightMax: '12:36'
  },
  {
    season: '春秋',
    date: '2026-04-05',
    humidity: 60.6,
    temperature: 10.4,
    weather: '晴天',
    precipitation: 0,
    sunrise: '06:08',
    sunset: '20:08',
    sunlightMax: '12:38'
  },
  {
    season: '春秋',
    date: '2026-04-06',
    humidity: 88.4,
    temperature: 10.2,
    weather: '雨天',
    precipitation: 3.5,
    sunrise: '06:10',
    sunset: '20:10',
    sunlightMax: '12:40'
  },
  {
    season: '春秋',
    date: '2026-04-07',
    humidity: 98.8,
    temperature: 13.7,
    weather: '雨天',
    precipitation: 4.6,
    sunrise: '06:12',
    sunset: '20:12',
    sunlightMax: '12:42'
  },
  {
    season: '春秋',
    date: '2026-04-08',
    humidity: 95.7,
    temperature: 12.9,
    weather: '强风',
    precipitation: 12,
    sunrise: '06:14',
    sunset: '20:14',
    sunlightMax: '12:44'
  },
  {
    season: '春秋',
    date: '2026-04-09',
    humidity: 85.9,
    temperature: 13.1,
    weather: '强风',
    precipitation: 13.4,
    sunrise: '06:16',
    sunset: '20:16',
    sunlightMax: '12:46'
  },
  {
    season: '春秋',
    date: '2026-04-10',
    humidity: 89.5,
    temperature: 14.6,
    weather: '晴天',
    precipitation: 0,
    sunrise: '06:18',
    sunset: '20:18',
    sunlightMax: '12:48'
  },
  {
    season: '夏',
    date: '2026-08-01',
    humidity: 89.4,
    temperature: 21.6,
    weather: '晴天',
    precipitation: 0,
    sunrise: '07:41',
    sunset: '19:58',
    sunlightMax: '13:00'
  },
  {
    season: '夏',
    date: '2026-08-02',
    humidity: 95.1,
    temperature: 20.8,
    weather: '晴天',
    precipitation: 0,
    sunrise: '07:42',
    sunset: '20:00',
    sunlightMax: '13:02'
  },
  {
    season: '夏',
    date: '2026-08-03',
    humidity: 95.5,
    temperature: 23.7,
    weather: '雨天',
    precipitation: 7.5,
    sunrise: '07:43',
    sunset: '20:02',
    sunlightMax: '13:04'
  },
  {
    season: '夏',
    date: '2026-08-04',
    humidity: 46.6,
    temperature: 26.1,
    weather: '晴天',
    precipitation: 0,
    sunrise: '07:44',
    sunset: '20:04',
    sunlightMax: '13:06'
  },
  {
    season: '夏',
    date: '2026-08-05',
    humidity: 45.7,
    temperature: 28.6,
    weather: '晴天',
    precipitation: 0,
    sunrise: '07:46',
    sunset: '20:06',
    sunlightMax: '13:08'
  },
  {
    season: '夏',
    date: '2026-08-06',
    humidity: 84.5,
    temperature: 27.1,
    weather: '晴天',
    precipitation: 0,
    sunrise: '07:47',
    sunset: '20:08',
    sunlightMax: '13:10'
  },
  {
    season: '夏',
    date: '2026-08-07',
    humidity: 55.7,
    temperature: 21.2,
    weather: '晴天',
    precipitation: 0,
    sunrise: '07:48',
    sunset: '20:10',
    sunlightMax: '13:12'
  },
  {
    season: '夏',
    date: '2026-08-08',
    humidity: 46.5,
    temperature: 25.5,
    weather: '晴天',
    precipitation: 0,
    sunrise: '07:49',
    sunset: '20:12',
    sunlightMax: '13:14'
  },
  {
    season: '夏',
    date: '2026-08-09',
    humidity: 45.7,
    temperature: 24.5,
    weather: '雨天',
    precipitation: 7.5,
    sunrise: '07:50',
    sunset: '20:14',
    sunlightMax: '13:16'
  },
  {
    season: '夏',
    date: '2026-08-10',
    humidity: 48.3,
    temperature: 26.2,
    weather: '雨天',
    precipitation: 7.5,
    sunrise: '07:52',
    sunset: '20:16',
    sunlightMax: '13:18'
  },
  {
    season: '冬',
    date: '2026-01-01',
    humidity: 55.3,
    temperature: 4.6,
    weather: '晴天',
    precipitation: 0,
    sunrise: '07:49',
    sunset: '17:41',
    sunlightMax: '12:40'
  },
  {
    season: '冬',
    date: '2026-01-02',
    humidity: 75.4,
    temperature: 2.6,
    weather: '雨天',
    precipitation: 4.3,
    sunrise: '07:51',
    sunset: '17:43',
    sunlightMax: '12:42'
  },
  {
    season: '冬',
    date: '2026-01-03',
    humidity: 65.7,
    temperature: 1.5,
    weather: '强风',
    precipitation: 0,
    sunrise: '07:53',
    sunset: '17:45',
    sunlightMax: '12:44'
  },
  {
    season: '冬',
    date: '2026-01-04',
    humidity: 74.5,
    temperature: 2.4,
    weather: '雪',
    precipitation: 4.2,
    sunrise: '07:55',
    sunset: '17:47',
    sunlightMax: '12:46'
  },
  {
    season: '冬',
    date: '2026-01-05',
    humidity: 76.7,
    temperature: 0.9,
    weather: '雪',
    precipitation: 4.3,
    sunrise: '07:57',
    sunset: '17:49',
    sunlightMax: '12:48'
  },
  {
    season: '冬',
    date: '2026-01-06',
    humidity: 94.3,
    temperature: -5.4,
    weather: '暴雪',
    precipitation: 5.1,
    sunrise: '07:59',
    sunset: '17:51',
    sunlightMax: '12:50'
  },
  {
    season: '冬',
    date: '2026-01-07',
    humidity: 97.7,
    temperature: -3.7,
    weather: '暴雪',
    precipitation: 5.5,
    sunrise: '08:01',
    sunset: '17:53',
    sunlightMax: '12:52'
  },
  {
    season: '冬',
    date: '2026-01-08',
    humidity: 87.8,
    temperature: -5.8,
    weather: '暴雪',
    precipitation: 5.3,
    sunrise: '08:03',
    sunset: '17:55',
    sunlightMax: '12:54'
  },
  {
    season: '冬',
    date: '2026-01-09',
    humidity: 87.7,
    temperature: 1.6,
    weather: '雨天',
    precipitation: 14.5,
    sunrise: '08:05',
    sunset: '17:57',
    sunlightMax: '12:56'
  },
  {
    season: '冬',
    date: '2026-01-10',
    humidity: 89.4,
    temperature: -1,
    weather: '雨天',
    precipitation: 5.6,
    sunrise: '08:07',
    sunset: '17:59',
    sunlightMax: '12:58'
  },
  {
    season: '冬',
    date: '2026-01-11',
    humidity: 58.4,
    temperature: 3.2,
    weather: '晴天',
    precipitation: 0,
    sunrise: '08:09',
    sunset: '18:01',
    sunlightMax: '13:00'
  }
]

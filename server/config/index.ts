import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')

function env(key: string, fallback = ''): string {
  const v = process.env[key]
  return v === undefined || v === '' ? fallback : v
}

function envInt(key: string, fallback: number): number {
  const v = Number(process.env[key])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

export type DbType = 'sqlite' | 'mysql'

export const config = {
  projectRoot,
  port: envInt('PORT', 1100),
  corsOrigin: env('CORS_ORIGIN', '*'),
  jwtSecret: env('JWT_SECRET', 'oms-ops-dev-secret'),
  admin: {
    username: env('ADMIN_USERNAME', 'admin'),
    password: env('ADMIN_PASSWORD', 'admin123')
  },
  db: {
    type: (env('DB_TYPE', 'sqlite') as DbType),
    sqlite: {
      path: path.resolve(projectRoot, env('DB_SQLITE_PATH', './db/oms-ops.db'))
    },
    mysql: {
      host: env('DB_MYSQL_HOST', '127.0.0.1'),
      port: envInt('DB_MYSQL_PORT', 3306),
      user: env('DB_MYSQL_USER', 'root'),
      password: env('DB_MYSQL_PASSWORD', ''),
      database: env('DB_MYSQL_DATABASE', 'oms_ops'),
      connectionLimit: envInt('DB_MYSQL_CONNECTION_LIMIT', 10)
    }
  },
  update: {
    githubUrl: env('UPDATE_GITHUB_URL', ''),
    githubBranch: env('UPDATE_GITHUB_BRANCH', 'main'),
    githubToken: env('UPDATE_GITHUB_TOKEN', ''),
    pm2AppName: env('UPDATE_PM2_APP_NAME', 'oms-ops'),
    projectRoot: env('UPDATE_PROJECT_ROOT', '') || projectRoot,
    packageKeep: envInt('UPDATE_PACKAGE_KEEP', 3)
  }
} as const

export type AppConfig = typeof config

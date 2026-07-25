import type { AppType, AppRow, ProcessMode } from '../db/app.repository.js'

export interface CommandTemplate {
  installCmd: string
  buildCmd: string
  buildEnabled: boolean
  startFile: string
  interpreter: string
  processMode: ProcessMode
  startCmd: string
  stopCmd: string
  deployExcludes: string
  description: string
}

/** 各类型默认命令模板 */
export const COMMAND_TEMPLATES: Record<AppType, CommandTemplate> = {
  nodejs: {
    installCmd: 'npm install',
    buildCmd: 'npm run build',
    buildEnabled: true,
    startFile: '',
    interpreter: '',
    processMode: 'pm2',
    startCmd: '',
    stopCmd: '',
    deployExcludes: 'node_modules/**,\n.git/**,\ndist/**,\nlogs/**,\n.env',
    description: 'Node.js：npm 安装依赖 + 构建 + PM2 重启'
  },
  python: {
    installCmd: 'pip install -r requirements.txt',
    buildCmd: '',
    buildEnabled: false,
    startFile: 'app.py',
    interpreter: 'python',
    processMode: 'pm2',
    startCmd: '',
    stopCmd: '',
    deployExcludes: '__pycache__/**,\nvenv/**,\n.venv/**,\n.git/**,\nlogs/**,\n*.pyc',
    description: 'Python：pip 安装依赖 + PM2（--interpreter python）重启'
  },
  java: {
    installCmd: 'mvn clean install -DskipTests',
    buildCmd: 'mvn clean package -DskipTests',
    buildEnabled: true,
    startFile: '',
    interpreter: 'java',
    processMode: 'custom',
    startCmd: 'java -jar target/app.jar',
    stopCmd: '',
    deployExcludes: 'target/**,\n.git/**,\nlogs/**,\n*.class',
    description: 'Java：Maven 构建 + java -jar 启动（自定义进程管理）'
  }
}

/** 生成 PM2 启动/重启/停止命令 */
export function buildPm2Action(action: 'start' | 'restart' | 'stop', app: AppRow): string {
  if (action === 'stop') return `pm2 stop ${app.pm2_app_name}`
  if (action === 'start') return buildPm2Start(app)
  return `pm2 restart ${app.pm2_app_name} --update-env`
}

/** 首次启动 Python 应用：pm2 start app.py --name xxx --interpreter python */
export function buildPm2Start(app: AppRow): string {
  if (app.type === 'python') {
    const interpreter = app.interpreter || 'python'
    const startFile = app.start_file || 'app.py'
    return `pm2 start ${startFile} --name ${app.pm2_app_name} --interpreter ${interpreter}`
  }
  return `pm2 restart ${app.pm2_app_name} --update-env`
}

/** 解析部署排除规则（逗号或换行分隔） */
export function parseExcludes(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

import { Router } from 'express'
import { findAdminByName, updateAdminLogin, updateAdminPassword, findAdminById } from '../db/repositories.js'
import { verifyPassword, hashPassword } from '../utils/crypto.js'
import { signToken } from '../utils/token.js'
import { requireAuth } from '../middleware/auth.js'
import { ok, fail } from '../utils/response.js'
import { addOperationLog } from '../db/repositories.js'
import type { Request, Response } from 'express'

const router = Router()

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {}
  if (!username || !password) {
    return fail(res, '用户名和密码不能为空')
  }
  const admin = await findAdminByName(username)
  if (!admin) {
    return fail(res, '用户名或密码错误', 1, 401)
  }
  const valid = await verifyPassword(password, admin.password)
  if (!valid) {
    return fail(res, '用户名或密码错误', 1, 401)
  }
  if (!admin.enabled) {
    return fail(res, '账号已停用', 1, 403)
  }
  await updateAdminLogin(admin.id, Date.now())
  const token = signToken({ id: admin.id, username: admin.username, role: admin.role })
  await addOperationLog({ username, ip: req.ip || '', action: 'login', description: '管理员登录' })
  ok(res, {
    token,
    admin: { id: admin.id, username: admin.username, displayName: admin.display_name, role: admin.role }
  }, '登录成功')
})

router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  await addOperationLog({ username: req.admin!.username, ip: req.ip || '', action: 'logout', description: '退出登录' })
  ok(res, null, '已退出')
})

router.get('/profile', requireAuth, async (req: Request, res: Response) => {
  const admin = await findAdminById(req.admin!.id)
  if (!admin) return fail(res, '用户不存在', 1, 404)
  ok(res, {
    id: admin.id,
    username: admin.username,
    displayName: admin.display_name,
    role: admin.role,
    lastLoginAt: admin.last_login_at
  })
})

router.put('/password', requireAuth, async (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body ?? {}
  if (!oldPassword || !newPassword) return fail(res, '请填写原密码和新密码')
  if (newPassword.length < 6) return fail(res, '新密码至少 6 位')
  const admin = await findAdminById(req.admin!.id)
  if (!admin) return fail(res, '用户不存在', 1, 404)
  const valid = await verifyPassword(oldPassword, admin.password)
  if (!valid) return fail(res, '原密码错误')
  await updateAdminPassword(admin.id, await hashPassword(newPassword))
  await addOperationLog({ username: req.admin!.username, ip: req.ip || '', action: 'change_password', description: '修改密码' })
  ok(res, null, '密码修改成功')
})

export default router

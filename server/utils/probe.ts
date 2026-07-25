import net from 'node:net'

/** 探测指定端口是否有进程在监听（TCP connect 探测） */
export function probePort(port: number, host = '127.0.0.1', timeout = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new net.Socket()
    s.setTimeout(timeout)
    let done = false
    const finish = (v: boolean): void => {
      if (done) return
      done = true
      s.destroy()
      resolve(v)
    }
    s.once('connect', () => finish(true))
    s.once('error', () => finish(false))
    s.once('timeout', () => finish(false))
    s.connect(port, host)
  })
}

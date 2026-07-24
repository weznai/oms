// 轻量级 glob 匹配，用于部署排除规则（无需额外依赖）
// 支持: * ** ? 字符通配

function globToRegex(glob: string): RegExp {
  let re = ''
  let i = 0
  while (i < glob.length) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i += 2
        if (glob[i] === '/') i++
      } else {
        re += '[^/]*'
        i++
      }
    } else if (c === '?') {
      re += '[^/]'
      i++
    } else if ('.+^$(){}|[]\\'.includes(c)) {
      re += '\\' + c
      i++
    } else {
      re += c
      i++
    }
  }
  return new RegExp(`^${re}$`)
}

export function minimatch(target: string, pattern: string): boolean {
  return globToRegex(pattern).test(target)
}

export function matchAny(target: string, patterns: string[]): boolean {
  return patterns.some((p) => minimatch(target, p) || minimatch(target, `${p}/**`))
}

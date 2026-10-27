import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { validateConfig, validateConsistency } from './deployment-config.mjs'

const args = process.argv.slice(2)
const target = args[0] || 'all'
if (!['all', 'frontend', 'api', 'worker'].includes(target) || args.slice(1).some((arg) => arg !== '--env' && arg !== '--local')) {
  console.error('Usage: npm run check:deploy -- [all|frontend|api|worker] [--env] [--local]')
  process.exit(2)
}
if (args.includes('--env') && target === 'all') {
  console.error('Use a single target with --env, or provide the three deploy/*.env files.')
  process.exit(2)
}
const root = fileURLToPath(new URL('../', import.meta.url))
const configs = []
let failed = false
for (const role of target === 'all' ? ['frontend', 'api', 'worker'] : [target]) {
  let env
  if (args.includes('--env')) env = process.env
  else {
    try {
      const contents = await readFile(resolve(root, 'deploy', `${role}.env`), 'utf8')
      // Match the raw worker env_file used by Compose: no quoting or interpolation.
      env = role === 'worker' ? Object.fromEntries(contents.split(/\r?\n/).filter((line) => line.trim() && !line.trimStart().startsWith('#')).map((line) => {
        const i = line.indexOf('=')
        if (i < 1) throw new Error()
        return [line.slice(0, i).trim(), line.slice(i + 1)]
      })) : parseEnv(contents)
    } catch {
      console.error(`FAIL ${role}: create deploy/${role}.env from its .example template; use KEY=value lines`)
      failed = true
      continue
    }
  }
  configs.push({ target: role, env })
  const issues = validateConfig(env, role, { production: !args.includes('--local') })
  for (const issue of issues) console.error(`FAIL ${role}: ${issue}`)
  if (issues.length) failed = true
  else console.log(`PASS ${role}: required settings are present and structurally valid`)
}
for (const issue of validateConsistency(configs)) {
  console.error(`FAIL consistency: ${issue}`); failed = true
}
console.log('Offline check only: credentials, migrations, DNS, email delivery and worker availability are not verified.')
process.exitCode = failed ? 1 : 0

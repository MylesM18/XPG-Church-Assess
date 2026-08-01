import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'))

describe('vercel.json cron', () => {
  it('schedules the reminder route once daily', () => {
    expect(cfg.crons).toContainEqual({ path: '/api/cron/reminders', schedule: '0 14 * * *' })
  })
})

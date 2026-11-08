import { describe, expect, it } from 'vitest'
import { Linter } from 'eslint'
import noMultilineTernary from '../../.eslint/no-multiline-ternary.js'

const linter = new Linter()
const config = {
  plugins: { local: { rules: { 'no-multiline-ternary': noMultilineTernary } } },
  rules: { 'local/no-multiline-ternary': 'error' },
}

describe('no multiline ternary', () => {
  it('allows short ternaries and if/else', () => {
    expect(linter.verify('const value = ready ? 1 : 0', config)).toEqual([])
    expect(linter.verify('if (ready) {\n run()\n} else {\n stop()\n}', config)).toEqual([])
  })

  it('rejects ternaries spread across lines', () => {
    const messages = linter.verify('const value = ready\n ? 1\n : 0', config)
    expect(messages).toHaveLength(1)
    expect(messages[0].ruleId).toBe('local/no-multiline-ternary')
  })
})

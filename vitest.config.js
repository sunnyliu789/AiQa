const { defineConfig } = require('vitest/config');

// vitest 只负责单元测试与接口集成测试（*.test.js）；
// *.e2e.spec.js 由 Playwright 运行，不能被 vitest 拾取，
// 否则 @playwright/test 的 test.describe() 会在非 Playwright 上下文报错。
module.exports = defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    // 串行运行测试文件，避免 Windows 下多 worker 并行时出现
    // STATUS_STACK_BUFFER_OVERRUN (exit code 3221226505) 崩溃。
    fileParallelism: false
  }
});

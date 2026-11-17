'use strict';

const { test, expect } = require('@playwright/test');

test.describe('AI 答疑助手 · 提问端到端流程', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#question')).toBeVisible();
    await expect(page.locator('#askBtn')).toBeVisible();
  });

  test('完整提问流程：提交 → 回答 → 历史记录 → 刷新后保留', async ({ page }) => {
    // 用带唯一后缀的问题，避免多次跑测试时历史记录重复匹配
    const QUESTION = `什么是 Spec 驱动开发？（e2e-${Date.now()}）`;

    // 1. 在输入框写问题
    await page.locator('#question').fill(QUESTION);
    await expect(page.locator('#question')).toHaveValue(QUESTION);

    // 2. 点击提交按钮（demo 模式响应通常在 100ms 内完成，
    //    disabled 状态可能一闪而过，这里只提交后立即等待回答面板）
    await page.locator('#askBtn').click();

    // 3. 等待回答面板出现并拿到非空文本
    await expect(page.locator('#result')).toBeVisible({ timeout: 20_000 });
    const answerText = page.locator('#answer');
    await expect(answerText).toBeVisible();
    const text = (await answerText.textContent() || '').trim();
    expect(text.length).toBeGreaterThan(0);

    // 4. 历史列表中新增了这一条记录（唯一问题，count 必须为 1）
    const historyItem = page
      .locator('#history li')
      .filter({ has: page.locator('.history-q', { hasText: QUESTION }) });
    await expect(historyItem).toHaveCount(1, { timeout: 5_000 });

    // 5. 刷新页面后这条记录仍然存在（后端落盘验证）
    await page.reload();
    await expect(page.locator('#question')).toBeVisible();
    const historyItemAfterReload = page
      .locator('#history li')
      .filter({ has: page.locator('.history-q', { hasText: QUESTION }) });
    await expect(historyItemAfterReload).toHaveCount(1, { timeout: 10_000 });
  });

  test('空问题提交时不应发起请求', async ({ page }) => {
    // 输入框清空，直接提交
    await page.locator('#question').fill('   ');
    await page.locator('#askBtn').click();

    // 回答面板不应出现
    await expect(page.locator('#result')).not.toBeVisible();
    // 按钮不应被禁用（没有发起请求）
    await expect(page.locator('#askBtn')).not.toBeDisabled();
    // 错误提示出现
    await expect(page.locator('#error')).toBeVisible();
  });
});

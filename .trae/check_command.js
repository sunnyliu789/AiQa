#!/usr/bin/env node
'use strict';

/**
 * PreToolUse Hook 脚本：终端命令风险检查
 *
 * 作用：在 RunCommand 执行前检查命令内容，命中「删除文件（rm）」或
 * 「DROP TABLE」这类高风险操作时，返回 ask 决策，交由用户人工授权后
 * 才允许执行；其他命令正常放行。
 *
 * 输入：TraeCode 通过 stdin 传入 Hook 事件 JSON（显式按 UTF-8 解码）。
 * 输出：命中风险时向 stdout 输出 decision JSON（显式按 UTF-8 编码）；
 *       未命中时不输出任何内容。
 *
 * 注意：本脚本任何情况下都不得以退出码 2 结束——在 PreToolUse 中退出码 2
 * 等价于 deny，会直接拒绝工具调用。
 */

const fs = require('fs');

// 需要人工授权的危险规则：正则中的 \b 为单词边界，避免误伤 format、perform 等含 rm 的单词
const DANGEROUS_RULES = [
  { name: '删除文件（rm）', pattern: /\brm\b/i },
  { name: '删除数据表（DROP TABLE）', pattern: /\bdrop\s+table\b/i }
];

/**
 * 从 stdin 读取 Hook 事件 JSON
 * @returns {object} 事件对象，读取或解析失败时返回空对象
 */
function readEvent() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (err) {
    raw = '';
  }

  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

/**
 * 从事件中取出待执行的终端命令
 * @param {object} event Hook 事件对象
 * @returns {string} 命令文本，取不到时返回空字符串
 */
function extractCommand(event) {
  const input = event && event.tool_input;
  if (input && typeof input.command === 'string') return input.command;
  // 兼容命令直接挂在事件顶层的情况
  if (event && typeof event.command === 'string') return event.command;
  return '';
}

function main() {
  const command = extractCommand(readEvent()).trim();

  // 没有可检查的命令，直接放行
  if (!command) return;

  // 命中任意危险规则即需要授权
  const hits = DANGEROUS_RULES.filter((rule) => rule.pattern.test(command)).map((rule) => rule.name);
  if (!hits.length) return;

  const decision = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `检测到高风险操作：${hits.join('、')}，需人工授权后才能执行。命令：${command}`
    }
  };

  // 显式按 UTF-8 写出，避免 Windows 控制台默认编码（GBK）导致中文乱码
  process.stdout.write(Buffer.from(JSON.stringify(decision), 'utf8'));
  process.stdout.write('\n');
}

main();

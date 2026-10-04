'use strict';

/**
 * .env 文件加载工具（原生实现，零第三方依赖）
 * 在服务启动时读取项目根目录的 .env 文件并写入 process.env。
 * 规则：
 * 1. 已存在的环境变量优先，不被 .env 覆盖（方便命令行临时覆盖配置）；
 * 2. 支持 KEY=VALUE、# 注释、空行、值两侧的单/双引号；
 * 3. 为保持实现简单，不支持多行值与变量插值。
 */

const fs = require('fs');
const path = require('path');

// .env 文件路径（相对于项目根目录）
const ENV_PATH = path.join(__dirname, '..', '..', '.env');

/**
 * 解析 .env 文本内容
 * @param {string} content .env 文件内容
 * @returns {Record<string, string>} 键值对
 */
function parse(content) {
  const result = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    // 跳过空行与注释行
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    if (!key) continue;

    let value = trimmed.slice(index + 1).trim();
    // 去掉值两侧成对的引号
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);

    result[key] = value;
  }

  return result;
}

/**
 * 读取 .env 文件并写入 process.env
 * @returns {Record<string, string>} 从 .env 解析出的键值对（不含已存在的环境变量）
 */
function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};

  let content;
  try {
    content = fs.readFileSync(ENV_PATH, 'utf8');
  } catch (err) {
    console.warn('[env] 读取 .env 文件失败：', err.message);
    return {};
  }

  const parsed = parse(content);
  let count = 0;
  for (const [key, value] of Object.entries(parsed)) {
    // 已存在的环境变量优先，不被文件覆盖
    if (process.env[key] === undefined) {
      process.env[key] = value;
      count += 1;
    }
  }

  console.log(`[env] 已加载 .env，共生效 ${count} 项配置`);
  return parsed;
}

module.exports = { loadEnv, parse, ENV_PATH };

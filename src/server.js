'use strict';

/**
 * 服务启动入口
 * 职责：
 * 1. 创建原生 HTTP 服务（不依赖任何第三方框架）；
 * 2. 先将请求交给接口路由处理；
 * 3. 其余请求作为静态资源从 public/ 目录返回。
 *
 * 设计说明：
 * - createServer() 单独导出，测试可直接拿到服务实例并按需监听随机端口；
 * - 仅在 `node src/server.js` 直接运行时才加载 .env 并监听端口，
 *   被 require 时不会占用端口、也不会读取 .env。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const askRouter = require('./routes/ask');

// 静态资源目录
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// 常见静态资源类型映射
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/**
 * 返回静态文件
 * @param {import('http').IncomingMessage} req 请求对象
 * @param {import('http').ServerResponse} res 响应对象
 * @param {string} pathname 请求路径
 */
function serveStatic(req, res, pathname) {
  // 默认访问 index.html
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  // 归一化并校验，防止路径穿越
  const filePath = path.join(PUBLIC_DIR, path.normalize(relative));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('禁止访问');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 页面不存在');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/**
 * 创建 HTTP 服务实例（不监听端口，便于测试复用）
 * @returns {import('http').Server} HTTP 服务实例
 */
function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // 优先交给接口路由处理
    if (askRouter.handle(req, res, url)) return;

    // 未匹配接口的请求按静态资源处理
    serveStatic(req, res, url.pathname);
  });
}

// 仅在直接运行本文件时才启动服务
if (require.main === module) {
  // 启动前加载 .env 配置（已存在的环境变量优先，不被文件覆盖）
  require('./utils/env').loadEnv();

  const llm = require('./services/llm');
  // 监听端口，可通过 PORT 环境变量覆盖（需在 loadEnv 之后读取才能读到 .env 中的配置）
  const PORT = Number(process.env.PORT) || 3000;

  createServer().listen(PORT, () => {
    const mode = llm.isDemoMode() ? '演示模式（未配置 LLM_API_KEY）' : `大模型模式（${llm.getConfig().model}）`;
    console.log('AI 答疑助手已启动');
    console.log(`访问地址：http://localhost:${PORT}`);
    console.log(`运行模式：${mode}`);
  });
}

module.exports = { createServer };

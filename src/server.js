'use strict';

/**
 * 服务启动入口
 * 职责：
 * 1. 创建原生 HTTP 服务（不依赖任何第三方框架）；
 * 2. 先将请求交给接口路由处理；
 * 3. 其余请求作为静态资源从 public/ 目录返回。
 */

const { loadEnv } = require('./utils/env');

// 最先加载 .env 配置（已存在的环境变量优先，不被文件覆盖）
loadEnv();

const http = require('http');
const fs = require('fs');
const path = require('path');
const askRouter = require('./routes/ask');
const llm = require('./services/llm');

// 监听端口，可通过 PORT 环境变量覆盖
const PORT = Number(process.env.PORT) || 3000;
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // 优先交给接口路由处理
  if (askRouter.handle(req, res, url)) return;

  // 未匹配接口的请求按静态资源处理
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  const mode = llm.isDemoMode() ? '演示模式（未配置 LLM_API_KEY）' : `大模型模式（${llm.getConfig().model}）`;
  console.log('AI 答疑助手已启动');
  console.log(`访问地址：http://localhost:${PORT}`);
  console.log(`运行模式：${mode}`);
});

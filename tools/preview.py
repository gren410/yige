#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一格 · 本地预览服务器（单元1）
纯 Python 标准库，不需要安装任何东西。

用法：
    python tools/preview.py                          # 默认 http://127.0.0.1:8000
    python tools/preview.py --port 9000

    # 手机连同一个 Wi-Fi，用电脑的局域网地址打开（真机验收用）
    python tools/preview.py --host 0.0.0.0 --port 8080

说明：
- ES Module 必须走 HTTP，不能双击 HTML 文件打开（file:// 会被浏览器拦）。
- 开发期不让浏览器自作主张缓存：每次都必须回服务器问一句，
  改完代码刷新即生效，不用清缓存。
  为什么是 no-cache 而不是 no-store（单元10 改的）：Service Worker 的
  Cache API **拒收**带 no-store 的响应，用 no-store 就没法在本地测离线缓存了。
  no-cache 同样是「每次都要问服务器」，本地不会吃到旧代码。
- 首次用 --host 0.0.0.0 时，Windows 防火墙会弹窗问是否允许，点「允许访问」
  手机才连得上（只在专用/家庭网络放行即可，不必勾公用网络）。
- 手机上用局域网 http 打开时，浏览器**不允许**注册 Service Worker
  （只有 https 和 localhost 算安全来源），这是正常的，页面照样能用。
"""

import argparse
import os
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# 服务根目录 = 本脚本所在目录的上一级（即 app/ 仓库根）
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(SimpleHTTPRequestHandler):
    # 补充/修正 MIME：.webmanifest 和 .js 必须类型正确，模块脚本才能加载
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".webmanifest": "application/manifest+json; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".png": "image/png",
    }

    def end_headers(self):
        # 开发期禁缓存：每次都要回服务器问一句，刷新永远是最新代码。
        # 用 no-cache 不用 no-store —— Cache API 拒收 no-store，那样子就测不了离线缓存。
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 安静模式：不刷屏
        pass


def lan_ip():
    """猜本机在局域网里的地址（不会真的发数据包，只是问一下路由出口）"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    parser = argparse.ArgumentParser(description="一格本地预览")
    parser.add_argument("--port", type=int, default=8000, help="端口，默认 8000")
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="监听地址，默认 127.0.0.1（只有本机能访问）；想让手机连就填 0.0.0.0",
    )
    args = parser.parse_args()

    os.chdir(ROOT)
    server = ThreadingHTTPServer((args.host, args.port), Handler)

    print("一格 · 本地预览已启动")
    if args.host in ("0.0.0.0", "::"):
        print(f"电脑上打开:  http://127.0.0.1:{args.port}")
        print(f"手机上打开:  http://{lan_ip()}:{args.port}   （手机连同一个 Wi-Fi）")
    else:
        print(f"请在浏览器打开:  http://{args.host}:{args.port}")
    print("停止: 按 Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一格 · 应用图标生成（单元10）
纯 Python 标准库，不需要 pip 装任何东西（任务书 §4.3 / §16 的硬要求）。

生成三个文件到 icons/：
    apple-touch-icon.png   180×180   iOS 加到主屏用的（§10 明确要求 180）
    icon-192.png           192×192   manifest
    icon-512.png           512×512   manifest

画的是什么：任务书 §9.3 那个盒子 —— 盒身 + 后沿内腔 + 插在里面的卡片 + 前沿面板，
下面带一层落影。用的是色板第一色「天蓝」#4DA3FF，底色是浅色主题的页面底色，
所以主屏上看到的图标和 App 打开后的第一屏是同一套配色。

为什么自己写而不装 Pillow：任务书要求 tools/ 下只用标准库（§16）。
图片格式是 PNG 的最简形式：8 位真彩、无隔行、每行一个 filter 字节 0，
膨胀数据交给 zlib（标准库自带）。

几何：和 SVG 图标共用同一套「作品坐标」——就是 §9.3 的 viewBox
（-10 -18 140 138）。先按这个坐标系摆好四层，再统一缩放到画布上。
圆角、位置、层次顺序都和 App 里的图标一致，不是另画一个。

抗锯齿：每个像素在纵向取 4 个子采样行，横向按「像素与形状的精确重叠长度」
算覆盖率，所以斜边和圆角是平滑的，不会一格一格的锯齿。

用法：
    python tools/gen_icons.py
"""

import math
import os
import struct
import zlib

# ---------- 配色（与 src/model/colors.js 的天蓝、styles.css 的浅色底一致） ----------

BASE = (0x4D, 0xA3, 0xFF)  # #4DA3FF 天蓝 = 盒身色（基础色本身，不提亮）
BG = (0xF2, 0xF2, 0xF7)    # #F2F2F7 浅色主题页面底色


def cavity_of(rgb, factor=0.84):
    """内腔影色 = 基础色 × 0.84（任务书 §9.2，与 util/color.js 同一公式）"""
    return tuple(max(0, min(255, round(c * factor))) for c in rgb)


def tint(rgb, ratio):
    """提亮：c' = c + (255 − c) × ratio（与 util/color.js 同一公式）"""
    return tuple(max(0, min(255, round(c + (255 - c) * ratio))) for c in rgb)


# ---------- 几何：一个四角圆角半径可分别设定的矩形 ----------


class RoundRect:
    """
    圆角矩形。半径按角给，因为盒子那四层正是靠「哪几个角是圆的」区分开的：
    后沿内腔只上两角圆、前沿面板只下两角圆、卡片只上两角圆。
    alpha < 1 时半透明叠加（落影就是这么一层层叠出来的）。
    """

    def __init__(self, x0, y0, x1, y1, rtl, rtr, rbr, rbl, rgb, alpha=1.0):
        self.x0, self.y0, self.x1, self.y1 = x0, y0, x1, y1
        self.rtl, self.rtr, self.rbr, self.rbl = rtl, rtr, rbr, rbl
        self.rgb = rgb
        self.alpha = alpha

    def span(self, y):
        """
        这一行（y 为浮点）被形状覆盖的横向区间 [左, 右]；完全在形状外返回 None。
        圆角处解圆心方程，所以边界是精确的圆弧，不是折线。
        """
        if y < self.y0 or y > self.y1:
            return None

        if self.rtl and y < self.y0 + self.rtl:
            d = self.y0 + self.rtl - y
            left = self.x0 + self.rtl - math.sqrt(max(0.0, self.rtl ** 2 - d * d))
        elif self.rbl and y > self.y1 - self.rbl:
            d = y - (self.y1 - self.rbl)
            left = self.x0 + self.rbl - math.sqrt(max(0.0, self.rbl ** 2 - d * d))
        else:
            left = self.x0

        if self.rtr and y < self.y0 + self.rtr:
            d = self.y0 + self.rtr - y
            right = self.x1 - self.rtr + math.sqrt(max(0.0, self.rtr ** 2 - d * d))
        elif self.rbr and y > self.y1 - self.rbr:
            d = y - (self.y1 - self.rbr)
            right = self.x1 - self.rbr + math.sqrt(max(0.0, self.rbr ** 2 - d * d))
        else:
            right = self.x1

        if left >= right:
            return None
        return (left, right)


def layers_for(size):
    """按从下到上的顺序返回这一尺寸下的所有图层（画布坐标）"""
    # 作品坐标 → 画布坐标。0.86 = 图形占画布的宽度比例，四周留白，
    # 免得图标内容贴到 iOS 自己那圈圆角上去。
    scale = size * 0.86 / 140.0

    def X(x):
        return size / 2.0 + (x - 60) * scale

    def Y(y):
        return size / 2.0 + (y - 51) * scale

    def R(v):
        return v * scale

    cavity = cavity_of(BASE)
    card = tint(BASE, 0.72)
    out = []

    # 落影（§9.3 的 feDropShadow dy 3 / stdDeviation 4 / opacity 0.32）：
    # 从外往里叠一圈圈向外扩张的圆角矩形，越往里叠得越多就越深，
    # 近似出一条高斯衰减的柔边。SVG 那边是 filter 一口气算的，这里没有 filter，
    # 就用这种笨办法等效出来。
    rings = 12
    step = R(10.0) / rings
    for i in range(rings, 0, -1):
        e = step * i
        out.append(
            RoundRect(
                X(0) - e, Y(0) + R(3) - e, X(120) + e, Y(108) + R(3) + e,
                R(10) + e, R(10) + e, R(10) + e, R(10) + e,
                cavity, 0.035,
            )
        )

    # 四层叠加，顺序不可换（§9.3）
    out.append(RoundRect(X(0), Y(0), X(120), Y(108),
                         R(10), R(10), R(10), R(10), BASE))            # 1 盒身
    out.append(RoundRect(X(0), Y(0), X(120), Y(20),
                         R(10), R(10), 0, 0, cavity))                  # 2 后沿内腔
    out.append(RoundRect(X(21), Y(-13), X(99), Y(30),
                         R(8), R(8), 0, 0, card))                      # 3 卡片
    out.append(RoundRect(X(0), Y(20), X(120), Y(108),
                         0, 0, R(10), R(10), BASE))                    # 4 前沿面板
    return out


# ---------- 光栅化 ----------

SUB = 4  # 纵向子采样数（横向是按精确重叠长度算的，不用采样）


def render(size):
    """画一张 size×size 的图，返回 RGB 字节缓冲（长度 size*size*3）"""
    stride = size * 3
    bg_row = bytes(BG) * size
    buf = bytearray(bg_row * size)

    for layer in layers_for(size):
        r, g, b = layer.rgb
        a = layer.alpha

        for y in range(size):
            spans = []
            for k in range(SUB):
                s = layer.span(y + (k + 0.5) / SUB)
                if s:
                    spans.append(s)
            if not spans:
                continue

            # 被所有子采样行完整盖住的那一段：覆盖率正好 1 → 直接刷成图层色
            inner_lo = max(math.ceil(s[0]) for s in spans)
            inner_hi = min(math.floor(s[1]) for s in spans)
            outer_lo = max(0, math.floor(min(s[0] for s in spans)))
            outer_hi = min(size, math.ceil(max(s[1] for s in spans)))
            if outer_hi <= outer_lo:
                continue

            row = y * stride
            if inner_lo < inner_hi:
                if a >= 1.0:
                    buf[row + inner_lo * 3:row + inner_hi * 3] = bytes(layer.rgb) * (inner_hi - inner_lo)
                else:
                    for x in range(inner_lo, inner_hi):
                        blend(buf, row, x, r, g, b, a)
                # 两端各一两个像素按覆盖率混
                edges = list(range(outer_lo, inner_lo)) + list(range(inner_hi, outer_hi))
            else:
                # 这一行太薄（圆角顶端的细牙），全部按覆盖率混
                edges = list(range(outer_lo, outer_hi))

            for x in edges:
                cov = sum(min(x + 1, s[1]) - max(x, s[0]) for s in spans) / SUB
                if cov > 0:
                    blend(buf, row, x, r, g, b, cov * a)

    return buf


def blend(buf, row, x, r, g, b, cov):
    """把 (r,g,b) 按覆盖率 cov 混到缓冲里的第 x 个像素上"""
    i = row + x * 3
    if cov >= 1.0:
        buf[i] = r
        buf[i + 1] = g
        buf[i + 2] = b
        return
    inv = 1.0 - cov
    buf[i] = round(buf[i] * inv + r * cov)
    buf[i + 1] = round(buf[i + 1] * inv + g * cov)
    buf[i + 2] = round(buf[i + 2] * inv + b * cov)


# ---------- 写 PNG（8 位真彩、无隔行，最简形式） ----------


def chunk(tag, data):
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path, size, buf):
    stride = size * 3
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # 每行的 filter 类型：0 = 不过滤
        raw += buf[y * stride:(y + 1) * stride]

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")

    with open(path, "wb") as f:
        f.write(png)
    return len(png)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(os.path.dirname(here), "icons")
    os.makedirs(out_dir, exist_ok=True)

    targets = [
        ("apple-touch-icon.png", 180),
        ("icon-192.png", 192),
        ("icon-512.png", 512),
    ]

    print("一格 · 生成主屏图标")
    for name, size in targets:
        path = os.path.join(out_dir, name)
        n = write_png(path, size, render(size))
        print(f"  {name:<22} {size}×{size}   {n:,} 字节")
    print(f"输出目录: {out_dir}")
    print("iOS 上换图标后要先把主屏上的「一格」删掉再加一次，新图标才会生效。")


if __name__ == "__main__":
    main()

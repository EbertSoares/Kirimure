#!/usr/bin/env python3
"""Assa o céu HDRI do Kirimurê a partir de um EXR equiretangular puro.

O arquivo de origem (Poly Haven / Kloofendal "puresky") tem 4096x2048, com o
horizonte exatamente na linha central. A metade inferior é um "ground bounce"
sintético (céu espelhado e desfocado), que não deve aparecer no diorama: o domo
só precisa da faixa acima do horizonte.

O recorte cobre 0..22,5° de elevação, que é mais do que qualquer perfil de câmera
enxerga (desktop ~16°, mobile ~19°), preservando a densidade nativa do EXR e
evitando o céu "esticado" que acontece quando se comprime o panorama inteiro na
faixa visível. A altura de 256 linhas é potência de 2, exigência prática do
loader HDR do Babylon.

Requisitos:
    python3 -m pip install opencv-python-headless numpy

Uso:
    python3 scripts/build-sky-panorama.py [origem.exr] [saida.hdr]

Saídas:
    public/textures/sky/kirimure-sky.hdr  (Radiance RGBE, 4096x341)
    public/textures/sky/kirimure-sky.jpg  (fallback sRGB, 2048x171)
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = Path('/Users/ebertsoares/Downloads/kloofendal_48d_partly_cloudy_puresky_4k.exr')
DEFAULT_HDR = ROOT / 'public/textures/sky/kirimure-sky.hdr'
DEFAULT_JPG = ROOT / 'public/textures/sky/kirimure-sky.jpg'

# Faixa vertical do céu acima do horizonte. 22,5° cobre todos os perfis de
# câmera (o topo da tela fica em ~16-19°) e gera uma altura potência de 2
# (256 linhas), que o loader HDR do Babylon carrega sem redimensionar.
SKY_TOP_DEGREES = 22.5
# Limite de radiance para o RGBE. O recorte tem máximo ~3.7; o teto evita que
# um pixel isolado do brilho solar estoure o bloom.
MAX_RADIANCE = 8.0
# Expoente do "knee" usado só no JPG de fallback (não altera o HDR).
LDR_KNEE = 0.3


def read_strip(source: Path) -> np.ndarray:
    """Lê o EXR e devolve a faixa acima do horizonte em RGB float32."""
    image = cv2.imread(str(source), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise SystemExit(f'Não consegui ler {source}')
    if image.ndim != 3 or image.shape[2] < 3:
        raise SystemExit(f'EXR inesperado: shape={image.shape}')

    height, width = image.shape[:2]
    # OpenCV entrega EXR em BGR(A); a cena espera RGB.
    rgb = image[:, :, 2::-1].astype(np.float32)

    horizon_row = height // 2
    top_row = int(round(horizon_row - (SKY_TOP_DEGREES / 180.0) * height))
    top_row = max(0, min(top_row, horizon_row - 1))
    strip = rgb[top_row:horizon_row]
    strip = np.maximum(strip, 0.0)

    if strip.max() > MAX_RADIANCE:
        strip = strip * (MAX_RADIANCE / float(strip.max()))

    print(
        f'EXR {width}x{height} -> faixa {strip.shape[1]}x{strip.shape[0]} '
        f'(linhas {top_row}..{horizon_row - 1}, 0..{SKY_TOP_DEGREES:.0f}°); '
        f'max {float(strip.max()):.2f}, p99.9 {float(np.percentile(strip.mean(axis=2), 99.9)):.2f}'
    )
    return strip


def to_rgbe(rgb: np.ndarray) -> np.ndarray:
    """Converte radiance linear para RGBE (mesma quantização do Radiance)."""
    height, width = rgb.shape[:2]
    rgbe = np.zeros((height, width, 4), dtype=np.uint8)
    maximum = rgb.max(axis=2)
    nonzero = maximum > 1e-32

    mantissa, exponent = np.frexp(maximum)
    scale = np.zeros_like(maximum)
    scale[nonzero] = (mantissa[nonzero] * 256.0) / maximum[nonzero]

    for channel in range(3):
        values = np.floor(rgb[:, :, channel] * scale)
        rgbe[:, :, channel] = np.clip(values, 0, 255).astype(np.uint8)

    rgbe[:, :, 3] = np.where(nonzero, exponent + 128, 0).astype(np.uint8)
    return rgbe


def encode_scanline(channel: np.ndarray, out: bytearray) -> None:
    """RLE de uma scanline de canal no formato Radiance new-style.

    O Radiance alterna runs (byte > 128) e literais (byte <= 128 seguido dos
    valores). Sem o prefixo de contagem dos literais o decoder lê o primeiro
    pixel como se fosse um run e a textura inteira quebra.
    """
    width = channel.shape[0]
    index = 0
    literal = bytearray()

    def flush_literal() -> None:
        while literal:
            chunk = literal[:128]
            out.append(len(chunk))
            out.extend(chunk)
            del literal[:128]

    while index < width:
        value = int(channel[index])
        run = 1
        while index + run < width and int(channel[index + run]) == value and run < 127:
            run += 1
        if run >= 4:
            flush_literal()
            out.append(128 + run)
            out.append(value)
        else:
            literal.extend(channel[index:index + run].tobytes())
            if len(literal) >= 128:
                flush_literal()
        index += run
    flush_literal()


def write_radiance(path: Path, rgbe: np.ndarray) -> None:
    height, width = rgbe.shape[:2]
    header = (
        '#?RADIANCE\n'
        '# Kirimure - ceu HDRI assado por scripts/build-sky-panorama.py\n'
        'FORMAT=32-bit_rle_rgbe\n'
        'EXPOSURE=1.0\n'
        '\n'
        f'-Y {height} +X {width}\n'
    ).encode('ascii')

    body = bytearray()
    for row in range(height):
        if width < 8 or width > 0x7FFF:
            body.extend(rgbe[row].reshape(-1).tobytes())
            continue
        body.extend((2, 2, (width >> 8) & 0xFF, width & 0xFF))
        for channel in range(4):
            encode_scanline(rgbe[row, :, channel], body)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + body)
    print(f'HDR  {path} ({path.stat().st_size / 1e6:.2f} MB)')


def write_fallback(path: Path, rgb: np.ndarray) -> None:
    """JPG sRGB aproximando o look do HDR depois do tone mapping."""
    height, width = rgb.shape[:2]
    target_width = min(2048, width)
    target_height = max(1, round(height * target_width / width))
    reduced = cv2.resize(rgb, (target_width, target_height), interpolation=cv2.INTER_AREA)
    mapped = reduced / (1.0 + reduced * LDR_KNEE)
    mapped = np.clip(mapped, 0.0, 1.0) ** (1.0 / 2.2)
    bgr = (mapped[:, :, ::-1] * 255.0).round().astype(np.uint8)
    path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), bgr, [cv2.IMWRITE_JPEG_QUALITY, 86])
    print(f'JPG  {path} ({path.stat().st_size / 1024:.0f} kB)')


def main() -> None:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    hdr_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_HDR
    jpg_path = DEFAULT_JPG

    strip = read_strip(source)
    write_radiance(hdr_path, to_rgbe(strip))
    write_fallback(jpg_path, strip)

    # Amostras para calibrar o nível emissivo no sky.ts.
    height, width = strip.shape[:2]
    for elevation in (1.0, 5.0, 10.0, 15.0, 20.0):
        row = int(round((1.0 - elevation / SKY_TOP_DEGREES) * (height - 1)))
        row = max(0, min(height - 1, row))
        samples = strip[row, [int(width * u) for u in (0.25, 0.5, 0.595, 0.75)]]
        formatted = ' '.join(
            f'[{r:.2f},{g:.2f},{b:.2f}]' for r, g, b in samples
        )
        print(f'elev {elevation:>4.0f}°: {formatted}')


if __name__ == '__main__':
    main()

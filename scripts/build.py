"""Reproducible static-site build for one checkout.

Usage: python3 scripts/build.py SOURCE_DIR OUTPUT_DIR
Dependencies: cairosvg, Pillow (see requirements-build.txt).
"""
import argparse
import io
import re
import shutil
import subprocess
from html.parser import HTMLParser
from pathlib import Path

import cairosvg
from PIL import Image

EXCLUDED_DIRS = {'.git', '.github', '__pycache__', 'node_modules', '.pytest_cache', 'tests', 'scripts'}
EXCLUDED_FILES = {'.DS_Store', 'requirements-build.txt', 'package.json', 'package-lock.json'}


class AssetReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag in {'script', 'link', 'img'}:
            value = attributes.get('src') or attributes.get('href')
            if value:
                self.references.append(value)


def build_version(source: Path) -> str:
    """Use the checked-out commit, independently for dev and production."""
    return subprocess.check_output(
        ['git', '-C', str(source), 'rev-parse', '--short=12', 'HEAD'],
        text=True,
    ).strip()


def version_assets(output: Path, version: str):
    """Version local JS/CSS references in the built files, never in source."""
    asset_ref = re.compile(r'((?:src|href)=[\\x22\\x27])([^\\x22\\x27]+\\.(?:js|css))(?:\\?[^\\x22\\x27]*)?([\\x22\\x27])')
    import_ref = re.compile(r'(\\bfrom\\s*[\\x22\\x27]|\\bimport\\s*\\(\\s*[\\x22\\x27]|\\bimport\\s*[\\x22\\x27])(\\.[^\\x22\\x27?#]+\\.js)(?:\\?[^\\x22\\x27]*)?')

    for html in output.rglob('*.html'):
        content = html.read_text(encoding='utf-8')
        content = asset_ref.sub(lambda match: match.group(1) + match.group(2) + '?v=' + version + match.group(3), content)
        html.write_text(content.replace('__BUILD_VERSION__', version), encoding='utf-8')

    for module in output.rglob('*.js'):
        content = module.read_text(encoding='utf-8')
        content = import_ref.sub(lambda match: match.group(1) + match.group(2) + '?v=' + version, content)
        module.write_text(content, encoding='utf-8')


def build(source: Path, output: Path):
    if not (source / 'index.html').is_file():
        raise ValueError(f'Missing index.html in {source}')
    if output == source or source in output.parents or output in source.parents:
        raise ValueError('Source and output must be independent directories')
    if output.exists():
        shutil.rmtree(output)
    shutil.copytree(
        source, output,
        ignore=lambda folder, names: [
            name for name in names
            if name in EXCLUDED_DIRS or name in EXCLUDED_FILES
        ],
    )

    svg = output / 'favicon.svg'
    if svg.exists():
        icon_bytes = svg.read_bytes()
        for name, size in [('favicon-32.png', 32), ('apple-touch-icon.png', 180)]:
            (output / name).write_bytes(
                cairosvg.svg2png(bytestring=icon_bytes, output_width=size, output_height=size)
            )
        image = Image.open(io.BytesIO(
            cairosvg.svg2png(bytestring=icon_bytes, output_width=64, output_height=64)
        )).convert('RGBA')
        image.save(output / 'favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    version = build_version(source)
    version_assets(output, version)

    html_files = list(output.rglob('*.html'))
    if not html_files:
        raise ValueError('No HTML files in build')
    for html in html_files:
        parser = AssetReferences()
        parser.feed(html.read_text(encoding='utf-8'))
        for reference in parser.references:
            if reference.startswith(('http:', 'https:', '//', 'data:', '#', 'mailto:')):
                continue
            relative = reference.split('?', 1)[0].split('#', 1)[0]
            if not relative:
                continue
            asset = (html.parent / relative).resolve()
            if not asset.is_relative_to(output.resolve()) or not asset.is_file():
                raise ValueError(f'{html.relative_to(output)} references missing asset: {reference}')
    for module in output.rglob('*.js'):
        content = module.read_text(encoding='utf-8')
        for reference in re.findall(r"""(?:from\s*|import\s*\()\s*['"]([.][^'"]+)['"]""", content):
            asset = (module.parent / reference.split('?', 1)[0].split('#', 1)[0]).resolve()
            if not asset.is_relative_to(output.resolve()) or not asset.is_file():
                raise ValueError(f'{module.relative_to(output)} imports missing module: {reference}')
    print(f'Built and validated {source} -> {output} ({len(html_files)} HTML pages)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    build(args.source.resolve(), args.output.resolve())

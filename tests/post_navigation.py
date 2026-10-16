"""Check chronological post navigation in a Hugo build (stdlib only).

Usage: python3 tests/post_navigation.py /path/to/hugo-output
"""
import re
import sys
from datetime import datetime
from html import unescape
from pathlib import Path
from urllib.parse import unquote, urlparse

root = Path(sys.argv[1]).resolve()
posts = {}
for path in root.rglob('index.html'):
    html = path.read_text()
    if not re.search(r'<article class=[\"\']?post-single[\"\']?>', html):
        continue
    meta = re.search(r'<div class=[\"\']?post-meta[\"\']?>(.*?)</div>', html, re.S)
    date = re.search(r'title=[\"\']([^\"\']+)', meta.group(1)) if meta else None
    if not date:
        raise AssertionError(f'Missing publication date: {path}')
    # Hugo formats .Date as "2026-10-08 09:00:00 +0900 KST".
    stamp = datetime.strptime(date.group(1)[:25], '%Y-%m-%d %H:%M:%S %z')
    key = '/' + path.parent.relative_to(root).as_posix() + '/'
    posts[key] = (stamp, html)

assert posts, 'No rendered posts found'
errors = []
links = 0
for key, (date, html) in posts.items():
    nav = re.search(r'<nav class=[\"\']?paginav[\"\']?>(.*?)</nav>', html, re.S)
    if not nav:
        continue
    for direction, href, body in re.findall(
        r'<a class=[\"\']?(prev|next)[\"\']? href=[\"\']?([^\s\"\'>]+)[\"\']?>(.*?)</a>', nav.group(1), re.S
    ):
        target = unquote(urlparse(unescape(href)).path)
        links += 1
        if target not in posts:
            errors.append(f'{key}: missing target {target}')
            continue
        target_date = posts[target][0]
        if direction == 'prev' and target_date > date:
            errors.append(f'{key}: previous points to newer post {target}')
        if direction == 'next' and target_date < date:
            errors.append(f'{key}: next points to older post {target}')
        expected = ('Previous post' if direction == 'prev' else 'Next post') if key.startswith('/en/') else ('이전 글' if direction == 'prev' else '다음 글')
        if expected not in unescape(body):
            errors.append(f'{key}: missing label {expected}')
        if target.startswith('/en/') != key.startswith('/en/'):
            errors.append(f'{key}: navigation crosses languages')
assert links, 'No navigation links found'
if errors:
    print('\n'.join(errors[:12]))
    raise AssertionError(f'{len(errors)} failures across {len(posts)} posts / {links} links')
print(f'PASS: {len(posts)} posts, {links} chronological links and localized labels')

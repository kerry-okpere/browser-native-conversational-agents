#!/usr/bin/env python3
"""Render a claat-format Markdown codelab to the same HTML shape `claat export` produces.

This is a fallback for previewing without the claat binary. The GitHub Actions
workflow in .github/workflows/codelab.yml runs the real claat; this script only
needs Python 3 and the `markdown` package (pip install markdown).

Usage: python3 render.py <codelab.md> <output dir>
"""
import html
import re
import shutil
import sys
from pathlib import Path

import markdown

TEMPLATE = """<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, minimum-scale=1.0, initial-scale=1.0, user-scalable=yes">
  <meta name="theme-color" content="#4F7DC9">
  <meta charset="UTF-8">
  <title>{title}</title>
  <meta name="description" content="{summary}">
  <link rel="stylesheet" href="//fonts.googleapis.com/css?family=Source+Code+Pro:400|Roboto:400,300,400italic,500,700|Roboto+Mono">
  <link rel="stylesheet" href="//fonts.googleapis.com/icon?family=Material+Icons">
  <link rel="stylesheet" href="https://storage.googleapis.com/claat-public/codelab-elements.css">
  <style>
    .success {{ color: #1e8e3e; }}
    .error {{ color: red; }}
  </style>
</head>
<body>
  <google-codelab-analytics gaid="UA-49880327-14" ga4id=""></google-codelab-analytics>
  <google-codelab codelab-gaid=""
                  codelab-ga4id=""
                  id="{id}"
                  title="{title}"
                  environment="web"
                  feedback-link="{feedback}">
{steps}
  </google-codelab>

  <script src="https://storage.googleapis.com/claat-public/native-shim.js"></script>
  <script src="https://storage.googleapis.com/claat-public/custom-elements.min.js"></script>
  <script src="https://storage.googleapis.com/claat-public/prettify.js"></script>
  <script src="https://storage.googleapis.com/claat-public/codelab-elements.js"></script>
  <script src="//support.google.com/inapp/api.js"></script>
</body>
</html>
"""

STEP = """      <google-codelab-step label="{label}" duration="{minutes}">
{body}
      </google-codelab-step>
"""


def parse(text: str):
    meta = {}
    lines = text.splitlines()
    i = 0
    while i < len(lines) and lines[i].strip() and ":" in lines[i] and not lines[i].startswith("#"):
        k, v = lines[i].split(":", 1)
        meta[k.strip().lower()] = v.strip()
        i += 1
    rest = "\n".join(lines[i:])
    m = re.search(r"^# (.+)$", rest, re.M)
    title = m.group(1).strip() if m else meta.get("id", "Codelab")
    body = rest[m.end():] if m else rest
    parts = re.split(r"^## (.+)$", body, flags=re.M)
    steps = []
    for j in range(1, len(parts), 2):
        label = parts[j].strip()
        content = parts[j + 1]
        minutes = 0
        dm = re.match(r"\s*Duration:\s*(\d+):(\d+)(?::(\d+))?", content)
        if dm:
            h, mi = int(dm.group(1)), int(dm.group(2))
            minutes = h * 60 + mi if dm.group(3) is not None else h  # H:MM:SS or MM:SS
            content = content[dm.end():]
        steps.append((label, minutes, content))
    return meta, title, steps


def render_step(content: str) -> str:
    # Demote headings so step headings become h2 as claat does.
    content = re.sub(r"^### ", "## ", content, flags=re.M)
    md = markdown.Markdown(extensions=["fenced_code", "tables", "md_in_html"])
    out = md.convert(content)
    # claat marks code blocks with a language attribute for prettify.
    out = re.sub(
        r'<pre><code class="language-(\w+)">',
        lambda m: f'<pre><code language="{m.group(1)}" class="{m.group(1)}">',
        out,
    )
    out = out.replace("<pre><code>", '<pre><code language="" class="">')
    out = out.replace("<h2>", '<h2 is-upgraded>')
    return out


def main(src: str, outdir: str):
    text = Path(src).read_text(encoding="utf-8")
    meta, title, steps = parse(text)
    cid = meta.get("id", Path(src).stem)
    target = Path(outdir) / cid
    target.mkdir(parents=True, exist_ok=True)
    img = Path(src).parent / "img"
    if img.is_dir():
        shutil.copytree(img, target / "img", dirs_exist_ok=True)
    rendered = "".join(
        STEP.format(label=html.escape(label), minutes=minutes, body=render_step(body))
        for label, minutes, body in steps
    )
    page = TEMPLATE.format(
        title=html.escape(title),
        summary=html.escape(meta.get("summary", "")),
        id=html.escape(cid),
        feedback=html.escape(meta.get("feedback link", "")),
        steps=rendered,
    )
    (target / "index.html").write_text(page, encoding="utf-8")
    print(f"wrote {target / 'index.html'} ({len(steps)} steps)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

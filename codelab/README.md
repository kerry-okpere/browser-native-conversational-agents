# Codelab: Build a Voice AI Agent in the Browser

A Google-style codelab for this repo, built with [claat](https://github.com/googlecodelabs/tools/tree/main/claat), the same tool behind codelabs.developers.google.com.

Live: https://kerry-okpere.github.io/browser-native-conversational-agents/

## Layout

```
codelab/
  src/voice-agent-codelab.md   the codelab (claat Markdown format)
  src/img/                     images referenced from the Markdown
  tools/render.py              preview renderer for when claat is not installed
  site/                        local preview output (ignored by git)
```

## Editing

Edit `src/voice-agent-codelab.md`. The format is ordinary Markdown with a few rules:

- The metadata block at the top (`author`, `summary`, `id`, `categories`, `feedback link`) drives the page header and the gallery card.
- `# Title` is the codelab title. Every `## Heading` starts a new step, and the `Duration: H:MM:SS` line right under it sets the time estimate shown in the sidebar.
- `### Heading` is a section inside a step.
- `<aside class="positive">` and `<aside class="negative">` render as the green tip and red warning callouts.
- Fenced code blocks with a language (` ```ts `) are syntax highlighted.

## Publishing

Pushing a change under `codelab/src/` to `main` or `feat/voice-agent-call` runs `.github/workflows/codelab.yml`, which installs claat, exports the codelab and deploys it to GitHub Pages.

One-time setup: in the repo on GitHub go to **Settings → Pages** and set **Source** to **GitHub Actions**. Then push, or run the workflow from the Actions tab.

## Building locally

With Go installed:

```bash
go install github.com/googlecodelabs/tools/claat@latest
cd codelab/src
claat export -o ../site voice-agent-codelab.md
claat serve   # opens a local preview
```

Without Go, the Python fallback produces the same page shape (needs `pip install markdown`):

```bash
python3 codelab/tools/render.py codelab/src/voice-agent-codelab.md codelab/site
python3 -m http.server -d codelab/site 8080
```

Then open http://localhost:8080/browser-voice-agent/.

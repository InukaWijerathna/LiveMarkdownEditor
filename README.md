# LiveMarkdownEditor (React + Vite)

Split-screen Markdown editor with editable preview, now running on React + Vite.

## Features

- Source and preview panes with live sync
- Editable preview that converts back to Markdown
- Toolbar formatting actions
- File open/save support (File System Access API + fallback download)
- Keyboard shortcuts
- Dark mode toggle

## Project Structure

- `index.html`: Vite entry HTML with Tailwind CDN config
- `src/App.jsx`: Main editor component and app logic
- `src/App.css`: Editor/preview custom styling
- `src/index.css`: Global baseline styles

## Run

```bash
npm install
npm run dev
```

## Validate

```bash
npm run lint
npm run build
```

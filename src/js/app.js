const source = document.getElementById('source');
const preview = document.getElementById('preview');
const lineNumbers = document.getElementById('lineNumbers');
const statusWords = document.getElementById('statusWords');
const statusChars = document.getElementById('statusChars');
const statusFile = document.getElementById('statusFile');
const darkBtn = document.getElementById('darkBtn');
const openBtn = document.getElementById('openBtn');
const saveBtn = document.getElementById('saveBtn');
const toolbar = document.getElementById('toolbar');
const fileInput = document.getElementById('fileInput');
const sourceModeLabel = document.getElementById('sourceModeLabel');
const previewModeLabel = document.getElementById('previewModeLabel');

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
turndownService.addRule('underline', {
  filter: 'u',
  replacement: (content) => `<u>${content}</u>`,
});
marked.setOptions({ breaks: true, gfm: true });

const defaultMarkdown = `# Markdown Studio

A responsive markdown editor with a **live editable preview**.

## Features

- Split-screen source and preview
- Toolbar formatting actions
- File open/save support
- Keyboard shortcuts
- Dark mode toggle

> Click into the preview and edit directly.

\

\

| Feature | Status |
| --- | --- |
| Source editor | Ready |
| Preview editor | Ready |
| Sync | Bidirectional |
`;

let saveHandle = null;
let currentFileName = 'Untitled.md';
let isRendering = false;
let isPreviewToSource = false;
let previewHasFocus = false;
let lastSyncedSource = '';

function setTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem('markdown-studio-theme', dark ? 'dark' : 'light');
}

function updateLineNumbers() {
  const lineCount = source.value.split('\n').length;
  lineNumbers.innerHTML = Array.from({ length: lineCount }, (_, i) => `<div>${i + 1}</div>`).join('');
  lineNumbers.scrollTop = source.scrollTop;
}

function countWords(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function updateStatus() {
  statusWords.textContent = `${countWords(source.value)} words`;
  statusChars.textContent = `${source.value.length} characters`;
  statusFile.textContent = currentFileName;
}

function renderMarkdown() {
  if (isRendering) return;
  isRendering = true;
  const html = marked.parse(source.value || '');
  preview.innerHTML = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
  isRendering = false;
  syncPreviewEditableState();
}

function syncPreviewEditableState() {
  preview.querySelectorAll('a').forEach((link) => {
    link.setAttribute('contenteditable', 'false');
    link.setAttribute('tabindex', '-1');
  });
  preview.querySelectorAll('img, pre, code, table').forEach((node) => {
    node.setAttribute('contenteditable', 'false');
  });
}

function syncFromSource() {
  if (isPreviewToSource) return;
  updateLineNumbers();
  updateStatus();
  renderMarkdown();
  lastSyncedSource = source.value;
}

function syncSourceFromPreview(options = { renderPreview: false }) {
  if (isRendering) return;
  const markdown = turndownService.turndown(preview.innerHTML).trimEnd() + '\n';
  if (markdown === lastSyncedSource) return;
  isPreviewToSource = true;
  source.value = markdown;
  lastSyncedSource = markdown;
  updateLineNumbers();
  updateStatus();
  sourceModeLabel.textContent = 'Synced from preview';
  previewModeLabel.textContent = 'Editing preview';
  if (options.renderPreview) {
    renderMarkdown();
  }
  isPreviewToSource = false;
}

function wrapSelection(prefix, suffix = prefix, block = false) {
  const start = source.selectionStart;
  const end = source.selectionEnd;
  const text = source.value;
  const selected = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);

  let replacement;
  let newStart;
  let newEnd;

  if (block) {
    const lines = selected || '';
    const transformed = lines.split('\n').map((line) => prefix + line).join('\n');
    replacement = transformed;
    newStart = start;
    newEnd = start + replacement.length;
  } else if (selected) {
    replacement = `${prefix}${selected}${suffix}`;
    newStart = start + prefix.length;
    newEnd = newStart + selected.length;
  } else {
    replacement = `${prefix}${suffix}`;
    newStart = start + prefix.length;
    newEnd = newStart;
  }

  source.value = before + replacement + after;
  source.setSelectionRange(newStart, newEnd);
  source.focus();
  source.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertAtCursor(text) {
  const start = source.selectionStart;
  const end = source.selectionEnd;
  source.setRangeText(text, start, end, 'end');
  source.focus();
  source.dispatchEvent(new Event('input', { bubbles: true }));
}

function prefixLines(prefix) {
  const start = source.selectionStart;
  const end = source.selectionEnd;
  const value = source.value;
  const selected = value.slice(start, end) || value;
  const transformed = selected.split('\n').map((line) => `${prefix}${line}`).join('\n');
  source.setRangeText(transformed, start, end, 'end');
  source.focus();
  source.dispatchEvent(new Event('input', { bubbles: true }));
}

function togglePreviewEditState() {
  sourceModeLabel.textContent = 'Editing source';
  previewModeLabel.textContent = preview.isContentEditable ? 'Editing preview' : 'Preview locked';
}

async function openFileWithFallback() {
  if ('showOpenFilePicker' in window) {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
      excludeAcceptAllOption: false,
      multiple: false,
    });
    const file = await fileHandle.getFile();
    const content = await file.text();
    saveHandle = fileHandle;
    currentFileName = file.name;
    source.value = content;
    source.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  fileInput.value = '';
  fileInput.click();
}

async function saveFile() {
  const content = source.value;
  if (saveHandle && saveHandle.createWritable) {
    const writable = await saveHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return;
  }
  if ('showSaveFilePicker' in window) {
    saveHandle = await window.showSaveFilePicker({
      suggestedName: currentFileName,
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
    });
    const writable = await saveHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return;
  }
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = currentFileName || 'document.md';
  anchor.click();
  URL.revokeObjectURL(url);
}

function handleShortcut(event) {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return false;
  const key = event.key.toLowerCase();
  if (key === 'b') { event.preventDefault(); wrapSelection('**'); return true; }
  if (key === 'i') { event.preventDefault(); wrapSelection('*'); return true; }
  if (key === 'k') {
    event.preventDefault();
    const selected = source.value.slice(source.selectionStart, source.selectionEnd) || 'link text';
    wrapSelection('[', `](https://example.com)`);
    if (selected === 'link text') {
      const cursor = source.selectionStart;
      source.setSelectionRange(cursor + 1, cursor + 1 + selected.length);
    }
    return true;
  }
  return false;
}

function handleToolbarAction(action) {
  const selection = source.value.slice(source.selectionStart, source.selectionEnd);
  switch (action) {
    case 'bold': wrapSelection('**'); break;
    case 'italic': wrapSelection('*'); break;
    case 'heading': insertAtCursor(selection ? `## ${selection}` : '## '); break;
    case 'link': wrapSelection('[', '](https://example.com)'); break;
    case 'quote': prefixLines('> '); break;
    case 'code': selection ? wrapSelection('```\n', '\n```') : insertAtCursor('```\n\n```'); break;
    case 'ul': prefixLines('- '); break;
    case 'ol': prefixLines('1. '); break;
    case 'hr': insertAtCursor('\n---\n'); break;
  }
}

source.addEventListener('input', () => {
  if (isPreviewToSource) return;
  sourceModeLabel.textContent = 'Editing source';
  updateLineNumbers();
  updateStatus();
  if (!previewHasFocus) {
    renderMarkdown();
  }
  lastSyncedSource = source.value;
});

source.addEventListener('scroll', updateLineNumbers);

source.addEventListener('keydown', (event) => {
  if (handleShortcut(event)) return;
  if (event.key === 'Tab') {
    event.preventDefault();
    insertAtCursor('  ');
  }
});

preview.addEventListener('focus', () => {
  previewHasFocus = true;
  previewModeLabel.textContent = 'Editing preview';
});

preview.addEventListener('keydown', (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;

  const key = event.key.toLowerCase();
  if (key === 'b') {
    event.preventDefault();
    document.execCommand('bold');
    syncSourceFromPreview({ renderPreview: false });
  }

  if (key === 'u') {
    event.preventDefault();
    document.execCommand('underline');
    syncSourceFromPreview({ renderPreview: false });
  }
});

preview.addEventListener('input', () => {
  syncSourceFromPreview({ renderPreview: false });
});

preview.addEventListener('blur', () => {
  previewHasFocus = false;
  if (!preview.innerHTML.trim()) {
    preview.innerHTML = '<p><br></p>';
  }
  syncSourceFromPreview({ renderPreview: true });
});

preview.addEventListener('paste', (event) => {
  event.preventDefault();
  const text = (event.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
});

toolbar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  handleToolbarAction(button.dataset.action);
});

darkBtn.addEventListener('click', () => {
  setTheme(!document.documentElement.classList.contains('dark'));
});

openBtn.addEventListener('click', openFileWithFallback);
saveBtn.addEventListener('click', saveFile);

fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const content = await file.text();
  currentFileName = file.name;
  saveHandle = null;
  source.value = content;
  source.dispatchEvent(new Event('input', { bubbles: true }));
});

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey) {
    const lower = event.key.toLowerCase();
    if (lower === 's') {
      event.preventDefault();
      saveFile();
    }
    if (lower === 'o') {
      event.preventDefault();
      openFileWithFallback();
    }
  }
});

const savedTheme = localStorage.getItem('markdown-studio-theme');
setTheme(savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);

source.value = defaultMarkdown;
source.dispatchEvent(new Event('input', { bubbles: true }));
togglePreviewEditState();
updateLineNumbers();
updateStatus();

preview.addEventListener('keyup', () => {
  sourceModeLabel.textContent = 'Editing source';
});

preview.addEventListener('mouseup', () => {
  preview.focus();
});

// Keep the preview editable by allowing direct typing, then converting it back to markdown.
preview.addEventListener('beforeinput', () => {
  previewModeLabel.textContent = 'Editing preview';
});

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'
import './App.css'

marked.setOptions({ breaks: true, gfm: true })

const DEFAULT_MARKDOWN = `# Markdown Studio

A responsive markdown editor with a **live editable preview**.

## Features

- Split-screen source and preview
- Toolbar formatting actions
- File open/save support
- Keyboard shortcuts
- Dark mode toggle

> Click into the preview and edit directly.

\\

\\

| Feature | Status |
| --- | --- |
| Source editor | Ready |
| Preview editor | Ready |
| Sync | Bidirectional |
`

function toSafeHtml(value) {
  return DOMPurify.sanitize(marked.parse(value || ''), { USE_PROFILES: { html: true } })
}

function App() {
  const sourceRef = useRef(null)
  const previewRef = useRef(null)
  const lineNumbersRef = useRef(null)
  const fileInputRef = useRef(null)
  const saveHandleRef = useRef(null)

  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN)
  const [currentFileName, setCurrentFileName] = useState('Untitled.md')
  const [previewHasFocus, setPreviewHasFocus] = useState(false)
  const [sourceModeLabel, setSourceModeLabel] = useState('Editing source')
  const [previewModeLabel, setPreviewModeLabel] = useState('Editing preview')

  const turndownService = useMemo(() => {
    const service = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    })

    service.addRule('underline', {
      filter: 'u',
      replacement: (content) => `<u>${content}</u>`,
    })

    return service
  }, [])

  const lineCount = markdown.split('\n').length
  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).length : 0
  const charCount = markdown.length

  const setTheme = useCallback((dark) => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('markdown-studio-theme', dark ? 'dark' : 'light')
  }, [])

  const syncPreviewEditableState = useCallback(() => {
    if (!previewRef.current) return

    previewRef.current.querySelectorAll('a').forEach((link) => {
      link.setAttribute('contenteditable', 'false')
      link.setAttribute('tabindex', '-1')
    })

    previewRef.current.querySelectorAll('img, pre, code, table').forEach((node) => {
      node.setAttribute('contenteditable', 'false')
    })
  }, [])

  const updateFromSource = useCallback(
    (nextValue) => {
      setMarkdown(nextValue)
      setSourceModeLabel('Editing source')
    },
    [],
  )

  const applySourceMutation = useCallback(
    (mutator) => {
      const textarea = sourceRef.current
      if (!textarea) return

      mutator(textarea)
      updateFromSource(textarea.value)
      textarea.focus()
    },
    [updateFromSource],
  )

  const wrapSelection = useCallback(
    (prefix, suffix = prefix) => {
      applySourceMutation((textarea) => {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const selected = textarea.value.slice(start, end)
        const replacement = selected ? `${prefix}${selected}${suffix}` : `${prefix}${suffix}`

        textarea.setRangeText(replacement, start, end, 'end')

        const cursorStart = start + prefix.length
        const cursorEnd = selected ? cursorStart + selected.length : cursorStart
        textarea.setSelectionRange(cursorStart, cursorEnd)
      })
    },
    [applySourceMutation],
  )

  const insertAtCursor = useCallback(
    (text) => {
      applySourceMutation((textarea) => {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        textarea.setRangeText(text, start, end, 'end')
      })
    },
    [applySourceMutation],
  )

  const prefixLines = useCallback(
    (prefix) => {
      applySourceMutation((textarea) => {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const selected = textarea.value.slice(start, end) || textarea.value
        const transformed = selected
          .split('\n')
          .map((line) => `${prefix}${line}`)
          .join('\n')

        textarea.setRangeText(transformed, start, end, 'end')
      })
    },
    [applySourceMutation],
  )

  const handleToolbarAction = useCallback(
    (action) => {
      const textarea = sourceRef.current
      const selection = textarea
        ? textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)
        : ''

      switch (action) {
        case 'bold':
          wrapSelection('**')
          break
        case 'italic':
          wrapSelection('*')
          break
        case 'heading':
          insertAtCursor(selection ? `## ${selection}` : '## ')
          break
        case 'link':
          wrapSelection('[', '](https://example.com)')
          break
        case 'quote':
          prefixLines('> ')
          break
        case 'code':
          selection ? wrapSelection('```\n', '\n```') : insertAtCursor('```\n\n```')
          break
        case 'ul':
          prefixLines('- ')
          break
        case 'ol':
          prefixLines('1. ')
          break
        case 'hr':
          insertAtCursor('\n---\n')
          break
        default:
          break
      }
    },
    [insertAtCursor, prefixLines, wrapSelection],
  )

  const syncSourceFromPreview = useCallback(
    () => {
      if (!previewRef.current) return

      const nextMarkdown = `${turndownService.turndown(previewRef.current.innerHTML).trimEnd()}\n`
      if (nextMarkdown === markdown) return

      setMarkdown(nextMarkdown)
      setSourceModeLabel('Synced from preview')
      setPreviewModeLabel('Editing preview')
    },
    [markdown, turndownService],
  )

  const openFileWithFallback = useCallback(async () => {
    if ('showOpenFilePicker' in window) {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
        excludeAcceptAllOption: false,
        multiple: false,
      })

      const file = await fileHandle.getFile()
      const content = await file.text()
      saveHandleRef.current = fileHandle
      setCurrentFileName(file.name)
      updateFromSource(content)
      return
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }, [updateFromSource])

  const saveFile = useCallback(async () => {
    if (saveHandleRef.current && saveHandleRef.current.createWritable) {
      const writable = await saveHandleRef.current.createWritable()
      await writable.write(markdown)
      await writable.close()
      return
    }

    if ('showSaveFilePicker' in window) {
      saveHandleRef.current = await window.showSaveFilePicker({
        suggestedName: currentFileName,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
      })

      const writable = await saveHandleRef.current.createWritable()
      await writable.write(markdown)
      await writable.close()
      return
    }

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = currentFileName || 'document.md'
    anchor.click()
    URL.revokeObjectURL(url)
  }, [markdown, currentFileName])

  const handleSourceKeyDown = useCallback(
    (event) => {
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const shift = event.shiftKey

      if (mod && (key === 'b' || (shift && key === 'b'))) {
        event.preventDefault()
        wrapSelection('**')
        return
      }

      if (mod && key === 'u') {
        event.preventDefault()
        wrapSelection('<u>', '</u>')
        return
      }

      if (mod && key === 'i') {
        event.preventDefault()
        wrapSelection('*')
        return
      }

      if (mod && key === 'k') {
        event.preventDefault()
        wrapSelection('[', '](https://example.com)')
        return
      }

      if (mod && shift && event.code === 'Digit7') {
        event.preventDefault()
        prefixLines('1. ')
        return
      }

      if (mod && shift && event.code === 'Digit8') {
        event.preventDefault()
        prefixLines('- ')
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        insertAtCursor('  ')
      }
    },
    [insertAtCursor, prefixLines, wrapSelection],
  )

  useEffect(() => {
    const savedTheme = localStorage.getItem('markdown-studio-theme')
    setTheme(
      savedTheme
        ? savedTheme === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches,
    )
  }, [setTheme])

  useEffect(() => {
    if (!previewRef.current || previewHasFocus) return
    previewRef.current.innerHTML = toSafeHtml(markdown)
    syncPreviewEditableState()
  }, [markdown, previewHasFocus, syncPreviewEditableState])

  useEffect(() => {
    const onWindowKeyDown = (event) => {
      const mod = event.ctrlKey || event.metaKey
      if (!mod) return

      const lower = event.key.toLowerCase()
      if (lower === 's') {
        event.preventDefault()
        saveFile()
      }

      if (lower === 'o') {
        event.preventDefault()
        openFileWithFallback()
      }
    }

    window.addEventListener('keydown', onWindowKeyDown)
    return () => window.removeEventListener('keydown', onWindowKeyDown)
  }, [openFileWithFallback, saveFile])

  return (
    <div className="min-h-screen font-sans text-slate-900 dark:text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-3 py-3 sm:px-4 sm:py-4">
        <header className="glass mb-3 rounded-3xl border border-white/60 px-4 py-4 shadow-soft dark:border-slate-700/60 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                Markdown Studio
              </div>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                A split-screen markdown editor with live editable preview
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
                Edit source on the left, click directly into the rendered preview on the right, and
                keep both sides in sync in real time.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                onClick={openFileWithFallback}
              >
                Open
              </button>
              <button
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                onClick={saveFile}
              >
                Save
              </button>
              <button
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                onClick={() => setTheme(!document.documentElement.classList.contains('dark'))}
              >
                Toggle dark
              </button>
            </div>
          </div>
          
        </header>

        <main className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
          <section className="glass min-h-[60vh] overflow-hidden rounded-3xl border border-white/60 shadow-soft dark:border-slate-700/60">
            <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3 dark:border-slate-700/80">
              <div>
                <div className="text-sm font-semibold">Source</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Markdown input with live line numbers</div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{sourceModeLabel}</div>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-[4.25rem_1fr]">
              <div
                ref={lineNumbersRef}
                className="editor-scroll select-none overflow-hidden border-r border-slate-200/70 bg-slate-50/60 p-4 font-mono text-sm leading-7 text-slate-400 dark:border-slate-700/70 dark:bg-slate-950/20"
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i + 1}>{i + 1}</div>
                ))}
              </div>
              <textarea
                ref={sourceRef}
                className="editor-scroll min-h-[60vh] w-full resize-none bg-transparent p-4 font-mono text-sm leading-7 text-slate-800 outline-none dark:text-slate-100"
                spellCheck="false"
                placeholder="# Start writing markdown...\n\nTry **bold**, *italic*, [links](https://example.com), code blocks, and more."
                value={markdown}
                onChange={(event) => updateFromSource(event.target.value)}
                onKeyDown={handleSourceKeyDown}
                onScroll={() => {
                  if (lineNumbersRef.current && sourceRef.current) {
                    lineNumbersRef.current.scrollTop = sourceRef.current.scrollTop
                  }
                }}
              />
            </div>
          </section>

          <section className="glass min-h-[60vh] overflow-hidden rounded-3xl border border-white/60 shadow-soft dark:border-slate-700/60">
            <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3 dark:border-slate-700/80">
              <div>
                <div className="text-sm font-semibold">Preview</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Rendered HTML, editable in place</div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{previewModeLabel}</div>
            </div>
            <div
              ref={previewRef}
              className="preview preview-scroll editor-scroll min-h-[60vh] overflow-auto p-5 outline-none"
              contentEditable
              suppressContentEditableWarning
              aria-label="Markdown preview editor"
              onFocus={() => {
                setPreviewHasFocus(true)
                setPreviewModeLabel('Editing preview')
              }}
              onInput={() => syncSourceFromPreview()}
              onBlur={() => {
                setPreviewHasFocus(false)
                if (previewRef.current && !previewRef.current.innerHTML.trim()) {
                  previewRef.current.innerHTML = '<p><br></p>'
                }
                syncSourceFromPreview()
              }}
              onKeyDown={(event) => {
                const mod = event.ctrlKey || event.metaKey
                if (!mod) return

                const key = event.key.toLowerCase()
                const shift = event.shiftKey

                if (key === 'b' || (shift && key === 'b')) {
                  event.preventDefault()
                  document.execCommand('bold')
                  syncSourceFromPreview()
                }

                if (key === 'u') {
                  event.preventDefault()
                  document.execCommand('underline')
                  syncSourceFromPreview()
                }

                if (key === 'i') {
                  event.preventDefault()
                  document.execCommand('italic')
                  syncSourceFromPreview()
                }

                if (shift && event.code === 'Digit7') {
                  event.preventDefault()
                  document.execCommand('insertOrderedList')
                  syncSourceFromPreview()
                }

                if (shift && event.code === 'Digit8') {
                  event.preventDefault()
                  document.execCommand('insertUnorderedList')
                  syncSourceFromPreview()
                }
              }}
              onPaste={(event) => {
                event.preventDefault()
                const text = (event.clipboardData || window.clipboardData).getData('text/plain')
                document.execCommand('insertText', false, text)
              }}
              onMouseUp={() => previewRef.current?.focus()}
            />
          </section>
        </main>

        <footer className="glass mt-3 rounded-3xl border border-white/60 px-4 py-3 shadow-soft dark:border-slate-700/60">
          <div className="flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>{currentFileName}</span>
              <span>{wordCount} words</span>
              <span>{charCount} characters</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>Shortcuts: Ctrl/Cmd+B, Ctrl/Cmd+U, Ctrl/Cmd+I, Ctrl/Cmd+K, Ctrl/Cmd+Shift+7, Ctrl/Cmd+Shift+8</span>
            </div>
          </div>
            <div className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">© @inukaWijerathna</div>
        </footer>

        {/* Fixed bottom toolbar */}
        <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4">
          <div className="glass inline-flex items-center gap-2 rounded-full border border-white/60 px-3 py-2 shadow-soft dark:border-slate-700/60">
            <button className="toolbar-btn rounded-md px-3 py-1 text-sm font-medium" onClick={() => handleToolbarAction('bold')}>Bold</button>
            <button className="toolbar-btn rounded-md px-3 py-1 text-sm font-medium" onClick={() => handleToolbarAction('italic')}>Italic</button>
            <button className="toolbar-btn rounded-md px-3 py-1 text-sm font-medium" onClick={() => handleToolbarAction('heading')}>Heading</button>
            <button className="toolbar-btn rounded-md px-3 py-1 text-sm font-medium" onClick={() => handleToolbarAction('link')}>Link</button>
            <button className="toolbar-btn rounded-md px-3 py-1 text-sm font-medium" onClick={() => handleToolbarAction('quote')}>Quote</button>
            <button className="toolbar-btn rounded-md px-3 py-1 text-sm font-medium" onClick={() => handleToolbarAction('code')}>Code</button>
            <button className="toolbar-btn rounded-md px-3 py-1 text-sm font-medium" onClick={() => handleToolbarAction('ul')}>List</button>
            <button className="toolbar-btn rounded-md px-3 py-1 text-sm font-medium" onClick={() => handleToolbarAction('ol')}>Numbered</button>
            <button className="toolbar-btn rounded-md px-3 py-1 text-sm font-medium" onClick={() => handleToolbarAction('hr')}>Rule</button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,text/markdown"
        className="hidden"
        onChange={async () => {
          const file = fileInputRef.current?.files && fileInputRef.current.files[0]
          if (!file) return

          const content = await file.text()
          setCurrentFileName(file.name)
          saveHandleRef.current = null
          updateFromSource(content)
        }}
      />
    </div>
  )
}

export default App

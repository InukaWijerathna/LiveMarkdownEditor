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
  const [isDark, setIsDark] = useState(false)
  const [toolbarPos, setToolbarPos] = useState({ x: 16, y: 0 })
  const toolbarRef = useRef(null)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, x: 0, y: 0 })

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
    setIsDark(!!dark)
  }, [setIsDark])

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
      // If preview has focus, apply formatting directly to the contentEditable preview
      if (previewHasFocus && previewRef.current) {
        switch (action) {
          case 'bold':
            document.execCommand('bold')
            break
          case 'italic':
            document.execCommand('italic')
            break
          case 'heading':
            document.execCommand('formatBlock', false, 'H2')
            break
          case 'link':
            document.execCommand('insertHTML', false, '<a href="https://example.com">https://example.com</a>')
            break
          case 'quote':
            document.execCommand('insertHTML', false, '<blockquote><p></p></blockquote>')
            break
          case 'code':
            document.execCommand('insertHTML', false, '<pre><code></code></pre>')
            break
          case 'ul':
            document.execCommand('insertUnorderedList')
            break
          case 'ol':
            document.execCommand('insertOrderedList')
            break
          case 'hr':
            document.execCommand('insertHTML', false, '<hr />')
            break
          default:
            break
        }

        // After manipulating the preview DOM, sync back to markdown
        syncSourceFromPreview()
        return
      }
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

  const handleOpenClick = useCallback(async () => {
    try {
      await openFileWithFallback()
    } catch (err) {
      console.error(err)
      alert('Failed to open file: ' + (err && err.message ? err.message : err))
    }
  }, [openFileWithFallback])

  const handleSaveClick = useCallback(async () => {
    try {
      await saveFile()
    } catch (err) {
      console.error(err)
      alert('Failed to save file: ' + (err && err.message ? err.message : err))
    }
  }, [saveFile])

  const handleToggleThemeClick = useCallback(() => {
    setTheme(!isDark)
  }, [setTheme, isDark])

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
    setTheme(savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches)

    // initialize toolbar center position after mount
    const onLoad = () => {
      const midY = Math.round(window.innerHeight / 2)
      setToolbarPos((p) => ({ ...p, y: midY }))
    }

    onLoad()
  }, [setTheme])

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return
      const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX)
      const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY)
      const dx = clientX - dragStartRef.current.mouseX
      const dy = clientY - dragStartRef.current.mouseY
      setToolbarPos({ x: Math.max(8, dragStartRef.current.x + dx), y: Math.max(8, dragStartRef.current.y + dy) })
    }

    const onUp = () => {
      draggingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }

    if (draggingRef.current) {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      window.addEventListener('touchmove', onMove)
      window.addEventListener('touchend', onUp)
    }

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [toolbarRef])

  const startDrag = (e) => {
    // don't start drag when clicking buttons
    if (e.target.closest('button')) return
    draggingRef.current = true
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX)
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY)
    dragStartRef.current = { mouseX: clientX, mouseY: clientY, x: toolbarPos.x, y: toolbarPos.y }
  }

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
        <header className="w-full mb-3 px-4 py-3 border-b bg-white/50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Live Markdown Editor</div>
              <h1 className="mt-1 text-lg font-bold tracking-tight">Split-screen editor with live preview</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Open file"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                onClick={handleOpenClick}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Save file"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                onClick={handleSaveClick}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Toggle dark theme"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                onClick={handleToggleThemeClick}
              >
                {isDark ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
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

        <footer className="w-full mt-6 border-t py-3">
          <div className="max-w-[1600px] mx-auto px-3 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
            <div className="flex gap-4 items-center">
              <span>{currentFileName}</span>
              <span>{wordCount} words</span>
              <span>{charCount} characters</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">© 2026 @InukaWijerathna</div>
          </div>
        </footer>

        {/* Left floating toolbar (vertical) */}
        <div className="fixed left-4 top-[55%] z-50">
          <div className="glass flex flex-col items-center gap-2 rounded-2xl border border-white/60 px-2 py-3 shadow-soft dark:border-slate-700/60">
            <button title="Bold" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction('bold')} className="p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7h4a3 3 0 0 1 0 6H7z"/><path d="M7 13h5a3 3 0 0 1 0 6H7z"/></svg>
            </button>

            <button title="Italic" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction('italic')} className="p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
            </button>

            <button title="Heading" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction('heading')} className="p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4v16" />
                <path d="M18 4v16" />
                <path d="M6 12h12" />
              </svg>
            </button>

            <button title="Link" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction('link')} className="p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
            </button>

            <button title="Quote" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction('quote')} className="p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 8v6a2 2 0 0 1-2 2h-3v3l-4-3H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
              </svg>
            </button>

            <button title="Code" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction('code')} className="p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </button>

            <button title="Bulleted list" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction('ul')} className="p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="0.5"/><circle cx="3.5" cy="12" r="0.5"/><circle cx="3.5" cy="18" r="0.5"/></svg>
            </button>

            <button title="Numbered list" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction('ol')} className="p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <text x="2" y="6.8" fontSize="6" fill="currentColor">1</text>
                <line x1="8" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <text x="2" y="12.8" fontSize="6" fill="currentColor">2</text>
                <line x1="8" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <text x="2" y="18.8" fontSize="6" fill="currentColor">3</text>
                <line x1="8" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            <button title="Horizontal rule" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToolbarAction('hr')} className="p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/></svg>
            </button>
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

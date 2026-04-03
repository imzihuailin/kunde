import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { saveImportedBook } from '../utils/bookStorage'

function isEpubFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.epub')
}

export function AddBookPage() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const importFile = async (file: File | null) => {
    if (!file) return
    if (!isEpubFile(file)) {
      setError('这里只支持导入 .epub 文件。')
      return
    }

    setImporting(true)
    setError('')
    try {
      await saveImportedBook(file)
      navigate('/')
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '导入失败，请换一本书再试。')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-transparent px-6 py-6 text-slate-900">
      <div className="flex min-h-[calc(100vh-3rem)] flex-col">
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            返回书架
          </Link>
        </div>

        <section className="flex-1 rounded-[2.5rem] border border-white/60 bg-white/75 p-8 shadow-[0_35px_120px_rgba(15,23,42,0.14)] backdrop-blur-xl">
          <p className="mb-6 text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Add Book</p>
          <input
            ref={inputRef}
            type="file"
            accept=".epub,application/epub+zip"
            className="hidden"
            onChange={(event) => {
              const [file] = Array.from(event.target.files ?? [])
              void importFile(file ?? null)
            }}
          />

          <button
            type="button"
            onDragEnter={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault()
              setDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const [file] = Array.from(event.dataTransfer.files ?? [])
              void importFile(file ?? null)
            }}
            onClick={() => inputRef.current?.click()}
            disabled={importing}
            className={`flex h-full min-h-[calc(100vh-12rem)] w-full flex-col items-center justify-center rounded-[2.25rem] border-2 border-dashed px-8 text-center transition ${
              dragging
                ? 'border-blue-500 bg-blue-50/80'
                : 'border-slate-300 bg-gradient-to-b from-slate-50 to-white hover:border-slate-400'
            } ${importing ? 'cursor-wait opacity-70' : ''}`}
          >
            <div className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white">
              {importing ? '正在导入...' : '选择或拖入 EPUB'}
            </div>
            <p className="mt-6 text-[2rem] font-semibold text-slate-900">拖拽文件到这里，或者点击选择</p>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-500">
              这里只保留最直接的导入区域，支持 `.epub` 文件；导入后会自动解析封面、书名、作者和目录。
            </p>
            {error ? <p className="mt-6 text-base text-rose-600">{error}</p> : null}
          </button>
        </section>
      </div>
    </div>
  )
}

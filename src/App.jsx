import React, { useReducer, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  Plus, X, Clock, Copy, Check, Trash2, ChevronDown, ChevronUp,
  Pencil, ImageIcon, Settings
} from 'lucide-react'

const DEFAULT_THUMB_SIZE = 96
const MIN_THUMB_SIZE = 48
const MAX_THUMB_SIZE = 240
const TEXT_BOX_WIDTH_PX = 180

const BUILTIN_TRANSITIONS = ['cut to', 'use']
const TRANSITIONS_DEFAULTS_KEY = 'crumpet-default-transitions'

function loadDefaultTransitions() {
  try {
    const saved = localStorage.getItem(TRANSITIONS_DEFAULTS_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return [...BUILTIN_TRANSITIONS]
}

function saveDefaultTransitions(transitions) {
  try {
    localStorage.setItem(TRANSITIONS_DEFAULTS_KEY, JSON.stringify(transitions))
  } catch {}
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

const STORAGE_KEY = 'crumpet-state'

function makeTab(name) {
  return {
    id: uid(),
    name,
    images: [],
    timeline: { duration: 8, fps: 24 },
    markers: [],
    prefix: '',
    suffix: '',
  }
}

function nextTabName(tabs) {
  const nums = tabs
    .map(t => {
      const m = t.name.match(/^SH(\d+)$/)
      return m ? parseInt(m[1], 10) : 0
    })
    .filter(n => n > 0)
  const max = nums.length ? Math.max(...nums) : 0
  const next = Math.ceil((max + 1) / 10) * 10
  return `SH${String(next).padStart(3, '0')}`
}

function buildPrompt(tab) {
  const lines = []
  if (tab.prefix.trim()) lines.push(tab.prefix.trim())
  const sorted = [...tab.markers].sort((a, b) => a.frame - b.frame)
  for (const m of sorted) {
    if (m.text.trim()) {
      const transition = m.transition ? `${m.transition} ` : ''
      const frameRef = m.showFrameRef !== false ? `at frame ${m.frame} ` : ''
      lines.push(`${frameRef}${transition}${m.text.trim()}`)
    }
  }
  if (tab.suffix.trim()) lines.push(tab.suffix.trim())
  return lines.join('\n')
}

function tabHasContent(tab) {
  return (
    tab.images.length > 0 ||
    tab.markers.length > 0 ||
    tab.prefix.trim() !== '' ||
    tab.suffix.trim() !== ''
  )
}

function totalFrames(tab) {
  return tab.timeline.duration * tab.timeline.fps
}

function frameToPercent(frame, tab) {
  const tf = totalFrames(tab)
  return tf === 0 ? 0 : (frame / tf) * 100
}

function pixelToFrame(px, containerWidth, tab) {
  const tf = totalFrames(tab)
  const raw = (px / containerWidth) * tf
  return Math.max(0, Math.min(tf, Math.round(raw)))
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

const initialState = {
  activeTabId: null,
  tabs: [],
  customTransitions: [],
  settingsOpen: false,
  appSettingsOpen: false,
  imagePickerMarkerId: null,
  imagePickerPosition: null,
}

function getDefaultState() {
  const tab = makeTab('SH010')
  return { ...initialState, activeTabId: tab.id, tabs: [tab] }
}

function reducer(state, action) {
  const { type, payload } = action
  const activeTab = state.tabs.find(t => t.id === state.activeTabId)

  function updateActiveTab(updater) {
    return {
      ...state,
      tabs: state.tabs.map(t =>
        t.id === state.activeTabId ? updater(t) : t
      ),
    }
  }

  switch (type) {
    case 'RESTORE_STATE':
      return {
        ...state,
        ...payload,
        settingsOpen: false,
        appSettingsOpen: false,
        imagePickerMarkerId: null,
        imagePickerPosition: null,
      }

    case 'ADD_TAB': {
      const name = nextTabName(state.tabs)
      const tab = makeTab(name)
      return { ...state, tabs: [...state.tabs, tab], activeTabId: tab.id }
    }
    case 'REMOVE_TAB': {
      const remaining = state.tabs.filter(t => t.id !== payload.id)
      if (remaining.length === 0) {
        const tab = makeTab('SH010')
        return { ...state, tabs: [tab], activeTabId: tab.id }
      }
      const newActive =
        state.activeTabId === payload.id
          ? remaining[Math.max(0, state.tabs.findIndex(t => t.id === payload.id) - 1)].id
          : state.activeTabId
      return { ...state, tabs: remaining, activeTabId: newActive }
    }
    case 'RENAME_TAB':
      return {
        ...state,
        tabs: state.tabs.map(t =>
          t.id === payload.id ? { ...t, name: payload.name } : t
        ),
      }
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTabId: payload.id, settingsOpen: false, imagePickerMarkerId: null }

    case 'ADD_IMAGE':
      return updateActiveTab(t => ({
        ...t,
        images: [...t.images, { id: uid(), dataUri: payload.dataUri, name: `@img${t.images.length + 1}` }],
      }))
    case 'RENAME_IMAGE':
      return updateActiveTab(t => ({
        ...t,
        images: t.images.map(img =>
          img.id === payload.id ? { ...img, name: payload.name } : img
        ),
      }))
    case 'REMOVE_IMAGE':
      return updateActiveTab(t => ({
        ...t,
        images: t.images.filter(img => img.id !== payload.id),
        markers: t.markers.map(m =>
          m.imageId === payload.id ? { ...m, imageId: null } : m
        ),
      }))

    case 'SET_TIMELINE':
      return updateActiveTab(t => {
        const newTimeline = { ...t.timeline, ...payload }
        const newTotalFrames = newTimeline.duration * newTimeline.fps
        return {
          ...t,
          timeline: newTimeline,
          markers: t.markers.map(m => ({
            ...m,
            frame: Math.min(m.frame, newTotalFrames),
          })),
        }
      })

    case 'ADD_MARKER': {
      const marker = {
        id: uid(),
        frame: payload.frame,
        imageId: null,
        text: '',
        transition: 'cut to',
        showFrameRef: true,
        collapsed: false,
      }
      return {
        ...updateActiveTab(t => ({ ...t, markers: [...t.markers, marker] })),
        imagePickerMarkerId: marker.id,
        imagePickerPosition: payload.position,
      }
    }
    case 'REMOVE_MARKER':
      return updateActiveTab(t => ({
        ...t,
        markers: t.markers.filter(m => m.id !== payload.id),
      }))
    case 'MOVE_MARKER':
      return updateActiveTab(t => ({
        ...t,
        markers: t.markers.map(m =>
          m.id === payload.id ? { ...m, frame: payload.frame } : m
        ),
      }))
    case 'UPDATE_MARKER_TEXT':
      return updateActiveTab(t => ({
        ...t,
        markers: t.markers.map(m =>
          m.id === payload.id ? { ...m, text: payload.text } : m
        ),
      }))
    case 'TOGGLE_MARKER_COLLAPSED':
      return updateActiveTab(t => ({
        ...t,
        markers: t.markers.map(m =>
          m.id === payload.id ? { ...m, collapsed: !m.collapsed } : m
        ),
      }))
    case 'ASSIGN_MARKER_IMAGE': {
      const img = activeTab?.images.find(i => i.id === payload.imageId)
      return {
        ...updateActiveTab(t => ({
          ...t,
          markers: t.markers.map(m =>
            m.id === payload.markerId
              ? { ...m, imageId: payload.imageId, text: m.text || (img ? img.name + ' ' : '') }
              : m
          ),
        })),
        imagePickerMarkerId: null,
        imagePickerPosition: null,
      }
    }

    case 'SET_PREFIX':
      return updateActiveTab(t => ({ ...t, prefix: payload.text }))
    case 'SET_SUFFIX':
      return updateActiveTab(t => ({ ...t, suffix: payload.text }))

    case 'SET_MARKER_TRANSITION':
      return updateActiveTab(t => ({
        ...t,
        markers: t.markers.map(m =>
          m.id === payload.id ? { ...m, transition: payload.transition } : m
        ),
      }))
    case 'TOGGLE_MARKER_FRAME_REF':
      return updateActiveTab(t => ({
        ...t,
        markers: t.markers.map(m =>
          m.id === payload.id ? { ...m, showFrameRef: !m.showFrameRef } : m
        ),
      }))
    case 'ADD_CUSTOM_TRANSITION': {
      const val = payload.value.trim()
      if (!val || state.customTransitions.includes(val)) return state
      return { ...state, customTransitions: [...state.customTransitions, val] }
    }
    case 'REMOVE_CUSTOM_TRANSITION':
      return {
        ...state,
        customTransitions: state.customTransitions.filter(t => t !== payload.value),
      }

    case 'OPEN_SETTINGS':
      return { ...state, settingsOpen: true }
    case 'CLOSE_SETTINGS':
      return { ...state, settingsOpen: false }
    case 'OPEN_APP_SETTINGS':
      return { ...state, appSettingsOpen: true }
    case 'CLOSE_APP_SETTINGS':
      return { ...state, appSettingsOpen: false }
    case 'OPEN_IMAGE_PICKER':
      return { ...state, imagePickerMarkerId: payload.markerId, imagePickerPosition: payload.position }
    case 'CLOSE_IMAGE_PICKER':
      return { ...state, imagePickerMarkerId: null, imagePickerPosition: null }

    default:
      return state
  }
}

// ─── Components ──────────────────────────────────────────────────────────────

// ── Tab Bar ──

function TabBar({ tabs, activeTabId, dispatch }) {
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editingId && inputRef.current) inputRef.current.focus()
  }, [editingId])

  function startRename(tab) {
    setEditingId(tab.id)
    setEditValue(tab.name)
  }

  function confirmRename() {
    if (editingId && editValue.trim()) {
      dispatch({ type: 'RENAME_TAB', payload: { id: editingId, name: editValue.trim() } })
    }
    setEditingId(null)
  }

  function closeTab(e, tab) {
    e.stopPropagation()
    if (tabHasContent(tab)) {
      if (!window.confirm(`Close "${tab.name}"? This tab has content that will be lost.`)) return
    }
    dispatch({ type: 'REMOVE_TAB', payload: { id: tab.id } })
  }

  return (
    <div className="flex items-center font-sans">
      {tabs.map(tab => (
        <div
          key={tab.id}
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: { id: tab.id } })}
          className={`group flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none whitespace-nowrap border-b-2 transition-colors duration-100 ${
            tab.id === activeTabId
              ? 'border-crumpet-orange text-white bg-crumpet-bg'
              : 'border-transparent text-crumpet-muted hover:text-white hover:bg-[#1a1a1a]'
          }`}
        >
          {editingId === tab.id ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmRename()
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="bg-transparent border-b border-crumpet-orange text-white font-mono text-sm w-20 outline-none"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <div className="flex items-center gap-1">
              <span className="font-mono text-sm tracking-wide">{tab.name}</span>
              <button
                onClick={e => {
                  e.stopPropagation()
                  startRename(tab)
                }}
                className="opacity-0 group-hover:opacity-100 text-crumpet-muted hover:text-crumpet-orange transition-opacity duration-100"
              >
                <Pencil size={10} />
              </button>
            </div>
          )}
          <button
            onClick={e => closeTab(e, tab)}
            className="opacity-0 group-hover:opacity-100 text-crumpet-muted hover:text-white transition-opacity duration-100"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={() => dispatch({ type: 'ADD_TAB' })}
        className="px-3 py-2.5 text-crumpet-muted hover:text-crumpet-orange transition-colors duration-100"
        title="Add new tab"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}

// ── Image Dropzone ──

function ImageDropzone({ images, dispatch, thumbSize, onThumbSizeChange }) {
  const [dragOver, setDragOver] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (editingId && inputRef.current) inputRef.current.focus()
  }, [editingId])

  function processFiles(files) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = () => {
        dispatch({ type: 'ADD_IMAGE', payload: { dataUri: reader.result } })
      }
      reader.readAsDataURL(file)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    processFiles(e.dataTransfer.files)
  }

  function handleClick(e) {
    if (e.target.closest('button, input')) return
    fileInputRef.current?.click()
  }

  function handleFileSelect(e) {
    if (e.target.files.length) processFiles(e.target.files)
    e.target.value = ''
  }

  function startRename(img) {
    setEditingId(img.id)
    setEditValue(img.name)
  }

  function confirmRename() {
    if (editingId && editValue.trim()) {
      dispatch({ type: 'RENAME_IMAGE', payload: { id: editingId, name: editValue.trim() } })
    }
    setEditingId(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-sans uppercase tracking-wider text-crumpet-muted">Images</label>
        {images.length > 0 && (
          <div className="flex items-center gap-2">
            <ImageIcon size={10} className="text-crumpet-muted" />
            <input
              type="range"
              min={MIN_THUMB_SIZE}
              max={MAX_THUMB_SIZE}
              value={thumbSize}
              onChange={e => onThumbSizeChange(Number(e.target.value))}
              className="w-20 h-1 accent-crumpet-orange cursor-pointer"
            />
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
      <div
        onDragOver={e => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`min-h-[100px] border-2 border-dashed rounded-lg p-3 transition-colors duration-100 cursor-pointer ${
          dragOver
            ? 'border-crumpet-orange bg-crumpet-orange/5'
            : 'border-crumpet-border hover:border-[#444]'
        }`}
      >
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[76px] text-crumpet-muted font-sans text-sm">
            <ImageIcon size={24} className="mb-1 opacity-40" />
            <span>Drop or click to add images</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {images.map(img => (
              <div key={img.id} className="flex flex-col items-center gap-1 group">
                <div
                  className="relative rounded border border-crumpet-border overflow-hidden bg-crumpet-surface"
                  style={{ width: thumbSize, maxHeight: thumbSize * 1.5 }}
                >
                  <img
                    src={img.dataUri}
                    alt={img.name}
                    className="w-full h-auto block"
                    style={{ maxHeight: thumbSize * 1.5 }}
                  />
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      dispatch({ type: 'REMOVE_IMAGE', payload: { id: img.id } })
                    }}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-crumpet-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-100"
                    title="Remove image"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  {editingId === img.id ? (
                    <input
                      ref={inputRef}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={confirmRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') confirmRename()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="bg-transparent border-b border-crumpet-orange text-white font-mono text-xs outline-none text-center"
                      style={{ width: Math.max(60, thumbSize - 16) }}
                    />
                  ) : (
                    <>
                      <span className="font-mono text-xs text-crumpet-muted">{img.name}</span>
                      <button
                        onClick={() => startRename(img)}
                        className="opacity-0 group-hover:opacity-100 text-crumpet-muted hover:text-crumpet-orange transition-opacity duration-100"
                      >
                        <Pencil size={10} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Timeline Settings Modal ──

function TimelineSettingsModal({ timeline, dispatch }) {
  const durationWarning = timeline.duration < 4 || timeline.duration > 15
  const fpsWarning = timeline.fps !== 24 && timeline.fps !== 25

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32"
      onClick={() => dispatch({ type: 'CLOSE_SETTINGS' })}
    >
      <div
        className="bg-[#1e1e1e] border border-crumpet-border rounded-lg shadow-2xl p-5 w-72 font-sans"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white text-sm font-semibold tracking-wide uppercase">Timeline Settings</h3>
          <button
            onClick={() => dispatch({ type: 'CLOSE_SETTINGS' })}
            className="text-crumpet-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-xs text-crumpet-muted mb-1.5 uppercase tracking-wider">Duration (seconds)</label>
          <input
            type="number"
            min={1}
            max={999}
            value={timeline.duration}
            onChange={e => {
              const v = parseInt(e.target.value, 10)
              if (!isNaN(v) && v > 0) dispatch({ type: 'SET_TIMELINE', payload: { duration: v } })
            }}
            className="w-full bg-crumpet-bg border border-crumpet-border rounded px-3 py-1.5 text-white font-mono text-sm outline-none focus:border-crumpet-orange transition-colors"
          />
          {durationWarning && (
            <p className="text-crumpet-orange text-xs mt-1.5">
              Most AI video generating models do not support this length.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-crumpet-muted mb-1.5 uppercase tracking-wider">Frame Rate (fps)</label>
          <select
            value={timeline.fps}
            onChange={e => dispatch({ type: 'SET_TIMELINE', payload: { fps: parseInt(e.target.value, 10) } })}
            className="w-full bg-crumpet-bg border border-crumpet-border rounded px-3 py-1.5 text-white font-mono text-sm outline-none focus:border-crumpet-orange transition-colors appearance-none cursor-pointer"
          >
            {[24, 25, 30, 60].map(fps => (
              <option key={fps} value={fps}>{fps} fps</option>
            ))}
          </select>
          {fpsWarning && (
            <p className="text-crumpet-orange text-xs mt-1.5">
              Non-standard frame rate — most AI video models expect 24 or 25 fps.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Image Picker Popup ──

function ImagePickerPopup({ images, markerId, position, dispatch }) {
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        dispatch({ type: 'CLOSE_IMAGE_PICKER' })
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dispatch])

  return (
    <div
      ref={ref}
      className="absolute z-40 bg-[#1e1e1e] border border-crumpet-border rounded-lg shadow-2xl p-3 font-sans"
      style={{ left: position?.x ?? 0, top: position?.y ?? 0 }}
    >
      <p className="text-xs text-crumpet-muted uppercase tracking-wider mb-2">Assign image</p>
      {images.length === 0 ? (
        <p className="text-xs text-crumpet-orange italic">Drop images above first.</p>
      ) : (
        <div className="flex flex-wrap gap-2 max-w-[200px]">
          {images.map(img => (
            <button
              key={img.id}
              onClick={() =>
                dispatch({
                  type: 'ASSIGN_MARKER_IMAGE',
                  payload: { markerId, imageId: img.id },
                })
              }
              className="w-12 h-12 rounded border border-crumpet-border overflow-hidden hover:border-crumpet-orange transition-colors cursor-pointer"
              title={img.name}
            >
              <img src={img.dataUri} alt={img.name} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Transition Dropdown ──

function TransitionDropdown({ markerId, value, defaultTransitions, customTransitions, dispatch }) {
  const [customEditing, setCustomEditing] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (customEditing && inputRef.current) inputRef.current.focus()
  }, [customEditing])

  // Merge defaults + project-custom, deduplicated, preserving order
  const allOptions = useMemo(() => {
    const seen = new Set()
    const result = []
    for (const t of [...defaultTransitions, ...customTransitions]) {
      const v = t.trim()
      if (v && !seen.has(v)) { seen.add(v); result.push(v) }
    }
    return result
  }, [defaultTransitions, customTransitions])

  function handleChange(e) {
    const val = e.target.value
    if (val === '__custom__') {
      setCustomEditing(true)
      setCustomValue('')
    } else {
      dispatch({ type: 'SET_MARKER_TRANSITION', payload: { id: markerId, transition: val } })
    }
  }

  function confirmCustom() {
    const trimmed = customValue.trim()
    if (trimmed) {
      dispatch({ type: 'ADD_CUSTOM_TRANSITION', payload: { value: trimmed } })
      dispatch({ type: 'SET_MARKER_TRANSITION', payload: { id: markerId, transition: trimmed } })
    }
    setCustomEditing(false)
  }

  if (customEditing) {
    return (
      <input
        ref={inputRef}
        value={customValue}
        onChange={e => setCustomValue(e.target.value)}
        onBlur={confirmCustom}
        onKeyDown={e => {
          if (e.key === 'Enter') confirmCustom()
          if (e.key === 'Escape') setCustomEditing(false)
        }}
        placeholder="custom..."
        className="bg-crumpet-bg border border-crumpet-orange rounded px-1 py-0 text-[10px] font-mono text-white outline-none w-16"
      />
    )
  }

  return (
    <select
      value={value || ''}
      onChange={handleChange}
      className="bg-crumpet-bg border border-crumpet-border rounded px-1 py-0 text-[10px] font-mono text-crumpet-muted outline-none cursor-pointer hover:border-crumpet-orange transition-colors appearance-none max-w-[70px] truncate"
      title={value || 'No transition'}
    >
      <option value="">--</option>
      {allOptions.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
      <option value="__custom__">Custom...</option>
    </select>
  )
}

// ── App Settings Modal (Default Transitions) ──

function AppSettingsModal({ dispatch }) {
  const [transitions, setTransitions] = useState(loadDefaultTransitions)
  const [newValue, setNewValue] = useState('')
  const inputRef = useRef(null)

  function handleAdd() {
    const trimmed = newValue.trim()
    if (trimmed && !transitions.includes(trimmed)) {
      const updated = [...transitions, trimmed]
      setTransitions(updated)
      saveDefaultTransitions(updated)
    }
    setNewValue('')
    inputRef.current?.focus()
  }

  function handleRemove(val) {
    const updated = transitions.filter(t => t !== val)
    setTransitions(updated)
    saveDefaultTransitions(updated)
  }

  function handleReset() {
    setTransitions([...BUILTIN_TRANSITIONS])
    saveDefaultTransitions([...BUILTIN_TRANSITIONS])
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      onClick={() => dispatch({ type: 'CLOSE_APP_SETTINGS' })}
    >
      <div
        className="bg-[#1e1e1e] border border-crumpet-border rounded-lg shadow-2xl p-5 w-80 font-sans"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white text-sm font-semibold tracking-wide uppercase">Settings</h3>
          <button
            onClick={() => dispatch({ type: 'CLOSE_APP_SETTINGS' })}
            className="text-crumpet-muted hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="block text-xs text-crumpet-muted mb-2 uppercase tracking-wider">
            Default Transitions
          </label>
          <p className="text-[10px] text-[#555] mb-3">
            These options appear in every marker's transition dropdown across all projects.
          </p>

          <div className="flex flex-col gap-1.5 mb-3 max-h-40 overflow-y-auto">
            {transitions.map(t => (
              <div key={t} className="flex items-center justify-between bg-crumpet-bg rounded px-2 py-1 group">
                <span className="font-mono text-xs text-white">{t}</span>
                <button
                  onClick={() => handleRemove(t)}
                  className="opacity-0 group-hover:opacity-100 text-crumpet-muted hover:text-red-500 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {transitions.length === 0 && (
              <p className="text-[10px] text-[#555] italic">No defaults set.</p>
            )}
          </div>

          <div className="flex gap-1.5 mb-3">
            <input
              ref={inputRef}
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              placeholder="Add transition..."
              className="flex-1 bg-crumpet-bg border border-crumpet-border rounded px-2 py-1 text-white font-mono text-xs outline-none focus:border-crumpet-orange transition-colors"
            />
            <button
              onClick={handleAdd}
              disabled={!newValue.trim()}
              className="px-2 py-1 bg-crumpet-surface border border-crumpet-border rounded text-xs text-crumpet-muted hover:text-crumpet-orange disabled:opacity-30 transition-colors"
            >
              <Plus size={12} />
            </button>
          </div>

          <button
            onClick={handleReset}
            className="text-[10px] text-[#555] hover:text-crumpet-orange transition-colors"
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Timeline ──

function Timeline({ tab, state, dispatch, defaultTransitions }) {
  const containerRef = useRef(null)
  const textBoxAreaRef = useRef(null)
  const dragRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const tf = totalFrames(tab)
  const { duration, fps } = tab.timeline

  // Track actual container width for pixel-accurate layout
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    setContainerWidth(el.offsetWidth)
    return () => ro.disconnect()
  }, [])

  function handleTimelineClick(e) {
    if (dragRef.current) return
    // Ignore clicks shortly after a drag ended (safety net)
    if (dragRef.lastDragEnd && Date.now() - dragRef.lastDragEnd < 200) return
    const rect = containerRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const frame = pixelToFrame(px, rect.width, tab)
    dispatch({
      type: 'ADD_MARKER',
      payload: {
        frame,
        position: { x: Math.min(px, rect.width - 220), y: -80 },
      },
    })
  }

  function startDrag(e, markerId) {
    e.stopPropagation()
    dragRef.current = { markerId, active: true }

    function onMove(moveEvent) {
      if (!dragRef.current?.active) return
      const rect = containerRef.current.getBoundingClientRect()
      const px = moveEvent.clientX - rect.left
      const frame = pixelToFrame(px, rect.width, tab)
      dispatch({ type: 'MOVE_MARKER', payload: { id: markerId, frame } })
    }

    function onUp() {
      dragRef.current = null
      dragRef.lastDragEnd = Date.now()
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Generate tick marks
  const ticks = useMemo(() => {
    const result = []
    for (let s = 0; s <= duration; s++) {
      const frame = s * fps
      const pct = frameToPercent(frame, tab)
      result.push({ pct, label: `${s}s`, major: true, frame })
    }
    // Sub-second ticks at intervals
    const subInterval = fps >= 30 ? Math.round(fps / 4) : Math.round(fps / 2)
    for (let f = 0; f <= tf; f += subInterval) {
      const pct = frameToPercent(f, tab)
      if (!result.some(t => Math.abs(t.pct - pct) < 0.5)) {
        result.push({ pct, label: null, major: false, frame: f })
      }
    }
    return result
  }, [duration, fps, tf, tab])

  // Sort markers and compute text box layout (stacking)
  const sortedMarkers = useMemo(() => {
    return [...tab.markers].sort((a, b) => a.frame - b.frame)
  }, [tab.markers])

  const markerLayout = useMemo(() => {
    const BOX_W = TEXT_BOX_WIDTH_PX
    const GAP = 8 // minimum gap between boxes in px
    const layout = []
    // Track the right edge of the last box placed in each row (in px)
    const rowRightEdge = [-Infinity, -Infinity]

    for (const marker of sortedMarkers) {
      if (marker.collapsed) {
        layout.push({ ...marker, row: 0 })
        continue
      }
      const centerPx = (frameToPercent(marker.frame, tab) / 100) * containerWidth
      const leftPx = centerPx - BOX_W / 2

      // Pick the first row where this box doesn't overlap the last placed box
      if (leftPx >= rowRightEdge[0] + GAP) {
        layout.push({ ...marker, row: 0 })
        rowRightEdge[0] = leftPx + BOX_W
      } else if (leftPx >= rowRightEdge[1] + GAP) {
        layout.push({ ...marker, row: 1 })
        rowRightEdge[1] = leftPx + BOX_W
      } else {
        // Both rows occupied at this position — pick the one with the earlier edge
        const pickRow = rowRightEdge[0] <= rowRightEdge[1] ? 0 : 1
        layout.push({ ...marker, row: pickRow })
        rowRightEdge[pickRow] = leftPx + BOX_W
      }
    }
    return layout
  }, [sortedMarkers, tab, containerWidth])

  // Clamp text box so it stays fully within the container.
  // Returns { style, connectorLeft, isOffset } — only `style` goes on the DOM element.
  function clampTextBoxPosition(pct) {
    const halfBox = TEXT_BOX_WIDTH_PX / 2
    const markerPx = (pct / 100) * containerWidth

    if (markerPx < halfBox) {
      return {
        style: { left: '0px', transform: 'none' },
        connectorLeft: `${markerPx}px`,
        isOffset: true,
      }
    }
    if (markerPx > containerWidth - halfBox) {
      const leftPx = containerWidth - TEXT_BOX_WIDTH_PX
      return {
        style: { left: `${leftPx}px`, transform: 'none' },
        connectorLeft: `${markerPx - leftPx}px`,
        isOffset: true,
      }
    }
    return {
      style: { left: `${pct}%`, transform: 'translateX(-50%)' },
      connectorLeft: '50%',
      isOffset: false,
    }
  }

  return (
    <div className="relative">
      {/* Timeline ruler row with external clock icon */}
      <div className="flex items-center gap-2">
        <div
          ref={containerRef}
          onClick={handleTimelineClick}
          className="relative flex-1 h-12 bg-crumpet-surface border border-crumpet-border rounded cursor-crosshair select-none"
        >
          {/* Tick marks */}
          {ticks.map((tick, i) => (
            <div
              key={i}
              className="absolute top-0"
              style={{ left: `${tick.pct}%` }}
            >
              <div
                className={`w-px ${tick.major ? 'h-4 bg-[#555]' : 'h-2 bg-[#333]'}`}
              />
              {tick.major && tick.label && (
                <span
                  className="absolute top-4 text-[10px] font-mono text-crumpet-muted whitespace-nowrap"
                  style={{
                    left: tick.pct === 100 ? undefined : '0px',
                    right: tick.pct === 100 ? '0px' : undefined,
                    transform: tick.pct === 0 || tick.pct === 100 ? 'none' : 'translateX(-50%)',
                  }}
                >
                  {tick.label}
                </span>
              )}
            </div>
          ))}

          {/* Frame number at end */}
          <div className="absolute right-1.5 bottom-1 text-[9px] font-mono text-crumpet-muted">
            {tf}f
          </div>

          {/* Markers on ruler */}
          {sortedMarkers.map(marker => {
            const img = tab.images.find(i => i.id === marker.imageId)
            const pct = frameToPercent(marker.frame, tab)
            return (
              <div
                key={marker.id}
                className="absolute top-0 h-full z-10 group"
                style={{ left: `${pct}%` }}
                onClick={e => e.stopPropagation()}
              >
                {/* Marker line */}
                <div className="absolute top-0 bottom-0 w-0.5 bg-crumpet-orange -translate-x-1/2" />
                {/* Marker handle */}
                <div
                  onMouseDown={e => startDrag(e, marker.id)}
                  className="absolute -top-0.5 -translate-x-1/2 w-3 h-3 bg-crumpet-orange rounded-full cursor-grab active:cursor-grabbing border-2 border-crumpet-bg z-20 hover:scale-125 transition-transform"
                />
                {/* Image thumbnail on marker, or + button if none */}
                {img ? (
                  <div className="absolute top-3 -translate-x-1/2 w-6 h-6 rounded-sm border border-crumpet-border overflow-hidden pointer-events-none">
                    <img src={img.dataUri} alt={img.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <button
                    className="absolute top-3 -translate-x-1/2 w-6 h-6 rounded-sm border border-crumpet-border bg-crumpet-surface flex items-center justify-center text-crumpet-muted hover:text-crumpet-orange hover:border-crumpet-orange transition-colors z-10"
                    title="Assign image"
                    onClick={e => {
                      e.stopPropagation()
                      const rect = containerRef.current.getBoundingClientRect()
                      const px = e.clientX - rect.left
                      dispatch({
                        type: 'OPEN_IMAGE_PICKER',
                        payload: {
                          markerId: marker.id,
                          position: { x: Math.min(px, rect.width - 220), y: -80 },
                        },
                      })
                    }}
                  >
                    <Plus size={10} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Settings button — outside timeline */}
        <button
          onClick={() => dispatch({ type: 'OPEN_SETTINGS' })}
          className="flex-shrink-0 p-2 rounded text-crumpet-muted hover:text-crumpet-orange hover:bg-crumpet-surface transition-colors"
          title="Timeline settings"
        >
          <Clock size={16} />
        </button>
      </div>

      {/* Image picker popup */}
      {state.imagePickerMarkerId && (
        <ImagePickerPopup
          images={tab.images}
          markerId={state.imagePickerMarkerId}
          position={state.imagePickerPosition}
          dispatch={dispatch}
        />
      )}

      {/* Marker text boxes */}
      <div ref={textBoxAreaRef} className="relative mt-1">
        {markerLayout.map(marker => {
          const pct = frameToPercent(marker.frame, tab)
          const clamped = clampTextBoxPosition(pct)

          if (marker.collapsed) {
            return (
              <div
                key={marker.id}
                className="absolute"
                style={{ left: `${pct}%`, top: 0 }}
              >
                <div className="flex items-center gap-0.5 -translate-x-1/2">
                  <button
                    onClick={() => dispatch({ type: 'TOGGLE_MARKER_COLLAPSED', payload: { id: marker.id } })}
                    className="text-crumpet-muted hover:text-crumpet-orange transition-colors p-0.5"
                    title="Expand"
                  >
                    <ChevronDown size={12} />
                  </button>
                  <span className="text-[9px] font-mono text-crumpet-muted">f{marker.frame}</span>
                </div>
              </div>
            )
          }

          const ROW_OFFSET = 120
          const topOffset = marker.row === 1 ? ROW_OFFSET : 0

          return (
            <div
              key={marker.id}
              className="absolute"
              style={{
                ...clamped.style,
                top: `${topOffset}px`,
                width: `${TEXT_BOX_WIDTH_PX}px`,
              }}
            >
              {/* Connector line from marker pin to offset text box */}
              {(marker.row === 1 || clamped.isOffset) && (
                <div
                  className="absolute w-px bg-crumpet-border"
                  style={{
                    left: clamped.connectorLeft,
                    top: marker.row === 1 ? `${-ROW_OFFSET}px` : '-4px',
                    height: marker.row === 1 ? `${ROW_OFFSET}px` : '4px',
                    transform: 'translateX(-50%)',
                  }}
                />
              )}

              <div className="bg-crumpet-surface border border-crumpet-border rounded-md overflow-hidden">
                {/* Header — drag to move marker */}
                <div
                  className="flex items-center gap-1 px-2 py-1 bg-[#161616] border-b border-crumpet-border cursor-grab active:cursor-grabbing"
                  onMouseDown={e => {
                    if (e.target.closest('button, select, input, label')) return
                    startDrag(e, marker.id)
                  }}
                >
                  <label className="flex items-center gap-0.5 cursor-pointer" title="Include 'at frame N' in prompt">
                    <input
                      type="checkbox"
                      checked={marker.showFrameRef !== false}
                      onChange={() => dispatch({ type: 'TOGGLE_MARKER_FRAME_REF', payload: { id: marker.id } })}
                      className="w-2.5 h-2.5 accent-crumpet-orange cursor-pointer"
                    />
                    <span className="text-[9px] font-mono text-crumpet-muted">ref</span>
                  </label>
                  <span className="text-[10px] font-mono text-crumpet-muted">f{marker.frame}</span>
                  <div className="flex-1" />
                  <TransitionDropdown
                    markerId={marker.id}
                    value={marker.transition || ''}
                    defaultTransitions={defaultTransitions}
                    customTransitions={state.customTransitions}
                    dispatch={dispatch}
                  />
                  <button
                    onClick={() => dispatch({ type: 'TOGGLE_MARKER_COLLAPSED', payload: { id: marker.id } })}
                    className="text-crumpet-muted hover:text-crumpet-orange transition-colors"
                  >
                    <ChevronUp size={12} />
                  </button>
                </div>
                {/* Text area */}
                <textarea
                  value={marker.text}
                  onChange={e =>
                    dispatch({
                      type: 'UPDATE_MARKER_TEXT',
                      payload: { id: marker.id, text: e.target.value },
                    })
                  }
                  placeholder="Prompt text..."
                  rows={3}
                  className="w-full bg-transparent text-white font-mono text-xs p-2 outline-none resize-none placeholder:text-[#444]"
                />
                {/* Footer with delete */}
                <div className="flex justify-end px-2 py-1 border-t border-crumpet-border">
                  <button
                    onClick={() => dispatch({ type: 'REMOVE_MARKER', payload: { id: marker.id } })}
                    className="text-crumpet-muted hover:text-red-500 transition-colors"
                    title="Delete marker"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Marker count warning */}
      {tab.markers.length > 10 && (
        <p className="text-crumpet-orange text-xs mt-2 font-sans">
          More than 10 markers may not be supported by most AI video models.
        </p>
      )}
    </div>
  )
}

// ── Final Prompt Sidebar ──

function FinalPrompt({ tab }) {
  const [copied, setCopied] = useState(false)
  const prompt = useMemo(() => buildPrompt(tab), [tab])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = prompt
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-crumpet-border">
        <h2 className="text-xs font-sans font-semibold uppercase tracking-wider text-crumpet-muted">
          Final Prompt
        </h2>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-sans transition-colors duration-150 ${
            copied
              ? 'bg-green-900/40 text-green-400'
              : 'bg-crumpet-surface text-crumpet-muted hover:text-crumpet-orange border border-crumpet-border'
          }`}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {prompt ? (
          <pre className="font-mono text-sm text-white whitespace-pre-wrap break-words leading-relaxed">
            {prompt}
          </pre>
        ) : (
          <p className="text-crumpet-muted text-sm font-sans italic">
            Add markers and write prompts to see output here.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [state, dispatch] = useReducer(reducer, null, () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.tabs?.length > 0) {
          return {
            ...initialState,
            activeTabId: parsed.activeTabId,
            tabs: parsed.tabs,
            customTransitions: parsed.customTransitions || [],
          }
        }
      }
    } catch {}
    return getDefaultState()
  })

  // Persist to localStorage on every state change (excluding transient UI)
  useEffect(() => {
    try {
      const toSave = {
        activeTabId: state.activeTabId,
        tabs: state.tabs,
        customTransitions: state.customTransitions,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch {}
  }, [state.activeTabId, state.tabs, state.customTransitions])

  const [thumbSize, setThumbSize] = useState(DEFAULT_THUMB_SIZE)
  const [defaultTransitions, setDefaultTransitions] = useState(loadDefaultTransitions)

  const activeTab = state.tabs.find(t => t.id === state.activeTabId)

  if (!activeTab) return null

  return (
    <div className="h-screen w-screen flex flex-col bg-crumpet-bg text-white overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center bg-[#0a0a0a] border-b border-crumpet-border">
        <div className="flex-1 overflow-x-auto">
          <TabBar tabs={state.tabs} activeTabId={state.activeTabId} dispatch={dispatch} />
        </div>
        <button
          onClick={() => dispatch({ type: 'OPEN_APP_SETTINGS' })}
          className="flex-shrink-0 px-3 py-2.5 text-crumpet-muted hover:text-crumpet-orange transition-colors"
          title="Settings"
        >
          <Settings size={14} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4">
          {/* Image dropzone */}
          <ImageDropzone
            images={activeTab.images}
            dispatch={dispatch}
            thumbSize={thumbSize}
            onThumbSizeChange={setThumbSize}
          />

          {/* Prefix */}
          <div>
            <label className="block text-[10px] font-sans uppercase tracking-wider text-crumpet-muted mb-1">
              Prefix
            </label>
            <textarea
              value={activeTab.prefix}
              onChange={e => dispatch({ type: 'SET_PREFIX', payload: { text: e.target.value } })}
              placeholder="Prefix prompt (appears at start)..."
              rows={2}
              className="w-full bg-crumpet-surface border border-crumpet-border rounded-md px-3 py-2 text-white font-mono text-sm outline-none resize-none placeholder:text-[#444] focus:border-crumpet-orange transition-colors"
            />
          </div>

          {/* Timeline + Markers */}
          <div className="relative">
            <Timeline tab={activeTab} state={state} dispatch={dispatch} defaultTransitions={defaultTransitions} />
          </div>

          {/* Spacer for text boxes that overflow */}
          <div className="min-h-[280px]" />

          {/* Suffix */}
          <div>
            <label className="block text-[10px] font-sans uppercase tracking-wider text-crumpet-muted mb-1">
              Suffix
            </label>
            <textarea
              value={activeTab.suffix}
              onChange={e => dispatch({ type: 'SET_SUFFIX', payload: { text: e.target.value } })}
              placeholder="Suffix prompt (appears at end)..."
              rows={2}
              className="w-full bg-crumpet-surface border border-crumpet-border rounded-md px-3 py-2 text-white font-mono text-sm outline-none resize-none placeholder:text-[#444] focus:border-crumpet-orange transition-colors"
            />
          </div>
        </div>

        {/* Right sidebar — Final Prompt */}
        <div className="w-80 border-l border-crumpet-border bg-[#0d0d0d] flex-shrink-0">
          <FinalPrompt tab={activeTab} />
        </div>
      </div>

      {/* Footer credits */}
      <div className="flex-shrink-0 px-4 py-1.5 border-t border-crumpet-border flex items-center justify-between">
        <span className="text-[10px] font-sans text-[#444]">
          C.R.U.M.P.E.T. — Controlled Runtime for Unified Media Prompt Engineering and Timing <span className="text-[#333]">v1.0</span>
        </span>
        <span className="text-[10px] font-sans text-[#444]">
          &copy; 2026 <a href="https://albertbozesan.com/" target="_blank" rel="noopener noreferrer" className="text-[#9a5a1a] underline hover:text-crumpet-orange transition-colors">Albert Bozesan</a> for <a href="https://storybookstudios.ai/" target="_blank" rel="noopener noreferrer" className="text-[#9a5a1a] underline hover:text-crumpet-orange transition-colors">Storybook Studios</a>
        </span>
      </div>

      {/* Timeline settings modal */}
      {state.settingsOpen && (
        <TimelineSettingsModal timeline={activeTab.timeline} dispatch={dispatch} />
      )}

      {/* App settings modal */}
      {state.appSettingsOpen && (
        <AppSettingsModal
          dispatch={(action) => {
            dispatch(action)
            if (action.type === 'CLOSE_APP_SETTINGS') {
              setDefaultTransitions(loadDefaultTransitions())
            }
          }}
        />
      )}
    </div>
  )
}

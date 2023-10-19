import './index.css'
import '@logseq/libs'
import { render } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  ArrowsClockwise,
  Books,
  Faders,
  FileAudio,
  Folder,
  Images,
  ListMagnifyingGlass,
  Prohibit
} from '@phosphor-icons/react'
import { MoonLoader } from 'react-spinners'
import { LSPluginBaseInfo } from '@logseq/libs/dist/LSPlugin'
import normalizePath from 'normalize-path'
import { setup as l10nSetup, t } from 'logseq-l10n' //https://github.com/sethyuan/logseq-l10n
import ja from './translations/ja.json'
import zhCN from './translations/zh-CN.json'
import zhHant from './translations/zh-Hant.json'
import ko from './translations/ko.json'

const imageFormats = ['png', 'jpg', 'jpeg', 'webp', 'gif']
const bookFormats = ['pdf']
const videoFormats = ['mp4']
const audioFormats = ['mp3']

const tabTypes = {
  'books': bookFormats,
  'audios': audioFormats,
  'images': imageFormats
}

const makeMdAssetLink = ({
  name, path, normalizePath, extname
}) => {
  if (!name || !path) return
  path = normalizePath.split('/assets/')?.[1]
  if (!path) return

  const isSupportedRichExt = [...imageFormats, ...bookFormats, ...audioFormats, ...videoFormats]
    .includes(extname?.toLowerCase())

  return `${isSupportedRichExt ? '!' : ''}[${name}](assets/${path})`
}

function App() {
  const elRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [data, setData] = useState([])
  const [_dataDirty, setDataDirty] = useState(false)
  const [currentListData, setCurrentListData] = useState([])
  const [activeItemIdx, setActiveItemIdx] = useState(0)
  const tabs = ['all', 'books', 'images', 'audios']
  const [activeTab, setActiveTab] = useState(tabs[0])
  const [activeSettings, setActiveSettings] = useState(false)
  // const [asFullFeatures, setAsFullFeatures] = useState(false)

  // normalize item data
  const normalizeDataItem = (it) => {
    if (!it.path) return

    // TODO: with relative full path
    it.normalizePath = normalizePath(it.path)
    it.name = it.normalizePath && it.normalizePath.substring(it.normalizePath.lastIndexOf('/') + 1)

    if (it.name?.startsWith('.')) {
      return
    }

    if (typeof it.name === 'string') {
      it.originalName = it.name
      it.name = it.name.replace(/[0-9_]{5,}(\.|$)/g, '$1')
      const extDotLastIdx = it.name.lastIndexOf('.')
      if (extDotLastIdx !== -1) {
        it.extname = it.name.substring(extDotLastIdx + 1)
      }
    }

    if (typeof it.size === 'number') {
      it.size = (it.size / 1024).toFixed(2)
      if (it.size > 999) {
        it.size = (it.size / 1024).toFixed(2)
        it.size += 'MB'
      } else {
        it.size += 'KB'
      }
    }

    if (typeof it.modifiedTime === 'number') {
      it.formatModifiedTime = (new Date(it.modifiedTime)).toLocaleString()
    }

    return it
  }

  // is full features pane
  const isAsFullFeatures = () => document.body.classList.contains('as-full')

  const resetActiveIdx = () => setActiveItemIdx(0)
  const upActiveIdx = () => {
    setCurrentListData((currentListData) => {
      setActiveItemIdx((activeItemIdx) => {
        if (!currentListData?.length) return 0
        let toIdx = activeItemIdx - 1
        if (toIdx < 0) toIdx = currentListData?.length - 1
        return toIdx
      })
      return currentListData
    })
  }
  const downActiveIdx = () => {
    setCurrentListData((currentListData) => {
      setActiveItemIdx((activeItemIdx) => {
        if (!currentListData?.length) return 0
        let toIdx = activeItemIdx + 1
        if (toIdx >= currentListData?.length) toIdx = 0
        return toIdx
      })
      return currentListData
    })
  }

  const closeUI = (opts: any = {}) => {
    logseq.hideMainUI(opts)
    setVisible(false)
    setActiveTab('all')
    resetActiveIdx()
    setInputValue('')
    document.body.classList.remove('as-full')
  }

  // load all assets data
  const doPrepareData = async () => {
    if (preparing) return
    setPreparing(true)
    const data = await logseq.Assets.listFilesOfCurrentGraph()
    data?.sort((a, b) => (b.modifiedTime || 0) - (a.modifiedTime || 0))
    setData(data?.map(normalizeDataItem).filter(it => !!it))
    setPreparing(false)
  }

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const handleClick = (e: MouseEvent) => {
      // check popup existed
      if (activeSettings) {
        setActiveSettings(false)
        return
      }

      const target = e.target as HTMLElement
      if (target && el.contains(target)) return
      closeUI()
    }

    const handleKeyup = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inputValue !== '') {
          return setInputValue('')
        }

        closeUI({ restoreEditingCursor: true })
        return
      }

      if (e.ctrlKey && e.key === 'Tab') {
        const activeTabIdx = tabs.findIndex((v) => v === activeTab)
        let toIdx = activeTabIdx + 1
        // move tab
        if (toIdx >= tabs.length) toIdx = 0
        if (toIdx < 0) toIdx = (tabs.length - 1)
        setActiveTab(tabs[toIdx])
      }
    }

    document.addEventListener('keyup', handleKeyup, false)
    document.addEventListener('click', handleClick, false)

    return () => {
      document.removeEventListener('keyup', handleKeyup)
      document.removeEventListener('click', handleClick)
    }
  }, [inputValue, activeTab, activeSettings])

  useEffect(() => {
    logseq.on('ui:visible:changed', ({ visible }) => {
      if (visible) {
        setVisible(true)
        setDataDirty((dirty) => {
          if (dirty) {
            doPrepareData().catch(null)
            return false
          }
        })
      }
    })

    // TODO: teardown
    logseq.App.onCurrentGraphChanged(() => {
      setDataDirty(true)
      closeUI()
    })

    setVisible(true)
    doPrepareData().catch(console.error)

    // global keydown for move active item
    const handleKeydown = (e: KeyboardEvent) => {
      const key = e.code
      const isCtrlKey = e.ctrlKey
      const isArrowUp = key === 'ArrowUp' || (isCtrlKey && key === 'KeyP')
      const isArrowDown = key === 'ArrowDown' || (isCtrlKey && key === 'KeyN')
      console.log('keydown', key, isArrowUp, isArrowDown)
      if (isArrowDown || isArrowUp) {
        isArrowDown ?
          downActiveIdx() :
          upActiveIdx()
      }
    }

    document.addEventListener('keydown', handleKeydown, false)
    return () => {
      document.removeEventListener('keydown', handleKeydown)
    }
  }, [])

  // search
  useEffect(() => {
    resetActiveIdx()

    const typedData = data.filter(it => {
      const activeTypes = tabTypes[activeTab]

      if (activeTypes && !activeTypes.includes(it.extname?.toLowerCase())) {
        return
      }

      return true
    })

    if (!inputValue?.trim()) {
      setCurrentListData(typedData?.slice(0, 32))
      return
    }

    // Unicode / universal (50%-75% slower)
    const fuzzy = new window.uFuzzy({
      unicode: true,
      interSplit: '[^\\p{L}\\d\']+',
      intraSplit: '\\p{Ll}\\p{Lu}',
      intraBound: '\\p{L}\\d|\\d\\p{L}|\\p{Ll}\\p{Lu}',
      intraChars: '[\\p{L}\\d\']',
      intraContr: '\'\\p{L}{1,2}\\b',
    })
    const result = fuzzy.search(typedData.map(it => it.name), inputValue)

    if (!result?.[1]) return
    const { idx, ranges } = result[1]
    setCurrentListData(idx?.map((idx, n) => {
      const r = typedData[idx]
      r.ranges = ranges[n]
      return r
    })?.slice(0, 32))
  }, [data, inputValue, activeTab])

  // focus active item in view
  useEffect(() => {
    const el = elRef.current
    const listEl = el?.querySelector('.search-input-list')
    if (!el) return
    const activeItem = el.querySelector(`[data-index="${activeItemIdx}"]`)
    if (!activeItem) return
    const activeItemRect = activeItem.getBoundingClientRect()
    const elRect = listEl.getBoundingClientRect()
    const { height: itemHeight } = activeItemRect
    const { height: elHeight } = elRect
    const { top: itemTop } = activeItemRect
    const { top: elTop } = elRect
    const itemBottom = itemTop + itemHeight
    const elBottom = elTop + elHeight

    const isInView = itemTop >= elTop && itemBottom <= elBottom

    if (!isInView) {
      // using scroll into view
      activeItem.scrollIntoView({
        block: 'center',
      })
    }
  }, [activeItemIdx])

  const onSelect = (activeItem: any) => {
    if (!activeItem) return
    const asFullFeatures = isAsFullFeatures()

    if (asFullFeatures) {
      logseq.App.openPath(activeItem.path)
      return
    }

    closeUI()
    setInputValue('')

    logseq.Editor.insertAtEditingCursor(
      makeMdAssetLink(activeItem)
    )
  }

  return (
    <div className={'search-input-container animate__animated' + (visible ? ' animate__defaultIn' : '')}
         ref={elRef}
    >
      <div className="search-input-head">
        <span className={'icon-wrap'}>
          <ListMagnifyingGlass size={28} weight={'duotone'}/>
        </span>
        <span className={'input-wrap'} title={t('Search by keyword or extension')}>
          <input placeholder={t('Search local assets for current graph')}
                 value={inputValue}
                 onKeyDown={(e) => {
                   const key = e.code
                   const isCtrlKey = e.ctrlKey
                   const isArrowUp = key === 'ArrowUp' || (isCtrlKey && key === 'KeyP')
                   const isArrowDown = key === 'ArrowDown' || (isCtrlKey && key === 'KeyN')
                   const isTab = key === 'Tab'

                   if (isTab) {
                     e.preventDefault()
                     const activeTabIdx = tabs.findIndex((v) => v === activeTab)
                     let toIdx = activeTabIdx + 1
                     // move tab
                     if (toIdx >= tabs.length) toIdx = 0
                     if (toIdx < 0) toIdx = (tabs.length - 1)
                     setActiveTab(tabs[toIdx])
                     return
                   }

                   if (isArrowDown || isArrowUp) {
                     isArrowDown ?
                       downActiveIdx() :
                       upActiveIdx()

                     e.stopPropagation()
                     e.preventDefault()
                   }
                 }}

                 onKeyUp={(e) => {
                   if (e.key === 'Enter') {
                     e.preventDefault()
                     const activeItem = currentListData?.[activeItemIdx]
                     onSelect(activeItem)
                     return
                   }
                 }}
                 onChange={e => {
                   setInputValue(e.target.value)
                 }}
          />
        </span>
      </div>

      {/* tabs */}
      <ul className="search-input-tabs">
        <li className={activeTab === 'all' && 'active'} tabIndex={0}
            onClick={() => setActiveTab('all')}>
          <strong>{t('All')}</strong>
          <code>{data?.length || 0}</code>
        </li>

        <li className={activeTab === 'books' && 'active'} tabIndex={0}
            onClick={() => setActiveTab('books')}>
          <Books size={18} weight={'duotone'}/>
          <strong>{t('Books')}</strong>
        </li>

        <li className={activeTab === 'images' && 'active'} tabIndex={0}
            onClick={() => setActiveTab('images')}>
          <Images size={18} weight={'duotone'}/>
          <strong>{t('Images')}</strong>
        </li>

        <li className={activeTab === 'audios' && 'active'} tabIndex={0}
            onClick={() => setActiveTab('audios')}>
          <FileAudio size={18} weight={'duotone'}/>
          <strong>{t('Audios')}</strong>
        </li>

        {/* settings */}
        <li className={'settings-dropdown'}>
          <span onClick={() => {
            setActiveSettings(!activeSettings)
          }}>
            <Faders size={18} weight={'bold'}/>
          </span>

          {activeSettings && (
            <div className="settings-dropdown-content">
              <div className="item as-link" onClick={doPrepareData}>
                <span><ArrowsClockwise size={17} weight={'bold'}/></span>
                <strong>{t('Reload assets')}</strong>
              </div>
            </div>
          )}
        </li>
      </ul>

      {/* items */}
      <ul className={'search-input-list'}>
        {preparing ?
          <li className={'loading'}>
            <MoonLoader size={18}/>
          </li> :
          (!currentListData?.length ?
            <li className={'nothing'}>
              <Prohibit size={16}/> {t('No results')}
            </li> :
            (currentListData?.map((it, idx) => {
              let name = it.name

              if (it.ranges?.length && inputValue?.length) {
                const ranges = it.ranges.map((range, n) => {
                  if (n === 0) return name.substring(0, range)
                  const ret = name.substring(it.ranges[n - 1], range)
                  return n % 2 === 0 ? ret : `<marker>${ret}</marker>`
                })

                const lastIdx = it.ranges[it.ranges.length - 1]

                if (lastIdx < name.length) {
                  ranges.push(name.substring(lastIdx))
                }

                name = ranges.join('')
              }

              return (
                <li key={it.path} title={t('Insert this asset into the current block at the cursor position')}
                    data-index={idx}
                    className={idx === activeItemIdx && 'active'}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(it)
                    }}
                >
                  <div className="l">{it.extname?.toUpperCase()}</div>
                  <div className="r">
                    <strong
                      title={it.originalName}
                      dangerouslySetInnerHTML={{ __html: name }}></strong>
                    <p>
                      {it.size} • {t('Modified')} {it.formatModifiedTime}
                    </p>

                    <span className="ctrls" title={t('Open the folder on OS')}>
                      <a onClick={(e) => {
                        logseq.App.showItemInFolder(it.path)
                        e.stopPropagation()
                      }}>
                        <Folder size={18} weight={'duotone'}/>
                      </a>
                    </span>
                  </div>
                </li>
              )
            })))}
      </ul>
    </div>
  )
}

let mounted = false

function mount() {
  if (mounted) return

  render(<App/>, document.getElementById('app'))
  mounted = true
}

async function showPicker() {
  const container = document.querySelector('.search-input-container') as HTMLDivElement
  const {
    left,
    top,
    rect,
  } = (await logseq.Editor.getEditingCursorPosition() || {
    left: 0, top: 0, rect: null
  })

  const cls = document.body.classList
  cls.remove('as-full')
  if (!rect) {cls.add('as-full')}

  Object.assign(container.style, rect ? {
    top: top + rect.top + 'px',
    left: left + rect.left + 4 + 'px',
    transform: 'unset'
  } : {
    left: '50%',
    top: '15%',
    transform: 'translate3d(-50%, 0, 0)'
  })

  logseq.showMainUI()

  // focus input
  setTimeout(() => {
    container.querySelector('input')?.select()
  }, 100)
}

function main(_baseInfo: LSPluginBaseInfo) {
  (async () => {
    await l10nSetup({ builtinTranslations: { ja, 'zh-CN': zhCN, 'zh-Hant': zhHant, ko } }) // logseq-l10n
  })()
  const open: any = () => {
    mount()
    return setTimeout(showPicker, 0)
  }

  logseq.Editor.registerSlashCommand('Insert a local asset file', open)
  logseq.App.registerCommandPalette({
    key: 'logseq-assets-plus',
    label: t('Assets Plus: open picker'),
    keybinding: { binding: 'mod+shift+o' }
  }, open)

  // themes
  const loadThemeVars = async () => {
    const props = [
      '--ls-primary-background-color',
      '--ls-secondary-background-color',
      '--ls-tertiary-background-color',
      '--ls-quaternary-background-color',
      '--ls-active-primary-color',
      '--ls-active-secondary-color',
      '--ls-border-color',
      '--ls-secondary-border-color',
      '--ls-tertiary-border-color',
      '--ls-primary-text-color',
      '--ls-secondary-text-color',
      '--ls-block-highlight-color'
    ]

    // @ts-ignore
    const vals = await logseq.UI.resolveThemeCssPropsVals(props)
    if (!vals) return
    const style = document.body.style
    Object.entries(vals).forEach(([k, v]) => {
      style.setProperty(k, v as string)
    })
  }
  const setThemeMode = (mode: string) => {
    document.documentElement.dataset.theme = mode
  }

  logseq.App.onThemeChanged(() => {
    setTimeout(loadThemeVars, 100)
  })

  logseq.App.onThemeModeChanged((t) => {
    setTimeout(loadThemeVars, 100)
    setThemeMode(t.mode)
  })

  logseq.on('ui:visible:changed', ({ visible }) => {
    if (visible) loadThemeVars().catch(console.error)
  })

  setTimeout(() => {
    logseq.App.getUserConfigs().then(t => {
      setThemeMode(t.preferredThemeMode)
    })
  }, 100)
}

logseq.ready(main).catch(console.error)
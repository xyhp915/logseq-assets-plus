import './index.css'
import 'react-virtualized/styles.css'
import '@logseq/libs'
import { render } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import cx from 'classnames'
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
import { AutoSizer, List } from 'react-virtualized'
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
const documentFormats = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'md', 'txt', 'html', 'htm', 'csv']
const videoFormats = ['mp4', 'avi', 'mov', 'wmv', 'flv', '3gp', 'mpeg', 'mpg', 'ts', 'm4v']
const audioFormats = ['mp3', 'wav', 'ogg', 'flac', 'wma']

const tabTypes = {
  'documents': [...bookFormats, ...documentFormats],
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

// TODO: use react-virtualized
function ResultList({ data, inputValue, activeItemIdx, onSelect }) {
  if (!data?.length) return (
    <div className={'nothing'}>
      <Prohibit size={16}/>
      <p>{t('No results')}</p>
    </div>)

  const rowRenderer = ({ index, key, style }) => {
    const it = data[index]
    let name = it.name

    // highlight matched text
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
      <div key={key}
           style={style}
           title={t('Insert this asset at the cursor position. If that position doesn\'t exist, open this file on the OS.')}
           data-index={index}
           className={cx('list-item', index === activeItemIdx && 'active')}
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

          <span className="ctrls" title={t('Open the folder with the OS')}>
            <a onClick={(e) => {
              logseq.App.showItemInFolder(it.path)
              e.stopPropagation()
            }}>
              <Folder size={18} weight={'duotone'}/>
            </a>
          </span>
        </div>
      </div>
    )
  }

  // TODO: dynamic size for responsive
  const listContainerSize = {
    width: 620,
    height: 500
  }

  return (
    <List className={'search-input-list'}
          autoWidth={true}
          rowCount={data.length}
          rowHeight={60}
          rowRenderer={rowRenderer}
          {...listContainerSize}
    ></List>
  )
}

// normalize item data
function normalizeDataItem(it) {
  if (!it.path) return

  // TODO: with relative full path
  it.normalizePath = normalizePath(it.path)
  it.name = it.normalizePath && it.normalizePath.substring(it.normalizePath.lastIndexOf('/') + 1)

  if (it.name?.startsWith('.')) {
    return
  }

  if (typeof it.name === 'string') {
    it.originalName = it.name
    it.name = it.name.length > 32 ? it.name.replace(/[0-9_.]{5,}(\.|$)/g, '$1') : it.name
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

function App() {
  const elRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [data, setData] = useState([])
  const [_dataDirty, setDataDirty] = useState(false)
  const [currentListData, setCurrentListData] = useState([])
  const [activeItemIdx, setActiveItemIdx] = useState(0)
  const tabs = ['all', 'documents', 'images', 'audios']
  const [activeTab, setActiveTab] = useState(tabs[0])
  const [activeSettings, setActiveSettings] = useState(false)
  const hasInputValue = !!inputValue?.trim()
  const isAllTab = activeTab === 'all'
  const isDocumentsTab = activeTab === 'documents'
  const isImagesTab = activeTab === 'images'
  const isAudiosTab = activeTab === 'audios'

  // const [asFullFeatures, setAsFullFeatures] = useState(false)

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

  // select item
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
        const isShift = e.shiftKey
        const activeTabIdx = tabs.findIndex((v) => v === activeTab)
        let toIdx = activeTabIdx + (isShift ? -1 : 1)
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

    if (!hasInputValue) {
      setCurrentListData(typedData)
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
    }))
  }, [data, inputValue, activeTab])

  // focus active item in view
  useEffect(() => {
    const el = elRef.current
    const listWrapEl = el?.querySelector('.search-input-list-wrap')
    const listWrapInnerEl = el?.querySelector('.search-input-list-wrap > .ReactVirtualized__List')
    if (!el) return
    if (activeItemIdx === 0) {
      listWrapInnerEl?.scrollTo(0, 0)
      return
    }
    const activeItem = el.querySelector(`[data-index="${activeItemIdx}"]`)
    if (!activeItem) return
    const activeItemRect = activeItem.getBoundingClientRect()
    const elRect = listWrapEl.getBoundingClientRect()
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

                   if (isTab && !isCtrlKey) {
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
        <li className={isAllTab && 'active'} tabIndex={0}
            onClick={() => setActiveTab('all')}>
          <strong>{t('All')}</strong>
          <code>{(hasInputValue && isAllTab) ? currentListData?.length : (data?.length || 0)}</code>
        </li>

        <li className={isDocumentsTab && 'active'} tabIndex={0}
            onClick={() => setActiveTab('documents')}>
          <Books size={18} weight={'duotone'}/>
          <strong>{t('Documents')}</strong>
          {isDocumentsTab && (<code>{currentListData?.length}</code>)}
        </li>

        <li className={activeTab === 'images' && 'active'} tabIndex={0}
            onClick={() => setActiveTab('images')}>
          <Images size={18} weight={'duotone'}/>
          <strong>{t('Images')}</strong>
          {isImagesTab && (<code>{currentListData?.length}</code>)}
        </li>

        <li className={activeTab === 'audios' && 'active'} tabIndex={0}
            onClick={() => setActiveTab('audios')}>
          <FileAudio size={18} weight={'duotone'}/>
          <strong>{t('Audios')}</strong>
          {isAudiosTab && (<code>{currentListData?.length}</code>)}
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

      {/* results */}
      <div className={'search-input-list-wrap'}>
        {preparing ?
          <p className={'loading'}>
            <MoonLoader size={18}/>
          </p> :
          (<ResultList
            data={currentListData}
            inputValue={inputValue}
            activeItemIdx={activeItemIdx}
            onSelect={onSelect}/>)}
      </div>
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
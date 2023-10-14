import './index.css'
import '@logseq/libs'
import { render } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Books, Gear, Images, ListMagnifyingGlass, Prohibit, Video } from '@phosphor-icons/react'
import { MoonLoader } from 'react-spinners'

const imageFormats = ['png', 'jpg', 'jpeg', 'webp', 'gif']
const bookFormats = ['pdf']
const videoFormats = ['mp4']

const makeMdAssetLink = ({
  name, path, extname
}) => {
  if (!name || !path) return
  path = path.split('/assets/')?.[1]
  if (!path) return

  const isSupportedRichExt = [...imageFormats, ...bookFormats].includes(extname?.toLowerCase())

  return `${isSupportedRichExt ? '!' : ''}[${name}](assets/${path})`
}

function App () {
  const elRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [data, setData] = useState([])
  const [currentListData, setCurrentListData] = useState([])
  const [activeIdx, setActiveIdx] = useState(0)
  // const [asFullFeatures, setAsFullFeatures] = useState(false)

  // normalize item data
  const normalizeDataItem = (it) => {
    it.name = it.path && it.path.substring(it.path.lastIndexOf('/') + 1)

    if (typeof it.name === 'string') {
      it.name = it.name.replace(/_\d+/, '')
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
    return it
  }

  // is full features pane
  const isAsFullFeatures = () => document.body.classList.contains('as-full')

  const closeUI = (opts: any = {}) => {
    logseq.hideMainUI(opts)
    setVisible(false)
    document.body.classList.remove('as-full')
  }

  const resetActiveIdx = () => setActiveIdx(0)
  const upActiveIdx = () => {
    if (!currentListData?.length) return
    let toIdx = activeIdx - 1
    if (toIdx < 0) toIdx = currentListData?.length - 1
    setActiveIdx(toIdx)
  }

  const downActiveIdx = () => {
    if (!currentListData?.length) return
    let toIdx = activeIdx + 1
    if (toIdx >= currentListData?.length) toIdx = 0
    setActiveIdx(toIdx)
  }

  // load all assets data
  const doPrepareData = async () => {
    if (preparing) return
    setPreparing(true)
    const data = await logseq.Assets.listFilesOfCurrentGraph()
    await new Promise(r => setTimeout(r, 300))
    setData(data?.map(normalizeDataItem))
    setPreparing(false)
  }

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target && el.contains(target)) return
      closeUI()
    }

    const handleESC = (e: KeyboardEvent) => {
      if (e.which === 27) {
        if (inputValue !== '') {
          return setInputValue('')
        }

        closeUI({ restoreEditingCursor: true })
      }
    }

    document.addEventListener('keyup', handleESC, false)
    document.addEventListener('click', handleClick, false)

    resetActiveIdx()

    return () => {
      document.removeEventListener('keyup', handleESC)
      document.removeEventListener('click', handleClick)
    }
  }, [inputValue])

  useEffect(() => {
    logseq.on('ui:visible:changed', ({ visible }) => {
      if (visible) setVisible(true)
    })

    setVisible(true)
    doPrepareData().catch(console.error)
  }, [])

  // search
  useEffect(() => {
    if (!inputValue?.trim()) {
      setCurrentListData(data?.slice(0, 5))
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
    const result = fuzzy.search(data.map(it => it.name), inputValue)
    if (!result?.[1]) return
    const { idx, start } = result[1]
    setCurrentListData(idx?.map(idx => data[idx])?.slice(0, 8))
  }, [data, inputValue])

  return (
    <div className={'search-input-container animate__animated' + (visible ? ' animate__defaultIn' : '')} ref={elRef}>
      <div className="search-input-head">
        <span className={'icon-wrap'}>
          <ListMagnifyingGlass size={28} weight={'duotone'}/>
        </span>
        <span className={'input-wrap'}>
          <input placeholder={'Search assets'}
                 value={inputValue}
                 onKeyDown={(e) => {
                   const key = e.key
                   const isArrowUp = key === 'ArrowUp'
                   const isArrowDown = key === 'ArrowDown'
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
                     const activeItem = currentListData?.[activeIdx]
                     if (!activeItem) return
                     const asFullFeatures = isAsFullFeatures()

                     closeUI()
                     setInputValue('')

                     if (asFullFeatures) {
                       return logseq.UI.showMsg(`DEBUG://${JSON.stringify(activeItem)}`)
                     }

                     logseq.Editor.insertAtEditingCursor(
                       makeMdAssetLink(activeItem)
                     )
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
        <li className={'active'} tabIndex={0}>
          <strong>All</strong>
          <code>{data?.length || 0}</code>
        </li>

        <li tabIndex={0}>
          <Images size={18} weight={'duotone'}/>
          <strong>Images</strong>
        </li>

        <li tabIndex={0}>
          <Books size={18} weight={'duotone'}/>
          <strong>Books</strong>
        </li>

        <li tabIndex={0}>
          <Video size={18} weight={'duotone'}/>
          <strong>Videos</strong>
        </li>

        <li className={'more'}>
          <span>
            <Gear size={18} weight={'bold'}/>
          </span>
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
              <Prohibit size={16}/> No results
            </li> :
            (currentListData?.map((it, idx) => {
              return (
                <li key={it.path} className={idx === activeIdx && 'active'}>
                  <div className="l">{it.extname?.toUpperCase()}</div>
                  <div className="r">
                    <strong>{it.name}</strong>
                    <p>
                      {it.size} • Modified 2023/09/01 12:34
                    </p>
                  </div>
                </li>
              )
            })))}
      </ul>
    </div>
  )
}

let mounted = false

function mount () {
  if (mounted) return

  render(<App/>, document.getElementById('app'))
  mounted = true
}

async function showPicker () {
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

function main () {
  const open: any = () => {
    mount()
    return setTimeout(showPicker, 0)
  }

  logseq.Editor.registerSlashCommand('Insert an asset file', open)
  logseq.App.registerCommandPalette({
    key: 'logseq-assets-plus',
    label: 'Assets Plus: open picker',
    keybinding: { binding: 'ctrl+shift+o' }
  }, open)
}

logseq.ready(main).catch(console.error)
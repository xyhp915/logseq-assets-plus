import '@logseq/libs'
import { render } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

import './index.css'
import { Books, Gear, Images, ListMagnifyingGlass, Video } from '@phosphor-icons/react'
import { MoonLoader } from 'react-spinners'

function App () {
  const elRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [data, setData] = useState([])
  let currentListData = data?.slice(0, 5)

  // normalize item data
  const normalizeDataItem = (it) => {
    it.name = it.path && it.path.substring(it.path.lastIndexOf('/') + 1)
    it.name = (typeof it.name === 'string') && it.name.replace(/_\d+/, '')
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

  const closeUI = (opts: any = {}) => {
    logseq.hideMainUI(opts)
    setVisible(false)
  }

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

  return (
    <div className={'search-input-container animate__animated' + (visible ? ' animate__defaultIn' : '')} ref={elRef}>
      <div className="search-input-head">
        <span className={'icon-wrap'}>
          <ListMagnifyingGlass size={28} weight={'duotone'}/>
        </span>
        <span className={'input-wrap'}>
          <input placeholder={'Search assets'}
                 value={inputValue}
                 onChange={e => setInputValue(e.value)}
          />
        </span>
      </div>

      {/* tabs */}
      <ul className="search-input-tabs">
        <li className={'active'} tabIndex={0}>
          <strong>All</strong>
          <code>98</code>
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
            <MoonLoader size={20} />
          </li> :
          (currentListData?.map(it => {
            return (
              <li key={it.path}>
                <div className="l">x</div>
                <div className="r">
                  <strong>{it.name}</strong>
                  <p>
                    {it.size} • Modified 2023/09/01 12:34
                  </p>
                </div>
              </li>
            )
          }))}
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
    container.querySelector('input')?.focus()
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
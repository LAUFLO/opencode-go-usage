import { For, Show, createSignal, onCleanup, onMount } from "solid-js"
import { Portal } from "solid-js/web"

export type SelectOption = { value: string; label: string }

export function Select(props: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  title?: string
  width?: string
  dark?: boolean
}) {
  const [open, setOpen] = createSignal(false)
  const [position, setPosition] = createSignal({ left: 0, top: 0, width: 0 })
  let root: HTMLDivElement | undefined
  let menu: HTMLDivElement | undefined

  const dark = () => props.dark === true

  const toggle = () => {
    if (!open() && root) {
      const box = root.getBoundingClientRect()
      const width = Math.max(120, box.width)
      const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8))
      const below = box.bottom + 4
      const top = below + 240 > window.innerHeight ? Math.max(8, box.top - 244) : below
      setPosition({ left, top, width: box.width })
    }
    setOpen((value) => !value)
  }

  const onPointerDown = (event: MouseEvent) => {
    const target = event.target as Node
    if (root?.contains(target) || menu?.contains(target)) return
    setOpen(false)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") setOpen(false)
  }
  const onScroll = () => setOpen(false)

  onMount(() => {
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("resize", onScroll)
    window.addEventListener("scroll", onScroll, true)
  })
  onCleanup(() => {
    document.removeEventListener("mousedown", onPointerDown)
    document.removeEventListener("keydown", onKeyDown)
    window.removeEventListener("resize", onScroll)
    window.removeEventListener("scroll", onScroll, true)
  })

  const current = () => props.options.find((item) => item.value === props.value)?.label ?? props.value
  const menuWidth = () => Math.max(120, position().width)

  const triggerStyle = () =>
    `height:30px;box-sizing:border-box;padding:0 10px;border-radius:8px;border:none;background:${
      dark() ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"
    };color:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0;`

  const menuStyle = () =>
    `position:fixed;z-index:100;left:${position().left}px;top:${position().top}px;min-width:${menuWidth()}px;max-width:280px;max-height:300px;overflow-y:auto;padding:6px;border-radius:12px;border:1px solid ${
      dark() ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.07)"
    };background:${dark() ? "#1f1f1f" : "#ffffff"};color:${
      dark() ? "#ededed" : "#111111"
    };box-shadow:0 8px 24px ${dark() ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.14)"};`

  const optionStyle = (active: boolean) =>
    `display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:7px 8px;border:none;border-radius:7px;background:${
      active ? (dark() ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)") : "transparent"
    };color:inherit;font-size:12px;cursor:pointer;white-space:nowrap;overflow:hidden;`

  return (
    <div ref={root} style={`position:relative;flex-shrink:0;${props.width ? `width:${props.width};` : ""}`}>
      <button type="button" title={props.title} onClick={toggle} style={triggerStyle()}>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{current()}</span>
        <span
          style={`opacity:0.45;font-size:9px;line-height:1;transition:transform .15s ease;transform:rotate(${open() ? 180 : 0}deg);`}
        >
          ▾
        </span>
      </button>
      <Show when={open()}>
        <Portal>
          <div ref={menu} style={menuStyle()}>
            <For each={props.options}>
              {(option) => (
                <button
                  type="button"
                  title={option.label}
                  onClick={() => {
                    props.onChange(option.value)
                    setOpen(false)
                  }}
                  style={optionStyle(option.value === props.value)}
                >
                  <span style="flex:1;overflow:hidden;text-overflow:ellipsis;">{option.label}</span>
                  <Show when={option.value === props.value}>
                    <span style="opacity:0.6;font-size:11px;">✓</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Portal>
      </Show>
    </div>
  )
}

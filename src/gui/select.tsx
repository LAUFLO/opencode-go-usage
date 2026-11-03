import { For, Show, createSignal, onCleanup, onMount } from "solid-js"

export type SelectOption = { value: string; label: string }

export function Select(props: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  title?: string
  width?: string
}) {
  const [open, setOpen] = createSignal(false)
  const [position, setPosition] = createSignal({ left: 0, top: 0, width: 0 })
  let root: HTMLDivElement | undefined

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
    if (root && !root.contains(event.target as Node)) setOpen(false)
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

  return (
    <div
      ref={root}
      style={`position:relative;flex-shrink:0;${props.width ? `width:${props.width};` : ""}`}
    >
      <button
        type="button"
        title={props.title}
        onClick={toggle}
        style="height:30px;box-sizing:border-box;padding:0 8px;border-radius:7px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0;"
      >
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{current()}</span>
        <span
          style={`opacity:0.45;font-size:9px;line-height:1;transition:transform .15s ease;transform:rotate(${open() ? 180 : 0}deg);`}
        >
          ▾
        </span>
      </button>
      <Show when={open()}>
        <div
          style={`position:fixed;z-index:100;left:${position().left}px;top:${position().top}px;min-width:${menuWidth()}px;max-width:280px;max-height:300px;overflow-y:auto;padding:4px;border-radius:8px;border:1px solid rgba(127,127,127,0.25);background:rgba(127,127,127,0.14);backdrop-filter:blur(20px) saturate(1.2);box-shadow:0 10px 30px rgba(0,0,0,0.35);`}
        >
          <For each={props.options}>
            {(option) => (
              <button
                type="button"
                title={option.label}
                onClick={() => {
                  props.onChange(option.value)
                  setOpen(false)
                }}
                style={`display:block;width:100%;text-align:left;padding:6px 8px;border:none;border-radius:5px;background:${option.value === props.value ? "rgba(127,127,127,0.22)" : "transparent"};color:inherit;font-size:12px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

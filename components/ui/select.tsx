'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type MenuPosition = {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
}

/**
 * The one dropdown in the product.
 *
 * A native `<select>` cannot carry the console's type, state and spacing, so
 * this is a single-select listbox built to the WAI-ARIA combobox pattern:
 * focus stays on the button, the arrow keys move `aria-activedescendant`,
 * Enter/Space commit, Escape closes. The menu is portalled so a table's
 * `overflow-auto` cannot clip it.
 *
 * It works in a server-rendered form too: pass `name` and a hidden input
 * carries the current value on submit. A disabled control is not submitted,
 * matching a native disabled select.
 */
export function Select({
  options,
  id: idProp,
  name,
  value,
  defaultValue,
  onChange,
  placeholder,
  disabled = false,
  autoFocus = false,
  ariaLabel,
  className = '',
  onClose,
}: {
  options: SelectOption[]
  id?: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  ariaLabel?: string
  className?: string
  onClose?: () => void
}) {
  const reactId = useId()
  const id = idProp ?? `select-${reactId}`
  const listId = `${id}-listbox`
  const isControlled = value !== undefined

  const [internal, setInternal] = useState(defaultValue ?? '')
  const current = isControlled ? (value as string) : internal
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<MenuPosition | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const autoFocused = useRef(false)
  // Opening the menu scrolls the active option into view. That scroll is ours,
  // not a user leaving the control; without this guard it closes the menu
  // before a pointer or keyboard user can choose anything below the fold.
  const openingScroll = useRef(false)

  useEffect(() => {
    if (isControlled) setInternal(value as string)
  }, [isControlled, value])

  useEffect(() => {
    // A server-rendered form may hand back a new default after navigation.
    if (!isControlled) setInternal(defaultValue ?? '')
  }, [isControlled, defaultValue])

  const close = useCallback(
    (refocus = false) => {
      setOpen(false)
      onClose?.()
      if (refocus) buttonRef.current?.focus()
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close(false)
    }
    const onScroll = (event: Event) => {
      // Scrolling the option list itself, or the scroll caused by opening it,
      // must not close it. Only an external scroll means the user moved away.
      if (openingScroll.current) return
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) return
      close(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, close])

  const openMenu = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const width = Math.min(Math.max(rect.width, 180), 360)
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < 260 && rect.top > spaceBelow
    // When neither side has room, a fixed 240px menu runs off-screen. Clamp
    // to the side it opens into; the list itself scrolls.
    const available = openUp ? rect.top : spaceBelow
    setPosition({
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      left: Math.min(rect.left, Math.max(8, window.innerWidth - width - 8)),
      width,
      maxHeight: Math.max(96, Math.min(240, available - 8)),
    })
    const selectedIndex = options.findIndex((option) => option.value === current && !option.disabled)
    setActive(selectedIndex >= 0 ? selectedIndex : 0)
    openingScroll.current = true
    setOpen(true)
  }, [current, options])

  useEffect(() => {
    if (!autoFocus || autoFocused.current) return
    autoFocused.current = true
    buttonRef.current?.focus()
    openMenu()
  }, [autoFocus, openMenu])

  useEffect(() => {
    if (!open) return
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
    // The scroll event is dispatched after this effect; release the guard on
    // the next frame so a genuine scroll still closes the menu.
    const frame = window.requestAnimationFrame(() => {
      openingScroll.current = false
    })
    return () => window.cancelAnimationFrame(frame)
  }, [active, open, id])

  const commit = (next: string) => {
    if (!isControlled) setInternal(next)
    onChange?.(next)
    close(true)
  }

  const move = (delta: number) => {
    if (options.length === 0) return
    let index = active
    for (let i = 0; i < options.length; i += 1) {
      index = (index + delta + options.length) % options.length
      if (!options[index].disabled) {
        setActive(index)
        return
      }
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!open) openMenu()
        else move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        if (!open) openMenu()
        else move(-1)
        break
      case 'Home':
        if (open) {
          event.preventDefault()
          const first = options.findIndex((option) => !option.disabled)
          if (first >= 0) setActive(first)
        }
        break
      case 'End':
        if (open) {
          event.preventDefault()
          for (let i = options.length - 1; i >= 0; i -= 1) {
            if (!options[i].disabled) {
              setActive(i)
              break
            }
          }
        }
        break
      case 'Enter':
      case ' ':
      case 'Spacebar':
        event.preventDefault()
        if (!open) {
          openMenu()
        } else {
          const option = options[active]
          if (option && !option.disabled) commit(option.value)
        }
        break
      case 'Escape':
        if (open) {
          event.preventDefault()
          close(true)
        }
        break
      case 'Tab':
        // Close after the browser moves focus. Closing synchronously lets a
        // caller unmount the editor before Tab lands, stranding focus.
        if (open) window.setTimeout(() => close(false), 0)
        break
      default:
        break
    }
  }

  const selected = options.find((option) => option.value === current)
  const display = selected?.label ?? (current === '' ? (placeholder ?? 'Select…') : current)

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-activedescendant={open && options.length > 0 ? `${id}-opt-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-ink-line bg-ink/60 px-3 py-2.5 text-left text-[14px] text-bone outline-none transition-colors focus:border-verdant focus:bg-ink-soft focus-visible:ring-2 focus-visible:ring-verdant/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`truncate ${selected ? '' : 'text-bone-faint/70'}`}>{display}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`h-3 w-3 shrink-0 text-bone-faint transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {name && !disabled ? <input type="hidden" name={name} value={current} readOnly /> : null}

      {open && position && typeof document !== 'undefined'
        ? createPortal(
            <ul
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              tabIndex={-1}
              style={{
                position: 'fixed',
                top: position.top,
                bottom: position.bottom,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
              className="z-[60] overflow-auto rounded-lg border border-ink-line bg-ink-soft p-1 shadow-xl"
            >
              {options.length === 0 ? (
                <li role="option" aria-selected={false} aria-disabled="true" className="px-2.5 py-2 text-[12px] text-bone-faint">
                  No options
                </li>
              ) : (
                options.map((option, index) => {
                  const isSelected = option.value === current
                  return (
                    <li
                      key={option.value === '' ? `__empty-${index}` : option.value}
                      id={`${id}-opt-${index}`}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled || undefined}
                      onMouseEnter={() => {
                        if (!option.disabled) setActive(index)
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (!option.disabled) commit(option.value)
                      }}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[13px] ${
                        index === active ? 'bg-ink/70' : ''
                      } ${isSelected ? 'text-verdant' : 'text-bone'} ${
                        option.disabled ? 'cursor-not-allowed opacity-40' : ''
                      }`}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected ? <span aria-hidden="true">✓</span> : null}
                    </li>
                  )
                })
              )}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}

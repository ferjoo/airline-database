// Full-screen diagram viewer: click any [data-viewer-src] to open it; drag to pan, wheel or pinch to zoom, Esc to close.

const MIN = 0.1
const MAX = 8

const dialog = document.createElement('dialog')
dialog.className = 'viewer'
dialog.setAttribute('aria-label', 'Diagram viewer')
dialog.innerHTML = `
  <div class="viewer-bar">
    <p class="viewer-title"></p>
    <div class="viewer-actions">
      <button type="button" data-act="out" aria-label="Zoom out">−</button>
      <button type="button" data-act="fit">Fit</button>
      <button type="button" data-act="in" aria-label="Zoom in">+</button>
      <button type="button" data-act="close" class="viewer-close">Close</button>
    </div>
  </div>
  <div class="viewer-stage"><img alt="" draggable="false" /></div>
  <p class="viewer-hint">Drag to move · scroll or pinch to zoom · Esc to close</p>`
document.body.append(dialog)

const stage = dialog.querySelector('.viewer-stage')
const img = dialog.querySelector('img')
const title = dialog.querySelector('.viewer-title')
const view = { scale: 1, x: 0, y: 0 }
const pointers = new Map()
let pinch = null
let returnFocus = null

function apply() {
  img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
}

function fit() {
  const w = img.naturalWidth || 1000
  const h = img.naturalHeight || 700
  const rect = stage.getBoundingClientRect()
  view.scale = Math.min(rect.width / w, rect.height / h) * 0.94
  view.x = (rect.width - w * view.scale) / 2
  view.y = (rect.height - h * view.scale) / 2
  apply()
}

// Zoom keeping the point (px, py) of the stage fixed under the cursor or fingers.
function zoomAt(factor, px, py) {
  const next = Math.min(MAX, Math.max(MIN, view.scale * factor))
  const k = next / view.scale
  view.x = px - (px - view.x) * k
  view.y = py - (py - view.y) * k
  view.scale = next
  apply()
}

function zoomCenter(factor) {
  const rect = stage.getBoundingClientRect()
  zoomAt(factor, rect.width / 2, rect.height / 2)
}

function open(src, label) {
  returnFocus = document.activeElement
  title.textContent = label
  img.alt = label
  img.onload = fit
  img.src = src
  dialog.showModal()
  if (img.complete && img.naturalWidth) fit()
}

dialog.addEventListener('close', () => {
  pointers.clear()
  pinch = null
  returnFocus?.focus()
})

dialog.addEventListener('click', (event) => {
  const act = event.target.closest('[data-act]')?.dataset.act
  if (act === 'close') dialog.close()
  if (act === 'fit') fit()
  if (act === 'in') zoomCenter(1.4)
  if (act === 'out') zoomCenter(1 / 1.4)
})

dialog.addEventListener('keydown', (event) => {
  if (event.key === '+' || event.key === '=') zoomCenter(1.25)
  if (event.key === '-') zoomCenter(0.8)
  if (event.key === '0') fit()
})

stage.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    const rect = stage.getBoundingClientRect()
    zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top)
  },
  { passive: false },
)

stage.addEventListener('pointerdown', (event) => {
  stage.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) }
  }
})

stage.addEventListener('pointermove', (event) => {
  const prev = pointers.get(event.pointerId)
  if (!prev) return
  const curr = { x: event.clientX, y: event.clientY }
  pointers.set(event.pointerId, curr)
  if (pointers.size === 1) {
    view.x += curr.x - prev.x
    view.y += curr.y - prev.y
    apply()
  } else if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    const rect = stage.getBoundingClientRect()
    zoomAt(dist / pinch.dist, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top)
    pinch.dist = dist
  }
})

function release(event) {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinch = null
}
stage.addEventListener('pointerup', release)
stage.addEventListener('pointercancel', release)

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-viewer-src]')
  if (!trigger) return
  event.preventDefault()
  open(trigger.dataset.viewerSrc, trigger.dataset.viewerTitle || '')
})

window.addEventListener('resize', () => dialog.open && fit())

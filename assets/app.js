import { renderGallery } from './diagrams.js'

// Schema explorer: parses schema/airline.sql in the browser, so the page always matches the DDL.

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs'

const DOMAINS = [
  { id: 'airports', name: 'Airports & infrastructure', tables: ['AEROPUERTO', 'TERMINAL', 'GATE', 'RUNWAY'] },
  { id: 'fleet', name: 'Fleet, aircraft & maintenance', tables: ['FLOTA', 'MODELO_AERONAVE', 'AERONAVE', 'TALLER', 'MANTENIMIENTO', 'BUTACA'] },
  { id: 'flights', name: 'Flights, operations & segments', tables: ['AEROLINEA', 'VUELO', 'OPERACION_VUELO', 'SEGMENTO', 'INVENTARIO_PLAZAS'] },
  { id: 'crew', name: 'Crew & qualifications', tables: ['TRIPULANTE', 'PILOTO', 'TRIPULANTE_CABINA', 'CALIFICACION', 'ASIGNACION_TRIPULACION'] },
  {
    id: 'reservations',
    name: 'Reservations, connections & baggage',
    tables: ['PASAJERO', 'RESERVA', 'RESERVA_PASAJERO', 'RESERVA_SEGMENTO', 'CONEXION', 'EQUIPAJE', 'RECLAMO_EQUIPAJE'],
  },
  { id: 'operations', name: 'Operational events & alerts', tables: ['EVENTO_OPERATIVO', 'ALERTA_IRREGULARIDAD'] },
]

const LABELS = {
  AEROPUERTO: 'Airport',
  TERMINAL: 'Terminal',
  GATE: 'Gate',
  RUNWAY: 'Runway',
  FLOTA: 'Fleet',
  MODELO_AERONAVE: 'Aircraft model',
  AERONAVE: 'Aircraft',
  TALLER: 'Workshop',
  MANTENIMIENTO: 'Maintenance',
  BUTACA: 'Seat',
  AEROLINEA: 'Airline',
  VUELO: 'Flight',
  OPERACION_VUELO: 'Flight operation',
  SEGMENTO: 'Segment',
  INVENTARIO_PLAZAS: 'Seat inventory',
  TRIPULANTE: 'Crew member',
  PILOTO: 'Pilot',
  TRIPULANTE_CABINA: 'Cabin crew',
  CALIFICACION: 'Type rating',
  ASIGNACION_TRIPULACION: 'Crew assignment',
  PASAJERO: 'Passenger',
  RESERVA: 'Booking (PNR)',
  RESERVA_PASAJERO: 'Booking passenger',
  RESERVA_SEGMENTO: 'Itinerary leg',
  CONEXION: 'Connection',
  EQUIPAJE: 'Baggage',
  RECLAMO_EQUIPAJE: 'Baggage claim',
  EVENTO_OPERATIVO: 'Operational event',
  ALERTA_IRREGULARIDAD: 'Irregularity alert',
}

const WEAK = new Set(['TERMINAL', 'GATE', 'RUNWAY', 'MANTENIMIENTO', 'BUTACA', 'OPERACION_VUELO', 'SEGMENTO'])
// Classification from the design document: 6 associative entities, 7 weak entities, 2 subtypes, 31 relationships.
const ASSOCIATIVE = new Set(['INVENTARIO_PLAZAS', 'CALIFICACION', 'ASIGNACION_TRIPULACION', 'RESERVA_PASAJERO', 'RESERVA_SEGMENTO', 'CONEXION'])
const RELATIONSHIPS = 31
const SUPERTYPE = new Set(['TRIPULANTE'])
const SUBTYPE = new Set(['PILOTO', 'TRIPULANTE_CABINA'])

const DECISIONS = [
  {
    title: 'A flight is not an operation',
    text: 'VUELO is the commercial flight number, which repeats every day. OPERACION_VUELO (number + date) is a weak entity, and it is what crew, aircraft, gates and delays hang from.',
    tables: ['VUELO', 'OPERACION_VUELO', 'SEGMENTO'],
  },
  {
    title: 'Gate integrity without triggers',
    text: "A segment's gate foreign keys include the airport code, so the database itself guarantees the departure gate belongs to the origin airport and the arrival gate to the destination.",
    tables: ['SEGMENTO', 'GATE', 'TERMINAL'],
  },
  {
    title: 'Disjoint specialization, enforced',
    text: 'Crew members are a supertype with PILOTO and TRIPULANTE_CABINA subtypes. A composite key on (id, type) plus a CHECK on each subtype makes it impossible to register a flight attendant as a pilot.',
    tables: ['TRIPULANTE', 'PILOTO', 'TRIPULANTE_CABINA'],
  },
  {
    title: 'Derived values as virtual columns',
    text: 'Departure delay, available seats and the missed-connection flag are computed by the database from stored facts, so they can never drift out of sync.',
    tables: ['SEGMENTO', 'INVENTARIO_PLAZAS', 'CONEXION'],
  },
  {
    title: 'Connections between consecutive legs',
    text: 'A connection references two legs of the same itinerary by position, and a CHECK requires the second to follow the first, so an itinerary cannot connect leg 1 to leg 3.',
    tables: ['RESERVA_SEGMENTO', 'CONEXION'],
  },
  {
    title: 'Multivalued attributes become entities',
    text: 'Aircraft type ratings started as a list on the crew member. Modeled as an associative entity, they gained their own attributes: date obtained and expiry.',
    tables: ['CALIFICACION', 'MODELO_AERONAVE'],
  },
]

const $ = (selector) => document.querySelector(selector)

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// Split on commas that are not inside parentheses.
function splitTopLevel(body) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of body) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current)
  return parts.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

const cols = (list) => list.split(',').map((c) => c.trim())

function parseSchema(sql) {
  const code = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  const tables = new Map()

  for (const match of code.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g)) {
    const [, name, body] = match
    const table = { name, columns: [], pk: [], fks: [], uniques: [], checks: [], comment: '', referencedBy: [] }

    for (const item of splitTopLevel(body)) {
      if (item.startsWith('CONSTRAINT')) {
        const [, cname, kind, rest] = item.match(/^CONSTRAINT (\w+)\s+(PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK)\s*([\s\S]*)$/)
        if (kind === 'PRIMARY KEY') table.pk = cols(rest.slice(1, -1))
        if (kind === 'UNIQUE') table.uniques.push({ name: cname, columns: cols(rest.slice(1, -1)) })
        if (kind === 'CHECK') table.checks.push({ name: cname, expr: rest.trim().slice(1, -1).trim() })
        if (kind === 'FOREIGN KEY') {
          const [, from, target, to] = rest.match(/^\(([^)]+)\) REFERENCES (\w+) \(([^)]+)\)/)
          table.fks.push({ name: cname, columns: cols(from), target, targetColumns: cols(to) })
        }
        continue
      }
      const [, colName, type, rest = ''] = item.match(/^(\w+)\s+([A-Z0-9_]+(?:\(\d+(?:,\d+)?\))?)(.*)$/)
      const generated = rest.match(/GENERATED ALWAYS AS \(([\s\S]*)\) VIRTUAL/)
      const def = rest.match(/DEFAULT ('[^']*'|\S+)/)
      table.columns.push({
        name: colName,
        type,
        notNull: /NOT NULL/.test(rest),
        default: def ? def[1] : null,
        virtual: generated ? generated[1].trim() : null,
      })
    }
    tables.set(name, table)
  }

  for (const match of code.matchAll(/COMMENT ON TABLE (\w+)\s+IS '([^']*)'/g)) {
    const table = tables.get(match[1])
    if (table) table.comment = match[2]
  }

  for (const table of tables.values()) {
    for (const fk of table.fks) tables.get(fk.target)?.referencedBy.push({ table: table.name, fk: fk.name })
  }
  return tables
}

let schema = new Map()
let selected = null
let mermaid = null
let renderCount = 0

function badgesFor(name) {
  const out = []
  if (WEAK.has(name)) out.push('Weak entity')
  if (ASSOCIATIVE.has(name)) out.push('Associative')
  if (SUPERTYPE.has(name)) out.push('Supertype')
  if (SUBTYPE.has(name)) out.push('Subtype')
  return out
}

function renderStats() {
  let fks = 0
  let checks = 0
  for (const t of schema.values()) {
    fks += t.fks.length
    checks += t.checks.length
  }
  const stats = [
    [schema.size, 'entities'],
    [RELATIONSHIPS, 'relationships'],
    [fks, 'foreign keys'],
    [checks, 'check constraints'],
    [WEAK.size, 'weak entities'],
    [ASSOCIATIVE.size, 'associative entities'],
    [SUBTYPE.size, 'subtypes'],
  ]
  $('#stats').classList.add('seven')
  $('#stats').innerHTML = stats.map(([value, label]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')
}

function chip(name) {
  return `<button type="button" class="chip" data-table="${name}">${name}</button>`
}

function renderDecisions() {
  $('#decisions').innerHTML = DECISIONS.map(
    (d) => `<div class="decision"><h3>${escapeHtml(d.title)}</h3><p>${escapeHtml(d.text)}</p><div class="chips">${d.tables.map(chip).join('')}</div></div>`,
  ).join('')
}

function matches(table, query) {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    table.name.toLowerCase().includes(q) ||
    LABELS[table.name].toLowerCase().includes(q) ||
    table.columns.some((c) => c.name.toLowerCase().includes(q))
  )
}

function renderGroups() {
  const query = $('#search').value.trim()
  const html = DOMAINS.map((domain) => {
    const items = domain.tables.map((n) => schema.get(n)).filter((t) => t && matches(t, query))
    if (!items.length) return ''
    return `<div class="group"><h3>${domain.name}</h3><ul>${items
      .map(
        (t) =>
          `<li><button type="button" class="table-btn" data-table="${t.name}" aria-pressed="${t.name === selected}"><span>${LABELS[t.name]}</span><span class="sql">${t.name}</span></button></li>`,
      )
      .join('')}</ul></div>`
  }).join('')
  $('#groups').innerHTML = html || `<p class="empty">No table or column matches “${escapeHtml(query)}”.</p>`
}

function renderDetail() {
  const t = schema.get(selected)
  if (!t) return
  const fkCols = new Set(t.fks.flatMap((fk) => fk.columns))
  const rows = t.columns
    .map((c) => {
      const keys = `${t.pk.includes(c.name) ? '<span class="key-pill">PK</span>' : ''}${fkCols.has(c.name) ? '<span class="key-pill fk">FK</span>' : ''}`
      const extra = c.virtual
        ? `<span class="virtual">virtual: ${escapeHtml(c.virtual)}</span>`
        : c.default
          ? `<span class="virtual">default ${escapeHtml(c.default)}</span>`
          : ''
      return `<tr><td class="name">${c.name}${extra}</td><td class="type">${c.type}</td><td>${keys}</td><td class="null">${c.virtual ? 'computed' : c.notNull ? 'required' : 'optional'}</td></tr>`
    })
    .join('')

  const refs = t.fks
    .map((fk) => `<li><span class="rule-name">${fk.name}</span><code>(${fk.columns.join(', ')}) → <button type="button" class="chip" data-table="${fk.target}">${fk.target}</button> (${fk.targetColumns.join(', ')})</code></li>`)
    .join('')
  const referencedBy = [...new Set(t.referencedBy.map((r) => r.table))].map(chip).join('')
  const checks = t.checks.map((c) => `<li><span class="rule-name">${c.name}</span><code>${escapeHtml(c.expr)}</code></li>`).join('')
  const uniques = t.uniques.map((u) => `<li><span class="rule-name">${u.name}</span><code>UNIQUE (${u.columns.join(', ')})</code></li>`).join('')
  const badges = badgesFor(t.name).map((b) => `<span class="badge key">${b}</span>`).join('')

  $('#detail').innerHTML = `
    <div class="detail-head"><h3>${LABELS[t.name]}</h3><span class="sql-name">${t.name}</span></div>
    <p class="comment">${escapeHtml(t.comment)}</p>
    <div class="badges">${badges}<span class="badge">PK (${t.pk.join(', ')})</span></div>
    <h4>Columns</h4>
    <div class="cols"><table><thead><tr><th>Column</th><th>Type</th><th>Keys</th><th>Null</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${refs ? `<h4>References</h4><ul class="rules">${refs}</ul>` : ''}
    ${referencedBy ? `<h4>Referenced by</h4><div class="chips">${referencedBy}</div>` : ''}
    ${uniques ? `<h4>Unique constraints</h4><ul class="rules">${uniques}</ul>` : ''}
    ${checks ? `<h4>Check constraints</h4><ul class="rules">${checks}</ul>` : ''}`
}

function select(name, { scroll = false } = {}) {
  if (!schema.has(name)) return
  selected = name
  history.replaceState(null, '', `#t=${name}`)
  renderGroups()
  renderDetail()
  if (scroll) $('#detail').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}

// ---- ER diagram (Mermaid) ----

function relationship(child, fk) {
  const childTable = schema.get(child)
  // Identifying when the child borrows part of its primary key from the parent (weak entities, subtypes).
  const identifying = fk.columns.some((c) => childTable.pk.includes(c))
  const optional = fk.columns.some((c) => !childTable.columns.find((col) => col.name === c)?.notNull)
  const label = fk.name.replace(/^FK_/, '').toLowerCase()
  return `  ${fk.target} ${optional ? '|o' : '||'}${identifying ? '--' : '..'}o{ ${child} : "${label}"`
}

function entityBlock(t) {
  const fkCols = new Set(t.fks.flatMap((fk) => fk.columns))
  const lines = [`  ${t.name} {`]
  for (const c of t.columns) {
    const keys = [t.pk.includes(c.name) && 'PK', fkCols.has(c.name) && 'FK'].filter(Boolean).join(', ')
    lines.push(`    ${c.type.replace(/\(.*\)/, '')} ${c.name}${keys ? ' ' + keys : ''}`)
  }
  lines.push('  }')
  return lines
}

// "all": every entity with every attribute. A domain: its entities in full, related tables from other domains compact.
function diagramSource(scope) {
  const lines = ['erDiagram']
  const domain = DOMAINS.find((d) => d.id === scope)
  const focus = domain ? new Set(domain.tables) : new Set(schema.keys())
  const others = new Set()
  const relations = []

  for (const t of schema.values()) {
    for (const fk of t.fks) {
      if (!focus.has(t.name) && !focus.has(fk.target)) continue
      relations.push(relationship(t.name, fk))
      for (const name of [t.name, fk.target]) if (!focus.has(name)) others.add(name)
    }
  }

  for (const name of focus) lines.push(...entityBlock(schema.get(name)))
  for (const name of others) lines.push(`  ${name}["${name} (other domain)"]`)
  return [...lines, ...relations].join('\n')
}

async function renderDiagram() {
  const container = $('#diagram')
  const scope = $('#scope').value
  container.innerHTML = '<p class="loading">Drawing diagram…</p>'
  try {
    if (!mermaid) {
      mermaid = (await import(MERMAID_URL)).default
    }
    const dark = matchMedia('(prefers-color-scheme: dark)').matches
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'neutral',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", sans-serif',
      er: { useMaxWidth: false, diagramPadding: 16 },
    })
    const { svg } = await mermaid.render(`er-${++renderCount}`, diagramSource(scope))
    container.innerHTML = svg
  } catch (error) {
    console.warn(error)
    container.innerHTML = '<p class="loading">The diagram could not be drawn. The schema explorer above has the same information.</p>'
  }
}

function renderScopeOptions() {
  $('#scope').innerHTML = [`<option value="all">Full model, all attributes</option>`, ...DOMAINS.map((d) => `<option value="${d.id}">${d.name}</option>`)].join('')
  $('#scope').value = 'all'
}

async function main() {
  const sql = await (await fetch('schema/airline.sql')).text()
  schema = parseSchema(sql)
  renderStats()
  renderDecisions()
  renderScopeOptions()
  renderGallery($('#gallery'))

  const fromHash = decodeURIComponent(location.hash.replace(/^#t=/, ''))
  selected = schema.has(fromHash) ? fromHash : 'SEGMENTO'
  renderGroups()
  renderDetail()
  renderDiagram()

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-table]')
    if (target) select(target.dataset.table, { scroll: !target.classList.contains('table-btn') || matchMedia('(max-width: 899px)').matches })
  })
  $('#search').addEventListener('input', renderGroups)
  $('#scope').addEventListener('change', renderDiagram)
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderDiagram)
}

main()

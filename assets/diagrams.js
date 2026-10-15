// The complete model and its six thematic subviews, exported from Oracle SQL Developer Data Modeler.
export const DIAGRAMS = [
  { file: 'full-model.svg', title: 'Complete model', annex: 'A', note: '29 entities · 36 foreign keys', wide: true },
  { file: 'airports.svg', title: 'Airports and infrastructure', annex: 'B', note: '4 entities' },
  { file: 'fleet.svg', title: 'Fleet, aircraft and maintenance', annex: 'C', note: '6 entities' },
  { file: 'flights.svg', title: 'Flights, operations and segments', annex: 'D', note: '5 entities' },
  { file: 'crew.svg', title: 'Crew and qualifications', annex: 'E', note: '5 entities' },
  { file: 'reservations.svg', title: 'Reservations, connections and baggage', annex: 'F', note: '7 entities' },
  { file: 'operations.svg', title: 'Operational events and alerts', annex: 'G', note: '2 entities' },
]

export function renderGallery(container) {
  container.innerHTML = DIAGRAMS.map((d) => {
    const src = `assets/diagrams/${d.file}`
    const label = `${d.annex} · ${d.title}`
    return `<button type="button" class="figure${d.wide ? ' wide' : ''}" data-viewer-src="${src}" data-viewer-title="${label}" aria-label="Open diagram: ${d.title}">
      <span class="figure-frame"><img src="${src}" alt="" loading="lazy" decoding="async" /></span>
      <span class="figure-caption"><strong>${d.title}</strong><span>${d.note} · Open</span></span>
    </button>`
  }).join('')
}

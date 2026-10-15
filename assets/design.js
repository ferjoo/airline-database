import { renderGallery } from './diagrams.js'

renderGallery(document.querySelector('#annex-gallery'))

// Highlight the section being read in the table of contents.
const links = new Map([...document.querySelectorAll('.toc a')].map((a) => [a.getAttribute('href').slice(1), a]))
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      links.forEach((a) => a.classList.remove('active'))
      links.get(entry.target.id)?.classList.add('active')
    }
  },
  { rootMargin: '-15% 0px -75% 0px' },
)
document.querySelectorAll('.doc h2[id], .doc h3[id]').forEach((h) => observer.observe(h))

// On small screens the contents list collapses after choosing a section.
document.querySelector('.toc').addEventListener('click', (event) => {
  if (event.target.closest('a') && matchMedia('(max-width: 979px)').matches) event.currentTarget.open = false
})
if (matchMedia('(max-width: 979px)').matches) document.querySelector('.toc').open = false

// Header schaduw bij scrollen
const header = document.getElementById('header');
addEventListener('scroll', () => header.classList.toggle('is-scrolled', scrollY > 10), { passive: true });

// Mobiel menu
const burger = document.getElementById('burger');
const mobileNav = document.getElementById('mobileNav');
burger.addEventListener('click', () => {
  mobileNav.hidden = !mobileNav.hidden;
  burger.setAttribute('aria-expanded', String(!mobileNav.hidden));
});
mobileNav.addEventListener('click', e => { if (e.target.closest('a')) mobileNav.hidden = true; });

// Materiaalfilter
document.querySelectorAll('.filters .chip').forEach(chip => chip.addEventListener('click', () => {
  document.querySelectorAll('.filters .chip').forEach(c => c.classList.toggle('is-active', c === chip));
  const f = chip.dataset.filter;
  document.querySelectorAll('.product').forEach(p => p.classList.toggle('is-hidden', f !== 'all' && p.dataset.cat !== f));
}));

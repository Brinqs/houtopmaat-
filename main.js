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

// Snelle prijscalculator (indicatie op basis van m²-prijs)
const $ = id => document.getElementById(id);
const mat = $('qMat'), thick = $('qThick'), qty = $('qQty'), len = $('qLen'), wid = $('qWid');
const fmt = n => '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fillThickness() {
  const opts = mat.selectedOptions[0].dataset.t.split(',');
  thick.innerHTML = opts.map(t => `<option value="${t}">${t} mm</option>`).join('');
}
function update() {
  const L = Math.max(0, +len.value || 0), W = Math.max(0, +wid.value || 0), Q = Math.max(1, +qty.value || 1);
  const m2 = (L / 1000) * (W / 1000);
  // eenvoudige dikte-factor t.o.v. de dunste variant, puur ter illustratie
  const tMin = +mat.selectedOptions[0].dataset.t.split(',')[0];
  const factor = Math.sqrt((+thick.value || tMin) / tMin);
  $('qPrice').textContent = fmt(m2 * +mat.value * factor * Q);

  // plaat-preview schalen (max 3050 × 1250 mm)
  const board = $('qBoard');
  const maxW = 260, maxH = 90;
  const scale = Math.min(maxW / Math.max(L, 1), maxH / Math.max(W, 1), maxW / 1200);
  board.style.width = Math.max(40, L * scale) + 'px';
  board.style.height = Math.max(22, W * scale) + 'px';
  $('qBoardLabel').textContent = `${L} × ${W} mm`;
}
mat.addEventListener('change', () => { fillThickness(); update(); });
[thick, qty, len, wid].forEach(el => el.addEventListener('input', update));
$('configurator').addEventListener('submit', e => e.preventDefault());
fillThickness(); update();

// Materiaalfilter
document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('is-active', c === chip));
  const f = chip.dataset.filter;
  document.querySelectorAll('.product').forEach(p => p.classList.toggle('is-hidden', f !== 'all' && p.dataset.cat !== f));
}));

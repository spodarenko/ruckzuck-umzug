/**
 * Mobile navigation toggle.
 */
(() => {
	const nav = document.querySelector('[data-nav]');
	const burger = document.querySelector('[data-burger]');
	if (!nav || !burger) return;

	const setOpen = (open) => {
		nav.classList.toggle('is-open', open);
		burger.setAttribute('aria-expanded', String(open));
	};

	burger.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
	nav.querySelectorAll('.nav__links a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
	document.addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));
})();

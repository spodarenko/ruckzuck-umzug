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

/**
 * Language dropdown.
 */
(() => {
	const root = document.querySelector('[data-lang]');
	const toggle = root?.querySelector('[data-lang-toggle]');
	const menu = root?.querySelector('.lang__menu');
	if (!toggle || !menu) return;

	const setOpen = (open) => {
		menu.hidden = !open;
		toggle.setAttribute('aria-expanded', String(open));
	};

	toggle.addEventListener('click', () => setOpen(menu.hidden));
	document.addEventListener('click', (e) => !root.contains(e.target) && setOpen(false));
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && !menu.hidden) {
			setOpen(false);
			toggle.focus();
		}
	});
})();

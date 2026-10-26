/**
 * Scroll motion: reveals, split headline, word highlight, hero zoom,
 * parallax, rotating ring, ghost drift, counters, timeline fill, nav state.
 */
(() => {
	const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Split headline into masked words (keeps the accent <em>).
	document.querySelectorAll('[data-split]').forEach((el) => {
		let i = 0;
		const wrap = (node) => {
			[...node.childNodes].forEach((child) => {
				if (child.nodeType === Node.TEXT_NODE) {
					const frag = document.createDocumentFragment();
					child.textContent.split(/(\s+)/).forEach((part) => {
						if (!part) return;
						if (/^\s+$/.test(part)) {
							frag.append(part);
							return;
						}
						const w = document.createElement('span');
						w.className = 'w';
						w.innerHTML = `<span style="--i:${i++}"></span>`;
						w.firstChild.textContent = part;
						frag.append(w);
					});
					child.replaceWith(frag);
				} else {
					wrap(child);
				}
			});
		};
		wrap(el);
		requestAnimationFrame(() => el.classList.add('is-in'));
	});

	// Statement: wrap words for scroll-linked highlight.
	const statements = [...document.querySelectorAll('[data-words]')];
	statements.forEach((el) => {
		const words = el.textContent.trim().split(/\s+/);
		el.textContent = '';
		words.forEach((w, i) => {
			const span = document.createElement('span');
			span.className = 'word';
			span.textContent = w;
			el.append(span, i < words.length - 1 ? ' ' : '');
		});
	});

	// Reveal on enter.
	const io = new IntersectionObserver(
		(entries) => {
			entries.forEach((e) => {
				if (e.isIntersecting) {
					e.target.classList.add('is-in');
					io.unobserve(e.target);
				}
			});
		},
		{ rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
	);
	document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));

	// Counters.
	const fmt = (n, d) => n.toLocaleString(document.documentElement.lang || 'de', { minimumFractionDigits: d, maximumFractionDigits: d });
	const countIO = new IntersectionObserver(
		(entries) => {
			entries.forEach((e) => {
				if (!e.isIntersecting) return;
				countIO.unobserve(e.target);
				const el = e.target;
				const to = parseFloat(el.dataset.count);
				const d = parseInt(el.dataset.decimals || '0', 10);
				if (reduce) {
					el.textContent = fmt(to, d);
					return;
				}
				const t0 = performance.now();
				const dur = 1600;
				const tick = (t) => {
					const p = Math.min(1, (t - t0) / dur);
					const eased = 1 - Math.pow(1 - p, 4);
					el.textContent = fmt(to * eased, d);
					if (p < 1) requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
			});
		},
		{ threshold: 0.6 },
	);
	document.querySelectorAll('[data-count]').forEach((el) => countIO.observe(el));

	// Hero zoom-out once the image is ready.
	const hero = document.querySelector('.hero');
	const heroImg = document.querySelector('[data-zoom]');
	if (heroImg) {
		const loaded = () =>
			requestAnimationFrame(() => {
				hero.classList.add('is-loaded');
				setTimeout(() => hero.classList.add('is-settled'), 1600);
			});
		if (heroImg.complete) loaded();
		else heroImg.addEventListener('load', loaded, { once: true });
	}

	// Scroll-linked effects, batched in one rAF.
	const nav = document.querySelector('[data-nav]');
	const ring = document.querySelector('[data-ring] svg');
	const drift = document.querySelector('[data-drift]');
	const parallax = [...document.querySelectorAll('[data-parallax]')];
	const timeline = document.querySelector('[data-timeline]');
	const fill = document.querySelector('[data-timeline-fill]');
	let lastY = window.scrollY;
	let ticking = false;

	const progress = (el) => {
		const r = el.getBoundingClientRect();
		const vh = window.innerHeight;
		return Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
	};

	const update = () => {
		ticking = false;
		const y = window.scrollY;
		const vh = window.innerHeight;

		if (nav) {
			nav.classList.toggle('is-scrolled', y > 40);
			nav.classList.toggle('is-hidden', y > 400 && y > lastY);
		}
		lastY = y;

		if (reduce) return;

		if (ring) ring.style.setProperty('--ring-rot', `${y * 0.25}deg`);

		if (heroImg && hero.classList.contains('is-settled') && y < vh * 1.2) {
			heroImg.style.setProperty('--zoom-y', `${y * 0.15}px`);
			heroImg.style.setProperty('--zoom-s', `${1 + y * 0.0002}`);
		}

		if (drift) drift.style.setProperty('--drift', `${(progress(drift) - 0.5) * -20}%`);

		parallax.forEach((img) => {
			img.style.setProperty('--py', `${(progress(img) - 0.5) * -10}%`);
		});

		statements.forEach((el) => {
			const r = el.getBoundingClientRect();
			const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
			const words = el.children;
			const lit = Math.round(p * words.length);
			for (let i = 0; i < words.length; i++) words[i].classList.toggle('on', i < lit);
		});

		if (timeline && fill) {
			const r = timeline.getBoundingClientRect();
			const p = Math.min(1, Math.max(0, (vh * 0.6 - r.top) / r.height));
			fill.style.setProperty('--progress', p.toFixed(3));
		}
	};

	window.addEventListener(
		'scroll',
		() => {
			if (!ticking) {
				ticking = true;
				requestAnimationFrame(update);
			}
		},
		{ passive: true },
	);
	window.addEventListener('resize', update);
	update();
})();

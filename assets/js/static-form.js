/**
 * Static build only (GitHub Pages has no PHP): the quote form opens
 * WhatsApp with the request pre-filled instead of posting to WordPress.
 */
(() => {
	const form = document.querySelector('[data-quote-form]');
	const wa = document.querySelector('a[href*="wa.me/"]');
	const num = wa && wa.getAttribute('href').match(/wa\.me\/(\d+)/);
	if (!form || !num) return;

	form.addEventListener('submit', (e) => {
		e.preventDefault();
		if (!form.reportValidity()) return;
		const data = new FormData(form);
		const labels = [...form.querySelectorAll('.field')].reduce((map, f) => {
			const input = f.querySelector('input, select, textarea');
			if (input) map[input.name] = f.querySelector('span').textContent;
			return map;
		}, {});
		const lines = ['name', 'phone', 'route', 'service', 'message']
			.filter((k) => data.get(k))
			.map((k) => `${labels[k] || k}: ${data.get(k)}`);
		if (data.get('estimate')) lines.push('', data.get('estimate'));
		window.open(`https://wa.me/${num[1]}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
	});
})();

/**
 * Offer document (Angebot + AGB) shown after the quote form is sent.
 * On submit: snapshot of the calculator (German labels) + customer → sessionStorage,
 * number into the form's hidden "offer" field. Opens after the WordPress redirect
 * (?sent=1) or right away on the static site (static-form.js → rzOffer.open()).
 * Data: window.RZ_OFFER (inc/config.php, inc/agb.php). Print → "Als PDF speichern".
 */
(() => {
	const O = window.RZ_OFFER;
	const form = document.querySelector('[data-quote-form]');
	if (!O || !form) return;

	const D = O.agb.doc;
	const C = O.company;
	const KEY = 'rz_offer';

	const h = (tag, attrs = {}, ...children) => {
		const node = document.createElement(tag);
		Object.entries(attrs).forEach(([k, v]) => {
			if (k === 'on') Object.entries(v).forEach(([ev, fn]) => node.addEventListener(ev, fn));
			else if (k === 'html')
				node.innerHTML = v; // trusted: inc/agb.php
			else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
		});
		children.flat().forEach((c) => c != null && c !== false && node.append(c));
		return node;
	};
	const fmt = (str, ...args) => {
		let i = 0;
		return str.replace(/%(\d)\$[sd]|%[sd]/g, (m, n) => args[n ? n - 1 : i++]);
	};
	const num = (n, digits = 2) => n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
	const eur = (n) => `${num(n)} €`;
	const day = (d) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	const pct = (p) => `${Math.round(p * 100)}%`;

	const read = () => {
		try {
			return JSON.parse(sessionStorage.getItem(KEY) || 'null');
		} catch {
			return null;
		}
	};

	/* ---------- snapshot on submit ---------- */

	form.addEventListener('submit', () => {
		if (!form.checkValidity()) return;
		const calc = window.rzCalc && window.rzCalc.offer(O.calcDe);
		const field = form.querySelector('[name="offer"]');
		if (!calc) {
			sessionStorage.removeItem(KEY);
			if (field) field.value = '';
			return;
		}
		const now = new Date();
		const ymd = now.toISOString().slice(2, 10).replace(/-/g, '');
		const no = `${ymd}-${String(Math.floor(Math.random() * 900) + 100)}`;
		const data = {
			no,
			date: now.toISOString(),
			name: form.elements.name.value.trim(),
			phone: form.elements.phone.value.trim(),
			...calc,
		};
		if (field) field.value = `AN-${no}`;
		try {
			sessionStorage.setItem(KEY, JSON.stringify(data));
		} catch {
			/* storage unavailable: static site still opens it via open(data) */
		}
		window.rzOffer.last = data;
	});

	/* ---------- document ---------- */

	const units = O.calcDe.units;
	const qty = (r) => (r.unit === 'flat' ? '1' : `${num(r.qty, r.unit === 'h' ? 2 : 0)} ${units[r.unit]}`);

	function doc(d) {
		const title = `${D.title} AN-${d.no}`;
		const valid = new Date(d.date);
		valid.setDate(valid.getDate() + O.offer.validDays);
		const deposit = Math.round(d.total * O.offer.deposit * 100) / 100;

		const sender = `${C.legalName} / ${C.owner} / ${C.street} / ${C.zip} ${C.city}`;
		const meta = [
			[D.number, d.no],
			[D.date, day(d.date)],
			[D.valid, day(valid)],
			[D.contact, C.owner],
		];
		const client = [
			[D.client, d.name],
			[D.phone, d.phone],
			[D.service, d.service],
			[D.volume, d.volume],
			[D.route, d.route && `${d.route} · ${d.km} km`],
		];
		if (d.wish) client.push([D.when, `${day(d.wish)}${d.flexible ? ` ${D.flexible}` : ''}`]);

		const block = ([type, body]) =>
			type === 'ol'
				? h(
						'ol',
						{},
						body.map((li) => h('li', { html: li })),
					)
				: h('p', { class: type === 'box' ? 'offer__box' : null, html: body });

		return h(
			'article',
			{ class: 'offer__doc' },
			h(
				'header',
				{ class: 'offer__head' },
				h('div', {}, h('img', { src: O.logo, alt: C.legalName, width: 220, height: 90 }), h('p', { class: 'offer__sender' }, sender)),
				h(
					'div',
					{},
					h('h2', { id: 'offer-title' }, title),
					h(
						'dl',
						{ class: 'offer__meta' },
						meta.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]),
					),
				),
			),
			h(
				'dl',
				{ class: 'offer__client' },
				client.filter(([, v]) => v).map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))),
			),
			h('p', { class: 'offer__box', html: O.agb.notice }),
			h('p', {}, O.agb.intro),
			h(
				'table',
				{ class: 'offer__table' },
				h(
					'thead',
					{},
					h(
						'tr',
						{},
						D.cols.map((c) => h('th', { scope: 'col' }, c)),
					),
				),
				h(
					'tbody',
					{},
					d.rows.map((r, i) =>
						h('tr', {}, h('td', {}, `${i + 1}. ${r.label}`), h('td', {}, qty(r)), h('td', {}, eur(r.price)), h('td', {}, eur(r.total))),
					),
				),
			),
			h(
				'dl',
				{ class: 'offer__totals' },
				h('div', {}, h('dt', {}, D.net), h('dd', {}, eur(d.total))),
				h('div', {}, h('dt', {}, D.vat), h('dd', {}, eur(0))),
				h('div', {}, h('dt', {}, D.gross), h('dd', {}, eur(d.total))),
			),
			h('p', { class: 'offer__small' }, D.basis),
			h('h3', {}, fmt(D.payTitle, pct(O.offer.deposit))),
			h('p', {
				html: `${fmt(D.payDeposit, pct(O.offer.deposit), eur(deposit))}<br>${fmt(D.payRest, pct(1 - O.offer.deposit), eur(d.total - deposit))}`,
			}),
			O.agb.sections.map(([heading, blocks]) => h('section', { class: 'offer__section' }, h('h3', {}, heading), blocks.map(block))),
			h(
				'section',
				{ class: 'offer__section offer__order' },
				h('h3', {}, D.orderTitle),
				h('p', {}, fmt(O.agb.order, `AN-${d.no}`)),
				h('label', { class: 'offer__confirm' }, h('input', { type: 'checkbox' }), O.agb.confirm),
				h('div', { class: 'offer__sign' }, h('span', {}, D.place), h('span', {}, D.sign)),
				h('p', { class: 'offer__small' }, O.agb.legal),
			),
			h(
				'footer',
				{ class: 'offer__foot' },
				h(
					'p',
					{},
					h('strong', {}, C.legalName),
					h('br'),
					`${D.owner} ${C.owner}`,
					h('br'),
					`${C.street}, ${C.zip} ${C.city}`,
					h('br'),
					C.country,
				),
				h('p', {}, `${D.tel} ${C.phone}`, h('br'), `${D.mail} ${C.email}`),
				h(
					'p',
					{},
					`${D.tax} ${C.taxNumber}`,
					h('br'),
					`${D.rule} ${C.taxRule}`,
					h('br'),
					`${D.bank} ${C.bank}`,
					h('br'),
					`${D.iban} ${C.iban}`,
					h('br'),
					`${D.bic} ${C.bic}`,
				),
			),
		);
	}

	/* ---------- dialog ---------- */

	function open(data = window.rzOffer.last || read()) {
		if (!data) return;
		document.querySelector('.offer')?.remove();
		const close = () => dialog.close();
		const dialog = h(
			'dialog',
			{ class: 'offer', 'aria-labelledby': 'offer-title', on: { close: () => document.documentElement.classList.remove('offer-open') } },
			h(
				'div',
				{ class: 'offer__bar' },
				h('p', {}, fmt(O.text.ready, `AN-${data.no}`)),
				h('button', { type: 'button', class: 'btn btn--primary', on: { click: () => window.print() } }, O.text.print),
				h('button', { type: 'button', class: 'btn btn--back', on: { click: close } }, O.text.close),
			),
			doc(data),
		);
		document.body.append(dialog);
		document.documentElement.classList.add('offer-open');
		dialog.showModal();
	}

	window.rzOffer = { open, last: null };

	// WordPress: the form posted and redirected back with ?sent=1.
	const sent = new URLSearchParams(location.search).get('sent') === '1';
	const saved = read();
	if (sent && saved) {
		const notice = form.querySelector('.notice--ok');
		if (notice) notice.append(' ', h('button', { type: 'button', class: 'notice__link', on: { click: () => open(saved) } }, O.text.open));
		open(saved);
	}
})();

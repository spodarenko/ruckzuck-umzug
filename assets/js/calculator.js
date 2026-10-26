/**
 * Price calculator: 4 services × 6 steps, live estimate panel.
 * Prices and copy come from window.RZ_CALC (inc/config.php, inc/content/*.php).
 * Formula: docs/calculator.md.
 */
(() => {
	const root = document.querySelector('[data-calc]');
	if (!root || !window.RZ_CALC) return;

	const { pricing: P, text: T } = window.RZ_CALC;
	const lang = document.documentElement.lang || 'de';
	const STEPS = T.steps.length;
	const KEY = 'rz_calc';

	const $ = (sel) => root.querySelector(sel);
	const el = {
		step: $('[data-calc-step]'),
		bar: $('[data-calc-bar]'),
		q: $('[data-calc-q]'),
		body: $('[data-calc-body]'),
		back: $('[data-calc-back]'),
		next: $('[data-calc-next]'),
		price: $('[data-calc-price]'),
		summary: $('[data-calc-summary]'),
		breakdown: $('[data-calc-breakdown]'),
		request: $('[data-calc-request]'),
		tag: $('[data-calc-tag]'),
	};
	// Design example shown until a service is chosen.
	const example = {
		price: el.price.textContent,
		tag: el.tag.textContent,
		summary: el.summary.innerHTML,
		breakdown: el.breakdown.innerHTML,
	};

	const defaults = {
		step: 0,
		service: null,
		rooms: 2,
		furnish: 'normal',
		items: {},
		kind: 'keller',
		fill: 'halb',
		instrument: 'klavier',
		from: '',
		to: '',
		km: 30,
		floorFrom: 0,
		floorTo: 0,
		elevFrom: false,
		elevTo: false,
		date: '',
		flexible: false,
		montage: 0,
		kartons: 0,
		halteverbot: false,
	};

	let s = { ...defaults };
	try {
		s = { ...defaults, ...JSON.parse(sessionStorage.getItem(KEY) || '{}') };
	} catch {
		/* storage unavailable */
	}
	const save = () => {
		try {
			sessionStorage.setItem(KEY, JSON.stringify(s));
		} catch {
			/* storage unavailable */
		}
	};

	const fmt = (str, ...args) => {
		let i = 0;
		return str.replace(/%(\d)\$s|%[sd]/g, (m, n) => args[n ? n - 1 : i++]);
	};
	const eur = (n) => `${Math.round(n).toLocaleString(lang)} €`;
	const round10 = (n) => Math.round(n / 10) * 10;
	const isPlz = (v) => /^\d{5}$/.test(v);
	const oneAddress = () => s.service === 'entruempelung';

	/* ---------- pricing ---------- */

	const floorFactor = (floor, elevator) => 1 + (elevator ? 0 : floor) * P.floorSurcharge;

	function calculate() {
		if (!s.service) return null;
		const rows = [];
		const vehicle = P.vehicleFlat + s.km * P.perKm;
		const ff = oneAddress()
			? floorFactor(s.floorFrom, s.elevFrom)
			: floorFactor(s.floorFrom, s.elevFrom) * floorFactor(s.floorTo, s.elevTo);
		const labour = (helpers, hours) => {
			const h = Math.max(P.minHours, Math.round(hours * ff * 2) / 2);
			rows.push([fmt(T.rows.labour, helpers, h.toLocaleString(lang), P.helperPerHour), helpers * h * P.helperPerHour]);
		};

		if (s.service === 'umzug') {
			const [helpers, hours] = P.umzugRooms[String(s.rooms)];
			labour(helpers, hours * P.furnishing[s.furnish]);
		} else if (s.service === 'moebel') {
			const hours = Object.entries(s.items).reduce((sum, [id, n]) => sum + (P.moebelItems[id] || 0) * n, 0);
			labour(2, hours);
		} else if (s.service === 'entruempelung') {
			const m3 = Math.round(P.entrKinds[s.kind] * P.fill[s.fill]);
			labour(2, m3 * P.hoursPerM3);
			rows.push([fmt(T.rows.disposal, m3), m3 * P.disposalPerM3]);
		} else if (s.service === 'klavier') {
			const inst = P.klavier[s.instrument];
			rows.push([T.rows.piano, inst.base]);
			const floors = (s.elevFrom ? 0 : s.floorFrom) + (s.elevTo ? 0 : s.floorTo);
			if (floors) rows.push([T.rows.floors, floors * inst.perFloor]);
		}

		rows.push([fmt(T.rows.vehicle, s.km), vehicle]);
		if (s.montage) rows.push([fmt(T.rows.montage, s.montage), s.montage * P.extras.montagePerItem]);
		if (s.kartons) rows.push([fmt(T.rows.kartons, s.kartons), s.kartons * P.extras.kartonPerPiece]);
		if (s.halteverbot) rows.push([T.rows.halteverbot, P.halteverbot * (oneAddress() ? 1 : 2)]);

		let total = rows.reduce((sum, r) => sum + r[1], 0);
		if (s.flexible) {
			const off = total * P.flexDiscount;
			rows.push([T.rows.flex, -off]);
			total -= off;
		}
		const spread = P.spread[s.service];
		return { rows, total, low: round10(total * (1 - spread)), high: round10(total * (1 + spread)) };
	}

	/* ---------- UI builders ---------- */

	const h = (tag, attrs = {}, ...children) => {
		const node = document.createElement(tag);
		Object.entries(attrs).forEach(([k, v]) => {
			if (k === 'on') Object.entries(v).forEach(([ev, fn]) => node.addEventListener(ev, fn));
			else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
		});
		children.flat().forEach((c) => c != null && node.append(c));
		return node;
	};

	const set = (patch) => {
		Object.assign(s, patch);
		save();
		render();
	};

	const seg = (label, options, value, key) =>
		h(
			'div',
			{ class: 'full' },
			h('p', { class: 'field-label' }, label),
			h(
				'div',
				{ class: 'seg', role: 'group', 'aria-label': label },
				Object.entries(options).map(([v, text]) =>
					h(
						'button',
						{
							type: 'button',
							'aria-pressed': String(String(value) === String(v)),
							on: { click: () => set({ [key]: isNaN(v) ? v : Number(v) }) },
						},
						text,
					),
				),
			),
		);

	const input = (label, key, attrs = {}) =>
		h(
			'label',
			{ class: 'field' },
			h('span', {}, label),
			h('input', {
				...attrs,
				value: s[key],
				on: {
					input: (e) => {
						s[key] = attrs.type === 'number' ? Math.max(0, Number(e.target.value) || 0) : e.target.value.trim();
						save();
						refresh();
					},
				},
			}),
		);

	const toggle = (label, key) =>
		h(
			'label',
			{ class: 'toggle full' },
			h('input', { type: 'checkbox', checked: s[key], on: { change: (e) => set({ [key]: e.target.checked }) } }),
			label,
		);

	const stepper = (label, value, onChange) =>
		h(
			'div',
			{ class: 'stepper' },
			h('span', {}, label),
			h(
				'div',
				{},
				h('button', { type: 'button', 'aria-label': `${label} −`, on: { click: () => onChange(Math.max(0, value - 1)) } }, '−'),
				h('output', {}, String(value)),
				h('button', { type: 'button', 'aria-label': `${label} +`, on: { click: () => onChange(value + 1) } }, '+'),
			),
		);

	const floorOpts = Object.fromEntries(T.floorOpts.map((t, i) => [i, t]));
	const icons = { umzug: 'truck', moebel: 'pin', entruempelung: 'box', klavier: 'piano' };
	const iconSvg = (name) => {
		const tpl = root.querySelector(`[data-icon-tpl="${name}"] svg`);
		return tpl ? tpl.cloneNode(true) : null;
	};

	const views = [
		// 0 — service
		() =>
			h(
				'div',
				{ class: 'calc__options' },
				Object.entries(T.services).map(([id, [title, sub]]) =>
					h(
						'button',
						{
							type: 'button',
							class: 'option',
							'aria-pressed': String(s.service === id),
							on: { click: () => set({ service: id, step: 1 }) },
						},
						h('span', { class: 'icon-badge' }, iconSvg(icons[id])),
						h('span', { class: 'option__text' }, h('strong', {}, title), h('small', {}, sub)),
					),
				),
			),
		// 1 — details
		() => {
			const f = h('div', { class: 'fields' });
			if (s.service === 'umzug') {
				f.append(
					seg(T.rooms, Object.fromEntries(T.roomsOpts.map((t, i) => [i + 1, t])), s.rooms, 'rooms'),
					seg(T.furnish, T.furnishOpts, s.furnish, 'furnish'),
				);
			} else if (s.service === 'moebel') {
				f.append(h('p', { class: 'field-label full' }, T.items));
				Object.entries(T.itemNames).forEach(([id, name]) =>
					f.append(stepper(name, s.items[id] || 0, (n) => set({ items: { ...s.items, [id]: n } }))),
				);
			} else if (s.service === 'entruempelung') {
				f.append(seg(T.kind, T.kindOpts, s.kind, 'kind'), seg(T.fill, T.fillOpts, s.fill, 'fill'));
			} else {
				f.append(seg(T.instrument, T.instrOpts, s.instrument, 'instrument'));
			}
			return f;
		},
		// 2 — addresses
		() => {
			const plz = { inputmode: 'numeric', maxlength: 5, pattern: '\\d{5}', placeholder: '38440', autocomplete: 'postal-code' };
			const f = h('div', { class: 'fields' }, input(oneAddress() ? T.at : T.from, 'from', plz));
			if (!oneAddress()) f.append(input(T.to, 'to', { ...plz, placeholder: '10115' }));
			f.append(input(T.km, 'km', { type: 'number', min: 1, max: 1500, inputmode: 'numeric', class: oneAddress() ? '' : 'full' }));
			f.append(seg(oneAddress() ? T.floor : T.floorFrom, floorOpts, s.floorFrom, 'floorFrom'));
			if (s.floorFrom) f.append(toggle(T.elevator, 'elevFrom'));
			if (!oneAddress()) {
				f.append(seg(T.floorTo, floorOpts, s.floorTo, 'floorTo'));
				if (s.floorTo) f.append(toggle(T.elevator, 'elevTo'));
			}
			return f;
		},
		// 3 — date
		() => {
			const min = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
			return h('div', { class: 'fields' }, input(T.date, 'date', { type: 'date', min, class: 'full' }), toggle(T.flexible, 'flexible'));
		},
		// 4 — extras
		() => {
			const f = h('div', { class: 'fields' });
			if (s.service === 'umzug' || s.service === 'moebel') f.append(stepper(T.montage, s.montage, (n) => set({ montage: n })));
			if (s.service === 'umzug') f.append(stepper(T.kartons, s.kartons, (n) => set({ kartons: n })));
			f.append(toggle(T.halteverbot, 'halteverbot'));
			return f;
		},
		// 5 — result
		() => {
			const r = calculate();
			return h(
				'div',
				{ class: 'calc__result' },
				h('p', { class: 'calc__price' }, `${T.approx} ${Math.round(r.low).toLocaleString(lang)} – ${eur(r.high)}`),
				h('p', { class: 'muted' }, T.note),
				h(
					'div',
					{ class: 'calc__result-ctas' },
					h('a', { class: 'btn btn--primary', href: '#kontakt', on: { click: toForm } }, T.request),
					h('a', { class: 'btn btn--wa', href: waLink(r), target: '_blank', rel: 'noopener' }, T.whatsapp),
				),
			);
		},
	];

	/* ---------- validation, summary, handoff ---------- */

	const valid = () => {
		switch (s.step) {
			case 0:
				return !!s.service;
			case 1:
				return s.service !== 'moebel' || Object.values(s.items).some((n) => n > 0);
			case 2:
				return isPlz(s.from) && (oneAddress() || isPlz(s.to)) && s.km > 0;
			default:
				return true;
		}
	};

	const summaryText = (r) => {
		const lines = [
			`${T.summary.service}: ${T.services[s.service][0]}`,
			s.from && `${T.summary.route}: ${s.from}${oneAddress() ? '' : ` → ${s.to}`}`,
			`${T.summary.km}: ${s.km} km`,
			s.date && `${T.summary.date}: ${s.date}${s.flexible ? ' (±3)' : ''}`,
			...r.rows.map(([l, a]) => `${l}: ${eur(a)}`),
			`${T.rows.total}: ${T.approx} ${Math.round(r.low).toLocaleString(lang)} – ${eur(r.high)}`,
		];
		return lines.filter(Boolean).join('\n');
	};

	function waLink(r) {
		const base = document.querySelector('.btn--wa')?.getAttribute('href') || '';
		const num = base.match(/wa\.me\/(\d+)/);
		return num ? `https://wa.me/${num[1]}?text=${encodeURIComponent(summaryText(r))}` : base;
	}

	function toForm(e) {
		const r = calculate();
		if (!r) return;
		const form = document.querySelector('[data-quote-form]');
		if (!form) return;
		e.preventDefault();
		form.querySelector('[data-estimate-field]').value = summaryText(r);
		const route = form.querySelector('[data-route-field]');
		if (route && s.from) route.value = oneAddress() ? s.from : `${s.from} → ${s.to}`;
		const select = form.querySelector('[data-service-field]');
		const opt = select && select.querySelector(`[data-id="${s.service}"]`);
		if (opt) select.value = opt.value;
		const msg = form.querySelector('[data-message-field]');
		if (msg && !msg.value) msg.value = `${T.rows.total}: ${T.approx} ${Math.round(r.low).toLocaleString(lang)} – ${eur(r.high)}`;
		document.getElementById('kontakt').scrollIntoView({ behavior: 'smooth' });
		setTimeout(() => form.querySelector('input[name="name"]').focus({ preventScroll: true }), 700);
	}

	/* ---------- render ---------- */

	let lastPrice = '';

	function refresh() {
		el.next.disabled = !valid();
		const r = calculate();
		el.summary.replaceChildren();
		el.breakdown.replaceChildren();
		el.request.hidden = !r;

		if (!r) {
			el.price.textContent = example.price;
			el.tag.textContent = example.tag;
			el.summary.innerHTML = example.summary;
			el.breakdown.innerHTML = example.breakdown;
			return;
		}
		el.tag.textContent = T.tag;

		const price = `${T.approx} ${Math.round(r.low).toLocaleString(lang)} – ${eur(r.high)}`;
		if (price !== lastPrice) {
			el.price.textContent = price;
			el.price.classList.remove('bump');
			void el.price.offsetWidth; // restart animation
			el.price.classList.add('bump');
			lastPrice = price;
		}

		const add = (k, v) => v && el.summary.append(h('div', {}, h('dt', {}, k), h('dd', {}, v)));
		add(T.summary.service, T.services[s.service][0]);
		if (s.from) add(T.summary.route, oneAddress() ? s.from : `${s.from} → ${s.to || '…'}`);
		add(T.summary.km, `${T.approx} ${s.km} km`);
		if (s.step >= 2) {
			const fl = (f) => T.floorOpts[f];
			add(T.summary.floor, oneAddress() ? fl(s.floorFrom) : `${fl(s.floorFrom)} → ${fl(s.floorTo)}`);
		}
		if (s.date) add(T.summary.date, new Date(s.date).toLocaleDateString(lang));
		const ex = [s.montage && fmt(T.rows.montage, s.montage), s.kartons && fmt(T.rows.kartons, s.kartons)].filter(Boolean);
		if (ex.length) add(T.summary.extras, ex.join(' · '));

		el.breakdown.append(h('h4', {}, T.breakdown));
		r.rows.forEach(([label, amount]) => el.breakdown.append(h('div', { class: 'row' }, h('span', {}, label), h('span', {}, eur(amount)))));
		el.breakdown.append(h('div', { class: 'row total' }, h('span', {}, T.rows.total), h('span', {}, eur(r.total))));
	}

	function render() {
		el.step.textContent = fmt(T.stepOf, s.step + 1, STEPS);
		el.bar.style.width = `${((s.step + 1) / STEPS) * 100}%`;
		el.q.textContent = T.questions[s.step];
		el.body.replaceChildren(views[s.step]());
		el.back.disabled = s.step === 0;
		el.next.hidden = s.step === STEPS - 1;
		refresh();
	}

	el.back.addEventListener('click', () => set({ step: Math.max(0, s.step - 1) }));
	el.next.addEventListener('click', () => valid() && set({ step: Math.min(STEPS - 1, s.step + 1) }));
	el.request.addEventListener('click', toForm);

	// "Preis berechnen" links in the services section jump in with the service preselected.
	document
		.querySelectorAll('[data-service]')
		.forEach((link) => link.addEventListener('click', () => set({ service: link.dataset.service, step: 1 })));

	if (s.step > 0 && !s.service) s.step = 0;
	render();
})();

/**
 * Price calculator: 4 services × 6 steps, live estimate panel.
 * Prices and copy come from window.RZ_CALC (inc/config.php, inc/content/*.php).
 * Distance: window.rzDistance (distance.js). Formula: docs/calculator.md.
 * Exposes window.rzCalc.offer() for the offer document (offer.js).
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
		tag: $('[data-calc-tag]'),
		details: $('[data-calc-details]'),
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
		area: 50, // m², clamped to the room range
		items: {},
		kind: 'keller',
		fill: 'halb',
		instrument: 'klein',
		from: '',
		to: '',
		fromLabel: '', // what the visitor sees in the field, e.g. "38440 Wolfsburg"
		toLabel: '',
		km: 0,
		kmSource: '', // route | estimate
		anfahrtKm: 0, // base (Wolfsburg) > pickup, one way
		anfahrtFor: '',
		kmPair: '',
		driveMin: null,
		places: [],
		floorFrom: 0,
		floorTo: 0,
		elevFrom: false,
		elevTo: false,
		date: '',
		flexible: false,
		montage: 0,
		loadH: 1, // Transporter mit Fahrer: hours given by the customer
		unloadH: 1,
		waitH: 0,
		kartons: 0,
		pack: 0,
		unpack: 0,
		tuning: false,
		halteverbot: false,
	};

	let s = { ...defaults };
	try {
		s = { ...defaults, ...JSON.parse(sessionStorage.getItem(KEY) || '{}') };
	} catch {
		/* storage unavailable */
	}
	if (!P.klavier.items[s.instrument]) s.instrument = defaults.instrument;
	// Older sessions stored null here.
	if (typeof s.loadH !== 'number') s.loadH = defaults.loadH;
	if (typeof s.unloadH !== 'number') s.unloadH = defaults.unloadH;
	const save = () => {
		try {
			sessionStorage.setItem(KEY, JSON.stringify(s));
		} catch {
			/* storage unavailable */
		}
	};

	const fmt = (str, ...args) => {
		let i = 0;
		return str.replace(/%(\d)\$[sd]|%[sd]/g, (m, n) => args[n ? n - 1 : i++]);
	};
	const num = (n, digits = 2) => n.toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
	const eur = (n) => `${num(n)} €`;
	const eurRound = (n) => `${num(Math.round(n), 0)} €`; // panel: estimate, no cents
	const round2 = (n) => Math.round(n * 100) / 100;
	const round10 = (n) => Math.round(n / 10) * 10;
	const isPlz = (v) => /^\d{5}$/.test(v);
	const oneAddress = () => s.service === 'entruempelung';
	const isTransporter = () => s.service === 'transporter';
	const range = (r) => `${T.approx} ${Math.round(r.low).toLocaleString(lang)} – ${Math.round(r.high).toLocaleString(lang)} €`;

	/* ---------- volume: rooms fix the m² range, m² > m³ ---------- */

	const areaRange = () => P.areaRanges[String(s.rooms)];
	const area = () => {
		const [min, max] = areaRange();
		return Math.min(max, Math.max(min, Math.round(s.area) || min));
	};
	const volume = () => Math.round(area() * P.m3PerM2 * 10) / 10;
	const volumeText = () => fmt(T.volumeFormula, area(), num(P.m3PerM2, 1), num(volume(), 1));

	/* ---------- pricing ---------- */

	const floorFactor = (floor, elevator) => 1 + (elevator ? 0 : floor) * P.floorSurcharge;
	// Floors charged for a piano: from klavier.fromFloor upwards, none with elevator.
	const pianoFloors = (floor, elevator) => (elevator ? 0 : Math.max(0, floor - P.klavier.fromFloor + 1));

	/** L = copy set for labels (UI language, or German for the offer document). */
	function calculate(L = T) {
		if (!s.service) return null;
		const rows = [];
		const row = (label, qty, unit, price) => rows.push({ label, qty, unit, price, total: round2(qty * price) });
		const ff = oneAddress()
			? floorFactor(s.floorFrom, s.elevFrom)
			: floorFactor(s.floorFrom, s.elevFrom) * floorFactor(s.floorTo, s.elevTo);

		// Crew = 1 driver + helpers; work hours and drive time are paid per person.
		let crew = 2;
		const labour = (people, hours) => {
			crew = people;
			const h = Math.max(P.minHours, Math.round(hours * ff * 2) / 2);
			row(L.rows.driver, h, 'h', P.driverPerHour);
			row(fmt(L.rows.helpers, people - 1), h * (people - 1), 'h', P.helperPerHour);
		};

		if (isTransporter()) {
			// Own tariff: hours given by the customer + km, no drive time, no Anfahrt.
			const t = P.transporter;
			row(L.rows.load, s.loadH, 'h', t.perHour);
			row(L.rows.unload, s.unloadH, 'h', t.perHour);
			if (s.waitH) row(L.rows.wait, s.waitH, 'h', t.perHour);
			if (s.km) row(fmt(L.rows.vehicle, window.RZ_CALC.maxVehicle), s.km, 'km', t.perKm);
		} else if (s.service === 'umzug') {
			const [people, hours] = P.umzugRooms[String(s.rooms)];
			labour(people, hours);
		} else if (s.service === 'moebel') {
			const hours = Object.entries(s.items).reduce((sum, [id, n]) => sum + (P.moebelItems[id] || 0) * n, 0);
			labour(2, hours);
		} else if (s.service === 'entruempelung') {
			const m3 = Math.round(P.entrKinds[s.kind] * P.fill[s.fill]);
			labour(2, m3 * P.hoursPerM3);
			row(fmt(L.rows.disposal, m3), m3, 'm3', P.disposalPerM3);
		} else if (s.service === 'klavier') {
			crew = P.klavier.persons;
			const inst = P.klavier.items[s.instrument];
			row(fmt(L.rows.piano, L.instrNames[s.instrument], crew), 1, 'pc', inst.base);
			const floors = pianoFloors(s.floorFrom, s.elevFrom) + pianoFloors(s.floorTo, s.elevTo);
			if (floors) row(L.rows.floors, floors, 'floor', inst.perFloor);
		}

		if (s.km && !isTransporter()) {
			const driveH = Math.max(0.25, Math.round((s.driveMin ? s.driveMin / 60 : s.km / P.avgSpeedKmh) * 4) / 4);
			row(fmt(L.rows.drive, crew - 1), driveH, 'h', P.driverPerHour + (crew - 1) * P.helperPerHour);
			// Entrümpelung: the only route is base > address, so it is the Anfahrt.
			if (!oneAddress()) row(fmt(L.rows.vehicle, window.RZ_CALC.maxVehicle), s.km, 'km', P.perKm);
		}
		const anfahrt = isTransporter() ? 0 : oneAddress() ? s.km : s.anfahrtFor === s.from ? s.anfahrtKm : 0;
		if (anfahrt) row(fmt(L.rows.anfahrt, P.distance.basePlz), anfahrt, 'km', P.anfahrtPerKm);

		const boxHours = (n) => round2((n * P.extras.minutesPerBox) / 60);
		// Extras only count where the extras step offers them (state survives a service switch).
		const moving = s.service === 'umzug';
		if (moving && s.pack) row(fmt(L.rows.pack, s.pack, P.extras.minutesPerBox), boxHours(s.pack), 'h', P.extras.packPerHour);
		if (moving && s.unpack) row(fmt(L.rows.unpack, s.unpack, P.extras.minutesPerBox), boxHours(s.unpack), 'h', P.extras.unpackPerHour);
		if ((moving || s.service === 'moebel') && s.montage) row(L.rows.montage, s.montage, 'pc', P.extras.montagePerItem);
		if (moving && s.kartons) row(L.rows.kartons, s.kartons, 'pc', P.extras.kartonPerPiece);
		if (s.tuning && s.service === 'klavier') row(L.rows.tuning, 1, 'flat', P.klavier.tuning);
		if (s.halteverbot) row(L.rows.halteverbot, oneAddress() ? 1 : 2, 'pc', P.halteverbot);

		let total = rows.reduce((sum, r) => sum + r.total, 0);
		if (s.flexible) {
			const off = round2(total * P.flexDiscount);
			rows.push({ label: L.rows.flex, qty: 1, unit: 'flat', price: -off, total: -off });
			total -= off;
		}
		total = round2(total);
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
				{ class: key.startsWith('floor') ? 'seg seg--floor' : 'seg', role: 'group', 'aria-label': label },
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

	const toggle = (label, key) =>
		h(
			'label',
			{ class: 'toggle full' },
			h('input', { type: 'checkbox', checked: s[key], on: { change: (e) => set({ [key]: e.target.checked }) } }),
			label,
		);

	const stepper = (label, value, onChange, step = 1) =>
		h(
			'div',
			{ class: 'stepper' },
			h('span', {}, label),
			h(
				'div',
				{},
				h('button', { type: 'button', 'aria-label': `${label} −`, on: { click: () => onChange(Math.max(0, value - step)) } }, '−'),
				h('output', {}, value % 1 ? num(value, 1) : String(value)),
				h('button', { type: 'button', 'aria-label': `${label} +`, on: { click: () => onChange(value + step) } }, '+'),
			),
		);

	const floorOpts = Object.fromEntries(T.floorOpts.map((t, i) => [i, t]));
	const icons = { umzug: 'truck', moebel: 'pin', entruempelung: 'box', klavier: 'piano', transporter: 'truck' };
	const iconSvg = (name) => {
		const tpl = root.querySelector(`[data-icon-tpl="${name}"] svg`);
		return tpl ? tpl.cloneNode(true) : null;
	};

	/* ---------- distance (PLZ > km) ---------- */

	const route = () => (oneAddress() ? [P.distance.basePlz, s.from] : [s.from, s.to]);
	let pending = '';

	// Distance is a result, not an input: customers cannot lower the km (and the price).
	function kmStatus(key, ...args) {
		const node = root.querySelector('[data-km-status]');
		if (!node) return;
		const result = s.km && key !== 'loading' && key !== 'notFound';
		node.textContent = key ? `${fmt(T.kmStatus[key], ...args)}${result ? ` · ${s.km} km` : ''}` : '';
		node.dataset.state = key || '';
	}

	function showKm() {
		const [a, b] = s.places;
		kmStatus(s.kmSource, a, b);
	}

	async function lookup() {
		const [a, b] = route();
		if (!isPlz(a) || !isPlz(b) || !window.rzDistance) return;
		const pair = `${a}-${b}`;
		if (pair === s.kmPair) return showKm();
		pending = pair;
		kmStatus('loading');
		try {
			const r = await window.rzDistance.get(a, b);
			if (pending !== pair) return;
			Object.assign(s, { km: r.km, driveMin: r.minutes, kmSource: r.source, kmPair: pair, places: [r.from, r.to] });
			save();
			showKm();
			refresh();
			if (!oneAddress() && s.anfahrtFor !== a) {
				const base = a === P.distance.basePlz ? { km: 0 } : await window.rzDistance.get(P.distance.basePlz, a).catch(() => ({ km: 0 }));
				if (pending !== pair) return;
				Object.assign(s, { anfahrtKm: base.km, anfahrtFor: a });
				save();
				refresh();
			}
		} catch {
			if (pending !== pair) return;
			Object.assign(s, { km: 0, driveMin: null, kmPair: '', kmSource: '', places: [] });
			kmStatus('notFound');
			save();
			refresh();
		}
	}

	/** "PLZ oder Ort" field with suggestions, as on CHECK24. Stores the PLZ in s[key]. */
	let placeSeq = 0;
	function placeField(label, key, example) {
		const id = `rz-place-${++placeSeq}`;
		const list = h('ul', { class: 'calc__suggest', id: `${id}-list`, role: 'listbox', hidden: true });
		const field = h('input', {
			type: 'text',
			id,
			role: 'combobox',
			autocomplete: 'off',
			'aria-autocomplete': 'list',
			'aria-expanded': 'false',
			'aria-controls': list.id,
			placeholder: fmt(T.plzPh, example),
			value: s[`${key}Label`] || s[key],
		});
		let items = [];
		let active = -1;
		let seq = 0;

		const commit = (plz, text) => {
			const changed = s[key] !== plz;
			s[key] = plz;
			s[`${key}Label`] = text;
			save();
			if (!changed) return;
			s.kmPair = '';
			pending = '';
			refresh();
			lookup();
		};
		const show = () => {
			list.replaceChildren(
				...items.map((it, i) =>
					h(
						'li',
						{
							id: `${id}-${i}`,
							role: 'option',
							'aria-selected': String(i === active),
							on: {
								mousedown: (e) => {
									e.preventDefault(); // keep focus in the field
									choose(it);
								},
							},
						},
						h('strong', {}, it.plz),
						` ${it.place}`,
					),
				),
			);
			list.hidden = !items.length;
			field.setAttribute('aria-expanded', String(items.length > 0));
			if (active >= 0) field.setAttribute('aria-activedescendant', `${id}-${active}`);
			else field.removeAttribute('aria-activedescendant');
		};
		const close = () => {
			items = [];
			active = -1;
			show();
		};
		function choose(it) {
			field.value = `${it.plz} ${it.place}`;
			commit(it.plz, field.value);
			close();
		}

		field.addEventListener('input', async () => {
			const q = field.value.trim();
			const typedPlz = q.match(/^\d{5}/);
			commit(typedPlz ? typedPlz[0] : '', q); // a full PLZ works without picking
			const my = ++seq;
			const found = q.length >= 2 && window.rzDistance ? await window.rzDistance.search(q) : [];
			if (my !== seq) return;
			items = found;
			active = -1;
			show();
		});
		field.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				if (!items.length) return;
				e.preventDefault();
				active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
				show();
			} else if (e.key === 'Enter' && active >= 0) {
				e.preventDefault();
				choose(items[active]);
			} else if (e.key === 'Escape') close();
		});
		field.addEventListener('blur', close);

		return h('label', { class: 'field calc__place', for: id }, h('span', {}, label), field, list);
	}

	/* ---------- calendar (own widget: same look in every browser) ---------- */

	const pad = (n) => String(n).padStart(2, '0');
	const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	const parseIso = (v) => {
		const [y, m, d] = v.split('-').map(Number);
		return new Date(y, m - 1, d);
	};
	const MIN_DAYS_AHEAD = 2;

	function calendar() {
		const min = new Date();
		min.setHours(0, 0, 0, 0);
		min.setDate(min.getDate() + MIN_DAYS_AHEAD);
		const start = s.date ? parseIso(s.date) : min;
		let view = new Date(start.getFullYear(), start.getMonth(), 1);

		const title = h('strong', { class: 'cal__title', 'aria-live': 'polite' });
		const grid = h('div', { class: 'cal__grid', role: 'grid' });
		const nav = (step, label, text) =>
			h(
				'button',
				{
					type: 'button',
					class: 'cal__nav',
					'aria-label': label,
					on: {
						click: () => {
							view = new Date(view.getFullYear(), view.getMonth() + step, 1);
							draw();
						},
					},
				},
				text,
			);
		const prev = nav(-1, T.calPrev, '‹');
		const next = nav(1, T.calNext, '›');

		// Monday-first weekday names in the page language.
		const weekdays = Array.from({ length: 7 }, (_, i) =>
			new Date(2024, 0, 1 + i).toLocaleDateString(lang, { weekday: 'short' }).replace('.', ''),
		);

		function draw() {
			title.textContent = view.toLocaleDateString(lang, { month: 'long', year: 'numeric' });
			prev.disabled = view <= new Date(min.getFullYear(), min.getMonth(), 1);
			const first = (view.getDay() + 6) % 7; // Monday = 0
			const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
			grid.replaceChildren(
				...weekdays.map((w) => h('span', { class: 'cal__wd' }, w)),
				...Array.from({ length: first }, () => h('span')),
				...Array.from({ length: days }, (_, i) => {
					const d = new Date(view.getFullYear(), view.getMonth(), i + 1);
					const iso = toIso(d);
					return h(
						'button',
						{
							type: 'button',
							class: 'cal__day',
							disabled: d < min,
							'aria-pressed': String(s.date === iso),
							'aria-label': d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' }),
							on: {
								click: () => {
									s.date = iso;
									save();
									draw();
									refresh();
								},
							},
						},
						String(i + 1),
					);
				}),
			);
		}
		draw();
		return h('div', { class: 'cal' }, h('div', { class: 'cal__head' }, prev, title, next), grid);
	}

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
							on: { click: () => set({ service: id, step: 1, kmPair: '' }) },
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
				const roomOpts = Object.fromEntries(T.roomsOpts.map((t, i) => [i + 1, t]));
				const [min, max] = areaRange();
				const formula = h('p', { class: 'calc__formula full', 'aria-live': 'polite' }, volumeText());
				const fill = () => slider.style.setProperty('--fill', `${((area() - min) / (max - min)) * 100}%`);
				const sync = (v, from) => {
					s.area = v;
					if (from !== slider) slider.value = area();
					if (from !== field) field.value = area();
					fill();
					formula.textContent = volumeText();
					save();
					refresh();
				};
				const slider = h('input', {
					type: 'range',
					class: 'range',
					min,
					max,
					step: 1,
					value: area(),
					'aria-label': T.area,
					on: { input: (e) => sync(Number(e.target.value), slider) },
				});
				fill();
				const field = h('input', {
					type: 'number',
					min,
					max,
					inputmode: 'numeric',
					value: area(),
					'aria-label': T.area,
					// Typing is free; leaving the field snaps the value into the room's range.
					on: { change: (e) => sync(Number(e.target.value), null) },
				});
				f.append(
					seg(T.rooms, roomOpts, s.rooms, 'rooms'),
					h(
						'div',
						{ class: 'full' },
						h('p', { class: 'field-label field-label--caps' }, fmt(T.area, min, max)),
						h('div', { class: 'calc__area' }, slider, h('label', { class: 'calc__area-num' }, field, 'm²')),
					),
					formula,
				);
			} else if (s.service === 'moebel') {
				f.append(h('p', { class: 'field-label full' }, T.items));
				Object.entries(T.itemNames).forEach(([id, name]) =>
					f.append(stepper(name, s.items[id] || 0, (n) => set({ items: { ...s.items, [id]: n } }))),
				);
			} else if (isTransporter()) {
				const rate = eur(P.transporter.perHour);
				f.append(
					stepper(fmt(T.loadHours, rate), s.loadH, (n) => set({ loadH: n }), 0.5),
					stepper(fmt(T.unloadHours, rate), s.unloadH, (n) => set({ unloadH: n }), 0.5),
					stepper(fmt(T.waitHours, rate), s.waitH, (n) => set({ waitH: n }), 0.5),
					h('p', { class: 'calc__formula full' }, T.equipment),
				);
			} else if (s.service === 'entruempelung') {
				f.append(seg(T.kind, T.kindOpts, s.kind, 'kind'), seg(T.fill, T.fillOpts, s.fill, 'fill'));
			} else {
				f.append(
					h('p', { class: 'field-label full' }, T.instrument),
					h(
						'div',
						{ class: 'calc__options calc__options--compact full', role: 'group', 'aria-label': T.instrument },
						Object.entries(T.instrNames).map(([id, name]) =>
							h(
								'button',
								{
									type: 'button',
									class: 'option option--compact',
									'aria-pressed': String(s.instrument === id),
									on: { click: () => set({ instrument: id }) },
								},
								h('strong', {}, name),
								h('small', {}, fmt(T.instrFrom, eur(P.klavier.items[id].base))),
							),
						),
					),
				);
			}
			return f;
		},
		// 2 — addresses: PLZ > km automatically, km stays editable
		() => {
			const f = h('div', { class: 'fields' }, placeField(oneAddress() ? T.at : T.from, 'from', 'Wolfsburg'));
			if (!oneAddress()) f.append(placeField(T.to, 'to', 'Berlin'));
			f.append(h('p', { class: 'calc__km-status full', 'data-km-status': true, 'aria-live': 'polite' }));
			if (isTransporter()) return f; // hours are given directly, floors don't change the price
			f.append(seg(oneAddress() ? T.floor : T.floorFrom, floorOpts, s.floorFrom, 'floorFrom'));
			if (s.floorFrom) f.append(toggle(T.elevator, 'elevFrom'));
			if (!oneAddress()) {
				f.append(seg(T.floorTo, floorOpts, s.floorTo, 'floorTo'));
				if (s.floorTo) f.append(toggle(T.elevator, 'elevTo'));
			}
			queueMicrotask(() => (s.kmPair ? showKm() : lookup()));
			return f;
		},
		// 3 — date
		() =>
			h(
				'div',
				{ class: 'fields' },
				h('div', { class: 'full' }, h('p', { class: 'field-label' }, T.date), calendar()),
				toggle(T.flexible, 'flexible'),
			),
		// 4 — extras
		() => {
			const f = h('div', { class: 'fields' });
			if (s.service === 'umzug' || s.service === 'moebel') f.append(stepper(T.montage, s.montage, (n) => set({ montage: n })));
			if (s.service === 'umzug') {
				f.append(
					stepper(T.kartons, s.kartons, (n) => set({ kartons: n })),
					stepper(fmt(T.pack, eur(P.extras.packPerHour)), s.pack, (n) => set({ pack: n })),
					stepper(fmt(T.unpack, eur(P.extras.unpackPerHour)), s.unpack, (n) => set({ unpack: n })),
				);
			}
			if (s.service === 'klavier') f.append(toggle(fmt(T.tuning, eur(P.klavier.tuning)), 'tuning'));
			f.append(toggle(T.halteverbot, 'halteverbot'));
			return f;
		},
		// 5 — result
		() => {
			const r = calculate();
			return h(
				'div',
				{ class: 'calc__result' },
				h('p', { class: 'calc__price' }, range(r)),
				h('p', { class: 'muted' }, T.note),
				h(
					'div',
					{ class: 'calc__result-ctas' },
					h('a', { class: 'btn btn--primary', href: '#kontakt', on: { click: toForm } }, T.request),
					h('a', { class: 'btn btn--glass', href: waLink(r), target: '_blank', rel: 'noopener' }, iconSvg('whatsapp'), T.whatsapp),
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

	// short: place names only (PLZ as fallback) so the summary panel stays on one line.
	const routeText = (short = false) => {
		const [a, b] = s.places;
		const plzPlace = (plz, place) => (place ? (short ? place : `${plz} ${place}`) : plz);
		return oneAddress() ? plzPlace(s.from, b) : `${plzPlace(s.from, a)} > ${plzPlace(s.to, b)}`;
	};

	const serviceTitle = (L = T) =>
		s.service === 'klavier' ? `${L.services.klavier[0]} · ${L.instrNames[s.instrument]}` : L.services[s.service][0];

	const summaryText = (r) => {
		const lines = [
			`${T.summary.service}: ${serviceTitle()}`,
			s.service === 'umzug' && `${T.summary.volume}: ${volumeText()}`,
			s.from && `${T.summary.route}: ${routeText()}`,
			`${T.summary.km}: ${s.km} km`,
			s.date && `${T.summary.date}: ${s.date}${s.flexible ? ' (±3)' : ''}`,
			...r.rows.map((row) => `${row.label}: ${eur(row.total)}`),
			`${T.rows.total}: ${eur(r.total)} (${range(r)})`,
			T.vatNote,
		];
		return lines.filter(Boolean).join('\n');
	};

	function waLink(r) {
		const base = document.querySelector('.btn--wa')?.getAttribute('href') || '';
		const wa = base.match(/wa\.me\/(\d+)/);
		return wa ? `https://wa.me/${wa[1]}?text=${encodeURIComponent(summaryText(r))}` : base;
	}

	function toForm(e) {
		const r = calculate();
		if (!r) return;
		const form = document.querySelector('[data-quote-form]');
		if (!form) return;
		e.preventDefault();
		form.querySelector('[data-estimate-field]').value = summaryText(r);
		const routeField = form.querySelector('[data-route-field]');
		if (routeField && s.from) routeField.value = routeText();
		const select = form.querySelector('[data-service-field]');
		const opt = select && select.querySelector(`[data-id="${s.service}"]`);
		if (opt) select.value = opt.value;
		const msg = form.querySelector('[data-message-field]');
		if (msg && !msg.value) msg.value = `${T.rows.total}: ${eur(r.total)} (${range(r)})`;
		document.getElementById('kontakt').scrollIntoView({ behavior: 'smooth' });
		setTimeout(() => form.querySelector('input[name="name"]').focus({ preventScroll: true }), 700);
	}

	/** Snapshot for the offer document, labels in the document language (German). */
	window.rzCalc = {
		offer(L) {
			const r = calculate(L);
			if (!r) return null;
			return {
				service: serviceTitle(L),
				route: s.from ? routeText() : '',
				km: s.km,
				volume: s.service === 'umzug' ? volumeText() : '',
				wish: s.date,
				flexible: s.flexible,
				rows: r.rows,
				total: r.total,
			};
		},
	};

	/* ---------- render ---------- */

	let lastPrice = '';
	let detailsOpen = false;

	function refresh() {
		el.next.disabled = !valid();
		const r = calculate();
		el.summary.replaceChildren();
		el.breakdown.replaceChildren();

		if (!r) {
			el.price.textContent = example.price;
			el.tag.textContent = example.tag;
			el.summary.innerHTML = example.summary;
			el.breakdown.innerHTML = example.breakdown;
			return;
		}
		el.tag.textContent = T.tag;

		const price = range(r);
		if (price !== lastPrice) {
			el.price.textContent = price;
			lastPrice = price;
		}

		const add = (k, v) => v && el.summary.append(h('div', {}, h('dt', {}, k), h('dd', {}, v)));
		add(T.summary.service, s.service === 'umzug' ? `${serviceTitle()} · ${T.roomsOpts[s.rooms - 1]}` : serviceTitle());
		if (s.from) add(T.summary.route, oneAddress() ? routeText(true) : `${routeText(true)}${s.to ? '' : ' > …'}`);
		if (s.km) add(T.summary.km, `${s.kmSource === 'estimate' ? `${T.approx} ` : ''}${s.km} km`);
		if (s.step >= 2 && !isTransporter()) {
			const fl = (f) => T.floorOpts[f];
			add(T.summary.floor, oneAddress() ? fl(s.floorFrom) : `${fl(s.floorFrom)} > ${fl(s.floorTo)}`);
		}
		if (s.date) add(T.summary.date, parseIso(s.date).toLocaleDateString(lang));
		const moving = s.service === 'umzug';
		const ex = [
			(moving || s.service === 'moebel') && s.montage && `${T.rows.montage} (${s.montage})`,
			moving && s.kartons && `${T.rows.kartons} (${s.kartons})`,
			moving && s.pack && fmt(T.rows.pack, s.pack, P.extras.minutesPerBox),
			moving && s.unpack && fmt(T.rows.unpack, s.unpack, P.extras.minutesPerBox),
			s.tuning && s.service === 'klavier' && T.rows.tuning,
		].filter(Boolean);
		if (ex.length) add(T.summary.extras, ex.join(' · '));

		// Only the total is visible; the rows open with "Details".
		const rowsBox = h(
			'div',
			{ class: 'calc__rows', id: 'calc-rows', 'data-calc-rows': true, hidden: !detailsOpen },
			h('h4', {}, T.breakdown),
		);
		r.rows.forEach((row) =>
			rowsBox.append(
				h(
					'div',
					{ class: 'row' },
					h(
						'span',
						{},
						row.label,
						row.unit === 'flat'
							? null
							: h('small', {}, `${num(row.qty, row.unit === 'h' ? 2 : 0)} ${T.units[row.unit]} × ${eur(row.price)}`),
					),
					h('span', {}, eurRound(row.total)),
				),
			),
		);
		el.breakdown.append(rowsBox, h('div', { class: 'row total' }, h('span', {}, T.rows.total), h('span', {}, eurRound(r.total))));
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
	// Breakdown stays folded behind "Details" until the visitor asks for it.
	el.details.addEventListener('click', () => {
		detailsOpen = !detailsOpen;
		el.details.setAttribute('aria-expanded', String(detailsOpen));
		const rows = el.breakdown.querySelector('[data-calc-rows]');
		if (rows) rows.hidden = !detailsOpen;
	});

	// "Preis berechnen" links in the services section jump in with the service preselected.
	document
		.querySelectorAll('[data-service]')
		.forEach((link) => link.addEventListener('click', () => set({ service: link.dataset.service, step: 1, kmPair: '' })));

	if (s.step > 0 && !s.service) s.step = 0;
	if (s.kmSource === 'manual') Object.assign(s, { kmSource: '', kmPair: '' });
	render();
})();

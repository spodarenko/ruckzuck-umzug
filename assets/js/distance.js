/**
 * PLZ → km service for the calculator: window.rzDistance.get(from, to)
 * → { km, minutes, source: 'route' | 'estimate', from, to } (place names).
 *
 * WordPress: asks the theme's REST endpoint (inc/distance.php, real route).
 * Static site / endpoint down: straight line × roadFactor from assets/data/plz-de.json
 * (GeoNames, CC BY 4.0) — no third-party request from the visitor's browser.
 * Results are cached per PLZ pair in localStorage.
 */
(() => {
	const cfg = window.RZ_CALC;
	if (!cfg) return;
	const { roadFactor, cacheDays } = cfg.pricing.distance;
	const TTL = cacheDays * 864e5;

	let table;
	const load = () =>
		(table ||= fetch(cfg.plzData).then((r) => {
			if (!r.ok) throw new Error('plz data');
			return r.json();
		}));

	const cacheKey = (a, b) => `rz_km:${[a, b].sort().join('-')}`;
	const readCache = (key) => {
		try {
			const hit = JSON.parse(localStorage.getItem(key) || 'null');
			return hit && Date.now() - hit.at < TTL ? hit.value : null;
		} catch {
			return null;
		}
	};
	const writeCache = (key, value) => {
		try {
			localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
		} catch {
			/* storage unavailable */
		}
	};

	const haversine = ([lat1, lon1], [lat2, lon2]) => {
		const rad = Math.PI / 180;
		const h =
			Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
		return 2 * 6371 * Math.asin(Math.sqrt(h));
	};

	class UnknownPlz extends Error {}

	async function estimate(from, to) {
		const t = await load();
		const a = t[from];
		const b = t[to];
		if (!a || !b) throw new UnknownPlz(!a ? from : to);
		return { km: Math.max(1, Math.round(haversine(a, b) * roadFactor)), minutes: null, source: 'estimate', from: a[2], to: b[2] };
	}

	async function fromApi(from, to) {
		if (!cfg.distanceApi) return null;
		try {
			const res = await fetch(`${cfg.distanceApi}?from=${from}&to=${to}`);
			if (res.status === 404) throw new UnknownPlz(`${from}/${to}`);
			return res.ok ? await res.json() : null;
		} catch (e) {
			if (e instanceof UnknownPlz) throw e;
			return null; // network / server error → local estimate
		}
	}

	async function get(from, to) {
		const key = cacheKey(from, to);
		const hit = readCache(key);
		if (hit) return from <= to ? hit : { ...hit, from: hit.to, to: hit.from };
		const result = (await fromApi(from, to)) || (await estimate(from, to));
		// Store in sorted order so A→B and B→A share one entry.
		writeCache(key, from <= to ? result : { ...result, from: result.to, to: result.from });
		return result;
	}

	// Suggestions for "PLZ oder Ort" fields: digits → PLZ prefix, letters → town name.
	const norm = (v) =>
		v
			.toLowerCase()
			.replace(/ß/g, 'ss')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
	let entries;
	async function search(query, limit = 8) {
		entries ||= Object.entries(await load()).map(([plz, [, , place]]) => ({ plz, place, key: norm(place) }));
		const q = norm(query.trim());
		const digits = q.match(/^\d+/);
		if (digits) return entries.filter((e) => e.plz.startsWith(digits[0])).slice(0, limit);
		const starts = entries.filter((e) => e.key.startsWith(q));
		const contains = starts.length < limit ? entries.filter((e) => !e.key.startsWith(q) && e.key.includes(q)) : [];
		return [...starts, ...contains].slice(0, limit).map(({ plz, place }) => ({ plz, place }));
	}

	window.rzDistance = { get, search, UnknownPlz };
})();

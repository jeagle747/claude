/* Pure presentation helpers. No engine logic or side effects. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Ants51Presentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const palette = Object.freeze(['#25d9ee','#ff7162','#c4df49','#ab98ff','#f1c54c','#ee8bcc','#bdd5ef','#f6a757','#74d1a0','#e7e1cb']);
  function layout(availableWidth, width, height, scale, sidebarMin = 310, gap = 32) {
    if (![1,2].includes(scale)) throw new RangeError('Supported display scales are 1 and 2.');
    if (![width,height].every(n => Number.isInteger(n) && n > 0)) throw new RangeError('Invalid grid dimensions.');
    const mapWidth = width * scale, mapHeight = height * scale;
    return { scale, mapWidth, mapHeight, stacked: availableWidth < mapWidth + gap + sidebarMin, mapFits: availableWidth >= mapWidth };
  }
  function normalizeColor(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return '#' + (value & 0xffffff).toString(16).padStart(6,'0');
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
    throw new TypeError('Engine must supply a numeric RGB value or #rrggbb.');
  }
  // Call once for an immutable battle roster, not for sorted standings.
  // Preserve this registry across replay seeks, rank changes and theme switches.
  function createColorRegistry(roster, previous = {}) {
    const ids = roster.map(r => r.raceId);
    if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new Error('Unique stable raceId values required.');
    const registry = {...previous};
    const used = new Set(Object.values(registry));
    for (const id of [...ids].sort()) {
      if (Object.prototype.hasOwnProperty.call(registry,id)) continue;
      const next = palette.find(c => !used.has(c));
      if (!next) throw new RangeError('Distinct palette supports at most ten mapped races.');
      registry[id] = next; used.add(next);
    }
    return registry;
  }
  function displayColor(race, mode, registry) {
    if (mode === 'defined') return normalizeColor(race.definedColor);
    if (mode !== 'distinct' || !registry || !Object.prototype.hasOwnProperty.call(registry,race.raceId)) throw new Error('Missing stable colour assignment.');
    return registry[race.raceId];
  }
  function leadRatio(strengths) {
    const sorted = strengths.filter(n => Number.isFinite(n) && n >= 0).sort((a,b) => b-a);
    if (sorted.length < 2 || sorted[0]+sorted[1] === 0) return null;
    return 100 * sorted[0] / (sorted[0] + sorted[1]);
  }
  return Object.freeze({layout,normalizeColor,createColorRegistry,displayColor,leadRatio,palette});
});

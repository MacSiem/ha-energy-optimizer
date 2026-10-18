'use strict';
// Protocol fake only: the JS oracle creates deterministic backend replies for UI
// regressions. It is not evidence for the native Python/HA pricing implementation.
const { createEnergyTariffV3 } = require('../../shared/ha-tools-energy-tariff.js');
const clone = value => JSON.parse(JSON.stringify(value));
const isEnergyRequest = request => /^ha_tools_email\/energy_(price_queries|snapshot)$/.test(request.type);
const tick = () => new Promise(resolve => setImmediate(resolve));
async function drainBackend() {
  // A macrotask drains the complete microtask queue, including sequential batches
  // scheduled by finally/onPrices. Multiple turns also settle native DOM toggles.
  for (let i = 0; i < 4; i++) await tick();
}
function energyBackend(card, handler, options = {}) {
  let shared = { profile: options.profile ?? null, revision: options.revision ?? 0 };
  const calls = [];
  const dispatch = async request => {
    if (!isEnergyRequest(request)) {
      const result = await handler(request);
      if (request.type === 'ha_tools_email/get_tariff' && result && Object.hasOwn(result, 'profile')) shared = clone(result);
      return result;
    }
    calls.push(clone(request));
    const override = Object.hasOwn(request, 'profile');
    const profile = override ? request.profile : shared.profile;
    const model = createEnergyTariffV3(profile);
    const envelope = { schema: 1, profile_source: override ? 'override' : 'shared', tariff_revision: override ? null : shared.revision };
    if (request.type === 'ha_tools_email/energy_price_queries') return {
      ...envelope, results: request.queries.map(query => clone(model.priceBuckets(query.buckets))),
    };
    const measured = card._energyModel || card._insightsEnergyModel;
    const buckets = measured?.points ? [...measured.points].filter(([stamp]) => stamp >= measured.todayStart && stamp < measured.end)
      .map(([stamp, point]) => ({ from: stamp, to: stamp + 3600000, kwh: point.kwh })) : [];
    const today = model.priceBuckets(buckets, measured ? { from: measured.todayStart, to: measured.end } : undefined);
    const current = model.rateAt(new card.ownerDocument.defaultView.Date().toISOString());
    return { ...envelope, generated_at: new card.ownerDocument.defaultView.Date().toISOString(),
      status: today.complete ? 'ready' : 'partial', currency: profile?.currency ?? null,
      current: { available: current.available, zone_class: null, cheap: null,
        energy_rate: current.energyRate ?? null, variable_rate: current.variableRate ?? null,
        usage_rate: current.energyRate != null && current.variableRate != null ? current.energyRate + current.variableRate : null },
      today: { energy_cost: today.energyCost, variable_cost: today.variableCost, usage_cost: today.usageCost },
      next_cheap: { status: 'unknown', start: null } };
  };
  dispatch.energyCalls = calls;
  return dispatch;
}
function mountForPricing(card) {
  card._schedule = () => {};
  card.ownerDocument.body.append(card);
}
module.exports = { energyBackend, drainBackend, isEnergyRequest, mountForPricing };

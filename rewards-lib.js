'use strict';

/* GCRewards — shared unit-completion reward ledger for the Game Center quest games.
   Data lives in localStorage under one origin-wide key, so every game and the
   rewards page see the same ledger on a given device. 50¢ per mastered unit. */
const GCRewards = (() => {
  const KEY = 'gc_rewards_v1';
  const CENTS_PER_UNIT = 50;

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY)) || {};
      return { awarded: d.awarded || {}, payments: d.payments || [], pinHash: d.pinHash || null };
    } catch (e) {
      return { awarded: {}, payments: [], pinHash: null };
    }
  }
  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  }

  /* Credit any not-yet-awarded keys; returns the newly awarded ones. */
  function checkAwards(masteredKeys) {
    const d = load();
    const fresh = [];
    for (const k of masteredKeys) {
      if (!d.awarded[k]) { d.awarded[k] = Date.now(); fresh.push(k); }
    }
    if (fresh.length) save(d);
    return fresh;
  }

  function summary() {
    const d = load();
    const paidAt = {};   // unit key -> timestamp of the payment that covered it
    for (const p of d.payments) for (const k of (p.keys || [])) paidAt[k] = p.ts;
    const allKeys = Object.keys(d.awarded);
    const unpaidKeys = allKeys.filter(k => !(k in paidAt));
    const earnedCents = allKeys.length * CENTS_PER_UNIT;
    const paidCents = d.payments.reduce((s, p) => s + p.cents, 0);
    return {
      earnedCents, paidCents, balanceCents: unpaidKeys.length * CENTS_PER_UNIT,
      awarded: d.awarded, payments: d.payments, paidAt, unpaidKeys
    };
  }

  /* Pay specific units — one payment record covering those unit keys. */
  function recordPayment(keys) {
    const d = load();
    d.payments.push({ cents: keys.length * CENTS_PER_UNIT, ts: Date.now(), keys: [...keys] });
    save(d);
  }

  async function hash(pin) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('gc-pin:' + pin));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return 'plain:' + pin; // crypto.subtle unavailable (non-HTTPS) — degrade honestly
    }
  }
  function hasPin() { return !!load().pinHash; }
  async function setPin(pin) {
    const d = load();
    d.pinHash = await hash(pin);
    save(d);
  }
  async function verifyPin(pin) {
    const d = load();
    return !!d.pinHash && d.pinHash === await hash(pin);
  }

  return { CENTS_PER_UNIT, checkAwards, summary, recordPayment, hasPin, setPin, verifyPin };
})();

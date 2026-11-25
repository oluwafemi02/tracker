// Default categories. Names of the everyday set match the old app so history maps cleanly.

export const SPEND_CATEGORIES = [
  { id: 'groceries', name: 'Groceries', icon: '🛒' },
  { id: 'dining', name: 'Dining', icon: '🍽️' },
  { id: 'transportation', name: 'Transport', icon: '🚗', aliases: ['transportation', 'transport'] },
  { id: 'rent', name: 'Rent', icon: '🏠' },
  { id: 'mortgage', name: 'Mortgage', icon: '🏡' },
  { id: 'utilities', name: 'Utilities', icon: '⚡' },
  { id: 'subscriptions', name: 'Subscriptions', icon: '📺' },
  { id: 'phone-internet', name: 'Phone & internet', icon: '📶', aliases: ['phone', 'internet', 'mobile'] },
  { id: 'insurance', name: 'Insurance', icon: '🛡️' },
  { id: 'healthcare', name: 'Health', icon: '🩺', aliases: ['healthcare', 'health', 'medical'] },
  { id: 'shopping', name: 'Shopping', icon: '🛍️' },
  { id: 'entertainment', name: 'Fun', icon: '🎬', aliases: ['entertainment'] },
  { id: 'education', name: 'Education', icon: '📚' },
  { id: 'car-loan-lease', name: 'Car loan', icon: '🚙', aliases: ['car loan/lease', 'car loan', 'car lease'] },
  { id: 'other-loan', name: 'Loans & cards', icon: '💳', aliases: ['other loan', 'loan', 'credit card'] },
  { id: 'family', name: 'Family', icon: '👨‍👩‍👧', aliases: ['family support', 'remittance'] },
  { id: 'gifts', name: 'Gifts', icon: '🎁' },
  { id: 'personal-care', name: 'Personal care', icon: '💈' },
  { id: 'travel', name: 'Travel', icon: '✈️' },
  { id: 'other', name: 'Other', icon: '📝' },
];

export const TRIP_CATEGORIES = [
  { id: 't-food', name: 'Food & drink', icon: '🍽️', match: ['food', 'dining', 'restaurant', 'drink', 'cafe'] },
  { id: 't-stay', name: 'Stay', icon: '🏨', match: ['accommodation', 'hotel', 'stay', 'airbnb', 'hostel'] },
  { id: 't-flights', name: 'Flights', icon: '✈️', match: ['flight', 'airline', 'plane'] },
  { id: 't-transport', name: 'Transport', icon: '🚆', match: ['transportation', 'transport', 'train', 'bus', 'metro'] },
  { id: 't-taxi', name: 'Taxi & rides', icon: '🚕', match: ['taxi', 'uber', 'bolt', 'rideshare'] },
  { id: 't-fuel', name: 'Fuel', icon: '⛽', match: ['fuel', 'gas', 'petrol'] },
  { id: 't-activities', name: 'Activities', icon: '🎟️', match: ['event', 'activit', 'ticket', 'tour', 'museum'] },
  { id: 't-shopping', name: 'Shopping', icon: '🛍️', match: ['shopping', 'souvenir', 'supplies', 'equipment'] },
  { id: 't-health', name: 'Health', icon: '💊', match: ['medical', 'health', 'pharmacy'] },
  { id: 't-phone', name: 'Phone & data', icon: '📱', match: ['communication', 'phone', 'sim', 'data'] },
  { id: 't-fees', name: 'Fees & exchange', icon: '💱', match: ['exchange', 'fee', 'service', 'atm'] },
  { id: 't-other', name: 'Other', icon: '📝', match: [] },
];

export function slug(s) {
  return String(s || '').toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'other';
}

export function findSpendCategory(list, name) {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return null;
  return list.find((c) => c.name.toLowerCase() === n || c.id === slug(n) || (c.aliases || []).includes(n)) || null;
}

export function matchTripCategory(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s) return 't-other';
  const direct = TRIP_CATEGORIES.find((c) => c.id === raw);
  if (direct) return direct.id;
  for (const c of TRIP_CATEGORIES) {
    if (c.match.some((m) => s.includes(m))) return c.id;
  }
  return 't-other';
}

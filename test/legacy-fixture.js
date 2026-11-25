// Data shaped like the old app's localStorage (index.html v0.3.x).
export const legacy = {
  mainCurrency: 'EUR',
  monthlyBudget: '2500',
  darkMode: 'false',
  customCategories: JSON.stringify([{ name: 'Gym', icon: '🏋️', id: 1 }]),
  recurringExpenses: JSON.stringify([
    { id: 1700000000001, originalExpenseId: 1700000000000, amount: 650, category: 'Rent', person: 'You', description: 'Rent', frequency: 'monthly', startDate: '2025-01-31', endDate: null, lastProcessedDate: '2025-11-30', isActive: true },
    { id: 1700000000002, originalExpenseId: 1700000000010, amount: 12.99, category: 'Entertainment', person: 'You', description: 'Netflix', frequency: 'monthly', startDate: '2025-02-14', lastProcessedDate: '2026-11-14', isActive: true },
    // duplicate template created by the old double-submit bug
    { id: 1700000000003, originalExpenseId: 1700000000011, amount: 12.99, category: 'Entertainment', person: 'You', description: 'Netflix', frequency: 'monthly', startDate: '2025-02-14', lastProcessedDate: '2025-03-14', isActive: true },
    { id: 1700000000004, amount: 40, category: 'Gym', description: 'Gym', frequency: 'monthly', startDate: '2025-01-05', lastProcessedDate: '2025-06-05', isActive: false },
    { id: 1700000000005, amount: 99, category: 'Insurance', description: 'Home insurance', frequency: 'yearly', startDate: '2025-03-10', endDate: '2025-12-31', lastProcessedDate: '2025-03-10', isActive: true },
  ]),
  familyExpenses: JSON.stringify([
    { id: 1700000000000, amount: 650, category: 'Rent', person: 'You', description: 'Rent', date: '2025-01-31', currency: 'EUR', isRecurring: true },
    { id: 1700000000020.123, amount: 650, category: 'Rent', person: 'You', description: 'Rent (Auto-recurring)', date: '2025-02-28', parentRecurringId: 1700000000001 },
    { id: 1700000000021, amount: 23.5, category: 'Groceries', person: 'You', description: 'Rimi', date: '2025-11-03', currency: 'EUR' },
    { id: 1700000000022, amount: 20, category: 'Dining', person: 'You', description: 'Lunch', date: '2025-11-04', currency: 'USD', convertedAmount: 18.4 },
    { id: 1700000000023, amount: 8, category: 'Gym', description: '', date: '2025-11-05' },
    { id: 1700000000024, amount: 30, category: 'Pets', description: 'Cat food', date: '2025-11-06' },
    // copy of a trip expense that the old "deduct from main budget" toggle created
    { id: 1700000000025, amount: 45, currency: 'EUR', category: '🍽️ Food & Dining', description: 'Dinner (Trip: Riga)', date: '2025-08-02', travelExpenseId: 1700000000101, source: 'trip' },
    { id: 1700000000026, amount: 0, category: 'Other', date: '2025-11-06' },
  ]),
  trips: JSON.stringify([
    { id: 1700000000100, name: 'Riga weekend', destination: 'Riga', startDate: '2025-08-01', endDate: '2025-08-03', budget: 300, currency: 'EUR', status: 'completed' },
    { id: 1700000000200, name: 'Lagos', destination: 'Lagos', startDate: '2025-12-20', endDate: '2026-01-05', budget: 500000, currency: 'NGN', status: 'upcoming' },
  ]),
  travelExpenses: JSON.stringify([
    { id: 1700000000101, tripId: 1700000000100, amount: 45, currency: 'EUR', category: '🍽️ Food & Dining', date: '2025-08-02', location: 'Old town', payer: 'Me', description: 'Dinner', deductFromMainBudget: true },
    { id: 1700000000102, tripId: 1700000000100, amount: 120, currency: 'EUR', category: '🏨 Accommodation', date: '2025-08-01', payer: 'Ada', description: 'Hotel' },
    { id: 1700000000103, tripId: 1700000000100, amount: 30, currency: 'EUR', category: '🚕 Taxi/Uber', date: '2025-08-03', payer: 'Me' },
    { id: 1700000000104, tripId: 999, amount: 5, currency: 'EUR', category: 'x', date: '2025-08-03' },
  ]),
  currentTrip: 'null',
};
export const getter = (obj) => (k) => (k in obj ? obj[k] : null);

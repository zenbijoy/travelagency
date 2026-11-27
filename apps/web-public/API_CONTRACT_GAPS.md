# Public API contract gaps

The public website can search connected hotel, flight, and itinerary services,
but it cannot safely complete checkout with the current booking and payment
contracts.

## Required before checkout can be enabled

1. Provide an authenticated or short-lived server-generated quote for a
   product, selected room/flight/itinerary, dates, occupancy, currency, fees,
   taxes, and total. The quote must identify the inventory and expire at a
   server-defined time.
2. Accept a booking request that references the quote ID and traveler details,
   and revalidate quote ownership, expiry, inventory, and amount server-side.
   The request must not accept client-authoritative price, tax, discount,
   payment status, or tenant identity.
3. Initiate payment against the persisted booking total, not a caller-supplied
   amount; return a provider redirect/action only after the booking/payment
   state has been persisted.
4. Define idempotency behavior for quote redemption, booking creation, and
   payment initiation, plus authoritative status lookup/webhook handling.
5. Return typed errors for expired quotes, unavailable inventory, rejected
   bookings, and payment failures.

Until these contracts are implemented and verified, the public booking entry
shows an unavailable state, collects no traveler/payment data, and does not
call booking or payment endpoints. Prices shown in discovery are estimates only.

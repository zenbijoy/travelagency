import { z } from 'zod';

export const flightSearchSchema = z
  .object({
    origin: z
      .string()
      .trim()
      .min(3, 'Origin airport code required')
      .max(3, 'Use 3-letter IATA code')
      .toUpperCase(),
    destination: z
      .string()
      .trim()
      .min(3, 'Destination airport code required')
      .max(3, 'Use 3-letter IATA code')
      .toUpperCase(),
    departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Departure date must be YYYY-MM-DD'),
    return_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Return date must be YYYY-MM-DD')
      .optional()
      .nullable(),
    trip_type: z.enum(['one_way', 'round_trip', 'multi_city']).default('one_way'),
    passengers: z.number().int().min(1, 'Minimum 1 passenger').max(9, 'Maximum 9 passengers').default(1),
    cabin_class: z.enum(['economy', 'premium_economy', 'business', 'first']).default('economy'),
    max_price: z.number().positive().optional().nullable(),
    airline_code: z.string().trim().max(3).toUpperCase().optional().nullable(),
    page: z.number().int().min(1).default(1),
    page_size: z.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) => {
      if (data.trip_type === 'round_trip' && data.return_date) {
        return new Date(data.return_date) >= new Date(data.departure_date);
      }
      return true;
    },
    {
      message: 'Return date cannot be earlier than departure date',
      path: ['return_date'],
    }
  );

export const flightSeatLockSchema = z.object({
  flight_id: z.string().min(1, 'Flight ID is required'),
  seat_id: z.string().min(1, 'Seat ID is required'),
  passenger_id: z.string().optional().nullable(),
  duration_seconds: z.number().int().min(60).max(1800).default(600), // 10 min default lock
});

export type FlightSearchInput = z.infer<typeof flightSearchSchema>;
export type FlightSeatLockInput = z.infer<typeof flightSeatLockSchema>;

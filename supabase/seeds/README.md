# Seeds

`pnpm db:reset` loads every `*.sql` here in name order. Local dev only; the hosted project is not seeded.

| File              | Seeds                                                       |
| ----------------- | ----------------------------------------------------------- |
| `01_setup.sql`    | IRPC facility, machines, varieties, municipalities          |
| `02_accounts.sql` | Staff logins, co-ops, farmers, traders, buyers              |
| `06_gate.sql`     | Today's live gate queue and its open batches                |
| `04_booking.sql`  | Upcoming drying and milling bookings                        |
| `05_buying.sql`   | Sell offers (offered and accepted) over the next weeks      |
| `08_forecast.sql` | Trained forecast and metrics (`pnpm seed:forecast`)         |
| `11_orders.sql`   | Rice requests from buyers (requested, accepted, closed)     |
| `NN_<module>.sql` | Each later ticket adds its own file; don't edit shared ones |
| `89_history.sql`  | ~14 weeks of past operations: batches, sales, prices, SMS   |
| `90_peak.sql`     | Peak demo: dryer 30 t over in 2 weeks, idle in 3 weeks      |
| `91_sms.sql`      | SMS threads for seeded bookings and offers, one open prompt |
| `92_sms_ai.sql`   | Plain-language SMS threads read by AI, with their bookings  |

Rules for every seed file:

- **Dates are relative to `current_date`** (`current_date + 14`), never literal, so the demo works on any day.
  Start each file with `set time zone 'Asia/Manila';` so `current_date` is the Manila day.
  Exception: `08_forecast.sql` keeps the trained calendar dates.
- **Reference rows by fixed id or natural key.** The facility and base clients have fixed ids (listed at the top of their files). Look up machines by `code`, varieties by `code` and municipalities by `psgc_code`.
- Number the file after its module (`04_booking.sql`, `05_buying.sql`, `07_pricing.sql`, ...) so it loads after what it references.

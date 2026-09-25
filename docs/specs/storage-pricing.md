# Storage pricing

The server calculates a package's storage charge from its recorded storage time (`lastOccupiedAt`) and one server timestamp captured during the retrieval request. The API exposes these timestamps as `occupiedAt` and `calculatedAt`; see the [retrieval endpoint](../api.md#retrieve-a-package) for preview and confirmation behavior.

## Billing rule

A billable day is a **completed 24-hour period** from storage, not a calendar day. Fractional days are discarded. There is no minimum fee or separate grace period, so any duration under 24 hours costs zero.

| Completed storage day | Charge for that day |
| --- | ---: |
| 1–5 | 100 cents |
| 6–10 | 200 cents |
| 11 onward | 300 cents |

Each day is charged at its own tier. Amounts are integer cents; the total is the sum of the charges for all completed days.

```text
completedDays = floor((calculatedAt - lastOccupiedAt) / (24 * 60 * 60 * 1000))
chargesInCents = min(completedDays, 5) * 100
               + min(max(completedDays - 5, 0), 5) * 200
               + max(completedDays - 10, 0) * 300
```

| Elapsed storage time | Completed days | Total charge |
| --- | ---: | ---: |
| 0 hours | 0 | 0 cents |
| Just under 24 hours | 0 | 0 cents |
| 24 hours | 1 | 100 cents |
| 120 hours | 5 | 500 cents |
| 143 hours | 5 | 500 cents |
| 144 hours | 6 | 700 cents |
| 240 hours | 10 | 1,500 cents |
| 264 hours | 11 | 1,800 cents |

The calculation uses elapsed UTC time; it does not compare dates or accept a client-provided clock or charge. A missing, invalid, or future storage timestamp is a data error, not a zero-charge assignment. In that case, retrieval fails and leaves the assignment unchanged.

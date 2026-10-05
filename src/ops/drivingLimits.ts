const SEC_PER_H = 3_600;

export const MAX_CONTINUOUS_SEC    = 4.5 * SEC_PER_H;  // 4h30 before mandatory break
export const BREAK_DURATION_SEC    = 45  * 60;          // 45-min mandatory break
export const MAX_DAILY_SEC         = 9   * SEC_PER_H;   // standard daily driving max
export const MAX_DAILY_EXTENDED_SEC = 10 * SEC_PER_H;  // extendable (≤ 2×/week)
export const DAILY_REST_SEC        = 11  * SEC_PER_H;   // min daily rest between days
export const MAX_WEEKLY_H          = 56;                // weekly driving limit


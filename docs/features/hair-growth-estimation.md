# Hair growth estimation

## Behavior

The estimator projects a length from a dated baseline, a monthly growth-rate estimate, and a target. The product default is an adjustable estimate of **1.0 cm per month**. It is a planning value, not a measured fact about a particular person. Hair growth varies meaningfully between people and over time.

The estimate is not medical advice, cannot diagnose a hair or scalp condition, and cannot predict an individual's actual growth. The background reading used for this boundary is the clinical overview in [Hair Growth Disorders, StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK499948/). A user should record measurements and adjust the rate when their own observations differ from the default.

The version 1 profile schema stores a baseline length in centimetres, a baseline date, a monthly growth rate in centimetres, a target length, and the preferred display unit. The browser source in `site/app.js` initializes the adjustable 1.0 cm per month default. The inspected desktop source has not yet been reconciled with that documented default, so cross-surface default verification remains pending.

The browser calculation uses elapsed days divided by 30.4375 as the elapsed-month estimate. It calculates `baseline length + monthly rate × elapsed months`, clamps the result to zero or above, and projects the remaining target interval with the same month length. This is source behavior, not built-artifact proof.

## Configuration

Profile fields are stored under `profile` in the local version 1 state. The HTTP service accepts the same normalized fields through `PUT /api/profiles/{profileId}`. The service bounds numeric lengths and rates to 0 through 300 centimetres and accepts dates in `YYYY-MM-DD` form. The website estimator declares a narrower 0 through 10 input range for the monthly rate. Any surface that changes units must convert the entered value and the displayed result without changing the canonical centimetre value.

## Failure modes

- An invalid profile sent to the service receives HTTP 400 with a bounded error message.
- A missing local state file falls back to the version 1 defaults.
- A syntactically invalid local state file also falls back to defaults in the inspected desktop main process. That behavior can hide corruption and still requires a user-facing recovery notification.
- A zero growth rate means that a later target date cannot be projected unless the target is already reached.
- A future baseline date, invalid calendar date, negative elapsed interval, or target below the baseline needs an explicit result rather than a silently plausible date.
- A source default that differs from the documented 1.0 cm per month default blocks release verification until reconciled.
- The browser calculation cannot be considered verified until its composed artifact is exercised.

## Security and privacy

Profile values are ordinary personal records and are stored locally by default. They are sent to a server only when a user chooses a server-backed workflow. Server URLs reject embedded credentials. API keys are kept outside the JSON settings file by the desktop main process. The estimate must not be presented as medical guidance or sent to analytics, advertising, or image services.

## Verification

Source inspection confirmed the profile schema in `app/main.js`, the estimator controls in `site/index.template.html`, browser calculation and persistence in `site/app.js`, and service validation in `server/index.js`. Focused calculation tests must cover the adjustable 1.0 cm per month default, leap years, partial months, zero rate, already-reached targets, future baselines, unit switching, and round-trip persistence. Interaction evidence and built-artifact captures are pending.

## Suggested articles

- [Centimetres and inches](measurements.md)
- [Haircut history and reset behavior](haircut-history.md)
- [Animated hair-length visualization](visual-growth-timeline.md)
- [Local storage and optional synchronization](data-storage-and-sync.md)

# Publication validation — 2026-10-29

Validation performed on the sanitized, standalone publication checkout, rather
than on the previously installed application. Linux, Node.js 20.19.2, Python 3.13,
Arduino CLI 1.5.1, Arduino AVR Boards 1.8.8; dependencies in the versioned manifest.

| Check | Result |
| --- | --- |
| Static toolbox and XML generation | 176 block types and all 69 numbered examples pass |
| JavaScript regression suites | All 14 suites pass |
| Named-device palette | 479 assertions; 20 device types, 102 actions, 105 nested defaults |
| Serial parsing/schema/capture | 1,055 assertions plus five-widget UI, replay and retention tests |
| Python serial/HTTP/startup | All 20 tests pass; pseudo-terminals, no physical serial writes |
| Workspace zoom | 250 scale/anchor cases spanning 1–300%, with actual legacy scrollbar logic |
| Areas and selection | XML persistence, movement, sizing, new/recovery and gesture tests pass |
| Pin interrupt generation | 160 assertions and prior-example preservation pass |
| Timer1 host simulation | Every integer period at 8/16 MHz tested: 8,388,608 / 4,194,304 periods |
| Music host simulation | Three independent voices, duration expiry, rests, slot limits pass |
| SD melody parser | Bounded reads, score syntax, errors and file ownership pass |
| Image host simulation | 44 format/level/mode combinations decoded pixel by pixel; bounds and incomplete files checked |
| Arduino compilation | All 69 numbered examples compile for Pro Mini ATmega328P, 16 MHz |
| Fresh browser/service | New config, alternate HTTP port, editor and generated code load without console errors |
| Browser Compile | Example 60: 2,434 bytes Flash, 194 bytes static RAM on Uno |

Examples whose display text was translated were regenerated and recompiled after
that change. CI repeats software tests and all example compiles from a fresh
GitHub runner. Test output, private settings and compiler build directories are
excluded from the repository. These results do not assert physical behavior for
every supported peripheral; see TESTING.md for the hardware coverage boundary.

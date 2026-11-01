# Editing, buffers and polyphonic scores — 2026-11-01

- All 22 JavaScript suites pass. Real bundled Blockly generates 177 static toolbox
  types and all 78 numbered XML examples; the named-device catalog has 111 action
  entries and 107 preserved nested defaults. All 78 examples pass pin/resource
  validation for Pro Mini ATmega168.
- All 78 examples compile for Pro Mini ATmega328P / 16 MHz. Changed/new examples
  also compile for ATmega168 / 16 MHz:

| Example | Flash | Static RAM |
| --- | ---: | ---: |
| 39 · SD line → variable → note record | 13,516 B | 748 B |
| 61 · ordinary Serial image messages | 5,006 B | 236 B |
| 64 · LCD char array | 3,474 B | 342 B |
| 65 · packed OLED tile | 6,382 B | 567 B |
| 66 · NeoPixel RGB array | 2,650 B | 68 B |
| 67 · RGB565 TFT tile | 12,034 B | 556 B |
| 68 · text note variable | 4,692 B | 72 B |
| 69 · three-voice timed SD score | 13,494 B | 828 B |

The 168 has 1,024 bytes RAM: example 69 leaves only 196 bytes for stack/runtime
use. Static reports exclude heap; NeoPixel also allocates its strip buffer.
OLED/TFT examples use small tiles deliberately. This is compile evidence, not a
physical guarantee that every SD card and extra user code fit the runtime margin.

- Examples 61 and 64–67 compile for both Arduino-Pico 6.3.1 and STM32duino 3.0.0
  Blue Pill F103C8, with board-appropriate pins. Blue Pill ST7735 needs the
  reproducible 1.12.0 private-header guard in `tools/arduino_compat.py`; the final
  TFT build uses 29,624 bytes Flash / 1,824 bytes static RAM. The installer applies
  this narrow fix and preserves the original external source.
- All 20 Python serial/backend tests pass. Host tests pass for shared note syntax,
  three concurrent voices, timed absolute/delta SD playback, millis rollover,
  read budgets, malformed/overlong lines and the actual POLY.TXT fixture. Array
  output tests cover layout, clipping, packed bits, RGB565 and one NeoPixel show.
  Bounded text-line tests cover CRLF, final EOF, overflow and allocation/I/O errors.
  Existing 44 image formats/modes and exhaustive 8/16 MHz Timer1 tests pass too.
- The installed HTTP compile endpoint also builds examples 64 and 69 for
  ATmega168 using its normal sketchbook libraries. Adding collapsed explanations
  to practical example operations leaves all 78 programs identical after removing
  comments.
- Browser checks cover sidebar colour editing and undo/redo, compact JSON editing,
  ordinary Serial scanner code, pin exclusions, three-voice mapping, generated
  comments, board diagrams and hidden block controls in other tabs.
- These changes were not uploaded to physical hardware. SD card latency, buzzer
  audio, display transfers and alternate-board wiring remain unverified physically.

Earlier dated runs below describe their then-current versions.

---

# Usability and resource validation — 2026-10-31

- All 21 JavaScript suites pass, including new board-resource, real Blockly integration,
  example-resource, motion/math, image protocol/UI and board-history tests.
- All 72 numbered XML examples pass declared pin/peripheral validation for Pro Mini
  ATmega168. The existing full compile suite passes for ATmega328P; the three SD
  examples changed afterward to move their status LED off SCK were recompiled too.
- New examples compile for ATmega168 / 16 MHz:

| Example | Flash | Static RAM |
| --- | ---: | ---: |
| 61 · two-servo photocell scanner | 4,922 B | 236 B |
| 62 · continuous signed-speed stepper | 5,886 B | 119 B |
| 63 · microsecond servo pulses | 2,962 B | 50 B |

- The scanner also compiles for Arduino-Pico 6.3.1 (58,132 B Flash / 9,048 B static
  RAM) and STM32duino 3.0.0 Blue Pill F103C8 (20,716 B / 1,568 B). The Blue Pill
  smoke build uses PA8/PB0 servo pins instead of the AVR example's numeric pins.
- Browser checks covered tabs, pinned/revealed toolbox, per-device colours,
  catalogue ordering, I2C pin exclusion with shared bus use, discard/reload, and
  image demo/export. A real browser download decoded as a 160 × 100 RGBA PNG,
  independent of the displayed size. Chart and image framing/UI also have automated tests.
- These changes were not uploaded to physical hardware. Stepper movement and
  photocell mechanics remain unverified. See [profile and library limits](BOARD-RESOURCES.md).

---

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

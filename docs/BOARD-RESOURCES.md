# Board-aware connections and editor workflow

The classic editor has Blocks, Code, XML and Connections tabs. Hover/focus the
left-edge Blocks handle to reveal the toolbox; its pin keeps it open and is
remembered. New project offers Keep recovery & close, Discard without saving,
and Cancel. Discard clears the active project without creating a recovery copy;
it does not delete older explicitly retained recoveries.

Board & upload port provides a searchable list, with the five most recently
applied board configurations first. Applying a board updates resource validation;
it never silently rewires saved devices. Invalid saved pins remain visible for
repair and prevent block-code generation. Raw edited C++ remains the user's code.

In Add device, the gray gear toggles catalogue ordering. Each card gets a
move-to-top icon; press the gear again to save the order. Device types already
used in the project remain highlighted and ahead of unused types. Each device
has a colour setting behind the gear beside its name in Project devices. Its configuration, actions, toolbox accent and Connections card follow that colour. No colour field is displayed on a block or in Connections.

## Supported profiles

| Board/core family | Analog pins | Default I²C | Default SPI (MOSI / MISO / SCK) | Servo resource |
| --- | --- | --- | --- | --- |
| AVR Uno / Duemilanove ATmega168/328 | A0–A5 | A4 / A5 | D11 / D12 / D13 | 12 channels, Timer1 |
| AVR Pro Mini / Nano ATmega168/328 | A0–A7; A6/A7 analog only | A4 / A5 | D11 / D12 / D13 | 12 channels, Timer1 |
| Raspberry Pi Pico, Earle Philhower core | GP26–GP28 | GP4 / GP5 | GP19 / GP16 / GP18 | up to 8 PIO state machines |
| STM32duino Blue Pill F103C8/CB | PA0–PA7, PB0–PB1 | PB7 / PB6 | PA7 / PA6 / PA5 | 12 channels, TIM2 |

The installed board-core list can contain many other boards. Those may still be
selected for compilation, but hardware blocks require a verified profile rather
than presenting invented pin capabilities. Profiles describe the listed cores'
default variant mappings. They do not describe every possible clone's wiring.
Blue Pill USB, debug/JTAG and oscillator pins are conservatively excluded.

The peripheral libraries currently use the default Wire/SPI instances. Their bus
selector is deliberately disabled and displays each signal and physical pin.
Secondary buses and alternate pin routing are not exposed by these library
blocks yet. A fixed bus selector does not imply the chip has only one bus.

## Allocation and sharing

Automatic ownership covers named device definitions and the supported GPIO,
interrupt and direct-register blocks. Legacy pin-bearing blocks use the same capability/ownership checks. Implicit legacy stepper/NeoPixel defaults and fixed display pins are also reserved; repeated actions share their original object. Named definitions remain the easiest way to reuse wiring. Custom C++ and arbitrary register side effects cannot be inferred completely.

- Signal dropdowns show compatible pins not occupied by another declared device.
  Adding a device allocates free pins or explains why resources are unavailable.
- I²C modules share SDA/SCL and need different addresses. SPI modules share bus
  lines and need distinct chip-select pins. Bus pins cannot also serve an analog
  sensor, servo or unrelated GPIO operation. AVR hardware SS is reserved when a
  different CS is used, since SPI master mode needs SS configured as an output.
- Serial blocks reserve hardware UART pins; USB Serial on Pico does not reserve
  GPIO. The Blue Pill profile follows the selected USB option.
- Servo accepts ordinary digital pins, not only PWM-marked pins. On AVR its
  Timer1 disables PWM D9/D10; the pins remain usable as servo signals. Named
  Timer1 interrupts conflict with Servo. Music allows three buzzer voices on
  one Timer2 and conflicts with core tone, IRremote and Timer2 PWM. Blue Pill
  Servo/Tone/IRremote reserve TIM2/TIM3/TIM4 respectively. Pico Servo and
  NeoPixel share the eight PIO state machines.
- One SD card and one IR receiver are supported by the corresponding libraries.
- Direct AVR pin operations use the same physical ownership map. Constant port
  masks reserve their selected bits; variable masks conservatively reserve the
  exposed port pins. Direct timer-register/ISR use participates in timer checks.
  Arbitrary register writes and custom C++ still need datasheet-level review:
  static declarations cannot prove every side effect or timing interaction.

## Motion and arithmetic

Stepper definitions choose **position with acceleration** or **continuous speed,
no acceleration**. In continuous mode, signed speed controls direction and zero
stops. Call run every loop pass, without long waits. This generates AccelStepper
`runSpeed()`; position mode uses `run()`, a target, acceleration and deceleration.
An unreachable speed, driver wiring, current limit, supply or missing repeated
run calls can still prevent physical motion. See examples 35a and 62.

Servo write offers 0–180 degrees or 544–2400 µs pulse width. These are clamped to
the API range; the physical servo decides useful travel and actual precision.
Example 63 maps a potentiometer to the narrower 1000–2000 µs range.

Map exposes value, input low/high and output low/high as expression sockets.
Defaults are 0–1023 to 0–255. It returns an integer, does not clamp, and returns
the output minimum for a zero-width input range. Floating intermediate arithmetic
avoids overflowing the usual AVR 16-bit integer multiplication.

## Streaming image

The Plotter's Scan image view receives gray/RGB pixel updates and exports a
native-resolution PNG. The scanner example requires no framebuffer on the
microcontroller. See [the protocol and wiring guide](../blockly/apps/blocklyduino/examples/scan-image-guide.html).

## Source contracts

The resource model follows the Arduino AVR core 1.8.8, Arduino-Pico 6.3.1 and
STM32duino 3.0.0 variant definitions and Servo, IRremote and Adafruit NeoPixel
implementations inspected during development. Recheck profiles after core/library
upgrades. Primary references:
[AccelStepper run/runSpeed](https://www.airspayce.com/mikem/arduino/AccelStepper/classAccelStepper.html),
[AVR Servo timers](https://github.com/arduino-libraries/Servo/blob/master/src/avr/ServoTimers.h),
[Arduino-Pico](https://github.com/earlephilhower/arduino-pico),
[STM32duino core](https://github.com/stm32duino/Arduino_Core_STM32).

## Compact editing and diagrams

Undo/redo stores up to 60 workspace snapshots (12 MiB budget), including device identities, wiring, colours, comments, arrays and labelled areas. Ctrl+Z undoes; Ctrl+Shift+Z or Ctrl+Y redoes. A new edit clears the redo branch. History is session-local; XML save/autosave and explicit recovery copies remain available across reloads. Text editors keep their native text undo.

Connections shows a board-specific labelled map for the supported profiles, with pin capabilities and coloured ownership. Pro Mini/Nano/Pico/Blue Pill use their labelled header arrangements; Uno/Duemilanove use a logical header-group view. Clone auxiliary pads can move, so always match printed labels. Servo, music and STEP/DIR work on ordinary digital pins. PWM-labelled pins are required by analogWrite; the resource model also checks the corresponding timer.

Map and routine value operations use inline sockets. Serial text opens a multiline editor: recognised JSON headers are pretty-printed for editing and compacted to one wire line. The scanner example uses ordinary Serial text/send blocks; old dedicated image blocks remain import-compatible but are absent from the palette.

Prepared arrays can be sent to LCD, OLED, TFT and NeoPixel devices. See [buffer formats](../blockly/apps/blocklyduino/examples/buffer-guide.html). One-note records and timed polyphonic SD scores share pitch syntax; see [score formats](../blockly/apps/blocklyduino/examples/sd-music-guide.html).

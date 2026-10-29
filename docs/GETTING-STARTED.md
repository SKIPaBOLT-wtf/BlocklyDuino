# Install and run the classic workbench

The extension is served locally. The browser editor works without a connected
board; compile/upload and serial tools use the Python service and Arduino CLI.
The verified host platform is Linux. Other operating systems have not been
validated for the new service.

## Requirements and installation

- Python 3.10+ with venv/pip, a modern browser, and [Arduino CLI](https://arduino.github.io/arduino-cli/).
- Node.js 20+ and npm are needed only to run the automated editor tests.
- On Linux, the user needs normal read/write permission to the selected serial port.

From this repository's root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r server/requirements.txt
python3 tools/install-arduino.py
.venv/bin/python server/blocklyduino-server.py
```

Open **http://127.0.0.1:8080/**. The installer installs the pinned AVR core and
example dependencies listed in `arduino/dependencies.json`. It does not flash
hardware. Custom BlocklyStorage, BlocklyMusic and BlocklySDMusic sources are
bundled under `arduino/libraries`; the server supplies that directory to the
compiler. To use exported code in Arduino IDE, copy those three library folders
into the IDE sketchbook's `libraries` folder as well.

If Arduino CLI is not on PATH, pass `--cli /path/to/arduino-cli` to both scripts.
Use `--port 8081` to choose another HTTP port, `--config /path/to/config.json`
for a separate private configuration, and `--root /path/to/BlocklyDuino` to serve
another checkout. Target and serial settings default to the user's config
directory, outside the repository. The first launch selects Uno and no port.
The server binds only to loopback and accepts local UI origins on its own port.

## Choose a board and upload

Open **Board & upload target**, select an installed board, its processor/upload
options and serial port, then click **Apply target**. Only applied settings are
used. **Compile** checks the generated sketch; **Upload** compiles, temporarily
releases the shared serial port, uploads with verification, and attempts to
restore the monitor connection. Upload errors remain visible.

Pro Mini boards normally upload through a suitable USB-to-serial adapter and
their existing bootloader. Upload does not restore fuse bits or a bootloader.
To add RP2040/Pico and STM32/Blue Pill board menus:

```sh
python3 tools/install-arduino.py --cores avr rp2040 stm32
```

Choose the board core's actual upload method in the menu. Pico normally uses
USB/BOOTSEL; a USB UART adapter is not an SWD debugger. Blue Pill can use
OpenOCD STLink with an ST-Link and the core's external upload tools installed.
Empty port supports methods that do not take a serial port. These menus expose
installed core options; they do not make AVR-only blocks portable to other chips.
Physical Pico/Blue Pill uploading is not verified by this contribution.

## Build a program

1. Pick a simple example, or use **Project → New project**.
2. Use **+ Add device** in the toolbox to declare each module's name and wiring
   once. Its bound actions appear near the top. **Connections** summarizes wiring.
3. Use **Program** for setup/loop. Declarations inside functions/sections are
   local; top-level declarations are global. Variables and multidimensional array
   indices accept connected expressions. Functions support typed arguments.
4. Wheel-zoom around the pointer, use Fit or named Areas to navigate, and select
   stacks to move related blocks. Areas retain a title and description in XML.
5. **Save blocks** exports XML. Browser autosave and recovery are local to that
   browser origin. Changing HTTP port creates a separate browser storage origin.

The Arduino view shows generated code. **Edit code** allows temporary manual
editing, but cannot convert edited C++ back into blocks. Save manual code before
returning to blocks. This remains a single-sketch editor, not a multi-file IDE.

## Serial tools

Monitor and Plotter are separate views sharing one serial connection. Choose a
port and baud, then Connect. Monitor can send text with configurable line endings.
Settings panels remember their collapsed state; both views preserve preferences.
The plotter accepts numbers, CSV, labelled values, or a versioned JSON protocol.
Its Guide describes `@plot`, `@use` and `@data`, saved dashboard profiles, gauges,
line/XY charts and bounded CSV/JSONL capture. Start with examples 54–56 or the
plotter's built-in demo. Opening a serial port can reset an Arduino via DTR.

All device wiring, memory format, interrupt and music guides are available from
the editor's **Guide**. The example selectors open editable blocks, not screenshots.

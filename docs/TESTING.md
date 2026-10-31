# Reproduce validation

From the repository root, install the dependencies in GETTING-STARTED.md, then:

```sh
npm ci --ignore-scripts
npm test
.venv/bin/python -m unittest discover -s tests/serial-backend-tests -p 'test_*.py' -v
python3 tools/compile-examples.py
```

The Node suites use the actual bundled Blockly and jsdom. They test all numbered
XML examples and static toolbox types, device identities/actions, stack selection,
new/recovery workflows, area serialization/gestures, cursor-anchored zoom, serial
stream framing and replay, plotter profiles/rendering, and interrupt generation.
SVG geometry is stubbed where jsdom cannot render it; this is not a substitute
for the browser smoke check.

The Python suite uses POSIX pseudo-terminals and HTTP to verify simultaneous
readers, UTF-8 fragments, transmit endings, bounded buffering, invalid inputs,
origin/host checks, upload arbitration and disconnect/reconnect behavior. It
does not require a physical Arduino and does not write firmware.

The compile script generates sketches under ignored `.test-build/`, compiles
each numbered example, and records results/logs there. Default target is Pro Mini
ATmega328P / 16 MHz. Use `--fqbn arduino:avr:pro:cpu=16MHzatmega168` for the smaller
chip and `--examples 38b 43 60` to choose a subset. It never uploads firmware.
Installed external dependencies are pinned in `arduino/dependencies.json`.

Install host test dependencies with `.venv/bin/python -m pip install -r tests/requirements.txt`.
Host C++ tests for image encoding/music and generated timer helpers are run with
`python3 tests/run-host.py`. They simulate peripherals and decode generated files;
they do not claim physical SPI/I2C timing or buzzer/audio quality.

## Browser smoke check

Start the service with a fresh config on an unused port. Confirm the editor loads
without missing assets, add/open a named-device example, view generated C++, and
compile it. Open Monitor and Plotter, run the plotter demo, collapse settings and
reload. Confirm project save/recovery and guides load. Never use real hardware
upload as part of an unattended browser smoke test.

## Evidence scope

See VALIDATION.md for the recorded publication-run results. Only a Pro Mini
ATmega168 and a PCF8574 20x4 LCD were physically exercised during development.
SD, memory ICs, music, motion and alternate-board examples have software/compile
coverage, but are not presented as a complete physically verified hardware matrix.

The usability suites cover board pin/resource contracts, all example declarations, recent target configurations, continuous stepper generation, servo pulse units, map inputs, and streaming image parsing/view/export. Browser checks should additionally exercise pin/unpin, catalogue ordering and a real PNG download.

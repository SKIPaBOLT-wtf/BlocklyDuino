#!/usr/bin/env python3
"""Build only example 61: editable blocks, no upload or catalogue regeneration."""
from pathlib import Path
import json
import runpy
import xml.etree.ElementTree as E

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'tools/build-guided-examples.py'))
for key in ('block', 'chain', 'n', 'var', 'flag', 'op', 'compare', 'both', 'conditions',
            'assign', 'declare', 'iff', 'loop', 'setup', 'function', 'call', 'message',
            'config', 'action'):
    globals()[key] = helpers[key]

FILE = ROOT / 'blockly/apps/blocklyduino/examples/61-serial-image-scanner.xml'
PULSE_MIN, PULSE_MAX = 544, 2400
BAUD = 115200


def floor(v): return block('math_round', {'OP': 'ROUNDDOWN'}, {'NUM': v})
def ceil(v): return block('math_round', {'OP': 'ROUNDUP'}, {'NUM': v})
def idiv(a, b): return block('ll_bits_integer_math', {'OP': 'DIV', 'WIDTH': '32'}, {'A': a, 'B': b})
def imod(a, b): return block('ll_bits_integer_math', {'OP': 'MOD', 'WIDTH': '32'}, {'A': a, 'B': b})
def minimum(a, b): return block('arduino_math_minmax', {'OP': 'min'}, {'A': a, 'B': b})
def maximum(a, b): return block('arduino_math_minmax', {'OP': 'max'}, {'A': a, 'B': b})
def clamp(value, low, high): return block('math_constrain', values={'VALUE': value, 'LOW': low, 'HIGH': high})
def elapsed(start): return op('MINUS', block('arduino_micros'), var(start))
def within(name, lo, hi): return both(compare('GTE', var(name), lo), compare('LTE', var(name), hi))
def collapsed(name, body, note):
    b = function(name, body, note)
    b.set('collapsed', 'true')
    return b
def template(text, values, note=None):
    return block('serial_template', {'TEXT': text, 'END': 'println'},
                 {'ARG_' + k: v for k, v in values.items()}, comment=note)
def micros_servo(uid, value):
    return action('device_servo_write', uid, {'ANGLE': value}, {'UNIT': 'MICROSECONDS'})


# One definition supplies the initial parameter block, control and receive rule.
# Dynamic bounds use derived variables recalculated whenever a setting changes.
PARAMETERS = [
    ('width', 'imageWidth', 'int32_t', 32, 'Image width', 'px', 1, 'maxWidth', 1,
     'Columns in the computer image. More columns divide the same row sweep more finely.'),
    ('height', 'imageHeight', 'int32_t', 24, 'Image height', 'px', 1, 'maxHeight', 1,
     'Rows in the computer image. Its size does not allocate an image buffer on Arduino.'),
    ('levels', 'brightnessLevels', 'int32_t', 1024, 'Brightness levels', '', 2, 65536, 1,
     'Output values are 0 through levels-1. The ADC is still 10-bit; rescaling does not add sensor information.'),
    ('gain', 'gainPercent', 'int32_t', 100, 'Light gain', '%', 0, 1600, 1,
     '100% means 1x gain; 125% means 1.25x. Multiply the averaged ADC reading, then add offset. Whole percent steps avoid a floating-point command parser on the small ATmega168.'),
    ('offset', 'offset', 'int32_t', 0, 'Light offset', 'ADC', -16384, 16384, 1,
     'Add this signed ADC-count offset after gain, before mapping the black/white signal range.'),
    ('samples', 'multiSamples', 'int32_t', 4, 'Samples per pixel', '', 1, 'maxSamples', 1,
     'Average this many readings spread through each pixel cell while the servo keeps moving.'),
    ('low', 'signalLow', 'int32_t', 0, 'Black signal', 'ADC', 0, 'lowMaximum', 1,
     'Corrected readings at or below this become black. Must be lower than White signal.'),
    ('high', 'signalHigh', 'int32_t', 1023, 'White signal', 'ADC', 'highMinimum', 1023, 1,
     'Corrected readings at or above this become white. Must be higher than Black signal.'),
    ('sweep', 'sweepMs', 'int32_t', 3000, 'Time per row', 'ms', 'minSweepMs', 2147483, 1,
     'Pan moves from one endpoint to the other in this time. Larger means slower; resolution does not change this speed.'),
    ('pan0', 'panStartUs', 'int32_t', 1100, 'Pan start', 'us', PULSE_MIN, PULSE_MAX, 1,
     'Servo pulse for the left edge. It may be greater than Pan end to reverse the physical axis.'),
    ('pan1', 'panEndUs', 'int32_t', 1900, 'Pan end', 'us', PULSE_MIN, PULSE_MAX, 1,
     'Servo pulse for the right edge. Choose endpoints the mechanism can reach without binding.'),
    ('tilt0', 'tiltStartUs', 'int32_t', 1200, 'Tilt start', 'us', PULSE_MIN, PULSE_MAX, 1,
     'Servo pulse for the top row. Reversed endpoints are allowed.'),
    ('tilt1', 'tiltEndUs', 'int32_t', 1800, 'Tilt end', 'us', PULSE_MIN, PULSE_MAX, 1,
     'Servo pulse for the bottom row. A one-row image samples midway between the endpoints.'),
    ('transition', 'transitionMs', 'int32_t', 250, 'Between-row move', 'ms', 0, 2147483, 1,
     'Time to interpolate from the held pose to the next row. This also handles return from the last row to the first.'),
    ('settle', 'settleMs', 'int32_t', 100, 'Row settling', 'ms', 0, 2147483, 1,
     'Extra wait after a row transition. There is no stop or settling delay between pixels.'),
]


def limit(value): return var(value) if isinstance(value, str) else n(value)


def header_block():
    controls = []
    bindings = {'imageWidth': var('imageWidth'), 'imageHeight': var('imageHeight'),
                'maximumValue': op('MINUS', var('brightnessLevels'), n(1))}
    for id_, name, kind, initial, label, unit, lo, hi, step, note in PARAMETERS:
        spec = {'id': id_, 'type': 'number', 'label': label + (' (' + unit + ')' if unit else ''),
                'min': '{{' + lo + '}}' if isinstance(lo, str) else lo,
                'max': '{{' + hi + '}}' if isinstance(hi, str) else hi,
                'value': '{{' + name + (':2' if kind == 'float' else '') + '}}'}
        if step != 1: spec['step'] = step
        controls.append(spec)
        bindings[name] = var(name)
        for bound in (lo, hi):
            if isinstance(bound, str): bindings[bound] = var(bound)
    profile = {
        'version': 1, 'id': 'photocell', 'title': 'Photocell scanner',
        'description': 'A0 light; pan D9, tilt D10. Start scans; changes restart. Position is commanded, not measured.',
        'fields': [{'id': 'adc', 'min': 0, 'max': 1023}],
        'widgets': [{'type': 'image', 'image': {'id': 'scan', 'width': '{{imageWidth}}', 'height': '{{imageHeight}}', 'mode': 'gray', 'max': '{{maximumValue}}'}},
                    {'type': 'line', 'fields': ['adc']}],
        'controls': controls}
    text = json.dumps(profile, separators=(',', ':'))
    # Numbers are template arguments, not quoted strings in the JSON wire format.
    import re
    text = re.sub(r'"(\{\{[A-Za-z_][A-Za-z0-9_]*(?::\d+)?\}\})"', r'\1', text)
    return template('@plot ' + text, bindings,
        'Ordinary Serial template. Every {{name}} is connected to a live variable, including image dimensions, intensity maximum, control values and timing bounds. Edit the JSON in its dialog; expand the function to see the connected inputs. No JSON parser or image buffer is stored on Arduino.')


def build():
    # Runtime state is deliberately separate from the editable parameters.
    state_specs = [
        ('streaming', 'bool', False), ('settingsValid', 'bool', False), ('settingsDirty', 'bool', False), ('settingRejected', 'bool', False), ('phase', 'uint8_t', 0),
        ('row', 'uint16_t', 0), ('pixel', 'uint16_t', 0), ('reverseRow', 'bool', False),
        ('samplesTaken', 'uint16_t', 0), ('sampleSum', 'uint32_t', 0), ('adcAverage', 'uint16_t', 0),
        ('grayValue', 'uint16_t', 0), ('pixelX', 'uint16_t', 0), ('rowTimeUs', 'uint32_t', 0),
        ('pixelPeriodUs', 'uint32_t', 0), ('samplePeriodUs', 'uint32_t', 0), ('firstSampleUs', 'uint32_t', 0), ('nextSampleUs', 'uint32_t', 0),
        ('phaseStartedUs', 'uint32_t', 0), ('lastServoUs', 'uint32_t', 0),
        ('currentPanUs', 'int16_t', 1500), ('currentTiltUs', 'int16_t', 1500),
        ('fromPanUs', 'int16_t', 1500), ('fromTiltUs', 'int16_t', 1500),
        ('targetPanUs', 'int16_t', 1500), ('targetTiltUs', 'int16_t', 1500),
        ('maxWidth', 'int32_t', 0), ('maxHeight', 'int32_t', 0), ('maxSamples', 'int32_t', 0),
        ('minSweepMs', 'int32_t', 0), ('lowMaximum', 'int32_t', 0), ('highMinimum', 'int32_t', 0),
    ]
    parameters = [declare(name, kind, n(initial), note) for _, name, kind, initial, _, _, _, _, _, note in PARAMETERS]
    globals_ = [declare(name, kind, flag(initial) if kind == 'bool' else n(initial)) for name, kind, initial in state_specs]
    # 45 bytes covers worst-case pixel coordinates/value + a short ADC CSV line.
    # 10 UART bits/byte; 1.5 reserves one third of wire time for overhead.
    globals_.insert(0, declare('serialPixelBudgetUs', 'uint32_t', n(5860),
        'ceil(45 bytes × 10 bits × 1000000 / 115200 × 1.5) = 5860 us. This leaves UART headroom; do not lower it without recalculating the actual message length.'))
    globals_.insert(1, declare('minimumAdcUs', 'uint32_t', n(250),
        'One standard AVR analogRead takes about 104 us at its default ADC clock. Reserve 250 us per read for conversion plus loop/motion work. Late service stops instead of inventing correctly positioned samples.'))

    update_limits = collapsed('updateLimits', chain(
        assign('rowTimeUs', op('MULTIPLY', var('sweepMs'), n(1000))),
        declare('minimumPixelUs', 'uint32_t', maximum(var('serialPixelBudgetUs'), op('MULTIPLY', var('minimumAdcUs'), var('multiSamples')))),
        assign('maxWidth', minimum(n(16384), minimum(idiv(n(16777216), var('imageHeight')), idiv(var('rowTimeUs'), var('minimumPixelUs'))))),
        assign('maxHeight', minimum(n(16384), idiv(n(16777216), var('imageWidth')))),
        assign('maxSamples', minimum(n(65535), idiv(var('rowTimeUs'), op('MULTIPLY', var('imageWidth'), var('minimumAdcUs'))))),
        assign('minSweepMs', n(2147484)),
        iff(compare('LTE', var('imageWidth'), var('maxWidth')), assign('minSweepMs', idiv(op('ADD', op('MULTIPLY', var('imageWidth'), var('minimumPixelUs')), n(999)), n(1000)))),
        assign('pixelPeriodUs', idiv(var('rowTimeUs'), var('imageWidth'))),
        assign('samplePeriodUs', idiv(var('pixelPeriodUs'), var('multiSamples'))),
        assign('firstSampleUs', idiv(op('MINUS', var('pixelPeriodUs'), op('MULTIPLY', op('MINUS', var('multiSamples'), n(1)), var('samplePeriodUs'))), n(2))),
        assign('lowMaximum', op('MINUS', var('signalHigh'), n(1))),
        assign('highMinimum', op('ADD', var('signalLow'), n(1))),
    ), 'Recalculate limits from the actual resolution, averaging, baud budget and row time. The same named bounds drive Plotter controls and command validation. The PC accepts dimensions up to 16384 and 16 megapixels total; AVR timing may allow fewer columns at the chosen speed.')

    checks = [within('imageWidth', n(1), n(16384)), within('imageHeight', n(1), n(16384)),
              compare('LTE', op('MULTIPLY', var('imageWidth'), var('imageHeight')), n(16777216)),
              within('multiSamples', n(1), n(65535)), within('sweepMs', n(1), n(2147483)),
              within('transitionMs', n(0), n(2147483)), within('settleMs', n(0), n(2147483)),
              within('brightnessLevels', n(2), n(65536)), within('gainPercent', n(0), n(1600)),
              within('offset', n(-16384), n(16384)), within('signalLow', n(0), n(1022)), compare('LT', var('signalLow'), var('signalHigh')),
              compare('LTE', var('signalHigh'), n(1023))]
    checks += [within(name, n(PULSE_MIN), n(PULSE_MAX)) for name in ('panStartUs', 'panEndUs', 'tiltStartUs', 'tiltEndUs')]
    validate = collapsed('validateSettings', chain(
        assign('settingsValid', conditions(*checks)),
        iff(var('settingsValid'), chain(call('updateLimits'), assign('settingsValid', both(compare('GTE', var('sweepMs'), var('minSweepMs')), compare('GTE', var('samplePeriodUs'), var('minimumAdcUs'))))))
    ), 'Check edited defaults before any division or motion. Time phases stay below half the micros() wrap period. Runtime controls use these same cross-dependent limits and retain the previous value when rejected.')

    announce = collapsed('announcePlotter', iff(var('settingsValid'), header_block(),
        message('@plot {"version":1,"id":"photocell-error","description":"Invalid defaults: check Parameters and upload again.","fields":[],"widgets":[]}')),
        'Send the current header from setup, Start and every accepted setting change. No stale copied defaults: the template inputs are the actual parameters. Motion is held while this long header is transmitted.')

    write_servos = collapsed('writeServoTargets', chain(micros_servo('scanpan', var('currentPanUs')), micros_servo('scantilt', var('currentTiltUs'))),
        'Timer1 generates both 50 Hz pulse trains. These calls only update pulse widths, in microseconds, within the configured calibration. They do not wait for the mechanism to arrive.')

    transition = collapsed('beginRowTransition', chain(
        assign('fromPanUs', var('currentPanUs')), assign('fromTiltUs', var('currentTiltUs')),
        iff(var('reverseRow'), assign('targetPanUs', var('panEndUs')), assign('targetPanUs', var('panStartUs'))),
        declare('rowFraction', 'float', n(0.5)),
        iff(compare('GT', var('imageHeight'), n(1)), assign('rowFraction', op('DIVIDE', var('row'), op('MINUS', var('imageHeight'), n(1))))),
        assign('targetTiltUs', op('ADD', var('tiltStartUs'), op('MULTIPLY', op('MINUS', var('tiltEndUs'), var('tiltStartUs')), var('rowFraction')))),
        assign('phase', n(1)), assign('phaseStartedUs', block('arduino_micros')),
        assign('lastServoUs', op('MINUS', var('phaseStartedUs'), n(5000))),
        assign('pixel', n(0)), assign('samplesTaken', n(0)), assign('sampleSum', n(0)),
    ), 'Phase 1 interpolates from the held pose to the next row; phase 2 allows extra settling. No samples are assigned during either phase. Each new row reverses pan direction, avoiding a flyback across the whole image.')
    restart = collapsed('restartScan', chain(assign('row', n(0)), assign('reverseRow', flag(False)), call('beginRowTransition')),
        'Start a new image at its first row after the header is sent. The servo begins from its last commanded pose, so changing settings does not jump to a new pulse during header transmission.')
    changed = collapsed('settingsChanged', chain(assign('phase', n(0)), iff(var('settingsValid'), call('updateLimits')), call('announcePlotter'), message('@image-clear scan'),
        iff(both(var('streaming'), var('settingsValid')), call('restartScan'), assign('streaming', flag(False)))) ,
        'An accepted change holds the current servo pulses, regenerates the header from the new parameters, then restarts coherently. The explicit image-clear message starts a clean image; a completed unchanged raster simply overwrites pixels.')
    rejected = collapsed('rejectSetting', chain(assign('phase', n(0)), assign('streaming', flag(False)), call('announcePlotter'),
        message('@msg Rejected; previous value kept. Check limits, then Start.')),
        'A bad input never replaces its parameter. Pause, resend canonical values to restore the controls, and tell the user what to do next.')

    # The generic reader is bounded and consumes only available bytes. All scanner
    # logic below remains ordinary named functions, variables and math blocks.
    receive_cases = [block('serial_when_command', {'COMMAND': 'START'}, statements={'DO': chain(assign('streaming', flag(True)), assign('settingsDirty', flag(True)))}),
        block('serial_when_command', {'COMMAND': 'STOP'}, statements={'DO': chain(
            assign('streaming', flag(False)), assign('phase', n(0)), message('@msg Stopped; servos hold. Start begins a new scan.'))})]
    for id_, name, kind, initial, label, unit, lo, hi, step, note in PARAMETERS:
        receive_cases.append(block('serial_set_number', {'COMMAND': '@set ' + id_, 'VAR': name},
            {'MIN': limit(lo), 'MAX': limit(hi), 'STEP': n(step)},
            {'DO': assign('settingsDirty', flag(True)), 'INVALID': chain(template('@state {\"' + id_ + '\":{{actual' + (':2' if kind == 'float' else '') + '}}}', {'actual': var(name)}), assign('settingRejected', flag(True)))}))
    reader = collapsed('readPlotterCommand', chain(assign('settingsDirty', flag(False)), assign('settingRejected', flag(False)), block('serial_receive_line', {'CAPACITY': 48}, statements={'DO': chain(*receive_cases)}), iff(var('settingRejected'), call('rejectSetting'), iff(var('settingsDirty'), call('settingsChanged')))),
        'Ordinary newline commands: START, STOP, @set name number. The reusable Serial reader buffers at most 47 bytes, never waits for more input, and validates each complete numeric token and its current bounds before assignment.')

    fraction = op('DIVIDE', var('trajectoryElapsedUs'), op('MULTIPLY', var('transitionMs'), n(1000)))
    smooth_transition = chain(declare('fraction', 'float', n(1)), iff(compare('GT', var('transitionMs'), n(0)), assign('fraction', fraction)), assign('fraction', clamp(var('fraction'), n(0), n(1))),
        assign('currentPanUs', op('ADD', var('fromPanUs'), op('MULTIPLY', op('MINUS', var('targetPanUs'), var('fromPanUs')), var('fraction')))),
        assign('currentTiltUs', op('ADD', var('fromTiltUs'), op('MULTIPLY', op('MINUS', var('targetTiltUs'), var('fromTiltUs')), var('fraction')))))
    smooth_sweep = chain(declare('fraction', 'float', op('DIVIDE', var('trajectoryElapsedUs'), var('rowTimeUs'))), assign('fraction', clamp(var('fraction'), n(0), n(1))),
        iff(var('reverseRow'), assign('fraction', op('MINUS', n(1), var('fraction')))),
        assign('currentPanUs', op('ADD', var('panStartUs'), op('MULTIPLY', op('MINUS', var('panEndUs'), var('panStartUs')), var('fraction')))))
    motion = collapsed('serviceMotion', iff(compare('GTE', elapsed('lastServoUs'), n(5000)), chain(
        assign('lastServoUs', block('arduino_micros')), declare('trajectoryElapsedUs', 'uint32_t', op('MINUS', var('lastServoUs'), var('phaseStartedUs'))),
        iff(compare('EQ', var('phase'), n(1)), smooth_transition,
            iff(compare('EQ', var('phase'), n(3)), smooth_sweep)), call('writeServoTargets'))),
        'Update the commanded trajectory every 5 ms, independently of pixel sampling. Timer1 still sends one servo pulse each 20 ms. Real servo speed, lag, backlash and light-sensor response determine useful scan speed; there is no position feedback.')

    emit = collapsed('publishPixel', chain(
        assign('adcAverage', idiv(var('sampleSum'), var('multiSamples'))),
        declare('corrected', 'float', op('ADD', op('MULTIPLY', op('DIVIDE', var('sampleSum'), var('multiSamples')), op('DIVIDE', var('gainPercent'), n(100))), var('offset'))),
        declare('normalized', 'float', clamp(op('DIVIDE', op('MINUS', var('corrected'), var('signalLow')), op('MINUS', var('signalHigh'), var('signalLow'))), n(0), n(1))),
        assign('grayValue', op('ADD', op('MULTIPLY', var('normalized'), op('MINUS', var('brightnessLevels'), n(1))), n(0.5))),
        iff(var('reverseRow'), assign('pixelX', op('MINUS', op('MINUS', var('imageWidth'), n(1)), var('pixel'))), assign('pixelX', var('pixel'))),
        template('@pixel scan {{x}},{{y}},{{value}}', {'x': var('pixelX'), 'y': var('row'), 'value': var('grayValue')}),
        template('{{adc}}', {'adc': var('adcAverage')}),
    ), 'Average the samples, apply gain and ADC-count offset, map Black/White signal to 0..levels-1, then send one pixel plus a short ADC chart line. The PC holds the full image. 1024 levels match the ADC codes; 65536-level output is rescaling, not a 16-bit ADC.')
    # ADC reads are spread across each pixel cell, with a half-interval offset.
    # No catch-up loop invents multiple readings for already passed positions.
    sample = chain(assign('sampleSum', op('ADD', var('sampleSum'), block('inout_analog_read', {'PIN': 'A0'}))),
        assign('samplesTaken', op('ADD', var('samplesTaken'), n(1))),
        assign('nextSampleUs', op('ADD', var('nextSampleUs'), var('samplePeriodUs'))),
        iff(compare('GTE', var('samplesTaken'), var('multiSamples')), chain(call('publishPixel'),
            assign('pixel', op('ADD', var('pixel'), n(1))), assign('samplesTaken', n(0)), assign('sampleSum', n(0)),
            assign('nextSampleUs', op('ADD', op('MULTIPLY', var('pixel'), var('pixelPeriodUs')), var('firstSampleUs'))))))
    late = chain(assign('streaming', flag(False)), assign('phase', n(0)),
        message('@msg Timing overrun: slow the row or reduce columns/samples, then Start.'))
    sample_service = collapsed('serviceSamples', iff(both(compare('LT', var('pixel'), var('imageWidth')), compare('GTE', elapsed('phaseStartedUs'), var('nextSampleUs'))),
        iff(compare('GT', op('MINUS', elapsed('phaseStartedUs'), var('nextSampleUs')), var('samplePeriodUs')), late, sample)),
        'At most one due analogRead per loop pass. Samples follow planned times through the continuously moving row. If service falls a complete sample interval behind, stop visibly instead of labelling a late reading as an earlier pixel. analogRead itself is one short synchronous conversion, not a per-pixel motor pause.')

    finish_transition = chain(assign('currentPanUs', var('targetPanUs')), assign('currentTiltUs', var('targetTiltUs')), call('writeServoTargets'), assign('phase', n(2)), assign('phaseStartedUs', block('arduino_micros')))
    start_row = chain(assign('phase', n(3)), assign('phaseStartedUs', block('arduino_micros')), assign('nextSampleUs', var('firstSampleUs')))
    next_row = chain(iff(var('reverseRow'), assign('currentPanUs', var('panStartUs')), assign('currentPanUs', var('panEndUs'))), call('writeServoTargets'),
        assign('row', op('ADD', var('row'), n(1))), iff(compare('GTE', var('row'), var('imageHeight')), assign('row', n(0))),
        assign('reverseRow', block('logic_negate', values={'BOOL': var('reverseRow')})), call('beginRowTransition'))
    advance = collapsed('advanceScanPhase', iff(compare('EQ', var('phase'), n(1)),
        iff(compare('GTE', elapsed('phaseStartedUs'), op('MULTIPLY', var('transitionMs'), n(1000))), finish_transition),
        iff(compare('EQ', var('phase'), n(2)), iff(compare('GTE', elapsed('phaseStartedUs'), op('MULTIPLY', var('settleMs'), n(1000))), start_row),
            iff(conditions(compare('EQ', var('phase'), n(3)), compare('GTE', var('pixel'), var('imageWidth')), compare('GTE', elapsed('phaseStartedUs'), var('rowTimeUs'))), next_row))),
        'Phases: 0 hold, 1 move between rows, 2 settle, 3 continuous row sweep. Start the next serpentine row only after its last pixel and sweep duration. Unsigned elapsed-time subtraction survives micros() rollover.')

    devices = [block('serial_config', {'BAUD': BAUD}, comment='Purpose: continuously sweep a photocell and build its image on the PC. Wiring: A0 light divider, pan D9, tilt D10, suitable servo supply and common GND. Upload, Plotter 115200, Connect, Start. Change the named Parameters blocks or live controls. No image RAM on Arduino.'),
        config('device_servo', 'scanpan', 'pan', {'PIN': 9, 'ENGINE': 'HARDWARE', 'MIN_US': PULSE_MIN, 'MAX_US': PULSE_MAX, 'FRAME_HZ': 50}, 'D9 / OC1A: hardware Timer1 pulse output. Endpoint parameters are microseconds, not 0–180 degree commands.'),
        config('device_servo', 'scantilt', 'tilt', {'PIN': 10, 'ENGINE': 'HARDWARE', 'MIN_US': PULSE_MIN, 'MAX_US': PULSE_MAX, 'FRAME_HZ': 50}, 'D10 / OC1B: the second Timer1 channel, sharing the 50 Hz frame. Timer1 is reserved by these two servos.')]
    functions = [update_limits, validate, announce, write_servos, transition, restart, changed, rejected, reader, motion, emit, sample_service, advance]
    startup = setup(chain(call('validateSettings'), call('announcePlotter'), iff(var('settingsValid'), message('@image-clear scan'))), 'The board describes its current settings immediately. Hardware servo outputs begin at 1500 us on reset; scanning waits for Start. The bootloader is retained by normal Upload.')
    main = loop(chain(call('readPlotterCommand'), iff(var('streaming'), chain(call('serviceMotion'), call('advanceScanPhase'), iff(compare('EQ', var('phase'), n(3)), call('serviceSamples'))))),
        'Three independent jobs each pass: read commands, update the timed servo trajectory, and service one due ADC reading. No delay and no framebuffer. Expand one named function at a time to follow the algorithm.')

    root = E.Element('xml')
    def place(b, x, y): b.set('x', str(x)); b.set('y', str(y)); root.append(b)
    for i, b in enumerate(devices):
        if i: b.set('collapsed', 'true')
        place(b, 40 + i * 360, 30)
    # Separate the parameters from the algorithm and internal state.
    for indices, x in ((range(0, 3), 40), (range(3, 8), 400), (range(8, 15), 760)):
        place(chain(*(parameters[i] for i in indices)), x, 165)
    place(startup, 40, 630); place(main, 490, 630)
    for i, b in enumerate(functions): place(b, 40 + (i % 3) * 470, 1000 + (i // 3) * 95)
    for i, b in enumerate(globals_):
        b.set('collapsed', 'true'); place(b, 1540 + (i % 3) * 340, 40 + (i // 3) * 65)
    regions = E.SubElement(root, 'workspace-regions', version='1')
    for id_, title, description, x, y, width, height, color in [
        ('scanner_parameters', 'Parameters — change these first', 'Initial values and live Plotter controls use the same variables. Image | Light | Motion. Read each declaration comment for its meaning.', 15, 100, 1180, 470, '#39866b'),
        ('scanner_program', 'Program — expand one function at a time', 'Setup announces the header. Loop services commands, motion and samples independently. Function bodies remain ordinary editable blocks.', 15, 590, 1390, 960, '#3185b5'),
        ('scanner_state', 'Internal state — normally leave unchanged', 'Coordinates, accumulated ADC values, timing and calculated limits. No pixel array is kept here.', 1510, 0, 1060, 840, '#647b8b')]:
        region = E.SubElement(regions, 'region', id=id_, x=str(x), y=str(y), width=str(width), height=str(height), color=color)
        E.SubElement(region, 'title').text = title; E.SubElement(region, 'description').text = description
    E.indent(root, space='  ')
    FILE.write_text(E.tostring(root, encoding='unicode') + '\n')
    print('Built', FILE.name)


if __name__ == '__main__': build()

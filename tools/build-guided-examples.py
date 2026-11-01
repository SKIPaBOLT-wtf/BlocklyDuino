#!/usr/bin/env python3
"""Rebuild the small, commented Pro Mini lessons maintained here. No uploads."""
from pathlib import Path
import copy
import json
import xml.etree.ElementTree as E

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'blockly/apps/blocklyduino/examples'

def block(kind, fields=None, values=None, statements=None, comment=None, mutation=None):
    b = E.Element('block', type=kind)
    if mutation: E.SubElement(b, 'mutation', **{k:str(v) for k,v in mutation.items()})
    for k,v in (fields or {}).items(): E.SubElement(b,'field',name=k).text=str(v)
    for k,v in (values or {}).items():
        if v is not None: E.SubElement(b,'value',name=k).append(v)
    for k,v in (statements or {}).items():
        if v is not None: E.SubElement(b,'statement',name=k).append(v)
    if comment: E.SubElement(b,'comment',pinned='false',w='390',h='170').text=comment
    return b

def chain(*items):
    items=[i for i in items if i is not None]
    if not items:return None
    for a,b in zip(items,items[1:]):
        tail=a
        while tail.find('next/block') is not None: tail=tail.find('next/block')
        E.SubElement(tail,'next').append(b)
    return items[0]
def n(v): return block('math_number',{'NUM':v})
def var(v):return block('variables_get',{'VAR':v})
def flag(v):return block('logic_boolean',{'BOOL':'TRUE' if v else 'FALSE'})
def text(v):return block('text',{'TEXT':v})
def op(name,a,b):return block('math_arithmetic',{'OP':name},{'A':a,'B':b})
def mod(a,b):return block('math_modulo',values={'DIVIDEND':a,'DIVISOR':b})
def compare(name,a,b):return block('logic_compare',{'OP':name},{'A':a,'B':b})
def both(a,b):return block('logic_operation',{'OP':'AND'},{'A':a,'B':b})
def conditions(*xs):
    result=xs[0]
    for x in xs[1:]:result=both(result,x)
    return result
def assign(name,value,comment=None):return block('variables_set',{'VAR':name},{'VALUE':value},comment=comment)
def declare(name,kind='uint8_t',initial=None,comment=None):return block('arduino_typed_variable',{'VAR':name,'TYPE':kind},{'VALUE':initial if initial is not None else n(0)},comment=comment)
def arr(name,shape,kind='byte',comment=None):return block('arduino_array_declare',{'VAR':name,'TYPE':kind,'SIZE':shape},comment=comment)
def ref(name):return block('arduino_array_ref',{'VAR':name})
def cell(name,*indices):return block('arduino_array_get',{'VAR':name},{'INDEX'+('' if i==0 else str(i+1)):v for i,v in enumerate(indices)},mutation={'rank':len(indices)})
def put(name,indices,value,comment=None):return block('arduino_array_set',{'VAR':name},{**{'INDEX'+('' if i==0 else str(i+1)):v for i,v in enumerate(indices)},'VALUE':value},comment=comment,mutation={'rank':len(indices)})
def iff(test,yes,no=None,comment=None):return block('controls_if',values={'IF0':test},statements={'DO0':yes,'ELSE':no},mutation={'else':1} if no is not None else None,comment=comment)
def loop(body,comment):return block('arduino_loop_section',statements={'DO':body},comment=comment)
def setup(body,comment):return block('arduino_setup_section',statements={'DO':body},comment=comment)
def function(name,body,comment):return block('procedures_defnoreturn',{'NAME':name},statements={'STACK':body},comment=comment)
def call(name):return block('procedures_callnoreturn',{'NAME':name},mutation={'name':name})
def every(ms,body):return iff(compare('GTE',op('MINUS',block('arduino_millis'),var('lastSample')),n(ms)),chain(assign('lastSample',block('arduino_millis')),body),comment='Use elapsed milliseconds instead of delay. The command reader remains responsive between updates; unsigned subtraction also works when millis wraps.')
def serial(value,last=False):return block('serial_send',{'END':'println' if last else 'print'},{'VALUE':value})
def message(value,last=True,comment=None):return block('serial_text',{'TEXT':value,'END':'println' if last else 'print'},comment=comment)
def csv(*values):
    parts=[]
    for i,v in enumerate(values):
        parts.append(serial(v,i==len(values)-1))
        if i<len(values)-1:parts.append(message(',',False))
    return chain(*parts)
def data(profile,*values):
    parts=[message('@data {"id":"'+profile+'","t":',False),serial(block('arduino_millis')),message(',"values":[',False)]
    for i,v in enumerate(values):
        if i:parts.append(message(',',False))
        parts.append(serial(v))
    parts.append(message(']}'))
    return chain(*parts)
def header(profile):return message('@plot '+json.dumps(profile,separators=(',',':')),comment='This is an ordinary Serial text message stored in Flash. Click it to edit formatted JSON. The computer creates instruments and computes derived fields; this sketch sends only input values.')
def config(kind,uid,name,fields,comment):return block(kind,{'NAME':name,**fields},comment=comment,mutation={'uid':uid})
def action(kind,uid,values=None,fields=None,comment=None):return block(kind,{'DEVICE':uid,**(fields or {})},values,comment=comment)
def forloop(name,last,body,comment=None):return block('controls_for',{'VAR':name},{'FROM':n(0),'TO':n(last),'BY':n(1)},{'DO':body},comment=comment)
def write(filename,*blocks):
    xml=E.Element('xml')
    for i,b in enumerate(blocks):
        if b is None:continue
        b.set('x',str(30+(i%3)*480));b.set('y',str(30+(i//3)*260));xml.append(b)
    E.indent(xml,space='  ');(OUT/filename).write_text(E.tostring(xml,encoding='unicode')+'\n')

def command_reader(on_start):
    """Full bounded line parser made of ordinary arrays/logic/Serial blocks."""
    def matches(word):return conditions(compare('EQ',var('commandLength'),n(len(word))),compare('EQ',var('commandOverflow'),flag(False)),*[compare('EQ',cell('commandBytes',n(i)),n(ord(c))) for i,c in enumerate(word)])
    finished=chain(iff(matches('START'),chain(assign('streaming',flag(True)),assign('lastSample',block('arduino_millis')),on_start),iff(matches('STOP'),assign('streaming',flag(False)))),assign('commandLength',n(0)),assign('commandOverflow',flag(False)))
    collect=iff(compare('NEQ',var('incoming'),n(13)),iff(compare('LT',var('commandLength'),n(5)),chain(put('commandBytes',[var('commandLength')],var('incoming')),assign('commandLength',op('ADD',var('commandLength'),n(1)))),assign('commandOverflow',flag(True))))
    body=block('controls_whileUntil',{'MODE':'WHILE'},{'BOOL':compare('GT',block('serial_available'),n(0))},{'DO':chain(declare('incoming','int',block('serial_read')),iff(compare('EQ',var('incoming'),n(10)),finished,collect))})
    f=function('readPlotterCommand',body,'Reusable command reader. Plotter sends START + newline (byte 10) or STOP + newline. Keep at most five bytes; ignore CR (13), reject longer lines, and act only on a complete matching word. Partial commands never start the sketch. No String allocation and no waiting for input.')
    f.set('collapsed','true')
    return [block('serial_config',{'BAUD':115200},comment='Select this board and port, upload, open Plotter at 115200 baud and press Start. Start sends START + newline. Stop sends STOP + newline. Starting again resets this demonstration and sends its header again.'),declare('streaming','bool',flag(False)),declare('lastSample','uint32_t'),arr('commandBytes','5',comment='Five-byte command buffer. Only the small incoming command is stored on the board; Plotter stores charts and images on the computer.'),declare('commandLength'),declare('commandOverflow','bool',flag(False)),f]

def plot_example(filename,header_profile,sample,interval=50,extra=None,on_start=None,purpose=''):
    start=chain(on_start,header(header_profile) if header_profile else None)
    blocks=(extra or [])+command_reader(start)
    blocks.append(loop(chain(call('readPlotterCommand'),iff(var('streaming'),every(interval,sample))),purpose+' Upload first, then click Start in Plotter. It stays idle until START; STOP ends data without resetting the board. Read command handling in the collapsed function.'))
    write(filename,*blocks)

def build_plotter():
    plot_example('55-serial-auto-plot.xml',None,csv(block('inout_analog_read',{'PIN':'A0'}),op('MINUS',n(1023),block('inout_analog_read',{'PIN':'A0'}))),purpose='Automatic line chart: connect a potentiometer wiper to A0, ends to GND and VCC. No header is sent: two CSV columns create two traces. In Plotter choose automatic mode if a previous profile is still selected.')
    pot={'version':1,'id':'pot-dashboard','title':'Turn the potentiometer','history':200,'fields':[{'id':'adc','label':'ADC','min':0,'max':1023},{'id':'volts','label':'Voltage','unit':'V','min':0,'max':5,'derive':{'op':'formula','expr':'adc * 5 / 1023'}}],'widgets':[{'type':'gauge','field':'volts'},{'type':'bar','field':'adc'},{'type':'line','fields':['adc']},{'type':'raw','fields':['adc','volts']}]}
    plot_example('56-serial-dashboard.xml',pot,data('pot-dashboard',block('inout_analog_read',{'PIN':'A0'})),purpose='Potentiometer dashboard: A0 wiper, outer legs GND/VCC. Send one ADC number; Plotter computes volts assuming 5 V ADC reference. Change the formula for a different measured reference.')
    mixed={'version':1,'id':'mixed','title':'One stream, five views','history':180,'fields':[{'id':'a','label':'Knob','min':0,'max':1023},{'id':'b','label':'Triangle','min':0,'max':1023},{'id':'seconds','unit':'s'}],'widgets':[{'type':'line','fields':['a','b']},{'type':'gauge','fields':['a','b'],'min':0,'max':1023},{'type':'bar','fields':['a','b'],'min':0,'max':1023},{'type':'xy','series':[{'x':'seconds','y':'a','label':'Knob'},{'x':'seconds','y':'b','label':'Triangle'}]},{'type':'raw','fields':['a','b','seconds']}]}
    triangle=iff(compare('LT',var('phase'),n(100)),assign('triangle',op('MULTIPLY',var('phase'),n(10))),assign('triangle',op('MULTIPLY',op('MINUS',n(199),var('phase')),n(10))))
    plot_example('73-plotter-mixed-dashboard.xml',mixed,chain(triangle,data('mixed',block('inout_analog_read',{'PIN':'A0'}),var('triangle'),op('DIVIDE',block('arduino_millis'),n(1000.0))),assign('phase',mod(op('ADD',var('phase'),n(1)),n(200)))),extra=[declare('phase'),declare('triangle','uint16_t')],on_start=assign('phase',n(0)),purpose='Compare a real A0 signal with a generated triangle. One CSV-like data record feeds overlaid lines, two needles on one gauge, side-by-side bars, two XY traces and a raw table. Optional potentiometer on A0. Both signals use the same 0–1023 scale.')
    def maths(title,window):return {'version':1,'id':'maths','title':title,'history':240,'fields':[{'id':'signal','label':'Signal','unit':'V','min':0,'max':5},{'id':'smooth','label':'Mean','unit':'V','derive':{'op':'mean','source':'signal','window':window}},{'id':'rms','unit':'V','derive':{'op':'rms','source':'signal','window':window}},{'id':'slope','unit':'V/s','derive':{'op':'derivative','source':'signal','time':'device'}},{'id':'area','unit':'V·s','derive':{'op':'integral','source':'signal','time':'device'}},{'id':'peak','unit':'V','derive':{'op':'max','source':'signal','window':window}},{'id':'low','unit':'V','derive':{'op':'min','source':'signal','window':window}},{'id':'sum','derive':{'op':'sum','source':'signal'}}],'widgets':[{'type':'line','fields':['signal','smooth','rms']},{'type':'line','fields':['slope']},{'type':'gauge','fields':['signal','smooth'],'min':0,'max':5},{'type':'raw','fields':['area','slope','peak','low','sum']}]}
    plot_example('74-plotter-live-math.xml',maths('PC mathematics: 4-sample window',4),chain(iff(compare('EQ',var('samples'),n(100)),header(maths('Live update: 20-sample window',20)),comment='After five seconds, send a new header while running. It replaces the dashboard and resets calculation state. The stream continues; no Arduino reset or new Start is needed.'),data('maths',op('DIVIDE',op('MULTIPLY',block('inout_analog_read',{'PIN':'A0'}),n(5.0)),n(1023))),assign('samples',op('ADD',var('samples'),n(1)))),extra=[declare('samples','uint32_t')],on_start=assign('samples',n(0)),purpose='Send one A0 voltage and a millisecond timestamp. Plotter computes moving mean/RMS/min/max, slope, running sum and trapezoidal integral. Integral units are volt-seconds, not energy. A new header at sample 100 changes the averaging window and restarts the calculations. Capture records the configuration changes too.')
    scanner={'version':1,'id':'photocell','title':'Photocell raster + live light','history':160,'fields':[{'id':'light','min':0,'max':1023}],'widgets':[{'type':'image','image':{'id':'scan','width':32,'height':24,'mode':'gray','max':1023}},{'type':'line','fields':['light']},{'type':'gauge','field':'light'}]}
    def point():return chain(action('device_servo_write','scanpan',{'ANGLE':op('ADD',n(30),op('DIVIDE',op('MULTIPLY',var('x'),n(120)),n(31)))}),action('device_servo_write','scantilt',{'ANGLE':op('ADD',n(40),op('DIVIDE',op('MULTIPLY',var('y'),n(100)),n(23)))}))
    advance=chain(assign('x',op('ADD',var('x'),n(1))),iff(compare('GTE',var('x'),n(32)),chain(assign('x',n(0)),assign('y',mod(op('ADD',var('y'),n(1)),n(24))))),point())
    sample=chain(declare('light','uint16_t',block('inout_analog_read',{'PIN':'A0'})),message('@pixel scan ',False),csv(var('x'),var('y'),var('light')),data('photocell',var('light')),advance)
    plot_example('61-serial-image-scanner.xml',scanner,sample,interval=80,extra=[config('device_servo','scanpan','pan',{'PIN':9,'ENGINE':'HARDWARE'},'Pan signal D9 (OC1A), tilt D10 (OC1B): Timer1 generates both servo pulse trains. Use a suitable servo supply and common ground. Light sensor divider output goes to A0; arrange the mechanics so these angles are clear.'),config('device_servo','scantilt','tilt',{'PIN':10,'ENGINE':'HARDWARE'},'Two servos share Timer1 with the same 20 ms frame. No Timer1 stepper or Timer1 audio in this example.'),declare('x'),declare('y')],on_start=chain(assign('x',n(0)),assign('y',n(0)),point()),purpose='32×24 photocell scanner. Start positions the servos, then the first measurement waits 80 ms. Each sample replaces one PC image pixel and adds a chart point; the Arduino stores no image. A completed raster starts again without clearing old pixels. Increase the interval if your mechanics need more settling time.')
    rgb={'version':1,'id':'rgb-demo','title':'Paint a rainbow, one pixel at a time','history':128,'fields':[{'id':'red','min':0,'max':255},{'id':'green','min':0,'max':255},{'id':'blue','min':0,'max':255}],'widgets':[{'type':'image','image':{'id':'rainbow','width':32,'height':24,'mode':'rgb','max':255}},{'type':'line','fields':['red','green','blue']},{'type':'bar','fields':['red','green','blue'],'min':0,'max':255}]}
    rgb_advance=chain(assign('x',op('ADD',var('x'),n(1))),iff(compare('GTE',var('x'),n(32)),chain(assign('x',n(0)),assign('y',op('ADD',var('y'),n(1))),iff(compare('GTE',var('y'),n(24)),chain(assign('y',n(0)),assign('phase',mod(op('ADD',var('phase'),n(32)),n(256))))))))
    rgb_sample=chain(declare('red','byte',op('MULTIPLY',var('x'),n(8))),declare('green','byte',op('MULTIPLY',var('y'),n(11))),declare('blue','byte',var('phase')),message('@pixel rainbow ',False),csv(var('x'),var('y'),var('red'),var('green'),var('blue')),data('rgb-demo',var('red'),var('green'),var('blue')),rgb_advance)
    plot_example('75-plotter-rgb-paint.xml',rgb,rgb_sample,interval=10,extra=[declare('x'),declare('y'),declare('phase')],on_start=chain(assign('x',n(0)),assign('y',n(0)),assign('phase',n(0))),purpose='No external hardware. Paint a 32×24 RGB gradient and redraw it with a changing blue channel. Pixel values remain on the computer until overwritten; Save image exports the visible frame. Charts and bars receive the same colour values. Only coordinates and three colours occupy MCU RAM.')

def build_lcd():
    uid='glyph72'
    glyph=[0,10,10,0,17,14,0,0]
    initial=chain(*[put('faceRows',[n(i)],n(v),'Five bits across, one byte per row. Bit 4 is the leftmost dot; binary 01010 = decimal 10 makes two eyes.' if i==1 else None) for i,v in enumerate(glyph)],action('device_lcd_create_glyph',uid,{'SLOT':n(0),'ROWS':ref('faceRows')},comment='Store the face in CGRAM slot 0. The LCD has eight slots, not eight symbols per line. All displayed occurrences change if this slot is redefined.'),action('device_lcd_show_glyph',uid,{'SLOT':n(0),'COL':n(19),'ROW':n(0)},comment='A single-glyph action also accepts variable slot and position. The animation below will replace this with a complete buffer.'))
    frame=chain(forloop('row',3,forloop('column',19,put('frame',[var('row'),var('column')],n(32))),comment='Prepare a blank 80-byte frame using ASCII space (32). In raw mode zero means glyph 0, so zero is deliberately not our blank value.'),put('frame',[n(1),var('position')],n(0),comment='Write the face slot number into an ordinary buffer cell. Slots 0–7 work; normal characters use their LCD character codes.'),put('frame',[n(2),op('MINUS',n(19),var('position'))],n(0)),action('device_lcd_buffer',uid,{'BUFFER':ref('frame')},{'LAYOUT':'YX','ENCODING':'RAW'},'Send the finished frame once, without clearing the LCD. This avoids exposing intermediate RAM edits. The I2C transfer itself still takes time; this is not an instantaneous display swap.'),assign('position',mod(op('ADD',var('position'),n(1)),n(20))))
    write('72-lcd-custom-glyph-buffer.xml',config('device_lcd',uid,'display',{'ADDR':'0x27','COLS':20,'ROWS':4},'Two faces chase each other on a 20×4 HD44780 LCD with PCF8574 I2C backpack. Pro Mini SDA=A4, SCL=A5. Adjust 0x27 if your module differs. Eight row bytes draw a reusable 5×8 glyph; an 80-byte frame holds character codes.'),arr('faceRows','8',comment='One glyph is eight byte rows, values 0–31. Edit these eight assignments in setup to draw another face.'),arr('frame','4,20',comment='Rows first: frame[row][column]. 80 bytes of character codes, not 80 glyph definitions.'),declare('position'),declare('lastSample','uint32_t'),setup(initial,'Define custom symbols once after LCD initialization. The definition does not draw them until a show-glyph or buffer action writes the slot code.'),loop(every(140,frame),'Build both moving faces in RAM and send the finished frame every 140 ms. No delay is used, so other loop tasks can run between updates. Try a second glyph in slot 1.'))

def build_named_devices():
    # Replace pin-repeating legacy lessons with the same hardware, named once.
    ds={'version':1,'id':'temperature','title':'DS18B20 thermometer','history':100,'fields':[{'id':'temperature','unit':'°C'}],'widgets':[{'type':'line','fields':['temperature']},{'type':'gauge','field':'temperature','min':0,'max':50}]}
    plot_example('07-ds18b20-serial.xml',ds,chain(data('temperature',action('device_ds_read','temp07',{'INDEX':n(0)})),action('device_ds_request','temp07')),interval=800,extra=[config('device_ds18b20','temp07','thermometer',{'PIN':2},'DS18B20 data D2 with 4.7 kΩ pull-up to VCC, VDD to VCC and GND to GND. Powered 3-wire sensor. Conversion starts in setup; the first sample waits 800 ms. -127 means disconnected; 85 may indicate no completed conversion.')],on_start=action('device_ds_request','temp07'),purpose='Nonblocking thermometer: read the previous conversion, start the next, and let loop continue during the 750 ms maximum conversion. Press Plotter Start; temperature is shown as a chart and gauge.')
    dht={'version':1,'id':'climate','title':'DHT22 room climate','history':100,'fields':[{'id':'temperature','unit':'°C'},{'id':'humidity','unit':'%','min':0,'max':100}],'widgets':[{'type':'line','fields':['temperature']},{'type':'gauge','field':'humidity'},{'type':'raw','fields':['temperature','humidity']}]}
    plot_example('22-dht22-serial.xml',dht,chain(declare('temperature','float',action('device_dht_read','dht22',fields={'READ':'TEMP'})),declare('humidity','float',action('device_dht_read','dht22',fields={'READ':'HUM'})),iff(both(compare('EQ',var('temperature'),var('temperature')),compare('EQ',var('humidity'),var('humidity'))),data('climate',var('temperature'),var('humidity')),message('DHT read failed; check power, data and pull-up.'),comment='NaN is not equal to itself. Only send complete valid samples; diagnostic text remains visible in Monitor, and is not plotted as a number.')),interval=2100,extra=[config('device_dht','dht22','climate',{'PIN':2,'MODEL':'DHT22'},'DHT22 data D2, supply and common GND. A bare sensor needs a data pull-up (typically 4.7–10 kΩ); breakout boards may include it. The selected model must match your sensor.')],purpose='Read DHT22 no faster than once per 2.1 seconds. Temperature and humidity use separate scales. Sensor access briefly blocks for the protocol; millis scheduling avoids adding a long delay around it.')
    write('25-ir-nec-serial.xml',config('device_ir_nec','ir25','remote',{'PIN':2},'NEC-compatible receiver output D2, correct module supply and common ground. This is a demodulating IR receiver, not a bare photodiode. Library sampling uses Timer2 on ATmega168; do not also allocate that timer to audio or timer interrupts.'),block('serial_config',{'BAUD':115200}),loop(chain(declare('command','int32_t',action('device_ir_command','ir25')),iff(compare('GTE',var('command'),n(0)),serial(var('command'),True))),'Read the next received command once into a variable. Print only valid frames; -1 means no frame. Open Monitor at 115200 and press buttons on an NEC remote. Avoid delay so new frames are handled promptly.'))
    write('26-74hc595-pattern.xml',config('device_shift595','shift26','lamps',{'DATA':8,'CLOCK':9,'LATCH':10},'74HC595 SER→D8, SRCLK→D9, RCLK→D10; OE→GND, MR→VCC, VCC/GND as appropriate. Use a resistor per LED on Q0–Q7. The named action reuses these three wires.'),declare('position'),declare('lastSample','uint32_t'),loop(every(150,chain(action('device_shift595_write','shift26',{'VALUE':block('ll_bits_shift',{'OP':'SHL','WIDTH':'8'},{'VALUE':n(1),'COUNT':var('position')})},comment='Shift a single 1 across eight output bits, latch once, then advance the index. This teaches a bit pattern without eight separate digital writes.'),assign('position',mod(op('ADD',var('position'),n(1)),n(8))))),'A single LED chases along eight outputs. No delay: additional tasks can run between the 150 ms updates.'))
    write('10-ssd1306-spi.xml',config('device_oled_spi','oled10','screen',{'CS':10,'DC':9,'RESET':8},'SSD1306 128×64 SPI OLED: CS D10, DC D9, RESET D8, MOSI D11, SCK D13. Match the supply and input levels of your module. U8x8 sends text directly, so no full framebuffer consumes the 1 KB RAM.'),declare('lastSample','uint32_t'),declare('seconds','uint32_t'),setup(action('device_oled_print','oled10',{'TEXT':text('Tiny RAM, big fun'),'COL':n(0),'ROW':n(0)}),'Initialize the named SPI OLED once and write a heading. Text coordinates are character cells: columns 0–15, rows 0–7.'),loop(every(1000,chain(action('device_oled_print','oled10',{'TEXT':var('seconds'),'COL':n(0),'ROW':n(3)}),assign('seconds',op('ADD',var('seconds'),n(1))))),'Update the seconds counter once per second. For pixel patterns see the packed-buffer lesson; small tiles work on ATmega168.'))
    motor='coils30'
    write('30-accelstepper-28byj.xml',config('device_stepper_coils',motor,'motor',{'IN1':8,'IN2':9,'IN3':10,'IN4':11,'SPEED':500,'ACCEL':100},'28BYJ-48 through ULN2003: IN1 D8, IN2 D9, IN3 D10, IN4 D11. Separate appropriate motor supply, common GND. AccelStepper uses half steps and switches these four GPIOs in software; PWM pins are not required.'),declare('target','int32_t',n(512)),setup(action('device_stepper_move',motor,{'VALUE':var('target')},{'MODE':'TO'}),'Set the first absolute target. This only requests movement; loop must service it.'),loop(chain(action('device_stepper_run',motor),iff(compare('EQ',action('device_stepper_position',motor,fields={'READ':'DISTANCE'}),n(0)),chain(assign('target',op('MINUS',n(0),var('target'))),action('device_stepper_move',motor,{'VALUE':var('target')},{'MODE':'TO'})))),'Call run on every pass. At each target, reverse to the other position with acceleration and deceleration. No delay or slow display writes here; those would interrupt software pulse generation.'))

if __name__=='__main__':
    build_plotter();build_lcd();build_named_devices()

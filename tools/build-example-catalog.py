#!/usr/bin/env python3
"""Inventory every bundled XML lesson and attach the latest explicit AVR168 audit."""
from pathlib import Path
import json,re,xml.etree.ElementTree as E
ROOT=Path(__file__).resolve().parents[1]; APP=ROOT/'blockly/apps/blocklyduino'; OUT=APP/'examples'
TARGET='arduino:avr:pro:cpu=16MHzatmega168'
devices={
'device_servo':('Servo',['Servo or BlocklyMotion']), 'device_stepper_driver':('STEP/DIR driver',['AccelStepper or FastAccelStepper']), 'device_stepper_coils':('28BYJ-48 + ULN2003',['AccelStepper']),
'device_lcd':('HD44780 I2C LCD',['LiquidCrystal_I2C','Wire']), 'device_oled':('SSD1306 I2C OLED',['U8g2/U8x8','Wire']), 'device_oled_spi':('SSD1306 SPI OLED',['U8g2/U8x8','SPI']), 'device_tft':('ST7735 SPI TFT',['Adafruit ST7735','SPI']),
'device_ultrasonic':('HC-SR04',[]),'device_ds18b20':('DS18B20',['DallasTemperature','OneWire']), 'device_dht':('DHT11/22',['DHT sensor library']), 'device_neopixel':('WS2812 RGB LEDs',['Adafruit NeoPixel']), 'device_ir_nec':('NEC IR receiver',['IRremote']), 'device_shift595':('74HC595',[]),'music_buzzer':('Passive buzzer',['BlocklyMusic']),
'st_i2c_eeprom':('24LC256 EEPROM',['BlocklyStorage','Wire']), 'st_spi_eeprom':('25LC256 EEPROM',['BlocklyStorage','SPI']), 'st_spi_flash':('W25Q32 Flash',['BlocklyStorage','SPI']), 'st_sd':('SPI SD card',['BlocklyStorage','SdFat','SPI']), 'll_spi_device':('Custom SPI device',['SPI']), 'll_i2c_device':('Custom I2C device',['Wire'])}
legacy={
'ds18b20_temperature':'device_ds18b20','lcd_i2c_print':'device_lcd','lcd20x4_init':'device_lcd','lcd20x4_print':'device_lcd','lcd20x4_show':'device_lcd','oled091_print':'device_oled','ssd1306_spi_print':'device_oled_spi','st7735_print':'device_tft','servo_move':'device_servo','stepper_28byj_init':'device_stepper_coils','accel_4wire_init':'device_stepper_coils','accel_driver_init':'device_stepper_driver','a4988_move':'device_stepper_driver','a4988_init':'device_stepper_driver','dht_temperature':'device_dht','dht_humidity':'device_dht','ultrasonic_distance':'device_ultrasonic','neopixel_init':'device_neopixel','ir_nec_read':'device_ir_nec','shift595_write':'device_shift595'}
names={
'01':'Blink the built-in LED','02':'Serial hello','03':'Potentiometer values in Monitor','04':'Potentiometer dims a PWM LED','05':'Button controls an LED','06':'Traffic lights','07':'DS18B20 thermometer + Plotter','08':'16×2 I2C LCD hello','09':'16×2 LCD potentiometer','10':'SPI OLED uptime counter','11':'ST7735 colour TFT text','12':'Find I2C device addresses','13':'0.91-inch I2C OLED text','14':'Grove RGB LCD','15':'Single piezo beep','16':'Simple piezo melody','17':'DS18B20 temperature on LCD','18':'20×4 LCD animation (legacy helper)','19':'20×4 LCD potentiometer','20':'Servo sweep (core timer library)','21':'28BYJ stepper (blocking legacy lesson)','22':'DHT22 climate + Plotter','23':'HC-SR04 distance in Monitor','24':'NeoPixel colour cycle','25':'NEC remote commands','26':'74HC595 chasing LED','27':'STEP/DIR stepping (legacy helper)','28':'20×4 animation made from blocks','29':'STEP/DIR acceleration (legacy helper)','30':'Named 28BYJ: accelerated back and forth','31':'Setup, loop, function and variable','32':'Math operations','33':'Array animation with millis timing','34':'Local variables and 2D arrays','35a':'Named stepper: position targets','35b':'Named 20×4 I2C LCD','35c':'Servo and distance sensor sweep','36a':'I2C EEPROM: values and text','36b':'SPI EEPROM: values and text','36c':'SPI Flash: erase, write, read','36d':'SD text file','36e':'SD BMP: coordinate pixels','36f':'Radar measurements → BMP','37':'Stream monochrome BMP to SD','38a':'Buzzer: nonblocking beep','38b':'Three independent melody voices','38c':'Melody with rests','39':'SD text-note melody','40':'Polar scan → streamed BMP','41':'Multidimensional arrays and variable indices','42':'BMP grayscale levels','43':'RGB BMP gradient','44':'1024-shade grayscale PGM','45':'High-depth RGB PPM','46':'Typed function arguments and results','47':'Pack flags and bit fields','48':'AVR direct-port blink','49':'AVR input and pull-up','50':'Direct-port byte driver','51':'Read SPI Flash JEDEC ID','52':'I2C register read','53':'Interrupt counter with atomic snapshot','54':'Bidirectional Serial echo','55':'Plotter: automatic lines','56':'Plotter: potentiometer dashboard','57':'External interrupt edge counter','58':'Pin-change counters','59':'Timer1 periodic interrupt','60':'Attach and detach interrupts','61':'Photocell scanner: image + chart','62':'Continuous stepper: potentiometer ramp','63':'Servo pulse width in microseconds','64':'LCD character buffer','65':'OLED packed pixel tile','66':'NeoPixel RGB buffer','67':'TFT RGB565 tile','68':'A note read from a variable','69':'Polyphonic SD score','70':'Timer1 stepper: fine speed commands','71':'Hardware Servo + hardware sound','72':'LCD custom faces from a buffer','73':'Plotter: multiple instruments together','74':'Plotter: PC math and live configuration','75':'Plotter: RGB painting, no extra hardware'}
recommended={'01','03','04','05','07','10','12','22','25','26','30','31','35b','36a','36b','36c','36d','37','38b','41','47','51','52','54','55','56','57','60','61','62','64','65','66','67','68','69','70','71','72','73','74','75'}
advanced={'34','36c','36e','36f','37','38b','39','40','42','43','44','45','46','47','48','49','50','51','52','53','58','59','60','61','65','67','69','70','71','73','74'}
groups=[('Start here',{'01','02','03','04','05','06','12','31','32','33','34','41','46'}),('Sensors and input',{'07','17','22','23','25'}),('Displays and LED outputs',{'08','09','10','11','13','14','18','19','24','26','28','35b','64','65','66','67','72'}),('Motors and motion',{'20','21','27','29','30','35a','35c','62','63','70','71'}),('Sound and music',{'15','16','38a','38b','38c','39','68','69'}),('Memory, files and images',{'36a','36b','36c','36d','36e','36f','37','40','42','43','44','45'}),('Ports, bits and interrupts',{'47','48','49','50','51','52','53','57','58','59','60'}),('Serial Monitor and Plotter',{'54','55','56','61','73','74','75'})]
plotter={'07':['line','gauge'],'22':['line','gauge','raw'],'55':['auto-line'],'56':['line','gauge','bar','raw'],'61':['image-gray','line','gauge'],'73':['line-multiple','gauge-multiple','bar-multiple','xy-multiple','raw'],'74':['line-multiple','gauge-multiple','raw','math','live-header'],'75':['image-rgb','line-multiple','bar-multiple']}
purposes={
'01':'Turn the built-in D13 LED on and off. Learn the order of statements and milliseconds.',
'02':'Print a short greeting repeatedly in Serial Monitor. Match the sketch and Monitor baud rates.',
'03':'Read a potentiometer on A0 and print its 0–1023 ADC value. Turn the knob to see the number change.',
'04':'Map an A0 potentiometer reading to PWM brightness for an LED. A PWM output is required for analogWrite.',
'05':'Read a button and change an LED. The input needs the pull-up or wiring described in the blocks.',
'06':'Run a simple red/amber/green traffic-light sequence. Each wait makes the next visible phase last longer.',
'07':'Request a DS18B20 conversion without waiting, read it after 800 ms, and show a thermometer dashboard after Plotter Start.',
'08':'Show a greeting on a 16×2 HD44780 LCD with PCF8574 I2C backpack. Check address and contrast first.',
'09':'Read a potentiometer and print the value on a 16×2 I2C LCD. Learn how repeated prints update a text display.',
'10':'Count seconds on an SSD1306 SPI OLED using a named device and no framebuffer. Update with millis timing.',
'11':'Print text and an analog reading on an ST7735 colour TFT over hardware SPI. Match the panel type and wiring.',
'12':'Scan the I2C bus and print responding addresses in Monitor. Use it to discover the address of an attached module.',
'13':'Print text on a 128×32 SSD1306 I2C OLED. U8x8 sends character tiles without a full pixel framebuffer.',
'14':'Use the text and RGB backlight of a Grove JHD1313 LCD. This module uses a different library from PCF8574 backpacks.',
'15':'Make a passive piezo beep using the Arduino core tone function. This AVR engine uses Timer2 interrupts.',
'16':'Play a short tune with the basic core tone blocks. Compare this blocking lesson with the nonblocking named music examples.',
'17':'Read a DS18B20 temperature and show it on an I2C character LCD. Check the sensor pull-up and LCD address.',
'18':'Play a preset 20×4 LCD animation with an older helper. Example 28 exposes the animation as individual blocks.',
'19':'Show a potentiometer reading on a 20×4 LCD. Use the named LCD and buffer examples for reusable display logic.',
'20':'Move a hobby servo between three angles with the core Servo library. Pulse edges are timer interrupt driven; the waits pause the main loop.',
'21':'Move a 28BYJ-48 through a ULN2003 using a blocking legacy helper. Example 30 provides named, accelerated, nonblocking control.',
'22':'Read DHT22 temperature and humidity every 2.1 seconds. Plotter Start opens separate temperature and humidity views; invalid readings are reported as text.',
'23':'Measure HC-SR04 echo duration and print distance. Sensor reads can block while waiting for an echo; leave at least 60 ms between readings.',
'24':'Change WS2812 RGB LED colours. The strip library keeps a small colour buffer and sends it on show.',
'25':'Read each NEC remote command once and print only valid frames. Poll promptly while IRremote uses Timer2 for reception.',
'26':'Send a shifting one-bit pattern to a 74HC595 so one LED chases across eight outputs. Wiring is declared once.',
'27':'Generate a simple STEP/DIR movement with a legacy helper. Use example 70 for fast hardware-timed continuous motion.',
'28':'Build a 20×4 moving-text animation from editable blocks rather than a preset animation helper.',
'29':'Request STEP/DIR positions and repeatedly call AccelStepper run to accelerate and decelerate. Older helper format retained for comparison.',
'30':'Use one named 28BYJ-48 motor to travel between two positions with acceleration. Call run continuously; no delay interrupts the coil sequence.',
'31':'Separate one-time setup from repeated loop work, create a variable, and call a reusable function.',
'32':'Try arithmetic, ranges and mathematical operations. Observe how connected value blocks form expressions.',
'33':'Update array data on a millis schedule so loop can continue between animation steps.',
'34':'Compare global and local declarations and address a two-dimensional array with zero-based indices.',
'35a':'Declare a STEP/DIR device once, request target positions and keep servicing the loop engine until each target is reached.',
'35b':'Declare a 20×4 I2C LCD once and print through its named actions without repeating address or dimensions.',
'35c':'Sweep a servo and take HC-SR04 distance readings. Allow settling time and remember that an echo read briefly blocks.',
'36a':'Write and read typed values and text in a 24LC256 I2C EEPROM. Addresses are byte offsets, separate from its I2C bus address.',
'36b':'Write and read typed values and text in a 25LC256 SPI EEPROM using one named chip-select configuration.',
'36c':'Erase a W25Q32 Flash sector, write a value/text, then read it back. Flash cannot overwrite programmed bits without erase.',
'36d':'Create or append a text file on an SPI SD card, then flush and close it. A FAT filesystem remains readable on a computer.',
'36e':'Create a small BMP file on SD and write pixels by coordinates. File storage replaces a full image array in RAM.',
'36f':'Sweep a servo, measure distance, and draw results into an SD BMP. This combined sketch has little memory margin on ATmega168.',
'37':'Write a monochrome BMP in raster order, one pixel at a time, then finish the file. No full image buffer is allocated.',
'38a':'Start a nonblocking note on a named passive buzzer while the main loop remains available for other tasks.',
'38b':'Play three independent melody voices on three passive buzzers. The optional IRQ mixer shares one Timer2 and consumes periodic CPU time.',
'38c':'Define a reusable flash melody with rests and play it through a named buzzer.',
'39':'Read text notes from a known SD file and pass each note record to the buzzer. The line parser avoids loading the whole tune.',
'40':'Convert a polar servo/distance scan into row-ordered BMP output on SD. Advanced example with tight AVR memory margins.',
'41':'Use variables for every index of a multidimensional array. Fixed dimensions reserve RAM; indices choose an element at runtime.',
'42':'Create a grayscale BMP with selected palette levels and append calculated shades. Values must fit the chosen output range.',
'43':'Stream an RGB gradient into a BMP file without keeping the picture in AVR RAM.',
'44':'Write a 1024-level grayscale PGM, preserving more than 8 bits per sample. Use a computer image viewer that supports PGM.',
'45':'Write a high-depth RGB PPM with selected per-channel range. This format preserves precision beyond an 8-bit BMP channel.',
'46':'Define a function with typed float and uint32_t arguments and an explicit result type.',
'47':'Pack several flags and small fields into integers with masks, shifts and extraction blocks.',
'48':'Blink D13 through AVR port registers. Compare the generated code and Flash use with ordinary digitalWrite.',
'49':'Configure an AVR port input and pull-up with masks, then read its bit without changing neighbouring pins.',
'50':'Drive a byte pattern through direct port operations. This advanced lesson exposes register ownership and bit masks.',
'51':'Send the JEDEC-ID command to an SPI Flash chip and read its identification bytes using generic SPI blocks.',
'52':'Write a register pointer and read data from an I2C device using generic transactions. Match the address/register to the attached chip.',
'53':'Increment a volatile counter in an interrupt and copy it atomically before using it in loop.',
'54':'Echo incoming Serial bytes back to Monitor. Test sending text and different line endings without a blocking String read.',
'55':'After Plotter Start, send two numeric CSV columns from A0. Automatic mode discovers two line traces without a JSON header.',
'56':'After Plotter Start, send one A0 value. A Flash-resident header asks the PC to calculate voltage and show lines, a gauge, a bar and raw values.',
'57':'Count edges on external interrupt D2. A physical button may bounce and create several electrical edges per press.',
'58':'Use pin-change interrupts on D4 and D5 to keep separate counters, then copy the values safely in loop.',
'59':'Use Timer1 for a periodic interrupt and keep the handler short. The timer is then unavailable to Servo, fast stepper and its PWM channels.',
'60':'Attach or detach a configured interrupt using Monitor commands while preserving the accumulated counter.',
'61':'After Plotter Start, scan a photocell with two hardware servos. Send one gray pixel and chart sample at a time; the computer retains the image.',
'62':'Use a potentiometer to set signed continuous stepper speed with acceleration. The software loop engine must still be serviced every pass.',
'63':'Map a potentiometer to servo pulse microseconds for finer command increments than whole degree values.',
'64':'Prepare an 80-byte LCD character grid in RAM, then send the finished 20×4 frame once. Legacy text mode treats zero as a space.',
'65':'Build a 128-byte packed OLED tile: each byte stores eight vertical pixels. Send the tile without allocating a full-screen buffer.',
'66':'Prepare RGB values in an array, copy them to the NeoPixel library buffer and call show once for the finished frame.',
'67':'Prepare a small RGB565 colour tile and send it to an ST7735 TFT in one SPI transaction.',
'68':'Pass a note record through a variable to the music parser. The same format can come from EEPROM, Serial or an SD line.',
'69':'Play a timed, polyphonic score from SD without loading it all into RAM. Three IRQ voices and the SD cache leave a small stack margin.',
'70':'Start a Timer1 STEP/DIR motor stopped, then change signed target speed in small or large increments through Monitor. Hardware pulses and acceleration continue independently of loop.',
'71':'Use a potentiometer to control hardware Servo pulses on D9 while a hardware buzzer on D11 plays a melody. Timer1 and Timer2 have separate owners.',
'72':'Define a 5×8 face in LCD glyph slot 0, then animate two faces through an 80-byte raw-code buffer. Eight slots and variable indices are supported.',
'73':'Compare A0 with a generated triangle in overlaid lines, a multi-needle gauge, grouped bars, two XY traces and a raw table. Start/Stop controls one shared stream.',
'74':'Send one voltage plus device time and let the PC calculate mean, RMS, limits, sum, derivative and integral. After five seconds, a live header changes the averaging window.',
'75':'Paint an RGB gradient one pixel at a time while charts and bars show the colours. No external hardware or AVR image buffer is needed.',
'blink.xml':'Original BlocklyDuino blink workspace retained for importing older projects.',
'click_color.xml':'Original BlocklyDuino demonstration workspace retained as a legacy import, outside the current AVR168 compile audit.',
'servo_potentio.xml':'Original potentiometer-to-servo workspace retained as a legacy import. Prefer the named servo lessons for new work.'}

def build():
    audit_path=ROOT/'.test-build/compile-audit-atmega168.json'
    audit=json.loads(audit_path.read_text()) if audit_path.exists() else {}
    rows=audit.get('results',audit.get('examples',[]))
    if isinstance(rows,dict):rows=[dict(value,example=key) for key,value in rows.items()]
    byfile={}
    for row in rows:
        file=row.get('file',row.get('example',''))
        byfile[file]=row;byfile[re.sub('[^A-Za-z0-9_]','_',file)]=row
    result=[]
    for file in sorted(OUT.glob('*.xml')):
        root=E.parse(file).getroot();types={b.get('type') for b in root.iter('block')};prefix=file.name.split('-')[0]
        hw={x for x in types if x in devices}|{legacy[x] for x in types if x in legacy}
        # Older dedicated helpers retain their exact saved XML for compatibility.
        if prefix in {'08','09','17','18','19','28'}:hw.add('device_lcd')
        if prefix=='13':hw.add('device_oled')
        if prefix=='11':hw.add('device_tft')
        if prefix in {'15','16'}:hw.add('music_buzzer')
        hardware=[{'id':x,'label':devices[x][0]} for x in sorted(hw)]
        if any(b.get('type')=='inout_analog_read' for b in root.iter('block')):hardware.append({'id':'analog-input','label':'Analog source / potentiometer'})
        if prefix=='14':hardware.append({'id':'grove-rgb-lcd','label':'Grove JHD1313 RGB LCD'})
        if prefix in {'01','04','05','06','48','49','50','57','58'}:hardware.append({'id':'basic-gpio','label':'LEDs / button / GPIO'})
        if any('serial' in x for x in types):hardware.append({'id':'serial','label':'USB–Serial adapter'})
        if not hardware:hardware=[{'id':'board','label':'Pro Mini only'}]
        desc=purposes[prefix]
        group=next((label for label,ids in groups if prefix in ids),'Legacy imports')
        row=byfile.get(file.name,byfile.get(re.sub('[^A-Za-z0-9_]','_',file.name)))
        verification={'target':TARGET,'status':'not-compiled','physical':'not-tested-in-this-audit'}
        if row:
            verification.update({k:v for k,v in row.items() if k not in {'example','file','name'}})
            if 'status' not in row:verification['status']='compiled' if row.get('ok') else 'failed'
        notes=[]
        if row and row.get('classification')=='tight':notes.append('Small remaining memory margin: '+str(row.get('flashRemaining'))+' bytes Flash and '+str(row.get('ramRemaining'))+' bytes SRAM before stack/heap. Keep this advanced; compile success does not measure stack or dynamic allocation.')
        if prefix in {'36f','40'}:notes.append('Combined SD, sensing and motion: advanced, little stack/heap headroom on ATmega168. Compile size is not a runtime stack test.')
        if prefix in {'36a','36b'}:notes.append('Writes a small EEPROM test area. Use a chip with no data you need to retain.')
        if prefix=='36c':notes.append('Erases a whole 4 KB Flash sector before writing. Use a chip with no data you need to retain.')
        if prefix in {'21','27','29'}:notes.append('Legacy lesson retained for existing projects. Prefer named-device examples 30, 62 or 70 for new work.')
        if prefix=='65':notes.append('Uses a 128-byte tile. Do not allocate a 1024-byte OLED framebuffer on a board with 1024 bytes total SRAM.')
        if prefix in {'38b','69'}:notes.append('Three-voice IRQ music shares Timer2. Each passive buzzer uses a separate output; Timer2 is unavailable for another independent engine.')
        if prefix=='75':notes.append('All pixels are held on the computer. The Arduino sends one pixel and chart sample at a time.')
        result.append({'id':prefix,'file':file.name,'title':names.get(prefix,file.stem.replace('_',' ').replace('-',' ')),'group':group,'level':'advanced' if prefix in advanced or row and row.get('classification')=='tight' else 'beginner','recommended':prefix in recommended,'hardware':hardware,'libraries':sorted(set(y for x in hw for y in devices[x][1])),'description':desc,'notes':notes,'plotterModes':plotter.get(prefix,[]),'startCommand':'START\n' if prefix in plotter else None,'stopCommand':'STOP\n' if prefix in plotter else None,'verification':verification})
    payload={'version':1,'auditedAt':audit.get('auditedAt'),'target':{'fqbn':TARGET,'label':'Pro Mini ATmega168 · 16 MHz','flashLimit':14336,'ramLimit':1024},'groups':[x[0] for x in groups]+['Legacy imports'],'examples':result}
    (OUT/'catalog.json').write_text(json.dumps(payload,indent=2,ensure_ascii=False)+'\n')
    print('Catalog:',len(result),'XML files;',len({d['id'] for x in result for d in x['hardware']} & set(devices)),'of',len(devices),'named device types represented')
if __name__=='__main__':build()

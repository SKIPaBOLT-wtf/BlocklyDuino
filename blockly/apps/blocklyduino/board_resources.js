/* SPDX-License-Identifier: Apache-2.0
 * Pin and peripheral contracts for the supported board/core combinations.
 * Pure model: no DOM, serial access or guesses about unlisted boards.
 */
(function(root,factory){var api=factory();if(typeof module==='object')module.exports=api;else root.BoardResources=api;})(this,function(){
 'use strict';
 function range(a,b,prefix){var r=[];for(var i=a;i<=b;i++)r.push((prefix||'')+i);return r;}
 function profile(fqbn){
  var p={fqbn:fqbn||'',known:true,aliases:{},pwm:[],irq:[],pcint:[],servo:12,buzzer:0,buses:{},serial:[],reserved:[]};
  if(/^arduino:avr:(uno|nano|pro|diecimila)(:|$)/.test(fqbn)){
   p.led='13';p.id='avr328';p.name='ATmega168/328';p.digital=range(0,13).concat(range(0,5,'A'));p.analog=range(0,/:(pro|nano)(:|$)/.test(fqbn)?7:5,'A');
   range(14,21).forEach(function(n){p.aliases[n]='A'+(Number(n)-14);});
   p.pwm=['3','5','6','9','10','11'];p.irq=['2','3'];p.pcint=p.digital.slice();p.buzzer=3;p.servoTimer='Timer1';
   p.pwmTimer={'3':'Timer2','11':'Timer2','9':'Timer1','10':'Timer1','5':'Timer0','6':'Timer0'};
   p.buses={I2C:{SDA:'A4',SCL:'A5'},SPI:{MOSI:'11',MISO:'12',SCK:'13'}};p.serial=['0','1'];p.spiSS='10';p.avrpin=range(0,5,'B').concat(range(0,5,'C'),range(0,7,'D'));range(0,5).forEach(function(n){p.aliases['B'+n]=String(8+Number(n));p.aliases['C'+n]='A'+n;});
  }else if(/^rp2040:rp2040:rpipico(:|$)/.test(fqbn)){
   p.led='25';p.id='pico';p.name='Raspberry Pi Pico';p.digital=range(0,22).concat(['26','27','28']);p.analog=['26','27','28'];p.aliases={A0:'26',A1:'27',A2:'28'};
   p.pwm=p.digital.slice();p.irq=p.digital.slice();p.servo=8;p.servoTimer='PIO Servo';p.pwmTimer={};p.digital.forEach(function(n){p.pwmTimer[n]='PWM slice '+(Math.floor(+n/2)%8);});
   p.buses={I2C:{SDA:'4',SCL:'5'},SPI:{MOSI:'19',MISO:'16',SCK:'18'}};
  }else if(/^STMicroelectronics:stm32:GenF1:/.test(fqbn)&&/pnum=BLUEPILL_F103C[8B]/.test(fqbn)){
   p.led='PC13';p.id='bluepill';p.name='Blue Pill F103';p.digital=range(0,15,'PA').concat(range(0,15,'PB'),['PC13','PC14','PC15']);p.reserved=['PA11','PA12','PA13','PA14','PA15','PB3','PB4','PC14','PC15'];
   p.digital=p.digital.filter(function(n){return p.reserved.indexOf(n)<0;});p.analog=range(0,7,'PA').concat(['PB0','PB1']);p.analog.forEach(function(n,i){p.aliases['A'+i]=n;});p.pwm=['PA0','PA1','PA2','PA3','PA6','PA7','PA8','PA9','PA10','PB0','PB1','PB6','PB7','PB8','PB9'];p.irq=p.digital.slice();p.servoTimer='TIM2';
   p.pwmTimer={PA0:'TIM2',PA1:'TIM2',PA2:'TIM2',PA3:'TIM2',PA6:'TIM3',PA7:'TIM3',PB0:'TIM3',PB1:'TIM3',PA8:'TIM1',PA9:'TIM1',PA10:'TIM1',PB6:'TIM4',PB7:'TIM4',PB8:'TIM4',PB9:'TIM4'};
   p.buses={I2C:{SDA:'PB7',SCL:'PB6'},SPI:{MOSI:'PA7',MISO:'PA6',SCK:'PA5'}};
   if(!/usb=CDC/.test(fqbn))p.serial=['PA10','PA9'];
  }else{p.known=false;p.id='unknown';p.name='No verified pin profile';p.digital=[];p.analog=[];p.servo=0;}
  return p;
 }
 var specs={
  device_stepper_driver:{pins:{STEP:'digital',DIR:'digital'}},device_stepper_coils:{pins:{IN1:'digital',IN2:'digital',IN3:'digital',IN4:'digital'}},
  device_servo:{pins:{PIN:'digital'},resource:'servo'},device_lcd:{bus:'I2C'},device_oled:{bus:'I2C'},st_i2c_eeprom:{bus:'I2C'},ll_i2c_device:{bus:'I2C'},
  device_oled_spi:{bus:'SPI',pins:{CS:'digital',DC:'digital',RESET:'digital'}},device_tft:{bus:'SPI',pins:{CS:'digital',DC:'digital',RESET:'digital'}},
  st_spi_eeprom:{bus:'SPI',pins:{CS:'digital'}},st_spi_flash:{bus:'SPI',pins:{CS:'digital'}},st_sd:{bus:'SPI',pins:{CS:'digital'},resource:'sd'},ll_spi_device:{bus:'SPI',pins:{CS:'digital'}},
  device_ultrasonic:{pins:{TRIG:'digital',ECHO:'digital'}},device_ds18b20:{pins:{PIN:'digital'}},device_dht:{pins:{PIN:'digital'}},device_neopixel:{pins:{PIN:'digital'}},device_ir_nec:{pins:{PIN:'digital'},resource:'ir'},
  device_shift595:{pins:{DATA:'digital',CLOCK:'digital',LATCH:'digital'}},music_buzzer:{pins:{PIN:'digital'},resource:'buzzer',avr:true},
  irq_external:{pins:{PIN:'irq'},irq:true,resource:'external',avr:true},irq_pin_change:{pins:{PIN:'pcint'},irq:true,avr:true},irq_timer1:{resource:'timer1',avr:true},
  inout_buildin_led:{fixedLED:true},
  inout_analog_read:{pins:{PIN:'analog'},gpio:true},inout_analog_write:{pins:{PIN:'pwm'},gpio:true,resource:'pwm'},inout_digital_read:{pins:{PIN:'digital'},gpio:true,read:true},inout_digital_write:{pins:{PIN:'digital'},gpio:true},
  servo_move:{pins:{PIN:'digital'},resource:'servo',legacyServo:true},servo_read_degrees:{pins:{PIN:'digital'},resource:'servo',legacyServo:true},
  inout_tone:{pins:{PIN:'digital'},resource:'tone',gpio:true},inout_notone:{pins:{PIN:'digital'},resource:'tone',gpio:true},
  avr_pin_read:{pins:{PIN:'avrpin'},gpio:true,read:true,avr:true},avr_pin_write:{pins:{PIN:'avrpin'},gpio:true,avr:true},
  avr_port_read:{rawPort:true,avr:true},avr_port_bits:{rawPort:true,avr:true},avr_port_replace:{rawPort:true,avr:true},avr_port_write:{rawPort:true,avr:true},avr_port_direction:{rawPort:true,avr:true},
  avr_isr:{rawRegister:true,avr:true},avr_register_read:{rawRegister:true,avr:true},avr_register_write:{rawRegister:true,avr:true},avr_register_bits:{rawRegister:true,avr:true},avr_register_flags:{rawRegister:true,avr:true}
 };
 function pin(p,v){v=String(v==null?'':v).replace(/^D(?=\d)/,'');return p.aliases[v]||v;}
 function label(p,v){v=pin(p,v);return p.id==='pico'?'GP'+v:/^\d+$/.test(v)?'D'+v:v;}
 function active(r){return !r.disabled;}
 function analyze(records,p){
  var claims={},errors=[],counts={},timers={},addresses={},rows=[],servoPins={},notes=[];
  function error(r,msg){errors.push({id:r.id,message:(r.name||r.type)+': '+msg});}
  function claim(r,v,role,share){v=pin(p,v);if(!v)return;var c={id:r.id,name:r.name||r.type,role:role,share:share||'',pin:v,observer:!!(specs[r.type]&&specs[r.type].read),irq:!!(specs[r.type]&&specs[r.type].irq)};(claims[v]||(claims[v]=[])).push(c);return c;}
  var live=records.filter(active);
  live.forEach(function(r){var s=specs[r.type];if(!s){if(/^(user_|arduino_raw)/.test(r.type))notes.push('Custom C++ may use resources beyond these declarations.');return;}
   if(!p.known){error(r,'choose a board with a verified pin profile.');return;}
   if(s.avr&&p.id!=='avr328')error(r,'this block requires ATmega168/328.');
   if(s.resource){if(!s.legacyServo||!servoPins[pin(p,r.fields.PIN)])counts[s.resource]=(counts[s.resource]||0)+1;if(s.legacyServo)servoPins[pin(p,r.fields.PIN)]=true;}
   var row={id:r.id,name:r.name||r.type,type:r.type,wires:[]};rows.push(row);
   if(s.fixedLED){claim(r,p.led,'LED','gpio:'+p.led);row.wires.push('LED → '+label(p,p.led));}
   Object.keys(s.pins||{}).forEach(function(f){var v=pin(p,r.fields[f]),kind=s.pins[f],valid=p[kind]||[];
    if(valid.map(function(x){return pin(p,x);}).indexOf(v)<0)error(r,f+' needs a compatible '+kind+' pin; '+label(p,v)+' is unavailable.');
    var shared=s.gpio?'gpio:'+v:s.legacyServo?'servo:'+v:'';
    row.wires.push(f+' → '+label(p,v));claim(r,v,f,shared);
    if(kind==='pwm'&&p.pwmTimer)timers[p.pwmTimer[v]]=timers[p.pwmTimer[v]]||[];
   });
   if(s.rawPort||s.rawRegister){
    var reg=String(r.fields.REGISTER||r.fields.VECTOR||''),port=s.rawPort?r.fields.PORT:(/^(PORT|DDR|PIN)[BCD]$/.test(reg)?reg.slice(-1):null);
    if(port){var mask=Number.isInteger(r.fields._MASK)?r.fields._MASK:255;var list=p.avrpin||[];list.filter(function(v){return v[0]===port&&(mask&(1<<Number(v[1])));}).forEach(function(v){var physical=pin(p,v);claim(r,physical,'PORT'+port,'gpio:'+physical);row.wires.push(v+' → '+label(p,physical));});}
    else if(s.rawRegister&&!/_read$/.test(r.type)){var timer=/^(?:TCCR|TIMSK|TIFR|TCNT|OCR|ICR|TIMER)([012])/.exec(reg);if(timer){var key='rawTimer'+timer[1];counts[key]=(counts[key]||0)+1;}else notes.push('Raw register '+reg+' requires a datasheet check; pin ownership cannot cover every register side effect.');}
   }
   if(s.bus){var bus=p.buses[s.bus];if(!bus){error(r,'no compatible '+s.bus+' bus.');return;}
    Object.keys(bus).forEach(function(role){row.wires.push(role+' → '+label(p,bus[role]));claim(r,bus[role],role,s.bus+':'+role);});
    // AVR SPI must keep hardware SS configured as output, even with another CS.
    if(s.bus==='SPI'&&p.spiSS&&!live.some(function(d){return specs[d.type]&&specs[d.type].bus==='SPI'&&pin(p,d.fields.CS)===p.spiSS;}))claim(r,p.spiSS,'hardware SS','SPI:SS');
    if(s.bus==='I2C'&&r.fields.ADDR){var a=Number(r.fields.ADDR);if(addresses[a])error(r,'I2C address '+r.fields.ADDR+' is already used by '+addresses[a]+'.');else addresses[a]=row.name;}
   }
  });
  if(live.some(function(r){return /^serial_|^text_print$|^st_memory_text_stream$|^st_file_stream$/.test(r.type);}))p.serial.forEach(function(v){claim({id:'serial',name:'Hardware Serial'},v,'UART','UART');});
  Object.keys(claims).forEach(function(v){var cs=claims[v];for(var i=0;i<cs.length;i++)for(var j=0;j<i;j++){
   if(cs[i].share&&cs[i].share===cs[j].share)continue;
   if((cs[i].observer&&cs[j].irq)||(cs[j].observer&&cs[i].irq))continue;
   if(cs[i].id===cs[j].id&&cs[i].role===cs[j].role)continue;
   error({id:cs[i].id,name:cs[i].name},label(p,v)+' is occupied by '+cs[j].name+' ('+cs[j].role+').');
  }});
  var limits={sd:1,servo:p.servo,buzzer:p.buzzer,ir:1,timer1:p.id==='avr328'?1:0};
  Object.keys(limits).forEach(function(k){if((counts[k]||0)>limits[k])error({id:'limits',name:p.name},'maximum '+limits[k]+' '+k+' device(s).');});
  if(counts.servo&&p.id!=='pico')timers[p.servoTimer]=['Servo'];
  if(p.id==='pico'){var pio=(counts.servo||0)+live.filter(function(r){return r.type==='device_neopixel';}).length;if(pio>8)error({id:'limits',name:'PIO'},'Servo and NeoPixel together need '+pio+' state machines; Pico has 8.');}
  function timerUse(timer,what){if(timers[timer]&&timers[timer].length)error({id:'timers',name:what},timer+' is already used by '+timers[timer].join(', ')+'.');else timers[timer]=[what];}
  if(counts.timer1)timerUse('Timer1','Timer1 interrupt');
  if(counts.buzzer)timerUse('Timer2','Music');
  if(counts.ir&&p.id==='avr328')timerUse('Timer2','IRremote');
  if(counts.ir&&p.id==='bluepill')timerUse('TIM4','IRremote');
  if(counts.tone&&p.id==='avr328')timerUse('Timer2','tone');
  if(counts.tone&&p.id==='bluepill')timerUse('TIM3','tone');
  ['0','1','2'].forEach(function(n){if(counts['rawTimer'+n])timerUse('Timer'+n,'Direct timer registers / ISR');});
  live.forEach(function(r){var s=specs[r.type];if(s&&s.resource==='pwm'){var t=(p.pwmTimer||{})[pin(p,r.fields.PIN)];if(timers[t]&&timers[t].length)error(r,'PWM timer '+t+' is used by '+timers[t].join(', ')+'.');}});
  return {errors:errors,claims:claims,counts:counts,timers:timers,rows:rows,notes:Array.from(new Set(notes))};
 }
 function choices(records,id,field,p){var r=records.filter(function(r){return r.id===id;})[0];if(!r||!specs[r.type])return [];var s=specs[r.type],kind=(s.pins||{})[field];if(!kind)return [];
  return (p[kind]||[]).filter(function(v){var copy=records.map(function(x){if(x.id!==id)return x;var f=Object.assign({},x.fields);f[field]=v;return Object.assign({},x,{fields:f});});
   var a=analyze(copy,p),physical=pin(p,v);return !a.errors.some(function(e){return e.id===id&&((e.message.indexOf(field+' needs')>=0)||(e.message.indexOf(label(p,v)+' is occupied')>=0)||e.message.indexOf('PWM timer')>=0);})&&!((a.claims[physical]||[]).some(function(c){return c.id!==id&&!(s.read&&c.irq)&&!(s.irq&&c.observer)&&!(s.gpio&&c.share==='gpio:'+physical)&&!(s.legacyServo&&c.share==='servo:'+physical);}));
  });
 }
 return {profile:profile,specs:specs,pin:pin,label:label,analyze:analyze,choices:choices};
});

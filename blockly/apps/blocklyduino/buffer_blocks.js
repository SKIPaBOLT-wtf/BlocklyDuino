/* SPDX-License-Identifier: Apache-2.0 */
(function(){'use strict';var B=Blockly,A=B.Arduino,D=B.DeviceRegistry;
 function define(type,kind,tip,extra){B.Blocks[type]={init:function(){this.setColour(195);this.appendDummyInput().appendField(D.field(kind),'DEVICE').appendField('send buffer');this.appendValueInput('BUFFER').setCheck('Array');
  if(type!=='device_pixels_buffer')this.appendDummyInput().appendField(new B.FieldDropdown([['rows × columns','YX'],['columns × rows','XY']]),'LAYOUT');
  if(extra)extra.call(this);this.setInputsInline(true);this.setPreviousStatement(true);this.setNextStatement(true);this.setTooltip(tip+' Drag in Variables → array (whole array). No copy is allocated. Prepare the array first, then send it once.');this.setHelpUrl('examples/buffer-guide.html');}};}
 define('device_lcd_buffer','LCD','Character grid: char[4][20] for a 20×4 LCD, rows × columns. With columns × rows use char[20][4]. Zero bytes display spaces; custom characters 1–7 are supported. No clear command is sent.');
 define('device_oled_buffer','OLED','Pixels: byte[height][width], zero off and nonzero on. Packed: byte[height/8][width], each byte stores 8 vertical pixels, least-significant bit at top. A full 128×64 image needs 8192 bytes as pixels or 1024 bytes packed. Partial tiles use 8 temporary bytes.',function(){this.appendDummyInput().appendField(new B.FieldDropdown([['packed 8 vertical pixels / byte','PACKED'],['one byte / pixel','BYTES']]),'FORMAT');});
 define('device_tft_buffer','TFT','RGB565 grid: uint16_t[height][width]. One SPI transaction sends the prepared pixels, clipping to display bounds. Array starts at the top-left.');
 define('device_pixels_buffer','pixels','Use uint32_t[count] with 0xRRGGBB colours, or byte[count][3] with R, G, B values. Copies colours into the strip library then calls show once. The library also needs 3 bytes per LED.');
 function data(b,kind){var c=D.resolve(b,kind),ref=b.getInputTargetBlock('BUFFER');if(!ref||ref.type!=='arduino_array_ref')throw Error('Connect a whole declared array to send buffer.');var def=B.ArrayRegistry.declaration(ref,null,true),shape=B.ArrayRegistry.shape(def.getFieldValue('SIZE')).map(Number),t=def.getFieldValue('TYPE'),xy=b.getFieldValue('LAYOUT')==='XY';
  if(kind==='pixels'){if(!((shape.length===1&&t==='uint32_t')||(shape.length===2&&shape[1]===3&&/^(byte|uint8_t)$/.test(t))))throw Error('NeoPixel buffer needs uint32_t[count] or byte[count][3] (RGB).');}
  else{if(shape.length!==2)throw Error('Display buffer must have two dimensions.');if(kind==='LCD'&&!/^(char|byte|uint8_t)$/.test(t))throw Error('LCD buffer needs char or byte elements.');if(kind==='OLED'&&!/^(bool|byte|uint8_t)$/.test(t))throw Error('OLED buffer needs bool or byte elements.');if(kind==='TFT'&&t!=='uint16_t')throw Error('RGB565 buffer needs uint16_t elements.');}
  A.definitions_.buffer_include='#include <BlocklyBuffers.h>';return{device:c,name:D.name(c),array:A.valueToCode(b,'BUFFER',A.ORDER_NONE),xy:xy?'true':'false'};
 }
 A.device_lcd_buffer=function(){var d=data(this,'LCD');return 'bxLcdBuffer('+d.name+', '+d.array+', '+d.xy+', '+d.device.getFieldValue('COLS')+', '+d.device.getFieldValue('ROWS')+');\n';};
 A.device_oled_buffer=function(){var d=data(this,'OLED');return 'bxOledBuffer('+d.name+', '+d.array+', '+d.xy+', '+(this.getFieldValue('FORMAT')==='PACKED'?'true':'false')+');\n';};
 A.device_tft_buffer=function(){var d=data(this,'TFT');return 'bxTftBuffer('+d.name+', '+d.array+', '+d.xy+');\n';};
 A.device_pixels_buffer=function(){var d=data(this,'pixels');return 'bxPixelsBuffer('+d.name+', '+d.array+');\n';};
 (window.BlocklyDeviceCatalog||[]).forEach(function(c){var type={LCD:'device_lcd_buffer',OLED:'device_oled_buffer',TFT:'device_tft_buffer',pixels:'device_pixels_buffer'}[c.kind];if(type){c.actions.unshift(type);if(c.groups)c.groups[0].actions.unshift(type);}});
})();

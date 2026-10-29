/* Stream a known SD text score to a named buzzer. Uses one shared SD file/cache. */
(function(){
'use strict';var A=Blockly.Arduino;
function player(b){
 var card=Blockly.StorageRegistry.resolve(b,'sd');
 var buzzer=Blockly.MusicRegistry.name(Blockly.MusicRegistry.resolve(b,'buzzer','BUZZER'));
 var declaration='BxSDMelody<decltype('+card+')> bxScore('+card+', '+buzzer+');';
 if(A.definitions_.sd_score_object&&A.definitions_.sd_score_object!==declaration)
   throw Error('Use one SD score player per program. Select the same card and buzzer in all score actions.');
 A.definitions_.sd_score_include='#include <BlocklySDMusic.h>';
 A.definitions_.sd_score_object=declaration;return 'bxScore';
}
function def(type,label,output,tip,extra){
 Blockly.Blocks[type]={init:function(){this.setColour(290);
 this.appendDummyInput().appendField(label)
 .appendField(Blockly.StorageRegistry.field('sd'),'DEVICE').appendField('to')
 .appendField(Blockly.MusicRegistry.field('buzzer'),'BUZZER');
 if(extra)extra.call(this);
 if(output)this.setOutput(true,'Boolean');else{this.setPreviousStatement(true);this.setNextStatement(true);}
 this.setTooltip(tip);this.setHelpUrl('examples/sd-music-guide.html');},onchange:Blockly.MusicRegistry.refresh({BUZZER:'buzzer'})};
}
def('sd_music_start','play score',false,'Open a known text file and start streaming notes to the chosen buzzer. Uses the card’s one open file. Call service score on each loop pass.',function(){this.appendValueInput('PATH').appendField('file');});
A.sd_music_start=function(){return player(this)+'.start('+ (A.valueToCode(this,'PATH',A.ORDER_NONE)||'"MELODY.TXT"')+');\n';};
def('sd_music_update','service score',false,'Call on every loop pass. Reads at most32 text characters per pass and starts the next note when the previous one ends. SD access can still pause briefly.');
A.sd_music_update=function(){return player(this)+'.update();\n';};
def('sd_music_stop','stop score',false,'Stop sound and close the score file.');
A.sd_music_stop=function(){return player(this)+'.stop();\n';};
def('sd_music_active','score playing',true,'True while the score is being read or its last note/rest is playing. False at completion or error.');
A.sd_music_active=function(){return [player(this)+'.active()',A.ORDER_ATOMIC];};
def('sd_music_ok','score OK',true,'False if the file is missing, a note/duration is invalid, or a read fails. EOF after a complete note is normal.');
A.sd_music_ok=function(){return [player(this)+'.ok',A.ORDER_ATOMIC];};
}());

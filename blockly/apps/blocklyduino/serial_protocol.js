/* BlocklyDuino Serial Plot protocol v1. No hardware access; shared by UI and tests. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SerialPlotProtocol=api;})(typeof window==='object'?window:this,function(){
'use strict';
var own=Function.call.bind(Object.prototype.hasOwnProperty);
var MAX_LINE=32768, MAX_FIELDS=32, MAX_WIDGETS=16, MAX_HISTORY=10000;
function fail(message){throw new Error(message);}
function plain(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function finite(value,name){if(typeof value!=='number'||!Number.isFinite(value))fail(name+' must be a finite number');return value;}
function text(value,fallback,max){if(value==null)return fallback;return String(value).slice(0,max||100);}
function id(value,name){if(typeof value!=='string'||! /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(value)||['__proto__','prototype','constructor'].indexOf(value)>=0)fail(name+' must start with a letter and use letters, digits, _ or - (max 48)');return value;}
function validate(input){
 if(!plain(input))fail('Configuration must be a JSON object');
 if(input.version!==1)fail('Configuration version must be 1');
 var output={version:1,id:id(input.id,'Profile ID'),title:text(input.title,input.id,100),history:input.history==null?500:input.history,fields:[],widgets:[]};
 if(!Number.isInteger(output.history)||output.history<10||output.history>MAX_HISTORY)fail('History must be 10–10000 samples');
 if(!Array.isArray(input.fields)||!input.fields.length||input.fields.length>MAX_FIELDS)fail('Use 1–32 fields');
 var map=Object.create(null);
 input.fields.forEach(function(f){
  if(!plain(f))fail('Each field must be an object');var key=id(f.id,'Field ID');if(own(map,key))fail('Duplicate field: '+key);
  var type=f.type||'number';if(['number','string','boolean'].indexOf(type)<0)fail('Field type must be number, string or boolean');
  var x={id:key,label:text(f.label,key,80),unit:text(f.unit,'',24),type:type,scale:f.scale==null?1:finite(f.scale,key+' scale'),offset:f.offset==null?0:finite(f.offset,key+' offset')};
  if(type!=='number'&&(x.scale!==1||x.offset!==0))fail('Only number fields can use scale or offset');
  if(f.min!=null)x.min=finite(f.min,key+' min');if(f.max!=null)x.max=finite(f.max,key+' max');
  if(x.min!=null&&x.max!=null&&x.min>=x.max)fail(key+': min must be less than max');
  map[key]=x;output.fields.push(x);
 });
 var widgets=input.widgets==null?[{type:'line',fields:output.fields.filter(function(f){return f.type==='number';}).map(function(f){return f.id;})}]:input.widgets;
 if(input.widgets==null&&!widgets[0].fields.length)widgets=[{type:'raw',fields:output.fields.map(function(f){return f.id;})}];
 if(!Array.isArray(widgets)||!widgets.length||widgets.length>MAX_WIDGETS)fail('Use 1–16 widgets');
 widgets.forEach(function(w){
  if(!plain(w)||['line','xy','gauge','bar','raw'].indexOf(w.type)<0)fail('Widget type must be line, xy, gauge, bar or raw');
  var item={type:w.type,title:text(w.title,'',100)};
  if(w.history!=null){if(!Number.isInteger(w.history)||w.history<10||w.history>output.history)fail('Instrument history must be 10 through dashboard history');item.history=w.history;}
  function field(key,numeric){if(!own(map,key))fail('Unknown widget field: '+key);if(numeric&&map[key].type!=='number')fail(key+' must be a number for '+w.type);return key;}
  if(w.type==='xy'){item.x=field(w.x,true);item.y=field(w.y,true);}
  else if(w.type==='gauge'||w.type==='bar'){item.field=field(w.field,true);if(map[item.field].min==null||map[item.field].max==null)fail('Gauge/bar field '+item.field+' needs min and max');}
  else {var fs=w.fields||output.fields.map(function(f){return f.id;});if(!Array.isArray(fs)||!fs.length||fs.length>MAX_FIELDS)fail('Widget needs a non-empty fields list');item.fields=fs.map(function(k){return field(k,w.type==='line');});}
  output.widgets.push(item);
 });
 return output;
}
function numberToken(s){if(typeof s==='number')return Number.isFinite(s)?s:null;if(typeof s!=='string'||! /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s.trim()))return null;var n=Number(s);return Number.isFinite(n)?n:null;}
function csvSplit(s){var row=[],val='',quote=false;for(var i=0;i<s.length;i++){var c=s[i];if(c==='"'){if(quote&&s[i+1]==='"'){val+='"';i++;}else if(quote||!val.trim())quote=!quote;else fail('Unexpected quote in CSV');}else if(c===','&&!quote){row.push(val.trim());val='';}else val+=c;}if(quote)fail('Unclosed CSV quote');row.push(val.trim());return row;}
function tokens(line){return line.indexOf(',')>=0?csvSplit(line):line.trim().split(/[\t ]+/);}
function slug(s,n){var value=s.replace(/[^A-Za-z0-9_-]/g,'_');if(!/^[A-Za-z]/.test(value))value='f_'+value;return value.slice(0,40)||'value'+n;}
function automatic(names){var seen=Object.create(null),fields=names.map(function(name,i){var key=slug(name,i+1);while(own(seen,key))key+='_';seen[key]=true;return{id:key,label:String(name).slice(0,80),type:'number'};});return validate({version:1,id:'automatic',title:'Automatic serial data',history:500,fields:fields,widgets:[{type:'line',fields:fields.map(function(f){return f.id;})}]});}
function Parser(options){options=options||{};this.mode=options.mode||'auto';this.profile=null;this.autoNames=null;this.getProfile=options.getProfile||function(){return null;};}
Parser.prototype.setProfile=function(profile){this.profile=validate(profile);this.autoNames=null;return this.profile;};
Parser.prototype.reset=function(){this.profile=null;this.autoNames=null;};
Parser.prototype.parse=function(line,ts){
 try{
  line=String(line).trim();if(!line)return{kind:'empty'};if(line.length>MAX_LINE)fail('Line exceeds 32768 characters');
  if(line.indexOf('@plot ')===0){if(this.mode==='manual')return{kind:'ignored',message:'Controller configuration ignored in Manual mode'};var p=validate(JSON.parse(line.slice(6)));this.profile=p;this.autoNames=null;return{kind:'config',profile:p,source:'controller'};}
  if(line.indexOf('@use ')===0){if(this.mode==='manual')return{kind:'ignored',message:'Controller profile request ignored in Manual mode'};var key=id(line.slice(5).trim(),'Profile ID'),saved=this.getProfile(key);if(!saved)fail('Profile '+key+' is not saved here. Load or save it first.');this.profile=validate(saved);this.autoNames=null;return{kind:'config',profile:this.profile,source:'saved'};}
  var values,stream=null,deviceTime=null,rawLine=line,generated=null;
  if(line.indexOf('@data ')===0){var data=JSON.parse(line.slice(6));if(Array.isArray(data)){values=data;}else if(plain(data)){stream=id(data.id,'Data stream ID');values=data.values;if(data.t!=null)deviceTime=finite(data.t,'Data time');}else fail('@data needs an array or {id,values} object');if(!this.profile)fail('Send @plot, @use or load a profile before @data');if(stream&&stream!==this.profile.id)return{kind:'ignored',message:'Other stream: '+stream};}
  else{
   var labelled=line.match(/(?:^|[,\t ]+)([A-Za-z][A-Za-z0-9_-]*):\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?=$|[,\t ]+)/gi);
   if(labelled&&labelled.length){
    var pairs=[],rest=line;labelled.forEach(function(x){var match=x.trim().match(/^([^:]+):\s*(.*)$/);pairs.push([match[1],numberToken(match[2])]);rest=rest.replace(x,'');});
    if(rest.replace(/[,\t ]/g,''))return{kind:'raw',text:rawLine};
    if(!this.profile){generated=automatic(pairs.map(function(p){return p[0];}));this.profile=generated;this.autoNames=pairs.map(function(p){return p[0];});}
    values=Object.create(null);pairs.forEach(function(pair){if(own(values,pair[0]))fail('Duplicate field '+pair[0]);values[pair[0]]=pair[1];});
   }else{
    var parts=tokens(line),allNumbers=parts.every(function(p){return numberToken(p)!==null;});
    if(!this.profile){
     if(allNumbers){generated=automatic(parts.map(function(_,i){return'value'+(i+1);}));this.profile=generated;}
     else if(parts.length>1&&parts.every(function(p){return /^[A-Za-z][A-Za-z0-9_ -]{0,47}$/.test(p);})&&(line.indexOf(',')>=0||line.indexOf('\t')>=0)){generated=automatic(parts);this.profile=generated;this.autoNames=parts;return{kind:'config',profile:generated,source:'header'};}
     else return{kind:'raw',text:rawLine};
    }
    if(!allNumbers&&this.profile.fields.every(function(f){return f.type==='number';}))return{kind:'raw',text:rawLine};values=parts;
   }
  }
  var profile=this.profile;if(!Array.isArray(values)&&!plain(values))fail('Data values must be an array or object');
  if(Array.isArray(values)&&values.length!==profile.fields.length)fail('Expected '+profile.fields.length+' values, received '+values.length);
  if(!Array.isArray(values)){var keys=Object.keys(values),expected=profile.fields.map(function(f){return f.id;});if(keys.length!==expected.length||keys.some(function(k){return expected.indexOf(k)<0;}))fail('Data keys must match profile fields: '+expected.join(', '));}
  var result=Object.create(null),original=Object.create(null);
  profile.fields.forEach(function(f,i){var v=Array.isArray(values)?values[i]:values[f.id];
   if(f.type==='number'){v=numberToken(v);if(v===null)fail(f.id+' needs a finite number');original[f.id]=v;v=v*f.scale+f.offset;if(!Number.isFinite(v))fail(f.id+' scale/offset overflow');}
   else if(f.type==='boolean'){if(v===true||v===1||v==='1'||v==='true')v=true;else if(v===false||v===0||v==='0'||v==='false')v=false;else fail(f.id+' needs true/false or 1/0');original[f.id]=v;}
   else{if(typeof v!=='string')fail(f.id+' needs a string');if(v.length>2048)fail(f.id+' text exceeds 2048 characters');original[f.id]=v;}
   result[f.id]=v;
  });
  return{kind:'sample',profile:profile,generated:generated,sample:{ts:ts==null?Date.now():ts,t:deviceTime,id:profile.id,values:result,raw:original}};
 }catch(e){return{kind:'error',message:e.message};}
};
function Lines(onLine,onError){this.buffer='';this.skip=false;this.sawCR=false;this.onLine=onLine;this.onError=onError||function(){};}
Lines.prototype.reset=function(){this.buffer='';this.skip=false;this.sawCR=false;};
Lines.prototype.push=function(chunk,ts){for(var i=0;i<chunk.length;i++){var c=chunk[i];if(c==='\n'&&this.sawCR){this.sawCR=false;continue;}this.sawCR=false;if(c==='\r'||c==='\n'){if(!this.skip)this.onLine(this.buffer,ts);this.buffer='';this.skip=false;this.sawCR=c==='\r';}else if(!this.skip){this.buffer+=c;if(this.buffer.length>MAX_LINE){this.buffer='';this.skip=true;this.onError('Oversized serial line discarded (32768 characters maximum)');}}}};
function csvCell(value){var s=value==null?'':String(value);if(/^[=+\-@]/.test(s)&&typeof value!=='number')s="'"+s;return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function csv(profile,samples){var heads=['received_iso','device_time','stream_id'];profile.fields.forEach(function(f){heads.push(f.id,f.id+'_raw');});var rows=[heads.map(csvCell).join(',')];samples.forEach(function(s){var row=[new Date(s.ts).toISOString(),s.t,s.id];profile.fields.forEach(function(f){row.push(s.values[f.id],s.raw[f.id]);});rows.push(row.map(csvCell).join(','));});return rows.join('\r\n')+'\r\n';}
return{validate:validate,Parser:Parser,Lines:Lines,csv:csv,csvCell:csvCell,numberToken:numberToken,limits:{line:MAX_LINE,fields:MAX_FIELDS,widgets:MAX_WIDGETS,history:MAX_HISTORY}};
});

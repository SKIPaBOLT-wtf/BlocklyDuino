/* BlocklyDuino Serial Plot protocol v1. No hardware access; shared by UI and tests. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SerialPlotProtocol=api;})(typeof window==='object'?window:this,function(){
'use strict';
var own=Function.call.bind(Object.prototype.hasOwnProperty);
var MAX_LINE=32768, MAX_FIELDS=32, MAX_WIDGETS=16, MAX_HISTORY=10000, MAX_WINDOW=1024, MAX_IMAGE_PIXELS=16777216;
function fail(message){throw new Error(message);}
function plain(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function finite(value,name){if(typeof value!=='number'||!Number.isFinite(value))fail(name+' must be a finite number');return value;}
function text(value,fallback,max){if(value==null)return fallback;return String(value).slice(0,max||100);}
function id(value,name){if(typeof value!=='string'||! /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(value)||['__proto__','prototype','constructor'].indexOf(value)>=0)fail(name+' must start with a letter and use letters, digits, _ or - (max 48)');return value;}
function inputFields(profile){return profile.fields.filter(function(f){return !f.derive;});}
/* A deliberately small expression grammar: never JavaScript, eval or dynamic code.
 * Bare names address earlier numeric fields. [field-id] also accepts hyphens.
 * Expressions are bounded to 512 characters, 128 tokens and 24 nesting levels. */
var mathFunctions={abs:[1,1,Math.abs],sqrt:[1,1,Math.sqrt],sin:[1,1,Math.sin],cos:[1,1,Math.cos],tan:[1,1,Math.tan],log:[1,1,Math.log],exp:[1,1,Math.exp],min:[2,8,Math.min],max:[2,8,Math.max],pow:[2,2,Math.pow],clamp:[3,3,function(v,lo,hi){return lo<=hi?Math.min(hi,Math.max(lo,v)):NaN;}]};
function formula(expression,fields){
 if(typeof expression!=='string'||!expression.trim()||expression.length>512)fail('Formula needs 1–512 characters');
 var tokens=[],at=0,depth=0;
 while(at<expression.length){
  var rest=expression.slice(at),match=rest.match(/^\s+/);if(match){at+=match[0].length;continue;}
  match=rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
  if(match){var number=Number(match[0]);if(!Number.isFinite(number))fail('Formula number must be finite');tokens.push({type:'number',value:number});at+=match[0].length;}
  else if((match=rest.match(/^\[([A-Za-z][A-Za-z0-9_-]{0,47})\]/))){tokens.push({type:'field',value:match[1]});at+=match[0].length;}
  else if((match=rest.match(/^[A-Za-z_][A-Za-z0-9_]*/))){tokens.push({type:'name',value:match[0]});at+=match[0].length;}
  else if(/^[+\-*/^(),]/.test(rest)){tokens.push({type:rest[0]});at++;}
  else fail('Formula has an unsupported character at '+(at+1));
  if(tokens.length>128)fail('Formula exceeds 128 tokens');
 }
 var pos=0;
 function peek(type){return tokens[pos]&&tokens[pos].type===type;}
 function take(type){if(peek(type)){pos++;return true;}return false;}
 function reference(name){if(!own(fields,name)||fields[name].type!=='number')fail('Formula references unknown or later numeric field: '+name);return{op:'field',name:name};}
 function primary(){
  if(++depth>24)fail('Formula nesting exceeds 24 levels');var token=tokens[pos++],node;
  if(!token)fail('Formula is incomplete');
  if(token.type==='number')node={op:'number',value:token.value};
  else if(token.type==='field')node=reference(token.value);
  else if(token.type==='name'){
   if(take('(')){var fn=mathFunctions[token.value];if(!own(mathFunctions,token.value))fail('Unknown formula function: '+token.value);var args=[];if(!peek(')')){do{args.push(add());if(args.length>8)fail('Formula function has too many arguments');}while(take(','));}if(!take(')'))fail('Formula function needs closing )');if(args.length<fn[0]||args.length>fn[1])fail(token.value+' has the wrong number of arguments');node={op:'call',name:token.value,args:args};}
   else node=token.value==='pi'&&!own(fields,'pi')?{op:'number',value:Math.PI}:reference(token.value);
  }else if(token.type==='('){node=add();if(!take(')'))fail('Formula needs closing )');}
  else fail('Formula expected a number, field or (');
  depth--;return node;
 }
 function power(){var node=primary();if(take('^'))node={op:'^',a:node,b:unary()};return node;}
 function unary(){if(take('+'))return unary();if(take('-'))return{op:'neg',a:unary()};return power();}
 function multiply(){var node=unary();while(peek('*')||peek('/')){var op=tokens[pos++].type;node={op:op,a:node,b:unary()};}return node;}
 function add(){var node=multiply();while(peek('+')||peek('-')){var op=tokens[pos++].type;node={op:op,a:node,b:multiply()};}return node;}
 var ast=add();if(pos!==tokens.length)fail('Formula has unexpected tokens');return ast;
}
function evaluate(node,values){
 if(node.op==='number')return node.value;if(node.op==='field')return values[node.name];
 if(node.op==='call'){var args=node.args.map(function(a){return evaluate(a,values);});if(args.some(function(n){return n==null;}))return null;var answer=mathFunctions[node.name][2].apply(null,args);return Number.isFinite(answer)?answer:null;}
 var a=evaluate(node.a,values);if(a==null)return null;if(node.op==='neg')return-a;var b=evaluate(node.b,values);if(b==null)return null;
 var value=node.op==='+'?a+b:node.op==='-'?a-b:node.op==='*'?a*b:node.op==='/'?a/b:Math.pow(a,b);return Number.isFinite(value)?value:null;
}
function derivation(d,fields){
 if(!plain(d))fail('Field derive must be an object');var op=d.op,output={op:op};
 if(op==='formula'){formula(d.expr,fields);output.expr=d.expr.trim();return output;}
 if(['mean','rms','min','max','sum','integral','derivative'].indexOf(op)<0)fail('Derived operation must be formula, mean, rms, min, max, sum, integral or derivative');
 var source=id(d.source,'Derived source');if(!own(fields,source)||fields[source].type!=='number')fail('Derived source must be an earlier numeric field: '+source);output.source=source;
 if(['mean','rms','min','max'].indexOf(op)>=0){if(!Number.isInteger(d.window)||d.window<1||d.window>MAX_WINDOW)fail('Derived window must be 1–1024 samples');output.window=d.window;}
 else if(d.window!=null)fail(op+' does not use a window');
 if(op==='integral'||op==='derivative'){output.time=d.time==null?'received':d.time;if(['received','device'].indexOf(output.time)<0)fail('Derived time must be received or device (milliseconds)');}
 else if(d.time!=null)fail(op+' does not use a time source');
 return output;
}
function bounds(source,target,minimum,maximum,label){if(source[minimum]!=null)target[minimum]=finite(source[minimum],label+' '+minimum);if(source[maximum]!=null)target[maximum]=finite(source[maximum],label+' '+maximum);if(target[minimum]!=null&&target[maximum]!=null&&target[minimum]>=target[maximum])fail(label+': '+minimum+' must be less than '+maximum);}
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
  if(f.derive!=null){if(type!=='number')fail('Only number fields can be derived');x.derive=derivation(f.derive,map);}
  map[key]=x;output.fields.push(x);
 });
 if(!inputFields(output).length)fail('At least one field must come from serial input');
 var widgets=input.widgets==null?[{type:'line',fields:output.fields.filter(function(f){return f.type==='number';}).map(function(f){return f.id;})}]:input.widgets;
 if(input.widgets==null&&!widgets[0].fields.length)widgets=[{type:'raw',fields:output.fields.map(function(f){return f.id;})}];
 if(!Array.isArray(widgets)||!widgets.length||widgets.length>MAX_WIDGETS)fail('Use 1–16 widgets');
 var imageIds=Object.create(null),imagePixels=0;
 widgets.forEach(function(w){
  if(!plain(w)||['line','xy','gauge','bar','raw','image'].indexOf(w.type)<0)fail('Widget type must be line, xy, gauge, bar, raw or image');
  var item={type:w.type,title:text(w.title,'',100)};
  if(w.history!=null){if(!Number.isInteger(w.history)||w.history<10||w.history>output.history)fail('Instrument history must be 10 through dashboard history');item.history=w.history;}
  function field(key,numeric){if(typeof key!=='string'||!own(map,key))fail('Unknown widget field: '+key);if(numeric&&map[key].type!=='number')fail(key+' must be a number for '+w.type);return key;}
  function list(fs,numeric){if(!Array.isArray(fs)||!fs.length||fs.length>MAX_FIELDS)fail('Widget needs 1–32 fields');var seen=Object.create(null);return fs.map(function(k){field(k,numeric);if(own(seen,k))fail('Duplicate widget field: '+k);seen[k]=true;return k;});}
  if(w.type==='image'){
   var c=w.image;if(!plain(c))fail('Image widget needs an image configuration');if(c.version!=null&&c.version!==1)fail('Image version must be 1');var imageId=id(c.id,'Image ID');if(own(imageIds,imageId))fail('Duplicate image ID: '+imageId);imageIds[imageId]=true;
   if(!Number.isInteger(c.width)||!Number.isInteger(c.height)||c.width<1||c.height<1||c.width>16384||c.height>16384)fail('Image dimensions must be 1–16384 pixels');
   imagePixels+=c.width*c.height;if(imagePixels>MAX_IMAGE_PIXELS)fail('Dashboard images exceed 16 megapixels (64 MiB RGBA)');
   var mode=c.mode==null?'gray':c.mode,maximum=c.max==null?255:finite(c.max,'Image maximum');if(['gray','rgb'].indexOf(mode)<0||maximum<=0)fail('Image mode must be gray or rgb and maximum must be positive');
   item.image={version:1,id:imageId,width:c.width,height:c.height,mode:mode,max:maximum};
  }else if(w.type==='xy'){
   var series=w.series==null?[{x:w.x,y:w.y}]:w.series;if(!Array.isArray(series)||!series.length||series.length>MAX_FIELDS)fail('XY needs 1–32 series');
   item.series=series.map(function(s){if(!plain(s))fail('XY series must be an object');return{x:field(s.x,true),y:field(s.y,true),label:text(s.label,map[s.y]&&map[s.y].label,80)};});
   if(item.series.length===1){item.x=item.series[0].x;item.y=item.series[0].y;}
   bounds(w,item,'xMin','xMax','XY');bounds(w,item,'yMin','yMax','XY');
  }else if(w.type==='gauge'||w.type==='bar'){
   item.fields=list(w.fields==null?[w.field]:w.fields,true);if(item.fields.length===1)item.field=item.fields[0];bounds(w,item,'min','max',w.type);
  }else {item.fields=list(w.fields==null?output.fields.map(function(f){return f.id;}):w.fields,w.type==='line');if(w.type==='line')bounds(w,item,'min','max','Line');}
  output.widgets.push(item);
 });
 return output;
}
function numberToken(s){if(typeof s==='number')return Number.isFinite(s)?s:null;if(typeof s!=='string'||! /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s.trim()))return null;var n=Number(s);return Number.isFinite(n)?n:null;}
function csvSplit(s){var row=[],val='',quote=false;for(var i=0;i<s.length;i++){var c=s[i];if(c==='"'){if(quote&&s[i+1]==='"'){val+='"';i++;}else if(quote||!val.trim())quote=!quote;else fail('Unexpected quote in CSV');}else if(c===','&&!quote){row.push(val.trim());val='';}else val+=c;}if(quote)fail('Unclosed CSV quote');row.push(val.trim());return row;}
function tokens(line){return line.indexOf(',')>=0?csvSplit(line):line.trim().split(/[\t ]+/);}
function slug(s,n){var value=s.replace(/[^A-Za-z0-9_-]/g,'_');if(!/^[A-Za-z]/.test(value))value='f_'+value;return value.slice(0,40)||'value'+n;}
function automatic(names){var seen=Object.create(null),fields=names.map(function(name,i){var key=slug(name,i+1);while(own(seen,key))key+='_';seen[key]=true;return{id:key,label:String(name).slice(0,80),type:'number'};});return validate({version:1,id:'automatic',title:'Automatic serial data',history:500,fields:fields,widgets:[{type:'line',fields:fields.map(function(f){return f.id;})}]});}
/* All calculated samples live on the host. A rolling statistic retains at most
 * 1024 values; integrals/derivatives retain only their preceding sample.
 * Input validation finishes before any of these states are advanced. */
function Calculator(profile){
 var fields=Object.create(null);this.states=[];
 profile.fields.forEach(function(f){if(f.derive){this.states.push({field:f,ast:f.derive.op==='formula'?formula(f.derive.expr,fields):null,buffer:[],cursor:0,previous:null,total:0});}fields[f.id]=f;},this);
}
Calculator.prototype.apply=function(values,original,received,device){
 this.states.forEach(function(s){
  var f=s.field,d=f.derive,v=d.op==='formula'?evaluate(s.ast,values):values[d.source],answer=null;
  if(v!=null){
   if(d.op==='formula')answer=v;
   else if(d.window){
    if(s.buffer.length<d.window)s.buffer.push(v);else{s.buffer[s.cursor]=v;s.cursor=(s.cursor+1)%d.window;}
    if(d.op==='mean')answer=s.buffer.reduce(function(a,b){return a+b/s.buffer.length;},0);
    else if(d.op==='min')answer=Math.min.apply(null,s.buffer);
    else if(d.op==='max')answer=Math.max.apply(null,s.buffer);
    else {var largest=s.buffer.reduce(function(a,b){return Math.max(a,Math.abs(b));},0);answer=largest?largest*Math.sqrt(s.buffer.reduce(function(a,b){return a+Math.pow(b/largest,2)/s.buffer.length;},0)):0;}
   }else if(d.op==='sum'){s.total=s.total==null?null:s.total+v;if(!Number.isFinite(s.total))s.total=null;answer=s.total;}
   else {
    var time=d.time==='device'?device:received;
    if(time!=null){
     if(s.previous&&time>s.previous.time){var seconds=(time-s.previous.time)/1000;if(d.op==='derivative')answer=(v-s.previous.value)/seconds;else{s.total=s.total==null?null:s.total+(s.previous.value/2+v/2)*seconds;if(!Number.isFinite(s.total))s.total=null;answer=s.total;}}
     else if(d.op==='integral')answer=s.total;
     // A duplicate/backwards timestamp starts a new segment, never negative time.
     s.previous={value:v,time:time};
    }else s.previous=null;
   }
  }else if(d.op==='integral'||d.op==='derivative')s.previous=null;
  if(answer!=null)answer=answer*f.scale+f.offset;
  values[f.id]=Number.isFinite(answer)?answer:null;original[f.id]=null;
 });
};
function Parser(options){options=options||{};this.mode=options.mode||'auto';this.profile=null;this.autoNames=null;this.calculator=null;this.getProfile=options.getProfile||function(){return null;};}
Parser.prototype.install=function(profile){var calculator=new Calculator(profile);this.profile=profile;this.calculator=calculator;this.autoNames=null;return profile;};
Parser.prototype.setProfile=function(profile){return this.install(validate(profile));};
Parser.prototype.reset=function(){this.profile=null;this.autoNames=null;this.calculator=null;};
Parser.prototype.parse=function(line,ts){
 try{
  line=String(line).trim();if(!line)return{kind:'empty'};if(line.length>MAX_LINE)fail('Line exceeds 32768 characters');
  if(line.indexOf('@plot ')===0){if(this.mode==='manual')return{kind:'ignored',message:'Controller configuration ignored in Manual mode'};var p=this.setProfile(JSON.parse(line.slice(6)));return{kind:'config',profile:p,source:'controller'};}
  if(line.indexOf('@use ')===0){if(this.mode==='manual')return{kind:'ignored',message:'Controller profile request ignored in Manual mode'};var key=id(line.slice(5).trim(),'Profile ID'),saved=this.getProfile(key);if(!saved)fail('Profile '+key+' is not saved here. Load or save it first.');this.setProfile(saved);return{kind:'config',profile:this.profile,source:'saved'};}
  var values,stream=null,deviceTime=null,rawLine=line,generated=null;
  if(line.indexOf('@data ')===0){var data=JSON.parse(line.slice(6));if(Array.isArray(data)){values=data;}else if(plain(data)){stream=id(data.id,'Data stream ID');values=data.values;if(data.t!=null)deviceTime=finite(data.t,'Data time');}else fail('@data needs an array or {id,values} object');if(!this.profile)fail('Send @plot, @use or load a profile before @data');if(stream&&stream!==this.profile.id)return{kind:'ignored',message:'Other stream: '+stream};}
  else{
   var labelled=line.match(/(?:^|[,\t ]+)([A-Za-z][A-Za-z0-9_-]*):\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?=$|[,\t ]+)/gi);
   if(labelled&&labelled.length){
    var pairs=[],rest=line;labelled.forEach(function(x){var match=x.trim().match(/^([^:]+):\s*(.*)$/);pairs.push([match[1],numberToken(match[2])]);rest=rest.replace(x,'');});
    if(rest.replace(/[,\t ]/g,''))return{kind:'raw',text:rawLine};
    if(!this.profile){generated=automatic(pairs.map(function(p){return p[0];}));this.install(generated);this.autoNames=pairs.map(function(p){return p[0];});}
    values=Object.create(null);pairs.forEach(function(pair){if(own(values,pair[0]))fail('Duplicate field '+pair[0]);values[pair[0]]=pair[1];});
   }else{
    var parts=tokens(line),allNumbers=parts.every(function(p){return numberToken(p)!==null;});
    if(!this.profile){
     if(allNumbers){generated=automatic(parts.map(function(_,i){return'value'+(i+1);}));this.install(generated);}
     else if(parts.length>1&&parts.every(function(p){return /^[A-Za-z][A-Za-z0-9_ -]{0,47}$/.test(p);})&&(line.indexOf(',')>=0||line.indexOf('\t')>=0)){generated=automatic(parts);this.install(generated);this.autoNames=parts;return{kind:'config',profile:generated,source:'header'};}
     else return{kind:'raw',text:rawLine};
    }
    if(!allNumbers&&this.profile.fields.every(function(f){return f.type==='number';}))return{kind:'raw',text:rawLine};values=parts;
   }
  }
  var profile=this.profile,inputs=inputFields(profile),received=ts==null?Date.now():finite(ts,'Received time');if(!Array.isArray(values)&&!plain(values))fail('Data values must be an array or object');
  if(Array.isArray(values)&&values.length!==inputs.length)fail('Expected '+inputs.length+' input values, received '+values.length);
  if(!Array.isArray(values)){var keys=Object.keys(values),expected=inputs.map(function(f){return f.id;});if(keys.length!==expected.length||keys.some(function(k){return expected.indexOf(k)<0;}))fail('Data keys must match input fields: '+expected.join(', '));}
  var result=Object.create(null),original=Object.create(null);
  inputs.forEach(function(f,i){var v=Array.isArray(values)?values[i]:values[f.id];
   if(f.type==='number'){v=numberToken(v);if(v===null)fail(f.id+' needs a finite number');original[f.id]=v;v=v*f.scale+f.offset;if(!Number.isFinite(v))fail(f.id+' scale/offset overflow');}
   else if(f.type==='boolean'){if(v===true||v===1||v==='1'||v==='true')v=true;else if(v===false||v===0||v==='0'||v==='false')v=false;else fail(f.id+' needs true/false or 1/0');original[f.id]=v;}
   else{if(typeof v!=='string')fail(f.id+' needs a string');if(v.length>2048)fail(f.id+' text exceeds 2048 characters');original[f.id]=v;}
   result[f.id]=v;
  });
  this.calculator.apply(result,original,received,deviceTime);
  return{kind:'sample',profile:profile,generated:generated,sample:{ts:received,t:deviceTime,id:profile.id,values:result,raw:original}};
 }catch(e){return{kind:'error',message:e.message};}
};
function Lines(onLine,onError){this.buffer='';this.skip=false;this.sawCR=false;this.onLine=onLine;this.onError=onError||function(){};}
Lines.prototype.reset=function(){this.buffer='';this.skip=false;this.sawCR=false;};
Lines.prototype.push=function(chunk,ts){for(var i=0;i<chunk.length;i++){var c=chunk[i];if(c==='\n'&&this.sawCR){this.sawCR=false;continue;}this.sawCR=false;if(c==='\r'||c==='\n'){if(!this.skip)this.onLine(this.buffer,ts);this.buffer='';this.skip=false;this.sawCR=c==='\r';}else if(!this.skip){this.buffer+=c;if(this.buffer.length>MAX_LINE){this.buffer='';this.skip=true;this.onError('Oversized serial line discarded (32768 characters maximum)');}}}};
function csvCell(value){var s=value==null?'':String(value);if(/^[=+\-@]/.test(s)&&typeof value!=='number')s="'"+s;return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function csv(profile,samples){var heads=['received_iso','device_time','stream_id'];profile.fields.forEach(function(f){heads.push(f.id,f.id+'_raw');});var rows=[heads.map(csvCell).join(',')];samples.forEach(function(s){var row=[new Date(s.ts).toISOString(),s.t,s.id];profile.fields.forEach(function(f){row.push(s.values[f.id],s.raw[f.id]);});rows.push(row.map(csvCell).join(','));});return rows.join('\r\n')+'\r\n';}
return{validate:validate,inputFields:inputFields,Parser:Parser,Lines:Lines,csv:csv,csvCell:csvCell,numberToken:numberToken,limits:{line:MAX_LINE,fields:MAX_FIELDS,widgets:MAX_WIDGETS,history:MAX_HISTORY,window:MAX_WINDOW,imagePixels:MAX_IMAGE_PIXELS}};
});

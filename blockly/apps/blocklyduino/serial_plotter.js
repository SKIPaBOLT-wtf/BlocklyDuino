/* SPDX-License-Identifier: Apache-2.0 */
(function(){'use strict';
var P=window.SerialPlotProtocol,$=function(id){return document.getElementById(id);};
var colors=['#1679aa','#dd6841','#23856d','#9a61b0','#c18c11','#447dc2','#aa536b','#477c54'];
var KEY='blocklyduino.plotter.profiles.v1',MODE='blocklyduino.plotter.mode.v1',AXIS='blocklyduino.plotter.axis.v1',CAP='blocklyduino.plotter.capture.v1',LAST='blocklyduino.plotter.last.v1';
var profiles=Object.create(null),profile=null,samples=[],total=0,ignored=0,errors=0,paused=false,dirty=true,lastRender=0;
var capture=null,captured=[],captureRecords=[],captureBytes=0,profileRevision=0,captureName='serial',demo=null,priorDemo=null,connected=false,diagnostic=[];
var widgetNodes=[],imageWidgets=[],inlineImagesActive=true,legacyImageKey='',acquisition='idle',startRetry=null,startAttempts=0,sendBusy=false,startGeneration=0,startAfterSequence=0,currentEventSequence=0;
function load(key,fallback){try{var v=localStorage.getItem(key);return v==null?fallback:JSON.parse(v);}catch(e){return fallback;}}
function store(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(e){notice('Browser storage is full. Export your profile to a file.','error');return false;}}
function node(tag,text,cls){var n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
function notice(message,kind){$('notice').textContent=message;$('notice').className=kind||'';}
function log(message){diagnostic.push(new Date().toLocaleTimeString()+' '+message);if(diagnostic.length>35)diagnostic.shift();$('diagnostics').textContent=diagnostic.join('\n');$('diagnostic-count').textContent=' ('+errors+' errors, '+ignored+' ignored)';}
var saved=load(KEY,{});if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
Object.keys(saved).slice(0,100).forEach(function(k){try{var p=P.validate(saved[k]);profiles[p.id]=p;}catch(e){}});
$('mode').value=load(MODE,'auto');if(!$('mode').value)$('mode').value='auto';$('time-axis').value=load(AXIS,'received');$('capture-limit').value=load(CAP,1000);
var parser=new P.Parser({mode:$('mode').value,getProfile:function(id){return profiles[id];}});
function refreshProfiles(){var old=$('profiles').value;$('profiles').replaceChildren(new Option('Choose a saved dashboard…',''));Object.keys(profiles).sort().forEach(function(k){$('profiles').add(new Option(profiles[k].title+' · '+k,k));});$('profiles').value=old;}
refreshProfiles();
function stopCapture(reason){if(!capture)return;capture=null;$('capture-start').disabled=false;$('capture-stop').disabled=true;$('capture-count').textContent=captured.length+' samples · stopped';if(reason)notice(reason);}
function updateCaptureButtons(){$('save-csv').disabled=!captured.length;$('save-jsonl').disabled=!captured.length;}
function captureRecord(record,isSample){
 if(!capture)return;
 var size=JSON.stringify(record).length*2;
 if(captureBytes+size>20*1024*1024){stopCapture('Capture reached the 20 MiB memory limit. Save it before starting another.');return;}
 captureRecords.push(record);captureBytes+=size;
 if(isSample){captured.push(record);$('capture-count').textContent=captured.length+' / '+capture.limit+' samples';updateCaptureButtons();if(captured.length>=capture.limit)stopCapture('Capture complete: '+captured.length+' samples.');}
}
function captureConfiguration(){
 if(!inlineImagesActive&&window.PlotterImage&&PlotterImage.model.config)captureRecord({kind:'image-configuration',revision:profileRevision,ts:Date.now(),id:PlotterImage.model.config.id,image:PlotterImage.model.config},false);
 else if(profile)captureRecord({kind:'configuration',revision:profileRevision,ts:Date.now(),profile:profile},false);
}
function apply(next,source,parsed){
 var p=P.validate(next),fromImage=!inlineImagesActive;if(!parsed)parser.setProfile(p);inlineImagesActive=true;
 if(profile&&JSON.stringify(profile)===JSON.stringify(p)&&!fromImage)return;
 if(window.PlotterImage)PlotterImage.show(false);
 profile=p;profileRevision++;samples=[];total=0;dirty=true;buildWidgets();captureConfiguration();
 $('dashboard-title').textContent=p.title;$('dashboard-meta').textContent=p.id+' · '+p.fields.length+' fields · '+p.history+' history samples · '+source;
 $('profiles').value=Object.prototype.hasOwnProperty.call(profiles,p.id)?p.id:'';
 notice('Dashboard ready: '+p.title+'. Send one complete sample per line.');
}
function streamControls(){
 $('stream-start').disabled=!connected||sendBusy||acquisition==='waiting';$('stream-stop').disabled=!connected||sendBusy;
 $('stream-status').textContent=!connected?'Connect, then Start':acquisition==='waiting'?'Waiting for the controller header…':acquisition==='running'?'Receiving · controller started':acquisition==='stopped'?'Stopped · connection stays open':'Ready · Start sends START';
}
function cancelStart(){clearTimeout(startRetry);startRetry=null;startGeneration++;}
function headerReceived(){if(acquisition==='waiting'&&(!currentEventSequence||currentEventSequence>startAfterSequence)){cancelStart();acquisition='running';streamControls();}}
async function sendStart(generation){
 if(generation!==startGeneration||acquisition!=='waiting'||!connected)return;
 startAttempts++;sendBusy=true;streamControls();
 try{var reply=await client.write('START','lf');if(generation===startGeneration&&reply&&Number.isSafeInteger(reply.seq))startAfterSequence=Math.max(startAfterSequence,reply.seq);}
 catch(e){if(generation===startGeneration){cancelStart();acquisition='idle';notice(e.message,'error');}return;}
 finally{sendBusy=false;streamControls();}
 if(generation!==startGeneration||acquisition!=='waiting')return;
 // Port opening resets many AVR boards. Three bounded attempts cover their bootloader.
 startRetry=setTimeout(function(){
  if(generation!==startGeneration||acquisition!=='waiting')return;
  if(startAttempts<3)sendStart(generation);
  else{acquisition='idle';startRetry=null;streamControls();notice('No dashboard header received. Check the sketch and baud rate, then press Start again. Existing serial data still reaches Monitor.','error');}
 },1800);
}
$('stream-start').onclick=async function(){
 if(!connected){notice('Connect a serial port in Settings first.','error');return;}
 if(demo)stopDemo();cancelStart();lines.reset();startAfterSequence=Math.max(Number(client.state.seq)||0,Number(client.cursor)||0);startAttempts=0;acquisition='waiting';
 $('mode').value='auto';parser.mode='auto';store(MODE,'auto');
 notice('START sent. Waiting for the sketch to announce its dashboard…');
 return sendStart(startGeneration);
};
$('stream-stop').onclick=async function(){
 cancelStart();acquisition='stopped';sendBusy=true;streamControls();
 try{await client.write('STOP','lf');notice('STOP sent. The serial connection and Monitor remain available.');}catch(e){notice(e.message,'error');}
 finally{sendBusy=false;streamControls();}
};
function reportError(message,line){errors++;log(message+(line?' | '+line.slice(0,140):''));notice(message,'error');}
function data(line,ts){
 if(window.PlotterImage){
  var pixel=inlineImagesActive?PlotterImage.route(line,imageWidgets):null;
  if(pixel){if(pixel.kind==='error')reportError(pixel.message,line);else{dirty=true;captureRecord(Object.assign({revision:profileRevision,ts:ts==null?Date.now():ts},pixel),true);}return;}
  if(PlotterImage.live(line)){
   var event=PlotterImage.result();
   if(event.kind==='error')reportError(event.message,line);
   else if(event.kind==='image-configuration'){
    var key=JSON.stringify(event.image),changed=inlineImagesActive||legacyImageKey!==key;
    inlineImagesActive=false;legacyImageKey=key;
    if(changed){profileRevision++;captureConfiguration();}headerReceived();
   }else captureRecord(Object.assign({revision:profileRevision,ts:ts==null?Date.now():ts},event),true);
   return;
  }
 }
 var result=parser.parse(line,ts);
 if(result.kind==='config'){apply(result.profile,result.source,true);headerReceived();return;}
 if(result.kind==='sample'){
  if(result.generated)apply(result.generated,'automatic',true);
  var sample=result.sample;samples.push(sample);total++;if(samples.length>profile.history)samples.splice(0,samples.length-profile.history);dirty=true;
  captureRecord(Object.assign({kind:'sample',revision:profileRevision},sample),true);
 }else if(result.kind==='error')reportError(result.message,line);
 else if(result.kind==='raw'||result.kind==='ignored'){ignored++;if(ignored<5||ignored%100===0)log(result.message||('Text: '+result.text.slice(0,140)));}
}
var lines=new P.Lines(data,function(message){reportError(message);});
var client=new window.SerialClient({
 onReset:function(){lines.reset();},
 onGap:function(count){lines.reset();log('Serial history gap: '+count+' events lost; partial sample discarded.');notice('Some serial data was lost before this view received it.','error');},
 onEvents:function(events){if(demo)return;events.forEach(function(e){currentEventSequence=e.seq||0;if(e.direction==='rx')lines.push(e.text,e.ts);else if(e.direction==='system'){lines.reset();log(e.text);}});},
 onStatus:function(state){if(connected&&!state.connected){lines.reset();cancelStart();acquisition='idle';}connected=!!state.connected;streamControls();},
 onError:function(message){if(message)notice(message,'error');}
});
window.SerialClient.mountControls($('serial-connection'),client);client.start({replay:true});streamControls();
function field(id){return profile.fields.find(function(f){return f.id===id;});}
function series(w){return w.series||[{x:w.x,y:w.y}];}
function names(w){if(w.type==='image')return[];if(w.type==='xy'){var keys=[];series(w).forEach(function(s){if(keys.indexOf(s.x)<0)keys.push(s.x);if(keys.indexOf(s.y)<0)keys.push(s.y);});return keys;}return w.fields||(w.field?[w.field]:[]);}
function title(w){return w.title||(w.type==='image'?w.image.id:names(w).map(function(k){return field(k).label;}).join(' / '));}
function legend(ref,entries){var element=node('div',null,'legend');entries.forEach(function(entry,i){var item=node('span',entry);item.style.setProperty('--series',colors[i%colors.length]);element.appendChild(item);});ref.card.appendChild(element);}
function buildWidgets(){
 var previousImages=imageWidgets.slice();widgetNodes=[];imageWidgets=[];$('dashboard').replaceChildren();
 profile.widgets.forEach(function(w){
  var card=node('section',null,'widget widget-'+w.type);card.dataset.type=w.type;card.appendChild(node('h3',title(w)));var ref={card:card,w:w};
  if(w.type==='line'||w.type==='xy'||w.type==='gauge'){ref.canvas=node('canvas');ref.canvas.setAttribute('role','img');ref.canvas.setAttribute('aria-label',title(w)+' '+w.type);card.appendChild(ref.canvas);}
  if(w.type==='line'||w.type==='xy'||w.type==='gauge')legend(ref,w.type==='xy'?series(w).map(function(s){return s.label||field(s.y).label+' vs '+field(s.x).label;}):names(w).map(function(k){var f=field(k);return f.label+(f.unit?' ('+f.unit+')':'');}));
  if(w.type==='gauge'||w.type==='bar'){
   ref.values=Object.create(null);var group=node('div',null,w.type==='bar'?'bar-group':'gauge-values');
   names(w).forEach(function(k,i){var f=field(k),entry=node('div',null,'instrument-reading'),label=node('div',f.label,'reading-label'),value=node('div','—','value'),sub=node('div','Waiting for a sample','subvalue'),limits=node('div',null,'range'),low=node('span'),high=node('span');limits.append(low,high);entry.style.setProperty('--series',colors[i%colors.length]);entry.append(label,value);
    var fill=null;if(w.type==='bar'){var track=node('div',null,'bar-track');fill=node('div',null,'bar-fill');fill.style.height='0%';track.appendChild(fill);entry.appendChild(track);}entry.append(sub,limits);group.appendChild(entry);ref.values[k]={value:value,sub:sub,fill:fill,low:low,high:high};
   });card.appendChild(group);
  }
  if(w.type==='raw'){
   ref.table=node('table',null,'raw-table');var head=node('tr');['Field','Value','Raw'].forEach(function(t){head.appendChild(node('th',t));});ref.table.appendChild(head);ref.rows=Object.create(null);
   w.fields.forEach(function(k){var row=node('tr'),v=node('td','—'),r=node('td','—');row.append(node('td',field(k).label),v,r);ref.table.appendChild(row);ref.rows[k]=[v,r];});card.appendChild(ref.table);
  }
  if(w.type==='image'&&window.PlotterImage){ref.image=previousImages.find(function(image){return JSON.stringify(image.model.config)===JSON.stringify(w.image);})||PlotterImage.widget(w.image);imageWidgets.push(ref.image);card.append(ref.image.frame,ref.image.tools,ref.image.status);}
  $('dashboard').appendChild(card);widgetNodes.push(ref);
 });
}
function fmt(n){if(n==null)return'—';if(typeof n!=='number')return String(n);if(n===0)return'0';return Math.abs(n)>=1e6||Math.abs(n)<.001?n.toExponential(2):String(Number(n.toPrecision(6)));}
function range(values,min,max){
 var a=min,b=max,valid=values.filter(Number.isFinite);
 if(a==null){a=valid.length?Infinity:0;valid.forEach(function(v){if(v<a)a=v;});}
 if(b==null){b=valid.length?-Infinity:1;valid.forEach(function(v){if(v>b)b=v;});}
 if(a>=b){if(min!=null&&max==null)b=a+(Math.abs(a)*.05||1);else if(max!=null&&min==null)a=b-(Math.abs(b)*.05||1);else{a-=Math.abs(a)*.05||1;b+=Math.abs(b)*.05||1;}}
 if(min==null&&max==null){var pad=(b-a)*.05;a-=pad;b+=pad;}return[a,b];
}
function bounds(keys,minimum,maximum,visible){var values=[],lo=minimum,hi=maximum;visible.forEach(function(s){keys.forEach(function(k){values.push(s.values[k]);});});if(lo==null){var mins=keys.map(function(k){return field(k).min;});if(mins.every(Number.isFinite))lo=Math.min.apply(Math,mins);}if(hi==null){var maxs=keys.map(function(k){return field(k).max;});if(maxs.every(Number.isFinite))hi=Math.max.apply(Math,maxs);}return range(values,lo,hi);}
function ctx(canvas){var box=canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2),w=Math.max(160,box.width),h=Math.max(160,box.height||250);canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);var c=canvas.getContext('2d');c.scale(ratio,ratio);c.clearRect(0,0,w,h);return{c:c,w:w,h:h};}
function chart(ref){
 var visible=samples.slice(-(ref.w.history||profile.history)),draw=ctx(ref.canvas),c=draw.c,w=draw.w,h=draw.h,left=57,right=w-16,top=17,bottom=h-36,isXY=ref.w.type==='xy';
 var traces=isXY?series(ref.w):ref.w.fields.map(function(k){return{y:k};}),yKeys=traces.map(function(s){return s.y;}),yr=bounds(yKeys,isXY?ref.w.yMin:ref.w.min,isXY?ref.w.yMax:ref.w.max,visible);
 var timeX=visible.map(function(s,i){return $('time-axis').value==='device'?(s.t==null?NaN:s.t):$('time-axis').value==='index'?total-visible.length+i:(s.ts-(visible[0]?visible[0].ts:0))/1000;});
 var xr=isXY?bounds(traces.map(function(s){return s.x;}),ref.w.xMin,ref.w.xMax,visible):range(timeX),validX=timeX.filter(Number.isFinite);
 c.font='11px system-ui';c.lineWidth=1;c.strokeStyle='#dce7ed';c.fillStyle='#567184';
 for(var i=0;i<=4;i++){var y=top+(bottom-top)*i/4;c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();c.textAlign='right';c.fillText(fmt(yr[1]-(yr[1]-yr[0])*i/4),left-7,y+4);}
 c.textAlign='left';c.fillText(fmt(xr[0]),left,bottom+19);c.textAlign='right';c.fillText(fmt(xr[1]),right,bottom+19);c.textAlign='center';
 var xLabel=isXY?traces.map(function(s){var f=field(s.x);return f.label+(f.unit?' ('+f.unit+')':'');}).filter(function(x,i,a){return a.indexOf(x)===i;}).join(' / '):$('time-axis').value==='received'?'Elapsed seconds':$('time-axis').value==='device'?'Device time (t)':'Sample index';
 c.fillText(xLabel,(left+right)/2,h-2);
 c.save();c.beginPath();c.rect(left,top,right-left,bottom-top);c.clip();
 traces.forEach(function(trace,ki){
  c.strokeStyle=colors[ki%colors.length];c.fillStyle=colors[ki%colors.length];c.lineWidth=1.7;c.beginPath();var started=false,step=Math.max(1,Math.floor(visible.length/Math.max(1,(right-left)*2)));
  function point(index){return[isXY?visible[index].values[trace.x]:timeX[index],visible[index].values[trace.y]];}
  function pixel(pair){return[left+(pair[0]-xr[0])/(xr[1]-xr[0])*(right-left),bottom-(pair[1]-yr[0])/(yr[1]-yr[0])*(bottom-top)];}
  for(var j=0;j<visible.length;j+=step){var pair=point(j);if(!pair.every(Number.isFinite)){started=false;continue;}var xy=pixel(pair);if(!started){c.moveTo(xy[0],xy[1]);started=true;}else c.lineTo(xy[0],xy[1]);}c.stroke();
  if(visible.length){var last=point(visible.length-1);if(last.every(Number.isFinite)){var at=pixel(last);c.beginPath();c.arc(at[0],at[1],3,0,Math.PI*2);c.fill();}}
 });c.restore();
 if($('time-axis').value==='device'&&!isXY&&!validX.length){c.fillStyle='#7c5f19';c.textAlign='center';c.fillText('Send @data with numeric t, or choose Received time.',w/2,h/2);}
 ref.canvas.setAttribute('aria-label',title(ref.w)+', '+traces.length+' traces, '+visible.length+' history samples');
}
function gauge(ref,last){
 var draw=ctx(ref.canvas),c=draw.c,w=draw.w,h=draw.h,cx=w/2,cy=Math.max(100,h-28),r=Math.min(w*.39,h-55),keys=names(ref.w),limits=bounds(keys,ref.w.min,ref.w.max,samples);
 c.lineWidth=16;c.lineCap='round';c.strokeStyle='#e1ebf1';c.beginPath();c.arc(cx,cy,r,Math.PI,2*Math.PI);c.stroke();
 c.font='12px system-ui';c.fillStyle='#567184';c.textAlign='left';c.fillText(fmt(limits[0]),cx-r,cy+23);c.textAlign='right';c.fillText(fmt(limits[1]),cx+r,cy+23);
 keys.forEach(function(k,i){var v=last?last.values[k]:null;if(!Number.isFinite(v))return;var p=Math.max(0,Math.min(1,(v-limits[0])/(limits[1]-limits[0]))),angle=Math.PI+p*Math.PI;c.lineWidth=3;c.strokeStyle=colors[i%colors.length];c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(angle)*(r-15),cy+Math.sin(angle)*(r-15));c.stroke();});
 c.fillStyle='#254a60';c.beginPath();c.arc(cx,cy,6,0,Math.PI*2);c.fill();ref.canvas.setAttribute('aria-label',title(ref.w)+': '+keys.map(function(k){return field(k).label+' '+(last?fmt(last.values[k]):'no data');}).join(', '));
}
function readings(ref,last){var limits=bounds(names(ref.w),ref.w.min,ref.w.max,samples);names(ref.w).forEach(function(k){var f=field(k),v=last?last.values[k]:null,item=ref.values[k];item.value.replaceChildren(node('span',fmt(v)),node('span',f.unit,'unit'));item.sub.textContent=last?(f.derive?'Calculated':'Raw: '+fmt(last.raw[k]))+(Number.isFinite(v)&&(v<limits[0]||v>limits[1])?' · outside range':''):'Waiting for a sample';item.low.textContent=fmt(limits[0]);item.high.textContent=fmt(limits[1]);if(item.fill)item.fill.style.height=Number.isFinite(v)?Math.max(0,Math.min(100,(v-limits[0])/(limits[1]-limits[0])*100))+'%':'0%';});}
function render(now){
 requestAnimationFrame(render);if(!profile||paused||!dirty||now-lastRender<100)return;lastRender=now;dirty=false;var last=samples[samples.length-1];
 widgetNodes.forEach(function(ref){var w=ref.w;if(w.type==='line'||w.type==='xy')chart(ref);else if(w.type==='gauge'||w.type==='bar'){if(w.type==='gauge')gauge(ref,last);readings(ref,last);}else if(w.type==='raw')w.fields.forEach(function(k){ref.rows[k][0].textContent=last?fmt(last.values[k])+(field(k).unit?' '+field(k).unit:''):'—';ref.rows[k][1].textContent=last?fmt(last.raw[k]):'—';});else if(ref.image)ref.image.draw();});
 $('sample-stats').textContent=total+' samples · '+samples.length+' in history'+(demo?' · DEMO':'');
}
requestAnimationFrame(render);window.addEventListener('resize',function(){dirty=true;});
$('pause').onclick=function(){paused=!paused;if(window.PlotterImage)PlotterImage.pause(paused);this.textContent=paused?'Resume view':'Pause view';this.classList.toggle('paused-label',paused);if(paused)notice('View paused. Serial reception, capture and Serial Monitor continue.');else{dirty=true;notice('Live view resumed.');}};
$('clear').onclick=function(){samples=[];total=0;dirty=true;notice('Chart history cleared. Captured samples and scan images are kept.');};
function manual(){cancelStart();if(acquisition==='waiting')acquisition='idle';$('mode').value='manual';parser.mode='manual';store(MODE,'manual');streamControls();}
$('mode').onchange=function(){parser.mode=this.value;store(MODE,this.value);if(this.value==='manual')manual();notice(this.value==='manual'?'Manual mode: controller @plot and @use headers are ignored.':'Auto mode: the next @plot or @use header can change this dashboard.');};
$('time-axis').onchange=function(){store(AXIS,this.value);dirty=true;};
$('profiles').onchange=function(){if(profiles[this.value]){apply(profiles[this.value],'saved profile');manual();store(LAST,profile.id);}};
function download(name,body,type){var a=node('a');a.href=URL.createObjectURL(new Blob([body],{type:type}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);}
$('save-profile').onclick=function(){if(!profile){openConfig();return;}if(Object.keys(profiles).length>=100&&!profiles[profile.id]){notice('100 saved profiles maximum. Export or reuse an existing ID.','error');return;}profiles[profile.id]=profile;if(store(KEY,profiles)){refreshProfiles();$('profiles').value=profile.id;store(LAST,profile.id);notice('Saved '+profile.id+'. The controller can now send @use '+profile.id);}};
$('export-profile').onclick=function(){if(!profile){notice('Create or receive a dashboard first.','error');return;}download(profile.id+'.plot.json',JSON.stringify(profile,null,2)+'\n','application/json');};
function codeFor(header,values,baud){
 return '// Plotter Start sends START\\n; Stop sends STOP\\n.\n// No String allocation, blocking waits or extra hardware timers.\nbool streaming = false;\nchar command[8];\nbyte used = 0;\nbool commandOverflow = false;\nunsigned long lastSample = 0;\n\nvoid setup() {\n  Serial.begin('+baud+');\n}\n\nvoid loop() {\n  while (Serial.available()) {\n    char c = Serial.read();\n    if (c == \'\\r\') continue;\n    if (c == \'\\n\') {\n      command[used] = 0;\n      if (!commandOverflow && strcmp(command, "START") == 0) {\n        Serial.println(F('+JSON.stringify(header)+'));\n        streaming = true;\n        lastSample = millis();\n      } else if (!commandOverflow && strcmp(command, "STOP") == 0) {\n        streaming = false;\n      }\n      used = 0;\n      commandOverflow = false;\n    } else if (used < sizeof(command) - 1) command[used++] = c;\n    else commandOverflow = true;\n  }\n  if (streaming && millis() - lastSample >= 100) {\n    lastSample = millis();\n    // Replace these input values with sensor readings.\n    Serial.println(F('+JSON.stringify('@data '+JSON.stringify({id:profile.id,values:values}))+'));\n  }\n}\n';
}
$('show-header').onclick=function(){if(!profile){notice('Configure or receive a dashboard first.','error');return;}var header='@plot '+JSON.stringify(profile),baud=client.state.baud||9600,values=(P.inputFields?P.inputFields(profile):profile.fields).map(function(f){return f.type==='string'?'sample':f.type==='boolean'?false:0;});$('header-text').value=header;$('use-header').textContent='Saved profile shortcut: @use '+profile.id+' (save this profile in the Plotter first)';$('arduino-code').value=codeFor(header,values,baud);$('header-dialog').showModal();};
$('header-close').onclick=function(){$('header-dialog').close();};
function copyText(id){var text=$(id).value;if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(function(){notice('Copied to clipboard.');}).catch(function(){$(id).select();notice('Select the text and copy it with Ctrl+C.');});else{$(id).select();notice('Select the text and copy it with Ctrl+C.');}}
$('copy-header').onclick=function(){copyText('header-text');};$('copy-code').onclick=function(){copyText('arduino-code');};$('download-header').onclick=function(){download(profile.id+'-header.txt',$('header-text').value+'\n','text/plain');};
$('import-profile').onclick=function(){$('profile-file').click();};
$('profile-file').onchange=function(){var file=this.files[0];if(!file)return;if(file.size>131072){notice('Profile file is too large (128 KiB maximum).','error');this.value='';return;}file.text().then(function(t){apply(P.validate(JSON.parse(t)),'imported file');manual();}).catch(function(e){notice(e.message,'error');});this.value='';};
$('capture-start').onclick=function(){
 if(!profile&&!(window.PlotterImage&&PlotterImage.model.config)){notice('Configure or receive a dashboard before capture.','error');return;}var limit=Number($('capture-limit').value);
 if(!Number.isInteger(limit)||limit<1||limit>100000){notice('Capture limit must be an integer from 1 to 100000.','error');return;}
 if(captured.length&&!confirm('Start a new capture and replace the previous unsaved capture?'))return;
 captured=[];captureRecords=[];captureBytes=0;captureName=!inlineImagesActive?PlotterImage.model.config.id:profile.id;capture={limit:limit};captureConfiguration();store(CAP,limit);
 $('capture-start').disabled=true;$('capture-stop').disabled=false;$('capture-count').textContent='0 / '+limit+' samples';updateCaptureButtons();notice('Capturing the next '+limit+' samples or pixel updates. Configuration changes stay in the same capture.');
};
$('capture-stop').onclick=function(){stopCapture('Capture stopped.');};
function captureCSV(){
 var rows=[['kind','config_revision','received_iso','device_time','stream_id','field_id','value','raw','configuration_or_pixel'].map(P.csvCell).join(',')];
 captureRecords.forEach(function(record){var base=[record.kind,record.revision,new Date(record.ts).toISOString(),record.t,record.id||(record.profile&&record.profile.id)];
  if(record.kind==='sample')Object.keys(record.values).forEach(function(k){rows.push(base.concat([k,record.values[k],record.raw[k],'']).map(P.csvCell).join(','));});
  else rows.push(base.concat(['','','',JSON.stringify(record.profile||record.image||record.values)]).map(P.csvCell).join(','));
 });return rows.join('\r\n')+'\r\n';
}
$('save-csv').onclick=function(){download(captureName+'-capture.csv',captureCSV(),'text/csv;charset=utf-8');};
$('save-jsonl').onclick=function(){download(captureName+'-capture.jsonl',captureRecords.map(function(r){return JSON.stringify(r);}).join('\n')+'\n','application/x-ndjson');};
function input(value,type){var e=node('input');e.type=type||'text';e.value=value==null?'':value;if(type==='number')e.step='any';return e;}
function select(values,current){var e=node('select');values.forEach(function(v){e.add(new Option(v[1]||v[0],v[0]));});e.value=current;return e;}
function fieldRow(f){
 var row=node('tr'),controls={id:input(f.id),label:input(f.label),unit:input(f.unit),type:select([['number'],['string'],['boolean']],f.type||'number'),min:input(f.min,'number'),max:input(f.max,'number'),scale:input(f.scale==null?1:f.scale,'number'),offset:input(f.offset==null?0:f.offset,'number')};
 [['id'],['label','unit'],['type'],['min','max'],['scale','offset']].forEach(function(keys){var td=node('td');keys.forEach(function(k){controls[k].setAttribute('aria-label','Field '+k);controls[k].placeholder=k;td.appendChild(controls[k]);});row.appendChild(td);});
 var td=node('td'),remove=node('button','Remove');remove.type='button';remove.onclick=function(){row.remove();};td.appendChild(remove);if(f.derive){td.appendChild(node('span','Calculated · edit in Advanced JSON','hint'));controls.type.disabled=true;}row.appendChild(td);row._controls=controls;row._source=f;$('config-fields').appendChild(row);
}
function widgetRow(w){
 var row=node('div',null,'widget-editor'),type=select([['line','Line chart'],['xy','XY graph'],['gauge','Analog gauge'],['bar','Grouped bars'],['raw','Raw / values'],['image','Scan image']],w.type||'line'),titleInput=input(w.title);
 var ids=w.type==='xy'?series(w).map(function(s){return s.x+','+s.y;}).join(';'):w.type==='image'?w.image.id:names(w).join(','),fields=input(ids),points=input(w.history,'number'),remove=node('button','Remove'),hint=node('span','Fields: IDs separated by commas. XY traces: x,y; x2,y2. Image settings: Advanced JSON.','hint');
 type.setAttribute('aria-label','Instrument type');titleInput.placeholder='Title (optional)';titleInput.setAttribute('aria-label','Instrument title');fields.placeholder='Field IDs';fields.setAttribute('aria-label','Instrument fields');points.placeholder='History';points.min=10;points.step=1;points.setAttribute('aria-label','Instrument history');points.title='Optional history for line or XY chart; blank uses dashboard history';
 remove.type='button';remove.onclick=function(){row.remove();};row.append(type,titleInput,fields,points,remove,hint);row._controls={type:type,title:titleInput,fields:fields,history:points};row._source=w;$('config-widgets').appendChild(row);
}
function defaultProfile(){return {version:1,id:'my-dashboard',title:'My dashboard',history:500,fields:[{id:'value',label:'Value',type:'number',min:0,max:1023}],widgets:[{type:'line',fields:['value']},{type:'gauge',field:'value'}]};}
function openConfig(){var p=profile||defaultProfile();$('config-id').value=p.id;$('config-title').value=p.title;$('config-history').value=p.history;$('config-fields').replaceChildren();$('config-widgets').replaceChildren();p.fields.forEach(fieldRow);p.widgets.forEach(widgetRow);$('config-error').textContent='';$('configuration').showModal();}
$('configure').onclick=openConfig;$('config-close').onclick=function(){$('configuration').close();};$('field-add').onclick=function(){fieldRow({id:'value'+($('config-fields').children.length+1),type:'number'});};$('widget-add').onclick=function(){widgetRow({type:'line',fields:[]});};
$('configuration-form').onsubmit=function(e){
 e.preventDefault();try{
  var fields=Array.prototype.map.call($('config-fields').children,function(row){var c=row._controls,f=Object.assign({},row._source,{id:c.id.value.trim(),label:c.label.value.trim(),unit:c.unit.value.trim(),type:c.type.value});['min','max','scale','offset'].forEach(function(k){delete f[k];if(c[k].value.trim())f[k]=Number(c[k].value);});return f;});
  var widgets=Array.prototype.map.call($('config-widgets').children,function(row){var c=row._controls,w=Object.assign({},row._source,{type:c.type.value,title:c.title.value}),fs=c.fields.value.split(',').map(function(x){return x.trim();}).filter(Boolean);delete w.history;if(c.history.value.trim())w.history=Number(c.history.value);
   delete w.field;delete w.fields;delete w.x;delete w.y;delete w.series;
   if(w.type==='xy'){w.series=c.fields.value.split(';').map(function(pair,i){var keys=pair.split(',').map(function(s){return s.trim();});if(keys.length!==2||!keys[0]||!keys[1])throw Error('Each XY trace needs x,y. Separate traces with a semicolon.');var old=row._source.type==='xy'?series(row._source)[i]:null;return{x:keys[0],y:keys[1],label:old&&old.label};});}
   else if(w.type!=='image')w.fields=fs;
   else if(!w.image)throw Error('Add an image widget in Advanced JSON to set its width, height and pixel range.');
   return w;
  });
  apply({version:1,id:$('config-id').value.trim(),title:$('config-title').value,history:Number($('config-history').value),fields:fields,widgets:widgets},'manual configuration');manual();$('configuration').close();
 }catch(error){$('config-error').textContent=error.message;}
};
$('configure-json').onclick=function(){$('config-json').value=JSON.stringify(profile||defaultProfile(),null,2);$('json-error').textContent='';$('json-configuration').showModal();};
$('json-close').onclick=function(){$('json-configuration').close();};
$('json-format').onclick=function(){try{$('config-json').value=JSON.stringify(JSON.parse($('config-json').value),null,2);$('json-error').textContent='';}catch(e){$('json-error').textContent=e.message;}};
$('json-apply').onclick=function(){try{apply(JSON.parse($('config-json').value),'advanced configuration');manual();$('json-configuration').close();}catch(e){$('json-error').textContent=e.message;}};
function stopDemo(){
 if(!demo)return;clearInterval(demo);demo=null;$('demo').textContent='Try demo';lines.reset();
 if(priorDemo)apply(priorDemo,'restored after demo');else{parser.reset();profile=null;samples=[];widgetNodes=[];imageWidgets=[];$('dashboard').replaceChildren(node('div','Demo stopped. Waiting for new data.','empty'));$('dashboard-title').textContent='Waiting for serial data';$('dashboard-meta').textContent='Send a configuration or select a saved profile.';}
 $('sample-stats').textContent='0 samples';notice('Demo stopped. Live serial data will be used again.');
}
$('demo').onclick=function(){
 if(demo){stopDemo();return;}priorDemo=profile;
 var widgets=[{type:'line',fields:['distance','signal'],title:'Two traces on one chart'},{type:'gauge',fields:['distance','signal'],min:0,max:200,title:'Two needles'},{type:'bar',fields:['distance','signal'],title:'Readings side by side'},{type:'xy',series:[{x:'angle',y:'distance',label:'Distance'},{x:'angle',y:'signal',label:'Signal'}],title:'Two XY traces'},{type:'raw',fields:['angle','distance','signal']}];
 if(window.PlotterImage)widgets.push({type:'image',title:'Scan alongside readings',image:{id:'demo-image',width:32,height:20,mode:'gray',max:1023}});
 apply({version:1,id:'demo-sensors',title:'Demo · sensor dashboard',history:300,fields:[{id:'angle',label:'Angle',unit:'°',min:0,max:180},{id:'distance',label:'Distance',unit:'cm',min:0,max:200},{id:'signal',label:'Signal',unit:'%',min:0,max:100}],widgets:widgets},'simulated data');
 var phase=0,pixel=0;demo=setInterval(function(){phase+=.08;data('@data '+JSON.stringify({id:'demo-sensors',t:Math.round(phase*1000),values:{angle:90+80*Math.sin(phase/2),distance:95+65*Math.sin(phase),signal:50+40*Math.cos(phase*.7)}}),Date.now());if(imageWidgets.length){for(var i=0;i<32;i++){var x=pixel%32,y=Math.floor(pixel/32);data('@pixel demo-image '+x+','+y+','+Math.round(511.5*(1+Math.sin(x/5+phase)*Math.cos(y/4))),Date.now());pixel=(pixel+1)%640;}}},100);
 this.textContent='Stop demo';notice('DEMO — simulated samples. Live serial reception in Monitor continues; this Plotter temporarily ignores it.','demo');
};
var lastProfile=load(LAST,'');if(profiles[lastProfile]&&parser.mode==='manual')apply(profiles[lastProfile],'last saved dashboard');
window.addEventListener('beforeunload',function(e){if(capture){e.preventDefault();e.returnValue='A capture is still running.';}});
window.addEventListener('pagehide',function(){cancelStart();client.stop();if(demo)clearInterval(demo);});
})();

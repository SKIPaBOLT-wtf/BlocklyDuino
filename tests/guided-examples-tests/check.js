/* Behaviour checks: generated command reader, real headers and LCD API. */
const {spawnSync}=require('node:child_process');
const {fs,path,assert,win,B,out,load,generate,newBlock}=require('../project-device-tests/harness');
const P=require('../../blockly/apps/blocklyduino/serial_protocol');
const dir=path.resolve('.test-build/guided-examples-tests');fs.mkdirSync(dir,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(out,'examples/catalog.json'),'utf8'));
const files=fs.readdirSync(path.join(out,'examples')).filter(f=>f.endsWith('.xml')).sort();
assert.deepStrictEqual(catalog.examples.map(e=>e.file).sort(),files,'Every example is catalogued');
const covered=new Set(catalog.examples.flatMap(e=>e.hardware.map(d=>d.id)));
win.BlocklyDeviceCatalog.forEach(d=>assert(covered.has(d.type),'Hardware coverage: '+d.type));
assert(catalog.examples.filter(e=>/^\d/.test(e.file)).every(e=>e.verification.ok===true),'Numbered examples carry explicit target compile results');
const plotFiles=catalog.examples.filter(e=>e.plotterModes.length);
for(const e of plotFiles){
 const xml=fs.readFileSync(path.join(out,'examples',e.file),'utf8'),ws=load(xml),code=generate(ws);
 assert(code.includes('void readPlotterCommand()'),'Reusable command parser '+e.file);
 assert(code.includes('if (streaming)'),'Start gates sampling '+e.file);
 assert(!code.includes('delay('),'Nonblocking schedule '+e.file);
 assert(!/^\s*String\s+[A-Za-z_]\w*\s*[=;]/m.test(code),'No heap-allocated command String '+e.file);
 const dom=B.Xml.textToDom(xml);
 for(const node of dom.querySelectorAll('field[name="TEXT"]'))if(node.textContent.startsWith('@plot '))P.validate(JSON.parse(node.textContent.slice(6)));
 assert(!Array.from(dom.querySelectorAll('block')).some(n=>/^serial_(plot_header|image)/.test(n.getAttribute('type'))),'Ordinary Serial messages '+e.file);
 ws.dispose();
}
// Buffer mode migration and variable glyph inputs must survive XML loading.
const lcdXml=fs.readFileSync(path.join(out,'examples/72-lcd-custom-glyph-buffer.xml'),'utf8');
let ws=load(lcdXml),code=generate(ws);
assert(code.includes('bxLcdCreateGlyph(bddev_display, 0, faceRows)'));
assert(code.includes('bxLcdBuffer(bddev_display, frame, false, 20, 4, false)'));
const glyph=ws.getAllBlocks().find(b=>b.type==='device_lcd_show_glyph');
glyph.getInputTargetBlock('SLOT').dispose();let value=newBlock(ws,'variables_get',{VAR:'position'});glyph.getInput('SLOT').connection.connect(value.outputConnection);
assert(generate(ws).includes('bxLcdShowGlyph(bddev_display, position,'));
const rows=ws.getAllBlocks().find(b=>b.type==='arduino_array_declare'&&b.getFieldValue('VAR')==='faceRows');rows.setFieldValue('7','SIZE');assert.throws(()=>generate(ws),/byte\[8\]/);ws.dispose();
ws=load(fs.readFileSync(path.join(out,'examples/64-lcd-array-buffer.xml'),'utf8'));assert(generate(ws).includes('20, 4, true)'),'Legacy zero-space mode preserved');ws.dispose();

// Execute the generated full-line parser as C++, not a parallel JS imitation.
ws=load(fs.readFileSync(path.join(out,'examples/56-serial-dashboard.xml'),'utf8'));code=generate(ws);ws.dispose();
const stub=`#include <cstdint>
#include <string>
#include <deque>
#include <sstream>
#include <cassert>
#include <iostream>
using byte=uint8_t;
#define F(x) x
#define A0 14
uint32_t fakeMillis=0;
uint32_t millis(){return fakeMillis;}
int analogRead(int){return 512;}
struct SerialMock{std::deque<unsigned char> rx;std::ostringstream tx;void begin(unsigned long){} int available(){return rx.size();}int read(){int c=rx.front();rx.pop_front();return c;}template<class T>void print(T v){tx<<v;}void print(unsigned char v){tx<<unsigned(v);}template<class T>void println(T v){print(v);tx<<'\\n';}void push(const std::string&s){for(char c:s)rx.push_back(c);}} Serial;
`;
const main=`
int main(){setup();fakeMillis=100;loop();assert(Serial.tx.str().empty());
Serial.push("STA");loop();fakeMillis=2000;loop();assert(!streaming&&Serial.tx.str().empty());
Serial.push("RTX\\n");loop();assert(!streaming&&Serial.tx.str().empty());
Serial.push(std::string(80,'x')+"\\n");loop();assert(!streaming&&commandLength==0&&!commandOverflow);
Serial.push("START\\r\\n");loop();assert(streaming&&Serial.tx.str().find("@plot ")==0);
auto before=Serial.tx.str();fakeMillis+=49;loop();assert(Serial.tx.str()==before);fakeMillis++;loop();assert(Serial.tx.str().find("\\\"values\\\":[512]")!=std::string::npos);
Serial.push("STOP\\n");loop();before=Serial.tx.str();fakeMillis+=1000;loop();assert(!streaming&&Serial.tx.str()==before);
Serial.push("START\\nSTOP\\n");loop();assert(!streaming&&Serial.tx.str().size()>before.size());
fakeMillis=0xffffffd0UL;Serial.push("START\\n");loop();before=Serial.tx.str();fakeMillis=20;loop();assert(Serial.tx.str().size()>before.size());
std::cout<<"PASS generated START/STOP: partial/invalid/overflow/CRLF/restart/timing/millis wrap\\n";}
`;
const source=path.join(dir,'commands.cpp'),binary=path.join(dir,'commands');fs.writeFileSync(source,stub+code+main);
for(const [command,args] of [['g++',['-std=c++11',source,'-o',binary]],[binary,[]]]){const r=spawnSync(command,args,{encoding:'utf8'});assert.strictEqual(r.status,0,r.stdout+r.stderr);if(r.stdout)process.stdout.write(r.stdout);}
const bufferBinary=path.join(dir,'buffers');
for(const [command,args] of [['g++',['-std=c++11','-Itests/buffer-tests/stubs','-Iarduino/libraries/BlocklyBuffers/src','tests/buffer-tests/test.cpp','-o',bufferBinary]],[bufferBinary,[]]]){const r=spawnSync(command,args,{encoding:'utf8'});assert.strictEqual(r.status,0,r.stdout+r.stderr);if(r.stdout)process.stdout.write(r.stdout);}
async function ui(){win.fetch=async()=>({ok:true,json:async()=>catalog});win.eval(fs.readFileSync(path.join(out,'examples_catalog.js'),'utf8'));const select=win.document.createElement('select');await win.BlocklyExamples.populate(select);assert.strictEqual(select.querySelectorAll('option').length,files.length+1);assert(select.querySelectorAll('optgroup').length>=8);assert(select.querySelector('option[value="72-lcd-custom-glyph-buffer.xml"]'));console.log('PASS catalogue coverage/grouping, all Plotter headers and LCD glyph generation');}
ui().catch(e=>{console.error(e);process.exitCode=1;});

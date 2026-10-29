const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
process.chdir(require('node:path').resolve(__dirname,'..'));
const tests=[
  "tests/project-device-tests/check.js",
  "tests/variables-validation/integration.js",
  "tests/workspace-zoom-tests/test.js",
  "tests/workspace-regions-tests/check.js",
  "tests/workspace-regions-tests/gestures.js",
  "tests/editor-actions-tests/check.js",
  "tests/editor-actions-tests/gestures.js",
  "tests/plotter-tests/protocol.test.js",
  "tests/plotter-tests/ui.test.js",
  "tests/serial-backend-tests/test_frontend.js",
  "tests/timer-interrupt-tests/check.js",
  "tests/interrupt-tests/check.js",
  "tests/interrupt-example-tests/check.js",
  "tests/interrupt-example-tests/attach-check.js"
];
for(const file of tests){fs.mkdirSync('.test-build/'+file.split('/')[1],{recursive:true});console.log('\n'+file);const r=spawnSync(process.execPath,[file],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}

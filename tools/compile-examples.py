#!/usr/bin/env python3
"""Compile generated numbered examples; never connects to or uploads a board."""
import argparse, json, os, subprocess
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--cli',default='arduino-cli')
p.add_argument('--fqbn',default='arduino:avr:pro:cpu=16MHzatmega328')
p.add_argument('--examples',nargs='*',help='Optional example filename prefixes')
a=p.parse_args(); root=Path(__file__).resolve().parents[1]; os.chdir(root)
subprocess.run(['node','tests/variables-validation/integration.js'],check=True,env={**os.environ,'GENERATE_SKETCHES':'1'})
results=[]
for sketch in sorted((root/'.test-build/sketches').iterdir()):
 if a.examples and not any(sketch.name.startswith(x) for x in a.examples): continue
 cmd=[a.cli,'compile','--fqbn',a.fqbn,'--libraries',str(root/'arduino/libraries'),str(sketch)]
 r=subprocess.run(cmd,capture_output=True,text=True,timeout=180)
 (sketch/'build.log').write_text(r.stdout+r.stderr)
 result={'example':sketch.name,'ok':r.returncode==0}
 results.append(result); print(('PASS ' if result['ok'] else 'FAIL ')+sketch.name,flush=True)
 if not result['ok']: print((r.stdout+r.stderr)[-3000:])
(root/'.test-build/compile-results.json').write_text(json.dumps({'fqbn':a.fqbn,'results':results},indent=2))
if not results: raise SystemExit('No matching examples')
raise SystemExit(0 if all(x['ok'] for x in results) else 1)

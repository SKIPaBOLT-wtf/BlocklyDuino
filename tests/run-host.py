#!/usr/bin/env python3
"""Host simulations, without physical I/O; requires g++ and Pillow."""
from pathlib import Path
import os, subprocess, sys
root=Path(__file__).resolve().parents[1];os.chdir(root)
Path('.test-build/images').mkdir(parents=True,exist_ok=True)
def run(*args): subprocess.run(list(args),check=True)
def compile_run(name,source,*flags):
    binary='.test-build/'+name
    run('g++','-std=c++17','-O2','-Wall','-Wextra',source,'-o',binary,*flags)
    run('./'+binary)
compile_run('music','tests/music-tests/test_music.cpp','-DF_CPU=16000000UL','-D__AVR_ATmega168__','-Itests/music-tests/stubs','-Iarduino/libraries/BlocklyMusic/src')
compile_run('sd-music','tests/sd-music-tests/test.cpp','-Itests/sd-music-tests/stubs','-Iarduino/libraries/BlocklySDMusic/src')
compile_run('image-tests','tests/storage-tests/host/image.cpp','-Itests/storage-tests/host','-Iarduino/libraries/BlocklyStorage/src')
run(sys.executable,'tests/storage-tests/host/check_image.py')
run('node','tests/timer-interrupt-tests/check.js')
for freq in (8000000,16000000):
    compile_run('timer-'+str(freq),'.test-build/timer-interrupt-tests/runtime.cpp','-DF_CPU='+str(freq)+'UL')

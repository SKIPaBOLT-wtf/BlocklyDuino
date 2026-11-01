#ifndef FAKE_ARDUINO_H
#define FAKE_ARDUINO_H
#include <stdint.h>
#include <string>
using String=std::string;
#define NUM_DIGITAL_PINS 20
#define NOT_A_PIN 0
#define OUTPUT 1
#define LOW 0
#define _BV(x) (1<<(x))
#define WGM21 1
#define CS21 1
#define OCF2A 1
#define OCIE2A 1
extern volatile uint8_t TCCR2A,TCCR2B,TCNT2,OCR2A,TIFR2,TIMSK2;
extern volatile uint8_t testPorts[4];
inline uint8_t digitalPinToPort(uint8_t p){return p<20?p/8+1:0;}
inline uint8_t digitalPinToBitMask(uint8_t p){return 1<<(p%8);}
inline volatile uint8_t*portOutputRegister(uint8_t p){return &testPorts[p];}
inline void pinMode(uint8_t,uint8_t){}
inline void digitalWrite(uint8_t p,uint8_t v){if(v)testPorts[digitalPinToPort(p)]|=digitalPinToBitMask(p);else testPorts[digitalPinToPort(p)]&=~digitalPinToBitMask(p);}
#endif

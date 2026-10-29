#include "BlocklyMusic.h"
#include <avr/interrupt.h>
#include <util/atomic.h>
#if !defined(__AVR_ATmega168__) && !defined(__AVR_ATmega168P__) && !defined(__AVR_ATmega328P__) && !defined(__AVR_ATmega328__)
#error "BlocklyMusic currently supports ATmega168/328P (Pro Mini, Nano, Uno)."
#endif
#if F_CPU % 125000UL != 0 || F_CPU < 8000000UL || F_CPU > 24000000UL
#error "BlocklyMusic supports 8..24 MHz clocks divisible by 125 kHz."
#endif

namespace {
const uint8_t CHANNELS=3;
const uint32_t SAMPLE_RATE=15625UL;
volatile uint16_t increments[CHANNELS]={0,0,0};
uint16_t phases[CHANNELS]={0,0,0};
volatile uint16_t remaining[CHANNELS]={0,0,0};
volatile uint8_t *ports[CHANNELS]={0,0,0};
uint8_t masks[CHANNELS]={0,0,0};
BlocklyBuzzer *owners[CHANNELS]={0,0,0};
uint8_t count=0;
uint16_t microRemainder=0;

template<uint8_t v> __attribute__((always_inline)) inline void tickVoice() {
  uint16_t inc=increments[v];
  if (!inc) return;
  uint16_t before=phases[v];
  uint16_t after=before+inc;
  phases[v]=after;
  if ((before^after)&0x8000) *ports[v]^=masks[v];
}
template<uint8_t v> __attribute__((always_inline)) inline void expireVoice() {
  if(remaining[v] && --remaining[v]==0) {
    increments[v]=0;
    *ports[v]&=uint8_t(~masks[v]);
  }
}
void timerStart() {
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    TCCR2A=_BV(WGM21); TCCR2B=0; TCNT2=0;
    OCR2A=F_CPU/8UL/SAMPLE_RATE-1;
    TIFR2=_BV(OCF2A); TIMSK2=0; TCCR2B=_BV(CS21);
  }
}
}

// One sample every 64 microseconds. No floating point, allocation or Arduino calls.
ISR(TIMER2_COMPA_vect) {
  tickVoice<0>(); tickVoice<1>(); tickVoice<2>();
  microRemainder+=64;
  if(microRemainder>=1000) {
    microRemainder-=1000;
    expireVoice<0>(); expireVoice<1>(); expireVoice<2>();
    if(!(remaining[0]|remaining[1]|remaining[2])) TIMSK2&=uint8_t(~_BV(OCIE2A));
  }
}
BlocklyBuzzer::BlocklyBuzzer(uint8_t pin):pin_(pin),channel_(255),score_(0),count_(0),index_(0),repeat_(false) {}
bool BlocklyBuzzer::begin() {
  if(channel_<CHANNELS) return true;
  if(count>=CHANNELS || pin_>=NUM_DIGITAL_PINS || digitalPinToPort(pin_)==NOT_A_PIN) return false;
  volatile uint8_t *p=portOutputRegister(digitalPinToPort(pin_));
  uint8_t m=digitalPinToBitMask(pin_);
  for(uint8_t v=0;v<count;++v) if(ports[v]==p && masks[v]==m) return false;
  pinMode(pin_,OUTPUT); digitalWrite(pin_,LOW);
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    channel_=count++; ports[channel_]=p; masks[channel_]=m; owners[channel_]=this;
  }
  if(count==1) timerStart();
  return true;
}
void BlocklyBuzzer::startNote(uint16_t hz,uint32_t durationMs) {
  if(channel_>=CHANNELS && !begin()) return;
  if(hz && hz<20) hz=20;
  if(hz>4000) hz=4000;
  uint16_t inc=durationMs ? ((uint32_t(hz)*65536UL+SAMPLE_RATE/2)/SAMPLE_RATE) : 0;
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    increments[channel_]=0; phases[channel_]=0;
    *ports[channel_]&=uint8_t(~masks[channel_]);
    remaining[channel_]=durationMs>65535UL ? 65535 : durationMs; increments[channel_]=inc;
    if(durationMs && !(TIMSK2&_BV(OCIE2A))) { TIFR2=_BV(OCF2A); TIMSK2|=_BV(OCIE2A); }
    if(!(remaining[0]|remaining[1]|remaining[2])) TIMSK2&=uint8_t(~_BV(OCIE2A));
  }
}
void BlocklyBuzzer::note(uint16_t hz,uint32_t durationMs) { score_=0; startNote(hz,durationMs); }
void BlocklyBuzzer::stop() { score_=0; startNote(0,0); }
bool BlocklyBuzzer::sounding() const {
  if(channel_>=CHANNELS) return false;
  bool active;
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) { active=remaining[channel_]!=0; }
  return active;
}
void BlocklyBuzzer::play(const BlocklyMusicNote *score,uint16_t count,bool repeat) {
  stop();
  if(!score || !count) return;
  score_=score; count_=count; index_=0; repeat_=repeat; update();
}
void BlocklyBuzzer::update() {
  if(!score_ || sounding()) return;
  if(index_>=count_) {
    if(!repeat_) {score_=0;return;}
    index_=0;
  }
  uint16_t hz=pgm_read_word(&score_[index_].frequency);
  uint16_t duration=pgm_read_word(&score_[index_].duration);
  ++index_;
  // A malformed zero-duration score advances at most one item per call.
  startNote(hz,duration);
}
bool BlocklyBuzzer::busy() { update(); return score_ || sounding(); }
void BlocklyBuzzer::updateAll() { for(uint8_t v=0;v<count;++v) owners[v]->update(); }

uint16_t BlocklyBuzzer::midiFrequency(uint8_t midi) {
  static const uint16_t table[128] PROGMEM = {
    8,9,9,10,10,11,12,12,13,14,15,15,16,17,18,19,
    21,22,23,24,26,28,29,31,33,35,37,39,41,44,46,49,
    52,55,58,62,65,69,73,78,82,87,92,98,104,110,117,123,
    131,139,147,156,165,175,185,196,208,220,233,247,262,277,294,311,
    330,349,370,392,415,440,466,494,523,554,587,622,659,698,740,784,
    831,880,932,988,1047,1109,1175,1245,1319,1397,1480,1568,1661,1760,1865,1976,
    2093,2217,2349,2489,2637,2794,2960,3136,3322,3520,3729,3951,4186,4435,4699,4978,
    5274,5588,5920,6272,6645,7040,7459,7902,8372,8870,9397,9956,10548,11175,11840,12544
  };
  return midi<128 ? pgm_read_word(&table[midi]) : 0;
}

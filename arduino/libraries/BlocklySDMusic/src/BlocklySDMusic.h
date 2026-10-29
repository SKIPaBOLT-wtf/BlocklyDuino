#pragma once
#include <BlocklySD.h>
#include <BlocklyMusic.h>

// Text records: C4 250, D#4 500, R 100. At most 32 characters parsed per update.
// Owns the card's one open file until stop/EOF; no String or whole-score buffer.
template<class Card> class BxSDMelody {
  Card &card;
  BlocklyBuzzer &buzzer;
  char token[5];
  uint16_t duration,frequency;
  uint8_t length,digits,stage;
  bool running,comment,eof;
  bool noteToken(){
    token[length]=0;
    if(length==1&&(token[0]=='R'||token[0]=='r')){frequency=0;return true;}
    if(length<2||length>3)return false;
    char letter=token[0];if(letter>='a'&&letter<='g')letter-=32;
    int8_t semi;
    switch(letter){case 'C':semi=0;break;case 'D':semi=2;break;case 'E':semi=4;break;case 'F':semi=5;break;case 'G':semi=7;break;case 'A':semi=9;break;case 'B':semi=11;break;default:return false;}
    uint8_t at=1;
    if(token[at]=='#'){++semi;++at;}else if(token[at]=='b'){--semi;++at;}
    if(at!=length-1||token[at]<'0'||token[at]>'8')return false;
    int16_t midi=(token[at]-'0'+1)*12+semi;
    if(midi<0||midi>127)return false;
    frequency=BlocklyBuzzer::midiFrequency(uint8_t(midi));
    return frequency>=20&&frequency<=4000;
  }
  void fail(){stop();ok=false;}
  void startNote(){buzzer.note(frequency,duration);stage=length=digits=0;duration=0;}
 public:
  bool ok;
  BxSDMelody(Card &storage,BlocklyBuzzer &output):card(storage),buzzer(output),duration(0),frequency(0),length(0),digits(0),stage(0),running(false),comment(false),eof(false),ok(true){}
  bool start(const char *path){
    stop();stage=length=digits=0;duration=0;comment=eof=false;
    ok=card.open(path,false);running=ok;return ok;
  }
  bool start(const String &path){return start(path.c_str());}
  void stop(){if(running)card.close();running=false;buzzer.stop();}
  bool active()const{return running;}
  void update(){
    if(!running)return;
    if(buzzer.busy())return;
    if(eof){card.close();running=false;return;}
    for(uint8_t budget=0;budget<32;++budget){
      int c=card.file.read();
      if(c<0){
        if(card.file.getError()){fail();return;}
        eof=true;
        if(stage==1&&digits){if(!duration){fail();return;}startNote();return;}
        if(stage!=0||length){fail();return;}
        card.close();running=false;return;
      }
      if(comment){if(c=='\n')comment=false;continue;}
      bool space=c==' '||c=='\t'||c=='\r'||c=='\n'||c==',';
      if(stage==0){
        if(!length&&c=='#'){comment=true;continue;}
        if(space){if(!length)continue;if(!noteToken()){fail();return;}stage=1;length=0;continue;}
        if(length>=4){fail();return;}token[length++]=char(c);
      }else{
        if(c>='0'&&c<='9'){
          if(digits>=5||duration>6000||(duration==6000&&c>'0')){fail();return;}
          duration=uint16_t(duration*10+(c-'0'));++digits;
        }else if(space||(c=='#'&&digits)){
          if(!digits)continue;
          if(!duration){fail();return;}
          if(c=='#')comment=true;
          startNote();return;
        }else{fail();return;}
      }
    }
  }
};

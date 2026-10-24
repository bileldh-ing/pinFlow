#include "helpers.h"

const int LEDS[3] = {9, 10, 11};

void initLeds() {
  for (int i = 0; i < 3; i++) {
    pinMode(LEDS[i], OUTPUT);
  }
}

int readLevel(int pin) {
  return map(analogRead(pin), 0, 1023, 0, 3);
}

void showLevel(int level) {
  for (int i = 0; i < 3; i++) {
    digitalWrite(LEDS[i], i < level ? HIGH : LOW);
  }
}

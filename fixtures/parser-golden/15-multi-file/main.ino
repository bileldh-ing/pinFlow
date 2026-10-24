#include "helpers.h"

void setup() {
  Serial.begin(9600);
  initLeds();
}

void loop() {
  int level = readLevel(A0);
  showLevel(level);
  delay(100);
}

// Deliberately broken sketch used by diagnostics tests.
// Line 10 references an undeclared identifier; src/helper.cpp line 4 has a type error.
#include "src/helper.h"

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, undeclaredLevel);
  delay(blinkDelay());
}

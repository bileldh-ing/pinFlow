#include <Servo.h>
#include <Adafruit_NeoPixel.h>

Servo arm;
Adafruit_NeoPixel strip(8, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  arm.attach(9);
  strip.begin();
  Serial.begin(9600);
}

void loop() {
  arm.write(90);
  int pos = arm.read();
  strip.setPixelColor(0, strip.Color(255, 0, 0));
  strip.show();
  Serial.println(pos);
  mysteryFunction(pos);
  delay(15);
}

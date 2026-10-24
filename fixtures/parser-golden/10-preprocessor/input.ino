#include <Arduino.h>
#include <Wire.h>
#include "config.h"
#define BAUD 115200
#define LED_PIN 2
#define DEBUG
#define SQUARE(x) ((x) * (x))

#ifdef ESP32
#include <WiFi.h>
const int ADC_PIN = 34;
#else
const int ADC_PIN = A0;
#endif

#if defined(ARDUINO_ARCH_AVR)
#define BOARD_NAME "AVR"
#elif defined(ARDUINO_ARCH_ESP32)
#define BOARD_NAME "ESP32"
#endif

void setup() {
  Serial.begin(BAUD);
#ifdef DEBUG
  Serial.println("debug on");
#endif
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int v = analogRead(ADC_PIN);
  Serial.println(v);
  delay(100);
}

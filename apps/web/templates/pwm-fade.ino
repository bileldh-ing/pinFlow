// PWM fade: LED on pin 9 (PWM-capable on Uno) through a 220 ohm resistor.
const int LED_PIN = 9;
int brightness = 0;
int step = 5;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  analogWrite(LED_PIN, brightness);
  brightness += step;
  if (brightness <= 0 || brightness >= 255) {
    step = -step;
  }
  delay(30);
}

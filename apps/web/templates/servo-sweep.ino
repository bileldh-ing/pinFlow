// Servo sweep: signal wire on pin 9, power the servo from a suitable 5 V supply.
#include <Servo.h>

Servo servo;
int angle = 0;

void setup() {
  servo.attach(9);
}

void loop() {
  for (angle = 0; angle <= 180; angle += 1) {
    servo.write(angle);
    delay(15);
  }
  for (angle = 180; angle >= 0; angle -= 1) {
    servo.write(angle);
    delay(15);
  }
}

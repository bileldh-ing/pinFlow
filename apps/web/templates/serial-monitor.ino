// Serial monitor: open the Serial Monitor at 9600 baud.
const int SENSOR_PIN = A0;

void setup() {
  Serial.begin(9600);
  Serial.println("PinFlow serial monitor demo");
}

void loop() {
  int reading = analogRead(SENSOR_PIN);
  Serial.print("A0 = ");
  Serial.print(reading);
  Serial.print("  uptime ms = ");
  Serial.println(millis());
  delay(500);
}

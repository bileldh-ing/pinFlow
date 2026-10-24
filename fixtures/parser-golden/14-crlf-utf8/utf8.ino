// Température et humidité — capteur DHT11 🌡️
// Ünïcödé comments: 温度センサー
const int PIN = 4; // broche « données »

void setup() {
  Serial.begin(115200);
  Serial.println("Démarrage… ✓");
}

void loop() {
  /* bloc multi-ligne
     avec accents: éèàç */
  Serial.println(digitalRead(PIN));
  delay(1000);
}

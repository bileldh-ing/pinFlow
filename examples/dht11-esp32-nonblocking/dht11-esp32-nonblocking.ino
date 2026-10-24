// PinFlow Studio: non-blocking DHT11 reader for ESP32 Dev Module.
// Instead of delay(), loop() checks millis() and only reads the sensor when the
// interval has elapsed, so other work (buttons, LEDs, Wi-Fi) keeps running.
#include <DHT.h>

#define DHTPIN 4
#define DHTTYPE DHT11
#define LED_PIN 2

DHT dht(DHTPIN, DHTTYPE);

const unsigned long READ_INTERVAL_MS = 2000;
unsigned long lastReadMs = 0;
unsigned long lastBlinkMs = 0;
bool ledOn = false;

void readSensor() {
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("Failed to read from DHT sensor!");
    return;
  }
  Serial.print("Humidity: ");
  Serial.print(humidity);
  Serial.print(" %  Temperature: ");
  Serial.print(temperature);
  Serial.println(" C");
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  dht.begin();
}

void loop() {
  unsigned long now = millis();

  // State/interval pattern: unsigned subtraction is safe across millis() overflow.
  if (now - lastReadMs >= READ_INTERVAL_MS) {
    lastReadMs = now;
    readSensor();
  }

  // Heartbeat LED keeps blinking while we wait: proof that loop() never blocks.
  if (now - lastBlinkMs >= 500) {
    lastBlinkMs = now;
    ledOn = !ledOn;
    digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
  }
}

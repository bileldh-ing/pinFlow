// DHT11 temperature + humidity on ESP32 Dev Module.
// Wiring: DHT11 data -> GPIO4 (with 10k pull-up), VCC -> 3V3, GND -> GND.
// Requires: "DHT sensor library" (Adafruit) + "Adafruit Unified Sensor".
#include <DHT.h>

#define DHTPIN 4
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  dht.begin();
  Serial.println("DHT11 on ESP32 ready");
}

void loop() {
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("Failed to read from DHT sensor!");
  } else {
    Serial.print("Humidity: ");
    Serial.print(humidity);
    Serial.print(" %  Temperature: ");
    Serial.print(temperature);
    Serial.println(" *C");
  }

  delay(2000);
}

// PinFlow Studio starter: ESP32 Dev Module + DHT11 temperature/humidity sensor.
// Libraries: "DHT sensor library" (Adafruit) + "Adafruit Unified Sensor".
// Wiring: DHT11 VCC -> 3V3, GND -> GND, DATA -> GPIO4 (10k pull-up to 3V3 if the module has none).
#include <DHT.h>

#define DHTPIN 4 // GPIO4: output-capable, not a strapping or flash pin
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  Serial.println("DHT11 on ESP32 starting...");
  dht.begin();
}

void loop() {
  // DHT11 needs about 1-2 s between readings.
  delay(2000);

  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  // A failed read returns NAN: skip this round instead of printing garbage.
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

const int SENSOR_COUNT = 3;
const float GAIN = 1.5f;
unsigned long lastMs = 0UL;
volatile bool flag = false;
int pins[SENSOR_COUNT] = {A0, A1, A2};
int readings[3];
char label = 'x';
byte mask = 0x0F;
String name = "uno";
long big = 100000L;
uint8_t small = 0b1010;
static int counter = 0;
int a, b = 2;

void setup() {
  Serial.begin(9600);
}

void loop() {
  static int calls = 0;
  calls++;
  for (int i = 0; i < SENSOR_COUNT; i++) {
    readings[i] = analogRead(pins[i]) * GAIN;
  }
  int total = readings[0] + readings[1] * 2 - -readings[2];
  int shifted = (total << 2) | (mask & 3) ^ 1;
  bool ok = !flag && total >= 0;
  total = map(total, 0, 1023, 0, 255);
  total = constrain(total, 0, 255);
  lastMs = millis();
  Serial.println(total);
}

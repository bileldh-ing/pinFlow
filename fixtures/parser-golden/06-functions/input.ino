int square(int x) {
  return x * x;
}

float average(int a, int b) {
  return (a + b) / 2.0;
}

void blinkTimes(int pin, int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(pin, HIGH);
    delay(100);
    digitalWrite(pin, LOW);
    delay(100);
  }
}

bool isEven(long n) {
  return n % 2 == 0;
}

void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int s = square(4);
  float m = average(s, 3);
  if (isEven(s)) {
    blinkTimes(13, 2);
  }
  Serial.println(m);
}

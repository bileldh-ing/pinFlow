int level = 0;
bool armed = false;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int v = analogRead(A0);
  if (v > 800 && armed) {
    level = 3;
  } else if (v > 500 || (v > 400 && !armed)) {
    if (level < 2) {
      level = 2;
    } else {
      level--;
    }
  } else if (!(v < 100)) {
    level = 1;
  } else {
    level = 0;
  }
  armed = v % 2 == 0 ? true : false;
  bool odd = (v & 1) != 0;
  Serial.println(level);
}

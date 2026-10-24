int values[5] = {3, 1, 4, 1, 5};

void setup() {
  Serial.begin(115200);
}

void loop() {
  int sum = 0;
  for (int i = 0; i < 5; i++) {
    if (values[i] == 1) {
      continue;
    }
    sum += values[i];
  }
  int n = 10;
  while (n > 0) {
    n -= 3;
    if (n == 4) {
      break;
    }
  }
  for (;;) {
    break;
  }
  int k = 0;
  do {
    k++;
  } while (k < 3);
  for (int j = 10; j > 0; j -= 2) {
    sum <<= 1;
  }
  Serial.println(sum);
  delay(500);
}

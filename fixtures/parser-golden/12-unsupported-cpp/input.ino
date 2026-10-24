#define MAX_OF(a, b) ((a) > (b) ? (a) : (b))
#define LOG(msg) \
  Serial.println(msg)

template <typename T>
T clampValue(T v, T lo, T hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

class Counter {
 public:
  Counter() : count(0) {}
  void inc() { count++; }
  int count;
};

struct Point {
  int x;
  int y;
};

enum Mode { IDLE, RUN };

Counter counter;
int *ptr = nullptr;

void setup() {
  Serial.begin(9600);
  auto twice = [](int v) { return v * 2; };
  Serial.println(twice(3));
}

void loop() {
  counter.inc();
  long scaled = (long)counter.count * 3;
  int biggest = MAX_OF(1, 2);
  Point p = {1, 2};
  p.x = 5;
  delay(10);
}

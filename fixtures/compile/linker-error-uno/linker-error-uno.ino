// Declares a function that is never defined: compiles, then fails at link time.
void notDefinedAnywhere(int value);

void setup() {
  notDefinedAnywhere(42);
}

void loop() {}

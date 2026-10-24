void setup() {
  Serial.begin(9600);
  Serial.println("braces { } and ;semicolons;");
  Serial.println("escaped \"quotes\" and \\ backslash");
  Serial.println("// not a comment /* nor this */");
  Serial.println("tab\tnewline\n");
  char c = '}';
  char q = '\'';
  char nl = '\n';
  Serial.print(c);
}

void loop() {
  Serial.println(F("flash string with { brace"));
  delay(1000);
}

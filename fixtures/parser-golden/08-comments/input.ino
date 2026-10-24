/*
 * Multi-line header comment.
 * Author: PinFlow fixtures
 */

// Pin configuration
const int LED = 13; // the built-in LED

// Standalone comment before a blank line

/* block before setup */
void setup() {
  // leading comment for pinMode
  pinMode(LED, OUTPUT); /* inline block */

  // another section
  Serial.begin(9600);
}

void loop() {
  digitalWrite(LED, HIGH); // on
  delay(250);
  // trailing comment at end of body
}
// End of file comment

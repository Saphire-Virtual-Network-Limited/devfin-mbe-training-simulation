// Prints a scrypt hash for TRAINER_PASSCODE_HASH.
// Usage: npm run hash-password
// The password is read from a hidden prompt, so it never lands in shell history.
import { randomBytes, scrypt } from "node:crypto";
import { createInterface } from "node:readline";

const N = 16384, R = 8, P = 1, KEYLEN = 32;

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = process.env.PASSWORD ?? (await ask("Trainer passcode (min 12 characters): "));
if (password.length < 12) {
  console.error("Use at least 12 characters.");
  process.exit(1);
}
const salt = randomBytes(16);
scrypt(password, salt, KEYLEN, { N, r: R, p: P }, (err, key) => {
  if (err) throw err;
  console.log(["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$"));
});

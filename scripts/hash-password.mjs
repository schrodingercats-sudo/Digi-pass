import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password || password.length < 8) {
  console.error("Usage: npm run hash-password -- \"your-password\"");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log(hash);

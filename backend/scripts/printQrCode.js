/**
 * Prints an ASCII QR code for a URL directly in the terminal — used by
 * start-production.ps1 to turn the ngrok public URL into something a phone
 * camera can scan without anyone having to retype a long ngrok-free.app
 * address by hand.
 *
 * Usage: node scripts/printQrCode.js <url>
 */
const qrcode = require('qrcode-terminal');

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/printQrCode.js <url>');
  process.exit(1);
}

console.log(`\nScan to open on your phone:\n${url}\n`);
qrcode.generate(url, { small: true });

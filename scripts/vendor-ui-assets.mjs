// Recreate the pinned, public UI dependencies served by this static site.
// Run only when deliberately updating the vendor copies; deployment uses the
// checked-in files and never contacts these CDNs during a visitor's boot.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  ['vendor/bootstrap/bootstrap.min.css', 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css', '7f1d37f0d90b6385354c2ac10e2bb91563c46bd7a266ed351222ebcac8496c2a'],
  ['vendor/bootstrap/bootstrap.bundle.min.js', 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js', 'aa53d582f97eb594c2a5cc5824574707f9ba9837bce3046bfa5f3556860f4e04'],
  ['vendor/sweetalert2/sweetalert2.all.min.js', 'https://cdn.jsdelivr.net/npm/sweetalert2@11.26.25/dist/sweetalert2.all.min.js', '4e86f0e22e4771b5b8aac24c613c661806a678b1afa284d03cf6ad03d3e21a0a'],
  ['vendor/msal/msal-browser.min.js', 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.30.0/lib/msal-browser.min.js', '273d446b381814e563442267a072904fb3b7fd0164f4a688ede80f0d74565b3e'],
  ['vendor/fontawesome/css/all.min.css', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', '1edb1725a9ea8ca4dcf2f5508cee183218aa1685e47c1b23056717f754f58ebf'],
  ['vendor/fontawesome/webfonts/fa-solid-900.woff2', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2', '7152a6933ee3d690ec2af3d09da9d701723d16aa3410a6d80f28ff8866f3b880'],
  ['vendor/fontawesome/webfonts/fa-regular-400.woff2', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2', '8e7e5ea1b15f62ab14dbd41768e8fbcd21cc859a4ea5da812457ee714299fb35'],
  ['vendor/fontawesome/webfonts/fa-brands-400.woff2', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2', '748332090c4b8e20f95d0ff59f0be20fa9c889359d3b36d4b886d73376054207'],
  ['vendor/fontawesome/webfonts/fa-v4compatibility.woff2', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-v4compatibility.woff2', '694a17c3d9d6c05f8aac63c544615552a4b220e9a4de863d87341a6bcfc1bc8d']
];

for (const [dest, url, expectedHash] of files) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download ${dest}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error(`Download ${dest}: empty response`);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expectedHash) throw new Error(`Download ${dest}: SHA-256 mismatch`);
  const target = join(root, dest);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  console.log(`${dest} ${bytes.length} ${hash}`);
}

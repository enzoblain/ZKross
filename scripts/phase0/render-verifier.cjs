// Renders snarkjs's own Groth16 Solidity template from a snarkjs vk.json,
// exactly as `snarkjs zkey export solidityverifier` does after reading the
// verification key out of a .zkey (see exportSolidityVerifier in snarkjs).
// Usage: node render-verifier.cjs <snarkjs_dir> <vk.json> <out.sol>
const fs = require("fs");
const path = require("path");
const [snarkjsDir, vkPath, outPath] = process.argv.slice(2);
const ejs = require(require.resolve("ejs", { paths: [snarkjsDir] }));
const template = fs.readFileSync(path.join(snarkjsDir, "templates/verifier_groth16.sol.ejs"), "utf8");
const vk = JSON.parse(fs.readFileSync(vkPath, "utf8"));
if (vk.protocol !== "groth16" || vk.curve !== "bn128") throw new Error("not a groth16/bn128 vk");
if (vk.IC.length !== vk.nPublic + 1) throw new Error("IC length != nPublic + 1");
fs.writeFileSync(outPath, ejs.render(template, vk));

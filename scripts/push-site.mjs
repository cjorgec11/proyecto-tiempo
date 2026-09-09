import { spawn } from "node:child_process";
import { resolve } from "node:path";

const cwd = resolve(import.meta.dirname, "../.site-release");
if (!process.stdin.isTTY) throw new Error("Se necesita una entrada privada de terminal");
process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
let payload = "";
process.stdin.on("data", chunk => {
  payload += chunk;
  if (payload.includes("\n")) {
    process.stdin.pause();
    push(payload.trim()).catch(error => { console.error(error.message); process.exit(1); });
  }
});
console.log("READY: entrada privada sin eco.");
setTimeout(() => process.exit(1), 90000).unref();
async function push(line) {
  const credential = JSON.parse(line);
  if (!credential.remote_url.startsWith("https://git.chatgpt-team.site/") || !credential.token) throw new Error("Credencial no válida");
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${credential.token}` };
  const git = spawn("git", ["push", credential.remote_url, `HEAD:refs/heads/${credential.branch}`], { cwd, env, windowsHide: true });
  let output = "";
  git.stdout.on("data", chunk => { output += chunk; });
  git.stderr.on("data", chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { git.on("exit", resolve); git.on("error", reject); });
  console.log(output.replaceAll(credential.token, "[redacted]"));
  process.exit(code ?? 1);
}

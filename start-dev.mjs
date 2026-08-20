import { spawn } from "node:child_process";

if (process.platform === "win32") {
  const launcher = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      `${import.meta.dirname}\\start-dev.ps1`,
      "-ParentProcessId",
      String(process.pid),
    ],
    { cwd: import.meta.dirname, stdio: "inherit" },
  );
  launcher.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
} else {
  const children = new Set();
  let stopping = false;

  const run = (args, detached = true) => {
    const child = spawn("npm", args, {
      cwd: import.meta.dirname,
      stdio: "inherit",
      detached,
    });
    children.add(child);
    child.once("exit", () => children.delete(child));
    return child;
  };
  const wait = (child) =>
    new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (child.pid !== undefined && child.exitCode === null) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch (error) {
          if (error?.code !== "ESRCH") throw error;
        }
      }
    }
    process.exitCode = code;
  };

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => stop(0));
  }

  const buildResult = await wait(run(["run", "build:packages"], false));
  if (buildResult.code !== 0) {
    stop(buildResult.code ?? 1);
  } else {
    const web = run(["run", "start", "--workspace", "@munchkin-lan/web"]);
    const server = run([
      "run",
      "start:dev",
      "--workspace",
      "@munchkin-lan/server",
    ]);
    const result = await Promise.race([wait(web), wait(server)]);
    stop(result.code ?? (result.signal === null ? 0 : 1));
  }
}

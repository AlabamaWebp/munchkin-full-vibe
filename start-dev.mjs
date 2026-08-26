import { spawn, spawnSync } from "node:child_process";

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

  let stopping = false;
  const terminateLauncherTree = () => {
    if (launcher.pid === undefined || launcher.exitCode !== null) return;

    // On Windows, killing a child process does not recursively kill its
    // descendants. taskkill does, including npm's cmd.exe and the Node
    // processes started by Angular/NestJS.
    spawnSync("taskkill.exe", ["/PID", String(launcher.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  };

  const stop = () => {
    if (stopping) return;
    stopping = true;

    // Ctrl+C is delivered to this Node process first when npm is the console
    // entry point. Kill the whole launcher tree immediately so npm cannot
    // leave NestJS or Angular behind.
    terminateLauncherTree();
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("SIGHUP", stop);
  process.once("exit", terminateLauncherTree);

  launcher.once("exit", (code) => {
    process.exitCode = stopping ? 0 : (code ?? 1);
  });
  launcher.once("error", () => {
    process.exitCode = 1;
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

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

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;

    // Ctrl+C is delivered to this Node process first when npm is the console
    // entry point. Closing PowerShell closes its Job Object, which terminates
    // npm, Angular, NestJS, and any descendants that they created.
    if (launcher.exitCode === null) {
      launcher.kill();

      // `kill()` can only signal the PowerShell process. If Windows keeps the
      // console host alive, explicitly terminate its process tree as a
      // fallback so npm cannot leave NestJS or Angular behind.
      setTimeout(() => {
        if (launcher.exitCode === null && launcher.pid !== undefined) {
          spawn("taskkill.exe", ["/PID", String(launcher.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        }
      }, 1000).unref();
    }
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("SIGHUP", stop);

  launcher.once("exit", (code) => {
    process.exitCode = code ?? 1;
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

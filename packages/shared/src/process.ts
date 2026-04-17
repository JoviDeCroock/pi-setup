import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RunCommandOptions {
  allowFailure?: boolean;
  cwd?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface RunCommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): Promise<RunCommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      maxBuffer: 8 * 1024 * 1024,
      signal: options.signal,
      timeout: options.timeoutMs,
    });

    return {
      exitCode: 0,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  } catch (error) {
    const candidate = error as {
      code?: number | string;
      message?: string;
      stderr?: string;
      stdout?: string;
    };

    const result: RunCommandResult = {
      exitCode: typeof candidate.code === "number" ? candidate.code : 1,
      stderr: candidate.stderr ?? candidate.message ?? "Command failed",
      stdout: candidate.stdout ?? "",
    };

    if (options.allowFailure) {
      return result;
    }

    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n${result.stderr || result.stdout}`.trim(),
    );
  }
}

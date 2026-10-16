import { spawn } from "node:child_process";

const DEPLOYMENTS_PREFIX = "deployments/";
const STDERR_TAIL_LINES = 20;

/**
 * Runs gcloud and returns its stdout. Only the tail of stderr is kept, since
 * bulk storage operations print a status line per object.
 * @param {string[]} args
 * @returns {Promise<string>}
 */
function runGcloud(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("gcloud", args, { stdio: ["ignore", "pipe", "pipe"] });
    /** @type {Buffer[]} */
    const stdout = [];
    /** @type {string[]} */
    let stderrTail = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderrTail = [...stderrTail, ...String(chunk).split("\n")].slice(
        -STDERR_TAIL_LINES
      );
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8").trim());
      } else {
        reject(
          new Error(
            `gcloud ${args.slice(0, 3).join(" ")} exited with ${code}:\n${stderrTail.join("\n")}`
          )
        );
      }
    });
  });
}

/** @param {string} bucketName @param {string} target @returns {Promise<string>} */
async function getActiveDeployment(bucketName, target) {
  const separator = target.lastIndexOf("@");
  if (separator < 1 || separator === target.length - 1) {
    throw new Error(`Expected function@region, got: ${target}`);
  }

  const functionName = target.slice(0, separator);
  const region = target.slice(separator + 1);
  const description = await runGcloud([
    "beta",
    "functions",
    "describe",
    functionName,
    "--gen2",
    `--region=${region}`,
    "--format=json",
  ]);
  const { serviceConfig } = JSON.parse(description);
  const sourceContent = serviceConfig?.environmentVariables?.SOURCE_CONTENT;
  const deploymentBaseUrl = `https://storage.googleapis.com/${bucketName}/${DEPLOYMENTS_PREFIX}`;

  if (!sourceContent?.startsWith(deploymentBaseUrl)) {
    throw new Error(
      `${functionName} in ${region} does not use a deployment prefix: ${sourceContent ?? "missing"}`
    );
  }

  const deployment = sourceContent
    .slice(deploymentBaseUrl.length)
    .replace(/\/$/, "");
  if (getDeploymentTime(deployment) === null) {
    throw new Error(
      `Unexpected deployment prefix for ${functionName} in ${region}: ${deployment}`
    );
  }
  return deployment;
}

/** @param {string} deployment @returns {number | null} */
function getDeploymentTime(deployment) {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-\d+-\d+$/.exec(
    deployment
  );
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match.map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/** @param {string} bucketName @param {string[]} targets @returns {Promise<string[]>} */
async function getActiveDeployments(bucketName, targets) {
  const deployments = await Promise.all(
    targets.map((target) => getActiveDeployment(bucketName, target))
  );
  return [...new Set(deployments)];
}

/**
 * Lists the immediate children of `deployments/` as bucket-relative prefixes.
 * @param {string} bucketName
 * @returns {Promise<string[]>}
 */
async function listDeploymentFolders(bucketName) {
  const baseUrl = `gs://${bucketName}/`;
  const listing = await runGcloud([
    "storage",
    "ls",
    `${baseUrl}${DEPLOYMENTS_PREFIX}`,
  ]);
  return listing
    .split("\n")
    .filter((line) => line.startsWith(baseUrl) && line.endsWith("/"))
    .map((line) => line.slice(baseUrl.length));
}

/** @param {string} bucketName @param {number} retentionDays @param {Set<string>} activeDeployments */
async function cleanupDeployments(
  bucketName,
  retentionDays,
  activeDeployments
) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const deployments = await listDeploymentFolders(bucketName);

  for (const folderPrefix of deployments) {
    if (!folderPrefix.startsWith(DEPLOYMENTS_PREFIX)) {
      throw new Error(
        `Unexpected deployment prefix from Cloud Storage: ${folderPrefix}`
      );
    }

    const deployment = folderPrefix
      .slice(DEPLOYMENTS_PREFIX.length)
      .replace(/\/$/, "");
    const deploymentTime = getDeploymentTime(deployment);
    if (deploymentTime === null) {
      console.log(
        `Skipping unrecognized deployment folder: gs://${bucketName}/${folderPrefix}`
      );
      continue;
    }

    if (deploymentTime < cutoff && !activeDeployments.has(deployment)) {
      const url = `gs://${bucketName}/${folderPrefix}`;
      console.log(`Deleting expired deployment: ${url}`);
      await runGcloud(["storage", "rm", "--recursive", url]);
    }
  }
}

async function main() {
  const [command, bucketName, ...args] = process.argv.slice(2);
  if (!bucketName) {
    throw new Error("A bucket name is required");
  }

  if (command === "get-active") {
    if (args.length === 0) {
      throw new Error("At least one function@region target is required");
    }
    console.log(JSON.stringify(await getActiveDeployments(bucketName, args)));
    return;
  }

  if (command === "cleanup") {
    const [retentionDaysValue] = args;
    const retentionDays = Number(retentionDaysValue);
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
      throw new Error(
        `Retention days must be a positive integer: ${retentionDaysValue}`
      );
    }
    const activeDeployments = new Set(
      JSON.parse(process.env["ACTIVE_DEPLOYMENTS"] ?? "[]")
    );
    if (activeDeployments.size === 0) {
      throw new Error("No active deployments provided, refusing cleanup");
    }
    await cleanupDeployments(bucketName, retentionDays, activeDeployments);
    return;
  }

  throw new Error(
    "Usage: cleanup-deployments.js <get-active|cleanup> <bucket> ..."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

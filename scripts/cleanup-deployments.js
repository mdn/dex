import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Storage } from "@google-cloud/storage";

const execFileAsync = promisify(execFile);
const storage = new Storage();

/** @param {string[]} args @returns {Promise<string>} */
async function runGcloud(args) {
  const { stdout } = await execFileAsync("gcloud", args, { encoding: "utf8" });
  return stdout.trim();
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
  const deploymentBaseUrl = `https://storage.googleapis.com/${bucketName}/deployments/`;

  if (!sourceContent?.startsWith(deploymentBaseUrl)) {
    throw new Error(
      `${functionName} in ${region} does not use a deployment prefix: ${sourceContent ?? "missing"}`
    );
  }

  const deployment = sourceContent
    .slice(deploymentBaseUrl.length)
    .replace(/\/$/, "");
  if (!/^\d{8}-\d{6}-\d+-\d+$/.test(deployment)) {
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

/** @param {string} bucketName @param {number} retentionDays @param {Set<string>} activeDeployments */
async function cleanupDeployments(
  bucketName,
  retentionDays,
  activeDeployments
) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const deploymentPrefix = "deployments/";
  const bucket = storage.bucket(bucketName);
  const deployments = [];
  /** @type {import("@google-cloud/storage").GetFilesOptions | null} */
  let query = {
    prefix: deploymentPrefix,
    delimiter: "/",
    autoPaginate: false,
    includeFoldersAsPrefixes: true,
  };

  while (query) {
    const result = await bucket.getFiles(query);
    const nextQuery =
      /** @type {import("@google-cloud/storage").GetFilesOptions | null} */ (
        result[1]
      );
    const response = /** @type {{ prefixes?: string[] } | undefined} */ (
      result[2]
    );
    deployments.push(...(response?.prefixes ?? []));
    query = nextQuery;
  }

  for (const folderPrefix of deployments) {
    if (!folderPrefix.startsWith(deploymentPrefix)) {
      throw new Error(
        `Unexpected deployment prefix from Cloud Storage: ${folderPrefix}`
      );
    }

    const deployment = folderPrefix
      .slice(deploymentPrefix.length)
      .replace(/\/$/, "");
    const deploymentTime = getDeploymentTime(deployment);
    if (deploymentTime === null) {
      console.log(
        `Skipping unrecognized deployment folder: gs://${bucketName}/${folderPrefix}`
      );
      continue;
    }

    if (deploymentTime < cutoff && !activeDeployments.has(deployment)) {
      console.log(
        `Deleting expired deployment: gs://${bucketName}/${folderPrefix}`
      );
      await bucket.deleteFiles({ prefix: folderPrefix });
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
